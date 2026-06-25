/**
 * Unit tests for HowItWorks — T-4, FR-5, §2.4.
 *
 * Filters: `HowItWorks` (matched via filename).
 *
 * Covers:
 *   (a) H2 "A demand-led seed system" renders at heading level 2
 *   (b) eyebrow pill "The model" renders
 *   (c) intro paragraph substring renders
 *   (d) all three pillar card titles render (PillarCards is composed in)
 *
 * GSAP is mocked via moduleNameMapper in jest.config.ts so useReveal runs once
 * as a no-op and all content is present in the DOM at natural visible state
 * (progressive enhancement — see useReveal docs, FR-8).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import HowItWorks from './HowItWorks';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HowItWorks', () => {
  // ── (a) H2 renders at heading level 2 ─────────────────────────────────────

  it('renders the H2 "A demand-led seed system" as a level-2 heading', () => {
    render(<HowItWorks />);

    const heading = screen.getByRole('heading', {
      level: 2,
      name: /a demand-led seed system/i,
    });
    expect(heading).toBeInTheDocument();
  });

  // ── (b) Eyebrow pill "The model" renders ──────────────────────────────────

  it('renders the eyebrow pill "The model"', () => {
    render(<HowItWorks />);

    expect(screen.getByText('The model')).toBeInTheDocument();
  });

  // ── (c) Intro paragraph substring renders ─────────────────────────────────

  it('renders the intro paragraph with the demand-led copy', () => {
    render(<HowItWorks />);

    // Match a distinctive substring from the approved copy brief §2.4
    expect(
      screen.getByText(/instead of pushing seed at farmers/i),
    ).toBeInTheDocument();
  });

  // ── (d) All three pillar card titles render (PillarCards composed in) ─────

  it('renders "Information flow" pillar card title', () => {
    render(<HowItWorks />);
    expect(screen.getByText('Information flow')).toBeInTheDocument();
  });

  it('renders "Marketplace traders" pillar card title', () => {
    render(<HowItWorks />);
    expect(screen.getByText('Marketplace traders')).toBeInTheDocument();
  });

  it('renders "Institutional buyers" pillar card title', () => {
    render(<HowItWorks />);
    expect(screen.getByText('Institutional buyers')).toBeInTheDocument();
  });
});
