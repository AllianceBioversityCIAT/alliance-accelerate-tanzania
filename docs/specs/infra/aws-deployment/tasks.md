# Tasks — AWS Deployment Infrastructure (CloudFormation/SAM bootstrap)

- Spec path: docs/specs/infra/aws-deployment/
- Status: Draft
- Depth: Full
- Traces: requirements.md (FR-1..FR-8, NFR-1..NFR-7), design.md (§1–§10, DD-1..DD-6)
- Commit standard: `[SPEC:infra/aws-deployment] <message>`
- Branch: `feature/infra-aws-deployment`

## ⚠️ Deployment execution note (read first)

This spec's tasks split into **authoring** (templates, scripts, docs — agent-implementable and **locally verifiable** via `sam validate` / `cfn-lint` / `grep`) and **live apply** (real `sam deploy`, `prisma migrate deploy`, `s3 sync`, teardown — which create **real, billable, outward-facing AWS resources** under `IBD-DEV`). The SDD Implementer/Reviewer loop completes the **authoring + local validation** of every task. The **live apply** is an **operator action run by the user** (who holds `IBD-DEV` credentials), following the runbook the tasks produce. No task instructs an agent to autonomously deploy to or delete from the live account. Each task's "Tests / Verify" therefore lists (a) the local/static checks the loop must pass, and (b) the operator apply-check recorded in the runbook.

## Dependency Graph

```
T-1 ─┬─▶ T-2 ─┬─▶ T-3 ─┐
     │        └─▶ T-6   ├─▶ T-7 ─▶ T-9 ─▶ T-10
     ├─▶ T-4 ───────────┤
     └─▶ T-5 ──▶ T-8 ───┘
```
A task is eligible when its status is `[ ]`/`[~]` and all deps are `[x]`. Ties broken by document order.

---

- [x] T-1 Infra scaffold + IaC ratification  (deps: none)
      Size: S
      Requirements: FR-1, FR-7, NFR-1, NFR-3, NFR-7
      Design: design.md §1, §7, DD-1
      Scope: Create the `infra/` tree (`10-data-auth/`, `20-backend/`, `30-frontend/`, `scripts/`, `README.md` stub). Add a shared parameters/naming convention (stack names `accelerate-tz-dev-*`, region `eu-west-1`, params `DevCidr`, `AllowedOrigin`). **Ratify the IaC change:** update root `CLAUDE.md` mandated-stack line from "Serverless Framework" to "AWS SAM / CloudFormation"; mark `backend/serverless.yml` as retired (remove it, or move to `backend/serverless.yml.deprecated` with a header comment pointing to this spec). Add `samconfig.toml` (profile `IBD-DEV`, region `eu-west-1`).
      Tests / Verify: tree exists; `grep -n "IBD-DEV" infra/samconfig.toml`; `grep -ni "serverless framework" CLAUDE.md` returns nothing stale; `grep -ni "SAM\|CloudFormation" CLAUDE.md` shows the new line. (no live apply)
      Done when: scaffold + naming/params + CLAUDE.md ratification + serverless.yml retirement committed; no orphan IaC.
      Skills: aws-serverless

- [x] T-2 RDS MySQL + security group + Secrets Manager  (deps: T-1)
      Size: M
      Requirements: FR-2, FR-7, NFR-2, NFR-4, NFR-6
      Design: design.md §7, §6, DD-2, DD-4
      Scope: In `infra/10-data-auth/` author the RDS portion: `AWS::RDS::DBInstance` (MySQL, `db.t3.micro`, single-AZ, ~20 GB, `PubliclyAccessible: true`, default VPC, `StorageEncrypted` ok, TLS-capable); `AWS::EC2::SecurityGroup` with two commented ingress rules on 3306 — `${DevCidr}` (admin/migrate) and `0.0.0.0/0` (outside-VPC Lambda); `AWS::SecretsManager::Secret` with `GenerateSecretString` (strong password) and a composed `url` key = the Prisma `DATABASE_URL` (TLS params, URL-encoded password). Outputs: `RdsEndpoint`, `DbSecretArn`, `DbSecurityGroupId`. No secret value in the template (NFR-2).
      Tests / Verify: `sam validate`/`aws cloudformation validate-template` on the stack passes; `cfn-lint` clean if available; `grep -riE "password\s*[:=]\s*['\"][^'\"]" infra/10-data-auth` finds NO literal password; outputs declared. (operator apply-check in runbook: stack `CREATE_COMPLETE`, `RdsEndpoint` resolves)
      Done when: RDS+SG+secret template validates with no committed secret and the required outputs.
      Skills: aws-serverless

- [x] T-3 Backend Lambda + HTTP API (SAM)  (deps: T-2)
      Size: M
      Requirements: FR-3, FR-7, NFR-2
      Design: design.md §4, §6, DD-2, DD-4
      Scope: In `infra/20-backend/` author the SAM template: `AWS::Serverless::Function` (`dist/lambda.handler`, `nodejs20.x`, no `VpcConfig`, 512 MB/15 s, low reserved concurrency) + `AWS::Serverless::HttpApi` (`ANY /{proxy+}`, `ANY /`, CORS `AllowOrigins` from `AllowedOrigin` param, default `*` for bootstrap). Inject `DATABASE_URL` via dynamic reference `{{resolve:secretsmanager:<DbSecretArn>:SecretString:url}}` (import `DbSecretArn` from T-2 via cross-stack export/param). Least-privilege exec role (Logs + GetSecretValue on the one secret). Add the Lambda Linux target to `backend/prisma/schema.prisma` `binaryTargets` if missing; confirm `sam build` bundles the Prisma engine. Output `ApiBaseUrl`.
      Tests / Verify: `sam validate` passes; `cd backend && npm run build` succeeds; `sam build` (local) packages `dist/` + prisma engine (inspect `.aws-sam/build`); `grep` shows `DATABASE_URL` only as a secret dynamic-ref, never plaintext. (operator apply-check: `curl $ApiBaseUrl/api/v1/metrics` → 200 after T-6)
      Done when: backend SAM template validates, builds, and references the secret without exposing it.
      Skills: aws-serverless, nestjs-expert

- [x] T-4 Cognito user pool + client + groups  (deps: T-1)
      Size: S
      Requirements: FR-4, FR-7
      Design: design.md §6, §7
      Scope: In `infra/10-data-auth/` add Cognito: `AWS::Cognito::UserPool` (email sign-in, secure password policy), `AWS::Cognito::UserPoolClient` (public client, no secret, appropriate OAuth flows for a static SPA), two `AWS::Cognito::UserPoolGroup` (`admin`, `staff`). No users created; Hosted UI/domain deferred (OQ-4). Outputs: `UserPoolId`, `UserPoolClientId`. (May share the 10-data-auth template/stack with T-2; keep resources in clearly separated sections.)
      Tests / Verify: `sam validate`/`validate-template` passes for the combined 10-data-auth stack; outputs declared; client has no secret. (operator apply-check: `aws cognito-idp list-groups --user-pool-id <id> --profile IBD-DEV` shows admin+staff)
      Done when: Cognito resources + groups + outputs validate within the data-auth stack.
      Skills: aws-serverless

- [ ] T-5 Frontend S3 (private) + CloudFront (OAC)  (deps: T-1)
      Size: M
      Requirements: FR-5, FR-7, NFR-3, NFR-4
      Design: design.md §5, §7, DD-5
      Scope: In `infra/30-frontend/` author: private `AWS::S3::Bucket` (Block Public Access on); `AWS::CloudFront::Distribution` with OAC origin to the bucket, `DefaultRootObject: index.html`, redirect-to-HTTPS, minimal price class; `AWS::CloudFront::OriginAccessControl`; `AWS::S3::BucketPolicy` granting only the OAC `s3:GetObject`; a `AWS::CloudFront::Function` (viewer-request) rewriting directory paths to `/index.html` so per-route static export (`/map`) resolves. Output `CloudFrontUrl` (and `FrontendBucketName`).
      Tests / Verify: `sam validate`/`validate-template` passes; `cfn-lint` clean if available; bucket has BlockPublicAccess + no public policy statement (grep); CloudFront Function code rewrites `/map` → `/map/index.html` (unit-reason in a comment/sample). (operator apply-check: CloudFront URL serves `/` and `/map`; direct S3 object URL → 403)
      Done when: frontend hosting stack validates with a private bucket served only via CloudFront OAC + route rewrite.
      Skills: aws-serverless

- [ ] T-6 DB migrate + seed runner  (deps: T-2)
      Size: S
      Requirements: FR-2, FR-3, NFR-5
      Design: design.md §2, §6, §10
      Scope: Author `infra/scripts/migrate-seed.sh` — reads the secret (`aws secretsmanager get-secret-value --profile IBD-DEV`), exports `DATABASE_URL` (TLS) in-process only (never written to a repo file — respects the `.env` hook), runs `npx prisma migrate deploy` then `npm run seed` (consented sample, no real PII) from `backend/`. Include a guard that refuses to run without `--profile IBD-DEV`/explicit confirmation. Document it in the runbook.
      Tests / Verify: `bash -n infra/scripts/migrate-seed.sh` (syntax); `shellcheck` if available; grep confirms it sources the URL from Secrets Manager and never writes `.env`/plaintext creds; `grep IBD-DEV`. (operator apply-check: against live RDS — migrate + seed succeed over TLS, NFR-5 boundary intact)
      Done when: migrate/seed script is safe (no committed/echoed secret), TLS-enforcing, IBD-DEV-gated, and documented.
      Skills: aws-serverless

- [ ] T-7 Stack deploy orchestration + validation  (deps: T-3, T-4, T-5)
      Size: M
      Requirements: FR-1, FR-8, NFR-1, NFR-7
      Design: design.md §1 (deploy order), §10, DD-6
      Scope: Author `infra/scripts/deploy.sh` orchestrating the order (10-data-auth → [migrate-seed, operator] → 20-backend → 30-frontend) with `sam deploy ... --profile IBD-DEV` and parameter passing (`DevCidr`, cross-stack outputs → params). Add `infra/scripts/validate.sh` running `sam validate`/`cfn-lint` on all stacks. Ensure idempotent re-deploy (change sets). Capture outputs to a documented location (stdout/`describe-stacks`), not a committed secret file.
      Tests / Verify: `bash -n` + `shellcheck` on scripts; `infra/scripts/validate.sh` passes locally (all templates valid); every `aws`/`sam` invocation includes `--profile IBD-DEV` (grep). (operator apply-check: full ordered deploy reaches `*_COMPLETE`; outputs present, FR-7)
      Done when: deploy + validate scripts author the correct ordered, IBD-DEV-scoped, idempotent flow and all templates validate.
      Skills: aws-serverless

- [ ] T-8 Frontend build/deploy + CORS lock  (deps: T-5, T-3)
      Size: S
      Requirements: FR-5, FR-6
      Design: design.md §5, §1 (steps 4–5), DD-6
      Scope: Author `infra/scripts/deploy-frontend.sh` — `cd frontend && NEXT_PUBLIC_API_BASE_URL=<ApiBaseUrl> npm run build` → `aws s3 sync out/ s3://<bucket> --profile IBD-DEV` → CloudFront invalidation. Author `infra/scripts/set-cors.sh` — redeploy 20-backend with `AllowedOrigin=<CloudFrontUrl>` to lock CORS (FR-6). Both read upstream values from stack outputs (params/args), not hardcoded.
      Tests / Verify: `bash -n` + `shellcheck`; `cd frontend && NEXT_PUBLIC_API_BASE_URL=https://example.test npm run build` static-exports `out/` successfully; grep shows `--profile IBD-DEV` and no hardcoded URLs/secrets. (operator apply-check: live site serves, then renders real data after CORS lock; browser CORS OK)
      Done when: frontend build/deploy + CORS-lock scripts are correct, parameterized, IBD-DEV-scoped, and the export build passes with an injected API URL.
      Skills: aws-serverless, vercel-react-best-practices

- [ ] T-9 End-to-end smoke + PII boundary runbook  (deps: T-6, T-7, T-8)
      Size: S
      Requirements: FR-6, FR-8, NFR-5
      Design: design.md §10, §6 (PII/consent)
      Scope: Author `infra/scripts/smoke.sh` + a runbook section: probe `<ApiBaseUrl>/api/v1/metrics` & `/actors` (200, JSON shape), assert no PII keys (`phone`/`email`) and no non-consented actor in the responses (mirrors `pii-boundary.spec.ts` intent over the wire), confirm the CloudFront site loads `/` and `/map` and renders live data, and confirm the S3 object is not publicly readable. Document expected outputs.
      Tests / Verify: `bash -n` + `shellcheck`; the script's PII assertions are present and correct (grep/review). (operator apply-check: smoke passes against the live stack — live data rendered, no PII over the wire, S3 private)
      Done when: a runnable smoke script + runbook verify FR-6 and the NFR-5 boundary end-to-end.
      Skills: aws-serverless, error-handling-patterns

- [ ] T-10 Teardown + operator README/runbook  (deps: T-7, T-8)
      Size: S
      Requirements: FR-8, NFR-6
      Design: design.md §7, §9 (cost), §1
      Scope: Author `infra/scripts/teardown.sh` — empty the frontend bucket then `sam delete`/`delete-stack` all three stacks (`--profile IBD-DEV`), with a confirmation guard. Complete `infra/README.md` as the full runbook: prerequisites, deploy order (with the exact commands), migrate/seed, frontend deploy, CORS lock, smoke, outputs, **cost notes** (micro/single-AZ; destroy when idle), and the documented hardening follow-up (`infra/network-hardening`).
      Tests / Verify: `bash -n` + `shellcheck` on teardown; README covers every script and the full ordered flow; `grep -c "IBD-DEV"` across `infra/scripts` shows every AWS call scoped. (operator apply-check: teardown removes all stacks; `describe-stacks` → not found)
      Done when: teardown script + complete README runbook exist; the whole lifecycle (deploy→operate→destroy) is documented and IBD-DEV-scoped.
      Skills: aws-serverless

## Testing & Verification Expectations

- Every task is **authoring + local validation** (`sam validate`, `cfn-lint`, `bash -n`/`shellcheck`, targeted greps). The SDD loop must pass these before a task is `[x]`.
- **Live apply** (`sam deploy`, `migrate-seed`, `deploy-frontend`, `set-cors`, `smoke`, `teardown`) is an **operator step** the user runs with `IBD-DEV` credentials per the runbook — recorded as the "operator apply-check" per task, not executed by an agent.
- NFR-1 gate: every `aws`/`sam` invocation in any template/script includes `--profile IBD-DEV` (grep-checkable).
- NFR-2 gate: no password/connection string/secret is committed; `DATABASE_URL` only via Secrets Manager dynamic reference; no `.env` written.

## Coverage Check

FR-1→T-1/T-7 · FR-2→T-2/T-6 · FR-3→T-3/T-6 · FR-4→T-4 · FR-5→T-5/T-8 · FR-6→T-8/T-9 · FR-7→T-1/T-2/T-3/T-4/T-5 · FR-8→T-7/T-9/T-10 · NFR-1→all · NFR-2→T-2/T-3/T-6 · NFR-3→T-1..T-5 · NFR-4→T-2/T-5 · NFR-5→T-6/T-9 · NFR-6→T-2/T-10 · NFR-7→T-1/T-7.

Recommended first task: **T-1** (scaffold + IaC ratification).
