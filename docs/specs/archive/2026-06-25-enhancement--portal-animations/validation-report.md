# Validation Report — Portal Motion Layer (GSAP animations)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/enhancement/portal-animations/` |
| Validated | 2026-06-25 |
| Validator | Leader (JCSPECS `/sdd-validate`) |
| Branch | `feature/portal-animations` |
| Depth | Standard |
| Overall result | **PASS** (2 minor accepted WARNs; no FAIL) |
| Archive readiness | **Ready** — `/sdd-archive enhancement/portal-animations` |

## 2. Summary

All 9 tasks are `[x]` with execution-audit entries and independent Reviewer PASS verdicts (T-5 was Leader-reviewed from the diff after its reviewer agent stalled — an environmental failure, not a defect). A centralized GSAP motion layer (`lib/motion/`) ships scroll reveals, a hero entrance, and metric count-ups across Home + Directory — **deployed live** on CloudFront with GSAP confirmed in the bundle. The accessibility + performance contract held throughout: reduced-motion is a hard `gsap.matchMedia` gate, every reveal is `gsap.from`-based and every number is in the JSX (progressive enhancement → content visible without GSAP), animations are transform/opacity-only with the hero LCP image never opacity-animated. **361/361 tests** (incl. 8 jest-axe assertions = 0 violations + explicit reduced-motion final-state tests), static export green, lint clean. Two minor WARNs (a directory re-reveal overlap; the GSAP bundle delta) are accepted. No FAIL.

## 3. Task Completion

| Task | Status | Evidence | Result |
|---|---|---|---|
| T-1 motion foundation (deps/tokens/setup/test harness) | [x] | rev-m1 PASS; 292/292 | PASS |
| T-2 `useReveal` | [x] | rev-m2 PASS; 22/22 | PASS |
| T-3 `useCountUp` | [x] | rev-m3 PASS; 13/13 | PASS |
| T-4 Hero entrance + count-up (LCP-safe) | [x] | rev-m4 PASS; 22/22 | PASS |
| T-5 MetricsBand count-up | [x] | **Leader review** PASS (reviewer agent non-responsive); 19/19 | PASS |
| T-6 CropCoverage stagger | [x] | rev-m6 PASS; 4/4 | PASS |
| T-7 Directory grid stagger | [x] | rev-m7 PASS; 83/83 (incl. a11y) | PASS |
| T-8 a11y/perf/static-export verification | [x] | rev-m8 PASS; 361/361; axe 0 | PASS |
| T-9 deploy + visual verification | [x] | live: /, /directory, /map, /profile 200; GSAP in bundle | PASS |

All tasks carry execution notes + verification evidence in `execution.md`. **Result: PASS.**

## 4. File Existence

All design §5 motion files present: `lib/motion/{motion-tokens.ts, gsap-setup.ts, useReveal.tsx, useCountUp.ts}` (+ tests); GSAP test mocks `__mocks__/{gsap.ts, gsap/ScrollTrigger.ts, @gsap/react.ts}`; `jest.config.ts` (moduleNameMapper) + `jest.setup.ts` (matchMedia polyfill). Motion wired into all five surfaces (Hero, MetricsBand, StatCard, CropCoverage, DirectoryView — grep-confirmed). Motion tokens in `globals.css` + `tailwind.config.ts` + System Design §7. **Result: PASS.**

## 5. Build Integrity

| Check | Command | Result |
|---|---|---|
| Frontend tests | `npm test` | **PASS** 361/361 (33 suites) |
| Frontend build (static export) | `npm run build` | **PASS** — all routes `○ (Static)` |
| Frontend lint | `npm run lint` | **PASS** — no warnings/errors |
| jest-axe (Home + Directory) | within suite | **PASS** — 0 violations |

Frontend-only spec — no backend/infra build involved (the pre-existing backend lint gap from other specs is out of scope here). **Result: PASS.**

## 6. Requirement Coverage

| Req | Covered by | Evidence | Result |
|---|---|---|---|
| FR-1 motion foundation | T-1 | lib/motion tokens + setup + §7; 11 smoke tests | PASS |
| FR-2 scroll-reveal | T-2 | useReveal (from-based, matchMedia, once); 22 tests | PASS |
| FR-3 hero entrance + count-up | T-3, T-4 | Hero timeline + "1,000+" count-up; LCP scale-only | PASS |
| FR-4 metrics count-up | T-3, T-5 | StatCard countUp path; gated `!loading && data` | PASS |
| FR-5 crop-card stagger | T-6 | useReveal on the card grid | PASS |
| FR-6 directory grid stagger | T-7 | useReveal on the ActorCard `<ul>` | PASS |
| FR-7 reduced-motion | all | matchMedia gate; explicit reduced-motion tests (Home + Directory) | PASS |
| FR-8 progressive enhancement / test determinism | T-1..T-7 | from-based + JSX-final-value; 361 tests pass with GSAP mocked | PASS |
| NFR-1 a11y | T-8 | jest-axe 0 on animated surfaces | PASS |
| NFR-2 performance | T-4, T-8 | transform/opacity only; LCP image scale-only; CLS 0 (CWV note) | PASS |
| NFR-3 static export | all | `next build` all routes static | PASS |
| NFR-4 tokens | T-1 | §7 motion tokens; no scattered magic numbers | PASS |
| NFR-5 test stability | T-1, T-8 | GSAP mock + matchMedia polyfill; 281 pre-existing still pass | PASS |
| NFR-6 intensity | all | once-only; no loop/parallax | PASS |
| NFR-7 bundle | T-8 | GSAP client-only; `/` 161 kB, `/directory` 157 kB first-load (documented) | PASS (WARN-2) |

**Result: PASS** — every FR/NFR mapped to a completed task with test and/or live evidence.

## 7. Linting & Code Quality

Frontend lint clean. Reviewers confirmed: tokens-only motion, `gsap.from`-based reveals (resting DOM visible), `useGSAP` scope + auto-cleanup, matchMedia reduced-motion gating in every hook, `onUpdate`-textContent count-up (no per-frame React render), and zero behavioral change to the Directory list/search/pagination.

## 8. Design Conformance

Implementation matches design.md §1–§10 and the GSAP-skill patterns. Decisions upheld: `useGSAP` + `gsap.matchMedia` (ADR §8); `gsap.from` resting-visible (ADR §8); hero LCP image never opacity-animated (ADR §8). Proposal Option A intent/scope/non-goals upheld; open questions resolved per the approved defaults (intensity = subtle; surfaces = Home + Directory; §7 motion tokens added; count-ups on). **Result: PASS.**

## 9. Test Evidence Summary

- Frontend: **361/361** across 33 suites — motion-foundation smoke (11), `useReveal` (22), `useCountUp` (13), Hero (11), StatCard (16), MetricsBand (+2), CropCoverage, Directory (83 incl. a11y), + 7 new reduced-motion final-state tests; **8 jest-axe assertions = 0 violations** on Home + Directory.
- Static export green (all routes `○`); GSAP mocked in jsdom + `window.matchMedia` polyfilled.
- **Live (IBD-DEV):** `/`, `/directory`, `/map`, `/profile` 200 over CloudFront; GSAP/ScrollTrigger confirmed in the shipped bundle.
- Manual CWV checklist recorded in `execution.md` (LCP scale-only, CLS 0, once-only, bundle delta, reduced-motion auto-revert).

## 10. Remediation

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | Directory re-reveal also fires once on the first `loading→settled` transition, overlapping the initial scroll-reveal stagger. | WARN (cosmetic) | Harmless — `overwrite:true`, reduced-motion-gated, ends at natural state, FR-6 still met. Optional follow-up: tighten the re-reveal guard/comment so it skips the first settle. |
| 2 | GSAP adds ~50 kB to the `/` (161 kB) and `/directory` (157 kB) first-load JS. | WARN (accepted) | Client-only, no SSR bloat (NFR-7 met); acceptable for the value delivered. Future: lazy-import ScrollTrigger / route-level code-split if budgets tighten. |

No FAIL findings. Both WARNs accepted (cosmetic / documented).

## 11. Archive Readiness Recommendation

**READY TO ARCHIVE.** All 9 tasks `[x]` with Reviewer PASS (T-5 Leader-reviewed) + live verification; every FR/NFR covered with test and/or live evidence; the a11y (reduced-motion + axe), performance (LCP/CLS), static-export, and progressive-enhancement gates all hold; design + proposal conformance confirmed; the two WARNs are cosmetic/accepted.

```text
/sdd-archive enhancement/portal-animations
```
