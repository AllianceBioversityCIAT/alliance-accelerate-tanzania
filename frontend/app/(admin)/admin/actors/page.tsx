// @sdd-spec admin/bulk-actor-operations (T-6)
// @sdd-spec actors/registration-source-and-consent (T-8)
'use client';

/**
 * /admin/actors — Admin actor registry console (Admin only).
 *
 * Static-export safe: 'use client'; no SSR / route handlers.
 * Auth guard: the (admin) layout already wraps this in <RequireRole allow={['Admin']}>;
 * we additionally guard API calls to never execute without a token.
 *
 * States:
 *   loading   — filter bar (present, disabled while in-flight) + skeleton
 *               rows while adminListActors is in-flight.
 *   error     — filter bar (interactive) + error banner + retry button;
 *               AuthFailureError routes to /login.
 *   empty     — filter bar (interactive) + friendly empty state when no
 *               actors match the filters.
 *   populated — filter bar + ActorsTable + pagination + selection.
 *
 * The filter bar (and its "Clear filters" escape hatch, shown whenever a
 * filter is set) renders unconditionally across all four states above — it
 * is not gated on `!loading && !error && actors.length > 0`, so a failed or
 * empty request never strands the admin without a way to change or clear
 * filters (T-8 rework, Issue 1; mirrors DirectoryView.tsx's filter-bar
 * placement above its own loading/error/empty ternary).
 *
 * Filters: region, traderType, consentStatus, registrationSource, consentMethod
 * (dropdown selects). Pagination: page and pageSize controls (server-driven).
 *
 * URL sync (T-8, FR-6): every filter and pagination value is read from
 * `useSearchParams()` and written via `router.replace()` — the repo's
 * query-param routing pattern (mirrors `components/directory/DirectoryView.tsx`
 * and `frontend/CLAUDE.md`). This is what makes filter state survive a reload,
 * and it is FR-9's enumeration mechanism: a shared link with
 * `?consentStatus=GRANTED&consentMethod=NOT_RECORDED` reproduces the exact
 * legacy unevidenced-consent set for any admin who opens it. The three
 * enum-valued filters (`consentStatus`, `registrationSource`,
 * `consentMethod`) are validated against their option lists on read
 * (`enumParam`); an unrecognized value (stale link, enum rename, typo)
 * degrades to "All" instead of reaching the API's `@IsIn` validation, which
 * would otherwise 400 and strand the admin behind a Retry loop.
 *
 * useSearchParams() triggers the Next.js static-export CSR bailout, so the
 * view is wrapped in <Suspense> by the default-exported page component below.
 *
 * Success affordance: a transient success banner (aria-live="polite") reserved
 * for T-7 bulk-mutation messages.
 *
 * Tokens only; WCAG 2.1 AA.
 */

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { getSession } from '@/lib/auth/auth-client';
import {
  adminListActors,
  bulkSetConsent,
  bulkDeleteActors,
  deleteActor,
  dateOnlyToInstant,
  type AdminActor,
  type AdminActorListQuery,
  type BulkResult,
  type ConsentMethod,
} from '@/lib/api/actors-admin';
import { AuthFailureError } from '@/lib/api/client';

import { ActorsTable } from '@/components/admin/ActorsTable';
import { BulkActionBar } from '@/components/admin/BulkActionBar';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { AcknowledgeDialog } from '@/components/admin/AcknowledgeDialog';
import Skeleton from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';

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

/** Registration-source filter options (T-8, FR-1/FR-6). */
const SOURCE_OPTIONS: { value: AdminActorListQuery['registrationSource']; label: string }[] = [
  { value: 'TEAM_MANAGED',   label: 'Team-managed' },
  { value: 'SELF_REGISTERED', label: 'Self-registered' },
];

/**
 * Consent-method filter options (T-8, FR-2/FR-6). `NOT_RECORDED` combined
 * with `consentStatus = GRANTED` is FR-9's enumeration mechanism for the
 * legacy unevidenced-consent backlog.
 */
const CONSENT_METHOD_OPTIONS: { value: AdminActorListQuery['consentMethod']; label: string }[] = [
  { value: 'NOT_RECORDED',    label: 'Not recorded' },
  { value: 'PORTAL_CHECKBOX', label: 'Portal checkbox' },
  { value: 'SIGNED_FORM',     label: 'Signed form' },
  { value: 'EMAIL',           label: 'Email' },
  { value: 'VERBAL_FIELD',    label: 'Verbal (field)' },
];

// ---------------------------------------------------------------------------
// URL param helpers (T-8) — mirrors components/directory/DirectoryView.tsx
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
 * Read an enum-valued filter param, but only accept it if it matches one of
 * the given option values. An unrecognized value — a typo when sharing a
 * link, or a link that outlives an enum rename — degrades to `undefined`
 * ("All") instead of flowing to `adminListActors` unchecked: the backend's
 * `@IsIn` validation 400s on an unknown `consentStatus`/`registrationSource`/
 * `consentMethod`, which used to strand the admin behind a Retry that
 * reissues the identical failing request forever (T-8 rework, Issue 1).
 */
function enumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  options: readonly { value: T | undefined }[],
): T | undefined {
  const raw = param(params, key);
  if (raw == null) return undefined;
  return options.some((o) => o.value === raw) ? (raw as T) : undefined;
}

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
      {/*
        No filter-bar skeleton here — the real filter bar (present, disabled
        while in-flight) now renders unconditionally above this component in
        ActorsView (T-8 rework, Issue 1), so a duplicate skeleton would just
        stack a second, disabled filter row underneath the real one.
      */}

      {/* Desktop skeleton */}
      <div className="hidden md:block rounded-md border border-border overflow-hidden">
        <div className="bg-surface-alt px-4 py-3 flex gap-4">
          <Skeleton className="h-3 w-8 rounded-sm" />
          <Skeleton className="h-3 w-40 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-24 rounded-sm" />
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
            <Skeleton className="h-5 w-20 rounded-full" />
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
// View (uses useSearchParams — must be rendered inside <Suspense>)
// ---------------------------------------------------------------------------

function ActorsView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Read filter + pagination state from the URL (T-8) ──────────────────────

  const region = param(searchParams, 'region');
  const traderType = param(searchParams, 'traderType');
  // Validated against their option lists (T-8 rework, Issue 1) — an
  // unrecognized value degrades to "All" rather than reaching the API.
  const consentStatus = enumParam(searchParams, 'consentStatus', CONSENT_OPTIONS);
  const registrationSource = enumParam(searchParams, 'registrationSource', SOURCE_OPTIONS);
  const consentMethod = enumParam(searchParams, 'consentMethod', CONSENT_METHOD_OPTIONS);
  const page = pageParam(searchParams);
  const pageSize = pageSizeParam(searchParams);

  const filters: AdminActorListQuery = {
    ...(region ? { region } : {}),
    ...(traderType ? { traderType } : {}),
    ...(consentStatus ? { consentStatus } : {}),
    ...(registrationSource ? { registrationSource } : {}),
    ...(consentMethod ? { consentMethod } : {}),
  };

  // ── Data state ────────────────────────────────────────────────────────────

  const [token,          setToken]          = useState<string | null>(null);
  const [actors,         setActors]         = useState<AdminActor[]>([]);
  const [total,          setTotal]          = useState(0);
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

  // ── Bulk-action dialog state ──────────────────────────────────────────────

  type DialogKind = 'unlock' | 'lock' | 'delete' | null;

  const [activeDialog, setActiveDialog] = useState<DialogKind>(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [dialogError, setDialogError] = useState<string | undefined>();

  // ── Bulk unlock consent-provenance inputs (T-10, FR-3, DD-4) ──────────────
  //
  // Owned here (not inside AcknowledgeDialog) because handleUnlockConfirm
  // needs the values at confirm time to build the bulkSetConsent request.
  // Reset on open/close so a stale value from a previous unlock never
  // carries into the next one.

  const [unlockMethod, setUnlockMethod] = useState<ConsentMethod | ''>('');
  const [unlockDate, setUnlockDate] = useState('');

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

  // ── On mount: resolve token; the pagination/filter effect will load data ──

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
    return () => { cancelled = true; };
  }, [handleAuthFailure]);

  // ── Fetch when pagination or filters (URL) change ─────────────────────────
  //
  // Dependencies are the primitive URL values rather than the `filters`
  // object itself — `filters` is a fresh object every render, so depending on
  // it directly would re-run this effect (and refetch) on every render.

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    token,
    page,
    pageSize,
    region,
    traderType,
    consentStatus,
    registrationSource,
    consentMethod,
    fetchActors,
  ]);

  // ── URL write helper (T-8) — mirrors components/directory/DirectoryView.tsx ─

  /**
   * Push a new query-string onto the URL without a full navigation.
   * Uses router.replace() (shallow) so successive filter/pagination changes
   * update the current URL in place instead of each pushing a new history
   * entry — the back button takes the admin out of this filtered view in one
   * step, not through every intermediate filter state. Static-export safe
   * (no SSR).
   */
  const pushParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const p = new URLSearchParams();
      // Preserve existing params that are not being overwritten.
      searchParams.forEach((v, k) => {
        if (!(k in next)) p.set(k, v);
      });
      // Apply new values (omit undefined = clear that param).
      Object.entries(next).forEach(([k, v]) => {
        if (v != null && v !== '') p.set(k, v);
      });
      const qs = p.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  // ── Filter handlers ───────────────────────────────────────────────────────

  const handleFilterChange = useCallback(
    (next: Record<string, string | undefined>) => {
      pushParams({ ...next, page: undefined }); // any filter change resets to page 1
    },
    [pushParams]
  );

  const handleClearFilters = useCallback(() => {
    pushParams({
      region: undefined,
      traderType: undefined,
      consentStatus: undefined,
      registrationSource: undefined,
      consentMethod: undefined,
      page: undefined,
    });
  }, [pushParams]);

  // ── Pagination handlers ───────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handlePageSizeChange = useCallback(
    (size: number) => {
      pushParams({ pageSize: String(size), page: undefined });
    },
    [pushParams]
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
    await fetchActors(token, { ...filters, page, pageSize });
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, region, traderType, consentStatus, registrationSource, consentMethod, page, pageSize, fetchActors]);

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

  // ── Row action handlers ───────────────────────────────────────────────────

  const handleEditActor = useCallback((actor: AdminActor) => {
    router.push(`/admin/actors/edit?id=${actor.id}`);
  }, [router]);

  const handleDeleteActor = useCallback(
    async (actor: AdminActor) => {
      if (!token) return;
      await fetchActors(token, { ...filters, page, pageSize });
      showSuccess(`Deleted ${actor.traderName}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, region, traderType, consentStatus, registrationSource, consentMethod, page, pageSize, fetchActors, showSuccess],
  );

  // ── Bulk action result summary ────────────────────────────────────────────

  const formatResultSummary = useCallback(
    (verb: string, result: BulkResult, preserved?: number): string => {
      const parts = [`${verb} ${result.applied} actor${result.applied === 1 ? '' : 's'}`];
      if (result.notFound.length > 0) {
        parts.push(`${result.notFound.length} not found`);
      }
      // T-10 (DD-4) — surfaces how many selected actors already carried their
      // own consent method + date and so were left untouched by the batch
      // fill. Only passed by the unlock flow; grammatical at both 0 and 1.
      if (preserved !== undefined) {
        parts.push(
          `${preserved} actor${preserved === 1 ? '' : 's'} already had evidence on file and kept it unchanged`,
        );
      }
      return parts.join('. ') + '.';
    },
    []
  );

  // ── Bulk action handlers ──────────────────────────────────────────────────

  const ids = Array.from(selectedIds);

  const handleUnlockConfirm = useCallback(async () => {
    if (!token || ids.length === 0) return;
    setDialogError(undefined);
    setDialogLoading(true);
    try {
      const result = await bulkSetConsent(
        {
          ids,
          consentStatus: 'GRANTED',
          acknowledged: true,
          // T-10 (FR-3, DD-4) — batch provenance the dialog collects; the
          // server rejects the unlock with a 400 if either is missing.
          consentMethod: unlockMethod || undefined,
          consentObtainedAt: dateOnlyToInstant(unlockDate) ?? undefined,
        },
        token
      );
      setActiveDialog(null);
      setSelectedIds(new Set());
      await fetchActors(token, { ...filters, page, pageSize });
      showSuccess(formatResultSummary('Unlocked', result, result.preserved));
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        handleAuthFailure();
        return;
      }
      setDialogError(caught instanceof Error ? caught.message : 'Failed to unlock actors.');
    } finally {
      setDialogLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ids, unlockMethod, unlockDate, region, traderType, consentStatus, registrationSource, consentMethod, page, pageSize, fetchActors, showSuccess, formatResultSummary, handleAuthFailure]);

  const handleLockConfirm = useCallback(async () => {
    if (!token || ids.length === 0) return;
    setDialogError(undefined);
    setDialogLoading(true);
    try {
      const result = await bulkSetConsent(
        { ids, consentStatus: 'DENIED' },
        token
      );
      setActiveDialog(null);
      setSelectedIds(new Set());
      await fetchActors(token, { ...filters, page, pageSize });
      showSuccess(formatResultSummary('Locked', result));
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        handleAuthFailure();
        return;
      }
      setDialogError(caught instanceof Error ? caught.message : 'Failed to lock actors.');
    } finally {
      setDialogLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ids, region, traderType, consentStatus, registrationSource, consentMethod, page, pageSize, fetchActors, showSuccess, formatResultSummary, handleAuthFailure]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!token || ids.length === 0) return;
    setDialogError(undefined);
    setDialogLoading(true);
    try {
      const result = await bulkDeleteActors({ ids }, token);
      setActiveDialog(null);
      setSelectedIds(new Set());
      await fetchActors(token, { ...filters, page, pageSize });
      showSuccess(formatResultSummary('Deleted', result));
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        handleAuthFailure();
        return;
      }
      setDialogError(caught instanceof Error ? caught.message : 'Failed to delete actors.');
    } finally {
      setDialogLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ids, region, traderType, consentStatus, registrationSource, consentMethod, page, pageSize, fetchActors, showSuccess, formatResultSummary, handleAuthFailure]);

  const openDialog = useCallback((kind: Exclude<DialogKind, null>) => {
    setDialogError(undefined);
    setActiveDialog(kind);
    // T-10 — a stale method/date from a previous unlock must never carry
    // into the next one; AcknowledgeDialog resets its own acknowledgement
    // text on open, but this provenance state is caller-owned.
    setUnlockMethod('');
    setUnlockDate('');
  }, []);

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
    setDialogError(undefined);
    setUnlockMethod('');
    setUnlockDate('');
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────────

  const traderTypeOptions = Object.entries(ROLES).map(([value, meta]) => ({
    value,
    label: meta.label,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page heading ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-fg">
            Actor management
          </h1>
          <p className="mt-1 text-sm text-muted">
            View, filter, and select registry actors for bulk operations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" href="/admin/actors/import">
            Import
          </Button>
          <Button variant="primary" href="/admin/actors/new">
            New actor
          </Button>
        </div>
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

      {/*
        ── Filters + page size (T-8 rework, Issue 1) ──────────────────────
        Rendered unconditionally, above the loading/error/empty/populated
        split below — never gated on `!loading && !error && actors.length > 0`.
        A filter/pagination change never needs `token` (it only rewrites the
        URL), so this can render before the session resolves too. Mirrors
        DirectoryView.tsx's placement of its search+filters bar above its own
        states ternary.
      */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="filter-region"
            label="Region"
            value={region}
            options={REGIONS.map((r) => ({ value: r, label: r }))}
            onChange={(value) => handleFilterChange({ region: value })}
            disabled={loading}
          />
          <FilterSelect
            id="filter-trader-type"
            label="Trader type"
            value={traderType}
            options={traderTypeOptions}
            onChange={(value) => handleFilterChange({ traderType: value })}
            disabled={loading}
          />
          <FilterSelect
            id="filter-consent"
            label="Consent status"
            value={consentStatus}
            options={CONSENT_OPTIONS.map((o) => ({ value: o.value ?? '', label: o.label }))}
            onChange={(value) => handleFilterChange({ consentStatus: value })}
            disabled={loading}
          />
          <FilterSelect
            id="filter-registration-source"
            label="Registration source"
            value={registrationSource}
            options={SOURCE_OPTIONS.map((o) => ({ value: o.value ?? '', label: o.label }))}
            onChange={(value) => handleFilterChange({ registrationSource: value })}
            disabled={loading}
          />
          <FilterSelect
            id="filter-consent-method"
            label="Consent method"
            value={consentMethod}
            options={CONSENT_METHOD_OPTIONS.map((o) => ({ value: o.value ?? '', label: o.label }))}
            onChange={(value) => handleFilterChange({ consentMethod: value })}
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

        {/* Clear filters — reachable whenever a filter is set, in every state */}
        {Object.keys(filters).length > 0 && (
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
      </div>

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
        </div>
      )}

      {/* ── Populated state ───────────────────────────────────────────────── */}
      {!loading && !error && actors.length > 0 && token && (
        <>
          {/* Bulk action bar */}
          <BulkActionBar
            selectedCount={selectedIds.size}
            onUnlock={() => openDialog('unlock')}
            onLock={() => openDialog('lock')}
            onDelete={() => openDialog('delete')}
            loading={dialogLoading}
          />

          {/* Table */}
          <ActorsTable
            actors={actors}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
            token={token}
            onDelete={handleDeleteActor}
            onEdit={handleEditActor}
            onAuthFailure={handleAuthFailure}
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

      {/* ── Bulk-action dialogs ───────────────────────────────────────────── */}

      <AcknowledgeDialog
        open={activeDialog === 'unlock'}
        title={`Unlock ${selectedIds.size} actor${selectedIds.size === 1 ? '' : 's'}?`}
        description="Unlocking publishes the selected actors' PII and GPS coordinates to the public directory. Only confirm if written consent is on file for every selected actor."
        acknowledgementText="I confirm consent is on file"
        confirmLabel="Unlock"
        onConfirm={handleUnlockConfirm}
        onCancel={closeDialog}
        loading={dialogLoading}
        error={dialogError}
        provenance={{
          method: unlockMethod,
          onMethodChange: setUnlockMethod,
          date: unlockDate,
          onDateChange: setUnlockDate,
        }}
      />

      <ConfirmDialog
        open={activeDialog === 'lock'}
        title={`Lock ${selectedIds.size} actor${selectedIds.size === 1 ? '' : 's'}?`}
        description="Locking hides the selected actors from the public directory and map. Their records remain in the registry."
        confirmLabel="Lock"
        onConfirm={handleLockConfirm}
        onCancel={closeDialog}
        loading={dialogLoading}
        error={dialogError}
      />

      <ConfirmDialog
        open={activeDialog === 'delete'}
        title={`Delete ${selectedIds.size} actor${selectedIds.size === 1 ? '' : 's'}?`}
        description="This will permanently delete the selected actors and their crop links. This action cannot be undone."
        acknowledgementText={`delete ${selectedIds.size} actor${selectedIds.size === 1 ? '' : 's'}`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={closeDialog}
        loading={dialogLoading}
        error={dialogError}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page with Suspense boundary (T-8 — useSearchParams static-export requirement)
// ---------------------------------------------------------------------------

export default function ActorsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ActorsView />
    </Suspense>
  );
}
