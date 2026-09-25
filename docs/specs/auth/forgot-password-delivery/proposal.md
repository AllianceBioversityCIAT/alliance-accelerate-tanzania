# Proposal — Self-service password reset that reaches the user

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Type | Change |
| Status | **Decided 2026-09-23 — Path 1 (`CustomEmailSender`), simplified. See §12.1, which reverses §12.** |
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
| `AutoVerifiedAttributes` / `VerificationMessageTemplate` | `["email"]` / `CONFIRM_WITH_CODE` | ⚠️ an email-attribute change **can** emit a `CustomEmailSender_*` trigger — the one live edge besides ForgotPassword. *(⚠️ Corrected post-deploy, validation-report.md B-4: this row named the source `CustomEmailSender_VerifyUserAttribute`, asserted here without a measurement — the trigger's reachability was right, this name was not. Measured live in DEV: the source is `CustomEmailSender_UpdateUserAttribute`. ⚠️ Stale the same day: `2960d74` — an unrelated, owner-requested change — made `update()` set `email_verified` in the same call, so this edge no longer fires at all. Kept as the historical record of a real, measured trigger, not as a description of current behaviour.)* |

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

## 12. Recommended approach — **REVISED 2026-09-22 after judgment-day escalated the first design**

> **The original recommendation was Option A, and it was wrong.** A design was written against it, two blind judges reviewed it independently, and they agreed on **14 findings** with **zero contradictions** (`judgment.md`). Three were not defects in how the design was written — they were consequences of Option A itself. The recommendation is therefore re-opened here rather than repaired downstream.

### What the judgment established

| Confirmed finding | Consequence for Option A |
|---|---|
| The awaited microservice reply needs an `id` + `reply_to`; `buildMicroserviceEnvelope` **omits `id` by contract**, and both its docblock and `enhancement/email-notification-microservice` FR-2 record that omission as deliberate | The honest-outcome mechanism is not available without amending a settled contract |
| Cognito's trigger response ceiling is **not configurable**, and Cognito **retries** on timeout | The timeout path yields **duplicate codes plus an error**, not a clean failure |
| `10-data-auth` cannot reach the broker credentials, the queue name, the API key, the sender identity or `PUBLIC_APP_BASE_URL` — all live in `20-backend`, which deploys **after** it | The function cannot be configured where the trigger forces it to live |
| `10-data-auth` has **no SAM transform and no build step** | Hosting a Lambda there is a toolchain change, unbudgeted |
| The trigger is all-or-nothing, and `users.service.ts::update()` can emit `CustomEmailSender_VerifyUserAttribute` *(⚠️ corrected post-deploy, validation-report.md B-4: measured to be `CustomEmailSender_UpdateUserAttribute`)* | Failing loudly on unhandled sources **breaks a shipped admin feature** |
| `UpdateUserPool` resets every live setting absent from the template | The most dangerous step in the change, with no mechanism designed for it |

**Seven of the fourteen findings do not exist under Option B.** No trigger, no KMS key, no Cognito ceiling, no all-or-nothing, no pool-wide update, no toolchain change, no cross-stack configuration problem.

### The argument that drove the original recommendation was false — measured, not re-reasoned

§12 originally rejected Option B on one ground: that a password reset is an account-takeover path, and Cognito gives for free the properties that are easy to get subtly wrong. **Those properties are already implemented in this codebase, in production, and tested** — verified by reading, not assumed:

| Property I claimed we would have to build | Where it already exists |
|---|---|
| Code expiry | `email-verification.service.ts:279`, enforced in the lookup itself (`expiresAt: { gt: now }`, `:305`) |
| Single use | `consumedAt: null` in the same lookup |
| Attempt limiting | `OTP_MAX_ATTEMPTS = 5` (`:184`), checked per row (`:310`) |
| **Constant-time comparison** | `safeEqualHex` (`:310`) |
| Plaintext never stored | HMAC-SHA-256 `codeHash`; the schema comment states it outright |
| Send-rate limiting | `EmailVerificationSendLimitExceededError` (`:197`) |
| Request throttling | `RegistrationsThrottleGuard` (20 / 60 s) |
| **Timing-oracle resistance** | `padToVerificationCodeResponseFloor` + `VERIFICATION_CODE_RESPONSE_FLOOR_MS` — built across two review rounds specifically to close an address-enumeration timing channel |

The last row inverts the original argument completely. Judgment finding **C-3** established that Option A **opens** a multi-second timing oracle — KMS decrypt, AMQP connect, a per-message CLARISA HTTP call, then SMTP — and that the countermeasure **cannot** be applied there, because Cognito owns the response and there is nowhere in our code to pad. Option B runs in the one place that countermeasure already lives.

So the security comparison does not favour Option A. It favours Option B, and my original reasoning had it backwards because I asserted what Cognito provides instead of checking what we already had.

### Recommendation: **Option B**

Build the reset flow in `20-backend`, on the `EmailVerificationService` machinery already serving public registration.

⚠️ **What Option B still owes, stated so it is not discovered later:**

1. **A second reset mechanism must not coexist.** Cognito's own `ForgotPassword` stays reachable unless it is explicitly closed off at the app client. That is a deliberate deliverable, not a detail.
2. **The OTP machinery is a *registration* flow today.** Its constants were tuned for that risk profile — a spurious registration, not a stolen account. Every constant must be re-justified for this use, not inherited by proximity.
3. **`AdminSetUserPassword` with `Permanent: true`** becomes the final step. That call now has its IAM grant (fixed 2026-09-22, `0f8c8f6`) — but D-4's lesson stands: no suite exercises IAM.
4. **The enumeration surface moves to our endpoints.** The response floor exists, but it must be composed for *this* flow, not reused blindly — `mail-timing.ts`'s own history records a floor that was found insufficient because a term was omitted.

⚠️ **Still a recommendation, still the user's to overrule.** Option A remains implementable if the team prefers Cognito to own the state machine — but it now carries fourteen documented findings, of which six are severe, and the three structural ones would have to be designed around rather than written around.

## 12.1 DECISION — 2026-09-23: **Path 1 (`CustomEmailSender`), simplified.** This reverses §12.

The user chose **Path 1** after both routes were costed in plain terms, and ruled **SES out of every path, permanently** — it is not to be proposed again at any layer.

**The reasoning that decided it, in the user's framing:** Path 1 replaces only the *sending*. Everything delicate — generating the code, expiring it, checking it, limiting attempts, stopping one person from locking out another — stays AWS's problem. Path 2 moves all of that onto us, and round 2 showed we would have got parts of it wrong.

### The simplification that makes this affordable — and it removes a requirement I invented

Round 1's three hardest findings (**C-1** the envelope cannot carry a reply id, **C-4** the microservice resolves rather than throws on SMTP failure, **C-7** Cognito's trigger ceiling plus retries) all existed to serve **one requirement: FR-4's "the user is not told a message was sent unless it was."**

**No other flow in this system does that.** Receipts, approvals, rejections, the registration OTP — every one publishes and returns. FR-4 was added by me, for this flow alone, and it is what dragged in the RPC round trip, the timeout budget, and the duplicate-code failure mode.

**Dropped.** The function decrypts, publishes, and returns. Consistent with the rest of the system.

| What this costs | What it dissolves |
|---|---|
| If the send fails, the user sees "check your email" and must retry — the same behaviour every other mail path in this product already has | **C-1, C-4, C-7** entirely; the reply queue, correlation, consumer lifecycle and timeout budget stop existing |

### Round-1 findings, dispositions under this decision

| # | Disposition |
|---|---|
| C-1, C-4, C-7 | **Dissolved** by dropping the awaited reply (above) |
| **C-8** | **Resolved, and the objection was narrower than it read.** The blocker was that `10-data-auth` cannot `Fn::ImportValue` the broker credentials. It does not need to: `MailMicroserviceSecret` has a **predictable name** (`${AWS::StackName}-mail-microservice-secret`, `20-backend/template.yaml:172`), so the function reads it **at runtime by name** via the SDK. A runtime dependency, not a deploy-time one — and the trigger only fires long after both stacks exist. `PUBLIC_APP_BASE_URL` becomes a `10-data-auth` parameter. |
| C-2 | **Moot** — under Path 1 the frontend does not change at all, so the dead-branch question never arises. |
| C-3 | **Out of scope.** `PreventUserExistenceErrors` is a real finding about the *login* path and survives as its own concern; it is not this spec's to fix, and Cognito's existing reset behaviour is unchanged by us. |
| C-5, C-6, C-9, C-10, C-11, C-12, C-13, C-14 | **Still live. Each must be resolved in the design, by name.** |

### Bug `bugfix/otp-cross-caller-lockout` — deferred, and no longer a prerequisite

It was a prerequisite for Path 2, which reused that machinery. **Path 1 does not touch it** — Cognito keeps generating and validating codes. The bug stays open at its own priority: it lets someone grief a targeted public registration, which is real but not urgent for this product's threat model.

## 13. Risks, dependencies and open questions

| ID | Item |
|---|---|
| R-1 | **C-4 is the dangerous step.** A partial `UpdateUserPool` silently resets omitted settings on a pool with live accounts. Mitigation: read the full current configuration, compose the update from it, and verify by diff after applying. Rehearse against a throwaway pool first. |
| R-2 | §2.4's coupled deploy. FR-7 and any pool change ride the same `DEPLOY_INFRA=true` build. Sequence deliberately; announce it. |
| R-3 | **Delivery must be proven, not inferred.** ATP-71's D-6 found two live defects — a missing IAM grant and a UUID used as a recipient — that 1203 green tests did not. This spec inherits that requirement verbatim. |
| R-4 | The microservice reports outcome **after** the real SMTP send (verified in its source: `mailer.service.ts::sendMail` awaits `transporter.sendMail` before returning, and `@MessagePattern('send')` is RPC-capable). A Lambda that publishes fire-and-forget will not know whether the code was delivered — the same limitation ATP-71 recorded. Worth deciding deliberately this time. |
| Q-1 | Is self-service reset **required**, or is admin-mediated reset (now working) acceptable for a pool of staff/admin users only? Option C is only embarrassing because the button exists; removing the button is a third answer nobody has priced. |
| Q-2 | If Option A: does the function handle **every** `triggerSource` (C-1), or explicitly no-op the ones the pool cannot currently emit and fail loudly if one arrives? |

## 13.1 Decisions taken (Daniela Gómez, 2026-09-22) — these close §13's open questions

**Q-1 — Is self-service reset required? → YES. Build it.**
Reason given, recorded because it is the reason and not the conclusion that should survive: *an admin may not be available when someone is locked out*, and then the user is simply stuck. Admin-mediated reset (ATP-71) is a fallback, not a substitute. **Option C is rejected** and removing the button is off the table.

**Q-2 — What does the function do with trigger sources the pool cannot currently emit? → FAIL LOUDLY.**
An unrecognised `triggerSource` must raise, not be silently ignored. Rationale accepted as proposed: if someone later enables MFA, a silent no-op means users stop receiving codes and nobody learns why. A loud failure surfaces the gap on the day the setting changes. This is the same failure mode as ATP-71's missing IAM grant — broken for months, invisible, because nothing complained.

**Q-3 (raised by the user, and in scope) — the false `status: sent`.**
The user asked whether this spec should also address the fact that a send can be reported as successful when the microservice later rejects it (ATP-71's D-6 recorded this: the app logged `status=sent` and the microservice's alert arrived 800 ms later with *"No valid emails found in TO or CC"*).

**Ruling: in scope for THIS flow, and out of scope for ATP-71's admin flows.**

- **In scope here.** The self-service screen tells the user *"check your email"*. If the send failed, that sentence strands a user who by definition has no admin to fall back on — the exact scenario Q-1 was decided on. And §13's R-4 established, from the microservice's own source, that it replies **after** the real SMTP send (`mailer.service.ts::sendMail` awaits `transporter.sendMail` before returning; the handler is `@MessagePattern('send')`, which is RPC-capable). So an honest outcome is obtainable here. The latency objection that blocks this for admin operations is weakest in this flow: **the user is already waiting for that email.**
- **Out of scope for ATP-71's `CredentialHandoff`.** Different screen, different module, a spec already closed and merged. If this spec builds reply-consumption into the transport, adopting it there becomes a small separate change — which is the right shape for it.

⚠️ **REVERSED 2026-09-25 (validation-report.md D-9).** This ruling is argued entirely on the microservice replying **after** the real SMTP send, making an honest outcome obtainable by awaiting that reply. §12.1 (2026-09-23) drops the awaited reply — *"the function decrypts, publishes, and returns"* — and `requirements.md` FR-4 was rewritten to forbid claiming delivery either way. The premise this ruling stands on is gone, so its "in scope for THIS flow" conclusion does not survive §12.1 unchanged. Retained above, unedited, as the record of what the user decided and why on 2026-09-22 — not as this spec's current disposition.

## 14. Success criteria

1. A user who requests a password reset **receives the email** and completes the reset — confirmed by a manual end-to-end check against DEV, **recorded** rather than inferred (R-3).
2. The reset remains code-based; no plaintext password is ever emailed.
3. No pool setting is changed except deliberately — verified by a before/after diff of the full pool configuration (R-1).
4. `docs/trd/trd.md` §12.1's account of the pool's mailer is corrected to match reality (§2.2).

## 15. Next step

⚠️ **SUPERSEDED 2026-09-25 (validation-report.md D-8).** This section still names Option B as the next step. §12.1 (2026-09-23) reverses that recommendation to **Path 1**, and rules SES out permanently — §12 carries that reversal banner; this section, written under the same §12 it now contradicts, did not. Retained below as the historical record of what the pre-reversal recommendation asked for. Do not act on it, and — as `requirements.md` NFR-2/NFR-5 learned (validation-report.md D-5, D-6) — do not quote it without checking §12.1 first.

**Confirm the revised §12 recommendation (Option B), then re-run `/akili-specify auth/forgot-password-delivery`.**

The existing `requirements.md` largely survives a route change — FR-1 through FR-5 are behaviour contracts, not mechanisms. The exceptions, which must be revisited rather than carried forward:

- **FR-4's identical-failure clause** — judgment finding C-3 showed it is in direct tension with the honest-failure clause beside it. Under Option B both live in our code, so the tension is resolvable; under Option A it was not. It still has to be resolved explicitly.
- **NFR-4** (KMS grants) becomes moot under Option B and should be struck rather than left to confuse.
- **NFR-5's** coupled-deploy warning survives and becomes *more* important, not less: it is now the only reason this spec touches `10-data-auth` at all.

`design.md` is superseded in full. It is retained unedited as the input `judgment.md` audited — rewriting it would leave that ledger describing a document that no longer exists.
