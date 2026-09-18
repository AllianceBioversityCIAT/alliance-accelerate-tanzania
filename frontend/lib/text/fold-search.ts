/**
 * Pure fold-and-match helper for type-to-filter controls.
 *
 * FR-1, design.md §5.4 — spec: enhancement/searchable-region-select.
 *
 * NO React, NO DOM, NO knowledge of regions — a generic string predicate,
 * reusable anywhere a case-insensitive, diacritic-folded, whitespace-trimmed
 * SUBSTRING match is needed.
 */

// Unicode "Combining Diacritical Marks" block (U+0300–U+036F) — what NFD
// decomposition splits an accented letter into (base letter + this).
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Fold a string for comparison: NFD-decompose, strip combining marks, lowercase, trim. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim();
}

/**
 * True when `query` occurs anywhere inside `candidate` — a substring match,
 * not a prefix match — ignoring case, diacritics, and leading/trailing
 * whitespace on both sides.
 *
 * An empty (or whitespace-only) query matches every candidate.
 */
export function matchesQuery(candidate: string, query: string): boolean {
  const foldedQuery = fold(query);
  if (foldedQuery === '') return true;
  return fold(candidate).includes(foldedQuery);
}
