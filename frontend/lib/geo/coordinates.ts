/**
 * Coordinate seam — FR-6, FR-2 sc. 3, FR-3 sc. 1, NFR-4, design.md §7.1
 *
 * Pure functions over strings and numbers. Imports nothing from `leaflet`,
 * `react`, or any component (NFR-4) — this is the module the D-1 gate tests,
 * and the only place every coordinate rule in the picker lives.
 *
 * formatCoordinate: number → the string WRITTEN into a field (rounded to
 *   COORDINATE_PRECISION). Only the picker's write path calls this.
 * parseCoordinatePair: two raw field strings → a point, or `null` for any of
 *   the four unplaceable cases (blank, half-filled, non-numeric, out of
 *   range). Never mutates or rounds its input — it answers a question, it
 *   never repairs what a person typed (FR-2 sc. 3, FR-6).
 * isSamePoint: the two-way-binding redraw guard (DD-4). Compares a marker
 *   position NUMERICALLY against `parseCoordinatePair(lat, lng)` — never via
 *   `formatCoordinate` — so a hand-typed value with more than
 *   COORDINATE_PRECISION decimals (FR-6 permits up to 7) is recognized as
 *   already-placed instead of reporting "different" forever (the F-3 defect
 *   two design judges caught).
 */

/** The single rounding constant governing both write directions (FR-6, DD-3). */
export const COORDINATE_PRECISION = 5;

/** Inclusive latitude bounds, mirroring both forms' existing range checks. */
export const LATITUDE_RANGE: readonly [number, number] = [-90, 90];

/** Inclusive longitude bounds, mirroring both forms' existing range checks. */
export const LONGITUDE_RANGE: readonly [number, number] = [-180, 180];

export interface CoordinatePoint {
  lat: number;
  lng: number;
}

/**
 * Format a number as the string the picker writes into a coordinate field,
 * rounded to `COORDINATE_PRECISION` decimal places. Used only for values the
 * picker itself produces (a drag or a click) — never for a value a person
 * typed, which `parseCoordinatePair` returns unrounded.
 */
export function formatCoordinate(n: number): string {
  return n.toFixed(COORDINATE_PRECISION);
}

function isBlank(value: string): boolean {
  return value.trim() === '';
}

function inRange(value: number, [min, max]: readonly [number, number]): boolean {
  return value >= min && value <= max;
}

/**
 * Parse two raw field strings into a coordinate point, or `null` when the
 * pair cannot be placed: blank, half-filled, non-numeric, or out of range
 * (FR-2 sc. 3's four cases, collapsed into one answer the shell cannot
 * misread). Never rounds or otherwise alters the parsed value — a value a
 * person typed with more than `COORDINATE_PRECISION` decimals (up to the
 * column's 7) survives exactly (FR-6, FR-3 sc. 1).
 */
export function parseCoordinatePair(lat: string, lng: string): CoordinatePoint | null {
  if (isBlank(lat) || isBlank(lng)) {
    return null;
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return null;
  }

  if (!inRange(latNum, LATITUDE_RANGE) || !inRange(lngNum, LONGITUDE_RANGE)) {
    return null;
  }

  return { lat: latNum, lng: lngNum };
}

/**
 * The two-way-binding redraw guard (DD-4). Compares `point` numerically
 * against `parseCoordinatePair(lat, lng)` — the UNROUNDED parsed value, at
 * whatever precision those strings carry. Deliberately never compares via
 * `formatCoordinate`: doing so would report "different" forever for any
 * hand-typed value carrying more than `COORDINATE_PRECISION` decimals, which
 * FR-6 explicitly permits a person to type.
 *
 * Returns `false` (never throws) when the fields cannot be parsed at all —
 * there is no point to compare against.
 */
export function isSamePoint(point: CoordinatePoint, lat: string, lng: string): boolean {
  const parsed = parseCoordinatePair(lat, lng);
  if (parsed === null) {
    return false;
  }
  return point.lat === parsed.lat && point.lng === parsed.lng;
}
