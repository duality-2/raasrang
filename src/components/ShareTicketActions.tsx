'use client';

import { useState, useEffect } from 'react';
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
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true);
  }, []);

  // Clean phone number for WhatsApp link
  const rawPhone = pass.phone?.replace(/[^0-9]/g, '') || '';
  const waUrl = rawPhone
    ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(shareText)}`
    : `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  // Mobile Web Share API with PDF attachment
  const handleDeviceShare = async () => {
    setShareFeedback('Preparing PDF for sharing...');
    try {
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        // Fetch PDF blob
        const res = await fetch(`/api/passes/${pass.id}/pdf`);
        const blob = await res.blob();
        const file = new File([blob], `RaasRang-Ticket-${pass.manual_code}.pdf`, { type: 'application/pdf' });

        const shareData = {
          title: 'RAAS RANG 2026 — Official Ticket',
        };

        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          await navigator.share({ ...shareData, files: [file] });
          setShareFeedback('Shared via device sheet. Please tap "Mark as Sent" once sent.');
          return;
        }
      }

      // Fallback: If no native share, or canShare with file is not supported
      // 1. Download PDF
      const link = document.createElement('a');
      link.href = `/api/passes/${pass.id}/pdf`;
      link.download = `RaasRang-Ticket-${pass.manual_code}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 2. Open MailTo
      const subject = encodeURIComponent('RAAS RANG 2026 — Official Ticket');
      const body = encodeURIComponent(shareText);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;

      setShareFeedback('PDF downloaded. Please attach it manually to your email.');
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setShareFeedback('Native share failed or was aborted.');
      } else {
        setShareFeedback(null);
      }
    }
  };

  const handleWhatsAppClick = () => {
    // The link opens wa.me in a new tab natively via href.
    setShareFeedback('WhatsApp opened! Please note: you must attach the PDF manually on desktop.');
  };

  const handleCopyMessage = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setShareFeedback('✓ Message copied to clipboard!');
      }
    } catch {
      setShareFeedback('Failed to copy message.');
    }
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent('RAAS RANG 2026 — Official Ticket');
    const body = encodeURIComponent(shareText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
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

        {/* Open WhatsApp Web / Chat */}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleWhatsAppClick}
          className="btn btn-primary btn-sm fw-bold"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
          }}
        >
          <span>Open WhatsApp</span>
        </a>

        {/* Copy Message */}
        <button
          type="button"
          onClick={handleCopyMessage}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
        >
          <span>Copy Message</span>
        </button>

        {/* Share via Email */}
        <button
          type="button"
          onClick={handleEmailShare}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
        >
          <span>Share via Email</span>
        </button>

        {/* Device Native Share */}
        {hasMounted && typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <button
            type="button"
            onClick={handleDeviceShare}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            <span>Share PDF</span>
          </button>
        )}

        {/* Delivery Status Badge */}
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
          {isAlreadySent ? 'MANUALLY SHARED' : 'READY TO SHARE'}
        </span>
      </div>

      {/* Human Explicit Confirmation Button */}
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
            {isConfirming ? 'Recording…' : 'Mark as Sent'}
          </button>
        </div>
      )}

      {shareFeedback && (
        <div style={{ fontSize: '0.82rem', color: '#047857', fontWeight: 600 }}>
          {shareFeedback}
        </div>
      )}
    </div>
  );
}
