// @akili-spec docs/specs/enhancement/app-visual-refresh
/**
 * contrast.ts
 *
 * Pure WCAG 2.1 contrast-ratio utilities over colour values — no DOM, no
 * browser, no jest-axe. jsdom has no layout/paint engine so axe's
 * `color-contrast` rule cannot execute under it (design.md DD-7); these
 * functions are what actually evaluates the property jest-axe cannot.
 *
 * Two colour representations are supported: `#RRGGBB` hex and
 * `rgba(r, g, b, a)` — the two forms `frontend/app/globals.css` uses.
 *
 * Traces: NFR-1, FR-2, design.md DD-7.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/;
const RGBA_RE =
  /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/;

/**
 * Parses a `#RRGGBB` or `rgba(r, g, b, a)` colour string into 0-255 RGB
 * channels. Alpha (if present) is not returned — callers that need to
 * account for translucency composite explicitly via `compositeOver`
 * first; this keeps `contrastRatio` a pure two-opaque-colours function.
 */
export function parseColor(value: string): RGB {
  const trimmed = value.trim();

  const hex = HEX_RE.exec(trimmed);
  if (hex) {
    const int = parseInt(hex[1], 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
    };
  }

  const rgba = RGBA_RE.exec(trimmed);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
    };
  }

  throw new Error(`parseColor: unrecognised colour format "${value}"`);
}

/** WCAG relative luminance of a single 0-255 sRGB channel value. */
function channelLuminance(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0–1) of an RGB colour. */
export function relativeLuminance({ r, g, b }: RGB): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/**
 * WCAG contrast ratio between two opaque colours. Accepts `#RRGGBB` /
 * `rgba()` strings or already-parsed `RGB` objects (e.g. the output of
 * `compositeOver`), so a composited chip ground can be passed straight
 * through without a round-trip through a colour string. Argument order
 * does not matter — the WCAG formula is symmetric in lighter/darker.
 */
export function contrastRatio(fg: string | RGB, bg: string | RGB): number {
  const a = typeof fg === 'string' ? parseColor(fg) : fg;
  const b = typeof bg === 'string' ? parseColor(bg) : bg;
  const lA = relativeLuminance(a);
  const lB = relativeLuminance(b);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Composites a translucent foreground (`fg`, at `alpha` in [0,1]) over an
 * opaque `bg`, returning the resulting opaque RGB. This is what a
 * Tailwind `bg-token/NN` alpha-modifier utility actually paints once the
 * ground behind it shows through — e.g. `bg-warning/10` on a `bg-surface`
 * card is `compositeOver(warning, surface, 0.10)`, not the bare warning
 * hex. Checking a chip's ink against the bare token instead of this
 * composited result yields a passing ratio for a failing pixel (FR-2).
 */
export function compositeOver(
  fg: string | RGB,
  bg: string | RGB,
  alpha: number,
): RGB {
  const f = typeof fg === 'string' ? parseColor(fg) : fg;
  const g = typeof bg === 'string' ? parseColor(bg) : bg;
  return {
    r: f.r * alpha + g.r * (1 - alpha),
    g: f.g * alpha + g.g * (1 - alpha),
    b: f.b * alpha + g.b * (1 - alpha),
  };
}
