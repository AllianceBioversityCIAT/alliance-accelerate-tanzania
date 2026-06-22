/**
 * Unit tests for CropCoverage — T-6, FR-4, NFR-2.
 *
 * Filters: `crop` (matched via filename suffix).
 *
 * Covers:
 *   (a) all three crop names + descriptions render
 *   (b) per-crop actor counts render on success (matched by slug)
 *   (c) em-dash placeholder for each card when metrics are null
 *   (d) "View all actors" link points to /directory
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import CropCoverage from './CropCoverage';
import { CROPS } from '@/lib/content/crops';
import type { Metrics } from '@/lib/api/metrics';

// ---------------------------------------------------------------------------
// Module mock
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
  actorsMapped: 1_000,
  cropsTracked: 3,
  regionsCovered: 7,
  actorTypes: 4,
  crops: [
    { slug: 'sorghum',     mappedActors: 500 },
    { slug: 'common_bean', mappedActors: 310 },
    { slug: 'groundnut',   mappedActors: 190 },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CropCoverage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) All three crop names + descriptions render ────────────────────────

  it('renders all three crop names and their descriptions', () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    render(<CropCoverage />);

    // Verify each crop name and description from the static content
    for (const crop of CROPS) {
      expect(screen.getByText(crop.name)).toBeInTheDocument();
      expect(screen.getByText(crop.description)).toBeInTheDocument();
    }
  });

  // ── (b) Per-crop actor counts render on success ───────────────────────────

  it('renders per-crop mapped actor counts matched to the correct slugs', () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    render(<CropCoverage />);

    // sorghum: 500
    expect(screen.getByText('500')).toBeInTheDocument();

    // common_bean: 310
    expect(screen.getByText('310')).toBeInTheDocument();

    // groundnut: 190
    expect(screen.getByText('190')).toBeInTheDocument();
  });

  // ── (c) Em-dash placeholder when metrics are null ─────────────────────────

  it('renders em-dash placeholders for each crop card when metrics are null', () => {
    useMetrics.mockReturnValue({ data: null, loading: false });

    expect(() => render(<CropCoverage />)).not.toThrow();

    // Three em-dash placeholders — one per crop card actor count
    const dashes = screen.getAllByText('—');
    expect(dashes).toHaveLength(3);

    // Crop names still render
    for (const crop of CROPS) {
      expect(screen.getByText(crop.name)).toBeInTheDocument();
    }
  });

  // ── (d) "View all actors" link → /directory ───────────────────────────────

  it('renders a "View all actors" link pointing to /directory', () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    render(<CropCoverage />);

    // The link must have an accessible name and the correct href
    const link = screen.getByRole('link', { name: /view all actors/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/directory');
  });
});
