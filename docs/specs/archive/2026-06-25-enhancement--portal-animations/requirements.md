# Requirements — Portal Motion Layer (GSAP animations)

- Spec path: docs/specs/enhancement/portal-animations/
- Status: Draft
- Author / Date: JuanCode / 2026-06-25
- Depth: Standard
- Related: docs/system-design/design.md design-principle #5 ("respects reduced motion") + §"Respect `prefers-reduced-motion`"; §7 tokens; WCAG 2.1 AA (2.3.3 Animation from Interactions, 2.2.2 Pause/Stop/Hide)
- Implementation: GSAP (`gsap`, `@gsap/react` `useGSAP`, `ScrollTrigger`) via the available GSAP skills
- Proposal: docs/specs/enhancement/portal-animations/proposal.md (Option A — GSAP, accessible, progressive enhancement)
- Affects: `frontend/` only (Next.js static export); no backend/infra/data/auth

## 1. Summary

Add a tasteful, accessible **motion layer** to the public portal so it feels alive — scroll-triggered section/card reveals, a hero entrance sequence, and animated metric count-ups — built with GSAP. Motion is **progressive enhancement** (content fully present and visible without it), **gated on `prefers-reduced-motion`**, performance-safe (transform/opacity only; no CLS; LCP not delayed), and must not regress any existing test or jest-axe pass. This is a cosmetic enhancement over the archived home-page and directory work; no behavioral spec changes.

## 2. Requirement Numbering & Writing Standards

- Functional `FR-1…`; non-functional `NFR-1…`. Atomic, testable; MUST/SHOULD/MAY (RFC 2119).
- "Motion" = entrance/scroll/count-up animations. "Reduced-motion" = a user with OS-level `prefers-reduced-motion: reduce`.
- No data, PII, color, layout, or copy changes — motion only.

## 3. Functional Requirements

### FR-1: Shared motion foundation

- **Description:** The system MUST provide a single, centralized motion foundation under `frontend/lib/motion/` — shared duration/easing **motion tokens** (added to System Design §7 + the token layer), one-time GSAP plugin registration, and one reusable `prefers-reduced-motion` gate — so all motion shares a vocabulary and the reduced-motion behavior is defined in exactly one place.
- **Rationale / Source:** proposal §4(1); consistency + maintainability.
- **Acceptance criteria:**
  - GIVEN any motion in this spec WHEN it specifies a duration/easing THEN it MUST come from the shared motion tokens (no scattered magic numbers).
  - GIVEN the reduced-motion preference WHEN any motion runs THEN it MUST consult the single shared gate.
- **PII/RBAC impact:** none.

### FR-2: Scroll-reveal primitive

- **Description:** The system MUST provide a reusable reveal primitive that fades + rises target elements into view as they first enter the viewport (once), reusable across sections and card grids. The element's **final state is its natural visible state**; the reveal only enhances the entrance.
- **Rationale / Source:** proposal §4(1)/(6).
- **Acceptance criteria:**
  - GIVEN a section using the reveal AND motion allowed WHEN it scrolls into view THEN its content animates from a slightly lowered, transparent state to its natural position/opacity, once.
  - GIVEN the same section AND reduced-motion (or no JS) THEN the content is shown in its final visible state with no animation.
- **PII/RBAC impact:** none.

### FR-3: Hero entrance + count-up

- **Description:** On `/`, the Hero MUST play a one-time entrance on load: a staggered reveal of eyebrow → headline → supporting copy → CTAs, a subtle treatment of the photo panel that **does not delay the largest-contentful-paint image**, and an animated count-up of the LiveRegistryCard "1,000+" figure.
- **Rationale / Source:** proposal §4(2).
- **Acceptance criteria:**
  - GIVEN motion allowed WHEN `/` loads THEN the hero text elements reveal in sequence and the "1,000+" counts up to its value.
  - GIVEN the hero photo (LCP element) WHEN the entrance plays THEN the image is NOT animated from `opacity:0` (so LCP is not delayed) — any image treatment keeps it fully painted.
  - GIVEN reduced-motion THEN the hero renders fully and statically, with the final "1,000+" shown immediately.
- **PII/RBAC impact:** none.

### FR-4: MetricsBand count-up

- **Description:** On `/`, the four MetricsBand figures MUST count up from 0 to their live values when the band scrolls into view and the metrics data has loaded.
- **Rationale / Source:** proposal §4(3).
- **Acceptance criteria:**
  - GIVEN metrics loaded AND motion allowed WHEN the band enters the viewport THEN each figure animates 0 → its value, once.
  - GIVEN reduced-motion OR metrics still loading THEN the figure shows its final value (or the existing loading state) with no count animation.
- **PII/RBAC impact:** none (metrics are public, PII-safe).

### FR-5: CropCoverage card stagger

- **Description:** On `/`, the CropCoverage crop cards MUST stagger-reveal as the section enters the viewport.
- **Acceptance criteria:** GIVEN motion allowed WHEN the section enters view THEN the crop cards reveal with a short stagger, once; GIVEN reduced-motion THEN all cards are shown statically.

### FR-6: Directory grid stagger

- **Description:** On `/directory`, the `ActorCard` grid MUST stagger-reveal on initial load, and MAY apply a brief, subtle re-reveal when the filter/search result set changes. Re-reveals MUST stay subtle and MUST NOT block interaction or re-trigger on every keystroke disruptively.
- **Acceptance criteria:**
  - GIVEN motion allowed WHEN the directory results first render THEN the cards stagger in, once.
  - GIVEN reduced-motion THEN cards render statically; filtering/search behavior is unchanged.
- **PII/RBAC impact:** none.

### FR-7: Reduced-motion compliance

- **Description:** ALL motion in this spec MUST be disabled for users with `prefers-reduced-motion: reduce` — they MUST receive the final, static state with no animation (no fades, rises, count-ups, or scroll-driven motion).
- **Rationale / Source:** constitutional (system-design principle #5 + §reduced-motion); WCAG 2.3.3/2.2.2.
- **Acceptance criteria:**
  - GIVEN `prefers-reduced-motion: reduce` WHEN any animated surface renders THEN no animation runs and all content is immediately in its final visible state.
- **PII/RBAC impact:** none.

### FR-8: Progressive enhancement & test determinism

- **Description:** Motion MUST be a pure enhancement: the rendered DOM MUST contain all content in its final, visible state independent of GSAP, so the portal works with JS disabled / before hydration, and so RTL + jest-axe suites remain deterministic with GSAP mocked.
- **Acceptance criteria:**
  - GIVEN GSAP does not run (no JS, pre-hydration, or mocked in tests) WHEN a surface renders THEN its content is present and visible (no element left permanently hidden).
  - WHEN the test suite runs with GSAP mocked THEN components render their final content and all existing tests + jest-axe pass.
- **PII/RBAC impact:** none.

## 4. Non-Functional Requirements

- **NFR-1 (Accessibility, WCAG 2.1 AA):** reduced-motion honored (FR-7); no content hidden from assistive tech by motion; `jest-axe` MUST report 0 violations on the animated surfaces. **MUST.**
- **NFR-2 (Performance / Core Web Vitals):** animate **transform/opacity only** (GPU; no layout); **no CLS** (no layout-animating reveals; reserve space); the hero LCP image MUST NOT be delayed by motion; target 60fps. **MUST.**
- **NFR-3 (Static export):** motion is client-only (`'use client'`, `useGSAP`); no SSR/route handlers; `next build` (output: export) MUST stay green. **MUST.**
- **NFR-4 (Tokens):** durations/easings come from the shared §7 motion tokens; no scattered magic numbers; existing color/geometry tokens unchanged. **MUST.**
- **NFR-5 (Test stability):** the existing frontend suite (281 tests) + jest-axe MUST continue to pass; GSAP is mocked in jsdom and `window.matchMedia` polyfilled. **MUST.**
- **NFR-6 (Tasteful intensity):** motion is subtle/professional for an institutional registry — no looping, auto-playing, infinite, or parallax-heavy effects; entrances are once-only. **MUST.**
- **NFR-7 (Bundle):** GSAP + `@gsap/react` + `ScrollTrigger` are client-only; the bundle delta is documented; load only what is used. **SHOULD.**

## 5. Data & Schema Impact

**None.** No backend, API, Prisma, PII, or data change. Frontend-only motion layer + a token addition.

## 6. Out of Scope

- Animating Leaflet map internals (markers/tiles); route/page-transition animations; looping/parallax/auto-playing effects; any content, layout, color, data, or copy change; backend/infra/auth.

## 7. Dependencies & Assumptions

- New deps: `gsap`, `@gsap/react` (client-only). GSAP is free under its current license.
- Builds on archived `changes/home-page`, `actors/directory`, `changes/brand-palette-pabra`; reuses §7 tokens + existing `motion-reduce:` discipline already in `Button`/`Skeleton`/`Header`.
- Implementation follows the available GSAP skills (`gsap-react`, `gsap-scrolltrigger`, `gsap-core` matchMedia, `gsap-performance`).
- Deploy via existing `infra/scripts/deploy-frontend.sh` (`--profile IBD-DEV`).

## 8. Open Questions (defaults from the approved proposal)

- **OQ-1 (intensity):** subtle/professional (default) vs bold. **Resolved default:** subtle.
- **OQ-2 (surfaces):** Home + Directory in scope (default); Map/Profile reveals deferred. **Resolved default:** Home + Directory.
- **OQ-3 (motion tokens in §7):** add a durations/easings scale. **Resolved default:** yes.
- **OQ-4 (count-up):** metric figures animate 0 → value (reduced-motion shows final instantly). **Resolved default:** yes.

## 9. Requirement ID Index

FR-1 motion foundation · FR-2 scroll-reveal · FR-3 hero entrance + count-up · FR-4 metrics count-up · FR-5 crop-card stagger · FR-6 directory grid stagger · FR-7 reduced-motion · FR-8 progressive enhancement/test determinism · NFR-1 a11y · NFR-2 performance · NFR-3 static export · NFR-4 tokens · NFR-5 test stability · NFR-6 intensity · NFR-7 bundle.

---
**Conventions reminder:** motion only — no PII/color/layout/data change. Reduced-motion is a hard gate. All AWS uses `--profile IBD-DEV`.
