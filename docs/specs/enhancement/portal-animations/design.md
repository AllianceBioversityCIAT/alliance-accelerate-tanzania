# Design — Portal Motion Layer (GSAP animations)

- Spec path: docs/specs/enhancement/portal-animations/
- Status: Draft
- Traces requirements: FR-1..FR-8, NFR-1..NFR-7

## 1. Approach Overview

A small, centralized GSAP motion system under `frontend/lib/motion/`, applied to the highest-value public surfaces (Home + Directory). Motion is **client-only** (`'use client'`, `@gsap/react` `useGSAP`), **progressive enhancement** (the DOM always renders final, visible content; GSAP only animates the entrance), and **gated on `prefers-reduced-motion`** via `gsap.matchMedia` so reduced-motion users (and the no-JS / pre-hydration / test paths) get the static final state. Durations/easings live in shared **§7 motion tokens**. Implementation follows the GSAP skills: `gsap-react` (`useGSAP` scope + auto cleanup), `gsap-scrolltrigger` (`ScrollTrigger.batch` for card staggers), `gsap-core` (`matchMedia`), `gsap-performance` (transform/opacity only).

```
lib/motion/  ── motion-tokens (dur/ease)  ── gsap-setup (registerPlugin once)
   │            └── prefersReducedMotion gate (gsap.matchMedia)
   ├── useReveal()  ──▶ fade+rise on scroll-in (ScrollTrigger, once)        → sections, crop cards, directory grid
   └── useCountUp() ──▶ animate 0→value on in-view                          → Hero "1,000+", MetricsBand stats

Surfaces (all 'use client', enhance final DOM):
  Hero (entrance stagger + count-up + LCP-safe photo)  · MetricsBand (count-up) ·
  CropCoverage (card stagger) · DirectoryView (grid stagger)
```

## 2. Data Model Changes

**None** — no backend/Prisma/PII/data change.

## 3. API Surface & Contracts

**None** — no API change. Motion consumes already-fetched client data (`useMetrics`, `useActors`).

## 4. Backend Module Design

**None** — frontend-only.

## 5. Frontend Design

### 5.1 Motion foundation — `frontend/lib/motion/`

- **`motion-tokens.ts`** — the single source for GSAP-side values, mirroring the new CSS motion tokens (§5.4):
  ```ts
  export const DURATION = { fast: 0.3, base: 0.6, slow: 0.9 } as const;   // seconds
  export const EASE     = { out: 'power2.out', soft: 'power1.out' } as const;
  export const REVEAL   = { y: 24, stagger: 0.08 } as const;             // px / seconds
  export const COUNT_UP = { duration: 1.0, ease: 'power1.out' } as const;
  ```
- **`gsap-setup.ts`** — registers plugins exactly once (idempotent), per `gsap-react`/`gsap-scrolltrigger`:
  ```ts
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { useGSAP } from '@gsap/react';
  let registered = false;
  export function registerGsap() { if (registered) return; gsap.registerPlugin(useGSAP, ScrollTrigger); registered = true; }
  export { gsap, ScrollTrigger, useGSAP };
  ```
- **Reduced-motion gate:** every motion hook wraps its setup in `gsap.matchMedia()` with a `reduce` condition (per `gsap-core`), creating animations **only** in the no-preference branch; the reduce branch is a no-op so elements stay at their natural visible state. `matchMedia` auto-reverts on cleanup/condition change (do NOT nest `gsap.context` inside it).

### 5.2 `useReveal()` — scroll-reveal primitive (FR-2)

A `useGSAP`-based hook returning a `scope` ref. Inside `useGSAP(() => { ... }, { scope })`:
```ts
registerGsap();
const mm = gsap.matchMedia();
mm.add('(prefers-reduced-motion: no-preference)', () => {
  gsap.from(targets, {                 // 'from' so the FINAL DOM state is the natural visible one
    autoAlpha: 0, y: REVEAL.y,         // transform + opacity only (NFR-2); autoAlpha = opacity+visibility
    duration: DURATION.base, ease: EASE.out, stagger: REVEAL.stagger,
    scrollTrigger: { trigger: scope.current, start: 'top 85%', once: true },  // once → no reverse, tasteful (NFR-6)
  });
});
```
- Variants: a single-element reveal and a children/stagger reveal; the grid case may use **`ScrollTrigger.batch`** (per `gsap-scrolltrigger`) for many cards.
- **No-FOUC:** `useGSAP` runs in `useLayoutEffect`, so `gsap.from`'s initial state is set before the browser paints; on reduced-motion / no-JS / mocked-GSAP the element is simply visible (its CSS default). **No element is ever left hidden without GSAP** (FR-8) — `from` (not `set`-to-hidden-then-maybe-animate) guarantees the resting DOM is visible.
- Optional `<Reveal>` wrapper component over the hook for ergonomic per-section use.

### 5.3 `useCountUp()` — number count-up (FR-3/FR-4)

Returns a `ref` for the number node + accepts `(target, { enabled })`. Animates a proxy `{ n: 0 }` and writes `node.textContent` via `onUpdate` (no per-frame React re-render → perf). Gated by `matchMedia`: reduced-motion (or `enabled === false`, e.g. data not loaded) → set the final formatted value immediately. Formatting matches the current display (e.g. `1,000+`, integers). Triggered on in-view via a `ScrollTrigger` (once) or when `enabled` flips true while in view.

### 5.4 Motion tokens (§7) — `globals.css` + `tailwind.config.ts`

Add to `:root` in `globals.css` (alongside the existing `--color-*`/`--radius-*` tokens) and document in System Design §7:
```css
--dur-fast: .3s; --dur-base: .6s; --dur-slow: .9s;
--ease-out: cubic-bezier(.2,.7,.2,1); --ease-soft: cubic-bezier(.25,.46,.45,.94);
```
Extend `tailwind.config.ts` `theme.extend.transitionDuration` / `transitionTimingFunction` with these so CSS-based micro-transitions can reference the same scale. The GSAP-side `motion-tokens.ts` mirrors the numeric values (GSAP uses its own ease names, mapped 1:1 in a code comment).

### 5.5 Surface integration

| Surface | File(s) | Motion |
|---|---|---|
| **Hero** | `components/home/Hero.tsx` → `'use client'` + `useGSAP` | one-time timeline: stagger eyebrow→h1→p→CTAs (`from` y+autoAlpha); **photo: subtle `scale 1.04→1` only — never `opacity:0`** so the LCP image paints immediately (NFR-2/FR-3); `useCountUp` on the "1,000+" card |
| **MetricsBand** | `components/home/MetricsBand.tsx` (already client) + `StatCard` | `useCountUp` per figure, `enabled = !loading && data` , triggered on in-view |
| **CropCoverage** | `components/home/CropCoverage.tsx` (already client) | `useReveal` (batch/stagger) over the crop cards |
| **DirectoryView** | `components/directory/DirectoryView.tsx` (already client) | `useReveal` stagger over `ActorCard`s on load; subtle re-reveal keyed on the query (`useGSAP` `dependencies:[queryKey], revertOnUpdate:true`), kept brief and overwrite-safe |

- Converting `Hero` to a client component is static-export-safe (it still prerenders; the `next/image priority` LCP image is unaffected). No layout/markup/content change beyond refs + the motion wrapper.

### 5.6 Test determinism (FR-8 / NFR-5)

- A Jest **manual mock** for `gsap`, `gsap/ScrollTrigger`, and `@gsap/react` (e.g. `__mocks__` or `jest.mock`) so motion hooks no-op: `useGSAP` runs its callback once without real animation, `gsap.from/matchMedia/ScrollTrigger.batch` are no-ops, and `useCountUp` renders the final value. Components therefore render their final, visible DOM → RTL queries + jest-axe unchanged.
- Add a `window.matchMedia` polyfill to `jest.setup.ts` (jsdom lacks it) returning `{ matches: false }` for any query (treated as "no reduced-motion preference" / desktop), so any direct `matchMedia` calls don't throw.
- New unit tests for `useReveal`/`useCountUp`: assert the **final content is rendered/visible** with GSAP mocked, and (where feasible) the reduced-motion branch shows final state.

## 6. Security & RBAC

None — no auth/PII/data surface touched; public pages only.

## 7. Infrastructure / Deployment

- No infra change. Frontend rebuild + deploy via `infra/scripts/deploy-frontend.sh` (`--profile IBD-DEV`); CloudFront invalidation. Bundle gains `gsap` + `@gsap/react` (client-only).

## 8. Decision Records (ADR-style)

### Decision: GSAP via `useGSAP` + `gsap.matchMedia`, not Framer Motion / CSS-only
- **Context:** user chose GSAP; the GSAP skills are available; the portal mandates reduced-motion + a11y.
- **Decision:** `@gsap/react` `useGSAP` (scope + auto-cleanup + `useLayoutEffect` no-FOUC) with a single `gsap.matchMedia` reduced-motion gate; `ScrollTrigger`/`.batch` for reveals.
- **Consequences:** adds `gsap`+`@gsap/react`; centralizes motion; reduced-motion + progressive enhancement guaranteed by `from`-based reveals.

### Decision: Reveal with `gsap.from` (resting DOM stays visible)
- **Context:** progressive enhancement + test determinism (FR-8) — content must never be left hidden if GSAP doesn't run.
- **Decision:** use `gsap.from(...)` (animate FROM hidden TO the natural visible state) inside `useLayoutEffect`/`useGSAP`, rather than CSS `opacity:0` + JS-reveal.
- **Consequences:** no-JS / reduced-motion / mocked-test paths show visible content; no FOUC on the motion path.

### Decision: Hero LCP image is never opacity-animated
- **Context:** the hero `next/image priority` photo is the LCP element (NFR-2/FR-3).
- **Decision:** the photo gets at most a subtle `scale 1.04→1`; it is never animated from `opacity:0`, so it paints immediately and LCP is not delayed.
- **Consequences:** a gentle reveal without a Core-Web-Vitals regression.

## 9. Risks & Mitigations

- **FOUC:** `useGSAP`/`useLayoutEffect` sets `from`-state pre-paint; verified by manual load + `next build`.
- **CLS:** reveals animate `transform`/`opacity` only — no layout shift; reserve space.
- **LCP:** hero image not opacity-animated (ADR §8).
- **Test breakage:** GSAP mocked + `matchMedia` polyfilled so the 281 tests + axe stay green (gate before deploy).
- **Over-motion / distraction:** once-only entrances, subtle durations from tokens, no loops/parallax (NFR-6); directory re-reveal kept brief + overwrite-safe.
- **Bundle:** `gsap`+`@gsap/react` client-only; import `ScrollTrigger` from `gsap/ScrollTrigger` (tree-shake); documented.
- **Rollback:** motion is additive and centralized — reverting `lib/motion/` usage restores today's static portal; the `from`-based design means a revert leaves content visible.

## 10. Test Plan Outline

- **Primitives:** `useReveal`/`useCountUp` unit tests (GSAP mocked) — final content rendered/visible; reduced-motion path = final state.
- **Surfaces:** existing Hero/MetricsBand/CropCoverage/DirectoryView tests + jest-axe MUST still pass (final-DOM assertions unaffected by mocked motion); add count-up final-value assertions.
- **Static export:** `cd frontend && npm run build` green with the motion layer.
- **Manual / perf:** load `/` and `/directory` — entrances play once, smooth; toggle OS reduced-motion → no animation, content final; quick CWV sanity (no CLS, hero LCP unaffected).
- **Deploy smoke:** `/` and `/directory` 200 over CloudFront after deploy.
