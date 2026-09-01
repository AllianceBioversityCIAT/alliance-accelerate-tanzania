# Archive Summary — Baseline Usage Analytics (GA4) + Cookie Consent

| Field | Value |
|---|---|
| Original spec path | `docs/specs/enhancement/usage-analytics/` |
| Archive date | 2026-09-01 |
| Jira | ATP-62 |
| Branch | `tracking-tools` — 13 commits, `23b199f`..`6a059e6` |
| Final status | **Complete.** 11 of 11 tasks `[x]`, validation PASS after remediation |
| Depth | Standard |

## What shipped

Google Analytics 4 with **default measurement only**, gated behind an explicit cookie-consent banner, mounted so `(admin)` routes structurally cannot load it, plus a `/privacy` disclosure and a change-choice control.

**Justification, restated because it is narrow and non-recoverable:** this advances no `docs/prd.md` §4 success metric — all six are measurable from the database, the API or a performance test. Analytics has no backfill. Every other item could have been added later at identical cost; the launch period cannot be reconstructed.

## Requirements delivered

| ID | Delivered as |
|---|---|
| FR-1 | Non-injection gate — no script, request or cookie before consent is granted (DD-1: consent-mode `denied` rejected because it still transmits cookieless pings) |
| FR-2 | Non-modal labelled landmark banner, two symmetric one-click controls, page beneath fully operable |
| FR-3 | Versioned consent record in `localStorage`, tolerant of absent or throwing storage; absence never resolves to granted |
| FR-4 | Four automatic signals, **zero** custom events/parameters/dimensions — the PII mitigation, verified codebase-wide |
| FR-5 | Structural admin exclusion via `(public)` layout placement; root layout untouched |
| FR-6 | `/privacy` re-scoped (not deleted) to two enumerated topics, with the withdrawal asymmetry disclosed |
| FR-7 | Async load, silent `onError`, no retry; absent measurement ID renders nothing |
| NFR-1..7 | axe-clean, tokens only, no motion, static export preserved, PII boundary structural |

## Files changed

| Area | Files |
|---|---|
| New — analytics | `frontend/lib/analytics/{consent-storage.ts,ConsentProvider.tsx}` + tests · `frontend/components/analytics/{GoogleAnalytics,ConsentBanner,ConsentChoiceControl}.tsx` + tests |
| New — shell | `frontend/components/shell/PublicShellFrame.tsx` |
| New — gate | `frontend/app/(admin)/analytics-exclusion.test.tsx` |
| Modified | `frontend/app/(public)/layout.tsx` · `frontend/app/(public)/privacy/{page.tsx,privacy-a11y.test.tsx}` · `frontend/components/map/LeafletMap.tsx` · `frontend/.env.example` · `infra/scripts/deploy-frontend.sh` |

~2,595 insertions across 16 files. Implementation ~735; tests ~1,830.

## Test evidence

98 suites / **1,478 tests** green. `npm run build` succeeds, static export intact, `/privacy` emits `○ (Static)`. Lint 0 errors (4 pre-existing `<img>` warnings). One pre-existing `tsc` error, unrelated.

**`/akili-test` was not run** — see `validation-report.md`. Each task's tests were written by the Implementer that wrote the code and audited by an independent Reviewer: `author ≠ auditor` held on reading, `author == tester` on execution.

## Validation

**CONDITIONAL PASS → PASS.** Three blocking items, all resolved:

1. **F-1** — a confirmed FR-2 scenario 2 violation: the banner made all three funder logos unclickable at settled reading positions. Fixed in **T-10**. The earlier dismissal rested on an A/B that never varied the banner.
2. **Figure errors** in the Leader's record — a 68-line file-length error that suppressed a third budget breach, a stale task count, and overstated round/FAIL counts. All corrected under two-direction sweeps.
3. **F-2** — withdrawal does not stop collection in-session (`next/script` has no unmount cleanup). Disclosed in `/privacy` under **T-11** rather than fixed, since it is library behaviour.

## Accepted, with reasons

| Item | Why accepted |
|---|---|
| **NFR-4** — `primary-fg`→`{primary, primary-hover}` unasserted for contrast | Inherited app-wide: every primary button in the repo is already unasserted. Recorded in four places, not hidden. Closing it is a separate change. |
| **The transit band** — the banner overlays content for an *h*-wide band of scroll space | Inherent to `fixed bottom-0`, which `design.md` §5.4 prescribes. Forbidding it would forbid the design the same spec mandates. |
| **Live GA4 ingestion** unverified | Unmeasurable here. Post-deploy manual first-load check. |
| **A cosmetic artefact** — the OSM attribution paints over the sticky header in a ~67px band at 375 | Visual only; the link wins the hit-test at every sampled offset. |

## Historical notes

**Three tasks were added mid-execution**, each user-approved from a measured finding, none from an advisory: **T-9** (move the OSM attribution clear of the banner — a licensing control), **T-10** (footer clearance), **T-11** (withdrawal disclosure).

**The rendered-capture gate earned its place twice.** `requirements.md` §4.1 recorded layout/occlusion as the one defect class with no automated coverage. On its first run T-8 found an occlusion set three times larger than `design.md` §5.4 had accepted; its follow-up found a second. Seven tasks and 1,475 green tests could not see either.

**Six defects were in the Leader's own artefacts**, none catchable by any gate the methodology has — a mandated probe that could not prove what it claimed, a factual error about GA4 that reached a privacy notice, a self-falsifying rework brief, an accepted-risk set written from reasoning, an overclaim introduced while recording that very correction, and a brief that generalised past its own task scope. All six were found by the Reviewer or the validator. See the kaizen entry, lesson **L-1**.
