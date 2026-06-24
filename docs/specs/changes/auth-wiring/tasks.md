# Tasks — Auth Wiring (Cognito sign-in + JWT/RBAC backbone)

- Spec path: docs/specs/changes/auth-wiring/
- Depth: Full
- Consumed by `/sdd-execute` (Leader → Implementer → Reviewer). Status: `[ ]` not started · `[~]` in progress/halted · `[x]` complete & reviewed PASS.
- Commits: `[SPEC:changes/auth-wiring] <message>`. AWS tasks use `--profile IBD-DEV`. Role is authoritative only from the verified JWT. No PII field/projection change.

## Tasks

- [x] T-1 Backend auth module: JWT verification guard + RBAC + proof endpoints  (deps: none)
      Scope: New `backend/src/auth/`: `auth.config.ts` (env), singleton `jwt-verifier.ts` (`CognitoJwtVerifier`, tokenUse=access), `JwtAuthGuard` (verify iss/aud/use/exp; attach `req.user={sub,username,email,groups,role}`, role from `cognito:groups`, 401 on failure), `@Roles()` + `RolesGuard` (Admin≥Staff, 403), `@CurrentUser()`, `AuthController` (`GET /auth/me`, `GET /auth/protected` @Roles('Staff')), `AuthModule` imported into AppModule. Guards opt-in only — NO global guard. Add `aws-jwt-verify` dep.
      Traces: FR-5, FR-6, FR-7, FR-8, NFR-1 (requirements.md), design.md §3, §4, §6, §8
      Files: backend/src/auth/*, backend/src/app.module.ts, backend/package.json, backend/src/auth/*.spec.ts
      Verify: `cd backend && npm run test -- auth && npm run build`
      Done when: unit tests prove valid token→role mapping (admin/staff/none), invalid/expired/wrong-aud→401, @Roles('Staff') allows Staff+Admin & 403 for Public, `/auth/me` shape, **tokenless `/actors` still 200 + PII-safe**, forged-role-ignored; build passes.

- [x] T-2 Infra: Cognito env + Authorization CORS on the backend stack  (deps: none)
      Scope: `infra/20-backend/template.yaml`: add Lambda env `COGNITO_USER_POOL_ID`/`COGNITO_CLIENT_ID` via `Fn::ImportValue` of `accelerate-tz-dev-data-auth-UserPoolId`/`-UserPoolClientId`; add `Authorization` to `CorsConfiguration.AllowHeaders` (keep `Content-Type`; methods stay GET/OPTIONS). No data-auth change.
      Traces: FR-9, NFR-1, NFR-6 (requirements.md), design.md §3 (CORS), §7
      Files: infra/20-backend/template.yaml
      Verify: `cd infra && AWS_PROFILE=IBD-DEV sam validate --template 20-backend/template.yaml --lint --profile IBD-DEV --region eu-west-1`
      Done when: template validates; env vars resolve from data-auth exports; `Authorization` present in AllowHeaders. (Applied live in T-8.)

- [x] T-3 Frontend Amplify auth client + SessionProvider + real useSession  (deps: none)
      Scope: Add `aws-amplify`. `lib/auth/amplify-config.ts` (configure from `NEXT_PUBLIC_COGNITO_USER_POOL_ID`/`_CLIENT_ID`), `auth-client.ts` (`signIn`, `confirmNewPassword`, `signOut`, `getSession`, `roleFromGroups`), `SessionProvider.tsx` (`'use client'` context: resolve on mount, expose `{session,loading,signIn,signOut}`), replace `useSession.ts` body (read context; **exported `Role`/`Session` types unchanged**), add `useAuth()`. Mount `<SessionProvider>` in `app/layout.tsx`.
      Traces: FR-2, FR-3, NFR-2, NFR-5, NFR-7 (requirements.md), design.md §5
      Files: frontend/package.json, frontend/lib/auth/{amplify-config,auth-client,SessionProvider,useSession,useAuth}.ts(x), frontend/app/layout.tsx, frontend/lib/auth/*.test.ts(x)
      Verify: `cd frontend && npm test -- auth && npm run build`
      Done when: mocked-Amplify tests show role mapping from groups, session resolve/clear, sign-out → Public; `useSession` returns the mapped `Session` with unchanged types; static export build green.

- [ ] T-4 Frontend /login page + LoginForm (incl. new-password challenge)  (deps: T-3)
      Scope: `app/(public)/login/page.tsx` (client) + `components/auth/LoginForm.tsx`: labeled email/password, submit via `auth-client.signIn`, accessible error region (`aria-live`), and the conditional `NEW_PASSWORD_REQUIRED` "set new password" step; tokens-only; reuse `Button`. On success route back to the app.
      Traces: FR-1, NFR-2, NFR-4, NFR-7 (requirements.md), design.md §5
      Files: frontend/app/(public)/login/page.tsx, frontend/components/auth/LoginForm.tsx (+ tests)
      Verify: `cd frontend && npm test -- login LoginForm && npm run build`
      Done when: tests cover success, invalid-credentials error, and the new-password challenge path; `/login` builds static; a11y assertions pass.

- [ ] T-5 Header auth UX + authenticated API transport  (deps: T-3)
      Scope: `components/shell/Header.tsx`: Public → "Staff sign-in" → `/login`; authenticated → name + role chip + "Sign out" (calls `useAuth().signOut`). `lib/api/client.ts`: add `apiGetAuthed<T>` attaching `Authorization: Bearer <accessToken>` and signalling `401`→ caller can route to `/login`; public `apiGet` unchanged.
      Traces: FR-3, FR-4, FR-9, NFR-4, NFR-7 (requirements.md), design.md §5
      Files: frontend/components/shell/Header.tsx, frontend/lib/api/client.ts (+ tests)
      Verify: `cd frontend && npm test -- Header client && npm run build`
      Done when: Header renders sign-in vs user-menu by role and signs out; `apiGetAuthed` attaches bearer and handles 401; public `apiGet` still tokenless; tests pass.

- [ ] T-6 Client route-guard helper (RequireRole)  (deps: T-3)
      Scope: `lib/auth/RequireRole.tsx` — a minimal client guard redirecting `Public` to `/login` (seed for future protected pages; NO protected page ships here). Unit test for redirect vs render.
      Traces: FR-2 (consumes session), NFR-2 (requirements.md), design.md §5
      Files: frontend/lib/auth/RequireRole.tsx (+ test)
      Verify: `cd frontend && npm test -- RequireRole`
      Done when: renders children for an allowed role, redirects Public to `/login`; test passes.

- [ ] T-7 A11y / static-export / security verification pass  (deps: T-1, T-4, T-5, T-6)
      Scope: jest-axe on `/login` + Header auth states (0 violations); confirm `next build` static export green with `/login`; backend security assertions consolidated (tokenless `/actors` 200 + PII-free; forged role ignored; `/auth/me` 401 without token) — extend suites if gaps. No behavior change beyond minimal axe fixes.
      Traces: NFR-1, NFR-2, NFR-3, NFR-4 (requirements.md), design.md §10
      Files: frontend/components/auth/*a11y*.test.tsx (or extend), backend/src/auth/*.spec.ts (if gaps)
      Verify: `cd frontend && npm run build && npm test` and `cd backend && npm run test`
      Done when: axe clean on auth surfaces; static export green; backend security suite green incl. the public-stays-open + forged-role tests.

- [ ] T-8 Deploy (backend env+CORS, frontend) + admin-create test user + live verification  (deps: T-2, T-7)
      Scope: Redeploy backend (built template — Cognito env + `Authorization` CORS); rebuild+deploy frontend with `NEXT_PUBLIC_COGNITO_*` baked in; `admin-create-user` + `admin-add-user-to-group` a test Staff (and Admin) user; live-verify sign-in, `GET /auth/me`→role, no-token→401, Public-token→403 on probe, `/actors` still open + PII-free, CORS preflight passes with `Authorization`. All `--profile IBD-DEV`, eu-west-1.
      Traces: FR-1, FR-5, FR-6, FR-7, FR-8, FR-9, NFR-6 (requirements.md), design.md §7, §10
      Files: (no source change) infra/scripts/*, AWS CLI (cognito-idp admin-create-user)
      Verify: live: `curl` `/auth/me` with/without token; `aws cognito-idp admin-get-user --profile IBD-DEV`; `/actors` tokenless 200
      Done when: a Staff user can sign in on CloudFront; `/auth/me` returns the role for a valid token and 401 without; the Staff probe 403s for an under-privileged caller; public endpoints remain open + PII-free over the wire.

## Dependency Graph

```
T-1 ─────────────┐
T-2 ─────────────┼──────────── T-8
T-3 ─┬─ T-4 ─────┤
     ├─ T-5 ─────┤
     └─ T-6 ─────┴─ T-7 ───────┘
```

Eligible when status is `[ ]`/`[~]` and every dep is `[x]`. T-1, T-2, T-3 are independent and immediately eligible (backend / infra / frontend).

## Testing & Verification Expectations

- Backend: `npm run test -- auth` / `npm run build`. Frontend: `npm test` (Jest/RTL) / `npm run build` (static export). Infra: `sam validate --lint` with `--profile IBD-DEV`.
- Security gates (must hold before T-8): tokenless public endpoints stay 200 + PII-free; role only from verified JWT; no global guard.

## Execution Conventions

- Commits: `[SPEC:changes/auth-wiring] <message>`; audit trail in `execution.md`.
- No new PII field; no change to the public PII-safe projection (FR-8/NFR-3) — a release gate.
- AWS tasks keep `--profile IBD-DEV`.
