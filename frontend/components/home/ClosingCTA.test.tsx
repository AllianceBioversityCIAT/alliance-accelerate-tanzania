/**
 * Unit tests for ClosingCTA — T-3 (original assertions) + T-10 (video gating).
 *
 * Filters: `ClosingCTA` (matched via filename).
 *
 * Covers:
 *   (a) H2 renders with role heading level 2
 *   (b) "Explore the Map" link points to /map
 *   (c) "About the project" link points to /about
 *   (d) [T-10] No <video> element in test env (matchMedia returns matches:false →
 *       playable stays false → poster-only branch)
 *   (e) [T-10] Poster <img> is present (always-rendered base layer)
 *
 * The jest.setup.ts matchMedia polyfill returns { matches: false } for every
 * query. When ClosingCTA evaluates matchMedia('(prefers-reduced-motion: no-preference)')
 * it gets false → setPlayable(false) → the <video> is never rendered → deterministic.
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

  // ── (d) [T-10] No <video> under reduced-motion (matchMedia matches:false) ─

  it('does NOT render a <video> element when matchMedia returns matches:false (poster branch)', () => {
    const { container } = render(<ClosingCTA />);

    // jest.setup.ts polyfills matchMedia to always return { matches: false }.
    // This means (prefers-reduced-motion: no-preference) does NOT match →
    // playable stays false → the conditional video block is not rendered.
    expect(container.querySelector('video')).toBeNull();
  });

  // ── (e) [T-10] Poster <img> is present (always-rendered base layer) ───────

  it('renders the poster image as the always-on base layer', () => {
    const { container } = render(<ClosingCTA />);

    // The poster next/image compiles to a real <img> in jsdom (next/jest transform).
    // It is aria-hidden (decorative) so we query by DOM, not by accessible role.
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', expect.stringContaining('closing-cta-poster'));
  });
});
