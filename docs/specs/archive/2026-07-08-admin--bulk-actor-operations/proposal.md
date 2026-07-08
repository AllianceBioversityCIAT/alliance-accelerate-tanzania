# Proposal — Admin Bulk Actor Operations

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `admin/bulk-actor-operations` |
| Proposal date | 2026-07-01 |
| Author | SDD (Leader) on behalf of JuanCode |
| Status | Draft — awaiting approval |
| Suggested depth | **Full** (first actor write path, PII/consent-sensitive, bulk state change) |

## 2. Intent

The **second admin module**: an Admin console to manage the actor registry in bulk — an `/admin/actors` table where an Admin can select many actors and, in one action, **lock/unlock** them (control public visibility) or **delete** them. This is the "bulk lock of the actors" capability flagged as the next module when we built user-management.

## 3. Problem / Current Behavior

- Actors are **read-only** today: `/api/v1/actors` exposes only `GET /` and `GET /:id`, anonymous, and returns **only consented actors** (`consentStatus = GRANTED`, pinned in the Prisma `WHERE` + re-checked in the serializer). There are **no write endpoints** and **no admin view** of the registry.
- **Visibility is gated solely by `consentStatus`** (`GRANTED | DENIED | UNKNOWN`; only `GRANTED` is public) — there is no separate `locked`/`published` flag. So an Admin has **no way to publish (unlock) a hidden actor or hide (lock) a visible one**, individually or in bulk, from the app — it can only be changed directly in the database.
- The just-shipped `admin/user-management` module established a reusable admin foundation (shell, `RequireRole`, Bearer `apiFetch`, `@Roles('Admin')` guard stack, `ConfirmDialog`, CORS already allowing `POST/PATCH/DELETE`) — but nothing uses it for actors yet (the sidebar's Actors item is a disabled placeholder).

## 4. Proposed Outcome

An Admin opens **Admin → Actors**, sees **all** actors (any consent status, PII visible to Admin) in a selectable table with search/filter, selects a set, and applies a bulk action:

- **Unlock / Lock** — set the selected actors' `consentStatus` to `GRANTED` (unlock → appears in the public directory, map, and metrics) or `DENIED` (lock → hidden everywhere public). Immediate effect on public reads.
- **Delete** — permanently remove the selected actors (cascades their crop links). Admin-only, behind a typed confirmation.

Every bulk action is **Admin-only** (server-side `@Roles('Admin')`), shows a **confirmation with the affected count**, and returns a **per-item result** (succeeded / failed) so partial failures are visible.

## 5. Scope

**Backend (`backend/src/actors/` — extend the existing module):**
- **Admin list endpoint** — a role-gated read that returns **all** actors regardless of `consentStatus` (incl. `DENIED`/`UNKNOWN`), Admin-scoped serializer exposing PII + consent status, paginated (reuse the `@Max(100)` convention). Public `GET /actors` stays consent-gated and unchanged.
- **Bulk consent endpoint** — `PATCH /api/v1/actors/bulk/consent` `{ ids: string[], consentStatus: 'GRANTED' | 'DENIED' }`; validates ids, applies in a transaction, returns per-id result. `@Roles('Admin')`.
- **Bulk delete endpoint** — `POST /api/v1/actors/bulk/delete` (or `DELETE` with body) `{ ids: string[] }`; transactional, cascades `CropsOnActors`; returns per-id result. `@Roles('Admin')`.
- `class-validator` DTOs (bounded array size); reuse guard stack, `ValidationPipe`, role-aware serializer, and the existing `pii-consent.policy.ts`.

**Frontend (`frontend/app/(admin)/admin/actors/`):**
- `/admin/actors` selectable table (rows with checkboxes + "select all on page"), search/filter (region, type, consent status), and a bulk-action bar (Unlock · Lock · Delete) that appears when rows are selected.
- Reuse `RequireRole`, `apiFetch`, `ConfirmDialog`, and the `UsersTable`/admin-table patterns; activate the **Actors** sidebar item.
- Confirmation dialogs showing the affected count; loading/disabled/error/result states; results summary (N updated, M failed).

**Infra:** none — actor writes hit MySQL via Prisma; CORS already allows the write methods; no new IAM.

## 6. Non-Goals

- **CSV bulk import** — has its own designed `ImportModule` (`import.service.ts`, legal-gated, unregistered) and belongs in a separate `admin/import` spec.
- **CSV export** — greenfield `ExportModule`, separate `admin/export` spec.
- **Single-actor create/edit forms** (`/admin/actors/new`, `/[id]/edit`) — per-row CRUD is a sibling module; this spec is bulk-first (the admin list it builds can host row-level actions later). [OQ-2]
- **Bulk edit of arbitrary fields** (region/crop reassignment) — possible follow-on; v1 is visibility (consent) + delete. [OQ-1]
- **New consent/visibility flag** — v1 maps lock/unlock onto the existing `consentStatus`, not a new column.

## 7. Affected Users, Systems, And Specs

- **Users:** Admin operators only. No change for Staff/Public.
- **Backend:** extends `backend/src/actors/` (new admin controller routes + service methods + DTOs). Public read path unchanged.
- **Frontend:** new `app/(admin)/admin/actors/` + `lib/api/actors-admin.ts`; activates the Actors sidebar item.
- **Specs:** second entry under `admin/`; builds directly on the reusable foundation from archived `2026-07-01-admin--user-management`.
- **Constitutional:** detailed-design §4 (actor write endpoints, RBAC), system-design §2 IA (`/admin/actors`), §8 (PII/consent); PRD (Admin bulk capabilities). PII exposed only inside the Admin-gated surface; server-side enforcement.

## 8. Requirement Delta Preview

### ADDED Requirements
- Admin-only list of **all** actors (any consent status) with PII + consent visible.
- Admin-only **bulk set consent** (`GRANTED`/`DENIED`) over selected ids, transactional, per-item result.
- Admin-only **bulk delete** over selected ids, transactional (cascades crop links), per-item result.
- `/admin/actors` selectable table + bulk-action bar with count-confirmation and result summary; Actors sidebar item activated.
- Bounded batch size on bulk endpoints.

### MODIFIED Requirements
- The public `GET /api/v1/actors` behavior is **unchanged** (still consent-gated) — but its results now change dynamically as Admins lock/unlock actors.

### REMOVED Requirements
- None.

## 9. Approach Options

**Option A — Bulk-first: admin list + bulk consent + bulk delete (recommended).**
Extend the actors module with an Admin list and two bulk endpoints; build the selectable `/admin/actors` table. Smallest surface that delivers the "bulk lock/unlock" ask, reuses all admin infra, and leaves import/export/single-CRUD as clean separate modules. Directly matches the named next module.

**Option B — Full actor CRUD + bulk in one module.**
Add single create/edit/delete forms *and* bulk ops together (the whole `/admin/actors` CRUD from the IA). More complete but much larger surface (forms, GPS validation, per-row edit), slower, and mixes two concerns. Better split.

**Option C — Import/export first.**
Tackle CSV import/export instead. Higher value for seeding but blocked on the legal-ratification gate and a larger CSV/multipart build; doesn't deliver the requested bulk lock/unlock.

## 10. Recommended Approach

**Option A.** It delivers exactly the requested bulk lock/unlock (+ bulk delete) with the least new surface, treats `consentStatus` as the visibility control (the model's reality), reuses the entire admin foundation (no new infra/IAM/CORS), and keeps import, export, and single-actor CRUD as well-bounded future modules. The Admin actors list it introduces becomes the host for those later row-level actions.

## 11. Risks, Dependencies, And Open Questions

- **Risk — consent/legal semantics (highest):** setting `consentStatus = GRANTED` **publishes an actor's PII + GPS** to the public. The consent policy is explicitly "PROVISIONAL pending legal sign-off." **Resolved (OQ-3 → typed acknowledgement):** an Admin may bulk-unlock, but the unlock confirmation dialog **requires a typed acknowledgement that consent is on file** for the selected actors (recorded with the action). This makes the consent decision deliberate without hard-blocking behind a flag.
- **Risk — destructive bulk delete:** irreversible, cascades crop links. Mitigate with typed confirmation + affected-count + per-item result; Admin-only.
- **Risk — PII exposure in the admin list:** the admin list returns PII for all actors — must be strictly Admin-gated server-side (any Staff/Public access = release blocker) and never cached publicly.
- **Resolved decisions (from proposal approval):**
  - **OQ-1 → Lock/unlock + delete** for v1. Bulk field-edit (region/crop) deferred to a follow-on.
  - **OQ-2 → Bulk-only.** Single-actor create/edit (`/admin/actors/new`, `/[id]/edit`) split into a separate sibling spec; the admin list built here can host row-level actions later.
  - **OQ-3 → Typed acknowledgement** on the unlock confirm (above).
- **OQ-4 (for design):** batch-size cap per bulk call (e.g. ≤500) — to finalize in `/sdd-specify`; ample given ~436 live / 1,000+ target.
- **Dependency:** none blocking — admin foundation, guards, CORS, and consent policy all exist.

## 12. Success Criteria

- An Admin can view all actors (incl. hidden), select many, and unlock/lock or delete them from `/admin/actors`.
- Unlocking an actor makes it appear in the public directory/map/metrics within one request cycle; locking removes it.
- Every bulk route returns 401 unauthenticated and 403 for Staff/Public; PII never leaks outside the Admin surface.
- Bulk actions are transactional with a per-item result; destructive actions require confirmation.
- `npm test` (backend + frontend) green; public `GET /actors` behavior unchanged; no new infra.

## 13. Next Step

```text
/sdd-specify admin/bulk-actor-operations
```
