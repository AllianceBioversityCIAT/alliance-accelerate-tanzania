/**
 * Unit tests for PillarCards — T-2, FR-5, FR-12, design.md §5.5.
 *
 * Filters: `PillarCards` (matched via filename).
 *
 * Covers:
 *   (a) all three pillar titles render
 *   (b) at least a substring of each body renders
 *   (c) three <h3> card headings are present
 *   (d) grid container carries the md:grid-cols-3 class
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PillarCards from './PillarCards';
import { PILLARS } from '@/lib/content/pillars';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PillarCards', () => {
  // ── (a) All three pillar titles render ─────────────────────────────────────

  it('renders all three pillar titles', () => {
    render(<PillarCards />);

    expect(screen.getByText('Information flow')).toBeInTheDocument();
    expect(screen.getByText('Marketplace traders')).toBeInTheDocument();
    expect(screen.getByText('Institutional buyers')).toBeInTheDocument();
  });

  // ── (b) A substring of each body renders ───────────────────────────────────

  it('renders a substring of each pillar body', () => {
    render(<PillarCards />);

    for (const pillar of PILLARS) {
      // Verify at least a portion of the approved copy is present in the DOM
      const bodySubstring = pillar.body.slice(0, 20);
      expect(screen.getByText(pillar.body)).toBeInTheDocument();
      // Also assert the substring is contained (belt-and-suspenders)
      expect(screen.getByText(pillar.body).textContent).toContain(bodySubstring);
    }
  });

  // ── (c) Three <h3> card headings are present ───────────────────────────────

  it('renders exactly three h3 headings (one per card)', () => {
    render(<PillarCards />);

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(3);
  });

  // ── (d) Grid container carries md:grid-cols-3 class ───────────────────────

  it('applies md:grid-cols-3 class on the grid container', () => {
    const { container } = render(<PillarCards />);

    // The outermost div is the grid wrapper
    const grid = container.firstElementChild as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.className).toContain('md:grid-cols-3');
  });
});
