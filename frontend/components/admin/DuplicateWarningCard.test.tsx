// @sdd-spec admin/registration-review-queue (T-13)
/**
 * Unit tests for DuplicateWarningCard (FR-11 scenario 1, read-only here).
 *
 * Covers:
 *   - Empty candidates: neutral "no possible duplicates" state.
 *   - Non-empty: names the number of candidates and, for each, the
 *     matching attribute and enough identity to judge it (traderName +
 *     traderId) — no `phone`/`email` VALUES anywhere in the render (the
 *     type carries none, but this is a belt-and-braces render assertion).
 *   - **"5+" cap** (carried from T-5's review, A-35): at exactly 5
 *     candidates (the backend's `MAX_CANDIDATES_PER_REGISTRATION`), the
 *     count renders "5+", not a bare "5".
 *   - Below the cap (e.g. 3), the count renders the exact number.
 *   - No dismiss control anywhere — read-only in this task; T-14 wires it.
 *   - jest-axe clean (NFR-5).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import { DuplicateWarningCard } from './DuplicateWarningCard';
import type { DuplicateCandidate } from '@/lib/api/registrations-admin';

function buildCandidate(overrides: Partial<DuplicateCandidate>): DuplicateCandidate {
  return {
    actorId: 'actor-1',
    traderId: 'TZ-A-0001',
    traderName: 'Meru Agro Cooperative Society',
    matchedOn: ['phone'],
    ...overrides,
  };
}

describe('DuplicateWarningCard', () => {
  it('renders a neutral state when there are no candidates', () => {
    render(<DuplicateWarningCard candidates={[]} />);
    expect(screen.getByText('No possible duplicates found.')).toBeInTheDocument();
  });

  it('names the number of candidates and, for each, the matching attribute and identity', () => {
    const candidates = [
      buildCandidate({ actorId: 'actor-1', traderName: 'Meru Agro Cooperative Society', matchedOn: ['phone'] }),
      buildCandidate({ actorId: 'actor-2', traderId: 'TZ-B-0002', traderName: 'Arusha Seeds Ltd', matchedOn: ['email', 'traderName'] }),
    ];
    render(<DuplicateWarningCard candidates={candidates} />);

    expect(screen.getByText('2 possible duplicates found')).toBeInTheDocument();
    expect(screen.getByText('Meru Agro Cooperative Society')).toBeInTheDocument();
    expect(screen.getByText('Arusha Seeds Ltd')).toBeInTheDocument();
    expect(screen.getByText('TZ-A-0001')).toBeInTheDocument();
    expect(screen.getByText('TZ-B-0002')).toBeInTheDocument();
    expect(screen.getByText(/phone number/)).toBeInTheDocument();
    expect(screen.getByText(/email address, organisation name/)).toBeInTheDocument();
  });

  it('renders the singular form for exactly one candidate', () => {
    render(<DuplicateWarningCard candidates={[buildCandidate({})]} />);
    expect(screen.getByText('1 possible duplicate found')).toBeInTheDocument();
  });

  it('renders the exact count below the cap', () => {
    const candidates = [
      buildCandidate({ actorId: 'a1' }),
      buildCandidate({ actorId: 'a2' }),
      buildCandidate({ actorId: 'a3' }),
    ];
    render(<DuplicateWarningCard candidates={candidates} />);
    expect(screen.getByText('3 possible duplicates found')).toBeInTheDocument();
  });

  it('renders "5+" at the cap rather than a bare "5"', () => {
    const candidates = Array.from({ length: 5 }, (_, i) =>
      buildCandidate({ actorId: `actor-${i}`, traderId: `TZ-X-000${i}` }),
    );
    render(<DuplicateWarningCard candidates={candidates} />);
    expect(screen.getByText('5+ possible duplicates found')).toBeInTheDocument();
    expect(screen.queryByText('5 possible duplicates found')).not.toBeInTheDocument();
  });

  it('renders no dismiss control — read-only in this task', () => {
    const { container } = render(<DuplicateWarningCard candidates={[buildCandidate({})]} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('has no jest-axe violations', async () => {
    const { container } = render(
      <DuplicateWarningCard candidates={[buildCandidate({}), buildCandidate({ actorId: 'actor-2' })]} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
