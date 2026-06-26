# Requirements — Discovery Map: load all matching actors

- Spec path: docs/specs/bugfix/map-loads-all-actors/
- Status: Draft
- Author / Date: Claude with JuanCode — 2026-06-26
- Depth: Lite
- Related: docs/prd.md US-2/AC-3; docs/detailed-design/detailed-design.md §4 (`/actors`, `/actors/geo`); the discovery-map feature.

## 1. Summary

The `/map` page fetches actors with `useActors(filters)` and **no `pageSize`**, so the API returns its default of **20** records. The map therefore plots ~20 markers and the rail lists ~20 actors, while the count header reads **"436 actors shown"** (it shows the `total` from the pagination envelope, not what was loaded). Result: the map looks nearly empty even though 436 consented actors exist. This fixes the map to load **all** matching actors.

(Backed-design alternative `GET /api/v1/actors/geo` is specced in detailed-design §4 but returns 404 — not implemented. This bugfix is **frontend-only**; the geo endpoint is a deferred optimization.)

## 2. Functional Requirements

### FR-1: Map plots and lists all matching actors

- **Description:** The `/map` page SHALL load **all** consented actors matching the active filters (bounded to a safe cap), not just the first API page, and plot every one with valid GPS while listing all in the rail.
- **Acceptance:**
  - GIVEN no filters WHEN the map loads THEN every consented actor with valid GPS is plotted (the live dataset is 436) and the rail reflects them.
  - GIVEN a crop/region/type filter WHEN applied THEN the plotted/listed set is the full matching set, not a 20-row page.
- **PII/RBAC:** unchanged — consumes the public `/actors` endpoint; no PII.

### FR-2: Honest count header

- **Description:** The rail's "N actors shown" header SHALL reflect the number of actors actually loaded/plotted. When the loaded set is capped below the server total, it SHALL disclose that (e.g. "N of M").
- **Acceptance:**
  - GIVEN all matching actors load WHEN the header renders THEN N equals the loaded/plotted count (which equals the total when not capped).
  - GIVEN the matching total exceeds the fetch cap WHEN the header renders THEN it shows the loaded count and the total honestly.

## 3. Non-Functional Requirements

- **NFR-1 (API contract):** Per-call `pageSize` MUST NOT exceed the backend cap of **100** (`@Max(100)` → 400 above). Use page accumulation. (See memory `api-pagesize-cap-and-live-verify`.)
- **NFR-2 (resilience):** Null-on-failure preserved — fetch failure shows the existing error state, never crashes.
- **NFR-3 (static export):** No SSR/route handlers; client-fetch only.
- **NFR-4 (no regression):** Filtering, selection/fly-to, popups, mobile rail behavior unchanged.

## 4. Out of Scope

- Implementing the backend `GET /api/v1/actors/geo` endpoint (deferred optimization).
- Marker clustering / performance tuning beyond loading all ~436 points.
- Any change to the dashboard.

## 5. Open Questions

- None blocking. If the dataset ever grows past the fetch cap (1,000), the `/actors/geo` endpoint becomes the right long-term fix.
