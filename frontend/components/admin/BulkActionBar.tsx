// @sdd-spec admin/bulk-actor-operations (T-7)
'use client';

/**
 * BulkActionBar — contextual action bar for bulk actor selection.
 *
 * Appears once the Admin selects one or more actors in the /admin/actors table.
 * Provides Unlock (publishes PII + GPS), Lock (hides from public), and Delete
 * (permanent removal) actions.
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
  /** True while a bulk mutation is in-flight (disables all buttons). */
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkActionBar({
  selectedCount,
  onUnlock,
  onLock,
  onDelete,
  loading = false,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  const countLabel = `${selectedCount} actor${selectedCount === 1 ? '' : 's'} selected`;

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
        <button
          type="button"
          onClick={onUnlock}
          disabled={loading}
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
          disabled={loading}
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
          disabled={loading}
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
