'use client';

// /map page — Discovery Map (FR-1, NFR-1, NFR-4, NFR-5).
//
// 'use client' required: owns page-local state (filters, selectedActorId)
// and consumes useActors (browser-side fetch).
//
// Layout: two-region side-by-side on ≥md.
//   Left  → rail placeholder (T-4 fills in <DiscoverRail>)
//   Right → <ActorMap> (fills remaining space, Leaflet loaded client-only)
//
// State:
//   filters         — ActorsQuery fed into useActors; starts empty ({}), T-4 populates.
//   selectedActorId — tracks the selected actor; synced between rail list and map
//                     (T-3 adds fly-to, T-4 adds list highlight — contract is stable now).
//
// Static export compliance (NFR-1): no getServerSideProps / getStaticProps /
// route handlers — Leaflet is loaded only inside <ActorMap> via dynamic import.
// Token discipline (NFR-4): no raw hex anywhere in this file.

import { useState } from 'react';
import { useActors } from '@/lib/api/useActors';
import type { ActorsQuery } from '@/lib/api/actors';
import ActorMap from '@/components/map/ActorMap';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MapPage() {
  // ── Page-local state ───────────────────────────────────────────────────────
  // filters: passed to useActors; T-4 provides <FilterControls> that set these.
  const [filters, setFilters] = useState<ActorsQuery>({});

  // selectedActorId: synced between the rail list (T-4) and the map (T-3).
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

  // Suppress "unused" warnings until T-3/T-4 consume them; the declarations
  // are intentional — the state contract is established here.
  void setFilters; // T-4: <FilterControls onChange={setFilters} />

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data, loading, error } = useActors(filters);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Full-bleed within <main> (PublicLayout has no container — pages own it).
    // flex-col on mobile (rail stacks above map); md:flex-row on wider screens.
    // min-h: keeps the combined region visible even with sparse content.
    <div className="flex min-h-[calc(100vh-4rem)] flex-col md:flex-row">

      {/*
        ── Rail placeholder ──────────────────────────────────────────────────
        T-4 replaces this <aside> with <DiscoverRail filters={filters}
          actors={data?.data ?? []} total={data?.total} loading={loading}
          selectedActorId={selectedActorId} onSelectActor={setSelectedActorId}
          onFilterChange={setFilters} />.

        Width: fixed rail on ≥md (w-72 = 288px, enough for filter controls +
        actor list). Collapses to a top strip on mobile until T-4 adds the
        bottom-sheet toggle (NFR-2).
        Tokens only: bg-surface-alt, border-border, text-muted (NFR-4).
      */}
      <aside
        className="
          flex w-full flex-col border-b border-border bg-surface-alt p-4
          md:w-72 md:min-h-full md:flex-shrink-0 md:border-b-0 md:border-r
        "
        aria-label="Discover actors"
      >
        {/* Placeholder heading — T-4 replaces with the live count + filters */}
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Discover actors
        </h2>
        <p className="text-sm text-muted">
          {/* Actor count placeholder — T-4 renders the live count here */}
          Filter controls and actor list coming in T-4.
        </p>
      </aside>

      {/*
        ── Map region ─────────────────────────────────────────────────────────
        flex-1: takes all horizontal space left after the rail on ≥md.
        min-h-[480px]: ensures a concrete height (Leaflet requires it).
        overflow-hidden: prevents Leaflet controls from bleeding out.
      */}
      <section
        className="relative flex-1 overflow-hidden"
        aria-label="Actor map region"
      >
        <ActorMap
          data={data}
          loading={loading}
          error={error}
          selectedActorId={selectedActorId}
          onSelectActor={setSelectedActorId}
        />
      </section>
    </div>
  );
}
