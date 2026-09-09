# Kaizen Entry — enhancement/map-coordinate-picker

## Document Control

| Field | Value |
|---|---|
| Spec Path | `enhancement/map-coordinate-picker` |
| Date | 2026-09-08 |
| Branch | `map-picker` — **spec branch** (default is `main`); items below are recorded, not written |
| Archive Run | 1 |
| Jira | ATP-55 (Option 2 only) |

## Metrics

| Signal | Value | Source |
|---|---|---|
| Tasks | **7 of 7**, none added mid-execution | `tasks.md` |
| Reviewer rounds | **15** | `execution.md` (recounted from its entries, not from recall) |
| Reviewer FAILs | **7** (T-1 ×1, T-2 ×2, T-3 ×1, T-5 ×1, T-6 ×1, T-7 ×1) | `execution.md` |
| First-attempt passes | 2 of 7 (T-4, and the post-T-3 advisory round) | `execution.md` |
| HALTs / FATAL_FAILs / Pivots | **0 / 0 / 0** | `execution.md` |
| Judgment Day | 13 findings, 1 fix-round regression, APPROVED | `judgment.md` |
| Budget breaches | **LOC 3× (620 → 635 → ~900 → retired; actual 1,192)**, rounds 1× (9 → 16; spent 15) | `design.md` §11 |
| Test-to-prod ratio | 0.61 estimated → **0.87 actual** (prod 639, test 553) | measured at validation |
| Validation | **0 FAIL · 6 WARN · 1 BLOCKED** — no finding in the code | `validation-report.md` |
| `/akili-test` | **not run** — author == tester throughout | `validation-report.md` §7 |
| **False claims in the record** | **9, of which 5 were the Leader's** | `execution.md`, `judgment.md` F-1 |

**Two dominant signals.** All **seven** KZ-002 instances sat in *verification lines* — never in a requirement, never in design intent. And all nine false claims share one mechanism: a property of an artefact asserted without opening it. Neither is a new lesson; both are recurrences queued below. What *is* new is who produced them.

## Lessons

Two. Everything else is recurrence of KZ-002, KZ-005, KZ-008 or KZ-012 and is queued as a digest update rather than duplicated as a lesson.

### L-1 — The Leader is the only actor in the triad whose output nothing audits

**Target:** Methodology · **Severity:** High

The Implementer has a Reviewer on a different model. The Reviewer's findings get adjudicated by the Leader. **The Leader's own output — spec text, briefs, figures, ledger entries — goes straight into the run unread by anyone.** It is the one role with no counterpart, and in this spec it was the largest single source of defects.

Evidence, all from this spec's own record:
- **5 of 9 false claims were the Leader's**: a `*`-quantified regex artefact written up as a seed-data count (`judgment.md` F-1); `LatLngTuple`'s arity inferred from a compiler message that names the alias without expanding it; `buildPayload` written from memory where the file says `buildDto`; *"git history is permanent"* applied to files never committed; and a guide claiming both map surfaces import all four shared constants when one imports three.
- **Round counts were reported from recall across three consecutive gates** and drifted upward (real 5, reported 7; real 10, reported 12–14) — and a **budget escalation was made on the inflated figure**.
- A brief handed an Implementer the wrong function name; another told it to keep a guard that was dead; a durability paragraph contradicted a carry-over the Leader itself had written two tasks earlier.
- **None of the five was caught by re-reading. Every one was caught by measuring** — by a Reviewer opening the artefact, or by the Leader finally running the command.

The pattern is not carelessness. It is that **reading *about* an artefact feels like reading the artefact**: a grep's output, a compiler's message, a remembered symbol, a general truth about git. Each is a real observation of something adjacent to the thing being claimed.

**Proposed edit:** `.agents/leader.md` § Reporting To The User — *"Any figure you report (counts, budgets, sizes, round totals) must be recomputed from the artefact at the moment you report it. A number carried between turns is recall, not measurement. This applies to your own ledger above all: it is the one document no Reviewer audits."*

### L-2 — "Demonstrate the falsifier" earned its cost, and belongs on every gate rather than only on generated-output greps

**Target:** Methodology · **Severity:** Medium

KZ-002's standing rule requires a differential baseline for gates that grep **generated output**. This spec required a demonstrated falsifier for **every** task, and that wider application is what found four suites that could not discriminate:

| Suite | Mutation that left it green |
|---|---|
| T-1 | a single-axis `isSamePoint` passed all 18 tests |
| T-4 | bare `<button>`s in place of `Button` left all 12 green (NFR-2's focus clause) |
| T-5 | deleting `initiallyOpen` reddened zero tests |
| T-6 | swapping the coordinate props left every test green |

None involves generated output; none would have been caught under the narrower rule. The cost is one paragraph per task brief and a revert; three of the four were found by the Implementer itself before review.

**Proposed edit:** `docs/specs/general-setup/task.md` § Testing & Verification — widen the differential-baseline rule from *"a `Verify` command that greps or counts generated output"* to *"every gate a task declares"*, keeping the generated-output case as its sharpest instance.

## Noted, not a lesson

- **The forward-pointer mechanism worked and is worth keeping.** Constraints discovered in one task's review were carried verbatim into a later task's brief (`isSamePoint`'s no-normalization contract into T-3; the 0×0-container hazard into T-4/T-5). Both prevented defects no test could have caught. The Leader's own note — *"a pointer filed three tasks ago is not carried by having been filed"* — is the operative half.
- **Process proportionality held under pressure, twice.** The `design.md` §13 browser harness was assessed and **not built** — it would guard finished, rarely-touched code whose failures are visible rather than silent. The pin-click residual was measured, classified conformant, and left unfixed by user decision. Both are recorded as decisions, not omissions.
- **LOC was retired as a tripwire rather than raised a third time.** Two raises with no scope change is evidence the metric is measuring the wrong thing; tasks and review rounds stayed live.
- **`author ≠ auditor` was structurally enforced** by the `.claude/agents/` wrappers (Implementer sonnet, Reviewer opus) and never collapsed on review — only on test authorship (see the KZ-012 digest update).

## Pending Items — **APPLIED 2026-09-09 on `main`** (user-approved)

Recorded on the `map-picker` spec branch; applied in the first default-branch pass after the merge.

### Kind: `guide-sync` — **already applied during execution, no pending write**
`frontend/CLAUDE.md` gained a *Map surfaces* section and `frontend/AGENTS.md` its mirror (rule 6, list renumbered 1–9), covering the two silent-failure traps, the shared-constants rule and the seam-purity rule. Applied mid-execution under `/akili-execute` Step 3.5's "actively misleading" clause rather than deferred. **Nothing further owed.** Root guides swept for falsified claims: none found.

### Kind: `trd-adr` — **none**
DD-6 deliberately allocated no ADR (no new module or service in the architectural sense, no integration, no persistence or topology change). The shared counter was never touched.

### Kind: `standardization` — both applied

> The digest was at **8,120 bytes against its ~8 KB cap** when these landed. Following this log's own guidance (*"prefer raising the budget"*), the cap went to ~12 KB rather than retiring rows. **KZ-011 was explicitly not retired** despite qualifying: it is the *claims-must-cite-where-verified* lesson, and this spec violated it five times while it sat marked `Applied` — retiring it as held would be the exact failure the preamble describes.
| Id | Target | Edit | Severity | Status |
|---|---|---|---|---|
| S-1 | `.agents/leader.md` § Reporting To The User | L-1's recompute-every-figure clause | High | **applied** |
| S-2 | `docs/specs/general-setup/task.md` § Testing & Verification | L-2's widening of the differential-baseline rule | Medium | **applied** |

### Kind: `digest-update`
| Id | Lesson | Update | Status |
|---|---|---|---|
| D-1 | **KZ-002** | Recurrence **×5**. New locus, and it is the finding: **all seven instances in this spec were in *verification lines*** — never in a requirement, never in design intent. The spec's content survived two judgment rounds and fifteen reviews; the gates authored alongside it failed seven times. Three were caught only because a Reviewer read *one task ahead* (T-3's `npx eslint` could not start at all in `frontend/`) | **applied** |
| D-2 | **KZ-008** | Recurrence **×4 → ×5**. New mechanism to name: the failure is not carelessness but that **reading *about* an artefact feels like reading it** — a grep's output, a compiler message naming an alias, a remembered symbol, a general truth about git. Five instances, all the Leader's, all caught by measuring and none by re-reading | **applied** |
| D-3 | **KZ-005** | Extend to the **Leader's own ledger**: round counts reported from recall across three gates, drifting upward, with a budget escalated on the inflated figure — then the same basis re-asserted as *"measurable and true"* in the very paragraph admitting the counts were kept by memory. KZ-005 surviving its own correction | **applied** |
| D-4 | **KZ-012** | Extend to **test authorship**. `author ≠ auditor` held on review and never on testing: `/akili-test` was not run, so every test was written by the agent that wrote the code. Four non-discriminating suites resulted; three were caught anyway by the demonstrated-falsifier rule (L-2) | **applied** |
| D-5 | **KZ-004** | Recurrence. Two corrections were applied to a cited site and not swept: `execution.md`'s own header kept the retired `635 LOC · 9 review rounds` that the same sweep fixed in `tasks.md`, and a coverage-row demotion at the T-6 gate was never applied to the two sibling rows found one task earlier | **applied** |
