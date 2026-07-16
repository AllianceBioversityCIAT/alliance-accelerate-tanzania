# Requirements — Admin User Invite Email Delivery & Reset-Password Error

- Spec path: docs/specs/bugfix/admin-user-invite-and-reset/
- Status: Draft
- Author / Date: Claude / 2026-07-16
- Related: docs/prd.md (Admin console), docs/system-design/design.md §7 (design tokens), docs/detailed-design/detailed-design.md §4/§8 (Admin user management, PII), docs/specs/archive/2026-07-01-admin--user-management/ (parent spec — extends FR-3, FR-7)

## 1. Summary

The admin User Management console lets an Admin create Cognito users and reset
their passwords. Two production defects break this flow: (1) invited users never
receive the temporary-password invitation email (and when Cognito's default mail
does arrive it is unbranded default text, not the required English designed
email), and (2) clicking **Reset pwd** on a user who has never signed in
(`FORCE_CHANGE_PASSWORD`) returns a generic `500` error. This spec fixes email
**deliverability** (route Cognito email through Amazon SES from a verified
project sender), email **content/branding** (a designed English HTML invitation +
reset template), and the **reset flow** (status-aware behavior + specific error
mapping), so that every invited user reliably receives a professional,
actionable email and the reset action never surfaces a generic 500. It extends
the archived `admin/user-management` spec (FR-3 create/invite, FR-7 reset) and
advances detailed-design §4 (Admin user management).

## 2. Requirement Numbering & Writing Standards

- Functional requirements are numbered `FR-1 … FR-n`; non-functional `NFR-1 …`.
- Each requirement is atomic, testable, unambiguous; uses MUST / SHOULD / MAY (RFC 2119).
- Each requirement traces upward (parent user-management FR-3/FR-7, detailed-design §4) and downward (tasks in `tasks.md`).
- RBAC roles are `Public` / `Staff` / `Admin`. PII = `phone`, `email` (email is Admin-gated identity data — no new PII fields are introduced here).

## 3. Functional Requirements

### FR-1: Reliable email delivery via SES

- **Description:** The system MUST send Cognito account emails (invitation +
  password reset) through Amazon SES using a **verified project sender
  identity** (`EmailConfiguration.EmailSendingAccount = DEVELOPER`) in
  `eu-west-1` under the `IBD-DEV` profile, replacing the default
  `COGNITO_DEFAULT` mailer. The `From` address MUST be a project-controlled,
  SES-verified address.
- **Rationale / Source:** Parent FR-3 (invitation email) is functionally broken
  in production — `COGNITO_DEFAULT` mail from `no-reply@verificationemail.com`
  is rate-capped (~50/day) and quarantined by the recipient domain
  (`cgiar.org`, Microsoft-hosted). Root cause confirmed live (no SES identity;
  SES in sandbox).
- **Acceptance criteria (Given/When/Then):**
  - GIVEN the SES sender identity is verified AND the recipient is deliverable
    (verified in sandbox, or SES in production access), WHEN an Admin creates a
    user, THEN the invitation email is delivered to the recipient's inbox from
    the project sender address.
  - GIVEN the pool `EmailConfiguration`, WHEN inspected after deploy, THEN
    `EmailSendingAccount = DEVELOPER` with a `SourceArn`/`From` pointing at the
    verified identity.
  - BUT it MUST NOT send from `no-reply@verificationemail.com` or any
    `COGNITO_DEFAULT` sender.
  - AND IT MUST keep all AWS actions on `--profile IBD-DEV`, region `eu-west-1`.
- **PII/RBAC impact:** Email addresses are Admin-gated identity data. SES sends
  only to the target user's own address; no PII is exposed to Public. No new PII field.

### FR-2: Branded English invitation email

- **Description:** The Cognito **invitation** email (sent by `AdminCreateUser`)
  MUST be a designed HTML email in English containing: an ACCELERATE brand
  header, a short welcome paragraph, the user's **username (email)** and
  **temporary password**, and a clear call-to-action linking to the admin
  sign-in URL. It MUST be defined via the pool's
  `AdminCreateUserConfig.InviteMessageTemplate` (`EmailMessage` + `EmailSubject`).
- **Rationale / Source:** Parent FR-3 requires an invitation email; the user
  requires it to be a well-designed English email with a paragraph. Live pool
  has `InviteMessageTemplate = null` (bare default).
- **Acceptance criteria:**
  - GIVEN the deployed pool, WHEN an invitation email is generated, THEN it
    renders the branded HTML template with the `{username}` and `{####}`
    (temporary password) placeholders correctly substituted.
  - GIVEN the email body, WHEN reviewed, THEN it contains an English welcome
    paragraph, the temporary password, and a working sign-in link to the admin
    portal (CloudFront `/login`).
  - AND IT MUST use inline styles with brand colors from design tokens
    (primary `#1F4E8C`) — email clients do not support external CSS/Tailwind.
  - BUT it MUST NOT contain any recipient PII beyond the user's own email, and
    MUST NOT include any real secret other than the Cognito-generated temporary
    password placeholder.
- **PII/RBAC impact:** Sent only to the invited user. No Public exposure.

### FR-3: Branded English password-reset email

- **Description:** The password-**reset** email (Cognito
  `VerificationMessageTemplate` / forgot-password path used by
  `AdminResetUserPassword`) SHOULD carry consistent ACCELERATE branding and
  English copy, presenting the reset code/link clearly.
- **Rationale / Source:** Consistency with FR-2; the reset email suffers the
  same unbranded-default problem.
- **Acceptance criteria:**
  - GIVEN a `CONFIRMED` user, WHEN an Admin resets their password, THEN the user
    receives a branded English email with the reset code/link.
  - AND IT MUST substitute the `{####}` code placeholder correctly.
  - BUT it MUST NOT expose the previous or any plaintext long-lived password.
- **PII/RBAC impact:** Sent only to the target user. No new PII.

### FR-4: Status-aware reset / re-invite

- **Description:** `POST /api/v1/users/:id/password` MUST behave according to the
  target user's Cognito `UserStatus`: for `CONFIRMED` (and `RESET_REQUIRED`) it
  MUST issue `Admin­ResetUserPassword` (branded reset email); for
  `FORCE_CHANGE_PASSWORD` (invited, never signed in) it MUST **re-send the
  invitation** via `AdminCreateUser` with `MessageAction: 'RESEND'` (which
  re-issues a fresh temporary password), NOT `AdminResetUserPassword`.
- **Rationale / Source:** Root cause of the reported error — Cognito rejects
  `AdminResetUserPassword` for `FORCE_CHANGE_PASSWORD` with
  `NotAuthorizedException`. `RESEND` is the semantically correct operation and
  fixes the user's real need (get the temporary password again).
- **Acceptance criteria:**
  - GIVEN a user in `FORCE_CHANGE_PASSWORD`, WHEN an Admin triggers reset, THEN
    the invitation email is re-sent with a new temporary password and the API
    returns success (2xx).
  - GIVEN a user in `CONFIRMED`, WHEN an Admin triggers reset, THEN a branded
    reset email is sent and the API returns success (2xx).
  - AND IT MUST resolve the user's current status server-side (never trust the
    client) before choosing the operation.
  - BUT it MUST NOT return a generic 500 for the `FORCE_CHANGE_PASSWORD` case.
  - BUT it MUST NOT weaken the existing FR-10 allowlist serializer or leak any
    Cognito internals.
- **PII/RBAC impact:** Admin-only route (`@Roles('Admin')`); unchanged guard stack.

### FR-5: Specific error mapping for Cognito user-state errors

- **Description:** The Cognito error mapper MUST map `NotAuthorizedException`
  and `UnsupportedUserStateException` (and equivalent user-state errors) to a
  clear `4xx` HTTP status with a safe, actionable message, instead of collapsing
  to a generic `500`.
- **Rationale / Source:** `backend/src/users/cognito-error.mapper.ts` currently
  has no case for these, producing "An unexpected error occurred." — the exact
  symptom the Admin saw. Any residual state mismatch after FR-4 must still be legible.
- **Acceptance criteria:**
  - GIVEN a Cognito call throws `NotAuthorizedException` for a state reason,
    WHEN mapped, THEN the client receives a `4xx` (e.g. 409) with a safe message.
  - AND IT MUST NOT surface raw Cognito exception messages or internals (parent NFR-4, §6).
  - BUT it MUST NOT change the mapping of existing handled cases
    (`UsernameExistsException` 409, `UserNotFoundException` 404, etc.).
- **PII/RBAC impact:** None (error text is generic/safe).

### FR-6: Admin UI feedback distinguishes reset vs re-invite

- **Description:** The admin Users page MUST show a success banner appropriate to
  the operation performed: "Password reset email sent." for a `CONFIRMED` user
  and "Invitation re-sent with a new temporary password." for a
  `FORCE_CHANGE_PASSWORD` user. The confirm dialog copy SHOULD reflect the action
  (e.g. label/description adapts to the user's status). No generic 500 message
  is shown for the invited-user case.
- **Rationale / Source:** Parent FR-7 UX; user reported an error message. The
  UI must communicate the correct outcome using existing banner/`aria-live`
  patterns and design tokens.
- **Acceptance criteria:**
  - GIVEN an Admin resets a `FORCE_CHANGE_PASSWORD` user, WHEN the call
    succeeds, THEN a success banner states the invitation was re-sent.
  - GIVEN an Admin resets a `CONFIRMED` user, WHEN the call succeeds, THEN a
    success banner states the reset email was sent.
  - AND IT MUST announce via the existing `aria-live="polite"` region (WCAG 2.1 AA).
  - AND IT MUST use only semantic design-token classes (no hardcoded colors).
  - BUT it MUST NOT surface a raw 500/"unexpected error" for the invited-user path.
- **PII/RBAC impact:** Admin shell only.

## 4. Non-Functional Requirements

- **NFR-1 (Security / secrets):** No plaintext long-lived password is ever
  generated, returned, logged, or emailed by our code; only Cognito's own
  temporary-password mechanism is used. SES sender identity ARN is non-secret
  config; no static credentials are committed (parent NFR-2).
- **NFR-2 (Deliverability):** With the SES identity verified and the recipient
  deliverable, invitation email delivery success MUST be observable end-to-end
  (a real inbox receipt in dev smoke). SES sandbox limitation is documented, not
  silently ignored.
- **NFR-3 (Accessibility):** All new/changed admin UI meets WCAG 2.1 AA
  (labels, focus-visible, `aria-live` status). Email HTML uses AA-contrast text
  colors on its backgrounds.
- **NFR-4 (Error safety):** Error responses never leak Cognito internals
  (parent NFR-4); messages are generic-but-actionable.
- **NFR-5 (Cost):** SES usage at dev volume is negligible; no new standing cost
  beyond SES per-email (pennies). No new always-on resources.
- **NFR-6 (Infra discipline):** All IaC and AWS CLI use `--profile IBD-DEV`,
  region `eu-west-1`; the pool `EmailConfiguration` change is an in-place
  `UserPool` update (no replacement), validated via change set /
  `./infra/scripts/validate.sh`.
- **NFR-7 (Regression safety):** Backend release gates stay green
  (`npm test && npm run build && npm run lint`), including the lambda-handler
  e2e; `pii-boundary.spec.ts` remains green.

## 5. Data & Schema Impact

None. No Prisma model or field changes (Cognito is the source of truth for
users; no DB user table). No new PII field — email is already the sole
Admin-gated identity field. The PII allowlist is unchanged.

## 6. Out of Scope

- Custom email domain with DKIM/DMARC on `cgiar.org` or a project domain
  (a verified single-address SES identity is sufficient for dev).
- Cognito CustomMessage Lambda trigger (static templates suffice for one language).
- Multi-language email content (English only, per request).
- Any change to RBAC model, user list/create/edit/delete flows beyond the reset path.
- Requesting SES production access as a code change (it is an operator/DevOps
  action, noted as a dependency for real rollout).

## 7. Dependencies & Assumptions

- **DEP-1 (blocking, operator):** A project-controlled email address to verify
  as the SES sender identity in `IBD-DEV` / `eu-west-1`. Two operator actions are
  required: (a) click the SES verification link, and (b) attach the SES
  sending-authorization policy allowing the Cognito service principal
  (`email.cognito-idp.amazonaws.com`) to send through the identity — this policy
  is **not expressible in CloudFormation** and is applied via
  `aws ses put-identity-policy … --profile IBD-DEV` (see design §7.1/§7.2). Both
  precede flipping the pool to SES DEVELOPER mode.
- **DEP-2 (operator):** SES is in **sandbox** in this account — it delivers only
  to verified recipient addresses until production access is granted. Acceptable
  for dev (few internal users); production access should be requested before
  real rollout.
- **DEP-3:** Deploy uses the existing infra runbook order; the pool change is in
  the `10-data-auth` stack (`accelerate-tz-dev-data-auth`). Backend redeploy via
  the built template per `backend/CLAUDE.md`.
- **Assumption:** The admin sign-in URL for the invitation CTA is the CloudFront
  URL `/login` (resolved from stack outputs at template/build time).

## 8. Open Questions

- **OQ-1 (DEP-1):** Which exact sender address should be verified in SES?
  (e.g. a shared project mailbox the team controls.)
- **OQ-2:** Should the **Reset pwd** action button/label change per user status
  (e.g. show "Resend invite" for `FORCE_CHANGE_PASSWORD`)? Default: adapt the
  confirm-dialog copy and success banner; keep a single row action.
- **OQ-3:** Exact email copy and whether to embed the ACCELERATE logo (hosted
  image URL vs. text wordmark). Default: text/wordmark header with brand color,
  no external image (deliverability + no asset hosting).
- **OQ-4:** Should SES production-access request be tracked in this spec's tasks
  as a documented operator step, or deferred to a separate ops ticket? Default:
  document as an operator step in the infra runbook; not a code task.
- **OQ-5 (from design review):** A CONFIRMED user's reset uses
  `CONFIRM_WITH_CODE`, which emails a numeric code — but the app has **no
  forgot-password/code-entry page** today, so that reset dead-ends in the UI
  (pre-existing). The invite/`FORCE_CHANGE_PASSWORD` path is fully usable. Building
  the code-entry page is **out of scope here** (net-new UI); recommended as a
  fast-follow spec. Confirm this scope split is acceptable. (See design §11.)

---
**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email`. All AWS commands use `--profile IBD-DEV`, region `eu-west-1`.
