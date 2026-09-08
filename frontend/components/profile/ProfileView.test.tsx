/**
 * Unit tests for ProfileView + profile section components.
 * T-5, T-15, FR-1, FR-5, FR-6, FR-8, FR-9, NFR-1, NFR-3.
 *
 * Filter: `profile` (matched via test file path).
 *
 * Covers:
 *   (a) renders all profile sections from a mocked PublicActorDetail
 *   (b) not-found when data is null (404 / non-consented)
 *   (c) not-found when id is missing from the URL
 *   (d) loading state — skeletons shown, sections absent
 *   (e) contact block DISCLOSURE — asserts the disclosed VALUES render for a
 *       GRANTED actor, and the em-dash path for an absent value with no row
 *       hidden (FR-1, FR-6). This inverts the pre-T-14 "PII omission" guard,
 *       which asserted the OPPOSITE of what FR-1 now requires.
 *   (f) no "Restricted" affordance survives anywhere on the page, checked at
 *       the page level, not scoped to any one section (FR-6, D-14 — RV-1)
 *
 * Mocking:
 *   - useActor is module-mocked so no real fetch occurs (mirrors useActor.test.ts)
 *   - useSearchParams is mocked per-test via mockReturnValue (next/navigation)
 *
 * Rendering:
 *   ProfileView calls useSearchParams() so it must be wrapped in <Suspense>
 *   for the test render (same requirement as the production page.tsx).
 */

import React, { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import ProfileView from './ProfileView';
import type { PublicActorDetail } from '@/lib/api/actors';
import { ACTOR_FULL, ACTOR_SPARSE } from './__fixtures__/actor';

// ── Module mocks (hoisted before imports are evaluated) ────────────────────────

// Mock next/navigation — useSearchParams is a browser API not available in jsdom
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

// Mock useActor so tests control data/loading/error without network
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Full actor with all optional fields, including 2 crops + GPS, AND the full
 * contact block (FR-1: the detail endpoint discloses it for a GRANTED
 * actor). Typed PublicActorDetail — this is one of only two consumers of
 * that shape (design.md §9 DD-6) — mirroring useActor's real return type.
 */

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Wrap ProfileView in Suspense for tests — mirrors the production page.tsx.
 * useSearchParams requires a Suspense boundary in the React tree.
 */
function renderProfile() {
  return render(
    <Suspense fallback={<div>Loading…</div>}>
      <ProfileView />
    </Suspense>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfileView', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) Success: renders all profile sections ─────────────────────────────

  describe('success state — full actor', () => {
    beforeEach(() => {
      useSearchParams.mockReturnValue({ get: () => 'actor-full' });
      useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });
    });

    it('renders the actor name (traderName)', () => {
      renderProfile();
      expect(screen.getByRole('heading', { name: 'Dodoma Seeds Ltd', level: 1 })).toBeInTheDocument();
    });

    it('renders the role badge label', () => {
      renderProfile();
      // ROLES.seed_company.label = 'Seed Company'
      expect(screen.getByText('Seed Company')).toBeInTheDocument();
    });

    it('renders region and district in the header', () => {
      renderProfile();
      // Region appears in ProfileHeader location line and ProfileLocation section
      expect(screen.getAllByText(/Dodoma/).length).toBeGreaterThanOrEqual(1);
      // District appears in both header and ProfileLocation — use getAllBy
      expect(screen.getAllByText(/Dodoma Urban/).length).toBeGreaterThanOrEqual(1);
    });

    it('renders the Location section heading', () => {
      renderProfile();
      expect(screen.getByRole('heading', { name: 'Location', level: 2 })).toBeInTheDocument();
    });

    it('renders GPS coordinates as text when present', () => {
      renderProfile();
      // formatGps(-6.17, 35.74) → '-6.1700° N, 35.7400° E'
      expect(screen.getByText(/-6\.1700/)).toBeInTheDocument();
    });

    it('renders the Market Activity section heading', () => {
      renderProfile();
      expect(screen.getByRole('heading', { name: 'Market Activity', level: 2 })).toBeInTheDocument();
    });

    it('renders crop chips for each crop slug', () => {
      renderProfile();
      expect(screen.getByText('Sorghum')).toBeInTheDocument();
      expect(screen.getByText('Common Bean')).toBeInTheDocument();
      expect(screen.queryByText('Groundnut')).not.toBeInTheDocument();
    });

    it('renders the Operational Capacity section heading', () => {
      renderProfile();
      expect(screen.getByRole('heading', { name: 'Operational Capacity', level: 2 })).toBeInTheDocument();
    });

    it('renders capacity with unit when capacityTons is set', () => {
      renderProfile();
      expect(screen.getByText(/500/)).toBeInTheDocument();
    });

    it('renders the Contact section heading (ProfileContact replaces the locked panel, FR-6)', () => {
      renderProfile();
      expect(screen.getByRole('heading', { name: 'Contact', level: 2 })).toBeInTheDocument();
    });

    it('renders the Profile section heading', () => {
      renderProfile();
      expect(screen.getByRole('heading', { name: 'Profile', level: 2 })).toBeInTheDocument();
    });
  });

  describe('success state — sparse actor', () => {
    beforeEach(() => {
      useSearchParams.mockReturnValue({ get: () => 'actor-sparse' });
      useActor.mockReturnValue({ data: ACTOR_SPARSE, loading: false, error: false });
    });

    it('renders "—" when district is null', () => {
      renderProfile();
      // ProfileLocation renders "—" for null district; ProfileCapacity also
      // renders "—" for null capacity — use getAllBy since both may appear
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    });

    it('renders the single crop chip', () => {
      renderProfile();
      expect(screen.getByText('Groundnut')).toBeInTheDocument();
    });

    it('renders "—" capacity when capacityTons is null', () => {
      renderProfile();
      // ProfileCapacity renders "—" for null capacityTons (distinct from district em-dash)
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('does not render GPS coordinates when gps is null', () => {
      renderProfile();
      expect(screen.queryByText(/Coordinates/i)).not.toBeInTheDocument();
    });
  });

  // ── (b) Not-found when data is null (404 / not consented) ─────────────────

  describe('not-found state — data null', () => {
    beforeEach(() => {
      useSearchParams.mockReturnValue({ get: () => 'missing-id' });
      useActor.mockReturnValue({ data: null, loading: false, error: true });
    });

    it('renders the not-found message', () => {
      renderProfile();
      expect(screen.getByText(/profile not available/i)).toBeInTheDocument();
    });

    it('does not render any profile section headings', () => {
      renderProfile();
      expect(screen.queryByRole('heading', { name: 'Location', level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Market Activity', level: 2 })).not.toBeInTheDocument();
    });
  });

  // ── (c) Not-found when id is missing from URL ─────────────────────────────

  describe('not-found state — missing id in URL', () => {
    beforeEach(() => {
      // useSearchParams.get('id') returns null → no id in URL
      useSearchParams.mockReturnValue({ get: () => null });
      // useActor called with '' falls through to error state
      useActor.mockReturnValue({ data: null, loading: false, error: true });
    });

    it('renders the not-found message when id is absent', () => {
      renderProfile();
      expect(screen.getByText(/profile not available/i)).toBeInTheDocument();
    });
  });

  // ── (d) Loading state ─────────────────────────────────────────────────────

  describe('loading state', () => {
    beforeEach(() => {
      useSearchParams.mockReturnValue({ get: () => 'actor-full' });
      useActor.mockReturnValue({ data: null, loading: true, error: false });
    });

    it('renders aria-busy loading indicator', () => {
      renderProfile();
      expect(screen.getByLabelText(/loading profile/i)).toBeInTheDocument();
    });

    it('does not render profile section headings while loading', () => {
      renderProfile();
      expect(screen.queryByRole('heading', { name: 'Location', level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Market Activity', level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Dodoma Seeds Ltd', level: 1 })).not.toBeInTheDocument();
    });
  });

  // ── (e) Contact block DISCLOSURE — asserts VALUES, not labels (FR-1, FR-6) ─
  //
  // T-15 review note (carried from T-14): a substring match on the LABEL
  // (`queryByText(/phone/i)`) proves only that the word "Phone" is on the
  // page — it reddens on the label itself and says nothing about whether a
  // VALUE was disclosed. FR-1 requires the actual disclosed value to render
  // for a GRANTED actor; these assertions match the fixture's real phone
  // number, email address, and contact person name.

  describe('Contact block disclosure (FR-1) — asserts values, not labels', () => {
    it('renders the disclosed contact VALUES for a GRANTED actor with the full record', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-full' });
      useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

      renderProfile();

      expect(screen.getByText(ACTOR_FULL.contactPerson!)).toBeInTheDocument();
      expect(screen.getByText(ACTOR_FULL.position!)).toBeInTheDocument();
      expect(screen.getByText(ACTOR_FULL.phone!)).toBeInTheDocument();
      expect(screen.getByText(ACTOR_FULL.email!)).toBeInTheDocument();
      expect(screen.getByText(ACTOR_FULL.marketLocation!)).toBeInTheDocument();
      // Profile section fields (sex, otherCrops) — list-set members, not
      // CONTACT_BLOCK_FIELDS, but every published field's label MUST always
      // render its value too (FR-6).
      expect(screen.getByText(ACTOR_FULL.sex!)).toBeInTheDocument();
      expect(screen.getByText(ACTOR_FULL.otherCrops!)).toBeInTheDocument();
    });

    it('renders an em-dash for every absent contact field, with no row hidden (FR-6)', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-sparse' });
      useActor.mockReturnValue({ data: ACTOR_SPARSE, loading: false, error: false });

      renderProfile();

      // Every label still renders — a hidden row would fail these first.
      // Includes the two Profile-section rows (Sex, Other Crops): they are
      // NOT CONTACT_BLOCK_FIELDS, but FR-6's "every published field's label
      // MUST always render" binds them too — and they are the two fields
      // also published on the list path, the likeliest to be "tidied" away.
      const labels = ['Contact Person', 'Position', 'Phone', 'Email', 'Market Location', 'Sex', 'Other Crops'];
      for (const label of labels) {
        const labelEl = screen.getByText(label);
        expect(labelEl).toBeInTheDocument();
        // ...and its own value cell is the em-dash placeholder, not omitted
        // (FR-6: "it must NOT hide a row whose value is absent").
        expect(labelEl.closest('div')).toHaveTextContent('—');
      }
    });
  });

  // ── (f) No "Restricted" affordance survives anywhere on the page (D-14) ───
  //
  // Page-level, not component-level (RV-1 / D-14 disqualifier): rendered
  // via the SAME `renderProfile()` helper as every other test in this file,
  // sweeping the whole ProfileView tree via `screen` — not scoped to
  // ProfileContact or any other single section — so a stray "Restricted"
  // affordance surviving ANYWHERE on the page would be caught, not only one
  // reintroduced inside the section that used to own it.

  describe('No "Restricted" affordance survives anywhere on the page (FR-6, D-14)', () => {
    it('renders no "Restricted" affordance for the full actor', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-full' });
      useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

      renderProfile();

      expect(screen.queryByText(/restricted/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/authorization required/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/consent-gated/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Contact & Commercial Data' })
      ).not.toBeInTheDocument();
    });

    it('renders no "Restricted" affordance for the sparse actor', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-sparse' });
      useActor.mockReturnValue({ data: ACTOR_SPARSE, loading: false, error: false });

      renderProfile();

      expect(screen.queryByText(/restricted/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/authorization required/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/consent-gated/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Contact & Commercial Data' })
      ).not.toBeInTheDocument();
    });

    it('renders no input, textarea, or select elements anywhere on the page', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-full' });
      useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

      renderProfile();

      expect(document.querySelector('input')).toBeNull();
      expect(document.querySelector('textarea')).toBeNull();
      expect(document.querySelector('select')).toBeNull();
    });
  });
});
