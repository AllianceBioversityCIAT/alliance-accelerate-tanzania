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
//
// Error state (ATP-50):
//   The API always returns numeric aggregates — zeros included — so an em-dash
//   after loading can only mean the fetch failed, never "no data yet". The
//   dashes stay as the per-figure placeholder (FR-3) and ONE status line is
//   added below the grid so the degradation is legible instead of silent.
//   One line for the band, not one per card: four copies would break the
//   4-column grid and a screen reader would announce them four times.

import { useMetrics } from '@/lib/api/useMetrics';
import StatCard from '@/components/ui/StatCard';

// ---------------------------------------------------------------------------
// MetricsBand
// ---------------------------------------------------------------------------

export default function MetricsBand() {
  const { data, loading, error } = useMetrics();

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

        {/*
          Error notice (ATP-50) — rendered only on a failed fetch, never while
          loading and never on a successful (possibly all-zero) response.
          role="status" + aria-live="polite" rather than ActorMap's role="alert":
          this band is supplementary content on the landing page, so it must not
          interrupt a screen reader the way a blanked-out primary map does.
          Colour is token-only on the dark surface (NFR-4). Dimmed with
          `opacity-80`, NOT `text-bg/80`: every semantic colour in
          tailwind.config.ts is `var(--color-x)`, an arbitrary value Tailwind
          cannot compose an alpha into, so a `/NN` modifier on a token emits
          nothing and silently renders at FULL opacity — verified against the
          built CSS, where zero token `/NN` classes exist. Measured 9.55:1 on
          bg-fg. Do not "restore" the `/80` form.
        */}
        {error && (
          <p
            className="mt-3 px-2 text-xs text-bg opacity-80 text-center leading-snug"
            role="status"
            aria-live="polite"
          >
            Metrics are temporarily unavailable. Please try again shortly.
          </p>
        )}
      </div>
    </section>
  );
}
