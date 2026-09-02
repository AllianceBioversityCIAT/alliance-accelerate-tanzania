// @sdd-spec admin/registration-review-queue (T-12)
/**
 * Unit tests for /admin/registrations page (RegistrationsPage).
 *
 * Covers:
 *   - Populated render with default status/sort (PENDING_REVIEW, oldest).
 *   - URL sync: segment change, search (debounced), pagination all push the
 *     expected query onto the URL via router.replace (FR-9 scenario 2).
 *   - Empty-state discrimination (FR-9 scenario 4): "page beyond the result
 *     set" vs "nothing matches this filter" vs "no registrations at all" —
 *     the last claimed only when the unfiltered probe confirms it.
 *   - Segment absence (FR-9 scenario 1, KZ-002 direction — an absence
 *     assertion can only PROVE absence): exactly three status tabs render,
 *     and neither "Awaiting" nor "Withdrawn" text appears anywhere. Adding
 *     an `AWAITING_APPLICANT` entry to `STATUS_SEGMENTS` in page.tsx must
 *     redden the "exactly three tabs" assertion below — this is the task's
 *     named falsifying input, run and reverted during implementation (see
 *     the Implementer's completion report for the verbatim failing output).
 *   - AuthFailureError routes to /login.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouter = { push: mockRouterPush, replace: mockRouterReplace };
const mockUseSearchParams = jest.fn(() => new URLSearchParams());

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/admin/registrations',
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth/auth-client (getSession)
// ---------------------------------------------------------------------------

const mockGetSession = jest.fn();

jest.mock('@/lib/auth/auth-client', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/api/registrations-admin
// ---------------------------------------------------------------------------

const mockAdminListRegistrations = jest.fn();

jest.mock('@/lib/api/registrations-admin', () => {
  const actual = jest.requireActual('@/lib/api/registrations-admin');
  return {
    ...actual,
    adminListRegistrations: (...args: unknown[]) => mockAdminListRegistrations(...args),
  };
});

// ---------------------------------------------------------------------------
// Mock AuthFailureError (keep real class behaviour for instanceof checks)
// ---------------------------------------------------------------------------

jest.mock('@/lib/api/client', () => {
  class AuthFailureError extends Error {
    readonly status = 401;
    constructor(msg = 'Session expired') {
      super(msg);
      this.name = 'AuthFailureError';
    }
  }
  return { AuthFailureError };
});

// ---------------------------------------------------------------------------
// Import page under test (after all mocks)
// ---------------------------------------------------------------------------

import RegistrationsPage from './page';
import { AuthFailureError } from '@/lib/api/client';
import type { AdminRegistrationListRow, AdminRegistrationList } from '@/lib/api/registrations-admin';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'test-access-token';

const ROW_A: AdminRegistrationListRow = {
  id: 'reg-1',
  reference: 'REG-2026-0001',
  applicant: 'Meru Agro',
  traderType: 'seed_company',
  region: 'Arusha',
  submittedAt: '2026-06-01T00:00:00.000Z',
  status: 'PENDING_REVIEW',
  duplicateCandidateCount: 0,
};

const ROW_B: AdminRegistrationListRow = {
  id: 'reg-2',
  reference: 'REG-2026-0002',
  applicant: 'Kilimo Co',
  traderType: 'cooperative',
  region: 'Dodoma',
  submittedAt: '2026-05-15T00:00:00.000Z',
  status: 'PENDING_REVIEW',
  duplicateCandidateCount: 2,
};

const LIST_RESULT: AdminRegistrationList = {
  data: [ROW_A, ROW_B],
  page: 1,
  pageSize: 25,
  total: 2,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<RegistrationsPage />);
}

/** A registration-list mock split by whether the call carries `status` — the
 * main query always includes it; the FR-9 scenario 4 "is the system empty"
 * probe deliberately never does (page.tsx). */
function mockListSplitByStatus(mainResult: AdminRegistrationList, probeResult: AdminRegistrationList) {
  mockAdminListRegistrations.mockImplementation((query: { status?: string } | undefined) => {
    if (query?.status) return Promise.resolve(mainResult);
    return Promise.resolve(probeResult);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
  mockGetSession.mockResolvedValue({ accessToken: TOKEN });
  mockAdminListRegistrations.mockResolvedValue(LIST_RESULT);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegistrationsPage', () => {
  it('loads with the default segment (PENDING_REVIEW) and default sort (oldest)', async () => {
    renderPage();

    await waitFor(() => expect(mockAdminListRegistrations).toHaveBeenCalled());

    expect(mockAdminListRegistrations).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_REVIEW', page: 1, pageSize: 25 }),
      TOKEN,
    );
    // Default sort is 'oldest' and is NOT sent as an explicit filter key
    // (omitted-when-default, mirroring the other optional filters).
    const call = mockAdminListRegistrations.mock.calls[0][0];
    expect(call.sort).toBeUndefined();

    // Both the table and the card view render in jsdom (breakpoints are not
    // applied), so a row's text is present twice — mirrors the same
    // `getAllByText(...).length` convention app/(admin)/admin/actors/page.test.tsx uses.
    await waitFor(() => expect(screen.getAllByText('REG-2026-0001').length).toBeGreaterThan(0));
    expect(screen.getAllByText('REG-2026-0002').length).toBeGreaterThan(0);
  });

  it('renders exactly three status segments, and none named Awaiting or Withdrawn', async () => {
    renderPage();
    await waitFor(() => expect(mockAdminListRegistrations).toHaveBeenCalled());

    const group = screen.getByRole('group', { name: 'Filter by status' });
    const segments = within(group).getAllByRole('button');
    expect(segments).toHaveLength(3);
    expect(segments.map((t) => t.textContent)).toEqual(['Pending review', 'Approved', 'Rejected']);

    expect(screen.queryByText(/awaiting/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/withdrawn/i)).not.toBeInTheDocument();
  });

  it('pushes the status query param onto the URL when a segment is selected (URL sync)', async () => {
    renderPage();
    await waitFor(() => expect(mockAdminListRegistrations).toHaveBeenCalled());

    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: 'Approved' }));

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('status=APPROVED'), {
        scroll: false,
      }),
    );
    // Selecting a segment resets to page 1 — no `page` param on the pushed URL.
    const [pushedUrl] = mockRouterReplace.mock.calls[mockRouterReplace.mock.calls.length - 1];
    expect(pushedUrl).not.toEqual(expect.stringContaining('page='));
  });

  it('pushes the search term onto the URL after the debounce (URL sync)', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    renderPage();
    await waitFor(() => expect(mockAdminListRegistrations).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Search registrations by applicant name'), {
      target: { value: 'Meru' },
    });

    act(() => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('q=Meru'), { scroll: false }),
    );

    jest.useRealTimers();
  });

  // R16 — requirements.md:125 requires filter, SORT and page state all stay
  // in the URL; only status/q/page were previously asserted here. Stripping
  // `sort` from page.tsx's `handleSortChange` pushParams call left this
  // whole suite green (verified below, reverted).
  it('R16 — pushes the sort query param onto the URL when the sort control changes (URL sync)', async () => {
    renderPage();
    await waitFor(() => expect(mockAdminListRegistrations).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'newest' } });

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('sort=newest'), {
        scroll: false,
      }),
    );
  });

  // R16 — region/traderType were checked alongside sort and found equally
  // unasserted for URL sync; added here too.
  it('R16 — pushes the region query param onto the URL when the region filter changes (URL sync)', async () => {
    renderPage();
    await waitFor(() => expect(mockAdminListRegistrations).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Arusha' } });

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('region=Arusha'), {
        scroll: false,
      }),
    );
  });

  it('R16 — pushes the traderType query param onto the URL when the type filter changes (URL sync)', async () => {
    renderPage();
    await waitFor(() => expect(mockAdminListRegistrations).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'seed_company' } });

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith(
        expect.stringContaining('traderType=seed_company'),
        { scroll: false },
      ),
    );
  });

  it('pushes the page param when Next is clicked (URL sync, pagination)', async () => {
    mockAdminListRegistrations.mockResolvedValue({ ...LIST_RESULT, total: 60 });
    renderPage();
    await waitFor(() => expect(mockAdminListRegistrations).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('page=2'), { scroll: false }),
    );
  });

  it('shows "Nothing on this page" when the filtered query has other matches but this page has none (page-beyond-result-set)', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('page=2'));
    mockAdminListRegistrations.mockResolvedValue({ data: [], page: 2, pageSize: 25, total: 5 });

    renderPage();

    expect(await screen.findByText('Nothing on this page')).toBeInTheDocument();
    expect(screen.queryByText('No registrations yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No registrations match this view')).not.toBeInTheDocument();
    // The probe is never called on this path — `total > 0` already answers
    // "not globally empty" without needing it.
    expect(mockAdminListRegistrations).toHaveBeenCalledTimes(1);
  });

  it('shows "No registrations match this view" when this filter is empty but the system is not (probe confirms)', async () => {
    mockListSplitByStatus(
      { data: [], page: 1, pageSize: 25, total: 0 },
      { data: [], page: 1, pageSize: 1, total: 7 },
    );

    renderPage();

    expect(await screen.findByText('No registrations match this view')).toBeInTheDocument();
    expect(screen.queryByText('No registrations yet')).not.toBeInTheDocument();
  });

  it('shows "No registrations yet" only when the unfiltered probe also confirms zero', async () => {
    mockListSplitByStatus(
      { data: [], page: 1, pageSize: 25, total: 0 },
      { data: [], page: 1, pageSize: 1, total: 0 },
    );

    renderPage();

    expect(await screen.findByText('No registrations yet')).toBeInTheDocument();
    expect(screen.queryByText('No registrations match this view')).not.toBeInTheDocument();
  });

  it('falls back to the filtered empty message (never claims global emptiness) if the probe itself fails', async () => {
    mockAdminListRegistrations.mockImplementation((query: { status?: string } | undefined) => {
      if (query?.status) return Promise.resolve({ data: [], page: 1, pageSize: 25, total: 0 });
      return Promise.reject(new Error('probe failed'));
    });

    renderPage();

    expect(await screen.findByText('No registrations match this view')).toBeInTheDocument();
    expect(screen.queryByText('No registrations yet')).not.toBeInTheDocument();
  });

  it('routes to /login on AuthFailureError from the main list call', async () => {
    mockAdminListRegistrations.mockRejectedValue(new AuthFailureError());
    renderPage();

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login'));
  });

  it('has no accessibility violations jest-axe can evaluate (NFR-5; DC-16 covers contrast/focus separately)', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(mockAdminListRegistrations).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('REG-2026-0001').length).toBeGreaterThan(0));

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
