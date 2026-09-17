# Design — Email via the OneCGIAR Notification Microservice

- Spec path: `docs/specs/enhancement/email-notification-microservice/`
- Status: Draft — **revision 3** (final correction round; see `judgment.md` rounds 1 and 2)
- Traces requirements: FR-1…FR-8 · NFR-1…NFR-5, **NFR-7** (NFR-6 withdrawn — see `requirements.md`)
- Branch: **`email-ms`** ⚠️ *corrected in revision 3 — revisions 1–2 recorded `feat/legal-notices`, and the ADR survey was taken there. See §11.*

> **Revision 2 changelog.** Fifteen findings confirmed by two blind judges. Revision 1's §3, §4.3, §4.4, §7 and Budget rested on false premises about this repository. Materially changed: the dispatch topology (§3); no-republish semantics (DD-4); `checkQueue` replacing `assertQueue` (DD-3); async error listeners (DD-5); a rollback control (§7.3); the file inventory; a Documentation section that did not exist (§11); a recomputed budget.
>
> **Revision 3 changelog.** The round-one correction **introduced four new severe findings** — the KZ-008 pattern of a fix containing a fresh defect of the same class. Two were genuine engineering errors, not wording: **DD-10's arithmetic omitted the ~500 ms of pre-send work inside the timed window**, so the security property it claimed to make structural would have stayed open behind a green test; and **DD-4's positional retry boundary removed recovery for D-F**, the risk this design exists to survive, losing the first message after every container freeze. Also corrected: a rollback command that could not run and would have breached the 250 MB Lambda limit (§7.3); an inventory still missing nine backend files including a third leak gate; FR-6's acceptance criterion, which was unsatisfiable as written; and the branch context, which was wrong in all three documents.

---

## 1. Approach Overview

`MailTransport` is already a **port** — a one-method interface with a lazily-resolved factory and two adapters. This design adds a third adapter and, in a **second phase gated on deployed verification**, deletes one. Nothing above the port changes in shape: `MailService` and the five call sites keep their signatures.

```
MailService.dispatch()
   │
   ▼
getMailTransport()              ← selects on MAIL_TRANSPORT
   │
   ├── NoOpMailTransport             (unchanged — local default)
   ├── SesMailTransport              (Phase A: retained · Phase B: deleted)
   └── MicroserviceMailTransport     ← NEW
          │  amqplib · confirm channel · checkQueue · one bounded deadline
          ▼
   RabbitMQ (durable queue, default exchange)
          │
          ▼
   notification-microservice ──► CLARISA (validates apiKey) ──► SMTP ──► recipient
                             └─► Slack #microservices-notifications
```

**Architecture tier: LITE.** One queue, one message pattern, no consumer of our own, and — after DD-3's correction — **no topology write**: we verify the queue exists rather than declaring it. Revision 1 claimed "we declare no routing" while specifying `assertQueue`, which was a contradiction (judgment S-4); this revision makes the claim true.

---

## 2. Data Model Changes

**None.** No Prisma model, column, migration, index, or seed change. No new field reaches `pii-consent.policy.ts`; the two public projections in `role-aware.serializer.ts` are untouched. `MailMessage` is a transient in-memory DTO.

---

## 3. API Surface & Contracts

No endpoint is added, removed, or re-pathed. One **semantic** change:

| Endpoint | Code | Before | After |
|---|---|---|---|
| `POST /api/v1/contact` | `202` | Handed to SES | Durably accepted by the broker **into a queue proven to exist** (DD-3) |
| `POST /api/v1/contact` | `502` | SES rejected | Broker did not confirm within the send deadline |

Response bodies, headers and error envelopes are byte-identical — no frontend change, no API-client regeneration.

### 3.1 Dispatch topology — corrected

Revision 1 asserted that `POST /registrations/verify` "never awaited the send". **That was false.** The true topology, read from the code:

| Kind | Call site | Awaited? | Timing constraint |
|---|---|---|---|
| `verification-code` | `RegistrationsService.requestVerificationCode` | **Awaited**, in its own `try/catch` | **Yes — `padToVerificationCodeResponseFloor`**, floor `VERIFICATION_CODE_RESPONSE_FLOOR_MS` |
| `contact` | `ContactService` | **Awaited** | None (a `502` is the point) |
| `approval` | `AdminRegistrationsService.dispatchApprovalEmail` | **Awaited** | None — *"an authenticated admin acting on a registration they can already see learns nothing from this method's latency"* |
| `rejection` | `AdminRegistrationsService.dispatchRejectionEmail` | **Awaited** | None — same rationale |
| `receipt` | `RegistrationsService.dispatchReceiptEmail` | **Fire-and-forget** (`void … .catch()`) | Depends on `callbackWaitsForEmptyEventLoop` |

All four awaits landed in `fix/otp-mail-lambda-freeze` (2026-09-03), which fixed a **production incident**: Lambda froze the container the instant the response settled and dropped the in-flight SES call, with its `.catch()` never running.

⚠️ **A stale claim in the file our design depends on.** `src/lambda.ts` states the flag stays load-bearing because *"`AdminRegistrationsService`'s approval/rejection notices and `RegistrationsService.submitRegistration`'s receipt email are still dispatched fire-and-forget by design (DD-9)"*. Approval and rejection are **awaited** — changed by the same commit, and the comment was not updated. Only the receipt still needs the flag. The conclusion (the flag is load-bearing) survives; its stated basis is two-thirds wrong. FR-6's withdrawn-premise sweep owns this correction (§11).

---

## 4. Backend Design

### 4.1 Complete file inventory

**Phase A — add (nothing is deleted):**

| File | Action |
|---|---|
| `src/mail/microservice-mail.transport.ts` | **New** — envelope builder (pure, exported) + adapter |
| `src/mail/microservice-mail.transport.spec.ts` | **New** — envelope, lifecycle, **error sanitization** (§4.4) |
| `src/mail/mail.config.ts` | Add `'microservice'` kind + `getMicroserviceMailConfig`; **retain `'ses'`** |
| `src/mail/mail.config.spec.ts` | Add microservice cases; SES cases retained |
| `src/mail/mail-transport.factory.ts` | Add the branch |
| `src/mail/mail-timing.ts` + `.spec.ts` | **The §12 constants live here** (T-1, shipped) — a dedicated module, not inlined into `registrations/`. ⚠️ *Corrected during T-1 review (A4): this row previously placed the constants in `registrations.service.ts`, diverging from `tasks.md` T-1, which mandated the module that shipped* |
| `src/registrations/registrations.service.ts` | The pre-send deadline over `issueCode(...)`; the re-derived floor; the negative-remainder warn line (DD-10, T-7) |
| `src/mail/ses-mail.transport.ts` | **Bound it too** — `new SESClient({ region })` today sets no `requestTimeout` and keeps SDK-default retries, so the SES path is *unbounded*. Giving it `MAIL_SEND_TIMEOUT_MS` makes the floor valid under **either** transport, so Phase A's higher floor is earned rather than gratuitous. Closes a pre-existing hole on the way past; the file is deleted in Phase B regardless |
| `src/registrations/registrations.service.spec.ts` | Floor-vs-deadline invariant test (DD-10) |
| `src/registrations/registrations-verify.e2e.spec.ts` | Imports `VERIFICATION_CODE_RESPONSE_FLOOR_MS`, asserts against it, and documents its wall-clock cost as "900 ms" — DD-10 falsifies both. ⚠️ **Also needs a Phase-B edit** (it names "an UNPADDED **SES** round trip"), so it appears in both phases |
| `infra/scripts/deploy.sh` · `set-cors.sh` | Pass `MailTransport` through, or the switch is silently reverted (§7.3) |
| `backend/.env.example` | **FR-8's deliverable.** Listed here as well as in §11 — §4.1 is what `tasks.md` decomposes from, and the requirement's acceptance criterion reads this file |
| `backend/package.json` | `+ amqplib`, `+ @types/amqplib` |

**Phase B — remove (gated on T-9 PASS):**

| File | Action |
|---|---|
| `src/mail/ses-mail.transport.ts` · `.spec.ts` | **Delete** (93 + 160 lines) |
| `src/contact/reply-to.util.ts` · `.spec.ts` | **Delete** (180 + 176 lines) — DD-7 |
| `src/mail/mail.config.ts` · `.spec.ts` | Narrow kind to `'microservice' \| 'no-op'`; drop SES cases |
| `src/mail/mail-transport.factory.ts` | Drop the SES branch |
| `src/mail/mail-transport.interface.ts` | Remove `replyTo`; rewrite SES-referencing docblocks |
| `src/mail/mail.service.ts` | Docblock names "SES or no-op" and `replyTo` |
| `src/mail/mail.service.spec.ts` | **Rewrite** — imports `SendEmailCommand`, `resetSesClient`, `aws-sdk-client-mock`; sets `MAIL_TRANSPORT='ses'`; passes `replyTo` in a `MailMessage` literal (**a TS excess-property error the moment the field is removed**) |
| `src/mail/templates/contact.template.ts` · `.spec.ts` | Stop composing `replyTo`; 4 assertions |
| `src/contact/contact.service.ts` · `.spec.ts` | `502` meaning; the `MessageRejected` rationale (§11); 1 assertion |
| `src/registrations/admin-registrations.service.ts` | `MessageRejected` rationale in two docblocks |
| `src/test/pii-boundary.spec.ts` | QA-13 wording only — **not** a restructure (§4.4) |
| `src/lambda.ts` | The stale fire-and-forget claim (§3.1) |
| `src/registrations/registrations.service.ts` | **Added in revision 3** — a **sixth** withdrawn-premise site: *"in this repo's documented SES-sandbox configuration"*, plus a dangling citation of the deleted `ses-mail.transport.ts` |
| `src/contact/contact.e2e.spec.ts` | **Added in revision 3** — a **third leak gate** the design never knew about, built entirely on a `MessageRejected`/sandbox fixture |
| `src/registrations/registrations.service.spec.ts` | **Added in revision 3** — six SES-shaped leak probes |
| `src/registrations/admin-registrations-reject.spec.ts` · `admin-registrations.service.spec.ts` · `contact-no-writes.e2e.spec.ts` · `mail/mail.module.ts` · `mail/no-op-mail.transport.ts` · `contact/admin-recipient.resolver.ts` | **Added in revision 3** — SES-naming comments and one stale "fire-and-forget catch" |
| `backend/package.json` | `− @aws-sdk/client-ses` |

### 4.2 Transport responsibilities

Four responsibilities, nothing else:

1. **Resolve configuration** lazily on first send (FR-3).
2. **Own the connection** — module-scope cache, same singleton shape as `getSesClient()` / `getCognitoAdminClient()`, so a `no-op` run never constructs one.
3. **Build the envelope** — a **separate exported pure function**, so FR-2 is gated by a test needing no AMQP stub.
4. **Publish under one bounded deadline** (DD-4, DD-10).

### 4.3 Connection lifecycle

Lambda freezes containers between invocations; AMQP heartbeats do not fire while frozen, so the broker may close a connection our side believes is open.

⚠️ **Revision 1 specified liveness as "when both report open". `amqplib`'s promise API exposes no such public flag** (judgment C-12). Liveness is therefore tracked by **state we own**, set by the event listeners DD-5 mandates.

| Step | Behavior |
|---|---|
| 0 | Everything below runs inside **one deadline**, `MAIL_SEND_TIMEOUT_MS`, with the lock wait and probe carrying their own sub-budgets — **all values in §12** |
| 1 | Acquire the module-scope **mutex** (DD-11). If a cached pair exists and our `healthy` flag is set, **probe it** (DD-11) |
| 2 | If there is no cached pair, or the probe failed: connect, attach `'error'`/`'close'` listeners (DD-5), open a **confirm** channel, `checkQueue` (DD-3), cache, set `healthy` |
| 3 | Publish **exactly once**, persistent, `mandatory` (DD-3), and await the confirm |
| 4 | On a step-1/2 failure: invalidate and **retry the connection at most once** — no message has been published, so this is not a republish (DD-4) |
| 5 | On a step-3 failure (deadline, nack, or return): **never republish**. Invalidate and throw a sanitized error |

An invalidated connection is closed on a **detached, result-ignored** call — never awaited inside the deadline — so a failed send leaks neither socket nor heartbeat timer, and cleanup cannot consume the caller's budget.

**Heartbeat.** The connection is opened with an explicit `heartbeat` value rather than the library default. Revision 2 specified none, which C-12 flagged and revision 2 did not answer. The value is a **tunable with a stated default of 30 s** and is a T-9 measurement target: too short and a frozen container is killed for missing beats it could never send; too long and a half-dead socket survives undetected. DD-11's probe is what makes the choice non-critical — liveness stops depending on the heartbeat being right.

### 4.4 Error handling and the credential-leak hazard

⚠️ `RABBITMQ_URL` embeds `user:password`, and `amqplib` errors routinely carry the connection string in `err.message`.

Revision 1's DD-5 covered only the awaited path. **Three paths exist, and all three must close:**

| Path | Closure |
|---|---|
| Synchronous throw/rejection from an awaited call | `try`/`catch` → sanitized error (revision 1 had this) |
| **`'error'`/`'close'` emitted on connection or channel between invocations** | Listeners attached at creation (§4.3 step 2) that sanitize, set `healthy = false`, and **never rethrow**. Without a listener Node throws an unhandled `'error'` and the runtime prints it verbatim |
| **The promise orphaned by the deadline race** | The losing promise gets a `.catch()` attached at race construction, so it can never surface as an `unhandledRejection` |

`backend/src` registers no `unhandledRejection`/`uncaughtException` handler and has no global exception filter (`@Catch` appears only in `registrations/throttler-exception.filter.ts`, scoped by `@UseFilters`). The transport must therefore be self-contained: **a process-level net is explicitly out of scope and recorded as residual risk.**

#### How NFR-3 is actually gated — QA-13 is **not** the gate

⚠️ Revision 1 claimed QA-13 could run "against a transport whose deliberately-leaking variant is *throw the raw amqplib error*". **False.** `pii-boundary.spec.ts`'s contact block does `.overrideProvider(MailService)`, so no transport of any kind executes inside it — stated verbatim in `docs/trd/trd.md` §13 and in the spec's own docblock.

| Gate | What it covers |
|---|---|
| **New**, in `microservice-mail.transport.spec.ts` | An `amqplib` error whose message contains the full `amqps://user:pass@host` URL is injected on each of the three paths; the escaping error's `name` **and** `message`, and every `Logger` call, are asserted to contain no substring of the credential. Run against a non-sanitizing variant to prove the gate reddens |
| **QA-13, unchanged** | Continues to gate `ContactService`'s `err.name`-only catch. Its wording is corrected where it names SES; its structure is not touched |

This splits one false claim into two true ones. `pii-boundary.spec.ts` changes by wording only.

### 4.5 Configuration surface

| Variable | Required? | Source |
|---|---|---|
| `MAIL_TRANSPORT` | **throws if unset/invalid** | `microservice` deployed · `no-op` locally · **`ses` remains valid through Phase A** — it is the rollback control (§7.3) |
| `RABBITMQ_URL` | **throws if absent** | Platform team — **secret** |
| `EMAIL_QUEUE_NAME` | **throws if absent** | Platform team — **secret in deployed environments** (product owner, 2026-09-16). Not a credential and grants no access alone, but it discloses the platform's queue naming and target environment, so it resolves from `MailMicroserviceSecret` rather than sitting as a committed literal |
| `MICROSERVICE_API_KEY` | **throws if absent** | CLARISA — **secret** |
| `EMAIL_SENDER` | **throws if absent** | Platform team — **deliberately NOT a secret.** It is the `From` header of every message the system sends, so it is public by construction; hiding it would add an operator step and protect nothing. SPF/DKIM is the control against spoofing, not its absence from a file |
| `EMAIL_SENDER_NAME` | **defaults**, never throws | Fixed: `ACCELERATE Tanzania Seed Registry -` |

Five throw, one defaults — resolving judgment S-7, which found this undecided across both documents. FR-3's enumeration is amended to match.

---

## 5. Frontend Design

**No component, route, or token change.** One copy question is escalated rather than decided here — see **OQ-7**.

---

## 6. Security & RBAC

| Concern | Effect |
|---|---|
| Roles | Unchanged |
| PII | Recipient addresses leave the process as before. **New:** the microservice posts each subject to Slack; approval/rejection/receipt subjects carry the applicant `reference`. No subject carries an address; the verification-code subject omits the code |
| Secrets | Two new values, never in the repo or a template literal (FR-7). ⚠️ They **do** resolve into plaintext Lambda environment variables, readable via `lambda:GetFunctionConfiguration` — the same exposure `DB_PASSWORD` and `OTP_HMAC_SECRET` already carry. Stated because §6 previously implied a stronger property (judgment S-5) |
| New leak path | Credentials in `amqplib` errors — closed by §4.4's three paths |
| IAM | **Seven** `ses:*` grants removed: six actions in three statements in `developer-local-test-policy.json` (a **developer's** IAM user), plus `ses:SendEmail` on the **Lambda execution role**. Revision 1 said "five" and credited all of it to runtime posture; both were wrong |
| Timing oracle | The constant-time property of the **archived** `actors/public-self-registration` FR-4 is **re-derived and now enforced on all three terms** — DD-10, NFR-7, §12. *(Not this spec's FR-4, which is sender identity — the label collided.)* |

---

## 7. Infrastructure / Deployment

All commands use `--profile IBD-DEV`.

### 7.1 Stack changes — complete inventory

| Target | Phase | Change |
|---|---|---|
| `20-backend/template.yaml` | A | Add `MailTransport` **CloudFormation Parameter** (default `ses`); add the five microservice env vars; declare `MailMicroserviceSecret` |
| `20-backend/template.yaml` | B | Flip the parameter default to `microservice`; **remove the `ses:SendEmail` statement from `ApiFunction.Properties.Policies`**; remove `MAIL_SENDER_ADDRESS`; correct the `CONTACT_FALLBACK_RECIPIENT` comment asserting *"the account is still in the SES sandbox… must be a verified identity"* |
| `10-data-auth/template.yaml` | B | Delete params `SenderEmail`, `EnableSesSending`, `CreateSenderIdentity`; conditions `HasSender`, `MakeSenderIdentity`, `UseSes`; resource `SesSenderIdentity`; the `EmailConfiguration` `!If` → unconditional `COGNITO_DEFAULT` |
| `10-data-auth/ses-cognito-send-policy.json` | B | **Delete** |
| `10-data-auth/t9-enable-ses.sh` | B | **Delete** — 128 lines. Deploys with `SenderEmail=`/`EnableSesSending=` and `sed`s the policy file above; after those deletions it is a committed script that cannot run |
| `policies/developer-local-test-policy.json` | B | Remove three statements / six actions |
| `policies/README.md` | B | Remove two rows |

`infra/scripts/deploy.sh` passes no SES parameter override, so deleting those parameters does not break it — verified.

### 7.2 Secret topology

**Owner: `20-backend`**, mirroring `OtpHmacSecret`, which is declared in that same stack with a deterministic `Name: !Sub "${AWS::StackName}-…"` and consumed by its own Lambda. Revision 1 left the owner undefined (judgment C-15); a CLI-created secret would be drift under `docs/infrastructure.md` §5 rule 2 ("SAM only").

`MailMicroserviceSecret` holds one JSON document whose keys are defined by `GenerateSecretString` in `infra/20-backend/template.yaml` — the single authority. Each key is consumed as its own `{{resolve:secretsmanager:…:SecretString:<key>}}` reference. *(This sentence named two keys until 2026-09-17; the 2026-09-16 change that added `queueName` swept §4.5 and the template but missed here. Naming them again would only move the next miss.)*

⚠️ **Two-deploy bootstrap, unavoidable.** Dynamic references resolve at deploy time, so the first deploy creates the secret with a placeholder and resolves that placeholder. Sequence: deploy → operator writes the real values → **redeploy**. The Lambda carries a non-working configuration in between; harmless while `MailTransport=ses`.

The operator step MUST use `--secret-string file://<path>` from a `600`-mode temp file that is shredded afterwards — never an inline literal, which would land the broker URL and API key in shell history, the exact hazard FR-7 exists to prevent (judgment S-6).

### 7.3 Rollout and rollback — a control that exists

Revision 1 claimed *"`MAIL_TRANSPORT` is the switch, and reverting is one parameter."* **Both halves were false**: it is a hardcoded `Environment.Variables` literal, and revision 1's own §4.1 deleted the SES adapter in the same change.

This revision makes the claim true by construction:

1. **Phase A** adds `MailTransport` as a real CloudFormation `Parameter` with `AllowedValues: [ses, microservice]` and `Default: ses`, and keeps `'ses'` a valid `MailTransportKind`.

   ⚠️ **Revision 2 documented the switch as a bare `sam deploy --parameter-overrides …`. That command cannot run**, and running it literally is destructive. Both re-judges found it: it omits `--stack-name`, `--config-file`, `--region` and `--capabilities`, and — critically — it would deploy the **source** template. `infra/scripts/deploy.sh` warns in capitals that doing so *"zips the raw CodeUri (the full backend/ dev node_modules, ~500MB) … blowing the 250MB Lambda unzip limit"*, because `Metadata: BuildMethod: makefile` requires a prior `sam build`.

   **The switch therefore goes through the repo's own script, which this spec must amend.** `deploy.sh` and `set-cors.sh` today pass only `AllowedOrigin` and `DataAuthStackName`; SAM sends `UsePreviousValue` for any parameter absent from `--parameter-overrides`, so a `Default:` change is ignored on an existing stack and **the next unrelated operator run would silently revert the transport**, possibly mid-verification. Both scripts gain `MailTransport` as a pass-through with an env-var override, exactly as `AllowedOrigin` is already handled.

2. **T-9** verifies on the deployed dev stack.
3. **Phase B** runs only on T-9 PASS, and only then narrows the kind, deletes the adapter, strips the IAM grant, and sweeps the docs. Because a stack can retain `MailTransport=ses` through `UsePreviousValue`, Phase B's first deploy **must pass the parameter explicitly** — flipping the template default is inert on a deployed stack, and `AllowedValues` will not reject a previously-valid value. A stack left on `ses` after the code stops accepting it throws on every send, with no deploy-time signal.

**FR-3's clause *"must NOT accept `ses`"* is therefore a Phase-B acceptance criterion, not a Phase-A one** — `requirements.md` FR-3 is amended to say so, because as written it forbade the very fallback the rollout depends on.

Rollback after Phase B is a `git revert` plus redeploy of both stacks, with the SES identity re-created and re-verified by email — tens of minutes. That asymmetry is why Phase B is gated.

---

## 8. Decision Records (ADR-style)

### DD-1: Adapt the existing port; introduce no new abstraction
Unchanged from revision 1. Options: (a) new adapter behind the existing port; (b) a general "notification" abstraction. **Decision: (a).** (b) is speculative generality for a system with one channel.

### DD-2: `amqplib` directly, not `@nestjs/microservices` `ClientProxy`
Unchanged. `ClientProxy` wraps `amqp-connection-manager`, whose background reconnection relies on **timers that do not fire while a container is frozen**; its internal buffer can hold a message that dies with the container, indistinguishable from a send; and `emit()` resolves on local buffer write, not broker acceptance, which would make FR-5's `502` unfalsifiable. Cost: ~40 lines of lifecycle by hand.

### DD-3: `checkQueue`, not `assertQueue` — plus `mandatory` ⚠️ *revised*
- **Context:** A publisher confirm attests **persistence, not routing**.
- **Revision 1 specified `assertQueue`.** Both judges found the consequence: a mistyped `EMAIL_QUEUE_NAME` **creates** a new, correctly-declared, unconsumed queue and confirms every publish forever. Every request returns `202`, zero emails are delivered, and — with `noAck: true`, no DLQ and no callback — nothing anywhere can distinguish it from success. Compounded by the unresolved DEV/PROD queue ambiguity (DEP-5).
- **Decision:** `checkQueue` on connect (fails loudly when the queue does not exist → a configuration error, not a silent success), plus `mandatory: true` with a `'return'` listener that fails the send if the queue disappears between check and publish.
- **Consequences:** The first-run misconfiguration becomes a loud failure. `checkQueue` failing closes the channel — correct, since the configuration is unusable. We also stop writing topology we do not own, making §1's LITE claim true. **Correction:** revision 1's *"an ack arrives only once the broker has the message on disk"* overstated RabbitMQ's guarantee — the broker takes responsibility; persistent writes are batched. FR-1's `PRECONDITION_FAILED` clause is retained but is now unreachable, since we no longer declare.

### DD-4: Connection may be retried; the **message** is published exactly once ⚠️ *revised*
- **Context:** Revision 1 said "reconnect once, **retry once**", which both judges found in direct contradiction with FR-1's *"**AND IT MUST** publish exactly once per send call"*.
- **Decision:** Split the two failure classes. A failure **before** the publish (connect, channel open, `checkQueue`) may be retried once — **no message was written, so this is not a republish**. A failure **at or after** the publish (deadline, nack, return) is never retried.
- **Consequences:** FR-1 stands unamended; revision 1's defect was imprecision, not a real conflict. A duplicate OTP or duplicate approval notice is structurally impossible. Cost: a confirm lost to a network blip loses that message — correct, since the alternative is a duplicate we could never detect. Also removes the "~2× the timeout" budget that broke DD-10.
- ⚠️ **Revision 2's boundary was *positional*, not evidential — and it removed recovery for the top risk.** Both re-judges found it: a connection killed by a freeze is only discovered when `'error'`/`'close'` arrives **on thaw**, which can be *after* `publish` was called. That lands in step 5, so under revision 2 **the first send after every freeze was permanently lost** — precisely D-F, the risk §9 ranks highest, whose mitigation pointed at this decision. Revision 1's blanket retry had covered it.
- **Resolution (revision 3): DD-11's pre-publish probe.** A stale connection is now detected *before* anything is written, which makes it a step-1 failure — retryable by construction. The boundary stops being "where in the sequence did it fail" and becomes "was a frame written", which is the question that actually determines whether a retry is safe. The genuinely ambiguous case — connection death *during* the publish write — remains non-retryable, correctly, and is now the only case that reaches step 5.

### DD-5: The adapter closes **all three** leak paths ⚠️ *revised*
- **Context:** `amqplib` errors embed the credential-bearing URL.
- **Revision 1 covered only the synchronous path.** Both judges found that an `'error'`/`'close'` emitted between invocations — exactly the freeze window this design is built around — has no listener, so Node throws it as an uncaught exception and the runtime prints it verbatim.
- **Decision:** `try`/`catch` **plus** connection- and channel-level `'error'`/`'close'` listeners attached at creation **plus** a `.catch()` on the promise orphaned by the deadline race. See §4.4.
- **Consequences:** Diagnosing broker failures from CloudWatch is harder; the microservice's Slack channel is the richer surface. A process-level net remains absent and is recorded as residual risk.

### DD-6: Secrets via CloudFormation dynamic references
- **Decision:** Dynamic references, owned by `20-backend` (§7.2).
- **Consequences:** Matches the `DB_PASSWORD`/`OTP_HMAC_SECRET` precedent; no cold-start call, no IAM grant. Costs: a two-deploy bootstrap, rotation requires a redeploy, and **the resolved values sit in plaintext Lambda environment configuration** — the same exposure the two existing secrets already carry, stated here because §6 previously implied otherwise.

### DD-7: Remove `replyTo` end-to-end ⚠️ *reverts delivered behavior · counts corrected*
- **Context:** The microservice DTO has no reply-to field. `replyTo` is produced by `contact.template.ts` via `composeReplyTo` and consumed **only** by `SesMailTransport`.
- **Decision:** Remove the field, `reply-to.util.ts`, and its spec.
- **Consequences:** Keeping an unread field is a trap — a future author sets it, nothing happens, nothing fails. CC-ing the visitor is rejected outright: it would send them the admin-facing message, disclosing the internal note format and the resolved administrator recipients.
- **Step 2.3 challenge — corrected.** Revision 1 said "four assertions elsewhere"; it is **five**, in two files (`contact.template.spec.ts` ×4, `contact.service.spec.ts` ×1) — plus a `MailMessage` literal in `mail.service.spec.ts` that becomes a **TypeScript excess-property error**, i.e. a build break, not an assertion. Revision 1 also promised "FR-5's scenario gains the body-row assertion"; **no such clause exists**. The true position: the visitor's address surviving into the body is **already** pinned by `contact.template.spec.ts`'s existing "renders the requester address as body data" assertion, so that is cited rather than invented. The one real coverage loss is `contact.service.spec.ts`'s `expect(message.replyTo).toContain(dto.email)` — the only assertion in `ContactService`'s own suite proving the DTO's `email` reaches the rendered message — and it is **replaced in the same task** by an equivalent assertion against the rendered body.

### DD-8: Always send `to` as a trimmed array
Unchanged. A malformed entry invalidates the whole list; a trailing `", "` is a documented footgun.

### DD-9: No application-level subject prefix
Unchanged. The microservice prepends `TEST - ` for non-PROD keys; the environment marker becomes a property of the credential, which cannot then drift from the key in use.

### DD-10: The floor is **composed**, not merely compared ⚠️ *rewritten in revision 3*
- **Context:** `requestVerificationCode` **awaits** the send, then pads to `VERIFICATION_CODE_RESPONSE_FLOOR_MS`, measured from `startedAtMs` taken **at method entry**. That floor keeps the accepted and over-cap branches indistinguishable (the archived spec's FR-4 enumeration clause).
- **Revision 2's error, found by both re-judges.** It set `MAIL_PUBLISH_TIMEOUT_MS = 1500`, raised the floor to `1800`, and asserted the invariant `timeout < floor`. **The send is not the only thing inside the timed window.** `issueCode` — a Prisma `INSERT … ON DUPLICATE KEY UPDATE` plus HMAC hashing — runs *before* the send, and the floor's own docblock records its measured cost: *"this endpoint's own observed ~500 ms synchronous baseline (CloudWatch, 2026-09-03, `latencyMs 498.9`)"*. Worst case is ≈500 + 1500 = **2000 ms against an 1800 ms floor**, and `padToVerificationCodeResponseFloor` **no-ops on a negative remainder**. The oracle would have stayed open *while a new test asserted it was closed* — strictly worse than leaving it unfixed.
- **Decision — Option A (product owner, 2026-09-15): bound *every* term, then compose the floor from the bounds.**

  ⚠️ **Values live in exactly one place — §12. No other document or section restates them.** Rounds 2 and 3 of Judgment Day both failed because a constant written in four documents was updated in two; the single-home rule is the structural countermeasure, not another sweep.

  **Invariant: `PRESEND_ALLOWANCE + SEND_TIMEOUT ≤ FLOOR`**, with **all three terms enforced at runtime**. The previous revision enforced only one of the three and called the result structural.
- **What makes it structural this time — the pre-send term is now *enforced*, not assumed.** Judgment round 3 established that nothing bounded `issueCode`: this repo documents Prisma's **5000 ms** interactive-transaction ceiling on that critical section, **6.25×** the allowance. Option A closes that by bounding the **whole `issueCode(...)` call** from its caller. A pre-send region slow enough to breach the allowance now **fails the request** — reaching the third, deliberately-unpadded exit, which is address-independent infrastructure failure and already outside the byte-identity surface by the existing code's own reasoning. Failing loudly beats leaking silently.
- ⚠️ **Why the bound is on the call, not on the transaction (corrected during T-1 review, advisory A3).** This decision first specified *"an explicit timeout on `issueCode`'s transaction"*. Verified against the source, that is **insufficient**: the `$transaction` wraps only the `EmailSendBudget` upsert and its read-back — `generateCode()`, `hashCode()` and `await prisma.emailVerification.create(...)` all execute *after* it. Worse than a two-thirds shortfall: the **over-cap branch throws immediately after the transaction**, while the **accepted branch** additionally pays `emailVerification.create`, another unbounded round-trip. The unbounded term is therefore precisely the one that **differs between the two branches** — the divergence this floor exists to erase. A transaction timeout would have left the oracle open while the constants test asserted the arithmetic was sound: the same green-gate-over-a-live-defect shape Judgment Day rounds 2 and 3 both condemned.
- **Gate.** A unit test asserts the composed inequality over the three constants (falsifying input: raise either term past the floor). Because all three are now enforced, this is a real gate rather than arithmetic over one real and two aspirational numbers.
- **Second signal, retained.** When the remainder is negative, `padToVerificationCodeResponseFloor` emits a warn line carrying the overrun in ms **and no address** — so a residual overrun is observable rather than silent. T-9 confirms it is absent under normal load.
- **Both transports are bounded, which is why the floor is not gratuitous in Phase A.** Judgment round 3 found that landing a higher floor while still on SES would tax every applicant for a property the SES path does not enforce — `ses-mail.transport.ts` constructs `new SESClient({ region })` with no `requestHandler`, no `requestTimeout` and SDK-default retries, i.e. **unbounded today**. Phase A therefore also gives the SES client the same `SEND_TIMEOUT`. The floor then holds under whichever transport is active, and a pre-existing hole closes on the way past.
- **Consequences:** every verification request costs ≥ the floor. The **third** exit (unexpected non-cap error) stays deliberately unpadded — address-independent by construction. The two padded branches are the accepted branch and the over-cap branch; note they do **not** perform identical pre-send work (the over-cap branch throws before `emailVerification.create`), which is precisely why the allowance is sized on the **accepted** branch, the larger of the two.
- **Residual, stated:** the *values* remain reasoned rather than measured — T-9 supplies the first real numbers. What changed is that each value is now a **ceiling the code enforces**, so being wrong about one produces a failed request or a warn line, never a silent divergence between the two branches.

### DD-11: A pre-publish liveness probe, and a mutex over the cached pair ⚠️ *new in revision 3*
- **Context:** Two residues from C-12 that revision 2 left unanswered, plus the mechanism DD-4 needs.
- **Decision — probe, with its own sub-deadline.** Before publishing on a **cached** connection, issue one cheap `checkQueue` round-trip **bounded by `PROBE_TIMEOUT_MS` (§12), not by the overall send deadline.**

  ⚠️ **Why the sub-deadline is the whole point.** Judgment round 3 found the flaw in the un-bounded version: D-F's canonical shape is a **half-open socket**, and a round-trip on one does not throw — it *waits for a reply that never arrives*. An unbounded probe would therefore consume the entire send budget on exactly the failure it was added to detect, leaving nothing for the reconnect. The probe is classified as retryable **and** must remain affordable; §12's budget guarantees `PROBE + RECONNECT + PUBLISH ≤ SEND_TIMEOUT`.
- **Distinguishing the two things `checkQueue` can tell us.** It serves two roles, and round 3 found they were conflated. The rule: **a probe that times out means the connection is stale** (invalidate, reconnect, retry once); **a probe that returns `NOT_FOUND` means the queue does not exist** (a configuration error — throw immediately, never reconnect). Without that split, a mistyped `EMAIL_QUEUE_NAME` would cost two full connection cycles per send and surface as a timeout instead of the loud configuration error DD-3 exists to produce.
- **Why this is the right shape:** revision 2 tried to classify failures by *position in the sequence*, which cannot distinguish "the socket was already dead" from "the frame was written and the ack was lost". The probe makes the distinction **evidential**: a connection that answers a round-trip immediately before the publish was alive at that moment, so a subsequent failure is genuinely ambiguous and correctly non-retryable. Everything else is caught before a byte is written.
- **Cost:** one extra round-trip per send on the warm path — tens of milliseconds against `MAIL_PROBE_TIMEOUT_MS` (§12), and the price of not losing a message after every container freeze. On the cold path it is free: `checkQueue` already runs at step 2. On a **hung** path it is capped by its own sub-budget, which is the point.
- **Decision — mutex, with explicit scope and release.** A module-scope async mutex is held **from probe/acquire through the confirm** — the wide scope, chosen deliberately: the narrow "serialise acquire/invalidate only" scope does not deliver the `'return'` attribution below, and round 3 found revision 3 asserting both scopes in consecutive paragraphs. The receipt kind is dispatched `void … .catch()` (§3.1), so a receipt publish can be in flight while a concurrent request invalidates the pair; without the mutex one send's failure tears the channel out from under another's publish.

  ⚠️ **Release is specified, because a mutex that is not released is never released.** Node in Lambda is single-threaded, so a lock leaked on the timeout path would fail *every subsequent send in that container for its lifetime* — and DD-5 strips error detail by design, making it undiagnosable. Therefore: the lock is released in a `finally`, and **the deadline race is constructed *inside* the critical section**, never around it, so a timeout unwinds through that `finally` like any other outcome.
- **Cost, stated:** waiting for the lock is charged to the caller. A concurrent `void`-dispatched receipt can therefore delay an awaited contact or OTP send. `ReservedConcurrentExecutions: 5` bounds this to five single-threaded containers, and `WAIT_TIMEOUT_MS` (§12) bounds the wait itself — a send that cannot acquire the lock in time fails having never touched the broker, which is reported distinctly from a broker failure so the operator can tell them apart.
- **Also serialised:** `mandatory`'s `'return'` event is delivered on the **channel**, not correlated to a publish. Under the wide scope only one publish is outstanding per channel at a time, so a return is unambiguously attributable to it. Without that, a returned message could fail an unrelated send.

---

## 9. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **D-F** — connection dead after freeze | **High** | DD-4, DD-5, §4.3; T-9's cold → idle → warm sequence. No CI gate exists |
| **D-I (new)** — freeze during the **fire-and-forget receipt** send | **High** | The receipt is the one unawaited kind and depends on `callbackWaitsForEmptyEventLoop`. Its unawaited window grows from one in-region HTTPS POST to a possible TCP+TLS+AMQP handshake. **T-9 must observe receipt delivery after the `202`**, not only the awaited kinds |
| **D-G** — HTML wrong after `juice` | Medium | Human visual check per kind (T-9). Low prior: the layout is fully inline-styled with no `<style>` block |
| **D-H** — accepted then dropped at SMTP | Medium | **Unmitigable from this system.** ADR + runbook; Slack is the only signal |
| **D-J** — publish confirmed into a queue **that does not exist** | **High → closed** | DD-3's `checkQueue` + `mandatory`. ⚠️ *Narrowed in revision 3:* `checkQueue` proves **existence, not consumption**. A correct name pointing at the wrong environment's queue (DEP-5) or a stopped consumer reproduces the original symptom and passes the check. The transport therefore also reads `checkQueue`'s `consumerCount` and logs a warn line when it is zero — a signal, not a gate |
| Broker credentials in logs | High | DD-5's three paths; the new transport-level gate (§4.4) |
| Deploy fails on an empty secret | Medium | §7.2's two-deploy bootstrap |
| Queue is PROD, not DEV → unmarked real mail | ~~High~~ **Closed** | ✅ DEP-5 answered **DEV** (product owner, 2026-09-16). T-9 unblocked |
| No process-level unhandled-rejection net | Medium | Residual, accepted. The transport is self-contained by design |
| Shared-broker connection limit | Low | Each cold start opens a connection the broker holds until its own timeout; not covered by DEP-3/DEP-4, and undiagnosable under DD-5. Ask the platform team for `connection_max` |
| Artifact exceeds 250 MB | Low | `backend/Makefile` **records** "Net artifact ~180 MB" — recorded, not re-measured since `amqplib` was added. NFR-5 requires a post-`sam build` measurement; until then neither "established" nor "uncorroborated" is the right word, and both documents now say the same thing |

### NFR sweep

| Attribute | Architecturally significant? |
|---|---|
| Security | **Yes** — three leak paths (DD-5), secret topology (DD-6), IAM reduction, **and the timing oracle (DD-10)** |
| Performance | **Yes** — DD-10's deadline is now a *security* bound, not only a latency one |
| Availability | **Yes** — weaker than SES by construction; DD-3 bounds what `202` can claim, DD-4 bounds the failure cost |
| Observability | **Yes, and it degrades** — no delivery confirmation (D-H); logs shrink by design (DD-5) |
| Scalability | **No** — five low-volume kinds behind `ReservedConcurrentExecutions: 5` |
| Modifiability | **No** — the port already existed |
| Cost | **No** — removes a service, adds no billed resource |

---

## 10. Test Plan Outline

| Layer | Coverage | Requirements |
|---|---|---|
| Unit — envelope builder (pure) | Exact JSON; `html`→`socketFile`; `to` always an array; **no `id`**; HTML never in `text`; both parts when HTML exists; **`from.email`/`from.name` separate, never a `"Name" <addr>` composite** | FR-2, **FR-4**, DD-8 |
| Unit — config | Throws naming each of the **four** required transport variables (§4.5); `EMAIL_SENDER_NAME` defaults; rejects a kind invalid for the phase; resolves lazily; never echoes a secret | FR-3 |
| Unit — lifecycle (mocked `amqplib`) | Reuses a healthy pair; **a hanging probe is cut at `PROBE_TIMEOUT` and still leaves budget to reconnect**; a probe returning `NOT_FOUND` throws a configuration error **without** reconnecting; retries the connection once; **never republishes** after a publish-phase failure; releases the mutex on every path **including the timeout**; detaches cleanup | FR-1, NFR-1, NFR-2, DD-4, DD-11 |
| Unit — `checkQueue` | A non-existent queue fails loudly as a configuration error; **never creates a queue**; `consumerCount == 0` warns without failing | FR-1, DD-3, D-J′ |
| Unit — **error sanitization (new gate)** | A URL-bearing `amqplib` error on each of the three paths escapes with no credential substring in `name`, `message`, or any `Logger` call. Run against a non-sanitizing variant | NFR-3, DD-5 |
| Unit — **timing invariants** | **Both invariants of §12.3**, over the constants in §12 — not a two-term comparison. Plus: the **whole `issueCode(...)` call** is bounded by `PRESEND_ALLOWANCE` (not its transaction — A3); the probe and lock waits carry their own bounds | NFR-7, DD-10, DD-11 |
| e2e — contact | `202` on confirm; `502` on failure; envelope byte-identical; **the requester address still renders as body data** (DD-7's replacement) | FR-5 |
| e2e — PII boundary (QA-13, **unchanged in structure**) | Continues gating `ContactService`'s `err.name`-only catch | NFR-3 |
| Regression — dispatch placement | Committed writes survive a transport failure | NFR-4 |
| Sweep | SES and its withdrawn premises absent outside `archive/` | FR-6 |
| IaC | `./infra/scripts/validate.sh` green across all three stacks | FR-7 |
| Docs | `.env.example` names every variable with its source; no real values | FR-8 |
| **Manual, deployed (T-9)** | One real email per kind to a never-verified address, over cold → idle → warm; **receipt observed after its `202`** (D-I); visual HTML check; **measured cold/warm publish latency vs DD-10's bounds** | D-F, D-G, D-I, FR-1 |

The last row remains the only evidence for the highest risks — and now also the only source of the numbers DD-10 was reasoned, not measured, against.

---

## 11. Documentation Impact ⚠️ *new — revision 1 had no such section*

Three constitutional baselines are in scope. No test covers them, which is why root `CLAUDE.md` mandates a Reviewer here.

| Document | Change |
|---|---|
| `docs/trd/trd.md` §12.1 | C4 Context: replace the `AWS SES` box. **The label "sends invites / resets" is already false** — Cognito email is suppressed and `EnableSesSending` defaults `"false"` |
| `docs/trd/trd.md` §12.2 | C4 Container: add the microservice as an external system |
| `docs/trd/trd.md` §12.5 | **ADR-015** — the transport decision, recording: delivery guarantee weakened to "enqueued"; no retry/DLQ (D-H); the Slack subject disclosure; the plaintext-env secret exposure; DD-10's re-derived floor |
| `docs/trd/trd.md` §13 QA-13 | Correct the SES-specific wording; structure unchanged |
| `docs/infrastructure.md` §2 | Remove the `AWS::SES::EmailIdentity` row |
| `infra/README.md` §6 | **Selective delete — by content, never by line range.** ⚠️ **Two survivors sit inside the SES block and must be relocated, not deleted:** (1) `### Known limitation — CONFIRMED-user reset code has no in-app entry page (OQ-5)` — not SES-specific, and still true precisely *because* this spec keeps Cognito on `COGNITO_DEFAULT`; (2) the **`PortalUrl` parameter row**, whose only live documentation is inside the block — `PortalUrl` **survives** in `10-data-auth` as the invitation-email CTA. *Round-3 judgment caught (2) after the round-2 correction had rescued (1) by name and then specified a line range that swallowed the other. Deleting by range is what keeps reintroducing this; the task deletes by content.* |
| `infra/README.md` §2 | A **further** withdrawn premise: *"the one thing that genuinely requires AWS is real email delivery… the minimum policy for that is `developer-local-test-policy.json` — SES send + sandbox verification"*. False after Phase B |
| `infra/10-data-auth/template.yaml` | ⚠️ **A product consequence, not a doc edit.** The pool's branded `InviteMessageTemplate` / `VerificationMessageTemplate` were written to render through SES; `infra/README.md` records that under `COGNITO_DEFAULT` they *"may look degraded — an acceptable rollback state"*. This spec makes that the **permanent** state for admin invitations and password resets. Escalated as **OQ-10**, not silently absorbed |
| `infra/policies/README.md` | Remove **three** SES rows (not two — `SendThroughTheVerifiedRegistrySender`, `VerifyRecipientsWhileInSandbox`, `ReadSendingStatus`) **and rewrite the file's framing**: its stated purpose ("actually deliver a contact-form email", "the one thing that genuinely requires AWS") is withdrawn, and it cites `ses-mail.transport.ts`, which Phase B deletes. After the change the policy grants only Cognito `ListUsersInGroup` plus read-only CloudFormation/STS |
| `backend/.env.example` | **FR-8's deliverable** — every variable with a comment naming its source; `MAIL_TRANSPORT=no-op` stays the local default; placeholders only |
| `backend/CLAUDE.md` | Restate the no-email credential handoff's rationale — it cites *"corporate `@cgiar.org` deliverability + SES sandbox limits"*, and this change withdraws the second half. **Behavior unchanged; only the justification is corrected** (KZ-004) |
| `backend/AGENTS.md` | Mirror, per the root guide's mirroring rule |
| `src/lambda.ts` | The stale fire-and-forget claim (§3.1) |
| `contact.service.ts`, `admin-registrations.service.ts` | Their `err.name`-only logging is justified on the AWS SDK's `MessageRejected` behaviour — restate on grounds that survive, since those comments are *why* the two most sensitive log lines are written that way, and DD-5 now depends on them |

**ADR numbering.** ⚠️ Revisions 1–2 stated *"`main` is at ADR-013, this branch at ADR-014"*. **False for this working copy**, found by a re-judge and verified directly:

| Branch | Highest ADR |
|---|---|
| `email-ms` (**current**) | **ADR-013** |
| `feat/legal-notices` | ADR-014 |

`git reflog` records `checkout: moving from feat/legal-notices to email-ms`; the ADR survey was taken on the other branch. **This is KZ-010 ×3 verbatim** — *a measurement taken on the wrong branch is not a slow measurement, it is a wrong one.* Harm is bounded because allocation was already deferred, but the number must be re-surveyed at apply time **on the default branch**, counting unmerged branches (`feat/legal-notices` holds ADR-014, so ADR-015 is the likely allocation only if that branch merges first).

---

## Budget (Step 2.4 — tripwire) — *recalibrated in revision 4*

| Metric | Expected |
|---|---|
| Tasks | **17** (8 Phase A · 1 verification gate · 8 Phase B) |
| Lines changed | **≈ 1,850** |
| Review rounds | **3** |

**Deletions ≈ 905 — measured with `wc -l`, every term verified independently by both round-3 judges:** `ses-mail.transport.ts` 93 + spec 160 · `reply-to.util.ts` 180 + spec 176 · `t9-enable-ses.sh` 128 · `infra/README.md` §6 ~122 · `ses-cognito-send-policy.json` 25 · IaC/policy residue ~21.

**Additions ≈ 945 — recalibrated against this repo's own lines-per-concept.** Revision 3 estimated 545; a judge showed that was ~2× low by measuring comparable files in this tree — `reply-to.util.ts` is **180 lines for one exported function**, `ses-mail.transport.spec.ts` is **160** for an adapter with no cache, no retry and no sanitization, `mail.service.spec.ts` is **266**.

| Item | Lines |
|---|---|
| `microservice-mail.transport.ts` — envelope, lazy config, cache, mutex, probe, listeners, three-path sanitization, `consumerCount` warn | ~320 |
| `microservice-mail.transport.spec.ts` | ~300 |
| `mail.config.ts` / `.spec.ts` / factory deltas | ~80 |
| §12 constants, the two invariant tests, the `issueCode` timeout, the overrun warn line, the SES bound | ~85 |
| IaC: `MailTransport` parameter, `MailMicroserviceSecret`, env block, script pass-through | ~60 |
| §11 documentation sweep incl. ADR-015 | ~100 |

Deletions are exact; additions are calibrated against measured neighbours rather than guessed. This tripwire has now fired twice — once on each side — which is itself the argument for measuring rather than estimating.

---

## 12. Canonical constants — **the single home**

⚠️ **Every timing value this spec introduces lives here and nowhere else.** `requirements.md`, §4.3, §10 and `tasks.md` **reference this section by name; none restates a number.**

This rule exists because of measured failure, not tidiness. Judgment rounds 2 and 3 both failed on the same mechanism: a constant written into four documents, updated in two. Round 3 shipped `MAIL_PUBLISH_TIMEOUT_MS` as `1000` in one document and `1500` in another, and left both *gates* specifying an invariant the decision record had already replaced. A per-correction sweep cannot hold four documents consistent by hand — the Kaizen log records that same sweep recurring as a defect four times (KZ-004). One home removes the class.

### 12.1 Values

| Constant | Value | Enforced by | Covers |
|---|---|---|---|
| `VERIFICATION_CODE_PRESEND_ALLOWANCE_MS` | **800** | A deadline over the **whole `issueCode(...)` call**, applied by its caller | Validation, the `EmailSendBudget` upsert, `emailVerification.create`, code generation + hashing — ⚠️ *corrected during T-1 review (A3): only the upsert is inside `issueCode`'s `$transaction`, so a transaction timeout would bound one of these four. Bounding the call as a unit covers them all and survives anyone moving work across that transaction boundary* |
| `MAIL_SEND_TIMEOUT_MS` | **3000** | The transport, **both** implementations | Lock wait + probe + any reconnect + publish + confirm |
| `VERIFICATION_CODE_RESPONSE_FLOOR_MS` | **3800** | `padToVerificationCodeResponseFloor` | `= PRESEND_ALLOWANCE + SEND_TIMEOUT` |

### 12.2 Sub-budgets inside `MAIL_SEND_TIMEOUT_MS`

| Constant | Value | Why it is bounded separately |
|---|---|---|
| `MAIL_LOCK_WAIT_TIMEOUT_MS` | **200** | A send that cannot acquire the mutex fails having never touched the broker, and is reported distinctly from a broker failure |
| `MAIL_PROBE_TIMEOUT_MS` | **250** | A half-open socket does not throw — it hangs. Without its own bound the probe consumes the whole budget on the exact failure it exists to detect (DD-11) |
| *(remainder ≈ 750)* | — | Reconnect (TCP + TLS + AMQP) + `checkQueue` + publish + confirm |

### 12.2b Connection-level tunables — outside the send budget

| Constant | Value | Why it is not in §12.1/§12.2 |
|---|---|---|
| `MICROSERVICE_MAIL_HEARTBEAT_SECONDS` | **30** | It governs the **connection's** liveness, not a term inside `MAIL_SEND_TIMEOUT_MS`, so it enters neither invariant. It lives beside the transport that uses it rather than in `mail-timing.ts`, whose four exports are exactly §12.1/§12.2's budget terms |

*Added during T-4's review. §12's "every timing value lives here" was written for the floor budget; a connection tunable had no row, which left its placement arguable in both directions. This row settles it — the rule is now "every value in the send budget", and tunables outside it are named here with their reason.*

⚠️ **The heartbeat is ungated by mechanism:** `amqplib` reads it **only from the URL query string**, so a refactor to `connect(url, { heartbeat })` would silently disable it with every test still green. A test must assert the URL handed to `connect` carries it.

### 12.3 The invariants, stated once

1. `PRESEND_ALLOWANCE + SEND_TIMEOUT ≤ FLOOR` — **800 + 3000 = 3800** ✓
2. `LOCK_WAIT + PROBE < SEND_TIMEOUT` — **200 + 250 = 450 < 3000** ✓, leaving a real reconnect budget

⚠️ **Invariant 2 is load-bearing for a second reason, recorded during T-4's review.** It is not only a latency budget: it is what keeps the orphaned-send residual narrow. Because the probe is bounded and `LOCK_WAIT + PROBE < SEND`, the overall deadline **cannot** fire before `acquireConnection`'s stale-branch teardown has already run — so the only window in which an orphaned continuation can overwrite `cached` is a deadline during `connectWithRetry`, whose worst outcome is one leaked connection. **If anyone ever retunes §12 so `LOCK_WAIT + PROBE ≥ SEND`, that residual grows from a leak into "an orphan can tear down a live connection out from under a concurrent send."** Any T-9 re-derivation of these values must re-check the residual, not only the latency budget.

Both are asserted by one unit test over the constants. Falsifying input: raise any term past its container — the test reddens.

### 12.4 Status of these numbers — **measured, 2026-09-16**

⚠️ **`MAIL_SEND_TIMEOUT_MS` and the floor were re-derived from real measurements against the live broker.** Their first values (`1200` / `2000`) were reasoned bounds and **the measurement contradicted them.**

**Five local sends, product owner's laptop → the live CGIAR broker, 2026-09-16:**

| Kind | Elapsed | Outcome |
|---|---|---|
| `receipt` | **1132 ms** | confirmed |
| `approval` | **1170 ms** | confirmed |
| `verification` | **1172 ms** | confirmed |
| `contact` | **1227 ms** | ❌ timed out at the 1200 ms bound |
| `rejection` | ≥1200 ms | ❌ timed out |
| `contact` (re-run at the new bound) | **1366 ms** | confirmed |

**All five emails were delivered.** The two "failures" are the bound firing on messages the broker had already accepted — *the system reported failure for mail that arrived*, which is the mirror image of the defect class this spec exists to prevent.

⚠️ **A hypothesis worth recording, not a conclusion.** `contact` is the largest payload (5031 chars of HTML against ~3000 for the others) and it is the slowest on all three of its runs — the two timeouts and the 1366 ms re-run. Six samples cannot establish a size/latency correlation, but the pattern is consistent enough that T-9 should measure per-kind rather than assume one figure covers all five.

**The old bound sat inside the distribution**, which is the one place a bound must never sit: it protected nothing and failed roughly half the time. `3000` is ~2.4× the observed maximum.

⚠️ **Every one of these five is a COLD measurement.** Each script run is a fresh process, so each pays the full TCP + TLS + AMQP handshake, `checkQueue`, publish and confirm. The tight 1132–1227 clustering is the signature of a **fixed establishment cost**, not network variance. Nothing here measures the **warm** path — the cached connection a Lambda reuses across invocations, which pays only the confirm round-trip.

**Still unmeasured, and T-9's remaining job:** the cold cost *from Lambda in `eu-west-1`*, which may differ substantially in either direction from a laptop over public internet; the warm path; and the accepted branch's pre-send p99 (`PRESEND_ALLOWANCE` remains a reasoned `800`).

**Consequence to weigh, not hide:** every verification-code request now costs ≥3.8 s. That is the honest price of a constant-time window whose slowest term is a cold handshake to a third party. **The structural remedy — establishing the connection during Lambda init rather than inside the first request — is recorded as OQ-11 rather than smuggled in here**, because it changes the failure behaviour of every route, not just this one.

---

## Open questions raised by this revision

| ID | Question |
|---|---|
| **OQ-7** | `ContactForm.tsx` renders *"your message has been sent"* and `MailService.dispatch` logs `status=sent`. Both assert **delivery**, which FR-5 forbids. Raised by one round-1 judge only, so recorded as unconfirmed rather than fixed. Options: soften both to "received", or amend FR-5's clause. **Needs a product decision.** *(Renumbered from OQ-5 in revision 3 — it collided with `infra/README.md`'s pre-existing `OQ-5`, the very subsection §11 instructs an implementer to preserve.)* |
| **OQ-11** | ⏸️ **DEFERRED to post-T-9 by the product owner (2026-09-16).** ⚠️ **The floor is now 3.8 s per verification request, and its dominant term is a cold AMQP handshake paid inside the request.** Establishing the connection during **Lambda init** instead would move that cost out of the request path for every invocation after the first, letting `SEND_TIMEOUT` and the floor drop back toward the warm-path cost. It was rejected during design because a broker outage at init would fail the whole function and break every route — but a **non-fatal** init attempt (connect if possible, fall back to lazy) keeps that property. **Deferred, with the reason:** every measurement so far is from a laptop over public internet; the Lambda runs in `eu-west-1` and its latency to this broker is unknown in either direction. Deciding now would mean choosing an architecture from the wrong network. **T-9 produces those numbers, and this decision is taken with them.** Product-owner note: 3.8 s on a "send me a code" button is slow but the applicant pays it once, which is what makes deferring affordable. |
| **OQ-8** | Does the platform team impose a broker `connection_max` we could exhaust across cold starts? And what **durability** is the queue declared with — `checkQueue` cannot verify it (DD-3), so it is an assumption about someone else's topology until they confirm it |
| **OQ-10** | ✅ **DECIDED — accept as-is** (product owner, 2026-09-16). After Phase B, Cognito's branded invitation and password-reset templates render through `COGNITO_DEFAULT` permanently and may look degraded. Accepted for now; restyling for the default mailer is deferred, not refused. **T-16 must record this as an accepted state in `infra/README.md`, not leave it reading as a temporary rollback condition.** |
| **OQ-9** | FR-6's sweep was unsatisfiable as written: two **active** specs (`epic/hybrid-actor-registration`, `admin/registration-info-requests`) assert SES as a live dependency. Revision 3 scopes the sweep to code, infra and baselines, and adds a one-line superseded-by pointer to each. Confirm that pointer is the right treatment rather than editing those specs outright |
