'use client';

/**
 * ChartCard — reusable, accessible, token-styled card wrapping a chart with a
 * mandatory data-table fallback (WCAG FR-6, NFR-4, design.md §5.4).
 *
 * Traces: FR-5, FR-6, NFR-4, design.md §5.4, spec: dashboard/discovery-dashboard.
 *
 * Usage:
 *   import ChartCard, { useChartReducedMotion } from '@/components/dashboard/charts/ChartCard';
 *
 *   <ChartCard title="Actors by Region" series={data} valueHeader="Actor count">
 *     <ResponsiveContainer width="100%" height={240}>
 *       <BarChart data={data} />
 *     </ResponsiveContainer>
 *   </ChartCard>
 *
 *   // Inside a chart child:
 *   const reducedMotion = useChartReducedMotion();
 *   const duration = reducedMotion ? 0 : 400;
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartSeriesPoint {
  label: string;
  value: number;
}

export interface ChartCardProps {
  /** Heading text; used as the accessible figure label. */
  title: string;
  /** Data series — drives the table fallback and is what the child chart renders. */
  series: ChartSeriesPoint[];
  /** The chart element (e.g. a Recharts ResponsiveContainer). */
  children: React.ReactNode;
  /** Data-table value column header. Default: "Value". */
  valueHeader?: string;
  /** Optional extra classes appended to the card root. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Reduced-motion context
// ---------------------------------------------------------------------------

/** Context value: true when the OS prefers reduced motion. */
const ReducedMotionContext = createContext<boolean>(false);

/**
 * useChartReducedMotion
 *
 * Hook consumed by chart children (Recharts components, etc.) to disable or
 * shorten animations when the user's OS prefers reduced motion (FR-7).
 * SSR/jsdom-safe: defaults to false when matchMedia is unavailable.
 *
 * @example
 *   const reducedMotion = useChartReducedMotion();
 *   <BarChart isAnimationActive={!reducedMotion} />
 */
export function useChartReducedMotion(): boolean {
  return useContext(ReducedMotionContext);
}

// ---------------------------------------------------------------------------
// Internal hook: reads prefers-reduced-motion and subscribes to changes.
// ---------------------------------------------------------------------------

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(false);

  useEffect(() => {
    // Guard: matchMedia may be undefined in SSR or jsdom without the polyfill.
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Sync initial value (may differ from useState(false) default).
    setReduced(mql.matches);

    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', handler);

    return () => {
      mql.removeEventListener('change', handler);
    };
  }, []);

  return reduced;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChartCard({
  title,
  series,
  children,
  valueHeader = 'Value',
  className = '',
}: ChartCardProps): React.ReactElement {
  const reducedMotion = useReducedMotion();
  const isEmpty = series.length === 0;

  return (
    <ReducedMotionContext.Provider value={reducedMotion}>
      {/*
        * <figure> with role="figure" and aria-label gives assistive technology
        * a labelled landmark for the chart region (FR-6, NFR-4).
        * Token classes: bg-surface, border-border, rounded-lg, shadow-sm.
        */}
      <figure
        role="figure"
        aria-label={title}
        className={[
          'bg-surface border border-border rounded-lg shadow-sm',
          'flex flex-col gap-4 p-6',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Card heading — token text styles, no hardcoded geometry */}
        <figcaption>
          <h3 className="text-base font-bold text-fg leading-snug">{title}</h3>
        </figcaption>

        {isEmpty ? (
          // ── Empty state ────────────────────────────────────────────────────
          // Rendered INSTEAD of the chart when series is empty (FR-5).
          <p
            className="text-sm text-muted leading-relaxed py-8 text-center"
            role="status"
            aria-live="polite"
          >
            No data for this filter
          </p>
        ) : (
          // ── Non-empty: chart + accessible data-table equivalent ────────────
          <>
            {/* Chart children slot (e.g. Recharts ResponsiveContainer) */}
            <div className="w-full">{children}</div>

            {/*
              * WCAG data-table equivalent (FR-6).
              * <details>/<summary> keeps it collapsed by default but keyboard-
              * accessible and screen-reader discoverable without cluttering the UI.
              */}
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-muted hover:text-fg transition-colors select-none">
                Data table
              </summary>

              <div className="mt-3 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm text-fg border-collapse">
                  <thead>
                    <tr className="bg-surface-alt">
                      <th
                        scope="col"
                        className="px-4 py-2 text-left font-semibold text-fg border-b border-border"
                      >
                        Category
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2 text-right font-semibold text-fg border-b border-border"
                      >
                        {valueHeader}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((point, idx) => (
                      <tr
                        key={`${point.label}-${idx}`}
                        className="even:bg-surface-alt"
                      >
                        <td className="px-4 py-2 text-left text-muted">
                          {point.label}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-fg">
                          {point.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </figure>
    </ReducedMotionContext.Provider>
  );
}
