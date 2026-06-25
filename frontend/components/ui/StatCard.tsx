'use client';

// StatCard — reusable stat / metric card primitive (T-6, System Design §8).
// 'use client' is required when countUp=true: the useCountUp hook uses useGSAP
// (client-only).  The component remains safe to render on the server when
// countUp is omitted (false by default) because the hook is only invoked in
// the count-up branch, but Next.js static export requires the directive here.
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
// Count-up animation (FR-4, FR-7, FR-8):
//   countUp=true AND value is a finite number → useCountUp ref is attached to
//   the number span; GSAP animates 0→value when it scrolls into view (motion
//   allowed).  The final value is ALWAYS rendered in JSX so the DOM is correct
//   without GSAP (progressive enhancement, FR-8).  Reduced-motion or GSAP
//   mocked → JSX-rendered final value stays, no animation (FR-7).
//
// Usage:
//   <StatCard label="Actors mapped" value={data?.actorsMapped} loading={loading} />
//   <StatCard label="Major crops"   value={null}               loading={false} />
//   <StatCard label="Actors mapped" value={data?.actorsMapped} loading={loading} countUp={!loading && data != null} />

import Skeleton from '@/components/ui/Skeleton';
import { useCountUp } from '@/lib/motion/useCountUp';

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
  /**
   * When true AND value is a finite number, attach a useCountUp ref so GSAP
   * animates 0→value on scroll-in (FR-4).  Motion is automatically suppressed
   * for reduced-motion users and when GSAP is mocked in tests (FR-7, FR-8).
   * Defaults to false — no animation, static render.
   */
  countUp?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StatCard({ label, value, loading, countUp = false }: StatCardProps) {
  // Derive display value: skeleton → real number → em-dash fallback
  const displayValue =
    loading ? null
    : typeof value === 'number' && isFinite(value)
      ? value.toLocaleString()
      : '—';

  // Numeric target for count-up — null when not applicable so the hook no-ops.
  const numericTarget =
    countUp && typeof value === 'number' && isFinite(value) ? value : null;

  // useCountUp returns a ref to attach to the number <span>.  When numericTarget
  // is null (disabled, loading, non-numeric, or countUp=false) the hook is a
  // no-op and the JSX-rendered value is displayed as-is (FR-8).
  const { ref: countUpRef } = useCountUp(numericTarget, { enabled: countUp });

  return (
    // No bg-* here: inherits parent surface so it works on both light and dark bands.
    <div className="flex flex-col items-center gap-1 py-4 px-2">
      {/* Value slot: skeleton while loading, formatted number or em-dash when ready */}
      <div className="h-9 flex items-center justify-center" aria-live="polite">
        {loading ? (
          // Width/height sized to approximate a typical metric value
          <Skeleton className="h-8 w-20" />
        ) : (
          <span
            className="text-3xl font-bold leading-none tabular-nums"
            // Attach the count-up ref only when animating a real number (FR-4).
            // For null targets the hook returns a ref that is never used, so
            // assigning it here is harmless (the hook guards internally, FR-8).
            ref={numericTarget !== null ? countUpRef : undefined}
          >
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
