// @sdd-spec admin/registration-review-queue (T-13)
/**
 * Unit tests for ActivityTrail (FR-10 scenario 3).
 *
 * Covers:
 *   - All five event member types render with legible copy.
 *   - **`BUT it must NOT be a writable log`** — asserts the rendered tree
 *     contains NO `input`, `textarea`, `button`, `select`, or
 *     `[contenteditable]` element, over a fixture that includes every
 *     event member (so an accidental "load more"/expand control on any one
 *     of them would still be caught).
 *   - Null reviewer/dismisser identities render "identity unknown", never
 *     an empty string (carried-forward T-6/T-7 fix).
 *   - Empty trail renders a neutral empty state, not an empty writable form.
 *   - Every rendered trail entry's timestamp carries an explicit timezone
 *     designator ("UTC") — matches `ConsentRecordCard`'s treatment of the
 *     same kind of UTC instant on the same screen (advisory closed 2026-09).
 *   - jest-axe clean (NFR-5).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import { ActivityTrail } from './ActivityTrail';
import type { ActivityTrailEvent } from '@/lib/api/registrations-admin';

const ALL_EVENTS: ActivityTrailEvent[] = [
  { type: 'SUBMITTED', occurredAt: '2026-06-01T09:00:00.000Z' },
  { type: 'EMAIL_VERIFIED', occurredAt: '2026-06-01T09:05:00.000Z' },
  { type: 'CONSENT_RECORDED', occurredAt: '2026-06-01T09:06:00.000Z', policyVersion: 'v2.1' },
  {
    type: 'DUPLICATE_DISMISSED',
    occurredAt: '2026-06-02T10:00:00.000Z',
    candidateActorId: 'actor-9',
    dismissedBySub: 'sub-reviewer-1',
    dismissedByEmail: null,
  },
  {
    type: 'ADJUDICATED',
    occurredAt: '2026-06-03T11:00:00.000Z',
    status: 'APPROVED',
    reviewedBySub: null,
    reviewedByEmail: null,
  },
];

describe('ActivityTrail', () => {
  it('renders every event type with legible copy', () => {
    render(<ActivityTrail events={ALL_EVENTS} />);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Email verified')).toBeInTheDocument();
    expect(screen.getByText('Consent recorded (policy version v2.1)')).toBeInTheDocument();
    expect(screen.getByText(/Cleared as not a duplicate/)).toBeInTheDocument();
    expect(screen.getByText(/^Approved by/)).toBeInTheDocument();
  });

  it('renders NO form control anywhere in the tree — not a writable log', () => {
    const { container } = render(<ActivityTrail events={ALL_EVENTS} />);
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('textarea')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('[contenteditable]')).toHaveLength(0);
  });

  it('renders "identity unknown" for a null identity, never an empty string', () => {
    render(<ActivityTrail events={ALL_EVENTS} />);
    // DUPLICATE_DISMISSED has a real sub (dismissedBySub), so it resolves
    // to that sub rather than "identity unknown" — covered separately below.
    // ADJUDICATED has BOTH identities null, so it must fall through.
    expect(screen.getByText(/^Approved by identity unknown$/)).toBeInTheDocument();
  });

  it('falls back to sub when email is null but sub is present (never an empty string)', () => {
    render(<ActivityTrail events={ALL_EVENTS} />);
    expect(screen.getByText(/Cleared as not a duplicate by sub-reviewer-1/)).toBeInTheDocument();
  });

  it('renders an empty state for no events', () => {
    render(<ActivityTrail events={[]} />);
    expect(screen.getByText('No activity recorded.')).toBeInTheDocument();
  });

  it('renders every trail entry timestamp with an explicit timezone designator', () => {
    const { container } = render(<ActivityTrail events={ALL_EVENTS} />);
    const times = Array.from(container.querySelectorAll('time'));
    expect(times).toHaveLength(ALL_EVENTS.length);
    times.forEach((time) => {
      expect(time.textContent).toMatch(/UTC/);
    });
  });

  it('has no jest-axe violations', async () => {
    const { container } = render(<ActivityTrail events={ALL_EVENTS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
