/**
 * Automated accessibility tests for the home page composition — T-7, NFR-3.
 *
 * Uses jest-axe to assert WCAG 2.1 AA compliance against the full rendered
 * composition (all 7 sections):
 *   Header + Hero + MetricsBand + AboutStrip + HowItWorks +
 *   CropCoverage + PartnersStrip + ClosingCTA + Footer.
 *
 * Mocks:
 *   - @/lib/api/useMetrics  — same pattern as MetricsBand/CropCoverage tests
 *   - next/navigation        — usePathname used by Header NavLink components
 *   - @/lib/auth/useSession  — session stub used by Header AuthSlot
 *
 * next/image: no mock needed — next/jest transform renders a real <img> in jsdom
 * (confirmed by PartnersStrip.test.tsx which renders next/image without a mock).
 *
 * Two cases exercised:
 *   (1) Successful data — { data: FULL_METRICS, loading: false }
 *   (2) Fallback state  — { data: null,         loading: false }
 * Both must pass axe with toHaveNoViolations().
 *
 * Additional invariant (T-6):
 *   Exactly ONE <h1> on the page (from Hero); new sections use <h2>.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
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
import AboutStrip from '@/components/home/AboutStrip';
import HowItWorks from '@/components/home/HowItWorks';
import CropCoverage from '@/components/home/CropCoverage';
import PartnersStrip from '@/components/home/PartnersStrip';
import ClosingCTA from '@/components/home/ClosingCTA';

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
// Header + all 7 home sections + Footer mirrors PublicLayout, which wraps
// children in <main> — we replicate that here so the landmark structure
// (header / main / footer) is present for axe to evaluate.
//
// Section order (T-6, FR-8, copy brief §2.0):
//   Hero → MetricsBand → AboutStrip → HowItWorks →
//   CropCoverage → PartnersStrip → ClosingCTA
// ---------------------------------------------------------------------------

function renderHomePage() {
  return render(
    <>
      <Header />
      <main>
        <Hero />
        <MetricsBand />
        <AboutStrip />
        <HowItWorks />
        <CropCoverage />
        <PartnersStrip />
        <ClosingCTA />
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

  // T-6: exactly ONE <h1> across all 7 sections — Hero provides it; new sections use <h2>.
  it('T-6: has exactly one h1 on the composed page (Hero provides it; new sections use h2)', () => {
    useMetrics.mockReturnValue({ data: FULL_METRICS, loading: false });

    renderHomePage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
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

    const { getAllByRole, getByRole } = renderHomePage();

    // "Explore the Map" appears in both Hero and ClosingCTA — all instances must be visible.
    // getAllByRole avoids the multiple-match error; we assert each one is visible.
    const exploreLinks = getAllByRole('link', { name: /explore the map/i });
    expect(exploreLinks.length).toBeGreaterThanOrEqual(1);
    exploreLinks.forEach((link) => expect(link).toBeVisible());

    // "Browse Directory" is unique to the Hero CTA.
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

    const { getAllByText, getByText } = renderHomePage();

    // Four metric figures — all present and visible without animation.
    expect(getByText((_, el) =>
      el?.tagName === 'SPAN' && /1[,.]?234/.test(el.textContent ?? '')
    )).toBeVisible();

    // '3' appears in both MetricsBand (cropsTracked stat) and PillarCards badge #3
    // (aria-hidden="true"). Isolate the MetricsBand StatCard span via its text-3xl
    // class; getAllByText avoids a multiple-match error.
    const threes = getAllByText('3');
    const metricThree = threes.find((el) => el.className.includes('text-3xl'));
    expect(metricThree).toBeDefined();
    expect(metricThree).toBeVisible();

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
