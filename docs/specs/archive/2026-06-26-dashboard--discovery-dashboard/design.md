# Design — Seed Discovery Dashboard

- Spec path: docs/specs/dashboard/discovery-dashboard/
- Status: Draft
- Traces requirements: FR-1..FR-11, NFR-1..NFR-7 from this spec's requirements.md

## 1. Approach Overview

The dashboard is a **frontend-only, static-export client feature**. A new `/dashboard` route mounts a single owning component (`DashboardView`) that holds the **one** filter set (FR-2), syncs it to the URL, fetches the matching **public** actors via the existing `lib/api` client (no new backend), aggregates them in the browser with pure functions, and feeds the derived data into four kinds of panel: KPI band, charts, the reused Leaflet map, and a shortlist. A "Download this view" action serializes the same public data to a CSV Blob client-side.

```
                 ┌────────────────────── DashboardView (client) ──────────────────────┐
 URL ?crop=…  ⇄  │  filters (state) ──► useDashboardActors() ──► PublicActor[] (public) │
 &capacityMin=10 │      │                      │  (bounded fetch over GET /actors)        │
                 │      │                      ▼                                          │
                 │      │            aggregate(actors)  ─► { kpis, series } (pure)        │
                 │      ▼                      │                                          │
                 │  DashboardFilters     ┌─────┼───────────────┬──────────────┐          │
                 │  (crop/region/        ▼     ▼               ▼              ▼          │
                 │   district/type/   KpiBand  ChartCard×3   DashboardMap   Shortlist    │
                 │   capacity/search)            (Recharts)  (reuse ActorMap)  + Download │
                 └────────────────────────────────────────────────────────────────────┘
        All data from public endpoints only → PII boundary enforced server-side (FR-11/NFR-1).
```

No SSR/route handlers (NFR-2): the page is a client component; Recharts and Leaflet are code-split/lazy. Nothing here runs on a server — the NestJS API remains the only backend.

## 2. Data Model Changes

**None.** No Prisma models, fields, migrations, or PII-allowlist changes (requirements §5). The only contract change is a **frontend type extension**:

```ts
// lib/api/actors.ts — ActorsQuery gains optional capacity bounds + district
export interface ActorsQuery {
  crop?: string;
  role?: string;          // maps to traderType filter (existing)
  region?: string;
  district?: string;      // NEW (optional) — district narrowing
  capacityMin?: number;   // NEW — wired to API ?capacityMin
  capacityMax?: number;   // NEW — wired to API ?capacityMax
  search?: string;
  page?: number;
  pageSize?: number;
}
```

`getActors()` querystring builder adds `capacityMin`, `capacityMax`, `district` when defined (same omit-if-undefined pattern already used).

## 3. API Surface & Contracts

**No new endpoints.** Reuse, all Public, all PII-safe by existing server-side projection:

| Method & path | Used for | Params added by this spec |
|---|---|---|
| `GET /api/v1/actors` | Shortlist + client aggregation source | `capacityMin`, `capacityMax`, `district` (already accepted server-side per detailed-design §4) |
| `GET /api/v1/actors/geo` | Map markers (via reused `ActorMap`) | — |
| `GET /api/v1/metrics` | Optional global denominators for KPI context | — |

**Fetch-all-matching strategy (FR-10, OQ-2):** `useDashboardActors(filters)` requests `pageSize = DASH_PAGE_SIZE` and accumulates sequential pages up to `DASH_MAX_PAGES`, stopping early once `accumulated.length >= total`. **`DASH_PAGE_SIZE` MUST NOT exceed the backend's `MAX_PAGE_SIZE = 100`** — the list endpoint validates `pageSize` with `@Max(100)` and returns **HTTP 400** above it (backend `actors/dto/list-query.dto.ts`). Values: `DASH_PAGE_SIZE = 100`, `DASH_MAX_PAGES = 10` → a 1,000-row cap covering the current public dataset (~436 consented actors → ~5 calls). If `total > fetched`, it returns `{ actors, total, truncated: true }` and the UI shows a truncation notice linking to `/directory`. This keeps the page honest without a backend aggregate.

**Capacity-filter fallback (FR-3, dependency in requirements §7):** if execution finds the API does **not** honor `capacityMin/Max`, the hook applies the capacity bound client-side over fetched rows and the design note is updated; behavior (exclude null capacity) is identical either way.

## 4. Backend Design

**None.** This spec adds no NestJS module, controller, service, guard, or DTO. (A future `/dashboard/aggregate` endpoint is an explicit non-goal — requirements §6.)

## 5. Frontend Design

### 5.1 Route

```
frontend/app/(public)/dashboard/page.tsx     # Suspense boundary → <DashboardView/>
```

`page.tsx` wraps `DashboardView` in `<Suspense>` (DashboardView uses `useSearchParams()` for URL-synced filters, which requires a Suspense boundary under `output: 'export'` — mirrors `directory/page.tsx`). Provides a skeleton fallback.

### 5.2 Component inventory

```
frontend/components/dashboard/
  DashboardView.tsx          # 'use client' — owns filters, URL sync, fetch, aggregation; lays out panels
  DashboardFilters.tsx       # crop · region · district · actor type · capacity range · search (URL-synced)
  CapacityRangeControl.tsx   # min/max tons inputs (FR-3) with validation + clear
  KpiBand.tsx / KpiCard.tsx  # FR-4 — matching count, total/median capacity, regions, types
  charts/
    ChartCard.tsx            # shared shell: title + responsive chart slot + <details> data-table (FR-6)
    CapacityByRegionChart.tsx# FR-5a — Recharts bar
    CropDistributionChart.tsx# FR-5b — Recharts bar/pie, crop-token colours
    ActorTypeChart.tsx       # FR-5c — Recharts bar
  DashboardMapPanel.tsx      # FR-7 — wraps existing ActorMap with shared filters/selection
  ShortlistTable.tsx         # FR-8 — compact rows → profile links, no PII, bounded + "see all" → /directory
  DownloadViewButton.tsx     # FR-9 — client-side CSV Blob (public columns only)

frontend/lib/dashboard/
  aggregate.ts               # pure: PublicActor[] → { kpis, capacityByRegion, byCrop, byType }
  aggregate.test.ts          # unit tests for the pure aggregation (null-capacity handling, FR-4/FR-3)
  useDashboardActors.ts      # bounded fetch-all hook (returns {actors,total,truncated,loading,error})
  csv.ts                     # public-safe CSV serialization (FR-9, asserts no PII columns)
  chart-tokens.ts            # maps crop/type → design-token CSS-var colour strings (NFR-5)
  filters-url.ts             # encode/decode ActorsQuery ⇄ URLSearchParams (FR-2/NFR-7)
```

### 5.3 Filter state & URL sync (FR-2, NFR-7)

`DashboardView` reads initial filters from `useSearchParams()` via `filters-url.ts`, holds them in state, and on every change pushes a shallow URL update (`router.replace`, no scroll) so the view is shareable/restorable. The same `ActorsQuery` object drives the fetch hook **and** the map panel — single source of truth (FR-11 parity). Filter controls reuse the option sources already in the repo: `lib/content/crops.ts`, `lib/content/regions.ts` (canonical 31), `lib/content/roles.ts` (`ROLES`), keeping the dashboard's filters consistent with `/map` and `/directory`.

### 5.4 Charts (FR-5/FR-6) — Recharts

- **Library:** `recharts` (ADR-1). Rendered inside `ResponsiveContainer`; each chart lives in `ChartCard`, which renders the chart **and** an equivalent `<details><summary>Data table</summary>…</details>` table (FR-6) built from the same series — one data source, two presentations.
- **Colour:** chart `fill`/`stroke` use **design-token CSS variables** as SVG colour strings (e.g. `fill="var(--crop-sorghum)"`) via `chart-tokens.ts` — SVG honours CSS custom properties, so no raw hex and full token compliance (NFR-5). Crop series use the existing `--crop-*` tokens; categorical (region/type) series use a token-derived sequence (primary/accent/highlight/bean…).
- **A11y:** charts are decorative-with-table-fallback; `ChartCard` labels the figure (`role="figure"` + `aria-label`), and the data table is the assistive equivalent. Animations gated by `prefers-reduced-motion` (Recharts `isAnimationActive={!reducedMotion}`).
- **Empty state:** when series are empty, `ChartCard` renders an explicit "No data for this filter" panel, not a blank canvas (FR-5).

### 5.5 KPI band (FR-4)

`aggregate.ts` computes from the fetched `PublicActor[]`: `matchingCount`, `totalCapacityTons` and `medianCapacityTons` (over actors with non-null `capacityTons`, with `capacityReportingCount` exposed so the basis is explicit — FR-4/OQ-3), `regionsCovered` (distinct), `actorTypes` (distinct). `KpiBand` renders token-styled `KpiCard`s with skeleton/"—" fallback on null (NFR-6).

### 5.6 Map panel (FR-7)

`DashboardMapPanel` renders the existing `components/map/ActorMap` (dynamic, `ssr:false`) passing the shared filter-derived actor data/selection — **reuse, no fork**. This inherits the static-export-safe Leaflet loading and the consent-gated public geo feed already in place.

### 5.7 Shortlist + download (FR-8/FR-9)

- `ShortlistTable` lists matching actors (name, region/district, type, crops, capacity), each linking to `/profile/[id]` (or the existing actor profile route). Bounded to N rows with a "See all N in the Directory →" link to `/directory` carrying the same filters. No PII columns (FR-8).
- `DownloadViewButton` builds a CSV from the **public** shortlist columns + a KPI summary header via `csv.ts`, triggers a client-side `Blob` download (no SSR). `csv.ts` is built from an explicit public-column allowlist and unit-tested to assert `phone`/`email` never appear (FR-9/NFR-1).

### 5.8 Entry points (FR-1)

Add a "Dashboard" link to `NAV_LINKS` in `components/shell/Header.tsx` (desktop + mobile) and a CTA on the home Hero pointing to `/dashboard`.

## 6. Security & RBAC

- **Public route**, no auth. The dashboard consumes **only public endpoints**; the PII boundary is enforced server-side (detailed-design §8) and the dashboard adds no PII surface (FR-11/NFR-1).
- **Defense-in-depth at the edge:** `csv.ts` and `ShortlistTable` build output from an explicit **public-field allowlist**, so even a future API change can't leak PII through the dashboard without a test failing.
- No new secrets, no CORS change (same origin/API as the rest of the frontend).

## 7. Infrastructure / Deployment

- Frontend-only. No IaC change. Deploy via `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh` (S3 sync + CloudFront invalidate). All AWS ops use `--profile IBD-DEV`.
- New runtime dependency: `recharts` added to `frontend/package.json`. Verify it tree-shakes and the static `npm run build` stays green (NFR-2).

## 8. Decision Records (ADR-style)

### Decision: Charting library — Recharts (not ECharts)
- **Context:** FR-5/FR-6 need responsive, token-themed, accessible charts over ~1k actors on a static-export React app. User named ECharts and Recharts.
- **Options:** (a) Recharts — declarative React/SVG, tree-shakeable, trivial to theme with CSS-var tokens. (b) ECharts — canvas, powerful, native geo, but heavier + imperative theming. (c) Visx/raw SVG — most control, most effort.
- **Decision:** **Recharts.** SVG honours our token CSS vars directly; the spatial view is already Leaflet's job, so ECharts' geo/canvas strengths aren't needed; bundle stays small and code-split.
- **Consequences:** If we later want choropleth/heatmaps at scale, revisit ECharts for that single panel — not a blocker now.

### Decision: Client-side aggregation over a bounded fetch (no backend aggregate)
- **Context:** KPIs/charts need grouped counts/sums for the filtered set; FR-10 demands honesty about coverage.
- **Options:** (a) client aggregate over fetched rows; (b) new `/dashboard/aggregate` endpoint.
- **Decision:** **(a)** for v1 — dataset is ~1k, no backend work, single filter source of truth. Pure `aggregate.ts` is fully unit-testable.
- **Consequences:** Must bound the fetch and disclose truncation (FR-10). Revisit (b) only if the dataset grows past comfortable client aggregation.

### Decision: Reuse `ActorMap`, lift filter state to the dashboard
- **Context:** FR-7 wants the map in the dashboard without diverging from `/map`.
- **Decision:** Render the existing `ActorMap`; the dashboard owns one `ActorsQuery` shared by fetch + map.
- **Consequences:** Any future map fix benefits both pages; no duplicate Leaflet logic.

### Decision: Tokens via CSS-var colour strings in SVG charts
- **Context:** NFR-5 forbids raw hex; Recharts needs colour values.
- **Decision:** Pass `var(--token)` strings as `fill`/`stroke`; centralize in `chart-tokens.ts`.
- **Consequences:** Full token compliance; theme changes propagate automatically.

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| API ignores `capacityMin/Max` | Client-side capacity fallback in `useDashboardActors` (§3); same null-exclude behavior. |
| Aggregating only part of a large result set misleads users | Bounded fetch + visible truncation notice + link to full directory (FR-10). |
| Recharts inflates the static bundle | Code-split charts (lazy import); verify `npm run build` size; ResponsiveContainer only on dashboard. |
| Charts inaccessible (colour-only) | Mandatory `<details>` data-table per chart (FR-6); token contrast ≥ 4.5:1 (NFR-4). |
| Accidental PII leak via export/table | Public-field allowlist in `csv.ts`/shortlist + unit test asserting no `phone`/`email` (NFR-1). |
| `useSearchParams` breaks static export | Suspense boundary in `page.tsx` (mirrors `directory/page.tsx`). |

## 10. Test Plan Outline

- **Unit (pure):** `aggregate.test.ts` — KPI math, null-`capacityTons` exclusion + reporting basis (FR-4/FR-3), distinct region/type counts, empty-set handling.
- **Unit:** `csv.test.ts` — output contains public columns and **never** `phone`/`email` (FR-9/NFR-1); `filters-url.test.ts` — encode/decode round-trip (FR-2/NFR-7); `chart-tokens.test.ts` — only `var(--…)` token strings, no hex (NFR-5).
- **Component (RTL):** `DashboardFilters` updates shared query incl. capacity (FR-3); `ChartCard` renders a data-table fallback (FR-6); `KpiBand` shows fallback on null data (NFR-6); `ShortlistTable` renders profile links and no PII fields (FR-8); truncation notice appears when `truncated` (FR-10).
- **Build/lint:** `npm run build` (static export green, NFR-2), `npm run lint`, `tsc`.
- **Manual:** set crop=common bean + capacityMin=10 + region → KPIs/charts/map/shortlist agree; copy URL → restores view (FR-2); keyboard-traverse charts → data tables reachable (NFR-4).
