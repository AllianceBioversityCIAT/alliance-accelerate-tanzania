# Tasks — Discovery Map (public Leaflet actor map)

- Spec path: docs/specs/seed-map/discovery-map/
- Status: Draft
- Depth: Standard
- Traces: requirements.md (FR-1..FR-7, NFR-1..NFR-5), design.md (§4–§12)
- Commit standard: `[SPEC:seed-map/discovery-map] <message>`
- Branch: `feature/seed-map-discovery-map`

## Dependency Graph

```
T-1 ──▶ T-2 ──▶ T-3 ──▶ T-4 ──▶ T-5
              (map)   (pins/popup/legend)(rail/filters/list)(a11y/responsive/export)
```
A task is eligible when status is `[ ]`/`[~]` and all deps are `[x]`. Ties broken by document order.

---

- [x] T-1 Actors API client + `useActors` hook + Leaflet deps  (deps: none)
      Size: S
      Requirements: NFR-1, NFR-5
      Design: design.md §5, §6, §9, §10 (DD-2/DD-6)
      Scope: Add `frontend/lib/api/actors.ts` (`PublicActor`/`ActorsQuery`/`PublicActorList` types mirroring the foundation contract; `getActors(query): Promise<PublicActorList | null>` built on the existing `lib/api/client.ts`, returns `null` on any failure). Add `frontend/lib/api/useActors.ts` (`'use client'` hook `{ data, loading, error }`, unmount-guarded). Add `frontend/lib/content/roles.ts` (traderType → `{label, colorToken}` using System Design §7 tokens). Install `leaflet` + `@types/leaflet` (and decide direct-Leaflet vs react-leaflet — prefer direct for the static-export/dynamic-import story).
      Tests / Verify: `cd frontend && npm run test -- actors` (getActors null-on-failure + parse); `npm run build` still static-exports.
      Done when: typed client returns data/`null` without throwing; hook exposes states; roles map is token-driven; build passes.
      Skills: error-handling-patterns, api-design-principles

- [x] T-2 `/map` route + client-only ActorMap shell + data states  (deps: T-1)
      Size: M
      Requirements: FR-1, FR-7, NFR-1, NFR-4, NFR-5
      Design: design.md §3, §4, §8 (page/ActorMap), §10 (DD-1/DD-6)
      Scope: `app/(public)/map/page.tsx` (`'use client'`; owns `filters`+`selectedActorId`; consumes `useActors`; renders rail placeholder + `<ActorMap>`). `components/map/ActorMap.tsx` = `dynamic(() => import('./LeafletMap'), { ssr:false })` with loading/empty/error UI (FR-7). `components/map/LeafletMap.tsx` minimal: OSM `TileLayer` + Tanzania center/bounds, container `aria-label`, Leaflet CSS imported client-side. No pins yet (T-3). Confirm static export still works (Leaflet not in the static bundle).
      Tests / Verify: `cd frontend && npm run build` (static `out/`, `/map` present; grep: no SSR/route handler; Leaflet only in dynamically-imported module); component test: ActorMap shows loading→empty/error from a mocked `useActors`.
      Done when: `/map` renders a Tanzania OSM map client-side, static export passes, data states handled.
      Skills: ui-ux-pro-max, vercel-react-best-practices

- [x] T-3 Role-colored pins + ActorPopup + MapLegend  (deps: T-2)
      Size: M
      Requirements: FR-2, FR-3, FR-6, NFR-4
      Design: design.md §5 (roles), §8, §10 (DD-4/DD-5)
      Scope: In `LeafletMap`, render one token-colored marker per actor with `gps` (divIcon styled by the `roles.ts` colorToken — no hardcoded hex). `components/map/ActorPopup.tsx` (name, `RoleBadge`, region·district, crop chips via crop tokens, capacity, "View Profile" → `/directory` per OQ-1; NO PII). `components/map/MapLegend.tsx` (role swatches + labels + static "Privacy zone — no consent" item, FR-6). Wire popups to markers; fly-to on selection with `motion-reduce` guard.
      Tests / Verify: `cd frontend && npm run test -- popup legend`; tests: popup shows name/role/crops/capacity + View Profile→`/directory`, no phone/email; legend includes the privacy-zone item; build passes.
      Done when: pins are role-colored (tokens), popups show PII-free actor detail, legend + privacy note present.
      Skills: ui-ux-pro-max, tailwind-design-system

- [x] T-4 DiscoverRail: filters + synced list + count  (deps: T-3)
      Size: M
      Requirements: FR-4, FR-5, FR-1, FR-7, NFR-2, NFR-3
      Design: design.md §8 (rail/filters/list), §10 (DD-3)
      Scope: `components/map/DiscoverRail.tsx` (header "N actors shown" + `FilterControls` + `ActorList`). `FilterControls.tsx` (labeled crop/role/region selects; change → update page `filters` → `useActors` refetches via `getActors` query — DD-3 server-side). `ActorList.tsx`+`ActorListItem.tsx` (accessible list; click selects → `selectedActorId` → map fly-to/open popup; `aria-current` on selected). Empty state when a filter yields none (FR-7). Rail collapses to a bottom-sheet/toggle `< md` (NFR-2).
      Tests / Verify: `cd frontend && npm run test -- rail filters`; tests: changing region calls `getActors` with `{region}` and list+count update (FR-4); list item select sets selection (FR-5); empty filter → empty state; build passes.
      Done when: filters drive list+map+count; list↔map selection syncs; responsive rail; graceful empty.
      Skills: ui-ux-pro-max, frontend-design

- [x] T-5 Accessibility, responsive, and static-export verification pass  (deps: T-4)
      Size: S
      Requirements: NFR-1, NFR-2, NFR-3
      Design: design.md §8 (a11y), §12
      Scope: Verify/fill a11y: list is the labeled non-map fallback; map `aria-label`; markers accessible names; filter labels; focus-visible; `motion-reduce` on fly-to. Add jest-axe over the page composition (rail + map placeholder, mocked `useActors`). Confirm responsive at 360/768/1280 (rail bottom-sheet on mobile). Confirm static export emits `/map` with no SSR/route handlers and Leaflet only in the dynamic chunk.
      Tests / Verify: `cd frontend && npm run test` (incl. jest-axe) green; `npm run build` static export OK; grep no SSR; manual keyboard traverse of filters + list.
      Done when: axe no critical violations, keyboard nav works, responsive holds, static export passes.
      Skills: ui-ux-pro-max, react-doctor

## Testing & Verification Expectations
- Each task runs `npm run build` (or targeted tests) before completion.
- No task introduces SSR/Next route handlers (NFR-1) — Leaflet is client-only via dynamic import.
- No hardcoded colors/geometry (NFR-4); no PII referenced anywhere (NFR-5) — the contract has none, guard in tests.

## Coverage Check
FR-1→T-2/T-4 · FR-2→T-3 · FR-3→T-3 · FR-4→T-4 · FR-5→T-4 · FR-6→T-3 · FR-7→T-2/T-4 · NFR-1→T-1/T-2/T-5 · NFR-2→T-4/T-5 · NFR-3→T-4/T-5 · NFR-4→T-1/T-2/T-3 · NFR-5→T-1/T-2.

Recommended first task: **T-1**.
