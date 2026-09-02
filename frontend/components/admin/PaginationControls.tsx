/**
 * Previous/Next pagination control pair shared by the admin list pages
 * (`app/(admin)/admin/actors/page.tsx`, `app/(admin)/admin/registrations/page.tsx`).
 * Extracted from two byte-identical copies (jscpd-flagged duplication) — no
 * behavioral change from either original.
 *
 * Deliberately scoped to just the button pair + "Page X of Y" indicator —
 * the "Showing N of M {actors|registrations}" line above it differs by noun
 * between the two callers and stays in each page.
 */

export interface PaginationControlsProps {
  /** Current 1-indexed page. */
  page: number;
  /** Total number of pages. */
  totalPages: number;
  /** Disables both buttons while a request is in flight (in addition to the bounds check). */
  loading: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function PaginationControls({
  page,
  totalPages,
  loading,
  onPrevPage,
  onNextPage,
}: Readonly<PaginationControlsProps>) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrevPage}
        disabled={page <= 1 || loading}
        aria-label="Previous page"
        className={[
          'rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-fg',
          'transition-colors hover:bg-surface-alt',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
      >
        Previous
      </button>
      <span className="px-2">
        Page <span className="font-medium text-fg">{page}</span> of{' '}
        <span className="font-medium text-fg">{totalPages}</span>
      </span>
      <button
        type="button"
        onClick={onNextPage}
        disabled={page >= totalPages || loading}
        aria-label="Next page"
        className={[
          'rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-fg',
          'transition-colors hover:bg-surface-alt',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
      >
        Next
      </button>
    </div>
  );
}
