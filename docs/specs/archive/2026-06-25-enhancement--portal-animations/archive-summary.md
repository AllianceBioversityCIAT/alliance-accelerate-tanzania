# Archive Summary — Portal Motion Layer (GSAP animations)

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/enhancement/portal-animations/` |
| Archive path | `docs/specs/archive/2026-06-25-enhancement--portal-animations/` |
| Archive date | 2026-06-25 |
| Final status | **Complete — validated PASS (2 accepted WARNs), deployed live** |
| Depth | Standard |
| Branch | `feature/portal-animations` |

## 2. Original Spec Path

`docs/specs/enhancement/portal-animations/` — proposal, requirements, design, tasks, execution, validation-report, this summary.

## 3. Archive Date

2026-06-25.

## 4. Final Status

All 9 tasks `[x]` (T-1..T-9; T-5 Leader-reviewed after its reviewer agent stalled). Validation **PASS** (no FAIL; 2 cosmetic/accepted WARNs). The GSAP motion layer is **live** on CloudFront.

## 5. Requirements Delivered

- **FR-1** centralized `lib/motion/` foundation (motion tokens + GSAP setup + one `prefers-reduced-motion` gate; §7 motion tokens).
- **FR-2** `useReveal` scroll-reveal primitive (`gsap.from`, once, transform/opacity).
- **FR-3** Hero entrance stagger + LiveRegistry "1,000+" count-up (LCP-safe: photo scale-only).
- **FR-4** MetricsBand count-up (gated `!loading && data`).
- **FR-5** CropCoverage card stagger · **FR-6** Directory ActorCard grid stagger.
- **FR-7** reduced-motion hard gate (`gsap.matchMedia`) · **FR-8** progressive enhancement / test determinism (`from`-based + JSX-final-value; GSAP mocked in jsdom).
- **NFR-1..7** a11y (axe 0 + reduced-motion tests), perf (transform/opacity, LCP scale-only, CLS 0, once), static export, §7 tokens, test stability, subtle intensity, client-only bundle.

## 6. Files Changed Summary (from execution.md)

- **New foundation:** `frontend/lib/motion/{motion-tokens,gsap-setup}.ts`, `useReveal.tsx`, `useCountUp.ts` (+ tests); `frontend/__mocks__/{gsap.ts, gsap/ScrollTrigger.ts, @gsap/react.ts}`; `jest.config.ts` (moduleNameMapper), `jest.setup.ts` (matchMedia polyfill).
- **Tokens:** `app/globals.css` (`--dur-*`/`--ease-*`), `tailwind.config.ts`, System Design §7.
- **Surfaces:** `components/home/Hero.tsx` (+ test), `components/home/MetricsBand.tsx`, `components/ui/StatCard.tsx` (+ test), `components/home/CropCoverage.tsx`, `components/directory/DirectoryView.tsx`; a11y tests extended (`home-a11y`, `directory-a11y`).
- **Deps:** `gsap@^3.15`, `@gsap/react@^2.1`.
- Commits: `b02ea8e` (T-1) · `435505f` (T-2) · `9ca1459` (T-3) · `5f68bea` (T-4) · `f6f53e7` (T-5) · `eb95a14` (T-6) · `23c3367` (T-7) · `ae3aa1a` (T-8) · T-9 deploy · `06e9f91` validation.

## 7. Test Evidence Summary

- Frontend **361/361** across 33 suites (motion primitives + surfaces + 7 reduced-motion final-state tests); **8 jest-axe assertions = 0 violations** on Home + Directory; static export green; GSAP mocked + `matchMedia` polyfilled.
- **Live (IBD-DEV):** `/`, `/directory`, `/map`, `/profile` 200 over CloudFront; GSAP/ScrollTrigger confirmed in the shipped bundle.
- Manual CWV checklist recorded (LCP scale-only, CLS 0, once-only, bundle delta, reduced-motion auto-revert).

## 8. Validation Summary

`validation-report.md` — **PASS**, archive-ready. Every FR/NFR covered with test and/or live evidence; a11y/perf/static-export/progressive-enhancement gates hold; design + proposal (Option A) conformance upheld.

## 9. Accepted Warnings Or Follow-Ups

- **WARN-1 (cosmetic):** the Directory re-reveal also fires once on the first `loading→settled` transition, overlapping the initial scroll-reveal stagger — harmless (`overwrite:true`, reduced-motion-gated, ends at natural state, FR-6 met). Optional follow-up: tighten the re-reveal guard so it skips the first settle.
- **WARN-2 (accepted):** GSAP adds ~50 kB to `/` (161 kB) and `/directory` (157 kB) first-load JS — client-only, no SSR bloat (NFR-7 met). Future: lazy-import ScrollTrigger / route-level split if budgets tighten.

## 10. Historical Notes

- Implemented with the available GSAP skills (`gsap-react` `useGSAP`, `gsap-scrolltrigger`, `gsap-core` `matchMedia`, `gsap-performance`) — the user's chosen tool.
- Core design guarantees: **`gsap.from`-based reveals** (resting DOM = visible final state) + **JSX-final-value count-ups** make the motion pure enhancement — content is visible with JS off / pre-hydration / GSAP mocked, which is exactly what keeps the 361-test suite + jest-axe deterministic (FR-8). **Reduced-motion** is a single `gsap.matchMedia` gate per hook (FR-7). The **hero LCP image is never opacity-animated** (only a wrapper scale) so Core Web Vitals don't regress.
- Test harness: GSAP mocked via `moduleNameMapper` (node_modules mocks need explicit mapping) + a `window.matchMedia` polyfill in jsdom.
- Execution ran the full Leader→Implementer→Reviewer triad across 9 tasks; every task passed on the first attempt (no rework, no HALTs). One reviewer agent (T-5) stalled without posting a verdict — the Leader reviewed that diff directly to unblock. The recurring `" N"` file-sync duplicate artifacts were swept each round (never staged).
