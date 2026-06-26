/**
 * crops.ts — static crop content for the ACCELERATE Tanzania Seed Registry.
 * T-6 (FR-4, System Design §7 crop tokens).
 *
 * Provides the three priority crops — sorghum, common bean, groundnut — with
 * display copy and the Tailwind crop token suffix used for accent styling.
 * CropCard derives accent utilities from `tokenClass` without hardcoding hex.
 *
 * Slug values mirror the Metrics contract (metrics.ts CropMetric.slug).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Slug values mirror the CropMetric contract — never deviate from these. */
export type CropSlug = 'sorghum' | 'common_bean' | 'groundnut';

/**
 * Tailwind crop token suffix.  Combine with a CSS property prefix to produce
 * a utility class, e.g. `text-${entry.tokenClass}` → `text-crop-sorghum`.
 * Available utilities: text-*, border-*, bg-* (see tailwind.config.ts crop key).
 */
export type CropTokenClass = 'crop-sorghum' | 'crop-bean' | 'crop-groundnut';

export interface CropContent {
  /** Matches CropMetric.slug from the Metrics API contract. */
  slug: CropSlug;
  /** Human-readable display name. */
  name: string;
  /**
   * Short institutional description (1–2 sentences).
   * Voice matches the Hero copy: clear, authoritative, stakeholder-oriented.
   */
  description: string;
  /**
   * Tailwind token suffix for crop accent colour.
   * Derive utilities as `text-${tokenClass}`, `border-${tokenClass}`, etc.
   * Mapping (System Design §7): sorghum→crop-sorghum, common_bean→crop-bean,
   * groundnut→crop-groundnut.  No raw hex — always reference via this token.
   */
  tokenClass: CropTokenClass;
  /**
   * Path to the transparent crop cutout image (relative to /public).
   * Used by CropImage to render the image-led card panel.
   */
  image: string;
  /**
   * Representative improved varieties released under ACCELERATE (copy brief §4.2).
   * Optional — absent in test fixtures or future crops that predate the brief.
   * Rendered as a muted sub-label in CropCard and on the About Crops section.
   */
  varieties?: string[];
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * Priority crop entries for the ACCELERATE Tanzania seed system.
 * Order matches the Metrics API crops array ordering convention.
 */
export const CROPS: CropContent[] = [
  {
    slug: 'sorghum',
    name: 'Sorghum',
    description:
      'A drought-tolerant staple crop central to Tanzania’s food security agenda, with a growing network of certified seed producers and agro-dealer distributors along formal value chains.',
    // System Design §7: sorghum → crop-sorghum token (#C9821B)
    tokenClass: 'crop-sorghum',
    image: '/crops/sorghum.webp',
    varieties: ['TARI SOR 1', 'TARI SOR 2'],
  },
  {
    slug: 'common_bean',
    name: 'Common Bean',
    description:
      'Tanzania’s most widely traded legume, linking smallholder producers to regional cooperatives, offtakers, and institutional buyers across multiple market segments.',
    // System Design §7: common_bean → crop-bean token (#7A3B2E)
    tokenClass: 'crop-bean',
    image: '/crops/common-bean.webp',
    varieties: ['TARI Bean 2–6', 'Uyole 16/18', 'Selian 13', 'Calima Uyole'],
  },
  {
    slug: 'groundnut',
    name: 'Groundnut',
    description:
      'A high-value oil crop connecting seed companies, processors, and export-oriented agribusinesses within an expanding Tanzanian seed-system value chain.',
    // System Design §7: groundnut → crop-groundnut token (#8A8D2B)
    tokenClass: 'crop-groundnut',
    image: '/crops/groundnut.webp',
    varieties: ['Naliendele 2016', 'Narinut 2015', 'Tanzanut 2016', 'TARIKA 1 & 2'],
  },
];
