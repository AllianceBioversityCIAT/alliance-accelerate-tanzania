/**
 * chart-tokens.test.ts
 *
 * Verifies that every colour exported from chart-tokens.ts is a valid
 * CSS-variable reference and that no hex values leak into chart configs.
 *
 * Traces: NFR-5 (tokens only), design.md §5.4 / §8 (ADR-4).
 */

import {
  CROP_COLORS,
  CATEGORICAL_COLORS,
  categoricalColor,
} from './chart-tokens';

/** All var(--…) strings must match this pattern — no hex/rgb allowed. */
const CSS_VAR_RE = /^var\(--[a-z0-9-]+\)$/;

describe('chart-tokens', () => {
  // ── (a) Token-format guards ────────────────────────────────────────────────

  describe('CROP_COLORS — all values are CSS-variable strings', () => {
    it.each(Object.entries(CROP_COLORS))(
      'CROP_COLORS["%s"] matches /^var(--…)$/',
      (_slug, value) => {
        expect(value).toMatch(CSS_VAR_RE);
      },
    );
  });

  describe('CATEGORICAL_COLORS — all entries are CSS-variable strings', () => {
    it('has at least one entry', () => {
      expect(CATEGORICAL_COLORS.length).toBeGreaterThan(0);
    });

    it.each(CATEGORICAL_COLORS.map((v, i) => [i, v] as [number, string]))(
      'CATEGORICAL_COLORS[%i] ("%s") matches /^var(--…)$/',
      (_i, value) => {
        expect(value).toMatch(CSS_VAR_RE);
      },
    );
  });

  // ── (b) Crop-slug → crop-token mapping ────────────────────────────────────

  describe('CROP_COLORS — correct crop token per slug', () => {
    it('sorghum maps to var(--crop-sorghum)', () => {
      expect(CROP_COLORS.sorghum).toBe('var(--crop-sorghum)');
    });

    it('common_bean maps to var(--crop-bean)', () => {
      expect(CROP_COLORS.common_bean).toBe('var(--crop-bean)');
    });

    it('groundnut maps to var(--crop-groundnut)', () => {
      expect(CROP_COLORS.groundnut).toBe('var(--crop-groundnut)');
    });
  });

  // ── (c) categoricalColor wraps around ─────────────────────────────────────

  describe('categoricalColor(index)', () => {
    it('returns the first entry for index 0', () => {
      expect(categoricalColor(0)).toBe(CATEGORICAL_COLORS[0]);
    });

    it('returns a valid entry for an index within bounds', () => {
      const mid = Math.floor(CATEGORICAL_COLORS.length / 2);
      expect(categoricalColor(mid)).toBe(CATEGORICAL_COLORS[mid]);
    });

    it('wraps around when index equals palette length', () => {
      const len = CATEGORICAL_COLORS.length;
      expect(categoricalColor(len)).toBe(CATEGORICAL_COLORS[0]);
    });

    it('wraps around when index exceeds palette length', () => {
      const len = CATEGORICAL_COLORS.length;
      expect(categoricalColor(len + 1)).toBe(CATEGORICAL_COLORS[1]);
    });

    it('large index still returns a valid CSS-variable string', () => {
      expect(categoricalColor(999)).toMatch(CSS_VAR_RE);
    });
  });
});
