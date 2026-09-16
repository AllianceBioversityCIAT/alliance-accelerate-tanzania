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

> **Only deploying needs the access above.** To run the stack locally you need **no AWS account
> at all** — `MAIL_TRANSPORT=no-op` and a local MySQL (`docs/infrastructure.md` §6). The one
> thing that genuinely requires AWS is **real email delivery**, and the minimum policy for that
> is `infra/policies/developer-local-test-policy.json` — SES send + sandbox verification +
> `ListUsersInGroup`, with no deploy rights.
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
| 3 | **PII boundary (NFR-5)** | Neither body contains any `NEVER_PUBLIC_FIELDS` key (`traderId`, `gpsAltitude`, `gpsAccuracy`, `registrationSource`, `consentMethod`, `consentObtainedAt`, `consentReference`, `technicalSupport`; case-insensitive, any depth) — **fail-closed**; **both** the `/actors` list body **and** `/metrics` additionally contain none of `CONTACT_BLOCK_FIELDS` (`contactPerson`, `position`, `phone`, `email`, `marketLocation`), which are required present only on the single-actor **detail** read for a `GRANTED` actor (FR-1) and so are excluded from that one assertion — not from `/metrics`; the script has no detail check today; and `/actors` is the PII-safe list contract (`{ data:[], page, pageSize, total }`). Mirrors `backend/src/common/pii-consent.policy.ts`'s `NEVER_PUBLIC_FIELDS`/`CONTACT_BLOCK_FIELDS` split, as asserted over HTTP by `backend/src/test/pii-boundary.spec.ts`. |
| 4 | **Frontend reachability (FR-5/6)** | CloudFront serves `/` and `/map` → 200 (the export's trailingSlash + the T-5 viewer-request rewrite resolve `/map`). |
| 5 | **S3 privacy (FR-5/DD-5)** | A direct S3 object URL (`https://<bucket>.s3.<region>.amazonaws.com/index.html`) → **403** — the bucket is private; only CloudFront via OAC may read it. A 200 here is a leak and FAILs. |

> ⚠️ **"Renders live data" is a final manual browser check.** The pages serve over
> HTTPS, but the actor/metrics DATA is fetched client-side by JS — curl sees the
> shell HTML, not the hydrated content. The script proves the API returns real,
> PII-safe data **and** the pages serve 200; the last step is to **open the
> CloudFront URL in a browser** and confirm the metrics band + map render **live
> seeded data** (not the offline "couldn't load" fallback) — FR-6.

> ⚠️ **Before T-9** (flipping `MailTransport` to `microservice`, §6/§7), the
> mail microservice secret still holds its deploy-time placeholders — see §7,
> "Mail microservice secret — operator runbook (T-8)", to write the real
> values first.

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
  stack (see section 8).

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

## 7. Mail microservice secret — operator runbook (T-8)

Spec: `docs/specs/enhancement/email-notification-microservice/` (FR-7, FR-8;
design.md §7.2, §7.3). `20-backend/template.yaml` declares
`MailMicroserviceSecret` with a **placeholder** JSON document —
`{"apiKey":"REPLACE_BEFORE_MICROSERVICE_DEPLOY","rabbitmqUrl":"<random>"}` — so
both `{{resolve:secretsmanager:...}}` references inside `ApiFunction` resolve
from the first deploy onward — a single-key secret would fail the whole stack
operation the moment CloudFormation tried to resolve the missing key, so the
template seeds both from the start (see the `MailMicroserviceSecret` comment
in `20-backend/template.yaml`). Before the deploy that flips `MailTransport`
to `microservice` (T-9), an operator MUST overwrite both placeholders with
real values.

### Write all three keys — in ONE call

⚠️ **`put-secret-value --secret-string` REPLACES THE WHOLE DOCUMENT — it is not
a merge.** Writing `{"rabbitmqUrl":"amqps://..."}` alone **silently deletes `apiKey`
and `queueName`**, and the very next resolve of a deleted key fails the whole
stack operation. Always write **all three** keys, in a **single** JSON
document, in a **single** `put-secret-value` call.

`queueName` joined the secret on 2026-09-16 at the product owner's direction.
It is not a credential — it grants no access without the broker URL — but it
discloses the platform's queue naming and which environment we target, which
does not belong in a repository. `EMAIL_SENDER` deliberately did **not** move:
it is the From header of every message the system sends, so it is public by
construction.

Do this as three separate steps — do not paste the placeholder edit as part
of a bigger block. The values are real broker/CLARISA credentials; pasting a
block that both writes the placeholders *and* calls `put-secret-value` in one
motion writes the literal placeholder strings to the live secret.

**1. Create the temp file and open it for editing.** `mktemp` creates the
file `0600` regardless of umask — the `umask 077` below is belt-and-braces,
not what actually restricts it. The `trap` guarantees the file is removed
even if you abort mid-edit (Ctrl-C, closed terminal) — this is the same
pattern `infra/10-data-auth/t9-enable-ses.sh` already uses for its own temp
file. The block below pre-fills the placeholder JSON, then hands control to
your editor; the shell will not read anything further until you save and
exit, so it cannot fall through to step 3 with placeholders still in place:

```bash
umask 077
SECRET_FILE="$(mktemp -t mail-secret.XXXXXX)"
trap 'rm -f "$SECRET_FILE"' EXIT

cat > "$SECRET_FILE" <<'EOF'
{
  "rabbitmqUrl": "amqps://<user>:<password>@<host>:5671/<vhost>",
  "apiKey": "<clarisa-issued-api-key>",
  "queueName": "<platform-team-queue-name>"
}
EOF

${EDITOR:-nano} "$SECRET_FILE"
```

**2. Replace both placeholders in the editor that just opened** —
`rabbitmqUrl` with the real platform-team broker URL, `apiKey` with the real
CLARISA-issued key — then save and exit to return to the shell.

**3. Write it — both keys, one call**, the exact secret name this stack
created: `${AWS::StackName}-mail-microservice-secret`:

```bash
aws secretsmanager put-secret-value \
  --profile IBD-DEV --region eu-west-1 \
  --secret-id accelerate-tz-dev-backend-mail-microservice-secret \
  --secret-string "file://$SECRET_FILE"
```

**4. Remove the temp file.** macOS ships no `shred`, and `rm -P` on APFS does
NOT guarantee an overwrite — copy-on-write means the original blocks are not
rewritten in place — so neither is a secure-erase equivalent here. The
property FR-7 actually asks for is that the value never enters shell
history, which step 1 already gives: `mktemp`'s `0600` file mode is the real
guarantee (a 700-mode `TMPDIR` is also true on macOS, but **not** on Linux,
where `/tmp` is typically world-writable `1777` — the file mode is what
holds on every platform, not the directory). A plain `rm -f` is an honest
description of what happens next; the `trap` from step 1 already covers the
abort case, so this is the normal-path cleanup:

```bash
rm -f "$SECRET_FILE"
```

### After writing the secret, confirm it actually took effect

⚠️ **A secret write alone forces no CloudFormation update.** CloudFormation
diffs the *unresolved* template + parameters to decide whether `ApiFunction`
needs updating, and only re-resolves dynamic references while it processes an
update to that resource. At T-9 the `MailTransport` flip is itself a real
parameter change, so the first write is covered by the normal deploy flow
(and in fact over-determined there — the transport flip, the placeholder
edits, and a new code artifact each force the update independently).

**A LATER correction or rotation is not covered.** Once the stack already
sits at `MailTransport=microservice` and nothing else changes, re-running
`deploy.sh` or `set-cors.sh` after a secret write produces an **empty
changeset** — both scripts pass `--no-fail-on-empty-changeset` — so the run
reports success while the **old, wrong secret value stays live** in the
Lambda's environment. The first flip is safe; a second correction is the
silent one.

To force the correction onto the live function directly (bypassing
CloudFormation's no-op skip, and without ever printing a secret to the
terminal):

⚠️ **`update-function-configuration --environment` is a full REPLACE, not a
merge.** Everything in `$ENV_FILE` becomes the function's entire environment;
anything missing from it is gone. Correctness rests entirely on `$ENV_FILE`
holding the **complete** current map, so the block below fetches the current
environment into a variable first — as both the merge source and a pre-flight
baseline — and refuses to apply a merge that came out smaller than what the
function already had. Note that **`$ENV_FILE` briefly holds every resolved
secret at rest**, not just the two being rotated — `DB_PASSWORD`,
`OTP_HMAC_SECRET`, `COGNITO_USER_POOL_ID`, all of it — which is exactly why
the `trap` below and the final `rm -f` matter here too:

```bash
set -o pipefail

FUNCTION_NAME=accelerate-tz-dev-backend-api
SECRET_ID=accelerate-tz-dev-backend-mail-microservice-secret

# Fetch the fresh secret value — captured to a variable, never printed.
SECRET_JSON="$(aws secretsmanager get-secret-value \
  --profile IBD-DEV --region eu-west-1 \
  --secret-id "$SECRET_ID" --query 'SecretString' --output text)"

# Fetch the function's CURRENT environment ONCE, into a variable — this is
# both the merge source and the pre-flight baseline, so a truncated/partial
# fetch is caught below rather than silently applied.
CURRENT_ENV_JSON="$(aws lambda get-function-configuration \
  --profile IBD-DEV --region eu-west-1 \
  --function-name "$FUNCTION_NAME" \
  --query 'Environment.Variables' --output json)"
CURRENT_KEY_COUNT="$(jq -r 'keys | length' <<<"$CURRENT_ENV_JSON")"

# Merge the secret into that environment (everything else stays as deployed)
# inside jq — nothing touches stdout.
ENV_FILE="$(mktemp -t lambda-env.XXXXXX)"
trap 'rm -f "$ENV_FILE"' EXIT
jq --argjson secret "$SECRET_JSON" \
    '{Variables: (. + {RABBITMQ_URL: $secret.rabbitmqUrl, MICROSERVICE_API_KEY: $secret.apiKey})}' \
    <<<"$CURRENT_ENV_JSON" > "$ENV_FILE"

# Pre-flight — TWO independent checks, because a corrupted baseline fetch
# can defeat a check that trusts it:
#   1. STATIC floor: the merge only ever ADDS/overwrites RABBITMQ_URL and
#      MICROSERVICE_API_KEY, so the result can read back as exactly 2 keys
#      only if $CURRENT_ENV_JSON was itself empty (or already just those 2
#      keys) — true regardless of what CURRENT_KEY_COUNT says, so this catches
#      the case where the CURRENT fetch ITSELF came back as valid-but-empty
#      JSON (a truncated/partial get-function-configuration that still parses
#      cleanly) — the one case the comparison below cannot see, because both
#      sides of that comparison would be corrupted together.
#   2. DYNAMIC comparison: the merged file must have AT LEAST as many keys as
#      the function had a moment ago — catches a non-empty-but-still-partial
#      fetch. Neither check alone is a full guarantee; together they abort
#      rather than silently drop DB_PASSWORD, OTP_HMAC_SECRET,
#      COGNITO_USER_POOL_ID, etc. and brick the API on the next command.
NEW_KEY_COUNT="$(jq -r '.Variables | keys | length' "$ENV_FILE")"
if (( NEW_KEY_COUNT <= 2 )); then
  echo "ABORT: merged environment has only $NEW_KEY_COUNT keys — the function's current environment came back empty. Refusing to apply." >&2
  exit 1
fi
if (( NEW_KEY_COUNT < CURRENT_KEY_COUNT )); then
  echo "ABORT: merged environment has $NEW_KEY_COUNT keys, function currently has $CURRENT_KEY_COUNT — refusing to apply a partial environment." >&2
  exit 1
fi

# --query is NOT cosmetic: unscoped, this call echoes the FULL
# FunctionConfiguration back — including the just-resolved RABBITMQ_URL and
# MICROSERVICE_API_KEY, and also DB_PASSWORD and OTP_HMAC_SECRET — into your
# terminal and scrollback. Nothing enters shell history either way, so this is
# not an FR-7 violation; it is this block's own "without ever printing a
# secret" promise, kept.
aws lambda update-function-configuration \
  --profile IBD-DEV --region eu-west-1 \
  --function-name "$FUNCTION_NAME" \
  --environment "file://$ENV_FILE" \
  --query 'LastUpdateStatus' --output text

rm -f "$ENV_FILE"
```

This is a direct, out-of-band patch of the live function, so it never
reverts `MailTransport` through a CloudFormation deploy, and the next real
template-driven deploy resolves the same secret and writes back the same
value — it does not fight this fix. That next deploy still shows
`ApiFunction` as a real update, though: `detect-stack-drift` **will** report
it as `MODIFIED` until then, because the *template's* view of
`Environment.Variables` genuinely differs from what is live. Only the
**value** converges, not CloudFormation's drift bookkeeping.

Then confirm the running configuration. For the T-9 `MailTransport` flip
specifically:

```bash
# ⚠️ Scoped to ONE variable. A BARE `get-function-configuration` prints
# EVERY environment variable — including the live RABBITMQ_URL and
# MICROSERVICE_API_KEY — to the terminal and scrollback. Never run it bare;
# always scope it with --query.
aws lambda get-function-configuration \
  --profile IBD-DEV --region eu-west-1 \
  --function-name accelerate-tz-dev-backend-api \
  --query "Environment.Variables.MAIL_TRANSPORT" --output text
```

This confirms the T-9 transport flip took effect — but it does **not**
confirm a LATER secret correction or rotation: `MAIL_TRANSPORT` is untouched
by that path, so it reads `microservice` before the patch above and
`microservice` after a *failed* one too. Checking it proves nothing about
whether the rotation landed. For the rotation path, compare a hash of the
live value against a hash of the secret instead — this checks the actual
credential without ever printing it:

```bash
LIVE_KEY_HASH="$(aws lambda get-function-configuration \
  --profile IBD-DEV --region eu-west-1 \
  --function-name accelerate-tz-dev-backend-api \
  --query 'Environment.Variables.MICROSERVICE_API_KEY' --output text \
  | shasum -a 256)"
SECRET_KEY_HASH="$(aws secretsmanager get-secret-value \
  --profile IBD-DEV --region eu-west-1 \
  --secret-id accelerate-tz-dev-backend-mail-microservice-secret \
  --query 'SecretString' --output text \
  | jq -r .apiKey | shasum -a 256)"
# Guard first: if BOTH calls fail (expired token, revoked access), each
# pipeline hashes empty input, the two digests are equal, and an unguarded
# comparison would print MATCH on total failure — a success message for a
# check that never ran. A single-sided failure already yields MISMATCH, which
# is the safe direction.
if [[ -z "$LIVE_KEY_HASH" || -z "$SECRET_KEY_HASH" ]]; then
  echo "INCONCLUSIVE — one or both lookups returned nothing; see the AWS error above." >&2
elif [[ "$LIVE_KEY_HASH" == "$SECRET_KEY_HASH" ]]; then
  echo "MATCH — rotation took effect."
else
  echo "MISMATCH — the old key is still live." >&2
fi
```

If `shasum`/`jq` are unavailable, `--query 'LastModified'` at least proves
*a* patch landed at the expected time — it does not prove which value
landed, so prefer the hash comparison when you can.

### Where the values come from

`RABBITMQ_URL` and `MICROSERVICE_API_KEY` are secrets held by the **platform
team** and **CLARISA** respectively (design.md §4.5) — never the repo, never
a template literal. `EMAIL_QUEUE_NAME` and `EMAIL_SENDER` are not secrets but their real
values are likewise held by the platform team; `20-backend/template.yaml`
carries `REPLACE_WITH_PLATFORM_TEAM_...` placeholders for both that must be
edited to the real values and committed before the T-9 deploy.

---

## 8. Outputs (where the wiring values come from)

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

## 9. Cost notes (NFR-6 — keep it cheap, destroy when idle)

The footprint is deliberately small and disposable:

- **RDS** — `db.t3.micro`, **single-AZ**, ~20 GB storage. The largest standing
  cost; an idle micro instance still bills hourly.
- **CloudFront** — `PriceClass_100` (cheapest edge footprint); pay-per-use,
  negligible at dev traffic.
- **Lambda + HTTP API** — pay-per-invocation, low memory/reserved concurrency;
  effectively free when idle.
- **S3 + Secrets Manager** — pennies (a few MB of static assets + one secret).

**Destroy the environment when you're not actively using it** — RDS is the reason.
Run `teardown.sh` (section 10) to remove everything so nothing lingers or bills.

---

## 10. Teardown (destroy everything)

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

## 11. Hardening follow-up (`infra/network-hardening`)

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
data only), and **easy teardown** (section 10).
