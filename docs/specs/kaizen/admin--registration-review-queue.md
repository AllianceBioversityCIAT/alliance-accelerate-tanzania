# Kaizen Entry — admin/registration-review-queue

## Document Control

| Field | Value |
|---|---|
| Spec Path | `admin/registration-review-queue` |
| Date | 2026-09-02 |
| Branch | `registration-review` |
| Branch Context | **Spec branch** — no `Default Branch:` pin in the root guides, and the checkout is not the default branch. Every shared-file write is recorded, not applied |
| Archive Run | 1 |
| Approval Mode | gated |

## Metrics

| Signal | Value | Source |
|---|---|---|
| Tasks executed | 16 / 16, all Reviewer-PASSed | `tasks.md` |
| Review rounds (execution) | **31** of a 35 budget | `execution.md` — final budget table |
| Code LOC | **13,310** vs ~8,200 budget, ~9,200 halt — **breached** | `execution.md` |
| Budget adjudication | Breach detected at T-12, escalated, user elected to continue | `execution.md` — budget escalation |
| Pivots | 0 | `execution.md` — no `## Pivot Record` |
| PRODUCT_BUGs | none recorded — `/akili-test` never ran, so there is no `test-report.md` | — |
| Validation (initial) | **1 FAIL · 17 WARN · 1 integration blocker** | `validation-report.md` |
| Validation (final) | **0 open code findings**; 3 advisories accepted | `validation-report.md` §11a |
| Remediation review rounds | **5 rounds, 5 FAILs — a 100% FAIL rate** | `execution.md` — post-validation sections |
| …of which on Leader-authored text | **2 of 5** | R11's cadence claim; A-92's sweep + false negative |
| HALTs | **1** — R5 exhausted the three-attempt ceiling; closed by user-authorised deletion | `execution.md` — R5 |
| `/akili-quick` escalations | none | `quick-log.md` |
| Drift attributable | none assessed — `docs/specs/audits/` holds no report | — |

**The headline metric is the 100% remediation FAIL rate.** Every one of the five review
rounds over the fixes found a defect in the fix. That is not a Reviewer being harsh; it
is the measured base rate of this kind of work, and it is the evidence behind the
recurrence recorded in D1.

## Lessons

- **KZ-admin--registration-review-queue-1 — The `akili-reviewer` wrapper exposes no `skill` tool, so every Reviewer this spec dispatched audited without the stack skills it was assigned.** (Methodology, Medium)
  - Root cause (5W1H — *why did the Reviewer not apply `nestjs-expert`?*): the Leader
    selects per-task skills from the `## Skill Map` and names them in the brief, and
    `.agents/reviewer.md` instructs the role to load them — but the tool-native wrapper
    restricts the Reviewer to `Read`/`Grep`/`Glob`. The instruction is unexecutable by
    construction, and neither side can detect that: the Leader sees a brief it wrote, the
    Reviewer sees an instruction it cannot follow. **A capability assigned through a
    channel the role cannot reach is not a capability** — the same shape as KZ-002's "a
    gate that cannot fail", one level up in the harness.
  - Evidence: the Phase-5 auditor reported it verbatim — *"the five requested skills could
    not be loaded — I have no `skill` tool in this session (consistent with the Reviewer's
    read-only wrapper)"* — and audited against the constitution documents instead.
    Recorded in `validation-report.md` §1, *Known limitation*.
  - Why it matters beyond this spec: the read-only restriction is correct and protects
    `author ≠ auditor`. The defect is that skill assignment was designed for a role whose
    wrapper cannot honour it, so every Reviewer audit in this project has silently run
    without its stack skills.
  - Standardization: → P1

- **KZ-admin--registration-review-queue-2 — A universal negative needs a search that could not have failed; a positive claim does not.** (Product + Methodology, Medium)
  - Root cause: the Leader wrote *"`/admin/export` does not exist at all: no page, no API
    endpoint, **no client function**"* into `docs/ux-ui/design.md` on the strength of
    `grep -rn "export.*csv\|exportActors\|/export"` — **case-sensitive**, and the function
    is `buildDashboardCsv`. The search could not have found what the claim denied.
    Asymmetry is the lesson: *"X exists"* is proven by one hit and a weak search still
    finds it; *"X exists nowhere"* is only as strong as the search's ability to have
    failed, and a search that cannot fail proves nothing about absence.
  - Evidence: `validation-report.md` §11a third batch; the A-92 review round's Issue 2,
    citing `frontend/lib/dashboard/csv.ts:119`, `components/dashboard/DownloadViewButton.tsx`,
    and `DashboardView.tsx:158` — a shipped, tested CSV export the claim said did not exist.
  - Standardization: → P2

- **KZ-admin--registration-review-queue-3 — AKILI's branch gate is inconsistent across its own commands: `/akili-archive` forbids shared-file writes from a spec branch, `/akili-validate`'s remediation does not mention branches at all.** (Methodology, Medium)
  - Root cause: `/akili-archive` Step 3 carries an explicit branch gate — guide sync,
    factual sweep and TRD/ADR edits become pending items on a spec branch, and the `kaizen`
    skill restates the writable set. `/akili-validate` has a Remediation section that
    routinely targets the same shared files and says nothing about branches. Following both
    commands correctly, this run **edited the root `CLAUDE.md`, `docs/trd/trd.md` and
    `docs/ux-ui/design.md` from a spec branch** during validation remediation, and then —
    minutes later, in this archive — was forbidden from touching those same files for the
    same class of reason. One methodology, two rules, same files.
  - Evidence: commits `3f7677b`, `818d732`, `4742e10` on `registration-review` modify
    `CLAUDE.md`, `docs/trd/trd.md` and `docs/ux-ui/design.md`; this entry's Document Control
    records the same branch as barring exactly those writes.
  - Not a defect in the work done — the edits were correct and reviewed. The defect is that
    the constraint's presence depends on which command happens to be running.
  - Standardization: → P3 (upstream only — a Methodology lesson takes no local edit)

## Noted, not a lesson

- **The spec's own stated verification proved imprecise nine times** (seven during
  execution, plus A-92's premise and A-28's "likely surfaces as a 500", both refuted by
  the Implementer re-verifying before fixing). Below the lesson bar only because KZ-002
  already owns it at ×4 and this is its fifth form; feeds the recurrence check.
- **Two Implementers refuted their own ticket before fixing it** — A-28's 500 and A-94's
  load hypothesis were both false as written, and both were caught only because the brief
  required verification before remediation. Worth watching as a positive pattern rather
  than a defect.
- **No `test-report.md` exists** — `/akili-test` never ran, so coverage was verified
  directly by the validation pass. Explicitly accepted at archive; recorded so a future
  reader does not mistake the absence for an oversight.
- **The public-submission → admin-queue seam was never executed end to end.** Verified by
  a field-by-field payload comparison over Leader-authored fixtures, not by a run of the
  real form. Recorded in `validation-report.md` §11b.

## Pending Items

### P1

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `.agents/reviewer.md` |
| Edit | Append to the persona: "**Skills you cannot load.** Your wrapper may restrict you to read-only tools, in which case the `skill` tool is absent and the Leader's assigned skills are unreachable. Say so explicitly in your report and name what you audited against instead — an unstated inability to follow the brief is indistinguishable from having followed it." |
| Severity | Medium |
| Status | pending |
| Upstream | Yes — the wrapper/skill mismatch is an AKILI harness defect, not a project one. Recommend upstreaming: either grant the Reviewer wrapper the `skill` tool, or stop assigning skills to a role whose wrapper cannot load them. |

### P2

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `docs/specs/general-setup/requirements.md` § Writing Standards |
| Edit | Add: "**A universal negative requires a search that could have failed.** Before writing *'X exists nowhere'*, use a case-insensitive, multi-pattern search over the whole tree; a single case-sensitive grep is evidence for a positive claim, never for an absence." |
| Severity | Medium |
| Status | pending |
| Upstream | Yes — dual lesson, names nothing project-specific. |

### P3

| Field | Value |
|---|---|
| Kind | standardization |
| Target | *(upstream only — no local edit)* |
| Edit | Recommend to the AKILI methodology repository: give `/akili-validate`'s Remediation section the same Branch Context gate `/akili-archive` Step 3 carries, so remediation targeting shared files defers on a spec branch instead of writing. Today the constraint's presence depends on which command is running. |
| Severity | Medium |
| Status | pending |

### P4

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `KZ-008` |
| Edit | Add `admin/registration-review-queue` as a source spec. Append: "**Recurrence ×4 (2026-09-02): 7 instances in one spec, and — measured — a **100% FAIL rate across five remediation review rounds**. Every fix reviewed contained a defect in the fix. Two were the Leader's own, written while correcting other authors' false claims, and one landed *inside* the attempt whose sole purpose was correcting false comments. The practical corollary, adopted at a HALT: **where a correction can be made by deleting the false text rather than replacing it, deletion is the lower-risk correction** — it cannot introduce the next instance." |
| Severity | High (unchanged — already High) |
| Status | pending |

### P5

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `KZ-003` |
| Edit | Add `admin/registration-review-queue` as a source spec. Widen the lesson from deferring a *check* to deferring *work*: "**Recurrence (2026-09-02): the same shape applied to triage.** Four tickets were filed as 'needs investigation' or 'needs a product decision'; all four closed the same day, two of them refuting their own ticket's premise, and two needed a single diagnostic command nobody had run. **'Needs investigation' is a claim about the work and requires the same evidence as any other claim** — and a ticket costs more to carry than most of these cost to fix." |
| Severity | Medium → **High** (it suppressed four tractable fixes and was only caught by the user, three separate times) |
| Status | pending |

### P6

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `KZ-010` |
| Edit | Add `admin/registration-review-queue` as a source spec. Append: "**Recurrence ×2 (2026-09-02): still unenforced, and the detection came from below.** Another session moved this shared checkout `registration-review → main → tracking-tools → main → reset` mid-task. No work was lost, but a subordinate Implementer — not the Leader — caught it by checking `reflog` for an anomaly it was not asked to look for, and its final gates were still measured on the wrong branch (98 suites/1,478 tests instead of 108/1,619). **A measurement taken on the wrong branch is not a slow measurement, it is a wrong one** — the same failure the protocol already names for measuring beside an active worker." |
| Severity | High (unchanged) |
| Status | pending |

### P7

| Field | Value |
|---|---|
| Kind | factual-sweep |
| Target | root `CLAUDE.md` — constitution summary |
| Edit | Add a `Default Branch: main` pin. Its absence is why this archive's Branch Context resolved to "spec branch" by fallback rather than by fact, deferring every constitution-sync write; the `kaizen` skill names the pin as the remedy. |
| Severity | Low |
| Status | pending |
