# Tasks — Canonical Actor data model + consent/PII foundation

- Spec path: docs/specs/seed-map/actor-data-model/
- Status: Draft
- Depth: Full
- Traces: requirements.md (FR-1..FR-9, NFR-1..NFR-7), design.md (§4–§12)
- Commit standard: `[SPEC:seed-map/actor-data-model] <message>`
- Branch: `feature/seed-map-actor-data-model`

## Dependency Graph

```
T-1 ─▶ T-2 ─┬─▶ T-3 ─┐
            ├─▶ T-4 ─┼─▶ T-5 ─┬─▶ T-9
            └─▶ T-7  │        │
                     ├─▶ T-6 ─┘
            T-3 ─▶ T-8
```

A task is eligible when its status is `[ ]`/`[~]` and all deps are `[x]`. Ties broken by document order.

---

- [x] T-1 Bootstrap NestJS + Prisma + Serverless backend  (deps: none)
      Size: M
      Requirements: FR-1, NFR-2, NFR-3
      Design: design.md §3, §4, §7
      Scope: Create `backend/` — NestJS app, `serverless.yml` (Lambda + API Gateway; `provider.profile: IBD-DEV`), `serverless-http` handler (`lambda.ts`), `PrismaModule`/`PrismaService` (Lambda-tuned singleton, `$connect` on init), `app.module.ts`, and `GET /api/v1/health`. `package.json` scripts (build/test/lint). Do NOT add Cognito/auth (Public assumed for v1).
      Tests / Verify: `cd backend && npm install && npm run build`; `npm run start` (or e2e) hits `/api/v1/health` → 200; `npx serverless package --profile IBD-DEV` succeeds (no deploy).
      Done when: backend builds, health route responds, serverless packages with the IBD-DEV profile.
      Skills: nestjs-expert, aws-serverless

- [x] T-2 Actor/Crop schema + migration + ConsentStatus  (deps: T-1)
      Size: M
      Requirements: FR-2
      Design: design.md §5
      Scope: Author `prisma/schema.prisma` with `Actor`, `Crop`, `CropsOnActors`, `ConsentStatus` enum (all fields + indexes per design §5). Generate the migration. Wire `prisma generate`.
      Tests / Verify: `cd backend && npx prisma validate`; `npx prisma migrate dev` (against a local/test MySQL) creates tables; round-trip test writes+reads a fully-populated actor (decimals intact).
      Done when: migration applies; schema round-trips a record.
      Skills: nestjs-expert

- [x] T-3 Normalization + validated write DTOs  (deps: T-2)
      Size: M
      Requirements: FR-3, NFR-4
      Design: design.md §4, §7 (`normalize.ts`), §12
      Scope: `common/normalize.ts` (region → canonical Tanzania list w/ dirty-value mapping + quarantine signal; `sex` → M/F/Other/null; `traderType` → canonical taxonomy OQ-2; GPS range guards; capacity coercion). `actors/dto/*` with `class-validator` (GPS ∈ range, email format, capacity ≥ 0, enum membership). Reject invalid writes (400).
      Tests / Verify: `cd backend && npm run test -- normalize dto`; unit tests: dirty region mapped/quarantined, latitude 120 → invalid, bad email → invalid, capacity −1 → invalid.
      Done when: normalization + DTO validation enforced and unit-tested.
      Skills: nestjs-expert, error-handling-patterns

- [x] T-4 PII/consent policy module + role-aware serializer  (deps: T-2)
      Size: M
      Requirements: FR-4, FR-5, NFR-1, NFR-5
      Design: design.md §5 (public projection), §7, §10 (DD-1..DD-3)
      Scope: `common/pii-consent.policy.ts` — export `PII_ALLOWLIST` (`{phone,email,sex,position,marketLocation,technicalSupport}`), `isPublic(actor)` (`consentStatus === GRANTED`), `publicGps(actor)` (exact only when GRANTED else null). `common/role-aware.serializer.ts` — `toPublic(actor)` returns the design §5 public projection, stripping every allowlist field and gating exact GPS. Single source of truth (NFR-5); no other module re-implements PII logic.
      Tests / Verify: `cd backend && npm run test -- pii policy serializer`; unit tests: `toPublic` output contains none of the allowlist fields; GPS present only when GRANTED; non-granted → excluded/no exact GPS.
      Done when: serializer provably strips PII + gates GPS by consent, driven solely by the policy module.
      Skills: nestjs-expert, error-handling-patterns

- [x] T-5 Public Actors API (list + detail, filters, pagination)  (deps: T-3, T-4)
      Size: M
      Requirements: FR-6, NFR-1, NFR-6
      Design: design.md §4, §6, §7
      Scope: `actors.module/controller/service`. `findPublic(query)` filters `consentStatus = GRANTED` + `crop`/`role`/`region`, paginates, maps every row through `RoleAwareSerializer.toPublic`. `GET /api/v1/actors` (`?crop=&role=&region=&page=&pageSize=`) and `GET /api/v1/actors/:id` (404 if not public). Match the detailed-design §4 contract; export `PublicActor` type.
      Tests / Verify: `cd backend && npm run test -- actors`; e2e: filter by region returns only GRANTED+stripped actors; `:id` of a non-public actor → 404; pagination shape correct.
      Done when: endpoints return PII-safe, consent-filtered, paginated results matching the contract.
      Skills: nestjs-expert, api-design-principles

- [x] T-6 Metrics API (home-page contract)  (deps: T-4, T-5)
      Size: S
      Requirements: FR-7, NFR-6
      Design: design.md §4, §6, §7
      Scope: `metrics.module/controller/service` — `GET /api/v1/metrics` returns `{actorsMapped, cropsTracked, regionsCovered, actorTypes, crops:[{slug,mappedActors}]}` computed over `GRANTED` actors only. Shape MUST equal the frontend `Metrics` type (archived home-page `lib/api/metrics.ts`).
      Tests / Verify: `cd backend && npm run test -- metrics`; test: 10 GRANTED + 5 UNKNOWN → `actorsMapped = 10`; payload shape matches the `Metrics` interface field-for-field.
      Done when: metrics reflect only consented actors and match the existing frontend contract.
      Skills: nestjs-expert, api-design-principles

- [x] T-7 Seed consented sample dataset  (deps: T-2)
      Size: S
      Requirements: FR-8
      Design: design.md §4 (seed.ts), §10 (DD-4)
      Scope: `prisma/seed.ts` — a reproducible set of `consentStatus = GRANTED` sample actors (no real PII; safe org names) spanning the three crops, multiple `traderType`s, and several regions, with valid GPS. Wire `prisma db seed`.
      Tests / Verify: `cd backend && npx prisma db seed` then `npm run test -- seed` (or query): `/actors` returns the sample set; `/metrics` aggregates are non-zero.
      Done when: a fresh DB seeds a usable, consented map/metrics dataset with no real PII.
      Skills: nestjs-expert

- [x] T-8 Import service (design-only, execution deferred)  (deps: T-3)
      Size: S
      Requirements: FR-9, NFR-2
      Design: design.md §7 (ImportModule), §11
      Scope: `import/import.service.ts` — parse the real file shape, normalize per T-3, dedupe on `traderId`, quarantine rows missing `traderId`/GPS, set `consentStatus = UNKNOWN`. Guard behind an explicit ops command; NEVER auto-run; do NOT commit or read real PII data in tests (use synthetic rows). Note the legal gate in code + docs.
      Tests / Verify: `cd backend && npm run test -- import`; unit tests on synthetic rows: dedupe on traderId, incomplete row quarantined, consent defaults UNKNOWN. No real-data execution.
      Done when: import logic is implemented + unit-tested on synthetic data, execution-gated, real file untouched.
      Skills: nestjs-expert, error-handling-patterns

- [x] T-9 PII-boundary + consent integration tests; reconcile detailed-design §3/§8  (deps: T-5, T-6, T-7)
      Size: M
      Requirements: NFR-1, NFR-7
      Design: design.md §10 (DD-6), §12
      Scope: Integration suite asserting, for EVERY public endpoint (`/actors`, `/actors/:id`, `/metrics`), that the response body contains none of the PII allowlist fields and no exact GPS for non-granted actors; and that `UNKNOWN`/`DENIED` actors never appear. Update `docs/detailed-design/detailed-design.md` §3 (add `consentStatus`) and §8 (expanded PII set) so the constitution matches the implemented model.
      Tests / Verify: `cd backend && npm run test` (full suite incl. integration) green; grep the public responses in tests for allowlist fields → none.
      Done when: the PII/consent boundary is proven by integration tests on all public endpoints, and detailed-design §3/§8 reflect the final model.
      Skills: nestjs-expert, error-handling-patterns

## Testing & Verification Expectations

- Each task runs its build/test before completion. Backend tests: `cd backend && npm run test`.
- The PII/consent boundary (FR-4/FR-5/NFR-1) is the security-critical path — proven by unit (T-4) and integration (T-9) tests.
- Any AWS/Serverless action uses `--profile IBD-DEV` (NFR-2). No real Partner Profile PII is committed or executed (DD-4, T-8).

## Coverage Check

FR-1→T-1 · FR-2→T-2 · FR-3→T-3 · FR-4→T-4 · FR-5→T-4/T-5 · FR-6→T-5 · FR-7→T-6 · FR-8→T-7 · FR-9→T-8 · NFR-1→T-4/T-5/T-9 · NFR-2→T-1/T-8 · NFR-3→T-1 · NFR-4→T-3 · NFR-5→T-4 · NFR-6→T-5/T-6 · NFR-7→T-9.

Recommended first task: **T-1**.
