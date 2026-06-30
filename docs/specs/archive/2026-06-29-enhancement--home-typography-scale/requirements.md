# Requirements — Home-Page Responsive Typography Scale

- Spec path: docs/specs/enhancement/home-typography-scale/
- Status: Draft
- Author / Date: Leader (SDD) — 2026-06-29
- Related: docs/system-design/design.md §7 (Design Tokens), §9 (Responsive Behavior), §10 (Accessibility); docs/prd.md (public landing experience); proposal.md (this spec)

## 1. Summary

The home-page heading hierarchy uses fixed font sizes with no responsive ramp, so headings read undersized on desktop and cramped on mobile. Additionally, eyebrow label pills use `bg-primary/10`, which compiles to no background on hex CSS-variable tokens, leaving the pills with an invisible chip. This enhancement introduces two new design-token sizes (`--text-5xl`, `--text-6xl`), applies a responsive heading ramp across the home sections, and restores a visible eyebrow chip via the existing `--color-primary-soft` token. It advances the PRD goal of a polished, trustworthy public landing experience for non-technical donors and partners. No copy, layout, or semantics change.

## 2. Requirement Numbering & Writing Standards

- Functional requirements: `FR-1`, `FR-2`, …; non-functional: `NFR-1`, …
- Each requirement is atomic, testable, and traces to a design section and task.
- MUST / SHOULD / MAY per RFC 2119.

## 3. Functional Requirements

### FR-1: Extend the design-token type scale
- **Description:** The system MUST add two larger steps to the typographic token scale — `--text-5xl` (48px) and `--text-6xl` (60px) — defined in both `frontend/app/globals.css` and the Tailwind `fontSize` map, and documented in `docs/system-design/design.md §7`. These MUST be referenced as token-backed Tailwind utilities (`text-5xl`, `text-6xl`), never as raw px.
- **Rationale / Source:** Proposal §4/§8; the current scale caps at `--text-4xl: 36px`, blocking larger headings while staying token-compliant.
- **Acceptance criteria (Given/When/Then):**
  - GIVEN the built CSS, WHEN `text-5xl` is used, THEN it resolves to `var(--text-5xl)` = 48px.
  - GIVEN `design.md §7`, WHEN inspected, THEN it lists `--text-5xl` and `--text-6xl` with their px values.
- **PII/RBAC impact:** None.

### FR-2: Responsive hero headline
- **Description:** The hero `h1` ("The connective tissue of Tanzania's seed system.") MUST scale responsively: a modest size on mobile (≤36px) growing to 48px (`text-5xl`) at the `lg` breakpoint, using token-backed utilities only.
- **Rationale / Source:** Proposal §3/§4; headline looks timid on desktop.
- **Acceptance criteria (Given/When/Then):**
  - GIVEN a 375px viewport, WHEN the home page renders, THEN the hero `h1` is ≤36px and does not overflow horizontally.
  - GIVEN a ≥1024px viewport, WHEN the home page renders, THEN the hero `h1` renders at 48px (`text-5xl`).
- **PII/RBAC impact:** None.

### FR-3: Responsive section titles
- **Description:** Every home section `h2` (in `AboutStrip`, `HowItWorks`, `PartnersStrip`, `ClosingCTA`, `CropCoverage`) MUST scale from 24px on mobile to 36px (`text-3xl`) at `lg`, using token-backed utilities only. Heading semantics (`<h2>`, `id`, `aria-labelledby`) MUST remain unchanged.
- **Rationale / Source:** Proposal §3/§4; section titles ("About the project", "The model") look small.
- **Acceptance criteria (Given/When/Then):**
  - GIVEN a ≥1024px viewport, WHEN a home section renders, THEN its `h2` renders at 36px.
  - GIVEN any viewport, WHEN a home section renders, THEN exactly one `<h2>` with its original `id` exists per section.
- **PII/RBAC impact:** None.

### FR-5: Official brand display font (Montserrat)
- **Description:** The system MUST adopt **Montserrat** as the brand display typeface, loaded via `next/font/google` (static-export safe, self-hosted/optimised) and exposed through a `--font-display` token. Headings site-wide (`h1`, `h2`, `h3` across home, dashboard, directory, map, admin) MUST render in the display font. The primary display **titles** MUST use **ExtraBold (800)** ("Montserrat ExtraBold for the title"). The hero supporting line (tagline) MUST use **Montserrat SemiBold (600)**. Body and UI/data text MUST remain **Inter** (`--font-sans`) for legibility. Gotham is NOT used (commercial license unavailable; Montserrat is the stated primary).
- **Rationale / Source:** Official ACCELERATE brand typography guidance — "Montserrat ExtraBold for the title OR Gotham Bold, and Montserrat SemiBold for the tagline." Supersedes the prior "brand font deferred" note in the official-branding archive.
- **Acceptance criteria (Given/When/Then):**
  - GIVEN any page, WHEN a heading (`h1`/`h2`/`h3`) renders, THEN its computed `font-family` resolves to `var(--font-display)` (Montserrat).
  - GIVEN a primary display title (e.g. hero `h1`, section `h2`), WHEN it renders, THEN its `font-weight` is 800 (ExtraBold).
  - GIVEN the hero supporting line, WHEN it renders, THEN it uses the display font at weight 600 (SemiBold).
  - GIVEN body paragraphs / table / form / data text, WHEN they render, THEN they remain Inter (`var(--font-sans)`).
- **PII/RBAC impact:** None.

### FR-4: Visible eyebrow chip
- **Description:** Every eyebrow pill on the home page (in `Hero`, `AboutStrip`, `CropCoverage`, `HowItWorks`, `PartnersStrip`) MUST render a visible soft-primary chip background by using the `bg-primary-soft` token utility instead of the no-op `bg-primary/10`. Text color, size, padding, and copy remain unchanged.
- **Rationale / Source:** Proposal §3; `/opacity` modifiers compile to nothing on hex CSS-var tokens (verified earlier this session).
- **Acceptance criteria (Given/When/Then):**
  - GIVEN the built CSS, WHEN an eyebrow pill renders, THEN its background resolves to `var(--color-primary-soft)` (#E8EEF6) and is visibly distinct from the page background.
  - GIVEN any eyebrow pill, WHEN inspected, THEN its label text and color are unchanged from before.
- **PII/RBAC impact:** None.

## 4. Non-Functional Requirements

- **NFR-1 (Tokens only):** No raw hex or px values may be introduced in component classes or token definitions beyond the two new scale steps; all sizes MUST resolve to design tokens (design.md §7, CLAUDE.md hard constraint).
- **NFR-2 (Accessibility — WCAG 2.1 AA):** Heading contrast MUST remain AA (`--color-fg` on white). Larger sizes MUST NOT introduce horizontal scroll at 375px. Heading order/semantics MUST stay intact (one `h1`, section `h2`s).
- **NFR-3 (No regressions):** Existing home component tests MUST stay green; `npm run build` MUST succeed. Copy, layout structure, and reveal animations MUST be unchanged.
- **NFR-4 (Responsive):** Sizes MUST use Tailwind breakpoint prefixes (`sm`/`lg`) per design.md §9 defaults; no custom breakpoints.

## 5. Data & Schema Impact

None. No entities, fields, or API contracts change. No PII impact.

## 6. Out of Scope

- **Brand-font scope clarification (FR-5):** the display font applies to headings site-wide and the hero tagline; body/UI/data text stays Inter. Re-typesetting body copy in Montserrat is explicitly out of scope.
- Copy/wording changes.
- Section/layout restructuring or animation changes.
- Typography on dashboard, map, directory, admin, or other non-home routes.
- A brand web-font (deferred to lead org).
- Body/paragraph text resizing.
- **Noted but out of scope:** `PillarCards` icon-tile `bg-primary/10` and the decorative `text-primary/10` watermark numbers share the same opacity-on-hex-var no-op; they are not headings/eyebrows and are left for a separate follow-up.

## 7. Dependencies & Assumptions

- Depends only on existing token files (`globals.css`, `tailwind.config.ts`) and the existing `--color-primary-soft` token (already present).
- No AWS/backend changes. Deployment (if requested) uses the standard frontend deploy with `--profile IBD-DEV`.
- Assumes the home-page spec it extends is already archived (no active-spec conflict).

## 8. Open Questions

- **OQ-1:** Desktop hero size — 48px (`text-5xl`, recommended for institutional restraint) vs 56px. Default to 48px unless changed at approval.

---
**Conventions reminder:** RBAC roles `Public`/`Staff`/`Admin`; PII = `phone`, `email`. No PII or AWS changes in this spec.
