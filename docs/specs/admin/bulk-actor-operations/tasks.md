# Tasks — Admin Bulk Actor Operations

- Spec path: docs/specs/admin/bulk-actor-operations/
- Status: Draft
- Author / Date: SDD (Leader) — 2026-07-01
- Related: requirements.md (FR-1..FR-9, NFR-1..6); design.md §3..§10

## Task List

### Phase A — Backend (admin actor surface + bulk ops)

- [x] T-1 Admin DTOs + admin serializer  (deps: none)
      Scope: In `backend/src/actors/` add `dto/admin-actor-list-query.dto.ts` (page/pageSize@Max(100)/region?/traderType?/consentStatus?), `dto/bulk-consent.dto.ts` (`ids` @ArrayNotEmpty/@ArrayUnique/@ArrayMaxSize(500)/@IsString each; `consentStatus` @IsIn(GRANTED,DENIED); `acknowledged?` @IsBoolean), `dto/bulk-delete.dto.ts` (`ids` same). Add `admin-actor.serializer.ts` `toAdminActor()` — explicit projection of all actor fields incl. PII + `consentStatus` (distinct from `toPublic()`). `// @sdd-spec` tags.
      Traces: FR-1, FR-3, FR-5, FR-8, NFR-1 (requirements.md); design.md §3, §4
      Files: backend/src/actors/dto/*.ts, backend/src/actors/admin-actor.serializer.ts
      Verify: `cd backend && npm run build`
      Done when: DTOs validate per design §3; serializer emits PII + consentStatus; build green.
      Skills: api-design-principles, nestjs-expert

- [x] T-2 ActorsAdminService (adminList + bulk consent/delete)  (deps: T-1)
      Scope: `backend/src/actors/actors-admin.service.ts` injecting `PrismaService`: `adminList(q)` (filters, NO GRANTED pin, paginated envelope, rows via `toAdminActor`); `bulkSetConsent(ids, status, actingSub, acknowledged)` — throw 400 if status===GRANTED && !acknowledged; in `$transaction` compute notFound + `updateMany`; return `{requested, applied, notFound}`; structured-log the action + acking sub; `bulkDelete(ids, actingSub)` — `$transaction` notFound + `deleteMany` (cascades CropsOnActors); return result + log.
      Traces: FR-1, FR-3, FR-4, FR-5, FR-7, FR-8, NFR-4 (requirements.md); design.md §4, §6, §8
      Files: backend/src/actors/actors-admin.service.ts
      Verify: `cd backend && npm run build`
      Done when: three methods implemented, transactional, per-id result, unlock-acknowledgement guard, no public-path change; build green.
      Skills: nestjs-expert, error-handling-patterns

- [x] T-3 AdminActorsController + module wiring  (deps: T-2)
      Scope: `backend/src/actors/admin-actors.controller.ts` — `@Controller('admin/actors')`, class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')`; routes `GET /` (list), `PATCH /bulk/consent` (pass `@CurrentUser().sub` + dto.acknowledged), `POST /bulk/delete` (`@CurrentUser().sub`). Register controller + `ActorsAdminService` in `actors.module.ts`. Do NOT touch the public `actors.controller.ts`.
      Traces: FR-1, FR-3, FR-5, FR-6 (requirements.md); design.md §3, §6
      Files: backend/src/actors/admin-actors.controller.ts, backend/src/actors/actors.module.ts
      Verify: `cd backend && npm run build`
      Done when: 3 routes mounted under `/api/v1/admin/actors`, Admin-guarded, app boots; public actors routes unchanged; build green.
      Skills: nestjs-expert, api-design-principles

- [x] T-4 Backend tests (unit + e2e RBAC + public-read-unchanged)  (deps: T-3)
      Scope: `actors-admin.service.spec.ts` (Prisma mocked) — bulk consent flips + notFound; GRANTED without acknowledged → 400; bulk delete calls deleteMany on found + notFound; adminList applies filters without GRANTED pin; serializer includes PII+consentStatus. `admin-actors.e2e.spec.ts` (under `src/test/` per existing Jest `testRegex`) — every route 401/403(Staff&Public)/2xx(Admin); over-cap ids → 400; unlock w/o acknowledgement → 400; **public `GET /actors` still returns only GRANTED, no PII** (regression). Confirm existing `pii-boundary.spec.ts` still passes.
      Traces: FR-1..FR-8, NFR-1, NFR-4, NFR-5 (requirements.md); design.md §10
      Files: backend/src/actors/actors-admin.service.spec.ts, backend/src/test/admin-actors.e2e.spec.ts
      Verify: `cd backend && npm test -- actors`
      Done when: unit + e2e pass; RBAC matrix, acknowledgement guard, cascade, and public-read regression all covered.
      Skills: nestjs-expert, systematic-debugging

### Phase B — Frontend (admin actors console)

- [x] T-5 Admin actors API client  (deps: none — contract-driven by design §3)
      Scope: `frontend/lib/api/actors-admin.ts` — `adminListActors(query, token)`, `bulkSetConsent({ids, consentStatus, acknowledged}, token)`, `bulkDeleteActors({ids}, token)` via `apiFetch` (Bearer). Types mirror `AdminActor` + `BulkResult` (design §3).
      Traces: FR-1, FR-3, FR-5, FR-9 (requirements.md); design.md §3, §5
      Files: frontend/lib/api/actors-admin.ts
      Verify: `cd frontend && npm run build`
      Done when: client compiles, attaches Bearer, typed to the contract; build green.
      Skills: vercel-react-best-practices, api-design-principles

- [ ] T-6 /admin/actors table + selection + filters  (deps: T-5)
      Scope: `frontend/app/(admin)/admin/actors/page.tsx` ('use client') + `frontend/components/admin/ActorsTable.tsx` — list all actors (consent badge, PII cols), row checkboxes + select-all-on-page (FR-2), filters (region/type/consent), loading/error/empty states, table md+/cards mobile. Activate the Actors item in `AdminSidebar.tsx` (enabled + href `/admin/actors`). Tokens only; WCAG AA.
      Traces: FR-1, FR-2, FR-9, NFR-2, NFR-3 (requirements.md); design.md §5; system-design §6/§10
      Files: frontend/app/(admin)/admin/actors/page.tsx, frontend/components/admin/ActorsTable.tsx, frontend/components/admin/AdminSidebar.tsx
      Verify: `cd frontend && npm run build`
      Done when: table renders all actors with selection + filters; sidebar Actors active; build (static export) green.
      Skills: ui-ux-pro-max, tailwind-design-system, react-doctor

- [ ] T-7 Bulk-action bar + confirm/acknowledge dialogs  (deps: T-6)
      Scope: `frontend/components/admin/BulkActionBar.tsx` (Unlock · Lock · Delete on selection, count shown) + `frontend/components/admin/AcknowledgeDialog.tsx` (typed-phrase acknowledgement variant of ConfirmDialog). Wire: Unlock → AcknowledgeDialog → `bulkSetConsent(GRANTED, acknowledged:true)`; Lock → ConfirmDialog → `bulkSetConsent(DENIED)`; Delete → ConfirmDialog (typed) → `bulkDeleteActors`. Disable in-flight; show result summary (N applied, M not found) via live region; refetch after.
      Traces: FR-3, FR-4, FR-5, FR-9, NFR-3, NFR-4 (requirements.md); design.md §5
      Files: frontend/components/admin/BulkActionBar.tsx, frontend/components/admin/AcknowledgeDialog.tsx, frontend/app/(admin)/admin/actors/page.tsx
      Verify: `cd frontend && npm run build`
      Done when: bulk actions call the client with correct args; unlock blocked until acknowledgement typed; result summary + refetch; build green.
      Skills: ui-ux-pro-max, shadcn-ui, react-doctor

- [ ] T-8 Frontend tests  (deps: T-7)
      Scope: RTL — `/admin/actors` renders selectable rows; selecting shows the bulk bar; Unlock opens AcknowledgeDialog and stays disabled until the phrase is typed, then calls `bulkSetConsent` with `acknowledged:true`; Lock/Delete confirm + call the client; result summary renders; non-Admin redirect (mock useSession). API client + session mocked.
      Traces: FR-2, FR-4, FR-9, NFR-3, NFR-5 (requirements.md); design.md §10
      Files: frontend/app/(admin)/admin/actors/*.test.tsx, frontend/components/admin/*.test.tsx
      Verify: `cd frontend && npm test -- actors`
      Done when: suites pass; selection, acknowledgement gating, and bulk-call args covered.
      Skills: react-doctor, ui-ux-pro-max

### Phase C — Deploy & verification

- [ ] T-9 Deploy to dev + live verification  (deps: T-4, T-8)
      Scope: Deploy backend + frontend (`--profile IBD-DEV`; backend via `cloudformation package`/`deploy`, no Docker). Live-verify: Admin can list all actors, bulk-unlock (with acknowledgement) → actor appears in public directory/metrics, bulk-lock → disappears, bulk-delete → gone; Staff/anonymous get 403/401; public `GET /actors` unchanged. Record evidence in execution.md.
      Traces: FR-1..FR-9 (requirements.md); design.md §7, §10
      Files: (none — deploy + manual verification)
      Verify: deploy scripts `--profile IBD-DEV`; curl/UI checks of `/api/v1/admin/actors` (401/403/200) + a lock→public-hidden round-trip
      Done when: live dev performs bulk lock/unlock/delete with RBAC enforced and public read intact; evidence recorded.
      Skills: aws-serverless, systematic-debugging

## Dependency Graph
```
T-1 → T-2 → T-3 → T-4 ─┐
                        ├─▶ T-9
T-5 → T-6 → T-7 → T-8 ─┘
```
- Roots (parallelizable): T-1, T-5.
- Backend chain: T-1→T-2→T-3→T-4. Frontend chain: T-5→T-6→T-7→T-8.
- T-9 is the final live gate (deps: T-4, T-8).

## Testing & Verification Expectations
- Backend: `npm run build` / `npm test -- actors`. Frontend: `npm run build` / `npm test -- actors`. (Backend `npm run lint` is broken repo-wide — no ESLint flat config; gate is build + test, per the user-management execution log.)
- Mandatory: RBAC matrix (401/403/2xx) on every admin route; the **public `GET /actors` + PII-boundary regression** must stay green (FR-7).
- No schema/PII-field change; no new IAM/CORS (DB-only writes; methods already allowed).

## Execution Conventions
- Commits: `[SPEC:admin/bulk-actor-operations] <message>` ending `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch + PR (no direct push to `main`); dev/prod deploys only on explicit user authorization, always `--profile IBD-DEV`.
- Leader records each Implementer/Reviewer loop in `execution.md`.
