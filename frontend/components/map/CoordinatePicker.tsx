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
// Owns three things `CoordinatePickerMap` does not: the open/closed
// disclosure (FR-7 sc. 1 — the shell must not even be RENDERED while closed,
// not just visually hidden, per the T-3 review's `fitBounds`/`getSize()`
// hazard), the clear control (FR-4), and the device-location control (ATP-80),
// which needs no Leaflet and writes through the same `onChange`. Holds no
// coordinate state itself — `latitude`/`longitude` are passed straight
// through, and `onChange` is the one write path (DD-2): there is no
// `onLatitudeChange`/`onLongitudeChange` pair to keep in sync, so a
// single-field write is inexpressible here by construction, not by discipline.

import dynamic from 'next/dynamic';
import { useEffect, useId, useState } from 'react';
import Button from '@/components/ui/Button';
import { OUTSIDE_AFRICA_MESSAGE, formatCoordinate, isInAfrica } from '@/lib/geo/coordinates';

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

// ── Device location (ATP-80) ──────────────────────────────────────────────────

// High accuracy asks a phone for GPS rather than a cell/Wi-Fi estimate; the
// timeout bounds that wait, and maximumAge 0 refuses a fix cached at another site.
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

const MANUAL_FALLBACK = 'You can still enter the coordinates above or pick the point on the map.';

// Keyed by GeolocationPositionError.code (1, 2, 3); `0` is "no geolocation API".
const LOCATE_ERRORS: Record<number, string> = {
  0: `This browser cannot share your location. ${MANUAL_FALLBACK}`,
  1: `Location access is blocked. To use it, allow location for this site in your browser settings. ${MANUAL_FALLBACK}`,
  2: `Your location could not be found. Check that location services are turned on. ${MANUAL_FALLBACK}`,
  3: `Finding your location took too long. Try again, ideally outdoors or near a window. ${MANUAL_FALLBACK}`,
};

type LocateStatus =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'located'; lat: string; lng: string; accuracy: number }
  | { kind: 'error'; message: string };

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
}: Readonly<CoordinatePickerProps>) {
  const [open, setOpen] = useState(initiallyOpen);
  const [locate, setLocate] = useState<LocateStatus>({ kind: 'idle' });
  // A map click/drop outside Africa was refused; cleared once the fields change.
  const [outsideRefused, setOutsideRefused] = useState(false);
  useEffect(() => {
    setOutsideRefused(false);
  }, [latitude, longitude]);
  const mapRegionId = useId();

  function locateDevice() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocate({ kind: 'error', message: LOCATE_ERRORS[0] });
      return;
    }
    setLocate({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isInAfrica(coords.latitude, coords.longitude)) {
          setLocate({
            kind: 'error',
            message: `Your device's location is outside Africa, so it was not used. ${MANUAL_FALLBACK}`,
          });
          return;
        }
        const lat = formatCoordinate(coords.latitude);
        const lng = formatCoordinate(coords.longitude);
        onChange(lat, lng);
        setLocate({ kind: 'located', lat, lng, accuracy: Math.round(coords.accuracy) });
        setOpen(true);
      },
      (error) => {
        setLocate({ kind: 'error', message: LOCATE_ERRORS[error.code] ?? LOCATE_ERRORS[2] });
      },
      GEOLOCATION_OPTIONS,
    );
  }

  // The confirmation describes the values it wrote; once the person edits or
  // clears them it would describe something no longer on screen.
  const located =
    locate.kind === 'located' && locate.lat === latitude && locate.lng === longitude
      ? locate
      : null;
  const locating = locate.kind === 'locating';

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
          disabled={disabled || locating}
          onClick={locateDevice}
        >
          {locating ? 'Finding your location…' : 'Use my current location'}
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
      <p role="status" className="text-xs text-muted empty:hidden">
        {located &&
          `Location set from your device, accurate to about ${located.accuracy} m. Check the pin and drag it to the exact spot if needed.`}
      </p>
      {outsideRefused && (
        <p role="alert" className="text-xs text-danger">
          {`${OUTSIDE_AFRICA_MESSAGE} That point was not set.`}
        </p>
      )}
      {locate.kind === 'error' && (
        <p role="alert" className="text-xs text-danger">
          {locate.message}
        </p>
      )}
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
            onOutsideBounds={() => setOutsideRefused(true)}
          />
        </div>
      )}
    </div>
  );
}
