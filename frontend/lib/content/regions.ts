/**
 * regions.ts — provisional Tanzania region list for the Discovery Map rail filters.
 *
 * This list is provisional: it covers the 10 regions represented in the seeded
 * consented dataset. It will be replaced by a canonical, API-driven region
 * enumeration once OQ-6 (region canonicalization) is resolved and the real
 * import lands.
 *
 * Values MUST match the exact strings stored in the `region` column of the
 * seeded actors dataset — the backend uses exact string equality for the
 * `?region=` filter parameter (DD-3).
 *
 * Provisional pending: OQ-6 (region canonicalization) + real data import.
 */

/** Ten Tanzania regions covered by the seeded consented actor dataset. */
export const REGIONS: string[] = [
  'Arusha',
  'Dar es Salaam',
  'Dodoma',
  'Iringa',
  'Kigoma',
  'Mbeya',
  'Morogoro',
  'Mtwara',
  'Mwanza',
  'Tanga',
];
