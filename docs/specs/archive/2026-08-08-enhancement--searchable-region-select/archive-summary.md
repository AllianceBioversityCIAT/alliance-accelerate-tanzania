# Archive Summary — Searchable Region Select

## 1. Document Control

- **Original spec path:** `docs/specs/enhancement/searchable-region-select/`
- **Archive date:** 2026-08-08
- **Archived by:** AKILI Leader (Claude Sonnet 5), `/akili-archive`

## 2. Final Status

**6 of 7 tasks complete. T-6 held at `[~]` — accepted as an explicit follow-up, not silently closed.**

| Task | Status | Notes |
|---|---|---|
| T-1 Pure region matcher + unit tests | `[x]` | 1 attempt |
| T-2 `SearchableSelect` primitive | `[x]` | 2 attempts |
| T-3 Portal + reflow positioning | `[x]` | 2 attempts, 2 review rounds — blocked across two sessions on Reviewer spawn/cross-host infrastructure, resolved by a fresh session |
| T-4 Adopt in the public registration form | `[x]` | 2 attempts — round 1 found a real regression in a file outside the task's original scope (`page.test.tsx`) |
| T-5 Adopt in the two public filter surfaces | `[x]` | 1 attempt, 2 rounds — round 1 found an evidence gap (untested a11y suites), closed without a code change |
| T-6 Manual browser pass (D5/D6/D7) | **`[~]`** | Desktop verified (measured contrast, positioning, keyboard). Mobile explicitly escalated, not verified — no Xcode Simulator on this host, Chrome device emulation not reflecting in rendered output |
| T-7 Adopt in the admin actor form | `[x]` | 1 attempt — added post-hoc, user-authorized, after a visual comparison of the live public deploy surfaced the admin form as an unintended-looking gap |

**No `test-report.md` or `validation-report.md` exists** — `/akili-test` and `/akili-validate` were not run for this spec. Their absence is accepted at archive per the user's explicit direction to proceed to `/akili-archive` directly.

## 3. Requirements Delivered

| Requirement | Delivered by | Evidence |
|---|---|---|
| FR-1 (substring/case/diacritic-insensitive matching) | T-1 | `fold-search.ts` + tests |
| FR-2 (primitive: state, keyboard, ARIA, live region) | T-2 | `SearchableSelect.tsx` |
| FR-3 (typed-but-uncommitted text never reaches the emitted value) | T-2, re-verified at T-4/T-5/T-7 adoption | boundary tests at every adoption site |
| FR-4 (registration form clause preservation) | T-4 | `RegistrationForm.tsx` — `aria-invalid`, `aria-describedby`, asterisk, `disabled`, inline error, payload fidelity |
| FR-5 (both filter surfaces, `region: undefined` never `''`, OQ-1 fixed at both sites) | T-5 | `DirectoryFilters.tsx`, `FilterControls.tsx` |
| DD-5 / JD-1 / JD-6 (portal, reflow, scroll-exclusion, mobile-keyboard path) | T-3 | `SearchableSelect.tsx` reflow logic — mobile-keyboard path unverified in a real device (T-6) |
| NFR-1 (WCAG 2.1 AA) | T-3 (axe re-target), T-6 (measured 12.74:1 contrast) | — |
| Admin actor form clause preservation (no formal FR — extends FR-4's discipline) | T-7 | `ActorForm.tsx` |

`requirements.md` §2/§6 and `design.md`'s admin non-goal text were corrected in the T-7 commit to reflect 4 adopted / 2 deferred (was 3/3) — the deferred sites are `components/dashboard/DashboardFilters.tsx` (public, higher priority per JD-9) and `app/(admin)/admin/actors/page.tsx` (the one remaining admin site).

## 4. Files Changed Summary

Per `execution.md`'s task entries:

- **New:** `frontend/lib/text/fold-search.ts` (+test), `frontend/components/ui/SearchableSelect.tsx` (+test)
- **Modified for adoption:** `RegistrationForm.tsx`/`.test.tsx`, `app/(public)/register/page.test.tsx`, `app/(public)/register/register-a11y.test.tsx`, `DirectoryFilters.tsx`/`.test.tsx`, `FilterControls.tsx`/`.test.tsx`, `DirectoryView.test.tsx`, `DiscoverRail.test.tsx`, `directory-a11y.test.tsx`, `map-a11y.test.tsx`, `components/admin/ActorForm.tsx`/`.test.tsx`
- **Doc corrections applied in-flight:** `tasks.md` (T-5's under-specified Verify line; T-4's missing file in its Files list), `requirements.md` §2/§6, `design.md`'s admin non-goal text, a stale code comment in `ActorForm.tsx`

**Merge with a parallel line of work:** this spec's branch (`enhancement/app-visual-refresh`) was merged with `enhancement/app-visual-refresh-v2` (carrying the independently-executed `app-visual-refresh` and `form-elevation-ux` specs) partway through execution. Two real code conflicts, both in each form's Location fieldset, resolved by combining both sides' work (card-treatment + `gpsHintId` from the incoming side, `renderRegionField()`/`SearchableSelect` from this spec). Full detail: `execution.md` → "Session 3 (continued) — merge with the parallel app-visual-refresh-v2 / form-elevation-ux line." See KZ-010 in `docs/specs/kaizen-log.md` for the root-cause lesson.

## 5. Test Evidence Summary

No `test-report.md` (`/akili-test` not run). In-task verification, re-run and independently reproduced by the Leader at each task's close:

- `npm test -- --silent` (full suite, post-merge): **88 suites / 1357 tests passing**
- `npm run build`: static export clean, 23/23 pages
- `npm run lint`: clean (only pre-existing, unrelated `<img>` warnings)
- T-6 manual pass (desktop, real browser via `orca-cli` against the live Dev deploy): measured contrast 12.74:1 (WCAG AA/AAA pass), positioning/portal-escape confirmed at all 3 public sites, full keyboard operability confirmed

## 6. Validation Summary

No `validation-report.md` (`/akili-validate` not run). Not accepted as equivalent to validation — recorded here as an honest gap, per the same standard this spec held itself to at T-6.

## 7. Accepted Warnings / Follow-Ups

| # | Item | Disposition |
|---|---|---|
| 1 | **T-6 mobile checks unverified** — the mobile virtual-keyboard flip-position scenario (T-3's most critical, never-observed-working fix), mobile touch-target sizing, and momentum-scroll behavior | **Accepted as follow-up.** Requires either a real mobile device or a working iOS Simulator (`sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer` after installing Xcode) on a host running this browser tooling. Not a code defect — an infrastructure gap in verification capability. |
| 2 | **`/akili-test` and `/akili-validate` never run** | Accepted per explicit user direction to proceed to archive. |
| 3 | **The z-40-sticky-header-vs-flip-above collision scenario** wasn't independently re-confirmed visually beyond the existing code-level census (T-3 Reviewer verified `z-50` > `z-40` by repo grep) | Accepted — a stale element reference during the manual pass caused a misclick before this specific sub-check completed; not re-attempted per the loop-avoidance guidance after two prior tooling failures in the same pass. |
| 4 | **`app/(admin)/admin/actors/page.tsx`** (the remaining deferred admin site) and **`components/dashboard/DashboardFilters.tsx`** (deferred public site, JD-9 — higher priority than the admin sites') | Named in `requirements.md` §6 as explicit non-goals; either is a mechanical follow-up spec reusing the now-adopted primitive. |

## 8. Historical Notes

- **Judgment Day:** 2 rounds, `APPROVED ✅` before execution began (`judgment.md`).
- **T-3 spanned three sessions** due to infrastructure exhaustion, not defect volume: an in-harness subagent spawn-limit exhaustion (session 1), a 3-route cross-host fallback attempt that failed on all three routes (session 2 — opencode insufficient balance, Antigravity exited after a single preamble line twice), and a clean resolution once a genuinely fresh session reset the spawn counter (session 3).
- **T-7 was added mid-archive-flow, not at specify time** — the user, reviewing the live public deploy, asked why the admin actor form still used a native `<select>`; the answer was scope (never included), not a defect, and the user chose to add it rather than defer it. `tasks.md`'s dependency graph and `design.md` §11's budget table were updated in the same change.
- **A `git rebase` was requested and investigated, but never run** — `main` had zero content difference from this branch's fork point (3 "ahead" commits were no-op merges); the actual cause of the visual discrepancy the user noticed was the parallel `app-visual-refresh-v2` branch, not staleness against `main`.
- **This spec's own T-6 disqualification-bar language ("could not check mobile is a legitimate, reportable outcome") was written at specify time and held under real pressure at execution time** — worth noting as a positive control on the spec's own design, not merely a rule that existed on paper.
