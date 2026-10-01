'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBatch } from '@/actions/batches';

export default function NewBatchPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);

    try {
      const result = await createBatch(formData);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.success && result.batchId) {
        router.push(`/dashboard/batches/${result.batchId}`);
      }
    } catch {
      setError('An unexpected error occurred while creating the batch.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <Link href="/dashboard/batches" className="back-link">
        ← Back to batches
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Create Ticket Batch</h1>
          <p className="page-subtitle">
            Atomically generate and assign unique physical passes
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        {error && (
          <div className="alert alert-error">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        <form action={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              Batch Name<span className="form-required">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="form-input"
              placeholder="e.g. Physical Tickets — Box 1"
              required
              disabled={loading}
              autoFocus
            />
            <div className="form-hint">A descriptive label for this print run</div>
          </div>

          <input type="hidden" name="category" value="complimentary" />

          <div className="form-group">
            <label htmlFor="count" className="form-label">
              Number of Tickets<span className="form-required">*</span>
            </label>
            <input
              id="count"
              name="count"
              type="number"
              min={1}
              max={500}
              defaultValue={50}
              className="form-input"
              required
              disabled={loading}
            />
            <div className="form-hint">
              Between 1 and 500 tickets. Each ticket receives a unique QR token & manual code.
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" /> Generating Atomic Batch…
              </>
            ) : (
              'Create & Generate Batch'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
