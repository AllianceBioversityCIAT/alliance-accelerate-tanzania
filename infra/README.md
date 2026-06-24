# infra/ — ACCELERATE Tanzania dev AWS deployment (SAM / CloudFormation)

> Operator runbook — **filled by T-10.** This is the scaffold stub (T-1). The full
> deploy / migrate / frontend-deploy / set-cors / smoke / teardown runbook lands in T-10.

Infrastructure-as-Code for the **dev** environment, defined as **AWS SAM**
(a CloudFormation transform). Spec: `docs/specs/infra/aws-deployment/`.
Every AWS action uses **`--profile IBD-DEV`** in **`eu-west-1`** (NFR-1).

## Layout

```
infra/
├── 10-data-auth/   # RDS MySQL + Secrets Manager (T-2) + Cognito pool/client/groups (T-4)
├── 20-backend/     # NestJS Lambda + HTTP API (T-3)
├── 30-frontend/    # private S3 + CloudFront OAC (T-5)
├── scripts/        # deploy / migrate-seed / deploy-frontend / set-cors / smoke / teardown (T-6..T-10)
├── samconfig.toml  # shared SAM config (profile IBD-DEV, region eu-west-1)
└── README.md       # this runbook
```

## Deploy order (design.md §1)

The order resolves the API-URL ↔ CloudFront-URL coupling (FR-6, DD-6):

```
1. deploy 10-data-auth   → RDS endpoint + secret ARN + Cognito IDs (outputs)
2. prisma migrate deploy + seed   (dev machine → public RDS over TLS)
3. deploy 20-backend     → API base URL (output); CORS starts permissive in dev
4. build frontend (NEXT_PUBLIC_API_BASE_URL = API URL) → s3 sync → deploy 30-frontend → CloudFront URL
5. set-cors: redeploy 20-backend with AllowedOrigin = CloudFront URL  (lock CORS, FR-6)
```

> ⚠️ **Authoring vs live apply.** The SDD loop authors + locally validates the
> templates/scripts. The actual `sam deploy`, `prisma migrate deploy`, `s3 sync`,
> and teardown are **operator steps** run by the user with `IBD-DEV` credentials —
> they create real, billable AWS resources. No agent deploys to the live account.

## Conventions

Single source of truth for stack names, region, and shared parameters
(referenced by T-2..T-8).

| Item | Value |
|---|---|
| AWS profile | `IBD-DEV` (all commands; NFR-1) |
| Region | `eu-west-1` |
| Environment | `dev` (single stage) |

### Stack names

| Stack dir | CloudFormation stack name | Contents |
|---|---|---|
| `10-data-auth/` | `accelerate-tz-dev-data-auth` | RDS + Secrets Manager + Cognito |
| `20-backend/` | `accelerate-tz-dev-backend` | Lambda + HTTP API |
| `30-frontend/` | `accelerate-tz-dev-frontend` | S3 + CloudFront |

### Shared parameters

| Parameter | Used by | Meaning |
|---|---|---|
| `DevCidr` | 10-data-auth (T-2) | Operator public IP as a `/32` CIDR — the admin/migration ingress rule on `3306`. Supplied at deploy time (OQ-6). |
| `AllowedOrigin` | 20-backend (T-3, T-8) | CORS allow-origin for the HTTP API. Default `*` for the dev bootstrap; locked to the CloudFront URL in step 5 (FR-6, DD-6). |

### Cross-stack wiring (outputs → params)

`DbSecretArn` (10-data-auth output) → 20-backend (Lambda `DATABASE_URL` dynamic
reference). `ApiBaseUrl` (20-backend output) → frontend build env. `CloudFrontUrl`
(30-frontend output) → `AllowedOrigin` on the backend CORS-lock redeploy.
Full output table: design.md §3 / FR-7.
