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
> at all** — `MAIL_TRANSPORT=no-op` and a local MySQL (`docs/infrastructure.md` §6). Mail
> delivery itself doesn't need AWS either: `MAIL_TRANSPORT=microservice` sends through the
> external OneCGIAR notification microservice over RabbitMQ, not SES (`enhancement/
> email-notification-microservice`, T-10 removed the SES transport). The one thing that
> genuinely still requires AWS is resolving the contact form's admin recipients against a
> **live Cognito user pool** (`AdminRecipientResolver`'s `ListUsersInGroup` call), and the
> minimum policy for that is `infra/policies/developer-local-test-policy.json` —
> `cognito-idp:ListUsersInGroup` plus read-only `cloudformation:DescribeStacks` /
> `sts:GetCallerIdentity` to look up stack outputs, with no deploy rights.
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
| `PortalUrl` | 10-data-auth, `bugfix/admin-user-invite-and-reset` §7.1 | Admin portal base URL used in the invitation email CTA (`/login` is appended). Default is the current dev CloudFront URL. |

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
- **[3/4]** `sam build` + deploy `20-backend`, passing `AllowedOrigin`
  resolved from the live `30-frontend` `CloudFrontUrl`; on a true first-time
  bootstrap the frontend stack does not exist yet and `*` is passed and
  announced on stderr, then locked in step 5.
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
**in-process** (TLS on via `sslaccept=accept_invalid_certs` — encrypted, but the
RDS server certificate chain is **not** verified, per the script's own TLS-posture
comment; URL-encoded password — never written to a file/`.env` or printed;
NFR-2/NFR-4/NFR-5), then runs `prisma migrate deploy` and seeds the **consented
sample** (no real PII) from `backend/`.

**Prereqs:** `10-data-auth` deployed (`CREATE_COMPLETE`); your public IP/32 in the
RDS security group (the `DevCidr` ingress rule); `jq`, AWS CLI v2, Node 20, and
backend deps installed (`cd backend && npm ci`). Defaults to `--profile IBD-DEV` /
`eu-west-1` / stack `accelerate-tz-dev-data-auth` (override via `AWS_PROFILE` /
`AWS_REGION` / `DATA_AUTH_STACK`). A non-`IBD-DEV` profile now **aborts** rather
than proceeding — `CONFIRM` no longer authorises it. The only way to run against
another profile is `AWS_PROFILE=<profile> ALLOW_NON_IBD_DEV_PROFILE=<profile>`,
naming the same profile in both, which announces the override on stderr
(`infra/scripts/_guard.sh`, `bugfix/deploy-script-guardrails`).

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
| 6 | **CORS boundary (FR-6)** | A genuine preflight (`OPTIONS` + `Origin` + `Access-Control-Request-Method`) from a disallowed origin against `/api/v1/actors` must get a real rejection: FAILs on a permissive `Access-Control-Allow-Origin: *`, on the disallowed origin being echoed back, on a refused connection, or on a non-2xx/5xx response with no ACAO header; PASSes only on a clean 2xx/204 rejection with no ACAO at all. Added by `bugfix/deploy-script-guardrails` (T-6) — this is the check that catches the fail-open CORS gap documented in `docs/infrastructure.md` §3. |

> ⚠️ **"Renders live data" is a final manual browser check.** The pages serve over
> HTTPS, but the actor/metrics DATA is fetched client-side by JS — curl sees the
> shell HTML, not the hydrated content. The script proves the API returns real,
> PII-safe data **and** the pages serve 200; the last step is to **open the
> CloudFront URL in a browser** and confirm the metrics band + map render **live
> seeded data** (not the offline "couldn't load" fallback) — FR-6.

> ⚠️ **Before T-9** (flipping `MailTransport` to `microservice`), the
> mail microservice secret still holds its deploy-time placeholders — see §7,
> "Mail microservice secret — operator runbook (T-8)", to write the real
> values first.

---

## 6. `/forgot-password` now sends through Cognito's own mailer

*(This section held the two-phase Cognito → SES email setup runbook. SES is
removed from this stack — `docs/specs/enhancement/email-notification-microservice/`
FR-6 — so the pool's `EmailConfiguration` is now unconditionally
`COGNITO_DEFAULT`, with no params, no identity, no sandbox/verification steps,
and nothing here left to operate. The section that used to sit here — a
"reset code has no in-app entry page" limitation (OQ-5) — is **gone**, not
carried forward: that page shipped and OQ-5 closed on 2026-07-18
(`docs/specs/archive/2026-07-18-auth--forgot-password/archive-summary.md`),
so `frontend/app/(public)/forgot-password/page.tsx` /
`frontend/components/auth/ForgotPasswordForm.tsx` are the live code-entry
screen today — restating the old limitation here would just be wrong.)*

The self-service reset flow (`ForgotPasswordForm` → `resetPassword` /
`confirmResetPassword` in `frontend/lib/auth/auth-client.ts` → Cognito's
`ForgotPassword` API) is the **principal** remaining consumer of the pool's
`VerificationMessageTemplate` — the branded, table-based HTML at
`infra/10-data-auth/template.yaml`. **Two of the three** admin
user-management paths (`backend/src/users/users.service.ts`) do not reach
it: `create()` passes
`MessageAction: 'SUPPRESS'` to `AdminCreateUser` and pre-verifies the
address, and `resetPassword()` uses `AdminSetUserPassword`
(`Permanent: false`), which sends no mail at all. One admin path is **not**
established as silent: `update()` changes `email` via
`AdminUpdateUserAttributes` without setting `email_verified`, and the pool
auto-verifies `email` (`AutoVerifiedAttributes`) — that API takes no
`MessageAction`, so it may emit a verification message from this same
template. Untested here.

Two facts this repo recorded about `COGNITO_DEFAULT` during the retired SES
rollout, carried forward here as live operational facts (not independently
re-measured for this change):

- It sends from `no-reply@verificationemail.com`, a shared AWS address that
  is rate-capped and has a poor sending reputation — a real deliverability
  risk to `cgiar.org` inboxes.
- Its HTML handling is more limited than SES's; the branded, table-based
  reset-code email above was authored and tuned against SES, so under
  `COGNITO_DEFAULT` it may render degraded in some mail clients. See the
  matching note on `EmailConfiguration` in `infra/10-data-auth/template.yaml`.

Neither has a fix in this repo today — flagging for whoever next owns
`/forgot-password` deliverability or the reset-code template.

---

## 7. Mail microservice secret — operator runbook (T-8)

Spec: `docs/specs/enhancement/email-notification-microservice/` (FR-7, FR-8;
design.md §7.2, §7.3). `20-backend/template.yaml`'s `MailMicroserviceSecret`
resource — specifically its `GenerateSecretString` property — is the single
place that defines which keys this secret holds; this section does not
repeat that set, only how to operate on it. That property seeds a
**placeholder** for every key it defines, so every
`{{resolve:secretsmanager:...}}` reference inside `ApiFunction` resolves
from the first deploy onward — a secret missing even one referenced key
would fail the whole stack operation the moment CloudFormation tried to
resolve it (see the `MailMicroserviceSecret` comment in
`20-backend/template.yaml`).

**Fresh account: there is no "flip" deploy to be before.** `MailTransport`
defaults to `microservice` (T-10), so a fresh account's very first deploy
already creates this stack — and `MailMicroserviceSecret` along with it — at
`microservice`. The secret cannot hold real values before that first
deploy, because the deploy is what creates it. The order is: first deploy
(secret lands with its placeholders) → `put-secret-value` with the real
values (below) → then **force the update** — see "After writing the secret,
confirm it actually took effect" further down, which is that forcing step,
not another deploy. (A stack that predates Phase B / the T-9 flip instead
overwrites the placeholders before or as part of the redeploy that moves
`MailTransport` to `microservice` — see the `MailMicroserviceSecret` comment
in `20-backend/template.yaml` for why that redeploy's own parameter change
forces the resolution regardless.)

### Write every key — in ONE call

⚠️ **`put-secret-value --secret-string` REPLACES THE WHOLE DOCUMENT — it is not
a merge.** Writing a partial document **silently deletes whichever key(s) it omits**, and the very next resolve of a deleted key fails the whole
stack operation. Always write **every** key, in a **single** JSON
document, in a **single** `put-secret-value` call.

`queueName` joined the secret on 2026-09-16 at the product owner's direction.
It is not a credential — it grants no access without the broker URL — but it
discloses the platform's queue naming and which environment we target, which
does not belong in a repository. `EMAIL_SENDER` deliberately did **not** move:
it is the From header of every message the system sends, so it is public by
construction.

Do this as separate steps — do not paste the edit as part of a bigger
block. The values are real broker/CLARISA credentials; a block that both
prepares the file *and* calls `put-secret-value` in one motion runs the write
before you have typed anything, publishing the placeholder strings to the
live secret.

**1. Download the current secret into a temp file and open it for editing.** `mktemp` creates the
file `0600` regardless of umask — the `umask 077` below is belt-and-braces,
not what actually restricts it. The `trap` guarantees the file is removed
even if you abort mid-edit (Ctrl-C, closed terminal) — the standard shell
idiom for a temp file that must not outlive the edit. **The block
below does NOT type the JSON out — it downloads the secret's
CURRENT document and opens that.** A hand-written JSON here would be a second
copy of the key set, and since `put-secret-value` replaces the whole document,
a copy that fell one key behind would **silently delete** the key it omitted —
the precise hazard this section warns about above. Starting from the live
document makes that copy unnecessary; it does not make it impossible to be a
key short, which is why step 2 below asks you to check.

The shell will not read anything further until you save and exit, so it
cannot fall through to step 3 with placeholders still in place:

```bash
umask 077
SECRET_FILE="$(mktemp -t mail-secret.XXXXXX)"
trap 'rm -f "$SECRET_FILE"' EXIT

# The download is GUARDED, and the editor only opens if it succeeded. The
# redirection truncates $SECRET_FILE before aws writes a byte, so an
# unguarded failure (stack not deployed, expired SSO token, no
# secretsmanager:GetSecretValue) leaves an EMPTY file and the error scrolls
# past on stderr — you would then hand-type a document into it, which is
# the one thing this step exists to prevent.
#
# No `set -e` here on purpose: you are pasting into an interactive shell and
# it would close your session. The if/else does the same job without that.
#
# "--query ... --output text >file" so the document lands in the 0600 file
# and NOWHERE else — never run it bare, which prints the secret to your
# terminal.
if aws secretsmanager get-secret-value \
     --profile IBD-DEV --region eu-west-1 \
     --secret-id accelerate-tz-dev-backend-mail-microservice-secret \
     --query "SecretString" --output text > "$SECRET_FILE" \
   && jq -e 'type == "object"' "$SECRET_FILE" >/dev/null; then
  ${EDITOR:-nano} "$SECRET_FILE"
else
  echo "ERROR: could not obtain a JSON secret document — SEE THE ERROR ABOVE IF ANY (an empty SecretString fails silently on both halves, so there may be none). If it came from aws: check that 20-backend is deployed, that your IBD-DEV session is valid, and that you hold secretsmanager:GetSecretValue. If it came from jq (or jq is not installed): the download may have succeeded and the document may be sitting in the temp file. NOT opening an editor either way — a hand-typed document would silently drop whatever key it omits." >&2
  # Delete the file so a step 3 pasted anyway fails loudly instead of
  # destructively: on this path it holds 0 bytes or the literal "None", and
  # "None" is a VALID SecretString - writing it back would replace the whole
  # document with a 4-byte string and fail every dynamic reference at the
  # next stack operation.
  rm -f "$SECRET_FILE"
fi
```

**2. Replace every placeholder value in the editor that just opened** — each
key's name says what value it wants, and "Where the values come from" below
says who issues each one (they are not all the same party). A never-yet-written secret shows
`REPLACE_BEFORE_MICROSERVICE_DEPLOY` on every key but one, and a random string
on that one (`GenerateStringKey` fills it) — leave **no** generated
placeholder behind.

**Never remove a key.** But if a key `GenerateSecretString` defines is
**missing** from what you downloaded, **add it** — that happens on a secret
created before the key was added to the template (`queueName` entered it on
2026-09-16), and writing the short document back would leave the missing
key's `{{resolve:…}}` reference unresolvable, failing the *entire* next stack
operation. The template is the authority; the downloaded document is only its
most recent snapshot. Compare against `GenerateSecretString` before you save.
Then save and exit to return to the shell.

**3. Write it — every key, one call**, the exact secret name this stack
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
secret at rest**, not just the ones being rotated — `DB_PASSWORD`,
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
# inside jq — nothing touches stdout. CONSUMED_SECRET_KEYS must list every
# secret key this jq expression maps below; it is checked against the
# secret's ACTUAL key set immediately after, specifically so that adding a
# fourth key to the authority — GenerateSecretString in
# infra/20-backend/template.yaml, the only place the key set is defined —
# breaks THIS step audibly (the abort below) instead of silently shipping a
# stale value for it. A jq expression cannot "reference" that authority; it
# needs the literal names, so this check is the drift detector in its place.
CONSUMED_SECRET_KEYS='["rabbitmqUrl","apiKey","queueName"]'
ENV_FILE="$(mktemp -t lambda-env.XXXXXX)"
trap 'rm -f "$ENV_FILE"' EXIT
jq --argjson secret "$SECRET_JSON" \
    '{Variables: (. + {RABBITMQ_URL: $secret.rabbitmqUrl, MICROSERVICE_API_KEY: $secret.apiKey, EMAIL_QUEUE_NAME: $secret.queueName})}' \
    <<<"$CURRENT_ENV_JSON" > "$ENV_FILE"

# Fail loudly if the secret holds a key CONSUMED_SECRET_KEYS above does not
# know about. This is the "adding a fourth key" case made audible: the
# secret's real key set already changed (someone edited
# GenerateSecretString and wrote a value for it), but this merge has not
# been taught to carry it into Environment.Variables yet.
UNCONSUMED_KEYS="$(jq -r --argjson consumed "$CONSUMED_SECRET_KEYS" \
  '(keys - $consumed) | join(", ")' <<<"$SECRET_JSON")"
if [[ -n "$UNCONSUMED_KEYS" ]]; then
  echo "ABORT: the secret holds key(s) this merge does not consume: $UNCONSUMED_KEYS — add them to CONSUMED_SECRET_KEYS and the jq merge above (see GenerateSecretString in infra/20-backend/template.yaml for the authoritative key set), or this patch silently ships a stale value for them." >&2
  exit 1
fi

# Pre-flight — TWO independent checks, because a corrupted baseline fetch
# can defeat a check that trusts it:
#   1. STATIC floor: the merge only ever ADDS/overwrites the keys named in
#      CONSUMED_SECRET_KEYS, so the result can read back as exactly that
#      many keys only if $CURRENT_ENV_JSON was itself empty (or already
#      just those keys) — true regardless of what
#      CURRENT_KEY_COUNT says, so this catches the case where the CURRENT
#      fetch ITSELF came back as valid-but-empty JSON (a truncated/partial
#      get-function-configuration that still parses cleanly) — the one case
#      the comparison below cannot see, because both sides of that
#      comparison would be corrupted together.
#   2. DYNAMIC comparison: the merged file must have AT LEAST as many keys as
#      the function had a moment ago — catches a non-empty-but-still-partial
#      fetch. Neither check alone is a full guarantee; together they abort
#      rather than silently drop DB_PASSWORD, OTP_HMAC_SECRET,
#      COGNITO_USER_POOL_ID, etc. and brick the API on the next command.
# The floor is DERIVED from CONSUMED_SECRET_KEYS, never written longhand:
# a hardcoded count is a restatement of the key-set size, and a fourth key
# would silently disarm this check while the drift detector above passed.
CONSUMED_KEY_COUNT="$(jq -r 'length' <<<"$CONSUMED_SECRET_KEYS")"
NEW_KEY_COUNT="$(jq -r '.Variables | keys | length' "$ENV_FILE")"
# A missing/garbled jq leaves these empty, and (( N <= )) reads the empty
# operand as 0 — the floor would pass silently. Refuse to continue instead.
if [[ ! "$CONSUMED_KEY_COUNT" =~ ^[0-9]+$ || ! "$NEW_KEY_COUNT" =~ ^[0-9]+$ \
   || ! "$CURRENT_KEY_COUNT" =~ ^[0-9]+$ ]]; then
  echo "ABORT: could not count keys (is jq installed?). Refusing to apply — an uncounted floor is not a floor." >&2
  exit 1
fi
# Yes, this block aborts with `exit 1` while step 1 deliberately avoids it.
# The asymmetry is intentional: step 1 only opens an editor, so killing your
# shell would cost more than it protects. This block is about to REPLACE the
# live Lambda environment, where continuing past a failed check bricks the
# API — here stopping hard is the cheaper error. If you paste this into an
# interactive shell it will close that shell on abort; that is the point.
if (( NEW_KEY_COUNT <= CONSUMED_KEY_COUNT )); then
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
a template literal. `EMAIL_QUEUE_NAME` is not a credential on its own, but
since 2026-09-16 (product owner direction) it is written the same way as
the two above — via `put-secret-value`, in the same document, never as a
template literal and never committed (§7 "Write every key", above). It too
comes from the **platform team** (design.md §4.5).
`EMAIL_SENDER` deliberately stays a literal in
`20-backend/template.yaml` rather than moving into the secret: it
is the From header of every message the system sends, so it is public by
construction and hiding it would protect nothing.

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
  This guard is destruction-confirmation only. A non-`IBD-DEV` profile is a
  **separate**, earlier check that now **aborts** the run rather than prompting —
  `CONFIRM` does not authorise it. The only way to target another profile is
  `AWS_PROFILE=<profile> ALLOW_NON_IBD_DEV_PROFILE=<profile>`, naming the same
  profile in both (`infra/scripts/_guard.sh`, `bugfix/deploy-script-guardrails`).
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

**Possible account residue outside CloudFormation — verify before touching.**
The now-deleted `infra/10-data-auth/t9-enable-ses.sh` (removed by
`email-notification-microservice` FR-6) used to attach an SES
sending-authorization policy named `cognito-send` to `j.cadavid@cgiar.org`
via `aws ses put-identity-policy`, outside any CloudFormation stack —
`teardown.sh` above never touches it, and this deletion removes the only
artefact that recorded it existing. **Not confirmed still present.**

**List first** — `cognito-send` is the name the deleted script used; if the
policy was ever attached through the SES console instead, it carries a
different name and the delete call below would silently no-op against the
wrong name:

```bash
aws ses list-identity-policies --identity j.cadavid@cgiar.org \
  --profile IBD-DEV --region eu-west-1
```

If it turns out to still be there (under whatever name the listing shows)
and is no longer wanted, the product owner can remove it with:

```bash
aws ses delete-identity-policy --identity j.cadavid@cgiar.org \
  --policy-name cognito-send \
  --profile IBD-DEV --region eu-west-1
# ↑ `cognito-send` is only the name the DELETED script used. Use the name
#   the listing above actually showed - a wrong name no-ops silently.
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
- **Verified TLS** — certificate-chain validation (`sslaccept=strict`, or RDS
  Proxy / IAM auth); today `accept_invalid_certs`.

Until then, the public RDS endpoint is mitigated by **TLS-required** connections
(unverified certificate chain), a **strong generated password** in Secrets Manager,
**no real applicant PII today** — product owner, 2026-09-17: the DEV database
holds test data only; no public self-registration or contact-form submission
from a real person has been received. That is a snapshot, not a structural
property: the self-registration write path is live and unauthenticated on
this same environment, so it can stop being true without
anyone acting or noticing. **Easy teardown** (section 10) rounds out the mitigations.
