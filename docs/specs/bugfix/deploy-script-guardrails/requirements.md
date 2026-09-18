# Requirements — Deploy-script guardrails

- Spec path: `docs/specs/bugfix/deploy-script-guardrails/`
- Status: **Draft** — revision 2 (Judgment Day round 1 applied)
- Author / Date: AKILI (Leader) on behalf of Daniela Gómez — 2026-09-18
- Type: **Bug** (Bug Mode) · Depth: **Standard**
- Related: `docs/infrastructure.md` §3–§5, root `CLAUDE.md` § Hard constraints, `proposal.md` §4.6, `judgment.md`
- Jira: **ATP-64** · **ATP-65**
- Supersedes: `docs/specs/bugfix/deploy-profile-override/` (proposal only; never executed)

> **Revision 2 basis.** PR #75 merged to `main` (`7bed323`) during the review, so every claim below was re-verified against the **merged** `infra/scripts/`, not the pre-merge tree the judges read. The sequencing constraint the first revision carried is **gone** — nothing in this spec now waits on another branch.

## 1. Summary

`infra/scripts/` resolves its safety parameters with `${VAR:-default}`, which makes the safe value a **fallback of last resort instead of a floor**. Two filed bugs are the same defect in different clothes: an ambient `AWS_PROFILE` silently retargets the AWS account (ATP-65 — which has already provisioned RDS in an unintended account), and an absent `ALLOWED_ORIGIN` silently reopens API CORS to `*` (ATP-64).

This spec makes each safe value a floor, makes every divergence loud, and builds the harness that can **prove a guard fails when it should** — which this repository currently cannot do for shell scripts at all.

It advances no PRD user story. It protects `docs/infrastructure.md` §5 rule 1 and the root `CLAUDE.md` `--profile IBD-DEV` constraint, both enforced today by convention alone.

## 2. Requirement Numbering & Writing Standards

Repo conventions apply (`docs/specs/general-setup/requirements.md` §2). Three bind unusually hard here:

- **KZ-002** — a presence-assertion is not behavioral proof. "The guard is in the file" is the exact non-evidence this spec must not produce.
- **KZ-011** — no gate verifies the spec is *true*. §7 tabulates every claim about the Jenkins pipeline with where it was verified, because that file is not in this repository.
- **KZ-009** — cite symbols and literal strings, never bare line numbers.

### 2.1 Where the defect actually lives — corrected

Revision 1 asserted that `set-cors.sh` carries the fail-closed classification and `deploy.sh` does not. **That was false in both halves**, and the two documents contradicted each other about it. Re-verified against merged `main`:

| Site | Classify-on-error-text? | Silent-`*` fallback? |
|---|---|---|
| `deploy.sh` → `MailTransport` | ✅ present (`*ValidationError*` branch) | n/a |
| `set-cors.sh` → `MailTransport` | ✅ present, ends `exit 1` — *"Refusing to guess"* | n/a |
| `set-cors.sh` → `CloudFrontUrl` | ❌ absent | ❌ **none** — it hard-fails, so there is no defect |
| **`deploy.sh` → `ALLOWED_ORIGIN`** | ❌ absent | 🔴 **the defect** — `ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"`, a static default with no resolution at all |
| **Jenkinsfile → `Deploy Backend`** | ❌ absent | 🔴 **the defect** — `2>/dev/null \|\| true` then `*` |

**Two defect sites, not four.** The pattern to apply already exists in two places — which is itself the duplication NFR-4 exists to remove.

### 2.2 Defect classes this spec can produce, and the gate for each

| # | Defect class | Gate | Falsifier |
|---|---|---|---|
| **D-1** | A guard present but unable to fire | Guard-unit tests assert a **non-zero exit** under the violating env | Invert the comparison ⇒ red |
| **D-2** | A guard firing when it should not, breaking the pipeline | A guard-unit test asserts exit `0` under `AWS_PROFILE=IBD-DEV` | Make the guard unconditional ⇒ red |
| **D-3** | The guard applied to some scripts and not others | Enumerate `infra/scripts/*.sh`, **excluding leading-underscore library files**, and assert each sources the guard **before its first external command** | Add an unguarded script, or move a `source` line below the first `aws` call ⇒ red |
| **D-4** | Shell mechanics — `set -e`, subshell exit-code capture, unquoted expansion | Tests **execute** the scripts; the helper contract in `design.md` §7.1 is asserted directly | Replace `if VAR="$(…)"; then` with `VAR=$(…) \|\| true` ⇒ red |
| **D-5** | The CORS check passing only because the live stack is correct | A **stubbed `curl`** returns a permissive `Access-Control-Allow-Origin`; the test asserts the **`RESULTS` line**, never the exit code | That stub is the test's default input |
| **D-6** | An account assertion that cannot see a same-named stack in another account | Stubbed `aws` returns a foreign account id **and** a matching stack name | Assert the stack name instead of the account ⇒ red |
| **D-7** | **A documentation claim that is false** | ❌ **no automated gate exists** | — |

**On D-5's assertion target.** Asserting `smoke.sh`'s **exit code** would be a gate that passes with the defect present: with the network stubbed or absent, other checks fail and the script exits non-zero **whether or not a CORS check exists**. The gate therefore asserts the specific `[FAIL] CORS…` / `[PASS] CORS…` line. This is the single most important correction Judgment Day produced — the first revision's gate was exactly the KZ-002 shape this spec was written to stop.

**D-7 is declared unmeasurable and substituted, not waived.** No command evaluates whether a sentence in `docs/infrastructure.md` is true; this spec exists partly because one was false for seventeen days. The substitute: the documentation task carries a **mandatory Reviewer** (root `CLAUDE.md` — any task touching a constitutional baseline gets one), briefed to re-derive each claim from the **verbatim, date-stamped `Deploy Backend` stage quoted in `design.md` §7.4**. Revision 1 pointed the Reviewer at an excerpt that did not exist in any target document; that is fixed. Accepted risk: the `Jenkinsfile` can change on the Jenkins server with no signal here, so every claim about it is true **as of 2026-09-18** and is date-stamped as such.

## 3. Functional Requirements

### FR-1: The mandated profile is a floor, not a default

- **Description:** Every script in `infra/scripts/` MUST refuse to proceed when the effective AWS profile is not `IBD-DEV`, unless the explicit override (FR-2) is present.
- **Rationale / Source:** ATP-65; root `CLAUDE.md` § Hard constraints; `docs/infrastructure.md` §5 rule 1.
- **Acceptance criteria:**
  - GIVEN `AWS_PROFILE` is unset WHEN any script runs THEN it targets `IBD-DEV` and proceeds.
  - GIVEN `AWS_PROFILE=MELIA-DEV` WHEN any script runs THEN it exits non-zero **before any AWS call**, printing the mismatch to stderr.
  - BUT it must NOT depend on an interactive TTY to refuse — a non-interactive run MUST fail closed.
  - AND IT MUST name both the found profile and the expected one, so the operator can tell which is wrong.
- **PII/RBAC impact:** None directly; indirectly load-bearing — `docs/infrastructure.md` §5 makes the datastore's **account** part of the security boundary.

### FR-2: Overriding the floor is explicit, value-carrying, and loud

- **Description:** The override MUST be a dedicated variable that no other tooling sets, and MUST name the profile it authorises rather than being a boolean.
- **Rationale / Source:** ATP-65 constraint 2; the 2026-08-07 incident; and `design.md` §6.1's `CONFIRM=yes` finding — a general-purpose flag accumulates authorisations until one is a surprise. A boolean override would re-create that hazard: a stale `export` in a shell rc would silently authorise every future foreign profile.
- **Acceptance criteria:**
  - GIVEN `ALLOW_NON_IBD_DEV_PROFILE` equals the effective `AWS_PROFILE` WHEN a script runs THEN it proceeds AND announces the non-default target on stderr.
  - GIVEN the override is set but does **not** match the effective profile WHEN a script runs THEN it exits non-zero — an override authorises **one named profile**, never "any".
  - BUT it must NOT accept `AWS_PROFILE` or `CONFIRM` as the override; the variable that caused the bug cannot be the variable that authorises it.
  - AND IT MUST be a single variable across all scripts, learned once.

### FR-3: The account is asserted, not inferred from the profile name

- **Description:** Before any AWS call that **writes**, scripts MUST assert the resolved account id via `sts get-caller-identity` against the expected account, and abort on mismatch.
- **Rationale / Source:** ATP-65 constraint 3. A name check catches `MELIA-DEV`; it cannot catch an `IBD-DEV` profile repointed at another account, and stack names collide across accounts.
- **Acceptance criteria:**
  - GIVEN the resolved account id differs from the expected account WHEN a writing script runs THEN it exits non-zero.
  - AND IT MUST do so **even when a stack of the expected name exists there** — the collision case is the actual danger.
  - BUT it must NOT gate `validate.sh`, which writes nothing and creates no resources: root `CLAUDE.md` lists it as the canonical agent-run infra check, and giving a read-only linter a live STS dependency would defeat its purpose. `validate.sh` gets **FR-1 and FR-2, not FR-3**.
  - BUT it must NOT hardcode the account id in any script; it is read from one configuration file, so a future Prod account is a config change (**OQ-INFRA-1**).
  - AND IT MUST be exercisable with no network access, or FR-3 cannot be proven at all.

### FR-4: A permissive CORS origin is a deliberate act

- **Description:** `deploy.sh` MUST resolve the live CloudFront origin and pass it as `AllowedOrigin`. The permissive `*` MUST survive only where the `30-frontend` stack genuinely does not exist, and that case MUST be announced on stderr.
- **Rationale / Source:** ATP-64 §1 as corrected — removing the `*` outright is wrong, because the true bootstrap has no distribution to point at. `deploy.sh` today has **no origin resolution at all**: `ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"` is a static default. The precedent to copy is the `MailTransport` resolution in the same file.
- **Acceptance criteria:**
  - GIVEN a `30-frontend` stack exporting `CloudFrontUrl` WHEN `deploy.sh` runs THEN it passes that URL as `AllowedOrigin`.
  - GIVEN no `30-frontend` stack exists WHEN `deploy.sh` runs THEN it passes `*` AND prints to stderr that it is doing so and why.
  - BUT it must NOT write `*` when the stack exists but the lookup **failed** — see FR-5.
  - AND IT MUST keep an explicit `ALLOWED_ORIGIN=…` winning over the resolved value, mirroring the precedence `MAIL_TRANSPORT` already has.

### FR-5: A failed lookup is not an absent resource

- **Description:** Every resolution of a live value MUST distinguish "the call failed" from "the thing does not exist", and MUST fail closed on the former.
- **Rationale / Source:** The root cause shared by both defect sites in §2.1. The pattern exists in this repo for `MailTransport` and its comment names the defect: *"An expired SSO token, a throttle, or an IAM denial also makes the query come back empty, and empty was previously indistinguishable from 'not found'."*
- **Acceptance criteria:**
  - GIVEN `describe-stacks` fails with an expired-token or access-denied error WHEN `deploy.sh` resolves the origin THEN it **aborts** rather than falling back to `*`.
  - GIVEN it fails with CloudFormation's absent-stack message WHEN `deploy.sh` resolves the origin THEN it treats the stack as absent and applies the announced `*` bootstrap.
  - BUT it must NOT classify on `ValidationError` alone. That class also covers a malformed or misspelled stack name, so a typo in `FRONTEND_STACK` would be read as "absent" and deploy `*` — the precise failure this requirement forbids. The match MUST require **both** `ValidationError` **and** the absent-stack phrasing.
  - BUT it must NOT use `2>/dev/null || true`, or any construct collapsing the two.
  - AND IT MUST classify on the **error text**, never on emptiness, because both failure modes produce an empty string.

### FR-6: `smoke.sh` asserts the CORS boundary

- **Description:** `smoke.sh` MUST add a check that sends a disallowed `Origin` and fails when the API answers permissively. It lists CORS as a prerequisite today and probes it in none of its assertions.
- **Rationale / Source:** ATP-64 §2. This check is step 4 of the live pipeline failure mode in `proposal.md` §4.6 — without it, nothing reports that step 2 happened.
- **Acceptance criteria:**
  - GIVEN the API answers a disallowed origin with `Access-Control-Allow-Origin: *` WHEN `smoke.sh` runs THEN the CORS check FAILs.
  - GIVEN the API echoes the disallowed origin back in `Access-Control-Allow-Origin` WHEN `smoke.sh` runs THEN the CORS check FAILs — an echo is a permissive answer, not a rejection.
  - GIVEN a well-formed preflight for a disallowed origin returns `2xx`/`204` with **no** `Access-Control-Allow-Origin` WHEN `smoke.sh` runs THEN the CORS check PASSes.
  - BUT it must NOT PASS on a refused connection, a non-2xx status, or a `5xx` — all return no `Access-Control-Allow-Origin` while proving nothing. A transport-level failure MUST be reported as FAIL, not silently read as a rejection.
  - AND IT MUST send a real preflight — `Origin` **plus** `Access-Control-Request-Method` — because API Gateway's HTTP API auto-answers CORS only for genuine preflights; a bare `OPTIONS` matches no route.
  - AND IT MUST use the existing `pass()`/`fail()` accounting so a CORS failure is summarised rather than aborting the run.
  - AND IT MUST remain read-only, so it stays runnable with the development `IBD-DEV` credential.

### FR-7: The baseline documents describe the scripts that exist

- **Description:** `docs/infrastructure.md`, `infra/README.md`, root `CLAUDE.md`, and `smoke.sh`'s own header MUST be corrected to match post-change reality, including the overstated pipeline claim identified in `proposal.md` §4.6.
- **Rationale / Source:** KZ-008 / KZ-011. `docs/infrastructure.md` §3 currently asserts *"CORS is safe across pipeline deploys… the ATP-64 defect therefore affects manual runs, not the pipeline."* True of the happy path, false of the failure path.
- **Acceptance criteria:**
  - GIVEN the change has landed WHEN a reader consults `docs/infrastructure.md` §3 THEN it describes the pipeline's fail-open path rather than asserting blanket safety.
  - AND IT MUST date-stamp every claim about the `Jenkinsfile`.
  - AND IT MUST update `smoke.sh`'s own header and its `SMOKE PASSED` summary line, which become false once a CORS assertion exists — a script's self-description is a KZ-008 surface like any other.
  - BUT it must NOT claim the `Jenkinsfile` defect is fixed — this spec cannot change that file (§6).

## 4. Non-Functional Requirements

| ID | Requirement | Measure |
|---|---|---|
| **NFR-1** | The harness introduces **no new installable dependency**. `bats` and `shellcheck` are absent and are not vendored. Permitted: `bash`, coreutils, and the tools the scripts under test already require (`curl`, `jq`, `awk`) — all of which the harness **stubs** rather than calls. | The suite runs on a clean checkout with no `npm i`, no `brew install`, no `pip install` |
| **NFR-2** | Tests are **hermetic** — no AWS calls, no credentials, no live stack, **no outbound network of any kind**. | The suite passes with no AWS credentials and with networking disabled |
| **NFR-3** | The change is **pipeline-compatible**. | A guard-unit test asserts exit `0` under the pipeline's exact env (`AWS_PROFILE=IBD-DEV`) |
| **NFR-4** | Guard logic lives in **one place**. The `MailTransport` classification currently duplicated in `deploy.sh` and `set-cors.sh` collapses into the shared helper. | D-3's enumeration, plus zero remaining local copies of the classification block |
| **NFR-5** | No behavioural change to the application, the API surface, or the PII boundary. | `git diff --stat` touches only `infra/**`, `docs/**`, and root `CLAUDE.md` — the last because it documents `validate.sh` as the infra verify command and describes `deploy-frontend.sh`'s profile behaviour, both of which this change alters |

## 5. Data & Schema Impact

**None.** No Prisma model, migration, API field, or serializer path. No new field with disclosure implications, so `backend/src/common/pii-consent.policy.ts` is neither consulted nor changed.

## 6. Out of Scope

- **The `Jenkinsfile` itself.** Not versioned here. This spec produces an advisory patch for the administrator (`design.md` §7.4) but cannot land the fix and must not claim to.
- **The PR #75 / `MailTransport` merge blocker.** Raised with the Jenkins administrator on 2026-09-18 by the product owner; PR #75 has since merged. Documented, never patched here.
- Provisioning a Prod environment (**OQ-INFRA-1**), beyond not blocking it in FR-3.
- Network hardening — the `0.0.0.0/0` rule on 3306, VPC-attaching the Lambda (`infra/README.md` §11).
- Any change to `infra/10-*`, `20-*`, `30-*` templates.

## 7. Dependencies & Assumptions

Every claim about a system outside this repository, with where it was verified (KZ-011):

| Claim | Where verified |
|---|---|
| The pipeline sets `AWS_PROFILE = 'IBD-DEV'` and materializes it as a real profile file before verifying against STS | `Jenkinsfile` top-level `environment` block + `AWS Auth` stage — operator-supplied copy, read 2026-09-18 |
| The steady-state `Deploy Backend` stage resolves the origin behind `2>/dev/null \|\| true` and falls back to `*` | same file, `Deploy Backend` stage — read 2026-09-18; quoted verbatim in `design.md` §7.4 |
| `Lock CORS` runs only on the `DEPLOY_INFRA == 'true'` path | same file, `Lock CORS` stage `when` clause — read 2026-09-18 |
| The pipeline invokes neither `teardown.sh` nor `migrate-seed.sh` | **UNVERIFIED.** `docs/infrastructure.md` §3 records `RUN_MIGRATIONS=true` → "`prisma migrate deploy` + seed run against RDS", which may or may not shell out to `migrate-seed.sh`. Treated as unknown; no requirement depends on it |
| The live dev backend is locked to the CloudFront origin | `describe-stacks` + an `OPTIONS` preflight against the live API, 2026-09-18 |
| `migrate-seed.sh` and `teardown.sh` carry a profile guard; the other five do not | grep for `!= "IBD-DEV"` across `infra/scripts/`, 2026-09-18 |
| `smoke.sh` accepts `API_BASE_URL`, `CLOUDFRONT_URL` and `BUCKET` from the environment | its own `USAGE` block, re-read against merged `main` 2026-09-18 |
| Neither `bats` nor `shellcheck` is installed | `which bats shellcheck` → not found, 2026-09-18 |

**Assumption, unverifiable from here:** the `Jenkinsfile` copy reviewed is the one deployed on `automation.prms.cgiar.org`.

**No sequencing dependency remains.** PR #75 merged to `main` as `7bed323`; this branch is level with it.

## 8. Open Questions

**None.** OQ-1 (produce the Jenkinsfile patch, CORS resolution only) and OQ-2 (commit `infra/aws-accounts.conf`) were settled by the product owner on 2026-09-18. The spec is decidable as written.

## 9. Depth: Standard

The proposal estimated **Lite** on a two-file scope, before anyone had checked whether shell scripts could be tested in this repository at all. They cannot — there is no harness, no `bats`, no `shellcheck`. Building a dependency-free, hermetic one (NFR-1/NFR-2) is what makes this Standard, and it is not padding: without it every requirement here degrades to a presence-assertion, which is the defect class this spec exists to stop producing.
