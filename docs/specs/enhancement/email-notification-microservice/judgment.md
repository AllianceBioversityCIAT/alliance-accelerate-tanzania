# Judgment Day — Design Review (Round 1)

- Spec path: `docs/specs/enhancement/email-notification-microservice/`
- Target: `design.md` (draft) against `requirements.md` + `proposal.md`
- Mode: blind dual review, two read-only judges, identical scope and criteria
- Author ≠ auditor: the design was authored by the orchestrating session; both judges ran as independent read-only agents
- Date: 2026-09-15
- **Terminal state: `escalated`** — awaiting user authorization for round-one correction

---

## Verdict summary

| | Count |
|---|---|
| Confirmed by **both** judges | **15** |
| Suspect (one judge only) | 9 |
| Contradictions between judges | **0** |

Judge A returned SEVERE 8 / WARNING 6 / SUGGESTION 4. Judge B returned SEVERE 9 / WARNING 8 / SUGGESTION 3. The overlap is unusually high, and no finding was disputed by the other judge.

**Assessment: the design does not survive review.** Ten confirmed findings are severity-SEVERE in at least one judgment, and five of them are *false factual claims about files already read in this session* — the KZ-008 failure mode ("reading about an artefact feels like reading it"), committed by the design's author. This is not a document needing patches; §3, §4.3, §4.4, §7.1, §7.3 and the Budget all rest on premises that are untrue.

---

## Confirmed findings (both judges, independently)

### C-1 · `POST /registrations/verify` **is** awaited, behind a 900 ms constant-time floor
*A-F2 (SEVERE) · B-F1 (SEVERE) — criterion G*

`design.md` §3 asserts the endpoint "never awaited the send in the first place". `RegistrationsService.requestVerificationCode` contains `await this.mailService.sendVerificationCode(...)`, and its class docblock records *"Superseded by `fix/otp-mail-lambda-freeze` (2026-09-03) — the send is now AWAITED"*. `VERIFICATION_CODE_RESPONSE_FLOOR_MS = 900` was sized against a warm SES round trip "well under 500 ms".

**Consequence:** four of five dispatch sites are on the awaited request path. NFR-1's 5 s bound (10 s with DD-4's retry) exceeds the 900 ms floor by an order of magnitude, re-opening the address-enumeration oracle that incident paid to close. The design's stated reason for the property being unaffected is the opposite of what the code does.

### C-2 · QA-13 cannot host the leaking variant the design assigns to it
*A-F3 (SEVERE) · B-F4 (SEVERE) — criterion C*

`design.md` §4.4 claims QA-13 is "preserved unchanged in shape… run against a transport whose deliberately-leaking variant is *throw the raw amqplib error*". `pii-boundary.spec.ts`'s contact block does `.overrideProvider(MailService)`, so **no transport executes inside that gate** — a fact stated verbatim in `docs/trd/trd.md` §13 and in the spec's own docblock.

**Consequence:** NFR-3 and defect class D-D are assigned to a gate that structurally cannot observe the object under test. The leak requirement ships unguarded while the spec records it as gated. `pii-boundary.spec.ts` is absent from §4.1's file list.

### C-3 · DD-4's retry contradicts FR-1's "exactly once" clause
*A-F4 (SEVERE) · B-F6 (SEVERE) — criterion F*

FR-1: *"**AND IT MUST** publish exactly once per send call, never retrying internally on its own."* DD-4: *"reconnect once, retry once."* A confirm timeout is not evidence the broker lacked the message — it may hold it and have lost only the ack.

**Consequence:** duplicate OTP, receipt, approval or rejection. One document must yield; if DD-4 wins, FR-1 needs an explicit at-least-once statement and an accepted-duplicate risk row.

### C-4 · DD-5 closes only the synchronous leak path
*A-F1 (SEVERE) · B-F3 (SEVERE) — criterion C*

DD-5's mechanism is "catch and re-throw a sanitized error". A `catch` cannot intercept an `'error'`/`'close'` event emitted on the cached connection **between invocations** — precisely the freeze/thaw window DD-4 exists for — nor the orphaned rejection left by a timeout implemented as a race. `backend/src` registers no `unhandledRejection`/`uncaughtException` handler and has no global exception filter.

**Consequence:** `amqps://user:pass@host` reaches CloudWatch verbatim on the design's own dominant risk. No test in §10 changes colour.

### C-5 · The rollback story describes a state this design never produces
*A-F7 (SEVERE) · B-F2 (SEVERE) — criterion E*

§7.3: *"`MAIL_TRANSPORT` is the switch, and reverting is one parameter."* Both halves are false. `MAIL_TRANSPORT: ses` is a hardcoded `Environment.Variables` literal, not a CloudFormation `Parameter` (the only parameters are `AllowedOrigin`, `DataAuthStackName`). And §4.1 deletes the SES adapter while FR-3 forbids `'ses'` as a valid kind — **in the same change** meant to keep SES selectable.

**Consequence:** the one control the Full-depth rollback treatment rests on does not exist. `tasks.md` cannot sequence add → verify → remove from this document.

### C-6 · SES residue the design never names
*A-F6 (SEVERE) + A-F13 · B-F8 (SEVERE) + B-F11 — criteria F, E, G*

Verified directly by the orchestrator after both judgments:

| Artefact | Fact |
|---|---|
| `infra/20-backend/template.yaml` | Grants `ses:SendEmail` on `identity/*` to the **Lambda execution role**. §7.1's `20-backend` row changes environment variables only |
| `infra/10-data-auth/t9-enable-ses.sh` | **128 lines**, deploys with `SenderEmail=`/`EnableSesSending=` and `sed`s `ses-cognito-send-policy.json`. Named in no file list; after §7.1's deletions it becomes a committed script that cannot run |
| `infra/20-backend/template.yaml` | `CONTACT_FALLBACK_RECIPIENT` comment asserts "the account is still in the SES sandbox… must be a verified identity" — a live withdrawn premise |
| `contact.service.ts`, `registrations.service.ts` | Both justify `err.name`-only logging on the AWS SDK's `MessageRejected` behaviour — the rationale DD-5 now depends on, resting on a removed SDK |
| Counts | §7.1 says "all five `ses:*` statements"; the developer policy holds **six actions in three statements**, plus the seventh Lambda grant. §6 credits the removal to runtime posture, but five of six belong to a developer's IAM user |

### C-7 · `assertQueue` + no `mandatory` creates a silent total-loss mode
*A-F10 (WARNING) · B-F5 (SEVERE) — criterion B*

DD-3's confirm channel attests **persistence, not routing**. §4.3 step 2 *asserts* the queue, so a mistyped `EMAIL_QUEUE_NAME` **creates** a new, correctly-declared, unconsumed queue and confirms every publish forever. FR-1's `PRECONDITION_FAILED` clause covers only argument mismatch on an existing queue, not a name typo.

**Consequence:** the most likely first-run configuration error — compounded by the unresolved DEV/PROD queue ambiguity (DEP-5/OQ-3) — yields a fully green system: every publish confirmed, every request `202`, zero emails, no signal anywhere. This is strictly larger than D-H and is introduced by the design's own choice. `checkQueue`, or `mandatory` + a `basic.return` listener, is required for `202` to mean what §3 says.

Also noted by both: DD-3's "on disk" is stronger than RabbitMQ's documented guarantee (responsibility taken; persistent writes are batched).

### C-8 · Documentation requirements have no owning design section
*A-F15 (WARNING) · B-F7 (SEVERE) — criterion F*

Unaddressed anywhere in `design.md`: FR-6's *"**AND IT MUST** correct `docs/trd/trd.md` §12.1"*; FR-6's *"**BUT it must NOT** silently leave a document asserting a premise this change withdrew"* (`backend/CLAUDE.md`); **FR-8 in its entirety** — `backend/.env.example` is never named as a changed file; and the repeated instruction that the Slack-subject disclosure and D-H "must be stated in the ADR", while the design never says which document receives ADR-015 or that authoring it is in scope. §8's DD-1…DD-9 are this spec's decision records, not the TRD ADR.

**Consequence:** three constitutional baselines are in scope with no design treatment and no task hook — the exact files root `CLAUDE.md` mandates a Reviewer for.

### C-9 · The budget understates deletions ~3–4×
*A-F14 (WARNING) · B-F9 (SEVERE) — criterion H*

Measured by the orchestrator: `ses-mail.transport.ts` 93 + `ses-mail.transport.spec.ts` 160 + `reply-to.util.ts` 180 + `reply-to.util.spec.ts` 176 = **609 lines in four files the design itself lists for deletion**, before `infra/README.md` §6 (lines 219–353, ~135), the `10-data-auth` block, `ses-cognito-send-policy.json`, `t9-enable-ses.sh` (128), and every unlisted test rewrite. Total changed lands near 1,200, not 520.

**Consequence:** the budget is declared a tripwire. A 4× miss produces either a spurious escalation on the first removal task or an Implementer trimming the sweep to stay inside the number. Judge B notes the `contact/contact-channels` judgment recorded this identical failure.

### C-10 · §4.1's file table omits every file needed to keep the build green
*A-F8 (SEVERE) · B-F16 (WARNING) — criteria D, H*

Missing and breaking: `mail.service.spec.ts` (passes `replyTo` in a `MailMessage` literal → TS excess-property error; also imports `SendEmailCommand`, `resetSesClient`, `aws-sdk-client-mock`), `mail.config.spec.ts` (asserts `'ses'` is accepted), `backend/package.json`, `contact.service.ts`, `contact.template.spec.ts`, `contact.service.spec.ts`, `pii-boundary.spec.ts`.

### C-11 · DD-7's replyTo accounting is wrong and its compensating test does not exist
*A-F8 · B-F12 (WARNING) — criterion D*

Assertions are **five**, in two files, not "four elsewhere". DD-7 claims "FR-5's scenario gains the body-row assertion" — `requirements.md` FR-5 contains no such clause and §10's contact row lists only `202`/`502`/envelope.

Judge B establishes the substance is already pinned by `contact.template.spec.ts`'s existing "renders the requester address as body data" assertion — **so the remediation is to cite that, not to invent a clause.** But `contact.service.spec.ts`'s `expect(message.replyTo).toContain(dto.email)` is the only assertion in `ContactService`'s own suite proving the DTO's `email` reaches the rendered message; deleting it un-pins the DTO→template wiring with nothing named to replace it.

### C-12 · Connection-lifecycle mechanics specified against an API that does not exist
*A-F9 (WARNING) · B-F13 (WARNING) — criterion A*

§4.3 step 1 reuses the pair "when both report open" — amqplib's promise API exposes **no public `isOpen`/`open` flag**; liveness is observable only via `'close'`/`'error'` events, which §4.3 never registers (C-4). Step 4 discards the cached pair with no `close()`, leaking a socket and amqplib's heartbeat `setInterval` per failed send for the container's life. No concurrency guard protects the module-scope cache from a `void`-dispatched receipt in flight. No `heartbeat` option is specified.

### C-13 · NFR-1's own wording contradicts the design
*A-F16(b) (SUGGESTION) · B-F13 (WARNING) — criterion F*

NFR-1 bounds *"Connect + publish + **close**"*; §4.3 states *"The connection is never explicitly closed."* The measure describes a lifecycle the design rejects.

### C-14 · NFR-6 cannot fail and measures the wrong thing
*A-F11 (WARNING) · B-F17 (WARNING) — criterion F*

NFR-6's measure is "both are lazily constructed on first send; no module-init work" — a static property of the code, restated as the §9 mitigation. `new SESClient({region})` is local object construction with no I/O; the new transport's first send is TCP + TLS + AMQP handshake + `queue.declare` + a confirm round-trip. KZ-002: a gate that cannot fail is not a gate — and it conceals the number C-1 depends on.

### C-15 · The new secret has no owning stack
*A-F12 (WARNING) · B-F10 (WARNING) — criterion E*

§7.2 calls the secret "the single most likely first-deploy failure" and then leaves its owner undefined — neither §7.1 row declares the resource, and no parameter, export, or literal name is given for `{{resolve:secretsmanager:…}}` to resolve against. The pattern it claims to mirror (`DbSecretArn`) is stack-owned in `10-data-auth` and exported. A CLI-created secret would be drift under `docs/infrastructure.md` §5 rule 2 ("SAM only").

---

## Suspect findings (one judge only — recorded, **not** auto-fixed)

| ID | Judge | Finding |
|---|---|---|
| S-1 | A-F5 (SEVERE) | `ContactForm.tsx` copy ("your message has been sent") and `MailService.dispatch`'s `status=sent` log both **claim delivery**, violating FR-5's *"must NOT claim or imply delivery in any response body, log line, or user-facing copy"* — while §5 declares no frontend change |
| S-2 | A-F16(c) | `infra/README.md` §6 also contains *"Known limitation — CONFIRMED-user reset code has no in-app entry page (OQ-5)"*, which is **not** SES-specific and stays true; a wholesale §6 delete erases a live operational caveat |
| S-3 | B-F14 | D-F is scoped to warm-invocation death only. The repo's **production-observed** failure (`lambda.ts`) is a freeze *during an in-flight unawaited send*; three kinds still dispatch fire-and-forget and depend on `callbackWaitsForEmptyEventLoop`. A permanently-open socket + heartbeat timer changes the event-loop-drain semantics that flag governs. T-9 does not exercise this |
| S-4 | B-F15 | §1's LITE justification ("we declare no routing") contradicts §4.3's `assertQueue` — a topology write against a queue we do not own |
| S-5 | B-F19 | DD-6 omits that dynamic references resolve to **plaintext Lambda environment variables**, readable via `lambda:GetFunctionConfiguration` — §6's "never in the repo or the template" reads stronger than what is delivered |
| S-6 | B-F18 | §7.2's `put-secret-value` runbook step reintroduces the shell-history hazard FR-7 exists to prevent |
| S-7 | B-F20 | Whether `EMAIL_SENDER`/`EMAIL_SENDER_NAME` are required-or-throw is left undecided across both documents — D-B's test author cannot derive expected behaviour for two of six variables |
| S-8 | A-F17 | Shared-broker `connection_max`: each cold start opens a connection the broker holds until its own timeout; not covered by DEP-3/DEP-4, and undiagnosable under DD-5 |
| S-9 | A-F18 | The "≈180 MB" artifact baseline is uncorroborated by any cited `sam build` run |

---

## Explicitly checked and found sound

Both judges independently confirmed: the `MailTransport` port description and the five dispatch sites; `getSesClient()`/`getCognitoAdminClient()` as the singleton precedent; `email-layout.ts` carrying 33 inline `style="` attributes and zero `<style>` blocks (D-G's "low prior" is justified); `buildVerificationCodeMessage`'s subject omitting the code; `ContactService` logging `err.name` and never `err.message`; `EmailConfiguration` being an in-place user-pool update; every `10-data-auth` parameter/condition/resource name in §7.1 matching the template exactly; and `infra/scripts/deploy.sh` passing no SES parameter override.

---

## Round-one correction — proposed scope

Not yet authorized. The correction is **not** a patch pass: C-1, C-5, C-7 and C-8 change the design's shape.

| # | Change |
|---|---|
| 1 | Rewrite §3 on the true dispatch topology; re-derive the 900 ms floor against AMQP latency, or bound the publish under it (C-1, C-14) |
| 2 | Reconcile DD-4 against FR-1 — pick at-most-once or at-least-once and amend the *other* document (C-3) |
| 3 | Extend DD-5 to connection/channel `'error'`+`'close'` listeners and orphaned timeout rejections; add a process-level net (C-4, C-12) |
| 4 | Replace `assertQueue` with `checkQueue` (or add `mandatory` + return listener); add the silent-misroute defect class (C-7, S-4) |
| 5 | Re-specify the rollout so `'ses'` survives until T-9 passes — a two-phase task sequence, not a parameter (C-5) |
| 6 | Complete the file inventory: Lambda IAM grant, `t9-enable-ses.sh`, the two withdrawn-premise comments, all seven test/config files (C-6, C-10) |
| 7 | Add a Documentation section owning TRD §12.1, ADR-015, `backend/CLAUDE.md`, `docs/infrastructure.md`, `infra/README.md`, `backend/.env.example` (C-8) |
| 8 | Fix DD-7's count to five; cite the existing `contact.template.spec.ts` assertion; name a replacement for `contact.service.spec.ts`'s (C-11) |
| 9 | Declare the secret's owning stack and ARN wiring (C-15) |
| 10 | Re-derive the budget from measured line counts (C-9) |

**Ceiling:** this skill permits at most two fix rounds and two scoped re-judgments. This is round 1 of 2.

---

# Round 2 — Scoped Re-Judgment of the Fix Delta

- Target: `design.md` revision 2 + the `requirements.md` / `proposal.md` amendments
- Both judges re-run blind, scoped to two questions: *is each C-finding closed?* and *did the fix introduce new defects?*
- **Terminal state: `escalated`** — one fix round and one re-judgment remain permitted

## Closure verdicts — the judges agree on the totals

**CLOSED 10 · PARTIAL 5 · OPEN 0**, from both judges independently.

| Confirmed **PARTIAL** by both | Why it did not close |
|---|---|
| **C-1** | Topology is now true, but the remedy is wrong — see N-1 |
| **C-5** | The control was created and then routed through scripts that erase it — see N-2 |
| **C-6** | The corrected five rows are right; the premise set is larger than five — see N-4 |
| **C-12** | Two of four sub-items answered; `heartbeat` and the concurrency guard were dropped |

Split verdicts (one judge each, recorded as unresolved): **C-2** — `design.md` was corrected, `requirements.md` D-D and NFR-3 still name QA-13 as the gate. **C-10** — the seven named files landed; two more were found.

## New findings confirmed by **both** judges

### N-1 · SEVERE · DD-10's invariant is necessary but **not sufficient**
`startedAtMs` is taken at method entry, **before** `issueCode` — a Prisma upsert plus HMAC hashing whose measured synchronous baseline the floor's own docblock records as **~500 ms** (CloudWatch, 2026-09-03, `latencyMs 498.9`). Worst case is therefore ≈500 + 1500 = **2000 ms against an 1800 ms floor**; `padToVerificationCodeResponseFloor` no-ops on a negative remainder, so the accepted branch overruns while the rate-limited branch still emits at exactly the floor.

**This is worse than the defect it replaced:** the gate NFR-7 adds stays green while the enumeration oracle is open, converting a known risk into documented false assurance. Correct invariant: `baseline_p99 + MAIL_PUBLISH_TIMEOUT_MS ≤ FLOOR`, with the baseline a named constant the test asserts against.

### N-2 · SEVERE · DD-4's boundary is **positional, not evidential**, and removes recovery for the top risk
A stale cached connection — D-F, the freeze/thaw case the design exists for — fails *at* the publish step, because `healthy` is only cleared by listeners whose events arrive asynchronously on thaw, possibly after `publish` was called. Under revision 2 that is permanently non-retryable, so **the first warm invocation after every freeze loses its message**. Revision 1's blanket retry recovered this. Additionally `requirements.md` NFR-2 was never amended and still requires "a channel reporting closed triggers exactly one reconnect" — the non-existent amqplib flag C-12 already condemned.

### N-3 · SEVERE · The rollback command is not executable
`sam deploy --parameter-overrides MailTransport=… --profile IBD-DEV` omits `--stack-name`, `--config-file`, `--region`, `--capabilities`, and — critically — a built template. `infra/scripts/deploy.sh` warns in capitals that passing the **source** template zips the raw `CodeUri` (~500 MB) and blows the 250 MB limit. Neither `deploy.sh` nor `set-cors.sh` passes `MailTransport`, so SAM sends `UsePreviousValue` and the next operator run silently reverts the switch — possibly mid-verification. Phase B's "flip the default" is inert for the same reason, and with no `AllowedValues` a stack can keep `ses` after the code stops accepting it.

### N-4 · SEVERE · The premise set and file inventory are still materially incomplete
A sweep for `\bSES\b|MessageRejected|sandbox|SendEmailCommand` matches **24 files** under `backend/src`; §4.1 names 13. Unlisted and substantive: `registrations.service.ts` (a **sixth** withdrawn-premise site, same `MessageRejected` rationale), `contact.e2e.spec.ts` (a **third leak gate** built entirely on the withdrawn premise), `registrations.service.spec.ts` (six SES-shaped probes), and `registrations-verify.e2e.spec.ts`, which **imports `VERIFICATION_CODE_RESPONSE_FLOOR_MS`, asserts against it, and documents its cost as "900 ms"** — falsified the moment DD-10 doubles it, in Phase A.

⚠️ **And FR-6's acceptance criterion is unsatisfiable as written.** Two *active* specs — `epic/hybrid-actor-registration` and `admin/registration-info-requests` — assert SES as a live dependency. "Only surviving matches inside `archive/`" cannot pass without editing two unrelated planned specs, which nothing authorizes.

### Also confirmed by both (WARNING or lower)
`checkQueue` cannot verify durability, so FR-1's affirmative criterion ("the queue is declared `durable: true`") is now false by construction and was never amended — trading one silent loss mode for a smaller one · FR-3 says "five required variables" and lists **four** · the budget's addition term remains an unbroken-down estimate and omits `ses-cognito-send-policy.json` · `requirements.md` NFR-5 and `design.md` §9 state opposite statuses for the same ≈180 MB figure, which `backend/Makefile` actually records · `FR-4` denotes two different requirements in one table and NFR-7 is cited nowhere in the test plan.

## Branch-context defect — found by one judge, verified by the orchestrator

`design.md` §11 and `requirements.md` OQ-1 state *"`main` is at ADR-013, this branch at ADR-014"*. **On this working copy that is false.** Verified directly:

| Branch | Highest ADR |
|---|---|
| `email-ms` (**current**) | **ADR-013** |
| `feat/legal-notices` | ADR-014 |

`git reflog` records `checkout: moving from feat/legal-notices to email-ms`. The ADR survey was taken while the checkout was on the other branch, and the proposal's Document Control still records "Authored on `feat/legal-notices`". **This is KZ-010 ×3 exactly** — a measurement taken on the wrong branch is wrong, not slow. Allocation was correctly deferred to apply time, so the harm is bounded to a false statement, but the branch context in all three documents must be corrected.

## Assessment

The correction closed two-thirds of round one and **introduced four new severe findings** — the pattern KZ-008 records as a measured 100 % FAIL rate across remediation rounds. Two are genuine engineering errors (N-1's arithmetic, N-2's removed recovery), not documentation slips.

**Ceiling: one fix round and one re-judgment remain.** After them the lineage is exhausted and terminates `approved` or `escalated`, with no reset.

---

# Round 3 — Final Scoped Re-Judgment · TERMINAL

- Target: `design.md` revision 3 + the revision-3 amendments to `requirements.md` / `proposal.md`
- **Terminal state: `escalated`** — the two permitted fix rounds and two permitted re-judgments are exhausted. No reset, no extension.

## Closure

**CLOSED 9–10 · PARTIAL 4–5 · OPEN 0**, both judges. Genuinely closed against the repository (not against the document's account of itself): the non-executable rollback command and the script pass-through (N-3); the file inventory — an independent 26-file sweep of `backend/src` found **every** file now listed (N-4a); FR-6's unsatisfiable sweep (N-4b); `checkQueue` vs durability; the QA-13 misattribution in `requirements.md`; heartbeat; the mutex mechanism; the ADR/branch claim; the ≈180 MB figure.

## Confirmed by both judges — the fix round introduced these

| # | Finding |
|---|---|
| **T-1** | **`MAIL_PUBLISH_TIMEOUT_MS` has two different values.** DD-10 sets `1000`; `requirements.md` NFR-1 still mandates `1500`. With `900 + 1500 = 2400 > 1900`, honouring the requirement breaks the invariant the design just built |
| **T-2** | **Both *gates* still encode the invariant this round replaced.** DD-10's composed `PRESEND + TIMEOUT ≤ FLOOR` lives only in prose; `requirements.md` NFR-7 and `design.md` §10 both still specify the two-term `TIMEOUT < FLOOR`. A Tester building from either ships **the exact green-but-blind gate N-1 condemned** |
| **T-3** | **The probe cannot fail fast in the case it exists for.** D-F's canonical shape is a *half-open* socket — the design's own preamble says "the broker may close a connection our side believes is open". `checkQueue` on such a socket writes a frame and waits for a reply that never arrives; it does not throw. It therefore consumes the entire budget, leaving nothing for the reconnect. And the budget **shrank from 1500 ms to 1000 ms in the same revision that added a round-trip to it**. N-2's classification error is fixed; the message is still lost, now to a timing error |
| **T-4** | **`PRESEND_ALLOWANCE` is an unenforced assumption presented as a bound.** Nothing times `issueCode`. This repo's own `email-verification.service.ts` documents Prisma's **5000 ms** interactive-transaction ceiling on that exact critical section — 5.5× the allowance, 2.6× the whole floor. NFR-7 asks the property to hold *"structurally, not probabilistically"*; with an unbounded first term it remains probabilistic |
| **T-5** | **The mutex is underspecified where it matters.** One judge: no stated release on the deadline path — a mutex never released is never released, and every later send in that warm container fails undiagnosably (DD-5 strips the detail by design). The other: the wait is charged to the caller's already-running deadline, so a `502` can be caused purely by another request's lock hold. DD-11 also states two incompatible scopes in consecutive paragraphs |
| **T-6** | **Phase A pays the full cost and receives none of the benefit.** The floor rises to 1900 ms while `MAIL_TRANSPORT` is still `ses`, and T-9 is *blocked* on DEP-5. Every applicant pays ~1 s of gratuitous latency, for an unenforced property, verified by a test that cannot fail — for as long as that question stays open |
| **T-7** | `design.md` §10 still says "five required variables" after `requirements.md` FR-3 was corrected to four |

## Single-judge (recorded, not fixed)

`infra/README.md` §6's delete range (219–340) swallows line 234, the **only live documentation of `PortalUrl`**, a parameter that *survives* — the identical defect the round-2 correction fixed for `OQ-5` by name · after Phase B the Cognito branded invite/reset templates fall back permanently to `COGNITO_DEFAULT`, which `infra/README.md` records as *"may look degraded — an acceptable rollback state"*, now made the steady state · `infra/policies/README.md` has **three** SES rows, not two, and its whole framing is withdrawn · `requirements.md` FR-6 still says "five sites" where the design now says six · `requirements.md` cites OQ-8/OQ-9, which exist only in `design.md` · `proposal.md`'s OQ-1 still carries the false branch claim (only its Document Control row was swept) · the addition budget is ~2× low against this repo's measured lines-per-concept · the composed floor makes `registrations/` import a transport constant, a dependency crossing the port §1 says nothing crosses.

## Diagnosis — why three rounds did not converge

Rounds 2 and 3 failed for the **same structural reason, not a reasoning one**: a fact — a constant, a count, a file list — is stated in three or four documents, and each correction updated some of them. T-1, T-2, T-7, the "five sites", and the OQ cross-references are all one defect wearing five hats.

**The countermeasure is architectural, not another round.** Constants and counts must have exactly one home that the other documents *reference* rather than restate. This is `docs/specs/general-setup/requirements.md`'s KZ-005/KZ-004 rule reaching its limit: a per-correction sweep cannot hold four documents consistent by hand, and the log already records that the sweep itself recurs as a defect four times.

**T-3 and T-4 are different, and are not a documentation problem.** They are a genuine engineering tension the spec has now hit three times from three angles: *a window cannot be made constant-time when one term inside it is unbounded (Prisma's 5 s ceiling) and another is a network call to a third party.* Every remedy so far has moved the hole rather than closed it. This needs a design decision from the product owner, not a fourth attempt at the arithmetic.

**JUDGMENT: ESCALATED ⚠️**
