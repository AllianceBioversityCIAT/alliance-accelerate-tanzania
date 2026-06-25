# Requirements — About Page & Home Content Expansion

- Spec path: docs/specs/enhancement/about-and-home-content/
- Status: Draft
- Author / Date: Leader (SDD triad) / 2026-06-25
- Related: docs/prd.md (project context), docs/system-design/design.md §7 (design tokens), docs/reference/accelerate-web-copy-brief.md, docs/reference/accelerate-project-source-data.md; prior specs `archive/…-home-page`, `archive/2026-06-25-enhancement--portal-animations`

## 1. Summary

The site presents the registry tool but not the ACCELERATE project behind it, and shows no funder/partner branding beyond a single PABRA chip. This spec adds a static **`/about`** page telling the full project story and expands the **home page** with four new sections (About strip, How-it-works, Partners strip, Closing CTA), adds `/about` to header + footer navigation, and introduces an accessible partner/funder **logo wall**. All copy is sourced from the approved web-copy brief; all live registry numbers stay driven by `useMetrics`; partner case-study figures (🟡) appear only on `/about` with attribution. This advances the PRD's credibility/trust goals for a public, donor-funded platform. Pure frontend/content change — no backend, API, or data-model impact.

## 2. Requirement Numbering & Writing Standards

- Functional requirements `FR-1…`; non-functional `NFR-1…`.
- Each requirement is atomic, testable, and traces to the copy brief and downward to `tasks.md`.
- MUST / SHOULD / MAY per RFC 2119.
- Decisions locked at specify time: partner logos = **grayscale logo wall** (text fallback per-logo if a clean asset is unavailable); new ACCELERATE field photo = **`/about` hero**; case-study block = **included, attributed**.

## 3. Functional Requirements

### FR-1: Static About page route
- **Description:** The site MUST provide a new statically-exported page at `/about` rendered inside the existing `PublicShell` (Header + Footer), with no SSR/ISR/route handlers.
- **Rationale / Source:** Copy brief §3, §0.2; proposal §4.1.
- **Acceptance criteria (Given/When/Then):**
  - GIVEN the production static export WHEN a visitor navigates to `/about` THEN the page renders with HTTP 200 and the standard public header and footer.
  - GIVEN any role (Public/Staff/Admin) WHEN the page loads THEN no role-gated or PII content is present (page is fully public).
- **PII/RBAC impact:** None. Public content only; no PII fields referenced.

### FR-2: About page content sections
- **Description:** The `/about` page MUST present, in order, the brief §3 sections: page hero (eyebrow, H1, lede + field photograph), The challenge, A demand-led approach (incl. the three pillars), Crops and value chains, Partners, The model in action (case studies), About this registry (with CTAs to `/map` and `/directory`), and Credits/sources. Copy MUST match the brief's paste-ready strings.
- **Rationale / Source:** Copy brief §3.1–3.8.
- **Acceptance criteria:**
  - GIVEN the `/about` page WHEN rendered THEN exactly one `<h1>` exists and each major section is a landmark `<section>` labelled via `aria-labelledby`.
  - GIVEN the crops section WHEN rendered THEN sorghum, common bean, and groundnut each appear with their representative varieties from the brief.
  - GIVEN the credits section WHEN rendered THEN the Alliance project page is linked and partner case-study figures are attributed as secondary sources.

### FR-3: About page metadata / SEO
- **Description:** The `/about` page MUST export Next.js `metadata` with `title` = "About ACCELERATE — Tanzania Seed Registry" and the brief's meta description (§5).
- **Rationale / Source:** Copy brief §5.
- **Acceptance criteria:**
  - GIVEN the built page WHEN its `<head>` is inspected THEN `<title>` and `<meta name="description">` match the brief §5 strings.

### FR-4: Home — About strip section
- **Description:** The home page MUST include an `AboutStrip` section ("What is ACCELERATE") on the alternating `bg-surface-alt` surface, with the brief §2.3 eyebrow/H2/body/supporting line and a secondary CTA "Read the full story" → `/about`.
- **Rationale / Source:** Copy brief §2.3.
- **Acceptance criteria:**
  - GIVEN the home page WHEN rendered THEN the About strip appears immediately after `MetricsBand` and before `HowItWorks`.
  - GIVEN the section WHEN the CTA is activated THEN it navigates to `/about`.

### FR-5: Home — How-it-works section (3 pillars)
- **Description:** The home page MUST include a `HowItWorks` section with the brief §2.4 eyebrow/H2/intro and a three-card grid (`md:grid-cols-3`) for the pillars Information flow, Marketplace traders, Institutional buyers, reusing the existing reveal-stagger motion pattern.
- **Rationale / Source:** Copy brief §2.4, §4.3.
- **Acceptance criteria:**
  - GIVEN the section WHEN rendered THEN three pillar cards appear with the brief's titles and bodies.
  - GIVEN a viewport ≥ md WHEN rendered THEN the cards lay out in three columns; below md they stack in one column.

### FR-6: Home — Partners strip with logo wall
- **Description:** The home page MUST include a `PartnersStrip` section (brief §2.6) presenting the funder + partner coalition as an accessible **grayscale logo wall** (Alliance of Bioversity & CIAT, PABRA, TARI, TOSCI, CIMMYT, Bill & Melinda Gates Foundation). Logos render grayscale by default and reveal color on hover/focus. Any partner without a clean logo asset MUST fall back to a styled text label.
- **Rationale / Source:** Copy brief §2.6, §4.1; logo decision (specify).
- **Acceptance criteria:**
  - GIVEN the section WHEN rendered THEN each of the six partners is represented by an image with an informative `alt` (accessible name) OR a text label, linking to its official URL with `target="_blank" rel="noopener noreferrer"`.
  - GIVEN a pointer hover or keyboard focus on a logo WHEN the interaction occurs THEN the grayscale treatment resolves to color; reduced-motion/no-hover devices still show an accessible, legible mark.
  - GIVEN reduced-motion preference WHEN the section enters view THEN no motion is required to perceive the logos.

### FR-7: Home — Closing CTA band
- **Description:** The home page MUST include a `ClosingCTA` section (brief §2.7) on a dark surface (`bg-fg text-bg`), with the brief's H2/body and two CTAs: "Explore the Map" → `/map` (primary) and "About the project" → `/about` (secondary on dark).
- **Rationale / Source:** Copy brief §2.7.
- **Acceptance criteria:**
  - GIVEN the home page WHEN rendered THEN the Closing CTA is the last section before the footer.
  - GIVEN the CTAs WHEN activated THEN they navigate to `/map` and `/about` respectively.

### FR-8: Home section composition & order
- **Description:** The home page composition MUST be, in order: `Hero → MetricsBand → AboutStrip → HowItWorks → CropCoverage → PartnersStrip → ClosingCTA`. Existing `Hero`, `MetricsBand`, and `CropCoverage` behavior MUST be preserved (live data unchanged).
- **Rationale / Source:** Copy brief §2.0.
- **Acceptance criteria:**
  - GIVEN the home page WHEN rendered THEN sections appear in the specified order.
  - GIVEN `MetricsBand`/`CropCoverage` WHEN rendered THEN they still consume `useMetrics` and render no hardcoded registry counts.

### FR-9: Navigation — About link
- **Description:** Header (desktop + mobile) and footer navigation MUST include an `About` link to `/about`, with correct active-state handling consistent with existing nav links.
- **Rationale / Source:** Copy brief §0.5, §6.
- **Acceptance criteria:**
  - GIVEN the header WHEN rendered THEN an "About" link to `/about` is present in both the desktop nav and the mobile menu, and shows the active state when on `/about`.
  - GIVEN the footer WHEN rendered THEN an "About" link to `/about` is present.

### FR-10: Footer partner attribution expansion
- **Description:** The footer MUST be expanded from the single PABRA chip to represent the broader coalition (lead implementer Alliance of Bioversity & CIAT, co-lead PABRA, and funder Bill & Melinda Gates Foundation at minimum), each with an accessible name and official link, using token-based styling against the dark footer.
- **Rationale / Source:** Copy brief §2.6, proposal §4.4.
- **Acceptance criteria:**
  - GIVEN the footer WHEN rendered THEN the Alliance, PABRA, and Gates Foundation are each represented with an accessible name and a link opening in a new tab with `rel="noopener noreferrer"`.
  - GIVEN any partner logo WHEN rendered on the dark footer THEN it is legible (placed on a light chip or supplied as a light-on-dark-safe asset); no raw hex is used.

### FR-11: Brand & photo assets
- **Description:** Required brand logos and the ACCELERATE field photograph MUST be added under `frontend/public/`, optimized for web, and referenced via `next/image`. The field photograph MUST be used as the `/about` page hero with informative `alt`; the existing home `Hero` harvest image is unchanged.
- **Rationale / Source:** Supplied assets (Alliance, PABRA existing, Gates, TARI/TOSCI/CIMMYT), field photo; field-photo decision (specify).
- **Acceptance criteria:**
  - GIVEN the `/about` hero WHEN rendered THEN it displays the ACCELERATE field photograph with descriptive `alt` text and AA-contrast for any overlaid text.
  - GIVEN the home `Hero` WHEN rendered THEN it still uses `/hero-harvest.jpg` (unchanged LCP image).

### FR-12: Structured content data
- **Description:** Partner and pillar content SHOULD be expressed as typed content modules (`lib/content/partners.ts`, `lib/content/pillars.ts`) mirroring the existing `crops.ts` pattern, so the strip components map over data rather than hardcoding markup. Crop sub-label enrichment (representative varieties) MAY extend `crops.ts`.
- **Rationale / Source:** Copy brief §4.1, §4.3, §2.5.
- **Acceptance criteria:**
  - GIVEN `partners.ts` WHEN imported THEN it exports the six partners with name, role, url, and optional logo asset path + grayscale flag.
  - GIVEN `pillars.ts` WHEN imported THEN it exports the three pillars with title and body matching the brief.

## 4. Non-Functional Requirements

- **NFR-1 (Design tokens):** All color/spacing/geometry MUST use design tokens from `system-design/design.md §7` (e.g. `primary`, `surface`, `surface-alt`, `fg`, `bg`, `muted`, `border`, `crop-*`). No raw hex. *(Verify: no new hex literals in changed files.)*
- **NFR-2 (Static export):** No SSR/ISR/route handlers. The site MUST continue to build via `next build` static export (`output: 'export'`) and the `/about` route MUST be emitted as a static HTML file.
- **NFR-3 (Responsive):** All new sections MUST be responsive — single-column stacking below `md`, multi-column at `md`+ where specified — with no horizontal overflow at 320px width.
- **NFR-4 (Accessibility, WCAG 2.1 AA):** Each page has exactly one `<h1>`; sections use `aria-labelledby`; all images have informative `alt`; all links/buttons have discernible names; body text uses `fg`/`muted` (not `accent`/`highlight`) to maintain AA contrast; external links use `rel="noopener noreferrer"`. New components MUST pass `jest-axe` with zero violations.
- **NFR-5 (Motion / reduced-motion):** Animated sections MUST reuse the existing `useReveal`/`useCountUp` GSAP layer with the `prefers-reduced-motion` gate; content MUST be fully visible without JS and under reduced-motion (progressive enhancement). No new motion primitives are introduced.
- **NFR-6 (Content fidelity):** Visible copy MUST match the approved brief strings; no invented figures. Live registry numbers come only from `useMetrics`; 🟡 partner case-study figures appear only on `/about` and are attributed (brief §3.8).
- **NFR-7 (Performance):** New imagery MUST be served via `next/image` with appropriate sizing; the home `Hero` LCP image MUST remain unchanged; added assets MUST not regress the static-export build.

## 5. Data & Schema Impact

None. No Prisma models, API fields, or PII fields are added or changed. No additions to the PII allowlist. New "data" is static TypeScript content (`partners.ts`, `pillars.ts`) and image assets only.

## 6. Out of Scope

- Backend / NestJS / API / Prisma / RDS changes.
- New actor records or a varieties reference table (data work — separate spec).
- i18n / ES / FR translations.
- Map or Directory feature changes.
- Visual redesign of existing `Hero`, `MetricsBand`, `CropCoverage` beyond the optional Hero eyebrow/CTA refinement (treated as optional, see Open Questions).

## 7. Dependencies & Assumptions

- Depends on the existing motion layer (`lib/motion/useReveal`, `useCountUp`, `gsap-setup`), `Button`, `PublicShell` layout, and `useMetrics` — all already in `main`/feature branches.
- Brand logo assets must be available as clean, web-optimized files; the supplied combined logo strip may need slicing or official per-partner sourcing (TARI/TOSCI/CIMMYT). Where a clean asset is unavailable, FR-6/FR-10 permit a text-label fallback.
- `docs/reference/` content files should be committed to the repo so the content source of truth is in-tree.
- No AWS resource changes; deployment uses the existing `infra/scripts/deploy-frontend.sh` with `--profile IBD-DEV` (unchanged).
- Process: this spec should be executed on its own branch off `main` after PR #9 (portal-animations) merges.

## 8. Open Questions

- **OQ-1 (Hero refinement):** Apply the optional brief §2.1 Hero eyebrow/CTA tweak ("Learn about ACCELERATE →") or leave Hero copy as-is? *Default: leave Hero as-is; treat refinement as optional polish.*
- **OQ-2 (logo assets):** Final cleanliness of TARI/TOSCI/CIMMYT logo assets — if a usable transparent mark cannot be produced, those partners fall back to text labels per FR-6 (no blocker).

---
**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email` (none involved here). All AWS commands use `--profile IBD-DEV`.

## Requirement ID Index

| ID | Title | Key NFRs |
|---|---|---|
| FR-1 | Static About page route | NFR-2 |
| FR-2 | About page content sections | NFR-4, NFR-6 |
| FR-3 | About page metadata / SEO | NFR-6 |
| FR-4 | Home — About strip | NFR-1, NFR-5 |
| FR-5 | Home — How-it-works (3 pillars) | NFR-3, NFR-5 |
| FR-6 | Home — Partners strip / logo wall | NFR-4, NFR-1 |
| FR-7 | Home — Closing CTA band | NFR-1, NFR-4 |
| FR-8 | Home section composition & order | NFR-6 |
| FR-9 | Navigation — About link | NFR-4 |
| FR-10 | Footer partner attribution expansion | NFR-1, NFR-4 |
| FR-11 | Brand & photo assets | NFR-7, NFR-4 |
| FR-12 | Structured content data | NFR-6 |
