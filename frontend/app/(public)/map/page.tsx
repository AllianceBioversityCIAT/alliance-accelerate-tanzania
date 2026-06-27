'use client';

// /map page — Discovery Map (FR-1, NFR-1, NFR-4, NFR-5).
//
// 'use client' required: owns page-local state (filters, selectedActorId)
// and consumes useDashboardActors (browser-side fetch, all pages).
//
// Layout: two-region side-by-side on ≥md.
//   Left  → rail placeholder (T-4 fills in <DiscoverRail>)
//   Right → <ActorMap> (fills remaining space, Leaflet loaded client-only)
//
// State:
//   filters         — ActorsQuery fed into useDashboardActors; starts empty ({}).
//   selectedActorId — tracks the selected actor; synced between rail list and map
//                     (T-3 adds fly-to, T-4 adds list highlight — contract is stable now).
//
// Static export compliance (NFR-1): no getServerSideProps / getStaticProps /
// route handlers — Leaflet is loaded only inside <ActorMap> via dynamic import.
// Token discipline (NFR-4): no raw hex anywhere in this file.

import { useState, useEffect } from 'react';
import { useDashboardActors } from '@/lib/dashboard/useDashboardActors';
import type { ActorsQuery, PublicActorList } from '@/lib/api/actors';
import ActorMap from '@/components/map/ActorMap';
import DiscoverRail from '@/components/map/DiscoverRail';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MapPage() {
  // ── Page-local state ───────────────────────────────────────────────────────
  // filters: passed to useDashboardActors; T-4 provides <FilterControls> that set these.
  const [filters, setFilters] = useState<ActorsQuery>({});

  // selectedActorId: synced between the rail list (T-4) and the map (T-3).
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  // useDashboardActors accumulates ALL matching actors across pages (pageSize=100,
  // up to 10 pages = 1 000 actors) so the map always plots the full result set
  // rather than a single 20-actor page (bug: map/page T-1).
  const { actors, total, loading, error } = useDashboardActors(filters);

  // Build the PublicActorList shape expected by <ActorMap data=…>.
  const data: PublicActorList = {
    data: actors,
    page: 1,
    pageSize: actors.length,
    total,
  };

  // Region dropdown options: only the regions that actually have actors.
  // Captured from the loaded set whenever NO region filter is applied, so that
  // selecting a region doesn't collapse the option list. Falls back to the full
  // canonical list (via FilterControls) until the first load completes.
  const [regionOptions, setRegionOptions] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    if (!filters.region && actors.length > 0) {
      const distinct = Array.from(
        new Set(actors.map((a) => a.region).filter((r): r is string => Boolean(r))),
      ).sort();
      setRegionOptions(distinct);
    }
  }, [actors, filters.region]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Full-bleed within <main> (PublicLayout has no container — pages own it).
    // flex-col on mobile (rail stacks above map); md:flex-row on wider screens.
    // min-h: keeps the combined region visible even with sparse content.
    <div className="flex min-h-[calc(100vh-4rem)] flex-col md:flex-row">

      {/*
        ── Discover actors rail (T-4) ────────────────────────────────────────
        DiscoverRail owns: count header, FilterControls, ActorList (or
        loading/error/empty states). Filter changes update `filters` here →
        useDashboardActors refetches all pages (DD-3 server-side). List item
        selection sets selectedActorId → ActorMap flies to + opens popup (FR-5).
        Collapses to a toggle/panel on < md (NFR-2).
      */}
      <DiscoverRail
        actors={actors}
        total={total}
        loading={loading}
        error={error}
        filters={filters}
        regions={regionOptions}
        selectedActorId={selectedActorId}
        onFilterChange={setFilters}
        onSelectActor={setSelectedActorId}
      />

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
