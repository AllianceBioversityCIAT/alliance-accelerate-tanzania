# Requirements — Adopt the PABRA brand color palette

- Spec path: docs/specs/changes/brand-palette-pabra/
- Status: Draft
- Author / Date: JuanCode / 2026-06-22
- Depth: Standard
- Related: proposal.md (approved Option A); docs/system-design/design.md §7 (token baseline), §10 (a11y), §11 (dark mode); changes/home-page (archived — re-skins automatically)

## Document Control

| Field | Value |
|---|---|
| Branch | `feature/brand-palette-pabra` |
| Approved intent | `proposal.md` (Option A — swap token values at source, keep names stable) |
| Supersedes | the provisional agriculture-green token values in System Design §7 |
| Locked decisions | crop colors unchanged · update §7 baseline · page base white+`#F7F7F7` alt · dedicated `#680000` hover · success stays green |

## 1. Summary

Replace the platform's provisional agriculture-green design-token palette with the **PABRA Africa brand palette** at the **System Design §7 token baseline**, so every current and future screen re-skins from a single source of truth with no per-component restyle. Primary becomes maroon `#800000` (dark-maroon `#680000` hover), with blue `#008BDB` and teal-green `#29C4A9` accents on a clean white + neutral-gray base. Crop legend colors and all semantic success/warning/danger affordances are retained. This is a **visual-only** change: no behavior, layout, copy, IA, or backend impact.

## 2. Glossary

- **Token baseline:** the canonical color/typography/geometry tokens in `docs/system-design/design.md §7`, mirrored as CSS variables in `frontend/app/globals.css` and mapped in `frontend/tailwind.config.ts`.
- **Brand tokens:** `primary`, `primary-hover`, `accent`, `highlight`, `highlight-soft`.
- **Semantic tokens:** `success`, `warning`, `danger`, `restricted-bg`.
- **Crop legend:** the crop-specific map/chip colors (`crop-sorghum`, `crop-bean`, `crop-groundnut`) — out of scope for change.
- **Accent text limit:** blue/teal accents fail WCAG AA contrast for small body text on white; usable only for large text, UI accents, buttons, and tint backgrounds.

## 3. System Context & Scope

The design system already centralizes color through tokens (NFR-4 across the platform). This spec changes only token **values** at §7 + `globals.css`, adds a small number of brand-specific token **names** (`primary-hover`, `highlight`, `highlight-soft`, `surface-alt`) wired into Tailwind, and re-points the few component usages that derive a hover/tint by opacity rather than a token. All token-consuming components inherit the new palette automatically.

**In scope:** §7 token table; `globals.css` CSS vars; `tailwind.config.ts` mappings; minimal component token-wiring (notably `Button` hover); accent-usage rules; AA contrast re-verification; preserve the dark-mode override path.
**Out of scope:** see §6.

## 4. Requirement Numbering & Writing Standards

Functional requirements are `FR-<n>`; non-functional `NFR-<n>`. Each is atomic and testable, with MUST/SHOULD/MAY strength. Scenarios use GIVEN/WHEN/THEN.

## 5. Stakeholders / Personas

| Persona | Role | Interest |
|---|---|---|
| Public visitor | `Public` | Sees the correct PABRA institutional identity; unchanged behavior. |
| Staff / Admin | `Staff`/`Admin` | Same — consistent brand across authenticated surfaces. |
| Future spec implementers | — | Inherit the corrected §7 baseline; no per-spec color decisions. |

## 6. Functional Requirements

### FR-1: PABRA token baseline in System Design §7
System Design §7 MUST define the PABRA brand palette as the canonical token values: `primary #800000`, `primary-hover #680000`, `primary-fg #FFFFFF`, `accent #008BDB`, `highlight #29C4A9`, `highlight-soft #82C0C7`, `bg/surface #FFFFFF`, `surface-alt #F7F7F7`, `fg #333333`, `muted #666666`, `border #E2E2E2`, `success #2F7D32`, `warning #C9821B`, `danger #B3261E`, `restricted-bg #F3F3F3`. Crop legend tokens MUST remain unchanged.
- Source: proposal.md §4; System Design §7.

#### Scenario: §7 reflects the brand
- GIVEN the System Design token table
- WHEN it is read after this change
- THEN every brand/neutral/semantic token shows its PABRA value above
- AND `crop-sorghum/bean/groundnut` retain their current values.

### FR-2: Tokens applied in the frontend (CSS vars + Tailwind)
`frontend/app/globals.css` `:root` MUST set every token to its §7 value, and `frontend/tailwind.config.ts` MUST expose the new token names (`primary.hover`, `highlight`, `highlight-soft`, `surface-alt`) as Tailwind utilities mapped via `var(--…)`.
- Source: proposal.md §5; System Design §7; DD-5.

#### Scenario: Utilities resolve to brand values
- GIVEN the rebuilt frontend
- WHEN a component uses `bg-primary`, `hover:bg-primary-hover`, `text-accent`, `bg-highlight`, or `bg-surface-alt`
- THEN the rendered color is the corresponding PABRA token value.

### FR-3: Token-consuming UI re-skins with no hardcoded color
All existing components MUST present the new palette purely by consuming tokens — no component may hardcode a color value (raw hex permitted only in comments). The maroon primary, `#680000` hover, blue/teal accents, and neutral base MUST be visible on the home page without changing component structure, layout, or copy.
- Source: proposal.md §4–§6; System Design §7 (NFR-4 platform rule).

#### Scenario: Home page shows the brand
- GIVEN the home page rendered after this change
- WHEN a visitor views it
- THEN primary CTAs and brand surfaces are maroon, hover is dark maroon, accents are blue/teal, and the base is clean white/gray
- AND no layout, copy, or behavior has changed.

### FR-4: Accent usage rules (contrast-safe)
The blue (`accent`) and teal (`highlight`) accents MUST be used only where they meet WCAG AA — i.e. for large text, UI accents, buttons, borders, and tint backgrounds — and MUST NOT be used as the color of small body text on a light surface. §7 MUST document this rule.
- Source: proposal.md §11 (OQ-2); System Design §10.

#### Scenario: Accent never carries small body text
- GIVEN any text styled with `text-accent` or `text-highlight`
- WHEN it is reviewed
- THEN it is large/heading text or a UI accent, never small body copy on a light background.

## 7. Non-Functional Requirements

- **NFR-1 (Static export preserved):** The change MUST NOT introduce SSR/ISR/route handlers; `next build` static export MUST still succeed and emit `out/`.
- **NFR-2 (Accessibility — AA contrast):** All **text** usages of the new palette MUST meet WCAG 2.1 AA contrast (≥4.5:1 normal, ≥3:1 large/UI). Maroon-on-white and white-on-maroon pass; blue/teal text usages MUST be verified and corrected or restricted per FR-4. The jest-axe suite MUST remain green.
- **NFR-3 (Dark-mode path preserved):** Tokens MUST remain authored so a future `.dark` scope can override them; no dark theme is authored now.
- **NFR-4 (Tokens only):** No hardcoded color values may bypass the tokens (raw hex only in comments).
- **NFR-5 (No behavioral/visual-structure regression):** No change to layout, spacing, typography scale, copy, IA, component APIs, or behavior — color values only. Existing component/unit tests MUST stay green.

## 8. Data & Schema Impact

None. No database, API, or persisted-data change. No PII involved.

## 9. Out of Scope

- Crop legend colors (`crop-sorghum/bean/groundnut`) — unchanged.
- Layout, spacing, typography scale, radii, shadows, copy, IA, components' structure or behavior.
- Authoring a dark theme (only keep the override path valid).
- Editing the archived `changes/home-page` spec docs (historical record; re-skins automatically at runtime).
- Logo, photography, or other brand assets.
- Any backend or infra change.

## 10. Open Questions

- OQ-1 (resolved): page base = white `#FFFFFF` + `#F7F7F7` alt sections.
- OQ-2 (resolved): blue = secondary CTA/links; teal = highlight/tint only (FR-4).
- OQ-3 (resolved): success stays green `#2F7D32`.
- OQ-4 (resolved): dedicated `--color-primary-hover #680000`.
- OQ-5 (resolved): restricted-bg = neutral `#F3F3F3`.
- OQ-6 (open, low): should the dark MetricsBand/footer (`bg-fg`, now `#333`) instead use maroon (`bg-primary`) for brand pop? Default: keep neutral-dark (token-driven, no component change); a maroon band is a future enhancement.

## 11. Requirement ID Index

| ID | Title | Covered by task |
|---|---|---|
| FR-1 | PABRA token baseline in §7 | T-1 |
| FR-2 | Tokens applied (CSS vars + Tailwind) | T-2 |
| FR-3 | UI re-skins, no hardcoded color | T-3 |
| FR-4 | Accent usage rules (contrast-safe) | T-1, T-4 |
| NFR-1 | Static export preserved | T-3, T-4 |
| NFR-2 | AA contrast | T-1, T-4 |
| NFR-3 | Dark-mode path preserved | T-2 |
| NFR-4 | Tokens only | T-2, T-3 |
| NFR-5 | No behavioral/visual-structure regression | T-3, T-4 |
