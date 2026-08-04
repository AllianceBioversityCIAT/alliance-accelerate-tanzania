// @sdd-spec admin/bulk-actor-operations (T-8)
// @sdd-spec actors/registration-source-and-consent (T-8)
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
 *
 * registration-source-and-consent (T-8) extension: the page now reads its
 * filters from useSearchParams() (URL-sync), so `next/navigation` is mocked
 * with a `useSearchParams` stub here too — every suite above gets an empty
 * URLSearchParams by default (the pre-T-8 "no filters applied" behavior).
 * The new "T-8 filters + URL sync" describe blocks below override it with
 * `mockUseSearchParams.mockReturnValue(...)` per test.
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
  usePathname: () => '/admin/actors',
  // T-8 (registration-source-and-consent): ActorsView now URL-syncs its
  // filters via useSearchParams(). Defaults to an empty URLSearchParams so
  // every pre-existing suite in this file keeps behaving exactly as before;
  // the T-8 filter/URL-sync tests below reconfigure it per test.
  useSearchParams: (...args: unknown[]) => mockUseSearchParams(...args),
}));

// Prevent jsdom from attempting real navigation when row Edit links are clicked.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, onClick, ...rest }: any) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
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
const mockDeleteActor = jest.fn();

// T-10: dateOnlyToInstant is a pure wire-shape helper (not a mutation) —
// pulled through from the real module via requireActual so the unlock tests
// below assert the real RFC-3339 conversion the page sends, not a stub.
jest.mock('@/lib/api/actors-admin', () => {
  const actual = jest.requireActual('@/lib/api/actors-admin');
  return {
    ...actual,
    adminListActors: (...args: unknown[]) => mockAdminListActors(...args),
    bulkSetConsent: (...args: unknown[]) => mockBulkSetConsent(...args),
    bulkDeleteActors: (...args: unknown[]) => mockBulkDeleteActors(...args),
    deleteActor: (...args: unknown[]) => mockDeleteActor(...args),
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

import type { AdminActor, AdminActorList, BulkResult, BulkConsentResult } from '@/lib/api/actors-admin';

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
  registrationSource: 'TEAM_MANAGED',
  consentMethod: 'SIGNED_FORM',
  consentObtainedAt: '2023-12-01T00:00:00.000Z',
  consentReference: 'Form #A-001',
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
  registrationSource: 'SELF_REGISTERED',
  consentMethod: 'NOT_RECORDED',
  consentObtainedAt: null,
  consentReference: null,
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

/**
 * T-10 — `bulkSetConsent` always returns `BulkConsentResult` (DD-4's
 * `preserved` count, `actors-admin.service.ts`). `preserved: 0` is the
 * ordinary case: this batch's one selected actor had no provenance of its
 * own, so nothing was left untouched.
 */
const UNLOCK_RESULT: BulkConsentResult = {
  requested: 1,
  applied: 1,
  notFound: [],
  preserved: 0,
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
    expect(screen.queryByRole('status', { name: /loading actors/i })).not.toBeInTheDocument(),
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
  it('opens AcknowledgeDialog when Unlock is clicked and confirms only after typing the acknowledgement, method, and date', async () => {
    mockBulkSetConsent.mockResolvedValue(UNLOCK_RESULT);

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

    // T-10 — the phrase alone no longer suffices; the bulk-unlock dialog
    // also requires the batch consent method and date (FR-3, DD-4).
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/consent method/i), {
      target: { value: 'SIGNED_FORM' },
    });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/consent obtained on/i), {
      target: { value: '2026-01-15' },
    });

    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    // Real wire shape: consentObtainedAt is a full RFC-3339 instant anchored
    // at Tanzania (UTC+3) midnight, never the bare YYYY-MM-DD the date input
    // produces (see `dateOnlyToInstant`, lib/api/actors-admin.ts).
    await waitFor(() =>
      expect(mockBulkSetConsent).toHaveBeenCalledWith(
        {
          ids: [ACTOR_A.id],
          consentStatus: 'GRANTED',
          acknowledged: true,
          consentMethod: 'SIGNED_FORM',
          consentObtainedAt: '2026-01-15T00:00:00+03:00',
        },
        TOKEN,
      ),
    );
  });

  it('renders a result summary reporting the preserved count after a successful unlock', async () => {
    mockBulkSetConsent.mockResolvedValue({ ...UNLOCK_RESULT, preserved: 0 });

    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/type .* to confirm/i), {
      target: { value: 'I confirm consent is on file' },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent method/i), {
      target: { value: 'SIGNED_FORM' },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent obtained on/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^unlock$/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /unlocked 1 actor\. 0 actors already had evidence on file and kept it unchanged\./i,
      ),
    );
  });

  it('keeps the preserved-count summary grammatical when exactly one actor was preserved (DD-4)', async () => {
    mockBulkSetConsent.mockResolvedValue({ ...UNLOCK_RESULT, preserved: 1 });

    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/type .* to confirm/i), {
      target: { value: 'I confirm consent is on file' },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent method/i), {
      target: { value: 'SIGNED_FORM' },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent obtained on/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^unlock$/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /1 actor already had evidence on file and kept it unchanged\./i,
      ),
    );
  });

  it('resets the method and date inputs when the dialog is re-opened after a completed unlock', async () => {
    mockBulkSetConsent.mockResolvedValue(UNLOCK_RESULT);

    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/type .* to confirm/i), {
      target: { value: 'I confirm consent is on file' },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent method/i), {
      target: { value: 'SIGNED_FORM' },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent obtained on/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^unlock$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    selectActorByName(ACTOR_B.traderName);
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));

    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/consent method/i)).toHaveValue('');
    expect(within(dialog).getByLabelText(/consent obtained on/i)).toHaveValue('');
  });

  it('resets the method and date inputs when the dialog is cancelled and re-opened', async () => {
    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/consent method/i), {
      target: { value: 'SIGNED_FORM' },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent obtained on/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/consent method/i)).toHaveValue('');
    expect(within(dialog).getByLabelText(/consent obtained on/i)).toHaveValue('');
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
// Tests — Toolbar (T-9)
// ---------------------------------------------------------------------------

describe('ActorsPage — toolbar', () => {
  it('renders a New actor link to /admin/actors/new', async () => {
    await populatePage();

    const link = screen.getByRole('link', { name: /new actor/i });
    expect(link).toHaveAttribute('href', '/admin/actors/new');
  });

  it('renders an Import link to /admin/actors/import', async () => {
    await populatePage();

    const link = screen.getByRole('link', { name: /^import$/i });
    expect(link).toHaveAttribute('href', '/admin/actors/import');
  });
});

// ---------------------------------------------------------------------------
// Tests — Row actions (T-9)
// ---------------------------------------------------------------------------

describe('ActorsPage — row actions', () => {
  it('navigates to the edit view when a row Edit link is clicked', async () => {
    await populatePage();

    fireEvent.click(screen.getAllByRole('link', { name: /edit meru agro/i })[0]);

    expect(mockRouterPush).toHaveBeenCalledWith('/admin/actors/edit?id=actor-1');
  });

  it('deletes a single actor via typed ConfirmDialog and refreshes the list', async () => {
    mockDeleteActor.mockResolvedValue({ deleted: true, id: ACTOR_A.id });

    await populatePage();

    fireEvent.click(screen.getAllByRole('button', { name: /delete meru agro/i })[0]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /delete meru agro/i })).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: /^delete$/i });
    expect(confirmBtn).toBeDisabled();

    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: 'delete Meru Agro' } });

    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(mockDeleteActor).toHaveBeenCalledWith(ACTOR_A.id, TOKEN),
    );

    await waitFor(() =>
      expect(mockAdminListActors).toHaveBeenCalledTimes(2),
    );

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/deleted meru agro/i),
    );
  });

  it('leaves the bulk action bar unchanged when row actions render with rows selected', async () => {
    mockDeleteActor.mockResolvedValue({ deleted: true, id: ACTOR_A.id });

    await populatePage();
    selectActorByName(ACTOR_A.traderName);

    const toolbar = screen.getByRole('toolbar', { name: /bulk actor actions/i });
    expect(within(toolbar).getByText(/1 actor selected/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /delete meru agro/i })[0]);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /delete meru agro/i })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(toolbar).getByText(/1 actor selected/i)).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Tests — T-8 registration-source and consent-method filters + URL sync
// ---------------------------------------------------------------------------
//
// Every test below explicitly calls setSearchParams(...) (even with an empty
// string) rather than relying on the module-level default: jest.clearAllMocks()
// in the top-level beforeEach clears call history but NOT a previously set
// mockReturnValue, so an explicit call per test is what actually guarantees
// isolation from whichever URL a prior test configured.

/** The legacy, unevidenced-grant case FR-9 exists to make enumerable. */
const ACTOR_LEGACY_UNEVIDENCED: AdminActor = {
  ...ACTOR_A,
  id: 'actor-legacy',
  traderId: 'TZ-LEGACY',
  traderName: 'Legacy Traders',
  consentMethod: 'NOT_RECORDED',
  consentObtainedAt: null,
  consentReference: null,
};

function setSearchParams(qs: string) {
  mockUseSearchParams.mockReturnValue(new URLSearchParams(qs));
}

describe('ActorsPage — registration-source and consent-method filters (T-8, FR-6)', () => {
  it('renders the Registration source and Consent method filter selects', async () => {
    setSearchParams('');
    await populatePage();

    expect(screen.getByLabelText('Registration source')).toBeInTheDocument();
    expect(screen.getByLabelText('Consent method')).toBeInTheDocument();
  });

  it('reads registrationSource and consentMethod from the URL on mount and passes them to adminListActors', async () => {
    setSearchParams('registrationSource=SELF_REGISTERED&consentMethod=EMAIL');
    await populatePage();

    expect(mockAdminListActors).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationSource: 'SELF_REGISTERED',
        consentMethod: 'EMAIL',
      }),
      TOKEN,
    );
  });

  it('restores the filter select values from the URL (filter state survives a reload)', async () => {
    setSearchParams('registrationSource=SELF_REGISTERED&consentMethod=EMAIL');
    await populatePage();

    expect(screen.getByLabelText('Registration source')).toHaveValue('SELF_REGISTERED');
    expect(screen.getByLabelText('Consent method')).toHaveValue('EMAIL');
  });

  it('writes the selected registration source to the URL and resets the page param', async () => {
    setSearchParams('');
    await populatePage();

    fireEvent.change(screen.getByLabelText('Registration source'), {
      target: { value: 'SELF_REGISTERED' },
    });

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith(
        '?registrationSource=SELF_REGISTERED',
        { scroll: false },
      ),
    );
  });

  it('writes the selected consent method to the URL', async () => {
    setSearchParams('');
    await populatePage();

    fireEvent.change(screen.getByLabelText('Consent method'), {
      target: { value: 'NOT_RECORDED' },
    });

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith(
        '?consentMethod=NOT_RECORDED',
        { scroll: false },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — FR-9 legacy unevidenced-consent enumeration
// ---------------------------------------------------------------------------

describe('ActorsPage — FR-9 legacy unevidenced-consent enumeration', () => {
  it('sends consentStatus and consentMethod together as an AND on the same request', async () => {
    setSearchParams('consentStatus=GRANTED&consentMethod=NOT_RECORDED');
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockAdminListActors.mockResolvedValue({
      data: [ACTOR_LEGACY_UNEVIDENCED],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    render(<ActorsPage />);

    await waitFor(() =>
      expect(mockAdminListActors).toHaveBeenCalledWith(
        expect.objectContaining({ consentStatus: 'GRANTED', consentMethod: 'NOT_RECORDED' }),
        TOKEN,
      ),
    );
  });

  it('renders exactly the legacy unevidenced set the mocked API returns for that filter combination', async () => {
    setSearchParams('consentStatus=GRANTED&consentMethod=NOT_RECORDED');
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockAdminListActors.mockResolvedValue({
      data: [ACTOR_LEGACY_UNEVIDENCED],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    render(<ActorsPage />);

    await waitFor(() =>
      expect(screen.getAllByText('Legacy Traders').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(ACTOR_A.traderName)).not.toBeInTheDocument();
    expect(screen.getByText(/showing/i).closest('p')).toHaveTextContent('Showing 1 of 1 actors');
  });
});

// ---------------------------------------------------------------------------
// Tests — invalid URL-borne enum filter values (T-8 rework, Issue 1)
// ---------------------------------------------------------------------------
//
// A shared/stale link, a typo, or an enum rename can put an unrecognized
// value on consentStatus/registrationSource/consentMethod. Before this
// rework that value flowed straight to adminListActors, the backend's
// @IsIn validation 400'd, and the filter bar (rendered only in the
// populated branch) disappeared along with any way to recover. It must now
// degrade to "All" on read, and the filter bar/Clear-filters escape hatch
// must stay reachable through the error and empty states too.

describe('ActorsPage — invalid URL-borne filter values degrade instead of erroring (T-8 rework, Issue 1)', () => {
  it('sanitizes an unrecognized consentMethod value to "All" and omits it from the adminListActors call', async () => {
    setSearchParams('consentMethod=NOT_A_METHOD');
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockAdminListActors.mockResolvedValue(LIST_RESULT);
    render(<ActorsPage />);

    await waitFor(() => expect(mockAdminListActors).toHaveBeenCalled());

    expect(screen.getByLabelText('Consent method')).toHaveValue('');
    const [query] = mockAdminListActors.mock.calls[0];
    expect(query).not.toHaveProperty('consentMethod');
  });

  it('sanitizes unrecognized consentStatus/registrationSource values the same way', async () => {
    setSearchParams('consentStatus=NOT_A_STATUS&registrationSource=NOT_A_SOURCE');
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockAdminListActors.mockResolvedValue(LIST_RESULT);
    render(<ActorsPage />);

    await waitFor(() => expect(mockAdminListActors).toHaveBeenCalled());

    expect(screen.getByLabelText('Consent status')).toHaveValue('');
    expect(screen.getByLabelText('Registration source')).toHaveValue('');
    const [query] = mockAdminListActors.mock.calls[0];
    expect(query).not.toHaveProperty('consentStatus');
    expect(query).not.toHaveProperty('registrationSource');
  });

  it('keeps the filter bar visible and enabled when adminListActors errors (no dead-end)', async () => {
    setSearchParams('region=Mbeya');
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockAdminListActors.mockRejectedValue(new Error('Network failure'));
    render(<ActorsPage />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/network failure/i),
    );

    // Only genuine in-flight loading disables the filter bar — a failed
    // request must not leave it stuck disabled or unmounted.
    const regionSelect = screen.getByLabelText('Region');
    expect(regionSelect).toBeInTheDocument();
    expect(regionSelect).toBeEnabled();
    expect(regionSelect).toHaveValue('Mbeya');

    // Clear filters is reachable from the error state.
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('keeps the filter bar and Clear filters reachable in the empty state', async () => {
    setSearchParams('region=Mbeya');
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockAdminListActors.mockResolvedValue({ data: [], page: 1, pageSize: 25, total: 0 });
    render(<ActorsPage />);

    await waitFor(() => expect(screen.getByText(/no actors found/i)).toBeInTheDocument());

    expect(screen.getByLabelText('Region')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(mockRouterReplace).toHaveBeenCalledWith('?', { scroll: false });
  });
});

// ---------------------------------------------------------------------------
// Tests — accessibility (jest-axe, NFR-5)
// ---------------------------------------------------------------------------

describe('ActorsPage — accessibility (T-8 Source/Consent columns + filters)', () => {
  it('has no axe violations in the populated state', async () => {
    setSearchParams('');
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockAdminListActors.mockResolvedValue(LIST_RESULT);
    const { container } = render(<ActorsPage />);

    await waitFor(() => expect(screen.getAllByText(ACTOR_A.traderName).length).toBeGreaterThan(0));

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
