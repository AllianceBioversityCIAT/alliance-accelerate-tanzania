# Requirements — Self-service password reset that reaches the user

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Depth | **Full** — auth surface, a customer-managed KMS key, a pool-wide configuration change against live accounts, and a new deployable unit |
| Type | Change |
| Status | ⚠️ **Corrected 2026-09-25 (validation-report.md W-7).** Was `Draft — awaiting approval`, stale since `execution.md` records five user approvals and a completed deploy. **Approved 2026-09-23** (`proposal.md` §12.1 — the user chose Path 1, simplified) — **deployed to DEV 2026-09-25**, all 7 tasks in `tasks.md` §4 marked `[x]`. |
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

### FR-4: Delivery is best-effort, and nothing claims otherwise

**⚠️ Rewritten 2026-09-23, and this is a REMOVAL.** Earlier versions of FR-4 required the user to be told when a send failed. That requirement was **invented for this flow alone** — no other mail path in this product does it — and it is what dragged in the awaited microservice reply, the timeout budget, and the duplicate-code failure mode that round-1 findings C-1, C-4 and C-7 all describe. `proposal.md` §12.1 drops it.

The flow SHALL behave like every other mail path in this system: publish, and return.

#### Scenario: A reset is requested
- **GIVEN** a user requests a password reset
- **WHEN** the message is published to the transport successfully
- **THEN** the flow completes normally and Cognito's existing response reaches the user unchanged
- **BUT it must NOT** claim delivery — no copy anywhere may assert that a message *arrived*, only that one was sent

#### Scenario: The transport rejects the publish
- **GIVEN** the transport is unreachable or refuses the message
- **WHEN** the function attempts to publish
- **THEN** it MUST fail visibly, so the failure is in logs and alertable
- **AND IT MUST** carry no address and no code in anything it logs (NFR-1)

> **What this costs, stated plainly.** A user whose send fails sees Cognito's ordinary "code sent" response and receives nothing; their recourse is to retry, or to ask an administrator — which works (ATP-71). This is the same exposure every other mail path in this product already carries, accepted here for consistency rather than solved for this flow alone.
>
> **Not reopened by stealth:** if delivery confirmation is ever wanted, it is wanted *system-wide*, and that is a separate change against the transport — not a special case bolted onto password reset.

### FR-5: The pool configuration change is deliberate and reversible

Activating the trigger requires `UpdateUserPool`, which **silently resets any parameter omitted from the request** (`proposal.md` §2.1 C-4) on a pool holding live accounts.

#### Scenario: Applying the pool change
- **GIVEN** the live pool's current configuration
- **WHEN** the trigger is activated
- **THEN** the full configuration MUST be read first and the update composed from it
- **AND IT MUST** be verified afterwards by comparing the complete before/after configuration
- **BUT it must NOT** be applied by hand against the console or an ad-hoc CLI call — it goes through `10-data-auth`
- ~~**AND IT MUST** be reversible: removing the trigger must restore the prior behaviour without data loss~~ — ⚠️ **ANNOTATED 2026-09-25 (validation-report.md B-3).** Struck rather than deleted, per this document's own FR-6 convention, so `judgment.md` R2-6's citation still resolves. `design.md` DD-4 states plainly that *"there is no rollback that restores current behaviour"* — with SES excluded permanently, removing the trigger lands on Cognito's `COGNITO_DEFAULT`, not on the SES configuration this pool carried **before** the 2026-09-25 flip ⚠️ (**re-tensed 2026-09-25, validation-report.md W-8**: the pool has been on `COGNITO_DEFAULT` since that flip, so "today's SES" no longer names a state that exists; the conclusion — no rollback restores the pre-spec behaviour — is unchanged). **The clause has two halves, and only one is unmet:** *"without data loss"* **is met** — removing the trigger loses no data, and the `EmailConfiguration` flip to `COGNITO_DEFAULT` is `enhancement/email-notification-microservice` Phase B's decision landing, not this spec's — it happens with or without this spec, so the loss it causes is not attributable here. *"Restore the prior behaviour"* **is not met**, and `design.md` DD-4 calls it impossible under the standing decision to exclude SES permanently, not merely undone. `tasks.md` §5 records this split; `judgment.md` R2-6 (round 2, raised against the design this spec later replaced) named the same gap and had gone undisposed until `design.md` §10's R2-6 addendum, added alongside this correction.

### ~~FR-6: Cognito's own reset path is closed off~~ — **STRUCK 2026-09-23**

It existed only for Path 2, which replaced Cognito's flow. **Path 1 keeps that flow and changes only who delivers the message**, so there is nothing to close off. Struck rather than deleted so `judgment.md`'s references still resolve.

---

## 7. Non-Functional Requirements

| ID | Requirement |
|---|---|
| **NFR-1** | **The decrypted code and the recipient address MUST NEVER be logged**, stored, or emitted in any error payload — by the function, the backend, or CloudWatch. This is the same absolute rule as ATP-71's NFR-1 and is not weakened by the fact that a code expires. |
| **NFR-2** | The request handler MUST complete its dispatch **before it returns**. A publish still in flight when a Lambda returns can be frozen and lost — this repository has already shipped a production fix for that class (`fix/otp-mail-lambda-freeze`), and ATP-71's T-8 built the harness that proves it against the real `lambda.ts` handler. ~~Under Option B this flow runs in that same handler, so that harness applies directly rather than needing a new one.~~ — ⚠️ **CORRECTED 2026-09-25 (validation-report.md D-5).** False since the reversal to Path 1 (`proposal.md` §12.1): this flow is a **standalone `.mjs` Lambda** in `10-data-auth`, not `20-backend`'s `lambda.ts` handler, so that harness does not apply. The design substitutes its own warrant instead — `design.md` DD-3a, that nothing outlives the invocation. |
| **NFR-3** | Any link in the message MUST derive from configuration, never a baked-in host (ATP-67's mechanism). |
| **NFR-4** | **REINSTATED 2026-09-23** (Path 1 needs the key again). The KMS key MUST be a customer-managed **symmetric** key. ⚠️ Round-1 finding **C-9** must be resolved here rather than repeated: the previous enumeration listed `lambda:InvokeFunction` as one of three *KMS* grants — it is a **Lambda resource policy**, not a KMS permission — leaving the closed set with **no principal able to encrypt**, which Cognito must do. The design MUST state the key policy and the Lambda resource policy **separately**, and cite AWS for each. |
| **NFR-5** | **Documentation and task text MUST state, in those words, that `DEPLOY_INFRA` defaults to `false`** and that `10-data-auth` therefore does not ship on an ordinary merge — judgment finding C-13 recorded that the previous design said "`DEPLOY_INFRA`-gated" instead, which tells a reader what to run rather than what NFR-5 requires stated. It MUST also state that the same deploy **flips this pool's `EmailConfiguration` from its live SES setting to `COGNITO_DEFAULT`**, a side effect that lands whether or not this spec is ready. ~~⚠️ This became MORE important under Option B, not less: closing off Cognito's own `ForgotPassword` (FR-6) is now the only reason this spec touches `10-data-auth` at all.~~ — ⚠️ **CORRECTED 2026-09-25 (validation-report.md D-6).** Both halves were false: Option B was abandoned and FR-6 is struck (§6). Under Path 1, the reason this spec touches `10-data-auth` at all is the trigger, its KMS key, and the function itself — not a closing-off that no longer exists. The rationale was wrong; the operative demand above (the `DEPLOY_INFRA` words and the coupled `EmailConfiguration` flip) is unaffected and stands as written. |
| **NFR-6** | The user-visible latency of a reset request SHOULD stay within the budget recorded in `design.md`, ~~since FR-4 makes the request wait on the real send~~ — ⚠️ **CORRECTED 2026-09-25 (validation-report.md D-7).** FR-4 was rewritten (§6, above) to drop the awaited reply, so the request no longer waits on the real send; that is not why this NFR is applicable. It is applicable because `ForgotPassword` still blocks on the function's own invocation before returning (NFR-2), and that invocation's cold-path latency is the thing being bounded. **Already disposed identically elsewhere** (`validation-report.md` B-2, landed in `design.md` §10's C-7 disposition, `tasks.md` §5, and `execution.md`) — this correction restates that disposition rather than adding a new one. The budget belongs in one place only, per `mail/mail-timing.ts`'s existing discipline — that place is `design.md` DD-3a. |

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
| FR-4 | Delivery is best-effort; nothing claims otherwise | D-6 |
| FR-5 | Pool change is deliberate; reversible **without data loss only** — restoring prior behaviour is not satisfiable (⚠️ **corrected 2026-09-25, validation-report.md B-3**; see §6 FR-5's struck clause and DD-4) | D-5 |
| ~~FR-6~~ | ~~Cognito's own reset path closed off~~ — struck; Path 1 keeps that flow | — |
| NFR-1 | Code and address never logged | D-2 |
| NFR-2 | Work completes before the function returns | D-6 |
| NFR-3 | Links derive from configuration | — |
| NFR-4 | KMS key symmetric; key policy and invoke policy stated separately | D-4 |
| NFR-5 | Deploy dependency and its coupled side effect stated | D-8 |
| NFR-6 | Latency budget recorded in one place | — |
