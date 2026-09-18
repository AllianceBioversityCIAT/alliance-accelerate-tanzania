// @sdd-spec admin/registration-review-queue (T-13)
/**
 * Tests for /admin/registrations/review?id= (FR-10, NFR-7, A-72).
 *
 * Covers:
 *   - Successful load renders the detail panel with the reference code.
 *   - Missing `?id=` renders the "missing id" not-found state without
 *     calling `adminGetRegistration`.
 *   - **A-72 — a crafted id containing `../` is rejected BEFORE the
 *     network call.** `adminGetRegistration` must never be invoked for it,
 *     proving the guard runs ahead of the client, not merely alongside it.
 *   - A legitimate cuid-shaped id IS passed through unchanged.
 *   - **R7 — an uppercase-admitting id (`SAFE_ID_PATTERN` without the `i`
 *     flag) is rejected before any network call**, matching the corrected
 *     doc comment's "lowercase alphanumeric only" contract.
 *   - A 404 from the API renders "Registration not found."
 *   - **R5 — a refresh that fails AFTER a successful mutation must not
 *     erase the success announcement or replace the panel with a "not
 *     found" state** (`RegistrationDetailPanel` is faked for this whole
 *     file — see that mock's own doc comment for why).
 *   - An unauthenticated session redirects to /login.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();
let mockSearchParams = new URLSearchParams({ id: 'clx1234567890abcdefghijk' });

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => mockSearchParams,
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth/auth-client (getSession)
// ---------------------------------------------------------------------------

const mockGetSession = jest.fn();

jest.mock('@/lib/auth/auth-client', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

const TOKEN = 'test-access-token';

// ---------------------------------------------------------------------------
// Mock @/lib/api/client (ApiError/AuthFailureError — real behaviour)
// ---------------------------------------------------------------------------

// `ApiError` / `AuthFailureError` below live in the sibling
// `../test-support` module, shared with `../page.test.tsx` — see that
// module's doc comment for why a plain `require(...)` call (not an
// outer-scope reference) is what the jest hoist plugin allows here.
jest.mock('@/lib/api/client', () => {
  const { ApiError, AuthFailureError } = require('../test-support');
  return { ApiError, AuthFailureError };
});

// ---------------------------------------------------------------------------
// Mock @/lib/api/registrations-admin (adminGetRegistration)
// ---------------------------------------------------------------------------

const mockAdminGetRegistration = jest.fn();

jest.mock('@/lib/api/registrations-admin', () => {
  const { withRealExportsExcept } = require('../test-support');
  return withRealExportsExcept('@/lib/api/registrations-admin', {
    adminGetRegistration: (...args: unknown[]) => mockAdminGetRegistration(...args),
  });
});

// ---------------------------------------------------------------------------
// Mock @/components/admin/RegistrationDetailPanel.
//
// This page's own tests exist to prove ITS render-gating/data-delivery
// logic (`ReviewView`), not `RegistrationDetailPanel`'s internal approve/
// reject/dismiss mutation wiring — that is `RegistrationDetailPanel.
// test.tsx`'s territory. **Deliberately NOT scoped via `jest.resetModules()`
// + a fresh `require`** — this repo already found empirically
// (`components/analytics/GoogleAnalytics.test.tsx`'s file-level doc
// comment) that `jest.resetModules()` can break React's module identity
// mid-suite, so this mock is a plain top-level `jest.mock`, applying to
// every test in this file, matching the OTHER child-module mocks above.
//
// The fake keeps the ONE shape the pre-existing tests below actually read —
// `<h1>{detail.reference}</h1>` — and adds a `role="status"` success
// announcement plus a `onRefresh`-triggering button (R5's test uses these;
// no other test in this file does).
// ---------------------------------------------------------------------------

jest.mock('@/components/admin/RegistrationDetailPanel', () => ({
  RegistrationDetailPanel: ({
    detail,
    onRefresh,
  }: {
    detail: { reference: string };
    onRefresh: () => Promise<void>;
  }) => (
    <div>
      <h1>{detail.reference}</h1>
      <div role="status">{detail.reference} approved and published to the public directory.</div>
      <button onClick={() => onRefresh()}>Trigger refresh</button>
    </div>
  ),
}));

import RegistrationReviewPage from './page';
import { ApiError } from '@/lib/api/client';
import type { AdminRegistrationDetail } from '@/lib/api/registrations-admin';

function buildDetail(overrides: Partial<AdminRegistrationDetail> = {}): AdminRegistrationDetail {
  return {
    id: 'clx1234567890abcdefghijk',
    reference: 'REG-2026-0184',
    status: 'PENDING_REVIEW',
    payload: {
      traderName: 'Meru Agro Cooperative Society',
      traderType: 'cooperative',
      contactPerson: 'Jane Mushi',
      position: null,
      district: null,
      marketLocation: null,
      sex: null,
      region: 'Arusha',
      gpsLatitude: null,
      gpsLongitude: null,
      crops: ['sorghum'],
      otherCrops: null,
      capacityTons: 12,
      phone: '+255700000000',
    },
    submitterEmail: 'jane.mushi@example.com',
    consent: {
      consentingOrganisation: 'Meru Agro Cooperative Society',
      policyVersion: 'v2.1',
      acceptedAt: '2026-06-01T14:32:00.000Z',
      acceptedAtQualifier: 'RECORDED_AT_SUBMISSION',
    },
    duplicateCandidates: [],
    activityTrail: [],
    ...overrides,
  };
}

/** The "id gets rejected before any network call, and the page falls back
 * to the missing-id state" shape shared by the no-id, A-72 (`../`) and R7
 * (uppercase) cases below — only the search-param init differs between
 * them. */
async function expectMissingIdRejection(searchParamsInit: ConstructorParameters<typeof URLSearchParams>[0]) {
  mockSearchParams = new URLSearchParams(searchParamsInit);
  render(<RegistrationReviewPage />);

  await waitFor(() => {
    expect(screen.getByText('Missing registration id')).toBeInTheDocument();
  });
  expect(mockAdminGetRegistration).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ role: 'Admin', user: { name: 'Admin' }, accessToken: TOKEN });
  mockSearchParams = new URLSearchParams({ id: 'clx1234567890abcdefghijk' });
});

describe('RegistrationReviewPage', () => {
  it('renders the detail panel with the reference code on success', async () => {
    mockAdminGetRegistration.mockResolvedValue(buildDetail());
    render(<RegistrationReviewPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('REG-2026-0184');
    });
    expect(mockAdminGetRegistration).toHaveBeenCalledWith('clx1234567890abcdefghijk', TOKEN);
  });

  it('shows a missing-id state when no id is supplied, without calling the API', async () => {
    await expectMissingIdRejection(undefined);
  });

  it('A-72: rejects a crafted id containing "../" before any network call', async () => {
    await expectMissingIdRejection({ id: '../../etc/passwd' });
  });

  it(
    'R7: rejects an uppercase-admitting id before any network call — SAFE_ID_PATTERN carries ' +
      "no case-insensitive `i` flag, matching its own doc comment's \"lowercase alphanumeric only\" contract",
    async () => {
      await expectMissingIdRejection({ id: 'CLX1234567890ABCDEFGHIJK' });
    },
  );

  it('passes a legitimate cuid-shaped id through unchanged', async () => {
    mockAdminGetRegistration.mockResolvedValue(buildDetail());
    render(<RegistrationReviewPage />);

    await waitFor(() => {
      expect(mockAdminGetRegistration).toHaveBeenCalledWith('clx1234567890abcdefghijk', TOKEN);
    });
  });

  it('renders "Registration not found." on a 404', async () => {
    mockAdminGetRegistration.mockRejectedValue(new ApiError(404, 'Not found'));
    render(<RegistrationReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Registration not found.')).toBeInTheDocument();
    });
  });

  /**
   * R5 — a refresh that fails AFTER a successful mutation must not destroy
   * the confirmation of the registry's one irreversible action.
   *
   * This exercises `ReviewView`'s own render-gating logic (the `if
   * (!detail)` check, page.tsx) rather than re-driving `RegistrationDetail
   * Panel`'s real approve dialog/mutation wiring — that flow is
   * `RegistrationDetailPanel.test.tsx`'s territory. The fake panel (mocked
   * for this whole file, see the mock's own doc comment above) stands in
   * for "approve succeeded, the panel is showing its `role=\"status\"`
   * success announcement" and exposes `onRefresh` via a button — the SAME
   * prop the real panel's `handleApproveConfirm` calls immediately after a
   * successful approve.
   */
  it(
    'R5: a refresh that fails after a successful approve must not erase the success ' +
      'announcement or render "not found"',
    async () => {
      // A flag-driven implementation (rather than `mockResolvedValueOnce` /
      // `mockRejectedValueOnce` sequencing) so this test does not depend on
      // the EXACT number of times `adminGetRegistration` gets called — this
      // mock's own `useRouter()` returns a fresh object every render (`()
      // => ({ push: mockRouterPush })`), which makes `handleAuthFailure` /
      // `loadDetail` unstable across renders and the mount effect re-fire
      // more than once in this harness even for one logical "load". That is
      // a pre-existing property of this test file's `next/navigation` mock,
      // not a page.tsx defect, and not this remediation's concern — every
      // call before the flag flips succeeds identically; every call after
      // fails identically.
      let refreshShouldFail = false;
      mockAdminGetRegistration.mockImplementation(async () => {
        if (refreshShouldFail) {
          throw new ApiError(500, 'Refresh failed');
        }
        return buildDetail();
      });

      render(<RegistrationReviewPage />);

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(
          'REG-2026-0184 approved and published to the public directory.',
        );
      });

      const callsBeforeRefresh = mockAdminGetRegistration.mock.calls.length;
      // The post-approve refresh (`onRefresh`) now FAILS.
      refreshShouldFail = true;
      fireEvent.click(screen.getByText('Trigger refresh'));

      await waitFor(() => {
        expect(mockAdminGetRegistration.mock.calls.length).toBeGreaterThan(callsBeforeRefresh);
      });

      // The success announcement survives — the panel is still mounted.
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(
          'REG-2026-0184 approved and published to the public directory.',
        );
      });
      // The whole-view "not found" fallback must NOT have replaced it.
      expect(screen.queryByText('Registration not found')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Could not load the requested registration.'),
      ).not.toBeInTheDocument();

      // Reviewer issue 2 — the failed refresh must not go unreported: an
      // inline alert (matching RegistrationDetailPanel.tsx's own
      // `announcementError` treatment) tells the reviewer the data below
      // may be stale, since `error` used to be write-only state once
      // `detail` was already populated.
      //
      // Wrapped in `waitFor` because the alert's render is one state update
      // behind the click (`onRefresh` → `loadDetail`'s rejected promise →
      // `setError`), so asserting synchronously would rely on timing rather
      // than on the update having happened. This is what makes the
      // assertion robust — every DOM assertion in this file is inside a
      // `waitFor` for the same reason (see the mount-effect note above: this
      // file's `useRouter` mock returns a fresh object per render, so the
      // effect re-fires on every render).
      //
      // A prior attempt also hoisted the success fixture to one stable
      // object identity here, on the theory that a fresh object per call
      // kept a render loop alive and could clear `error` between the click
      // and this assertion. That was removed: the flake was never
      // reproduced (15 of 15 runs passed on the un-hoisted shape), the
      // effect re-fires because of the `useRouter` mock rather than the
      // fixture's identity, and `loadDetail`'s success path calls
      // `setError(null)` regardless of whether the payload is referentially
      // stable — so the hoist did not close the race it described.
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Could not load the latest details for this registration. The information below may be out of date.',
        );
      });
    },
  );

  it('redirects to /login when there is no session', async () => {
    mockGetSession.mockResolvedValue(null);
    render(<RegistrationReviewPage />);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/login');
    });
    expect(mockAdminGetRegistration).not.toHaveBeenCalled();
  });

  /**
   * T-14 attempt-2 FAIL-1 fix — restores the two `if (cancelled) return;`
   * guards T-13 shipped around the data write, which the T-14 rewrite of
   * this effect into a shared `loadDetail` had dropped.
   *
   * Simulates a soft navigation: `?id=` changes from ID_A to ID_B while
   * ID_A's request is still in flight (browser back/forward between two
   * review URLs is the real-world trigger). ID_B's request is issued by a
   * fresh effect instance and resolves first; ID_A's request — belonging to
   * the CLEANED-UP effect instance — resolves after. Without the
   * cancellation gate, ID_A's late `setDetail` call would win and the panel
   * would silently show registration A's data under `?id=B`.
   */
  it('T-14: a stale response cannot overwrite a newer one after id changes mid-flight', async () => {
    const ID_A = 'clx1234567890abcdefghijk';
    const ID_B = 'clyabcdefghijklmnopqrstu';

    let resolveA!: (value: AdminRegistrationDetail) => void;
    let resolveB!: (value: AdminRegistrationDetail) => void;
    const promiseA = new Promise<AdminRegistrationDetail>((resolve) => {
      resolveA = resolve;
    });
    const promiseB = new Promise<AdminRegistrationDetail>((resolve) => {
      resolveB = resolve;
    });

    mockAdminGetRegistration.mockImplementation((id: string) => {
      if (id === ID_A) return promiseA;
      if (id === ID_B) return promiseB;
      return Promise.reject(new Error(`unexpected id ${id}`));
    });

    mockSearchParams = new URLSearchParams({ id: ID_A });
    const { rerender } = render(<RegistrationReviewPage />);

    await waitFor(() => {
      expect(mockAdminGetRegistration).toHaveBeenCalledWith(ID_A, TOKEN);
    });

    // Soft navigation: id changes to B while A's request is still pending.
    mockSearchParams = new URLSearchParams({ id: ID_B });
    rerender(<RegistrationReviewPage />);

    await waitFor(() => {
      expect(mockAdminGetRegistration).toHaveBeenCalledWith(ID_B, TOKEN);
    });

    // B (the current navigation) resolves first.
    resolveB(buildDetail({ id: ID_B, reference: 'REG-2026-0200' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('REG-2026-0200');
    });

    // A resolves late — it belongs to a cancelled effect instance and must
    // NOT be allowed to overwrite B's already-rendered panel.
    resolveA(buildDetail({ id: ID_A, reference: 'REG-2026-0184' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('REG-2026-0200');
  });
});
