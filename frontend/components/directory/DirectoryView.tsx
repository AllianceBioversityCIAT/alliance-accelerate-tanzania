'use client';

// DirectoryView — public /directory client view (FR-1, FR-8, NFR-3, NFR-4, NFR-6, NFR-7).
//
// Calls useActors() with no query (default first page — T-4 will extend this with
// URL-synced search/filter/pagination). Renders:
//   • ResultCount — "N organizations found" in an aria-live region (NFR-3)
//   • ActorCard grid — responsive 1→2→3-column layout (NFR-6)
//   • Distinct loading (Skeleton rows) / empty / error states (FR-8)
//
// SCOPE BOUNDARY (T-3): no search, no filters, no pagination, no URL-sync.
// T-4 will extend this component by adding those controls. The component is
// structured to accept an optional `query` prop for forward compatibility.
//
// Token-driven: no raw hex (NFR-4). Static-export safe: no SSR/ISR (NFR-5).
// PII contract (NFR-1): PublicActor carries no phone/email — never rendered here.

import { useActors } from '@/lib/api/useActors';
import type { ActorsQuery } from '@/lib/api/actors';
import Skeleton from '@/components/ui/Skeleton';
import ResultCount from './ResultCount';
import ActorCard from './ActorCard';

// ── Props ─────────────────────────────────────────────────────────────────────

interface DirectoryViewProps {
  /**
   * Optional query forwarded to useActors.
   * T-3: not passed (default first page). T-4 will populate this from URL state.
   */
  query?: ActorsQuery;
}

// ── Skeleton grid (loading state) ─────────────────────────────────────────────

/** Renders N placeholder card-shaped skeletons while actors are loading. */
function CardSkeletons({ count = 12 }: { count?: number }) {
  return (
    // role="status" + aria-label announce to screen readers that loading is in progress.
    <div role="status" aria-label="Loading organizations" className="contents">
      {Array.from({ length: count }).map((_, i) => (
        // Mirrors the ActorCard structure so no layout shift on load.
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
 * Main directory view: result count + responsive ActorCard grid + states.
 * Structured so T-4 can extend it with search/filter/pagination by passing
 * a `query` prop and adding controls above the grid.
 */
export default function DirectoryView({ query }: DirectoryViewProps) {
  const { data, loading, error } = useActors(query);

  const actors = data?.data ?? [];
  const total  = data?.total ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      {/* ── Page heading ───────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg">Actor Directory</h1>
        <p className="mt-1 text-sm text-muted">
          Tanzania seed system actors — sorghum, common bean, and groundnut value chains.
        </p>
      </div>

      {/* ── Result count (aria-live, NFR-3) ────────────────────────────────── */}
      <div className="mb-4">
        <ResultCount count={total} loading={loading} />
      </div>

      {/* ── Grid region ────────────────────────────────────────────────────── */}
      {/*
        Responsive grid: 1 col on mobile → 2 on sm → 3 on lg (NFR-6).
        role="list" / aria-label on the grid container provides a semantic list
        landmark for screen readers so keyboard users can navigate to the card
        grid directly (NFR-3).
      */}
      {loading ? (
        // Loading state: Skeleton cards, no layout shift (FR-8).
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Loading actor cards"
        >
          <CardSkeletons count={12} />
        </div>
      ) : error ? (
        // Error state: distinct from empty; does not crash (FR-8, NFR-7).
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
        // Empty state: distinct from error; no actors matched (FR-8).
        <div
          className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface py-16 px-4 text-center"
          aria-live="polite"
        >
          <p className="text-base font-semibold text-fg">
            No organizations found
          </p>
          <p className="text-sm text-muted">
            No consented actors are currently listed in the directory.
          </p>
        </div>
      ) : (
        // Loaded state: responsive ActorCard grid (FR-1, NFR-6).
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
    </div>
  );
}
