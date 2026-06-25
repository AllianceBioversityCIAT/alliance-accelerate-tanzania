/**
 * Motion tokens — GSAP-side mirror of the CSS custom properties in globals.css `:root`.
 *
 * CSS token         ↔  GSAP value here
 * --dur-fast  .3s   ↔  DURATION.fast  0.3
 * --dur-base  .6s   ↔  DURATION.base  0.6
 * --dur-slow  .9s   ↔  DURATION.slow  0.9
 * --ease-out  cubic-bezier(.2,.7,.2,1)   ↔  EASE.out  'power2.out'  (closest GSAP built-in)
 * --ease-soft cubic-bezier(.25,.46,.45,.94) ↔  EASE.soft 'power1.out'
 *
 * All motion durations and easings MUST come from here — no scattered magic numbers (NFR-4).
 * Reduced-motion disables all motion (FR-7): hooks check gsap.matchMedia before animating.
 */

/** Animation durations in seconds (mirrors --dur-* CSS tokens). */
export const DURATION = {
  fast: 0.3,
  base: 0.6,
  slow: 0.9,
} as const;

/** Ease name strings for GSAP (mirrors --ease-* CSS tokens via closest built-in). */
export const EASE = {
  out:  'power2.out',
  soft: 'power1.out',
} as const;

/** Scroll-reveal geometry: initial y-offset (px) and card stagger interval (s). */
export const REVEAL = {
  y:       24,
  stagger: 0.08,
} as const;

/** Count-up animation config for metric figures. */
export const COUNT_UP = {
  duration: 1.0,
  ease:     'power1.out',
} as const;
