'use client';

// ActorMap — dynamic-import wrapper around LeafletMap (DD-1, NFR-1).
//
// Keeps Leaflet (window-dependent) out of the static bundle by loading it
// through Next.js dynamic import with `ssr: false`. The page static-exports
// cleanly; Leaflet only boots in the browser.
//
// Handles FR-7 data states OVER the map region:
//   loading → accessible spinner/skeleton
//   error   → "Couldn't load actors" message — page never throws (DD-6)
//   empty   → "No actors match" message when the filter yields zero results
//   data    → renders LeafletMap with the actors array
//
// T-3: selectedActorId + onSelectActor now forwarded to LeafletMap.

import dynamic from 'next/dynamic';
import Skeleton from '@/components/ui/Skeleton';
import type { PublicActor, PublicActorList } from '@/lib/api/actors';

// ── Dynamic import (DD-1 / NFR-1) ───────────────────────────────────────────

// `ssr: false` prevents Leaflet from running at build/SSR time.
// The inline `loading` prop provides a concrete placeholder while the chunk loads.
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    // Shown while the LeafletMap JS chunk is being fetched (first load).
    // Accessible: role="status" with aria-label announces to screen readers.
    <div
      className="flex h-full min-h-[480px] w-full items-center justify-center bg-surface-alt"
      role="status"
      aria-label="Loading map"
    >
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-48 w-64 rounded-md" />
        <Skeleton className="h-4 w-32 rounded-sm" />
      </div>
    </div>
  ),
});

// ── Props ────────────────────────────────────────────────────────────────────

export interface ActorMapProps {
  /** Raw API response from useActors. Null when API is unavailable (DD-6). */
  data: PublicActorList | null;
  /** True while the useActors hook is in-flight. */
  loading: boolean;
  /** True when getActors() resolved to null (API failure — DD-6). */
  error: boolean;
  /**
   * Currently selected actor ID — prop contract established for T-3/T-4
   * (map will fly-to and open popup when set). Unused in T-2.
   */
  selectedActorId: string | null;
  /**
   * Callback to set selectedActorId from within the map (pin click → T-3).
   * Declared here so the prop contract is stable before T-3 lands.
   */
  onSelectActor: (id: string | null) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ActorMap({
  data,
  loading,
  error,
  selectedActorId,
  onSelectActor,
}: ActorMapProps) {
  // Derive the actors array — empty when data is null/undefined.
  const actors: PublicActor[] = data?.data ?? [];

  // ── Loading state (FR-7) ──────────────────────────────────────────────────
  if (loading) {
    return (
      // Outer wrapper maintains the map region's dimensions during load.
      <div className="relative h-full min-h-[480px] w-full bg-surface-alt">
        <div
          className="absolute inset-0 flex items-center justify-center"
          role="status"
          aria-label="Loading actors"
        >
          <div className="flex flex-col items-center gap-3 p-6">
            <Skeleton className="h-48 w-64 rounded-md" />
            <Skeleton className="h-4 w-40 rounded-sm" />
            <Skeleton className="h-4 w-24 rounded-sm" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state (FR-7, DD-6) — API unavailable ───────────────────────────
  if (error) {
    return (
      <div
        className="flex h-full min-h-[480px] w-full flex-col items-center justify-center gap-3 bg-surface-alt px-6 text-center"
        role="alert"
        aria-live="polite"
      >
        {/* Token-driven icon placeholder — no raw hex (NFR-4) */}
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-border" aria-hidden="true">
          <span className="text-xl text-muted">!</span>
        </div>
        <p className="text-base font-medium text-fg">Couldn&apos;t load actors</p>
        <p className="text-sm text-muted">
          The map data is temporarily unavailable. Please try again shortly.
        </p>
      </div>
    );
  }

  // ── Empty state (FR-7) — filter yields zero results ──────────────────────
  if (actors.length === 0) {
    return (
      <div
        className="flex h-full min-h-[480px] w-full flex-col items-center justify-center gap-3 bg-surface-alt px-6 text-center"
        role="status"
        aria-live="polite"
        aria-label="No actors match the current filters"
      >
        <p className="text-base font-medium text-fg">No actors match</p>
        <p className="text-sm text-muted">
          Try adjusting your filters to see actors on the map.
        </p>
      </div>
    );
  }

  // ── Data state — render the Leaflet map ──────────────────────────────────
  return (
    // Wrapper fills the map region; LeafletMap itself is h-full min-h-[480px].
    <div className="h-full min-h-[480px] w-full">
      <LeafletMap
        actors={actors}
        selectedActorId={selectedActorId}
        onSelectActor={onSelectActor}
      />
    </div>
  );
}
