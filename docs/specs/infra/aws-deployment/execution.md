# Execution Log — infra/aws-deployment

Canonical audit trail for the JCSPECS Leader → Implementer → Reviewer loop on this spec.

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `infra/aws-deployment` |
| Branch | `feature/infra-aws-deployment` |
| Leader | Claude (orchestrator) |
| Implementer agent | `general-purpose` seeded with `.agents/implementer.md` |
| Reviewer agent | `code-reviewer` seeded with `.agents/reviewer.md` |
| Started | 2026-06-24 |
| Execution model | Tasks are **authored + locally validated** by the loop (`sam validate`/`cfn-lint`/`shellcheck`/grep). **Live apply** (`sam deploy`, migrate, teardown) is an **operator step** the user runs with `IBD-DEV` creds — never executed by an agent. |

## 2. Task Execution History

### T-1 — Infra scaffold + IaC ratification — **PASS** (2026-06-24)
- **Implementer attempts:** 1 (`impl-infra-t1`, general-purpose). Authoring-only — no live AWS.
- **Files:** NEW `infra/{10-data-auth,20-backend,30-frontend}/template.yaml` (valid SAM stubs; `20-backend` carries `Transform: AWS::Serverless-2016-10-09`; placeholder `WaitConditionHandle` to be replaced by T-2..T-5), `infra/samconfig.toml` (IBD-DEV/eu-west-1 ×3 sections), `infra/README.md` (stub + Conventions: stack names, `DevCidr`/`AllowedOrigin`, deploy order), `infra/scripts/.gitkeep`; MODIFIED `CLAUDE.md` (IaC line Serverless Framework → AWS SAM/CloudFormation); DELETED `backend/serverless.yml` (git rm, superseded — DD-1).
- **Requirements covered:** FR-1, FR-7 (scaffold/outputs home), NFR-1, NFR-3, NFR-7.
- **Decisions:** (a) `serverless.yml` removed (not renamed) for cleanliness; `serverless-http` runtime dep correctly retained (Lambda adapter, unrelated to the deploy tool). (b) Minimal valid SAM stubs (single free `WaitConditionHandle`, zero intrinsics) so `sam validate` passes pre-resources. (c) CLAUDE.md edit is a single surgical line; generic "IaC/Serverless definition MUST use --profile IBD-DEV" line left intact (category reference, not tool-specific).
- **Leader verification:** scaffold present (6 files); `IBD-DEV`+`eu-west-1` in samconfig ×3; CLAUDE.md updated, no stale "serverless framework"; `serverless.yml` deleted (staged D); `sam validate` → all 3 stubs valid (real SAM CLI).
- **Reviewer verdict (`rev-infra-t1`):** **STATUS: PASS** — ratification accurate/minimal, no secret/scope leak, no orphaned deploy-tool refs in backend scripts.
- **Accepted drift → T-10 follow-up:** root `README.md` (lines ~38, ~90) still references `backend/serverless.yml` / `npx serverless deploy`. Out of T-1 scope (CLAUDE.md only). **Sync the root README to the SAM deploy flow in T-10** (runbook task).

### T-2 — RDS MySQL + security group + Secrets Manager — **PASS** (2026-06-24, attempt 2)
- **Implementer attempts:** 2 (`impl-infra-t2`, general-purpose). Authoring-only — no live AWS.
- **Files:** MODIFIED `infra/10-data-auth/template.yaml` (RDS+SG+Secret replace the T-1 placeholder; params `VpcId`/`DevCidr`/`DbName`/`DbInstanceClass`/`DbAllocatedStorage`; `AWS::SecretsManager::Secret` GenerateSecretString; `AWS::EC2::SecurityGroup` 3306×2; `AWS::RDS::DBInstance`; `AWS::SecretsManager::SecretTargetAttachment`; 6 exported outputs); Leader also refined `design.md` DD-4/§4 (compose DATABASE_URL in T-3, secret holds username/password only).
- **Requirements covered:** FR-2, FR-7, NFR-2, NFR-4, NFR-6.
- **Attempt 1 → Reviewer FAIL (`rev-infra-t2`):** `DbMasterUsername` output used a `{{resolve:secretsmanager:...}}` dynamic reference in `Outputs` — CloudFormation forbids dynamic refs in Outputs; would throw at `sam deploy`. (Leader had pre-flagged this exact risk.)
- **Attempt 2 fix:** output `Value` → literal `accelerate_admin` (matches `SecretStringTemplate`, non-sensitive). Only remaining dynamic refs are the two in RDS `Properties` (MasterUsername/MasterUserPassword).
- **Decisions:** `VpcId` param (`AWS::EC2::VPC::Id`) places the SG in the default VPC; RDS no DBSubnetGroup → default VPC; `ExcludeCharacters '"@/\ '` keeps the password URL/MySQL-safe; `SecretTargetAttachment` links secret↔DB; outputs `Export`ed for T-3 `Fn::ImportValue`.
- **Leader verification:** `sam validate --lint` valid; no literal password; 6 outputs; no Cognito leak; post-fix grep confirms no dynamic ref in Outputs.
- **Reviewer verdict (`rev-infra-t2b`, attempt 2):** **STATUS: PASS** — fix confirmed, no regression across NFR-2/DD-4/DD-2/FR-2/NFR-4/NFR-6/FR-7.

### T-3 — Backend Lambda + HTTP API (SAM) — **PASS** (2026-06-24)
- **Implementer attempts:** 1 (`impl-infra-t3`, general-purpose). Authoring-only — no live AWS.
- **Files:** MODIFIED `infra/20-backend/template.yaml` (Serverless Function + HttpApi replace placeholder), `backend/prisma/schema.prisma` (`binaryTargets = ["native","rhel-openssl-3.0.x"]`); NEW `backend/Makefile` (SAM `build-ApiFunction`).
- **Requirements covered:** FR-3, FR-7, NFR-2.
- **Decisions:** (a) `DATABASE_URL` composed via `!Sub` (DD-4) — password via `{{resolve:secretsmanager:...}}` dynamic ref, host/user/port/db via `Fn::ImportValue` from `accelerate-tz-dev-data-auth`; `sslaccept=strict` (NFR-4) with a runbook TLS-CA caveat comment. (b) Lambda **no VpcConfig** (DD-2), 512MB/15s, ReservedConcurrency 5 (NFR-6). (c) Scoped `GetSecretValue` on the one imported secret ARN. (d) HttpApi catch-all `ANY /{proxy+}`+`/`, CORS GET/OPTIONS from `AllowedOrigin` (default `*`). (e) `ApiBaseUrl` output exported for T-8.
- **Notable fixes the Implementer found:** (i) the T-1 scaffold's `Transform` was the invalid `AWS::Serverless-2016-10-09` (passed T-1 lint only because no SAM resources existed yet) → corrected to canonical `AWS::Serverless-2016-10-31`. (ii) `backend/Makefile` added because `dist/` is gitignored → the default npm-pack builder would drop `dist/lambda.handler`; the makefile target stages `dist/`+prisma+rhel engine deterministically (verified via `sam build`).
- **Leader verification:** `sam validate --lint` valid; `VpcConfig` count 0; no literal password (only dynamic ref); `npx prisma generate` emits both native + `rhel-openssl-3.0.x` engines; `npm run build` → `dist/lambda.js`; `30-frontend` stub has no Transform (typo not propagated).
- **Reviewer verdict (`rev-infra-t3`):** **STATUS: PASS** — NFR-2 satisfied, DD-2 no-VpcConfig, 5 cross-stack imports match the data-auth exports, binaryTargets correct, Makefile correct + secret-free, least-privilege role, ApiBaseUrl exported, canonical Transform, no scope creep.

### T-4 — Cognito user pool + client + groups — **PASS** (2026-06-24)
- **Implementer attempts:** 1 (`impl-infra-t4`, general-purpose). Authoring-only.
- **Files:** MODIFIED `infra/10-data-auth/template.yaml` (Cognito section added; T-2 RDS untouched).
- **Requirements covered:** FR-4, FR-7.
- **Decisions:** UserPool email sign-in, `AllowAdminCreateUserOnly: true` (staff/admin RBAC, no public self-signup), password policy min-12 + all char classes; public client `GenerateSecret: false`, flows SRP/PASSWORD/REFRESH (access/id 1h, refresh 30d), no Hosted-UI/OAuth (deferred OQ-4); groups `admin` (precedence 1) + `staff` (10); `Public` not a Cognito group; outputs `UserPoolId`/`UserPoolClientId` exported.
- **Leader verification:** `sam validate --lint` valid; Cognito pool/client/2 groups present; `GenerateSecret: false`; all 6 T-2 outputs intact; no Hosted-UI/OAuth properties (comment only).
- **Reviewer verdict (`rev-infra-t4`):** **STATUS: PASS** — FR-4/FR-7 met, NFR-2 no-secret client, OQ-4 deferral correct, no T-2 regression, scope clean.

### T-5 — Frontend S3 (private) + CloudFront (OAC) — **PASS** (2026-06-24)
- **Implementer attempts:** 1 (`impl-infra-t5`, general-purpose). Authoring-only.
- **Files:** MODIFIED `infra/30-frontend/template.yaml` (replaced placeholder with private S3 + OAC + rewrite Function + Distribution + scoped bucket policy + outputs).
- **Requirements covered:** FR-5, FR-7, NFR-3, NFR-4.
- **Decisions:** private bucket (4× block-public-access, `BucketOwnerEnforced`, SSE-S3, no website hosting); OAC sigv4/always; viewer-request CloudFront Function (`cloudfront-js-2.0`) rewriting `/`→`/index.html`, `/map`→`/map/index.html`, `/_next/*.js` passthrough (DD-5); distribution OAC origin (empty `OriginAccessIdentity`), `redirect-to-https`, managed CachingOptimized policy, `PriceClass_100`, no domain/ACM; bucket policy grants only `cloudfront.amazonaws.com` GetObject scoped by `AWS:SourceArn`; outputs `CloudFrontUrl`/`FrontendBucketName` exported.
- **Leader verification:** `sam validate --lint` valid; 4 block-public-access true; OAC + FunctionAssociations + outputs present; no public `Principal: "*"`.
- **Reviewer verdict (`rev-infra-t5`):** **STATUS: PASS** — all 7 gates (private/OAC-only, rewrite logic traced for 4 cases, HTTPS, OAC wiring + no circular dep, minimal footprint, exported outputs).

## 3. Summary (updated as tasks complete)
- T-1..T-5 **[x] all PASS** — all four stack templates authored (10-data-auth RDS+Cognito, 20-backend, 30-frontend). T-6..T-10 pending (scripts + runbook). Next eligible: **T-6** (migrate/seed runner; deps: T-2 ✓).
- **Open follow-ups:** root `README.md` IaC sync → **T-10**.
