import crypto from 'crypto';
import type { PassCategory } from '@/types';

const VALID_CATEGORIES: PassCategory[] = [
  'couple',
  'stag_male',
  'stag_female',
  'group',
  'vip',
  'volunteer',
  'complimentary',
];

/**
 * Crockford-style base32 charset excluding confusing characters: 0, O, 1, I.
 * Exactly 32 characters: 8 digits (2-9) + 24 uppercase letters.
 */
export const MANUAL_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const MANUAL_CODE_LENGTH = 8;

// Safety assertion to guarantee modulo math matches the alphabet length exactly
if (MANUAL_CODE_CHARS.length !== 32) {
  throw new Error(
    `Manual code configuration mismatch: expected 32 characters, found ${MANUAL_CODE_CHARS.length}`
  );
}

/**
 * Generate a cryptographically secure 8-character manual code formatted as XXXX-XXXX.
 */
export function generateManualCode(): string {
  const bytes = crypto.randomBytes(MANUAL_CODE_LENGTH);
  const alphabetLen = MANUAL_CODE_CHARS.length;
  let code = '';
  for (let i = 0; i < MANUAL_CODE_LENGTH; i++) {
    code += MANUAL_CODE_CHARS[bytes[i] % alphabetLen];
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

/**
 * Normalise manual code input into the canonical XXXX-XXXX stored representation.
 * Strips whitespace, hyphens, and non-alphanumerics, converts to uppercase.
 * Returns empty string if the cleaned length is not exactly 8 characters.
 */
export function normaliseManualCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== MANUAL_CODE_LENGTH) {
    return '';
  }
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
}

/**
 * Validate that a code matches the canonical XXXX-XXXX pattern using the allowed alphabet.
 */
export function isValidManualCode(code: string): boolean {
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(
    code
  );
}

/**
 * Normalise a name: trim whitespace, collapse multiple spaces,
 * title-case each word.
 */
export function normaliseName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Validate that a category string is one of the known enum values.
 */
export function isValidCategory(value: string): value is PassCategory {
  return VALID_CATEGORIES.includes(value as PassCategory);
}

/**
 * Basic email validation (RFC-5322-ish).
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Phone validation: 10 digits for Indian mobile numbers.
 */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/[^0-9]/g, '');
  return /^[6-9]\d{9}$/.test(digits);
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  data?: {
    name: string | null;
    category: PassCategory;
    email: string | null;
    phone: string | null;
    ticket_type: 'single' | 'seasonal';
    party_size: number;
    seasonal_start_night_id: string | null;
    seasonal_nights_count: number | null;
    idempotency_key: string | null;
  };
}

/**
 * Server-side validation for pass creation input.
 * Supports single and seasonal passes, party sizes 1-10, and idempotency keys.
 */
export function validatePassInput(input: {
  name?: string;
  category?: string;
  email?: string;
  phone?: string;
  ticket_type?: string;
  party_size?: number | string;
  seasonal_start_night_id?: string;
  seasonal_nights_count?: number | string;
  idempotency_key?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Name (optional for unassigned physical tickets)
  const rawName = (input.name ?? '').trim();
  let name: string | null = null;
  if (rawName) {
    if (rawName.length < 2) {
      errors.name = 'Name must be at least 2 characters.';
    } else if (rawName.length > 200) {
      errors.name = 'Name must be at most 200 characters.';
    } else {
      name = normaliseName(rawName);
    }
  }

  // Ticket Type
  const rawType = (input.ticket_type ?? 'single').trim().toLowerCase();
  let ticket_type: 'single' | 'seasonal' = 'single';
  if (rawType === 'seasonal') {
    ticket_type = 'seasonal';
  } else if (rawType !== 'single') {
    errors.ticket_type = 'Ticket type must be single or seasonal.';
  }

  // Party Size (1 to 10)
  const rawPartySize = Number(input.party_size ?? 1);
  let party_size = 1;
  if (isNaN(rawPartySize) || rawPartySize < 1 || rawPartySize > 10) {
    errors.party_size = 'Party size must be between 1 and 10.';
  } else {
    party_size = Math.floor(rawPartySize);
  }

  // Category (optional when generating tickets; safely defaults for database constraint)
  let category: PassCategory = party_size > 1 ? 'group' : 'complimentary';
  const rawCategory = (input.category ?? '').trim();
  if (rawCategory) {
    if (!isValidCategory(rawCategory)) {
      errors.category = 'Invalid category.';
    } else {
      category = rawCategory as PassCategory;
    }
  }

  // Seasonal Night Config
  let seasonal_start_night_id: string | null = null;
  let seasonal_nights_count: number | null = null;
  if (ticket_type === 'seasonal') {
    seasonal_start_night_id = (input.seasonal_start_night_id ?? 'night_1').trim();
    const rawNightsCount = Number(input.seasonal_nights_count ?? 9);
    if (isNaN(rawNightsCount) || rawNightsCount < 1 || rawNightsCount > 9) {
      errors.seasonal_nights_count = 'Seasonal pass nights must be between 1 and 9.';
    } else {
      seasonal_nights_count = Math.floor(rawNightsCount);
    }
  }

  // Email (optional)
  const rawEmail = (input.email ?? '').trim();
  let email: string | null = null;
  if (rawEmail) {
    if (!isValidEmail(rawEmail)) {
      errors.email = 'Invalid email address.';
    } else {
      email = rawEmail.toLowerCase();
    }
  }

  // Phone (optional)
  const rawPhone = (input.phone ?? '').trim();
  let phone: string | null = null;
  if (rawPhone) {
    if (!isValidPhone(rawPhone)) {
      errors.phone = 'Invalid Indian mobile number (must be 10 digits).';
    } else {
      const digits = rawPhone.replace(/[^0-9]/g, '');
      phone = '+91' + digits; // Normalize to E.164 format
    }
  }

  // Idempotency key (optional)
  const idempotency_key = (input.idempotency_key ?? '').trim() || null;

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    data: {
      name,
      category,
      email,
      phone,
      ticket_type,
      party_size,
      seasonal_start_night_id,
      seasonal_nights_count,
      idempotency_key,
    },
  };
}

/**
 * Format an ISO date string for display.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface PasswordValidationResult {
  valid: boolean;
  warnings: string[];
}

/**
 * Validates password strength for security-sensitive roles like scanner.
 * Enforces >= 12 chars, upper, lower, digit, and special char.
 */
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
