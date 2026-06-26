'use client';

/**
 * CropDistributionChart
 *
 * BarChart of actor counts per crop, with each bar coloured using the crop's
 * design-token colour (CROP_COLORS) and label mapped to its friendly name via
 * CROPS in crops.ts. Unknown slugs fall back to categoricalColor(index) for
 * forward-compatibility.
 *
 * Wraps Recharts inside ChartCard, which provides the accessible data-table
 * fallback and the empty-state guard (FR-5, FR-6, NFR-4).
 * No hex values — all colours come from the token helpers (NFR-5, ADR-4).
 *
 * Traces: FR-5, FR-6, NFR-4, NFR-5, design.md §5.4.
 * Spec: docs/specs/dashboard/discovery-dashboard.
 *
 * Usage:
 *   import CropDistributionChart from '@/components/dashboard/charts/CropDistributionChart';
 *
 *   <CropDistributionChart data={aggregate.byCrop} />
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
import { CROP_COLORS, categoricalColor } from '@/lib/dashboard/chart-tokens';
import { CROPS } from '@/lib/content/crops';
import type { DashboardSeriesPoint } from '@/lib/dashboard/aggregate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a slug → friendly name lookup from the CROPS content. */
const CROP_NAME: Record<string, string> = Object.fromEntries(
  CROPS.map((c) => [c.slug, c.name]),
);

/**
 * Map a crop slug to its token colour string.
 * Falls back to categoricalColor(index) for any slug not in the palette.
 */
function cropColor(slug: string, index: number): string {
  return (CROP_COLORS as Record<string, string>)[slug] ?? categoricalColor(index);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CropDistributionChartProps {
  /** Raw series from aggregate.byCrop — { label: cropSlug, value: actorCount }[] */
  data: DashboardSeriesPoint[];
}

// ---------------------------------------------------------------------------
// Series shape (includes colour for chart + slug for key)
// ---------------------------------------------------------------------------

interface CropSeriesPoint {
  label: string;   // friendly name (e.g. "Sorghum")
  value: number;
  color: string;   // var(--crop-*) or categorical fallback
}

// ---------------------------------------------------------------------------
// Inner chart
// ---------------------------------------------------------------------------

function InnerChart({ series }: { series: CropSeriesPoint[] }) {
  const reducedMotion = useChartReducedMotion();

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={series}
        margin={{ top: 8, right: 16, bottom: 24, left: 8 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: 'var(--color-muted)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
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
          {series.map((point, index) => (
            <Cell key={`cell-${index}`} fill={point.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export default function CropDistributionChart({ data }: CropDistributionChartProps) {
  // Build the friendly-named, coloured series ONCE — the same array feeds
  // both the data-table in ChartCard (via the label/value shape) and the chart.
  const series: CropSeriesPoint[] = data.map((point, index) => ({
    label: CROP_NAME[point.label] ?? point.label,
    value: point.value,
    color: cropColor(point.label, index),
  }));

  // ChartCard receives the {label, value} subset (ChartSeriesPoint compatible).
  const chartCardSeries = series.map(({ label, value }) => ({ label, value }));

  return (
    <ChartCard
      title="Actors by crop"
      series={chartCardSeries}
      valueHeader="Actor count"
    >
      <InnerChart series={series} />
    </ChartCard>
  );
}
