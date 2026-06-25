/**
 * Unit tests for MetricsBand — T-6, T-5 (count-up), FR-3, FR-4, FR-8, NFR-5.
 *
 * Filters: `metrics-band` (matched via filename suffix).
 *
 * Covers:
 *   (a) live values render when hook returns full data + loading=false
 *   (b) em-dash placeholder for each stat when data=null + loading=false
 *   (c) skeletons render (no throw) when data=null + loading=true
 *   (d) count-up enabled path: final values present in DOM with GSAP mocked (FR-4, FR-8)
 *   (e) count-up disabled while loading (FR-4): skeletons, not count animation
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import MetricsBand from './MetricsBand';
import type { Metrics } from '@/lib/api/metrics';

// ---------------------------------------------------------------------------
// Module mock — intercept useMetrics before the component ever imports it
// ---------------------------------------------------------------------------

jest.mock('@/lib/api/useMetrics', () => ({
  useMetrics: jest.fn(),
}));

/* eslint-disable */
const { useMetrics } = require('@/lib/api/useMetrics') as {
  useMetrics: jest.Mock;
};
/* eslint-enable */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_METRICS: Metrics = {
  actorsMapped: 1_234,
  cropsTracked: 3,
  regionsCovered: 7,
  actorTypes: 4,
  crops: [
    { slug: 'sorghum',     mappedActors: 500 },
    { slug: 'common_bean', mappedActors: 450 },
    { slug: 'groundnut',   mappedActors: 284 },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetricsBand', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) Live values render on success ────────────────────────────────────

  it('renders the four live metric values when data is available', () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    render(<MetricsBand />);

    // actorsMapped: 1,234 — toLocaleString() produces locale-specific separators;
    // test for both comma (en-US) and period (some locales) by checking for "1"
    // being present in the cell.  Use role=region or accessible labels where available.
    expect(screen.getByText((_, el) =>
      el?.tagName === 'SPAN' && /1[,.]?234/.test(el.textContent ?? '')
    )).toBeInTheDocument();

    // cropsTracked: 3
    expect(screen.getByText('3')).toBeInTheDocument();

    // regionsCovered: 7
    expect(screen.getByText('7')).toBeInTheDocument();

    // actorTypes: 4
    expect(screen.getByText('4')).toBeInTheDocument();

    // Labels are present
    expect(screen.getByText('Actors mapped')).toBeInTheDocument();
    expect(screen.getByText('Major crops')).toBeInTheDocument();
    expect(screen.getByText('Regions covered')).toBeInTheDocument();
    expect(screen.getByText('Actor types')).toBeInTheDocument();
  });

  // ── (b) Em-dash placeholder when data is null ────────────────────────────

  it('renders em-dash placeholders for each stat when data is null', () => {
    useMetrics.mockReturnValue({ data: null, loading: false });

    // Should not throw
    expect(() => render(<MetricsBand />)).not.toThrow();

    // Four em-dash characters — one per stat card
    const dashes = screen.getAllByText('—');
    expect(dashes).toHaveLength(4);

    // Labels still render
    expect(screen.getByText('Actors mapped')).toBeInTheDocument();
    expect(screen.getByText('Major crops')).toBeInTheDocument();
    expect(screen.getByText('Regions covered')).toBeInTheDocument();
    expect(screen.getByText('Actor types')).toBeInTheDocument();
  });

  // ── (c) Skeletons render while loading (no throw) ────────────────────────

  it('renders without throwing when loading=true and data is null', () => {
    useMetrics.mockReturnValue({ data: null, loading: true });

    // Must not throw
    expect(() => render(<MetricsBand />)).not.toThrow();

    // No em-dash or numbers when loading; the skeleton placeholders replace values.
    expect(screen.queryByText('—')).not.toBeInTheDocument();

    // Labels still render (they are always visible, not behind loading state)
    expect(screen.getByText('Actors mapped')).toBeInTheDocument();
    expect(screen.getByText('Major crops')).toBeInTheDocument();
    expect(screen.getByText('Regions covered')).toBeInTheDocument();
    expect(screen.getByText('Actor types')).toBeInTheDocument();
  });

  // ── (d) Count-up enabled path: FR-4 / FR-8 ──────────────────────────────
  // With data loaded and countUp=true passed to each StatCard, GSAP is mocked
  // so matchMedia.add() never fires.  The JSX-rendered final values must be
  // present in the DOM (progressive enhancement, FR-8).

  it('FR-4/FR-8: final numeric values are in the DOM when data is loaded (countUp enabled, GSAP mocked)', () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    render(<MetricsBand />);

    // actorsMapped: 1,234
    expect(screen.getByText((_, el) =>
      el?.tagName === 'SPAN' && /1[,.]?234/.test(el.textContent ?? '')
    )).toBeInTheDocument();

    // cropsTracked: 3
    expect(screen.getByText('3')).toBeInTheDocument();

    // regionsCovered: 7
    expect(screen.getByText('7')).toBeInTheDocument();

    // actorTypes: 4
    expect(screen.getByText('4')).toBeInTheDocument();

    // Labels remain
    expect(screen.getByText('Actors mapped')).toBeInTheDocument();
    expect(screen.getByText('Major crops')).toBeInTheDocument();
    expect(screen.getByText('Regions covered')).toBeInTheDocument();
    expect(screen.getByText('Actor types')).toBeInTheDocument();
  });

  // ── (e) Count-up disabled while loading (FR-4) ───────────────────────────
  // While loading=true, countUp flag is false; StatCard shows skeletons, not
  // count animations.  No value text should be present.

  it('FR-4: count-up is not enabled while loading — skeletons shown, no numbers', () => {
    useMetrics.mockReturnValue({ data: null, loading: true });

    expect(() => render(<MetricsBand />)).not.toThrow();

    // Skeleton path: no numbers, no dashes
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(screen.queryByText('4')).not.toBeInTheDocument();

    // Labels are always visible
    expect(screen.getByText('Actors mapped')).toBeInTheDocument();
  });
});
