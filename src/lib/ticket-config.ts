/**
 * Ticket layout configuration for physical ticket printing and responsive preview.
 *
 * Source artwork dimensions: 1024 x 382 px (aspect ratio: 2.6806:1).
 *
 * Layout Structure:
 * - 0% to 76.76%: Main Ticket Body (Event details, Durga / dandiya artwork, elephants, venue)
 * - 76.76%: Dotted perforation tear line
 * - 76.76% to 100%: Right Stub (Raas Rang mini-logo, dates, QR code box, Admit pill)
 */
export const TICKET_LAYOUT_CONFIG = {
  /** Ticket aspect ratio and dimensions */
  ticket: {
    pixelWidth: 3200,
    pixelHeight: 1035,
    aspectRatio: '3200 / 1035',
    /** Printable physical dimensions on A4 (fits 3 tickets per sheet comfortably) */
    printWidthMm: 195,
    printHeightMm: 63.1, // (195 / 3.09)
  },

  /**
   * QR code placement on the right-side tear-off stub.
   * Percentage coordinates map 1:1 with the original 1024x382 artwork box.
   */
  qr: {
    /** Left coordinate as % of ticket width */
    leftPercent: 82.82,
    /** Top coordinate as % of ticket height */
    topPercent: 55.39,
    /** Width as % of ticket width */
    widthPercent: 11.84,
    /** Height as % of ticket height */
    heightPercent: 36.73,
    /** Error correction level: Q (25% recovery) */
    errorCorrectionLevel: 'Q' as const,
  },

  /**
   * Manual ticket code text placement (in the white pill directly below the QR box).
   * Percentage coordinates map 1:1 with the original 1024x382 artwork pill.
   */
  manualCode: {
    /** Left coordinate as % of ticket width */
    leftPercent: 82.5,
    /** Top coordinate as % of ticket height */
    topPercent: 88.0,
    /** Width as % of ticket width */
    widthPercent: 14.0,
    /** Height as % of ticket height */
    heightPercent: 8.0,
    /** Font family for printed code */
    fontFamily: '"SF Mono", "Courier New", Courier, monospace',
  },

  /** Print layout for A4 sheets */
  printLayout: {
    columns: 1,
    marginMm: 8,
    gapMm: 6,
    cropMarkLengthMm: 5,
    cropMarkOffsetMm: 2,
  },

} as const;

export type TicketLayoutConfig = typeof TICKET_LAYOUT_CONFIG;
