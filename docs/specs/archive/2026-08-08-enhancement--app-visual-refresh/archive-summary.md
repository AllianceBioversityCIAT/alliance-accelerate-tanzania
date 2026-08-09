# Archive Summary — App Visual Refresh

## 1. Document Control

- **Original spec path:** `docs/specs/enhancement/app-visual-refresh/`
- **Archive date:** 2026-08-08
- **Archived by:** AKILI Leader (Claude Sonnet 5), `/akili-archive` — executed on a merged tree (see §8)

## 2. Final Status

**7 of 7 tasks complete.**

| Task | Status | Notes |
|---|---|---|
| T-1 Contrast harness + known-failure ledger | `[x]` | 1 attempt |
| T-2 + T-3 Warm-earth tokens + the 4 AA fixes | `[x]` | Landed atomically (ADJ-4, Leader ruling) |
| T-4 Elevation ladder + gradient tokens | `[x]` | 1 attempt |
| T-5 Baseline docs sync, QA-11 correction | `[x]` | 1 attempt; 2 prior review runs lost to a session quota wall (environment, not charged to the rework ceiling) |
| T-6 Rendered evidence + human visual gate | `[x]` | Closed at archive — see §7 |
| T-7 Form-section elevation and hierarchy | `[x]` | Added 2026-08-07, user-authorized, amends NFR-7 |

**No `test-report.md` or `validation-report.md`** — `/akili-test`/`/akili-validate` not run; accepted at archive per the user's direction.

## 3. Requirements Delivered

FR-1 through FR-8 (warm-earth tokens, the 4 AA contrast fixes, crop/warning decoupling, the 4-rung elevation ladder, gradient tokens, brand-token immutability, baseline-doc truthfulness, QA-11's verification method) — all delivered per `tasks.md`. NFR-7 amended by T-7 (form-section elevation/hierarchy).

## 4. Files Changed Summary

Per `execution.md`: `frontend/app/globals.css`, `frontend/tailwind.config.ts`, `frontend/lib/contrast.ts` (+test, new), `frontend/lib/dashboard/chart-tokens.ts` (comment-only), two comment-only component edits, plus documentation (`design.md`, `requirements.md`, baseline docs sweep).

**This spec's T-2/T-6 work is what a parallel, independently-running AKILI session on a different branch/worktree (`enhancement/searchable-region-select`) discovered mid-execution and later merged with** — see that spec's archive (`docs/specs/archive/2026-08-08-enhancement--searchable-region-select/`) and Kaizen lesson KZ-010 for the concurrency-detection gap this surfaced. The merge is what brought this spec's tokens and `SearchableSelect` together on the branch this archive runs from.

## 5. Test Evidence Summary

No `test-report.md`. In-task verification, re-confirmed at archive on the merged tree: `npm test -- --silent` 88 suites/1357 tests passing, `npm run build` clean (23/23 pages), `npm run lint` clean.

## 6. Validation Summary

No `validation-report.md`. Not run; accepted as a gap, same as `searchable-region-select`.

## 7. Accepted Warnings / Follow-Ups

T-6 was held at `[~]` through two close-out rounds on this spec's own branch, for two independent reasons — both resolved before this archive, not silently waved through:

| Blocker | Original finding | Resolution |
|---|---|---|
| **Disqualifier (b)** — `shadow-xs` applied but perceptually inert (0.04 alpha); `shadow-lg` had zero consumers | `execution.md` → *"the four-rung ladder has two rungs that render"* | **Resolved by `enhancement/form-elevation-ux`** (already archived, merged into this tree): `--shadow-xs` retuned to `0.12` alpha, `--shadow-lg` wired to all 4 dialogs. Verified directly against the merged code at archive time, not inherited as a claim — see `execution.md`'s closing entry. |
| **AR-1** — the human visual sign-off, explicitly distinct from "direction to proceed" | Twice logged as unmet; the spec's own history flags a prior close-out for conflating "continue" with "approved" | **Given at this archive**, after the user was asked the disambiguated question directly ("do you approve the visual result?") against the live post-merge Dev deploy, and answered yes. |

Three items this spec found but deliberately did not absorb (advisory-never-becomes-a-task):

| Item | Disposition |
|---|---|
| **VF-4** — register-form `<legend>` white-tab artifact, breaking the card's rounded corner | Routed to `form-elevation-ux` at the time; **already fixed there** (card-treatment conversion) and confirmed resolved in that spec's own `execution.md`. |
| **VF-5** — Partners section reads as visually empty (240px of ink in a 694px band) at the now-lighter `bg-surface` | Routed by user decision to `enhancement/form-elevation-ux` §9, then further to a dedicated proposal. **Still open:** `docs/specs/enhancement/partners-band-density/proposal.md` exists but is not yet specified/executed. |
| **Two pre-existing, unrelated defects** — nav overflow at 768px (`Header.tsx`, last changed by an unrelated spec) and the map legend overlapping zoom controls at 375px (`MapLegend.tsx`, likewise unrelated) | Neither is a regression from this spec's token change; both pre-date it. Recorded, not actioned. **No `bugfix/` proposal exists yet for either** — worth creating before they're forgotten (the currently-existing `bugfix/` folders — `deploy-profile-override`, `flaky-frontend-suite` — cover different issues). |

## 8. Historical Notes

- **This spec's execution overlapped, on a different branch, with `enhancement/searchable-region-select`'s entire execution** — both modified `RegistrationForm.tsx`, `ActorForm.tsx`, `DirectoryFilters.tsx`, and `FilterControls.tsx` independently for 13+ commits before either session became aware of the other. Resolved by a reconciliation merge (see `searchable-region-select`'s archive, §4 and §8). This spec's own docs (`design.md`/`requirements.md`/`tasks.md`) were the versions carried forward through that merge, since this branch had fully executed them while the other branch held only a pre-execution draft.
- **T-5's suite-gate note is worth preserving verbatim for future specs:** four Leader runs on an unchanged tree gave 1, 0, 3, then 3 failures, each time a *different* suite — confirmed as pre-existing timeout-class contention under parallel test load, unrelated to any token this spec touched. The gate this spec adopted (every suite failing under full load must pass in isolation, and no failure may reference a changed token) is a reusable pattern for any spec that hits the same flakiness; `docs/specs/bugfix/flaky-frontend-suite/proposal.md` already exists to fix the root cause.
- **The Dev-deploy-as-evidence-environment decision** (T-6, 2026-08-07): captures were taken against the live CloudFront origin rather than `localhost`, because dev-mode Tailwind output is weaker evidence for a token change than the production build, and the API's CORS is locked to the CloudFront origin so data-bearing surfaces can't render real data from any other origin. This reasoning applies to any future visual-gate task in this project.
