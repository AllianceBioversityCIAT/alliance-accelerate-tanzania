// @sdd-spec actors/registration-source-and-consent (validation-report.md R-1)
/**
 * Regression test for R-1 — cross-actor data corruption on the edit page.
 *
 * `edit/page.tsx` reads the actor id from `useSearchParams()`. App Router
 * does NOT unmount this route on a searchParams-only navigation
 * (`?id=actor-a` -> `?id=actor-b`, e.g. via browser back/forward) — the
 * component instance, and everything inside it, stays mounted. Before the
 * fix, `<ActorForm>` was rendered with no `key`, and `ActorForm` freezes its
 * field values in a one-shot `useState(() => toFormValues(initialValues))`
 * that never re-syncs to a changed `initialValues` prop. So after navigating
 * from actor A to actor B, the form kept showing A's field values while
 * `doSubmit` targeted `initialValues.id` (B) — a save would silently write
 * A's data onto B's row.
 *
 * This test simulates exactly that navigation (via RTL's `rerender`, which —
 * like the real App Router in this scenario — re-renders the same component
 * tree without unmounting it) and asserts both the rendered field value and
 * the actual submit target follow the newly-resolved actor, not the stale
 * one. It fails without `key={actor.id}` on `<ActorForm>` in `edit/page.tsx`.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation — a mutable search-params store, like the real
// App Router: navigating only changes what useSearchParams() returns, it
// does not remount the route.
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();
let mockSearchParams = new URLSearchParams({ id: 'actor-a' });

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => mockSearchParams,
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth/auth-client (getSession)
//
// jest.mock() factories are hoisted above module-scope const declarations
// (babel-plugin-jest-hoist), so the token literal is inlined here rather
// than referencing an outer `const TOKEN` (which would hit a TDZ
// ReferenceError at hoist time). `TOKEN` below is the same literal, used
// only in assertions.
// ---------------------------------------------------------------------------

jest.mock('@/lib/auth/auth-client', () => ({
  getSession: jest.fn().mockResolvedValue({
    role: 'Admin',
    user: { name: 'Admin' },
    accessToken: 'test-access-token',
  }),
}));

const TOKEN = 'test-access-token';

// ---------------------------------------------------------------------------
// Mock @/lib/api/client (AuthFailureError/ApiError — real behaviour, no
// Amplify import needed by the test).
// ---------------------------------------------------------------------------

jest.mock('@/lib/api/client', () => {
  class ApiError extends Error {
    readonly status: number;
    readonly details?: unknown;
    constructor(status: number, message: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }
  class AuthFailureError extends Error {
    readonly status = 401;
    constructor(msg = 'Session expired') {
      super(msg);
      this.name = 'AuthFailureError';
    }
  }
  return { ApiError, AuthFailureError };
});

// ---------------------------------------------------------------------------
// Mock @/lib/api/actors-admin (adminGetActor, updateActor, getActorHistory)
// ---------------------------------------------------------------------------

const mockAdminGetActor = jest.fn();
const mockUpdateActor = jest.fn();
const mockCreateActor = jest.fn();
const mockGetActorHistory = jest.fn().mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

jest.mock('@/lib/api/actors-admin', () => {
  const actual = jest.requireActual('@/lib/api/actors-admin');
  return {
    ...actual,
    adminGetActor: (...args: unknown[]) => mockAdminGetActor(...args),
    updateActor: (...args: unknown[]) => mockUpdateActor(...args),
    createActor: (...args: unknown[]) => mockCreateActor(...args),
    getActorHistory: (...args: unknown[]) => mockGetActorHistory(...args),
  };
});

import EditActorPage from './page';
import type { AdminActor } from '@/lib/api/actors-admin';

// ---------------------------------------------------------------------------
// Fixtures — two distinct actors, both UNKNOWN consent (no acknowledge
// dialog involved) so the test isolates the field-freeze bug.
// ---------------------------------------------------------------------------

function buildActor(overrides: Partial<AdminActor>): AdminActor {
  return {
    id: 'actor-a',
    traderId: 'TZ-A-0001',
    traderName: 'Trader A',
    region: 'Arusha',
    district: null,
    traderType: 'seed_company',
    sex: null,
    position: null,
    marketLocation: null,
    capacityTons: null,
    technicalSupport: null,
    phone: null,
    email: null,
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitude: null,
    gpsAccuracy: null,
    consentStatus: 'UNKNOWN',
    registrationSource: 'TEAM_MANAGED',
    consentMethod: 'NOT_RECORDED',
    consentObtainedAt: null,
    consentReference: null,
    crops: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ACTOR_A = buildActor({ id: 'actor-a', traderId: 'TZ-A-0001', traderName: 'Trader A' });
const ACTOR_B = buildActor({
  id: 'actor-b',
  traderId: 'TZ-B-0002',
  traderName: 'Trader B',
  region: 'Dodoma',
});

describe('EditActorPage — cross-actor identity on a searchParams-only navigation (R-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActorHistory.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    mockSearchParams = new URLSearchParams({ id: 'actor-a' });
    mockAdminGetActor.mockImplementation((id: string) =>
      Promise.resolve(id === 'actor-a' ? ACTOR_A : ACTOR_B),
    );
    mockUpdateActor.mockResolvedValue(ACTOR_B);
  });

  it('remounts the form and targets the newly-resolved actor after id changes without unmounting the route', async () => {
    const { rerender } = render(<EditActorPage />);

    // Actor A loads first.
    await waitFor(() => expect(mockAdminGetActor).toHaveBeenCalledWith('actor-a', TOKEN));
    expect(await screen.findByDisplayValue('Trader A')).toBeInTheDocument();

    // Navigate to actor B via a searchParams-only change — the same
    // component tree re-renders (App Router does not unmount here).
    mockSearchParams = new URLSearchParams({ id: 'actor-b' });
    rerender(<EditActorPage />);

    await waitFor(() => expect(mockAdminGetActor).toHaveBeenCalledWith('actor-b', TOKEN));

    // The rendered form must now reflect actor B's data, not actor A's
    // frozen values. This is the assertion that fails without
    // `key={actor.id}` on <ActorForm> — the field keeps reading "Trader A".
    await waitFor(() => {
      expect(screen.getByLabelText(/Trader name/i)).toHaveValue('Trader B');
    });
    expect(screen.queryByDisplayValue('Trader A')).not.toBeInTheDocument();

    // Saving must write B's data to B's id, not A's stale values onto B.
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockUpdateActor).toHaveBeenCalled());
    const [submittedId, submittedDto] = mockUpdateActor.mock.calls[0];
    expect(submittedId).toBe('actor-b');
    expect(submittedDto).toEqual(expect.objectContaining({ traderName: 'Trader B' }));
  });

  /**
   * R-1, delta-round item 3 — the effect's `error`/`loading` state was never
   * reset on an id change either. A failed fetch for one id (`error` set)
   * followed by a searchParams-only navigation to a DIFFERENT, VALID id used
   * to leave the page stuck on the stale "Could not load actor" message even
   * after the new fetch succeeded, because `if (error || !actor)` stayed
   * true regardless of the newly-populated `actor` state.
   */
  it('clears a stale error after navigating from a bad id to a valid one that resolves', async () => {
    mockAdminGetActor.mockImplementation((id: string) => {
      if (id === 'actor-bad') return Promise.reject(new Error('Network error'));
      return Promise.resolve(id === 'actor-a' ? ACTOR_A : ACTOR_B);
    });

    mockSearchParams = new URLSearchParams({ id: 'actor-bad' });
    const { rerender } = render(<EditActorPage />);

    await waitFor(() => expect(mockAdminGetActor).toHaveBeenCalledWith('actor-bad', TOKEN));
    expect(await screen.findByText(/could not load the requested actor/i)).toBeInTheDocument();

    // Navigate (e.g. back/forward) to a different, valid id — same route
    // tree, no unmount (rerender, not a fresh render, to match App Router).
    mockSearchParams = new URLSearchParams({ id: 'actor-a' });
    rerender(<EditActorPage />);

    await waitFor(() => expect(mockAdminGetActor).toHaveBeenCalledWith('actor-a', TOKEN));

    // The stale error must not keep the form hidden once the new fetch
    // succeeds. This is the assertion that fails without the
    // `setError(null); setLoading(true)` reset at the top of `init()`.
    await waitFor(() => {
      expect(screen.getByLabelText(/Trader name/i)).toHaveValue('Trader A');
    });
    expect(screen.queryByText(/could not load the requested actor/i)).not.toBeInTheDocument();
  });
});
