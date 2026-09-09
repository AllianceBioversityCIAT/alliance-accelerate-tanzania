/**
 * Unit tests for the coordinate seam — T-1
 * Traces: FR-6 (all clauses) · FR-2 sc. 3 · FR-3 sc. 1 · NFR-4 · design.md §7.1, DD-3, DD-4
 *
 * NFR-4 discipline: this file imports nothing from `leaflet`, `react`, or any
 * component. Every case below is a pure function over strings and numbers.
 */

import {
  COORDINATE_PRECISION,
  LATITUDE_RANGE,
  LONGITUDE_RANGE,
  formatCoordinate,
  parseCoordinatePair,
  isSamePoint,
} from './coordinates';

// ---------------------------------------------------------------------------
// Constants (DD-3)
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('fixes COORDINATE_PRECISION at 5 (DD-3)', () => {
    expect(COORDINATE_PRECISION).toBe(5);
  });

  it('bounds LATITUDE_RANGE at [-90, 90]', () => {
    expect(LATITUDE_RANGE).toEqual([-90, 90]);
  });

  it('bounds LONGITUDE_RANGE at [-180, 180]', () => {
    expect(LONGITUDE_RANGE).toEqual([-180, 180]);
  });
});

// ---------------------------------------------------------------------------
// formatCoordinate — FR-6
// ---------------------------------------------------------------------------

describe('formatCoordinate — rounds a drag-precision number to COORDINATE_PRECISION', () => {
  it('rounds a ~13-decimal drag result to 5 decimal places (FR-6 sc. 1)', () => {
    // A pin drag yields ~13 decimals (design.md §9 R1 / FR-6 rationale).
    expect(formatCoordinate(-6.812345678901)).toBe('-6.81235');
  });

  it('produces a string at most 7 decimal places (FR-6: "MUST be at most 7 decimal places")', () => {
    const result = formatCoordinate(39.123456789);
    const decimals = result.split('.')[1] ?? '';
    expect(decimals.length).toBeLessThanOrEqual(7);
    // And, at DD-3's chosen precision, exactly 5 — the stronger, specific claim.
    expect(decimals.length).toBe(5);
  });

  it('round-trips: formatting, parsing, and re-formatting yields the identical string (FR-6 "MUST round-trip")', () => {
    const first = formatCoordinate(-6.812345678901);
    const reparsed = parseCoordinatePair(first, '39.0');
    expect(reparsed).not.toBeNull();
    const second = formatCoordinate(reparsed!.lat);
    expect(second).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// parseCoordinatePair — FR-2 sc. 3 (four independently named null cases)
// ---------------------------------------------------------------------------

describe('parseCoordinatePair — the four FR-2 sc. 3 unplaceable cases, each on its own', () => {
  it('returns null when both fields are blank', () => {
    expect(parseCoordinatePair('', '')).toBeNull();
  });

  it('returns null when the pair is half-filled (one blank, one filled)', () => {
    expect(parseCoordinatePair('-6.8', '')).toBeNull();
    expect(parseCoordinatePair('', '39.28')).toBeNull();
  });

  it('returns null when a field is non-numeric', () => {
    expect(parseCoordinatePair('abc', '39.28')).toBeNull();
    expect(parseCoordinatePair('-6.8', 'not-a-number')).toBeNull();
  });

  it('returns null when a field is out of range (lat=91, lng=181)', () => {
    expect(parseCoordinatePair('91', '39.28')).toBeNull();
    expect(parseCoordinatePair('-6.8', '181')).toBeNull();
  });

  it('does NOT throw on any of the four unplaceable cases (FR-2 sc. 3 "must NOT throw")', () => {
    expect(() => parseCoordinatePair('', '')).not.toThrow();
    expect(() => parseCoordinatePair('-6.8', '')).not.toThrow();
    expect(() => parseCoordinatePair('abc', '39.28')).not.toThrow();
    expect(() => parseCoordinatePair('91', '39.28')).not.toThrow();
  });
});

describe('parseCoordinatePair — a valid pair', () => {
  it('parses a valid in-range pair to numbers', () => {
    expect(parseCoordinatePair('-6.8', '39.28')).toEqual({ lat: -6.8, lng: 39.28 });
  });

  it('accepts the inclusive range boundaries (-90/90, -180/180), matching both forms’ existing checks', () => {
    expect(parseCoordinatePair('90', '180')).toEqual({ lat: 90, lng: 180 });
    expect(parseCoordinatePair('-90', '-180')).toEqual({ lat: -90, lng: -180 });
  });
});

describe('parseCoordinatePair — never rounds a value the person typed (FR-6 "BUT must NOT round a typed value" / FR-3 sc. 1)', () => {
  it('preserves a hand-typed 7-decimal value exactly, byte-for-byte as a number', () => {
    // -6.8123457 has 7 decimals — more than COORDINATE_PRECISION (5) but within
    // the column's own scale. parseCoordinatePair must hand it back unrounded.
    const result = parseCoordinatePair('-6.8123457', '39.1234567');
    expect(result).toEqual({ lat: -6.8123457, lng: 39.1234567 });
  });
});

// ---------------------------------------------------------------------------
// isSamePoint — DD-4, on BOTH the picker-written and hand-typed paths
// ---------------------------------------------------------------------------

describe('isSamePoint — the redraw guard (DD-4)', () => {
  it('picker-written path: a marker still at raw drag precision differs from the just-written 5dp field strings', () => {
    // Drag leaves the marker at ~13dp; onChange writes the 5dp-rounded strings.
    // The first comparison after the write must report "different" so the
    // shell snaps the marker to the rounded value exactly once.
    const draggedPosition = { lat: -6.812345678901, lng: 39.000000000001 };
    const writtenLat = formatCoordinate(draggedPosition.lat); // '-6.81235'
    const writtenLng = formatCoordinate(draggedPosition.lng); // '39.00000'
    expect(isSamePoint(draggedPosition, writtenLat, writtenLng)).toBe(false);
  });

  it('picker-written path: once the marker is snapped to the parsed (rounded) value, the comparison reports equal', () => {
    const writtenLat = formatCoordinate(-6.812345678901); // '-6.81235'
    const writtenLng = formatCoordinate(39.000000000001); // '39.00000'
    const parsed = parseCoordinatePair(writtenLat, writtenLng)!;
    // The shell sets the marker to exactly the parsed value (design.md DD-4).
    expect(isSamePoint(parsed, writtenLat, writtenLng)).toBe(true);
  });

  it('hand-typed path: a marker placed at a person’s 7-decimal value matches immediately, with no rounding involved', () => {
    // This is the exact case the F-3 defect got wrong: comparing via
    // formatCoordinate (5dp) against a marker holding the unrounded 7dp
    // value would report "different" forever. Comparing against
    // parseCoordinatePair's unrounded value must report equal.
    const point = { lat: -6.8123457, lng: 39.1234567 };
    expect(isSamePoint(point, '-6.8123457', '39.1234567')).toBe(true);
  });

  it('reports different when the field pair cannot be parsed (no point to compare against)', () => {
    expect(isSamePoint({ lat: -6.8, lng: 39.28 }, '', '')).toBe(false);
    expect(isSamePoint({ lat: -6.8, lng: 39.28 }, '91', '39.28')).toBe(false);
  });

  it('reports different when only the longitude differs', () => {
    // lat matches exactly (-6.8 === -6.8); only lng differs (39.28 vs 39.29).
    // A single-axis (lat-only) comparator would wrongly report true here.
    expect(isSamePoint({ lat: -6.8, lng: 39.28 }, '-6.8', '39.29')).toBe(false);
  });

  it('reports different when only the latitude differs', () => {
    // lng matches exactly (39.28 === 39.28); only lat differs (-6.8 vs -6.9).
    // A single-axis (lng-only) comparator would wrongly report true here.
    expect(isSamePoint({ lat: -6.8, lng: 39.28 }, '-6.9', '39.28')).toBe(false);
  });
});
