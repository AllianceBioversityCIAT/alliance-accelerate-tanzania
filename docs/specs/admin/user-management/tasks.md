# Tasks — Admin User-Management Module

- Spec path: docs/specs/admin/user-management/
- Status: Draft
- Author / Date: SDD (Leader) — 2026-06-30
- Related: requirements.md (FR-1..FR-12, NFR-1..6); design.md §3..§10

## Task List

### Phase A — Backend (Cognito-backed API)

- [x] T-1 Cognito admin client + dependency  (deps: none)
      Scope: Add `@aws-sdk/client-cognito-identity-provider` to `backend/package.json`. Create `backend/src/users/cognito-admin.client.ts` — a lazy `CognitoIdentityProviderClient` (region from `auth.config.ts` / `AWS_REGION`), mirroring `jwt-verifier.ts` lazy-singleton style. Expose the user-pool id from config. No routes yet.
      Traces: FR-12 (requirements.md); design.md §4, §8 (DR Cognito SoT)
      Files: backend/package.json, backend/src/users/cognito-admin.client.ts
      Verify: `cd backend && npm install && npm run build`
      Done when: client compiles, instantiates lazily, reads pool id + region from config; build green.
      Skills: nestjs-expert, aws-serverless

- [x] T-2 DTOs + serializer + error mapper  (deps: none)
      Scope: `backend/src/users/dto/{create-user,update-user,set-role,list-users-query}.dto.ts` with `class-validator` rules per design §3. `users.serializer.ts` `toAdminUser()` — explicit allowlist (`id,email,status,enabled,roles,createdAt,updatedAt`), never secrets (FR-10). `cognito-error.mapper.ts` mapping Cognito exceptions → HttpException (409/404/400/429/500) without leaking internals (NFR-4).
      Traces: FR-10, NFR-1, NFR-4 (requirements.md); design.md §3
      Files: backend/src/users/dto/*.ts, backend/src/users/users.serializer.ts, backend/src/users/cognito-error.mapper.ts
      Verify: `cd backend && npm run build && npm run lint`
      Done when: DTOs validate, serializer emits only allowlisted fields, mapper covers the documented exceptions; build + lint clean.
      Skills: api-design-principles, error-handling-patterns

- [x] T-3 UsersService (Cognito orchestration + self-lockout)  (deps: T-1, T-2)
      Scope: `users.service.ts` methods `list/get/create/update/setRole/remove/resetPassword`. Issue the correct Cognito Admin commands (design §3 table), resolve roles via `AdminListGroupsForUser`, map output through `toAdminUser`, map errors via the mapper. Enforce FR-8 self-lockout (compare target id to caller `sub`) in `remove` and `setRole` (admin removal).
      Traces: FR-1..FR-8, FR-10 (requirements.md); design.md §3, §4, §6
      Files: backend/src/users/users.service.ts
      Verify: `cd backend && npm run build` (unit tests land in T-5)
      Done when: all seven methods implemented, self-lockout guarded, no secret in any return path; build green.
      Skills: nestjs-expert, aws-serverless, error-handling-patterns

- [x] T-4 UsersController + module wiring  (deps: T-3)
      Scope: `users.controller.ts` (`@Controller('users')`, the 7 routes from design §3), every route `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')`, `@CurrentUser()` passed to self-lockout paths. `users.module.ts`; register `UsersModule` in `backend/src/app.module.ts`.
      Traces: FR-1..FR-9, FR-11(API side) (requirements.md); design.md §3, §4, §6
      Files: backend/src/users/users.controller.ts, backend/src/users/users.module.ts, backend/src/app.module.ts
      Verify: `cd backend && npm run build && npm run lint`
      Done when: all routes mounted under `/api/v1/users`, Admin-guarded, app boots; build + lint clean.
      Skills: nestjs-expert, api-design-principles

- [x] T-5 Backend tests (unit + e2e RBAC)  (deps: T-4)
      Scope: `users.service.spec.ts` — mock Cognito client (`aws-sdk-client-mock`); assert each method's command/input, serializer no-leak, self-lockout throws, error mapping. `users.e2e-spec.ts` — every route returns 401 (no token) / 403 (Staff & Public) / 2xx (Admin); duplicate create→409; unknown id→404.
      Traces: FR-1..FR-10, NFR-1, NFR-5 (requirements.md); design.md §10
      Files: backend/src/users/users.service.spec.ts, backend/test/users.e2e-spec.ts (or src/users/users.e2e-spec.ts per repo convention)
      Verify: `cd backend && npm test -- users`
      Done when: unit + e2e suites pass; RBAC matrix (401/403/200) and self-lockout proven; no plaintext asserted.
      Skills: nestjs-expert, systematic-debugging

### Phase B — Infra (parallel with Phase A)

- [x] T-6 Scoped Cognito IAM + CORS write methods  (deps: none)
      Scope: In `infra/20-backend/template.yaml` add a least-privilege `cognito-idp` IAM statement (actions per design §6) with `Resource` = pool ARN built inline from the imported `UserPoolId` (design §7). Add `POST, PATCH, DELETE` to `HttpApi.CorsConfiguration.AllowMethods`. No change to `10-data-auth`.
      Traces: FR-12, NFR-1 (requirements.md); design.md §6, §7
      Files: infra/20-backend/template.yaml
      Verify: `sam validate --profile IBD-DEV` (in infra/20-backend) and `cfn-lint` if available
      Done when: template validates; IAM scoped to the pool ARN (no `*`); CORS lists the write methods.
      Skills: aws-serverless

### Phase C — Frontend (admin console)

- [x] T-7 Users API client (Bearer-authed)  (deps: none — contract-driven by design §3)
      Scope: `frontend/lib/api/users.ts` typed client for the 7 endpoints, attaching the Cognito access token (`Authorization: Bearer`) from the session; extend `frontend/lib/api/client.ts` to accept an auth token if needed. Types mirror the `AdminUser` contract (design §2).
      Traces: FR-1..FR-7, FR-11 (requirements.md); design.md §2, §3, §5
      Files: frontend/lib/api/users.ts, frontend/lib/api/client.ts
      Verify: `cd frontend && npm run build`
      Done when: client compiles, sends Bearer token, typed to the AdminUser contract; build green.
      Skills: vercel-react-best-practices, api-design-principles

- [ ] T-8 (admin) route group + admin shell  (deps: none)
      Scope: `frontend/app/(admin)/layout.tsx` — `'use client'` AdminShell wrapping children in `<RequireRole allow={['Admin']}>` with a left sidebar + topbar (distinct from public nav, DD-5). `frontend/components/admin/AdminSidebar.tsx` (Users active; Actors/Import/Export as disabled placeholders). Tokens only; WCAG AA; static-export safe (no SSR).
      Traces: FR-11, NFR-2, NFR-3 (requirements.md); design.md §5; system-design §5
      Files: frontend/app/(admin)/layout.tsx, frontend/components/admin/AdminSidebar.tsx
      Verify: `cd frontend && npm run build` + manual: non-Admin visiting an (admin) route redirects to /login
      Done when: admin shell renders for Admin, redirects non-Admin; build (static export) green.
      Skills: ui-ux-pro-max, tailwind-design-system, frontend-design

- [ ] T-9 /admin/users console  (deps: T-7, T-8)
      Scope: `frontend/app/(admin)/users/page.tsx` + `frontend/components/admin/{UsersTable,CreateUserDialog,EditUserDialog,RoleSelect,ConfirmDialog}.tsx`. List users (table md+/cards mobile), create (email+role), edit (attributes/enable), delete (confirm), change role (admin/staff/none), reset password. Loading/disabled/error/empty states; tokens; WCAG AA. Wired to `lib/api/users.ts`.
      Traces: FR-1..FR-7, FR-11, NFR-2, NFR-3 (requirements.md); design.md §5; system-design §6, §10
      Files: frontend/app/(admin)/users/page.tsx, frontend/components/admin/*.tsx
      Verify: `cd frontend && npm run build`
      Done when: full CRUD + role + password actions render and call the API client; states handled; build green.
      Skills: ui-ux-pro-max, shadcn-ui, tailwind-design-system, react-doctor

- [ ] T-10 Frontend tests  (deps: T-9)
      Scope: RTL tests — `(admin)` layout redirects non-Admin (mock `useSession`); `/admin/users` renders the list, opens create/edit dialogs, requires delete confirmation, surfaces error/loading; `RoleSelect` constrained to admin/staff/none. API client mocked.
      Traces: FR-11, NFR-3, NFR-5 (requirements.md); design.md §10
      Files: frontend/app/(admin)/users/*.test.tsx, frontend/components/admin/*.test.tsx
      Verify: `cd frontend && npm test -- admin`
      Done when: suites pass; gating + key interactions covered.
      Skills: react-doctor, ui-ux-pro-max

### Phase D — Integration & deploy verification

- [ ] T-11 Deploy to dev + live verification  (deps: T-5, T-6, T-10)
      Scope: Deploy backend (SAM) + frontend with `--profile IBD-DEV`. Live-verify: an Admin can list/create/update/delete a user, assign roles, and trigger a password reset; a created user completes first-login; CORS preflight passes for write methods; Staff/anonymous receive 403/401. Record evidence in execution.md.
      Traces: FR-1..FR-12 (requirements.md); design.md §7, §10
      Files: (none — deploy + manual verification; note any infra deploy commands)
      Verify: deploy scripts with `--profile IBD-DEV`; curl/UI checks of the live `/api/v1/users` (401/403/200) + a create→first-login round-trip
      Done when: live dev environment performs full user management end-to-end with RBAC enforced; evidence recorded.
      Skills: aws-serverless, systematic-debugging

## Dependency Graph
```
T-1 ─┐
T-2 ─┴─▶ T-3 ─▶ T-4 ─▶ T-5 ─┐
T-6 ───────────────────────┤
T-7 ─┐                      ├─▶ T-11
T-8 ─┴─▶ T-9 ─▶ T-10 ──────┘
```
- Roots (parallelizable): T-1, T-2, T-6, T-7, T-8.
- Backend chain: T-1+T-2 → T-3 → T-4 → T-5. Frontend chain: T-7+T-8 → T-9 → T-10. Infra T-6 standalone.
- T-11 is the final live gate (deps: T-5, T-6, T-10).

## Testing & Verification Expectations
- Backend: `npm run build` / `npm run lint` / `npm test -- users`. Frontend: `npm run build` / `npm test -- admin`. Infra: `sam validate --profile IBD-DEV`.
- RBAC matrix (401/403/200) is mandatory test evidence for every route (NFR-5).
- No task may return/log a plaintext password or Cognito secret (FR-10); reviewer hard-FAIL otherwise.

## Execution Conventions
- Commits: `[SPEC:admin/user-management] <message>` ending `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch + PR (no direct push to `main`); production/dev deploys only on explicit user authorization, always `--profile IBD-DEV`.
- No new PII field is introduced; Cognito user attributes governed by the users serializer (FR-10).
- Leader records each Implementer/Reviewer loop in `execution.md`.
