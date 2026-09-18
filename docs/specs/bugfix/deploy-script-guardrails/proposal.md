# Proposal — Deploy-script guardrails: the operator path has no floor

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `bugfix/deploy-script-guardrails` |
| Proposal date | 2026-09-18 |
| Author | AKILI (Leader) on behalf of Daniela Gómez |
| **Type** | **Bug** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting `/akili-specify` (Bug Mode) |
| **Parallel-safe** | **no** — see §11, sequencing against PR #75 |
| Depends on | PR #75 (`email-ms-phase-b`) for T-1 and T-3 only; T-2 is free |
| Jenkinsfile | Reviewed 2026-09-18 from an operator-supplied copy (§4.6). **OQ-2 resolved — T-1 unblocked** |
| Suggested depth | **Lite** |
| Jira | **ATP-64** (CORS) + **ATP-65** (AWS profile) |
| Supersedes | `docs/specs/bugfix/deploy-profile-override/proposal.md` (ATP-65, 2026-08-07) — absorbed here, §5 below records what changed since |
| Branch | `bugfix/deploy-script-guardrails`, cut from `main` |

## 2. Intent

`infra/scripts/` is the operator-run deploy path. Two filed bugs say the same thing about it from different angles: **every one of its safety parameters is a default that an ambient value silently wins.** Fix both as one change, because they live in the same ten lines of the same file.

## 3. Why these two tickets are one spec

The obvious reason is textual — `deploy.sh` resolves both values in its header config block, four lines apart:

```bash
PROFILE="${AWS_PROFILE:-IBD-DEV}"          # ATP-65
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"      # ATP-64
```

Splitting them across two branches guarantees a merge conflict in that block and buys two reviews of one file.

The substantive reason is better. **Both tickets describe the manual operator path, and both were filed before that path stopped being the normal one.** The Jenkins pipeline landed **2026-09-01** (`785f079`, which also closed **OQ-INFRA-2** — the very open question ATP-65's proposal §6 deferred to "a separate infrastructure spec"). `docs/infrastructure.md` §3 now states it plainly: operator deploys "are no longer the only path, and they are no longer the normal one."

That single event re-scopes both tickets identically:

| | Filed as | Actually is, since 2026-09-01 |
|---|---|---|
| ATP-64 | Every backend redeploy reopens CORS | **Partly true, and not only manually** — the pipeline resolves the live origin on its happy path, but fails open on a transient AWS error (§4.6) |
| ATP-65 | Every deploy can target the wrong account | Only a manual run can; the pipeline carries its own credentials |

Neither defect is fixed. ATP-65 is latent on a fallback path. **ATP-64 is not** — reading the Jenkinsfile (§4.6) shows the same mechanism alive in the pipeline's steady-state stage. One spec, one severity conversation, one set of guardrails.

## 4. Bug Diagnosis

### 4.1 Observed symptom

**ATP-64** — a manual `deploy.sh` run passes `AllowedOrigin=*` to CloudFormation, overwriting whatever `set-cors.sh` had locked, and reports success. `smoke.sh` then passes, because none of its six checks ever sends an `Origin` header.

**ATP-65** — any script under `infra/scripts/` run with an unrelated `AWS_PROFILE` exported in the operator's shell targets that account instead of `IBD-DEV`, silently.

### 4.2 Reproduction

ATP-64 is reproducible by reading: `ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"` is passed at the `sam deploy` call as an explicit `--parameter-overrides AllowedOrigin=...`, so it is written on every run rather than preserved.

ATP-65 already fired twice in real use, both recorded in the superseded proposal:
- **2026-07-09** — `deploy.sh` under a personal account created a full `accelerate-tz-dev-data-auth` stack (RDS `db.t3.micro` + Cognito pool + secret + security group) that ran ~30 days before deletion.
- **2026-08-07** — `deploy-frontend.sh` resolved to `MELIA-DEV` and failed safe **only because that account had no `20-backend` stack**. Step 1 is a read-only `describe-stacks`, so nothing was written.

### 4.3 Root cause (confirmed)

One cause, two symptoms: **`${VAR:-default}` makes the safe value a fallback of last resort instead of a floor.** The shell's parameter expansion cannot distinguish "the operator chose this" from "something else in the environment set it." Nothing echoes the divergence, and nothing verifies the result afterwards.

For ATP-65 this is uniform across **seven** scripts, not the six the superseded proposal estimated:

```
validate.sh:26  set-cors.sh:40  migrate-seed.sh:36  deploy-frontend.sh:53
deploy.sh:46    teardown.sh:48  smoke.sh:71
```

**Two of the seven already carry the guard**, which changes the shape of the fix — the pattern does not have to be invented, only applied:

| Script | Profile guard |
|---|---|
| `migrate-seed.sh`, `teardown.sh` | ✅ warn, then require `CONFIRM=yes` or an interactive `yes`; abort on a non-TTY |
| `deploy.sh`, `deploy-frontend.sh`, `set-cors.sh`, `smoke.sh`, `validate.sh` | ❌ none |

**The distribution is exactly backwards from the incident record.** The two guarded scripts are the ones that mutate the database and delete stacks — guarded, reasonably, because they are frightening. The two that actually caused the 2026-07-09 and 2026-08-07 incidents, `deploy.sh` and `deploy-frontend.sh`, are unguarded. `deploy-frontend.sh` is the sharp case and root `CLAUDE.md` already calls it out: it parses no flags at all, so a `--profile` argument is silently ignored and the ambient profile wins outright.

Note also what the existing guard checks: the **profile name**, never the account id. It would have caught `MELIA-DEV`; it would not catch an `IBD-DEV` profile repointed at another account. Constraint 3 in §6 remains unmet by the existing pattern.

### 4.4 Current live state — the observed ATP-64 exposure has closed

Verified 2026-09-18 against the live dev stack:

```
AllowedOrigin = https://d3idqvvg0xa1r7.cloudfront.net   (UPDATE_COMPLETE, 2026-09-17)
```

and confirmed over the wire, so this is behaviour and not only a stack parameter:

| Preflight `Origin` | Result |
|---|---|
| `https://evil.example.com` | `204`, **no** `access-control-allow-origin` — rejected |
| `https://d3idqvvg0xa1r7.cloudfront.net` | `204` + `access-control-allow-origin` echoing that origin — allowed |

**ATP-64 §3 ("dev is open right now") is withdrawn as an observation.** Recorded on the ticket 2026-09-18. The defect stands; the observed open state does not.

⚠️ **Do not read this as "the mechanism is gone."** §4.6 shows the pipeline can re-open CORS on its own, so this locked reading is the current state of the stack, not a property of the system.

Note what this costs the spec: **the live stack is now the *correct* state, so it can no longer serve as the red evidence for a regression test.** That is a design constraint on T-2, not a footnote — see §7.

## 4.6 Jenkinsfile review (2026-09-18) — the pipeline is not exempt

The `Jenkinsfile` is not versioned in this repository, so every prior statement about pipeline behaviour — including the one in `docs/infrastructure.md` §3 — was written without reading it. An operator supplied a copy on 2026-09-18. Reviewing it settles OQ-2 and **overturns one conclusion this proposal carried in its first draft**.

### OQ-2: answered — the guard is safe

The pipeline sets `AWS_PROFILE = 'IBD-DEV'` at the top-level `environment` block, and its `AWS Auth` stage materializes a real named profile file (`writeIbdDevProfile()`) before verifying it against `sts get-caller-identity`. The Jenkinsfile's own header explains why a *file* is required: a named profile cannot be satisfied by environment credentials alone.

A guard requiring `AWS_PROFILE == IBD-DEV` therefore **passes in the pipeline**. It is aligned with what the pipeline already does deliberately — the Jenkinsfile comments the `deploy-frontend.sh` flag-parsing hazard by name. **T-1 is unblocked.**

### The correction: ATP-64's mechanism is live in the pipeline

The steady-state `Deploy Backend` stage — the one that runs on **every ordinary merge to `main`** (`when DEPLOY_INFRA == 'false'`) — resolves the origin like this:

```bash
ALLOWED_ORIGIN="$(
  aws cloudformation describe-stacks --stack-name "${FRONTEND_STACK}" \
    --query "...CloudFrontUrl..." --output text --profile IBD-DEV ... 2>/dev/null || true
)"
if [ -z "${ALLOWED_ORIGIN}" ] || [ "${ALLOWED_ORIGIN}" = "None" ]; then
    echo "▸ Frontend stack has no CloudFrontUrl yet — bootstrapping CORS as '*'"
    ALLOWED_ORIGIN='*'
fi
```

`2>/dev/null || true` **conflates "the stack does not exist" with "the call failed."** An expired token, a throttle, or an IAM denial produces the same empty string as a genuinely absent stack. The stage then deploys `AllowedOrigin=*` to the live backend and narrates it as a routine bootstrap.

What makes it silent is the combination:

| Step | Behaviour |
|---|---|
| 1 | A transient `describe-stacks` failure yields an empty origin |
| 2 | `sam deploy` writes `AllowedOrigin=*` to the live backend and succeeds |
| 3 | `Lock CORS` **does not run** — it is gated `when DEPLOY_INFRA == 'true'`, and this is the `false` path |
| 4 | `Smoke` **passes** — this is ATP-64 §2, the missing CORS assertion, doing exactly what the ticket predicted |
| 5 | CORS stays open until some later deploy happens to succeed at step 1 |

**This repository has already fixed this exact bug, elsewhere.** During `email-notification-microservice` Phase B, `set-cors.sh` and `deploy.sh` were given a comment block that names the defect precisely:

> *"Separate 'the describe-stacks CALL failed' from 'the stack does not exist yet' — they are not the same thing. An expired SSO token, a throttle, or an IAM denial also makes the query come back empty, and empty was previously indistinguishable from 'not found' (`2>/dev/null || true` swallowed both)."*

The Jenkinsfile never received that lesson, because it is not in the repository to be swept. That is **KZ-004** (grep the withdrawn premise, not the superseded value) hitting a file no grep of this repo can reach.

### Consequence: a baseline document is overstated

`docs/infrastructure.md` §3 currently asserts:

> *"**CORS is safe across pipeline deploys.** … The `deploy.sh` defect tracked in **ATP-64** therefore affects **manual** runs, not the pipeline."*

That is true of the happy path and false of the failure path. It is an **unverifiable claim that was recorded as fact** — precisely **KZ-011** (no gate verifies the spec is *true*) and **KZ-008** (an assertion about an artefact nobody opened). Correcting it moves into T-3 scope, and the correction is narrow: the pipeline resolves the origin correctly *when the resolution succeeds*, and fails open when it does not.

**Severity consequence:** the earlier recommendation of High → Medium rested on "manual runs only," which is wrong. The downgrade may still be right — the trigger needs an AWS-side failure at one specific moment, and dev holds no real PII — but it must be argued from *low probability*, not from *no mechanism*. Re-recorded on the ticket.

### Out of scope, and urgent: PR #75 will fail the pipeline

Found while reading the same file. Not this spec's work, but it blocks the merge this spec is sequenced behind, so it belongs in writing:

| Fact | Evidence |
|---|---|
| The live backend stack has `MailTransport = "ses"` | `describe-stacks`, 2026-09-18 |
| PR #75 narrows the template to `AllowedValues: [microservice]` | `git show email-ms-phase-b:infra/20-backend/template.yaml` |
| The `Deploy Backend` stage passes only `AllowedOrigin` and `DataAuthStackName` — **never `MailTransport`** | Jenkinsfile, `Deploy Backend` |
| SAM sends `UsePreviousValue` for any parameter absent from `--parameter-overrides` | `deploy.sh`'s own comment block says so |
| `infra/samconfig.toml` declares no `parameter_overrides` to supply it instead | grep |

So the first pipeline run after PR #75 merges will re-submit `ses` as the previous value against a template that no longer accepts it, and **CloudFormation will reject the changeset.** The `Deploy Backend` stage throws and the build fails.

The fix is small — the stage must pass `MailTransport=microservice` explicitly, or the value must be corrected on the live stack before the merge — but it is **outside this repository**, in a file only the Jenkins administrator can edit. Raise it before PR #75 merges, not after.

### 4.5 Impact and scope

| | |
|---|---|
| Blast radius | `infra/scripts/**` only. No application code, no stack templates, no migrations |
| Data integrity | ATP-65 is the serious half: `docs/infrastructure.md` §5 makes the datastore's *account* part of the security boundary, and the July stack proves an unintended account can be provisioned end to end |
| Security | ATP-64 on dev is low — the database holds the consented sample, no real PII — but the mechanism is environment-independent and follows the stack to any future environment |

## 5. What changed since the superseded ATP-65 proposal

Recording these so `/akili-specify` does not re-derive a stale frame (**KZ-004** — sweep the withdrawn premise, not just the superseded value):

| Claim in `deploy-profile-override/proposal.md` | Status 2026-09-18 |
|---|---|
| §6: "Migrating to CI/CD with OIDC (**OQ-INFRA-2**) … is a separate infrastructure spec" | **Landed 2026-09-01** (`785f079`). The pipeline exists; OQ-INFRA-2 is resolved |
| "the **shell-script path is the only one that can drift**" | Still true, and now *narrower* — it is no longer the path most deploys take |
| "~6 scripts" | **Seven** — enumerated in §4.3 |
| §7 risk: "Hardcoding an account id … blocking Prod" | Unchanged; still the right caution |

## 6. Proposed outcome (constraints, not mechanism)

1. **`IBD-DEV` is a floor, not a default.** An ambient `AWS_PROFILE` MUST NOT silently change the target account.
2. **Overriding it MUST be explicit and loud** — a purpose-named variable, never a general-purpose one other tooling also sets.
3. **The resolved *account* MUST be asserted before any write**, via `sts get-caller-identity`. A stack-name lookup is not sufficient: names collide across accounts, which is exactly the 2026-08-07 near-miss.
4. **A permissive CORS origin MUST be a deliberate act.** `deploy.sh` resolves the live `CloudFrontUrl` the way `set-cors.sh` already does; `*` survives **only** where the `30-frontend` stack genuinely does not exist yet, and that fallback announces itself.
5. **`smoke.sh` MUST assert the CORS response**, not list it as a prerequisite.
6. Every divergence MUST be **reported on stderr**, not merely resolved.

**Constraint 4 corrects the fix suggested on ATP-64.** "Do not default to `*`" is wrong as stated: the permissive value is legitimately required on the true bootstrap, where there is no CloudFront distribution to point at. The fix is not removing the default — it is making the script *read the live value* and reserve `*` for the one case that needs it. `deploy.sh` already applies exactly this pattern to `MailTransport`, with a comment block explaining why a baked-in default drifts from reality and reports success anyway. This is that lesson, applied to the parameter next to it.

## 7. Why the verification is harder than the fix

The fix is guard clauses. Proving it is not — and a naive spec produces a **presence assertion**, which is **KZ-002**, this repository's second-most recurrent lesson (×7) and one it has already hit three times inside a single spec. "The guard is in the file" is not evidence. Each behaviour below needs a demonstrated falsifier — red before, green after (**KZ-013**: sweep every clause the task owns, not only the one just named).

| # | Behaviour to demonstrate | Reachable without deploy rights? |
|---|---|---|
| B-1 | `AWS_PROFILE` unset → targets `IBD-DEV` | ✅ |
| B-2 | `AWS_PROFILE` set to something else → **aborts**, does not proceed | ✅ |
| B-3 | Explicit override set → proceeds, and **announces** the non-default target | ✅ |
| B-4 | Account id ≠ expected → aborts **even when a same-named stack exists** | ✅ — but only if the assertion is unit-testable in isolation from AWS |
| B-5 | `deploy.sh` with a live `30-frontend` stack → resolves the real origin, never `*` | ❌ — needs a deploy |
| B-6 | `deploy.sh` with no `30-frontend` stack → falls back to `*` **and says so** | ❌ — needs a deploy |
| B-7 | `smoke.sh` fails when the API answers a disallowed `Origin` | ⚠️ — see below |

**B-4 is a design constraint on the fix, not an afterthought.** The collision case is the actual danger and cannot be tested by deploying; the account assertion must be callable without AWS for it to be provable at all.

**B-7 is the one that needs deliberate design.** The live stack is now correctly locked (§4.4), so pointing `smoke.sh` at it proves only that the check does not false-positive — it cannot show the check *fires*. A gate never observed failing is precisely KZ-002. The spec must therefore supply a falsifier that does not depend on the live stack being broken: assert against a controlled response rather than the deployed API, so the red state is reachable on demand.

**Verification asymmetry to carry into `/akili-specify`:** B-1…B-4 and B-7 are provable today with the read-only `IBD-DEV` developer credential. B-5 and B-6 are auditable **by reading only** — confirming them live needs a deploy that credential cannot perform (the blocker recorded on ATP-33). The spec must state that boundary rather than let a completion report imply live proof (**KZ-012** — mark the boundary of what reading established).

## 8. Scope

| In | Out |
|---|---|
| All seven scripts under `infra/scripts/` | Any change under `infra/10-*`, `20-*`, `30-*` templates |
| `deploy.sh` origin resolution + announced bootstrap fallback | The Jenkinsfile — not versioned in this repo (`docs/infrastructure.md` §3) |
| `smoke.sh` CORS assertion | Provisioning a Prod environment (**OQ-INFRA-1**) |
| Doc sync: `docs/infrastructure.md` §4, `infra/README.md` | Network hardening — `0.0.0.0/0` on 3306, VPC-attaching the Lambda (`infra/README.md` §11) |

## 9. Non-goals

- Making the manual operator path safe enough to become the primary path again. It is a fallback; the guardrails are there for when someone reaches for it.
- Any behavioural change to the application, the API surface, or the PII boundary.

## 10. Affected users, systems, and specs

| | |
|---|---|
| Users | Operators running a manual deploy; every future agent reading the runbook |
| Systems | `infra/scripts/**`; the Jenkins pipeline only insofar as it invokes `smoke.sh` |
| Specs | Supersedes `bugfix/deploy-profile-override`. Touches `docs/infrastructure.md` — a **constitutional baseline**, so root `CLAUDE.md` mandates a Reviewer on that task even though it is "just docs" |

## 11. Risks, dependencies, and open questions

### Sequencing against PR #75 — measured, not assumed

PR #75 (`email-ms-phase-b`, open, merging soon) was diffed against `main` for every file this spec touches:

| File | PR #75 | This spec | Verdict |
|---|---|---|---|
| `infra/scripts/smoke.sh` | **untouched** | T-2 | ✅ conflict-free, can land any time |
| `infra/scripts/deploy.sh` | +99 lines; rewrites the `MAIL_TRANSPORT` block beginning two lines below `ALLOWED_ORIGIN` | T-1 | ⚠️ does **not** modify `ALLOWED_ORIGIN` or `PROFILE`, so there is no semantic conflict — but the hunks are adjacent, so a textual one is likely |
| `docs/infrastructure.md` | 9 lines, incl. the bullet directly below "API CORS" | T-3 | ⚠️ adjacent |
| `infra/README.md` | **450 lines rewritten** | T-3 | 🔴 certain conflict |

**Constraint: T-1 and T-3 land after PR #75 merges. T-2 is free.** This is **KZ-010** (×3, still unenforced by anything but attention) applied before the fact rather than discovered by comparing screenshots thirteen commits later.

### Other risks

| Risk | Mitigation |
|---|---|
| A stricter profile guard breaks a legitimate multi-account workflow | The explicit override exists for exactly that; it is loud, not absent |
| Hardcoding an account id couples the scripts to one account, blocking Prod | Resolve the expected account from `samconfig.toml` or a parameter, never a literal — settle alongside **OQ-INFRA-1** |
| The CORS check becomes a gate that cannot fail | B-7 in §7 is the countermeasure; treat a non-discriminating check as a task failure, not a passing task |
| Seven scripts drift apart again | Prefer one shared resolution path over seven copies of the same guard — a decision for `/akili-specify`, flagged here |

### Open questions

- **OQ-1** — Shared helper (`infra/scripts/_lib.sh`) or seven inline guards? A helper is less drift and one place to test; it is also a new file every script must source, which is a larger diff than the bug warrants. Recommend the helper; confirm at specify.
- ~~**OQ-2** — Does the Jenkins pipeline export an `AWS_PROFILE`?~~ **Answered 2026-09-18 (§4.6): yes, `IBD-DEV`, materialized as a real profile file. The guard is safe; T-1 is unblocked.**
- **OQ-3** *(new, §4.6)* — The `Deploy Backend` stage's own fail-open `2>/dev/null || true` is the same defect as T-1's, in a file this repository cannot change. Does T-3 amend `docs/infrastructure.md` only, or does this spec also produce a patch to hand the Jenkins administrator? Recommend the latter — a documented defect in an unversioned file is a defect nobody owns.

## 12. Approach options

| | Option | Trade-off |
|---|---|---|
| **A** | **Both tickets, one spec, one branch** *(recommended)* | One review of one file; the shared root cause is fixed once. Costs: the whole spec waits on PR #75 for T-1/T-3 |
| **B** | Two specs, sequential | Smaller units, but the second inherits a guaranteed conflict in the block the first just rewrote, and the shared cause gets solved twice |
| **C** | ATP-64 only; defer ATP-65 again | Smallest diff. But ATP-65 is the half with a real incident behind it, and deferring it a second time after its blocking open question has already been resolved is hard to justify |

## 13. Recommended approach

**Option A**, Lite depth, in this task order:

| Task | What | Gate |
|---|---|---|
| **T-2** | `smoke.sh` CORS assertion + its falsifier | Lands first — conflict-free, and it is the detector that makes T-1 verifiable |
| **T-1** | Profile floor across all seven scripts + `deploy.sh` origin resolution | **After PR #75 merges.** Blocked on OQ-2 |
| **T-3** | `docs/infrastructure.md` §4 + `infra/README.md` sync | **After PR #75 merges.** Reviewer mandatory (constitutional baseline) |

T-2 first is the point, not an ordering convenience: it is the only task whose result is provable today, and it converts T-1 from an unverifiable claim into a guarded one.

## 14. Success criteria

1. An ambient `AWS_PROFILE` that differs from the floor **aborts** every one of the seven scripts, and says why.
2. The account id is asserted before any write, and the assertion is demonstrated against a **same-named stack in a different account** — without touching AWS.
3. `deploy.sh` never writes `AllowedOrigin=*` while a `30-frontend` stack exists; where it legitimately does, the run announces it.
4. `smoke.sh` fails against an API that answers a disallowed `Origin` — **demonstrated failing**, not asserted present.
5. `docs/infrastructure.md` and `infra/README.md` describe the scripts that exist after the change.
6. Every gate in §7 is either demonstrated red-then-green or **declared unevaluable with its reason** (KZ-002 / KZ-013).

## 15. Visual Reference

- Source: **None**
- Location: n/a
- Notes: shell scripts and operator documentation — no UI surface.

## 16. Next step

```text
/akili-specify bugfix/deploy-script-guardrails
```

Bug Mode. OQ-2 is answered and T-1 is unblocked (§4.6). Two things to carry in:

1. **T-3 grew.** It must correct `docs/infrastructure.md` §3's "CORS is safe across pipeline deploys", which §4.6 shows is true only of the happy path.
2. **Not this spec, but blocking its sequence:** PR #75 will fail the pipeline's `Deploy Backend` stage on its first run (§4.6, last table). Raise with the Jenkins administrator before that merge.
