# Kaizen Log

Continuous-improvement record for this project, updated automatically by
`/akili-archive` (Kaizen Retrospective, powered by the `kaizen` skill).
Other AKILI commands read only the `## Active Lessons` table below —
keep it at 10 rows or fewer.

## Active Lessons

| ID | Lesson | Source Spec | Severity | Target | Standardized In | Status |
|---|---|---|---|---|---|---|
| KZ-001 | Decomposition must close coverage at **scenario and clause** granularity, not requirement ID; a gap may never be discharged by citing a different requirement that is satisfied | actors/registration-source-and-consent | High | Product + Methodology | `docs/specs/general-setup/task.md` § Coverage closure | Applied |
| KZ-002 | A presence-assertion (class/config/attribute exists) is not a behavioral proof — it must record what it cannot prove, and a property the harness cannot evaluate is **not covered** | actors/registration-source-and-consent | High | Product + Methodology | `docs/specs/general-setup/task.md` § Testing & Verification | Applied |
| KZ-003 | Before deferring a check because it "needs the stack/login/seed data", test that assumption — a component taking plain props renders in a throwaway harness | actors/registration-source-and-consent | Medium | Product + Methodology | `.agents/leader.md` § Deferring a check | Applied |

## Entries

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
