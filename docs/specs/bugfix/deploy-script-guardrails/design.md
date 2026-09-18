# Design — Deploy-script guardrails

- Spec path: `docs/specs/bugfix/deploy-script-guardrails/`
- Status: **Draft** — revision 3 (Judgment Day rounds 1 and 2 applied)
- Author / Date: AKILI (Leader) — 2026-09-18
- Depth: **Standard** · Type: **Bug**
- Related: `requirements.md` FR-1…FR-7, `proposal.md` §4.6, `judgment.md`, `docs/infrastructure.md` §3–§5

> **Revision 2 basis.** Re-derived against `main` after PR #75 merged (`7bed323`). Revision 1's central attribution — that `set-cors.sh` holds the correct origin-resolution implementation — was **false** and is corrected in §7.1. No sequencing constraint remains.

## 1. Approach Overview

One shared guard, sourced by every script; one hermetic test harness that can actually make a guard fail; two narrow behavioural fixes on top.

| Piece | What it is | Serves |
|---|---|---|
| `infra/scripts/_guard.sh` | Sourced library: profile floor, value-carrying override, account assertion, and a stack-query helper with a defined exit-code contract | FR-1, FR-2, FR-3, FR-5, NFR-4 |
| `infra/aws-accounts.conf` | One `profile=account_id` row per environment, **parsed** (not sourced) | FR-3 |
| `infra/scripts/tests/` | Dependency-free bash harness: **guard-unit** tests plus **script-integration** tests against a stubbed `PATH` | NFR-1, NFR-2, every gate in `requirements.md` §2.2 |
| `deploy.sh` origin resolution | Replaces the static `*` default; `*` only on a confirmed-absent frontend stack, announced | FR-4, FR-5 |
| `smoke.sh` CORS check | New Check 6; Summary renumbers to 7 | FR-6 |
| `infra/jenkins/deploy-backend-cors.patch` | Advisory patch for the Jenkins administrator — **CORS resolution only** | FR-5 (out-of-repo site) |
| Doc sync | `docs/infrastructure.md`, `infra/README.md`, root `CLAUDE.md`, `smoke.sh`'s header | FR-7 |

**The organising insight, corrected.** FR-5's classification pattern is not missing from this repository — it exists **twice**, in `deploy.sh` and `set-cors.sh`, applied in both cases to `MailTransport` and to nothing else. The work is therefore not "promote the one good implementation"; it is **collapse two duplicates into one helper and point the two actual defect sites at it**. Revision 1 got this backwards and its two documents contradicted each other about it (`judgment.md` C-1).

## 2. Data Model Changes

**None.** No Prisma schema, migration, or field. `backend/src/common/pii-consent.policy.ts` is not read or changed.

## 3. API Surface & Contracts

**None.** `smoke.sh` gains a read-only preflight probe against an existing endpoint; it defines no contract.

## 4. Backend Design

**Not applicable.** No file under `backend/src/**` is touched. The one adjacency: `smoke.sh` asserts the API's CORS *configuration*, declared in `infra/20-backend/template.yaml` (`HttpApi.CorsConfiguration.AllowOrigins`) and resolved from the `AllowedOrigin` parameter — not in NestJS.

## 5. Frontend Design

**Not applicable.** No UI surface; `docs/ux-ui/design.md` tokens are not consulted.

## 6. Security & RBAC

No role, guard, or serializer change. The security relevance is indirect: `docs/infrastructure.md` §5 makes the datastore's **account** part of the security boundary, so a script that can be redirected to another account is a PII-boundary defect no application test can see.

### 6.1 `CONFIRM=yes` does two jobs — found while designing FR-2

`teardown.sh` uses one variable for two unrelated authorisations, in consecutive blocks:

| Block | What `CONFIRM=yes` authorises |
|---|---|
| IBD-DEV guard | Proceed against a **non-`IBD-DEV` profile** |
| Destruction guard | Permanently delete **all three stacks, including the RDS instance** |

The script's own usage line documents the coupling: `CONFIRM=yes AWS_PROFILE=other ./infra/scripts/teardown.sh   # also clears IBD-DEV guard`.

So an operator setting `CONFIRM=yes` for the ordinary reason — running teardown unattended — **also disarms the wrong-account guard**. With ATP-65's ambient-profile defect the composite is: *delete every stack, in whatever account the environment points at, unattended,* warning to a stderr nobody reads.

**Only `teardown.sh` has this coupling.** Revision 2 claimed `migrate-seed.sh` had "the same coupling with a smaller blast radius"; it does not. `CONFIRM` appears there exactly once, in the profile guard, with no second authorisation to be coupled to. The claim was made in service of this section's rationale and was false about the codebase — corrected rather than softened.

**This is the sharpest justification for FR-2, and it is why the override must be value-carrying rather than boolean** (`requirements.md` FR-2). A general-purpose flag accumulates authorisations until one is a surprise; a boolean `ALLOW_NON_IBD_DEV_PROFILE=1` exported in a shell rc would reproduce the same defect one level up.

## 7. Infrastructure / Deployment

### 7.1 `_guard.sh` — the single guard

Sourced (not executed) as the first statement after `set -euo pipefail`. Four responsibilities:

**Sourcing is not running, and the design must say which is which** (`judgment.md` F-01). The profile floor and override **execute on `source`** — no call required, so a script cannot source the guard and forget to use it. The account assertion is an explicit `assert_account` call, because FR-3 exempts the read-only scripts and an auto-running assertion could not be exempted without a flag. That split is what D-3 and D-3b test: **(a)** the `source` line's presence and position, **(b)** an in-situ abort run per script, and **(c)** a foreign-account abort run per *writing* script. Because the floor runs on `source`, guard-unit tests must invoke it in a subshell — a sourced `exit` would otherwise kill the test runner.

`_guard.sh` also **exports `PROFILE` and `REGION`**, and the seven local `PROFILE="${AWS_PROFILE:-IBD-DEV}"` lines are deleted. Leaving them would keep a second resolution path in every script — the very line §1 names as the defect — and make NFR-4's "one place" false (`judgment.md` F-21). The library resolves its own path with `${BASH_SOURCE[0]%/*}`, never `$0`, which in a sourced file names the *caller*.

| Function | Behaviour | Requirement |
|---|---|---|
| Profile floor | Runs on `source`. Compare the effective profile to `IBD-DEV`; abort non-zero on divergence unless the override matches. **No TTY branch** — non-interactive fails closed | FR-1 |
| Override | `ALLOW_NON_IBD_DEV_PROFILE` must **equal** the effective `AWS_PROFILE`; set-but-different aborts. Never `AWS_PROFILE`, never `CONFIRM`. Announces on stderr | FR-2 |
| `assert_account` | Explicit call. `sts get-caller-identity` → compare to the expected account; abort on mismatch **regardless of stack names**. **Not called by `validate.sh` or `smoke.sh`** — the two read-only scripts | FR-3 |
| `resolve_stack_value` | Query a stack Parameter *or* Output; classify failures | FR-5 |

**`resolve_stack_value` contract** — stated, because an undefined one is the D-4 hazard this spec names:

- Takes the stack name and a JMESPath query, because the existing duplicates query a **Parameter** (`Stacks[0].Parameters[?ParameterKey=='MailTransport']…`) while origin resolution needs an **Output** (`CloudFrontUrl`). A helper hardcoded to `Outputs` could not absorb either duplicate.
- **Value on stdout. Exit `0` = found · `2` = confirmed absent · `1` = abort.** An `exit` inside `$( … )` kills only the subshell, so the status must be read at the call site.
- **The call-site shape is prescribed in full, because a two-way `if` cannot read a three-way contract.** `if … then … else … fi` splits zero from non-zero only; `1` and `2` both land in `else`. The one permitted form captures the status as the **first statement** of the else-branch — anything before it, an `echo` included, clobbers `$?`:

  ```
  if VALUE="$(resolve_stack_value …)"; then
      …use VALUE…
  else
      rc=$?
      case "$rc" in
        2) …announced bootstrap… ;;
        *) …abort… ;;
      esac
  fi
  ```

  Stating only "use an `if`" — as revision 2 did — reintroduces the D-4 subshell-capture hazard one level up while fixing it one level down.
- **Call sites MUST NOT wrap the call in `local`, `||`, or a pipeline** — all three discard the status.
- **Success-with-`None` is classified explicitly.** A stack that exists but has no such key returns success and the literal string `None` (today each call site re-checks this itself — the duplication NFR-4 removes). The helper returns `2` for a Parameter query and **aborts** for an Output query: a frontend stack that exists but exports no `CloudFrontUrl` is a broken deployment, not a bootstrap, and announcing `*` for it would contradict FR-4's "only where the stack genuinely does not exist".
- **`set-cors.sh`'s converted lookup treats `2` as abort**, for the same reason: it runs only after the frontend stack is deployed.
- **Absent is classified on two tokens, not one.** `ValidationError` alone also covers a malformed or misspelled stack name; matching it alone would read a typo'd `FRONTEND_STACK` as "absent" and deploy `*`. The match requires `ValidationError` **and** the absent-stack phrasing.

Both existing `MailTransport` copies — in `deploy.sh` and `set-cors.sh` — are replaced by calls to this helper (NFR-4). `set-cors.sh`'s `CloudFrontUrl` lookup already hard-fails and has no silent fallback; it is converted for uniformity, not to fix a defect.

The `CONFIRM=yes` profile-override branch is removed from `migrate-seed.sh` and `teardown.sh` (DD-4). `CONFIRM`'s **destruction**-confirmation role in `teardown.sh` is untouched.

### 7.2 The test harness — two kinds, because one is not enough

No shell test harness, no `bats`, no `shellcheck` (verified 2026-09-18). NFR-1 forbids adding an installable dependency. So: plain bash, `infra/scripts/tests/run-tests.sh`, one assertion helper, non-zero exit on any failure.

**Two distinct kinds, because a single kind cannot cover both directions.** Revision 1 assumed whole-script execution would serve both; it cannot. An `aws` stub does not intercept `sam` (which uses boto3 in-process and never shells out), `curl https://checkip.amazonaws.com`, `npm`, `npx prisma`, or `deploy.sh`'s `read -p` pause. Abort-path tests are unaffected — nothing external runs before the guard aborts — but **pass-path tests would be unreachable**, so "exits 0 under the pipeline's env" would be a gate that can never be green honestly (`judgment.md` S-1).

| Kind | What it runs | Covers |
|---|---|---|
| **Guard-unit** | Sources `_guard.sh` in isolation and calls its functions directly | Both directions of FR-1/FR-2/FR-3, including NFR-3's pass path |
| **Script-integration** | Executes whole scripts with a stubbed `PATH`, `SKIP_MIGRATE_PAUSE=yes`, and stdin `</dev/null` | FR-4, FR-5, FR-6, D-3, D-4 — the guard *in situ* |

**The device: a stubbed `PATH`.** Each test prepends a fixture directory holding executables that print scripted output and exit with scripted status. The real scripts run unmodified (DD-2).

**The stub set is exactly the network-capable commands: `aws`, `curl`, `sam`, `npm`, `npx`.** That is what makes NFR-2 hold by construction rather than by hope. The text tools a script reaches — `awk`, `grep`, `sed`, `dirname`, `jq` — **run for real**: they touch no network, and stubbing `awk` in particular would turn the "`aws-accounts.conf` is parsed, not sourced" gate into a test of the stub rather than of the guard.

That reaches the cases the proposal called hard:

| Case | Stub behaviour | Proves |
|---|---|---|
| **Wrong account, right stack name** | `sts get-caller-identity` → foreign account; `describe-stacks` → success for the expected name | FR-3's collision clause — what a name check cannot see |
| **Origin resolution, three ways** | `describe-stacks` → a `CloudFrontUrl`; → the absent-stack message; → an expired-token error | FR-4 and FR-5 **without deploy rights** |
| **CORS check** | `curl` → a permissive `ACAO`, an echoed origin, a clean `204` rejection, a `500`, and a refused connection | FR-6's five directions — four FAIL, one PASS |
| **Uniform application** | none | D-3 (below) |

**No fixture HTTP server.** Revision 1 specified one; nothing in coreutils listens on a TCP socket and bash's `/dev/tcp` is client-only, so every candidate (`nc`, `socat`, `python3 -m http.server`) would have broken NFR-1 (`judgment.md` S-2). Stubbing `curl` is the same device already used for `aws`, needs no listener, and additionally makes the refused-connection scenario (FR-6's transport-failure clause) trivially reachable — a real server would have made that case the hard one.

**The CORS gate asserts the summary's `FAIL  CORS…` / `PASS  CORS…` line with `2>&1` captured, never the exit code.** The stream matters: `pass()` writes `[PASS]` to stdout while `fail()` writes `[FAIL]` to **stderr**, so a test capturing stdout alone would never see a failure. The run's final summary block prints both to stdout, which is why it — not the inline marker — is the named observable. With the network stubbed, `smoke.sh`'s frontend and S3 checks fail on their own, so the script exits non-zero **whether or not a CORS check exists**. An exit-code assertion would pass with the defect present — KZ-002, and the single most valuable finding of the review (`judgment.md` C-3). The test also presets `API_BASE_URL`, `CLOUDFRONT_URL` and `BUCKET`, all three of which `smoke.sh`'s `USAGE` accepts, so Check 1 makes no live lookup.

**D-3's enumeration needs two clauses the first revision omitted** (`judgment.md` C-2):

- **Exclusion:** the glob `infra/scripts/*.sh` matches `_guard.sh`, which cannot source itself. Files whose basename begins with `_` are libraries and are skipped — a convention, so a future `_lib.sh` is covered without editing the test.
- **Position, not presence, with the comparison defined:** after stripping comment and blank lines, no line matching `\b(aws|sam|curl|npm|npx)\b` — the network-capable set — may precede the `source` line. The stripping clause is not a detail: every script opens with a 20–60 line header whose USAGE examples contain `aws cloudformation`, `sam build` and `npm run build` in prose, so a naive scan would classify a comment as the first external command. The `source` path itself uses `${BASH_SOURCE[0]%/*}`, a shell expansion rather than a call to `dirname`, so the guard line does not trip its own rule. Asserting mere presence would pass a script that sources the guard on its last line — the KZ-002 shape in miniature.

### 7.3 Where the expected account id comes from — settled

FR-3 needs an expected account id. `infra/samconfig.toml` carries no account id (it sets `profile`, `region`, `confirm_changeset`, `capabilities`, `resolve_s3`, `tags` and `lint`), and a repo-wide search found no AWS account id versioned anywhere.

**Decided 2026-09-18 by the product owner: commit `infra/aws-accounts.conf`** — the first AWS account id versioned in this repository, a deliberate recorded first rather than an accident. Chosen over an operator-local file because a guard that silently does not run on a fresh clone is a guard that does not exist (root `CLAUDE.md`: *"A gate that cannot run cannot fail"*).

**It is parsed, never sourced.** `IBD-DEV=123456789012` is not a valid bash assignment — the hyphen is illegal in an identifier — so `source`-ing it under `set -euo pipefail` would abort **every script on a correct profile**: a fail-closed guard against correct input, the "sign reversed" shape KZ-002 records (`judgment.md` S-6). `_guard.sh` reads the row with `awk -F=`, and a missing or malformed row is an abort with a message naming the file.

### 7.4 The Jenkinsfile — quoted verbatim, patched narrowly

The `Jenkinsfile` is not versioned in this repository. The `Deploy Backend` stage's origin resolution, transcribed from the operator-supplied copy on **2026-09-18**, is:

```bash
ALLOWED_ORIGIN="$(
  aws cloudformation describe-stacks \
    --stack-name "${FRONTEND_STACK}" \
    --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" \
    --output text --profile IBD-DEV --region "${AWS_DEFAULT_REGION}" 2>/dev/null || true
)"
if [ -z "${ALLOWED_ORIGIN}" ] || [ "${ALLOWED_ORIGIN}" = "None" ]; then
    echo "▸ Frontend stack has no CloudFrontUrl yet — bootstrapping CORS as '*'"
    ALLOWED_ORIGIN='*'
fi
```

That stage is gated `when { environment name: 'DEPLOY_INFRA', value: 'false' }` — the path every ordinary merge takes. `Lock CORS` is gated on `'true'`, so it does not repair this path.

**This verbatim block is the artefact the D-7 Reviewer re-derives the CORS claim from** (`requirements.md` §2.2) — and only that claim. The other three Jenkinsfile claims in `requirements.md` §7 — the `environment { AWS_PROFILE = 'IBD-DEV' }` block, `writeIbdDevProfile()`, and the `Lock CORS` `when` clause — are **not** quoted here and are re-derivable only from the operator-supplied copy. Revision 1 pointed the Reviewer at an excerpt no target document contained; revision 2 fixed that for one claim of four and implied all four (`judgment.md` S-9, F-09). The Reviewer's brief must say which is which.

`infra/jenkins/deploy-backend-cors.patch` plus a short README stating it is advisory, unversioned upstream, and true as of 2026-09-18. **It changes the origin resolution only.** The stage carries two independent defects in the same `sam deploy` call:

| Defect | This spec |
|---|---|
| Origin resolved behind `2>/dev/null \|\| true`, falls back to `*` on any failure | ✅ **patched** — the out-of-repo instance of FR-5 |
| `MailTransport` never passed, so `UsePreviousValue` resubmits the live value | ❌ **documented only** — raised with the Jenkins administrator by the product owner; PR #75 has since merged |

Bundling them would hand the administrator a patch mixing a defect they have already actioned with one they have not.

## 8. Decision Records

**No TRD ADR number is allocated.** These are spec-local decisions about operator scripts, not architecture — nothing changes a quality-attribute scenario, a C4 view, or a tactic in `docs/trd/trd.md`. This also sidesteps the ADR-number collision hazard root `CLAUDE.md` records.

### DD-1: One sourced library, not seven inline guards
Seven copies drift — that is how five scripts ended up without the guard the other two have, and how the `MailTransport` classification ended up duplicated. **Rejected:** inline guards; a sourced file is a smaller per-script diff and D-3 makes omission detectable. *(KZ-004.)*

### DD-2: Stub `PATH`, do not refactor for injection
Refactoring seven scripts to take injectable commands would be a larger diff than the bug warrants and would change the code under test to suit the test. A `PATH` stub runs the **real, unmodified scripts**. **Rejected:** wrapper-function mocking, which requires editing every call site — the change most likely to introduce D-4.

### DD-3: Classify on two tokens, not on emptiness or on `ValidationError` alone
Both an absent stack and a failed call yield an empty string, so emptiness cannot discriminate. `ValidationError` alone over-matches (a misspelled stack name). **Accepted risk:** CloudFormation's wording is an external contract; a change makes the guard fail **closed** — a recoverable annoyance on a rare, attended bootstrap, versus the fail-open bug being fixed. The exact string is asserted in a test, so a wording change surfaces as a test failure rather than a silent regression. *(KZ-011: verified against the message text in `deploy-profile-override/proposal.md` §3 and the `*ValidationError*` branch in `deploy.sh`.)*

### DD-4: A value-carrying, purpose-named override replacing `CONFIRM=yes`'s profile role
Driven by §6.1. `CONFIRM` keeps its destruction-confirmation role; it stops authorising a foreign account. **This reverts delivered behaviour** — see the challenge below.

### DD-5: `smoke.sh` gets a check, not a new script
The CORS assertion belongs where the other assertions live, using the same `pass()`/`fail()` accounting, so a failure is summarised rather than aborting the run, and so the pipeline picks it up with **no Jenkinsfile change** — `RUN_SMOKE=true` already calls `smoke.sh`. **This is the one fix that reaches the live failure mode without anyone editing the Jenkins server.** It becomes Check 6 and Summary renumbers to 7; the current header numbers 1–6 with Summary at 6, so appending "Check 7" after a block called "6. Summary" would be immediately stale.

### DD-6: `validate.sh` gets FR-1 and FR-2 but not FR-3
Its header states it "makes NO changes and creates NO resources", and root `CLAUDE.md` lists it as the canonical agent-run infra check. FR-3's own trigger is "before any write". Giving a read-only linter a live STS dependency and a config-file read would defeat the property that makes it safe to run in the agent loop. **Rejected:** uniformity for its own sake (`judgment.md` S-11).

## 8.1 Reversion challenge (DD-4)

**Question put:** what breaks if `CONFIRM=yes` no longer clears the profile guard?

**Answer:** any operator habit or local automation invoking `CONFIRM=yes AWS_PROFILE=other ./infra/scripts/teardown.sh` — a form the script's own usage line advertises — stops working. It fails **closed**, naming the new variable, so the failure is self-correcting rather than silent.

Nothing in this repository depends on it: no test covers the coupling (there are no shell tests), and `infra/README.md` is updated by FR-7 in the same change. Revision 1 also claimed the pipeline never runs these scripts; that claim was unverified and has been **withdrawn** — `requirements.md` §7 now records it as unknown (`judgment.md` S-12). It does not change the answer: the pipeline sets `AWS_PROFILE=IBD-DEV`, so the guard passes there whether or not it ever invokes these scripts.

**Design unchanged; the breakage is the intent.**

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| The guard breaks the pipeline | The pipeline sets `AWS_PROFILE = 'IBD-DEV'`, the floor value (verified). NFR-3 pins it with a guard-unit test |
| CloudFormation wording changes ⇒ guard fails closed on a real bootstrap | DD-3 accepted risk; the string is asserted in a test, so the change is visible |
| Stubs diverge from the real tools, so tests pass against a fiction | **Accepted and recorded — the residual KZ-002 in this design.** The stubs reproduce observed output (the absent-stack text is quoted from a real failure in `deploy-profile-override/proposal.md` §3), but they prove the *scripts'* logic, never the CLIs' behaviour. No test here can catch an AWS CLI behaviour change |
| **The committed account id is wrong, and no gate can see it** | Every test stubs `sts`, so a placeholder or mistyped id in `aws-accounts.conf` passes the entire suite and then fails closed on every real run — the "sign reversed" shape again. Mitigation is procedural, not automated: the task that creates the file carries an operator-run `aws sts get-caller-identity --profile IBD-DEV` transcript as its evidence |
| A well-formed but misspelled stack name reads as absent | Accepted residual (`requirements.md` FR-5). No error-text rule can separate a typo from a genuine bootstrap; the failure is visible rather than silent |
| The Jenkinsfile changes upstream, invalidating the patch and the docs | Every claim is date-stamped (FR-7); the patch README says it is advisory and unversioned upstream |
| Doc claims are false again | D-7: no automated gate. Mandatory Reviewer on the doc task, re-deriving from §7.4's verbatim block, not from this spec |

## 10. Test Plan Outline

Every gate has a named falsifier — the input that makes it red. A gate with no such input is not in this table.

| Gate | Kind | Falsifier |
|---|---|---|
| Profile floor aborts on a foreign profile | unit | Invert the comparison ⇒ red |
| Floor passes under `AWS_PROFILE=IBD-DEV` | unit | Make the guard unconditional ⇒ red |
| Non-interactive run fails closed | unit | **The honest mutation is `[[ ! -t 0 ]] && return 0`** — reintroducing the old `[[ -t 0 ]]` branch would still abort under stdin `/dev/null` (`read` hits EOF, reply empty, `exit 1`), so that mutation proves nothing |
| Override proceeds **and** announces | unit | Silence the announcement ⇒ red |
| Override set but ≠ `AWS_PROFILE` aborts | unit | Treat the override as boolean ⇒ red |
| `AWS_PROFILE`/`CONFIRM` rejected as override | unit | Accept either ⇒ red |
| Account mismatch aborts with a matching stack name | unit | Assert the stack name instead of the account ⇒ red |
| `validate.sh` runs with no STS call | integration | Invoke the account assertion from it ⇒ the `aws` stub records an `sts` call ⇒ red |
| `aws-accounts.conf` parsed, not sourced | unit | `source` it ⇒ aborts on a correct profile ⇒ red |
| Absent stack ⇒ announced `*` | integration | Abort instead ⇒ red |
| Failed lookup ⇒ **abort**, not `*` | integration | Restore `2>/dev/null \|\| true` ⇒ red |
| **Malformed** stack name ⇒ abort, not `*` | integration | Match `ValidationError` alone ⇒ red. *(A well-formed **typo** is indistinguishable from absence — accepted residual, §9, not a gate)* |
| Every non-library script sources the guard **before its first external command** | integration | Add an unguarded script, or move a `source` below the first `aws` call ⇒ red |
| `smoke.sh` CORS line FAILs on a permissive `ACAO` | integration | Assert the exit code instead of the `RESULTS` line ⇒ green with the check deleted ⇒ red |
| `smoke.sh` CORS line FAILs on an echoed origin | integration | Compare only against `*` ⇒ red |
| `smoke.sh` CORS line FAILs on a refused connection | integration | Treat "no `ACAO`" as a pass ⇒ red |
| `smoke.sh` CORS line FAILs on a `500` with no `ACAO` | integration | Ignore the status code ⇒ red |
| `smoke.sh` CORS line **PASSes** on a clean `204` with no `ACAO` | integration | Make the check unconditionally FAIL ⇒ red. Without this row, a check that never passes satisfies every other row and reds every pipeline build |
| `MailTransport` classification is two-token after the refactor | integration | Leave a `*ValidationError*`-only match at that call site ⇒ red |

**Declared gap (D-7):** no gate evaluates whether a sentence in `docs/infrastructure.md` is true. Substituted with a mandatory Reviewer re-deriving from §7.4.

## 11. Budget (tripwire)

| Metric | Revision 1 | **Revision 2** |
|---|---|---|
| Tasks | 6 | **7** |
| Net LOC | ~380 | **~470** |
| Review rounds | 8 | **9** |

The +90 LOC reconciles as: the two-kind harness split **+60** (a second runner and its fixtures), the per-script in-situ abort runs D-3b now requires **+20**, and FR-6's two extra scenarios **+10**. Breakdown, each line owned exactly once: harness ~210, `_guard.sh` ~110, seven script edits ~50 (including deleting each local `PROFILE=` line), `smoke.sh` CORS check ~40, `aws-accounts.conf` + patch + README ~25, documentation ~35 prose lines. `smoke.sh`'s header correction is counted under documentation, not under the check.

**These are estimates, not measurements** — no diff exists yet to recompute them from. `/akili-execute` measures the actuals and trips on the delta; that is what a tripwire is for (KZ-005).

Not a quality cap — a tripwire. `/akili-execute` compares actuals and **escalates to the user** rather than continuing past it.
