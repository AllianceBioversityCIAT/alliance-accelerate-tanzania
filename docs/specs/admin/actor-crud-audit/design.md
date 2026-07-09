# Design — Admin Actor CRUD + Audit History

- Spec path: docs/specs/admin/actor-crud-audit/
- Status: Approved (JuanCode, 2026-07-09)
- Author / Date: SDD (Leader) — 2026-07-09
- Traces requirements: FR-1..FR-12, NFR-1..NFR-7 (requirements.md, Approved 2026-07-09)
- Related: detailed-design §3/§4/§8; system-design §2/§5/§7/§10; archived `admin/bulk-actor-operations` design (admin surface this extends); `backend/src/actors/`, `backend/src/users/` (Cognito SDK), `frontend/app/(admin)/`

## 1. Approach Overview

Extend the existing Admin actors surface (`AdminActorsController` / `ActorsAdminService` / `admin-actor.serializer.ts`) with **single-actor CRUD routes** and introduce the project's **first schema migration**: an `ActorAuditLog` table written by a small, explicit **`ActorAuditService`** *inside the same Prisma `$transaction`* as every admin mutation (proposal Option A). The two existing bulk operations are retrofitted to write audit rows in their existing transactions — their external contracts do not change. The acting Admin's email is resolved server-side from Cognito (the access token carries only `sub`) and snapshotted into each audit row. The frontend adds create/edit views (query-param addressing, the `/profile` static-export pattern), row actions on the existing table, and a History panel fed by a per-actor history endpoint.

```
Admin ─(Bearer access token)→ API GW → NestJS
  /admin/actors            table + row actions (Edit · Delete) + New actor
  /admin/actors/new        ActorForm ──POST /api/v1/admin/actors─────────┐
  /admin/actors/edit?id=X  ActorForm ──PATCH /api/v1/admin/actors/:id───┤
                           HistoryPanel ─GET .../:id/history            │
                                                                        ▼
                                        AdminActorsController @Roles('Admin')
                                          ActorsAdminService (CRUD + bulk)
                                            └─ $transaction {
                                                 mutate Actor (+ crop links)
                                                 ActorAuditService.log(tx, …)   ← same tx
                                               }
                                          ActingAdminResolver ── Cognito ListUsers(sub) → email
```

## 2. Data Model Changes

First migration since the initial data model — **additive only** (NFR-7). `Actor`, `Crop`, `CropsOnActors` unchanged; `PII_ALLOWLIST` unchanged.

```prisma
enum ActorAuditAction {
  CREATE
  UPDATE
  DELETE
  BULK_CONSENT
  BULK_DELETE
}

model ActorAuditLog {
  id           String           @id @default(cuid())
  // Plain string — deliberately NO relation/FK so rows survive actor deletion (FR-6).
  actorId      String
  // Identity snapshot so history stays meaningful after deletion (FR-6).
  traderId     String
  traderName   String
  action       ActorAuditAction
  actingSub    String           // Cognito sub of the acting Admin (FR-5)
  actingEmail  String?          // snapshot resolved at write time; null if resolution failed
  changes      Json             // diff or snapshot envelope (below)
  acknowledged Boolean?         // consent acknowledgement, when the write granted consent
  createdAt    DateTime         @default(now())

  @@index([actorId, createdAt])
}
```

**`changes` JSON envelope (OQ-3 resolved):**

```jsonc
// UPDATE / BULK_CONSENT — field-level diff; only changed fields appear
{ "kind": "diff", "fields": { "phone": { "from": "+255…", "to": "+255…" },
                              "crops": { "from": ["sorghum"], "to": ["sorghum","groundnut"] } } }
// CREATE / DELETE / BULK_DELETE — full snapshot of the row (admin projection shape)
{ "kind": "snapshot", "values": { "traderId": "T-001", …, "crops": ["sorghum"] } }
```

- `Decimal` fields (capacity, GPS) are serialized **as strings** in `changes` for fidelity (no float drift); crops as the `string[]` of crop names (same shape as the admin serializer).
- **PII note:** `changes` contains PII values. The table is reachable only through the Admin-gated history endpoint; it never passes through any public serializer (FR-12).

**Migration plan:** `prisma migrate dev --name add_actor_audit_log` locally (rehearsal + checked-in SQL); `prisma migrate deploy` against dev RDS during the deploy task (`--profile IBD-DEV`). Reversible: drop table + enum (no existing-table impact). No seed/backfill (history starts at rollout).

## 3. API Surface & Contracts

All new routes on the existing `@Controller('admin/actors')` → `/api/v1/admin/actors`, class-level `JwtAuthGuard` + `RolesGuard` + `@Roles('Admin')` (FR-11). Public `@Controller('actors')` untouched (FR-12). **Declaration order:** `bulk/*` routes stay declared before the new `:id` routes.

| Method | Path | Body / Query | Success | Errors | FR |
|---|---|---|---|---|---|
| POST | `/admin/actors` | `AdminActorCreateDto` | 201 `AdminActor` | 400 validation · 400 GRANTED w/o ack · 409 dup `traderId` | FR-1 |
| GET | `/admin/actors/:id` | — | 200 `AdminActor` | 404 | FR-2 |
| PATCH | `/admin/actors/:id` | `AdminActorUpdateDto` (partial) | 200 `AdminActor` | 400 · 404 · 409 dup `traderId` | FR-3 |
| DELETE | `/admin/actors/:id` | — | 200 `{ deleted: true, id }` | 404 | FR-4 |
| GET | `/admin/actors/:id/history` | `?page&pageSize` (`@Max(100)`) | 200 `{ data: AuditEntry[], page, pageSize, total }` | 400 pagination | FR-7 |

`AdminActor` = existing admin serializer output (all fields + PII + `consentStatus` + `crops: string[]`).
`AuditEntry` = `{ id, actorId, traderId, traderName, action, actingSub, actingEmail, changes, acknowledged, createdAt }`.

**DTOs (`class-validator`, global `ValidationPipe`):**
- `AdminActorCreateDto` — **extends the existing (unwired) `ActorCreateDto`** (canonical region/type enums, GPS bounds, email format) adding: `crops?: string[] @IsIn(CROP_NAMES, {each:true}) @ArrayUnique`, `acknowledged?: @IsBoolean`. `consentStatus: GRANTED` without `acknowledged: true` → 400 (service-enforced, same rule as bulk).
- `AdminActorUpdateDto` — `PartialType(AdminActorCreateDto)`: every field optional; only present fields are applied (FR-3).
- `ActorHistoryQueryDto` — `page? @IsInt @Min(1)`, `pageSize? @IsInt @Min(1) @Max(100)`.

**Error mapping (NFR-4):** Prisma `P2002` on `traderId` → `ConflictException` 409 with a clean message (no Prisma internals, no PII echo); unknown id → 404; validation → 400 with field messages; history for a deleted actor id → **200 with entries** (FR-7), never 404.

## 4. Backend Design

**Directory (extend `backend/src/actors/`):**
```
admin-actors.controller.ts        // +5 routes (bulk routes remain first)
actors-admin.service.ts           // +create / getById / update / remove / history; bulk retrofit
actor-audit.service.ts            // NEW — audit writer + diff builder (tx-scoped)
acting-admin.resolver.ts          // NEW — sub → email via Cognito, per-container cache
dto/admin-actor-create.dto.ts     // NEW — extends ActorCreateDto (+crops, +acknowledged)
dto/admin-actor-update.dto.ts     // NEW — PartialType(AdminActorCreateDto)
dto/actor-history-query.dto.ts    // NEW
audit-entry.serializer.ts         // NEW — toAuditEntry() (Json passthrough, ISO dates)
actor-audit.service.spec.ts       // NEW — diff exactness, snapshot shape
actors-admin.service.spec.ts      // extended
test/admin-actors-crud.e2e.spec.ts// NEW
```

- **`ActorAuditService`** — pure writer, always called with the transaction client:
  - `logCreate(tx, actor, acting)` / `logDelete(tx, actor, acting)` — snapshot envelope from the admin-projection of the row (Decimals → strings).
  - `logUpdate(tx, before, after, acting, acknowledged?)` — `buildDiff(before, after)` over the auditable field set + crops; **if the diff is empty, no row is written** (a no-op PATCH audits nothing).
  - `logBulkConsent(tx, beforeRows, status, acting, acknowledged)` / `logBulkDelete(tx, rows, acting)` — one `createMany` with N rows (single batched insert, NFR-6).
- **`ActingAdminResolver`** — `resolve(sub): Promise<string | null>`: Cognito `ListUsersCommand` with filter `sub = "<sub>"` (pool uses email-as-username, so `username` ≠ email; access token has no email claim — OQ-4 resolved). In-memory `Map` cache per Lambda container. **Failure returns `null` and never blocks the write** (audit row keeps `actingSub`). Resolved *before* opening the transaction (no network call inside the tx).
- **`ActorsAdminService` additions** (all mutations follow: resolve acting → `$transaction { mutate; audit }`):
  - `create(dto, acting)` — tx: `actor.create` (+ `cropsOnActors.createMany` from names→ids), `logCreate`. `P2002` → 409.
  - `getById(id)` — `findUnique` + `CROPS_INCLUDE` → admin serializer; null → 404.
  - `update(id, dto, acting)` — tx: fetch before (+crops) → 404 if missing; GRANTED-transition guard (400 w/o `acknowledged`, mirrors bulk); apply scalar changes; if `crops` present, replace links (`deleteMany` + `createMany`); refetch after; `logUpdate`. Returns admin projection.
  - `remove(id, acting)` — tx: fetch (+crops) → 404 if missing; `logDelete` (snapshot) then `actor.delete` (cascades links).
  - `history(id, q)` — `findMany` `{ actorId: id }` ordered `createdAt desc` (+ tiebreak `id desc`), paginated envelope + `count`. **No existence check on the actor** (FR-7 deleted-actor case).
  - **Bulk retrofit (FR-5):** `bulkSetConsent` — inside the existing tx, fetch befores (id, traderId, traderName, consentStatus), skip already-at-status rows in the diff set, then `updateMany` + `logBulkConsent`. `bulkDelete` — fetch full rows before `deleteMany` + `logBulkDelete`. `BulkResult` responses unchanged; the `console.info` lines may remain.
- Module wiring: `ActorAuditService` + `ActingAdminResolver` added as providers to `ActorsModule`; Cognito client config reused from the users module pattern (`auth.config.ts` / `UserPoolId` env already present).

## 5. Frontend Design

**Directory:**
```
frontend/app/(admin)/admin/actors/new/page.tsx    // 'use client' — create view
frontend/app/(admin)/admin/actors/edit/page.tsx   // 'use client' — edit view (?id=…, Suspense-wrapped)
frontend/components/admin/ActorForm.tsx           // NEW shared form (create + edit modes)
frontend/components/admin/ActorHistoryPanel.tsx   // NEW history list (edit view)
frontend/components/admin/ActorsTable.tsx         // + row actions column (Edit · Delete)
frontend/app/(admin)/admin/actors/page.tsx        // + "New actor" button, row-delete wiring
frontend/lib/api/actors-admin.ts                  // + adminGetActor / createActor / updateActor / deleteActor / getActorHistory
```

- **Routing (NFR-2, OQ-5 resolved):** `/admin/actors/edit?id=<actorId>` using `useSearchParams()` inside a `<Suspense>` boundary — the exact `/profile` pattern (CSR bailout note in `profile/page.tsx`). No dynamic path segments; export build stays green. Missing/unknown `id` → inline not-found state with a back link.
- **`ActorForm` (FR-8):** one component, `mode: 'create' | 'edit'`, `initialValues?` from `adminGetActor`. Sections: Identity (traderId, traderName, type, sex, position) · Location (region select from canonical list, district, market location, GPS inputs) · Capacity & support · Contact (phone, email — PII, admin-only surface) · Crops (checkbox group of the 3-crop catalog) · Consent (select). Client validation mirrors the DTO (required, GPS bounds, email format); server 400 field errors mapped inline via `aria-describedby`; 409 dup-`traderId` rendered on that field. Submitting a change that sets consent to `GRANTED` (from another status) opens the existing **`AcknowledgeDialog`** first and sends `acknowledged: true` (FR-3/FR-8).
- **Row actions (FR-9):** actions column at the row end — Edit (link to `edit?id=`) and Delete (opens the existing **`ConfirmDialog`** typed-confirm, calls `deleteActor`, refetches, result via the existing live-region summary). Selection/bulk behavior untouched; a "New actor" primary button joins the toolbar.
- **`ActorHistoryPanel` (FR-10):** in the edit view under the form. Each entry: action badge (token colors per system-design §7), actingEmail (fallback `actingSub`), `createdAt` formatted, and the change detail — diff entries as "field: from → to" rows; snapshots summarized ("created with N fields", expandable). "Load more" pagination (`pageSize` ≤ 100, API cap per `api-pagesize-cap` convention); loading / empty ("No changes recorded") / error states.
- Tokens only; WCAG AA: labeled inputs, error association, keyboard-operable dialogs and history list; focus management on dialog open/close (existing dialog components already comply).

## 6. Security & RBAC

- **Authoritative gate:** class-level `@Roles('Admin')` covers all five new routes automatically (FR-11); e2e asserts 401/403/2xx per route.
- **Audit PII containment (FR-12):** `AuditEntry` is served **only** by the history route on the Admin controller; no public serializer imports the audit serializer; error bodies and logs never include `changes` content. Existing `pii-boundary` tests must stay green.
- **Trustworthy attribution:** `actingSub` comes from the verified JWT (`jwt-auth.guard.ts`); `actingEmail` is resolved server-side from Cognito — never accepted from the client (spoof-proof audit identity).
- **Consent safeguard:** the GRANTED-transition acknowledgement is enforced in the service (create and update), same rule as bulk unlock; the acknowledgement is now **persisted** on the audit row (previously CloudWatch-only).
- No new IAM: `cognito-idp:ListUsers` already granted to the API function; writes are DB-only. CORS already allows `POST/PATCH/DELETE`.

## 7. Infrastructure / Deployment

- **No template change** (routes ride the existing proxy integration; IAM/CORS sufficient).
- **New deploy step — first live migration (NFR-7):** run `npx prisma migrate deploy` against dev RDS before/with the backend deploy (`--profile IBD-DEV`), using the checked-in migration SQL rehearsed locally. Additive-only; rollback = revert code + `DROP TABLE ActorAuditLog` (+ enum) — existing tables untouched.
- Standard backend package/deploy + frontend `deploy-frontend.sh` afterwards.

## 8. Decision Records (ADR-style)

### Decision: explicit audit service inside each write transaction (proposal Option A)
- **Context:** audit must be atomic with the mutation and attributable to the acting Admin. **Options:** explicit tx-scoped writer; Prisma middleware auto-audit; app-level event/log pipeline. **Decision:** explicit writer called with the tx client. **Consequences:** call sites are visible and testable; attribution flows naturally from the controller; auditing is scoped to exactly the admin surfaces. Middleware rejected (user smuggling into Prisma context, audits seeds/imports indiscriminately).

### Decision: `actorId` without FK + identity snapshot on every row
- **Context:** FR-6 requires history to survive deletion. A FK with `onDelete: Cascade` would erase history; `SetNull` would orphan rows anonymously. **Decision:** plain indexed string + `traderId`/`traderName` snapshot. **Consequences:** no referential integrity on audit rows (acceptable — append-only evidence), deleted actors stay identifiable.

### Decision: single `changes` Json column with a `kind` envelope; Decimals as strings
- **Context:** diffs and snapshots need one queryable home (OQ-3). **Options:** Json envelope; per-field EAV rows; separate diff/snapshot tables. **Decision:** one Json column — `{kind:'diff',fields}` / `{kind:'snapshot',values}`; Decimal/GPS as strings for fidelity. **Consequences:** simple writes/reads, schema stays stable if fields evolve; field-level SQL querying is not supported (fine — access is per-actor via the endpoint).

### Decision: acting email resolved via Cognito `ListUsers(sub)`, snapshotted, nullable
- **Context:** the frontend authenticates with the **access token** (`lib/api/client.ts`), which has no `email` claim; the pool uses email-as-username so the `username` claim is a UUID (OQ-4). **Options:** switch the app to ID tokens (auth-contract change, out of scope); trust a client-sent email (spoofable — unacceptable for audit); resolve server-side at write time. **Decision:** `ActingAdminResolver` with per-container cache, resolved before the tx; `null` on failure (write never blocked). **Consequences:** one cached Cognito call per admin writer per container; email is a point-in-time snapshot (correct audit semantics).

### Decision: edit view addressed by query param (`/admin/actors/edit?id=…`)
- **Context:** static export forbids dynamic segments without `generateStaticParams` (OQ-5). **Decision:** reuse the `/profile` `useSearchParams` + Suspense pattern. **Consequences:** consistent with the codebase; ugly-but-working URLs; zero export risk. Rejected: `[id]` segment (breaks export for unknown ids).

### Decision: empty diff ⇒ no audit row
- **Context:** a PATCH that changes nothing (or a bulk consent over rows already at the target status) would create noise entries. **Decision:** audit only actual changes; bulk consent rows already at the target status are excluded from the diff set (they are still counted in `BulkResult.applied` exactly as today — response contract unchanged). **Consequences:** history reflects real changes; tests assert diff exactness.

### Decision: crops updated by full replacement within the transaction
- **Context:** crop links are a small fixed set (3 crops). **Decision:** when `crops` is present in the DTO, `deleteMany` + `createMany` inside the tx; diff records `crops: {from, to}` as name arrays. Rejected: per-link reconciliation (needless complexity).

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| First live migration against dev RDS | additive-only; rehearsed locally with checked-in SQL; `migrate deploy` (never `dev`) in the pipeline; documented rollback (drop table) |
| PII in audit rows leaks | audit served only via Admin controller; no public serializer touches it; e2e 401/403 per route; pii-boundary regression green |
| Route collision `:id` vs `bulk/*` | bulk routes declared first; e2e covers both post-change |
| Cognito email resolution slow/failing | resolved pre-tx, cached per container, nullable — never blocks or corrupts the write |
| Audit/mutation divergence | single `$transaction` per mutation; rollback test asserts no orphan audit rows |
| Duplicate `traderId` UX | `P2002` → 409 clean message; form maps it inline to the field |
| Bulk audit volume (≤500 rows) | one `createMany` per bulk op (NFR-6); bounded by existing `@ArrayMaxSize(500)` |
| Decimal fidelity in diffs | stored as strings; serializer tests pin the format |

## 10. Test Plan Outline

- **Unit — `actor-audit.service.spec.ts`:** `buildDiff` exactness (only changed fields; crops from/to; Decimal→string; empty diff → no write); snapshot shape for create/delete.
- **Unit — `actors-admin.service.spec.ts` (extended):** create (crops links, P2002→409, GRANTED w/o ack→400, audit called in tx); update (partial apply, before/after diff, crop replacement, 404); remove (snapshot logged before delete, 404); history (order, pagination, no-existence-check); bulk retrofit (N audit rows via createMany, acknowledged persisted, `BulkResult` unchanged).
- **Unit — `acting-admin.resolver.spec.ts`:** cache hit/miss, Cognito failure → null.
- **E2E — `admin-actors-crud.e2e.spec.ts`:** per route 401 / 403 (Staff, Public) / success (Admin) — FR-11; full lifecycle: create → detail → update (diff visible via history) → history for updated actor → delete → **history still returns entries for the deleted id** (FR-6/7); consent GRANTED transition w/o ack → 400; duplicate traderId → 409; tx rollback leaves no audit row; **public `GET /actors` + `pii-boundary.spec.ts` unchanged** (FR-12).
- **Frontend (RTL):** ActorForm validation + inline 400/409 mapping; acknowledgement gating on consent→GRANTED; row Edit navigates with `?id=`; row Delete typed-confirm flow + refetch; HistoryPanel renders diff rows / snapshot summary / empty state; export build green.
- **Gates:** backend + frontend `npm test` green; `npm run build` (static export) green; migration applies on a clean local MySQL.
