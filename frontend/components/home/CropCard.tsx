// CropCard — single crop card with live actor count (T-6, FR-4, System Design §7/§8).
// Server component: no 'use client' needed — purely presentational, no hooks.
//
// Accent strategy: the card carries a top border in the crop's token color.
// The color is derived from `crop.tokenClass` (e.g. "crop-sorghum") using
// Tailwind's `border-${tokenClass}` pattern — no raw hex anywhere (NFR-4).
// Note: Tailwind must see the full class string to include it in the purge
// output; we build the class in a lookup map (ACCENT_CLASSES) so that the
// complete utility strings are statically visible to Tailwind's content scan.
//
// Fallback: when mappedActors is null/undefined, renders an em-dash "—" per FR-4.
//
// Usage:
//   <CropCard crop={entry} mappedActors={count} loading={loading} />

import Skeleton from '@/components/ui/Skeleton';
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
// Derived from CropTokenClass; each entry maps to the border + heading colour.
// ---------------------------------------------------------------------------

const ACCENT_BORDER: Record<CropTokenClass, string> = {
  'crop-sorghum':   'border-t-4 border-crop-sorghum',
  'crop-bean':      'border-t-4 border-crop-bean',
  'crop-groundnut': 'border-t-4 border-crop-groundnut',
};

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
    // bg-surface card with shadow-md and rounded-md — token-only (NFR-4).
    // Colored top border derives accent from the crop's tokenClass.
    <div
      className={[
        'bg-surface shadow-md rounded-md overflow-hidden flex flex-col',
        ACCENT_BORDER[crop.tokenClass],
      ].join(' ')}
    >
      <div className="px-5 py-6 flex flex-col gap-3 flex-1">
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
