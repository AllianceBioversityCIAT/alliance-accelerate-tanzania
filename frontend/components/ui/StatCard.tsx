// StatCard — reusable stat / metric card primitive (T-6, System Design §8).
// Server component: no 'use client' needed — purely presentational, no hooks.
//
// Background-agnostic: StatCard carries no surface color of its own so it
// inherits the color context of its parent.  This allows the same component
// to render correctly on both light (bg-bg) pages and the dark MetricsBand
// (bg-fg text-bg) without a "tone" prop.  All text utilities are inherited
// (text-current / opacity utilities) rather than pinning token colors.
//
// Loading states:
//   loading=true  → Skeleton in the value slot (accessible placeholder)
//   value is a finite number → toLocaleString() for thousands separators
//   value is null / undefined → em-dash "—" neutral placeholder (FR-3 fallback)
//
// Usage:
//   <StatCard label="Actors mapped" value={data?.actorsMapped} loading={loading} />
//   <StatCard label="Major crops"   value={null}               loading={false} />

import Skeleton from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatCardProps {
  /** Descriptive label rendered below the metric value. */
  label: string;
  /**
   * Numeric value to display.  Pass null or undefined for an em-dash
   * placeholder (FR-3 graceful fallback when metrics are unavailable).
   */
  value: number | null | undefined;
  /** When true, render a Skeleton in the value slot instead of the value. */
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StatCard({ label, value, loading }: StatCardProps) {
  // Derive display value: skeleton → real number → em-dash fallback
  const displayValue =
    loading ? null
    : typeof value === 'number' && isFinite(value)
      ? value.toLocaleString()
      : '—';

  return (
    // No bg-* here: inherits parent surface so it works on both light and dark bands.
    <div className="flex flex-col items-center gap-1 py-4 px-2">
      {/* Value slot: skeleton while loading, formatted number or em-dash when ready */}
      <div className="h-9 flex items-center justify-center" aria-live="polite">
        {loading ? (
          // Width/height sized to approximate a typical metric value
          <Skeleton className="h-8 w-20" />
        ) : (
          <span className="text-3xl font-bold leading-none tabular-nums">
            {displayValue}
          </span>
        )}
      </div>

      {/* Label */}
      <p className="text-xs font-semibold tracking-widest uppercase opacity-70 text-center leading-snug">
        {label}
      </p>
    </div>
  );
}
