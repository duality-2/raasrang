'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deletePass, cancelPass } from '@/actions/passes';

interface Props {
  passId: string;
  hasAdmissions: boolean;
  currentStatus: string;
}

export default function PassManagementActions({ passId, hasAdmissions, currentStatus }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (currentStatus === 'cancelled') {
    return (
      <div style={{ marginTop: '24px', padding: '16px', background: '#fee2e2', borderRadius: '8px', color: '#991b1b' }}>
        This pass has been cancelled and cannot be used for entry.
        {hasAdmissions && (
          <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
            <strong>Note:</strong> Admission history is preserved for audit purposes.
          </div>
        )}
      </div>
    );
  }

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this pass? It will no longer be valid for entry, but its admission history will remain.')) return;
    setLoading(true);
    const res = await cancelPass(passId);
    if (res?.error) {
      alert(res.error);
      setLoading(false);
    } else {
      router.refresh();
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you SURE you want to completely delete this pass? This action cannot be undone.')) return;
    setLoading(true);
    const res = await deletePass(passId);
    if (res?.error) {
      alert(res.error);
      setLoading(false);
    } else {
      router.push('/dashboard/passes');
    }
  };

  return (
    <div className="danger-zone-container">
      <div className="danger-zone-header">
        <span className="danger-zone-icon">⚠️</span>
        <h3 className="danger-zone-title">Danger Zone</h3>
      </div>
      
      {hasAdmissions ? (
        <div className="danger-zone-content">
          <div className="danger-zone-note">
            <strong>Admission History Exists:</strong> This pass has already been used at the gate. It cannot be permanently deleted to preserve the audit trail. You may cancel it instead.
          </div>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="btn btn-danger-outline"
          >
            {loading ? 'Processing...' : 'Cancel Pass'}
          </button>
        </div>
      ) : (
        <div className="danger-zone-content">
          <div className="danger-zone-note text-muted">
            This pass has no admission history. You can safely delete it from the system entirely, or cancel it.
          </div>
          <div className="danger-zone-actions">
            <button
              onClick={handleCancel}
              disabled={loading}
              className="btn btn-danger-outline"
            >
              {loading ? 'Processing...' : 'Cancel Pass'}
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="btn btn-danger"
            >
              {loading ? 'Processing...' : 'Permanently Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
