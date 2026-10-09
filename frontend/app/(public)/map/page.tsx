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

import { useState } from 'react';
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
  // `truncated` is load-bearing, not decorative: the hook stops at
  // DASH_PAGE_SIZE × DASH_MAX_PAGES actors while `total` keeps reporting the
  // server's full count. Dropping it here is what let the rail caption a
  // 1 000-marker map "1200 actors shown" (ATP-68).
  const { actors: matched, total, truncated, loading, error } = useDashboardActors(filters);
  // Only actors with coordinates can be on the map, so only they are listed beside it.
  const actors = matched.filter((a) => a.gps != null);
  const unlocated = matched.length - actors.length;

  // Build the PublicActorList shape expected by <ActorMap data=…>.
  const data: PublicActorList = {
    data: actors,
    page: 1,
    pageSize: actors.length,
    total,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Full-bleed within <main> (PublicLayout has no container — pages own it).
    // flex-col on mobile (rail stacks above map); md:flex-row on wider screens.
    // min-h: keeps the combined region visible even with sparse content.
    // md+: exactly the viewport, so the map's fitted view is never below the fold.
    <div className="flex min-h-[calc(100vh-4rem)] flex-col md:h-[calc(100vh-4rem)] md:flex-row">

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
        unlocated={unlocated}
        total={total}
        truncated={truncated}
        loading={loading}
        error={error}
        filters={filters}
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
          country={filters.country}
        />
      </section>
    </div>
  );
}
