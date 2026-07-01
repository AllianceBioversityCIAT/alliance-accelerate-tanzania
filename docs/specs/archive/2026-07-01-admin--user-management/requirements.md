# Requirements — Admin User-Management Module

- Spec path: docs/specs/admin/user-management/
- Status: Draft
- Author / Date: SDD (Leader) — 2026-06-30
- Related: docs/prd.md (admin/operator personas); docs/system-design/design.md §2 (IA `/admin/users`), §5 (admin shell), §10 (a11y); docs/detailed-design/detailed-design.md §2, §4 (`/api/v1/users`), §7 (Cognito), §8 (RBAC/PII); proposal.md; archived `2026-06-25-changes--auth-wiring`

## 1. Summary

The first module of the admin area: an **Admin-only** console and REST API to manage application users — list, view, create, update, delete — plus assign/change role and reset password. Users are AWS Cognito identities (no DB table); the module wraps Cognito admin operations behind the existing `JwtAuthGuard` + `RolesGuard` so operators no longer need the AWS Console. It establishes the reusable admin shell and the backend's first authenticated write surface, on which later admin modules (e.g. bulk actor operations) will build. Advances detailed-design §4/§8 (Admin user management) and system-design §2 IA.

## 2. Requirement Numbering & Writing Standards

- Functional: `FR-1…`; non-functional: `NFR-1…`. Atomic, testable, traceable to design + tasks.
- MUST / SHOULD / MAY per RFC 2119.
- RBAC roles: `Public` / `Staff` / `Admin` (Cognito groups `admin`, `staff`; none = Public). AWS commands use `--profile IBD-DEV`.

## 3. Glossary

- **Cognito user** — an identity in the user pool (`infra/10-data-auth`); pool is admin-create-only.
- **Role / group** — `admin`, `staff` Cognito groups; absence = Public. Role derives from the verified `cognito:groups` claim.
- **Admin operator** — a signed-in user in the `admin` group; the only actor for this module.
- **First-login flow** — Cognito `FORCE_CHANGE_PASSWORD` challenge already handled by `frontend/lib/auth/auth-client.ts` (`confirmNewPassword`).

## 4. System Context & Scope

**In scope:** an `Admin`-gated `UsersModule` (`/api/v1/users`) wrapping Cognito admin APIs; `class-validator` DTOs; a Cognito→API user serializer (allowlist, never secrets); anti-self-lockout; backend IAM permission to call Cognito admin APIs (scoped to the pool ARN) + API Gateway CORS write methods; a frontend `(admin)` route group + minimal admin shell + `/admin/users` console.

**Out of scope (see §6).**

## 5. Stakeholders / Personas

- **Admin operator** — creates/manages staff & admin accounts; primary user.
- **New user (Staff/Admin)** — receives a Cognito invitation, completes first-login password change.
- **Security/compliance reviewer** — relies on server-side Admin enforcement and no-secret-leakage.

## 6. Functional Requirements

### FR-1: List users (Admin)
- **Description:** The system SHALL provide `GET /api/v1/users` returning a paginated list of Cognito users with `sub`, `email`, account `status`, `enabled`, and `roles` (group memberships). Admin-only.
- **Rationale / Source:** detailed-design §4; proposal §8.
- **Acceptance (Given/When/Then):**
  - GIVEN an authenticated Admin, WHEN they GET `/api/v1/users`, THEN a paginated list of users with role(s) is returned (200).
  - GIVEN a Staff or Public caller, WHEN they GET `/api/v1/users`, THEN the response is 403 (Staff) / 401 (unauthenticated).
- **PII/RBAC impact:** Admin only. User emails are sensitive identity data, exposed solely within this Admin-gated module.

### FR-2: View a single user (Admin)
- **Description:** The system SHALL provide `GET /api/v1/users/:id` returning one user's allowlisted attributes + roles. Admin-only. Unknown id → 404.
- **Acceptance:**
  - GIVEN an Admin and an existing user id, WHEN they GET `/api/v1/users/:id`, THEN that user's details + roles are returned.
  - GIVEN a non-existent id, WHEN an Admin requests it, THEN 404 is returned.
- **PII/RBAC:** Admin only.

### FR-3: Create user (Admin)
- **Description:** The system SHALL provide `POST /api/v1/users` accepting a validated email and an initial role (`admin` | `staff` | none) and SHALL create the Cognito user via `AdminCreateUser`, sending the Cognito **invitation email** with a temporary password. The new user MUST be placed in the requested group (if any).
- **Acceptance:**
  - GIVEN an Admin, WHEN they POST a valid new email + role, THEN a Cognito user is created, added to the role group, an invitation email is sent, and 201 with the created user (no password) is returned.
  - GIVEN an email that already exists, WHEN an Admin creates it, THEN a 409 conflict is returned.
  - GIVEN an invalid email/role, WHEN submitted, THEN 400 with validation errors is returned.
  - GIVEN the new user signs in with the temp password, THEN they are required to set a new password (existing first-login flow) and then have the assigned role.
- **PII/RBAC:** Admin only. Response MUST NOT include any password.

### FR-4: Update user attributes (Admin)
- **Description:** The system SHALL provide `PATCH /api/v1/users/:id` to update editable Cognito attributes (e.g. email, enable/disable). Admin-only, validated.
- **Acceptance:**
  - GIVEN an Admin, WHEN they PATCH valid attributes for an existing user, THEN Cognito is updated and the updated user is returned (200).
  - GIVEN invalid input, THEN 400; GIVEN unknown id, THEN 404.
- **PII/RBAC:** Admin only.

### FR-5: Assign / change role (Admin)
- **Description:** The system SHALL allow assigning a user to, or removing them from, the existing `admin` / `staff` groups (role = `admin` | `staff` | none) via a dedicated operation (e.g. `PATCH /api/v1/users/:id/role`). v1 supports only the existing two groups; creating new role types is out of scope.
- **Acceptance:**
  - GIVEN an Admin, WHEN they set a user's role to `staff`, THEN the user is added to the `staff` group and removed from `admin` (and vice-versa); setting role to none removes both groups; 200 returned.
  - GIVEN a role value outside {`admin`,`staff`,none}, THEN 400.
- **PII/RBAC:** Admin only. Drives RBAC for the whole app — must be Admin-enforced server-side.

### FR-6: Delete user (Admin)
- **Description:** The system SHALL provide `DELETE /api/v1/users/:id` removing the Cognito user. Admin-only. Unknown id → 404; success → 204.
- **Acceptance:**
  - GIVEN an Admin and an existing user (not themselves), WHEN they DELETE the user, THEN the Cognito user is removed and 204 returned.
- **PII/RBAC:** Admin only. Subject to FR-8.

### FR-7: Reset password (Admin)
- **Description:** The system SHALL provide `POST /api/v1/users/:id/password` that triggers an **email-based** password reset for the target user (Cognito `AdminResetUserPassword`), prompting them to set a new password at next sign-in. The admin never sees or sets a plaintext password through this endpoint.
- **Acceptance:**
  - GIVEN an Admin, WHEN they reset a user's password, THEN Cognito initiates the reset (email) and 200/204 is returned; no plaintext password is in the request or response.
  - GIVEN unknown id, THEN 404.
- **PII/RBAC:** Admin only. No secret ever returned or logged.

### FR-8: Anti-self-lockout
- **Description:** The system SHALL prevent an Admin from deleting their own account (FR-6) or removing their own `admin` role (FR-5).
- **Acceptance:**
  - GIVEN an Admin whose `sub` equals the target, WHEN they attempt self-delete or self-demote, THEN the operation is rejected (409/403) with a clear message and no change occurs.
- **PII/RBAC:** Admin only; protects platform availability.

### FR-9: Server-side RBAC enforcement
- **Description:** Every `/api/v1/users` route MUST require an authenticated Admin, enforced server-side via `JwtAuthGuard` + `RolesGuard` + `@Roles('Admin')` — never client-only.
- **Acceptance:**
  - GIVEN any users route, WHEN called without a token, THEN 401; WHEN called by Staff/Public, THEN 403; WHEN called by Admin, THEN allowed.
- **PII/RBAC:** Core gate. Any Admin-gate gap is a release blocker.

### FR-10: No secret/password leakage
- **Description:** No users endpoint SHALL return or log passwords, temporary passwords, or Cognito secrets. Responses MUST be built by an explicit attribute allowlist (`sub`, `email`, `status`, `enabled`, `roles`, timestamps).
- **Acceptance:**
  - GIVEN any users response, WHEN inspected, THEN no password/secret field is present; only allowlisted attributes appear.
- **PII/RBAC:** Defense in depth, mirrors the Actor role-aware serializer pattern.

### FR-11: Admin console UI (`/admin/users`)
- **Description:** The frontend SHALL provide an Admin-gated `/admin/users` page within a new `(admin)` route group + minimal admin shell (layout + sidebar), wrapped in `<RequireRole allow={['Admin']}>`. It lists users and offers create, edit, delete, role-assignment, and password-reset actions calling `/api/v1/users`.
- **Acceptance:**
  - GIVEN an Admin, WHEN they open `/admin/users`, THEN the user list and management actions render.
  - GIVEN a Staff/Public/anonymous visitor, WHEN they navigate to `/admin/users`, THEN they are redirected to `/login` (client guard) AND any API call they attempt is independently rejected 401/403 (FR-9).
  - GIVEN a destructive action (delete), WHEN triggered, THEN a confirmation is required; loading/disabled and error states are shown.
- **PII/RBAC:** Admin only; UI gate is convenience, server gate (FR-9) is authoritative.

### FR-12: Backend authorized to call Cognito admin APIs + CORS for writes
- **Description:** The backend Lambda SHALL be granted a **least-privilege** IAM policy for the required `cognito-idp` admin actions scoped to the user-pool ARN, and the API Gateway CORS config SHALL permit `POST, PATCH, DELETE` (in addition to existing `GET, OPTIONS`). All defined in SAM under `infra/` with `--profile IBD-DEV`.
- **Acceptance:**
  - GIVEN the deployed backend, WHEN a users write endpoint runs, THEN the Cognito admin call succeeds (no AccessDenied).
  - GIVEN a browser preflight for a write method, WHEN sent, THEN CORS allows it.
- **PII/RBAC:** IAM scoped to the single pool ARN; no wildcard Cognito permissions.

## 7. Non-Functional Requirements

- **NFR-1 (Security / least privilege):** Admin-only enforced server-side on all routes; IAM scoped to the pool ARN; no plaintext password is stored, returned, or logged; inputs validated via DTOs (`class-validator`) through the global `ValidationPipe`. Any violation is a FAIL.
- **NFR-2 (Static export preserved):** The admin UI MUST remain compatible with Next.js static export — no SSR/route handlers; auth/role gating is client-side (`RequireRole`) with the API as the authoritative guard.
- **NFR-3 (Accessibility — WCAG 2.1 AA):** Admin tables/forms keyboard-navigable, labeled controls, visible focus, error messaging via live region; uses design tokens (system-design §7), no hardcoded colors/geometry.
- **NFR-4 (Error handling & observability):** Cognito errors mapped to correct HTTP codes (404/409/400/403); no secret in logs; consistent error envelope matching existing API conventions.
- **NFR-5 (Tests):** Backend unit/e2e cover RBAC (401/403/200), each CRUD/role/password path (Cognito client mocked), anti-self-lockout, and serializer no-leak. Frontend tests cover the gated page + key interactions. `npm test` (backend + frontend) green; `sam validate` passes.
- **NFR-6 (Performance):** List endpoint paginated; default page size bounded (consistent with the actors `@Max(100)` convention).

## 8. Data & Schema Impact

No Prisma schema change — users live in Cognito (source of truth); **no `User` table is added**. No new Actor PII fields. The Actor `PII_ALLOWLIST` (`pii-consent.policy.ts`) is unrelated and unchanged; Cognito user attributes are governed by the new users serializer (FR-10) and the Admin gate.

## 9. Out of Scope

- Bulk actor operations / bulk unlock (the *next* admin module).
- Creating arbitrary new role types/groups (v1 = existing `admin`/`staff`/none). [OQ-1 → fixed]
- Admin-set plaintext temporary passwords (v1 uses email-based reset). [OQ-2 → email reset]
- Persistent audit log of admin actions. [OQ-3 → deferred to follow-up]
- Self-service signup, MFA management, federated/social login.
- Actor registry CRUD, import/export consoles.
- A Prisma user-mirror table.

## 10. Dependencies & Assumptions

- Auth backbone (`backend/src/auth/`): `JwtAuthGuard`, `RolesGuard`, `@Roles`, `@CurrentUser`, `roleFromGroups` — present and reused.
- Cognito pool + `admin`/`staff` groups + admin-create-only + first-login flow — present (`infra/10-data-auth`, `frontend/lib/auth/auth-client.ts`).
- Frontend `RequireRole`, `useSession`, `SessionProvider`, `lib/api/client` — present and reused.
- **New:** backend needs a Cognito admin SDK client + scoped IAM (FR-12); CORS write methods (FR-12); new `(admin)` frontend shell (none exists).
- All AWS via `--profile IBD-DEV`.

## 11. Open Questions

Resolved at proposal approval (defaults accepted):
- **OQ-1 → Fixed roles** (`admin`/`staff`/none) for v1.
- **OQ-2 → Email-based password reset** (`AdminResetUserPassword`); no admin-set plaintext.
- **OQ-3 → Audit log deferred** to a follow-up spec.
- **OQ-4 → Cognito invitation email** sent on create.

Remaining for `/sdd-specify` design/build confirmation:
- **OQ-5:** Exact editable attribute set in FR-4 (email change vs enable/disable only) — to finalize in design.

## 12. Requirement ID Index

| ID | Title | Type |
|---|---|---|
| FR-1 | List users | Functional |
| FR-2 | View a single user | Functional |
| FR-3 | Create user | Functional |
| FR-4 | Update user attributes | Functional |
| FR-5 | Assign / change role | Functional |
| FR-6 | Delete user | Functional |
| FR-7 | Reset password (email) | Functional |
| FR-8 | Anti-self-lockout | Functional |
| FR-9 | Server-side RBAC enforcement | Functional |
| FR-10 | No secret/password leakage | Functional |
| FR-11 | Admin console UI `/admin/users` | Functional |
| FR-12 | Cognito IAM + CORS writes | Functional |
| NFR-1 | Security / least privilege | Non-functional |
| NFR-2 | Static export preserved | Non-functional |
| NFR-3 | Accessibility (WCAG 2.1 AA) | Non-functional |
| NFR-4 | Error handling & observability | Non-functional |
| NFR-5 | Test coverage | Non-functional |
| NFR-6 | Performance / pagination | Non-functional |

---
**Conventions reminder:** roles `Public`/`Staff`/`Admin`; PII protection server-side; static export (no SSR); AWS `--profile IBD-DEV`.
