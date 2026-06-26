'use client';

// DashboardMapPanel — thin panel wrapper that embeds ActorMap inside the
// Discovery Dashboard (T-13, FR-7, NFR-2, design.md §5.6).
//
// Responsibilities:
//   • Provide a token-styled card surface (bg-surface, border-border, radius-md,
//     shadow-sm) consistent with other dashboard panels (KpiBand, etc.).
//   • Render a section heading using token text styles (text-fg, text-sm/font-medium).
//   • Host ActorMap inside a fixed-height container — Leaflet requires a concrete
//     height on its ancestor (min-h-[480px] matches ActorMap's own fallback height).
//   • Forward ALL ActorMap props unchanged — no new map behaviour here.
//
// What it does NOT do:
//   • Import Leaflet directly — ActorMap handles its own dynamic import (ssr:false).
//   • Fetch data — the dashboard page owns the useActors call and passes data down.
//   • Add SSR — this file is 'use client' because ActorMap is 'use client'.
//
// Usage (dashboard page):
//   <DashboardMapPanel
//     data={data}
//     loading={loading}
//     error={error}
//     selectedActorId={selectedActorId}
//     onSelectActor={setSelectedActorId}
//   />

import ActorMap from '@/components/map/ActorMap';
import type { ActorMapProps } from '@/components/map/ActorMap';

// ── Props ─────────────────────────────────────────────────────────────────────

// DashboardMapPanel's prop surface is identical to ActorMap's — it is a pure
// pass-through wrapper. Re-exporting the same type keeps the caller's import
// surface minimal.
export type DashboardMapPanelProps = ActorMapProps;

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardMapPanel({
  data,
  loading,
  error,
  selectedActorId,
  onSelectActor,
}: DashboardMapPanelProps) {
  return (
    /*
      Panel card — token-driven surface:
        bg-surface        → --color-surface (#FFFFFF)
        border border-border → --color-border (#E2E2E2), 1px
        rounded-lg        → --radius-lg (16px) — matches KpiBand card radius
        shadow-sm         → --shadow-sm
        overflow-hidden   → prevents Leaflet controls bleeding outside rounded corners
    */
    <section
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
      aria-label="Actor locations map"
    >
      {/* ── Panel heading ────────────────────────────────────────────────────
          px-4 pt-4 pb-2: token spacing (4px base × 4/4/2).
          text-sm font-medium text-fg: token text styles (design.md §7).
          Heading level intentionally omitted — the parent dashboard page owns
          its own heading hierarchy; this label is an ARIA region label only.
      */}
      <div className="px-4 pb-2 pt-4">
        <p className="text-sm font-medium text-fg">Actor Locations</p>
      </div>

      {/* ── Map container ───────────────────────────────────────────────────
          min-h-[480px]: concrete height Leaflet requires; matches ActorMap's
          own internal min-height so the two values stay in sync.
          h-[480px]: explicit height so the panel doesn't collapse to 0 before
          Leaflet mounts (ActorMap handles loading/error/empty states internally).
          w-full: fills the panel card horizontally.
      */}
      <div className="h-[480px] min-h-[480px] w-full">
        <ActorMap
          data={data}
          loading={loading}
          error={error}
          selectedActorId={selectedActorId}
          onSelectActor={onSelectActor}
        />
      </div>
    </section>
  );
}
