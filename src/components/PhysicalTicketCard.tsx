'use client';

import QRCodeDisplay from '@/components/QRCodeDisplay';
import { CATEGORY_LABELS } from '@/types';
import type { Pass } from '@/types';

interface PhysicalTicketCardProps {
  pass: Pass;
  ticketNumber?: number;
}

export default function PhysicalTicketCard({ pass, ticketNumber }: PhysicalTicketCardProps) {
  const displayName = pass.name || 'Admit One (Unassigned Pass)';
  const categoryLabel = CATEGORY_LABELS[pass.category] || pass.category;

  return (
    <div className="physical-ticket-card" aria-label={`Physical Ticket: ${displayName}`}>
      {/* ── Brand Header ── */}
      <div className="ticket-header">
        <div className="ticket-header-left">
          <span className="ticket-brand">RAAS RANG 2026</span>
          <span className="ticket-type-label">OFFICIAL ENTRY PASS</span>
        </div>
        <div className="ticket-badge">
          {categoryLabel.toUpperCase()}
        </div>
      </div>

      {/* ── Ticket Body (Side-by-side or stacked on mobile) ── */}
      <div className="ticket-body">
        {/* QR Section */}
        <div className="ticket-qr-section">
          <div className="ticket-qr-box">
            <QRCodeDisplay payload={pass.token} size={135} />
          </div>
          <span className="ticket-scan-hint">Scan QR at Gate</span>
        </div>

        {/* Ticket Details */}
        <div className="ticket-info-section">
          <div className="ticket-field">
            <span className="ticket-field-label">Attendee</span>
            <span className="ticket-field-value ticket-name">{displayName}</span>
          </div>

          <div className="ticket-field">
            <span className="ticket-field-label">Gate Manual Code</span>
            <span className="ticket-field-value ticket-manual-code">
              {pass.manual_code}
            </span>
          </div>

          <div className="ticket-meta-row">
            <div className="ticket-subfield">
              <span className="ticket-field-label">Category</span>
              <span className="ticket-subfield-val">{categoryLabel}</span>
            </div>
            {ticketNumber !== undefined && (
              <div className="ticket-subfield">
                <span className="ticket-field-label">Seq #</span>
                <span className="ticket-seq-num">#{ticketNumber}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Ticket Footer ── */}
      <div className="ticket-footer">
        <span>Non-transferable once scanned</span>
        <span>•</span>
        <span>Valid for one entry only</span>
        <span>•</span>
        <span>RAAS RANG 2026</span>
      </div>
    </div>
  );
}
