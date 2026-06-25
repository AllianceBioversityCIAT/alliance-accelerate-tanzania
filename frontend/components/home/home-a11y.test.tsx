/**
 * Automated accessibility tests for the home page composition — T-7, NFR-3.
 *
 * Uses jest-axe to assert WCAG 2.1 AA compliance against the full rendered
 * composition: Header + Hero + MetricsBand + CropCoverage + Footer.
 *
 * Mocks:
 *   - @/lib/api/useMetrics  — same pattern as MetricsBand/CropCoverage tests
 *   - next/navigation        — usePathname used by Header NavLink components
 *   - @/lib/auth/useSession  — session stub used by Header AuthSlot
 *
 * Two cases exercised:
 *   (1) Successful data — { data: FULL_METRICS, loading: false }
 *   (2) Fallback state  — { data: null,         loading: false }
 * Both must pass axe with toHaveNoViolations().
 */

import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

// Extend jest-dom expect with jest-axe matcher
expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Components under test
// ---------------------------------------------------------------------------

import Header from '@/components/shell/Header';
import Footer from '@/components/shell/Footer';
import Hero from '@/components/home/Hero';
import MetricsBand from '@/components/home/MetricsBand';
import CropCoverage from '@/components/home/CropCoverage';

import type { Metrics } from '@/lib/api/metrics';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before dynamic imports resolve
// ---------------------------------------------------------------------------

// useMetrics — provides live data to MetricsBand and CropCoverage
jest.mock('@/lib/api/useMetrics', () => ({
  useMetrics: jest.fn(),
}));

// next/navigation — usePathname used by Header's NavLink and MobileNavLink
jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/'),
}));

// useSession — Header AuthSlot; default Public (unauthenticated) visitor
jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn().mockReturnValue({ role: 'Public', user: null }),
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
  actorsMapped: 1_234,
  cropsTracked: 3,
  regionsCovered: 7,
  actorTypes: 4,
  crops: [
    { slug: 'sorghum',     mappedActors: 500 },
    { slug: 'common_bean', mappedActors: 450 },
    { slug: 'groundnut',   mappedActors: 284 },
  ],
};

// ---------------------------------------------------------------------------
// Helper — render the full shell composition into a <div> wrapper.
// Header + Hero + MetricsBand + CropCoverage + Footer mirrors PublicLayout,
// which wraps children in <main> — we replicate that here so the landmark
// structure (header / main / footer) is present for axe to evaluate.
// ---------------------------------------------------------------------------

function renderHomePage() {
  return render(
    <>
      <Header />
      <main>
        <Hero />
        <MetricsBand />
        <CropCoverage />
      </main>
      <Footer />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Home page — axe accessibility', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('has no axe violations when metrics data is available (success state)', async () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    const { container } = renderHomePage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has no axe violations when metrics data is null (fallback / em-dash state)', async () => {
    useMetrics.mockReturnValue({ data: null, loading: false });

    const { container } = renderHomePage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// NFR-1 / FR-7: Reduced-motion / GSAP-mocked final-state assertions
//
// The GSAP mock makes matchMedia.add() a no-op — no animation callback ever
// fires. This is exactly the reduced-motion path (FR-7): animated surfaces
// must show all content immediately in their final visible state without any
// GSAP run. These tests make that contract explicit for the full home
// composition (Hero + MetricsBand + CropCoverage).
// ---------------------------------------------------------------------------

describe('Home page — reduced-motion / GSAP-mocked final-state (NFR-1, FR-7, FR-8)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('FR-7/FR-8: Hero headline is immediately visible in the reduced-motion (GSAP-mocked) path', () => {
    // GSAP mock: matchMedia.add is a no-op — entrance animation never fires.
    // The Hero must render its headline in its final visible state without GSAP.
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    const { getByRole } = renderHomePage();

    // The h1 must be present and visible — not hidden by a from-state that GSAP
    // never cleaned up (FR-8 progressive enhancement).
    const heading = getByRole('heading', { level: 1 });
    expect(heading).toBeVisible();
  });

  it('FR-7/FR-8: Hero CTA links are immediately visible in the reduced-motion path', () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    const { getByRole } = renderHomePage();

    // CTAs must be present and reachable without motion.
    expect(getByRole('link', { name: /explore the map/i })).toBeVisible();
    expect(getByRole('link', { name: /browse directory/i })).toBeVisible();
  });

  it('FR-7/FR-3/FR-8: LiveRegistryCard "1,000+" is immediately shown in the reduced-motion path', () => {
    // With matchMedia.add a no-op, useCountUp never fires its animation callback
    // and the JSX-rendered "1,000+" stays as the textContent (FR-8).
    // This is the reduced-motion behavior for the Hero count-up (FR-3/FR-7).
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    const { getByText } = renderHomePage();

    const countNode = getByText('1,000+');
    expect(countNode).toBeInTheDocument();
    expect(countNode).toBeVisible();
  });

  it('FR-7/FR-4/FR-8: MetricsBand figures are immediately visible in the reduced-motion path', () => {
    // MetricsBand StatCards with countUp=true rely on useCountUp inside StatCard.
    // With GSAP mocked, all figures must show their final values immediately.
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    const { getByText } = renderHomePage();

    // Four metric figures — all present and visible without animation.
    expect(getByText((_, el) =>
      el?.tagName === 'SPAN' && /1[,.]?234/.test(el.textContent ?? '')
    )).toBeVisible();
    expect(getByText('3')).toBeVisible();
    expect(getByText('7')).toBeVisible();
    expect(getByText('4')).toBeVisible();
  });

  it('FR-7/FR-5/FR-8: CropCoverage cards are immediately visible in the reduced-motion path', () => {
    // useReveal stagger-reveal is a no-op when GSAP is mocked — all CropCards
    // must render at their natural visible state (FR-5 reduced-motion compliance).
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    const { getByText } = renderHomePage();

    // All three crop names must be visible without motion.
    expect(getByText('Sorghum')).toBeVisible();
    expect(getByText('Common Bean')).toBeVisible();
    expect(getByText('Groundnut')).toBeVisible();
  });
});
