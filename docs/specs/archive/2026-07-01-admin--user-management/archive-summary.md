# Archive Summary — Admin User-Management Module

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/admin/user-management/` |
| Archive path | `docs/specs/archive/2026-07-01-admin--user-management/` |
| Archive date | 2026-07-01 |
| Final status | **Done — merged (PR #35), deployed to dev, validated PASS** |
| Final commit | `main` @ `ecd00d6` |
| Depth | Full |

## 2. Original Spec Path

`docs/specs/admin/user-management/` — the first entry under the `admin/` taxonomy.

## 3. Archive Date

2026-07-01.

## 4. Final Status

Complete. 11/11 tasks `[x]` with Reviewer PASS; validation PASS; merged via PR #35 and live on the dev CloudFront/API (`--profile IBD-DEV`). Follow-up test fix merged via PR #36.

## 5. Requirements Delivered

The first admin module: an **Admin-only** console + REST API for managing Cognito users.
- **FR-1..2** — list / view users (`GET /api/v1/users`, `GET /:id`).
- **FR-3** — create user (`AdminCreateUser` + email invite + initial role).
- **FR-4..5** — update attributes; assign/change role (`admin`/`staff`/none).
- **FR-6..7** — delete user; email-based password reset.
- **FR-8** — anti-self-lockout (no self-delete / self-demote).
- **FR-9** — server-side `@Roles('Admin')` on every route.
- **FR-10** — no secret/password leakage (allowlist serializer).
- **FR-11** — `/admin/users` console in a new `(admin)` shell (RequireRole-gated) + Admin account-menu entry.
- **FR-12** — scoped `cognito-idp` IAM (pool ARN, no wildcard) + CORS write methods.

## 6. Files Changed Summary

Per `execution.md`:
- **Backend `backend/src/users/`:** `cognito-admin.client.ts`, `cognito-error.mapper.ts`, `users.constants.ts`, `users.serializer.ts`, `users.service.ts`, `users.controller.ts`, `users.module.ts`, `dto/{create-user,update-user,set-role,list-users-query}.dto.ts`, `users.service.spec.ts`, `users.e2e-spec.ts`; `app.module.ts` (register). Dep: `@aws-sdk/client-cognito-identity-provider`; devDep: `aws-sdk-client-mock`.
- **Infra:** `infra/20-backend/template.yaml` — scoped IAM, CORS write methods, `ANY`→explicit method routes (preflight fix).
- **Frontend:** `app/(admin)/layout.tsx`, `app/(admin)/admin/users/page.tsx`, `components/admin/*`, `lib/api/users.ts` + `client.ts` (`apiFetch`), `components/shell/Header.tsx` (account-menu dropdown) + tests.

Commits: `db0d2e7`(T-1) `4c6d298`(T-2) `b10c2f5`(T-3) `48882b2`(T-4) `2ba2440`(T-5) `9d377b9`(T-6) `1324908`(T-7) `b609b0f`(T-8) `9891e3d`(T-9) `ecfe8f5`(T-10) `bbb2871`(T-11 fix + nav) `b548688`(T-11) `88c606d`(header) → PR #35 (`0df6ad5`); test fix PR #36 (`ecd00d6`).

## 7. Test Evidence Summary

- Backend **142/142** (service unit w/ Cognito mocked; e2e RBAC over the real guards — 401/403/2xx; self-lockout; no-leak).
- Frontend **750/750** (users client Bearer/204/401; (admin) redirect gating; console list/create/delete; RoleSelect; Header account menu).
- Builds clean (backend tsc; frontend static export). `sam validate` passed.
- Live (dev): OPTIONS `/users` → 204; `GET`/`POST /users` (no token) → 401; public `/actors` → 200; `/admin/users` served 200; scoped IAM + CORS confirmed.

## 8. Validation Summary

`validation-report.md`: **PASS / archive-ready** — all FR-1..12 + NFR-1..6 PASS, tests green on `main`, design + constitutional conformance confirmed, no FAIL findings.

## 9. Accepted Warnings Or Follow-Ups

- Backend ESLint 9 flat-config missing (repo-wide) — separate setup task.
- `RolesGuard` deny-by-default hardening (not exploitable here; all users routes carry `@Roles('Admin')`).
- Audit log of admin actions — deferred (OQ-3).
- Bulk actor operations — the next admin module.
- Minor T-9/T-10 test-hardening notes (dialog id/close assertions).

## 10. Historical Notes

- **Live-deploy discoveries (T-11), both fixed + committed:**
  1. **CORS preflight 404** — `ANY /` + `ANY /{proxy+}` routes swallowed OPTIONS → proxied to NestJS (404), which browsers reject; the app had never made authed cross-origin calls before, so it was latent. Fixed by switching to explicit method routes so API Gateway auto-answers preflight with 204.
  2. **`sam deploy` needs Docker** for the makefile build method (unavailable in the deploy env) → deployed via `aws cloudformation package`/`deploy`, which zips the pre-built artifact without a rebuild.
- **Header UX fix** — the authenticated header overflowed (email + role + sign-out + admin link wrapped the nav); collapsed into an avatar account-menu dropdown, moving the role-scoped Admin link off the content nav (`/ui-ux-pro-max` guidance). A sibling a11y test lagged the change (2 red tests on `main`), fixed in PR #36.
- **Verification gate:** backend used `npm run build` + `npm test` (repo-wide ESLint gap).
- Reviewer cumulative-diff false positive on T-5 was Leader-adjudicated (working tree proven clean); reviewers were given explicit working-set scoping thereafter.
- Cognito remains the single source of truth (no Prisma user table) per ADR-1.
