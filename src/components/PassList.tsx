'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { PassListItem, PassCategory, PassStatus } from '@/types';
import { CATEGORY_LABELS, STATUS_LABELS, DELIVERY_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

interface PassListProps {
  passes: PassListItem[];
}

const ITEMS_PER_PAGE = 25;

export default function PassList({ passes }: PassListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Read initial filter values from URL params for back-navigation preservation
  const initialSearch = searchParams.get('q') || '';
  const initialCategory = searchParams.get('category') || 'all';
  const initialStatus = searchParams.get('status') || 'all';
  const initialPage = parseInt(searchParams.get('page') || '1', 10);

  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [currentPage, setCurrentPage] = useState(isNaN(initialPage) ? 1 : initialPage);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync state changes to URL query parameters
  const updateQueryParams = (q: string, cat: string, stat: string, page: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cat !== 'all') params.set('category', cat);
    if (stat !== 'all') params.set('status', stat);
    if (page > 1) params.set('page', String(page));

    const query = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    });
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
    updateQueryParams(val, categoryFilter, statusFilter, 1);
  };

  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val);
    setCurrentPage(1);
    updateQueryParams(search, val, statusFilter, 1);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
    updateQueryParams(search, categoryFilter, val, 1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    updateQueryParams(search, categoryFilter, statusFilter, newPage);
  };

  // Filtered passes calculation
  const filtered = passes.filter((pass) => {
    const term = search.trim().toLowerCase();
    const nameMatch = pass.name ? pass.name.toLowerCase().includes(term) : false;
    const codeMatch = pass.manual_code ? pass.manual_code.toLowerCase().includes(term) : false;
    const emailMatch = pass.email ? pass.email.toLowerCase().includes(term) : false;
    const phoneMatch = pass.phone ? pass.phone.includes(term) : false;

    const matchesSearch = !term || nameMatch || codeMatch || emailMatch || phoneMatch;
    const matchesCategory = categoryFilter === 'all' || pass.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || pass.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Pagination slicing
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const validPage = Math.min(Math.max(currentPage, 1), totalPages);
  const paginatedPasses = filtered.slice(
    (validPage - 1) * ITEMS_PER_PAGE,
    validPage * ITEMS_PER_PAGE
  );

  const copyCode = (code: string, id: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1800);
      });
    }
  };

  return (
    <div className="pass-list-container">
      {/* ── Search & Filter Controls ── */}
      <div className="filter-bar" role="search" aria-label="Filter attendees and passes">
        <div className="filter-search-box">
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search by name, manual code (e.g. 7R8B-TZQL), phone, email…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search query"
          />
          {search && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => handleSearchChange('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <select
          className="form-select filter-select"
          value={categoryFilter}
          onChange={(e) => handleCategoryChange(e.target.value)}
          aria-label="Filter by pass category"
        >
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <select
          className="form-select filter-select"
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          aria-label="Filter by redemption status"
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Results Summary ── */}
      {(search || categoryFilter !== 'all' || statusFilter !== 'all') && (
        <div className="filter-results-summary">
          <span>
            Found <strong>{filtered.length}</strong> matching passes (out of {passes.length})
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm reset-filters-btn"
            onClick={() => {
              setSearch('');
              setCategoryFilter('all');
              setStatusFilter('all');
              setCurrentPage(1);
              updateQueryParams('', 'all', 'all', 1);
            }}
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* ── Empty State ── */}
      {filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">🎪</div>
          <div className="empty-state-title">
            {passes.length === 0 ? 'No passes created yet' : 'No matching passes found'}
          </div>
          <div className="empty-state-text">
            {passes.length === 0
              ? 'Add an individual attendee or create a physical ticket batch to get started.'
              : 'Try clearing your search term or adjusting the category and status filters.'}
          </div>
          {passes.length === 0 && (
            <div className="empty-state-actions">
              <Link href="/dashboard/add" className="btn btn-primary">
                + Add Single Attendee
              </Link>
              <Link href="/dashboard/batches/new" className="btn btn-secondary">
                + Create Ticket Batch
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Desktop Table ── */}
          <div className="table-wrap table-desktop card">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Attendee</th>
                  <th scope="col">Manual Code</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Delivery</th>
                  <th scope="col">Created</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {paginatedPasses.map((pass) => (
                  <tr key={pass.id}>
                    <td className="table-name">
                      {pass.name || <span className="text-muted">Unassigned Ticket</span>}
                    </td>
                    <td>
                      <div className="code-pill-wrapper">
                        <code className="manual-code-pill">
                          {pass.manual_code || '—'}
                        </code>
                        {pass.manual_code && (
                          <button
                            type="button"
                            onClick={() => copyCode(pass.manual_code, pass.id)}
                            className="btn btn-ghost btn-sm copy-btn"
                            title="Copy manual code"
                            aria-label={`Copy code ${pass.manual_code}`}
                          >
                            {copiedId === pass.id ? '✓' : '📋'}
                          </button>
                        )}
                      </div>
                    </td>
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
                    <td className="table-date">
                      {formatDate(pass.created_at)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/dashboard/passes/${pass.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        View & Print →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Card View ── */}
          <div className="table-wrap table-mobile">
            {paginatedPasses.map((pass) => (
              <Link
                key={pass.id}
                href={`/dashboard/passes/${pass.id}`}
                className="mobile-card"
              >
                <div className="mobile-card-header">
                  <span className="mobile-card-name">
                    {pass.name || 'Unassigned Ticket'}
                  </span>
                  <span className={`badge badge-${pass.status}`}>
                    {STATUS_LABELS[pass.status as PassStatus]}
                  </span>
                </div>
                <div className="mobile-card-meta">
                  <code className="mobile-card-code">
                    {pass.manual_code}
                  </code>
                  <span className={`badge badge-${pass.category}`}>
                    {CATEGORY_LABELS[pass.category as PassCategory]}
                  </span>
                  <span className="mobile-card-date">{formatDate(pass.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* ── Pagination Controls ── */}
          {totalPages > 1 && (
            <div className="pagination-bar" role="navigation" aria-label="Pass list pagination">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handlePageChange(validPage - 1)}
                disabled={validPage <= 1}
                aria-label="Go to previous page"
              >
                ← Previous
              </button>
              <span className="pagination-info">
                Page <strong>{validPage}</strong> of <strong>{totalPages}</strong> ({filtered.length} total)
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handlePageChange(validPage + 1)}
                disabled={validPage >= totalPages}
                aria-label="Go to next page"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
