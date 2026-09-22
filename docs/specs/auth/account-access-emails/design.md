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

> ⚠️ **Corrected after judgment round 1 (J-1).** This table named `POST /api/v1/users/:id/reset-password`, which does not exist. The route is `@Post(':id/password')` in `users.controller.ts`. This section is the contract an Implementer works from, so a wrong path here means the real handler never gains `emailSent` — FR-3 and FR-5 would fail silently.

| Endpoint | Today | After |
|---|---|---|
| `POST /api/v1/users` | `{ user, temporaryPassword }` | `{ user, temporaryPassword, emailSent }` |
| `POST /api/v1/users/:id/password` | `{ temporaryPassword }` | `{ temporaryPassword, emailSent }` |

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

**Correlation id (DD-3).** `MailMessage.reference` is optional and the contact path passes none, logging `reference=n/a`. That is unusable for operations here: a failed invitation would be indistinguishable from any other. These two paths pass the Cognito **`sub` attribute** as the reference — opaque, the same pseudonymous shape the other paths log, and not the email address.

> ⚠️ **Corrected after judgment round 1 (J-4) — the original version of this decision was wrong in the worst direction.** It said "pass the Cognito `sub`" as though `sub` were already in hand. It is not, and what *is* in hand is the email:
>
> - `create()` calls `AdminCreateUser` with `Username: dto.email`, and `users.serializer.ts` derives the public `id` from `user.Username`. **The `id` this system passes around IS the email address.**
> - `resetPassword(id)` has only that same email-shaped `id` in scope, and `AdminSetUserPasswordResponse` is an **empty interface** — it returns no attributes at all.
>
> Followed literally, the original DD-3 would have written a plaintext address to every attempt and outcome line: the exact NFR-1 violation it claimed to prevent.

**The `sub` must therefore be obtained explicitly, and the implementation must not substitute `id` when it is absent:**

| Flow | Where `sub` comes from |
|---|---|
| `create()` | `AdminCreateUserResponse.User.Attributes`, the entry whose `Name` is `sub` |
| `resetPassword()` | An `AdminGetUser` call — the command is **already imported and used** by `UsersService.get()`. One extra Cognito round trip on a rare admin action is the price of not logging an address. |

⚠️ **Grounded in repo precedent, not an AWS citation (round 2 note).** That Cognito returns a `sub` entry *inside* the attribute array is corroborated by code already running here — `acting-admin.resolver.ts` filters `ListUsers` by `sub` and its fixtures show `sub` living in that same `Attributes` shape — but the SDK docstrings promise only "the user's attributes". Same class of claim as the three J-3 marked; recorded to the same standard. It is **safe either way**: if `sub` is absent the fallback below applies, and the fallback is the thing that protects NFR-1.

⚠️ **Amended 2026-09-21 during T-5 execution — the `AdminGetUser` call must not be able to fail the request.**

As originally written, this section weighed the extra round trip on **one axis only**: *"One extra Cognito round trip on a rare admin action is the price of not logging an address."* Latency and cost. **It never considered the failure mode**, and T-5's implementation — faithful to the text — placed the call inside `resetPassword`'s outer `try`, whose `catch` runs `mapCognitoError` (typed `: never`). A thrown `AdminGetUser` therefore **fails a request whose password change has already committed**, and the admin never receives the new credential. The user is locked out and nobody holds it.

The ruling already existed in **§5.3**, written for `create()` and never applied here: *"that is precisely the state FR-4's boundary clause forbids, **reached through a different Cognito call than the one FR-4 was written about**."*

**The decisive asymmetry is not blast radius — it is what the call buys.** `create()`'s `AdminAddUserToGroup` is a required state change, so failing the request is *honest*. `AdminGetUser` here buys **only a log correlation id**, and this very section already rules *"Losing correlation is acceptable; logging an address is not."* **A call whose entire value this design declares optional must not be able to fail the operation.**

**Therefore:** the `AdminGetUser` send is wrapped so a throw degrades to `sub = undefined` and the flow continues to the dispatch, which then logs `reference=n/a`. That `catch` **must not log `id`** (NFR-1) — an error-name discriminator or nothing. The file already has two narrow absorb-one-outcome helpers (`listGroupNames`, `removeFromGroupIfPresent`) whose shape this matches, so it is idiom rather than invention.

*(Found by T-5's Implementer, who surfaced it honestly and mislabelled it a KZ-013 `(B)`; adjudicated by T-5's Reviewer as **(c) a spec gap**, since no requirement text reaches it and failing a diff for faithfully implementing an approved design charges the wrong party. The gap is the Leader's — this section is Leader-authored.)*

⚠️ **Two traps, both typed:** `User` and `Attributes` are **optional** in `AdminCreateUserResponse`, and `AdminGetUser` exposes the attribute list as **`UserAttributes`, not `Attributes`** — a difference this codebase already documents in `users.service.ts`'s `get()`. When `sub` cannot be resolved, the dispatch passes **no reference at all** (logging `n/a`, as contact does) and **MUST NOT** fall back to `id`. Losing correlation is acceptable; logging an address is not.

### 5.3 `UsersService`

`create()` and `resetPassword()` each gain a dispatch step after the Cognito call succeeds.

**Ordering is prescribed, not left to the Implementer (J/A-6).** In `create()` the dispatch goes **last — after the optional `AdminAddUserToGroup`**, not between the two Cognito calls. Both calls sit inside one outer `try` that routes any failure through `mapCognitoError`; dispatching between them means a group-assignment failure turns the whole request into an error response **after a live credential has already been emailed**, leaving a Cognito user the API reports as not created. That is precisely the state FR-4's boundary clause forbids, reached through a different Cognito call than the one FR-4 was written about.

> ⚠️ **Over-claimed, annotated during the ATP-71 three-dimension validation pass (2026-09-22) — not rewritten.** This paragraph's FR-4 citation reaches further than FR-4 actually goes. FR-4's boundary clause sits under *"GIVEN the mail transport will reject every message"* — it is scoped to the **mail-send path**, not to `AdminAddUserToGroup` failing, which is pre-existing Cognito behaviour this spec did not change and does not touch. The §5.2 amendment (below, added during T-5) reaches the correct ruling on this exact question for `AdminGetUser` and states the general principle this paragraph should have used instead: *"`AdminAddUserToGroup` is a required state change, so failing the request is honest."* What this ordering rule actually removes is narrower than "the state FR-4 forbids" — it removes only the **"a live credential was already emailed" conjunct** from that failure; a group-assignment failure after `create()` remains a request-failing error either way, dispatch-ordering aside, and always has been. The ordering choice is still correct and still required (T-4 pins it with a falsifier) — only the breadth of the reason given here was wrong.

- **Awaited, inside its own `try`/`catch`** (NFR-2). Not fire-and-forget. This project has lost mail to a frozen Lambda execution environment twice — the registration OTP and the receipt — and `context.callbackWaitsForEmptyEventLoop` does not protect an `async` handler. The established shape is `RegistrationsService.dispatchReceiptEmail`; copy it.
- **The `catch` swallows and logs, then reports `emailSent: false`** (FR-4). The Cognito user already exists and cannot be un-created; failing the request would report a false negative and invite a duplicate-create retry.
- **The credential is passed to the template and to the response, and nowhere else** (NFR-1) — not to the logger, not to `ActorAuditLog`.

### 5.4 What is deliberately not changed

`MessageAction: 'SUPPRESS'` stays. `AdminSetUserPassword(Permanent: false)` stays. The account remains in `FORCE_CHANGE_PASSWORD`. We are adding a send, not altering the Cognito interaction.

## 6. Frontend Design

One component changes, with **two call sites, not two components**: the credential-handoff view (`CredentialHandoff.tsx`), reached from `CreateUserDialog.tsx:192` (create) **and** `app/(admin)/admin/users/page.tsx:497` (reset — the flow T-5 made email). *(Corrected during the ATP-71 three-dimension validation pass, 2026-09-22 — the original wording, "and its reset equivalent", implied a second component and is the root cause of the FR-3 wording issue annotated below: because one component serves both flows, its copy must be path-neutral.)*

| State | Renders |
|---|---|
| `emailSent: true` | The existing password + copy affordance, plus a confirmation line that the invitation was emailed |
| `emailSent: false` | The same, plus a `text-warning` line stating the email could not be sent and the password must be shared directly |

> ⚠️ **Annotated, not rewritten (ATP-71 correction pass, 2026-09-22).** The row above describes the sent-state copy as naming "the invitation" — read literally, that excludes the reset call site this same section just established. Because `CredentialHandoff` is one component serving both flows, the copy that shipped is deliberately **path-neutral**: *"An email with this password was sent to the user."* (`CredentialHandoff.tsx`), never the word "invitation". `requirements.md` FR-3's Sent scenario carries the identical annotation, with the same reasoning and the same instruction not to "restore" the word.

Token discipline per `docs/ux-ui/design.md` §7. ⚠️ **No `/NN` opacity modifier on a semantic token** — they emit no CSS in this project (recorded in `docs/specs/quick/quick-log.md`); use `opacity-*` or an existing solid token.

The password is shown in **both** states (FR-2). The failure is presented as a *delivery* failure, never as a failure to create the user (FR-3's negative clause).

⚠️ **One existing string must change (J/B-7).** `CredentialHandoff.tsx` currently reads *"This password is shown only once. Share it securely (not by email)."* This feature makes that instruction false in the common case, and leaving it beside a new "the invitation was emailed" line would put the same screen in contradiction with itself. Revise it in the same task, not as a follow-up.

## 7. Security & RBAC

| Concern | Handling |
|---|---|
| A credential now travels by email | Accepted by the product owner. Single-use; `FORCE_CHANGE_PASSWORD` is retained, so possession of the mail without a prompt change yields nothing lasting. |
| Credential in logs | NFR-1. `dispatch` logs `kind` + a reference: the resolved Cognito `sub` when one is available, and **no reference at all** (`reference=n/a`) when it is not. *(Corrected during the ATP-71 three-dimension validation pass, 2026-09-22 — this row previously said "`sub` only", which describes only the success path. §5.2 as amended and `judgment.md` J-4 establish that it is the **fallback to no reference** — never a substitution of `id` — that actually protects NFR-1, since the `id` in scope at both call sites is the email address.)* A test asserts the logged strings contain neither the password, the body, nor any `@`. |
| Credential in the response | Unchanged from today — `Admin`-guarded route, `JwtAuthGuard` + `RolesGuard`. |
| Enumeration | Unchanged. These are `Admin`-only routes; the caller already knows the address. **`/forgot-password`'s** enumeration resistance is Cognito's and stays Cognito's — one of the reasons Phase 2 re-routes rather than reimplements. |
| Actor PII | Untouched. No actor record is read or written; `pii-consent.policy.ts` is not involved. |

## 8. Infrastructure / Deployment

| Change | Stack | Ships on an ordinary merge? |
|---|---|---|
| Templates, `MailService`, `UsersService`, UI | `20-backend` + web assets | ✅ Yes |
| Retire `InviteMessageTemplate` + `PortalUrl` (FR-7) | `10-data-auth` **and `infra/README.md` §3** | ❌ **No — needs `DEPLOY_INFRA=true`** (the README edit merges normally; the pool change does not) |
| `CustomEmailSender` trigger (FR-6) | `10-data-auth` + new Lambda + KMS | ❌ **No** |

⚠️ **`DEPLOY_INFRA` defaults to `false`.** Merging FR-7 changes the repository, not the deployed pool. Any task touching `10-data-auth` must say so in its own text (NFR-5), and FR-7 is not "done" until a build with that flag has run.

## 9. Decision Records (ADR-style)

> **ADR numbering:** an ADR for DD-1 is warranted, but the number is **not allocated here.** Root `CLAUDE.md` § Concurrency protocol forbids allocating a shared monotonic id from a spec branch. `ADR-015` is the highest on `main` as of 2026-09-21 (`origin/dev` carries no real TRD divergence). Allocate at apply time, on the default branch, after re-checking unmerged branches. **Still unallocated as of this correction pass (2026-09-22)** — `docs/trd/trd.md` §12.5 still ends at `ADR-015`; this is open, not dropped (see `execution.md`'s corrections section for the recorded reason).

> **Numbering note (added during the ATP-71 three-dimension validation pass, 2026-09-22):** the entries below appear as DD-1…DD-5, **DD-7, DD-6** — DD-7 was appended later, resolving `requirements.md` Q-3, after DD-6 already existed and was cited by number in `requirements.md` FR-6, `tasks.md`, and `execution.md`. It was placed after DD-5 rather than renumbered ahead of DD-6 to avoid invalidating those citations. The list below is in **insertion order, not numeric order** — noted here rather than reordered, for the same reason.

### DD-1: Split delivery by who generates the credential

Invitation and admin reset are sent by our backend through `MailService`. `/forgot-password` keeps Cognito's flow and re-routes its mail.

**Rejected — route everything through a `CustomEmailSender` trigger.** Clean, but nothing ships until an infra deploy runs with a non-default flag, and coupling the half that needs no infrastructure to the half that does delays it for no benefit. **That reason stands on its own and is the reason of record.**

> ⚠️ **Claim withdrawn from the load-bearing position (J-3).** This paragraph also asserted *"with `SUPPRESS` retained the trigger would never fire for invitations anyway."* That is an **unverified claim about Cognito's internals** — the same class this design marks as unverified in DD-6 and FR-6, asserted here as settled fact. It is now recorded as **unverified** and the rejection above does not depend on it. If it turns out the trigger *does* fire under `SUPPRESS`, Option A becomes viable for invitations too and DD-1 should be revisited — which is exactly the reconsideration an unmarked claim would have foreclosed.

**Rejected — reimplement `/forgot-password` on the registration OTP machinery.** Cheapest and most dangerous. It re-derives enumeration resistance, code lifetime, replay protection and throttling on an account-takeover path. This project built that once, carefully, for registration — but "verify an address before submitting a form" and "take over an administrator account" are not the same stakes. **Do not reimplement auth to avoid a CloudFormation change.**

### DD-2: Keep a code, not a freshly-issued password, on `/forgot-password`

The product owner asked for "a new password by email". Counter-recommended and accepted 2026-09-21.

Emailing a new password invalidates the current one the moment **anyone** submits the form. An attacker who knows only an administrator's address can lock them out repeatedly without ever reading the inbox. **That property belongs to the *shape* — it holds for any "email a fresh password" design, on any provider — so the argument does not rest on Cognito specifics.**

The complementary claim, that **Cognito's code flow leaves the existing password valid until the code is used**, is standard documented `ForgotPassword`/`ConfirmForgotPassword` behaviour but is ⚠️ **uncited here (J-3)**. It is not load-bearing: even if Cognito behaved otherwise, the reasoning above would still reject minting a password on request. Cite it when Phase 2 is designed.

**The delivery channel is the defect; the security shape is not.**

### DD-3: Log the Cognito `sub` as the correlation id, never the address

See §5.2. Preserves NFR-1 while making a failure actionable.

### DD-4: `emailSent` is a boolean on the existing response, not a new endpoint

The admin needs one bit at exactly the moment the password is shown. A separate status endpoint would be a second round trip for information the first one already has.

### DD-5: Retire the Cognito `InviteMessageTemplate` and `PortalUrl`

**⚠️ Reversion challenge (Step 2.3) — this removes behaviour the codebase ships. Question asked: what does removing it break?**

**Answer, and it is not nothing.** The template is unreachable from the application (invitations are suppressed), but it is likely *not* unreachable absolutely: a user created directly in the **AWS console** is understood to trigger it. Removing it would then mean such a user receives Cognito's unbranded default email instead of the branded one.

> ⚠️ **Marked unverified (J-3).** "Console-created users trigger `InviteMessageTemplate`" is a claim about Cognito, not about this repository, and it is uncited. It is recorded as a *possible* consequence rather than a certain one. **The decision below does not depend on which way it resolves** — if the claim is false, the template is simply dead in every case and removing it costs nothing at all.

That is an acceptable trade, and the reason is that the alternative is worse: the branded template's CTA points at a hardcoded domain that will go stale, so keeping it preserves a *branded email containing a broken link* on exactly the path nobody monitors. Unbranded-and-correct beats branded-and-wrong.

⚠️ **Second site, added after judgment round 1 (J-2).** FR-7's clause is *"no reference to either from any other file"*, and `infra/README.md` §3 documents `PortalUrl` in its Shared-parameters table. The original version of this decision discussed only the CloudFormation template, which would have retired the parameter while leaving a live document describing it — the stale-reference failure ATP-67 was cited to avoid, reproduced inside the change that cites it. **Both files are in scope, and the sweep is the premise, not the string (KZ-004):** grep `PortalUrl` and read every hit.

**Recorded consequence:** console-created users get a plain Cognito invitation over the unreliable channel. The supported path is the admin console, and that path is covered by FR-1. If console creation ever becomes a supported workflow, this decision must be revisited — it is not a permanent judgement that the template had no value.

### DD-7: `backend/CLAUDE.md`'s handoff rationale is annotated as superseded, not rewritten

Resolves `requirements.md` Q-3, which delegated this to design. The original design deferred it again to task execution (J/A-4) — a decision delegated twice is a decision nobody makes.

**Annotate, do not rewrite.** That section explains *why* the no-email handoff exists; its reasoning was correct when written and the premise it rested on ("Cognito mail is unusable") is what changed, not the reasoning. This repository's established practice for exactly this situation is to record the supersession in place rather than overwrite it — `docs/infrastructure.md` and `docs/ux-ui/design.md` both carry corrections in that form, and overwriting would destroy the explanation of why the codebase looked the way it did.

So: the section keeps its text, gains a dated superseded-by note pointing at this spec, and has its **forward-looking instruction** corrected — the sentence telling future agents *not* to send email must not survive, since that is the part an agent will act on. Per **KZ-004**, the sweep is over the *premise* ("Cognito mail is unusable"), not the phrase: the archived `admin-user-invite-and-reset` rationale rests on it too and must be read, though as a frozen archive record it is annotated, never edited.

### DD-6: Phase 2 is a verification spike before it is an implementation

FR-6 rests on an **unverified** claim about AWS (**KZ-011**). Designing the trigger, the KMS key and the stack change now would mean specifying an implementation whose premise nobody has checked — which is exactly the failure mode KZ-011 exists to catch.

Phase 2 therefore begins with a spike that answers three questions with citations: (a) does `CustomEmailSender` intercept ForgotPassword, (b) what must the Lambda do to decrypt the code, (c) what happens to *all other* Cognito mail once the trigger is attached. Only then is it designed.

## 10. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R-1 | "Sent" read as "delivered" | Field named `sent`; §4 states it explicitly; D-6 records the gap; a manual inbox check is required at the HITL pause. |
| R-2 | `emailSent: true` under `no-op` misleads a local developer | Documented at the field and in §4. |
| R-3 | ~~The microservice rejects this message shape~~ **CLOSED at design time (J-5)** | `requirements.md` §12 A-1 required this be *"confirmed in design, not assumed"*, and the original text deferred it to implementation instead. It was closable by reading the repo: `buildMicroserviceEnvelope(message, config)` in `microservice-mail.transport.ts` takes only a `MailMessage` and builds the wire envelope identically **regardless of message kind** — `text` verbatim, `html` into `socketFile`, and `reference` never leaves the process at all. Approvals, rejections and receipts already ride that exact shape in production. **No DTO change is needed and no runtime confirmation is owed.** |
| R-4 | The premise sweep is missed | `backend/CLAUDE.md`'s "no-email credential handoff (intentional)" section and the archived `admin-user-invite-and-reset` rationale both rest on "Cognito mail is unusable". Per **KZ-004**, grep the *premise*, not the phrase. Owned by a named task. |
| R-5 | FR-7 merged and believed live | NFR-5 + §8. Stated in the task text, not only here. |
| R-6 | Phase 2 designed from memory | DD-6. |

## 11. Budget & Sizing (Step 2.4)

Estimated **against the finished design**, not the pre-design guess. *(Round count corrected from "3–4" to 4 after judgment round 1 (J/A-3): the phases are strictly sequential — Phase 2 cannot even be designed until the spike runs — so 2 + 2 is additive and the lower bound was unreachable. A budget that does not reconcile with its own components is a poor argument for anything, least of all for narrowing scope.)*

| | Tasks | LOC (incl. tests) | Review rounds |
|---|---|---|---|
| **Phase 1** | 9 | ~640 | 2 |
| **Phase 2** | 4 | ~230 + infra | 2 |
| **Total** | **13** | **~870** | **4** |

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
