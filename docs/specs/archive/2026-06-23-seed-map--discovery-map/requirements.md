# Requirements — Discovery Map (public Leaflet actor map)

- Spec path: docs/specs/seed-map/discovery-map/
- Status: Draft
- Author / Date: JuanCode / 2026-06-23
- Depth: Standard
- Related: proposal.md (epic umbrella); **depends on** archived `seed-map/actor-data-model` (PublicActor + `/api/v1/actors` + `/api/v1/metrics`); system-design §4,§5,§7,§9,§10; detailed-design §4,§6; prd.md (US-2, map)
- Branch: `feature/seed-map-discovery-map` (off `feature/seed-map-actor-data-model`)

## Document Control

| Field | Value |
|---|---|
| Approved intent | proposal.md (Option A — Phase 2: map UI on the agreed contract) |
| Depends on | `seed-map/actor-data-model` (archived) — consumes its public Actors + Metrics API |
| Locked decisions | tiles = **OpenStreetMap** raster · privacy zones = **consented pins + static aggregate** (backend excludes non-consented) · v1 runs on **seeded consented data** |

## 1. Summary

Deliver the **Discovery Map** at `/map`: a statically-exported, client-rendered Leaflet map of Tanzania plotting **consented** seed-system actors as role-colored pins, with a left-rail filterable directory (crop / actor role / region) that drives both the list and the map, an actor popup, a legend (incl. a static "privacy zone — no consent" note), and graceful loading/empty/error states. It consumes the public `GET /api/v1/actors` contract; it exposes **no PII** (the backend already strips it and excludes non-consented actors). The list is the accessible non-map equivalent.

## 2. Glossary

- **Pin:** a map marker for one consented actor, colored by `traderType`.
- **Discover-actors rail:** the left panel — filters + scrollable actor list, synced with the map.
- **Privacy zone:** a static legend item + aggregate note conveying that non-consented actors exist but are not plotted (they are excluded server-side; no client location math).
- **PublicActor:** the PII-safe actor shape from the foundation API (`{id, traderName, region, district, traderType, capacityTons, crops[], gps?}`).

## 3. System Context & Scope

A new `/map` route inside the existing `(public)` shell. Leaflet runs **client-only** (dynamic import, no SSR) to preserve static export (NFR-1). Data comes from `GET /api/v1/actors` (filterable) via a typed client built on the foundation's `PublicActor` contract. No new backend. v1 is driven by the seeded consented dataset.

**In scope:** `/map` route; Leaflet map (OSM tiles) + role-colored pins + popup; filterable synced left rail (crop/role/region); legend + privacy-zone note; map↔list interaction; loading/empty/error + graceful API-down fallback; responsive (rail → bottom sheet/collapsible on mobile); a11y (list = non-map fallback, keyboard, labels).
**Out of scope:** see §9.

## 4. Requirement Numbering & Writing Standards

`FR-<n>` / `NFR-<n>`, atomic + testable, MUST/SHOULD/MAY, GIVEN/WHEN/THEN scenarios.

## 5. Stakeholders / Personas

| Persona | Role | Interest |
|---|---|---|
| Public visitor (donor, researcher, partner) | `Public` | Explore the actor ecosystem geographically; filter; never see PII or non-consented locations. |
| Staff / Admin | `Staff`/`Admin` | Same map; authenticated variants later. |

## 6. Functional Requirements

### FR-1: Render the Discovery Map page
At `/map` the system MUST render, inside the public shell: a left "Discover actors" rail (count + filters + actor list) and a Leaflet map of Tanzania with consented-actor pins. No `phone`/`email` or other PII appears anywhere.
- Source: PRD map story; System Design §4,§5.

#### Scenario: Visitor opens the map
- GIVEN an unauthenticated visitor
- WHEN they navigate to `/map`
- THEN the rail and the Tanzania map render with pins for consented actors
- AND no PII is present in the DOM or network responses consumed.

### FR-2: Role-colored pins + legend
Each consented actor with GPS MUST render as a map pin colored by `traderType`, with a legend mapping color→role. Actors without GPS MUST still appear in the list (not the map).
- Source: System Design §7 (legend), mockup.

#### Scenario: Pins reflect roles
- GIVEN consented actors of different `traderType`s
- WHEN the map renders
- THEN each plotted actor's pin uses its role color and the legend explains the mapping.

### FR-3: Actor popup
Activating a pin (or a list item) MUST open a popup showing the actor's name, a role badge, region/district, crop chips, capacity, and a "View Profile" affordance. The popup MUST contain no PII.
- Source: mockup; detailed-design §4.

#### Scenario: Inspect an actor
- GIVEN the map is rendered
- WHEN the visitor clicks a pin
- THEN a popup shows name/role/location/crops/capacity and a View Profile link
- AND shows no phone/email.

### FR-4: Filterable, synced rail (crop / role / region)
The rail MUST provide filters for crop, actor role (`traderType`), and region; applying a filter MUST update BOTH the visible list and the map pins (via the `/api/v1/actors` query). The rail MUST show the count of actors shown.
- Source: mockup ("12 actors shown"); detailed-design §4.

#### Scenario: Filter by region
- GIVEN the map shows all consented actors
- WHEN the visitor selects Region = Mbeya
- THEN the list and the map both show only Mbeya consented actors, and the count updates.

### FR-5: List ↔ map interaction
Selecting an actor in the list MUST focus/open its pin on the map (and vice versa where feasible). The list is the accessible equivalent of the map.
- Source: System Design §10 (map has a non-map fallback).

### FR-6: Privacy-zone legend (no PII / no non-consented plotting)
The map MUST include a legend item conveying "Privacy zone — no consent" indicating that non-consented actors are not plotted. The system MUST NOT plot or expose any non-consented actor or exact location (the API already excludes them).
- Source: proposal OQ-3/OQ-5; CLAUDE.md PII.

#### Scenario: Non-consented actors are absent
- GIVEN the dataset includes non-consented actors
- WHEN the map and list render
- THEN no non-consented actor appears, and the legend communicates the privacy zone.

### FR-7: Graceful data states
The map MUST handle loading (skeleton/spinner), empty (no results for a filter), and error / API-unavailable (non-broken fallback message) without crashing the page.
- Source: NFR-5 pattern from home-page; detailed-design §9.

#### Scenario: API unavailable
- GIVEN `/api/v1/actors` errors or is undeployed
- WHEN the map loads
- THEN the page still renders with an empty map + a clear "couldn't load actors" state, no thrown error.

## 7. Non-Functional Requirements

- **NFR-1 (Static export):** `/map` MUST build under Next.js static export — Leaflet loaded client-only (dynamic import, no SSR/route handlers). `next build` emits static `out/`.
- **NFR-2 (Responsive):** Usable 360→1280; the filter rail collapses to a bottom sheet / toggle on mobile, map fills remaining space (System Design §9).
- **NFR-3 (Accessibility):** Map has a non-map fallback (the list); markers have accessible names; filters are labeled controls; keyboard operable; visible focus; `prefers-reduced-motion` respected on map fly-to. (System Design §10.)
- **NFR-4 (Design tokens):** All colors/spacing/radii/shadows from System Design §7 (incl. crop + the role legend colors); no hardcoded values. (Leaflet default marker styling overridden via tokens where shown.)
- **NFR-5 (No PII / resilience):** No PII in DOM or consumed responses; metrics/actors fetch non-blocking and crash-safe.

## 8. Data & Schema Impact

None. Consumes the existing `PublicActor` / `/api/v1/actors` (+ optionally `/metrics`) contract from the archived foundation. No DB or API change.

## 9. Out of Scope

Actor **profile page** (the "View Profile" target is a link to a directory/profile route owned by a later spec — v1 may point to `/directory` or a stub); the **Directory** page; admin; Cognito auth; CSV export; **real-data import** (seeded data only); fuzzed/coarsened non-consented locations (deferred — backend would need to expose them first); offline/clustering performance tuning beyond basic.

## 10. Open Questions

- OQ-1 (View Profile target): no profile page yet — v1 links "View Profile" to `/directory` (or `/directory?actor=:id`) as a placeholder until the profile spec lands. (Assume `/directory`.)
- OQ-2 (marker clustering): with ~12 seeded actors, clustering is unnecessary in v1; revisit when the real (1,000+) dataset lands.

## 11. Requirement ID Index

| ID | Title | Covered by task |
|---|---|---|
| FR-1 | Discovery Map page | T-2, T-4 |
| FR-2 | Role-colored pins + legend | T-3 |
| FR-3 | Actor popup | T-3 |
| FR-4 | Filterable synced rail | T-4 |
| FR-5 | List ↔ map interaction | T-4 |
| FR-6 | Privacy-zone legend | T-3 |
| FR-7 | Graceful data states | T-2, T-4 |
| NFR-1 | Static export (client-only Leaflet) | T-1, T-5 |
| NFR-2 | Responsive | T-4, T-5 |
| NFR-3 | Accessibility (list fallback) | T-4, T-5 |
| NFR-4 | Design tokens | T-2, T-3 |
| NFR-5 | No PII / resilience | T-1, T-2 |
