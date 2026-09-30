'use client';

import QRCodeDisplay from '@/components/QRCodeDisplay';
import { CATEGORY_LABELS } from '@/types';
import type { Pass } from '@/types';

interface PhysicalTicketCardProps {
  pass: Pass;
  ticketNumber?: number;
}

export default function PhysicalTicketCard({ pass, ticketNumber }: PhysicalTicketCardProps) {
  const displayName = pass.name || 'Unassigned Ticket';
  const categoryLabel = CATEGORY_LABELS[pass.category] || pass.category;

  return (
    <div className="physical-ticket-card">
      <div className="ticket-header">
        <div className="ticket-brand">RAAS RANG 2026</div>
        <div className="ticket-badge">{categoryLabel.toUpperCase()}</div>
      </div>

      <div className="ticket-body">
        <div className="ticket-qr-section">
          <QRCodeDisplay payload={pass.token} size={150} />
          <div className="ticket-scan-hint">Scan at entry gate</div>
        </div>

        <div className="ticket-info-section">
          <div className="ticket-field">
            <span className="ticket-field-label">Attendee</span>
            <span className="ticket-field-value ticket-name">{displayName}</span>
          </div>

          <div className="ticket-field">
            <span className="ticket-field-label">Manual Entry Code</span>
            <span className="ticket-field-value ticket-manual-code">{pass.manual_code}</span>
          </div>

          <div className="ticket-field">
            <span className="ticket-field-label">Status</span>
            <span className={`ticket-status-pill ${pass.status}`}>
              {pass.status.toUpperCase()}
            </span>
          </div>

          {ticketNumber !== undefined && (
            <div className="ticket-seq-num"># {ticketNumber}</div>
          )}
        </div>
      </div>

      <div className="ticket-footer">
        <span>Non-transferable once scanned</span>
        <span>•</span>
        <span>Physical Pass</span>
      </div>
    </div>
  );
}
