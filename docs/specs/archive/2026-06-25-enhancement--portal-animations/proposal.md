# Proposal — Portal Motion Layer (GSAP animations)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `enhancement/portal-animations` *(constitution uses an `enhancement/` prefix for non-domain UI work; resolved from the `/sdd-propose` description)* |
| Type | Enhancement — frontend motion/UX layer |
| Status | Draft — awaiting approval |
| Author / Date | JuanCode / 2026-06-25 |
| Implementation tool | **GSAP** (+ `@gsap/react` `useGSAP`, `ScrollTrigger`), guided by the available **GSAP skill** |
| Constitutional refs | system-design/design.md design-principle #5 ("respects reduced motion") + §"Respect `prefers-reduced-motion` for transitions and map fly-to animations"; §7 tokens; WCAG 2.1 AA (2.3.3 Animation from Interactions, 2.2.2 Pause/Stop/Hide) |
| Affected | `frontend/` only (Next.js static export) — no backend/infra/data |

## 2. Intent

Add a **tasteful, performant, accessible motion layer** to the public portal so it feels alive and guides attention — entrance/scroll reveals, a hero entrance sequence, and animated metric count-ups — implemented with **GSAP** (via the GSAP skill's best-practice patterns). Motion must be **progressive enhancement** (content fully usable without it), **gated on `prefers-reduced-motion`**, and must not regress performance (no CLS, no delayed LCP) or any existing test/axe pass.

## 3. Problem / Current Behavior

- The portal is visually **static/plain**: sections appear fully formed with no entrance choreography, the hero is a flat two-column block, the headline metrics (`1,000+`, the MetricsBand counts) just sit there, and the Directory card grid pops in without rhythm.
- The design system already **mandates** reduced-motion respect (and the codebase uses `motion-reduce:` utilities in `Button`, `Skeleton`, `Header`, `LoginForm`, `LeafletMap`) — but there is **no positive motion layer** to be reduced; today there is essentially nothing to animate down.
- There are **no motion tokens** (durations/easings) in `tailwind.config.ts` or System Design §7, and **no animation library** in `frontend/package.json` — so motion has no shared vocabulary or consistency.

## 4. Proposed Outcome

A small, reusable GSAP-based motion system plus targeted animations on the highest-value surfaces:

1. **Shared motion foundation** — a motion config (durations/easings as **§7 motion tokens**), a single `prefers-reduced-motion` gate (`gsap.matchMedia`), and a reusable **scroll-reveal** primitive (`useGSAP`-based) that fades/slides sections in as they enter the viewport (reused across pages).
2. **Hero entrance** (`/`) — a staggered reveal of eyebrow → headline → copy → CTAs, a soft reveal of the photo panel, and an animated **count-up** of the `LiveRegistryCard` "1,000+". (Care: the hero image is the LCP element — its reveal must not delay LCP.)
3. **MetricsBand count-up** (`/`) — the live metric numbers count up when scrolled into view.
4. **CropCoverage / card stagger** (`/`) — crop cards stagger-reveal on scroll.
5. **Directory grid stagger** (`/directory`) — `ActorCard`s stagger-in on load and (subtly) on filter/search change.
6. Everything **honors reduced-motion** (those users get the final, static state immediately) and is **SSR/static-export safe** (`'use client'`, `useGSAP` for React-safe setup + cleanup, no FOUC).

## 5. Scope

- New `frontend/lib/motion/` — motion tokens/config, the reduced-motion `matchMedia` gate, a `useReveal`/`<Reveal>` scroll-reveal primitive, and a `useCountUp` helper. Deps: `gsap` + `@gsap/react`.
- Apply to: `components/home/{Hero,MetricsBand,CropCoverage,CropCard}.tsx`, `components/directory/{DirectoryView,ActorCard}.tsx`, and a general section-reveal usable on Map/Profile chrome.
- Motion tokens added to System Design §7 + `tailwind.config.ts` (durations/easings) for a shared vocabulary.
- Tokens-only styling preserved; a11y (reduced-motion, focus, no content hidden from AT); performance (transform/opacity only); static export green; existing tests/axe still pass.

## 6. Non-Goals

- Animating **Leaflet map internals** (markers/tiles) — the map's own fly-to already exists; only the surrounding page chrome may reveal.
- **Route / page-transition** animations (App Router + static export transitions are fiddly) — possible later.
- Looping/auto-playing/parallax-heavy effects, anything that could trigger motion sickness or hurt Core Web Vitals.
- Any change to **content, layout structure, colors, data, or copy** — this is motion only.
- Backend/infra/auth changes.

## 7. Affected Users, Systems, And Specs

- **Users:** all public visitors (richer first impression); reduced-motion users explicitly unaffected (static final state).
- **Code:** new `frontend/lib/motion/*`; edits to home + directory components; `tailwind.config.ts` + System Design §7 (motion tokens). New deps `gsap`, `@gsap/react`.
- **Specs:** a cosmetic enhancement over the archived `changes/home-page`, `actors/directory`, and `changes/brand-palette-pabra` work; no behavioral spec is modified.

## 8. Requirement Delta Preview

### ADDED
- A shared GSAP motion foundation: §7 motion tokens (durations/easings), a single `prefers-reduced-motion` gate, a reusable scroll-reveal primitive, a count-up helper.
- Hero entrance sequence + LiveRegistryCard count-up; MetricsBand count-up; CropCoverage + Directory card stagger; scroll-reveal on key sections.

### MODIFIED
- Home + Directory components gain a `'use client'` motion wrapper where needed; **initial render still shows final content** (progressive enhancement) — no behavioral change.

### REMOVED
- None.

## 9. Approach Options

**Option A — GSAP + `ScrollTrigger` + `@gsap/react` `useGSAP` (CHOSEN).** The user's selected tool; implemented via the available **GSAP skill**. `useGSAP` gives React-safe context + automatic cleanup and `useLayoutEffect` timing (sets initial state before paint → no FOUC); `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` registers animations only when motion is allowed; `ScrollTrigger` drives reveals/count-ups. *Pros:* powerful, precise timelines + scroll control, now fully free license, exactly the requested tool. *Cons:* adds ~GSAP core + ScrollTrigger to the bundle (client-only); requires discipline on a11y/perf/test-mocking.

**Option B — Framer Motion (`motion`).** More React-idiomatic (`whileInView`, built-in `useReducedMotion`). *Pros:* declarative, smaller mental model. *Cons:* not the requested tool; GSAP wins for orchestrated timelines/scrubbing.

**Option C — CSS/Tailwind + IntersectionObserver only.** Zero new dep, extends existing `motion-reduce:` utilities. *Pros:* lightest. *Cons:* clunky for count-ups and orchestrated staggers; more manual.

## 10. Recommended Approach

**Option A (GSAP via the GSAP skill).** It's the chosen tool and the strongest fit for the orchestrated hero sequence, scroll reveals, and count-ups, while the GSAP skill's `useGSAP` + `matchMedia` patterns give us the a11y and no-FOUC guarantees this institutional, accessibility-mandated portal requires. The motion stays subtle/professional (not flashy), is centralized behind a small `lib/motion/` API so it's consistent and easy to dial back, and degrades to today's static portal for reduced-motion users and the no-JS/initial-paint path.

## 11. Risks, Dependencies, And Open Questions

- **A11y (hard gate):** all motion MUST be wrapped in `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` so reduced-motion users get the final state with zero animation (constitutional + WCAG 2.3.3/2.2.2). No content may be permanently hidden if JS fails — initial DOM is the visible final state; GSAP only *enhances*.
- **Performance / Core Web Vitals:** animate **transform/opacity only** (GPU, no reflow); **no CLS** (reserve space; don't animate layout); the **hero image is the LCP element** — its reveal must not delay LCP (animate a wrapper/overlay, not block the image). Lazy-register `ScrollTrigger`.
- **FOUC:** use `@gsap/react` `useGSAP` (runs in `useLayoutEffect`) to set initial state before paint; verify no flash on slow loads.
- **Static export:** motion components are `'use client'`; no SSR/route handlers; `next build` must stay green.
- **Test stability:** GSAP must be mocked/short-circuited in jsdom so RTL + jest-axe suites stay deterministic (final DOM state = visible); confirm the 281 existing tests + axe still pass.
- **Bundle size:** `gsap` + `@gsap/react` + `ScrollTrigger` (client-only) — acceptable; note the delta.
- **OQ-1 (intensity):** subtle/professional (recommended for an institutional registry) vs bold. 
- **OQ-2 (surfaces in scope):** Home + Directory first (recommended); Map/Profile chrome reveals optional; Profile count-ups optional.
- **OQ-3 (motion tokens in §7):** add a durations/easings scale to System Design §7 + Tailwind (recommended) for consistency.
- **OQ-4 (count-up):** confirm metric numbers animating from 0 on scroll-in is desired (recommended; respects reduced-motion by showing the final number instantly).

## 12. Success Criteria

- The targeted surfaces (Hero, MetricsBand, CropCoverage, Directory grid) have tasteful, on-brand motion; the portal no longer feels static.
- **Reduced-motion users see no animation** — content renders in its final state immediately; verified.
- **No CLS regression and LCP not delayed**; animations use transform/opacity only.
- Static export build green; all existing tests + jest-axe pass; new motion primitives have tests (reduced-motion path + final-state assertions).
- Motion is centralized in `lib/motion/` with shared §7 tokens — easy to tune or disable.

## 13. Next Step

```text
/sdd-specify enhancement/portal-animations
```
> Implementation uses **GSAP** via the available GSAP skill (`useGSAP` + `gsap.matchMedia` + `ScrollTrigger`). Recommend confirming OQ-1 (intensity) and OQ-2 (surfaces) at specify time; defaults are subtle/professional on Home + Directory.
