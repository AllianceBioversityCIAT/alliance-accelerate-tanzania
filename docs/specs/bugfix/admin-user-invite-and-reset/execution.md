# Execution Log — Admin User Invite Email Delivery & Reset-Password Error

- Spec path: docs/specs/bugfix/admin-user-invite-and-reset/
- Branch: `spec/admin-user-invite-and-reset`
- Leader: JCSPECS Leader (orchestrator). Loop: Implementer → Reviewer, max 3 attempts/task.
- Started: 2026-07-16

## Task Execution History

### T-1 Status-aware `resetPassword` in the users service — ✅ PASS (attempt 1/3) — 2026-07-16
- **Requirements covered:** FR-4. Design: §4.1.
- **Attempt 1 — Implementer:**
  - Files changed: `backend/src/users/users.service.ts`, `backend/src/users/users.service.spec.ts`, `backend/src/users/users.controller.ts` (compile-only stopgap).
  - Change: `resetPassword(id)` now reads `UserStatus` via `AdminGetUser` (route-param id), branches `FORCE_CHANGE_PASSWORD → AdminCreateUser MessageAction:'RESEND' (Username=id, EMAIL) → {action:'REINVITE'}` else `AdminResetUserPassword → {action:'RESET'}`; new exported `ResetPasswordResult` type; try/catch → `mapCognitoError` preserved. Controller minimally adapted to `async … { await … }` to keep `Promise<void>`/204 and a green build (real 200 `{action}` contract deferred to T-3).
  - Verification: `cd backend && npm test -- users.service && npm run build` → 14 tests passed; `nest build` clean.
- **Attempt 1 — Reviewer verdict:** STATUS: PASS. Branching + return shape match §4.1; RESEND uses `Username=id` (not email alias); error funnel + NFR-1 preserved; both branches unit-tested incl. `Username===id`; controller stopgap acceptable (preserves 204, defers to T-3).
- **Decisions:** Accepted the compile-only controller stopgap as an unavoidable consequence of the service return-type change; the client-facing contract change is owned by T-3 (its dependency edge T-1→T-3 covers this).
- **Final verification:** PASS — `npm test -- users.service` 14/14; `npm run build` clean.
- **Commit:** `[SPEC:bugfix/admin-user-invite-and-reset] T-1 status-aware resetPassword (REINVITE vs RESET)`

### T-2 Narrow the Cognito user-state error mapping — ✅ PASS (attempt 1/3) — 2026-07-16
- **Requirements covered:** FR-5. Design: §4.2.
- **Attempt 1 — Implementer:**
  - Files: `backend/src/users/cognito-error.mapper.ts`; new `backend/src/users/cognito-error.mapper.spec.ts` (no dedicated mapper spec existed before).
  - Change: `UnsupportedUserStateException → ConflictException (409)`; `NotAuthorizedException → 409` only when `isUserStateNotAuthorized(err)` (message matches `/state/i`), else falls through to the generic 500. Switch restructured so non-state NotAuthorized + default `break` to a single trailing `InternalServerErrorException`; all prior cases still throw in-body. Added safe `errorMessage(err)` helper mirroring `errorName`.
  - Verification: `npm test -- cognito-error && npm run build` → 6/6 mapper tests pass; build clean.
- **Attempt 1 — Reviewer verdict:** STATUS: PASS. Discrimination correct + conservative (unknown → 500); no existing case accidentally falls through to 500; NFR-4 upheld (raw message read only for the regex predicate, never thrown); tests cover all three new paths + spot-checks.
- **Final verification:** PASS — 6/6, build clean.
- **Commit:** `[SPEC:bugfix/admin-user-invite-and-reset] T-2 narrow Cognito user-state error mapping (409 vs 500)`

### T-6 Cognito email config: templates, SES identity, gate params, policy file — ✅ PASS (attempt 1/3) — 2026-07-16
- **Requirements covered:** FR-1, FR-2, FR-3, NFR-6. Design: §7.1, §8.
- **Attempt 1 — Implementer:**
  - Files: `infra/10-data-auth/template.yaml` (+138 lines, additive); new `infra/10-data-auth/ses-cognito-send-policy.json`.
  - Change: added params `SenderEmail`/`EnableSesSending`/`PortalUrl`; conditions `HasSender`/`UseSes`; `SesSenderIdentity` (`AWS::SES::EmailIdentity`, Condition HasSender); `UserPool.EmailConfiguration` via `!If [UseSes, DEVELOPER…, AWS::NoValue]`; branded English `InviteMessageTemplate` ({username}+{####}, CTA `${PortalUrl}/login`) and `VerificationMessageTemplate` (CONFIRM_WITH_CODE, {####}, "code" copy). Policy JSON authorizes `email.cognito-idp.amazonaws.com` with SourceAccount+SourceArn placeholders. No existing UserPool prop removed; no replacement.
  - Verification: `AWS_PROFILE=IBD-DEV ./infra/scripts/validate.sh` → all three stacks valid; `python3 -m json.tool` on policy → valid.
- **Attempt 1 — Reviewer verdict:** STATUS: PASS. Both placeholders present; `!Sub` only substitutes `${PortalUrl}` (no stray `${` to escape); EmailConfiguration correctly UseSes-gated; identity gated on HasSender (Phase A); additive-only; profile IBD-DEV / region eu-west-1 preserved; inline email hex acceptable (email-HTML exception).
- **Final verification:** PASS — validate.sh all valid.
- **Commit:** `[SPEC:bugfix/admin-user-invite-and-reset] T-6 Cognito SES email config + branded templates + send-policy`

### T-3 Reset endpoint returns 200 { action } + fix breaking backend e2e — ✅ PASS (attempt 1/3) — 2026-07-16
- **Requirements covered:** FR-4, FR-6. Design: §3, §4.3, §4.4.
- **Attempt 1 — Implementer:**
  - Files: `backend/src/users/users.controller.ts`, `backend/src/users/users.e2e.spec.ts`.
  - Change: reset route now `@HttpCode(200)` (explicit — a bare @Post defaults to 201) returning `Promise<ResetPasswordResult>` = `this.usersService.resetPassword(id)`; removed the compile-only 204/void stopgap from T-1. Added a `POST :id/password` e2e describe block: 401/403(Staff)/403(Public)/200 `{action:'RESET'}` + a `mockResolvedValueOnce` 200 `{action:'REINVITE'}` case.
  - Discovery: the spec's "~line 195/199 reset 204" reference (from the judgment-day judge) was imprecise — that assertion is the DELETE test (`.delete(...)` → `remove`), which legitimately stays 204. There was no pre-existing reset HTTP test; the Implementer added proper 200 coverage instead of editing DELETE. lambda-handler.e2e left green (adding a reset case there was disproportionate per design §4.4 escape clause).
  - Verification: `npm test -- users && npm run build && npm run lint` → 368 tests / 34 suites pass; build clean; lint 0 errors.
- **Attempt 1 — Reviewer verdict:** STATUS: PASS. `@HttpCode(200)` explicit, guards intact, no secret in body; reset e2e asserts 200 + both action values; the line-199 204 is correctly the DELETE test (not flagged); only in-scope files changed.
- **Final verification:** PASS — 368/368.
- **Commit:** `[SPEC:bugfix/admin-user-invite-and-reset] T-3 reset endpoint 200 {action} + e2e coverage`

### T-7 Infra runbook: two-phase SES enablement + authorization + sandbox — ✅ PASS (attempt 2/3) — 2026-07-16
- **Requirements covered:** FR-1, DEP-1, DEP-2, NFR-6. Design: §7.2, §7.3, §11.
- **Attempt 1 — Implementer:** Added `## 6. Email (SES) setup — two-phase Cognito → SES enablement` to `infra/README.md` (Phase A deploy+verify+`put-identity-policy`, Phase B `EnableSesSending=true`, sandbox caveat, reversibility, §11 code-entry limitation). Renumbered subsequent sections (Outputs 6→7, Cost 7→8, Teardown 8→9, Hardening 9→10). All six aws/sam commands carry `--profile IBD-DEV`.
  - **Reviewer verdict: STATUS: FAIL** — checks 1–5 PASS, but Check 6 caught one stale cross-reference: `infra/README.md:437` still said "easy teardown (section 8)" after Teardown moved to §9.
- **Attempt 2 — Implementer (rework):** Fixed line 437 "(section 8)" → "(section 9)"; verified all `(section N)` refs match current headings (Outputs=7, Cost=8, Teardown=9, Hardening=10). No other change.
  - **Reviewer verdict: STATUS: PASS** — sole finding resolved; all cross-refs consistent; no regression.
- **Final verification:** PASS — cross-refs consistent, every AWS command `--profile IBD-DEV`.
- **Commit:** `[SPEC:bugfix/admin-user-invite-and-reset] T-7 SES two-phase enablement runbook`

### T-4 API client `resetUserPassword` returns { action } + fix breaking client test — ✅ PASS (attempt 1/3) — 2026-07-16
- **Requirements covered:** FR-6. Design: §5.1.
- **Attempt 1 — Implementer:**
  - Files: `frontend/lib/api/users.ts`, `frontend/lib/api/users.test.ts`.
  - Change: added `ResetPasswordResult { action: 'RESET' | 'REINVITE' }` (exact union); `resetUserPassword` now returns `Promise<ResetPasswordResult>` via `apiFetch<ResetPasswordResult>` with `expectEmpty: true` removed; JSDoc updated. Test suite swapped `make204()` → `makeFetchOk({action:'RESET'})`, asserts the object + POST/URL/Bearer, added a REINVITE case; `deleteUser` still uses `make204()`.
  - Also cleared gitignored `.next/` iCloud conflict-copy stubs that produced spurious tsc duplicate-identifier errors (build artifacts, not source — consistent with the known iCloud-corruption issue).
  - Verification: `npx tsc --noEmit` clean; `npm test -- lib/api/users.test.ts` → 31/31.
- **Attempt 1 — Reviewer verdict:** STATUS: PASS. Exact literal union preserved (no `string`); `expectEmpty` removed; JSDoc accurate; tests assert 200 `{action}` for both values; `deleteUser` green; scope limited to the two files.
- **Final verification:** PASS — 31/31, tsc clean.
- **Note:** one unrelated suite (`admin/actors/import/page.test.tsx`) flakes under full-parallel load; passes in isolation on baseline and with the change — not caused by this task.
- **Commit:** `[SPEC:bugfix/admin-user-invite-and-reset] T-4 API client resetUserPassword returns {action}`

### T-5 Users page: status-aware banner + confirm-dialog copy — ✅ PASS (attempt 1/3) — 2026-07-16
- **Requirements covered:** FR-6. Design: §5.2, §5.3.
- **Attempt 1 — Implementer:**
  - Files: `frontend/app/(admin)/admin/users/page.tsx`, `frontend/app/(admin)/admin/users/page.test.tsx`. (UsersTable needed no edit.)
  - Change: `handleResetConfirm` destructures `{ action }` and branches the aria-live banner (REINVITE → "Invitation re-sent with a new temporary password."; RESET → "Password reset email sent."); reset ConfirmDialog `description` adapts to `resetUser.status` and now says "password-reset **code**" (was "link"). Error path unchanged (AuthFailureError routes; 409 ApiError.message renders in the dialog error slot — no generic 500). Added 3 page tests: REINVITE banner, RESET banner, clean-409 message.
  - Verification: `npm test -- users/page && npm run build && npm run lint` → 14/14; static export prerenders `/admin/users`; lint clean (pre-existing `<img>` warnings only).
- **Attempt 1 — Reviewer verdict:** STATUS: PASS. Banner + dialog branching correct; "code" not "link"; token compliance confirmed (no hex/rgb/arbitrary); static export intact (`'use client'`, no dynamic segments); tests assert both banners + clean-409.
  - Accepted observation (non-blocking): `confirmLabel="Send reset email"` is static for both cases; design §5.3 only required adapting the description + keeping the row-action label "Reset pwd", and the description now carries the re-invite context. Left as-is per incremental-focus.
- **Final verification:** PASS — 14/14, static build clean.
- **Commit:** `[SPEC:bugfix/admin-user-invite-and-reset] T-5 status-aware reset banner + dialog copy (code not link)`

### T-8 Full backend + frontend gate — ✅ PASS (verification-only) — 2026-07-16
- **Requirements covered:** NFR-7. Design: §10.
- **Executed by Leader (no code diff — regression gate):**
  - Backend: `npm test` → 34 suites / **368 tests pass** (incl. `role-aware.serializer`/`pii-consent.policy` PII boundary and `lambda-handler.e2e`); `npm run build` clean; `npm run lint` → 0 errors (49 pre-existing `no-explicit-any` warnings in `src/test/*`, unrelated).
  - Frontend: `npm test` → 67 suites / **894 tests pass** (the earlier parallel-load flake in `admin/actors/import/page.test.tsx` passes clean in the full run); `npm run build` → static export succeeds, `/admin/users` prerendered ○; `npm run lint` → 0 errors (pre-existing `<img>` warnings only).
- **Final verification:** PASS — nothing regressed; all hard release gates green.
- **Commit:** (docs) `[SPEC:bugfix/admin-user-invite-and-reset] log T-5 + T-8 PASS`

### T-9 OPERATOR: enable SES, deploy, live smoke — ⏸ PENDING OPERATOR (deps T-6, T-7, T-8 ✅)
- **Not agent-run.** Requires OQ-1 (the SES sender address to verify), the two-phase live deploy (design §7.2), a human SES verification-link click + `put-identity-policy`, and live inbox smoke. The agent loop stops at T-8 per tasks.md.
- **Turn-key operator helper added:** `infra/10-data-auth/t9-enable-ses.sh <sender-email>` — resolves account id / pool ARN / VpcId / DevCidr live, runs Phase A deploy, pauses for the human verification-link click, attaches the `cognito-send` policy (substituting the JSON placeholders into a temp file), then Phase B deploy. Forces `--profile IBD-DEV` / eu-west-1; idempotent; `bash -n` clean.
- **OQ-1 answered (2026-07-16):** a generic/Cognito address canNOT be the sender — SES DEVELOPER mode only sends from an identity the team verifies ownership of (SES emails a link to that address; someone must click it). Recommend a team-controlled shared/role mailbox, ideally on `cgiar.org` for deliverability. Still the user's decision; not hardcoded.
- Awaiting: the user picks the sender address, then runs `t9-enable-ses.sh` (or the manual `infra/README.md` §6 steps).
