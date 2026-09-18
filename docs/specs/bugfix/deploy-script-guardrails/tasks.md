# Tasks — Deploy-script guardrails

- Spec path: `docs/specs/bugfix/deploy-script-guardrails/`
- Status: **Draft** · Depth: **Standard** · Type: **Bug** (Bug Mode)
- Author / Date: AKILI (Leader) — 2026-09-18
- Source: `requirements.md` FR-1…FR-7 · `design.md` §7 · `judgment.md` (2 rounds, ESCALATED)
- Budget (`design.md` §11): **7 tasks · ~470 LOC · 9 review rounds** — `/akili-execute` escalates on breach

## Conventions for this spec

**Bug Mode.** T-1 builds the harness before any fix exists, and **every subsequent task's `Verify` must be shown red before its fix and green after.** A task reporting only green has not discharged its evidence.

**The disqualifier, once, for all tasks.** A gate here is a bash exit status, which is cheap to satisfy accidentally. For every task: *if the named falsifier does not produce red, the test is not evidence — report the gate as inconclusive rather than the task as done.* An inconclusive verification is a legitimate outcome (KZ-002, ×7 in this repo).

**No AWS.** Every `Verify` runs with no credentials and no network. A task whose verification needs either has been decomposed wrong.

---

## Tasks

- [x] **T-1 Build the test harness** (deps: none)
      Scope: `run-tests.sh` (runner + one assertion helper + summary), the stub-`PATH` machinery, and fixture stubs for the **network-capable set only** — `aws`, `curl`, `sam`, `npm`, `npx`. Two kinds: **guard-unit** (sources the library in a subshell) and **script-integration** (runs whole scripts with the stub `PATH`, `SKIP_MIGRATE_PAUSE=yes`, stdin `</dev/null`). No fixture HTTP server; no stubbing of `awk`/`grep`/`sed`/`dirname`/`jq`.
      Traces: NFR-1, NFR-2, `design.md` §7.2
      Files: `infra/scripts/tests/run-tests.sh`, `infra/scripts/tests/stubs/*`, `infra/scripts/tests/cases/*`
      Verify: `./infra/scripts/tests/run-tests.sh` with **AWS credentials unset and networking disabled**
      Falsifier: a deliberately failing placeholder case must make the runner exit non-zero. **A runner that reports success with zero cases registered is the first thing to disprove** — assert the case count.
      Done when: the runner executes, reports a count, and fails on the placeholder. No task after this one may add a test that needs network.
      Skills: `aws-serverless`

- [x] **T-2 `_guard.sh` — profile floor and override** (deps: T-1)
      Scope: the library; the floor and override **execute on `source`** (`design.md` §7.1). Exports `PROFILE`/`REGION`. Resolves its own path with `${BASH_SOURCE[0]%/*}`, never `$0`. No TTY branch.
      Traces: FR-1 (all clauses), FR-2 (all clauses), NFR-3, `design.md` §7.1
      Files: `infra/scripts/_guard.sh`, `infra/scripts/tests/cases/guard-profile.*`
      Verify: `./infra/scripts/tests/run-tests.sh`
      Clause ownership — each gets its own case:
        · unset `AWS_PROFILE` ⇒ proceeds, `PROFILE=IBD-DEV` · foreign profile ⇒ non-zero **before any AWS call** · message names **both** profiles · non-interactive ⇒ fails closed · override **equal to** `AWS_PROFILE` ⇒ proceeds **and announces on stderr** · override **set but different** ⇒ non-zero · `AWS_PROFILE` rejected as override · `CONFIRM` rejected as override · `AWS_PROFILE=IBD-DEV` ⇒ exit `0` (NFR-3)
      Falsifiers: invert the comparison ⇒ red · make the guard unconditional ⇒ the NFR-3 case reds · silence the announcement ⇒ red · treat the override as boolean ⇒ the set-but-different case reds · **`[[ ! -t 0 ]] && return 0` ⇒ the non-interactive case reds** (the honest mutation; restoring the old `[[ -t 0 ]]` branch would still abort under stdin `/dev/null` and proves nothing)
      Done when: every clause above has a case, and each named falsifier was run and observed red.
      Skills: `aws-serverless`, `tdd`

- [x] **T-3 `aws-accounts.conf` and `assert_account`** (deps: T-2)
      Scope: the committed config file and the explicit `assert_account` function. **Parsed with `awk -F=`, never sourced** — `IBD-DEV=…` is not a valid bash assignment and sourcing it would abort every script on a *correct* profile. A missing or malformed row aborts, naming the file. An overridden profile still needs a row and still asserts (FR-2's interaction clause).
      Traces: FR-3 (all clauses), FR-2 interaction clause, `design.md` §7.3
      Files: `infra/aws-accounts.conf`, `infra/scripts/_guard.sh`, `infra/scripts/tests/cases/guard-account.*`
      Verify: `./infra/scripts/tests/run-tests.sh`
      Clause ownership: foreign account ⇒ non-zero · **foreign account *with a matching stack name* ⇒ still non-zero** (the collision case — the danger a name check cannot see) · missing row ⇒ abort naming the file · overridden profile with no row ⇒ abort · no account id literal appears in any script
      Falsifiers: assert the stack name instead of the account ⇒ the collision case reds · `source` the conf instead of parsing ⇒ the correct-profile case reds
      **Evidence this task must carry beyond the suite:** every test stubs `sts`, so a mistyped account id passes the whole suite and then fails closed on every real run (`design.md` §9). The completion report **must** include an operator-run `aws sts get-caller-identity --profile IBD-DEV` transcript showing the committed id matches. Without it this task is not done.
      Skills: `aws-serverless`, `tdd`

- [x] **T-4 Wire the guard into all seven scripts** (deps: T-3)
      Scope: `source` the library as the first statement after `set -euo pipefail` in all seven; **delete each local `PROFILE="${AWS_PROFILE:-IBD-DEV}"` line**; add `assert_account` to the five **writing** scripts only — `validate.sh` and `smoke.sh` are read-only and exempt. Remove the `CONFIRM=yes` profile-override branch from `migrate-seed.sh` and `teardown.sh`, leaving `teardown.sh`'s destruction confirmation untouched.
      Traces: FR-1, FR-2, FR-3 read-only exemption, NFR-4, DD-4, DD-6, `design.md` §7.1
      Files: all seven `infra/scripts/*.sh`
      Verify: `./infra/scripts/tests/run-tests.sh`
      Clause ownership:
        · **(a)** enumeration — every non-library `infra/scripts/*.sh` sources the guard, and after stripping comments/blanks **no line matching `\b(aws|sam|curl|npm|npx)\b` precedes it**
        · **(b)** in-situ abort — for **each** of the seven, `AWS_PROFILE=MELIA-DEV ./<script>` exits non-zero
        · **(c)** foreign-account abort — for each of the **five writing** scripts, a foreign-account `sts` stub exits non-zero
        · **(d)** `validate.sh` and `smoke.sh` make **no** `sts` call (the stub records invocations)
        · **(e)** zero remaining local `PROFILE=` lines; zero `CONFIRM` mentions in `migrate-seed.sh`
      Falsifiers: add an unguarded script ⇒ (a) reds · source the guard but prevent it running in one script ⇒ **(b) reds** · omit `assert_account` from one writing script ⇒ (c) reds · call it from `validate.sh` ⇒ (d) reds
      **(b) and (c) are the point of this task.** Asserting only that a `source` line exists would pass a tree where every script sources the guard and none runs it — `judgment.md` V-1.
      Done when: all five clause groups have cases and every falsifier was observed red.
      Skills: `aws-serverless`

- [x] **T-5 `resolve_stack_value` and `deploy.sh` origin resolution** (deps: T-4)
      Scope: the helper with its documented contract (value on stdout; exit `0` found / `2` absent / `1` abort; the `else rc=$?; case` call shape; `None` ⇒ `2` for Parameter queries, **abort** for Output queries). Replace `ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"` with a real resolution. Migrate **both** existing `MailTransport` call sites onto the helper, which tightens them to the two-token rule.
      Traces: FR-4 (all clauses), FR-5 (all clauses incl. the `MailTransport` clause), NFR-4, DD-3, `design.md` §7.1
      Files: `infra/scripts/_guard.sh`, `infra/scripts/deploy.sh`, `infra/scripts/set-cors.sh`, `infra/scripts/tests/cases/resolve-*.*`
      Verify: `./infra/scripts/tests/run-tests.sh`
      Clause ownership: frontend stack present ⇒ its `CloudFrontUrl` is passed · stack **confirmed absent** ⇒ `*` **announced on stderr** · lookup **failed** (expired token / access denied) ⇒ **abort, never `*`** · **malformed** stack name ⇒ abort · explicit `ALLOWED_ORIGIN=` still wins · `None` on an Output query ⇒ abort · both `MailTransport` sites match two tokens
      Falsifiers: restore `2>/dev/null || true` ⇒ the failed-lookup case reds · match `ValidationError` alone ⇒ the malformed case reds · use `VAR=$(…) || true` ⇒ the contract case reds · leave a one-token match at a `MailTransport` site ⇒ reds
      **Accepted residual, not a gate:** a *well-formed misspelled* stack name is indistinguishable from a genuine absence — CloudFormation returns the same `does not exist`. Do not write a test claiming otherwise (`judgment.md` V-2).
      Skills: `aws-serverless`, `tdd`, `systematic-debugging`

- [x] **T-6 `smoke.sh` CORS check** (deps: T-1)
      Scope: a new **Check 6** using the existing `pass()`/`fail()` accounting; **Summary renumbers to 7**. Sends a real preflight — `Origin` **plus** `Access-Control-Request-Method` — because the HTTP API auto-answers only genuine preflights. Read-only.
      Traces: FR-6 (all five directions), DD-5, `design.md` §7.2
      Files: `infra/scripts/smoke.sh`, `infra/scripts/tests/cases/smoke-cors.*`
      Verify: `./infra/scripts/tests/run-tests.sh`
      Clause ownership — five directions, each its own case: permissive `*` ⇒ **FAIL** · origin **echoed back** ⇒ FAIL · refused connection ⇒ FAIL · `500` with no `ACAO` ⇒ FAIL · clean `204` with no `ACAO` ⇒ **PASS**
      **The assertion target is the summary's `FAIL  CORS…` / `PASS  CORS…` line, captured `2>&1` — never the exit code.** With the network stubbed, other checks fail on their own, so an exit-code assertion passes with this check **deleted**. `pass()` writes to stdout and `fail()` to stderr, which is why `2>&1` is not optional.
      Falsifiers: assert the exit code instead ⇒ deleting the check leaves it green ⇒ red · compare only against `*` ⇒ the echoed case reds · treat "no `ACAO`" as a pass ⇒ the refused and `500` cases red · make the check unconditionally FAIL ⇒ **the PASS case reds** (without this the check would red every pipeline build under `RUN_SMOKE=true`)
      Done when: all five directions have cases; `API_BASE_URL`, `CLOUDFRONT_URL` and `BUCKET` are preset so Check 1 makes no live lookup.
      Skills: `aws-serverless`, `tdd`

- [ ] **T-7 Documentation sync and the Jenkinsfile patch** (deps: T-4, T-5, T-6)
      Scope: correct `docs/infrastructure.md` §3's *"CORS is safe across pipeline deploys"* to describe the fail-open path; update §4; `infra/README.md`; root `CLAUDE.md` (it documents `validate.sh` as the infra verify command and `deploy-frontend.sh`'s profile behaviour, both changed). Sweep **every falsified script self-description**: `smoke.sh`'s header and `SMOKE PASSED` line, `deploy.sh`'s `ALLOWED_ORIGIN='*'` USAGE line and its bootstrap comment, `teardown.sh`'s and `migrate-seed.sh`'s `CONFIRM=yes AWS_PROFILE=other` USAGE lines. Add `infra/jenkins/deploy-backend-cors.patch` + README — **CORS resolution only**, never the `MailTransport` parameter beside it.
      Traces: FR-7 (all clauses), NFR-5, `design.md` §7.4
      Files: `docs/infrastructure.md`, `infra/README.md`, `CLAUDE.md`, four `infra/scripts/*.sh` headers, `infra/jenkins/*`
      Verify: `grep -rn "CORS is safe across pipeline deploys" docs/` returns nothing; `grep -rn "also clears IBD-DEV guard\|override the IBD-DEV guard" infra/scripts/` returns nothing; `./infra/scripts/tests/run-tests.sh` still green
      **⚠️ MANDATORY REVIEWER — and a different brief from every other task.** Root `CLAUDE.md`: any task touching a constitutional baseline gets a Reviewer even when it is "just docs". D-7 is the spec's one **unmeasurable** defect class: no command evaluates whether a sentence is true. The Reviewer re-derives the CORS claim from the **verbatim block in `design.md` §7.4**, never from this spec. The other three Jenkinsfile claims in `requirements.md` §7 are **not** quoted anywhere and are re-derivable only from the operator's copy — the Reviewer must mark them as such rather than confirm them.
      **⚠️ N-1, carried from `judgment.md`, blocks the `Smoke` claim:** on the bootstrap path (`DEPLOY_INFRA=true`), `Deploy Backend` writes `*` legitimately and `Lock CORS` repairs it. If `Smoke` runs **between** them, T-6's check reds the first bootstrap build. The stage order is not derivable from anything in this repository. **Ask the Jenkins administrator before writing any doc sentence about bootstrap smoke behaviour; if unanswered, record it as an open risk rather than asserting either way** (KZ-011).
      Skills: `cognitive-doc-design`, `aws-serverless`

---

## Dependency Graph

```
T-1 → T-2 → T-3 → T-4 → T-5 → T-7
T-1 → T-6 ─────────────────────↑
```

`T-6` needs only the harness, so it can run in parallel with `T-2`…`T-5`. It is also the task that reaches the live failure mode without anyone editing the Jenkins server, which makes it the best candidate to land first if the spec is ever split.

## Coverage closure (KZ-001)

Every requirement's scenarios **and** every `BUT it must NOT` / `AND IT MUST` clause, mapped to the task that owns it. No clause is discharged by citing a different requirement.

| Requirement | Clauses | Owner |
|---|---|---|
| FR-1 | 4 (proceed · abort · non-TTY fails closed · names both profiles) | T-2, in-situ in T-4(b) |
| FR-2 | 6 (match proceeds+announces · mismatch aborts · not `AWS_PROFILE` · not `CONFIRM` · single variable · **FR-3 interaction**) | T-2; interaction in T-3 |
| FR-3 | 5 (mismatch aborts · collision case · read-only exemption · no literal id · provable offline) | T-3; exemption in T-4(d) |
| FR-4 | 4 (resolved origin · announced bootstrap · not on failed lookup · explicit override wins) | T-5 |
| FR-5 | 6 (abort on failure · absent ⇒ bootstrap · two tokens · no `2>/dev/null` · classify on text · **`MailTransport` sites**) | T-5 |
| FR-6 | 7 (permissive · echoed · clean PASS · not on refused/non-2xx/5xx · real preflight · `pass()`/`fail()` accounting · read-only) | T-6 |
| FR-7 | 4 (§3 corrected · date-stamped · **all** script self-descriptions · no false "fixed" claim) | T-7 |
| NFR-1…5 | 5 | T-1 (1,2), T-2 (3), T-4 (4), T-7 (5) |

**Declared uncovered, with reasons** — neither is silently dropped:

| Item | Why it has no gate |
|---|---|
| **D-7** — is a documentation sentence true? | Structurally unmeasurable. Substituted with T-7's mandatory Reviewer and its re-derivation brief |
| **N-1** — bootstrap-path stage order | Needs an artefact outside this repository. T-7 must ask, not assume |

## Estimated LOC and PR strategy

**~470 LOC**, of which ~210 is the test harness — the tests outweigh the fix, which is the correct ratio for a bugfix whose whole problem was that nothing could be verified.

**Recommend two PRs.** The 400-LOC threshold is exceeded and the two halves have different reviewers and different risk:

| PR | Tasks | Why separate |
|---|---|---|
| **1 — Harness and guard** | T-1 … T-4 | ~370 LOC, all mechanism, reviewable without judging CORS semantics. Landing it alone changes no deploy behaviour beyond the profile floor |
| **2 — Resolution, CORS, docs** | T-5 … T-7 | ~100 LOC but the highest-consequence half: it changes what `deploy.sh` sends to CloudFormation and what `smoke.sh` fails on. Carries the mandatory documentation Reviewer |

PR 2's description should state what PR 1 already established, so its reviewer does not re-derive the guard contract.
