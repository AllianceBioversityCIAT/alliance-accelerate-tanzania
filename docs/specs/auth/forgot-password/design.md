# Design — Forgot-Password / Reset-Code Entry Flow

- Spec path: docs/specs/auth/forgot-password/
- Status: Draft
- Traces requirements: FR-1..FR-6, NFR-1..NFR-6 from this spec's requirements.md

## 1. Approach Overview

A **frontend-only** addition within the mandated static-export architecture. Two
new never-throwing Amplify wrappers in `auth-client.ts` plus a dedicated static
`/forgot-password` page (Approach A from the proposal) with a small two-step
state machine — `request` (enter email → Amplify `resetPassword`) → `submit`
(enter email + code + new password → Amplify `confirmResetPassword`) → route to
`/login` with a success banner. The page reuses `LoginForm`'s card, field, button,
and accessible error-region conventions verbatim (tokens, `role="alert"`,
`aria-busy`). No backend, Cognito, or infra change — the branded reset-code email
is already delivered by `bugfix/admin-user-invite-and-reset`.

```
/login ──"Forgot password?"──▶ /forgot-password
  step 'request':  email ─▶ resetPassword(username)         ─▶ step 'submit'
  step 'submit':   email + code + newPassword
                    ─▶ confirmResetPassword({username,code,newPassword})
                    ─▶ router.replace('/login?reset=success')  (banner on /login)
  errors (CodeMismatch/Expired/InvalidPassword/LimitExceeded) ─▶ stay on step, role="alert"
```

## 2. Data Model Changes

None. No Prisma/DB/Cognito change; no PII field; the reset-code email template
already exists (invite/reset spec `VerificationMessageTemplate`).

## 3. API Surface & Contracts

No REST API. The "contract" is the two new `auth-client` functions over Amplify
v6 (`aws-amplify/auth`):

```ts
// Result unions (mirror the existing SignInResult discipline)
export type ResetRequestResult =
  | { status: 'code_sent' }
  | { status: 'error'; message: string };

export type ResetConfirmResult =
  | { status: 'done' }
  | { status: 'error'; message: string };

// Never throw (NFR-5). username == email (pool UsernameAttributes: email).
export async function resetPassword(username: string): Promise<ResetRequestResult>;
export async function confirmResetPassword(input: {
  username: string; code: string; newPassword: string;
}): Promise<ResetConfirmResult>;
```

- `resetPassword` wraps Amplify `resetPassword({ username })`; success (the
  `CONFIRM_RESET_PASSWORD_WITH_CODE` next step) → `{ status: 'code_sent' }`.
- `confirmResetPassword` wraps Amplify `confirmResetPassword({ username,
  confirmationCode: code, newPassword })`; resolve → `{ status: 'done' }`.
- Both `catch (err)` → `{ status: 'error', message }` via a shared safe-message
  mapper (§4.2). Import aliasing avoids the name clash with our own exports
  (`resetPassword as amplifyResetPassword`, `confirmResetPassword as
  amplifyConfirmResetPassword`).

## 4. Backend Design

None (no NestJS change). All logic is the two `auth-client` wrappers + the page
component. FR mapping lives entirely in the frontend.

### 4.1 `auth-client.ts` additions (FR-6)

Add the two functions above alongside `signIn`/`confirmNewPassword`, following
the identical `try/catch → discriminated union` shape. Add the Amplify imports
(aliased). No change to existing exports.

### 4.2 Safe error mapping (FR-5)

A small `resetErrorMessage(err): string` helper maps Cognito error `name` to a
user-actionable, internal-free message:

| Cognito error | Message |
|---|---|
| `CodeMismatchException` | "That code isn't correct. Check the code from your email, or request a new one." |
| `ExpiredCodeException` | "That code has expired. Request a new one and try again." |
| `InvalidPasswordException` | "That password doesn't meet the requirements. Try a stronger one." |
| `LimitExceededException` | "Too many attempts. Please wait a few minutes and try again." |
| `UserNotFoundException` | (neutral) treated like success on the **request** step — do NOT reveal; on confirm, generic "Couldn't reset the password. Check your email and code." |
| anything else | "Something went wrong. Please try again." |

Never include the raw `err.message`/name in the returned string (NFR-4).

## 5. Frontend Design

### 5.1 Route & page (FR-1, NFR-1)

- New static route `frontend/app/(public)/forgot-password/page.tsx` — `'use
  client'`, mirrors `/login/page.tsx`: centers a card; wraps the form in
  `<Suspense>` **iff** it reads `useSearchParams` (it does not need to — see
  §5.4 — so Suspense may be omitted, but keep the same centered layout wrapper).
- `LoginForm` gets a "Forgot password?" `<Link href="/forgot-password">` on the
  **credentials** step only (OQ-3 default), styled as a small text link with
  token classes (`text-sm text-muted hover:text-fg` / accent as used elsewhere) —
  focusable, labelled (FR-1). This is the only edit to `LoginForm`.

### 5.2 Component — `ForgotPasswordForm.tsx` (FR-2..FR-5)

A new client component modeled on `LoginForm` (same `Field`/`Label`/`Input`
primitives — extract/share if trivial, else replicate the exact classes):

- State: `step: 'request' | 'submit'`, `email`, `code`, `newPass`, `busy`,
  `error`, and a transient `notice` (the "code sent" confirmation).
- `step === 'request'`: email input + "Send reset code" button → calls
  `resetPassword(email)`; on `code_sent` → set `notice`, advance to `submit`
  (pre-filling `email`, FR-4); on `error` → error region.
- `step === 'submit'`: email (editable, pre-filled — FR-4), code, new-password
  inputs + "Set new password" button → calls `confirmResetPassword`; on `done` →
  `router.replace('/login?reset=success')`; on `error` → error region, stay.
- Error region: identical to `LoginForm` (`role="alert" aria-live="assertive"
  aria-atomic="true"`, `bg-danger/10 border-danger/30 text-danger`). Notice uses
  the established success/neutral token style. `aria-busy={busy}` on submit;
  disable while busy (FR-3 double-submit guard).
- Headings/copy per step ("Reset your password" / "Enter your reset code").

### 5.3 Success banner on `/login` (FR-3, OQ-1)

`LoginForm` reads `?reset=success` (it already uses `useSearchParams` for
`redirect`) and renders a one-time success message ("Your password was reset —
sign in with your new password.") via its existing error/notice region pattern
(success-styled tokens, `aria-live="polite"`). This is a minimal, additive read
of an existing hook — no new Suspense boundary needed (`LoginForm` is already
Suspense-wrapped by `/login/page.tsx`).

### 5.4 Static-export compliance (NFR-1)

- `ForgotPasswordForm` holds its own step state; it does **not** need
  `useSearchParams` (email is typed, not URL-passed — Cognito emails a bare code,
  not a link; proposal Option C rejected). So `/forgot-password/page.tsx` needs
  no Suspense. Keep everything `'use client'`; no dynamic segments/handlers.

### 5.5 Tests (FR-2..FR-6, NFR-3)

- `auth-client` unit tests (Amplify mocked at module level, as existing):
  `resetPassword` → `code_sent` / `error`; `confirmResetPassword` → `done` /
  each mapped error (`CodeMismatch`, `Expired`, `InvalidPassword`,
  `LimitExceeded`) → correct safe message; never throws.
- `ForgotPasswordForm.test.tsx`: request→submit advance with pre-filled email;
  success routes to `/login?reset=success`; invalid/expired code shows the mapped
  message and stays on step; weak password shows the mapped message; `aria-busy`
  during submit.
- `LoginForm.test.tsx`: "Forgot password?" link present on credentials step;
  `?reset=success` renders the success banner.

## 6. Security & RBAC

Unauthenticated flow. No PII displayed; the user handles only their own email +
code + new password. No account enumeration (neutral request-step messaging,
FR-2/NFR-4). No secret/code/password in URL, logs, or analytics. Amplify manages
token/credential handling; our wrappers never persist the password.

## 7. Infrastructure / Deployment

None. Frontend-only; ships via the normal static-export deploy
(`infra/scripts/deploy-frontend.sh`, `--profile IBD-DEV`). No template/Cognito
change. (The branded code email depends on the invite/reset spec being deployed,
but this spec adds no infra.)

## 8. Decision Records (ADR-style)

### Decision: Dedicated `/forgot-password` page (not inline in LoginForm)
- **Context:** `LoginForm` already runs a two-step machine (credentials +
  new-password challenge); the reset flow is a distinct two-step machine.
- **Options:** (A) **separate static page**; (B) fold steps into `LoginForm`;
  (C) URL/query-deep-link code entry.
- **Decision:** A — isolates the flow, keeps `LoginForm` focused, mirrors the
  `/login` page+card pattern, isolates tests. C is rejected (Cognito emails a
  bare code, not a link, so there's nothing to deep-link).
- **Consequences:** One new page + one new component; `LoginForm` touched only for
  the entry link + the `?reset=success` banner.

### Decision: Never-throwing discriminated-union wrappers with a safe error mapper
- **Context:** The module's convention (`signIn`/`confirmNewPassword`) is
  never-throw + `{ status }` unions + no leaked internals.
- **Decision:** Match it exactly; add `resetErrorMessage` to convert Cognito
  error names to safe, actionable copy.
- **Consequences:** Unit-testable with Amplify mocked; consistent UX/error safety.

### Decision: Route to /login with a banner after success (OQ-1)
- **Context:** Options were auto-sign-in vs. redirect-with-banner.
- **Decision:** Redirect to `/login?reset=success` — simpler, avoids holding the
  new password to sign in, reuses the existing login screen.
- **Consequences:** `LoginForm` reads one extra query param (additive).

## 9. Risks & Mitigations

- **R1 — Account enumeration** on the request step. Mitigation: neutral "if an
  account exists" messaging; treat `UserNotFoundException` like success there
  (FR-2/NFR-4).
- **R2 — Amplify import name clash** (`resetPassword` is both our export and
  Amplify's). Mitigation: alias imports (`amplifyResetPassword` /
  `amplifyConfirmResetPassword`).
- **R3 — Static-export violation.** Mitigation: `'use client'`, no
  handlers/dynamic segments; no unneeded `useSearchParams`; the `npm run build`
  gate catches violations.
- **R4 — Token/aria regressions.** Mitigation: reuse `LoginForm`'s exact classes
  and error-region markup; reviewer greps for hex/arbitrary values.

## 10. Test Plan Outline

| FR | Level | Test |
|---|---|---|
| FR-6 | Unit | `auth-client`: `resetPassword`/`confirmResetPassword` success + never-throw. |
| FR-5 | Unit | `auth-client`: each Cognito error → mapped safe message; no leak. |
| FR-2/FR-4 | Component | `ForgotPasswordForm`: request→submit advance, email pre-filled/editable. |
| FR-3 | Component | success routes to `/login?reset=success`; `aria-busy` during submit. |
| FR-5 | Component | invalid/expired code + weak password show mapped messages, stay on step. |
| FR-1 | Component | `LoginForm` shows the "Forgot password?" link (credentials step). |
| FR-3 | Component | `LoginForm` renders the `?reset=success` banner. |
| NFR-1/2/6 | Gate | `npm test && npm run build && npm run lint` green; static export builds; tokens only. |

No PII-omission test needed (no PII surface); existing auth/session tests stay green.
