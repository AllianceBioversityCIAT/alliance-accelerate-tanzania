# Requirements — Home Page (Public Registry Portal landing)

- Spec path: docs/specs/changes/home-page/
- Status: Draft
- Author / Date: JuanCode / 2026-06-22
- Depth: Standard
- Related: docs/prd.md §3,§4,§6 (US-1, US-3, AC-2, AC-3); docs/system-design/design.md §4,§7,§8; docs/detailed-design/detailed-design.md §4,§6; docs/specs/changes/home-page/proposal.md

## Document Control

| Field | Value |
|---|---|
| Branch | `feature/home-page` |
| Approved intent | `proposal.md` (Option A — static copy + live metrics) |
| Supersedes | none |

## 1. Summary

Deliver the public **landing page** at `/` — the entry point of the Public Registry Portal. It explains what the ACCELERATE Tanzania Seed Registry is, surfaces headline aggregate metrics, presents the three priority crops, and routes visitors into the Map and Directory. Because no frontend exists yet, this spec also bootstraps the minimal Next.js (static export) application shell that subsequent public pages will reuse. The page exposes only public aggregates and copy — **no PII**.

## 2. Glossary

- **Public visitor:** unauthenticated user with the `Public` role.
- **Metrics band:** the dark horizontal strip showing four aggregate counts.
- **Crop coverage:** the three-card section for Sorghum, Common Bean, Groundnut.
- **Public shell:** the shared header + footer layout wrapping all `(public)` routes.
- **Aggregate metrics:** non-PII counts from `GET /api/v1/metrics` (actors mapped, crops, regions covered, actor types, per-crop counts).

## 3. System Context & Scope

The home page is a statically-exported Next.js (App Router) route. It renders static marketing copy and fetches **only numeric aggregates** at runtime from the NestJS API (`GET /api/v1/metrics`). It introduces the reusable public shell (header/nav/footer) and presentational components (CTA, stat card, crop card). No SSR, no Next route handlers, no authentication implementation (the header auth slot is presentational and hydrates client-side later).

**In scope:** `/` route and its five sections; the public shell; metrics wiring with loading/error fallback; responsive + a11y; minimal app bootstrap.
**Out of scope:** see §6.

## 4. Requirement Numbering & Writing Standards

Functional requirements are `FR-<n>`; non-functional `NFR-<n>`. Each is atomic and testable. Strength via MUST/SHOULD/MAY. Scenarios use GIVEN/WHEN/THEN. Each requirement traces to a PRD story and is covered by ≥1 task.

## 5. Stakeholders / Personas

| Persona | Role | Interest in this page |
|---|---|---|
| Public visitor (donor, researcher, partner) | `Public` | Understand the registry, see scale, navigate to Map/Directory. PII never shown. |
| Staff / Admin | `Staff`/`Admin` | See an authenticated header variant (user menu + role badge) when a session exists. |

## 6. Functional Requirements

### FR-1: Render the landing page structure
The system MUST render, at `/`, five sections in order: global header, hero, metrics band, crop coverage, footer.
- Source: PRD US-3; System Design §4.

#### Scenario: Public visitor opens the home page
- GIVEN an unauthenticated visitor
- WHEN they navigate to `/`
- THEN the header, hero, metrics band, crop-coverage section, and footer all render
- AND no `phone` or `email` data appears anywhere on the page.

### FR-2: Hero with primary calls to action
The hero MUST display an eyebrow badge, headline, supporting copy naming the three value chains, a supporting visual panel with a "Live Registry" verified-actor stat, and two CTAs: **Explore the Map** and **Browse Directory**.
- Source: PRD US-1, US-2.

#### Scenario: Visitor uses a hero CTA
- GIVEN the home page is rendered
- WHEN the visitor activates "Explore the Map"
- THEN they navigate to `/map`
- AND activating "Browse Directory" navigates to `/directory`.

### FR-3: Live aggregate metrics band
The metrics band MUST display four aggregates — Actors mapped, Major crops, Regions covered, Actor types — sourced from `GET /api/v1/metrics`.
- Source: PRD US-3, AC-2.

#### Scenario: Metrics load successfully
- GIVEN the metrics endpoint returns aggregate counts
- WHEN the home page finishes loading
- THEN each of the four figures shows its live value.

#### Scenario: Metrics fail or are unavailable
- GIVEN the metrics endpoint errors or is not yet deployed
- WHEN the home page loads
- THEN each figure shows a non-broken fallback (skeleton then a neutral placeholder such as "—")
- AND the page still renders fully without a thrown error.

### FR-4: Crop coverage cards with live counts
The crop-coverage section MUST render one card per priority crop (Sorghum, Common Bean, Groundnut), each with the crop name, a short description, and a per-crop mapped-actor count, plus a "View all actors" link to `/directory`. Crop cards MUST use the crop palette tokens.
- Source: PRD §1; System Design §7 (crop tokens), §8.

#### Scenario: Crop counts render
- GIVEN the metrics response includes per-crop mapped-actor counts
- WHEN the crop-coverage section renders
- THEN each crop card shows its count, falling back to a placeholder when the count is unavailable.

### FR-5: Role-aware header auth slot
The header MUST render a sign-in affordance for `Public` and, when an authenticated session exists, a user menu showing the user's name and role badge.
- Source: PRD §3; System Design §5.
- Note: session detection hydrates client-side; full Cognito auth is a separate spec. Default render is the `Public` (sign-in) state.

#### Scenario: Unauthenticated header
- GIVEN no active session
- WHEN the header renders
- THEN a sign-in affordance is shown and no user identity is displayed.

### FR-6: Primary navigation
The header MUST provide navigation to Home (`/`), Discovery Map (`/map`), and Directory (`/directory`), with the current route visually indicated.
- Source: System Design §5.

### FR-7: Footer with governance note
The footer MUST display the brand line and the data-governance note ("Data governed under participant consent").
- Source: System Design §4; PRD §8.

## 7. Non-Functional Requirements

- **NFR-1 (Static export):** The page MUST build under Next.js static export (`output: 'export'`) with no SSR, ISR, or route handlers. Verify: `next build` succeeds and emits static output.
- **NFR-2 (Responsive):** The layout MUST be usable from 360px mobile to ≥1280px desktop per System Design §9 (hero stacks, metrics band wraps, crop cards reflow 1→3 columns).
- **NFR-3 (Accessibility):** The page MUST meet WCAG 2.1 AA basics: semantic landmarks, labeled links, visible focus, AA contrast, image `alt` text, and respect for `prefers-reduced-motion`.
- **NFR-4 (Design tokens):** All colors, spacing, radii, and shadows MUST come from System Design §7 tokens — no hardcoded values.
- **NFR-5 (Performance/resilience):** Metrics fetch MUST be non-blocking (page renders before/independent of the request) and MUST NOT crash the page on failure.

## 8. Data & Schema Impact

No database schema change. May require the metrics contract (`GET /api/v1/metrics`) to expose `actorsMapped`, `cropsTracked`, `regionsCovered`, `actorTypes`, and per-crop `mappedActors`. PII set unchanged — none used here.

## 9. Out of Scope

Map, Directory, Actor profile pages; Cognito auth implementation; Admin shell; final brand assets/photography; localization; any backend endpoint implementation (consumed, not built, here).

## 10. Open Questions

- OQ-1: Per-crop counts in `/metrics` vs `/crops`? (Assume `/metrics`.)
- OQ-2: Placeholder imagery until brand assets arrive? (Assume yes.)
- OQ-3: Are mockup numbers (26 regions, 5 actor types, 420/380/210) illustrative? (Assume yes — live-driven.)
- OQ-4: Does this spec own the frontend bootstrap, or does a separate scaffolding spec run first? (This spec assumes it owns a minimal bootstrap.)

## 11. Requirement ID Index

| ID | Title | Covered by task |
|---|---|---|
| FR-1 | Landing page structure | T-3, T-4 |
| FR-2 | Hero + CTAs | T-4 |
| FR-3 | Live metrics band | T-5, T-6 |
| FR-4 | Crop coverage cards | T-6 |
| FR-5 | Role-aware header auth slot | T-3 |
| FR-6 | Primary navigation | T-3 |
| FR-7 | Footer | T-3 |
| NFR-1 | Static export | T-1, T-7 |
| NFR-2 | Responsive | T-4, T-6, T-7 |
| NFR-3 | Accessibility | T-7 |
| NFR-4 | Design tokens | T-2 |
| NFR-5 | Performance/resilience | T-5 |
