# Infrastructure — ACCELERATE Tanzania Seed Registry

> The environments blueprint: from the developer's laptop to PROD. Constitutional baseline. Derived from the SAM stacks under `infra/`. Last reviewed: 2026-08-03.

**Architecture tier:** this document's shape follows the **lite-serverless** tier decision recorded in `docs/trd/trd.md` §12 (**ADR-001**) — a single deployable NestJS Lambda behind an HTTP API, a static frontend on S3/CloudFront, and one managed MySQL instance. No container platform, no service mesh, no multi-service topology. The tier decision precedes the infrastructure, never the reverse.

**Non-negotiable:** every AWS CLI command, deploy script, and IaC definition uses `--profile IBD-DEV`. Region `eu-west-1`.

---

## 1. Target Environment

**AWS** (account/profile `IBD-DEV`, region `eu-west-1`), provisioned entirely as **AWS SAM / CloudFormation** templates under `infra/`. There is no other target platform; the mandated stack is not substitutable.

| Environment | Status | Notes |
|---|---|---|
| **Local** | Developer laptop | Native Node processes + a MySQL the developer supplies. See §6. |
| **Dev** | Live | The three SAM stacks below, deployed to `IBD-DEV` / `eu-west-1`. Currently the only deployed environment. |
| **Prod** | Not yet provisioned | Would be the same three stacks under a distinct stack-name prefix and account/profile. **Open question OQ-INFRA-1** — the production account, domain, and promotion path are not yet decided. |

Stack-level tag `Project="ACCELERATE-Tanzania"` is propagated by CloudFormation to every taggable resource (cost allocation).

## 2. Core Cloud Components

Three ordered stacks. The dependency direction is strict: `10` → `20` → `30`.

| Stack | Component | Purpose |
|---|---|---|
| **`10-data-auth`** | `AWS::RDS::DBInstance` | MySQL primary datastore. Instance class and storage are stack parameters. |
| | `AWS::SecretsManager::Secret` + `SecretTargetAttachment` | DB credentials — never committed, never in env files checked into git. |
| | `AWS::EC2::SecurityGroup` | DB ingress, restricted to the Lambda SG and a parameterized `DevCidr`. |
| | `AWS::Cognito::UserPool` + `UserPoolClient` | Identity and JWT issuance. |
| | `AWS::Cognito::UserPoolGroup` ×2 | `admin` and `staff` role groups. Anonymous callers are `Public`. |
| | `AWS::SES::EmailIdentity` | Transactional sender for invites and password resets. Creation is conditional (`CreateSenderIdentity`) so an externally-managed identity can be adopted instead. |
| **`20-backend`** | `AWS::Serverless::Function` | The single NestJS handler (`backend/src/lambda.ts`). VPC-attached to reach RDS. |
| | `AWS::Serverless::HttpApi` | API Gateway HTTP API fronting the function; CORS locked to the CloudFront origin (`AllowedOrigin`). |
| **`30-frontend`** | `AWS::S3::Bucket` | Static export output (`frontend/out/`). Not public — reached only via OAC. |
| | `AWS::CloudFront::OriginAccessControl` | The bucket's only read path. |
| | `AWS::CloudFront::Function` | URL rewrite for static-export routing (extensionless paths → `index.html`). |
| | `AWS::CloudFront::Distribution` | CDN + TLS termination. |
| | `AWS::S3::BucketPolicy` | Grants CloudFront OAC, denies everything else. |

`20-backend` imports `10-data-auth`'s outputs by stack name (`DataAuthStackName`), so the stacks are coupled by CloudFormation exports rather than by copied values.

## 3. Deployment Strategy

**IaC:** AWS SAM. Shared configuration in `infra/samconfig.toml` (profile, region, capabilities, tags, `confirm_changeset = true`, `lint = true` on validate).

| Step | Command |
|---|---|
| Validate all templates | `./infra/scripts/validate.sh` |
| Deploy all three stacks, ordered + idempotent | `./infra/scripts/deploy.sh` |
| Run migrations + seed | `./infra/scripts/migrate-seed.sh` |
| Build + publish the frontend to S3/CloudFront | `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh` — this script reads `AWS_PROFILE` and **parses no flags**, so a `--profile` argument is silently ignored and an ambient profile wins |
| Lock API CORS to the CloudFront origin | `./infra/scripts/set-cors.sh` |
| Post-deploy smoke check | `./infra/scripts/smoke.sh` |
| Tear down | `./infra/scripts/teardown.sh` |

Full runbook: `infra/README.md`.

**CI/CD:** none currently — deploys are operator-run from a workstation holding the `IBD-DEV` profile. **Open question OQ-INFRA-2:** whether to move to a pipeline (GitHub Actions + OIDC role assumption) before a production environment exists.

**Governed, not improvised:** agents never invent a deploy. Any cloud change goes through these scripts and templates. A change that needs a resource not in §2 is an infrastructure spec, not an inline action.

## 4. Network & Security Architecture

- **Transport:** HTTPS end to end — CloudFront for the frontend, API Gateway for the API.
- **Frontend origin:** the S3 bucket is private; CloudFront OAC is the only read path, enforced by bucket policy.
- **API CORS:** locked to the CloudFront origin via the `AllowedOrigin` parameter (`set-cors.sh` applies it post-deploy, once the distribution domain is known).
- **Database reachability:** RDS sits behind a security group admitting the Lambda's SG plus a parameterized `DevCidr` for operator access. It is never publicly open.
- **Secrets:** DB credentials in Secrets Manager; Cognito and runtime config injected as Lambda environment variables from stack outputs. Nothing secret is committed — `.env` files are local-only and `.env.example` carries placeholders.
- **Authorization:** Cognito JWT validated in NestJS guards; RBAC by group (`admin`, `staff`, else `Public`). **PII and consent gating are enforced server-side in the data layer and serializer** — see `docs/trd/trd.md` §8. Network controls are not the PII boundary.
- **Lambda ↔ RDS concurrency:** the connection strategy must stay safe under Lambda concurrency (constrained pool today; RDS Proxy is the recommended path if concurrency grows) — `docs/trd/trd.md` §11.

## 5. Infrastructure Rules & Constraints

1. **`--profile IBD-DEV` on every AWS command, script, and IaC definition.** No exceptions; a change omitting it is a Reviewer FAIL.
2. **SAM only.** No Terraform, CDK, or console-clicked resources — a resource that exists only in the console is invisible to the next deploy and will be destroyed or duplicated.
3. **Stack order is `10` → `20` → `30`.** `20` consumes `10`'s exports; `30`'s origin is wired into `20`'s CORS afterwards.
4. **Static export only.** The frontend must remain a pure static artifact — introducing Next.js SSR/ISR/route handlers breaks S3/CloudFront hosting outright.
5. **No secrets in git.** Secrets Manager or SSM; `.env` stays local.
6. **Tag propagation** via `samconfig.toml` — do not strip the `Project` tag.

## 6. Local Environment

The contract for starting the local stack. **This project has no Docker Compose file**, so the native route is the primary route; a containerized MySQL is an optional convenience for the database only.

| Element | Value |
|---|---|
| **Primary route (native)** | `cd backend && npm install && npx prisma generate && npx prisma migrate dev && npm run start:dev` (API on `:3001`, per `backend/.env.example`) · `cd frontend && npm install && npm run dev` (`http://localhost:3000`) |
| **Database** | A MySQL 8 the developer supplies. Either a local install, a container (`docker run --name accelerate-mysql -e MYSQL_ROOT_PASSWORD=… -e MYSQL_DATABASE=accelerate -p 3306:3306 -d mysql:8`), or a dev RDS instance. Point `DATABASE_URL` in `backend/.env` at it. |
| **Fallback route (no Docker)** | The primary route already is the no-Docker route. Only the database choice changes — a native MySQL install or the dev RDS endpoint (requires the `DevCidr` ingress rule). |
| **Pre-check** | `node -v` (Node 20+ required) and a reachable `DATABASE_URL`. If using a container, `docker info` first — on failure (daemon off, not installed), surface it and offer: start Docker, install MySQL natively, or point at dev RDS. **Never block silently.** |
| **Env setup** | `cp backend/.env.example backend/.env` · `cp frontend/.env.example frontend/.env.local`. Both examples ship working local defaults; **only `DATABASE_URL` must be edited** to match the MySQL you supplied. `backend/.env.example` sets `PORT=3001` deliberately — `main.ts` defaults to **3000**, the same port as the Next.js dev server, so an unset `PORT` makes whichever process starts second fail to bind. |
| **Seed / reset data** | `cd backend && npx prisma migrate reset` (drops, re-migrates, re-seeds) · seeders: `prisma/seed.ts`, `prisma/seed-data.ts`, `prisma/seed-synthetic.ts` |
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
| OQ-INFRA-1 | Production account, domain, and dev→prod promotion path are undecided. Only the `IBD-DEV` dev environment exists. |
| OQ-INFRA-2 | Move operator-run deploys to CI/CD (GitHub Actions + OIDC) before provisioning production? |
| OQ-INFRA-3 | Add a committed `docker-compose.dev.yml` to make the local primary route a single command? |
| OQ-INFRA-4 | Adopt RDS Proxy before Lambda concurrency grows, or keep the constrained connection pool? (`docs/trd/trd.md` §11) |
