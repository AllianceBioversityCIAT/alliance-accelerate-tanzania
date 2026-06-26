/**
 * Filter ⇄ URL codec — FR-2, NFR-7, design.md §5.3
 *
 * Two pure functions that round-trip dashboard filter state to/from URLSearchParams.
 * `page` and `pageSize` are intentionally excluded — they are not shared filter state.
 *
 * encodeFilters: omits fields that are undefined, empty strings, or non-finite numbers.
 * decodeFilters: never throws; invalid numeric params decode to undefined.
 */

import type { ActorsQuery } from '@/lib/api/actors';

// Fields handled by this codec (excludes page / pageSize)
const STRING_FIELDS = ['crop', 'role', 'region', 'district', 'search'] as const;
const NUMBER_FIELDS = ['capacityMin', 'capacityMax'] as const;

type StringField = (typeof STRING_FIELDS)[number];
type NumberField = (typeof NUMBER_FIELDS)[number];

/**
 * Encode filter state into URLSearchParams.
 * A param is set only when the field is defined and:
 *   - for strings: non-empty
 *   - for numbers: a finite number
 */
export function encodeFilters(q: ActorsQuery): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of STRING_FIELDS) {
    const val = q[key as StringField];
    if (val !== undefined && val !== '') {
      params.set(key, val);
    }
  }

  for (const key of NUMBER_FIELDS) {
    const val = q[key as NumberField];
    if (val !== undefined && Number.isFinite(val)) {
      params.set(key, String(val));
    }
  }

  return params;
}

/**
 * Decode URLSearchParams back into an ActorsQuery filter object.
 * - String fields: included only when present and non-empty.
 * - Number fields: included only when present and the value parses to a finite number.
 * - Never throws; garbage input (e.g. capacityMin=abc) results in undefined for that field.
 */
export function decodeFilters(params: URLSearchParams): ActorsQuery {
  const q: ActorsQuery = {};

  for (const key of STRING_FIELDS) {
    const raw = params.get(key);
    if (raw !== null && raw !== '') {
      q[key as StringField] = raw;
    }
  }

  for (const key of NUMBER_FIELDS) {
    const raw = params.get(key);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        q[key as NumberField] = parsed;
      }
    }
  }

  return q;
}
