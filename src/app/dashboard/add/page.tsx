'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPass } from '@/actions/passes';
import { getEventNights, type EventNight } from '@/actions/event-nights';
import type { TicketType, Pass } from '@/types';
import { buildTicketMessage, buildWhatsAppUrl } from '@/lib/delivery-utils';

export default function AddAttendeePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  // Event nights schedule state
  const [eventNights, setEventNights] = useState<EventNight[]>([]);
  const [selectedNightId, setSelectedNightId] = useState<string>('night_1');

  // Attendee state
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [lastIssuedPass, setLastIssuedPass] = useState<{ passId: string; name: string } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Ticket configuration state
  const [ticketType, setTicketType] = useState<TicketType>('single');
  const [partySize, setPartySize] = useState<number | string>(1);
  
  // Payment state
  const [paymentMode, setPaymentMode] = useState<'cash' | 'online'>('cash');
  const [amountReceived, setAmountReceived] = useState('');

  // Phone input state for +91 prefix restriction
  const [phoneInput, setPhoneInput] = useState('');

  const submitModeRef = useRef<'standard' | 'whatsapp' | 'whatsapp_stay'>('whatsapp_stay');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, max 10
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    setPhoneInput(val);
  };

  useEffect(() => {
    getEventNights()
      .then((nights) => {
        setEventNights(nights);
        if (nights.length > 0) {
          setSelectedNightId(nights[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Client-side idempotency key generated once per form session, refreshed on fast-desk reset
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return 'pass_gen_' + crypto.randomUUID();
    }
    return 'pass_gen_' + Math.random().toString(36).substring(2);
  });

  async function handleSubmit(formData: FormData) {
    const isStayMode = submitModeRef.current === 'whatsapp_stay';
    const isWhatsAppMode = submitModeRef.current === 'whatsapp' || isStayMode;

    if (isWhatsAppMode && !phoneInput.trim()) {
      setError('Please provide a WhatsApp phone number to use instant WhatsApp sharing, or choose "Issue Ticket (View / Print Only)".');
      return;
    }

    setError(null);
    setFieldErrors({});
    setSuccess(false);
    setLoading(true);

    // Pre-open blank tab synchronously in user click handler to satisfy browser popup blockers
    let waWindow: Window | null = null;
    if (isWhatsAppMode) {
      try {
        waWindow = window.open('about:blank', '_blank');
      } catch {
        waWindow = null;
      }
    }

    try {
      const result = await createPass(formData);

      if (result.error) {
        if (waWindow && !waWindow.closed) {
          waWindow.close();
        }
        setError(result.error);
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        return;
      }

      if (result.success && result.passId) {
        if (isWhatsAppMode) {
          const rawDigits = phoneInput.replace(/[^0-9]/g, '');
          const formattedPhone = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits;
          const syntheticPass: Partial<Pass> = {
            ticket_type: ticketType,
            party_size: Number(partySize) || 1,
          };
          const selectedNight = eventNights.find((n) => n.id === selectedNightId) || null;
          const shareText = buildTicketMessage(syntheticPass as Pass, selectedNight);
          const waUrl = buildWhatsAppUrl(formattedPhone, shareText);

          if (isStayMode) {
            // Desk Fast-Mode: Uses Share PDF flow so WhatsApp receives the PDF directly attached
            try {
              const pdfRes = await fetch(`/api/passes/${result.passId}/pdf`);
              const blob = await pdfRes.blob();
              const file = new File([blob], `RaasRang-Ticket-${result.passId.slice(0, 8)}.pdf`, { type: 'application/pdf' });

              if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                if (waWindow && !waWindow.closed) {
                  waWindow.close();
                }
                await navigator.share({
                  title: 'RAAS RANG 2026 — Official Ticket',
                  text: shareText,
                  files: [file],
                });
              } else {
                // Desktop fallback: Open WhatsApp chat and auto-download PDF
                if (waWindow && !waWindow.closed) {
                  waWindow.location.href = waUrl;
                } else {
                  window.open(waUrl, '_blank');
                }
                const downloadLink = document.createElement('a');
                downloadLink.href = `/api/passes/${result.passId}/pdf`;
                downloadLink.download = `RaasRang-Ticket-${result.passId.slice(0, 8)}.pdf`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
              }
            } catch (shareErr: unknown) {
              if (!(shareErr instanceof Error && shareErr.name === 'AbortError')) {
                if (waWindow && !waWindow.closed) {
                  waWindow.location.href = waUrl;
                }
              }
            }

            setLastIssuedPass({ passId: result.passId, name: nameInput.trim() || 'Attendee' });
            setNameInput('');
            setPhoneInput('');
            setEmailInput('');
            setAmountReceived('');
            setPartySize(1);
            setIdempotencyKey('pass_gen_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)));

            setTimeout(() => {
              nameInputRef.current?.focus();
            }, 100);
            return;
          }

          // Standard WhatsApp redirect mode
          setSuccess(true);
          if (waWindow && !waWindow.closed) {
            waWindow.location.href = waUrl;
            router.push(`/dashboard/passes/${result.passId}?autoWhatsapp=download_only`);
          } else {
            router.push(`/dashboard/passes/${result.passId}?autoWhatsapp=1`);
          }
        } else {
          setSuccess(true);
          router.push(`/dashboard/passes/${result.passId}`);
        }
      }

    } catch {
      if (waWindow && !waWindow.closed) {
        waWindow.close();
      }
      setError('An unexpected error occurred while issuing the pass.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <Link href="/dashboard" className="back-link">
        ← Back to attendees
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Issue Entry Ticket</h1>
          <p className="page-subtitle">Generate a verified ticket for RAAS RANG 2026</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '640px' }}>
        {lastIssuedPass && (
          <div
            className="alert alert-success"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              padding: '12px 16px',
              background: '#ecfdf5',
              border: '1px solid #10b981',
              borderRadius: '8px',
            }}
          >
            <div>
              <span style={{ fontWeight: 700, color: '#065f46' }}>✓ Ticket for {lastIssuedPass.name} issued!</span>
              <div style={{ fontSize: '0.82rem', color: '#047857', marginTop: '2px' }}>
                WhatsApp opened & PDF downloaded. Form is ready for next attendee.
              </div>
            </div>
            <Link
              href={`/dashboard/passes/${lastIssuedPass.passId}`}
              target="_blank"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', fontWeight: 600 }}
            >
              View Ticket ↗
            </Link>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <span>Ticket created successfully! Redirecting to ticket view…</span>
          </div>
        )}

        <form action={handleSubmit}>
          {/* Hidden Idempotency Key */}
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />

          {/* ── 1. Ticket Type Selector ── */}
          <div className="form-group">
            <label className="form-label">
              Ticket Type<span className="form-required">*</span>
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginTop: '6px',
              }}
            >
              <button
                type="button"
                className={`btn ${ticketType === 'single' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTicketType('single')}
                style={{ textAlign: 'center', padding: '12px' }}
                disabled={loading || success}
              >
                <strong>Single Ticket</strong>
                <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                  Valid for 1 chosen entry night
                </div>
              </button>

              <button
                type="button"
                className={`btn ${ticketType === 'seasonal' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTicketType('seasonal')}
                style={{
                  textAlign: 'center',
                  padding: '12px',
                  cursor: 'pointer',
                }}
                disabled={loading || success}
              >
                <strong>Seasonal Pass</strong>
                <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                  Allowance replenishes each night
                </div>
              </button>
            </div>
            <input type="hidden" name="ticket_type" value={ticketType} />
          </div>

          {/* ── 2. Typable Party Size (1 to 100) ── */}
          <div className="form-group">
            <label htmlFor="party_size" className="form-label">
              Party Size (Attendees per admission, max 100)<span className="form-required">*</span>
            </label>
            <input
              id="party_size"
              name="party_size"
              type="number"
              min="1"
              max="100"
              step="1"
              className={`form-input ${fieldErrors.party_size ? 'error' : ''}`}
              value={partySize}
              onChange={(e) => {
                const val = e.target.value;
                setPartySize(val === '' ? '' : parseInt(val, 10) || 1);
              }}
              placeholder="e.g. 1, 2, 5, 20, 50, 100"
              required
              disabled={loading || success}
              style={{ fontSize: '1.05rem', fontWeight: 600, padding: '10px 14px' }}
            />
            {fieldErrors.party_size && (
              <div className="form-error">{fieldErrors.party_size}</div>
            )}
            <div className="form-hint" style={{ marginTop: '4px' }}>
              {Number(partySize) === 1
                ? 'Individual ticket (1 person)'
                : `Group ticket: allows up to ${partySize || 1} people (max 100)${
                    ticketType === 'seasonal' ? ' per eligible night' : ' total'
                  }`}
            </div>
          </div>

          {/* ── 3. Seasonal Schedule Options (Hidden Defaults) ── */}
          {ticketType === 'seasonal' && (
            <>
              <input type="hidden" name="seasonal_start_night_id" value="night_1" />
              <input type="hidden" name="seasonal_nights_count" value="9" />
            </>
          )}

          {/* ── 3b. Single Ticket Options ── */}
          {ticketType === 'single' && (
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label htmlFor="valid_night_id" className="form-label">
                Select Entry Night<span className="form-required">*</span>
              </label>
              <select
                id="valid_night_id"
                name="valid_night_id"
                className="form-select"
                value={selectedNightId}
                onChange={(e) => setSelectedNightId(e.target.value)}
                disabled={loading || success}
                required
              >
                {eventNights.length > 0
                  ? eventNights.map((night) => (
                      <option key={night.id} value={night.id}>
                        {night.title} ({night.event_date})
                      </option>
                    ))
                  : [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <option key={`night_${n}`} value={`night_${n}`}>
                        Night {n}
                      </option>
                    ))}
              </select>
            </div>
          )}

          {/* ── 4. Attendee Details ── */}
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              Buyer / Attendee Name<span className="form-required">*</span>
            </label>
            <input
              id="name"
              ref={nameInputRef}
              name="name"
              type="text"
              className={`form-input ${fieldErrors.name ? 'error' : ''}`}
              placeholder="e.g. Julie Saxena"
              required
              disabled={loading || success}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            {fieldErrors.name && <div className="form-error">{fieldErrors.name}</div>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="phone" className="form-label">
                WhatsApp Phone Number
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', padding: '0 12px' }}>
                <span style={{ color: '#6b7280', fontWeight: 600, marginRight: '8px' }}>+91</span>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  className={`form-input ${fieldErrors.phone ? 'error' : ''}`}
                  placeholder="9876543210"
                  disabled={loading || success}
                  value={phoneInput}
                  onChange={handlePhoneChange}
                  style={{ border: 'none', paddingLeft: 0, outline: 'none', flex: 1, boxShadow: 'none' }}
                />
              </div>
              {fieldErrors.phone && <div className="form-error">{fieldErrors.phone}</div>}
              <div className="form-hint">Used for WhatsApp ticket sharing</div>
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className={`form-input ${fieldErrors.email ? 'error' : ''}`}
                placeholder="Optional"
                disabled={loading || success}
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              {fieldErrors.email && <div className="form-error">{fieldErrors.email}</div>}
            </div>
          </div>

          {/* ── 5. Payment Details ── */}
          <div className="form-group">
            <label className="form-label">
              Mode of Payment<span className="form-required">*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                className={`btn ${paymentMode === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPaymentMode('cash')}
                style={{ padding: '12px' }}
                disabled={loading || success}
              >
                <strong>Cash</strong>
              </button>
              <button
                type="button"
                className={`btn ${paymentMode === 'online' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPaymentMode('online')}
                style={{ padding: '12px' }}
                disabled={loading || success}
              >
                <strong>Online</strong>
              </button>
            </div>
            <input type="hidden" name="payment_mode" value={paymentMode} />
            {fieldErrors.payment_mode && <div className="form-error">{fieldErrors.payment_mode}</div>}
          </div>

          <div className="form-group">
            <label htmlFor="amount_received" className="form-label">
              Amount Received (₹)<span className="form-required">*</span>
            </label>
            <input
              id="amount_received"
              name="amount_received"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={`form-input ${fieldErrors.amount_received ? 'error' : ''}`}
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              placeholder="Type amount, e.g. 500"
              required
              disabled={loading || success}
              style={{ fontSize: '1.05rem', fontWeight: 600, padding: '10px 14px' }}
            />
            {fieldErrors.amount_received && <div className="form-error">{fieldErrors.amount_received}</div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            {/* Primary Fast-Desk Action: Issue & Next Attendee */}
            <button
              type="submit"
              onClick={() => {
                submitModeRef.current = 'whatsapp_stay';
              }}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '1.05rem',
                fontWeight: 700,
                background: '#15803d',
                borderColor: '#166534',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(21, 128, 61, 0.3)',
              }}
              disabled={loading}
            >
              {loading && submitModeRef.current === 'whatsapp_stay' ? (
                <>
                  <span className="spinner" /> Issuing & Sharing PDF…
                </>
              ) : (
                <>
                  <span>⚡ Issue & Next Attendee (Share PDF Attached)</span>
                </>
              )}
            </button>

            {/* Direct WhatsApp Text Message: Issue & Open WhatsApp */}
            <button
              type="submit"
              onClick={() => {
                submitModeRef.current = 'whatsapp';
              }}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '0.98rem',
                fontWeight: 600,
                background: '#16a34a',
                borderColor: '#15803d',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              disabled={loading}
            >
              {loading && submitModeRef.current === 'whatsapp' ? (
                <>
                  <span className="spinner" /> Generating & Opening WhatsApp…
                </>
              ) : (
                <>
                  <span>⚡ Issue & Open WhatsApp (Direct Message)</span>
                </>
              )}
            </button>

            {/* Standard Action: Issue & View Details */}
            <button
              type="submit"
              onClick={() => {
                submitModeRef.current = 'standard';
              }}
              className="btn btn-secondary"
              style={{
                width: '100%',
                padding: '11px',
                fontSize: '0.94rem',
                fontWeight: 600,
              }}
              disabled={loading}
            >
              {loading && submitModeRef.current === 'standard' ? (
                <>
                  <span className="spinner" /> Generating Official Ticket…
                </>
              ) : (
                'Issue Ticket (View / Print Only)'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
