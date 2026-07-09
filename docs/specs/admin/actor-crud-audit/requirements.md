# Requirements — Admin Actor CRUD + Audit History

- Spec path: docs/specs/admin/actor-crud-audit/
- Status: Approved (JuanCode, 2026-07-09)
- Author / Date: SDD (Leader) — 2026-07-09
- Related: docs/prd.md (Admin CRUD capabilities); docs/system-design/design.md §2 (IA `/admin/actors`), §5 (admin shell), §8 (PII/consent), §10 (a11y); docs/detailed-design/detailed-design.md §3 (data model), §4 (actor endpoints), §8 (RBAC/consent); proposal.md (Approved 2026-07-09); archived `2026-07-08-admin--bulk-actor-operations` (admin actors console, bulk write paths) and `2026-07-01-admin--user-management` (admin foundation)

## 1. Summary

The third admin module: single-actor **CRUD** — an Admin creates, edits, and deletes individual actors from the `/admin/actors` console — plus a durable **audit history**: every admin write to the actor registry (the new single CRUD *and* the existing bulk consent/delete) is recorded transactionally with **who** (Cognito sub + email), **when**, **what action**, and **which fields changed** (before → after). Each actor's edit view shows its own history panel. This fulfills the sibling module deferred by `admin/bulk-actor-operations` (OQ-2) and closes the accountability gap: today admin writes only `console.info` the acting user to CloudWatch — not queryable, not durable, no field detail.

## 2. Requirement Numbering & Writing Standards

- Functional: `FR-1…`; non-functional: `NFR-1…`. Atomic, testable, traceable to design + tasks.
- MUST / SHOULD / MAY per RFC 2119.
- RBAC roles: `Public` / `Staff` / `Admin` (Cognito groups). PII = `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport` (`pii-consent.policy.ts`). AWS commands use `--profile IBD-DEV`.

## 3. Glossary

- **Actor** — a seed-system registry record (`Actor` Prisma model); see prior specs.
- **Admin write** — any mutation of the actor registry through the Admin surface: single create / update / delete (this spec) and bulk consent / bulk delete (existing).
- **Audit entry** — one durable record of one admin write to one actor: acting Admin (Cognito `sub` + email), timestamp, action type, and change detail (field-level diff or snapshot).
- **Field-level diff** — for an update: the set of changed fields with previous and new values (`{ field: { from, to } }`). Unchanged fields are not recorded.
- **Snapshot** — for create: the initial field values; for delete: the final field values at deletion time.
- **History panel** — the per-actor, Admin-only UI listing that actor's audit entries.

## 4. System Context & Scope

**In scope:** Admin-only endpoints for single-actor create, read (admin detail), update, delete; a new `ActorAuditLog` persistence (first schema migration); audit writes inside the same transaction as each admin mutation, including retrofitting the two existing bulk operations; a per-actor history endpoint; frontend create/edit forms, row-level Edit·Delete actions on the existing `/admin/actors` table, and the history panel in the edit view.

**Out of scope (see §9).**

## 5. Stakeholders / Personas

- **Admin operator** — corrects wrong data (phone, region, GPS, crops), registers new actors, removes bad records; needs to see who last touched a record. Primary user.
- **Compliance reviewer** — needs an answer to "who changed this actor's data / consent, and when" for a PII registry; relies on the audit trail and its Admin-only containment.
- **Public / Staff** — unaffected; public reads unchanged (their *content* evolves as Admins edit).

## 6. Functional Requirements

### FR-1: Create actor
- **Description:** The system SHALL provide an Admin-only endpoint to create a single actor covering the full `Actor` field set (identity incl. unique `traderId`, `traderName`, region/district, `traderType`, sex/position, market location, capacity, technical support, PII phone/email, GPS fields, crop assignments, `consentStatus`). Input MUST be validated (required fields, bounded decimals, valid enum values, valid crop references). A duplicate `traderId` MUST return a clean 409 with a human-readable message (not a raw Prisma error).
- **Rationale / Source:** proposal §4.1; PRD Admin CRUD; user ask "acciones CRUD".
- **Acceptance (Given/When/Then):**
  - GIVEN an Admin and a valid payload, WHEN they create an actor, THEN the actor exists with all submitted fields (incl. crop links) and is returned in Admin projection.
  - GIVEN a payload whose `traderId` already exists, WHEN submitted, THEN 409 with a clear message and no actor is created.
  - GIVEN an invalid payload (missing required field, bad enum, unknown crop), WHEN submitted, THEN 400 with field-level messages.
  - GIVEN `consentStatus: GRANTED` in the payload, WHEN submitted without the consent acknowledgement (FR-3 rule), THEN 400.
- **PII/RBAC impact:** Admin only; payload contains PII.

### FR-2: Admin actor detail (read for edit)
- **Description:** The system SHALL provide an Admin-only endpoint returning a single actor by id in the Admin projection (all fields incl. PII, `consentStatus`, and crop assignments), regardless of consent status. Unknown id → 404.
- **Rationale / Source:** needed to prefill the edit form; the admin list (bulk spec FR-1) is paginated rows only.
- **Acceptance:**
  - GIVEN an Admin and an existing id (any consent status), WHEN they fetch the admin detail, THEN the full Admin projection is returned.
  - GIVEN an unknown id, WHEN fetched, THEN 404.
  - GIVEN a Staff or unauthenticated caller, WHEN they fetch it, THEN 403 / 401.
- **PII/RBAC impact:** Admin only; returns PII for non-consented actors.

### FR-3: Update actor
- **Description:** The system SHALL provide an Admin-only endpoint to update a single actor partially: only submitted fields change, and only actually-changed fields appear in the audit diff (FR-5). Validation rules match FR-1 (incl. unique `traderId` → 409 if changed to a colliding value). Setting `consentStatus` to `GRANTED` (from any other status) MUST require the same explicit consent acknowledgement flag as the bulk unlock (server-enforced 400 without it); other transitions do not.
- **Rationale / Source:** proposal §4.1; consistency with bulk FR-4 acknowledgement semantics.
- **Acceptance:**
  - GIVEN an Admin editing an actor, WHEN they submit changed fields, THEN those fields are persisted, unchanged fields are untouched, and the response is the updated Admin projection.
  - GIVEN an update setting `consentStatus` to `GRANTED` without acknowledgement, WHEN submitted, THEN 400 and no change is applied.
  - GIVEN an update that changes crop assignments, WHEN submitted, THEN the `CropsOnActors` links reflect exactly the submitted set.
  - GIVEN an unknown id, WHEN updated, THEN 404.
- **PII/RBAC impact:** Admin only; can change PII and public visibility (consent).

### FR-4: Delete actor (single)
- **Description:** The system SHALL provide an Admin-only endpoint to permanently delete a single actor by id (cascading its `CropsOnActors` links). The UI MUST require a typed confirmation (existing dialog pattern) before calling it. Unknown id → 404.
- **Rationale / Source:** proposal §4.1; parity with bulk delete semantics.
- **Acceptance:**
  - GIVEN an Admin confirming deletion, WHEN the delete completes, THEN the actor and its crop links are gone from all reads (admin and public) and an audit entry with a final snapshot exists (FR-5).
  - GIVEN an unknown id, WHEN deleted, THEN 404.
- **PII/RBAC impact:** Admin only; irreversible.

### FR-5: Audit entry on every admin write
- **Description:** Every admin write — create (FR-1), update (FR-3), delete (FR-4), **and the existing bulk consent / bulk delete** — SHALL produce one audit entry per affected actor, written **in the same transaction** as the mutation (both commit or both roll back). Each entry MUST record: acting Admin's Cognito `sub` and email; timestamp; action type (`CREATE | UPDATE | DELETE | BULK_CONSENT | BULK_DELETE`); and change detail — field-level diff for updates/bulk consent (previous → new values), full snapshot for create and delete. Bulk consent entries MUST also persist the typed acknowledgement flag (today only logged to CloudWatch). Bulk operations' external request/response contracts MUST remain unchanged.
- **Rationale / Source:** proposal §4.2 + approved decisions (audit todo lo admin; diff de campos); accountability gap in §1.
- **Acceptance:**
  - GIVEN an Admin updates an actor's `phone` and `region`, WHEN the update commits, THEN exactly one audit entry exists for it with action `UPDATE`, the Admin's sub + email, a timestamp, and a diff containing exactly `phone` and `region` with from/to values.
  - GIVEN a bulk consent over N existing ids, WHEN it commits, THEN N audit entries exist (action `BULK_CONSENT`, the consent transition in the diff, acknowledgement recorded).
  - GIVEN a mutation whose transaction fails, WHEN it rolls back, THEN no audit entry exists for it.
  - GIVEN a create or delete, WHEN it commits, THEN its audit entry contains the full field snapshot.
- **PII/RBAC impact:** audit content contains PII (diffs/snapshots) — Admin-only surface (FR-7/FR-10).

### FR-6: Audit survives actor deletion
- **Description:** Audit entries MUST remain readable after their actor is deleted. Each entry SHALL carry the actor's id plus a minimal identity snapshot (`traderId`, `traderName`) so history remains meaningful without the actor row. Deleting an actor MUST NOT delete or mutate its audit entries.
- **Rationale / Source:** proposal §5 (data model); the delete case is precisely when history matters most.
- **Acceptance:**
  - GIVEN an actor with prior audit entries, WHEN it is deleted, THEN all its entries (plus the new `DELETE` entry) remain queryable by the actor's id and still show `traderId`/`traderName`.
- **PII/RBAC impact:** retained snapshots contain PII; same Admin-only containment.

### FR-7: Per-actor history endpoint
- **Description:** The system SHALL provide an Admin-only endpoint returning one actor's audit entries, newest first, paginated (page size bounded, `@Max(100)` convention). Each item exposes: acting Admin (sub + email), timestamp, action type, identity snapshot, and change detail. It MUST work for deleted actors (by id).
- **Rationale / Source:** proposal §4.3; approved decision "panel por actor".
- **Acceptance:**
  - GIVEN an actor with M audit entries, WHEN an Admin requests its history, THEN entries return newest-first with correct pagination metadata.
  - GIVEN a Staff/Public caller, WHEN they request any history, THEN 403 / 401.
  - GIVEN a deleted actor's id, WHEN an Admin requests its history, THEN its entries are returned (not 404).
- **PII/RBAC impact:** returns PII inside diffs/snapshots; Admin only — release blocker if leaked.

### FR-8: Actor forms UI (create + edit)
- **Description:** The frontend SHALL provide Admin-gated create and edit views in the `(admin)` shell: a shared actor form covering the full field set (crops multi-select; consent selector), client-side validation mirroring the DTOs, and the established typed consent acknowledgement when the submission would set `consentStatus` to `GRANTED` from another status. The edit view MUST be addressable per actor using the repo's static-export-safe pattern (query parameter + `useSearchParams`, as in `/profile`). Server errors (400 field messages, 409 duplicate `traderId`) MUST surface inline; success returns the Admin to the actors table with the change visible.
- **Rationale / Source:** proposal §5 frontend; NFR-2 static export; profile page pattern.
- **Acceptance:**
  - GIVEN an Admin on the create view, WHEN they submit a valid form, THEN the actor is created and appears in the actors table.
  - GIVEN an edit view opened for an actor, WHEN it loads, THEN the form is prefilled with the current Admin-projection values (incl. crops and consent).
  - GIVEN a form change setting consent to `GRANTED`, WHEN submitting, THEN the typed acknowledgement is required before the request is sent.
  - GIVEN a 409/400 from the API, WHEN it returns, THEN the message renders inline and the form data is preserved.
- **PII/RBAC impact:** Admin only; renders and submits PII.

### FR-9: Row actions on the actors table
- **Description:** The existing `/admin/actors` table SHALL gain per-row actions: **Edit** (navigates to the edit view for that actor) and **Delete** (opens the typed confirmation and calls FR-4), plus a **New actor** entry point for the create view. Existing selection/bulk behavior MUST be unaffected.
- **Rationale / Source:** proposal §4.1; bulk spec anticipated row-level actions.
- **Acceptance:**
  - GIVEN the actors table, WHEN an Admin uses a row's Edit action, THEN the edit view opens for exactly that actor.
  - GIVEN a row Delete confirmed, WHEN it completes, THEN the table refreshes without the actor and shows a result message.
  - GIVEN rows are selected for bulk actions, WHEN row actions render, THEN bulk behavior is unchanged.
- **PII/RBAC impact:** Admin only.

### FR-10: History panel in the edit view
- **Description:** The edit view SHALL include a History section listing that actor's audit entries (from FR-7): acting Admin, date/time, action, and the changed fields with previous → new values (or snapshot summary for create/delete), newest first, with pagination ("load more" or pages) and loading/empty/error states.
- **Rationale / Source:** proposal §4.3; approved decision "panel por actor".
- **Acceptance:**
  - GIVEN an actor whose data was changed twice, WHEN an Admin opens its edit view, THEN the History section shows both entries newest-first with user, date, action, and per-field from → to.
  - GIVEN an actor with no history, WHEN opened, THEN an explicit empty state renders.
- **PII/RBAC impact:** Admin only; displays PII from diffs.

### FR-11: Server-side Admin RBAC on all new routes
- **Description:** Every new route (create, admin detail, update, delete, history) MUST require an authenticated Admin, enforced server-side via `JwtAuthGuard` + `RolesGuard` + `@Roles('Admin')` — never client-only.
- **Acceptance:**
  - GIVEN any new route, WHEN called without a token → 401; by Staff/Public → 403; by Admin → allowed.
- **PII/RBAC impact:** core gate; any gap is a release blocker.

### FR-12: PII containment & public read unchanged
- **Description:** PII — including audit diffs and snapshots — MUST be exposed only through the Admin-gated routes/serializers. The public `GET /api/v1/actors[/:id]` behavior MUST remain unchanged (consent-gated, PII-hidden; existing `pii-boundary` tests still pass). Audit content MUST never appear in public responses, error messages, or logs.
- **Acceptance:**
  - GIVEN the public API after this change, WHEN inspected, THEN behavior and shape are unchanged.
  - GIVEN any error path of the new routes, WHEN inspected, THEN no PII values are echoed in error bodies or logs.
- **PII/RBAC impact:** defense in depth; extends the containment rule to audit data.

## 7. Non-Functional Requirements

- **NFR-1 (Security / least privilege):** Admin-only server-side on all new routes; audit data confined to the Admin surface; DTO validation on every input; no new AWS IAM (all writes are DB-only via Prisma). Any violation is a FAIL.
- **NFR-2 (Static export preserved):** all new pages `'use client'`; no SSR/route handlers/dynamic path segments; per-actor addressing via query parameter (profile-page pattern); export build stays green.
- **NFR-3 (Accessibility — WCAG 2.1 AA):** forms fully keyboard-operable with labeled controls and inline error association (`aria-describedby`); dialogs and history list keyboard-accessible; visible focus; design tokens only (system-design §7).
- **NFR-4 (Transactional integrity & errors):** mutation + audit entry commit atomically; correct HTTP codes (400/401/403/404/409); clean validation messages; no partial writes (e.g., actor updated but crops or audit missing).
- **NFR-5 (Tests):** backend unit/e2e cover CRUD happy paths, validation (incl. duplicate `traderId`, consent acknowledgement), RBAC (401/403), audit correctness (diff exactness, atomic rollback, bulk retrofit, survival after delete), history pagination, and the unchanged public read/PII boundary. Frontend tests cover form validation, acknowledgement gating, row actions, and the history panel. `npm test` green on both packages.
- **NFR-6 (Performance):** history paginated (`@Max(100)`); bulk audit writes use a single batched insert (≤500 rows per the existing `@ArrayMaxSize(500)`) and complete within one Lambda invocation; no audit read on public paths.
- **NFR-7 (Migration safety):** the schema change is **additive only** (new `ActorAuditLog` table; no changes to `Actor`); the Prisma migration MUST apply cleanly to local and dev RDS (`--profile IBD-DEV`) with a documented, repeatable procedure; rollback = drop the new table (no data loss risk for existing tables).

## 8. Data & Schema Impact

**New table `ActorAuditLog`** (first schema migration since the initial data model):

- one row per affected actor per admin write; columns for actor id (plain indexed string — **no FK**, so rows survive actor deletion), identity snapshot (`traderId`, `traderName`), action enum, acting Admin `sub` + email, change detail as JSON (diff or snapshot), created timestamp. Indexed by actor id + created-at for the history query.
- **PII flag:** audit JSON contains PII values (phone, email, etc.) inside diffs/snapshots. This is **stored PII outside the `Actor` table** — it inherits the same Admin-only exposure rule and is never passed through public serializers. The `PII_ALLOWLIST` itself is unchanged (no new actor fields).
- `Actor`, `Crop`, `CropsOnActors` are **unchanged**.
- Retention: keep forever (approved default; registry scale makes growth negligible — see OQ-1 resolution).

## 9. Out of Scope

- **Global audit page** (`/admin/audit` cross-actor timeline with filters) — the data supports it; UI is a follow-up module.
- **Undo / restore / rollback from history** — history is read-only evidence.
- **Auditing other entities or reads** (user management, imports, logins) — actor registry writes only; the table shape should not preclude generalization later.
- **CSV import/export** — separate `admin/import` / `admin/export` specs.
- **Bulk field-edit** — still deferred (bulk surface remains consent + delete).
- **Audit log pruning/archival tooling** — not needed at current scale.

## 10. Dependencies & Assumptions

- Builds directly on `admin/bulk-actor-operations` (admin actors console, `actors-admin.service.ts`, Admin serializer, bulk endpoints to retrofit) and `admin/user-management` (shell, `RequireRole`, `apiFetch`, `ConfirmDialog`, guard stack).
- JWT already carries the Cognito `sub`; **assumption:** the acting Admin's email is available from the token claims (verify claim name in design; fallback: `username`/`cognito:username`).
- First live Prisma migration: dev RDS reachable for `prisma migrate deploy` during the deploy step (`--profile IBD-DEV`). No other infra change (CORS already allows POST/PATCH/DELETE).
- Crop catalog is the fixed 3-crop set; the create/edit form reads it from the existing public crops source or a constant (design decision).

## 11. Open Questions

Resolved at proposal approval (2026-07-09):
- **Audit scope → all admin writes** (single CRUD + bulk retrofit).
- **Detail level → field-level diff** (from → to), snapshots for create/delete.
- **History UI → per-actor panel** (global audit page out of scope).
- **OQ-1 (retention) → keep forever** (proposal default, unchallenged).
- **OQ-2 (create in v1) → yes** ("acciones CRUD" includes create).

For design confirmation:
- **OQ-3:** exact JSON shape of the change detail (diff vs snapshot envelope) and whether `Decimal`/GPS values are stored as strings for fidelity.
- **OQ-4:** email claim availability in the access token vs ID token; exact claim used for `actorEmail`.
- **OQ-5:** edit-view addressing — confirm query-param route naming (`/admin/actors/edit?id=…` vs `/admin/actors/detail?id=…`).

## 12. Requirement ID Index

| ID | Title | Type |
|---|---|---|
| FR-1 | Create actor | Functional |
| FR-2 | Admin actor detail (read for edit) | Functional |
| FR-3 | Update actor | Functional |
| FR-4 | Delete actor (single) | Functional |
| FR-5 | Audit entry on every admin write | Functional |
| FR-6 | Audit survives actor deletion | Functional |
| FR-7 | Per-actor history endpoint | Functional |
| FR-8 | Actor forms UI (create + edit) | Functional |
| FR-9 | Row actions on the actors table | Functional |
| FR-10 | History panel in the edit view | Functional |
| FR-11 | Server-side Admin RBAC | Functional |
| FR-12 | PII containment & public read unchanged | Functional |
| NFR-1 | Security / least privilege | Non-functional |
| NFR-2 | Static export preserved | Non-functional |
| NFR-3 | Accessibility (WCAG 2.1 AA) | Non-functional |
| NFR-4 | Transactional integrity & errors | Non-functional |
| NFR-5 | Test coverage | Non-functional |
| NFR-6 | Performance / pagination | Non-functional |
| NFR-7 | Migration safety | Non-functional |

---
**Conventions reminder:** roles `Public`/`Staff`/`Admin`; PII server-side protection; static export (no SSR); AWS `--profile IBD-DEV`; consent (`GRANTED`) is the public-visibility gate.
