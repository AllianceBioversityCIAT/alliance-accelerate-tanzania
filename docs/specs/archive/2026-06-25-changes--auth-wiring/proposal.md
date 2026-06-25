# Proposal — Auth Wiring (Cognito sign-in + JWT/RBAC backbone)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `changes/auth-wiring` *(skill default for a bare name; can relocate to `auth/wiring` to match the `infra/aws-deployment` domain taxonomy — see §11)* |
| Type | Feature — foundational auth/identity layer (Phase-2 enabler) |
| Status | Draft — awaiting approval |
| Author / Date | JuanCode / 2026-06-24 |
| Constitutional refs | prd.md (Staff/Admin personas; US-4/5/8); detailed-design §8 (RBAC/PII); system-design §4/§7; CLAUDE.md (Cognito groups `admin`/`staff`, `Public` = anonymous) |
| Consumes | Provisioned-but-unwired Cognito from archived `infra/aws-deployment` (User Pool + SPA client + `admin`/`staff` groups; outputs `UserPoolId`, `UserPoolClientId`) |
| Unblocks | `admin/data-validation` console + role+consent **PII unlock** (both deferred by `actors/directory`) |

## 2. Intent

Turn the **provisioned-but-dormant** Cognito identity layer into a working end-to-end auth loop: let `Staff`/`Admin` users **sign in**, carry a verified session in the frontend (real role, not the stub), and let the **NestJS API verify the Cognito JWT and enforce role-based access** via a guard + `@Roles()` decorator. This is the **identity backbone** — the piece both deferred Phase-2 specs (the admin console and role+consent PII unlock) require. It deliberately ships the *mechanism* and a single protected proof endpoint, **not** the admin UI, write paths, or PII-unlock projection.

## 3. Problem / Current Behavior

- **Frontend:** `frontend/lib/auth/useSession.ts` is a stub — `useSession()` always returns `{ role: 'Public', user: null }`. There is no sign-in, no token, no sign-out. Its types (`Role = 'Public' | 'Staff' | 'Admin'`, `Session`) were intentionally frozen so a real implementation can swap in without touching consumers.
- **Backend:** every endpoint is anonymous. There is **no JWT verification, no auth guard, no `@Roles()` decorator, and no role extraction**. The role-aware serializer only ever produces the `Public` projection; there is no authenticated path that could (later) unlock PII.
- **Infra:** Cognito exists (User Pool, SPA app client with **SRP + `USER_PASSWORD_AUTH`** enabled, `admin`/`staff` groups, **admin-create-only**, **no Hosted UI / OAuth flows / domain**), exported as `UserPoolId` / `UserPoolClientId`. Nothing consumes it.
- **Consequence:** the entire authenticated half of the product (PII unlock on profiles, the Data Maintenance & Validation console, consent workflow, publish) is blocked because there is no way to *be* a Staff/Admin user in the running app.

## 4. Proposed Outcome

1. **Frontend session (real):** a branded in-app `/login` page and a real `useSession()` backed by Cognito — sign-in, token storage + silent refresh, role derived from the JWT `cognito:groups` claim (`admin`→`Admin`, `staff`→`Staff`, none→`Public`), and sign-out. Same exported `Role`/`Session` types so existing consumers compile unchanged.
2. **Backend JWT verification + RBAC:** a NestJS `JwtAuthGuard` that verifies the Cognito RS256 token against the pool JWKS (issuer = pool, audience = client id), a `@Roles('Admin'|'Staff')` decorator + `RolesGuard`, and a request-scoped role/user extracted from the verified claims. Public endpoints stay open and PII-safe.
3. **Proof endpoint:** `GET /api/v1/auth/me` — returns the caller's role + identity for a valid token, `401` for missing/invalid token. One guarded probe (e.g. `GET /api/v1/auth/protected` requiring `Staff`) demonstrates `403` for an under-privileged token. This closes the loop end-to-end without building any Phase-2 feature.
4. **Header/UX:** the public shell shows a "Staff sign-in" affordance and, when authenticated, the user's name + role + sign-out (system-design §4 nav patterns; tokens-only).

## 5. Scope

- Frontend: `/login` route + auth client (sign-in/out, token store, refresh, role-from-groups); real `useSession()`; a session provider; minimal header integration; a client-side route-guard helper for future protected pages.
- Backend: `JwtAuthGuard` (Cognito JWKS verify), `@Roles()` + `RolesGuard`, an auth/current-user decorator, `GET /api/v1/auth/me` + one guarded probe; wire `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` env into the Lambda from the data-auth exports (small `infra/20-backend` template delta).
- Static-export-safe (login + callback handling are client-side; no SSR/route handlers). Tokens-only styling, a11y, IBD-DEV for any deploy.

## 6. Non-Goals

- The **Data Maintenance & Validation console** (mockup 4), any **write/CRUD** endpoints, the **consent-request/approve-publish** workflow — `admin/data-validation` (Phase 2).
- The **role+consent PII unlock** read projection (Staff/Admin seeing `phone`/`email`) — deferred; this spec provides the guard/role mechanism it will use, but does not change the serializer's output. (Open for discussion — §11 OQ-3.)
- Public self-signup, password reset/MFA flows beyond what admin-create + first-login requires (can be a follow-up), and SCIM/federation.
- Changing the consent model or the PII allowlist.

## 7. Affected Users, Systems, And Specs

- **Users:** Staff/Admin (gain real sign-in); Public unchanged (still anonymous, PII-safe).
- **Frontend:** new `app/(public)/login/`, `lib/auth/*` (replace stub, add auth client + provider), `components/shell/Header.tsx` (sign-in/user menu).
- **Backend:** new `src/auth/*` (guard, roles decorator, controller); `app.module` wiring; `infra/20-backend/template.yaml` env delta (+ depends on data-auth `UserPoolId`/`UserPoolClientId` exports — confirm they carry `Export:` names).
- **Specs:** consumes archived `infra/aws-deployment` Cognito; unblocks the future `admin/data-validation` spec and the `actors/directory` Phase-2 PII-unlock follow-up.

## 8. Requirement Delta Preview

### ADDED
- Frontend Cognito sign-in (`/login`), real `useSession()` (role from `cognito:groups`), token refresh, sign-out, header auth UX.
- Backend Cognito JWT verification guard, `@Roles()` + `RolesGuard`, current-user extraction, `GET /api/v1/auth/me` + one guarded probe.
- Lambda env `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` (from data-auth exports).

### MODIFIED
- `frontend/lib/auth/useSession.ts` — stub body replaced with real Cognito resolution (exported types unchanged → consumers compile as-is).
- `frontend/components/shell/Header.tsx` — adds sign-in / authenticated user menu.
- `infra/20-backend/template.yaml` — adds two Cognito env vars (no Cognito resource change for the recommended option).

### REMOVED
- None (the stub is replaced, not removed; its contract is preserved).

## 9. Approach Options

**Option A — In-app SRP login form via AWS Amplify Auth (Recommended).** A branded `/login` page calls Amplify `signIn` against the **already-provisioned** SRP/`USER_PASSWORD` client; Amplify manages token storage + silent refresh + sign-out. Backend verifies the JWT with `aws-jwt-verify` (official lib) against the pool JWKS. *Pros:* **no Cognito/infra resource change** (uses what's provisioned), branded login, minimal custom credential code, static-export friendly. *Cons:* adds the Amplify Auth dependency; we host the login form.

**Option B — Cognito Hosted UI (OAuth redirect + PKCE).** AWS-hosted login page; app redirects out and back to a static callback route. *Pros:* zero in-app credential handling, AWS-maintained login. *Cons:* **requires an infra delta** to the Cognito client (Hosted-UI domain + OAuth flows + callback/logout URLs incl. the CloudFront origin) — exactly what infra deferred (OQ-4); limited branding; redirect UX.

**Option C — Hand-rolled `amazon-cognito-identity-js` + custom token store.** Full control, fewer deps than Amplify. *Cons:* we own token storage, refresh, and hardening — more surface area and risk for the same outcome as A.

## 10. Recommended Approach

**Option A.** It lights up the identity backbone with the **smallest blast radius**: it uses the SRP/`USER_PASSWORD` client exactly as provisioned (no Cognito resource change — only two backend env vars), keeps login client-side (static-export-safe), and leans on Amplify + the official `aws-jwt-verify` for the security-critical token handling rather than hand-rolling it. Hosted UI (Option B) is a reasonable later switch if the team wants an AWS-managed login page, but it forces the deferred infra OAuth/domain work now for no Phase-1 benefit.

## 11. Risks, Dependencies, And Open Questions

- **Dependency:** the data-auth stack must **export** `UserPoolId` / `UserPoolClientId` with `Export:` names for the backend `Fn::ImportValue`. If they're plain outputs (not exported), a one-line infra delta to add the exports is required — confirm at specify time.
- **OQ-1 (token storage):** in-memory + refresh vs `localStorage`. Recommend in-memory access token + Amplify-managed refresh; avoid long-lived tokens in `localStorage` where practical (XSS posture). Decide at design.
- **OQ-2 (CORS/headers):** authenticated calls send `Authorization: Bearer`. The HTTP API CORS currently allows `Content-Type` only and `GET/OPTIONS`; adding `Authorization` (and later non-GET methods for Phase 2) is a small `infra/20-backend` CORS delta. This spec only needs `Authorization` on `GET /auth/me`.
- **OQ-3 (PII unlock here or later):** should this spec also extend the role-aware serializer so an authenticated Staff/Admin sees `phone`/`email`? Recommend **defer** to `admin/data-validation` (PII unlock is tightly coupled to the consent/admin UX and the legal gate); auth-wiring ships only the guard/role mechanism it will use. Open for your call.
- **OQ-4 (first-login UX):** admin-create-only pools issue a temporary password → Cognito `NEW_PASSWORD_REQUIRED` challenge on first sign-in. Decide whether to handle the set-new-password challenge in `/login` now or as a fast-follow.
- **Security:** JWT verification must check issuer + audience + token-use + expiry (use `aws-jwt-verify`); never trust client-asserted role — the backend derives role solely from the verified `cognito:groups` claim (the frontend role is UX only).
- **Static export:** login/refresh/sign-out are client-side; no SSR/route handlers (constitution).

## 12. Success Criteria

- An admin-created `Staff`/`Admin` user can sign in at `/login`; `useSession()` returns the real role (from `cognito:groups`) and identity; sign-out clears the session.
- `GET /api/v1/auth/me` returns role+identity for a valid token and `401` without one; a `Staff`-guarded probe returns `403` for an under-privileged/anonymous caller — proving end-to-end JWT verification + RBAC.
- Public endpoints remain open and PII-safe; no PII projection change.
- Backend derives role **only** from the verified JWT (never from client input); tokens verified against the pool JWKS (issuer/audience/expiry).
- Static-export build stays green; tokens-only, accessible header/login UX; deploy under `--profile IBD-DEV`.

## 13. Next Step

```text
/sdd-specify changes/auth-wiring
```
> Recommend Option A (in-app SRP via Amplify + `aws-jwt-verify` backend guard). Heads-up: I can relocate this to `auth/wiring` (domain taxonomy, matching `infra/aws-deployment`) before specifying — say the word and the next command becomes `/sdd-specify auth/wiring`.
