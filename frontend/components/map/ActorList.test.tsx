/**
 * Unit tests for ActorList + ActorListItem — T-4, FR-5, NFR-3, NFR-5.
 *
 * Filter: `ActorList` (matched via filename — also covers ActorListItem).
 *
 * Covers:
 *   (a) renders one item per actor (including actors with gps == null)
 *   (b) gps-null actor shows the "List only — no map location" hint (FR-2)
 *   (c) clicking an item calls onSelectActor with that actor's id (FR-5)
 *   (d) selected item has aria-current="true" (NFR-3)
 *   (e) no phone/email text appears (PII guard, NFR-5)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActorList from './ActorList';
import type { PublicActor } from '@/lib/api/actors';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_WITH_GPS: PublicActor = {
  id: 'actor-gps',
  traderName: 'Dodoma Seeds Ltd',
  region: 'Dodoma',
  district: 'Dodoma Urban',
  traderType: 'seed_company',
  capacityTons: 500,
  crops: ['sorghum'],
  gps: { lat: -6.17, long: 35.74 },
};

const ACTOR_NO_GPS: PublicActor = {
  id: 'actor-no-gps',
  traderName: 'Mbeya Cooperative',
  region: 'Mbeya',
  district: null,
  traderType: 'cooperative',
  capacityTons: null,
  crops: ['common_bean'],
  gps: null,
};

const ACTORS = [ACTOR_WITH_GPS, ACTOR_NO_GPS];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ActorList', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) Renders one item per actor ────────────────────────────────────────

  it('renders one button per actor in the list', () => {
    render(
      <ActorList
        actors={ACTORS}
        selectedActorId={null}
        onSelectActor={jest.fn()}
      />,
    );

    // Each item is a <button>; there should be exactly 2.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(ACTORS.length);
  });

  it('renders the traderName for each actor', () => {
    render(
      <ActorList
        actors={ACTORS}
        selectedActorId={null}
        onSelectActor={jest.fn()}
      />,
    );

    expect(screen.getByText('Dodoma Seeds Ltd')).toBeInTheDocument();
    expect(screen.getByText('Mbeya Cooperative')).toBeInTheDocument();
  });

  // ── (b) GPS-null actor shows list-only hint ───────────────────────────────

  it('shows the "List only — no map location" hint for actors with gps == null', () => {
    render(
      <ActorList
        actors={ACTORS}
        selectedActorId={null}
        onSelectActor={jest.fn()}
      />,
    );

    // The hint text should appear once (for ACTOR_NO_GPS).
    expect(screen.getByText(/list only.*no map location/i)).toBeInTheDocument();
  });

  it('does NOT show the list-only hint for actors that have GPS', () => {
    render(
      <ActorList
        actors={[ACTOR_WITH_GPS]}
        selectedActorId={null}
        onSelectActor={jest.fn()}
      />,
    );

    expect(screen.queryByText(/list only.*no map location/i)).not.toBeInTheDocument();
  });

  // ── (c) Clicking an item calls onSelectActor with the actor id ────────────

  it('calls onSelectActor with the correct actor id when an item is clicked', () => {
    const onSelectActor = jest.fn();

    render(
      <ActorList
        actors={ACTORS}
        selectedActorId={null}
        onSelectActor={onSelectActor}
      />,
    );

    const firstButton = screen.getByText('Dodoma Seeds Ltd').closest('button');
    expect(firstButton).not.toBeNull();
    fireEvent.click(firstButton!);

    expect(onSelectActor).toHaveBeenCalledTimes(1);
    expect(onSelectActor).toHaveBeenCalledWith('actor-gps');
  });

  it('calls onSelectActor with the id for the gps-null actor when clicked', () => {
    const onSelectActor = jest.fn();

    render(
      <ActorList
        actors={ACTORS}
        selectedActorId={null}
        onSelectActor={onSelectActor}
      />,
    );

    const button = screen.getByText('Mbeya Cooperative').closest('button');
    fireEvent.click(button!);

    expect(onSelectActor).toHaveBeenCalledWith('actor-no-gps');
  });

  // ── (d) Selected item has aria-current="true" ─────────────────────────────

  it('sets aria-current="true" on the selected actor item', () => {
    render(
      <ActorList
        actors={ACTORS}
        selectedActorId="actor-gps"
        onSelectActor={jest.fn()}
      />,
    );

    const selectedButton = screen.getByText('Dodoma Seeds Ltd').closest('button');
    expect(selectedButton).toHaveAttribute('aria-current', 'true');

    // The other item must NOT have aria-current.
    const otherButton = screen.getByText('Mbeya Cooperative').closest('button');
    expect(otherButton).not.toHaveAttribute('aria-current', 'true');
  });

  it('sets no aria-current when no actor is selected', () => {
    render(
      <ActorList
        actors={ACTORS}
        selectedActorId={null}
        onSelectActor={jest.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).not.toHaveAttribute('aria-current', 'true');
    }
  });

  // ── (e) PII guard (NFR-5) ─────────────────────────────────────────────────

  it('does not render any phone or email text (PII guard)', () => {
    render(
      <ActorList
        actors={ACTORS}
        selectedActorId={null}
        onSelectActor={jest.fn()}
      />,
    );

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  // ── Accessible list semantics (NFR-3) ─────────────────────────────────────

  it('renders an accessible list with a descriptive label', () => {
    render(
      <ActorList
        actors={ACTORS}
        selectedActorId={null}
        onSelectActor={jest.fn()}
      />,
    );

    // The <ul role="list"> with aria-label should be present.
    const list = screen.getByRole('list', { name: /accessible alternative to the map/i });
    expect(list).toBeInTheDocument();
  });
});
