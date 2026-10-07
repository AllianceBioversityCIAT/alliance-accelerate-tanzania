// @sdd-spec actors/consent-intake/consent-request-email (T-9)
'use client';

/**
 * ConsentSelectionStrip — page-selection helpers for the bulk consent send
 * (FR-4 targets, design.md §7.3, P-24).
 *
 * - **Select page** (`lg:hidden`): the table's header checkbox exists only in
 *   the `hidden lg:block` table, so below `lg` (card view) this is the only
 *   way to select the whole page. It is the SAME toggle the header checkbox
 *   drives.
 * - **Select all N matching**: offered once the whole page is selected and
 *   more actors match than fit on it. Switches the target from the page's
 *   ids to the current URL filters; **Clear selection** leaves that mode.
 *
 * Tokens only.
 */

export interface ConsentSelectionStripProps {
  /** Actors on the visible page. */
  pageCount: number;
  /** Actors matching the current filters, across every page. */
  total: number;
  /** True when every visible actor is selected. */
  pageSelected: boolean;
  /** True when the target is "all matching the filters". */
  allMatching: boolean;
  onTogglePage: () => void;
  onSelectAllMatching: () => void;
  onClear: () => void;
}

const linkButton = [
  'rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg',
  'transition-colors hover:bg-surface-alt',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
].join(' ');

export function ConsentSelectionStrip({
  pageCount,
  total,
  pageSelected,
  allMatching,
  onTogglePage,
  onSelectAllMatching,
  onClear,
}: Readonly<ConsentSelectionStripProps>) {
  const offerAll = pageSelected && !allMatching && total > pageCount;

  let message: string | null = null;
  if (allMatching) message = `All ${total} matching actors are selected.`;
  else if (offerAll) message = `All ${pageCount} actors on this page are selected.`;

  return (
    <div className={['flex flex-wrap items-center gap-2', message ? '' : 'lg:hidden'].join(' ')}>
      <button type="button" onClick={onTogglePage} className={`${linkButton} lg:hidden`}>
        {pageSelected ? 'Deselect page' : 'Select page'}
      </button>

      {/* Announced by BulkActionBar's live count; this is the visible companion. */}
      {message && <p className="text-sm text-fg">{message}</p>}

      {offerAll && (
        <button type="button" onClick={onSelectAllMatching} className={linkButton}>
          Select all {total} matching
        </button>
      )}
      {allMatching && (
        <button type="button" onClick={onClear} className={linkButton}>
          Clear selection
        </button>
      )}
    </div>
  );
}
