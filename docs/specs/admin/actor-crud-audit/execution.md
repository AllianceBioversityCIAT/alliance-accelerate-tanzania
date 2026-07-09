# Execution Log — Admin Actor CRUD + Audit History

- Spec path: docs/specs/admin/actor-crud-audit/
- Status: In Progress
- Leader: OpenCode (JCSPECS Leader mode)
- Started: 2026-07-09

---

## 1. Document Control

| Document | Version / Date | Notes |
|---|---|---|
| requirements.md | Approved 2026-07-09 | FR-1..FR-12, NFR-1..NFR-7 |
| design.md | Approved 2026-07-09 | §1–§10 |
| tasks.md | Draft 2026-07-09 | T-1 selected first |
| execution.md | Created 2026-07-09 | This file |

---

## 2. Task Execution History

### T-1 — Add `ActorAuditLog` model + first migration

- **Status:** PASS
- **Date:** 2026-07-09
- **Task ID / Title:** T-1 — Add `ActorAuditLog` model + first migration
- **Attempts:** 1

#### Attempt 1

- **Files changed:**
  - `backend/prisma/schema.prisma` — added `ActorAuditAction` enum and `ActorAuditLog` model.
  - `backend/prisma/migrations/migration_lock.toml` — Prisma-added header comments.
  - `backend/prisma/migrations/20260709135659_add_actor_audit_log/migration.sql` — new migration (untracked at start of attempt).
- **Implementer verification command:**
  - `cd backend && DATABASE_URL=<composed-from-secrets-manager-in-process> npx prisma migrate deploy`
  - `cd backend && npm run build`
- **Implementer verification output:**
  - Migration applied successfully to dev RDS `accelerate-tz-dev-data-auth-db-5imffsidnqt9.ckr5yv8lavgw.eu-west-1.rds.amazonaws.com:3306/accelerate`.
  - `nest build` completed with no errors.
  - No secrets written to files or printed.
- **Reviewer verdict:** PASS
- **Reviewer summary:** Schema/migration exactly match design.md §2 (`ActorAuditAction` enum values, `ActorAuditLog` fields/types, no FK on `actorId`, `@@index([actorId, createdAt])`), `Actor`/`Crop`/`CropsOnActors` are untouched, and the migration is strictly additive. Backend `npm run build` succeeded; no PII leakage, AWS-profile violation, or stack substitution found.

#### Requirements covered

- FR-5 (audit persistence foundation)
- FR-6 (plain `actorId` + identity snapshot supports history after deletion)
- NFR-7 (additive-only migration; rollback = drop new table + enum)

#### Decisions made

- User redirected T-1 verification from local MySQL rehearsal to the AWS dev RDS. The existing `infra/scripts/migrate-seed.sh` pattern was used to compose `DATABASE_URL` in-process from Secrets Manager; only `prisma migrate deploy` was run (no seed).

#### Issues encountered

- None.

---

### T-2 — Admin CRUD DTOs

- **Status:** PASS
- **Date:** 2026-07-09
- **Task ID / Title:** T-2 — Admin CRUD DTOs
- **Attempts:** 1

#### Attempt 1

- **Files changed:**
  - `backend/src/actors/dto/admin-actor-create.dto.ts` — new; extends `ActorCreateDto`, adds `crops` (validated against fixed 3-crop catalog with `@ArrayUnique`) and `acknowledged`.
  - `backend/src/actors/dto/admin-actor-update.dto.ts` — new; `PartialType(AdminActorCreateDto)`.
  - `backend/src/actors/dto/actor-history-query.dto.ts` — new; paginated history query DTO with `@Type(() => Number)` coercion and `@Max(100)`.
  - `backend/src/actors/dto/admin-actor-dto.spec.ts` — new; 17 unit tests covering accept/reject cases.
  - `backend/package.json` — added `@nestjs/mapped-types` dependency.
  - `backend/package-lock.json` — updated.
- **Implementer verification command:** `cd backend && npm test -- admin-actor-dto`
- **Implementer verification output:** 17 tests passed; regression `npm test -- actor-dto` also passed (33 tests total).
- **Reviewer verdict:** PASS
- **Reviewer summary:** All T-2 deliverables match design.md §3 and requirements.md FR-1/FR-3/FR-7; no PII, AWS-profile, or stack violations.

#### Requirements covered

- FR-1 (create DTO incl. crops + acknowledgement)
- FR-3 (partial update DTO)
- FR-7 (history pagination DTO)
- NFR-1, NFR-4, NFR-6 (validation, clean errors, bounded pagination)

#### Decisions made

- Reused existing `ActorCreateDto` as the base for `AdminActorCreateDto` to preserve all validation rules.
- Defined `CROP_NAMES` constant locally in the DTO file; fixed catalog `sorghum`/`common_bean`/`groundnut`.

#### Issues encountered

- None.

---

### T-3 — `ActingAdminResolver` (sub → email)

- **Status:** PASS
- **Date:** 2026-07-09
- **Task ID / Title:** T-3 — `ActingAdminResolver` (sub → email)
- **Attempts:** 1

#### Attempt 1

- **Files changed:**
  - `backend/src/actors/acting-admin.resolver.ts` — new; injectable resolver using `ListUsersCommand` filtered by `sub`, per-container `Map` cache, returns `string | null`, never throws.
  - `backend/src/actors/acting-admin.resolver.spec.ts` — new; mocked unit tests covering cache hit/miss, SDK error, missing email, user not found.
  - `backend/src/actors/actors.module.ts` — registered `ActingAdminResolver` as provider.
- **Implementer verification command:** `cd backend && npm test -- acting-admin`
- **Implementer verification output:** 5 tests passed; full backend suite also green (23 suites, 198 tests).
- **Reviewer verdict:** PASS
- **Reviewer summary:** Resolver correctly implements T-3 spec: `ListUsersCommand` with `Filter: sub = "..."` and `Limit: 1`, per-container cache, null-on-failure, reuses existing Cognito client pattern, clean state-resetting tests; no PII/AWS-profile/stack violations.

#### Requirements covered

- FR-5 (audit attribution: acting admin email resolution)
- NFR-1, NFR-4 (resilience: null on failure, no write blocked)

#### Decisions made

- Wired `ActingAdminResolver` into `ActorsModule` providers immediately so T-5 can inject it.

#### Issues encountered

- None.

---

### T-4 — `ActorAuditService` + diff builder

- **Status:** PASS
- **Date:** 2026-07-09
- **Task ID / Title:** T-4 — `ActorAuditService` + diff builder
- **Attempts:** 1

#### Attempt 1

- **Files changed:**
  - `backend/src/actors/actor-audit.service.ts` — new; tx-scoped audit writer with `logCreate`, `logDelete`, `logUpdate`, `logBulkConsent`, `logBulkDelete`, diff builder, Decimal→string, crop-name-array serialization.
  - `backend/src/actors/audit-entry.serializer.ts` — new; `toAuditEntry()` mapping `ActorAuditLog` rows to API response shape with ISO `createdAt`.
  - `backend/src/actors/actor-audit.service.spec.ts` — new; 17 unit tests.
- **Implementer verification command:** `cd backend && npm test -- actor-audit`
- **Implementer verification output:** 17 tests passed; `npm run build` succeeded; full backend suite 215 tests green.
- **Reviewer verdict:** PASS
- **Reviewer summary:** `ActorAuditService` is transaction-scoped on every method, produces correct snapshot/diff envelopes with Decimal→string and crop name arrays, skips empty diffs, batches bulk writes via `createMany` while skipping no-change rows, persists `acknowledged` when provided, and `toAuditEntry` passes through `changes` with ISO `createdAt`. No PII/AWS-profile/stack violations.

#### Requirements covered

- FR-5 (audit entry on every admin write)
- FR-6 (identity snapshot in every row)
- NFR-4 (atomic transaction-scoped writes)
- NFR-6 (bulk createMany)

#### Decisions made

- `AdminActor` projection used as the input shape for audit snapshots/diffs.
- `acknowledged` stored on the audit row only when explicitly provided.

#### Issues encountered

- None.

---

