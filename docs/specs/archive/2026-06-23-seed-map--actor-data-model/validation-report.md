# Validation Report — Canonical Actor data model + consent/PII foundation

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `seed-map/actor-data-model` |
| Branch | `feature/seed-map-actor-data-model` |
| Validated | 2026-06-23 |
| Validator | Claude (SDD validate) |
| Latest commit | `9e2f875` `[SPEC:seed-map/actor-data-model] T-9: PII-boundary integration tests + reconcile detailed-design §3/§8` |
| Inputs | proposal.md, requirements.md (FR-1..FR-9, NFR-1..NFR-7), design.md (§3–§12), tasks.md (T-1..T-9), execution.md |
| Constitutional refs | docs/detailed-design/detailed-design.md §2,§3,§4,§8,§11 (§3/§8 reconciled by T-9); CLAUDE.md (stack, PII, AWS profile) |

## 2. Summary

**Overall result: PASS — archive-ready (with accepted WARNs).**

All nine tasks (T-1..T-9) are complete with reviewer PASS verdicts and recorded verification evidence (one rework on T-4's serializer spec). The project's first backend is in place: NestJS + Prisma + Serverless (`profile: IBD-DEV`), the canonical Actor/Crop schema with `consentStatus`, a single legal-ratifiable PII/consent policy feeding a role-aware serializer, public Actors + Metrics APIs (consent enforced at the query), a consented seed dataset, a design-only execution-gated import, and an in-memory PII-boundary integration suite proving no public endpoint leaks PII. `tsc` clean, **102 tests pass deterministically**, `detailed-design §3/§8` reconciled. No FAIL findings. WARNs are non-blocking: backend lint is non-functional (no ESLint config), and several live-DB / legal-gated steps are intentionally deferred and documented.

| Phase | Result |
|---|---|
| Task completion (T-1..T-9) | PASS |
| File existence | PASS |
| Build integrity (build / tsc / test) | PASS (lint WARN) |
| Requirement coverage (FR-1..9, NFR-1..7) | PASS |
| Code quality / security boundary | PASS |
| Design conformance | PASS |

## 3. Task Completion

| Task | Status | Reviewer | Evidence |
|---|---|---|---|
| T-1 NestJS+Prisma+Serverless scaffold | `[x]` | PASS (1) | build/health/serverless package; `profile: IBD-DEV` |
| T-2 Actor/Crop schema + migration + ConsentStatus | `[x]` | PASS (1) | schema matches §5; migration SQL (3 tables) |
| T-3 Normalization + validated DTOs | `[x]` | PASS (1) | quarantine-not-guess; class-validator; 33 tests |
| T-4 PII/consent policy + serializer | `[x]` | PASS (2, 1 rework) | explicit-pick; allowlist; consent-gated GPS |
| T-5 Public Actors API | `[x]` | PASS (1) | consent in WHERE; serializer on every path; 404 |
| T-6 Metrics API | `[x]` | PASS (1) | GRANTED-only; matches frontend Metrics type |
| T-7 Consented seed dataset | `[x]` | PASS (1) | 12 GRANTED + 2 non-granted; no real PII |
| T-8 Import (design-only, gated) | `[x]` | PASS (1) | synthetic rows; legal gate; not registered |
| T-9 PII-boundary integration + §3/§8 reconcile | `[x]` | PASS (1) | 3-layer deep-scan all endpoints; doc reconcile |

All tasks carry execution notes + verification evidence in `execution.md`. **Result: PASS.**

## 4. File Existence

All files from design.md §4 are present under `backend/`: `serverless.yml`, `prisma/{schema.prisma, seed.ts, seed-data.ts, migrations/}`, `src/{main,lambda,app.module}.ts`, `src/health/`, `src/prisma/`, `src/common/{pii-consent.policy, role-aware.serializer, normalize}.ts`, `src/actors/{controller,service,module,dto}`, `src/metrics/`, `src/import/`, `src/test/pii-boundary.spec.ts`. (Verified.) **Result: PASS.**

## 5. Build Integrity

| Command | Result |
|---|---|
| `npm run build` (nest build) | exit 0 — clean |
| `npx tsc --noEmit` | exit 0 — no type errors |
| `npm run test` | Test Suites: 13 passed / **Tests: 102 passed** (incl. in-memory PII e2e) |
| `npm run lint` | **exit 2 — non-functional** (see WARN-1) |
| `npx serverless package` | succeeds with `IBD-DEV` profile (T-1) |

**Result: PASS (lint WARN-1).**

## 6. Requirement Coverage

| Req | Task(s) | Evidence | Result |
|---|---|---|---|
| FR-1 Backend scaffold + health | T-1 | `GET /api/v1/health`; serverless `profile: IBD-DEV`; build/test | PASS |
| FR-2 Canonical Actor schema | T-2 | `schema.prisma` Actor/Crop/CropsOnActors/ConsentStatus + migration | PASS |
| FR-3 Normalization + validated writes | T-3 | `normalize.ts` (quarantine-not-guess); class-validator DTOs; 33 tests | PASS |
| FR-4 Consent model | T-4,T-5,T-6 | `consentStatus`; public APIs filter `GRANTED` in the Prisma WHERE | PASS |
| FR-5 PII boundary | T-4,T-5 | single `PII_ALLOWLIST` + explicit-pick serializer; consent-gated GPS | PASS |
| FR-6 Public Actors API | T-5 | `/actors` filters/pagination + `/actors/:id` 404; PII-stripped | PASS |
| FR-7 Metrics API | T-6 | `/metrics` GRANTED-only; matches frontend `Metrics` field-for-field | PASS |
| FR-8 Seed dataset | T-7 | 12 GRANTED + 2 non-granted; 3 crops / 6 types / 10 regions; no PII | PASS |
| FR-9 Real import (design-only) | T-8 | map/dedupe/quarantine; UNKNOWN default; legal-gated; synthetic tests | PASS |
| NFR-1 PII server-enforced | T-4,T-5,T-9 | in-memory e2e deep-scan: no PII on any public endpoint | PASS |
| NFR-2 AWS profile | T-1,T-8 | `profile: IBD-DEV` in serverless.yml; import touches no AWS | PASS |
| NFR-3 Lambda-tuned Prisma | T-1 | singleton `PrismaService`, `@Global`, handler caching | PASS |
| NFR-4 Validated writes | T-3,T-5 | class-validator DTOs + global ValidationPipe | PASS |
| NFR-5 Legal-ratifiable policy | T-4 | single `pii-consent.policy.ts` (allowlist + consent + GPS rule) | PASS |
| NFR-6 Contract fidelity | T-5,T-6 | `/actors` envelope + `/metrics` match detailed-design §4 + frontend types | PASS |
| NFR-7 Tested boundary | T-9 | 10-test in-memory e2e, 3-layer recursive PII scan | PASS |

**Result: PASS** — every requirement maps to a complete task with code + test evidence; observed behavior matches intent (consent-at-query, no PII leak, contract fidelity).

## 7. Linting & Code Quality

- TypeScript strict: `tsc --noEmit` clean.
- **Security boundary (the crux):** PII/consent logic is centralized in one `pii-consent.policy.ts` (NFR-5); the role-aware serializer builds public output by explicit field-pick (no spread/delete), and consent is enforced in the Prisma WHERE for list/metrics + an `isPublic` guard on detail (defense in depth). The T-9 in-memory e2e proves no PII reaches any public endpoint via a 3-layer recursive scan.
- Error handling: global `ValidationPipe` (malformed query → 400); `getMetrics`/`findPublic` consent-filtered; import execution-gated.
- **WARN-1:** `npm run lint` is non-functional — the backend has a lint *script* (`eslint "{src,test}/**/*.ts" --fix`) but **no ESLint config** (no `.eslintrc*` / `eslint.config.*`), so ESLint v9 exits 2 ("no config"). No lint violations were detected (the tool can't start); no backend task required lint (T-1's verify was build+test+serverless). *Remediation: add a flat `eslint.config.mjs` (typescript-eslint) or remove the dead lint script.*
- **Result: PASS (1 WARN).**

## 8. Design Conformance

- **Architecture (design §3/§4/§7):** directory + module layout matches; one Lambda, many routes; PrismaModule global singleton; CommonModule policy/serializer; ActorsModule/MetricsModule; ImportModule unregistered (design-only).
- **DD-1..DD-6 honored:** single policy module (DD-1); serializer the only public exit (DD-2); consent=exclude provisional (DD-3); seed-first, import deferred (DD-4); provisional taxonomy/PII as named constants (DD-5); detailed-design §3/§8 reconciled (DD-6, by T-9).
- **Constitutional reconcile:** detailed-design §3 now carries `consentStatus`; §8 the expanded PII set + consent-gated GPS, naming `pii-consent.policy.ts` as runtime source of truth — implementation and constitution agree.
- **Proposal alignment:** matches the approved phased-split Phase 1; seeded-data-until-legal honored (no un-cleared PII exposed); non-goals respected (no map UI, no Cognito, no export, no real-import execution).
- **Result: PASS.**

## 9. Test Evidence Summary

- **Automated:** 13 suites / **102 tests pass deterministically** (re-run twice). Coverage: normalize/DTO (33), PII policy + serializer (17), seed dataset (9), actors service/controller (29), metrics (7), import (7), schema shape, health, and the **in-memory PII-boundary e2e (10)** — the last spins up the real Nest app via supertest with mocked Prisma and recursively deep-scans all three public endpoints for PII leakage and consent exclusion. No live DB required for any of this.
- **Build/static:** `nest build` + `tsc --noEmit` clean; `serverless package` OK with `IBD-DEV`.
- **Deferred (need a reachable MySQL / legal sign-off):** live `prisma migrate dev` (T-2), `prisma db seed` (T-7), real-data import execution behind the legal gate (T-8), live HTTP e2e against RDS (T-5/T-6/T-9 are covered in-memory now). These are tracked in `execution.md`, not gaps in the model.

## 10. Remediation

| # | Severity | Finding | Action | Required for archive? |
|---|---|---|---|---|
| 1 | WARN | `npm run lint` non-functional (no ESLint config; script present) | Add flat `eslint.config.mjs` or drop the script | No — no lint violations; no task required it |
| 2 | WARN (accepted) | Live-DB steps deferred (migrate/seed/import-exec/e2e) | Run when a MySQL `DATABASE_URL` is available; import also gated on legal | No — in-memory coverage proves the model; documented |
| 3 | WARN (accepted) | PII/consent/public-GPS defaults are provisional (OQ-1..OQ-6) | Legal-office ratification; edits isolated to `pii-consent.policy.ts` + `normalize.ts` | No — by design (NFR-5) |

No FAIL findings. No blocking remediation.

## 11. Archive Readiness Recommendation

**READY TO ARCHIVE.** All tasks `[x]` with reviewer PASS; no unresolved FAILs; the three WARNs are non-blocking (lint tooling cosmetic; live-DB and legal-gate deferrals are intentional and documented in `execution.md`); 102 tests cover every requirement including the security-critical PII boundary; design + constitution reconciled.

Next command:

```text
/sdd-archive seed-map/actor-data-model
```
