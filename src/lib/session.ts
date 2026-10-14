import type { UserRole } from '@/types';
import {
  PERSISTENT_SESSION_COOKIE,
  PERPETUAL_COOKIE_MAX_AGE,
} from './session-constants.ts';


export { PERSISTENT_SESSION_COOKIE, PERPETUAL_COOKIE_MAX_AGE };

export interface PersistentSessionData {
  userId: string;
  email: string;
  role: UserRole;
  createdAt: number;
}

/**
 * Returns the secret key used for HMAC signing of perpetual session cookies.
 * Uses SUPABASE_SERVICE_ROLE_KEY or a secure fallback.
 */
function getSigningSecret(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SESSION_SECRET ||
    'raasrang-perpetual-session-secret-2026'
  );
}

/**
 * Standard Web-compatible Base64URL encoder
 */
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Standard Web-compatible Base64URL decoder
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Convert Uint8Array to hex string
 */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (isNaN(byte)) return null;
    bytes[i / 2] = byte;
  }
  return bytes;
}

/**
 * Import HMAC key via Web Crypto API (supported in Node.js, Browsers, and Edge Runtime)
 */
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Cryptographically sign persistent session data using HMAC-SHA256.
 * Format: <base64url_payload>.<hmac_signature_hex>
 */
export async function signPersistentSession(data: {
  userId: string;
  email: string;
  role: UserRole;
}): Promise<string> {
  const payload: PersistentSessionData = {
    userId: data.userId,
    email: data.email,
    role: data.role,
    createdAt: Date.now(),
  };

  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const key = await getCryptoKey(getSigningSecret());
  const sigBuffer = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadStr)
  );

  const hmacHex = toHex(sigBuffer);
  return `${payloadStr}.${hmacHex}`;
}

/**
 * Verify and decode a persistent session token using Web Crypto constant-time verification.
 * Returns the session data if valid and untampered, or null if invalid.
 */
export async function verifyPersistentSession(
  token: string | null | undefined
): Promise<PersistentSessionData | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadStr, signatureHex] = parts;
  if (!payloadStr || !signatureHex) {
    return null;
  }

  try {
    const key = await getCryptoKey(getSigningSecret());
    const sigBytes = fromHex(signatureHex);
    if (!sigBytes) return null;

    const isValid = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      new TextEncoder().encode(payloadStr)
    );

    if (!isValid) {
      return null;
    }

    const json = JSON.parse(base64UrlDecode(payloadStr));
    if (!json.userId || !json.email || !json.role) {
      return null;
    }

    // Role must be a valid UserRole
    if (json.role !== 'admin' && json.role !== 'scanner' && json.role !== 'ticketer') {
      return null;
    }

    return {
      userId: String(json.userId),
      email: String(json.email),
      role: json.role as UserRole,
      createdAt: Number(json.createdAt) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Extract and verify persistent session data from various cookie containers
 * (NextRequest.cookies, ReadonlyRequestCookies, array of cookies, or string map).
 */
export async function getPersistentSessionFromCookies(
  cookieContainer: any
): Promise<PersistentSessionData | null> {
  if (!cookieContainer) return null;

  let rawValue: string | undefined;

  if (typeof cookieContainer.get === 'function') {
    const cookie = cookieContainer.get(PERSISTENT_SESSION_COOKIE);
    rawValue = typeof cookie === 'object' && cookie !== null ? cookie.value : cookie;
  } else if (Array.isArray(cookieContainer)) {
    const item = cookieContainer.find((c: any) => c.name === PERSISTENT_SESSION_COOKIE);
    rawValue = item?.value;
  } else if (typeof cookieContainer === 'object') {
    rawValue = cookieContainer[PERSISTENT_SESSION_COOKIE];
  }

  if (!rawValue) return null;
  return await verifyPersistentSession(rawValue);
}

/**
 * Set the perpetual persistent session cookie in cookieStore (Server Action or Route Handler).
 */
export async function setPersistentSessionCookie(
  cookieStore: any,
  data: { userId: string; email: string; role: UserRole }
) {
  const token = await signPersistentSession(data);
  cookieStore.set(PERSISTENT_SESSION_COOKIE, token, {
    maxAge: PERPETUAL_COOKIE_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Explicitly clear the perpetual persistent session cookie (only on manual user sign out).
 */
export function clearPersistentSessionCookie(cookieStore: any) {
  try {
    cookieStore.set(PERSISTENT_SESSION_COOKIE, '', {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  } catch {
    // Ignore in contexts where cookies are immutable
  }
}
