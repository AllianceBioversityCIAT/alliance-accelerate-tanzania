# Tasks — Forgot-Password / Reset-Code Entry Flow

- Spec path: docs/specs/auth/forgot-password/
- Status: Draft
- Traces: requirements.md FR-1..FR-6, NFR-1..NFR-6 · design.md §1..§10
- Depth: Standard. Frontend-only; fully agent-implementable (no operator/live step).

## Tasks

- [x] T-1 `auth-client` reset wrappers + safe error mapper  (deps: none)
      Scope: In `frontend/lib/auth/auth-client.ts` add `resetPassword(username)`
        → `ResetRequestResult` (`{status:'code_sent'} | {status:'error',message}`)
        and `confirmResetPassword({username,code,newPassword})` → `ResetConfirmResult`
        (`{status:'done'} | {status:'error',message}`), wrapping Amplify v6
        `resetPassword`/`confirmResetPassword` (import ALIASED as
        `amplifyResetPassword`/`amplifyConfirmResetPassword` to avoid the name
        clash). Both never throw. Add a `resetErrorMessage(err)` helper mapping
        Cognito error names → safe messages per design §4.2. Export the two result
        types. Do not change existing exports.
      Traces: FR-5, FR-6, NFR-4, NFR-5 (requirements.md), design.md §3, §4.1, §4.2
      Files: frontend/lib/auth/auth-client.ts, frontend/lib/auth/auth-client.test.tsx (or the existing auth test)
      Verify: `cd frontend && npx tsc --noEmit && npm test -- auth-client`
      Done when: both wrappers return the union on success and on rejection
        (never throw); `CodeMismatch`/`Expired`/`InvalidPassword`/`LimitExceeded`
        map to their safe messages; AND IT MUST NOT include raw Cognito
        names/messages in the returned string; BUT it must NOT alter `signIn`/
        `confirmNewPassword`/`getSession`.
      Skills: vercel-react-best-practices, error-handling-patterns

- [x] T-2 `ForgotPasswordForm` component (request → submit → success)  (deps: T-1)
      Scope: New `frontend/components/auth/ForgotPasswordForm.tsx` (`'use client'`)
        modeled on `LoginForm`: step machine `'request' | 'submit'`; request step
        (email → `resetPassword`, on `code_sent` set a neutral "if an account
        exists…" notice and advance, pre-filling email — FR-4); submit step
        (editable email + code + new password → `confirmResetPassword`, on `done`
        `router.replace('/login?reset=success')`). Reuse `LoginForm`'s exact
        field/label/input classes, the `role="alert" aria-live="assertive"
        aria-atomic` error region, success/notice token styling, and `aria-busy`
        + disabled-while-busy submit. Map errors via T-1's results.
      Traces: FR-2, FR-3, FR-4, FR-5, NFR-1, NFR-2, NFR-3 (requirements.md), design.md §5.2, §5.4
      Files: frontend/components/auth/ForgotPasswordForm.tsx, frontend/components/auth/ForgotPasswordForm.test.tsx
      Verify: `cd frontend && npm test -- ForgotPasswordForm && npm run lint`
      Done when: request→submit advances with email pre-filled/editable; success
        routes to `/login?reset=success`; invalid/expired-code and weak-password
        errors show the mapped message and stay on step; `aria-busy` during
        submit; AND IT MUST use only design tokens (no hex/rgb/arbitrary); BUT it
        must NOT put code/password in the URL or reveal account existence.
      Skills: ui-ux-pro-max, frontend-design, tailwind-design-system

- [x] T-3 `/forgot-password` static page  (deps: T-2)
      Scope: New `frontend/app/(public)/forgot-password/page.tsx` (`'use client'`)
        mirroring `/login/page.tsx`'s centered card layout, rendering
        `<ForgotPasswordForm />`. No `useSearchParams` needed → no Suspense
        required; no SSR/handlers/dynamic segments (NFR-1).
      Traces: FR-1, NFR-1 (requirements.md), design.md §5.1, §5.4
      Files: frontend/app/(public)/forgot-password/page.tsx
      Verify: `cd frontend && npm run build` (static export must produce /forgot-password)
      Done when: `/forgot-password` prerenders as static content; page renders the
        form; BUT it must NOT introduce SSR/route handlers/dynamic segments.
      Skills: frontend-design, vercel-react-best-practices

- [ ] T-4 `LoginForm` entry link + `?reset=success` banner  (deps: T-3)
      Scope: In `frontend/components/auth/LoginForm.tsx` add a "Forgot password?"
        `<Link href="/forgot-password">` on the **credentials** step only (OQ-3),
        token-styled + focusable/labelled (FR-1). Read `?reset=success` from the
        existing `useSearchParams` and render a one-time success banner
        ("Your password was reset — sign in with your new password.",
        `aria-live="polite"`, success tokens) reusing the existing notice region.
        Update `LoginForm.test.tsx`: assert the link on the credentials step and
        the banner when `?reset=success`.
      Traces: FR-1, FR-3, NFR-2, NFR-3, NFR-6 (requirements.md), design.md §5.1, §5.3
      Files: frontend/components/auth/LoginForm.tsx, frontend/components/auth/LoginForm.test.tsx
      Verify: `cd frontend && npm test -- LoginForm && npm run build && npm run lint`
      Done when: the link appears on the credentials step (not the challenge step);
        `?reset=success` renders the banner; AND IT MUST keep existing sign-in /
        new-password-challenge behavior unchanged; BUT it must NOT add a new
        Suspense boundary or hardcode colors.
      Skills: ui-ux-pro-max, frontend-design

- [ ] T-5 Full frontend gate  (deps: T-1, T-2, T-3, T-4)
      Scope: Run the complete frontend gates to confirm NFR-6 (nothing regressed)
        and the static export builds `/forgot-password`.
      Traces: NFR-1, NFR-2, NFR-6 (requirements.md), design.md §10
      Files: — (verification only)
      Verify: `cd frontend && npm test && npm run build && npm run lint`
      Done when: all suites green; static export builds (incl. `/forgot-password`
        prerendered ○); lint 0 errors; no token violations.
      Skills: vercel-react-best-practices

## Dependency Graph

```
T-1 ─▶ T-2 ─▶ T-3 ─▶ T-4 ─▶ T-5
```
- T-1 (auth-client) has no deps. T-2 needs T-1 (uses the wrappers). T-3 renders
  T-2's component. T-4 links to T-3's route + adds the banner. T-5 is the final gate.
- (T-2 and later are a linear chain; no parallelism worth the coordination here.)

## Testing & Verification Expectations
- Every task carries a runnable `Verify`; prefer targeted (`npm test -- <pattern>`)
  until T-5. Use `npx tsc --noEmit` where types matter (SWC test transform skips
  type-checking).
- Frontend gates: `npm test` / `npm run build` (static export) / `npm run lint`.
- Reuse `LoginForm`'s exact token classes + accessible error-region markup; a
  static-export build failure usually means an NFR-1 violation (SSR, dynamic
  segment, or un-Suspensed `useSearchParams`).

## Execution Conventions
- Commits: `[SPEC:auth/forgot-password] <message>`.
- Frontend-only; no PII field, no AWS/infra change (no `--profile` needed).
- Do not modify `LoginForm`'s existing sign-in / challenge flows beyond the entry
  link and the `?reset=success` banner (NFR-6).
