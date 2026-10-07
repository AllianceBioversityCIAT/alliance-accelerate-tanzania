# Kaizen Entry — actors/consent-intake/intake-required-fields

## Document Control

| Field | Value |
|---|---|
| Spec Path | `actors/consent-intake/intake-required-fields` |
| Archive | `docs/specs/archive/2026-10-05-actors--consent-intake--intake-required-fields/` |
| Date | 2026-10-05 |
| Branch | `feature/atp-84-consent-request-email`. **Spec branch**, resolved by fact against the `Default Branch: main` pin; there is no `Integration Branch:` pin. Every shared-file edit below is therefore a pending item for the apply phase on **`main`**. |
| Archive Run | 1 |
| Approval Mode | gated (with a standing product-owner authorization for budget overruns, 2026-10-04) |

## Metrics

| Signal | Value | Source |
|---|---|---|
| Tasks executed | 8, plus T-5 reopened once | tasks.md, execution.md |
| Reviewer FAIL rework attempts | **13**: T-1 ×1, T-2 ×2, T-3 ×1, T-4 ×1, T-5 ×1 plus the reopen, T-6 ×2, T-7 ×1, T-8 ×2, R-2 remediation ×2 (and 1 for the post-test UI fix) | execution.md |
| HALTs / FATAL_FAILs | **1 HALT** (R-2 docs remediation, 3 attempts) / 0 | execution.md *HALT: R-2* |
| Pivots | 0. The T-5 reopen was an implementation defect against the approved FR-4/FR-5, not a spec change. | execution.md *Reopening T-5* |
| PRODUCT_BUGs | n/a (no `/akili-test` run) | — |
| Judgment-day severe findings | Round 1: 3 confirmed + 3 suspect. Round 2: 1 (N-1, fix-caused). APPROVED. | archive/…/judgment.md |
| Validation FAIL / WARN | **4 / 21** first pass → archive-ready after remediation | validation-report.md |
| Review verdicts | 24 across the 8 tasks; about 32 including remediation and post-test changes | execution.md §3–§5 |
| Budget | About 9,000 LOC against a declared ~1,800, re-baselined twice | execution.md *Budget tripwire*, *Budget re-baseline* |
| Tasks closed under `REVIEW_WAIVED` | 0. The R-2 Leader-inline fix (rung 5, product-owner approved) was confirmed by an independent Reviewer, so no gate was lost. | execution.md §4 |
| Tasks closed under `REVIEW_SKIPPED` | 0 | execution.md |
| Escaped defects (§3) | 0 against `REVIEW_SKIPPED` tasks (none exist). Escapes past a Reviewer PASS are listed under *Noted*. | — |

**Headline (Gemba):** defects that originated in **Leader-authored** text recurred across the whole run:
- the T-1 closure gap;
- the T-2 execute-time design edit asserting an array `meta.target` without checking the engine;
- the T-5 reviewer-brief omission;
- the T-8 design under-scope of TRD §4.

Two further defects passed task review and were caught only later: the T-5 ordering, caught at T-7's review, and the TRD `ImportModule` attribution, caught at validation.

## Lessons

- **KZ-actors--consent-intake--intake-required-fields-1 — In a remediation or final-attempt brief, `[advisory-grade]` additions to baseline docs spawn the next FAIL.** (Product + Methodology, High)
  - Root cause: every R-2 attempt carried optional advisory edits to `docs/prd.md` / `docs/trd/trd.md` beyond the FAIL being fixed. Each attempt passed its named FAIL, and its *advisory additions* introduced the next blocking defect:
    - attempt 1 left the US-5 contradiction exposed by its own new wording;
    - attempt 2's new Staff sentence said "only";
    - attempt 3's new export-row sentences cited "§203", a line number.
  - That consumed the 3-attempt ceiling and HALTed on a two-token defect the remediation itself created. The brief contract's clause (d) makes advisories non-failing for the *Reviewer*, but nothing stops the *Implementer's* advisory edits to a constitutional baseline from being audited as new FAIL surface.
  - Evidence:
    - execution.md §4: *R-2 attempt 1 — FAIL*, *R-2 attempt 2 — FAIL*, *HALT: R-2*.
    - The HALT block's "Leader's root-cause hypothesis" line.
  - Standardization: → P1 (local `.agents/leader.md`), P2 (upstream).

- **KZ-actors--consent-intake--intake-required-fields-2 — A scroll container that is not a containing block lets `sr-only` live regions stretch the document.** (Product, Medium)
  - Root cause: the admin shell's `<main>` was `overflow-auto` but `position: static`. `ActorHistoryPanel`'s bare `sr-only` (`position: absolute`) live region therefore anchored to `<body>` about 6,000 px down, which produced a second outer scrollbar and a blank block. jsdom cannot see it, and seven Reviewer PASSes on admin pages never saw it. It escaped to the product owner's manual test.
  - The same mechanism applies to every future scroll container in the app.
  - Evidence:
    - `execution.md` and commit `485ba5a`: harness measurement, document scrollHeight 6098 → 800.
    - The product owner's screenshot report (2026-10-05).
  - Standardization: → P3 (`frontend/CLAUDE.md`).

## Noted, not a lesson

- **Recurrence of KZ-011** (nothing audits the task or design against reality). Four Leader-authored execute-time edits or briefs were false or incomplete:
  - T-2's array-only `meta.target`, refuted by a real-MySQL probe;
  - T-8's design §4.7 omitting TRD §4, which FR-6 required;
  - T-5's FR-4/FR-5 ordering, which nobody checked against the consent gate until T-7;
  - the T-5 Reviewer-B brief omitting the NFR-2 timing.

  → P4 (`digest-update`).
- **Recurrence of KZ-008** (an assertion about an artefact the artefact does not bear):
  - The Implementer reported "added an assertion to `layout.test.tsx`" when the file was unchanged (post-test UI fix).
  - T-2 comments claimed "proven under real concurrent load".
  - T-8 attempt 2's Reviewer wrote "every new TRD sentence holds against the code" while the `ImportModule` row was false.

  → P5 (`digest-update`).
- **Recurrence of KZ-001** (closure cannot be self-certified):
  - T-1's FR-1 "same field-level messages" clause had no owner in tasks.md §5.
  - At validation, NFR-4's per-row `aria-live` was recorded covered for T-7 with no code behind it.

  → P6 (`digest-update`).
- The T-2 3rd-review-round escalation rule was missed by the Leader and self-reported (execution.md T-2). The rule was later folded into the standing budget authorization.
- Runtime stalls (network outage) happened three times. Each was recovered at ladder rung 3 (resume-by-message) with no attempt consumed. Workers repeatedly left background Jest or `next dev` processes, which the Leader killed before measuring.

## Pending Items

### P1

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `.agents/leader.md` (append under *Applying a correction*) |
| Edit | **Remediation briefs carry no `[advisory-grade]` edits to constitutional baselines.** From attempt 2 onward, and in any validation-remediation brief, a baseline-doc brief fixes only the named FAIL lines; advisories are recorded, not dispatched. Every advisory sentence added to a baseline is new FAIL surface, and it consumed the 3-attempt ceiling here (KZ-actors--consent-intake--intake-required-fields-1). |
| Severity | High |
| Status | applied (2026-10-05) |

### P2

| Field | Value |
|---|---|
| Kind | upstream |
| Target | methodology |
| Edit | `/akili-execute` Step 2.2 *Brief contract*, clause (d): add "On a rework attempt ≥ 2, or on a remediation brief targeting a constitutional baseline, the brief carries no `[advisory-grade]` additions to that baseline; record the advisories instead. An advisory sentence written into a baseline is audited as new content, and here it produced every subsequent FAIL and a HALT." |
| Severity | High |
| Status | upstreamed (2026-10-05, `docs/specs/kaizen/upstream-2026-10-05.md`) |

### P3

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `frontend/CLAUDE.md` (admin shell patterns) |
| Edit | **Every scroll container is also a containing block.** Give any `overflow-auto`/`overflow-y-auto` pane `relative`. Otherwise absolutely positioned descendants, `sr-only` live regions included, anchor to `<body>` and stretch the document into a second scrollbar. The admin `<main>` is the precedent (`app/(admin)/layout.tsx`, guarded by `layout.test.tsx`). jsdom cannot see this; measure `documentElement.scrollHeight` in a browser. |
| Severity | Medium |
| Status | applied (2026-10-05) |

### P4

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | KZ-011 |
| Edit | Add source `actors/consent-intake/intake-required-fields`, recurrence ×5. Execute-time design edits and briefs authored by the Leader are part of the untrue-spec surface too: the T-2 array-only `meta.target` was refuted by a real-engine probe, and the T-8 design under-scoped the API section that the requirement named. **Probe the engine or re-read the requirement before writing an execute-time design edit.** |
| Severity | High |
| Status | applied (2026-10-05) |

### P5

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | KZ-008 |
| Edit | Add source `actors/consent-intake/intake-required-fields`, recurrence ×9. An Implementer reported adding a test assertion to a file that `git status` showed unchanged, and a Reviewer PASSed a TRD row that validation found false. **The Leader checks the claimed file in the diff before relaying a completion report.** |
| Severity | High |
| Status | applied (2026-10-05) |

### P6

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | KZ-001 |
| Edit | Add source `actors/consent-intake/intake-required-fields`, recurrence ×4. A clause with no owner (FR-1 "same field-level messages") was found at T-1's review. An NFR-4 clause recorded covered in `execution.md` had no code, and only the independent coverage validator found it. |
| Severity | High |
| Status | applied (2026-10-05) |

### P7

| Field | Value |
|---|---|
| Kind | trd-adr |
| Target | `docs/trd/trd.md` |
| Edit | Allocate the number for the ADR already written as **`ADR-NNN`**: "duplicate detection on identity replaces the Trader-ID natural key as the duplicate guard". It supersedes no existing ADR. Sweep all 4 citations (the §3 `Trader_id` row, the §3 ActorSequence paragraph, the §12.5 index row, and QA-9). Then sweep `docs/specs/actors/consent-intake/consent-request-email/proposal.md`'s 5 "ADR-017" mentions if the allocated number takes 017. Run the unmerged-branch check first (CLAUDE.md *Concurrency protocol*, corollary). |
| Severity | Medium |
| Status | applied (2026-10-05, allocated ADR-017; proposal.md's 5 pre-allocated "ADR-017" mentions reset to ADR-NNN, since that number is now taken) |
