# Design — Auth Wiring (Cognito sign-in + JWT/RBAC backbone)

- Spec path: docs/specs/changes/auth-wiring/
- Status: Draft
- Traces requirements: FR-1..FR-9, NFR-1..NFR-7

## 1. Approach Overview

Light up the dormant Cognito layer end-to-end with the smallest blast radius (proposal Option A):

- **Frontend** uses **AWS Amplify Auth** against the already-provisioned SRP/`USER_PASSWORD` SPA client — a branded `/login` page (no Hosted UI, no infra OAuth change), a `SessionProvider` that resolves the current session and derives role from the `cognito:groups` claim, and a real `useSession()` replacing the stub (types unchanged).
- **Backend** verifies the Cognito access token with **`aws-jwt-verify`** (official) against the pool JWKS in a NestJS `JwtAuthGuard`, plus a `@Roles()` decorator + `RolesGuard` and a `@CurrentUser()` param decorator. Guards are **opt-in per route** — public endpoints stay open. Two proof routes (`/auth/me`, a Staff-guarded probe) close the loop.
- **Infra** delta is two Lambda env vars (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` via `Fn::ImportValue` from data-auth) and adding `Authorization` to the HTTP API CORS allow-headers. No Cognito resource change.

```
/login (client) ──Amplify signIn (SRP)──▶ Cognito User Pool ──tokens──▶ SessionProvider
                                                                          │ role = cognito:groups
                                                                          ▼
  useSession() → {role,user}        apiGetAuthed() ──Authorization: Bearer access─▶ API Gateway
                                                                          │
                                                                          ▼
                              JwtAuthGuard (aws-jwt-verify: iss/aud/use/exp via JWKS)
                                                                          │ req.user={sub,role,groups}
                                                                          ▼
                              RolesGuard(@Roles) → 401 / 403 / handler (/auth/me, probe)
```

## 2. Data Model Changes

**None.** No Prisma model/migration; no user table (identity is in Cognito, role is a per-request claim). No PII field added; PII projection unchanged (FR-8/NFR-3).

## 3. API Surface & Contracts

### New — protected

| Method · Path | Auth | Response | Errors |
|---|---|---|---|
| `GET /api/v1/auth/me` | valid Cognito access token (any role) | `{ sub, username, email?, role: 'Public'|'Staff'|'Admin', groups: string[] }` — no PII beyond the caller's own identity | `401` missing/invalid token |
| `GET /api/v1/auth/protected` | `@Roles('Staff')` (Admin ≥ Staff) | `{ ok: true, role }` (proof probe) | `401` no token · `403` authenticated but under-privileged |

`/auth/me` returns the caller's own Cognito attributes only (self), so exposing the caller's own email is not a PII-boundary breach (it is their own identity, not another actor's PII).

### Unchanged — public

`GET /api/v1/actors`, `/actors/:id`, `/metrics`, `/health` stay anonymous and PII-safe — **no global guard** is registered (FR-8).

### CORS

HTTP API `AllowHeaders` adds `Authorization` (currently `Content-Type` only). `AllowMethods` stays `GET, OPTIONS` (both proof routes are GET); non-GET methods are a Phase-2 (admin) concern.

## 4. Backend Module Design

New `backend/src/auth/` module (imported into `AppModule`):

- **`auth.config.ts`** — reads `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `AWS_REGION` from env; throws clearly if absent in the Lambda.
- **`jwt-verifier.ts`** — a singleton `CognitoJwtVerifier.create({ userPoolId, tokenUse: 'access', clientId })` (reused across warm invocations; caches JWKS — NFR/cold-start friendly, mirrors the PrismaService singleton pattern).
- **`jwt-auth.guard.ts`** (`JwtAuthGuard`) — extracts the `Authorization: Bearer` token; `verifier.verify(token)`; on success attaches `req.user = { sub, username, email, groups, role }` where `role` is derived from `groups` (`admin`→`Admin`, else `staff`→`Staff`, else `Public`); on any failure throws `UnauthorizedException` (401).
- **`roles.decorator.ts`** (`@Roles(...roles)`) + **`roles.guard.ts`** (`RolesGuard`) — reads required roles via `Reflector`; passes if `req.user.role` is in the set OR is `Admin` when `Staff` is required (Admin ≥ Staff); else `ForbiddenException` (403). `RolesGuard` runs after `JwtAuthGuard`.
- **`current-user.decorator.ts`** (`@CurrentUser()`) — returns `req.user`.
- **`auth.controller.ts`** — `@Controller('auth')`; `GET me` (`@UseGuards(JwtAuthGuard)`), `GET protected` (`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Staff')`).
- **`auth.module.ts`** — providers/exports the guards + verifier.

**Security (NFR-1):** verification checks issuer (`https://cognito-idp.<region>.amazonaws.com/<poolId>`), client id (audience), `token_use=access`, and expiry — all handled by `aws-jwt-verify`. Role comes solely from the verified claim; request body/headers can never assert a role. Guards are opt-in (never global), so public endpoints are unaffected.

**Errors:** reuse Nest's `UnauthorizedException`/`ForbiddenException` → the existing global pipeline returns standard 401/403 envelopes.

## 5. Frontend Design

### Routes & providers

| Path | File | Notes |
|---|---|---|
| `/login` | `frontend/app/(public)/login/page.tsx` | client; email/password form + new-password challenge step |
| (wrap app) | `frontend/app/layout.tsx` | mount `<SessionProvider>` (client) around children |

### `frontend/lib/auth/`

- **`amplify-config.ts`** — `Amplify.configure({ Auth: { Cognito: { userPoolId, userPoolClientId } } })` from build-time `NEXT_PUBLIC_COGNITO_USER_POOL_ID` / `NEXT_PUBLIC_COGNITO_CLIENT_ID` (baked like `NEXT_PUBLIC_API_BASE_URL`).
- **`auth-client.ts`** — thin wrappers over Amplify v6: `signIn`, `confirmNewPassword` (handles `NEW_PASSWORD_REQUIRED`), `signOut`, `getSession()` (→ `{ role, user, accessToken }` from `fetchAuthSession` + the ID token's `cognito:groups`), `roleFromGroups(groups)`.
- **`SessionProvider.tsx`** (`'use client'`) — React context: resolves the session on mount, exposes `{ session, loading, signIn, signOut, refresh }`; updates on sign-in/out.
- **`useSession.ts`** — **replaced**: reads the context and returns the existing `Session` (`{ role, user }`) shape; exported `Role`/`Session` types unchanged so consumers compile (FR-2). A companion `useAuth()` exposes the actions/loading.

### API transport (`frontend/lib/api/`)

- **`client.ts`** — add `apiGetAuthed<T>(path)` that attaches `Authorization: Bearer <accessToken>` (from `fetchAuthSession`) and, on `401`, signals an auth failure the caller/app can route to `/login` (FR-9/NFR-7). Public `apiGet` is unchanged (no token), so `getActors`/`getActor`/metrics stay anonymous.

### Components

- **`components/shell/Header.tsx`** — `Public`: "Staff sign-in" link → `/login`; authenticated: name + `RoleBadge`-style role chip + "Sign out". Tokens-only, accessible.
- **`components/auth/LoginForm.tsx`** — labeled email/password inputs, submit, error region (`aria-live`), and the conditional "set new password" step; reuses `Button` + §7 tokens.
- **`lib/auth/RequireRole.tsx`** (optional, minimal) — a client guard that redirects `Public` to `/login`; seed for future protected pages (no protected page ships here).

**Static export (NFR-2):** all of the above is client-side; Amplify resolves tokens in the browser. No SSR/route handlers. `/login` is a static route; the `SessionProvider` is a client boundary under the root layout.

## 6. Security & RBAC

- Server is the source of truth: `JwtAuthGuard` + JWKS verification; role from verified `cognito:groups` only (NFR-1). Frontend role is UX gating only.
- Public boundary preserved: opt-in guards, no PII projection change (FR-8/NFR-3).
- Token posture (NFR-5): document Amplify storage; recommend not echoing tokens into logs; access token is short-lived, refresh managed by Amplify.
- CORS: add `Authorization` allow-header; same-origin app→API over TLS.

## 7. Infrastructure / Deployment

- `infra/20-backend/template.yaml`: add Lambda env `COGNITO_USER_POOL_ID: !ImportValue "accelerate-tz-dev-data-auth-UserPoolId"`, `COGNITO_CLIENT_ID: !ImportValue "…-UserPoolClientId"`; add `Authorization` to `CorsConfiguration.AllowHeaders`. Redeploy via the built-template path (`sam build` → deploy built template), `--profile IBD-DEV`.
- Frontend: rebuild with `NEXT_PUBLIC_COGNITO_USER_POOL_ID` / `NEXT_PUBLIC_COGNITO_CLIENT_ID` (resolved from the data-auth stack outputs) baked in, then `deploy-frontend.sh` (S3 + CloudFront invalidation).
- A test Staff/Admin user is admin-created for live verification (`aws cognito-idp admin-create-user` + `admin-add-user-to-group`, `--profile IBD-DEV`).
- No data-auth/Cognito resource change.

## 8. Decision Records (ADR-style)

### Decision: In-app SRP (Amplify) over Cognito Hosted UI
- **Context:** the SPA client has SRP/`USER_PASSWORD` enabled but **no** Hosted-UI domain/OAuth flows (infra deferred them).
- **Options:** (a) Amplify in-app SRP form — no infra change, branded, more in-app code; (b) Hosted UI — needs a Cognito domain + OAuth callbacks (infra delta) + redirect UX; (c) hand-rolled `amazon-cognito-identity-js` — owns token/refresh/hardening.
- **Decision:** (a). Smallest blast radius; uses what's provisioned; security-critical token handling delegated to Amplify + `aws-jwt-verify`.
- **Consequences:** adds `aws-amplify`; we host the login form; switching to Hosted UI later is possible but out of scope.

### Decision: Opt-in guards, never a global auth guard
- **Context:** public endpoints must stay open (FR-8).
- **Decision:** apply `JwtAuthGuard`/`RolesGuard` per controller/route only; no `APP_GUARD`.
- **Consequences:** a new protected route must explicitly add the guard; a test asserts `/actors` works tokenless so a future global guard can't silently lock the public API.

### Decision: Role derived only from the verified `cognito:groups`
- **Context:** never trust client-asserted roles (NFR-1).
- **Decision:** role mapping happens in `JwtAuthGuard` post-verification; `Admin ≥ Staff`.
- **Consequences:** a forged role in body/header is ignored; a test asserts this.

## 9. Risks & Mitigations

- **Cold-start JWKS fetch:** the verifier is a warm-reused singleton and caches JWKS; first call fetches once.
- **Locking out the public API:** mitigated by the opt-in-guard rule + an explicit tokenless `/actors` test (T-7).
- **Token in localStorage (XSS):** documented posture (NFR-5); short-lived access token + managed refresh; revisit for prod.
- **First-login challenge friction:** `/login` handles `NEW_PASSWORD_REQUIRED` (OQ-3).
- **CORS preflight on `Authorization`:** covered by the allow-header delta + a live check (T-8).
- **Rollback:** auth is additive — reverting the backend env/guards and frontend `/login`/provider restores the prior public-only app; the stub `useSession` contract is preserved so a revert compiles.

## 10. Test Plan Outline

- **Backend (FR-5/6/7/8):** unit tests with a mocked verifier — valid token → `req.user` + role mapping (admin/staff/none); invalid/expired/wrong-aud → 401; `@Roles('Staff')` allows Staff+Admin, 403 for Public; `/auth/me` shape; **tokenless `/actors` still 200 + PII-safe** (no global guard); forged-role-ignored test.
- **Frontend (FR-1/2/3/4/9):** mocked Amplify — `signIn` success/failure, new-password challenge, `roleFromGroups`, `useSession` returns mapped role, sign-out clears; Header renders sign-in vs user menu; `apiGetAuthed` attaches bearer + 401→login signal; `LoginForm` a11y (jest-axe).
- **Static export (NFR-2):** `next build` green with `/login` static.
- **Live (T-8, IBD-DEV):** admin-create a Staff user; sign in; `GET /auth/me` → role; no token → 401; Public-group token → 403 on probe; `/actors` still open + PII-free; CORS preflight passes with `Authorization`.
