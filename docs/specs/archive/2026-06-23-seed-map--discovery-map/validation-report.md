# Validation Report — Discovery Map (public Leaflet actor map)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `seed-map/discovery-map` |
| Branch | `feature/seed-map-discovery-map` |
| Validated | 2026-06-23 |
| Validator | Claude (Leader / JCSPECS SDD) |
| Depth | Standard |
| Consumes | archived `seed-map/actor-data-model` (`PublicActor`, `GET /api/v1/actors`, `/api/v1/metrics`) |
| Overall result | **PASS — archive-ready** |

## 2. Summary

The Discovery Map (`/map`) is fully implemented across T-1..T-5, all five tasks Reviewer-PASS and committed (`e47cf51`→`cc4d0d7`). The feature delivers a statically-exported, client-only Leaflet map of Tanzania plotting consented actors as role-colored pins, a filterable synced "Discover actors" rail (crop/role/region), an actor popup, a legend with a privacy-zone note, and graceful loading/empty/error states. **84 tests / 13 suites pass; `next build` static-exports `/map`; lint clean; tsc clean; Leaflet confined to the dynamically-imported chunk; no PII in any render path; zero hardcoded colors.** No FAIL or WARN findings remain open (both interim a11y WARNs were resolved in T-5).

| Dimension | Result |
|---|---|
| Task completion | PASS (5/5 `[x]`) |
| File existence | PASS (14/14) |
| Build integrity (build/lint/tsc/test) | PASS |
| Requirement coverage | PASS (FR-1..FR-7, NFR-1..NFR-5) |
| Lint & code quality | PASS |
| Design conformance (DD-1..DD-6) | PASS |
| Constitutional baseline (static export, PII, tokens, Leaflet) | PASS |

## 3. Task Completion

| Task | Status | Reviewer | Evidence |
|---|---|---|---|
| T-1 Actors client + `useActors` + roles + Leaflet deps | ✅ PASS | `rev-dm-t1` | 11 tests; build; tokens verified |
| T-2 `/map` route + client-only ActorMap shell + states | ✅ PASS | `rev-dm-t2` | 5 tests; static export; Leaflet isolated |
| T-3 Role-colored pins + ActorPopup + MapLegend | ✅ PASS | `rev-dm-t3` | 19 tests; divIcon token CSS-vars; fly-to |
| T-4 DiscoverRail filters + synced list + count | ✅ PASS | `rev-dm-t4` | 50 tests; DD-3 filter contract; FR-5 sync |
| T-5 A11y + responsive + static-export pass | ✅ PASS | `rev-dm-t5` | 84 tests incl. jest-axe; WARNs resolved |

All tasks have full execution-log entries in `execution.md` with attempt history, decisions, and verification evidence. **Result: PASS.**

## 4. File Existence

All 14 files from design.md §4 exist and are committed:

- `app/(public)/map/page.tsx`
- `components/map/{ActorMap,LeafletMap,MapLegend,DiscoverRail,FilterControls,ActorList,ActorListItem,ActorPopup,RoleBadge}.tsx`
- `lib/api/{actors,useActors}.ts`
- `lib/content/{roles,regions}.ts`

Plus 8 test files: `actors.test.ts`, `ActorMap/ActorPopup/MapLegend/DiscoverRail/FilterControls/ActorList.test.tsx`, `map-a11y.test.tsx`. **Result: PASS.**

## 5. Build Integrity

| Check | Command | Result |
|---|---|---|
| Unit/component/a11y tests | `npx jest` | **84 passed / 13 suites** |
| Static export | `npm run build` | **`Exporting (2/2)`, `/map` `○ Static` 4.81 kB** |
| Lint | `npm run lint` | **✔ No ESLint warnings or errors** |
| Type-check | `npx tsc --noEmit` | **exit 0 (clean)** |

**Result: PASS.**

## 6. Requirement Coverage

| Req | Title | Task(s) | Evidence | Result |
|---|---|---|---|---|
| FR-1 | Discovery Map page | T-2/T-4 | `/map` renders rail + Tanzania map; `map-a11y` + ActorMap tests | PASS |
| FR-2 | Role-colored pins + legend | T-3 | `buildDivIcon` (token CSS-var per role), gps-null skipped from map; `MapLegend.test` (6 roles) | PASS |
| FR-3 | Actor popup | T-3 | `ActorPopup.test` — name/role/region·district/crops/capacity/View Profile; PII-negative asserts | PASS |
| FR-4 | Filterable synced rail | T-4 | `FilterControls.test` (slug/traderType/region values, page:1, clear→undefined); count "N actors shown" | PASS |
| FR-5 | List ↔ map interaction | T-4 | `ActorList.test` select→`onSelectActor`+`aria-current`; T-3 fly-to on `selectedActorId` | PASS |
| FR-6 | Privacy-zone legend | T-3 | `MapLegend.test` "Privacy zone — no consent" item; no client-side non-consent computation (DD-2) | PASS |
| FR-7 | Graceful data states | T-2/T-4 | `ActorMap.test` + `DiscoverRail.test` loading/error/empty; page never throws | PASS |
| NFR-1 | Static export (client-only Leaflet) | T-1/T-2/T-5 | `dynamic(ssr:false)`; `from 'leaflet'` only in `LeafletMap.tsx`; build static; no SSR/route handlers | PASS |
| NFR-2 | Responsive | T-4/T-5 | rail `md:w-72` persistent ≥md; disclosure toggle <md (`aria-expanded`/`aria-controls`) | PASS |
| NFR-3 | Accessibility (list fallback) | T-4/T-5 | jest-axe (2 scenarios) no violations; labeled selects; map `aria-label`; marker names; focus-visible; motion-reduce | PASS |
| NFR-4 | Design tokens | T-1/T-2/T-3 | color grep CLEAN; role/crop tokens via CSS-vars + Tailwind keys; purge-safe class maps | PASS |
| NFR-5 | No PII / resilience | T-1/T-2 | no `phone`/`email` in render code (negative asserts across 4 suites); `getActors` null-on-failure | PASS |

**Result: PASS.** Every requirement maps to a completed task with automated test evidence.

## 7. Linting & Code Quality

- ESLint: clean. TypeScript strict: clean.
- Token discipline (NFR-4): no raw hex/`rgba()`/`text-white`. divIcon and crop chips use purge-safe approaches (CSS-var inline styles + static full-string class maps) — the one genuine purge bug found in T-4 (`w-${w}` skeleton widths) was caught at the Leader gate and fixed before review.
- Resilience: `getActors` swallows all failures → `null`; `useActors` unmount-guarded; `LeafletMap` cleans up (`map.remove()`, layer-group rebuild) — no leaks.
- **Result: PASS.**

## 8. Design Conformance

| Decision | Conformance |
|---|---|
| DD-1 Client-only Leaflet via `dynamic(ssr:false)` | ✅ `ActorMap` wraps `LeafletMap`; Leaflet never in static bundle |
| DD-2 Backend is PII/consent authority | ✅ client renders only what API returns; privacy zone is static legend, not computed |
| DD-3 Filters server-side | ✅ crop/role/region passed to `getActors` query; values match backend contract (crop=slug, role=traderType, region=exact string) |
| DD-4 Tokens for role colors | ✅ `ROLE_CSS_VAR`/`ROLE_BG_CLASS` resolve to §7 tokens; no hex |
| DD-5 View Profile → `/directory` placeholder | ✅ `/directory?actor=${id}` (OQ-1, no profile route yet) |
| DD-6 Graceful fallback | ✅ null-on-failure → empty map + message; never throws |

Constitutional baseline: static export (no SSR/ISR/route handlers), PII boundary (client carries no PII fields — backend-enforced from the archived foundation), §7 design tokens, Leaflet, all upheld. Behavior remains aligned with `proposal.md` intent, scope, and success criteria (Option A phased split — map UI on the agreed contract). **Result: PASS.**

## 9. Test Evidence Summary

- **84 tests / 13 suites**, all green. Map-specific: `actors` (11), `ActorMap` (5), `ActorPopup` (9), `MapLegend` (2), `FilterControls` (8), `ActorList` (9), `DiscoverRail` (13), `map-a11y` (2 jest-axe scenarios).
- Coverage spans every FR/NFR (see §6). PII guarded by negative assertions in 4 suites. a11y guarded by jest-axe over data-present + error states.
- **Not automated (documented, environment-bound):** live OSM tile rendering, real-browser responsive breakpoints (360/768/1280), and end-to-end against a deployed `/api/v1/actors` — all deferred per requirements §9 (v1 runs on seeded data with graceful API-down fallback). These are acceptable gaps for a static-export UI spec, not FAILs.

## 10. Remediation

**None required.** No FAIL or WARN findings remain open. The two interim a11y WARNs (`role="alert"` + redundant `aria-live="polite"` in `ActorMap` and `DiscoverRail`) were resolved in T-5 and re-verified.

## 11. Archive Readiness Recommendation

**READY TO ARCHIVE.** All required tasks `[x]`; no unresolved FAIL; no open WARN; tests cover all requirements and key scenarios; design drift is nil (decisions recorded in `execution.md`); constitutional baseline upheld. Documented out-of-scope deferrals (real import, profile page, clustering, region canonicalization, live deploy) are per `requirements.md §9` / `proposal.md §6` and do not block archive.

```text
/sdd-archive seed-map/discovery-map
```
