# Requirements — Auth Wiring (Cognito sign-in + JWT/RBAC backbone)

- Spec path: docs/specs/changes/auth-wiring/
- Status: Draft
- Author / Date: JuanCode / 2026-06-24
- Depth: Full (auth / security / cross-cutting)
- Related: docs/prd.md (Staff/Admin personas; US-4/5/8), docs/system-design/design.md §4 (nav/IA), §7 (tokens); docs/detailed-design/detailed-design.md §8 (RBAC/PII)
- Consumes: archived `infra/aws-deployment` Cognito (User Pool + SPA client + `admin`/`staff` groups; exported `UserPoolId`, `UserPoolClientId`)
- Unblocks: future `admin/data-validation` console + `actors/directory` Phase-2 PII unlock
- Proposal: docs/specs/changes/auth-wiring/proposal.md (Option A — in-app SRP via Amplify + `aws-jwt-verify`)

## 1. Summary

Activate the provisioned-but-dormant Cognito identity layer so `Staff`/`Admin` users can **sign in**, the frontend carries a **real verified session** (replacing the always-`Public` stub), and the NestJS API **verifies the Cognito JWT and enforces role-based access** via a guard + `@Roles()` decorator. This delivers only the identity *backbone* and a protected proof endpoint — not the admin UI, write paths, or PII-unlock projection (Phase 2). It advances the PRD Staff/Admin personas and is the hard dependency for every authenticated feature.

## 2. Requirement Numbering & Writing Standards

- Functional requirements `FR-1…`; non-functional `NFR-1…`. Atomic, testable; MUST/SHOULD/MAY (RFC 2119).
- RBAC roles: `Public` (anonymous), `Staff`, `Admin`. PII = `phone`, `email` (+ the allowlist). This spec adds **no PII fields** and changes **no PII projection**.
- Role is authoritative **only** from the server-verified `cognito:groups` claim; any client-asserted role is UX-only.

## 3. Functional Requirements

### FR-1: Staff/Admin sign-in

- **Description:** The system MUST provide a `/login` screen where an admin-created `Staff`/`Admin` user authenticates with email + password against the Cognito SPA client, including handling the first-login **new-password challenge** that admin-created accounts receive.
- **Rationale / Source:** PRD Staff/Admin personas; proposal §4(1).
- **Acceptance criteria:**
  - GIVEN a valid admin-created Staff user WHEN they submit correct credentials at `/login` THEN a session is established and they are returned to the app authenticated.
  - GIVEN a first-login account in the `NEW_PASSWORD_REQUIRED` state WHEN they sign in THEN they are prompted to set a new password and, on success, are authenticated.
  - GIVEN invalid credentials WHEN submitted THEN a clear, accessible error is shown and no session is created.
- **PII/RBAC impact:** establishes Staff/Admin identity; no PII exposed.

### FR-2: Real authenticated session (role from groups)

- **Description:** `useSession()` MUST return the **real** role and identity derived from the verified Cognito token's `cognito:groups` claim (`admin`→`Admin`, `staff`→`Staff`, none→`Public`), and the session MUST survive a page reload (via token refresh). The exported `Role`/`Session` types MUST be unchanged so existing consumers compile without edits.
- **Rationale / Source:** replaces the stub; proposal §3/§4(1).
- **Acceptance criteria:**
  - GIVEN a signed-in Admin WHEN any component calls `useSession()` THEN it returns `{ role: 'Admin', user: { name, … } }`.
  - GIVEN a signed-in user WHEN the page reloads THEN the session is restored (no re-login) until tokens expire/refresh fails.
  - GIVEN an authenticated user in no RBAC group WHEN `useSession()` is read THEN role is `Public` (authenticated but unprivileged).
- **PII/RBAC impact:** core role plumbing; no PII.

### FR-3: Sign-out

- **Description:** The system MUST let a signed-in user sign out, clearing the local session/tokens; subsequently `useSession()` returns `Public`.
- **Acceptance criteria:** GIVEN a signed-in user WHEN they sign out THEN tokens are cleared AND `useSession()` returns `{ role: 'Public', user: null }` AND protected affordances disappear.

### FR-4: Header authentication UX

- **Description:** The public shell header MUST show a "Staff sign-in" affordance for `Public`, and — when authenticated — the user's name, role, and a sign-out control. Tokens-only, accessible.
- **Rationale / Source:** system-design §4; proposal §4(4).
- **Acceptance criteria:** GIVEN `Public` THEN the header shows a sign-in link to `/login`; GIVEN a signed-in user THEN the header shows their name + role + sign-out.

### FR-5: Backend JWT verification

- **Description:** The API MUST provide a guard that verifies the Cognito JWT against the User Pool JWKS, checking **issuer, audience/client-id, token-use, and expiry**; an invalid or missing token on a protected route MUST yield `401`.
- **Rationale / Source:** detailed-design §8; proposal §4(2).
- **Acceptance criteria:**
  - GIVEN a protected route WHEN called with a valid, unexpired Cognito token THEN the request proceeds with the verified identity attached.
  - GIVEN a protected route WHEN called with a missing/expired/malformed/wrong-audience token THEN the API responds `401` and does not execute the handler.
- **PII/RBAC impact:** server-side enforcement boundary (NFR-1).

### FR-6: Role-based access control

- **Description:** The API MUST provide a `@Roles()` decorator + guard that authorizes a route by role, where role is derived **only** from the verified `cognito:groups` claim and `Admin` satisfies any `Staff` requirement (Admin ≥ Staff). An authenticated caller lacking the required role MUST yield `403`.
- **Acceptance criteria:**
  - GIVEN a `Staff`-required route WHEN a `Staff` or `Admin` token calls it THEN it proceeds.
  - GIVEN a `Staff`-required route WHEN an authenticated no-group (`Public`) token calls it THEN `403`.
  - GIVEN any protected route WHEN the client sends a forged role in the body/header THEN it is ignored; only the verified claim decides.

### FR-7: Auth proof endpoints

- **Description:** The API MUST expose `GET /api/v1/auth/me` (returns the caller's role + identity for a valid token) and one `Staff`-guarded probe route, to demonstrate the end-to-end verification + RBAC loop.
- **Acceptance criteria:**
  - GIVEN a valid token WHEN `GET /api/v1/auth/me` is called THEN it returns `{ role, username/sub }` with no PII.
  - GIVEN no token WHEN `GET /api/v1/auth/me` is called THEN `401`.
  - GIVEN a non-Staff token WHEN the guarded probe is called THEN `403`.

### FR-8: Public endpoints stay open and PII-safe

- **Description:** Existing anonymous endpoints (`/actors`, `/actors/:id`, `/metrics`, `/health`) MUST remain reachable without a token and MUST NOT change their PII-safe projection. No global auth guard may be applied.
- **Acceptance criteria:**
  - GIVEN no token WHEN `GET /api/v1/actors` is called THEN it returns the same PII-safe list as before (200), unaffected by auth wiring.
  - WHEN the full suite runs THEN no `phone`/`email` appears in any public response.

### FR-9: Authenticated request transport

- **Description:** Frontend authenticated API calls MUST attach `Authorization: Bearer <token>`, and the HTTP API CORS MUST allow the `Authorization` header. Public calls remain unauthenticated.
- **Acceptance criteria:**
  - GIVEN a signed-in user WHEN the app calls a protected endpoint THEN the request carries `Authorization: Bearer …` and is not blocked by CORS preflight.
  - GIVEN a `401` from a protected call WHEN received THEN the app handles it gracefully (e.g. routes to `/login`), never crashing.

## 4. Non-Functional Requirements

- **NFR-1 (Security):** Tokens MUST be verified server-side (issuer, audience/client-id, token-use, expiry) against the pool JWKS; the server MUST NEVER trust a client-asserted role. **MUST.**
- **NFR-2 (Static export):** All auth flows (login, refresh, sign-out, token resolution) MUST be client-side; no SSR, ISR, or route handlers; `next build` (output: export) MUST stay green. **MUST.**
- **NFR-3 (PII boundary):** No PII field added; no change to the public PII-safe projection or the consent model. **MUST.**
- **NFR-4 (Design tokens + a11y):** Login form and header auth UI MUST use §7 tokens (no raw hex), with labeled controls, keyboard operability, visible focus, and accessible error messaging (WCAG 2.1 AA). **MUST.**
- **NFR-5 (Token-storage posture):** The implementation SHOULD minimize exposure of long-lived tokens (prefer in-memory access token with managed refresh over persisting raw tokens in `localStorage` where practical); the chosen posture MUST be documented. **SHOULD.**
- **NFR-6 (Deploy):** All AWS commands/IaC MUST use `--profile IBD-DEV`, eu-west-1. **MUST.**
- **NFR-7 (Resilience):** Auth/token failures MUST surface clear states (login errors, expired-session handling) and never throw unhandled to the UI. **MUST.**

## 5. Data & Schema Impact

- **No Prisma model/migration change. No new PII fields.** Identity lives in Cognito; the API derives role from the JWT claim at request time (no user table). The only backend env additions are `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID`.

## 6. Out of Scope (Phase 2 / follow-ups)

- The Data Maintenance & Validation console, write/CRUD endpoints, consent-request/approve-publish workflow (`admin/data-validation`).
- Role+consent **PII unlock** read projection (Staff/Admin seeing `phone`/`email`) — this spec ships the guard/role mechanism it will use, but changes no serializer output.
- Public self-signup, MFA, federation/SCIM, password-reset flows beyond the first-login new-password challenge.
- Any change to the consent model or PII allowlist.

## 7. Dependencies & Assumptions

- Cognito User Pool + SPA client (SRP + `USER_PASSWORD_AUTH`, admin-create-only) + `admin`/`staff` groups exist and are **exported** as `accelerate-tz-dev-data-auth-UserPoolId` / `-UserPoolClientId` (confirmed in the data-auth template Outputs).
- Backend is NestJS on Lambda (global prefix `api/v1`, global ValidationPipe). Frontend is Next.js static export; `NEXT_PUBLIC_*` env is baked at build (same mechanism as `NEXT_PUBLIC_API_BASE_URL`).
- A test `Staff`/`Admin` user is admin-created in the pool for live verification (T-8), `--profile IBD-DEV`.
- New deps: frontend `aws-amplify`; backend `aws-jwt-verify` (official).

## 8. Open Questions

- **OQ-1 (token storage):** Amplify default persists tokens (localStorage). Confirm acceptable for this dev posture, or require in-memory access token + managed refresh (NFR-5). **Recommendation:** accept Amplify-managed storage for dev; document the XSS trade-off; revisit for prod.
- **OQ-2 (PII unlock):** keep PII unlock in `admin/data-validation` (recommended) vs include a minimal Staff/Admin unlock here. **Recommendation:** defer.
- **OQ-3 (first-login challenge):** handle `NEW_PASSWORD_REQUIRED` in `/login` now (recommended — admin-create pools always hit it) vs fast-follow.
- **OQ-4 (sign-out scope):** local sign-out (clear this device) vs global (revoke refresh tokens). **Recommendation:** local for Phase 1.

## 9. Requirement ID Index

FR-1 sign-in · FR-2 real session/role · FR-3 sign-out · FR-4 header UX · FR-5 JWT verification · FR-6 RBAC · FR-7 proof endpoints · FR-8 public stays open · FR-9 authed transport/CORS · NFR-1 security · NFR-2 static export · NFR-3 PII boundary · NFR-4 tokens/a11y · NFR-5 token storage · NFR-6 IBD-DEV · NFR-7 resilience.

---
**Conventions reminder:** roles `Public`/`Staff`/`Admin`; PII = `phone`/`email`. Role is authoritative only from the verified JWT. All AWS uses `--profile IBD-DEV`.
