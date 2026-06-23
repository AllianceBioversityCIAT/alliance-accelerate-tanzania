# Proposal — Adopt the PABRA brand color palette

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `changes/brand-palette-pabra` |
| Type | Change (design-token / brand) |
| Status | Draft — awaiting approval |
| Author / Date | JuanCode / 2026-06-22 |
| Branch (suggested) | `feature/brand-palette-pabra` |
| Source of truth touched | `docs/system-design/design.md §7` (constitutional baseline) |
| Reference | Live palette extracted from pabra-africa.org (Divi theme CSS) |

## 2. Intent

Replace the current agriculture-green design-token palette with the **PABRA Africa brand palette** so the platform reflects the correct institutional identity. The change is made at the **System Design §7 token baseline** so it propagates to every screen (current and future) automatically, with no per-component restyle.

## 3. Problem / Current Behavior

The design system was bootstrapped with a provisional "earth + growth" palette — **green primary `#2F7D32`**, groundnut-amber accent `#C9821B`, warm off-white base. This was a placeholder, not the PABRA brand. The home page (now built and archived under `changes/home-page`) renders green CTAs, green hero tint, and warm neutrals — visually off-brand.

Current §7 brand/semantic tokens:

| Token | Current value |
|---|---|
| `--color-primary` | `#2F7D32` (green) |
| `--color-accent` | `#C9821B` (amber) |
| `--color-bg` | `#FAFAF7` (warm off-white) |
| `--color-fg` | `#1C1F1A` |
| `--color-muted` | `#5F665B` |
| `--color-border` | `#E3E5DE` |
| `--color-success / warning / danger` | `#2F7D32 / #C9821B / #B3261E` |

## 4. Proposed Outcome

The token baseline expresses the PABRA identity: **maroon `#800000`** as the primary brand color (buttons, headings, key surfaces), with **blue `#008bdb`** and **teal-green `#29c4a9`** as accents on a clean **white + neutral-gray** base. Every component that already consumes tokens (Header, Hero, Button, MetricsBand, CropCoverage, StatCard, footer, …) re-skins automatically. **Crop legend colors are intentionally unchanged** (they remain functional, crop-specific map/chip colors).

### Proposed §7 token mapping (PABRA)

| Token | Current → New | PABRA role |
|---|---|---|
| `--color-primary` | `#2F7D32` → **`#800000`** | Maroon — primary actions, brand, headings |
| `--color-primary-hover` *(new)* | — → **`#680000`** | Dark-maroon hover/active (replaces ambiguous `/90` opacity) |
| `--color-primary-fg` | `#FFFFFF` → `#FFFFFF` | Text on maroon (unchanged) |
| `--color-accent` | `#C9821B` → **`#008BDB`** | Blue — secondary accent / links |
| `--color-highlight` *(new)* | — → **`#29C4A9`** | Teal-green — highlight backgrounds & tints (`rgba(41,196,169,.15)`) |
| `--color-highlight-soft` *(new, optional)* | — → **`#82C0C7`** | Muted teal — soft accent text |
| `--color-bg` | `#FAFAF7` → **`#FFFFFF`** | Clean white page base *(see OQ-1)* |
| `--color-surface` | `#FFFFFF` → `#FFFFFF` | Cards (unchanged) |
| `--color-surface-alt` *(new)* | — → **`#F7F7F7`** | Alternating section background |
| `--color-fg` | `#1C1F1A` → **`#333333`** | Primary body text |
| `--color-muted` | `#5F665B` → **`#666666`** | Secondary text |
| `--color-border` | `#E3E5DE` → **`#E2E2E2`** | Borders / dividers |
| `--color-success` | `#2F7D32` → `#2F7D32` | **Keep green** (success ≠ brand maroon) *(OQ-3)* |
| `--color-warning` | `#C9821B` → `#C9821B` | Keep amber |
| `--color-danger` | `#B3261E` → `#B3261E` | Keep red |
| `--color-restricted-bg` | `#F1F0EA` → **`#F3F3F3`** | PII "restricted" chip background (neutral) |
| `--crop-sorghum / bean / groundnut` | unchanged | Crop legend stays functional *(per decision)* |

## 5. Scope

- Update the canonical token values in **`docs/system-design/design.md §7`** (brand + neutral + semantic; crop legend untouched).
- Mirror those values in **`frontend/app/globals.css`** (`:root` CSS vars) and wire any **new** token names into **`frontend/tailwind.config.ts`**.
- Re-point the few components that reference a *hover tint by opacity* to the new `--color-primary-hover` token (e.g. `Button` `hover:bg-primary/90` → `hover:bg-primary-hover`) and adopt `surface-alt`/`highlight` where a section currently improvises.
- Re-verify **WCAG AA contrast** (NFR-3) and rebuild/static-export + run the test suite.
- Keep the dark-mode override path intact (tokens authored so a future `.dark` scope still works).

## 6. Non-Goals

- No change to crop legend colors, layout, copy, components' structure, IA, or behavior.
- No new pages, features, or backend work.
- No dark theme authored now (only keep the override path valid).
- No retroactive edit to the **archived** `changes/home-page` spec docs (historical record; its comments cite old hex by design).
- No logo/photography/asset work.

## 7. Affected Users, Systems, And Specs

- **Users:** all public visitors and staff/admin — purely visual.
- **Constitutional doc:** `docs/system-design/design.md §7` (baseline for every spec).
- **Code:** `frontend/app/globals.css`, `frontend/tailwind.config.ts`; minor token-wiring touch-ups in `components/ui/Button.tsx` and any section using an improvised tint/hover. All token-consuming components re-skin with no logic change.
- **Specs:** `changes/home-page` (archived) renders with the new palette automatically; no edit needed. Future specs inherit the new baseline.
- **Tests:** `home-a11y.test.tsx` (jest-axe) and component tests should stay green (they assert structure/values, not specific hex). Real-world contrast for the blue/teal accents needs manual confirmation (jsdom axe does not reliably compute contrast).

## 8. Requirement Delta Preview

### ADDED
- New tokens: `--color-primary-hover` (`#680000`), `--color-highlight` (`#29C4A9`), `--color-surface-alt` (`#F7F7F7`), optionally `--color-highlight-soft` (`#82C0C7`).

### MODIFIED
- System Design §7 token *values* for `primary`, `accent`, `bg`, `fg`, `muted`, `border`, `restricted-bg`.
- NFR-4 (design tokens) continues to hold — the *rule* is unchanged; only the canonical values move. NFR-3 (accessibility/contrast) must be re-validated against the new palette.
- `Button` hover wiring (opacity tint → `primary-hover` token).

### REMOVED
- None. (No tokens deleted; crop palette and semantic success/warning/danger retained.)

## 9. Approach Options

**Option A — Swap values at source, keep names stable (Recommended).**
Change §7 token *values* + `globals.css`; add the 2–3 brand-specific tokens (hover, highlight, surface-alt); re-point only the handful of opacity-hover/improvised-tint usages. *Pros:* smallest blast radius, near-zero component churn, single source of truth, fully reversible. *Cons:* introduces a few new token names to learn.

**Option B — Restructure into a semantic scale.**
Introduce `primary/secondary/tertiary` + numbered ramps (50–900) and a full semantic system. *Pros:* most future-proof, supports theming/states richly. *Cons:* large diff, touches many components, heavier review — overkill for a brand-color correction.

**Option C — Minimal (primary only).**
Only set `primary` → maroon; leave neutrals/accents. *Pros:* tiny. *Cons:* leaves blue/teal brand accents unused and neutrals mismatched (warm base vs PABRA clean white) — an incomplete, still-off-brand result.

## 10. Recommended Approach

**Option A.** It is the smallest safe path that delivers a complete, correct rebrand: the token architecture (NFR-4) already centralizes color, so swapping values at §7 + `globals.css` re-skins the whole app, while the 2–3 added tokens capture the brand's distinct hover and accent surfaces. Fully reversible by reverting the token block.

## 11. Risks, Dependencies, And Open Questions

- **Contrast (NFR-3) — primary risk.** Maroon `#800000` on white ≈ 10.4:1 (excellent; white-on-maroon equally strong). But **blue `#008BDB` ≈ 3.6:1** and **teal `#29C4A9` ≈ 2.0:1** on white **fail AA for normal body text** — they are safe only for large text, UI accents, buttons, and tint backgrounds (which matches PABRA's own usage). Specify usage rules so accents never carry small body text.
- **OQ-1 (page base):** pure white `#FFFFFF` + `#F7F7F7` alternating sections (PABRA-accurate, recommended), or retain a subtle warm off-white? 
- **OQ-2 (accent roles):** confirm blue = secondary CTA/links and teal = highlight/tint only (not interchangeable), given the contrast limits.
- **OQ-3 (success semantics):** keep `success` green even though brand primary is now maroon? (Recommended — success/error semantics shouldn't be maroon.)
- **OQ-4 (hover):** add `--color-primary-hover #680000` (recommended) vs. keep an opacity tint (which on maroon yields a *lighter* wash, not the brand's darker hover).
- **OQ-5 (restricted chip):** move PII restricted-bg to neutral `#F3F3F3` or keep the warm `#F1F0EA`?
- **Dependency:** none external. AWS not involved (any later deploy still uses `--profile IBD-DEV`).

## 12. Success Criteria

- `docs/system-design/design.md §7` shows the PABRA token table; `globals.css` + `tailwind.config.ts` match it; no component hardcodes hex (NFR-4 holds; raw hex only in comments).
- Home page renders maroon primary + CTAs, blue/teal accents, clean neutral base — verified in `npm run dev` and the static export.
- `npm run build` (static export) + full Jest suite pass; lint clean.
- AA contrast re-verified for all *text* usages of the new palette; accent usage rules documented in §7.
- Dark-mode override path still valid; crop legend unchanged.

## 13. Next Step

```text
/sdd-specify changes/brand-palette-pabra
```
