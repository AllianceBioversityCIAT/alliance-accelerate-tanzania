# Design — AWS Deployment Infrastructure (CloudFormation/SAM bootstrap)

## Document Control

| Field | Value |
|---|---|
| Spec path | `infra/aws-deployment` |
| Branch | `feature/infra-aws-deployment` (off `main`) |
| Depth | Full |
| Traces | requirements.md (FR-1..FR-8, NFR-1..NFR-7) |
| Constitutional refs | detailed-design §7 (integration), §8 (security/secrets/CORS), §9 (observability), §11 (constraints); CLAUDE.md (profile, stack) |
| IaC | AWS SAM (`template.yaml`) + nested/linked CloudFormation; deploy via `sam` / `aws cloudformation` with `--profile IBD-DEV`, region `eu-west-1` |

## 1. Approach Overview

Deploy the dev environment as **AWS SAM** (a CloudFormation transform). SAM keeps the **Lambda + HTTP API** trivial while **RDS, Cognito, S3, and CloudFront** are declared as ordinary CloudFormation resources in the same template set. To keep blast radius small and the deploy order sane, the infra is split into **three SAM/CloudFormation stacks** plus a thin **wire-up** step, all under `infra/`:

```
infra/
├── 10-data-auth/      # RDS MySQL (+ Secrets Manager secret) + Cognito (pool/client/groups)   [rarely changes]
├── 20-backend/        # Lambda (NestJS) + HTTP API; reads DB secret; CORS param               [outputs API URL]
├── 30-frontend/       # S3 (private) + CloudFront (OAC)                                        [outputs CloudFront URL]
├── scripts/           # deploy/migrate/build-deploy-frontend/set-cors/teardown (all --profile IBD-DEV)
└── README.md          # the operator runbook (FR-8)
```

Deploy order (resolves the API-URL ↔ CloudFront-URL coupling, FR-6):

```
1. deploy 10-data-auth      → RDS endpoint + secret ARN + Cognito IDs (outputs)
2. prisma migrate deploy + seed   (dev machine → public RDS over TLS)
3. deploy 20-backend        → API base URL (output);  CORS starts permissive in dev
4. build frontend (NEXT_PUBLIC_API_BASE_URL = API URL) → s3 sync → deploy 30-frontend → CloudFront URL (output)
5. set-cors: redeploy 20-backend with AllowedOrigin = CloudFront URL  (lock CORS, FR-6)
```

This is additive infrastructure: no application code is rewritten. The only backend touch is confirming the existing `dist/lambda.handler` works under SAM packaging; the only frontend touch is consuming a build-time env var (no code change).

## 2. Data Model Changes

None. The existing `backend/prisma/schema.prisma` is migrated to RDS via `prisma migrate deploy`; the existing `backend/prisma/seed.ts` consented sample (no real PII) seeds it. See requirements §5.

## 3. API Surface & Contracts

No new application endpoints. The existing NestJS routes (`GET /api/v1/metrics`, `GET /api/v1/actors`, `/actors/:id`) are exposed unchanged through the HTTP API catch-all (`/{proxy+}` + `/`). The **infra "contract"** is the set of CloudFormation **outputs** (FR-7):

| Output | Source stack | Consumed by |
|---|---|---|
| `CloudFrontUrl` | 30-frontend | operator; backend CORS (step 5) |
| `ApiBaseUrl` | 20-backend | frontend build (`NEXT_PUBLIC_API_BASE_URL`) |
| `UserPoolId`, `UserPoolClientId` | 10-data-auth | future auth-wiring spec |
| `RdsEndpoint`, `DbSecretArn` | 10-data-auth | migrate/seed; backend Lambda env |

## 4. Backend Design

**20-backend stack (SAM):**
- `AWS::Serverless::Function` — handler `dist/lambda.handler`, runtime `nodejs20.x`, **no `VpcConfig`** (outside VPC, DD-1), modest memory/timeout (e.g. 512 MB / 15 s), reserved concurrency low for dev cost.
- `AWS::Serverless::HttpApi` — routes `ANY /{proxy+}` and `ANY /`; CORS `AllowOrigins` from a stack **parameter** (`AllowedOrigin`, default `*` for the dev bootstrap, set to the CloudFront URL in step 5).
- **`DATABASE_URL`** injected as a function env var via a CloudFormation **dynamic reference** to Secrets Manager: `'{{resolve:secretsmanager:${DbSecretArn}:SecretString:url}}'` — secret value never appears in the template or repo (NFR-2). TLS enforced via the connection string (`sslaccept=strict` / `?ssl=true`) and Prisma's MySQL TLS.
- IAM execution role: least-privilege (CloudWatch Logs + read the specific secret). No VPC permissions needed.
- Packaging: `sam build` over `backend/` using the existing `npm run build` output (`dist/`) + `prisma/schema.prisma` + the Prisma query engine binary for the Lambda target (`binaryTargets` includes `rhel-openssl-3.0.x`/`linux-musl` as appropriate). Confirm `@prisma/client` engine is bundled.

**Prisma on Lambda:** lazy singleton client reused across warm invocations (per detailed-design §9; no RDS Proxy, DD-3). `binaryTargets` in `schema.prisma` extended for the Lambda runtime if not already present.

## 5. Frontend Design

**30-frontend stack (CloudFormation):**
- `AWS::S3::Bucket` — private (Block Public Access on), versioning optional, no website hosting (served via CloudFront only).
- `AWS::CloudFront::Distribution` — default origin = the S3 bucket via **Origin Access Control (OAC)**; `DefaultRootObject: index.html`; viewer protocol redirect-to-HTTPS; price class minimal. Because Next static export emits per-route `index.html` (e.g. `out/map/index.html`), add a **CloudFront Function** (or custom-error/`index.html` rewrite) to map directory paths to their `index.html` so `/map` resolves. No custom domain — the distribution's `*.cloudfront.net` domain is the app URL (FR-5).
- `AWS::S3::BucketPolicy` — allow `cloudfront.amazonaws.com` (the OAC) `s3:GetObject` only; bucket otherwise private.

**Build/deploy:** `cd frontend && NEXT_PUBLIC_API_BASE_URL=<ApiBaseUrl> npm run build` → `aws s3 sync out/ s3://<bucket> --profile IBD-DEV` → CloudFront invalidation. No application code change; only the build-time env var.

## 6. Security & RBAC

- **Profile (NFR-1):** every script and template deploy uses `--profile IBD-DEV`; no static keys in the repo.
- **Secrets (NFR-2):** `AWS::SecretsManager::Secret` with a generated password (`GenerateSecretString`) and a composed `url` field (the Prisma `DATABASE_URL`). The Lambda reads it via dynamic reference at deploy; the dev machine reads it via `aws secretsmanager get-secret-value --profile IBD-DEV` for migration. Nothing secret is committed.
- **RDS exposure (DD-1/DD-2):** public endpoint in the default VPC; SG with two explicit, commented ingress rules on `3306` — `${DevCidr}` (operator IP/32, admin/migrate) and `0.0.0.0/0` (the outside-VPC Lambda). TLS-capable; password-guarded. Documented as **dev-only**, with the in-VPC hardening path noted for a follow-up spec.
- **Transport (NFR-4):** CloudFront and API Gateway serve HTTPS; RDS connections require TLS.
- **PII/consent (NFR-5):** unchanged — the deployed API uses the same role-aware serializer + consent-gated Prisma `WHERE`; only consented sample data is seeded. The existing `pii-boundary.spec.ts` remains the proof; a post-deploy smoke check re-asserts no PII over the wire.
- **Cognito (FR-4):** User Pool (email sign-in, secure password policy), public app client (no secret, SPA flow), groups `admin` + `staff`. No users provisioned here; Hosted UI deferred (OQ-4).

## 7. Infrastructure / Deployment

| Component | Resource(s) | Stack | Notes |
|---|---|---|---|
| Database | `AWS::RDS::DBInstance` (MySQL, `db.t3.micro`, single-AZ, ~20 GB, public), `AWS::EC2::SecurityGroup`, `AWS::SecretsManager::Secret` | 10-data-auth | default VPC; SG dev IP/32 + 0.0.0.0/0:3306; TLS |
| Auth | `AWS::Cognito::UserPool`, `UserPoolClient`, two `UserPoolGroup` | 10-data-auth | groups admin/staff; outputs IDs |
| Backend | `AWS::Serverless::Function`, `AWS::Serverless::HttpApi`, exec `AWS::IAM::Role` | 20-backend | no VPC; DATABASE_URL via secret dynamic ref; CORS param |
| Frontend host | `AWS::S3::Bucket`, `AWS::S3::BucketPolicy`, `AWS::CloudFront::Distribution` (+ OAC, CloudFront Function) | 30-frontend | private bucket; OAC; default-root index.html |
| Outputs | CloudFormation `Outputs` | all | CloudFront URL, API URL, Cognito IDs, RDS endpoint, secret ARN |
| Ops | `infra/scripts/*.sh` + `infra/README.md` | — | deploy / migrate-seed / build-deploy-frontend / set-cors / teardown |

Region `eu-west-1`; stack naming `accelerate-tz-dev-{data-auth,backend,frontend}`. Cost controls per NFR-6 (micro DB, minimal CloudFront price class, low Lambda memory/concurrency); teardown script deletes all three stacks (and empties the S3 bucket first).

## 8. Decision Records (ADR-style)

### Decision: DD-1 — AWS SAM (CloudFormation) as the single IaC tool
SAM templates compile to CloudFormation, satisfying the explicit "use CloudFormation" requirement while keeping Lambda + HTTP API minimal. One toolchain (`sam build && sam deploy --profile IBD-DEV`), one deploy/teardown story. **Retires `backend/serverless.yml`** and requires a CLAUDE.md update (Serverless Framework → CloudFormation/SAM). *Rejected:* raw CloudFormation (heavy Lambda boilerplate); Serverless-Framework-for-backend + CFN-for-rest (two toolchains, contradicts "easy").

### Decision: DD-2 — Lambda outside the VPC; public RDS guarded by creds + TLS (dev)
An outside-VPC Lambda keeps **internet egress** free, so it works today (public API) and tomorrow (Cognito JWKS fetch, AWS SDK calls) with **no NAT or VPC endpoints** — matching "no additional infra." The cost is a public RDS endpoint; mitigated by TLS, a strong Secrets-Manager password, no real PII (seeded data), and easy teardown. SG carries an explicit dev IP/32 admin rule plus the 0.0.0.0/0 Lambda rule. *Rejected:* Lambda-in-VPC + private RDS — better prod posture but forces NAT/VPC endpoints once auth's JWKS fetch lands; deferred to `infra/network-hardening`.

### Decision: DD-3 — No RDS Proxy in the dev bootstrap
Rely on lazy Prisma client reuse across warm invocations (detailed-design §9). Dev concurrency is low; Proxy adds a secret + IAM + cost. Add it during network hardening if connection exhaustion appears. *Rejected:* provisioning Proxy now (premature for dev).

### Decision: DD-4 — Secrets via Secrets Manager + CloudFormation dynamic reference
`DATABASE_URL` is injected into the Lambda using `{{resolve:secretsmanager:...}}` so the secret never lives in a template, env file, or the repo (NFR-2). The dev machine pulls the same secret for `migrate deploy`. *Rejected:* plaintext template param / committed `.env` (violates NFR-2 and the `.env` hook).

### Decision: DD-5 — Static export served from private S3 via CloudFront OAC; no domain
Private bucket + OAC is the current AWS best practice (over legacy OAI/public-website buckets). The CloudFront default domain is the app URL (no Route 53/ACM). A CloudFront Function maps directory routes to `index.html` for the per-route static export. *Rejected:* public S3 website endpoint (less secure, no HTTPS on the bucket); custom domain (out of scope).

### Decision: DD-6 — Deploy order resolves the API-URL ↔ CloudFront-URL cycle
Backend deploys first with permissive dev CORS; the frontend is built with the API URL and deployed; the backend is then redeployed with CORS locked to the CloudFront origin. Avoids a chicken-and-egg between the two outputs. *Rejected:* wildcard CORS left permanently (weaker; only the transient dev default).

## 9. Risks & Mitigations

- **Prisma engine on Lambda:** wrong `binaryTargets` → runtime failure. *Mitigation:* add the Lambda Linux target to `schema.prisma`, verify the engine is bundled in `sam build`, smoke-test `/metrics` post-deploy.
- **Public MySQL exposure:** *Mitigation:* TLS required, strong generated password, no real PII, dev-only, documented hardening follow-up; optionally narrow the 0.0.0.0/0 rule later.
- **CloudFront caching stale assets:** *Mitigation:* invalidation in the deploy script; content-hashed Next assets.
- **Per-route static paths (`/map`) 404 on CloudFront:** *Mitigation:* CloudFront Function rewrite to `index.html`; verify `/map` post-deploy.
- **Secret rotation/format drift (Prisma URL encoding):** *Mitigation:* compose the `url` field with URL-encoded password in the secret; test the connection before deploying the backend.
- **Cost left running:** *Mitigation:* micro/single-AZ sizing, teardown script, note to destroy when idle (NFR-6).
- **CLAUDE.md drift:** retiring `serverless.yml` without updating CLAUDE.md confuses future agents. *Mitigation:* update CLAUDE.md's IaC line in the same spec (T-1).

## 10. Test Plan Outline

Infrastructure verification is **command/probe-based** (all `--profile IBD-DEV`), captured in the runbook and per-task done-criteria:
- **Template validity:** `sam validate` / `aws cloudformation validate-template` for each stack; `cfn-lint` if available.
- **Provision checks:** `describe-stacks` shows `CREATE/UPDATE_COMPLETE`; required outputs present (FR-7).
- **RDS reachability:** `prisma migrate deploy` + seed succeed over TLS from the dev IP (FR-2).
- **API smoke:** `curl <ApiBaseUrl>/api/v1/metrics` and `/api/v1/actors` → `200`, PII-free, consent-gated JSON (FR-3, NFR-5).
- **Cognito:** `aws cognito-idp describe-user-pool` / `list-groups` show pool + admin/staff (FR-4).
- **Frontend:** CloudFront URL serves `/` and `/map`; S3 not publicly readable (`aws s3api get-public-access-block`); direct S3 object URL forbidden (FR-5).
- **End-to-end:** the live CloudFront site renders real seeded metrics/actors (not the fallback); browser CORS requests succeed from the CloudFront origin (FR-6).
- **Secrets hygiene:** repo grep shows no committed password/connection string; `DATABASE_URL` only via secret reference (NFR-2).
- **Teardown:** teardown script removes all three stacks and empties the bucket; `describe-stacks` returns not-found (FR-8, NFR-6).
- **No automated CI** in scope; checks are documented manual/script runs.
