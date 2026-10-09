# Infrastructure — ACCELERATE Tanzania Seed Registry

> The environments blueprint: from the developer's laptop to PROD. Constitutional baseline. Derived from the SAM stacks under `infra/`. Last reviewed: 2026-09-29.

**Architecture tier:** this document's shape follows the **lite-serverless** tier decision recorded in `docs/trd/trd.md` §12 (**ADR-001**) — a single deployable NestJS Lambda behind an HTTP API, a static frontend on S3/CloudFront, and one managed MySQL instance. No container platform, no service mesh, no multi-service topology. The tier decision precedes the infrastructure, never the reverse.

**Non-negotiable:** every AWS CLI command, deploy script, and IaC definition uses `--profile IBD-DEV`. Region `eu-west-1`.

---

## 1. Target Environment

**AWS** (account/profile `IBD-DEV`, region `eu-west-1`), provisioned entirely as **AWS SAM / CloudFormation** templates under `infra/`. There is no other target platform; the mandated stack is not substitutable.

| Environment | Status | Notes |
|---|---|---|
| **Local** | Developer laptop | Native Node processes + a MySQL the developer supplies. See §6. |
| **Production** | Live | The three SAM stacks below, deployed to `IBD-DEV` / `eu-west-1`. **This is the production environment** — the only deployed one. Served to the public from **`https://accelerate-tz.alliance.cgiar.org`**, a CNAME onto the same CloudFront distribution; the distribution's own `*.cloudfront.net` address keeps working alongside it. |
| ~~**Dev** / **Staging**~~ | Not planned | There is **no** separate development, staging or test environment, and none is planned for now (product owner, 2026-09-29). The laptop above is the only non-production environment that exists. |

⚠️ **`IBD-DEV` names the AWS account, not the environment's role.** The account name, the `DevCidr` parameter, the `dev` stack-name prefixes and every `dev-only` comment under `infra/` date from a period when this deployment *was* development. Read them as history, not as a description of what the environment is today. The practical consequence is §4's: a set of trade-offs accepted as cheap-and-temporary for a dev bootstrap — public RDS endpoint with `0.0.0.0/0` on 3306, unverified TLS chain, 1-day backups, single-AZ — are running in **production**, serving a public domain. They are recorded there and in `infra/README.md` §11 as **open production risks**, no longer as accepted dev shortcuts. Nothing in this revision changes a stack; it changes what the stacks are understood to be.

Stack-level tag `Project="ACCELERATE-Tanzania"` is propagated by CloudFormation to every taggable resource (cost allocation).

## 2. Core Cloud Components

Three ordered stacks. The dependency direction is strict: `10` → `20` → `30`.

| Stack | Component | Purpose |
|---|---|---|
| **`10-data-auth`** | `AWS::RDS::DBInstance` | MySQL primary datastore. Instance class and storage are stack parameters. |
| | `AWS::SecretsManager::Secret` + `SecretTargetAttachment` | DB credentials — never committed, never in env files checked into git. |
| | `AWS::EC2::SecurityGroup` | DB ingress on 3306: the template declares two rules — the operator `DevCidr`, and `0.0.0.0/0` — any address on the internet — added to admit the (non-VPC-attached) Lambda, per the resource's own comment ("outside-VPC Lambda - DD-2; dev-only, harden later" — written when this environment was development; "later" has now been overtaken by production). **There is no Lambda-scoped security group.** See §4 and `infra/README.md` §11. |
| | `AWS::Cognito::UserPool` + `UserPoolClient` | Identity and JWT issuance. |
| | `AWS::Cognito::UserPoolGroup` ×2 | `admin` and `staff` role groups. Anonymous callers are `Public`. |
| **`20-backend`** | `AWS::Serverless::Function` | The single NestJS handler (`backend/src/lambda.ts`). **Not** VPC-attached — the resource declares no `VpcConfig` (DD-2: free internet egress, no NAT). It reaches RDS's public endpoint over the open internet, TLS-encrypted, certificate chain unverified. |
| | `AWS::SecretsManager::Secret` (`OtpHmacSecret`) | HMAC key for hashing registration OTP codes at rest, owned by this stack but provisioned for `actors/public-self-registration` (T3-A1, archived) — resolved into the Lambda only via a `{{resolve:secretsmanager:...}}` dynamic reference, never a literal. |
| | `AWS::SecretsManager::Secret` (`MailMicroserviceSecret`) | Config for the OneCGIAR notification-microservice mail transport (`enhancement/email-notification-microservice`, T-8). Its keys are injected into the Lambda only via `{{resolve:secretsmanager:...}}` dynamic references — never a literal; the key set itself is defined solely by that resource's own `GenerateSecretString` in `infra/20-backend/template.yaml` (the single authority, restated once, self-checking, as `CONSUMED_SECRET_KEYS` in `infra/README.md` §7). Other mail config such as `EMAIL_SENDER` stays a template literal by design — it is not one of this secret's keys. |
| | `AWS::Serverless::HttpApi` | API Gateway HTTP API fronting the function; CORS locked to the CloudFront origin (`AllowedOrigin`). |
| | `AWS::S3::Bucket` (`ConsentDocumentsBucket`) + `AWS::S3::BucketPolicy` | Private store for uploaded consent documents (`actors/consent-intake/consent-request-email`). Name `${AWS::StackName}-consent-docs-${AWS::AccountId}`, so no account id is versioned. All four Block Public Access settings on, `BucketOwnerEnforced`, `AES256`, versioning enabled, tagged `project` and `environment`. One lifecycle rule on the `incoming/` prefix expires current and noncurrent versions after 1 day and aborts incomplete multipart uploads after 1 day, so an unconfirmed upload cleans itself up. CORS allows `POST` from `AllowedOrigin` (and `LegacyAllowedOrigin` when set) for the browser's direct presigned upload. The bucket policy denies any request with `aws:SecureTransport=false`. **`DeletionPolicy` and `UpdateReplacePolicy` are `Retain`.** The Lambda role may `PutObject`, `GetObject` and `DeleteObject` on `incoming/*`, `PutObject` and `GetObject` on `stored/*` (never `DeleteObject` there), and an unconditioned `s3:ListBucket` on the bucket ARN (HeadObject carries no `s3:prefix`, so a prefix condition would not apply; key names are exposed to the Lambda role only, which already reads `stored/`); the function reads the bucket name from `CONSENT_DOCUMENTS_BUCKET`. S3 server access logging is on, delivered to `ConsentDocumentsLogBucket` under `access/` (S6258): it is named `${AWS::StackName}-consent-docs-logs-${AWS::AccountId}`, has all four Block Public Access settings, `BucketOwnerEnforced`, `AES256` (log delivery does not support SSE-KMS), versioning (SonarCloud S6252), one lifecycle rule expiring objects after 365 days and noncurrent versions after 1 day, the same two tags, and `Retain`. Its policy lets `logging.s3.amazonaws.com` `PutObject` on `access/*` only for `aws:SourceArn` = the documents bucket and `aws:SourceAccount` = this account, and denies non-TLS requests. The Lambda role has no access to it. |
| **`30-frontend`** | `AWS::S3::Bucket` | Static export output (`frontend/out/`). Not public — reached only via OAC. |
| | `AWS::CloudFront::OriginAccessControl` | The bucket's only read path. |
| | `AWS::CloudFront::Function` | URL rewrite for static-export routing (extensionless paths → `index.html`). |
| | `AWS::CloudFront::Distribution` | CDN + TLS termination. |
| | `AWS::S3::BucketPolicy` | Grants CloudFront OAC, denies everything else. |

`20-backend` imports `10-data-auth`'s outputs by stack name (`DataAuthStackName`), so the stacks are coupled by CloudFormation exports rather than by copied values.

### Consent documents bucket: operational notes

- **Teardown leaves it behind.** Because of `Retain`, deleting the `20-backend` stack (including `./infra/scripts/teardown.sh`, which is unchanged) does not delete the documents bucket, its access-log bucket (`ConsentDocumentsLogBucket`) or their objects: they hold compliance evidence. Removing them is a manual step under `--profile IBD-DEV` — list and delete every object version, then the bucket — taken only when the evidence no longer has to be kept.
- **First-merge risk.** `20-backend` deploys on every merge to `main` (§3), so the merge that carries this bucket creates it, and the deploy role must be allowed to create and configure it: `s3:CreateBucket`, `s3:PutBucketPolicy`, `s3:PutBucketCors`, `s3:PutLifecycleConfiguration`, `s3:PutBucketVersioning`, `s3:PutEncryptionConfiguration`, `s3:PutBucketOwnershipControls`, `s3:PutBucketPublicAccessBlock`, `s3:PutBucketLogging` and `s3:PutBucketTagging` (on both buckets). That role's permissions are not visible from this repository (no policy in it mentions `s3:CreateBucket`, and the `Jenkinsfile` is not versioned, §3), so this is a recorded risk, not an observation. Observed 2026-10-07: the merge deploy created both buckets. **Orphan recovery:** if the create is rolled back after a bucket exists, `Retain` leaves it outside the stack (either of the two) and the next deploy fails because the name already exists. Both buckets are versioned and `aws s3 ls` does not show versions, so empty each one by deleting every version and delete marker (`aws s3api list-object-versions --bucket <name> --profile IBD-DEV`, then `aws s3api delete-objects --bucket <name> --delete file://keys.json --profile IBD-DEV`, where `keys.json` is `{"Objects":[{"Key":…,"VersionId":…}],"Quiet":true}` built from the listing; at most 1,000 per call, so repeat until both listings are empty), delete it (`aws s3api delete-bucket --bucket <name> --profile IBD-DEV`), grant the missing permission, and redeploy.
- **Browser upload and a future CSP.** See §4.

## 3. Deployment Strategy

**IaC:** AWS SAM. Shared configuration in `infra/samconfig.toml` (profile, region, capabilities, tags, `confirm_changeset = true`, `lint = true` on validate).

| Step | Command |
|---|---|
| Validate all templates | `./infra/scripts/validate.sh` |
| Deploy all three stacks, ordered + idempotent | `./infra/scripts/deploy.sh` |
| Run migrations + seed | `./infra/scripts/migrate-seed.sh` |
| Build + publish the frontend to S3/CloudFront | `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh` — this script reads `AWS_PROFILE` and **parses no flags**, so a `--profile` argument is silently ignored. An ambient non-`IBD-DEV` `AWS_PROFILE` no longer wins silently either: it sources the shared profile floor (`infra/scripts/_guard.sh`, `bugfix/deploy-script-guardrails`) and **aborts** unless `ALLOW_NON_IBD_DEV_PROFILE` matches it exactly |
| Lock API CORS to the CloudFront origin | `./infra/scripts/set-cors.sh` |
| Post-deploy smoke check | `./infra/scripts/smoke.sh` |
| Tear down | `./infra/scripts/teardown.sh` — leaves the `Retain`ed consent documents bucket (§2) |

Full runbook: `infra/README.md`.

**CI/CD:** a Jenkins pipeline, since 2026-09-01. A push to `main` runs `.github/workflows/jenkins-trigger.yml`, which POSTs to the `tanzania-main` job on `automation.prms.cgiar.org`; the job clones, lints, tests, deploys and smoke-tests. **The `Jenkinsfile` is not versioned in this repository** — it lives on the Jenkins server, so the deploy path cannot be read from the codebase. Treat that as a known gap when reasoning about what a merge will do.

Three of its behaviours change what a merge means, and none of them are visible from the repo:

| Flag | Default | Effect |
|---|---|---|
| `DEPLOY_INFRA` | **`false`** | The `Deploy Infra (10 + 30)` stage is **skipped**. A change to `infra/10-data-auth/` or `infra/30-frontend/` — including any CloudFront setting — **does not ship on an ordinary merge**. It must be flipped to `true` for that build. |
| `RUN_MIGRATIONS` | `true` | `prisma migrate deploy` + seed run against RDS. |
| `RUN_SMOKE` | `true` | `infra/scripts/smoke.sh` runs **last, after `Deploy Web`** — it turns the build red and notifies, but **nothing rolls back and the code is already live**. It *alerts*; it does not prevent a bad deploy. The gates that prevent (lint, backend tests, `sam validate`) all run before any deploy stage. Stage order verified 2026-09-21. |

The backend (`20-backend`) and the web assets (`Deploy Web` → `deploy-frontend.sh`) **do** deploy on every merge to `main`.

**CORS is safe only when the origin lookup succeeds — the steady-state stage fails open, not closed.** *(Corrected 2026-09-19 — see `bugfix/deploy-script-guardrails`.)* The steady-state `Deploy Backend` stage (`when DEPLOY_INFRA == 'false'`, the path every ordinary merge takes) resolves `AllowedOrigin` like this, transcribed from the operator-supplied `Jenkinsfile` on **2026-09-18** (quoted verbatim in `docs/specs/archive/2026-09-21-bugfix--deploy-script-guardrails/design.md` §7.4):

```bash
ALLOWED_ORIGIN="$(
  aws cloudformation describe-stacks --stack-name "${FRONTEND_STACK}" \
    --query "...CloudFrontUrl..." --output text --profile IBD-DEV ... 2>/dev/null || true
)"
if [ -z "${ALLOWED_ORIGIN}" ] || [ "${ALLOWED_ORIGIN}" = "None" ]; then
    echo "▸ Frontend stack has no CloudFrontUrl yet — bootstrapping CORS as '*'"
    ALLOWED_ORIGIN='*'
fi
```

`2>/dev/null || true` **conflates "the stack does not exist" with "the call failed."** An expired token, a throttle, or an IAM denial produces the same empty string as a genuinely absent stack, and either one falls back to `*`. `Lock CORS` does **not** repair this path — it is gated `when DEPLOY_INFRA == 'true'`, and this is the `false` path. So the correct statement is: the pipeline resolves the live origin *when the lookup succeeds*; it fails open to `*` on **any** lookup failure, transient or not, not only on a genuine first-time bootstrap. The `deploy.sh` defect tracked in **ATP-64** is therefore not confined to manual runs — the identical fail-open shape is live in the pipeline too, as of the 2026-09-18 reading. `infra/jenkins/deploy-backend-cors.patch` is an advisory fix for the Jenkins administrator (CORS resolution only; see `infra/jenkins/README.md`); it is **not applied by this repository**, so this gap is open until the administrator lands it. On the bootstrap path itself (`DEPLOY_INFRA=true`), see **OQ-INFRA-6** below for an unresolved, related ordering question.

Operator-run deploys from a workstation remain possible and are documented in `infra/README.md`; they are no longer the only path, and they are no longer the normal one.

**Governed, not improvised:** agents never invent a deploy. Any cloud change goes through these scripts and templates. A change that needs a resource not in §2 is an infrastructure spec, not an inline action.

## 4. Network & Security Architecture

- **Transport:** HTTPS end to end — CloudFront for the frontend, API Gateway for the API.
- **Frontend origin:** the S3 bucket is private; CloudFront OAC is the only read path, enforced by bucket policy.
- **No Content-Security-Policy today, and the consent-document upload depends on that.** The distribution's `SecurityHeadersPolicy` (`infra/30-frontend/template.yaml`) deliberately sets no CSP. The admin browser uploads consent documents by a cross-origin POST straight to the documents bucket's host (§2), which an absent CSP does not block. **A future CSP must allow that bucket host in `connect-src` and `form-action`**, or uploads fail in the browser while every API check stays green.
- **API CORS:** locked to the app's canonical origin via the `AllowedOrigin` parameter, with the distribution's own `*.cloudfront.net` address accepted alongside it as `LegacyAllowedOrigin` (`set-cors.sh` applies both post-deploy). Both are resolved from the frontend stack's outputs — `PublicAppUrl` and `CloudFrontUrl` respectively — never written into a script. **`CloudFrontUrl` is not the app's address once a custom domain exists:** it is `!Sub "https://${Distribution.DomainName}"`, and that attribute only ever reports the `*.cloudfront.net` name, never an alias. `PublicAppUrl` exists precisely to be the value that knows the difference, and is what `PUBLIC_APP_BASE_URL` reaches through the backend template's fallback to `AllowedOrigin`. This is the intended steady state, not a standing guarantee: §3 records that the pipeline's own `Deploy Backend` stage can fail open to a permissive `AllowedOrigin=*` on a transient origin-lookup failure, as of the 2026-09-18 `Jenkinsfile` reading. An operator running `deploy.sh` gets the in-repo fix for the equivalent case (`resolve_stack_value`, `infra/scripts/_guard.sh`); the pipeline does not, until the advisory patch (`infra/jenkins/deploy-backend-cors.patch`) is applied upstream. A second advisory patch, `infra/jenkins/deploy-backend-public-app-url.patch`, moves the pipeline's own origin resolution from `CloudFrontUrl` to `PublicAppUrl` for the reason above; until it is applied, every pipeline build resolves the pre-domain origin.
- **Database reachability:** the stack declares RDS as publicly accessible (`PubliclyAccessible: true`) with a security group open to `0.0.0.0/0` on 3306, alongside the operator `DevCidr` rule — there is no Lambda-scoped security group, because the Lambda is not VPC-attached (DD-2). As declared, port 3306 accepts connections from any address; the controls standing between the internet and the data are **credentials and TLS** (encrypted, but the server certificate chain is **not** verified — `DB_SSL: accept_invalid_certs`, `infra/20-backend/template.yaml`), not the network. This was a deliberate, recorded trade-off taken when the environment was a dev bootstrap, and it is still deliberate and still recorded — but §1 now states that this environment is **production**, so it is an **open production risk**, not an accepted dev shortcut. The trade-off was never re-evaluated against the change of role; it simply carried over. It is also not a live observation — this document describes what the stack declares, not a live security-group check. The hardening (drop the `0.0.0.0/0` rule, move the Lambda into the VPC, private RDS, verify the certificate chain) is tracked in `infra/README.md` §11 (`infra/network-hardening`) and is the substance of **OQ-INFRA-7**.
- **Durability and availability posture (same origin, same consequence).** Three further `10-data-auth` settings were chosen for cost on a disposable dev stack (NFR-6) and still govern production data: `BackupRetentionPeriod: 1` (a single day of automated backups, and no point-in-time recovery beyond it), `MultiAZ: false` (an AZ failure is an outage, not a failover), and a micro instance class with small allocated storage. None of these is a defect in the template — each is correct for what the template was written for. All three are **OQ-INFRA-7**. `StorageEncrypted: true` was already production-grade, and **`DeletionProtection: true`** has been live since **2026-10-09** (`34e4f27`, applied by the infra operator as a single-property change set built from the deployed template): a stack delete or console delete of the instance now fails until protection is explicitly turned off.
- **Secrets:** DB credentials in Secrets Manager; Cognito and runtime config injected as Lambda environment variables from stack outputs. Nothing secret is committed — `.env` files are local-only and `.env.example` carries placeholders.
- **Frontend build-time config (a separate channel from the above).** The static export has no runtime environment: `deploy-frontend.sh` bakes **four** `NEXT_PUBLIC_*` values into the bundle at build time — API base URL, Cognito user-pool Id, Cognito client Id, and the GA4 measurement Id. Three resolve from CloudFormation stack outputs; **`GA_MEASUREMENT_ID` is the first frontend build value that does not**, and defaults in-script instead. That is deliberate, not drift: a GA4 measurement ID ships in the page source of every visitor, so it is public by construction and does not belong in SSM/Secrets Manager, which `docs/trd/trd.md` §8 reserves for DB credentials and Cognito config. Because these are baked, changing any of them requires a **rebuild and redeploy** — not a variable update.
- **Authorization:** Cognito JWT validated in NestJS guards; RBAC by group (`admin`, `staff`, else `Public`). **PII and consent gating are enforced server-side in the data layer and serializer** — see `docs/trd/trd.md` §8. Network controls are not the PII boundary.
- **Lambda ↔ RDS concurrency:** the connection strategy must stay safe under Lambda concurrency (constrained pool today; RDS Proxy is the recommended path if concurrency grows) — `docs/trd/trd.md` §11.

## 5. Infrastructure Rules & Constraints

1. **`--profile IBD-DEV` on every AWS command, script, and IaC definition.** No exceptions; a change omitting it is a Reviewer FAIL.
2. **SAM only.** No Terraform, CDK, or console-clicked resources — a resource that exists only in the console is invisible to the next deploy and will be destroyed or duplicated.
3. **Stack order is `10` → `20` → `30`.** `20` consumes `10`'s exports; `30`'s origin is wired into `20`'s CORS afterwards.
4. **Static export only.** The frontend must remain a pure static artifact — introducing Next.js SSR/ISR/route handlers breaks S3/CloudFront hosting outright.
5. **No secrets in git.** Secrets Manager or SSM; `.env` stays local. **The converse is also a rule:** a value that is public by construction — anything baked into the client bundle and therefore readable by every visitor — must *not* be put in Secrets Manager or SSM. Doing so implies a confidentiality it does not have and adds a deploy dependency for nothing. The GA4 measurement Id is the current instance (§4).
6. **Tag propagation** via `samconfig.toml` — do not strip the `Project` tag.
7. **Every S3 bucket declares server access logging (to a dedicated private log bucket) and versioning — the log bucket included.** SonarCloud gates PRs on both (S6258, S6252); omitting them turns the PR's security rating red after it is opened (KZ-actors--consent-intake--consent-request-email-2).

## 6. Local Environment

The contract for starting the local stack. **This project has no Docker Compose file**, so the native route is the primary route; a containerized MySQL is an optional convenience for the database only.

| Element | Value |
|---|---|
| **Primary route (native)** | `cd backend && npm install && npx prisma generate && npx prisma migrate dev && npm run start:dev` (API on `:3001`, per `backend/.env.example`) · `cd frontend && npm install && npm run dev` (`http://localhost:3000`) |
| **Database** | A MySQL 8 the developer supplies. Either a local install, a container (`docker run --name accelerate-mysql -e MYSQL_ROOT_PASSWORD=… -e MYSQL_DATABASE=accelerate -p 3306:3306 -d mysql:8`), or a dev RDS instance. Point `DATABASE_URL` in `backend/.env` at it. |
| **Fallback route (no Docker)** | The primary route already is the no-Docker route. Only the database choice changes — a native MySQL install or the dev RDS endpoint (requires the `DevCidr` ingress rule). |
| **Pre-check** | `node -v` (Node 20+ required) and a reachable `DATABASE_URL`. If using a container, `docker info` first — on failure (daemon off, not installed), surface it and offer: start Docker, install MySQL natively, or point at dev RDS. **Never block silently.** |
| **Env setup** | `cp backend/.env.example backend/.env` · `cp frontend/.env.example frontend/.env.local`. Both examples ship working local defaults. **`DATABASE_URL` must be edited** to match the MySQL you supplied — and, **for any admin work, so must `NEXT_PUBLIC_COGNITO_USER_POOL_ID` and `NEXT_PUBLIC_COGNITO_CLIENT_ID` in `frontend/.env.local`.** ⚠️ *Corrected 2026-09-09: this sentence read "only `DATABASE_URL` must be edited", which is false for `/login` and every `/admin` route — `RequireRole` reads `useSessionContext()`, and with no Cognito config `session.role` stays `Public` and the route redirects. The two variables were absent from `frontend/.env.example` entirely, so a fresh checkout following this contract to the letter **could not sign in as admin at all**. Both are now documented there.* `backend/.env.example` sets `PORT=3001` deliberately — `main.ts` defaults to **3000**, the same port as the Next.js dev server, so an unset `PORT` makes whichever process starts second fail to bind. |
| **Seed / reset data** | `cd backend && SEED_SAMPLE_ACTORS=true npx prisma migrate reset` (drops, re-migrates, re-seeds; without the variable the seed writes only the 3 crops — the same seed runs on every deploy) · seeders: `prisma/seed.ts`, `prisma/seed-data.ts`, `prisma/seed-synthetic.ts` |
| **Consent documents** | `CONSENT_DOCUMENTS_BUCKET` is unset in `backend/.env.example`, so locally the backend uses the unconfigured storage adapter: `GET /api/v1/admin/consent-documents/status` returns `{ enabled: false }`, `upload-url` returns `503`, and the admin UI disables document upload with an explanation. |
| **Health check** | `curl http://localhost:3001/api/v1/health` · frontend reachable at `http://localhost:3000` |
| **URLs / ports** | Frontend `http://localhost:3000` · Backend `http://localhost:3001` · MySQL `3306` |

**Cross-origin note.** Locally the frontend (`:3000`) and API (`:3001`) are different origins, so the browser blocks calls between them without a CORS header. `main.ts` enables CORS for `LOCAL_CORS_ORIGIN` (default `http://localhost:3000`).

`lambda.ts` sets none, and must not — but **not because the deployed API is same-origin**. It is not. `30-frontend`'s distribution declares a single origin (the S3 bucket, via OAC) and a single default cache behaviour: there is **no `/api` path pattern and no API Gateway origin**, so CloudFront does not proxy the API. The deployed browser call is cross-origin too.

What makes the Lambda's own CORS unnecessary is that **API Gateway already owns it**: `20-backend` declares `CorsConfiguration.AllowOrigins: [!Ref AllowedOrigin]`, locked to the CloudFront origin by `scripts/set-cors.sh` after `30` is deployed (§3, §5 step 5). Adding a second CORS layer inside the Lambda would duplicate — and could contradict — a header API Gateway already emits.

> *Corrected 2026-08-31.* The paragraph this replaces asserted the CloudFront-proxies-`/api` topology, which contradicted §3 and §4 of this same document and is refuted by `infra/30-frontend/template.yaml`. Recorded rather than silently overwritten: it was introduced the same day, in the one change that deliberately shipped without a Reviewer.

**Boundary rule.** The local environment is **disposable**: agents may freely start it, seed it, reset it, and drop its database to verify work. Deployments to cloud/PROD are **governed** — they follow §1–5 (components, IaC, deploy scripts defined at constitution time) and are never improvised by an agent.

**Open question OQ-INFRA-3:** whether to add a committed `docker-compose.dev.yml` (MySQL + optional backend/frontend services) so the primary route becomes one command. Not scaffolded here because no compose file exists today and the constitution does not invent commands the repo cannot run.

---

## Open Questions

| ID | Question |
|---|---|
| ~~OQ-INFRA-1~~ | **Resolved 2026-09-29, by fact rather than by decision.** The question asked which account and domain production would use and how dev would be promoted to it. The answer is that the `IBD-DEV` deployment at `accelerate-tz.alliance.cgiar.org` **is** production and has been for some time, and no separate development or staging environment is planned (product owner, 2026-09-29). There is therefore no promotion path to decide, because there is nothing to promote *from* — and, symmetrically, **no environment in which to rehearse a change before it reaches the public site**. That is the cost this resolution accepts; it is not the same as the cost being absent. The successor questions are **OQ-INFRA-7** (the dev-grade settings now running in production) and **OQ-INFRA-8** (whether the absence of a pre-production environment is acceptable). |
| ~~OQ-INFRA-2~~ | **Resolved 2026-09-01** — deploys moved to a Jenkins pipeline triggered from GitHub Actions (§3). Not the GitHub-Actions-plus-OIDC shape this question proposed: the pipeline authenticates with credentials bridged into a file-based `IBD-DEV` profile, because the seven scripts in `infra/scripts/` and `infra/samconfig.toml` all require a named profile to exist as a file. The successor question is **OQ-INFRA-5**. |
| OQ-INFRA-3 | Add a committed `docker-compose.dev.yml` to make the local primary route a single command? |
| OQ-INFRA-4 | Adopt RDS Proxy before Lambda concurrency grows, or keep the constrained connection pool? (`docs/trd/trd.md` §11) |
| OQ-INFRA-5 | The `Jenkinsfile` is not versioned in this repository, so the deploy path cannot be reviewed, diffed, or reasoned about from the codebase — and `DEPLOY_INFRA=false` means an infra change can merge without shipping. Vendor it into the repo, or accept the gap deliberately and record where the authoritative copy lives? |
| ~~OQ-INFRA-6~~ | **RESOLVED 2026-09-21.** The question was whether `Smoke` runs between `Deploy Backend` and `Lock CORS` on the bootstrap path (`DEPLOY_INFRA=true`), which would have made `smoke.sh`'s new CORS check fail the first bootstrap build on a legitimate, temporary `*`. **It does not.** The stage order, verified against a copy of the `Jenkinsfile` on 2026-09-21, is `Cloning → Preflight → AWS Auth → Install → Linting → Test → Validate Infra → (Deploy Infra 10+30, only when DEPLOY_INFRA=true) → Run Migrations → Deploy Backend → Deploy Web → Lock CORS → Smoke`. **`Smoke` runs after `Lock CORS`**, so the permissive `*` is already replaced by the time the check looks. No action needed. *(The check lives in `smoke.sh` itself — `infra/scripts/tests/cases/smoke-cors.*` are its test cases. This row previously misattributed it to `infra/scripts/tests`; corrected at validation, V-A7.)* |
| OQ-INFRA-7 | **Opened 2026-09-29 by OQ-INFRA-1's resolution.** Which of the dev-bootstrap trade-offs now running in production are to be hardened, in what order, and which are accepted in writing? The set is §4's: the `0.0.0.0/0:3306` ingress rule and public RDS endpoint · `DB_SSL: accept_invalid_certs` (unverified certificate chain) · `BackupRetentionPeriod: 1` · `MultiAZ: false`. (`DeletionProtection` was the fifth item; enabled 2026-10-09, see §4.) `infra/README.md` §11 already specifies the work as `infra/network-hardening`; what is undecided is the priority and whether any item is deliberately accepted rather than deferred. ⚠️ **This question has a deadline, and it is days away.** §11's standing mitigation for the whole set is that no real applicant PII exists yet. That expires on a known trigger: the database holds demonstration data only, is walked through with the client on **Thursday 2026-10-01**, wiped immediately afterwards because the data is fabricated, and then filled by the client with **their own real records** (product owner, 2026-09-29). The trigger is the first real record rather than the date itself, so a meeting that slips postpones the deadline without changing anything else. Before that moment these are cost decisions on a disposable demo database; after it they are decisions about someone else's data, and any change to them becomes a maintenance window negotiated with the client rather than an internal call. |
| OQ-INFRA-8 | **Opened and answered 2026-09-29.** With no staging or test environment, every infrastructure and application change reaches the public site on its first deployment; the only rehearsal available is the local environment of §6, which has no CloudFront, no Cognito pool, no RDS and no Lambda. **Decision: accepted deliberately for now** — the team is aware of the gap and is not provisioning a pre-production environment at this time (product owner, 2026-09-29). This row stays open rather than struck through, because what remains undecided is the second half of the question: which compensating controls stand in for the missing environment, and whether the answer changes once the database holds the client's real data (OQ-INFRA-7's trigger). The controls that exist today are the pipeline's own gates (§3) and `smoke.sh`; neither exercises a schema migration against production data. |
