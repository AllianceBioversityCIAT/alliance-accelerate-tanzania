'use client';

// DiscoverRail — the left-panel "Discover actors" rail.
//
// FR-1: Part of the /map page layout; always rendered.
// FR-4: Contains FilterControls (crop/role/region) that update page filters
//        → useActors refetches (DD-3 server-side filtering).
// FR-5: Contains ActorList; selecting an item sets selectedActorId → map fly-to.
// FR-7: Handles loading (Skeleton rows), error, and empty states.
// NFR-2: Responsive — on < md collapses to a "Filters & list" disclosure
//        toggle (bottom-area strip); on ≥ md is the persistent left rail.
// NFR-4: Token-driven classes only — no raw hex.
//
// Count header: uses `total` from the API response (PublicActorList.total).
// Falls back to `actors.length` if `total` is not provided.

import { useState } from 'react';
import type { ActorsQuery, PublicActor } from '@/lib/api/actors';
import Skeleton from '@/components/ui/Skeleton';
import FilterControls from './FilterControls';
import ActorList from './ActorList';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DiscoverRailProps {
  /** Actors returned by the current query (may be empty). */
  actors: PublicActor[];
  /**
   * Total count from the API pagination envelope (PublicActorList.total).
   * Used for the count header. Falls back to actors.length when undefined.
   */
  total?: number;
  /** True while useActors is in-flight. */
  loading: boolean;
  /** True when getActors() resolved to null (API failure, DD-6). */
  error: boolean;
  /** Current active filters — passed through to FilterControls. */
  filters: ActorsQuery;
  /** Currently selected actor id — drives list item highlight. */
  selectedActorId: string | null;
  /** Called when the user changes a filter select. Resets page to 1 (DD-3). */
  onFilterChange: (q: ActorsQuery) => void;
  /** Called when the user selects a list item. */
  onSelectActor: (id: string) => void;
}

// ── Skeleton rows (loading state, FR-7) ───────────────────────────────────────

function LoadingRows() {
  return (
    <div
      className="flex flex-col gap-2 px-1 py-2"
      role="status"
      aria-label="Loading actors"
    >
      {/* Three representative skeleton rows while data loads */}
      {/* Static width classes — no template interpolation (Tailwind purge safety). */}
      {(['w-3/4', 'w-1/2', 'w-2/3'] as const).map((w) => (
        <div key={w} className="flex flex-col gap-1.5 rounded-md bg-surface p-3">
          <Skeleton className={`h-4 ${w} rounded-sm`} />
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-3 w-32 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * DiscoverRail: header (count) + FilterControls + ActorList (or states).
 *
 * On < md: collapses to a "Filters & list" disclosure toggle so the map
 * fills mobile screen space (NFR-2). The toggle opens a panel layered over
 * the page content. On ≥ md: rendered inline as the persistent left rail.
 *
 * The rail body is the accessible non-map equivalent of the Leaflet map,
 * giving keyboard/screen-reader users a complete actor listing (NFR-3).
 */
export default function DiscoverRail({
  actors,
  total,
  loading,
  error,
  filters,
  selectedActorId,
  onFilterChange,
  onSelectActor,
}: DiscoverRailProps) {
  // ── Mobile disclosure state (NFR-2) ──────────────────────────────────────────
  // On < md the rail body is hidden by default; a toggle button reveals it.
  // On ≥ md (md:block) the panel is always visible regardless of this state.
  const [mobileOpen, setMobileOpen] = useState(false);

  // Count to display: prefer total from the pagination envelope (authoritative
  // server-side count); fall back to the length of the returned actors array.
  const displayCount = total ?? actors.length;

  // ── Rail body (shared between mobile panel and desktop rail) ─────────────────

  const railBody = (
    <div className="flex flex-col gap-4">
      {/* ── Filter controls (FR-4) ─────────────────────────────────────────── */}
      <FilterControls filters={filters} onChange={onFilterChange} />

      {/* ── Actor list / states (FR-5, FR-7) ─────────────────────────────── */}
      <div>
        {loading ? (
          <LoadingRows />
        ) : error ? (
          // Error state (FR-7, DD-6) — page must not throw.
          <div
            role="alert"
            className="rounded-md border border-border bg-surface p-4 text-sm text-muted"
          >
            Couldn&apos;t load actors. Please try again shortly.
          </div>
        ) : actors.length === 0 ? (
          // Empty state (FR-7) — filter yields no results.
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-border bg-surface p-4 text-sm text-muted"
          >
            No actors match your filters. Try adjusting the crop, role, or region.
          </div>
        ) : (
          // Scrollable actor list (FR-5, NFR-3).
          <div className="max-h-[calc(100vh-18rem)] overflow-y-auto rounded-md">
            <ActorList
              actors={actors}
              selectedActorId={selectedActorId}
              onSelectActor={(id) => {
                onSelectActor(id);
                // On mobile, collapse the rail after selection so the map is visible.
                setMobileOpen(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <aside
      aria-label="Discover actors"
      className={[
        // Full-height left rail on ≥ md; auto-height strip on mobile.
        'flex flex-col border-b border-border bg-surface-alt',
        'md:w-72 md:min-h-full md:flex-shrink-0 md:border-b-0 md:border-r',
      ].join(' ')}
    >
      {/* ── Rail header: count + title ─────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Discover actors
          </h2>
          {/* Actor count (FR-4 — "N actors shown") */}
          <p
            className="text-xs text-muted"
            aria-live="polite"
            aria-atomic="true"
          >
            {loading ? (
              // Don't announce count while loading.
              <span className="sr-only">Loading actor count</span>
            ) : (
              <>{displayCount} actor{displayCount !== 1 ? 's' : ''} shown</>
            )}
          </p>
        </div>

        {/* ── Mobile toggle button (NFR-2) ─────────────────────────────────── */}
        {/* Shown only on < md; hidden on ≥ md via md:hidden */}
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
          aria-controls="discover-rail-body"
          className={[
            'rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'md:hidden',
          ].join(' ')}
        >
          {mobileOpen ? 'Hide list' : 'Filters & list'}
        </button>
      </div>

      {/* ── Rail body ────────────────────────────────────────────────────────── */}
      {/* On mobile: conditionally shown via mobileOpen state.                  */}
      {/* On ≥ md: always visible (md:block overrides the mobile hidden state). */}
      <div
        id="discover-rail-body"
        className={[
          'flex-1 overflow-y-auto p-4',
          // Mobile: hidden when closed, block when open.
          mobileOpen ? 'block' : 'hidden',
          // Desktop: always block regardless of mobileOpen.
          'md:block',
        ].join(' ')}
      >
        {railBody}
      </div>
    </aside>
  );
}
