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
 *   (e) each card renders a crop image (next/image → <img>) — image-led redesign
 *   (f) no border-t-4 top accent present — removed in image-led redesign
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

  // ── (e) Each card renders a crop image (image-led redesign) ───────────────

  it('renders a crop image for each card (image-led redesign)', () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    const { container } = render(<CropCoverage />);

    // next/image renders as <img> in jsdom (next/jest transform).
    // Images with alt="" carry ARIA role "presentation" — use querySelectorAll.
    const images = container.querySelectorAll('img');
    // At minimum 3 images — one per crop card.
    expect(images.length).toBeGreaterThanOrEqual(3);

    // Each crop image src contains the filename stem from crops.ts.
    const srcs = Array.from(images).map((img) => img.getAttribute('src') ?? '');
    expect(srcs.some((s) => s.includes('sorghum'))).toBe(true);
    expect(srcs.some((s) => s.includes('common-bean'))).toBe(true);
    expect(srcs.some((s) => s.includes('groundnut'))).toBe(true);
  });

  // ── (f) No border-t-4 top accent on card wrappers ────────────────────────

  it('does not render border-t-4 class on crop card wrappers (removed in image-led redesign)', () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    const { container } = render(<CropCoverage />);

    // border-t-4 must not appear on any element in the CropCoverage subtree
    const allElements = container.querySelectorAll('[class*="border-t-4"]');
    expect(allElements).toHaveLength(0);
  });
});
