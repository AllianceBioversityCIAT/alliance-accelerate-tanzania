# Judgment Day — findings ledger

- Spec path: `docs/specs/contact/contact-channels/`
- Target: `design.md` (immutable at judgment time)
- Mode: blind dual review · Round 1
- Date: 2026-08-28
- Judges: two independent read-only agents, fresh context, identical scope and criteria, blind to each other
- Author ≠ auditor: the design's author did not judge it
- Verdict of both judges, independently: **not safe to decompose into tasks as written**

## Tally

| | Judge A | Judge B |
|---|---|---|
| SEVERE | 9 | 10 *(summary line says 9 — the judge's own tally under-counts its list by one; the discrepancy is recorded, not resolved in its favour)* |
| WARNING | 8 | 6 |
| SUGGESTION | 3 | 4 |

No contradictions between judges. Nothing requires escalation for conflicting verdicts.

## S — Severe, confirmed by BOTH judges *(the authorized fix set)*

| # | Finding | Why it is load-bearing |
|---|---|---|
| **S-1** | **The mail contract cannot address more than one recipient.** `MailMessage.to` is `string`; `SesMailTransport` hard-wires `Destination: { ToAddresses: [message.to] }`. §2's change table lists `replyTo` as the *only* contract change | FR-2 requires **one email to the resolved administrator recipient*s***. A resolved list has nowhere to go. The design never chooses between widening `to`, adding `bcc`, or fanning out N sends — and each has different consequences for FR-11 and for the OTP regression surface |
| **S-2** | **§1 claims a structural FR-10 guarantee that its own diagram refutes.** "No Prisma client is injected into either service — the module has no data layer at all" is contradicted six lines below by `ActorContactService → PrismaService`, by §4.1 wiring `PrismaModule`, and by §4.4 | Presents discipline as structure (KZ-008). A Reviewer would accept FR-10 as proven by construction when it rests on nobody calling a write method |
| **S-3** | **FR-8's error state is unreachable.** DD-4 routes every non-validation outcome to `202`; §3 defines only `400` and `429`. FR-8's mandatory scenario begins "GIVEN the mail transport rejects or errors on dispatch" | FR-8 and FR-11 are individually reasonable and their intersection as written is empty. The design resolves it in FR-11's favour silently, never recording the loss. Note FR-11's own scenario enumerates only *registry-state* discriminators; a transport exception discloses no registry state |
| **S-4** | **FR-11's timing clause has no mechanism, and the awaited send recreates the oracle.** A contactable actor returns after a Prisma read **plus** an SES round-trip; an unknown id returns after the read alone — hundreds of milliseconds apart | **This codebase already solved this and documents it:** `RegistrationsService` dispatches fire-and-forget with a class doc warning that "the response latency itself becomes an oracle", and `lambda.ts` carries a production post-mortem on `callbackWaitsForEmptyEventLoop`. DD-4 cites the registrations doctrine for the `202` shape while omitting the half that makes it hold. §10's "byte-identical" measures the wrong dimension and passes while the oracle is open |
| **S-5** | **`Reply-To` carries attacker-supplied text into a header, and DD-5 spends its rigor on the wrong field.** FR-7 requires `Reply-To` to carry the requester's **name**; §4.5 asserts "requester-supplied text reaches the body and nothing else" | DD-5 devotes three sub-points to double-wrapping and RFC 2047 for the `From` display name — a fixed ASCII constant — and says nothing about the one display name an anonymous party controls. CR/LF stripping does not sanitize `"`, `<`, `>`, `,`, `;`, or non-ASCII. A non-ASCII visitor name is an ordinary Tuesday |
| **S-6** | **A second `ThrottlerModule.forRoot()` collides with the existing global registration.** `RegistrationsModule`'s own docblock records that `ThrottlerModule` is `@Global()` and "this single registration is enough" | Which options a guard resolves becomes a function of module registration order. The failure is silent and lands on a **live release-gated rate limit**. Separately, "a thin subclass carrying this module's limit constants" misdescribes the precedent: `RegistrationsThrottleGuard` has an empty body; its constants are consumed by `forRoot`, not by the class |
| **S-7** | **FR-9's "link the privacy notice" has no mechanism and no target exists.** No `/privacy` route exists under `frontend/app/(public)/`; the only privacy-adjacent artifacts are the registration `consent-policy` endpoint and a map-legend string | The design covers the acknowledgement half and drops the link half — discharging a requirement by citing its satisfied clause is exactly KZ-001. An implementer will invent a destination or ship a checkbox linking nowhere |
| **S-8** | **The honeypot's server-side behaviour is unspecified and untested.** It appears as a request field and as a rendered field, and DD-7 elevates it to a *compensating* control — but no section says what the server does when it is filled | `grep -rin honeypot backend/` returns nothing, so there is no precedent to inherit. §10's row cites DC-6 while covering only the throttle half. A control whose behaviour is unspecified and untested is the literal definition of DC-6's "present but inert" |
| **S-9** | **NFR-4 and NFR-6 are traced in the header but never addressed, and DC-7 has no test row.** The design contains no occurrence of "token", "hex", "arbitrary", or "analytics" | NFR-4 is a root-`CLAUDE.md` hard constraint and a `frontend/CLAUDE.md` zero-tolerance rule, and the design describes two new form surfaces without mentioning tokens or the `<fieldset>` pattern. DC-7 is the only defect class of DC-1…DC-11 with no row in §10 |
| **S-10** | **The `NAV_LINKS` arithmetic is wrong in the very paragraph that claims to have measured.** §5.2 says "six items" then enumerates five, folds the separate `AuthSlot` component into the array count, and concludes "Contact makes seven before the primary CTA" — false under every reading (six before the CTA, seven in the array) | `NAV_LINKS` holds six entries: Home, Discovery Map, Dashboard, Directory, About, Register your organisation. The design correctly caught `proposal.md` §8's stale list and then introduced its own error correcting it — KZ-008's "recurs at every level of its own correction", and KZ-005 failing inside the paragraph flagged as verified |
| **S-11** | **The `pii-boundary.spec.ts` extension claims log coverage the harness structurally cannot deliver.** That suite contains zero occurrences of "log": it is a supertest response scanner with no `Logger` spy, no stdout capture | NFR-1 requires "…or log line". Asserting it onto an artifact that cannot bear it is KZ-008 landing **on a release gate**. Compounding: both new paths return an *empty* `202`, so a value scan over the response is near-vacuous — it would pass against a stub controller that does nothing (KZ-002: the gate must be shown to discriminate) |

## W — Warnings confirmed by BOTH judges *(informational under the protocol; recommended for the same revision pass)*

| # | Finding |
|---|---|
| **W-1** | **§7 self-contradicts and hedges a settled fact.** "No IaC change" is contradicted three sentences later. And the IAM question is answerable today: `infra/20-backend/template.yaml` grants eleven `cognito-idp:*` actions action-by-action, with no wildcard; **`ListUsersInGroup` is not among them.** "May be broad enough already" invites skipping the check R-4 exists to force. The unnamed fallback env var is likewise a real IaC change |
| **W-2** | **Approved documentation scope silently narrowed.** `proposal.md` put `docs/ux-ui/design.md` §2 (IA + the `/directory/[id]` → `/profile?id=` fix), §4 (screen inventory) and §5 (nav model) in scope, plus TRD §13's QA-13 registration. The design names only TRD §4. QA-13 appears once, parenthetically, inside a table cell |
| **W-3** | **Every number is missing.** Throttle limit and window, message and subject length caps, and the resolver cache TTL are all unstated — the design is where `requirements.md` OQ-1/OQ-2 were to be settled. Worse, "live group first" and "cached behind a TTL" are different mechanisms: FR-3 demands the change take effect on "**the next** submission", NFR-8 demands caching. One clause must yield and the design names neither the TTL nor the winner |
| **W-4** | **The relay's phishing posture is unanalysed.** DD-5 adds an institutional display name; combined with the actor endpoint this yields: anonymous text → any imported actor address → `From: ACCELERATE Tanzania Seed Registry <a real individual's @cgiar.org mailbox>` → `Reply-To:` an address the attacker chose. DD-7's three compensating controls all address *automation*; none touches *content*. Unlike every other mail path here, the requester's email is **never verified** — registrations gates on an OTP first. TRD ADR-010 accepted the first unauthenticated write path only because abuse was bounded by throttling **plus persistent counters**; this path has neither |
| **W-5** | **The budget's eleven tasks do not reconcile with the design's own inventory** — §4.1 names ten backend files, §4.6 two transport edits, §5 six frontend artifacts plus serializer and type changes, §10 nine test suites, plus the docs work. The tripwire would fire on scope the design already lists |

## V — Single-judge findings, independently verified against the code

Under the protocol a single-judge finding is a *suspect*, not authorized for auto-fix. These four were checkable, so they were checked; the evidence — not the judge's authority — is what settles them.

| # | Finding | Verification outcome |
|---|---|---|
| **V-1** | `MailService` exposes no way to send a pre-rendered `MailMessage` | **TRUE.** Public surface is exactly `sendVerificationCode(to, code)` and `sendReceipt(to, reference)`; `dispatch(kind, message)` is `private`. The design's central integration point requires a new public method that §2's change table does not list (KZ-006) |
| **V-2** | DC-9 and §10 mis-cite QA-11 — contrast **is** automated here | **TRUE.** TRD QA-11 reads: "Contrast is instead enforced by a deterministic computed-ratio assertion over the token palette (`frontend/lib/contrast.test.ts`)." Only **layout and nav density** are genuinely unautomated. `requirements.md` DC-9 and `design.md` §10 both state the opposite — one wrong claim copied forward across two documents, which is why agreement between them is not corroboration |
| **V-3** | The no-op transport cannot observe recipients | **TRUE.** `RecordedSend` is `{ reference?, at }` and its doc states it "Never carries `to`, `subject`, or `text`". Contact messages have no `reference`, so every record is `{ undefined, Date }` — the seam can count dispatches but cannot distinguish "delivered to admins A and B" from "delivered to the fallback", which is what DC-2 requires |
| **V-4** | Per-IP tracking may collapse under serverless-http without `trust proxy` | **RESOLVED IN THE DESIGN'S FAVOUR.** No `trust proxy` is configured, but `lambda-handler.e2e.spec.ts` already carries a test proving `req.ip` resolves from `event.requestContext.http.sourceIp` — a different `sourceIp` is not throttled by the first caller's traffic. DD-7's "containers × limit" framing is correct. **Action: cite that test in DD-7** so the premise is evidenced rather than assumed |

## X — Single-judge suspects, not authorized for fix

Recorded for the owner's decision. Not auto-fixed.

| # | Suspect | Judge |
|---|---|---|
| X-1 | `contactable` ships on `GET /actors` too, so ~10 unauthenticated paginated requests yield the full roster of mailable organisations — a per-actor bit sold in bulk. DD-3 weighs the single-record case only. Restricting it to the single-actor projection costs nothing in UX | B |
| X-2 | Making `contactable` **required** on the frontend `PublicActor` breaks every existing actor fixture (~20 test files). Also, the "mirroring the backend" justification is inaccurate — that type already diverges (`district?`, `capacityTons?`, `gps?` are optional there and non-optional in the serializer) | B |
| X-3 | `RequestContextMiddleware` logs `route` as `req.path`, so CloudWatch retains which actor was contacted and when — DD-1's "no record of who contacted whom" is therefore not accurate. That middleware's own docblock asserts "none of this module's four routes takes a path parameter"; this spec introduces the first one under it | A |
| X-4 | `ListUsersInGroup` paginates (60 default, `NextToken`); a single call silently truncates "every current member" | B |
| X-5 | `apiFetch` needs `expectEmpty: true` for a `202` empty body, else the success path throws a JSON parse error and surfaces as a failure. `requestVerificationCode` is the precedent | A |
| X-6 | `lambda-handler.e2e.spec.ts` is not named as a regression guard, though two new JSON POST routes are added and `proposal.md` SC-9 names it | B |
| X-7 | The home-page entry point, approved in `proposal.md`, is silently dropped from §5.2 | A |
| X-8 | The eight categories are named as a contract but never enumerated in the design, and off-list category rejection has no test row | B |

## What both judges credited

Recorded so the revision does not "fix" what is already right: the codebase grounding is largely accurate — `SesMailTransport`, `ActingAdminResolver`'s per-container cache, `RegistrationsThrottleGuard`, `ThrottlerExceptionFilter`, `RequestContextMiddleware` via `forRoutes`, `toPublic`/`PublicActor`, `PII_ALLOWLIST`, `ProfileView` rendering `RestrictedContactPanel` last, and `frontend/app/(public)/` all exist as described. DD-8's quotation of the restricted panel's copy is verbatim correct. DD-5's claim that existing transport tests assert the exact `Source` value is confirmed. DD-5's "no IAM change is needed" for a display name is correct. `contactable` is derivable without a query change, since the public actor query uses `include`, not `select`. QA-13 is the correct next free QA id. `contact.e2e.spec.ts` matches the canonical `*.e2e.spec.ts` naming. Citations use symbols, not `file:line` (KZ-009 satisfied). DD-4, DD-6, and DD-7's honesty about the missing second control were each named as genuinely good.

## Lifecycle

- Round 1 judgment: **complete**. Ledger frozen.
- Round-one correction: **awaiting owner approval** (the protocol requires asking before the fix round).
- Rounds remaining after this one: 1.
- Terminal state: not yet reached — neither `approved` nor `escalated`.

---

# Round 2 — scoped re-judgment and final fix

- Date: 2026-08-28
- Scope: the frozen round-1 ledger plus the revision-2 fix delta. Judges could record **fix-caused** defects.
- Both judges, independently: **Resolved 14 · Partial 6 · Unresolved 0**

Every round-1 item was engaged on substance; none was untouched. Both judges independently re-verified the factual claims revision 2 introduced — the six `NAV_LINKS` entries, the eleven `cognito-idp` actions with `ListUsersInGroup` absent, 20/60 s matching the registration constants, QA-13 as the next free id, the `ThrottleDbTestModule` precedent, the `sourceIp` test, the single `message.to` consumer, `contrast.test.ts`, the absent `/privacy` route — and all checked out. That is the inverse of revision 1's worst failure, where the paragraph claiming to have measured was the one that miscounted.

## Fix-caused defects — confirmed by BOTH judges

| # | Defect | Resolution in revision 3 |
|---|---|---|
| **F-1** | **The `.catch()` rule was written against the wrong leak.** "Logs the failure kind and no requester field value" is satisfied by `` logger.error(`send failed: ${err.message}`) `` — and `registrations.service.ts` records that the AWS SDK's `MessageRejected` **puts the destination address verbatim in `message`**, a leak this codebase already shipped once and reworked. On the actor path that destination is `Actor.email`: a `PII_ALLOWLIST` value, on an unauthenticated route, under NFR-1's release gate. `MailService.dispatch` rethrows unchanged, so the raw error is exactly what arrives | §3.1 now states the **mechanism**: log `err.name` only, never `err.message`, never any unbounded value. The log-capture seam asserts it against a `MessageRejected`-shaped rejection carrying the fixture address |
| **F-2** | **DD-11's per-actor send cap was decided but unbuildable.** It named "the same in-memory store", which does not exist: `@nestjs/throttler` keys on class + handler + `req.ip`, so keying by actor id needs a `getTracker` override — the guard subclass §4.3 forbids — or a second named throttler inside the `forRoot` array that lives in `RegistrationsModule`. It had no limit, no window, no file, no test row, and no entry in §3's `202` enumeration, while §6 discharged "content abuse" by pointing at it and §13 budgeted it | **Dropped**, with the reasoning recorded. Building it properly means editing the single live `forRoot` the release-gated registration path depends on — not a side effect of a contact form. DD-11 now rests on the provenance block alone, and R-3/§6 state plainly that per-actor mail-bombing is **not** effectively bounded |
| **F-3** | **§3.1's uniformity claim was refuted by §4.4.** "Every path returns after the read, before any network call" is false for `POST /contact`, which has no read and *did* have a Cognito round-trip on the response path — made worse by the pagination loop revision 2 adopted, and worse again by a fallback reached only after an SDK timeout. FR-11 explicitly requires uniformity to hold "when administrator resolution has fallen back" | Recipient resolution **moves into the fire-and-forget continuation**, so `POST /contact` returns before any directory call. The residual differential is synchronous SDK setup, stated as a **collapse, not a removal** |
| **F-4** | **§1 re-asserted the "by construction" overclaim that §1.1's table exists to retract** — S-2 recurring inside its own correction, exactly the pattern KZ-008 names | §1 rewritten to match the table: the port narrows the injected type so a write is not expressible *from the service*; the adapter remains discipline, gated by the DC-5 e2e |
| **F-5** | **The mandated timing assertion had no threshold, sample count or statistic** — against a mocked Prisma it lands either vacuous or flaky, which is a gate that proves nothing (KZ-002) | Replaced with a **deterministic structural gate**: the response resolves with the dispatch still pending, and no SES or Cognito call occurs on the request's critical path. It tests the mechanism DD-10 introduced and can genuinely fail |
| **F-6** | **The NFR-1 log seam was scoped to a window DD-10 moves the log lines out of** — a spy asserted "around the request" sees the attempt line and misses the `.catch()` | §11 now requires assertion **after the dangling promise settles**, with the leaking variant leaking through the post-response path |
| **F-7** | **§4.8 instructed extending the no-op transport's `RecordedSend`**, whose documented invariant is that it never holds `to` — and which §11 relies on precisely for that reason | Corrected: the no-op transport needs no change, and the invariant is called out as load-bearing |
| **F-8** | **The honeypot could never reach the handler.** The global pipe sets `whitelist: true`, so an undeclared property is stripped — DC-6's exact failure mode, inside the fix written to close DC-6 | §4.1's DTO row now requires a declared, permissively-validated optional property, and explains why `@IsEmpty()` would contradict §3 |
| **F-9** | **The backward-closure sweep closed one claim and left four asserted as current** — `proposal.md` SC-2 ("the next send"), SC-7 ("a forced send failure"), §9's "requester-supplied text never reaches a header", and §9's incomplete contract list; plus `requirements.md` FR-8's Description and FR-3's Description | All six carry dated supersession notes. `requirements.md` DC-4 and DC-5 were also strengthened to match the design's own gates |
| **F-10** | **The budget was re-derived twice and was low both times** | Re-derived bottom-up against measured comparables in this checkout, with the missing **frontend artifact table** added — see below |

## Single-judge findings adopted

- **DD-1's pointer to §12 dangled** — it referenced a decision §12 did not contain. Now **OD-6**: `RequestContextMiddleware` logs `route` as `req.path`, so CloudWatch retains which actor was contacted; that middleware's own docblock asserts none of its routes takes a path parameter, an invariant this spec is the first to break.
- **OD-2 and OD-4 are one coupled decision, not two** — the paginated and single reads share `toPublic()` and `PublicActor`, so restricting `contactable` to the detail projection requires splitting the serializer and the type. "It costs nothing" was asserted against a shared-serializer reality.
- **NFR-8's cited precedent has no TTL** — `ActingAdminResolver` caches without expiry, so the bounded 60 s cache is an extension of that shape, not a copy of it.
- **`ThrottlerGuard` must be named in `providers`**, matching the precedent modules, rather than left to DI guesswork.

## Budget — the single most consequential outcome

| | Rev 1 | Rev 2 | **Rev 3** |
|---|---|---|---|
| Tasks | 11 | 16 | **18** |
| Total LOC | ~1,300 | ~1,850 | **~3,950–4,450** |
| Review rounds | ~14 | ~20 | **~24** |

Measured comparables in this checkout: `RegistrationForm.tsx` **880** lines, its test **622**, `pii-boundary.spec.ts` **1,413**, the whole `registrations` module **6,136**. Test LOC is where both earlier estimates failed worst.

**The scope barely moved between revisions.** The growth is two successive under-estimates being corrected — which is what a budget nobody audits would have hidden until the Leader escalated mid-execution.

## Lifecycle

- Round 1 judgment: complete · Round 1 fix: applied · Round 2 scoped re-judgment: complete · Round 2 fix: applied.
- **Fix rounds and re-judgments are now exhausted** under the two-round ceiling.
- Terminal state: **pending owner decision** — the design is materially different in size from what was approved at proposal time, and OD-1…OD-6 remain open. Neither `approved` nor `escalated` is asserted here unilaterally.

---

# Scope cut — 2026-08-28, after round 2

The owner descoped the **actor contact channel (ATP-28)** on seeing the re-derived budget (~4,000 LOC / 18 tasks). The spec now covers the general contact form only, and `proposal.md`, `requirements.md` and `design.md` were regenerated at that scope.

**This ledger is retained as the review record.** It is also the reason the cut is defensible: it documents that the actor entry point carried most of the risk, not merely half the cost.

| Ledger item | Status after the cut |
|---|---|
| S-1 multi-recipient contract · S-5 `Reply-To` encoding · S-6 duplicate throttler · S-7 privacy link · S-8 honeypot · S-9 tokens/analytics/DC-7 · S-10 nav count · S-11 log-capture seam · W-1 IAM · W-2 docs · W-3 constants · W-5 budget · V-1 `MailService` · V-2 contrast · V-3 dispatch seam · V-4 per-IP premise | **Still apply — carried into the rescoped documents** |
| F-1 `.catch()` logging rule | **Still applies**, at lower severity: the leaked value would be an administrator address, not `Actor.email` under a release gate |
| S-2 FR-10 structural vs. disciplinary | **Dissolved.** The module now injects no Prisma client at all, so the claim is structural without qualification |
| S-3 / F-? FR-8 unreachable · S-4 timing oracle · F-3 `POST /contact` network call on the response path | **Retained in substance** — fire-and-forget and the narrowed failure requirement are carried forward, now for latency and simplicity rather than to close an enumeration channel |
| S-4's oracle rationale · DD-4's uniform `202` as anti-enumeration · DC-11 constraint interaction | **Dissolved** — no registry state is reachable through this endpoint. A narrower reason survives: the administrator-fallback path must not be distinguishable |
| F-2 per-actor send cap · W-4 phishing laundering · X-1 bulk `contactable` harvest · X-2 fixture sweep · X-3 CloudWatch actor-id retention · OD-2/OD-4 coupled projection decision | **Gone with ATP-28** |

Four of the six owner decisions carried out of Judgment Day left with the actor channel. Two remain, as `design.md` §12.

**Rounds are not reset by the cut.** The two-round ceiling was consumed against the two-entry-point target. The rescoped documents have not been through a blind dual review; whether to spend one on a materially smaller and lower-risk target is the owner's call.

---

# Round 3 — new lineage, rescoped target

- Date: 2026-08-28 · Target: `design.md` rev 4 + `requirements.md` rev 2 + `proposal.md` rev 2
- **New lineage.** The two-round ceiling was consumed against the two-entry-point target; this smaller target starts fresh.
- Both judges asked two questions: did the seventeen carried-forward fixes **survive the rewrite**, and a fresh adversarial review.

## Regression check

**Sixteen of seventeen survived in substance**, independently re-verified against the code by both judges: S-1, S-5 (strengthened), S-6, S-7, S-8, S-9, S-10, S-11, W-1, W-2, W-3, V-1, V-2, V-3, V-4, F-1. A wholesale rewrite is where fixes usually regress; this one held.

**One regressed: S-2, for the third time.**

## Severe, confirmed by BOTH judges

| # | Finding | Verified |
|---|---|---|
| **R3-1** | **`PrismaModule` is `@Global()`, so "the module has no data dependency, therefore FR-7 is structural" is false.** A provider in `ContactModule` can declare `constructor(private prisma: PrismaService)` with no import and Nest resolves it. Not importing prevents nothing at runtime — it is discipline wearing structure's clothes, which is exactly what S-2 flagged and F-4 retracted. **Third occurrence, each time inside the sentence correcting the previous one** (KZ-008's "recurs at every level of its own correction") | `prisma.module.ts` carries `@Global()` and its docblock says "exposes the single PrismaService to every module **without re-importing**" |
| **R3-2** | **DC-4 says "Automated" in `requirements.md` and has no row in `design.md` §11**, while §1 says "no test is needed". Every other defect class DC-1…DC-11 has a row. Two documents in one spec disagree about whether the strongest-sounding requirement is gated — and the waiver rests on R3-1's false premise | Cross-read of both documents |
| **R3-3** | **"SES production access is no longer a dependency" is factually false, and the failure mode is total and silent.** Four of this spec's own decisions interact (KZ-007): the account is in the **SES sandbox**; FR-3 resolves recipients **live from Cognito**, and adding a user to a group performs no SES verification; DD-6 sends **one** `SendEmail` with every admin in `ToAddresses`, which SES rejects **entirely** if any destination is unverified; DD-3 dispatches fire-and-forget and §3.2 logs `err.name` only. **Net effect: adding one admin to the group silently stops contact mail reaching all of them**, visible only as a single `MessageRejected` line, with the visitor told `202`. SC-2 is untrue as written | `infra/20-backend/template.yaml` states in-tree: *"the account is still in the SES sandbox, so this can only deliver to other verified addresses"* |
| **R3-4** | **FR-6's server-side privacy acknowledgement has no mechanism, and the DTO's field set is never enumerated.** The one DTO row spends its whole text on the honeypot; §4.6 lists what the body carries and omits the acknowledgement; §6's Consent row answers FR-6's *other* clause (KZ-001); §11 has no rejection case. No length cap for the requester email either | Cross-read |
| **R3-5** | **The dispatch gates cannot discriminate.** DD-3 runs resolution and dispatch *after* the response, so a spy asserted right after `await request(app)` sees the state before the continuation ran — "zero dispatches" passes against an implementation that dispatches, and "reaches all resolved admins" is a flake. The settle-after-response rule was applied to **only** the `pii-boundary` row. No drain seam is named anywhere | Judge A SEVERE, Judge B WARNING — same defect |

## Severe, single judge, independently verified

| # | Finding | Verification |
|---|---|---|
| **R3-6** | **"The limit is effectively fixed at 20/60 s" is false**, and I foreclosed the only tunable abuse control on it. `@Throttle({ default: { limit, ttl } })` overrides per controller with no second registration and no edit to the live registration path. The inherited 20/60 s was sized for "one applicant's form fill, an OTP resend, and a retry after a typo" — not for an endpoint that generates outbound mail into admin inboxes | The repo already reasons about the sibling `@SkipThrottle()` in three places. `node_modules` is **absent from this checkout**, so the decorator was not verified from the installed package; `package.json` pins `@nestjs/throttler ^6.5.0`, whose documented API includes it |
| **R3-7** | **FR-5's "must NOT expose a status code" has no mechanism, and the cited precedent violates it.** `apiFetch` sets `message = \`HTTP ${status} ${statusText}\``, and `OtpVerificationStep`'s `classifySendError` renders `err.message` for every non-400/429 — so "follow the established `ApiError` path" ships exactly the string FR-5 forbids | `client.ts` sets that message at two sites |

## Warnings confirmed by both

- **W-4's "Gone" overstates it.** Third-party laundering left with ATP-28; what remains is anonymous content under the programme's display name — which DD-5 *raises* — landing in the inboxes of every `admin`-group member, the platform's highest-privilege users, with an unverified `Reply-To`. Smaller blast radius, higher-value target. Nowhere analysed.
- **NFR-5 (static-export safety)** has no mechanism in the design and no gate row.
- **§13's artifact inventory lists no test artifacts**, while test LOC is the largest budget line — W-5's concern reappearing.
- **DD-5 changes `From` without ever stating the display-name value**, in a constants table that carries every other literal.

## Single-judge, worth adopting

- The honeypot's `@MaxLength` makes the trap **self-identifying**: an over-long value returns `400` with `details[0].field` naming the honeypot — a free oracle. `whitelist: true`, "validation errors are the only discriminator", and "the honeypot must be indistinguishable" are each right and their conjunction is not (KZ-007).
- An unset `CONTACT_FALLBACK_RECIPIENT` silently drops the message FR-3 forbids discarding.
- `SendEmail` caps recipients at **50**; the pagination loop makes an over-cap group expressible.
- §4.1's rationale for importing `MailModule` **misattributes the `@Global()` argument** — `MailModule` is a plain `@Module`; that reasoning belongs to `PrismaModule`, which is the very fact that refutes R3-1.
- `proposal.md` revision 2 carries no approval state, and its §13 says requirements and design "are being regenerated" — work already complete.

## Lifecycle

Round 3 judgment complete, ledger frozen. **Fix round: awaiting owner approval.** One fix round and one scoped re-judgment remain in this lineage.

---

# Round 4 — final scoped re-judgment · TERMINAL STATE

- Date: 2026-08-28 · Target: revision 5 · Both judges: **Resolved ~10–11 · Partial ~5–6 · Unresolved 0**
- **Fix rounds and re-judgments are now exhausted in this lineage.**

Every Round-3 item was engaged on substance, and every factual claim revision 5 introduced held under independent verification by both judges — the throttler resolving to 6.5.0 in the lockfile, `trailingSlash: true` making the build assertion correct, the display name matching `layout.tsx`, `@Global()` on `PrismaModule` and its absence on `MailModule`, the in-tree SES sandbox comment, `whitelist: true`, `apiFetch`'s `HTTP ${status}` sites, and all four LOC comparables. §11's thirteen rows reconcile exactly with §13's thirteen artifacts.

**And the two largest revision-5 edits are each internally inconsistent.**

## Severe fix-caused defects, confirmed by both judges

| # | Defect |
|---|---|
| **R4-1** | **DD-6's per-recipient isolation is not expressible through §3.2's single `.catch()`.** §3.1/§3.2 remain singular ("**the** dangling promise carries a `.catch()`") while DD-6 asserts "N failure points, **each** logged". A sequential loop under one terminal `.catch()` aborts at the first rejection — **reconstructing the all-or-nothing total loss DD-6 was written to eliminate**, and making its stated consequence false. `Promise.all` short-circuits; `allSettled` never rejects so the single `.catch()` never fires and every failure is silent. The composition is undetermined, and it is what the whole R3-3 mitigation rests on |
| **R4-2** | **The `pendingDispatch` seam is not buildable.** `readonly` cannot be assigned outside the constructor (TS2540). `ContactService` is a default-scope **singleton**, so one property is last-write-wins across concurrent requests. On throttled, validation-failed and honeypot paths it is `undefined` or a **stale promise from a previous test** — and `await undefined` resolves instantly, making every ⟳ row on those paths a vacuous await that passes against anything |
| **R4-3** | **The new DC-4 gate cannot fail.** §4.3 prescribes the standalone composition for this spec's e2e; in it `PrismaService` is absent from the graph, and `overrideProvider` on an absent provider is a silent no-op — the spies wire to nothing and "zero calls" passes unconditionally. The row also lacks ⟳, so a Prisma write placed in the continuation (where the resolver and mail live) is invisible to it. **This is FR-7's only gate, created specifically because the structural claim was false** |
| **R4-4** | **The structural dispatch gate is a race, not deterministic.** Against mocked Cognito and mail the continuation settles in microtasks; the supertest response spans many macrotasks. "Still pending" will normally be false by assertion time, so the gate **fails against a correct implementation**. Round 2's F-5 rejected this class of gate; the replacement has the same property in the other direction |
| **R4-5** | **The ⟳ settle rule reaches only 2 of the 5 dispatch-observing rows.** Unmarked: DC-4 zero-writes, throttle — whose stated observable *is* the dispatch count, so it passes against an implementation with no guard at all — and the dispatch assertion seam. R3-5's finding was that the rule reached one row; the fix moved it to two |
| **R4-6** | **`proposal.md` §9 and R-1 still assert the reversed multi-recipient contract as current**, uncorrected, while §5, `design.md` §2 and `requirements.md` §5 all say the opposite. §9 is the requirement delta a Leader reads when decomposing. This is round 2's F-9 defect class, recurring in the same document |
| **R4-7** | **The 50-recipient cap is premise-less and instructs an FR-3 violation.** SES's 50 caps destinations *within one message*; under DD-6 every message has exactly one, so the cap is unreachable and its stated reason is false. What remains is a rule that silently discards admins 51+, contradicting FR-3's "MUST resolve **every** current member" — with a §11 row certifying the discard |

## Also confirmed

`proposal.md` §2.1 still marks the phishing residual "Gone" while `design.md` §6 says the opposite · the uncapped honeypot is bounded only by the global **8 MB** body limit, parsed into Lambda memory **before** the throttle guard runs, since `configurePayloadCap`'s 32 KB cap is path-scoped to `/registrations` · FR-5's branches do not partition — a `400` with empty `details[]` renders nothing · the unset-fallback throw lands inside the continuation where `.catch()` swallows it, so "fails fast" does not · test LOC is low again against measured e2e suites (223–354 each), the third occurrence.

One judge additionally found that the **SES sandbox quota (200 messages/24 h, 1/second) is account-wide and shared with the live registration OTP path**, and DD-6 multiplies contact consumption by N — so R-3's "blast radius is the team's own inboxes" is false.

## Terminal state: **ESCALATED ⚠️**

Under the two-round ceiling, issues remain after the final re-judgment. The lineage does not reset and is not extended.

**The pattern matters more than any single finding.** Four rounds have each found real defects, and a large share of them were introduced by the previous round's fixes. The through-line is visible in R4-1 through R4-5: they are all consequences of **fire-and-forget dispatch**, which entered the design in revision 3 to close an *enumeration timing oracle on the actor endpoint*. **That oracle dissolved when the actor channel was cut.** Fire-and-forget now buys only response latency, and it is the root cause of the `pendingDispatch` seam, the ⟳ discipline, DC-4's invisibility, the structural gate's race, the swallowed fallback error, and FR-5's narrowing away from its original trigger.

The recommendation carried to the owner is therefore not "patch the seven items" but **remove the mechanism they all hang from** — see the escalation note handed to the owner on 2026-08-28.

---

# Escalation outcome — 2026-08-28

The owner chose **simplification over patching**. `design.md` revision 6 removes fire-and-forget dispatch, and with it the six findings that hung from it — R4-2 (`pendingDispatch` unbuildable), R4-3 (DC-4 gate blind), R4-4 (structural gate race), R4-5 (drain rule partial), the swallowed fallback error, and FR-5's narrowing. R4-1 dissolves too: the per-recipient fan-out existed only because a total rejection was *silent*, and awaiting the send removes the silence, so `to` widens once and stays.

Applied rather than dissolved: R4-6 and R4-7 (the `proposal.md` supersessions and the 50-recipient cap), the phishing-row correction, the 8 MB honeypot bound, FR-5's `details[]`-based partition, the bootstrap fallback validation, and the SES quota interaction with the OTP path.

**The design shrank — 346 → 289 lines — while the test budget grew** (~1,400–1,700 → ~2,100–2,500, re-derived against measured e2e suites of 223–354 lines). Those are independent facts; conflating them is how two earlier budgets came out low.

`tasks.md` was written against revision 6. Two of its tasks (T-7, T-8) carry an explicit **demonstrate-red-before-green** requirement, because their gates were specified twice in forms that could not fail.

**Lineage closed.** No further rounds under this ledger.
