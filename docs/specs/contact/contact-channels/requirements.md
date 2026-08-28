# Requirements — General contact form

- Spec path: `docs/specs/contact/contact-channels/`
- Status: Draft — **revision 2**, rescoped to the general contact form only
- Author / Date: AKILI (Product Owner) on behalf of Daniela Gómez — 2026-08-28
- Depth: **Standard**
- Related: `docs/prd.md` §5 · `docs/ux-ui/design.md` §2, §4, §5, §7, §10 · `docs/trd/trd.md` §4, §8, §13 · `proposal.md` (revision 2)
- Jira: [ATP-42](https://cgiarmel.atlassian.net/browse/ATP-42) · deferred: [ATP-28](https://cgiarmel.atlassian.net/browse/ATP-28) actor contact · [ATP-58](https://cgiarmel.atlassian.net/browse/ATP-58) sender address

## 1. Summary

The registry has no contact channel. This spec adds one: a public `/contact` page whose submissions arrive as email in the current administrators' inboxes, with `Reply-To` set to the requester so the conversation continues in ordinary email. Nothing is persisted.

The actor-scoped contact channel (ATP-28) was in an earlier revision of this spec and was **descoped by the owner on 2026-08-28**; `proposal.md` §2.1 records why, and why the cut removed disproportionately more risk than cost.

## 2. Requirement Numbering & Writing Standards

Per `docs/specs/general-setup/requirements.md`. `FR-n` functional, `NFR-n` non-functional, RFC 2119 keywords, atomic and testable. Citations anchor to **symbols and section titles, never `file:line`** (KZ-009). Numeric claims are reconciled against prose across this spec and `design.md` before publication (KZ-005).

## 3. Functional Requirements

### FR-1: Public contact page and navigation entry

- **Description:** The system MUST provide a publicly reachable `/contact` page requiring no authentication, reached from an additional tab in the public top navigation and linked from the footer, the About page and the home page.
- **Rationale / Source:** ATP-42 · owner placement decision, `proposal.md` §8

#### Scenario: An anonymous visitor reaches the contact page

- GIVEN an unauthenticated visitor on any public page
- WHEN they activate the Contact item in the top navigation
- THEN the `/contact` page loads and presents the contact form
- AND the navigation item is reachable by keyboard and exposes its current state to assistive technology
- BUT it must NOT require sign-in, redirect to `/login`, or render behind any role gate
- AND IT MUST remain reachable at the same URL when the mobile navigation is collapsed behind the hamburger

- **PII/RBAC impact:** `Public` role. No PII is read to render this page.

### FR-2: Contact submission

- **Description:** The system MUST accept a submission carrying requester name, requester email, organization (optional), inquiry category, subject, message and a privacy acknowledgement, and MUST deliver it as one message addressed to every resolved administrator recipient.

> **Amended twice, 2026-08-28 — final position.** Round 3 changed this to per-recipient delivery because a single message is rejected entirely by the SES sandbox if any destination is unverified, and under fire-and-forget dispatch that failure was **silent**. Round 4 removed fire-and-forget (`design.md` DD-3): the send is now awaited, so a total rejection surfaces as a `502` the visitor sees. **With the silence gone, the reason for per-recipient delivery went with it**, and one message avoids N sequential calls against the sandbox's 1-message-per-second rate. The residual risk is real and named in `design.md` §7.2 and R-4.
- **Rationale / Source:** ATP-42

#### Scenario: Valid submission

- GIVEN a visitor has completed every required field and checked the privacy acknowledgement
- WHEN they submit the form
- THEN one message carrying the requester's name, organization, category, subject and message is delivered to every administrator recipient resolved per FR-3
- AND IT MUST surface a send failure to the visitor rather than reporting success (FR-5)
- AND the visitor sees an inline confirmation that the message was accepted
- BUT it must NOT persist the submission, allocate a reference number, or create any record the team is expected to triage
- AND IT MUST reject the submission with field-level errors when a required field is missing, the email is malformed, any length cap is exceeded, or the privacy acknowledgement is unchecked

#### Scenario: Category is chosen from a fixed set

- GIVEN the contact form is rendered
- WHEN the visitor opens the inquiry-category control
- THEN the options are exactly: General inquiry · Join the registry · Update or correct actor information · Privacy or consent request · Technical support · Partnership or collaboration · Feedback or suggestion · Other
- BUT it must NOT vary the displayed field set by category, and must NOT read categories from a database table or remote configuration
- AND IT MUST reject a submitted category outside that set server-side, not only in the browser

- **PII/RBAC impact:** `Public` write path. The requester's own name and email are personal data supplied voluntarily; they are relayed by email and never stored.

### FR-3: Recipients resolved from Cognito, never configured

- **Description:** The system MUST resolve recipients from the membership of the Cognito `admin` group, read live behind a **bounded 60-second cache**. A configured address MAY serve only as a fallback when the group resolves empty or the directory call fails.
- **Rationale / Source:** ATP-42, owner decision 2026-08-28 (`admin` only; `staff` excluded)

#### Scenario: Membership change takes effect without redeploy

- GIVEN an administrator is added to (or removed from) the `admin` group through the admin panel
- WHEN a submission is sent **more than 60 seconds later**
- THEN that person is included in (or absent from) the recipient list
- BUT it must NOT require a redeployment, a configuration edit, or a container restart
- AND IT MUST exclude members of the `staff` group, who are deliberately not recipients
- AND IT MUST resolve **every** current member, not merely the first page the directory returns

> **Why 60 seconds and not "the next submission".** NFR-8 requires caching so a burst does not issue one directory call each; a cache cannot reflect a change inside its own window. The conflict is resolved in favour of a bounded cache rather than left as an unstated compromise between two requirements that cannot both hold.

#### Scenario: Directory unavailable

- GIVEN the Cognito directory call fails or returns no `admin` member
- WHEN a visitor submits the form
- THEN the message is delivered to the configured fallback address
- BUT it must NOT silently discard the message, and must NOT surface the directory failure to the visitor as a technical error
- AND IT MUST record the fallback in the structured log **without any requester field value and without any recipient address**

- **PII/RBAC impact:** Administrator email addresses are read server-side only and MUST NOT reach any response to the `Public` role.

### FR-4: Sender identity and reply routing

- **Description:** Every message this feature sends MUST carry a fixed registry display name in `From`, the requester in `Reply-To`, and a server-generated subject.
- **Rationale / Source:** ATP-42; interim sender decision 2026-08-28 (dedicated address deferred to ATP-58)

#### Scenario: Headers of a sent message

- GIVEN a valid submission
- WHEN the message is dispatched
- THEN `From` carries the fixed registry display name over the verified sender address
- AND `Reply-To` carries the requester's name and email, so a reply reaches the requester and not the registry
- AND the requester's name, organization, category and message appear in the body as data
- BUT it must NOT place requester-supplied text in `From`, `Subject`, or any header other than `Reply-To`, and must NOT allow a newline or header-injection sequence in any submitted field to reach any header
- AND IT MUST compose the `Reply-To` display name safely — RFC 5322 quoting for a name containing `"`, `\`, `<`, `>`, `,`, `;`, `:` or `@`, and RFC 2047 encoding for any non-ASCII name — falling back to the bare address rather than emitting a malformed header
- AND IT MUST keep the existing registration OTP and receipt messages working unchanged

> `Reply-To` is the one header carrying requester-supplied text, by this requirement's own design. That makes it the header whose encoding matters most, unlike the `From` display name, which is a fixed ASCII constant.

### FR-5: Uniform, non-technical failure behaviour

- **Description:** A failure the browser can observe — a mail-transport rejection (`502`), a network error, a `429`, or any other `5xx` — MUST produce one friendly, non-technical error, preserving what the visitor typed.
- **Rationale / Source:** ATP-42

#### Scenario: Submission fails visibly

- GIVEN the request fails in a way the browser can observe
- WHEN the visitor has submitted the form
- THEN the form displays a friendly message inviting a retry shortly
- AND every value the visitor entered remains in the form
- BUT it must NOT expose a provider name, status code, stack trace, exception text, recipient address, or any internal identifier
- AND IT MUST render inline field errors only when the response carries a **non-empty** `details[]`, and a **fixed constant string** in every other case — including a `400` with empty or absent `details` — never the client's `ApiError.message`, which is set to `HTTP <status> <statusText>` and would surface the status code this clause forbids
- AND IT MUST announce the error to assistive technology through a live region rather than only changing colour

> **Restored 2026-08-28 (round 4).** An earlier revision narrowed this clause to exclude transport failures, because fire-and-forget dispatch made the send outcome unknown at response time. `design.md` DD-3 removes that mechanism — the send is awaited — so the original trigger is back and the visitor learns when the message could not be sent. A later bounce after SES accepts remains invisible (DC-8); that is a much narrower gap than "told it was sent when it never was".

### FR-6: Privacy acknowledgement, a resolving link, and no implied consent

- **Description:** The form MUST link a privacy notice and require an explicit acknowledgement before submission, and submitting MUST NOT constitute consent to publish any actor's data.
- **Link target:** **no privacy notice exists in the product today** — there is no `/privacy` route, and the registration `consent-policy` endpoint serves registration-scoped consent text, so linking it would misdescribe what the visitor is agreeing to. This spec creates a minimal static `/privacy` page as the target.

#### Scenario: Acknowledgement gate

- GIVEN a visitor has filled every other field
- WHEN they submit without checking the privacy acknowledgement
- THEN the submission is rejected with a field-level error on that control
- BUT it must NOT be treated as consent for publication of actor information, nor alter any actor's `consentStatus`, `consentMethod`, `consentObtainedAt`, or `consentReference`
- AND IT MUST be enforced server-side, not only by the browser
- AND IT MUST link to a page that actually resolves

### FR-7: No registry mutation

- **Description:** No submission MAY create, update, publish or remove any registry data.

#### Scenario: Submission leaves data untouched

- GIVEN any submission, valid or invalid
- WHEN it is processed
- THEN no `Actor`, `Registration`, `CropsOnActors` or `ActorAuditLog` row is created, modified or deleted
- BUT it must NOT issue any database query — `PrismaService.onModuleInit()` opens a connection at application start regardless, so "no connection" is not a testable clause; "no query" is what DC-4's spy gate can express
- AND IT MUST hold for the throttled, validation-rejected and filled-honeypot paths as well as the successful one

> **Disciplinary, gated by a test — not structural *(corrected 2026-08-28, Judgment Day R3-1)*.** Three earlier revisions claimed a structural guarantee here, each inside the sentence correcting the previous one. `PrismaModule` is declared `@Global()` and its docblock says it exposes `PrismaService` "to every module **without re-importing**", so a provider in `ContactModule` can inject it with no import at all and Nest resolves it. Not importing prevents nothing at runtime. The gate is DC-4's zero-writes test; the missing import is a convention, not a mechanism.

### FR-8: Abuse controls that actually engage

- **Description:** The endpoint MUST carry rate limiting, a honeypot field, server-side length caps, a server-generated subject, DTO validation and input sanitization.

#### Scenario: A filled honeypot

- GIVEN a submission whose honeypot field is populated
- WHEN it is processed
- THEN the response is indistinguishable from an accepted submission
- BUT it must NOT dispatch any message
- AND IT MUST record the rejection in the structured log with no field values
- AND IT MUST be reachable by the handler at all — the honeypot must be a **declared** DTO property, since the global validation pipe strips undeclared properties and would otherwise render the control permanently inert
- AND IT MUST NOT carry a length cap: a cap makes the trap self-identifying, since an over-long value returns a `400` whose `details[].field` names the honeypot and hands an attacker the exact field to leave empty. Any honeypot content, of any length, folds into the accepted response

#### Scenario: Over-limit traffic

- GIVEN a caller exceeding the configured request limit within the window
- WHEN the next request arrives
- THEN it is rejected before the route handler runs
- AND IT MUST be proven by driving real over-limit traffic, not by asserting that a guard is applied

## 4. Non-Functional Requirements

### NFR-1: No personal data escapes the endpoint *(release gate)*

Zero occurrences of any requester field value, any administrator email address, or any `PII_ALLOWLIST` value in any response body, error envelope, redirect target, **or log line** produced by `POST /api/v1/contact`. Asserted against fixture **values**, not key names, end-to-end over HTTP. Registered in `docs/trd/trd.md` §13 as **QA-13**, following QA-12's precedent. Green is a hard release gate.

**Two conditions without which this gate certifies nothing:**

1. **The harness needs a log-capture seam it does not have.** `pii-boundary.spec.ts` is today a response-body scanner containing no log capture whatsoever. A `Logger` spy installed around the request suffices: **the send is awaited** (`design.md` DD-3), so `MailService.dispatch`'s attempt and outcome lines and the service's own error line are all emitted before the response is written.

   > *Amended 2026-08-28 — this clause previously required the spy to be asserted "after the dispatch promise settles, because the mail outcome and `.catch()` lines are emitted after the response is written". That was true only under fire-and-forget dispatch, which DD-3 removed. **Fourth stale artifact of that removal found in this spec**, after the two docblock sentences and the init-time validation decision. Left uncorrected it would have had T-8 build a settle discipline for a race that no longer exists.*
2. **The gate must be shown to fail.** The endpoint returns an empty `202`, so a response scan alone would pass against a stub controller that does nothing. It must be run against a deliberately-leaking variant — specifically a `MessageRejected`-shaped rejection carrying a fixture address through the `.catch()` — and shown to catch it (KZ-002).

> **Why the `.catch()` is named explicitly.** `registrations.service.ts` records that the AWS SDK's `MessageRejected` error puts the destination address verbatim in its `message`, which made a naive `err.message` log the only unbounded-value log call in `backend/src` and a PII leak on a public path. `MailService.dispatch` rethrows unchanged, so that error arrives here too.

### NFR-2: Abuse resistance on an outbound relay

Per-IP rate limiting at **5 requests / 60 s**, set with `@Throttle(...)` at the controller class level over the existing global registration; honeypot; server-side length caps; **a 32 KB request-body cap applied before parsing**; server-generated subject; DTO validation; rejection of header-injection sequences in every submitted field.

*The body cap matters on its own: `configurePayloadCap`'s strict limit is path-scoped to `/registrations`, so without extending it `/contact` would inherit the global 8 MB limit and parse it into Lambda memory before the throttle guard runs — body parsing is Express-level, guards are Nest-level.*

*An earlier revision claimed the limit was "effectively fixed at 20/60 s" because a `ThrottlerGuard` subclass cannot carry a different limit. True of subclassing, irrelevant to the library — `@Throttle()` overrides per controller with no second registration. That false premise had closed off this endpoint's only tunable control.*

**Stated limitation, not inherited silently.** The throttle store is per-container, so the effective cap is *containers × limit*. The registration spec accepted that only because it paired it with a database-backed per-email control. **This spec has no database and therefore no second control.**

**The per-IP premise is evidenced, not assumed.** No `trust proxy` is configured in either bootstrap, so "per-IP" depends on `req.ip` surviving serverless-http. `lambda-handler.e2e.spec.ts` already proves it resolves from `event.requestContext.http.sourceIp` and that a second caller is unaffected by the first's traffic. Had it not, the limit would have been one **shared** bucket per container — a self-DoS rather than a control.

**Consequence bounded by the scope cut.** Recipients are the team's own inboxes, not unverified third parties, so abuse here degrades the team's own mail rather than laundering anonymous content under the programme's identity through the registry's actors.

### NFR-3: Accessibility — WCAG 2.1 AA

Associated labels, `aria-describedby` error association, errors announced through a live region, visible focus, logical tab order, and the new navigation item reachable and correctly stated in both the desktop bar and the mobile drawer.

### NFR-4: Design token compliance

Only semantic token classes from `tailwind.config.ts` / `docs/ux-ui/design.md` §7. No hex, no `rgb()`, no arbitrary Tailwind values. Form sections use the card-treated wrapper with a semantic-only `<fieldset>` per `frontend/CLAUDE.md` — and must not be "fixed" with `float-left w-full`, which that guide records as having broken the `/register` grid while lint, contrast and build all passed.

### NFR-5: Static-export safety

Both new pages build under `output: 'export'`: no SSR, no route handlers, no dynamic path segments. Neither page calls `useSearchParams()`, so neither needs a `<Suspense>` boundary; only the form is a client component. **Gated by a build assertion that `out/contact/index.html` and `out/privacy/index.html` are emitted** — an earlier revision traced this NFR with no mechanism and no gate.

### NFR-6: Analytics restriction

Analytics MAY record only: contact page viewed, category selected, submission started, submission succeeded, submission failed. It MUST NOT record names, email addresses, message or subject content. **No analytics layer exists in `frontend/` and this spec adds none**, so this is satisfied by there being nothing to restrict — stated so an implementer does not introduce one.

### NFR-7: Error envelope consistency

Validation failures use the existing global envelope `{ statusCode, error, message, details: [{ field, message }] }` so the frontend maps `details` to inline field errors through its established path. Throttled requests keep the shape the existing exception filter produces.

### NFR-8: Recipient resolution cost

Resolution MUST be cached per container so a burst does not issue one directory call each. The cache carries a bounded 60-second expiry — note the `ActingAdminResolver` precedent this borrows its shape from has **no TTL**, so the expiry is a deliberate extension, not a copy. A cold resolution MUST NOT block or fail the response path.

## 5. Data & Schema Impact

**None.** No Prisma model, field, index, enum or migration — and, after the scope cut, **no serializer change either**.

| Change | Nature |
|---|---|
| `MailMessage.to` widened to accept multiple recipients | In-memory transport contract, mapped to SES `ToAddresses`. *(Withdrawn in round 3 and restored in round 4: the withdrawal existed because a total rejection was silent under fire-and-forget; `design.md` DD-3 removes that mechanism, so the premise went with it.)* |
| `MailMessage.replyTo` added | In-memory transport contract |
| One new public `MailService` method | Its surface today is exactly `sendVerificationCode` and `sendReceipt`, with `dispatch` private — there is no way to send a pre-rendered message |
| Inquiry persistence | **Deliberately absent** |
| `contactable` on the public actor projection | **Removed with the actor channel** — no longer part of this spec |

No new PII field is introduced; `PII_ALLOWLIST` is unchanged. **No actor data is read on this path at all.**

## 6. Out of Scope

- The entire actor contact channel (ATP-28), and with it `contactable`, the actor eligibility rule, and the enumeration-oracle requirements that existed only to protect it
- `Inquiry` model, migration, status lifecycle, assignment, internal notes
- Administrative inbox or triage UI; reference numbers and status lookup
- Configurable routing rules; configurable category catalogue; category-dependent fields
- Attachments, file validation, malware scanning
- Bounce handling and delivery confirmation
- Dedicated sender domain/address and its SPF/DKIM/DMARC records — **ATP-58**
- `staff` as recipients

## 7. Dependencies & Assumptions

| # | Item | State |
|---|---|---|
| D-1 | Existing verified SES sender identity | Assumed to remain verified; this spec adds only a display name, which needs no separate verification |
| D-2 | Cognito `admin` group is populated | If empty, FR-3's fallback applies |
| D-3 | Existing mail transport, throttle guard and exception filter | Reused. The throttler's existing **global** registration is inherited — a second one would silently contend with the live registration path |
| D-4 | Lambda IAM grant for `cognito-idp:ListUsersInGroup` | **Confirmed absent.** `infra/20-backend/template.yaml` grants eleven `cognito-idp:*` actions action-by-action with no wildcard, and this is not one. One action is added. A missing grant fails at **runtime, not deploy** |
| ~~D-5~~ | ~~`callbackWaitsForEmptyEventLoop` in `lambda.ts`~~ | **Withdrawn 2026-08-28 (round 4).** This was a dependency only while dispatch was fire-and-forget. `design.md` DD-3 awaits the send, so the flag no longer governs delivery |
| A-1 | Administrators answer contact mail from their own inboxes | The entire no-persistence design rests on this |

**SES production access is a live dependency — an earlier revision claimed otherwise and was wrong.** `infra/20-backend/template.yaml` states in-tree that "the account is still in the SES **sandbox**, so this can only deliver to other verified addresses". Adding a user to a Cognito group performs no SES verification, so FR-3's live resolution can introduce unverified recipients at any time with no operator action. `design.md` §7.2 records the interaction and its three mitigations: per-recipient sends (DD-6, so one bad address costs one recipient), an admin-onboarding verification step, and production access as the only real fix. **This is D-6.**

All AWS commands use `--profile IBD-DEV`.

## 8. Defect Classes And The Gate For Each

| # | Defect class | Gate |
|---|---|---|
| DC-1 | A requester value or an administrator address leaks through a response, error, or log | The extended `pii-boundary.spec.ts` with its log-capture seam, asserting fixture **values** (NFR-1). Automated, release gate |
| DC-2 | Recipients go stale — a removed admin still receives mail, or a new one does not | Unit tests over the resolver with mutated membership, **asserting the cache semantics** (a second call inside the window issues no SDK call; one after it does) and that pagination exhausts. Automated |
| DC-3 | Header injection, or a malformed `Reply-To` from an exotic name | Unit tests driving newline, quote, angle-bracket, comma and non-ASCII names through the reply-to utility. Automated |
| DC-4 | A submission mutates registry data | **An e2e compiling `AppModule` with `.overrideProvider(PrismaService)` — following `pii-boundary.spec.ts` — whose override models Prisma's delegate shape and asserts zero queries** across success, validation-failure, honeypot and throttled paths, **shown to fail against a variant that writes**. Automated. *(Composition matters: against a standalone `ContactModule`, `PrismaService` is absent from the graph and the override is a silent no-op that passes unconditionally.)* |
| DC-5 | Throttle or honeypot present but inert | **Presence is not proof (KZ-002).** Real over-limit traffic asserted to be rejected before the handler; a filled honeypot asserted to produce the accepted response **and zero dispatches** |
| DC-6 | Token violations — a hardcoded colour or arbitrary value | Grep for hex, `rgb(` and `-[` across the new components, plus lint. Automated |
| DC-7 | Accessibility regressions in structure — unlabeled control, unassociated error, unreachable nav item | `jest-axe`. Automated for **structure only** |
| DC-8 | **Delivery failure after SES accepts** | **Unmeasurable here, accepted as risk.** Nothing is persisted, so a bounce surfaces only in the sender mailbox. Lower exposure than the descoped actor channel — administrator addresses are current and internal |
| DC-9 | **Layout and navigation density of the rendered surfaces** | **No automated gate exists** for layout: jsdom cannot measure it. **Substitute:** a rendered capture at 375 / 768 / 1440 reviewed at the HITL pause, plus the nav-density check. Not counted as verified by any test run |
| DC-10 | **Colour contrast** | **Automated.** `jest-axe`'s contrast rule is skipped under jsdom, but `docs/trd/trd.md` QA-11 records that contrast is enforced by a computed-ratio assertion over the token palette in `frontend/lib/contrast.test.ts`. That covers every token pair these components use; this spec introduces no new combination |
| DC-11 | The privacy link points nowhere | Frontend test asserting the link resolves to a page that exists — the failure FR-6 was written against |

## 9. Open Questions

| # | Question | Working default |
|---|---|---|
| OQ-1 | Who monitors the interim sender mailbox? DC-8's tolerability leans on someone reading bounces | Confirm with the mailbox owner, or drop the claim |
| OQ-2 | Does the nav survive a seventh entry at `md`–`lg`? | Verified by rendered capture; returns to the owner if it crowds |

## 10. Requirement ID Index

| ID | Title |
|---|---|
| FR-1 | Public contact page and navigation entry |
| FR-2 | Contact submission |
| FR-3 | Recipients resolved from Cognito, never configured |
| FR-4 | Sender identity and reply routing |
| FR-5 | Uniform, non-technical failure behaviour |
| FR-6 | Privacy acknowledgement, a resolving link, and no implied consent |
| FR-7 | No registry mutation |
| FR-8 | Abuse controls that actually engage |
| NFR-1 | No personal data escapes the endpoint *(release gate)* |
| NFR-2 | Abuse resistance on an outbound relay |
| NFR-3 | Accessibility — WCAG 2.1 AA |
| NFR-4 | Design token compliance |
| NFR-5 | Static-export safety |
| NFR-6 | Analytics restriction |
| NFR-7 | Error envelope consistency |
| NFR-8 | Recipient resolution cost |
