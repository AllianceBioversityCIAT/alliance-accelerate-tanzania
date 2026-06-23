# Design — Adopt the PABRA brand color palette

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `changes/brand-palette-pabra` |
| Branch | `feature/brand-palette-pabra` |
| Depth | Standard |
| Traces | requirements.md (FR-1..FR-4, NFR-1..NFR-5) |
| Baseline touched | docs/system-design/design.md §7 (constitutional) |
| Approved intent | proposal.md (Option A) |

## 2. Executive Summary

A token-only rebrand. The platform's color is already centralized in three places — System Design §7 (canonical), `frontend/app/globals.css` (`:root` CSS vars), and `frontend/tailwind.config.ts` (utility mappings). We change the **values** at all three, add a few **new token names** for the brand's distinct hover/accent/alt surfaces, and re-point the handful of component usages that derive a hover/tint by opacity. Everything else re-skins for free. No SSR, no layout, no behavior change.

## 3. Architecture Overview

```
docs/system-design/design.md §7   ── canonical token table (source of truth)
            │  (values mirrored)
            ▼
frontend/app/globals.css :root    ── CSS custom properties (--color-*, --crop-*)
            │  (referenced via var())
            ▼
frontend/tailwind.config.ts       ── theme.extend.colors → Tailwind utilities
            │  (utilities consumed)
            ▼
components/** (Header, Hero, Button, MetricsBand, CropCoverage, StatCard, …)
            └── use bg-primary / text-accent / bg-surface-alt / hover:bg-primary-hover …
```

The only nodes we edit are the top three (token definitions) plus a minimal touch on `Button` (hover wiring). No new architectural surface; static-export purity (NFR-1) is unaffected because nothing here adds server logic.

## 4. Extended Directory Structure

Files changed (no new app files):

```
docs/system-design/design.md            # §7 token table → PABRA values + accent-usage rules (FR-1, FR-4, NFR-2)
frontend/
├── app/globals.css                     # :root token values → PABRA; add new tokens (FR-2, NFR-3)
├── tailwind.config.ts                  # map new tokens: primary.hover, highlight, highlight-soft, surface-alt (FR-2)
└── components/ui/Button.tsx            # hover:bg-primary/90 → hover:bg-primary-hover (FR-3)
```

Optional, only if a section visibly benefits (kept minimal): adopt `bg-surface-alt` on one alternating section and/or `bg-highlight/15` tints where a component currently improvises — not required by any FR.

## 5. Data Model

None. No persisted data, DTO, or schema. The "model" here is the token set:

```css
/* Brand */
--color-primary:        #800000;  /* maroon — primary actions, brand, headings */
--color-primary-hover:  #680000;  /* NEW — dark-maroon hover/active */
--color-primary-fg:     #FFFFFF;
--color-accent:         #008BDB;  /* blue — secondary CTA / links (large/UI only) */
--color-highlight:      #29C4A9;  /* NEW — teal-green highlight/tint backgrounds */
--color-highlight-soft: #82C0C7;  /* NEW — muted teal, soft accent */
/* Neutrals */
--color-bg:             #FFFFFF;
--color-surface:        #FFFFFF;
--color-surface-alt:    #F7F7F7;  /* NEW — alternating section background */
--color-fg:             #333333;
--color-muted:          #666666;
--color-border:         #E2E2E2;
/* Semantic (kept) */
--color-success:        #2F7D32;
--color-warning:        #C9821B;
--color-danger:         #B3261E;
--color-restricted-bg:  #F3F3F3;
/* Crop legend (UNCHANGED) */
--crop-sorghum:  #C9821B;
--crop-bean:     #7A3B2E;
--crop-groundnut:#8A8D2B;
```

> `--color-bean` (legacy alias `#7A3B2E`, duplicate of `--crop-bean`) is left untouched for backward-compat; it is not part of the PABRA brand set and should not be used by new code.

## 6. API Design

None — no endpoints involved.

## 7. Backend Module Design

None — frontend/design-doc only.

## 8. Frontend / UX Component Architecture

| Surface | Token before → after | Mechanism |
|---|---|---|
| Primary CTA (`Button` primary) | `bg-primary` green→maroon; `hover:bg-primary/90` → **`hover:bg-primary-hover`** | One edit in `Button.tsx`; `primary-fg` stays white |
| Secondary CTA (`Button` secondary) | `bg-surface`/`border-border`/`hover:bg-restricted` | Auto (restricted now `#F3F3F3`) |
| Header brand/nav, active state | `text-primary` green→maroon | Auto |
| Hero eyebrow / Live-Registry label | `bg-primary/10`, `text-primary` | Auto (maroon tint) |
| MetricsBand / Footer dark band | `bg-fg text-bg` → `#333` on white | Auto (neutral-dark; maroon variant = OQ-6, out of scope) |
| CropCoverage / CropCard | crop tokens | Unchanged by design |
| Focus rings | `ring-primary` | Auto (maroon ring) |

**Accent-usage rules (FR-4, NFR-2):** `accent` (blue) and `highlight` (teal) are for large text, UI accents, buttons, borders, and tint backgrounds only — never small body text on light. Body text uses `fg`/`muted`. These rules are documented in §7 alongside the tokens.

**Contrast reference (white `#FFFFFF` background):**
- maroon `#800000` ≈ 10.4:1 — passes AA for all text and UI. ✅
- white on maroon ≈ 10.4:1 — passes (primary button label). ✅
- fg `#333` ≈ 12.6:1, muted `#666` ≈ 5.7:1 — pass AA body. ✅
- blue `#008BDB` ≈ 3.6:1 — **large/UI only** (fails small-text AA). ⚠ FR-4
- teal `#29C4A9` ≈ 2.0:1 — **tint/large decorative only**, never text. ⚠ FR-4

## 9. Shared Contracts or Package Extensions

The §7 token set is the shared contract for every spec. This change updates its values and extends it with four token names (`primary-hover`, `highlight`, `highlight-soft`, `surface-alt`). All downstream specs (including the archived `changes/home-page`) consume the new baseline automatically; none require edits.

## 10. Design Decisions

- **DD-1 (Token-value swap at source — proposal Option A):** Change values at §7 + `globals.css` + Tailwind, keep token names stable, add only the brand-specific extras. Smallest blast radius, single source of truth, fully reversible. Rejected: a full semantic ramp/rename (Option B — large diff, unjustified for a color correction) and primary-only (Option C — leaves accents unused, neutrals mismatched).
- **DD-2 (Dedicated `primary-hover` token):** Maroon hover via opacity (`/90`) produces a *lighter* wash, the opposite of the brand's darker hover; a real `#680000` token is correct and reusable. (OQ-4)
- **DD-3 (Success stays green):** Success/error semantics must not read as brand maroon; `success` keeps a dedicated green, `warning` amber, `danger` red. (OQ-3)
- **DD-4 (Clean white base + `surface-alt`):** `bg`/`surface` = `#FFFFFF` with `surface-alt #F7F7F7` for alternating sections, matching PABRA. (OQ-1)
- **DD-5 (Contrast-bounded accents):** Blue/teal are constrained to non-small-text roles to hold AA; documented in §7 and enforced at review. (OQ-2, FR-4)
- **DD-6 (Crop legend untouched):** Crop colors are functional map/chip identifiers, not brand colors; left as-is to preserve map distinguishability.
- **DD-7 (Dark band stays neutral):** MetricsBand/footer remain `bg-fg` (neutral `#333`) to avoid a component change; a maroon band is deferred (OQ-6).

## 11. Risks & Mitigations

- **Accent contrast (primary risk):** mitigated by FR-4 usage rules + the T-4 contrast verification; blue/teal restricted to safe roles.
- **jsdom axe blind spot:** jest-axe in jsdom does not reliably compute color-contrast, so automated tests won't catch a contrast regression — mitigated by an explicit manual/computed contrast check in T-4 (documented ratios in §8).
- **Token drift between §7 and code:** mitigated by doing §7 first (T-1) then mirroring exactly (T-2); reviewer gate compares values.
- **Unintended re-skin of a surface (e.g. dark band readability):** mitigated by the T-3/T-4 visual pass and the contrast table.

## 12. Test Plan Outline

- **Build/export (NFR-1):** `npm run build` static export succeeds, emits `out/`.
- **Token presence (FR-1/FR-2):** grep `globals.css` for each new value (`#800000`, `#680000`, `#008BDB`, `#29C4A9`, `#F7F7F7`) and the Tailwind mappings.
- **No hardcoded color (NFR-4):** hex-grep over `components/**` finds matches only in comments.
- **Regression (NFR-5):** full Jest suite (existing component/unit + jest-axe) stays green.
- **Accessibility (NFR-2):** jest-axe green; plus a documented manual/computed AA contrast check for every text usage of the palette (esp. blue/teal), with corrections or usage-restriction where needed.
- **Visual (FR-3):** run `npm run dev`, confirm maroon primary/CTAs, `#680000` hover, blue/teal accents, white/gray base; no layout/copy change at 360/768/1280.
