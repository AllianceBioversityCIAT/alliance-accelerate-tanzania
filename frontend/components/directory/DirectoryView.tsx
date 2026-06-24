'use client';

// DirectoryView — public /directory client view (FR-1, FR-2, FR-3, FR-8,
// NFR-1, NFR-3, NFR-4, NFR-5, NFR-6, NFR-7).
//
// T-4 extension: reads search/crop/role/region/page from useSearchParams() and
// writes via router.replace() (shallow, static-export safe). Any change to
// search or filters resets page to 1 (FR-2/3). The combined query drives
// useActors(). The result count reflects the filtered total across all pages.
//
// Static-export compliance (NFR-5): this component calls useSearchParams() so
// it MUST sit inside a <Suspense> boundary in the page. The boundary lives in
// frontend/app/(public)/directory/page.tsx — mirrors the profile page pattern.
//
// PII contract (NFR-1): PublicActor carries no phone/email — never rendered here.
// Token-driven: no raw hex (NFR-4).

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActors } from '@/lib/api/useActors';
import Skeleton from '@/components/ui/Skeleton';
import ResultCount from './ResultCount';
import ActorCard from './ActorCard';
import DirectorySearch from './DirectorySearch';
import DirectoryFilters from './DirectoryFilters';
import DirectoryPagination from './DirectoryPagination';
import type { ActorsQuery } from '@/lib/api/actors';

// ── Page size (per PRD OQ-5) ──────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── URL param helpers ─────────────────────────────────────────────────────────

/** Read a non-empty string param from URLSearchParams, else undefined. */
function param(params: URLSearchParams, key: string): string | undefined {
  const v = params.get(key);
  return v && v.trim() !== '' ? v : undefined;
}

/** Read a positive integer param; falls back to 1 on invalid/missing input. */
function pageParam(params: URLSearchParams): number {
  const raw = params.get('page');
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ── Skeleton grid (loading state) ─────────────────────────────────────────────

/** Placeholder card-shaped skeletons while actors are loading. */
function CardSkeletons({ count = 12 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading organizations" className="contents">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 shadow-sm"
          aria-hidden="true"
        >
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-32 rounded-full" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-2 h-7 w-28 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Main directory view: search + filters + result count + ActorCard grid +
 * pagination + states. All UI state is URL-synced via useSearchParams +
 * router.replace() (FR-2/3).
 *
 * MUST be rendered inside a <Suspense> boundary in the page because
 * useSearchParams() triggers the Next.js static-export CSR bailout.
 */
export default function DirectoryView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Read URL params ─────────────────────────────────────────────────────────

  const search = param(searchParams, 'search');
  const crop   = param(searchParams, 'crop');
  const role   = param(searchParams, 'role');
  const region = param(searchParams, 'region');
  const page   = pageParam(searchParams);

  // ── Build the API query from URL state ─────────────────────────────────────

  const query: ActorsQuery = {
    ...(search   ? { search }   : {}),
    ...(crop     ? { crop }     : {}),
    ...(role     ? { role }     : {}),
    ...(region   ? { region }   : {}),
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, loading, error } = useActors(query);

  const actors   = data?.data     ?? [];
  const total    = data?.total    ?? 0;
  const pageSize = data?.pageSize ?? PAGE_SIZE;

  // ── URL write helper ────────────────────────────────────────────────────────

  /**
   * Push a new query-string onto the URL without a full navigation.
   * Uses router.replace() (shallow) so the user can still use the back button
   * to undo multiple filter changes (the browser history still collapses
   * consecutive replaces to a single entry). Static-export safe (no SSR).
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

  // ── Search handler (debounce handled inside DirectorySearch) ───────────────

  const handleSearch = useCallback(
    (term: string) => {
      pushParams({ search: term || undefined, page: undefined });
    },
    [pushParams],
  );

  // ── Filter handler ─────────────────────────────────────────────────────────

  const handleFilters = useCallback(
    (next: Pick<ActorsQuery, 'crop' | 'role' | 'region'>) => {
      pushParams({
        crop:   next.crop   ?? undefined,
        role:   next.role   ?? undefined,
        region: next.region ?? undefined,
        page:   undefined,  // reset page to 1 (FR-2)
      });
    },
    [pushParams],
  );

  // ── Clear filters handler ──────────────────────────────────────────────────

  const handleClearFilters = useCallback(() => {
    pushParams({ crop: undefined, role: undefined, region: undefined, page: undefined });
  }, [pushParams]);

  // ── Pagination handler ─────────────────────────────────────────────────────

  const handlePageChange = useCallback(
    (newPage: number) => {
      pushParams({ page: String(newPage) });
    },
    [pushParams],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      {/* ── Page heading ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg">Actor Directory</h1>
        <p className="mt-1 text-sm text-muted">
          Tanzania seed system actors — sorghum, common bean, and groundnut value chains.
        </p>
      </div>

      {/* ── Search + Filters bar ─────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-4">
        <DirectorySearch value={search ?? ''} onSearch={handleSearch} />
        <DirectoryFilters
          filters={{ crop, role, region }}
          onChange={handleFilters}
          onClear={handleClearFilters}
        />
      </div>

      {/* ── Result count (aria-live, NFR-3) ──────────────────────────────────── */}
      <div className="mb-4">
        <ResultCount count={total} loading={loading} />
      </div>

      {/* ── Grid region ──────────────────────────────────────────────────────── */}
      {/*
        Responsive grid: 1 col on mobile → 2 on sm → 3 on lg (NFR-6).
        role="list" / aria-label on the grid container provides a semantic list
        landmark for screen readers so keyboard users can navigate directly (NFR-3).
      */}
      {loading ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Loading actor cards"
        >
          <CardSkeletons count={12} />
        </div>
      ) : error ? (
        <div
          className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface py-16 px-4 text-center"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-base font-semibold text-fg">
            Could not load organizations
          </p>
          <p className="text-sm text-muted">
            There was a problem reaching the directory. Please try again later.
          </p>
        </div>
      ) : actors.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface py-16 px-4 text-center"
          aria-live="polite"
        >
          <p className="text-base font-semibold text-fg">
            No organizations found
          </p>
          <p className="text-sm text-muted">
            Try adjusting your search or filters.
          </p>
          {(search || crop || role || region) && (
            <button
              type="button"
              onClick={() =>
                pushParams({
                  search: undefined,
                  crop:   undefined,
                  role:   undefined,
                  region: undefined,
                  page:   undefined,
                })
              }
              className={[
                'mt-2 rounded-md border border-border bg-surface px-3 py-1.5',
                'text-sm text-fg shadow-sm transition-colors',
                'hover:border-primary hover:bg-surface-alt',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              ].join(' ')}
            >
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <ul
          className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Actor directory"
        >
          {actors.map((actor) => (
            <li key={actor.id}>
              <ActorCard actor={actor} />
            </li>
          ))}
        </ul>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <DirectoryPagination
          page={page}
          total={total}
          pageSize={pageSize}
          onPageChange={handlePageChange}
        />
      )}

    </div>
  );
}
