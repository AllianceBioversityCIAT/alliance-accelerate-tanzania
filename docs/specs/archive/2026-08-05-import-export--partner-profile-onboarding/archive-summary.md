# Archive Summary — Partner Profile Workbook Onboarding

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/import-export/partner-profile-onboarding/` |
| Archive date | 2026-08-05 |
| Parent epic | `epic/hybrid-actor-registration` — chunk **2 of 4** |
| Depends on | `actors/registration-source-and-consent` (chunk 1, archived 2026-08-04) |
| Depth | **Full** |
| Approval mode | gated |
| Final status | ✅ **Complete — 12/12 tasks, every one closed on an independent Reviewer PASS** |

## 2. Final Status

All 12 tasks `[x]`. No HALT, no `FATAL_FAIL`, no `PRODUCT_BUG`. Two Pivot Records, both user-approved. Fifteen measurement corrections (C-1…C-15) and 27 recorded advisories.

**Deployed to DEV on 2026-08-05** — account `569113802249` (IBD-DEV), eu-west-1. API `https://ffbctg5zb6.execute-api.eu-west-1.amazonaws.com`, site `https://d3idqvvg0xa1r7.cloudfront.net`. Smoke-verified live: health 200, `/actors` 200, `/metrics` 200, no `phone`/`email` in public responses.

## 3. Requirements Delivered

| ID | Requirement | Artifact |
|---|---|---|
| FR-1 | Per-sheet mapping, total column accountability | `mapping.md` — **8 sheets, 118 columns**, each with exactly one of four dispositions, every sheet closing on its measured denominator |
| FR-2 | Deterministic, unique, traceable natural key | `mapping.md` §1.2 + per-sheet key rules (`<PREFIX>-<sourceId>`, positional fallback) |
| FR-3 | Region derived where certain, quarantined where not | `DISTRICT_TO_REGION` (28 districts) + published table + doc↔constant test |
| FR-4 | Trader type from sheet identity | Per-sheet assignment tables; `"Retaler"` quarantined, no alias added |
| FR-5 | Phone normalization to E.164 | `normalizePhone()` — pure, `null` rather than mangled, multi-number **count** not value |
| FR-6 | Nothing becomes public | Every record `UNKNOWN` / `TEAM_MANAGED` / `NOT_RECORDED`; asserted over HTTP |
| FR-7 | Per-reason quarantine breakdown | `ImportReport.failureBreakdown` (additive) + frontend mirror in the **preview** branch |
| FR-8 | Reconciliation of 100% of source rows | `reconciliation.md` — **1,237 physical rows**, four buckets, closing on both axes |
| FR-9 | Re-run runbook | `runbook.md` — 8 steps, executable without reading the spec |
| FR-10 | QDS organisation-only selection | Exclusions by row range; hand-classification **by row number only** |
| FR-11 | Stale-template message clarity | Message now names both versions **and** the download location |
| NFR-1…9 | PII gate · invisibility · additive-only · SSOT · purity · determinism · audit · isolation · **no PII in repo** | All held; NFR-9 verified by grep gate + wider scans at every step |

**Expected yield:** 806 candidates → **~751 net** (corrected from ~748 → ~752 → ~757 → ~751 across two pivots).

## 4. Files Changed

| Area | Files |
|---|---|
| **Documents (the deliverable)** | `mapping.md` (695 lines), `reconciliation.md` (281), `runbook.md` (148), plus `requirements.md` / `design.md` / `tasks.md` corrections |
| **Backend code** | `common/normalize.ts` (`normalizePhone`, `DISTRICT_TO_REGION`), `actors/actor-import.service.ts`, `actors/actor-import.types.ts` |
| **Backend tests** | `common/normalize.spec.ts` (incl. the doc↔constant assertion), `actors/actor-import.service.spec.ts`, `test/partner-profile-onboarding-import.e2e.spec.ts` |
| **Frontend** | `lib/api/actors-admin.ts` (exact type mirror), `app/(admin)/admin/actors/import/page.tsx` (`FailureBreakdown`) |
| **TRD** | Clarifying note distinguishing the canonical template from the client workbook (T-12) |

**Budget (`design.md` §13) vs actual:** tasks **12 / 12 — exact**; documentation **1,124 / ~1,250 lines — under**; `mapping.md` alone ran 695 vs ~600 (over, flagged at the time and accepted: the overrun was scope the task required, not creep).

## 5. Test Evidence

**No `test-report.md` — `/akili-test` was not run. Absence explicitly accepted by the user at archive time.** Recorded here rather than glossed, with the reasoning:

| Evidence | Result |
|---|---|
| Backend suites (incl. `pii-boundary.spec.ts`, the NFR-1 release gate) | **38 suites / 490 tests green** — verified 2026-08-05 pre-deploy |
| Frontend suites | **70 suites / 998 tests green** |
| Backend + frontend builds | clean; every route `○ (Static)` — static-export constraint holds |
| SAM templates | all three valid |
| NFR-9 D-7 grep gate | clean at every task boundary, plus wider digit/email scans |
| Per-task independent review | **12 / 12 tasks** closed on a Reviewer PASS; `xhigh` tasks used 2–3 parallel lens Reviewers |

The code paths (T-1…T-6, T-11) are covered by the suites above. The **document** deliverables (T-7…T-10, T-12) have **no automated gate by design** — see §6.

## 6. Validation Summary

**No `validation-report.md` — `/akili-validate` was not run. Absence explicitly accepted by the user at archive time.**

`design.md` §12.1 enumerates six properties **no gate in this repository can evaluate**, and they remain uncovered by design, not by omission:

1. Whether a column was mapped to the *right* canonical column (R-1 / D-6)
2. Whether a sheet's assigned trader type is factually correct
3. Whether the QDS `cbo` hand-classification is right
4. Whether a district maps to the *correct* region (D-1b)
5. Public invisibility over the real committed dataset (the only HTTP suite mocks the DB)
6. Key determinism across two mapping runs

These close at the **HITL review of `mapping.md`** and the **≥5-row-per-sheet preview trace**, both required by `runbook.md` — not in CI.

## 7. Accepted Warnings & Follow-Ups

| Item | Disposition |
|---|---|
| `reconciliation.md` §7 (cell-by-cell trace) and §8 (operator post-commit check) are **blank slots** | Correct — both require an actual onboarding run by the AT team |
| **The ~751 records are not loaded.** This spec produced a mapping *specification*, not an importer | By design (epic §9 Option A). Onboarding is a manual AT-team run following `runbook.md` |
| **OQ-4** — 12 `…AMCOs` typed `bulk_buyer` by sheet identity rather than `cooperative` | Open; needs the program's taxonomy call. Flagged in `mapping.md`, `design.md` F-3 |
| **OQ-2** (capacity unit), **OQ-5** (QDS production dataset) | Open, deferred with the spec |
| `design.md` DD-1's residual 2-row reconciliation | Open; the omission direction is the safe one (absent district → quarantine) |
| **OQ-1 residual** — three real phone numbers remain in **git history** of `proposal.md` | Redacted in working files; history rewrite was out of scope. **Still true after archiving** |
| Advisories A-1…A-27 | Recorded in `execution.md`, non-gating, deliberately not converted into tasks |

## 8. Historical Notes

**Two user-approved pivots, both measurement-driven.**
- **T-7 pivot** — `requirements.md` §3.1 contradicted the source workbook: blank ids were **38**, not 52; the `Offtaker_Groundnuts` contaminated tail was rows **149–152**, not 147–151; and five sheets' column denominators were wrong. Full §3.1 re-measurement approved (C-1…C-5).
- **T-8 pivot** — expected net **757 → 751** (C-6…C-13), plus DD-1's closure and a PII sizing stale since two pivots earlier. Later extended by C-14 (duplicate groups 8→11) and C-15 (a denominator that was never possible).

**The most instructive failure was T-9.** Its first attempt carried all five `design.md` §4.6 MUST clauses, every figure correct, every disqualifier clear — and described an import UI **that does not exist**. It told the operator to upload twice and "choose commit"; the shipped page previews automatically on file selection and commits via an *"Import N actors"* button the runbook never named. It also asked for a public-detail check using an id it never explained how to obtain — the **internal** id, not the `traderId` the operator builds. An operator would have used `OFB-1036`, received a 404 for the wrong reason, and **recorded a false pass on the check whose only purpose is catching a PII leak.** Only a Reviewer that opened `import/page.tsx` instead of re-reading the spec could tell.

**A design property discovered, not designed:** the shipped Admin import UI **structurally enforces preview-before-commit** — the commit reuses the exact previewed `File`, with no path to commit an unpreviewed one. That is stronger than `design.md` §4.6 item 1 requires.

**NFR-9 was reached for twice and held both times.** An Implementer wrote a real phone number from the workbook into a draft and caught it itself before reporting; this spec had already remediated one such breach (`proposal.md`, OQ-1). Row-number-only discipline held across every quarantine register, the QDS hand-classification, and the duplicate-candidate list.

**Four Reviewer workers died to network failures** (`ENOTFOUND`, mid-response disconnects). None consumed a rework attempt, and the Reviewer was never inlined — an infrastructure outage does not suspend `author ≠ auditor`.
