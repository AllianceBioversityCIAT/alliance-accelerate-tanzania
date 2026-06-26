# Execution Log — Seed Discovery Dashboard

Spec path: `docs/specs/dashboard/discovery-dashboard/`
Branch: `feature/discovery-dashboard`
Loop: Leader → Implementer → Reviewer (max 3 rework attempts/task).

## Document Control

| Field | Value |
|---|---|
| Started | 2026-06-26 |
| Leader | Claude (orchestrator) |
| Status | In progress |

## Task Execution History

### T-1 — Extend `ActorsQuery` with capacity + district — ✅ PASS (attempt 1)

- **Date:** 2026-06-26
- **Requirements covered:** FR-3 (capacity filter exposed); design.md §2/§3.
- **Attempts:** 1
- **Attempt 1:**
  - **Files changed:** `frontend/lib/api/actors.ts`, `frontend/lib/api/actors.test.ts`.
  - **Implementation:** Added optional `capacityMin?: number`, `capacityMax?: number`, `district?: string` to `ActorsQuery`; extended `getActors()` querystring builder to emit them only when `!= null` (numbers via `String()`); added 3 tests (set-serialization of capacity + district incl. a space-containing value, and omit-when-undefined).
  - **Verification:** `cd frontend && npm run test -- actors` → **19 passed** (16 pre-existing + 3 new).
  - **Reviewer verdict:** PASS — all five audit gates clear (no PII, no SSR, no stack substitution, no scope creep, conforms to FR-3/design §2). Diff confined to the two allowed files.
- **Decisions:** `!= null` keeps `capacityMin: 0` valid (intentional); `district` passed as-is (string).
- **Final result:** Committed `22bcaf4`.

### T-2 / T-3 / T-5 — Phase-A foundation (parallel batch) — ✅ PASS

- **Date:** 2026-06-26
- **Orchestration note:** Leader ran these three dependency-free, disjoint-file tasks concurrently (one Implementer each) to speed Phase A, then audited each with an independent Reviewer.
- **T-2 — Filter ⇄ URL codec** (FR-2, NFR-7; design §5.3): `filters-url.ts` + test (14 tests pass). Reviewer: code PASS on all substantive gates.
- **T-3 — Pure aggregate()** (FR-4, FR-5, OQ-3; design §5.5): `aggregate.ts` + test (18 tests pass; null-capacity excluded from sum/median yet counted elsewhere; median odd/even/empty; multi-crop counting; desc sort). Reviewer: code PASS on all substantive gates.
- **T-5 — Chart token palette** (NFR-5; design §5.4/§8): `chart-tokens.ts` + test (20 tests pass; every colour a `var(--…)` string, verified against globals.css). Reviewer: token gate + all substantive gates PASS.
- **Reviewer FAIL → resolved (parallelization artifact, not a code defect):** all three Reviewers initially returned FAIL for the *same* reason — each saw the *other* two tasks' still-untracked files in the shared working tree and flagged them as out-of-scope. No reviewer found any defect in its own task's code. Leader resolution (the exact remediation all three prescribed): committed each task's two files in **isolation** so each commit contains exactly its pair — `git show <sha> --name-only` confirms 2 files per commit. T-2 `f843576`, T-3 `490af39`, T-5 `0f79960`.
- **Lesson applied going forward:** when batching parallel tasks, scope reviewers to the named files and treat sibling-task untracked files under the same spec as not-in-scope (or commit-then-review).
- **Final result:** All three committed in isolation; code verified PASS.

### T-6 — Add Recharts dependency — ✅ PASS (attempt 1)

- **Date:** 2026-06-26
- **Requirements covered:** design.md §8 ADR-1 (Recharts).
- **Files changed:** `frontend/package.json` (+`"recharts": "^3.9.0"`), `frontend/package-lock.json`.
- **Verification:** `cd frontend && npm install && npm run build` → compiled successfully, 13/13 static pages, exporting 2/2 (static export intact).
- **Reviewer verdict:** PASS — only the 2 allowed files changed; no SSR; React-19 compatible (build is proof); transitive graph expected (d3-*, victory-vendor, etc.).
- **Final result:** Committed `4ffb251`.

### T-4 / T-7 / T-9 / T-10 / T-11 / T-13 — building-block batch (parallel) — ✅ PASS

- **Date:** 2026-06-26
- **Orchestration:** six dependency-satisfied, disjoint-file tasks implemented concurrently (one Implementer each), then each audited by an independent Reviewer scoped to ONLY its task's files (sibling untracked files explicitly excluded — no repeat of the earlier false positive).
- **Integration gate:** full dashboard suite **159 tests / 9 suites pass**; `tsc --noEmit` clean across all new code.
- **T-4 — Bounded fetch-all hook** (FR-10/FR-11/NFR-6; design §3/§5.2): `useDashboardActors.ts` + test (13 tests). Reviewer PASS — accumulation, truncation flag, first/later-page null handling, client-side capacity fallback, unmount guard all correct. Commit `51aa967`.
- **T-7 — ChartCard shell + data-table fallback** (FR-5/FR-6/NFR-4; design §5.4): `charts/ChartCard.tsx` + test (16 tests). One fixup before commit: `JSX.Element` return type → `React.ReactElement` (React-19 strict tsc). Reviewer PASS — figure/aria, exclusive empty state, real `<details>` data table, SSR-safe matchMedia, tokens-only. Commit `24e5d5a`.
- **T-9 — KPI band** (FR-4/NFR-6; design §5.5): `KpiCard.tsx` + `KpiBand.tsx` + test (17 tests). Reviewer PASS — five tiles, "N reporting capacity" basis on both capacity tiles, Skeleton fallback, `<dl>/<dt>/<dd>` a11y, tokens-only. Commit `5911c65`.
- **T-10 — Dashboard filters + capacity range** (FR-2/FR-3/NFR-4; design §5.3): `DashboardFilters.tsx` + `CapacityRangeControl.tsx` + test (25 tests). Reviewer PASS — all 7 controls labelled, page-reset merge, empty/negative/NaN → undefined, tokens-only. Commit `fa3e258`.
- **T-11 — Shortlist table** (FR-8/NFR-1; design §5.7): `ShortlistTable.tsx` + test (25 tests). Reviewer PASS — **PII gate clear** (no phone/email at type or render level; sentinel+regex tests), profile link `/profile?id=` matches existing `ActorCard`, see-all link via `encodeFilters`, empty state, tokens-only. Commit `0e876e0`.
- **T-13 — Dashboard map panel** (FR-7/NFR-2; design §5.6): `DashboardMapPanel.tsx` + test (11 tests). One fixup before commit: test fixture corrected to real `PublicActor` shape (`traderName`/`traderType`/`gps`). Reviewer PASS — reuses `ActorMap` (no fork, no direct Leaflet, no SSR), forwards all 5 real props, tokens-only. Commit `5d3fee5`.
- **Outstanding (non-blocking):** Reviewer warnings/suggestions logged (e.g. data-table row keys, redundant `aria-live` on static empty state, median decimal formatting, extra test cases) — quality polish, deferred; none affect WCAG/PII/correctness gates.
- **Final result:** All six committed in isolation; tree clean.

### T-8 / T-12 — Phase B remainder (parallel) — ✅ PASS

- **Date:** 2026-06-26
- **T-8 — Three discovery charts** (FR-5/FR-6/NFR-4/NFR-5; design §5.4): `CapacityByRegionChart`, `CropDistributionChart`, `ActorTypeChart` + `charts.test.tsx` (52 tests). Recharts wrapped in `ChartCard`; series built once, drives both chart and data-table; animation gated by `useChartReducedMotion`; crop/type slugs mapped to friendly labels. **Fixup before commit:** charts referenced `var(--color-fg-muted)` which does NOT exist in globals.css → replaced with the real `var(--color-muted)` (NFR-5). Verified post-fix: every chart `var(--…)` exists in globals.css; no hex. Commit `6498e89`.
- **T-12 — PII-free CSV export** (FR-9/NFR-1/NFR-2; design §5.7/§6): `csv.ts` + `DownloadViewButton.tsx` + tests (44 tests). `buildDashboardCsv` uses an explicit `PUBLIC_COLUMNS` allowlist via a `switch` (never spreads the actor object) + KPI summary block + RFC-4180 escaping; button builds a Blob and downloads client-side (no SSR), revoking the object URL. **PII gate clear** — no phone/email anywhere; "poisoned actor" test proves stray keys aren't serialized. Commit `5456508`.
- **Review note:** the delegated Reviewer agent was temporarily unavailable (model classifier outage) when these two were ready. Per the error-handling fallback, the **Leader performed the conformance audit directly** via read-only inspection: hex scan (none), token existence (all present), allowlist/no-spread + PII-absence (confirmed structurally), client-only download + `'use client'` (confirmed), reduced-motion gating + ChartCard wrapping (confirmed), and full test runs (charts 52 + csv/button 44 = 96 pass; tsc clean). Recorded as PASS by Leader audit.
- **Final result:** Both committed in isolation; tree clean. **Phase A + B complete (T-1…T-13).**

### T-14 — DashboardView + /dashboard route — ✅ PASS (Leader audit)

- **Date:** 2026-06-26
- **Requirements:** FR-1, FR-2, FR-10, FR-11, NFR-2, NFR-6; design §5.1/§5.3.
- **Files:** `app/(public)/dashboard/page.tsx` (Suspense boundary mirroring directory), `components/dashboard/DashboardView.tsx`, `DashboardView.test.tsx` (20 tests).
- **Implementation:** `'use client'` view owns `ActorsQuery` initialised from `useSearchParams` via `decodeFilters`; every filter change updates state + `router.replace(?encodeFilters, {scroll:false})` (FR-2 shareable). Runs `useDashboardActors` + memoised `aggregate`; builds a `PublicActorList` for the reused map; lays out filters · truncation notice (FR-10) · KpiBand · 3 charts · DashboardMapPanel · ShortlistTable · DownloadViewButton; explicit error + empty states (NFR-6). Single `<h1>`, tokens-only.
- **Build-integrity fixup (cross-task):** `npm run build` (first build since T-6) surfaced an ESLint failure from T-7/T-13 test files containing `// eslint-disable-next-line @typescript-eslint/no-explicit-any` — a rule this project's eslint config (`next/core-web-vitals` only) doesn't load, so the unknown-rule reference errored the build. Leader replaced the suppressed `any` usages with typed equivalents in `ChartCard.test.tsx` and `DashboardMapPanel.test.tsx` (commit `92cc389`). Root-caused: those tasks only ran jest, not build, so it went unnoticed until T-14.
- **Verification:** `npm run test -- DashboardView` 20/20; `npm run build` **green** — `/dashboard` exports as a static route (○ Static, 119 kB / 227 kB first load); `tsc --noEmit` clean.
- **Review:** delegated Reviewer agent unavailable (classifier outage) → **Leader conformance audit** (read-through): URL sync, single h1, all panels wired to correct building-block APIs, truncation/error/empty states, tokens-only, Suspense/no-SSR. PASS.
- **Note for T-16:** `/dashboard` first-load JS is heavy (Recharts) — candidate for lazy-loading the charts in the a11y/perf sweep.
- **Final result:** eslint fix `92cc389`, T-14 `8065b86`. Committed.
