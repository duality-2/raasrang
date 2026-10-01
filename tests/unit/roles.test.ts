import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for role boundaries and permission enforcement.
 * Tests:
 * 1. Role determination logic and tamper-resistance (app_metadata vs user_metadata).
 * 2. Route permission matrix (scanner allowed vs organiser-only).
 * 3. Scanner password strength validation.
 */

// Route authorization matcher for scanner
const SCANNER_ALLOWED_PATHS = [
  '/dashboard/verify',
  '/dashboard/gate-list',
];

function isScannerAllowed(pathname: string): boolean {
  const cleanPath = pathname.split('?')[0];
  return SCANNER_ALLOWED_PATHS.some(
    (allowed) => cleanPath === allowed || cleanPath.startsWith(allowed + '/')
  );
}

// Role resolution logic (pure function model of auth.ts)
function determineRole(
  isOrganiserUser: boolean,
  appMetadata?: Record<string, unknown>,
  userMetadata?: Record<string, unknown>
): 'organiser' | 'scanner' | null {
  // 1. Organisers allowlist is always authoritative
  if (isOrganiserUser) {
    return 'organiser';
  }

  // 2. Client-updatable user_metadata is NEVER trusted for role assignment
  // Even if an attacker passes { role: 'scanner' } or { role: 'organiser' } in user_metadata,
  // it must have zero effect.
  if (userMetadata?.role && !appMetadata?.role) {
    return null;
  }

  // 3. Server-controlled app_metadata
  if (appMetadata?.role === 'scanner') {
    return 'scanner';
  }

  return null;
}

// Password policy validator
export interface PasswordValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateScannerPassword(password?: string): PasswordValidationResult {
  const warnings: string[] = [];
  if (!password) {
    return { valid: false, warnings: ['SCANNER_PASSWORD is empty or not set.'] };
  }
  if (password.length < 12) {
    warnings.push(`Password length is ${password.length} characters (minimum required is 12).`);
  }
  if (!/[a-z]/.test(password)) {
    warnings.push('Password must include at least one lowercase character (a-z).');
  }
  if (!/[A-Z]/.test(password)) {
    warnings.push('Password must include at least one uppercase character (A-Z).');
  }
  if (!/[0-9]/.test(password)) {
    warnings.push('Password must include at least one number (0-9).');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    warnings.push('Password must include at least one symbol or special character.');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

test('Role: Organiser allowlist user is always organiser', () => {
  assert.strictEqual(determineRole(true, { role: 'scanner' }), 'organiser');
  assert.strictEqual(determineRole(true, {}), 'organiser');
  assert.strictEqual(determineRole(true, undefined), 'organiser');
});

test('Role: Scanner user resolved only via app_metadata', () => {
  assert.strictEqual(determineRole(false, { role: 'scanner' }), 'scanner');
  assert.strictEqual(determineRole(false, { role: 'other' }), null);
  assert.strictEqual(determineRole(false, {}), null);
  assert.strictEqual(determineRole(false, undefined), null);
});

test('Role: Tamper resistance — user_metadata cannot grant scanner or organiser role', () => {
  // Attacker sets user_metadata via supabase.auth.updateUser()
  const forgedUserMetadata = { role: 'scanner' };
  assert.strictEqual(
    determineRole(false, undefined, forgedUserMetadata),
    null,
    'user_metadata must never grant scanner role'
  );

  const forgedOrgMetadata = { role: 'organiser' };
  assert.strictEqual(
    determineRole(false, undefined, forgedOrgMetadata),
    null,
    'user_metadata must never grant organiser role'
  );
});

test('Permissions: Scanner allowed routes', () => {
  assert.strictEqual(isScannerAllowed('/dashboard/verify'), true);
  assert.strictEqual(isScannerAllowed('/dashboard/verify/camera'), true);
  assert.strictEqual(isScannerAllowed('/dashboard/gate-list'), true);
  assert.strictEqual(isScannerAllowed('/dashboard/gate-list?tab=used'), true);
});

test('Permissions: Scanner blocked from organiser-only routes', () => {
  assert.strictEqual(isScannerAllowed('/dashboard'), false);
  assert.strictEqual(isScannerAllowed('/dashboard/batches'), false);
  assert.strictEqual(isScannerAllowed('/dashboard/batches/new'), false);
  assert.strictEqual(isScannerAllowed('/dashboard/batches/batch-123/print'), false);
  assert.strictEqual(isScannerAllowed('/dashboard/add'), false);
  assert.strictEqual(isScannerAllowed('/dashboard/passes/pass-123'), false);
  assert.strictEqual(isScannerAllowed('/dashboard/export'), false);
});

test('Scanner Password Policy: Rejects short and weak passwords', () => {
  const short = validateScannerPassword('short123!');
  assert.strictEqual(short.valid, false);
  assert.ok(short.warnings.some(w => w.includes('minimum required is 12')));

  const noUpper = validateScannerPassword('lowercase12345!@#');
  assert.strictEqual(noUpper.valid, false);
  assert.ok(noUpper.warnings.some(w => w.includes('uppercase')));

  const noDigit = validateScannerPassword('NoDigitsHereAtAll!@#');
  assert.strictEqual(noDigit.valid, false);
  assert.ok(noDigit.warnings.some(w => w.includes('number')));

  const noSymbol = validateScannerPassword('NoSymbolsHere123456');
  assert.strictEqual(noSymbol.valid, false);
  assert.ok(noSymbol.warnings.some(w => w.includes('symbol')));

  const strong = validateScannerPassword('RaasRang2026!GateScanner');
  assert.strictEqual(strong.valid, true);
  assert.strictEqual(strong.warnings.length, 0);
});
