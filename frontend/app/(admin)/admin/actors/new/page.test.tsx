// @sdd-spec actors/consent-intake/intake-required-fields (T-6)
/**
 * Unit tests for /admin/actors/new (FR-3's weak scenario).
 *
 * `ActorForm` is mocked to a stub exposing two buttons that call `onSuccess`
 * with a representative `AdminActorCreateResult` — one with an empty
 * `duplicateWarnings` array (the common case) and one with a non-empty one
 * (FR-3's weak match). This isolates the page's own decision ("show the
 * informational dialog, or redirect immediately?") from ActorForm's own
 * validation/submit behaviour, which `ActorForm.test.tsx` already covers.
 *
 * Covers:
 *   - no duplicateWarnings → redirects to /admin/actors immediately, no dialog
 *   - duplicateWarnings present → shows the informational dialog naming the
 *     match, with a single OK button (no choice to make, FR-3's weak
 *     scenario is never gated)
 *   - OK redirects to /admin/actors
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth/auth-client (getSession)
// ---------------------------------------------------------------------------

jest.mock('@/lib/auth/auth-client', () => ({
  getSession: jest.fn().mockResolvedValue({
    role: 'Admin',
    user: { name: 'Admin' },
    accessToken: 'test-access-token',
  }),
}));

// ---------------------------------------------------------------------------
// Mock ActorForm — a stub exposing two buttons that call onSuccess with a
// fixed AdminActorCreateResult (no-warnings / with-warnings), so this suite
// isolates the page's own weak-duplicate-dialog decision.
// ---------------------------------------------------------------------------

const NO_WARNINGS_RESULT = {
  id: 'actor-new-001',
  traderId: 'TM-2026-0012',
  traderName: 'Mbeya Seeds Ltd',
  duplicateWarnings: [],
};

const WITH_WARNINGS_RESULT = {
  id: 'actor-new-002',
  traderId: 'TM-2026-0013',
  traderName: 'Songwe Agro',
  duplicateWarnings: [
    { actorId: 'actor-existing-1', traderId: 'TM-2025-0099', traderName: 'Songwe Agro Ltd', matchedOn: ['traderName'] },
  ],
};

const UNKNOWN_WITH_EMAIL = {
  id: 'actor-new-003',
  traderId: 'TM-2026-0014',
  traderName: 'Kilimo Co',
  email: 'kilimo@example.com',
  consentStatus: 'UNKNOWN',
  duplicateWarnings: [],
};
const UNKNOWN_WITH_EMAIL_AND_WARNINGS = {
  ...UNKNOWN_WITH_EMAIL,
  id: 'actor-new-004',
  duplicateWarnings: WITH_WARNINGS_RESULT.duplicateWarnings,
};
const GRANTED_WITH_EMAIL = { ...UNKNOWN_WITH_EMAIL, id: 'actor-new-005', consentStatus: 'GRANTED' };
const GRANTED_WITH_EMAIL_AND_WARNINGS = {
  ...GRANTED_WITH_EMAIL,
  duplicateWarnings: WITH_WARNINGS_RESULT.duplicateWarnings,
};

const DOCUMENT_FILE = new File(['%PDF-1.4'], 'consent.pdf', { type: 'application/pdf' });

jest.mock('@/components/admin/ActorForm', () => ({
  __esModule: true,
  default: ({ onSuccess }: { onSuccess: (actor?: unknown, extras?: unknown) => void }) => (
    <div>
      <button type="button" onClick={() => onSuccess(UNKNOWN_WITH_EMAIL, { documentFile: DOCUMENT_FILE })}>
        Simulate create (unknown, email, document)
      </button>
      <button type="button" onClick={() => onSuccess(GRANTED_WITH_EMAIL, { documentFile: DOCUMENT_FILE })}>
        Simulate create (granted, document)
      </button>
      <button type="button" onClick={() => onSuccess(UNKNOWN_WITH_EMAIL)}>
        Simulate create (unknown, email)
      </button>
      <button type="button" onClick={() => onSuccess(UNKNOWN_WITH_EMAIL_AND_WARNINGS)}>
        Simulate create (unknown, email, warnings)
      </button>
      <button type="button" onClick={() => onSuccess(GRANTED_WITH_EMAIL)}>
        Simulate create (granted)
      </button>
      <button type="button" onClick={() => onSuccess(GRANTED_WITH_EMAIL_AND_WARNINGS)}>
        Simulate create (granted, warnings)
      </button>
      <button type="button" onClick={() => onSuccess(NO_WARNINGS_RESULT)}>
        Simulate create (no warnings)
      </button>
      <button type="button" onClick={() => onSuccess(WITH_WARNINGS_RESULT)}>
        Simulate create (with warnings)
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const mockEnqueue = jest.fn();
const mockDispatch = jest.fn();
const mockUpload = jest.fn();
jest.mock('@/lib/api/consent-requests-admin', () => ({
  uploadConsentDocument: (...args: unknown[]) => mockUpload(...args),
  enqueueConsentRequests: (...args: unknown[]) => mockEnqueue(...args),
  dispatchConsentRequests: (...args: unknown[]) => mockDispatch(...args),
  retryConsentRequests: jest.fn(),
}));

import NewActorPage from './page';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockEnqueue.mockResolvedValue({
    batchId: 'b1',
    queued: 1,
    skipped: { no_email: 0, granted: 0, pending_request: 0, declined: 0 },
  });
  mockDispatch.mockResolvedValue({ sent: 1, failed: 0, remaining: 0 });
  mockUpload.mockResolvedValue({ id: 'doc-1' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NewActorPage — weak-duplicate informational dialog (FR-3)', () => {
  it('redirects to /admin/actors immediately when duplicateWarnings is empty — no dialog', async () => {
    render(<NewActorPage />);

    await screen.findByText(/simulate create \(no warnings\)/i);
    fireEvent.click(screen.getByText(/simulate create \(no warnings\)/i));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/admin/actors'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the informational dialog naming the match when duplicateWarnings is non-empty, and does not redirect yet', async () => {
    render(<NewActorPage />);

    await screen.findByText(/simulate create \(with warnings\)/i);
    fireEvent.click(screen.getByText(/simulate create \(with warnings\)/i));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('TM-2026-0013');
    expect(dialog).toHaveTextContent('Songwe Agro Ltd');
    expect(mockRouterPush).not.toHaveBeenCalled();

    // Single OK button — no choice to make (FR-3's weak scenario is never gated).
    expect(screen.getAllByRole('button', { name: /^ok$/i })).toHaveLength(1);
  });

  it('OK redirects to /admin/actors', async () => {
    render(<NewActorPage />);

    await screen.findByText(/simulate create \(with warnings\)/i);
    fireEvent.click(screen.getByText(/simulate create \(with warnings\)/i));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/admin/actors'));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  // W-8 (NFR-4) — announced via aria-live; focus starts on OK; Escape acts as OK.
  it('announces the match count via a polite live region', async () => {
    render(<NewActorPage />);

    await screen.findByText(/simulate create \(with warnings\)/i);
    fireEvent.click(screen.getByText(/simulate create \(with warnings\)/i));

    await screen.findByRole('dialog');
    const liveRegion = screen.getByText(/1 similar actor found/i);
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('focuses the OK button on open', async () => {
    render(<NewActorPage />);

    await screen.findByText(/simulate create \(with warnings\)/i);
    fireEvent.click(screen.getByText(/simulate create \(with warnings\)/i));

    const okButton = await screen.findByRole('button', { name: /^ok$/i });
    await waitFor(() => expect(okButton).toHaveFocus());
  });

  it('Escape acts as OK — redirects and closes the dialog', async () => {
    render(<NewActorPage />);

    await screen.findByText(/simulate create \(with warnings\)/i);
    fireEvent.click(screen.getByText(/simulate create \(with warnings\)/i));

    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/admin/actors'));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });
});

describe('NewActorPage — SendConsentPrompt (FR-3, T-10)', () => {
  async function create(label: RegExp) {
    render(<NewActorPage />);
    fireEvent.click(await screen.findByText(label));
    return screen.findByRole('dialog');
  }

  it('a GRANTED create shows no send question and navigates as today', async () => {
    render(<NewActorPage />);
    fireEvent.click(await screen.findByText(/simulate create \(granted\)$/i));
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/admin/actors'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a GRANTED create with warnings shows the warnings alone, no send question', async () => {
    const dialog = await create(/simulate create \(granted, warnings\)/i);
    expect(dialog).toHaveTextContent('Songwe Agro Ltd');
    expect(dialog).not.toHaveTextContent(/send a consent request/i);
    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument();
  });

  it('shows the warnings and the send question in ONE dialog, defaulting focus to Send', async () => {
    const dialog = await create(/simulate create \(unknown, email, warnings\)/i);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog).toHaveTextContent('Songwe Agro Ltd');
    expect(dialog).toHaveTextContent('Send a consent request to kilimo@example.com?');
    await waitFor(() => expect(screen.getByRole('button', { name: /^send$/i })).toHaveFocus());
  });

  it('Not now sends nothing and navigates', async () => {
    await create(/simulate create \(unknown, email\)$/i);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/admin/actors'));
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('Send enqueues scope single with exactly the created id, dispatches, then navigates', async () => {
    await create(/simulate create \(unknown, email\)$/i);
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/admin/actors'));
    expect(mockEnqueue).toHaveBeenCalledWith(
      { target: { kind: 'ids', ids: ['actor-new-003'] }, scope: 'single' },
      'test-access-token',
    );
    expect(mockDispatch).toHaveBeenCalledWith({ batchId: 'b1' }, 'test-access-token');
  });

  it('does not navigate when the dispatch step reports a failure; offers Continue', async () => {
    mockDispatch.mockResolvedValue({ sent: 0, failed: 1, remaining: 0 });
    await create(/simulate create \(unknown, email\)$/i);
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(await screen.findByRole('button', { name: /continue to actors/i })).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

describe('NewActorPage — the optional consent document (FR-15, T-11)', () => {
  it('uploads the held file for the CREATED actor, BEFORE the send prompt appears', async () => {
    let finishUpload: (v: unknown) => void = () => undefined;
    mockUpload.mockReturnValue(new Promise((resolve) => (finishUpload = resolve)));
    render(<NewActorPage />);

    fireEvent.click(await screen.findByText(/simulate create \(unknown, email, document\)/i));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith('actor-new-003', DOCUMENT_FILE, 'test-access-token'));
    // Still uploading: no prompt yet, no navigation, and the status is announced.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Uploading');
    expect(mockRouterPush).not.toHaveBeenCalled();

    finishUpload({ id: 'doc-1' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Send a consent request to kilimo@example.com?');
    expect(dialog).not.toHaveTextContent(/not attached/i);
  });

  it('a GRANTED create with a document uploads, then navigates as today', async () => {
    render(<NewActorPage />);
    fireEvent.click(await screen.findByText(/simulate create \(granted, document\)/i));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/admin/actors'));
    expect(mockUpload).toHaveBeenCalledWith('actor-new-005', DOCUMENT_FILE, 'test-access-token');
  });

  it('attempts no upload when no document was chosen', async () => {
    render(<NewActorPage />);
    fireEvent.click(await screen.findByText(/simulate create \(unknown, email\)$/i));
    await screen.findByRole('dialog');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('when the upload fails the actor still exists: says the document was not attached, and does not navigate away silently', async () => {
    mockUpload.mockRejectedValue(new Error('storage down'));
    render(<NewActorPage />);

    fireEvent.click(await screen.findByText(/simulate create \(granted, document\)/i));

    const dialog = await screen.findByRole('dialog');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The actor was created, but the document was not attached. Attach it from the actor page.',
    );
    expect(dialog).toHaveTextContent('TM-2026-0014');
    expect(mockRouterPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/admin/actors'));
  });

  it('a failed upload still offers the consent send question, alongside the notice', async () => {
    mockUpload.mockRejectedValue(new Error('storage down'));
    render(<NewActorPage />);

    fireEvent.click(await screen.findByText(/simulate create \(unknown, email, document\)/i));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('document was not attached');
    expect(dialog).toHaveTextContent('Send a consent request to kilimo@example.com?');
  });
});
