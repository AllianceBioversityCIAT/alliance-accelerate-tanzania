# Proposal — The Partners band reads as empty white space

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `enhancement/partners-band-density` |
| Proposal date | 2026-08-08 |
| Author | AKILI (Leader) on behalf of JuanCode |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting `/akili-specify` |
| **Depends on** | none — `PartnersStrip.tsx` is untouched by `app-visual-refresh` |
| **Parallel-safe** | **yes** — no overlap with `enhancement/form-elevation-ux` (forms) |
| Suggested depth | **Lite** — one component, no data/API/auth surface, purely presentational |
| Origin | **VF-5**, raised by the user at `app-visual-refresh` T-6's AR-1 visual gate, 2026-08-08. Routed here by user decision rather than into `form-elevation-ux`, which is form-scoped. |

## 2. Problem — measured, not eyeballed

Measured on the live Dev page at 1440 px, 2026-08-08:

| | |
|---|---|
| Section background | `#FFFFFF` (`bg-surface`) — the only pure-white full-bleed band on the home page |
| Neighbour above / below | `#FBF9F6` (**1.051:1**) / `#2A2724` |
| Section height | 694 px |
| Logo ink | 6 logos capped at 40 px → 240 px total (**~35 %**) |
| Side gutters | 80 px (`max-w-7xl` at 1440) |

The user's report was *"this white space"*. The section is 694 px tall and carries 240 px of logo
ink across three labelled tiers.

## 3. Why this surfaced now

**`app-visual-refresh` did not cause it — it removed the camouflage.** `PartnersStrip.tsx:9`
documents `bg-surface` as the intended treatment (FR-6 / `design.md` §5.3), but that choice was
made when `--color-bg` was *also* `#FFFFFF`. The class had no visual consequence then. It does now.

This is the **third** instance of the same pattern from that spec — VF-1 (fieldsets), the
home-section light mass, and this. The refresh is not the defect in any of them.

## 4. The trap this proposal exists to prevent

**Do not fix this with a background token.** Switching `bg-surface` → `bg-surface-alt` moves the
boundary from **1.051:1 to 1.080:1** — still imperceptible, and `app-visual-refresh` recorded the
same dead end for *every* light-section transition on the home page (AboutStrip → HowItWorks
1.080, HowItWorks → CropCoverage **1.000**, CropCoverage → PartnersStrip 1.051).

**Structure in this palette cannot come from background alone.** The levers are logo scale,
vertical rhythm, or an explicit border/rule. A token swap would look like a fix, change nothing
perceptible, and consume a review round.

## 5. Proposed change (constraints, not mechanism)

1. The Partners band SHOULD read as intentionally composed rather than sparse, at 375 / 768 / 1440.
2. **No token *value* changes** — this is a layout and scale problem.
3. Partner logos MUST remain legible and MUST NOT be distorted; the funder/lead/partner tier
   grouping is contractual and MUST survive.
4. Any change MUST be verified by rendered capture, not by computed style — the section's defect is
   compositional and no automated check evaluates it.
5. `alt` text and heading semantics MUST be preserved.

## 6. Out of scope

- The two `bg-fg` dark bands and every other home section.
- Token values (`--color-bg`, `--color-surface`, `--color-surface-alt`).
- Partner logo assets themselves — scale and layout only, no re-cropping or redrawing.

## 7. Open questions for `/akili-specify`

1. Is 694 px the right height with better-composed content, or should the section be shorter?
2. Should the 40 px logo cap rise, and does that risk raster quality on the supplied assets?
3. Does the band want an explicit top/bottom rule, given background alone cannot separate it?

## 8. Evidence

`docs/specs/enhancement/app-visual-refresh/captures/1-home-hero-FULL__*.png` (full-page home at
all three widths) and that spec's `execution.md` → *VF-5*.
