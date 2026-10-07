import type { Pass, EventNight } from '../types/index.ts';

/**
 * Validates Indian mobile number (10 digits, starts with 6-9).
 * Always returns E.164 format: +91XXXXXXXXXX
 */
export function validateIndianPhone(raw: string): { valid: boolean; formatted: string; display: string } {
  // Strip everything that isn't a digit
  let digits = raw.replace(/[^0-9]/g, '');

  // Remove leading country code if present
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  const isValid = /^[6-9]\d{9}$/.test(digits);
  const formatted = '+91' + digits;
  // Display format: +91 XXXXX XXXXX
  const display = isValid ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : raw;

  return { valid: isValid, formatted, display };
}

/**
 * Normalise paste input for the phone field.
 * Strips +91, 91, 0 prefix and non-digit chars, returns just the 10 digits.
 */
export function normalisePhoneInput(raw: string): string {
  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

/**
 * Build the ordinal suffix for a number (1st, 2nd, 3rd, 4th, …)
 */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Build a shareable message for a ticket.
 * Used by WhatsApp, Email, and Copy Message flows.
 *
 * NOTE: wa.me links cannot attach files. This is stated in the UI.
 */
export function buildTicketMessage(pass: Pass, night?: EventNight | null): string {
  const isSeasonal = pass.ticket_type === 'seasonal';

  let dateLabel: string;
  if (isSeasonal) {
    dateLabel = '*Dates:* All 9 Nights of Navratri (See ticket)';
  } else if (night) {
    const d = new Date(night.event_date + 'T00:00:00+05:30');
    const formatter = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', weekday: 'long' });
    const parts = formatter.formatToParts(d);
    const day = parts.find(p => p.type === 'day')?.value || '1';
    const month = parts.find(p => p.type === 'month')?.value || 'October';
    const weekday = parts.find(p => p.type === 'weekday')?.value || 'Sunday';
    dateLabel = `*Date:* ${ordinal(parseInt(day))} of ${month} ${weekday}`;
  } else {
    dateLabel = '*Date:* See ticket for details';
  }

  return (
    `Thank you for booking your pass for RAAS RANG 2026!\n\n` +
    `Your ticket PDF is attached below.\n` +
    `Please keep it safely saved on your phone and present the QR code at the entry.\n\n` +
    `${dateLabel}\n` +
    `*Time:* 6 PM onwards\n` +
    `*Venue:* Saxena Dream Lawns gandhari kalyan W\n\n` +
    `Important:\n` +
    `• Please carry the ticket/QR code for entry.\n` +
    `• One ticket is valid for the number of persons mentioned at the time of booking.\n` +
    `• Please do not share your ticket publicly.\n\n` +
    `*Get ready to experience the colours, music & energy of RAAS RANG!*\n\n` +
    `*See you there!* — Team RAAS RANG.`
  );
}

/**
 * Build a WhatsApp deep link (wa.me).
 * NOTE: wa.me links cannot attach PDF files. The UI shows an attach hint.
 * @param phone E.164 format +91XXXXXXXXXX
 * @param message Pre-formatted message text
 */
export function buildWhatsAppUrl(phone: string, message: string): string {
  // wa.me requires number without '+' prefix
  const waNumber = phone.startsWith('+') ? phone.slice(1) : phone;
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Build a mailto: link with subject and body.
 */
export function buildEmailUrl(recipientEmail: string, pass: Pass, message: string): string {
  const subject = `RAAS RANG 2026 — Your Entry Ticket (${pass.manual_code})`;
  return `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

/**
 * Release invariant check for automated WhatsApp Cloud API
 */
export function isAutomatedWhatsAppBlocked(): { blocked: boolean; reason: string } {
  return {
    blocked: true,
    reason: 'Automated WhatsApp Cloud API delivery is BLOCKED pending verified Meta Business Account, approved template, and webhook credentials.',
  };
}

// Backwards compatibility aliases for delivery unit tests
export const validateInternationalPhone = async (phone: string) => validateIndianPhone(phone);
export async function getWhatsAppShareText(pass: Pass): Promise<string> {
  const isSeasonal = pass.ticket_type === 'seasonal';
  return (
    `*Attendee:* ${pass.name || 'Passholder'}\n` +
    `*Code:* ${pass.manual_code}\n` +
    `*Party Allowance:* ${pass.party_size || 1} Persons\n` +
    `${isSeasonal ? `*Type:* Seasonal Pass (${pass.seasonal_nights_count || 9} Nights)\n` : '*Type:* Single Ticket\n'}` +
    `Attach the official PDF ticket when sharing.`
  );
}

