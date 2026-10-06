// @sdd-spec admin/bulk-actor-operations (T-7)
'use client';

/**
 * BulkActionBar — contextual action bar for bulk actor selection.
 *
 * Appears once the Admin selects one or more actors in the /admin/actors table.
 * Provides Send consent request (T-9), Unlock (publishes PII + GPS), Lock (hides
 * from public), and Delete (permanent removal) actions.
 *
 * Accessibility (WCAG 2.1 AA / system-design §10):
 *   - Announces the selected count via an aria-live region.
 *   - Disabled state conveyed with disabled attribute + opacity during in-flight.
 *   - Visible focus rings on every button.
 *
 * Tokens only; no hardcoded colors/geometry.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkActionBarProps {
  /** Number of actors currently selected. */
  selectedCount: number;
  /** Called when the user chooses Unlock. */
  onUnlock: () => void;
  /** Called when the user chooses Lock. */
  onLock: () => void;
  /** Called when the user chooses Delete. */
  onDelete: () => void;
  /** Called when the user chooses Send consent request (T-9). */
  onSendConsent: () => void;
  /** True while a bulk mutation is in-flight (disables all buttons). */
  loading?: boolean;
  /**
   * T-9 — the target is "all N matching the filters", not the page's rows.
   * Unlock/Lock/Delete are row-scoped (they take ids), so they are disabled
   * rather than silently acting on only the visible page.
   */
  allMatching?: boolean;
  /**
   * T-9 — a consent send loop is already running on this page. Starting a
   * second one is refused (one dispatch at a time per tab, design.md §5.2),
   * so Send is disabled until it settles.
   */
  sendDisabled?: boolean;
  /** Total matching actors; the count shown when `allMatching`. */
  matchingTotal?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkActionBar({
  selectedCount,
  onUnlock,
  onLock,
  onDelete,
  onSendConsent,
  loading = false,
  allMatching = false,
  sendDisabled = false,
  matchingTotal = 0,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  const countLabel = allMatching
    ? `All ${matchingTotal} matching actors selected`
    : `${selectedCount} actor${selectedCount === 1 ? '' : 's'} selected`;
  const rowActionsDisabled = loading || allMatching;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actor actions"
      className={[
        'flex flex-col gap-3 rounded-md border border-border bg-surface p-4 shadow-sm',
        'sm:flex-row sm:items-center sm:justify-between',
      ].join(' ')}
    >
      <p
        className="text-sm font-medium text-fg"
        aria-live="polite"
        aria-atomic="true"
      >
        {countLabel}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {allMatching && (
          <p id="bulk-row-actions-hint" className="text-xs text-muted">
            Unlock, Lock and Delete apply to selected rows only.
          </p>
        )}
        <button
          type="button"
          onClick={onSendConsent}
          disabled={loading || sendDisabled}
          className={[
            'inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg',
            'transition-colors hover:bg-primary-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          Send consent request
        </button>

        <button
          type="button"
          onClick={onUnlock}
          disabled={rowActionsDisabled}
          aria-describedby={allMatching ? 'bulk-row-actions-hint' : undefined}
          className={[
            'inline-flex items-center rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-fg',
            'transition-colors hover:bg-surface-alt',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          Unlock
        </button>

        <button
          type="button"
          onClick={onLock}
          disabled={rowActionsDisabled}
          aria-describedby={allMatching ? 'bulk-row-actions-hint' : undefined}
          className={[
            'inline-flex items-center rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-fg',
            'transition-colors hover:bg-surface-alt',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          Lock
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={rowActionsDisabled}
          aria-describedby={allMatching ? 'bulk-row-actions-hint' : undefined}
          className={[
            'inline-flex items-center rounded-md bg-danger px-3 py-2 text-sm font-medium text-primary-fg',
            'transition-colors hover:opacity-90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
