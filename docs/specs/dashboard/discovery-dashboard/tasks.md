# Tasks — Seed Discovery Dashboard

Spec path: `docs/specs/dashboard/discovery-dashboard/` · Consumed by `/sdd-execute` (Leader → Implementer → Reviewer).
All work is in `frontend/`. Commits: `[SPEC:dashboard/discovery-dashboard] <message>`.

## Phase A — Data & pure logic (no UI)

- [x] T-1 Extend `ActorsQuery` with capacity + district  (deps: none)
      Scope: Add optional `capacityMin?: number`, `capacityMax?: number`, `district?: string` to `ActorsQuery` in `lib/api/actors.ts`; extend the `getActors()` querystring builder to emit `capacityMin`/`capacityMax`/`district` when defined (omit-if-undefined, matching existing pattern). No other behavior change.
      Traces: FR-3, requirements §5, design.md §2/§3
      Files: frontend/lib/api/actors.ts, frontend/lib/api/actors.test.ts
      Verify: `cd frontend && npm run test -- actors`
      Done when: new params serialize into the querystring when set and are omitted when undefined; existing actors tests still pass; `tsc` clean.

- [x] T-2 Filter ⇄ URL codec  (deps: none)
      Scope: `lib/dashboard/filters-url.ts` — pure `encodeFilters(q: ActorsQuery): URLSearchParams` and `decodeFilters(params): ActorsQuery` round-trip (crop, role, region, district, capacityMin, capacityMax, search). Numeric fields parsed/guarded; empty omitted.
      Traces: FR-2, NFR-7, design.md §5.3
      Files: frontend/lib/dashboard/filters-url.ts, frontend/lib/dashboard/filters-url.test.ts
      Verify: `cd frontend && npm run test -- filters-url`
      Done when: encode→decode is identity for representative filter sets; invalid/empty params decode to `undefined` fields.

- [x] T-3 Pure aggregation functions  (deps: none)
      Scope: `lib/dashboard/aggregate.ts` — `aggregate(actors: PublicActor[])` returning `{ kpis, capacityByRegion, byCrop, byType }`. KPIs: `matchingCount`, `totalCapacityTons`, `medianCapacityTons`, `capacityReportingCount`, `regionsCovered`, `actorTypes`. Null `capacityTons` excluded from sums/median and counted in `capacityReportingCount` basis (FR-4/OQ-3). Series are label/value arrays ready for charts.
      Traces: FR-4, FR-5, requirements OQ-3, design.md §5.5
      Files: frontend/lib/dashboard/aggregate.ts, frontend/lib/dashboard/aggregate.test.ts
      Verify: `cd frontend && npm run test -- aggregate`
      Done when: tests cover null-capacity exclusion, empty input (zeros, no throw), distinct region/type counts, and per-crop/per-type grouping.

- [ ] T-4 Bounded fetch-all hook  (deps: T-1)
      Scope: `lib/dashboard/useDashboardActors.ts` — given `ActorsQuery`, fetch with `pageSize = DASH_PAGE_SIZE` accumulating up to `DASH_MAX_PAGES` (constants documented; default covers ~1k). Returns `{ actors, total, truncated, loading, error }`. Reuses `getActors` (null-on-failure, NFR-6). If API capacity filter is unavailable, apply `capacityMin/Max` client-side over fetched rows (same null-exclude rule) — documented fallback (design.md §3).
      Traces: FR-10, FR-11, NFR-6, design.md §3/§5.2
      Files: frontend/lib/dashboard/useDashboardActors.ts, frontend/lib/dashboard/useDashboardActors.test.ts
      Verify: `cd frontend && npm run test -- useDashboardActors`
      Done when: hook accumulates pages, sets `truncated` when `total > fetched`, degrades to error state on null, and never throws.

## Phase B — Presentational building blocks

- [x] T-5 Chart token palette  (deps: none)
      Scope: `lib/dashboard/chart-tokens.ts` — map crops → `var(--crop-*)` strings and a categorical sequence (region/type) from existing tokens (primary/accent/highlight/bean…). Export only CSS-var strings; no hex.
      Traces: NFR-5, design.md §5.4/§8
      Files: frontend/lib/dashboard/chart-tokens.ts, frontend/lib/dashboard/chart-tokens.test.ts
      Verify: `cd frontend && npm run test -- chart-tokens`
      Done when: every exported colour matches `/^var\(--/`; crop slugs map to their crop token.

- [ ] T-6 Add Recharts dependency  (deps: none)
      Scope: Add `recharts` to `frontend/package.json` dependencies; install. No usage yet.
      Traces: design.md §7/§8 (ADR-1)
      Files: frontend/package.json, frontend/package-lock.json
      Verify: `cd frontend && npm install && npm run build`
      Done when: dependency installed and static `npm run build` stays green.

- [ ] T-7 ChartCard shell + data-table fallback  (deps: T-5, T-6)
      Scope: `components/dashboard/charts/ChartCard.tsx` — token-styled card with title, `role="figure"` + `aria-label`, a responsive chart slot (children), and a `<details><summary>Data table</summary>…</details>` rendering the same `{label,value}` series; explicit empty state when series is empty; `prefers-reduced-motion` flag exposed to children.
      Traces: FR-5, FR-6, NFR-4, design.md §5.4
      Files: frontend/components/dashboard/charts/ChartCard.tsx, frontend/components/dashboard/charts/ChartCard.test.tsx
      Verify: `cd frontend && npm run test -- ChartCard`
      Done when: data-table fallback renders the series values; empty series shows the empty state; no raw hex/geometry.

- [ ] T-8 Three discovery charts  (deps: T-7, T-3)
      Scope: `CapacityByRegionChart.tsx` (bar), `CropDistributionChart.tsx` (bar/pie, crop-token colours), `ActorTypeChart.tsx` (bar) under `components/dashboard/charts/`. Each consumes an aggregate series, wraps in `ResponsiveContainer` inside `ChartCard`, colours via `chart-tokens`, animation gated by reduced-motion.
      Traces: FR-5, FR-6, NFR-4, NFR-5, design.md §5.4
      Files: frontend/components/dashboard/charts/CapacityByRegionChart.tsx, CropDistributionChart.tsx, ActorTypeChart.tsx (+ tests)
      Verify: `cd frontend && npm run test -- charts`
      Done when: each renders its series + data-table fallback; colours are token vars; renders without error for empty + populated series.

- [ ] T-9 KPI band  (deps: T-3)
      Scope: `components/dashboard/KpiBand.tsx` + `KpiCard.tsx` — render the FR-4 KPIs with token styling; skeleton/"—" fallback when data null; capacity basis label ("over N reporting capacity").
      Traces: FR-4, NFR-6, design.md §5.5
      Files: frontend/components/dashboard/KpiBand.tsx, KpiCard.tsx (+ test)
      Verify: `cd frontend && npm run test -- KpiBand`
      Done when: KPIs reflect aggregate output; null data shows fallback, never crashes.

- [ ] T-10 Dashboard filters + capacity range  (deps: T-1, T-2)
      Scope: `components/dashboard/DashboardFilters.tsx` + `CapacityRangeControl.tsx` — crop/region/district/actor-type selects (reuse `lib/content/{crops,regions,roles}`), search input, and min/max tons inputs with validation + clear. Emits merged `ActorsQuery` (page reset to 1) via `onChange`. Labels + focus states (a11y).
      Traces: FR-2, FR-3, NFR-4, design.md §5.3
      Files: frontend/components/dashboard/DashboardFilters.tsx, CapacityRangeControl.tsx (+ tests)
      Verify: `cd frontend && npm run test -- DashboardFilters`
      Done when: changing any control (incl. capacity) calls `onChange` with the merged query; inputs have associated labels.

- [ ] T-11 Shortlist table  (deps: T-1)
      Scope: `components/dashboard/ShortlistTable.tsx` — compact rows (name, region/district, type, crops, capacity) each linking to the actor profile route; bounded row count with "See all in Directory →" link carrying current filters; explicit empty state. No PII fields rendered.
      Traces: FR-8, NFR-1, design.md §5.7
      Files: frontend/components/dashboard/ShortlistTable.tsx (+ test)
      Verify: `cd frontend && npm run test -- ShortlistTable`
      Done when: rows link to profiles; no `phone`/`email` present; empty state renders; "see all" link includes filters.

- [ ] T-12 PII-free CSV export  (deps: T-3, T-11)
      Scope: `lib/dashboard/csv.ts` (public-column allowlist serializer + KPI summary header) and `components/dashboard/DownloadViewButton.tsx` (client-side Blob download, no SSR). Test asserts output never contains `phone`/`email`.
      Traces: FR-9, NFR-1, NFR-2, design.md §5.7/§6
      Files: frontend/lib/dashboard/csv.ts, csv.test.ts, frontend/components/dashboard/DownloadViewButton.tsx (+ test)
      Verify: `cd frontend && npm run test -- csv`
      Done when: CSV contains public columns + aggregates and asserts absence of PII; download is client-only.

- [ ] T-13 Dashboard map panel  (deps: T-1)
      Scope: `components/dashboard/DashboardMapPanel.tsx` — wrap existing `components/map/ActorMap` (dynamic, ssr:false), feeding the shared filter-derived actor data/selection. Reuse only; no Leaflet logic duplicated.
      Traces: FR-7, NFR-2, design.md §5.6
      Files: frontend/components/dashboard/DashboardMapPanel.tsx (+ test)
      Verify: `cd frontend && npm run test -- DashboardMapPanel`
      Done when: panel renders ActorMap with the shared actors; no SSR; build stays green.

## Phase C — Assembly & integration

- [ ] T-14 DashboardView + route  (deps: T-4, T-8, T-9, T-10, T-11, T-12, T-13)
      Scope: `components/dashboard/DashboardView.tsx` ('use client') — owns filter state, initializes from `useSearchParams()` (via T-2 codec), pushes URL updates (`router.replace`), runs `useDashboardActors` + `aggregate`, and lays out KpiBand · charts · DashboardMapPanel · ShortlistTable · DownloadViewButton with loading/empty/error + truncation notice (FR-10). `app/(public)/dashboard/page.tsx` wraps it in `<Suspense>` with a skeleton (mirrors directory/page.tsx).
      Traces: FR-1, FR-2, FR-10, FR-11, NFR-2, NFR-6, design.md §5.1/§5.3
      Files: frontend/app/(public)/dashboard/page.tsx, frontend/components/dashboard/DashboardView.tsx (+ test)
      Verify: `cd frontend && npm run test -- DashboardView && npm run build`
      Done when: `/dashboard` renders all panels from one filter set; URL reflects filters and restores on reload; truncation notice shows when `truncated`; static build succeeds.

- [ ] T-15 Entry points — nav + Hero CTA  (deps: T-14)
      Scope: Add `{ label: 'Dashboard', href: '/dashboard' }` to `NAV_LINKS` in `components/shell/Header.tsx` (desktop + mobile) and a CTA on the home Hero linking to `/dashboard`.
      Traces: FR-1, design.md §5.8
      Files: frontend/components/shell/Header.tsx, frontend/components/home/Hero.tsx (+ update Header.test.tsx expectations)
      Verify: `cd frontend && npm run test -- Header && npm run build`
      Done when: Dashboard link present in desktop + mobile nav and Hero CTA; Header tests updated and green.

- [ ] T-16 A11y, tokens & build verification pass  (deps: T-14, T-15)
      Scope: Final sweep — keyboard reach of filters/charts (data tables reachable), ≥4.5:1 contrast, `prefers-reduced-motion` honoured, no raw hex/geometry anywhere in `components/dashboard` / `lib/dashboard`, lazy-loading of chart/map verified. Fix any gaps.
      Traces: NFR-2, NFR-3, NFR-4, NFR-5
      Files: frontend/components/dashboard/**, frontend/lib/dashboard/**
      Verify: `cd frontend && npm run lint && npm run build && npm run test`
      Done when: lint/build/test all green; manual a11y checklist (FR-6/NFR-4) passes; grep finds no hex in dashboard sources.

## Dependency Graph

```
T-1 ─┬─ T-4 ──────────────────────────┐
     ├─ T-10 ─┐                        │
     ├─ T-11 ─┼─ T-12 ─┐              │
     └─ T-13 ─┘        │              │
T-2 ──── T-10          │              │
T-3 ─┬─ T-8 ───────────┼──┐           │
     ├─ T-9 ───────────┼──┼───────────┤
     └─ T-12           │  │           │
T-5 ─┐                 │  │           │
T-6 ─┴─ T-7 ── T-8 ────┘  │           │
                          └─ T-14 ──── T-15 ── T-16
```

Eligible-task rule: status `[ ]`/`[~]` and all deps `[x]`; ties broken by document order. Phase A (T-1,T-2,T-3,T-5,T-6) has no deps and can start immediately.

## Testing & Verification Expectations

- Every task carries a runnable `Verify`; prefer the targeted test over the full suite.
- Frontend gates: `npm run test -- <pattern>`, `npm run lint`, `npm run build` (must stay static-export green).
- PII tests (T-11, T-12) are mandatory: assert `phone`/`email` never appear in shortlist/export (NFR-1).
- No task introduces a backend change, a new PII field, or a raw hex colour.

## Execution Conventions

- Commits: `[SPEC:dashboard/discovery-dashboard] <message>`, ending with the `Co-Authored-By` trailer.
- Leader maintains `execution.md` (one entry per loop iteration: PASS/FAIL, files, verification evidence).
- Deploy (post-merge) via `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`; all AWS ops use `--profile IBD-DEV`.
- Recommended skills: `ui-ux-pro-max`, `tailwind-design-system`, `vercel-react-best-practices` (UI tasks T-7..T-15); `frontend-design`, `react-doctor` (assembly T-14); `error-handling-patterns` (T-4 resilience).
