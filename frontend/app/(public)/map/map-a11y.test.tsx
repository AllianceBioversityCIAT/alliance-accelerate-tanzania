/**
 * Automated accessibility tests for the /map page composition — T-5, NFR-3.
 *
 * Uses jest-axe to assert WCAG 2.1 AA compliance against the full rendered
 * composition: DiscoverRail (FilterControls + ActorList) + stubbed map region.
 *
 * Mocks:
 *   - @/components/map/ActorMap  — Leaflet is jsdom-unfriendly; replaced with
 *     an ARIA-correct map region stub so axe evaluates the rail composition.
 *   - @/lib/api/useActors        — supplies a small consented-actor list without
 *     real network calls (same pattern as home-a11y.test.tsx).
 *   - next/navigation             — usePathname used by Header NavLink (via PublicLayout).
 *   - @/lib/auth/useSession       — Header AuthSlot stub (Public/unauthenticated).
 *
 * Two cases exercised:
 *   (1) Data-present state — useActors returns a populated actor list.
 *   (2) Error / fallback state — useActors returns error=true, data=null.
 * Both must pass axe with toHaveNoViolations().
 */

import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

// Extend jest-dom expect with the jest-axe matcher.
expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Components under test
// ---------------------------------------------------------------------------

import MapPage from './page';
import type { PublicActor, PublicActorList } from '@/lib/api/actors';

// ---------------------------------------------------------------------------
// Module mocks — hoisted before dynamic imports resolve
// ---------------------------------------------------------------------------

// ActorMap — swap the Leaflet boundary for an accessible stub so axe can
// evaluate the full page without hitting window/canvas Leaflet dependencies.
jest.mock('@/components/map/ActorMap', () => ({
  __esModule: true,
  default: () => (
    <div
      role="application"
      aria-label="Map of Tanzania seed-system actors"
      data-testid="actor-map-stub"
    />
  ),
}));

// useActors — controls hook state for each test scenario.
jest.mock('@/lib/api/useActors', () => ({
  useActors: jest.fn(),
}));

// next/navigation — usePathname consumed by Header NavLink components.
jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/map'),
}));

// useSession — Header AuthSlot; default Public (unauthenticated) visitor.
jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn().mockReturnValue({ role: 'Public', user: null }),
}));

/* eslint-disable */
const { useActors } = require('@/lib/api/useActors') as {
  useActors: jest.Mock;
};
/* eslint-enable */

// ---------------------------------------------------------------------------
// Fixtures — small consented-actor list (no PII: no phone/email)
// ---------------------------------------------------------------------------

const ACTOR_A: PublicActor = {
  id: 'actor-1',
  traderName: 'Dodoma Seeds Ltd',
  region: 'Dodoma',
  district: 'Dodoma Urban',
  traderType: 'seed_company',
  capacityTons: 500,
  crops: ['sorghum'],
  gps: { lat: -6.17, long: 35.74 },
};

const ACTOR_B: PublicActor = {
  id: 'actor-2',
  traderName: 'Mbeya Cooperative',
  region: 'Mbeya',
  district: null,
  traderType: 'cooperative',
  capacityTons: null,
  crops: ['common_bean', 'groundnut'],
  gps: null,
};

const ACTOR_LIST: PublicActorList = {
  data: [ACTOR_A, ACTOR_B],
  page: 1,
  pageSize: 20,
  total: 2,
};

// ---------------------------------------------------------------------------
// Helper — render the /map page composition into the DOM.
// MapPage owns the rail + map layout; we wrap it in Header/Footer if needed
// but MapPage itself emits a self-contained accessible structure.
// ---------------------------------------------------------------------------

function renderMapPage() {
  return render(<MapPage />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/map page — axe accessibility', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('has no axe violations when actor data is present (data state)', async () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });

    const { container } = renderMapPage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has no axe violations when error=true / data=null (error fallback state)', async () => {
    useActors.mockReturnValue({ data: null, loading: false, error: true });

    const { container } = renderMapPage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });
});
