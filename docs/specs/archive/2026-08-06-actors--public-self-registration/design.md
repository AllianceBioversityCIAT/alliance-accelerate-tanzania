# Design — Public Self-Registration & Admin Review Queue

- Spec path: `docs/specs/actors/public-self-registration/`
- Status: **Draft — revision 2**, rewritten 2026-08-05 after Judgment Day round 1 (`judgment.md`)
- Traces requirements: FR-1 … FR-15, NFR-1 … NFR-10
- Author / Date: AKILI (Leader) on behalf of JuanCode · drafted 2026-08-04, revised 2026-08-05
- Constitutional refs: `docs/trd/trd.md` §2–§6, §8, §12, §13 · `docs/ux-ui/design.md` §2, §4, §6–§10 · `backend/CLAUDE.md` · `frontend/CLAUDE.md`

> **Revision 2 note.** Revision 1 was audited by two blind judges: 8 findings confirmed SEVERE by both, 7 confirmed with contested severity, 7 single-judge SEVEREs since verified by the Leader against the files. Ten were verified directly. **Every claim in this document about existing code now carries a `file:line` citation, and any statement without one is a design decision, not an observation.** Revision 1's §1 was headed *"verified present, not assumed"* over a table assembled from a subagent's summary; seven false claims passed under that label. The label is gone. See §13 for the full disposition.

> ## ⚠️ Revision 3 — scope split and the constraint reframing
>
> **Two changes, both user-approved 2026-08-05.**
>
> **1. This design covers the applicant flow only.** The admin review queue moved to `docs/specs/admin/registration-review-queue/` (chunk 3b). Sections below that describe admin work — **§2.4, §2.5, §3.2, §4.6, §4.7, §4.8, §5.5, §5.6, DD-6, DD-10** — are retained unrenumbered as **inherited material for 3b**, cited by that spec's proposal §7, and are **not obligations of this spec**. 3a still creates the **full** `Registration` model including the adjudication columns, so 3b needs no schema migration beyond widening `ActorAuditAction`.
>
> **2. Four mechanisms are downgraded to constraints.** The scoped re-judgment found that revision 2's corrections *injected* six severe defects, and **four of them were mechanisms invented under audit pressure** — a counter row that no schema object declared (RA1), a lockout with no defined response and no byte-identity story (RA2), a lockout key that let an attacker deny service to every applicant (RA3), and an OTP lookup on a non-unique column with no row-selection rule (RA4). Each read as a plausible answer to *"how?"* and none could be validated by any gate a document carries.
>
> **The lesson, and the change:** the correct response to *"this requirement has no mechanism"* is often to state the **constraint** and the **rejected options**, and let the choice be made where it can actually be tested. §4.3, §4.4 and §4.5 are rewritten in that form below. The Implementer makes four real decisions and records each in `execution.md` with its evidence — which is more honest than a fourth pass at prose, with zero fix rounds left to catch it.
>
> **RA5 is 3b's**, not fixed here: routing `REGISTRATION_APPROVE` into actor history reaches `frontend/lib/api/actors-admin.ts:203` (a hardcoded five-member union) and `ActorHistoryPanel.tsx`'s `actionBadgeClasses` (five cases, **no `default`**). `IMPORT` is already absent from both, so the drift is live in the repo today and degrades silently. Carried to 3b's proposal §7.2.

---

## 1. Approach Overview

One new NestJS module (`registrations`), two supporting modules (`mail`, `logging`), five new frontend routes, and **six** additive Prisma schema objects: the `RegistrationStatus` enum, `Registration`, `EmailVerification`, **`EmailSendBudget`**, **`RegistrationSequence`** and **`RegistrationLookupAttempt`**.

> *Corrected 2026-08-06 during execution — the count read "three" and omitted the last two. Both were chosen by Implementers under constraints this design states rather than mechanisms it prescribes: `EmailSendBudget` (T-7) is the atomic per-email send cap §4.3 requires but does not specify, and `RegistrationSequence` (T-10) is the allocator §4.5's **A-4** requires be declared. **This is the C-10-class disclosure failure A-4 names by name, and it recurred here** — `EmailSendBudget` was absent from §2 for three tasks before a Reviewer found the count wrong by two. When a constraint-not-mechanism section is answered with a new schema object, §2 and §2.6 must be swept in the same change (KZ-004).*

The organising principle is **structural containment rather than filtered access**. The registry's existing PII guarantee filters `Actor` rows and allowlists `Actor` fields (ADR-003, ADR-004); neither can protect a `Registration`, because both enumerate `Actor` — `PII_ALLOWLIST` and `NEVER_PUBLIC_FIELDS` are `Actor` column lists (`backend/src/common/pii-consent.policy.ts:31-38`, `:60-68`). So this design does not extend them. Submissions live in a table whose **public surface returns two or three scalars and never reads the payload column**, and §6.2 makes that checkable rather than conventional.

```
┌── PUBLIC (unauthenticated) — 4 endpoints ──────────────────────────────────┐
│  GET  /registrations/consent-policy   → { version, sections }              │
│  POST /registrations/verify           → 202, empty, ALWAYS                 │  no DB row
│  POST /registrations                  → { reference }                      │  ← FIRST public write
│  POST /registrations/lookup           → { status, reviewNote? }            │  body, not query
└────────────────────────────────────────────────────────────────────────────┘
        │ payloadCap (raw app.use, ahead of the body parser) → throttle guard
        ▼
┌── RegistrationsModule ─────────────────────────────────────────────────────┐
│  EmailVerificationService   OTP: issue · verify (attempt-counted) · consume │
│  RegistrationsService       submit · lookup                                │
│  RegistrationReviewService  queue · detail · approve · reject · dismiss     │
│  DuplicateDetectionService  candidate matching, admin-only, read-time       │
│  ConsentPolicy              versioned text — one source for API and UI      │
└────────────────────────────────────────────────────────────────────────────┘
        │ approve: ONE $transaction (OTP consumed inside it)
        ▼
  compare-and-set status → derive traderId from reference → assert chunk 1's
  consent invariant → actor.create (P2002 → 409) → crop links
  → logRegistrationApprove(tx) → registration.update
        │
┌── ADMIN (JwtAuthGuard + RolesGuard + @Roles('Admin')) — 5 endpoints ───────┐
│  GET /admin/registrations · /:id · POST /:id/{approve,reject,dismiss-duplicate} │
└────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Reused as-is — each claim cited

| Asset | Citation | Used for |
|---|---|---|
| `isConsentProvenanceSatisfied` | `backend/src/common/consent-provenance.policy.ts:81-118` | Approval's consent check (DD-3) |
| Audit writes take a transaction client | `actor-audit.service.ts` — all methods take `tx: Prisma.TransactionClient` | Audit inside the approval transaction |
| Acting-admin resolution, server-side | `actors/acting-admin.resolver.ts`; token carries only `sub` (`backend/CLAUDE.md`) | Reviewer identity |
| `AcknowledgeDialog` | `frontend/components/admin/AcknowledgeDialog.tsx`; **mandated** by `frontend/CLAUDE.md:26` for any submit setting `consentStatus` to `GRANTED` | FR-12's typed gate (DD-10) |
| `apiFetch` / `ApiError{status,details}` | `frontend/lib/api/client.ts` | All new client calls |
| Plain-`useState` form pattern | `frontend/components/admin/ActorForm.tsx` — no react-hook-form, zod or shadcn in `frontend/package.json` | The registration form |
| `createValidationPipe()` `details` envelope | `backend/src/common/validation-pipe.ts:92-104` | Field-level errors |
| `toAdminActor` serializer | `backend/src/actors/` | Audit payload shape |
| Design tokens | all names in §5.8 verified resolvable in `frontend/tailwind.config.ts` | Styling |

### 1.2 Built from zero — nothing exists to extend

| Capability | Evidence of absence |
|---|---|
| Application email sending | No SES client, no `@aws-sdk/client-ses`, no nodemailer in `backend/`. The `AWS::SES::EmailIdentity` at `infra/10-data-auth/template.yaml:196-200` is conditional on `MakeSenderIdentity` = `HasSender` ∧ `CreateSenderIdentity`, and `HasSender` is false while `SenderEmail` defaults to `""` — so under defaults **no identity exists**. Enablement path: `infra/README.md` §6, `infra/10-data-auth/t9-enable-ses.sh` |
| Rate limiting | Nothing in `backend/src`; **no throttling in any of the three SAM templates** — `infra/20-backend/template.yaml`'s `HttpApi` sets `CorsConfiguration` only |
| **Structured logging** | **Zero** matches for `new Logger` / `LoggerService` / `console.*` in `backend/src`. TRD QA-10 documents structured CloudWatch logs as though shipped; they are not |
| `traderId` generation | `actors/dto/actor-create.dto.ts` — `traderId` is `@IsString() @MinLength(1)`, client-supplied, no generator anywhere |
| Two audit actions | `actor-audit.service.ts:117-133` — `logCreate` hardcodes `action: ActorAuditAction.CREATE`; no method takes an action parameter |
| A public write path | `actors.controller.ts` has exactly two `@Get`s |

### 1.3 Existing artifacts this spec must correct

Not new work in the ordinary sense — pre-existing defects that block this spec's gates.

| Artifact | Correction | Why it blocks |
|---|---|---|
| `backend/src/test/pii-boundary.spec.ts:276-278` | Replace `new ValidationPipe({...})` with `createValidationPipe()`, and add `configureBodyParser(app)` | Its comment claims it mirrors production *exactly*; it does not. Only `createValidationPipe()` attaches `details`, so the harness cannot render the envelope DC-2 exists to inspect. **The release gate is currently blind to its own primary defect class** (C-8) |
| `frontend/lib/api/actors.ts` `traderType` union · `roles.ts` · `RoleBadge.tsx` (`ROLE_BG_CLASS`, `ROLE_CSS_VAR`) · `MapLegend.tsx` (`TRADER_TYPES`) | Widen from six to ten trader types | FR-15. `roles.ts:15` derives its key type from that union, so this is **four files, not one** (C-6) — the scope, not the failure mode, is the finding. All three maps are total `Record<TraderType, …>` (`RoleBadge.tsx:29`, `:43`, `roles.ts:35`), so a missing entry is a **compile error**, and `npm run build` is the real guard. *(Corrected 2026-08-05 — RB10. Revision 2 called it a silent degradation, which its own §12 contradicted.)* A fifth consumer, `frontend/components/map/LeafletMap.tsx:67`, relies on a `?? '--color-muted'` fallback and so **would** degrade quietly — check it too |

---

## 2. Data Model Changes

### 2.1 `RegistrationStatus` (new enum)

`PENDING_REVIEW` · `AWAITING_APPLICANT` · `APPROVED` · `REJECTED` · `WITHDRAWN`

All five declared now so chunk 4 needs no enum migration — the courtesy chunk 1 paid this spec by declaring `PORTAL_CHECKBOX` unused. Two are unreachable here and get **no UI** (D-7).

### 2.2 `Registration` (new model)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | **Never public**, not even in the submit response |
| `reference` | `String @unique` | `REG-<year>-<seq>` — applicant-facing; the uniqueness `traderId` derives from |
| `status` | `RegistrationStatus @default(PENDING_REVIEW)` | |
| `payload` | `Json` | The submission. **PII-bearing, admin-only in its entirety** |
| `submitterEmail` | `String` | **PII.** The OTP-verified address. Lowercased. **This is the address published as `Actor.email`** (§4.1, S-6) |
| `emailVerifiedAt` | `DateTime` | Non-nullable **by design** — a row cannot exist unverified |
| `consentAcceptedAt` | `DateTime` | The **server-witnessed instant the submission carrying an accepted consent was received**. The contract collects no client acceptance timestamp (§3.1), deliberately: FR-3 forbids trusting the client on acceptance, and the same reasoning governs its time. This value is therefore an **upper bound** on the applicant's true acceptance moment, not an independently attested one — the applicant may tick consent, complete the OTP round trip, then submit. **3b's review UI must label it as recorded-at-submission, not as an attested acceptance moment.** *(Corrected 2026-08-06 during execution — previously read "the applicant's acceptance time, not the write time", which no implementation could satisfy because §3.1's request shape carries no such field. T-10's Implementer surfaced the contradiction unprompted; ruled that the value is right and the label was wrong. **S-4's precedent points here, not the other way:** S-4 removed a *fabricated* timestamp, and this one is genuinely witnessed — a fabricated value must be deleted, a mislabelled true value must be relabelled. A client-supplied `acceptedAt` was rejected as strictly less evidential, being settable by the consenting party.)* |
| `consentPolicyVersion` | `String` | The version the applicant was *shown*, echoed by the client, validated server-side |
| `publishedActorId` | `String?` | Set on approve. Plain string, no FK — mirrors `ActorAuditLog.actorId`, which is deliberately FK-less (`schema.prisma:97-98`) |
| `reviewedBySub` / `reviewedByEmail` / `reviewedAt` | `String?` / `String?` / `DateTime?` | Resolved server-side; admin surface only |
| `rejectionReason` | `String?` | Structured value from a fixed set |
| `reviewNote` | `String? @db.Text` | Applicant-facing — the one field the public lookup may return |
| `duplicateDismissals` | `Json?` | **Per-candidate**, not row-level: the set of candidate actor ids a reviewer has cleared, each with who and when |
| *(lookup bounding)* | **mechanism-dependent** | FR-6's brute-force bound must satisfy **L-1…L-4** (§4.4). Revision 2 prescribed `lookupAttempts Int` + `lookupLockedUntil DateTime?` here; the re-judgment showed a reference-keyed counter **fails L-3** — it lets an attacker lock out every applicant (RA3) — and has no L-2-compatible response (RA2). Whatever columns the chosen mechanism needs are declared with it, under constraint **A-4** |
| `createdAt` / `updatedAt` | `DateTime` | |

Indexes: `@@index([status, createdAt])` — the queue's only access pattern (status segment, oldest-first).

> **No index on `submitterEmail`.** Revision 1 carried one "for the lookup"; the lookup keys on the unique `reference` and *compares* the email, so that index would never be used (B23). Removed rather than left with a false rationale — which is the same defect as chunk 1's carried-forward R-9, wearing the opposite sign.
>
> **On `[status, createdAt]`:** chunk 1's R-9 warns that a status-leading index is non-selective when most rows share a status. It is chosen here because the **sort** is the expensive half and the composite serves it; the index earns its place through `createdAt`. Recorded so nobody later reduces it to `[createdAt]` and loses the segment filter, or splits it and loses the sort. **Index *usage* is not gated** — see `requirements.md` DC-25.

**`duplicateDismissals` is per-candidate deliberately.** A single row-level timestamp would let a reviewer clearing one false-positive phone match permanently blind the screen to a genuine duplicate surfaced later — and since detection recomputes at read time against a growing `Actor` table, later candidates are expected (A19·B22). FR-11 asks for *a candidate* to be recorded, not the warning to be muted.

### 2.3 `EmailVerification` (new model)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `email` | `String` | **PII.** Lowercased. **The lookup key** — see §4.3 |
| `codeHash` | `String` | HMAC-SHA-256 under a server secret. Plaintext never stored, never logged |
| `attempts` | `Int @default(0)` | Incremented on a **mismatched** verification attempt only — a correct guess consumes the code instead, so a success never burns the applicant's own attempt (§4.3 V-1/V-1a). *Corrected 2026-08-05 during execution: the prior wording, "on **every** verification attempt, right or wrong", described behaviour no implementation ever had, and T-7's correctness lens ruled the implemented behaviour the better one. See `execution.md` → T-7.* |
| `expiresAt` | `DateTime` | |
| `consumedAt` | `DateTime?` | Single-use |
| `createdAt` | `DateTime @default(now())` | Also the per-email send-rate window |

Index: `@@index([email, createdAt])`.

### 2.4 `ActorAuditAction` — two additive members

`REGISTRATION_APPROVE` and `REGISTRATION_REJECT` join the existing six (`schema.prisma:86-93`).

### 2.5 `ActorAuditService` — two additive methods

**`logCreate` cannot be reused for this.** It hardcodes `action: ActorAuditAction.CREATE` and takes no action parameter (`actor-audit.service.ts:117-133`), and no existing method can write a row for a rejection, which has no actor at all. Revision 1 listed the service as "reused unchanged" while requiring two new actions from it — the single most misleading claim in that draft (C-1).

Two new methods are **added**; no existing method changes signature or behaviour:

- `logRegistrationApprove(tx, actor, acting, reference)` — writes the real created actor's identity with the new action.
- `logRegistrationReject(tx, registration, acting)` — writes `actorId` = registration id, `traderId` = reference, `traderName` = submitted organisation name.

Because both are additions, this is not a reversion (§9). It **is** a change to a file three shipped write paths depend on, which §9 records and which the task must keep green against the existing audit suite.

### 2.6 Migration — what the SQL will actually contain

**Five** `CREATE TABLE` plus indexes, one new enum-typed column, and — **for the audit enum on MySQL** — `ALTER TABLE \`ActorAuditLog\` MODIFY \`action\` ENUM(...)`. The in-repo precedent is `backend/prisma/migrations/20260710132750_add_import_audit_action/migration.sql`.

> *Corrected 2026-08-06 during execution — read "Two", counting only `Registration` and `EmailVerification`. **Four** migrations landed in 3a: `20260805142929_add_registration_and_email_verification` (two tables), `20260805212505_add_email_send_budget` (T-7's atomic send cap), and `20260806132727_add_registration_sequence` (T-10's allocator, per A-4), and `20260806155208_add_registration_lookup_attempt` (T-11's per-caller-and-reference lookup bound, per L-1/L-3). All additive; each was Leader-verified from disk as a single `CREATE TABLE` with zero `DROP`/`MODIFY`/`ALTER`/`UPDATE`. See §1's correction note on why the omission recurred.*

Revision 1 claimed "No `DROP`, no `MODIFY`" and used Postgres vocabulary (`CREATE TYPE` / `ALTER TYPE`) for a MySQL datasource (`schema.prisma:14`). Both were wrong (C-10). The change is **additive in semantics** — it widens an enum's accepted values, destroys no data, rewrites no rows — which is what `backend/CLAUDE.md`'s additive-only rule protects. **Disclosed here so the migration task's done-criteria match the generated SQL**; a criterion demanding "no `MODIFY`" would FAIL a correct migration or invite hand-editing it. No `DROP`, no data `UPDATE`, no column narrowed or retyped. Rehearsed on local MySQL before RDS apply.

### 2.7 PII declarations

`Registration.payload`, `Registration.submitterEmail`, `EmailVerification.email` are PII. They are **not** added to `PII_ALLOWLIST` or `NEVER_PUBLIC_FIELDS`: those enumerate `Actor` columns consumed by the `Actor` serializer, and adding foreign names would make them describe something they do not govern while protecting nothing. Protection is structural (§6.2).

---

## 3. API Surface & Contracts

**Four public, five admin.** `requirements.md` §4 and §14 now carry the same counts; revision 1 shipped nine endpoints against a requirement stating seven (C-14).

Error envelope: `{ statusCode, message, error, details? }` (`validation-pipe.ts:96-102`).

### 3.1 Public

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `GET /registrations/consent-policy` | — | `{ version, sections: [{heading, body}] }` | — |
| `POST /registrations/verify` | `{ email }` | **`202`, empty body, always** | `400` malformed email · `429` over throttle |
| `POST /registrations` | `{ email, code, consent:{accepted, policyVersion}, payload:{…} }` | `201 { reference }` | `400` · `409` traderId collision · `429` |
| `POST /registrations/lookup` | `{ reference, email }` | `200 { status, reviewNote? }` | `404` identical for both failure modes · `429` |

**Four contract decisions that are load-bearing:**

1. **`POST /verify` returns `202` with an empty body for every accepted input** — deliverable, undeliverable, known, unknown, *and over the per-email send cap*. Revision 1 said "unconditionally" in §3.1 and then had §5.3 surface the cap on refusal; those were mutually exclusive, and the §5.3 branch was a membership oracle for "someone requested a code for this address recently" (C-3). **Resolution: the cap is enforced silently** — no code is sent, the response is unchanged. The client's resend affordance therefore never reports a server refusal; it states up front that codes are limited and to wait before retrying (§5.3). A `429` from the *throttler* remains visible, because it keys on the caller, not on the submitted address.
2. **`POST /registrations` collapses code-wrong, code-expired and code-consumed into one indistinguishable `400`.** Validation failures *do* carry per-field `details`, since those describe input the caller already holds — but no response ever echoes a **stored** value.
3. **`POST /registrations/lookup` takes a body, not a query string** (C-11). An email in a URL reaches request lines, `Referer`, history, and any access log later enabled — egress paths NFR-8's application-level test structurally cannot see, and `AccessLogSetting` being absent today is a fact about current infra, not a guarantee. A read-by-POST is a mild REST irregularity, accepted deliberately to keep PII out of URLs.
4. **The two lookup failure modes are byte-identical** — same status, same body, same message — implemented as one lookup-and-compare with a single exit so they cannot drift apart.

### 3.2 Admin — `@UseGuards(JwtAuthGuard, RolesGuard) @Roles('Admin')`

| Method & path | Request | Success |
|---|---|---|
| `GET /admin/registrations` | `?status=&q=&region=&traderType=&sort=&page=&pageSize=` | `{ data, page, pageSize, total }` + `duplicateCandidateCount` per row |
| `GET /admin/registrations/:id` | — | payload · consent record · duplicate candidates · activity trail |
| `POST /admin/registrations/:id/approve` | `{ acknowledgement }` | `{ registration, actor }` |
| `POST /admin/registrations/:id/reject` | `{ reason, note? }` | `{ registration }` |
| `POST /admin/registrations/:id/dismiss-duplicate` | `{ candidateActorId }` | `{ registration }` |

`dismiss-duplicate` takes a **candidate id**, matching `duplicateDismissals`' per-candidate semantics (§2.2). The list endpoint returns a count, not candidates — full detection per row would be N passes per page load.

---

## 4. Backend Design

New module `registrations`, plus `mail` and `logging`. Registered in `app.module.ts`'s `imports`. **There is no global guard** (`app.module.ts`), which is why §6.2 exists.

```
backend/src/
├── registrations/
│   ├── registrations.module.ts · registrations.controller.ts (4 public)
│   ├── admin-registrations.controller.ts (5, @Roles('Admin'))
│   ├── registrations.service.ts · registration-review.service.ts
│   ├── email-verification.service.ts · duplicate-detection.service.ts
│   ├── consent-policy.ts · registration-reference.util.ts
│   ├── rejection-reasons.ts · registration-activity.ts
│   ├── registrations-throttle.guard.ts · throttler-exception.filter.ts
│   ├── payload-cap.middleware.ts
│   ├── dto/ · serializers/{public,admin}-registration.serializer.ts
├── mail/  mail.module.ts · mail.service.ts (SES + no-op transport) · templates/
└── logging/  logging.module.ts · request-context.middleware.ts   (emission lives in the middleware — see §4.10's correction; there is deliberately no interceptor)
```

### 4.1 Submission (FR-2, FR-3, FR-4)

**`RegistrationCreateDto` is specified explicitly, not by reference.** Revision 1 said it "mirrors `ActorCreateDto` field for field", which produced three defects: `crops`/`CROP_NAMES` are on `AdminActorCreateDto`, not `ActorCreateDto`; `crops` is `@IsOptional` there so "no main crop" would have passed; and `@MaxLength` appears on only 2 of 9 string fields in `ActorCreateDto`, so "bounds like every other string" was false and contradicted §4.4's "bound every field" (C-13, S-5).

| Field | Validation |
|---|---|
| `traderName` | `@IsString() @MinLength(1) @MaxLength(200)` |
| `traderType` | `@IsIn(TRADER_TYPES)` — the ten in `common/normalize.ts` |
| `contactPerson` | `@IsString() @MinLength(1) @MaxLength(120)` — **not publishable** |
| `position`, `district`, `marketLocation` | `@IsOptional() @IsString() @MaxLength(120)` |
| `sex` | `@IsOptional() @IsIn(['M','F','Other'])` |
| `region` | `@IsIn(CANONICAL_REGIONS)` |
| `gpsLatitude` / `gpsLongitude` | `@IsOptional() @IsNumber() @Min(-90)/@Max(90)` · `@Min(-180)/@Max(180)`, plus the pairing rule below |
| `crops` | **`@ArrayNotEmpty()`** `@IsIn(CROP_NAMES, { each: true })` `@ArrayUnique()` — required here, unlike the admin DTO |
| `otherCrops` | `@IsOptional() @IsString() @MaxLength(300)` — **not publishable** |
| `capacityTons` | `@IsNumber() @Min(0)` |
| `phone` | `@IsString() @MinLength(1) @MaxLength(40)` |

**No `email` in the payload.** The top-level, OTP-verified `email` is the one address: stored as `submitterEmail`, published as `Actor.email` on approval, and used for every notification (S-6). A payload `email` would have created a second address that could be published without ever being verified.

Omitted: `traderId` (server-derived), all `consent*` fields (server-set at approval), `gpsAltitude`/`gpsAccuracy` (not collected).

**Nested objects need `@ValidateNested()` + `@Type()`** — the production pipe runs `whitelist: true` (`validation-pipe.ts:93-95`), which strips undecorated nested properties, so without them `consent.accepted` would read `undefined` and every submission would `400` (B33).

**Coordinate pairing:** exactly-one-of-two is rejected `400`. A cross-field check, not two independent optionals — two optionals cannot express it, and a half-coordinate publishes a false location.

Order of operations:

1. `payloadCap` — raw `app.use`, ahead of the body parser (§4.4)
2. Throttle guard
3. `createValidationPipe()` — shape and field validation
4. Consent check: `accepted === true` **and** `policyVersion` ∈ known versions, else `400`
5. **Verify the code.** On mismatch: increment `attempts` **durably** (V-1a), reject `400`, stop — no transaction is opened.
6. **One `$transaction`**, entered only once the code has matched: mark the code consumed → allocate reference → create the row.

**Two constraints pull in opposite directions here, and getting one right broke the other twice.**

- A23 required the *consume* to be inside the write transaction, so a reference-collision retry exhaustion or a DB blip could not burn a single-use code against a 3-per-hour cap — manufacturing a DC-22 lockout from a code defect rather than from undelivered mail.
- V-1 required a *wrong* code to increment a counter the cap can observe.

Revision 2 satisfied the first and silently destroyed the second: a `400` thrown from inside a Prisma interactive transaction rolls back every write in it, the counter included (RB1). The split above satisfies both — **the mismatch path never enters a transaction, and the success path consumes inside one.** The Implementer may choose a different arrangement provided V-1a and A23's property both hold; the point is that they are two obligations, not one, and a single transaction boundary cannot serve both.

### 4.2 Consent policy versioning (FR-3)

`consent-policy.ts` holds an ordered section list and `CONSENT_POLICY_VERSION`, served over `GET /registrations/consent-policy` and **not** duplicated into the frontend bundle. Serving it closes a drift hole: a frontend copy could assert a version the server does not know, `400`-ing every submission, and it makes FR-3's unknown-version branch reachable and testable instead of dead code.

Superseded versions stay in the accepted set, because removing one would invalidate submissions in flight. *(Revision 1 justified this by citing chunk 4's "if the policy version has moved on, the reviewer must reject and ask for a fresh submission" — which does not support the claim; chunk 4 is about consent immutability across revisions, not about the server's accepted-version set. The decision stands on its own reasoning; the citation was wrong — A30.)*

### 4.3 OTP (FR-4) — parameters recorded per DC-20

| Parameter | Value | Why |
|---|---|---|
| Code | 6 digits, CSPRNG | Dictatable by phone, matching OQ-4's concern about the reference |
| Lifetime | 15 minutes | Tolerates slow corporate mail; bounds the window |
| Verify attempts | **5 per code**, then dead | The real control — see below |
| Sends per email | **3 per hour**, enforced silently | Stops mail-bombing. Shared state, so it holds **across** containers where the throttler does not |
| Storage | HMAC-SHA-256 under an SSM-sourced secret | A 6-digit code is offline-brute-forceable however hashed; HMAC keeps it unusable without the secret |

**The attempt counter must be reachable, and revision 1's was not.** It described a conditional update keyed on the submitted code's hash — so a *wrong* code matched no row, `attempts` never incremented, and the cap that §4.3 called "the actual control" could never fire. With a per-container throttler (DD-5), that left a 6-digit code with no shared bound at all (S-1).

Revision 2 answered "look the row up by `email`" — and that was the wrong kind of answer. `email` is not unique, the design deliberately permits up to three live codes per address, and no row-selection rule was stated; latest-row selection would reject a valid earlier code, burn its attempts, and turn a per-code cap of 5 into an effective 15/hour (RA4).

**Stated as constraints. The Implementer chooses the mechanism and records it in `execution.md` with evidence.**

| # | Constraint | Must hold |
|---|---|---|
| V-1 | A **wrong** code increments an attempt counter that the cap can actually observe | A test submits N wrong codes **in separate requests** and shows the code dead at the cap — the regression test for S-1 |
| **V-1a** | **The increment survives the rejection.** The counter write must **not** be rolled back by the `400` that rejects the wrong code | **This is the trap that swallowed two consecutive fixes.** Revision 2 moved the OTP consume *inside* the submission `$transaction` (correctly, so a downstream failure could not burn a single-use code — A23), and thereby made the mismatch increment roll back with the abort, leaving V-1 unreachable exactly as before (RB1). The mismatch path and its counter write must therefore sit **outside** the submission transaction, or in an independent one. **Verify by asserting the counter's value in a fresh read after a rejected request** — an in-transaction assertion cannot see the rollback |
| V-2 | Exactly **one** live code per email address is verifiable at any time | Issuing a new code invalidates any prior live one, **or** verification is unambiguous across several. Either satisfies V-2; the first is simpler and is the recommendation |
| V-3 | A valid code is **never** rejected because a newer one exists | The scenario RA4 identified. Test with two live rows, submit the older code |
| V-4 | Consumption is single-use under concurrency | A conditional write whose zero-row result is the failure. A read-then-write lets two concurrent requests both pass |
| V-5 | Wrong, expired and consumed are **indistinguishable** to the caller | Byte-identical `400` |
| V-6 | The plaintext code is never stored and never logged | HMAC-SHA-256 under an SSM-sourced secret |

**Rejected, with reasons** (do not re-derive these): keying the lookup on the code hash — the cap becomes unreachable (S-1); selecting the latest row by `createdAt` without invalidating priors — violates V-3 (RA4); storing the code in plaintext — offline-readable; a slow hash instead of HMAC — a 6-digit space is brute-forceable regardless, and HMAC is what makes it unusable without the secret.

### 4.4 Abuse resistance (FR-7, NFR-4)

**Payload cap — a raw `app.use` ahead of `configureBodyParser`, in both entrypoints.**

Revision 1 specified a `MiddlewareConsumer`-registered module middleware running *before* the global parser. That is impossible here: `configureBodyParser(app)` installs the parser onto Express at call time in `main.ts` and `lambda.ts`, while module middleware registers during `app.init()` — so the parser is always upstream (C-2, confirmed by both judges).

The corrected mechanism registers a size check via `app.use` immediately **before** `configureBodyParser(app)` in both bootstraps. The ordering is genuinely achievable — the re-judgment verified it, since `configureBodyParser` is itself `app.useBodyParser(...)` + `app.use(...)` at `body-parser.config.ts:123-126`, so anything registered earlier is upstream. This is a shared-bootstrap edit, which revision 1 forbade; the trade is accepted because FR-7 requires rejection *before* parsing and no other placement achieves it. Recorded in §9.

Three details the re-judgment caught, all of which would have silently defeated it:

| # | Requirement | Why |
|---|---|---|
| P-1 | **Register it through a `configure*` helper in `common/`**, called from both entrypoints — not two hand-written `app.use` lines | `body-parser.config.ts:8-11` states both entrypoints "**MUST** configure the parser through THIS single helper so the deployed limit and the tested limit can never drift". Two independently editable registration sites for a security control reintroduce exactly that drift (RA9), and FR-7's "same shared bootstrap configuration" clause would be met by discipline rather than structure |
| P-2 | **Match paths against the `api/v1` prefix** | `app.setGlobalPrefix('api/v1')` is a Nest routing concern; raw Express middleware sees `/api/v1/registrations`, so a scope test written against `/registrations` matches nothing and **silently disables the cap on every route** while every §9 answer still reads as satisfied (RA8) |
| P-3 | **Reject a request that declares no length**, or bound it while streaming | A `Content-Length` check alone is bypassed by a chunked request, which then falls through to the 8 MB `JSON_BODY_LIMIT` (RA8). "Rejected before it is parsed" must hold for hostile clients, not only well-behaved ones |

It **must** be proven through `lambda-handler.e2e.spec.ts` against the real handler: `serverless-http` builds its request with `complete: true`, which is why supertest cannot see this class of bug (`backend/CLAUDE.md`).

The global 8 MB `JSON_BODY_LIMIT` is untouched — it serves the admin import path, which is outside this spec.

**Rate limiting — `@nestjs/throttler`, in-memory, per container.** Rejected alternatives: a DB-backed counter (every request writes before it can be judged — the pressure FR-7 exists to prevent); API Gateway throttling (nothing to extend, and `AWS::Serverless::HttpApi` offers no per-IP usage plans, so stage-level throttling would rate-limit the public directory too); Redis (a new always-on component in a scale-to-zero architecture — ADR-001 territory, unjustified for ~150 expected submissions).

**Its limitation, stated honestly (DC-19):** an in-memory counter bounds each container and resets on cold start, so the effective global limit is *containers × limit*. It is not a distributed limiter. **Each public path therefore has a second, shared control:**

| Path | Shared control |
|---|---|
| `POST /verify` | Per-email send cap on `EmailVerification` rows (§4.3) |
| `POST /registrations` | Cannot write without a consumed OTP |
| `POST /lookup` | **Constraints L-1…L-4 below** — mechanism chosen at implementation |
| `GET /consent-policy` | None needed — static content, no per-subject state, nothing to enumerate |

Revision 1's honesty paragraph named only the first two and silently omitted `/lookup` — the one path `requirements.md` FR-6 *explicitly* requires rate-limiting for (C-4). Revision 2 answered with a per-reference `lookupAttempts` / `lookupLockedUntil` counter, and the re-judgment found two severe defects in that answer: it never said **what a locked lookup returns**, and no available answer preserves byte-identity because a lockout is only reachable for a reference that *exists* — reintroducing the very membership oracle §3.1 decision 4 exists to eliminate (RA2). Worse, keyed on an enumerable sequential reference with no reset-on-success and no per-caller dimension, a few hundred requests would lock out **every** applicant, denying the R-3 fallback channel that FR-13 and NFR-10 both depend on (RA3).

**Stated as constraints. The Implementer chooses the mechanism and records it in `execution.md`.**

| # | Constraint | Must hold |
|---|---|---|
| L-1 | Brute-forcing the email against a known reference is bounded by a control that **survives cold starts and spans containers** | The per-container throttler alone does not satisfy this — that is what C-4 found |
| L-2 | **Byte-identity is preserved on every exit**, including a throttled or locked one | Same status, same body, same message for: reference absent · reference present + email mismatch · rate-limited. **If a chosen mechanism cannot make its refusal indistinguishable, it is the wrong mechanism** — this is RA2's lesson and it is not negotiable |
| L-3 | An attacker **cannot** deny a legitimate applicant access to their own status | Rules out any bound keyed **solely** on the reference, since references are sequential and enumerable (§4.5). A per-caller dimension, or a per-caller-and-reference composite, satisfies L-3 |
| L-4 | A successful lookup does not leave the applicant closer to a lockout | Reset or decay on success |

**Rejected, with reasons:** a bare per-reference counter — fails L-3, and an attacker locks out every applicant (RA3); a per-reference lockout returning a distinct status or message — fails L-2, and reintroduces the oracle (RA2); relying on the in-memory throttler alone — fails L-1 (C-4).

**`ThrottlerException` does not serialise with an `error` key**, so a `throttler-exception.filter.ts` shapes the `429` into the documented envelope. Without it the frontend's `ApiError` mapping surfaces `"ThrottlerException: Too Many Requests"` as user-facing copy (A21, gated by DC-26).

### 4.5 Reference and `traderId` (FR-12, D-8)

Reference: `REG-<year>-<4-digit sequence within year>` — the mockup's format, dictatable aloud.

**Allocation — stated as constraints, not a mechanism.** Revision 2 answered A31 with "a dedicated counter row per year", and then declared no such object anywhere: §2 lists three schema objects, §2.6 describes two `CREATE TABLE`, and `requirements.md` said "two new schema objects" in one place and three in another. **The allocator could not be built as described** (RA1) — the migration task would have enumerated two tables and the Implementer would have fallen back to exactly the strategies the sentence rejected.

| # | Constraint | Must hold |
|---|---|---|
| A-1 | Allocation is **race-safe under concurrent submissions** | Two concurrent submissions never receive the same reference |
| A-2 | A sequence value is **never reused**, including after a rejection or withdrawal | Rules out `COUNT` for the year: rejected rows leave gaps, and counting produces a value already issued |
| A-3 | The `@unique` constraint is the **backstop**, not the strategy | A violation is caught and retried a bounded number of times, never surfaced as a `500` |
| A-4 | Whatever object the mechanism needs is **declared in the migration** | RA1's actual defect. If the choice is a counter table, it appears in §2 and in the migration's done-criteria — an undeclared third table is the same disclosure failure as C-10 |
| A-5 | The format stays `REG-<year>-<4-digit sequence>` | Applicant-facing and dictatable aloud (OQ-4) |

**Rejected, with reasons:** `COUNT` of the year's rows — fails A-2; `MAX(sequence)+1` parsed from strings — needs a table lock and is fragile against any format drift. A counter row **remains a legitimate choice** and is probably the simplest one; it just has to be declared (A-4) and seeded for a new year (RA11), neither of which revision 2 did.

`traderId` is **derived** from the reference under a distinct prefix: `REG-2026-0184` → `SR-2026-0184`. Since `reference` is `@unique`, the derived key is unique **among self-registered actors** with no counter and no `MAX()+1` race.

**But not unique table-wide by construction, which revision 1 claimed.** `actor-create.dto.ts` accepts any client-supplied `traderId` with `@IsString() @MinLength(1)` — no pattern, no reserved prefixes — so an admin can already have created `SR-2026-0184` by hand (S-2). Approval therefore **catches the Prisma uniqueness violation inside the transaction and returns a `409` naming the colliding key**, rather than letting it surface as a `500` that leaves the registration permanently unapprovable.

`SR-` collides with none of chunk 2's **eight** prefixes: `OFB · OFS · OFG · BBB · HUM · DSP · SDC · QDS`. *(Revision 1 listed six "and siblings", hiding `SDC` and `QDS` — A14. It also claimed `TZ-` "matches no namespace this registry actually uses"; `backend/prisma/seed-data.ts` carries 14 `TZ-SEED-*` rows — B19, Leader-verified. Neither error changes the `SR-` decision, but DC-7's collision test must be written against all eight.)*

### 4.6 Approval (FR-12, NFR-3) — one transaction

1. **Compare-and-set**: conditional status update where `id` matches **and** `status = PENDING_REVIEW`. Zero rows ⇒ `409`. This is what makes double-approval impossible; a read-then-check races, and the race publishes two actors.
2. Derive `traderId` (§4.5).
3. Project the payload's **publishable subset** onto actor input. `contactPerson` and `otherCrops` are **not carried** — and `contactPerson` must not land on `Actor.position`, which is a job title, not a person's name. `Actor.email` = `submitterEmail`.
4. Assert `isConsentProvenanceSatisfied` (`consent-provenance.policy.ts:81-118`) against the effective post-write state: `GRANTED` · `PORTAL_CHECKBOX` · `consentObtainedAt = consentAcceptedAt` · `consentReference = reference`.
5. `tx.actor.create()` — **`P2002` ⇒ `409`** (§4.5) → `tx.cropsOnActors.createMany()` → refetch → `toAdminActor()`.
6. `actorAuditService.logRegistrationApprove(tx, adminActor, acting, reference)` (§2.5).
7. Finish the registration row: `publishedActorId`, `reviewedBySub`, `reviewedByEmail`, `reviewedAt`.

Notifications dispatch **after commit**, never inside (DD-9). The typed acknowledgement is re-validated **server-side**; the client gate is UX only.

> **On step 4's honesty (A22·B31).** With all four values set to satisfying constants and `consentAcceptedAt` non-nullable, this call **cannot return false**. It is retained as a guard against future drift in the shared invariant — if chunk 1's rules tighten, this path inherits them — but it is **not** a gate, and §12 no longer counts it as one. The real gate is the sibling assertion on the created actor's four fields.

### 4.7 Rejection (FR-13)

Structured `reason` from `rejection-reasons.ts`, including *"Duplicate of an existing registry record"*, plus an optional applicant-facing `note`. Compare-and-set on status as in approval. Audited via `logRegistrationReject` (§2.5). No actor is touched.

### 4.8 Duplicate detection (FR-11)

Admin-only, computed at read time, never persisted as a verdict. Candidates by normalized phone equality, lowercased email equality, normalized `traderName` equality, and a GPS bounding-box proximity check when both coordinates are present. Capped and ordered by match strength.

`phone` and `email` are not indexed on `Actor`, so this scans — trivial at ~1,300 rows, and indexing two PII columns to serve an admin-only warning is not yet justified. Revisit well beyond the PRD's 1,000+ target.

Detection never blocks, pre-selects, merges or auto-rejects. `duplicateDismissals` suppresses **per candidate** (§2.2).

### 4.9 Mail (FR-14)

A `MailService` interface with an SES implementation and a **no-op transport** selected by `MAIL_TRANSPORT`. The no-op exists so NFR-10 is a runnable configuration rather than a thought experiment. Four messages — verification code, receipt, approval, rejection. **The three post-submission messages (receipt, approval, rejection) each carry the reference; FR-4's verification code precedes reference allocation and carries none.** Bodies and codes are never logged; send **attempts and outcomes** are (§4.10).

> **Corrected 2026-08-05 during T-3 execution.** This sentence previously read *"Four messages … each carrying the reference"*, which **contradicted the requirement it traces to**. `requirements.md` FR-14 enumerates exactly three messages ("submission, approval, and rejection"), and states in terms: *"The single deliberate exception is FR-4's verification gate, which precedes submission … this requirement does not cover it and must not be read as promising otherwise."* The contradiction is not merely wording — it is **unsatisfiable**: `design.md` §4.1's order of operations allocates the reference **inside** the submission `$transaction`, entered only after the code matches, so at verification-code send time no `Registration` row and no reference exist. Carrying one there would require fabricating it. `requirements.md` was correct throughout and is unchanged; the design sentence had folded FR-4's code into FR-14's set. Corrected at both sites in this document plus `tasks.md` T-3 (KZ-004 two-direction sweep); `proposal.md` §96/§149 and 3b's proposal §41 were checked and are already correct.

### 4.10 Logging (NFR-8, DC-22) — new, minimal, scoped

**Nothing exists to extend**: zero `Logger`/`console.*` in `backend/src`. NFR-8's structured entries, DC-14's log-capture gate and DC-22's diagnosability substitute were all unowned in revision 1 — and DC-22 makes this logging *the thing traded* for accepting the OTP-lockout risk, so it cannot be assumed (C-5).

Scope is deliberately narrow: a `request-context.middleware.ts` generating a request id **and emitting one JSON line per request** — request id, route, method, status, role, latency — applied to **this module's controllers only**, not globally. Plus explicit send-attempt/outcome entries from `MailService`.

> **Corrected 2026-08-05 during T-4 execution — the original prescribed a primitive that cannot satisfy the obligation.** This paragraph previously assigned emission to a `structured-log.interceptor.ts`. **NestJS runs guards before interceptors** (middleware → guards → interceptors → pipes → handler), so a guard-thrown exception short-circuits *before* `intercept()` is ever called and **no line is emitted at all** — not a wrong `status`, silence. That is not a hypothetical: **T-5's `ThrottlerException` is thrown from a guard**, so every throttled request — exactly the abuse traffic NFR-8 and DC-22 exist to make diagnosable — would have gone unlogged. Any future `401`/`403` on this module would too. Emission therefore moved to the middleware, which registers its `res.on('finish')` listener synchronously **before `next()`** and so precedes every later stage; the interceptor was deleted rather than kept, since retaining it would either do nothing or double-emit. **The obligation is unchanged** — one line per request, six fields, scoped to this module's controllers, never PII. Only the emission point moved. Proven through a real HTTP pipeline with a guard-thrown `ForbiddenException` (`logging-scope.e2e.spec.ts`). **Known limit, accepted:** a client abort fires `close` without `finish`, so an aborted request emits nothing — there is no response, hence no `status` or `latency` to record. Corrected at every site (KZ-004 sweep): here, §7's file tree, `tasks.md` T-4, and `requirements.md` DEP-11.

**Never logged:** OTP codes, payload fields, phone numbers, email addresses, mail bodies. Note this is *why* §3.1 decision 3 moved the lookup off the query string: with an email in the URL, "log the route" and "never log an email address" are contradictory instructions.

This partially closes TRD QA-10, which documents structured CloudWatch logs as though implemented. A repo-wide observability rollout is **out of scope**; this is the minimum that makes NFR-8 true for the paths this spec adds.

---

## 5. Frontend Design

Static export throughout (ADR-002, NFR-7). Dynamic identity travels in **query params** — the project's established pattern (`admin/actors/edit?id=`).

```
app/(public)/register/page.tsx · register/submitted/page.tsx (?ref=) · register/status/page.tsx
app/(admin)/admin/registrations/page.tsx · registrations/review/page.tsx (?id=)

components/register/  RegistrationForm · ConsentPolicyDisclosure · OtpVerificationStep
                      ReferenceCard · RegistrationStepper · StatusLookupForm
components/admin/     RegistrationsTable · RegistrationDetailPanel · DuplicateWarningCard
                      ConsentRecordCard · ActivityTrail · RejectDialog
lib/api/registrations.ts · registrations-admin.ts · lib/hooks/useRegistrations.ts
```

### 5.1 The registration form (FR-2)

Follows `ActorForm.tsx`: `useState` for `values`/`errors`/`formError`/`loading`, a hand-written DTO builder, `<fieldset className="rounded-md border border-border p-4 sm:p-6">` sections — *Identity · Location · Crops & capacity · Contact · Data protection & consent*. Introducing a form library would make this the only screen in the codebase with one.

Single column on mobile, two-column section grid at `lg+` (`docs/ux-ui/design.md` §6). A progress stepper sets the review-before-publication expectation FR-1 requires.

Errors: the API's `details[{field,message}]` maps to one `errors` record; each input gets `aria-describedby`; a summary above the actions counts offending fields and is announced through a live region. Summary and inline state derive from **one** object so they cannot disagree.

**GPS optionality is stated in the UI** — helper copy that both coordinates may be left blank and a reviewer will place the actor on the map. FR-2 requires it and revision 1 owned it nowhere (A25·B29).

**Motion:** if any new screen uses the project's GSAP reveal pattern, it is gated on `prefers-reduced-motion: no-preference` via `gsap.matchMedia()` per `docs/ux-ui/design.md:136` (a line, not a section — revision 2 cited it as "§136", which does not exist; RA12). The simplest compliance is no entrance motion on these screens at all, which is the default choice here (A26).

### 5.2 Consent disclosure and the scroll gate (FR-3)

`ConsentPolicyDisclosure` fetches from `GET /registrations/consent-policy`, renders sections in a scrollable region, and reports when the end is reached. The checkbox is `disabled` until then, unticked at every initial render, with progress text.

- **The end-detection predicate is a pure exported function** over `{scrollTop, clientHeight, scrollHeight}`. jsdom lays nothing out, so a DOM-level test would assert against zeroes and pass while proving nothing (DD-8). It returns true when content is shorter than its container — correct for a short policy, and the edge case inline logic gets wrong.
- **The scroll region is focusable** (`tabIndex={0}`, `role="region"`, labelled) so a keyboard user can reach the end with arrow keys. Without it the gate is a pointer-only trap.

The gate is UX; enforcement is the server-side consent field (§4.1 step 4).

### 5.3 OTP step (FR-4)

A step within `/register`, not a route — entered form state must survive verification, and a route change under static export would lose it.

**The resend affordance never reports a server refusal.** Because the per-email cap is enforced silently (§3.1 decision 1), the UI states up front that codes are limited and to wait before retrying. Revision 1 promised the cap would be "surfaced honestly when the server refuses", which would have made the endpoint an oracle (C-3).

### 5.4 Receipt (FR-5) and status lookup (FR-6)

Receipt reads `?ref=` and renders `ReferenceCard`: the code as **selectable text** (never an image or canvas), a copy action, a save-this instruction, and a link to `/register/status`.

"What happens next" describes only what this chunk does (D-10): a reviewer checks the submission, and **the outcome is available by reference lookup**, with email as a convenience that may not arrive. Revision 1 framed email and lookup as equal channels, which is the framing R-3 exists to avoid (B32).

`StatusLookupForm` POSTs reference + email (§3.1 decision 3) and renders status plus the reviewer note. Nothing else is available to render.

### 5.5 Admin queue and detail (FR-9, FR-10)

`RegistrationsTable` follows `ActorsTable` conventions: URL-synced filters and paging, `md`+ table with a sticky first column per `frontend/CLAUDE.md`, oldest-first default.

Segments render **only** `PENDING_REVIEW`, `APPROVED`, `REJECTED` (D-7). No `AWAITING_APPLICANT` segment; no *"No email"* flag — email is required and verified, so that state cannot exist. Empty state distinguishes "no rows for this filter/page" from "no registrations at all".

Detail composes: **the reference code in the header** (FR-10, unowned in revision 1 — C-12) · duplicate warning with per-candidate dismissal · submitted-details table with non-publishable fields **explicitly marked** as review-context · location card with raw coordinates and a map link · decision panel · `ConsentRecordCard` with an **explicitly timezoned** timestamp · `ActivityTrail`.

`ActivityTrail` is a pure function over stored fields: submitted, consent recorded, cleared-as-not-duplicate (when recorded), adjudicated. **It does not claim a duplicate-check time** — detection is never persisted, so any such timestamp would be fabricated, in the one surface whose purpose is an auditable consent trail (S-4; `requirements.md` FR-10 amended to match).

No payload editing (D-4). No bulk action bar (D-3).

### 5.6 Approve and reject dialogs (FR-12, FR-13)

**Approve uses `AcknowledgeDialog`, not `ConfirmDialog`.** `frontend/CLAUDE.md:26` makes it **required** in the UI before any submit that sets `consentStatus` to `GRANTED` — which approval does. Revision 1 chose `ConfirmDialog`, which additionally hardcodes its confirm button as `bg-danger` (`ConfirmDialog.tsx:245`) — a red destructive button on a publish action, and a contradiction of this design's own rule that `danger` is reserved for destructive semantics. Revision 1 also credited `admin/bulk-actor-operations` with proving `ConfirmDialog`; that spec proved `AcknowledgeDialog`, with the very phrase proposed here (C-7).

`acknowledgementText = "I confirm consent is on file"`. The body names the policy version and acceptance date being attested to.

`RejectDialog` is new — a required structured reason select, an optional applicant-facing note, an irreversibility notice. Not `AcknowledgeDialog`: rejection grants no consent and collects two inputs.

### 5.7 Entry points and taxonomy (FR-1, FR-15)

- **Nav.** `NAV_LINKS` in `Header.tsx` is `as const` with only `{label, href}`, consumed by uniform `NavLink`/`MobileNavLink` components, and "Staff sign-in" is not in it at all — it lives in `AuthSlot`. So an entry **cannot** be "styled as a primary action" without widening `NavLink`'s prop contract (A29·B24). The chosen approach: add an optional `variant` to `NavLink`/`MobileNavLink` and pass it for this one entry — a small, additive change to the shared public shell, scoped as its own task rather than smuggled into a one-line array edit.
- **Landing CTA.** A `surface-alt` panel below the hero actions, stating review-before-publication.
- **Admin sidebar.** A third `NAV_ITEMS` entry in `AdminSidebar.tsx`.
- **Taxonomy → ten types across four files** (§1.3): the `traderType` union in `lib/api/actors.ts`, `ROLES` in `roles.ts`, `ROLE_BG_CLASS` + `ROLE_CSS_VAR` in `RoleBadge.tsx`, `TRADER_TYPES` in `MapLegend.tsx`. Tokens: `humanitarian` → `highlight`, `digital_service_provider` → `highlight-soft`, `qds_producer` → `crop-groundnut`, `bulk_buyer` → `warning`. `danger` stays unused.

### 5.8 Tokens (NFR-6)

All resolve through `tailwind.config.ts`: `bg-primary`/`primary-soft`/`primary-fg`, `bg-surface`/`surface-alt`, `text-fg`/`text-muted`, `border-border`, `bg-success`/`warning`/`danger`/`danger-soft`, `bg-highlight`/`highlight-soft`, `rounded-sm/md/lg/full`, `shadow-sm/md/sticky-edge`, `duration-fast/base/slow`. Zero hex literals in new files.

> Per `docs/ux-ui/design.md` §7: `--color-accent` (~3.6:1) and `--color-highlight` (~2.0:1) **fail AA for small body text** — large text, borders, chips and tints only. Body copy uses `fg`/`muted`. This is what DC-16's human check verifies, since jsdom cannot.

---

## 6. Security & RBAC

### 6.1 Roles

`Public` reaches the four public endpoints and reads status only. `Staff` gets **nothing new** — `403` on every admin registrations endpoint, because each approval publishes another party's personal data (open as OQ-5). `Admin` adjudicates.

Enforcement: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles('Admin')` class-level, matching `admin-actors.controller.ts`. Guards and serializers are independent layers.

### 6.2 The containment guarantee

FR-8 promises no public path returns a submitted field. Three layers, because `app.module.ts` registers **no global guard**, so "we did not write that endpoint" is a fact about today's code:

1. **A literal-pick serializer** naming its output keys explicitly — `status`, and `reviewNote` when present. No spread, no omit, no filter. Chunk 1 proved the shape: its public actor serializer is a literal 8-key pick, so an extra field is a compile error rather than a runtime leak.
2. **A typed boundary** — public handler return types are the serializer's output type, so returning a `Registration` from a public handler does not type-check.
3. **`pii-boundary.spec.ts`, corrected and extended — the release gate.**

**Layer 3 requires fixing the harness first.** It bootstraps with `new ValidationPipe({transform:true, whitelist:true})` under a comment claiming it mirrors production *exactly*, and never calls `configureBodyParser` (`pii-boundary.spec.ts:276-278`). Only `createValidationPipe()` attaches the `details` array. So the suite designated as DC-2's gate — the class where *"an error envelope that reflects input back is the easiest leak to miss"* — **cannot currently render that envelope** (C-8). The correction (§1.3) is a prerequisite, not a nice-to-have.

Extended coverage adds a registration-specific forbidden set — payload keys, `submitterEmail`, `id`, `reviewedBySub`, `reviewedByEmail` — asserted as **values** from an approved and a rejected fixture, across all four public paths plus the `400` and `429` bodies.

**And the iteration set is derived from the route table, not compared to it.** Revision 1 proposed asserting the module's public route list against an expected list, which fails when a route is *added* and goes green again as soon as someone appends one string — leaving the new path unasserted (C-9). Instead the suite **enumerates the module's registered public routes at runtime and drives the PII scan over that enumeration**. The re-judgment confirmed this is achievable (Nest's `DiscoveryService`, or the Express router stack).

**One further requirement, or C-9 returns intact.** A scan needs a per-route method, URL and valid request body — and for `POST /registrations` that means a consumed-OTP fixture, for `POST /registrations/lookup` a matching reference-and-email pair. Neither is synthesizable from route metadata. So the fixture map **must be total, and a missing fixture must fail the suite**. Without that, `for (const r of routes) { const fx = FIXTURES[r]; if (!fx) continue; … }` satisfies every word of this design while restoring C-9 exactly — a new public path unasserted behind a green release gate (RA7). *The gate is the totality assertion, not the enumeration.*

**Throttler state and the gate.** Driving `429` inside a `beforeAll`-shared app leaves in-memory counters across `it` blocks, making a hard release gate order-dependent (B28) — chunk 1's R-4 records what a 14%-red suite costs. The `429` assertions therefore run in an isolated describe block with a dedicated app instance and a reset limiter.

### 6.3 Data at rest, logs, secrets

`payload` and `submitterEmail` exit only through Admin-guarded routes. **Never logged:** OTP codes, payload fields, phone numbers, email addresses, mail bodies. **Logged** (§4.10): request id, route, method, status, role, latency, reference code, send attempt/outcome. The reference alone is not a credential — the lookup needs the matching email.

The OTP HMAC secret and the sender address come from SSM/Secrets Manager. CORS unchanged; `AllowMethods` already includes `POST`.

### 6.4 Retention — recorded, unresolved

Rejected registrations retain `phone` and `email` for organisations never published. No purge is designed (OQ-3). The sharpest new edge on PRD OQ-4, carried as an accepted risk in §11 rather than resolved by engineering fiat.

---

## 7. Infrastructure / Deployment

All commands `--profile IBD-DEV`, region `eu-west-1`.

| Change | Where |
|---|---|
| Migration | `npx prisma migrate deploy`, `DATABASE_URL` composed in-process from Secrets Manager per `infra/scripts/migrate-seed.sh`. **Do not run that script whole against a live DB — it also seeds** |
| SES enablement | Run the existing Phase-A path: `infra/README.md` §6 + `infra/10-data-auth/t9-enable-ses.sh`, setting `SenderEmail` so `HasSender` is true and the identity actually exists (§1.2) |
| `ses:SendEmail` on the Lambda role | `infra/20-backend/template.yaml`, scoped to the sender identity |
| OTP secret, sender address, `MAIL_TRANSPORT` | SSM / Secrets Manager + env. `MAIL_TRANSPORT` is the switch NFR-10 is measured against |
| No new stacks | Rate limiting is application-level; no infra throttling added |

**Rollout order:** migration → backend → frontend. The frontend must not ship first, or the nav advertises a broken form.

**Operational prerequisites for go-live, not code:** verified sending domain, SES sandbox exit, monitored bounce rate. FR-4 makes email load-bearing at the gate (DC-22); without these, applicants are locked out by a correctly functioning system.

---

## 8. Decision Records

### DD-1: Registrations in a separate table, no public read of the payload
Per proposal D2→A. A forgotten `WHERE` cannot publish an unapproved actor because there is no row in the public table to forget. Costs weak queryability on submitted fields — acceptable, the queue filters on status and date. ADR-003's argument, one layer out.

### DD-2: Literal-pick serializer + a route-table-**derived** PII scan
No global guard exists, so a future public route in this module is public by default. The scan's iteration set is derived from the registered route table (§6.2), so coverage cannot lag behind routes. Costs a runtime route enumeration in a test; buys a gate that cannot be silenced by editing a list.

### DD-3: Approval calls chunk 1's shared consent invariant
Chunk 1's DD-1 chose one shared invariant over four inline checks to stop divergence. This is a fifth call site. **Retained as drift protection, not as a gate** — at this call site it cannot return false (§4.6).

### DD-4: `traderId` derived from the reference, with explicit collision handling
`REG-2026-0184` → `SR-2026-0184`. Unique among self-registered actors by construction; **not** table-wide, because admin create accepts arbitrary keys — so `P2002` becomes a `409`, not a `500`. Ties the two identifiers permanently, which is a feature: `consentReference` already stores the reference, so provenance is self-evident from the key.

### DD-5: In-memory per-container rate limiting, with a shared control on **every** public path
Not a distributed limiter, and this design does not claim it is. Each path's shared control is tabulated in §4.4 — including `/lookup`, whose omission from revision 1 was C-4. Escalation to a shared store is a recorded trigger, not speculative work.

### DD-6: Two additive audit actions and two additive audit methods
`logCreate` cannot write them (§2.5). New methods rather than a new action parameter, so no existing call site changes. For a `REGISTRATION_REJECT` row, `actorId` is the **registration** id, not an actor id — `ActorAuditLog.actorId` is deliberately FK-less, so this bends no constraint, but a query joining audit rows to actors **must exclude `REGISTRATION_REJECT`**.

> Revision 1 said to exclude *both* new actions, which would have hidden the approval row from the created actor's own history — deleting the audit trail for the spec's most consequential write (B26). `REGISTRATION_APPROVE` carries a real `actorId` and belongs in actor history.

### DD-7: The consent policy is served by the API, not bundled
Deploy skew cannot break submission, and the unknown-version `400` becomes reachable and testable. Costs one public GET, trivially clean for the PII gate.

### DD-8: The scroll-gate predicate is a pure function
jsdom does not lay out or scroll, so a DOM-level test asserts against zeroes and passes without proving anything. The logic is genuinely covered; the presentation honestly is not (DC-17). Answers KZ-002 directly.

### DD-9: Notifications dispatch outside the adjudication transaction
Commit first, then send; log failures, never rethrow. A mail outage cannot block publication. Costs a committed decision whose notification may never arrive — which is why the lookup exists.

### DD-10: `AcknowledgeDialog` for approval
Mandated by `frontend/CLAUDE.md:26` for consent-granting submits, and it carries the consent-provenance affordances `admin/bulk-actor-operations` and chunk 1 built. `ConfirmDialog` is for destructive confirms and hardcodes `bg-danger`.

### DD-11: OTP lookup by email, compare by HMAC
Necessary for the attempt counter to observe a wrong guess at all (§4.3). The alternative — keying the lookup on the code hash — makes the cap unreachable, which is what revision 1 shipped.

---

## 9. Step 2.3 — Reversion Challenge

**Triggered once, by §4.4's payload cap.** Revision 1 declared this section "not triggered"; that was true of revision 1's design and is false of this one, because the corrected mechanism edits shared bootstrap.

**Challenge — what does adding middleware ahead of `configureBodyParser` break?**

| Risk | Answer |
|---|---|
| It applies to every route | Path-scoped **inside** the middleware to the registration routes; all other routes fall through untouched |
| It diverges between entrypoints | Registered identically in `main.ts` and `lambda.ts`, which is what FR-7's "same shared bootstrap" clause asks for |
| It behaves differently under `serverless-http` | The realised failure mode of this codebase (`complete: true` ⇒ body-parser skips parsing). **Must** be proven through `lambda-handler.e2e.spec.ts`; supertest cannot see it |
| It changes the 8 MB admin import limit | It does not — `JSON_BODY_LIMIT` is untouched and the cap is not applied to import routes |

Nothing else reverts: `createValidationPipe()`, both guards, the consent `WHERE`, and both PII constants are unchanged. §2.5's audit methods and §5.7's taxonomy work are **additive** — no existing method signature, label or token changes. The excluded mockup panels (D-2…D-6) are not shipped behaviour, so no challenge applies.

---

## 10. Budget (Step 2.4 — tripwire for `/akili-execute`)

**Revision 1's budget was not calibrated, and the judges dismantled it.** It allocated ~1,300 frontend code lines for 5 pages and 12 components while naming two existing files as the pattern to follow — `ActorForm.tsx` (916 lines) and `ActorsTable.tsx` (729). Those two alone are 1,645 lines, before tests (699 + 599). It also claimed the scope "matches" the epic's RICE, which puts chunk 3 at **E = 3.0** against chunk 1's **0.5** — a 6× ratio, not the 2.4× asserted — and claimed to scale chunk 1's *actual* review-round rate, which exists nowhere as a number (C-15).

Re-derived from measured analogues rather than guessed:

### 10.1 Revision 3 — the 3a budget (authoritative)

The split reassigns roughly 40% of the work to 3b. Re-derived for **3a only**, with the review-round rate taken from chunk 1's *record* rather than asserted:

| Signal | **3a (this spec)** | Basis |
|---|---:|---|
| Tasks | **23** | 6 foundation (migration · consent policy + endpoint · mail · logging · throttle + envelope filter · payload cap helper) · 7 public backend (OTP · verify · DTO · submission + allocation · lookup · **pii-boundary harness correction** · pii-boundary extension) · 8 frontend (taxonomy ×4 files · `NavLink` variant + nav · landing CTA · form · consent disclosure · OTP step · receipt · status lookup + a11y) · 3 constitutional |
| Backend code | ~1,500 | Public half of `registrations`, plus mail, logging, throttle and cap — all from zero |
| Backend tests | ~1,300 | The PII gate is 423 lines today for 3 paths; this corrects its bootstrap and extends it to 4 paths plus `400`/`429` with a total fixture map |
| Frontend code | ~1,900 | 3 pages, 6 components, 4 taxonomy files, nav. Measured analogue: `ActorForm.tsx` is **916** lines alone |
| Frontend tests | ~1,500 | Measured analogue: `ActorForm.test.tsx` **699** |
| Docs + amendments | ~300 | 3 constitutional documents |
| **Total LOC** | **~6,500** | |
| Review rounds | **~37** | 23 tasks × **1.6/task**, chunk 1's demonstrated rate (≈16–17 rounds over 10 tasks per `archive-summary.md` §6) |

**The review-round figure was corrected upward, not down.** Revision 2 claimed to scale "chunk 1's demonstrated >1 round/task" and produced 38 for 31 tasks — **1.23/task**, which sits *below* the evidence it cited (C-15's unfixed limb, RA-confirmed). At chunk 1's real rate, 31 tasks would have implied ~50. A tripwire set under its own evidence base cannot fire on a genuine surprise, which is the only thing a tripwire is for.

**Tripwires for `/akili-execute` on 3a:** more than **23 tasks**, more than **~7,300 LOC**, or more than **37 review rounds** — any one halts for the user. 3b sets its own during its `/akili-specify`.

### 10.2 Revision 2's combined figures — superseded, retained for the record

| Signal | Revision 1 | **Revision 2** | Basis |
|---|---|---|---|
| Tasks | 24 | **31** | +2 email/logging capability, +1 pii-boundary harness fix, +1 `NavLink` variant, +1 taxonomy across 4 files, +2 from split public/admin backend work |
| Backend code | ~1,400 | **~2,100** | +mail module, +logging module, +throttle filter, +payload-cap middleware, +2 audit methods |
| Backend tests | ~900 | **~1,600** | The PII gate alone is 423 lines today for 3 paths; this adds 4 paths plus error and 429 bodies |
| Frontend code | ~1,300 | **~2,900** | Measured: the two named analogues are 1,645 lines for 2 of ~20 artifacts |
| Frontend tests | ~900 | **~2,300** | Measured: `ActorForm.test.tsx` 699 + `ActorsTable.test.tsx` 599 for 2 artifacts |
| Migration, docs, amendments | ~200 | **~400** | 8 constitutional amendments |
| **Total LOC** | ~4,700 | **~9,300** | |
| Review rounds | ~30 | **~38** | 31 tasks at chunk 1's demonstrated >1 round/task |

**Depth `Full` is confirmed, and the size is now the finding.** At ~9,300 LOC and 31 tasks this is roughly 7× chunk 1 — which finally *does* agree with the epic's 6× RICE ratio, where revision 1's figure did not. That agreement is the honest signal: the epic sized this chunk correctly and revision 1 under-read it by half.

**Tripwires for `/akili-execute`:** more than 31 tasks, more than ~10,500 LOC, or more than 38 review rounds — any one halts for the user.

**A scoping observation, not a decision.** ~9,300 LOC in one spec is large enough that splitting it — public applicant flow as one spec, admin review queue as another — is worth considering before execution, since the two halves share only the `Registration` model and could ship sequentially. That is the user's call, and it is raised in §11 R-11 rather than acted on.

---

## 11. Risks & Mitigations

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | First unauthenticated write path; abuse and connection pressure with RDS Proxy deferred | Cap before parse, throttle, OTP before persistence, DTO bounds; per-path shared controls (§4.4) |
| **R-2** | Unapproved PII at rest, outside every existing guarantee | DD-1 containment, DD-2 route-derived scan, corrected + extended `pii-boundary.spec.ts` as **release gate** |
| **R-3** | Payload-cap middleware misbehaves under `serverless-http` | Path-scoped; proven through `lambda-handler.e2e.spec.ts`. §9 challenge recorded |
| **R-4** | Email load-bearing at the OTP gate on a channel with a realised failure | Accepted, user-confirmed. Send attempts/failures logged (§4.10); operational prerequisites §7. No in-band fallback exists — stated, not hidden (DC-22) |
| **R-5** | Consent misrepresented | Unticked at every initial render; scroll-gated UX; server-validated acceptance and version; stored verbatim; shown at review |
| **R-6** | Duplicate submissions against chunk 2's ~1,300 imported actors | Review-time detection, per-candidate dismissal, duplicate as a first-class rejection reason |
| **R-7** | Retention of rejected registrations | Unresolved by design; OQ-3, §6.4. Accepted risk carried into execution |
| **R-8** | Reviewer workload on a cohort burst | Segments, oldest-first, indexed queue. Bulk adjudication excluded (D-3) — workload does not override the consent argument |
| **R-9** | Reference allocation race | Per-year counter row inside the submission transaction (§4.5), unique constraint plus bounded retry as backstop |
| **R-10** | Taxonomy drift recurring | Closed across four files (§1.3). The anti-drift gate cannot import a backend constant — `frontend/CLAUDE.md` mandates hand-mirrored types — so it asserts ten labelled entries with no raw snake_case fallback, and the mirroring obligation is documented rather than automated (A-alpha's point on B-beta's proposed gate) |
| **R-11** | **The spec is ~7× chunk 1.** A 31-task, ~9,300-LOC spec has a wide blast radius and a long unreviewed middle | Budget tripwires (§10). **Splitting into applicant-flow and review-queue specs is available and is the user's call** — the two share only the `Registration` model |
| **R-12** | Rollback correctness is unverifiable in this harness | `requirements.md` DC-24: structural assertions gated, real rollback not. A DB-backed test harness would close it and is out of scope; recorded as a follow-up |

---

## 12. Test Plan Outline

| FR / NFR | Coverage |
|---|---|
| FR-1 | Nav entry present, linked, and rendered with the primary variant; landing CTA states review-before-publication; absent from admin sidebar. **Accessible name and focus visibility → DC-16 human check**, not `jest-axe` |
| FR-2 | Per-field DTO tests **as enumerated in §4.1** (not "mirroring" another DTO): `@ArrayNotEmpty` on crops ⇒ no-crop submission `400`s with a `details` entry; `@MaxLength` on every string; coordinate-pairing cross-field (one-of-two ⇒ 400); nested `consent` validates under `whitelist:true`; frontend error mapping with summary ↔ inline from one source; GPS-optional copy present |
| FR-3 | Missing / false / unknown-version acceptance ⇒ `400` and **zero rows**; stored version and timestamp equal the submitted ones. Unticked at initial render; disabled until end; predicate unit tests with injected metrics **including content-shorter-than-container**; keyboard reachability. **Real-browser gate behaviour → DC-17 human check** |
| FR-4 | Wrong / expired / consumed ⇒ indistinguishable `400`, zero rows. **`attempts` increments on a wrong code** and the cap kills it (S-1's defect made a regression test). `/verify` byte-identical for known, unknown, **and over-cap** addresses. Conditional-consume concurrency. Verified address is what publishes as `Actor.email` |
| FR-5 | Submit response contains **only** `reference` — asserted against fixture values for every payload field and the internal `id` |
| FR-6 | Correct pair returns status (+note); the two failure modes **byte-identical**; case-insensitive email match; `lookupAttempts` bounds retries and `lookupLockedUntil` blocks; **no email in any URL** |
| FR-7 / NFR-4 | Over-rate ⇒ `429` **in the documented envelope** (DC-26); over-cap ⇒ rejected with no Prisma call (mock asserts zero invocations); **both proven through `lambda-handler.e2e.spec.ts`** against the real handler |
| FR-8 / NFR-1 | **Release gate.** Harness first corrected to `createValidationPipe()` + `configureBodyParser` (§1.3). Registration-specific forbidden key **and value** sets across all four public paths plus `400` and `429` bodies, approved and rejected fixtures. **Scan iteration derived from the runtime route table**, so a new public route is covered automatically. `429` assertions isolated from shared throttler state |
| FR-9 | List, segments, sort default, URL sync; `Staff` ⇒ 403, anonymous ⇒ 401 per endpoint; absence of the `AWAITING_APPLICANT` segment and the "No email" flag; page-beyond-result-set distinguishes both empty cases |
| FR-10 | **Reference code rendered**; every submitted field shown; non-publishable fields marked review-context; consent block shows version and timezoned timestamp; `ActivityTrail` pure-function test asserting **no fabricated duplicate-check timestamp** |
| FR-11 | Candidates per match type, capped and ordered; never blocks or pre-selects; **per-candidate** dismissal — clearing candidate A still surfaces a later candidate B |
| FR-12 / NFR-2 | All four provenance fields exact; `consentObtainedAt` **equals** stored acceptance time; `Actor.email` **equals** the verified address; derived `traderId` non-colliding with all **eight** chunk-2 prefixes; **pre-existing `SR-` key ⇒ `409`, not `500`**; **DC-23: no non-publishable payload value appears in any column of the created actor**, asserted by value; double approval ⇒ `409` and no second actor; server-side acknowledgement re-validation |
| NFR-3 | **Amended (DC-24).** Gated: all writes inside one `$transaction` callback, a throw propagates unswallowed, no `catch` absorbs it. **Not gated:** real MySQL rollback — the harness mocks Prisma |
| FR-13 | Structured reason and note stored; **no actor created**; consent record unchanged; audit written via `logRegistrationReject`; missing reason ⇒ `400` |
| FR-14 / NFR-10 | With the no-op transport: submit → status → outcome reachable; a send failure does **not** roll back an approval; **each of the three post-submission messages carries the reference** (the FR-4 verification code is FR-14's stated exception — see §4.9) |
| FR-15 | Ten labelled entries with no raw snake_case fallback; form offers ten; `ROLE_BG_CLASS` and `ROLE_CSS_VAR` cover all ten (these are total `Record` types, so `npm run build` is the primary guard — the assertion is belt-and-braces); **`LeafletMap.tsx:67`'s `?? '--color-muted'` fallback checked**, since that one *would* degrade quietly (RB10) |
| NFR-5 | `jest-axe` per new screen (`*-a11y.test.tsx`, the project's per-file pattern). **Records that contrast, focus order and focus visibility are NOT covered** — jsdom returns *incomplete* on `color-contrast` and `toHaveNoViolations` does not fail on it. Reduced-motion: no entrance motion on these screens (§5.1) |
| NFR-6 | Zero hex literals in new frontend files (grep gate); `npm run lint` |
| NFR-7 | `cd frontend && npm run build` under `output: 'export'` |
| NFR-8 | Log-capture: fixture PII values and OTP codes absent from emitted output on submission and adjudication paths; request id / route / status / latency present; send attempt and failure present |
| NFR-9 | Pagination and `where`/`orderBy` shape gated. **Index *usage* not gated → DC-25** |

**Two harness constraints binding every task.** A `Read`/`Grep`/`Glob` Reviewer cannot run a suite, so all run-evidence traces to an Implementer or the Leader. And per KZ-003, every frontend component here takes plain props — none may be deferred on "needs an authenticated session", because a throwaway harness renders them with no stack, no database and no login.

---

## 13. Judgment Day Disposition

Full ledger: `judgment.md`. Round 1 ran two blind judges (11 SEVERE / 18 WARNING / 3 SUGGESTION and 18 / 13 / 2); both independently re-verified the 40-scenario count as correct.

| Ledger ID | Fixed in revision 2 |
|---|---|
| C-1 | §2.5 — two additive audit methods; `logCreate` no longer claimed reusable |
| C-2 | §4.4 — raw `app.use` before `configureBodyParser`; §9 challenge now triggered |
| C-3 | §3.1 decision 1, §5.3 — cap enforced silently; resend never reports a refusal |
| C-4 | §4.4 — `lookupAttempts`/`lookupLockedUntil` as `/lookup`'s shared control |
| C-5 | §4.10 — minimal scoped logging module; §1.2, §10 updated |
| C-6 | §1.3, §5.7 — four files, with the silent-degradation risk named |
| C-7 | §5.6, DD-10 — `AcknowledgeDialog` per `frontend/CLAUDE.md:26` |
| C-8 | §1.3, §6.2 — harness corrected to production bootstrap as a prerequisite |
| C-9 | §6.2, DD-2 — scan iteration **derived from** the route table |
| C-10 | §2.6 — `MODIFY` disclosed with the in-repo precedent; MySQL vocabulary |
| C-11 | §3.1 decision 3 — lookup takes a body |
| C-12 | §5.5, §12 — reference code on the detail screen |
| C-13 | §4.1 — DTO enumerated explicitly; `@ArrayNotEmpty`; `@MaxLength` everywhere |
| C-14 | §3 — 4 public / 5 admin, reconciled with `requirements.md` §4 and §14 |
| C-15 | §10 — budget re-derived from measured analogues: ~9,300 LOC, 31 tasks |
| S-1 | §4.3, DD-11 — lookup by email, compare by HMAC, increment on mismatch |
| S-2 | §4.5, §4.6 step 5 — `P2002` ⇒ `409` |
| S-3 | `requirements.md` DC-24 + NFR-3 measure amended; §12 |
| S-4 | §5.5 — no fabricated duplicate-check timestamp; FR-10 amended |
| S-5 | §4.1 — `@ArrayNotEmpty` on crops |
| S-6 | §2.2, §4.1 — one verified address, published as `Actor.email` |
| S-7 | `requirements.md` DC-23; §12 FR-12 row |
| INFO | A14 (eight prefixes) · A15 (SES condition) · A19·B22 (per-candidate dismissal) · A21 (throttler envelope filter, DC-26) · A22·B31 (invariant is drift protection, not a gate) · A23 (OTP consumed inside the transaction) · A25·B29 (GPS copy) · A26 (reduced motion) · A28·B25 (A-4 attribution) · A29·B24 (`NavLink` variant) · A30 (chunk-4 citation retracted) · A31 (reference allocation strategy) · A32 (dates) · B19 (`TZ-SEED` — claim retracted) · B23 (`submitterEmail` index removed) · B26 (DD-6 exclusion narrowed) · B28 (throttler test isolation) · B32 (receipt copy) · B33 (`@ValidateNested`) |

**The round's primary lesson, for `/akili-archive`.** No individual finding is the root cause. Revision 1 headed §1 *"verified present, not assumed"* over a table assembled from a subagent's summary that the author never opened the files to check. Most of that table was in fact correct — judge-alpha verified ~25 claims as true — but seven were false, and they passed **because the label asserted they could not be**. A provenance claim is a factual claim about your own process, and it is exactly as falsifiable as the claims it vouches for. In revision 2 every codebase assertion carries a `file:line`, and anything without one is explicitly a decision rather than an observation.
