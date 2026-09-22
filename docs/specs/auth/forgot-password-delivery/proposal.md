# Proposal — Self-service password reset that reaches the user

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Type | Change |
| Status | Draft — awaiting approval |
| Approval Mode | gated |
| Author | Leader (Claude Opus 5), with Daniela Gómez |
| Created | 2026-09-22 |
| Branch | `feat/forgot-password-delivery` (from `main`) |
| Parent work | `auth/account-access-emails` (ATP-71) — this is that spec's deferred **Phase 2** (FR-6, NFR-5) |
| Depends on | none (ATP-71 Phase 1 is merged) |

> **This document opens with a verification, not a plan.** ATP-71's `requirements.md` FR-6 refused to let Phase 2 be designed on an unchecked premise: *"this requirement assumes a `CustomEmailSender` trigger can intercept the ForgotPassword message… **That is a claim about AWS, not about this codebase, and it has not been verified.** Design of Phase 2 MUST begin by confirming it against AWS documentation *and* a live test, and MUST cite where."* §2 is that verification. It confirmed the premise **and falsified a different one this spec was resting on.**

---

## 2. Verification of the inherited premise (done first, per FR-6)

### 2.1 The mechanism exists — CONFIRMED, with citation

`CustomEmailSender_ForgotPassword` is a documented Cognito trigger source: *"A user requests a code to reset their password."* The Lambda receives `request.code` — *"The encrypted code that your function can decrypt and send to your user"* — decryptable with the AWS Encryption SDK (`@aws-crypto/client-node`) against a symmetric KMS key.

Source: [Custom email sender Lambda trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-email-sender.html) · [Activating custom sender Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-sender-triggers.html)

**FR-6's premise holds. Phase 2 may be designed.** Five conditions the inherited text did not anticipate:

| # | Condition | Consequence |
|---|---|---|
| C-1 | **All-or-nothing per pool.** *"Amazon Cognito invokes a Lambda function **instead of** its default behavior when a user event requires that it send an email message. The custom code of your function must process and deliver **all** email messages from your user pool."* | Our Lambda becomes responsible for **every** email the pool emits, not only forgot-password. See §2.3 — today that set is nearly empty, which is what makes this affordable. |
| C-2 | A **symmetric KMS key is mandatory**, with three separate grants: `kms:CreateGrant` for the principal that updates the pool, `kms:Decrypt` for the Lambda's role, and `lambda:InvokeFunction` for `cognito-idp.amazonaws.com`. | New KMS resource + IAM in `10-data-auth`. |
| C-3 | **Not configurable from the Cognito console** — CLI/SDK only. | Must go through IaC, which is correct here anyway. |
| C-4 | ⚠️ **`UpdateUserPool` requires every pool parameter.** *"If you don't provide all relevant parameters, Amazon Cognito sets the values of any missing parameters to their defaults."* | A partial update **silently resets omitted settings** on a pool holding real accounts. This is the single most dangerous step in the whole change. |
| C-5 | Cognito HTML-escapes `<` and `>` in temporary passwords before encrypting. | The function must unescape after decrypting. Does not affect reset **codes**, only passwords — so it does not bite this flow, but it would bite C-1's other senders. |

### 2.2 ⚠️ A premise ATP-71 asserted that is FALSE in the live environment

ATP-71's proposal and `docs/trd/trd.md` §12.1 both state that `/forgot-password` rides `COGNITO_DEFAULT` (`no-reply@verificationemail.com`) today. **It does not.**

| | Repository says | Live pool `eu-west-1_eKINGUN3I` says |
|---|---|---|
| `EmailSendingAccount` | `COGNITO_DEFAULT` | **`DEVELOPER`** |
| Source | — | SES identity `j.cadavid@cgiar.org` (verification status **Success**) |
| From | — | `ACCELERATE Seed Registry <j.cadavid@cgiar.org>` |

The template change to `COGNITO_DEFAULT` was authored but **never deployed**, because `10-data-auth` ships only under `DEPLOY_INFRA=true` — the same reason ATP-71's FR-7 is authored-not-live. The pool still carries the configuration from `b522bb8` (PR #39).

**So the stated root cause for FR-6 is wrong.** The real one, measured: `aws ses get-send-quota` returns `Max24HourSend: 200.0`, `MaxSendRate: 1.0` — **the SES account is in sandbox**, and a sandboxed SES account delivers only to *verified* addresses. That is why self-service reset is unreliable, and it is a different defect from the one this spec inherited.

> **Not a licence to keep SES.** The standing decision — the application sends only through the OneCGIAR microservice — is unchanged and this proposal does not reopen it. Leaving SES out of the sandbox was considered and **rejected on exactly that ground**. §2.2 exists to correct the record and to surface §2.4, not to propose SES.

### 2.3 What C-1 actually costs here — small, and worth stating

The all-or-nothing rule sounds expensive until the pool is read. Measured on the live pool:

| Setting | Value | Effect on C-1 |
|---|---|---|
| `MfaConfiguration` | `OFF` | no `CustomEmailSender_Authentication` events |
| `AdminCreateUserConfig.AllowAdminCreateUserOnly` | `true` | no public self-signup ⇒ no `CustomEmailSender_SignUp` |
| `create()` in `users.service.ts` | `MessageAction: 'SUPPRESS'` | no `CustomEmailSender_AdminCreateUser` mail |
| `AutoVerifiedAttributes` / `VerificationMessageTemplate` | `["email"]` / `CONFIRM_WITH_CODE` | ⚠️ an email-attribute change **can** emit `CustomEmailSender_VerifyUserAttribute` — the one live edge besides ForgotPassword |

**Forgot-password is effectively the only email this pool emits.** C-1's breadth is a standing liability, not an immediate cost — but the function must still handle every `triggerSource` safely rather than assuming one.

### 2.4 🚨 An operational hazard this verification surfaced

**A `DEPLOY_INFRA=true` deploy — the one needed to apply ATP-71's FR-7 — would also flip this pool from SES to `COGNITO_DEFAULT`**, because both live in `10-data-auth/template.yaml`.

That direction matches the standing decision, so it is not wrong. But it is a **side effect nobody is currently expecting**, and between that deploy and a working `CustomEmailSender`, self-service reset would ride Cognito's shared sender — the channel with the `@cgiar.org` deliverability problem this whole effort exists to escape.

**Sequencing is therefore part of the decision, not an afterthought.** Whatever route is chosen, FR-7's deploy should not land alone and unannounced.

---

## 3. Intent

Make the self-service **Forgot password** flow deliver reliably to `@cgiar.org` recipients, through the same channel every other email in this system already uses, without weakening the security shape of a password reset.

## 4. Problem / Current behaviour

A staff or admin user who has forgotten their password uses `/forgot-password`. Cognito generates a reset code and sends it **itself** — our backend is never involved and cannot route the message. Today that mail leaves through a sandboxed SES identity, so it reaches only verified addresses. The user is stranded.

Their only recourse is to ask another administrator for a reset — which, as of ATP-71 (and the two production defects its D-6 check found and fixed), now works end to end.

## 5. Proposed outcome

A user who requests a password reset receives the message through the OneCGIAR notification microservice, and completes the reset. Cognito's **code-based** reset shape is preserved — the product owner's standing decision from ATP-71, taken because emailing a *new password* invalidates the current one the moment anyone submits the form, letting anyone who knows an admin's address lock them out.

## 6. Scope

- The delivery path for Cognito's ForgotPassword message.
- Whatever IaC, key material and IAM that path requires.
- The `10-data-auth` deploy sequencing in §2.4.

## 7. Non-goals

- Changing the reset's **security shape** (still a code, never an emailed password).
- Re-opening the SES decision.
- ATP-71's FR-7 template retirement — separate, though §2.4 couples their deploys.
- The `emailSent`-reports-acceptance-not-delivery limitation recorded in ATP-71's D-6 entry.

## 8. Affected users, systems and specs

| | |
|---|---|
| Users | Staff and Admin Cognito users. There is no anonymous-visitor account to reset. |
| Systems | Cognito user pool `eu-west-1_eKINGUN3I`; `10-data-auth`; possibly a new Lambda + KMS key; the notification microservice. |
| Specs | `auth/account-access-emails` (parent, FR-6/NFR-5); `enhancement/email-notification-microservice` (channel); archived `bugfix/admin-user-invite-and-reset`. |

## 9. Visual Reference

- Source: **None.** The existing `/forgot-password` screens are unchanged by every option below; only the delivery path moves. If Option B is chosen, its screens are the *existing* ones re-pointed at our own endpoints — a design review would then be warranted.

## 10. Requirement delta preview

**ADDED** — the reset message is delivered through the microservice; the delivery path is exercised by a manual end-to-end check before the spec is called done (D-6's lesson, which found two live defects in ATP-71).
**MODIFIED** — ATP-71 FR-6 inherits §2's verification and §2.2's corrected root cause.
**REMOVED** — none.

## 11. Approach options

### Option A — `CustomEmailSender` Lambda (ATP-71's assumed route)

A new Lambda decrypts Cognito's code and publishes to the microservice.

| | |
|---|---|
| ✅ | Keeps Cognito's reset state machine — expiry, attempt limits, user-enumeration resistance — which is real security we get for free. |
| ✅ | Premise verified (§2.1). Blast radius small today (§2.3). |
| ❌ | C-1: our function owns **every** pool email, forever. |
| ❌ | C-2/C-4: KMS key, three grants, and a full-parameter `UpdateUserPool` against a pool with real accounts. |
| ❌ | New deployable unit to own; `10-data-auth` is the `DEPLOY_INFRA`-gated stack, so iteration is slow. |

### Option B — Our own reset flow, reusing the OTP machinery we already run

Cognito's forgot-password is bypassed. Our backend issues the code, mails it through the microservice, verifies it, and calls `AdminSetUserPassword`.

| | |
|---|---|
| ✅ | **The machinery already exists and is in production**: `registrations.service.ts` issues verification codes through this exact channel, with HMAC-SHA-256 hashed codes, Prisma persistence and the canonical timing budget in `mail/mail-timing.ts`. |
| ✅ | No KMS, no `UpdateUserPool`, no C-1, no new trigger. Ordinary backend code, on the fast-moving `20-backend` stack. |
| ✅ | The mail path is the one ATP-71 just hardened and proved end to end. |
| ❌ | **We take ownership of reset security**: rate limiting, expiry, single-use, and user-enumeration resistance become ours to get right. Cognito does these already. |
| ❌ | Two reset mechanisms would exist unless Cognito's is explicitly disabled. |

### Option C — Ship nothing; rely on admin-mediated reset

ATP-71 made admin-initiated reset work. A stranded user asks an admin.

| | |
|---|---|
| ✅ | Zero engineering, zero new attack surface, available today. |
| ❌ | Not self-service; costs an admin's time and blocks the user until someone answers. |
| ❌ | Leaves a visible **Forgot password** button that does not work — arguably worse than not offering it. |

## 12. Recommended approach

**Option A, and the reasoning is security ownership, not cost.**

Option B is genuinely tempting — the machinery exists, it avoids every condition in §2.1, and it lives on the stack we can iterate on. But a password reset is an account-takeover path, and the properties Cognito gives for free are precisely the ones that are easy to get subtly wrong: constant-time responses that don't reveal whether an address exists, attempt throttling per user rather than per IP, single-use codes, and expiry that cannot be extended by replay. `registrations.service.ts`'s OTP is a *registration* flow — a weakness there costs a spurious registration; the same weakness on password reset costs an account.

C-1's cost is small **today** (§2.3) and the trade is honest: we accept a standing obligation to handle every pool email in exchange for not writing our own credential-reset state machine.

⚠️ **This is a recommendation, not a decision. It is the user's to overrule** — and Option B is defensible if the team would rather own straightforward code than an AWS trigger with a KMS dependency. If B is chosen, its spec must budget real work for the four security properties above and name how each is gated.

## 13. Risks, dependencies and open questions

| ID | Item |
|---|---|
| R-1 | **C-4 is the dangerous step.** A partial `UpdateUserPool` silently resets omitted settings on a pool with live accounts. Mitigation: read the full current configuration, compose the update from it, and verify by diff after applying. Rehearse against a throwaway pool first. |
| R-2 | §2.4's coupled deploy. FR-7 and any pool change ride the same `DEPLOY_INFRA=true` build. Sequence deliberately; announce it. |
| R-3 | **Delivery must be proven, not inferred.** ATP-71's D-6 found two live defects — a missing IAM grant and a UUID used as a recipient — that 1203 green tests did not. This spec inherits that requirement verbatim. |
| R-4 | The microservice reports outcome **after** the real SMTP send (verified in its source: `mailer.service.ts::sendMail` awaits `transporter.sendMail` before returning, and `@MessagePattern('send')` is RPC-capable). A Lambda that publishes fire-and-forget will not know whether the code was delivered — the same limitation ATP-71 recorded. Worth deciding deliberately this time. |
| Q-1 | Is self-service reset **required**, or is admin-mediated reset (now working) acceptable for a pool of staff/admin users only? Option C is only embarrassing because the button exists; removing the button is a third answer nobody has priced. |
| Q-2 | If Option A: does the function handle **every** `triggerSource` (C-1), or explicitly no-op the ones the pool cannot currently emit and fail loudly if one arrives? |

## 14. Success criteria

1. A user who requests a password reset **receives the email** and completes the reset — confirmed by a manual end-to-end check against DEV, **recorded** rather than inferred (R-3).
2. The reset remains code-based; no plaintext password is ever emailed.
3. No pool setting is changed except deliberately — verified by a before/after diff of the full pool configuration (R-1).
4. `docs/trd/trd.md` §12.1's account of the pool's mailer is corrected to match reality (§2.2).

## 15. Next step

`/akili-specify auth/forgot-password-delivery` — **after** Q-1 and the Option A/B/C decision are answered. Both change what gets specified, and §12 is explicitly overrulable.
