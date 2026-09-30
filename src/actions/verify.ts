'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganiser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RedemptionResult } from '@/types';

export async function redeemPassAction(
  inputType: 'qr' | 'manual',
  inputValue: string
): Promise<RedemptionResult> {
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
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('redeem_pass', {
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
