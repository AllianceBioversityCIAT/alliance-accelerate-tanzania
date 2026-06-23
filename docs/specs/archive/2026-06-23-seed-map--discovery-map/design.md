# Design — Discovery Map (public Leaflet actor map)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `seed-map/discovery-map` |
| Branch | `feature/seed-map-discovery-map` (off `feature/seed-map-actor-data-model`) |
| Depth | Standard |
| Traces | requirements.md (FR-1..FR-7, NFR-1..NFR-5) |
| Consumes | archived `seed-map/actor-data-model`: `PublicActor`, `GET /api/v1/actors`, `GET /api/v1/metrics` |
| Constitutional refs | system-design §4,§5,§7,§9,§10; detailed-design §4,§6; CLAUDE.md (Leaflet, static export, PII, tokens) |

## 2. Executive Summary

Add a `/map` route to the existing `(public)` shell that renders a **client-only Leaflet** map of Tanzania (OpenStreetMap tiles) plus a synced, filterable "Discover actors" rail. Both consume one `useActors(filters)` hook over the foundation's `GET /api/v1/actors`. Leaflet is loaded via dynamic import (`ssr: false` semantics) so the page still **static-exports** (NFR-1). The backend already strips PII and excludes non-consented actors, so the client never does location/PII gating — it just renders what the contract returns, plus a static privacy-zone legend (DD-3 from the foundation).

## 3. Architecture Overview

```
app/(public)/map/page.tsx  ('use client')
   │  useActors(filters) ──▶ lib/api/actors.ts getActors(query) ──▶ GET /api/v1/actors (foundation)
   │                                   (returns PublicActor[] — already PII-safe, GRANTED-only)
   ├─ <DiscoverRail>  filters (crop/role/region) + actor list + count   (FR-4, FR-5)
   └─ <ActorMap>      dynamic(() => import('./LeafletMap'), { ssr:false })   (NFR-1)
         └─ Leaflet: OSM TileLayer + role-colored markers + popups + legend (FR-2,3,6)
   shared state: filters + selectedActorId lifted to page (rail ↔ map sync)
```
- One source of truth: `getActors` is the typed client (mirrors `getMetrics` from home-page; built on the foundation's `PublicActor`).
- No SSR, no route handler — Leaflet only mounts in the browser.

## 4. Extended Directory Structure

```
frontend/
├── app/(public)/map/
│   └── page.tsx                       # 'use client' — composes DiscoverRail + ActorMap; owns filters + selection (FR-1)
├── components/map/
│   ├── ActorMap.tsx                   # dynamic import wrapper (ssr:false) + loading/error/empty states (NFR-1, FR-7)
│   ├── LeafletMap.tsx                  # the actual Leaflet map (TileLayer OSM, markers, popups, fly-to) — client-only
│   ├── MapLegend.tsx                   # role color legend + "privacy zone — no consent" item (FR-2, FR-6)
│   ├── DiscoverRail.tsx               # filters + count + ActorList; collapses to bottom sheet < md (FR-4, NFR-2)
│   ├── FilterControls.tsx            # crop / role / region selects (labeled, token-driven) (FR-4, NFR-3)
│   ├── ActorList.tsx + ActorListItem.tsx  # the accessible non-map list; selection syncs to map (FR-5, NFR-3)
│   └── ActorPopup.tsx                # popup content: name, RoleBadge, region/district, crop chips, capacity, View Profile (FR-3)
├── lib/api/
│   ├── actors.ts                      # PublicActor type + ActorsQuery + getActors(): Promise<PublicActorList|null>  (NFR-5)
│   └── useActors.ts                   # 'use client' hook { data, loading, error } over getActors (FR-7)
├── lib/content/roles.ts              # traderType → { label, colorToken } legend map (NFR-4)
└── (reuses) components/ui/*, lib/api/client.ts, shell, tokens
```

## 5. Data Model

No persistence. Frontend contract (mirrors the foundation's `PublicActor`):

```ts
// lib/api/actors.ts
export interface PublicActor {
  id: string;
  traderName: string;
  region: string;
  district?: string | null;
  traderType: 'seed_company'|'cooperative'|'ngo'|'offtaker'|'research_institute'|'informal_trader';
  capacityTons?: number | null;
  crops: ('sorghum'|'common_bean'|'groundnut')[];
  gps?: { lat: number; long: number } | null;   // present only for plottable consented actors
}
export interface ActorsQuery { crop?: string; role?: string; region?: string; page?: number; pageSize?: number; }
export interface PublicActorList { data: PublicActor[]; page: number; pageSize: number; total: number; }
// getActors(q): Promise<PublicActorList | null>   // null on any failure → FR-7 fallback
```

Role legend (`lib/content/roles.ts`): each `traderType` → `{ label, colorToken }`. Reuses existing crop tokens; role colors mapped to System Design §7 tokens (e.g. `seed_company`→primary, `cooperative`→a green token, `ngo`→accent/blue, `offtaker`→`crop-sorghum`/earth, `research_institute`→`fg`/neutral). Exact mapping chosen in T-3 from §7 tokens — **no hardcoded hex**.

## 6. API Design

No new endpoints. Consumes `GET /api/v1/actors?crop=&role=&region=&page=&pageSize=` (foundation) → `PublicActorList`. Optionally `GET /api/v1/metrics` for the rail count header (or use `total`). Client sends no auth header (public). CORS restricted to the CloudFront origin in prod.

## 7. Backend Module Design

None. Frontend-only; the backend is the archived `seed-map/actor-data-model`.

## 8. Frontend / UX Component Architecture

| Component | Requirement | Notes |
|---|---|---|
| `map/page.tsx` | FR-1 | `'use client'`; owns `filters` + `selectedActorId`; renders rail + map; passes data down from `useActors`. |
| `ActorMap` | NFR-1, FR-7 | `dynamic(() => import('./LeafletMap'), { ssr:false })` + loading/empty/error UI. Keeps Leaflet out of the static build. |
| `LeafletMap` | FR-2, FR-3, FR-5 | OSM `TileLayer`; one marker per actor with `gps`; role-colored divIcon (token CSS); popup via `ActorPopup`; fly-to on selection (motion-reduce guard). Tanzania initial bounds/center. |
| `MapLegend` | FR-2, FR-6 | Role color swatches + labels; static "Privacy zone — no consent" item. |
| `DiscoverRail` | FR-4, FR-5, NFR-2 | Header ("N actors shown") + `FilterControls` + `ActorList`; sticky; `< md` becomes a collapsible/bottom-sheet over the map. |
| `FilterControls` | FR-4, NFR-3 | Labeled `crop`/`role`/`region` selects; "All …" defaults; change → updates page filters → refetch. |
| `ActorList`/`Item` | FR-5, NFR-3 | The accessible non-map view; each item shows name/role/region/crops; click selects (syncs map); keyboard operable; `aria-current` on selected. |
| `ActorPopup` | FR-3 | name, `RoleBadge`, region·district, crop chips (crop tokens), capacity, "View Profile" → `/directory` (OQ-1). No PII. |

**State boundaries:** `useActors(filters)` owns server state (refetch on filter change; `null`→error state). `filters` + `selectedActorId` are page-local `useState`. No global store. Loading/empty/error handled in `ActorMap`/`DiscoverRail` so the shell never blocks (NFR-5/FR-7).

**Accessibility (NFR-3):** the `ActorList` is the documented non-map equivalent of the map; map container has an `aria-label`; markers have accessible names (actor name); filters are `<label>`-associated; focus-visible rings (tokens); fly-to/transitions guarded by `motion-reduce`. Leaflet's own keyboard pan + our list selection give keyboard access.

## 9. Shared Contracts or Package Extensions

Adds `lib/api/actors.ts` (`PublicActor`/`getActors`) as the third frontend shared contract (after `Metrics` and the shell). Mirrors the backend `PublicActor` exactly (NFR-6 from the foundation). Adds `leaflet` + `@types/leaflet` deps (and React-Leaflet OR a thin direct-Leaflet wrapper — chosen in T-1; direct Leaflet keeps the static-export/dynamic-import story simplest).

## 10. Design Decisions

- **DD-1 (Client-only Leaflet via dynamic import — NFR-1):** `ActorMap` does `dynamic(import('./LeafletMap'), { ssr:false })` so Leaflet (window-dependent) never runs at build/SSR; `/map` still static-exports. Rejected: any SSR/route-handler map (violates NFR-1).
- **DD-2 (Backend is the PII/consent authority — NFR-5):** the client renders exactly what `/api/v1/actors` returns (GRANTED-only, PII-stripped, gps gated). No client-side consent/PII/location logic. The privacy zone is a static legend, not computed. Rejected: client-side fuzzing (would require raw locations the client must never receive).
- **DD-3 (Filters server-side):** crop/role/region filters are passed to `/api/v1/actors` (the backend already supports them) rather than filtering a full client cache — keeps the contract authoritative and ready for the 1,000+ dataset. Small client-side refinement (text search) MAY be added later.
- **DD-4 (Tokens for role colors — NFR-4):** role legend colors come from System Design §7 tokens via `lib/content/roles.ts`; Leaflet markers styled with token-driven CSS (divIcon className), no hardcoded hex. Reinforces the project's `currentColor`/token discipline.
- **DD-5 (View Profile → /directory placeholder — OQ-1):** no profile page exists yet; link to `/directory` until that spec lands, to avoid a dead route.
- **DD-6 (Graceful fallback — FR-7/NFR-5):** `getActors` returns `null` on any failure; `ActorMap`/rail render an empty map + "couldn't load actors" message; page never throws (same pattern as home-page metrics).

## 11. Risks & Mitigations

- **Static-export + Leaflet (window) pitfalls:** mitigated by DD-1 dynamic import `ssr:false`; import Leaflet CSS in the client component only.
- **Token/styling of Leaflet internals:** override marker/popup via token-driven classes; mitigate default-icon path issues (Leaflet marker asset URLs) with a divIcon or explicit icon config.
- **Backend not deployed:** DD-6 graceful fallback; v1 against seeded data.
- **PII:** structurally impossible client-side (DD-2) — the API never sends PII; reviewer gate confirms no PII fields referenced.
- **Responsiveness of rail+map:** DD rail→bottom-sheet < md; map fills container with a min-height.

## 12. Test Plan Outline

- **Build/export (NFR-1):** `next build` static-exports `/map`; grep confirms no SSR/route handler; Leaflet only in the dynamically-imported client module.
- **Component tests (RTL, mocked `useActors`):** rail renders the list + count; selecting a filter calls `getActors` with the right query (FR-4); empty/error/loading states (FR-7); list item selection sets selection (FR-5); `ActorPopup` shows fields + no PII (FR-3); legend includes the privacy-zone item (FR-6). (Leaflet map itself mocked/at the boundary — assert `ActorMap` passes the right props.)
- **No-PII assertion:** tests assert rendered actor content contains none of `phone`/`email` (the contract has no such fields — guard anyway).
- **a11y:** jest-axe on the page composition (rail + map placeholder); keyboard list traversal; map `aria-label`.
- **Manual/responsive:** 360/768/1280 — rail bottom-sheet on mobile, pins/legend visible; tiles load (OSM).
