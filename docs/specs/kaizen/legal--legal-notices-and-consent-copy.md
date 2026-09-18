# Kaizen — legal/legal-notices-and-consent-copy

| Field | Value |
|---|---|
| Spec | `docs/specs/archive/2026-09-15-legal--legal-notices-and-consent-copy/` |
| Date | 2026-09-15 |
| Branch Context | **spec branch** (`feat/legal-notices` ≠ `main`, resolved by fact against the `Default Branch:` pin, not by fallback) |
| Status | **Applied 2026-09-18** on `main`, via an isolated `git worktree` (the checkout was occupied by another branch). All ten items below are drained; the table is kept as the record of what was written and why. |

## Measure

| Signal | Value |
|---|---|
| Reviewer FAIL rework attempts | **3** (T-1, T-8, T-9 — each FAILed once, each passed on attempt 2) |
| HALTs / FATAL_FAILs / Pivots | 0 |
| Validation FAIL findings | **4 blocking, 6 serious, 4 ledger-integrity, 4 stale comments** — from three parallel validators |
| Net code LOC | **3,567** against a declared ~700 — a **5×** breach (1,705 of it Legal's prose) |
| Review rounds | **9** against a declared ~4 |
| Defects originating in Implementer work | **0** |
| Defects originating in Leader-authored text | **all of them** |

That last pair is the run's headline and every lesson below descends from it. Three tasks failed review, and all three failed on defects in the brief or the spec that governed them — a falsifier that could not fire, two tautological gates, and task text contradicting the code it described. The implementations were sound each time.

## Lessons

### L-1 — Verify which constraint binds before adjusting the one you assume binds · Product · Medium

Widening the legal pages was attempted **three times with zero visible effect**: `max-w-3xl` → `4xl` → `5xl`. Every paragraph and list carried `max-w-prose` (65ch, measured at 574px), which capped the text regardless of the container. The product owner reported "still too narrow" after the first two attempts; the Leader kept adjusting the same knob.

**Root cause:** the container was *plausibly* the width control, so nobody measured which element was actually limiting. One `getBoundingClientRect` on a rendered paragraph would have answered it in seconds — and did, once run.

**Why this is not just "measure, don't estimate":** the existing rule tells you to measure *the outcome*. This one is about measuring *the mechanism* — when an adjustment produces no effect, the next move is to find the binding constraint, not to make the same adjustment larger. Repeating an ineffective change is evidence about your model, not about the magnitude.

**Evidence:** `execution.md` → *"Unlogged visual rework, now recorded (L-4)"*; `LegalDocumentView.tsx`'s width comment.

### L-2 — A premature `[x]` does not merely lose evidence; it suppresses re-examination of everything downstream · Methodology · **High**

T-10 was correctly recorded `[~]` with a named deferred half, then flipped to `[x]` in the same command that closed T-8 and T-9 — against an `execution.md` entry that said, in so many words, *"This task stays `[~]`, not `[x]`… marking it complete would be an unfalsifiable completion."*

The known cost of that inversion is a traceability hole. **The measured cost here was larger and different in kind:** T-10 had swept `docs/ux-ui/design.md` *before* T-8/T-9 landed the approved texts. With the box checked, the ledger read closed, and **nothing re-examined the baseline** — so four false statements about `/terms` and `/privacy` survived into `main`'s candidate, in the document that trains every future agent. It took three independent validators to find them.

**Root cause:** the existing rule is framed as *evidence-for-audit*. Its live function is a **re-entry point**: a `[~]` is what makes a future pass look again. Closing it early removes that, and everything the task was still owed becomes invisible rather than merely unproven.

**Evidence:** `validation-report.md` findings B-1 and B-2; `execution.md` → *"T-10 (resumed)"*.

### L-3 — Parallel independent validators, each told not to defer, is the countermeasure that works — and it is structural, not procedural · Methodology · High

Seven sequential Reviewer passes ran during execution. Every one audited a **diff against its task**, and all seven missed the four blocking findings — because none of them was defects *in* a diff. Three validators scoped to one dimension each, run in parallel, explicitly instructed not to defer to the Leader's framing, found them in one pass, and **converged independently** on the same shape.

This is KZ-012's recorded countermeasure applied a second time with the same result. Its value is not more eyes: it is that a per-task Reviewer is structurally incapable of seeing a cross-task claim, and an author checking their own closure claim cannot see it either. Two of the four blocking findings were *false statements in documents asserting their own completeness*.

**Evidence:** `validation-report.md` (method note and the convergence across dimensions 1–3).

## Noted, not a lesson

- **The budget breach (5× LOC) was escalated verbally and never written down.** The tripwire's instrument value is in the record; a breach that leaves no trace disarms it retroactively. Already covered by KZ-005's severity raise — noted, not re-lessoned.
- **T-9's entry was headed `PASS` while its body described an attempt-2 Reviewer FAIL** that the Leader then fixed with no re-review. Corrected in place. Instance of KZ-008, not a new root cause.
- **The unfilled-field inventory added during remediation initially had the same defect it was built to catch** — a closed label list that a new blank field passed straight through, demonstrated by a falsifier that did not redden. Generalizing it produced false positives on Legal's prose colons, so it was reverted to a named list with the limit documented. Worth recording as a concrete instance of the trade, not as a lesson.

## Pending Items

~~All await the apply phase on the default branch.~~ **All applied 2026-09-18.** P-10 required no edit: ADR-014 was already written at T-10 and re-verified free across all twelve remote branches before the PR merged.

| # | Kind | Target | Severity | Content |
|---|---|---|---|---|
| P-1 | `digest-update` | `docs/specs/kaizen-log.md` KZ-002 | High | Recurrence **×8**. Three gates the Leader authored could not fire: a falsifier naming `'use client'` + a hook as breaking static export (**measured false** — such a page prerenders and hydrates), and two wiring assertions tautological on a one-element registry. **New shape: the falsifier was wrong, not the test.** A demonstrated-falsifier requirement catches a weak test; it does not catch a *correct* test paired with a mutation that cannot exercise it. The check is to name the mutation **and confirm the harness can observe it**. |
| P-2 | `digest-update` | `docs/specs/kaizen-log.md` KZ-004 | High | Recurrence **×5**. Two incomplete two-direction sweeps by the Leader in one run — a label's focus-order reference in a sibling test, and a `§4` non-goal left forbidding what a new decision authorized, leaving one document simultaneously forbidding and permitting the same change. Both found by others. **The rule is easy to state and hard to execute; the reliable form is to grep the withdrawn premise and read every hit, not to fix the cited site.** |
| P-3 | `digest-update` | `docs/specs/kaizen-log.md` KZ-011 | **High** | Recurrence, at scale. ~20 false statements across the four spec documents and the ledger, against **zero** defects in Implementer work. Every AKILI gate asks *does the code match the spec*; this run's entire defect population was in the half nothing audits. **Widen the row: the audit trail itself (`execution.md`) is part of the untrue-spec surface, and its Document Control block described a different run than the one it recorded, for the whole run.** |
| P-4 | `digest-update` | `docs/specs/kaizen-log.md` KZ-001 | High | Recurrence. Two clauses owned by no task and guarded by no test (FR-3 sc.3's `THEN`, FR-6's `FOOTER_LINK_CLASSES`), while `tasks.md`'s own Coverage-closure section asserted every clause was owned. **New shape: the closure claim and the closure gap were in the same document, written by the same author.** Closure is only established by an enumeration that assumes nothing — it cannot be self-certified. |
| P-5 | `standardization` | `.agents/leader.md` → *Applying a correction* | High | Add: *"A `[~]` is a re-entry point, not only a record. Flipping it to `[x]` early does not merely lose evidence — it removes the signal that makes a later pass look again, and everything the task still owed becomes invisible rather than unproven. Never flip a status box in the same write as another task's; re-read the task's own entry first."* (L-2) |
| P-6 | `standardization` | `docs/specs/general-setup/task.md` → *Testing & Verification* | High | Add: *"Naming a falsifying input is not enough — confirm the harness can observe it. A mutation the gate structurally cannot see proves nothing while reading as rigour, and the defect is in the falsifier, not the test."* (P-1's new shape) |
| P-7 | `standardization` | root `CLAUDE.md` → *Model Routing* or a new validation note | High | Add: *"Sequential per-task Reviewers cannot see a cross-task claim. Before archiving, run validators scoped by dimension, in parallel, each instructed not to defer to the Leader's framing."* (L-3) |
| P-8 | `standardization` | `frontend/CLAUDE.md` | Medium | Add: *"When an adjustment produces no visible effect, find the binding constraint before repeating it larger. `max-w-prose` on a child caps text regardless of the container's `max-w-*`."* (L-1) |
| P-9 | `factual-sweep` | root `CLAUDE.md` → Spec taxonomy | Low | `docs/specs/` gains a `legal/` domain. The taxonomy list names `actors/`, `seed-map/`, `import-export/` as examples and the enumeration is illustrative, so this is a refresh rather than a correction. |
| P-10 | `trd-adr` | `docs/trd/trd.md` | — | **None.** ADR-014 was already written at T-10 as part of FR-8's scope, on this branch. Recorded here so the apply phase does not allocate a second number for the same decision — and so the standing caveat travels with it: **ADR-014 was allocated from a spec branch and must be re-verified free before merge.** |

**No Methodology lesson is proposed for upstreaming beyond P-5, P-6 and P-7**, which are AKILI-general and worth carrying to the methodology repository.
