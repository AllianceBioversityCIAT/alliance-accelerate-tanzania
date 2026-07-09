# Proposal — Admin Actor CRUD + Audit History

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `admin/actor-crud-audit` |
| Proposal date | 2026-07-09 |
| Author | SDD (Leader) on behalf of JuanCode |
| Status | **Approved** (JuanCode, 2026-07-09) |
| Suggested depth | **Full** (first single-actor write path, PII-heavy forms, new audit data model + migration) |

## 2. Intent

The **third admin module**: single-actor **CRUD** from the Admin console — an Admin can **create**, **edit**, and **delete** an individual actor — plus a durable **audit history**: every admin write to the registry (the new CRUD *and* the existing bulk consent/delete) is recorded with **who** made the change, **when**, **what action**, and **which fields changed** (before → after). Each actor exposes its own history panel.

This is exactly the sibling module deferred by `2026-07-08-admin--bulk-actor-operations` (its OQ-2: "single-actor create/edit split into a separate sibling spec; the admin list built here can host row-level actions later").

## 3. Problem / Current Behavior

- **No way to fix actor data from the app.** The Admin console (`/admin/actors`) can list, bulk lock/unlock, and bulk delete — but there is **no create form, no edit form, and no per-row delete**. A wrong phone number, region, GPS point, or crop assignment can only be corrected directly in the database.
- **No audit trail.** Admin writes leave no durable record: `bulkSetConsent`/`bulkDelete` only `console.info` the acting user's Cognito `sub` to CloudWatch (`actors-admin.service.ts`), which is not queryable from the app, expires with log retention, and captures no field-level detail. The only timestamp on `Actor` is `updatedAt` — no who, no what.
- **Accountability gap.** Consent unlocks publish PII + GPS; deletes are irreversible. For a registry holding PII of 1,000+ real traders, "quién hizo el cambio y cuándo" is currently unanswerable.

## 4. Proposed Outcome

1. **Single-actor CRUD (Admin-only):**
   - **Create** — `/admin/actors/new`: a form covering the full `Actor` shape (identity, region/district, type, capacity, PII phone/email, GPS, crops, `consentStatus`), with the same validation rules as the data model (unique `traderId`, bounded decimals).
   - **Edit** — `/admin/actors/[id]/edit`: same form pre-filled; saves only what changed.
   - **Delete** — per-row action with typed confirmation (reusing the bulk-delete dialog pattern), cascades crop links.
   - Row-level actions surfaced from the existing `/admin/actors` table.
2. **Audit history (all admin writes):** every mutation — single create/update/delete **and** bulk consent/delete — writes audit entries **in the same transaction** as the change, recording:
   - **who**: Cognito `sub` + email of the acting Admin,
   - **when**: timestamp,
   - **action**: `CREATE | UPDATE | DELETE | BULK_CONSENT | BULK_DELETE`,
   - **what**: field-level diff (`{ field: { from, to } }`); create stores the initial values, delete stores a final snapshot; bulk consent also persists the typed **consent acknowledgement** (today only logged to CloudWatch).
3. **Per-actor history panel:** the actor edit page shows a "History" section listing that actor's audit entries (user, date, action, changed fields), newest first, paginated. Served by an Admin-only endpoint.

## 5. Scope

**Data model (`backend/prisma/`):** new `ActorAuditLog` model + migration — first schema migration since the initial data model. `actorId` stored as a plain indexed string (no FK cascade) plus a small identity snapshot (`traderId`, `traderName`) so history **survives actor deletion**; `changes` as `Json`; `action` enum; `actorSub` + `actorEmail`; `createdAt`.

**Backend (`backend/src/actors/` — extend the existing module):**
- `POST /api/v1/admin/actors` (create), `PATCH /api/v1/admin/actors/:id` (update), `DELETE /api/v1/admin/actors/:id` (delete), `GET /api/v1/admin/actors/:id` (fetch for edit form), `GET /api/v1/admin/actors/:id/history` (paginated audit entries). All behind the existing `JwtAuthGuard + RolesGuard + @Roles('Admin')` stack.
- An `ActorAuditService` (or equivalent) called inside each admin write's `$transaction`; retrofit `bulkSetConsent`/`bulkDelete` to write audit rows (one per affected actor) in their existing transactions.
- DTOs with `class-validator` mirroring the Actor model; reuse the Admin serializer and pagination conventions (`@Max(100)`).

**Frontend (`frontend/app/(admin)/admin/actors/`):**
- `new/` and `[id]/edit/` pages (client components, static-export-safe dynamic route handling), shared actor form component, crops multi-select, consent selector with the established acknowledgement pattern when setting `GRANTED`.
- Row actions (Edit · Delete) in the existing table; History panel in the edit page.
- `lib/api/actors-admin.ts` extended with the new calls; design tokens only.

**Infra:** none new — same Lambda/API Gateway/CORS (write methods already allowed); the Prisma migration must be applied to dev RDS during deploy (`--profile IBD-DEV`).

## 6. Non-Goals

- **Global audit page** (`/admin/audit`, cross-actor timeline with filters) — the audit *data* captured here supports it, but the UI is a follow-up module. [Decided at proposal time: per-actor panel only.]
- **Restore / undo from history** — history is read-only evidence, not a rollback mechanism.
- **Auditing reads or non-actor entities** (user management, imports) — actor registry writes only; the `ActorAuditLog` shape should not preclude a future generalization.
- **CSV import/export** — separate `admin/import` / `admin/export` specs (unchanged from previous proposals).
- **Bulk field editing** — still deferred; bulk surface stays consent + delete.

## 7. Affected Users, Systems, And Specs

- **Users:** Admin operators. No change for Staff/Public; public `GET /actors` behavior untouched (though its content now changes as Admins edit actors).
- **Backend:** extends `backend/src/actors/` (new controller routes, audit service, DTOs); **first Prisma schema migration** on the live dev database.
- **Frontend:** new pages under `app/(admin)/admin/actors/`, row actions in the existing table, extended API client.
- **Specs:** third `admin/` module; direct successor to `2026-07-08-admin--bulk-actor-operations` (fulfills its OQ-2) on the foundation of `2026-07-01-admin--user-management`.
- **Constitutional:** detailed-design §4 (write endpoints, RBAC, serializer) + data model section (new table); system-design IA (`/admin/actors/new`, `/[id]/edit`); PII rules — audit diffs contain PII and are strictly Admin-gated server-side.

## 8. Requirement Delta Preview

### ADDED Requirements

- Admin-only **create actor** (full field set incl. PII, GPS, crops, consent) with model-level validation.
- Admin-only **edit actor** with changed-fields-only persistence.
- Admin-only **single delete** with typed confirmation, cascading crop links.
- **`ActorAuditLog`**: every admin write (single CRUD + existing bulk consent/delete) records who (sub + email), when, action, and field-level before→after diff, transactionally with the change; bulk consent additionally persists the typed acknowledgement; entries survive actor deletion.
- Admin-only **per-actor history endpoint + UI panel** (paginated, newest first).

### MODIFIED Requirements

- `bulkSetConsent` / `bulkDelete` now write durable audit rows (previously CloudWatch-only logging); external behavior and responses unchanged.
- `/admin/actors` table gains row-level Edit/Delete actions.

### REMOVED Requirements

- None.

## 9. Approach Options

**Option A — Explicit audit service inside each write transaction (recommended).**
A small audit writer invoked explicitly by every admin mutation, inside the same Prisma `$transaction` (change and its audit row commit or roll back together). The service computes the diff from the fetched "before" row. Explicit call sites = obvious attribution (the controller already has the JWT user), trivially testable, and scoped exactly to admin writes.

**Option B — Prisma middleware / client extension auto-auditing.**
Intercept all `actor` mutations at the Prisma layer and auto-generate diffs. Catches everything by construction, but attribution is awkward (the acting user must be smuggled into Prisma context), it audits non-admin writes (seeds, future imports) indiscriminately, and it is harder to reason about in transactions. More magic than this codebase's explicit style.

**Option C — Minimal who/when/action log, no diffs; CRUD only.**
Cheapest, but cannot answer "what changed", and was explicitly rejected at proposal time (field-level diff selected).

## 10. Recommended Approach

**Option A.** It matches the module's explicit, service-level style, guarantees change+audit atomicity, keeps the acting user's identity flowing naturally from the controller, and confines auditing to exactly the surfaces that need it. The bulk retrofit is two well-understood call sites.

## 11. Risks, Dependencies, And Open Questions

- **Risk — PII in audit rows (highest):** diffs and delete snapshots contain `phone`/`email`. The history endpoint must sit behind the same Admin-only stack, never pass through the public serializer, and audit content must never appear in non-admin responses or logs. Same release-blocker bar as the admin list.
- **Risk — first live schema migration:** `prisma migrate` against dev RDS is a new deploy step (previous specs only read/wrote existing tables). Needs a rehearsed, additive-only migration (new table, no `Actor` changes) — inherently low-risk, but the process is new.
- **Risk — bulk audit volume:** a 500-id bulk op writes 500 audit rows in one transaction. Bounded by the existing `@ArrayMaxSize(500)`; acceptable for MySQL, but the write should be a single `createMany`.
- **Risk — `traderId` uniqueness on create/edit:** must surface as a clean 409/400 validation error, not a Prisma exception.
- **OQ-1 (for specify):** audit retention — keep forever (registry scale makes growth negligible) or define a pruning policy? Default: keep forever.
- **OQ-2 (for specify):** should **create** be in v1's UI, or is edit+delete enough with create deferred to CSV import? Default per the ask ("acciones CRUD"): include create.
- **Dependency:** none blocking — admin foundation, guard stack, CORS, dialogs, and table all exist.

## 12. Success Criteria

- An Admin can create a new actor, correct any field of an existing actor (incl. crops and consent), and delete an actor from `/admin/actors` — without touching the database directly.
- Every admin write (single + bulk) produces audit entries answering **who, when, what action, which fields (before → after)**; entries are written atomically with the change and survive actor deletion.
- The actor edit page shows the actor's history (user, date, action, changed fields), Admin-only.
- All new routes return 401 unauthenticated / 403 for Staff-or-Public; no PII (incl. audit content) outside the Admin surface; public `GET /actors` regression-tested unchanged.
- Prisma migration applies cleanly to dev; `npm test` green on backend + frontend.

## 13. Next Step

```text
/sdd-specify admin/actor-crud-audit
```
