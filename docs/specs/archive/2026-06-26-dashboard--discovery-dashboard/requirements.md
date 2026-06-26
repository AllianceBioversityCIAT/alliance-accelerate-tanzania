# Requirements — Seed Discovery Dashboard

- Spec path: docs/specs/dashboard/discovery-dashboard/
- Status: Draft
- Author / Date: AI agent (Claude) with JuanCode — 2026-06-26
- Related: docs/prd.md §3 (Personas), §4 (Goals), §6 (US-1/US-2/US-3), §7 (AC-1/AC-2/AC-3); docs/system-design/design.md §7 (tokens); docs/detailed-design/detailed-design.md §3 (Actor), §4 (API), §6 (frontend), §8 (RBAC/PII); proposal.md (this spec)

## 1. Summary

A new public route **`/dashboard`** that turns the existing Actor registry into a **demand-side discovery tool**: against one shared, URL-synced filter set (crop, region, district, actor type, **capacity range**, search), it presents a KPI summary band, a small set of token-themed charts, the existing Leaflet map, and a matching shortlist — so a buyer/offtaker (e.g. *"≥10 t of common bean in region X"*) can go from question → visual answer → actionable shortlist on one screen.

It advances PRD **US-2** (filterable territorial view), **US-1** (discover actors without PII), and **US-3** (aggregate scale at a glance) by composing them into a single analytical surface.

**Scope honesty:** PRD §5 lists *"Advanced analytics dashboards / BI beyond the landing-page metrics and map filters"* as **out of scope for v1**. This spec is a **deliberate, stakeholder-approved extension** of that baseline (per JuanCode). It stays inside the data and PII boundaries the PRD already mandates — it adds **no** new data, fields, or PII exposure; it only re-presents the public-visible population already exposed by `/actors` and `/metrics`.

## 2. Requirement Numbering & Writing Standards

- Functional requirements: **`FR-1`…**; non-functional: **`NFR-1`…**.
- Each requirement is atomic, testable, and traces up (PRD US/AC) and down (`tasks.md`).
- Priority via **MUST / SHOULD / MAY** (RFC 2119).

## 3. Functional Requirements

### FR-1: Dashboard route and entry points

- **Description:** The system MUST provide a public `/dashboard` route (static-export client page) and MUST link to it from the primary navigation (`Header`) and the home Hero CTA.
- **Rationale / Source:** PRD US-2/US-3; proposal §4.
- **Acceptance criteria (Given/When/Then):**
  - GIVEN any visitor WHEN they open `/dashboard` THEN the dashboard page renders (KPI band, charts, map, shortlist) with no authentication required.
  - GIVEN a visitor on the home page WHEN they activate the dashboard nav link or Hero CTA THEN they navigate to `/dashboard`.
- **PII/RBAC impact:** Public-accessible; no PII (detailed-design §8).

### FR-2: Shared, URL-synced filter set

- **Description:** The dashboard MUST drive every panel (KPIs, charts, map, shortlist) from **one** filter set — crop, region, district, actor type, capacity range, and free-text search — and MUST sync that state to the URL so a filtered view is shareable and restorable on reload.
- **Rationale / Source:** PRD US-2 (filters compose), AC-3; detailed-design §6 ("Filters are URL-synced so views are shareable").
- **Acceptance criteria:**
  - GIVEN the dashboard WHEN the user changes any filter THEN all panels recompute from the same filter set without a full page reload.
  - GIVEN an applied filter set WHEN the user copies the URL and reopens it THEN the same filters are restored and the same view renders.
  - GIVEN multiple filters WHEN set together THEN they compose with AND semantics (matches the directory/map behavior).
- **PII/RBAC impact:** None (filter values are non-PII).

### FR-3: Capacity-range filtering exposed in the UI

- **Description:** The dashboard MUST expose a **capacity range** control (minimum and/or maximum tons) wired to the API's `capacityMin`/`capacityMax` filter, and the frontend `ActorsQuery` MUST carry these fields.
- **Rationale / Source:** PRD §4 (map supports filtering by Capacity), US-2; detailed-design §4 (API supports `capacityMin/Max`); proposal §3 (gap: not in UI today).
- **Acceptance criteria:**
  - GIVEN the user sets a minimum capacity of 10 THEN only actors with `capacityTons ≥ 10` appear in the shortlist/map and are counted in the KPIs/charts.
  - GIVEN an actor with null `capacityTons` WHEN a minimum capacity filter is active THEN that actor is excluded from capacity-filtered results (consistent, documented behavior).
  - GIVEN no capacity filter WHEN the dashboard loads THEN no capacity bound is sent and all matching actors are included.
- **PII/RBAC impact:** None.

### FR-4: KPI summary band

- **Description:** The dashboard MUST show a KPI band summarizing the current filtered, public-visible population: number of matching actors, total capacity (t), median (or average) capacity (t), regions covered, and distinct actor types. KPIs MUST recompute live as filters change.
- **Rationale / Source:** PRD US-3 (headline metrics), US-2; proposal §4.
- **Acceptance criteria:**
  - GIVEN a filter set WHEN results load THEN each KPI reflects exactly the matching, public-visible actor set.
  - GIVEN actors with null `capacityTons` WHEN capacity totals are shown THEN nulls are excluded from sums/medians and the count basis is unambiguous (e.g. "total over N actors reporting capacity").
  - GIVEN data fails to load WHEN the KPI band renders THEN it shows a graceful fallback ("—"/skeleton), never a crash.
- **PII/RBAC impact:** Aggregates only; no PII.

### FR-5: Discovery charts

- **Description:** The dashboard MUST render at least three responsive, token-themed charts over the filtered population: (a) capacity by region, (b) actors by crop, (c) actors by actor type. Charts MAY include a fourth (e.g. capacity distribution / top-N suppliers).
- **Rationale / Source:** PRD US-2/US-3; proposal §4.
- **Acceptance criteria:**
  - GIVEN a filter set WHEN charts render THEN each chart reflects the same filtered, public-visible population as the KPIs and shortlist.
  - GIVEN crop series WHEN coloured THEN colours come from the design tokens (crop tokens), not raw hex.
  - GIVEN an empty result set WHEN charts render THEN each shows an explicit empty state, not a broken/blank canvas.
- **PII/RBAC impact:** Aggregates only; no PII (no tooltip may reveal phone/email).

### FR-6: Accessible chart data-table fallback

- **Description:** Each chart MUST provide an accessible, equivalent representation of its data (e.g. a visually-available or toggle/`<details>` data table) so the information is reachable without relying on colour or canvas rendering.
- **Rationale / Source:** NFR accessibility (WCAG 2.1 AA); UX rules `data-table`, `color-guidance`.
- **Acceptance criteria:**
  - GIVEN a chart WHEN a keyboard/AT user reaches it THEN an equivalent data table conveys the same values.
  - GIVEN colour is removed WHEN the chart is viewed THEN categories remain distinguishable via labels/table.
- **PII/RBAC impact:** None.

### FR-7: Map panel driven by shared filters

- **Description:** The dashboard MUST include the existing Leaflet map, reused (not forked), plotting the same filtered, public-visible actors and reacting to the shared filter set.
- **Rationale / Source:** PRD US-2, AC-3; detailed-design §6 (Leaflet via dynamic import, `/actors/geo`).
- **Acceptance criteria:**
  - GIVEN a filter change WHEN the map updates THEN its markers reflect the same population as the KPIs/charts/shortlist.
  - GIVEN the static-export constraint WHEN the map loads THEN Leaflet is loaded client-side only (no SSR), consistent with the existing `/map`.
- **PII/RBAC impact:** Map points carry no PII (uses public geo feed; exact GPS already consent-gated server-side).

### FR-8: Matching shortlist

- **Description:** The dashboard MUST present a compact shortlist of the matching actors (name, region/district, actor type, crops, capacity) with each row linking to that actor's public profile. The shortlist MUST contain no PII.
- **Rationale / Source:** PRD US-1; proposal §4.
- **Acceptance criteria:**
  - GIVEN a filter set WHEN the shortlist renders THEN it lists matching public-visible actors with a link to each profile.
  - GIVEN any shortlist row WHEN inspected THEN it contains no `phone`/`email` (or other PII) field.
  - GIVEN a large result set WHEN the shortlist renders THEN it paginates or bounds the rows and links to the full `/directory` for the complete list.
- **PII/RBAC impact:** Public shape only; no PII (AC-1 parity).

### FR-9: "Download this view" (PII-free export)

- **Description:** The dashboard MUST offer a "Download this view" action that produces a **PII-free** artifact (CSV and/or print/PDF) of the current aggregates and shortlist for any user, generated client-side (no SSR). The existing role-gated `/export` remains the Staff/Admin path for PII-bearing exports and is out of scope here.
- **Rationale / Source:** PRD AC-6 (export omits PII for public), US-7; proposal §4.
- **Acceptance criteria:**
  - GIVEN a filtered view WHEN the user downloads it THEN the artifact contains the visible aggregates and shortlist columns and **no** PII.
  - GIVEN the static-export constraint WHEN the download is produced THEN it is generated in the browser (no Next route handler / SSR).
- **PII/RBAC impact:** MUST NOT include `phone`/`email`; Public-equivalent output (AC-6).

### FR-10: Honest loading, empty, error, and truncation states

- **Description:** Every panel MUST render explicit loading, empty, and error states. If the dashboard aggregates over a bounded fetch (not the entire matching set), it MUST visibly disclose any truncation rather than implying complete coverage.
- **Rationale / Source:** detailed-design §6 (resilient null-on-failure, DD-6); proposal §11 (client-aggregation completeness).
- **Acceptance criteria:**
  - GIVEN a data fetch failure WHEN a panel renders THEN it shows an error/empty state and never crashes the page.
  - GIVEN the matching set exceeds the fetch bound WHEN aggregates are shown THEN a visible notice states the aggregates are based on a capped sample and links to the full directory/map.
- **PII/RBAC impact:** None.

### FR-11: Consent and PII parity with public reads

- **Description:** All dashboard KPIs, charts, map, shortlist, and exports MUST reflect exactly the **public-visible (consented, non-PII)** population already returned by the public API — never more. The dashboard MUST consume only public endpoints and MUST NOT introduce any client-side PII handling.
- **Rationale / Source:** PRD AC-1; detailed-design §8 (consent gating, PII allowlist).
- **Acceptance criteria:**
  - GIVEN the dashboard WHEN any panel is rendered THEN its population matches what `/actors` (+ `/actors/geo`, `/metrics`) returns for an unauthenticated request.
  - GIVEN any rendered surface (chart tooltip, table cell, export) WHEN inspected THEN no PII field is present.
- **PII/RBAC impact:** Hard boundary — enforced upstream server-side; dashboard adds zero PII surface.

## 4. Non-Functional Requirements

- **NFR-1 (Security/PII — MUST):** No `phone`/`email` (or any PII-allowlist field) appears in any dashboard panel, tooltip, or export for any user. Verified by reliance on public endpoints + UI tests asserting absence (AC-1).
- **NFR-2 (Static export — MUST):** No SSR/ISR/route handlers. Charts and map load client-side and are code-split/lazy-loaded; `npm run build` succeeds under `output: 'export'`.
- **NFR-3 (Performance — SHOULD):** Filter-to-update interaction reflects in panels in < 1s (p95) over the ~1,000-actor dataset; chart and map bundles are lazy-loaded so initial dashboard paint is not blocked by them.
- **NFR-4 (Accessibility — MUST):** WCAG 2.1 AA — keyboard-reachable controls and charts, visible focus states, ≥ 4.5:1 text contrast, chart data-table equivalents (FR-6), and `prefers-reduced-motion` respected for any chart/animation.
- **NFR-5 (Design tokens — MUST):** All colours/spacing/typography from `system-design/design.md §7` tokens; chart palette uses token-derived colours (crop tokens for crop series). No raw hex/geometry.
- **NFR-6 (Resilience — MUST):** Data fetching reuses the null-on-failure contract (DD-6/NFR-5); a failed fetch degrades a panel gracefully, never throws.
- **NFR-7 (Shareability — SHOULD):** Filter state is URL-encoded and restorable (supports FR-2).

## 5. Data & Schema Impact

- **Backend / Prisma:** **None.** No new entities, fields, or migrations. No new PII fields — the PII allowlist (`src/common/pii-consent.policy.ts`) is unchanged.
- **API:** No new endpoint required for v1 (reuse `GET /api/v1/actors` with `crop/region/traderType/capacityMin/capacityMax/search/page/pageSize`, `GET /api/v1/actors/geo`, `GET /api/v1/metrics`). A backend aggregate endpoint is an explicit non-goal for v1 (see design ADR / Out of Scope).
- **Frontend contract:** `ActorsQuery` (frontend `lib/api/actors.ts`) gains optional `capacityMin?: number` and `capacityMax?: number`. This is a frontend type extension only; the API already accepts these params.

## 6. Out of Scope

- Exposing or downloading **PII** (phone/email) to Public — gated; unchanged.
- A **"request introduction" / messaging** flow to close the contact loop for Public buyers (deferred to a separate spec; see Open Questions OQ-1).
- A dedicated **backend aggregate endpoint** (`/dashboard/aggregate`) — reuse existing endpoints in v1; revisit only if client aggregation proves insufficient.
- Any **write/edit** actions, admin analytics, or saved-view persistence.
- Replacing `/map` or `/directory` — the dashboard composes and links to them.
- Heavy geo-analytics (choropleth/heatmap) and switching charting engine to ECharts.

## 7. Dependencies & Assumptions

- **Existing API:** `GET /api/v1/actors` supports `capacityMin`/`capacityMax` filtering and returns the paginated public envelope (detailed-design §4). **Assumption to confirm at execution** — if not live, FR-3 falls back to client-side capacity filtering over fetched rows (documented in design).
- **Existing components reused:** `components/map/*` (Leaflet), `lib/api/useActors`, `lib/api/useMetrics`, `lib/content/regions|crops|roles`, `components/shell/Header`.
- **Charting library:** a React charting library will be added (recommended Recharts — finalized in design).
- **Dataset scale:** ~1,000 actors — small enough for client-side aggregation over a bounded fetch.
- **AWS / deploy:** frontend-only change; deploy via `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh` (all AWS ops use `--profile IBD-DEV`).

## 8. Open Questions

- **OQ-1 (contact loop):** How does a Public buyer act on a shortlist when phone/email are PII-gated? Proposal recommendation for v1: **shortlist-only, contact brokered by Staff**; a consent-based "request introduction" flow becomes its own spec. **Assumed accepted for this spec unless changed.**
- **OQ-2 (aggregation completeness):** Confirm the "fetch all matching" strategy bound (single large `pageSize` vs. paged accumulation vs. future backend aggregate). Default: bounded fetch with an honest truncation notice (FR-10).
- **OQ-3 (capacity-null treatment):** Confirm that actors with null `capacityTons` are excluded from capacity filters/sums and surfaced as an "N reporting capacity" basis (FR-3/FR-4). Default: exclude + disclose.

## 9. Requirement ID Index

| ID | Title | Traces (PRD) |
|---|---|---|
| FR-1 | Dashboard route and entry points | US-2, US-3 |
| FR-2 | Shared, URL-synced filter set | US-2, AC-3 |
| FR-3 | Capacity-range filtering in UI | US-2, §4 |
| FR-4 | KPI summary band | US-3 |
| FR-5 | Discovery charts | US-2, US-3 |
| FR-6 | Accessible chart data-table fallback | AC (a11y) |
| FR-7 | Map panel driven by shared filters | US-2, AC-3 |
| FR-8 | Matching shortlist | US-1 |
| FR-9 | "Download this view" (PII-free export) | US-7, AC-6 |
| FR-10 | Loading/empty/error/truncation states | DD-6 |
| FR-11 | Consent & PII parity with public reads | AC-1 |
| NFR-1 | No PII exposure | AC-1 |
| NFR-2 | Static-export compliance | — |
| NFR-3 | Performance (<1s p95) | AC-2 |
| NFR-4 | Accessibility (WCAG 2.1 AA) | — |
| NFR-5 | Design tokens only | — |
| NFR-6 | Resilient null-on-failure | DD-6 |
| NFR-7 | URL-shareable filter state | — |

---

**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email` (+ allowlist). All AWS commands use `--profile IBD-DEV`.
