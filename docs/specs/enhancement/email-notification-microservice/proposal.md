# Proposal — Replace Amazon SES with the OneCGIAR Notification Microservice

## Document Control

| Field | Value |
|---|---|
| Spec Path | `enhancement/email-notification-microservice` |
| Slug | `email-notification-microservice` — derived from the free-text argument; the full instruction is proposal context, never a directory name |
| Type | **Change** |
| Approval Mode | `gated` |
| Depends on | none |
| Parallel-safe | **no** — touches three constitutional baselines (`docs/trd/trd.md`, `docs/infrastructure.md`, `backend/CLAUDE.md`) and all three IaC stacks |
| Parent Spec | n/a (not a chunked family) |
| Branch context | **`email-ms`** ⚠️ *corrected after Judgment Day round 2 — this recorded `feat/legal-notices`, and the ADR survey was taken there while the spec lives here. `main` is at ADR-013; so is `email-ms`. KZ-010.* |
| Reviewer required | **Yes** — constitutional baselines are in scope (root `CLAUDE.md` § Reviewer dispatch) |
| Date | 2026-09-15 |

---

## Intent

Send every application email through the **OneCGIAR Notification Microservice** (RabbitMQ, `pattern: "send"`, CLARISA API-key auth) instead of **Amazon SES**, and remove SES from the codebase, the infrastructure, and the documentation.

---

## Problem / Current Behavior

**The registry cannot email the public it was built to serve.**

| Fact | Where verified |
|---|---|
| The account's SES is in **sandbox** — it delivers **only to individually verified recipient addresses** | `infra/README.md` § "SES sandbox caveat (DEP-2)" |
| Public self-registration's OTP therefore cannot reach a real applicant without an operator verifying that applicant's address first | Derived from the above + `MailService.sendVerificationCode` |
| The deployed sender is a **personal address**, `MAIL_SENDER_ADDRESS: j.cadavid@cgiar.org` | `infra/20-backend/template.yaml`, `ApiFunction` environment |
| Enabling SES for Cognito needs a **two-phase rollout** plus an `aws ses put-identity-policy` step CloudFormation cannot express | `infra/README.md` §6 |
| A developer running the app locally against real mail needs an IAM policy granting six `ses:*` actions across three statements | `infra/policies/developer-local-test-policy.json` |

The PRD already treats delivery as unreliable — **US-9** promises an applicant can check status by reference code *"whether or not the confirmation email arrives"* (`docs/prd.md`). The change does not weaken a guarantee the product ever made.

**Five message kinds are in scope**, all dispatched through one private method (`MailService.dispatch`):

| Kind | Trigger | HTML? |
|---|---|---|
| `verification-code` | `POST /registrations/verify` | yes |
| `receipt` | `POST /registrations` | yes |
| `approval` | Admin approves a registration | yes |
| `rejection` | Admin rejects a registration | yes |
| `contact` | `POST /api/v1/contact` | yes |

---

## Proposed Outcome

- Any address receives registry mail. No per-recipient verification, no sandbox, no SES identity.
- The five message kinds publish to the notification microservice's durable queue; the microservice renders and delivers over its own SMTP.
- The branded HTML templates ship **unchanged**.
- AWS SES disappears from the backend, the three SAM stacks, the developer IAM policy, and every baseline document.

---

## Scope

### Backend (`backend/`)

| Item | Change |
|---|---|
| `src/mail/microservice-mail.transport.ts` | **New.** `MailTransport` implementation publishing over `amqplib` |
| `src/mail/mail.config.ts` | `MailTransportKind` gains `'microservice'`; add its config reader; drop `getSesMailConfig` |
| `src/mail/mail-transport.factory.ts` | Select the new transport; drop the SES branch |
| `src/mail/ses-mail.transport.ts` + `.spec.ts` | **Delete** |
| `package.json` | `+ amqplib`, `− @aws-sdk/client-ses` |
| `src/contact/contact.service.ts` | Re-word the `502` contract: enqueue failure, not delivery failure |

`MailMessage` itself does **not** change shape, except that `replyTo` becomes unused (see Non-Goals). Field mapping:

```
MailMessage.to      → data.data.emailBody.to
MailMessage.subject → data.data.emailBody.subject
MailMessage.text    → data.data.emailBody.message.text
MailMessage.html    → data.data.emailBody.message.socketFile
```

### Infrastructure (`infra/`)

| Stack / file | Change |
|---|---|
| `10-data-auth/template.yaml` | Remove `SenderEmail`, `EnableSesSending`, `CreateSenderIdentity` params, the `HasSender`/`MakeSenderIdentity`/`UseSes` conditions, `SesSenderIdentity`, and the `EmailConfiguration` `!If` (pool reverts to explicit `COGNITO_DEFAULT`) |
| `10-data-auth/ses-cognito-send-policy.json` | **Delete** |
| `20-backend/template.yaml` | Replace `MAIL_TRANSPORT`/`MAIL_SENDER_ADDRESS` with the microservice variables; broker URL and API key via Secrets Manager dynamic references, never literals |
| `policies/developer-local-test-policy.json` | Remove three statements / six actions. **Plus** `ses:SendEmail` on the Lambda execution role in `20-backend` — seven grants in total *(corrected in design revision 2; the Lambda grant was missing here)* |
| `policies/README.md` | Remove the two SES policy rows |

### Documentation

| Document | Change |
|---|---|
| `docs/trd/trd.md` | C4 L1 + L2 diagrams; **one new ADR** (see Open Questions for numbering) |
| `docs/infrastructure.md` | §2 component table row for `AWS::SES::EmailIdentity` |
| `infra/README.md` | **Partial** delete of §6 (~110 lines: two-phase rollout, sandbox caveat, rollback). ⚠️ Preserve the `Known limitation — CONFIRMED-user reset code has no in-app entry page (OQ-5)` subsection — it is not SES-specific *(corrected in design revision 2)* |
| `backend/.env.example` | Mail block rewritten |
| `backend/CLAUDE.md` | Mail/deploy notes |

---

## Non-Goals

| Excluded | Why |
|---|---|
| Cognito's forgot-password email | Amplify calls Cognito's `ForgotPassword` directly (`frontend/lib/auth/auth-client.ts`); Cognito cannot publish to RabbitMQ. Stays on `COGNITO_DEFAULT` (50/day cap). **User decision.** |
| A `CustomEmailSender` Lambda trigger | The only way to route the above through the queue. Deferred; roughly doubles this spec. |
| Restoring `replyTo` on the contact form | The microservice's email DTO has no such field. **User decision:** the visitor's address already appears as a body row in `contact.template.ts`; the admin copies it. |
| The HTTP entry point (`POST /api/email/send`) | **User instruction: use the broker.** Documented as contingency only — the docs state HTTP is not enabled in every environment. |
| Changing the users module's no-email credential handoff | See the premise note below. Out of scope by choice, not by oversight. |
| Redesigning any email template | They already satisfy the microservice's rendering expectations. |

> ⚠️ **A premise expires here (KZ-004 — sweep the withdrawn premise, not the string).**
> `backend/CLAUDE.md` justifies the users module returning a temporary password out-of-band with *"corporate `@cgiar.org` deliverability + SES sandbox limits"*. This change removes the second half of that rationale. The behavior is deliberately **not** changed, but the doc sweep must restate the justification on grounds that survive, rather than leave a rationale resting on a constraint that no longer exists.

---

## Affected Users, Systems, And Specs

| Affected | How |
|---|---|
| Public applicants | OTP and receipt mail becomes deliverable to them for the first time |
| Admins | Contact-form mail loses one-click Reply; recipient resolution unchanged |
| Archived spec `actors/public-self-registration` | Introduced `MailTransport`; its DEP-6 SES caveat is superseded |
| Archived spec `contact/contact-channels` | Owns `replyTo` (FR-4) and the `502` contract (FR-5) — both change |
| Archived spec `admin/registration-review-queue` | Owns the approval/rejection dispatch (DD-9); unchanged, inherits the new transport |
| QA-13 (`docs/trd/trd.md` §13) | Release gate over contact-path log lines — must stay green with the new transport's failure envelope |
| CLARISA | New dependency: the API key that authenticates every message |

---

## Visual Reference

- **Source:** None.
- **Location:** n/a.
- **Notes:** Backend and infrastructure only. No screen changes. The rendered email HTML is byte-identical — `email-layout.ts` and the four templates are untouched.

---

## Requirement Delta Preview

### ADDED

- The backend publishes each outgoing message to a durable RabbitMQ queue as `{ pattern: "send", data: { apiKey, data: { from, emailBody } } }`, with `delivery_mode = 2`.
- Transport configuration is read lazily (matching today's `mail.config.ts` contract) from `RABBITMQ_URL`, `EMAIL_QUEUE_NAME`, `MICROSERVICE_API_KEY`, `EMAIL_SENDER`, `EMAIL_SENDER_NAME`.
- `from.name` follows the OneCGIAR convention `"ACCELERATE Tanzania Seed Registry -"`, which the microservice renders as *"… - No reply"*.

### MODIFIED

- `MAIL_TRANSPORT` accepts `microservice | no-op`; `ses` is no longer valid.
- `POST /api/v1/contact`'s `502` means **"could not enqueue"**, not "could not deliver". Its FR-5 wording and e2e assertions change accordingly.
- Non-production subjects arrive prefixed (`TEST - …`) by the microservice.
- The Cognito user pool declares `COGNITO_DEFAULT` unconditionally rather than by condition.

### REMOVED

- `SesMailTransport`, `getSesMailConfig`, `@aws-sdk/client-ses`.
- The SES email identity, its Cognito sending-authorization policy, and the two-phase enablement runbook.
- Every `ses:*` IAM grant.
- `MailMessage.replyTo`'s only consumer (the field may remain on the interface, unused, or be removed — a `/akili-specify` decision).

---

## Approach Options

| | **A — `amqplib` thin wrapper** ✅ | **B — `@nestjs/microservices` `ClientProxy`** | **C — HTTP `POST /send`** |
|---|---|---|---|
| Shape | Mirror the two proven Python clients in Node | `ClientsModule.register` + `client.emit('send', …)` | Plain HTTPS POST, `202 Accepted` |
| Lambda fit | Explicit connect/publish/close with a bounded timeout | `amqp-connection-manager`'s background reconnect fights Lambda's freeze/thaw | Best — stateless, no connection to keep alive |
| Control over failures | Full — we choose the timeout inside the 15 s handler budget | Reconnect and buffering are the library's, not ours | Full |
| Follows user instruction | yes | yes | **no** |
| Availability | Queue runs in every environment | same | Only where `MS_HTTP_SERVER_AVALIABLE=true` |

**Honest note.** For a Lambda outside a VPC with a 15-second timeout, option C is the better technical fit, and the microservice's own documentation offers it for callers without direct broker access. The user has directed us to the broker and the queue is the officially supported path; option A is chosen on that basis, with C recorded as the fallback if AMQP-in-Lambda proves unstable.

---

## Recommended Approach

**Option A**, sequenced as **add → verify → remove** inside this one spec:

1. Land the new transport alongside SES, selected by `MAIL_TRANSPORT`. Nothing breaks if step 2 fails.
2. Switch the dev Lambda and **observe a real delivered email** for each of the five kinds.
3. Only then delete `SesMailTransport`, the IaC resources, the IAM grants, and the docs.

The ordering matters because step 2 is the only evidence that exists — see Success Criteria.

---

## Risks, Dependencies, And Open Questions

### External dependencies — these gate the deploy, not the code

| ID | Item | Notes |
|---|---|---|
| **D-1** | ACCELERATE registered as a MIS in CLARISA | `POST /subscribe-application` |
| **D-2** | CLARISA API key per environment, scope `email:send` | **The only genuinely blocking dependency.** A `cl_dev_` key will not work against PROD. It replaces `MS_AUTH_USER`/`MS_AUTH_PASSWORD` (the in-payload `auth` pair), **not** the broker URL. See the early-verification option below |
| **D-3** | The key must have **no `allowed_ips`** | The microservice does not forward the caller IP on the queue path, so validation would fail. Convenient: our Lambda is outside the VPC with no NAT, so its egress IP is not fixed |
| **D-4** | RabbitMQ URL + credentials per environment | ✅ **Available** (2026-09-15) — held by the product owner as `RABBITMQ_URL` in a sibling AI-services project. Broker access and message auth are **separate credentials**: the URL carries its own `amqps://user:pass@host` and is unaffected by the CLARISA migration |
| **D-5** | Sender-domain authorization | `from.email` must be a domain the microservice's SMTP is permitted to send as. A custom domain (e.g. `no-reply@accelerate-tanzania-registry.com`) needs both ownership and SPF/DKIM authorization by the platform team. ✅ **Not blocking** — the sibling project's `EMAIL_SENDER` uses the microservice's own default sender, so DEV can ship on that and only `from.name` changes. The custom domain is a later env-var change, not a code change |
| **D-6** | ⚠️ Confirm whether the available `EMAIL_QUEUE_NAME` is the **DEV or PROD** queue | Open. The `TEST - ` subject prefix is applied by the microservice per the *credential's* environment. Smoke-testing against a PROD queue would send unmarked real mail to real addresses |

### Early-verification option (retires R-1 before the API key arrives)

The microservice **still accepts** the legacy `auth: { username, password }` pair — deprecated, not removed. Because D-4 and D-5 are already satisfied, a **one-off smoke test** can be run before D-1/D-2 land, proving the two things this proposal cannot currently assert: that the broker is reachable from this Lambda's egress, and that our HTML survives the `juice` pass.

**Bounded deliberately.** Those credentials identify a *different* MIS, so ACCELERATE's sends would be attributed to that system in the microservice's CLARISA records and Slack log. Acceptable to buy early evidence; **not** acceptable to ship. The legacy path must never reach the merged implementation — the transport authenticates with `apiKey` only, and the smoke test is a throwaway, not a supported configuration. Blocked on D-6 (never smoke-test against a PROD queue).

### Risks

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | AMQP connection lifecycle in Lambda — a connection cached across invocations can be dead after a freeze while still appearing open | Reachability is proven (`partner-request-support` runs the same pattern from a Lambda with no `VpcConfig`), but **this failure mode is not**. Design must specify liveness checking, a bounded publish timeout inside the 15 s budget, and one reconnect attempt |
| **R-2** | The microservice uses `noAck: true` with **no retry and no DLQ** — a failed SMTP send is dropped silently, visible only in Slack | Accepted. OTP has a user-driven "Resend code" (`OtpVerificationStep.tsx`); the PRD's US-9 already promises status lookup independent of email arrival |
| **R-3** | Weaker delivery guarantee than SES: the strongest claim becomes "enqueued" | Explicit in the FR-5 rewrite and the new ADR — recorded, not hidden |
| **R-4** | The microservice posts **every subject** to Slack `microservices-notifications`. Our approval/rejection/receipt subjects carry the applicant-facing `reference` | Low: the verification-code subject does **not** contain the code (verified in `verification-code.template.ts`), and no subject carries an address. To be stated in the ADR, not silently accepted |
| **R-5** | Lambda artifact is ~180 MB against a 250 MB unzipped limit | `amqplib` is pure JS and ~1 MB; dropping `@aws-sdk/client-ses` offsets it. Low, but measure rather than assume |
| **R-6** | **KZ-011 — no gate verifies that a spec is true.** This proposal's account of a third party rests on documents, not on an observed send | See the verification ledger below |

### Verification ledger (KZ-011 / KZ-008)

**Verified by reading, in this repo:** the `MailTransport` seam and its two implementations; the five call sites; `EnableSesSending` defaulting to `"false"`; `MessageAction: 'SUPPRESS'` in the users module; Amplify's `resetPassword` import; 33 inline `style="` attributes and zero `<style>` blocks in `email-layout.ts`; the verification-code subject omitting the code; `ApiFunction` carrying no `VpcConfig`; the Makefile shipping production `node_modules`; the highest ADR across every local and remote branch.

**Verified by reading two supplied documents plus two working client implementations** (`ai-services/partner-request-support`, `ai-services/ai-feedback-service`): the queue name, envelope, `socketFile` HTML support, CLARISA auth, `noAck`, the subject prefix, the absence of `replyTo`.

**NOT verified — no message has been published and no email observed:** that our HTML renders correctly after the microservice's `juice` pass; that a `cl_*` key issued for ACCELERATE authenticates; that the broker is reachable from *this* Lambda's egress; that `replyTo` is truly unsupported rather than undocumented. ⚠️ Both reference implementations send `socketFile: None` and use the **deprecated** `auth: {username, password}` form — they prove connectivity, **not** the HTML or API-key paths this spec depends on.

### Open questions

| ID | Question |
|---|---|
| **OQ-1** | ADR number. ⚠️ **Corrected after Judgment Day round 3:** this previously read *"this branch (`feat/legal-notices`) at ADR-014"*. Verified — the spec lives on **`email-ms`, whose TRD tops out at ADR-013**; ADR-014 exists only on `feat/legal-notices`, where the original survey was taken. Re-survey at apply time on the default branch (KZ-010). |
| **OQ-2** | Is there an ATP/Jira ticket to link? Per the standing note that ATP descriptions are AI-drafted, its content would be triaged, not adopted. |
| **OQ-3** | ~~Does `MailMessage.replyTo` stay on the interface or get deleted?~~ **Resolved:** removed end-to-end (design DD-7). |
| **OQ-4** | Should the local environment gain a RabbitMQ container, or stay on `MAIL_TRANSPORT=no-op`? Recommendation: stay on `no-op` — the local contract in `docs/infrastructure.md` §6 needs no new moving part. |

---

## Success Criteria

| # | Criterion | How it is evidenced |
|---|---|---|
| 1 | All five message kinds are **delivered to an address that was never verified with AWS** | A real send observed per kind in dev. **This is the only criterion no unit test can substitute for** — the deleted `SesMailTransport` carried exactly this caveat (DEP-6), and repeating its mistake in the opposite direction is the failure mode KZ-002 names |
| 2 | Each kind's HTML renders correctly after `juice` | Visual check of the received mail, per kind |
| 3 | A broker failure never rolls back a committed DB write | DD-9 preserved; proven by the existing dispatch-placement tests |
| 4 | `grep -ri "\bses\b"` over `backend/src`, `infra/`, and the baselines returns only historical archive references | Sweep over the **withdrawn premise**, not just the string (KZ-004) |
| 5 | `src/test/pii-boundary.spec.ts` and QA-13 stay green | Release gate, unchanged |
| 6 | The three SAM stacks validate | `./infra/scripts/validate.sh` |

---

## Next Step

```text
/akili-specify enhancement/email-notification-microservice
```

Standard depth. The spec is small in code and wide in blast radius: a Reviewer is mandatory (three constitutional baselines), and `tasks.md` should sequence **add → verify → remove** so the SES deletion is never the step that discovers the broker does not work.
