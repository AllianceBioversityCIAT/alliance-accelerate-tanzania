# Tasks — Consent request by email for team-managed actors

- Spec path: `docs/specs/actors/consent-intake/consent-request-email/`
- Traces: [`requirements.md`](requirements.md) FR-1…FR-17, NFR-1…NFR-11 · [`design.md`](design.md) §2–§11 · [`judgment.md`](judgment.md) (APPROVED)
- Budget (design §10, re-baselined at decomposition): **14 tasks · ~11,300 LOC (the sum of the per-task estimates below) · ~20 review rounds.** Execution escalates if any figure is exceeded by more than 25 %.
- Commits: `[SPEC:actors/consent-intake/consent-request-email] <message>`. Every AWS command uses `--profile IBD-DEV`.

## How to read a task

Every task carries these fields:

| Field | Meaning |
|---|---|
| **Falsifier** | The concrete mutation and fixture on which the correct and the mutated code diverge. Done criteria require it to be **executed** against the post-change code. |
| **Red run** | The behavioural assertion seen failing before the fix. `n/a` for docs. |
| **Disqualifier** | What makes the evidence worthless. |
| **Consumers** | Files that pin a changed symbol (Consumer Sweep + Premise Ledger `consumer` rows). They are part of Verify. |
| **Review** | `full`, `lenses`, `checklist` or `skip-eligible`, with a reason. |

Verify commands are the root `CLAUDE.md` failure-only forms:

| Package | Verify |
|---|---|
| backend | `cd backend && npm test -- --silent <pattern>` · `npx eslint "{src,test}/**/*.ts" --quiet` · `npm run build` |
| frontend | `cd frontend && npm test -- --silent <pattern>` · `npm run lint` · `npm run build` · `npx tsc --noEmit` |

## PR plan

| PR | Tasks | Contents | Est. LOC |
|---|---|---|---|
| **PR 1 — Backend core** | T-1…T-7 | Schema, registry, send pipeline, public endpoints, evidence, documents + bucket | ~6,950 |
| **PR 2 — Frontend** | T-8…T-11 | Public page, bulk send, single send, evidence panel + upload | ~3,800 |
| **PR 3 — Baselines + live proof** | T-12…T-14 | PRD/TRD/UX/infra docs, constitution guides, DEV verification | ~570 |

PR 1 is safe to merge dark: no frontend entry point exists until PR 2. The bucket ships with PR 1, because `20-backend` deploys on merge (design P-21).

## Dependency graph

```
T-1 ─┬─► T-3 ─► T-4 ─► T-5 ─► T-8
     │     │      └──────► T-9 ─► T-10
     │     └─► T-6 ─────────────────► T-11
     └─► T-7 ───────────────────────► T-11
T-2 ─┴─► T-3
T-5, T-6, T-7 ─► T-12 ─► T-13
T-1…T-13 ─► T-14
```

---

## PR 1 — Backend core

- [x] **T-1 Schema, enums and the admin-assertable method rules** (deps: none)
  - **Size:** M (~900 LOC) · **Effort:** `max` (consent gate) · **Skills:** `nestjs-expert`, `tdd`
  - **Traces:** FR-10 (admin-gate BUT; *AND IT MUST NOT write/move into `EMAIL_LINK`*; scenario *link evidence is frozen*), FR-13 (data shape), NFR-9 (no FK) · design §4, §5.7, DD-9, P-2, P-15, P-16, P-28
  - **Scope:**
    - Prisma: `ConsentRequest` and `ConsentDocument` (no FK to `Actor`), `ConsentRequestStatus`, `ConsentDocumentStatus`, `ConsentMethod.EMAIL_LINK`, and the three new `ActorAuditAction` values. One additive migration, with the emitted SQL inspected before apply (backend/CLAUDE.md).
    - `common/consent-methods.ts` `ADMIN_ASSERTABLE_CONSENT_METHODS`. Wire it into the create DTO, `bulk-consent.dto.ts`, the import parser and `template-columns.ts`. `AdminActorUpdateDto` redeclares `@IsOptional() @IsIn(FULL)` on `consentMethod`.
    - `ActorsAdminService.update` rules 1–3. `bulkSetConsent`: a non-`GRANTED` `EMAIL_LINK` row counts as missing a method; an already-`GRANTED` `EMAIL_LINK` row is left untouched.
  - **Tests:**
    - The DTOs reject `EMAIL_LINK` on create, bulk and import.
    - Update accepts an unchanged `EMAIL_LINK` re-send (capacity-only edit).
    - Update refuses: a change to `EMAIL_LINK`; `EMAIL_LINK → DENIED → GRANTED` with `EMAIL_LINK`; and a date or reference or method change on a `GRANTED + EMAIL_LINK` actor.
    - Bulk unlock fills a `DENIED + EMAIL_LINK` row and leaves a `GRANTED + EMAIL_LINK` row untouched.
    - The template stays byte-identical.
    - The migration SQL has no `DROP` and no FK on `actorId`.
  - **Falsifier:**
    - Swap `ADMIN_ASSERTABLE_CONSENT_METHODS` for `Object.values(ConsentMethod)` in `actor-create.dto.ts`. The create-rejects-`EMAIL_LINK` test goes red.
    - Delete rule 2. The `DENIED → GRANTED` re-grant fixture (stored `EMAIL_LINK`, `acknowledged: true`, date set) goes red, because it now returns 200.
    - Delete rule 3. The date-edit fixture goes red.
    - Remove the bulk `GRANTED + EMAIL_LINK` skip. The relabel fixture goes red.
  - **Red run:** each refusal test above observed failing on its **status/assertion**, not on setup, before its rule is added.
  - **Disqualifier:**
    - A green from a fixture whose stored method is not `EMAIL_LINK`, because the rule is never reached.
    - A template "unchanged" claim not produced by `generate-template.spec.ts` itself.
  - **Consumers (P-15):**
    - Backend sources: `actor-create.dto.ts`, `bulk-consent.dto.ts`, `admin-actor-update.dto.ts`, `actor-import.service.ts`, `template-columns.ts`, `actors-admin.service.ts`, `consent-provenance.policy.ts`, `admin-actor-list-query.dto.ts`, `admin-registrations.service.ts`.
    - Backend tests: `generate-template.spec.ts`, `admin-actor-dto.spec.ts`, `consent-provenance.policy.spec.ts`, actors-admin service specs, `actor-import.service.spec.ts`.
    - Frontend: `ActorsTable.test.tsx` (the enum is visible there; it is fixed in T-11, so it must not break here).
  - **Review:** `full` — it changes the admin route to `GRANTED`.
  - **Done when:**
    - The first step re-reads P-16's refutation in `ActorForm.buildDto` and records it in `execution.md`.
    - All tests green, all falsifiers executed red.
    - Backend build, lint and the full suite green.

- [x] **T-2 Admin-managed consent edition registry** (deps: none)
  - **Size:** S (~450 LOC, mostly text + tests) · **Effort:** `medium` · **Skills:** `tdd`
  - **Traces:** FR-1 (all scenarios, the AND MUST NOT "signing", the BUT self-registration unchanged) · design §7.2, P-8, P-18
  - **Scope:**
    - `admin-consent-editions.json` holds `v1.0`: the `.docx` text verbatim plus the three substitutions.
    - The `admin-consent-policy.ts` loader (frozen, current edition, `editionHash`).
    - `__fixtures__/legal-admin-consent-v1.0.txt`, copied from the `textutil` extract. First step: re-run `shasum -a 256` on the `.docx` and record the result.
  - **Tests:**
    - The verbatim test (reverse the substitutions, normalize whitespace and bullets, compare).
    - The negative-word regex.
    - The sequence pin and the body digest.
    - The hash is stable and differs between two editions.
    - `consent-policy.editions.json` is byte-unchanged (`git diff --exit-code`).
  - **Falsifier:**
    - Change one word in the `v1.0` JSON. The verbatim test goes red.
    - Revert "By accepting" to "By signing". The negative-word test goes red.
    - Add a section to `v1.0`. The digest goes red.
  - **Red run:** the verbatim test is written against the fixture before the JSON exists, and is observed red on its comparison assertion.
  - **Disqualifier:** a normalizer broad enough that the one-word mutation stays green. The falsifier must be run to rule this out.
  - **Consumers:** none (new module). `consent-policy.spec.ts` must stay green.
  - **Review:** `checklist` — content task; the test is the gate.
  - **Done when:** the `.docx` sha256 matches P-18; the falsifiers have been executed red; the backend suite is green.

- [x] **T-3 Eligibility, preview, enqueue and supersession** (deps: T-1, T-2)
  - **Size:** L (~1,300 LOC) · **Effort:** `xhigh` · **Skills:** `nestjs-expert`, `tdd`, `api-design-principles`
  - **Traces:**
    - FR-2 (all scenarios, including the BUT on bulk skipping a decliner and the AND MUST API enforcement)
    - FR-3 (resend supersedes, server side)
    - FR-4 (*all matching*, *filter changed* — server)
    - FR-5 (ids target — server)
    - FR-12 (all three scenarios; the AND for a later Accept is completed in T-5)
    - FR-10 scenario *an admin re-grant does not inherit link evidence* (D-24, added at the T-1 continue gate)
    - design §5.1, §5.2 step 1, §5.5, P-6, P-12, P-30
  - **Scope:**
    - Pure `consent-eligibility.ts`.
    - Extract `buildAdminActorWhere(q)` from `adminList`, which keeps calling it.
    - `ConsentSupersessionModule` and `supersedePendingFor`.
    - Hooks inside `update` (consent status or email in the diff), `bulkSetConsent`, `remove` and `bulkDelete`.
    - `ConsentRequestsService.preview` / `enqueue` and the admin routes `POST preview` and `POST /admin/consent-requests`.
    - Module wiring: `ActorsModule` imports the supersession module; the new module re-provides the audit and resolver services.
    - **First step: edition shape fix (design §7.2 as amended 2026-10-05).** Move `acceptanceStatement` into each edition in `admin-consent-editions.json`, and update the loader and `admin-consent-policy.spec.ts` so the digest covers it. Pin the literal v1.0 `editionHash`. Correct the false comment in `canonicalAdminConsentEditionPayload`. This lands before any code stores an `editionHash`.
    - **D-24 (design §5.7 rule 4):** in `ActorsAdminService.update` and `bulkSetConsent`, a re-grant of a stored-`EMAIL_LINK` actor takes method, date and reference from the request, never the link-era values.
  - **Tests:**
    - The five-reason matrix fixture: one actor per reason.
    - Expired does not block.
    - Single vs bulk scope on a decliner.
    - Filter target equals `adminList`'s result set.
    - Two enqueues create one row per actor (pending blocks).
    - Supersede-on-edit for status and for email. A capacity-only edit leaves the request open.
    - Bulk lock, delete and bulk delete each supersede.
    - An expired `SENT` row is not superseded.
    - `adminList`'s existing specs stay green.
    - D-24: a single re-grant with no `consentObtainedAt` → `400`; with a date and no reference → `consentReference` is `null`. A bulk unlock of a `DENIED + EMAIL_LINK` row gets the batch's date and reference (or `null`), not the stored ones.
  - **Falsifier:**
    - Drop `FAILED` from the pending set. The double-enqueue fixture goes red.
    - Remove the `update` hook. The withdrawal fixture (`UNKNOWN` actor, open `SENT` request, PATCH `consentStatus: DENIED`) goes red, because the request stays `SENT`.
    - Make the `email` diff check `consentStatus` only. The email-corrected fixture goes red.
    - Supersede expired `SENT` too. The expired-evidence fixture goes red.
    - Fall back to the stored date on a D-24 re-grant. The missing-date fixture (stored `EMAIL_LINK` + `consentObtainedAt` set, status `DENIED`, PATCH `GRANTED` + `SIGNED_FORM` + `acknowledged`, no date) goes red, because it returns 200.
  - **Red run:** the supersede-on-edit test observed red on the request-status assertion before the hook exists.
  - **Disqualifier:** a filter-equality test whose fixture matches every actor, since it cannot tell the filter apart from no filter.
  - **Consumers:** `actors-admin.service.ts` (every spec touching `update`, `bulkSetConsent`, `remove`, `bulkDelete`, `adminList`), `actors.module.ts`, `admin-actors-crud.e2e.spec.ts`.
  - **Review:** `full` — it adds writes to four existing transactions.
  - **Done when:** all tests green, falsifiers executed red, the backend suite green.

- [x] **T-4 Dispatch, token, email, retry and the queue** (deps: T-3)
  - **Size:** L (~1,200 LOC) · **Effort:** `xhigh` · **Skills:** `nestjs-expert`, `tdd`, `error-handling-patterns`
  - **Traces:**
    - FR-4 (failure retryable; closing the tab, BUT none lost or twice — server)
    - FR-6 (both scenarios)
    - FR-7 (all three scenarios, including the AND MUST NOT on the subject)
    - FR-8 (validity window minted)
    - FR-13 (*consent requested* trail entry)
    - NFR-1 (minting, storage, no log)
    - NFR-6
    - NFR-7
    - design §5.2–§5.3, §7.1, DD-1–DD-3, P-9, P-10, P-29
  - **Scope:**
    - `consent-token.util.ts`.
    - `dispatch`: the budget is checked before the claim, the claim is a compare-and-set, eligibility is re-checked at claim, the token is minted and its hash stored, the email is sent, and the result write is a compare-and-set on `SENDING`. A stale-claim sweep runs at the start of each call.
    - `retry`, `queue`.
    - `consent-request.template.ts` and `MailService.sendConsentRequest`.
    - The `CONSENT_REQUESTED` audit row, written from the snapshot `traderId`.
    - **D-25 (added at the T-3 continue gate):** `ConsentRequestsService.enqueue` locks the targeted actor rows (`SELECT … FOR UPDATE`, parameterized) and evaluates eligibility inside its transaction (design §5.2 step 1, amended).
  - **Tests:**
    - A delayed fake transport (2.9 s per send) with a fake clock: the step stops claiming after 7.5 s and returns ≤ 11.5 s.
    - Two concurrent dispatches over one batch: each row is sent once.
    - A row superseded between claim and result stays `SUPERSEDED`, with no audit row.
    - A transport throw gives `FAILED`; retry then requeues it.
    - A stale `SENDING` row becomes `FAILED/stale_claim` and is not resent.
    - Eligibility failure at claim gives `SUPERSEDED`.
    - D-25: two concurrent bulk enqueues for the same eligible actor produce exactly one QUEUED row. The harness must interleave the two calls with deferred promises around the lock. A unit test also pins that the lock query runs inside the transaction, before the eligibility read.
    - The subject is byte-identical across two actors and contains no name, address or id.
    - The link puts the token only after `#`.
    - A `Logger` spy across dispatch captures neither the token nor the address.
  - **Falsifier:**
    - Remove the result compare-and-set. The superseded-mid-send fixture goes red.
    - Move the budget check after the claim. The timing test goes red (a claimed, unsent row is left behind).
    - Put the trader name in the subject. The subject test goes red.
    - Log the message object. The log-spy test goes red. Its vacuity guard asserts the spy captured at least one call.
  - **Red run:** the concurrency test is observed red on the "sent once" assertion with the claim compare-and-set removed. The fake transport defers its resolution so the interleaving is real, not synchronous.
  - **Disqualifier:**
    - A timing pass using real timers with a sub-millisecond transport, because the budget is never exercised.
    - A concurrency pass with a synchronous mock that serializes the calls.
  - **Consumers:**
    - `mail.service.ts` and its spec.
    - The templates directory.
    - ADR-015's subject inventory: TRD prose, updated in T-12.
  - **Review:** `full` — races and token secrecy.
  - **Done when:**
    - All tests green and falsifiers executed red.
    - P-9 remains owned by T-14, recorded in `execution.md`.

- [x] **T-5 Public view and respond, throttle, and the PII release gate** (deps: T-4)
  - **Size:** L (~1,300 LOC) · **Effort:** `max` · **Skills:** `nestjs-expert`, `tdd`, `api-design-principles`
  - **Traces:**
    - FR-1 (an old request renders its own edition)
    - FR-3 (the AND that R1's link is dead)
    - FR-8 (day 30 vs 31; used — AND a second answer changes nothing)
    - FR-9 (public set incl. GPS as-if-granted; identity required — AND API; decline needs nothing)
    - FR-10 (accept publishes; decline; race; respondent contact differs; *consent accepted/declined* trail with sentinel author)
    - FR-11 (six cases)
    - FR-12 (the AND that a later Accept does not grant)
    - NFR-1 (respond path), NFR-2, NFR-3, NFR-4, NFR-5
    - design §5.4, DD-4, DD-7, DD-11, P-13, P-14, P-31
  - **Scope:**
    - `ConsentPublicController` (`POST consent/view`, `POST consent/respond`) and `ConsentThrottleGuard` (no `forRoot`).
    - `ConsentPublicService`:
      - The token is declared with `@Allow()` only.
      - The miss body is uniform.
      - The preview is `toPublicDetail({ ...actor, consentStatus: GRANTED })`, loaded with `CROPS_INCLUDE`.
      - The respond transaction: compare-and-set, actor re-read, actor update, sentinel audit.
    - `pii-boundary.spec.ts`: a derived gate over `ConsentRequestsModule`, with its own fixture map and a totality check over its public and admin routes.
    - A `lambda-handler.e2e.spec.ts` case for `POST consent/view` that pins P-14 (`sourceIp`).
  - **Tests:**
    - The six miss cases (unknown, malformed — including a non-string and a 1-character token — expired, used, superseded, actor deleted) on both endpoints: same status, byte-identical body.
    - `NEVER_PUBLIC_FIELDS` absent by key and by value.
    - The preview equals `GET /actors/:id` after accept, GPS included.
    - Two concurrent responds: one success, one miss.
    - Accept → `GRANTED / EMAIL_LINK / respondedAt / request id`, and the actor appears in `GET /actors`.
    - Decline → `DENIED`, method unchanged.
    - A respondent email different from the actor's leaves the actor unchanged.
    - Request 21 within 60 s → `429`.
    - An old `v1.0` request renders `v1.0` after a fixture `v1.1` is registered.
    - A log spy over respond captures no token and no respondent field.
  - **Falsifier:**
    - Give "expired" a distinct message. The byte-identity test goes red.
    - Add `traderId` to the view response. The PII gate goes red.
    - Register a new public route without a fixture. The totality check goes red.
    - Drop `status: SENT` from the respond compare-and-set. The used-link fixture goes red.
    - Project without as-if-granted. The GPS-equality test goes red.
    - Add `@IsString() @Length(43)` on `token`. The malformed-case test goes red with a `400`.
  - **Red run:** the byte-identity and PII assertions are observed red under the falsifiers above (assertion-level). The race test uses deferred promises.
  - **Disqualifier:**
    - A PII sweep run against a `404` body, because the route did not exist. The gate must assert `200` first, the KZ-002 vacuity guard.
    - A race test whose mock resolves synchronously.
  - **Consumers:** `pii-boundary.spec.ts` (`FIXTURE_MAP` and totality — the existing registrations equality must stay green), `lambda-handler.e2e.spec.ts`, `role-aware.serializer.ts` (read only; `role-aware.serializer.spec.ts` must stay green).
  - **Review:** `lenses` — security lens, PII lens, concurrency lens.
  - **Done when:**
    - All tests green, falsifiers executed red.
    - The P-14 pin is green on a real-handler event.
    - The full backend suite, build and lint are green.

- [x] **T-6 Evidence read, edition text, audit kinds and the immutability gate** (deps: T-3, T-4)
  - **Size:** M (~700 LOC) · **Effort:** `high` · **Skills:** `nestjs-expert`, `tdd`
  - **Traces:**
    - FR-13 (retention — *deleted actor*; *no edit path* — AND MUST be shown by a test)
    - FR-14 (server: walk-through data, derived `EXPIRED`)
    - NFR-9
    - design §5.8, §6, DD-6, P-3, P-5
  - **Scope:**
    - `GET admin/actors/:id/consent-evidence`: newest first, derived `EXPIRED`, never `tokenHash`, works for a deleted actor.
    - `GET admin/consent-editions/:version`.
    - `audit-entry.serializer.ts` handles the three new actions.
    - §5.8's two immutability tests.
    - **D-26 backend (design §5.7a, added 2026-10-06):** `AdminActorUpdateDto.expectedUpdatedAt` (optional ISO). `ActorsAdminService.update` locks the actor row first (`FOR UPDATE`), then returns `409` when the expected version differs from the stored `updatedAt`. Tests: matching version → 200 unchanged behaviour; stale version → 409 and nothing written; absent → today's behaviour; a respond committed after load makes the admin save conflict. Falsifier: skip the comparison → the stale-version test goes red.
    - **`EMAIL_LINK` single-writer gate (routed from T-5 review, 2026-10-06):** a static sweep over `backend/src/**/*.ts` (excluding specs) asserting that the only production site writing `ConsentMethod.EMAIL_LINK` into an `Actor` is `ConsentPublicService.respond` (the requirements defect-class row). Falsifier: add an `EMAIL_LINK` write in a scratch file → the sweep goes red.
    - QA-3 coverage for every admin route this module adds (Staff → `403`, anonymous → `401`) via the T-5 derived gate fixtures.
  - **Tests:**
    - Delete an actor with 2 requests and 1 document: the evidence and the history are still returned.
    - The response key set contains no `tokenHash`.
    - The write-site sweep equals the four owners.
    - An answered row gets `count = 0` from every write method.
    - A 31-day-old `SENT` row reads `EXPIRED`.
  - **Falsifier:**
    - Add a `consentRequest.update` in a scratch service file. The sweep goes red.
    - Include `tokenHash` in the select. The key-set test goes red.
    - Add `ACCEPTED` to the supersede `where`. The terminal test goes red.
  - **Red run:** the sweep is observed red with the scratch write present (then removed).
  - **Disqualifier:** a sweep whose regex matches nothing. It must first assert that it found ≥ 4 sites.
  - **Consumers:** `audit-entry.serializer.ts` and its spec; `actor-audit.service.spec.ts`.
  - **Review:** `full`.
  - **Done when:** all tests green, falsifiers executed red.

- [x] **T-7 Consent documents: bucket, IAM, storage port and routes** (deps: T-1)
  - **Size:** L (~1,100 LOC) · **Effort:** `xhigh` · **Skills:** `aws-serverless`, `nestjs-expert`, `tdd`
  - **Traces:**
    - FR-13 (*document uploaded* trail entry)
    - FR-15 (storage, no gate bypass, unconfigured; *create with a document* — AND consent fields unchanged (server); *wrong type or size* — AND storage enforces; *never completes*)
    - FR-16 (link expiry ≤ 5 min; role)
    - NFR-8
    - design §5.6, §7.4, DD-8, DD-12, P-17, P-19, P-20, P-32
  - **Scope:**
    - `infra/20-backend/template.yaml`:
      - `ConsentDocumentsBucket` (named `${AWS::StackName}-consent-docs-${AWS::AccountId}`), with the four Block Public Access settings, `BucketOwnerEnforced`, `AES256`, versioning, one lifecycle rule on `incoming/` (1 d / 1 d noncurrent / abort multipart 1 d), CORS `POST` from `AllowedOrigin` (+ legacy), `Retain`, and tags;
      - a TLS-only bucket policy;
      - the IAM statement (incoming/ put, get, delete; stored/ put, get);
      - the `CONSENT_DOCUMENTS_BUCKET` env var.
    - Backend:
      - the S3 SDK dependencies;
      - `DocumentStorage` (S3 and unconfigured adapters);
      - `ConsentDocumentsService`;
      - the routes `status`, `upload-url`, `confirm` (idempotent, `HeadObject` check, copy, delete, `STORED`, audit from the snapshot) and `download-url`.
  - **Tests:**
    - The presign unit test pins key `incoming/<id>`, `content-length-range 1..10485760`, exact `Content-Type`, and 300 s.
    - The download presign pins 300 s and `attachment`.
    - Confirm with a size or type mismatch → `422` and the object is deleted.
    - Double confirm is idempotent.
    - Confirm after actor deletion → `STORED`, and the audit row uses the snapshot `traderId`.
    - Unconfigured → `status.enabled=false` and `upload-url 503`.
    - A `PENDING` document is never listed.
    - Staff → `403` on all four routes.
    - Uploading never changes the actor's consent fields.
  - **Falsifier:**
    - Raise the length condition to 20 MB. The presign pin goes red.
    - Drop `attachment`. The download pin goes red.
    - Skip the `HeadObject` comparison. The mismatch fixture (declared PDF 1 MB, head says PNG 12 MB) goes red.
    - Add `s3:*` or `Resource: "*"` to the template. A template assertion test (parse the YAML, assert no `*` action or resource in the new statement) goes red.
  - **Red run:** the presign pins are observed red on the condition assertions before the conditions are set.
  - **Disqualifier:**
    - A presign test that checks the mocked SDK received *something*, not the exact conditions.
    - Any claim that live IAM works. That is unevaluable here (mocked SDK) and owned by T-14.
  - **Verify (extra):**
    - `./infra/scripts/validate.sh` green.
    - `./infra/scripts/tests/run-tests.sh` green, so no account-id literal is introduced.
  - **Consumers:** `infra/20-backend/template.yaml` `ApiFunction` env and policy (the smoke and set-cors script cases in `run-tests.sh`); `backend/package.json`.
  - **Review:** `full` — new infrastructure on the auto-deploy path.
  - **Done when:**
    - All gates green, falsifiers executed red.
    - The emitted `sam validate --lint` output pasted in `execution.md`.

---

## PR 2 — Frontend

Every task here also attaches a **rendered capture** (headless Chromium over CDP) at 375 / 768 / 1440 px of each new state, for the HITL pause. jsdom cannot evaluate layout (NFR-10 gap). Production fonts must be loaded, and no-overflow is measured, never inferred from class names.

- [x] **T-8 Public consent page** (deps: T-5)
  - **Size:** L (~1,100 LOC) · **Effort:** `high` · **Skills:** `frontend-design`, `tailwind-design-system`, `vercel-react-best-practices`, `react-doctor`
  - **Traces:**
    - FR-9 (all scenarios incl. the BUT no edit; the scroll gate; token leaves the address bar; refresh)
    - FR-10 (UI of accept and decline)
    - FR-11 (*page shows no record*)
    - NFR-10, NFR-11
    - design §7.3 (public), DD-5, P-21, P-22, P-23, P-26, P-27
  - **Scope:**
    - `app/(consent)/layout.tsx`: Header + main + Footer, `robots noindex`, no analytics.
    - `app/(consent)/consent/page.tsx`: read the fragment → `replaceState('/consent/')` → `view` → the state machine (loading, ready, no-token, dead-end, throttled, submitting, done-accepted, done-declined, error).
    - `ConsentRecordPreview`, `RespondentFields`, `ConsentResponseForm` (decline confirm), `ConsentDeadEnd`.
    - Extract `ConsentTextScrollGate` from `ConsentPolicyDisclosure` (behaviour-preserving).
    - `lib/api/consent-public.ts`.
  - **Tests:**
    - The fragment is stripped before any fetch resolves.
    - A refresh without a fragment shows the no-token copy, not the dead-end copy.
    - The checkbox is disabled until the end of the text.
    - Accept with an empty Position shows a field error and makes no call.
    - Decline confirm calls `respond` with no identity.
    - `404` → dead-end shows no organization or field.
    - The layout tree contains no `GoogleAnalytics` or `ConsentProvider` (NFR-11).
    - `jest-axe` on ready, dead-end and done.
    - The existing `ConsentPolicyDisclosure`, `RegistrationForm` and register-page tests stay green.
  - **Falsifier:**
    - Render the page under `(public)`. The layout test goes red.
    - Call `view` before `replaceState`. The ordering test goes red.
    - Remove `disabled={!reachedEnd}` from the gate. The scroll-gate test goes red (in both the consent page and `ConsentPolicyDisclosure` suites).
  - **Red run:** the layout test is observed red with the page placed in `(public)`.
  - **Disqualifier:**
    - Any layout or contrast claim from jsdom.
    - An a11y pass with axe reporting "incomplete" on color contrast. That property is unevaluable in jsdom, so contrast is covered by `lib/contrast.test.ts` tokens and the HITL capture.
  - **Consumers (P-23):** `ConsentPolicyDisclosure.tsx` and its test; `RegistrationForm.tsx` and its test; `consent-scroll-gate.ts` and its test; `register/page.test.tsx`; `register-a11y.test.tsx`; `submitted-a11y.test.tsx`.
  - **Review:** `full`.
  - **Done when:**
    - The frontend test, lint, build and `tsc` all green.
    - `out/consent/index.html` exists after build.
    - Captures attached.

- [x] **T-9 Bulk send from Admin → Actors** (deps: T-4)
  - **Size:** L (~1,000 LOC) · **Effort:** `high` · **Skills:** `frontend-design`, `shadcn-ui`, `vercel-react-best-practices`, `react-doctor`
  - **Traces:**
    - FR-2 (skip breakdown shown by reason)
    - FR-4 (all scenarios incl. *closing the tab* — resume banner; card-view reachability)
    - FR-6 (UI loop)
    - NFR-10
    - design §7.3 (admin bulk), P-24
  - **Scope:**
    - `BulkActionBar` gains `onSendConsent`.
    - A "Select all N matching" strip (table and cards, with a "Select page" control below `lg`).
    - `SendConsentDialog`: preview → confirm → progress (`aria-live`) → result, with **Retry failed**.
    - `useConsentDispatch`: loops while `remaining > 0`; stops on unmount.
    - `ConsentQueueBanner`.
    - `lib/api/consent-requests-admin.ts`, with types mirroring the backend.
    - `lib/content/consent-requests.ts`: total `Record`s for statuses and skip reasons.
  - **Tests:**
    - A filter target sends `{ kind:'filter', filter: URL params }`, not ids.
    - Nothing eligible → send disabled and the breakdown shown.
    - The loop stops at `remaining 0`.
    - Result 47 / 3 offers retry, which calls `retry` and then dispatch.
    - The banner shows when `queue` > 0.
    - The card view can reach select-all-matching.
    - `jest-axe` on the dialog states.
    - The existing actors page tests stay green.
  - **Falsifier:**
    - Send `selectedIds` in filter mode. The filter-target test goes red.
    - Make the loop stop after one call. The loop test goes red.
    - Remove a skip-reason key from the label `Record`. `tsc` goes red (compile gate).
  - **Red run:** the filter-target test observed red on the request-body assertion.
  - **Disqualifier:** loop tests with a mock returning `remaining: 0` on the first call, since they cannot detect a one-shot loop.
  - **Consumers:** `BulkActionBar.tsx` and its test; `actors/page.tsx` and `page.test.tsx`; `ActorsTable.tsx` (selection props) and its test.
  - **Review:** `full`.
  - **Done when:** frontend gates green; captures attached.

- [x] **T-10 Single send: actor page action, post-create prompt, import offer** (deps: T-9)
  - **Size:** M (~700 LOC) · **Effort:** `medium` · **Skills:** `frontend-design`, `react-doctor`
  - **Traces:**
    - FR-3 (edit-page action disabled with a reason; Resend; post-create prompt — AND MUST NOT when `GRANTED`; weak-duplicate + prompt)
    - FR-5 (all scenarios incl. the BUT only this commit's actors)
    - FR-2 (single re-asks a decliner — UI)
    - design §7.3, P-25
  - **Scope:**
    - The edit page's **Send consent request** / **Resend** button (`scope: 'single'`).
    - `SendConsentPrompt` on `new/page.tsx`. It merges the duplicate warnings, renders the send question only when the actor is not `GRANTED`, and defaults to Send.
    - The import result CTA: `preview({ kind:'ids', ids: createdActorIds }, 'bulk')` → `SendConsentDialog`.
  - **Tests:**
    - A `GRANTED` create shows no send question.
    - Warnings and the question appear in one dialog.
    - **Not now** sends nothing and navigates.
    - The CTA count comes from preview (12 created, 2 `GRANTED` → 10).
    - 0 created → no CTA.
    - The CTA ids equal exactly the `created` rows' `actorId`s.
    - Resend is labelled when a pending request exists.
  - **Falsifier:**
    - Drop the `GRANTED` gate. The `GRANTED`-create test goes red.
    - Pass all rows' ids (including failed rows). The ids-equality test goes red.
  - **Red run:** the `GRANTED` gate test observed red on the absent-question assertion.
  - **Disqualifier:** a CTA test whose fixture has no `GRANTED` or failed rows.
  - **Consumers:** `new/page.tsx` and its test (`DuplicateWarningInfoDialog` is replaced); `import/page.tsx` and its test; `edit/page.tsx` and its test.
  - **Review:** `checklist` — UI wiring over reviewed APIs.
  - **Done when:** frontend gates green; captures attached.

- [x] **T-11 Evidence panel, document field, history labels and method lists** (deps: T-6, T-7, T-1)
  - **Size:** L (~1,000 LOC) · **Effort:** `high` · **Skills:** `frontend-design`, `tailwind-design-system`, `react-doctor`
  - **Traces:**
    - FR-14 (all scenarios)
    - FR-15 (UI: create and edit field; unconfigured; wrong type or size client check; create fails → at most one document)
    - FR-16 (download action)
    - FR-13 (trail labels, "Consent link (actor)")
    - FR-10 (form: read-only `EMAIL_LINK`, frozen evidence, select swap on status change)
    - design §5.7 (frontend lists), §7.3, P-15
  - **Scope:**
    - `ConsentEvidencePanel`: requests and documents; UTC with qualifier; "read exact text"; download.
    - `ConsentDocumentField`: deferred upload on create (after the actor exists, then confirm); immediate in the panel; disabled when not enabled.
    - `ActorHistoryPanel`: the three actions and the sentinel author.
    - `ActorsTable`: total `Record` labels and the test derived from the union.
    - `ActorForm`: `EMAIL_LINK` read-only; date and reference frozen while `GRANTED` by link; select swap when the status differs from the stored one.
    - The actors filter gains `EMAIL_LINK`.
    - **D-26 frontend:** `ActorForm` edit mode always sends `expectedUpdatedAt` (the loaded record's `updatedAt`). On a `409` it shows an accessible notice, "This actor changed since you opened it — reload to see the latest", with a Reload action, and does not lose the admin's typed values silently. Test: a mocked 409 shows the notice; the PATCH body carries `expectedUpdatedAt`.
  - **Tests:**
    - The auditor walk-through fixture renders sender, time, address, edition, respondent and IP.
    - Empty state.
    - `EXPIRED` badge.
    - A 12 MB or `.docx` file is rejected with no network call.
    - A create failure leaves no upload attempt.
    - Unconfigured disables the field.
    - An `EMAIL_LINK` actor's form submits the stored method and shows the date read-only.
    - Changing the status shows the empty assertable select.
    - The `ActorsTable` label for `EMAIL_LINK` is "Email link (actor)".
    - `jest-axe`.
  - **Falsifier:**
    - Delete the `EMAIL_LINK` entry from the label `Record`. `tsc` goes red.
    - Upload before the create resolves. The create-fails test goes red.
    - Leave the date editable. The frozen-evidence test goes red.
  - **Red run:** the derived-union `ActorsTable` test observed red against today's switch (it renders "Not recorded").
  - **Disqualifier:** a label test whose input list is hard-coded again, which is the very defect S-3 found.
  - **Consumers:** `ActorsTable.tsx` and `ActorsTable.test.tsx`; `ActorForm.tsx` and its tests; `ActorHistoryPanel.tsx` and its test; `AcknowledgeDialog.tsx`; `actors/page.tsx`; `lib/api/actors-admin.ts` (`ConsentMethod`, `AuditEntry['action']`).
  - **Review:** `full`.
  - **Done when:** frontend gates green; captures attached.

---

## PR 3 — Baselines and live proof

- [ ] **T-12 Baseline documents: PRD, TRD, UX design, infrastructure** (deps: T-5, T-6, T-7)
  - **Size:** M (~450 LOC docs) · **Effort:** `high` · **Skills:** `software-architect`, `product-manager-toolkit`, `cognitive-doc-design`
  - **Traces:**
    - FR-17 (PRD, TRD, UX, infra; *no constitutional sentence left false* for the TRD/PRD part)
    - NFR-9 (personal-data inventory)
    - design DD-13, P-11; KZ-004, KZ-006
  - **Scope:**
    - **PRD:** the respondent persona, an In-Scope item, US-10, and an AC-9 for consent requests.
    - **TRD:**
      - §2 module row;
      - §3 the two entities, the sentinel `actingSub`, and the `EMAIL_LINK` method;
      - §3.1-style personal-data inventory (respondent identity, IP, UA, `recipientEmail`, documents);
      - §4 every new route;
      - §8 the token-bearer disclosure and the actor-originated route to `GRANTED`;
      - §13 QA-14 (token endpoints);
      - §12.5 **ADR-NNN**, allocated now after `git log --oneline --all -20 -- docs/trd/trd.md` (candidate ADR-018), amending TRD §4's "only public path" sentence and ADR-013's consequence scope;
      - ADR-015's subject inventory gains a ninth kind;
      - §12.1/§12.2 diagrams gain the bucket and the consent arrow.
    - **UX design:** the `/consent` route in §2, the screens in §4, the components in §8.
    - **Infrastructure:** the bucket in §2, the teardown note (`Retain`), the absent-CSP dependency (P-32), and the local unconfigured state.
  - **Tests (sweep):** `grep -rniE "only (public )?path|only for a .?GRANTED|contact block .{0,40}only" docs/prd.md docs/trd/trd.md docs/ux-ui/design.md docs/infrastructure.md`. Every hit is amended or scoped, and the hit list is pasted. A second sweep checks the obligation, not the identifier: every TRD sentence asserting the full set of routes, tables, or subjects (`grep -niE "eight kinds|four tables|every (public|route)"`).
  - **Falsifier:** leave TRD §4's `GET /actors/:id` "the only public path that does" unamended. The sweep must list it as a hit. Run the sweep on the pre-change file first to show it finds that sentence.
  - **Red run:** the sweep run on the pre-change docs, with the hit list recorded.
  - **Disqualifier:** a sweep pattern that finds 0 hits on the pre-change TRD, since it cannot see the sentence it exists for.
  - **Consumers:** every archived spec citing TRD `§n` (numbers are not renumbered, ADR-009).
  - **Review:** `full` — constitutional baseline.
  - **Done when:** the sweeps are pasted with dispositions; ADR-NNN is allocated with the unmerged-branch check recorded.

- [ ] **T-13 Constitution guides: root and backend mirrors** (deps: T-12)
  - **Size:** S (~120 LOC docs) · **Effort:** `high` · **Skills:** `cognitive-doc-design`
  - **Traces:** FR-17 (root guides; *mirrors in lockstep*; *no constitutional sentence left false* for guides) · design DD-13
  - **Scope:** amend the PII hard constraint in `CLAUDE.md`, `AGENTS.md`, `backend/CLAUDE.md` and `backend/AGENTS.md`. It must name the token-bearer read as a third, single-actor disclosure path (non-`GRANTED`, the public-detail set, never `NEVER_PUBLIC_FIELDS`). Add the `consent-requests` module notes to `backend/CLAUDE.md`: the second `pii-boundary` derived gate, the sentinel `actingSub`, `EMAIL_LINK` never admin-assertable, and the bucket env var.
  - **Tests (sweep):**
    - `grep -nE "only on the single-actor|GRANTED. actor.s full contact|never on any list" CLAUDE.md AGENTS.md backend/CLAUDE.md backend/AGENTS.md`: every hit amended.
    - `diff <(sed -n '/Hard constraints/,/## /p' CLAUDE.md) <(sed -n '/Hard constraints/,/## /p' AGENTS.md)` shows the same PII bullet in both.
  - **Falsifier:** amend `CLAUDE.md` only. The lockstep diff shows the PII bullet differing.
  - **Red run:** the sweep run before the edit, with the hits recorded.
  - **Disqualifier:** a lockstep check that compares whole files, which already differ by design (`AGENTS.md` intro). Compare the PII bullet only.
  - **Consumers:** `frontend/CLAUDE.md` / `AGENTS.md` (checked for a PII restatement; none expected).
  - **Review:** `full` — constitution.
  - **Done when:** both sweeps pasted.

- [ ] **T-14 Live verification on DEV (HITL)** (deps: T-1…T-13, after deploy)
  - **Size:** S (~0 LOC; evidence only) · **Effort:** `high` · **Skills:** `aws-serverless`, `systematic-debugging`
  - **Traces:** NFR-6 / P-9 (throughput), NFR-8 (live IAM and bucket gap), FR-16 (live expiry), FR-10 (one real accept end to end), NFR-10 (the captures reviewed at the HITL pause)
  - **Scope:** with the product owner present, every AWS command with `--profile IBD-DEV`:
    1. **Throughput.** Send to 20 test actors whose emails are controlled. Record the per-dispatch `sent` and `elapsedMs` from the logs. **Decision rule:** if throughput is below 1.1 sends/s, escalate to proposal option A2 rather than ship (design R-4).
    2. **Documents.** Upload a real PDF through the UI, confirm, download it, and check the `Content-Disposition`. **Also (T-7 review A-1, added 2026-10-06):** with the deployed role, confirm a document id whose upload never happened. Expect `422`. A `500` means S3 returned `403`: the `s3:prefix`-conditioned `ListBucket` does not apply to `HeadObject`'s implicit check. The predefined fallback is an unconditioned `s3:ListBucket` on the bucket ARN, which exposes key names to the Lambda role only. It needs a design §7.4 amendment and a template-test change. Retry the download link after 6 min and expect `AccessDenied`. `aws s3api get-public-access-block` on the bucket shows all four settings `true`.
    3. **One real request.** Accept it, then confirm the actor on `/directory` and `/profile`. Reopen the link and get the dead-end page.
    4. Review the T-8…T-11 captures.
  - **Falsifier:**
    - The download is retried after the expiry, and must fail.
    - The link is reopened after accepting, and must give the dead-end page.
    - A probe `curl -X PUT` to the bucket URL without a signature must be refused.
  - **Red run:** n/a (live).
  - **Disqualifier:**
    - A throughput figure from fewer than 3 dispatch calls, or from the local stack.
    - Any step run on a non-`IBD-DEV` profile.
  - **Consumers:** none.
  - **Review:** `checklist` — evidence audit of `execution.md`.
  - **Done when:** all four steps' outputs are pasted in `execution.md`, and P-9 is settled (confirmed, or escalated).

---

## Coverage closure (clause level — KZ-001)

| Requirement clause | Owner |
|---|---|
| FR-1 verbatim · AND MUST NOT "signing" · append-only · BUT self-registration unchanged | T-2 |
| FR-1 old request keeps its text | T-2 (registry), T-5 (page renders the request's edition) |
| FR-2 reasons distinct (server / UI) | T-3 / T-9 |
| FR-2 expired does not block · AND MUST API enforcement | T-3 |
| FR-2 single re-asks a decliner · BUT bulk skips | T-3 (server), T-10 (UI) |
| FR-3 action disabled with reason · Resend label | T-10 |
| FR-3 post-create prompt · AND MUST NOT when `GRANTED` · weak-duplicate + prompt | T-10 |
| FR-3 resend supersedes / AND R1's link dead | T-3 / T-5 |
| FR-4 all matching | T-3, T-9 |
| FR-4 nothing eligible · card view | T-9 |
| FR-4 failure retryable | T-4, T-9 |
| FR-4 closing the tab · BUT none lost or twice | T-4, T-9 |
| FR-4 filter changed | T-3 |
| FR-5 eligible-only count · nothing created · BUT only this commit | T-10 (T-3 preview) |
| FR-6 crash · concurrent tabs | T-4 |
| FR-7 fixed subject + AND MUST NOT · fragment link · no token in logs | T-4 (send), T-5 (respond logs) |
| FR-8 30-day window minted | T-4 |
| FR-8 day 30 vs 31 · used + AND no second change | T-5 |
| FR-9 public set (incl. GPS as-if-granted) · identity required + AND API · decline needs nothing | T-5 (server), T-8 (UI) |
| FR-9 token leaves the address bar · refresh · scroll gate · BUT no edit | T-8 |
| FR-10 accept publishes · decline · race · respondent contact differs | T-5 |
| FR-10 BUT admin gate unchanged · AND MUST NOT write/move into `EMAIL_LINK` · link evidence frozen | T-1 (server), T-11 (form) |
| FR-11 six cases byte-identical | T-5 |
| FR-11 page shows no record | T-8 |
| FR-12 withdrawal · email corrected · unrelated edit | T-3 |
| FR-12 AND later Accept does not grant | T-5 |
| FR-13 record fields | T-1 (schema), T-4, T-5 |
| FR-13 immutability · deleted actor · AND MUST test | T-6 |
| FR-13 trail entries: requested / responded (sentinel) / document | T-4 / T-5 / T-7; labels T-11 |
| FR-14 walk-through · empty · expired derived | T-6 (server), T-11 (UI) |
| FR-15 storage · no gate bypass · unconfigured (server) · AND storage enforces · never completes | T-7 |
| FR-15 create with document + AND consent fields unchanged | T-7 (server), T-11 (UI) |
| FR-15 wrong type/size (client) · create fails → one document · unconfigured (UI) | T-11 |
| FR-16 link expiry | T-7 (pin), T-14 (live) |
| FR-16 role | T-7 |
| FR-16 download action | T-11 |
| FR-17 PRD/TRD/UX/infra · sentence sweep (baselines) | T-12 |
| FR-17 root and backend guides · mirrors in lockstep · sentence sweep (guides) | T-13 |
| NFR-1 | T-4, T-5 |
| NFR-2, NFR-3, NFR-4, NFR-5 | T-5 |
| NFR-6 | T-4 (unit), T-14 (live) |
| NFR-7 | T-4 |
| NFR-8 | T-7 (template + pins), T-14 (live) |
| NFR-9 | T-1 (no FK), T-6 (terminal rows), T-12 (inventory) |
| NFR-10 | T-8…T-11 (axe + captures), T-14 (HITL review) |
| NFR-11 | T-8 |
| Premise P-9 (`UNVERIFIED`, High) | T-14 step 1 |

No clause above is discharged by citing a different requirement. Each owner was checked against the clause text in `requirements.md` at this revision.

## `skip-eligible` tasks

None. Every task touches the consent gate, PII, infrastructure, a constitutional document, or is the live proof.
