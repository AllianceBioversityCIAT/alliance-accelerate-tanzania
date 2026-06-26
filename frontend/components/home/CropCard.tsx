// CropCard — single crop card with live actor count (T-6, FR-4, System Design §7/§8).
// Server component: no 'use client' needed — purely presentational, no hooks.
//
// Accent strategy: CropImage renders a tinted panel at the top of the card
// (image-led design). The crop name heading carries the accent colour via
// ACCENT_TEXT lookup. The old border-t-4 top accent is removed.
//
// Fallback: when mappedActors is null/undefined, renders an em-dash "—" per FR-4.
//
// Usage:
//   <CropCard crop={entry} mappedActors={count} loading={loading} />

import Skeleton from '@/components/ui/Skeleton';
import CropImage from '@/components/home/CropImage';
import type { CropContent, CropTokenClass } from '@/lib/content/crops';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CropCardProps {
  /** Crop content entry from the CROPS array (lib/content/crops.ts). */
  crop: CropContent;
  /**
   * Live mapped-actor count from the Metrics API.
   * null / undefined when metrics are unavailable — renders em-dash fallback.
   */
  mappedActors: number | null | undefined;
  /** When true, render a Skeleton for the actor count slot. */
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Accent class lookup — full class strings visible for Tailwind content scan.
// Maps CropTokenClass to the heading text colour token.
// ---------------------------------------------------------------------------

const ACCENT_TEXT: Record<CropTokenClass, string> = {
  'crop-sorghum':   'text-crop-sorghum',
  'crop-bean':      'text-crop-bean',
  'crop-groundnut': 'text-crop-groundnut',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CropCard({ crop, mappedActors, loading }: CropCardProps) {
  // Derive display value for the per-crop actor count
  const displayCount =
    loading ? null
    : typeof mappedActors === 'number' && isFinite(mappedActors)
      ? mappedActors.toLocaleString()
      : '—';

  return (
    // Image-led card: tinted panel on top via CropImage, then content below.
    // No border-t-4 accent — the image panel carries the crop identity now.
    <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-sm flex flex-col">

      {/* Tinted image panel — shared with /about crop cards */}
      <CropImage crop={crop} />

      {/* Card content */}
      <div className="px-5 py-5 flex flex-col gap-3 flex-1">
        {/* Crop name — colored with the crop accent token */}
        <h3 className={['text-lg font-bold leading-snug', ACCENT_TEXT[crop.tokenClass]].join(' ')}>
          {crop.name}
        </h3>

        {/* Description copy */}
        <p className="text-sm text-muted leading-relaxed flex-1">
          {crop.description}
        </p>

        {/* Per-crop actor count */}
        <div className="flex items-baseline gap-2 mt-2">
          <div className="h-7 flex items-center" aria-live="polite">
            {loading ? (
              <Skeleton className="h-6 w-14" />
            ) : (
              <span className="text-2xl font-bold text-fg tabular-nums leading-none">
                {displayCount}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-muted tracking-wide">
            mapped actors
          </span>
        </div>
      </div>
    </div>
  );
}
