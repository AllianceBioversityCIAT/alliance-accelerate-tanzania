// /dashboard page — Discovery Dashboard route (FR-1, FR-2, FR-10, FR-11, NFR-2, NFR-6).
//
// Static-export compliance (NFR-5 / design.md §5):
//   DashboardView calls useSearchParams() which triggers a CSR bailout under
//   `output: 'export'`. Wrapping DashboardView in <Suspense> satisfies the
//   Next.js static-export requirement and allows the build to succeed.
//   Mirrors the pattern established in frontend/app/(public)/directory/page.tsx.
//
// No SSR, no ISR, no route handlers — all data is client-fetched by
// DashboardView → useDashboardActors → getActors (NFR-5 static export safe).

import { Suspense } from 'react';
import DashboardView from '@/components/dashboard/DashboardView';
import Skeleton from '@/components/ui/Skeleton';

// ── Suspense fallback ──────────────────────────────────────────────────────────

/**
 * Lightweight fallback shown while DashboardView hydrates / suspends.
 * Uses Skeleton so it is token-driven and visually consistent with the
 * in-component loading state (NFR-4).
 */
function DashboardFallback() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      aria-label="Loading dashboard"
      aria-busy="true"
    >
      {/* Page heading skeleton */}
      <Skeleton className="mb-2 h-8 w-64 rounded-md" />
      <Skeleton className="mb-8 h-4 w-96 rounded-sm" />

      {/* Two-column layout skeleton */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Filter panel */}
        <div className="w-full rounded-lg border border-border bg-surface p-4 shadow-sm lg:w-64 lg:shrink-0">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </div>

        {/* Right column panels */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {/* KPI band */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-md" />
            ))}
          </div>
          {/* Map panel */}
          <Skeleton className="h-[480px] w-full rounded-lg" />
          {/* Shortlist */}
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    /*
      Suspense boundary is REQUIRED here:
      DashboardView calls useSearchParams() which triggers a static-export CSR
      bailout in Next.js. Without this boundary, `next build` fails under
      output: 'export'. See design.md §5 / §8.
    */
    <Suspense fallback={<DashboardFallback />}>
      <DashboardView />
    </Suspense>
  );
}
