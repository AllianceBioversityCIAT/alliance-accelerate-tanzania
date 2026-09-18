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

### T-2 — `_guard.sh`, profile floor and override — **PASS on attempt 3 of 3**

| | |
|---|---|
| Date | 2026-09-18 |
| Implementer attempts | **3** |
| Effort | `xhigh` → `max` → `max` |
| Skills assigned | `aws-serverless` + **`tdd`** (Leader-assigned per task, not blanket — first task with real business rules) |
| Exemplar cited | the existing IBD-DEV guard blocks in `migrate-seed.sh` / `teardown.sh`, with an explicit instruction on what **not** to copy (`CONFIRM` as override, the TTY branch — both forbidden by FR-1/FR-2) |
| Requirements covered | FR-1 (all clauses), FR-2 (all clauses), NFR-3 |

**Files: `infra/scripts/_guard.sh` (93) + 11 cases (`guard-profile.*.case.sh`). Suite: `Discovered 12 case(s)`, 12 passed.**

#### Attempt 1 — Reviewer FAIL

`_guard.sh` was correct on first build and the Reviewer confirmed it by reading: floor and override execute on `source`, `PROFILE`/`REGION` exported, `${BASH_SOURCE[0]%/*}` path resolution with no `$0`, value-carrying override, no TTY branch, no `CONFIRM`. TDD was genuine — all 11 cases written before the library existed, red at 11/12, and the Implementer disclosed strengthening three cases that would otherwise have passed vacuously on the `source: No such file` error.

**FAIL — a requirement clause with no gate.** All eleven cases captured with `2>&1`, merging streams, so FR-1's *"printing the mismatch to stderr"* and FR-2's *"announces … on stderr"* were unowned.

**Leader verification — decisive, and worse than "untested":** deleted **every** `>&2` from `_guard.sh` (`grep -c` → 0) and ran the suite. **All 11 cases passed.** The clause had no gate whatsoever.

#### Attempt 2 — Reviewer FAIL

Two cases converted to split-stream capture with two-sided assertions (text present in stderr **and** `assert_not_contains` from stdout — a one-sided assertion would still pass if the message went to both). Leader verification: the same `>&2` deletion now reds **exactly the two owning cases and no others** — precise clause ownership, no cross-contamination.

**FAIL — a false factual claim in the new comments.** Both files stated *"this machine's mktemp is the BSD variant, which has no bare/no-template form (advisory A8)"*. **A8 says the opposite** — *"works on this machine"* — and three passing cases in the same suite use bare `mktemp`. The claim contradicted its own citation and the code beside it.

**Leader verification:** ran bare `mktemp` (works), read `execution.md:83` (says "works on this machine"), grepped the tree (three bare uses in green cases). Reviewer correct on all three legs.

#### Attempt 3 — Reviewer **PASS**

**Instruction changed from "rewrite" to "delete", on this spec's own measured evidence.** `judgment.md` §10 records that in the Judgment Day rounds, every correction that deleted introduced nothing while several that rewrote introduced new defects. The brief forbade composing any replacement rationale: *"if you find yourself writing a sentence about how `mktemp` behaves on any platform, you are reproducing the defect."* The portability claim and the nonexistent "REWORK-2" reference were deleted; only the load-bearing half survives.

**Second change, Leader-adjudicated from a Reviewer advisory:** `env -u` did not unset `AWS_REGION`, so the `REGION=eu-west-1` assertion would stay green even if the code's default changed, on any shell exporting that value. Same reasoning as `assert_status` in T-1: a gate that cannot fail, in a case this task delivered.

**Reviewer PASS summary:** *"The correction deleted rather than rewrote, per `judgment.md` §10's countermeasure; the two surviving `mktemp` sentences are borne exactly by the code and carry no portability implication, nothing load-bearing was removed, no variant of the false claim survives anywhere in `infra/scripts/`, and `-u AWS_REGION` makes the `REGION=eu-west-1` assertion discriminating without disturbing the case's other clauses."*

#### Final verification — Leader-run, quiet tree

| Gate | Result | Who ran it |
|---|---|---|
| Full suite | 12 cases, 12 passed | **Leader** |
| **stderr clause discriminates** | delete every `>&2` → **exactly 2 red** (`message-names-both-profiles`, `override-equal-proceeds-and-announces`), other 10 correctly green. *Before the fix the same mutation left 12/12 green* | **Leader** |
| **`AWS_REGION` ambient leak closed** | mutate the default to `us-east-1` **with `AWS_REGION=eu-west-1` exported** → `unset-aws-profile-proceeds` reds, and only it | **Leader** |
| FP-2 (hostile ambient profile) | whole suite green under `AWS_PROFILE=MELIA-DEV` exported | **Leader** |
| No portability claim survives | `grep -rn "BSD\|GNU\|A8\|REWORK-2"` → no matches | **Leader** |
| Falsifiers 1–5 (invert, unconditional, silence, boolean override, `[[ ! -t 0 ]] && return 0`) | each reds its named case | Implementer only — **not independently reproduced** |

#### ADVISORY — recorded, non-gating, **not** converted into tasks

| Finding |
|---|
| Export-ness of `PROFILE`/`REGION` is undriven — the probes run in the same process that sourced the library, so they would pass with plain assignments. Only observable at T-4 |
| FR-2's *"single variable across all scripts"* is unobservable at T-2 (zero scripts source the guard). Structurally satisfied by DD-1; **carried to T-4** |
| The tree is now internally inconsistent about `mktemp` templates (two files templated, two bare). The Reviewer's explicit recommendation is to **leave the prose deleted** rather than reintroduce a rationale in two of four sites |
| `resolves-own-path-not-caller` has a faint ambient-leak shape via `GUARD_DIR`. No real shell exports it and the realistic mutation still reds — not worth a task |

#### 🔭 Forward pointers — **copy into the brief of the task named**

| ID | For | Pointer |
|---|---|---|
| **FP-4** | **T-4** | FR-2's *"single variable across all scripts, learned once"* and the **export-ness** of `PROFILE`/`REGION` both become observable only when scripts actually source the guard. T-4's enumeration must own them; neither was discharged at T-2 |
| **FP-5** | **T-3, T-5, T-6** | The ambient-leak shape is now a known class, not a one-off: *an assertion that stays green if the code's default changes, because the operator's shell exports the expected value.* Every case asserting a **default** must `env -u` that variable. Two instances found so far (`AWS_PROFILE` at T-1's FP-2, `AWS_REGION` at T-2) |
| **FP-1, FP-2, FP-3** | still live | See the T-1 entry — `*.case.sh` naming, ambient env, and T-4 falsifying the harness header sentence |

---

### T-3 — `aws-accounts.conf` and `assert_account` — **PASS on attempt 3 of 3**

| | |
|---|---|
| Date | 2026-09-18 |
| Implementer attempts | **3** |
| Effort | `max` throughout — `docs/infrastructure.md` §5 makes the datastore's account part of the security boundary |
| Skills assigned | `aws-serverless` + `tdd` |
| Requirements covered | FR-3 (all clauses), FR-2's FR-3-interaction clause |

**Files: `infra/aws-accounts.conf` (new), `infra/scripts/_guard.sh` (extended with `assert_account`), 8 new `guard-account.*.case.sh`. Suite: `Discovered 20 case(s)`, 20 passed.**

#### The evidence the suite structurally cannot produce

Every test stubs `sts`, so a mistyped account id would pass the entire suite and fail closed on every real run (`design.md` §9). **Leader ran the live credential:**

```
$ aws sts get-caller-identity --profile IBD-DEV
{ "UserId": "AIDAYJAOTOYERBEE4IPMR",
  "Account": "569113802249",
  "Arn": "arn:aws:iam::569113802249:user/cognito_csicap" }
```

The Implementer independently re-ran it and matched. Both transcripts agree with the committed row.

#### Implementer judgment recorded — two calls it made that the brief did not

1. **Refused a test-only path override.** Testing the conf's content the obvious way means an env var redirecting the file's path — which would be **a live backdoor around FR-3 in production**. Instead the cases copy `_guard.sh` into a temp dir beside a fixture conf, relying on the `${BASH_SOURCE[0]%/*}` resolution T-2 already proved. `assert_account` carries zero test-only seams. The Reviewer endorsed this explicitly: *"the alternative would have been a live seam on the FR-3 boundary; the Implementer's judgment here is right and I would not accept the seam."*
2. **Disclosed a TDD-ordering deviation** rather than claiming pure red-green. Reviewer adjudication: **discharged** — T-3's contract is clause ownership, the named falsifiers and the `sts` transcript, all present; *"write-order is not the property that mattered."*

#### Attempt 1 — Reviewer FAIL

Everything mechanical passed audit: the collision case genuinely constructs *foreign account with a stack of the expected name present* and cannot pass against a name check; conf parsed never sourced; `assert_account` not run on `source`, proven by a stub marker; FR-2×FR-3 discharged **structurally** (`assert_account` never inspects the override, so no branch could special-case it).

**FAIL — a false universal negative, and it was the Leader's, not the Implementer's.** `aws-accounts.conf` stated *"a repo-wide search at specify time found none versioned anywhere else."* False: `569113802249` has been versioned since **2026-08-05** in `docs/specs/archive/2026-08-05-import-export--partner-profile-onboarding/archive-summary.md`.

⚠️ **Root cause, recorded against the Leader.** The claim originated in `design.md` §7.3 at specify time and was inherited. Its cause was mechanical: the specify-time sweep was `grep … | head -5`, and **a universal negative was drawn from a truncated result.** `docs/specs/general-setup/requirements.md` § Writing Standards forbids exactly this — *"A universal negative requires a search that could have failed."* **The same premise was also presented to the product owner at the decision gate**, so she decided on a claim that was wrong.

⚠️ **The Leader's own correction then failed the KZ-004 sweep.** Fixing the cited paragraph in §7.3 left the same withdrawn premise alive in the sibling sentence four lines above it. Only a second, wider grep found it. Third instance this session of a correction landing only where the finding pointed.

#### Attempt 2 — Reviewer FAIL

Conf clause narrowed; **static grep widened** (Leader-adjudicated from advisory, same standard as T-1's `assert_status` and T-2's `env -u AWS_REGION`: a gate under-covering its own clause). FR-3 says *"any script"* and the extensionless stubs are scripts. **Leader verified:** planted the literal in `stubs/curl` → case reds; reverted → green. Before the widening that plant went undetected.

**FAIL — caught by the Leader, not the Reviewer.** The narrowed clause asserted *"the only other occurrence … confirms only these two hits"*. Three files contain the id: the conf, the archive record, and `design.md:148` — **the Leader's own correction, quoting the id while documenting that the earlier claim was false.** The assertion was invalidated by the act of correcting it.

#### Attempt 3 — Reviewer **PASS**

**Deleted the enumeration rather than recounting**, with the boundary chosen deliberately: the surviving claim is scoped to a file class that can be checked exhaustively and **does not grow as this spec writes documents about itself**. Every clause past it was a claim about prose across the whole repository, which changes each time anyone documents the decision.

**Reviewer PASS summary:** *"The surviving scoped negative is true of the rest of the repository under an exhaustive multi-pattern sweep; the deletion removed only the over-broad enumeration and preserved the format rules, the never-source hazard, and the live-credential transcript; no new assertion appeared; the `design.md` §7.3 correction is accurate and its sweep complete, with the decision resting on ground independent of the withdrawn premise; and the widened grep now covers every file under `infra/scripts/` bar an empty `.gitkeep`."*

The Reviewer also **audited the Leader's own `design.md` correction on request**, confirmed the sweep complete, and confirmed the decision survives the withdrawal — §7.3's operative argument (*"a guard that silently does not run on a fresh clone is a guard that does not exist"*) never depended on novelty.

#### Final verification — Leader-run

| Gate | Result |
|---|---|
| Suite | 20 cases, 20 passed |
| **`assert_account` neutered (`return 0` first statement)** | **exactly 6 red** — the account-behaviour cases incl. collision; the other 14 correctly green |
| Account-id literal in a stub | planted in `stubs/curl` → `no-account-id-literal-in-scripts` reds; reverted → green |
| Live credential | matches the committed row |
| No literal in any script | exhaustive sweep, no `head`, no `--include` |

Note: `matching-account-proceeds` reds under the neuter mutation, which means it verifies the check **happened**, not merely that the exit code was 0 — stronger than the brief required.

#### ADVISORY — recorded, non-gating

| Finding |
|---|
| **The surviving sentence is falsified by the file it sits in.** *"No account id is versioned in any configuration or executable file"* — line 28 of that very file is one. The deleted clause carried the scoping word (*"the only **other** occurrence"*); truncation left it absolute. `_guard.sh` already words the same fact correctly (*"the one place it is allowed to appear"*), so the two comments now frame it inconsistently. The Reviewer declined to FAIL on it and gave its reasoning: the counterexample is three lines below, self-corrects on sight, no decision rests on it, and rolling back a verified 20-case task over one word is not defensible. **Sixth instance of the false-claim class this session — and this one was created by the act of deleting.** |
| Trap overwrite leaks seven temp dirs per suite run — compromises no gate |
| The "conf file not found" defensive branch has no case — corresponds to no clause |

**Leader action taken:** the identical imprecision in `design.md` §7.3 (two sentences) was corrected immediately by inserting *"other"* — those are the Leader's own documents. The `infra/aws-accounts.conf` wording is carried as **FP-6**.

#### 🔭 Forward pointers

| ID | For | Pointer |
|---|---|---|
| **FP-6** | **T-4** | When T-4 next touches `infra/aws-accounts.conf`, insert *"other"*: *"no account id is versioned in any **other** configuration or executable file."* One word; the sentence is currently falsified by line 28 of its own file |
| **FP-4** | **T-4** | Still live — export-ness of `PROFILE`/`REGION` and FR-2's *"single variable across all scripts"* become observable only when scripts actually source the guard |
| **FP-5** | **T-5, T-6** | Still live — every case asserting a **default** must `env -u` that variable. Three instances now (`AWS_PROFILE`, `AWS_REGION`, and the class itself) |
| **FP-1, FP-3** | still live | `*.case.sh` naming; T-4 falsifies the harness header sentence, T-7 sweeps it |

---
