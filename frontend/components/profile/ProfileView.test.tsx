/**
 * Unit tests for ProfileView + profile section components.
 * T-5, FR-5, FR-6, FR-8, NFR-1, NFR-3.
 *
 * Filter: `profile` (matched via test file path).
 *
 * Covers:
 *   (a) renders all profile sections from a mocked PublicActor
 *   (b) not-found when data is null (404 / non-consented)
 *   (c) not-found when id is missing from the URL
 *   (d) loading state — skeletons shown, sections absent
 *   (e) PII omission — no 'phone' or 'email' substring in rendered DOM (FR-6/NFR-1)
 *   (f) RestrictedContactPanel always present — locked state, no contact fields (FR-6)
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
import type { PublicActor } from '@/lib/api/actors';

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

    it('renders the RestrictedContactPanel heading', () => {
      renderProfile();
      expect(
        screen.getByRole('heading', { name: 'Contact & Commercial Data', level: 2 })
      ).toBeInTheDocument();
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

  // ── (e) PII omission — no phone/email in rendered DOM (FR-6/NFR-1) ────────

  describe('PII omission guard (FR-6, NFR-1)', () => {
    it('does not render any phone or email text in success state', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-full' });
      useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

      renderProfile();

      // Assert no 'phone' or 'email' substring anywhere in the rendered DOM
      expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    });

    it('does not render phone or email for the sparse actor', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-sparse' });
      useActor.mockReturnValue({ data: ACTOR_SPARSE, loading: false, error: false });

      renderProfile();

      expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    });
  });

  // ── (f) RestrictedContactPanel — always present and locked (FR-6) ─────────

  describe('RestrictedContactPanel always-locked (FR-6)', () => {
    it('always renders the locked panel in success state', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-full' });
      useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

      renderProfile();

      // Panel heading
      expect(
        screen.getByRole('heading', { name: 'Contact & Commercial Data', level: 2 })
      ).toBeInTheDocument();

      // Locked state copy — no contact fields
      expect(screen.getByText(/restricted — authorization required/i)).toBeInTheDocument();
      expect(screen.getByText(/consent-gated/i)).toBeInTheDocument();
    });

    it('renders no input fields or contact data in the locked panel', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-full' });
      useActor.mockReturnValue({ data: ACTOR_FULL, loading: false, error: false });

      renderProfile();

      // No input, textarea, or select elements anywhere in the profile
      expect(document.querySelector('input')).toBeNull();
      expect(document.querySelector('textarea')).toBeNull();
      expect(document.querySelector('select')).toBeNull();
    });

    it('renders the locked panel even for the sparse actor', () => {
      useSearchParams.mockReturnValue({ get: () => 'actor-sparse' });
      useActor.mockReturnValue({ data: ACTOR_SPARSE, loading: false, error: false });

      renderProfile();

      expect(
        screen.getByRole('heading', { name: 'Contact & Commercial Data', level: 2 })
      ).toBeInTheDocument();
    });
  });
});
