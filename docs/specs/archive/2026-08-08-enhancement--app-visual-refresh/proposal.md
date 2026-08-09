# Proposal — Warm-Earth Surface System (app-wide visual refresh)

## Document Control

| Field | Value |
|---|---|
| **Spec path** | `enhancement/app-visual-refresh` |
| **Slug** | `app-visual-refresh` — derived from the free-text argument ("improve the background and colors in whole app… looks simple all white") |
| **Type** | Change |
| **Approval Mode** | `gated` (no end-to-end mandate given) |
| **Depends on** | none |
| **Parallel-safe** | **no** — re-authors `globals.css` / `tailwind.config.ts`, which every frontend spec touches |
| **Author** | AKILI `/akili-propose` |
| **Date** | 2026-08-07 |
| **Branch** | `enhancement/app-visual-refresh` |
| **Skills applied** | `frontend-design`, `ui-ux-pro-max`, `tailwind-design-system` (for `/akili-specify`) |

---

## Intent

Give the platform visual depth and warmth by re-authoring the **surface, border, ink, elevation and gradient token layer** — without touching a single component file, the brand palette, the typography, or the layout.

The change is small in surface area and large in effect: the codebase has **zero hardcoded colours**, so re-authoring ~12 token values re-skins **231 surface usages** across every screen at once.

---

## Problem / Current Behavior

The app reads as flat and undesigned. That is a measured property of the token layer, not a matter of taste:

| Measurement | Value | Consequence |
|---|---|---|
| `--color-bg` vs `--color-surface` | `#FFFFFF` vs `#FFFFFF` — **1.00:1** | A card is *literally the same colour* as the page. Nothing can sit "on" anything. |
| `--color-surface-alt` vs surface | `#F7F7F7` vs `#FFFFFF` — 1.07:1 | Alternating bands are all but invisible. |
| Shadow tokens | 2 total, at **6%** and **8%** alpha | Elevation is theoretically present and perceptually absent. |
| Gradients in the entire app | **1** (`Hero.tsx:117`) | No atmospheric or transitional surfaces anywhere else. |
| Surface classes in use | 137 `bg-surface` + 82 `bg-surface-alt` + 12 `bg-bg` | 149 of the 231 resolve to pure or near-pure white. |

### The actual disharmony

The palette **already has an earth story** — sorghum `#C9821B`, common bean `#7A3B2E`, groundnut `#8A8D2B` are warm ochre, clay and olive, and `docs/ux-ui/design.md` DD-4 makes them load-bearing brand identity.

Those warm accents sit on a canvas of **pure cold grey**: `#FFFFFF`, `#F7F7F7`, `#E2E2E2`, `#333333`, `#666666` — every neutral in the system is perfectly hue-free. The crop colours therefore read as stickers applied to a spreadsheet rather than as the palette of the product. **Nothing is missing; the neutrals are simply in the wrong temperature.**

### Three pre-existing WCAG AA failures, found while deriving this change

These ship on `main` today. They are **not** regressions introduced here — they surfaced because this change recomputes every contrast pair in the system.

| Site | Pair | Measured | Required |
|---|---|---|---|
| `ImportPreviewTable.tsx:130` | `text-warning` `#C9821B` at **12px** on white | **3.14:1** | 4.5:1 |
| `ImportPreviewTable.tsx:98` | `text-warning` on its own `bg-warning/10` chip | **2.83:1** | 4.5:1 |
| `UsersTable.tsx:282`, `:377` | `text-success` `#2F7D32` on `bg-highlight/20` | **4.35:1** | 4.5:1 |

**Why the harness never caught them (KZ-002).** TRD **QA-11** asserts WCAG 2.1 AA "enforced in frontend tests via `jest-axe`". But `jest-axe` runs under jsdom, which has **no layout or paint engine**, so axe's `color-contrast` rule cannot execute and is silently skipped. QA-11 has been green for a property its harness is structurally incapable of evaluating — exactly the failure class KZ-002 names.

### A token-identity collision

`--color-warning` and `--crop-sorghum` are **the same hex, `#C9821B`**, in both `docs/ux-ui/design.md` §7 and `globals.css`. They are not the same thing:

- `--crop-sorghum` is a **map-marker and legend fill** — non-text, WCAG 1.4.11 threshold **3:1**, and locked by DD-4 as crop identity.
- `--color-warning` is **semantic ink rendered as 12px text** — threshold **4.5:1**.

One value cannot satisfy both. Any fix to the warning contrast that does not decouple these two will silently recolour every sorghum marker on the map.

---

## Proposed Outcome

A visitor lands on any page and sees a **warm sand canvas with white cards lifting off it**, crop colours that belong to the same palette family as their background, and a legible elevation hierarchy. An admin reads a dense table where row bands, sticky columns and status pills separate cleanly. Nothing about the layout, the copy, the navigation or the brand has moved.

### Design direction

| | |
|---|---|
| **Aesthetic name** | *Agronomic Editorial* — institutional restraint on a soil-toned canvas |
| **Dominant tone** | Organic / Natural, held in check by Industrial / Utilitarian (two, per `frontend-design` §3) |
| **Differentiation anchor** | The canvas is **clay-tinted, not grey-tinted**. Screenshot it with the logo removed and it reads as agricultural rather than as a generic civic dashboard. |
| **Inspiration (conceptual)** | Field survey notebooks and agronomic reference charts — warm paper stock, precise data, no ornament |

### Where this proposal deliberately overrides the `frontend-design` skill

The skill lists as **immediate-failure anti-patterns**: "Inter/Roboto/system fonts", "safe palettes", and "symmetrical, predictable sections". This proposal **keeps all three**, because in this repository they are constitutional, not defaults:

- **Inter + Montserrat** are the official ACCELERATE brand fonts (`design.md` §7; set by the archived `enhancement/official-branding` spec). A brand asset is not a lazy font choice.
- **Royal Blue `#1F4E8C`** is the official brand primary from the same spec.
- **`design.md` §1.2 — "Data integrity over decoration"** is a product experience principle. Breaking the grid on a public registry that donors and researchers read for facts would violate the constitution to satisfy a generic style rule.

The distinctiveness the skill demands is therefore taken **entirely out of the surface layer** — temperature, depth and atmosphere — which is the one axis the constitution leaves open. That is the whole thesis of this change.

### DFII assessment (`frontend-design` §2)

| Dimension | Score | Reasoning |
|---|---|---|
| Aesthetic Impact | 3 | Deliberately capped — the constitution mandates restraint. |
| Context Fit | 5 | Earth neutrals are agricultural and pan-African; harmonizes the existing crop palette. |
| Implementation Feasibility | 5 | Token-only. 4 files, 0 components. |
| Performance Safety | 5 | CSS custom properties. No new assets, no JS, no bundle delta. |
| Consistency Risk | **−1** | Tokens are the verified single source of truth; zero hardcoded colours to drift. |
| **DFII** | **17** | Skill's band tops at 15; anything ≥12 is "execute fully". |

---

## Scope

### In scope

| Layer | Change |
|---|---|
| **1 — Surface & ink tokens** | Re-author `--color-bg`, `--color-surface-alt`, `--color-border`, `--color-fg`, `--color-muted`, `--color-restricted-bg` to warm-earth equivalents. `--color-surface` stays `#FFFFFF` so cards read as lifted. |
| **2 — Contrast remediation** | Decouple `--color-warning` from `--crop-sorghum`; darken `--color-warning` and `--color-success` to clear AA as small text. Crop colours unchanged. |
| **3 — Elevation ladder (new)** | Replace the 2 near-invisible shadows with a 4-step warm-tinted ladder (`--shadow-xs/sm/md/lg`). |
| **4 — Gradient & texture tokens (new)** | `--gradient-hero`, `--gradient-band` as tokens, so atmospheric surfaces stop being a one-off in `Hero.tsx`. |
| **5 — Baseline doc sync** | `docs/ux-ui/design.md` §7 token table + the accent-usage contrast note (which must now cover `warning`). |
| **6 — Verification-method fix** | TRD **QA-11**: record that `jest-axe`/jsdom cannot evaluate `color-contrast`, and name the mechanism that actually will. |
| **7 — Stale-comment sweep (KZ-004 + KZ-008)** | 3 comments quote superseded hexes and must move in the same change: `DashboardMapPanel.tsx:51`, `Footer.tsx:2`, and `design.md` §7's contrast note. |

### Proposed token values

All values below are **computed and verified** (see Success Criteria), not estimated.

```css
/* Surface & ink — the whole of the change */
--color-bg:             #FBF9F6;  /* was #FFFFFF — sand canvas */
--color-surface:        #FFFFFF;  /* unchanged — cards now lift off the canvas */
--color-surface-alt:    #F4F0EA;  /* was #F7F7F7 — warm alternating band */
--color-border:         #E6DFD5;  /* was #E2E2E2 — warm hairline */
--color-fg:             #2A2724;  /* was #333333 — earth-dark ink (also the footer surface) */
--color-muted:          #6B6459;  /* was #666666 — warm secondary ink */
--color-restricted-bg:  #F0EBE4;  /* was #F3F3F3 — warm PII chip */

/* Contrast remediation — fixes 3 shipped AA failures */
--color-warning:        #8F5E10;  /* was #C9821B (3.14:1 as 12px text) */
--color-success:        #2A6E2D;  /* was #2F7D32 (4.35:1 on highlight/20) */
--crop-sorghum:         #C9821B;  /* UNCHANGED — decoupled from warning; marker fill, 3:1 */

/* Elevation ladder — warm-tinted, replaces 2 invisible shadows */
--shadow-xs: 0 1px 2px  rgba(61,47,32,.04);
--shadow-sm: 0 2px 4px  rgba(61,47,32,.07);
--shadow-md: 0 6px 16px rgba(61,47,32,.10);
--shadow-lg: 0 16px 40px rgba(61,47,32,.14);

/* Atmosphere */
--gradient-hero: linear-gradient(168deg, #F4F0EA 0%, #FBF9F6 58%, #FFFFFF 100%);
--gradient-band: linear-gradient(180deg, #FBF9F6 0%, #F4F0EA 100%);
```

**Brand tokens explicitly unchanged:** `--color-primary` `#1F4E8C`, `--color-primary-hover`, `--color-primary-soft`, `--color-accent`, `--color-highlight`, `--color-danger`, all three crop colours, `--font-sans` (Inter), `--font-display` (Montserrat), the type scale, and all radius and motion tokens.

---

## Non-Goals

| Not doing | Why |
|---|---|
| Changing fonts | Inter + Montserrat are official brand assets (`design.md` §7). |
| Changing the brand primary or crop colours | Set by the archived `enhancement/official-branding` spec; DD-4 makes crop colours load-bearing. |
| Dark mode | `design.md` §11 defers it to post-v1. Tokens stay authored so a `.dark` scope remains trivial to add. |
| Redesigning any screen, layout or IA | Zero component files change. Screen-level treatment is a separate, later spec. |
| Restyling Leaflet map tiles | Third-party tile imagery; out of the token layer. |
| Multi-country **data** support | PRD §5 lists it out of scope for v1. This change only ensures the *visual identity* is not Tanzania-locked. |
| Rewriting archived specs that quote old hexes | `docs/specs/archive/**` are frozen historical records per root `CLAUDE.md`. |

---

## Affected Users, Systems, And Specs

| Area | Impact |
|---|---|
| **Public visitors** | Every public page re-skins. No behavioral or content change. |
| **Staff / Admin** | Admin console re-skins; three status-pill contrast defects get fixed. |
| **`frontend/app/globals.css`** | Primary edit site — token values. |
| **`frontend/tailwind.config.ts`** | Add `shadow-xs`/`shadow-lg` and gradient token mappings. |
| **`docs/ux-ui/design.md` §7** | Constitutional token table + contrast note. |
| **`docs/trd/trd.md` QA-11** | Verification-method correction. |
| **Components** | **Zero edits.** `ImportPreviewTable`, `ActorsTable`, `UsersTable` inherit their contrast fix from the token change. |
| **Comments quoting hexes** | `DashboardMapPanel.tsx:51`, `Footer.tsx:2` — stale on merge unless swept. |
| **`enhancement/official-branding`** (archived) | Superseded on neutrals only; brand colours it set are preserved. Not rewritten. |

### One non-obvious coupling

`Footer.tsx` uses **`bg-fg` as a dark surface** (`// Dark surface: bg-fg (#333333) + text-bg (#FFFFFF)`). `--color-fg` therefore does double duty as body ink *and* as the footer's background. Changing it to `#2A2724` changes the footer's colour. Verified safe — `#FBF9F6` on `#2A2724` is **14.13:1** — but `/akili-specify` must treat the footer as a surface, not just as text.

---

## Visual Reference

- **Source:** Generated mockup (self-contained HTML; Stitch MCP not required)
- **Location:** `docs/specs/enhancement/app-visual-refresh/mockup/index.html`
- **Notes:** Side-by-side current vs proposed across Home/Hero, metric band, directory cards, admin table (with status pills) and the map filter rail. Uses the **literal token values** above, so approving the mockup approves the implementation. Includes the measured contrast table.

---

## Requirement Delta Preview

### ADDED

- **Elevation ladder:** a 4-step warm-tinted shadow scale replaces the current 2-step.
- **Gradient tokens:** `--gradient-hero` / `--gradient-band` become first-class tokens.
- **Contrast-verification requirement:** a mechanism that can actually evaluate `color-contrast` — jsdom cannot.
- **Token-role separation:** `--color-warning` (semantic ink, 4.5:1) is formally distinct from `--crop-sorghum` (marker fill, 3:1).

### MODIFIED

- **`design.md` §7 token table** — 7 surface/ink values + 2 semantic values re-authored.
- **`design.md` §7 accent-usage note** — currently warns only about `accent` and `highlight`; must also cover `warning`, and state the marker-vs-ink threshold split.
- **TRD QA-11** — response measure corrected to name a harness that can evaluate contrast.
- **`design.md` §11 (dark mode)** — reaffirmed, with the warm tokens documented as the light-scope baseline.

### REMOVED

- Nothing. No token is deleted; no component API changes.

---

## Approach Options

| | **A — Tokens only** | **B — Tokens + depth** ✅ | **C — Tokens + depth + screens** |
|---|---|---|---|
| Re-author surface/ink values | ✅ | ✅ | ✅ |
| Fix the 3 AA failures | ✅ | ✅ | ✅ |
| Elevation ladder + gradients | ❌ | ✅ | ✅ |
| Per-screen visual treatment | ❌ | ❌ | ✅ |
| Files touched | ~3 | **~4** | ~20+ |
| Components touched | 0 | **0** | ~12 |
| Verdict | Leaves shadows at 6–8%. The flatness the user reported is **depth**, not only hue — A does not solve the stated problem. | **Smallest change that actually fixes the reported problem.** | Conflates design-system work with screen redesign; the review surface balloons and regressions get hard to attribute. |

---

## Recommended Approach

**Option B.** It is the smallest change that addresses what was actually reported.

The reasoning that decides it: the user described *two* symptoms — "all white" (hue) and "looks simple" (depth). Option A fixes only the first. Shadows at 6–8% alpha stay invisible on a warm canvas exactly as they are on a white one, so A would ship a warmer app that still looks flat, and the same complaint would return.

Option B stays surgical for a structural reason worth stating: **the token layer is a verified single source of truth.** A grep across `frontend/app` and `frontend/components` finds **zero** hardcoded colour values — the only three hex occurrences are comments. That is what makes a 4-file change able to re-skin 231 surfaces safely, and it is why consistency risk scores −1 in the DFII.

Option C's per-screen work is real and worth doing — but *after* this lands, as its own spec, against a settled token system.

---

## Risks, Dependencies, And Open Questions

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | **A contrast regression ships unnoticed** — the existing a11y harness structurally cannot see contrast (KZ-002). | **High** | Do not extend `jest-axe` and call it covered. `/akili-specify` must add a check that computes ratios from the token values directly (a pure function over the palette, runnable in Jest without a browser) **and** a real-browser spot check. A property the harness cannot evaluate is *not covered*. |
| R-2 | **Warm canvas degrades the marginal accents.** `accent` `#008BDB` (3.67 → 3.50) and `crop-groundnut` `#8A8D2B` (3.54 → 3.37) lose headroom on the new canvas. | Medium | Both are already large-text/UI-only per `design.md` §7 and both stay above 3:1. Must be re-stated explicitly in the §7 note rather than left implicit. |
| R-3 | **The `warning` decoupling silently recolours the map.** A naive fix that edits `#C9821B` in one place changes sorghum markers too. | Medium | Specify the two tokens as separate line items with separate thresholds and a test asserting `--crop-sorghum` is unchanged. |
| R-4 | **Card/canvas separation is subtle** — 1.05:1. It may still read flat on a low-quality or sunlit screen, which is a real deployment condition for field users in Tanzania. | Medium | The mockup exists precisely to judge this on a real screen. Deeper canvas `#F7F3ED` (1.11:1) is pre-computed as the fallback — see OQ-2. |
| R-5 | **Stale comments become lies on merge** (KZ-008). | Low | Sweep all three sites in the same change; a comment asserting a superseded value is a defect of the same class as a missing test. |
| R-6 | Every open frontend branch conflicts on `globals.css`. | Low | Marked `Parallel-safe: no`. Land it alone, rebase others onto it. |

### Open questions

- **OQ-1 — Africa scaling, and what it actually constrains.** The PRD (§5) puts multi-country **data** support out of scope for v1, so this proposal treats "scales to Africa" as a constraint on *visual identity* only: no Tanzanian flag colours, no national motif, no region-locked imagery — warm earth reads agricultural from Senegal to Ethiopia. **Confirm that reading.** If the intent is instead per-country theming (a token scope per country), that is a materially different and larger change, and should be its own spec.
- **OQ-2 — Canvas depth.** `#FBF9F6` (1.05:1 separation) vs `#F7F3ED` (1.11:1). Both hold AA for every ink. Decide from the mockup on a real screen, not from the numbers.
- **OQ-3 — `warning` shade.** `#8F5E10` (worst case 4.86:1, recommended) vs `#94610F` (4.61:1, closer to the original ochre but less headroom). Recommend `#8F5E10`.
- **OQ-4 — Does the elevation ladder need a `dark`-scope plan now?** Warm shadows on a dark canvas need different alphas. Cheap to note in §7 now; expensive to retrofit later.

### Dependencies

- None blocking. No backend, infra, API, or data-model impact. No new package.

### Applicable Kaizen lessons

| ID | How it applies here |
|---|---|
| **KZ-002** | QA-11 passes on a property jsdom cannot evaluate. Drives R-1 and Success Criteria SC-2. |
| **KZ-004** | Three comments and one baseline doc quote superseded hexes; all must move in the same change. Drives Scope item 7. |
| **KZ-008** | `Footer.tsx:2` and `DashboardMapPanel.tsx:51` will assert false values the moment tokens change. |

---

## Success Criteria

| # | Criterion | How it is proven |
|---|---|---|
| **SC-1** | Every ink/surface pair in the system meets its WCAG 2.1 AA threshold — 4.5:1 for small text, 3:1 for non-text UI. | A contrast function computed over the token values, asserted in Jest. **Not** `jest-axe`. |
| **SC-2** | The three shipped failures are fixed: `text-warning` on surface ≥ 4.5:1, `text-warning` on its own chip ≥ 4.5:1, `text-success` on `bg-highlight/20` ≥ 4.5:1. | Named assertions citing the three source sites. |
| **SC-3** | `--crop-sorghum`, `--crop-bean`, `--crop-groundnut`, `--color-primary`, and both font tokens are **byte-identical** to their pre-change values. | Assertion on the token values; diff review. |
| **SC-4** | Card lifts off canvas — `--color-bg` ≠ `--color-surface`, and the shadow ladder has ≥ 4 steps with the lowest ≥ 4% alpha. | Diff review + rendered evidence. |
| **SC-5** | Zero component files changed. | `git diff --stat` shows only `globals.css`, `tailwind.config.ts`, the 2 comment sites, and docs. |
| **SC-6** | `docs/ux-ui/design.md` §7 matches `globals.css` exactly; no document still quotes a superseded value outside `docs/specs/archive/**`. | Grep sweep for each superseded hex. |
| **SC-7** | Gates green: `cd frontend && npm test -- --silent && npm run build && npm run lint`. | Verification commands per root `CLAUDE.md`. |
| **SC-8** | Rendered evidence at 375 / 768 / 1440 px for Home, Directory, Admin actors table, and Map. | Screenshots attached to `execution.md`. A token value is a presence assertion; a screenshot is behavioral proof (KZ-002). |

---

## Next Step

Review `mockup/index.html` on a real screen and settle **OQ-1** (what "scales to Africa" constrains) and **OQ-2** (canvas depth). Then:

```text
/akili-specify enhancement/app-visual-refresh
```

Standard depth. `/akili-specify` should load `tailwind-design-system` for the token work and `ui-ux-pro-max` for the accessibility pass, and must carry R-1 into `tasks.md` as an explicit verification task rather than assuming the existing a11y suite covers contrast.
