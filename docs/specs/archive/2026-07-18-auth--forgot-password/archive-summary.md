# Archive Summary — Forgot-Password / Reset-Code Entry Flow

## 1. Document Control
- Original spec path: `docs/specs/auth/forgot-password/`
- Archive date: 2026-07-18
- Author: Claude (SDD Leader)

## 2. Original Spec Path
`docs/specs/auth/forgot-password/` → archived to
`docs/specs/archive/2026-07-18-auth--forgot-password/`.

## 3. Archive Date
2026-07-18.

## 4. Final Status
**Done — deployed & user-verified.** All tasks T-1…T-5 complete on first attempt
(zero reworks). Closes OQ-5 from `bugfix/admin-user-invite-and-reset`.

## 5. Requirements Delivered
- **FR-1:** "Forgot password?" entry on the login screen → `/forgot-password`.
- **FR-2/FR-3/FR-4:** request a reset code → enter code + new password
  (`confirmResetPassword`); the code step accepts the email so an admin-initiated
  code is usable directly; success routes to `/login?reset=success`.
- **FR-5:** accessible, safe Cognito error mapping (no internals leaked;
  enumeration-safe `UserNotFoundException` → code_sent).
- **FR-6:** never-throwing `auth-client` `resetPassword`/`confirmResetPassword`
  wrappers mirroring the module's discriminated-union convention.

## 6. Files Changed Summary
Frontend only: `lib/auth/auth-client.ts` (+ `auth.test.tsx`), new
`components/auth/ForgotPasswordForm.tsx` (+ test), new
`app/(public)/forgot-password/page.tsx`, `components/auth/LoginForm.tsx`
(entry link + `?reset=success` banner, + test). Per-task trail in `execution.md`.

## 7. Test Evidence Summary
No standalone `test-report.md` (accepted). `execution.md` records: auth-client
unit tests, ForgotPasswordForm component tests, LoginForm link/banner tests; full
frontend gate **909/909** green at close, static export builds `/forgot-password`
as prerendered (○ Static), lint clean.

## 8. Validation Summary
No standalone `validation-report.md` (accepted). Validated via the Implementer→
Reviewer loop (all 5 tasks PASS, zero reworks), the full frontend gate, live
deploy (`/forgot-password` serves 200), and final user verification (2026-07-18).

## 9. Accepted Warnings Or Follow-Ups
- **Email dependency:** the reset code is delivered by Cognito→SES; with SES in
  sandbox it only reaches verified recipients. The admin no-email credential
  handoff (PR #45) is the email-free recovery path in the meantime. Full
  self-service delivery needs SES production access — tracked outside this spec.

## 10. Historical Notes
Built as the fast-follow that closes the CONFIRMED-user reset-code gap
(`bugfix/admin-user-invite-and-reset` §11 / OQ-5). Sibling change:
email-case normalization (PR #43) later added lowercasing inside the same
`auth-client` reset wrappers, so a code requested for any-cased email resolves to
the same identity. The self-service flow's practical reach is gated by SES
delivery (see §9), but the UI/flow is complete and deployed.
