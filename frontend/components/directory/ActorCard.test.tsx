/**
 * Unit tests for ActorCard — T-3, FR-1, NFR-1, NFR-3.
 *
 * Filter: `ActorCard` (matched via filename).
 *
 * Covers:
 *   (a) actor name (traderName) renders
 *   (b) role label renders via RoleBadge
 *   (c) region renders; district renders when present, absent when null
 *   (d) one crop chip per crops[] slug (≥2 crops — asserts each name)
 *   (e) capacity renders as "<n> t"; null capacity renders "—"
 *   (f) View Profile link href = /profile?id=<actor.id>
 *   (g) PII guard — no phone/email text in the rendered output (NFR-1)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ActorCard from './ActorCard';
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

describe('ActorCard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) Actor name ─────────────────────────────────────────────────────────

  it('renders the actor traderName', () => {
    render(<ActorCard actor={ACTOR_FULL} />);

    expect(screen.getByText('Dodoma Seeds Ltd')).toBeInTheDocument();
  });

  it('renders the sparse actor name', () => {
    render(<ActorCard actor={ACTOR_SPARSE} />);

    expect(screen.getByText('Mbeya Cooperative')).toBeInTheDocument();
  });

  // ── (b) Role label (RoleBadge) ─────────────────────────────────────────────

  it('renders the role label via RoleBadge', () => {
    render(<ActorCard actor={ACTOR_FULL} />);

    // ROLES.seed_company.label = 'Seed Company'
    expect(screen.getByText('Seed Company')).toBeInTheDocument();
  });

  it('renders the cooperative role label', () => {
    render(<ActorCard actor={ACTOR_SPARSE} />);

    // ROLES.cooperative.label = 'Cooperative'
    expect(screen.getByText('Cooperative')).toBeInTheDocument();
  });

  // ── (c) Region and district ────────────────────────────────────────────────

  it('renders region · district when district is present', () => {
    render(<ActorCard actor={ACTOR_FULL} />);

    // Location paragraph contains "Dodoma · Dodoma Urban"
    expect(screen.getByText('Dodoma · Dodoma Urban')).toBeInTheDocument();
  });

  it('renders only region when district is null (no null/undefined shown)', () => {
    render(<ActorCard actor={ACTOR_SPARSE} />);

    expect(screen.getByText('Mbeya')).toBeInTheDocument();
    // Must not display the word "null" or "undefined"
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  // ── (d) Crop chips ─────────────────────────────────────────────────────────

  it('renders one crop chip per crops[] slug (multi-crop actor)', () => {
    render(<ActorCard actor={ACTOR_FULL} />);

    // ACTOR_FULL has ['sorghum', 'common_bean']
    expect(screen.getByText('Sorghum')).toBeInTheDocument();
    expect(screen.getByText('Common Bean')).toBeInTheDocument();
    // Groundnut is NOT in ACTOR_FULL
    expect(screen.queryByText('Groundnut')).not.toBeInTheDocument();
  });

  it('renders the single crop chip for a sparse actor', () => {
    render(<ActorCard actor={ACTOR_SPARSE} />);

    // ACTOR_SPARSE has ['groundnut']
    expect(screen.getByText('Groundnut')).toBeInTheDocument();
    expect(screen.queryByText('Sorghum')).not.toBeInTheDocument();
  });

  // ── (e) Capacity ───────────────────────────────────────────────────────────

  it('renders capacity as "<n> t" when capacityTons is set', () => {
    render(<ActorCard actor={ACTOR_FULL} />);

    expect(screen.getByText(/500 t/)).toBeInTheDocument();
  });

  it('renders "—" when capacityTons is null', () => {
    render(<ActorCard actor={ACTOR_SPARSE} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // ── (f) View Profile link → /profile?id=<actor.id> ────────────────────────

  it('renders a View Profile link with href /profile?id=<actor.id>', () => {
    render(<ActorCard actor={ACTOR_FULL} />);

    const link = screen.getByRole('link', { name: /view profile for Dodoma Seeds Ltd/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/profile?id=actor-full');
  });

  it('encodes the actor id correctly in the href', () => {
    render(<ActorCard actor={ACTOR_SPARSE} />);

    const link = screen.getByRole('link', { name: /view profile for Mbeya Cooperative/i });
    expect(link).toHaveAttribute('href', '/profile?id=actor-sparse');
  });

  // ── (g) PII guard — no phone/email ever rendered (NFR-1) ──────────────────

  it('does not render any phone or email text (PII guard)', () => {
    render(<ActorCard actor={ACTOR_FULL} />);

    // PublicActor carries no PII fields — guard at the test level.
    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it('does not render phone or email for the sparse actor (PII guard)', () => {
    render(<ActorCard actor={ACTOR_SPARSE} />);

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });
});
