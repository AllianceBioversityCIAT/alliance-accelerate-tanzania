# Proposal — Home Page (Public Registry Portal landing)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `changes/home-page` |
| Proposal path | `docs/specs/changes/home-page/proposal.md` |
| Status | Draft — awaiting approval |
| Branch | `feature/home-page` |
| Date | 2026-06-22 |
| Traces | PRD `docs/prd.md` US-1, US-3, AC-2, AC-3; System Design §4 (Landing), §7 (tokens), §8 (components); Detailed Design §4 (`GET /api/v1/metrics`, `GET /api/v1/crops`) |
| Source | Provided home-page mockup (hero + stats band + crop coverage) |

## 2. Intent

Deliver the public **landing page** — the first screen at `/` — that communicates what the registry is, surfaces headline metrics, and routes visitors into the two primary explore paths (Map and Directory). This is the entry point of the Public Registry Portal and the visual anchor for the whole platform.

## 3. Problem / Current Behavior

There is no frontend yet. A public visitor has no way to understand the registry's purpose, see its scale, or navigate into the data. The PRD calls for a landing page with high-level metrics (US-3) and discoverable entry points (US-1), but nothing exists to satisfy it.

## 4. Proposed Outcome

A responsive, public, statically-exported home page composed of the sections in the mockup:

- **Global header** — brand lockup (ACCELERATE / Tanzania Seed Registry), primary nav (Home · Discovery Map · Directory), and an auth slot (sign-in for `Public`; user menu with role badge for `Staff`/`Admin`).
- **Hero** — eyebrow badge ("Institutional seed-system intelligence"), headline, supporting copy naming the three value chains, and two CTAs: **Explore the Map** → `/map`, **Browse Directory** → `/directory`. A supporting visual panel with a "Live Registry" stat card (verified actor count).
- **Metrics band** (dark) — four live aggregates: Actors mapped, Major crops, Regions covered, Actor types — sourced from `GET /api/v1/metrics`.
- **Crop coverage** — "Three priority crops, one connected system" with three crop cards (Sorghum, Common Bean, Groundnut), each with a short description and a per-crop mapped-actor count, plus a **View all actors** link → `/directory`.
- **Footer** — brand line + governance note ("Data governed under participant consent").

All visuals use the design tokens in System Design §7 (crop palette drives the crop cards) and the component inventory in §8. PII is irrelevant here — the page exposes only aggregates and public copy.

## 5. Scope

- The `/` route and its sections (header, hero, metrics band, crop coverage, footer) as static-exported Next.js (App Router) client components styled with Tailwind tokens.
- Wiring metrics and crop counts to the backend metrics endpoint, with sensible loading/empty/error states (skeletons per System Design §8).
- Responsive behavior (mobile → desktop) and WCAG 2.1 AA basics (landmarks, focus, contrast, alt text).
- A reusable header/footer shell and CTA/stat/crop-card components that later public pages reuse.

## 6. Non-Goals

- Building the Map page, Directory list, or Actor profile pages (separate specs).
- Authentication implementation (the header auth slot renders a sign-in link; Cognito wiring is its own spec). The mockup's logged-in state is illustrative only.
- Admin shell/console.
- Final brand assets / hero photography (placeholders until the program team delivers; see System Design §13).
- Localization (English-only v1).

## 7. Affected Users, Systems, And Specs

- **Users:** Public visitors (primary); Staff/Admin see the authenticated header variant.
- **Frontend:** new Next.js app `(public)` route group; shared header/footer shell + landing components.
- **Backend:** consumes existing planned `GET /api/v1/metrics` and `GET /api/v1/crops`; may require adding per-crop actor counts to the metrics/crops response.
- **Specs:** first consumer of `docs/specs/general-setup/` templates; depends on project scaffolding existing (see Risks).

## 8. Requirement Delta Preview

### ADDED Requirements
- Public `/` landing route renders header, hero, metrics band, crop coverage, and footer.
- Hero CTAs navigate to `/map` and `/directory`; "View all actors" navigates to `/directory`.
- Metrics band displays four live aggregates from `GET /api/v1/metrics` with loading/error states.
- Crop coverage renders one card per priority crop with description and per-crop mapped-actor count.
- Header renders a role-aware auth slot (sign-in vs. user menu + role badge).

### MODIFIED Requirements
- `GET /api/v1/metrics` (and/or `GET /api/v1/crops`) response shape may extend to include `regionsCovered`, `actorTypes`, and per-crop `mappedActors` counts.

### REMOVED Requirements
- None.

## 9. Approach Options

**Option A — Static copy + live metrics (recommended).** Page content (headline, crop descriptions) is static in the frontend; only the numeric aggregates (metrics band + per-crop counts) are fetched at runtime from the API. Smallest safe path: ships even before all backend endpoints are rich, degrades gracefully to placeholders.

**Option B — Fully API-driven.** All content including crop descriptions and copy served from the backend/CMS. More flexible for non-dev edits, but adds backend surface and a content model that nothing else needs yet — premature.

**Option C — Fully static (hardcoded metrics).** Fastest to build but the metrics go stale immediately and violate the "living system" PRD goal. Rejected.

## 10. Recommended Approach

**Option A.** It satisfies US-3 (live metrics) while keeping the page shippable independently of backend completeness, reuses the design tokens/components, and establishes the public shell that Directory and Map specs will reuse. Static copy avoids building a content model no other feature requires yet.

## 11. Risks, Dependencies, And Open Questions

- **Dependency:** requires the Next.js frontend to be scaffolded (project-scaffolding spec). If not yet done, this spec must either follow it or include minimal app bootstrap.
- **Dependency:** `GET /api/v1/metrics` must exist and expose the four aggregates + per-crop counts; otherwise the band falls back to placeholders.
- **OQ-1:** Should per-crop actor counts come from `/metrics` or `/crops`? (Recommend extending `/metrics`.)
- **OQ-2:** Hero/crop imagery — use placeholder treatments until brand assets arrive? (Assume yes.)
- **OQ-3:** Header auth state on a static page — render sign-in by default and hydrate to user menu client-side after Cognito session check? (Assume yes.)
- **OQ-4:** Are the mockup's numbers (26 regions, 5 actor types, 420/380/210 per crop) illustrative, or fixed launch targets? (Assume illustrative — driven by live data.)

## 12. Success Criteria

- `/` renders all five sections responsively (mobile → desktop) using only System Design §7 tokens (no hardcoded colors/geometry).
- Metrics band and crop counts reflect live `GET /api/v1/metrics` data, with skeleton loading and a non-broken fallback on error.
- CTAs and nav links route correctly to `/map` and `/directory`.
- Page passes WCAG 2.1 AA basics (landmarks, labeled links, focus-visible, contrast, image alt text).
- Builds cleanly under `next build` static export (no SSR/route handlers introduced).

## 13. Next Step

```text
/sdd-specify changes/home-page
```
