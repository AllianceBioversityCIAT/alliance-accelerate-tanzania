# Validation Report — Auth Wiring (Cognito sign-in + JWT/RBAC backbone)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/changes/auth-wiring/` |
| Validated | 2026-06-25 |
| Validator | Leader (JCSPECS `/sdd-validate`) |
| Branch | `feature/auth-wiring` |
| Depth | Full |
| Overall result | **PASS** (2 accepted WARNs, both with follow-ups; no FAIL) |
| Archive readiness | **Ready** — `/sdd-archive changes/auth-wiring` |

## 2. Summary

All 8 tasks are `[x]` with execution-audit entries and independent Reviewer PASS verdicts (T-1..T-7); T-8 was Leader-run with live end-to-end verification. The dormant Cognito layer is now a working auth loop: Staff/Admin sign-in, a real role-bearing session (replacing the stub), backend JWT verification + RBAC, and proof endpoints — **verified live** against the deployed stack (sign-in, `/auth/me` 401/200, `/auth/protected` 200/403, public endpoints still open + PII-safe over the wire). Security holds: role is derived only from the verified `cognito:groups` claim, guards are opt-in (no global guard), and the public PII boundary is unchanged. Two WARNs — the **CORS OPTIONS preflight returns 404** (pre-existing HTTP API behavior, not introduced here; affects only browser authed cross-origin calls, none shipped in Phase 1) and the **pre-existing backend ESLint no-config** — are accepted with follow-ups. No FAIL.

## 3. Task Completion

| Task | Status | Evidence | Result |
|---|---|---|---|
| T-1 backend JWT guard + RBAC + proof endpoints | [x] | rev-a1 PASS; auth 20/20, actors 35/35, build clean | PASS |
| T-2 infra Cognito env + Authorization CORS | [x] | rev-a2 PASS; `sam validate --lint` valid | PASS |
| T-3 frontend Amplify client + SessionProvider + useSession | [x] | rev-a3 PASS; auth 15/15, full 226/226, static build green | PASS |
| T-4 /login + LoginForm (new-password challenge) | [x] | rev-a4 PASS (coherence `tsc` clean); 7/7, /login static | PASS |
| T-5 header auth UX + apiGetAuthed | [x] | rev-a5 PASS; 27/27; public `apiGet` tokenless | PASS |
| T-6 RequireRole client guard | [x] | rev-a6 PASS; 7/7 | PASS |
| T-7 a11y/static-export/security verification | [x] | rev-a7 PASS; FE 279/279, BE 129/129, axe 0 | PASS |
| T-8 deploy + admin-create user + live verify | [x] | live: 401/200/200/403 + public-open + 0 PII; (CORS preflight WARN) | PASS-with-WARN |

All completed tasks carry execution notes + verification evidence in `execution.md`. **Result: PASS.**

## 4. File Existence

All design §4/§5 files present. Backend `src/auth/`: auth.config, jwt-verifier, auth.types, jwt-auth.guard, roles.decorator, roles.guard, current-user.decorator, auth.controller, auth.module (+ specs); `app.module.ts` imports AuthModule. Frontend `lib/auth/`: amplify-config, auth-client, SessionProvider, useSession (replaced), useAuth, RequireRole (+ tests); `app/(public)/login/page.tsx`; `components/auth/LoginForm.tsx` + `auth-a11y.test.tsx`; `components/shell/Header.tsx` + test; `lib/api/client.ts` (`apiGetAuthed`) + test; `app/layout.tsx` mounts SessionProvider. Infra: `20-backend/template.yaml` (Cognito env + Authorization CORS); `infra/scripts/deploy-frontend.sh` (bakes `NEXT_PUBLIC_COGNITO_*`). **Result: PASS.**

## 5. Build Integrity

| Check | Command | Result |
|---|---|---|
| Backend build | `cd backend && npm run build` | **PASS** (nest build clean) |
| Backend tests | `npm run test` | **PASS** 129/129 (18 suites) |
| Backend lint | `npm run lint` | **WARN** — exit 2: ESLint v9 finds no config in `backend/` (pre-existing, repo-wide; not introduced by this spec). |
| Frontend build (static export) | `npm run build` | **PASS** — all routes static incl. `/login` (○) |
| Frontend tests | `npm test` | **PASS** 279/279 (28 suites, incl. jest-axe auth a11y) |
| Frontend lint | `npm run lint` | **PASS** — no warnings/errors |
| Infra template | `sam validate --lint` (IBD-DEV) | **PASS** — valid SAM Template |
| Deploy script | `bash -n` + `shellcheck -S error` | **PASS** |

**Result: PASS** (backend lint WARN pre-existing — see Remediation).

## 6. Requirement Coverage

| Req | Covered by | Evidence | Result |
|---|---|---|---|
| FR-1 Staff/Admin sign-in (+ new-password) | T-4, T-8 | LoginForm challenge path tested; live Staff sign-in via Cognito | PASS |
| FR-2 real session / role from groups | T-3, T-6 | roleFromGroups + getSession tests; live `/auth/me` role=Staff | PASS |
| FR-3 sign-out | T-3, T-5 | provider sign-out→Public test; header sign-out | PASS |
| FR-4 header auth UX | T-5 | Header tests (sign-in vs user menu) | PASS |
| FR-5 JWT verification | T-1, T-8 | guard unit tests (401 paths); live 401 no-token, 200 valid | PASS |
| FR-6 RBAC (Admin≥Staff) | T-1, T-8 | RolesGuard tests; live 200 Staff / 403 no-group | PASS |
| FR-7 proof endpoints | T-1, T-8 | `/auth/me` + `/auth/protected` tests; live verified | PASS |
| FR-8 public stays open + PII-safe | T-1, T-7, T-8 | no-global-guard.spec; live `/actors`+`/metrics` 200, 0 PII over wire | PASS |
| FR-9 authed transport + CORS | T-2, T-5, T-8 | apiGetAuthed Bearer + AuthFailureError tests; allow-headers include `authorization` (config done). **Preflight status 404 — WARN** | WARN |
| NFR-1 security (role only from claim) | T-1, T-7 | forged-role-ignored test; live | PASS |
| NFR-2 static export | T-3..T-7 | `next build` all routes static | PASS |
| NFR-3 PII boundary unchanged | T-1, T-7, T-8 | no projection change; 0 PII live | PASS |
| NFR-4 tokens + a11y | T-4, T-5, T-7 | jest-axe 0 violations; tokens-only | PASS |
| NFR-5 token posture | T-3 | Amplify-managed, documented (OQ-1 dev-accepted) | PASS |
| NFR-6 IBD-DEV deploy | T-2, T-8 | all AWS via `--profile IBD-DEV` | PASS |
| NFR-7 resilience | T-3, T-5 | null/error states; `AuthFailureError` | PASS |

**Result: PASS** (FR-9 transport+config satisfied; preflight-status WARN, §10).

## 7. Linting & Code Quality

- Frontend lint clean; reviewers confirmed tokens-only, static-export boundaries, no PII, resilient error handling.
- Backend build + 129 tests clean; security architecture verified (verified-claim-only role, opt-in guards, JWKS-caching singleton verifier). Backend lint tooling non-functional repo-wide (WARN, §5).

## 8. Design Conformance

Implementation matches design.md §1–§10. Tracked decisions/deviations:
- **Option A (Amplify in-app SRP + aws-jwt-verify)** delivered as specified; no Cognito resource change (ADR §8).
- **Opt-in guards, no global guard** — verified by `no-global-guard.spec.ts` + live public-open checks (ADR §8 / FR-8).
- **deploy-frontend.sh enhancement** (resolve+bake `NEXT_PUBLIC_COGNITO_*`) — an additive, justified operational change beyond the task's "no source change" note; documented in `execution.md` (prevents future deploys silently omitting auth config). Accepted.
- **Open questions:** OQ-2 PII-unlock deferred to `admin/data-validation` (honored); OQ-3 first-login `NEW_PASSWORD_REQUIRED` handled in `/login`; OQ-1 token storage = Amplify-managed (dev-accepted, documented). Proposal Option A intent/scope/non-goals upheld.

**Result: PASS.**

## 9. Test Evidence Summary

- Backend: **129/129** (18 suites) — JWT verify/role-mapping/401, RolesGuard Admin≥Staff/403, `/auth/me` shape + 401, no-global-guard, forged-role-ignored, PII boundary.
- Frontend: **279/279** (28 suites) — auth-client/session/useSession, LoginForm (incl. challenge), Header auth states, apiGetAuthed/AuthFailureError + tokenless apiGet, RequireRole, jest-axe auth a11y (0 violations).
- Static export green (incl. `/login` ○); infra template valid.
- **Live (IBD-DEV):** `/auth/me` 401(no token)/200(Staff, role=Staff); `/auth/protected` 200(Staff)/403(no-group); `/actors`+`/metrics` 200 tokenless; 0 phone/0 email over the wire; `/login` 200 with Cognito IDs baked into the bundle.

## 10. Remediation

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | HTTP API OPTIONS **preflight returns 404** (correct CORS headers, wrong status) — `ANY /{proxy+}` shadows API Gateway auto-CORS; identical on the pre-existing `/actors` path. Blocks only browser *authed cross-origin* calls (none in Phase-1 UI). | WARN (pre-existing; partial FR-9 live miss) | Follow-up task: make OPTIONS return 2xx — NestJS `app.enableCors(...)` with the gateway `CorsConfiguration` **removed** (avoid duplicate `Access-Control-Allow-Origin`), or explicit-method routes. Slot with Phase-2 `admin/data-validation` (first browser authed calls). |
| 2 | Backend ESLint v9 has no config file (`backend/` lint exits 2). | WARN (pre-existing, repo-wide; not introduced here) | Follow-up chore: add `backend/eslint.config.mjs` (flat config). Backend quality currently evidenced by `nest build` + 129 Jest tests. |

No FAIL findings. Both WARNs accepted with follow-ups.

## 11. Archive Readiness Recommendation

**READY TO ARCHIVE.** All 8 tasks `[x]` with Reviewer PASS (T-1..T-7) + live verification (T-8); every FR/NFR covered with test and/or live evidence; security boundaries (verified-claim-only role, opt-in guards, public-open + PII-safe) confirmed live; design + proposal conformance upheld; the two WARNs are pre-existing and carry explicit Phase-2/chore follow-ups.

```text
/sdd-archive changes/auth-wiring
```
