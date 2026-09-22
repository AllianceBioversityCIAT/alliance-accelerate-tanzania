# Requirements — Self-service password reset that reaches the user

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Depth | **Full** — auth surface, a customer-managed KMS key, a pool-wide configuration change against live accounts, and a new deployable unit |
| Type | Change |
| Status | Draft — awaiting approval |
| Approval Mode | gated |
| Branch | `feat/forgot-password-delivery` |
| Parent | `auth/account-access-emails` (ATP-71) Phase 2 — FR-6, NFR-5 |
| Proposal | `proposal.md`, decisions recorded in its §13.1 |

**Two inherited premises were checked before this document was written** (`proposal.md` §2). One held — `CustomEmailSender_ForgotPassword` exists and the code is decryptable. One did **not**: the claim that this pool sends through `COGNITO_DEFAULT` is false in the live environment. Nothing below rests on the falsified one.

---

## 2. Executive Summary

A staff or admin user who forgets their password clicks **Forgot password**. Cognito generates a reset code and sends it **itself** — our backend never sees the request and cannot route the message. Today that mail leaves through a sandboxed SES identity, so it reaches only *verified* addresses, and everyone else is stranded with no way back in.

This spec routes that one message through the OneCGIAR notification microservice — the channel every other email in this system already uses and that ATP-71 proved end to end — **without changing the security shape of a password reset**. The reset stays code-based.

---

## 3. Glossary

| Term | Meaning |
|---|---|
| **Self-service reset** | The user-initiated flow behind `/forgot-password`. No administrator involved. Distinct from **admin-initiated reset** (ATP-71 FR-5), where an admin generates a temporary password. |
| **Custom sender trigger** | The Cognito `CustomEmailSender` Lambda trigger. When set, Cognito invokes it **instead of** sending mail itself. |
| **Trigger source** | The `triggerSource` field Cognito passes, naming which event caused the invocation (e.g. `CustomEmailSender_ForgotPassword`). |
| **The code** | The one-time secret Cognito generates for a reset. It arrives **encrypted**; the function must decrypt it before sending. |
| **The microservice** | The OneCGIAR notification microservice, reached over RabbitMQ. |
| **Dispatch accepted** | The broker acknowledged the publish. **Not** delivery — see FR-4. |

---

## 4. System Context & Scope

### In scope
- The delivery path for Cognito's ForgotPassword message.
- A Cognito custom email sender trigger, its KMS key, and its IAM.
- The `10-data-auth` pool configuration change and its deploy sequencing.
- Telling the user the truth about whether their code was sent (FR-4).

### Out of scope
- The reset's **security shape** — it stays code-based. Emailing a new password was rejected in ATP-71 because it invalidates the current one the moment anyone submits the form, letting anyone who knows an address lock its owner out.
- ATP-71's admin-facing `CredentialHandoff` screen and its `emailSent` flag (`proposal.md` §13.1 Q-3).
- ATP-71's FR-7 template retirement — separate work, though §7 NFR-5 couples their deploys.
- Bringing SES out of sandbox. The standing decision is that this system sends only through the microservice; that is not reopened here.

---

## 5. Stakeholders / Personas

| Persona | Stake |
|---|---|
| **Staff / Admin user, locked out** | The primary actor. Needs back in **without waiting for another human** — the reason Q-1 was decided to build this (`proposal.md` §13.1). |
| **Administrator** | Today's fallback. Should stop being the only route. |
| **Operator deploying `10-data-auth`** | Carries the risk in NFR-4 and NFR-5: a pool-wide update against live accounts, and a coupled deploy. |

---

## 6. Functional Requirements

### FR-1: The reset code is delivered through the microservice

The system SHALL deliver Cognito's self-service password-reset message through the OneCGIAR notification microservice, and SHALL NOT rely on Cognito's own mailer or on SES for it.

#### Scenario: A user requests a reset
- **GIVEN** a Cognito user with a verified email address
- **WHEN** they submit the Forgot password form
- **THEN** the reset message is published to the microservice with the user's email address as the recipient
- **AND** the message body carries the **decrypted** code
- **AND IT MUST** derive any link it contains from `PUBLIC_APP_BASE_URL`, never from a hardcoded host
- **BUT it must NOT** contain a password — this flow delivers a code, never a credential

#### Scenario: The recipient address cannot be determined
- **GIVEN** a trigger event whose user attributes carry no usable email address
- **WHEN** the function processes it
- **THEN** it MUST fail loudly (FR-2's rule) rather than publish
- **BUT it must NOT** substitute any other identifier as the recipient — ATP-71's D-6 found exactly this defect in the admin flow, where a UUID was published as an address and the microservice rejected it downstream

### FR-2: An unrecognised trigger source fails loudly

Because the trigger is **all-or-nothing per pool** (`proposal.md` §2.1 C-1), Cognito will route *every* email event to this function. The function SHALL handle the events this pool can emit and SHALL fail visibly on any it does not recognise.

#### Scenario: A trigger source the function does not handle
- **GIVEN** the function receives an event whose `triggerSource` it has no branch for
- **WHEN** it processes the event
- **THEN** it MUST raise, producing a visible failure and an error log
- **AND IT MUST** name the unhandled `triggerSource` in that log
- **BUT it must NOT** return successfully, and must NOT swallow the event

> **Decision and its reason** (`proposal.md` §13.1 Q-2). A silent no-op means that the day someone enables MFA, users stop receiving codes and nobody learns why. That is precisely how ATP-71's missing IAM grant survived for months: nothing complained. A loud failure surfaces the gap on the day the setting changes.

### FR-3: The reset remains code-based

The flow SHALL continue to issue a one-time **code** that the user exchanges for a new password of their choosing.

#### Scenario: Completing a reset
- **GIVEN** a user who received a reset code
- **WHEN** they submit the code with a new password
- **THEN** the password is changed and they can sign in
- **BUT it must NOT** be possible for a reset request alone — without possession of the code — to invalidate the user's existing password

### FR-4: The user is not told a message was sent unless it was

The flow SHALL NOT report success to the user on the basis of broker acceptance alone.

#### Scenario: The send fails at the microservice
- **GIVEN** the microservice will reject or fail the message (bad recipient, SMTP failure, service down)
- **WHEN** the user submits the Forgot password form
- **THEN** the user MUST see an honest failure and an action they can take
- **BUT it must NOT** show "check your email" for a message that was not sent
- **AND IT MUST NOT** reveal whether the submitted address corresponds to an existing account — the failure message must be identical for an unknown address and a real one whose send failed

> **Why this is in scope here and not for ATP-71's admin screens** (`proposal.md` §13.1 Q-3). The user of this flow has, by definition, no administrator to fall back on. And it is obtainable: the microservice was verified to reply **after** the real SMTP send. The latency objection that blocks this elsewhere is weakest here — the user is already waiting for that email.

### FR-5: The pool configuration change is deliberate and reversible

Activating the trigger requires `UpdateUserPool`, which **silently resets any parameter omitted from the request** (`proposal.md` §2.1 C-4) on a pool holding live accounts.

#### Scenario: Applying the pool change
- **GIVEN** the live pool's current configuration
- **WHEN** the trigger is activated
- **THEN** the full configuration MUST be read first and the update composed from it
- **AND IT MUST** be verified afterwards by comparing the complete before/after configuration
- **BUT it must NOT** be applied by hand against the console or an ad-hoc CLI call — it goes through `10-data-auth`
- **AND IT MUST** be reversible: removing the trigger must restore the prior behaviour without data loss

---

## 7. Non-Functional Requirements

| ID | Requirement |
|---|---|
| **NFR-1** | **The decrypted code and the recipient address MUST NEVER be logged**, stored, or emitted in any error payload — by the function, the backend, or CloudWatch. This is the same absolute rule as ATP-71's NFR-1 and is not weakened by the fact that a code expires. |
| **NFR-2** | The function MUST complete its work **before it returns**. A publish still in flight when a Lambda returns can be frozen and lost — this repository has already shipped a production fix for that class (`fix/otp-mail-lambda-freeze`) and ATP-71's NFR-2 gates the same property for the backend. |
| **NFR-3** | Any link in the message MUST derive from configuration, never a baked-in host (ATP-67's mechanism). |
| **NFR-4** | The KMS key MUST be a customer-managed symmetric key, with grants scoped to exactly three principals: the deploying principal (`kms:CreateGrant`), the function's role (`kms:Decrypt`), and `cognito-idp.amazonaws.com` (`lambda:InvokeFunction`). No broader grant. |
| **NFR-5** | **Documentation and task text MUST state that `10-data-auth` does not ship on an ordinary merge** (`DEPLOY_INFRA` defaults to `false`), and MUST state that the same deploy **also flips this pool's `EmailConfiguration` from its live SES setting to `COGNITO_DEFAULT`** (`proposal.md` §2.4) — a side effect that lands whether or not this spec's work is ready. |
| **NFR-6** | The user-visible latency of a reset request SHOULD stay within the budget recorded in `design.md`, since FR-4 makes the request wait on the real send. The budget belongs in one place only, per `mail/mail-timing.ts`'s existing discipline. |

---

## 8. Defect classes this spec can produce, and what catches each

**A gate blind to the defect class this spec most often produces is not a gate.** This section exists because ATP-71's own D-6 found **two live defects that 1203 green tests did not**, and both were of classes nothing automated could see.

| ID | Defect class | Automated gate | Verdict |
|---|---|---|---|
| D-1 | The function mishandles an event and an email is silently dropped | Unit tests per `triggerSource` | ✅ covered — FR-2 makes the unknown case *raise*, which is testable |
| D-2 | The decrypted code or the address reaches a log | Assertions over captured logger output, in the shape ATP-71's NFR-1 uses (`not.toContain`) | ✅ covered |
| D-3 | Decryption fails at runtime | ❌ **None.** Unit tests mock KMS; a mocked decrypt proves the call shape, never that the key, grant and ciphertext agree | ⚠️ **Manual live test required** |
| D-4 | **The IAM grant is missing or wrong** | ❌ **None.** Every suite mocks the AWS clients, so IAM is never exercised | ⚠️ **Manual live test required.** This is not hypothetical: it is exactly the defect ATP-71's D-6 found, live for months, invisible to the whole suite |
| D-5 | `UpdateUserPool` silently resets an omitted pool setting | ❌ **No test can see it.** The blast radius is a live pool | ⚠️ **Before/after configuration diff, recorded** (FR-5) |
| D-6 | The message dispatches but never arrives | ❌ **None.** A mock assertion proves dispatch, not delivery | ⚠️ **Manual inbox check required** |
| D-7 | Enabling the trigger breaks another email path the pool emits | Partially — FR-2's loud failure converts a silent drop into a visible one | ⚠️ Residual: only covers paths that *fire*. A path nobody exercises stays unknown |
| D-8 | The spec is believed live while `DEPLOY_INFRA=false` | ❌ No code gate | ⚠️ **Procedural** — NFR-5's explicit statement, plus a recorded deploy confirmation |

### The substitute for D-3, D-4, D-6 — one manual check, and it is mandatory

**Before this spec is called done:** perform a real self-service reset against DEV, from a mailbox you control. Confirm the email **arrives**, that the code in it **works**, and that a new password can be set and used to sign in. **Record the result.**

**No green suite substitutes for this.** ATP-71's identical check found two production defects on two separate runs. Treat a green test suite as evidence that the code does what it was written to do — never as evidence that a human received an email.

---

## 9. Requirement ID Index

| ID | Requirement | Defect classes |
|---|---|---|
| FR-1 | Reset code delivered through the microservice | D-1, D-3, D-6 |
| FR-2 | Unrecognised trigger source fails loudly | D-1, D-7 |
| FR-3 | The reset remains code-based | — |
| FR-4 | No false "check your email" | D-6 |
| FR-5 | Pool change is deliberate and reversible | D-5 |
| NFR-1 | Code and address never logged | D-2 |
| NFR-2 | Work completes before the function returns | D-6 |
| NFR-3 | Links derive from configuration | — |
| NFR-4 | KMS key and grants minimally scoped | D-4 |
| NFR-5 | Deploy dependency and its coupled side effect stated | D-8 |
| NFR-6 | Latency budget recorded in one place | — |
