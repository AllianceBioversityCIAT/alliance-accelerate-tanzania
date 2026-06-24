'use client';

// DirectoryPagination — prev/next controls + page indicator for the Actor
// Directory (FR-1, FR-2, FR-3).
//
// Prev/next buttons are disabled at bounds (page=1 and page=lastPage).
// The page indicator announces the current position to screen readers.
//
// NFR-3: buttons carry aria-labels; page indicator is text-visible.
// NFR-4: token-driven classes only — no raw hex.

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DirectoryPaginationProps {
  /** Current page number (1-indexed). */
  page: number;
  /** Total number of records across all pages (from the API `total` field). */
  total: number;
  /** Number of records per page (from the API `pageSize` field). */
  pageSize: number;
  /**
   * Called when the user activates Prev or Next.
   * Receives the new 1-indexed page number.
   */
  onPageChange: (newPage: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Prev / Next pagination bar with a "Page X of Y" indicator.
 * Hides itself when there is only one page (total ≤ pageSize) to avoid
 * rendering a useless control (FR-1/2/3 — only meaningful when multi-page).
 * Buttons disable at the first and last page respectively (FR-1).
 */
export default function DirectoryPagination({
  page,
  total,
  pageSize,
  onPageChange,
}: DirectoryPaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  // No pagination needed when everything fits on one page.
  if (total <= pageSize) return null;

  const isFirst = page <= 1;
  const isLast  = page >= lastPage;

  // ── Shared button style ────────────────────────────────────────────────────

  const BTN_CLASS = [
    'rounded-md border border-border bg-surface px-3 py-1.5',
    'text-sm text-fg shadow-sm transition-colors',
    'hover:border-primary hover:bg-surface-alt',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface',
  ].join(' ');

  return (
    <nav
      className="flex items-center justify-center gap-3 pt-4"
      aria-label="Directory pagination"
    >
      {/* ── Prev ──────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={isFirst}
        className={BTN_CLASS}
        aria-label="Previous page"
        aria-disabled={isFirst}
      >
        ← Prev
      </button>

      {/* ── Page indicator ────────────────────────────────────────────────── */}
      <span
        className="text-sm text-muted tabular-nums"
        aria-current="page"
        aria-live="polite"
        aria-atomic="true"
      >
        Page {page} of {lastPage}
      </span>

      {/* ── Next ──────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={isLast}
        className={BTN_CLASS}
        aria-label="Next page"
        aria-disabled={isLast}
      >
        Next →
      </button>
    </nav>
  );
}
