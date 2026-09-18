# T-6 rendered evidence

Captured **2026-08-08** against the Dev CloudFront origin `https://d3idqvvg0xa1r7.cloudfront.net`
at commit `981ce5f` (working tree clean). Full analysis is in `../execution.md` →
*T-6 — round 2*. This directory is the evidence, not the argument.

## Files

`<surface>__<width>.png` — nine surfaces at 375 / 768 / 1440.

| # | Surface | Notes |
|---|---|---|
| 1 | `1-home-hero` | viewport-only; `1-home-hero-FULL__*` is the full-page version |
| 2 | `2-directory` | |
| 3 | `3-admin-actors` | authenticated · `h1 = "Actor management"`, 25 rows |
| 4 | `4-import-preview` | authenticated · **real preview state** — 3 rows, 6 warning matches |
| 5 | `5-map` | |
| 6 | `6-footer` | scrolled to `document.body.scrollHeight` |
| 7 | `7-dialog` | authenticated · `[role="dialog"]` present |
| 8 | `8-dashboard` | LF-1 surface |
| 9 | `9-register-form` | VF-4 / DR-1 surface |

`MOCKUP__*.png` — `../mockup/index.html` rendered at the same three widths, so the
comparison is image-to-image rather than image-to-markup.

`manifest-public.json` / `manifest-admin.json` — per-capture record including the **in-page
`window.innerWidth` reading**. `vision-verdict-round{1,2}.txt` — raw T6 gate output from
`agy` / `gemini-3.1-pro-high`, **unedited**. `capture.mjs` — the harness.

## Two things to know before trusting these

**Resolution.** Captured at `deviceScaleFactor: 2`, then downsampled 50 % to keep the
directory at 7 MB instead of 30 MB. Fine for layout, hierarchy and colour. **Not** authoritative
for the finest shadow judgements — `--shadow-xs` is a 1 px 4 %-alpha shadow, and the round-2
gate found it indistinguishable from flat even at full resolution. Re-capture at native scale
before overturning a shadow finding.

**The verdicts are raw, and both are partly wrong.** Round 1 silently renumbered its answers and
skipped a question. Round 1 and round 2 describe the VF-4 legend defect in **mutually
incompatible** ways, and a Leader geometry probe agreed with neither. What settled it was
looking at a cropped screenshot. Read these files as inputs that required adjudication — the
adjudication is in `../execution.md`, and it is what should be cited.

## Reproducing

`capture.mjs` needs `playwright` (scratchpad install — deliberately **not** vendored into this
repo) and, for surfaces 3 / 4 / 7, a `state.json` Playwright storage state from an authenticated
admin session. `4-import-preview` additionally needs a workbook that triggers
`GPS_CLEARED_WARNING`, `CONSENT_ACK_WARNING` and `PHONE_UNNORMALIZABLE_WARNING`
(`backend/src/actors/actor-import.service.ts:75,77,88`). Preview is a dry run; **commit was
never invoked and must not be.**
