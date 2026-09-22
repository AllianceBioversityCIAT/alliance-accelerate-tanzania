# Kaizen Entry — bugfix/deploy-script-guardrails

## Document Control

| Field | Value |
|---|---|
| Spec Path | `bugfix/deploy-script-guardrails` |
| Date | 2026-09-21 |
| Branch | `bugfix/deploy-script-guardrails` — **spec branch**, resolved *by fact* against root `CLAUDE.md`'s `Default Branch: main` pin (not by the old fallback) |
| Archive Run | 1 |
| Jira | ATP-64, ATP-65 |
| PR | #82 |

## Metrics

| Signal | Value | Source |
|---|---|---|
| Tasks executed | **8 of 8** (T-3 struck as superseded by T-8) | `tasks.md` |
| Reviewer rounds | **~21** (16 through T-7, 4 in T-8, 1 follow-up) | `execution.md` |
| Tasks passing on first attempt | **1 of 7** reporting an attempt count | `execution.md` |
| Tasks needing 3 attempts | **3** | `execution.md` |
| HALTs | **1** — T-8, on a *measured* gate defect | `execution.md` |
| Pivots | **1** — FR-3 withdrawn → FR-3′ | `execution.md` Pivot Record |
| Budget breaches | **2 re-baselines** (~470 → ~2,500 → ~4,300) | `design.md` §11 |
| Validation FAIL / WARN | 8 WARN → 1 FAIL + 4 WARN (delta) → **all closed** | `validation-report.md` |
| judgment-day | run on the design; S-13 warned NFR-5's measure would forbid an edit FR-7 needed — **and it did, five days later** | `judgment.md` |
| `/akili-test` | **not run** — author == tester for all 50 cases | `validation-report.md` |
| Cases | **50** | harness |
| Ratio tests : production | **8.3 : 1** (+3,919 / +474 net) | recomputed at archive |
| Defects in the **Leader's own artefacts** | **≥12** — 4 false universal negatives, 4 partial landings, 2 briefs that planted the next defect, 1 dead needle, 1 ungated gate | this file |

**The dominant signal, measured twice and unchanged:** of ~21 review rounds,
**zero died on the mechanism being wrong.** Every one died on a false claim
or a gate that could not fire. That is not a new lesson — it is KZ-002 and
KZ-008 compounding — but the *count* is the finding: the methodology's
review loop is well aimed at code and structurally blind to the prose that
surrounds it.

## Lessons

### L-1 — A falsifier proves nothing until its own environment is verified (High, Product + Methodology)

**Root cause.** KZ-002 requires every gate be shown to fail. It says nothing
about *where the showing happens*. The five mutations proving this round's
fixes were first run by invoking each case directly — but the cases are
hermetic only under `run-tests.sh`, which prepends the stub `PATH`. Invoked
directly, the case reached the **real `aws` CLI** and asserted against a
live CloudFormation stack. It reddened, so it looked like proof; it reddened
on the wrong assertion for the wrong reason.

**Evidence.** `execution.md` → *"A falsifier run outside the harness is not
a falsifier"*. The red printed `https://d3idqvvg0xa1r7.cloudfront.net` — a
live distribution — where the fixture expected
`https://d111111abcdef8.cloudfront.net`.

**Why it is distinct from KZ-002.** KZ-002 is about a gate that cannot
discriminate. Here the gate discriminated fine; the **proof procedure** ran
in the wrong environment. A correct gate plus a correct mutation still
yielded a worthless result. KZ-002's countermeasure ("run the mutation,
watch it redden") is what *produced* the false confidence.

**Countermeasure — mechanical, not vigilance.** A case that depends on a
stubbed command asserts that dependency inside itself:
`[[ "$(command -v aws)" == "$TESTS_DIR/stubs/aws" ]]`. Applied to the new
F-1 case and verified by running it standalone — it now refuses and names
`/opt/homebrew/bin/aws` as what it would otherwise have used. **The
pre-existing `resolve-*` cases have the same exposure and have not adopted
it**, which is the honest state, not a claim of closure.

### L-2 — A requirement's *measure* can forbid what its *requirement* permits, and the measure wins (High, Methodology)

**Root cause.** NFR-5 stated *"no behavioural change to the application, the
API surface, or the PII boundary"* and measured it as a path allow-list
excluding `frontend/**`. Editing a Markdown guide changes none of those — so
the measure forbade an edit its own requirement permitted. The measure won,
because it is the half an agent can check.

**Evidence.** `requirements.md` §4 NFR-5 + its 2026-09-21 amendment;
`execution.md` → *The NFR-5 vs. mirror-docs tension*; `judgment.md` **S-13**
flagged exactly this risk **at design review** and was filed as a WARNING.

**What it cost.** `frontend/CLAUDE.md` told every future agent that catching
a leaked profile was *their* job, at the exact moment the guard started
failing closed — a live falsehood in an instruction file, left standing for
five days by a measure that had already been warned about.

**Why the Reviewer was still right.** It upheld obeying the stated measure:
*"the whole point of this spec is that a stated gate must bind even when the
agent can see a good reason to step around it."* That holds. The error was
not obeying — it was **not amending**. An agent that may quietly reinterpret
a constraint it finds over-broad has no constraints; one that must amend it
in writing leaves a trail.

**Countermeasure.** When a requirement carries both a statement and a
measure, they are two claims and the narrower one binds. If they diverge,
the resolution is a **dated written amendment to the measure**, never a
judgement call in the moment. A judgment-day WARNING naming a
measure-vs-intent gap should be resolved before execution, not carried.

### L-3 — A linter rule is a claim about code that the linter cannot evaluate (High, Product + Methodology)

**Root cause.** SonarCloud raised `shelldre:S7682` — *"Add an explicit
return statement at the end of the function"* — on `is_account_id_shaped`,
whose body was `[[ "$1" =~ ^[0-9]{12}$ ]]` as the last command. The
function is a **predicate**: its exit status *is* the test's result.
Satisfying the rule the obvious way, by appending `return 0`, makes it
**always true** — every 13-or-more-digit run is then accepted as
account-id-shaped and the length filter is silently disarmed. That is the
exact defect class this spec exists to remove, and it would have arrived
*through* a code-quality tool, on a PR whose Quality Gate had already
passed.

**Evidence.** Mutation **M7**: applying the naive fix reddens
`guard-account.no-account-id-literal-in-infra`'s `[positive control]`
assertion. Run and confirmed 2026-09-22, not reasoned about.

**Why it is distinct.** KZ-002 is about a gate that cannot fail; L-1 about
a falsifier run in the wrong environment. This is a third shape: an
**external** rule, correct in general, whose literal application to this
construct inverts a security check. The rule cannot tell a predicate from a
procedure, and nothing in the toolchain asks it to.

**Countermeasure.** A static-analysis finding on a function whose **exit
status is its return value** is remediated by making the return explicit
*and correct* (`if …; then return 0; fi; return 1`), never by appending an
unconditional return — and the fix is verified by mutating in the naive
form and watching the suite redden. The reasoning is recorded at the
function, so the next agent meeting the same warning does not re-derive it.

## Noted, not a lesson

- **The Pivot landed on a better argument than the one it was given.** The stated reason was "the account can change". The operative reason: the assertion's only unique coverage was the scenario CI creates by design, so its unique value *was* its most probable false positive. Worth noting as a reasoning pattern, not standardisable.
- **Two Leader briefs planted the next defect.** Both times a falsifier example in a brief contained a fresh 12-digit literal that, quoted into a comment under `infra/`, would have tripped the account-id gate on its own file. Both caught by an Implementer **executing the gate against its own draft**.
- **A Reviewer issued FAIL then PASS on identical artefacts.** Recorded both; kept the HALT. The PASS resolved against itself — it said the adjacency finding *"should be confirmed by execution before anyone acts on it"*, which had already been done.
- **The remediation round added a gate that could not fail.** The `is_allowed` precondition: mutating it away left the suite 50/50 green — in the round whose purpose is removing exactly that. Caught by running the mutation, not by reading. This is L-1's shape one turn later and is why L-1 is phrased as a procedure, not a warning.

## Pending Items — **ALL APPLIED on `main`, 2026-09-22**

Recorded on the spec branch, applied in the Kaizen apply phase on `main`
(user-authorised, documentation only). The table below is kept as written;
the disposition of each item follows it.

| # | Kind | Target | Content | Severity |
|---|---|---|---|---|
| 1 | `guide-sync` | root `CLAUDE.md` § Module Guides | **Root `AGENTS.md` is indexed nowhere.** The section reads *"Mirrored for other tools by `backend/AGENTS.md` / `frontend/AGENTS.md`"* and never names root `AGENTS.md`, which exists and mirrors root `CLAUDE.md`. By the section's own rule — *"A child guide missing from this index is drift"* — this is drift. Add: `` - `AGENTS.md` — root mirror for other tools; must be updated in lockstep with this file. `` | **High** — this is the structural reason NFR-5's measure excluded it and T-7 synced one mirror and not the other (L-2) |
| 2 | `digest-update` | `kaizen-log.md` KZ-002 | Recurrence. **Six instances in one spec:** the dead `\b` gate (T-4); FR-3′'s profile half passing under a banner that printed the token itself; a `smoke.sh` exit-code assertion that passed with the check deleted; a multiplicity control using `grep -qE`, which structurally cannot detect a count shortfall; a needle asserting an error string the defect never emits (ENOENT vs **ENOTDIR**); and a precondition no mutation could redden. **No recurrence number allocated** — see the note below | **High** |
| 3 | `digest-update` | `kaizen-log.md` KZ-008 | Recurrence. The **four** false universal negatives about the account id, each correction checked against where the *previous instance* lived rather than against the artefact making the claim; plus a header claiming `infra/README.md` recommends an invocation form it never mentions; plus an invented `sam build`/S3-URI mechanism; plus a function contract naming an array the function never reads. **No recurrence number allocated** | **High** |
| 4 | `digest-update` | `kaizen-log.md` KZ-004 | Recurrence. **Four partial landings**, including one where `validation-report.md` carried both the exact fix *and* the finding that a design rationale was false — the fix was applied to the code and the false rationale left standing in `design.md`, so the spec documented two reasons for one choice, one already adjudicated false | Medium |
| 5 | `standardization` | `docs/specs/general-setup/task.md` | Append to *Testing & Verification Expectations*: **"A falsifier's own environment is part of the falsifier. A case depending on a stubbed command must assert that dependency inside itself; a mutation run outside the harness produces a red that proves nothing."** (L-1) | High |
| 6 | `standardization` | `docs/specs/general-setup/requirements.md` | Append to §2: **"A requirement's statement and its measure are two claims, and the narrower binds. Where they diverge, amend the measure in writing with a date — never reinterpret it in the moment."** (L-2) | High |

> ⚠️ **No recurrence numbers were allocated for items 2–4, deliberately.**
> The digest's own warning applies: recurrence counters are monotonic ids in
> a shared document and collide exactly like ADR numbers. `grep -l` shows
> **five** pending entry files already claiming KZ-002 recurrences and
> **six** claiming KZ-008 — and the log records a prior collision where
> KZ-008 was found with three specs claiming ×3 and two claiming ×4, each
> allocated from its own branch. Allocating from this branch would make it
> six. The apply phase on `main` assigns the numbers chronologically.

## Methodology lessons for upstreaming

Both **L-1** and **L-2** are AKILI-level, not project-level:

- **L-1** extends KZ-002, which is already in the methodology's own templates. The extension is that the *proof procedure* needs its environment pinned — a gap in the rule as written, and the rule's own countermeasure is what produced the false confidence.
- **L-2** concerns how requirements are authored and amended, not this repository's code. `judgment.md` S-13 shows the design-review pass can *detect* a measure-vs-intent gap and that the methodology has no step which forces its resolution before execution.


---

## Post-archive addendum — SonarCloud on PR #82 (2026-09-22)

Five new issues, all `MAINTAINABILITY` in **test files**, on a PR whose
**Quality Gate had already passed**. Total reported effort: 17 minutes. All
five fixed.

| Rule | Where | Fix |
|---|---|---|
| `shelldre:S7682` ×2 | `account-id-scan.sh` — `is_account_id_shaped`, `extract_digit_run` | Explicit returns. **The two are not the same fix** — see L-3: one is a predicate whose status is its value, the other's status is meaningless because callers read stdout |
| `shelldre:S7679` | `is_account_id_shaped` | `$1` assigned to a local |
| `shelldre:S1192` ×2 | the gate case — `'111111111111'` ×5, `'s/^/  | /'` ×4 | `FIXTURE_ALLOWED_ID` and `INDENT_CAPTURED`. The fixture constant is deliberately an **allow-listed** value: a fresh 12-digit literal here would violate the rule this file enforces, since the scan covers this file too |

**One self-inflicted error, caught by the suite in seconds.** The first
attempt defined `FIXTURE_ALLOWED_ID` beside the allow-list, *below* the
control that reads it — `unbound variable` under `set -u`. Moved above
every reader; the reason is recorded at the definition.

**Verification.** 50/50 green. Four mutations re-run after the change: the
naive S7682 fix (**M7**, the L-3 trap) reddens `[positive control]`;
reverting the extractor reddens `[extraction control]`; dropping
`--exclude-dir=.aws-sam` reddens `[scan control (c)]`; restored, zero reds.

**Why this addendum is here and not in `execution.md`.** The spec folder is
an archived, frozen record. This file is the living retrospective, so a
post-archive change to the spec's code is recorded here — and L-3 above is
the lesson it produced.


### Apply-phase disposition (2026-09-22, on `main`)

| # | Item | Outcome |
|---|---|---|
| 1 | root `AGENTS.md` indexed nowhere | **Applied** — and the fix went **both ways**: `CLAUDE.md` now lists `AGENTS.md` and `AGENTS.md` now lists `CLAUDE.md`. Writing only the first would have committed the very drift the entry documents, inside the commit documenting it |
| 2 | KZ-002 recurrence | **Applied** — digest row compressed to **×9**, not appended to. **L-1 was folded in here rather than given its own row**: it is the third widening of "prove the gate discriminates", not a new root cause |
| 3 | KZ-008 recurrence | **Applied** — **×8**, still the most recurrent lesson in the log |
| 4 | KZ-004 recurrence | **Applied** — **×6** |
| 5 | L-1 → `general-setup/task.md` | **Applied**, alongside **L-3** |
| 6 | L-2 → `general-setup/requirements.md` | **Applied** as new lesson **KZ-015** |

**Two new digest rows:** **KZ-014** (a linter rule is a claim the linter
cannot evaluate — L-3) and **KZ-015** (a measure can forbid what its
requirement permits — L-2). **L-1 got no row**, by the compress-don't-append
rule.

**Recurrence numbers were safe to allocate here** and were not on the spec
branch: at apply time the pending backlog across all seven entry files was
**empty except this one**, so no other spec held an unabsorbed claim on
KZ-002/004/008. That check is the whole reason the numbers were deferred.

**One defect caught during the apply itself.** The KZ-008 row initially
carried a literal `|` inside a backticked `grep` example, which split the
Markdown table into 8 columns. Caught by counting effective pipes per row
rather than by reading — the same countermeasure KZ-008 itself prescribes.
