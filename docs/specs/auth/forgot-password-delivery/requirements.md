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

### FR-4: The user is told the truth, without the form becoming an account oracle

**⚠️ Revised 2026-09-22.** The original FR-4 paired *"the user MUST see an honest failure"* with *"the failure message MUST be identical for an unknown address and a real one whose send failed."* Judgment finding **C-3**, confirmed by both judges, showed those clauses are **in direct contradiction**: any response that distinguishes a failed send necessarily reveals that the address has an account. The requirement is re-stated below on the axis that actually resolves it.

**The resolving distinction: what the failure depends on.**

| Failure class | Correlates with account existence? | Response |
|---|---|---|
| **Address-dependent** — no such account, or the recipient is unusable | **Yes** | MUST be **masked** — indistinguishable from success |
| **Systemic** — transport unreachable, broker down, service failing for everyone | **No** — identical for an address with no account | MAY be, and SHOULD be, reported honestly |

A systemic failure leaks nothing precisely because an attacker probing a nonexistent address sees the same thing.

#### Scenario: Address has no account
- **GIVEN** a submitted address with no corresponding user
- **WHEN** the form is submitted
- **THEN** the response MUST be indistinguishable from the success case, in copy, in status, and in the step the UI advances to
- **AND IT MUST** be padded to the same response floor as the success path, so elapsed time does not distinguish them either
- **BUT it must NOT** perform less work in a way an observer can time — this is the channel judgment finding C-3 identified, and the repository's `padToVerificationCodeResponseFloor` exists because of it

#### Scenario: The account exists and the code is sent
- **GIVEN** a real account and a successful send
- **WHEN** the form is submitted
- **THEN** the user is told a code has been sent **if an account exists** — wording that is true in both this case and the one above

#### Scenario: The send fails for a reason tied to this address
- **GIVEN** a real account whose send fails in a way specific to it
- **WHEN** the form is submitted
- **THEN** the response MUST be identical to the two scenarios above
- **AND IT MUST** be recorded server-side so the failure is visible to operators
- **BUT it must NOT** tell the user their send failed — doing so is exactly the disclosure the first scenario masks

#### Scenario: The transport is failing for everyone
- **GIVEN** the mail transport is unreachable or rejecting every message
- **WHEN** any user submits the form
- **THEN** an honest failure MAY be shown, with an action the user can take
- **AND IT MUST** be a response the same code path produces for an address with no account — if the honest error is reachable only for real accounts, it is an oracle and MUST be masked instead

> **What this costs, stated plainly.** A user whose send fails for an address-specific reason is told a code is coming and receives nothing. That is a real harm, accepted deliberately: the alternative discloses account existence to anyone who can submit a form. The mitigation is operational — the failure is logged and alertable — not user-facing.

### FR-5: The pool configuration change is deliberate and reversible

Activating the trigger requires `UpdateUserPool`, which **silently resets any parameter omitted from the request** (`proposal.md` §2.1 C-4) on a pool holding live accounts.

#### Scenario: Applying the pool change
- **GIVEN** the live pool's current configuration
- **WHEN** the trigger is activated
- **THEN** the full configuration MUST be read first and the update composed from it
- **AND IT MUST** be verified afterwards by comparing the complete before/after configuration
- **BUT it must NOT** be applied by hand against the console or an ad-hoc CLI call — it goes through `10-data-auth`
- **AND IT MUST** be reversible: removing the trigger must restore the prior behaviour without data loss

### FR-6: Cognito's own reset path is closed off

With the flow moved into our backend, Cognito's `ForgotPassword` remains reachable unless it is explicitly disabled. Two live reset mechanisms — one delivering through the microservice, one through whatever mailer the pool happens to carry — is a worse state than either alone.

#### Scenario: The retired path is unreachable
- **GIVEN** the new flow is live
- **WHEN** a client attempts Cognito's own `ForgotPassword`
- **THEN** it MUST NOT deliver a working reset
- **AND IT MUST** be closed by configuration, not merely by the frontend no longer calling it — a path reachable by anyone with the pool id and a client id is not closed by removing a button

---

## 7. Non-Functional Requirements

| ID | Requirement |
|---|---|
| **NFR-1** | **The decrypted code and the recipient address MUST NEVER be logged**, stored, or emitted in any error payload — by the function, the backend, or CloudWatch. This is the same absolute rule as ATP-71's NFR-1 and is not weakened by the fact that a code expires. |
| **NFR-2** | The request handler MUST complete its dispatch **before it returns**. A publish still in flight when a Lambda returns can be frozen and lost — this repository has already shipped a production fix for that class (`fix/otp-mail-lambda-freeze`), and ATP-71's T-8 built the harness that proves it against the real `lambda.ts` handler. Under Option B this flow runs in that same handler, so that harness applies directly rather than needing a new one. |
| **NFR-3** | Any link in the message MUST derive from configuration, never a baked-in host (ATP-67's mechanism). |
| ~~**NFR-4**~~ | ~~KMS key and grants~~ — **STRUCK 2026-09-22.** It existed only for Option A's `CustomEmailSender` trigger. Option B introduces no KMS key. Left visible rather than deleted so the judgment ledger's finding C-9 (the grant set granted nobody encrypt rights) still resolves against something. |
| **NFR-5** | **Documentation and task text MUST state, in those words, that `DEPLOY_INFRA` defaults to `false`** and that `10-data-auth` therefore does not ship on an ordinary merge — judgment finding C-13 recorded that the previous design said "`DEPLOY_INFRA`-gated" instead, which tells a reader what to run rather than what NFR-5 requires stated. It MUST also state that the same deploy **flips this pool's `EmailConfiguration` from its live SES setting to `COGNITO_DEFAULT`**, a side effect that lands whether or not this spec is ready. ⚠️ **This became MORE important under Option B, not less**: closing off Cognito's own `ForgotPassword` (FR-6) is now the only reason this spec touches `10-data-auth` at all. |
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
| FR-4 | Truth to the user without an account oracle | D-6 |
| FR-5 | Pool change is deliberate and reversible | D-5 |
| **FR-6** | **Cognito's own reset path is closed off** | **D-7** |
| NFR-1 | Code and address never logged | D-2 |
| NFR-2 | Work completes before the function returns | D-6 |
| NFR-3 | Links derive from configuration | — |
| ~~NFR-4~~ | ~~KMS key and grants~~ — struck; Option B introduces no KMS key | — |
| NFR-5 | Deploy dependency and its coupled side effect stated | D-8 |
| NFR-6 | Latency budget recorded in one place | — |
