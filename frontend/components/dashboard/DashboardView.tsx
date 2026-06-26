'use client';

/**
 * DashboardView — Discovery Dashboard main view.
 *
 * Traces: FR-1, FR-2, FR-10, FR-11, NFR-2, NFR-6, design.md §5.1/§5.3.
 * Spec: dashboard/discovery-dashboard, T-14 (+ pro redesign: enhancement/dashboard-pro-redesign).
 *
 * Responsibilities:
 *   • Owns filter state (ActorsQuery), initialised from URL via decodeFilters.
 *   • Pushes URL on every filter change (FR-2 shareable/restorable view).
 *   • Fetches actors via useDashboardActors; aggregates via aggregate().
 *   • Composes the dashboard shell: sticky toolbar (title + export), a filter
 *     bar with active-filter chips, and sectioned panels (Overview · Breakdowns
 *     · Map & shortlist).
 *   • Handles loading, error, and empty states without crashing (NFR-6).
 *
 * Static-export safe: all data is client-fetched; no SSR or route handlers.
 * Uses useSearchParams() — must be wrapped in <Suspense> at the page level.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { useDashboardActors } from '@/lib/dashboard/useDashboardActors';
import { aggregate } from '@/lib/dashboard/aggregate';
import { decodeFilters, encodeFilters } from '@/lib/dashboard/filters-url';
import type { ActorsQuery, PublicActorList } from '@/lib/api/actors';

import DashboardFilters from '@/components/dashboard/DashboardFilters';
import ActiveFilterChips from '@/components/dashboard/ActiveFilterChips';
import KpiBand from '@/components/dashboard/KpiBand';
import DashboardMapPanel from '@/components/dashboard/DashboardMapPanel';
import ShortlistTable from '@/components/dashboard/ShortlistTable';
import DownloadViewButton from '@/components/dashboard/DownloadViewButton';
import Skeleton from '@/components/ui/Skeleton';
import { IconAdjustments, IconMap, IconList } from '@/components/dashboard/icons';

// ── Charts: code-split (NFR-3, design §9) ─────────────────────────────────────
// Recharts is a heavy dependency; lazy-loading the three charts keeps it out of
// the initial /dashboard bundle so first paint (filters + KPIs) isn't blocked.
const ChartFallback = () => <Skeleton className="h-64 w-full rounded-lg" />;
const CapacityByRegionChart = dynamic(
  () => import('@/components/dashboard/charts/CapacityByRegionChart'),
  { ssr: false, loading: ChartFallback },
);
const CropDistributionChart = dynamic(
  () => import('@/components/dashboard/charts/CropDistributionChart'),
  { ssr: false, loading: ChartFallback },
);
const ActorTypeChart = dynamic(
  () => import('@/components/dashboard/charts/ActorTypeChart'),
  { ssr: false, loading: ChartFallback },
);

// ── Small section heading ─────────────────────────────────────────────────────
function SectionHeading({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted">
      {icon}
      {children}
    </h2>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Filter state — initialised from URL (FR-2) ────────────────────────────
  const [filters, setFilters] = useState<ActorsQuery>(() => decodeFilters(searchParams));

  // ── Selected actor for the map ────────────────────────────────────────────
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { actors, total, truncated, loading, error } = useDashboardActors(filters);

  // ── Aggregation (memoised so it only recomputes when actors changes) ──────
  const agg = useMemo(() => aggregate(actors), [actors]);

  // ── Filter change handler — update state + push URL (FR-2) ───────────────
  const handleFilterChange = useCallback(
    (next: ActorsQuery) => {
      setFilters(next);
      router.replace(`?${encodeFilters(next).toString()}`, { scroll: false });
    },
    [router],
  );

  // ── Build PublicActorList for the map panel ───────────────────────────────
  const mapData: PublicActorList = useMemo(
    () => ({ data: actors, page: 1, pageSize: actors.length, total }),
    [actors, total],
  );

  // ── Error state (NFR-6) — standalone panel, intentionally minimal ─────────
  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-sm"
        >
          <p className="text-base font-medium text-fg">Couldn&apos;t load registry data.</p>
          <p className="mt-1 text-sm text-muted">
            Try again or{' '}
            <Link
              href="/directory"
              className="text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            >
              open the full Directory
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const hasResults = !loading && actors.length > 0;

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-surface-alt">
      {/* ── Sticky toolbar: title + export ─────────────────────────────────── */}
      <div className="sticky top-14 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-xl font-bold text-fg sm:text-2xl">Seed Discovery Dashboard</h1>
            <p className="text-xs text-muted sm:text-sm">
              Filter Tanzania&apos;s seed-system actors, read the breakdowns, and export the view.
            </p>
          </div>
          {hasResults ? <DownloadViewButton actors={actors} kpis={agg.kpis} /> : null}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">

        {/* ── Filter bar + active chips ─────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted">
            <IconAdjustments className="h-4 w-4" />
            Filters
          </div>
          <DashboardFilters filters={filters} onChange={handleFilterChange} />
          <div className="mt-3 border-t border-border pt-3">
            <ActiveFilterChips filters={filters} onChange={handleFilterChange} />
          </div>
        </div>

        {/* ── Truncation notice (FR-10) ─────────────────────────────────────── */}
        {truncated && !loading && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted"
          >
            Showing the first {actors.length.toLocaleString()} of {total.toLocaleString()} matching
            actors — refine filters or{' '}
            <Link
              href="/directory"
              className="font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            >
              open the full Directory
            </Link>
            .
          </div>
        )}

        {/* ── Overview (KPIs) ───────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionHeading>Overview</SectionHeading>
          <KpiBand kpis={loading ? null : agg.kpis} loading={loading} />
        </section>

        {/* ── Breakdowns (charts) ───────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionHeading>Breakdowns</SectionHeading>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <CapacityByRegionChart data={agg.capacityByRegion} />
            <CropDistributionChart data={agg.byCrop} />
            <ActorTypeChart data={agg.byType} />
          </div>
        </section>

        {/* ── Map ───────────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionHeading icon={<IconMap className="h-4 w-4" />}>Map</SectionHeading>
          <DashboardMapPanel
            data={loading ? null : mapData}
            loading={loading}
            error={error}
            selectedActorId={selectedActorId}
            onSelectActor={setSelectedActorId}
          />
        </section>

        {/* ── Shortlist ─────────────────────────────────────────────────────── */}
        {!loading && (
          <section className="flex flex-col gap-3">
            <SectionHeading icon={<IconList className="h-4 w-4" />}>Shortlist</SectionHeading>
            {actors.length === 0 ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-sm"
              >
                <p className="text-base font-medium text-fg">No actors match these filters.</p>
                <p className="mt-1 text-sm text-muted">
                  Try adjusting the filters above to see results.
                </p>
              </div>
            ) : (
              <div
                className="rounded-lg border border-border bg-surface p-4 shadow-sm overflow-x-auto"
                aria-label="Actor shortlist"
              >
                <ShortlistTable actors={actors} filters={filters} />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
