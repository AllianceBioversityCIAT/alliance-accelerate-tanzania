/**
 * Unit tests for ShortlistTable — T-11, FR-8, NFR-1, design.md §5.7.
 * Spec: dashboard/discovery-dashboard.
 *
 * Filter: `ShortlistTable` (matched via filename).
 *
 * Covers:
 *   (a) Renders a row per actor (up to maxRows) with a profile link on the name.
 *   (b) phone/email text NEVER appears in the output — sentinel queryByText
 *       must be null AND the rendered row must carry no such fields.
 *   (c) When actors exceed maxRows, the "See all … Directory" link renders and
 *       points at /directory with the encoded filters querystring.
 *   (d) Empty actors array → explicit empty state message.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ShortlistTable from './ShortlistTable';
import type { PublicActor, ActorsQuery } from '@/lib/api/actors';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Factory: build a PublicActor with deterministic, PII-free fields. */
function makeActor(overrides: Partial<PublicActor> = {}): PublicActor {
  return {
    id: 'actor-1',
    traderName: 'Kilimo Seeds Ltd',
    region: 'Dodoma',
    district: 'Kondoa',
    traderType: 'seed_company',
    capacityTons: 200,
    crops: ['sorghum', 'common_bean'],
    gps: null,
    ...overrides,
  };
}

/** Builds an array of N distinct actors. */
function makeActors(n: number): PublicActor[] {
  return Array.from({ length: n }, (_, i) =>
    makeActor({
      id: `actor-${i + 1}`,
      traderName: `Actor ${i + 1}`,
      region: `Region${i + 1}`,
    }),
  );
}

const EMPTY_FILTERS: ActorsQuery = {};

const FULL_FILTERS: ActorsQuery = {
  crop: 'sorghum',
  role: 'seed_company',
  region: 'Dodoma',
};

// ---------------------------------------------------------------------------
// (a) Row rendering and profile link
// ---------------------------------------------------------------------------

describe('ShortlistTable — row rendering and profile links', () => {
  it('renders exactly one row per actor when actors.length <= maxRows', () => {
    const actors = makeActors(3);
    render(<ShortlistTable actors={actors} filters={EMPTY_FILTERS} maxRows={10} />);

    // Each actor name appears as a link in the table.
    actors.forEach((actor) => {
      expect(screen.getByRole('link', { name: new RegExp(actor.traderName, 'i') })).toBeInTheDocument();
    });
  });

  it('renders at most maxRows rows when actors.length > maxRows', () => {
    const actors = makeActors(15);
    render(<ShortlistTable actors={actors} filters={EMPTY_FILTERS} maxRows={10} />);

    // Exactly 10 profile links should exist in the table (one per visible row).
    // The "See all" link is excluded because its accessible name matches /see all/i.
    const profileLinks = screen.getAllByRole('link', { name: /view profile for Actor/i });
    expect(profileLinks).toHaveLength(10);

    // Actors 11–15 must not appear.
    expect(screen.queryByRole('link', { name: /Actor 11/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Actor 15/i })).not.toBeInTheDocument();
  });

  it('each actor name is a link pointing to /profile?id=<actor.id>', () => {
    const actor = makeActor({ id: 'abc-123', traderName: 'Test Seed Co' });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);

    const link = screen.getByRole('link', { name: /Test Seed Co/i });
    expect(link).toHaveAttribute('href', '/profile?id=abc-123');
  });

  it('renders the actor region in the row', () => {
    const actor = makeActor({ region: 'Mwanza', district: undefined });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);
    expect(screen.getByText('Mwanza')).toBeInTheDocument();
  });

  it('renders "Region · District" when district is present', () => {
    const actor = makeActor({ region: 'Dodoma', district: 'Kondoa' });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);
    expect(screen.getByText('Dodoma · Kondoa')).toBeInTheDocument();
  });

  it('renders the human-readable role label', () => {
    const actor = makeActor({ traderType: 'cooperative' });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);
    expect(screen.getByText('Cooperative')).toBeInTheDocument();
  });

  it('renders "—" for capacity when capacityTons is null', () => {
    const actor = makeActor({ capacityTons: null });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);

    // The em-dash in the capacity cell — locate it within the table body.
    const table = screen.getByRole('table');
    const dashCells = within(table).getAllByText('—');
    expect(dashCells.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the capacity value when capacityTons is set', () => {
    const actor = makeActor({ capacityTons: 350 });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);
    expect(screen.getByText('350')).toBeInTheDocument();
  });

  it('renders crop names from crop slugs', () => {
    const actor = makeActor({ crops: ['sorghum', 'groundnut'] });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);
    // Crop names are joined with ", " in a single cell.
    expect(screen.getByText(/Sorghum/i)).toBeInTheDocument();
    expect(screen.getByText(/Groundnut/i)).toBeInTheDocument();
  });

  it('renders "—" for crops when the crops array is empty', () => {
    const actor = makeActor({ crops: [] });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);
    const table = screen.getByRole('table');
    const dashCells = within(table).getAllByText('—');
    expect(dashCells.length).toBeGreaterThanOrEqual(1);
  });

  it('uses default maxRows=10 when the prop is omitted', () => {
    const actors = makeActors(12);
    render(<ShortlistTable actors={actors} filters={EMPTY_FILTERS} />);

    // Default maxRows is 10 → actor-11 must be absent.
    expect(screen.queryByRole('link', { name: 'Actor 11' })).not.toBeInTheDocument();
    // Actor 10 is present.
    expect(screen.getByRole('link', { name: /Actor 10/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (b) PII gate — phone and email must NEVER appear
// ---------------------------------------------------------------------------

describe('ShortlistTable — PII gate (NFR-1)', () => {
  const SENTINEL_PHONE = '+255712345678';
  const SENTINEL_EMAIL = 'actor@example.com';

  it('never renders the phone sentinel when it is absent from PublicActor', () => {
    // PublicActor has no phone field — this verifies the rendered output is clean.
    const actor = makeActor({ traderName: 'PII Test Actor' });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);
    expect(screen.queryByText(SENTINEL_PHONE)).not.toBeInTheDocument();
  });

  it('never renders the email sentinel when it is absent from PublicActor', () => {
    const actor = makeActor({ traderName: 'PII Test Actor' });
    render(<ShortlistTable actors={[actor]} filters={EMPTY_FILTERS} />);
    expect(screen.queryByText(SENTINEL_EMAIL)).not.toBeInTheDocument();
  });

  it('renders no "phone" label or text in the table', () => {
    const actors = makeActors(5);
    render(<ShortlistTable actors={actors} filters={EMPTY_FILTERS} />);
    // queryByText matches full strings; use regex to catch any substring.
    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
  });

  it('renders no "email" label or text in the table', () => {
    const actors = makeActors(5);
    render(<ShortlistTable actors={actors} filters={EMPTY_FILTERS} />);
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (c) Overflow link — "See all N in the Directory →"
// ---------------------------------------------------------------------------

describe('ShortlistTable — overflow "See all" link', () => {
  it('renders the "See all N in the Directory" link when actors exceed maxRows', () => {
    const actors = makeActors(15);
    render(<ShortlistTable actors={actors} filters={EMPTY_FILTERS} maxRows={10} />);

    const link = screen.getByRole('link', { name: /see all 15/i });
    expect(link).toBeInTheDocument();
    // Link must point at /directory (with or without querystring)
    expect(link).toHaveAttribute('href', expect.stringMatching(/^\/directory/));
  });

  it('encodes active filters into the "See all" href', () => {
    const actors = makeActors(12);
    render(<ShortlistTable actors={actors} filters={FULL_FILTERS} maxRows={5} />);

    const link = screen.getByRole('link', { name: /see all 12/i });
    const href = link.getAttribute('href') ?? '';

    // The href must include /directory and the encoded filter params.
    expect(href).toMatch(/^\/directory\?/);
    expect(href).toContain('crop=sorghum');
    expect(href).toContain('role=seed_company');
    expect(href).toContain('region=Dodoma');
  });

  it('points at /directory without querystring when filters are empty', () => {
    const actors = makeActors(12);
    render(<ShortlistTable actors={actors} filters={EMPTY_FILTERS} maxRows={5} />);

    const link = screen.getByRole('link', { name: /see all 12/i });
    expect(link).toHaveAttribute('href', '/directory');
  });

  it('does NOT render the "See all" link when actors.length <= maxRows', () => {
    const actors = makeActors(5);
    render(<ShortlistTable actors={actors} filters={FULL_FILTERS} maxRows={10} />);

    expect(screen.queryByRole('link', { name: /see all/i })).not.toBeInTheDocument();
  });

  it('does NOT render the "See all" link when actors.length === maxRows exactly', () => {
    const actors = makeActors(10);
    render(<ShortlistTable actors={actors} filters={FULL_FILTERS} maxRows={10} />);

    expect(screen.queryByRole('link', { name: /see all/i })).not.toBeInTheDocument();
  });

  it('the "See all" total reflects the full unsliced actors.length', () => {
    const actors = makeActors(42);
    render(<ShortlistTable actors={actors} filters={EMPTY_FILTERS} maxRows={10} />);

    // Text must include "42", not "10"
    const link = screen.getByRole('link', { name: /see all 42/i });
    expect(link).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (d) Empty state
// ---------------------------------------------------------------------------

describe('ShortlistTable — empty state', () => {
  it('renders the empty state message when actors is an empty array', () => {
    render(<ShortlistTable actors={[]} filters={EMPTY_FILTERS} />);
    expect(
      screen.getByText(/no actors match these filters/i),
    ).toBeInTheDocument();
  });

  it('renders no table element when actors is empty', () => {
    render(<ShortlistTable actors={[]} filters={EMPTY_FILTERS} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders no profile links when actors is empty', () => {
    render(<ShortlistTable actors={[]} filters={EMPTY_FILTERS} />);
    // The only possible links would be profile links — none should exist.
    const links = screen.queryAllByRole('link', { name: /view profile/i });
    expect(links).toHaveLength(0);
  });

  it('does not crash with an empty actors array', () => {
    expect(() =>
      render(<ShortlistTable actors={[]} filters={FULL_FILTERS} />),
    ).not.toThrow();
  });
});
