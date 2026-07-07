// @sdd-spec admin/bulk-actor-operations (T-6)
'use client';

/**
 * /admin/actors — Admin actor registry console (Admin only).
 *
 * Static-export safe: 'use client'; no SSR / route handlers.
 * Auth guard: the (admin) layout already wraps this in <RequireRole allow={['Admin']}>;
 * we additionally guard API calls to never execute without a token.
 *
 * States:
 *   loading   — skeleton rows while adminListActors is in-flight.
 *   error     — error banner + retry button; AuthFailureError routes to /login.
 *   empty     — friendly empty state when no actors match the filters.
 *   populated — ActorsTable with filters + pagination + selection.
 *
 * Filters: region, traderType, consentStatus (dropdown selects).
 * Pagination: page and pageSize controls (server-driven).
 *
 * Success affordance: a transient success banner (aria-live="polite") reserved
 * for T-7 bulk-mutation messages.
 *
 * Tokens only; WCAG 2.1 AA.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { getSession } from '@/lib/auth/auth-client';
import {
  adminListActors,
  type AdminActor,
  type AdminActorListQuery,
} from '@/lib/api/actors-admin';
import { AuthFailureError } from '@/lib/api/client';

import { ActorsTable } from '@/components/admin/ActorsTable';
import Skeleton from '@/components/ui/Skeleton';

import { REGIONS } from '@/lib/content/regions';
import { ROLES } from '@/lib/content/roles';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const CONSENT_OPTIONS: { value: AdminActorListQuery['consentStatus']; label: string }[] = [
  { value: 'GRANTED', label: 'Published (GRANTED)' },
  { value: 'DENIED',  label: 'Hidden (DENIED)' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

// ---------------------------------------------------------------------------
// Filter select primitive
// ---------------------------------------------------------------------------

interface FilterSelectProps {
  id: string;
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'All',
}: FilterSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        disabled={disabled}
        aria-label={label}
        className={[
          'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'border-border',
        ].join(' ')}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading rows
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading actors" className="flex flex-col gap-3">
      {/* Filter bar skeleton */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>

      {/* Desktop skeleton */}
      <div className="hidden md:block rounded-md border border-border overflow-hidden">
        <div className="bg-surface-alt px-4 py-3 flex gap-4">
          <Skeleton className="h-3 w-8 rounded-sm" />
          <Skeleton className="h-3 w-40 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-32 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border-t border-border px-4 py-3 flex gap-4 items-center"
          >
            <Skeleton className="h-4 w-5 rounded-sm" />
            <Skeleton className="h-4 w-40 rounded-sm" />
            <Skeleton className="h-4 w-24 rounded-sm" />
            <Skeleton className="h-4 w-28 rounded-sm" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-24 rounded-sm" />
            <Skeleton className="h-4 w-32 rounded-sm" />
            <Skeleton className="h-4 w-28 rounded-sm" />
          </div>
        ))}
      </div>

      {/* Mobile skeleton */}
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-3/4 rounded-sm" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-1/2 rounded-sm" />
            <Skeleton className="h-3 w-2/3 rounded-sm" />
            <Skeleton className="h-3 w-1/2 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ActorsPage() {
  const router = useRouter();

  // ── Data state ────────────────────────────────────────────────────────────

  const [token,          setToken]          = useState<string | null>(null);
  const [actors,         setActors]         = useState<AdminActor[]>([]);
  const [total,          setTotal]          = useState(0);
  const [page,           setPage]           = useState(1);
  const [pageSize,       setPageSize]       = useState(DEFAULT_PAGE_SIZE);
  const [filters,        setFilters]        = useState<AdminActorListQuery>({});
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | undefined>();

  // ── Selection state ───────────────────────────────────────────────────────

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Success banner ────────────────────────────────────────────────────────

  const [successMsg, setSuccessMsg] = useState<string | undefined>();
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccess = useCallback((msg: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMsg(msg);
    successTimerRef.current = setTimeout(() => setSuccessMsg(undefined), 3000);
  }, []);

  // ── Auth failure → /login ─────────────────────────────────────────────────

  const handleAuthFailure = useCallback(() => {
    router.push('/login');
  }, [router]);

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchActors = useCallback(
    async (tok: string, query: AdminActorListQuery) => {
      try {
        const result = await adminListActors(query, tok);
        setActors(result.data);
        setTotal(result.total);
      } catch (caught: unknown) {
        if (caught instanceof AuthFailureError) {
          handleAuthFailure();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Failed to load actors.');
      }
    },
    [handleAuthFailure]
  );

  // ── On mount: resolve token then load page 1 ──────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(undefined);

      const session = await getSession();
      if (cancelled) return;

      if (!session) {
        handleAuthFailure();
        return;
      }

      setToken(session.accessToken);
      await fetchActors(session.accessToken, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

      if (!cancelled) setLoading(false);
    }

    void init();
    return () => { cancelled = true; };
  // fetchActors is stable; run once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch when pagination or filters change ───────────────────────────────

  useEffect(() => {
    if (!token) return;
    const currentToken = token;

    setLoading(true);
    setError(undefined);
    setSelectedIds(new Set()); // selection is page-scoped

    let cancelled = false;

    async function load() {
      await fetchActors(currentToken, { ...filters, page, pageSize });
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, [token, page, pageSize, filters, fetchActors]);

  // ── Filter handlers ───────────────────────────────────────────────────────

  const handleFilterChange = useCallback(
    (next: Partial<AdminActorListQuery>) => {
      setFilters((prev) => ({ ...prev, ...next }));
      setPage(1);
    },
    []
  );

  const handleClearFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  // ── Pagination handlers ───────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const handleRetry = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(undefined);
    await fetchActors(token, { ...filters, page, pageSize });
    setLoading(false);
  }, [token, filters, page, pageSize, fetchActors]);

  // ── Selection handlers ────────────────────────────────────────────────────

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allPageIds = actors.map((a) => a.id);
      const allSelected = allPageIds.every((id) => prev.has(id));
      const next = new Set(prev);

      if (allSelected) {
        allPageIds.forEach((id) => next.delete(id));
      } else {
        allPageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [actors]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const traderTypeOptions = Object.entries(ROLES).map(([value, meta]) => ({
    value,
    label: meta.label,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page heading ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-display text-2xl font-extrabold text-fg">
          Actor management
        </h1>
        <p className="mt-1 text-sm text-muted">
          View, filter, and select registry actors for bulk operations.
        </p>
      </div>

      {/* ── Success banner (reserved for T-7 mutations) ───────────────────── */}
      {successMsg && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md bg-highlight-tint border border-highlight-tint px-4 py-3 text-sm font-medium text-success"
        >
          {successMsg}
        </div>
      )}

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col gap-3 rounded-md border border-danger-soft bg-danger-soft px-4 py-4"
        >
          <p className="text-sm font-semibold text-danger">Could not load actors</p>
          <p className="text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className={[
              'self-start rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg',
              'transition-colors hover:bg-surface-alt',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            ].join(' ')}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {loading && <TableSkeleton />}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!loading && !error && actors.length === 0 && (
        <div
          aria-live="polite"
          className={[
            'flex flex-col items-center gap-3 rounded-md border border-border',
            'bg-surface py-16 px-4 text-center',
          ].join(' ')}
        >
          <p className="text-base font-semibold text-fg">No actors found</p>
          <p className="text-sm text-muted">
            {Object.keys(filters).length > 0
              ? 'Try clearing the filters to see more results.'
              : 'The registry is currently empty.'}
          </p>
          {Object.keys(filters).length > 0 && (
            <button
              type="button"
              onClick={handleClearFilters}
              className={[
                'rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-fg',
                'transition-colors hover:bg-surface-alt',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              ].join(' ')}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Populated state ───────────────────────────────────────────────── */}
      {!loading && !error && actors.length > 0 && token && (
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              id="filter-region"
              label="Region"
              value={filters.region}
              options={REGIONS.map((r) => ({ value: r, label: r }))}
              onChange={(region) => handleFilterChange({ region })}
              disabled={loading}
            />
            <FilterSelect
              id="filter-trader-type"
              label="Trader type"
              value={filters.traderType}
              options={traderTypeOptions}
              onChange={(traderType) => handleFilterChange({ traderType })}
              disabled={loading}
            />
            <FilterSelect
              id="filter-consent"
              label="Consent status"
              value={filters.consentStatus}
              options={CONSENT_OPTIONS.map((o) => ({
                value: o.value ?? '',
                label: o.label,
              }))}
              onChange={(consentStatus) =>
                handleFilterChange({
                  consentStatus: (consentStatus as AdminActorListQuery['consentStatus']) || undefined,
                })
              }
              disabled={loading}
            />

            {/* Page size */}
            <div className="flex flex-col gap-1">
              <label htmlFor="page-size" className="text-sm font-medium text-fg">
                Page size
              </label>
              <select
                id="page-size"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                disabled={loading}
                aria-label="Page size"
                className={[
                  'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'border-border',
                ].join(' ')}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <ActorsTable
            actors={actors}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
          />

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
            <p>
              Showing <span className="font-medium text-fg">{actors.length}</span> of{' '}
              <span className="font-medium text-fg">{total}</span> actors
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                aria-label="Previous page"
                className={[
                  'rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-fg',
                  'transition-colors hover:bg-surface-alt',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                ].join(' ')}
              >
                Previous
              </button>
              <span className="px-2">
                Page <span className="font-medium text-fg">{page}</span> of{' '}
                <span className="font-medium text-fg">{totalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                aria-label="Next page"
                className={[
                  'rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-fg',
                  'transition-colors hover:bg-surface-alt',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                ].join(' ')}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
