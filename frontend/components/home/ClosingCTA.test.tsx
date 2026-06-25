/**
 * Unit tests for ClosingCTA — T-3, copy brief §2.7.
 *
 * Filters: `ClosingCTA` (matched via filename).
 *
 * Covers:
 *   (a) H2 renders with role heading level 2
 *   (b) "Explore the Map" link points to /map
 *   (c) "About the project" link points to /about
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ClosingCTA from './ClosingCTA';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClosingCTA', () => {

  // ── (a) H2 renders with role heading level 2 ─────────────────────────────

  it('renders the section heading as a level-2 heading', () => {
    render(<ClosingCTA />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute('id', 'closing-cta-heading');
  });

  // ── (b) "Explore the Map" link → /map ────────────────────────────────────

  it('renders the "Explore the Map" link pointing to /map', () => {
    render(<ClosingCTA />);

    const link = screen.getByRole('link', { name: /explore the map/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/map');
  });

  // ── (c) "About the project" link → /about ────────────────────────────────

  it('renders the "About the project" link pointing to /about', () => {
    render(<ClosingCTA />);

    const link = screen.getByRole('link', { name: /about the project/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/about');
  });
});
