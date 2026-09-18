/**
 * URL query-param read helpers shared by the admin list pages
 * (`app/(admin)/admin/actors/page.tsx`, `app/(admin)/admin/registrations/page.tsx`)
 * — the repo's query-param routing pattern (`frontend/CLAUDE.md`).
 *
 * Extracted from two byte-identical copies (jscpd-flagged duplication).
 * `components/directory/DirectoryView.tsx` carries its own local copies of
 * `param`/`pageParam` (a third, pre-existing instance of this same code) —
 * not consolidated here, since that is a public-facing screen out of this
 * change's scope.
 */

/** Read a non-empty string param from URLSearchParams, else undefined. */
export function param(params: URLSearchParams, key: string): string | undefined {
  const v = params.get(key);
  return v && v.trim() !== '' ? v : undefined;
}

/** Read a positive integer page param; falls back to 1 on invalid/missing input. */
export function pageParam(params: URLSearchParams): number {
  const raw = params.get('page');
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Read pageSize param; falls back to `defaultPageSize` unless it is one of
 * `allowedSizes`. `defaultPageSize`/`allowedSizes` are passed in rather than
 * hardcoded here because each call site owns its own `DEFAULT_PAGE_SIZE` /
 * `PAGE_SIZE_OPTIONS` constants (currently identical values, but kept local
 * so the two pages' pagination configuration isn't silently coupled).
 */
export function pageSizeParam(
  params: URLSearchParams,
  defaultPageSize: number,
  allowedSizes: readonly number[],
): number {
  const raw = params.get('pageSize');
  if (!raw) return defaultPageSize;
  const n = parseInt(raw, 10);
  return allowedSizes.includes(n) ? n : defaultPageSize;
}
