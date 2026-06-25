'use client';

// MetricsBand — dark horizontal band surfacing four live metrics (T-6, FR-3, NFR-2, NFR-5).
// 'use client' is required: consumes the useMetrics hook (browser-side fetch).
//
// Dark surface: bg-fg text-bg mirrors the Footer inversion pattern (Footer.tsx).
// StatCard is background-agnostic and inherits color from this band context.
//
// Responsive grid (NFR-2):
//   mobile (<sm)  : 2 columns
//   ≥md           : 4 columns in a single row
//
// Max-width container matches Hero: mx-auto max-w-7xl px-4 sm:px-6 lg:px-8.
//
// Count-up animation (FR-4, FR-7, FR-8):
//   Each figure animates 0→value when the band scrolls into view, but ONLY
//   once metrics have loaded (enabled = !loading && data != null).
//   Reduced-motion or GSAP mocked in tests → final value shown statically (FR-7/FR-8).

import { useMetrics } from '@/lib/api/useMetrics';
import StatCard from '@/components/ui/StatCard';

// ---------------------------------------------------------------------------
// MetricsBand
// ---------------------------------------------------------------------------

export default function MetricsBand() {
  const { data, loading } = useMetrics();

  // Gate: count-up only fires once data is loaded and available (FR-4).
  // While loading or when data is null, StatCard shows its static value/skeleton.
  const countUp = !loading && data != null;

  return (
    // Dark surface: bg-fg (near-black) + text-bg (warm off-white) — token-only (NFR-4).
    // See Footer.tsx for the canonical pattern; no raw hex here.
    <section
      className="bg-fg text-bg"
      aria-label="Registry metrics summary"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/*
          Responsive grid:
            grid-cols-2  → 2-column layout on mobile (NFR-2 reflow)
            md:grid-cols-4 → 4-column single row on medium screens and up
        */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-bg/20">
          <StatCard
            label="Actors mapped"
            value={data?.actorsMapped}
            loading={loading}
            countUp={countUp}
          />
          <StatCard
            label="Major crops"
            value={data?.cropsTracked}
            loading={loading}
            countUp={countUp}
          />
          <StatCard
            label="Regions covered"
            value={data?.regionsCovered}
            loading={loading}
            countUp={countUp}
          />
          <StatCard
            label="Actor types"
            value={data?.actorTypes}
            loading={loading}
            countUp={countUp}
          />
        </div>
      </div>
    </section>
  );
}
