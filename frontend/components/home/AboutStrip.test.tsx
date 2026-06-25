/**
 * Unit tests for AboutStrip — T-3 (original assertions) + two-column video gate.
 *
 * Filters: `AboutStrip` (matched via filename).
 *
 * Covers:
 *   (a) H2 renders with role heading level 2
 *   (b) "Read the full story" link points to /about
 *   (c) Supporting text containing "3%" renders
 *   (d) No <video> element in test env (matchMedia returns matches:false →
 *       playable stays false → poster-only branch)
 *   (e) Poster <img> is present (always-rendered base layer)
 *
 * The jest.setup.ts matchMedia polyfill returns { matches: false } for every
 * query. When AboutStrip evaluates matchMedia('(prefers-reduced-motion: no-preference)')
 * it gets false → setPlayable(false) → the <video> is never rendered → deterministic.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import AboutStrip from './AboutStrip';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AboutStrip', () => {

  // ── (a) H2 renders with role heading level 2 ─────────────────────────────

  it('renders the section heading as a level-2 heading', () => {
    render(<AboutStrip />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute('id', 'about-strip-heading');
  });

  // ── (b) "Read the full story" link → /about ───────────────────────────────

  it('renders the "Read the full story" link pointing to /about', () => {
    render(<AboutStrip />);

    const link = screen.getByRole('link', { name: /read the full story/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/about');
  });

  // ── (c) Supporting paragraph contains "3%" ────────────────────────────────

  it('renders the supporting text that includes the "3%" statistic', () => {
    render(<AboutStrip />);

    // The strong element wraps "3% of farmers' planting needs"; query by partial text.
    expect(screen.getByText(/3%/)).toBeInTheDocument();
  });

  // ── (d) No <video> under reduced-motion (matchMedia matches:false) ─────────

  it('does NOT render a <video> element when matchMedia returns matches:false (poster branch)', () => {
    const { container } = render(<AboutStrip />);

    // jest.setup.ts polyfills matchMedia to always return { matches: false }.
    // This means (prefers-reduced-motion: no-preference) does NOT match →
    // playable stays false → the conditional video block is not rendered.
    expect(container.querySelector('video')).toBeNull();
  });

  // ── (e) Poster <img> is present (always-rendered base layer) ──────────────

  it('renders the poster image as the always-on base layer', () => {
    const { container } = render(<AboutStrip />);

    // The poster next/image compiles to a real <img> in jsdom (next/jest transform).
    // It is aria-hidden (decorative) so we query by DOM, not by accessible role.
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', expect.stringContaining('about-grain-shop-poster'));
  });
});
