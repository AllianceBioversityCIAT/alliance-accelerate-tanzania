# infra/ — ACCELERATE Tanzania dev AWS deployment (SAM / CloudFormation)

> **Operator runbook** for the **dev** AWS environment, defined as
> Infrastructure-as-Code (**AWS SAM**, a CloudFormation transform). Spec:
> `docs/specs/infra/aws-deployment/`. This is the end-to-end deploy → operate →
> destroy guide (FR-8).
>
> Every AWS action uses **`--profile IBD-DEV`** in **`eu-west-1`** (NFR-1).

The environment runs the whole app: an **RDS MySQL** database, the **NestJS
backend on Lambda + API Gateway (HTTP API)**, **Cognito** identities, and the
**Next.js static export on S3 + CloudFront**. It is intentionally minimal —
default VPC only, no custom domain (the CloudFront `*.cloudfront.net` URL *is*
the app URL), no NAT / RDS Proxy / CI.

> ⚠️ **Authoring vs live apply.** The SDD Implementer/Reviewer loop **authored and
> locally validated** these templates and scripts (`sam validate`, `cfn-lint`,
> `bash -n`, `shellcheck`, greps). The actual `sam deploy`, `prisma migrate
> deploy`, `s3 sync`, CORS lock, smoke, and **teardown** are **operator steps**
> the **user** runs with `IBD-DEV` credentials — they create real, billable,
> outward-facing AWS resources. **No agent deploys to or deletes from the live
> account.** Each script header repeats this boundary.

---

## 1. Layout

```
infra/
├── 10-data-auth/   # RDS MySQL + Secrets Manager (T-2) + Cognito pool/client/groups (T-4)
├── 20-backend/     # NestJS Lambda + HTTP API (T-3)
├── 30-frontend/    # private S3 + CloudFront OAC (T-5)
├── scripts/        # validate / deploy / migrate-seed / deploy-frontend / set-cors / smoke / teardown
├── samconfig.toml  # shared SAM config (profile IBD-DEV, region eu-west-1)
└── README.md       # this runbook
```

---

## 2. Prerequisites

Before the first deploy you need:

- **`IBD-DEV` credentials** with permission to create/delete RDS, Lambda, API
  Gateway, Cognito, S3, CloudFront, IAM, Secrets Manager, and CloudFormation
  stacks in `eu-west-1` (NFR-1; no static keys committed — NFR-2).
- **AWS SAM CLI** and **AWS CLI v2**.
- **`jq`** (scripts parse stack outputs / the DB secret with it).
- **Node 20** (backend build + Prisma; frontend static export).
- An available **default VPC** with public subnets in `eu-west-1` (auto-detected
  by `deploy.sh`, or pass `VPC_ID`).
- Project deps installed: `cd backend && npm ci` and `cd frontend && npm ci`.

---

## 3. Conventions (single source of truth)

Stack names, region, and shared parameters referenced by every script/template.

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
| `DevCidr` | 10-data-auth (T-2) | Operator public IP as a `/32` CIDR — the admin/migration ingress rule on `3306`. Auto-detected at deploy time (OQ-6), override via `DEV_CIDR`. |
| `AllowedOrigin` | 20-backend (T-3, T-8) | CORS allow-origin for the HTTP API. Default `*` for the dev bootstrap; locked to the CloudFront URL in step 5 (FR-6, DD-6). |

### Cross-stack wiring (outputs → params)

`DbSecretArn` (10-data-auth output) → 20-backend (Lambda `DATABASE_URL` dynamic
reference). `ApiBaseUrl` (20-backend output) → frontend build env. `CloudFrontUrl`
(30-frontend output) → `AllowedOrigin` on the backend CORS-lock redeploy. Because
the 20-backend stack **imports** the 10-data-auth exports, that dependency dictates
the deploy order below — and the **reverse** order at teardown.

---

## 4. Validate (local, no-cost gate)

Run any time — this applies nothing and costs nothing:

```bash
./infra/scripts/validate.sh
```

`validate.sh` runs `sam validate --lint` on all three templates and prints a
per-stack PASS/FAIL summary. Run it before every deploy.

---

## 5. Deploy → operate (the full flow)

Run these **in order**. The order resolves the API-URL ↔ CloudFront-URL coupling
(FR-6, DD-6): the backend deploys with permissive dev CORS, the frontend is built
with the API URL, then the backend is redeployed with CORS locked to the
CloudFront origin.

```
1. deploy 10-data-auth   → RDS endpoint + secret ARN + Cognito IDs (outputs)
2. prisma migrate deploy + seed   (dev machine → public RDS over TLS)
3. deploy 20-backend     → API base URL (output); CORS starts permissive in dev
4. deploy 30-frontend, then build+sync the static export → CloudFront URL
5. set-cors: redeploy 20-backend with AllowedOrigin = CloudFront URL  (lock CORS)
6. smoke: probe the live stack end-to-end (incl. PII boundary over the wire)
```

### Step 1 + 3 + 4 — deploy the stacks

```bash
./infra/scripts/deploy.sh
```

`deploy.sh` orchestrates the ordered, idempotent deploy (change sets — NFR-7):

- **[1/4]** `10-data-auth` — auto-detects `VpcId` (default VPC) and `DevCidr`
  (your public IP/32); override via `VPC_ID` / `DEV_CIDR`.
- **[2/4]** **pauses** for you to run `migrate-seed.sh` (step 2 below) in another
  shell; on a non-TTY it instructs-and-continues (or set `SKIP_MIGRATE_PAUSE=yes`).
- **[3/4]** `sam build` + deploy `20-backend` (CORS `AllowedOrigin` defaults to
  `*` for the dev bootstrap).
- **[4/4]** deploy `30-frontend`.

After each stack it prints that stack's CloudFormation **outputs** to stdout. The
DB password is never read or printed (NFR-2). `deploy.sh` creates real, billable
resources — operator only.

### Step 2 — DB migrate + seed (run once, after step 1)

```bash
./infra/scripts/migrate-seed.sh
```

`migrate-seed.sh` resolves the RDS wiring from the data-auth stack outputs, reads
the DB credentials from **Secrets Manager**, composes the Prisma `DATABASE_URL`
**in-process** (TLS on via `sslaccept=strict`, URL-encoded password — never
written to a file/`.env` or printed; NFR-2/NFR-4/NFR-5), then runs
`prisma migrate deploy` and seeds the **consented sample** (no real PII) from
`backend/`.

**Prereqs:** `10-data-auth` deployed (`CREATE_COMPLETE`); your public IP/32 in the
RDS security group (the `DevCidr` ingress rule); `jq`, AWS CLI v2, Node 20, and
backend deps installed (`cd backend && npm ci`). Defaults to `--profile IBD-DEV` /
`eu-west-1` / stack `accelerate-tz-dev-data-auth` (override via `AWS_PROFILE` /
`AWS_REGION` / `DATA_AUTH_STACK`). A non-`IBD-DEV` profile triggers a confirmation
guard (interactive `yes` or `CONFIRM=yes`).

### Step 4 (cont.) — build + deploy the frontend

```bash
./infra/scripts/deploy-frontend.sh
```

`deploy-frontend.sh` resolves `ApiBaseUrl` (20-backend) and `FrontendBucketName` +
`CloudFrontUrl` (30-frontend) from stack outputs, derives the CloudFront
distribution Id from the domain, then builds the static export with
`NEXT_PUBLIC_API_BASE_URL=<ApiBaseUrl>` (build-time injection), runs
`aws s3 sync out/ → s3://<bucket> --delete`, and a `/*` CloudFront invalidation.
Override resolution via `API_BASE_URL` / `DISTRIBUTION_ID`.

### Step 5 — lock CORS to the CloudFront origin

```bash
./infra/scripts/set-cors.sh
```

`set-cors.sh` locks backend CORS (FR-6): resolves `CloudFrontUrl` (30-frontend
output; override via `CLOUDFRONT_URL`), then `sam build` + `sam deploy` 20-backend
with `AllowedOrigin=<CloudFrontUrl>`. After this, only the real app origin is
allowed.

### Step 6 — end-to-end smoke

```bash
./infra/scripts/smoke.sh
```

`smoke.sh` is the final gate (FR-6, FR-8, NFR-5). It probes the **live** stacks
and re-asserts the PII/consent boundary **over the wire** — the spec's headline
guarantee — plus frontend reachability and S3 privacy. It resolves `ApiBaseUrl`,
`CloudFrontUrl`, and `FrontendBucketName` from the stack outputs (override via
`API_BASE_URL` / `CLOUDFRONT_URL` / `BUCKET`), prints a PASS/FAIL line per check,
and exits non-zero if **any** check fails:

| # | Check | Asserts |
|---|---|---|
| 2 | **API health (FR-6)** | `GET /api/v1/metrics` and `/api/v1/actors` → HTTP 200 with valid JSON. |
| 3 | **PII boundary (NFR-5)** | Neither body contains any PII key (`phone`, `email`, `sex`, `position`, `marketLocation`; case-insensitive, any depth) — **fail-closed**; and `/actors` is the PII-safe list contract (`{ data:[], page, pageSize, total }`). Mirrors `backend/src/test/pii-boundary.spec.ts` over the wire. |
| 4 | **Frontend reachability (FR-5/6)** | CloudFront serves `/` and `/map` → 200 (the export's trailingSlash + the T-5 viewer-request rewrite resolve `/map`). |
| 5 | **S3 privacy (FR-5/DD-5)** | A direct S3 object URL (`https://<bucket>.s3.<region>.amazonaws.com/index.html`) → **403** — the bucket is private; only CloudFront via OAC may read it. A 200 here is a leak and FAILs. |

> ⚠️ **"Renders live data" is a final manual browser check.** The pages serve over
> HTTPS, but the actor/metrics DATA is fetched client-side by JS — curl sees the
> shell HTML, not the hydrated content. The script proves the API returns real,
> PII-safe data **and** the pages serve 200; the last step is to **open the
> CloudFront URL in a browser** and confirm the metrics band + map render **live
> seeded data** (not the offline "couldn't load" fallback) — FR-6.

---

## 6. Email (SES) setup — two-phase Cognito → SES enablement

Spec: `docs/specs/bugfix/admin-user-invite-and-reset/` (§7.1–§7.3, §11).

**Purpose.** Cognito's transactional emails — the admin **invitation** (first
sign-in) and the **password-reset code** — are sent via **Amazon SES in
`DEVELOPER` mode** from a project-controlled, SES-verified sender, replacing the
`COGNITO_DEFAULT` mailer (`no-reply@verificationemail.com`, rate-capped, poor
reputation). This fixes deliverability to `cgiar.org` inboxes (FR-1). The
`10-data-auth/template.yaml` gains three params for this:

| Parameter | Default | Meaning |
|---|---|---|
| `SenderEmail` | `""` | Project sender address to verify in SES. Empty → keep `COGNITO_DEFAULT` (safe no-op). |
| `EnableSesSending` | `"false"` | Phase-B gate. `"true"` (with `SenderEmail` set) flips the pool's `EmailConfiguration` to `DEVELOPER`. |
| `PortalUrl` | current dev CloudFront URL | Admin portal base URL for the invitation email CTA (`/login` is appended). |

The two gates (`SenderEmail` non-empty, and `EnableSesSending=true`) exist to
force a **two-phase rollout**: the SES sending-authorization policy needs the
user-pool ARN, while the pool's `DEVELOPER` config needs the authorized identity
— a circular dependency a single change set cannot satisfy. Run the phases **in
order**; Phase B only succeeds after Phase A's verify + authorize steps.

Validate first (no cost): `./infra/scripts/validate.sh`.

### Phase A — create + verify + authorize the sender (no DEVELOPER switch yet)

The branded email templates install immediately; the `DEVELOPER`
`EmailConfiguration` stays gated off, so the pool keeps `COGNITO_DEFAULT` through
this whole phase.

**A-1. Deploy `10-data-auth` with the sender set but SES sending disabled.** This
creates the `AWS::SES::EmailIdentity` (which triggers AWS's verification email)
and installs the invite + reset templates; the pool email stays
`COGNITO_DEFAULT`.

```bash
sam deploy --template infra/10-data-auth/template.yaml \
  --stack-name accelerate-tz-dev-data-auth \
  --parameter-overrides VpcId=<vpc-id> DevCidr=<your-ip>/32 \
    SenderEmail=<sender-addr> EnableSesSending=false \
  --profile IBD-DEV --region eu-west-1
```

**A-2. Verify the sender identity (DEP-1).** Open the mailbox of `<sender-addr>`
and click the SES verification link AWS just emailed. The identity must reach
`Verified` before Phase B.

**A-3. Attach the Cognito sending-authorization policy.** `DEVELOPER` mode means
Cognito sends *through* your SES identity, which AWS permits **only** if that
identity carries a sending-authorization policy naming the Cognito service
principal (`email.cognito-idp.amazonaws.com`). The SES console adds this
automatically, but **CloudFormation cannot express it** (`AWS::SES::EmailIdentity`
has no policy property and there is no native `AWS::SES::IdentityPolicy`
resource) — so the operator attaches it once via the SES v1 API:

```bash
aws ses put-identity-policy --identity <sender-addr> --policy-name cognito-send \
  --policy file://infra/10-data-auth/ses-cognito-send-policy.json \
  --profile IBD-DEV --region eu-west-1
```

Before running it, edit `infra/10-data-auth/ses-cognito-send-policy.json` and
replace its placeholders:

- `<ACCOUNT_ID>` — from `aws sts get-caller-identity --profile IBD-DEV --region eu-west-1`.
- `<SENDER_EMAIL>` — the `<sender-addr>` you verified in A-2.
- `<USER_POOL_ARN>` — `arn:aws:cognito-idp:eu-west-1:<ACCOUNT_ID>:userpool/<UserPoolId>`,
  where `<UserPoolId>` is the `UserPoolId` output of the `accelerate-tz-dev-data-auth`
  stack (see section 7).

If this policy is missing, the Phase-B update is rejected with
`InvalidEmailRoleAccessPolicyException` (or, worst case, every send fails
authorization at runtime and FR-1 stays broken) — it is the load-bearing step.

### Phase B — flip the pool to DEVELOPER

**B-1. Re-deploy `10-data-auth` with SES sending enabled.** This is an **in-place
`UserPool` update (no replacement)** that sets `EmailConfiguration: DEVELOPER`.
It now succeeds because the identity is verified **and** authorized:

```bash
sam deploy --template infra/10-data-auth/template.yaml \
  --stack-name accelerate-tz-dev-data-auth \
  --parameter-overrides VpcId=<vpc-id> DevCidr=<your-ip>/32 \
    SenderEmail=<sender-addr> EnableSesSending=true \
  --profile IBD-DEV --region eu-west-1
```

After this, invites and reset codes send via SES from `<sender-addr>`.

### SES sandbox caveat (DEP-2)

This account's SES is in **sandbox** — it delivers **only to verified recipient
addresses** until AWS grants production access. Do this **before** a real
rollout. For dev testing, verify each recipient address:

```bash
aws ses verify-email-identity --email-address <recipient-addr> \
  --profile IBD-DEV --region eu-west-1
```

(each recipient clicks their own verification link), **or** request SES
production access for the account so any recipient can receive mail.

### Reversibility (rollback)

Re-deploy `10-data-auth` with `EnableSesSending=false` (or `SenderEmail=""`) to
revert the pool to `COGNITO_DEFAULT`:

```bash
sam deploy --template infra/10-data-auth/template.yaml \
  --stack-name accelerate-tz-dev-data-auth \
  --parameter-overrides VpcId=<vpc-id> DevCidr=<your-ip>/32 \
    SenderEmail=<sender-addr> EnableSesSending=false \
  --profile IBD-DEV --region eu-west-1
```

Caveat: the branded, table-based HTML templates render best via SES; the
`COGNITO_DEFAULT` mailer's HTML handling is limited, so a reverted pool still
*sends* but may look degraded — an acceptable rollback state.

### Known limitation — CONFIRMED-user reset code has no in-app entry page (OQ-5)

A **CONFIRMED** user's reset uses the forgot-password flow
(`AdminResetUserPassword` + `CONFIRM_WITH_CODE`), which emails a numeric **code**
the user would enter on a "set new password" screen. The app currently ships
**no** forgot-password / code-entry page, so that reset path **dead-ends in the
UI** (pre-existing behavior — this change only makes the email correct and
branded). The **invite / first-sign-in** path (`FORCE_CHANGE_PASSWORD`, served by
re-invite semantics) **is fully usable** end to end. Building the code-entry page
is a separate fast-follow (OQ-5), out of scope here.

---

## 7. Outputs (where the wiring values come from)

The deploy emits CloudFormation **outputs** (FR-7) — the values needed to wire and
operate the app. `deploy.sh` prints them per stack; you can re-read them any time:

```bash
aws cloudformation describe-stacks \
  --stack-name accelerate-tz-dev-backend \
  --query "Stacks[0].Outputs" --output table \
  --profile IBD-DEV --region eu-west-1
```

| Output | Source stack | Consumed by |
|---|---|---|
| `CloudFrontUrl` | 30-frontend | operator; backend CORS lock (step 5) |
| `ApiBaseUrl` | 20-backend | frontend build (`NEXT_PUBLIC_API_BASE_URL`) |
| `UserPoolId`, `UserPoolClientId` | 10-data-auth | future auth-wiring spec |
| `RdsEndpoint`, `DbSecretArn` | 10-data-auth | migrate/seed; backend Lambda env |
| `FrontendBucketName` | 30-frontend | frontend sync; teardown bucket-empty |

---

## 8. Cost notes (NFR-6 — keep it cheap, destroy when idle)

The footprint is deliberately small and disposable:

- **RDS** — `db.t3.micro`, **single-AZ**, ~20 GB storage. The largest standing
  cost; an idle micro instance still bills hourly.
- **CloudFront** — `PriceClass_100` (cheapest edge footprint); pay-per-use,
  negligible at dev traffic.
- **Lambda + HTTP API** — pay-per-invocation, low memory/reserved concurrency;
  effectively free when idle.
- **S3 + Secrets Manager** — pennies (a few MB of static assets + one secret).

**Destroy the environment when you're not actively using it** — RDS is the reason.
Run `teardown.sh` (section 9) to remove everything so nothing lingers or bills.

---

## 9. Teardown (destroy everything)

```bash
./infra/scripts/teardown.sh                 # interactive — prompts to type 'yes'
CONFIRM=yes ./infra/scripts/teardown.sh     # non-interactive confirmation
```

`teardown.sh` is **destructive and irreversible** — it permanently deletes the dev
RDS database (and its data), the Lambda/API, the Cognito pool, the S3 content, and
the CloudFront distribution (FR-8, NFR-6). It guards and orders the destruction:

- **Confirmation guard:** requires `CONFIRM=yes` or typing `yes`/`destroy` at an
  interactive prompt; it **refuses to run unattended** (non-TTY with no `CONFIRM`).
  A non-`IBD-DEV` profile triggers the same IBD-DEV warning/confirm as the other
  scripts.
- **Empties the frontend bucket first** — CloudFormation cannot delete a non-empty
  S3 bucket, so it resolves `FrontendBucketName` from the 30-frontend outputs and
  `aws s3 rm --recursive` before deleting that stack.
- **Deletes in REVERSE of the deploy order — `30-frontend` → `20-backend` →
  `10-data-auth`** — because 20-backend imports 10-data-auth's exports, so
  CloudFormation refuses to delete data-auth while backend exists.
- **Idempotent / re-runnable** — tolerates an already-absent stack/bucket, so a
  re-run finishes a partial teardown.

Verify nothing remains:

```bash
aws cloudformation describe-stacks \
  --stack-name accelerate-tz-dev-data-auth \
  --profile IBD-DEV --region eu-west-1
# → should report the stack does not exist
```

---

## 10. Hardening follow-up (`infra/network-hardening`)

This dev bootstrap intentionally trades production posture for a minimal, cheap,
easy-to-deploy footprint (DD-1/DD-2/DD-3, NFR-3). The deferred hardening — to be
specified separately as **`infra/network-hardening`** — covers:

- **Lambda-in-VPC** with **private RDS** (no public DB endpoint; drop the
  `0.0.0.0/0:3306` ingress rule).
- **VPC endpoints / NAT** for the now-private Lambda's egress (Secrets Manager,
  Cognito JWKS, AWS SDK calls).
- **RDS Proxy** for connection pooling under higher concurrency.
- **RDS IAM authentication** (replace the long-lived Secrets Manager password).

Until then, the public RDS endpoint is mitigated by **TLS-required** connections, a
**strong generated password** in Secrets Manager, **no real PII** (consented sample
data only), and **easy teardown** (section 9).
