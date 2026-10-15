'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Pass } from '@/types';
import { recordManualShareAction } from '@/actions/delivery';

interface ShareTicketActionsProps {
  pass: Pass;
  shareText: string;
}

export default function ShareTicketActions({ pass, shareText }: ShareTicketActionsProps) {
  const router = useRouter();
  const [deliveryStatus, setDeliveryStatus] = useState<string>(
    pass.delivery_status === 'not_sent' ? 'ready_to_share' : pass.delivery_status || 'ready_to_share'
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [isPdfReady, setIsPdfReady] = useState(false);

  const prefetchedFileRef = useRef<File | null>(null);
  const prefetchedUrlRef = useRef<string | null>(null);

  const filename = `RaasRang-Ticket-${pass.manual_code}.pdf`;

  // Lever 2: Pre-fetch PDF in background on mount for 0ms download / share
  useEffect(() => {
    setHasMounted(true);

    let isMounted = true;
    const prefetchPdf = async () => {
      try {
        const res = await fetch(`/api/passes/${pass.id}/pdf`);
        if (!res.ok) return;
        const blob = await res.blob();
        if (!isMounted) return;
        const file = new File([blob], filename, { type: 'application/pdf' });
        prefetchedFileRef.current = file;
        const url = URL.createObjectURL(blob);
        prefetchedUrlRef.current = url;
        setIsPdfReady(true);

        // Check if navigated from "⚡ Issue & Open WhatsApp" auto-trigger
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const autoWa = params.get('autoWhatsapp');
          if (autoWa === '1' || autoWa === 'download_only') {
            // Auto-trigger download so PDF is directly in recent downloads to attach to WhatsApp
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (autoWa === '1') {
              window.open(waUrl, '_blank');
            }

            setShareFeedback('⚡ Ticket issued & WhatsApp opened! Drag your downloaded PDF into the chat (or use "Share PDF ⚡" on mobile for auto-attach).');
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
      } catch {
        // Fallback: will fetch on-demand if background prefetch fails
      }
    };

    prefetchPdf();

    return () => {
      isMounted = false;
      if (prefetchedUrlRef.current) {
        URL.revokeObjectURL(prefetchedUrlRef.current);
      }
    };
  }, [pass.id, filename]);

  // Clean phone number for WhatsApp link
  const rawPhone = pass.phone?.replace(/[^0-9]/g, '') || '';
  const waUrl = rawPhone
    ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(shareText)}`
    : `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const handleDownloadPdf = () => {
    try {
      const link = document.createElement('a');
      link.href = prefetchedUrlRef.current || `/api/passes/${pass.id}/pdf`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShareFeedback('✓ PDF downloaded successfully.');
    } catch {
      setShareFeedback('Failed to download PDF.');
    }
  };

  const handleDeviceShare = async () => {
    try {
      let file = prefetchedFileRef.current;
      if (!file) {
        setShareFeedback('Preparing PDF...');
        const res = await fetch(`/api/passes/${pass.id}/pdf`);
        const blob = await res.blob();
        file = new File([blob], filename, { type: 'application/pdf' });
      }

      const shareData = {
        title: 'RAAS RANG 2026 — Official Ticket',
        text: shareText,
      };

      if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ ...shareData, files: [file] });
        setShareFeedback('Shared via device sheet. Please tap "Mark as Sent" once sent.');
        return;
      }
      
      // If canShare is false or missing, throw to trigger fallback
      throw new Error('ShareNotSupported');
    } catch (err: unknown) {
      // If the user simply closed the share sheet, do not show an error
      if (err instanceof Error && err.name === 'AbortError') {
        setShareFeedback(null);
        return;
      }
      
      // Fallback: Silently just download the PDF instead.
      handleDownloadPdf();
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
        setShareFeedback('✓ Confirmed sent! Resetting form for next attendee…');
        setTimeout(() => {
          router.push('/dashboard/add');
        }, 600);
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
    <div className="share-ticket-actions no-print">
      <div className="share-actions-primary-row">
        {/* Open WhatsApp Web / Chat */}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleWhatsAppClick}
          className="btn btn-whatsapp"
        >
          <span>💬 Open WhatsApp</span>
        </a>

        {/* Download PDF (Instant 0ms via prefetch) */}
        <button
          type="button"
          onClick={handleDownloadPdf}
          className="btn btn-secondary"
          title={isPdfReady ? 'Instant download (pre-cached)' : 'Download Ticket PDF'}
        >
          <span>⚡ Download PDF</span>
        </button>

        {/* Device Native Share */}
        {hasMounted && typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <button
            type="button"
            onClick={handleDeviceShare}
            className="btn btn-secondary"
            title={isPdfReady ? 'Instant share (pre-cached)' : 'Share PDF'}
          >
            <span>📤 Share PDF</span>
          </button>
        )}
      </div>

      <div className="share-actions-secondary-row">
        {/* Copy Message */}
        <button
          type="button"
          onClick={handleCopyMessage}
          className="btn btn-ghost btn-sm"
        >
          <span>📋 Copy Message</span>
        </button>

        {/* Share via Email */}
        <button
          type="button"
          onClick={handleEmailShare}
          className="btn btn-ghost btn-sm"
        >
          <span>✉️ Share via Email</span>
        </button>

        {/* Delivery Status Badge */}
        <span
          className={`badge badge-${deliveryStatus} ${isAlreadySent ? 'badge-delivered' : 'badge-ready'}`}
        >
          {isAlreadySent ? '✓ MANUALLY SHARED' : '● READY TO SHARE'}
        </span>
      </div>

      {/* Human Explicit Confirmation Button / Next Attendee */}
      <div className="share-actions-confirm-row">
        {!isAlreadySent ? (
          <button
            type="button"
            onClick={handleConfirmSent}
            disabled={isConfirming}
            className="btn btn-confirm-sent"
          >
            {isConfirming ? 'Recording…' : '✓ Mark as Sent & Next Attendee'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => router.push('/dashboard/add')}
            className="btn btn-next-attendee"
          >
            <span>+ Issue Next Attendee</span>
          </button>
        )}
      </div>

      {shareFeedback && (
        <div className="share-feedback-pill">
          {shareFeedback}
        </div>
      )}
    </div>
  );
}
