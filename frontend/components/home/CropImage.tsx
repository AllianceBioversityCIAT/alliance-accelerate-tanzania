// CropImage — shared image panel for crop cards (home + about).
// Server component: no hooks, no 'use client'.
//
// Renders a soft, crop-coloured tinted panel with the centred transparent crop
// cutout image.
//
// Tint strategy: the hex crop vars (--crop-sorghum etc.) don't support Tailwind's
// `/opacity` modifier, so we use dedicated soft-tint tokens (--crop-*-soft, ~12%
// over white) defined in globals.css and exposed as `bg-crop-*-soft`. This gives a
// guaranteed, on-brand panel wash per crop — no raw hex.
//
// Image: decorative cutout (alt="") — the adjacent crop name <h3> labels it
// for assistive technology (WCAG decorative image exemption).
//
// Usage:
//   <CropImage crop={crop} />

import Image from 'next/image';
import type { CropContent, CropTokenClass } from '@/lib/content/crops';

// ---------------------------------------------------------------------------
// Tint lookup — full class strings visible for Tailwind's content scan.
// Soft per-crop panel backgrounds (tokens: globals.css --crop-*-soft).
// ---------------------------------------------------------------------------

const ACCENT_TINT: Record<CropTokenClass, string> = {
  'crop-sorghum':   'bg-crop-sorghum-soft',
  'crop-bean':      'bg-crop-bean-soft',
  'crop-groundnut': 'bg-crop-groundnut-soft',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CropImageProps {
  /** Crop content entry from CROPS (lib/content/crops.ts). */
  crop: CropContent;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CropImage({ crop }: CropImageProps) {
  return (
    <div
      className={[
        'relative flex items-center justify-center h-44',
        ACCENT_TINT[crop.tokenClass],
      ].join(' ')}
    >
      {/*
        Decorative crop cutout — alt="" because the adjacent <h3> names the crop.
        intrinsic size 240×240 px; constrained to h-32 w-auto in the panel.
      */}
      <Image
        src={crop.image}
        width={240}
        height={240}
        className="h-32 w-auto object-contain"
        alt=""
      />
    </div>
  );
}
