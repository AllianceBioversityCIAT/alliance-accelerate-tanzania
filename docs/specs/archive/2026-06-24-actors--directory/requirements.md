# Requirements — Actor Directory + Profile (Phase 1)

- Spec path: docs/specs/actors/directory/
- Status: Draft
- Author / Date: JuanCode / 2026-06-24
- Related: docs/prd.md (US-1, US-4; Actor Directory + Actor Profiles modules), docs/system-design/design.md §4 (IA/flows), §5 (screens), §7 (tokens), §8 (components); docs/detailed-design/detailed-design.md §3 (Actor), §4 (API envelope), §8 (RBAC/PII)
- Builds on: archived `seed-map/actor-data-model` (the deployed `GET /api/v1/actors` list + detail, role-aware serializer, consent gating); resolves `seed-map/discovery-map` DD-5/OQ-1 (the `/directory` placeholder)
- Proposal: docs/specs/actors/directory/proposal.md (Option A — phased; admin console + Cognito auth deferred to Phase 2)

## 1. Summary

Build the **public Actor Directory** (`/directory`) and **public Actor Profile** screens for Tanzania's seed-system registry. The Directory is a searchable, filterable, paginated card grid of consented actors; the Profile is a standardized per-actor page. Both consume the already-deployed, PII-safe, consent-gated `GET /api/v1/actors` (list + detail) endpoints. This advances **PRD US-1** ("browse a paginated directory… search by name/region/crop… without ever seeing phone/email") and resolves the Discovery Map's dead "View Profile" link. The authenticated PII-unlock, the Data Maintenance & Validation console, and Cognito sign-in remain **out of scope (Phase 2)**.

## 2. Requirement Numbering & Writing Standards

- Functional requirements are `FR-1…`; non-functional `NFR-1…`.
- Each is atomic, testable, unambiguous; uses MUST / SHOULD / MAY (RFC 2119).
- Each traces up to a PRD user story / the approved proposal, and down to tasks in `tasks.md`.
- RBAC roles: `Public` / `Staff` / `Admin`. PII = `phone`, `email` (+ any newly flagged). This spec adds **no PII fields** and serves only the `Public` role.

## 3. Functional Requirements

### FR-1: Public Directory list page

- **Description:** The system MUST serve a public `/directory` page that renders consented actors as a paginated, responsive card grid sourced from `GET /api/v1/actors`. Each card MUST show: actor name, role badge, region · district, crop chips, and capacity (`— ` when absent). Each card MUST link to that actor's Profile (FR-7). The page MUST show an accurate result count ("N organizations found").
- **Rationale / Source:** PRD US-1; proposal §4 Phase 1 (1).
- **Acceptance criteria:**
  - GIVEN the directory has consented actors WHEN a visitor opens `/directory` THEN a grid of actor cards renders with the count of matching actors AND default page size is 20 (PRD OQ-5).
  - GIVEN an actor has no district or no capacity WHEN its card renders THEN the missing field degrades gracefully (omitted or `—`), never showing `null`/`undefined`.
- **PII/RBAC impact:** `Public` only; no PII (cards use the PII-safe `PublicActor` shape — detailed-design §8).

### FR-2: Directory filters (crop / role / region)

- **Description:** The Directory MUST provide crop, role, and region filter controls that narrow the list via the existing `GET /api/v1/actors` `crop` / `role` / `region` query parameters. Filters MUST combine (AND) with each other and with search (FR-3). Filter and search state MUST be reflected in the URL (shareable/back-button safe) and MUST reset pagination to page 1 on change. A "clear filters" affordance SHOULD be provided.
- **Rationale / Source:** PRD US-1 (filter by region/crop); proposal §5.
- **Acceptance criteria:**
  - GIVEN the full directory WHEN the visitor selects crop = sorghum AND region = Dodoma THEN only actors matching both render AND the count updates AND the page resets to 1 AND the URL carries `crop=sorghum&region=Dodoma`.
  - GIVEN active filters WHEN the visitor activates "clear filters" THEN all filters reset and the full first page renders.
- **PII/RBAC impact:** `Public` only; no PII.

### FR-3: Directory free-text search

- **Description:** The Directory MUST provide a free-text search input that matches actors by **name, region, or district** and narrows the list server-side via a new `search` query parameter (FR-4). Input MUST be debounced (≤ 400 ms) before issuing a request, MUST combine with active filters, and MUST reset pagination to page 1.
- **Rationale / Source:** PRD US-1 ("search by name/region/crop"); PRD AC-2 (p95 < 1s); proposal OQ-4.
- **Acceptance criteria:**
  - GIVEN the directory WHEN the visitor types "mbeya" THEN only actors whose name, region, or district contains "mbeya" (case-insensitive) render AND the count reflects the filtered total across all pages, not just the current page.
  - GIVEN a search term that matches nothing WHEN results return THEN the empty state renders with a clear "no organizations found" message and a way to clear the search.
- **PII/RBAC impact:** `Public` only; search MUST NOT match against or expose any PII field.

### FR-4: Backend `search` query parameter

- **Description:** `GET /api/v1/actors` MUST accept an optional `search` query parameter that performs a case-insensitive partial match across `traderName`, `region`, and `district`, combined (AND) with the existing `consentStatus = GRANTED` guard and the existing `crop` / `role` / `region` filters. The parameter MUST be validated (string, bounded length) so a malformed value yields 400. The response shape and the role-aware PII projection MUST be unchanged.
- **Rationale / Source:** Enables FR-3; PRD AC-2; proposal OQ-4.
- **Acceptance criteria:**
  - GIVEN consented and non-consented actors WHEN a client calls `GET /api/v1/actors?search=mbeya` THEN only GRANTED actors matching name/region/district render, projected through the role-aware serializer (no PII), in the standard `{ data, page, pageSize, total }` envelope.
  - GIVEN `search` combined with `crop=sorghum` WHEN called THEN both constraints apply (AND).
  - GIVEN an over-long `search` value WHEN called THEN the request is rejected with 400 (NFR validation), not silently truncated.
- **PII/RBAC impact:** `Public` read; consent enforced at the query (defense in depth, not serializer-only); no PII added or exposed.

### FR-5: Public Actor Profile page

- **Description:** The system MUST serve a public Actor Profile page that, given an actor id, renders a standardized profile from `GET /api/v1/actors/:id`: header (name, role badge, region · district), geographic location (region, district, and coordinates when present), market activity (crops), and operational capacity. The page MUST be reachable as a static-export-safe route that carries the actor id (see design.md §5).
- **Rationale / Source:** PRD US-1 / Actor Profiles module; proposal §4 Phase 1 (2).
- **Acceptance criteria:**
  - GIVEN a consented actor id WHEN a visitor opens its Profile THEN the actor's name, role, location, crops, and capacity render from the live detail endpoint.
  - GIVEN an id that is absent OR not consented WHEN the detail endpoint returns 404 THEN the Profile renders a clear "profile not found / not available" state (a non-consented actor is indistinguishable from a missing one — backend contract).
- **PII/RBAC impact:** `Public` only; renders only `PublicActor` fields (no PII, no commercial/contact fields — those are Phase 2).

### FR-6: Consent-gated Contact & Commercial panel (locked for Public)

- **Description:** The Profile MUST include a "Contact & Commercial Data" panel that, for the `Public` role, always renders a **locked/restricted** state with a clear explanation (consent/role-restricted) and MUST NOT render any phone, email, or commercial field. No PII may appear in the response payload or the rendered DOM.
- **Rationale / Source:** PRD US-1 (no phone/email for public); detailed-design §8; proposal §4 (2) / OQ-2; mirrors mockup-3 "locked" treatment.
- **Acceptance criteria:**
  - GIVEN any public Profile WHEN it renders THEN the Contact & Commercial panel shows the locked state AND no `phone`/`email` string appears anywhere in the rendered output or the network payload.
- **PII/RBAC impact:** Core PII boundary; `Public`; enforced server-side (serializer) and asserted in tests over the rendered DOM.

### FR-7: Map → Profile deep-link resolution

- **Description:** The Discovery Map's "View Profile" affordances (marker popup and actor list) MUST link to the real Actor Profile route instead of the current `/directory?actor=:id` placeholder, so a map selection deep-links to a working profile.
- **Rationale / Source:** Resolves `seed-map/discovery-map` DD-5/OQ-1; proposal §4 (3).
- **Acceptance criteria:**
  - GIVEN the map WHEN a visitor activates "View Profile" on an actor THEN the browser navigates to that actor's Profile page and the profile loads for the same actor id.
- **PII/RBAC impact:** None beyond existing map (no PII).

### FR-8: Loading, empty, error, and not-found states

- **Description:** Every new data-bound surface (Directory list, Profile) MUST render distinct, accessible states for loading, empty (no matches), error (fetch failed), and — for the Profile — not-found (404), consistent with the existing home/map patterns and the resilient null-on-failure data contract.
- **Rationale / Source:** Prior-spec DD-6 / NFR-5 (resilient null-on-failure); proposal §5.
- **Acceptance criteria:**
  - GIVEN the API is unreachable WHEN the Directory loads THEN an error state renders (not a crash or blank page) AND no unhandled exception is thrown.
  - GIVEN a search/filter combination with zero matches WHEN results return THEN the empty state renders distinctly from the error state.
- **PII/RBAC impact:** None.

## 4. Non-Functional Requirements

- **NFR-1 (PII boundary):** No `phone`/`email` (or any PII field) MUST appear in any Directory or Profile response, page source, or DOM. Enforced server-side by the role-aware serializer (defense in depth) and type-enforced on the client (`PublicActor` carries no PII fields); asserted by tests over rendered output. **MUST.**
- **NFR-2 (Performance):** Directory list + search MUST return p95 < 1s over a 1,000+ actor dataset, achieved by server-side filtering/pagination (no full-dataset client fetch). **MUST.**
- **NFR-3 (Accessibility, WCAG 2.1 AA):** All controls labeled and keyboard-operable; visible focus; the result count exposed via an `aria-live` region; cards/links have accessible names; `jest-axe` passes with no violations on Directory and Profile. **MUST.**
- **NFR-4 (Design tokens):** All color/spacing/geometry MUST use System Design §7 tokens via the existing Tailwind config — no hardcoded hex or ad-hoc geometry. **MUST.**
- **NFR-5 (Static export):** All new routes MUST be static-export-safe — no SSR, ISR, or route handlers; detail pages are client-rendered against the API; `next build` (output: export) MUST succeed. **MUST.**
- **NFR-6 (Responsive):** The card grid MUST reflow across mobile → desktop; the Profile MUST be usable on a 360px-wide viewport. **MUST.**
- **NFR-7 (Resilient fetch):** The list and detail clients MUST follow the null-on-failure contract (never throw to the component layer); components render graceful states (FR-8). **MUST.**

## 5. Data & Schema Impact

- **No Prisma model or migration changes.** No new entities or columns.
- **No new PII fields.** The PII allowlist is unchanged.
- The only backend change is an **additive, optional `search` query parameter** on the existing read path (FR-4) — a query/validation change, not a schema change.

## 6. Out of Scope (Phase 2 — separate specs)

- Cognito sign-in / sessions / the authenticated user menu.
- `Staff`/`Admin` RBAC and role+consent **PII unlock** on profiles (mockup-2 "Unlocked" contact data).
- The Data Maintenance & Validation console (mockup-4): record editing, validation checklist, consent verification, "Trigger Consent Request Workflow", "Approve & Publish".
- Any write/CRUD endpoints, CSV import/export, user management.
- The "DEMO / Verified / Pending" preview toggle (authenticated demo affordance).
- Showing non-consented ("pending") actors in the public directory (public lists consented-only — backend already pins `GRANTED`).

## 7. Dependencies & Assumptions

- **Deployed API:** `GET /api/v1/actors` (list + detail) is live (eu-west-1, IBD-DEV) and consent-gated; the Profile detail endpoint already exists — no new endpoint needed.
- **Shipping FR-4** requires a **backend redeploy** of the `accelerate-tz-dev-backend` SAM stack (`--profile IBD-DEV`); new routes require a **frontend rebuild + deploy**.
- Reuses `lib/content/{roles,crops,regions}`, `RoleBadge`, the `(public)` shell, and §7 tokens.
- Assumes the seeded/synthetic dataset (consented, no PII) for verification at realistic scale (436 actors loaded).

## 8. Open Questions

- **OQ-1 (region filter options source):** the backend validates `region` against `CANONICAL_REGIONS` (`backend/src/common/normalize.ts`), while the provisional `frontend/lib/content/regions.ts` lists a different 10, and the synthetic data uses regions (Kagera, Manyara, Rukwa, Songwe) that may not be in either. The region filter MUST offer only values the backend accepts. **Recommendation:** drive the directory region options from the canonical accepted set and reconcile `regions.ts`; confirm at design time.
- **OQ-2 (search scope):** Phase-1 `search` matches name/region/district. Should it also match crop names? **Recommendation:** no — crop is already a dedicated filter (FR-2); keep search to free-text identity/place fields.
- **OQ-3 (profile location rendering):** show a small Leaflet map snippet on the Profile or textual coordinates only? **Recommendation:** textual region/district/coordinates in Phase 1 (avoid pulling Leaflet onto the profile bundle); a map snippet can be a later enhancement.
- **OQ-4 (profile route shape):** confirmed query-param client route over a build-time `[id]` static-param route (design.md §5 / ADR) to avoid 404s for actors added after a build and build-time API coupling.

---
**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email`. This spec adds no PII and serves `Public` only. All AWS commands use `--profile IBD-DEV`.
