# CLAUDE.md — backend/ (NestJS API on Lambda)

Child of the root guides — read `../CLAUDE.md` / `../AGENTS.md` and the constitutional baseline (`../docs/prd.md`, `../docs/system-design/design.md`, `../docs/detailed-design/detailed-design.md`) first. Root hard constraints (IBD-DEV profile, server-side PII, no SSR, design tokens) apply unconditionally; this file adds backend-specific rules.

## Runtime & the two entrypoints (critical)

- NestJS 11 runs behind **two bootstraps**: `src/main.ts` (local `npm run start`) and `src/lambda.ts` (Lambda via **serverless-http** + API Gateway HTTP API v2). **Never configure them independently** — all bootstrap behavior flows through shared helpers in `src/common/`:
  - `validation-pipe.ts` → `createValidationPipe()` — global pipe whose 400 envelope is `{ statusCode, error, message, details: [{field, message}] }` (the frontend maps `details` to inline field errors). It also rejects non-plain-object bodies with a clean 400 (defense in depth).
  - `body-parser.config.ts` → `configureBodyParser(app)` — 8 MB JSON limit + `normalizeServerlessJsonBody`.
- **The serverless-http lesson (2026-07-10):** serverless-http builds its synthetic request with `complete: true`, so body-parser 2.x **skips parsing entirely** and the raw Buffer reaches the pipe. supertest e2e does NOT exercise this path. Any change to bootstraps/parsers MUST keep `src/test/lambda-handler.e2e.spec.ts` green — it invokes the **real `lambda.ts` handler** with a synthetic APIGW v2 event and is the only harness that catches this class of bug.

## Data & migrations

- Prisma + MySQL. Migrations are **additive-only** unless a spec explicitly says otherwise; rehearse locally first (docker `accelerate-mysql` on localhost:3306, `.env` → `mysql://user:pass@localhost:3306/accelerate`).
- RDS dev apply: `npx prisma migrate deploy` with `DATABASE_URL` **composed in-process** from Secrets Manager (see `../infra/scripts/migrate-seed.sh` for the canonical pattern — resolve stack outputs → read secret → URL-encode → pass inline). Never write the URL to a file or print it. Beware: `migrate-seed.sh` also seeds — don't run it whole against a live DB.
- `binaryTargets` includes `rhel-openssl-3.0.x` for the Lambda runtime — don't remove it.

## PII & RBAC (release gates)

- PII fields (`phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport`) exit ONLY through Admin-gated routes/serializers (`admin-actor.serializer.ts`); public reads go through `common/role-aware.serializer.ts` + `pii-consent.policy.ts`. `src/test/pii-boundary.spec.ts` green is a hard release gate.
- Guard stack: `JwtAuthGuard` + `RolesGuard` + `@Roles('Admin')` class-level on admin controllers. The access token carries only `sub` — the acting admin's email is resolved server-side via `actors/acting-admin.resolver.ts` (Cognito ListUsers, cached per container, null on failure). **Never trust client-sent identity.**
- Audit: every admin write creates `ActorAuditLog` rows **inside the same `$transaction`** via `actor-audit.service.ts` (diff for updates — empty diff writes no row; snapshots for create/delete/import; bulk ops batch with `createMany`). Audit JSON contains PII → admin-only surface.

## Users module — no-email credential handoff (intentional)

- `users` create/reset deliberately do **NOT** send Cognito email (corporate
  `@cgiar.org` deliverability + SES sandbox limits). Instead they SUPPRESS Cognito
  mail and **return a one-time temporary password** for the admin to share
  out-of-band: create → `AdminCreateUser MessageAction:SUPPRESS` +
  `TemporaryPassword` → `{ user, temporaryPassword }`; reset →
  `AdminSetUserPassword(Permanent:false)` → `{ temporaryPassword }`. This is a
  deliberate exception to "never return a plaintext password" — do **not** revert
  it to email. The temp password (`users/temp-password.util.ts`, CSPRNG) must
  never be logged/stored/audited; it exits only via the Admin-guarded response.
- The Cognito pool is **case-sensitive** (immutable `UsernameConfiguration`) — the
  write DTOs lowercase `email` (`@Transform`), and the frontend lowercases at
  sign-in/reset. Keep new email inputs normalized.

## Testing conventions

- Jest `testRegex` accepts `.spec.ts` AND `.e2e-spec.ts`; the **canonical e2e name is `*.e2e.spec.ts`** (a hyphen-named file once sat dead for weeks — see archived `bugfix/dead-e2e-tests`).
- E2E harness pattern (`src/test/admin-actors-crud.e2e.spec.ts` is the reference): AppModule + in-memory Prisma mock override + `TestJwtAuthGuard` + the SAME shared bootstrap helpers as production (`createValidationPipe()`, `configureBodyParser`).
- Targeted runs: `npm test -- <pattern>`. Full gates: `npm test && npm run build && npm run lint` (ESLint 9 flat config `eslint.config.mjs`).

## Import template

- `common/template-columns.ts` is the **single source of truth** for the Excel import template (headers, required flags, allowed values from `common/normalize.ts` canonical constants). `npm run generate:template` regenerates `../frontend/public/templates/actor-import-template.xlsx` **byte-stably** (fixed workbook + ZIP dates); a test asserts the committed asset matches. Change columns → bump `TEMPLATE_VERSION`, regenerate, commit the asset.

## Deploy

- `npm run build` → `sam build` → `sam deploy` using the **built** template in `../infra/20-backend/.aws-sam/build/` (never the source template — bundles 500MB of dev node_modules). Preserve the live `AllowedOrigin` parameter (CORS is locked to CloudFront). All AWS commands `--profile IBD-DEV`, region eu-west-1.
