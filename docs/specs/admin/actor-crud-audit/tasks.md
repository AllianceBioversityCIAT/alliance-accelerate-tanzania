# Tasks — Admin Actor CRUD + Audit History

- Spec path: docs/specs/admin/actor-crud-audit/
- Status: Draft
- Author / Date: SDD (Leader) — 2026-07-09
- Traces: requirements.md FR-1..FR-12 / NFR-1..NFR-7 (Approved); design.md §1–§10 (Approved)

## Tasks

- [x] T-1 Add `ActorAuditLog` model + first migration  (deps: none)
      Scope: Prisma `ActorAuditAction` enum + `ActorAuditLog` model exactly per design §2 (no FK on `actorId`, identity snapshot, `changes Json`, `acknowledged?`, `@@index([actorId, createdAt])`). Generate + check in the migration SQL; `Actor`/`Crop`/`CropsOnActors` untouched. Local rehearsal only — no RDS.
      Traces: FR-5, FR-6, NFR-7; design.md §2
      Files: backend/prisma/schema.prisma, backend/prisma/migrations/*add_actor_audit_log*
      Verify: `cd backend && npx prisma migrate dev --name add_actor_audit_log && npm run build`
      Done when: migration applies on a clean local MySQL, generated client exposes `actorAuditLog`, backend compiles, and the migration diff touches only the new enum + table.
      Skills: nestjs-expert

- [ ] T-2 Admin CRUD DTOs  (deps: none)
      Scope: `AdminActorCreateDto` extending the existing unwired `ActorCreateDto` (+`crops?: string[]` validated against the crop catalog, `@ArrayUnique`; +`acknowledged?: boolean`); `AdminActorUpdateDto = PartialType(AdminActorCreateDto)`; `ActorHistoryQueryDto` (`page`/`pageSize`, `@Max(100)`). Unit tests for accept/reject cases (bad crop name, GPS bounds inherited, partial update with single field).
      Traces: FR-1, FR-3, FR-7, NFR-1, NFR-6; design.md §3
      Files: backend/src/actors/dto/admin-actor-create.dto.ts, dto/admin-actor-update.dto.ts, dto/actor-history-query.dto.ts, dto/admin-actor-dto.spec.ts
      Verify: `cd backend && npm test -- admin-actor-dto`
      Done when: DTO tests green; invalid crop / over-cap pageSize / malformed partials rejected; valid payloads pass.
      Skills: nestjs-expert, api-design-principles

- [ ] T-3 `ActingAdminResolver` (sub → email)  (deps: none)
      Scope: resolver per design §4 — Cognito `ListUsersCommand` filtered by `sub`, per-container `Map` cache, returns `string | null`, never throws to callers (failure → null). Config/client pattern reused from the users module. Unit tests with mocked Cognito client: hit, miss, cache reuse, SDK error → null.
      Traces: FR-5 (attribution), design.md §4, §8 (email ADR)
      Files: backend/src/actors/acting-admin.resolver.ts, acting-admin.resolver.spec.ts
      Verify: `cd backend && npm test -- acting-admin`
      Done when: tests green; a second resolve for the same sub performs no SDK call; SDK failure yields null without throwing.
      Skills: nestjs-expert, aws-serverless, error-handling-patterns

- [ ] T-4 `ActorAuditService` + diff builder  (deps: T-1)
      Scope: tx-scoped writer per design §4 — `logCreate`/`logDelete` (snapshot envelope, Decimal→string, crops as name array), `logUpdate` (`buildDiff` over auditable fields + crops; **empty diff ⇒ no row**), `logBulkConsent`/`logBulkDelete` (single `createMany`, acknowledged persisted). Audit-entry serializer (`toAuditEntry`, ISO dates). Unit tests pin diff exactness, snapshot shape, Decimal string format, empty-diff no-op.
      Traces: FR-5, FR-6, NFR-4, NFR-6; design.md §2 (changes envelope), §4, §8 (envelope + empty-diff ADRs)
      Files: backend/src/actors/actor-audit.service.ts, audit-entry.serializer.ts, actor-audit.service.spec.ts
      Verify: `cd backend && npm test -- actor-audit`
      Done when: tests green; diff contains exactly the changed fields with from/to; create/delete produce full snapshots; no row written for a no-change update.
      Skills: nestjs-expert, error-handling-patterns

- [ ] T-5 Service CRUD + history + bulk audit retrofit  (deps: T-2, T-3, T-4)
      Scope: extend `ActorsAdminService` per design §4 — `create` (crops links, GRANTED-w/o-ack → 400, P2002 → 409), `getById` (404), `update` (partial apply, crop replacement, before/after diff, consent-transition guard, 404/409), `remove` (snapshot then delete), `history` (newest-first, paginated, **no actor-existence check**); retrofit `bulkSetConsent`/`bulkDelete` to write audit rows in their existing transactions with unchanged `BulkResult` responses. Acting email resolved pre-transaction. Unit tests for each path incl. tx-rollback → no audit row.
      Traces: FR-1..FR-7, NFR-4, NFR-6; design.md §4, §8
      Files: backend/src/actors/actors-admin.service.ts, actors-admin.service.spec.ts
      Verify: `cd backend && npm test -- actors-admin`
      Done when: unit tests green covering create/update/delete/history/bulk-retrofit incl. 400/404/409 mappings, empty-diff skip, rollback atomicity, and unchanged `BulkResult` shape.
      Skills: nestjs-expert, error-handling-patterns, api-design-principles

- [ ] T-6 Controller routes, module wiring, and e2e  (deps: T-5)
      Scope: add the 5 routes to `AdminActorsController` per design §3 (bulk routes remain declared first; `@HttpCode` as designed; params validated); register `ActorAuditService` + `ActingAdminResolver` in `ActorsModule`. E2E: per-route 401/403(Staff,Public)/success(Admin); full lifecycle create → detail → update → history → delete → history-after-delete; GRANTED-transition w/o ack → 400; dup `traderId` → 409; **public `GET /actors` + pii-boundary regression green**.
      Traces: FR-1..FR-4, FR-7, FR-11, FR-12, NFR-1, NFR-5; design.md §3, §4, §6
      Files: backend/src/actors/admin-actors.controller.ts, actors.module.ts, backend/test/admin-actors-crud.e2e.spec.ts
      Verify: `cd backend && npm test -- admin-actors-crud && npm test -- pii-boundary`
      Done when: e2e green incl. RBAC matrix, lifecycle with history-after-delete, and unchanged public/PII behavior; `npm run build` clean.
      Skills: nestjs-expert, api-design-principles

- [ ] T-7 Frontend API client extensions  (deps: T-6)
      Scope: extend `lib/api/actors-admin.ts` with `adminGetActor`, `createActor`, `updateActor`, `deleteActor`, `getActorHistory` (typed per design §3 contracts, Bearer via `apiFetch`, pageSize ≤ 100). Unit tests for URL/body/error mapping (400 field errors, 409, 404).
      Traces: FR-1..FR-4, FR-7; design.md §3, §5
      Files: frontend/lib/api/actors-admin.ts, frontend/lib/api/actors-admin.test.ts
      Verify: `cd frontend && npm test -- actors-admin`
      Done when: client tests green; types match the API contracts incl. `AuditEntry` and paginated history envelope.
      Skills: vercel-react-best-practices

- [ ] T-8 `ActorForm` + create/edit pages  (deps: T-7)
      Scope: shared `ActorForm` (sections, canonical region/type selects, crops checkbox group, consent select, client validation mirroring DTOs, inline 400/409 mapping via `aria-describedby`); `/admin/actors/new` page; `/admin/actors/edit?id=…` page (`useSearchParams` + Suspense, profile pattern; prefill from `adminGetActor`; not-found state); `AcknowledgeDialog` gating when a submit sets consent to `GRANTED` from another status. Component tests: validation, prefill, ack gating, 409 inline on `traderId`.
      Traces: FR-8, NFR-2, NFR-3; design.md §5, §8 (query-param ADR)
      Files: frontend/components/admin/ActorForm.tsx, frontend/app/(admin)/admin/actors/new/page.tsx, frontend/app/(admin)/admin/actors/edit/page.tsx, frontend/components/admin/ActorForm.test.tsx
      Verify: `cd frontend && npm test -- ActorForm && npm run build`
      Done when: create + edit flows work against the client; ack dialog blocks GRANTED submits until typed; static export build green; tokens only.
      Skills: ui-ux-pro-max, frontend-design, vercel-react-best-practices

- [ ] T-9 Row actions + toolbar on the actors table  (deps: T-7)
      Scope: actions column (Edit link to `edit?id=…`, Delete via existing `ConfirmDialog` typed-confirm calling `deleteActor`, refetch + live-region result); "New actor" button in the toolbar; selection/bulk behavior untouched. Component tests: edit navigation href, delete confirm flow + refetch, bulk bar unaffected with rows selected.
      Traces: FR-4 (UI), FR-9, NFR-3; design.md §5
      Files: frontend/components/admin/ActorsTable.tsx, frontend/app/(admin)/admin/actors/page.tsx, related tests
      Verify: `cd frontend && npm test -- ActorsTable`
      Done when: row actions render and behave per FR-9 acceptance; existing table/bulk tests still green.
      Skills: ui-ux-pro-max, frontend-design

- [ ] T-10 `ActorHistoryPanel` in the edit view  (deps: T-8)
      Scope: history section under the form per design §5 — action badge (tokens), actingEmail (fallback sub), formatted date, diff rows "field: from → to", snapshot summary expandable, "load more" pagination, loading/empty/error states; wired to `getActorHistory`. Component tests: diff rendering, snapshot summary, empty state, load-more.
      Traces: FR-10, NFR-3, NFR-6; design.md §5
      Files: frontend/components/admin/ActorHistoryPanel.tsx, frontend/app/(admin)/admin/actors/edit/page.tsx, frontend/components/admin/ActorHistoryPanel.test.tsx
      Verify: `cd frontend && npm test -- ActorHistoryPanel && npm run build`
      Done when: panel renders entries newest-first with per-field from→to, paginates, and handles empty/error; export build green.
      Skills: ui-ux-pro-max, frontend-design

- [ ] T-11 Deploy: migration + backend + frontend + live verification  (deps: T-6, T-8, T-9, T-10)
      Scope: apply the checked-in migration to dev RDS (`npx prisma migrate deploy`, `--profile IBD-DEV`); deploy backend + frontend per the established scripts; live-verify per requirements: CRUD lifecycle from `/admin/actors`, audit entries visible in the history panel (incl. after a bulk consent), history survives a delete, 401/403 on direct API calls without/with wrong role, public directory/map unchanged. Requires explicit user authorization before touching AWS.
      Traces: NFR-7, FR-1..FR-12 (live), NFR-1; design.md §7
      Files: none new (deploy artifacts); execution.md evidence
      Verify: `cd backend && npx prisma migrate deploy` (with dev `DATABASE_URL`, `--profile IBD-DEV` for any AWS CLI) then scripted deploys; manual live checklist recorded in execution.md
      Done when: migration applied (table exists in dev), both apps deployed, live checklist PASS, no public-surface regression.
      Skills: aws-serverless

## Dependency Graph

```
T-1 → T-4 → T-5 → T-6 → T-7 → T-8 → T-10 → T-11
T-2 → T-5              T-7 → T-9 → T-11
T-3 → T-5              T-6 → T-11, T-8 → T-11
```

Parallel-friendly: T-1, T-2, T-3 have no deps; T-8 and T-9 can run in parallel after T-7.

## Testing & Verification Expectations

- Targeted jest per task (commands above); full gates at T-6 (backend `npm test` + `npm run build`) and T-10 (frontend `npm test` + `npm run build` static export).
- The public PII boundary (`pii-boundary` spec) is re-verified at T-6 — any failure is a release blocker (FR-12).
- T-11 touches AWS: every command with `--profile IBD-DEV`; migration is `migrate deploy` (never `migrate dev`) against RDS.

## Execution Conventions

- Commits: `[SPEC:admin/actor-crud-audit] <message>`.
- Leader maintains `execution.md` (one entry per loop iteration with PASS/FAIL + evidence).
- No new PII fields are introduced (audit JSON stores existing PII under the Admin-only surface per requirements §8); `PII_ALLOWLIST` unchanged.
