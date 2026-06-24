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

## DB migrate + seed

Operator step **2** of the deploy order (run once, after `10-data-auth` is
deployed). `infra/scripts/migrate-seed.sh` resolves the RDS wiring from the
data-auth stack outputs, reads the DB credentials from Secrets Manager, composes
the Prisma `DATABASE_URL` **in-process** (TLS on, URL-encoded password — never
written to a file/`.env` or printed; NFR-2/NFR-5), then runs `prisma migrate
deploy` and seeds the consented sample (no real PII) from `backend/`.

**Prereqs:** `10-data-auth` deployed (`CREATE_COMPLETE`); your public IP/32 in the
RDS security group (the `DevCidr` ingress rule); `jq`, AWS CLI v2, Node 20, and
backend deps installed (`cd backend && npm ci`); valid `IBD-DEV` credentials.

```bash
./infra/scripts/migrate-seed.sh
```

Defaults to `--profile IBD-DEV` / `eu-west-1` / stack `accelerate-tz-dev-data-auth`;
override via `AWS_PROFILE` / `AWS_REGION` / `DATA_AUTH_STACK`. A non-`IBD-DEV`
profile triggers a confirmation guard (interactive `yes` or `CONFIRM=yes`). The
full runbook (deploy → migrate → frontend → CORS → smoke → teardown) is in T-10.

## Deploy + validate scripts (T-7)

- **`infra/scripts/validate.sh`** — local, no-cost gate: runs `sam validate --lint`
  on all three templates and prints a per-stack PASS/FAIL summary. Safe to run
  anytime (no apply). `./infra/scripts/validate.sh`.
- **`infra/scripts/deploy.sh`** — operator orchestration of the deploy order
  (design.md §1 / DD-6): step 1 `10-data-auth` (auto-detects `VpcId`/`DevCidr`,
  override via `VPC_ID`/`DEV_CIDR`), then **pauses** for the operator to run
  `migrate-seed.sh` (step 2), then `sam build` + deploy `20-backend` (step 3),
  then `30-frontend` (step 4). Prints each stack's outputs to stdout (non-secret;
  the DB password is never read or printed — NFR-2). Idempotent re-deploys via
  change sets (NFR-7). Frontend build/sync + CORS lock (steps 4b–5) are T-8.
  `./infra/scripts/deploy.sh` (creates real, billable resources — operator only).

## Frontend deploy + CORS lock (T-8)

Run these after `deploy.sh` (all three stacks up) and `migrate-seed.sh`, in order
(design.md §1 steps 4b–5 / DD-6):

- **`infra/scripts/deploy-frontend.sh`** — resolves `ApiBaseUrl` (20-backend) and
  `FrontendBucketName` + `CloudFrontUrl` (30-frontend) from stack outputs, derives
  the CloudFront distribution Id from the domain, then builds the static export with
  `NEXT_PUBLIC_API_BASE_URL=<ApiBaseUrl>` (build-time injection), `aws s3 sync out/
  → s3://<bucket> --delete`, and a `/*` CloudFront invalidation. Override resolution
  via `API_BASE_URL` / `DISTRIBUTION_ID`. `./infra/scripts/deploy-frontend.sh`.
- **`infra/scripts/set-cors.sh`** — locks backend CORS (FR-6): resolves
  `CloudFrontUrl` (30-frontend output; override via `CLOUDFRONT_URL`), then
  `sam build` + `sam deploy` 20-backend with `AllowedOrigin=<CloudFrontUrl>`.
  `./infra/scripts/set-cors.sh`.

Both default to `--profile IBD-DEV` / `eu-west-1` and create/alter real resources —
operator only, not run by the SDD agent loop.

## End-to-end smoke (T-9)

`infra/scripts/smoke.sh` is the final gate (FR-6, FR-8, NFR-5). It probes the
**live** stacks and re-asserts the PII/consent boundary **over the wire** — the
spec's headline guarantee (NFR-5) — plus frontend reachability and S3 privacy.

**Prereqs (the full deploy order must be done first):** all three stacks deployed
(`deploy.sh`), `migrate-seed.sh` run (RDS seeded with the consented sample — no
real PII), frontend built/synced (`deploy-frontend.sh`), and CORS locked to the
CloudFront origin (`set-cors.sh`). Needs AWS CLI v2, `jq`, `curl`, and valid
`IBD-DEV` credentials (only for the two `describe-stacks` lookups — curl hits the
public HTTPS endpoints directly, no profile).

```bash
./infra/scripts/smoke.sh
```

Defaults to `--profile IBD-DEV` / `eu-west-1`; resolves `ApiBaseUrl`,
`CloudFrontUrl`, and `FrontendBucketName` from the stack outputs (override via
`API_BASE_URL` / `CLOUDFRONT_URL` / `BUCKET`). It prints a PASS/FAIL line per
check and exits non-zero if **any** check fails. The checks:

| # | Check | Asserts |
|---|---|---|
| 2 | **API health (FR-6)** | `GET /api/v1/metrics` and `/api/v1/actors` → HTTP 200 with valid JSON. |
| 3 | **PII boundary (NFR-5)** | Neither body contains any PII key (`phone`, `email`, `sex`, `position`, `marketLocation`; case-insensitive, any depth) — **fail-closed**; and `/actors` is the PII-safe list contract (`{ data:[], page, pageSize, total }`). Mirrors `backend/src/test/pii-boundary.spec.ts` over the wire. |
| 4 | **Frontend reachability (FR-5/6)** | CloudFront serves `/` and `/map` → 200 (the export's trailingSlash + the T-5 viewer-request rewrite resolve `/map`). |
| 5 | **S3 privacy (FR-5/DD-5)** | A direct S3 object URL (`https://<bucket>.s3.<region>.amazonaws.com/index.html`) → **403** — the bucket is private; only CloudFront via OAC may read it. A 200 here is a leak and FAILs. |

> ⚠️ **"Renders live data" is a final manual browser check.** The pages serve over
> HTTPS, but the actor/metrics DATA is fetched client-side by JS — curl sees the
> shell HTML, not the hydrated content. The script proves the API returns real,
> PII-safe data **and** the pages serve 200; the last step is to open the
> CloudFront URL in a browser and confirm the metrics band + map render **live
> seeded data** (not the offline "couldn't load" fallback) — FR-6.
