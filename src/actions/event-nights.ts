'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrganiser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export interface EventNight {
  id: string;
  night_number: number;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

/**
 * Fetch all configured event nights (Asia/Kolkata schedule).
 * Available to all authenticated staff members.
 */
export async function getEventNights(): Promise<EventNight[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('event_nights')
      .select('*')
      .order('night_number', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data as EventNight[];
  } catch {
    return [];
  }
}

/**
 * Save or update an official event night (Admin only).
 * Requires confirmed dates & hours from the organizer.
 */
export async function saveEventNightAction(formData: FormData) {
  const { user, authorized } = await requireOrganiser();
  if (!authorized || !user) {
    return { success: false, error: 'Unauthorized: Only admins can manage event schedules.' };
  }

  const id = formData.get('id') as string;
  const nightNumber = parseInt(formData.get('night_number') as string, 10);
  const title = (formData.get('title') as string)?.trim();
  const eventDate = formData.get('event_date') as string;
  const startTime = formData.get('start_time') as string;
  const endTime = formData.get('end_time') as string;

  if (!title || !eventDate || !startTime || !endTime || isNaN(nightNumber)) {
    return { success: false, error: 'All schedule fields (title, date, start, end) are required.' };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('event_nights')
      .upsert({
        id: id || `night_${nightNumber}`,
        night_number: nightNumber,
        title,
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime,
        is_active: true,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/add');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Toggle the active status of an event night (Admin only).
 * Starts or ends a day.
 */
export async function toggleEventNightStatus(id: string, isActive: boolean) {
  const { user, authorized } = await requireOrganiser();
  if (!authorized || !user) {
    return { success: false, error: 'Unauthorized: Only admins can manage event schedules.' };
  }

  try {
    const admin = createAdminClient();
    
    // If we are starting a day, we end all other days first to ensure only 1 day is active
    if (isActive) {
      await admin.from('event_nights').update({ is_active: false }).neq('id', id);
    }
    
    const { error } = await admin
      .from('event_nights')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/verify');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Seed the initial 9 event nights if the schedule is empty.
 */
export async function seedEventNights() {
  const { user, authorized } = await requireOrganiser();
  if (!authorized || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const admin = createAdminClient();
    const rows = Array.from({ length: 9 }).map((_, i) => {
      const num = i + 1;
      const day = 10 + num; // Day 1 = Oct 11, Day 9 = Oct 19
      const dateStr = `2026-10-${day.toString().padStart(2, '0')}`;
      return {
        id: `night_${num}`,
        night_number: num,
        title: `Day ${num}`,
        event_date: dateStr,
        start_time: `${dateStr}T18:00:00+05:30`,
        end_time: `${dateStr}T23:30:00+05:30`,
        is_active: num === 1,
      };
    });

    const { error } = await admin.from('event_nights').upsert(rows, { onConflict: 'id' });
    if (error) {
      return { success: false, error: error.message };
    }
    
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/add');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Update existing event nights to confirmed real dates:
 * Day 1 on 11th October 2026, then 9 consecutive days (Oct 11 - Oct 19).
 */
export async function updateRealEventNightDatesAction() {
  const { user, authorized } = await requireOrganiser();
  if (!authorized || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const admin = createAdminClient();
    const updates = Array.from({ length: 9 }).map((_, i) => {
      const num = i + 1;
      const day = 10 + num; // Day 1 = Oct 11, Day 9 = Oct 19
      const dateStr = `2026-10-${day.toString().padStart(2, '0')}`;
      return {
        id: `night_${num}`,
        event_date: dateStr,
        start_time: `${dateStr}T18:00:00+05:30`,
        end_time: `${dateStr}T23:30:00+05:30`,
      };
    });

    for (const row of updates) {
      await admin
        .from('event_nights')
        .update({
          event_date: row.event_date,
          start_time: row.start_time,
          end_time: row.end_time,
        })
        .eq('id', row.id);
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/add');
    revalidatePath('/dashboard/verify');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
