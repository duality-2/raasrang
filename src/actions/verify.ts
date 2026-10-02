'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireOrganiserOrScanner, isOrganiser } from '@/lib/auth';
import type {
  RedemptionResult,
  TicketPreviewResult,
  AdmitPassResult,
} from '@/types';

export interface VerificationDiagnostic {
  session_exists: boolean;
  user_id: string | null;
  organiser_row_exists: boolean;
  request_id: string;
}

/**
 * Safe diagnostic that checks the live request session and organiser status.
 * Never exposes passwords, service-role keys, QR tokens, or manual codes.
 */
export async function getVerificationDiagnostics(): Promise<VerificationDiagnostic> {
  const requestId = 'req_' + crypto.randomBytes(6).toString('hex');
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      session_exists: false,
      user_id: null,
      organiser_row_exists: false,
      request_id: requestId,
    };
  }

  const isOrg = await isOrganiser(user.id);

  return {
    session_exists: true,
    user_id: user.id,
    organiser_row_exists: isOrg,
    request_id: requestId,
  };
}

/**
 * Read-Only Ticket Preview (Phase C)
 * Inspects ticket type, party size, current night allowance, and remaining count.
 * NEVER alters admission state.
 */
export async function previewTicketAction(
  inputType: 'qr' | 'manual',
  inputValue: string
): Promise<TicketPreviewResult> {
  const { user, authorized } = await requireOrganiserOrScanner();
  if (!authorized || !user) {
    return {
      status: 'UNAUTHORIZED',
      message: 'You are not authorised to scan or preview tickets.',
    };
  }

  const cleanValue = inputValue?.trim();
  if (!cleanValue) {
    return {
      status: 'INVALID',
      message: 'Input code cannot be empty.',
    };
  }

  if (inputType !== 'qr' && inputType !== 'manual') {
    return {
      status: 'ERROR',
      message: 'Invalid input method.',
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('preview_ticket_allowance', {
      p_input_type: inputType,
      p_input_value: cleanValue,
    });

    if (error) {
      // Graceful fallback if migration 004 has not yet been applied to Postgres
      if (error.code === 'PGRST202' || error.message.includes('does not exist')) {
        return await previewTicketFallback(inputType, cleanValue);
      }
      console.error('Preview ticket RPC error:', error.message);
      return {
        status: 'ERROR',
        message: 'Database error previewing ticket. Please retry.',
      };
    }

    return data as TicketPreviewResult;
  } catch (err: unknown) {
    console.error('Unexpected preview ticket error:', err);
    return {
      status: 'ERROR',
      message: 'Network or server error while previewing ticket.',
    };
  }
}

/**
 * Authoritative Atomic Pass Admission (Phase C: Admit N)
 * Locks the pass row in PostgreSQL, checks event night and remaining count,
 * records admission append-only, and guarantees idempotency.
 *
 * NOTE: No gate parameter. All scanner devices are equivalent entry points.
 */
export async function admitPassAction(
  inputType: 'qr' | 'manual',
  inputValue: string,
  peopleCount: number,
  clientRequestId: string
): Promise<AdmitPassResult> {
  const { user, authorized } = await requireOrganiserOrScanner();
  if (!authorized || !user) {
    return {
      status: 'UNAUTHORIZED',
      message: 'You are not authorised to admit attendees.',
    };
  }

  const cleanValue = inputValue?.trim();
  if (!cleanValue) {
    return {
      status: 'INVALID',
      message: 'Ticket code cannot be empty.',
    };
  }

  if (!clientRequestId?.trim()) {
    return {
      status: 'ERROR',
      message: 'Client request ID is required for idempotency.',
    };
  }

  if (peopleCount < 1 || peopleCount > 100 || !Number.isInteger(peopleCount)) {
    return {
      status: 'ERROR',
      message: 'People count must be a whole number between 1 and 100.',
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('admit_pass', {
      p_input_type: inputType,
      p_input_value: cleanValue,
      p_people_count: peopleCount,
      p_client_request_id: clientRequestId.trim(),
    });

    if (error) {
      // If 004 RPC not yet applied, fallback to legacy redeem_pass
      if (error.code === 'PGRST202' || error.message.includes('does not exist')) {
        return await legacyRedeemFallback(inputType, cleanValue);
      }
      console.error('Admit pass RPC error:', error.message);
      return {
        status: 'ERROR',
        message: 'Database error occurred during admission. Please retry.',
      };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/gate-list');
    return data as AdmitPassResult;
  } catch (err: unknown) {
    console.error('Unexpected admission error:', err);
    return {
      status: 'ERROR',
      message: 'Network timeout. Pass was NOT verified. DO NOT ADMIT.',
    };
  }
}

/**
 * Backward-compatible single-scan wrapper for legacy callers
 */
export async function redeemPassAction(
  inputType: 'qr' | 'manual',
  inputValue: string
): Promise<RedemptionResult> {
  const requestId = 'req_' + crypto.randomUUID();
  const res = await admitPassAction(
    inputType,
    inputValue,
    1,
    requestId
  );

  let status: RedemptionResult['status'] = 'ERROR';
  if (res.status === 'ADMIT_N') status = 'VALID';
  else if (res.status === 'TICKET_COMPLETE' || res.status === 'NIGHT_FULL')
    status = 'ALREADY_USED';
  else if (res.status === 'CANCELLED') status = 'CANCELLED';
  else if (res.status === 'UNAUTHORIZED') status = 'UNAUTHORIZED';
  else if (res.status === 'INVALID') status = 'INVALID';
  else status = 'ERROR';

  return {
    status,
    message: res.message,
    used_at: res.admitted_at,
    pass: res.name
      ? {
          id: res.admission_id || '',
          name: res.name,
          category: res.category || 'stag_male',
          ticket_type: res.ticket_type,
          party_size: 1,
        }
      : undefined,
  };
}

/**
 * Read-only fallback when migration 004 is not yet applied
 */
async function previewTicketFallback(
  inputType: 'qr' | 'manual',
  cleanValue: string
): Promise<TicketPreviewResult> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  let query = admin
    .from('passes')
    .select('id, name, category, status, used_at');

  if (inputType === 'qr') {
    query = query.eq('token', cleanValue);
  } else {
    const cleaned = cleanValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length !== 8) return { status: 'INVALID' };
    const canonical = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
    query = query.eq('manual_code', canonical);
  }

  const { data: pass, error } = await query.single();
  if (error || !pass) {
    return { status: 'INVALID' };
  }

  if (pass.status === 'cancelled') {
    return {
      status: 'CANCELLED',
      name: pass.name || 'Unassigned Ticket',
      category: pass.category,
    };
  }

  if (pass.status === 'used') {
    return {
      status: 'TICKET_COMPLETE',
      name: pass.name || 'Unassigned Ticket',
      category: pass.category,
      remaining_count: 0,
      admitted_count: 1,
      party_size: 1,
    };
  }

  return {
    status: 'VALID',
    pass_id: pass.id,
    name: pass.name || 'Unassigned Ticket',
    category: pass.category,
    ticket_type: 'single',
    party_size: 1,
    admitted_count: 0,
    remaining_count: 1,
    event_night_title: 'Current Event Night',
  };
}

/**
 * Legacy redemption fallback when migration 004 is not yet applied
 * NOTE: No gate parameter.
 */
async function legacyRedeemFallback(
  inputType: 'qr' | 'manual',
  cleanValue: string
): Promise<AdmitPassResult> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  let query = admin
    .from('passes')
    .select('id, name, category, status, used_at');

  if (inputType === 'qr') {
    query = query.eq('token', cleanValue);
  } else {
    const cleaned = cleanValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length !== 8) return { status: 'INVALID', message: 'Invalid ticket code format.' };
    const canonical = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
    query = query.eq('manual_code', canonical);
  }

  const { data: pass, error: fetchErr } = await query.single();
  if (fetchErr || !pass) {
    return { status: 'INVALID', message: 'Pass not found.' };
  }

  if (pass.status === 'cancelled') {
    return {
      status: 'CANCELLED',
      name: pass.name || 'Unassigned Ticket',
      category: pass.category,
      message: 'Ticket has been cancelled.',
    };
  }

  if (pass.status === 'used') {
    const usedTime = pass.used_at ? new Date(pass.used_at).toLocaleTimeString() : '';
    return {
      status: 'TICKET_COMPLETE',
      remaining_count: 0,
      name: pass.name || 'Unassigned Ticket',
      category: pass.category,
      message: `Pass has already been used${usedTime ? ` at ${usedTime}` : ''}.`,
    };
  }

  // Atomic conditional update: only succeeds if pass is currently 'unused'
  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await admin
    .from('passes')
    .update({ status: 'used', used_at: now })
    .eq('id', pass.id)
    .eq('status', 'unused')
    .select('id, name, category, status, used_at')
    .single();

  if (updateErr || !updated) {
    return {
      status: 'TICKET_COMPLETE',
      remaining_count: 0,
      name: pass.name || 'Unassigned Ticket',
      category: pass.category,
      message: 'Pass has already been used.',
    };
  }

  return {
    status: 'ADMIT_N',
    admitted_now: 1,
    remaining_tonight: 0,
    name: updated.name || 'Unassigned Ticket',
    category: updated.category,
    ticket_type: 'single',
    admitted_at: now,
  };
}
