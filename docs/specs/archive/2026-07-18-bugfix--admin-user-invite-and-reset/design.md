# Design — Admin User Invite Email Delivery & Reset-Password Error

- Spec path: docs/specs/bugfix/admin-user-invite-and-reset/
- Status: Draft
- Traces requirements: FR-1..FR-6, NFR-1..NFR-7 from this spec's requirements.md

## 1. Approach Overview

Three layers change, each fixing one root cause, all within the mandated
architecture (Cognito in the `10-data-auth` SAM stack · NestJS on Lambda ·
Next.js static export):

1. **Infra / Cognito (FR-1, FR-2, FR-3):** In `infra/10-data-auth/template.yaml`,
   route Cognito email through **Amazon SES** (`EmailSendingAccount = DEVELOPER`)
   from a verified project sender, and add branded English HTML templates for the
   **invitation** (`AdminCreateUserConfig.InviteMessageTemplate`) and the
   **reset code** (`VerificationMessageTemplate`). The switch is gated by
   `SenderEmail` + `EnableSesSending` parameters (conditions `HasSender` /
   `UseSes`), so the default preserves today's `COGNITO_DEFAULT` behavior — a
   safe, reversible **two-phase** rollout. An `AWS::SES::EmailIdentity` resource
   tracks the sender in IaC; the two operator steps are (a) verify the sender
   identity and (b) attach the SES sending-authorization policy that lets the
   Cognito service principal send through it (CloudFormation can't express that
   policy — §7.1). The pool flips to DEVELOPER only in phase two, after both
   are done (DEP-1).

2. **Backend (FR-4, FR-5):** `UsersService.resetPassword` becomes **status-aware**
   — it first reads the target's Cognito `UserStatus`, then either
   `AdminResetUserPassword` (CONFIRMED / RESET_REQUIRED) or re-sends the invite
   via `AdminCreateUser` with `MessageAction: 'RESEND'` (FORCE_CHANGE_PASSWORD),
   returning which action occurred. `cognito-error.mapper.ts` gains explicit
   `NotAuthorizedException` / `UnsupportedUserStateException` → 409 mapping so no
   state error can collapse to a generic 500.

3. **Frontend (FR-6):** The reset endpoint returns the action taken; the Users
   page shows the matching success banner ("reset email sent" vs "invitation
   re-sent") and the confirm dialog adapts its copy to the user's status. Pure
   token-styled UI, existing `aria-live` banner and `ConfirmDialog`.

```
Admin ──"Reset pwd"──▶ POST /api/v1/users/:id/password
                         │
                         ├─ AdminGetUser → status?
                         │     CONFIRMED / RESET_REQUIRED ─▶ AdminResetUserPassword ─▶ SES reset email
                         │     FORCE_CHANGE_PASSWORD       ─▶ AdminCreateUser(RESEND) ─▶ SES invite email
                         └─ 200 { action: 'RESET' | 'REINVITE' } ─▶ UI banner
```

## 2. Data Model Changes

None. Cognito remains the source of truth for users (no Prisma user table). No
new entity, field, or migration. No new PII field — the PII allowlist is
unchanged (email remains the only Admin-gated identity field).

## 3. API Surface & Contracts

Only one endpoint's contract changes; all others are untouched.

### `POST /api/v1/users/:id/password` — reset **or** re-invite (FR-4, FR-6)

- **Auth/role:** `@Roles('Admin')` (unchanged guard stack: `JwtAuthGuard` +
  `RolesGuard`).
- **Request:** no body (path param `:id` = Cognito Username/sub).
- **Response — CHANGED:** from `204 No Content` to **`200 OK`** with a small envelope:
  ```json
  { "action": "RESET" }        // CONFIRMED / RESET_REQUIRED → AdminResetUserPassword
  { "action": "REINVITE" }     // FORCE_CHANGE_PASSWORD → AdminCreateUser RESEND
  ```
  `action` is a string-literal union `'RESET' | 'REINVITE'`. No password or
  secret is ever included (parent FR-10 allowlist, NFR-1). **The controller MUST
  set `@HttpCode(200)` explicitly** — a NestJS `@Post` handler defaults to `201`,
  so merely removing `@HttpCode(204)` would return 201 and violate this contract.
- **Errors:**
  - `404` — `UserNotFoundException` (unchanged).
  - `409` — residual user-state conflict (`NotAuthorizedException` /
    `UnsupportedUserStateException`) with a safe message (FR-5).
  - `429` — `TooManyRequestsException` (unchanged).
  - `500` — only for genuinely unexpected errors (generic message, no leak).
- **PII projection:** unchanged; the endpoint returns no user attributes.

No other route (`GET /users`, `POST /users`, `PATCH /users/:id`,
`PATCH /users/:id/role`, `DELETE /users/:id`) changes shape. `POST /users`
(create) is unchanged in contract but its emitted email is now branded + SES-sent
(behavioral, not contractual).

## 4. Backend Design

Module: `backend/src/users/` (existing). No new module.

### 4.1 `users.service.ts` — `resetPassword` (FR-4)

Replace the current single-command method with a status-aware flow:

```
async resetPassword(id): Promise<{ action: 'RESET' | 'REINVITE' }>
  1. AdminGetUser({ UserPoolId, Username: id })  → status
  2. switch (status):
       'FORCE_CHANGE_PASSWORD':
          AdminCreateUser({ UserPoolId, Username: <email>, MessageAction: 'RESEND',
                            DesiredDeliveryMediums: ['EMAIL'] })
          return { action: 'REINVITE' }
       'CONFIRMED' | 'RESET_REQUIRED' (default):
          AdminResetUserPassword({ UserPoolId, Username: id })
          return { action: 'RESET' }
  3. catch → mapCognitoError(err)
```

Notes:
- `MessageAction: 'RESEND'` uses `Username: id` — the route param already holds
  the canonical Cognito Username (the sub/UUID), which `AdminCreateUser` accepts
  directly and which the immediately-preceding `AdminGetUser` just validated. Do
  NOT resolve/pass the `email` alias attribute: in this pool
  (`UsernameAttributes: [email]`) the real Username is the UUID, and resolving
  the alias adds a needless null/renamed-attribute failure mode for no gain.
  RESEND re-issues a fresh temporary password and resets its expiry — exactly the
  invited-user need.
- Server-side status resolution satisfies "never trust the client" (FR-4).
- No plaintext password handled (NFR-1).
- `AdminGetUserCommand` is already imported and used by `get()`.

### 4.2 `cognito-error.mapper.ts` (FR-5)

Add mapping for the **state** errors, but scope the ambiguous
`NotAuthorizedException` narrowly so it does NOT mask server-side IAM/credential
failures:

```
case 'UnsupportedUserStateException':
  throw new ConflictException(
    'This user is not in a state where that action is allowed. Please refresh and try again.'
  );
case 'NotAuthorizedException':
  // Cognito reuses NotAuthorizedException for BOTH user-state reasons and the
  // Lambda's own missing IAM permission / bad credentials. Only downgrade to 409
  // when the message indicates a user-state cause; otherwise fall through to the
  // generic 500 so a real authorization misconfig is not masked (NFR-4).
  if (isUserStateNotAuthorized(err)) {
    throw new ConflictException(
      'This user is not in a state where that action is allowed. Please refresh and try again.'
    );
  }
  break; // → generic 500
```

- `isUserStateNotAuthorized(err)` inspects the SDK error message for the
  user-state signature (e.g. contains "state") and returns false for
  credential/permission phrasing. Conservative: unknown → false → 500.
- 409 is the right class for the state case (conflict), consistent with the
  module's other conflict mapping. Messages are safe/actionable, leak nothing
  (parent NFR-4). Existing mappings unchanged (regression-safe).
- **Defense in depth:** FR-4's status branch already avoids the common state
  error (it never calls `AdminResetUserPassword` on a `FORCE_CHANGE_PASSWORD`
  user); this mapping only catches the residual race (status changed between
  `AdminGetUser` and the action).

### 4.3 `users.controller.ts` (FR-4)

`resetPassword` route: **replace `@HttpCode(204)` with `@HttpCode(200)`** (NOT
just delete it — see §3) and return the service's `{ action }` object directly.
Method stays `@Post(':id/password')`, `@Roles('Admin')` inherited at class level.

### 4.4 Tests (backend)

- `users.service.spec.ts`: mock Cognito client; assert branch selection by
  status (RESET vs REINVITE) and the exact SDK commands issued (RESEND uses
  `Username: id`).
- `cognito-error.mapper` coverage: `UnsupportedUserStateException` → 409;
  `NotAuthorizedException` with a state message → 409, with a
  credential/permission message → generic 500; unchanged cases still map as
  before.
- **Update the existing breaking assertion:** `backend/src/users/users.e2e.spec.ts`
  currently asserts `.expect(204)` for the reset route (~line 195/199) — change
  it to expect `200` + `{ action }`. This is a hard NFR-7 gate.
- Handler-level e2e (`*.e2e.spec.ts` convention per `backend/CLAUDE.md`): the
  reset route returns `200 { action }` through the real `lambda.ts` handler for
  both a CONFIRMED and a FORCE_CHANGE_PASSWORD user (mock the Cognito client
  status).

## 5. Frontend Design

Files: `frontend/lib/api/users.ts`, `frontend/app/(admin)/admin/users/page.tsx`,
`frontend/components/admin/UsersTable.tsx` (dialog copy only if needed).

### 5.1 API client (`lib/api/users.ts`) — FR-6

- `resetUserPassword(id, token)` return type changes from `Promise<void>` to
  `Promise<{ action: 'RESET' | 'REINVITE' }>`; drop `expectEmpty: true` and read
  the JSON body. Type mirrors the backend union **exactly** (per
  `frontend/CLAUDE.md` — no loosening to `string`).
- **Update the existing breaking test:** `frontend/lib/api/users.test.ts` has a
  `resetUserPassword()` describe block (~line 372) asserting `204 → void` via a
  `make204()` mock — update it to mock a `200 { action }` response and assert the
  returned object. Hard NFR-7 gate.

### 5.2 Users page (`app/(admin)/admin/users/page.tsx`) — FR-6

- `handleResetConfirm`: use the returned `action` to pick the banner:
  - `REINVITE` → `showSuccess('Invitation re-sent with a new temporary password.')`
  - `RESET`    → `showSuccess('Password reset email sent.')`
- Banner uses the existing `aria-live="polite"` `role="status"` region and
  current token classes (`bg-highlight/20 border-highlight/40 text-success`) —
  no new colors (design tokens, WCAG 2.1 AA).
- Error path unchanged: `ApiError.message` (now a clean 409, never a raw 500)
  renders in the confirm dialog's error slot.

### 5.3 Confirm dialog copy (OQ-2 default)

Keep a single **Reset pwd** row action. `ConfirmDialog` description adapts to the
target's `user.status`: for `FORCE_CHANGE_PASSWORD` → "This user hasn't signed in
yet. This will re-send their invitation with a new temporary password."; for
`CONFIRMED` → "This will email the user a password-reset **code** to set a new
password." Title/label remain "Reset pwd". No new component.

**Accuracy fix (W4):** the current copy says "reset **link**", but
`AdminResetUserPassword` with `CONFIRM_WITH_CODE` emails a numeric **code**, not
a link — the copy and the FR-3 email template must both say "code". See §11
(Known limitation) for the code-entry-flow constraint on CONFIRMED users.

### 5.4 Tests

- `page.test.tsx`: mock `resetUserPassword` to return each `action`; assert the
  correct banner text; assert a 409 error renders in the dialog (no "unexpected
  error").

## 6. Security & RBAC

- Route stays Admin-only (`@Roles('Admin')`); server is the authoritative gate.
- No plaintext password generated/returned/logged/emailed by our code — only
  Cognito's temporary-password + reset-code mechanisms (NFR-1).
- Error messages remain generic-but-safe; no Cognito internals leak (NFR-4).
- SES sender identity ARN and `SenderEmail`/`PortalUrl` params are non-secret
  config; no static credentials committed (parent NFR-2).
- `pii-boundary.spec.ts` and the FR-10 allowlist serializer are untouched and
  stay green (NFR-7).

## 7. Infrastructure / Deployment

All IaC + CLI use `--profile IBD-DEV`, region `eu-west-1` (NFR-6).

### 7.1 `infra/10-data-auth/template.yaml` changes

**New parameters:**
```yaml
SenderEmail:
  Type: String
  Default: ""        # empty → keep COGNITO_DEFAULT (safe no-op)
  Description: Project-controlled sender address to verify in SES (DEP-1). Empty keeps the default Cognito mailer.
EnableSesSending:
  Type: String
  Default: "false"   # Phase-B gate — only flip the pool to DEVELOPER after the
  AllowedValues: ["true", "false"]   # identity is verified AND authorized (§7.2).
  Description: When "true" (and SenderEmail set), sets EmailConfiguration to DEVELOPER. Kept "false" for Phase A.
PortalUrl:
  Type: String
  Default: "https://d3idqvvg0xa1r7.cloudfront.net"   # current dev CloudFront URL (sign-in CTA base)
  Description: Admin portal base URL used in the invitation email CTA (/login is appended).
```

**New conditions:**
- `HasSender: !Not [!Equals [!Ref SenderEmail, ""]]` — gates the
  `AWS::SES::EmailIdentity` resource (create the identity in Phase A).
- `UseSes: !And [!Condition HasSender, !Equals [!Ref EnableSesSending, "true"]]`
  — gates the DEVELOPER `EmailConfiguration` (Phase B only). This two-gate split
  is what makes the verify-then-configure rollout in §7.2 possible.

**New resource (conditional):**
```yaml
SesSenderIdentity:
  Type: AWS::SES::EmailIdentity
  Condition: HasSender      # created in Phase A (before the DEVELOPER switch)
  Properties:
    EmailIdentity: !Ref SenderEmail
```
(Creating the identity sends AWS's verification email; the identity resource
reaches CREATE_COMPLETE immediately — verification itself is the async operator
step, DEP-1.)

**CRITICAL — SES sending-authorization policy (was missing; blocking).**
`EmailSendingAccount: DEVELOPER` means Cognito sends *through your* SES identity,
which AWS permits **only** if that identity carries a sending-authorization
policy naming the Cognito service principal. When you configure SES email in the
Cognito **console** this policy is added automatically; via
**API/CloudFormation it is NOT** — Cognito validates it at
`SetUserPoolEmailConfiguration` time and rejects the update
(`InvalidEmailRoleAccessPolicyException`) if absent, or (best case) the pool
updates but every send fails authorization at runtime — i.e. FR-1 stays broken.

The required policy:
```json
{
  "Version": "2008-10-17",
  "Statement": [{
    "Sid": "AllowCognitoToSend",
    "Effect": "Allow",
    "Principal": { "Service": "email.cognito-idp.amazonaws.com" },
    "Action": ["ses:SendEmail", "ses:SendRawEmail"],
    "Resource": "<sender identity ARN>",
    "Condition": {
      "StringEquals": { "aws:SourceAccount": "<account id>" },
      "ArnEquals":    { "aws:SourceArn": "<user-pool ARN>" }
    }
  }]
}
```
**CloudFormation cannot express this natively:** `AWS::SES::EmailIdentity` has no
identity-policy property, and there is **no `AWS::SES::IdentityPolicy` resource**
(it is the SES v1 `PutIdentityPolicy` API). Two options — see ADR in §8:

- **Option INFRA-1 (chosen): documented operator CLI step.** After the identity
  is verified and before/with enabling DEVELOPER, the operator runs
  `aws ses put-identity-policy --identity <addr> --policy-name cognito-send
  --policy file://policy.json --profile IBD-DEV --region eu-west-1`. Simplest,
  no custom-resource Lambda, fits the existing operator-run runbook boundary.
- **Option INFRA-2 (alternative): a CloudFormation custom resource** (small
  inline Lambda) that calls `PutIdentityPolicy`/`DeleteIdentityPolicy`. Fully
  templated but adds a Lambda + IAM role for one API call. Deferred.

This also forces a **two-phase rollout** (§7.2): the policy needs the user-pool
ARN while the pool's DEVELOPER `EmailConfiguration` needs the authorized
identity — a circular dependency that a single change set cannot satisfy.

**`UserPool` additions:**
- `EmailConfiguration` (conditional via `Fn::If UseSes`):
  ```yaml
  EmailConfiguration: !If
    - UseSes
    - EmailSendingAccount: DEVELOPER
      From: !Sub "ACCELERATE Seed Registry <${SenderEmail}>"
      SourceArn: !Sub "arn:aws:ses:${AWS::Region}:${AWS::AccountId}:identity/${SenderEmail}"
    - !Ref "AWS::NoValue"     # unset → COGNITO_DEFAULT
  ```
- `AdminCreateUserConfig.InviteMessageTemplate` (always set):
  ```yaml
  InviteMessageTemplate:
    EmailSubject: "Your ACCELERATE Seed Registry admin account"
    EmailMessage: <branded HTML with {username} and {####}>
  ```
- `VerificationMessageTemplate` (reset/verification email, always set):
  ```yaml
  VerificationMessageTemplate:
    DefaultEmailOption: CONFIRM_WITH_CODE
    EmailSubject: "Your ACCELERATE Seed Registry verification code"
    EmailMessage: <branded HTML with {####}>
  ```

**Email HTML (inline styles, brand tokens — FR-2/FR-3, NFR-3):** table-based
layout (email-client-safe), header bar in primary `#1F4E8C` with the "ACCELERATE"
wordmark (text, no external image per OQ-3 default), white card on `#F7F7F7`,
body text `#333333` / muted `#666666`, a primary-colored CTA button linking to
`${PortalUrl}/login`, and the `{username}` / `{####}` placeholders. English copy.
AA-contrast checked (primary on white ~7:1; white on primary for the button).

### 7.2 Deploy order & commands — **two-phase SES enablement**

Validate first (no-cost): `./infra/scripts/validate.sh`.

**Phase A — create + verify + authorize the sender (no DEVELOPER switch yet).**
The email templates (`InviteMessageTemplate`, `VerificationMessageTemplate`) are
safe to deploy immediately; the DEVELOPER `EmailConfiguration` is gated so it
does NOT flip until Phase B. Concretely, Phase A deploys with `SenderEmail`
provided but the `UseSes` email-config switch held back — implemented via a
second gate parameter `EnableSesSending` (default `"false"`) so
`EmailConfiguration` only applies when `EnableSesSending == "true"` AND
`SenderEmail != ""`. (This avoids the circular dependency the single-deploy path
hits.)
   1. Deploy `10-data-auth` with `SenderEmail=<addr> EnableSesSending=false`
      (creates the `AWS::SES::EmailIdentity`, installs templates; pool email
      stays `COGNITO_DEFAULT`).
   2. **Operator:** click the SES verification link in the sender mailbox
      (DEP-1). In **SES sandbox** (DEP-2), also verify each dev recipient
      address (or request production access).
   3. **Operator:** attach the Cognito sending-authorization policy (§7.1
      Option INFRA-1):
      `aws ses put-identity-policy --identity <addr> --policy-name cognito-send
      --policy file://infra/10-data-auth/ses-cognito-send-policy.json
      --profile IBD-DEV --region eu-west-1`
      (the policy file uses the account id + the pool ARN from stack outputs).

**Phase B — flip the pool to DEVELOPER.**
   4. Re-deploy `10-data-auth` with `SenderEmail=<addr> EnableSesSending=true`
      — an **in-place** `UserPool` update (no replacement) that sets
      `EmailConfiguration: DEVELOPER`. Now succeeds because the identity is
      verified AND authorized.
      ```
      sam deploy --template infra/10-data-auth/template.yaml \
        --stack-name accelerate-tz-dev-data-auth \
        --parameter-overrides VpcId=... DevCidr=... \
          SenderEmail=<addr> EnableSesSending=true \
        --profile IBD-DEV --region eu-west-1
      ```

**Phase C — app deploys (unchanged order).**
   5. **Backend:** `npm run build` → `sam build` → `sam deploy` the **built**
      template (`backend/CLAUDE.md`), preserving the live `AllowedOrigin`.
   6. **Frontend:** `AWS_PROFILE=IBD-DEV infra/scripts/deploy-frontend.sh`.

Reversible: re-deploy with `EnableSesSending=false` reverts the pool to
`COGNITO_DEFAULT`. Caveat (W-fallback): the branded table-HTML templates render
best via SES; under `COGNITO_DEFAULT` the default mailer's HTML handling is
limited, so a reverted state still *sends* but may look degraded — acceptable for
a rollback state, noted in the runbook.

### 7.3 Runbook

Add an "Email (SES) setup" subsection to `infra/README.md` documenting DEP-1
(verify sender), DEP-2 (sandbox: verify recipients / request production access),
and the `SenderEmail` / `PortalUrl` parameters.

## 8. Decision Records (ADR-style)

### Decision: Route Cognito email via SES `DEVELOPER` (not COGNITO_DEFAULT, not a CustomMessage Lambda)
- **Context:** Invites don't reach `cgiar.org` inboxes; `COGNITO_DEFAULT` sends
  from `no-reply@verificationemail.com` (rate-capped, poor reputation,
  quarantined). Confirmed live: no SES identity, SES in sandbox.
- **Options:** (A) keep COGNITO_DEFAULT + only add templates — doesn't fix
  delivery; (B) **SES DEVELOPER + verified sender + static templates**;
  (C) SES + a `CustomMessage` Lambda trigger for fully programmatic email.
- **Decision:** B. It fixes deliverability and branding at the root with static
  templates; C adds a Lambda + trigger for no added value at one language.
- **Consequences:** One operator step (verify sender); sandbox limits recipients
  until production access. Gated by `SenderEmail`/`UseSes` for a safe, reversible
  rollout.

### Decision: `MessageAction: 'RESEND'` for FORCE_CHANGE_PASSWORD (not AdminResetUserPassword)
- **Context:** `AdminResetUserPassword` is invalid for `FORCE_CHANGE_PASSWORD`
  (throws `NotAuthorizedException`) — the reported 500's root cause. Such users
  never consumed their first temporary password.
- **Options:** (A) block the action with a message; (B) **re-send the invite via
  AdminCreateUser RESEND** (fresh temp password); (C) force-confirm then reset.
- **Decision:** B — it matches the admin's actual intent (get the user their
  credentials again) and is Cognito's supported operation for that state.
- **Consequences:** The reset endpoint becomes status-aware and returns which
  action ran, so the UI can report it accurately (FR-6).

### Decision: Change the reset endpoint from 204 to 200 `{ action }`
- **Context:** FR-6 needs the UI to distinguish reset vs re-invite; the client
  otherwise can't know which happened.
- **Options:** (A) keep 204, have the client re-fetch status and infer — racy,
  extra call; (B) **return `{ action }`** in a 200 body.
- **Decision:** B — one authoritative signal from the server, exact-union typed
  on the client.
- **Consequences:** Minor contract change to one endpoint; client + tests updated.

### Decision: Authorize Cognito→SES via a documented `put-identity-policy` operator step, and split the rollout into two phases
- **Context:** DEVELOPER mode requires an SES identity sending-authorization
  policy for the `email.cognito-idp.amazonaws.com` principal; CloudFormation
  cannot express it (`AWS::SES::EmailIdentity` has no policy property, no native
  `AWS::SES::IdentityPolicy` resource). The policy needs the pool ARN while the
  pool's DEVELOPER config needs the authorized identity — circular in one deploy.
- **Options:** (A) **documented `aws ses put-identity-policy` operator step +
  two-phase deploy (verify/authorize, then flip DEVELOPER)**; (B) a CFN custom
  resource (inline Lambda) calling `PutIdentityPolicy`.
- **Decision:** A (INFRA-1). It matches the existing "operator runs the live AWS
  steps" boundary in the infra runbook, needs no custom-resource Lambda/IAM, and
  the `EnableSesSending` gate makes the two phases clean and reversible. B stays
  documented as a future full-IaC option.
- **Consequences:** One extra operator command (`put-identity-policy`) and a
  two-deploy enablement; the policy JSON lives at
  `infra/10-data-auth/ses-cognito-send-policy.json` and is referenced by the
  runbook. Without this step delivery does not work — it is the load-bearing fix.

### Decision: Text wordmark in email, gated `SenderEmail`, parameterized `PortalUrl`
- **Context:** Emails can't use Tailwind tokens or reliably render external
  images; the sign-in link needs the portal URL that lives in a later stack.
- **Decision:** Inline-styled HTML with a text "ACCELERATE" wordmark (OQ-3
  default, best deliverability), `SenderEmail` param gating the SES switch, and a
  `PortalUrl` param (default = current dev CloudFront URL) for the CTA.
- **Consequences:** No asset hosting; portal URL is overridable without code change.

## 9. Risks & Mitigations

- **R1 — SES sandbox blocks non-verified recipients (DEP-2).** Mitigation:
  verify dev recipients for testing; document the production-access request for
  rollout. Not a code blocker.
- **R2 — Deploying with `SenderEmail` before the sender is verified/authorized →
  invites fail to send OR the DEVELOPER update is rejected.** Mitigation: the
  two-phase rollout (§7.2) + the `EnableSesSending` gate — Phase A creates &
  verifies & authorizes the identity while the pool stays `COGNITO_DEFAULT`;
  Phase B flips to DEVELOPER only after. `EnableSesSending=false` (or
  `SenderEmail=""`) keeps the old mailer.
- **R2b — Missing SES sending-authorization policy (was the top severe gap).**
  Mitigation: the mandatory `put-identity-policy` operator step in Phase A
  (§7.1/§7.2), captured in the runbook and the tasks; deploy-time
  `InvalidEmailRoleAccessPolicyException` is the tripwire if skipped.
- **R3 — `EmailConfiguration` update semantics.** Mitigation: it's an in-place
  `UserPool` update (no replacement); confirm via change set before applying.
- **R4 — RESEND edge cases (e.g. user later CONFIRMED between fetch and action).**
  Mitigation: any residual state error is caught and mapped to a clean 409
  (FR-5), never a 500.
- **R5 — Lambda body-parsing / bootstrap regression.** Mitigation: keep
  `src/test/lambda-handler.e2e.spec.ts` green (per `backend/CLAUDE.md`).

## 10. Test Plan Outline

| FR | Level | Test |
|---|---|---|
| FR-4 | Unit | `users.service.spec.ts`: status → RESET vs REINVITE command selection. |
| FR-4 | E2E | Handler-level `*.e2e.spec.ts`: `POST /users/:id/password` → 200 `{action}`. |
| FR-5 | Unit | mapper: `NotAuthorizedException`/`UnsupportedUserStateException` → 409; existing cases unchanged. |
| FR-6 | Unit (FE) | `page.test.tsx`: each `action` → correct banner; 409 renders as clean error. |
| FR-1/2/3 | Infra + manual | `./infra/scripts/validate.sh` PASS; post-deploy **inbox receipt** of branded invite + reset (dev smoke, DEP-1/2 satisfied). |
| NFR-7 | Gate | `npm test && npm run build && npm run lint` green (backend + frontend); `pii-boundary.spec.ts` green. |

No PII-omission change needed (endpoint returns no attributes); existing PII
tests must remain green.

## 11. Known Limitation — CONFIRMED-user reset code has no in-app entry page

`AdminResetUserPassword` (the CONFIRMED path) uses the forgot-password flow with
`VerificationMessageTemplate` `CONFIRM_WITH_CODE`, which emails a numeric **code**
the user must enter on a "set new password" screen (`confirmResetPassword`
Amplify call). The app currently ships **no** forgot-password/code-entry page
(`frontend/app/(public)/login` only; verified — no `confirmResetPassword` usage).
Consequences and scope decision:

- **The invite / FORCE_CHANGE_PASSWORD path is fully usable** — `auth-client.ts`
  already handles the `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED` challenge, so
  an invited user signs in with the temporary password and sets a new one. This
  is the primary reported flow (FR-2, FR-4 REINVITE).
- **The CONFIRMED reset code currently dead-ends** in the UI. This is
  **pre-existing** behavior (the old endpoint already called
  `AdminResetUserPassword`); this spec makes the email *correct and branded* but
  does not, by itself, add the code-entry screen.
- **Decision:** Building the forgot-password/code-entry page is **out of scope**
  for this bugfix (it is net-new UI, not part of "invite email + reset error").
  Tracked as a follow-up (`OQ-5` below) and called out so it is a conscious
  choice, not an accidental gap. The reset email copy/template is corrected to say
  "code" (not "link") so the email itself is truthful even before the page exists.
- **OQ-5 (new):** Should a forgot-password/code-entry page be a fast-follow
  spec? Recommended yes, but separate. Meanwhile CONFIRMED users can be
  re-enabled by an admin via re-invite semantics only if disabled/recreated —
  document this operational caveat in the runbook.
