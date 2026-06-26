/**
 * Unit tests for KpiBand — T-9, FR-4, NFR-6, design.md §5.5.
 *
 * Filter: `KpiBand` (matched via filename).
 *
 * Covers:
 *   (a) Given a populated kpis object, the matching count, region count,
 *       actor types, and "N reporting capacity" basis text render correctly.
 *   (b) Given kpis=null, Skeleton placeholders render and the component
 *       does not crash (NFR-6 safe null handling).
 *   (c) Given loading=true (with or without kpis), Skeletons render and
 *       numeric values are NOT present in the DOM.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import KpiBand from './KpiBand';
import type { DashboardKpis } from '@/lib/dashboard/aggregate';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_KPIS: DashboardKpis = {
  matchingCount: 42,
  totalCapacityTons: 12_500,
  medianCapacityTons: 250,
  capacityReportingCount: 18,
  regionsCovered: 7,
  actorTypes: 4,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count how many elements with role="presentation" are in the document.
 * Skeleton uses role="presentation" + aria-hidden="true" (see Skeleton.tsx).
 */
function getSkeletonCount(): number {
  return document.querySelectorAll('[role="presentation"]').length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KpiBand', () => {
  afterEach(() => {
    // Clean up the DOM between tests.
    document.body.innerHTML = '';
  });

  // ── (a) Populated kpis — values and basis text render ───────────────────

  describe('given a populated kpis object', () => {
    beforeEach(() => {
      render(<KpiBand kpis={FULL_KPIS} loading={false} />);
    });

    it('renders the matching actor count', () => {
      // matchingCount: 42 — no thousands separator needed.
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders the regions covered count', () => {
      // regionsCovered: 7
      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('renders the actor types count', () => {
      // actorTypes: 4
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('renders the "N reporting capacity" basis sublabel for total capacity', () => {
      // capacityReportingCount: 18 → "over 18 reporting capacity"
      const basisElements = screen.getAllByText(/over 18 reporting capacity/i);
      expect(basisElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders the "N reporting capacity" basis sublabel for median capacity', () => {
      // Both total and median share the same basis sublabel.
      const basisElements = screen.getAllByText(/over 18 reporting capacity/i);
      // Expect at least 2 instances (one for total, one for median).
      expect(basisElements.length).toBeGreaterThanOrEqual(2);
    });

    it('renders all five KPI card labels', () => {
      expect(screen.getByText('Matching actors')).toBeInTheDocument();
      expect(screen.getByText('Total capacity (t)')).toBeInTheDocument();
      expect(screen.getByText('Median capacity (t)')).toBeInTheDocument();
      expect(screen.getByText('Regions covered')).toBeInTheDocument();
      expect(screen.getByText('Actor types')).toBeInTheDocument();
    });

    it('renders no Skeleton placeholders when data is ready', () => {
      expect(getSkeletonCount()).toBe(0);
    });

    it('renders the total capacity with thousands separator', () => {
      // 12_500 → "12,500" (en-US) or locale-equivalent.
      // Test for the numeric substring without assuming separator character.
      const el = screen.getByText((_, node) =>
        node?.tagName === 'SPAN' && /12[,.]?500/.test(node.textContent ?? ''),
      );
      expect(el).toBeInTheDocument();
    });
  });

  // ── (b) kpis=null — Skeletons render, no crash ──────────────────────────

  describe('given kpis=null', () => {
    it('does not crash', () => {
      expect(() => render(<KpiBand kpis={null} />)).not.toThrow();
    });

    it('renders Skeleton placeholders for every card (NFR-6)', () => {
      render(<KpiBand kpis={null} />);
      // 5 cards × at least 1 Skeleton each (value slot).
      expect(getSkeletonCount()).toBeGreaterThanOrEqual(5);
    });

    it('renders no numeric KPI values when kpis is null', () => {
      render(<KpiBand kpis={null} />);
      // None of the real values should appear.
      expect(screen.queryByText('42')).not.toBeInTheDocument();
      expect(screen.queryByText('7')).not.toBeInTheDocument();
      expect(screen.queryByText('4')).not.toBeInTheDocument();
    });

    it('still renders all five card labels when kpis is null', () => {
      render(<KpiBand kpis={null} />);
      expect(screen.getByText('Matching actors')).toBeInTheDocument();
      expect(screen.getByText('Total capacity (t)')).toBeInTheDocument();
      expect(screen.getByText('Median capacity (t)')).toBeInTheDocument();
      expect(screen.getByText('Regions covered')).toBeInTheDocument();
      expect(screen.getByText('Actor types')).toBeInTheDocument();
    });
  });

  // ── (c) loading=true — Skeletons render, no numbers ─────────────────────

  describe('given loading=true', () => {
    it('does not crash when loading=true and kpis is null', () => {
      expect(() => render(<KpiBand kpis={null} loading={true} />)).not.toThrow();
    });

    it('renders Skeleton placeholders while loading (NFR-6)', () => {
      render(<KpiBand kpis={null} loading={true} />);
      expect(getSkeletonCount()).toBeGreaterThanOrEqual(5);
    });

    it('renders Skeleton placeholders even when kpis is provided but loading=true', () => {
      render(<KpiBand kpis={FULL_KPIS} loading={true} />);
      expect(getSkeletonCount()).toBeGreaterThanOrEqual(5);
    });

    it('does not render KPI numeric values while loading', () => {
      render(<KpiBand kpis={FULL_KPIS} loading={true} />);
      expect(screen.queryByText('42')).not.toBeInTheDocument();
      expect(screen.queryByText('7')).not.toBeInTheDocument();
      expect(screen.queryByText('4')).not.toBeInTheDocument();
    });

    it('renders no basis sublabel text while loading', () => {
      render(<KpiBand kpis={FULL_KPIS} loading={true} />);
      expect(screen.queryByText(/reporting capacity/i)).not.toBeInTheDocument();
    });
  });
});
