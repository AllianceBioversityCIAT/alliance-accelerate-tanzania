# Archive Summary — Admin User Invite Email Delivery & Reset-Password Error

## 1. Document Control
- Original spec path: `docs/specs/bugfix/admin-user-invite-and-reset/`
- Archive date: 2026-07-18
- Author: Claude (SDD Leader)

## 2. Original Spec Path
`docs/specs/bugfix/admin-user-invite-and-reset/` → archived to
`docs/specs/archive/2026-07-18-bugfix--admin-user-invite-and-reset/`.

## 3. Archive Date
2026-07-18.

## 4. Final Status
**Done — deployed & user-verified, with a documented partial supersession.**
All tasks T-1…T-9 complete. The two reported defects are fixed in production. The
invite/reset **email** mechanism was later superseded by a no-email credential
handoff (PR #45) — see §10.

## 5. Requirements Delivered
- **FR-4 (reset no longer 500s):** met. Original status-aware reset (REINVITE vs
  RESET); later replaced by `AdminSetUserPassword` + temp-password handoff.
- **FR-5 (safe error mapping):** met — `UnsupportedUserStateException` /
  state-flavored `NotAuthorizedException` → 409, IAM-flavored → 500. Still live.
- **FR-1/2/3 (SES + branded templates):** met — SES DEVELOPER enabled, branded
  English invite + reset templates deployed. Now used by the self-service
  `/forgot-password` flow.
- **FR-6 (UI feedback):** delivered originally (status-aware banner); the reset UI
  is now the temp-password handoff (PR #45).

## 6. Files Changed Summary
Backend `src/users/` (service, controller, error mapper, e2e), frontend
`lib/api/users.ts` + admin users page/dialogs, infra `10-data-auth/template.yaml`
(SES params/conditions/identity, branded templates), `ses-cognito-send-policy.json`,
`t9-enable-ses.sh`, `infra/README.md §6`. Full per-task trail in `execution.md`.

## 7. Test Evidence Summary
No standalone `test-report.md` (accepted). Per-task verification recorded in
`execution.md`: backend 368→374 tests, frontend 894→917 tests, static export +
lint clean, PII-boundary + lambda-handler e2e green. Live smoke: API 200, reset
route 401 (guarded, not 500), branded invite template confirmed on the pool, a
direct SES send delivered to the verified inbox.

## 8. Validation Summary
No standalone `validation-report.md` (accepted). Validated via the Implementer→
Reviewer loop per task (all PASS; one rework on T-7), the full regression gates,
live deploy verification, and final user browser verification (2026-07-18).

## 9. Accepted Warnings Or Follow-Ups
- **SES sandbox:** SES still in sandbox — the self-service `/forgot-password`
  only delivers to verified recipients. Options (revert / keep / request
  production access) left open with the user; not blocking (admin reset is the
  email-free recovery path).
- **`noreply@cgiar.org`:** not usable as sender without domain (DKIM) verification
  by CGIAR IT — deferred.

## 10. Historical Notes (Supersession)
After deployment, corporate `@cgiar.org` (Microsoft 365) deliverability + SES
sandbox limits made email unreliable. The team pivoted to a **no-email admin
credential handoff** (`feature/admin-credential-handoff`, PR #45): create uses
`MessageAction: SUPPRESS` + a returned CSPRNG temporary password, and reset uses
`AdminSetUserPassword(Permanent:false)` returning `{ temporaryPassword }`, shown
once in the admin UI (`CredentialHandoff`). This replaced this spec's email-invite
and `{ action: RESET|REINVITE }` reset design. The branded templates, SES config,
and error mapping remain deployed. Sibling fix delivered separately:
email-case normalization (PR #43) — the pool is case-sensitive (immutable), so
emails are lowercased on create + sign-in.
