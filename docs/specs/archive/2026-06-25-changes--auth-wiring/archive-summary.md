# Archive Summary — Auth Wiring (Cognito sign-in + JWT/RBAC backbone)

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/changes/auth-wiring/` |
| Archive path | `docs/specs/archive/2026-06-25-changes--auth-wiring/` |
| Archive date | 2026-06-25 |
| Final status | **Complete — validated PASS (2 accepted WARNs), deployed + live-verified** |
| Depth | Full |
| Branch | `feature/auth-wiring` |

## 2. Original Spec Path

`docs/specs/changes/auth-wiring/` — proposal, requirements, design, tasks, execution, validation-report, this summary.

## 3. Archive Date

2026-06-25.

## 4. Final Status

All 8 tasks `[x]` (T-1..T-7 Reviewer PASS, T-8 Leader-run live verification). The dormant Cognito layer is now a working auth backbone — deployed and verified live. Two pre-existing WARNs accepted with follow-ups; no FAIL.

## 5. Requirements Delivered

- **FR-1** Staff/Admin sign-in at `/login` incl. `NEW_PASSWORD_REQUIRED` first-login.
- **FR-2** Real `useSession()` — role from verified `cognito:groups` (stub types preserved).
- **FR-3** Sign-out. **FR-4** Header auth UX (sign-in link / user menu + role + sign-out).
- **FR-5** Backend JWT verification (iss/aud/use/exp via pool JWKS, `aws-jwt-verify`).
- **FR-6** RBAC `@Roles()` + RolesGuard (Admin≥Staff); role only from the verified claim.
- **FR-7** Proof endpoints `GET /auth/me` + Staff-guarded probe.
- **FR-8** Public endpoints stay open + PII-safe (no global guard).
- **FR-9** `Authorization: Bearer` transport (`apiGetAuthed`) + CORS allow-header (preflight-status WARN, §9).
- **NFR-1..7** verified-claim-only role, static export, PII boundary unchanged, tokens+a11y (axe 0), token posture, IBD-DEV, resilience.

## 6. Files Changed Summary (from execution.md)

- **Backend** `src/auth/`: auth.config, jwt-verifier, auth.types, jwt-auth.guard, roles.decorator, roles.guard, current-user.decorator, auth.controller, auth.module (+ specs); `app.module.ts` imports AuthModule; `+aws-jwt-verify`.
- **Frontend** `lib/auth/`: amplify-config, auth-client, SessionProvider, useSession (replaced — types unchanged), useAuth, RequireRole (+ tests); `app/(public)/login/page.tsx`; `components/auth/LoginForm.tsx` + `auth-a11y.test.tsx`; `components/shell/Header.tsx` (+test); `lib/api/client.ts` (`apiGetAuthed`/`AuthFailureError`, +test); `app/layout.tsx` mounts SessionProvider; `+aws-amplify`.
- **Infra** `20-backend/template.yaml`: Cognito env (ImportValue) + `Authorization` CORS. `infra/scripts/deploy-frontend.sh`: resolve+bake `NEXT_PUBLIC_COGNITO_*` from the data-auth stack.
- Commits: `b948878` (T-1) · `0a41406` (T-2) · `38dbb36` (T-3) · `7e80d77` (T-4) · `292f7b5` (T-5) · `b2f2f1e` (T-6) · `5fbf4de` (T-7) · T-8 deploy/audit · `3ff59f2` validation.

## 7. Test Evidence Summary

- Backend **129/129** (18 suites); frontend **279/279** (28 suites, incl. jest-axe auth a11y, 0 violations); static export green (`/login` ○); infra template valid; deploy script `bash -n`+shellcheck clean.
- **Live (IBD-DEV):** `/auth/me` 401(no token)/200(Staff, role=Staff); `/auth/protected` 200(Staff)/403(no-group); `/actors`+`/metrics` 200 tokenless; 0 phone/0 email over the wire; `/login` 200 with Cognito IDs baked into the bundle.

## 8. Validation Summary

`validation-report.md` — **PASS**, archive-ready. Every FR/NFR covered with test and/or live evidence; security boundaries (verified-claim-only role, opt-in guards, public-open + PII-safe) confirmed live; design + proposal (Option A) conformance upheld.

## 9. Accepted Warnings Or Follow-Ups

- **WARN-1 (CORS preflight):** HTTP API OPTIONS preflight returns **404** (correct CORS headers, wrong status) — `ANY /{proxy+}` shadows API Gateway auto-CORS; **identical on the pre-existing `/actors` path** (prior infra spec), not introduced here. Blocks only browser *authed cross-origin* calls — none in Phase-1 UI. **Follow-up:** make OPTIONS return 2xx (NestJS `app.enableCors` with the gateway `CorsConfiguration` removed to avoid duplicate `Access-Control-Allow-Origin`, or explicit-method routes) — slot with Phase-2 `admin/data-validation` (first browser authed calls).
- **WARN-2 (backend lint):** ESLint v9 has no config in `backend/` (lint exits 2) — pre-existing, repo-wide. **Follow-up chore:** add `backend/eslint.config.mjs`.
- **Deferred by design (Phase 2):** role+consent **PII unlock** read projection (OQ-2) → `admin/data-validation`; the admin console, write/CRUD, consent-request/approve-publish workflow.

## 10. Historical Notes

- Approach Option A (Amplify in-app SRP + `aws-jwt-verify`) — uses the SPA client exactly as provisioned (SRP/`USER_PASSWORD`, no Hosted UI), zero Cognito resource change; only two Lambda env vars + an `Authorization` CORS header.
- **Opt-in guards, never a global guard** — enforced by `no-global-guard.spec.ts` and confirmed live so the public API can never be silently locked.
- **Role only from the verified `cognito:groups`** — forged client roles ignored (unit-tested); the frontend role is UX-only.
- Open questions resolved: OQ-1 token storage = Amplify-managed (dev-accepted, documented); OQ-3 first-login `NEW_PASSWORD_REQUIRED` handled in `/login`; OQ-2 PII unlock deferred to Phase 2.
- Operational deviation: `deploy-frontend.sh` enhanced to bake the Cognito env (beyond T-8's "no source change" note) — a justified durability fix so future deploys can't omit auth config.
- Execution ran the full Leader→Implementer→Reviewer triad; every reviewed task passed on the first attempt (no rework loops, no HALTs). Mid-run, a transient `" 2"` file-sync artifact (incl. duplicate dirs) and a benign T-4/T-6 concurrent-edit overlap occurred; both were handled (swept / coherence-confirmed) before commits. Test users `staff-demo@` / `viewer-demo@accelerate-tz.dev` created in the dev pool for live verification (throwaway).
