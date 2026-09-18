# Kaizen Entry — actors/public-profile-disclosure

## Document Control

| Field | Value |
|---|---|
| Spec | `actors/public-profile-disclosure` |
| Archived | 2026-09-08 → `docs/specs/archive/2026-09-08-actors--public-profile-disclosure/` |
| Retrospective date | 2026-09-08 |
| Branch Context | **spec branch** (`public-profile`; no `Default Branch:` pin in the root guides, which resolves the same way) — every item below is recorded, none applied |
| Lessons distilled | **2** new · 5 recurrences raised on existing digest lessons |
| Outcome | Validated **PASS**, 7 FAIL-level defects found and closed during validation |

## Metrics

| Signal | Value |
|---|---|
| Tasks | 20 (19 planned + T-20 added mid-flight on user approval) |
| Reviewer FAIL rework rounds | **8** across T-1, T-3, T-6, T-10, T-11, T-13, T-16, T-17, T-20 |
| Tasks reaching the 3-attempt ceiling | **3** — T-16, T-17, T-20 |
| HALTs / FATAL_FAILs / Pivots | 0 |
| Judgment Day | terminal state **ESCALATED**, corrections applied |
| Validation FAIL / WARN | **7 FAIL** (all closed) · 11 advisories (all closed) |
| Net deliverable LOC | **+2,228** against a 1,700–2,400 band — inside |
| Instances of the dominant defect | **18** |
| Leader process failures | 2 mis-routed findings · 3 invalid measurements · 2 false claims of its own |

**The number that matters:** of the 18 instances of this spec's dominant defect, **zero were caught by a test suite and all 18 were caught by someone reading.**

## Lessons

### L-1 · "No requirement covers it" is a scoping fact, not a licence to defer a regression the spec caused

**Root cause.** Two findings were routed out of the spec on the grounds that no FR/NFR mentioned them and the file was absent from `design.md` §4's closed set. Both were re-classified by an auditor as belonging to the spec, and the measurement is unambiguous:

- **`AUDITABLE_FIELDS`** — the audit boundary was **complete** on `main` (21 members covering all 25 `AdminActor` fields bar the 4 excluded by design). T-2 added `contactPerson`/`otherCrops` to `AdminActor` and did not extend it. Because `logUpdate` returns `null` on an empty diff, an admin edit changing **only** `contactPerson` wrote **no audit row at all**. This spec opened the hole; it did not inherit one.
- **TRD §3** — complete and true before, because the columns did not exist. T-1 added them and T-17 rewrote only the surrounding prose, leaving §3's entity table contradicting the paragraph directly below it.

The reasoning error is the substitution of a **scope** test for a **correctness** test. "Is this in scope?" and "did we break it?" are different questions, and the second one governs. `design.md` §4 already names the correct mechanism for a needed-but-unscoped file — *"a budget-tripwire event, not a silent addition"* — and that mechanism was used correctly for T-20 in the same spec, so the failure was not ignorance of the rule.

**Evidence.** `validation-report.md` §8 *"Two findings the Leader wrongly routed out"*; `execution.md` → T-2 advisory 1.

**Target:** Methodology.

### L-2 · A measurement taken while your own delegates run is not slow, it is wrong — and writing that down does not stop it

**Root cause.** Three invalid measurements in one spec, all from the same act: measuring without first establishing that nothing else was measuring.

| # | What happened | Cost |
|---|---|---|
| 1 | Ran the gate immediately after a worker reported | 1 phantom failure; 4 re-runs to disprove |
| 2 | Ran the full suite as bare `npm test` (parallel) | **21 phantom failures**; nearly "fixed" 21 working tests |
| 3 | Started a diagnostic run while three stability runs were in flight | **Contaminated the evidence for the only open finding** |

The third is the one that matters, and not because of time: it destroyed the ability to characterise a real finding's failure rate. And the lesson was **already written in this spec's own `execution.md`** before the third occurrence — so the countermeasure cannot be a note. It has to be a precondition that runs before the command.

**Evidence.** `validation-report.md` §12; `execution.md` → T-17 *"Two invalid measurements"*.

**Target:** Methodology.

## Noted, not a lesson

- **The spec delivered what it promised.** 20/20 tasks with Reviewer evidence, six gates green, code inside its LOC band with an extra task added mid-flight. The defect density below is a record of a working review loop, not of a failing spec.
- **What worked and should be repeated:** validation by **four independent read-only auditors**, each given one dimension and an explicit instruction not to defer to the Leader's framing. They produced both re-classifications in L-1, and twice corrected the Leader directly — once on a wording the Leader had specified (`geo`/`export` in the persona contracts), once on a claim the Leader had relayed from a prior reader without opening the artefact (ADR-008's non-existent revisit clause).
- **The asymmetry that carries the design:** withholding the contact block from the list projection makes bulk harvesting structurally impossible rather than policy-forbidden, because the map, dashboard and CSV are all built from that response. It was not in the approved proposal — it replaced a CSV-only mitigation that Judgment Day showed was inert.
- **Human verification is not a formality here.** D-8 could not be closed by any harness in this repo: `jsdom` computes no colour, `axe` returns *incomplete* for contrast, and `contrast.test.ts` is arithmetic over CSS constants. The T-19 entry cites all three **only as refusals**, which is the correct handling and worth preserving as precedent.
- **A Leader-authored artefact nobody audits:** in two of the three ceiling-reaching tasks the defect was in the **task text**, not the Implementer's work — T-17's `Verify` was a six-path grep in a repo-wide requirement, and T-20's `Done-when` presupposed a badge that could not be made true. Filed as a KZ-011 recurrence (P6) rather than a new lesson.

## Pending Items — **APPLIED 2026-09-09 on `main`** (user-approved)

> **P11 (ADR-013 exposure) resolved without action:** `main` now carries ADR-013 from this spec's own merge, so the collision it warned about never materialised and no renumbering is owed.
> **P10** was recorded-only by design — history is not rewritten.
> **P1's KZ-008 update** was absorbed into that row's chronological renumbering and compression (it became ×6, not the ×3 this file claimed — see the collision note below).

### P1

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `docs/specs/kaizen-log.md` § Active Lessons → **KZ-008** |
| Edit | Raise to **Recurrence ×3 (2026-09-08)** and append: "**×3 — 18 instances in a single spec** (`actors/public-profile-disclosure`), none caught by a suite. Instances 13 and 14 landed *inside the diff whose job was closing the first twelve*; 16 attributed to ADR-003 a premise it never held, refutable from a cell two lines above it in the same table; 17 and 18 were the Leader's own, one inside the validation that was hunting for them. The countermeasure is mechanical, never attitudinal: open the file, grep your own diff, run the mutation, let the compiler name the set, and **check the polarity separately from the name** — a right name with a wrong direction is still the defect." |
| Severity | **High** — the digest already predicted this ("recurs at every level of its own correction") and the prediction held |
| Status | **applied 2026-09-09** |

### P2

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `docs/specs/kaizen-log.md` § Active Lessons → **KZ-002** |
| Edit | Append three new variants: "(a) **a gate whose own Verify cannot reach its requirement** — T-17's Verify was a grep over six fixed paths in a task requiring a repo-wide sweep; that list had already hidden `backend/CLAUDE.md` from the requirement's own table and hid six more survivors. (b) **KZ-002 with the sign reversed** — `infra/scripts/smoke.sh` fail-closed on a key the change made legitimately public, so the deploy gate would have failed against *correct* code; no test in the repository covers `infra/scripts/`. (c) **a quality scenario emptied by a constant** — TRD QA-13 quantified over `PII_ALLOWLIST`, which this spec emptied, and was a category error even before that." |
| Severity | **High** |
| Status | **applied 2026-09-09** |

### P3

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `docs/specs/kaizen-log.md` § Active Lessons → **KZ-001** |
| Edit | Append: "**Recurrence — and the gap was in the tests, not the decomposition.** Validation at clause granularity found three clauses with no falsifiable guard, including one (FR-4's derive prohibition on the import path) whose only test **passed with the defect present**, because the row it ran against had every derive-source empty too." |
| Severity | Medium |
| Status | **applied 2026-09-09** |

### P4

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `docs/specs/kaizen-log.md` § Active Lessons → **KZ-005** |
| Edit | Append: "**Recurrence.** A `~2,080 net LOC` figure was asserted by three documents (`design.md` §16, `tasks.md`, `execution.md`) and **measured by none**; two of the eighteen per-task deltas it summed were never recorded. The real figure (+2,228) was inside the stated band, so the claim was lucky rather than verified." |
| Severity | Medium |
| Status | **applied 2026-09-09** |

### P5

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `docs/specs/kaizen-log.md` § Active Lessons → **KZ-012** |
| Edit | Append: "**Recurrence, with a countermeasure that worked.** NFR-2's falsifiability evidence (T-12's mutation reds) was Leader-produced and unrepeatable by its Reviewer. The compensating move that did work was structural, not procedural: `/akili-validate` ran **four independent read-only auditors**, one per dimension, each told explicitly not to defer to the Leader's framing — and they re-classified two of the Leader's own routing decisions." |
| Severity | Medium |
| Status | **applied 2026-09-09** |

### P6

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `docs/specs/kaizen-log.md` § Active Lessons → **KZ-011** |
| Edit | Append: "**The task's own `Verify` and `Done-when` are part of the untrue-spec surface.** In two of three ceiling-reaching tasks the defect was in the Leader-authored task text, not the Implementer's diff: T-17's `Verify` could not detect what the task existed to detect, and T-20's `Done-when` prescribed relabelling a badge whose premise T-1 had already removed. The Reviewer audits the diff *against* the task; nothing audits the task against reality." |
| Severity | **High** |
| Status | **applied 2026-09-09** |

### P7

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `.agents/leader.md` |
| Edit | Append: "**Establish quiet before measuring.** A build, test run, or SAM validate taken while any delegate is active is not a slow measurement, it is a **wrong** one. Before any measurement, confirm no worker is running *and* confirm the invocation's own concurrency (a bare `npm test` may be parallel). Re-measure once on a quiet tree before treating a single failure as real, and once more before treating a single pass as evidence." |
| Severity | **High** |
| Status | **applied 2026-09-09** |
| Upstream | Yes — this is L-2, and the failure mode is generic to any Leader-orchestrated run, not to this project. |

### P8

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `.agents/leader.md` |
| Edit | Append: "**Routing test: scope, then causation.** Before routing a finding out of a spec, answer both — (1) is it in scope? and (2) **did this spec cause it?** A finding that fails (1) but passes (2) belongs *inside* the spec; use the budget-tripwire escalation, not the advisory queue. \"No FR/NFR mentions it\" decides who pays, never whether it is a defect." |
| Severity | **High** |
| Status | **applied 2026-09-09** |
| Upstream | Yes — this is L-1. |

### P9

| Field | Value |
|---|---|
| Kind | factual-sweep |
| Target | `docs/specs/bugfix/flaky-frontend-suite/proposal.md` § Non-goals |
| Edit | The line *"Backend (`backend/`) test stability — not observed to have this problem"* is **now false**. Replace with: "Backend test stability — **now observed** (`actors/public-profile-disclosure` validation, 2026-09-08): `contact.e2e.spec.ts` fails intermittently in a full run and passes 23/23 in isolation ×3, and it **survives `--runInBand`**. The suite owns a rate limiter; the throttle counter leaks across test files, so a request the test expects validation to reject with 400 is rejected by the limiter with 429. Same mechanism as the frontend cases this proposal was written for." |
| Severity | Medium |
| Status | **applied 2026-09-09** |
| Note | This spec's R-1 needs **no new proposal** — it needs this non-goal revisited. Filing a fresh spec would have duplicated an existing draft whose scope statement is the only thing excluding the case. |

### P10

| Field | Value |
|---|---|
| Kind | factual-sweep |
| Target | This entry file (recorded, not swept — the false claim is already committed) |
| Edit | Commit `c6a88c8` states *"CLAUDE.md has long mandated `--runInBand` for this backend (four recorded contention incidents)"*. **`CLAUDE.md` contains no mention of `--runInBand`.** The mandate and the incident count live in archived spec `execution.md` files (`2026-08-08-enhancement--app-visual-refresh`, `2026-08-06-actors--public-self-registration`), not in the constitution. The substance was correct and independently re-verified; the **citation** was not — it was carried from this session's own conversation summary rather than read from the artefact. **Instance eighteen**, in the commit that fixed the problem it mis-cited. Not amended in history; recorded here. |
| Severity | Medium |
| Status | recorded (no action — history is not rewritten) |

### P11

| Field | Value |
|---|---|
| Kind | trd-adr |
| Target | `docs/trd/trd.md` § ADR index — **exposure note, no edit** |
| Edit | T-18 allocated **ADR-013** on this spec branch after a KZ-010 pre-flight across all 20 local and remote refs (highest anywhere: ADR-012; 013 held by nobody). `main` still holds no ADR-013. Per `CLAUDE.md`'s KZ-010 corollary the check does not make the number free — it only decides **who pays the renumbering, and the answer is always the branch**. If `main` allocates 013 before this merges, this branch renumbers ADR-013 and its citations in `docs/trd/trd.md` (§12.5 entry, ADR-003's status cell, ADR-004's forward pointer, QA-1's tactic citation). Verify at merge time, not now. |
| Severity | Medium |
| Status | **applied 2026-09-09** |

### P12

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `docs/infrastructure.md` § Local Environment |
| Edit | The contract states that *"only `DATABASE_URL` must be edited"*. That is false for any admin work: `/login` and every `/admin` route need `NEXT_PUBLIC_COGNITO_USER_POOL_ID` and `NEXT_PUBLIC_COGNITO_CLIENT_ID`, and **neither is in `frontend/.env.example`**. A fresh checkout following the documented contract cannot sign in as admin at all. Add both to the example file and correct the contract sentence. |
| Severity | Medium |
| Status | **applied 2026-09-09** |
| Note | Found while preparing the manual-test walkthrough, not by any gate. Independent of this spec. |

---

## Recurrence-number collision, found at apply time (2026-09-09)

This file's KZ-008 recurrence number **collided with three other specs'**. Five entry files, each written on its own branch against a digest that had not absorbed the others, produced *three* claims of `×3` and *two* of `×4`. All were renumbered chronologically at apply time; KZ-008 is now **×7**, the most recurrent lesson in the log.

Root `CLAUDE.md` § Concurrency protocol already carried this rule for ADR numbers — **nobody had applied it to recurrence counters, which are the same kind of monotonic id in the same kind of shared document.** The check is now written into `kaizen-log.md`'s preamble: before taking a recurrence number, `grep -l 'KZ-0NN' docs/specs/kaizen/*.md` and read what each pending item claims.
