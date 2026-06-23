# Archive Summary — Canonical Actor data model + consent/PII foundation

## 1. Document Control

| Field | Value |
|---|---|
| Spec name | Canonical Actor data model + consent/PII foundation (seed-map Phase 1) |
| Original spec path | `docs/specs/seed-map/actor-data-model/` |
| Archive path | `docs/specs/archive/2026-06-23-seed-map--actor-data-model/` |
| Branch | `feature/seed-map-actor-data-model` (off `feature/brand-palette-pabra`) |
| Archive date | 2026-06-23 |
| Final commit at archive | `4e603f7` `[SPEC:seed-map/actor-data-model] validation report — PASS, archive-ready` |
| Parent epic | `seed-map/discovery-map/proposal.md` (umbrella) |
| Methodology | JCSPECS SDD (Leader → Implementer → Reviewer loop) |

## 2. Original Spec Path

`docs/specs/seed-map/actor-data-model/` — contained `proposal.md`, `requirements.md`, `design.md`, `tasks.md`, `execution.md`, `validation-report.md`, and this `archive-summary.md`.

## 3. Archive Date

2026-06-23.

## 4. Final Status

**COMPLETE — validated, archive-ready.** All 9 tasks (T-1..T-9) PASS with reviewer sign-off (one rework on T-4); validation `PASS` with no FAIL findings and three accepted non-blocking WARNs. Delivered the project's first backend and the canonical, PII-safe, consent-aware Actor data model that the Discovery Map / Directory / metrics will consume.

## 5. Requirements Delivered

| Req | Title | Delivered by | Status |
|---|---|---|---|
| FR-1 | Backend scaffold (NestJS+Prisma+Serverless) + health | T-1 | ✅ |
| FR-2 | Canonical Actor/Crop schema + ConsentStatus + migration | T-2 | ✅ |
| FR-3 | Normalization + validated write DTOs | T-3 | ✅ |
| FR-4 | Consent model (public = GRANTED only) | T-4/T-5/T-6 | ✅ |
| FR-5 | PII boundary (single allowlist → role-aware serializer) | T-4/T-5 | ✅ |
| FR-6 | Public Actors API (list+detail, filters, pagination) | T-5 | ✅ |
| FR-7 | Metrics API (home-page contract) | T-6 | ✅ |
| FR-8 | Consented seed dataset | T-7 | ✅ |
| FR-9 | Real import (design-only, execution-gated) | T-8 | ✅ |
| NFR-1 | PII server-enforced | T-4/T-5/T-9 | ✅ |
| NFR-2 | AWS profile `IBD-DEV` | T-1/T-8 | ✅ |
| NFR-3 | Lambda-tuned Prisma | T-1 | ✅ |
| NFR-4 | Validated writes | T-3/T-5 | ✅ |
| NFR-5 | Legal-ratifiable single policy | T-4 | ✅ |
| NFR-6 | Contract fidelity | T-5/T-6 | ✅ |
| NFR-7 | Tested boundary | T-9 | ✅ |

## 6. Files Changed Summary

Derived from `execution.md`. New `backend/` (first backend in the project):

- **T-1 scaffold:** `serverless.yml` (`profile: IBD-DEV`), `package.json`/lock, `tsconfig*`, `nest-cli.json`, `prisma/schema.prisma` (datasource), `src/{main,lambda,app.module}.ts`, `src/prisma/{prisma.service,prisma.module}.ts`, `src/health/health.controller.ts`(+spec).
- **T-2 schema:** `prisma/schema.prisma` (Actor/Crop/CropsOnActors + `ConsentStatus`), `prisma/migrations/0001_init_actor_model/migration.sql`, `migration_lock.toml`, `src/prisma/actor-model.spec.ts`.
- **T-3 normalize/DTO:** `src/common/normalize.ts`(+spec), `src/actors/dto/{actor-create,list-query}.dto.ts`(+spec).
- **T-4 PII/consent:** `src/common/{pii-consent.policy,role-aware.serializer}.ts`(+specs).
- **T-5 Actors API:** `src/actors/{actors.service,actors.controller,actors.module}.ts`(+specs); `app.module.ts`; global `ValidationPipe` in `main.ts`+`lambda.ts`.
- **T-6 Metrics API:** `src/metrics/{metrics.service,metrics.controller,metrics.module}.ts`(+specs); `app.module.ts`.
- **T-7 seed:** `prisma/seed-data.ts`, `prisma/seed.ts`, `src/prisma/seed-data.spec.ts`, `package.json` (prisma.seed).
- **T-8 import:** `src/import/{import.service,import.module}.ts`(+spec).
- **T-9 boundary + reconcile:** `src/test/pii-boundary.spec.ts`, `package.json` (supertest), and `docs/detailed-design/detailed-design.md` §3/§8.

Commit trail (spec-prefixed): umbrella proposal `7a50857` · spec `1cd51d0` · T-1 `511f426` · T-2 `20a1a5d` · T-3 `70f7a86` · T-4 `9443438` · T-7 `3c1d92e` · T-5 `a419fb1` · T-6 `db18a34` · T-8 `aafa6b9` · T-9 `9e2f875` · validation `4e603f7`.

## 7. Test Evidence Summary

No standalone `test-report.md` — evidence is in-repo and summarized in `validation-report.md §9`. **13 suites / 102 tests pass deterministically:** normalize/DTO (33), PII policy+serializer (17), seed (9), actors service/controller (29), metrics (7), import (7), schema-shape, health, and the **in-memory PII-boundary e2e (10)** that bootstraps the real Nest app via supertest with mocked Prisma and recursively deep-scans `/actors`, `/actors/:id`, `/metrics` for any PII leak + consent exclusion. Build (`nest build`) + `tsc --noEmit` clean; `serverless package` OK with `IBD-DEV`. **Accepted:** absence of a separate `test-report.md` (coverage automated + validated).

## 8. Validation Summary

`validation-report.md` — overall **PASS, archive-ready**. All phases PASS (task completion, file existence, build integrity, requirement coverage, security boundary, design conformance). Every FR/NFR mapped to a complete task with code + test evidence; the security-critical PII boundary proven end-to-end in-memory; detailed-design §3/§8 reconciled. No FAIL findings.

## 9. Accepted Warnings Or Follow-Ups

- **WARN-1 (tooling):** backend `npm run lint` is non-functional — a lint *script* exists but there is no ESLint config (no `.eslintrc*`/`eslint.config.*`), so ESLint v9 exits 2. No lint violations detected; no task required backend lint. **Follow-up:** add a flat `eslint.config.mjs` (typescript-eslint) or remove the dead script.
- **WARN-2 (deferred, accepted):** live-DB steps deferred for lack of a reachable MySQL — `prisma migrate dev` (T-2), `prisma db seed` (T-7), live HTTP e2e against RDS (T-5/T-6/T-9 are covered in-memory now). **Follow-up:** run when a `DATABASE_URL` is available.
- **WARN-3 (legal gate, by design):** PII set, consent rule, and public-GPS strategy are **provisional** (OQ-1..OQ-6) pending legal-office ratification; the real-data import is execution-gated. Edits are isolated to `pii-consent.policy.ts` + `normalize.ts` (NFR-5). **Follow-up:** legal ratification before real PII goes public.

## 10. Historical Notes

- This is **Phase 1** of the seed-map epic (proposal split into `actor-data-model` foundation + `seed-map/discovery-map` UI). The data model was derived by profiling the real `Partner Profile 14.4.2026` dataset (436 rows, 18 cols) — **never committed (PII)**; only the schema shape, categorical domains, and redacted samples informed the design. Profiling surfaced the gaps that shaped this spec: no crop column in source, only 2 traderType values vs the mockup's 5-role legend, no consent column, person-centric PII (Sex/Position/Trader_name/Market location), and dirty region values.
- **Security design (the core):** a single `pii-consent.policy.ts` (allowlist + consent + public-GPS rule) feeds a role-aware serializer that builds public output by explicit field-pick (no spread/delete), so no PII can leak by omission; consent is enforced in the Prisma WHERE (defense in depth), not serializer-only. The T-9 e2e proves this end-to-end.
- **Seed-first:** v1 runs on 12 GRANTED + 2 non-granted sample actors (fictional orgs, null phone/email); the real import is built but execution-gated behind the legal gate — no un-cleared PII can be exposed.
- The already-shipped (archived) `changes/home-page` spec now has a real `GET /api/v1/metrics` backend matching its `Metrics` type field-for-field.
- One rework across 9 tasks: T-4's serializer spec failed to compile (input type too narrow + bad cast) — caught by the Leader verification gate, fixed in one cycle; the widened input type made the serializer a genuine PII filter.
- **Next spec:** `seed-map/discovery-map` (the Leaflet map UI) builds on this `PublicActor`/`/actors`/`/metrics` contract.
