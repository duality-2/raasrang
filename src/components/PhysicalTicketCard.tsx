'use client';

import QRCodeDisplay from '@/components/QRCodeDisplay';
import type { Pass } from '@/types';
import { TICKET_LAYOUT_CONFIG } from '@/lib/ticket-config';

interface PhysicalTicketCardProps {
  pass: Pass;
  ticketNumber?: number;
  isTestBatch?: boolean;
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
export default function PhysicalTicketCard({ pass, ticketNumber, isTestBatch }: PhysicalTicketCardProps) {
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
        aspectRatio: '1024 / 382',
        backgroundImage: 'url(/ticket-bg.png)',
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
      {/* ── Background Artwork (Natural 1024x382 image with full Durga artwork, elephants, venue & right stub) ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/ticket-bg.png"
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
          backgroundColor: '#ffffff',
          borderRadius: '9999px',
          boxSizing: 'border-box',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.22)',
        }}
      >
        <span
          className="ticket-manual-code-text"
          style={{
            fontFamily: cfg.manualCode.fontFamily,
            fontSize: 'clamp(8px, 1.2vw, 12px)',
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

      {/* ── Ticket Entitlement & Attendee Overlay ── */}
      <div
        className="ticket-entitlement-overlay"
        style={{
          position: 'absolute',
          bottom: '12%',
          left: '2%',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          pointerEvents: 'none',
        }}
      >
        {pass.name && (
          <span
            style={{
              fontSize: 'clamp(7px, 1.1vw, 11px)',
              fontWeight: 800,
              color: '#ffffff',
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              letterSpacing: '0.04em',
            }}
          >
            ATTENDEE: {pass.name.toUpperCase()}
          </span>
        )}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(15, 6, 23, 0.85)',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: 'clamp(6.5px, 1vw, 10px)',
            fontWeight: 800,
            color: '#fef08a',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          <span>{pass.ticket_type === 'seasonal' ? 'SEASONAL PASS' : 'SINGLE TICKET'}</span>
          <span>•</span>
          <span>PARTY OF {pass.party_size || 1}</span>
          {pass.ticket_type === 'seasonal' && (
            <>
              <span>•</span>
              <span>
                {pass.seasonal_nights_count
                  ? `${pass.seasonal_nights_count} NIGHTS`
                  : 'ALL 9 NIGHTS'}
              </span>
            </>
          )}
        </div>
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
