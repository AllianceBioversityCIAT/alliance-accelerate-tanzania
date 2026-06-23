'use client';

// LeafletMap — the actual client-only Leaflet map (DD-1, NFR-1).
// This module is the dynamic-import target from ActorMap.tsx; Leaflet and its
// CSS are imported HERE so they stay out of the static bundle (NFR-1).
//
// T-3 additions (pins/popup/legend — FR-2, FR-3, FR-5 partial, FR-6, NFR-4):
//   - Role-colored divIcon markers (one per actor with gps).
//     Color via CSS custom-property inline style (purge-proof, token-compliant NFR-4).
//   - Marker click → onSelectActor(actor.id) + opens popup.
//   - Popup content = renderToString(<ActorPopup>) (static HTML, no PII).
//   - Fly-to on selectedActorId change (motion-reduce guarded — NFR-3).
//   - MapLegend overlay rendered via a Leaflet custom Control.
//   - Marker layer group: cleared + rebuilt when actors prop changes.
//
// T-2 baseline remains:
//   - OSM TileLayer, Tanzania center/bounds, container aria-label (NFR-3).
//   - useRef + useEffect lifecycle (init once, remove on unmount).

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import React, { useEffect, useRef } from 'react';
import { renderToString } from 'react-dom/server';
import type { PublicActor } from '@/lib/api/actors';
import type { TraderType } from '@/lib/content/roles';
import { ROLE_CSS_VAR } from './RoleBadge';
import ActorPopup from './ActorPopup';
import MapLegend from './MapLegend';

// ── Constants ────────────────────────────────────────────────────────────────

// Tanzania geographic center and suitable initial zoom level.
const TANZANIA_CENTER: L.LatLngExpression = [-6.37, 34.89];
const INITIAL_ZOOM = 6;
// Zoom level used when flying to a single actor.
const ACTOR_ZOOM = 11;

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

// ── Marker helpers ────────────────────────────────────────────────────────────

/**
 * Creates a role-colored divIcon for a given traderType.
 *
 * Color strategy (NFR-4 / "divIcon purge" concern):
 *   We use `style="background: var(--<token>)"` with the CSS custom property
 *   from ROLE_CSS_VAR, NOT a Tailwind class. This is purge-proof because the
 *   divIcon HTML string is injected at runtime and is not scanned by Tailwind.
 *   The CSS variables are defined in globals.css (@layer base) and always
 *   present in the browser regardless of Tailwind purge.
 *   No raw hex values — only CSS var references (token-compliant).
 *
 * Accessible name: the `title` attribute on the outer div surfaces the actor
 * name to screen readers via the marker's accessible label (NFR-3).
 */
function buildDivIcon(actor: PublicActor): L.DivIcon {
  const cssVar  = ROLE_CSS_VAR[actor.traderType as TraderType] ?? '--color-muted';
  const bgStyle = `background: var(${cssVar})`;
  // Encode the actor name for safe embedding in HTML attribute.
  const safeName = actor.traderName.replace(/"/g, '&quot;');

  return L.divIcon({
    // NFR-3: title used as the marker's accessible label.
    html: `
      <div
        title="${safeName}"
        aria-label="${safeName}"
        style="
          ${bgStyle};
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid var(--color-surface);
          box-shadow: var(--shadow-sm);
        "
      ></div>
    `.trim(),
    className: '',      // Clear Leaflet's default white box background.
    iconSize:    [18, 18],
    iconAnchor:  [9, 9],
    popupAnchor: [0, -12],
  });
}

/**
 * Renders the popup HTML for an actor using ActorPopup.
 * renderToString is appropriate here: the popup content is static (no
 * browser-only hooks needed), and Leaflet manages the DOM node itself.
 */
function buildPopupContent(actor: PublicActor): string {
  return renderToString(React.createElement(ActorPopup, { actor }));
}

// ── Legend Control ────────────────────────────────────────────────────────────

/**
 * Adds the MapLegend as a custom Leaflet Control so it lives within the Leaflet
 * DOM tree (respects z-index stacking, pointer events, etc.).
 *
 * renderToString is used for the same reason as popups — static HTML, no hooks.
 */
function addLegendControl(map: L.Map): L.Control {
  const LegendControl = L.Control.extend({
    options: { position: 'bottomleft' as L.ControlPosition },
    onAdd() {
      const container = L.DomUtil.create('div', '');
      container.innerHTML = renderToString(React.createElement(MapLegend));
      // Prevent map drag/click from passing through the legend panel.
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    },
  });
  const control = new LegendControl();
  control.addTo(map);
  return control;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LeafletMapProps {
  /** Actors to plot. Those without gps are skipped (list-only — T-4 scope). */
  actors: PublicActor[];
  /**
   * Currently selected actor ID (forwarded from page via ActorMap).
   * When set, the map flies to that actor's pin and opens its popup (FR-5 partial).
   */
  selectedActorId: string | null;
  /**
   * Callback fired when a pin is clicked — updates page-level selectedActorId.
   */
  onSelectActor: (id: string | null) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LeafletMap({
  actors,
  selectedActorId,
  onSelectActor,
}: LeafletMapProps) {
  const containerRef   = useRef<HTMLDivElement | null>(null);
  const mapRef         = useRef<L.Map | null>(null);
  // Stable marker layer group — rebuilt when actors change.
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  // Map: actorId → marker, so we can locate a marker by selectedActorId.
  const markerMapRef   = useRef<Map<string, L.Marker>>(new Map());

  // ── Map initialization (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center:    TANZANIA_CENTER,
      zoom:      INITIAL_ZOOM,
      maxBounds: TANZANIA_BOUNDS,
      maxBoundsViscosity: 0.85,
    });

    // OSM raster tile layer (NFR-4: OSM attribution required).
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 18,
    }).addTo(map);

    // Create the marker layer group (cleared + repopulated in the actors effect).
    const group = L.layerGroup().addTo(map);
    markerGroupRef.current = group;

    // Add the legend control (FR-2, FR-6).
    addLegendControl(map);

    mapRef.current = map;

    // Capture ref values at effect-run time for safe use in cleanup
    // (react-hooks/exhaustive-deps: ref.current may change before cleanup fires).
    const markerMap = markerMapRef.current;

    return () => {
      map.remove();
      mapRef.current         = null;
      markerGroupRef.current = null;
      markerMap.clear();
    };
  }, []); // Only once — center/bounds are constants.

  // ── Marker layer (rebuilt when actors changes) ───────────────────────────────
  useEffect(() => {
    const map   = mapRef.current;
    const group = markerGroupRef.current;
    if (!map || !group) return;

    // Clear previous markers.
    group.clearLayers();
    markerMapRef.current.clear();

    // Add one marker per actor that has valid GPS data.
    actors
      .filter((a) => a.gps != null)
      .forEach((actor) => {
        const latlng: L.LatLngExpression = [actor.gps!.lat, actor.gps!.long];

        const marker = L.marker(latlng, {
          icon:  buildDivIcon(actor),
          // `title` provides the native browser tooltip and is used by some
          // assistive technologies as the marker's accessible name (NFR-3).
          title: actor.traderName,
          alt:   actor.traderName,
        });

        // Bind popup with rendered ActorPopup HTML.
        marker.bindPopup(buildPopupContent(actor), {
          // Widen the default popup slightly to fit the ActorPopup card.
          maxWidth: 240,
          // Keep popup DOM accessible by allowing focus within it.
          autoPan: true,
        });

        // On click: update page-level selection AND open popup.
        marker.on('click', () => {
          onSelectActor(actor.id);
          marker.openPopup();
        });

        markerMapRef.current.set(actor.id, marker);
        group.addLayer(marker);
      });
  }, [actors, onSelectActor]); // Rebuild whenever the actors array reference changes.

  // ── Fly-to on selection change (FR-5 partial, NFR-3 motion-reduce) ───────────
  useEffect(() => {
    const map    = mapRef.current;
    if (!map || selectedActorId == null) return;

    const marker = markerMapRef.current.get(selectedActorId);
    if (!marker) return;

    const latlng = marker.getLatLng();

    // Respect user's motion-preference setting (NFR-3 / prefers-reduced-motion).
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Instant jump — no animation.
      map.setView(latlng, ACTOR_ZOOM);
    } else {
      // Smooth fly-to.
      map.flyTo(latlng, ACTOR_ZOOM);
    }

    // Open the popup after positioning the view.
    marker.openPopup();
  }, [selectedActorId]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    // h-full + min-h-[480px]: ensures the map region has a concrete height (NFR-2).
    // w-full: map fills its horizontal space in the two-region layout.
    // relative: required for the MapLegend Leaflet control z-index context.
    // Tokens drive any chrome — no raw hex (NFR-4).
    <div
      ref={containerRef}
      className="relative h-full min-h-[480px] w-full"
      // NFR-3: non-decorative interactive region — accessible label for screen readers.
      aria-label="Map of Tanzania seed-system actors"
      // role="application" tells assistive technology this is an interactive
      // region with its own keyboard interaction model (Leaflet pan/zoom).
      role="application"
    />
  );
}
