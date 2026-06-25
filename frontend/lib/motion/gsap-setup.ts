/**
 * GSAP plugin registration — idempotent, client-only.
 *
 * Import `{ gsap, ScrollTrigger, useGSAP }` from here instead of directly from
 * 'gsap' / 'gsap/ScrollTrigger' / '@gsap/react' so plugins are always registered
 * before use and tree-shaking is guaranteed (ScrollTrigger imported by path).
 *
 * `registerGsap()` is safe to call multiple times; plugins are registered only once.
 * It is intended to be called at the top of each motion hook (`useReveal`, `useCountUp`)
 * so registration happens at runtime on the client — never during SSR (NFR-3).
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

let registered = false;

/** Register GSAP plugins once. Call at the start of every motion hook. */
export function registerGsap(): void {
  if (registered) return;
  gsap.registerPlugin(useGSAP, ScrollTrigger);
  registered = true;
}

export { gsap, ScrollTrigger, useGSAP };
