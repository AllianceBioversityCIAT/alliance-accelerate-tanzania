// @sdd-spec admin/bulk-actor-operations (T-8)
/**
 * Unit tests for /admin/actors page (ActorsPage).
 *
 * Covers:
 *   - loading → populated row rendering
 *   - row selection surfaces BulkActionBar with selected count
 *   - Unlock flow opens AcknowledgeDialog, gates on typed phrase, calls bulkSetConsent(acknowledged:true)
 *   - Lock flow opens ConfirmDialog and calls bulkSetConsent(consentStatus:'DENIED')
 *   - Delete flow opens typed ConfirmDialog and calls bulkDeleteActors
 *   - mutation result summary is rendered in the success banner
 *   - AuthFailureError from listActors routes to /login
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouter = { push: mockRouterPush, replace: mockRouterReplace };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/admin/actors',
}));

// ---------------------------------------------------------------------------
// Mock next/image
// ---------------------------------------------------------------------------

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img alt={alt} {...rest} />
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth/useSession (consumed by AdminLayout top-bar slot)
// ---------------------------------------------------------------------------

const mockUseSession = jest.fn();

jest.mock('@/lib/auth/useSession', () => ({
  useSession: () => mockUseSession(),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth/auth-client (getSession)
// ---------------------------------------------------------------------------

const mockGetSession = jest.fn();

jest.mock('@/lib/auth/auth-client', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/api/actors-admin
// ---------------------------------------------------------------------------

const mockAdminListActors = jest.fn();
const mockBulkSetConsent = jest.fn();
const mockBulkDeleteActors = jest.fn();

jest.mock('@/lib/api/actors-admin', () => ({
  adminListActors: (...args: unknown[]) => mockAdminListActors(...args),
  bulkSetConsent: (...args: unknown[]) => mockBulkSetConsent(...args),
  bulkDeleteActors: (...args: unknown[]) => mockBulkDeleteActors(...args),
}));

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

import ActorsPage from './page';
import AdminLayout from '../../layout';
import { AuthFailureError } from '@/lib/api/client';
import { SessionContext } from '@/lib/auth/SessionProvider';
import type { SessionContextValue } from '@/lib/auth/SessionProvider';
import type { Session } from '@/lib/auth/useSession';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'test-access-token';

const FAKE_SESSION = {
  role: 'Admin' as const,
  user: { name: 'Alice', role: 'Admin' as const },
  accessToken: TOKEN,
};

const PUBLIC_SESSION = { role: 'Public' as const, user: null };
const STAFF_SESSION = { role: 'Staff' as const, user: { name: 'Bob', role: 'Staff' as const } };

import type { AdminActor, AdminActorList, BulkResult } from '@/lib/api/actors-admin';

const ACTOR_A: AdminActor = {
  id: 'actor-1',
  traderId: 'TZ-001',
  traderName: 'Meru Agro',
  region: 'Arusha',
  district: 'Arusha Urban',
  traderType: 'seed_company',
  sex: 'M',
  position: 'Director',
  marketLocation: 'Arusha Central',
  capacityTons: 100,
  technicalSupport: null,
  phone: '+255700000000',
  email: 'meru@example.com',
  gpsLatitude: -3.38,
  gpsLongitude: 36.68,
  gpsAltitude: null,
  gpsAccuracy: null,
  consentStatus: 'GRANTED',
  crops: ['sorghum'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const ACTOR_B: AdminActor = {
  id: 'actor-2',
  traderId: 'TZ-002',
  traderName: 'Kilimo Co',
  region: 'Dodoma',
  district: 'Dodoma Urban',
  traderType: 'cooperative',
  sex: 'F',
  position: 'Manager',
  marketLocation: 'Dodoma Market',
  capacityTons: 50,
  technicalSupport: null,
  phone: '+255711111111',
  email: 'kilimo@example.com',
  gpsLatitude: -6.18,
  gpsLongitude: 35.74,
  gpsAltitude: null,
  gpsAccuracy: null,
  consentStatus: 'DENIED',
  crops: ['common bean'],
  createdAt: '2024-02-01T00:00:00.000Z',
  updatedAt: '2024-02-01T00:00:00.000Z',
};

const LIST_RESULT: AdminActorList = {
  data: [ACTOR_A, ACTOR_B],
  page: 1,
  pageSize: 25,
  total: 2,
};

const BULK_RESULT: BulkResult = {
  requested: 1,
  applied: 1,
  notFound: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<ActorsPage />);
}

function renderPageWithSession(session: Session) {
  mockUseSession.mockReturnValue(session);
  const contextValue: SessionContextValue = {
    session,
    loading: false,
    signIn: async () => ({ status: 'error', message: '' }),
    signOut: async () => {},
    refresh: async () => {},
  };
  return render(
    <SessionContext.Provider value={contextValue}>
      <AdminLayout>
        <ActorsPage />
      </AdminLayout>
    </SessionContext.Provider>,
  );
}

async function populatePage() {
  mockGetSession.mockResolvedValue(FAKE_SESSION);
  mockAdminListActors.mockResolvedValue(LIST_RESULT);
  renderPage();
  await waitFor(() =>
    expect(screen.getAllByText(ACTOR_A.traderName).length).toBeGreaterThan(0),
  );
}

function selectActorByName(name: string) {
  const checkboxes = screen.getAllByRole('checkbox', { name: new RegExp(`select ${name}`, 'i') });
  fireEvent.click(checkboxes[0]);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests — Loading → Populated
// ---------------------------------------------------------------------------

describe('ActorsPage — list renders rows for returned actors', () => {
  it('shows a loading skeleton while data is being fetched', async () => {
    let resolveList!: (r: AdminActorList) => void;
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockAdminListActors.mockReturnValue(new Promise<AdminActorList>((res) => { resolveList = res; }));

    renderPage();

    expect(screen.getByRole('status', { name: /loading actors/i })).toBeInTheDocument();

    await act(async () => resolveList(LIST_RESULT));
  });

  it('renders a row for each actor after loading completes', async () => {
    await populatePage();

    expect(screen.getAllByText(ACTOR_A.traderName).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ACTOR_B.traderName).length).toBeGreaterThan(0);
  });

  it('hides the loading skeleton after data loads', async () => {
    await populatePage();

    await waitFor(() =>
      expect(screen.queryByRole('status', { name: /loading actors/i })).not.toBeInTheDocument(),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Selection → BulkActionBar
// ---------------------------------------------------------------------------

describe('ActorsPage — selection surfaces bulk actions', () => {
  it('shows BulkActionBar with the selected count after selecting a row', async () => {
    await populatePage();

    selectActorByName(ACTOR_A.traderName);

    const toolbar = screen.getByRole('toolbar', { name: /bulk actor actions/i });
    expect(toolbar).toBeInTheDocument();
    expect(within(toolbar).getByText(/1 actor selected/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — Unlock flow
// ---------------------------------------------------------------------------

describe('ActorsPage — unlock flow', () => {
  it('opens AcknowledgeDialog when Unlock is clicked and confirms only after typing the acknowledgement', async () => {
    mockBulkSetConsent.mockResolvedValue(BULK_RESULT);

    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /unlock 1 actor/i })).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: /^unlock$/i });
    expect(confirmBtn).toBeDisabled();

    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: 'I confirm consent is on file' } });

    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(mockBulkSetConsent).toHaveBeenCalledWith(
        { ids: [ACTOR_A.id], consentStatus: 'GRANTED', acknowledged: true },
        TOKEN,
      ),
    );
  });

  it('renders a result summary after a successful unlock', async () => {
    mockBulkSetConsent.mockResolvedValue(BULK_RESULT);

    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: 'I confirm consent is on file' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^unlock$/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/unlocked 1 actor/i),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Lock flow
// ---------------------------------------------------------------------------

describe('ActorsPage — lock flow', () => {
  it('opens ConfirmDialog and calls bulkSetConsent with consentStatus:DENIED', async () => {
    mockBulkSetConsent.mockResolvedValue(BULK_RESULT);

    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    fireEvent.click(screen.getByRole('button', { name: /^lock$/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /lock 1 actor/i })).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: /^lock$/i });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(mockBulkSetConsent).toHaveBeenCalledWith(
        { ids: [ACTOR_A.id], consentStatus: 'DENIED' },
        TOKEN,
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Delete flow
// ---------------------------------------------------------------------------

describe('ActorsPage — delete flow', () => {
  it('opens typed ConfirmDialog and calls bulkDeleteActors after typing the phrase', async () => {
    mockBulkDeleteActors.mockResolvedValue(BULK_RESULT);

    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /delete 1 actor/i })).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: /^delete$/i });
    expect(confirmBtn).toBeDisabled();

    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: 'delete 1 actor' } });

    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(mockBulkDeleteActors).toHaveBeenCalledWith({ ids: [ACTOR_A.id] }, TOKEN),
    );
  });

  it('renders a result summary after a successful delete', async () => {
    mockBulkDeleteActors.mockResolvedValue(BULK_RESULT);

    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: 'delete 1 actor' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/deleted 1 actor/i),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Auth failure
// ---------------------------------------------------------------------------

describe('ActorsPage — auth failure handling', () => {
  it('routes to /login when adminListActors throws AuthFailureError', async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockAdminListActors.mockRejectedValue(new AuthFailureError());

    renderPage();

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/login'),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Non-Admin redirect (FR-9)
// ---------------------------------------------------------------------------

describe('ActorsPage — non-Admin redirect', () => {
  it('redirects a Staff user to /login and does not render the actor table', async () => {
    mockGetSession.mockResolvedValue(null);
    renderPageWithSession(STAFF_SESSION);

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith('/login'),
    );

    expect(screen.queryByRole('status', { name: /loading actors/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: /bulk actor actions/i })).not.toBeInTheDocument();
  });

  it('redirects a Public visitor to /login and does not render the actor table', async () => {
    mockGetSession.mockResolvedValue(null);
    renderPageWithSession(PUBLIC_SESSION);

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith('/login'),
    );

    expect(screen.queryByRole('status', { name: /loading actors/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: /bulk actor actions/i })).not.toBeInTheDocument();
  });
});
