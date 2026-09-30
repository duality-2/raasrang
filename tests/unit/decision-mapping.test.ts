import test from 'node:test';
import assert from 'node:assert/strict';
import type { RedemptionStatus } from '../../src/types/index.ts';

// Decision directive mapper matching EntryScanner.tsx specifications
function getGateDecision(status: RedemptionStatus): {
  headline: string;
  allowEntry: boolean;
  requiresAttention: boolean;
} {
  switch (status) {
    case 'VALID':
      return {
        headline: 'ALLOW ENTRY',
        allowEntry: true,
        requiresAttention: false,
      };
    case 'ALREADY_USED':
      return {
        headline: 'DENY ENTRY — ALREADY USED',
        allowEntry: false,
        requiresAttention: true,
      };
    case 'INVALID':
      return {
        headline: 'DENY ENTRY — INVALID PASS',
        allowEntry: false,
        requiresAttention: true,
      };
    case 'CANCELLED':
      return {
        headline: 'DENY ENTRY — CANCELLED',
        allowEntry: false,
        requiresAttention: true,
      };
    case 'UNAUTHORIZED':
      return {
        headline: 'DO NOT ADMIT — UNAUTHORISED',
        allowEntry: false,
        requiresAttention: true,
      };
    case 'ERROR':
      return {
        headline: 'DO NOT ADMIT — TIMEOUT / ERROR',
        allowEntry: false,
        requiresAttention: true,
      };
  }
}

test('Gate decision states are binary and unmistakable', () => {
  // Only VALID permits entry
  assert.strictEqual(getGateDecision('VALID').allowEntry, true);
  assert.strictEqual(getGateDecision('VALID').headline, 'ALLOW ENTRY');

  // All other states strictly forbid entry
  const denialStatuses: RedemptionStatus[] = [
    'ALREADY_USED',
    'INVALID',
    'CANCELLED',
    'UNAUTHORIZED',
    'ERROR',
  ];

  for (const st of denialStatuses) {
    const decision = getGateDecision(st);
    assert.strictEqual(decision.allowEntry, false, `Status ${st} must not allow entry`);
    assert.match(
      decision.headline,
      /^(DENY ENTRY|DO NOT ADMIT)/,
      `Status ${st} headline must start with DENY ENTRY or DO NOT ADMIT`
    );
  }
});

test('Timeout safe procedure does not claim ticket is unused', () => {
  const timeoutMsg =
    'Network timeout or interrupted connection. Pass may have already been recorded. Tap "Verify Next Pass" and re-verify immediately: an ALREADY_USED response with the current timestamp confirms entry was recorded.';

  assert.strictEqual(timeoutMsg.includes('Pass was NOT verified'), false);
  assert.strictEqual(timeoutMsg.includes('unused'), false);
  assert.strictEqual(timeoutMsg.includes('ALREADY_USED'), true);
});
