'use client';

/**
 * CapacityByRegionChart
 *
 * Horizontal BarChart of seed storage/handling capacity (t) per region.
 * Wraps Recharts inside ChartCard, which provides the accessible data-table
 * fallback and the empty-state guard (FR-5, FR-6, NFR-4).
 *
 * Colour: every bar is coloured via categoricalColor(index) — no hex anywhere
 * (NFR-5, design.md §5.4, ADR-4).
 *
 * Animation: gated by useChartReducedMotion() from ChartCard (FR-7).
 *
 * Traces: FR-5, FR-6, NFR-4, NFR-5, design.md §5.4.
 * Spec: docs/specs/dashboard/discovery-dashboard.
 *
 * Usage:
 *   import CapacityByRegionChart from '@/components/dashboard/charts/CapacityByRegionChart';
 *
 *   <CapacityByRegionChart data={aggregate.capacityByRegion} />
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
import { IconMapPin } from '@/components/dashboard/icons';
import { categoricalColor } from '@/lib/dashboard/chart-tokens';
import type { DashboardSeriesPoint } from '@/lib/dashboard/aggregate';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CapacityByRegionChartProps {
  /** Raw series from aggregate.capacityByRegion — { label: region, value: tons }[] */
  data: DashboardSeriesPoint[];
}

// ---------------------------------------------------------------------------
// Inner chart — consumes useChartReducedMotion from ChartCard's context.
// Defined separately so the hook is called inside the ChartCard provider tree.
// ---------------------------------------------------------------------------

function InnerChart({ series }: { series: DashboardSeriesPoint[] }) {
  const reducedMotion = useChartReducedMotion();

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, series.length * 40)}>
      <BarChart
        data={series}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 80 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 12, fill: 'var(--color-muted)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
          unit=" t"
        />
        <YAxis
          type="category"
          dataKey="label"
          width={76}
          tick={{ fontSize: 12, fill: 'var(--color-muted)' }}
          tickLine={false}
          axisLine={false}
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
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={!reducedMotion}>
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

export default function CapacityByRegionChart({ data }: CapacityByRegionChartProps) {
  // Build the friendly series ONCE — same array drives both ChartCard's data
  // table and the Recharts chart, so table + chart always agree.
  const series = data.map((point) => ({
    label: point.label,
    value: point.value,
  }));

  return (
    <ChartCard
      title="Capacity by region (t)"
      icon={<IconMapPin className="h-5 w-5" />}
      series={series}
      valueHeader="Capacity (t)"
    >
      <InnerChart series={series} />
    </ChartCard>
  );
}
