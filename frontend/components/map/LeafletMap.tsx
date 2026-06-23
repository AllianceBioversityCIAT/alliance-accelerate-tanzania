'use client';

// LeafletMap — the actual client-only Leaflet map (DD-1, NFR-1).
// This module is the dynamic-import target from ActorMap.tsx; Leaflet and its
// CSS are imported HERE so they stay out of the static bundle (NFR-1).
//
// T-2 scope (minimal):
//   - OSM TileLayer, Tanzania center/initial zoom, optional maxBounds.
//   - Container aria-label (NFR-3).
//   - useRef + useEffect lifecycle (init on mount, remove on unmount — no leaks).
//   - Accepts `actors` prop — pins NOT rendered yet (T-3 scope).
//
// T-3 will add: role-colored divIcon markers, ActorPopup, fly-to, MapLegend.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { PublicActor } from '@/lib/api/actors';

// ── Constants ────────────────────────────────────────────────────────────────

// Tanzania geographic center and suitable initial zoom level.
const TANZANIA_CENTER: L.LatLngExpression = [-6.37, 34.89];
const INITIAL_ZOOM = 6;

// Approximate bounding box for Tanzania — keeps the initial view focused.
// [southWest, northEast] in [lat, lng] form.
const TANZANIA_BOUNDS: L.LatLngBoundsExpression = [
  [-11.75, 29.34], // SW corner
  [ -0.98, 40.44], // NE corner
];

// OSM tile URL + required attribution (OpenStreetMap policy).
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// ── Props ────────────────────────────────────────────────────────────────────

export interface LeafletMapProps {
  /**
   * Actors to plot as pins. Passed now so the prop contract is stable for T-3.
   * Pins are NOT rendered in T-2 (T-3 scope).
   */
  actors: PublicActor[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LeafletMap({ actors: _actors }: LeafletMapProps) {
  // `_actors` accepted but unused until T-3 adds markers — prefix suppresses lint.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef       = useRef<L.Map | null>(null);

  useEffect(() => {
    // Guard: only initialize once and only if the container is mounted.
    if (!containerRef.current || mapRef.current) return;

    // Initialize the Leaflet map instance.
    const map = L.map(containerRef.current, {
      center:    TANZANIA_CENTER,
      zoom:      INITIAL_ZOOM,
      maxBounds: TANZANIA_BOUNDS,
      // Pad the bounds slightly so the user can pan to the edge before snapping back.
      maxBoundsViscosity: 0.85,
    });

    // OSM raster tile layer (OpenStreetMap — NFR-4: OSM attribution required).
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      // Reasonable max zoom for the dataset density in v1.
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;

    // Cleanup: remove the map instance on unmount to prevent memory leaks
    // (important in React strict-mode where effects run twice in development).
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // Run only once — center/bounds are constants.

  return (
    // h-full + min-h-[480px]: ensures the map region has a concrete height
    // even when the parent container hasn't resolved a height yet (NFR-2).
    // w-full: map fills its horizontal space in the two-region layout.
    // Tokens drive any chrome — no raw hex (NFR-4).
    <div
      ref={containerRef}
      className="h-full min-h-[480px] w-full"
      // NFR-3: non-decorative interactive region — provide an accessible label
      // so screen-reader users know the region's purpose.
      aria-label="Map of Tanzania seed-system actors"
      // Role="application" tells assistive technology this is an interactive
      // region with its own keyboard interaction model (Leaflet pan/zoom).
      role="application"
    />
  );
}
