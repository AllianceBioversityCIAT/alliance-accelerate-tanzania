// KpiCard — single stat tile for the Discovery Dashboard KPI band.
// Server component: no 'use client' — no hooks, no motion, purely presentational.
//
// Token-only styling; no hardcoded hex or geometry (NFR-4). Uses the soft Royal Blue
// token `bg-primary-soft` for the icon chip (hex CSS-vars can't use Tailwind
// /opacity, so an explicit token is required — see globals.css).
//
// Two variants:
//   • default  — white surface, Royal Blue-tinted icon chip (neutral metric tile).
//   • emphasis — inverted Royal Blue surface for the headline metric (hero tile).
//
// Loading state: renders a <Skeleton> in the value slot when loading=true,
// so the band never crashes on null kpis (NFR-6).
//
// Accessibility:
//   - <dl> / <dt> / <dd> semantics: value is programmatically associated with its label.
//   - aria-live="polite" on the value container so screen readers announce the value.
//   - Icon is decorative (aria-hidden via the icon components).

import type { ReactNode } from 'react';
import Skeleton from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KpiCardProps {
  /** Short human-readable label for the metric. */
  label: string;
  /** Formatted value to display — pass a pre-formatted string or a raw number. */
  value: string | number;
  /** Optional secondary note below the value (e.g. "over N reporting capacity"). */
  sublabel?: string;
  /** Optional leading icon (decorative) rendered in a chip. */
  icon?: ReactNode;
  /** Headline tile — inverted Royal Blue surface for visual hierarchy. */
  emphasis?: boolean;
  /** When true, render a Skeleton in the value slot instead of the value (NFR-6). */
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KpiCard({
  label,
  value,
  sublabel,
  icon,
  emphasis = false,
  loading = false,
}: KpiCardProps) {
  return (
    <div
      className={[
        // Stack (icon on top) on narrow screens so the value gets the full card
        // width; switch to icon-left on ≥ sm where cards are wider.
        'rounded-lg border shadow-sm p-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4 transition-shadow hover:shadow-md',
        emphasis
          ? 'bg-primary border-primary text-primary-fg'
          : 'bg-surface border-border',
      ].join(' ')}
    >
      {/* Icon chip — Royal Blue-tinted on default tiles, darker Royal Blue on the hero tile */}
      {icon ? (
        <span
          className={[
            'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            emphasis ? 'bg-primary-hover text-primary-fg' : 'bg-primary-soft text-primary',
          ].join(' ')}
        >
          {icon}
        </span>
      ) : null}

      {/* dl / dt / dd: semantic association between label and value */}
      <dl className="flex min-w-0 flex-col gap-1">
        <dt
          className={[
            'text-xs font-semibold tracking-widest uppercase leading-none',
            emphasis ? 'text-primary-fg' : 'text-muted',
          ].join(' ')}
        >
          {label}
        </dt>

        <dd className="flex flex-col gap-0.5" aria-live="polite">
          {loading ? (
            <Skeleton className="h-9 w-24 mt-1" />
          ) : (
            <span
              className={[
                'text-2xl font-bold leading-tight tabular-nums break-words',
                emphasis ? 'text-primary-fg' : 'text-fg',
              ].join(' ')}
            >
              {value}
            </span>
          )}

          {!loading && sublabel ? (
            <span
              className={[
                'text-xs leading-snug',
                emphasis ? 'text-primary-fg' : 'text-muted',
              ].join(' ')}
            >
              {sublabel}
            </span>
          ) : loading && sublabel ? (
            <Skeleton className="h-3 w-32 mt-1" />
          ) : null}
        </dd>
      </dl>
    </div>
  );
}
