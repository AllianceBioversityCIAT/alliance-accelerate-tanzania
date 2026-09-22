# CLAUDE.md — backend/ (NestJS API on Lambda)

Child of the root guides — read `../CLAUDE.md` / `../AGENTS.md` and the constitutional baseline (`../docs/prd.md`, `../docs/ux-ui/design.md`, `../docs/trd/trd.md`) first. Root hard constraints (IBD-DEV profile, server-side PII, no SSR, design tokens) apply unconditionally; this file adds backend-specific rules.

## Runtime & the two entrypoints (critical)

- NestJS 11 runs behind **two bootstraps**: `src/main.ts` (local `npm run start`) and `src/lambda.ts` (Lambda via **serverless-http** + API Gateway HTTP API v2). **Never configure them independently** — all bootstrap behavior flows through shared helpers in `src/common/`:
  - `validation-pipe.ts` → `createValidationPipe()` — global pipe whose 400 envelope is `{ statusCode, error, message, details: [{field, message}] }` (the frontend maps `details` to inline field errors). It also rejects non-plain-object bodies with a clean 400 (defense in depth).
  - `body-parser.config.ts` → `configureBodyParser(app)` — 8 MB JSON limit + `normalizeServerlessJsonBody`.
- **The serverless-http lesson (2026-07-10):** serverless-http builds its synthetic request with `complete: true`, so body-parser 2.x **skips parsing entirely** and the raw Buffer reaches the pipe. supertest e2e does NOT exercise this path. Any change to bootstraps/parsers MUST keep `src/test/lambda-handler.e2e.spec.ts` green — it invokes the **real `lambda.ts` handler** with a synthetic APIGW v2 event and is the only harness that catches this class of bug.

## Data & migrations

- Prisma + MySQL. Migrations are **additive-only** unless a spec explicitly says otherwise.
- **Rehearsal target — describes what this team actually does (amended 2026-08-05).** Rehearse on whatever MySQL 8 your `backend/.env` `DATABASE_URL` points at. In practice that is usually the **shared dev RDS**, not a local container: `docs/infrastructure.md` §6 lists a dev RDS instance as a legitimate local-route database, and checkouts here frequently have no local MySQL at all. A local docker MySQL (`accelerate-mysql` on `localhost:3306`) is still the **safer** rehearsal target and is preferred when one is running — but it is not a precondition, and a guide that mandated it would be describing a step most checkouts cannot perform.
  - **Know what `migrate dev` does to a shared target:** it reads `DATABASE_URL` **from `.env`** and **provisions a shadow database** on the server it points at. That is acceptable on dev RDS and is what this project does; it is **never** acceptable against PROD.
  - **Always additive, always inspect the emitted SQL before it lands.** On a shared target the blast radius is other people's work, so a reset or drift prompt is an **abort-and-report** condition — never answer it. `prisma migrate reset` and `db push` are forbidden against RDS.
  - *Why this was rewritten:* the previous text mandated local-first rehearsal and reserved RDS for `migrate deploy` only. Execution of `actors/public-self-registration` T-1 (2026-08-05) found no local MySQL in the checkout, applied via `migrate dev` against dev RDS, and only then discovered the rule — a rule nobody could follow is worse than an honest one. See that spec's `execution.md` → T-1 *Runbook deviation*.
- **PROD / governed RDS apply:** `npx prisma migrate deploy` with `DATABASE_URL` **composed in-process** from Secrets Manager (see `../infra/scripts/migrate-seed.sh` for the canonical pattern — resolve stack outputs → read secret → URL-encode → pass inline). Never write the URL to a file or print it. Beware: `migrate-seed.sh` also seeds — don't run it whole against a live DB.
- `binaryTargets` includes `rhel-openssl-3.0.x` for the Lambda runtime — don't remove it.

## PII & RBAC (release gates)

- Consent (`consentStatus = GRANTED`) gates disclosure of every field an actor supplied, not field identity (`actors/public-profile-disclosure`). `common/pii-consent.policy.ts` holds four constants: `PUBLICLY_DISCLOSED_FIELDS` (`phone`, `email`, `sex`, `position`, `marketLocation`, `contactPerson`, `otherCrops`) MUST be present, by value, on the single-actor detail read (`GET /api/v1/actors/:id`) for a `GRANTED` actor; its subset `CONTACT_BLOCK_FIELDS` (`phone`, `email`, `position`, `marketLocation`, `contactPerson`) MUST be absent — by key and by value — from the list read (`GET /api/v1/actors`) under every filter/page/page-size, so the map/dashboard/CSV structurally cannot carry it; `NEVER_PUBLIC_FIELDS` MUST be absent from every public path regardless of consent; `PII_ALLOWLIST` is retained, **empty**, as the one-file re-restriction point if legal narrows disclosure again. `technicalSupport` lives in `NEVER_PUBLIC_FIELDS` for a *different* reason than its old neighbours: it's unreviewed staff-authored free text, not an actor PII declaration. Public reads go through `common/role-aware.serializer.ts`'s two projections (`toPublicListItem`, `toPublicDetail`); the `Admin` projection (`admin-actor.serializer.ts`) gained `contactPerson` and `otherCrops` under this revision — its gating is unchanged, and it still exits only through Admin-gated routes. `src/test/pii-boundary.spec.ts` green is a hard release gate.
- Guard stack: `JwtAuthGuard` + `RolesGuard` + `@Roles('Admin')` class-level on admin controllers. The access token carries only `sub` — the acting admin's email is resolved server-side via `actors/acting-admin.resolver.ts` (Cognito ListUsers, cached per container, null on failure). **Never trust client-sent identity.**
- Audit: every admin write creates `ActorAuditLog` rows **inside the same `$transaction`** via `actor-audit.service.ts` (diff for updates — empty diff writes no row; snapshots for create/delete/import; bulk ops batch with `createMany`). Audit JSON contains PII → admin-only surface.

## Users module — no-email credential handoff (intentional)

> ⚠️ **Superseded-by note (2026-09-21, `auth/account-access-emails`, DD-7).** The
> premise below — that no channel exists reliable enough to email this credential —
> no longer holds: that spec has `MailService` (already used for approval/receipt
> mail) dispatch this same credential by email (FR-1, FR-5). **This is partially
> shipped:** check `docs/specs/auth/account-access-emails/tasks.md` §5 for
> current status — `users.service.ts`'s `create()` now dispatches
> `MailService.sendInvitation` (T-4) and no longer matches the paragraph below;
> `resetPassword()` now also dispatches `MailService.sendAdminReset` (T-5)
> and no longer matches it either, diverging from that paragraph the same
> way `create()` already does. `resetPassword()` issues no suppression
> directive either — unlike `create()`'s
> `AdminCreateUserCommand`, its `AdminSetUserPasswordCommand` has no
> `MessageAction` field at all, so there is nothing to `SUPPRESS`: Cognito
> simply never emails for this action. The
> reasoning that follows was correct when written and remains the record of
> *why* the no-email handoff exists; only the forward-looking instruction
> never to email it has been withdrawn (next paragraph).

- `users` create/reset deliberately do **NOT** send Cognito email (corporate
  `@cgiar.org` deliverability, and the pool stays on `COGNITO_DEFAULT`
  permanently post-`email-notification-microservice` —
  `docs/specs/enhancement/email-notification-microservice/design.md` §11's
  `10-data-auth/template.yaml` row + OQ-10, and that spec's
  `requirements.md` §6 — because Cognito cannot publish to the notification
  microservice without a `CustomEmailSender` trigger, which that same §6
  records as **deferred**). Instead they avoid Cognito's own mailer and
  **return a one-time temporary password** for the admin to share
  out-of-band: create → `AdminCreateUser MessageAction:SUPPRESS` +
  `TemporaryPassword` → `{ user, temporaryPassword }` (a real suppression —
  `AdminCreateUser` has a `MessageAction` to suppress); reset →
  `AdminSetUserPassword(Permanent:false)` → `{ temporaryPassword }` (nothing
  to suppress there — that command has no `MessageAction` field, so Cognito
  never emails for it in the first place). This is a
  deliberate exception to "never return a plaintext password". **The instruction
  to never revert it to email is withdrawn** (see the dated note above) — do not
  treat "no email" as standing guidance; follow the linked spec's task status
  instead. The temp password (`users/temp-password.util.ts`, CSPRNG) must
  **never** be logged, stored, or audited — that rule is absolute and this spec
  does not touch it (NFR-1). Its **exits** change per-method, not both at once:
  `create()`'s temporary password now also travels in the invitation mail body
  (FR-1, T-4, shipped); `resetPassword()`'s exit is no longer the
  Admin-guarded response alone — T-5 added the identical dispatch pattern
  (FR-5, shipped).
- The Cognito pool is **case-sensitive** (immutable `UsernameConfiguration`) — the
  write DTOs lowercase `email` (`@Transform`), and the frontend lowercases at
  sign-in/reset. Keep new email inputs normalized.

**`src/contact/` is stateless and Prisma-free — and that is disciplinary, not structural.** `PrismaModule` is `@Global()`, so nothing prevents a write from that module; the zero-writes property is held by `contact-no-writes.e2e.spec.ts` alone. Treat that spec as the guard, and if you add persistence there, know you are removing the only thing enforcing it.

## Testing conventions

- Jest `testRegex` accepts `.spec.ts` AND `.e2e-spec.ts`; the **canonical e2e name is `*.e2e.spec.ts`** (a hyphen-named file once sat dead for weeks — see archived `bugfix/dead-e2e-tests`).
- E2E harness pattern (`src/test/admin-actors-crud.e2e.spec.ts` is the reference): AppModule + in-memory Prisma mock override + `TestJwtAuthGuard` + the SAME shared bootstrap helpers as production (`createValidationPipe()`, `configureBodyParser`).
- Targeted runs: `npm test -- <pattern>`. Full gates: `npm test && npm run build && npx eslint "{src,test}/**/*.ts" --quiet` (ESLint 9 flat config `eslint.config.mjs`) — **not** `npm run lint`, which is `eslint --fix` (`package.json`) and mutates the diff under review (root `CLAUDE.md` § Verification commands).

## Import template

- `common/template-columns.ts` is the **single source of truth** for the Excel import template (headers, required flags, allowed values from `common/normalize.ts` canonical constants). `npm run generate:template` regenerates `../frontend/public/templates/actor-import-template.xlsx` **byte-stably** (fixed workbook + ZIP dates); a test asserts the committed asset matches. Change columns → bump `TEMPLATE_VERSION`, regenerate, commit the asset.

## Deploy

- `npm run build` → `sam build` → `sam deploy` using the **built** template in `../infra/20-backend/.aws-sam/build/` (never the source template — bundles 500MB of dev node_modules). Preserve the live `AllowedOrigin` parameter (CORS is locked to CloudFront). All AWS commands `--profile IBD-DEV`, region eu-west-1.
