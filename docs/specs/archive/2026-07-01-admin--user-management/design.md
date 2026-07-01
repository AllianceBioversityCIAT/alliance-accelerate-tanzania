# Design — Admin User-Management Module

- Spec path: docs/specs/admin/user-management/
- Status: Draft
- Author / Date: SDD (Leader) — 2026-06-30
- Related: requirements.md (FR-1..FR-12, NFR-1..6); detailed-design §2/§4/§7/§8; system-design §2/§5/§7/§10; `backend/src/auth/`, `backend/src/actors/`, `frontend/lib/auth/`

## 1. Approach Overview

Add a self-contained NestJS `UsersModule` that wraps the **AWS Cognito admin APIs** behind the existing `JwtAuthGuard` + `RolesGuard` + `@Roles('Admin')`, and a Next.js `(admin)` route group hosting a `/admin/users` console gated by the existing `RequireRole`. Cognito remains the single source of truth — **no Prisma table**. The only new infrastructure is a least-privilege `cognito-idp` IAM policy (scoped to the pool ARN) and CORS write-method support. Every backend convention (controller prefix, DTO validation, allowlist serializer) mirrors the `actors`/`auth` modules.

```
Admin browser ──(Bearer access token)──▶ API GW (HTTP API)
   /admin/users (RequireRole=Admin)         │  CORS: +POST/PATCH/DELETE
        │                                    ▼
   lib/api/users.ts ─────────────────▶ NestJS Lambda  /api/v1/users
                                          UsersController  @Roles('Admin')
                                              │  JwtAuthGuard+RolesGuard
                                              ▼
                                          UsersService ──▶ Cognito Admin API
                                          (AdminCreateUser, ListUsers,
                                           Admin{Get,Update,Delete}User,
                                           Admin{Add,Remove}UserToGroup,
                                           AdminResetUserPassword)
                                          IAM: cognito-idp scoped to PoolArn
```

## 2. Data Model Changes

**None.** No `User` entity in Prisma (DR-1). Users + roles live in Cognito. The conceptual API shape (serializer output, FR-10):

```
AdminUser {
  id: string          // Cognito Username (uuid; pool uses email as alias)
  email: string       // from attributes
  status: string      // Cognito UserStatus (e.g. FORCE_CHANGE_PASSWORD, CONFIRMED)
  enabled: boolean
  roles: ('admin'|'staff')[]   // group memberships; [] = Public
  createdAt: string
  updatedAt: string
}
```
No password/temporary-password/secret field is ever included.

## 3. API Surface & Contracts

All under the global `api/v1` prefix; all `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')`.

| Method | Path | Body | Success | Maps to | FR |
|---|---|---|---|---|---|
| GET | `/users` | — (`?limit&paginationToken`) | 200 `{ users, paginationToken? }` | `ListUsers` (+ group join) | FR-1 |
| GET | `/users/:id` | — | 200 `AdminUser` / 404 | `AdminGetUser` (+groups) | FR-2 |
| POST | `/users` | `CreateUserDto` | 201 `AdminUser` / 409 / 400 | `AdminCreateUser` + `AdminAddUserToGroup` | FR-3 |
| PATCH | `/users/:id` | `UpdateUserDto` | 200 `AdminUser` / 404 / 400 | `AdminUpdateUserAttributes`, `AdminEnable/DisableUser` | FR-4 |
| PATCH | `/users/:id/role` | `SetRoleDto` | 200 `AdminUser` / 400 / 404 | `AdminAdd/RemoveUserToGroup` | FR-5, FR-8 |
| DELETE | `/users/:id` | — | 204 / 404 | `AdminDeleteUser` | FR-6, FR-8 |
| POST | `/users/:id/password` | — | 204 / 404 | `AdminResetUserPassword` (email) | FR-7 |

**DTOs (`class-validator`, global `ValidationPipe({ whitelist, transform })`):**
- `CreateUserDto`: `email @IsEmail`, `role? @IsIn(['admin','staff'])` (omit = Public/no group).
- `UpdateUserDto`: `email? @IsEmail`, `enabled? @IsBoolean` (final attribute set per OQ-5; default: `enabled` toggle + email).
- `SetRoleDto`: `role @IsIn(['admin','staff','none'])`.
- `ListUsersQueryDto`: `limit? @IsInt @Min(1) @Max(60)` (Cognito per-call cap), `paginationToken? @IsString`.

**Error mapping (NFR-4):** Cognito SDK exceptions → HTTP via a small mapper / exception filter:
`UsernameExistsException`→409, `UserNotFoundException`→404, `InvalidParameterException`/`InvalidPasswordException`→400, `TooManyRequestsException`→429, else→500. No secret in any error body/log.

**Self-lockout (FR-8):** in `DELETE /:id` and `PATCH /:id/role` (when removing `admin`), compare target `id` to `@CurrentUser().sub`; if equal → 409 `Conflict('cannot remove your own admin access')`, no Cognito call.

## 4. Backend Design

**Directory (`backend/src/users/`):**
```
users.module.ts          // UsersModule (imports AuthModule pieces as needed)
users.controller.ts      // @Controller('users'), 7 routes, @Roles('Admin')
users.service.ts         // Cognito admin orchestration + self-lockout + mapping
cognito-admin.client.ts  // lazy CognitoIdentityProviderClient (region from config)
users.serializer.ts      // toAdminUser(): explicit allowlist (FR-10)
cognito-error.mapper.ts  // Cognito exception → HttpException (NFR-4)
dto/
  create-user.dto.ts
  update-user.dto.ts
  set-role.dto.ts
  list-users-query.dto.ts
users.service.spec.ts    // unit (Cognito client mocked)
users.e2e-spec.ts        // RBAC + flows (guards mocked/real)
```

- **New dependency:** `@aws-sdk/client-cognito-identity-provider` (only `aws-jwt-verify` is installed today). Client is lazy-instantiated (mirrors `jwt-verifier.ts`), region/pool id from `auth.config.ts` env (`COGNITO_USER_POOL_ID`, `AWS_REGION` — already wired into the Lambda env).
- **Controller** mirrors `auth.controller.ts` guard stacking exactly, swapping `@Roles('Admin')`; uses `@CurrentUser()` for self-lockout.
- **Service** is the only Cognito caller; methods: `list`, `get`, `create`, `update`, `setRole`, `remove`, `resetPassword`. Roles resolved via `AdminListGroupsForUser` (per user) — for `list`, join group membership (DR-6: bounded by `limit≤60`; acceptable; documented). Reuses `roleFromGroups`-style mapping for output.
- **`UsersModule`** registered in `backend/src/app.module.ts` alongside `AuthModule`/`ActorsModule`.

## 5. Frontend Design

**Directory:**
```
frontend/app/(admin)/
  layout.tsx                 // AdminShell: <RequireRole allow={['Admin']}> + sidebar + topbar
  users/page.tsx             // 'use client' users console (static-export safe)
frontend/components/admin/
  AdminSidebar.tsx           // nav (Users active; future: Actors/Import/Export)
  UsersTable.tsx             // list + row actions (edit/delete/reset/role)
  CreateUserDialog.tsx       // email + role form
  EditUserDialog.tsx         // attributes + enable/disable
  RoleSelect.tsx             // admin/staff/none (tokens)
  ConfirmDialog.tsx          // destructive-action guard
frontend/lib/api/
  users.ts                   // typed client → /api/v1/users (attaches Bearer)
```

- **Static export preserved (NFR-2):** the admin pages are `'use client'`; gating is `RequireRole` (client) — no SSR/route handlers. The API is the authoritative guard (FR-9). `app/(admin)/layout.tsx` wraps children in `<RequireRole allow={['Admin']}>` (redirects non-Admins to `/login`).
- **Auth on requests:** `lib/api/users.ts` attaches the Cognito **access token** from the session (via `getSession()`/`useSession`) as `Authorization: Bearer` — unlike the public `actors.ts` client. (Confirm/extend `lib/api/client.ts` to accept a token.)
- **UX (system-design §5/§6/§10, tokens only):** admin left-sidebar shell distinct from public top-nav (DD-5); table on `md+`, cards on mobile; create/edit in dialogs with validated fields + error slots; destructive actions need confirm; loading/disabled/error/empty states; WCAG AA (labels, focus, live-region errors). No hardcoded colors/geometry — design tokens.
- **Sidebar** seeds future admin modules (Actors/Import/Export) as disabled/placeholder items.

## 6. Security & RBAC

- **Authoritative gate:** server-side `@Roles('Admin')` on every route (FR-9); `RequireRole` is convenience only. e2e tests assert 401 (no token) / 403 (Staff/Public) / 200 (Admin).
- **Least privilege (FR-12, NFR-1):** new IAM statement grants only the needed actions on the **pool ARN**:
  `cognito-idp:ListUsers, AdminGetUser, AdminCreateUser, AdminDeleteUser, AdminUpdateUserAttributes, AdminEnableUser, AdminDisableUser, AdminAddUserToGroup, AdminRemoveUserToGroup, AdminListGroupsForUser, AdminResetUserPassword`. No `*` resource.
- **No secret leakage (FR-10):** serializer allowlist; password endpoints take/return no plaintext; error mapper strips Cognito internals.
- **PII:** Cognito user emails are admin-identity data, exposed only inside the Admin-gated module — distinct from the Actor `PII_ALLOWLIST` (unchanged).
- **Anti-lockout (FR-8):** self-delete/self-demote blocked server-side.

## 7. Infrastructure / Deployment

`infra/20-backend/template.yaml` (SAM), deployed with `--profile IBD-DEV`:
1. **IAM:** add the scoped `cognito-idp` statement to the function `Policies`. Pool ARN constructed inline from the imported id:
   ```yaml
   - Effect: Allow
     Action: [ cognito-idp:ListUsers, cognito-idp:AdminGetUser, ... ]
     Resource: !Sub
       - "arn:${AWS::Partition}:cognito-idp:${AWS::Region}:${AWS::AccountId}:userpool/${PoolId}"
       - PoolId: !ImportValue
           Fn::Sub: "${DataAuthStackName}-UserPoolId"
   ```
   (No change to `10-data-auth`.)
2. **CORS:** add `POST, PATCH, DELETE` to `HttpApi.CorsConfiguration.AllowMethods` (currently `GET, OPTIONS`).
3. Validate: `sam validate --profile IBD-DEV`; deploy via the existing backend deploy path. Rollback = revert the template (CloudFormation) — additive, low-risk.

## 8. Decision Records (ADR-style)

### Decision: Cognito as source of truth; no Prisma user table
- **Context:** users already exist only in Cognito; role = group membership.
- **Decision:** wrap Cognito admin APIs; add no DB table.
- **Rationale:** avoids dual-write drift, migrations, and a second identity store; matches detailed-design §7/§8.
- **Rejected:** Prisma user-mirror (premature, drift risk).

### Decision: `:id` = Cognito Username (sub uuid), email is alias
- **Context:** pool uses `UsernameAttributes: email`, so Username is a uuid and equals the JWT `sub`.
- **Decision:** address users by Username/`sub`; enables exact self-lockout comparison with `@CurrentUser().sub`.
- **Rejected:** addressing by email (ambiguous on email change; not the Admin* API key).

### Decision: Email-based password reset (no admin plaintext)
- **Context:** OQ-2.
- **Decision:** `AdminResetUserPassword` (Cognito emails the reset).
- **Rejected:** `AdminSetUserPassword` plaintext (handling/displaying secrets).

### Decision: Accept Cognito token-based pagination
- **Context:** Cognito `ListUsers` paginates by opaque `PaginationToken` (≤60/call), unlike the actors offset pagination.
- **Decision:** expose `limit` + `paginationToken` passthrough; UI loads pages via token / "load more".
- **Rejected:** emulating offset pages (would require full scans).

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Privilege escalation / Admin-gate gap | server-side `@Roles('Admin')` on all routes; e2e 401/403/200; reviewer hard-FAIL on any gap |
| Self-lockout | FR-8 guard on delete + admin-demote (incl. self via `sub`) |
| Over-broad IAM | actions scoped to pool ARN; no `*` |
| Secret leakage in logs/responses | allowlist serializer; error mapper; no plaintext password paths |
| CORS/preflight breaks writes | add POST/PATCH/DELETE; verify preflight against live API GW (`--profile IBD-DEV`) |
| Cognito throttling on list+group join | bounded `limit≤60`; map `TooManyRequests`→429; group-join per page only |
| Static-export regression | admin pages `'use client'`; no SSR/route handlers |

## 10. Test Plan Outline

- **Backend unit (`users.service.spec.ts`):** mock the Cognito client (`aws-sdk-client-mock`); assert each method issues the right command + input, output goes through the serializer (no secret), self-lockout throws, error mapper maps exceptions.
- **Backend e2e (`users.e2e-spec.ts`):** every route → 401 (no token), 403 (Staff/Public), 200/2xx (Admin); create→409 on duplicate; not-found→404.
- **Frontend (RTL):** `(admin)` layout redirects non-Admin; `/admin/users` renders list, opens create/edit dialogs, confirms delete, surfaces errors/loading; role select constrained to admin/staff/none.
- **Infra:** `sam validate --profile IBD-DEV`; manual preflight + one live admin call post-deploy.
- **Gates:** backend + frontend `npm test` green; `npm run build` (frontend static export) succeeds.
