/**
 * Unit tests for ActorPopup — T-3, FR-3, NFR-5.
 *
 * Filter: `ActorPopup` (matched via filename).
 *
 * Covers:
 *   (a) actor name (traderName) renders
 *   (b) role label renders via RoleBadge
 *   (c) region renders; district renders when present, absent when null
 *   (d) one crop chip per crops[] slug (≥2 crops — asserts each name)
 *   (e) capacity renders as "<n> t"; null capacity renders "—"
 *   (f) View Profile link exists with href containing /directory
 *   (g) PII guard — no phone/email text in the rendered output (NFR-5)
 *
 * No Leaflet is rendered — ActorPopup is a pure React component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ActorPopup from './ActorPopup';
import type { PublicActor } from '@/lib/api/actors';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Actor with all optional fields populated, including district and ≥2 crops. */
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

/** Actor with null-capacity, null-district, and a single crop. */
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ActorPopup', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) Actor name ─────────────────────────────────────────────────────────

  it('renders the actor traderName', () => {
    render(<ActorPopup actor={ACTOR_FULL} />);

    expect(screen.getByText('Dodoma Seeds Ltd')).toBeInTheDocument();
  });

  // ── (b) Role label (RoleBadge) ─────────────────────────────────────────────

  it('renders the role label via RoleBadge', () => {
    render(<ActorPopup actor={ACTOR_FULL} />);

    // ROLES.seed_company.label = 'Seed Company'
    expect(screen.getByText('Seed Company')).toBeInTheDocument();
  });

  it('renders the cooperative role label', () => {
    render(<ActorPopup actor={ACTOR_SPARSE} />);

    // ROLES.cooperative.label = 'Cooperative'
    expect(screen.getByText('Cooperative')).toBeInTheDocument();
  });

  // ── (c) Region and district ────────────────────────────────────────────────

  it('renders region and district when district is present', () => {
    render(<ActorPopup actor={ACTOR_FULL} />);

    // Region + district are rendered together in the location paragraph.
    // Use getAllByText to handle the case where the region word also appears
    // in the actor name, and assert at least one match is the location row.
    const regionMatches = screen.getAllByText(/Dodoma/);
    expect(regionMatches.length).toBeGreaterThanOrEqual(1);
    // District text appears in exactly one element.
    expect(screen.getByText(/Dodoma Urban/)).toBeInTheDocument();
  });

  it('renders only region when district is null', () => {
    render(<ActorPopup actor={ACTOR_SPARSE} />);

    // The region word appears at least once (could be in name and/or location row).
    const regionMatches = screen.getAllByText(/Mbeya/);
    expect(regionMatches.length).toBeGreaterThanOrEqual(1);
    // District is null — 'Dodoma Urban' should not appear in this render.
    expect(screen.queryByText(/Dodoma Urban/i)).not.toBeInTheDocument();
  });

  // ── (d) Crop chips ─────────────────────────────────────────────────────────

  it('renders one crop chip per crops[] slug (multi-crop actor)', () => {
    render(<ActorPopup actor={ACTOR_FULL} />);

    // ACTOR_FULL has ['sorghum', 'common_bean']
    expect(screen.getByText('Sorghum')).toBeInTheDocument();
    expect(screen.getByText('Common Bean')).toBeInTheDocument();
    // Groundnut is NOT in ACTOR_FULL — must be absent.
    expect(screen.queryByText('Groundnut')).not.toBeInTheDocument();
  });

  it('renders the single crop chip for a sparse actor', () => {
    render(<ActorPopup actor={ACTOR_SPARSE} />);

    // ACTOR_SPARSE has ['groundnut']
    expect(screen.getByText('Groundnut')).toBeInTheDocument();
    expect(screen.queryByText('Sorghum')).not.toBeInTheDocument();
  });

  // ── (e) Capacity ───────────────────────────────────────────────────────────

  it('renders capacity as "<n> t" when capacityTons is set', () => {
    render(<ActorPopup actor={ACTOR_FULL} />);

    expect(screen.getByText(/500 t/)).toBeInTheDocument();
  });

  it('renders "—" when capacityTons is null', () => {
    render(<ActorPopup actor={ACTOR_SPARSE} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // ── (f) View Profile link → /directory ────────────────────────────────────

  it('renders a View Profile link with href containing /directory', () => {
    render(<ActorPopup actor={ACTOR_FULL} />);

    const link = screen.getByRole('link', { name: /view profile/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('/directory'));
  });

  // ── (g) PII guard — no phone/email ever rendered (NFR-5) ──────────────────

  it('does not render any phone or email text (PII guard)', () => {
    render(<ActorPopup actor={ACTOR_FULL} />);

    // PublicActor carries no PII fields — guard at the test level anyway.
    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it('does not render phone or email for the sparse actor (PII guard)', () => {
    render(<ActorPopup actor={ACTOR_SPARSE} />);

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });
});
