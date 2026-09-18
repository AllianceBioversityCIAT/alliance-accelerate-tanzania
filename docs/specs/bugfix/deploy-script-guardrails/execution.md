# Execution Log — Deploy-script guardrails

- Spec path: `docs/specs/bugfix/deploy-script-guardrails/`
- Started: 2026-09-18
- Leader: AKILI (opus, T1) · Implementer: `akili-implementer` (sonnet, T2) · Reviewer: `akili-reviewer` (opus, T3)
- Author ≠ auditor enforced by the `.claude/agents/` wrapper model bindings, not by convention
- Budget (`design.md` §11): 7 tasks · ~470 LOC · 9 review rounds

---

## Task Execution History

### T-1 — Build the test harness — **PASS on attempt 3 of 3**

| | |
|---|---|
| Date | 2026-09-18 |
| Implementer attempts | **3** |
| Effort | `high` → `xhigh` → `max` (bumped on each rework, per the rework rule) |
| Skills assigned | `aws-serverless` — stub fidelity to real CLI output shapes |
| Exemplar cited | `infra/scripts/validate.sh` |
| Requirements covered | NFR-1, NFR-2; the machinery that later tasks' D-1…D-6 gates depend on |

**Files created (8, +390 lines, pure addition — no operator script touched):**
`infra/scripts/tests/run-tests.sh` · `tests/lib/assert.sh` · `tests/stubs/{aws,curl,sam,npm,npx}` · `tests/cases/000-placeholder.case.sh`

#### Attempt 1 — Reviewer FAIL

Harness mechanically correct on first build; the Reviewer confirmed by reading that the runner discriminates, the zero-case trap holds pre-loop, unconfigured stubs exit 127 loudly, and the code is bash-3.2-safe with no GNU-isms.

**FAIL — a false factual claim in the runner's header.** The `ENVIRONMENT EVERY CASE RUNS UNDER` block stated `SKIP_MIGRATE_PAUSE` stops `migrate-seed.sh` blocking on its confirmation pause. `migrate-seed.sh` never reads that variable; its sole consumer is `deploy.sh`. Violated `requirements.md` §2.2 **D-7** (a false documentation claim — declared unmeasurable and substituted with a mandatory Reviewer) and FR-7's standard that a script's own header is a KZ-008 surface.

*Gating because that header is the contract T-2…T-6 read.* T-4 removes the `CONFIRM=yes` branch from `migrate-seed.sh`; an author trusting this line would believe the harness neutralises that pause by a mechanism that is not the real one — a case passing for a reason other than the believed one, in the spec whose thesis is exactly that.

**Leader verification:** `grep -rn "SKIP_MIGRATE_PAUSE" infra/scripts/*.sh` → hits only in `deploy.sh`. Reviewer correct.

**Advisory A1 resolved by the Leader at the Reviewer's request:** `ls -l infra/scripts/tests/stubs/` → all five `-rwxr-xr-x`. No NFR-2 violation; a non-executable stub would have fallen through to the real binary.

#### Attempt 2 — Reviewer FAIL

Two changes: the header rationale rewritten, and `assert_status` hardened.

**Leader adjudication — advisory A3 raised to gating.** The Reviewer filed as advisory that `assert_status`'s `[[ "$actual" -ne "$expected" ]]` is an arithmetic comparison, so an empty `$actual` evaluates to `0` and **the assertion passes**. Applying the leader-playbook routing test — *in scope?* yes, the helper is T-1's deliverable; *did this spec cause it?* yes — this is `requirements.md` §2.2 **D-1** ("a guard present but unable to fire") applied to the harness itself. An assertion helper that passes on missing input cannot be the evidence machinery for six tasks whose thesis is that gates must be shown to fail. Not scope growth: a defect in what was delivered.

**FAIL — the replacement rationale was still false.** It claimed `deploy.sh` "otherwise pauses mid-run". `deploy.sh`'s pause is `elif [[ -t 0 ]]`, so under the runner's `</dev/null` the third branch runs and nothing pauses regardless. Ownership was now right; **mechanism was wrong** — the same KZ-008 shape one step over, and contradicted by the header's own `stdin /dev/null` line four rows below. Second issue: `(line ~233)` is a bare line number in a persistent document — KZ-009 — gated only because issue 1 required rewriting those exact lines.

**Leader verification:** read `deploy.sh` directly; branch order is `if SKIP_MIGRATE_PAUSE` → `elif [[ -t 0 ]]` → `else "Non-interactive shell — continuing without pausing"`. Reviewer correct on both counts.

⚠️ **Process note, recorded because it bears on the audit trail's independence:** attempt 2's text originated in the Reviewer's own attempt-1 *Remediation Suggestion*, relayed by the Leader. **A remediation suggestion is not verified evidence** — the auditor proposed text it later had to reject. Neither agent erred procedurally; the lesson is that suggested fixes inherit no authority from the finding that prompted them.

#### Attempt 3 — Reviewer **PASS**

**Strategy change rather than a third iteration of the same approach.** Two attempts had failed by *replacing* prose with new prose — KZ-008's recorded recurrence shape. The Leader removed the degrees of freedom: prescribed the exact replacement text, and instructed the Implementer to verify each clause against the code **with explicit permission to reject the Leader's text** if any clause was false. The Implementer verified all five and applied it unchanged.

Final text separates three things the failed versions conflated: **why the variable is present** (a `design.md` §7.2 mandate), **what it does** (branch selection), and **what it does not do** (prevent a hang — both prompts are `[[ -t 0 ]]`-gated; the stdin redirection is the real mechanism). The line-number anchor is deleted in favour of two greppable literals.

**Reviewer PASS summary:** *"Every clause of the rewritten `SKIP_MIGRATE_PAUSE` comment reconciles against `deploy.sh:233-241`, `migrate-seed.sh:47-48`, and `design.md` §7.2 — the false-mechanism claim is gone and correctly replaced with branch-selection plus an explicit disclaimer, and the KZ-009 line-number anchor is deleted in favour of two greppable literals. No code path changed; discrimination, the zero-case trap, stub loudness, bash 3.2 safety, and `assert_status` operand validation are intact."*

**Disclosure carried into the audit:** the Leader authored the final text and told the Reviewer so, instructing it not to treat Leader authorship as corroboration — the Reviewer was the first independent read of those eight lines.

#### Final verification — Leader-run, on a quiet tree

| Gate | Result | Who ran it |
|---|---|---|
| Full suite | `Discovered 1 case(s)` · `PASS` · **EXIT=0** | **Leader** (independently reproduced) |
| Zero-case trap | Copied `tests/` to a temp dir, removed all `*.case.sh` → `Discovered 0 case(s)` · `FAIL: zero cases discovered` · *"A suite with nothing to run is not a passing suite."* | **Leader** (the Implementer mislabelled a different check as this one — see below) |
| A3 falsifier | `assert_status 0 ""` → `ASSERT FAIL [exit status]: actual exit status is not numeric: ''`, rc=1. Returned 0 before the fix | **Leader** (independently reproduced) |
| Placeholder mutated to fail | EXIT 1, per-case FAIL block printed | Implementer only — **not independently reproduced** |
| Stub executability | all five `-rwxr-xr-x` | Leader |

⚠️ **Evidence defect caught in the Implementer's attempt-3 report:** it labelled a run of `assert_status 0 ""` as the *"zero-case trap re-check"*. That is the A3 assertion check, not the zero-case trap — the trap was not re-run by the Implementer. The Leader ran the real trap (above) and disclosed the mislabel to the Reviewer so it could weigh the rest of the self-reported evidence. KZ-008 in an evidence report rather than in code.

#### ADVISORY findings — recorded, non-gating, **not** converted into tasks

| ID | Finding |
|---|---|
| A1 | No startup assertion that stubs are executable; a non-`+x` stub falls through to the real binary silently. Currently all five are executable |
| A2 | A misnamed case file is skipped silently — `*.case.sh` is required |
| A4 | `assert.sh` attributed a rule to `design.md` §7.2 that §7.2 does not state |
| A5 | The runner does not scrub ambient AWS env vars |
| A6 | Two minor header inaccuracies (both corrected in attempt 3) |
| A7 | `000-placeholder.case.sh` cites its falsifier transcript as living in "T-1's completion report", a transient document. **Now resolvable: the transcripts are in this file** |
| A8 | `mktemp` with no template is a GNU-ism in general; works on this machine |
| R3-1 | *"makes a hang impossible"* is broader than proved — the redirection prevents `read`-based blocking; there is no per-case timeout. The Reviewer explicitly recommended leaving it alone rather than re-editing a block that failed twice |
| R3-2 | The `[[ -t 0 ]]` anchor matches five sites; the prose names which two, so the claim is unambiguous even though the grep is not |
| R3-3 | See forward pointer FP-2 below |

#### 🔭 Forward pointers — **must be copied into the brief of the task named**

| ID | For | Pointer |
|---|---|---|
| **FP-1** | **T-2…T-6** | Case discovery is `*.case.sh`, non-recursive, glob-ordered. A case file not matching that pattern is **skipped silently** — the undercount trap wearing a different hat. Every task adding cases must follow the naming, and should check `Discovered N case(s)` matches the number of cases it added. Convention chosen because this machine has BSD `find`/`sort`, so `sort -z` is unavailable; bash glob expansion is inherently sorted and needs no extra tool |
| **FP-2** | **T-2** | The runner does **not** scrub ambient `AWS_PROFILE` or credentials — by design, cases own their env. Consequence: on an operator shell exporting `AWS_PROFILE=IBD-DEV`, T-2's NFR-3 case ("floor passes under the pipeline env") would go green **for the wrong reason** and would stay green if its own env assignment were deleted. KZ-002 shape. T-2's cases must set the variable explicitly on every invocation, and the unset-`AWS_PROFILE` clause needs `env -u AWS_PROFILE`, never an assumption about the ambient shell |
| **FP-3** | **T-7** | The new header sentence about `migrate-seed.sh`'s confirmation prompt is true **today** and becomes false at **T-4**, which deletes the `CONFIRM=yes` profile-override branch containing that prompt. Add it to FR-7's self-description sweep |

#### 📊 Budget signal — recorded, not yet escalated

`design.md` §11 budgets **~210 LOC for the harness**. T-1 delivered **390** — and it is only the scaffolding; T-2…T-6 each add cases to the same tree. Spec total budgeted is ~470; **390 is spent after 1 of 7 tasks.**

Not escalated yet: the total is not breached, and the overshoot is concentrated in the one line item whose value the spec argues for most directly (the tests outweighing the fix is the intended ratio for a bug whose whole problem was unverifiability). **Flagged to the user at the T-1 gate.** If T-2 and T-3 land at a similar ratio, the total will breach and the tripwire fires.

---
