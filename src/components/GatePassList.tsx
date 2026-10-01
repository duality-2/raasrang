'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getUsedPasses, getUnusedPasses, getPassCounts } from '@/actions/gate-list';
import type { GateListItem, PaginationCursor, PassCategory, ScanMethod } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

import type { GateListCounts, GateListResponse } from '@/actions/gate-list';

type ListTab = 'used' | 'unused';

interface GatePassListProps {
  initialCounts: GateListCounts;
  userRole: import('@/types').UserRole;
}

export default function GatePassList({ initialCounts, userRole }: GatePassListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Tab state from URL or default
  const initialTab = (searchParams.get('tab') as ListTab) || 'used';
  const initialSearch = searchParams.get('q') || '';

  const [activeTab, setActiveTab] = useState<ListTab>(initialTab);
  const [search, setSearch] = useState(initialSearch);
  const [counts, setCounts] = useState<GateListCounts>(initialCounts);

  // Per-tab state
  const [usedItems, setUsedItems] = useState<GateListItem[]>([]);
  const [unusedItems, setUnusedItems] = useState<GateListItem[]>([]);
  const [usedCursor, setUsedCursor] = useState<PaginationCursor | null>(null);
  const [unusedCursor, setUnusedCursor] = useState<PaginationCursor | null>(null);
  const [usedHasMore, setUsedHasMore] = useState(true);
  const [unusedHasMore, setUnusedHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Scroll sentinel ref for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Items for active tab
  const items = activeTab === 'used' ? usedItems : unusedItems;
  const hasMore = activeTab === 'used' ? usedHasMore : unusedHasMore;

  // Update URL params
  const updateQueryParams = useCallback((tab: ListTab, q: string) => {
    const params = new URLSearchParams();
    if (tab !== 'used') params.set('tab', tab);
    if (q) params.set('q', q);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [router, pathname]);

  // Fetch a page of data
  const fetchPage = useCallback(async (
    tab: ListTab,
    cursor: PaginationCursor | null,
    searchTerm: string,
    append: boolean = false
  ) => {
    setLoading(true);
    try {
      const fetcher = tab === 'used' ? getUsedPasses : getUnusedPasses;
      const result: GateListResponse = await fetcher(cursor, searchTerm);

      if (tab === 'used') {
        setUsedItems(prev => append ? [...prev, ...result.items] : result.items);
        setUsedCursor(result.nextCursor);
        setUsedHasMore(result.hasMore);
      } else {
        setUnusedItems(prev => append ? [...prev, ...result.items] : result.items);
        setUnusedCursor(result.nextCursor);
        setUnusedHasMore(result.hasMore);
      }
    } catch (err) {
      console.error('Failed to fetch passes:', err);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      try {
        const fetcher = activeTab === 'used' ? getUsedPasses : getUnusedPasses;
        const result: GateListResponse = await fetcher(null, search);
        if (!ignore) {
          if (activeTab === 'used') {
            setUsedItems(result.items);
            setUsedCursor(result.nextCursor);
            setUsedHasMore(result.hasMore);
          } else {
            setUnusedItems(result.items);
            setUnusedCursor(result.nextCursor);
            setUnusedHasMore(result.hasMore);
          }
          setInitialLoading(false);
        }
      } catch (err) {
        console.error('Failed to load initial passes:', err);
        if (!ignore) {
          setInitialLoading(false);
        }
      }
    }
    loadInitial();
    return () => {
      ignore = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab switch
  const handleTabSwitch = (tab: ListTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    updateQueryParams(tab, search);

    // Load this tab's data if not loaded yet
    const tabItems = tab === 'used' ? usedItems : unusedItems;
    if (tabItems.length === 0) {
      fetchPage(tab, null, search);
    }
  };

  // Search with debounce
  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateQueryParams(activeTab, val);
      // Reset both tabs and refetch current
      setUsedItems([]);
      setUnusedItems([]);
      setUsedCursor(null);
      setUnusedCursor(null);
      setUsedHasMore(true);
      setUnusedHasMore(true);
      fetchPage(activeTab, null, val);
    }, 300);
  };

  // Load more (infinite scroll)
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const cursor = activeTab === 'used' ? usedCursor : unusedCursor;
    if (!cursor) return;
    fetchPage(activeTab, cursor, search, true);
  }, [loading, hasMore, activeTab, usedCursor, unusedCursor, search, fetchPage]);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Pull to refresh / manual refresh
  const handleRefresh = async () => {
    setLoading(true);
    try {
      const [newCounts] = await Promise.all([
        getPassCounts(),
        fetchPage(activeTab, null, search),
      ]);
      setCounts(newCounts);
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gate-list-container">
      {/* ── Role Indicator ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <span className="badge-scanner" title={`Active role: ${userRole}`}>
          {userRole === 'scanner' ? 'Scanner View (Masked Codes)' : 'Organiser View (Full Codes)'}
        </span>
      </div>

      {/* ── Header Totals ── */}
      <div className="gate-list-totals">
        <div className="gate-list-stat">
          <span className="gate-list-stat-value">{counts.total}</span>
          <span className="gate-list-stat-label">Total Passes</span>
        </div>
        <div className="gate-list-stat stat-used" style={{ background: 'var(--green-bg)', borderColor: 'var(--green)' }}>
          <span className="gate-list-stat-value" style={{ color: 'var(--green)' }}>
            {counts.peopleAdmittedTonight ?? counts.used}
          </span>
          <span className="gate-list-stat-label" style={{ color: 'var(--green)' }}>People Tonight</span>
        </div>
        <div className="gate-list-stat stat-used">
          <span className="gate-list-stat-value">{counts.used}</span>
          <span className="gate-list-stat-label">Admitted</span>
        </div>
        <div className="gate-list-stat stat-unused">
          <span className="gate-list-stat-value">{counts.unused}</span>
          <span className="gate-list-stat-label">Unused</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm gate-list-refresh-btn"
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh counts"
        >
          🔄
        </button>
      </div>

      {/* ── Search ── */}
      <div className="gate-list-search">
        <input
          type="text"
          className="form-input gate-list-search-input"
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          aria-label="Search passes"
        />
        {search && (
          <button
            type="button"
            className="clear-search-btn"
            onClick={() => handleSearch('')}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Segmented Tabs ── */}
      <div className="gate-list-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'used'}
          className={`gate-list-tab ${activeTab === 'used' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('used')}
        >
          ✓ Admitted / Used ({counts.used})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'unused'}
          className={`gate-list-tab ${activeTab === 'unused' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('unused')}
        >
          ○ Unused ({counts.unused})
        </button>
      </div>

      {/* ── List ── */}
      {initialLoading ? (
        <div className="gate-list-loading">
          <span className="spinner" />
          <span>Loading passes…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="gate-list-empty">
          <p>
            {search
              ? `No ${activeTab} passes matching "${search}".`
              : `No ${activeTab} passes found.`}
          </p>
        </div>
      ) : (
        <div className="gate-list-items" role="list">
          {items.map((item) => (
            <div key={item.id} className="gate-list-item" role="listitem">
              <div className="gate-list-item-header">
                <span className="gate-list-item-name">
                  {item.name || 'Unassigned'}
                </span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <span className={item.ticket_type === 'seasonal' ? 'badge-seasonal' : 'badge-single'}>
                    {item.ticket_type === 'seasonal' ? 'Seasonal' : 'Single'}
                  </span>
                  {(item.party_size || 1) > 1 && (
                    <span className="badge badge-sm" style={{ background: '#4b5563', color: '#fff' }}>
                      Party of {item.party_size}
                    </span>
                  )}
                  <span className={`badge badge-${item.category}`}>
                    {CATEGORY_LABELS[item.category as PassCategory]}
                  </span>
                </div>
              </div>
              <div className="gate-list-item-meta">
                <code className="gate-list-item-code">{item.manual_code}</code>
                <span className={`badge badge-sm badge-${item.status}`}>
                  {item.validity_state === 'completed'
                    ? 'Completed'
                    : item.status === 'used'
                    ? 'Admitted'
                    : 'Unused'}
                </span>
              </div>
              <div className="gate-list-item-details">
                <span className="gate-list-detail">
                  Created: {formatDate(item.created_at)}
                </span>
                {item.used_at && (
                  <span className="gate-list-detail">
                    Last Admitted: {formatDate(item.used_at)}
                  </span>
                )}
                {item.scan_gate && (
                  <span className="gate-list-detail">
                    Gate: {item.scan_gate}
                  </span>
                )}
                {item.scan_method && (
                  <span className="gate-list-detail">
                    Method: {(item.scan_method as ScanMethod).toUpperCase()}
                  </span>
                )}
                {item.scanned_by && (
                  <span className="gate-list-detail">
                    Scanner: {item.scanned_by.slice(0, 8)}…
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="gate-list-sentinel">
            {loading && hasMore && (
              <div className="gate-list-loading-more">
                <span className="spinner spinner-sm" />
                <span>Loading more…</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
