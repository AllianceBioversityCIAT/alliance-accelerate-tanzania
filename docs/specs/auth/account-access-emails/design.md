# Design — Account-access emails that actually arrive

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `auth/account-access-emails` |
| Jira | **ATP-71** |
| Date | 2026-09-21 |
| Requirements | [`requirements.md`](./requirements.md) |
| Depth | **Standard** — see §11, which recommends narrowing this spec to Phase 1 |
| Delegation | Design authored inline; no subagent spawned (within the 4-file read threshold via targeted lookups) |

## 2. Approach Overview

**One sentence: we send what we generate, and we leave what Cognito generates to Cognito — routing its mail elsewhere rather than rebuilding its flow.**

```
FR-1..FR-5, FR-7  (Phase 1)            FR-6  (Phase 2)
──────────────────────────             ────────────────
UsersService                           Cognito ForgotPassword
  generates the temp password            generates the code
  └─ MailService.sendInvitation          └─ CustomEmailSender trigger
       └─ microservice  ✅ proven             └─ microservice
                                              ⚠️ premise unverified
```

The asymmetry is the whole design. For invitation and admin reset, Cognito's mailer is not merely unreliable — **it is not involved at all**, because we already hold the credential. `MessageAction: 'SUPPRESS'` stays exactly as it is; we simply stop throwing away the message we could have sent.

## 3. Data Model Changes

**None.** No Prisma model, column, migration, or `pii-consent.policy.ts` change. The temporary password is transient: generated, sent, returned, never persisted.

## 4. API Surface & Contracts

Two existing `Admin`-guarded endpoints gain one field each. No new routes.

| Endpoint | Today | After |
|---|---|---|
| `POST /api/v1/users` | `{ user, temporaryPassword }` | `{ user, temporaryPassword, emailSent }` |
| `POST /api/v1/users/:id/reset-password` | `{ temporaryPassword }` | `{ temporaryPassword, emailSent }` |

`emailSent` is a boolean: the transport accepted the message. **It is not a delivery receipt** — the microservice offers none on this path (`email-notification-microservice` D-H), and D-6 in the requirements records that gap. The field name says `sent`, not `delivered`, deliberately.

⚠️ **Under `MAIL_TRANSPORT=no-op` (local dev), `emailSent` is `true`** — the no-op transport resolves successfully by design. That is consistent with how every other flow in this codebase behaves under `no-op` and must be documented where the field is, so nobody reads a local `true` as proof of delivery.

## 5. Backend Design

### 5.1 New mail templates

Two templates under `backend/src/mail/templates/`, built the same way `receipt.template.ts` now is (post-ATP-67): the link is resolved **per call** from `getPublicAppBaseUrl()`, never at module load, so a misconfiguration costs one email rather than every suite that imports the file.

| Template | Blocks (existing `EmailBlock` vocabulary) |
|---|---|
| `invitation.template.ts` | `paragraph` (who invited them, to what) · `callout` (the temporary password, with a caption saying it is single-use) · `link` (sign-in, `${base}/login`) · `note` (they will be asked to set a new password) |
| `admin-reset.template.ts` | `paragraph` · `callout` (new temporary password) · `link` (sign-in) · `note` |

Both carry a plain-text part alongside the HTML (NFR-4). No new layout, no new block kind — `renderEmailHtml` is reused unchanged, which is the only mitigation available for D-7 (no harness here rasterizes email HTML).

### 5.2 `MailService`

Two methods added beside `sendApproval` / `sendRejection`, with the identical shape: build the message, hand it to the private `dispatch(kind, message)`.

`dispatch` already logs `kind` and `reference` and **never the body** — the discipline NFR-1 depends on. It is preserved, not re-derived.

**Correlation id (DD-3).** `MailMessage.reference` is optional and the contact path passes none, logging `reference=n/a`. That is unusable for operations here: a failed invitation would be indistinguishable from any other. These two paths pass the **Cognito `sub`** as the reference — an opaque identifier, the same pseudonymous shape as the registration reference the other paths log, and **not** the email address. An operator can then correlate a failure to a user without the log ever carrying PII.

### 5.3 `UsersService`

`create()` and `resetPassword()` each gain a dispatch step after the Cognito call succeeds.

- **Awaited, inside its own `try`/`catch`** (NFR-2). Not fire-and-forget. This project has lost mail to a frozen Lambda execution environment twice — the registration OTP and the receipt — and `context.callbackWaitsForEmptyEventLoop` does not protect an `async` handler. The established shape is `RegistrationsService.dispatchReceiptEmail`; copy it.
- **The `catch` swallows and logs, then reports `emailSent: false`** (FR-4). The Cognito user already exists and cannot be un-created; failing the request would report a false negative and invite a duplicate-create retry.
- **The credential is passed to the template and to the response, and nowhere else** (NFR-1) — not to the logger, not to `ActorAuditLog`.

### 5.4 What is deliberately not changed

`MessageAction: 'SUPPRESS'` stays. `AdminSetUserPassword(Permanent: false)` stays. The account remains in `FORCE_CHANGE_PASSWORD`. We are adding a send, not altering the Cognito interaction.

## 6. Frontend Design

One component changes: the credential-handoff view reached from `CreateUserDialog` (and its reset equivalent).

| State | Renders |
|---|---|
| `emailSent: true` | The existing password + copy affordance, plus a confirmation line that the invitation was emailed |
| `emailSent: false` | The same, plus a `text-warning` line stating the email could not be sent and the password must be shared directly |

Token discipline per `docs/ux-ui/design.md` §7. ⚠️ **No `/NN` opacity modifier on a semantic token** — they emit no CSS in this project (recorded in `docs/specs/quick/quick-log.md`); use `opacity-*` or an existing solid token.

The password is shown in **both** states (FR-2). The failure is presented as a *delivery* failure, never as a failure to create the user (FR-3's negative clause).

## 7. Security & RBAC

| Concern | Handling |
|---|---|
| A credential now travels by email | Accepted by the product owner. Single-use; `FORCE_CHANGE_PASSWORD` is retained, so possession of the mail without a prompt change yields nothing lasting. |
| Credential in logs | NFR-1. `dispatch` logs `kind` + `sub` only. A test asserts the logged strings contain neither the password nor the body. |
| Credential in the response | Unchanged from today — `Admin`-guarded route, `JwtAuthGuard` + `RolesGuard`. |
| Enumeration | Unchanged. These are `Admin`-only routes; the caller already knows the address. **`/forgot-password`'s** enumeration resistance is Cognito's and stays Cognito's — one of the reasons Phase 2 re-routes rather than reimplements. |
| Actor PII | Untouched. No actor record is read or written; `pii-consent.policy.ts` is not involved. |

## 8. Infrastructure / Deployment

| Change | Stack | Ships on an ordinary merge? |
|---|---|---|
| Templates, `MailService`, `UsersService`, UI | `20-backend` + web assets | ✅ Yes |
| Retire `InviteMessageTemplate` + `PortalUrl` (FR-7) | `10-data-auth` | ❌ **No — needs `DEPLOY_INFRA=true`** |
| `CustomEmailSender` trigger (FR-6) | `10-data-auth` + new Lambda + KMS | ❌ **No** |

⚠️ **`DEPLOY_INFRA` defaults to `false`.** Merging FR-7 changes the repository, not the deployed pool. Any task touching `10-data-auth` must say so in its own text (NFR-5), and FR-7 is not "done" until a build with that flag has run.

## 9. Decision Records (ADR-style)

> **ADR numbering:** an ADR for DD-1 is warranted, but the number is **not allocated here.** Root `CLAUDE.md` § Concurrency protocol forbids allocating a shared monotonic id from a spec branch. `ADR-015` is the highest on `main` as of 2026-09-21 (`origin/dev` carries no real TRD divergence). Allocate at apply time, on the default branch, after re-checking unmerged branches.

### DD-1: Split delivery by who generates the credential

Invitation and admin reset are sent by our backend through `MailService`. `/forgot-password` keeps Cognito's flow and re-routes its mail.

**Rejected — route everything through a `CustomEmailSender` trigger.** Clean, but nothing ships until an infra deploy runs with a non-default flag, and with `SUPPRESS` retained the trigger would never fire for invitations anyway. Coupling the half that needs no infrastructure to the half that does delays it for no benefit.

**Rejected — reimplement `/forgot-password` on the registration OTP machinery.** Cheapest and most dangerous. It re-derives enumeration resistance, code lifetime, replay protection and throttling on an account-takeover path. This project built that once, carefully, for registration — but "verify an address before submitting a form" and "take over an administrator account" are not the same stakes. **Do not reimplement auth to avoid a CloudFormation change.**

### DD-2: Keep a code, not a freshly-issued password, on `/forgot-password`

The product owner asked for "a new password by email". Counter-recommended and accepted 2026-09-21.

Emailing a new password invalidates the current one the moment **anyone** submits the form. An attacker who knows only an administrator's address can lock them out repeatedly without ever reading the inbox. Cognito's code flow leaves the existing password valid until the code is used. **The delivery channel is the defect; the security shape is not.**

### DD-3: Log the Cognito `sub` as the correlation id, never the address

See §5.2. Preserves NFR-1 while making a failure actionable.

### DD-4: `emailSent` is a boolean on the existing response, not a new endpoint

The admin needs one bit at exactly the moment the password is shown. A separate status endpoint would be a second round trip for information the first one already has.

### DD-5: Retire the Cognito `InviteMessageTemplate` and `PortalUrl`

**⚠️ Reversion challenge (Step 2.3) — this removes behaviour the codebase ships. Question asked: what does removing it break?**

**Answer, and it is not nothing.** The template is unreachable from the application (invitations are suppressed), but it is *not* unreachable absolutely: a user created directly in the **AWS console** does trigger it. Removing it means such a user receives Cognito's unbranded default email instead of the branded one.

That is an acceptable trade, and the reason is that the alternative is worse: the branded template's CTA points at a hardcoded domain that will go stale, so keeping it preserves a *branded email containing a broken link* on exactly the path nobody monitors. Unbranded-and-correct beats branded-and-wrong.

**Recorded consequence:** console-created users get a plain Cognito invitation over the unreliable channel. The supported path is the admin console, and that path is covered by FR-1. If console creation ever becomes a supported workflow, this decision must be revisited — it is not a permanent judgement that the template had no value.

### DD-6: Phase 2 is a verification spike before it is an implementation

FR-6 rests on an **unverified** claim about AWS (**KZ-011**). Designing the trigger, the KMS key and the stack change now would mean specifying an implementation whose premise nobody has checked — which is exactly the failure mode KZ-011 exists to catch.

Phase 2 therefore begins with a spike that answers three questions with citations: (a) does `CustomEmailSender` intercept ForgotPassword, (b) what must the Lambda do to decrypt the code, (c) what happens to *all other* Cognito mail once the trigger is attached. Only then is it designed.

## 10. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R-1 | "Sent" read as "delivered" | Field named `sent`; §4 states it explicitly; D-6 records the gap; a manual inbox check is required at the HITL pause. |
| R-2 | `emailSent: true` under `no-op` misleads a local developer | Documented at the field and in §4. |
| R-3 | The microservice rejects this message shape | A-1 in requirements. **Confirm before building the templates** — the shape matches approvals, but that is an assumption until exercised. |
| R-4 | The premise sweep is missed | `backend/CLAUDE.md`'s "no-email credential handoff (intentional)" section and the archived `admin-user-invite-and-reset` rationale both rest on "Cognito mail is unusable". Per **KZ-004**, grep the *premise*, not the phrase. Owned by a named task. |
| R-5 | FR-7 merged and believed live | NFR-5 + §8. Stated in the task text, not only here. |
| R-6 | Phase 2 designed from memory | DD-6. |

## 11. Budget & Sizing (Step 2.4)

Estimated **against the finished design**, not the pre-design guess.

| | Tasks | LOC (incl. tests) | Review rounds |
|---|---|---|---|
| **Phase 1** | 9 | ~640 | 2 |
| **Phase 2** | 4 | ~230 + infra | 2 |
| **Total** | **13** | **~870** | **3–4** |

### ⚠️ Sizing finding: this spec should be narrowed to Phase 1

Thirteen tasks and ~870 LOC is above `Standard`, and the two halves differ in kind, not just in sequence: Phase 1 is application code with proven dependencies; Phase 2 is infrastructure, a new Lambda in the auth path, and a premise nobody has verified.

**Recommendation: this spec covers Phase 1 (9 tasks, ~640 LOC). Phase 2 becomes a sibling spec, opened by the DD-6 spike.** Two reasons:

1. **Specifying Phase 2 now would violate its own gate.** DD-6 says do not design on an unverified premise; writing its tasks here would do precisely that.
2. Phase 1 can merge and deliver value while Phase 2 waits on an infrastructure window it does not control.

FR-6 and NFR-5 stay in `requirements.md` as the recorded intent, marked Phase 2, so the commitment is not lost — only its task breakdown is deferred to where it can be made honestly.

**This is a recommendation, not a decision. It is the user's to overrule.**

## 12. Test Plan Outline

| Layer | Covers | Notes |
|---|---|---|
| Template unit specs | D-1, NFR-3 | Mirror `receipt.template.spec.ts`: derived link in both parts, trailing-slash normalisation, refusal on a bad base, and a guard that no hardcoded host appears. |
| `MailService` specs | NFR-1 | Assert the logged strings contain neither the password nor the body; assert the `sub` is the reference. |
| `UsersService` specs | FR-1..FR-5 | Rejecting transport → 2xx + `emailSent: false` + user still created. |
| Handler e2e (`lambda-handler.e2e.spec.ts`) | NFR-2, D-4 | The **only** harness that reproduces the freeze class; supertest cannot. |
| Component tests | FR-2, FR-3, D-5 | Both branches; password present in both. |
| **Manual, at the HITL pause** | **D-6** | Create a real user against DEV and read the mailbox. **No green suite substitutes for this.** |
