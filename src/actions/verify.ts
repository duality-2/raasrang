'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireOrganiser, isOrganiser } from '@/lib/auth';
import type { RedemptionResult } from '@/types';

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

export async function redeemPassAction(
  inputType: 'qr' | 'manual',
  inputValue: string
): Promise<RedemptionResult> {
  // 1. Authenticate & Authorise using the request's Supabase session cookies
  const { user, authorized } = await requireOrganiser();
  if (!authorized || !user) {
    return {
      status: 'UNAUTHORIZED',
      message: 'You are not authorised to verify entry passes.',
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
    // 2. Use the authenticated SSR client (NOT admin client) so the request's
    //    session JWT is forwarded to Postgres, setting auth.uid() correctly!
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('redeem_pass', {
      p_input_type: inputType,
      p_input_value: cleanValue,
    });

    if (error) {
      console.error('Redeem pass RPC error:', error.message);
      return {
        status: 'ERROR',
        message: 'Database error occurred during redemption. Please retry.',
      };
    }

    revalidatePath('/dashboard');
    return data as RedemptionResult;
  } catch (err: unknown) {
    console.error('Unexpected redemption error:', err);
    return {
      status: 'ERROR',
      message: 'Network or server error. Pass was not verified.',
    };
  }
}
