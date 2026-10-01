import fs from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import type { Pass } from '../types/index.ts';
import { TICKET_LAYOUT_CONFIG } from './ticket-config.ts';

/**
 * Generates an in-memory PDF matching the RAAS RANG 2026 physical ticket design.
 *
 * Requirements:
 * - Match 1024x382 aspect ratio (195mm x 72.74mm).
 * - High-contrast QR code on right stub.
 * - Typable 8-character manual code in white pill below QR.
 * - Displays SINGLE / SEASONAL, party size, eligible nights, attendee name.
 * - Displays visible TEST marking for test passes.
 * - Never prints internal database UUID as entry code.
 * - In-memory only: never saved under /public or exposed to permanent public URLs.
 */
export async function generateTicketPdf(pass: Pass, isTest: boolean = false): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Printable dimensions: 552.75 pt x 206.18 pt (aspect ratio 2.68:1)
  const widthPt = 552.75;
  const heightPt = 206.18;
  const page = pdfDoc.addPage([widthPt, heightPt]);

  // Load and embed background event artwork
  const bgPath = path.join(process.cwd(), 'public', 'ticket-bg.png');
  const bgBytes = await fs.readFile(bgPath);
  const bgImage = await pdfDoc.embedPng(bgBytes);

  page.drawImage(bgImage, {
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
  });

  // Fonts
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontCourierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  // Generate QR code PNG in-memory from stored token
  const qrPngBuffer = await QRCode.toBuffer(pass.token, {
    errorCorrectionLevel: 'Q',
    margin: 1,
    width: 250,
  });
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);

  const cfg = TICKET_LAYOUT_CONFIG;

  // PDF coordinate system: origin (0, 0) is bottom-left!
  // QR placement on right stub
  const qrX = widthPt * (cfg.qr.leftPercent / 100);
  const qrY = heightPt * (1 - (cfg.qr.topPercent + cfg.qr.heightPercent) / 100);
  const qrW = widthPt * (cfg.qr.widthPercent / 100);
  const qrH = heightPt * (cfg.qr.heightPercent / 100);

  // Draw white background card for QR
  page.drawRectangle({
    x: qrX,
    y: qrY,
    width: qrW,
    height: qrH,
    color: rgb(1, 1, 1),
  });

  // Draw QR code with 4% padding
  const qrPadding = qrW * 0.04;
  page.drawImage(qrImage, {
    x: qrX + qrPadding,
    y: qrY + qrPadding,
    width: qrW - 2 * qrPadding,
    height: qrH - 2 * qrPadding,
  });

  // Manual code pill placement below QR
  const codeX = widthPt * (cfg.manualCode.leftPercent / 100);
  const codeY = heightPt * (1 - (cfg.manualCode.topPercent + cfg.manualCode.heightPercent) / 100);
  const codeW = widthPt * (cfg.manualCode.widthPercent / 100);
  const codeH = heightPt * (cfg.manualCode.heightPercent / 100);

  // Draw white rounded pill
  page.drawRectangle({
    x: codeX,
    y: codeY,
    width: codeW,
    height: codeH,
    color: rgb(1, 1, 1),
  });

  // Printed manual code
  const manualCodeText = pass.manual_code;
  const fontSize = 8.5;
  const textWidth = fontCourierBold.widthOfTextAtSize(manualCodeText, fontSize);
  const textHeight = fontCourierBold.heightAtSize(fontSize);
  page.drawText(manualCodeText, {
    x: codeX + (codeW - textWidth) / 2,
    y: codeY + (codeH - textHeight) / 2 + 1,
    size: fontSize,
    font: fontCourierBold,
    color: rgb(0.07, 0.09, 0.15),
  });

  // Ticket entitlement overlays
  const isSeasonal = pass.ticket_type === 'seasonal';
  const typeText = isSeasonal ? 'SEASONAL PASS' : 'SINGLE TICKET';
  const partySizeText = `PARTY OF ${pass.party_size || 1}`;
  const nightsText = isSeasonal
    ? pass.seasonal_nights_count
      ? `${pass.seasonal_nights_count} NIGHTS`
      : 'ALL 9 NIGHTS'
    : '';

  const badgeText = [typeText, partySizeText, nightsText].filter(Boolean).join('  •  ');
  const badgeWidth = fontHelveticaBold.widthOfTextAtSize(badgeText, 7.5) + 12;

  // Dark translucent pill for entitlement
  page.drawRectangle({
    x: widthPt * 0.02,
    y: heightPt * 0.14,
    width: badgeWidth,
    height: 14,
    color: rgb(0.1, 0.04, 0.15),
    opacity: 0.85,
  });

  page.drawText(badgeText, {
    x: widthPt * 0.02 + 6,
    y: heightPt * 0.14 + 3.5,
    size: 7.5,
    font: fontHelveticaBold,
    color: rgb(0.98, 0.82, 0.28), // Golden accent
  });

  if (pass.name) {
    const attendeeText = `ATTENDEE: ${pass.name.toUpperCase()}`;
    page.drawText(attendeeText, {
      x: widthPt * 0.02,
      y: heightPt * 0.23,
      size: 7.5,
      font: fontHelveticaBold,
      color: rgb(1, 1, 1),
    });
  }

  // TEST Watermark (only for test passes)
  if (isTest) {
    page.drawText('TEST TICKET', {
      x: widthPt * 0.22,
      y: heightPt * 0.35,
      size: 48,
      font: fontHelveticaBold,
      color: rgb(0.85, 0.15, 0.15),
      opacity: 0.4,
      rotate: degrees(20),
    });
  }

  return await pdfDoc.save();
}
