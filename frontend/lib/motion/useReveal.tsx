'use client';

/**
 * useReveal — scroll-reveal primitive (FR-2, NFR-1, NFR-2, NFR-6).
 *
 * Returns a `scope` ref to attach to a container. When the container scrolls
 * into view, its direct children (or a custom targets selector) fade + rise
 * into their natural position — once.
 *
 * Progressive enhancement (FR-8): uses `gsap.from` so the resting DOM is always
 * the natural visible state.  Reduced-motion gate (FR-7): animation only runs
 * inside `mm.add('(prefers-reduced-motion: no-preference)', …)` — reduced-motion
 * users and the mocked test env get all content immediately visible.
 *
 * Performance (NFR-2): only `y` (transform) + `autoAlpha` (opacity+visibility).
 * No width/height/top/left.
 *
 * Cleanup: useGSAP handles cleanup automatically (kills tweens + ScrollTriggers
 * and reverts the matchMedia context on unmount).
 *
 * Usage (hook form):
 *   const ref = useReveal<HTMLDivElement>();
 *   return <div ref={ref}>…children…</div>;
 *
 * Usage (component form):
 *   <Reveal as="section" className="…">…children…</Reveal>
 */

import React, { useRef, type ElementType, type ReactNode, type ComponentPropsWithoutRef } from 'react';
import { registerGsap, gsap, useGSAP } from './gsap-setup';
import { DURATION, EASE, REVEAL } from './motion-tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options accepted by `useReveal` and `<Reveal>`. */
export interface RevealOptions {
  /**
   * Targets selector relative to the scope, or a CSS selector string.
   * Defaults to the scope's direct children (`:scope > *`).
   */
  targets?: string;
  /** Initial y offset in px.  Defaults to `REVEAL.y` (24px). */
  y?: number;
  /** Stagger seconds between each child.  Defaults to `REVEAL.stagger` (0.08s). */
  stagger?: number;
  /**
   * ScrollTrigger start position string.
   * Defaults to `'top 85%'` — trigger fires when the top of the section
   * reaches 85% down the viewport.
   */
  start?: string;
  /**
   * Kill the ScrollTrigger after firing once.
   * Defaults to `true` (once-only, NFR-6).
   */
  once?: boolean;
}

// ---------------------------------------------------------------------------
// Hook: useReveal
// ---------------------------------------------------------------------------

/**
 * Returns a ref to place on a wrapper element.  When that element enters the
 * viewport its children (or the given `targets` selector) animate from a
 * lowered, transparent state to their natural visible state, once.
 *
 * The animation is created only under `prefers-reduced-motion: no-preference`
 * so reduced-motion users always see the content at full opacity/position.
 *
 * @example
 *   const ref = useReveal<HTMLDivElement>({ stagger: 0.1 });
 *   return <div ref={ref}>{cards}</div>;
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  opts: RevealOptions = {},
): React.RefObject<T | null> {
  const scope = useRef<T>(null);

  const {
    targets  = ':scope > *',
    y        = REVEAL.y,
    stagger  = REVEAL.stagger,
    start    = 'top 85%',
    once     = true,
  } = opts;

  useGSAP(
    () => {
      registerGsap();

      // Guard: scope must be mounted (won't be null post-mount, but TypeScript needs this).
      if (!scope.current) return;

      // Reduced-motion gate (FR-7 / gsap-core skill §matchMedia).
      // The `reduce` branch is a no-op — elements stay at their natural visible state.
      // useGSAP auto-reverts the matchMedia context on unmount (gsap-react skill).
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // `gsap.from` animates FROM the given vars TO the element's current (natural)
        // state — so if GSAP is absent or reduced-motion fires, elements remain visible
        // at their natural position (FR-8 / design.md §5.2 ADR).
        gsap.from(targets, {
          autoAlpha: 0,          // opacity 0 + visibility:hidden → fades to natural state
          y,                     // slight upward rise on entry
          duration: DURATION.base,
          ease: EASE.out,
          stagger,
          scrollTrigger: {
            trigger: scope.current,
            start,
            once,                // fires once; kills ST afterwards (NFR-6)
          },
        });
      });
    },
    { scope },
  );

  return scope;
}

// ---------------------------------------------------------------------------
// Component: <Reveal>
// ---------------------------------------------------------------------------

type RevealOwnProps<E extends ElementType = 'div'> = {
  /**
   * Rendered element.  Defaults to `'div'`.
   * @example as="section"
   */
  as?: E;
  children: ReactNode;
} & RevealOptions;

type RevealProps<E extends ElementType = 'div'> = RevealOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof RevealOwnProps<E>>;

/**
 * Wrapper component that applies `useReveal` to itself.
 *
 * @example
 *   <Reveal as="section" className="py-16">
 *     <Card />
 *     <Card />
 *   </Reveal>
 */
export function Reveal<E extends ElementType = 'div'>({
  as,
  children,
  targets,
  y,
  stagger,
  start,
  once,
  ...rest
}: RevealProps<E>): React.ReactElement {
  const Tag = (as ?? 'div') as ElementType;
  const ref = useReveal<HTMLElement>({ targets, y, stagger, start, once });

  // Spread the motion ref onto the rendered element alongside any other props.
  return (
    <Tag ref={ref} {...rest}>
      {children}
    </Tag>
  );
}
