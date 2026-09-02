# Design — Registration Review Queue & Approve-to-Publish

## Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/admin/registration-review-queue/` |
| Status | **Draft — awaiting Phase 2 approval** |
| Author / Date | AKILI (`/akili-specify`, T1) · 2026-09-01 |
| Traces requirements | FR-9, FR-10, FR-11, FR-12, FR-13, FR-14 (adjudication slice), FR-16 · NFR-1…NFR-11 |
| Depth | **Full** — re-checked against this design at §11 |
| Branch | `registration-review` (carries `enhancement/usage-analytics`, 11/11 archived, not yet on `main`) |
| Skills loaded | `software-architect` (Decision Spine, ADR discipline, minimum NFR sweep) |
| Skills **not** loaded, and why | `ui-ux-pro-max` / `frontend-design`. The visual system here is constitutionally fixed, not open: tokens by `docs/ux-ui/design.md` §7, table/card split and sticky-column rules by `frontend/CLAUDE.md`, and `AcknowledgeDialog` mandated for the one consequential dialog. Every UI decision below is a **conformance** decision against a measured in-repo exemplar, not a craft decision. Stated rather than silently skipped. |

---

## 1. Executive Summary

Five Admin endpoints and two Admin screens, added to the **existing** `RegistrationsModule` rather than a new one, so that 3a's module-scoped PII release gate keeps seeing them. The one consequential write is `POST /admin/registrations/:id/approve`: a single `$transaction` that compare-and-sets the status, projects an explicit publishable subset onto a new `Actor`, links the crops, writes an audit row, and records the reviewer — with notifications dispatched only after commit.

**Three decisions carry most of the risk**, and each is argued in §9:

| | Decision | Why it is the risky one |
|---|---|---|
| **DD-15** | The admin controller lives in `RegistrationsModule` | The alternative *makes the release gate pass* by removing its coverage |
| **DD-16** | `FIXTURE_MAP` gains an access **discriminant**, never an exemption flag | An exemption flag would let any future route opt out of the PII gate by annotation |
| **DD-18** | The payload→`Actor` projection is an explicit literal pick | `contactPerson` and `position` are adjacent fields of one DTO; a one-line "helpful" fallback publishes a natural person's name |

Nothing here changes an existing table's structure except widening one enum's accepted values.

---

## 2. Architecture Overview

### 2.1 Tier and style — unchanged, and that is the finding

`docs/trd/trd.md` ADR-001 fixes the system as a **LITE-tier modular monolith on a single Lambda**. This spec introduces no escalation trigger: no independent scaling need, no second team, no divergent availability target, no regulatory isolation. It adds one controller and one service to an existing module. **The tier decision is inherited, not re-opened.**

### 2.2 Minimum NFR sweep

The `software-architect` contract requires every attribute to be evaluated explicitly; marking one *not significant here* is valid output, silence is not.

| Attribute | Significant? | Where it lands |
|---|---|---|
| **Security** | **Yes — dominant.** This is the system's only path that turns private data public | NFR-1 (release gate, extended), NFR-2, §6; `docs/trd/trd.md` QA-3 and QA-12 both gain routes |
| **Performance** | **Yes, bounded.** The queue is indexed; duplicate detection is a scan | NFR-9, DD-20's single-fetch design, DC-35's revisit trigger |
| **Scalability** | **Yes, with a stated trigger.** Detection cost grows with `Actor` count, not registration count | DC-35: revisit indexing `Actor.phone`/`email` well beyond the PRD's 1,000+ target |
| **Availability** | **Not architecturally significant here.** An Admin-only path inherits QA-4's business-hours best-effort posture unchanged; no new availability requirement, no new failure domain | Recorded, no new scenario |
| **Modifiability** | **Yes — and it is a delivered defect, not a hypothesis.** FR-16 exists because widening the audit enum once already failed to propagate to the frontend | NFR-11, DD-21 |
| **Observability** | **Yes, with a wiring trap** | NFR-8, DD-19 |
| **Cost** | **Not significant.** No new AWS resource, no new always-on component. SES volume is one message per adjudication — dozens per month at the anticipated cohort size | Recorded, no ADR |

### 2.3 Where the work sits

```
Browser (static export)                     Lambda (NestJS, one handler)
┌────────────────────────────┐             ┌──────────────────────────────────────┐
│ (admin)/admin/registrations│  Bearer JWT │ RegistrationsModule                  │
│   page.tsx        (queue)  │────────────►│  ├─ RegistrationsController   [3a]   │
│   review/page.tsx (detail) │             │  │    4 public routes               │
│                            │             │  └─ AdminRegistrationsController     │
│ lib/api/registrations-     │             │       5 admin routes  ◄── this spec  │
│   admin.ts                 │             │     guards: JwtAuthGuard, RolesGuard │
└────────────────────────────┘             │             @Roles('Admin')          │
        RequireRole allow={['Admin']}      │                                      │
        (UX only — the API is the gate)    │  AdminRegistrationsService           │
                                           │  DuplicateDetectionService           │
                                           │  ActorAuditService  [+2 methods]     │
                                           └───────────────┬──────────────────────┘
                                                           │ one $transaction
                                                           ▼
                                              RDS MySQL — Registration, Actor,
                                              CropsOnActors, ActorAuditLog
```

**Legend.** Solid arrow is an HTTPS call carrying a Cognito access token. `[3a]` is delivered; everything unlabelled is this spec. The transaction boundary encloses all four tables — that enclosure *is* NFR-3.

---

## 3. Extended Directory Structure

Additions only. Nothing is moved or renamed.

```
backend/
  prisma/
    schema.prisma                                    (edit: 2 enum members)
    migrations/<ts>_add_registration_audit_actions/  (new)
  src/
    registrations/
      admin-registrations.controller.ts              (new) + .spec.ts
      admin-registrations.service.ts                 (new) + .spec.ts
      duplicate-detection.service.ts                 (new) + .spec.ts
      rejection-reasons.ts                           (new) + .spec.ts
      registrations.module.ts                        (edit: controller + forRoutes)
      dto/
        admin-registration-list-query.dto.ts         (new)
        registration-approve.dto.ts                  (new)
        registration-reject.dto.ts                   (new)
        registration-dismiss-duplicate.dto.ts        (new)
      serializers/
        admin-registration.serializer.ts             (new) + .spec.ts
        activity-trail.serializer.ts                 (new) + .spec.ts
      admin-registrations.e2e.spec.ts                (new)
    actors/
      actor-audit.service.ts                         (edit: +2 methods)
    test/
      pii-boundary.spec.ts                           (edit: access discriminant + 5 routes)

frontend/
  app/(admin)/admin/registrations/
    page.tsx                                         (new) + page.test.tsx
    review/page.tsx                                  (new) + page.test.tsx
  components/admin/
    RegistrationsTable.tsx                           (new) + .test.tsx
    RegistrationDetailPanel.tsx                      (new) + .test.tsx
    DuplicateWarningCard.tsx                         (new) + .test.tsx
    ConsentRecordCard.tsx                            (new) + .test.tsx
    ActivityTrail.tsx                                (new) + .test.tsx
    RejectDialog.tsx                                 (new) + .test.tsx
    AdminSidebar.tsx                                 (edit: one array entry)
    ActorHistoryPanel.tsx                            (edit: switch → total Record)
  lib/api/
    registrations-admin.ts                           (new) + .test.ts
    actors-admin.ts                                  (edit: AuditEntry union)
```

**No new frontend route directory pattern.** `review/page.tsx` is a static route reading `?id=` — never a `[id]` segment (NFR-7).

---

## 4. Data Model Changes

### 4.1 The only structural change

| Object | Change |
|---|---|
| `ActorAuditAction` | Two additive members: `REGISTRATION_APPROVE`, `REGISTRATION_REJECT`. The enum goes from six members to eight. |

Everything else this spec writes already exists. `Registration`'s adjudication columns were declared by 3a precisely so this chunk needs no model migration, and `@@index([status, createdAt])` already serves the queue's only access pattern.

### 4.2 What the generated SQL will contain

On MySQL, Prisma emits `ALTER TABLE \`ActorAuditLog\` MODIFY \`action\` ENUM(...)`. The in-repo precedent is `backend/prisma/migrations/20260710132750_add_import_audit_action/migration.sql`.

**The migration task's done-criteria must assert this, not forbid it.** A criterion reading "no `MODIFY`" would FAIL a correct migration, or worse, invite hand-editing it. Additive in semantics: widens accepted values, destroys no data, rewrites no rows — which is what `backend/CLAUDE.md`'s additive-only rule protects. No `DROP`, no data `UPDATE`, no column narrowed or retyped.

Rehearse against whatever MySQL 8 `backend/.env`'s `DATABASE_URL` points at (in practice the shared dev RDS, where `migrate dev` provisions a shadow database — acceptable there, never on PROD). **A reset or drift prompt is an abort-and-report condition, never answered.**

### 4.3 `duplicateDismissals` — the shape this spec writes into 3a's column

3a declared the column as `Json?` with the comment that it is *per-candidate, not row-level*. This spec fixes its contents: an array whose entries each carry the dismissed candidate's actor id, the dismissing reviewer's `sub` and email, and the dismissal instant. Ordering is not significant; membership is. Reading code treats an absent column and an empty array identically.

**Why an array and not a map keyed by actor id:** the activity trail (FR-10) needs *who and when* per dismissal to render a real event, and an array of records keeps that adjacent to the id rather than nesting a second object under it. Neither shape is indexed or queried — the column is read whole with its row.

### 4.4 PII declarations

**None added.** `duplicateDismissals` stores actor ids and reviewer identity, not applicant PII. Nothing joins `PII_ALLOWLIST` or `NEVER_PUBLIC_FIELDS` — both enumerate `Actor` columns for the `Actor` serializer and neither governs `Registration`, whose protection stays structural (`docs/trd/trd.md` §8, ADR-010).

---

## 5. API Design

All five under `@Controller('admin/registrations')` with class-level `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('Admin')` — copying `admin-actors.controller.ts` exactly. Error envelope is the project's `{ statusCode, message, error, details? }`.

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/v1/admin/registrations` | `?status=&q=&region=&traderType=&sort=&page=&pageSize=` | `{ data, page, pageSize, total }`; each row carries `duplicateCandidateCount` | `400` bad query · `401` · `403` |
| `GET /api/v1/admin/registrations/:id` | — | full payload · consent record · duplicate candidates · activity trail | `401` · `403` · `404` |
| `POST /api/v1/admin/registrations/:id/approve` | `{ acknowledgement }` | `{ registration, actor }` | `400` acknowledgement mismatch · `401` · `403` · `404` · **`409`** not pending, or `traderId` collision |
| `POST /api/v1/admin/registrations/:id/reject` | `{ reason, note? }` | `{ registration }` | `400` unknown/missing reason · `401` · `403` · `404` · **`409`** not pending |
| `POST /api/v1/admin/registrations/:id/dismiss-duplicate` | `{ candidateActorId }` | `{ registration }` | `400` · `401` · `403` · `404` unknown registration or candidate |

**Four contract decisions that are load-bearing:**

1. **`409` carries two distinct meanings on `approve`** — "already adjudicated" and "the derived `traderId` already exists". Both are recoverable conflicts the operator must be able to tell apart, so the **message differs and names the colliding key** in the second case. Neither may surface as a `500`: an unhandled `P2002` inside the transaction leaves that registration **permanently unapprovable with no operator path forward** (FR-12).
2. **The list endpoint returns a duplicate *count*, never the candidates.** Candidates are a detail-screen concern; returning them per row would multiply an already PII-heavy admin payload by the page size for no reviewer benefit.
3. **`404` is honest here, unlike on the public lookup.** 3a made its public `404` byte-identical across failure modes to kill a membership oracle. That reasoning does not transfer: the caller is an authenticated Admin who is *entitled* to know whether a registration exists, and a uniform `404` would make a mistyped id indistinguishable from a deleted one. **The uniformity requirement stops at the auth boundary** — FR-9's "must not leak whether the registration exists" binds the `403` path (a `Staff` caller), not the `404` path (an Admin caller).
4. **`dismiss-duplicate` takes a candidate id, not an index**, matching the per-candidate persistence FR-11 requires. An index would be invalidated by detection re-running with a different result set.

---

## 6. Backend Module Design

### 6.1 Module wiring — two edits, both easy to omit

`RegistrationsModule` gains `AdminRegistrationsController` in `controllers`, and `AdminRegistrationsService` + `DuplicateDetectionService` in `providers`. Two consequences follow that nothing warns about at compile time:

| Edit | If omitted | Detected by |
|---|---|---|
| Add the controller to `controllers` | The five routes do not exist | Any endpoint test |
| **Extend `configure()`'s `forRoutes(...)` to the new controller** | Every adjudication request emits **no** structured log line — silence, not a wrong value. `forRoutes(RegistrationsController)` names one class | **Nothing today.** DC-29 exists to build the gate |

`RegistrationsThrottleGuard` is applied at the *public* controller's class level and is deliberately **not** extended here: the admin surface is authenticated and `@Roles('Admin')`-gated, so it carries neither of the abuse profiles 3a's throttle addresses. Recorded so its absence reads as a decision rather than an oversight.

### 6.2 Approval — one transaction, in this order

The order is not incidental; each step is placed where it is for a stated reason.

| # | Step | Why here |
|---|---|---|
| 1 | **Conditional status update** — `id` matches **and** `status = PENDING_REVIEW`; also writes `reviewedBySub`, `reviewedByEmail`, `reviewedAt`. **Zero rows affected ⇒ `409`** | First, because this is what makes double approval impossible. A read-then-check races, and the race publishes two public records of one organisation from one act of consent |
| 2 | Derive `traderId` — `REG-<year>-<seq>` → **`SR-<year>-<seq>`** (DD-23) | Needs no I/O; keep it before any write that could fail on it |
| 3 | **Project the publishable subset** (§6.3) | Pure function, no I/O — a projection bug must surface before anything is written |
| 4 | Assert `isConsentProvenanceSatisfied` against the effective post-write state | Drift protection, **not a gate** — see the honesty note below |
| 5 | `tx.actor.create` — **`P2002` ⇒ `409` naming the key** | The first write that can collide |
| 6 | `tx.cropsOnActors.createMany` | Needs the actor id |
| 7 | `actorAuditService.logRegistrationApprove(tx, actor, acting, reference)` | Inside the same `tx`, per `backend/CLAUDE.md` |
| 8 | Set `publishedActorId` on the registration | Only knowable after step 5 |

**After commit, never inside it:** the approval notification (DD-9, inherited). A message announcing a decision that then rolls back is worse than no message.

> **On step 4's honesty.** With all four provenance values set to satisfying constants and `consentAcceptedAt` non-nullable, `isConsentProvenanceSatisfied` **cannot return false** on this path. It is retained so that if chunk 1's shared rules tighten, this path inherits them — but it is **not a gate**, and §14 does not count it as one. The real gate is the by-value assertion on the created actor's four fields (DC-6). *(Inherited from 3a A22·B31; restated because a reader who meets the call without this note will reasonably mistake it for the check.)*

### 6.3 The projection — an explicit literal pick

Fourteen payload fields, twelve of which have an `Actor` column. The projection names each target explicitly; it is **never** a spread and never a loop over payload keys.

**Two fields go nowhere:** `contactPerson` (a named natural person — no `Actor` column exists, and `position` is a job title) and `otherCrops` (free text; `crops` is a many-to-many over exactly three canonical crops).

**Three `Actor` columns are left null** because the payload has no source for them: `technicalSupport`, `gpsAltitude`, `gpsAccuracy`. Inventing a value would publish something no applicant supplied.

`Actor.email` comes from `Registration.submitterEmail` — the OTP-verified address — not from the payload, which carries no email field at all.

**Why literal-pick and not a mapping table.** A spread would throw on unknown Prisma args, which is loud and safe; the actual risk is subtler. `contactPerson` and `position` are **adjacent fields of the same DTO**, so "fall back to `contactPerson` when `position` is absent" is a plausible-looking one-line change that publishes a person's name to the public directory. A literal pick puts the *absence* of `contactPerson` in the source where a reviewer reads it, rather than in a table a reviewer skims.

### 6.4 Rejection

Structured `reason` validated against `rejection-reasons.ts` — a frozen list including *"Duplicate of an existing registry record"* — plus an optional applicant-facing `note`. Same conditional-update construction as approval (zero rows ⇒ `409`). Audited via `logRegistrationReject`. **No actor is touched, and the stored consent record is not altered.**

The `note` is the one `Registration` field 3a's public lookup may return, so it is applicant-facing text. The **reason code is not** — it stays admin-only (DC-32).

### 6.5 Duplicate detection — one fetch, not N

Admin-only, computed at read time, **never persisted as a verdict**. Candidates by normalized phone equality, lowercased email equality, normalized `traderName` equality, and a GPS bounding-box proximity check when both coordinates are present. Capped and ordered by match strength.

**The queue's per-row count is computed from a single narrow fetch, not per row.** The naive shape — detect per row — is N scans per page load. Instead the service fetches the comparison projection of `Actor` (id, `traderName`, `phone`, `email`, coordinates) **once per request** and matches every row on the page against it in memory. One query per page, not one per row.

`phone` and `email` are not indexed on `Actor`, so this scans. Trivial at ~1,300 rows; indexing two PII columns to serve an admin-only warning is not yet justified. **Revisit trigger recorded as DC-35**, well beyond the PRD's 1,000+ target.

Dismissed candidates are filtered out of both the count and the detail list. Detection never blocks, pre-selects, merges or auto-rejects.

### 6.6 Activity trail — a pure function over stored fields

Derived, never authored: *submitted* (`createdAt`), *email verified* (`emailVerifiedAt`), *consent recorded* (`consentAcceptedAt` + `consentPolicyVersion`), *cleared as not a duplicate* (one per `duplicateDismissals` entry), *adjudicated* (`reviewedAt` + status + reviewer).

**It does not claim a duplicate-check time.** Detection is never persisted, so any such timestamp would be fabricated — in the one surface whose purpose is an auditable consent trail (FR-10, inherited amendment S-4).

### 6.7 Audit — two additive methods

`logCreate` cannot be reused: it hardcodes `action: ActorAuditAction.CREATE` and takes no action parameter, and no existing method can write a row for a rejection, which has no actor at all.

- `logRegistrationApprove(tx, actor, acting, reference)` — writes the created actor's real identity with the new action.
- `logRegistrationReject(tx, registration, acting)` — writes `actorId` = the **registration** id, `traderId` = the reference, `traderName` = the submitted organisation name.

**The `changes` envelope each writes is pinned here, because leaving it open renders a correct badge above an empty body.** `ActorHistoryPanel` narrows `changes` with `isDiff` / `isSnapshot` and falls through to *"Details not available"* for anything satisfying neither.

| Method | Envelope | Why |
|---|---|---|
| `logRegistrationApprove` | **Full snapshot of the created actor**, identical in shape to `logCreate`'s | It *is* a create, with a distinct provenance and authority. Reusing the shape means `SnapshotDetails` renders it with no new narrowing branch |
| `logRegistrationReject` | **Snapshot-shaped** over the registration's reviewable facts — reference, submitted organisation name, structured reason | There is no actor to snapshot. Snapshot-shaped rather than a third envelope, so it stays legible to any future reader without widening the panel's type narrowing |

> **A gap this creates, stated rather than left implicit.** A `REGISTRATION_REJECT` row is written with `actorId` = the registration id, and the only surface that renders audit rows filters on `actorId`. **No current UI can display a rejection row**, so its envelope shape is unobservable and **no test can gate its rendering** — only its persistence. The shape is pinned for legibility and for whatever surface chunk 4 adds, not because a gate proves it.

Both are additions; **no existing signature or behaviour changes**, and the existing audit suite must stay green untouched. `ActorAuditLog.actorId` is deliberately FK-less, so a rejection row bends no constraint — and because the actor-history read path filters on `actorId`, a rejection row simply never matches any actor. No filter needs adding; the id space keeps them apart.

---

## 7. Frontend Design

### 7.1 Routes

| Route | Shape |
|---|---|
| `/admin/registrations` | Static route. Queue. URL-synced `status`, `q`, `region`, `traderType`, `sort`, `page`, `pageSize` |
| `/admin/registrations/review?id=` | Static route + `useSearchParams()` inside `<Suspense>`. **Never a `[id]` segment** (`frontend/CLAUDE.md`, NFR-7) |

Both land under `app/(admin)/`, which already carries `RequireRole allow={['Admin']}` — client-side convenience only; the API is the authoritative gate.

**Analytics exclusion is inherited for free.** `enhancement/usage-analytics` (on this branch) implements admin exclusion as **layout placement, not a pathname allowlist** — its gate asserts the admin layout contains no `usePathname` reference. Any new route under `(admin)` is therefore excluded automatically. **No task, no test change.** Verified against `app/(admin)/analytics-exclusion.test.tsx` rather than assumed.

### 7.2 Queue — `RegistrationsTable`

Follows `ActorsTable` conventions: dual rendering (a `hidden <bp>:block` table with `overflow-x-auto` plus a `<bp>:hidden` stacked card list), URL-synced state, oldest-first default, sticky reference column with an opaque token background and `shadow-sticky-edge` at the frozen boundary.

Columns: reference · applicant · type · region · submitted · duplicates · status · action — **eight**, with one sticky.

**The breakpoint is a measurement, not a guess.** `frontend/CLAUDE.md` is explicit that the split is per-table and chosen by column count: `UsersTable` splits at `md`, `ActorsTable` at **`lg`** because nine columns plus two sticky ones leave only ~94px of scrollable strip at `md` — *measured*, not reasoned. Eight columns with one sticky sits between those two exemplars, and this design **does not pretend to know which side**. The starting position is `lg` (closer to `ActorsTable`), and the task carries an obligation to **measure the scrollable strip at `md` in a real browser** and record the number. *(This is the shape of usage-analytics **L-1** defect #4: an accepted-set written from reasoning that went 1 → 3 → 10 across two corrections, both times found by measuring, never by re-reading.)*

Segments render **only** `PENDING_REVIEW`, `APPROVED`, `REJECTED`. No `AWAITING_APPLICANT` segment; no *"No email"* flag. Empty state distinguishes "no rows for this filter or page" from "no registrations at all". If the loading skeleton mirrors the split, it moves to the same breakpoint or it flashes the wrong shape.

### 7.3 Detail — `RegistrationDetailPanel` and its children

Composed of: the **reference code in the header** · `DuplicateWarningCard` (per-candidate dismissal) · a submitted-details table with the two non-publishable fields **explicitly marked as review context that will not be published** · a location card with raw coordinates and a map link · the decision panel · `ConsentRecordCard` · `ActivityTrail`.

`ConsentRecordCard` renders the acceptance timestamp with **an explicit timezone**, and labels it **recorded at submission** — 3a's own model comment records that the contract collects no client acceptance timestamp by design, making the stored value an upper bound rather than an attested moment. Presenting it as attested would overstate the consent record in the one card whose job is to be exact about it.

No payload editing (D-4). No bulk action bar (D-3).

### 7.4 Dialogs

**Approve uses `AcknowledgeDialog`.** `frontend/CLAUDE.md` makes it **required** in the UI before any submit that sets `consentStatus` to `GRANTED` — which approval does. `ConfirmDialog` is rejected on that basis alone: it is for destructive confirms, and this action is a publish, not a delete.

**Corrected at T-16.** This section previously also rejected `ConfirmDialog` because it *"hardcodes its confirm button as `bg-danger`"*, framed as a reason to prefer `AcknowledgeDialog`. That framing was false: `AcknowledgeDialog.tsx:379` is **byte-identical** to `ConfirmDialog.tsx:245` — `'rounded-md bg-danger px-4 py-2 text-sm font-medium text-primary-fg'` — on both components' confirm button. Choosing `AcknowledgeDialog` does not avoid the red button; it ships the same one. **This is a live NFR-6 violation, not a documentation-only defect**, escalated as R-13 in §12 — a red destructive button is the confirm control on the registry's only publish action. The passing token test for this spec (`RegistrationDetailPanel.test.tsx`, `describe('token compliance — danger on rejection only')`) asserts danger tokens on the Reject **trigger**, their absence on the Approve **trigger**, and `bg-danger` on `RejectDialog`'s confirm — it never renders `AcknowledgeDialog` and never inspects its confirm, so it cannot and does not prove NFR-6 for the publish action's dialog confirm. DC-13's separate hex/colour-literal grep over *new* files is another gate entirely; neither one asserts destructive/non-destructive semantics on `AcknowledgeDialog`'s existing, shared confirm button.

`acknowledgementText` = **"I confirm consent is on file"**. The body names the policy version and acceptance date being attested to, and states what approval will do — create an actor and publish contact details and coordinates to the public directory. **The typed gate is re-validated server-side**; the client gate is UX only.

**`RejectDialog` is new and is deliberately not `AcknowledgeDialog`**: rejection grants no consent, and it collects two inputs (a required structured reason select and an optional note) rather than one typed confirmation. It carries an irreversibility notice.

### 7.5 The audit-action fix (FR-16)

Two edits, and the second is the one that changes the failure mode:

1. `AuditEntry['action']` in `lib/api/actors-admin.ts` widens from five members to **eight** — the five it has, plus `IMPORT` (already emitted by the backend and already missing), plus the two new ones.
2. `actionBadgeClasses` in `ActorHistoryPanel.tsx` becomes a **total `Record<AuditEntry['action'], string>`** instead of a `switch` with no `default`.

**Why a total `Record` and not a `default` branch.** The in-repo precedent is `RoleBadge.tsx`, whose `ROLE_BG_CLASS` and `ROLE_CSS_VAR` are total `Record` maps — so a missing member is a **compile error**, which is how the trader-taxonomy widening was made safe. A `default` branch would silence the symptom permanently: the next enum member would render an unstyled badge forever instead of failing the build. The failure mode moves from *silent at runtime* to *loud at build time*.

**There is a second `switch` on `AuditEntry['action']`, and it is deliberately left as a `switch`.** `SnapshotDetails` builds its expandable summary copy from one, carrying `default: summary = 'Snapshot'`. Converting it to a total `Record` would be **wrong**, not merely unnecessary: `SnapshotDetails` renders only when `isSnapshot(changes)` holds, so actions that emit a diff — `UPDATE`, `BULK_CONSENT` — never reach it, and a total map would force meaningless summary copy for them. Its `default` is correct precisely because its domain is a *subset* of the union, which is the opposite of `actionBadgeClasses`, whose domain is the whole union and whose missing `default` therefore silently drops members.

**What this spec does add there:** an explicit `REGISTRATION_APPROVE` case, so the registry's most consequential audit row gets real summary copy instead of the generic `'Snapshot'`. `REGISTRATION_REJECT` gets no case — it cannot reach this component (§6.7).

*(Named because FR-16's title is "widened **end-to-end**": a reader who finds a second, untouched `switch` must be able to tell a decision from an omission. Judgment Day A2.)*

**The type gate needs its own command.** `next/jest` uses SWC and does **no type checking** (`frontend/CLAUDE.md`), so `npm test` alone cannot catch a missing `Record` member. The verification is `npx tsc --noEmit`, alongside a runtime test that iterates the union and asserts every member yields a non-empty class and a label.

### 7.6 Sidebar

One array entry — `{ label: 'Registrations', href: '/admin/registrations', enabled: true }` — in `NAV_ITEMS`. **Genuinely a one-line edit**, unlike 3a's public `NAV_LINKS`, which needed a `variant` prop widening. `NavItem` is `{ label, href, enabled }` and gains no role field: the shell's `RequireRole allow={['Admin']}` already means `Staff` never sees the sidebar.

### 7.7 Tokens (NFR-6)

Everything resolves through `tailwind.config.ts`: `bg-primary`/`primary-soft`/`primary-fg` · `bg-surface`/`surface-alt` · `text-fg`/`text-muted` · `border-border` · `bg-success`/`warning`/`highlight-tint` for status chips · `bg-danger`/`danger-soft` **for rejection semantics only** · `rounded-sm/md/lg/full` · `shadow-sm/md/sticky-edge` · `duration-fast/base`. Zero hex literals in new files.

Per `docs/ux-ui/design.md` §7, `--color-accent` (~3.6:1) and `--color-highlight` (~2.0:1) **fail AA for small body text** — large text, borders, chips and tints only; body copy uses `fg`/`muted`. **This is what DC-16's human check verifies, because jsdom cannot** (§14).

---

## 8. Security & RBAC

**Roles.** `Admin` only, on all five endpoints. `Staff` → `403`. Anonymous → `401`. No public path is added.

**Enforcement is server-side and class-level**, copying `admin-actors.controller.ts`. There is no global guard in `app.module.ts` — guards are opt-in per controller, which is exactly why the class-level decorators are the design and not a convention.

**The containment guarantee.** `Registration.payload` and `submitterEmail` remain protected **structurally, not by a filter** (`docs/trd/trd.md` §8, ADR-010): the public surface returns at most `{ reference }` or `{ status, reviewNote }` and never reads `payload`. This spec adds no public path, so the guarantee is unchanged in kind — but the **release gate that proves it now has five more routes to classify** (DD-16).

**The reviewer's identity is never client-supplied.** `reviewedBySub` comes from the validated JWT, `reviewedByEmail` from `ActingAdminResolver` (Cognito `ListUsers`, cached per container, null on failure). `backend/CLAUDE.md` states the rule plainly: never trust client-sent identity.

**Logging carries no PII** (NFR-8): request id, route, method, status, role, latency, and the reference code. Never a payload field, an email address, a phone number, or a mail body.

---

## 9. Design Decisions

### DD-15: The admin controller lives in the existing `RegistrationsModule`

- **Context.** 3a's `pii-boundary.spec.ts` derives its route set from `MODULE_METADATA.CONTROLLERS` on `RegistrationsModule` and asserts a **bidirectional totality** against `FIXTURE_MAP`. Its T-13 rework made it module-scoped *explicitly because* 3a's own file tree scheduled `admin-registrations.controller.ts` into that module for this chunk — and the change was proven by adding a throwaway second controller and observing the totality assertion fail by name.
- **Options.** (a) `AdminRegistrationsController` inside `RegistrationsModule`. (b) A separate `AdminRegistrationsModule`.
- **Decision: (a).**
- **Argument.** Option (b) is the trap. It would make the release gate **pass** — the derivation walks `RegistrationsModule`'s controllers, so routes in a sibling module are invisible to it — and the five most PII-dense routes in the module would ship with zero gate coverage. That is C-9 restored through a third door, and it is worse than the first two because the green suite would actively certify it. **A design choice that makes a gate stop looking at something is not a simplification.**
- **Consequences.** The gate fails on day one (R-8) until `FIXTURE_MAP` is extended — deliberate. Two module edits become load-bearing (§6.1), one of which (`forRoutes`) has no compile-time signal.

### DD-16: `FIXTURE_MAP` gains an access **discriminant**, never an exemption flag

- **Context.** Every `FIXTURE_MAP` entry today expresses one idea: *this public route leaks nothing*. This spec's routes are admin-gated and **legitimately return PII to an Admin**, so that assertion is false for them by design.
- **Options.** (a) An `exempt: true` flag skipping the scan. (b) An `access: 'public' | 'admin'` discriminant that changes **what** is asserted, never **whether**. (c) Keep the admin controller out of the module (= DD-15 option b).
- **Decision: (b).**
- **Argument.** (a) and (c) are the same failure wearing different clothes: both let a route stop being checked. Under (b), an admin route's assertion is still a **leak** assertion — that an anonymous caller gets `401` and a `Staff` caller gets `403`, and that **neither response body contains any fixture value**. The totality assertion is untouched and stays bidirectional, so a new route with no entry still fails by name. Every route is asserted; only the assertion differs.
- **Consequences.** Every existing entry gains `access: 'public'` — a mechanical edit to a file whose green is a **hard release gate**, so the existing assertions must be shown to still pass unchanged. The scan loop's missing-entry branch must keep `throw`ing rather than `continue`ing; a `continue` reintroduces C-9 inside the fix for C-9.

### DD-17: Double approval is closed by a conditional update, not a read-then-check

- **Context.** Two reviewers, or one reviewer double-clicking, must not publish two actors from one registration.
- **Options.** (a) Read status, check, then write. (b) A conditional update matching `id` **and** `status = PENDING_REVIEW`, treating zero affected rows as the refusal.
- **Decision: (b),** as step 1 of the transaction.
- **Argument.** (a) races, and the race's outcome is two public records of one organisation from one act of consent — the worst available failure in this spec. (b) makes the refusal a property of the write itself, so there is no window to lose.
- **Consequences.** The `409` for "already adjudicated" is produced by a row count, not a comparison, so it cannot drift out of sync with the check. The same construction serves rejection (§6.4).

### DD-18: The projection is an explicit literal pick

- **Context.** Fourteen payload fields, twelve with an `Actor` column; the two without include a named natural person.
- **Options.** (a) Spread the payload into the create input. (b) A field-mapping table. (c) An explicit literal pick naming each target.
- **Decision: (c).**
- **Argument.** (a) throws on unknown Prisma args — loud, but it also invites the "fill the gap" instinct. The real hazard is that `contactPerson` and `position` are **adjacent fields of one DTO**, so mapping the former onto the latter is a one-line, plausible-looking change that publishes an individual's name. (b) hides the two omissions in data a reviewer skims. (c) puts the absence in the source, where it is read.
- **Consequences.** Adding an `Actor` column later requires an edit here — which is the point: a new public column should be a deliberate act, not an inherited spread. Gated by DC-23, asserting fixture **values** absent from **every** column.

### DD-19: The logging middleware's `forRoutes` is extended, not made global

- **Context.** `RegistrationsModule.configure()` applies `RequestContextMiddleware` via `forRoutes(RegistrationsController)` — one named class.
- **Options.** (a) `forRoutes('*')`. (b) Add the new controller to the existing call.
- **Decision: (b).**
- **Argument.** 3a chose scoped-not-global deliberately (`design.md` §4.10: *"applied to this module's controllers only, not globally"*) because a repo-wide observability rollout is out of scope. (a) would silently expand that scope; (b) honours it. The middleware also runs **ahead of guards**, which is why a guard-thrown `403` on these routes still emits a line — an interceptor would emit nothing at all.
- **Consequences.** The omission has **no compile-time signal** and produces silence rather than an error. DC-29 exists solely to gate it.

### DD-20: Duplicate detection fetches once per request, not once per row

- **Context.** The queue shows a duplicate count per row; the naive implementation runs detection per row.
- **Options.** (a) Detect per row (N scans per page). (b) Fetch the comparison projection of `Actor` once per request and match the page's rows against it in memory. (c) Persist a duplicate verdict.
- **Decision: (b).**
- **Argument.** (a) is what the inherited text warned against and would make the count expensive enough to tempt someone into (c). (c) is excluded by FR-11 — a persisted verdict is a decision, and detection must never decide. (b) is one query for any page size.
- **Consequences.** The comparison projection is loaded whole (~1,300 rows × 5 narrow fields today). DC-35 records the revisit trigger; indexing two PII columns for an admin-only warning is not yet justified.

### DD-21: A total `Record`, not a `default` branch

- **Context.** `actionBadgeClasses` switches five members with no `default` and returns `undefined`; `IMPORT` is already missing and degrades silently.
- **Options.** (a) Add a `default` branch. (b) Convert to a total `Record<AuditEntry['action'], string>`.
- **Decision: (b).**
- **Argument.** (a) fixes today's symptom and **guarantees the next recurrence is invisible** — a `default` makes every future member render an unstyled badge forever rather than failing. (b) turns the same event into a compile error, matching `RoleBadge.tsx`'s `ROLE_BG_CLASS`/`ROLE_CSS_VAR`, the in-repo precedent that made the trader-taxonomy widening safe.
- **Consequences.** The gate needs `npx tsc --noEmit`, since `next/jest` uses SWC and type-checks nothing. **This is a reversion** — it removes a shipped `switch` — and is challenged in §10.

### DD-22: `404` stays honest on the admin surface

- **Context.** 3a made the public lookup's `404` byte-identical across failure modes to kill a membership oracle.
- **Decision.** The admin `404` is a plain not-found, distinguishable from a `403`.
- **Argument.** The oracle reasoning is about *unauthenticated* callers learning membership. An authenticated Admin is entitled to know a registration exists; a uniform `404` would make a mistyped id indistinguishable from a deleted one and turn a routine operator error into a support ticket. **The uniformity requirement stops at the auth boundary.** FR-9's non-leakage clause binds the `403` path, not the `404` path.
- **Consequences.** Recorded here so a future reviewer meeting the two different `404` postures in one module reads a decision rather than an inconsistency.

### DD-23: `traderId` is derived from the reference under the `SR-` prefix

- **Context.** FR-12 requires a **server-generated** key, unique table-wide, distinguishable from every imported namespace, with a collision surfacing as a recoverable error. `requirements.md` D-8 binds this document to state the literal; OQ-2 asks it to confirm or replace 3a's proposed `SR-`.
- **Options.** (a) Derive from the reference under a distinct prefix. (b) A per-year counter table. (c) `MAX(sequence)+1` parsed from existing keys.
- **Decision: (a).** `REG-<year>-<seq>` → **`SR-<year>-<seq>`** — e.g. `REG-2026-0184` → `SR-2026-0184`. **This closes `requirements.md` OQ-2.**
- **Argument.** `Registration.reference` is already `@unique` and already race-safe — 3a's `RegistrationSequence` allocates it with an atomic `INSERT … ON DUPLICATE KEY UPDATE`, proven under concurrent load against dev RDS. Deriving from it inherits that uniqueness **among self-registered actors** with no second counter and no new race. (b) would add an object for a guarantee that already exists — and 3a's RA1 was precisely a counter specified in prose and declared nowhere. (c) needs a table lock and breaks on any format drift. `SR-` collides with none of chunk 2's eight prefixes — `OFB · OFS · OFG · BBB · HUM · DSP · SDC · QDS` — and is deliberately **not** the mockup's `TZ-`, which `backend/prisma/seed-data.ts` already uses as `TZ-SEED-*`.
- **Consequences, and the one that matters.** **This is unique among self-registered actors, not table-wide by construction.** `ActorCreateDto` accepts any client-supplied `traderId` with `@IsString() @MinLength(1)` — no pattern, no reserved prefixes — so an admin may already have created `SR-2026-0184` by hand. That is why §6.2 step 5 catches `P2002` and returns a **`409` naming the colliding key** instead of letting it surface as a `500` that would leave the registration permanently unapprovable. DC-7 asserts the derivation against all eight prefixes plus `TZ-SEED-*`.

### TRD ADR-012 (to be added to `docs/trd/trd.md` §12.5 on archive)

> **ADR-012** — **Approve-to-publish is a single-transaction, compare-and-set, human-acknowledged act, and the created `Actor` is the only public artifact it produces.** *Accepted.* The registry's one path from private submission to public record. Publication is per-record and never bulk, because each publication is a consent decision (D-3); the payload is published as submitted and never reviewer-edited, because an edited record would be published as consented-to when it is not what was consented to (D-4). The `Registration` row itself never becomes public, before or after adjudication — extending ADR-010's structural containment across the adjudication boundary rather than relaxing it at it. **Consequence:** the act is irreversible within this spec's scope; there is no un-publish, and the quality of the human judgement it depends on is ungateable (DC-33). Consent provenance is carried verbatim from the stored acceptance record, satisfying ADR-004's publishable state through chunk 1's shared invariant rather than around it.

---

## 10. Step 2.3 — Reversion Challenge

Two decisions remove or alter already-delivered behaviour. Each was put to one reviewer, one question: *what does removing this break?*

| Decision | What it removes | Challenge outcome |
|---|---|---|
| **DD-21** — `switch` → total `Record` in `ActorHistoryPanel` | The `switch` statement and its implicit `undefined` return | **Nothing breaks; the removed behaviour is the defect.** *(Corrected at T-16 — the reversion-challenge outcome below was wrong twice, per T-15's own review; the outcome itself does not change.)* The call site joins the result into a class string via `Array.prototype.join`, which renders `undefined` as the **empty string**, not the literal `"undefined"` (`['base', undefined].join(' ')` → `"base "`) — so a member missing from the map degrades to an unstyled badge with no visible artifact, which is exactly why the `IMPORT` drift survived silently since the import spec shipped. The real consequence is narrower than "fails the build": a backend enum member added **with no frontend edit at all** leaves the frontend union unchanged, so `tsc` stays clean and the new action simply renders unstyled — the same silent drift as before. The compile error DD-21 buys fires only when the **frontend union itself is widened** (a new `AuditEntry['action']` member added) **without** a matching `actionBadgeClasses` entry — that is the one case a `switch` degrades silently on and a total `Record` cannot. The existing `ActorHistoryPanel.test.tsx` (362 lines) must stay green untouched — a change in rendered output for the five existing actions would mean the `Record` values diverged from the `switch` arms, and that is the specific regression to check. |
| **DD-16** — `FIXTURE_MAP` entry shape gains `access` | Nothing is removed; every existing entry gains a field | **Not a reversion, but it edits a hard release gate.** The risk is not behavioural change, it is *collateral*: the file's green is a release gate, and a mechanical edit across every entry can break assertions unrelated to this spec. Required: the suite is shown green **before** the admin routes are added, with only the discriminant in place. If that intermediate run is skipped, a failure at the end cannot be attributed. |

No other decision in §9 removes, disables or inverts shipped behaviour. Additions — two enum members, two audit methods, one controller, one sidebar entry, an extended `forRoutes` — are not reversions.

---

## 11. Step 2.4 — Budget (tripwire for `/akili-execute`)

**Derived bottom-up from measured analogues in this repo, and it contradicts the inherited figure. That contradiction is the finding.**

The proposal inherited a split arithmetic — revision 2 estimated the *combined* chunk 3 at 31 tasks / ~9,300 LOC, revision 3 re-derived **3a alone** at 23 tasks / ~6,500, leaving 3b as the ~8-task remainder by subtraction. **Subtraction was never a derivation.** Built bottom-up, 3b is the size of 3a and somewhat larger — not a third of it: it reuses 3a's foundation (mail, logging, throttle, taxonomy) but adds the system's most complex transaction, a detection engine, a release-gate extension, and two frontend screens whose measured analogues are the largest components in the repo.

| Signal | **3b** | Basis (measured, this working copy) |
|---|---:|---|
| Tasks | **16** | 3 foundation (migration + audit enum · 2 audit methods · `FIXTURE_MAP` discriminant) · 6 backend (list · detail · approve · reject · dismiss + detection · admin PII-gate routes) · 6 frontend (API client · queue page + table · detail page + panel · duplicate + consent + trail cards · reject dialog + approve wiring · audit union fix) · 1 constitutional |
| Backend code | ~1,500 | `actors-admin.service.ts` is **724** for a comparable admin surface; `admin-actors.controller.ts` **175** for 9 routes |
| Backend tests | ~2,000 | `actors-admin.service.spec.ts` is **1,333**; `pii-boundary.spec.ts` is **1,642** today and this extends it |
| Frontend code | ~2,200 | `ActorsTable.tsx` **743**, `ActorForm.tsx` **959**, `AcknowledgeDialog.tsx` **391**, `actors-admin.ts` **666** |
| Frontend tests | ~2,200 | `ActorsTable.test.tsx` **599**, `ActorForm.test.tsx` **838**, `actors-admin.test.ts` **827** |
| Docs + amendments | ~250 | TRD §2/§4/§8/§12.5 (ADR-012)/§13 · `docs/ux-ui/design.md` §2/§4/§5 |
| **Total LOC** | **~8,200** | Sum of the rows above (8,150), rounded up |
| **Review rounds** | **~35** | 16 × **2.17/task** — 3a's demonstrated rate. Metric defined below |

**Define the metric before quoting a number — conflating two of them is how this section was wrong in draft.** 3a's archive reports *"**11 rework rounds**, ~50 Reviewer lens reports"* in one sentence. Those are **two different metrics**, and only one of them was ever budgeted:

| Metric | Definition | 3a budget | 3a actual |
|---|---|---:|---:|
| **Review round** *(the budgeted one)* | One Reviewer engagement on one task attempt — **PASS or FAIL** | 37 | **~50** |
| Rework round | A FAIL → retry cycle only | not budgeted | 11 |

**On the metric that was budgeted, 3a was _under_-predicted, and the tripwire fired.** 3a's `execution.md` records the convention as *">37 review rounds"*, tracked live throughout (*"the run is at 22 of ~37 review rounds with 13 tasks left"*), and breached it: *"At T-8's close the run stood at **~38 with 8 tasks remaining**, so I halted and put three options to the user rather than exceeding it silently."* Chunk 1's 1.6/task rate under-read 3a by roughly a third.

**3b therefore counts review rounds, at 3a's demonstrated rate:** ~50 over 23 tasks ≈ **2.17/task**; 16 × 2.17 ≈ **35**. That is a tripwire expected to fire about once, mid-spec — which is what firing correctly looked like in 3a. The 11-rework-round figure is recorded here only to keep the two metrics distinguishable; **`/akili-execute` does not count it and sets no tripwire on it.**

*(This section asserted the opposite in draft — that 3a's budget over-predicted by 3.4× — by comparing the 37-review-round budget against the 11-rework-round actual. Judgment Day A1; the inverted ratio had set this spec's tripwire at 10, low enough to fire on ordinary progress.)*

**Depth `Full` is confirmed.** ~8,200 LOC over 16 tasks, one irreversible write path, five endpoints and a release-gate edit is not `Standard` work. The estimate matching the declared depth is the expected outcome and needs no action.

> **Tripwires for `/akili-execute` — any one halts for the user:** more than **16 tasks**, more than **~9,200 LOC**, or more than **35 review rounds** (PASS or FAIL, as defined above). Per usage-analytics' *"the tripwire fired correctly twice and was then forgotten"* — **a breach that is never measured disarms the tripwire retroactively.** The running total is re-measured at every fourth task, not only when someone remembers.

---

## 12. Risks & Mitigations

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | **Irreversible publication** | `AcknowledgeDialog`'s typed gate re-validated server-side, naming the specific policy version and acceptance date. DC-33 records that the judgement itself is ungateable |
| **R-2** | **Partial adjudication** — orphan actor, or approved-with-no-actor | One `$transaction`, compare-and-set first (DD-17). Evidence limits recorded honestly (NFR-3, DC-24) |
| **R-3** | **Wrong projection publishes a natural person's name** | Literal pick (DD-18); value-asserted gate over every column (DC-23) |
| **R-4** | **Silent audit-history degradation** | Total `Record` (DD-21) + `npx tsc --noEmit` + a test proven to fail pre-change |
| **R-8** | **The release gate blocks the spec on day one** | Deliberate — the gate working. DD-16 makes the fixture classification a first-class design item, and §10 requires an intermediate green run so a later failure is attributable |
| **R-9** | **The `forRoutes` omission ships silently** | No compile-time signal exists. DC-29 is the only defence, and it must assert a line **is** emitted, not merely that the middleware is registered |
| **R-10** | **The `FIXTURE_MAP` edit breaks assertions unrelated to this spec** | Sequence it: discriminant first, suite green, admin routes second (§10) |
| **R-11** | **Frontend test flake under full load** — 3a measured 32/32 green in 2.3 s isolated vs 29.3 s under load (13×, CPU starvation) and recommended a blocking follow-up for the next frontend-heavy chunk, which is this one | **User decision 2026-09-01: proceed and escalate.** Tasks prefer the smallest verifying command (`npm test -- <pattern>`), which avoids it. Escalate at the first ambiguous failure rather than pre-spending a spec (OQ-1) |
| **R-12** | **Notification copy ships unreviewed** — the first outbound message the registry sends an external organisation about a decision concerning them | Drafted copy-provisional, shipped behind the no-op transport by default, flagged for program-team review at the Phase-3 HITL pause (OQ-4) |
| **R-13** | ~~**`AcknowledgeDialog`'s confirm button is `bg-danger` on the system's only publish action**~~ — **RESOLVED 2026-09-02, post-spec, at the user's request during the DC-16 review.** A red destructive button styled an act that grants consent and publishes PII, contradicting NFR-6's *"`danger` … MUST NOT style the publish action"* (§7.4, corrected at T-16). | **Fixed as named:** `AcknowledgeDialog` gained `tone?: 'danger' \| 'primary'` **defaulting to `'danger'`**, resolved through a **total `Record`** (DD-21's pattern, so a third tone is a compile error). The three pre-existing call sites pass no `tone` and render byte-identically — their suites confirm it (`ActorForm` 40/40, actors page 32/32, import page 19/19, `AcknowledgeDialog` 19/19). Only the approve path passes `tone="primary"`. **Contrast improved as a side effect:** white on `bg-primary` is **8.31:1** (11.47:1 on hover) against **6.54:1** on `bg-danger`. **And the gate the T-14 review said was missing now exists:** `RegistrationDetailPanel.test.tsx` asserts the approve dialog's confirm carries `bg-primary` and **not** `bg-danger` — verified to discriminate by removing `tone="primary"` and watching it redden with `bg-danger` in the received classes. |

---

## 13. Kaizen Lessons Applied

Cited next to the decision each shaped, per the command's requirement. The three from `enhancement/usage-analytics` are **pending standardization**, not yet in the Active Lessons table — cited by source.

| Lesson | Where it shaped this design |
|---|---|
| **KZ-002** (presence ≠ behaviour; a gate that cannot fail is not a gate) | DC-27/DC-28/DC-29 each name the pre-change state their test must redden against; §6.2's honesty note refuses to count the provenance invariant as a gate |
| **KZ-004** (a correction closes only when the superseded value is gone everywhere) | The FR-9 sidebar clause was corrected during Phase 2 and swept in both directions before this document was written |
| **KZ-005** (reconcile figures against prose) | §11's counts, §6.3's fourteen/twelve/two, §5's five endpoints — each cross-checked against `requirements.md` |
| **KZ-009** (cite symbols, not line numbers) | Every citation in both documents names a symbol, a literal string or a section title |
| **usage-analytics L-1** (nothing verifies the spec is *true*) | §7.2 refuses to assert a breakpoint from reasoning and makes measuring it an obligation; §7.1's analytics-exclusion claim was verified against the test file, not assumed; the sidebar's `NavItem` shape was read before being described |
| **usage-analytics L-2** (`author ≠ auditor` collapsed on execution — no Reviewer executed anything) | §14 marks which evidence is **execution-shaped** and therefore needs a Tester on a different model, not a reading Reviewer |
| **usage-analytics L-3** (the preventive clause sweep: 3 attempts → 1) | Carried into Phase 3 as a default task-brief expectation — for each clause, name the mutation that reddens a named test, or record it as a declared gap. No third option |
| **New — stated verification has proven imprecise seven times across this spec's own execution (recorded at T-16, not just fixed instance-by-instance)** | T-1 (a falsifying input that could not falsify anything) · T-4 (a clause misassigned to a route with no `:id`) · T-7 (a mutation its own named test structurally cannot detect) · T-9 (`Verify` naming a suite that cannot exercise the leak) · T-14 (a props-preserving dialog swap that is rendering-indistinguishable) · T-15 / §10's DD-21 reversion-challenge row (a false premise that would have shipped a vacuous gate, corrected above) · T-11→T-15 / A-83 (a claimed protection — total-`Record` widening-safety — that does not hold, DC-36). **In several of the seven, an Implementer caught the imprecision only by *running* the check, not by reading it** — T-15's `Array.prototype.join` test and A-83's `TS2741` behaviour were both empirical findings, not textual ones. **The pattern, not any single instance, is the finding:** a stated verification method in this spec's own documents has been wrong roughly once every two tasks; treat a task brief's `Verify`/`Falsifying input` text as a claim to re-check by running it, not as a fact to inherit |

---

## 14. Test Plan Outline

| Level | Coverage |
|---|---|
| **Backend unit** | Projection (DC-23, by value, every column) · provenance (DC-6, four fields by value) · `traderId` derivation vs all eight namespaces + `TZ-SEED-*` (DC-7) · `P2002` → `409` naming the key · conditional-update refusal (DC-30) · detection matching and per-candidate dismissal filtering (DC-31) · activity-trail derivation, incl. the absence of a fabricated check time · rejection-reason validation |
| **Backend endpoint/e2e** | Five routes × `401` anonymous / `403` Staff (DC-8) · approve happy path end-to-end · double approve → `409` · reject → no actor created · acknowledgement mismatch → `400` server-side · one structured log line per adjudication request, PII-free (DC-29) |
| **Release gate** | `pii-boundary.spec.ts`: bidirectional totality over the widened route set; admin routes assert `401`/`403` with **zero fixture values in the body** (DC-28). Discrimination proven by adding a throwaway route to the new controller, observing the named failure, and removing it |
| **Frontend component** | Table columns and both render modes · absent `AWAITING_APPLICANT` segment and absent "No email" flag (DC-11 shape — a **presence** assertion that can only prove absence, which is the direction that matters) · empty-state discrimination · dismissal persistence across reload · dialog gating · `jest-axe` on both screens |
| **Frontend type** | `npx tsc --noEmit` for the total `Record` (DC-27) — **`npm test` cannot catch this**, SWC type-checks nothing |
| **Human / T6, at the Phase-3 HITL pause** | **DC-16** — contrast, focus order, focus visibility on both screens in a real browser. `jest-axe` disables the whole `cat.color` rule set by default (verified in `node_modules/jest-axe/index.js`: `AXE_RULES_COLOR` mapped to `enabled: false`), so a green axe result says nothing whatever about contrast. KZ-003 applies: these components take plain props and render in a throwaway harness with no stack, no database and no login — **this check must not be deferred on auth grounds.** Plus §7.2's breakpoint measurement, and R-12's notification copy |

**Execution-shaped evidence** (usage-analytics L-2): the throwaway-route discrimination proof, the pre-change redness of the audit-union test, the breakpoint measurement, and the intermediate green run of §10. A reading Reviewer can only audit the *account* of these. Each should be re-run by a Tester on a different model, or its verbatim output recorded in `execution.md` — not summarised.

**Not gated, recorded:** real transaction rollback (DC-24) · duplicate-detection recall (DC-34) · the reviewer's judgement (DC-33) · email deliverability (DC-18, inherited) · index usage (DC-25).
