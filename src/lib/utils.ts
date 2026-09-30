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
 * Phone validation: digits, optional leading +, 7-15 characters.
 */
export function isValidPhone(phone: string): boolean {
  return /^\+?\d{7,15}$/.test(phone.replace(/[\s\-()]/g, ''));
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  data?: {
    name: string | null;
    category: PassCategory;
    email: string | null;
    phone: string | null;
  };
}

/**
 * Server-side validation for pass creation input.
 * Attendee name is optional (null for unassigned physical tickets).
 */
export function validatePassInput(input: {
  name?: string;
  category?: string;
  email?: string;
  phone?: string;
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

  // Category
  const rawCategory = (input.category ?? '').trim();
  if (!rawCategory) {
    errors.category = 'Category is required.';
  } else if (!isValidCategory(rawCategory)) {
    errors.category = 'Invalid category.';
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
      errors.phone = 'Invalid phone number (7-15 digits, optional leading +).';
    } else {
      phone = rawPhone.replace(/[\s\-()]/g, '');
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    data: {
      name,
      category: rawCategory as PassCategory,
      email,
      phone,
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
