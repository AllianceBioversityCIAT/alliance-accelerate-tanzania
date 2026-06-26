// KpiCard — single stat tile for the Discovery Dashboard KPI band.
// Server component: no 'use client' — no hooks, no motion, purely presentational.
//
// Token-only styling; no hardcoded hex or geometry (NFR-4).
// Mirrors the institutional card pattern from PillarCards (bg-surface, border-border).
//
// Loading state: renders a <Skeleton> in the value slot when loading=true,
// so the band never crashes on null kpis (NFR-6).
//
// Accessibility:
//   - <dl> / <dt> / <dd> semantics: value is programmatically associated with its label.
//   - aria-live="polite" on the value container so screen readers announce the
//     value once it loads without interrupting the user.
//   - Skeleton is aria-hidden (decorative placeholder — see Skeleton.tsx).
//
// Usage:
//   <KpiCard label="Matching actors" value={42} />
//   <KpiCard label="Total capacity (t)" value="1,200" sublabel="over 18 reporting capacity" />
//   <KpiCard label="Regions covered" value={7} loading />

import Skeleton from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KpiCardProps {
  /** Short human-readable label for the metric. */
  label: string;
  /** Formatted value to display — pass a pre-formatted string (e.g. toLocaleString) or a raw number. */
  value: string | number;
  /** Optional secondary note below the value (e.g. "over N reporting capacity"). */
  sublabel?: string;
  /** When true, render a Skeleton in the value slot instead of the value (NFR-6). */
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KpiCard({ label, value, sublabel, loading = false }: KpiCardProps) {
  return (
    // bg-surface / border-border: token-driven card surface (NFR-4).
    // rounded-lg + shadow-sm: matches PillarCards card geometry tokens.
    <div className="bg-surface border border-border rounded-lg shadow-sm p-5 flex flex-col gap-2">
      {/*
        dl / dt / dd: semantic association between label and value.
        Assistive technology announces "<value> — <label>" without extra ARIA wiring.
      */}
      <dl className="flex flex-col gap-1">
        {/* Label — uppercase eyebrow style, muted, small tracking */}
        <dt className="text-xs font-semibold tracking-widest uppercase text-muted leading-none">
          {label}
        </dt>

        {/* Value slot — skeleton while loading, real value when ready */}
        <dd
          className="flex flex-col gap-0.5"
          // Announce updated value to screen readers without interruption.
          aria-live="polite"
        >
          {loading ? (
            // Decorative skeleton: width approximates a typical KPI figure.
            <Skeleton className="h-9 w-24 mt-1" />
          ) : (
            <span className="text-3xl font-bold leading-none tabular-nums text-fg">
              {value}
            </span>
          )}

          {/* Sublabel — FR-4 basis disclosure (OQ-3). Shown only after load. */}
          {!loading && sublabel ? (
            <span className="text-xs text-muted leading-snug">
              {sublabel}
            </span>
          ) : loading && sublabel ? (
            // Skeleton stand-in for the sublabel line while loading.
            <Skeleton className="h-3 w-32 mt-1" />
          ) : null}
        </dd>
      </dl>
    </div>
  );
}
