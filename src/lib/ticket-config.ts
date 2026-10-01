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
    pixelWidth: 1024,
    pixelHeight: 382,
    aspectRatio: '1024 / 382',
    /** Printable physical dimensions on A4 (fits 3 tickets per sheet comfortably) */
    printWidthMm: 195,
    printHeightMm: 72.74,
  },

  /**
   * QR code placement on the right-side tear-off stub.
   * Percentage coordinates map 1:1 with the original 1024x382 artwork box.
   */
  qr: {
    /** Left coordinate as % of ticket width (x = 849px) */
    leftPercent: 82.91,
    /** Top coordinate as % of ticket height (y = 188px) */
    topPercent: 49.21,
    /** Width as % of ticket width (w = 108px) */
    widthPercent: 10.55,
    /** Height as % of ticket height (h = 108px) */
    heightPercent: 28.27,
    /** Error correction level: Q (25% recovery) */
    errorCorrectionLevel: 'Q' as const,
  },

  /**
   * Manual ticket code text placement (in the white pill directly below the QR box).
   * Percentage coordinates map 1:1 with the original 1024x382 artwork pill.
   */
  manualCode: {
    /** Left coordinate as % of ticket width (x = 850px) */
    leftPercent: 83.01,
    /** Top coordinate as % of ticket height (y = 298px) */
    topPercent: 78.01,
    /** Width as % of ticket width (w = 107px) */
    widthPercent: 10.45,
    /** Height as % of ticket height (h = 26px) */
    heightPercent: 6.81,
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

  /** Allowed gates for gate selector */
  allowedGates: ['Gate A', 'Gate B', 'Gate C', 'Gate D'] as const,
} as const;

export type TicketLayoutConfig = typeof TICKET_LAYOUT_CONFIG;
