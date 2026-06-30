# Execution Log — Admin User-Management Module

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `admin/user-management` |
| Branch | `feature/admin-user-management` |
| Loop | Leader → Implementer (general-purpose/frontend-developer) → Reviewer (code-reviewer) |
| Started | 2026-06-30 |
| Pacing | Batch Phases A–C, pause before T-11 (deploy) — per user |

## Leader environmental decisions

- **Backend lint gap (repo-wide):** there is **no ESLint flat config** (`eslint.config.js`) anywhere in the repo and ESLint is pinned at v9 (which requires flat config), so `npm run lint` fails for reasons unrelated to this spec. **Decision:** backend task verification uses `npm run build` (tsc type-check) + `npm test` as the authoritative gate instead of the broken `npm run lint`. The missing ESLint config is an accepted pre-existing gap, out of scope here; candidate for a separate setup task. Frontend lint is unaffected.

## 2. Task Execution History

### T-1 — Cognito admin client + dependency — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-12 (SDK-client foundation).
- **Attempt 1:**
  - **Files changed:** `backend/package.json` (+`@aws-sdk/client-cognito-identity-provider`), `backend/package-lock.json`, `backend/src/users/cognito-admin.client.ts` (new: lazy `getCognitoAdminClient()`, `getUserPoolId()`, `resetCognitoAdminClient()` test seam; `@sdd-spec` tag).
  - **Implementer verification:** `npm run build` → exit 0. (`npm run lint` fails repo-wide — no eslint config; see Leader decision above.)
  - **Reviewer verdict:** PASS — all 4 gates (scope, lazy-init mirroring `jwt-verifier.ts`, AWS SDK v3, build clean). Non-blocking notes: implementation was uncommitted (resolved by this commit); optional `getUserPoolId()` → `getCognitoConfig().userPoolId` simplification (left as-is, correct).
- **Decisions:** Adopted `npm run build` as the backend gate (lint gap). Kept `getUserPoolId()` direct env read.
- **Issues:** None blocking.
- **Final verification:** Build green.

### T-2 — DTOs + serializer + error mapper — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-10, NFR-1, NFR-4.
- **Attempt 1:**
  - **Files created (6):** `dto/{create-user,update-user,set-role,list-users-query}.dto.ts`, `users.serializer.ts` (`toAdminUser` explicit allowlist + `AdminUser` type + `SerializableCognitoUser` input type with NO secret fields), `cognito-error.mapper.ts` (`mapCognitoError` → 409/404/400/429/500, generic safe 500).
  - **Implementer verification:** `npm run build` → exit 0.
  - **Reviewer verdict:** PASS — all 5 gates (allowlist no-leak, DTO constraints, error mapping no-leak, scope clean, build). Non-blocking warnings: W-1 add `@IsString()` to `CreateUserDto.role`; W-2 narrow `role` to literal union; W-3 empty-string serializer fallbacks; S-1 extract shared role constants.
- **Decisions:** W-1/W-2/S-1 (DTO role typing + shared constants) folded into **T-3** scope (service-layer task consumes these DTOs — natural place to firm up the role union). W-3 accepted as-is (empty-string fallback only on genuinely-unexpected missing Cognito fields).
- **Issues:** None blocking.
- **Final verification:** Build green.

### T-3 — UsersService (Cognito orchestration + self-lockout) — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-1..FR-8, FR-10 (+ W-1/W-2/S-1 DTO carryovers).
- **Attempt 1:**
  - **Files:** NEW `users.service.ts` (7 methods), `users.constants.ts` (ASSIGNABLE/SETTABLE roles + unions); EDITED `dto/create-user.dto.ts` (+`@IsString`, `AssignableRole`), `dto/set-role.dto.ts` (`SettableRole`), `users.serializer.ts` (imports shared constants).
  - **Implementer verification:** `npm run build` → exit 0.
  - **Reviewer verdict:** PASS — all 5 gates: self-lockout thrown BEFORE Cognito calls in both `setRole` (self-demote) and `remove` (self-delete), not re-mapped; no secret leakage (email invite + email reset, all output via `toAdminUser`); correct §3 Cognito commands per method; scope clean (no controller/module/Prisma); DTO carryovers correct. Non-blocking warnings: W-1 `update` non-atomic email+enable (documented limitation); W-2/W-3 `listGroupNames`/`isNotInGroupError` edge cases; S-1 constructor-inject client (eases T-5 mocking); S-2 defensive throw on missing created Username.
- **Decisions:** Accepted Cognito non-atomicity (no transactions available); idempotent group-clear in `setRole`. Edge-case warnings noted for T-5 test coverage; not blocking.
- **Issues:** None blocking.
- **Final verification:** Build green.

### T-4 — UsersController + module wiring — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-1..FR-9 (esp. FR-9 server-side RBAC).
- **Attempt 1:**
  - **Files:** NEW `users.controller.ts` (7 routes), `users.module.ts`; EDITED `app.module.ts` (register `UsersModule`).
  - **Implementer verification:** `npm run build` → exit 0 (DI graph compiles).
  - **Reviewer verdict:** PASS — all 7 routes carry class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')` (FR-9); route table + HTTP codes (201/204) match design §3; self-lockout `@CurrentUser().sub` passed to `setRole`/`remove` (FR-8); DTOs bound for the global ValidationPipe; module wiring correct (guards zero-dep / Reflector-only, no AuthModule import needed).
- **Decisions:** Class-level guards (covers all routes; safer than per-route). Non-blocking notes recorded.
- **Issues:** None blocking. **Follow-up (out of scope):** reviewer flagged a systemic risk — `RolesGuard` permits any authenticated caller on a route lacking `@Roles()` (allow-by-default). Not applicable here (class carries `@Roles('Admin')`), but a future hardening task should make it deny-by-default.
- **Final verification:** Build green.

### T-5 — Backend tests (unit + e2e RBAC) — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-8, FR-9, FR-10, NFR-5.
- **Attempt 1:**
  - **Files:** NEW `users.service.spec.ts` (unit, Cognito mocked via `aws-sdk-client-mock`), `users.e2e-spec.ts` (RBAC matrix); EDITED `package.json`/lock (+devDep `aws-sdk-client-mock`).
  - **Implementer verification + Leader re-run:** `npm test` → **19 suites / 142 tests pass**; `npm run build` exit 0.
  - **Reviewer verdict:** PASS — all 6 gates. Critical confirmation: the e2e mocks ONLY the JWT verifier (token→role) and runs the **real** `JwtAuthGuard` + `RolesGuard` + live `Reflector`, so 403s for Staff/Public are genuinely produced by `@Roles('Admin')` (not stubbed). Self-lockout asserts thrown 409 AND zero Cognito calls (both paths); no-leak asserts exact key set; error mapping 409/404. Non-blocking warnings: W-1 missing invalid-token case on POST/DELETE; W-2 no explicit `phone` scan (covered by exact key-set); W-3 `'none'` self-lockout path not separately asserted (already covered by production `role !== 'admin'`).
- **Decisions:** Accepted warnings as non-blocking test hardening; production self-lockout logic `role !== 'admin'` correctly covers `staff` and `none`.
- **Issues:** None blocking.
- **Final verification:** 142 tests pass; build green.

> **Phase A (backend) COMPLETE** — T-1..T-5 all PASS. Cognito-backed Admin user API with RBAC + self-lockout + no-leak, 142 tests green.

### T-6 — Scoped Cognito IAM + CORS write methods — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-12, NFR-1.
- **Attempt 1:**
  - **Files:** EDITED `infra/20-backend/template.yaml` (new IAM statement + CORS).
  - **Implementer verification:** `sam validate --profile IBD-DEV` → "valid SAM Template".
  - **Reviewer verdict:** PASS — all 7 gates: exactly 11 `cognito-idp` admin actions; `Resource` = single pool ARN built from imported `UserPoolId` (NO wildcard); CORS `AllowMethods` = GET/OPTIONS/POST/PATCH/DELETE; `Authorization` header retained; `10-data-auth` untouched; valid SAM structure.
- **Decisions:** None beyond spec.
- **Issues:** None.
- **Final verification:** `sam validate` passes.

> **Phase B (infra) COMPLETE** — T-6 PASS. Lambda authorized for least-privilege Cognito admin ops; CORS allows write methods. Applied to AWS only at T-11 deploy.

## Phase C — Frontend

### T-7 — Users API client (Bearer-authed) — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-1..FR-7, FR-11 (data layer), NFR-2.
- **Attempt 1:**
  - **Files:** NEW `frontend/lib/api/users.ts` (7 typed functions + `AdminUser`/input types); EDITED `frontend/lib/api/client.ts` (additive `apiFetch` + `ApiFetchOptions`).
  - **Implementer verification:** `npm run build` exit 0; `npm test -- actors` → 2 suites / 32 tests pass (backward compatible).
  - **Reviewer verdict:** PASS — all 7 gates: 7 endpoint functions attach Bearer; `AdminUser` exact match to design §2 (no secret); token is a parameter (no hooks/Amplify — static-export safe); `client.ts` additive/backward-compatible; 204 handled via `expectEmpty`; 401→`AuthFailureError`. Non-blocking: W-1 `apiFetch.token` optional; W-2 body-less POST for password reset (Nest accepts); W-3 no unit tests for users.ts.
- **Decisions:** users.ts client tests folded into **T-10** (frontend test task). Token supplied by caller via `getSession().accessToken` (T-9).
- **Issues:** None blocking.
- **Final verification:** Build green; actors tests pass.

### T-8 — (admin) route group + admin shell — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-11, NFR-2, NFR-3.
- **Attempt 1:**
  - **Files:** NEW `frontend/app/(admin)/layout.tsx` ('use client' AdminShell, `RequireRole allow={['Admin']}`, sidebar+topbar+main landmarks), `frontend/components/admin/AdminSidebar.tsx` (Users active; Actors/Import/Export disabled placeholders).
  - **Implementer verification:** `npm run build` exit 0, 14 static pages (no page stub needed).
  - **Reviewer verdict:** PASS — all 5 gates: RequireRole Admin gate wraps the whole shell; static-export safe ('use client', no SSR); tokens-only (zero hardcoded hex/px); semantic landmarks (`aside`/`main`/`nav`) + `aria-current="page"` active item; disabled items non-focusable spans. Non-blocking note: `role="link"` on disabled span could be plain span.
- **Decisions:** None beyond spec.
- **Issues:** None blocking.
- **Final verification:** Build green (static export).

### T-9 — /admin/users console — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-1..FR-7, FR-11, NFR-2, NFR-3.
- **Attempt 1:**
  - **Files:** NEW `app/(admin)/admin/users/page.tsx` (orchestration: states, dialogs, refetch, pagination) + `components/admin/{UsersTable,CreateUserDialog,EditUserDialog,RoleSelect,ConfirmDialog}.tsx`.
  - **Path note:** page placed at `(admin)/admin/users/` so the URL is `/admin/users` (IA system-design §2) — design doc's literal `(admin)/users/` would yield `/users`; corrected.
  - **Implementer verification:** `npm run build` exit 0; `out/admin/users` emitted.
  - **Reviewer verdict:** PASS — all gates: wired to T-7 client (token via `getSession()`, no hook in lib/api, no raw fetch); static-export safe; tokens-only (no hardcoded colors; lone `min-w-[200px]` is a layout width, accepted per Hero precedent); dialogs `role="dialog"`+`aria-modal`+focus-trap+Escape; destructive ops confirm; loading/error/empty/success states with live regions; `AuthFailureError`→/login in page+table; RoleSelect constrained admin/staff/none; NO password field anywhere. Non-blocking: W-1 dup email regex; W-2 ConfirmDialog static ids (use `useId`); W-3 shared confirm state (mitigated); S-1 focus restore on close; S-3 dialogs don't route 401→/login.
- **Decisions:** S-3 (AuthFailureError in Create/Edit dialogs) + W-2 (`useId` in ConfirmDialog) folded into **T-10** (test task exercises these paths — small hardening alongside tests).
- **Issues:** None blocking.
- **Final verification:** Build green (static export); /admin/users route emits.

### T-10 — Frontend tests (+ W-2/S-3 hardening) — **PASS** (1 attempt) — 2026-06-30

- **Requirements covered:** FR-11, NFR-3, NFR-5.
- **Attempt 1:**
  - **Files:** NEW `lib/api/users.test.ts`, `app/(admin)/layout.test.tsx`, `app/(admin)/admin/users/page.test.tsx`, `components/admin/RoleSelect.test.tsx`; EDITED `ConfirmDialog.tsx` (W-2 `useId`), `CreateUserDialog.tsx`/`EditUserDialog.tsx` (S-3 `AuthFailureError`→/login).
  - **Implementer verification + Leader re-run:** admin+users tests → **4 suites / 62 tests pass**; full frontend suite 749 green; `npm run build` exit 0.
  - **Reviewer verdict:** PASS — all gates: layout test asserts non-Admin `router.replace('/login')` + admin content absent, Admin sees shell; page test asserts `createUser`/`deleteUser` called with `(args, token)`; RoleSelect exactly admin/staff/none; users client test asserts URL+method+Bearer+body, 204→void, 401→`AuthFailureError`; mocks at module boundaries (no network). W-2/S-3 fixes correct & minimal. Non-blocking: W-1 static titleId still in Create/Edit dialogs; W-3 no dialog-close assertion.
- **Decisions:** Accepted non-blocking warnings (test-hardening + pre-existing dialog id pattern).
- **Issues:** None blocking.
- **Final verification:** 62 admin/users tests pass; full suite 749 green; build green.

> **Phase C (frontend) COMPLETE** — T-7..T-10 all PASS. Bearer API client, Admin-gated shell, full CRUD console, tests green.

> **Phases A–C COMPLETE** (T-1..T-10). Only **T-11 (live deploy + verification)** remains — requires explicit user authorization (`--profile IBD-DEV`).
