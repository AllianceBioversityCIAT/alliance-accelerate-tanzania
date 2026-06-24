'use client';

// ActorPopup — popup content for a Leaflet marker (FR-3, NFR-4, NFR-5).
//
// Rendered via react-dom/server renderToString() and injected into a Leaflet
// popup's HTML content (see LeafletMap.tsx). Also usable standalone in RTL tests.
//
// Displays (per FR-3, design.md §8):
//   • Actor name (traderName)
//   • RoleBadge (role label + swatch)
//   • Region · District (district optional)
//   • Crop chips — one per crops[] slug, token-colored via CROPS
//   • Capacity (capacityTons + " t"; shown as "—" when null/undefined)
//   • "View Profile" link → /profile?id=<id> (FR-7, design.md §5)
//
// PII contract (NFR-5): PublicActor carries no phone/email fields.
// This component MUST NOT reference or render phone or email — enforced by type.

import type { PublicActor } from '@/lib/api/actors';
import { CROPS } from '@/lib/content/crops';
import RoleBadge from './RoleBadge';

// ── Crop chip helper ──────────────────────────────────────────────────────────

/**
 * Static text-color class map for crop chips.
 * Full class strings required so Tailwind content scan keeps them in the bundle.
 */
const CROP_TEXT_CLASS: Record<string, string> = {
  'crop-sorghum':   'text-crop-sorghum',
  'crop-bean':      'text-crop-bean',
  'crop-groundnut': 'text-crop-groundnut',
};

/**
 * Static border-color class map for crop chips.
 * Full class strings required for purge safety.
 */
const CROP_BORDER_CLASS: Record<string, string> = {
  'crop-sorghum':   'border-crop-sorghum',
  'crop-bean':      'border-crop-bean',
  'crop-groundnut': 'border-crop-groundnut',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ActorPopupProps {
  /** PII-safe actor shape — no phone/email exists on this type (NFR-5). */
  actor: PublicActor;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Popup card for one consented actor.
 * Designed to render both in React (normal JSX tree) and via renderToString()
 * for injection into a Leaflet popup — keep it free of browser-only hooks.
 */
export default function ActorPopup({ actor }: ActorPopupProps) {
  // Resolve crop content entries from the actor's crop slugs.
  const cropEntries = actor.crops
    .map((slug) => CROPS.find((c) => c.slug === slug))
    .filter(Boolean) as typeof CROPS;

  return (
    <div className="w-56 min-w-0 rounded-md bg-surface p-3 shadow-md">

      {/* Actor name */}
      <p className="mb-1 truncate text-sm font-semibold text-fg leading-tight">
        {actor.traderName}
      </p>

      {/* Role badge */}
      <div className="mb-2">
        <RoleBadge traderType={actor.traderType} />
      </div>

      {/* Region · District */}
      <p className="mb-2 text-xs text-muted">
        {actor.region}
        {actor.district ? <> &middot; {actor.district}</> : null}
      </p>

      {/* Crop chips */}
      {cropEntries.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1" aria-label="Crops">
          {cropEntries.map((crop) => {
            const textClass   = CROP_TEXT_CLASS[crop.tokenClass]   ?? 'text-muted';
            const borderClass = CROP_BORDER_CLASS[crop.tokenClass] ?? 'border-border';
            return (
              <span
                key={crop.slug}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${textClass} ${borderClass}`}
              >
                {crop.name}
              </span>
            );
          })}
        </div>
      )}

      {/* Capacity */}
      <p className="mb-3 text-xs text-muted">
        <span className="font-medium text-fg">Capacity:</span>{' '}
        {actor.capacityTons != null ? `${actor.capacityTons} t` : '—'}
      </p>

      {/* View Profile — FR-7 / design.md §5: deep-links to the Profile route */}
      <a
        href={`/profile?id=${actor.id}`}
        className="inline-block rounded-sm bg-primary px-3 py-1 text-xs font-medium text-primary-fg hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        View Profile
      </a>
    </div>
  );
}
