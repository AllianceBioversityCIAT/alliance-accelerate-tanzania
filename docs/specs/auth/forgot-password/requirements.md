# Requirements — Forgot-Password / Reset-Code Entry Flow

- Spec path: docs/specs/auth/forgot-password/
- Status: Draft
- Author / Date: Claude / 2026-07-16
- Related: docs/prd.md (auth/admin access), docs/system-design/design.md §7 (tokens) §8 (Auth form component), docs/detailed-design/detailed-design.md §4/§8 (auth, RBAC), docs/specs/archive/2026-06-25-changes--auth-wiring/ (login flow), docs/specs/bugfix/admin-user-invite-and-reset/ (design §11 / OQ-5 — origin of this spec)

## 1. Summary

Cognito's password-reset path emails a numeric **code** (`CONFIRM_WITH_CODE`)
that must be entered on a "set new password" screen; the app has none, so both an
admin's "Reset pwd" on a `CONFIRMED` user and a user's own forgotten password
dead-end. This spec adds a client-side **forgot-password flow** — a "Forgot
password?" entry on the login screen that requests a code (Amplify
`resetPassword`) and a code-entry step that submits the code + a new password
(Amplify `confirmResetPassword`) — closing the gap flagged in
`bugfix/admin-user-invite-and-reset` design §11 / OQ-5. It is **frontend-only**;
Cognito already sends the branded code email (owned by the invite/reset spec) and
needs no configuration change.

## 2. Requirement Numbering & Writing Standards

- Functional requirements `FR-1…`; non-functional `NFR-1…`. RFC 2119 MUST/SHOULD/MAY.
- Each requirement is atomic and testable; traces up (auth-wiring login flow;
  invite/reset §11) and down (tasks.md).
- RBAC: this is an **unauthenticated** flow (a user recovering access). No PII is
  displayed; the user only ever handles their own email + code + new password.

## 3. Functional Requirements

### FR-1: Forgot-password entry point

- **Description:** The login screen MUST present an accessible "Forgot password?"
  affordance that navigates the user to the forgot-password flow.
- **Rationale / Source:** Users have no recovery path today; entry must be
  discoverable from `/login`.
- **Acceptance criteria:**
  - GIVEN the login screen, WHEN the user activates "Forgot password?", THEN they
    reach the forgot-password request step.
  - AND IT MUST be a real link/route (keyboard-focusable, labelled) — not a
    non-interactive element.
- **PII/RBAC impact:** Public/unauthenticated. No PII.

### FR-2: Request a reset code

- **Description:** The flow MUST let the user enter their email and request a
  reset code via Amplify `resetPassword`, then advance to the code-entry step
  with a confirmation that a code was sent (if the address exists).
- **Rationale / Source:** Self-service recovery; also (re)issues a code.
- **Acceptance criteria:**
  - GIVEN the request step, WHEN the user submits a valid email, THEN
    `resetPassword` is called and the UI advances to the code-entry step showing
    "If an account exists, a reset code has been sent."
  - GIVEN an invalid email format, WHEN submitted, THEN an inline validation
    error is shown and no request is made.
  - BUT it MUST NOT reveal whether the address is registered (neutral message;
    avoid account enumeration).
- **PII/RBAC impact:** Public. The user enters only their own email.

### FR-3: Submit code + new password

- **Description:** The code-entry step MUST let the user enter the emailed code
  and a new password and submit them via Amplify `confirmResetPassword`; on
  success the reset completes.
- **Rationale / Source:** The missing step that makes a reset usable.
- **Acceptance criteria:**
  - GIVEN a valid code + a policy-compliant new password, WHEN submitted, THEN
    `confirmResetPassword` succeeds and the user is taken to `/login` with a
    success banner (OQ-1 default).
  - AND IT MUST disable the submit control while the request is in flight
    (`aria-busy`) to prevent double submits.
  - BUT it MUST NOT auto-populate or transmit any password in the URL or logs.
- **PII/RBAC impact:** Public. New password handled only in-memory for the call.

### FR-4: Code step usable for an admin-initiated reset

- **Description:** The code-entry step MUST accept the user's **email** (not only
  a code), so a `CONFIRMED` user who already received an admin-initiated reset
  code can complete recovery by entering email + code + new password without
  first requesting a new code.
- **Rationale / Source:** OQ-2 default; closes the admin "Reset pwd" dead-end
  (invite/reset §11).
- **Acceptance criteria:**
  - GIVEN a user who arrives at the code-entry step directly (e.g. navigated to
    the flow after an admin reset), WHEN they enter their email + the received
    code + a new password, THEN `confirmResetPassword` completes the reset.
  - AND IT MUST pre-fill the email on the code step when it was just entered in
    the request step (so the common path needs it typed once).
- **PII/RBAC impact:** Public.

### FR-5: Accessible, safe error handling

- **Description:** The flow MUST map Cognito error conditions to clear,
  user-actionable messages surfaced in an accessible error region, without
  leaking internals.
- **Rationale / Source:** Cognito raises distinct errors; users need to know what
  to do (wrong code, expired code, weak password, too many attempts).
- **Acceptance criteria:**
  - GIVEN a `CodeMismatchException`/`ExpiredCodeException`, WHEN it occurs, THEN
    the user sees a message telling them the code is wrong/expired and how to get
    a new one; the user stays on the code step.
  - GIVEN an `InvalidPasswordException`, WHEN it occurs, THEN the message states
    the password doesn't meet requirements.
  - GIVEN a `LimitExceededException`/throttle, WHEN it occurs, THEN the message
    asks the user to wait and retry.
  - AND IT MUST render errors via `role="alert"` / `aria-live` (as `LoginForm`
    does) — WCAG 2.1 AA.
  - BUT it MUST NOT surface raw Cognito exception names/stack details.
- **PII/RBAC impact:** None (messages are generic/safe).

### FR-6: `auth-client` reset wrappers

- **Description:** `frontend/lib/auth/auth-client.ts` MUST expose
  `resetPassword(username)` and `confirmResetPassword({ username, code,
  newPassword })` as never-throwing wrappers returning a discriminated-union
  result consistent with the existing `SignInResult` style.
- **Rationale / Source:** Mirrors the module's established, unit-testable pattern
  (no React dep; Amplify mocked at module level).
- **Acceptance criteria:**
  - GIVEN Amplify resolves, WHEN `resetPassword` is called, THEN it returns a
    success result (code delivery step); WHEN it rejects, THEN it returns
    `{ status: 'error', message }` and never throws.
  - GIVEN `confirmResetPassword` resolves, THEN it returns a `done` result; on
    rejection, an `error` result with a safe message.
  - AND IT MUST NOT throw for any input (NFR-7 resilience parity with `signIn`).
- **PII/RBAC impact:** None.

## 4. Non-Functional Requirements

- **NFR-1 (Static export):** All new UI is `'use client'`; no SSR/ISR/route
  handlers/dynamic segments. Any `useSearchParams` sits inside `<Suspense>`
  (mirrors `/login`). The frontend static export MUST build.
- **NFR-2 (Design tokens):** Only semantic tokens from system-design §7 / the
  Auth form component (§8) — reuse `LoginForm`'s field, button, and error-region
  classes (`bg-surface`, `border-border`, `text-fg`, `bg-danger/10`,
  `border-danger/30`, `text-danger`, success uses the established banner tokens).
  No hex/rgb/arbitrary values.
- **NFR-3 (Accessibility, WCAG 2.1 AA):** Labelled inputs, visible focus, error
  region `role="alert"`/`aria-live`, logical focus movement between steps,
  `aria-busy` on in-flight submits.
- **NFR-4 (No leakage):** No password/code in URLs, logs, or analytics; error
  messages carry no Cognito internals; neutral "if an account exists" phrasing
  (no account enumeration).
- **NFR-5 (Resilience):** `auth-client` wrappers never throw (parity with the
  module's existing functions).
- **NFR-6 (Regression safety):** Frontend gates green
  (`npm test && npm run build && npm run lint`); no change to existing `LoginForm`
  sign-in / new-password-challenge behavior beyond adding the entry link.

## 5. Data & Schema Impact

None. No backend, Prisma, or Cognito configuration change. No PII field. The
branded reset-code email is already produced by
`bugfix/admin-user-invite-and-reset` (`VerificationMessageTemplate`).

## 6. Out of Scope

- Any backend/Cognito change; the admin reset endpoint and invite/first-sign-in
  flow (owned by `bugfix/admin-user-invite-and-reset`).
- SMS/MFA, security-question recovery, magic-link reset.
- Password-strength meter redesign; reuse existing field styling/validation.
- "Resend code" beyond re-running the request step.

## 7. Dependencies & Assumptions

- **DEP-1:** Amazon Cognito forgot-password path (`resetPassword` /
  `confirmResetPassword`) — already available; no config change. Best UX once
  `bugfix/admin-user-invite-and-reset` is deployed (branded code email), but
  functionally works with the current mailer.
- **DEP-2:** Amplify v6 `aws-amplify/auth` (already a dependency; `auth-client`
  uses it).
- **Assumption:** Cognito username is the email (pool `UsernameAttributes: email`),
  so the email entered is the `username` passed to Amplify.

## 8. Open Questions

- **OQ-1 (default chosen):** After a successful reset, route to `/login` with a
  success banner (chosen) rather than auto-sign-in. Confirm acceptable.
- **OQ-2 (default chosen):** The code-entry step accepts the email (chosen) so an
  admin-reset user can use an already-sent code directly. Confirm acceptable.
- **OQ-3:** Should "Forgot password?" also appear on the new-password-challenge
  step, or only on the credentials step? Default: credentials step only.

---
**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email`. All AWS commands use `--profile IBD-DEV`. (This spec introduces no AWS/infra change.)
