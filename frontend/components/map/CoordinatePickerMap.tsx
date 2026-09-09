'use client';

// CoordinatePickerMap — the Leaflet shell for the map coordinate picker
// (enhancement/map-coordinate-picker T-3; design.md §7.4; FR-1, FR-2, FR-3,
// NFR-3).
//
// The ONLY module in this spec that imports `leaflet` / `leaflet/dist/leaflet.css`.
// Holds a map ref and a marker ref and NO coordinate state — the marker is a
// projection of the two incoming `latitude`/`longitude` strings, recomputed
// on every prop change (design.md §3's data-flow diagram). The form is the
// single source of truth throughout.
//
// Forward pointer (1) — the `isSamePoint` contract (T-1 review advisory 2,
// DD-4): it only settles in one pass if the marker is set from the parsed
// value VERBATIM and read back via `marker.getLatLng()`. The load-bearing
// call is `marker.setLatLng` (below) — `map.setView`/`panTo` move the map's
// CENTRE and never touch what `getLatLng()` returns, so neither can affect
// this guard either way. This file never sets a marker's position from
// anything but a value straight out of `parseCoordinatePair`, never enables
// `worldCopyJump`, and never wraps a LatLng — any of those would silently
// break the guard by shifting the stored double away from what
// `parseCoordinatePair` will re-derive next render.
//
// Forward pointer (2) — `PICKER_ZOOM` below is this component's OWN view
// policy, not `LeafletMap`'s. `INITIAL_ZOOM` (6, full-viewport country
// overview) and `ACTOR_ZOOM` (11, fly-to-a-selected-actor) stay in
// `LeafletMap.tsx` on purpose (T-2 review) — a ~300px map embedded in a form
// needs its own value, not a borrowed one, so FR-8's "one definition, no new
// coupling" holds for the constants that are actually shared (§7.2) without
// smuggling view policy in behind it.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import {
  formatCoordinate,
  isSamePoint,
  parseCoordinatePair,
  type CoordinatePoint,
} from '@/lib/geo/coordinates';
import { TANZANIA_BOUNDS, OSM_TILE_URL, OSM_ATTRIBUTION } from './map-constants';

// ── Constants ────────────────────────────────────────────────────────────────

// This picker's zoom for a PLACED point (FR-2 sc. 1) — close enough to place
// a pin precisely in a ~300px-tall embedded map. Deliberately NOT imported
// from `LeafletMap.tsx` (forward pointer 2), and NOT used for the empty
// view (FR-2 sc. 2): z12 over a ~300px container shows ≈12 km, not a
// country (T-3 review FAIL 2 — measured ≈38 m/px at -6.37° lat). The empty
// view is framed by `fitBounds` in the init effect below instead.
const PICKER_ZOOM = 12;

// ── Marker styling (NFR-3) ───────────────────────────────────────────────────

/**
 * Builds the picker's single draggable-marker icon. Inline `var(--token)`
 * styles only, following `LeafletMap`'s `buildDivIcon` pattern — the divIcon
 * HTML string is injected at runtime and never scanned by Tailwind, so a
 * class name here would silently purge (NFR-3).
 */
function buildMarkerIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div
        aria-label="Selected location"
        style="
          background: var(--color-primary);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid var(--color-surface);
          box-shadow: var(--shadow-sm);
        "
      ></div>
    `.trim(),
    className: '', // Clear Leaflet's default white box background.
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/**
 * Creates a marker at `point`, wired to call `onDragEnd` with its new
 * position once a drag settles. Shared by the placement effect and the map
 * `click` handler so both paths produce an identical marker rather than two
 * hand-maintained copies.
 */
function createMarker(
  point: CoordinatePoint,
  draggable: boolean,
  onDragEnd: (lat: number, lng: number) => void,
): L.Marker {
  const marker = L.marker([point.lat, point.lng], {
    icon: buildMarkerIcon(),
    draggable,
    // `alt` only reaches an `<img>` element (`icon.tagName === 'IMG'` in
    // Leaflet's `Marker._initIcon`), and `DivIcon.createIcon` builds a
    // `<div>` — so `alt` alone is silently dropped here. `title` applies to
    // any element and is what actually reaches this marker, which is
    // keyboard-focusable by default (`keyboard: true` → `tabIndex=0`,
    // `role="button"`).
    alt: 'Selected location',
    title: 'Selected location',
  });
  marker.on('dragend', () => {
    const pos = marker.getLatLng();
    // Same wrap as the map `click` handler below, and for the same reason:
    // with `maxBounds` gone (T-3 review FAIL 1) and `TileLayer`'s `noWrap`
    // at its default `false` (leaflet-src.js, `@option noWrap: Boolean =
    // false`), OSM's tiles repeat horizontally, so the rendered viewport
    // itself can sit past longitude 180 — panning to 175–190 and dragging
    // the marker there yields `pos.lng` like 185, which
    // `parseCoordinatePair` would reject as out of range. Folding it back
    // onto the same meridian here, in the one dragend handler both write
    // paths share, keeps the two paths from re-diverging. Latitude needs no
    // equivalent: Leaflet's default CRS (`EPSG3857`) only sets `wrapLng`,
    // never `wrapLat`, because `SphericalMercator.unproject`'s
    // `2 * atan(exp(y / R)) - PI/2` asymptotes toward ±90° for any finite Y
    // and can never reach or cross it.
    const lng = L.Util.wrapNum(pos.lng, [-180, 180], true);
    onDragEnd(pos.lat, lng);
  });
  return marker;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CoordinatePickerMapProps {
  /** Raw form field value — the picker never holds its own copy (design.md §3). */
  latitude: string;
  /** Raw form field value — the picker never holds its own copy (design.md §3). */
  longitude: string;
  /** The only write path (DD-2) — always called with both values together. */
  onChange: (lat: string, lng: string) => void;
  /** Mirrors the form's `submitting` state — dragging/clicking must not write while true. */
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CoordinatePickerMap({
  latitude,
  longitude,
  onChange,
  disabled = false,
}: CoordinatePickerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Keep the latest callback/flag available to event handlers registered
  // once at mount, without re-registering them on every render (the
  // `advanced-use-latest` / `advanced-event-handler-refs` pattern) and
  // without pulling `onChange`/`disabled` into the mount effect's
  // dependency array, which would defeat its "run once" contract.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const disabledRef = useRef(disabled);
  useEffect(() => {
    disabledRef.current = disabled;
  });

  // ── Map initialization (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // No `center`/`zoom` option — Leaflet supports constructing a map with
    // no initial view and setting one afterwards. `fitBounds` below computes
    // both from the container's measured size; the placement effect
    // (declared next, runs right after this one on mount) then overrides it
    // with `setView(point, PICKER_ZOOM)` whenever a point already exists —
    // so this framing is only ever what a person with no coordinates yet
    // sees (FR-2 sc. 2).
    const map = L.map(containerRef.current);
    // TANZANIA_BOUNDS is a `readonly` tuple (design.md §7.2); spread into a
    // fresh mutable tuple before casting — Leaflet's types carry no
    // `readonly`, so passing it straight through fails here too. This is a
    // call **argument**, not an assignment, so the code differs from
    // `map-constants.ts`'s genuinely measured TS2322: with the spread
    // removed, `npx tsc --noEmit` reports TS2345, "Argument of type
    // 'readonly [readonly [number, number], readonly [number, number]]' is
    // not assignable to parameter of type 'LatLngBoundsExpression'."
    map.fitBounds(TANZANIA_BOUNDS.map((corner) => [...corner]) as L.LatLngBoundsExpression);

    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 18,
    }).addTo(map);

    // Registered once; reads the latest onChange/disabled via refs (above)
    // so it never goes stale and never needs re-registration.
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (disabledRef.current) return;

      // T-3 review FAIL 1 removed `maxBounds` here — it used to clamp
      // panning to the Tanzania bbox (Leaflet's `_limitCenter`), which made
      // a genuinely out-of-country point (e.g. a transposed lat/lng pair)
      // unviewable — exactly the failure this feature exists to expose.
      // Without that clamp, panning past the antimeridian is reachable and
      // `event.latlng.lng` can leave [-180, 180] (e.g. 200), which
      // `parseCoordinatePair` would then reject as out of range.
      // `L.Util.wrapNum` (leaflet-src.js) folds it back onto the same
      // meridian first — verified: `wrapNum(200, [-180, 180], true) ===
      // -160`. `createMarker`'s `dragend` callback applies the identical
      // wrap for the same reason — a drag can leave [-180, 180] too, once
      // panning already put the viewport there.
      const lng = L.Util.wrapNum(event.latlng.lng, [-180, 180], true);
      const point: CoordinatePoint = { lat: event.latlng.lat, lng };
      const existing = markerRef.current;
      if (existing) {
        existing.setLatLng([point.lat, point.lng]);
      } else {
        // disabledRef.current is already known false (the guard above
        // returned otherwise), so the new marker is always draggable here.
        const created = createMarker(point, true, (lat, lng) => {
          onChangeRef.current(formatCoordinate(lat), formatCoordinate(lng));
        });
        created.addTo(map);
        markerRef.current = created;
      }
      onChangeRef.current(formatCoordinate(point.lat), formatCoordinate(point.lng));
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []); // Only once — TANZANIA_BOUNDS is a constant; onChange/disabled read via refs above.

  // ── Marker placement (mount + every latitude/longitude change) ──────────────
  // This effect ALSO fires on the initial render (React runs every effect
  // once after the first commit), so it is what places the pin and centers
  // on it when the form opens (FR-2) as well as on every later prop change
  // (FR-3) — there is no separate mount-only placement branch to keep in
  // sync with this one. That guarantee holds only because this effect is
  // declared AFTER the init effect above: React runs passive effects in
  // declaration order, so `mapRef.current` is already set by the time this
  // one runs on mount. Reorder the two and the `if (!map) return;` guard
  // below swallows the break silently — FR-2 stops working with no error
  // anywhere.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const point = parseCoordinatePair(latitude, longitude);

    if (point === null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const existing = markerRef.current;
    if (existing) {
      // DD-4 guard, both passes: right after a drag the marker sits at
      // ~13 dp while `onChange` has just written 5-dp strings, so this
      // first comparison reports NOT equal and `setLatLng` below snaps the
      // marker to exactly the parsed value — that snap is what stops the
      // loop. The NEXT render re-parses the same 5-dp strings, finds the
      // marker already there, and reports equal (no redraw). A hand-typed
      // value is placed verbatim on first encounter, so its "first pass"
      // already reports equal.
      if (isSamePoint(existing.getLatLng(), latitude, longitude)) {
        return;
      }
      existing.setLatLng([point.lat, point.lng]);
      map.panTo([point.lat, point.lng]);
      return;
    }

    // First placement (mount with coordinates already set) or re-placement
    // after a `null` gap: create the marker at exactly the parsed value
    // (forward pointer 1) and center on it.
    const created = createMarker(point, !disabledRef.current, (lat, lng) => {
      onChangeRef.current(formatCoordinate(lat), formatCoordinate(lng));
    });
    created.addTo(map);
    markerRef.current = created;
    map.setView([point.lat, point.lng], PICKER_ZOOM);
  }, [latitude, longitude]);

  // ── Interactivity toggle (disabled while the form is submitting) ────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (disabled) {
      map.dragging.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      markerRef.current?.dragging?.disable();
    } else {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      markerRef.current?.dragging?.enable();
    }
  }, [disabled]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    // h-80: fixed height from the Tailwind spacing scale (design.md §7.4) —
    // not an arbitrary value. border + rounded-md, not a shadow, carries the
    // section boundary: `--color-surface` on `--color-bg` is only 1.05:1
    // (frontend/CLAUDE.md).
    <div
      ref={containerRef}
      className="relative h-80 w-full overflow-hidden rounded-md border border-border"
      aria-label="Map for setting the location"
      aria-disabled={disabled || undefined}
      role="application"
    />
  );
}
