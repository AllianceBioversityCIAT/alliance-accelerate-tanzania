// @sdd-spec admin/registration-review-queue (T-12)
'use client';

/**
 * /admin/registrations — Admin registrations review queue (Admin only, FR-9).
 *
 * Static-export safe: 'use client'; no SSR / route handlers. Auth guard: the
 * (admin) layout already wraps this in <RequireRole allow={['Admin']}>; we
 * additionally guard API calls to never execute without a token.
 *
 * Segments (FR-9 scenario 1): exactly three status tabs — Pending review,
 * Approved, Rejected. No control for AWAITING_APPLICANT/WITHDRAWN exists
 * anywhere on this page — a control that can never return a row is a
 * presence without a behaviour (KZ-002), and chunk 4 is what makes those two
 * statuses reachable. `STATUS_SEGMENTS` below is the exhaustive, closed list;
 * there is no "All" segment and no code path that can request either
 * excluded status.
 *
 * No "No email" flag anywhere on this page: email is required and
 * OTP-verified (3a FR-4), so the state that flag would describe cannot occur.
 *
 * Default view: `status=PENDING_REVIEW`, `sort=oldest` — the longest-waiting
 * applicant is reviewed first (FR-9 scenario 2).
 *
 * URL sync (FR-9 scenario 2, `frontend/CLAUDE.md` query-param routing):
 * `status`, `q`, `region`, `traderType`, `sort`, `page`, `pageSize` are all
 * read from `useSearchParams()` and written via `router.replace()` — mirrors
 * `app/(admin)/admin/actors/page.tsx`. `useSearchParams()` triggers the
 * Next.js static-export CSR bailout, so the view is wrapped in <Suspense> by
 * the default-exported page component below (NFR-7).
 *
 * Empty-state discrimination (FR-9 scenario 4): "nothing matches this filter
 * or page" is shown whenever the current filtered query has results
 * elsewhere (`total > 0`) but this page returned none — a page-beyond-the-
 * result-set overshoot. "No registrations at all" is claimed only when a
 * SEPARATE, unfiltered, pageSize=1 probe confirms the whole system has zero
 * registrations — never inferred from the current (filtered) `total` alone,
 * which cannot distinguish "nothing in this segment" from "nothing
 * anywhere" by itself. If that probe fails or has not resolved, the page
 * falls back to the filtered message rather than asserting global emptiness
 * it has not verified (KZ-008 — never claim what the code has not checked).
 *
 * No selection, no bulk action bar (D-3 excludes bulk approve/reject —
 * publication is a per-registration consent decision).
 *
 * Tokens only; WCAG 2.1 AA.
 */

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { getSession } from '@/lib/auth/auth-client';
import {
  adminListRegistrations,
  type AdminRegistrationListRow,
  type AdminRegistrationListQuery,
  type AdminRegistrationListSort,
  type RegistrationStatus,
} from '@/lib/api/registrations-admin';
import { AuthFailureError } from '@/lib/api/client';

import { RegistrationsTable } from '@/components/admin/RegistrationsTable';
import Skeleton from '@/components/ui/Skeleton';

import { REGIONS } from '@/lib/content/regions';
import { ROLES } from '@/lib/content/roles';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * The closed, three-member segment list (FR-9 scenario 1). This is the
 * ONLY place a `status` value is ever constructed for this page — there is
 * no other code path that can produce `AWAITING_APPLICANT` or `WITHDRAWN`
 * here.
 */
const STATUS_SEGMENTS: { value: RegistrationStatus; label: string }[] = [
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const DEFAULT_STATUS: RegistrationStatus = 'PENDING_REVIEW';
const DEFAULT_SORT: AdminRegistrationListSort = 'oldest';

// ---------------------------------------------------------------------------
// URL param helpers — mirrors app/(admin)/admin/actors/page.tsx
// ---------------------------------------------------------------------------

/** Read a non-empty string param from URLSearchParams, else undefined. */
function param(params: URLSearchParams, key: string): string | undefined {
  const v = params.get(key);
  return v && v.trim() !== '' ? v : undefined;
}

/** Read a positive integer page param; falls back to 1 on invalid/missing input. */
function pageParam(params: URLSearchParams): number {
  const raw = params.get('page');
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Read pageSize param; falls back to the default unless it is one of the allowed sizes. */
function pageSizeParam(params: URLSearchParams): number {
  const raw = params.get('pageSize');
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = parseInt(raw, 10);
  return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/**
 * Read the `status` segment param. An unrecognized or missing value — a
 * stale link, a typo, or (deliberately, since the DTO still validates the
 * full enum server-side per `admin-registration-list-query.dto.ts`) a
 * hand-edited `?status=AWAITING_APPLICANT` — always falls back to the
 * default segment rather than reaching the API with a value this page's UI
 * has no control for (FR-9 scenario 1's absence requirement).
 */
function statusParam(params: URLSearchParams): RegistrationStatus {
  const raw = param(params, 'status');
  return STATUS_SEGMENTS.some((s) => s.value === raw) ? (raw as RegistrationStatus) : DEFAULT_STATUS;
}

/** Read the `sort` param; falls back to `oldest` (FR-9 scenario 2's default). */
function sortParam(params: URLSearchParams): AdminRegistrationListSort {
  return param(params, 'sort') === 'newest' ? 'newest' : DEFAULT_SORT;
}

// ---------------------------------------------------------------------------
// Debounced applicant-name search (local — copy is specific to this query's
// `q` semantics: "free-text match against the applicant's organisation
// name" per admin-registration-list-query.dto.ts, not the directory's
// broader "name, region, or district" search, so this is not
// DirectorySearch reused with different copy).
// ---------------------------------------------------------------------------

function ApplicantSearch({ value, onSearch }: { value: string; onSearch: (term: string) => void }) {
  const [draft, setDraft] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    const id = setTimeout(() => onSearch(draft), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="registrations-search" className="text-sm font-medium text-fg">
        Search applicant
      </label>
      <input
        id="registrations-search"
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search by applicant name…"
        className={[
          'block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg',
          'placeholder:text-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        ].join(' ')}
        aria-label="Search registrations by applicant name"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter select primitive — mirrors app/(admin)/admin/actors/page.tsx
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
// Status segment control — a pressed-button group filtering the list in
// place, not a tab/panel widget (FR-9 scenario 1 — exactly three, no more)
// ---------------------------------------------------------------------------

function StatusSegments({
  value,
  onChange,
  disabled,
}: {
  value: RegistrationStatus;
  onChange: (next: RegistrationStatus) => void;
  disabled: boolean;
}) {
  return (
    <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
      {STATUS_SEGMENTS.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(segment.value)}
            className={[
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'bg-primary-soft text-primary font-semibold' : 'text-muted hover:bg-border hover:text-fg',
            ].join(' ')}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading rows — mirrors the `md` split in RegistrationsTable.tsx
// (a skeleton at a different breakpoint than the real content flashes the
// wrong shape, design.md §7.2)
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading registrations" className="flex flex-col gap-3">
      <div className="hidden md:block rounded-md border border-border overflow-hidden">
        <div className="bg-surface-alt px-4 py-3 flex gap-4">
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-40 rounded-sm" />
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton className="h-3 w-16 rounded-sm" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-t border-border px-4 py-3 flex gap-4 items-center">
            <Skeleton className="h-4 w-24 rounded-sm" />
            <Skeleton className="h-4 w-40 rounded-sm" />
            <Skeleton className="h-4 w-24 rounded-sm" />
            <Skeleton className="h-4 w-20 rounded-sm" />
            <Skeleton className="h-4 w-24 rounded-sm" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-16 rounded-sm" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-3/4 rounded-sm" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-1/2 rounded-sm" />
            <Skeleton className="h-3 w-2/3 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View (uses useSearchParams — must be rendered inside <Suspense>)
// ---------------------------------------------------------------------------

function RegistrationsView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Read filter + pagination state from the URL ─────────────────────────

  const status = statusParam(searchParams);
  const q = param(searchParams, 'q');
  const region = param(searchParams, 'region');
  const traderType = param(searchParams, 'traderType');
  const sort = sortParam(searchParams);
  const page = pageParam(searchParams);
  const pageSize = pageSizeParam(searchParams);

  const filters: AdminRegistrationListQuery = {
    status,
    ...(q ? { q } : {}),
    ...(region ? { region } : {}),
    ...(traderType ? { traderType } : {}),
    ...(sort !== DEFAULT_SORT ? { sort } : {}),
  };

  // ── Data state ────────────────────────────────────────────────────────

  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminRegistrationListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  /**
   * Empty-state discrimination (FR-9 scenario 4). `null` = not yet checked
   * (or the check itself failed) — treated the same as "unknown" below,
   * never as "confirmed empty".
   */
  const [systemEmpty, setSystemEmpty] = useState<boolean | null>(null);

  const handleAuthFailure = useCallback(() => {
    router.push('/login');
  }, [router]);

  // ── Fetch helpers ────────────────────────────────────────────────────

  const fetchRows = useCallback(
    async (tok: string, query: AdminRegistrationListQuery) => {
      try {
        const result = await adminListRegistrations(query, tok);
        setRows(result.data);
        setTotal(result.total);

        if (result.total > 0) {
          setSystemEmpty(false);
          return;
        }

        // The current (filtered) query has zero results — the only honest
        // way to tell "nothing in this segment/filter" from "nothing
        // anywhere" is a separate, unfiltered probe. Never inferred.
        try {
          const probe = await adminListRegistrations({ pageSize: 1 }, tok);
          setSystemEmpty(probe.total === 0);
        } catch {
          setSystemEmpty(null);
        }
      } catch (caught: unknown) {
        if (caught instanceof AuthFailureError) {
          handleAuthFailure();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Failed to load registrations.');
      }
    },
    [handleAuthFailure],
  );

  // ── On mount: resolve token; the pagination/filter effect loads data ────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const session = await getSession();
      if (cancelled) return;

      if (!session) {
        handleAuthFailure();
        return;
      }

      setToken(session.accessToken);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [handleAuthFailure]);

  // ── Fetch when pagination or filters (URL) change ────────────────────

  useEffect(() => {
    if (!token) return;
    const currentToken = token;

    setLoading(true);
    setError(undefined);

    let cancelled = false;

    async function load() {
      await fetchRows(currentToken, { ...filters, page, pageSize });
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status, q, region, traderType, sort, page, pageSize, fetchRows]);

  // ── URL write helper — mirrors app/(admin)/admin/actors/page.tsx ────────

  const pushParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const p = new URLSearchParams();
      searchParams.forEach((v, k) => {
        if (!(k in next)) p.set(k, v);
      });
      Object.entries(next).forEach(([k, v]) => {
        if (v != null && v !== '') p.set(k, v);
      });
      const qs = p.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  // ── Filter/segment/sort handlers ─────────────────────────────────────

  const handleStatusChange = useCallback(
    (next: RegistrationStatus) => {
      pushParams({ status: next === DEFAULT_STATUS ? undefined : next, page: undefined });
    },
    [pushParams],
  );

  const handleSearch = useCallback(
    (term: string) => {
      pushParams({ q: term || undefined, page: undefined });
    },
    [pushParams],
  );

  const handleRegionChange = useCallback(
    (value: string | undefined) => {
      pushParams({ region: value, page: undefined });
    },
    [pushParams],
  );

  const handleTraderTypeChange = useCallback(
    (value: string | undefined) => {
      pushParams({ traderType: value, page: undefined });
    },
    [pushParams],
  );

  const handleSortChange = useCallback(
    (next: AdminRegistrationListSort) => {
      pushParams({ sort: next === DEFAULT_SORT ? undefined : next, page: undefined });
    },
    [pushParams],
  );

  const handleClearFilters = useCallback(() => {
    pushParams({ q: undefined, region: undefined, traderType: undefined, page: undefined });
  }, [pushParams]);

  // ── Pagination handlers ──────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handlePageSizeChange = useCallback(
    (size: number) => {
      pushParams({ pageSize: String(size), page: undefined });
    },
    [pushParams],
  );

  const handlePrevPage = useCallback(() => {
    pushParams({ page: String(Math.max(1, page - 1)) });
  }, [pushParams, page]);

  const handleNextPage = useCallback(() => {
    pushParams({ page: String(Math.min(totalPages, page + 1)) });
  }, [pushParams, page, totalPages]);

  const handleRetry = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(undefined);
    await fetchRows(token, { ...filters, page, pageSize });
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status, q, region, traderType, sort, page, pageSize, fetchRows]);

  // ── Render helpers ───────────────────────────────────────────────────

  const traderTypeOptions = Object.entries(ROLES).map(([value, meta]) => ({
    value,
    label: meta.label,
  }));

  const hasNarrowingFilters = Boolean(q || region || traderType);

  // Page-beyond-result-set: this (filtered) query has other matches
  // elsewhere, just not on this page.
  const isPageOverEmpty = !loading && !error && rows.length === 0 && total > 0;
  // Nothing matches the current filter/segment at all.
  const isFilterEmpty = !loading && !error && rows.length === 0 && total === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page heading ──────────────────────────────────────────────── */}
      <div>
        <h1 className="font-display text-2xl font-extrabold text-fg">Registrations queue</h1>
        <p className="mt-1 text-sm text-muted">
          Review submitted registrations and approve or reject them for publication.
        </p>
      </div>

      {/* ── Status segments ──────────────────────────────────────────── */}
      <StatusSegments value={status} onChange={handleStatusChange} disabled={loading} />

      {/* ── Filters + sort + page size ───────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ApplicantSearch value={q ?? ''} onSearch={handleSearch} />
          <FilterSelect
            id="filter-region"
            label="Region"
            value={region}
            options={REGIONS.map((r) => ({ value: r, label: r }))}
            onChange={handleRegionChange}
            disabled={loading}
          />
          <FilterSelect
            id="filter-trader-type"
            label="Type"
            value={traderType}
            options={traderTypeOptions}
            onChange={handleTraderTypeChange}
            disabled={loading}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="sort-order" className="text-sm font-medium text-fg">
              Sort
            </label>
            <select
              id="sort-order"
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as AdminRegistrationListSort)}
              disabled={loading}
              aria-label="Sort order"
              className={[
                'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'border-border',
              ].join(' ')}
            >
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {hasNarrowingFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className={[
                'self-start rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-fg',
                'transition-colors hover:bg-surface-alt',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              ].join(' ')}
            >
              Clear filters
            </button>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="page-size" className="text-xs font-medium uppercase tracking-wide text-muted">
              Page size
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              disabled={loading}
              aria-label="Page size"
              className={[
                'block rounded-md border bg-surface px-3 py-2 text-sm text-fg',
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
      </div>

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col gap-3 rounded-md border border-danger-soft bg-danger-soft px-4 py-4"
        >
          <p className="text-sm font-semibold text-danger">Could not load registrations</p>
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

      {/* ── Loading state ─────────────────────────────────────────────── */}
      {loading && <TableSkeleton />}

      {/*
        ── Empty states (FR-9 scenario 4) — two distinct messages ────────
        "Page beyond the result set": other pages/filters in this query
        have matches, this page just does not.
      */}
      {isPageOverEmpty && (
        <div
          aria-live="polite"
          className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface py-16 px-4 text-center"
        >
          <p className="text-base font-semibold text-fg">Nothing on this page</p>
          <p className="text-sm text-muted">
            This page is beyond the current result set. Try an earlier page.
          </p>
        </div>
      )}

      {/*
        "No registrations match this filter" vs "no registrations at all" —
        the latter is claimed ONLY when the unfiltered probe confirmed it.
      */}
      {isFilterEmpty && (
        <div
          aria-live="polite"
          className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface py-16 px-4 text-center"
        >
          <p className="text-base font-semibold text-fg">
            {systemEmpty === true ? 'No registrations yet' : 'No registrations match this view'}
          </p>
          <p className="text-sm text-muted">
            {systemEmpty === true
              ? 'No organisation has submitted a registration yet.'
              : 'Try a different status, search term, or clear the filters.'}
          </p>
        </div>
      )}

      {/* ── Populated state ──────────────────────────────────────────── */}
      {!loading && !error && rows.length > 0 && (
        <>
          <RegistrationsTable rows={rows} />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
            <p>
              Showing <span className="font-medium text-fg">{rows.length}</span> of{' '}
              <span className="font-medium text-fg">{total}</span> registrations
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevPage}
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
                onClick={handleNextPage}
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

// ---------------------------------------------------------------------------
// Page with Suspense boundary (NFR-7 — useSearchParams static-export requirement)
// ---------------------------------------------------------------------------

export default function RegistrationsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <RegistrationsView />
    </Suspense>
  );
}
