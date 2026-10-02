'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrganiserOrScanner } from '@/lib/auth';
import type { EntryListItem, PaginationCursor } from '@/types';

const PAGE_SIZE = 50;

export interface DailyCount {
  title: string;
  count: number;
}

export interface EntryListCounts {
  total: number;
  used: number;
  unused: number;
  peopleAdmittedTonight?: number;
  dailyCounts?: DailyCount[];
}

export interface EntryListResponse {
  items: EntryListItem[];
  nextCursor: PaginationCursor | null;
  hasMore: boolean;
}

/**
 * Fetch counts from real Supabase queries (distinguishing tickets from people admitted tonight).
 */
export async function getPassCounts(): Promise<EntryListCounts> {
  const { authorized } = await requireOrganiserOrScanner();
  if (!authorized) {
    return { total: 0, used: 0, unused: 0, peopleAdmittedTonight: 0 };
  }

  const supabase = createAdminClient();

  const [totalRes, usedRes, unusedRes] = await Promise.all([
    supabase.from('passes').select('*', { count: 'exact', head: true }),
    supabase.from('passes').select('*', { count: 'exact', head: true }).eq('status', 'used'),
    supabase.from('passes').select('*', { count: 'exact', head: true }).eq('status', 'unused'),
  ]);

  let peopleCount = usedRes.count ?? 0;
  let dailyCounts: DailyCount[] = [];
  try {
    // Fetch all event nights
    const { data: nights } = await supabase
      .from('event_nights')
      .select('id, title')
      .order('night_number', { ascending: true });

    // Fetch all admissions to aggregate per day
    const { data: allAdmissions } = await supabase
      .from('admissions')
      .select('event_night_id, people_count');

    if (nights && allAdmissions) {
      dailyCounts = nights.map(night => {
        const count = allAdmissions
          .filter(a => a.event_night_id === night.id)
          .reduce((sum, row) => sum + (row.people_count || 1), 0);
        return { title: night.title, count };
      });
    }

    // Attempt counting total people admitted tonight from admissions table
    const { data: admissionsData } = await supabase
      .from('admissions')
      .select('people_count')
      .gte('admitted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (admissionsData && admissionsData.length > 0) {
      peopleCount = admissionsData.reduce((sum, row) => sum + (row.people_count || 1), 0);
    }
  } catch {
    // Admissions table pending migration 004
  }

  return {
    total: totalRes.count ?? 0,
    used: usedRes.count ?? 0,
    unused: unusedRes.count ?? 0,
    peopleAdmittedTonight: peopleCount,
    dailyCounts,
  };
}

/**
 * Mask a manual code for scanner role: show first 2 and last 2, mask middle.
 * e.g. "7R8B-TZQL" → "7R••-••QL"
 */
function maskManualCode(code: string): string {
  if (!code || code.length < 9) return code;
  return code.slice(0, 2) + '••-••' + code.slice(7);
}

/**
 * Fetch USED passes with keyset (cursor) pagination.
 * Sorted by used_at DESC, id DESC (newest scan first).
 * Search by name or manual_code.
 */
export async function getUsedPasses(
  cursor: PaginationCursor | null,
  search: string = ''
): Promise<EntryListResponse> {
  const { authorized, role } = await requireOrganiserOrScanner();
  if (!authorized) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  const supabase = createAdminClient();
  const isScanner = role === 'scanner';

  let query = supabase
    .from('passes')
    .select('*')
    .eq('status', 'used')
    .order('used_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);

  // Keyset pagination: fetch rows after the cursor
  if (cursor) {
    // (used_at, id) < (cursor.timestamp, cursor.id) for DESC ordering
    query = query.or(
      `used_at.lt.${cursor.timestamp},and(used_at.eq.${cursor.timestamp},id.lt.${cursor.id})`
    );
  }

  // Search filter
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`name.ilike.${term},manual_code.ilike.${term}`);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('getUsedPasses error:', error?.message);
    return { items: [], nextCursor: null, hasMore: false };
  }

  const hasMore = data.length > PAGE_SIZE;
  const rows = hasMore ? data.slice(0, PAGE_SIZE) : data;

  const items: EntryListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    ticket_type: row.ticket_type || 'single',
    party_size: row.party_size || 1,
    batch_id: row.batch_id,
    batch_number: null,
    manual_code: isScanner ? maskManualCode(row.manual_code) : row.manual_code,
    status: row.status,
    validity_state: row.validity_state || 'active',
    valid_night_id: row.valid_night_id || null,
    created_at: row.created_at,
    used_at: row.used_at,
    scanned_by: row.scanned_by,
    scan_method: row.scan_method,
  }));

  const lastRow = rows[rows.length - 1];
  const nextCursor: PaginationCursor | null = hasMore && lastRow
    ? { timestamp: lastRow.used_at, id: lastRow.id }
    : null;

  return { items, nextCursor, hasMore };
}

/**
 * Fetch UNUSED passes with keyset (cursor) pagination.
 * Sorted by created_at DESC, id DESC (newest generated first).
 * Search by name or manual_code.
 */
export async function getUnusedPasses(
  cursor: PaginationCursor | null,
  search: string = ''
): Promise<EntryListResponse> {
  const { authorized, role } = await requireOrganiserOrScanner();
  if (!authorized) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  const supabase = createAdminClient();
  const isScanner = role === 'scanner';

  let query = supabase
    .from('passes')
    .select('*')
    .eq('status', 'unused')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);

  // Keyset pagination
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.timestamp},and(created_at.eq.${cursor.timestamp},id.lt.${cursor.id})`
    );
  }

  // Search filter
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`name.ilike.${term},manual_code.ilike.${term}`);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('getUnusedPasses error:', error?.message);
    return { items: [], nextCursor: null, hasMore: false };
  }

  const hasMore = data.length > PAGE_SIZE;
  const rows = hasMore ? data.slice(0, PAGE_SIZE) : data;

  const items: EntryListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    ticket_type: row.ticket_type || 'single',
    party_size: row.party_size || 1,
    batch_id: row.batch_id,
    batch_number: null,
    manual_code: isScanner ? maskManualCode(row.manual_code) : row.manual_code,
    status: row.status,
    validity_state: row.validity_state || 'active',
    valid_night_id: row.valid_night_id || null,
    created_at: row.created_at,
    used_at: row.used_at,
    scanned_by: row.scanned_by,
    scan_method: row.scan_method,
  }));

  const lastRow = rows[rows.length - 1];
  const nextCursor: PaginationCursor | null = hasMore && lastRow
    ? { timestamp: lastRow.created_at, id: lastRow.id }
    : null;

  return { items, nextCursor, hasMore };
}
