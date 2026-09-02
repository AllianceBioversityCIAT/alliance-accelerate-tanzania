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
 *   - No dismiss control renders when `onDismiss` is omitted (read-only —
 *     the original T-13 shape, still supported).
 *   - **T-14 — per-candidate dismiss wiring (FR-11 scenario 1/2)**: with
 *     `onDismiss` supplied, one "Not a duplicate" button per candidate,
 *     each calling `onDismiss` with THAT candidate's `actorId` only —
 *     dismissing one must never be able to affect another (never row-
 *     level/index-based).
 *   - `dismissingId` disables only the matching candidate's button.
 *   - jest-axe clean (NFR-5), including with dismiss buttons rendered.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders no dismiss control when onDismiss is omitted (read-only)', () => {
    const { container } = render(<DuplicateWarningCard candidates={[buildCandidate({})]} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('T-14 — renders one dismiss button per candidate when onDismiss is supplied', () => {
    const candidates = [
      buildCandidate({ actorId: 'actor-1', traderName: 'Meru Agro Cooperative Society' }),
      buildCandidate({ actorId: 'actor-2', traderName: 'Arusha Seeds Ltd' }),
    ];
    render(<DuplicateWarningCard candidates={candidates} onDismiss={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Mark Meru Agro Cooperative Society as not a duplicate' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark Arusha Seeds Ltd as not a duplicate' })
    ).toBeInTheDocument();
  });

  it("T-14 — dismissing one candidate calls onDismiss with THAT candidate's actorId only", () => {
    const onDismiss = jest.fn();
    const candidates = [
      buildCandidate({ actorId: 'actor-1', traderName: 'Meru Agro Cooperative Society' }),
      buildCandidate({ actorId: 'actor-2', traderName: 'Arusha Seeds Ltd' }),
    ];
    render(<DuplicateWarningCard candidates={candidates} onDismiss={onDismiss} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Mark Arusha Seeds Ltd as not a duplicate' })
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('actor-2');
  });

  it("T-14 — dismissingId disables only the matching candidate's button, never the others", () => {
    const candidates = [
      buildCandidate({ actorId: 'actor-1', traderName: 'Meru Agro Cooperative Society' }),
      buildCandidate({ actorId: 'actor-2', traderName: 'Arusha Seeds Ltd' }),
    ];
    render(
      <DuplicateWarningCard candidates={candidates} onDismiss={jest.fn()} dismissingId="actor-1" />
    );

    // The aria-label (not the visible "Marking…" text) is this button's
    // accessible name, since aria-label takes precedence over text content.
    expect(
      screen.getByRole('button', { name: 'Mark Meru Agro Cooperative Society as not a duplicate' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Mark Arusha Seeds Ltd as not a duplicate' })
    ).toBeEnabled();
  });

  it('has no jest-axe violations', async () => {
    const { container } = render(
      <DuplicateWarningCard candidates={[buildCandidate({}), buildCandidate({ actorId: 'actor-2' })]} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no jest-axe violations with dismiss buttons rendered', async () => {
    const { container } = render(
      <DuplicateWarningCard
        candidates={[buildCandidate({}), buildCandidate({ actorId: 'actor-2' })]}
        onDismiss={jest.fn()}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
