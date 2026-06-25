# Execution Log — Portal Motion Layer (GSAP animations)

- Spec path: docs/specs/enhancement/portal-animations/
- Orchestration: JCSPECS Leader → Implementer → Reviewer triad (`/sdd-execute`).
- Branch: feature/portal-animations (cut off main).

## Task Execution History

### T-1 — Motion foundation: deps + tokens + GSAP setup + test harness — PASS (attempt 1)
- Date: 2026-06-25 · Implementer: impl-m1 (frontend-developer)
- Files: `frontend/lib/motion/{motion-tokens,gsap-setup}.ts` (+ `__tests__/motion-foundation.test.ts`, 11 smoke), `frontend/__mocks__/{gsap.ts,gsap/ScrollTrigger.ts,@gsap/react.ts}`, `jest.config.ts` (moduleNameMapper → mocks), `jest.setup.ts` (window.matchMedia polyfill), `app/globals.css` + `tailwind.config.ts` (motion tokens `--dur-*`/`--ease-*`), `docs/system-design/design.md` §7 (Motion tokens subsection); deps `gsap@^3.15` + `@gsap/react@^2.1`.
- Verification: `cd frontend && npm test` → **292/292** (29 suites; 281 pre-existing + 11 smoke); `npm run build` static export green; lint clean. Leader re-verified identical.
- Reviewer (rev-m1) **PASS**: tokens mirror design §5.1/CSS §7; `registerGsap()` idempotent + SSR-safe (no GSAP/ScrollTrigger at import time); mock wiring via `moduleNameMapper` keeps the suite deterministic (`useGSAP` runs callback once, gsap/ScrollTrigger no-op, `matchMedia` polyfilled); tokens additive (existing tokens untouched); no existing component changed.
- Requirements: FR-1, FR-8, NFR-3, NFR-4, NFR-5. Final: PASS.

### T-2 — `useReveal` scroll-reveal primitive — PASS (attempt 1)
- Date: 2026-06-25 · Implementer: impl-m2
- Files: `frontend/lib/motion/useReveal.tsx` (hook + `<Reveal as className>` wrapper; children-stagger + single variants), `__tests__/useReveal.test.tsx` (22).
- Verification: `npm test -- useReveal` → **22/22**; full suite **327/327**; static build green.
- Reviewer (rev-m2) **PASS**: animation only inside the `(prefers-reduced-motion: no-preference)` matchMedia branch (FR-7); `gsap.from` resting-visible (FR-8, tests assert `.toBeVisible()` with GSAP mocked); transform/opacity only (`autoAlpha`,`y`, NFR-2); `once:true` (NFR-6); token-driven; `'use client'`/runtime-register (no SSR).
- Requirements: FR-2, FR-7, FR-8, NFR-1, NFR-2, NFR-6. Final: PASS.

### T-3 — `useCountUp` number count-up primitive — PASS (attempt 1)
- Date: 2026-06-25 · Implementer: impl-m3
- Files: `frontend/lib/motion/useCountUp.ts` (ref + `(target,{enabled,format,suffix,durationSec})`; proxy + `onUpdate`→textContent), `useCountUp.test.tsx` (13).
- Verification: `npm test -- useCountUp` → **13/13**; full suite **327/327**; static build green.
- Reviewer (rev-m3) **PASS**: count-up only in the no-preference branch (FR-7); `onUpdate` writes textContent, no per-frame React render (NFR-2); disabled/reduced-motion/null/non-finite paths leave the JSX-rendered final value intact (FR-8 — tests prove final value survives with GSAP mocked, `enabled:false`, null/NaN/Infinity); `toLocaleString` handles "1,000+" + integers; COUNT_UP token; cleanup-safe; `'use client'`. Advisory (non-blocking): relies on consumer-JSX final value (stronger FR-8 reading) + an extra `durationSec` option — both sound.
- Requirements: FR-3, FR-4, FR-7, FR-8, NFR-2. Final: PASS.

### T-4 — Hero entrance + LiveRegistry count-up — PASS (attempt 1)
- Date: 2026-06-25 · Implementer: impl-m4
- Files: `Hero.tsx` (`'use client'`; `useGSAP` entrance timeline stagger eyebrow→h1→copy→CTAs via `gsap.from autoAlpha+y`; LiveRegistryCard "1,000+" via `useCountUp`; **photo wrapper `scale 1.04→1` only — image opacity never touched, LCP-safe**), `Hero.hero.test.tsx` (11).
- Verification: Hero+home 22/22; full 354/354; `/` static ○.
- Reviewer (rev-m4) **PASS**: panelRef on the wrapper (not `<Image>`), only scale; entrance + count-up gated by matchMedia no-preference; "1,000+" hardcoded in JSX (FR-8); tokens-only; markup/copy unchanged.
- Requirements: FR-3, FR-7, FR-8, NFR-1, NFR-2, NFR-3. Final: PASS.

### T-5 — MetricsBand count-up — PASS (Leader review; reviewer agent non-responsive)
- Date: 2026-06-25 · Implementer: impl-m5
- Files: `StatCard.tsx` (`'use client'`; `countUp?:boolean` default false; `numericTarget` only when finite; `useCountUp` ref on the number span; **JSX always renders `{displayValue}`** — FR-8; loading-skeleton + em-dash unchanged), `MetricsBand.tsx` (`countUp = !loading && data!=null` → 4 cards), `StatCard.test.tsx` (16), `MetricsBand.metrics-band.test.tsx` (+2).
- Verification: MetricsBand+StatCard 19/19; full 354/354; build green.
- Leader review **PASS** (rev-m5 idled without posting): diff is additive/motion-only; final values always in JSX (FR-8); count-up gated by `!loading && data` + matchMedia (FR-4/FR-7); skeleton/em-dash paths intact.
- Requirements: FR-4, FR-7, FR-8. Final: PASS.

### T-6 — CropCoverage card stagger — PASS (attempt 1)
- Date: 2026-06-25 · Implementer: impl-m6
- Files: `CropCoverage.tsx` (`useReveal` on the crop-card grid + a header reveal; from-based; motion-only).
- Verification: CropCoverage 4/4; full 354/354; build green.
- Reviewer (rev-m6) **PASS**: grid `gridRef` (`:scope > *` stagger) + header `{stagger:0}`; from-based → cards visible with GSAP mocked (FR-8); reduced-motion no-op (FR-7); transform/opacity only; content/grid/tokens unchanged.
- Requirements: FR-5, FR-7, FR-8. Final: PASS.

### T-7 — Directory grid stagger — PASS (attempt 1)
- Date: 2026-06-25 · Implementer: impl-m7
- Files: `DirectoryView.tsx` (`useReveal` on the ActorCard `<ul>`; brief re-reveal keyed `[queryKey, loading]` via `useGSAP {revertOnUpdate, scope}`, `DURATION.fast`, `overwrite:true`, skipped while loading; **zero behavioral change**).
- Verification: directory 83/83 (6 suites incl. a11y); full 354/354; `/directory` static ○.
- Reviewer (rev-m7) **PASS**: additive motion-only — handlers/pushParams/URL-sync/ResultCount/pagination/aria-live identical; from-based (FR-8); matchMedia-gated (FR-7); transform/opacity only. Non-blocking note: the re-reveal also fires once on the first loading→settled transition (overlaps the initial stagger) — harmless (`overwrite:true`, reduced-motion-gated, FR-6 still met); a comment-tightening polish opportunity only.
- Requirements: FR-6, FR-7, FR-8. Final: PASS.

### T-8 — A11y / performance / static-export verification pass — PASS (attempt 1)
- Date: 2026-06-25 · Implementer: impl-m8
- Files: `home-a11y.test.tsx` (+5 reduced-motion final-state tests), `directory-a11y.test.tsx` (+2). Test-only — no component/motion change.
- Verification: full suite **361/361** (33 suites; +7); `npm run build` green — all routes `○ Static`; jest-axe **0 violations** on Home + Directory with the motion layer.
- Reviewer (rev-m8) **PASS**: new tests genuinely assert present+visible via the GSAP-mocked (== reduced-motion) path — Hero h1/CTAs/"1,000+", MetricsBand figures, CropCoverage cards, Directory ActorCards/heading/search; axe still clean; diff test-only; reduced-motion claim sound (`matchMedia().add` no-op + `from`-based / JSX-final-value).
- Manual CWV checklist (NFR-2/NFR-7):
  - **LCP** — hero `<Image priority>` is never opacity/autoAlpha-animated; only the wrapper `scale 1.04→1` → image paints immediately.
  - **CLS = 0** — all reveals animate `autoAlpha` + `y` (transform) only; no width/height/margin/padding animated.
  - **Once-only** — all `scrollTrigger { once:true }`; Hero timeline fires once on mount; directory re-reveal keyed on query + skipped while loading (NFR-6).
  - **Bundle (NFR-7)** — `/` 161 kB, `/directory` 157 kB First Load JS (103 kB shared framework); GSAP client-only (both surfaces `'use client'`), no SSR bloat.
  - **Reduced-motion** — `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` gate in every hook; auto-reverts on OS toggle; resting DOM = natural visible state.
- Requirements: NFR-1, NFR-2, NFR-3, NFR-5, NFR-6. Final: PASS.

## Notes
- The recurring file-sync artifacts (`" 2"`/`" 3"` numbered duplicate copies) reappear during runs; swept (broadened to any `" N"`) before commits, never staged.
