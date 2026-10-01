'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { requireOrganiser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isValidCategory } from '@/lib/utils';
import type { PassCategory } from '@/types';

export async function createBatch(formData: FormData) {
  const { authorized } = await requireOrganiser();
  if (!authorized) {
    return { error: 'You are not authorised to create batches.' };
  }

  const name = (formData.get('name') as string)?.trim();
  const rawCategory = (formData.get('category') as string)?.trim();
  const category: PassCategory = rawCategory && isValidCategory(rawCategory)
    ? (rawCategory as PassCategory)
    : 'complimentary';
  const countStr = formData.get('count') as string;
  const count = parseInt(countStr, 10);
  const idempotencyKey =
    (formData.get('idempotency_key') as string)?.trim() || crypto.randomUUID();

  if (!name) {
    return { error: 'Batch name is required and cannot be empty.' };
  }

  if (isNaN(count) || count < 1 || count > 500) {
    return { error: 'Ticket count must be an integer between 1 and 500.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_ticket_batch', {
    p_idempotency_key: idempotencyKey,
    p_name: name,
    p_category: category,
    p_count: count,
  });

  if (error) {
    console.error('Batch creation RPC error:', error.message);
    return { error: error.message || 'Failed to create ticket batch.' };
  }

  if (!data?.success) {
    return { error: data?.error || 'Failed to create ticket batch.' };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/batches');
  return {
    success: true,
    batchId: data.batch_id,
    batchNumber: data.batch_number,
    idempotentReplay: Boolean(data.idempotent_replay),
  };
}
