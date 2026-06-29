/**
 * chart-tokens.ts
 *
 * Maps chart categories to design-token CSS-variable colour strings so that
 * every Recharts SVG fill/stroke stays 100% token-driven — no hex values here.
 *
 * Traces: NFR-5 (tokens only), design.md §5.4 / §8 (ADR-4).
 * Spec: docs/specs/dashboard/discovery-dashboard
 */

/**
 * Crop slug → its crop CSS-variable string.
 * Source vars: globals.css  --crop-sorghum / --crop-bean / --crop-groundnut
 */
export const CROP_COLORS: Record<'sorghum' | 'common_bean' | 'groundnut', string> = {
  sorghum:     'var(--crop-sorghum)',
  common_bean: 'var(--crop-bean)',
  groundnut:   'var(--crop-groundnut)',
};

/**
 * Ordered list of visually-distinct token CSS-variable strings for
 * region / actor-type categorical series.
 * Every entry is a var(--…) reference — no hex anywhere.
 *
 * Token pool drawn from globals.css / tailwind.config.ts:
 *   --color-accent        #008BDB  (blue)
 *   --color-highlight     #29C4A9  (teal)
 *   --crop-sorghum        #C9821B  (amber-orange)
 *   --crop-bean           #7A3B2E  (brown)
 *   --crop-groundnut      #8A8D2B  (olive)
 *   --color-highlight-soft #82C0C7 (soft blue-green)
 *   --color-primary       #1F4E8C  (royal blue)
 *   --color-warning       #C9821B  (amber — same hue as sorghum; kept as semantic alias)
 */
export const CATEGORICAL_COLORS: string[] = [
  'var(--color-accent)',
  'var(--color-highlight)',
  'var(--crop-sorghum)',
  'var(--crop-bean)',
  'var(--crop-groundnut)',
  'var(--color-highlight-soft)',
  'var(--color-primary)',
  'var(--color-warning)',
];

/**
 * Pick a colour from CATEGORICAL_COLORS by index, wrapping around when the
 * index exceeds the palette length.
 *
 * @example
 * // Usage in a Recharts component:
 * <Bar dataKey="value" fill={categoricalColor(0)} />
 * <Bar dataKey="other" fill={categoricalColor(8)} // wraps → index 0
 */
export function categoricalColor(index: number): string {
  return CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length];
}
