# Proposal — Registration Review Queue & Approve-to-Publish

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `admin/registration-review-queue` |
| Proposal date | 2026-08-05 |
| Author | AKILI (Leader) on behalf of JuanCode |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting `/akili-specify` |
| Parent epic | [`epic/hybrid-actor-registration`](../../epic/hybrid-actor-registration/proposal.md) — chunk **3b of 5** |
| **Depends on** | `actors/public-self-registration` (chunk **3a**) — hard prerequisite. **Satisfied:** executed and archived 2026-08-06 to `docs/specs/archive/2026-08-06-actors--public-self-registration/` |
| **Parallel-safe** | **no** — 3a creates the `Registration` model this spec adjudicates |
| Suggested depth | **Full** — irreversible publication of another party's PII, one transactional write path, five admin endpoints |
| Origin | **Split from chunk 3** on 2026-08-05, user-approved. See `../../archive/2026-08-06-actors--public-self-registration/judgment.md` §5 |

## 2. Why this spec exists separately

Chunk 3 was specified as one spec covering both the applicant flow and the admin review queue. That spec was audited by a blind dual review (`../../archive/2026-08-06-actors--public-self-registration/judgment.md`): round 1 produced 8 both-judge SEVERE findings, the correction round fixed 22 and **injected 6 more**, and the re-derived budget came to **31 tasks / ~9,300 LOC** — roughly 7× chunk 1, which finally agreed with the epic's own 6× RICE sizing that the original estimate had under-read by half.

The split was approved for two reasons, and the second matters more than size:

1. **The two halves carry different dominant risks, and therefore need different gates.** 3a's risk is the system's first unauthenticated write path and unapproved PII at rest — gated by the `pii-boundary` release gate over public paths. This spec's risk is the **irreversible publication of another party's personal data** — gated by a transactional-integrity and projection-correctness suite. Bundling them meant one spec whose gate table had to serve two unrelated failure modes.
2. **The original spec's Judgment Day lineage is exhausted** (terminal state `escalated`, one fix round left). Each successor is eligible for a **fresh lineage with its own two fix rounds**, which is what the remaining mechanism questions need.

## 3. Problem / Current Behaviour

After 3a ships, submissions accumulate in `Registration` with `status = PENDING_REVIEW` and **no surface on which to act on them**. Nothing can be published, rejected, or even read by an Admin. 3a is deployable and safe in that state — nothing reaches the public — but it is not *useful* until this spec lands. The two should ship in close sequence.

There is also no way to turn an accepted submission into an `Actor`: `traderId` has no generator anywhere in the codebase (`backend/src/actors/dto/actor-create.dto.ts` — client-supplied, `@IsString() @MinLength(1)`), and `ActorAuditService.logCreate` hardcodes `action: ActorAuditAction.CREATE` (`actor-audit.service.ts:127`), so no existing method can audit an adjudication.

## 4. Proposed Outcome

1. A **Registrations queue** — paginated, filterable, sortable, segmented by the statuses this spec can produce (`PENDING_REVIEW`, `APPROVED`, `REJECTED`), following `ActorsTable` conventions with URL-synced state and oldest-first default.
2. A **registration detail** screen showing the reference code, every submitted field, the consent record with a timezoned timestamp, duplicate candidates, and a read-only derived activity trail.
3. **Approve & publish** — behind `AcknowledgeDialog`'s typed gate (`frontend/CLAUDE.md:26` makes it *required* before any submit setting `consentStatus` to `GRANTED`), creating an `Actor` with `registrationSource = SELF_REGISTERED`, `consentStatus = GRANTED`, `consentMethod = PORTAL_CHECKBOX`, `consentObtainedAt` = the stored acceptance time, `consentReference` = the reference — **atomically**, with an audit row, in one `$transaction`.
4. **Reject** — structured reason (including *"Duplicate of an existing registry record"*) plus an applicant-facing note readable through 3a's status lookup.
5. **Duplicate detection at review** — candidates by phone, email, name and GPS proximity, surfaced as a warning with **per-candidate** dismissal. Never blocks, never decides.
6. **Decision notifications** — approval and rejection emails, each carrying the reference, dispatched **after** the transaction commits and never inside it. Uses the `MailService` 3a builds.

## 5. Scope

**Data — no new model, no migration beyond an enum widening.** 3a creates the full `Registration` model *including* the adjudication columns (`publishedActorId`, `reviewedBySub`, `reviewedByEmail`, `reviewedAt`, `rejectionReason`, `reviewNote`, `duplicateDismissals`), following chunk 1's precedent of declaring `PORTAL_CHECKBOX` early so a later chunk needs no second migration. This spec adds only:

- Two `ActorAuditAction` members: `REGISTRATION_APPROVE`, `REGISTRATION_REJECT`. **On MySQL this emits `ALTER TABLE \`ActorAuditLog\` MODIFY \`action\` ENUM(...)`** — additive in semantics, but a `MODIFY` in the generated SQL. Precedent: `backend/prisma/migrations/20260710132750_add_import_audit_action/migration.sql`. Disclose it in the migration task's done-criteria so a correct migration does not FAIL a "no MODIFY" contract.
- Two **additive** `ActorAuditService` methods (`logRegistrationApprove`, `logRegistrationReject`); no existing signature changes.

**Backend — five admin endpoints**, all `@UseGuards(JwtAuthGuard, RolesGuard) @Roles('Admin')`:

| Endpoint | Notes |
|---|---|
| `GET /api/v1/admin/registrations` | Paginated queue; returns a duplicate-candidate count per row, not the candidates |
| `GET /api/v1/admin/registrations/:id` | Full detail incl. payload |
| `POST /api/v1/admin/registrations/:id/approve` | Transactional: compare-and-set → `Actor` + crops + audit + status |
| `POST /api/v1/admin/registrations/:id/reject` | Structured reason + note |
| `POST /api/v1/admin/registrations/:id/dismiss-duplicate` | Per-candidate; FR-11 requires the judgement to persist |

**Frontend:** `(admin)/admin/registrations` (queue) + `admin/registrations/review?id=` (detail, query-param routing per static export); `RegistrationsTable`, `RegistrationDetailPanel`, `DuplicateWarningCard`, `ConsentRecordCard`, `ActivityTrail`, `RejectDialog`; a third `NAV_ITEMS` entry in `AdminSidebar.tsx`.

**Constitutional:** TRD §2 (module already added by 3a), §4 (+5 endpoints), §8 (adjudication authority), §12.5 (ADR for approve-to-publish); `docs/ux-ui/design.md` §2/§4 (+2 admin screens).

## 6. Non-Goals

- **Everything 3a owns** — the form, consent capture, OTP, receipt, status lookup, the four public endpoints, rate limiting, the payload cap, `MailService`, the logging module, the taxonomy widening.
- **Bulk approve / bulk reject.** The mockup shows it; it is excluded deliberately. Each publication is a consent decision (chunk-3 proposal R-6, user-confirmed).
- **Reviewer editing the submitted payload.** Excluded — the published record must be what the applicant consented to.
- **The information-request round-trip and withdrawal** — chunk 4 (`admin/registration-info-requests`).
- **GPS/district consistency validation** — needs a Tanzania administrative-boundary dataset the project does not have.
- **Internal notes thread** — the single `reviewNote` covers the applicant-facing message.
- **"Export queue (CSV)"** — a new PII-bearing export surface, unscoped.
- **A public "self-declared" badge** on approved actors — product decision, still open as epic OQ-3.

## 7. Carried-Forward Design Material

The split spec's design work is **not discarded**. `/akili-specify` for this path should start from `../../archive/2026-08-06-actors--public-self-registration/design.md` revision 2 (§2.4–2.5, §3.2, §4.6–4.8, §5.5–5.6, DD-6, DD-10) and its `requirements.md` FR-9…FR-13, rather than re-deriving. Both were audited; the audit outcomes below are the important inheritance.

### 7.1 Verified codebase facts (re-verified during Judgment Day, cite these)

| Fact | Citation |
|---|---|
| `logCreate` hardcodes `CREATE`; no method takes an action parameter | `actor-audit.service.ts:117-133`, `:127` |
| Audit methods all take `tx: Prisma.TransactionClient` | `actor-audit.service.ts` |
| `AcknowledgeDialog` is **required** for consent-granting submits; exposes `acknowledgementText` | `frontend/CLAUDE.md:26`; `AcknowledgeDialog.tsx:69` |
| `ConfirmDialog` hardcodes `bg-danger` on its confirm button — wrong for a publish action | `ConfirmDialog.tsx:245` |
| `traderId` is client-supplied with no pattern; no generator exists | `actors/dto/actor-create.dto.ts:42-44` |
| Chunk 2 fixed **eight** namespace prefixes: `OFB · OFS · OFG · BBB · HUM · DSP · SDC · QDS` | `docs/specs/archive/2026-08-05-import-export--partner-profile-onboarding/requirements.md:90` |
| `TZ-` **is** in use — 14 `TZ-SEED-*` rows | `backend/prisma/seed-data.ts` |
| `isConsentProvenanceSatisfied` is **tautological** when all four provenance values are set to satisfying constants — retain as drift protection, do **not** count it as a gate | `common/consent-provenance.policy.ts:81-119` |
| Every backend suite mocks `PrismaService`; `$transaction` is a pass-through with no rollback | `test/lambda-handler.e2e.spec.ts:51-53` |
| No global guard; guards are opt-in per controller | `app.module.ts` |

### 7.2 Findings this spec inherits and MUST resolve

**RA5 — SEVERE, verified, and it is this spec's problem.** Writing `REGISTRATION_APPROVE` into actor history reaches a frontend surface that cannot render it: `frontend/lib/api/actors-admin.ts:203` declares a hardcoded five-member union (`'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_CONSENT' | 'BULK_DELETE'`) and `ActorHistoryPanel.tsx`'s `actionBadgeClasses` switches those five with **no `default`**, returning `undefined`. `IMPORT` is *already* missing from both — **the drift is live in the repo today, which proves it degrades silently rather than erroring.** `frontend/CLAUDE.md:17` makes the exact-union mirror a review-failing rule. Both files must be in this spec's scope, with a gate; the actor-history read path has no action filter (`actors-admin.service.ts:362-368`).

**Open mechanism questions — state constraints, not invented mechanisms.** The parent spec's re-judgment showed that answering *"how?"* under audit pressure produces untestable claims. For each of these, record the constraint and the rejected options, and let the choice be made and evidenced during execution:

| Question | Constraint | Rejected, with reason |
|---|---|---|
| `traderId` allocation | Unique table-wide under concurrent approvals; a collision must surface as a recoverable `409` naming the key, never an unhandled `P2002` → `500`. Derivation from the unique `reference` (`REG-2026-0184` → `SR-2026-0184`) is unique among self-registered actors but **not** table-wide, because admin create accepts arbitrary keys | A `MAX()+1` scan under lock; a counter table (the parent spec specified one and never declared it — RA1) |
| Double approval | Impossible by construction, not by a read-then-check. A conditional status update whose zero-row result is the failure | Read-then-check (races; the race publishes two actors) |
| Publishable-subset projection | No payload field lacking an `Actor` column may reach any `Actor` column. `contactPerson` **must not** land on `Actor.position` — a job title, not a person's name. Gated by asserting fixture **values** absent from every column, not field names | Trusting the projection function's shape |
| Atomicity evidence | All writes inside one `$transaction`; a throw propagates unswallowed. **Real rollback is not gateable here** — every suite mocks Prisma. Record it as an accepted risk, do not claim a fault-injection gate | Claiming "fault injection, not inspection" (the parent spec did; it was unachievable) |

## 8. Requirement Delta Preview

### ADDED
- Admin queue, detail, three action endpoints, one dismissal endpoint.
- Two `ActorAuditAction` members + two additive `ActorAuditService` methods.
- Approve-to-publish transaction with consent provenance and audit.
- Structured rejection reasons.
- Per-candidate duplicate dismissal.
- Derived activity trail (read-only).
- Approval/rejection notifications via 3a's `MailService`.
- **Frontend audit-action union + badge map widened to cover the new actions** (and `IMPORT`, already drifted).

### MODIFIED
- `AdminSidebar` gains a *Registrations* entry.
- `RegistrationStatus`'s `APPROVED`/`REJECTED` become reachable.
- TRD §4/§8/§12.5; `docs/ux-ui/design.md` §2/§4.

### REMOVED
- Nothing.

## 9. Risks

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | **Irreversible publication.** Approval discloses another party's phone, email and exact GPS. There is no un-publish in this spec | `AcknowledgeDialog` typed gate re-validated server-side; the dialog names the policy version and acceptance date being attested to |
| **R-2** | **Partial adjudication** — an orphan `Actor` or an approved registration with no actor | One `$transaction`, compare-and-set first. Evidence limits recorded honestly (§7.2) |
| **R-3** | **Wrong projection publishes a natural person's name** | Value-asserted gate (§7.2) |
| **R-4** | **Silent audit-history degradation** (RA5) | Both frontend files in scope, with a gate. Fixing `IMPORT` at the same time is nearly free |
| **R-5** | **Reviewer workload** if the named cohort registers in a burst (100+) | Segments, oldest-first, indexed queue. Bulk adjudication excluded — workload does not override the consent argument |
| **R-6** | **Duplicates against chunk 2's ~1,300 imported actors** | Per-candidate detection and dismissal; duplicate as a first-class rejection reason |
| **R-7** | **Retention of rejected registrations** — PII for organisations never published | Unresolved; ties to PRD OQ-4. Carry as an accepted risk, do not invent a policy |

## 10. Success Criteria

- An Admin publishes a pending registration and the created `Actor` carries `SELF_REGISTERED` / `GRANTED` / `PORTAL_CHECKBOX` / the stored acceptance time / the reference — with an audit row, atomically.
- A forced failure mid-transaction leaves no `Actor`, no status change, no audit row (to the limit §7.2 records as gateable).
- **No** payload field lacking an `Actor` column appears in any column of the created actor, asserted by value.
- A rejected registration produces no `Actor`, and its note is readable through 3a's lookup with email delivery disabled.
- Double approval returns `409` and creates no second actor.
- `Staff` receives `403` on every endpoint here.
- The created actor's history renders both new actions with correct labels and badges.
- Gates green in `backend/` and `frontend/`, including `pii-boundary.spec.ts` and `lambda-handler.e2e.spec.ts`.

## 11. Visual Reference

- **Source:** the client mockup strip at `../../archive/2026-08-06-actors--public-self-registration/mockup/self-registration-flow.png` — the admin panels (queue with status chips, registration detail, approve-and-publish modal with typed confirmation, reject modal with reason dropdown, result banners).
- **Flow-authoritative, copy-provisional** (the client stated it is approximate).
- **Panels deliberately not implemented**, decided during chunk 3's specify and carried here: the bulk action bar, *"Edit before approving"*, the GPS/district *"Falls inside Hai district"* check, the internal-notes card, *"Export queue (CSV)"*, and the `Awaiting applicant` segment (chunk 4).

## 12. Next Step

Only after chunk 3a is executed:

```text
/akili-specify admin/registration-review-queue
```

Start from the carried-forward material in §7 rather than re-deriving, and open a **fresh Judgment Day lineage** for this design — §7.2's open mechanism questions are exactly what a new lineage's two fix rounds are for.
