'use client';

// CoordinatePicker — the Leaflet-free wrapper for the map coordinate picker
// (enhancement/map-coordinate-picker T-4; design.md §7.3; FR-4, FR-7, DD-2).
//
// Imports NO Leaflet, directly or transitively — this file, and everything
// it imports at the top level, must stay renderable in jsdom (NFR-4's sibling
// concern for the wrapper) and add only its own few kB to whichever route
// mounts it (FR-7). The only reference to the Leaflet shell is behind
// `dynamic()`, so the chunk is fetched only once `open` becomes true.
//
// Owns exactly two things `CoordinatePickerMap` does not: the open/closed
// disclosure (FR-7 sc. 1 — the shell must not even be RENDERED while closed,
// not just visually hidden, per the T-3 review's `fitBounds`/`getSize()`
// hazard) and the clear control (FR-4). Holds no coordinate state itself —
// `latitude`/`longitude` are passed straight through, and `onChange` is the
// one write path (DD-2): there is no `onLatitudeChange`/`onLongitudeChange`
// pair to keep in sync, so a single-field write is inexpressible here by
// construction, not by discipline.

import dynamic from 'next/dynamic';
import { useId, useState } from 'react';
import Button from '@/components/ui/Button';

const CoordinatePickerMap = dynamic(() => import('./CoordinatePickerMap'), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-80 w-full items-center justify-center rounded-md border border-border bg-surface-alt"
      role="status"
      aria-label="Loading map"
    >
      <span className="text-sm text-muted">Loading map…</span>
    </div>
  ),
});

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CoordinatePickerProps {
  /** The raw form field value — passed straight through to the shell once mounted. */
  latitude: string;
  /** The raw form field value — passed straight through to the shell once mounted. */
  longitude: string;
  /** The only write path (DD-2) — always called with both values together. */
  onChange: (lat: string, lng: string) => void;
  /** Seeds the initial open state. NOT a lock — the reveal control can still toggle it. */
  initiallyOpen?: boolean;
  /** Mirrors the host form's `submitting` state. */
  disabled?: boolean;
  /** An existing hint element's id (e.g. `RegistrationForm`'s `gpsHintId`) to join (FR-5). */
  describedBy?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CoordinatePicker({
  latitude,
  longitude,
  onChange,
  initiallyOpen = false,
  disabled = false,
  describedBy,
}: CoordinatePickerProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const mapRegionId = useId();

  // FR-4 sc. 2: disabled, not absent, when there is nothing to clear — a
  // half-filled pair (FR-1 sc. 3) still counts as "something to clear".
  const nothingToClear = latitude.trim() === '' && longitude.trim() === '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={mapRegionId}
          aria-describedby={describedBy}
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? 'Hide map' : 'Show map to set location'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || nothingToClear}
          onClick={() => onChange('', '')}
        >
          Clear location
        </Button>
      </div>
      {/* Conditionally RENDERED, never render-and-hide (T-3 review hard
          constraint): a 0x0 container at mount makes Leaflet's `fitBounds`
          compute `getScaleZoom(0)` = -Infinity, clamped to zoom 0, and the
          view never self-corrects because `invalidateSize` preserves
          centre/zoom on resize. This element does not exist in the DOM at
          all until `open` is true, so the shell is never asked to size
          itself against a container the CSS engine has not laid out yet. */}
      {open && (
        <div id={mapRegionId}>
          <CoordinatePickerMap
            latitude={latitude}
            longitude={longitude}
            onChange={onChange}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
