# Validation Report — Deploy-script guardrails

## Verdict: **READY WITH FOLLOW-UPS** — the documentation pass is applied; four code items carried

> ## ⚠️ Superseded in part by the Pivot — read this first
>
> **After this report was written, FR-3 was withdrawn** (product owner + infrastructure owner, 2026-09-21; `execution.md` → `## Pivot Record: FR-3`). Consequences for the findings below:
>
> | Finding | New status |
> |---|---|
> | **V-01** (pipeline account never verified) | **Closed by removal, not by verification.** There is no expected account any more, so the question no longer needs an answer |
> | **V-02** (parser silently took the first duplicate key) | **Closed by removal** — the parser and its config file are deleted |
> | **A-02** (`2>&1` on the capture path) | **Site 1 of 2 closed by removal.** `resolve_stack_value` remains and is still a carried follow-up |
>
> **Closed by removal is not the same as closed by verification**, and this report says so rather than letting the distinction disappear.
>
> Also stale here: the case count moved to 47 mid-Pivot and is **48** again after T-8 rounds 4–6; the line-count figures were re-measured after round 4 and live in `design.md` §11 (production **+369** net, tests **+3,224** net, **8.7 : 1**). The verdict below predates T-8 — **see the delta re-validation appended at the end of this report.**
>
> **Updated 2026-09-21 after remediation.** The original verdict was **NOT READY**; remediations 1–7 below are now applied and one open question was resolved by evidence that arrived after the audit. Four code follow-ups are carried as separate work.

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


---

# Remediation applied — 2026-09-21

## Documentation pass: 7 of 7 done

| # | Finding | What was done |
|---|---|---|
| 1 | **V-01** | `requirements.md` §7 gains **two** rows: the local profile's verified account, and an explicit **UNVERIFIED** row for the pipeline's, naming the product owner's 2026-09-21 statement, what settles it (one line of any green build's `AWS Auth` console output), and the consequence if it differs. `design.md` §9 gains a **new row** for FR-3 — the row above it was being read as covering the account assertion and does not, because NFR-3's gate stubs `sts` |
| 2 | **V-03** | FR-5's Description narrowed to *"every resolution that feeds a **write parameter**"*, with the original over-broad wording and the reason recorded. `teardown.sh`'s conflation declared an **accepted residual**, with why it is not fixed here: it is a write-path change to the most destructive script in the repo and belongs in its own spec with its own review |
| 3 | **V-04** | `tasks.md`'s "Declared uncovered" table gains FR-6's ungated preflight clause and FR-7's knowingly-undated flag rows |
| 4 | **V-05** | Re-measured on a quiet tree. **Production +550 · tests +3,236 · ratio 5.8 : 1.** The published 454 / 2,941 / 6.5:1 was the T-5 snapshot. Corrected in `execution.md` **and** in `design.md` §11's diagnosis table, which now shows both columns side by side |
| 5 | **V-06** | **Counting rule stated** (a round is one Implementer attempt plus its Reviewer verdict; a FAIL is a `STATUS: FAIL`) and recomputed from the attempt log: **16 review rounds, 9 FAIL verdicts, 1 task passing on attempt 1.** The earlier "eleven" counted five Leader adjudications alongside verdicts without saying so |
| 6 | **V-07** | Supersession pointers in `tasks.md` and `execution.md` headers; the PR-strategy section marked historical with the actuals beside the estimate |
| 7 | **V-08** | `Status: Draft` → **Done** in all three documents |

## An open question closed by evidence that arrived after the audit

**N-1 / OQ-INFRA-6 — RESOLVED.** The stage order, verified against a copy of the `Jenkinsfile` on 2026-09-21, is:

```
… → Deploy Backend → Deploy Web → Lock CORS → Smoke
```

**`Smoke` runs after `Lock CORS`**, so T-6's CORS check cannot red the first bootstrap build — the permissive `*` is already replaced by the time it looks. Recorded in `docs/infrastructure.md` and in `tasks.md`'s coverage table. **A7's path misattribution was corrected in the same edit.**

## One correction the same evidence forced, beyond the audit's findings

`docs/infrastructure.md`'s flag table said `RUN_SMOKE=true` means *"`smoke.sh` runs post-deploy and **fails the build closed**"*. True but misleading: smoke runs **last, after `Deploy Web`** — it turns the build red and notifies, but **nothing rolls back and the code is already live.** It *alerts*; it does not prevent. The gates that prevent — lint, backend tests, `sam validate` — all run before any deploy stage. Corrected, because this spec now leans on that check and the distinction decides how much protection anyone should believe they have.

## The correction-closure sweep caught two of my own partial landings

Run per `/akili-specify` → *Correction Closure*, forward and backward. It found **two survivors of the very defect being remediated**:

- `design.md` §11's **diagnosis table** still carried `2,941` / `6.5:1` / `454` — I had corrected the prose four lines below it and left the table
- `tasks.md`'s PR-strategy section still carried `~470 LOC` inside a section whose **header** I had just marked "historical"

Both fixed. **This is the fourth time in this spec that a correction landed only where the finding pointed** — and the first time the sweep, rather than a later reviewer, was what caught it. That is the sweep working as designed.

## Carried as code follow-ups — a separate spec

| Priority | Item |
|---|---|
| **1** | **A-02** — `assert_account` and `resolve_stack_value` capture with `2>&1`; an AWS CLI that succeeds while warning on stderr aborts a correct run or pollutes a deploy parameter. **The Jenkins patch this spec shipped already does it correctly with a temp file** |
| 2 | **A-01** — `${BASH_SOURCE[0]%/*}` breaks `cd infra/scripts && bash <script>`; confirmed by execution. `design.md` §7.2's stated reason for avoiding `dirname` is also false |
| 3 | **V-02** — the conf parser silently takes the first of duplicate keys; it should abort naming the file |
| 4 | **`frontend/CLAUDE.md:65`** — a live falsehood in a guide that trains agents (*"the script warns; heed it"* — it aborts), left by an NFR-5 scope decision the Reviewer upheld on condition it be recorded |

**V-01 remains open and is not a code item until answered:** if the pipeline's account differs, the one-row-per-profile-name format needs a design decision, not a config edit.

## Revised archive readiness

**Ready with follow-ups.** Nothing outstanding requires touching a script to archive. `/akili-archive` may proceed; the four items above carry forward, and V-01 should be answered before the next pipeline deploy rather than before the archive.
---

# Delta re-validation — 2026-09-21, post-Pivot

**Verdict: READY WITH FOLLOW-UPS.** The one FAIL and all four WARNs are remediated.

Run because the report above was written when the spec had **seven** tasks and **predates the Pivot entirely** — and, more sharply, because **FR-3′ had never been validated as a requirement.** The T-8 Reviewer audited its *diff*; clause-granular coverage, cross-document coherence and design conformance are a different pass.

**Independence, disclosed:** no auditor was clean. One model implemented all eight tasks; another issued two contradicting verdicts on T-8; the one used had performed the original validation **and** reviewed T-8 round 4. It was given the conflict in writing and scoped to what it had not ruled on, and it applied that — carrying its prior findings forward instead of re-deriving them, and marking that the FAIL concerned a case written in T-8 round 1 that its round-4 brief had not covered.

**Result: 9 PASS · 4 WARN · 1 FAIL · 0 BLOCKED.**

## The FAIL — a claimed gate that could not fire, closed in two rounds

**R-01.** FR-3′ clause 1 requires the announcement to print the account id **and the effective profile**. The profile half had **no discriminating gate**, and the owning case's header claimed one. The case ran with `AWS_PROFILE=MELIA-DEV` plus the override, and **FR-2's override banner already prints that profile on `source`** — so the assertion was satisfied by a different message entirely.

**Leader-executed confirmation:** deleting ` (profile '$PROFILE')` from `_guard.sh:154` left **all 48 cases green.**

The class then turned out to have **two** instances. The Implementer's sweep found the second — `wire.insitu-announce-account` asserted `IBD-DEV` in merged output, satisfiable by each script's own banner and, for `deploy.sh`/`set-cors.sh`, by the `aws` stub's `"STUB: unexpected aws invocation: … --profile IBD-DEV …"` text — and correctly flagged it instead of fixing it out of scope. A sixth round closed it **by deletion**: the in-situ case's job is reachability per script, which its account-id token already proves; the both-tokens clause now has exactly one owner.

**Closed, and demonstrated rather than asserted:**

| Mutation on `_guard.sh:154` | Cases red |
|---|---|
| remove the **profile** half | **exactly 1** — its sole owner |
| remove the **account** half | **3** — the legitimately shared half |
| *(before the fix, the profile mutation reddened **0**)* | |

**The inverse sweep found no further instances.** Every `assert_contains` in all 48 cases was checked against every non-mechanism emitter — the guard's other messages, the five scripts' banners, the stub error text. One adjacent out-of-class observation was flagged and deliberately not acted on: `wire.profile-region-exported-to-child-process`'s `REGION=eu-west-1` substring could collide with a host `AWS_DEFAULT_REGION`, which is a host-environment risk rather than this class.

## The four WARNs — all the Leader's, all the same shape

| ID | Finding | Remediation |
|---|---|---|
| **R-07** | `requirements.md`'s **D-6** still described the account assertion as a live defect class with a live gate. **The Pivot's sweep missed it because the row names neither `assert_account` nor `aws-accounts.conf`** — it described the concept without naming it, and the sweep matched names. §6 likewise still said *"beyond not blocking it in FR-3"* | Both struck, with the sweep's own failure recorded in the row |
| **R-08** | `tasks.md` kept FR-2's FR-3-interaction clause live, and the dependency graph omitted T-8 | Clause marked moot; graph now carries `T-8` with its four dependencies and why it has them |
| **R-09** | Six more sites asserting superseded figures as current — including two saying *"the corrected ratio is **lower**"*. **8.7 is higher than 6.5: the number was fixed and the sentence interpreting it was left, pointing the opposite way** | Deleted, not reworded. The interpretation outliving its number is recorded as such |
| **R-10** | T-8 had no `### T-8` heading — its record lives in a HALT block, an addendum and three rounds — so a mechanical *8 tasks / 8 entries* check failed, and the HALT still read `Status: [~]` with no closing marker | Heading added, noting the record is deliberately in three parts; the `[~]` marked superseded. **Check now reconciles: 8 / 8** |

## What the re-validation confirmed as sound

FR-3′ clauses 2–5 each owned by a case that fails for the right reason: never-changes-exit-status, the read-only exemption proven by marker over *any* `aws` call, the account-id scan closing H-1/H-2 for the class with a re-verified complete-and-minimal allow-list, and fail-soft driven on three paths (`sts` failure, `mktemp` failure, and the guarded `cat`/`rm`). `announce_account` is genuinely an alert: no comparison, no threshold, no expected value, no config read, `return 0` on every path. All five writing scripts call it as the statement immediately after `source`, before any write. The baseline documents took no dependency on FR-3, so the Pivot falsified none of them.

## Carried follow-ups — unchanged, all confirmed still present

| Priority | Item | Status |
|---|---|---|
| 1 | **A-02 site 2** — `resolve_stack_value` still captures with `2>&1`; site 1 closed by the Pivot | **CLOSED 2026-09-21** (F-1) |
| 2 | **A-01** — `${BASH_SOURCE[0]%/*}` breaks `cd infra/scripts && bash <script>` | **CLOSED 2026-09-21** (F-2) — including the false `dirname` rationale in `design.md` §7.2, struck |
| 3 | **`frontend/CLAUDE.md:65`** — *"the script warns; heed it"*; the script aborts. A live falsehood in a guide root `CLAUDE.md` says trains every agent | **CLOSED 2026-09-21** (F-3), via a dated **NFR-5 amendment** in `requirements.md` §4 — the measure was narrower than its own requirement. Sibling found by the closure sweep: root `AGENTS.md` was silent about the profile floor; synced |
| 4 | Gate robustness: `${hit##*:}` extraction · `.aws-sam/` inside the scanned tree · the multiplicity control covers `DIGIT_RUN_RE` but not the gate's loop | **CLOSED 2026-09-21** (F-4a, F-4b, and 4c as a side effect) |

## Archive readiness

**Ready with follow-ups.** Nothing outstanding requires touching a script to archive. `/akili-archive` may proceed.

**One figure worth carrying to Kaizen, because it is now measured twice:** of the twenty-plus review rounds this spec consumed, **not one died on the mechanism being wrong.** They died on false claims and on gates that could not fire — and the only countermeasure with a success record is not care but **execution**: every instance caught before review in this spec was caught by running a command against a draft, never by re-reading it.


---

## Follow-up Closure — the four carried items (2026-09-21)

All four carried follow-ups are closed, plus one sibling the closure sweep
found. Full audit trail in `execution.md` → *Follow-up Round*.

| Item | Closure | Falsifier proven |
|---|---|---|
| **A-02 site 2** (F-1) | `resolve_stack_value` captures the AWS CLI's stderr to a guarded temp file; the value comes from stdout alone, the two-token classification from the error text. `mktemp` failure **aborts** here — asymmetric with `announce_account` on purpose, which must never become a gate (FR-3′) | restore `2>&1` → 8 reds; classify from `$raw` → 4 reds |
| **A-01** (F-2) | `_SELF_DIR` with a `.` fallback in all seven scripts and in `_guard.sh`. `design.md` §7.2's false `dirname` rationale **struck**, the real (narrower) ground recorded, `tasks.md` T-2 amended | revert `deploy.sh` → 1 red on the ENOTDIR assertion |
| **`frontend/CLAUDE.md:65`** (F-3) | Corrected. Required amending **NFR-5**, whose measure (a path list excluding `frontend/**`) forbade what its requirement permits. Amended in writing, dated, scope-limited to documentation truth — the gate was changed *as a gate*, not stepped around | n/a (prose) |
| **root `AGENTS.md`** (F-3b) | Silent about the profile floor while root `CLAUDE.md` documented it. **Found by F-3's closure sweep, not by any finding** | n/a (prose) |
| **Gate robustness** (F-4a, F-4b) | `extract_digit_run` takes the digit run from the right; `ACCOUNT_SCAN_EXCLUDES` + `-I`; the scan became `scan_for_account_ids <root>` so its **loop** is exercised against a temp tree — which closed 4c as a side effect, disclosed rather than presented as free | revert the extractor → 1 red; drop `--exclude-dir` → 1 red; delete the caller precondition → 1 red |

**F-4a was worse than this report recorded.** It was filed as robustness
about a condition "no versioned file can create". It is a **silent
clearance**, now measured against real `grep` output: a colon in any path
component made the old extractor return `1999999999999` — thirteen digits —
which the shape check *clears*. A forbidden account id under such a path was
invisible to the gate.

**The Reviewer round FAILed on five prose defects and zero mechanism
defects**, and two of them were claims contradicted by *this document*: the
F-2 case asserted an error string (`No such file or directory`) that the
defect never emits, while §A-01's own transcript records the real one (`Not
a directory`); and §A-01's finding that `design.md` §7.2's `dirname`
rationale was false had been applied to the code and left standing in the
design. The remediation then added a precondition that **no mutation could
redden** — a gate that cannot fail, added in the round that exists to remove
them — caught by running the mutation and closed with a caller-contract
control.

### Residual, unchanged

- `teardown.sh`'s fail-vs-absent conflation — a write-path change to the most destructive script; deserves its own spec.
- The `Jenkinsfile` — **not fixable from this repository**; it is not versioned here. `smoke.sh` Check 6 detects the consequence in the pipeline but cannot prevent it (smoke runs last, nothing rolls back). The standing recommendation, out of scope here, is to version the `Jenkinsfile`: three claims in this spec were unverifiable for exactly this reason.
- `V-01` — if the pipeline's account differs, that is a design decision, not a config edit. Unaffected by the Pivot and by this round.
- The pre-existing `resolve-*` cases have the same standalone-hermeticity exposure the F-1 case now guards against, and have **not** adopted the check.

### Archive readiness — revised

**Ready. No code follow-ups outstanding.** 50 cases, 50 passing, six
mutations each reddening the named case on the named assertion.
