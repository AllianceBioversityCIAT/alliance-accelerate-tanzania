'use client';

// ActorCard — one card in the public actor directory grid (FR-1, NFR-3, NFR-4, NFR-6).
//
// Displays (per FR-1, design.md §5):
//   • Actor name (traderName) — accessible heading
//   • RoleBadge (role label + color swatch)
//   • Region · District (district optional — never shows null/undefined)
//   • Crop chips — token-colored, one per crops[] slug (reuses ActorPopup approach)
//   • Capacity (capacityTons + " t"; shown as "—" when null/undefined)
//   • Links to /profile?id=<actor.id> via Next <Link> (FR-1, FR-7)
//
// PII contract (NFR-1): PublicActor carries no phone/email fields.
// This component MUST NOT reference or render phone or email — enforced by type.
// Token-driven: no raw hex (NFR-4).

import Link from 'next/link';
import type { PublicActor } from '@/lib/api/actors';
import { CROPS } from '@/lib/content/crops';
import RoleBadge from '@/components/map/RoleBadge';

// ── Crop chip helper (mirrors ActorPopup.tsx) ─────────────────────────────────

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

export interface ActorCardProps {
  /** PII-safe actor shape — no phone/email exists on this type (NFR-1). */
  actor: PublicActor;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Card for one consented actor in the directory grid.
 * Links to the Actor Profile via /profile?id=<actor.id> (FR-1, FR-7).
 * Keyboard-focusable via <Link>; focus ring uses focus-visible:ring-primary (NFR-3).
 */
export default function ActorCard({ actor }: ActorCardProps) {
  const { id, traderName, region, district, traderType, capacityTons, crops } = actor;

  // Resolve crop content entries from the actor's crop slugs (mirrors ActorPopup.tsx).
  const cropEntries = crops
    .map((slug) => CROPS.find((c) => c.slug === slug))
    .filter(Boolean) as typeof CROPS;

  // Location string: "Region · District" or just "Region" (never null/undefined — FR-1)
  const location = district ? `${region} · ${district}` : region;

  return (
    // Card surface: bg-surface, border-border token driven. Hover lifts shadow.
    // focus-visible ring on the inner link satisfies keyboard focus visibility (NFR-3).
    <article
      className="flex flex-col rounded-md border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"
      aria-label={traderName}
    >
      {/* ── Actor name ─────────────────────────────────────────────────────── */}
      <h3 className="mb-1.5 text-sm font-semibold text-fg leading-snug">
        {traderName}
      </h3>

      {/* ── Role badge ────────────────────────────────────────────────────── */}
      <div className="mb-2">
        <RoleBadge traderType={traderType} />
      </div>

      {/* ── Region · District ─────────────────────────────────────────────── */}
      <p className="mb-2 text-xs text-muted">{location}</p>

      {/* ── Crop chips ────────────────────────────────────────────────────── */}
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

      {/* ── Capacity ──────────────────────────────────────────────────────── */}
      <p className="mb-4 text-xs text-muted">
        <span className="font-medium text-fg">Capacity:</span>{' '}
        {capacityTons != null ? `${capacityTons} t` : '—'}
      </p>

      {/* ── View Profile link → /profile?id=<id> ─────────────────────────── */}
      {/*
        mt-auto: pushes the link to the card bottom so cards in the same row
        have a consistent bottom-aligned CTA regardless of content height.
      */}
      <div className="mt-auto">
        <Link
          href={`/profile?id=${id}`}
          className="inline-block rounded-sm bg-primary px-3 py-1 text-xs font-medium text-primary-fg transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`View profile for ${traderName}`}
        >
          View Profile
        </Link>
      </div>
    </article>
  );
}
