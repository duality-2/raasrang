import { test } from 'node:test';
import assert from 'node:assert';
import {
  signPersistentSession,
  verifyPersistentSession,
  getPersistentSessionFromCookies,
  PERSISTENT_SESSION_COOKIE,
  PERPETUAL_COOKIE_MAX_AGE,
} from '../../src/lib/session.ts';


test('Session Persistence: Generates valid HMAC-SHA256 signed persistent session token', async () => {
  const token = await signPersistentSession({
    userId: 'usr_admin_123',
    email: 'admin@raasrang.com',
    role: 'admin',
  });

  assert.ok(token, 'Token must not be empty');
  assert.strictEqual(typeof token, 'string');
  const parts = token.split('.');
  assert.strictEqual(parts.length, 2, 'Token must have exactly payload.signature format');

  const verified = await verifyPersistentSession(token);
  assert.ok(verified, 'Verification must succeed for valid token');
  assert.strictEqual(verified.userId, 'usr_admin_123');
  assert.strictEqual(verified.email, 'admin@raasrang.com');
  assert.strictEqual(verified.role, 'admin');
  assert.ok(verified.createdAt > 0, 'createdAt must be a valid timestamp');
});

test('Session Persistence: Works seamlessly for all roles (admin, scanner, ticketer)', async () => {
  const roles = ['admin', 'scanner', 'ticketer'] as const;

  for (const role of roles) {
    const token = await signPersistentSession({
      userId: `usr_${role}_456`,
      email: `${role}@raasrang.com`,
      role,
    });

    const session = await verifyPersistentSession(token);
    assert.ok(session, `Session verification failed for role ${role}`);
    assert.strictEqual(session.role, role);
    assert.strictEqual(session.email, `${role}@raasrang.com`);
  }
});

test('Session Persistence: Tamper Resistance — Rejects payload modifications', async () => {
  const token = await signPersistentSession({
    userId: 'usr_scanner_789',
    email: 'scanner@raasrang.com',
    role: 'scanner',
  });

  const [payloadStr, sig] = token.split('.');
  // Decode payload, modify role from 'scanner' to 'admin', and re-encode
  const decoded = JSON.parse(Buffer.from(payloadStr, 'base64').toString('utf8'));
  decoded.role = 'admin';
  const tamperedPayload = Buffer.from(JSON.stringify(decoded))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const tamperedToken = `${tamperedPayload}.${sig}`;
  const result = await verifyPersistentSession(tamperedToken);

  assert.strictEqual(result, null, 'Tampered payload must be rejected');
});

test('Session Persistence: Tamper Resistance — Rejects signature modifications', async () => {
  const token = await signPersistentSession({
    userId: 'usr_admin_999',
    email: 'admin@raasrang.com',
    role: 'admin',
  });

  const [payloadStr, sig] = token.split('.');
  // Flip characters in signature
  const tamperedSig = sig.slice(0, -4) + '0000';
  const tamperedToken = `${payloadStr}.${tamperedSig}`;

  const result = await verifyPersistentSession(tamperedToken);
  assert.strictEqual(result, null, 'Tampered signature must be rejected');
});

test('Session Persistence: Rejects invalid, empty, or garbage input', async () => {
  assert.strictEqual(await verifyPersistentSession(null), null);
  assert.strictEqual(await verifyPersistentSession(undefined), null);
  assert.strictEqual(await verifyPersistentSession(''), null);
  assert.strictEqual(await verifyPersistentSession('invalid-token-no-dots'), null);
  assert.strictEqual(await verifyPersistentSession('a.b.c'), null);
});

test('Session Persistence: Cookie extraction handles multiple container formats', async () => {
  const token = await signPersistentSession({
    userId: 'usr_ticketer_111',
    email: 'ticketer@raasrang.com',
    role: 'ticketer',
  });

  // 1. Next.js RequestCookies / cookieStore object with .get()
  const mockCookieStore = {
    get(name: string) {
      if (name === PERSISTENT_SESSION_COOKIE) {
        return { name, value: token };
      }
      return undefined;
    },
  };
  const sessionFromStore = await getPersistentSessionFromCookies(mockCookieStore);
  assert.ok(sessionFromStore);
  assert.strictEqual(sessionFromStore.userId, 'usr_ticketer_111');
  assert.strictEqual(sessionFromStore.role, 'ticketer');

  // 2. Array of cookie objects (getAll() format)
  const mockArray = [
    { name: 'other_cookie', value: '123' },
    { name: PERSISTENT_SESSION_COOKIE, value: token },
  ];
  const sessionFromArray = await getPersistentSessionFromCookies(mockArray);
  assert.ok(sessionFromArray);
  assert.strictEqual(sessionFromArray.userId, 'usr_ticketer_111');

  // 3. Plain key-value dictionary
  const mockDict = {
    [PERSISTENT_SESSION_COOKIE]: token,
  };
  const sessionFromDict = await getPersistentSessionFromCookies(mockDict);
  assert.ok(sessionFromDict);
  assert.strictEqual(sessionFromDict.userId, 'usr_ticketer_111');
});


test('Session Persistence: Lifetime is guaranteed for 10 years (perpetual)', () => {
  // 10 years = ~315,360,000 seconds
  assert.strictEqual(PERPETUAL_COOKIE_MAX_AGE, 315360000);
  assert.ok(
    PERPETUAL_COOKIE_MAX_AGE >= 10 * 365 * 24 * 3600,
    'Cookie maxAge must be at least 10 years'
  );
});
