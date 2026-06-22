# Archive Summary — Home Page (Public Registry Portal landing)

## 1. Document Control

| Field | Value |
|---|---|
| Spec name | Home Page (Public Registry Portal landing) |
| Original spec path | `docs/specs/changes/home-page/` |
| Archive path | `docs/specs/archive/2026-06-22-changes--home-page/` |
| Branch | `feature/home-page` |
| Archive date | 2026-06-22 |
| Final commit at archive | `c3c845e` `[SPEC:changes/home-page] resolve validation WARN — design doc next.config.mjs` |
| Methodology | JCSPECS SDD (Leader → Implementer → Reviewer loop) |

## 2. Original Spec Path

`docs/specs/changes/home-page/` — contained `proposal.md`, `requirements.md`, `design.md`, `tasks.md`, `execution.md`, `validation-report.md`, and this `archive-summary.md`.

## 3. Archive Date

2026-06-22.

## 4. Final Status

**COMPLETE — validated, archive-ready.** All 7 tasks (T-1..T-7) PASS with reviewer sign-off; validation `PASS` with no FAIL findings and the single cosmetic WARN resolved. Delivered the static-export Next.js public home page at `/` plus the reusable public shell, design-token system, and metrics API client that later public specs build on.

## 5. Requirements Delivered

| Req | Title | Delivered by | Status |
|---|---|---|---|
| FR-1 | Landing page structure (header/hero/metrics/crops/footer); no PII | T-3, T-4, T-6 | ✅ |
| FR-2 | Hero + CTAs (Explore the Map / Browse Directory) | T-4 | ✅ |
| FR-3 | Live aggregate metrics band (4 figures) | T-5, T-6 | ✅ |
| FR-4 | Crop coverage cards with live per-crop counts + crop tokens | T-6 | ✅ |
| FR-5 | Role-aware header auth slot (Public sign-in default) | T-3 | ✅ |
| FR-6 | Primary navigation with active state | T-3 | ✅ |
| FR-7 | Footer with governance note | T-3 | ✅ |
| NFR-1 | Static export, no SSR/route handlers | T-1, T-7 | ✅ |
| NFR-2 | Responsive 360→1280 | T-4, T-6, T-7 | ✅ |
| NFR-3 | Accessibility (WCAG 2.1 AA basics) | T-7 | ✅ |
| NFR-4 | Design tokens, no hardcoded values | T-2 | ✅ |
| NFR-5 | Non-blocking, crash-safe metrics fetch | T-5 | ✅ |

## 6. Files Changed Summary

Derived from `execution.md`. New frontend application under `frontend/`:

- **Bootstrap & config (T-1/T-2):** `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json`, `package.json`, `.env.example`, `app/globals.css` (§7 design tokens as CSS vars + Tailwind `var(--…)` mapping), `app/layout.tsx`.
- **Shell & routing (T-3):** `app/(public)/layout.tsx`, `app/(public)/page.tsx`, `components/shell/Header.tsx`, `components/shell/Footer.tsx`, `lib/auth/useSession.ts`, `.eslintrc.json`.
- **Hero (T-4):** `components/home/Hero.tsx`, `components/ui/Button.tsx`.
- **Metrics client (T-5):** `lib/api/client.ts`, `lib/api/metrics.ts`, `lib/api/useMetrics.ts`, `jest.config.ts`, `jest.setup.ts`, `lib/api/metrics.test.ts`, `lib/api/useMetrics.test.ts`.
- **Metrics band + crop coverage (T-6):** `components/home/MetricsBand.tsx`, `components/home/CropCoverage.tsx`, `components/home/CropCard.tsx`, `components/ui/StatCard.tsx`, `components/ui/Skeleton.tsx`, `lib/content/crops.ts`, + tests `MetricsBand.metrics-band.test.tsx`, `CropCoverage.crop.test.tsx`.
- **A11y verification (T-7):** `components/home/home-a11y.test.tsx` (jest-axe), `jest-axe` + `@types/jest-axe` devDeps.

Commit trail (spec-prefixed): T-1 `c8ee8c4` · T-2 `7b60e94` · T-3 `c4fa7c9` · T-4 `5a0df60` · T-5 `89aa122` · T-6 `e2bbf0a` · T-7 `b397ff0` · validation `11e9525` · WARN fix `c3c845e`.

## 7. Test Evidence Summary

No standalone `test-report.md` — test evidence lives in the codebase and is summarized in `validation-report.md §9`. **Total: 21 tests across 5 suites, all passing:**

- `lib/api/metrics.test.ts` (8) — `getMetrics` success + 6 failure modes (NFR-5).
- `lib/api/useMetrics.test.ts` (4) — hook states + unmount guard.
- `components/home/MetricsBand.metrics-band.test.tsx` (3) — live values / `—` fallback / skeleton (FR-3).
- `components/home/CropCoverage.crop.test.tsx` (4) — crop names/descriptions, per-slug counts, fallback, `/directory` link (FR-4).
- `components/home/home-a11y.test.tsx` (2) — jest-axe `toHaveNoViolations`, success + null states (NFR-3).

Build integrity at validation: `tsc --noEmit` clean · `npm run build` static export (`out/index.html`, `/` = `○ Static`) · `npm run lint` clean · static-export grep empty (no SSR). **Accepted:** absence of a separate `test-report.md` (the `/sdd-test` artifact) — coverage is automated, in-repo, and validated.

## 8. Validation Summary

`validation-report.md` — overall **PASS, archive-ready**. All phases PASS (task completion, file existence, build integrity, requirement coverage, code quality, design conformance). Every FR/NFR mapped to a complete task with code + test evidence; observed behavior matches requirement intent including the FR-3/NFR-5 graceful-fallback path and FR-1 PII-absence (no `phone`/`email` in any UI). No FAIL findings.

## 9. Accepted Warnings Or Follow-Ups

- **Cosmetic WARN (RESOLVED):** design.md originally referenced `next.config.js`; updated to `next.config.mjs` in §4 tree + §3 prose (commit `c3c845e`). No open warnings remain.
- **No deferred follow-up tasks.** Items intentionally out of scope (Map, Directory, Actor profiles, Cognito auth implementation, admin shell, final brand assets, localization, the backend `GET /api/v1/metrics` implementation) belong to future specs, not this one.

## 10. Historical Notes

- This spec also bootstrapped the minimal frontend (DD-1) since no frontend existed; `lib/api/client.ts` and the `Metrics` type are the first shared contracts reused by later public specs.
- Single rework in the whole loop: T-4 attempt 1 FAILed on an NFR-4 token bypass (a decorative SVG stripe embedded a hardcoded `#E3E5DE`); fixed by switching to `fill='currentColor'` + `text-border`. Reinforced project pattern: decorative pattern colors must derive from tokens via `currentColor`.
- T-7 required no component source changes — a11y structure was already conformant from T-3..T-6; T-7 added durable automated jest-axe coverage instead.
- The metrics endpoint (`GET /api/v1/metrics`) is consumed, not built here; the page ships and degrades gracefully before that backend exists (DD-3).
- Auth slot is a presentational stub (DD-4); full Cognito wiring is a separate future spec.
