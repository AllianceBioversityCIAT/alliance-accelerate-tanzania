/**
 * map-constants.ts — the shared geography and tile source for both OSM
 * surfaces in this app (enhancement/map-coordinate-picker FR-8, DD-5).
 *
 * `TANZANIA_CENTER`, `TANZANIA_BOUNDS`, `OSM_TILE_URL`, and `OSM_ATTRIBUTION`
 * were module-private `const`s in `LeafletMap.tsx` until this extraction
 * (enhancement/map-coordinate-picker C-1). They are moved here verbatim —
 * no value changes — so `LeafletMap` (the public `/map` page) has one
 * definition to import rather than owning it privately, ready for a second
 * OSM tile surface (the coordinate picker, a separate task) to import the
 * same values instead of re-typing them. A duplicated OSM attribution
 * string is not just untidy, it is an attribution-compliance risk under
 * OpenStreetMap's usage policy: edit it here, never re-type it.
 *
 * Typed as plain tuples, not Leaflet's `L.LatLngExpression` /
 * `L.LatLngBoundsExpression` — this module must stay importable by code
 * that must not pull `leaflet` in (the coordinate seam, and any future
 * consumer that only needs the numbers). Leaflet's own `LatLngExpression` /
 * `LatLngBoundsExpression` are structurally the same shapes but declared
 * **mutable** (`L.LatLngTuple` is `[number, number, number?]` — the third
 * element is optional altitude — and carries no `readonly`), so a
 * `readonly` export here is rejected at any call site that assigns it
 * directly to one of those types — measured, not assumed: `npx tsc
 * --noEmit` on that assignment reports `TS2322`, "The type 'readonly
 * [number, number]' is 'readonly' and cannot be assigned to the mutable
 * type 'LatLngTuple'." A consumer must instead spread into a fresh mutable
 * tuple at the call site — `LeafletMap.tsx`'s `L.map(...)` call does exactly
 * this: `center: [...TANZANIA_CENTER] as L.LatLngExpression` and
 * `maxBounds: TANZANIA_BOUNDS.map((corner) => [...corner]) as
 * L.LatLngBoundsExpression`. Keeping the exports `readonly` here is a
 * deliberate trade, not an oversight: it protects these shared values from
 * being mutated by a consumer, at the cost of one spread per call site.
 * A later consumer — the coordinate picker's own map surface (per
 * enhancement/map-coordinate-picker DD-5) — will meet the same kind of
 * rejection if it assigns one of these exports directly rather than
 * spreading; a consumer that spreads from the first line, which is what
 * this note exists to produce, will meet none. Note the two exports fail
 * against different targets: `TANZANIA_CENTER` against `LatLngTuple`,
 * `TANZANIA_BOUNDS` against `LatLngBoundsLiteral` (`LatLngTuple[]`) — so
 * the message differs between them.
 */

/** Tanzania's geographic center, as `[lat, lng]`. */
export const TANZANIA_CENTER: readonly [number, number] = [-6.37, 34.89];

/**
 * Approximate bounding box for Tanzania — keeps the initial view focused.
 * `[southWest, northEast]`, each a `[lat, lng]` pair.
 */
export const TANZANIA_BOUNDS: readonly [
  readonly [number, number],
  readonly [number, number],
] = [
  [-11.75, 29.34], // SW corner
  [-0.98, 40.44], // NE corner
];

/** OSM raster tile URL template. */
export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Required OSM attribution string (OpenStreetMap usage policy). */
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
