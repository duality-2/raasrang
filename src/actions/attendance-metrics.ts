'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrganiser } from '@/lib/auth';

export interface DayCandle {
  nightId: string;
  nightNumber: number;
  title: string;
  eventDate: string;
  isActive: boolean;
  peopleCount: number; // SUM(party_size) over SINGLE passes whose valid_night_id is that day
  passCount: number;
}

export type DayAttendanceMetrics = DayCandle;

export interface SeasonalCandle {
  peopleCount: number; // SUM(party_size) over ALL seasonal passes
  passCount: number;
}

export interface UnassignedCandle {
  peopleCount: number; // SUM(party_size) over single passes with valid_night_id IS NULL
  passCount: number;
}

interface RpcDayItem {
  night_id: string;
  night_number: number;
  title: string;
  event_date: string;
  is_active: boolean;
  people_count: number;
  pass_count: number;
}

export interface OverallAttendanceMetrics {
  days: DayCandle[];
  seasonal: SeasonalCandle;
  unassigned: UnassignedCandle;
  totalPasses: number; // Count of all non-cancelled passes (119)
  totalPeople: number; // Sum of party_size across all non-cancelled passes (218)
  peakDayTitle: string;
  peakDayPeople: number;
  totalFootfallCapacity: number; // 9-day footfall capacity: single passes + 9 * seasonal
  lastUpdated: string;
  syncSource: 'database_rpc' | 'database_query';
}

/**
 * Server action to calculate comprehensive attendance and footfall metrics
 * computed from tickets GENERATED (the passes table), not from scans.
 *
 * Restricted to Organisers / Admins.
 */
export async function getAttendanceMetrics(): Promise<OverallAttendanceMetrics | null> {
  const { authorized } = await requireOrganiser();
  if (!authorized) {
    return null;
  }

  const admin = createAdminClient();

  // 1. Attempt database-level aggregation via RPC (from migration 006)
  try {
    const { data: rpcData, error: rpcError } = await admin.rpc(
      'get_attendance_chart_metrics'
    );

    if (!rpcError && rpcData && Array.isArray(rpcData.days)) {
      const days: DayCandle[] = (rpcData.days as RpcDayItem[]).map((d) => ({
        nightId: d.night_id,
        nightNumber: d.night_number,
        title: d.title,
        eventDate: d.event_date,
        isActive: Boolean(d.is_active),
        peopleCount: Number(d.people_count) || 0,
        passCount: Number(d.pass_count) || 0,
      }));

      const seasonal: SeasonalCandle = {
        peopleCount: Number(rpcData.seasonal?.people_count) || 0,
        passCount: Number(rpcData.seasonal?.pass_count) || 0,
      };

      const unassigned: UnassignedCandle = {
        peopleCount: Number(rpcData.unassigned?.people_count) || 0,
        passCount: Number(rpcData.unassigned?.pass_count) || 0,
      };

      let peakDayPeople = 0;
      let peakDayTitle = 'None';
      days.forEach((d) => {
        if (d.peopleCount > peakDayPeople) {
          peakDayPeople = d.peopleCount;
          peakDayTitle = d.title;
        }
      });

      const singleDaysTotal = days.reduce((sum, d) => sum + d.peopleCount, 0);
      const totalFootfallCapacity = singleDaysTotal + seasonal.peopleCount * 9;

      return {
        days,
        seasonal,
        unassigned,
        totalPasses: Number(rpcData.total_passes) || 0,
        totalPeople: Number(rpcData.total_people) || 0,
        peakDayTitle,
        peakDayPeople,
        totalFootfallCapacity,
        lastUpdated: new Date().toISOString(),
        syncSource: 'database_rpc',
      };
    }
  } catch {
    // If RPC does not exist (migration 006 unapplied on production Supabase),
    // proceed to graceful server-side DB aggregation below.
  }

  // 2. Server-side Database Aggregation Fallback
  // Fetch event nights configuration (ordered by night_number)
  const { data: nightsData, error: nightsError } = await admin
    .from('event_nights')
    .select('id, night_number, title, event_date, is_active')
    .order('night_number', { ascending: true });

  if (nightsError || !nightsData) {
    console.error('Error fetching event nights for metrics:', nightsError);
    return null;
  }

  // Fetch only non-cancelled passes with minimal necessary fields
  const { data: passesData, error: passesError } = await admin
    .from('passes')
    .select('id, ticket_type, party_size, valid_night_id, status')
    .neq('status', 'cancelled');

  if (passesError || !passesData) {
    console.error('Error fetching passes for metrics:', passesError);
    return null;
  }

  const singlePasses = passesData.filter((p) => p.ticket_type !== 'seasonal');
  const seasonalPasses = passesData.filter((p) => p.ticket_type === 'seasonal');

  // Compute 9 Day Candles: SUM(party_size) over SINGLE passes where valid_night_id is that day
  let peakDayPeople = 0;
  let peakDayTitle = 'None';
  let totalSingleDayPeople = 0;

  const days: DayCandle[] = nightsData.map((night) => {
    const nightSingles = singlePasses.filter((p) => p.valid_night_id === night.id);
    const passCount = nightSingles.length;
    const peopleCount = nightSingles.reduce(
      (sum, p) => sum + (p.party_size || 1),
      0
    );

    totalSingleDayPeople += peopleCount;

    if (peopleCount > peakDayPeople) {
      peakDayPeople = peopleCount;
      peakDayTitle = night.title;
    }

    return {
      nightId: night.id,
      nightNumber: night.night_number,
      title: night.title,
      eventDate: night.event_date,
      isActive: Boolean(night.is_active),
      peopleCount,
      passCount,
    };
  });

  // Compute 1 Seasonal Candle: SUM(party_size) over ALL seasonal passes
  const seasonalPeople = seasonalPasses.reduce(
    (sum, p) => sum + (p.party_size || 1),
    0
  );
  const seasonal: SeasonalCandle = {
    peopleCount: seasonalPeople,
    passCount: seasonalPasses.length,
  };

  // Compute Unassigned Candle: SINGLE passes without valid_night_id
  const unassignedSingles = singlePasses.filter((p) => !p.valid_night_id);
  const unassigned: UnassignedCandle = {
    peopleCount: unassignedSingles.reduce(
      (sum, p) => sum + (p.party_size || 1),
      0
    ),
    passCount: unassignedSingles.length,
  };

  const totalPasses = passesData.length;
  const totalPeople = passesData.reduce(
    (sum, p) => sum + (p.party_size || 1),
    0
  );
  const totalFootfallCapacity = totalSingleDayPeople + seasonalPeople * 9;

  return {
    days,
    seasonal,
    unassigned,
    totalPasses,
    totalPeople,
    peakDayTitle,
    peakDayPeople,
    totalFootfallCapacity,
    lastUpdated: new Date().toISOString(),
    syncSource: 'database_query',
  };
}
