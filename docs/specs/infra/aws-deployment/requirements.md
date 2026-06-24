# Requirements — AWS Deployment Infrastructure (CloudFormation/SAM bootstrap)

- Spec path: docs/specs/infra/aws-deployment/
- Status: Draft
- Author / Date: JuanCode / 2026-06-24
- Depth: **Full** (cross-cutting infra, data, auth, secrets, migration)
- Related: proposal.md (this spec); depends on archived `seed-map/actor-data-model` (backend + Prisma schema) and merged `changes/home-page` (frontend static export); detailed-design §7,§8,§9,§11; prd.md AC-7
- Branch: `feature/infra-aws-deployment` (off `main`)

## Document Control

| Field | Value |
|---|---|
| Approved intent | proposal.md (Option A — AWS SAM/CloudFormation, easy dev) |
| AWS profile | **`IBD-DEV`** — every CLI/IaC/script action (hard constraint) |
| Region | `eu-west-1` |
| Environment | **dev only** (single stage) |
| Locked decisions | IaC = **AWS SAM (CloudFormation)** · Lambda **outside VPC** · RDS **public** in default VPC, SG = dev IP/32 + `0.0.0.0/0:3306`, **TLS required**, password in **Secrets Manager** · **no RDS Proxy** (deferred) · **no custom domain** (CloudFront URL) · **no custom VPC** |

## 1. Summary

Provision and deploy the application's **dev AWS environment** as **Infrastructure-as-Code (AWS SAM / CloudFormation)**, under the `IBD-DEV` profile in `eu-west-1`. The environment runs the full app: an **RDS MySQL** database, the **NestJS backend on Lambda + API Gateway (HTTP API)**, **Cognito** for auth identities, and the **Next.js static export on S3 + CloudFront**. Deployment is intentionally minimal — default VPC only, no custom domain (the CloudFront `*.cloudfront.net` URL is the app URL), no NAT/RDS-Proxy/CI. The deliverable is a reproducible, tear-down-able stack plus deploy/migrate scripts, after which the live CloudFront URL serves the frontend and it successfully reads real seeded data from the deployed API.

## 2. Requirement Numbering & Writing Standards

`FR-<n>` / `NFR-<n>`, atomic + testable, MUST/SHOULD/MAY, GIVEN/WHEN/THEN scenarios. Because the deliverable is infrastructure, "behavior" means observable, verifiable outcomes of provisioning/deployment (resources exist, endpoints respond, data flows, secrets are absent from the repo), checked via AWS CLI (`--profile IBD-DEV`) and HTTP probes.

## 3. Functional Requirements

### FR-1: Infrastructure defined as CloudFormation/SAM
All AWS resources MUST be declared as AWS SAM/CloudFormation templates (no console-clicked or imperative-only resources), deployable with a single documented command using `--profile IBD-DEV` in `eu-west-1`, and removable with a documented teardown command.

#### Scenario: Reproducible provision
- GIVEN a clean `IBD-DEV` account state and the template set
- WHEN the operator runs the documented deploy command
- THEN all five components (RDS, Lambda+API, Cognito, S3, CloudFront) are created
- AND re-running the deploy is idempotent (a no-op or clean change set)
- AND the teardown command removes the stack's resources.

### FR-2: RDS MySQL provisioned and reachable
The stack MUST provision a single RDS **MySQL** instance in the account **default VPC**, publicly accessible, with credentials generated into **AWS Secrets Manager**, a security group permitting `3306` from the documented dev IP/32 (admin/migration) and from `0.0.0.0/0` (the outside-VPC Lambda), and **TLS-capable** connections.

#### Scenario: Database reachable for migration
- GIVEN the deployed RDS instance and the generated secret
- WHEN the operator runs `prisma migrate deploy` from the dev machine using the secret's connection string (over TLS)
- THEN the schema migrates successfully against RDS
- AND the consented sample dataset can be seeded (no real PII).

### FR-3: Backend deployed on Lambda + API Gateway
The NestJS app MUST be deployed as a Lambda function fronted by an **HTTP API (API Gateway v2)**, reachable over HTTPS at a stable base URL, with `DATABASE_URL` sourced from the Secrets Manager secret (not committed, not a plaintext template literal), the Lambda running **outside any VPC**.

#### Scenario: Public API responds with data
- GIVEN RDS is migrated and seeded and the Lambda is deployed
- WHEN a client GETs `<api-base-url>/api/v1/metrics` and `/api/v1/actors`
- THEN the API returns `200` with PII-safe, consent-gated JSON (the existing serializer/consent boundary still holds)
- AND no `phone`/`email` or non-consented actor appears in any response.

### FR-4: Cognito identity resources provisioned
The stack MUST provision a **Cognito User Pool**, an **app client** (public client, no secret, suitable for the static frontend), and the groups **`admin`** and **`staff`** (anonymous callers remain `Public`). The pool/client IDs MUST be exposed as stack outputs for later auth wiring.

#### Scenario: Auth identities exist
- GIVEN a successful deploy
- WHEN the operator inspects the stack outputs / Cognito via `aws cognito-idp ... --profile IBD-DEV`
- THEN the User Pool, app client, and `admin` + `staff` groups exist
- AND the User Pool ID and app client ID are present in the outputs.

### FR-5: Frontend hosted on S3 + CloudFront
The Next.js **static export** MUST be hosted from a **private S3 bucket** served exclusively through **CloudFront** (Origin Access Control; bucket not public), reachable at the CloudFront-provided domain, with a default root object and SPA-friendly handling of the static route files (e.g. `/map`).

#### Scenario: Live site loads
- GIVEN the frontend is built and synced and CloudFront is deployed
- WHEN a visitor opens the CloudFront URL
- THEN the home page renders, and navigating to `/map` serves the exported map page
- AND the S3 bucket is not directly publicly readable (only via CloudFront).

### FR-6: End-to-end wiring (frontend ↔ API ↔ CORS)
The frontend build MUST be configured with the deployed API base URL (`NEXT_PUBLIC_API_BASE_URL`), and the backend CORS MUST be locked to the CloudFront origin, so the live site reads live data rather than the offline fallback.

#### Scenario: Live data on the deployed site
- GIVEN the documented deploy order has completed (backend → frontend build+deploy → CORS set to CloudFront origin)
- WHEN a visitor loads the CloudFront site's home and map pages
- THEN the metrics band and map render **real seeded data** from the API (not the "couldn't load" fallback)
- AND the browser makes successful CORS requests from the CloudFront origin to the API.

### FR-7: Stack outputs surface wiring values
The deploy MUST emit, as CloudFormation outputs, at least: the **CloudFront URL**, the **API base URL**, the **Cognito User Pool ID** and **app client ID**, and the **RDS endpoint** (host) — the values needed to wire and operate the app.

#### Scenario: Outputs available
- GIVEN a successful deploy
- WHEN the operator runs the documented "show outputs" command (`aws cloudformation describe-stacks ... --profile IBD-DEV`)
- THEN all of the above values are returned.

### FR-8: Documented deploy / migrate / teardown runbook
The spec MUST deliver an operator **runbook** (scripts + README) covering, in order: deploy infra, run DB migration + seed, build & deploy frontend, set backend CORS, and tear everything down — every AWS action using `--profile IBD-DEV`.

#### Scenario: A new operator can deploy from the runbook
- GIVEN only the repo and `IBD-DEV` credentials
- WHEN a new operator follows the runbook top to bottom
- THEN they reach a working CloudFront URL serving live data
- AND a single documented teardown command cleans up.

## 4. Non-Functional Requirements

- **NFR-1 (Profile):** Every AWS CLI/IaC/script action MUST use `--profile IBD-DEV` (PRD AC-7). No hardcoded access keys.
- **NFR-2 (No committed secrets):** No DB password, connection string, or Cognito secret may be committed. DB credentials live in Secrets Manager; the Lambda receives `DATABASE_URL` via a CloudFormation dynamic reference / deploy-time injection, never a plaintext template value or `.env` in the repo. (A PreToolUse hook also blocks `.env` writes.)
- **NFR-3 (Minimal footprint):** No custom VPC, subnets, NAT gateway, RDS Proxy, custom domain, ACM cert, WAF, or CI/CD pipeline in this spec. Default VPC only.
- **NFR-4 (Transport security):** All public traffic over HTTPS (CloudFront + API Gateway defaults); RDS connections use TLS.
- **NFR-5 (PII/consent boundary preserved):** Deployment MUST NOT weaken the existing server-side PII/consent enforcement; the deployed public API returns the same PII-safe, consent-gated projection proven by `src/test/pii-boundary.spec.ts`. Only consented sample data (no real PII) is seeded.
- **NFR-6 (Cost-aware / disposable):** Use small, single-AZ, low-cost resource sizes (e.g. `db.t3.micro`, minimal storage, default Lambda memory) and ensure the stack is fully removable to avoid lingering charges.
- **NFR-7 (Reproducibility/idempotence):** Re-running deploy converges (no manual drift); the stack name and parameters are documented.

## 5. Data & Schema Impact

No schema *changes* — this spec deploys the existing Prisma schema (`backend/prisma/schema.prisma`) to a real RDS MySQL via `prisma migrate deploy`, then seeds the existing consented sample dataset (`backend/prisma/seed.ts`). No new tables, columns, or models.

## 6. Out of Scope

- Custom domain / Route 53 / ACM certificate (use the CloudFront default domain).
- Custom VPC / subnets / NAT gateway / VPC endpoints; Lambda-in-VPC; RDS Proxy — captured for a later `infra/network-hardening` spec.
- CI/CD pipeline (GitHub Actions / CodePipeline) — manual scripts only.
- Multi-environment (staging/prod), blue-green, autoscaling tuning.
- WAF, GuardDuty, CloudWatch alarms/dashboards beyond default logging.
- **Frontend Cognito login UX / token handling** — this spec provisions the pool/client/groups only; wiring sign-in into the app is a separate spec.
- Real Partner-Profile data import (legal-gated; seeded sample data only).

## 7. Dependencies & Assumptions

- Valid `IBD-DEV` credentials with permission to create RDS, Lambda, API Gateway, Cognito, S3, CloudFront, IAM, Secrets Manager, and CloudFormation stacks in `eu-west-1`.
- An available **default VPC** with public subnets in `eu-west-1`.
- Local tooling: AWS SAM CLI, AWS CLI v2, Node 20, Prisma CLI.
- Existing buildable backend (`backend/`, NestJS + `dist/lambda.handler`) and frontend static export (`frontend/`, `output: 'export'`).
- **Constitutional note:** CLAUDE.md currently names *Serverless Framework* as the backend IaC; this spec adopts **AWS SAM/CloudFormation** and retires `backend/serverless.yml` — CLAUDE.md MUST be updated to reflect the ratified IaC choice (see FR-1, OQ-1).

## 8. Open Questions

- **OQ-1 (ratified):** IaC = AWS SAM/CloudFormation (supersedes Serverless Framework). Action: update CLAUDE.md's stack line; retire `serverless.yml`.
- **OQ-2 (ratified):** RDS networking = public in default VPC, SG = dev IP/32 + `0.0.0.0/0:3306`, Lambda outside VPC, TLS required. Hardening (in-VPC/private) deferred to `infra/network-hardening`.
- **OQ-3 (ratified):** RDS Proxy deferred (lazy Prisma client reuse for now).
- **OQ-4:** Cognito **Hosted UI domain** — provision now or defer to the auth-wiring spec? (Assumption: provision pool/client/groups only; defer Hosted UI/domain.)
- **OQ-5:** DB migration mechanism — run `prisma migrate deploy` from the dev machine against the public endpoint (assumed, simplest) vs a one-off migration Lambda/CodeBuild.
- **OQ-6:** Dev IP/32 for the admin SG rule — the operator's current public IP (assumed supplied at deploy time as a template parameter).

## 9. Requirement ID Index

| ID | Title | Covered by task |
|---|---|---|
| FR-1 | IaC as CloudFormation/SAM | T-1, T-7 |
| FR-2 | RDS MySQL provisioned + reachable | T-2, T-6 |
| FR-3 | Backend on Lambda + API Gateway | T-3, T-6 |
| FR-4 | Cognito identities | T-4 |
| FR-5 | Frontend on S3 + CloudFront | T-5, T-8 |
| FR-6 | End-to-end wiring (CORS + API URL) | T-8, T-9 |
| FR-7 | Stack outputs | T-1, T-3, T-4, T-5 |
| FR-8 | Deploy/migrate/teardown runbook | T-7, T-9, T-10 |
| NFR-1 | IBD-DEV profile | T-1..T-10 |
| NFR-2 | No committed secrets | T-2, T-3 |
| NFR-3 | Minimal footprint | T-1..T-5 |
| NFR-4 | Transport security (TLS/HTTPS) | T-2, T-5 |
| NFR-5 | PII/consent boundary preserved | T-6, T-9 |
| NFR-6 | Cost-aware/disposable | T-2, T-10 |
| NFR-7 | Reproducibility/idempotence | T-1, T-7 |
