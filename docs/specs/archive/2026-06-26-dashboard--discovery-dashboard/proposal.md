# Proposal — Seed Discovery Dashboard

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `dashboard/discovery-dashboard` |
| Status | Draft proposal — awaiting approval |
| Author | AI agent (Claude) with JuanCode |
| Date | 2026-06-26 |
| Type | New domain feature (builds on existing `/map` + `/directory`) |
| Related specs | `changes/home-page` (archived), `enhancement/about-and-home-content` (archived) |
| Constitutional refs | `docs/prd.md`, `docs/detailed-design/detailed-design.md` §3–§8, `docs/system-design/design.md` §7 |

## 2. Intent

Give a **demand-side user** (e.g. an offtaker who needs *">10 tons of common bean in a given zone"*) a single screen where they can **filter → see the answer visualized (charts + map) → drill into the matching actors → take/export the result** — instead of mentally assembling that answer from a raw map and a separate directory list.

The dashboard is the "so what?" layer on top of the data we already expose: it turns the registry from *"here are pins on a map"* into *"here is who can supply what you need, where, and how to act on it."*

## 3. Problem / Current Behavior

Today the platform exposes two **discovery surfaces** over the same Actor dataset:

- **`/map`** — Leaflet map of actors (crop-coloured markers) with a filter rail; great for *"where"* but not for *"how much / how many / which mix."*
- **`/directory`** — paginated, filterable, searchable card list; great for *browsing individuals* but gives no aggregate picture.

Gaps for the target task ("find suppliers of crop X, capacity ≥ N, in region Y, then act"):

1. **No aggregate view.** A user cannot see, at a glance, *how many* actors / *how much* total capacity matches their filter, broken down by region / crop / actor type.
2. **No capacity-aware filtering in the UI.** The API supports `capacityMin`/`capacityMax` (detailed-design §4), but the frontend `ActorsQuery` and filter controls don't expose it — so *"≥10 t"* isn't a filter a user can set.
3. **Map and list are separate pages** with independent filter state; the user can't see the chart, the map, and the matching shortlist reacting to **one** filter set.
4. **No "take the result with me."** There's no per-result export/print for a filtered shortlist (the CSV `/export` exists but is Staff/Admin-only and not surfaced as a user action).

## 4. Proposed Outcome

A new public route **`/dashboard`** (linked from the primary nav and the home Hero CTA) that, against **one shared, URL-synced filter set** (crop, region/district, actor type, **capacity range**, search), renders:

1. **KPI summary band** — matching actors, total/median capacity (t), regions covered, actor-type count — recomputed live as filters change.
2. **Charts** (responsive, token-themed, accessible — each with a data-table fallback):
   - Capacity by region (bar) — *"where is the supply?"*
   - Actors by crop (donut/stacked) — *"what is grown?"*
   - Actor-type breakdown (bar) — *"who are they?"*
   - Optional: capacity distribution / top-N suppliers.
3. **Map panel** — the existing Leaflet map, reused, driven by the same filters (the "where" stays spatial).
4. **Matching shortlist** — compact results table/cards (name, region, type, crops, capacity) linking to each actor's profile; **no PII** for Public.
5. **Export / report** — "Download this view": CSV/print of the *aggregates + shortlist* for everyone; the existing role-gated `/export` (with PII) remains the Staff/Admin path.

**On the user's contact goal — important constraint:** `phone` and `email` are **PII, never exposed to Public** (detailed-design §8; hard project constraint). So the dashboard can make a Public user's *discovery* fast and let them build a precise shortlist, but it **cannot** hand a Public user farmer phone numbers. Closing the contact loop for Public is a deliberate **open question** (see §11) — options range from "shortlist only, contact via Staff" to a future consent-based "request introduction" flow. This proposal scopes the **discovery + visualize + shortlist + export** layer and flags contact as a follow-up decision, not a silent assumption.

## 5. Scope

- New `/dashboard` page (static-export client component) with shared, URL-synced filter state.
- Add a charting library (recommend **Recharts** — see §9/§10) and a small token-themed chart wrapper set.
- KPI summary band derived from the filtered actor set + `/metrics`.
- 3–4 core charts, each with an accessible data-table fallback (`chart` / `data-table` UX rules).
- Reuse the existing Leaflet map and actor list components (no fork) driven by the shared filters.
- **Add capacity range (`capacityMin`/`capacityMax`) to the frontend `ActorsQuery` + filter UI** (the API already supports it).
- "Download this view" — client-side CSV/print of public aggregates + shortlist.
- Nav + Hero CTA entry points to `/dashboard`.

## 6. Non-Goals

- **No exposure of PII** to Public via charts, tooltips, table, or export (phone/email stay gated).
- No new backend aggregation endpoints in v1 if existing `/actors` (filtered, paginated) + `/metrics` suffice; a dedicated `/dashboard/aggregate` endpoint is a *possible* optimization, not a commitment (§9).
- No SSR/ISR/route handlers — static export only (NestJS owns all server logic).
- No write/edit actions; this is a read/discovery surface.
- Not replacing `/map` or `/directory` — the dashboard composes and links to them.
- No "request introduction"/messaging system in v1 (flagged as future, §11).

## 7. Affected Users, Systems, And Specs

- **Users:** offtakers/buyers and program staff (primary); any Public visitor (discovery).
- **Frontend:** new `app/(public)/dashboard/`; new `components/dashboard/*`; extend `lib/api/actors.ts` (`ActorsQuery` + capacity); reuse `components/map/*`, `lib/api/useActors`, `lib/api/useMetrics`; nav (`components/shell/Header.tsx`) + home Hero CTA.
- **Backend:** likely **none** in v1 (reuse `/actors`, `/metrics`); confirm `capacityMin/Max` filter is live, and consider an aggregate endpoint only if client-side aggregation over the page set proves insufficient.
- **Design system:** chart palette must come from `design.md §7` tokens (crop colours already exist: `--crop-sorghum/bean/groundnut`).
- **Specs:** extends the discovery story from the home-page specs; no conflicts.

## 8. Requirement Delta Preview

### ADDED Requirements

- A public `/dashboard` route presenting KPI summary, charts, map, and a matching shortlist over one shared, URL-synced filter set.
- Capacity-range filtering exposed in the UI and wired to the API's `capacityMin/capacityMax`.
- Accessible charts: keyboard-reachable, token-coloured, each with a data-table equivalent.
- "Download this view" producing a PII-free CSV/print of aggregates + shortlist for Public.

### MODIFIED Requirements

- `ActorsQuery` (frontend) gains `capacityMin` / `capacityMax`.
- Primary nav + home Hero gain a `/dashboard` entry point.

### REMOVED Requirements

- None. `/map` and `/directory` remain.

## 9. Approach Options

### Option A — Compose on the client over existing endpoints *(recommended)*
Build `/dashboard` as a client page that fetches filtered actors via the existing `/actors` (+ `/metrics`) and computes KPIs/chart series in the browser; reuse the map + list components.
- **Pros:** no backend work; ships fastest; stays within static-export; one source of filter truth; dataset (~1,000 actors) is small enough to aggregate client-side.
- **Cons:** client must fetch enough rows to aggregate accurately (pagination/"all matching" fetch strategy needed); heavier first paint than a precomputed aggregate.

### Option B — Add a backend aggregate endpoint (`GET /api/v1/dashboard/aggregate`)
NestJS computes the grouped counts/sums (by region/crop/type, capacity buckets) for a filter set; frontend just renders.
- **Pros:** exact, cheap on the client, scales past 1k actors; keeps PII enforcement server-side by construction.
- **Cons:** new backend surface + tests + deploy; more moving parts for v1; the data volume may not justify it yet.

### Option C — Heavy analytics with ECharts + geo
Use Apache ECharts (canvas, built-in geo/map, rich interactions) for a denser analytical dashboard.
- **Pros:** most powerful; native geo heat/choropleth; handles large data.
- **Cons:** heavier bundle, imperative API, more theming work to honour design tokens; overkill for current dataset; we already have Leaflet for the spatial view.

## 10. Recommended Approach

**Option A (client-side composition) + Recharts**, with **Option B kept as a fast-follow** if client aggregation over the full matching set becomes awkward.

- **Why Recharts over ECharts (the two you named):** Recharts is declarative React/SVG, tree-shakeable, and trivial to theme with our Tailwind design tokens — the right fit for a ~1k-actor, token-driven, accessible dashboard on a static export. ECharts is more powerful (canvas + native geo), but heavier and imperative; its big wins (huge datasets, built-in choropleth) aren't needed because **Leaflet already owns the spatial view** and our dataset is small. If we later want geo-analytics/heatmaps at scale, revisit ECharts for that specific panel.
- **Why client-side first:** zero backend change, fastest path to value, and it keeps a single filter source of truth. We add a backend aggregate only if measured need appears.

**My take on the idea itself:** it's a strong, on-mission addition. The PRD's whole premise is "find who has the seed and the capacity, and where" — a filter-driven dashboard with charts + map + shortlist is a more direct answer to that than a map alone, especially for the offtaker persona you described. The one thing to decide deliberately is the **contact step**, since PII gating means a Public user can discover *who* but not get their phone number — we should choose how that loop closes (§11) rather than imply the dashboard makes contacts downloadable.

## 11. Risks, Dependencies, And Open Questions

- **PII / contact loop (decision needed):** How does a Public buyer act on a shortlist if phone/email are gated? Options: (a) shortlist only, contact brokered by Staff; (b) future consent-based "request introduction" flow; (c) surface only consented, non-PII channels. **Recommend (a) for v1**, (b) as a separate spec.
- **Capacity data completeness:** `capacityTons` is `Decimal?` (nullable) — charts/sums must handle missing capacity (exclude or bucket as "unknown") and say so, not silently undercount.
- **Consent gating:** Public reads already exclude non-`GRANTED` actors and null exact GPS — KPIs/charts must reflect the *same* public-visible population so totals match the map/directory.
- **Client aggregation completeness:** must fetch the full matching set (not just page 1) to aggregate honestly; need a bounded "fetch all matching" or server aggregate (Option B) — and must `log`/show if results are truncated.
- **Accessibility:** charts need data-table fallbacks, sufficient contrast, and keyboard access (UX rules `chart-type`, `data-table`, `color-contrast`).
- **Bundle/perf:** lazy-load chart and map panels (`reduced-motion`, `image-optimization`, code-split) to keep the static page light.
- **Dependency:** confirm the API's `capacityMin/Max` filter is implemented and returns the expected envelope.

## 12. Success Criteria

- A user can, in one screen, set *crop = common bean, capacity ≥ 10 t, region = X* and immediately see: matching count + total capacity, a region/crop/type chart breakdown, the matching pins on the map, and a clickable shortlist — all from one filter set, URL-shareable.
- No PII (phone/email) appears anywhere on the dashboard or its export for Public; KPIs/charts count only the public-visible (consented) population.
- Every chart has an accessible data-table equivalent and token-based colours (no raw hex).
- "Download this view" produces a PII-free CSV/print of the current aggregates + shortlist.
- Lighthouse/perf and a11y remain within project norms; build passes under static export.

## 13. Next Step

```text
/sdd-specify dashboard/discovery-dashboard
```
