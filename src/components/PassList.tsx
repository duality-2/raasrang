'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PassListItem, PassCategory, PassStatus } from '@/types';
import { CATEGORY_LABELS, STATUS_LABELS, DELIVERY_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

interface PassListProps {
  passes: PassListItem[];
}

export default function PassList({ passes }: PassListProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = passes.filter((pass) => {
    const matchesSearch =
      !search ||
      pass.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || pass.category === categoryFilter;
    const matchesStatus =
      statusFilter === 'all' || pass.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <>
      {/* Search & Filter Bar */}
      <div className="filter-bar">
        <input
          type="text"
          className="form-input"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search attendees"
        />
        <select
          className="form-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="form-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      {search || categoryFilter !== 'all' || statusFilter !== 'all' ? (
        <p className="form-hint mb-4">
          Showing {filtered.length} of {passes.length} attendees
        </p>
      ) : null}

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎪</div>
          <div className="empty-state-title">
            {passes.length === 0
              ? 'No attendees yet'
              : 'No matches found'}
          </div>
          <div className="empty-state-text">
            {passes.length === 0
              ? 'Add your first attendee to get started.'
              : 'Try adjusting your search or filters.'}
          </div>
          {passes.length === 0 && (
            <Link href="/dashboard/add" className="btn btn-primary">
              + Add Attendee
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="table-wrap table-desktop">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pass) => (
                  <tr key={pass.id}>
                    <td className="table-name">{pass.name}</td>
                    <td>
                      <span className={`badge badge-${pass.category}`}>
                        {CATEGORY_LABELS[pass.category as PassCategory]}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${pass.status}`}>
                        {STATUS_LABELS[pass.status as PassStatus]}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${pass.delivery_status}`}>
                        {DELIVERY_LABELS[pass.delivery_status as keyof typeof DELIVERY_LABELS]}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {formatDate(pass.created_at)}
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/passes/${pass.id}`}
                        className="table-link"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="table-wrap table-mobile">
            {filtered.map((pass) => (
              <Link
                key={pass.id}
                href={`/dashboard/passes/${pass.id}`}
                className="mobile-card"
                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <div className="mobile-card-header">
                  <span className="mobile-card-name">{pass.name}</span>
                  <span className={`badge badge-${pass.status}`}>
                    {STATUS_LABELS[pass.status as PassStatus]}
                  </span>
                </div>
                <div className="mobile-card-meta">
                  <span className={`badge badge-${pass.category}`}>
                    {CATEGORY_LABELS[pass.category as PassCategory]}
                  </span>
                  <span>{formatDate(pass.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
