// ResultCount — accessible result count for the actor directory (FR-1, NFR-3).
// Server component: no 'use client' needed — purely presentational, no hooks.
//
// Renders "N organizations found" inside an aria-live="polite" region so that
// screen readers announce count updates when the list reloads (NFR-3).
// Token-driven: text-muted / text-fg — no raw hex (NFR-4).
//
// Usage:
//   <ResultCount count={42} loading={false} />
//   <ResultCount count={0} loading={true} />  ← hidden while loading

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResultCountProps {
  /** Total number of matching organizations. Ignored while loading. */
  count: number;
  /** When true the count region renders as empty so screen readers stay quiet. */
  loading: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders an accessible "N organizations found" announcement.
 * The aria-live="polite" region ensures assistive technology announces changes
 * after any filter/search update without interrupting the user (NFR-3).
 */
export default function ResultCount({ count, loading }: ResultCountProps) {
  // Display label: "1 organization found" vs "N organizations found"
  const label = count === 1 ? '1 organization found' : `${count} organizations found`;

  return (
    // aria-live="polite" — announces updates to screen readers without
    // interrupting ongoing speech. aria-atomic="true" ensures the full string
    // is re-read on change, not just the diff (NFR-3).
    <p
      className="text-sm text-muted"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Render nothing while loading so the region stays quiet (no stale count) */}
      {!loading && label}
    </p>
  );
}
