/**
 * regions.ts — canonical Tanzania region list for filter controls.
 *
 * OQ-1 (resolved): region options are sourced exclusively from
 * `CANONICAL_REGIONS` in `backend/src/common/normalize.ts` (31 regions as of
 * the most recent administrative split). The backend validates the `?region=`
 * filter parameter against this same constant via exact-string equality;
 * sending any other value yields a 400. Driving the frontend from the same
 * source guarantees the filter can never produce a backend rejection.
 *
 * Values must match the canonical backend strings exactly (casing + spaces).
 * Edit `backend/src/common/normalize.ts` `CANONICAL_REGIONS` first if the
 * administrative map changes, then mirror the change here.
 */

/** All 31 canonical Tanzania regions (mainland + Zanzibar). Exact strings only. */
export const REGIONS: string[] = [
  // Mainland Tanzania (26)
  'Arusha',
  'Dar es Salaam',
  'Dodoma',
  'Geita',
  'Iringa',
  'Kagera',
  'Katavi',
  'Kigoma',
  'Kilimanjaro',
  'Lindi',
  'Manyara',
  'Mara',
  'Mbeya',
  'Morogoro',
  'Mtwara',
  'Mwanza',
  'Njombe',
  'Pwani',
  'Rukwa',
  'Ruvuma',
  'Shinyanga',
  'Simiyu',
  'Singida',
  'Songwe',
  'Tabora',
  'Tanga',
  // Zanzibar (5)
  'Kaskazini Unguja',  // Zanzibar North
  'Kusini Unguja',     // Zanzibar Central/South
  'Mjini Magharibi',   // Zanzibar Urban/West
  'Kaskazini Pemba',   // Pemba North
  'Kusini Pemba',      // Pemba South
];
