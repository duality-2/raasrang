import type { Pass } from '../types/index.ts';

/**
 * Validates international phone format (+[1-9][0-9]{9,14})
 */
export function validateInternationalPhone(phone: string): { valid: boolean; formatted: string } {
  const cleaned = phone.replace(/[^0-9+]/g, '');
  // Default to +91 (India) if 10 digits entered without country code
  let formatted = cleaned;
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    formatted = '+91' + cleaned;
  } else if (!formatted.startsWith('+') && formatted.length >= 10) {
    formatted = '+' + formatted;
  }

  const isValid = /^\+[1-9]\d{9,14}$/.test(formatted);
  return { valid: isValid, formatted };
}

/**
 * Builds manual WhatsApp sharing text for ticketers (Mode A)
 */
export function getWhatsAppShareText(pass: Pass): string {
  const isSeasonal = pass.ticket_type === 'seasonal';
  const typeLabel = isSeasonal ? 'Seasonal Pass' : 'Single Ticket';
  const partyLabel = `${pass.party_size || 1} Person${(pass.party_size || 1) > 1 ? 's' : ''}`;
  const nightsLabel = isSeasonal
    ? `\n*Eligible Nights:* ${pass.seasonal_nights_count ? `${pass.seasonal_nights_count} Nights` : 'All 9 Nights'}`
    : '';

  return (
    `🎉 *RAAS RANG 2026 — ENTRY TICKET*\n\n` +
    `*Attendee:* ${pass.name || 'Admit One'}\n` +
    `*Ticket Type:* ${typeLabel}\n` +
    `*Party Allowance:* ${partyLabel}${nightsLabel}\n` +
    `*Gate Entry Code:* ${pass.manual_code}\n\n` +
    `📍 *Venue:* Surat Dandiya Ground, Vesu\n` +
    `⏰ *Time:* 6:00 PM to 6:00 AM IST\n\n` +
    `Attach the official PDF ticket sent with this message. Please present the QR code or printed code at Gate A/B/C/D for entry.`
  );
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
