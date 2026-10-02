'use server';

import { createClient } from '@/lib/supabase/server';
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
    const supabase = await createClient();
    
    // If we are starting a day, we probably should end all other days first to prevent multiple active days
    if (isActive) {
      await supabase.from('event_nights').update({ is_active: false }).neq('id', id);
    }
    
    const { error } = await supabase
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
    const supabase = await createClient();
    const rows = Array.from({ length: 9 }).map((_, i) => {
      const num = i + 1;
      const date = new Date(2026, 9, 3 + num); // Starts Oct 4
      return {
        id: `night_${num}`,
        night_number: num,
        title: `Day ${num}`,
        event_date: date.toISOString().split('T')[0],
        start_time: new Date(date.getTime() + 18 * 60 * 60 * 1000).toISOString(),
        end_time: new Date(date.getTime() + 23.5 * 60 * 60 * 1000).toISOString(),
        is_active: false
      };
    });

    const { error } = await supabase.from('event_nights').insert(rows);
    if (error) {
      return { success: false, error: error.message };
    }
    
    revalidatePath('/dashboard/admin');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
