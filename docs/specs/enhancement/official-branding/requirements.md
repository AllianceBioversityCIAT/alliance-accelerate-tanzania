# Requirements — Adopt the official ACCELERATE brand

- Spec path: docs/specs/enhancement/official-branding/
- Status: Draft
- Author / Date: AI agent (Claude) with JuanCode — 2026-06-29
- Depth: Standard
- Related: proposal.md (this spec); docs/system-design/design.md §7 (tokens — will change); root CLAUDE.md (token discipline, no hardcoded hex); brand brief PDF + official logo files + palette.

## 1. Summary

Replace the placeholder **maroon `#800000`** identity with the **official ACCELERATE brand**: the real logo lockups and **Royal Blue `#1F4E8C`** as the primary colour. Because the frontend was built tokens-only, the change is primarily a **design-token swap** plus dropping in the official logo + favicon assets and updating the constitutional token table. Behaviour, layout, copy, and data are unchanged — this is colour + brand assets only.

## 2. Requirement Numbering & Writing Standards

- Functional: **`FR-1`…**; non-functional: **`NFR-1`…**. RFC-2119 MUST/SHOULD/MAY. Each atomic, testable, traceable to tasks.

## 3. Functional Requirements

### FR-1: Royal Blue is the product-wide primary colour

- **Description:** The system SHALL render the official Royal Blue (`#1F4E8C`) as the primary brand colour on every primary surface (header/active nav, buttons, links, focus rings, the dashboard KPI hero tile, chart "primary" series, and `seed_company` map markers). Maroon (`#800000`/`#680000`/`#F3E6E6`) MUST NOT appear anywhere in the product.
- **Rationale / Source:** proposal §4; brand palette.
- **Acceptance:**
  - GIVEN any route (home, map, directory, dashboard, about, login, profile) WHEN it renders THEN primary-coloured elements are Royal Blue, not maroon.
  - GIVEN the codebase WHEN scanned THEN no `#800000` / `#680000` / `#F3E6E6` literal remains in shipped source or assets.
- **PII/RBAC impact:** none (visual only).

### FR-2: Official logo in the header

- **Description:** The header SHALL display the official ACCELERATE **colour** logo lockup as the home link, replacing the CSS "A" circle + text wordmark, with an accessible name referencing the project.
- **Rationale / Source:** proposal §4; logo assets.
- **Acceptance:**
  - GIVEN the header WHEN rendered THEN the official colour logo image is shown and links to `/`.
  - GIVEN assistive technology WHEN it reaches the brand link THEN the accessible name identifies "ACCELERATE — Accelerated Variety Turnover for Open-Pollinated Crops" (or equivalent).
  - GIVEN the logo WHEN displayed THEN it remains legible and correctly proportioned at mobile and desktop header heights.

### FR-3: White-reverse logo in the footer

- **Description:** The footer (dark band) SHALL display the official **white-reverse** logo, replacing the text wordmark there, with an accessible name.
- **Rationale / Source:** proposal §4.
- **Acceptance:**
  - GIVEN the footer WHEN rendered on its dark background THEN the white-reverse logo is shown with no opaque/incorrect background and an accessible name.

### FR-4: On-brand favicon and app icons

- **Description:** The favicon and app icons (`icon.svg`, `icon.png`, `apple-icon.png`, `favicon.ico`) SHALL be regenerated on-brand (Royal-Blue brand mark; see OQ-1), replacing the maroon Tanzania silhouette.
- **Rationale / Source:** proposal §4.
- **Acceptance:**
  - GIVEN a browser tab WHEN the site loads THEN the favicon is the on-brand mark (no maroon).
  - GIVEN the static export WHEN built THEN `app/icon.*`, `apple-icon.png`, and `favicon.ico` are present and wired into the document head.

### FR-5: Constitutional token table reflects the official palette

- **Description:** `docs/system-design/design.md §7` SHALL be updated so the documented primary tokens are the official Royal Blue ramp (and any maroon references in PRD/detailed-design corrected), keeping the baseline truthful.
- **Rationale / Source:** proposal §4/§7; CLAUDE.md (tokens are the source of truth).
- **Acceptance:**
  - GIVEN `design.md §7` WHEN read THEN `--color-primary` etc. document the Royal Blue values matching `globals.css`.

### FR-6: Crop colours preserved; accent retained for data-viz

- **Description:** The crop colours (`--crop-sorghum/bean/groundnut` and their `-soft` tints) MUST remain unchanged (they represent the three crops and match the logo icon). The `accent` token (`#008BDB`) SHALL be retained as a secondary/data-viz hue and MUST remain visually distinguishable from the new primary in charts.
- **Rationale / Source:** proposal §6/§10; OQ-2.
- **Acceptance:**
  - GIVEN crop-coloured surfaces (crop cards, crop chart series, crop map markers) WHEN rendered THEN their colours are unchanged.
  - GIVEN the dashboard charts WHEN rendered THEN primary (blue) and accent are distinguishable.

## 4. Non-Functional Requirements

- **NFR-1 (Accessibility — MUST):** All blue-on-white and white-on-blue text/controls meet WCAG 2.1 AA (≥ 4.5:1 normal text; ≥ 3:1 large text / UI components). Focus rings remain visible against new surfaces.
- **NFR-2 (Tokens-only / build — MUST):** No hardcoded hex introduced; the change flows through existing token names. `npm run build` (static export) stays green; full test suite stays green; `tsc`/lint clean.
- **NFR-3 (Reversibility — SHOULD):** The rebrand is revertible by restoring the token values and prior assets (no structural coupling).
- **NFR-4 (Asset quality — MUST):** Logo/favicon assets are web-optimized (appropriately sized, footer logo transparent), served from `public/` and `next/image`-friendly; no oversized payloads.
- **NFR-5 (No regressions — MUST):** Layout, flows, copy, and behaviour are unchanged across all routes (visual-only diff).

## 5. Data & Schema Impact

- **None.** No backend, Prisma, API, or PII changes. Frontend assets + CSS-variable values + one constitutional doc only.

## 6. Out of Scope

- Layout/component/flow/copy redesign; typography/font swap; new partner/funder logos (existing set already meets the brief's equal-weighting guidance); dark-mode rework beyond token coherence; any data/API change.

## 7. Dependencies & Assumptions

- Official logo files provided (`Accelerate Logo 1–4`); palette: Royal Blue `#1F4E8C`, Charcoal `#4A4A4A`, Black, White.
- The white-reverse source is on a black background → a **transparent** white PNG must be produced for the footer.
- No brand web-font supplied → current font stack retained (per brief, type deferred to lead org).
- Deploy via `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`; CloudFront `/*` invalidation covers favicon/logo cache.

## 8. Open Questions

- **OQ-1 (favicon mark) — default assumed:** use a **Royal-Blue brand mark** (prefer the crop-trio icon cropped from the logo; fall back to a Royal-Blue Tanzania silhouette if the icon isn't crisp at 16px). Confirm if a different mark is preferred.
- **OQ-2 (accent) — default assumed:** keep `#008BDB` accent for chart variety. Confirm if it should be retuned/retired.
- **OQ-3 (hover/soft blue values):** proposed `--color-primary-hover: #163A66`, `--color-primary-soft: #E8EEF6`; finalized in design.

## 9. Requirement ID Index

| ID | Title |
|---|---|
| FR-1 | Royal Blue product-wide primary |
| FR-2 | Official logo in header |
| FR-3 | White-reverse logo in footer |
| FR-4 | On-brand favicon / app icons |
| FR-5 | Constitutional token table updated |
| FR-6 | Crop colours preserved; accent retained |
| NFR-1 | WCAG 2.1 AA contrast |
| NFR-2 | Tokens-only; build/tests green |
| NFR-3 | Reversibility |
| NFR-4 | Asset quality |
| NFR-5 | No layout/behaviour regressions |

---

**Conventions reminder:** RBAC roles `Public`/`Staff`/`Admin`; PII = `phone`, `email`. All AWS commands use `--profile IBD-DEV`.
