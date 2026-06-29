# Archive Summary — Home-Page Responsive Typography Scale

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/enhancement/home-typography-scale/` |
| Archive path | `docs/specs/archive/2026-06-29-enhancement--home-typography-scale/` |
| Archive date | 2026-06-29 |
| Final status | **Done — merged (PR #31), deployed, validated PASS** |
| Final commit | `main` @ `0a88af1` |

## 2. Original Spec Path

`docs/specs/enhancement/home-typography-scale/` (Lite depth, enhancement taxonomy).

## 3. Archive Date

2026-06-29.

## 4. Final Status

Complete. All 6 tasks `[x]` with Reviewer PASS; validation report PASS; merged to `main` via PR #31 and live on CloudFront (`https://d3idqvvg0xa1r7.cloudfront.net`).

## 5. Requirements Delivered

- **FR-1** — Token scale extended: `--text-5xl` (48px), `--text-6xl` (60px) in `globals.css`, Tailwind `fontSize`, and `design.md §7`.
- **FR-2** — Hero `h1` responsive: `text-3xl sm:text-4xl lg:text-5xl` (30→48px).
- **FR-3** — Five home section `h2`s responsive `text-2xl lg:text-3xl` (24→36px); semantics/id/aria preserved.
- **FR-4** — Eyebrow chips fixed: `bg-primary/10` (no-op on hex CSS-var) → `bg-primary-soft` (#E8EEF6) on 5 pills.
- **FR-5** — Official **Montserrat** brand font via `next/font/google`: `--font-display` token, `@layer base` family rule on `h1,h2,h3` site-wide, **ExtraBold (800)** titles across home/about/login/directory/dashboard/profile, **SemiBold (600)** hero tagline; **Inter** retained for body/UI/data. Gotham skipped (no license).

## 6. Files Changed Summary

Per `execution.md`:
- **Tokens/config:** `frontend/app/globals.css`, `frontend/tailwind.config.ts`, `docs/system-design/design.md §7`, `frontend/app/layout.tsx`.
- **Home components:** `Hero.tsx` (h1 ramp + extrabold + tagline), `AboutStrip.tsx`, `HowItWorks.tsx`, `PartnersStrip.tsx`, `ClosingCTA.tsx`, `CropCoverage.tsx` (h2 ramp + extrabold + eyebrow chip).
- **Site-wide titles:** `app/(public)/about/page.tsx`, `components/auth/LoginForm.tsx`, `components/directory/DirectoryView.tsx`, `components/dashboard/DashboardView.tsx`, `components/profile/ProfileHeader.tsx`.

Commits: `a30c05e` (T-1) · `f1f90cd` (T-2) · `559c200` (T-3) · `cbedaa6` (T-5) · `b13ddd1` (T-6) · `29d3d3e` (T-4), merged as PR #31 (`0a88af1`).

## 7. Test Evidence Summary

- 687 unit tests (Jest/RTL) green; `npm run lint` clean; `npm run build` exit 0 (static export).
- Built-CSS artifact verification: all utilities resolve to tokens; Montserrat self-hosted (12 woff2, no CDN).
- Live CloudFront preview deployed and user-reviewed across breakpoints.

## 8. Validation Summary

`validation-report.md`: **PASS / archive-ready.** All FR-1..FR-5 PASS, build/lint/tests green, design + constitutional conformance confirmed, no FAIL findings.

## 9. Accepted Warnings Or Follow-Ups

- **Follow-up (pre-existing, out of scope):** `PillarCards.tsx` icon-tile `bg-primary/10` and `text-primary/10` watermark share the same opacity-on-hex-var no-op; candidate for a separate small token fix.
- **Evidence note:** T-4 cross-breakpoint verification was build-artifact + live-preview (user-reviewed), not an automated visual-regression test — accepted for this UI change.

## 10. Historical Notes

- **Mid-execution scope addition:** FR-5 (Montserrat) was added after T-1..T-3 when the user supplied official brand typography ("Montserrat ExtraBold for the title … Montserrat SemiBold for the tagline"). Scope confirmed via AskUserQuestion: site-wide headings; hero supporting line = tagline; body stays Inter. Spec amended (FR-5, design §5.5 + ADR-2, tasks T-5/T-6, T-4 rewired) before resuming.
- **Reviewer false positive (T-5):** the Reviewer read a cumulative branch diff and misattributed the already-committed T-3 eyebrow changes to T-5. Leader proved `frontend/components/` was byte-clean in the T-5 working set and adjudicated PASS — no rework attempt consumed. Lesson: give reviewers the explicit working-set file list (done for T-6, which then passed cleanly).
- **Token architecture confirmed again:** brand/typography changes are token-value + base-rule edits that cascade — the `@layer base { h1,h2,h3 }` family rule applied Montserrat site-wide with zero per-heading family edits.
- This supersedes the "brand web-font deferred to lead org" note from the official-branding archive (`2026-06-29-enhancement--official-branding`).
