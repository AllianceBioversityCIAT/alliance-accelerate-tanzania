# Design — Admin Bulk Actor Operations

- Spec path: docs/specs/admin/bulk-actor-operations/
- Status: Draft
- Author / Date: SDD (Leader) — 2026-07-01
- Related: requirements.md (FR-1..FR-9, NFR-1..6); detailed-design §4/§8; system-design §2/§5/§8/§10; `backend/src/actors/`, `backend/src/common/`, archived `admin/user-management` foundation

## 1. Approach Overview

Extend the existing `actors` domain with a **separate Admin-gated surface** (new controller + admin serializer + bulk service methods) rather than overloading the public read path. Add a `/admin/actors` selectable table in the reused `(admin)` shell. All bulk mutations are transactional and return a per-id result. Unlock (publishing PII/GPS) is guarded by a **server-enforced acknowledgement flag** plus a typed UI acknowledgement. **No schema and no infra changes** — writes hit MySQL via Prisma; CORS/routes already allow `POST/PATCH`; auth/guards/`apiFetch`/`ConfirmDialog` are reused.

```
Admin ─(Bearer)→ API GW (POST/PATCH already allowed) → NestJS
  /admin/actors (RequireRole=Admin)          AdminActorsController @Roles('Admin')
      │ actors-admin.ts (apiFetch)                 │ JwtAuthGuard + RolesGuard
      ▼                                            ▼
  ActorsTable (multi-select) + BulkActionBar   ActorsAdminService
   → ConfirmDialog / AcknowledgeDialog          - adminList(query)            → Prisma (all statuses, PII)
                                                 - bulkSetConsent(ids,status) → $transaction updateMany
                                                 - bulkDelete(ids)            → $transaction deleteMany (cascade)
                                                 admin serializer (PII + consentStatus)
```

## 2. Data Model Changes

**None.** Bulk ops write `Actor.consentStatus` (`GRANTED`/`DENIED`) and delete `Actor` rows; `CropsOnActors` cascade-deletes via the existing `onDelete: Cascade`. No new columns/tables, no new PII fields. The consent acknowledgement is recorded at the **action/log level** (DR-5), not as an actor column.

## 3. API Surface & Contracts

New Admin-only controller `@Controller('admin/actors')` → `/api/v1/admin/actors`, every route `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')` (mirrors `users.controller.ts`). The public `@Controller('actors')` is untouched (FR-7).

| Method | Path | Body | Success | FR |
|---|---|---|---|---|
| GET | `/admin/actors` | — (`?page&pageSize&region&traderType&consentStatus`) | 200 `{ data: AdminActor[], page, pageSize, total }` | FR-1 |
| PATCH | `/admin/actors/bulk/consent` | `BulkConsentDto` | 200 `BulkResult` | FR-3, FR-4 |
| POST | `/admin/actors/bulk/delete` | `BulkDeleteDto` | 200 `BulkResult` | FR-5 |

`AdminActor` = full actor incl. PII + `consentStatus` (admin serializer). `BulkResult = { requested: number, applied: number, notFound: string[] }`.

**DTOs (`class-validator`, global `ValidationPipe`):**
- `AdminActorListQueryDto`: `page? @IsInt @Min(1)`, `pageSize? @IsInt @Min(1) @Max(100)`, `region? @IsString`, `traderType? @IsString`, `consentStatus? @IsIn(['GRANTED','DENIED','UNKNOWN'])`.
- `BulkConsentDto`: `ids: string[] @ArrayNotEmpty @ArrayUnique @ArrayMaxSize(500) @IsString({each:true})`; `consentStatus @IsIn(['GRANTED','DENIED'])`; `acknowledged? @IsBoolean`.
- `BulkDeleteDto`: `ids: string[]` (same array constraints).

**POST for delete-many** (not `DELETE` with a body): request bodies on `DELETE` are unreliable through proxies; `POST /bulk/delete` is explicit and matches the gateway's `ProxyPost` route.

**Error mapping (NFR-4):** validation → 400 (bad ids/over-cap/invalid status); unlock without `acknowledged:true` → 400; non-Admin → 403 / 401; unexpected → 500 (generic). No PII/secret in logs.

## 4. Backend Design

**Directory (extend `backend/src/actors/`):**
```
admin-actors.controller.ts   // @Controller('admin/actors'), 3 routes, @Roles('Admin')
actors-admin.service.ts      // adminList / bulkSetConsent / bulkDelete (transactional)
admin-actor.serializer.ts    // toAdminActor(): full fields incl. PII + consentStatus
dto/admin-actor-list-query.dto.ts
dto/bulk-consent.dto.ts
dto/bulk-delete.dto.ts
actors-admin.service.spec.ts // unit (Prisma mocked)
admin-actors.e2e-spec.ts     // RBAC + flows + public-read-unchanged
```
- `AdminActorsController` registered via the existing `ActorsModule` (add controller + provider). Guards are reused (zero-dep / Reflector).
- **`ActorsAdminService`** injects `PrismaService`:
  - `adminList(q)` — `findMany` with optional `region`/`traderType`/`consentStatus` filters (NO `GRANTED` pin), `count`, paginated envelope; rows via `toAdminActor`.
  - `bulkSetConsent(ids, status, actingSub, acknowledged)` — if `status==='GRANTED'` and `!acknowledged` → `BadRequestException`. In `prisma.$transaction`: query existing ids → compute `notFound`; `updateMany({ where: { id: { in: found } }, data: { consentStatus: status } })`. Return `BulkResult`. Log `{ action:'bulk-consent', status, actingSub, count, acknowledged }` (DR-5).
  - `bulkDelete(ids, actingSub)` — in `$transaction`: existing ids → `notFound`; `deleteMany({ where: { id: { in: found } } })` (cascades `CropsOnActors`). Return `BulkResult`; log.
- **`admin-actor.serializer.ts`** — explicit projection of ALL actor fields incl. PII + `consentStatus` (distinct from `toPublic()`); this is the ONLY place non-consented PII exits, only via the Admin-gated controller (FR-7).
- Public `actors.service.ts`/`toPublic()`/`GET /actors` unchanged; `pii-consent.policy.ts` unchanged.

## 5. Frontend Design

**Directory:**
```
frontend/app/(admin)/admin/actors/page.tsx     // 'use client' console
frontend/components/admin/ActorsTable.tsx       // selectable table (checkboxes, consent badge, PII cols)
frontend/components/admin/BulkActionBar.tsx     // Unlock · Lock · Delete (on selection)
frontend/components/admin/AcknowledgeDialog.tsx // typed-acknowledgement confirm (unlock)
frontend/lib/api/actors-admin.ts                // adminListActors / bulkSetConsent / bulkDeleteActors (Bearer)
```
- **Static export safe (NFR-2):** pages `'use client'`, gated by the shell's `<RequireRole allow={['Admin']}>`. `lib/api/actors-admin.ts` uses `apiFetch` with the session token (like `lib/api/users.ts`).
- **Table (FR-1/2):** all actors, `consentStatus` badge (e.g. GRANTED=published, DENIED=hidden, UNKNOWN=neutral), PII columns; row checkboxes + select-all-on-page; filters (region, type, consent). Table on `md+`, cards on mobile.
- **BulkActionBar (FR-3/5):** appears when ≥1 selected, shows count; **Unlock** → `AcknowledgeDialog` (typed phrase, e.g. "I confirm consent is on file"), **Lock** → `ConfirmDialog`, **Delete** → `ConfirmDialog` (typed count/confirm). Buttons disabled in-flight; result summary (N applied, M not found) via live region; table refetches after.
- **`AcknowledgeDialog`** = a variant of the reused `ConfirmDialog` with a required text input that must match the phrase before the confirm button enables (FR-4). Sends `acknowledged: true`.
- Tokens only; WCAG AA (labeled checkboxes, focus, live-region results). Activate the **Actors** item in `AdminSidebar` (`enabled: true`, href `/admin/actors`).

## 6. Security & RBAC

- **Authoritative gate:** server-side `@Roles('Admin')` on all 3 routes (FR-6); e2e asserts 401/403/2xx.
- **PII containment (FR-7):** admin serializer + admin-only routes are the only PII exit for non-consented actors; public path + `pii-boundary.spec.ts` unchanged. Admin routes not publicly cacheable.
- **Consent safeguard (FR-4):** server requires `acknowledged:true` for `GRANTED` (defense in depth beyond the UI); acknowledgement logged with acting `sub` + timestamp.
- **No new IAM/CORS** — DB-only writes; `POST/PATCH` already allowed. Deploy `--profile IBD-DEV`.

## 7. Infrastructure / Deployment

None. No template change (routes/CORS already present from user-management). Deploy = standard backend (`cloudformation package`/`deploy` path, no Docker) + frontend (`deploy-frontend.sh`), `--profile IBD-DEV`. Rollback = revert code (no infra/schema migration).

## 8. Decision Records (ADR-style)

### Decision: `consentStatus` is the visibility control (no new flag)
- Lock/unlock map onto `DENIED`/`GRANTED`; there is no separate publish flag and adding one would fork the single public-visibility gate. Rejected: new `published` column (migration + dual gate).

### Decision: separate Admin controller/serializer, public path untouched
- Keeps the consent-gated public read and PII boundary provably unchanged (FR-7); admin PII exposure is isolated to one Admin-gated surface. Rejected: an `?admin=true` flag on public `GET /actors` (risks a gate bug leaking PII).

### Decision: server-enforced `acknowledged` flag for unlock
- FR-4 enforced server-side (400 without it), not just in the UI — the consent acknowledgement can't be bypassed by calling the API directly. Rejected: UI-only acknowledgement.

### Decision: per-id result via pre-query + `updateMany`/`deleteMany` in one transaction
- Query existing ids → report `notFound`, then bulk-apply to found ids atomically. Simpler + faster than per-row updates while still giving a per-item result (NFR-4). Rejected: N single-row writes (slow, non-atomic).

### Decision: acknowledgement recorded via structured log (persistence deferred)
- Audit-log persistence was deferred in `admin/user-management` (OQ-3); record acting sub/timestamp/ids-count/acknowledged in logs now; a durable audit log is a future cross-cutting module. [OQ-4]

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| PII leak (admin list returns PII) | server-side `@Roles('Admin')`; admin serializer isolated; public + pii-boundary tests unchanged; no public cache |
| Consent bypass on unlock | server requires `acknowledged:true` for GRANTED; logged |
| Irreversible bulk delete | typed confirm + affected count + per-item result; Admin-only; transactional |
| Partial corruption | `$transaction` per bulk op (NFR-4) |
| Oversized batch | `@ArrayMaxSize(500)` + non-empty/unique validation |
| Public read regression | public controller/service untouched; regression asserted in e2e |

## 10. Test Plan Outline

- **Backend unit (`actors-admin.service.spec.ts`):** Prisma mocked — `bulkSetConsent` flips status + reports notFound; `GRANTED` without `acknowledged` throws 400; `bulkDelete` calls deleteMany on found ids + reports notFound; `adminList` applies filters without the GRANTED pin; serializer includes PII + consentStatus.
- **Backend e2e (`admin-actors.e2e-spec.ts`):** each route 401 (no token) / 403 (Staff & Public) / 2xx (Admin); over-cap ids → 400; unlock without acknowledgement → 400; and **public `GET /actors` still returns only GRANTED with no PII** (regression) + existing `pii-boundary.spec.ts` green.
- **Frontend (RTL):** `/admin/actors` renders selectable rows; select → BulkActionBar; Unlock opens AcknowledgeDialog and is blocked until the phrase is typed; Lock/Delete confirm and call the client; result summary renders; non-Admin redirect.
- **Gates:** backend + frontend `npm test` green; `npm run build` (frontend static export) succeeds; public API + PII boundary unchanged.
