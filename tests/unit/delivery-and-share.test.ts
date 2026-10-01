import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInternationalPhone,
  getWhatsAppShareText,
  isAutomatedWhatsAppBlocked,
} from '../../src/lib/delivery-utils.ts';
import type { Pass } from '../../src/types/index.ts';

test('Phone formatting: prepends +91 for standard 10-digit Indian mobile numbers', async () => {
  const res1 = await validateInternationalPhone('9876543210');
  assert.equal(res1.valid, true);
  assert.equal(res1.formatted, '+919876543210');

  const res2 = await validateInternationalPhone('+91 98765 43210');
  assert.equal(res2.valid, true);
  assert.equal(res2.formatted, '+919876543210');

  const res3 = await validateInternationalPhone('123'); // Invalid length
  assert.equal(res3.valid, false);
});

test('WhatsApp share text: contains event details, party size, manual code, and attachment reminder', async () => {
  const singlePass: Pass = {
    id: 'pass_test_1',
    token: 'tok_abc123',
    manual_code: '7R8B-TZQL',
    name: 'Rahul Sharma',
    category: 'stag_male',
    ticket_type: 'single',
    party_size: 4,
    status: 'unused',
    created_at: new Date().toISOString(),
    created_by: 'user_1',
    delivery_status: 'ready_to_share',
  };

  const text = await getWhatsAppShareText(singlePass);
  assert.ok(text.includes('Rahul Sharma'));
  assert.ok(text.includes('7R8B-TZQL'));
  assert.ok(text.includes('Party Allowance:* 4 Persons'));
  assert.ok(text.includes('Attach the official PDF ticket'));

  const seasonalPass: Pass = {
    ...singlePass,
    ticket_type: 'seasonal',
    seasonal_nights_count: 9,
  };
  const seasonalText = await getWhatsAppShareText(seasonalPass);
  assert.ok(seasonalText.includes('Seasonal Pass'));
  assert.ok(seasonalText.includes('9 Nights'));
});

test('Automated WhatsApp API: returns BLOCKED status as required by release invariants', () => {
  const result = isAutomatedWhatsAppBlocked();
  assert.equal(result.blocked, true);
  assert.ok(result.reason.includes('BLOCKED'));
});
