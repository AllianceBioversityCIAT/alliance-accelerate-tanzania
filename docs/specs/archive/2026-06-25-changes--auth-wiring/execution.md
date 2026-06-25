# Execution Log — Auth Wiring (Cognito sign-in + JWT/RBAC backbone)

- Spec path: docs/specs/changes/auth-wiring/
- Orchestration: JCSPECS Leader → Implementer → Reviewer triad (`/sdd-execute`).
- Branch: feature/auth-wiring (cut off main).

## Task Execution History

### T-1 — Backend auth module: JWT verification guard + RBAC + proof endpoints — PASS (attempt 1)
- Date: 2026-06-24 · Implementer: impl-a1
- Files: `backend/src/auth/{auth.config,jwt-verifier,auth.types,jwt-auth.guard,roles.decorator,roles.guard,current-user.decorator,auth.controller,auth.module}.ts` + 5 spec files; `app.module.ts` (import AuthModule); `package.json` (+`aws-jwt-verify@^5.2.1`).
- Verification: `npm run test -- auth` → **20/20**; `npm run test -- actors` → **35/35** (public path untouched); `nest build` clean. Leader re-verified identical.
- Reviewer (rev-a1) **PASS**: JWT verified via aws-jwt-verify (tokenUse=access, clientId audience, pool issuer, JWKS-caching singleton, lazy so public-only runs never construct it); role only from verified `cognito:groups` (forged-role-ignored test); Admin≥Staff; **no `APP_GUARD`** + `no-global-guard.spec.ts` asserts ActorsController has no guards → public stays open + PII-safe; `/auth/me` returns caller's own identity, `/auth/protected` @Roles('Staff').
- Requirements: FR-5, FR-6, FR-7, FR-8, NFR-1. Final: PASS.

### T-2 — Infra: Cognito env + Authorization CORS — PASS (attempt 1)
- Date: 2026-06-24 · Implementer: impl-a2
- Files: `infra/20-backend/template.yaml` (+8/-0): `COGNITO_USER_POOL_ID`/`COGNITO_CLIENT_ID` via `!ImportValue Fn::Sub "${DataAuthStackName}-UserPoolId"/"-UserPoolClientId"`; `Authorization` added to HttpApi `AllowHeaders` (Content-Type kept).
- Verification: `sam validate --template 20-backend/template.yaml --lint --profile IBD-DEV --region eu-west-1` → valid SAM Template.
- Reviewer (rev-a2) **PASS**: exact export-name match + existing DB_* ImportValue style; AllowMethods (GET/OPTIONS) + AllowOrigins unchanged; no data-auth/DB/IAM change; ASCII-clean.
- Requirements: FR-9, NFR-1, NFR-6. Final: PASS. (Applied live in T-8.)

### T-3 — Frontend Amplify auth client + SessionProvider + real useSession — PASS (attempt 1)
- Date: 2026-06-24 · Implementer: impl-a3
- Files: `frontend/lib/auth/{amplify-config,auth-client,SessionProvider,useAuth}.ts(x)` (new), `useSession.ts` (stub body replaced — types unchanged), `auth.test.tsx` (15); `app/layout.tsx` (mount SessionProvider); `package.json` (+`aws-amplify@^6.18.0`).
- Verification: `npm test -- auth` → **15/15**; full suite **226/226**; `npm run build` static export green (all 7 routes ○). Leader re-verified identical.
- Reviewer (rev-a3) **PASS**: `useSession` type contract byte-identical to the stub (Public default outside provider, no prerender crash); roleFromGroups + getSession correct (role from ID-token `cognito:groups`, null unauth); SessionProvider `'use client'`, sign-out→Public; configureAmplify guards missing env without throwing; no SSR/route handlers; no secrets/PII.
- Requirements: FR-2, FR-3, NFR-2, NFR-5, NFR-7. Final: PASS.

### T-4 — Frontend /login page + LoginForm (incl. new-password challenge) — PASS (attempt 1)
- Date: 2026-06-24 · Implementer: impl-a4
- Files: `frontend/app/(public)/login/page.tsx` (`'use client'`, `<Suspense>` over the `useSearchParams` form), `frontend/components/auth/LoginForm.tsx` (labeled email/password → T-3 `signIn`; conditional `new_password_required` step → `confirmNewPassword`; `role="alert"`/`aria-live` error region; success honors `?redirect`), `LoginForm.test.tsx` (7).
- Verification: `npm test -- LoginForm` → **7/7**; `npm run build` → `/login` static (○). Leader full suite 267/267.
- Reviewer (rev-a4) **PASS**: static-export safe, tokens-only + a11y, NEW_PASSWORD_REQUIRED path covered; **coherence confirmed** — `tsc --noEmit` clean, no half-merged code from the concurrent T-6 edit (`result.message` only on the error branch).
- Requirements: FR-1, NFR-2, NFR-4, NFR-7. Final: PASS.

### T-5 — Header auth UX + authenticated API transport — PASS (attempt 1)
- Date: 2026-06-24 · Implementer: impl-a5
- Files: `frontend/components/shell/Header.tsx` (Public→"Staff sign-in"; authed→name+role chip+sign-out via `useAuth().signOut()`; existing nav/mobile preserved), `Header.test.tsx` (new), `frontend/lib/api/client.ts` (+`apiGetAuthed` + typed `AuthFailureError`; `apiGet` unchanged), `client.test.ts` (new).
- Verification: Header+client targeted **27/27**; full suite 267/267; build green.
- Reviewer (rev-a5) **PASS**: **public `apiGet` byte-unchanged + a tokenless-header test (FR-8)**; `apiGetAuthed` attaches Bearer, 401→`AuthFailureError`, other→Error; header UX + accessible sign-out; static export preserved; tokens-only.
- Requirements: FR-3, FR-4, FR-8, FR-9, NFR-4, NFR-7. Final: PASS.

### T-6 — Client route-guard helper (RequireRole) — PASS (attempt 1)
- Date: 2026-06-24 · Implementer: impl-a6
- Files: `frontend/lib/auth/RequireRole.tsx` (`'use client'`; `{allow,children,redirectTo='/login'}`; loading→render null + no redirect; resolved→children if role∈allow with Admin≥Staff, else `router.replace`), `RequireRole.test.tsx` (7).
- Verification: `npm test -- RequireRole` → **7/7**; full suite 267/267; build green.
- Reviewer (rev-a6) **PASS**: self-contained, Admin satisfies `allow:['Staff']`, no premature redirect (NFR-7), no SSR/protected page; scope clean (imports only session/Role/router).
- Requirements: FR-2, NFR-2. Final: PASS.
- Note: impl-a6 also fixed two pre-existing build blockers in T-4's files during its run (Suspense wrap + a type narrowing); a4's later final write superseded them — net tree coherent (rev-a4 confirmed).

### T-7 — A11y / static-export / security verification pass — PASS (attempt 1)
- Date: 2026-06-25 · Implementer: impl-a7
- Files: `frontend/components/auth/auth-a11y.test.tsx` (new, 12 — jest-axe over LoginForm credentials + new-password steps and Header Public + authenticated states; labeled-control / aria-live / accessible-sign-out assertions), `backend/src/auth/auth.controller.spec.ts` (+1 — `/auth/me` → 401 tokenless). No component/source fixes needed (axe 0 violations as-is).
- Verification: frontend `npm test` → **279/279** (28 suites) + `npm run build` `/login` static (○); backend `npm run test` → **129/129** (18 suites). Leader re-verified identical.
- Reviewer (rev-a7) **PASS**: a11y tests genuine (real `toHaveNoViolations` on rendered DOM, assertions match source); the `/auth/me` 401 test is meaningful; no behavior change; the three security assertions collectively covered — (a) tokenless `/actors` open + PII-safe (`no-global-guard.spec.ts` + `pii-boundary.spec.ts`), (b) forged-role-ignored (`jwt-auth.guard.spec.ts`), (c) `/auth/me` 401 (new). `act` warnings benign.
- Requirements: NFR-1, NFR-2, NFR-3, NFR-4 (verifying FR-1..FR-9 surfaces). Final: PASS.

### T-8 — Deploy + admin-create test user + live verification — PASS-with-WARN (Leader-run)
- Date: 2026-06-25 · Run by: Leader (operator deploy; live verification IS the gate).
- **Deploy-script fix (Leader, operational):** `infra/scripts/deploy-frontend.sh` now resolves `UserPoolId`/`UserPoolClientId` from the data-auth stack and bakes `NEXT_PUBLIC_COGNITO_USER_POOL_ID`/`NEXT_PUBLIC_COGNITO_CLIENT_ID` into the static build (alongside the existing `NEXT_PUBLIC_API_BASE_URL`), so future frontend deploys can't silently omit the auth config. `bash -n` + `shellcheck -S error` clean.
- **Backend** (`accelerate-tz-dev-backend`): `sam build` (206 MB; `dist/auth/` present) → deploy built template (Cognito env + `Authorization` CORS), preserving `AllowedOrigin` CORS lock. Stack **UPDATE_COMPLETE**.
- **Frontend**: `deploy-frontend.sh` baked CognitoPool `eu-west-1_eKINGUN3I` / Client `7thfloas9toth9jh6l1fvskev7` (verified inlined in `out/_next/static/.../layout-*.js`); S3 sync + CloudFront invalidation. `/login` 200 live.
- **Test users** (admin-create, permanent password, pool `eu-west-1_eKINGUN3I`): `staff-demo@accelerate-tz.dev` (in `staff` group), `viewer-demo@accelerate-tz.dev` (no group).
- **Live verification:** `/auth/me` no-token → **401**; Staff token → **200** `role:Staff groups:[staff]`; `/auth/protected` Staff → **200**, no-group → **403** (their `/auth/me` role=Public); `/actors` + `/metrics` tokenless → **200/200** (public open); **0 phone / 0 email** over the wire; CORS allow-headers include `authorization`.
- **WARN (accepted, pre-existing — not introduced here):** the HTTP API OPTIONS preflight returns **404** (with correct CORS headers) because the `ANY /{proxy+}` route shadows API Gateway's auto-CORS and forwards OPTIONS to NestJS (no OPTIONS handler). **Identical behavior on the already-live `/actors` path** (prior infra spec). Impact: a browser *authed cross-origin* fetch (Authorization → triggers preflight) would be blocked — but Phase-1 shipped UI makes NO such call (role from Amplify client-side; `apiGetAuthed` unused until Phase 2). Partial miss of FR-9's "not blocked by preflight" live criterion. **Follow-up:** dedicated task to make OPTIONS preflight return 2xx — NestJS `app.enableCors(...)` with the gateway `CorsConfiguration` removed to avoid duplicate `Access-Control-Allow-Origin` headers (or explicit-method routes) — slot with the Phase-2 `admin/data-validation` spec (which will make browser authed calls).
- Requirements: FR-1, FR-5, FR-6, FR-7, FR-8, NFR-6 fully verified; FR-9 config done, preflight-status WARN. Final: PASS-with-WARN.

## Notes
- The recurring `" 2"` sync-duplicate artifacts (incl. duplicate dirs under `backend/src/`) reappeared during this run; swept before commits, never staged.
