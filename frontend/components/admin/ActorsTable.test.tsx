// @sdd-spec admin/actor-crud-audit (T-9)
/**
 * Unit tests for ActorsTable.
 *
 * Covers:
 *   - Edit link href per actor
 *   - Delete typed-confirm flow calls deleteActor and onDelete callback
 *   - Selection checkboxes still toggle/onToggleAll and surface selected count
 *   - Cancel does not call deleteActor/onDelete
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDeleteActor = jest.fn();

jest.mock('@/lib/api/actors-admin', () => ({
  deleteActor: (...args: unknown[]) => mockDeleteActor(...args),
}));

jest.mock('@/lib/api/client', () => ({
  AuthFailureError: class AuthFailureError extends Error {
    readonly status = 401;
    constructor(msg = 'Session expired') {
      super(msg);
      this.name = 'AuthFailureError';
    }
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/admin/actors',
}));

// Prevent jsdom from attempting real navigation when the Edit link is clicked.
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
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import { ActorsTable } from './ActorsTable';
import type { AdminActor } from '@/lib/api/actors-admin';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'test-access-token';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTable() {
  // The component renders both a desktop table and mobile cards; jsdom does not
  // hide responsive classes, so scope table queries to the real <table>.
  return screen.getByRole('table', { name: /actors/i });
}

function renderTable(props: Partial<React.ComponentProps<typeof ActorsTable>> = {}) {
  const onToggle = jest.fn();
  const onToggleAll = jest.fn();
  const onDelete = jest.fn();
  const onEdit = jest.fn();
  const onAuthFailure = jest.fn();

  render(
    <ActorsTable
      actors={[ACTOR_A, ACTOR_B]}
      selectedIds={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      token={TOKEN}
      onDelete={onDelete}
      onEdit={onEdit}
      onAuthFailure={onAuthFailure}
      {...props}
    />,
  );

  return { onToggle, onToggleAll, onDelete, onEdit, onAuthFailure };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering / edit link
// ---------------------------------------------------------------------------

describe('ActorsTable — rendering', () => {
  it('renders an Edit link for each actor with the correct href', () => {
    renderTable();

    const table = getTable();
    const editA = within(table).getByRole('link', { name: /edit meru agro/i });
    const editB = within(table).getByRole('link', { name: /edit kilimo co/i });

    expect(editA).toHaveAttribute('href', '/admin/actors/edit?id=actor-1');
    expect(editB).toHaveAttribute('href', '/admin/actors/edit?id=actor-2');
  });

  it('calls onEdit when the Edit link is clicked', () => {
    const { onEdit } = renderTable();

    fireEvent.click(within(getTable()).getByRole('link', { name: /edit meru agro/i }));

    expect(onEdit).toHaveBeenCalledWith(ACTOR_A);
  });

  it('shows the selected count when rows are selected', () => {
    renderTable({ selectedIds: new Set([ACTOR_A.id]) });

    expect(screen.getByText(/1 actor selected/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Selection behaviour
// ---------------------------------------------------------------------------

describe('ActorsTable — selection', () => {
  it('calls onToggle when a row checkbox is clicked', () => {
    const { onToggle } = renderTable();

    fireEvent.click(within(getTable()).getByRole('checkbox', { name: /select meru agro/i }));

    expect(onToggle).toHaveBeenCalledWith(ACTOR_A.id);
  });

  it('calls onToggleAll when the select-all checkbox is clicked', () => {
    const { onToggleAll } = renderTable();

    fireEvent.click(within(getTable()).getByRole('checkbox', { name: /select all actors on this page/i }));

    expect(onToggleAll).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Delete flow
// ---------------------------------------------------------------------------

describe('ActorsTable — row delete flow', () => {
  it('opens a typed ConfirmDialog and calls deleteActor + onDelete when confirmed', async () => {
    mockDeleteActor.mockResolvedValue({ deleted: true, id: ACTOR_A.id });
    const { onDelete } = renderTable();

    fireEvent.click(within(getTable()).getByRole('button', { name: /delete meru agro/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /delete meru agro/i })).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: /^delete$/i });
    expect(confirmBtn).toBeDisabled();

    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: 'delete Meru Agro' } });

    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mockDeleteActor).toHaveBeenCalledWith(ACTOR_A.id, TOKEN));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(ACTOR_A));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not call deleteActor or onDelete when the dialog is cancelled', async () => {
    mockDeleteActor.mockResolvedValue({ deleted: true, id: ACTOR_A.id });
    const { onDelete } = renderTable();

    fireEvent.click(within(getTable()).getByRole('button', { name: /delete meru agro/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(mockDeleteActor).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and shows an error when deleteActor fails', async () => {
    mockDeleteActor.mockRejectedValue(new Error('Network failure'));

    renderTable();

    fireEvent.click(within(getTable()).getByRole('button', { name: /delete meru agro/i }));

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: 'delete Meru Agro' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(/network failure/i),
    );

    expect(mockDeleteActor).toHaveBeenCalledWith(ACTOR_A.id, TOKEN);
    expect(dialog).toBeInTheDocument();
  });
});
