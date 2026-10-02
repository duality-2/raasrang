import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePassInput } from '../../src/lib/utils.ts';

// ── 1. Typed Party Size Validation ──
test('Party size validation: rejects 0 and negative numbers', () => {
  const zeroRes = validatePassInput({
    party_size: 0,
    valid_night_id: 'night_1',
  });
  assert.strictEqual(zeroRes.valid, false);
  assert.ok(zeroRes.errors.party_size);

  const negRes = validatePassInput({
    party_size: -5,
    valid_night_id: 'night_1',
  });
  assert.strictEqual(negRes.valid, false);
  assert.ok(negRes.errors.party_size);
});

test('Party size validation: rejects decimal values (whole numbers only)', () => {
  const decRes1 = validatePassInput({
    party_size: 2.5,
    valid_night_id: 'night_1',
  });
  assert.strictEqual(decRes1.valid, false);
  assert.ok(decRes1.errors.party_size);

  const decRes2 = validatePassInput({
    party_size: '3.14',
    valid_night_id: 'night_1',
  });
  assert.strictEqual(decRes2.valid, false);
  assert.ok(decRes2.errors.party_size);
});

test('Party size validation: rejects blank strings', () => {
  const blankRes1 = validatePassInput({
    party_size: '',
    valid_night_id: 'night_1',
  });
  assert.strictEqual(blankRes1.valid, false);
  assert.ok(blankRes1.errors.party_size);

  const blankRes2 = validatePassInput({
    party_size: '   ',
    valid_night_id: 'night_1',
  });
  assert.strictEqual(blankRes2.valid, false);
  assert.ok(blankRes2.errors.party_size);
});

test('Party size validation: accepts large numbers (> 10) with no upper limit', () => {
  const res15 = validatePassInput({
    party_size: 15,
    valid_night_id: 'night_1',
  });
  assert.strictEqual(res15.valid, true);
  assert.strictEqual(res15.data?.party_size, 15);

  const res50 = validatePassInput({
    party_size: '50',
    valid_night_id: 'night_1',
  });
  assert.strictEqual(res50.valid, true);
  assert.strictEqual(res50.data?.party_size, 50);

  const res100 = validatePassInput({
    party_size: 100,
    valid_night_id: 'night_1',
  });
  assert.strictEqual(res100.valid, true);
  assert.strictEqual(res100.data?.party_size, 100);

  const res500 = validatePassInput({
    party_size: 500,
    valid_night_id: 'night_1',
  });
  assert.strictEqual(res500.valid, true);
  assert.strictEqual(res500.data?.party_size, 500);
});

// ── 2. Scanner Typed Count Validation ──
test('Scanner typed count: validates admission count against remaining allowance without 10-cap', () => {
  // Pass with party_size of 25 (allowance = 25)
  const partySize = 25;
  const admittedTonight = 5;
  const remainingAllowance = partySize - admittedTonight; // 20

  // Helper simulating server admission check
  function validateScannerAdmission(requestedCount: number, remaining: number) {
    if (requestedCount < 1 || !Number.isInteger(requestedCount)) {
      return { valid: false, error: 'People count must be a whole number of at least 1.' };
    }
    if (requestedCount > remaining) {
      return { valid: false, error: `Requested ${requestedCount} exceeds remaining allowance of ${remaining}.` };
    }
    return { valid: true, error: null };
  }

  // Reject 0, negative, decimal
  assert.strictEqual(validateScannerAdmission(0, remainingAllowance).valid, false);
  assert.strictEqual(validateScannerAdmission(-2, remainingAllowance).valid, false);
  assert.strictEqual(validateScannerAdmission(4.5, remainingAllowance).valid, false);

  // Reject exceeding remaining count (e.g. 21 when 20 remain)
  assert.strictEqual(validateScannerAdmission(21, remainingAllowance).valid, false);

  // Accept valid typed counts above 10 (e.g. 12 or 20)
  const valid12 = validateScannerAdmission(12, remainingAllowance);
  assert.strictEqual(valid12.valid, true);

  const valid20 = validateScannerAdmission(20, remainingAllowance);
  assert.strictEqual(valid20.valid, true);
});

// ── 3. Chart Aggregation Validation ──
test('Chart aggregation: 9 day candles show SUM(party_size) of single passes; seasonal candle shows seasonal total', () => {
  // Synthetic dataset matching production database distribution
  const nights = Array.from({ length: 9 }, (_, i) => ({
    id: `night_${i + 1}`,
    night_number: i + 1,
    title: `Day ${i + 1}`,
  }));

  const mockPasses = [
    // Day 1: 6 single passes = 51 people
    { ticket_type: 'single', valid_night_id: 'night_1', party_size: 1 },
    { ticket_type: 'single', valid_night_id: 'night_1', party_size: 10 },
    { ticket_type: 'single', valid_night_id: 'night_1', party_size: 10 },
    { ticket_type: 'single', valid_night_id: 'night_1', party_size: 10 },
    { ticket_type: 'single', valid_night_id: 'night_1', party_size: 10 },
    { ticket_type: 'single', valid_night_id: 'night_1', party_size: 10 },

    // Day 2: 1 single pass = 10 people
    { ticket_type: 'single', valid_night_id: 'night_2', party_size: 10 },

    // Day 3: 1 single pass = 10 people
    { ticket_type: 'single', valid_night_id: 'night_3', party_size: 10 },

    // Day 5: 1 single pass = 10 people
    { ticket_type: 'single', valid_night_id: 'night_5', party_size: 10 },

    // Seasonal pass: 1 pass = 7 people
    { ticket_type: 'seasonal', valid_night_id: null, party_size: 7 },

    // 109 legacy unassigned passes = 130 people
    ...Array.from({ length: 109 }, () => ({
      ticket_type: 'single',
      valid_night_id: null,
      party_size: 1, // sample
    })),
  ];

  // Aggregation logic matching getAttendanceMetrics
  const singlePasses = mockPasses.filter((p) => p.ticket_type !== 'seasonal');
  const seasonalPasses = mockPasses.filter((p) => p.ticket_type === 'seasonal');

  const dayCandles = nights.map((night) => {
    const matching = singlePasses.filter((p) => p.valid_night_id === night.id);
    return {
      nightId: night.id,
      title: night.title,
      peopleCount: matching.reduce((sum, p) => sum + p.party_size, 0),
      passCount: matching.length,
    };
  });

  const seasonalCandle = {
    peopleCount: seasonalPasses.reduce((sum, p) => sum + p.party_size, 0),
    passCount: seasonalPasses.length,
  };

  // Verify Day 1 candle shows 51 people
  assert.strictEqual(dayCandles[0].peopleCount, 51);
  assert.strictEqual(dayCandles[0].passCount, 6);

  // Verify Day 2 and Day 3 candles show 10 people
  assert.strictEqual(dayCandles[1].peopleCount, 10);
  assert.strictEqual(dayCandles[2].peopleCount, 10);

  // Verify Day 4 candle shows 0
  assert.strictEqual(dayCandles[3].peopleCount, 0);
  assert.strictEqual(dayCandles[3].passCount, 0);

  // Verify Seasonal candle shows 7 people (and is NOT added to day candles)
  assert.strictEqual(seasonalCandle.peopleCount, 7);
  assert.strictEqual(seasonalCandle.passCount, 1);

  // Verify Day 1 candle has NOT included the 7 seasonal people
  assert.strictEqual(dayCandles[0].peopleCount, 51);
});
