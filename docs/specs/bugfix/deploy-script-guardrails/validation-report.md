# Validation Report — Deploy-script guardrails

## Verdict: **NOT READY to archive** — pending a documentation-only pre-archive pass, plus three code follow-ups

**8 PASS · 8 WARN · 0 FAIL · 0 BLOCKED**, plus 4 new advisories and 11 carried forward.

The mechanism is sound. Every FR clause at its scoped sites has code and a discriminating case; the in-situ guard gates are real; `resolve_stack_value`'s contract is honoured at all four call sites; the constitutional edits landed. **No finding requires reverting anything.**

What blocks freezing is the **record**, judged by this spec's own standard — it gated eight times on document truth, and three of its own figures would freeze as measured when they are not.

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/bugfix/deploy-script-guardrails/` |
| Validated | 2026-09-21 |
| Tickets | ATP-64, ATP-65 |
| Tasks | **7/7 `[x]`**, 7 `execution.md` entries, 7 recorded PASSes |
| Suite | 48 cases, 48 passed, hermetic |

### ⚠️ Independence boundary — read this before trusting any verdict below

The Leader that orchestrated this spec **also authored `requirements.md`, `design.md` and `tasks.md`** and adjudicated every review round. Its validation of its own documents would not be independent.

**Phases 4, 5 and 6 were therefore delegated to an auditor on a different model from both the Leader and the Implementers**, with the explicit instruction not to soften findings about finished work. The mechanical phases (1–3) were run by the Leader because they are measurements, not judgements. **Every WARN below came from the independent auditor; the Leader confirmed three of them by execution.**

## 2. Summary

| Phase | Result |
|---|---|
| 1 · Task completion | **PASS** — 7/7, each with attempt history and a recorded Reviewer PASS |
| 2 · File existence | **PASS** — every design-declared file present |
| 3 · Build integrity | **PASS** — `validate.sh` → 3/3 SAM templates valid, exit 0; spec suite 48/48 |
| 4 · Requirement coverage | **PASS with 4 WARNs** — every clause owned at its scoped sites; four coverage-record defects |
| 5 · Quality (4R) | advisory — 4 new, 11 carried |
| 6 · Design conformance | **PASS with 4 WARNs** — implementation matches; four figure/status defects |

**Application code is untouched.** `git diff` over the whole spec shows **zero** files under `backend/` or `frontend/`, so NFR-5 holds and the application suites are not applicable — the diff is more direct evidence than running them.

## 3. Task Completion — PASS

All seven `[x]`. `execution.md` carries a full attempt history per task, including every FAIL verdict verbatim. Evidence-before-checkbox ordering held throughout.

## 4. File Existence — PASS

`_guard.sh`, `aws-accounts.conf`, `tests/run-tests.sh`, `jenkins/deploy-backend-cors.patch`, `jenkins/README.md` — all present.

## 5. Build Integrity — PASS

| Gate | Result |
|---|---|
| `./infra/scripts/validate.sh` | 3/3 templates valid, exit 0 |
| `./infra/scripts/tests/run-tests.sh` | 48/48, no credentials, no network |
| `backend/`, `frontend/` suites | **Not applicable** — zero files touched |

Worth noting: `validate.sh` printed `profile=IBD-DEV region=eu-west-1` from the guard's own export, so running the repo's infra gate is **also an integration proof of T-4's wiring against the real SAM CLI** rather than a stub.

## 6. Requirement Coverage

**PASS at clause granularity** for FR-1 (4 clauses), FR-2 (6), FR-3 (5 as written), FR-4 (4), FR-5 (6 at its scoped sites), FR-6 (7), FR-7 (4), NFR-1/2/4. Each verified by the independent auditor against code, not against the coverage table.

Highlights it confirmed as stronger than required: the FR-3 read-only exemption is proven by a marker stub over **all** `aws` invocations, not just `sts`; the collision case genuinely constructs a resolving same-name stack under a foreign account; the two-token match at `_guard.sh:272` is the **only** `*ValidationError*` code match in the tree, so NFR-4 is grep-verifiable.

### 🔴 V-01 | WARN | FR-3's expected-account premise is unstated — and the product owner has contradicted it

**Raised by the product owner after the spec closed:** *"the account used here for testing is not the same one that runs everything in AWS."*

FR-3 holds **as written** — every clause is implemented and driven. But its model is **one row per profile *name***, and the record never states which account the **pipeline's** `IBD-DEV` (materialised from the Jenkins credential `prms-test-aws-creds`) resolves to. The T-3 transcript verified only the laptop profile.

`design.md` §9 row 1's mitigation — *"the pipeline sets `AWS_PROFILE='IBD-DEV'` … NFR-3 pins it"* — **covers FR-1 only.** NFR-3's measure is a profile-floor unit test that **stubs `sts`**, so it structurally cannot observe an account mismatch in CI.

**Consequence if the accounts differ:** the first pipeline build that invokes a writing script **fails closed** — loud, not silent, so not a security hole, but a KZ-007 interaction gap (FR-3 × pipeline) that this spec's own KZ-007 clause in FR-2 shows it knew to look for.

The auditor's own inference — that the live dev stack sits in `569113802249` and is reachable from a laptop profile that per ATP-33 cannot deploy, so the pipeline likely writes to that same account and the PO's statement may be about IAM principals rather than account ids — **is explicitly marked as inference, not recorded fact.** The archive must not freeze an inference as a premise.

**Remediation (documentation only, unless the answer differs):** the pipeline's `AWS Auth` stage **already runs `sts get-caller-identity`**. One build-log line settles it. Add a `requirements.md` §7 row — *"pipeline `IBD-DEV` resolves to account `<id>` — Jenkins build #N log, `<date>`"* — or mark it UNVERIFIED, and amend `design.md` §9 row 1 to say NFR-3's gate covers the floor, **not** `assert_account`. If the id differs, the one-name/one-account model needs a **design decision** (a distinct profile name in CI, or a keyed allow-list), not a `.conf` edit.

### V-03 | WARN | FR-5 says "**Every** resolution" — `teardown.sh` is an unswept site

`teardown.sh`'s `stack_exists` (`>/dev/null 2>&1`) and its outputs fallback (`2>/dev/null … || FRONTEND_OUTPUTS="[]"`) read an expired token, a throttle or an IAM denial as *"already gone, skipping"*, then print **`Teardown complete. All three stacks deleted (or already absent)`** and exit **0** — a **false success**, though it deletes nothing.

`requirements.md` §2.1's defect inventory examined only `deploy.sh`, `set-cors.sh` and the Jenkinsfile. **`teardown.sh` was never inventoried**, and the coverage table credits FR-5 fully to T-5, whose Files list excludes it. Not a hidden gap by intent — **an over-broad Description**.

**Remediation:** either narrow FR-5's Description to *"every resolution feeding a **write** parameter"* (which is what §2.1 and T-5 actually scoped), or record `teardown.sh`'s idempotent-skip conflation as an accepted residual. **Do not leave "Every" standing over an unswept site.**

### V-04 | WARN | `tasks.md`'s "Declared uncovered" table is incomplete relative to `execution.md`

The table lists D-7 and N-1 only. `execution.md` honestly declares two more — FR-6's *"real preflight"* clause (implemented at `smoke.sh:323`, ungated: the stubs dispatch on `-X OPTIONS` alone, so deleting the header leaves 48 green) and FR-7's *"date-stamp **every** Jenkinsfile claim"* (knowingly unmet for the `DEPLOY_INFRA`/`RUN_MIGRATIONS` rows).

**The gaps are honest; their location is not where the methodology puts them.** A future reader consults `tasks.md` for coverage and sees FR-6 at 7/7 with no asterisk. **Remediation:** two rows, copied from `execution.md`.

## 7. Linting & Code Quality — advisory

### 🔴 A-01 and A-02 are regressions this spec introduced — both confirmed by the Leader by execution

**A-01 — `${BASH_SOURCE[0]%/*}` breaks the no-slash invocation form.**

```
$ cd infra/scripts && bash validate.sh
validate.sh: line 26: validate.sh/_guard.sh: Not a directory
```

With no slash in `BASH_SOURCE[0]`, `%/*` strips nothing and the path becomes `validate.sh/_guard.sh`. **The pre-existing `$(dirname "$0")` form handled this.** Worse, `design.md` §7.2's stated reason for avoiding `dirname` — that it would trip the enumeration regex — **is false**: the implemented regex set is `(aws|sam|curl|npm|npx)`, which does not contain `dirname`. A design rationale that was wrong, causing a regression.

Fails closed and loudly, so not dangerous. **Fix:** `d="${BASH_SOURCE[0]%/*}"; [[ "$d" == "${BASH_SOURCE[0]}" ]] && d=.`

**A-02 — `2>&1` on the *success* path pollutes the resolved value.**

`assert_account` (`_guard.sh:148`) and `resolve_stack_value` (`:254`) both merge stderr into the captured value. An AWS CLI that **succeeds while emitting a stderr warning** (the macOS LibreSSL/`urllib3` warning on pip-installed CLIs is the common case) yields:
- `assert_account` → aborts on **every correct run**
- `resolve_stack_value` → hands `ALLOWED_ORIGIN="<warning>\n<url>"` to `sam deploy`

**The Jenkins patch shipped in this spec already does this correctly, with a temp file. The helper should match the patch it was modelled on.**

### Other new advisories
| ID | Finding |
|---|---|
| A-03 | Proposal constraint 6 (*"every divergence on stderr"*): the `MailTransport` template-default fallback announces on **stdout** (`deploy.sh:141`, `set-cors.sh:93`). Pre-existing; no FR clause binds it |
| A-04 | **47 evidentiary cases, not 48** — `000-placeholder.case.sh` tests the harness, not a script. The count is quoted as if all 48 were guard evidence |

### Carried forward from `execution.md` — surfaced so they do not die in the audit trail
No `+x` check on stubs (a non-executable stub falls through to the real binary); the runner does not scrub ambient AWS env; T-4's matcher control is a textual duplicate of the loop's regex; T-5's `ValidationError` token is not independently falsified (only `does not exist` is); the contract shape is falsifier-covered at 2 of 4 sites; no `--max-time` on the CI-reaching preflight `curl`; T-3's trap overwrite leaks temp dirs; `wire.migrate-seed-confirm-removed…:9-20` still says *"left for T-7"*; `docs/infrastructure.md:151` misattributes Check 6.

**And the one that deserves its own ticket:** **`frontend/CLAUDE.md:65` is FALSE** — *"Never deploy with a leaked non-IBD-DEV profile (the script warns; heed it)"*. The script now **aborts**. Root `CLAUDE.md` states child guides train every future agent, so this is not a paragraph in a frozen log — it is a live falsehood in a file agents read, and the falsehood points the **wrong way**: it tells an agent that catching a leaked profile is *their* job when the guard fails closed. Left unfixed by an NFR-5 scope decision that the Reviewer upheld on condition it be recorded.

## 8. Design Conformance — PASS with figure defects

Implementation matches `design.md` §7.1–§7.4 and DD-1…DD-6. The patch's `-` block matches §7.4 **character for character**; its `+` block correctly reproduces Output-query semantics. `proposal.md`'s constraints 1–6 and non-goals are honoured.

### Cross-document figure check — three defects, all KZ-005/KZ-004 shapes

| ID | Finding |
|---|---|
| **V-05** | `execution.md`'s Summary asserts **production 454 / tests 2,941 / ratio 6.5:1**. The measured tests tree is **3,236**. The five T-6 cases total **295**, and 2,941 + 295 = 3,236 exactly — so **2,941 is the T-5 measurement republished as final**. `design.md` §11 correctly labels it *"measured again at T-5"*; the Summary drops the qualifier. This is the KZ-005 ×2 shape — *the same measurement published twice, both presented as measured.* No tripwire consequence (~3,800 true total is under the ~4,300 re-baseline), but the frozen record would misstate |
| **V-06** | **"Eleven rework rounds" does not recompute.** From `execution.md`'s own attempt counts (3,3,3,2,2,1,2): Reviewer rounds = **16**, FAIL verdicts = **9**. `design.md` §11 says *"seven rework rounds so far"* (FAILs through T-5 = 8). The Summary's cause table sums to 11; adding the five adjudicated advisories gives 14. **Three documents, three numbers, none derivable from the attempt log.** The *qualitative* finding — none was the mechanism being wrong — survives any of these counts |
| **V-07** | `tasks.md`'s header and PR-strategy section, and `execution.md`'s header, still say **~470 LOC · 9 review rounds**. `design.md` §11 was re-baselined **twice** to ~4,300 / ~20. **The correction landed in the document that measured and nowhere else** — KZ-004 |

**V-08 | WARN** — `requirements.md`, `design.md` and `tasks.md` all read `Status: Draft` on a completed spec.

## 9. Test Evidence Summary

48 cases, 48 passing, hermetic by construction: the stub set is exactly `{aws, curl, sam, npm, npx}`; text tools run real. No `test-report.md` exists (`/akili-test` was not run) — coverage evidence is the per-task falsifier transcripts in `execution.md`, independently re-derived by the auditor against source.

**The boundary that matters, in the auditor's words:** the suite corroborates the scripts' **behaviour**, never the **truth of the prose**. D-7 has no automated gate by construction, and a green suite is not evidence about any document claim.

## 10. Agent Guide / Constitution Impact

No `## Constitution Impact` blocks in `execution.md` — no module was created or reshaped. Root `CLAUDE.md` was edited within NFR-5's permitted scope.

**Pending for `/akili-archive`:** `frontend/CLAUDE.md:65` (false), `AGENTS.md:21` (incomplete). Both are child/mirror guides that root `CLAUDE.md` says train every future agent.

## 11. Remediation

### Pre-archive — documentation only, well under an hour
| # | Action |
|---|---|
| 1 | **V-01** — read the pipeline's existing `AWS Auth` STS line; add a `requirements.md` §7 row with the account and build number, or mark UNVERIFIED. Amend `design.md` §9 row 1: NFR-3 covers the floor, not `assert_account` |
| 2 | **V-03** — narrow FR-5's Description to write-parameter resolutions, or declare `teardown.sh` an accepted residual |
| 3 | **V-04** — add the two declared gaps to `tasks.md`'s coverage table |
| 4 | **V-05** — re-measure on a quiet tree and replace the three figures, or relabel *"as of T-5"* |
| 5 | **V-06** — state the counting rule and recompute once; fix `design.md` §11's *"seven"* |
| 6 | **V-07** — supersession pointer in `tasks.md` and `execution.md`; mark the PR-split section historical |
| 7 | **V-08** — `Status: Draft` → `Done` in three documents |

### Follow-ups — code, a separate spec
| # | Action |
|---|---|
| 8 | **A-02** — replace `2>&1` with a temp file in `assert_account` and `resolve_stack_value`, matching the Jenkins patch. **Highest-value of the three: it can abort a correct run or pollute a deploy parameter** |
| 9 | **A-01** — handle the no-slash invocation form |
| 10 | **V-02** — make the conf parser abort on a duplicate key instead of silently taking the first |
| 11 | **`frontend/CLAUDE.md:65`** — its own ticket; it is a live falsehood in a guide that trains agents |

## 12. Archive Readiness Recommendation

**Not ready.** After remediations 1–7 — all edits to this spec's own documents — the recommendation becomes **ready-with-follow-ups**, with 8–11 carried as separate work.

**Nothing found here requires touching a script to archive**, unless the V-01 build-log line returns a different account, in which case the one-name/one-account model needs a design decision before anything else.

**The finding this validation most vindicates** is the one the spec kept re-learning: **every WARN above is a defect in a claim, not in a mechanism.** Eight of eight. The code the auditor could not break by reading; the record it could, in eight places.
