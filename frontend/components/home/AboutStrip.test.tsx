/**
 * Unit tests for AboutStrip — T-3, copy brief §2.3.
 *
 * Filters: `AboutStrip` (matched via filename).
 *
 * Covers:
 *   (a) H2 renders with role heading level 2
 *   (b) "Read the full story" link points to /about
 *   (c) Supporting text containing "3%" renders
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
});
