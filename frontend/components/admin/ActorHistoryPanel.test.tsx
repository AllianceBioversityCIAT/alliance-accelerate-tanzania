// @sdd-spec admin/actor-crud-audit (T-10)
/**
 * Unit tests for ActorHistoryPanel.
 *
 * Covers:
 *   - diff entries render each changed field as "from → to"
 *   - snapshot entries render a summary and expand to show full values
 *   - empty state renders "No changes recorded"
 *   - "Load more" fetches the next page and appends entries
 *   - error state renders the message and offers a retry
 *   - actingEmail falls back to actingSub when null
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetActorHistory = jest.fn();

jest.mock('@/lib/api/actors-admin', () => ({
  getActorHistory: (...args: unknown[]) => mockGetActorHistory(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import { ActorHistoryPanel } from './ActorHistoryPanel';
import type { AuditEntry, ActorHistoryList } from '@/lib/api/actors-admin';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTOR_ID = 'actor-cuid-001';
const TOKEN = 'test-access-token';

const UPDATE_ENTRY: AuditEntry = {
  id: 'audit-002',
  actorId: ACTOR_ID,
  traderId: 'T-001',
  traderName: 'Mbeya Seeds Ltd',
  action: 'UPDATE',
  actingSub: 'cognito-sub-002',
  actingEmail: 'editor@example.com',
  changes: {
    kind: 'diff',
    fields: {
      phone: { from: '+255000000000', to: '+255123456789' },
      region: { from: 'Mbeya', to: 'Songwe' },
      crops: { from: ['sorghum'], to: ['sorghum', 'groundnut'] },
    },
  },
  acknowledged: null,
  createdAt: '2024-06-02T10:30:00.000Z',
};

const CREATE_ENTRY: AuditEntry = {
  id: 'audit-001',
  actorId: ACTOR_ID,
  traderId: 'T-001',
  traderName: 'Mbeya Seeds Ltd',
  action: 'CREATE',
  actingSub: 'cognito-sub-001',
  actingEmail: 'creator@example.com',
  changes: {
    kind: 'snapshot',
    values: {
      traderId: 'T-001',
      traderName: 'Mbeya Seeds Ltd',
      region: 'Mbeya',
      crops: ['sorghum'],
    },
  },
  acknowledged: null,
  createdAt: '2024-06-01T09:00:00.000Z',
};

const DELETE_ENTRY: AuditEntry = {
  id: 'audit-003',
  actorId: ACTOR_ID,
  traderId: 'T-001',
  traderName: 'Mbeya Seeds Ltd',
  action: 'DELETE',
  actingSub: 'cognito-sub-003',
  actingEmail: null,
  changes: {
    kind: 'snapshot',
    values: {
      traderId: 'T-001',
      traderName: 'Mbeya Seeds Ltd',
      region: 'Songwe',
    },
  },
  acknowledged: null,
  createdAt: '2024-06-03T14:00:00.000Z',
};

const HISTORY_PAGE_1: ActorHistoryList = {
  data: [UPDATE_ENTRY, CREATE_ENTRY],
  page: 1,
  pageSize: 20,
  total: 3,
};

const HISTORY_PAGE_2: ActorHistoryList = {
  data: [DELETE_ENTRY],
  page: 2,
  pageSize: 20,
  total: 3,
};

const EMPTY_HISTORY: ActorHistoryList = {
  data: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPanel(props: Partial<React.ComponentProps<typeof ActorHistoryPanel>> = {}) {
  return render(<ActorHistoryPanel actorId={ACTOR_ID} token={TOKEN} {...props} />);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('ActorHistoryPanel — loading', () => {
  it('shows a loading state while the first page loads', () => {
    mockGetActorHistory.mockReturnValue(new Promise(() => {}));
    renderPanel();

    expect(screen.getByText('History')).toBeInTheDocument();
    // The live region announces the loading state.
    expect(screen.getByText('Loading history.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Diff rendering
// ---------------------------------------------------------------------------

describe('ActorHistoryPanel — diff entries', () => {
  it('renders each changed field as "field: from → to"', async () => {
    mockGetActorHistory.mockResolvedValue({
      data: [UPDATE_ENTRY],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    renderPanel();

    await waitFor(() => expect(screen.getByText('editor@example.com')).toBeInTheDocument());

    const entry = screen.getByRole('listitem');
    expect(within(entry).getByText('UPDATE')).toBeInTheDocument();

    // Field labels
    expect(within(entry).getByText('phone')).toBeInTheDocument();
    expect(within(entry).getByText('region')).toBeInTheDocument();
    expect(within(entry).getByText('crops')).toBeInTheDocument();

    // From / to values
    expect(within(entry).getByText('+255000000000')).toBeInTheDocument();
    expect(within(entry).getByText('+255123456789')).toBeInTheDocument();
    expect(within(entry).getByText('Mbeya')).toBeInTheDocument();
    expect(within(entry).getByText('Songwe')).toBeInTheDocument();
    expect(within(entry).getByText('sorghum')).toBeInTheDocument();
    expect(within(entry).getByText('sorghum, groundnut')).toBeInTheDocument();
  });

  it('renders a null "from" value as an em dash', async () => {
    const entryWithNull: AuditEntry = {
      ...UPDATE_ENTRY,
      changes: {
        kind: 'diff',
        fields: {
          email: { from: null, to: 'info@example.com' },
        },
      },
    };

    mockGetActorHistory.mockResolvedValue({
      data: [entryWithNull],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    renderPanel();

    await waitFor(() => expect(screen.getByRole('listitem')).toBeInTheDocument());

    const items = screen.getAllByText('—');
    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Snapshot rendering
// ---------------------------------------------------------------------------

describe('ActorHistoryPanel — snapshot entries', () => {
  it('renders a CREATE summary and expands to show fields', async () => {
    mockGetActorHistory.mockResolvedValue({
      data: [CREATE_ENTRY],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    renderPanel();

    await waitFor(() => expect(screen.getByRole('listitem')).toBeInTheDocument());

    const entry = screen.getByRole('listitem');
    const expandBtn = within(entry).getByRole('button', { name: /created with \d+ fields/i });
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(expandBtn);

    expect(expandBtn).toHaveAttribute('aria-expanded', 'true');
    expect(within(entry).getByText('traderId')).toBeInTheDocument();
    expect(within(entry).getByText('T-001')).toBeInTheDocument();
    expect(within(entry).getByText('traderName')).toBeInTheDocument();
    expect(within(entry).getByText('Mbeya Seeds Ltd')).toBeInTheDocument();
  });

  it('renders a DELETE summary', async () => {
    mockGetActorHistory.mockResolvedValue({
      data: [DELETE_ENTRY],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    renderPanel();

    await waitFor(() => expect(screen.getByRole('listitem')).toBeInTheDocument());

    const entry = screen.getByRole('listitem');
    expect(within(entry).getByText('Deleted — final snapshot')).toBeInTheDocument();
    expect(within(entry).getByText('DELETE')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('ActorHistoryPanel — empty state', () => {
  it('renders "No changes recorded" when history is empty', async () => {
    mockGetActorHistory.mockResolvedValue(EMPTY_HISTORY);
    renderPanel();

    await waitFor(() => expect(screen.getByText('No changes recorded')).toBeInTheDocument());
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Load more pagination
// ---------------------------------------------------------------------------

describe('ActorHistoryPanel — pagination', () => {
  it('appends the next page when "Load more" is clicked', async () => {
    mockGetActorHistory
      .mockResolvedValueOnce(HISTORY_PAGE_1)
      .mockResolvedValueOnce(HISTORY_PAGE_2);

    renderPanel();

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

    const loadMoreBtn = screen.getByRole('button', { name: /load more/i });
    expect(loadMoreBtn).toBeInTheDocument();

    fireEvent.click(loadMoreBtn);

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    expect(mockGetActorHistory).toHaveBeenCalledTimes(2);
    expect(mockGetActorHistory).toHaveBeenLastCalledWith(
      ACTOR_ID,
      { page: 2, pageSize: 20 },
      TOKEN,
    );

    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('hides "Load more" when the first page contains all entries', async () => {
    mockGetActorHistory.mockResolvedValue({
      data: [CREATE_ENTRY],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    renderPanel();

    await waitFor(() => expect(screen.getByRole('listitem')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('ActorHistoryPanel — error state', () => {
  it('renders an error message and retries on button click', async () => {
    mockGetActorHistory
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce({
        data: [CREATE_ENTRY],
        page: 1,
        pageSize: 20,
        total: 1,
      });

    renderPanel();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/network failure/i));

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByRole('listitem')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockGetActorHistory).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Acting identity fallback
// ---------------------------------------------------------------------------

describe('ActorHistoryPanel — identity fallback', () => {
  it('shows actingSub when actingEmail is null', async () => {
    mockGetActorHistory.mockResolvedValue({
      data: [DELETE_ENTRY],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    renderPanel();

    await waitFor(() => expect(screen.getByText(DELETE_ENTRY.actingSub)).toBeInTheDocument());
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Audit-action taxonomy totality (FR-16 / T-15)
//
// `actionBadgeClasses` must be a TOTAL Record<AuditEntry['action'], string> —
// every member of the eight-member union renders a real, styled badge class.
// Before T-15, the union only declared five members and the badge classifier
// was a `switch` with no `default`, so an unlisted action (e.g. the
// already-shipped `IMPORT`) fell through with no matching case and the
// function implicitly returned `undefined`. NOTE (KZ-008 re-resolution
// against the artefact): design.md §9's DD-21 row describes this as the call
// site's `.join(' ')` turning that `undefined` into the *literal string*
// "undefined" in `className` — that is not what `Array.prototype.join`
// does. Per spec, `join` converts `null`/`undefined` elements to the empty
// string, so the observable defect is an *unstyled* badge (missing its
// `bg-…`/`text-…` classes, base layout classes still present), not a
// className containing the text "undefined". The assertion below targets
// the actual defect (no `bg-` token class present) rather than the
// mis-described one. These entries are typed as `AuditEntry['action']`
// deliberately, even though today's narrower declaration only has five
// members — SWC (`next/jest`) does not type-check, so this test exercises
// the *runtime* classifier gap that `tsc --noEmit` cannot (design.md §7.5).
// ---------------------------------------------------------------------------

describe('ActorHistoryPanel — audit-action taxonomy totality (FR-16)', () => {
  const ALL_EIGHT_ACTIONS: AuditEntry['action'][] = [
    'CREATE',
    'UPDATE',
    'DELETE',
    'BULK_CONSENT',
    'BULK_DELETE',
    'IMPORT',
    'REGISTRATION_APPROVE',
    'REGISTRATION_REJECT',
  ];

  it('assigns a real, non-empty badge class to every action in the union — including IMPORT and the two registration actions', async () => {
    const entries: AuditEntry[] = ALL_EIGHT_ACTIONS.map((action, index) => ({
      id: `audit-total-${index}`,
      actorId: ACTOR_ID,
      traderId: 'T-001',
      traderName: 'Mbeya Seeds Ltd',
      action,
      actingSub: `cognito-sub-total-${index}`,
      actingEmail: null,
      changes: { kind: 'snapshot', values: { region: 'Mbeya' } },
      acknowledged: null,
      createdAt: '2024-06-05T00:00:00.000Z',
    }));

    mockGetActorHistory.mockResolvedValue({
      data: entries,
      page: 1,
      pageSize: 20,
      total: entries.length,
    });
    renderPanel();

    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(entries.length),
    );

    for (const action of ALL_EIGHT_ACTIONS) {
      const label = action.replace(/_/g, ' ');
      const badge = screen.getByText(label);
      // The pre-T-15 `switch` with no `default` returns `undefined` for an
      // unlisted action; `Array.prototype.join` drops it as an empty
      // string, so the badge keeps its base layout classes but loses its
      // color token classes entirely — no `bg-` class survives (DD-21).
      expect(badge.className).toMatch(/\bbg-\S+/);
    }
  });

  it('gives REGISTRATION_APPROVE a real snapshot summary, not the generic "Snapshot" fallback', async () => {
    const entry: AuditEntry = {
      id: 'audit-registration-approve',
      actorId: ACTOR_ID,
      traderId: 'T-001',
      traderName: 'Mbeya Seeds Ltd',
      action: 'REGISTRATION_APPROVE',
      actingSub: 'cognito-sub-approve',
      actingEmail: 'reviewer@example.com',
      changes: { kind: 'snapshot', values: { region: 'Mbeya' } },
      acknowledged: null,
      createdAt: '2024-06-06T00:00:00.000Z',
    };

    mockGetActorHistory.mockResolvedValue({
      data: [entry],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    renderPanel();

    await waitFor(() => expect(screen.getByRole('listitem')).toBeInTheDocument());

    expect(
      screen.queryByRole('button', { name: 'Snapshot' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /approved/i }),
    ).toBeInTheDocument();
  });
});
