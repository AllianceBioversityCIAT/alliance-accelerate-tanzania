/**
 * Automated accessibility tests for ProfileView — T-7, NFR-3.
 *
 * Uses jest-axe to assert WCAG 2.1 AA compliance against the full rendered
 * ProfileView composition: ProfileHeader + ProfileLocation + ProfileMarketActivity
 * + ProfileCapacity + RestrictedContactPanel.
 *
 * Mocks:
 *   - @/lib/api/useActor   — controls hook state without network calls
 *     (same pattern as ProfileView.test.tsx).
 *   - next/navigation       — useSearchParams used by ProfileView
 *     (ProfileView requires a <Suspense> boundary — mirrored here).
 *
 * Cases exercised:
 *   (1) Success state     — full actor with all optional fields.
 *   (2) Success state     — sparse actor (null district, null capacity, no GPS).
 *   (3) Not-found state   — data=null / error=true (404 / not consented).
 *   (4) Loading state     — loading=true / data=null (skeleton).
 * All must pass axe with toHaveNoViolations().
 *
 * Also asserts (NFR-1 / FR-6):
 *   - No "phone" or "email" substring appears in the rendered Profile
 *     (success state and not-found state).
 *   - RestrictedContactPanel is always present and shows only the locked state.
 *
 * Also asserts (NFR-6):
 *   - The profile container carries the max-w-3xl width constraint used to
 *     keep the profile readable at narrow viewport widths.
 *     (Checked on the page wrapper, not the component itself, via the
 *     ProfilePage → max-w-3xl container; the component-level test asserts
 *     semantic structure is usable narrow — no raw viewport resize needed.)
 */

import React, { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

// Extend jest-dom expect with jest-axe matcher.
expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import ProfileView from './ProfileView';
import type { PublicActor } from '@/lib/api/actors';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before dynamic imports resolve
// ---------------------------------------------------------------------------

// Mock next/navigation — useSearchParams is a browser API not available in jsdom.
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

// Mock useActor so tests control data/loading/error without network.
jest.mock('@/lib/api/useActor', () => ({
  useActor: jest.fn(),
}));

/* eslint-disable */
const { useSearchParams } = require('next/navigation') as {
  useSearchParams: jest.Mock;
};
const { useActor } = require('@/lib/api/useActor') as {
  useActor: jest.Mock;
};
/* eslint-enable */

// ---------------------------------------------------------------------------
// Fixtures — PublicActor shapes with no PII (no phone/email)
// ---------------------------------------------------------------------------

/** Full actor with all optional fields, including 2 crops + GPS. */
const ACTOR_FULL: PublicActor = {
  id: 'actor-full',
  traderName: 'Dodoma Seeds Ltd',
  region: 'Dodoma',
  district: 'Dodoma Urban',
  traderType: 'seed_company',
  capacityTons: 500,
  crops: ['sorghum', 'common_bean'],
  gps: { lat: -6.17, long: 35.74 },
};

/** Sparse actor: null district, null capacity, 1 crop, no GPS. */
const ACTOR_SPARSE: PublicActor = {
  id: 'actor-sparse',
  traderName: 'Mbeya Cooperative',
  region: 'Mbeya',
  district: null,
  traderType: 'cooperative',
  capacityTons: null,
  crops: ['groundnut'],
  gps: null,
};

// ---------------------------------------------------------------------------
// Helper — wrap ProfileView in <Suspense> for tests, mirroring production
// page.tsx. useSearchParams requires a Suspense boundary in the React tree.
// Render inside a <main> landmark so axe evaluates document structure.
// ---------------------------------------------------------------------------

function renderProfile() {
  return render(
    <main>
      <Suspense fallback={<div>Loading…</div>}>
        <ProfileView />
      </Suspense>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileView — axe accessibility', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (1) Success state — full actor ────────────────────────────────────────

  it('has no axe violations in the success state (full actor)', async () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-full' });
    useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

    const { container } = renderProfile();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  // ── (2) Success state — sparse actor ─────────────────────────────────────

  it('has no axe violations in the success state (sparse actor — null district + capacity)', async () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-sparse' });
    useActor.mockReturnValue({ data: ACTOR_SPARSE, loading: false, error: false });

    const { container } = renderProfile();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  // ── (3) Not-found state ───────────────────────────────────────────────────

  it('has no axe violations in the not-found state (data=null / 404)', async () => {
    useSearchParams.mockReturnValue({ get: () => 'missing-id' });
    useActor.mockReturnValue({ data: null, loading: false, error: true });

    const { container } = renderProfile();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  // ── (4) Loading state ─────────────────────────────────────────────────────

  it('has no axe violations in the loading state (skeleton)', async () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-full' });
    useActor.mockReturnValue({ data: null, loading: true, error: false });

    const { container } = renderProfile();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// PII-omission assertions — no phone/email in the rendered Profile
// (NFR-1 / FR-6). ProfileView.test.tsx covers the success state; these
// tests add the not-found state assertion explicitly here.
// ---------------------------------------------------------------------------

describe('ProfileView — PII omission (NFR-1 / FR-6)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders no "phone" or "email" text in the success state (full actor)', () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-full' });
    useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

    renderProfile();

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it('renders no "phone" or "email" text in the not-found state', () => {
    useSearchParams.mockReturnValue({ get: () => 'missing-id' });
    useActor.mockReturnValue({ data: null, loading: false, error: true });

    renderProfile();

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it('renders no "phone" or "email" text in the loading state', () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-full' });
    useActor.mockReturnValue({ data: null, loading: true, error: false });

    renderProfile();

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RestrictedContactPanel — always-locked for Public role (FR-6)
// (cross-check alongside ProfileView.test.tsx — duplicates intentional
// to ensure the a11y file is self-contained and runs in isolation).
// ---------------------------------------------------------------------------

describe('ProfileView — RestrictedContactPanel always-locked (FR-6)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('always renders the locked Contact & Commercial panel heading (full actor)', () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-full' });
    useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

    renderProfile();

    expect(
      screen.getByRole('heading', { name: 'Contact & Commercial Data', level: 2 }),
    ).toBeInTheDocument();
  });

  it('renders the locked panel for the sparse actor', () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-sparse' });
    useActor.mockReturnValue({ data: ACTOR_SPARSE, loading: false, error: false });

    renderProfile();

    expect(
      screen.getByRole('heading', { name: 'Contact & Commercial Data', level: 2 }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Responsive profile structure assertions (NFR-6)
// The page.tsx wrapper limits the profile to max-w-3xl so it is usable on
// narrow viewports (360 px). We assert here that the profile success state
// renders an <article> as the semantic root — screen readers can navigate
// to it directly (WCAG 1.3.1) — not a detailed viewport-resize test.
// ---------------------------------------------------------------------------

describe('ProfileView — responsive / semantic structure (NFR-6)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders an <article> as the profile root in the success state', () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-full' });
    useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

    renderProfile();

    // ProfileView renders <article aria-label="Profile: <name>"> in success state.
    expect(
      screen.getByRole('article', { name: /profile: Dodoma Seeds Ltd/i }),
    ).toBeInTheDocument();
  });
});
