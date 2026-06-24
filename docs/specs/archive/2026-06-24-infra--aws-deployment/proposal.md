# Proposal — AWS Deployment Infrastructure (CloudFormation bootstrap)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `infra/aws-deployment` |
| Type | Infrastructure / foundational (IaC) |
| Status | Draft — awaiting approval |
| Author / Date | JuanCode / 2026-06-24 |
| AWS profile | **`IBD-DEV`** (hard constraint — every CLI/IaC/script action) |
| Region | `eu-west-1` (matches existing `backend/serverless.yml`) |
| Constitutional refs | detailed-design §7 (integration), §8 (security/secrets/CORS), §11 (constraints); CLAUDE.md (mandated stack, profile) |

## 2. Intent

Stand up the **dev AWS environment** that runs the application end to end, defined as **CloudFormation** (Infrastructure-as-Code), using the `IBD-DEV` profile. Provision the five components the app needs — **RDS MySQL**, **backend on Lambda + API Gateway**, **Cognito** (auth), and **S3 + CloudFront** (frontend static hosting) — plus the glue (secrets, env wiring, outputs). Keep it deliberately **minimal**: no custom domain (use the CloudFront-provided `*.cloudfront.net` URL), no custom VPC, no extra hardening. Get a working, reproducible, tear-down-able dev stack.

## 3. Problem / Current Behavior

- The application is **built but undeployed**. The home page, Discovery Map, and backend (Actors/Metrics API + Prisma schema) all exist and are tested, but there is **no running environment** — no RDS, no Lambda, no Cognito, no S3/CloudFront.
- The frontend `getActors`/`getMetrics` clients call `NEXT_PUBLIC_API_BASE_URL` which **points nowhere**; both currently render their graceful "couldn't load" fallback because the API is undeployed (DD-6).
- A `backend/serverless.yml` exists (**Serverless Framework**, `eu-west-1`, single NestJS Lambda on httpApi) but has never been deployed and **no foundational resources** (DB, auth, CDN) are defined anywhere.
- detailed-design §8/§11 specify the target (Cognito JWT guards, SSM/Secrets Manager secrets, CloudFront-locked CORS, RDS-Proxy-recommended) but **no IaC realizes it**.

## 4. Proposed Outcome

1. A **CloudFormation-defined dev environment** (templates + `IBD-DEV` deploy/teardown scripts) provisioning:
   - **RDS MySQL** (single instance, in the **default VPC**, minimal config) + master credentials in **Secrets Manager**.
   - **Backend Lambda + API Gateway (HTTP API)** wrapping the existing NestJS app; `DATABASE_URL` sourced from Secrets Manager; CORS locked to the CloudFront origin.
   - **Cognito User Pool** + app client (no secret, for the static SPA) + groups `admin` and `staff` (anonymous = `Public`).
   - **S3** (private) + **CloudFront** (Origin Access Control) serving the Next.js static export; the **CloudFront default domain** is the app URL.
   - **Outputs**: CloudFront URL, API base URL, Cognito User Pool ID / client ID, RDS endpoint — the values that wire the two app layers together.
2. A documented **deploy order** that resolves the build-time/runtime coupling (API URL needed to build the frontend; CloudFront URL needed for backend CORS).
3. A one-time **`prisma migrate deploy` + seed** path against the new RDS, run with `IBD-DEV` credentials.

## 5. Scope

- **CloudFormation templates** (one stack or a small set of nested/linked stacks) for: RDS MySQL, Lambda + HTTP API, Cognito (pool/client/groups), S3 + CloudFront (OAC), Secrets Manager/SSM parameters, and stack **Outputs**.
- **Deploy & teardown scripts** (`--profile IBD-DEV`, `eu-west-1`): package/deploy backend Lambda, build + `s3 sync` the frontend export, CloudFront invalidation, and a `prisma migrate deploy`/seed runner.
- **Env wiring**: inject the API URL into the frontend build (`NEXT_PUBLIC_API_BASE_URL`); inject DB/Cognito config into the Lambda from Secrets Manager/SSM; set backend CORS to the CloudFront origin.
- **Minimal security baseline** that is unavoidable: one RDS security group, IAM execution roles (least-privilege-ish), HTTPS via CloudFront/API Gateway defaults.

## 6. Non-Goals

- **Custom domain / Route 53 / ACM certificate** — use the CloudFront `*.cloudfront.net` URL (explicit user ask).
- **Custom VPC / subnets / NAT gateway** — use the account **default VPC** only (see OQ-1; RDS still mandates *a* VPC + SG).
- **CI/CD pipeline** (GitHub Actions/CodePipeline) — manual deploy scripts for now.
- **Multi-environment** (staging/prod) — **dev only** (`IBD-DEV`).
- **Frontend Cognito login UX** (Hosted UI wiring, token handling) — infra provisions the User Pool; wiring auth into the app is a **separate spec**.
- **WAF, GuardDuty, CloudWatch alarms/dashboards, autoscaling, RDS Proxy hardening** — deferred (RDS Proxy flagged in OQ-3).
- Committing any secrets — all credentials live in Secrets Manager/SSM (a PreToolUse hook also blocks `.env` writes).

## 7. Affected Users, Systems, And Specs

- **Users:** the dev team (deploy/operate); end users gain a reachable URL once live.
- **Systems:** first real AWS footprint for the project — RDS, Lambda, API Gateway, Cognito, S3, CloudFront, Secrets Manager/SSM, IAM.
- **Constitutional docs:** realizes detailed-design §7/§8/§11; **CLAUDE.md** mandated-stack line says backend IaC = *Serverless Framework* — this proposal moves IaC to **CloudFormation/SAM** (OQ-2, needs ratification). `backend/serverless.yml` is retired or superseded.
- **Code:** new top-level `infra/` (templates + scripts); minor backend touch (confirm the Lambda handler/packaging works under SAM/CloudFormation); frontend gains a documented build-time env var, no code change.

## 8. Requirement Delta Preview

### ADDED
- CloudFormation IaC provisioning RDS MySQL, Lambda + HTTP API, Cognito (pool/client/groups), S3 + CloudFront, secrets, and outputs — all under `IBD-DEV`/`eu-west-1`.
- Deploy/teardown/migrate scripts; documented deploy order resolving the API-URL ↔ CloudFront-URL coupling.
- Frontend build consumes `NEXT_PUBLIC_API_BASE_URL` = the deployed API URL; backend CORS = the CloudFront origin.

### MODIFIED
- **IaC tool:** CLAUDE.md "Serverless Framework" → **CloudFormation/SAM** (pending ratification, OQ-2).
- detailed-design §11 "RDS Proxy recommended" → **deferred** for the easy dev setup (OQ-3).

### REMOVED / DEFERRED
- `backend/serverless.yml` (Serverless Framework) retired/superseded by CloudFormation (if Option A/B chosen).
- VPC/SG/domain/CI/multi-env explicitly out of scope (§6).

## 9. Approach Options

**Option A — AWS SAM (CloudFormation-native) for everything (Recommended).**
SAM is a CloudFormation transform/superset: it makes Lambda + HTTP API trivial (`AWS::Serverless::Function/HttpApi`) while RDS, Cognito, S3, and CloudFront are declared as ordinary CloudFormation resources in the **same template set**. Satisfies the explicit "use CloudFormation" ask (a SAM template *is* CloudFormation), keeps the backend deploy "easy," and gives one toolchain (`sam build && sam deploy --profile IBD-DEV`). *Cons:* introduces SAM CLI; supersedes the existing `serverless.yml`.

**Option B — Pure/raw CloudFormation (no SAM).**
Hand-written `AWS::Lambda::Function` + `AWS::ApiGatewayV2::*` alongside the other resources. Most literal to "CloudFormation," zero extra tooling beyond the AWS CLI. *Cons:* much more boilerplate for Lambda packaging/permissions/API routes — least "easy," slowest to author/maintain.

**Option C — Hybrid: keep Serverless Framework for the backend + CloudFormation for the rest.**
Serverless Framework already emits CloudFormation under the hood and matches CLAUDE.md; pair it with CloudFormation templates for RDS/Cognito/S3/CloudFront. *Cons:* **two IaC tools** and two deploy flows — contradicts "easy/simple," and the cross-stack wiring (outputs → serverless env) is fiddly.

## 10. Recommended Approach

**Option A (AWS SAM).** It is the smallest *easy* path that honors the explicit CloudFormation request: SAM templates compile to CloudFormation, so "use CloudFormation" is satisfied, while Lambda + HTTP API stay one-liner-simple and the foundational resources (RDS/Cognito/S3/CloudFront) sit as plain CloudFormation in the same stack with shared **Outputs** for wiring. One toolchain, one `--profile IBD-DEV` deploy, easy teardown (`sam delete`). We retire `serverless.yml` to avoid two competing backend IaC definitions. (If you'd rather avoid the SAM CLI entirely, Option B is the fallback at the cost of Lambda boilerplate.)

Suggested stack decomposition (keeps blast radius small and ordering sane):
1. **Data/auth stack** — RDS MySQL (default VPC + 1 SG) + Secrets Manager; Cognito pool/client/groups. (Rarely changes.)
2. **Backend stack** — Lambda + HTTP API, reads DB secret, CORS placeholder. (Outputs the API URL.)
3. **Frontend stack** — S3 + CloudFront (OAC). (Outputs the CloudFront URL.)
4. **Wire-up** — build frontend with the API URL → sync to S3 → set backend CORS to the CloudFront origin → `prisma migrate deploy` + seed.

## 11. Risks, Dependencies, And Open Questions

- **OQ-1 (RDS networking — the "no VPC" reality):** RDS **requires** a VPC and ≥1 security group. Recommend the **account default VPC** + a single minimal SG, **publicly accessible** RDS so the Lambda (outside any VPC) and the developer machine (for `migrate deploy`) can reach it. Tradeoff: a public DB endpoint is exposed (guarded by SG + generated credentials). Acceptable for dev? Or restrict the SG to known IPs? (Lambda-in-VPC would be more private but adds ENIs/cold-starts/NAT — contradicts "easy".)
- **OQ-2 (IaC tool vs CLAUDE.md):** CLAUDE.md mandates *Serverless Framework*. This proposal recommends **SAM/CloudFormation**. Ratify the change (and update CLAUDE.md), or keep Serverless Framework for the backend (Option C)?
- **OQ-3 (RDS Proxy):** detailed-design §11 recommends RDS Proxy for Lambda connection pooling. Skip for the easy dev setup (lazy Prisma client reuse only), or include it now?
- **OQ-4 (deploy ordering / circular env):** frontend build needs the **API URL**; backend CORS needs the **CloudFront URL**. Resolve by deploy order (backend → build+deploy frontend → patch backend CORS) — confirm acceptable, or use a wildcard CORS in dev to break the cycle.
- **OQ-5 (DB migrations):** run `prisma migrate deploy` from the developer machine against the public RDS endpoint (simplest), or via a one-off migration Lambda/CodeBuild? Seed with the existing consented sample dataset (no real PII).
- **OQ-6 (Cognito depth):** provision pool + app client + groups now; do we also create a **Hosted UI domain** (for future login) or leave that to the auth-wiring spec?
- **Dependency:** valid `IBD-DEV` credentials with permissions to create RDS/Lambda/Cognito/S3/CloudFront/IAM/Secrets; an available default VPC in `eu-west-1`.
- **Cost/teardown:** RDS + CloudFront accrue cost; provide a `sam delete`/teardown script and consider `db.t3.micro`, single-AZ, minimal storage.

## 12. Success Criteria

- `sam deploy --profile IBD-DEV` (or chosen tool) provisions all five components reproducibly in `eu-west-1`, and a teardown command removes them.
- The deployed **CloudFront URL serves the live frontend**, which successfully calls the deployed API (`/api/v1/metrics`, `/api/v1/actors`) — metrics/actors render real seeded data instead of the fallback.
- RDS is migrated (`prisma migrate deploy`) and seeded (consented sample, no real PII); the public API returns PII-safe, consent-gated data (existing boundary tests still hold).
- Cognito User Pool + `admin`/`staff` groups exist; no secrets are committed (all in Secrets Manager/SSM); every IaC/script action uses `--profile IBD-DEV`.
- Stack **Outputs** surface the CloudFront URL, API URL, and Cognito IDs for app wiring.

## 13. Next Step

```text
/sdd-specify infra/aws-deployment
```
