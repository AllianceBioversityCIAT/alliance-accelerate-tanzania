# Tasks — Admin User Invite Email Delivery & Reset-Password Error

- Spec path: docs/specs/bugfix/admin-user-invite-and-reset/
- Status: Draft
- Traces: requirements.md FR-1..FR-6, NFR-1..NFR-7 · design.md §1..§11
- Depth: Standard. Backend + frontend are agent-implementable; the SES enablement
  (verify sender, attach authorization policy, live deploy) is an **operator**
  step per the infra runbook boundary — captured as T-9 (documented, not
  agent-run against the live account).

## Tasks

- [x] T-1 Status-aware `resetPassword` in the users service  (deps: none)
      Scope: In `backend/src/users/users.service.ts`, change `resetPassword(id)`
        to return `{ action: 'RESET' | 'REINVITE' }`. First `AdminGetUser` to read
        `UserStatus`; for `FORCE_CHANGE_PASSWORD` issue `AdminCreateUser` with
        `MessageAction: 'RESEND'`, `Username: id` (the sub — NOT the email alias),
        `DesiredDeliveryMediums: ['EMAIL']` → return `{ action: 'REINVITE' }`; for
        `CONFIRMED`/`RESET_REQUIRED` (default) issue `AdminResetUserPassword` →
        `{ action: 'RESET' }`. Keep the `catch → mapCognitoError(err)` funnel.
      Traces: FR-4 (requirements.md), design.md §4.1
      Files: backend/src/users/users.service.ts
      Verify: `cd backend && npm test -- users.service && npm run build`
      Done when: unit test asserts REINVITE issues `AdminCreateUser` RESEND with
        `Username=id` and RESET issues `AdminResetUserPassword`, chosen by status;
        BUT it must NOT pass the resolved email alias to RESEND, and MUST resolve
        status server-side (no client input). Build compiles.
      Skills: nestjs-expert, aws-serverless, error-handling-patterns

- [x] T-2 Narrow the Cognito user-state error mapping  (deps: none)
      Scope: In `backend/src/users/cognito-error.mapper.ts` add
        `UnsupportedUserStateException` → `ConflictException` (409). Add
        `NotAuthorizedException` handling that maps to 409 ONLY when the error
        message indicates a user-state cause (helper `isUserStateNotAuthorized`);
        otherwise fall through to the existing generic 500. Do not change any
        existing case.
      Traces: FR-5 (requirements.md), design.md §4.2
      Files: backend/src/users/cognito-error.mapper.ts (+ its spec)
      Verify: `cd backend && npm test -- cognito-error`
      Done when: tests show `UnsupportedUserStateException`→409; state-flavored
        `NotAuthorizedException`→409; credential/permission-flavored
        `NotAuthorizedException`→500 (safe generic message); AND IT MUST NOT leak
        raw Cognito text; BUT it must NOT alter `UsernameExists`(409)/
        `UserNotFound`(404)/`InvalidParameter`(400)/`TooManyRequests`(429).
      Skills: error-handling-patterns, nestjs-expert

- [x] T-3 Reset endpoint returns 200 `{ action }` + fix breaking backend e2e  (deps: T-1, T-2)
      Scope: In `backend/src/users/users.controller.ts` replace `@HttpCode(204)`
        with `@HttpCode(200)` on `POST :id/password` and return the service's
        `{ action }`. Update `backend/src/users/users.e2e.spec.ts` (the ~line 195
        `'204 for authenticated Admin'` case) to expect `200` + `{ action }`. Add
        a handler-level path (real `lambda.ts`) asserting `200 { action }` for a
        CONFIRMED and a FORCE_CHANGE_PASSWORD user (mock Cognito status).
      Traces: FR-4, FR-6 (requirements.md), design.md §3, §4.3, §4.4
      Files: backend/src/users/users.controller.ts, backend/src/users/users.e2e.spec.ts
      Verify: `cd backend && npm test -- users && npm run build && npm run lint`
      Done when: the endpoint returns HTTP 200 (NOT 201, NOT 204) with the typed
        body; the previously-204 e2e now passes on 200; lambda-handler e2e green;
        BUT it must NOT return any password/secret in the body.
      Skills: nestjs-expert, api-design-principles

- [x] T-4 API client `resetUserPassword` returns `{ action }` + fix breaking client test  (deps: T-3)
      Scope: In `frontend/lib/api/users.ts` change `resetUserPassword` return type
        to `Promise<{ action: 'RESET' | 'REINVITE' }>`, drop `expectEmpty: true`,
        read the JSON body; mirror the union exactly (no `string`). Update the
        `resetUserPassword()` describe block in `frontend/lib/api/users.test.ts`
        (~line 372) from the `make204()`/void assertion to a `200 { action }` mock
        asserting the returned object.
      Traces: FR-6 (requirements.md), design.md §5.1, §5.4
      Files: frontend/lib/api/users.ts, frontend/lib/api/users.test.ts
      Verify: `cd frontend && npx tsc --noEmit && npm test -- users`
      Done when: client returns the typed `{ action }`; the updated test passes on
        a 200 body; AND IT MUST keep the exact string-literal union (type-fidelity,
        frontend/CLAUDE.md); BUT it must NOT loosen `action` to `string`.
      Skills: vercel-react-best-practices, frontend-design

- [x] T-5 Users page: status-aware banner + confirm-dialog copy  (deps: T-4)
      Scope: In `frontend/app/(admin)/admin/users/page.tsx` use the returned
        `action`: `REINVITE`→banner "Invitation re-sent with a new temporary
        password."; `RESET`→"Password reset email sent." Adapt `ConfirmDialog`
        description to `user.status` (FORCE_CHANGE_PASSWORD vs CONFIRMED per
        design §5.3) and change "reset link" wording to "reset **code**". Update
        `page.test.tsx` to assert both banners and that a 409 renders as a clean
        dialog error (not "unexpected error"). Token classes only.
      Traces: FR-6 (requirements.md), design.md §5.2, §5.3
      Files: frontend/app/(admin)/admin/users/page.tsx,
        frontend/app/(admin)/admin/users/page.test.tsx,
        frontend/components/admin/UsersTable.tsx (dialog copy only if needed)
      Verify: `cd frontend && npm test -- users/page && npm run build && npm run lint`
      Done when: each `action` shows the correct `aria-live` banner; dialog copy
        matches status and says "code" not "link"; AND IT MUST use only semantic
        design-token classes (no hex/arbitrary values); BUT it must NOT surface a
        raw 500/"unexpected error" for the invited-user path.
      Skills: ui-ux-pro-max, frontend-design, tailwind-design-system

- [x] T-6 Cognito email config: templates, SES identity, gate params, policy file  (deps: none)
      Scope: In `infra/10-data-auth/template.yaml`: add params `SenderEmail` (""),
        `EnableSesSending` ("false", Allowed true/false), `PortalUrl` (dev
        CloudFront default); conditions `HasSender` and
        `UseSes = HasSender AND EnableSesSending==true`; resource
        `SesSenderIdentity` (`AWS::SES::EmailIdentity`, Condition `HasSender`);
        `UserPool.EmailConfiguration` via `Fn::If UseSes` (DEVELOPER + `From` +
        `SourceArn`, else `AWS::NoValue`); `AdminCreateUserConfig.InviteMessageTemplate`
        (branded English HTML, inline styles, brand `#1F4E8C`, `{username}`+`{####}`,
        CTA `${PortalUrl}/login`); `VerificationMessageTemplate` (CONFIRM_WITH_CODE,
        branded, `{####}`, English, says "code"). Add
        `infra/10-data-auth/ses-cognito-send-policy.json` (the Cognito
        sending-authorization policy, §7.1).
      Traces: FR-1, FR-2, FR-3, NFR-6 (requirements.md), design.md §7.1, §8
      Files: infra/10-data-auth/template.yaml, infra/10-data-auth/ses-cognito-send-policy.json
      Verify: `AWS_PROFILE=IBD-DEV ./infra/scripts/validate.sh`
      Done when: `sam validate --lint` PASSes for 10-data-auth; templates contain
        both required placeholders and English copy; EmailConfiguration is
        `Fn::If`-gated; AND IT MUST keep `--profile IBD-DEV`/eu-west-1; BUT it must
        NOT send from a COGNITO_DEFAULT sender when `UseSes` is true, and MUST NOT
        cause a UserPool replacement (in-place update only).
      Skills: aws-serverless

- [x] T-7 Infra runbook: two-phase SES enablement + authorization + sandbox  (deps: T-6)
      Scope: Add an "Email (SES) setup" section to `infra/README.md` documenting:
        Phase A (deploy `SenderEmail=… EnableSesSending=false`, verify sender,
        `aws ses put-identity-policy … cognito-send`), Phase B (redeploy
        `EnableSesSending=true`), the sandbox caveat (verify recipients / request
        production access — DEP-2), the `SenderEmail`/`EnableSesSending`/`PortalUrl`
        params, and the CONFIRMED-reset code-entry limitation (§11).
      Traces: FR-1, DEP-1, DEP-2, NFR-6 (requirements.md), design.md §7.2, §7.3, §11
      Files: infra/README.md
      Verify: manual doc review — steps are copy-paste runnable with `--profile IBD-DEV`.
      Done when: the runbook lists both phases in order, the exact
        `put-identity-policy` command, and the sandbox + code-entry caveats; no
        step omits `--profile IBD-DEV`.
      Skills: aws-serverless

- [x] T-8 Full backend + frontend gate  (deps: T-3, T-5)
      Scope: Run the complete regression gates to confirm NFR-7 (nothing else
        broke), including the PII boundary and lambda-handler e2e.
      Traces: NFR-7 (requirements.md), design.md §10
      Files: — (verification only)
      Verify: `cd backend && npm test && npm run build && npm run lint` then
        `cd frontend && npm test && npm run build && npm run lint`
      Done when: all suites green incl. `pii-boundary.spec.ts` and
        `lambda-handler.e2e.spec.ts`; frontend static export builds (no
        static-export violation).
      Skills: nestjs-expert, vercel-react-best-practices

- [ ] T-9 OPERATOR: enable SES, deploy, live smoke  (deps: T-6, T-7, T-8)
      Scope: OPERATOR-run (holds IBD-DEV creds; not the agent loop). Execute the
        two-phase rollout (design §7.2): Phase A deploy + verify sender + attach
        authorization policy; Phase B redeploy `EnableSesSending=true`; then
        backend + frontend deploy. Live smoke: create a test user (sandbox-verified
        recipient) → confirm a **branded English invite with temp password lands
        in the inbox** and first sign-in works; "Reset pwd" on a
        FORCE_CHANGE_PASSWORD user → 2xx + invite re-sent banner (no 500); on a
        CONFIRMED user → 2xx + branded reset code email.
      Traces: FR-1, FR-2, FR-3, FR-4, FR-6, NFR-2 (requirements.md), design.md §7.2, §10
      Files: — (live AWS actions)
      Verify: operator commands from design §7.2 with `--profile IBD-DEV`;
        manual inbox receipt + UI confirmation of both reset outcomes.
      Done when: invite email received (branded, English, temp password); reset
        re-invite returns success with the re-invite banner; CONFIRMED reset email
        received; BUT no generic 500 for the invited-user reset. (Note per §11:
        CONFIRMED code has no in-app entry page — out of scope, tracked OQ-5.)
      Skills: aws-serverless

## Dependency Graph

```
T-1 ─┐
T-2 ─┴─▶ T-3 ─▶ T-4 ─▶ T-5 ─┐
                             ├─▶ T-8 ─▶ T-9
T-6 ─▶ T-7 ──────────────────┴────────▶ T-9
```
- T-1, T-2, T-6 have no deps (start in parallel).
- T-3 needs T-1 + T-2 (service + mapper). T-4 needs T-3 (contract). T-5 needs T-4.
- T-8 needs T-3 + T-5 (full gate). T-9 (operator) needs T-6 + T-7 + T-8.

## Testing & Verification Expectations
- Every task carries a runnable `Verify`; prefer targeted (`npm test -- <pattern>`)
  over full-suite until T-8.
- Backend gates: `npm test` / `npm run build` / `npm run lint`. Frontend:
  `npm test` / `npm run build` / `npm run lint` (+ `npx tsc --noEmit` for types).
- Infra: `./infra/scripts/validate.sh` (no-cost `sam validate --lint`), always
  `--profile IBD-DEV`.
- Keep `src/test/lambda-handler.e2e.spec.ts` and `src/test/pii-boundary.spec.ts`
  green (hard release gates, backend/CLAUDE.md).

## Execution Conventions
- Commits: `[SPEC:bugfix/admin-user-invite-and-reset] <message>`.
- No new PII field is introduced (email already allowlisted) — do not touch the
  PII allowlist or role-aware serializer.
- Any AWS action keeps `--profile IBD-DEV`, region `eu-west-1`.
- T-9 is operator-run against the live account; the agent loop stops at T-8.
