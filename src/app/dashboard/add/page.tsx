'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPass } from '@/actions/passes';
import { getEventNights, type EventNight } from '@/actions/event-nights';
import type { TicketType } from '@/types';

export default function AddAttendeePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  // Event nights schedule state
  const [eventNights, setEventNights] = useState<EventNight[]>([]);

  // Ticket configuration state
  const [ticketType, setTicketType] = useState<TicketType>('single');
  const [partySize, setPartySize] = useState<number | string>(1);
  
  // Phone input state for +91 prefix restriction
  const [phoneInput, setPhoneInput] = useState('');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, max 10
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    setPhoneInput(val);
  };

  useEffect(() => {
    getEventNights()
      .then((nights) => {
        setEventNights(nights);
      })
      .catch(() => {});
  }, []);

  // Client-side idempotency key generated once per form session
  const [idempotencyKey] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return 'pass_gen_' + crypto.randomUUID();
    }
    return 'pass_gen_' + Math.random().toString(36).substring(2);
  });

  async function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    setSuccess(false);
    setLoading(true);

    try {
      const result = await createPass(formData);

      if (result.error) {
        setError(result.error);
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        return;
      }

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push(`/dashboard/passes/${result.passId}`);
        }, 1000);
      }
    } catch {
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
              name="name"
              type="text"
              className={`form-input ${fieldErrors.name ? 'error' : ''}`}
              placeholder="e.g. Julie Saxena"
              required
              disabled={loading || success}
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
              />
              {fieldErrors.email && <div className="form-error">{fieldErrors.email}</div>}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px', padding: '14px', fontSize: '1.05rem', fontWeight: 700 }}
            disabled={loading || success}
          >
            {loading ? (
              <>
                <span className="spinner" /> Generating Official Ticket…
              </>
            ) : success ? (
              'Ticket Generated'
            ) : (
              'Issue Ticket & Generate PDF'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
