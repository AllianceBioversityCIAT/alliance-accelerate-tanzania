# Judgment Day — `bugfix/deploy-script-guardrails` design review

- Date: 2026-09-18 · Round: **1** · Mode: blind dual review
- Target (immutable): `requirements.md` + `design.md` as of commit `7064864`
- Judges: two independent read-only auditors, different models from each other **and** from the design's author (author ≠ auditor, KZ-012)
- Terminal state: **ESCALATED ⚠️** — see §4

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
