'use client';

import QRCodeDisplay from '@/components/QRCodeDisplay';
import type { Pass } from '@/types';
import { TICKET_LAYOUT_CONFIG } from '@/lib/ticket-config';

interface PhysicalTicketCardProps {
  pass: Pass;
  ticketNumber?: number;
  isTestBatch?: boolean;
  night?: { title?: string; event_date?: string } | null;
}

/**
 * Physical ticket card matching the RAAS RANG 2026 sample ticket design.
 * Uses the exact 1024x382 event artwork with dynamic QR code and manual code
 * positioned precisely on the right-side tear-off stub.
 *
 * The full ticket shows completely without any clipping or distortion:
 * - Left side: SZ badge, Durga centerpiece, "Raas Rang 2026", two elephants, venue/time
 * - Perforation line: visible between main body and stub
 * - Right stub: Mini-logo, dates, dynamic QR code (replaces sample QR), attendee manual code
 */
export default function PhysicalTicketCard({ pass, ticketNumber, isTestBatch, night }: PhysicalTicketCardProps) {
  const cfg = TICKET_LAYOUT_CONFIG;
  const displayName = pass.name || 'Admit One';

  return (
    <div
      className="physical-ticket-card"
      aria-label={`Physical Ticket: ${displayName}`}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '860px',
        aspectRatio: '3200 / 1035',
        backgroundImage: 'url(/ticket-bg.png?v=20261011)',
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#2b0938',
        borderRadius: '6px',
        overflow: 'hidden',
        boxShadow: '0 6px 28px rgba(0, 0, 0, 0.18)',
        margin: '0 auto',
        userSelect: 'none',
      }}
    >
      {/* ── Background Artwork ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/ticket-bg.png?v=20261011"
        alt="RAAS RANG 2026 Ticket"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'fill',
          display: 'block',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* ── TEST Watermark (only for disposable integration test batches) ── */}
      {isTestBatch && (
        <div
          className="ticket-test-watermark"
          aria-label="Test ticket"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'clamp(2rem, 6vw, 4.5rem)',
            fontWeight: 900,
            color: 'rgba(220, 38, 38, 0.4)',
            letterSpacing: '0.18em',
            transform: 'rotate(-22deg)',
            pointerEvents: 'none',
            zIndex: 15,
            border: '4px dashed rgba(220, 38, 38, 0.35)',
          }}
        >
          TEST
        </div>
      )}

      {/* ── Right-Side Tear-Off Stub: QR Code Scanner ("scanner on one end") ── */}
      <div
        className="ticket-qr-overlay"
        style={{
          position: 'absolute',
          left: `${cfg.qr.leftPercent}%`,
          top: `${cfg.qr.topPercent}%`,
          width: `${cfg.qr.widthPercent}%`,
          height: `${cfg.qr.heightPercent}%`,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="ticket-qr-box"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '4px',
            padding: '3%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.22)',
          }}
        >
          <QRCodeDisplay
            payload={pass.token}
            size={180}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      </div>

      {/* ── Right-Side Tear-Off Stub: Manual Entry Code ("with code below the qr") ── */}
      <div
        className="ticket-manual-code-overlay"
        style={{
          position: 'absolute',
          left: `${cfg.manualCode.leftPercent}%`,
          top: `${cfg.manualCode.topPercent}%`,
          width: `${cfg.manualCode.widthPercent}%`,
          height: `${cfg.manualCode.heightPercent}%`,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          borderRadius: '4px',
          boxSizing: 'border-box',
        }}
      >
        <span
          className="ticket-manual-code-text"
          style={{
            fontFamily: cfg.manualCode.fontFamily,
            fontSize: 'clamp(10px, 1.5vw, 18px)',
            fontWeight: 900,
            letterSpacing: '0.08em',
            color: '#111827',
            textAlign: 'center',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {pass.manual_code}
        </span>
      </div>

      {/* ── Ticket Entitlement & Attendee Overlay (Clean placement in open area between left sponsors and Durga logo) ── */}
      <div
        className="ticket-entitlement-overlay"
        style={{
          position: 'absolute',
          left: '16.5%',
          top: '36%',
          width: '13.5%',
          height: '28%',
          background: 'transparent',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '4px',
          pointerEvents: 'none',
        }}
      >
        {pass.name && (
          <span
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 'clamp(11px, 1.25vw, 17px)',
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.6)',
              lineHeight: 1.15,
              wordBreak: 'break-word',
            }}
          >
            {pass.name}
          </span>
        )}
        <span
          style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 'clamp(9.5px, 1.1vw, 14.5px)',
            fontWeight: 800,
            color: '#fef08a',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.7)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {pass.ticket_type === 'seasonal'
            ? 'ALL DAYS'
            : (night?.title || 'DAY 1').toUpperCase()}
        </span>
        <span
          style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 'clamp(9px, 1.0vw, 13.5px)',
            fontWeight: 800,
            color: '#fbbf24',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.7)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          ADMIT - {pass.party_size || 1}
        </span>
      </div>

      {/* ── Sequence Number (Optional in bottom-left) ── */}
      {ticketNumber !== undefined && (
        <div
          className="ticket-seq-overlay"
          style={{
            position: 'absolute',
            bottom: '2.5%',
            left: '1.5%',
            fontSize: 'clamp(7px, 1vw, 10px)',
            color: 'rgba(255, 255, 255, 0.85)',
            fontWeight: 700,
            zIndex: 10,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
          }}
        >
          #{ticketNumber}
        </div>
      )}
    </div>
  );
}
