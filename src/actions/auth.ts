'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getUserRole } from '@/lib/auth';
import {
  setPersistentSessionCookie,
  clearPersistentSessionCookie,
} from '@/lib/session';

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: error?.message || 'Login failed.' };
  }

  // Determine user role and set perpetual persistent session cookie
  const role =
    (await getUserRole(data.user.id, data.user.app_metadata)) ||
    (data.user.app_metadata?.role as any) ||
    'admin';

  const cookieStore = await cookies();
  await setPersistentSessionCookie(cookieStore, {
    userId: data.user.id,
    email: data.user.email || email,
    role,
  });


  revalidatePath('/', 'layout');

  if (role === 'scanner') {
    redirect('/dashboard/verify');
  } else if (role === 'ticketer') {
    redirect('/dashboard/add');
  } else {
    redirect('/dashboard');
  }
}

export async function signOut() {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('signOut: Supabase signOut error:', err);
  }

  // Explicitly clear the perpetual persistent session cookie
  const cookieStore = await cookies();
  clearPersistentSessionCookie(cookieStore);

  revalidatePath('/', 'layout');
  redirect('/login');
}

