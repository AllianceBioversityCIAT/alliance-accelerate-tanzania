# Design — Consent request by email for team-managed actors

- Spec path: `docs/specs/actors/consent-intake/consent-request-email/`
- Status: Approved (2026-10-05)
- Traces requirements: FR-1…FR-17, NFR-1…NFR-11 from [`requirements.md`](requirements.md)
- Depth: Full · Approval Mode: gated
- Verified at commit `342390a` (branch `feature/atp-84-consent-request-flow`, equal to `main`)
- Exploration: three read-only scouts (backend, frontend, infra) plus Leader greps. Citations are in §11.

## 1. Executive Summary

The design adds a new backend module, `ConsentRequestsModule`. It owns these parts:
- two tables, `ConsentRequest` and `ConsentDocument`, with no foreign key to `Actor`;
- an append-only admin-managed consent edition registry;
- a **persist → dispatch** send pipeline that the admin's browser drives in time-boxed steps;
- two public token endpoints, with the token in the request **body** and a uniform miss;
- admin routes for evidence, sending and document storage.

Documents go to a new private S3 bucket in the `20-backend` stack. The browser uploads with a **presigned POST** that has a size and type policy, and confirmation promotes the object out of a self-expiring `incoming/` prefix.

The public page lives in a **new route group, `(consent)`**, that never mounts analytics. Its exclusion from GA4 therefore comes from the layout structure (the ADR-011 tactic), not from fragment stripping.

Admin write paths that change consent or email **supersede** pending requests inside their existing transactions (D-20). `EMAIL_LINK` is excluded from every admin-assertable method list, so only the actor's response can write it.

**Budget (tripwire, §10):** 14 tasks · ~11,300 LOC (≈ 40 % production, 60 % tests) · ~20 review rounds. *Re-baselined from ~9,800 at decomposition: the judgment-day fixes added the immutability gate, the frozen-evidence rules and the method-list walk.*

## 2. Architecture Overview

```
Admin browser                         API Lambda (NestJS)                       External
─────────────                         ───────────────────                       ────────
Send dialog ──POST preview──────────► ConsentRequestsService.preview (no writes)
            ──POST enqueue──────────► .enqueue  → ConsentRequest rows QUEUED (+supersede, single)
            ──POST dispatch (loop)──► .dispatch → claim QUEUED→SENDING (CAS per row)
                                                → mint token, store sha256, SENT/FAILED ──► MailService ─AMQP─► Notification µsvc ─► actor inbox
Actor browser                                                                              (Slack: fixed subject only)
/consent/#t=… ─strip fragment─►
            ──POST /consent/view────► ConsentPublicService.view   → uniform 404 | {org, record(publicDetail), edition}
            ──POST /consent/respond─► ConsentPublicService.respond → route actorId (outside tx) → $transaction:
                                         lock Actor FOR UPDATE (first) · CAS request open→ACCEPTED|DECLINED · Actor consent update · audit (sentinel)
Admin edit page
  evidence panel ──GET evidence─────► list requests + documents
  attach doc ──POST upload-url──────► presigned POST (incoming/<docId>, ≤10 MB, exact type, 5 min)
             ──POST to S3 directly─────────────────────────────────────────────────► S3 private bucket
             ──POST confirm─────────► HeadObject → CopyObject incoming→stored → DeleteObject → STORED + audit
  download ──GET download-url───────► presigned GET (stored/<docId>, 5 min, attachment)
```

## 3. Extended Directory Structure

```
backend/
  prisma/schema.prisma                                   + ConsentRequest, ConsentDocument, enums
  prisma/migrations/<ts>_add_consent_requests/           additive
  src/consent-requests/
    consent-requests.module.ts                           controllers: public + admin; exports ConsentRequestsService
    admin-consent-editions.json                          edition registry (v1.0)
    admin-consent-policy.ts                              registry loader, current edition, text hash
    __fixtures__/legal-admin-consent-v1.0.txt            committed .docx extract (FR-1 verbatim test)
    consent-token.util.ts                                mint 32-byte token, sha256
    consent-eligibility.ts                               pure FR-2 rule
    consent-requests.service.ts                          preview, enqueue, dispatch, retry, evidence
    consent-supersession.module.ts / .service.ts         supersedePendingFor (exported; imported by ActorsModule and ConsentRequestsModule)
    consent-public.service.ts                            view, respond
    consent-public.controller.ts                         POST consent/view, POST consent/respond (throttled, public)
    consent-throttle.guard.ts                            ThrottlerGuard subclass
    admin-consent-requests.controller.ts                 admin routes (§6)
    consent-documents.service.ts                         presign, confirm, download
    document-storage.ts                                  S3 port + adapter; "unconfigured" when env absent
    dto/ …
  src/mail/templates/consent-request.template.ts         fixed subject; email-layout blocks
  src/mail/mail.service.ts                               + sendConsentRequest
  src/common/consent-methods.ts                          ADMIN_ASSERTABLE_CONSENT_METHODS
  src/actors/{actors-admin.service,actor-import.service}.ts, dto/{actor-create,bulk-consent}.dto.ts, common/template-columns.ts
  src/actors/actor-audit.service.ts                      + logConsentRequested / logConsentResponded / logConsentDocumentUploaded
  src/test/pii-boundary.spec.ts                          + derived gate over ConsentRequestsModule
frontend/
  app/(consent)/layout.tsx                               Header + main + Footer; NO ConsentProvider/GoogleAnalytics
  app/(consent)/consent/page.tsx                         token from fragment → strip → view/respond
  components/consent/{ConsentRecordPreview,RespondentFields,ConsentResponseForm,ConsentDeadEnd}.tsx
  components/register/ConsentTextScrollGate.tsx          extracted presentational gate (shared with ConsentPolicyDisclosure)
  components/admin/{SendConsentDialog,SendConsentPrompt,ConsentQueueBanner,ConsentEvidencePanel,ConsentDocumentField}.tsx
  lib/admin/useConsentDispatch.ts                        dispatch loop
  lib/api/{consent-public,consent-requests-admin}.ts
  lib/content/consent-requests.ts                        status labels, skip-reason copy
infra/20-backend/template.yaml                           + ConsentDocumentsBucket, policy, CORS, lifecycle, IAM, env var
docs/ prd.md · trd/trd.md · ux-ui/design.md · infrastructure.md ; CLAUDE.md · AGENTS.md · backend/{CLAUDE,AGENTS}.md
```

## 4. Data Model

### 4.1 `ConsentRequest` (new)

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | Also written to `Actor.consentReference` on accept. |
| `actorId` | String | **Plain string, no relation**, so the row survives actor deletion (P-4). |
| `traderId`, `traderName` | String / String(200) | Snapshot at enqueue. It survives deletion and renames, and it supplies `ActorAuditLog.traderId`, which is NOT NULL (P-28), for every consent audit row. |
| `status` | enum `ConsentRequestStatus` | `QUEUED · SENDING · SENT · FAILED · ACCEPTED · DECLINED · SUPERSEDED`. **Expired is derived** (`SENT` and `expiresAt < now`). No job or cron is needed. |
| `batchId` | String | Groups one enqueue, for dispatch and result counts. |
| `recipientEmail` | String(191) | The actor's email **at enqueue**. The email is sent to this address. |
| `editionVersion` | String(32) | e.g. `v1.0`. |
| `editionHash` | Char(64) | SHA-256 of the edition's canonical serialization (§7.2). |
| `requestedBySub` / `requestedByEmail` | String / String? | Acting admin (server-resolved, `ActingAdminResolver`). |
| `createdAt`, `claimedAt?`, `sentAt?`, `expiresAt?` | DateTime | `expiresAt = sentAt + 30 d`. |
| `failureReason` | String(64)? | A non-PII code: `transport_rejected`, `timeout`, `stale_claim`. |
| `attempts` | Int | Incremented per dispatch claim. |
| `tokenHash` | Char(64)? `@unique` | SHA-256 of the raw token. Set at send and **never returned by any route**. |
| `respondedAt?`, `respondentName?`(120), `respondentPosition?`(120), `respondentEmail?`(191), `respondentPhone?`(40), `respondentIp?`(45), `respondentUserAgent?`(512) | | Written once, by `respond` only. |
| `supersededAt?` | DateTime | |

Indexes: `(actorId, createdAt)`, `(status, batchId)`, unique `tokenHash`.

### 4.2 `ConsentDocument` (new)

| Field | Notes |
|---|---|
| `id` (cuid), `actorId` (plain string, no relation), `traderId` + `traderName` snapshot taken at `upload-url` | The snapshot feeds the confirm-time audit row, even if the actor was deleted in between (P-28). Confirm still stores the document, because evidence is retained. |
| `status` | `PENDING` (presigned, not confirmed) · `STORED`. Only `STORED` is listed. |
| `fileName` (255), `contentType` (`application/pdf` · `image/jpeg` · `image/png`), `sizeBytes` | Declared at presign. Verified at confirm by `HeadObject`. |
| `storageKey` | `incoming/<id>` until confirmed, then `stored/<actorId>/<id>`. |
| `uploadedBySub` / `uploadedByEmail?`, `createdAt`, `storedAt?` | |

### 4.3 Enum changes

| Enum | Change | Consumers walked (DD-9) |
|---|---|---|
| `ConsentMethod` | + `EMAIL_LINK` | See DD-9 and §5.7. Admin **create**, bulk, import and template use `ADMIN_ASSERTABLE_CONSENT_METHODS`. **Update** accepts the full set, but enforces the three §5.7 rules: no change to `EMAIL_LINK`, no transition into `GRANTED` with it, and `EMAIL_LINK` evidence frozen while `GRANTED`. The list filter and every display use the full set. The frontend hand-coded lists are walked in §5.7 (P-15). |
| `ActorAuditAction` | + `CONSENT_REQUESTED`, `CONSENT_RESPONDED`, `CONSENT_DOCUMENT_UPLOADED` | `actor-audit.service.ts`, `audit-entry.serializer.ts`, frontend `AuditEntry['action']` union, and `ActorHistoryPanel`'s total `actionBadgeClasses` Record (the build fails if any is missed). |
| `ConsentRequestStatus`, `ConsentDocumentStatus` | new | Only this module. |

The migration is additive (two `CREATE TABLE`s plus two enum `ALTER`s that only append values). `pii-consent.policy.ts` is unchanged, because no `Actor` column is added.

## 5. Backend Module Design

### 5.1 Eligibility (FR-2)

`consent-eligibility.ts` is a pure function over the actor and its requests. Its outcome is one of `eligible · no_email · granted · pending_request · declined`.

- **Pending request** (the blocking set, B-4) is any request in `QUEUED`, `SENDING` or `FAILED`, or in `SENT` with `expiresAt > now`. Counting the first three stops two enqueues before dispatch from duplicating emails. A `FAILED` row is resumed with **Retry**, never by a fresh send.
- **`declined`** applies only when `scope = 'bulk'`.
- **`scope = 'single'`.** A pending request is not a skip: enqueue supersedes it (FR-3 resend).

**`scope: 'single'` requires `{ kind: 'ids', ids: [exactly one] }`.** Any other target with `single` is a `400` naming `scope`, on both routes, before any read (added 2026-10-05 during T-3 rework; it enforces FR-2's "AND IT MUST be enforced by the API").

`preview` and `enqueue` both resolve the target **server-side**. The target is either:
- `{ kind: 'ids', ids ≤ 1000 }`. The 1,000 cap matches the import row cap.
- `{ kind: 'filter', filter }`. The filter takes the five `AdminActorListQueryDto` filter fields.

A filter target uses `buildAdminActorWhere(q)`, a pure function **extracted** from the inline `where` literal in `ActorsAdminService.adminList` (P-30). `adminList` and this module both call it, so "all matching" means exactly what the table shows (P-12).

### 5.2 Persist, then dispatch (FR-6, NFR-6)

1. **Enqueue.** *(D-25, amended 2026-10-05.)* The transaction first locks the targeted `Actor` rows (`SELECT … FOR UPDATE` through parameterized `$queryRaw`, the `ActorSequence` precedent). It then evaluates eligibility **inside** the transaction, so a concurrent enqueue for the same actor waits and then sees the first one's pending row. The lock must stay the **first statement** in the transaction: InnoDB opens the read view at the first plain read, so the eligibility read has to come after `FOR UPDATE` returns. Overlapping bulk sets rely on InnoDB taking row locks in primary-key order; a deadlock would surface as a `500`, and the admin can retry. That same transaction creates `QUEUED` rows (`createMany`, P-29) for every eligible actor, snapshotting `recipientEmail`, `traderId`, `traderName`, edition and hash. For `single` it first calls `supersedePendingFor(tx, [actorId])`. It returns `{ batchId, queued, skipped: { reason → count } }`.
2. **Dispatch** `{ batchId? }` loops until the **time budget (7.5 s)** is spent or nothing is left. The budget is checked **before the claim** (RB-4), so no row is ever claimed after it. One loop pass:
   1. Selects the next `QUEUED` id.
   2. **Claims** it with a compare-and-set `updateMany(id, status=QUEUED) → SENDING, claimedAt, attempts+1` (P-29). A count of 0 means another tab claimed it, or it was superseded, so the row is skipped (FR-6 scenario 2).
   3. **Re-checks eligibility at claim time** (B-3): the actor exists, is not `GRANTED`, and `actor.email === recipientEmail`. If not, it sets `SUPERSEDED` and sends nothing.
   4. Mints the token and stores `tokenHash`.
   5. Calls `MailService.sendConsentRequest`.
   6. **Result write is also a compare-and-set** on `status = SENDING` (B-2).
      - On success: `→ SENT, sentAt, expiresAt` plus a `CONSENT_REQUESTED` audit row, in one transaction.
      - On a throw: `→ FAILED` with a code.

      A count of 0 means an admin superseded the row mid-send. It stays `SUPERSEDED`, so the emailed link is dead (lookup requires `SENT`), and no audit row is written.

   **Timing.** No row is claimed after 7.5 s. The last pass then costs:
   - the pre-send database steps (select, claim, actor re-read, `tokenHash` write), ≤ 0.3 s;
   - the send, bounded by `MAIL_SEND_TIMEOUT_MS` (3 s) **plus** `MAIL_LOCK_WAIT_TIMEOUT_MS` (0.2 s), which `mail-timing.ts` declares additive;
   - the result transaction, ≤ 0.5 s.

   The worst case is 7.5 + 0.3 + 3.2 + 0.5 = **11.5 s**. That is within NFR-6's 12 s and under `Timeout: 15` (P-9, P-10). Dispatch returns `{ sent, failed, remaining }`.
3. **Stale claim.** A `SENDING` row older than 2 minutes has an unknown outcome: the mail may or may not have left. It is marked `FAILED/stale_claim`, by a compare-and-set on `SENDING`, and **never auto-resent**. Retry is the admin's explicit act (FR-6: no silent double send).
4. **Retry** `{ batchId? }` moves `FAILED → QUEUED` (all batches when omitted) and clears `tokenHash`. Eligibility is re-checked at claim (step 2.3). A resent email carries a new token, and any earlier link for that row dies.
5. **Queue summary** `GET` returns `{ queued, failed }` across all batches, for the resume banner (FR-4 scenario "closing the tab").

The browser loop (`useConsentDispatch`) calls dispatch until `remaining = 0`, showing `sent / failed / remaining`. One dispatch at a time per tab keeps the load to one Lambda concurrency slot of the 5 reserved (P-10).

### 5.3 Token (NFR-1, FR-8)

- **Minting.** `randomBytes(32)` → base64url. The database stores only `sha256(token)` hex.
- **Lookup.** `findUnique({ tokenHash })`. The hash lookup is constant-cost, so no comparison loop leaks timing.
- **Lifetime.** The raw token exists only in the dispatch call's memory and the email body. It is never passed to `Logger`, the audit trail or any response.
- **Link shape.** `${PUBLIC_APP_BASE_URL}/consent/#t=<token>` (P-11). The trailing slash matches the static export's `trailingSlash: true` and the CloudFront rewrite (P-21).

### 5.4 Public endpoints (FR-9…FR-11, NFR-2…NFR-5)

`ConsentPublicController` has no guards besides `ConsentThrottleGuard` (20 requests per 60 s per IP, the registrations figure), and both routes are `POST`.

**Throttler registration.** `ConsentRequestsModule` does **not** call `ThrottlerModule.forRoot`. It relies on `RegistrationsModule`'s single global registration, the `ContactModule` pattern (P-31).

**Token in the DTOs.** The token is declared with `@Allow()` only, never a shape validator (B-5). The service maps a missing token, a non-string token, any length and any alphabet to the same miss. Format is never a `400`.

- **`view { token }`.** It resolves the request by hash and checks that it is *open*: status `SENT`, `expiresAt > now`, and the actor still exists. Then it returns:
  - `organization` (the snapshot `traderName`);
  - `record` = `toPublicDetail({ ...actor, consentStatus: GRANTED })`, the **same function** as the public detail read, applied **as if granted** (B-1, P-13). This matters because `publicGps` nulls coordinates for a non-`GRANTED` actor, and the preview must show exactly what accepting publishes. The actor is loaded with `CROPS_INCLUDE`, as `ActorsService.findOnePublic` loads it (RB-6). A test asserts that the preview equals `GET /actors/:id` after accept;
  - `edition` = `{ version, sections, acceptanceStatement }` for the request's `editionVersion`;
  - `expiresAt`.

  Any miss throws the single `buildConsentLinkNotFoundError()`, whose body is fixed.
- **`respond { token, decision, respondent?, accepted? }`.** DTO validation of the **non-token** fields runs first. A `400` can only name `decision`, `respondent.*` or `accepted`, never `token`, so it reveals nothing about the token. `ACCEPT` requires `respondent` (name, position, email, phone, with the intake-contract bounds) and `accepted === true`. `DECLINE` ignores both.

  **Routing read (outside the transaction).** Resolve the request's `actorId` by `tokenHash` with a plain read **before** the transaction opens. No row gives the uniform miss. This read is routing only; the CAS re-validates everything. `ConsentRequest.actorId` is written only at enqueue, so a stale answer can cause a miss but never a write to the wrong actor.

  Then a single `$transaction` runs. *(Amended 2026-10-06 twice: lock order, then lock-first, T-5 attempts 2–3.)*
  0. **Lock — the transaction's first statement.** `SELECT id, consentStatus, consentMethod, consentObtainedAt, consentReference FROM Actor WHERE id = ? FOR UPDATE`, parameterized. It must come first: under InnoDB REPEATABLE READ the snapshot is fixed at the first non-locking read, so any plain read before the lock would make later reads stale. It takes the same order as enqueue (D-25) and the admin update (D-26), actor first, so they cannot deadlock. No row means the actor was deleted: uniform miss, nothing written.
  1. **CAS.** `updateMany({ tokenHash, status: SENT, expiresAt > now }) → ACCEPTED|DECLINED` with the respondent fields, `respondedAt`, IP and UA. A count of 0 gives the uniform miss (NFR-5).
  2. **`before` from the locked row.** The audit's `from` values and the decline's `after` come from step 0's row. There is no separate plain re-read of the actor.
  3. **Actor update.**
     - `ACCEPT` sets `consentStatus=GRANTED, consentMethod=EMAIL_LINK, consentObtainedAt=respondedAt, consentReference=request.id`.
     - `DECLINE` sets `consentStatus=DENIED` only.
  4. **Audit.** It writes `logConsentResponded`, with `actingSub = 'consent-link'` and `actingEmail = null`. The diff covers the consent fields, and `requestId` goes in `changes` (DD-6). A Decline on an already-`DENIED` actor still writes the row, because the answer is itself the event; this is a deliberate exception to "an empty diff writes no row".

  The response is `200 { decision }` and nothing else.
- **IP address.** It is `req.ip`, as `lookupRegistration` already uses. serverless-http sets `req.ip` from `requestContext.http.sourceIp` (P-14, confirmed). It is stored nullable as defence in depth, so a missing IP degrades the evidence rather than failing the response.

### 5.5 Supersession hook (FR-12, D-20)

`ConsentSupersessionService.supersedePendingFor(tx, actorIds)` sets `SUPERSEDED, supersededAt` on every **pending** row for those actors (§5.1): `QUEUED`, `SENDING` or `FAILED`, or `SENT` with `expiresAt > now`.
- An already-expired `SENT` row keeps its derived *Expired* status as evidence (B-16).
- Answered rows (`ACCEPTED`, `DECLINED`) are never touched.

**Module wiring** (P-30, B-10). The service lives in a small `ConsentSupersessionModule` (Prisma only, exported). `ActorsModule` imports it one-way. `ConsentRequestsModule` re-provides `ActorAuditService` and `ActingAdminResolver`, the `RegistrationsModule` precedent, instead of importing `ActorsModule`. There is no provider cycle and no `forwardRef`.

It is called **inside the existing transactions** at these points (P-6):

| Path | Trigger |
|---|---|
| `ActorsAdminService.update` | `consentStatus` or `email` in the computed diff |
| `bulkSetConsent` | Always, for the ids applied |
| `remove` | Always, before `tx.actor.delete` |
| `bulkDelete` | Always |

Import is create-only and never touches an existing actor, so it has no hook. Registration approval creates a new actor, so it has none either.

### 5.6 Documents (FR-15, FR-16, NFR-8)

`DocumentStorage` is a port with two adapters: `S3DocumentStorage` (env `CONSENT_DOCUMENTS_BUCKET` set) and `UnconfiguredDocumentStorage` (env absent, the local stack, P-19).

| Route | Behaviour |
|---|---|
| `GET …/consent-documents/status` | Returns `{ enabled }`. |
| `POST upload-url` | Validates type and size (≤ 10 485 760 bytes). Creates a `PENDING` row and returns a presigned **POST** for key `incoming/<id>` with conditions `content-length-range 1..10485760`, `Content-Type` equal to the declared type, the exact key, and `expires 300 s`. Unconfigured → `503`. |
| `POST …/:docId/confirm` | Runs `HeadObject` and compares size and type with the declared values; a mismatch deletes the object and returns `422`. Then `CopyObject` to `stored/<actorId>/<id>`, `DeleteObject` on `incoming/`, sets `STORED`, and writes the `CONSENT_DOCUMENT_UPLOADED` audit row from the document's `traderId`/`traderName` snapshot (P-28). That works even if the actor was deleted after `upload-url`, and the evidence is kept. Idempotent: a second confirm on a `STORED` row returns it. |
| `GET download-url` | Presigned GET on `stored/…`, expires 300 s, with `ResponseContentDisposition: attachment; filename="<sanitized>"`. |

An unconfirmed object expires through **one** bucket lifecycle rule on `incoming/`: current versions after 1 day, noncurrent versions after 1 day, plus `AbortIncompleteMultipartUpload` after 1 day. S3 already removes expired delete markers automatically when a `Days` expiration is set, so no separate `ExpiredObjectDeleteMarker` rule is added. `ExpiredObjectDeleteMarker` cannot share a rule with `Days`, and a separate rule would be redundant (B-21 → RB-3, FB-7). A `PENDING` row is never listed (FR-15 scenario 3).

New dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/s3-request-presigner` (P-17).

### 5.7 `ADMIN_ASSERTABLE_CONSENT_METHODS` (DD-9)

`common/consent-methods.ts` exports `ADMIN_ASSERTABLE_CONSENT_METHODS`, the `ConsentMethod` values **minus `EMAIL_LINK`**, in schema order.

**Backend sites** (P-15):

| Site | Set used |
|---|---|
| `actor-create.dto.ts` (**create**) | Assertable set |
| `bulk-consent.dto.ts` | Assertable set |
| Import parser (`actor-import.service.ts`) | Assertable set |
| `template-columns.ts` allowed values | Assertable set |
| `admin-actor-list-query.dto.ts` | Full set (admins must **filter** by `EMAIL_LINK`) |
| **Update** | Full set, with a service-side rule (below) |

**Template stays byte-identical.** The template's set of values is unchanged, so the committed workbook still matches and no regeneration is needed. `generate-template.spec.ts` is the falsifier.

**Update rule** (C-3, P-16 contradicted). `ActorForm.buildDto` **always** re-sends `consentMethod`, edit included, and `AdminActorUpdateDto` is `PartialType(AdminActorCreateDto)`. Narrowing the update DTO would therefore make **every** save of an `EMAIL_LINK` actor a `400`. Instead:
- The update DTO validates against the **full** set; `AdminActorUpdateDto` overrides the inherited `@IsIn`.
- `ActorsAdminService.update` refuses three cases with a `400` naming the offending field:
  1. a **change to** `EMAIL_LINK` (stored ≠ `EMAIL_LINK` and payload = `EMAIL_LINK`);
  2. **any transition into `GRANTED` whose effective method is `EMAIL_LINK`** (RB-2). Example: an actor that accepted by link, was later set to `DENIED` by an admin, and is now being re-granted by an admin. That re-grant is the admin's assertion, so it must carry an admin-assertable method, never a label that claims the actor's own act.
  3. **Evidence frozen while `GRANTED` by link** (FB-2, confirmed by the product owner 2026-10-05). When the stored status is `GRANTED` and the stored method is `EMAIL_LINK`, and the status stays `GRANTED`, any **value change** to `consentMethod`, `consentObtainedAt` or `consentReference` is refused. Those values are the actor's evidence (`respondedAt`, the request id). The only way to correct such a record is a status change: `DENIED` breaks the chain, and a later re-grant falls under rule 2.
  4. **A re-grant does not inherit link evidence** (D-24, confirmed 2026-10-05). On a transition into `GRANTED` where the stored method is `EMAIL_LINK`, the stored `consentObtainedAt` and `consentReference` are **not** treated as present. The payload must carry its own `consentObtainedAt` (else `400` naming it). `consentReference` is written from the payload, or `null` when omitted. **Bulk unlock** applies the same rule: a non-`GRANTED` `EMAIL_LINK` row takes the batch's method, the batch's date, and the batch's reference (or `null`). It is never filled field by field.
- Re-sending the stored `EMAIL_LINK` unchanged, **with the status unchanged**, passes. `isConsentProvenanceSatisfied` already treats an unchanged re-send as untouched.
- **`bulkSetConsent`.** When unlocking to `GRANTED`:
  - A **non-`GRANTED`** row whose stored method is `EMAIL_LINK` is treated as **missing a method**, so the batch's assertable method fills it. It is never "preserved" (RB-2; today's preserve branch would keep it).
  - A row **already `GRANTED` with `EMAIL_LINK`** is left untouched: no method, date or reference write (FB-1, rule 3), and it is reported as preserved.

The rule is server-side, so it works for any client. The form does its part too: whenever the status select **differs from the stored status** (FB-4), the read-only "Email link (actor)" field is swapped back to the assertable method select (empty), so a re-grant always asks for an admin method. While the actor stays `GRANTED` by link, the method, date and reference render **read-only** (rule 3).

**Frontend hand-coded method lists** (S-3, all in T-1/T-11's `Consumers`):

| Site | Change |
|---|---|
| `ActorsTable.tsx` `consentMethodLabel` / `consentMethodClasses` | Today a non-total `switch` with default "Not recorded". Becomes a total `Record<ConsentMethod, …>` with "Email link (actor)". `ActorsTable.test.tsx`'s literal 5-value array derives from the union, so a future value fails the build or the test. |
| `ActorForm.tsx` `CONSENT_METHOD_OPTIONS` | Stays assertable-only. While the stored value is `EMAIL_LINK` **and the status is unchanged**, the method select is **replaced** by a read-only "Email link (actor)" field, and `buildDto` re-sends the stored value. A status change swaps the assertable select back in (RB-2). Without the read-only field, a `<select>` with no matching option would submit a wrong value. |
| `actors/page.tsx` filter options | Gain `EMAIL_LINK`. |
| `AcknowledgeDialog.tsx` provenance options | Stay assertable-only. |

### 5.7a Stale-form protection (D-26, added 2026-10-06)

- `AdminActorUpdateDto` gains an optional `expectedUpdatedAt` (ISO instant). The frontend always sends it: the `updatedAt` of the record the form loaded.
- `ActorsAdminService.update` locks the actor row **first** inside its transaction (`SELECT … FOR UPDATE`, the D-25 pattern). It then reads `before`. When `expectedUpdatedAt` is present and differs from `before.updatedAt` (compared as instants), it throws `409` with `{ statusCode: 409, error: 'Conflict', message, details: [{ field: 'expectedUpdatedAt', message }] }`. Nothing is written.
- `respond` writes the actor through Prisma, which bumps `updatedAt` (`@updatedAt`). An answer arriving after the form loaded therefore always conflicts.
- **The field is optional on the server** so existing callers and suites keep working. Only the admin form sends it, and the frontend task makes it always present.
- The lock also closes the read-then-write window between `respond` and an admin save (T-1 advisory B3).

### 5.8 Evidence immutability gate (FR-13, B-7)

Two tests own FR-13's "written only by" clause.

1. **Write-site sweep.** A spec reads `backend/src/**/*.ts` (excluding specs) and collects every `consentRequest.update`, `updateMany`, `upsert` and `delete*` call site. It asserts that the set equals exactly these four methods:

   | Method | Writes |
   |---|---|
   | `ConsentRequestsService.dispatch`, including its private helpers (`claimAndSendOne`, `sweepStaleClaims`) | claim, claim-time supersede (step 2.3), result, and the stale-claim sweep (step 3, run at the start of each dispatch call) |
   | `ConsentRequestsService.retry` | `FAILED → QUEUED` |
   | `ConsentSupersessionService.supersedePendingFor` | every supersede outside dispatch; `enqueue` (single scope) calls it inside its own transaction rather than writing directly (RB-5) |
   | `ConsentPublicService.respond` | the answer |

   **Falsifier:** adding a `consentRequest.update` in any other file reddens it.
2. **Answered rows are terminal.** Every write's `where` names a status set, and no write's status set contains `ACCEPTED` or `DECLINED`. A unit test exercises each write method against an answered row and asserts `count = 0`.

## 6. API Design

All routes are under `/api/v1`. Admin routes use `@UseGuards(JwtAuthGuard, RolesGuard) @Roles('Admin')` at class level (P-7): `Staff` gets `403`, anonymous gets `401`.

| Method & path | Auth | Request → Response |
|---|---|---|
| `POST consent/view` | Public, throttled | `{ token }` → `200 { organization, record: PublicActorDetail, edition, expiresAt }` · `404` uniform · `429` |
| `POST consent/respond` | Public, throttled | `{ token, decision: 'ACCEPT'\|'DECLINE', respondent?, accepted? }` → `200 { decision }` · `400` field details · `404` uniform · `429` |
| `POST admin/consent-requests/preview` | Admin | `{ target, scope: 'single'\|'bulk' }` → `{ total, toSend, skipped: Record<reason, number> }` · `400` field details (validation; `scope`/target mismatch) |
| `POST admin/consent-requests` | Admin | same body → `201 { batchId, queued, skipped }` · `400` as preview |
| `POST admin/consent-requests/dispatch` | Admin | `{ batchId? }` → `{ sent, failed, remaining }` |
| `POST admin/consent-requests/retry` | Admin | `{ batchId? }` → `{ queued }` |
| `GET admin/consent-requests/queue` | Admin | → `{ queued, failed }` |
| `GET admin/consent-editions/:version` | Admin | → the edition text (for the panel's "read exact text") |
| `GET admin/actors/:id/consent-evidence` | Admin | → `{ requests: ConsentRequestEvidence[], documents: ConsentDocumentEvidence[] }`, newest first, derived `EXPIRED`; no `tokenHash`. Works for a deleted actor. |
| `GET admin/consent-documents/status` | Admin | → `{ enabled }` |
| `POST admin/actors/:id/consent-documents/upload-url` | Admin | `{ fileName, contentType, sizeBytes }` → `{ documentId, url, fields }` · `400` · `404` actor · `503` unconfigured |
| `POST admin/consent-documents/:docId/confirm` | Admin | → `ConsentDocumentEvidence` · `422` mismatch |
| `GET admin/consent-documents/:docId/download-url` | Admin | → `{ url, expiresAt }` |

**Route placement.** `GET admin/actors/:id/consent-evidence` lives in `AdminConsentRequestsController`. It has the same segment count as `AdminActorsController`'s `:id/history`, but a distinct literal tail, so the two cannot collide (B-11). A route test pins both.

**Body parsing.** The `HttpApi` exposes only GET/POST/PATCH/DELETE proxies (P-20), and every route above uses those verbs. Both public routes take JSON bodies through the shared `configureBodyParser`, so `lambda-handler.e2e.spec.ts` must cover one of them (backend/CLAUDE.md serverless-http lesson).

## 7. Mail, Edition Registry, Frontend

### 7.1 Email (FR-7)

`consent-request.template.ts` exports `CONSENT_REQUEST_SUBJECT = 'Your consent is requested — ACCELERATE Tanzania Registry'`. The exact wording is fixed at T-4, and it contains no name, address or id.

The body is built with `renderEmailHtml`:
- a heading;
- a paragraph naming the organization and `PUBLIC_APP_BASE_URL`;
- a `link` block "Review and respond";
- a `note` block stating the 30-day expiry and that the recipient can ignore the email if it is not theirs;
- the data-protection contact.

`MailMessage.reference` is left **undefined**: `dispatch` logs the reference, and a request id is not needed in logs. `ADR-015`'s subject inventory gains a ninth kind (FR-17).

### 7.2 Edition registry (FR-1)

- **File.** `admin-consent-editions.json` holds `{ editions: [{ version, issuedAt, sections[{ heading, body }], acceptanceStatement }] }`. **`acceptanceStatement` is per edition** (amended 2026-10-05, T-2 Reviewer advisory 1, product owner). A top-level shared statement, the `consent-policy.editions.json` shape, would let a later edit change an older edition's text and hash, breaking FR-1.
- **Loader.** The loader freezes it.
- **Hash.** It computes `editionHash = sha256(JSON.stringify({ version, sections, acceptanceStatement }))`.
- **Tests.**
  - The full-version-sequence pin and a body digest (the `consent-policy.spec.ts` pattern) guard append-only. The digest covers each edition's `acceptanceStatement`.
  - **The literal v1.0 `editionHash` is pinned** in a test, so any change to the canonical serialization reddens before a stored hash can be invalidated.
  - The verbatim test reconstructs plain text from the edition, reverses the three substitutions, normalizes only whitespace and bullet glyphs, and compares to `__fixtures__/legal-admin-consent-v1.0.txt` (the `textutil` extract of the `.docx`, sha256 `80fe083f…a9ba1c7`, P-18).
  - A **negative-word assertion** checks that no edition text contains `/\bsign(ing|ature|ed)?\b/i` (B-14). The extract has three such occurrences, all replaced by the substitutions.

  **Falsifier:** change one word in the JSON and the test goes red; change a substitution and it goes red too.

### 7.3 Frontend / UX component architecture

**Public page** `app/(consent)/consent/page.tsx`:
- **Layout.** It renders under a **new route group layout** with `Header` + `<main>` + `Footer` only. Header and Footer do not depend on `ConsentProvider` (P-22). There is no `ConsentProvider`, no `ConsentBanner` and no `GoogleAnalytics`, which is NFR-11's structural guarantee.
- **Page behaviour.** On mount it reads `window.location.hash`, extracts `t`, and immediately runs `history.replaceState(null, '', '/consent/')`. It keeps the token in React state only, then calls `view`.
- **States.**

  | State | Shown when | Shows |
  |---|---|---|
  | `loading` | `view` is in flight | Skeleton |
  | `ready` | `view` returned an open link | Preview + text + form |
  | `no-token` | Refreshed after the fragment was stripped | Copy: "Open the link from your email again" |
  | `dead-end` | `404` | Fixed copy + data-protection contact (FR-11) |
  | `throttled` | `429` | Retry later |
  | `submitting` | A response is being sent | Disabled controls |
  | `done-accepted` / `done-declined` | The response was recorded | Confirmation; the accepted variant names the public profile path |
  | `error` | Network failure | Retry |

- **Components:**
  - `ConsentRecordPreview` is a `<dl>` over the public-detail keys, labelled "Information that will be published", with em-dash for empty fields (design.md §1 principle 3).
  - `ConsentTextScrollGate` is **extracted** from `ConsentPolicyDisclosure`: it takes sections plus `checked/onChange` and owns the scroll gate. `ConsentPolicyDisclosure` keeps fetching and delegates rendering, so its tests stay green unchanged (P-23).
  - `RespondentFields` holds the four required inputs plus the read-only organization.
  - `ConsentResponseForm` holds the Accept and Decline actions. Decline uses a confirm step.
  - `ConsentDeadEnd` renders the dead-end page.
- **Metadata.** The page is `'use client'`. `app/(consent)/layout.tsx` is a server component exporting `metadata` with `robots: { index: false }`, so the token page is never indexed.

**Admin** (tokens only, existing primitives):
- **Bulk send.** `BulkActionBar` gains `onSendConsent`. The actors page gains a **"Select all N matching"** strip when the whole page is selected. It is reachable in the card view too, through a "Select page" control below `lg`, since the header checkbox exists only in the table (P-24).

  `SendConsentDialog` runs preview → confirm → progress (`aria-live="polite"`) → result. The result offers `Retry failed`. It is built on `DialogFooter` and `useDialogFocusTrap`, like `ConfirmDialog`.

  The target is `{ kind: 'ids' }` or `{ kind: 'filter', filter: current URL filters }`.
- **Queue banner.** `ConsentQueueBanner` sits on Admin → Actors. It reads `queue` and offers Resume / Retry when either count is above 0.
- **Post-create prompt.** `SendConsentPrompt` on `new/page.tsx` replaces the bare navigate. It shows the duplicate warnings (when any) and the send question in one dialog, defaults to **Send**, and then navigates. **Gate (B-13):** the send question renders only when the create result's `consentStatus !== 'GRANTED'`. A `GRANTED` create shows the warnings alone, or navigates as today. If a document was attached, the upload runs first. `ActorForm` itself is unchanged in its success path (P-25).
- **Edit page.** It gains **Send consent request / Resend**, disabled with the FR-2 reason, and `ConsentEvidencePanel` with status badges from `lib/content/consent-requests.ts` (the total-`Record` pattern of `registration-status.ts`).
  - Times show in UTC with the qualifier, the `ConsentRecordCard` convention.
  - "Read exact text" opens the edition through `admin/consent-editions/:version`.
  - Attaching a document from the panel uses `ConsentDocumentField`.
- **`ConsentDocumentField`.** It is a file input with type and size checks. It is the same component on the create form (deferred upload after create) and in the evidence panel (immediate). It is disabled with an explanation when `status.enabled` is false.
- **Import result.** The result gains the CTA. It is the eligible count from `preview({ kind:'ids', ids: createdActorIds }, 'bulk')`, then the same dialog.
- **History panel.** `ActorHistoryPanel` gains the three actions and renders `consent-link` as "Consent link (actor)".

Design tokens: §7 of `docs/ux-ui/design.md` only. Status badges use the `bg-surface-alt text-warning` / `bg-highlight-tint` / `bg-danger-soft` conventions, never `/NN` modifiers.

### 7.4 Infrastructure (NFR-8)

`infra/20-backend/template.yaml` adds:

**`ConsentDocumentsBucket`**
- `BucketName !Sub "${AWS::StackName}-consent-docs-${AWS::AccountId}"`. This is the pseudo-parameter pattern, so no account literal appears (P-20).
- Public access: all four Block Public Access settings, and `BucketOwnerEnforced`.
- Encryption: `AES256`.
- Versioning: `Enabled`.
- One lifecycle rule on prefix `incoming/`: expire after 1 d, noncurrent versions after 1 d, and abort incomplete multipart uploads after 1 d (§5.6).
- `CorsConfiguration`:
  - `AllowedMethods [POST]`;
  - `AllowedOrigins` from `AllowedOrigin`, plus `LegacyAllowedOrigin` when set;
  - `AllowedHeaders ['*']`;
  - `MaxAge 600`.
- `DeletionPolicy: Retain` + `UpdateReplacePolicy: Retain`. It holds compliance evidence, so a stack teardown must never empty it silently.
- Tags: the same two as `FrontendBucket`.

**`ConsentDocumentsBucketPolicy`** denies `aws:SecureTransport=false`.

**`ApiFunction`**
- `Environment.Variables` gains `CONSENT_DOCUMENTS_BUCKET: !Ref ConsentDocumentsBucket`.
- `Policies` gains one statement:
  - `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on `${Bucket.Arn}/incoming/*`;
  - `s3:PutObject` and `s3:GetObject` on `${Bucket.Arn}/stored/*`.

  `CopyObject` needs `GetObject` on the source and `PutObject` on the destination. There is no `*`, no `ListBucket` and no `DeleteObject` on `stored/`.

**Deploy path.** `20-backend` ships on every merge to `main` (P-21), so the bucket appears on the first merge. `teardown.sh` is left unchanged: `Retain` means the bucket outlives the stack. The infrastructure doc records the bucket and its manual-cleanup note (KZ-auth-2: enumerate the paths).

Every command uses `--profile IBD-DEV`.

## 8. Shared Contracts

- **`lib/api/consent-public.ts`:** `viewConsentRequest(token)` and `respondToConsentRequest(token, body)`. Both call `apiFetch` with no auth token (P-26).
- **`lib/api/consent-requests-admin.ts`:** types mirroring backend DTOs exactly: `ConsentSkipReason = 'no_email'|'granted'|'pending_request'|'declined'`, `ConsentRequestStatus` (including `'SENDING'` and the derived `'EXPIRED'`), `ConsentRequestEvidence`, `ConsentDocumentEvidence`.
- **`lib/api/actors-admin.ts`:**
  - `ConsentMethod` gains `'EMAIL_LINK'`;
  - `AuditEntry['action']` gains the three actions;
  - `AdminActorCreateResult` and `ImportRowResult` are unchanged.

## 9. Design Decisions

| # | Decision | Alternatives rejected | Requirement |
|---|---|---|---|
| **DD-1** | **Persist, then client-driven time-boxed dispatch** (proposal A1). The budget is time (7.5 s; worst case 11.5 s, §5.2), not a fixed N, so the design does not depend on the unmeasured broker throughput. | A2 async worker (new Lambda + queue + deploy; escalate only if T-14 measures throughput too low to finish 1,000 in ~15 min); A3 synchronous ≤10 (no durable queue). | FR-4, FR-6, NFR-6 |
| **DD-2** | **Claim by per-row compare-and-set; never auto-resend a stale claim.** An unknown outcome becomes `FAILED/stale_claim`, and the admin chooses Retry. | Lease expiry back to `QUEUED` (can double-send a delivered email). | FR-6 |
| **DD-3** | **Token minted at dispatch, not at enqueue.** A queued row has no live token, and a retry mints a new one. | Mint at enqueue (a token would exist for mail never sent). | NFR-1 |
| **DD-4** | **Public routes are `POST` with the token in the body**, and every miss shares one fixed `404` body. | `GET /consent/:token` (puts the token in API Gateway and CloudWatch request lines). | NFR-1, NFR-2 |
| **DD-5** | **A separate `(consent)` route group with no analytics**, plus `noindex`. This is ADR-011's containment-by-placement, extended. Fragment stripping stays as defence in depth for the address bar and history. | Stay in `(public)` and rely on stripping before GA mounts (depends on the `UNVERIFIED` GA4 fragment behaviour and on timing). | NFR-11 |
| **DD-6** | **Sentinel `actingSub = 'consent-link'`** for actor-originated audit rows, with `actingEmail = null` and the request id in `changes`. It is the first non-admin identity, declared in the TRD. | Nullable `actingSub` (a migration that widens every audit consumer's contract). | FR-13 |
| **DD-7** | **New module, with its own derived PII gate.** `pii-boundary.spec.ts` gains `getRegisteredRoutes(ConsentRequestsModule, 'api/v1')` with its own fixture map and totality check over **public and admin** routes. | Registering the controllers in `RegistrationsModule` to inherit its gate (couples two domains to keep one test file simple). | NFR-3 |
| **DD-8** | **Presigned POST plus confirm-and-promote** (`incoming/` → `stored/`). The POST policy enforces size; presigned PUT cannot enforce a maximum. The lifecycle rule cleans orphans. | Presigned PUT (no size bound); base64 through the API (6 MB Lambda limit). | FR-15, NFR-8 |
| **DD-9** | **No admin can assert `EMAIL_LINK`.** Create, bulk, import and the template use `ADMIN_ASSERTABLE_CONSENT_METHODS`. Update accepts the full set, so the form's unchanged re-send passes. It refuses a change to `EMAIL_LINK`, any transition into `GRANTED` with it, and any edit of `EMAIL_LINK` evidence while `GRANTED` (§5.7 rules 1–3; C-3, RB-2, FB-2). The list filter and displays keep the full set. | Accept it everywhere (an admin could forge evidenced consent). | FR-10, D-22 |
| **DD-10** | **Supersession inside existing admin transactions** (§5.5). | A respond-time check comparing the actor's current state (racier and harder to explain to an auditor). | FR-12 |
| **DD-11** | **Respond reuses `toPublicDetail`** for the preview, so the page can never show more than the public profile would after accept. | A bespoke projection (a second allowlist to keep in sync). | FR-9, NFR-3 |
| **DD-12** | **`Retain` on the documents bucket.** | `Delete` (a teardown would destroy compliance evidence). | NFR-9 |
| **DD-13** | **ADR-NNN** (candidate **ADR-018**, allocated at apply time after `git log --all -- docs/trd/trd.md`). It records three things: the actor-originated route to `GRANTED` that bypasses the admin acknowledgement; the token-bearer disclosure of a non-`GRANTED` actor's public-detail set; and the FK-less retained evidence. It **amends** the "the only public path that does" sentence in TRD §4's `GET /api/v1/actors/:id` row, and the matching scope of ADR-013's consequence text (A-8). It extends rather than supersedes ADR-004 and ADR-012. | — | FR-17 |

**Reversion challenge (Step 2.3).** DD-9 *narrows* an existing input set (admin DTOs accept every `ConsentMethod` today). Asked "what does removing `EMAIL_LINK` from admin inputs break?":
- Nothing that exists today, since the value is new.
- The one breakage is an **edit of an actor already at `EMAIL_LINK`** if the form re-sends `consentMethod`. That is addressed in §5.7 and owned by P-16 / T-1.

No other DD removes shipped behaviour. The supersession hook adds writes, and the `ConsentPolicyDisclosure` extraction is behaviour-preserving, guarded by its existing tests.

## 10. Risks, Rollout, Observability, Budget

| # | Risk | Mitigation |
|---|---|---|
| R-1 | An unauthenticated write moves an actor to `GRANTED`. | 256-bit token, hash at rest, single use, 30 d, CAS, uniform miss, throttle, derived PII gate, QA scenario (FR-17); effort `max` on T-5. |
| R-2 | Contact data is shown to a forwarded-link holder. `email-layout.ts`'s `link()` block also prints the full URL as visible text, fragment included (A-9). | Accepted (proposal R-2). The disclosure is limited to the `toPublicDetail` set. The visible URL opens no new channel, because the button carries the same URL. It is kept for clients that strip links. |
| R-4 | Broker throughput is unknown. | DD-1 time budget. T-14 measures; below ~1 send/s, escalate to A2 (`ConsentRequest` rows are already the durable queue). |
| R-6 | Unscanned PII uploads. | Private bucket, attachment-only, 5-min links; malware scanning is an accepted risk. |
| R-10 | A timeout that still delivered becomes `FAILED`. A retry sends a second email, and the first link dies. | Accepted. The dead-end copy tells the actor to use the latest email (ADR-015's own timeout-but-delivered observation). |
| R-11 | Per-container throttle under 5 reserved concurrency (not distributed). | Same accepted posture as registrations (ADR-010). Token entropy, not the throttle, is the security control. |

- **Rollout.** One branch, three PRs (§tasks). The backend ships dark until the frontend ships. The bucket ships with the first backend merge.
- **Rollback.** Revert the frontend (no entry points). The tables and the bucket are additive and retained.
- **Observability.**
  - Dispatch logs `{ batchId, sent, failed, remaining, elapsedMs }`.
  - Respond logs `{ decision }` only.
  - No token, address or respondent field appears in any log (NFR-1 spy).

**Budget (Step 2.4).** The proposal's depth is Full; the design matches it.

| Tasks | LOC | Review rounds |
|---|---|---|
| 14 | ~11,300 (prod ~4,500 · tests ~6,800); the sum of the `tasks.md` per-task estimates | ~20 (14 first passes + ~6 reworks, by chunk 1's rate) |

`/akili-execute` escalates to the user if actuals exceed any figure by more than 25 %.

*Re-baselined at the T-3 continue gate (2026-10-05, product owner):* review rounds run at about 2 per critical task, because two lens Reviewers are spawned in parallel on T-1, T-3, T-4, T-5 and T-7. The accepted ceiling is about **30** verdicts. LOC was at +33 % for T-1…T-3 (3,513 against 2,650); the total budget of ~11,300 still stands.

## 11. Premise Ledger

**Count:** 32 premises: 30 verified (2 of them refuted at the source and the design corrected: P-13, P-16), 2 `UNVERIFIED`. One is High Impact (P-9, live broker throughput); one is Low and moot (P-27). P-18's citation is verified; its Legal-approval half stays `user-stated`.

*Revised after judgment-day round 1 (`judgment.md`):*
- P-13 and P-16 were refuted at the source and the design was corrected.
- P-14 was settled as confirmed.
- P-28…P-32 were added.

**Blast-radius triggers fired:**
- `live-path`: the design names user actions (bulk send, accept);
- `shared-state`: admin transactions, `ConsentPolicyDisclosure`, the audit enum;
- `consumer`: `ConsentMethod`, including the frontend hand-coded lists in §5.7; `ActorAuditAction`; the `AuditEntry` union; the PII gate route set.

All rows below were verified at `342390a` unless they are marked `UNVERIFIED`.

| # | Claim | Class | Citation (as run) | Verified at | If false | Settled by |
|---|---|---|---|---|---|---|
| P-1 | Every admin route to `GRANTED` requires `acknowledged` plus method ≠ `NOT_RECORDED` plus date; consent provenance is checked by `isConsentProvenanceSatisfied`. | location | `actors-admin.service.ts` `create` (acknowledged check before `isConsentProvenanceSatisfied(null, …)`), `update` (transition check + `isConsentProvenanceSatisfied(before, …)`), `bulkSetConsent`; `grep -rn "isConsentProvenanceSatisfied" backend/src \| grep -v spec` → 5 calls | 342390a | DD-10/§5.4 bypass framing changes (Low) | — |
| P-2 | `ConsentMethod` = `NOT_RECORDED, PORTAL_CHECKBOX, SIGNED_FORM, EMAIL, VERBAL_FIELD`; no `EMAIL_LINK` anywhere. | existence | `schema.prisma` `enum ConsentMethod`; `grep -rniE "EMAIL_LINK" backend/src backend/prisma` → 0 | 342390a | D-22/DD-9 rework (Low) | — |
| P-3 | `ActorAuditLog.actingSub` is NOT NULL, and no non-admin sub has ever been written. | existence | `schema.prisma` `model ActorAuditLog` `actingSub String`; `grep -rniE "actingSub:\s*['\"]" backend/src --exclude=*.spec.ts` → 0 | 342390a | DD-6 changes (Low) | — |
| P-4 | Audit rows have no FK to `Actor` and survive deletion; history reads by `actorId` with no existence check. | location | `ActorAuditLog.actorId` comment "deliberately NO relation/FK"; `ActorsAdminService.history` docstring | 342390a | §4 retention approach (High) | — |
| P-5 | Audit writes happen only in `actor-audit.service.ts`, each taking the caller's `tx`. | location | `grep -rlE "actorAuditLog\.(create\|createMany)" backend/src --exclude=*.spec.ts` → 1 file | 342390a | §5.4 transaction shape (Low) | — |
| P-6 | **shared-state:** `update`, `bulkSetConsent`, `remove` and `bulkDelete` each run one `prisma.$transaction` in which a supersede call can sit. `create` and import never touch an existing actor. | shared-state | `grep -n '\$transaction' backend/src/actors/actors-admin.service.ts` → 240 (create), 332 (update), 457 (remove), 581 (bulkSetConsent), 716 (bulkDelete); import is create-only (`TRD §4` import row) | 342390a | DD-10 needs a different hook (High) | — |
| P-7 | No global guard; admin controllers use class-level `JwtAuthGuard, RolesGuard` + `@Roles('Admin')`; a controller with no guard is public. Global prefix `api/v1` is set in both bootstraps. | location | `auth/auth.module.ts` comment "Deliberately registers NO APP_GUARD"; `no-global-guard.spec.ts`; `admin-actors.controller.ts` class decorators; `main.ts`/`lambda.ts` `setGlobalPrefix('api/v1')` | 342390a | §6 auth wiring (Low) | — |
| P-8 | The self-registration edition registry is JSON `{ editions[{version,issuedAt,sections}], acceptanceStatement }`, its current edition is the last one, and append-only is guarded by tests (sequence pin + body digest), not code. | other | `consent-policy.ts` interfaces + `deriveCurrentEdition`; `consent-policy.spec.ts` "pins the FULL version sequence", `APPROVED_BODY_DIGEST` | 342390a | §7.2 pattern (Low) | — |
| P-9 | Broker throughput on the reused connection is high enough for a 1,000-actor campaign to finish in a tolerable session (≲ 15 min, i.e. ≳ 1.1 sends/s). | data-env | `UNVERIFIED — confirm at source before relying on it`. Known: one cached connection with serialized sends and a reply wait (`microservice-mail.transport.ts` module `cached`, mutex); `MAIL_SEND_TIMEOUT_MS = 3000` (`mail-timing.ts`); 2026-09-16 per-connection sends 1132–1227 ms (ADR-015) | — | DD-1 escalates to A2 (High) | T-14 (live measurement on DEV, first step) |
| P-10 | The API Lambda has `Timeout: 15`, `MemorySize: 512`, `ReservedConcurrentExecutions: 5`, and no VPC. | data-env | `infra/20-backend/template.yaml` `ApiFunction` | 342390a | §5.2 budget (High) | — |
| P-11 | Email links are built from `PUBLIC_APP_BASE_URL` via `getPublicAppBaseUrl()`, required and trailing-slash stripped; in deploys it falls back to `AllowedOrigin`. | location | `mail.config.ts` `getPublicAppBaseUrl`; template `PUBLIC_APP_BASE_URL` `!If HasExplicitPublicAppBaseUrl` | 342390a | §5.3 link builder (Low) | — |
| P-12 | `AdminActorListQueryDto` filters are `region, traderType, consentStatus, registrationSource, consentMethod`; no `q`/`crop`. | location | `dto/admin-actor-list-query.dto.ts`; `grep -ciE '\b(q\|search\|crop)\??:'` → 0 | 342390a | FR-4 filter target shape (Low) | — |
| P-13 | `toPublicDetail` returns `id, traderName, region, district, traderType, capacityTons, crops, gps, sex, otherCrops, contactPerson, position, phone, email, marketLocation` and no `NEVER_PUBLIC_FIELDS`. **But `gps` is consent-gated inside the projection:** `publicGps` returns `null` unless `isPublic` (`consentStatus === GRANTED`). *Refuted in part by judgment-day B-1; the design now projects as-if-granted (§5.4).* | location | `role-aware.serializer.ts` `toPublicDetail` (`gps: publicGps(actor)`); `pii-consent.policy.ts` `publicGps` → `if (!isPublic(actor)) return null`, `isPublic` | 342390a | DD-11 preview would omit GPS (High) — resolved in §5.4 | — |
| P-14 | Under the Lambda bootstrap (serverless-http), `req.ip` carries the client's source IP. | data-env | `backend/node_modules/serverless-http/lib/request.js` `ip: remoteAddress` (own property, shadows Express's getter); `lib/provider/aws/create-request.js` → `event.requestContext.http.sourceIp` (payload v2). Settled by judgment-day A-7/B-19; re-run by the Leader. | 342390a | FR-13 IP evidence and the throttle key (High) | — (T-5 keeps a `lambda-handler.e2e.spec.ts` pin) |
| P-15 | **consumer:** `Object.values(ConsentMethod)` feeds admin inputs at `actor-create.dto.ts` (`CONSENT_METHOD_VALUES`), `bulk-consent.dto.ts` (`CONSENT_METHOD_VALUES`), `template-columns.ts` (allowed values), and `actor-import.service.ts` (parses method by uppercase cast); the list filter at `admin-actor-list-query.dto.ts` `@IsIn(Object.values(ConsentMethod))`. Other backend consumers: `actors-admin.service.ts`, `consent-provenance.policy.ts`, `admin-registrations.service.ts`. Frontend: `actors/page.tsx`, `AcknowledgeDialog.tsx`, `ActorForm.tsx`, `ActorsTable.tsx`, `lib/api/actors-admin.ts`; tests pinning the value list: `ActorsTable.test.tsx`. | consumer | `grep -rlE "ConsentMethod\|VERBAL_FIELD" backend/src \| grep -v "\.spec\.ts"` → 8 files; `grep -rlE "ConsentMethod\|VERBAL_FIELD" frontend/app frontend/components frontend/lib \| grep -v test` → 5; `grep -rlE "VERBAL_FIELD" … \| grep -E "spec\|test"` → `ActorsTable.test.tsx` | 342390a | DD-9 sites (High: a missed site lets admins assert `EMAIL_LINK`) | — |
| P-16 | The admin edit form omits `consentMethod` from the PATCH body when unchanged. **Refuted:** `buildDto` always sends it, and `AdminActorUpdateDto` is `PartialType(AdminActorCreateDto)`. *Judgment-day C-3; the design now keeps the full set on update with a service-side rule (§5.7).* | other | `frontend/components/admin/ActorForm.tsx` `buildDto` → `consentMethod: values.consentMethod as ConsentMethod`; `backend/src/actors/dto/admin-actor-update.dto.ts` `extends PartialType(AdminActorCreateDto)`; `consent-provenance.policy.ts` docblock ("ActorForm … always does") | 342390a | Every save of an `EMAIL_LINK` actor would `400` (High) — resolved in §5.7 | — |
| P-17 | The backend has no S3 SDK and no presign code; the only `@aws-sdk` package is Cognito. | existence | `grep -ciE "client-s3\|s3-request-presigner" backend/package.json` → 0; `grep -rniE 'client-s3\|S3Client\|presign\|getSignedUrl' backend/src` → 0 | 342390a | T-7 dependencies (Low) | — |
| P-18 | The Legal text is the `.docx` at `~/Downloads/ACCELERATE Tanzania Registry Consent for Publication of Information (Administrator-Managed Registration).docx`, sha256 `80fe083f90b01427e369f8a0e23f00841ff450f732e99bdb22cbf8ec5a9ba1c7`, and its text contains exactly two "By signing" sentences and one signature block. Legal's approval of click-to-consent (D-1) is user-stated. | data-env | `shasum -a 256 <file>`; `textutil -convert txt -stdout <file>`. Approval: `user-stated` | 342390a | FR-1 text (High if the file is not Legal's final) | Approval: OQ-6 courtesy review (Daniela Gómez) |
| P-19 | No local S3 or localstack exists; the local env contract lists no S3 variable. | existence | `grep -rn -i "s3\|localstack\|minio" backend/.env.example frontend/.env.example` → 0; `grep -rli localstack . --exclude-dir=node_modules` → only this spec's own `design.md` and `judgment.md` (B-20); `docs/infrastructure.md` §6 | 342390a | §5.6 unconfigured adapter (Low) | — |
| P-20 | The only bucket is `FrontendBucket` (30-frontend), named with `${AWS::AccountId}`; `run-tests.sh` fails on any 12-digit literal under `infra/`; the HttpApi proxies GET/POST/PATCH/DELETE only; API CORS `AllowHeaders: Content-Type, Authorization`. | location | `grep -rn "S3::Bucket\|…" infra/*/template.yaml` → 1 bucket; `infra/scripts/tests/lib/account-id-scan.sh` `DIGIT_RUN_RE`; 20-backend `HttpApi` `CorsConfiguration`, events `ProxyGet/Post/Patch/Delete` | 342390a | §7.4 naming and verbs (Low) | — |
| P-21 | `20-backend` deploys on every merge to `main` (`DEPLOY_INFRA` gates only 10/30); the frontend is a static export with `trailingSlash: true`, and the CloudFront rewrite maps extensionless paths to `<path>/index.html`. | data-env | `docs/infrastructure.md` §3 (Jenkins); `frontend/next.config.mjs`; 30-frontend `RewriteFunction` | 342390a | Rollout order; the link must end `/consent/` (Low) | — |
| P-22 | **shared-state:** `Header` and `Footer` do not depend on `ConsentProvider`; only `PublicShellFrame` reads `useConsentContext`. | shared-state | `grep -n "useConsent\|ConsentProvider" frontend/components/shell/{PublicShellFrame,Header,Footer}.tsx` → only `PublicShellFrame.tsx` | 342390a | DD-5 needs a provider stub (Low) | — |
| P-23 | **shared-state:** `ConsentPolicyDisclosure`'s only consumer is `RegistrationForm`; its scroll gate predicate is `consent-scroll-gate.ts` `hasReachedScrollEnd`. Tests pinning it: `ConsentPolicyDisclosure.test.tsx`, `RegistrationForm.test.tsx`, `consent-scroll-gate.test.ts`, `register/page.test.tsx`, `register-a11y.test.tsx`, `submitted-a11y.test.tsx`; a comment mention in `ContactForm.tsx`. | shared-state | `grep -rl "ConsentPolicyDisclosure" frontend --exclude-dir=node_modules --exclude-dir=.next` → 12 files (the 11 named plus `lib/api/registrations.ts`); `RegistrationForm.tsx` is the only component that renders it (scout) | 342390a | §7.3 extraction scope (Low) | — |
| P-24 | **live-path:** Bulk actions on `/admin/actors`: `page.tsx` `selectedIds` (page-scoped, cleared on page/filter change) → `BulkActionBar` (`onUnlock/onLock/onDelete`) → `openDialog(kind)` → dialog → `lib/api/actors-admin` call. Select-all exists only in the `hidden lg:block` table header. | live-path | `actors/page.tsx` `selectedIds`, `handleToggleAll`, `DialogKind`; `BulkActionBar.tsx` props; `ActorsTable.tsx` "Select all actors on this page" | 342390a | §7.3 admin wiring (Low) | — |
| P-25 | **live-path:** Create: `new/page.tsx` → `ActorForm mode="create"` → `createActor` → `onSuccess(AdminActorCreateResult)` → `handleSuccess` (warnings dialog or `router.push('/admin/actors')`); the form never resets `loading` after a successful create. Accept: email link → `/consent/` static page → `POST consent/respond` (new). | live-path | `new/page.tsx` `handleSuccess`; `ActorForm.tsx` props `onSuccess`, create branch | 342390a | Prompt placement (Low) | — |
| P-26 | `apiFetch` adds the bearer only when a token is passed; public modules call it with none. | location | `frontend/lib/api/client.ts` `apiFetch`; `lib/api/registrations.ts`, `contact.ts` | 342390a | §8 (Low) | — |
| P-27 | GA4's default `page_location` includes the URL fragment. | data-env | `UNVERIFIED — confirm at source before relying on it` | — | None. DD-5 makes it irrelevant (Low) | DD-5 (made moot; no check needed) |
| P-28 | `ActorAuditLog.traderId` is NOT NULL (and not unique), so every consent audit row needs a `traderId` even after actor deletion. | data-env | `schema.prisma` `model ActorAuditLog` `traderId String` | 342390a | §4.1/§4.2 snapshot `traderId` (High) | — |
| P-29 | Prisma `updateMany` returns `{ count }`, usable as a compare-and-set, and `createMany` runs inside `$transaction` on this MySQL setup. Both have production precedent. | other | `admin-registrations.service.ts` approve/reject `updateMany({ where: { id, status: PENDING_REVIEW } })` (compare-and-set docblock); `actor-audit.service.ts` `logBulkConsent` `createMany` inside the caller's `tx` | 342390a | §5.2/§5.4 CAS mechanism (High) | — |
| P-30 | **shared-state:** `ActorsModule` exports nothing, and `adminList`'s filter is an inline `where` literal, not a reusable function. `RegistrationsModule` re-provides `ActorAuditService`/`ActingAdminResolver` instead of importing `ActorsModule`. | shared-state | `backend/src/actors/actors.module.ts` (no `exports`: `grep -n exports` → 0); `actors-admin.service.ts` `adminList` `const where: Prisma.ActorWhereInput = {`; `registrations.module.ts` providers | 342390a | §5.1 extraction and §5.5 module wiring (Low) | — |
| P-31 | `ThrottlerModule` is registered once, globally, by `RegistrationsModule`; other modules (`ContactModule`) rely on it and must not call `forRoot` again. | location | `registrations.module.ts` `ThrottlerModule.forRoot([` ; `contact.module.ts` docblock "no second `ThrottlerModule.forRoot()` call"; `app.module.ts` docblock | 342390a | §5.4 guard wiring (Low) | — |
| P-32 | The CloudFront distribution sets **no** Content-Security-Policy (deliberately deferred), so the browser's direct POST to the S3 bucket host is not blocked. A future CSP must allow it in `connect-src` / `form-action`. | data-env | `infra/30-frontend/template.yaml` `SecurityHeadersPolicy` comment (CSP deliberately absent); `grep -n "ContentSecurityPolicy" infra/*/template.yaml` → 0 | 342390a | FR-15 upload blocked in the browser (High if a CSP lands first) | — (recorded for the future CSP change in `docs/infrastructure.md`) |

**consumer rows → tasks:**
- P-15: T-1's `Consumers` field.
- `ActorAuditAction` (P-3/P-5 + the frontend union): T-6 and T-11.
- The PII gate route set (DD-7): T-5.
