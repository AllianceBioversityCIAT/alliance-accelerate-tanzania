# Proposal — Admin User-Management Module

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `admin/user-management` |
| Proposal date | 2026-06-30 |
| Author | SDD (Leader) on behalf of JuanCode |
| Status | Draft — awaiting approval |
| Suggested depth | **Full** (security-sensitive, cross-cutting: first write endpoints, IAM, CORS, new admin shell) |

## 2. Intent

Build the **first module of the admin area**: a console where an **Admin** can fully manage application users — create, list/read, update, and delete users — plus assign/change their role and set/reset their password. Users are AWS Cognito identities; this module gives the app a UI + API over Cognito's admin operations instead of requiring the AWS Console. It is the foundation the rest of the admin area (e.g. bulk actor operations) will sit beside.

## 3. Problem / Current Behavior

- The auth backbone is complete and working: `JwtAuthGuard` + `RolesGuard` + `@Roles('Admin')` + `@CurrentUser` (`backend/src/auth/`), and login (Cognito, admin-create-only with first-login password change) works end-to-end.
- **But there is no way to manage users from the app.** Today a new user can only be created via the AWS Cognito Console. There is:
  - no `UsersModule`, no `/api/v1/users` endpoints (the only spec'd-but-unbuilt row in detailed-design §4),
  - no admin frontend shell at all — no `(admin)` route group, layout, sidebar, or `/admin/users` page,
  - **no write endpoints anywhere in the backend** (actors/import are read/service-only); this module introduces the first `POST/PATCH/DELETE`.
- Users live **only in Cognito** (no `User` table in Prisma); role = Cognito group membership (`admin`, `staff`; none = Public).

## 4. Proposed Outcome

An Admin signs in, opens **Admin → Users**, and can:

- **List** all users with their email, status, and role(s).
- **Create** a user (email + initial role) → Cognito `AdminCreateUser` issues a temporary password; the user completes the existing first-login new-password challenge.
- **Update** a user's role (assign/remove `admin`/`staff` group) and editable attributes.
- **Delete** a user.
- **Reset / set** a user's password (admin-initiated; admin never sees existing passwords).

All operations are **Admin-only** (enforced server-side via `@Roles('Admin')`, defense-in-depth, not just hidden in the UI). Staff and Public have no access.

## 5. Scope

**Backend (`backend/src/users/`):**
- New `UsersModule` + `UsersController` (`@Controller('users')` → `/api/v1/users`), guarded `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')`, mirroring the `auth.controller.ts` pattern.
- `UsersService` wrapping a Cognito admin SDK client (`@aws-sdk/client-cognito-identity-provider`): `AdminCreateUser`, `ListUsers`, `AdminGetUser`, `AdminUpdateUserAttributes`, `AdminDeleteUser`, `AdminAddUserToGroup` / `AdminRemoveUserFromGroup`, `AdminSetUserPassword` (and/or `AdminResetUserPassword`).
- `class-validator` DTOs (create / update-role / set-password / list-query) through the existing global `ValidationPipe`.
- A Cognito→API user serializer (explicit allowlist: `sub`, `email`, `status`, `enabled`, `roles`, `created/updated`) — **never** returns passwords or internal Cognito secrets.
- Self-protection: an Admin cannot delete or demote **their own** account (anti-lockout).

**Infra (`infra/20-backend/template.yaml`):**
- Add a **scoped** `cognito-idp:*Admin*` + `ListUsers` IAM policy on the user-pool ARN (currently the Lambda has **no** `cognito-idp` permission).
- Extend API Gateway CORS `AllowMethods` to include `POST, PATCH, DELETE` (currently `GET, OPTIONS` only).

**Frontend (`frontend/app/(admin)/`):**
- New admin route group + minimal admin shell (layout + sidebar), wrapped in the existing `<RequireRole allow={['Admin']}>` client guard.
- `/admin/users` page: user table + create/edit/delete + role assignment + password-reset actions, calling `/api/v1/users` via `lib/api/client.ts`.

## 6. Non-Goals

- **Bulk actor operations / bulk unlock** — explicitly a *later* admin module (the user named it as the next option after this one).
- **Creating brand-new role types/groups** — v1 manages assignment to the **existing** `admin` / `staff` roles (and Public = no group). New Cognito groups are an infra + guard change; out of scope for v1 (flagged as OQ-1).
- **Self-service signup, MFA management, federated/social login** — pool is admin-create-only by design.
- **Editing the Actor registry** (separate domain; that's the actors CRUD, a different spec).
- **A persistent `User`/audit table in Prisma** — Cognito stays the single source of truth (optional lightweight audit log flagged as OQ-3).

## 7. Affected Users, Systems, And Specs

- **Users:** Admin role only (operators of the platform). No change for Staff/Public.
- **Backend:** new `backend/src/users/` module; reuses `auth/` guards + `common/` validation/serializer conventions.
- **Infra:** `infra/20-backend/template.yaml` (IAM + CORS). Cognito pool/groups already exist (`infra/10-data-auth/template.yaml`).
- **Frontend:** new `app/(admin)/` group + shell + `/admin/users`; reuses `lib/auth/RequireRole`, `useSession`, `lib/api/client`.
- **Specs:** greenfield. Builds on archived `2026-06-25-changes--auth-wiring` (which named this as a follow-up). First entry under the `admin/` taxonomy.
- **Constitutional:** detailed-design §4 (`/api/v1/users`, Admin), §8 (RBAC: Admin = user mgmt), system-design §2 IA (`/admin/users`), §5 admin shell. All AWS work uses `--profile IBD-DEV`.

## 8. Requirement Delta Preview

### ADDED Requirements
- Admin-only `GET /api/v1/users` (list, paginated) and `GET /api/v1/users/:id`.
- Admin-only `POST /api/v1/users` (create + initial role; triggers Cognito temp-password/first-login flow).
- Admin-only `PATCH /api/v1/users/:id` (update attributes) and role assignment (`PATCH /api/v1/users/:id/role` or add/remove group).
- Admin-only `DELETE /api/v1/users/:id`.
- Admin-only `POST /api/v1/users/:id/password` (set/reset).
- Anti-lockout rule: Admin cannot delete/demote self.
- Backend Lambda granted scoped `cognito-idp` admin permissions; API Gateway CORS allows write methods.
- Frontend `(admin)` shell + `/admin/users` console, Admin-gated.

### MODIFIED Requirements
- API Gateway CORS expands from `GET, OPTIONS` to include `POST, PATCH, DELETE`.
- Backend gains its first authenticated **write** surface (precedent for future admin modules).

### REMOVED Requirements
- None.

## 9. Approach Options

**Option A — NestJS `UsersModule` over Cognito Admin APIs; Cognito = source of truth (recommended).**
Thin service wrapping `@aws-sdk/client-cognito-identity-provider`; no DB table. Admin-guarded REST; IAM + CORS deltas; new admin shell + users page. Smallest correct path that fully meets the request; reuses every existing convention.

**Option B — Add a Prisma `User` mirror table synced to Cognito.**
Enables local audit fields/joins, but introduces dual-write consistency problems (Cognito vs DB drift), migrations, and more surface. Rejected for v1 — Cognito already holds users/roles; a mirror is premature.

**Option C — No app module; manage users in the AWS Cognito Console.**
Zero build, but fails the request (no in-app admin), needs AWS Console access for every operator, and blocks the broader admin area. Rejected.

## 10. Recommended Approach

**Option A.** It satisfies the full CRUD + role + password requirement with the least new surface, keeps Cognito as the single identity source of truth, and reuses the existing guard/DTO/serializer/RequireRole conventions. The only genuinely new infrastructure is a **scoped IAM policy** and a **CORS method** addition — both small, well-understood deltas. It also establishes the reusable admin shell that the next admin module (bulk actor ops) will plug into.

## 11. Risks, Dependencies, And Open Questions

- **Risk — privilege escalation / lockout:** this is the most security-sensitive surface in the app. Mitigations: server-side `@Roles('Admin')` on every route (never client-only), anti-self-lockout rule, scoped IAM (pool ARN only), never serialize passwords/secrets. Reviewer must treat any Admin-gate gap as a hard FAIL.
- **Risk — first write endpoints + CORS:** introduces `POST/PATCH/DELETE`; CORS and preflight must be updated or the UI breaks. Validate against the live API Gateway with `--profile IBD-DEV`.
- **Dependency:** backend Lambda IAM currently lacks `cognito-idp` permissions and there is no admin SDK client yet — both added in this spec.
- **Dependency:** new admin frontend shell does not exist; this spec creates the minimal version (kept lean so the next module reuses it).
- **OQ-1:** v1 limits roles to existing `admin`/`staff`/none. Do you want arbitrary new-role creation later (infra + guard change), or is fixed-role assignment sufficient? (Recommend fixed for v1.)
- **OQ-2:** Password reset UX — Cognito **emails** a reset (`AdminResetUserPassword`) vs admin **sets** a temporary password shown once (`AdminSetUserPassword`, `Permanent:false`). Which do you prefer? (Recommend email-based reset to avoid handling plaintext.)
- **OQ-3:** Do you want a lightweight **audit log** (who created/deleted/changed-role whom) persisted now, or deferred? (Recommend defer to a follow-up.)
- **OQ-4:** On create, should Cognito send the invitation email with the temp password, or should the admin convey credentials manually? (Recommend Cognito invitation email.)

## 12. Success Criteria

- An Admin can create, list, view, update, delete a user and set/reset a password entirely from `/admin/users`.
- A newly created user can complete first-login password change and sign in with the assigned role.
- Every `/api/v1/users` route returns 401 unauthenticated and 403 for Staff/Public (verified by tests).
- No endpoint ever returns a password or Cognito secret; PII (user emails) is only ever exposed inside the Admin-gated module.
- Admin cannot lock themselves out (self-delete/self-demote blocked).
- `npm test` (backend + frontend) green; `sam validate`/deploy with `--profile IBD-DEV` succeeds; CORS permits the write methods.

## 13. Next Step

```text
/sdd-specify admin/user-management
```
