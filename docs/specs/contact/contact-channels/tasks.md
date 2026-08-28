# Tasks — General contact form

- Spec path: `docs/specs/contact/contact-channels/`
- Traces: `requirements.md` (FR-1…FR-8, NFR-1…NFR-8) · `design.md` revision 6
- Status legend: `[ ]` not started · `[~]` in progress / halted · `[x]` complete & Reviewer PASS
- Commits: `[SPEC:contact/contact-channels] <message>`

> **Read `judgment.md` before starting.** Four review rounds shaped this design, and several tasks below exist to close a gate that a previous revision specified in a form that could not fail. Where a task's `Verify` looks unusually specific, that specificity is the finding.

## Phase 1 — Mail foundation

- [x] **T-1** Extend the mail contract and SES transport  (deps: none)
      Scope: `MailMessage.to` → `string | string[]`; add optional `replyTo`; `SesMailTransport` maps `to` to `ToAddresses` (string or array), passes `ReplyToAddresses` when present, and builds `Source` as the display-name form using the constant in `design.md` §4.2 — using `MAIL_SENDER_ADDRESS` verbatim if it already contains `<`. Add `MailService.sendContactMessage(message: MailMessage): Promise<void>`, which rethrows transport failures.
      Traces: FR-2, FR-4 · `design.md` §2, §4.6, DD-5
      Files: `backend/src/mail/mail-transport.interface.ts`, `ses-mail.transport.ts`, `mail.service.ts`, `no-op-mail.transport.ts` (no change expected — confirm), `ses-mail.transport.spec.ts`
      Verify: `cd backend && npm test -- mail`
      Done when: transport specs pass with the **deliberately updated** `Source` assertion (it asserts `registry@example.org` today and must fail before the update); `sendVerificationCode` and `sendReceipt` specs are untouched and green; `RecordedSend` still carries no `to`.
      Skills: `nestjs-expert`, `aws-serverless`

- [x] **T-2** Reply-To composition utility  (deps: none)  — *reopened and reworked 2026-08-28 after `design.md` §4.5 was amended (no `CRLF SP` fold); see execution.md Decision A*
      Scope: `reply-to.util.ts` composing `Display Name <address>`. Strip CR/LF from every single-line field; RFC 5322 `quoted-string`-escape a name containing `"`, `\`, `<`, `>`, `,`, `;`, `:` or `@`; RFC 2047 encode any non-ASCII name, **splitting into multiple encoded words** so no word exceeds 75 octets, **joined by a single space**; fall back to the bare address rather than emit a malformed header. *(Amended 2026-08-28 — the 998-octet line clause is withdrawn: SES's `SendEmail` assembles the header from `ReplyToAddresses`, so line length was never ours to enforce. See `design.md` §4.5.)*
      Traces: FR-4 (`AND IT MUST compose the Reply-To display name safely`), DC-3 · `design.md` §4.5
      Files: `backend/src/contact/reply-to.util.ts`, `reply-to.util.spec.ts`
      Verify: `cd backend && npm test -- reply-to`
      Done when: the spec drives the **full** character set above plus a newline, plus a 200-character non-ASCII name asserting encoded-word splitting, a single-space join, no `\r`/`\n` in the output, and **that it does not fall back to the bare address** (the silent-regression trap the amendment created). A test covering only `"`, `<`, `>`, `,` is not done — an earlier revision specified the full set and tested a subset.
      Skills: `nestjs-expert`

- [x] **T-3** Message template with the provenance line  (deps: T-1, T-2)  — *reworked 2026-08-28 after `design.md` §4.5 amendment 2; see execution.md Decision B*
      Scope: one template under `mail/templates/` following `buildReceiptMessage`'s shape. Server-generated subject; body carrying requester name, organization, category, subject and message **as data**; `replyTo` set via T-2. The body opens with a fixed line stating the message was submitted through the public contact form by a visitor whose identity has not been verified, and renders the requester's address as body data.
      Traces: FR-4, §6 content-abuse row · `design.md` §4.5
      Files: `backend/src/mail/templates/contact.template.ts` + spec
      Verify: `cd backend && npm test -- contact.template`
      Done when: spec asserts the provenance line is present and is the first body line; the subject contains no requester-supplied text; CR/LF are stripped from the **single-line** fields (`name`, `email`, `organization`, `category`, visitor `subject`); a multi-paragraph `message` **preserves** its newlines; and `organization: ''` renders identically to `undefined`. *(Amended 2026-08-28 — this read "stripped from every field", the premise Decision B withdrew: `message` renders into `Message.Body.Text.Data`, where no header can be injected, and stripping it flattened multi-paragraph submissions. See `design.md` §4.5 amendment 2.)*
      Skills: `nestjs-expert`

## Phase 2 — Contact module

- [x] **T-4** Categories, DTO, and the request-body cap  (deps: none)
      Scope: `contact-categories.ts` with the eight values from `requirements.md` FR-2 and the length constants. `dto/contact-create.dto.ts` per `design.md` §4.1.1 — every property with its validator, `privacyAcknowledged` as `@IsBoolean()` **plus an equals-true rule**, `email` capped at **254**, and the honeypot as `@IsOptional() @IsString()` with **no length cap**. Extend `configurePayloadCap` to cover `/api/v1/contact` at 32 KB.
      Traces: FR-2 (both scenarios), FR-6 (`AND IT MUST be enforced server-side`), FR-8 (honeypot reachability + no cap), NFR-2 · `design.md` §4.1.1, §4.2
      Files: `backend/src/contact/contact-categories.ts`, `dto/contact-create.dto.ts` + spec, `backend/src/common/payload-cap.config.ts` *(corrected 2026-08-28 — this line named `body-parser.config.ts`, which is the unrelated 8 MB JSON-limit helper; the cap mechanism `configurePayloadCap`/`isRegistrationsPath` lives in `payload-cap.config.ts`. The T-4 Implementer caught the discrepancy and edited the correct file.)*
      Verify: `cd backend && npm test -- contact-create.dto payload-cap`
      Done when: a bare `privacyAcknowledged: false` is **rejected** (a plain `@IsBoolean()` accepts it); an off-list category is rejected; the honeypot **survives** `whitelist: true` (a declaration without decorators is stripped — assert it arrives at the handler); an over-cap body is rejected **before** parsing.
      Skills: `nestjs-expert`, `api-design-principles`

- [x] **T-5** Administrator recipient resolver  (deps: none)  — *reopened and reworked 2026-08-28 after `design.md` §4.3 was amended to lazy validation; see execution.md Decision C*
      Scope: `admin-recipient.resolver.ts` — `ListUsersInGroupCommand` against `admin`, **looping on `NextToken` until exhausted**, projecting `email`; per-container cache with a 60 s TTL; order cache → live → fallback; never throws to its caller on a directory failure; logs degradation with no requester value and no recipient address. `CONTACT_FALLBACK_RECIPIENT` resolved **lazily, at first use**, following `getSesMailConfig()`. *(Amended 2026-08-28 — this said "validated at module initialization". That instruction's justification cited fire-and-forget, which DD-3 had already removed, and registering the module in `AppModule` broke 12 e2e suites including the `pii-boundary` release gate. See `design.md` §4.3.)*
      Traces: FR-3 (both scenarios, all clauses), NFR-8, DC-2 · `design.md` §4.3
      Files: `backend/src/contact/admin-recipient.resolver.ts` + spec
      Verify: `cd backend && npm test -- admin-recipient`
      Done when: spec asserts cache semantics discriminate (a second call inside 60 s issues **no** SDK call; one after it does); pagination exhausts `NextToken`; empty group and directory error both fall back; `staff` never appears; an unset fallback throws **at first use**, not at module init — and `AppModule` must still boot without it, which is what the 12 pre-existing e2e suites depend on.
      Skills: `nestjs-expert`, `aws-serverless`

- [x] **T-6** Contact module, controller and service  (deps: T-1, T-3, T-4, T-5)
      Scope: `contact.module.ts` (imports `LoggingModule` + `MailModule`; `ThrottlerGuard` in `providers`; `RequestContextMiddleware` via `forRoutes(ContactController)`; **no `ThrottlerModule.forRoot()`**). `contact.controller.ts` with class-level `ThrottlerGuard`, `ThrottlerExceptionFilter` imported in place from `registrations/`, and `@Throttle({ default: { limit: 5, ttl: 60_000 } })`. `contact.service.ts`: resolve → render → **await** send → return; `202` on success, `502` on transport rejection; a filled honeypot returns the same `202` with **zero dispatches**; `.catch`/error logging emits `err.name` only.
      Traces: FR-2, FR-3, FR-5, FR-7, FR-8, NFR-2, NFR-7 · `design.md` §3, §4.1, §4.2, §4.4, DD-3, DD-4
      Files: `backend/src/contact/contact.module.ts`, `contact.controller.ts`, `contact.service.ts`, `backend/src/app.module.ts`
      Verify: `cd backend && npm run build && npm test -- contact`
      Done when: **confirm `@Throttle` exists in the installed `@nestjs/throttler`** (`package-lock.json` resolves 6.5.0; `backend/node_modules` was absent when this spec was written) and that the unnamed `forRoot` entry is auto-named `default`. If either is false, accept 20/60 s and **record the acceptance in `execution.md`** rather than inventing a workaround. No error log interpolates `err.message`.
      Skills: `nestjs-expert`, `error-handling-patterns`, `api-design-principles`

## Phase 3 — Backend verification

- [x] **T-7** Endpoint e2e — submission, honeypot, throttle  (deps: T-6)
      Scope: `contact.e2e.spec.ts` covering a valid submit reaching every resolved admin; off-list category rejected server-side; unchecked `privacyAcknowledged` returning `400` with `details[].field` naming it; missing and over-long fields rejected; over-cap body rejected; **a transport rejection returning `502` with no provider detail**. Honeypot: filled → identical `202` **and zero dispatches**; over-long honeypot → `202`, never a `400` naming the field. Throttle: real over-limit traffic, 6th request `429`, dispatch count stays at 5.
      Traces: FR-2, FR-5, FR-6, FR-8, DC-5 · `design.md` §10
      Files: `backend/src/contact/contact.e2e.spec.ts` (+ honeypot/throttle suites if split)
      Verify: `cd backend && npm test -- contact.e2e && npm test -- registrations-throttle`
      Done when: the throttle assertion discriminates — it must **fail** against a controller with no guard, so assert the dispatch count across the allowed requests, not merely that the 6th is `429`. `registrations-throttle.e2e.spec.ts` still observes **its own** 20/60 s. A standalone-compiled test module registers `ThrottlerModule.forRoot(...)` itself, as `ThrottleDbTestModule` does.
      Skills: `nestjs-expert`, `tdd`

- [x] **T-8** FR-7's zero-writes gate, and the PII boundary extension  (deps: T-6)
      Scope: (a) DC-4 e2e — **compile `AppModule` and `.overrideProvider(PrismaService)`**, following `pii-boundary.spec.ts`; the override models Prisma's **delegate** shape (`prisma.actor.create`), not flat methods; assert zero queries across success, validation-failure, honeypot and throttled paths. (b) Extend `pii-boundary.spec.ts` to `POST /api/v1/contact` with a **log-capture seam** — that suite has zero occurrences of "log" today — asserting no requester value and no recipient address in any response, error or log line.
      Traces: FR-7, NFR-1 (**release gate**), DC-1, DC-4 · `design.md` §10
      Files: `backend/src/contact/contact-no-writes.e2e.spec.ts`, `backend/src/test/pii-boundary.spec.ts`
      Verify: `cd backend && npm test -- pii-boundary contact-no-writes`
      Done when: **both gates are shown to fail before they are trusted.** Run DC-4 against a variant that writes and confirm red; run the PII extension against a variant leaking a `MessageRejected`-shaped error carrying the fixture address and confirm red. Do **not** compile a standalone `ContactModule` for DC-4 — `PrismaService` is absent from that graph and `overrideProvider` is a silent no-op that passes unconditionally. A green run on the first attempt, with no red demonstrated, is not done.
      Skills: `nestjs-expert`, `tdd`

## Phase 4 — Frontend

- [ ] **T-9** Contact form component and API client  (deps: T-6)
      Scope: `ContactForm.tsx` — fields per `design.md` §4.1.1, visually hidden honeypot outside the tab order, values preserved on failure, success and error announced through an `aria-live` region. `lib/api/contact.ts` — one typed caller with **`expectEmpty: true`**. Error rule partitioned on `details[]`: a `400` with **non-empty** `details[]` renders inline field errors; **every other outcome** — `400` with empty/absent `details`, `429`, `502`, network rejection — renders one **fixed constant**, never `ApiError.message`.
      Traces: FR-2, FR-5, NFR-3, NFR-4, NFR-7 · `design.md` §5.1
      Files: `frontend/components/contact/ContactForm.tsx` + test, `frontend/lib/api/contact.ts` + test
      Verify: `cd frontend && npm test -- contact && npm run lint`
      Done when: tests assert a `400` with empty `details`, a `502`, and a network rejection each render the fixed constant — `apiFetch` sets `message` to `HTTP <status> <statusText>`, so rendering it would surface the status code FR-5 forbids. Grep the component for hex, `rgb(` and `-[` returns nothing. `jest-axe` passes.
      Skills: `frontend-design` (or `ui-ux-pro-max`), `tailwind-design-system`, `shadcn-ui`, `react-doctor`

- [ ] **T-10** Pages, navigation and entry points  (deps: T-9)
      Scope: `app/(public)/contact/page.tsx` and `app/(public)/privacy/page.tsx`, both **static** (no `useSearchParams`, so no `<Suspense>`). Privacy page content per `design.md` §5.2. Add Contact to `NAV_LINKS`; link `/contact` from footer, About and home; link `/privacy` from the footer; link `/contact` from `RestrictedContactPanel`'s closing sentence.
      Traces: FR-1, FR-6 (link resolves), NFR-3, NFR-5, DC-9, DC-11 · `design.md` §5.2, §5.3
      Files: `frontend/app/(public)/contact/page.tsx`, `app/(public)/privacy/page.tsx`, `components/shell/Header.tsx`, `Footer.tsx`, About and home pages, `components/profile/RestrictedContactPanel.tsx`
      Verify: `cd frontend && npm run build && npm test -- header profile`
      Done when: `out/contact/index.html` and `out/privacy/index.html` are emitted (`trailingSlash: true`); tests assert Contact renders in **both** the desktop bar and the open mobile drawer, from the single `NAV_LINKS` array with no second list; the privacy link resolves.
      **Manual gate — not automated (DC-9):** a rendered capture at 375 / 768 / 1440 confirming the desktop nav does not wrap or crowd at `md`–`lg` with a seventh entry. `Header.tsx` records that primary links must not wrap. **If it crowds, stop and return it to the owner as a placement question** — do not resolve it by shortening a label or dropping an entry.
      Skills: `frontend-design`, `tailwind-design-system`, `react-doctor`

## Phase 5 — Infrastructure and documentation

- [ ] **T-11** IAM, environment, and baseline-document sync  (deps: T-6, T-10)
      Scope: add `cognito-idp:ListUsersInGroup` to the existing statement in `infra/20-backend/template.yaml` (eleven actions today, action-scoped, no wildcard, this one absent) and `CONTACT_FALLBACK_RECIPIENT` to the `Environment` block. Update `docs/trd/trd.md` §4 (add the path) and §13 (register **QA-13**, worded to match QA-12); `docs/ux-ui/design.md` §2 (add `/contact` and `/privacy`, **fix `/directory/[id]` → `/profile?id=`**), §4 (screen rows), §5 (nav model — already stale on Dashboard and About).
      Traces: FR-3, NFR-1, `design.md` §7.1, §8
      Files: `infra/20-backend/template.yaml`, `docs/trd/trd.md`, `docs/ux-ui/design.md`
      Verify: `./infra/scripts/validate.sh`
      Done when: SAM validate passes with `--profile IBD-DEV`; QA-13 exists in TRD §13 and matches the NFR-1 wording in `requirements.md`; the `/directory/[id]` correction is applied. **A missing IAM grant fails at runtime, not deploy** — confirm the action is present in the rendered template, not merely that validate passed.
      Skills: `aws-serverless`, `software-architect`

## Dependency graph

```
T-1 ─┬─► T-3 ─┐
T-2 ─┘        │
T-4 ──────────┼─► T-6 ─┬─► T-7
T-5 ──────────┘        ├─► T-8
                       └─► T-9 ──► T-10 ──┐
                                          ├─► T-11
                       T-6 ───────────────┘
```

Eligible = status `[ ]`/`[~]` with every dependency `[x]`. T-1, T-2, T-4 and T-5 have no dependencies and can run in any order.

## Coverage closure

Closes at **scenario and clause** granularity, not requirement ID (KZ-001). A gap is never discharged by citing a different requirement.

| Requirement / clause | Owned by |
|---|---|
| FR-1 page + nav entry; keyboard; **BUT no sign-in**; **MUST survive the hamburger** | T-10 |
| FR-2 valid submission; **BUT no persistence**; **MUST reject missing/malformed/over-cap/unchecked** | T-6, T-7 |
| FR-2 fixed category set; **BUT no DB/remote config**; **MUST reject off-list server-side** | T-4, T-7 |
| FR-3 membership change after TTL; **BUT no redeploy**; **MUST exclude `staff`**; **MUST resolve every member** | T-5 |
| FR-3 directory unavailable; **BUT no silent discard**; **MUST log without requester value or recipient address** | T-5 |
| FR-4 headers; **BUT no requester text outside `Reply-To`**; **MUST encode safely**; **MUST keep OTP/receipt working** | T-1, T-2, T-3 |
| FR-5 visible failure incl. `502`; **BUT no provider/status/stack**; **MUST use a live region**; **MUST partition on `details[]`** | T-6, T-9 |
| FR-6 acknowledgement gate; **BUT no consent mutation**; **MUST enforce server-side**; **MUST link a page that resolves** | T-4, T-7, T-10 |
| FR-7 no mutation; **BUT no query**; **MUST hold on throttled / rejected / honeypot paths** | T-8 |
| FR-8 honeypot indistinguishable; **MUST be reachable**; **MUST NOT carry a length cap** | T-4, T-7 |
| FR-8 over-limit rejected before the handler; **MUST be proven with real traffic** | T-7 |
| NFR-1 release gate incl. log lines, gate shown to fail | T-8 |
| NFR-2 throttle · honeypot · caps · body cap · sanitization | T-4, T-6, T-7 |
| NFR-3 WCAG 2.1 AA · NFR-4 tokens | T-9, T-10 |
| NFR-5 static export | T-10 |
| NFR-6 analytics — satisfied by adding none | T-9 (assert absence) |
| NFR-7 error envelope | T-6, T-9 |
| NFR-8 cache cost | T-5 |
| DC-9 layout / nav density — **no automated gate** | T-10 manual gate |

## Verification expectations

- Every task carries a runnable `Verify`; the Implementer runs it before reporting.
- **T-7 and T-8 must demonstrate red before green.** Their gates were specified in earlier revisions in forms that could not fail; a green first run with no red shown is not evidence (KZ-002).
- **T-6 carries a verification duty, not just an implementation one** — the `@Throttle` availability check. Recording an honest acceptance beats inventing a workaround.
- Backend: `npm test` · `npm run build` · `npx eslint "{src,test}/**/*.ts" --quiet`. Frontend: `npm test` · `npm run build` · `npm run lint`. Infra: `./infra/scripts/validate.sh`.
- No task introduces a PII field. All AWS commands use `--profile IBD-DEV`.

## PR strategy

Two PRs. At ~3,400–4,000 lines a single review is not reviewable.

| PR | Tasks | Reviewer's first stop |
|---|---|---|
| **1 — backend, mail, infra** | T-1…T-8, T-11's infra half | The shared transport edit (T-1) — it touches the live OTP path — then T-8, which is FR-7's only gate and the PII release gate |
| **2 — frontend, docs** | T-9, T-10, T-11's docs half | The error partition in T-9, then the manual nav capture in T-10 |

PR 1 is independently deployable: the endpoint works with no UI. PR 2 depends on PR 1's contract. Each description should say what to review first and what is out of scope, and link the other.

## Open items carried into execution

`design.md` §11 holds three owner decisions. **OD-1 (SES production access vs per-address verification) affects whether the feature works in Dev**, since the sandbox delivers only to verified identities and its 200/24 h quota is shared with the registration OTP path. It does not block any task here, but it blocks end-to-end confirmation.
