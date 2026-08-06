/**
 * Unit tests for LandingCTA — T-16 (FR-1 "Landing CTA" scenario).
 *
 * Filters: `home` (matched via filename) and `LandingCTA` directly.
 *
 * Covers:
 *   (a) H2 renders with role heading level 2
 *   (b) "Register your organisation" link points to /register
 *   (c) The review-before-publication fact is stated in the copy — the
 *       disqualifying clause from tasks.md T-16: asserting the link exists
 *       does not cover FR-1, which requires the *review* fact stated, because
 *       a visitor who believes submission equals publication has been misled
 *       about their own personal data.
 *   (d) The self-registration invitation ("actors may add themselves") is stated
 *
 * Per KZ-002, a presence assertion (the panel/link renders) is not a
 * behavioural proof. (c) and (d) are the behavioural assertions this task
 * exists to add.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import LandingCTA from './LandingCTA';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LandingCTA', () => {

  // ── (a) H2 renders with role heading level 2 ─────────────────────────────

  it('renders the section heading as a level-2 heading', () => {
    render(<LandingCTA />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute('id', 'landing-cta-heading');
  });

  // ── (b) "Register your organisation" link → /register ────────────────────

  it('renders the "Register your organisation" link pointing to /register', () => {
    render(<LandingCTA />);

    const link = screen.getByRole('link', { name: /register your organisation/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/register');
  });

  // ── (c) Review-before-publication fact is stated (FR-1 disqualifying clause) ──

  it('states that submissions are reviewed by the ACCELERATE team before publication', () => {
    render(<LandingCTA />);

    expect(
      screen.getByText(/reviewed by the accelerate team before it is published/i)
    ).toBeInTheDocument();
  });

  // ── (d) Self-registration invitation is stated ────────────────────────────

  it('states that seed-system actors can add themselves to the registry', () => {
    render(<LandingCTA />);

    expect(
      screen.getByText(/can add themselves to the registry/i)
    ).toBeInTheDocument();
  });
});
