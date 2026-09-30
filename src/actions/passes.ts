'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { requireOrganiser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePassInput, generateManualCode } from '@/lib/utils';

export async function createPass(formData: FormData) {
  // 1. Auth + authorisation check
  const { user, authorized } = await requireOrganiser();
  if (!authorized || !user) {
    return { error: 'You are not authorised to create passes.' };
  }

  // 2. Extract and validate input
  const input = {
    name: (formData.get('name') as string) || undefined,
    category: formData.get('category') as string,
    email: (formData.get('email') as string) || undefined,
    phone: (formData.get('phone') as string) || undefined,
  };

  const validation = validatePassInput(input);
  if (!validation.valid) {
    return { error: 'Validation failed.', fieldErrors: validation.errors };
  }

  const admin = createAdminClient();
  const maxAttempts = 5;
  let attempts = 0;

  // 3. Retry loop for collision safety (unique token or manual_code)
  while (attempts < maxAttempts) {
    attempts++;

    // Generate cryptographically secure long token (QR payload)
    const token = crypto.randomBytes(32).toString('hex');

    // Generate human-readable short manual code (XXXX-XXXX)
    const manual_code = generateManualCode();

    const { data, error } = await admin
      .from('passes')
      .insert({
        token,
        manual_code,
        name: validation.data!.name,
        category: validation.data!.category,
        email: validation.data!.email,
        phone: validation.data!.phone,
        status: 'unused',
        delivery_status: 'not_sent',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (!error && data) {
      revalidatePath('/dashboard');
      return { success: true, passId: data.id };
    }

    // Unique constraint violation code 23505 (retry with fresh token and code)
    if (error?.code === '23505') {
      console.warn(`Pass insert collision on attempt ${attempts}, retrying...`);
      continue;
    }

    console.error('Pass creation error:', error?.message);
    return { error: 'Failed to save pass. Please try again.' };
  }

  return { error: 'Could not generate a unique pass code. Please try again.' };
}
