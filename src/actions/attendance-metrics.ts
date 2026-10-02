'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrganiser } from '@/lib/auth';

export interface CategoryMetric {
  count: number;
  people: number;
}

export interface DayAttendanceMetrics {
  nightId: string;
  nightNumber: number;
  title: string;
  eventDate: string;
  isActive: boolean;
  // Day-specific single/group tickets
  dayPassesCount: number;
  dayPassesPeople: number;
  groupPassesCount: number;
  groupPassesPeople: number;
  singlePassesCount: number;
  singlePassesPeople: number;
  vipPassesCount: number;
  vipPassesPeople: number;
  categoryBreakdown: Record<string, CategoryMetric>;
  // Season passes eligible on this day
  seasonPassesCount: number;
  seasonPassesPeople: number;
  // Combined Grand Total for this Day
  totalPeopleAttending: number;
  // Live admissions recorded at the gates
  actualAdmittedPeople: number;
  admissionPercentage: number;
}

export interface SeasonPassItem {
  id: string;
  name: string | null;
  manualCode: string;
  category: string;
  partySize: number;
  status: string;
  startNightId: string | null;
  nightsCount: number;
}

export interface SeasonPassSummary {
  totalSold: number;
  totalPeople: number;
  avgPartySize: number;
  categoryBreakdown: Record<string, CategoryMetric>;
  passes: SeasonPassItem[];
}

export interface OverallAttendanceMetrics {
  days: DayAttendanceMetrics[];
  seasonSummary: SeasonPassSummary;
  unassignedPassesCount: number;
  unassignedPassesPeople: number;
  peakDayTitle: string;
  peakDayPeople: number;
  totalCapacityAcrossDays: number;
  totalUniquePasses: number;
  totalAdmittedOverall: number;
  lastUpdated: string;
}

/**
 * Server action to calculate comprehensive attendance and footfall metrics.
 * Restricted to Organisers / Admins.
 */
export async function getAttendanceMetrics(): Promise<OverallAttendanceMetrics | null> {
  const { authorized } = await requireOrganiser();
  if (!authorized) {
    return null;
  }

  const admin = createAdminClient();

  // 1. Fetch all event nights
  const { data: nightsData, error: nightsError } = await admin
    .from('event_nights')
    .select('id, night_number, title, event_date, is_active')
    .order('night_number', { ascending: true });

  if (nightsError || !nightsData) {
    console.error('Error fetching event nights for metrics:', nightsError);
    return null;
  }

  // 2. Fetch all passes (excluding cancelled)
  const { data: passesData, error: passesError } = await admin
    .from('passes')
    .select('id, name, manual_code, category, status, ticket_type, party_size, valid_night_id, seasonal_start_night_id, seasonal_nights_count')
    .neq('status', 'cancelled');

  if (passesError || !passesData) {
    console.error('Error fetching passes for metrics:', passesError);
    return null;
  }

  // 3. Fetch seasonal pass eligible nights junction table
  const { data: eligibleNightsData } = await admin
    .from('pass_eligible_nights')
    .select('pass_id, event_night_id');

  // Map pass_id -> Set of eligible event_night_ids
  const passEligibleMap = new Map<string, Set<string>>();
  if (eligibleNightsData) {
    eligibleNightsData.forEach((row) => {
      if (!passEligibleMap.has(row.pass_id)) {
        passEligibleMap.set(row.pass_id, new Set());
      }
      passEligibleMap.get(row.pass_id)!.add(row.event_night_id);
    });
  }

  // 4. Fetch all successful admissions
  const { data: admissionsData } = await admin
    .from('admissions')
    .select('id, event_night_id, people_count');

  // Map event_night_id -> total people admitted
  const admissionsByNight = new Map<string, number>();
  let totalAdmittedOverall = 0;
  if (admissionsData) {
    admissionsData.forEach((adm) => {
      const count = adm.people_count || 1;
      totalAdmittedOverall += count;
      if (adm.event_night_id) {
        admissionsByNight.set(
          adm.event_night_id,
          (admissionsByNight.get(adm.event_night_id) || 0) + count
        );
      }
    });
  }

  // Separate single day tickets vs season passes
  const singlePasses = passesData.filter((p) => p.ticket_type !== 'seasonal');
  const seasonalPasses = passesData.filter((p) => p.ticket_type === 'seasonal');

  // ── Season Pass Summary ──
  let totalSeasonPeople = 0;
  const seasonCatMap: Record<string, CategoryMetric> = {};
  const seasonItems: SeasonPassItem[] = [];

  seasonalPasses.forEach((sp) => {
    const size = sp.party_size || 1;
    totalSeasonPeople += size;

    const cat = sp.category || 'general';
    if (!seasonCatMap[cat]) {
      seasonCatMap[cat] = { count: 0, people: 0 };
    }
    seasonCatMap[cat].count += 1;
    seasonCatMap[cat].people += size;

    seasonItems.push({
      id: sp.id,
      name: sp.name,
      manualCode: sp.manual_code,
      category: sp.category,
      partySize: size,
      status: sp.status,
      startNightId: sp.seasonal_start_night_id,
      nightsCount: sp.seasonal_nights_count || 9,
    });
  });

  const seasonSummary: SeasonPassSummary = {
    totalSold: seasonalPasses.length,
    totalPeople: totalSeasonPeople,
    avgPartySize:
      seasonalPasses.length > 0
        ? Math.round((totalSeasonPeople / seasonalPasses.length) * 10) / 10
        : 0,
    categoryBreakdown: seasonCatMap,
    passes: seasonItems,
  };

  // ── Day by Day Breakdown ──
  const daysMetrics: DayAttendanceMetrics[] = [];
  let peakPeople = 0;
  let peakTitle = 'None';
  let totalCapacityAllDays = 0;

  nightsData.forEach((night) => {
    // 1. Day tickets matching this night
    const nightSingles = singlePasses.filter((p) => p.valid_night_id === night.id);
    const dayPassesCount = nightSingles.length;
    let dayPassesPeople = 0;
    let groupPassesCount = 0;
    let groupPassesPeople = 0;
    let singlePassesCount = 0;
    let singlePassesPeople = 0;
    let vipPassesCount = 0;
    let vipPassesPeople = 0;
    const catMap: Record<string, CategoryMetric> = {};

    nightSingles.forEach((p) => {
      const size = p.party_size || 1;
      dayPassesPeople += size;

      if (p.category === 'group' || size > 1) {
        groupPassesCount += 1;
        groupPassesPeople += size;
      } else {
        singlePassesCount += 1;
        singlePassesPeople += size;
      }

      if (p.category === 'vip') {
        vipPassesCount += 1;
        vipPassesPeople += size;
      }

      const cat = p.category || 'general';
      if (!catMap[cat]) {
        catMap[cat] = { count: 0, people: 0 };
      }
      catMap[cat].count += 1;
      catMap[cat].people += size;
    });

    // 2. Season passes eligible for this specific night
    const eligibleSeasonals = seasonalPasses.filter((sp) => {
      // Check junction table first
      const set = passEligibleMap.get(sp.id);
      if (set && set.has(night.id)) {
        return true;
      }
      // Fallback: check contiguous night range
      const startNum = parseInt(
        sp.seasonal_start_night_id?.replace('night_', '') || '1',
        10
      );
      const count = sp.seasonal_nights_count || 9;
      return (
        night.night_number >= startNum && night.night_number < startNum + count
      );
    });

    const seasonPassesCount = eligibleSeasonals.length;
    const seasonPassesPeople = eligibleSeasonals.reduce(
      (sum, sp) => sum + (sp.party_size || 1),
      0
    );

    // 3. Combined Total People Attending on this day
    const totalPeopleAttending = dayPassesPeople + seasonPassesPeople;
    totalCapacityAllDays += totalPeopleAttending;

    if (totalPeopleAttending > peakPeople) {
      peakPeople = totalPeopleAttending;
      peakTitle = night.title;
    }

    // 4. Actual Admitted People for this day
    const actualAdmittedPeople = admissionsByNight.get(night.id) || 0;
    const admissionPercentage =
      totalPeopleAttending > 0
        ? Math.min(100, Math.round((actualAdmittedPeople / totalPeopleAttending) * 100))
        : 0;

    daysMetrics.push({
      nightId: night.id,
      nightNumber: night.night_number,
      title: night.title,
      eventDate: night.event_date,
      isActive: Boolean(night.is_active),
      dayPassesCount,
      dayPassesPeople,
      groupPassesCount,
      groupPassesPeople,
      singlePassesCount,
      singlePassesPeople,
      vipPassesCount,
      vipPassesPeople,
      categoryBreakdown: catMap,
      seasonPassesCount,
      seasonPassesPeople,
      totalPeopleAttending,
      actualAdmittedPeople,
      admissionPercentage,
    });
  });

  // ── Unassigned Legacy Single Tickets ──
  const unassignedSingles = singlePasses.filter((p) => !p.valid_night_id);
  const unassignedPassesCount = unassignedSingles.length;
  const unassignedPassesPeople = unassignedSingles.reduce(
    (sum, p) => sum + (p.party_size || 1),
    0
  );

  return {
    days: daysMetrics,
    seasonSummary,
    unassignedPassesCount,
    unassignedPassesPeople,
    peakDayTitle: peakTitle,
    peakDayPeople: peakPeople,
    totalCapacityAcrossDays: totalCapacityAllDays,
    totalUniquePasses: passesData.length,
    totalAdmittedOverall,
    lastUpdated: new Date().toISOString(),
  };
}
