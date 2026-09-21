# Requirements — Account-access emails that actually arrive

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `auth/account-access-emails` |
| Jira | **ATP-71** (subtask of ATP-49) |
| Date | 2026-09-21 |
| Author | AKILI (Leader) on behalf of Daniela Gómez |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting approval |
| Proposal | [`proposal.md`](./proposal.md) |
| **Depends on** | **ATP-67 / PR #80** — `PUBLIC_APP_BASE_URL` and `getPublicAppBaseUrl()`. ⚠️ Open at the time of writing; the branch is cut from it, so the code is present here but not yet on `main`. |
| **Parallel-safe** | **no** — `users`, `mail`, and `10-data-auth` are shared surfaces |
| Depth | **Standard** |
| Branch | `feat/atp-71-account-access-emails` |

## 2. Summary

Two account-access emails do not reach anyone. An invitation is never sent at all; a password reset is sent over a channel that does not reliably deliver. Both must work unattended, through the channel this project already uses successfully for every other email.

**This spec is delivered in two phases**, split by who generates the credential:

| Phase | Flow | Ships on an ordinary merge? |
|---|---|---|
| **1** | Admin invitation, admin-initiated reset | **Yes** — no infrastructure change |
| **2** | `/forgot-password` | **No** — needs `DEPLOY_INFRA=true` |

## 3. Requirement Numbering & Writing Standards

Follows `docs/specs/general-setup/requirements.md`. Requirements are `FR-<n>` / `NFR-<n>`; scenarios use `GIVEN` / `WHEN` / `THEN`, with `BUT it must NOT` for negative constraints and `AND IT MUST` for boundary conditions. Anchors are symbols and section titles, never `file:line` (**KZ-009**).

**One factual claim in this document is explicitly sourced rather than asserted** (**KZ-011**): the statement that Cognito's `CustomEmailSender` trigger can intercept the ForgotPassword message is a claim about a third party. It is **unverified at authoring time** and FR-6 requires it to be verified before Phase 2 is designed in detail. Nothing else here depends on it.

## 4. Glossary

| Term | Meaning |
|---|---|
| **Microservice** | The OneCGIAR notification microservice reached over RabbitMQ; `MailService`'s `microservice` transport. Already delivers OTPs, receipts, approvals, rejections. |
| **`COGNITO_DEFAULT`** | Cognito's built-in mailer, `no-reply@verificationemail.com`. Shared, 50 messages/day, poor deliverability to `@cgiar.org`. |
| **Invitation** | The email a newly created Staff/Admin user receives. |
| **Admin-initiated reset** | An administrator resetting another user's password from the admin console (`UsersService.resetPassword`). |
| **Self-service reset** | A user resetting their own password from `/forgot-password` (Cognito `ForgotPassword`). |
| **Credential handoff** | Today's manual route: the temporary password is shown to the admin, who relays it out of band. |

## 5. System Context & Scope

### 5.1 Current behaviour

| Flow | Sends mail? | Through | Status |
|---|---|---|---|
| Invitation (`UsersService.create`) | **No** — `MessageAction: 'SUPPRESS'` | — | Deliberate workaround; manual handoff |
| Admin reset (`UsersService.resetPassword`) | **No** — `AdminSetUserPassword`, no message action | — | Same |
| Self-service reset (`/forgot-password`) | **Yes** | `COGNITO_DEFAULT` | ⚠️ Live, unreliable, silent |
| Registration OTP, receipt, approval, rejection | **Yes** | Microservice | Working |

The self-service row was a **recorded decision**, not an oversight — `docs/specs/enhancement/email-notification-microservice/requirements.md` §6 excludes it with *"Stays on `COGNITO_DEFAULT` (50/day). **User decision.**"* This spec revisits that decision.

### 5.2 In scope

`backend/src/users/**` · `backend/src/mail/**` · the users endpoints' response contract · the admin credential-handoff UI · `/forgot-password` delivery · retirement of the Cognito `InviteMessageTemplate` and `PortalUrl`.

## 6. Stakeholders / Personas

| Persona | Role (`docs/prd.md` §3) | Interest |
|---|---|---|
| **Administrator** | `Admin` | Stops relaying credentials by hand; needs to know when the email did not go out. |
| **Staff / Admin invitee** | `Staff` / `Admin` | Receives a usable invitation for the first time. |
| **Any signed-up user** | `Staff` / `Admin` | Can recover their own account without an administrator. |
| **Operator** | — | Needs a send failure to be visible in logs without the credential appearing there. |

## 7. Functional Requirements

### FR-1: An invited user receives an invitation email

- **Description:** When an administrator creates a user, the system SHALL send that user an email containing the temporary password and a link to the sign-in screen.
- **Rationale / Source:** ATP-71; proposal O-1. Replaces the manual handoff introduced by `admin-user-invite-and-reset` (archived), whose premise — that Cognito's mail is unusable — no longer forces the outcome now that a working channel exists.
- **Phase:** 1
- **PII/RBAC impact:** The recipient's email address and a single-use credential. `Admin`-guarded route only. The credential is **not** actor PII and is not governed by `pii-consent.policy.ts`; it is governed by NFR-1 below.

#### Scenario: A new user is created

- GIVEN an administrator submits the create-user form with a valid email
- WHEN the account is created in Cognito
- THEN an email is dispatched to that address
- AND it contains the temporary password
- AND it contains a link to the sign-in screen built from `PUBLIC_APP_BASE_URL`
- AND IT MUST leave the account in `FORCE_CHANGE_PASSWORD`, so the credential is single-use
- BUT it must NOT contain any hardcoded host name

#### Scenario: The recipient uses it

- GIVEN the invitee opens the link and enters the temporary password
- WHEN they sign in
- THEN they are required to set a new password before reaching any screen

### FR-2: The administrator still sees the temporary password

- **Description:** The create-user response SHALL continue to return the temporary password, and the admin UI SHALL continue to display it.
- **Rationale / Source:** Product owner, 2026-09-21. It is the fallback when the email does not arrive; removing it would make a delivery failure unrecoverable without a second reset.
- **Phase:** 1

#### Scenario: Fallback preserved

- GIVEN a user has just been created
- WHEN the handoff view renders
- THEN the temporary password is shown with its existing copy affordance
- AND IT MUST be shown whether or not the email was sent

### FR-3: The administrator is told whether the email was sent

- **Description:** The create-user and reset responses SHALL carry a signal indicating whether the email was dispatched successfully, and the UI SHALL surface it.
- **Rationale / Source:** Product owner, 2026-09-21. Without it, FR-2's fallback is unusable — the admin cannot know when to use it.
- **Phase:** 1

#### Scenario: Sent

- GIVEN the transport accepted the message
- WHEN the handoff view renders
- THEN it states that the invitation was emailed

#### Scenario: Not sent

- GIVEN the transport rejected the message
- WHEN the handoff view renders
- THEN it states that the email could not be sent and that the password must be shared directly
- AND IT MUST still show the temporary password
- BUT it must NOT present the failure as a failure to create the user

### FR-4: A send failure never fails the operation

- **Description:** A mail-transport failure SHALL NOT cause the create or reset request to fail.
- **Rationale / Source:** Product owner, 2026-09-21. The Cognito account already exists when the send is attempted and cannot be un-created; failing the request would report a false negative and invite a duplicate-create retry.
- **Phase:** 1

#### Scenario: Transport rejects

- GIVEN the mail transport will reject every message
- WHEN an administrator creates a user
- THEN the request succeeds with the user and the temporary password
- AND the failure is logged
- AND FR-3's "not sent" signal is returned
- BUT it must NOT return a 5xx
- AND IT MUST NOT leave a Cognito user that the API reports as not created

### FR-5: An admin-initiated reset emails the new temporary password

- **Description:** `UsersService.resetPassword` SHALL send the target user an email carrying the new temporary password and the sign-in link, under the same rules as FR-1 through FR-4.
- **Rationale / Source:** Proposal O-5. Same shape and same gap as `create()`.
- **Phase:** 1

#### Scenario: Reset

- GIVEN an administrator resets a user's password
- WHEN the new temporary password is set
- THEN an email is dispatched to that user
- AND the administrator still receives the password and a sent/not-sent signal
- AND IT MUST leave the account requiring a password change at next sign-in

### FR-6: Self-service reset delivers through the reliable channel

- **Description:** `/forgot-password` SHALL deliver its message through the microservice rather than `COGNITO_DEFAULT`, and SHALL retain a **code-based** reset — the existing password stays valid until the code is used.
- **Rationale / Source:** Proposal §11. The product owner asked for "a new password by email"; that shape lets anyone who knows an administrator's address invalidate their password without reading the inbox. The delivery channel is the defect; the security shape is not. Counter-recommendation accepted 2026-09-21.
- **Phase:** **2** — requires the `10-data-auth` stack.
- **⚠️ Unverified premise (KZ-011):** this requirement assumes a `CustomEmailSender` trigger can intercept the ForgotPassword message and that the Lambda can decrypt the code. **That is a claim about AWS, not about this codebase, and it has not been verified.** Design of Phase 2 MUST begin by confirming it against AWS documentation *and* a live test, and MUST cite where. If it proves false, FR-6 returns to the user as an open decision rather than being satisfied by a substitute nobody chose.

#### Scenario: Self-service reset

- GIVEN a user submits their address on `/forgot-password`
- WHEN the reset is requested
- THEN the message is delivered through the microservice
- AND IT MUST remain a code, not a freshly-issued password
- BUT it must NOT invalidate the user's current password before the code is used
- BUT it must NOT reveal whether the submitted address corresponds to an account

### FR-7: The dead Cognito invitation template is retired

- **Description:** The pool's `InviteMessageTemplate` and the `PortalUrl` parameter SHALL be removed.
- **Rationale / Source:** Proposal §3.3. With `SUPPRESS` retained, no application path sends that template; it survives only as config carrying a domain that will go stale — the same latent trap ATP-67 removed from the registration receipt.
- **Phase:** 1 authors it; ⚠️ **it does not take effect until a `DEPLOY_INFRA=true` deploy runs.**

#### Scenario: Removed

- GIVEN the change is merged
- WHEN `infra/10-data-auth/template.yaml` is searched
- THEN neither `InviteMessageTemplate` nor `PortalUrl` appears
- AND IT MUST leave no reference to either from any other file
- BUT it must NOT be described anywhere as live before that deploy has run

## 8. Non-Functional Requirements

### NFR-1: The temporary password never enters a log, a store, or an audit row

- The credential SHALL exit only through the mail body and the `Admin`-guarded HTTP response.
- **AND IT MUST NOT** appear in `MailService`'s attempt/outcome log lines, which today carry a reference and never body text — that discipline is load-bearing here and must be preserved, not re-derived.
- **BUT it must NOT** be written to `ActorAuditLog` or any other table.

### NFR-2: The send is awaited before the handler returns

- Every dispatch SHALL be awaited inside its own `try`/`catch`.
- **Rationale:** the Lambda execution environment may freeze the instant an invocation settles. Fire-and-forget sends have been **observed in production** to vanish this way twice — the registration OTP (`fix/otp-mail-lambda-freeze`) and the receipt (design.md D-I). `context.callbackWaitsForEmptyEventLoop` does **not** protect an `async` handler. Do not reintroduce the pattern.

### NFR-3: No applicant- or user-facing link contains a hardcoded host

- Every link SHALL derive from `PUBLIC_APP_BASE_URL` via `getPublicAppBaseUrl()`, which already rejects absent, non-`http(s)`, and `*` values.

### NFR-4: The emails render in the clients recipients actually use

- New templates SHALL reuse `renderEmailHtml` and the existing block vocabulary, and SHALL carry a plain-text part alongside the HTML.
- ⚠️ **No automated gate exists for rendering** (see §9). Treated as an accepted risk with a manual check.

### NFR-5: Phase 2's infrastructure dependency is stated wherever Phase 2 is described

- Documentation and task text SHALL state that `10-data-auth` changes do not ship on an ordinary merge (`DEPLOY_INFRA` defaults to `false`).
- **Rationale:** a change believed live but not deployed is the failure mode this project has already paid for elsewhere.

## 9. Defect Classes And Their Gates

The classes this spec can actually produce, and what catches each. A class with no automated gate is named as such rather than left to be discovered.

| # | Defect class | Gate | Automated? |
|---|---|---|---|
| D-1 | Link is wrong, malformed, or hardcoded | Template unit test asserting the derived URL in both parts, mirroring `receipt.template.spec.ts` | ✅ |
| D-2 | Credential leaks into a log line | Unit test asserting the logged strings contain neither the password nor the body; plus a grep of the diff | ✅ |
| D-3 | Send failure fails the request | Unit test with a rejecting transport asserting a 2xx and the "not sent" signal | ✅ |
| D-4 | Send not awaited → lost on Lambda freeze | Handler-level test through the real `lambda.ts`, the only harness that reproduces the freeze class | ✅ |
| D-5 | UI shows the wrong send state | Component test over both branches | ✅ |
| D-6 | **The message dispatches but never arrives** | ❌ **None.** A mock assertion proves dispatch, not delivery (**KZ-002**). **Substitute: a manual inbox check recorded at the HITL pause** — create a real user against DEV and read the mailbox. Not inferable from a green suite. | ❌ manual |
| D-7 | **The email renders broken in a real mail client** | ❌ **None.** No harness here rasterizes email HTML. **Accepted risk**, mitigated by reusing the existing `renderEmailHtml` layout unchanged and by the D-6 manual check. | ❌ accepted |
| D-8 | **Phase 2 merged and believed live while `DEPLOY_INFRA=false`** | ❌ No code gate. **Substitute: NFR-5's explicit statement in task text**, plus a deploy-time confirmation recorded before FR-6 is called done. | ❌ procedural |
| D-9 | **Phase 2 designed on a false assumption about Cognito** | ❌ No gate at authoring time. **Substitute: FR-6's mandatory verification-with-citation before design** (**KZ-011**). | ❌ manual |

## 10. Data & Schema Impact

**None.** No Prisma model, column, migration, or `pii-consent.policy.ts` change. The temporary password is transient and is never persisted by this system.

## 11. Out of Scope

| Excluded | Reason |
|---|---|
| Moving the pool to SES | Its identity was deliberately torn down (`email-notification-microservice` §7.1). Re-introducing it reverses a settled decision and solves nothing the microservice does not. |
| Retry, dead-letter, delivery confirmation | Not offered by the microservice on this path (that spec's D-H). Unchanged. |
| Password policy, MFA, session handling | Unrelated to delivery. |
| Public self-signup | The RBAC model has no anonymous account creation. |
| Changing the registration OTP flow | Referenced as a pattern at most; behaviour untouched. |

## 12. Dependencies & Assumptions

| # | Item |
|---|---|
| D-1 | **ATP-67 / PR #80** must reach `main` before this does. The branch carries it already. |
| D-2 | The microservice transport is configured in the target environment (`MAIL_TRANSPORT=microservice` plus its four required variables). |
| A-1 | The microservice accepts these messages with no DTO change — they are ordinary subject/body/recipient messages, the same shape as approvals. **To be confirmed in design**, not assumed. |
| A-2 | `10-data-auth` is deployable on request with `DEPLOY_INFRA=true`. Phase 2 cannot land without an operator willing to run that build. |

## 13. Open Questions

| # | Question | Blocking? |
|---|---|---|
| Q-1 | Is it acceptable that `/forgot-password` stays on the 50/day capped channel until Phase 2 lands? The admin-initiated reset (FR-5) is the interim workaround from Phase 1 onward. | No — Phase 1 proceeds either way |
| Q-2 | Should the invitation carry the password at all, or only the link? **Answered: carry it** (product owner, 2026-09-21). Recorded because it is the decision a future reader will question. | No |
| Q-3 | Does `backend/CLAUDE.md`'s "no-email credential handoff (intentional)" section get rewritten or annotated as superseded? Per **KZ-004**, the *premise* must be swept, not just the phrase. | No — design decides |

## 14. Requirement ID Index

| ID | Title | Phase | Gate class |
|---|---|---|---|
| FR-1 | Invited user receives an invitation email | 1 | D-1, D-6 |
| FR-2 | Administrator still sees the temporary password | 1 | D-5 |
| FR-3 | Administrator is told whether the email was sent | 1 | D-3, D-5 |
| FR-4 | A send failure never fails the operation | 1 | D-3, D-4 |
| FR-5 | Admin-initiated reset emails the new password | 1 | D-1, D-3, D-6 |
| FR-6 | Self-service reset uses the reliable channel | **2** | D-8, D-9 |
| FR-7 | Dead Cognito invitation template retired | 1 (effect: 2) | D-8 |
| NFR-1 | Credential never logged, stored, or audited | 1 | D-2 |
| NFR-2 | The send is awaited | 1 | D-4 |
| NFR-3 | No hardcoded host in any link | 1 | D-1 |
| NFR-4 | Emails render in real clients | 1 | D-7 |
| NFR-5 | Phase 2's deploy dependency is stated | 2 | D-8 |
