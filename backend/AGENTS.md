# AGENTS.md — backend/ (NestJS API on Lambda)

Tool-agnostic mirror of `backend/CLAUDE.md`. Child of the root `../AGENTS.md` — root constraints (IBD-DEV profile, server-side PII, mandated stack, design tokens) apply unconditionally.

## Backend rules any agent must honor

1. **Two entrypoints, one config:** `src/main.ts` (local) and `src/lambda.ts` (serverless-http) must configure bootstrap behavior ONLY through the shared helpers `src/common/validation-pipe.ts` (`createValidationPipe()` — 400 envelope with `details:[{field,message}]`, rejects non-object bodies) and `src/common/body-parser.config.ts` (8 MB JSON + serverless body normalization). Never inline entrypoint-specific config.
2. **The serverless path is special:** serverless-http requests skip body-parser (synthetic `complete:true` request) — `src/test/lambda-handler.e2e.spec.ts` drives the real handler and MUST stay green; supertest e2e does not cover production parsing.
3. **PII gates:** PII exits only via Admin-gated serializers; `pii-boundary` spec green is a release blocker. Acting-admin email comes from `acting-admin.resolver.ts` (Cognito), never from the client.
4. **Audit atomicity:** admin writes log to `ActorAuditLog` in the SAME `$transaction` (`actor-audit.service.ts`); empty diffs write nothing.
5. **Migrations:** additive-only by default; rehearse on the local docker MySQL; apply to RDS with `prisma migrate deploy` + in-process secret composition (pattern in `../infra/scripts/migrate-seed.sh`; that script also seeds — never run it whole on live data).
6. **Tests:** canonical e2e name `*.e2e.spec.ts` (regex also collects `*.e2e-spec.ts` defensively); e2e harness = in-memory Prisma mock + TestJwtAuthGuard + the shared production bootstrap helpers.
7. **Import template:** `common/template-columns.ts` is the single source of truth; regenerate the byte-stable asset with `npm run generate:template` and commit it; bump `TEMPLATE_VERSION` on column changes.
8. **Deploy:** sam build/deploy from the BUILT template dir, preserving `AllowedOrigin`; every AWS command `--profile IBD-DEV`.

Verification: `npm test` · `npm run build` · `npm run lint` (ESLint 9 flat config).
