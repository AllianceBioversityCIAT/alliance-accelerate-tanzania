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
