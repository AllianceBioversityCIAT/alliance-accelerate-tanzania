// ProfileMarketActivity — crop chips section (FR-5, design.md §5).
// Server-renderable: no hooks, no 'use client'.
//
// Mirrors the crop-chip pattern from ActorPopup.tsx for consistent visual
// encoding. Token-driven (NFR-4): full class strings are present verbatim so
// Tailwind's content scanner keeps the utilities in the bundle (same approach
// as ActorPopup's CROP_TEXT_CLASS / CROP_BORDER_CLASS maps).

import type { PublicActor } from '@/lib/api/actors';
import { CROPS } from '@/lib/content/crops';

// ── Static class maps (purge-safe — full strings required by Tailwind scanner) ──

/** Text-color class per crop token class. */
const CROP_TEXT_CLASS: Record<string, string> = {
  'crop-sorghum':   'text-crop-sorghum',
  'crop-bean':      'text-crop-bean',
  'crop-groundnut': 'text-crop-groundnut',
};

/** Border-color class per crop token class. */
const CROP_BORDER_CLASS: Record<string, string> = {
  'crop-sorghum':   'border-crop-sorghum',
  'crop-bean':      'border-crop-bean',
  'crop-groundnut': 'border-crop-groundnut',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProfileMarketActivityProps {
  /** PII-safe actor shape — no phone/email (NFR-1). */
  actor: PublicActor;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Market activity panel: renders one crop chip per crops[] slug (FR-5).
 * Uses the same token-class pattern as ActorPopup so the visual encoding
 * is consistent across the map popup and the profile page.
 */
export default function ProfileMarketActivity({ actor }: ProfileMarketActivityProps) {
  // Resolve CROPS content entries from the actor's crop slugs
  const cropEntries = actor.crops
    .map((slug) => CROPS.find((c) => c.slug === slug))
    .filter(Boolean) as typeof CROPS;

  return (
    <section aria-labelledby="profile-market-heading" className="mb-6">
      <h2
        id="profile-market-heading"
        className="mb-3 text-base font-semibold text-fg"
      >
        Market Activity
      </h2>

      {cropEntries.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Crops">
          {cropEntries.map((crop) => {
            const textClass   = CROP_TEXT_CLASS[crop.tokenClass]   ?? 'text-muted';
            const borderClass = CROP_BORDER_CLASS[crop.tokenClass] ?? 'border-border';
            return (
              <span
                key={crop.slug}
                className={`rounded-full border px-3 py-1 text-sm font-medium ${textClass} ${borderClass}`}
              >
                {crop.name}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">No crops listed.</p>
      )}
    </section>
  );
}
