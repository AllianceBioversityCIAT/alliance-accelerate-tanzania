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

import type { ReactNode } from 'react';
import type { DashboardKpis } from '@/lib/dashboard/aggregate';
import KpiCard from '@/components/dashboard/KpiCard';
import {
  IconUsers,
  IconScale,
  IconChartBar,
  IconMapPin,
  IconTag,
} from '@/components/dashboard/icons';

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

/** Integer metric (counts) with locale thousands separators. */
function fmt(n: number): string {
  return n.toLocaleString();
}

/** Total tonnage — whole tons with separators (capacityTons carries noisy .NN). */
function fmtTons(n: number): string {
  return Math.round(n).toLocaleString();
}

/** Median tonnage — at most one decimal (e.g. 16.475 → "16.5", 250 → "250"). */
function fmtMedian(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Build the "over N reporting capacity" basis sublabel (FR-4 / OQ-3). */
function basisLabel(count: number): string {
  return `over ${count.toLocaleString()} reporting capacity`;
}

// ---------------------------------------------------------------------------
// KPI tile definitions (order mirrors design.md §5.5)
// ---------------------------------------------------------------------------

interface TileMeta {
  label: string;
  icon: ReactNode;
  emphasis?: boolean;
  /** When set, derive the value + capacity-basis sublabel from these kpis keys. */
  valueOf: (k: DashboardKpis) => string;
  basis?: boolean;
}

// Tile definitions (order + icon + hierarchy). The headline metric is emphasised.
const TILES: TileMeta[] = [
  { label: 'Matching actors',    icon: <IconUsers className="h-5 w-5" />,    emphasis: true, valueOf: (k) => fmt(k.matchingCount) },
  { label: 'Total capacity (t)', icon: <IconScale className="h-5 w-5" />,    basis: true,    valueOf: (k) => fmtTons(k.totalCapacityTons) },
  { label: 'Median capacity (t)',icon: <IconChartBar className="h-5 w-5" />, basis: true,    valueOf: (k) => fmtMedian(k.medianCapacityTons) },
  { label: 'Regions covered',    icon: <IconMapPin className="h-5 w-5" />,   valueOf: (k) => fmt(k.regionsCovered) },
  { label: 'Actor types',        icon: <IconTag className="h-5 w-5" />,      valueOf: (k) => fmt(k.actorTypes) },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KpiBand({ kpis, loading = false }: KpiBandProps) {
  // Determine effective loading state: either caller says loading, or kpis not yet available.
  // Each KpiCard handles its own skeleton so we surface a per-card loading prop.
  const isLoading = loading || kpis === null;

  return (
    // Section wrapper — no explicit bg so it inherits the dashboard surface.
    // aria-label identifies the region for screen readers (design.md §5.5 a11y).
    <section aria-label="Key performance indicators">
      {/*
        Responsive KPI grid:
          grid-cols-2 (mobile) → sm:grid-cols-3 → lg:grid-cols-5 (one row, dense).
        gap-4: token-aligned spacing (system-design §7).
      */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {TILES.map((tile) => (
          <KpiCard
            key={tile.label}
            label={tile.label}
            value={kpis ? tile.valueOf(kpis) : ''}
            sublabel={kpis && tile.basis ? basisLabel(kpis.capacityReportingCount) : undefined}
            icon={tile.icon}
            emphasis={tile.emphasis}
            loading={isLoading}
          />
        ))}
      </div>
    </section>
  );
}
