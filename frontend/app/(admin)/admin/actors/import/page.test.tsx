// @sdd-spec admin/actor-import (T-8)
/**
 * Unit tests for /admin/actors/import (ActorImportPage).
 *
 * Covers the full flow and its gates:
 *   - pick → preview → confirm → result (no acknowledgement)
 *   - acknowledgement dialog gates the commit when a previewed row publishes a
 *     GRANTED actor (its warning names the acknowledgement) — and NOT otherwise
 *   - template download link href
 *   - non-.xlsx / client-guard rejection surfaces inline (no result rendered)
 *   - ApiError 400 (file-level) rendered as an alert
 *   - result summary announced via a live region
 *   - auth failure on mount routes to /login
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => '/admin/actors/import',
}));

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

const mockGetSession = jest.fn();
jest.mock('@/lib/auth/auth-client', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

const mockImportActors = jest.fn();
jest.mock('@/lib/api/actors-admin', () => ({
  importActors: (...args: unknown[]) => mockImportActors(...args),
}));

jest.mock('@/lib/api/client', () => {
  class AuthFailureError extends Error {
    readonly status = 401;
    constructor(msg = 'Session expired') {
      super(msg);
      this.name = 'AuthFailureError';
    }
  }
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
  return { AuthFailureError, ApiError };
});

import ActorImportPage from './page';
import { ApiError, AuthFailureError } from '@/lib/api/client';
import type { ImportReport } from '@/lib/api/actors-admin';

// ── Fixtures ───────────────────────────────────────────────────────────────

const TOKEN = 'test-access-token';
const FAKE_SESSION = { role: 'Admin' as const, user: { name: 'Alice' }, accessToken: TOKEN };

const ACK_PHRASE = 'I confirm consent is on file';

const PREVIEW_REPORT: ImportReport = {
  mode: 'preview',
  totals: { rows: 1, toCreate: 1, created: 0, skipped: 0, failed: 0, warnings: 0 },
  rows: [{ rowNumber: 2, traderId: 'TZ-001', traderName: 'Meru Agro', outcome: 'create' }],
};

const COMMIT_REPORT: ImportReport = {
  mode: 'commit',
  totals: { rows: 1, toCreate: 1, created: 1, skipped: 0, failed: 0, warnings: 0 },
  rows: [
    { rowNumber: 2, traderId: 'TZ-001', traderName: 'Meru Agro', outcome: 'created', actorId: 'a1' },
  ],
};

const PREVIEW_REPORT_GRANTED: ImportReport = {
  mode: 'preview',
  totals: { rows: 1, toCreate: 1, created: 0, skipped: 0, failed: 0, warnings: 1 },
  rows: [
    {
      rowNumber: 2,
      traderId: 'TZ-001',
      traderName: 'Meru Agro',
      outcome: 'create',
      warnings: ['Consent is GRANTED — acknowledgement will be required to import this actor'],
    },
  ],
};

function xlsxFile(name = 'actors.xlsx'): File {
  return new File(['workbook-bytes'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Render the page and flush the getSession effect so the token is set. */
async function renderReady() {
  mockGetSession.mockResolvedValue(FAKE_SESSION);
  render(<ActorImportPage />);
  await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
}

async function selectFile(file = xlsxFile()) {
  const input = screen.getByLabelText(/excel file/i);
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  return file;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset (not just clear) so no queued once-values or implementations leak
  // between tests.
  mockImportActors.mockReset();
  mockGetSession.mockReset();
});

/** importActors resolver keyed by mode so call order never causes leaks. */
function resolveByMode(previewReport: ImportReport, commitReport: ImportReport) {
  mockImportActors.mockImplementation((_file: File, mode: 'preview' | 'commit') =>
    Promise.resolve(mode === 'commit' ? commitReport : previewReport),
  );
}

// ── Template link ────────────────────────────────────────────────────────────

describe('ActorImportPage — template', () => {
  it('renders a download link to the static template asset', async () => {
    await renderReady();
    const link = screen.getByRole('link', { name: /download template/i });
    expect(link).toHaveAttribute('href', '/templates/actor-import-template.xlsx');
    expect(link).toHaveAttribute('download');
  });
});

// ── Happy path: pick → preview → confirm → result ────────────────────────────

describe('ActorImportPage — full flow (no acknowledgement)', () => {
  it('previews on file select, then commits and shows the result summary', async () => {
    resolveByMode(PREVIEW_REPORT, COMMIT_REPORT);

    await renderReady();
    const file = await selectFile();

    // Preview requested, preview table rendered.
    await waitFor(() =>
      expect(mockImportActors).toHaveBeenNthCalledWith(1, file, 'preview', TOKEN),
    );
    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
    // Rendered in both the desktop table and the mobile card.
    expect(screen.getAllByText(/meru agro/i).length).toBeGreaterThan(0);

    // Confirm → commit directly (no dialog, no acknowledged flag).
    fireEvent.click(screen.getByRole('button', { name: /import 1 actor/i }));

    await waitFor(() =>
      expect(mockImportActors).toHaveBeenLastCalledWith(file, 'commit', TOKEN, undefined),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Result view + live-region summary.
    expect(await screen.findByText(/import complete/i)).toBeInTheDocument();
    const status = screen.getByText(/1 created, 0 skipped, 0 failed/i);
    expect(status).toBeInTheDocument();
    expect(status.closest('[aria-live="polite"]')).not.toBeNull();
  });
});

// ── Acknowledgement gating ───────────────────────────────────────────────────

describe('ActorImportPage — acknowledgement gate', () => {
  it('opens the AcknowledgeDialog and commits with acknowledged=true when a row publishes', async () => {
    resolveByMode(PREVIEW_REPORT_GRANTED, COMMIT_REPORT);

    await renderReady();
    const file = await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /import 1 actor/i }));

    // Dialog gates the commit — nothing committed yet.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(mockImportActors).toHaveBeenCalledTimes(1);

    const confirmBtn = within(dialog).getByRole('button', { name: /^import$/i });
    expect(confirmBtn).toBeDisabled();

    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: ACK_PHRASE } });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(mockImportActors).toHaveBeenLastCalledWith(file, 'commit', TOKEN, true),
    );
    expect(await screen.findByText(/import complete/i)).toBeInTheDocument();
  });

  it('does NOT open the dialog when no previewed row publishes', async () => {
    resolveByMode(PREVIEW_REPORT, COMMIT_REPORT);

    await renderReady();
    const file = await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /import 1 actor/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockImportActors).toHaveBeenLastCalledWith(file, 'commit', TOKEN, undefined),
    );
  });
});

// ── Client-side rejection (non-.xlsx) ────────────────────────────────────────

describe('ActorImportPage — file rejection', () => {
  it('surfaces the client-guard plain Error inline and renders no preview', async () => {
    mockImportActors.mockRejectedValue(
      new Error('Only .xlsx files can be imported. Please select an Excel workbook.'),
    );

    await renderReady();
    await selectFile(xlsxFile('actors.csv'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/only \.xlsx files can be imported/i);
    expect(screen.queryByText(/review and confirm/i)).not.toBeInTheDocument();
  });

  it('renders an ApiError 400 file-level rejection as an alert', async () => {
    mockImportActors.mockRejectedValue(
      new ApiError(400, 'The file has 1200 data rows; the maximum is 1000.'),
    );

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/the file could not be processed/i)).toBeInTheDocument();
    expect(screen.getByText(/1200 data rows/i)).toBeInTheDocument();
    expect(screen.queryByText(/review and confirm/i)).not.toBeInTheDocument();
  });
});

// ── File picker: hidden input + button + drag & drop + chip ──────────────────

describe('ActorImportPage — file picker', () => {
  it('drives a visually-hidden input from the styled "Select .xlsx file" button', async () => {
    await renderReady();

    const input = screen.getByLabelText(/excel file/i) as HTMLInputElement;
    // The native input is present but visually hidden (no default browser chip).
    expect(input).toHaveClass('sr-only');

    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /select \.xlsx file/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });

  it('previews a file dropped onto the drop zone (same validation path)', async () => {
    resolveByMode(PREVIEW_REPORT, COMMIT_REPORT);

    await renderReady();
    const file = xlsxFile('dropped.xlsx');
    const dropZone = screen.getByText(/drag & drop/i);

    await act(async () => {
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    });

    await waitFor(() =>
      expect(mockImportActors).toHaveBeenNthCalledWith(1, file, 'preview', TOKEN),
    );
    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
  });

  it('shows the selected file as a chip (name + size) with a replace control', async () => {
    resolveByMode(PREVIEW_REPORT, COMMIT_REPORT);

    await renderReady();
    await selectFile(xlsxFile('my-actors.xlsx'));

    // The chosen file is surfaced as a chip, not raw input text.
    expect(await screen.findByText('my-actors.xlsx')).toBeInTheDocument();

    // The replace control clears the file and returns to the drop zone.
    const replace = screen.getByRole('button', { name: /remove my-actors\.xlsx/i });
    await act(async () => {
      fireEvent.click(replace);
    });

    expect(screen.queryByText('my-actors.xlsx')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select \.xlsx file/i })).toBeInTheDocument();
  });
});

// ── Empty template (rows === 0) ──────────────────────────────────────────────

describe('ActorImportPage — empty template', () => {
  const EMPTY_REPORT: ImportReport = {
    mode: 'preview',
    totals: { rows: 0, toCreate: 0, created: 0, skipped: 0, failed: 0, warnings: 0 },
    rows: [],
  };

  it('shows a friendly notice (not empty chips/table) when the file has no data rows', async () => {
    mockImportActors.mockResolvedValue(EMPTY_REPORT);

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/the file has no data rows/i)).toBeInTheDocument();
    // No preview table and no dead confirm button.
    expect(screen.queryByRole('table', { name: /import rows/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import 0 actor/i })).not.toBeInTheDocument();
  });
});

// ── Generic (non-400) server failure ─────────────────────────────────────────

describe('ActorImportPage — generic failure', () => {
  it('shows a friendly fallback (not the raw server message) for a 5xx ApiError', async () => {
    mockImportActors.mockRejectedValue(new ApiError(500, 'Internal server error'));

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/something went wrong processing the file/i)).toBeInTheDocument();
    // The raw passthrough message must not leak to the Admin.
    expect(screen.queryByText(/internal server error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/review and confirm/i)).not.toBeInTheDocument();
  });
});

// ── Auth failure ─────────────────────────────────────────────────────────────

describe('ActorImportPage — auth failure', () => {
  it('routes to /login when there is no session on mount', async () => {
    mockGetSession.mockResolvedValue(null);
    render(<ActorImportPage />);
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login'));
  });

  it('routes to /login when the preview call fails auth', async () => {
    mockImportActors.mockRejectedValue(new AuthFailureError());
    await renderReady();
    await selectFile();
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login'));
  });
});
