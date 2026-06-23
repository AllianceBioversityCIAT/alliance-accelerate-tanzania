# Execution Log — seed-map/discovery-map

Canonical audit trail for the JCSPECS Leader → Implementer → Reviewer loop on this spec.

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `seed-map/discovery-map` |
| Branch | `feature/seed-map-discovery-map` |
| Leader | Claude (orchestrator) |
| Implementer agent | `frontend-developer` seeded with `.agents/implementer.md` |
| Reviewer agent | `code-reviewer` seeded with `.agents/reviewer.md` |
| Started | 2026-06-23 |
| Consumes | archived `seed-map/actor-data-model` (`PublicActor`, `/api/v1/actors`, `/api/v1/metrics`) |

## 2. Task Execution History

### T-1 — Actors API client + `useActors` hook + Leaflet deps — **PASS** (2026-06-23)
- **Implementer attempts:** 1 (`impl-dm-t1`, frontend-developer)
- **Files created:** `frontend/lib/api/actors.ts`, `frontend/lib/api/actors.test.ts`, `frontend/lib/api/useActors.ts`, `frontend/lib/content/roles.ts`. **Deps:** `leaflet@^1.9.4`, `@types/leaflet@^1.9.21` (direct Leaflet — DD-1).
- **Requirements covered:** NFR-1, NFR-4, NFR-5 (partial — client/hook/roles layer).
- **Decisions:** (a) Direct Leaflet over react-leaflet for the static-export/dynamic-import story (design.md §9, DD-1). (b) Hook adds an explicit `error: boolean` beyond `useMetrics` to distinguish null-failure from in-flight loading (design.md §8). (c) `roles.ts` token map: seed_company→primary, cooperative→success, ngo→accent, offtaker→crop-sorghum, research_institute→muted, informal_trader→bean — all §7/tailwind.config keys, no hex.
- **Leader verification:** `npx jest actors` → 11/11 pass; hex-grep clean; `npm run build` → `Exporting (2/2)` static; all 6 role tokens confirmed in `tailwind.config.ts`.
- **Reviewer verdict (`rev-dm-t1`):** **STATUS: PASS** — contract fidelity (mirrors archived foundation `PublicActor`, no PII), DD-6/NFR-5 resilience (null on every failure path, 11 tests), token discipline (NFR-4), static-export safety (NFR-1, `'use client'`, Leaflet imported nowhere yet), hook correctness (unmount guard, error/loading distinction), stability (only 4 new files + package manifests). No automatic-FAIL gate triggered.

### T-2 — `/map` route + client-only ActorMap shell + data states — **PASS** (2026-06-23)
- **Implementer attempts:** 1 (`impl-dm-t2`, frontend-developer)
- **Files created:** `frontend/app/(public)/map/page.tsx`, `frontend/components/map/ActorMap.tsx`, `frontend/components/map/LeafletMap.tsx`, `frontend/components/map/ActorMap.test.tsx`.
- **Requirements covered:** FR-1, FR-7, NFR-1 (static export), NFR-3 (map aria-label), NFR-4, NFR-5.
- **Decisions:** (a) `dynamic(() => import('./LeafletMap'), { ssr:false })` with a Skeleton `loading:` placeholder (DD-1). (b) Leaflet + `leaflet/dist/leaflet.css` imported ONLY inside `LeafletMap.tsx` → stays out of the static bundle. (c) State contract (`filters`/`selectedActorId` + `onSelectActor`) declared on the page/`ActorMap` now so T-3/T-4 wire in without a breaking prop change; `setFilters`/`actors` intentionally unused-by-design until T-4/T-3. (d) Tanzania center `[-6.37, 34.89]`, zoom 6, `maxBounds [[-11.75,29.34],[-0.98,40.44]]`, `maxBoundsViscosity 0.85`. (e) FR-7 branch order: loading → error → empty → data (in-flight null `data` never flashes empty).
- **Leader verification:** `npx jest ActorMap` → 5/5 pass; `npm run build` → `Exporting (2/2)`, `/map` present (2.66 kB, `○ Static`); Leaflet import isolated to `LeafletMap.tsx`; SSR grep only a comment; no code hex (NFR-4).
- **Reviewer verdict (`rev-dm-t2`):** **STATUS: PASS** — all done-criteria met (static-export safety, FR-7 states, no PII, tokens, a11y labels, scope discipline, Leaflet `map.remove()` cleanup).
- **Accepted WARN → T-5 follow-up:** error state in `ActorMap.tsx` (~L101) uses `role="alert"` + redundant `aria-live="polite"` (alert is implicitly assertive). Non-blocking for T-2; **fix in T-5** (the a11y/jest-axe pass) by dropping `aria-live="polite"` so the role governs (assertive is correct for an API-failure alert).

### T-3 — Role-colored pins + ActorPopup + MapLegend — **PASS** (2026-06-23)
- **Implementer attempts:** 1 (`impl-dm-t3`, frontend-developer) — completed in 2 passes within attempt 1 (Leader-gate caught an incomplete first pass before any Reviewer FAIL; no rework attempt consumed).
- **Files:** NEW `frontend/components/map/RoleBadge.tsx`, `ActorPopup.tsx`, `MapLegend.tsx`, `ActorPopup.test.tsx` (9 tests), `MapLegend.test.tsx` (2 tests); MODIFIED `LeafletMap.tsx` (markers/popup/legend/fly-to), `ActorMap.tsx` (forwards `selectedActorId`/`onSelectActor`).
- **Requirements covered:** FR-2 (role-colored pins + legend), FR-3 (popup), FR-6 (privacy-zone legend item), NFR-3, NFR-4, NFR-5.
- **Decisions:** (a) divIcon color via CSS custom-property inline style (`var(--<role-token>)`) from `ROLE_CSS_VAR` — purge-proof, token-compliant (DD-4). (b) Popup HTML via `renderToString(<ActorPopup>)` (static, hook-free). (c) MapLegend mounted as a Leaflet custom `Control` at `bottomleft`. (d) Fly-to gates `flyTo` vs `setView` on `prefers-reduced-motion`. (e) Actors with `gps == null` skipped from the map (list-only — T-4). (f) View Profile → `/directory?actor=${id}` (DD-5/OQ-1).
- **Leader-gate rework (within attempt 1):** first pass shipped components but (i) omitted the 2 required test files, (ii) used `text-white` on the View Profile link (→ fixed to `text-primary-fg`, matching `Button.tsx`), (iii) used raw `rgba(...)` literals in the divIcon (→ fixed to `var(--color-surface)` ring + `var(--shadow-sm)` shadow). Implementer completed all three before review.
- **Leader verification:** `npx jest ActorPopup MapLegend ActorMap` → 19/19 pass; `npm run build` → `Exporting (2/2)`, `/map` (2.67 kB, `○ Static`); Leaflet isolated to `LeafletMap.tsx`; color grep CLEAN; no PII in render code.
- **Reviewer verdict (`rev-dm-t3`):** **STATUS: PASS** — all 9 gates clean (PII, FR-2/3/6, NFR-1/3/4, stability, scope). Confirmed every `ROLE_CSS_VAR` entry resolves to a defined §7 CSS var (crop tokens correctly use `--crop-*`, others `--color-*`).

### T-4 — DiscoverRail: filters + synced list + count — **PASS** (2026-06-23)
- **Implementer attempts:** 1 (`impl-dm-t4`, frontend-developer) — one Leader-gate fix within attempt 1 (no Reviewer FAIL; no rework attempt consumed).
- **Files:** NEW `frontend/lib/content/regions.ts`, `components/map/FilterControls.tsx`, `ActorListItem.tsx`, `ActorList.tsx`, `DiscoverRail.tsx` + 3 test suites (`FilterControls.test.tsx` 8, `ActorList.test.tsx` 9, `DiscoverRail.test.tsx` 13); MODIFIED `app/(public)/map/page.tsx` (placeholder → `<DiscoverRail>`, wired `setFilters`/`setSelectedActorId`, removed `void setFilters`).
- **Requirements covered:** FR-1, FR-4, FR-5, FR-7, NFR-2, NFR-3, NFR-4, NFR-5.
- **Decisions:** (a) **DD-3 filter-value contract** pinned to the backend: crop option value = crop **slug** (DB stores `crop.name` = slug), role = `traderType` slug, region = exact string from a static provisional `REGIONS` (10 seed regions; OQ-6 canonicalization deferred to real import). (b) "All …" clears the field to `undefined` (never empty string) + resets `page:1`. (c) Count = `total ?? actors.length`. (d) Mobile: `useState` disclosure toggle (`md:hidden` button + `hidden md:block` body, `aria-expanded`/`aria-controls`). (e) gps-null actors stay in the list (FR-2) with a "List only — no map location" hint; the map silently ignores selection of a coordinate-less actor.
- **Leader-gate fix (within attempt 1):** Tailwind purge bug — `LoadingRows` used `w-${w}` (runtime-built `w-72`/`w-56`/`w-64`, none static → purged → zero-width skeletons). Fixed to static `['w-3/4','w-1/2','w-2/3']` literals.
- **Leader verification:** `npx jest` (6 map suites) → 50/50 pass; `npm run build` → `Exporting (2/2)`, `/map` (4.81 kB, `○ Static`); Leaflet still isolated to `LeafletMap.tsx`; color grep CLEAN; no PII in render code.
- **Reviewer verdict (`rev-dm-t4`):** **STATUS: PASS** — DD-3 contract correct, server-side refetch driven by `useActors(filters)`, FR-5 sync + `aria-current`, gps-null actors preserved, all FR-7 states graceful, NFR-2/3/4/5 clean, no T-5 scope leaked.

## 3. Summary (updated as tasks complete)
- T-1 **[x] PASS**, T-2 **[x] PASS**, T-3 **[x] PASS**, T-4 **[x] PASS**. T-5 pending. Next eligible: **T-5** (accessibility + responsive + static-export verification pass; deps: T-4 ✓).
- **Open follow-ups (resolve in T-5):** T-2 a11y WARN — error state in `ActorMap.tsx` uses `role="alert"` + redundant `aria-live="polite"`; **also `DiscoverRail.tsx` error state has the same `role="alert"`+`aria-live="polite"` pattern** — fix both in T-5 (drop `aria-live="polite"` so `alert`'s implicit assertive governs).
