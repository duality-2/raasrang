import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANUAL_CODE_CHARS,
  MANUAL_CODE_LENGTH,
  generateManualCode,
  normaliseManualCode,
  isValidManualCode,
  validatePassInput,
  normaliseName,
  isValidCategory,
  isValidEmail,
  isValidPhone,
} from '../../src/lib/utils.ts';

test('Crockford Base32 Alphabet constraints', () => {
  // Must be exactly 32 characters
  assert.strictEqual(MANUAL_CODE_CHARS.length, 32);
  assert.strictEqual(MANUAL_CODE_LENGTH, 8);

  // Must not contain ambiguous characters 0, O, 1, I
  assert.strictEqual(MANUAL_CODE_CHARS.includes('0'), false);
  assert.strictEqual(MANUAL_CODE_CHARS.includes('O'), false);
  assert.strictEqual(MANUAL_CODE_CHARS.includes('1'), false);
  assert.strictEqual(MANUAL_CODE_CHARS.includes('I'), false);

  // All characters must be unique
  const set = new Set(MANUAL_CODE_CHARS.split(''));
  assert.strictEqual(set.size, 32);
});

test('generateManualCode format and entropy', () => {
  for (let i = 0; i < 20; i++) {
    const code = generateManualCode();
    assert.strictEqual(code.length, 9);
    assert.strictEqual(code[4], '-');
    assert.strictEqual(isValidManualCode(code), true);
  }
});

test('normaliseManualCode cleans messy user input', () => {
  // Lowercase, spaces, hyphens
  assert.strictEqual(normaliseManualCode('cku5-b7gg'), 'CKU5-B7GG');
  assert.strictEqual(normaliseManualCode('CKU5 B7GG'), 'CKU5-B7GG');
  assert.strictEqual(normaliseManualCode('  cku5b7gg  '), 'CKU5-B7GG');
  assert.strictEqual(normaliseManualCode('cku-5-b-7-gg'), 'CKU5-B7GG');

  // Invalid lengths
  assert.strictEqual(normaliseManualCode('SHORT'), '');
  assert.strictEqual(normaliseManualCode('TOOLONG12345'), '');
  assert.strictEqual(normaliseManualCode(''), '');
});

test('isValidManualCode validates Crockford Base32 formatting', () => {
  assert.strictEqual(isValidManualCode('CKU5-B7GG'), true);
  assert.strictEqual(isValidManualCode('7R8B-TZQL'), true);
  assert.strictEqual(isValidManualCode('2345-6789'), true);

  // Invalid: missing hyphen
  assert.strictEqual(isValidManualCode('CKU5B7GG'), false);
  // Invalid: contains excluded char 'O'
  assert.strictEqual(isValidManualCode('CKUO-B7GG'), false);
  // Invalid: contains excluded char '1'
  assert.strictEqual(isValidManualCode('CKU1-B7GG'), false);
  // Invalid: contains lowercase
  assert.strictEqual(isValidManualCode('cku5-b7gg'), false);
});

test('validatePassInput handles both named attendees and unassigned physical tickets', () => {
  // Named attendee
  const named = validatePassInput({
    name: '  Julie Saxena  ',
    category: 'stag_male',
    email: 'julie@example.com',
    phone: '+91 9876543210',
    amount_received: '500',
    payment_mode: 'online',
  });
  assert.strictEqual(named.valid, true);
  assert.strictEqual(named.data?.name, 'Julie Saxena');
  assert.strictEqual(named.data?.category, 'stag_male');
  assert.strictEqual(named.data?.email, 'julie@example.com');
  assert.strictEqual(named.data?.phone, '+919876543210');

  // Unassigned physical ticket (name is optional/null)
  const unassigned = validatePassInput({
    category: 'vip',
    amount_received: 0,
    payment_mode: 'cash',
  });
  assert.strictEqual(unassigned.valid, true);
  assert.strictEqual(unassigned.data?.name, null);
  assert.strictEqual(unassigned.data?.category, 'vip');

  // Ticket generated without category selection (omitted category)
  const noCatSingle = validatePassInput({
    name: 'Julie Saxena',
    phone: '+919876543210',
    party_size: 1,
    amount_received: 300,
    payment_mode: 'cash',
  });
  assert.strictEqual(noCatSingle.valid, true);
  assert.strictEqual(noCatSingle.data?.category, 'complimentary');

  const noCatGroup = validatePassInput({
    name: 'Sharma Family',
    phone: '+919876543210',
    party_size: 5,
    amount_received: 1500,
    payment_mode: 'online',
  });
  assert.strictEqual(noCatGroup.valid, true);
  assert.strictEqual(noCatGroup.data?.category, 'group');

  // Invalid category
  const badCat = validatePassInput({
    category: 'unknown_cat',
  });
  assert.strictEqual(badCat.valid, false);
  assert.strictEqual(Boolean(badCat.errors.category), true);

  // Invalid email
  const badEmail = validatePassInput({
    category: 'couple',
    email: 'not-an-email',
  });
  assert.strictEqual(badEmail.valid, false);
  assert.strictEqual(Boolean(badEmail.errors.email), true);

  // Invalid phone
  const badPhone = validatePassInput({
    category: 'couple',
    phone: '123',
  });
  assert.strictEqual(badPhone.valid, false);
  assert.strictEqual(Boolean(badPhone.errors.phone), true);
});

test('validatePassInput requires and validates amount received and payment mode', () => {
  const ok = validatePassInput({ name: 'Julie Saxena', amount_received: '499.5', payment_mode: 'Online' });
  assert.strictEqual(ok.valid, true);
  assert.strictEqual(ok.data?.amount_received, 499.5);
  assert.strictEqual(ok.data?.payment_mode, 'online');

  const missing = validatePassInput({ name: 'Julie Saxena' });
  assert.strictEqual(missing.valid, false);
  assert.ok(missing.errors.amount_received);
  assert.ok(missing.errors.payment_mode);

  const badMode = validatePassInput({ amount_received: 100, payment_mode: 'cheque' });
  assert.strictEqual(badMode.valid, false);
  assert.ok(badMode.errors.payment_mode);

  const negative = validatePassInput({ amount_received: -10, payment_mode: 'cash' });
  assert.strictEqual(negative.valid, false);
  assert.ok(negative.errors.amount_received);

  const notNumber = validatePassInput({ amount_received: 'abc', payment_mode: 'cash' });
  assert.strictEqual(notNumber.valid, false);
  assert.ok(notNumber.errors.amount_received);
});

test('normaliseName formats proper nouns cleanly', () => {
  assert.strictEqual(normaliseName('john doe'), 'John Doe');
  assert.strictEqual(normaliseName('  PRIYA   SHARMA  '), 'Priya Sharma');
});

test('isValidCategory guards valid enum values', () => {
  assert.strictEqual(isValidCategory('couple'), true);
  assert.strictEqual(isValidCategory('stag_male'), true);
  assert.strictEqual(isValidCategory('stag_female'), true);
  assert.strictEqual(isValidCategory('vip'), true);
  assert.strictEqual(isValidCategory('volunteer'), true);
  assert.strictEqual(isValidCategory('complimentary'), true);
  assert.strictEqual(isValidCategory('group'), true);
  assert.strictEqual(isValidCategory('admin'), false);
  assert.strictEqual(isValidCategory(''), false);
});

test('isValidEmail and isValidPhone direct validation', () => {
  assert.strictEqual(isValidEmail('test@raasrang.com'), true);
  assert.strictEqual(isValidEmail('invalid-email'), false);
  assert.strictEqual(isValidPhone('+919876543210'), true);
  assert.strictEqual(isValidPhone('9876543210'), true);
  assert.strictEqual(isValidPhone('123'), false);
});
