// @sdd-spec admin/actor-crud-audit (T-9)
// @sdd-spec actors/registration-source-and-consent (T-8)
/**
 * Unit tests for ActorsTable.
 *
 * Covers:
 *   - Edit link href per actor
 *   - Delete typed-confirm flow calls deleteActor and onDelete callback
 *   - Selection checkboxes still toggle/onToggleAll and surface selected count
 *   - Cancel does not call deleteActor/onDelete
 *   - T-8: Source column (chip), Consent column (status chip + method
 *     caption), the FR-9 unevidenced-grant warning treatment, mobile-card
 *     parity, and jest-axe (NFR-5).
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
import { axe, toHaveNoViolations } from 'jest-axe';

import { ActorsTable } from './ActorsTable';
import type { AdminActor } from '@/lib/api/actors-admin';

// Extend jest-dom expect with the jest-axe matcher (NFR-5).
expect.extend(toHaveNoViolations);

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
  // T-8: evidenced grant — a recorded method, so no warning treatment.
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
  // T-8: self-registered, never granted — no provenance expected yet.
  registrationSource: 'SELF_REGISTERED',
  consentMethod: 'NOT_RECORDED',
  consentObtainedAt: null,
  consentReference: null,
  crops: ['common bean'],
  createdAt: '2024-02-01T00:00:00.000Z',
  updatedAt: '2024-02-01T00:00:00.000Z',
};

/**
 * T-8 / FR-9 — the legacy, unevidenced-grant case: `consentStatus: GRANTED`
 * with `consentMethod: NOT_RECORDED`. The migration deliberately leaves rows
 * like this one behind; the table must flag it (warning caption) rather than
 * rendering it identically to a normal `NOT_RECORDED` row.
 */
const ACTOR_UNEVIDENCED: AdminActor = {
  id: 'actor-3',
  traderId: 'TZ-003',
  traderName: 'Legacy Traders',
  region: 'Mwanza',
  district: null,
  traderType: 'informal_trader',
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
  consentStatus: 'GRANTED',
  registrationSource: 'TEAM_MANAGED',
  consentMethod: 'NOT_RECORDED',
  consentObtainedAt: null,
  consentReference: null,
  crops: [],
  createdAt: '2023-01-01T00:00:00.000Z',
  updatedAt: '2023-01-01T00:00:00.000Z',
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

// ---------------------------------------------------------------------------
// Source column (T-8, FR-1)
// ---------------------------------------------------------------------------

describe('ActorsTable — Source column', () => {
  it('renders a "Source" column header', () => {
    renderTable();

    expect(
      within(getTable()).getByRole('columnheader', { name: /source/i }),
    ).toBeInTheDocument();
  });

  it('labels a TEAM_MANAGED actor "Team-managed"', () => {
    renderTable({ actors: [ACTOR_A] });

    expect(within(getTable()).getByText('Team-managed')).toBeInTheDocument();
  });

  it('labels a SELF_REGISTERED actor "Self-registered"', () => {
    renderTable({ actors: [ACTOR_B] });

    expect(within(getTable()).getByText('Self-registered')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Consent column — status chip + method caption (T-8, FR-2/FR-9)
// ---------------------------------------------------------------------------

describe('ActorsTable — Consent column (status + method caption)', () => {
  it('renders the status chip and the method caption together', () => {
    renderTable({ actors: [ACTOR_A] });

    const table = getTable();
    expect(within(table).getByText('Published')).toBeInTheDocument();
    expect(within(table).getByText('Signed form')).toBeInTheDocument();
  });

  it('shows "Not recorded" for a NOT_RECORDED, non-granted actor without warning styling', () => {
    renderTable({ actors: [ACTOR_B] });

    const caption = within(getTable()).getByText('Not recorded');
    expect(caption).toBeInTheDocument();
    expect(caption).toHaveClass('text-muted');
    expect(caption).not.toHaveClass('text-warning');
  });

  it('flags a legacy GRANTED + NOT_RECORDED actor with the warning token (FR-9)', () => {
    renderTable({ actors: [ACTOR_UNEVIDENCED] });

    const table = getTable();
    expect(within(table).getByText('Published')).toBeInTheDocument();
    const caption = within(table).getByText('Not recorded — no evidence');
    expect(caption).toHaveClass('text-warning');
    expect(caption).not.toHaveClass('text-muted');
  });

  it('renders every consent-method label from the backend enum', () => {
    const methods: AdminActor['consentMethod'][] = [
      'NOT_RECORDED',
      'PORTAL_CHECKBOX',
      'SIGNED_FORM',
      'EMAIL',
      'VERBAL_FIELD',
    ];
    const labels = ['Not recorded', 'Portal checkbox', 'Signed form', 'Email', 'Verbal (field)'];

    methods.forEach((method, i) => {
      // Matched by prefix, not exact text: ACTOR_A is GRANTED, so the
      // NOT_RECORDED iteration renders the FR-9-flagged, qualifier-suffixed
      // caption ("Not recorded — no evidence") rather than the bare label.
      const { unmount } = render(
        <ActorsTable
          actors={[{ ...ACTOR_A, consentMethod: method }]}
          selectedIds={new Set()}
          onToggle={jest.fn()}
          onToggleAll={jest.fn()}
          token={TOKEN}
          onDelete={jest.fn()}
        />,
      );
      expect(
        screen.getAllByText((text) => text.startsWith(labels[i])).length,
      ).toBeGreaterThan(0);
      unmount();
    });
  });

  it('differentiates the flagged caption by text, not just color (WCAG 1.4.1, FR-9 fold-in)', () => {
    // GRANTED + NOT_RECORDED (flagged) vs DENIED + NOT_RECORDED (not flagged)
    // must be distinguishable by their text alone, independent of the
    // warning/muted color token.
    renderTable({ actors: [ACTOR_UNEVIDENCED, ACTOR_B] });

    const table = getTable();
    expect(within(table).getByText('Not recorded — no evidence')).toBeInTheDocument();
    expect(within(table).getByText('Not recorded')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sticky first column (T-8 scope correction, FR-6 small-screen scenario)
//
// jsdom does not run layout and resolves no CSS custom properties, so it
// cannot prove anything actually *sticks* to the viewport during a real
// horizontal scroll, nor that the opaque background truly occludes the
// columns scrolling underneath. What it *can* prove — and what these tests
// assert — is that the `sticky` positioning class and a same-column `left-*`
// offset are present on both the header and body cells for the checkbox and
// Trader columns, so a regression that strips those classes fails here.
// ---------------------------------------------------------------------------

describe('ActorsTable — sticky first column (FR-6)', () => {
  it('makes the select-all checkbox header cell sticky at the left edge, w-12 wide', () => {
    renderTable();

    // Asserted together, not just `left-0`: `w-12` on this cell and
    // `left-12` on the Trader cell (below) must stay the same physical
    // distance for the two sticky columns to sit flush with no gap or
    // overlap. This pair of assertions is the test-level backstop for that
    // coupling — Tailwind's static class extraction rules out deriving one
    // from the other at runtime (see the doc comment above the STICKY_*
    // constants in ActorsTable.tsx).
    const checkboxHeaderCell = screen
      .getByRole('checkbox', { name: /select all actors/i })
      .closest('th');
    expect(checkboxHeaderCell).toHaveClass('sticky', 'left-0', 'w-12');
  });

  it('makes the Trader header cell sticky, offset past the checkbox column', () => {
    renderTable();

    const traderHeaderCell = within(getTable()).getByRole('columnheader', { name: /trader/i });
    expect(traderHeaderCell).toHaveClass('sticky', 'left-12');
  });

  it('makes a row checkbox and Trader cell sticky at matching offsets', () => {
    renderTable({ actors: [ACTOR_A] });

    // The mobile card renders its own "Select Meru Agro" checkbox with the
    // same accessible name, so scope to the table (both render in jsdom
    // regardless of the `md:hidden` / `hidden md:block` breakpoint classes).
    const rowCheckboxCell = within(getTable())
      .getByRole('checkbox', { name: /select meru agro/i })
      .closest('td');
    expect(rowCheckboxCell).toHaveClass('sticky', 'left-0', 'w-12');

    const traderCell = within(getTable()).getByText('Meru Agro').closest('td');
    expect(traderCell).toHaveClass('sticky', 'left-12');
  });

  it('does not make any other column sticky', () => {
    renderTable({ actors: [ACTOR_A] });

    const regionCell = within(getTable()).getByText('Arusha').closest('td');
    expect(regionCell).not.toHaveClass('sticky');
  });

  it('leaves the mobile card list unaffected (no sticky classes below md)', () => {
    renderTable({ actors: [ACTOR_A] });

    const card = screen.getByLabelText('Meru Agro');
    expect(card.querySelector('.sticky')).toBeNull();
  });

  it('caps the sticky Trader name width via an inner span, not the td, and sets title', () => {
    // A realistic long registry name (a cooperative's full legal name) must
    // not be allowed to eat the horizontal-scroll budget: at exactly `md`
    // the scroll container is only ~494px wide (sidebar + main padding
    // subtracted from a 768px viewport), and an unbounded Trader cell can
    // consume most of that on its own, defeating the point of this task.
    //
    // The clamp must live on an inner block-level `<span>`, not the `<td>`
    // itself: under `nowrap` (which `truncate` sets), a cell's min-content
    // width equals its max-content width, so `max-width` on the `<td>` is
    // floored out by the full unwrapped string and never actually clamps
    // anything. A non-table block child's min-content *contribution* is
    // clamped by its own `max-width`, which is what makes the column (and
    // therefore the ellipsis) genuinely resolve to the capped width.
    const longName = 'Mtandao wa Vikundi vya Wakulima wa Mtama na Choroko Kaskazini';
    renderTable({ actors: [{ ...ACTOR_A, traderName: longName }] });

    const nameSpan = within(getTable()).getByText(longName);
    expect(nameSpan.tagName).toBe('SPAN');
    expect(nameSpan).toHaveClass('block', 'max-w-xs', 'truncate');

    // `title` sits on the `<td>` so the tooltip covers the whole cell, not
    // just the clamped span.
    const traderCell = nameSpan.closest('td');
    expect(traderCell).toHaveAttribute('title', longName);
  });

  it('fades the sticky cells’ hover repaint in step with the rest of the row', () => {
    renderTable({ actors: [ACTOR_A] });

    const rowCheckboxCell = within(getTable())
      .getByRole('checkbox', { name: /select meru agro/i })
      .closest('td');
    const traderCell = within(getTable()).getByText('Meru Agro').closest('td');

    expect(rowCheckboxCell).toHaveClass('transition-colors');
    expect(traderCell).toHaveClass('transition-colors');
  });
});

// ---------------------------------------------------------------------------
// Mobile card parity (T-8) — new fields must not be dropped below `md`
// ---------------------------------------------------------------------------

describe('ActorsTable — mobile card parity', () => {
  it('renders the Source badge and consent method caption inside the mobile card', () => {
    renderTable({ actors: [ACTOR_A] });

    const card = screen.getByLabelText('Meru Agro');
    expect(within(card).getByText('Team-managed')).toBeInTheDocument();
    expect(within(card).getByText('Signed form')).toBeInTheDocument();
  });

  it('flags the unevidenced-grant caption in the mobile card too (FR-9)', () => {
    renderTable({ actors: [ACTOR_UNEVIDENCED] });

    const card = screen.getByLabelText('Legacy Traders');
    const caption = within(card).getByText('Not recorded — no evidence');
    expect(caption).toHaveClass('text-warning');
  });
});

// ---------------------------------------------------------------------------
// Accessibility (jest-axe, NFR-5)
// ---------------------------------------------------------------------------

describe('ActorsTable — accessibility', () => {
  it('has no axe violations with the Source and Consent columns populated', async () => {
    const { container } = render(
      <ActorsTable
        actors={[ACTOR_A, ACTOR_B, ACTOR_UNEVIDENCED]}
        selectedIds={new Set([ACTOR_A.id])}
        onToggle={jest.fn()}
        onToggleAll={jest.fn()}
        token={TOKEN}
        onDelete={jest.fn()}
        onEdit={jest.fn()}
      />,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
