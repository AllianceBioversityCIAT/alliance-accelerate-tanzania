# Proposal — Home-Page Responsive Typography Scale

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `enhancement/home-typography-scale` |
| Proposal date | 2026-06-29 |
| Author | Leader (SDD) on behalf of JuanCode |
| Status | Draft — awaiting approval |
| Depth | Lite |

## 2. Intent

Make home-page section headings and eyebrow labels feel deliberate and well-proportioned across all viewports — larger and more confident on desktop, comfortably legible on mobile — by introducing a **responsive type scale** instead of today's fixed sizes. All changes stay token-driven (no hardcoded geometry).

## 3. Problem / Current Behavior

Every home-page heading is a **single fixed size from 375px to 1440px+** — there is no `sm:`/`lg:text-` ramp anywhere in `frontend/components/home/`. The result reads timid on desktop and cramped on mobile.

| Element | Example copy | Current class | Computed |
|---|---|---|---|
| Hero eyebrow pill | "Institutional seed-system intelligence" | `text-xs font-semibold` + `bg-primary/10` | **12px**, **no visible chip background** |
| Hero headline (`h1`) | "The connective tissue of Tanzania's seed system." | `text-4xl font-bold` | **36px**, flat |
| Section eyebrow pills | "Value chains", "Partners" | `text-xs font-semibold` + `bg-primary/10` | **12px**, **no visible chip background** |
| Section titles (`h2`) | "About the project", "The model" | `text-2xl font-bold` | **24px**, flat |

Two distinct defects:

1. **No responsive scale.** Headings never grow on larger screens; a 36px hero and 24px section titles look undersized on desktop.
2. **Invisible eyebrow chip.** Eyebrow pills use `bg-primary/10`. As established earlier this session, the `/opacity` modifier compiles to **nothing** on hex CSS-variable tokens (verified: 0 occurrences in built CSS), so the pills render as bare tiny text with no background. The `--color-primary-soft` token already exists for exactly this purpose and is unused here.

## 4. Proposed Outcome

A coherent responsive heading hierarchy, token-driven:

| Element | Mobile | Desktop (`lg+`) |
|---|---|---|
| Hero headline (`h1`) | ~30–36px | **48–56px** |
| Section title (`h2`) | 24–28px | **36px** |
| Eyebrow pill | 12px text, **visible** `--color-primary-soft` chip | same |

The current token scale stops at `--text-4xl: 36px`, so going larger while staying token-compliant **requires adding two steps** (`--text-5xl`, `--text-6xl`) to both `design.md §7` and `globals.css`.

## 5. Scope

- Add `--text-5xl` (48px) and `--text-6xl` (60px) to the design-token scale: `docs/system-design/design.md §7` + `frontend/app/globals.css` + Tailwind `fontSize` config if explicitly mapped.
- Apply a responsive heading ramp to home-page sections: Hero `h1`, and the `h2` in `AboutStrip`, `HowItWorks`, `PartnersStrip`, `ClosingCTA`, plus any other `components/home/*` section title.
- Replace `bg-primary/10` on eyebrow pills with the explicit `bg-primary-soft` token so the chip background is visible.
- Keep existing copy, semantics (`h1`/`h2`/`aria-labelledby`), and reveal animations unchanged.

## 6. Non-Goals

- No copy/wording changes.
- No restructuring of sections, layout, or component hierarchy.
- No changes to dashboard, map, directory, or admin typography (home page only this round).
- No new brand web-font (still deferred to lead org).
- No body-text or paragraph size changes.

## 7. Affected Users, Systems, And Specs

- **Users:** all public visitors landing on `/`.
- **Files:** `frontend/app/globals.css`, `frontend/tailwind.config.ts` (only if font sizes are explicitly enumerated there), `docs/system-design/design.md §7`, and `frontend/components/home/{Hero,AboutStrip,HowItWorks,PartnersStrip,ClosingCTA,...}.tsx`.
- **Specs:** extends the home-page spec already archived; no conflict with active specs (`general-setup` only).
- **Tests:** existing home component tests assert text content and roles, not font sizes — expected to stay green.

## 8. Requirement Delta Preview

### ADDED Requirements

- The design-token scale SHALL include `--text-5xl` (48px) and `--text-6xl` (60px).
- Home-page headings SHALL scale responsively between mobile and `lg+` breakpoints using token-backed sizes.

### MODIFIED Requirements

- Eyebrow pills SHALL render a visible soft-primary chip background via `--color-primary-soft` (replacing the no-op `bg-primary/10`).
- Hero `h1` and section `h2` headings change from fixed to responsive sizes.

### REMOVED Requirements

- None.

## 9. Approach Options

**Option A — Responsive ramp on existing Tailwind size utilities (recommended).**
Add `--text-5xl`/`--text-6xl` tokens, then apply `text-3xl sm:text-4xl lg:text-5xl`-style ramps to each heading and swap eyebrow chips to `bg-primary-soft`. Smallest, most explicit, fully token-aligned, trivially reviewable per-file.

**Option B — CSS `clamp()` fluid typography.**
Define fluid heading sizes with `clamp(min, vw, max)` in `globals.css`. Smoother scaling but introduces viewport-math magic numbers that fight the "tokens only / no hardcoded geometry" constraint and the existing fixed-step scale; harder to keep AA-predictable.

**Option C — Do nothing / hardcode a couple of `lg:` overrides inline.**
Rejected: leaves the scale capped at 36px or bypasses tokens.

## 10. Recommended Approach

**Option A.** It matches the repo's existing fixed-step token system, keeps every size traceable to a token, is the smallest reviewable diff, and cascades like the rebrand did. The eyebrow fix rides along since it's the same family of heading/label polish.

## 11. Risks, Dependencies, And Open Questions

- **Risk:** larger hero on very small phones could wrap awkwardly — mitigate by keeping the mobile step modest (≤36px) and verifying at 375px.
- **Risk:** `--text-6xl` may be unused this round; add it for scale completeness but only apply up to `5xl` unless a heading needs it.
- **Dependency:** none beyond the existing token files.
- **Open question:** exact desktop hero size — 48px vs 56px. Recommend **48px (`text-5xl`)** for institutional restraint; confirm during `/sdd-specify`.

## 12. Success Criteria

- Hero `h1` and section `h2`s visibly grow at `lg+` and remain legible at 375px.
- Eyebrow pills show a visible soft-blue chip background.
- All sizes resolve to design tokens; no raw px in component classes.
- `npm test` stays green; `npm run build` succeeds.
- Verified on the live/preview build at mobile + desktop widths.

## 13. Next Step

```text
/sdd-specify enhancement/home-typography-scale
```
