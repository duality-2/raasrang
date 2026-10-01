import test from 'node:test';
import assert from 'node:assert/strict';

interface MockAdmission {
  id: string;
  clientRequestId: string;
  passId: string;
  eventNightId: string | null;
  peopleCount: number;
}

interface MockPass {
  id: string;
  ticketType: 'single' | 'seasonal';
  partySize: number;
  eligibleNights: string[];
}

interface MockNight {
  id: string;
  startTime: number;
  endTime: number;
}

function simulateAdmission(
  pass: MockPass,
  requestedCount: number,
  clientRequestId: string,
  currentTime: number,
  openNight: MockNight | null,
  admissions: MockAdmission[]
): { status: string; admittedNow?: number; remainingTonight?: number; idempotentReplay?: boolean } {
  // 1. Idempotency check
  const existing = admissions.find((a) => a.clientRequestId === clientRequestId);
  if (existing) {
    return { status: 'ADMIT_N', admittedNow: existing.peopleCount, idempotentReplay: true };
  }

  // 2. Count bounds check
  if (requestedCount < 1 || requestedCount > 10) {
    return { status: 'ERROR' };
  }

  // 3. Seasonal Pass Evaluation
  if (pass.ticketType === 'seasonal') {
    if (!openNight) {
      return { status: 'OUTSIDE_EVENT_WINDOW' };
    }
    if (!pass.eligibleNights.includes(openNight.id)) {
      return { status: 'NIGHT_NOT_INCLUDED' };
    }
    const nightAdmitted = admissions
      .filter((a) => a.passId === pass.id && a.eventNightId === openNight.id)
      .reduce((sum, a) => sum + a.peopleCount, 0);

    const remaining = Math.max(0, pass.partySize - nightAdmitted);
    if (remaining === 0) {
      return { status: 'NIGHT_FULL', remainingTonight: 0 };
    }
    if (requestedCount > remaining) {
      return { status: 'TOO_MANY', remainingTonight: remaining };
    }

    admissions.push({
      id: 'adm_' + Math.random().toString(36).substring(2),
      clientRequestId,
      passId: pass.id,
      eventNightId: openNight.id,
      peopleCount: requestedCount,
    });

    return { status: 'ADMIT_N', admittedNow: requestedCount, remainingTonight: remaining - requestedCount };
  }

  // 4. Single Ticket Evaluation (works with or without event nights)
  const totalAdmitted = admissions
    .filter((a) => a.passId === pass.id)
    .reduce((sum, a) => sum + a.peopleCount, 0);

  const remaining = Math.max(0, pass.partySize - totalAdmitted);
  if (remaining === 0) {
    return { status: 'TICKET_COMPLETE', remainingTonight: 0 };
  }
  if (requestedCount > remaining) {
    return { status: 'TOO_MANY', remainingTonight: remaining };
  }

  admissions.push({
    id: 'adm_' + Math.random().toString(36).substring(2),
    clientRequestId,
    passId: pass.id,
    eventNightId: openNight ? openNight.id : null,
    peopleCount: requestedCount,
  });

  return { status: 'ADMIT_N', admittedNow: requestedCount, remainingTonight: remaining - requestedCount };
}

test('Group single ticket: 10-person admits 4 + 4, denies 3 when 2 remain, then admits 2', () => {
  const pass: MockPass = {
    id: 'pass_10_person',
    ticketType: 'single',
    partySize: 10,
    eligibleNights: [],
  };
  const admissions: MockAdmission[] = [];

  // Admit 4
  const res1 = simulateAdmission(pass, 4, 'req_1', Date.now(), null, admissions);
  assert.equal(res1.status, 'ADMIT_N');
  assert.equal(res1.admittedNow, 4);
  assert.equal(res1.remainingTonight, 6);

  // Admit another 4
  const res2 = simulateAdmission(pass, 4, 'req_2', Date.now(), null, admissions);
  assert.equal(res2.status, 'ADMIT_N');
  assert.equal(res2.admittedNow, 4);
  assert.equal(res2.remainingTonight, 2);

  // Try to admit 3 when only 2 remain -> TOO_MANY (Strict: NEVER admits partial)
  const res3 = simulateAdmission(pass, 3, 'req_3', Date.now(), null, admissions);
  assert.equal(res3.status, 'TOO_MANY');
  assert.equal(res3.remainingTonight, 2);

  // Admit exactly 2 -> completes the ticket
  const res4 = simulateAdmission(pass, 2, 'req_4', Date.now(), null, admissions);
  assert.equal(res4.status, 'ADMIT_N');
  assert.equal(res4.admittedNow, 2);
  assert.equal(res4.remainingTonight, 0);

  // Further admission attempts -> TICKET_COMPLETE
  const res5 = simulateAdmission(pass, 1, 'req_5', Date.now(), null, admissions);
  assert.equal(res5.status, 'TICKET_COMPLETE');
  assert.equal(res5.remainingTonight, 0);
});

test('Seasonal pass: blocked when no schedule active; admits on eligible night and replenishes', () => {
  const pass: MockPass = {
    id: 'seasonal_pass_1',
    ticketType: 'seasonal',
    partySize: 2,
    eligibleNights: ['night_1', 'night_2'],
  };
  const admissions: MockAdmission[] = [];

  // 1. Outside event window -> OUTSIDE_EVENT_WINDOW
  const resNoNight = simulateAdmission(pass, 2, 'req_closed', Date.now(), null, admissions);
  assert.equal(resNoNight.status, 'OUTSIDE_EVENT_WINDOW');

  // 2. Open night 1 (eligible)
  const night1: MockNight = { id: 'night_1', startTime: 1000, endTime: 5000 };
  const resNight1 = simulateAdmission(pass, 2, 'req_night_1', 2000, night1, admissions);
  assert.equal(resNight1.status, 'ADMIT_N');
  assert.equal(resNight1.admittedNow, 2);
  assert.equal(resNight1.remainingTonight, 0);

  // Night 1 is full
  const resNight1Full = simulateAdmission(pass, 1, 'req_night_1_extra', 2100, night1, admissions);
  assert.equal(resNight1Full.status, 'NIGHT_FULL');

  // 3. Open night 2 (allowance replenishes to full 2)
  const night2: MockNight = { id: 'night_2', startTime: 6000, endTime: 9000 };
  const resNight2 = simulateAdmission(pass, 2, 'req_night_2', 7000, night2, admissions);
  assert.equal(resNight2.status, 'ADMIT_N');
  assert.equal(resNight2.admittedNow, 2);
  assert.equal(resNight2.remainingTonight, 0);

  // 4. Open night 3 (not included in ticket) -> NIGHT_NOT_INCLUDED
  const night3: MockNight = { id: 'night_3', startTime: 10000, endTime: 15000 };
  const resNight3 = simulateAdmission(pass, 2, 'req_night_3', 11000, night3, admissions);
  assert.equal(resNight3.status, 'NIGHT_NOT_INCLUDED');
});

test('Idempotent replay: retrying same request ID returns original admission without over-admit', () => {
  const pass: MockPass = {
    id: 'pass_idem',
    ticketType: 'single',
    partySize: 2,
    eligibleNights: [],
  };
  const admissions: MockAdmission[] = [];

  const res1 = simulateAdmission(pass, 2, 'req_unique_999', Date.now(), null, admissions);
  assert.equal(res1.status, 'ADMIT_N');
  assert.equal(res1.idempotentReplay, undefined);
  assert.equal(admissions.length, 1);

  // Network retry with exact same request ID
  const res2 = simulateAdmission(pass, 2, 'req_unique_999', Date.now(), null, admissions);
  assert.equal(res2.status, 'ADMIT_N');
  assert.equal(res2.idempotentReplay, true);
  assert.equal(admissions.length, 1); // No double admission!
});
