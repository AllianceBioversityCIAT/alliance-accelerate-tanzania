# Tasks — Public Self-Registration (chunk 3a, applicant flow)

- Spec path: `docs/specs/actors/public-self-registration/`
- Traces: `requirements.md` FR-1…FR-8, FR-14, FR-15 (**25 scenarios**) · `design.md` revision 3
- Budget: **23 tasks · ~6,500 LOC · ~37 review rounds** (`design.md` §10.1). Exceeding any one **halts and escalates to the user.**
- Scope: applicant flow only. FR-9…FR-13 and the five admin endpoints are **chunk 3b** (`docs/specs/admin/registration-review-queue/`).

> **Read `judgment.md` before starting.** This spec survived a blind dual review whose correction round *injected* six severe defects. Four mechanisms are therefore specified as **constraints with rejected options** (§4.3 V-1…V-6, §4.4 L-1…L-4, §4.5 A-1…A-5, §4.4 P-1…P-3) rather than as prescribed designs. Where a task cites those, **the Implementer chooses the mechanism and records the choice with its evidence in `execution.md`.** That is deliberate: a design document cannot test a mechanism, and the last two attempts to prescribe one were wrong.

---

## Phase A — Foundation (no applicant-visible behaviour yet)

- [x] **T-1** Prisma migration: `RegistrationStatus`, `Registration` (full), `EmailVerification`  (deps: none)
      Scope: One additive migration. `Registration` includes **all** adjudication columns (`publishedActorId`, `reviewedBySub`, `reviewedByEmail`, `reviewedAt`, `rejectionReason`, `reviewNote`, `duplicateDismissals`) even though 3a writes none of them — so 3b needs no migration, per chunk 1's `PORTAL_CHECKBOX` precedent. `@@index([status, createdAt])` on `Registration`, `@@index([email, createdAt])` on `EmailVerification`. **No** `submitterEmail` index (`design.md` §2.2 — the lookup keys on `reference`). No lookup-bounding columns yet: those are T-11's, under constraint A-4.
      Traces: `requirements.md` §10, `design.md` §2.1–2.3, §2.6
      Files: `backend/prisma/schema.prisma`, `backend/prisma/migrations/*`
      Verify: `cd backend && npx prisma migrate dev --name add_registration_and_email_verification && npm run build`
      Done when: migration applies on local MySQL, client types compile, and the generated SQL is **two `CREATE TABLE` + indexes with no `DROP`, no `MODIFY`, no data `UPDATE`**.
      **Disqualifying:** if the generated SQL contains a `MODIFY`, the migration is wrong for *this* task — the only legitimate `MODIFY` in this epic is 3b's `ActorAuditAction` widening (`design.md` §2.6), which is **not** in 3a. Do not hand-edit generated SQL to satisfy the criterion; if Prisma emits something unexpected, report the SQL verbatim and stop.
      Skills: `nestjs-expert`

- [x] **T-2** Consent policy module + `GET /registrations/consent-policy`  (deps: T-1)
      Scope: `consent-policy.ts` with an ordered section list and `CONSENT_POLICY_VERSION`; a known-version set that retains superseded versions; the public endpoint. Placeholder text pending OQ-1 — the mechanism is the deliverable, legal owns the wording.
      Traces: FR-3, `design.md` §4.2, DD-7
      Files: `backend/src/registrations/consent-policy.ts`, `registrations.controller.ts`, `registrations.module.ts`, `app.module.ts`
      Verify: `cd backend && npm test -- registrations && npm run build`
      Done when: the endpoint returns `{version, sections}`; an unknown version is rejectable by T-10's check; superseded versions stay accepted.
      **Disqualifying:** a test that only asserts the endpoint returns 200 proves nothing about FR-3 — it must assert that the *returned* version is the one the server will later accept, or the drift hole DD-7 exists to close is untested.
      Skills: `nestjs-expert`, `api-design-principles`

- [x] **T-3** `mail` module: `MailService`, SES transport, no-op transport  (deps: none)
      Scope: Interface + SES implementation + no-op transport selected by `MAIL_TRANSPORT`. Verification-code and receipt templates only (decision notices are 3b's). **The receipt carries the reference; the verification code cannot and does not** — it is sent before the reference is allocated, which is FR-14's own stated exception (corrected 2026-08-05 during execution; the prior "Every message carries the reference" contradicted `requirements.md` FR-14 and was unsatisfiable — see `execution.md` → T-3). Bodies and codes never logged.
      Traces: FR-14, NFR-10, `design.md` §4.9
      Files: `backend/src/mail/**`
      Verify: `cd backend && npm test -- mail`
      Done when: both transports satisfy the interface; the no-op records send attempts without sending; a test proves no message body or code reaches log output.
      **Disqualifying:** asserting the SES client was *constructed* is a presence assertion (KZ-002). The behavioural claim is that selecting the no-op transport makes the flow complete with nothing sent — if the test cannot distinguish "sent" from "not sent", it is not evidence.
      Skills: `aws-serverless`, `nestjs-expert`

- [x] **T-4** `logging` module: request-id middleware emitting the structured line  (deps: none)
      *(Title corrected 2026-08-05 during execution — was "request-id middleware + structured interceptor". An interceptor runs **after** guards and so cannot emit for a guard-rejected request, including T-5's `429`; emission lives in the middleware. See `design.md` §4.10's correction and `execution.md` → T-4.)*
      Scope: Deliberately minimal (`design.md` §4.10). Request-id source; one JSON line per request carrying request id, route, method, status, role, latency — applied to **this module's controllers only**, not globally. Never logs OTP codes, payload fields, phone numbers, email addresses or mail bodies.
      Traces: NFR-8, DC-14, DC-22, DEP-11
      Files: `backend/src/logging/**`
      Verify: `cd backend && npm test -- logging`
      Done when: a captured log line carries all six fields, and a test asserts fixture PII values and a fixture OTP are absent from emitted output.
      **Disqualifying:** an empty log stream passes a naive "no PII in logs" assertion vacuously (this is exactly A5's point). The test must first prove a line *was* emitted, then prove what it does not contain. If no line is captured, the result is inconclusive, not a pass.
      Skills: `nestjs-expert`, `error-handling-patterns`

- [x] **T-5** Throttle guard + `429` envelope filter  (deps: T-2)
      Scope: `@nestjs/throttler` in-memory per container, on the four public routes. An exception filter shaping `ThrottlerException` into `{statusCode, message, error}` — the library omits `error` (A21, DC-26).
      Traces: FR-7, NFR-4, DC-26, `design.md` §4.4, DD-5
      Files: `backend/src/registrations/registrations-throttle.guard.ts`, `throttler-exception.filter.ts`
      Verify: `cd backend && npm test -- registrations`
      Done when: over-rate returns `429` **in the documented envelope**, and a mock asserts **zero** Prisma invocations on the rejected request.
      **Disqualifying:** a `429` test that does not assert the envelope shape leaves DC-26 uncovered; one that does not assert zero DB calls leaves FR-7's "must NOT open a database connection" unproven. Both clauses, or the task is incomplete.
      Skills: `nestjs-expert`, `error-handling-patterns`

- [x] **T-6** Payload cap through a shared `common/` helper, both entrypoints  (deps: none)
      Scope: Constraints **P-1…P-3** (`design.md` §4.4). Registered via a `configure*` helper in `common/` called from `main.ts` and `lambda.ts` **before** `configureBodyParser(app)` — not two hand-written `app.use` lines (RA9). Path matching must account for the `api/v1` global prefix (P-2). A request declaring no length must not bypass it (P-3).
      Traces: FR-7, NFR-4, `design.md` §4.4, §9
      Files: `backend/src/common/payload-cap.config.ts`, `backend/src/main.ts`, `backend/src/lambda.ts`
      Verify: `cd backend && npm test -- lambda-handler && npm test -- payload-cap && npm run build`
      Done when: an oversized body is rejected **before parsing** on both entrypoints; a chunked/length-less request is also rejected; non-registration routes are unaffected; **`lambda-handler.e2e.spec.ts` green**.
      **Disqualifying:** a supertest-only pass is **not evidence** — `serverless-http` sets `complete: true`, which is the documented reason supertest cannot see this class of bug (`backend/CLAUDE.md`). Evidence must come from the real handler. A scope test written against `/registrations` rather than `/api/v1/registrations` can pass while the cap is disabled everywhere (P-2); assert the prefix explicitly.
      Skills: `aws-serverless`, `nestjs-expert`

---

## Phase B — Public backend

- [x] **T-7** OTP service under constraints V-1…V-6  (deps: T-1, T-3)
      *(Closed on attempt 4 after a HALT at the 3-attempt ceiling and one user-authorised bounded attempt. 8 Reviewer lens reports across 4 rounds. Mechanism substituted: an `EmailSendBudget` counter table replaces §4.3's `EmailVerification`-row count for the send cap, with a fixed hourly bucket rather than a rolling window — both deviations recorded in `execution.md` → T-7.)*
      Scope: Issue, verify, consume. **The Implementer chooses the mechanism** and records it in `execution.md` with evidence against each constraint (`design.md` §4.3). Rejected options are listed there — do not re-derive them. Parameters: 6 digits CSPRNG, 15 min, 5 attempts, 3 sends/email/hour, HMAC-SHA-256 under an SSM secret.
      Traces: FR-4 (all 3 scenarios), DC-20, `design.md` §4.3, DD-11
      Files: `backend/src/registrations/email-verification.service.ts` (+ spec)
      Verify: `cd backend && npm test -- email-verification`
      Done when: **V-1** a wrong code increments the counter and the cap kills the code (the S-1 regression test — must fail without the fix); **V-1a** that increment **survives the rejection**, asserted by a **fresh read after a rejected request**; **V-2** one live code per email is verifiable; **V-3** a valid older code is not rejected because a newer exists (the RA4 test — **two live rows**); **V-4** concurrent consume yields exactly one success; **V-5** wrong/expired/consumed are byte-identical; **V-6** no plaintext code stored or logged.
      **Disqualifying:** three traps, each of which has already caught a previous revision of this spec.
      (a) A single-row fixture cannot exercise V-3 and passes while the defect is present — that is how RA4 would have shipped.
      (b) **An in-request assertion on `attempts` cannot see a rollback.** If the mismatch path runs inside a transaction that the `400` aborts, the counter is restored and V-1 is unreachable — the RB1 defect, in which the fix for A23 silently destroyed the fix for S-1. **Read the counter in a separate query after the request completes**, or the evidence is worthless.
      (c) Submitting N wrong codes inside one request does not prove a cross-request bound; use N separate requests.
      Skills: `nestjs-expert`, `tdd` (Leader-assigned: this is correctness-critical auth-adjacent logic), `systematic-debugging`

- [x] **T-8** `POST /registrations/verify`  (deps: T-2, T-5, T-7)
      *(Closed on attempt 3. The Done-when's "three cases" is **two branches, three inputs** — over-cap is a genuinely distinct path and is exercised, so the Disqualifying clause is satisfied; known-vs-unknown take identical code and are kept as a forward guard against a future membership check. See `execution.md` → T-8.)*
      Scope: Request a code. **`202`, empty body, always** — including over the per-email cap, which is enforced silently (`design.md` §3.1 decision 1). No `Registration` row written.
      Traces: FR-4, FR-8, `design.md` §3.1
      Files: `backend/src/registrations/registrations.controller.ts`, `registrations.service.ts`
      Verify: `cd backend && npm test -- registrations`
      Done when: responses are byte-identical for a known address, an unknown address, **and an over-cap address**; zero `Registration` rows created; malformed email `400`.
      **Disqualifying:** testing only known-vs-unknown leaves the over-cap branch — the one C-3 was raised for — unexercised. Three cases or the oracle clause is unproven.
      Skills: `nestjs-expert`, `api-design-principles`

- [x] **T-9** `RegistrationCreateDto`, enumerated explicitly  (deps: T-1)
      Scope: The field table in `design.md` §4.1 verbatim — **not** "mirror `ActorCreateDto`" (C-13: `crops` is `@IsOptional` there and `@MaxLength` covers only 2 of 9 strings). `@ArrayNotEmpty()` on crops. `@MaxLength` on every free-text string. `@ValidateNested()` + `@Type()` on the nested `consent` object, required under the production pipe's `whitelist: true` (B33). Cross-field coordinate pairing. **No `email` in the payload** (S-6).
      Traces: FR-2 (scenarios 1–3), `design.md` §4.1
      Files: `backend/src/registrations/dto/registration-create.dto.ts` (+ spec)
      Verify: `cd backend && npm test -- registration-create`
      Done when: no-crop submission `400`s with a `details` entry; each string bound; one-of-two coordinates `400`s; both-blank accepted; nested `consent` survives whitelisting; no `email` field exists on the payload.
      **Disqualifying:** if a test asserts crops are optional, it is asserting the admin DTO's behaviour and contradicts FR-2's scenario. And if `consent.accepted` reads `undefined` in any test, `@ValidateNested` is missing — the symptom is every submission `400`-ing, which a happy-path test would surface but a validation-only test would not.
      Skills: `nestjs-expert`, `api-design-principles`

- [x] **T-10** `POST /registrations` — submission, consent check, reference allocation  (deps: T-7, T-9)
      Scope: Order of operations per `design.md` §4.1: cap → throttle → pipe → **consent check (accepted `true` AND known version)** → **verify the code, rejecting outside any transaction** (V-1a) → **one `$transaction`**, entered only on a match, containing the *consume* plus the row write (A23 — consuming outside it burns a single-use code on any downstream failure). Reference allocation under constraints **A-1…A-5**; the Implementer chooses and records the mechanism, **declaring any object it needs in the migration** (A-4 — RA1's actual defect). Response is `{ reference }` and nothing else.
      **Note the two-obligation split.** A23 wants the consume *inside* the transaction; V-1a wants the mismatch increment to *survive* a rejection. One transaction boundary cannot serve both — putting the whole verification inside it rolls the counter back (RB1). If the chosen arrangement differs from §4.1's, both properties must still hold and both must be evidenced.
      Traces: FR-2 (s1), FR-3 (s1, s3), FR-4 (s1, s2), FR-5 (s1), `design.md` §4.1, §4.5
      Files: `backend/src/registrations/registrations.service.ts`, `registration-reference.util.ts`, `registrations.controller.ts`, migration if A-4 requires one
      Verify: `cd backend && npm test -- registrations && npm run build`
      Done when: consent missing / false / unknown-version each `400` with **zero rows**; stored `consentPolicyVersion` and `consentAcceptedAt` equal the submitted values; `submitterEmail` is the OTP-verified address; response contains only `reference`; A-1…A-5 each evidenced.
      **Disqualifying:** the response-body assertion must be made against **fixture values** of every payload field and the internal `id`, not against a key list — a renamed key would pass a key-list check while leaking (this is the DC-2 lesson). If the chosen allocation mechanism needs a table and the migration does not declare it, the task is not done regardless of green tests (A-4).
      Skills: `nestjs-expert`, `api-design-principles`, `tdd` (Leader-assigned: consent gating is the legal basis for publication), `error-handling-patterns`

- [ ] **T-11** `POST /registrations/lookup` under constraints L-1…L-4  (deps: T-10)
      Scope: Body, not query string (C-11 — PII must not reach URLs, `Referer` or access logs). Byte-identical `404` for reference-absent and email-mismatch. Case-insensitive email compare. Brute-force bounding satisfying **L-1…L-4**; the Implementer chooses and records the mechanism, **declaring any columns it needs**. Returns status and `reviewNote` only.
      Traces: FR-6 (both scenarios), FR-8, `design.md` §3.1 decision 3–4, §4.4
      Files: `backend/src/registrations/registrations.service.ts`, `serializers/public-registration.serializer.ts`, migration if L-* requires columns
      Verify: `cd backend && npm test -- registrations`
      Done when: both failure modes byte-identical; case-insensitive match; payload/`id`/reviewer identity never returned; L-1…L-4 each evidenced — **including L-2 on the throttled/locked exit**.
      **Disqualifying:** **if the chosen bounding mechanism cannot make its refusal indistinguishable from the other two exits, it is the wrong mechanism** (L-2, RA2) — a distinguishable lockout reintroduces the membership oracle this endpoint was designed to avoid, and a test covering only two of three exits will not catch it. A mechanism keyed solely on `reference` fails L-3 and must be rejected at review, not at execution (RA3).
      Skills: `nestjs-expert`, `api-design-principles`, `tdd` (Leader-assigned: this is the module's only public read of a PII-bearing row)

- [x] **T-12** Correct `pii-boundary.spec.ts` to the production bootstrap  (deps: none)
      Scope: Replace `new ValidationPipe({...})` with `createValidationPipe()` and add `configureBodyParser(app)` (`pii-boundary.spec.ts:276-278`). Its in-file comment claims it mirrors production *exactly* and it does not — only `createValidationPipe()` attaches the `details` array. Fix the comment too.
      Traces: FR-8, NFR-1, DC-2, `design.md` §1.3, §6.2
      Files: `backend/src/test/pii-boundary.spec.ts`
      Verify: `cd backend && npm test -- pii-boundary`
      Done when: the suite bootstraps through both shared helpers and **stays green on the three existing paths**.
      **Disqualifying:** this is a prerequisite, not an improvement — until it lands, the release gate cannot render the `details` envelope whose leak DC-2 exists to catch, so **T-13's green result would be meaningless**. If correcting the bootstrap breaks existing assertions, that is a real finding about the current gate: report it, do not loosen the assertions.
      Skills: `nestjs-expert`, `systematic-debugging`

- [ ] **T-13** Extend `pii-boundary.spec.ts` to the module — **release gate**  (deps: T-8, T-11, T-12)
      Scope: Registration-specific forbidden key **and value** sets (payload keys, `submitterEmail`, `id`, `reviewedBySub`, `reviewedByEmail`). Iteration set **derived from the runtime route table**, not compared to a list (C-9). **The fixture map must be total and a missing fixture must fail the suite** (RA7). Cover all four public paths plus the `400` and `429` bodies, with an approved and a rejected fixture present. `429` assertions in an isolated describe with a dedicated app and reset limiter (B28).
      Traces: FR-8 (all 3 scenarios), NFR-1, DC-1, DC-2, `design.md` §6.2, DD-2
      Files: `backend/src/test/pii-boundary.spec.ts`
      Verify: `cd backend && npm test -- pii-boundary`
      Done when: zero fixture values leak on any path or error body; adding a public route to the module **fails the suite until a fixture exists for it**.
      **Disqualifying:** a `continue`-on-missing-fixture loop satisfies every word of the design while restoring C-9 exactly (RA7) — **the gate is the totality assertion, not the enumeration**. Prove it by adding a throwaway route and observing a red suite. Shared throttler state across `it` blocks makes this gate order-dependent (B28); if runs differ, the result is inconclusive — report the spread.
      Skills: `nestjs-expert`, `systematic-debugging`

---

## Phase C — Frontend

- [x] **T-14** Widen the trader taxonomy to ten across **four** files  (deps: none)
      Scope: The `traderType` union in `lib/api/actors.ts`, `ROLES` in `roles.ts`, `ROLE_BG_CLASS` **and** `ROLE_CSS_VAR` in `RoleBadge.tsx`, `TRADER_TYPES` in `MapLegend.tsx`. Tokens: `humanitarian`→`highlight`, `digital_service_provider`→`highlight-soft`, `qds_producer`→`crop-groundnut`, `bulk_buyer`→`warning`. `danger` stays unused.
      Traces: FR-15, `design.md` §1.3, §5.7. Closes chunk 1's open **R-3**.
      Files: `frontend/lib/api/actors.ts`, `lib/content/roles.ts`, `components/map/RoleBadge.tsx`, `components/map/MapLegend.tsx`
      Verify: `cd frontend && npm test -- roles && npm run build`
      Done when: all ten present with labels and tokens in **all four** files; no raw snake_case fallback; `npm run build` type-checks the widened union.
      **Disqualifying:** `ROLE_BG_CLASS` holds full literal class strings for the Tailwind scanner, so **a missing entry degrades silently to a neutral colour rather than erroring** (C-6). A test asserting only `roles.ts` has ten entries will pass while the map renders four types grey. Assert all four maps.
      Skills: `tailwind-design-system`, `vercel-react-best-practices`

- [x] **T-15** `NavLink` variant + the nav entry  (deps: T-14)
      Scope: `NAV_LINKS` is `{label, href}` consumed by uniform `NavLink`/`MobileNavLink`, and "Staff sign-in" is not in it — it lives in `AuthSlot`. So an entry cannot be visually distinct without an additive `variant` prop on both components (A29). Add the prop; add the entry.
      Traces: FR-1 (s1), `design.md` §5.7
      Files: `frontend/components/shell/Header.tsx` (+ test)
      Verify: `cd frontend && npm test -- Header && npm run build`
      Done when: the entry links to `/register`, renders with the primary variant, is keyboard reachable with a visible focus ring, has an accessible name reading as an action, and is **absent** from the admin sidebar.
      **Disqualifying:** *"reads as an action, not a destination alone"* is not `jest-axe`-assertable — the accessible **name** is assertable via Testing Library and must be; whether it *reads* as an action is a **human check at the HITL pause** (DC-16). Do not record the human half as covered by the automated half.
      Skills: `frontend-design`, `shadcn-ui`, `react-doctor`

- [x] **T-16** Landing CTA panel  (deps: T-15)
      Scope: A `surface-alt` panel below the hero actions stating that actors may add themselves and that **submissions are reviewed before publication**.
      Traces: FR-1 (s2), `design.md` §5.7
      Files: `frontend/app/(public)/page.tsx` or its hero component, + test
      Verify: `cd frontend && npm test -- home && npm run build`
      Done when: the panel links to `/register` and states the review-before-publication fact.
      **Disqualifying:** asserting the link exists does not cover the clause — FR-1 requires the *review* fact stated, because a visitor who believes submission equals publication has been misled about their own personal data. Assert the copy.
      Skills: `frontend-design`, `ui-ux-pro-max`

- [x] **T-17** `RegistrationForm` — sections, validation, error contract  (deps: T-9, T-14)
      Scope: Plain `useState` per `ActorForm.tsx` (no react-hook-form, no zod, no shadcn — none are in this project). Five fieldsets. Hand-written DTO builder. `errors` record driving **both** the summary and the inline messages from one source. `aria-describedby` per field; live-region summary. **GPS-optional copy** (A25). Single column mobile, two-column at `lg+`. No entrance motion (A26).
      Traces: FR-2 (s2, s3, s4), NFR-5, NFR-6, `design.md` §5.1
      Files: `frontend/components/register/RegistrationForm.tsx`, `frontend/app/(public)/register/page.tsx` (+ tests)
      Verify: `cd frontend && npm test -- RegistrationForm && npm run lint && npm run build`
      Done when: three-field error case shows a count plus one inline message each, summary and inline agreeing; ten trader types offered; GPS-blank-permitted copy present; zero hex literals.
      **Disqualifying:** if summary and inline state can be produced from two sources, they can disagree and the test will not notice — assert they derive from one object. `jest-axe` clean does **not** cover contrast or focus order (jsdom returns *incomplete* on `color-contrast` and `toHaveNoViolations` does not fail on it) — route those to DC-16 and say so, do not count them.
      Skills: `frontend-design`, `tailwind-design-system`, `react-doctor`, `vercel-react-best-practices`

- [x] **T-18** `ConsentPolicyDisclosure` + the pure scroll predicate  (deps: T-2, T-17)
      Scope: Fetch from `GET /registrations/consent-policy`. Sections in a **focusable** scroll region (`tabIndex={0}`, `role="region"`, labelled) so keyboard users can reach the end. Checkbox `disabled` until the end, **unticked at every initial render**. Progress text. The end-detection predicate is a **pure exported function** over `{scrollTop, clientHeight, scrollHeight}` (DD-8).
      Traces: FR-3 (s1, s2), NFR-5, DC-17, `design.md` §5.2
      Files: `frontend/components/register/ConsentPolicyDisclosure.tsx`, its predicate module (+ tests)
      Verify: `cd frontend && npm test -- ConsentPolicy && npm run build`
      Done when: unticked and disabled on open; enabled after the predicate reports the end; predicate unit tests cover injected metrics **including content-shorter-than-container**; keyboard-reachable.
      **Disqualifying:** **jsdom does not lay out or scroll**, so a DOM-level test of the gate asserts against zeroes and would pass on a control that enables instantly or never (DC-17). The predicate test is the covered half; that the gate *actually gates in a browser* is a **human check** and must be recorded as such, not folded into the green result.
      Skills: `frontend-design`, `react-doctor`

- [x] **T-19** `OtpVerificationStep`  (deps: T-8, T-17)
      *(The distinct `429` message is **not** a C-3 regression — `design.md:188` explicitly grants it, because the throttler keys on the caller and not on the submitted address. Two invariants, not one: `INVALID_CODE_MESSAGE` across wrong/expired/consumed, `RESEND_NOTICE` across capped/uncapped. See `execution.md` → T-19.)*
      Scope: A step within `/register`, not a route — form state must survive verification and a route change under static export would lose it. Resend affordance that **never reports a server refusal**: the per-email cap is silent, so the UI states up front that codes are limited and to wait (C-3).
      Traces: FR-4 (s2, s3), `design.md` §5.3
      Files: `frontend/components/register/OtpVerificationStep.tsx` (+ test)
      Verify: `cd frontend && npm test -- Otp && npm run build`
      Done when: entered form values survive the step; an indistinguishable `400` renders one generic message; resend copy sets the expectation without reporting refusals.
      **Disqualifying:** if the UI surfaces a distinct message for a capped resend, it reconstructs the oracle C-3 removed on the server — assert the message is invariant across failure modes.
      Skills: `frontend-design`, `react-doctor`

- [x] **T-20** Receipt screen + `ReferenceCard`  (deps: T-10, T-19)
      Scope: `/register/submitted?ref=` (query-param routing per static export). Reference as **selectable text**, never an image or canvas. Copy action. Save-this instruction. Link to `/register/status`. "What happens next" describes **only 3a + 3b behaviour** — not chunk 4's round-trip (D-10), and frames the lookup as the reliable channel with email as a convenience (B32).
      Traces: FR-5 (s2), FR-14, `design.md` §5.4
      Files: `frontend/app/(public)/register/submitted/page.tsx`, `components/register/ReferenceCard.tsx` (+ tests)
      Verify: `cd frontend && npm test -- submitted && npm run build`
      Done when: reference selectable and copyable; save-this present; status link present; no copy promises an information-request round-trip.
      **Disqualifying:** copy promising *"we may email you for more information… a link back to this form"* describes chunk 4 and would be a false promise — assert its absence, not merely the presence of correct copy.
      Skills: `frontend-design`, `ui-ux-pro-max`

- [ ] **T-21** `StatusLookupForm` + `/register/status`  (deps: T-11, T-20)
      Scope: POSTs reference + email in a **body**. Renders status and `reviewNote`. Nothing else is available to render.
      Traces: FR-6 (s1), FR-13's applicant-facing note path, NFR-10
      Files: `frontend/app/(public)/register/status/page.tsx`, `components/register/StatusLookupForm.tsx` (+ tests)
      Verify: `cd frontend && npm test -- status && npm run build`
      Done when: a correct pair renders status and note; both failure modes render one identical message; **no email appears in any URL**.
      **Disqualifying:** if the request is a `GET` with query parameters, C-11 has regressed regardless of what the tests assert — check the emitted request, not just the rendered output.
      Skills: `frontend-design`, `react-doctor`

- [ ] **T-22** a11y suites for the three public screens  (deps: T-17, T-18, T-19, T-20, T-21)
      Scope: `*-a11y.test.tsx` per the project's per-file convention (there is no central setup). Keyboard operability, labelled controls, `aria-describedby` errors, live-region announcement.
      Traces: NFR-5, QA-11, DC-16
      Files: `frontend/app/(public)/register/*-a11y.test.tsx`
      Verify: `cd frontend && npm test -- a11y`
      Done when: `jest-axe` clean on all three screens for the rules jsdom can evaluate, **and the suite records in a comment which properties it cannot prove**.
      **Disqualifying:** `color-contrast` returns *incomplete* under jsdom and `toHaveNoViolations` does **not** fail on incomplete — chunk 1 accepted exactly this as its NFR-5 WARN. Recording contrast, focus order or focus visibility as covered here is a KZ-002 recurrence. They go to the HITL human check. Per KZ-003 these components take plain props: the check must **not** be deferred on "needs an authenticated session".
      Skills: `frontend-design`, `react-doctor`

---

## Phase D — Constitutional amendments

- [ ] **T-23** Amend PRD, TRD and the UX blueprint  (deps: T-13, T-21)
      Scope: **PRD §5** — move self-onboarding from Out-of-Scope to In-Scope, add a user story and an acceptance criterion. **TRD** §2 (`RegistrationsModule`), §3 (`Registration`, `EmailVerification`, `RegistrationStatus`, plus the note that `PII_ALLOWLIST`/`NEVER_PUBLIC_FIELDS` describe `Actor` and do not cover these tables), §4 (**the four public endpoints only** — 3b amends §4 again for its five), §8 (unapproved-PII boundary), §12.5 (ADR for the public write path), §13 (a QA scenario for unapproved-submission confidentiality). **`docs/ux-ui/design.md`** §2/§4 — the three public screens.
      Traces: `requirements.md` §14
      Files: `docs/prd.md`, `docs/trd/trd.md`, `docs/ux-ui/design.md`
      Verify: manual review against `requirements.md` §14's table, row by row.
      Done when: every row in that table is applied, and no admin endpoint or admin screen is documented.
      **Disqualifying:** documenting 3b's five admin endpoints here leaves 3b's amendment task with nothing to do **and** makes the TRD describe endpoints that do not exist — the C-14 defect in the opposite direction. Amend only what 3a ships.
      Skills: `software-architect`, `product-manager-toolkit`, `cognitive-doc-design`

---

## Dependency Graph

```
T-1 ─┬─ T-2 ─┬─ T-5 ──┐
     │        └─ T-18 ─┤
     ├─ T-7 ─── T-8 ───┼─ T-13 ── T-23
     └─ T-9 ─┬─ T-10 ─ T-11 ─┘        │
             └─ T-17 ─┬─ T-19 ─ T-20 ─ T-21 ─┬─ T-22
T-3 ── T-7                                    │
T-4 (independent)                             │
T-6 (independent)                             │
T-12 ── T-13                                  │
T-14 ─── T-15 ─── T-16                        │
```

Eligible when status is `[ ]`/`[~]` and every dependency is `[x]`. Ties broken by document order.
**T-12 before T-13 is non-negotiable** — T-13's green result is meaningless on the uncorrected harness.
**T-4 and T-6 are independent** and good parallel candidates in a worktree.

## Coverage Closure (KZ-001) — all 25 scenarios owned

| Requirement | Scenario | Owner |
|---|---|---|
| FR-1 | Nav entry | T-15 |
| FR-1 | Landing CTA | T-16 |
| FR-2 | Valid submission passes | T-10 |
| FR-2 | Invalid rejected with field-level errors | T-9 (server) + T-17 (client) |
| FR-2 | GPS optional; out-of-range and half-pairs rejected | T-9 (server) + T-17 (copy clause) |
| FR-2 | Every canonical trader type selectable | T-14 + T-17 |
| FR-3 | Consent must be given before submission | T-18 (control) + T-10 (server) |
| FR-3 | Policy readable before acceptable | T-18 (+ DC-17 human check) |
| FR-3 | Server-side acceptance mandatory | T-10 |
| FR-3 | Consent displayed at review, not inferred | **Split.** 3a owns *storing* the values verbatim → **T-10**. 3b owns *displaying* them. Recorded explicitly rather than silently reassigned |
| FR-4 | Verified address is the published address | T-10 (stores `submitterEmail`); **publication is 3b** |
| FR-4 | Code request and successful verification | T-7 + T-8 |
| FR-4 | Wrong, expired, or reused code | T-7 (V-1, V-5) |
| FR-5 | Response body is minimal | T-10 |
| FR-5 | Receipt survives email failure | T-20 |
| FR-6 | Correct reference and email | T-11 + T-21 |
| FR-6 | A guessed reference discloses nothing | T-11 (L-2, L-3) |
| FR-7 | Flood rejected cheaply | T-5 |
| FR-7 | Oversized payload rejected | T-6 |
| FR-8 | Every public registration path is clean | T-13 |
| FR-8 | The public form is not a membership oracle | T-8 + T-13 |
| FR-8 | Approved and rejected registrations stay non-public | T-13 (fixtures in both states) |
| FR-14 | Whole flow works with email disabled | T-3 (no-op transport) + T-20 + T-21 |
| FR-14 | A send failure does not roll back an adjudication | **3b.** 3a's equivalent — a send failure does not fail a *submission* → **T-10** |
| FR-15 | All ten types available and labelled | T-14 |

**Three scenarios straddle the 3a/3b boundary** (FR-3's review display, FR-4's publication, FR-14's adjudication rollback). Each is split explicitly above with its 3a half named, rather than cleared by citing a neighbouring requirement — the exact discharge KZ-001 forbids. 3b's coverage table must own the other halves.

**NFR ownership:** NFR-1 → T-12, T-13 · NFR-2 → T-10 · NFR-3 → **3b** · NFR-4 → T-5, T-6 · NFR-5 → T-17, T-18, T-22 (+DC-16/17 human) · NFR-6 → T-17 · NFR-7 → every frontend task's `npm run build` · NFR-8 → T-4 · NFR-9 → **3b** · NFR-10 → T-3, T-20, T-21.

## Verification Expectations

- Failure-only variants per root `CLAUDE.md`. **Failures print complete and verbatim** — that output is the Reviewer's evidence.
- Use `npx eslint "{src,test}/**/*.ts" --quiet` when verifying a backend diff; `npm run lint` there runs `eslint --fix` and **mutates files**.
- **An inconclusive verification is a legitimate outcome and must be reported as one** — never collapsed into a pass because a command exited `0`. T-13 (shared throttler state) and T-4 (empty log stream) are the two most likely to produce one.
- A `Read`/`Grep`/`Glob` Reviewer cannot run a suite; all run-evidence traces to the Implementer or the Leader.
- Per KZ-003, every frontend component here takes plain props — **no visual or a11y check may be deferred on "needs an authenticated session"**.

## PR Strategy

**~6,500 LOC over 23 tasks — four chained PRs.** Each description should follow `cognitive-doc-design` review-empathy rules: what to review first, what is out of scope, links to the previous and next PR.

| PR | Tasks | ~LOC | Review first |
|---|---|---:|---|
| **1 — Foundation** | T-1…T-6 | ~1,500 | T-6: it edits shared bootstrap, and `lambda-handler.e2e.spec.ts` is the only harness that can prove it |
| **2 — Public API + release gate** | T-7…T-13 | ~1,800 | T-12 then T-13. The gate is the totality assertion, not the enumeration |
| **3 — Applicant screens** | T-14…T-21 | ~2,600 | T-18's predicate, and what it cannot prove |
| **4 — a11y + constitution** | T-22, T-23 | ~600 | T-23 against `requirements.md` §14 row by row |

PR 1 and PR 2 are independently deployable and applicant-invisible. PR 3 is what makes the feature reachable — **do not deploy the frontend before PR 2's endpoints exist**, or the nav advertises a broken form (`design.md` §7).

## Execution Conventions

- Commits: `[SPEC:actors/public-self-registration] <message>`.
- **Evidence before checkbox:** append the `execution.md` entry with the Reviewer's PASS first, then flip to `[x]`, then commit.
- No task may introduce a new PII field without it being declared in `requirements.md` and, where applicable, the relevant policy module.
- AWS commands use `--profile IBD-DEV`.
- **Constraint-based tasks (T-7, T-10, T-11, T-6) must record the chosen mechanism and its evidence against each numbered constraint in `execution.md`.** That record is the deliverable those constraints exist to produce — a green suite without it leaves the next reader unable to tell which option was taken or why.
- Budget tripwires: **>23 tasks, >~7,300 LOC, or >37 review rounds halts and escalates.**
