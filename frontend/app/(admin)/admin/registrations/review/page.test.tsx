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
});
