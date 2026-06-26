'use client';

/**
 * DashboardView — Discovery Dashboard main view.
 *
 * Traces: FR-1, FR-2, FR-10, FR-11, NFR-2, NFR-6, design.md §5.1/§5.3.
 * Spec: dashboard/discovery-dashboard, T-14.
 *
 * Responsibilities:
 *   • Owns filter state (ActorsQuery), initialised from URL via decodeFilters.
 *   • Pushes URL on every filter change (FR-2 shareable/restorable view).
 *   • Fetches actors via useDashboardActors; aggregates via aggregate().
 *   • Composes all dashboard sub-panels: filters, KPI band, charts, map, shortlist, download.
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
import KpiBand from '@/components/dashboard/KpiBand';
import DashboardMapPanel from '@/components/dashboard/DashboardMapPanel';
import ShortlistTable from '@/components/dashboard/ShortlistTable';
import DownloadViewButton from '@/components/dashboard/DownloadViewButton';
import Skeleton from '@/components/ui/Skeleton';

// ── Charts: code-split (NFR-3, design §9) ─────────────────────────────────────
// Recharts is a heavy dependency; lazy-loading the three charts keeps it out of
// the initial /dashboard bundle so first paint (filters + KPIs) isn't blocked.
// Client-only (ssr:false) — consistent with the static-export, client-fetched view.
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

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * DashboardView — the full Discovery Dashboard, assembled from building blocks.
 *
 * MUST be rendered inside a <Suspense> boundary at the page level because it
 * calls useSearchParams() (static-export / CSR bailout requirement).
 *
 * Usage (in page.tsx):
 *   <Suspense fallback={<DashboardFallback />}>
 *     <DashboardView />
 *   </Suspense>
 */
export default function DashboardView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Filter state — initialised from URL (FR-2) ────────────────────────────
  const [filters, setFilters] = useState<ActorsQuery>(() =>
    decodeFilters(searchParams),
  );

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
  // ActorMap expects { data, page, pageSize, total } — shape from PublicActorList.
  const mapData: PublicActorList = useMemo(
    () => ({
      data: actors,
      page: 1,
      pageSize: actors.length,
      total,
    }),
    [actors, total],
  );

  // ── Error state (NFR-6) ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-sm"
        >
          <p className="text-base font-medium text-fg">
            Couldn&apos;t load registry data.
          </p>
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

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg sm:text-3xl">
          Seed Discovery Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Explore and filter Tanzania&apos;s seed-system actors across sorghum,
          common bean, and groundnut value chains.
        </p>
      </div>

      {/*
        Two-column layout on large screens:
          Left col (lg:w-64): filter panel (sticky)
          Right col (flex-1): all dashboard panels
        Single-column stacked on mobile (NFR-2 reflow).
      */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* ── Filter panel ──────────────────────────────────────────────── */}
        <aside
          className="w-full rounded-lg border border-border bg-surface p-4 shadow-sm lg:w-64 lg:shrink-0 lg:sticky lg:top-6"
          aria-label="Filter controls"
        >
          <DashboardFilters filters={filters} onChange={handleFilterChange} />
        </aside>

        {/* ── Dashboard panels ──────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">

          {/* ── Truncation notice (FR-10) — only when data is capped ────── */}
          {truncated && !loading && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted"
            >
              Showing the first {actors.length.toLocaleString()} of{' '}
              {total.toLocaleString()} matching actors — refine filters or{' '}
              <Link
                href="/directory"
                className="font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
              >
                open the full Directory
              </Link>
              .
            </div>
          )}

          {/* ── KPI band ───────────────────────────────────────────────── */}
          <KpiBand kpis={loading ? null : agg.kpis} loading={loading} />

          {/* ── Charts grid (responsive) ────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <CapacityByRegionChart data={agg.capacityByRegion} />
            <CropDistributionChart data={agg.byCrop} />
            <ActorTypeChart data={agg.byType} />
          </div>

          {/* ── Map panel ──────────────────────────────────────────────── */}
          <DashboardMapPanel
            data={loading ? null : mapData}
            loading={loading}
            error={error}
            selectedActorId={selectedActorId}
            onSelectActor={setSelectedActorId}
          />

          {/* ── Shortlist + download row ─────────────────────────────────
              Hidden until data is ready — avoids a flash of an empty table
              while actors are still being fetched.
          */}
          {!loading && (
            <>
              {/* ── Empty state (NFR-6) ─────────────────────────────────── */}
              {actors.length === 0 ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-sm"
                >
                  <p className="text-base font-medium text-fg">
                    No actors match these filters.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Try adjusting the filters on the left to see results.
                  </p>
                </div>
              ) : (
                <>
                  {/* ── Shortlist table ──────────────────────────────────── */}
                  <section
                    className="rounded-lg border border-border bg-surface p-4 shadow-sm overflow-x-auto"
                    aria-label="Actor shortlist"
                  >
                    <h2 className="mb-3 text-sm font-medium text-fg">
                      Actor Shortlist
                    </h2>
                    <ShortlistTable actors={actors} filters={filters} />
                  </section>

                  {/* ── Download button ──────────────────────────────────── */}
                  <div className="flex justify-end">
                    <DownloadViewButton actors={actors} kpis={agg.kpis} />
                  </div>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
