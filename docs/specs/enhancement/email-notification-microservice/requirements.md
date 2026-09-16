# Requirements — Email via the OneCGIAR Notification Microservice

- Spec path: `docs/specs/enhancement/email-notification-microservice/`
- Status: Draft — **revision 3** (amended across two Judgment Day rounds; see `judgment.md`)
- Branch: **`email-ms`** ⚠️ *corrected in revision 3*
- Author / Date: Daniela Gómez / 2026-09-15
- Depth: **Standard** (with rollout/rollback treated at Full depth — deleting the only working mail path is the risk that justifies it)
- Related: `docs/prd.md` US-9 · `docs/trd/trd.md` §12.1, §12.2, §13 (QA-13) · `docs/infrastructure.md` §2 · `proposal.md`

---

## 1. Summary

The registry's five transactional emails are sent through **Amazon SES**, whose account is in sandbox — it delivers only to individually verified recipients, so public self-registration's one-time code cannot reach a real applicant. This spec replaces SES with the **OneCGIAR Notification Microservice**: the backend publishes each message to a durable RabbitMQ queue, authenticates with a CLARISA API key, and the microservice renders and delivers over its own SMTP. SES is then removed from the code, the three SAM stacks, the developer IAM policy, and every baseline document.

Advances **PRD US-9** ("verify their email address… whether or not the confirmation email arrives") by making the verification email actually deliverable, and removes the DEP-2 sandbox constraint recorded in `infra/README.md`.

---

## 2. Requirement Numbering & Writing Standards

Standard conventions apply (`docs/specs/general-setup/requirements.md`). Two are load-bearing here and are discharged explicitly:

**Verification ledger (per the L-1 / KZ-011 rule — assertions about a third party must cite where they were verified).** This spec rests on claims about a system outside this repository. They are classified, not assumed:

| Claim | Status |
|---|---|
| Envelope shape, `socketFile` HTML support, `apiKey` auth, durable queue, `delivery_mode = 2`, `noAck: true`, non-PROD subject prefix, recipient-validation rule | **Verified by document** — `email-notification-microservice.md` (2026-09-15, written from `main-email-notification` @ `2df3d867`) corroborated by the Notion PDF and by two running producers (`ai-services/partner-request-support`, `ai-services/ai-feedback-service`) |
| The broker is reachable from a Lambda outside a VPC | **Verified by analogy, not by test** — `partner-request-support` runs this pattern from a Lambda whose SAM template declares no `VpcConfig`. Not yet observed from *this* Lambda |
| `replyTo` is unsupported | **Verified as absent from both documents.** Absence from documentation is not proof of absence from the service — treated as unsupported |
| Our HTML survives the microservice's `juice` pass | **UNVERIFIED.** Both reference producers send `socketFile: None`; neither exercises the HTML path |
| A CLARISA key issued for ACCELERATE authenticates | **UNVERIFIED.** Both reference producers use the deprecated `auth: {username, password}` pair |

**Claims verified by reading this repository** (cited by symbol, not line — KZ-009): the `MailTransport` seam and its two implementations (`mail-transport.interface.ts`); the five dispatch sites via `MailService`; `EnableSesSending` defaulting to `"false"` and `AdminCreateUser MessageAction: 'SUPPRESS'`, which together mean **no Cognito email path is active today**; `email-layout.ts` carrying 33 inline `style="` attributes and zero `<style>` blocks; `buildVerificationCodeMessage`'s subject omitting the code; `ApiFunction` declaring no `VpcConfig`; `backend/Makefile` staging production `node_modules`.

---

## 2.1 Defect classes and their gates

Per the command's gate rule: the classes of defect **this spec can actually produce**, and what catches each. A gate blind to the dominant class is not a gate.

| # | Defect class | Gate | Can it fail? |
|---|---|---|---|
| D-A | Malformed envelope (wrong nesting, missing `pattern`, HTML in `text`) | Unit test asserting the exact published JSON buffer | Yes — mutate a key name, test reddens |
| D-B | Config resolved eagerly or silently defaulted, booting with no broker | `mail.config` spec asserting a throw per missing variable | Yes — remove the guard, test reddens |
| D-C | A committed DB write rolled back by a mail failure | Existing dispatch-placement tests (DD-9) | Yes — `await` the fire-and-forget send, tests redden |
| D-D | Secret or recipient address in a log line or error envelope | A **new transport-level spec** that injects a URL-bearing `amqplib` error on each of the three leak paths. ⚠️ *Corrected in revision 3: this said "QA-13's spy, extended to the new transport". **QA-13 cannot host it** — its contact block `.overrideProvider(MailService)`, so no transport executes inside that gate. `design.md` §4.4 was corrected in revision 2 and this row was not swept.* | Yes — run against a non-sanitizing variant |
| D-E | SES residue surviving the removal | Multi-pattern, case-insensitive sweep over the **withdrawn premise**, not the string (KZ-004) | Yes — leave one reference, sweep reports it |
| **D-F** | **Connection dead after a Lambda freeze; publish hangs or throws on a warm invocation** | ⚠️ **No automated gate.** jsdom, Jest and a mocked channel cannot reproduce container freeze | **Substitute:** deployed dev observation with an enforced cold → idle → warm sequence (T-9). Recorded as the dominant risk |
| **D-G** | **HTML renders wrong after the microservice's `juice` pass** | ⚠️ **No automated gate.** We do not run the renderer and cannot assert on the delivered message | **Substitute:** human visual check of one received email per kind at the HITL pause (T-9) |
| **D-H** | **A message is accepted by the broker and silently dropped at SMTP** | ⚠️ **Structurally unmeasurable from this system** — `noAck: true`, no retry, no DLQ, no callback | **Accepted risk.** The operator's only signal is the microservice's Slack channel. Must be stated in the ADR and the runbook, not mitigated |
| **D-I** | **The container freezes during the *fire-and-forget* receipt send, dropping it after its `202`** | ⚠️ **No automated gate.** Depends on `callbackWaitsForEmptyEventLoop` and on the unawaited window's length, which this change lengthens | **Substitute:** T-9 must observe receipt delivery **after** the `202`, not only the four awaited kinds. *Added in revision 2 — the receipt is the one kind still dispatched `void … .catch()`* |
| **D-J** | **A publish is confirmed into a queue that does not exist** (wrong `EMAIL_QUEUE_NAME`) — every request `202`, zero emails, no signal anywhere | ✅ **Closed by design:** the transport verifies the queue exists (`checkQueue`) instead of declaring it, so a wrong name is a loud configuration error | Unit test: a non-existent queue fails loudly and **no queue is created** |
| **D-J′** | **A publish is confirmed into a queue that exists but nobody consumes** — right name, wrong environment (DEP-5), or a stopped consumer | ⚠️ **Gated, not closed.** `checkQueue` proves existence, **not consumption**. *Split from D-J in revision 3: revision 2 marked the whole class "closed by design" on a check that cannot observe half of it — the same over-claim KZ-002 names* | The transport reads `checkQueue`'s `consumerCount` and warns when it is zero. A **signal, not a gate** — nothing fails the build |

D-F, D-G and D-H are the classes that matter most and the ones no green test covers. This is the same failure the deleted `SesMailTransport` recorded as DEP-6 ("cannot be exercised end-to-end in CI"); repeating it in the opposite direction is exactly what KZ-002 names.

---

## 3. Functional Requirements

### FR-1: Publish every outgoing message to the notification microservice queue

- **Description:** The system MUST deliver all five message kinds (`verification-code`, `receipt`, `approval`, `rejection`, `contact`) by publishing to the configured RabbitMQ queue. No message may reach a recipient by any other transport.
- **Rationale / Source:** PRD US-9; proposal Intent.
- **Acceptance criteria:**
  - GIVEN `MAIL_TRANSPORT=microservice` and valid configuration
  - WHEN any `MailService` send method is called
  - THEN exactly one message is published to the queue named by `EMAIL_QUEUE_NAME`, on the **default exchange** (`""`) with the queue name as routing key
  - AND the message is published **persistent** (`delivery_mode = 2`) to a queue the transport has **verified exists** (`checkQueue`) — ⚠️ *revision 3: this required the transport to **declare** the queue `durable: true`. Design DD-3 replaced declaration with verification, so this criterion was false by construction. A passive check **cannot read the durability flag**: durability is now an assumption about the microservice's own declaration, recorded in the dependency ledger (OQ-8) rather than asserted here*
  - **BUT it must NOT** declare, create, or modify the queue at all — the microservice owns that topology. *(Revision 3: the former `PRECONDITION_FAILED` clause is deleted rather than kept-but-unreachable; a clause that can never fire is not a constraint, and keeping it implied a detection the design no longer performs.)*
  - **AND IT MUST** publish exactly once per send call, never retrying internally on its own
- **PII/RBAC impact:** Recipient addresses leave the process, as they already do under SES. No new role surface.

### FR-2: Emit the exact microservice envelope

- **Description:** The published body MUST be UTF-8 JSON matching the microservice's NestJS RMQ wire format.
- **Rationale / Source:** `email-notification-microservice.md` §3.1–3.3.
- **Acceptance criteria:**
  - GIVEN a rendered `MailMessage`
  - WHEN it is published
  - THEN the body is `{ "pattern": "send", "data": { "apiKey": <key>, "data": { "from": {...}, "emailBody": {...} } } }`
  - AND `MailMessage.html` maps to `emailBody.message.socketFile`, and `MailMessage.text` to `emailBody.message.text`
  - AND `emailBody.to` is always an **array** of addresses, never a comma-joined string
  - **BUT it must NOT** include an `id` property — an `id` without `reply_to` makes the microservice attempt an RPC reply nothing will consume
  - **BUT it must NOT** place HTML in `message.text`, nor use the `message.file` field (HTTP-only; ignored on the queue path)
  - **AND IT MUST** send both `text` and `socketFile` whenever the message carries HTML, so text-only clients, screen readers and spam scoring keep their fallback

### FR-3: Fail fast and explicitly on missing configuration

- **Description:** Transport configuration MUST be resolved lazily at first send and MUST throw a named, actionable error when any required variable is absent.
- **Rationale / Source:** Preserves `mail.config.ts`'s existing contract — a checkout without mail configured still boots and serves every other route.
- **Acceptance criteria:**
  - GIVEN `MAIL_TRANSPORT` is unset, or is any value outside the set valid for the current phase (**Phase A: `ses` | `microservice` | `no-op`; Phase B: `microservice` | `no-op`**) — ⚠️ *revision 3: this bullet listed only `microservice`/`no-op`, which forbade the Phase-A `ses` fallback one bullet before the amendment that permits it*
  - WHEN a send is attempted
  - THEN an error naming the variable and the accepted values is thrown
  - AND GIVEN `MAIL_TRANSPORT=microservice` with any of the **four required transport variables** absent — `RABBITMQ_URL`, `EMAIL_QUEUE_NAME`, `MICROSERVICE_API_KEY`, `EMAIL_SENDER` — THEN an error naming that variable is thrown. *(Revision 3: this said "five" and listed four. `MAIL_TRANSPORT` is the fifth throwing variable but is handled by the bullet above, so counting it here double-counted it — the amendment that resolved one count defect introduced another.)*
  - AND GIVEN `EMAIL_SENDER_NAME` is absent, THEN it **defaults** to `ACCELERATE Tanzania Seed Registry -` and no error is thrown — it is the one optional variable
  - **BUT it must NOT** resolve configuration at module initialization — importing the module with nothing configured must not throw
  - **BUT it must NOT** accept `ses` as a valid value — ⚠️ **scoped to Phase B only.** Phase A deliberately retains `'ses'` as a valid kind, because it is the rollback control the add → verify → remove rollout depends on (design.md §7.3). *Revision 2: as originally written this clause forbade, in the same change, the very fallback the rollout required — a contradiction both judges found.*
  - **AND IT MUST** never include the API key or the broker URL in the thrown message

### FR-4: Sender identity

- **Description:** Every message MUST carry a configured sender address and the registry's display name.
- **Rationale / Source:** Replaces `MAIL_SENDER_DISPLAY_NAME` in the deleted SES transport; the deployed SES sender is a personal address.
- **Acceptance criteria:**
  - GIVEN `EMAIL_SENDER` and `EMAIL_SENDER_NAME` are configured
  - WHEN a message is published
  - THEN `from.email` is `EMAIL_SENDER` and `from.name` is `EMAIL_SENDER_NAME`
  - AND `EMAIL_SENDER_NAME` SHALL default to `"ACCELERATE Tanzania Seed Registry -"`, the trailing dash being the OneCGIAR convention that renders as *"… - No reply"*
  - **BUT it must NOT** wrap the address in a `"Name" <addr>` composite — the microservice takes address and name as separate fields, and a composite would be sent as a literal address

### FR-5: Contact endpoint reports enqueue failure, not delivery failure

- **Description:** `POST /api/v1/contact` MUST keep returning `502` when the transport rejects, and its stated meaning MUST change from "could not deliver" to "could not enqueue".
- **Rationale / Source:** `contact/contact-channels` FR-5 (archived), now superseded in meaning.
- **Acceptance criteria:**
  - GIVEN the broker is unreachable or the publish times out
  - WHEN a visitor submits the contact form
  - THEN the response is `502` with the existing envelope shape, unchanged for the client
  - AND GIVEN the publish succeeds, THEN the response is `202`, which now asserts only that the message was accepted by the broker
  - **BUT it must NOT** claim or imply delivery in any response body, log line, or user-facing copy
  - **AND IT MUST** carry no recipient address, requester field, broker URL, or API key into the error envelope or any log line (QA-13, extended)

### FR-6: Remove Amazon SES completely

- **Description:** SES MUST be removed from application code, IaC, the developer IAM policy, and every active baseline document.
- **Rationale / Source:** Proposal Scope.
- **Acceptance criteria:**
  - GIVEN the change is complete
  - WHEN the repository is swept case-insensitively for SES and for its **withdrawn premise** (sandbox limits, recipient verification, sending identity, the two-phase enablement)
  - THEN, **across `backend/src`, `infra/`, and the constitutional baselines**, the only surviving matches are inside `docs/specs/archive/` (frozen historical records)
  - ⚠️ **The sweep is scoped deliberately.** As originally written it was **unsatisfiable**: two *active* specs — `docs/specs/epic/hybrid-actor-registration/` and `docs/specs/admin/registration-info-requests/` — assert SES as a live dependency, and nothing in this spec authorizes rewriting another spec's proposal. Each instead receives a **one-line superseded-by pointer** to this spec, so a future agent cannot build on a withdrawn premise (see OQ-9)
  - AND `@aws-sdk/client-ses` is absent from `backend/package.json`
  - AND **no `ses:*` action remains anywhere in `infra/`** — this is **seven** grants, not five: six actions across three statements in `infra/policies/developer-local-test-policy.json` (a *developer's* IAM user), **plus `ses:SendEmail` on the Lambda execution role** in `infra/20-backend/template.yaml`. *Revision 2: the Lambda grant was missing from every earlier inventory, so the function would have kept a live send permission for a service it no longer calls.*
  - AND `infra/10-data-auth/t9-enable-ses.sh` is deleted — it deploys with `SenderEmail=`/`EnableSesSending=` and rewrites `ses-cognito-send-policy.json`, so once those parameters and that file are gone it is a committed script that cannot run
  - AND the Cognito user pool declares `COGNITO_DEFAULT` unconditionally
  - **BUT it must NOT** silently leave a document asserting a premise this change withdrew (KZ-004). The withdrawn-premise set is **at least seven sites**, not one — behavior stays unchanged at every one; only the stated rationale is corrected:
    1. `backend/CLAUDE.md` — the no-email credential handoff cites "SES sandbox limits"
    2. `infra/20-backend/template.yaml` — the `CONTACT_FALLBACK_RECIPIENT` comment asserts "the account is still in the SES sandbox… must be a verified identity"
    3. `contact.service.ts` and 4. `admin-registrations.service.ts` — both justify `err.name`-only logging on the AWS SDK's `MessageRejected` putting the address in its message. **These are load-bearing: they are *why* the two most sensitive log lines are written that way, and the new transport's sanitization depends on them**
    5. `src/lambda.ts` — claims approval/rejection are "still dispatched fire-and-forget by design". They have been **awaited** since `fix/otp-mail-lambda-freeze`; only the receipt is not. The conclusion (the flag is load-bearing) survives; two-thirds of its stated basis is false
  - **AND IT MUST** correct `docs/trd/trd.md` §12.1, whose C4 diagram states SES "sends invites / resets" — already false before this change, since Cognito email is suppressed and `EnableSesSending` defaults to `"false"`

### FR-7: Secrets never enter the repository or the template

- **Description:** The broker URL (which embeds credentials) and the CLARISA API key MUST reach the Lambda only as Secrets Manager dynamic references.
- **Rationale / Source:** `docs/trd/trd.md` NFR-2 posture; the existing `DB_PASSWORD` pattern in `infra/20-backend/template.yaml`.
- **Acceptance criteria:**
  - GIVEN the backend stack is deployed
  - WHEN `infra/20-backend/template.yaml` is inspected
  - THEN both values appear only as `{{resolve:secretsmanager:...}}` references
  - **BUT it must NOT** appear as a literal in any template, script, committed `.env`, or CloudFormation parameter default
  - **AND IT MUST** be absent from `sam deploy` command lines in `infra/scripts/`, where a parameter override would land in shell history

### FR-8: Operator-facing configuration reference

- **Description:** The spec MUST produce a documented environment block stating, per variable, what value goes in it and where that value comes from.
- **Rationale / Source:** Direct user request — the values will be pasted in by the product owner after implementation.
- **Acceptance criteria:**
  - GIVEN a fresh checkout
  - WHEN an operator reads `backend/.env.example`
  - THEN every microservice variable is present with a comment naming its source (CLARISA, the platform team, or a fixed project value)
  - AND the local default remains `MAIL_TRANSPORT=no-op`, so a developer needs no broker access to run the app
  - **BUT it must NOT** contain a real key, URL, or credential — placeholders only

---

## 4. Non-Functional Requirements

| ID | Requirement | Measure |
|---|---|---|
| **NFR-1** | A send MUST complete or abort within `MAIL_SEND_TIMEOUT_MS` — **value and sub-budgets defined in `design.md` §12, which is their single home; this requirement deliberately restates no number.** It covers lock wait, probe, any reconnect, publish and confirm. Connection teardown is detached and MUST NOT count against it. | Deadline asserted against a non-responding stub, and the §12.3 invariants asserted over the constants. ⚠️ *Revision 4: this row carried `1500 ms` while the design said `1000 ms` — the same constant, two values, two documents. Restating numbers is what made rounds 2 and 3 fail; the reference replaces the copy* |
| **NFR-2** | The transport MUST reuse a connection across warm invocations and MUST verify liveness **by an explicit pre-publish probe** (design DD-11), reconnecting **at most once** per send and only from a failure that occurred **before** any frame was written. | Unit test: a probe that fails triggers exactly one reconnect and then exactly one publish; a second failure propagates. ⚠️ *Corrected in revision 3: this read "a channel reporting closed triggers exactly one reconnect" — **amqplib exposes no such flag**, so the measure could only be satisfied by mocking a property the real library does not have* |
| **NFR-3** | No log line, error envelope, or thrown message may contain a recipient address, a requester field, the broker URL, or the API key. | The **new transport-level gate** (see D-D), run against a non-sanitizing variant to prove it reddens. QA-13 keeps gating what it already gates — `ContactService`'s `err.name`-only catch — and is **not** extended |
| **NFR-4** | A transport failure MUST NOT roll back a committed database write (DD-9 preserved). | Existing dispatch-placement tests in `registrations`/`admin-registrations` stay green |
| **NFR-5** | The deployed artifact MUST stay under Lambda's 250 MB unzipped limit. | Measured after `sam build`. `backend/Makefile` **records** "Net artifact ~180 MB" — recorded, not re-measured since `amqplib`; `amqplib` adds ≈1 MB and removing `@aws-sdk/client-ses` offsets it. *Revision 3: `design.md` §9 and this row previously stated opposite statuses for the same figure* |
| **NFR-6** | ~~Cold-start impact MUST NOT exceed the SES client it replaces.~~ **Withdrawn in revision 2.** The measure ("both are lazily constructed; no module-init work") was a static property of the code that **could not fail** — KZ-002 — while the real comparison is first-send latency: a local `new SESClient()` with no I/O versus a TCP + TLS + AMQP handshake to an external broker. The cost is real, is **higher**, and is now bounded by NFR-1 and gated by NFR-7 instead of denied. | Superseded by NFR-1 + NFR-7; the actual figure is measured at T-9 |
| **NFR-7** | The constant-time property protecting the OTP endpoint against address enumeration MUST hold **structurally**: **every term inside the padded window MUST be bounded at runtime**, and the floor MUST be composed from those bounds — see `design.md` §12.3 for the invariants and §12.1 for the values. It is not sufficient for the send bound alone to be below the floor. | A unit test asserting **both** §12.3 invariants, plus tests that each bound is actually enforced (the deadline over the **whole `issueCode(...)` call** — not merely its transaction, which wraps only one of the four terms; the send deadline; the probe and lock sub-budgets). **Falsifying input:** raise any term past its container, or remove any enforcement — the tests redden. ⚠️ *Revision 4: this measure previously specified the two-term comparison `timeout < floor`, which is satisfiable while the oracle is open — a green gate over a live defect, which is strictly worse than no gate. Judgment rounds 2 and 3 both condemned it; round 3 found it still here after the design had moved on.* |

---

## 5. Data & Schema Impact

**None.** No Prisma model, column, migration, or `pii-consent.policy.ts` classification changes. `MailMessage` is an in-memory DTO with no persistence. The four tables holding personal data (`docs/trd/trd.md` §3.1) are untouched.

---

## 6. Out of Scope

| Excluded | Reason |
|---|---|
| Cognito's forgot-password email | Amplify calls Cognito's `ForgotPassword` directly; Cognito cannot publish to RabbitMQ. Stays on `COGNITO_DEFAULT` (50/day). **User decision.** |
| A `CustomEmailSender` Cognito trigger | The only route for the above. Deferred. |
| Restoring `replyTo` on the contact form | No such field in the microservice DTO. **User decision:** the visitor's address already renders as a body row. |
| The microservice's HTTP entry point | **User instruction: use the broker.** Contingency only. |
| Changing the users module's no-email credential handoff | Behavior unchanged; only its written rationale is corrected (FR-6). |
| Template or layout redesign | The HTML already meets the microservice's expectations. |
| Retry, DLQ, or delivery confirmation | Not offered by the microservice on this path (D-H). |

---

## 7. Dependencies & Assumptions

| ID | Item | Status |
|---|---|---|
| **DEP-1** | CLARISA API key, scope `email:send`, one per environment, **no `allowed_ips`** | ⏳ To be requested. **Implementation proceeds without it** (user decision); values injected at deploy |
| **DEP-2** | ACCELERATE registered as a MIS in CLARISA | ⏳ Same request |
| **DEP-3** | RabbitMQ URL, credentials, queue name | ✅ Held by the product owner |
| **DEP-4** | Sender address authorized on the microservice's SMTP | ✅ Not blocking — the microservice's default sender is usable for DEV |
| **DEP-5** | Whether the available queue is DEV or PROD | ✅ **RESOLVED — DEV** (product owner, 2026-09-16). T-9 is unblocked |
| **DEP-6** | `--profile IBD-DEV` on every AWS command | Standing constraint |

**Assumption A-1:** the microservice accepts a `from.email` whose domain its SMTP is authorized for; an unauthorized domain fails at SMTP, invisibly to us (D-H). Mitigated by using its default sender until DEP-4 is explicitly widened.

**Assumption A-2:** the legacy `auth: {username, password}` pair remains accepted during the transition. Relied on **only** for the optional pre-key smoke test, never in shipped code.

---

## 8. Open Questions

| ID | Question | Blocking? |
|---|---|---|
| **OQ-1** | ADR number. ⚠️ **Revisions 1–2 recorded "this branch at ADR-014" — false.** Verified: **`email-ms` (current) tops out at ADR-013**; ADR-014 exists only on `feat/legal-notices`, where the original survey was taken (`git reflog` shows the checkout moved between them). **KZ-010 ×3 verbatim.** Re-survey at apply time on the default branch, counting unmerged branches. | No |
| **OQ-2** | Does `MailMessage.replyTo` stay on the interface as documented dead weight, or get removed? | No — design decides |
| **OQ-3** | Is the available queue DEV or PROD (DEP-5)? | **Yes, for T-9 only** — blocks verification, not implementation |
| **OQ-4** | Is there an ATP/Jira ticket to link? | No |
| **OQ-8** | Broker `connection_max`, and the queue's declared **durability** — `checkQueue` cannot verify it (design DD-3). *Defined in `design.md`; listed here because FR-1 defers to it* | No |
| **OQ-9** | Confirm that a superseded-by pointer is the right treatment for the two active specs asserting SES, rather than editing them. *Defined in `design.md`* | No |
