# Design — Home-Page Responsive Typography Scale

- Spec path: docs/specs/enhancement/home-typography-scale/
- Status: Draft
- Author / Date: Leader (SDD) — 2026-06-29
- Related: requirements.md (FR-1..FR-4, NFR-1..4); docs/system-design/design.md §7, §9, §10

## 1. Approach Overview

A token-first, low-risk change in two layers:

1. **Token layer** — extend the fixed-step type scale with two new steps so larger headings stay fully token-traceable. Three edit points kept in sync: `frontend/app/globals.css` (`:root` CSS vars), `frontend/tailwind.config.ts` (`fontSize` map → `var(--text-*)`), and `docs/system-design/design.md §7` (source-of-truth doc).
2. **Component layer** — swap fixed heading utilities for responsive ramps (`text-… sm:… lg:…`) on the hero `h1` and the five section `h2`s, and swap the no-op `bg-primary/10` for `bg-primary-soft` on the five eyebrow pills. Pure className edits — no markup, copy, semantics, or animation hooks (`data-hero-text`, `aria-labelledby`, `id`) change.

This mirrors the rebrand pattern: a token swap plus a small set of class edits cascades the new scale across the page.

## 2. Data Model Changes

None.

## 3. API Surface & Contracts

None.

## 4. Backend Design

None. Frontend-only, static-export safe (no SSR/route handlers).

## 5. Frontend Design

### 5.1 Token additions (FR-1)

`frontend/app/globals.css` — add to the Typography block in `:root`:
```css
--text-5xl: 48px;
--text-6xl: 60px;
```

`frontend/tailwind.config.ts` — extend the `fontSize` map (keeps the existing `var(--text-*)` pattern):
```ts
'5xl': 'var(--text-5xl)',
'6xl': 'var(--text-6xl)',
```

`docs/system-design/design.md §7` — append the two steps to the documented scale line so the doc remains the single source of truth.

> `--text-6xl` (60px) is added for scale completeness (FR-1) but is not applied to any element this round (NFR per proposal §11). Acceptable: it is a documented token, not dead component code.

### 5.2 Responsive heading ramps (FR-2, FR-3)

Token-backed line-height stays via existing `leading-tight`. Breakpoints are Tailwind defaults (design.md §9): `sm` = 640px, `lg` = 1024px.

| Element | File(s) | Before | After |
|---|---|---|---|
| Hero `h1` | `Hero.tsx` | `text-4xl font-bold … tracking-tight` | `text-3xl sm:text-4xl lg:text-5xl font-bold … tracking-tight` |
| Section `h2` | `AboutStrip.tsx`, `HowItWorks.tsx`, `PartnersStrip.tsx`, `ClosingCTA.tsx`, `CropCoverage.tsx` | `text-2xl font-bold …` | `text-2xl lg:text-3xl font-bold …` |

- Hero: 30px (375px) → 36px (`sm`) → 48px (`lg+`). Mobile step capped at 36px to avoid wrap/overflow at 375px (NFR-2).
- Section `h2`: 24px → 36px at `lg`. A single `sm` step is unnecessary; the jump from 24→36 reads cleanly at the `lg` gutter width.
- All other classes on each heading (`font-bold`, `text-fg`, `leading-tight`, `mb-*`, `tracking-tight`) are preserved exactly.

### 5.3 Eyebrow chip fix (FR-4)

Five pills change one token only:
```diff
- bg-primary/10 text-primary
+ bg-primary-soft text-primary
```
Files: `Hero.tsx`, `AboutStrip.tsx`, `CropCoverage.tsx`, `HowItWorks.tsx`, `PartnersStrip.tsx`. `text-primary`, `text-xs font-semibold`, padding, radius, copy unchanged. `bg-primary-soft` already exists as a Tailwind color token backed by `--color-primary-soft` (#E8EEF6).

### 5.5 Brand display font — Montserrat (FR-5)

Mirror the existing Inter wiring (next/font var on `<html>` → token in `globals.css` → Tailwind family). Inter stays the body/UI font; Montserrat becomes the heading/display font.

1. **`frontend/app/layout.tsx`** — load Montserrat alongside Inter:
```ts
import { Inter, Montserrat } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], weight: ['600','700','800'], variable: '--font-montserrat', display: 'swap' });
// <html className={`${inter.variable} ${montserrat.variable}`}>
```

2. **`frontend/app/globals.css`** — add the display token (next to `--font-sans`) and a base-layer rule so *every* heading inherits the display family site-wide automatically (no per-heading family edits needed):
```css
--font-display: var(--font-montserrat), "Montserrat", system-ui, sans-serif;
```
```css
@layer base {
  h1, h2, h3 { font-family: var(--font-display); }
}
```

3. **`frontend/tailwind.config.ts`** — add the family so `font-display` utility exists:
```ts
fontFamily: { sans: ['var(--font-sans)'], display: ['var(--font-display)'] }
```

4. **`docs/system-design/design.md §7`** — document `--font-display` and the brand-font rule (Montserrat ExtraBold titles, SemiBold tagline, Inter body).

**Weight application:**
- The base rule sets only the *family* (no `font-weight`), so it never fights existing weight utilities.
- **Display titles → ExtraBold:** swap `font-bold` → `font-extrabold` on the home hero `h1`, the five home section `h2`s, and the top-level page `<h1>` title on each major route (dashboard, directory, map, admin). Headings not explicitly bumped keep their current weight but still render in Montserrat (family from the base rule) — acceptable brand consistency.
- **Hero tagline → SemiBold:** the hero supporting `<p>` ("A single trusted registry mapping…") gains `font-display font-semibold` (it is a `<p>`, so not covered by the heading base rule — needs the explicit family utility).

### 5.4 Explicitly untouched

- `Hero.tsx:74` `text-3xl` (metric number), `CropCard.tsx` `text-2xl` (stat), `PillarCards.tsx` `text-4xl` watermark + `<h3>` pillar titles — not section titles/eyebrows, left as-is.
- `PillarCards.tsx` `bg-primary/10` icon tile and `text-primary/10` watermark — same no-op family but out of scope (requirements §6), deferred.

## 6. Security & RBAC

No impact. No PII, no auth surface, no API. Public route only.

## 7. Infrastructure / Deployment

No IaC change. If a deploy is requested after merge, use the standard `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh` flow (CLAUDE.md hard constraint). Static export unaffected.

## 8. Decision Records (ADR-style)

### Decision: Fixed-step tokens over fluid `clamp()`
- **Context:** Headings need to scale with viewport.
- **Decision:** Add discrete `--text-5xl/6xl` steps and use Tailwind breakpoint prefixes, rather than CSS `clamp()` fluid typography.
- **Rationale:** Matches the repo's existing fixed-step token scale and the "tokens only / no hardcoded geometry" constraint; `clamp()` introduces viewport-math magic numbers that bypass tokens and make AA sizing less predictable. Smallest reviewable diff.
- **Rejected:** Fluid `clamp()`; inline `lg:` hardcoded px.

### Decision: Hero desktop at 48px (`text-5xl`)
- **Context:** OQ-1 — 48px vs 56px.
- **Decision:** 48px for institutional restraint and safe line-wrapping with the two-column hero.
- **Rejected:** 56px (`--text-6xl` would need applying; risks wrap with the long headline at mid-`lg` widths).

### Decision: Montserrat via next/font + base-layer family rule; Inter stays body
- **Context:** Official brand typography is Montserrat ExtraBold titles / SemiBold tagline (Gotham unavailable). Need it site-wide without editing every heading.
- **Decision:** Load Montserrat through `next/font/google` (same optimised, static-export-safe path as Inter), expose `--font-display`, and apply it to all headings via one `@layer base` rule on `h1,h2,h3`. Bump only the marquee titles to `font-extrabold`. Keep Inter for body/UI/data text.
- **Rationale:** The base rule gives universal heading coverage with zero per-file family churn and no specificity fight (family-only). next/font keeps self-hosted optimised loading — no external CDN request, no FOUT, static-export compatible. Inter on dense registry/table data preserves legibility (Montserrat is wider/heavier).
- **Rejected:** Gotham (commercial license); Montserrat for body too (legibility/size cost on data-dense pages); editing every heading's className (churn, miss-risk).

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Hero headline wraps awkwardly / overflows at 375px | Mobile step capped at `text-3xl` (30px); verify at 375px (NFR-2). |
| Token files drift out of sync (css vs tailwind vs doc) | Single task (T-1) edits all three together; build verifies utilities resolve. |
| Existing tests assert on size | Tests assert text/roles, not font size (confirmed); NFR-3 guards via full `npm test`. |
| `--text-6xl` unused → dead token | Documented token for scale completeness, not component dead code; accepted. |

## 10. Test Plan Outline

- **Build/type:** `cd frontend && npm run build` succeeds with new utilities.
- **Unit:** `cd frontend && npm test` — all home component suites stay green (content/role assertions unaffected).
- **Manual visual:** dev/preview build at 375px, 768px, 1024px, 1440px — confirm hero grows to 48px at `lg`, section `h2`s to 36px, eyebrow chips show the soft-blue background, no horizontal scroll at 375px.
