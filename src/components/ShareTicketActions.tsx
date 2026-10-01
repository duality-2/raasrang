'use client';

import { useState } from 'react';
import type { Pass } from '@/types';
import { recordManualShareAction } from '@/actions/delivery';

interface ShareTicketActionsProps {
  pass: Pass;
  shareText: string;
}

export default function ShareTicketActions({ pass, shareText }: ShareTicketActionsProps) {
  const [deliveryStatus, setDeliveryStatus] = useState<string>(
    pass.delivery_status === 'not_sent' ? 'ready_to_share' : pass.delivery_status || 'ready_to_share'
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  // Clean phone number for WhatsApp link
  const rawPhone = pass.phone?.replace(/[^0-9]/g, '') || '';
  const waUrl = rawPhone
    ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(shareText)}`
    : `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  // Mobile Web Share API with PDF file
  const handleDeviceShare = async () => {
    setShareFeedback(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        // Fetch private PDF stream
        const response = await fetch(`/api/passes/${pass.id}/pdf`);
        if (!response.ok) {
          throw new Error('Failed to retrieve PDF stream');
        }
        const blob = await response.blob();
        const fileName = `RAAS_RANG_Ticket_${pass.manual_code}.pdf`;
        const file = new File([blob], fileName, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'RAAS RANG 2026 — Official Ticket',
            text: shareText,
            files: [file],
          });
          setShareFeedback('Shared via device sheet. Please tap "Confirm Sent" once sent.');
          return;
        }
      }
      // If Web Share API with files is not supported (e.g. desktop)
      setShowInstructions(true);
      window.open(`/api/passes/${pass.id}/pdf`, '_blank');
      window.open(waUrl, '_blank');
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setShowInstructions(true);
      }
    }
  };

  // Explicit Human Confirmation: Ticketer explicitly marks ticket as delivered
  const handleConfirmSent = async () => {
    setIsConfirming(true);
    try {
      const res = await recordManualShareAction(pass.id);
      if (res.success) {
        setDeliveryStatus('manually_shared');
        setShareFeedback('✓ Confirmed sent by ticketer.');
      } else {
        setShareFeedback('Failed to record delivery status.');
      }
    } catch {
      setShareFeedback('Network error while recording delivery status.');
    } finally {
      setIsConfirming(false);
    }
  };

  const isAlreadySent = deliveryStatus === 'manually_shared' || deliveryStatus === 'sent' || deliveryStatus === 'delivered';

  return (
    <div className="share-ticket-actions no-print" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
        {/* 📥 1. Direct PDF Download */}
        <a
          href={`/api/passes/${pass.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <span>📥</span>
          <span>Download PDF</span>
        </a>

        {/* 📱 2. Device Share (Attaches actual PDF file on mobile) */}
        <button
          type="button"
          onClick={handleDeviceShare}
          className="btn btn-primary btn-sm"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#25D366',
            borderColor: '#25D366',
            color: '#ffffff',
          }}
        >
          <span>💬</span>
          <span>Share PDF via WhatsApp</span>
        </button>

        {/* 💬 3. Open WhatsApp Web / Chat (Never marks as sent) */}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
          onClick={() => setShowInstructions(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <span>🔗</span>
          <span>Open Chat</span>
        </a>

        {/* 4. Delivery Status Badge */}
        <span
          className={`badge badge-${deliveryStatus}`}
          style={{
            fontSize: '0.78rem',
            padding: '4px 8px',
            borderRadius: '4px',
            background: isAlreadySent ? '#166534' : '#e0e7ff',
            color: isAlreadySent ? '#ffffff' : '#3730a3',
            fontWeight: 600,
          }}
        >
          {isAlreadySent ? '✓ MANUALLY SHARED' : '⏳ READY TO SHARE'}
        </span>
      </div>

      {/* 5. Human Explicit Confirmation Button */}
      {!isAlreadySent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={handleConfirmSent}
            disabled={isConfirming}
            className="btn btn-primary btn-sm"
            style={{
              background: '#047857',
              borderColor: '#047857',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            {isConfirming ? 'Recording…' : '✓ Mark as Sent (Confirm Human Delivery)'}
          </button>
          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
            Tap after you have attached the PDF and sent it in WhatsApp.
          </span>
        </div>
      )}

      {/* Step-by-step Manual Attach Guide for Desktop */}
      {showInstructions && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            color: '#92400e',
          }}
        >
          <strong>💡 Manual WhatsApp Attachment Instructions:</strong>
          <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li>Download the official PDF ticket above.</li>
            <li>In the opened WhatsApp chat, tap the <strong>+ / Paperclip</strong> icon.</li>
            <li>Select <strong>Document</strong> &rarr; choose the downloaded PDF.</li>
            <li>Tap <strong>Send</strong>, then click <strong>&quot;Mark as Sent&quot;</strong> below.</li>
          </ol>
        </div>
      )}

      {shareFeedback && (
        <div style={{ fontSize: '0.82rem', color: '#047857', fontWeight: 600 }}>
          {shareFeedback}
        </div>
      )}

      {/* 6. Automated WhatsApp Cloud API Status Notice */}
      <div
        style={{
          marginTop: '4px',
          padding: '8px 12px',
          borderRadius: '6px',
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          fontSize: '0.78rem',
          color: '#4b5563',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          🤖 <strong>Automated WhatsApp API:</strong> <span style={{ color: '#dc2626', fontWeight: 700 }}>BLOCKED</span> (Awaiting Meta Business account, approved template & webhook setup)
        </span>
      </div>
    </div>
  );
}
