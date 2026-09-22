# Judgment Day — `bugfix/deploy-script-guardrails` design review

- Date: 2026-09-18 · Round: **1** · Mode: blind dual review
- Target (immutable): `requirements.md` + `design.md` as of commit `7064864`
- Judges: two independent read-only auditors, different models from each other **and** from the design's author (author ≠ auditor, KZ-012)
- Terminal state after round 2: **ESCALATED ⚠️** — lineage exhausted, see §9

## 1. Tally

| | Judge A | Judge B |
|---|---|---|
| SEVERE | 3 | 3 |
| WARNING | 2 | 12 |
| SUGGESTION | 1 | 3 |
| **Total** | **6** | **18** |

## 2. Confirmed by both judges — fixable under the protocol

| ID | Severity resolved | Finding |
|---|---|---|
| **C-1** | **SEVERE** (A:SEVERE / B:WARNING) | **FR-5's rationale is false about `deploy.sh`.** The classify-on-error-text block it says `deploy.sh` lacks is present in `deploy.sh` — but only in the `MailTransport` resolution, never for the origin. FR-4 credits `deploy.sh` with the pattern while FR-5 denies it, in the same document. Judge A adds that `set-cors.sh`'s *origin* lookup is a plain hard-fail with no absent-vs-failed distinction at all, so `design.md` §7.1's "set-cors.sh already contains the correct implementation" misattributes the source, and the "four call sites" framing overcounts: only `deploy.sh`'s origin resolution and the Jenkinsfile carry the silent-`*` defect |
| **C-2** | **SEVERE** (A:SEVERE / B:WARNING) | **The D-3 enumeration gate matches the guard library itself.** `infra/scripts/*.sh` globs `_guard.sh`, which cannot source itself — so the gate either always fails or needs an exclusion rule no document states. Judge B adds that the gate asserts only that a `source` line *exists*, not that it precedes the first external call, so a script sourcing the guard at its end passes |
| **C-3** | **SEVERE** (A:WARNING / B:SEVERE) | **The FR-6 fixture test is not hermetic and its exit-code assertion cannot discriminate.** `smoke.sh` resolves `CLOUDFRONT_URL`/`BUCKET` with a live `describe-stacks` unless **both** are preset; the design overrides only `API_BASE_URL`, so the test makes a real AWS call — violating NFR-2. Judge B adds the sharper half: with network disabled the frontend and S3 checks fail anyway, so `smoke.sh` exits non-zero **whether or not the CORS check exists**. Asserting on the exit status is a gate that passes with the defect present (KZ-002) |

Severity resolution rule applied: a finding is SEVERE if **either** judge rated it so and the other confirmed the defect. All three describe an implementation that would be wrong or unverifiable.

## 3. Reported by one judge — recorded as suspect, not auto-fixed

Two are SEVERE and technically compelling; neither is corroborated, so the protocol forbids auto-fixing them. Both are recorded here for the Phase 3 decision.

| ID | Judge | Severity | Finding |
|---|---|---|---|
| S-1 | B | SEVERE | **Pass-path tests cannot run hermetically.** An `aws` PATH stub does not intercept `sam` (boto3 in-process), `curl https://checkip.amazonaws.com`, `npm`, `npx prisma`, or `deploy.sh`'s `read -p` pause. Abort-path tests are sound — nothing external runs before the guard — but "exits 0 under the pipeline's env" is unreachable without stubbing more, or running the guard in isolation |
| S-2 | B | SEVERE | **NFR-1 ("bash + coreutils only") cannot host a fixture HTTP server.** No coreutils program listens on TCP; bash `/dev/tcp` is client-only. Every candidate (`nc`, `socat`, `python3 -m http.server`) is outside coreutils, and `smoke.sh` already needs `jq` and `curl` besides |
| S-3 | A | SEVERE | **A fabricated quotation.** `requirements.md` §9 quotes the proposal as saying `"~25 and ~30 lines"`; that string appears in neither proposal. KZ-008 |
| S-4 | B | WARNING | `resolve_stack_output` promotes logic that queries a stack **Parameter**, not an Output, and its return protocol is undefined — `exit` inside `$(…)` kills only the subshell |
| S-5 | B | WARNING | Matching `*ValidationError*` alone reads a typo'd stack name as "absent" and deploys `*` — the exact failure FR-5 forbids. Requires both tokens |
| S-6 | B | WARNING | `IBD-DEV=123456789012` is not a valid bash assignment; `source`-ing `aws-accounts.conf` aborts every script on a **correct** profile |
| S-7 | B | WARNING | The override is value-carrying in `requirements.md`, a boolean in `design.md`; a stale exported boolean re-creates the `CONFIRM` hazard §6.1 diagnoses. Override × account-assertion interaction undefined (KZ-007) |
| S-8 | B | WARNING | The TTY falsifier cannot produce red — the branch it would "restore" already fails closed on a non-TTY |
| S-9 | B | WARNING | The D-7 substitute tells the Reviewer to re-derive from a Jenkinsfile excerpt `design.md` does not contain, and the only excerpt anywhere is elided |
| S-10 | B | WARNING | FR-6's PASS criterion is fail-open: a refused connection, a 404, or a 5xx all return no ACAO and would PASS |
| S-11 | A | WARNING | `validate.sh` is read-only by design, yet the guard gives it an unconditional `sts` call — contradicting FR-3's own "before any write" trigger |
| S-12 | B | WARNING | `design.md` §8.1 asserts the pipeline never runs `migrate-seed.sh`; not in the §7 verification table (KZ-011) |
| S-13 | B | WARNING | NFR-5's measure may forbid the `CLAUDE.md` edit FR-7 will need |
| S-14 | A/B | SUGGESTION | Wording: FR-4's "as it does today", FR-4's missing `>&2`, D-4's weak falsifier, `smoke.sh`'s own header/summary going stale |

## 4. Contradiction — escalated

**The `smoke.sh` check count.** Judge A re-derived "six checks" and reported it corroborates exactly. Judge B reports that neither five nor six counts assertions: the header numbers 1–6, where **1 is wiring resolution and 6 is the summary**, leaving **four** probing checks and eight `pass()`/`fail()` lines.

**Orchestrator verification:** Judge B is correct. `smoke.sh`'s numbered blocks are Check 1 (resolve wiring), API health, PII boundary, frontend reachability, S3 privacy, Check 6 (summary). `requirements.md` FR-6 ("none of its six checks"), `design.md` §1 ("Seventh check") and DD-5 ("the other five post-deploy assertions") use three different denominators, none of them stated. Escalated rather than silently fixed, per the protocol's contradiction gate.

## 5. Round-1 correction: NOT YET RUN

Per the protocol, correction requires the user's go-ahead and is limited to §2. **Blocked on a prior event, not on the user's answer:** `origin/main` advanced during this review and now contains PR #75, so `infra/scripts/deploy.sh` in `main` is the 291-line post-merge shape, while both judges read the 256-line pre-merge file this branch was cut from. Several findings — C-1 above all — are claims **about that file**. Correcting the documents against a file the trunk has already replaced would produce a second round of the same defect class the judges just found.

**Sequence:** rebase onto the new `main`, re-verify C-1's factual basis against the merged `deploy.sh`, then correct. Recorded here so the ordering is auditable rather than inferred.

## 6. Terminal receipt

```
TARGET     requirements.md + design.md @ 7064864
ROUND      1 of 2
CONFIRMED  3 (all SEVERE)
SUSPECT    14
CONTRADICTION 1 (resolved by orchestrator verification; escalated for the record)
CORRECTION not run — blocked on rebase onto merged main
```

**JUDGMENT: ESCALATED ⚠️**


---

# Round 2 — re-judgment of the rewritten documents

- Date: 2026-09-18 · Target: `requirements.md` + `design.md` at commit `5b1bdfa` · Same two judges, same models

## 7. Tally

| | Judge A | Judge B |
|---|---|---|
| SEVERE | 2 | 3 |
| WARNING | 2 | 12 |
| SUGGESTION | 1 | 6 |
| **Total** | **5** | **21** |

**Fix-caused: the majority.** Judge B marked 13 of 21 as introduced by the round-1 rewrite; Judge A marked 2 of 5. That ratio is the finding worth carrying to Kaizen — see §10.

## 8. Round-2 disposition

### Confirmed by both — fixed

| ID | Finding | Fix applied |
|---|---|---|
| **C-4** | `resolve_stack_value`'s three-way exit contract is unusable with the two-way `if` the design mandated. `1` and `2` both land in `else`; reading `$?` works only as the branch's first statement | §7.1 now prescribes the full `else rc=$?; case` shape, and classifies success-with-`None` for Parameter vs Output queries |
| **C-5** | **`migrate-seed.sh` does not have `teardown.sh`'s `CONFIRM` coupling.** `CONFIRM` appears there once, in the profile guard, with no second authorisation to couple to. A factual falsehood inside §6.1 — the section that carries FR-2's "sharpest justification" | Claim deleted and the correction recorded in place |
| **C-6** | D-3's "before its first external command" had no operational definition; every script header contains `aws cloudformation`, `sam build`, `npm run build` in prose | §7.2 defines it: strip comments and blanks, match the network-capable set, and resolve the library path with `${BASH_SOURCE[0]%/*}` so the guard line does not trip its own rule |

> **Footnote added 2026-09-21 (F-2/I-3).** C-6's recorded clearance repeats `design.md` §7.2's rationale as it stood at design review. That rationale was **false** — the implemented enumeration regex is `(aws|sam|curl|npm|npx)` and never contained `dirname`, so `dirname` would not have tripped the rule. The ledger row is accurate as history and is left unaltered; the design document has been struck and corrected. Avoiding `dirname` on this non-reason is what cost the spec the F-2 slash-less regression.

### Single-judge, verified by the orchestrator, fixed anyway

| ID | Finding | Fix applied |
|---|---|---|
| **V-1** | **Nothing proved the scripts *invoke* the guard.** Exempting `validate.sh` from FR-3 made the account assertion a call; the gates asserted a `source` line and tested functions in isolation. All seven could source the guard, never run it, and every gate stays green — with `deploy-frontend.sh`, the script behind the July incident, fully unguarded | §7.1 splits it: floor and override run **on `source`**; `assert_account` is explicit. D-3 gains **(b)** an in-situ abort run per script and **D-3b** a foreign-account run per *writing* script |
| **V-2** | **The two-token rule does not catch a misspelled stack name.** A well-formed typo *is* a nonexistent stack to CloudFormation and yields the identical `does not exist` text. FR-5 claimed the rule prevented exactly that | Claim corrected — two tokens separate absence from *other* `ValidationError`s (malformed name, constraint violation). The typo case is recorded as accepted residual risk in §9; the gate is renamed to "malformed" |
| **V-3** | FR-6 had gates for three FAIL directions and none for PASS. A check that unconditionally FAILs satisfied every gate and would red every pipeline build | PASS and `500` rows added; §7.2's "four scenarios" corrected to five |
| **V-4** | The stub set contradicted itself — NFR-1 said `awk` was stubbed, §7.2 excluded it. Stubbing `awk` would make the conf-parsing gate a test of the stub | Stub set defined as the **network-capable** commands only; text tools run real |
| **V-5** | `PROFILE="${AWS_PROFILE:-IBD-DEV}"` — the line §1 calls the defect — survived in all seven scripts; NFR-4's "one place" was loosely false | `_guard.sh` exports `PROFILE`/`REGION`; the seven local lines are deleted |
| **V-6** | The refactor tightens `MailTransport`'s classification as an untested side effect (both copies match `ValidationError` alone today) | FR-5 gains a clause and §10 a gate row |
| **V-7** | The D-7 excerpt supports one of four Jenkinsfile claims; revision 2 implied all four | §7.4 states which claim it carries and which remain operator-copy-only |
| **V-8** | `smoke.sh`'s `[PASS]` goes to stdout and `[FAIL]` to stderr — a test capturing stdout alone never sees a failure | The named observable is the summary line, captured `2>&1` |
| **V-9** | No risk row for a wrong committed account id; every test stubs `sts`, so a mistyped id passes the suite and fails closed on every real run | §9 row added, with an operator-run transcript as the task's evidence |
| **V-10** | FR-7 named only `smoke.sh`'s header; `deploy.sh`, `teardown.sh` and `migrate-seed.sh` USAGE lines are also falsified | FR-7 extended to the full known set |
| **V-11** | The read-only exemption selected `validate.sh` but not `smoke.sh`, which is equally read-only by FR-6's own clause | Criterion restated mechanically; both exempt |
| **V-12** | Override × FR-3 interaction undefined (KZ-007) | FR-2 states it: an overridden profile still needs a conf row and still asserts its account |
| **V-13** | The round-1 fabricated quote was replaced by a characterisation the proposal also does not bear ("two-file scope") | Corrected to the scope the proposal actually states |
| **V-14** | The non-TTY falsifier still could not produce red | The honest mutation is named |
| **V-15** | Specify-time OQ-1/OQ-2 collided with different questions of the same name in `proposal.md` | Renumbered `OQ-SPEC-1`/`OQ-SPEC-2` with the supersession noted |
| **V-16** | Budget prose did not reconcile with its own delta; one line counted twice | Reconciled, each line owned once, and marked estimates rather than measurements |

### Not fixed — carried forward

| ID | Finding | Why carried |
|---|---|---|
| N-1 | No `§7` row for the bootstrap-path stage order (`Smoke` before or after `Lock CORS` on `DEPLOY_INFRA=true`). If `Smoke` runs between them, the new check reds the first bootstrap build | Requires reading the operator's `Jenkinsfile` again. Recorded as an unverified pipeline claim rather than guessed (KZ-011) |

## 9. Terminal receipt

```
TARGET        requirements.md + design.md
ROUNDS        2 of 2 — lineage exhausted
ROUND 1       24 findings · 3 SEVERE confirmed by both · all fixed
ROUND 2       26 findings · 3 confirmed by both · 16 single-judge verified and fixed · 1 carried
FIX-CAUSED    13 of 21 on Judge B's count — the majority of round 2
CONTRADICTIONS 1 (round 1, smoke.sh check count) — resolved by orchestrator verification
```

**JUDGMENT: ESCALATED ⚠️** — not because a defect stands unaddressed, but because the two-round ceiling is reached and N-1 needs an artefact outside this repository. `/akili-specify` Phase 3 may proceed; N-1 belongs in `tasks.md` as a prerequisite on the documentation task.

## 10. Signal for Kaizen

**Round 2 found more defects than round 1, and most were introduced by round 1's fixes.** That is not noise — it is the measured recurrence of KZ-008 (×7, "an assertion about an artefact is a defect when the artefact does not bear it") and the 100 %-fix-defect rate recorded there at ×5.

Two shapes recurred specifically:

1. **Fixing a KZ-002 gate introduced a new KZ-002 gate.** Round 1's C-2 fix (exclude `_guard.sh` from the enumeration) created C-6 (no definition of "first external command") and V-1 (assert the `source` line, never the invocation). The correction moved the blind spot rather than removing it.
2. **A correction replaced a false quotation with a false paraphrase** (round 1 S-3 → round 2 V-13). The document stopped quoting something the proposal did not say and started summarising something it also did not say.

The countermeasure both rounds support is the one KZ-008 already records and this spec keeps re-learning: **where a correction can be made by deleting the false text rather than replacing it, delete.** Every fix in round 2 that deleted (C-5, V-13) introduced nothing; several that rewrote did.
