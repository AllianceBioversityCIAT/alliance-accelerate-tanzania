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

## Notes
- The recurring `" 2"` sync-duplicate artifacts (incl. duplicate dirs under `backend/src/`) reappeared during this run; swept before commits, never staged.
