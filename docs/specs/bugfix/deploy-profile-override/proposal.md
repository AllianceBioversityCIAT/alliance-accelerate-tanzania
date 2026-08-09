# Proposal — Deploy scripts silently honour an ambient `AWS_PROFILE`

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `bugfix/deploy-profile-override` |
| Proposal date | 2026-08-07 |
| Author | AKILI (Leader) on behalf of JuanCode |
| **Type** | **Bugfix** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting `/akili-specify` |
| **Parallel-safe** | **yes** — touches only `infra/scripts/**`; no application code, no stack templates |
| Suggested depth | **Lite** — a guard-clause change across ~6 scripts, but see §5: the *verification* is the hard part, not the fix |
| Origin | Found during `enhancement/app-visual-refresh` T-6, when `deploy-frontend.sh` reported `profile 'MELIA-DEV'`. **Not a theoretical defect — it already fired in production use on 2026-07-09.** |

## 2. Problem / Current Behaviour

Every script under `infra/scripts/` resolves the AWS profile as:

```bash
PROFILE="${AWS_PROFILE:-IBD-DEV}"
```

This makes `IBD-DEV` a **fallback of last resort** rather than a floor. Any `AWS_PROFILE` exported in the operator's shell silently wins.

That inverts a hard constraint. Root `CLAUDE.md` states:

> **AWS profile:** every AWS CLI command, deploy script, and IaC/Serverless definition **MUST** use `--profile IBD-DEV`.

and `infra/samconfig.toml:2` repeats it as **NFR-1**: *"every deploy uses the IBD-DEV profile, region eu-west-1."* `samconfig.toml` pins `profile = "IBD-DEV"` for the SAM path — so the **shell-script path is the only one that can drift**, and it is the path that writes to S3 and invalidates CloudFront.

## 3. Evidence that this is not hypothetical

On **2026-08-07**, `./infra/scripts/deploy-frontend.sh` was run with `AWS_PROFILE=MELIA-DEV` present in the operator's environment. It resolved to `MELIA-DEV`, attempted to read stack `accelerate-tz-dev-backend`, and failed:

```
==> ACCELERATE Tanzania frontend build/deploy — profile 'MELIA-DEV', region 'eu-west-1'.
==> Resolving ApiBaseUrl from stack 'accelerate-tz-dev-backend' ...
An error occurred (ValidationError) ... Stack with id accelerate-tz-dev-backend does not exist
```

**It failed safe only by luck** — that account happened not to have a `20-backend` stack. Step 1 is a read-only `describe-stacks`, so nothing was written that day.

**But the same mechanism had already succeeded a month earlier.** Account `494418445156` (the operator's *personal* account) contained a fully-created `accelerate-tz-dev-data-auth` stack, `CREATE_COMPLETE`, created **2026-07-09T17:53:52Z**, comprising:

| Resource | Physical id |
|---|---|
| `AWS::RDS::DBInstance` | `accelerate-tz-dev-data-auth-db-rvo9qfwza3fq` (`db.t3.micro`, 20 GB, `available`) |
| `AWS::Cognito::UserPool` | `eu-west-1_VMdyGVDD8` (+ `admin` / `staff` groups) |
| `AWS::SecretsManager::Secret` | `...db-credentials-1hrqbx` |
| `AWS::EC2::SecurityGroup` | `sg-091455102f62ea626` |

An RDS instance ran ~30 days in an unintended account. The stack was deleted on 2026-08-07 at the user's instruction (Cognito pool held **0 users**, so no identity data was lost).

**The severity is not the cost.** It is that a *governed* action — one `docs/infrastructure.md` §3 explicitly says agents never improvise and operators run through scripts — can be redirected to an arbitrary AWS account by an environment variable, with **no prompt, no echo of the mismatch, and no failure** when the target account happens to hold same-named stacks. Under §5's PII rules, the datastore's *account* is part of the security boundary.

## 4. Proposed Change (constraints, not mechanism)

1. **`IBD-DEV` becomes a floor, not a default.** An ambient `AWS_PROFILE` MUST NOT silently change the target account.
2. **Overriding it MUST be explicit and loud** — a dedicated, purpose-named variable, never a general-purpose one that other tooling also sets.
3. **The resolved account MUST be verified before any write.** Scripts SHOULD assert the `sts get-caller-identity` account id against the expected one and abort on mismatch — a stack-name lookup is *not* sufficient, since names can collide across accounts, which is precisely the near-miss above.
4. **The mismatch MUST be reported, not merely resolved.** If `AWS_PROFILE` is set and differs from the effective profile, say so on stderr.
5. Applies to **every** script in `infra/scripts/`, not only `deploy-frontend.sh` — `deploy.sh` is what actually created the July stack.

## 5. Why the verification is harder than the fix

The fix is a guard clause. Proving it is not, and a naive spec will produce a **presence assertion** — the KZ-002 defect class this repo has now hit three times in one spec.

"The guard is present in the file" is not evidence. The behaviours that need demonstrating are:

- with `AWS_PROFILE` unset → targets `IBD-DEV`;
- with `AWS_PROFILE` set to something else → **aborts**, does not proceed;
- with the explicit override set → proceeds, and **announces** the non-default target;
- with a profile whose account id ≠ expected → aborts **even when a same-named stack exists** (the collision case, which is the actual danger).

The last one cannot be tested by deploying. It needs the account assertion to be unit-testable in isolation from AWS — which is a design constraint on the fix, not an afterthought.

## 6. Out of scope

- Migrating to CI/CD with OIDC role assumption (**OQ-INFRA-2**) — that would remove operator shells from the path entirely and is the better long-term answer, but it is a separate infrastructure spec.
- Provisioning a Prod environment (**OQ-INFRA-1**).
- Any change to stack templates under `infra/10-*`, `20-*`, `30-*`.

## 7. Risks

| Risk | Mitigation |
|---|---|
| A stricter guard breaks an operator's legitimate multi-account workflow | The explicit override exists for exactly that; it is loud, not absent |
| Hardcoding an account id couples the scripts to one account, blocking Prod | Take the expected account from `samconfig.toml`/a parameter, not a literal — resolve alongside **OQ-INFRA-1** |
