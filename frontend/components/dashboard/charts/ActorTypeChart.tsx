'use client';

/**
 * ActorTypeChart
 *
 * BarChart of actor counts per actor type (traderType), with each bar's slug
 * mapped to a friendly label via roleLabel() from roles.ts and coloured via
 * categoricalColor(index) — no hex anywhere (NFR-5, ADR-4).
 *
 * Wraps Recharts inside ChartCard, which provides the accessible data-table
 * fallback and the empty-state guard (FR-5, FR-6, NFR-4).
 * Animation is gated by useChartReducedMotion() (FR-7).
 *
 * Traces: FR-5, FR-6, NFR-4, NFR-5, design.md §5.4.
 * Spec: docs/specs/dashboard/discovery-dashboard.
 *
 * Usage:
 *   import ActorTypeChart from '@/components/dashboard/charts/ActorTypeChart';
 *
 *   <ActorTypeChart data={aggregate.byType} />
 */

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

import ChartCard, { useChartReducedMotion } from './ChartCard';
import { categoricalColor } from '@/lib/dashboard/chart-tokens';
import { roleLabel } from '@/lib/content/roles';
import type { TraderType } from '@/lib/content/roles';
import type { DashboardSeriesPoint } from '@/lib/dashboard/aggregate';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActorTypeChartProps {
  /** Raw series from aggregate.byType — { label: traderTypeSlug, value: actorCount }[] */
  data: DashboardSeriesPoint[];
}

// ---------------------------------------------------------------------------
// Inner chart
// ---------------------------------------------------------------------------

function InnerChart({ series }: { series: DashboardSeriesPoint[] }) {
  const reducedMotion = useChartReducedMotion();

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={series}
        margin={{ top: 8, right: 16, bottom: 40, left: 8 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
          interval={0}
          angle={-30}
          textAnchor="end"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: 'var(--color-muted)' }}
          tickLine={false}
          axisLine={false}
          label={{
            value: 'Actors',
            angle: -90,
            position: 'insideLeft',
            offset: 8,
            style: { fontSize: 11, fill: 'var(--color-muted)' },
          }}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-surface-alt)' }}
          contentStyle={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            fontSize: '12px',
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion}>
          {series.map((_point, index) => (
            <Cell key={`cell-${index}`} fill={categoricalColor(index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export default function ActorTypeChart({ data }: ActorTypeChartProps) {
  // Build the friendly-labelled series ONCE — same array drives ChartCard's
  // data-table fallback and the Recharts chart, so they always agree.
  const series: DashboardSeriesPoint[] = data.map((point) => ({
    label: roleLabel(point.label as TraderType),
    value: point.value,
  }));

  return (
    <ChartCard
      title="Actors by type"
      series={series}
      valueHeader="Actor count"
    >
      <InnerChart series={series} />
    </ChartCard>
  );
}
