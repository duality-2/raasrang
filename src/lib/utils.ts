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
    name: string;
    category: PassCategory;
    email: string | null;
    phone: string | null;
  };
}

/**
 * Server-side validation for pass creation input.
 */
export function validatePassInput(input: {
  name?: string;
  category?: string;
  email?: string;
  phone?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Name
  const rawName = (input.name ?? '').trim();
  if (!rawName) {
    errors.name = 'Name is required.';
  } else if (rawName.length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  } else if (rawName.length > 200) {
    errors.name = 'Name must be at most 200 characters.';
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
      name: normaliseName(rawName),
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
