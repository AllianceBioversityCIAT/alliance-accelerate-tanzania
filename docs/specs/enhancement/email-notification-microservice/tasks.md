# Tasks — Email via the OneCGIAR Notification Microservice

- Spec path: `docs/specs/enhancement/email-notification-microservice/`
- Branch: **`email-ms`**
- Traces: `requirements.md` FR-1…FR-8, NFR-1…NFR-5, NFR-7 · `design.md` §1–§12
- **17 tasks:** Phase A `T-1…T-8` (additive, nothing deleted) · **gate `T-9`** (deployed verification) · Phase B `T-10…T-17` (removal, gated on T-9 PASS)

> **The phase split is the spec's main safety property.** Phase A leaves SES selectable and working; `MailTransport` is a real CloudFormation parameter until T-9 passes. **No Phase-B task may start before T-9 is `[x]`** — that ordering is what prevents deleting the only working mail path before the replacement is proven (`design.md` §7.3).

---

## Phase A — add

- [x] **T-1** Create the canonical timing constants and their invariant tests  (deps: none)
      Scope: New `src/mail/mail-timing.ts` exporting `MAIL_SEND_TIMEOUT_MS`, `MAIL_LOCK_WAIT_TIMEOUT_MS`, `MAIL_PROBE_TIMEOUT_MS`, `VERIFICATION_CODE_PRESEND_ALLOWANCE_MS`, with values taken **verbatim from `design.md` §12.1 — no other value may be introduced**. `registrations/` already imports from `mail/` (`MailService`), so this adds no new dependency direction across the port.
      Traces: NFR-7, NFR-1 · `design.md` §12, DD-10
      Files: `backend/src/mail/mail-timing.ts`, `backend/src/mail/mail-timing.spec.ts`
      Verify: `cd backend && npm test -- mail-timing --silent`
      Done when: both §12.3 invariants are asserted (`PRESEND + SEND ≤ FLOOR`; `LOCK_WAIT + PROBE < SEND`), **and each has been shown to redden** by raising a term past its container and reverting.
      Gate discriminates: mutate `MAIL_SEND_TIMEOUT_MS` to exceed the floor → test fails. Demonstrate before reporting.
      Skills: `nestjs-expert`

- [x] **T-2** Build the envelope as a pure, separately-testable function  (deps: T-1)
      Scope: Exported pure builder mapping `MailMessage` → the microservice envelope. No AMQP, no I/O.
      Traces: FR-2, FR-4, DD-8 · `design.md` §4.2
      Files: `backend/src/mail/microservice-mail.transport.ts` (builder only), `…spec.ts`
      Verify: `cd backend && npm test -- microservice-mail --silent`
      Done when: asserts the exact JSON — `pattern: "send"`, `data.apiKey`, `data.data.{from,emailBody}`; `html` → `socketFile`; `text` → `text`; `to` always a **trimmed array**; `from.email`/`from.name` as **separate fields, never a `"Name" <addr>` composite** (FR-4's `BUT`); **no `id` key** (FR-2's `BUT`); HTML never placed in `text` (FR-2's `BUT`); both parts present when HTML exists (FR-2's `AND IT MUST`).
      Gate discriminates: rename `socketFile` → `file` and confirm the suite reddens.
      Skills: `nestjs-expert`, `api-design-principles`

- [x] **T-3** Extend mail configuration — add `microservice`, **retain `ses`**  (deps: T-1)
      Scope: `MailTransportKind` gains `'microservice'`; add `getMicroserviceMailConfig`. `'ses'` stays valid — it is Phase A's rollback control.
      Traces: FR-3 · `design.md` §4.5, §7.3
      Files: `backend/src/mail/mail.config.ts`, `mail.config.spec.ts`
      ⚠️ **`mail-transport.factory.ts` moved to T-4 (Leader, in flight).** The factory branch must construct `MicroserviceMailTransport`, a class T-4 creates — T-3 cannot add a branch to a type that does not exist yet. T-3 delivers the config surface only.
      Verify: `cd backend && npm test -- mail.config --silent`
      Done when: throws naming each of the **four** required transport variables (`RABBITMQ_URL`, `EMAIL_QUEUE_NAME`, `MICROSERVICE_API_KEY`, `EMAIL_SENDER`); `EMAIL_SENDER_NAME` **defaults** and never throws; resolution stays **lazy** (importing with nothing set must not throw — FR-3's `BUT`); the thrown message never contains the key or URL (FR-3's `AND IT MUST`); `'ses'`, `'microservice'`, `'no-op'` all accepted in this phase.
      Skills: `nestjs-expert`

- [ ] **T-4** Implement the connection lifecycle  (deps: T-2, T-3)
      Scope: The `MicroserviceMailTransport` class **and its `mail-transport.factory.ts` branch** (moved here from T-3 — see that task).
      ⚠️ **Call-site constraint inherited from T-2's review (A-6).** T-3's `MicroserviceMailConfig` is a structural superset of the builder's config parameter, so passing it straight through type-checks — and hands the **credential-bearing `url`** into the builder. Harmless as the builder is written today (explicit literal, no spread), but a future `...config` would publish the broker URL **into the message body** (FR-7/NFR-3). **Destructure at the call site; never spread.** Module-scope cache; `'error'`/`'close'` listeners setting an owned `healthy` flag; mutex (wide scope, released in `finally`, race constructed **inside** the critical section); `checkQueue` probe under `MAIL_PROBE_TIMEOUT_MS`; confirm channel; publish once with `mandatory` + `'return'` listener; `consumerCount == 0` warn.
      Traces: FR-1, NFR-1, NFR-2 · `design.md` §4.3, DD-3, DD-4, DD-11
      Files: `backend/src/mail/microservice-mail.transport.ts`, `…spec.ts`, `mail-transport.factory.ts`
      Verify: `cd backend && npm test -- microservice-mail --silent`
      Done when: reuses a healthy pair; **a hanging probe is cut at `MAIL_PROBE_TIMEOUT_MS` and enough budget remains to reconnect and publish**; a probe returning `NOT_FOUND` throws a **configuration error without reconnecting**; the connection is retried **at most once**, and **never after a publish** (FR-1's `AND IT MUST` — exactly once per send call); the mutex is released on every path **including the deadline**; teardown is detached; **the queue is never declared or created** (FR-1's `BUT`).
      **AND — inherited from T-3's review, a Done-when bullet, not a suggestion:** `mail-transport.factory.ts` must become an **exhaustive `switch (kind)` whose `default` throws**, NOT a third ternary arm. The current `kind === 'ses' ? Ses : NoOp` makes the no-op transport the **silent fallback for every unhandled kind** — it is what created the accepted-but-inert window T-3 opened, and appending an arm would regenerate it at Phase B when the union narrows again. This is the spec's own worst-named failure class (**D-J**: *"every request `202`, zero emails, no signal anywhere"*). A guard that is hoped for is not a guard.
      Gate discriminates: (a) remove the probe timeout → the hang test fails; (b) remove the `finally` → the release test fails; (c) make step 5 retry → the exactly-once test fails; (d) **add a bogus kind to the union without a switch arm → the default throws and a test proves it**. Demonstrate all four.
      Skills: `nestjs-expert`, `aws-serverless`, `error-handling-patterns`

- [ ] **T-5** Close all three credential-leak paths, and gate them  (deps: T-4)
      Scope: Sanitize every escaping error; never let an `amqplib` error or the broker URL reach a logger, an envelope, or a thrown message.
      Traces: NFR-3, D-D · `design.md` §4.4, DD-5
      Files: `backend/src/mail/microservice-mail.transport.ts`, `…spec.ts`, **`backend/src/mail/mail.config.spec.ts`**
      ⚠️ **Inherited from T-3's review (advisories A1/A3) — a transfer, not a note.** T-3's no-leak tests are **near-vacuous**: both assert the absence of a value that was *just deleted from the environment*, so an implementation appending `JSON.stringify(process.env)` to the error would **pass them while leaking the live broker URL**. That clause currently passes on the Reviewer's *reading*, not on its test. The discriminating fix is one line — T-3's second block already has `RABBITMQ_URL` **set** while a different variable is missing, so assert `amqps://` absent *there*, against a secret that is actually present. Also enumerate `mail.config.ts`'s `Invalid MAIL_TRANSPORT "${value}"` — the module's one value-interpolating throw (A3), harmless today but an escape path.
      Verify: `cd backend && npm test -- microservice-mail mail.config --silent`
      Done when: a URL-bearing error injected on **each** of the three paths — sync rejection, an async `'error'`/`'close'` event, and the promise orphaned by the deadline race — escapes with no credential substring in `name`, `message`, or any `Logger` call. **QA-13 is NOT the gate and is not extended** (it provider-overrides `MailService`); this spec is.
      Gate discriminates: run against a non-sanitizing variant (rethrow the raw error) and confirm every assertion reddens. **Required evidence, not optional.**
      Skills: `error-handling-patterns`, `nestjs-expert`

- [x] **T-6** Bound the SES transport with the same deadline  (deps: T-1)
      Scope: Give `SESClient` a `requestTimeout` of `MAIL_SEND_TIMEOUT_MS` and cap retries. Today it is constructed with neither — the SES path is **unbounded**, which is a pre-existing hole and the reason Phase A's higher floor would otherwise be unearned.
      Traces: NFR-7 · `design.md` DD-10 ("Both transports are bounded")
      Files: `backend/src/mail/ses-mail.transport.ts`, `ses-mail.transport.spec.ts`
      Verify: `cd backend && npm test -- ses-mail --silent`
      Done when: the client is constructed with an explicit request timeout and bounded retries; a non-responding stub aborts at the deadline.
      Note: this file is deleted in T-10. The work is still required — Phase A may run for days, and the floor must be valid the whole time.
      Skills: `aws-serverless`

- [x] **T-7** Bound the pre-send window and re-derive the floor  (deps: T-1)
      Scope: Bound the **whole pre-send region** — `requestVerificationCode` applies `VERIFICATION_CODE_PRESEND_ALLOWANCE_MS` as a deadline over its `issueCode(...)` call **as a unit**; `VERIFICATION_CODE_RESPONSE_FLOOR_MS` re-derived per §12.1; a warn line on a **negative** pad remainder carrying the overrun in ms and **no address**.
      ⚠️ **Corrected during T-1 review (advisory A3, see `execution.md`).** This task previously said *"an explicit Prisma transaction timeout on `issueCode`"*. **That mechanism is insufficient**: `issueCode`'s `$transaction` wraps only the `EmailSendBudget` upsert — `generateCode`, `hashCode` and `emailVerification.create` run *outside* it. A transaction timeout would bound one of three terms, and the unbounded ones include `emailVerification.create`, which **only the accepted branch pays** — i.e. exactly the divergence the floor exists to erase. Bound the call as a unit instead; it then survives anyone later moving work into or out of that transaction.
      Traces: NFR-7 · `design.md` DD-10, §12
      Files: `backend/src/registrations/email-verification.service.ts`, `registrations.service.ts`, `registrations.service.spec.ts`, `registrations-verify.e2e.spec.ts`, **`backend/src/mail/mail-timing.spec.ts`**
      ⚠️ **Inherited from T-1 (advisories A1/A2) — this is a transfer, not a note.** `mail-timing.spec.ts` contains a test asserting the **negation** of §12.3 invariant 1 against the live floor (`900 < 2000`). Raising the live constant to `2000` makes it `2000 < 2000`, i.e. **red**. You MUST **delete that test and its `describe`-block comment**, and you MUST NOT repair it by weakening `<` to `≤` — that would make it pass forever while asserting nothing, which is the vacuous-gate shape NFR-7 condemns. Invariant 1 against the **live** constant belongs in `registrations.service.spec.ts`, which `design.md` §10 already nominates. (Its inline marker also reads `// T-7 will make this pass` where the surrounding lines correctly say *fail* — it goes with the deletion.)
      Verify: `cd backend && npm test -- registrations --silent`
      Done when: all three terms are enforced at runtime — **verify this by reading `issueCode` and confirming no statement inside it escapes the bound**, not by asserting the option was passed; a pre-send region breaching the allowance **fails the request** (reaching the existing third, deliberately-unpadded exit — address-independent infrastructure failure, unchanged by this spec); the warn line fires on overrun and carries no address; `registrations-verify.e2e.spec.ts`'s imported constant, its assertions, **and its "900 ms" cost comment** are all updated.
      Gate discriminates: force `issueCode` past the allowance → the request fails and the warn line appears; revert.
      ⚠️ Cannot prove: that the allowance is large enough in production. That is T-9's measurement. This task proves the bound is **enforced**, not that it is **right**.
      Skills: `nestjs-expert`, `systematic-debugging`

- [ ] **T-8** Phase-A infrastructure and operator configuration  (deps: T-3)
      Scope: `MailTransport` CloudFormation parameter (`AllowedValues: [ses, microservice]`, `Default: ses`); `MailMicroserviceSecret` in `20-backend` mirroring `OtpHmacSecret`'s named-secret shape, with a two-key JSON placeholder; the five env vars; **`MailTransport` passed through by `deploy.sh` and `set-cors.sh`**; `backend/.env.example` documented (FR-8).
      Traces: FR-7, FR-8 · `design.md` §7.1, §7.2, §7.3
      Files: `infra/20-backend/template.yaml`, `infra/scripts/deploy.sh`, `infra/scripts/set-cors.sh`, `backend/.env.example`
      Verify: `./infra/scripts/validate.sh` (SAM validate, `--profile IBD-DEV`)
      Done when: all three stacks validate; both secrets appear **only** as `{{resolve:secretsmanager:…}}` references (FR-7's `BUT`); no secret literal reaches a `sam deploy` command line (FR-7's `AND IT MUST`); `.env.example` names every variable with its source and **contains no real value**; `MAIL_TRANSPORT=no-op` remains the local default.
      ⚠️ Runbook, not code: the secret must hold real values **before** the stack that resolves them deploys, and `put-secret-value` must use `--secret-string file://` from a `600`-mode temp file, shredded after.
      Skills: `aws-serverless`

---

## T-9 — the verification gate

- [ ] **T-9** Observe real delivery on the deployed dev stack  (deps: T-1…T-8)
      Scope: Switch dev to `MailTransport=microservice` via `deploy.sh`, then observe actual email.
      Traces: FR-1, D-F, D-G, D-I, D-J′, NFR-5, NFR-7 · `design.md` §10 (final row)
      Verify: manual, on the deployed dev environment — there is no command that substitutes.
      Done when **all** of:
      1. One real email **delivered** for each of the five kinds, to an address **never verified with AWS** — the single criterion no unit test can replace.
      2. HTML visually correct per kind after the microservice's `juice` pass (**D-G** — no automated gate exists).
      3. A **cold → idle → warm** sequence: the first send after an induced idle period succeeds (**D-F**).
      4. The **receipt** — the one fire-and-forget kind — observed as delivered **after** its `202` (**D-I**).
      5. Cold and warm publish latency, and the accepted branch's pre-send p99, **measured** and compared to §12.1. Any value contradicted is re-derived **in §12 only**.
      6. No overrun warn line (T-7) under normal load.
      7. Artifact size measured after `sam build`, under 250 MB (NFR-5).
      ✅ **UNBLOCKED** — DEP-5 answered **DEV** (product owner, 2026-09-16). Non-PROD credentials also mean the microservice prepends `TEST - ` to every subject, which is itself a confirmation signal that the right key is in use.
      ⛔ **Phase B may not start until this task is `[x]`.**

---

## Phase B — remove (every task depends on T-9)

- [ ] **T-10** Retire the SES transport  (deps: T-9)
      Scope: Narrow `MailTransportKind` to `'microservice' | 'no-op'`; delete `ses-mail.transport.ts` + spec; rewrite `mail.service.spec.ts`; drop `@aws-sdk/client-ses`; flip the parameter default **and pass it explicitly on deploy**.
      Traces: FR-3 (Phase-B clause), FR-6 · `design.md` §7.3
      Files: `backend/src/mail/{mail.config.ts,mail.config.spec.ts,mail-transport.factory.ts,ses-mail.transport.ts,ses-mail.transport.spec.ts,mail.service.spec.ts}`, `backend/package.json`
      Verify: `cd backend && npm test --silent && npm run build`
      Done when: `'ses'` is rejected; `mail.service.spec.ts` no longer imports `SendEmailCommand`/`resetSesClient`/`aws-sdk-client-mock`; the build is green.
      ⚠️ A stack can retain `MailTransport=ses` through `UsePreviousValue` — the deploy **must** pass the parameter explicitly or every send throws with no deploy-time signal.

- [ ] **T-11** Remove `replyTo` end-to-end  (deps: T-9)
      Scope: Drop the field from `MailMessage`; stop composing it; delete `reply-to.util.ts` + spec.
      Traces: FR-5 · `design.md` DD-7
      Files: `backend/src/mail/mail-transport.interface.ts`, `mail/templates/contact.template.ts` + spec, `contact/reply-to.util.ts` + spec, `contact/contact.service.spec.ts`
      Verify: `cd backend && npm test -- contact --silent && npm run build`
      Done when: **five** assertions removed (4 in `contact.template.spec.ts`, 1 in `contact.service.spec.ts`); the `MailMessage` literal in `mail.service.spec.ts` no longer sets it (a **TS excess-property error** otherwise); `contact.template.spec.ts`'s existing *"renders the requester address as body data"* assertion is cited as the surviving guarantee; **and `contact.service.spec.ts` gains a replacement** asserting the DTO's `email` reaches the rendered body — that deleted assertion is the only one in that suite pinning the DTO→template wiring.

- [ ] **T-12** Re-state the contact endpoint's failure semantics  (deps: T-9)
      Scope: `502` means **could not enqueue**, not could not deliver.
      Traces: FR-5 · `design.md` §3
      Files: `backend/src/contact/contact.service.ts`, `contact.e2e.spec.ts`
      Verify: `cd backend && npm test -- contact --silent`
      Done when: `202` on confirm, `502` on publish failure, envelope byte-identical; no response, log line, or comment claims delivery (FR-5's `BUT`); no recipient address, requester field, broker URL or key in the envelope or logs (FR-5's `AND IT MUST`).
      Note: `ContactForm.tsx`'s *"has been sent"* copy is **OQ-7** and is out of scope until decided.

- [ ] **T-13** Tear down the SES infrastructure  (deps: T-9)
      Scope: `10-data-auth` params/conditions/`SesSenderIdentity`/the `EmailConfiguration` `!If` → unconditional `COGNITO_DEFAULT`; delete `ses-cognito-send-policy.json` and `t9-enable-ses.sh` (128 lines); **remove `ses:SendEmail` from the Lambda execution role**; remove three statements / six actions from the developer policy.
      Traces: FR-6 · `design.md` §7.1
      Files: `infra/10-data-auth/{template.yaml,ses-cognito-send-policy.json,t9-enable-ses.sh}`, `infra/20-backend/template.yaml`, `infra/policies/developer-local-test-policy.json`
      Verify: `./infra/scripts/validate.sh`
      Done when: **seven** grants gone (six developer + one Lambda); all three stacks validate.

- [ ] **T-14** Sweep the withdrawn premise across code and tests  (deps: T-9)
      Scope: The **seven-plus** sites where a rationale rests on SES. Behavior changes nowhere; only the justification.
      Traces: FR-6's `BUT it must NOT` · `design.md` §11
      Files: `backend/src/registrations/{registrations.service.ts,registrations.service.spec.ts,admin-registrations.service.ts,admin-registrations-reject.spec.ts,admin-registrations.service.spec.ts,registrations-verify.e2e.spec.ts}`
      ⚠️ **Inherited from T-7's review (advisories A1/A2/A3) — doc-accuracy fixes in files you already own.** (1) `registrations.service.ts`: delete or re-target *"(see the O(1) reasoning below)"* — a dangling pointer to a string that appears nowhere else. (2) `registrations.service.spec.ts`: it names `mail/mail-timing.ts` as the floor constant's home, but **that file explicitly says it does not define it**; and its invariant test's name both restates `800 + 1200 ≤ 2000` (contra §12) and **overclaims** — a hardcoded `2000` keeps it green, so it gates invariant 1, not composition-in-code. Trim the name to what the assertion proves. (3) Same file: *"every test in this block … now runs through that pad"* is **false** — two tests reach the deliberately unpadded third exit, one of which T-7 itself added., `backend/src/contact/{contact.service.ts,contact.e2e.spec.ts,contact-no-writes.e2e.spec.ts,admin-recipient.resolver.ts}`, `backend/src/mail/{mail.module.ts,no-op-mail.transport.ts}`, `backend/src/test/pii-boundary.spec.ts`, `backend/src/lambda.ts`, `backend/CLAUDE.md`
      Verify: `cd backend && npm test --silent` then `grep -rniE '\bSES\b|MessageRejected|sandbox|SendEmailCommand' backend/src | grep -v archive`
      Done when: the sweep is empty; **`contact.e2e.spec.ts`'s third leak gate** is rebuilt on a transport-agnostic fixture; `lambda.ts`'s claim that approval/rejection are fire-and-forget is corrected (**they are awaited**; only the receipt is not); the `MessageRejected` rationale in `contact.service.ts` / `admin-registrations.service.ts` / `registrations.service.ts` is restated on grounds that survive — **those comments are why the two most sensitive log lines are written as they are, and T-5's sanitization depends on them**.

- [ ] **T-15** Amend the TRD and author the ADR  (deps: T-9)
      Scope: C4 §12.1 and §12.2; **ADR-015**; QA-13's SES-specific wording.
      Traces: FR-6's `AND IT MUST` · `design.md` §11
      Files: `docs/trd/trd.md`
      Verify: manual review + `grep -n 'SES' docs/trd/trd.md`
      Done when: §12.1's box no longer says SES *"sends invites / resets"* — **already false before this change**, since Cognito email is suppressed and `EnableSesSending` defaults `"false"`; the ADR records the weakened delivery guarantee, no retry/DLQ (**D-H**), the Slack subject disclosure, the plaintext-env secret exposure, and DD-10's re-derived floor.
      ⚠️ **Allocate the ADR number at apply time on the default branch, re-running the survey** (root `CLAUDE.md` § Concurrency protocol, KZ-010). `email-ms` tops out at **ADR-013**; `feat/legal-notices` holds ADR-014 unmerged. Do **not** hard-code 015 from here.

- [ ] **T-16** Amend the infrastructure documents  (deps: T-9)
      Scope: `infrastructure.md` §2; `infra/README.md` §6 and §2; `policies/README.md`.
      Traces: FR-6 · `design.md` §11
      Files: `docs/infrastructure.md`, `infra/README.md`, `infra/policies/README.md`
      Verify: manual review against the **running** product, not against this spec
      Done when: **§6 is deleted by content, never by line range** — ⚠️ two non-SES survivors sit inside the block and must be **relocated**: the `Known limitation — CONFIRMED-user reset code has no in-app entry page (OQ-5)` subsection, and the **`PortalUrl` parameter row**, whose only live documentation is there while the parameter itself survives. *(The previous correction rescued the first by name and then specified a range that swallowed the second — deleting by range is what keeps reintroducing this.)* §2's *"the one thing that genuinely requires AWS is real email delivery"* is withdrawn. `policies/README.md` loses **three** rows, not two, and its framing is rewritten.

- [ ] **T-17** Close the spec-level premise and sync the agent guides  (deps: T-10…T-16)
      Scope: Superseded-by pointers; guide mirroring; the final sweep.
      Traces: FR-6, OQ-9 · `design.md` §11
      Files: `docs/specs/epic/hybrid-actor-registration/proposal.md`, `docs/specs/admin/registration-info-requests/proposal.md`, `backend/CLAUDE.md`, `backend/AGENTS.md`
      Verify: `cd backend && npm test --silent && npm run build && npx eslint "{src,test}/**/*.ts" --quiet` then `./infra/scripts/validate.sh`
      Done when: both **active** specs carry a one-line superseded-by pointer (they assert SES as a live dependency, which made FR-6's original sweep unsatisfiable — they are **not** rewritten); `backend/CLAUDE.md`'s no-email credential-handoff rationale no longer rests on *"SES sandbox limits"* while the **behavior is unchanged**; `AGENTS.md` mirrors; every gate green.

---

## Dependency graph

```
T-1 ─┬─ T-2 ─┐
     ├─ T-3 ─┼─ T-4 ── T-5 ─┐
     ├─ T-6 ─┤             │
     └─ T-7 ─┤             │
             └─ T-8 ───────┴─ T-9 (GATE) ─┬─ T-10 ─┐
                                          ├─ T-11 ─┤
                                          ├─ T-12 ─┤
                                          ├─ T-13 ─┼─ T-17
                                          ├─ T-14 ─┤
                                          ├─ T-15 ─┤
                                          └─ T-16 ─┘
```

T-10…T-16 are mutually independent and may run in parallel once T-9 is `[x]`.

---

## Coverage closure — clause level, not ID level (KZ-001)

| Requirement | Clause | Owner |
|---|---|---|
| FR-1 | default exchange, routing key, persistent | T-4 · T-9 |
| FR-1 | `BUT` never declare/create the queue | T-4 |
| FR-1 | `AND IT MUST` publish exactly once, no internal retry | T-4 |
| FR-2 | envelope shape, `socketFile`, array `to` | T-2 |
| FR-2 | `BUT` no `id` · `BUT` no HTML in `text`/`file` | T-2 |
| FR-2 | `AND IT MUST` both parts when HTML exists | T-2 |
| FR-3 | four required throw · `EMAIL_SENDER_NAME` defaults | T-3 |
| FR-3 | `BUT` lazy resolution | T-3 |
| FR-3 | `BUT` reject `ses` — **Phase B only** | T-10 |
| FR-3 | `AND IT MUST` no secret in the thrown message | T-3 |
| FR-4 | sender address + display name | T-2 |
| FR-4 | `BUT` never a `"Name" <addr>` composite | T-2 |
| FR-5 | `502` = enqueue failure; `202` semantics | T-12 |
| FR-5 | `BUT` never claim delivery | T-12 (copy → **OQ-7**) |
| FR-5 | `AND IT MUST` no PII/secret in envelope or logs | T-5 · T-12 |
| FR-6 | sweep scoped to code/infra/baselines | T-14 · T-17 |
| FR-6 | seven `ses:*` grants, incl. the Lambda role | T-13 |
| FR-6 | `t9-enable-ses.sh` deleted | T-13 |
| FR-6 | `BUT` withdrawn premise — 7+ sites | T-14 · T-16 · T-17 |
| FR-6 | `AND IT MUST` correct TRD §12.1 | T-15 |
| FR-7 | dynamic references only | T-8 |
| FR-7 | `BUT` no literal anywhere · `AND IT MUST` not on a deploy command line | T-8 |
| FR-8 | `.env.example` with sources | T-8 |
| FR-8 | `BUT` no real values | T-8 |
| NFR-1 | one bounded deadline, detached teardown | T-4 |
| NFR-2 | probe-based liveness, one reconnect | T-4 |
| NFR-3 | three leak paths, non-sanitizing control | T-5 |
| NFR-4 | committed writes survive a mail failure | T-12 (existing tests) |
| NFR-5 | artifact under 250 MB | T-9 |
| NFR-7 | all three terms enforced; both §12.3 invariants | T-1 · T-6 · T-7 |

**Deliberately unowned, and why:** **D-H** (accepted at SMTP then dropped) is structurally unmeasurable from this system — recorded in ADR-015 by T-15, never gated. **D-G**, **D-F**, **D-I**, **D-J′** have no automated gate and are owned by **T-9** as human/deployed checks. **OQ-7** (frontend copy) and **OQ-10** (Cognito template degradation) await product decisions and are owned by no task.
