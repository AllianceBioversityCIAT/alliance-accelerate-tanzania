# Archive Summary — Discovery Map (public Leaflet actor map)

## 1. Document Control

| Field | Value |
|---|---|
| Spec name | Discovery Map (public Leaflet actor map) |
| Spec path (original) | `docs/specs/seed-map/discovery-map/` |
| Archive path | `docs/specs/archive/2026-06-23-seed-map--discovery-map/` |
| Branch | `feature/seed-map-discovery-map` (off `feature/seed-map-actor-data-model`) |
| Depth | Standard |
| Archived by | Claude (Leader / JCSPECS SDD) |

## 2. Original Spec Path

`docs/specs/seed-map/discovery-map/`

## 3. Archive Date

2026-06-23

## 4. Final Status

**COMPLETE — Validated PASS, archive-ready.** All 5 tasks Reviewer-PASS and committed; validation report recommends archive with no open FAIL/WARN.

## 5. Requirements Delivered

| Req | Title | Result |
|---|---|---|
| FR-1 | Discovery Map page (`/map`, rail + Tanzania map) | ✅ |
| FR-2 | Role-colored pins + legend (gps-null → list-only) | ✅ |
| FR-3 | Actor popup (name/role/region·district/crops/capacity/View Profile, no PII) | ✅ |
| FR-4 | Filterable synced rail (crop/role/region, server-side, count) | ✅ |
| FR-5 | List ↔ map interaction (select → fly-to, `aria-current`) | ✅ |
| FR-6 | Privacy-zone legend item (no client-side non-consent computation) | ✅ |
| FR-7 | Graceful loading/empty/error states (page never throws) | ✅ |
| NFR-1 | Static export — client-only Leaflet via `dynamic(ssr:false)` | ✅ |
| NFR-2 | Responsive (persistent rail ≥md, disclosure toggle <md) | ✅ |
| NFR-3 | Accessibility (list = non-map fallback; jest-axe clean) | ✅ |
| NFR-4 | Design tokens (no hardcoded colors) | ✅ |
| NFR-5 | No PII / resilience (null-on-failure) | ✅ |

## 6. Files Changed Summary

New frontend source (per `execution.md`):
- `app/(public)/map/page.tsx` — `'use client'` page; owns `filters`+`selectedActorId`; composes `DiscoverRail` + `ActorMap`.
- `components/map/ActorMap.tsx` — `dynamic(ssr:false)` wrapper + FR-7 states.
- `components/map/LeafletMap.tsx` — the only Leaflet importer; OSM tiles, role-colored divIcon markers, popup (`renderToString(<ActorPopup>)`), legend Control, fly-to (motion-reduce guarded).
- `components/map/ActorPopup.tsx`, `RoleBadge.tsx`, `MapLegend.tsx` — popup card, role badge (+`ROLE_BG_CLASS`/`ROLE_CSS_VAR` token maps), legend + privacy-zone item.
- `components/map/DiscoverRail.tsx`, `FilterControls.tsx`, `ActorList.tsx`, `ActorListItem.tsx` — rail with count, server-side filters, accessible synced list.
- `lib/api/actors.ts` (`getActors` null-on-failure + `PublicActor`/`ActorsQuery`/`PublicActorList`), `lib/api/useActors.ts` (unmount-guarded hook).
- `lib/content/roles.ts` (traderType→{label,colorToken}), `lib/content/regions.ts` (provisional 10-region list).
- Deps: `leaflet@^1.9.4`, `@types/leaflet@^1.9.21`.

Tests (8 files): `actors.test.ts`, `ActorMap/ActorPopup/MapLegend/FilterControls/ActorList/DiscoverRail.test.tsx`, `map-a11y.test.tsx`.

Commits: `ee08c3e` (spec) → `e47cf51` (T-1) → `c89d865` (T-2) → `89d6325` (T-3) → `ece60ed` (T-4) → `cc4d0d7` (T-5) → `263c714` (validation report).

## 7. Test Evidence Summary

**84 tests / 13 suites pass.** `next build` static-exports `/map` (`○ Static`, 4.81 kB). `npm run lint` clean; `tsc --noEmit` exit 0. jest-axe over the `/map` composition (data-present + error/fallback) → no violations. PII negative assertions across 4 suites. DD-3 filter-value contract (crop=slug, role=traderType, region=exact string) verified against the backend.

## 8. Validation Summary

`validation-report.md`: **PASS — archive-ready.** Every FR/NFR PASS, DD-1..DD-6 conformant, constitutional baseline (static export, PII boundary, §7 tokens, Leaflet) upheld. No remediation required.

## 9. Accepted Warnings Or Follow-Ups

- **No open WARN/FAIL.** Two interim a11y WARNs (`role="alert"` + redundant `aria-live="polite"` in `ActorMap` & `DiscoverRail`) were resolved in T-5.
- **Documented out-of-scope deferrals** (per `requirements.md §9` / `proposal.md §6`, not blockers): real-data import (seeded data only); actor profile page (`View Profile` → `/directory?actor=:id` placeholder, DD-5/OQ-1); marker clustering (OQ-2); region canonicalization (OQ-6 — `lib/content/regions.ts` is provisional); live backend deployment (graceful API-down fallback in place, DD-6); fuzzed/coarsened non-consented locations (backend would need to expose them first).

## 10. Historical Notes

- Phase 2 of the two-spec split (Option A): built on the archived `seed-map/actor-data-model` foundation contract (`PublicActor`, `GET /api/v1/actors`). The backend remains the sole PII/consent authority (DD-2) — the client never performs PII/location gating.
- Key engineering decision: **direct Leaflet** (not react-leaflet), client-only via `dynamic(ssr:false)`, keeping `/map` static-exportable (NFR-1). Leaflet + `renderToString` are confined to `LeafletMap.tsx` so they never enter the static bundle.
- Two Leader-gate catches prevented Reviewer cycles: T-3 first pass omitted required tests + used `text-white`/raw `rgba()` (fixed to `text-primary-fg` + `var(--color-surface)`/`var(--shadow-sm)`); T-4 had a Tailwind purge bug (`w-${w}` skeleton widths → static literals). Both fixed within attempt 1.
- Reviewers occasionally went idle without emitting a verdict (T-4, T-5) and were re-prompted for the explicit `STATUS:` line before finalizing.
