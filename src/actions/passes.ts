'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { requireOrganiser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePassInput } from '@/lib/utils';

export async function createPass(formData: FormData) {
  // 1. Auth + authorisation check
  const { user, authorized } = await requireOrganiser();
  if (!authorized) {
    return { error: 'You are not authorised to create passes.' };
  }

  // 2. Extract and validate input
  const input = {
    name: formData.get('name') as string,
    category: formData.get('category') as string,
    email: formData.get('email') as string,
    phone: formData.get('phone') as string,
  };

  const validation = validatePassInput(input);
  if (!validation.valid) {
    return { error: 'Validation failed.', fieldErrors: validation.errors };
  }

  // 3. Generate cryptographically secure token
  const token = crypto.randomBytes(32).toString('hex');

  // 4. Insert into database via service-role client
  //    (We use admin client to guarantee the insert works regardless of
  //     RLS timing issues during the same request.)
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('passes')
    .insert({
      token,
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

  if (error) {
    console.error('Pass creation error:', error.message);
    // Handle unique constraint violation (extremely unlikely with 32-byte random)
    if (error.code === '23505') {
      return { error: 'Token collision — please try again.' };
    }
    return { error: 'Failed to save pass. Please try again.' };
  }

  revalidatePath('/dashboard');
  return { success: true, passId: data.id };
}
