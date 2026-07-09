// @sdd-spec admin/actor-crud-audit (T-10)
'use client';

/**
 * ActorHistoryPanel — per-actor audit history (FR-10).
 *
 * Fetches and renders the paginated audit log for a single actor. Each entry
 * shows the action badge, acting admin (email with sub fallback), timestamp,
 * and the change detail: field-level "from → to" diffs for updates, or an
 * expandable snapshot summary for create/delete. Supports "load more"
 * pagination and loading/empty/error states.
 *
 * Accessibility (WCAG 2.1 AA / system-design §10):
 *   - History list uses role="list" / role="listitem".
 *   - Status changes are announced via aria-live="polite".
 *   - Errors use role="alert".
 *   - Interactive controls have visible focus rings.
 *   - Snapshot expand/collapse exposes aria-expanded.
 *
 * Tokens only; no hardcoded colors/geometry.
 */

import { useCallback, useEffect, useState } from 'react';

import { getActorHistory, type AuditEntry } from '@/lib/api/actors-admin';
import Skeleton from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActorHistoryPanelProps {
  /** Actor id whose history to display. */
  actorId: string;
  /** Cognito access token for the history API call. */
  token: string;
}

interface DiffChanges {
  kind: 'diff';
  fields: Record<string, { from: unknown; to: unknown }>;
}

interface SnapshotChanges {
  kind: 'snapshot';
  values: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDiff(changes: unknown): changes is DiffChanges {
  return (
    typeof changes === 'object' &&
    changes !== null &&
    (changes as DiffChanges).kind === 'diff' &&
    typeof (changes as DiffChanges).fields === 'object'
  );
}

function isSnapshot(changes: unknown): changes is SnapshotChanges {
  return (
    typeof changes === 'object' &&
    changes !== null &&
    (changes as SnapshotChanges).kind === 'snapshot' &&
    typeof (changes as SnapshotChanges).values === 'object'
  );
}

function actionBadgeClasses(action: AuditEntry['action']): string {
  switch (action) {
    case 'CREATE':
      return 'bg-highlight-tint text-success';
    case 'UPDATE':
      return 'bg-primary-soft text-primary';
    case 'DELETE':
    case 'BULK_DELETE':
      return 'bg-danger-soft text-danger';
    case 'BULK_CONSENT':
      return 'bg-surface-alt text-warning';
  }
}

function actionLabel(action: AuditEntry['action']): string {
  return action.replace(/_/g, ' ');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ');
  return String(value);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionBadge({ action }: { action: AuditEntry['action'] }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        actionBadgeClasses(action),
      ].join(' ')}
    >
      {actionLabel(action)}
    </span>
  );
}

function DiffDetails({ changes }: { changes: DiffChanges }) {
  const fields = Object.entries(changes.fields);

  return (
    <dl className="mt-2 space-y-1">
      {fields.map(([field, delta]) => (
        <div key={field} className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 text-sm">
          <dt className="font-medium text-muted">{field}</dt>
          <dd className="text-fg">
            <span className="text-muted">{formatValue(delta.from)}</span>
            <span className="mx-1 text-muted" aria-hidden="true">
              →
            </span>
            <span className="font-medium">{formatValue(delta.to)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SnapshotDetails({
  changes,
  action,
}: {
  changes: SnapshotChanges;
  action: AuditEntry['action'];
}) {
  const [expanded, setExpanded] = useState(false);
  const values = Object.entries(changes.values);

  let summary: string;
  switch (action) {
    case 'CREATE':
      summary = `Created with ${values.length} fields`;
      break;
    case 'DELETE':
      summary = 'Deleted — final snapshot';
      break;
    case 'BULK_DELETE':
      summary = 'Bulk deleted — final snapshot';
      break;
    default:
      summary = 'Snapshot';
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={[
          'inline-flex items-center gap-1 text-sm font-medium text-primary',
          'hover:text-primary-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm',
        ].join(' ')}
      >
        {summary}
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <dl className="mt-2 space-y-1">
          {values.map(([field, value]) => (
            <div
              key={field}
              className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 text-sm"
            >
              <dt className="font-medium text-muted">{field}</dt>
              <dd className="break-words text-fg">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function HistoryEntry({ entry }: { entry: AuditEntry }) {
  const actorLabel = entry.actingEmail ?? entry.actingSub;

  return (
    <article
      className="rounded-md border border-border bg-surface p-4 shadow-sm"
      role="listitem"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ActionBadge action={entry.action} />
        <span className="text-sm font-medium text-fg">{actorLabel}</span>
        <time className="text-xs text-muted" dateTime={entry.createdAt}>
          {formatDate(entry.createdAt)}
        </time>
      </div>

      {isDiff(entry.changes) && <DiffDetails changes={entry.changes} />}
      {isSnapshot(entry.changes) && (
        <SnapshotDetails changes={entry.changes} action={entry.action} />
      )}
      {!isDiff(entry.changes) && !isSnapshot(entry.changes) && (
        <p className="mt-2 text-sm text-muted">Details not available</p>
      )}
    </article>
  );
}

function LoadingState() {
  return (
    <div className="mt-4 space-y-4" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-surface p-4">
          <Skeleton className="h-5 w-48 rounded-sm" />
          <Skeleton className="h-4 w-full rounded-sm" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActorHistoryPanel({ actorId, token }: ActorHistoryPanelProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const result = await getActorHistory(
          actorId,
          { page: targetPage, pageSize: PAGE_SIZE },
          token,
        );
        setEntries((prev) => (append ? [...prev, ...result.data] : result.data));
        setTotal(result.total);
        setPage(result.page);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history.');
      } finally {
        setLoading(false);
      }
    },
    [actorId, token],
  );

  useEffect(() => {
    setEntries([]);
    setPage(1);
    setTotal(0);
    setError(null);
    void fetchPage(1, false);
  }, [actorId, token, fetchPage]);

  const loadMore = useCallback(() => {
    if (loading) return;
    void fetchPage(page + 1, true);
  }, [fetchPage, loading, page]);

  const retry = useCallback(() => {
    setEntries([]);
    setPage(1);
    setTotal(0);
    setError(null);
    void fetchPage(1, false);
  }, [fetchPage]);

  const hasMore = entries.length < total;
  const empty = !loading && entries.length === 0 && !error;

  return (
    <section aria-labelledby="actor-history-heading" className="mt-10">
      <h2
        id="actor-history-heading"
        className="font-display text-xl font-semibold text-fg"
      >
        History
      </h2>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {loading && entries.length === 0
          ? 'Loading history.'
          : `${entries.length} changes shown.`}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-danger/30 bg-danger-soft p-4"
        >
          <p className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={retry}
            className={[
              'mt-2 inline-flex items-center rounded-md border border-danger/30 bg-surface px-3 py-1.5 text-xs font-medium text-danger',
              'hover:bg-danger/10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-1',
            ].join(' ')}
          >
            Retry
          </button>
        </div>
      )}

      {empty && (
        <p className="mt-4 text-sm text-muted">No changes recorded</p>
      )}

      {entries.length > 0 && (
        <div role="list" className="mt-4 space-y-4">
          {entries.map((entry) => (
            <HistoryEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {loading && entries.length === 0 && <LoadingState />}
      {loading && entries.length > 0 && (
        <p className="mt-4 text-sm text-muted">Loading more…</p>
      )}

      {hasMore && !loading && (
        <button
          type="button"
          onClick={loadMore}
          className={[
            'mt-4 inline-flex items-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-fg',
            'hover:bg-surface-alt',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          ].join(' ')}
        >
          Load more
        </button>
      )}
    </section>
  );
}
