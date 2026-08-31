# Design — General contact form

- Spec path: `docs/specs/contact/contact-channels/`
- Status: Draft — **revision 6**, simplification after Judgment Day escalated at round 4
- Traces requirements: FR-1…FR-8, NFR-1…NFR-8 from this spec's `requirements.md`
- Author / Date: AKILI (System Architect) — 2026-08-28

> **Why this revision is shorter than the last one.** Four review rounds each found real defects, and most of the late ones were introduced by the previous round's fixes. The through-line: **fire-and-forget dispatch**, introduced in revision 3 to close an enumeration *timing* oracle on the actor endpoint. **That oracle left with the actor channel.** The mechanism stayed, bought only latency, and became the root cause of the `pendingDispatch` seam, the drain discipline, an invisible FR-7 gate, a racing structural gate, a swallowed configuration error, and FR-5's narrowing. Revision 6 removes it. Seven findings dissolve rather than getting seven patches. `judgment.md` holds the full record.

## 1. Approach Overview

`ContactModule` exposes one public, unauthenticated endpoint. It validates a DTO, resolves recipients, renders one message, **awaits the send**, and responds.

The module declares no data dependency. That does not make FR-7 structural — `PrismaModule` is `@Global()`, so `PrismaService` stays injectable without an import, and the missing import is a convention. **FR-7's gate is the DC-4 zero-writes test** (§10), and with a synchronous send every code path the request touches runs before the response, so that test can actually see a violation.

```
Browser ──► POST /api/v1/contact ──► ContactController ──► ContactService
                                                              ├─ AdminRecipientResolver (Cognito, 60s cache, paginated, fallback)
                                                              ├─ render one MailMessage
                                                              └─ await MailService.sendContactMessage(...)  ──► SES
                                                                        │
                                                              202 on success · 502 on send failure
```

**Latency, stated plainly.** The response now includes a cached Cognito lookup (a network call only on a cold container or after the 60 s TTL) and one SES call. A few hundred milliseconds on a contact-form submit. That is the price of the simplification, and it buys back an error the visitor can actually see.

## 2. Contract Changes

| Contract | Change |
|---|---|
| `MailMessage.to` | `string` → **`string \| string[]`**, mapped to SES `ToAddresses` |
| `MailMessage.replyTo` | **added**, optional — a composed, encoded `Display Name <addr>` (§4.5) |
| `MailService` | one new public method `sendContactMessage(message: MailMessage): Promise<void>` — the surface today is exactly `sendVerificationCode` and `sendReceipt`, with `dispatch` private |

**No Prisma model, field, index, enum or migration. No serializer change.**

> **On `to` widening — reversed twice, and why it lands here.** Revision 4 widened it. Revision 5 reversed to one send per recipient, because in the SES sandbox a single message is rejected *entirely* if any destination is unverified, and under fire-and-forget that failure was **silent**. Awaiting the send removes the silence: a total rejection now surfaces as an error the visitor sees and the team notices. With visibility restored, one call is better than N — see DD-3.

## 3. API Surface

| Method & path | Auth | Responses |
|---|---|---|
| `POST /api/v1/contact` | Public | `202` accepted · `400` validation envelope with `details[]` · `429` throttled · **`502` transport rejection** (upstream), friendly envelope, no provider detail · **`500` missing fallback configuration** (ours) — see §4.3 amendment 3 |

**No enumeration concern exists on this endpoint.** It reads no registry state, so neither status nor timing can disclose anything about actors. The uniform-`202` machinery of earlier revisions protected a surface that left with the actor channel; only the honeypot needs indistinguishability, and it gets it in §4.4.

## 4. Backend Design

### 4.1 Module layout

`backend/src/contact/`, registered in `app.module.ts`.

| File | Responsibility |
|---|---|
| `contact.module.ts` | Imports `LoggingModule`, `MailModule` (a plain `@Module`, so the import is simply required); lists the library `ThrottlerGuard` in `providers`; applies `RequestContextMiddleware` via `forRoutes(ContactController)`. **Does not call `ThrottlerModule.forRoot()`** (§4.2) |
| `contact.controller.ts` | `POST /contact`, class-level `ThrottlerGuard` + `ThrottlerExceptionFilter` (imported in place from `registrations/`; promoting it to `common/` would touch the live registration path and belongs to a later spec) + `@Throttle(...)` |
| `contact.service.ts` | Resolve → render → **await** send → return |
| `admin-recipient.resolver.ts` | Cognito `admin` group → emails; 60 s cache; pagination; fallback |
| `dto/contact-create.dto.ts` | §4.1.1 |
| `contact-categories.ts` | The eight categories — enumerated in `requirements.md` FR-2, which is authoritative — plus length constants |
| `reply-to.util.ts` | RFC-safe display-name composition (§4.5) |

### 4.1.1 The DTO

| Property | Validation |
|---|---|
| `name` | required, `@IsString()` **`@MinLength(1)`** `@MaxLength(200)` |
| `email` | required, valid email, `@MaxLength(254)` — RFC 5321 §4.5.3.1.3 caps a forward path at 256 octets **including** angle brackets, so 254 usable. *(Revision 5 said "320, RFC 5321's maximum"; 320 is the 64+1+255 folk sum the RFC does not state.)* |
| `organization` | optional, string, `@MaxLength(200)` |
| `category` | required, one of the eight |
| `subject` | required, `@IsString()` **`@MinLength(1)`** `@MaxLength(200)` |
| `message` | required, `@IsString()` **`@MinLength(1)`** `@MaxLength(4000)` |
| `privacyAcknowledged` | required, `@IsBoolean()` **plus an equals-true rule** — a bare `@IsBoolean()` accepts `false`, which would let FR-6's gate pass unchecked |
| `website` *(the honeypot)* | `@IsOptional() @IsString()` **and nothing else** |

> **Amended 2026-08-28 after a T-4 Reviewer FAIL.** The `name`, `subject` and `message` rows previously read "required, string, `@MaxLength(...)`". That mixes prose with decorator names and never says how "required" is *encoded*, so a literal reading yields `@IsString() @MaxLength(...)` — which **accepts the empty string**. The other required rows exclude `""` incidentally, through `@IsEmail`, `@IsIn` and `@Equals(true)`; these three had nothing enforcing it, and `{ name: "", subject: "", message: "" }` would have been accepted and relayed to every administrator as an empty message.
>
> `@MinLength(1)` is this repo's established idiom for a required string — `@IsNotEmpty` appears **nowhere** in `backend/src`, while `registration-create.dto.ts` applies `@MinLength(1)` consistently on `traderName`, `contactPerson` and `policyVersion`, and deliberately omits it on optional strings such as `position` and `district`. `organization` and the honeypot stay without it: on an optional field `""` means "not provided", and adding one to the honeypot would re-create the self-identifying trap FR-8 forbids.

**The honeypot needs decorators, not just a declaration.** `whitelist: true` strips every property carrying **no validation metadata**, so a bare TypeScript field is removed exactly as an undeclared one is. `@IsOptional() @IsString()` is the minimum that survives.

**And no length cap on it** — a cap makes the trap self-identifying, since an over-long value returns `400` naming the field. The bound comes from the request body instead: **`configurePayloadCap` is extended to `/api/v1/contact`** (today it is path-scoped to `/registrations`, so `/contact` would inherit the global 8 MB limit and parse it into Lambda memory *before* the throttle guard runs — body parsing is Express-level, guards are Nest-level). A 32 KB request cap bounds every field at once and removes the honeypot question entirely.

> **Residual, stated rather than claimed closed.** Every other field carries a cap, so probing one over-long value per field yields `400` for the six real fields and acceptance for the honeypot — the same one-bit answer by the complementary probe. A DOM-visible honeypot is inherently discoverable; this is accepted, not solved.
>
> **A second residual, same paragraph, recorded rather than left unstated.** The honeypot branch returns **before** recipient resolution and dispatch, so a filled honeypot answers in roughly a millisecond where a real submission takes hundreds. FR-8 requires only that the *response* be indistinguishable, and §3 retired the uniform-timing machinery along with the actor channel — so this conforms. It is booked here so the timing signal is a known accepted cost rather than an undiscovered one.

### 4.2 Constants and rate limiting

| Constant | Value |
|---|---|
| Throttle | **5 requests / 60 s per IP**, via `@Throttle({ default: { limit: 5, ttl: 60_000 } })` at controller class level |
| Length caps | message 4,000 · subject / name / organization 200 · email 254 |
| Request body cap | **32 KB** (`configurePayloadCap` extended) |
| Recipient cache TTL | 60 s |
| `From` display name | `ACCELERATE Tanzania Seed Registry`; if `MAIL_SENDER_ADDRESS` already contains `<`, it is used verbatim |

`RegistrationsModule` holds the sole `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }])`, and `ThrottlerModule` is `@Global()`, so a second registration would create competing global tokens resolved by module order — a silent failure on a live, release-gated limit. `ContactModule` does not register it; `@Throttle` overrides per controller instead.

> **Two verification duties for the implementer.** `backend/node_modules` is absent from this checkout, so the decorator was not confirmed against the installed package — `package-lock.json` resolves `@nestjs/throttler` to **6.5.0**, whose documented API includes it, and `registrations-throttle.guard.ts` already records that `ttl` is milliseconds "the unit v6 expects". Also: `@Throttle({ **default**: … })` overrides the `forRoot` entry only because an unnamed entry is auto-named `default`. §10 asserts 5/60 s is what actually applies, so a wrong assumption fails loudly — but confirm both before relying on them. If the decorator is unavailable, accept 20/60 s and record that as a deliberate acceptance.

**No 50-recipient cap.** Revision 5 added one citing SES's per-message destination limit, then reversed to per-recipient sends in the same revision, leaving a rule whose premise was gone and whose truncation contradicted FR-3's "resolve **every** current member". One message with multiple destinations restores the premise — and 50 admins is not a reachable state, so the resolver logs and **fails loudly** rather than silently truncating if it ever is.

### 4.3 Recipient resolution *(FR-3, NFR-8)*

`AdminRecipientResolver` issues `ListUsersInGroupCommand` against the `admin` group, **looping on `NextToken` until exhausted**, projects `email`, and caches per container behind a 60 s TTL. Order: cache hit → live group → fallback.

A directory failure degrades to the fallback and logs the degradation with **no requester field value and no recipient address**. `staff` is excluded by construction.

**`CONTACT_FALLBACK_RECIPIENT` is resolved lazily, at first use** — following `getSesMailConfig()`, and matching the same pattern in `auth/auth.config.ts` and `users/cognito-admin.client.ts`. *(The `ActingAdminResolver` precedent this borrows its cache shape from carries **no TTL**; the bounded expiry here is a deliberate extension.)*

> **Amended 2026-08-28 after T-6 surfaced a 12-suite regression. This reverses revision 6's own instruction, and the reason is that the instruction's justification had already been retired.**
>
> Revision 6 required validation at **module initialization**, arguing: *"Revision 5 specified a lazy throw following `getSesMailConfig()`; **under fire-and-forget** that landed inside a swallowed continuation."* **DD-3 removed fire-and-forget in the same revision.** The send is awaited, so a lazy throw is no longer swallowed — it propagates to the controller and becomes the visible `502` FR-5 mandates. The justification was void the moment it was written, and it went unnoticed through a Reviewer PASS. *(T-5's Reviewer flagged the same stale premise surviving in the resolver's docblock; that was the smoke, and the Leader treated it as a comment fix rather than as evidence the decision itself was unfounded.)*
>
> **What init-time validation actually cost.** `ContactModule` is registered in `AppModule`, so an `onModuleInit` throw fires in **every** test graph and every boot that includes `AppModule` — **twelve pre-existing e2e suites failed, including the `pii-boundary.spec.ts` release gate and `lambda-handler.e2e.spec.ts`.** In production it means a contact-form environment variable can prevent the entire API from booting: actors, map, registrations, everything. That blast radius was never weighed, because the decision was inherited rather than re-derived.
>
> **The repo already settled this.** `mail.config.ts` documents the pattern across three config modules: *"Resolved lazily … not at module init, **so a checkout without `MAIL_TRANSPORT` set can still boot and serve every other route**."* A bespoke exception whose reason no longer holds is worse than consistency with four existing modules.
>
> **What is given up, stated plainly:** a missing variable is no longer caught at deploy time. It surfaces the first time the fallback path is exercised — which is a rare path. That loss is accepted because T-11 puts the variable in the SAM template's `Environment` block, so it is version-controlled rather than runtime-asserted, which is the same protection every other config value in this codebase relies on.

### 4.4 Honeypot behaviour *(FR-8)*

A filled honeypot returns the **same `202` as a successful submission**, dispatches nothing, and logs the rejection kind with no field values. `grep -rin honeypot backend/` returns nothing, so this is designed, not copied.

With a synchronous send, the test asserts both halves directly — response and dispatch count — with no drain seam, no shared promise, and no ordering discipline.

### 4.5 Message construction and header safety *(FR-4)*

One template under `mail/templates/` following `buildReceiptMessage`'s shape: server-generated subject, and a body carrying the requester's name, organization, category, subject and message as data.

**A provenance line is mandatory.** The body opens with a fixed statement that the message was submitted through the public contact form by a visitor whose identity has not been verified, and renders the requester's address as body data. This is the only control that touches *content* rather than automation (§6).

**`Reply-To` is the one header carrying attacker-supplied text.** `reply-to.util.ts` composes `Display Name <address>` and must strip CR/LF from every **single-line** field; RFC 5322 `quoted-string`-escape a name containing `"`, `\`, `<`, `>`, `,`, `;`, `:` or `@`; RFC 2047 encode any non-ASCII name, **splitting into multiple encoded words** so no word exceeds 75 octets, **joined by a single space**; and fall back to the bare address rather than emit a malformed header.

> **Two amendments, 2026-08-28 — each corrects a premise this section had wrong, and each was surfaced by an Implementer who escalated instead of deciding alone.**
>
> **1. No `CRLF SP` folding. Join encoded words with a single space.** This section previously required "no line exceeds 998", which assumed *we* assemble the header line. **We do not.** The transport calls SES's `SendEmail` — a structured API — passing the composed value as `ReplyToAddresses: [...]`, a logical field. **SES builds the MIME header itself.** A literal `\r\n ` fold inside that value puts a raw-header artifact into a field SES never asked to receive one in — the shape address-list parameter validators commonly reject as containing control characters. The SDK's own `Source` documentation requires encoded-word syntax for a non-ASCII friendly name and says nothing about folding, consistent with `buildSource()` never folding either.
>
> **Amendment 3, 2026-08-28 — the `502` claim in amendment 1's neighbourhood was wrong, and both Reviewers caught it independently.** §4.3 asserted that a lazy `getFallback()` throw "propagates to the controller and becomes the visible `502` FR-5 mandates". It does not: `ContactService` calls `resolve()` **outside** its `try`, so a missing `CONTACT_FALLBACK_RECIPIENT` escapes as a plain `Error` and Nest renders **`500`**.
>
> **The code is right and the document was wrong.** A missing environment variable is *our* misconfiguration, not an upstream gateway failure — `500 Internal Server Error` is the accurate status; `502 Bad Gateway` would mislabel it. Moving `resolve()` inside the `try` would have made the sentence true at the cost of making the status wrong. **§3's response set is therefore: `202` · `400` · `429` · `502` for a transport rejection (upstream) · `500` for a missing fallback configuration (ours).** FR-5 is satisfied either way — its clause reads "a mail-transport rejection (`502`), a network error, a `429`, or any other `5xx`" — and the `500` body carries no detail.
>
> *This is the third time in this spec a docblock or design sentence asserted a downstream behaviour the downstream file did not implement (see also the fire-and-forget premise, twice). The resolver's own docblock repeats the `502` claim and is carried to T-7 as a correction.*

> A single space still satisfies RFC 2047 §5's separation requirement, and §6.2 still has decoders discard whitespace between *adjacent* encoded words, so the text reconstructs exactly. Line wrapping becomes SES's job, which is where it belonged. **The 998-octet clause is withdrawn** — it was never ours to enforce.
>
> **2. CR/LF stripping covers single-line fields only; `message` keeps its newlines.** This previously said "every field". The stripping exists for **header safety**, and `message` is rendered into `Message.Body.Text.Data`, where a newline is a newline and no header can be injected. Stripping it flattened multi-paragraph submissions into one unreadable line in the administrators' inboxes — a real cost for no security benefit. The visitor-submitted `subject` **is** still stripped: the server generates the real `Subject` header, but that value renders as a single-line label in the body.

### 4.6 Mail transport

`MailMessage` gains `replyTo` and widens `to`. `SesMailTransport` maps `to` to `ToAddresses` (string or array), passes `ReplyToAddresses` when present, and sends the display-name `Source`. `MailService` gains `sendContactMessage`, which **rejects on transport failure** — `dispatch` already rethrows unchanged, and the service now awaits it, so a rejection reaches the controller and becomes the `502`.

**The no-op transport needs no change.** It reads only `message.reference`, and `RecordedSend` never carries `to` — which is why §10 asserts dispatches through a `MailService` override rather than `getRecordedSends()`.

The verification-code and receipt paths are unchanged; their tests plus `ses-mail.transport.spec.ts` (which asserts the exact `Source` and **will fail deliberately**) are the regression guard.

## 5. Frontend Design

### 5.1 Contact form

`frontend/components/contact/ContactForm.tsx` — a client component. Values preserved across a failed submit; success and error announced through an `aria-live` region; a visually hidden honeypot outside the tab order.

`frontend/lib/api/contact.ts` — one typed caller passing **`expectEmpty: true`**, since `apiFetch` ends in `response.json()` and a `202` with an empty body would otherwise throw on the **success** path.

**Error rule, partitioned on `details[]` rather than on status:**

- a `400` carrying a **non-empty** `details[]` renders inline field errors;
- **every other outcome** — a `400` with empty or absent `details`, `429`, `502`, a network rejection — renders **one fixed constant string**, never `ApiError.message`.

The status-based partition of revision 5 left a hole: `BodyShapeValidationPipe` throws a `400` with `details: []`, and `apiFetch` produces a `400` with `details` undefined when the body is not JSON. Both would have rendered nothing, or fallen through to `apiFetch`'s `message` — which is `HTTP <status> <statusText>`, exactly the status code FR-5 forbids exposing.

**Tokens (NFR-4):** only semantic token classes from `docs/ux-ui/design.md` §7. No hex, no `rgb()`, no arbitrary values. Card-treated wrapper with a semantic-only `<fieldset>` (`border-0 p-0 m-0`) — **not** "fixed" with `float-left w-full`, which `frontend/CLAUDE.md` records as having broken the `/register` grid while lint, contrast and build all passed.

**Analytics (NFR-6):** no analytics layer exists in `frontend/`; none is added.

### 5.2 Pages and entry points

`app/(public)/contact/page.tsx` and `app/(public)/privacy/page.tsx`. **Both static** — neither calls `useSearchParams()`, so neither needs a `<Suspense>` boundary; only the form is a client component. `next.config.mjs` sets `output: 'export'` and `trailingSlash: true`, so §10 asserts `out/contact/index.html` and `out/privacy/index.html`.

The privacy page states what submissions collect, who receives them, that messages are relayed by email and not stored, and that submission is not consent to publish anything. It is FR-6's link target and **does not exist today**.

**Navigation.** *(Rewritten 2026-08-31 after DC-9 failed and was fixed — this paragraph described the pre-fix bar.)* `NAV_LINKS` holds **six** entries: Discovery Map, Dashboard, Directory, About, Contact, and the primary-variant Register your organisation. `AuthSlot` is a sibling outside the array. There is **no `Home` entry** — the brand lockup is itself the link to `/`.

The desktop bar renders from **`lg`**, not `md`; 768–1023 uses the hamburger. This is not a preference: measured in a real browser, the row's min-content width was **1270px** against a container ceiling of **1216px** (`max-w-7xl`, which never grows with the viewport), so the bar overflowed at **every** width ≥768. Removing `Home` and the brand descriptor and raising the breakpoint leaves 41px of slack at 1024 and 201px at 1280+. See `execution.md`, T-10 DC-9 closure.

`Header.tsx` maps `NAV_LINKS` into **both** the desktop `<nav>` and the mobile drawer, so FR-1's hamburger clause holds by adding one entry — provided no second, divergent list appears. §10 asserts both renderings.

Footer, About and home link `/contact`; the footer also links `/privacy`.

### 5.3 `RestrictedContactPanel` gains a link

Its closing sentence — *"…please contact the ACCELERATE Tanzania programme team"* — is a dead end today. It now links `/contact`.

## 6. Security & RBAC

| Concern | Handling |
|---|---|
| Roles | `Public` only, deliberately, documented in the controller docblock |
| Administrator addresses | Resolved server-side, never returned to a caller, never logged |
| Actor PII | Not read on this path |
| Header injection | CR/LF stripped; subject server-generated; requester name never in `From`; `Reply-To` via `reply-to.util.ts` |
| Rate limiting | 5/60 s per IP per container — with DD-4's stated limitation |
| Request size | 32 KB before parsing (§4.1.1) |
| **Content abuse** | **A residual, not "gone".** An unauthenticated party's text arrives under the registry's display name, with a `Reply-To` they chose, in the inboxes of every `admin`-group member — the platform's highest-privilege users. Third-party laundering left with ATP-28; this did not. Mitigated by §4.5's provenance line; the residue is accepted |
| Error logging | `err.name` only, never `err.message` — the AWS SDK's `MessageRejected` puts the destination address verbatim in `message`, a leak this codebase already shipped once and reworked |

## 7. Infrastructure, Deployment, And SES

### 7.1 IaC edits

1. Add `cognito-idp:ListUsersInGroup` to the existing statement in `infra/20-backend/template.yaml` — that template grants eleven `cognito-idp:*` actions action-by-action with no wildcard and this is not among them. **Missing grants fail at runtime, not deploy.**
2. Add `CONTACT_FALLBACK_RECIPIENT` to the `Environment` block.

Validated with `./infra/scripts/validate.sh`; all commands use `--profile IBD-DEV`.

### 7.2 The SES sandbox is a live dependency

`infra/20-backend/template.yaml` states in-tree: *"the account is still in the SES sandbox, so this can only deliver to other verified addresses."*

| Fact | Consequence here |
|---|---|
| Sandbox delivers only to verified identities | An admin whose address is not separately verified receives nothing |
| FR-3 resolves recipients **live from Cognito** | Adding a user to a group verifies nothing in SES — unverified recipients can appear with no operator action |
| One message with multiple destinations | SES rejects it **entirely** if any destination is unverified |
| **Sandbox quota: 200 recipients / 24 h, 1 message / second — account-wide** | **Shared with the live registration OTP path.** Contact traffic can starve OTP delivery. This is not "the team's own inboxes"; the blast radius reaches applicants |

**Awaiting the send is what makes this tolerable.** A total rejection is now a `502` the visitor sees and the team hears about within minutes, rather than one `MessageRejected` line in CloudWatch behind a `202`. It does not make the failure acceptable — it makes it loud.

**OD-1 remains the real fix.** Production access removes per-address verification, raises the rate to 14+/second and the quota to 50,000/day, and dissolves the OTP-starvation interaction entirely.

## 8. Documentation Edits

| Document | Edit |
|---|---|
| `docs/trd/trd.md` §4 | Add `POST /api/v1/contact` |
| `docs/trd/trd.md` §13 | Register **QA-13** as a release gate, matching QA-12's wording |
| `docs/ux-ui/design.md` §2 | Add `/contact` and `/privacy`; **fix `/directory/[id]` → `/profile?id=`** |
| `docs/ux-ui/design.md` §4 | Add Contact and Privacy rows |
| `docs/ux-ui/design.md` §5 | Update the nav model — already stale on Dashboard and About |

## 9. Decision Records

**DD-1 — a stateless relay, not case management.** Rejected full case management and a minimal audit row: a table nobody reads carries migration and retention obligations while answering no question anyone asked. Residual: `RequestContextMiddleware` logs `route` as `req.path`, so CloudWatch records that `/api/v1/contact` was called — with no path parameter, nothing identifying.

**DD-2 — recipients from Cognito, configuration only as fallback.** Membership changes take effect within the 60 s TTL. Depends on an IAM action currently absent (§7.1) and on SES identity verification (§7.2).

### DD-3 (supersedes revisions 3–5): the send is awaited, in one message

- **Context.** Fire-and-forget entered in revision 3 to close an enumeration *timing* oracle on the actor endpoint. That endpoint was cut. The mechanism remained and produced six review findings: an unbuildable drain seam, a gate blind to its own violation, a racing structural gate, a drain rule applied to two rows of five, a swallowed configuration error, and FR-5 narrowed away from its own trigger.
- **Decision.** Await the send. One message with every recipient in `ToAddresses`.
- **Why one message, having reversed to N in revision 5.** That reversal existed to stop a total rejection from being **silent**. Awaiting removes the silence, so the premise is gone. One call halves nothing on quota — SES counts *recipients* — but it avoids N sequential calls against the sandbox's 1/second rate, avoids N-second latency on a form submit, and avoids composing N promises with N `.catch()` handlers, which was itself an unresolved defect.
- **Consequences.** A visitor learns when the message could not be sent (FR-5 regains its trigger). An unverified recipient fails the whole send — now loudly, and §7.2's operational step plus OD-1 are the answer. Latency includes one cached Cognito lookup and one SES call. **Six review findings dissolve instead of being patched.**

**DD-4 — one rate-limit layer, per-route limit.** Reuses the single global registration with a `@Throttle` override (§4.2), and records that the second, database-backed control `registrations` relies on **does not exist here**. The per-IP premise is evidenced: `lambda-handler.e2e.spec.ts` proves `req.ip` resolves from `event.requestContext.http.sourceIp`.

**DD-5 — `Source` carries a display name** *(reversion challenge)*. Changes already-delivered behaviour on the shared transport. `ses-mail.transport.spec.ts` asserts the exact value and will fail — updated deliberately, not loosened. Double-wrapping handled per §4.2. SES verifies the address, not the display name, so no new verification and no IAM change. **The display name raises the trust signal on an envelope carrying unverified anonymous content**, which is why §4.5's provenance line is mandatory.

## 10. Test Plan

No drain seams, no ordering discipline, no ⟳ markers — every code path the request touches now runs before the response.

| Layer | Coverage |
|---|---|
| Unit — resolver | Membership change reflected after the TTL; **cache semantics** (a second call inside 60 s issues no SDK call, one after does); pagination exhausts `NextToken`; empty group and directory error fall back; `staff` never included; **an unset fallback throws at first use, and `AppModule` still boots without it** (DC-2) |
| Unit — `reply-to.util.ts` | The **full §4.5 character set** — `"`, `\`, `<`, `>`, `,`, `;`, `:`, `@`, newline, non-ASCII — plus a 200-character non-ASCII name asserting encoded-word splitting, a single-space join, **no `\r`/`\n` anywhere in the output**, and that it does **not** fall back to the bare address (DC-3) |
| Unit — template | `replyTo` present; subject server-generated; CR/LF stripped; **provenance line present** |
| E2E — `contact.e2e.spec.ts` | Valid submit reaches every resolved admin; off-list category rejected server-side; **unchecked `privacyAcknowledged` returns `400` with `details[].field` naming it**; missing and over-long fields rejected; over-cap request body rejected before parsing; **transport rejection returns `502` with no provider detail** |
| E2E — honeypot | Filled honeypot returns the identical `202` **and zero dispatches**; an over-long honeypot also returns `202`, never a `400` naming the field |
| E2E — throttle | Real over-limit traffic rejected **before the handler runs**, at **5/60 s** — asserting the 6th request is `429` and the dispatch count stayed at 5. **And `registrations-throttle.e2e.spec.ts` still observes its own 20/60 s** |
| **E2E — DC-4 zero-writes** | FR-7's gate. **Compiles `AppModule` and calls `.overrideProvider(PrismaService)`, following `pii-boundary.spec.ts`** — not a standalone `ContactModule`, where `PrismaService` is absent from the graph and the override is a silent no-op that passes unconditionally. The override models Prisma's **delegate shape** (`prisma.actor.create`), not flat methods. Asserts zero queries across success, validation-failure, honeypot and throttled paths, and is **shown to fail** against a variant that writes |
| **`pii-boundary.spec.ts` extension** | **Release gate.** Requires a **log-capture seam** — that 1,413-line suite has zero occurrences of "log" today — and must be **shown to fail** against a `MessageRejected`-shaped rejection carrying a fixture address (NFR-1, KZ-002) |
| Dispatch assertion seam | A `MailService` provider override asserting the exact `MailMessage` — recipients, `replyTo`, subject, body |
| Frontend | Renders and submits; a `400` with non-empty `details[]` maps to inline errors; **a `400` with empty `details`, a `502` and a network rejection each render the fixed constant, never `ApiError.message`**; values preserved; announcements; privacy link resolves (DC-11); Contact renders in **both** the desktop bar and the open mobile drawer; `jest-axe` (DC-7) |
| Frontend build | `next build` under `output: 'export'` emits `out/contact/index.html` and `out/privacy/index.html` (NFR-5) |
| Token compliance (DC-6) | Grep for hex, `rgb(` and `-[` across the new components, plus lint |
| `lambda-handler.e2e.spec.ts` · `ses-mail.transport.spec.ts` | Stay green — the first is the only harness exercising the real serverless-http body-parsing path; the second is the deliberate `Source` update |
| Contrast (DC-10) | `frontend/lib/contrast.test.ts`'s computed-ratio assertion, per TRD QA-11. No new token combination |
| **Not automated** | Layout at 375 / 768 / 1440 and nav density — HITL capture (DC-9) |

## 11. Owner Decisions

| # | Decision | Recommendation |
|---|---|---|
| **OD-1** | **SES: request production access, or verify each admin address operationally?** (§7.2) | **Request production access.** Per-address verification must fire on every admin onboarding forever, and it does not touch the quota interaction with the OTP path at all |
| **OD-2** | Who monitors the sender mailbox? `MAIL_SENDER_ADDRESS` is today an individual's mailbox, `j.cadavid@cgiar.org` | Confirm with the mailbox owner, or drop the claim from R-2 |
| **OD-3** | ~~Does the nav survive a seventh entry at `md`–`lg`?~~ | **Closed 2026-08-31: no.** It did not survive the *sixth* either — the row was already 1270px against a 1216px ceiling before Contact was added. Resolved by dropping `Home` and the brand descriptor and moving the bar to `lg` |

## 12. Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Shared transport edit touches the live OTP path | Existing mail tests plus `ses-mail.transport.spec.ts` are the regression guard |
| R-2 | Non-delivery after SES accepts (a later bounce) | Unsolved — nothing is persisted, so a bounce surfaces only in the sender mailbox (OD-2). **Much narrower than before:** a synchronous rejection is now visible |
| R-3 | Abuse volume | 5/60 s per IP, per container. Recipients are the team's inboxes — but see R-4 |
| R-4 | **SES sandbox quota is account-wide and shared with the registration OTP path** | §7.2. Contact traffic can starve OTP delivery for applicants. Only OD-1 removes it |
| R-5 | Content abuse under the registry's identity | §4.5's provenance line; residue accepted (§6) |
| R-6 | IAM grant confirmed absent | §7.1's named edit |
| R-7 | Nav crowding at `md`–`lg` | **Materialised.** The capture showed a page-level horizontal scrollbar at 768; escalated to the owner per T-10's instruction and resolved by an IA change, not by shortening a label |
| R-8 | Added response latency | Accepted deliberately (§1) — the price of an error the visitor can see |

## 13. Budget

Comparables measured in this checkout: `RegistrationForm.tsx` **880** lines, its test **622**, `pii-boundary.spec.ts` **1,413**, the registrations e2e suites **223 / 272 / 275 / 354**, the whole `registrations` module **6,136**.

| Backend | Frontend | Tests | Infra & docs |
|---|---|---|---|
| 7 files + 4 mail edits | `ContactForm.tsx` · `contact/page.tsx` · `privacy/page.tsx` · `lib/api/contact.ts` · edits to `Header.tsx`, `Footer.tsx` ×2, About, home, `RestrictedContactPanel.tsx` | 3 unit · 4 e2e · `pii-boundary` extension + log seam · dispatch seam · frontend suite · frontend build · token grep · `ses-mail.transport.spec.ts` update | `template.yaml` (IAM, env, payload cap) · TRD §4, §13 · ux-ui §2, §4, §5 |

| Metric | Rev 5 | **Rev 6** |
|---|---|---|
| Tasks | 12 | **11** |
| Backend LOC | ~650–750 | ~600–700 |
| Frontend LOC | ~550–650 | ~550–650 |
| Test LOC | ~1,400–1,700 | **~2,100–2,500** — re-derived against the 223–354 e2e band and the 622-line frontend comparable, the third time this line was low |
| Docs LOC | ~150 | ~150 |
| **Total** | ~2,750–3,250 | **~3,400–4,000** |

**The total rose while the design shrank.** The code is simpler — one fewer task, no drain seam, no fan-out composition — and the honest test estimate is larger than the two that preceded it. Those are independent facts, and conflating them is how the previous two budgets came out low.

**Depth: `Standard`.** Two PRs: backend + mail + infra, then frontend + docs.
