// KpiBand — responsive grid of KPI tiles for the Discovery Dashboard (T-9).
// Server component: no 'use client' — pure presentational, props-driven.
//
// Traces: FR-4, NFR-6, design.md §5.5, spec: dashboard/discovery-dashboard.
//
// Props:
//   kpis    — DashboardKpis aggregate or null (no actors match the filter).
//   loading — true while the actor list is loading (skeleton fallback, NFR-6).
//
// When kpis is null OR loading=true every KpiCard enters its loading state so
// the band is always safe and never crashes (NFR-6).
//
// Grid: grid-cols-2 (mobile) → md:grid-cols-3 (≥ md) per design.md §5.5.
// 5 tiles spread 2-3 per row naturally across breakpoints.
//
// Thousands separators: toLocaleString() — consistent with StatCard / MetricsBand.
//
// Usage:
//   <KpiBand kpis={aggregate?.kpis ?? null} loading={loading} />

import type { DashboardKpis } from '@/lib/dashboard/aggregate';
import KpiCard from '@/components/dashboard/KpiCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KpiBandProps {
  /** Aggregated KPI values, or null when no results / not yet computed. */
  kpis: DashboardKpis | null;
  /** Skeleton fallback for all cards while actor data is loading (NFR-6). */
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a number with locale thousands separators (matches StatCard pattern). */
function fmt(n: number): string {
  return n.toLocaleString();
}

/** Build the "over N reporting capacity" basis sublabel (FR-4 / OQ-3). */
function basisLabel(count: number): string {
  return `over ${count.toLocaleString()} reporting capacity`;
}

// ---------------------------------------------------------------------------
// KPI tile definitions (order mirrors design.md §5.5)
// ---------------------------------------------------------------------------

interface TileDef {
  label: string;
  value: string;
  sublabel?: string;
}

function buildTiles(kpis: DashboardKpis): TileDef[] {
  return [
    {
      label: 'Matching actors',
      value: fmt(kpis.matchingCount),
    },
    {
      label: 'Total capacity (t)',
      value: fmt(kpis.totalCapacityTons),
      sublabel: basisLabel(kpis.capacityReportingCount),
    },
    {
      label: 'Median capacity (t)',
      value: fmt(kpis.medianCapacityTons),
      sublabel: basisLabel(kpis.capacityReportingCount),
    },
    {
      label: 'Regions covered',
      value: fmt(kpis.regionsCovered),
    },
    {
      label: 'Actor types',
      value: fmt(kpis.actorTypes),
    },
  ];
}

// Static tile labels used to render skeleton cards when kpis is null.
const TILE_LABELS = [
  'Matching actors',
  'Total capacity (t)',
  'Median capacity (t)',
  'Regions covered',
  'Actor types',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KpiBand({ kpis, loading = false }: KpiBandProps) {
  // Determine effective loading state: either caller says loading, or kpis not yet available.
  // Each KpiCard handles its own skeleton so we surface a per-card loading prop.
  const isLoading = loading || kpis === null;

  const tiles: TileDef[] = kpis ? buildTiles(kpis) : TILE_LABELS.map((label) => ({ label, value: '' }));

  return (
    // Section wrapper — no explicit bg so it inherits the dashboard surface.
    // aria-label identifies the region for screen readers (design.md §5.5 a11y).
    <section aria-label="Key performance indicators">
      {/*
        Responsive KPI grid:
          grid-cols-2   → 2-column stacked layout on mobile (NFR-2 reflow)
          md:grid-cols-3 → 3-column row on medium screens and up (design.md §5.5)
        gap-4: token-aligned spacing (system-design §7).
      */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <KpiCard
            key={tile.label}
            label={tile.label}
            value={tile.value}
            sublabel={tile.sublabel}
            loading={isLoading}
          />
        ))}
      </div>
    </section>
  );
}
