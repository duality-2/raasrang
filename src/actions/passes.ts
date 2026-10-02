'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { requireOrganiserOrTicketer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePassInput, generateManualCode } from '@/lib/utils';

export async function createPass(formData: FormData) {
  // 1. Auth + authorisation check (Admin or Ticketer)
  const { user, authorized } = await requireOrganiserOrTicketer();
  if (!authorized || !user) {
    return { error: 'You are not authorised to create passes.' };
  }

  // 2. Extract and validate input
  const input = {
    name: (formData.get('name') as string) || undefined,
    category: formData.get('category') as string,
    email: (formData.get('email') as string) || undefined,
    phone: (formData.get('phone') as string) || undefined,
    ticket_type: (formData.get('ticket_type') as string) || 'single',
    party_size: (formData.get('party_size') as string) || '1',
    seasonal_start_night_id: (formData.get('seasonal_start_night_id') as string) || 'night_1',
    seasonal_nights_count: (formData.get('seasonal_nights_count') as string) || '9',
    valid_night_id: (formData.get('valid_night_id') as string) || undefined,
    idempotency_key: (formData.get('idempotency_key') as string) || undefined,
  };

  const validation = validatePassInput(input);
  if (!validation.valid) {
    return { error: 'Validation failed.', fieldErrors: validation.errors };
  }

  const validatedData = validation.data!;
  const admin = createAdminClient();

  // 3. Idempotent check (prevents double-clicks & network retries)
  if (validatedData.idempotency_key) {
    const { data: existingPass } = await admin
      .from('passes')
      .select('id')
      .eq('idempotency_key', validatedData.idempotency_key)
      .maybeSingle();

    if (existingPass?.id) {
      return { success: true, passId: existingPass.id, idempotent_replay: true };
    }
  }

  const maxAttempts = 5;
  let attempts = 0;

  // 4. Retry loop for collision safety (unique token or manual_code)
  while (attempts < maxAttempts) {
    attempts++;

    // Generate cryptographically secure long token (QR payload)
    const token = crypto.randomBytes(32).toString('hex');

    // Generate human-readable short manual code (XXXX-XXXX)
    const manual_code = generateManualCode();

    // Prepare base pass payload (strictly compatible with migrations 001-003)
    const basePayload: Record<string, unknown> = {
      token,
      manual_code,
      name: validatedData.name,
      category: validatedData.category,
      email: validatedData.email,
      phone: validatedData.phone,
      status: 'unused',
      delivery_status: 'not_sent',
      created_by: user.id,
    };

    // Prepare full payload with migration 004 fields
    const fullPayload: Record<string, unknown> = {
      ...basePayload,
      ticket_type: validatedData.ticket_type,
      party_size: validatedData.party_size,
      validity_state: 'active',
      ...(validatedData.idempotency_key ? { idempotency_key: validatedData.idempotency_key } : {}),
      ...(validatedData.ticket_type === 'seasonal'
        ? {
            seasonal_start_night_id: validatedData.seasonal_start_night_id,
            seasonal_nights_count: validatedData.seasonal_nights_count,
            valid_night_id: null,
          }
        : {
            valid_night_id: validatedData.valid_night_id,
          }),
    };

    const { data, error } = await admin
      .from('passes')
      .insert(fullPayload)
      .select('id')
      .single();

    // Unique constraint violation code 23505 (retry with fresh token and code)
    if (error?.code === '23505') {
      console.warn(`Pass insert collision on attempt ${attempts}, retrying...`);
      continue;
    }

    if (error) {
      return { error: `Database error: ${error.message}` };
    }

    if (data) {
      // If seasonal pass, link eligible consecutive event nights
      if (validatedData.ticket_type === 'seasonal') {
        const startNightNum = parseInt(
          validatedData.seasonal_start_night_id?.replace('night_', '') || '1',
          10
        );
        const count = validatedData.seasonal_nights_count || 9;
        const eligibleRows = [];
        for (let i = 0; i < count; i++) {
          const nightNum = startNightNum + i;
          if (nightNum <= 9) {
            eligibleRows.push({
              pass_id: data.id,
              event_night_id: `night_${nightNum}`,
            });
          }
        }
        if (eligibleRows.length > 0) {
          try {
            await admin.from('pass_eligible_nights').insert(eligibleRows);
          } catch {
            // Table may be pending migration 004
          }
        }
      }

      // Track ticket delivery state record
      try {
        await admin.from('ticket_deliveries').insert({
          pass_id: data.id,
          idempotency_key: `delivery_${data.id}`,
          channel: 'whatsapp_manual',
          destination_phone: validatedData.phone,
          delivery_status: 'ready_to_share',
          created_by: user.id,
        });
      } catch {
        // Table may be pending migration 004
      }

      revalidatePath('/dashboard');
      revalidatePath('/dashboard/passes');
      return { success: true, passId: data.id };
    }

    console.error('Pass creation error:', error?.message);
    return { error: 'Failed to save pass. Please try again.' };
  }

  return { error: 'Could not generate a unique pass code. Please try again.' };
}

export async function deletePass(passId: string) {
  const { user, authorized, role } = await requireOrganiserOrTicketer();
  if (!authorized || !user) {
    return { error: 'You are not authorised.' };
  }

  const admin = createAdminClient();

  if (role === 'ticketer') {
    const { data: pass } = await admin.from('passes').select('created_by').eq('id', passId).single();
    if (!pass || pass.created_by !== user.id) return { error: 'You are not authorised.' };
  }

  const { data: admissions, error: admissionError } = await admin
    .from('admissions')
    .select('id')
    .eq('pass_id', passId)
    .limit(1);

  if (admissionError && admissionError.code !== '42P01') {
    return { error: 'Failed to verify admission history.' };
  }

  if (admissions && admissions.length > 0) {
    return { error: 'Cannot delete a pass that has admission history. Please cancel or archive it instead.' };
  }

  const { error } = await admin.from('passes').delete().eq('id', passId);
  if (error) {
    if (error.code === '23503') {
      return { error: 'Cannot delete this pass because it has linked data (e.g. admissions).' };
    }
    return { error: 'Failed to delete pass.' };
  }
  
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/passes');
  return { success: true };
}

export async function cancelPass(passId: string) {
  const { user, authorized, role } = await requireOrganiserOrTicketer();
  if (!authorized || !user) {
    return { error: 'You are not authorised.' };
  }

  const admin = createAdminClient();

  if (role === 'ticketer') {
    const { data: pass } = await admin.from('passes').select('created_by').eq('id', passId).single();
    if (!pass || pass.created_by !== user.id) return { error: 'You are not authorised.' };
  }

  const { error } = await admin.from('passes').update({ status: 'cancelled' }).eq('id', passId);
  if (error) {
    return { error: 'Failed to cancel pass.' };
  }
  
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/passes');
  revalidatePath(`/dashboard/passes/${passId}`);
  return { success: true };
}
