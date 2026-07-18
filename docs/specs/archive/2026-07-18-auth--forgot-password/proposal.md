# Proposal — Forgot-Password / Reset-Code Entry Flow

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `auth/forgot-password` |
| Type | Enhancement (closes a known gap from a prior spec) |
| Status | PROPOSED — awaiting approval |
| Date | 2026-07-16 |
| Author | Claude |
| Origin | `bugfix/admin-user-invite-and-reset` design §11 / OQ-5 (fast-follow) |

## 2. Intent

Give users a working, self-serve way to complete a password reset: request a
code, enter it, and set a new password — so both the admin-initiated "Reset pwd"
code **and** a user's own "Forgot password?" request lead somewhere instead of
dead-ending.

## 3. Problem / Current Behavior

- Cognito's password-reset path (`AdminResetUserPassword` for a `CONFIRMED` user,
  and the self-service forgot-password path) uses `CONFIRM_WITH_CODE` — it emails
  a numeric **code** the user must enter on a "set new password" screen
  (Amplify `confirmResetPassword`).
- **The app has no such screen.** `frontend/lib/auth/auth-client.ts` exposes
  `signIn`, `confirmNewPassword`, `signOut`, `getSession` — but **no**
  `resetPassword` / `confirmResetPassword`. `frontend/app/(public)/login/` has no
  "Forgot password?" affordance and no code-entry page (verified).
- Consequence: an admin resetting a `CONFIRMED` user's password produces a code
  email that the user cannot act on; a user who forgets their password has no
  recovery path at all. (The invite / `FORCE_CHANGE_PASSWORD` first-sign-in flow
  is unaffected — `auth-client.ts` already handles that challenge.)

## 4. Proposed Outcome

1. A **"Forgot password?"** link on the login screen starts a recovery flow:
   enter email → Cognito emails a code (Amplify `resetPassword`).
2. A **code-entry step**: enter the emailed code + a new password → Amplify
   `confirmResetPassword` → success routes to sign-in (or auto-signs-in).
3. The same code-entry step also serves the **admin-initiated** reset — a
   `CONFIRMED` user who receives the "Reset pwd" code can use it here.
4. Clear, accessible error/success states (invalid/expired code, password-policy
   failures) consistent with the existing `LoginForm` patterns.

## 5. Scope

- **Frontend only.** `frontend/lib/auth/auth-client.ts`: add `resetPassword`
  (request code) and `confirmResetPassword` (submit code + new password) wrappers
  over `aws-amplify/auth`, mirroring the existing `SignInResult`-style result
  shape and error mapping.
- A forgot-password UI reachable from `/login` (see Approach Options for
  page-vs-inline). Steps: request-code → enter-code+new-password → done.
- Static-export compliant: `'use client'`, no SSR/route handlers, `<Suspense>`
  around any `useSearchParams`, query-param routing if a separate page is used.
- Design tokens only (system-design §7); WCAG 2.1 AA (labels, `aria-live`,
  focus management between steps), matching `LoginForm`.
- Tests: `auth-client` unit tests for the two new functions; component tests for
  the flow (request, success, invalid/expired code, weak password).

## 6. Non-Goals

- No change to the **admin** reset endpoint or the invite/`FORCE_CHANGE_PASSWORD`
  flow (both already work; owned by `bugfix/admin-user-invite-and-reset`).
- No SMS/MFA, no security-question recovery, no "resend code" rate-limit UI
  beyond surfacing Cognito's own throttling message.
- No backend/Cognito template change — the branded reset-code email is already
  delivered by the invite/reset spec's `VerificationMessageTemplate`.
- No password-strength meter redesign (reuse existing field/validation styling).

## 7. Affected Users, Systems, And Specs

- **Users:** any Staff/Admin who forgot their password, or a `CONFIRMED` user an
  admin reset.
- **Systems:** frontend auth (`auth-client.ts`, login area), Amazon Cognito
  (existing forgot-password path — no config change).
- **Specs:** completes `bugfix/admin-user-invite-and-reset` §11/OQ-5; extends the
  archived `changes/auth-wiring` login flow.

## 8. Requirement Delta Preview

### ADDED Requirements

- Users can request a password-reset code from the login screen.
- Users can submit a reset code + new password to complete the reset.
- The flow surfaces invalid/expired-code and password-policy errors accessibly.
- `auth-client` exposes `resetPassword` and `confirmResetPassword` wrappers.

### MODIFIED Requirements

- Login screen gains a "Forgot password?" entry point (additive to the existing
  `LoginForm`).

### REMOVED Requirements

- None.

## 9. Approach Options

### Option A — Separate `/forgot-password` page (recommended)

A dedicated static route with an internal two-step state machine
(request-code → enter-code+new-password), linked from `LoginForm`.
- ✅ Keeps `LoginForm` focused; clean deep-linkable URL; isolated tests; mirrors
  the existing page+`<Suspense>` pattern (`/login`).
- ❌ One new route/page file.

### Option B — Inline steps inside `LoginForm`

Add forgot-password steps to the existing `LoginForm` state machine (which
already has sign-in + new-password-challenge steps).
- ✅ No new route.
- ❌ `LoginForm` already juggles two flows; adding a third grows a single
  component and its test surface; harder to reason about focus/step transitions.

### Option C — Deep-link code entry via query param

`/forgot-password?code=...&user=...` prefilled from the email link.
- ❌ Cognito `CONFIRM_WITH_CODE` emails a bare code, not a magic link; the code
  isn't URL-delivered, so this adds no value over Option A. Rejected.

## 10. Recommended Approach

**Option A.** A dedicated `/forgot-password` page with a small two-step state
machine keeps `LoginForm` simple, matches the repo's established page +
`<Suspense>` + token conventions, and gives both the self-service and
admin-initiated code a single clear destination. It is the smallest change that
fully closes OQ-5.

## 11. Risks, Dependencies, And Open Questions

- **DEP-1:** best experienced after `bugfix/admin-user-invite-and-reset` is
  deployed (branded reset-code email via SES); functionally the flow works with
  the default mailer too.
- **RISK-1:** Cognito surfaces distinct errors (`CodeMismatchException`,
  `ExpiredCodeException`, `InvalidPasswordException`, `LimitExceededException`) —
  the flow must map each to a clear, safe message (mirror `auth-client`'s
  existing mapping discipline; never leak internals).
- **OQ-1:** After a successful reset, auto-sign-in the user, or route to `/login`
  with a success banner? Default: route to `/login` with a success message
  (simpler, avoids holding the new password).
- **OQ-2:** Should the code-entry step accept the username too (so an
  admin-reset user who lands directly on `/forgot-password` can enter email +
  code without first requesting a new code)? Default: yes — allow entering the
  email on the code step so an already-sent code is usable.

## 12. Success Criteria

1. From `/login`, "Forgot password?" → request a code → receive it (inbox).
2. Entering the emailed code + a valid new password completes the reset; the user
   can sign in with the new password.
3. A `CONFIRMED` user whose password an admin reset can complete recovery via the
   same screen.
4. Invalid/expired code and weak-password errors render accessibly; no raw
   Cognito internals leak.
5. Frontend gates green (`npm test && npm run build && npm run lint`); static
   export builds; token-compliant; WCAG 2.1 AA.

## 13. Next Step

```text
/sdd-specify auth/forgot-password
```
