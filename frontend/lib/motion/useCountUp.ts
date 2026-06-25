'use client';

/**
 * useCountUp — animated number count-up primitive (T-3, FR-3, FR-4, NFR-2).
 *
 * Returns a `{ ref }` to attach to the DOM node that displays the number
 * (e.g. `<span ref={ref}>{formattedValue}</span>`).  When motion is allowed,
 * GSAP animates a proxy { n: 0 } → target and writes the formatted result to
 * node.textContent via onUpdate — bypassing React re-renders entirely (NFR-2).
 *
 * Progressive enhancement (FR-8): the consuming component MUST render the
 * final formatted value in its JSX.  This hook only ENHANCES by animating
 * 0 → target on the "no-preference" motion path.  When GSAP is mocked (tests)
 * or reduced-motion is active, the hook never overwrites textContent so the
 * component's JSX-rendered value remains intact in the DOM.
 *
 * Reduced-motion / disabled / non-finite target (FR-7, FR-8):
 *   - The hook does NOT blank or overwrite the node.
 *   - The component's own JSX already shows the correct final value.
 *
 * Usage:
 *   const { ref } = useCountUp(1000, { suffix: '+' });
 *   return <span ref={ref}>1,000+</span>;
 */

import { useRef } from 'react';
import { COUNT_UP } from './motion-tokens';
import { registerGsap, gsap, useGSAP } from './gsap-setup';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCountUpOptions {
  /**
   * When false the animation is suppressed and the node keeps its JSX-rendered
   * final value (e.g. while data is still loading — FR-4).
   * Defaults to true.
   */
  enabled?: boolean;
  /**
   * Custom formatter applied to the proxy value on every frame.
   * Defaults to an integer-with-thousands-separators formatter + suffix.
   */
  format?: (n: number) => string;
  /**
   * Optional suffix appended after the formatted number, e.g. "+" for "1,000+".
   * Ignored when a custom `format` is supplied.
   */
  suffix?: string;
  /** Animation duration in seconds. Defaults to COUNT_UP.duration (1.0 s). */
  durationSec?: number;
}

export interface UseCountUpResult {
  /** Attach to the DOM node whose textContent will be animated. */
  ref: React.RefObject<HTMLElement | null>;
}

// ---------------------------------------------------------------------------
// Default formatter
// ---------------------------------------------------------------------------

function makeFormatter(suffix = ''): (n: number) => string {
  return (n: number) =>
    `${Math.round(n).toLocaleString('en-US')}${suffix}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param target  The final numeric value to count up to.
 *                Pass null / undefined for a no-op (loading / unavailable state).
 * @param opts    Optional configuration (enabled, format, suffix, durationSec).
 */
export function useCountUp(
  target: number | null | undefined,
  opts: UseCountUpOptions = {},
): UseCountUpResult {
  const { enabled = true, format, suffix = '', durationSec = COUNT_UP.duration } = opts;

  const ref = useRef<HTMLElement | null>(null);

  // Resolve the formatter once per render (stable reference not required since
  // useGSAP re-runs when dependencies change anyway).
  const formatter = format ?? makeFormatter(suffix);

  useGSAP(
    () => {
      registerGsap();

      const node = ref.current;

      // Guard: no node, disabled, or target is not a usable number → leave the
      // JSX-rendered value intact (FR-8).  Do NOT blank the node.
      if (!node || enabled === false || target == null || !isFinite(target)) {
        return;
      }

      // Proxy object — GSAP animates this; we write textContent in onUpdate.
      const proxy = { n: 0 };

      // gsap.matchMedia gates the real animation on "no reduced-motion" (FR-7).
      // In the "reduce" / no-match branch we do nothing — the JSX-rendered final
      // value in the DOM is already correct (FR-8, progressive enhancement).
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to(proxy, {
          n:        target,
          duration: durationSec,
          ease:     COUNT_UP.ease,
          onUpdate: () => {
            // Write directly — avoids a per-frame React re-render (NFR-2).
            node.textContent = formatter(proxy.n);
          },
          scrollTrigger: {
            trigger: node,
            start:   'top 90%',
            once:    true,
          },
        });
      });
    },
    // Re-run (and clean up the previous animation) when target or enabled change.
    { dependencies: [target, enabled, durationSec] },
  );

  return { ref };
}
