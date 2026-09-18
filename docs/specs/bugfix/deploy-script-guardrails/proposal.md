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
| ATP-64 | Every backend redeploy reopens CORS | Only a manual bootstrap run does; the pipeline resolves the live origin |
| ATP-65 | Every deploy can target the wrong account | Only a manual run can; the pipeline carries its own credentials |

Neither defect is fixed. Both are **latent on a fallback path** rather than active on the main one. One spec, one severity conversation, one set of guardrails for one path.

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

`deploy-frontend.sh` is the sharp case and is already called out in root `CLAUDE.md`: it parses no flags at all, so a `--profile` argument is silently ignored and the ambient profile wins outright.

### 4.4 Current live state — the ATP-64 exposure has closed

Verified 2026-09-18 against the live dev stack:

```
AllowedOrigin = https://d3idqvvg0xa1r7.cloudfront.net   (UPDATE_COMPLETE, 2026-09-17)
```

and confirmed over the wire, so this is behaviour and not only a stack parameter:

| Preflight `Origin` | Result |
|---|---|
| `https://evil.example.com` | `204`, **no** `access-control-allow-origin` — rejected |
| `https://d3idqvvg0xa1r7.cloudfront.net` | `204` + `access-control-allow-origin` echoing that origin — allowed |

**ATP-64 §3 ("dev is open right now") is withdrawn.** Recorded on the ticket 2026-09-18, with a suggested priority move High → Medium. The defect stands; the exposure does not.

Note what this costs the spec: **the live stack is now the *correct* state, so it can no longer serve as the red evidence for a regression test.** That is a design constraint on T-2, not a footnote — see §7.

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
- **OQ-2** — Does the Jenkins pipeline export an `AWS_PROFILE`? The Jenkinsfile is not in this repo, so a guard that aborts on divergence **could break the pipeline**. Must be answered before T-1 is written, not after it ships.

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

Bug Mode. **Answer OQ-2 before T-1 is written** — a guard that aborts on a profile mismatch is a guard that can break the pipeline, and the Jenkinsfile cannot be read from this repository.
