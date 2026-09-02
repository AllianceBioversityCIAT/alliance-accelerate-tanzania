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
 *   - A 404 from the API renders "Registration not found."
 *   - An unauthenticated session redirects to /login.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

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
// Mock @/lib/api/registrations-admin (adminGetRegistration)
// ---------------------------------------------------------------------------

const mockAdminGetRegistration = jest.fn();

jest.mock('@/lib/api/registrations-admin', () => {
  const actual = jest.requireActual('@/lib/api/registrations-admin');
  return {
    ...actual,
    adminGetRegistration: (...args: unknown[]) => mockAdminGetRegistration(...args),
  };
});

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
    mockSearchParams = new URLSearchParams();
    render(<RegistrationReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Missing registration id')).toBeInTheDocument();
    });
    expect(mockAdminGetRegistration).not.toHaveBeenCalled();
  });

  it('A-72: rejects a crafted id containing "../" before any network call', async () => {
    mockSearchParams = new URLSearchParams({ id: '../../etc/passwd' });
    render(<RegistrationReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Missing registration id')).toBeInTheDocument();
    });
    expect(mockAdminGetRegistration).not.toHaveBeenCalled();
  });

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
