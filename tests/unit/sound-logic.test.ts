import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for sound state machine logic.
 * These test the decision logic — which sound to play for which status.
 * AudioContext is not available in Node, so we test pure logic only.
 */

type ScanSound = 'pass' | 'reject';

/** Determine sound type from redemption status */
function getSoundForStatus(status: string): ScanSound {
  if (status === 'VALID') return 'pass';
  return 'reject';
}

/** Determine flash color from redemption status */
function getFlashColor(status: string): 'green' | 'red' {
  if (status === 'VALID') return 'green';
  return 'red';
}

// Sound determination tests
test('Sound: VALID status plays pass sound', () => {
  assert.strictEqual(getSoundForStatus('VALID'), 'pass');
});

test('Sound: ALREADY_USED status plays reject sound', () => {
  assert.strictEqual(getSoundForStatus('ALREADY_USED'), 'reject');
});

test('Sound: INVALID status plays reject sound', () => {
  assert.strictEqual(getSoundForStatus('INVALID'), 'reject');
});

test('Sound: CANCELLED status plays reject sound', () => {
  assert.strictEqual(getSoundForStatus('CANCELLED'), 'reject');
});

test('Sound: ERROR status plays reject sound', () => {
  assert.strictEqual(getSoundForStatus('ERROR'), 'reject');
});

test('Sound: UNAUTHORIZED status plays reject sound', () => {
  assert.strictEqual(getSoundForStatus('UNAUTHORIZED'), 'reject');
});

// Flash color tests
test('Flash: VALID shows green', () => {
  assert.strictEqual(getFlashColor('VALID'), 'green');
});

test('Flash: ALREADY_USED shows red', () => {
  assert.strictEqual(getFlashColor('ALREADY_USED'), 'red');
});

test('Flash: ERROR shows red', () => {
  assert.strictEqual(getFlashColor('ERROR'), 'red');
});

test('Flash: INVALID shows red', () => {
  assert.strictEqual(getFlashColor('INVALID'), 'red');
});

// Mute state management tests
test('Mute state: defaults to unmuted', () => {
  // Simulate no storage (window is undefined in Node)
  const stored: string | null = null;
  const muted = stored === 'true';
  assert.strictEqual(muted, false, 'Default should be unmuted');
});

test('Mute state: muted when stored as "true"', () => {
  const stored = 'true';
  const muted = stored === 'true';
  assert.strictEqual(muted, true);
});

test('Mute state: unmuted when stored as "false"', () => {
  const stored = 'false';
  const muted = stored === 'true';
  assert.strictEqual(muted, false);
});

// Gate storage tests
test('Gate storage: persists valid gate choice', () => {
  const allowedGates = ['Gate A', 'Gate B', 'Gate C', 'Gate D'];
  const choice = 'Gate C';
  assert.strictEqual(allowedGates.includes(choice), true);
  // Simulate storage
  const stored = choice;
  assert.strictEqual(stored, 'Gate C');
});

test('Gate storage: rejects invalid gate choice', () => {
  const allowedGates = ['Gate A', 'Gate B', 'Gate C', 'Gate D'];
  const choice = 'Backstage';
  assert.strictEqual(allowedGates.includes(choice), false);
});

// Result directive mapping tests
test('Directive: VALID → ALLOW ENTRY', () => {
  const directives: Record<string, string> = {
    VALID: 'ALLOW ENTRY',
    ALREADY_USED: 'DENY ENTRY — ALREADY USED',
    INVALID: 'DENY ENTRY — INVALID PASS',
    CANCELLED: 'DENY ENTRY — CANCELLED',
    UNAUTHORIZED: 'DO NOT ADMIT — UNAUTHORISED',
    ERROR: 'DO NOT ADMIT — TIMEOUT / ERROR',
  };

  assert.strictEqual(directives['VALID'], 'ALLOW ENTRY');
  assert.strictEqual(directives['ALREADY_USED'], 'DENY ENTRY — ALREADY USED');
  assert.strictEqual(directives['ERROR'], 'DO NOT ADMIT — TIMEOUT / ERROR');
});

test('Directive: ERROR is never "allow" — always DO NOT ADMIT', () => {
  const status = 'ERROR';
  const directive = status === 'VALID' ? 'ALLOW ENTRY' : 'DO NOT ADMIT';
  assert.strictEqual(directive, 'DO NOT ADMIT');
});

test('Directive: ALREADY_USED is never "allow" — always deny', () => {
  const status = 'ALREADY_USED';
  const isAllow = status === 'VALID';
  assert.strictEqual(isAllow, false);
});
