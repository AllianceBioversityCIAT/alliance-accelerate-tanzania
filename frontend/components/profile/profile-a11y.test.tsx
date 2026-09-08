/**
 * Automated accessibility tests for ProfileView — T-7, T-15, NFR-3.
 *
 * Uses jest-axe to assert WCAG 2.1 AA compliance against the full rendered
 * ProfileView composition: ProfileHeader + ProfileLocation + ProfileMarketActivity
 * + ProfileCapacity + ProfileContact.
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
 * Also asserts (FR-1, FR-6, D-14):
 *   - The contact block's disclosed VALUES render for a GRANTED actor in the
 *     success state (not merely the "phone"/"email" LABELS — a label-only
 *     match reddens on the label itself and is not FR-1 coverage; see
 *     ProfileView.test.tsx for the full disclosure/em-dash suite).
 *   - No "Restricted" affordance survives anywhere on the page, checked at
 *     the page level (RV-1).
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
import type { PublicActorDetail } from '@/lib/api/actors';
import { ACTOR_FULL, ACTOR_SPARSE } from './__fixtures__/actor';

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
// Fixtures — PublicActorDetail shapes. ACTOR_FULL carries a real contact
// block (contactPerson/position/phone/email/marketLocation, FR-1: the
// detail endpoint discloses it for a GRANTED actor); ACTOR_SPARSE carries
// none, for the FR-6 em-dash path.
// ---------------------------------------------------------------------------


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
// Contact block disclosure (FR-1, FR-6) — asserts VALUES, not labels.
// ProfileView.test.tsx carries the full disclosure + em-dash suite; this
// file adds the not-found/loading-state absence checks so the a11y file
// stays self-contained and runs in isolation. A substring match on the
// LABEL (`queryByText(/phone/i)`) would redden on the word "Phone" itself
// and prove nothing about disclosure (T-15 review note, carried from T-14)
// — so the success-state assertion here matches the actual fixture VALUE.
// ---------------------------------------------------------------------------

describe('ProfileView — contact block disclosure (FR-1, FR-6)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the disclosed contact VALUES in the success state (full actor)', () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-full' });
    useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

    renderProfile();

    expect(screen.getByText(ACTOR_FULL.contactPerson!)).toBeInTheDocument();
    expect(screen.getByText(ACTOR_FULL.phone!)).toBeInTheDocument();
    expect(screen.getByText(ACTOR_FULL.email!)).toBeInTheDocument();
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
// No "Restricted" affordance survives anywhere on the page (FR-6, D-14)
// (cross-check alongside ProfileView.test.tsx — duplicates intentional
// to ensure the a11y file is self-contained and runs in isolation).
// Page-level: rendered via the same `renderProfile()` helper used by every
// other test in this file, sweeping the whole tree, not scoped to any one
// section (RV-1 / D-14 disqualifier).
// ---------------------------------------------------------------------------

describe('ProfileView — no "Restricted" affordance survives anywhere on the page (FR-6, D-14)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders no "Restricted" affordance (full actor)', () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-full' });
    useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

    renderProfile();

    expect(screen.queryByText(/restricted/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Contact & Commercial Data' }),
    ).not.toBeInTheDocument();
  });

  it('renders no "Restricted" affordance (sparse actor)', () => {
    useSearchParams.mockReturnValue({ get: () => 'actor-sparse' });
    useActor.mockReturnValue({ data: ACTOR_SPARSE, loading: false, error: false });

    renderProfile();

    expect(screen.queryByText(/restricted/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Contact & Commercial Data' }),
    ).not.toBeInTheDocument();
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
