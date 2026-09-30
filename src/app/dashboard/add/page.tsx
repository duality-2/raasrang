'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPass } from '@/actions/passes';
import { CATEGORY_LABELS } from '@/types';

export default function AddAttendeePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

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
        // Navigate to the new pass detail after a brief moment
        setTimeout(() => {
          router.push(`/dashboard/passes/${result.passId}`);
        }, 1200);
      }
    } catch {
      setError('An unexpected error occurred.');
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
          <h1 className="page-title">Add Attendee</h1>
          <p className="page-subtitle">Create a new pass for RAAS RANG 2026</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        {error && (
          <div className="alert alert-error">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <span>✓</span>
            <span>Pass created successfully! Redirecting…</span>
          </div>
        )}

        <form action={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              Attendee Name<span className="form-required">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className={`form-input ${fieldErrors.name ? 'error' : ''}`}
              placeholder="Full name"
              required
              disabled={loading || success}
              autoFocus
            />
            {fieldErrors.name && (
              <div className="form-error">{fieldErrors.name}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="category" className="form-label">
              Category<span className="form-required">*</span>
            </label>
            <select
              id="category"
              name="category"
              className={`form-select ${fieldErrors.category ? 'error' : ''}`}
              required
              disabled={loading || success}
              defaultValue=""
            >
              <option value="" disabled>
                Select a category
              </option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {fieldErrors.category && (
              <div className="form-error">{fieldErrors.category}</div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className={`form-input ${fieldErrors.email ? 'error' : ''}`}
                placeholder="Optional"
                disabled={loading || success}
              />
              {fieldErrors.email && (
                <div className="form-error">{fieldErrors.email}</div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="phone" className="form-label">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className={`form-input ${fieldErrors.phone ? 'error' : ''}`}
                placeholder="Optional"
                disabled={loading || success}
              />
              {fieldErrors.phone && (
                <div className="form-error">{fieldErrors.phone}</div>
              )}
              <div className="form-hint">7-15 digits, optional leading +</div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading || success}
          >
            {loading ? (
              <>
                <span className="spinner" /> Creating Pass…
              </>
            ) : success ? (
              '✓ Pass Created'
            ) : (
              'Create Pass'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
