import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AdmissionDecisionStatus } from '../../src/types/index.ts';

/**
 * Pure simulation of the atomic gate logic matching the SQL RPC admit_pass and preview_ticket_allowance
 */
interface PassRecord {
  id: string;
  token: string;
  manual_code: string;
  ticket_type: 'single' | 'seasonal';
  party_size: number;
  seasonal_nights_count?: number;
  eligible_night_ids?: string[];
  status: 'unused' | 'used' | 'cancelled';
  validity_state: 'active' | 'paused' | 'cancelled' | 'completed';
}

interface AdmissionRecord {
  client_request_id: string;
  pass_id: string;
  event_night_id: string;
  people_count: number;
  scan_gate: string;
}

function simulateAdmission(
  pass: PassRecord,
  currentNightId: string | null,
  peopleCount: number,
  gate: string,
  clientRequestId: string,
  existingAdmissions: AdmissionRecord[]
): {
  status: AdmissionDecisionStatus;
  admitted_now?: number;
  remaining_tonight?: number;
  remaining_count?: number;
  idempotent_replay?: boolean;
} {
  // 1. Idempotency check
  const existing = existingAdmissions.find((a) => a.client_request_id === clientRequestId);
  if (existing) {
    return {
      status: 'ADMIT_N',
      idempotent_replay: true,
      admitted_now: existing.people_count,
    };
  }

  // 2. Cancellation check
  if (pass.status === 'cancelled' || pass.validity_state === 'cancelled') {
    return { status: 'CANCELLED' };
  }

  // 3. Event night window check
  if (!currentNightId) {
    return { status: 'OUTSIDE_EVENT_WINDOW' };
  }

  // 4. Seasonal night eligibility check
  if (pass.ticket_type === 'seasonal') {
    const isEligible = pass.eligible_night_ids?.includes(currentNightId);
    if (!isEligible) {
      return { status: 'NIGHT_NOT_INCLUDED' };
    }
  }

  // 5. Admitted tonight calculation
  const admissionsTonight = existingAdmissions
    .filter((a) => a.pass_id === pass.id && (pass.ticket_type === 'single' || a.event_night_id === currentNightId))
    .reduce((sum, a) => sum + a.people_count, 0);

  const remaining = Math.max(0, pass.party_size - admissionsTonight);

  if (remaining === 0) {
    return {
      status: pass.ticket_type === 'single' ? 'TICKET_COMPLETE' : 'NIGHT_FULL',
      remaining_count: 0,
    };
  }

  // 6. Strict party limit check: NEVER admit part of an over-limit party!
  if (peopleCount > remaining) {
    return {
      status: 'TOO_MANY',
      remaining_count: remaining,
    };
  }

  // 7. Successful admission
  return {
    status: 'ADMIT_N',
    admitted_now: peopleCount,
    remaining_tonight: remaining - peopleCount,
    idempotent_replay: false,
  };
}

test('Single Ticket: 10-person ticket (4 + 4, reject 3, admit 2 => complete)', () => {
  const pass: PassRecord = {
    id: 'pass_single_10',
    token: 'tok_123',
    manual_code: 'ABCD-2345',
    ticket_type: 'single',
    party_size: 10,
    status: 'unused',
    validity_state: 'active',
  };

  const admissions: AdmissionRecord[] = [];
  const night1 = 'night_1';

  // Scan 1: Request 4 people -> Succeeds, 6 remaining
  const res1 = simulateAdmission(pass, night1, 4, 'Gate A', 'req_1', admissions);
  assert.equal(res1.status, 'ADMIT_N');
  assert.equal(res1.admitted_now, 4);
  assert.equal(res1.remaining_tonight, 6);
  admissions.push({ client_request_id: 'req_1', pass_id: pass.id, event_night_id: night1, people_count: 4, scan_gate: 'Gate A' });

  // Scan 2: Request 4 people -> Succeeds, 2 remaining
  const res2 = simulateAdmission(pass, night1, 4, 'Gate B', 'req_2', admissions);
  assert.equal(res2.status, 'ADMIT_N');
  assert.equal(res2.admitted_now, 4);
  assert.equal(res2.remaining_tonight, 2);
  admissions.push({ client_request_id: 'req_2', pass_id: pass.id, event_night_id: night1, people_count: 4, scan_gate: 'Gate B' });

  // Scan 3: Request 3 people -> REJECTED with TOO_MANY (only 2 remain, never partial)
  const res3 = simulateAdmission(pass, night1, 3, 'Gate A', 'req_3', admissions);
  assert.equal(res3.status, 'TOO_MANY');
  assert.equal(res3.remaining_count, 2);
  // Zero people admitted for over-limit request!

  // Scan 4: Request 2 people -> Succeeds, 0 remaining
  const res4 = simulateAdmission(pass, night1, 2, 'Gate A', 'req_4', admissions);
  assert.equal(res4.status, 'ADMIT_N');
  assert.equal(res4.admitted_now, 2);
  assert.equal(res4.remaining_tonight, 0);
  admissions.push({ client_request_id: 'req_4', pass_id: pass.id, event_night_id: night1, people_count: 2, scan_gate: 'Gate A' });

  // Scan 5: Another scan on completed ticket -> TICKET_COMPLETE
  const res5 = simulateAdmission(pass, night1, 1, 'Gate A', 'req_5', admissions);
  assert.equal(res5.status, 'TICKET_COMPLETE');
  assert.equal(res5.remaining_count, 0);
});

test('Seasonal Pass: allowance replenishes per eligible night', () => {
  const seasonalPass: PassRecord = {
    id: 'pass_seasonal_4',
    token: 'tok_seasonal_1',
    manual_code: 'SEAS-9999',
    ticket_type: 'seasonal',
    party_size: 4,
    seasonal_nights_count: 3,
    eligible_night_ids: ['night_1', 'night_2', 'night_3'],
    status: 'unused',
    validity_state: 'active',
  };

  const admissions: AdmissionRecord[] = [];

  // Night 1: Admit 4 people -> Night 1 full
  const n1 = simulateAdmission(seasonalPass, 'night_1', 4, 'Gate A', 'req_n1', admissions);
  assert.equal(n1.status, 'ADMIT_N');
  assert.equal(n1.admitted_now, 4);
  assert.equal(n1.remaining_tonight, 0);
  admissions.push({ client_request_id: 'req_n1', pass_id: seasonalPass.id, event_night_id: 'night_1', people_count: 4, scan_gate: 'Gate A' });

  // Further scan on Night 1 -> NIGHT_FULL
  const n1Full = simulateAdmission(seasonalPass, 'night_1', 1, 'Gate A', 'req_n1_extra', admissions);
  assert.equal(n1Full.status, 'NIGHT_FULL');

  // Night 2: Full allowance (4 people) is available again!
  const n2 = simulateAdmission(seasonalPass, 'night_2', 3, 'Gate B', 'req_n2', admissions);
  assert.equal(n2.status, 'ADMIT_N');
  assert.equal(n2.admitted_now, 3);
  assert.equal(n2.remaining_tonight, 1);
  admissions.push({ client_request_id: 'req_n2', pass_id: seasonalPass.id, event_night_id: 'night_2', people_count: 3, scan_gate: 'Gate B' });

  // Night 4 (Not eligible) -> NIGHT_NOT_INCLUDED
  const n4 = simulateAdmission(seasonalPass, 'night_4', 1, 'Gate A', 'req_n4', admissions);
  assert.equal(n4.status, 'NIGHT_NOT_INCLUDED');

  // Outside event hours -> OUTSIDE_EVENT_WINDOW
  const closed = simulateAdmission(seasonalPass, null, 1, 'Gate A', 'req_closed', admissions);
  assert.equal(closed.status, 'OUTSIDE_EVENT_WINDOW');
});

test('Idempotent Replay: same client_request_id returns original result without extra admission', () => {
  const pass: PassRecord = {
    id: 'pass_single_2',
    token: 'tok_idem',
    manual_code: 'IDEM-1234',
    ticket_type: 'single',
    party_size: 2,
    status: 'unused',
    validity_state: 'active',
  };

  const admissions: AdmissionRecord[] = [
    { client_request_id: 'req_fixed_id', pass_id: pass.id, event_night_id: 'night_1', people_count: 2, scan_gate: 'Gate A' },
  ];

  // Replaying the exact same request
  const replay = simulateAdmission(pass, 'night_1', 2, 'Gate A', 'req_fixed_id', admissions);
  assert.equal(replay.status, 'ADMIT_N');
  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.admitted_now, 2);
  // Total admissions count in database remains exactly 1 row!
  assert.equal(admissions.length, 1);
});
