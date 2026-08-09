# Kaizen Log

Continuous-improvement record for this project, updated automatically by
`/akili-archive` (Kaizen Retrospective, powered by the `kaizen` skill).
Other AKILI commands read only the `## Active Lessons` table below —
keep it at 10 rows or fewer.

## Active Lessons

| ID | Lesson | Source Spec | Severity | Target | Standardized In | Status |
|---|---|---|---|---|---|---|
| KZ-001 | Decomposition must close coverage at **scenario and clause** granularity, not requirement ID; a gap may never be discharged by citing a different requirement that is satisfied | actors/registration-source-and-consent | High | Product + Methodology | `docs/specs/general-setup/task.md` § Coverage closure | Applied |
| KZ-002 | A presence-assertion (class/config/attribute exists) is not a behavioral proof — it must record what it cannot prove, and a property the harness cannot evaluate is **not covered**. **Recurrence ×2 (2026-08-05): extended to documents** — a procedure carrying every required clause can still be unexecutable. **Recurrence ×3 (2026-08-08): now in the verify command itself** — a gate that greps generated output must be run against the pre-change state and shown to differ; a gate that cannot fail is not a gate | actors/registration-source-and-consent · import-export/partner-profile-onboarding · enhancement/form-elevation-ux | High | Product + Methodology | `docs/specs/general-setup/task.md` § Testing & Verification | Applied |
| KZ-003 | Before deferring a check because it "needs the stack/login/seed data", test that assumption — a component taking plain props renders in a throwaway harness | actors/registration-source-and-consent | Medium | Product + Methodology | `.agents/leader.md` § Deferring a check | Applied |
| KZ-004 | A correction is not applied when its cited site is fixed — grep the superseded value across every document, and mark as resolved everything that *quotes* the corrected figure, in the same change | import-export/partner-profile-onboarding | High | Product + Methodology | `.agents/leader.md` § Applying a correction | Applied |
| KZ-005 | Every numeric claim must be cross-checked against narrative prose in the same spec before publication; a count that contradicts a sentence in a sibling document is a defect detectable without re-measuring | import-export/partner-profile-onboarding | Medium | Product + Methodology | `docs/specs/general-setup/requirements.md` § Writing Standards | Applied |
| KZ-006 | A **constraints-not-mechanism** section answered with a new schema object must sweep the design's own object list **in the same change** — migration-only is the C-10 disclosure failure | actors/public-self-registration | High | Product + Methodology | *pending* | Recorded |
| KZ-007 | **Constraint sets are conjunctive.** Satisfying each member individually can still break the set; review must reason about **interaction**, since no test covers a defect that lives between two correct constraints | actors/public-self-registration | High | Product | *pending* | Recorded |
| KZ-008 | **An assertion about an artefact is a defect when the artefact does not bear it** — and it recurs at every level of its own correction. **Recurrence ×2 (2026-08-08): now extended to evidence artefacts** — capture manifests, README provenance claims, and `execution.md` status tables, not only code comments | actors/public-self-registration · enhancement/form-elevation-ux | High | Product + Methodology | `docs/specs/general-setup/task.md` § Testing & Verification | Applied |
| KZ-009 | **`file:line` is a self-decaying anchor.** Persistent documents cite a symbol, a unique class/literal string, or a section title; bare line numbers belong only in transient agent reports | enhancement/form-elevation-ux | Medium | Product + Methodology | `docs/specs/general-setup/requirements.md` § Writing Standards | Applied |
| KZ-010 | The Concurrency Protocol names the rule (one AKILI session per checkout) but enforces nothing — two branches modified the same forms for 13+ commits each, undetected until a user compared two screenshots | enhancement/searchable-region-select | High | Product + Methodology | `CLAUDE.md` § Concurrency protocol | Applied |

## Entries

### 2026-08-08 — `enhancement/searchable-region-select`

**Measure.** 7 tasks (T-7 added post-hoc, user-authorized) · 6/7 complete, **T-6 held at `[~]`** — mobile checks explicitly escalated per the task's own disqualification bar, not silently passed · Reviewer FAIL rework: T-3 (1 round, coordinate-frame + z-index fixes), T-4 (1 round, a real regression in a file outside the task's original scope), T-5 (1 round, an evidence gap closed without a code change) · **0 HALTs, 0 FATAL_FAILs, 0 Pivots** · Judgment Day: 2/2 rounds, `APPROVED` before execution · environment failures across 3 sessions, none consuming a rework attempt: an in-harness subagent spawn-limit exhaustion, a failed 3-route cross-host fallback attempt (opencode insufficient balance, Antigravity exited after one preamble line twice), and a mid-run session usage-limit cutting off two Implementers (both resumed cleanly from transcript) · **1 major incident:** a parallel AKILI line of work (`enhancement/app-visual-refresh` + `form-elevation-ux`, on a different branch/worktree) had independently modified the same four files for 13+ commits, discovered only when the user compared two deployed screenshots — resolved via a reconciliation merge, not a rework attempt.

**The one lesson.** **KZ-010 — the Concurrency Protocol is advisory prose with no detection mechanism.** `CLAUDE.md` already states "One AKILI session per checkout... Additional concurrent sessions use `git worktree`" — the rule existed and was not violated by *this* session (it worked in its own worktree throughout). It was violated by a *different* session, on a *different* branch, and nothing in `/akili-resume`, `/akili-execute`, or session startup checks whether the files a task is about to touch are already moving elsewhere in the same repo. The divergence ran 13 commits deep on one side and 5 on the other before anyone noticed — via a user's visual comparison of two screenshots, not any AKILI mechanism.
- Evidence: this spec's `execution.md` → "Session 3 (continued) — merge with the parallel app-visual-refresh-v2 / form-elevation-ux line."
- Cost: one full reconciliation merge (2 real code conflicts, both in the same Location fieldset shape, resolved by hand), plus the standing risk that either branch could have been force-pushed or discarded first, destroying the other's unmerged work with no warning.
- Standardization: one line added to `CLAUDE.md` § Concurrency protocol instructing a `git log --all` check over a task's target files before starting or resuming. → **Applied 2026-08-08 (user-approved)**
- Upstream: propose to the AKILI methodology repository — the missing check belongs in the Leader's own pre-flight (`.agents/leader.md` Step 0), not only in this project's copy of the rule, since any project using worktrees for concurrency can hit the same silent divergence.

**Worth recording, not a lesson:** T-6's own disqualification bar — *"'I could not check mobile' is a legitimate, reportable outcome and must be escalated — it must NOT be recorded as a pass"* — held under real pressure to close the spec. Two genuine environment gaps (no Xcode Simulator, Chrome device emulation not reflecting in rendered output) were reported as unverified rather than papered over with a screenshot that happened to render at desktop width. A positive control, not a defect.

### 2026-08-08 — `enhancement/form-elevation-ux`

**Measure.** 6/6 tasks, budget exact · **12 review rounds against an 8-round budget — tripwire exceeded** · **5 Reviewer FAIL rework rounds** (T-2 ×1, T-4 ×2, T-6 ×2) · 1 attempt ceiling reached, not exceeded (T-4) · **0 HALTs, 0 FATAL_FAILs, 0 PRODUCT_BUGs, 0 Pivots** · 2 user-approved spec amendments, neither widening scope · 2 recorded Leader errors + 4 Leader corrections to the record · ~15 advisories, none converted to tasks · `/akili-test` and `/akili-validate` not run, both absences accepted at archive · **16 harness delivery failures** (workers idle without emitting a report, resending completed work on re-prompt), 0 rework attempts consumed.

**The signal that organizes all three lessons: every one of the five FAILs was on a *record*, not on code.** The `self-start` fix and the FR-5 ARIA wiring were correct on attempt 1 and never changed through three attempts. No shipped code defect reached a Reviewer. The spec's entire rework budget went to making its own evidence true.

**Learn — three lessons.**

**KZ-008 (High, recurrence ×2, Product+Methodology).** *An assertion about an artefact is a defect when the artefact does not bear it.* This spec existed **partly to close a KZ-008 citation defect** (FR-4) and produced three fresh instances of the class inside its own execution: T-4 attempts 1 and 2 both FAILed on comment citations, the second reintroducing the defect in miniature while fixing the first; and T-6 round 1 FAILed on `manifest.json` asserting of two PNGs that they showed *"FR-1: card top-left corner, border/radius unbroken"* when **neither image contained a corner** — landing in the evidence index for the spec's **hardest-gated requirement**, after that same spec had already spent FR-4 and two rework rounds removing exactly this class. Round 2 then FAILed on the *remediation*: a new README claiming every manifest entry asserts viewport and stylesheet, false for the 3 crop records — the same three artefacts whose captions had just failed an integrity audit. *Root cause: assertions are written from the author's intent and never re-resolved against the artefact named.* *Evidence: `execution.md` → T-4 attempts 1–2, T-6 "Two rework rounds on the evidence record itself".* **Standardized** in `docs/specs/general-setup/task.md` § Testing & Verification, extending the rule to evidence artefacts.

**KZ-002 (High, recurrence ×3, Product+Methodology).** *A presence-assertion is not a behavioral proof* — this time **in the verify command itself**. `tasks.md` T-3's literal gate, `grep -c 'shadow-lg' .next/static/css/*.css`, **cannot fail**: production CSS is minified onto one physical line and the `:root --shadow-lg:` declaration sits on it, so count-mode grep returned `1` before *and* `1` after. Had T-3 closed on its own command it would have produced a number that looked like evidence and proved nothing — **KZ-002 exactly, in the verify line of a task written to end a KZ-002 failure.** *Root cause: gates authored at specify time are never run against the pre-change state, so nobody learns whether they discriminate.* Caught by the **Implementer**, confirmed independently by the Reviewer; no gate caught it. The working form is `grep -o '\.shadow-lg{[^}]*}'`, expecting two rule bodies one of which contains `var(--shadow-lg)`. *Evidence: `execution.md` → T-3 "The `grep -c` gate is defective".* **Standardized** as a differential-baseline rule in `task.md` § Testing & Verification.

**KZ-009 (Medium, new, Product+Methodology).** ***`file:line` is a self-decaying anchor.*** Distinct from KZ-008 in root cause: KZ-008 is about diligence at write time; this is about an anchor that goes stale **without anyone doing anything wrong**. FR-4's sweep found **10 of 34** `REACHABLE` citations stale — two of them invisible to the Leader's own regex — and one citation false rather than merely displaced. Inside T-4, coordinates went stale **twice within a single task**, and attempt 3 resolved it **subtractively**: the numbers were deleted rather than renumbered, because renumbering restarts the decay. *Evidence: `execution.md` → T-4 attempt 3, T-6 act 1.* **Standardized** in `docs/specs/general-setup/requirements.md` § Writing Standards.

**Standardize.** All three applied, user-approved 2026-08-08. Three constitution edits also applied in the same gate — see below.

**Constitution sync applied (user-approved).** `docs/infrastructure.md` §3 and root `CLAUDE.md`/`AGENTS.md` corrected: `infra/scripts/deploy-frontend.sh` reads `AWS_PROFILE` and **parses no flags**, so the documented `--profile IBD-DEV` form is silently ignored and an ambient profile wins — at T-6 the operator's run announced `MELIA-DEV` and could not find the stack. A constitutional hard constraint that the tooling contradicts is the same defect class as KZ-008, one level up. `frontend/CLAUDE.md`/`AGENTS.md` gained the fieldset/legend card rule and the four-rung elevation ladder.

**The single sentence worth carrying forward**

> A spec that fixes a defect class is the most likely place to reproduce it.

FR-4 was a citation-accuracy requirement. It was executed cleanly — 34/34 re-resolved — while the same spec generated three new instances of the identical class in its task comments and its own capture manifest. Naming a failure mode in a requirement demonstrably does not immunize the work that surrounds it, which is why KZ-008's standardization had to move from "recorded" to a template rule.

**Notable, not a lesson.** The one place a defensible FAIL existed — T-5 closing FR-7 as *"evaluated, no change"* — was ruled a legitimate pass on three independent spec statements, and the report was **better than the premise it was given**: the whitespace it was sent to fix turned out to be underfilled grid cells (`Consent & provenance`: 5 fields in `lg:grid-cols-4`, three adjacent empty cells), which FR-7's own disqualifier forbids touching. Declining to ship a tweak, and saying why, was the correct output.

**A methodology observation for upstreaming.** 16 harness delivery failures across 6 tasks — workers completing work, going idle without emitting the report, then resending the completed audit on re-prompt. The Leader correctly consumed **no rework attempt** for any of them, but at that frequency the distinction between a delivery failure and a work failure needs to be a documented Leader rule rather than a judgment repeated 16 times.

### 2026-08-06 — `actors/public-self-registration` (chunk 3a)

**Measure.** 23 tasks · **11 rework rounds** · ~50 Reviewer lens reports · **1 HALT** (T-7, 3-attempt ceiling, resolved by a user-authorised bounded 4th attempt) · 0 FATAL_FAIL · 0 Pivots · 2 environment failures (classifier outage, usage limits) · **4 recorded Leader errors** · review budget raised 37 → 60 by explicit user decision.

**Learn — three lessons.**

**KZ-006 (High, Product+Methodology, recurrence ×3).** A section that states **constraints rather than a mechanism** gets answered with a new schema object, the migration is updated, and the design's own object list is not — three times in one spec (`EmailSendBudget` undeclared for three tasks, `RegistrationSequence`, `RegistrationLookupAttempt`). This is the **C-10 disclosure failure `A-4` names, recurring inside the spec that names it**, and every correction was a separate Leader action prompted by a Reviewer. *Evidence: `execution.md` → T-10 Leader doc sweep, T-11 third recurrence.*

**KZ-007 (High, Product).** **Constraint sets are conjunctive, and satisfying each member individually does not satisfy the set.** T-11's L-1 (a bound surviving cold starts) and L-4 (reset on success) were both implemented correctly; because the reset keyed on the caller rather than the reference, an attacker holding any valid pair zeroed the counter every ninth guess and 10/hour became ~1,080/hour. **No test could have found it — there was no defect in any single constraint.** Only a reviewer reasoning about interaction did. *Evidence: `execution.md` → T-11 attempt 1.*

**KZ-008 (High, Methodology).** **A comment asserting a property the code does not have is a defect of the same class as a missing test, and it recurs at every level of correction.** T-20 failed three times on this alone: regexes declared "semantic" citing a paraphrase matching none of them; then a pin claiming to cover "any phrasing" while reading only the first `<p>`; then a sanity check whose `.some()` let either fix be reverted green. Also T-8's *"measured"* timing claim, T-13's citation to a completion report that never existed, and six inaccurate comments in T-22 — **the task whose subject is honest coverage accounting**. *Evidence: `execution.md` → T-20 attempts 1-3, T-8 FAIL 3, T-13 attempt 2, T-22.*

**Standardize.** Deferred — presented to the user at archive; no edits applied outside this log.

**Notable, not a lesson.** Three of four Leader errors were caught by an **Implementer declining to let an instruction pass unexamined**, never by a gate — including one where both halves of a Leader's remediation would have silently disabled a security control, on the worker's final attempt before a HALT, with every incentive to comply.


### 2026-08-05 — import-export/partner-profile-onboarding

**Metrics**

| Signal | Value | Source |
|---|---|---|
| Tasks executed | 12 / 12 — **budget exact** | `tasks.md` |
| Reviewer FAIL rework rounds | 6 (T-7 ×2, T-8, T-9, T-10, pivot amendment) | `execution.md` |
| HALTs / FATAL_FAILs / PRODUCT_BUGs | **0 / 0 / 0** | `execution.md` |
| Pivots | **2** formal `## Pivot Record` blocks, both user-approved | `execution.md` |
| Measurement corrections | **15** (C-1…C-15) | `execution.md` |
| Advisories recorded | 27 (A-1…A-27), none converted to tasks | `execution.md` |
| Documentation lines | 1,124 vs ~1,250 planned — **under budget** | `mapping.md` · `reconciliation.md` · `runbook.md` |
| Runtime worker failures | 4 Reviewers lost to `ENOTFOUND` / mid-response disconnects; **0 rework attempts consumed** | `execution.md` |
| Validation FAIL / WARN | — (`/akili-validate` not run; absence accepted at archive) | `archive-summary.md` §6 |
| NFR-9 near-misses | **1** — a real workbook phone written into a draft, self-caught before reporting | `execution.md` T-8 |

**Lessons**

- **KZ-004 — A correction is not applied when its cited site is fixed.** (Product + Methodology, High)
  - Root cause: amendments were driven by the site list the **finding** supplied rather than by grepping the superseded value across every spec document. It failed in **both directions**. *Forward:* C-9, C-10 and C-11 each had a live second site the finding did not name, and the Leader's own first pass at C-15 corrected `design.md` while leaving two live `requirements.md` sites. *Reverse:* correcting `design.md` falsified everything **quoting** it — `mapping.md` and `reconciliation.md` went on describing resolved discrepancies as open.
  - Evidence: `execution.md` → "Pivot amendment C-6…C-13" (Reviewer FAIL: one orphaned §4.1 site) · "C-15 propagation correction, same day" · T-7 attempt 1 FAIL 2 (*"asserts a false statement about its sibling documents"*).
  - Cost: one extra review round on the C-6…C-13 pivot, and a Leader-committed defect that only the post-commit sweep caught. The reverse direction was anticipated in the brief for C-14 and closed on attempt 1 — evidence the rule works once stated.
  - Standardization: append-only rule in `.agents/leader.md`. → **Applied 2026-08-05 (user-approved)**
  - Upstream: propose as a Leader-persona rule — nothing in it is project-specific.

- **KZ-005 — Numeric estimates were never reconciled against the spec's own prose.** (Product + Methodology, Medium)
  - Root cause: specify-time figures entered `design.md` §9/§9.1 and `requirements.md` §3.1 and were never cross-checked against narrative statements elsewhere in the same spec. `design.md`'s *"8 cross-sheet duplicate groups, 18 records"* sat beside `mapping.md` §4.5's *"Rows 301–312 repeat all **11** `Seed Company` organisations verbatim"* — mutually contradictory, detectable **without opening the workbook**, and it survived two documents and a Judgment Day.
  - Evidence: `execution.md` → T-10 finding F-2 and correction C-14; `design.md` §9 vs `mapping.md` §4.5.
  - A corroboration worth keeping: 18 records over 8 groups requires exactly two 3-sheet groups, and direct measurement found exactly two. **The estimate's shape was right; only its pair count was short** — which is why nobody questioned it.
  - Standardization: writing-standards line in `docs/specs/general-setup/requirements.md`. → **Applied 2026-08-05 (user-approved)**
  - Upstream: generalizable — any spec that carries both figures and narrative can contradict itself this way.

- **KZ-002 — recurrence ×2, now in documents rather than tests.** (Product + Methodology, High)
  - Not a new lesson: the same root cause KZ-002 already names — *a presence-assertion is not a behavioral proof*. T-9 attempt 1 carried **all five** `design.md` §4.6 MUST clauses, every figure correct, every disqualifier clear — and described an import UI **that does not exist**. It told the operator to upload twice and "choose commit"; the shipped page previews automatically on selection and commits via an *"Import N actors"* button the runbook never named.
  - The sharpest instance: the public-detail check asked for *"the id of one record you just committed"* without saying that is the **internal** id, not the `traderId` the operator builds. The post-commit table renders `traderId` only — so an operator would have used `OFB-1036`, received a 404 for the wrong reason, and **recorded a false pass on the check whose only purpose is catching a PII leak.**
  - Evidence: `execution.md` → T-9 attempt 1, Reviewer FAIL issues 1–3 (verified against `frontend/app/(admin)/admin/actors/import/page.tsx`).
  - Standardization: one-line scope extension where KZ-002 already lives (`docs/specs/general-setup/task.md` § Testing & Verification) — operator-facing documents are verified against the **running product**, not the spec. → **Applied 2026-08-05 (user-approved)**

**The single sentence worth carrying forward**

> Clause-completeness and executability are different properties, and only one of them can be checked without leaving the spec.

T-9's first attempt satisfied every clause the design required and would have failed the first operator who tried to follow it. The previous spec's lesson was that *cross-document consistency is not evidence of correctness*; this one is its sibling — **conformance to a specification is not evidence that the thing works**. Both were caught only by a Reviewer that went and looked at the real artifact.

**A design property discovered, not designed:** the shipped Admin import UI **structurally enforces preview-before-commit** — the commit reuses the exact previewed `File`, with no path to commit an unpreviewed one. Stronger than `design.md` §4.6 item 1 requires, and worth knowing before anyone "improves" that flow.

### 2026-08-04 — actors/registration-source-and-consent

**Metrics**

| Signal | Value | Source |
|---|---|---|
| Tasks executed | 10 | `tasks.md` |
| Reviewer FAIL rework rounds | 2 (T-9 conformance; T-8 sticky clamp) | `execution.md` |
| Leader-escalated advisories → gating | 2 (T-10 A-1 false hint copy; T-8 S-1 unbounded sticky column) | `execution.md` |
| HALTs / FATAL_FAILs | 0 | `execution.md` |
| Pivots | 0 formal `## Pivot Record` blocks | `execution.md` |
| **Requirements owned by no task** | **3** | `execution.md` → T-8, T-9, T-8 (reopened) |
| PRODUCT_BUGs | 0 recorded (`/akili-test` never ran) | — |
| Product bugs found by validation | 2 High (R-1, R-2), fixed pre-archive | `validation-report.md` §11 |
| Validation FAIL / WARN | 0 / 1 (NFR-5) | `validation-report.md` |
| Doc defects corrected during validation | 4 corrected, 3 accepted | `validation-report.md` §8 |
| Budget tripwire | **exceeded** on review rounds (~12 planned); task count held at 10 | `tasks.md` § Budget |
| Scope corrections mid-execution | 5 across 3 documents | `requirements.md`, `design.md`, `tasks.md` |

**Lessons**

- **KZ-001 — Requirement scenarios reached execution owned by no task, three times.** (Product + Methodology, High)
  - Root cause: decomposition was validated against requirement **IDs** through §14's traceability table, never against each requirement's *scenarios and clauses*. All three gaps were scenario-level. Worse, the ID-keyed table was itself incomplete, so it read as confirmation. In two of the three, the Leader cleared the apparent gap by reading a **different** requirement that *was* satisfied — FR-1's payload-level scenario in place of FR-6's form-control obligation — and had to retract the clearance when a Reviewer pressed.
  - Evidence: `execution.md` → T-8 (`design.md` §3 specified two list filters `tasks.md` assigned to nobody) · T-9 (*"second gap of identical shape"* — FR-6 requires the form capture all four fields; the scope line dropped `registrationSource`) · T-8 reopened (FR-6's small-screen scenario required a sticky first column; `ActorsTable.tsx` contained zero `sticky` after nine tasks).
  - **All three were caught only because a Reviewer read the requirement text rather than the task's scope line.** No gate caught any of them.
  - Standardization: coverage closure at scenario/clause granularity in `docs/specs/general-setup/task.md`. → **Applied 2026-08-04 (user-approved)**
  - Upstream: propose to the AKILI methodology repo — the `task.md` template's completeness contract is ID-keyed everywhere, which is the defect, not this project's use of it.

- **KZ-002 — A green test certified a feature that did nothing.** (Product + Methodology, High)
  - Root cause: the T-8 Trader-cell clamp asserted that `max-w-xs truncate` classes were **present**. They were — and the clamp was a **no-op**, because `truncate` supplies `white-space: nowrap`, which raises a table cell's min-content width to the full string and floors `max-width` out entirely. The cell sat at full content width, so nothing overflowed, `overflow: hidden` never clipped, and **no ellipsis rendered either** — while the test stayed green through all of it. Caught only because the Leader sent the *justification* back to be tested instead of accepting it.
  - Same shape, second instance: `jest-axe`'s `color-contrast` returns *incomplete* under jsdom and `toHaveNoViolations` does not fail on incomplete, so NFR-5's contrast clause was recorded as covered by a gate that structurally cannot evaluate it (A-10 / J-7, recorded three times across three surfaces before validation named it a WARN).
  - Evidence: `execution.md` → T-8 (reopened), the clamp FAIL round and the D-h visual check that measured the real behavior.
  - Standardization: presence-assertions must record what they cannot prove in `docs/specs/general-setup/task.md`. → **Applied 2026-08-04 (user-approved)**
  - Upstream: generalizable to any harness with a rendering gap (jsdom, snapshot tests, config linting) — not specific to this stack.

- **KZ-003 — A gate sat blocked for a day on an assumption nobody tested.** (Product + Methodology, Medium)
  - Root cause: T-8 was held at `[~]` with the D-h visual check recorded as *"blocked on an authenticated admin session the Leader does not hold."* That was false. `ActorsTable` takes plain props and its `token` is used only for row deletes, so a throwaway harness page rendered it with **no stack, no database, and no login**. The check then produced **two real fixes within the hour** — a sticky boundary border that visibly detached on scroll, and an `md` viewport that froze 81% of the container.
  - Evidence: `execution.md` → D-h visual check section (*"the earlier 'blocked on auth' framing was wrong"*).
  - Cost of the wrong assumption: the two defects were real, shipped-code defects that a one-hour check would have caught a day earlier — and one of them (the `md` freeze) had already survived a Leader-escalated gate that "fixed" it without making it usable.
  - Standardization: append-only rule in `.agents/leader.md`. → **Applied 2026-08-04 (user-approved)**
  - Upstream: propose as a Leader-persona rule — nothing in it is project-specific.

**The single sentence worth carrying forward**

> Cross-document consistency is not evidence of correctness. It is often one wrong idea copied forward.

FR-6's sticky-column premise was false in **four** places that all agreed with each other — `requirements.md` FR-6, `design.md` §5, `tasks.md` T-8, and `docs/ux-ui/design.md` §9 — and that mutual agreement is precisely why nine tasks executed against it without anyone noticing. The same shape produced `design.md` §4.6's claim that four fields flow through the audit machinery "unchanged" when `AUDITABLE_FIELDS` is a hardcoded list, which would have shipped NFR-6 unmet with a fully green suite.

**Deferred to `/akili-audit`** (root causes outside this spec's scope, both now load-bearing): `docs/ux-ui/design.md` §9 specifies the admin sidebar as off-canvas below `lg` while `layout.tsx` makes it persistent from `md` — under the blueprint, the `md` table may well have fit, so the `md`→`lg` retreat treats a symptom. And the TRD documents `/actors/geo` across five sections as though implemented; it does not exist.
