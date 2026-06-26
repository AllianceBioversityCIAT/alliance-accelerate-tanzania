/**
 * Pure aggregation functions for the Discovery Dashboard.
 *
 * FR-4, FR-5, OQ-3, design.md §5.5 — spec: dashboard/discovery-dashboard.
 *
 * NO React, NO fetch, NO I/O. Takes a PublicActor[] and returns
 * dashboard-ready KPIs + chart series. Safe for empty / null-heavy input.
 */

import type { PublicActor } from '@/lib/api/actors';

// ── Output types ────────────────────────────────────────────────────────────

export interface DashboardSeriesPoint {
  label: string;
  value: number;
}

export interface DashboardKpis {
  /** actors.length — all actors, regardless of capacity reporting. */
  matchingCount: number;
  /** Sum of capacityTons over actors with a non-null, finite value. */
  totalCapacityTons: number;
  /** Median of the same reporting subset; 0 when no actor reports capacity. */
  medianCapacityTons: number;
  /** How many actors had a non-null, finite capacityTons. */
  capacityReportingCount: number;
  /** Distinct non-empty region count across all actors. */
  regionsCovered: number;
  /** Distinct traderType count across all actors. */
  actorTypes: number;
}

export interface DashboardAggregate {
  kpis: DashboardKpis;
  /** Sum of capacityTons per region (reporting actors only), desc by value. */
  capacityByRegion: DashboardSeriesPoint[];
  /**
   * Actor count per crop slug; only crops that actually occur are included,
   * desc by value. An actor counts toward each of its listed crops.
   */
  byCrop: DashboardSeriesPoint[];
  /** Actor count per traderType, desc by value. */
  byType: DashboardSeriesPoint[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when a capacityTons value qualifies for the reporting subset. */
function isReporting(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/**
 * Median of a pre-sorted (ascending) numeric array.
 * Returns 0 for an empty array.
 */
function medianSorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Sort a DashboardSeriesPoint[] descending by value, in-place. */
function sortDesc(series: DashboardSeriesPoint[]): DashboardSeriesPoint[] {
  return series.sort((a, b) => b.value - a.value);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Aggregate a list of public actors into dashboard KPIs and chart series.
 *
 * Empty input → all zeros / empty arrays, never throws.
 */
export function aggregate(actors: PublicActor[]): DashboardAggregate {
  // Accumulators
  const regionSet = new Set<string>();
  const typeSet = new Set<string>();
  const capacityValues: number[] = [];
  const regionCapacity = new Map<string, number>();
  const cropCount = new Map<string, number>();
  const typeCount = new Map<string, number>();

  for (const actor of actors) {
    // --- Distinct sets (all actors) ---
    if (actor.region && actor.region.trim() !== '') {
      regionSet.add(actor.region);
    }
    typeSet.add(actor.traderType);

    // --- Capacity reporting subset ---
    if (isReporting(actor.capacityTons)) {
      capacityValues.push(actor.capacityTons);
      const prev = regionCapacity.get(actor.region) ?? 0;
      regionCapacity.set(actor.region, prev + actor.capacityTons);
    }

    // --- byType (all actors) ---
    typeCount.set(actor.traderType, (typeCount.get(actor.traderType) ?? 0) + 1);

    // --- byCrop (all actors, multi-crop) ---
    for (const crop of actor.crops) {
      cropCount.set(crop, (cropCount.get(crop) ?? 0) + 1);
    }
  }

  // --- KPIs ---
  const reportingCapacities = capacityValues.slice().sort((a, b) => a - b);
  const totalCapacityTons = reportingCapacities.reduce((s, v) => s + v, 0);

  const kpis: DashboardKpis = {
    matchingCount: actors.length,
    totalCapacityTons,
    medianCapacityTons: medianSorted(reportingCapacities),
    capacityReportingCount: reportingCapacities.length,
    regionsCovered: regionSet.size,
    actorTypes: typeSet.size,
  };

  // --- Series ---
  const capacityByRegion: DashboardSeriesPoint[] = sortDesc(
    Array.from(regionCapacity.entries()).map(([label, value]) => ({ label, value })),
  );

  const byCrop: DashboardSeriesPoint[] = sortDesc(
    Array.from(cropCount.entries()).map(([label, value]) => ({ label, value })),
  );

  const byType: DashboardSeriesPoint[] = sortDesc(
    Array.from(typeCount.entries()).map(([label, value]) => ({ label, value })),
  );

  return { kpis, capacityByRegion, byCrop, byType };
}
