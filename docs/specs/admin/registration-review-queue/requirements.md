# Requirements — Registration Review Queue & Approve-to-Publish

## Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/admin/registration-review-queue/` |
| Status | **Draft — awaiting Phase 1 approval** |
| Author / Date | AKILI (`/akili-specify`, T1) · 2026-09-01 |
| Depth | **Full** (proposal §1; re-checked against the design at Step 2.4) |
| Approval Mode | **gated** — every phase pause is real, none auto-passes |
| Parent epic | `docs/specs/epic/hybrid-actor-registration/` — chunk **3b of 5** |
| Depends on | `actors/public-self-registration` (3a) — **satisfied**, archived `docs/specs/archive/2026-08-06-actors--public-self-registration/` |
| Related | `docs/prd.md` §5.7/§6 US-9/§7 AC-8 · `docs/ux-ui/design.md` §2/§4/§5 · `docs/trd/trd.md` §2/§3.1/§4/§8/§12.5 ADR-004+ADR-010/§13 QA-3+QA-12 |
| Carried-forward source | 3a `requirements.md` FR-9…FR-14, `design.md` §2.4–2.5/§3.2/§4.5–4.9/§5.5–5.6/DD-6/DD-9/DD-10, `judgment.md` |

---

## 1. Summary

Chunk 3a shipped the applicant half of self-registration: a public form, OTP verification, versioned consent, and a `Registration` row that no one can act on. **This spec builds the adjudication half** — the Admin queue, the review screen, and the approve-to-publish transaction that turns an accepted submission into a public `Actor`.

It advances **PRD US-9** and closes the half of **PRD §5.7** that 3a deliberately left open (*"the submission is stored with no public read path for any field until an Admin approves or rejects it"* — 3a built the storage, this spec builds the approving).

**Its dominant risk is not the one 3a carried.** 3a's risk was unauthenticated writes and unapproved PII at rest, gated by `pii-boundary.spec.ts` over public paths. This spec's risk is the **irreversible publication of another party's personal data** — one transactional write path that discloses an organisation's phone, email and exact GPS to the public directory, with no un-publish anywhere in scope. The gates here are transactional-integrity and projection-correctness gates, and §8 states plainly which of them do not exist.

---

## 2. Requirement Numbering & Writing Standards

- Functional requirements are **`FR-n`**, non-functional **`NFR-n`**, defect classes **`DC-n`**, design-relevant decisions **`D-n`**.
- **ID numbering is continuous with chunk 3a's, never restarted and never reused with a different meaning.** FR-9…FR-14 are inherited from `docs/specs/archive/2026-08-06-actors--public-self-registration/requirements.md`, where they were retained unrenumbered *because* `judgment.md`'s finding ledger, the epic's decomposition table and this spec's `proposal.md` §7 all cite those IDs. Renumbering them here would break the same audit trail from the other end — the exact KZ-004 failure mode. New requirements therefore start at **FR-16** (3a used FR-1…FR-15) and new defect classes at **DC-27** (3a used DC-1…DC-26).
- Each requirement is atomic, testable and unambiguous, traces upward to a PRD story/AC and downward to a task in `tasks.md`.
- **MUST / SHOULD / MAY** per RFC 2119.
- **Cite stable anchors, not line numbers (KZ-009).** Every code citation in this document names a **symbol, a unique literal string, or a section title**. Bare `file:line` appears nowhere; it decays on the first edit above it, including edits made by the task that cites it.
- **Reconcile figures against prose (KZ-005).** Every count in this document (five endpoints, two audit members, seven requirements, fourteen payload fields) is cross-checked against the sentences around it and against `design.md` before publication.

---

## 3. Glossary

| Term | Meaning here |
|---|---|
| **Registration** | One `Registration` row — a submitted, email-verified, consent-accepted application. Not an `Actor`. Never public. |
| **Adjudication** | An Admin's terminal decision on a registration: approve (publish) or reject. |
| **Publication** | The act of creating a public `Actor` from an approved registration. Irreversible within this spec. |
| **Publishable subset** | The payload fields that have an `Actor` column and are carried onto the created actor. See FR-12's projection table. |
| **Review context** | Payload fields with **no** `Actor` column (`contactPerson`, `otherCrops`) — shown to the reviewer, never published. |
| **Duplicate candidate** | An existing `Actor` that a read-time comparison flags as possibly the same organisation. A warning, never a verdict. |
| **Dismissal** | A reviewer's recorded judgement that one named candidate is *not* a duplicate. Per candidate, persisted. |
| **Acting admin** | The reviewer's identity resolved **server-side** from the JWT `sub` via `ActingAdminResolver`, never client-supplied. |
| **Reference** | The applicant-facing key, `REG-<year>-<4-digit>`. Quoted in every notification and in the status lookup. |

---

## 4. System Context & Scope

### 4.1 What exists after 3a

Verified in this working copy on 2026-09-01. Each row is the fact this spec builds on, cited by symbol.

| Fact | Where |
|---|---|
| `Registration` declares **every** adjudication column 3b writes — `publishedActorId`, `reviewedBySub`, `reviewedByEmail`, `reviewedAt`, `rejectionReason`, `reviewNote`, `duplicateDismissals` | `model Registration` in `backend/prisma/schema.prisma` |
| `RegistrationStatus` already carries `APPROVED` and `REJECTED`; this spec makes them reachable | `enum RegistrationStatus`, same file |
| The queue's access pattern is already indexed | `@@index([status, createdAt])` on `Registration` |
| `MailService` with an SES transport and a **no-op** transport selected by `MAIL_TRANSPORT` | `backend/src/mail/` |
| The Lambda environment carries `MAIL_TRANSPORT`, `MAIL_SENDER_ADDRESS`, `OTP_HMAC_SECRET` and an `ses:SendEmail` policy — **3a's open blocker T3-A1 is closed** | `infra/20-backend/template.yaml` |
| `AcknowledgeDialog` exists and exposes `acknowledgementText` | `frontend/components/admin/AcknowledgeDialog.tsx` |
| The Admin controller pattern this spec copies: class-level `@Controller('admin/actors')` + `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')` | `backend/src/actors/admin-actors.controller.ts` |
| Audit rows are written inside the caller's `$transaction`; every method takes `tx: Prisma.TransactionClient` | `ActorAuditService` in `backend/src/actors/actor-audit.service.ts` |
| The acting admin's email is resolved server-side from `sub` | `ActingAdminResolver` |

### 4.2 What this spec adds

- **Five Admin endpoints** under `/api/v1/admin/registrations` (list · detail · approve · reject · dismiss-duplicate).
- **Two admin screens**: the queue and the review detail, plus a third `NAV_ITEMS` entry in `AdminSidebar.tsx`. `docs/ux-ui/design.md` §2's IA and §4's screen inventory gain both.
- **Two `ActorAuditAction` members** and two additive `ActorAuditService` methods.
- **The frontend audit-action union and badge map**, widened to cover them — and `IMPORT`, which is already drifted (FR-16).

### 4.3 What this spec is not

3a's public surface is finished and out of scope in its entirety (§11). This spec adds **no public path**, and the `Registration` row remains unreadable by `Public` before and after adjudication — the created `Actor` is the only public artifact an approval ever produces.

---

## 5. Stakeholders / Personas

| Persona | Role | Stake in this spec |
|---|---|---|
| **Administrator** (program lead, data manager) | `Admin` | The only actor who can reach anything here. Adjudicates, and personally carries the consequence of an irreversible publication. |
| **Field/Data-entry staff** | `Staff` | **Explicitly excluded.** Every endpoint returns `403`. Publication is a consent decision, not a data-entry action. |
| **Applicant** (prospective actor) | anonymous | Never reaches this surface. Learns the outcome through 3a's status lookup by reference, or a notification email. |
| **Public visitor** | `Public` | Sees only the published `Actor`, and only after an Admin acted. Never sees a `Registration`. |
| **The organisation being published** | — | Not a system user, and the party whose PII this spec discloses. R-1 exists for them. |

---

## 6. Functional Requirements

> **FR-9…FR-14 are inherited and pre-audited.** Each was reviewed by two blind judges during 3a's Judgment Day; the findings against them (C-1, C-7, C-12, S-2, S-3, S-4, S-7, A19·B22, RA1–RA5) are recorded in `docs/specs/archive/2026-08-06-actors--public-self-registration/judgment.md`. Amendments made during that review are carried here **in their amended form** and marked. **FR-15 is 3a's and is closed** — the frontend trader taxonomy was completed there; it is not an obligation of this spec.

---

### FR-9: Admin registrations queue

- **Description:** `Admin` MUST have a paginated, filterable, sortable queue of registrations with status segmentation, following the conventions of the existing admin actors console.
- **Rationale / Source:** Proposal §4.1; PRD US-9; epic outcome 4; mockup queue panel; R-5 (a burst from the named cohort could exceed 100 submissions).
- **PII/RBAC impact:** Admin-only. Queue rows render organisation name and contact-person name, which are payload fields — so the endpoint is Admin-guarded and serialized by an **admin** serializer, never the public one (`docs/trd/trd.md` §8).

#### Scenario: Queue lists and segments by status

- GIVEN registrations in several statuses
- WHEN an Admin opens the queue
- THEN rows show reference, applicant, type, region, submitted date, duplicate flag, status, and a review action
- AND status segments are available for the statuses this chunk can actually produce — `PENDING_REVIEW`, `APPROVED`, `REJECTED`
- BUT it must NOT present a segment or control for `AWAITING_APPLICANT` or `WITHDRAWN`, which chunk 4 makes reachable — a control that can never return a row is a presence without a behaviour (KZ-002)
- AND IT MUST NOT present a *"No email"* flag: email is required and OTP-verified (3a FR-4), so the state the mockup's flag describes cannot occur

#### Scenario: Sorted oldest-first by default

- GIVEN a queue with submissions of differing ages
- WHEN it first loads
- THEN the oldest pending submission is first, so the longest-waiting applicant is reviewed first
- AND IT MUST keep filter, sort and page state in the URL, so a reviewer can share or resume a queue view (`docs/trd/trd.md` §6; `frontend/CLAUDE.md` query-param routing)

#### Scenario: Only Admin reaches it

- GIVEN an authenticated `staff` user
- WHEN they call **any** of this spec's five admin endpoints
- THEN the response is `403` with the standard `{ statusCode, message, error }` envelope
- BUT it must NOT leak whether the requested registration exists — the `403` for a real id and an invented id are indistinguishable
- AND IT MUST NOT rely on the client-side route guard for this: enforcement is server-side (`docs/trd/trd.md` §8, QA-3), and `frontend/CLAUDE.md` states in terms that `RequireRole` is convenience only
- AND IT MUST return `401`, not `403`, for an anonymous caller

#### Scenario: Page beyond the result set

- GIVEN a queue whose result set is smaller than the requested page
- WHEN the page loads
- THEN the empty state distinguishes *"nothing matches this filter or page"* from *"there are no registrations at all"*
- AND IT MUST NOT claim the queue is empty when it is not — the identical defect is open on the actors table as chunk 1's carried-forward R-7, and this spec introduces a second URL-paged surface where it would recur

#### Scenario: The queue is reachable from the admin shell

- GIVEN an Admin signed into the admin console
- WHEN they read the sidebar
- THEN a *Registrations* entry is present and navigates to the queue
- AND IT MUST inherit the admin shell's existing gate rather than add a new one: `app/(admin)/layout.tsx` already wraps the whole shell in `RequireRole allow={['Admin']}`, so `Staff` never reaches the sidebar at all
- BUT it must NOT introduce per-item role gating on `NavItem`, whose shape is `{ label, href, enabled }`. Widening it would build a mechanism the shell makes redundant

---

### FR-10: Admin registration detail with the consent record and an activity trail

- **Description:** `Admin` MUST be able to see every submitted field of one registration, the consent record, the duplicate assessment, and a read-only activity trail, on one screen, before adjudicating.
- **Rationale / Source:** Proposal §4.2; mockup detail panel; user decision 2026-08-04 to include the activity trail and exclude internal notes, payload editing, and the location-consistency check (D-4, D-5, D-6).
- **PII/RBAC impact:** This is the one screen that renders the full PII-bearing payload. Admin-only, admin serializer, never reachable by `Public` or `Staff`.

#### Scenario: Full payload is shown for review

- GIVEN a pending registration
- WHEN an Admin opens its detail
- THEN every submitted field is displayed, including the fields that have no `Actor` column
- AND fields with no `Actor` column are marked as **review context that will not be published**, so a reviewer is not misled into thinking they will appear on the public profile
- AND IT MUST show the reference code, so the reviewer can quote it in any out-of-band contact

#### Scenario: Consent record is legible

- GIVEN a registration whose consent was accepted
- WHEN the Admin reads the consent block
- THEN it states the consenting party, the policy version, and the acceptance timestamp
- AND IT MUST render the timestamp in a form that names its timezone, because an adjudicator comparing an acceptance time to a policy publication time cannot do so from an ambiguous local string
- AND IT MUST label that timestamp as **recorded at submission**, not as an independently attested acceptance moment — the `Registration` model's own comment records that the contract collects no client acceptance timestamp by design, making the stored value an **upper bound** on the applicant's true acceptance moment

#### Scenario: Activity trail is derived, not authored

- GIVEN a registration that was submitted, whose consent was recorded, and which has since been adjudicated
- WHEN the Admin reads the activity trail
- THEN it lists those events with timestamps, in order
- AND it lists a *"cleared as not a duplicate"* event when that judgement has been recorded, since that judgement **is** stored
- BUT it must NOT be a writable log or a note thread — internal notes are out of scope (§11)
- BUT it must NOT claim a duplicate *check* occurred at a particular time. Detection runs at read time and is never persisted, so no such timestamp exists; presenting one would be a fabricated entry in the one surface whose purpose is an auditable consent trail
- AND IT MUST be derived from fields the registration already stores, so it cannot disagree with the record it describes

> **Amended 2026-08-05 — 3a Judgment Day S-4, carried in amended form.** The original required a timestamped duplicate-check event *and* derivation from stored fields only. Those clauses were mutually unsatisfiable: nothing stores a check time. Corrected rather than adding a column, because the derivation constraint is the one carrying the audit value.

---

### FR-11: Duplicate detection warns the reviewer; it never decides

- **Description:** At review time the system MUST surface candidate matches between the submission and existing actors, as a warning with enough context to adjudicate. It MUST NOT block, reject, merge, or auto-approve on the basis of a match.
- **Rationale / Source:** Proposal §4.5, R-6 (chunk 2 imported ~1,300 actors under namespaced keys); mockup detail and queue flag.
- **PII/RBAC impact:** The comparison reads `phone` and `email` of existing actors. Admin-only, and no result is ever surfaced publicly (3a FR-8).

#### Scenario: Candidate match is surfaced with context

- GIVEN a submission whose phone number matches an existing actor
- WHEN an Admin opens the detail
- THEN a warning names the number of candidates and, for each, the matching attribute and enough identity to judge it
- AND the queue row carries a corresponding flag so a reviewer can spot it before opening
- BUT it must NOT prevent approval, and it must NOT pre-select rejection
- AND IT MUST allow the reviewer to record that a candidate is **not** a duplicate, so the warning does not reappear identically at every subsequent visit

#### Scenario: Dismissal is per candidate and it persists

- GIVEN a registration with three duplicate candidates, one of which the reviewer has dismissed
- WHEN the detail is reloaded, in this session or a later one
- THEN the dismissed candidate is no longer presented as an open warning and the remaining two still are
- BUT it must NOT be row-level — dismissing one candidate must NOT suppress the others, which is what `duplicateDismissals` being a **per-candidate** structure exists to prevent
- AND IT MUST record who dismissed it and when, so the activity trail's *"cleared as not a duplicate"* entry is derived from a real stored fact rather than fabricated

#### Scenario: Duplicate is a first-class rejection reason

- GIVEN a reviewer who has confirmed a submission duplicates an existing record
- WHEN they open the reject action
- THEN *"Duplicate of an existing registry record"* is an available reason
- AND IT MUST be recorded as the structured reason, not only as free text, so duplicates are countable later

---

### FR-12: Approve and publish — atomic, gated, audited

- **Description:** Approving a registration MUST, in a single transaction, create an `Actor` carrying the correct consent provenance, mark the registration approved with a link to the created actor, and write an audit entry. The action MUST be gated behind a typed acknowledgement that consent is on file. A failure at any step MUST leave no partial result.
- **Rationale / Source:** Proposal §4.3, §9 R-1/R-2/R-3; chunk 1 FR-2/FR-3 (provenance invariant on every consent write path); `backend/CLAUDE.md` (audit inside the same `$transaction`); archived `admin/bulk-actor-operations` (typed acknowledgement); mockup approve modal.
- **PII/RBAC impact:** **This is the moment private data becomes public.** `Admin` only. It writes `consentStatus = GRANTED`, precisely the state `docs/trd/trd.md` ADR-004 makes publishable — so the acknowledgement gate is the human checkpoint on an irreversible disclosure.

#### Scenario: Approval publishes with correct provenance

- GIVEN a pending registration whose consent is recorded
- WHEN an Admin approves it after entering the acknowledgement exactly
- THEN an `Actor` is created with `registrationSource = SELF_REGISTERED`, `consentStatus = GRANTED`, `consentMethod = PORTAL_CHECKBOX`, `consentObtainedAt` equal to the stored `consentAcceptedAt`, and `consentReference` equal to the registration reference
- AND the registration's status becomes `APPROVED` and records `publishedActorId`, `reviewedBySub`, `reviewedByEmail` and `reviewedAt`
- AND an audit entry is written attributing the action to the acting admin resolved **server-side** via `ActingAdminResolver`, never from the request body
- AND only the publishable subset of the payload is written to the `Actor`
- AND IT MUST satisfy chunk 1's consent-provenance invariant rather than bypass it — this is a fifth consent write path and goes through the same shared check (D-11)

#### Scenario: The publishable subset is exactly this, and nothing else

- GIVEN the submitted payload, whose fields are fixed by `RegistrationPayloadDto`
- WHEN the projection runs
- THEN each field lands only where this table says, and the two review-context fields land nowhere:

| Payload field | `Actor` column | Published |
|---|---|---|
| `traderName` | `traderName` | yes |
| `traderType` | `traderType` | yes |
| `contactPerson` | — | **NO — no column exists** |
| `position` | `position` | yes |
| `district` | `district` | yes |
| `marketLocation` | `marketLocation` | yes |
| `sex` | `sex` | yes |
| `region` | `region` | yes |
| `gpsLatitude` / `gpsLongitude` | same names | yes |
| `crops[]` | `CropsOnActors` | yes |
| `otherCrops` | — | **NO — no column exists** |
| `capacityTons` | `capacityTons` | yes |
| `phone` | `phone` | yes |
| *(`Registration.submitterEmail`, not a payload field)* | `email` | yes |

- BUT `contactPerson` **must NOT** land on `Actor.position`. `position` is a job title; `contactPerson` is a named natural person, and publishing it puts an individual's name in the public directory. **The trap is adjacency, not similarity:** `contactPerson` and `position` are neighbouring fields of the same DTO, so a hand-written mapping that "fills in" an absent `position` from `contactPerson` is a one-line, plausible-looking change
- AND IT MUST leave `technicalSupport`, `gpsAltitude` and `gpsAccuracy` null — the payload has no source for them and inventing one would publish a value no applicant supplied
- AND IT MUST be gated by asserting fixture **values** absent from **every** column of the created actor, not by asserting field names — a renamed target must still fail the gate

#### Scenario: The acknowledgement gate is real

- GIVEN an Admin in the approve modal
- WHEN the acknowledgement text has not been entered exactly
- THEN the confirm action is unavailable
- AND the modal states what approval will do — that it creates an actor and publishes contact details and coordinates to the public directory
- BUT the gate **must NOT** be client-only: a crafted request that omits or misspells the acknowledgement is rejected server-side
- AND IT MUST name the policy version and acceptance date the reviewer is attesting to, so the acknowledgement is about a specific consent record rather than a general belief
- AND IT MUST use `AcknowledgeDialog` and not `ConfirmDialog`: `frontend/CLAUDE.md` makes `AcknowledgeDialog` **required** before any submit that sets `consentStatus` to `GRANTED`, and `ConfirmDialog` additionally hardcodes its confirm button as `bg-danger` — a destructive red button on a publish action

#### Scenario: Atomicity under failure

- GIVEN an approval where actor creation succeeds and the audit write then fails
- WHEN the transaction resolves
- THEN nothing is committed: no `Actor`, no status change, no audit row
- BUT it must NOT leave an orphan `Actor` published without an approved registration behind it, and it must NOT leave a registration marked approved with no actor
- AND IT MUST be structurally provable: every write sits inside one `$transaction` callback, a throw at any step propagates unswallowed, and no `catch` absorbs it

> **Amended 2026-08-05 — 3a Judgment Day S-3, carried in amended form.** The clause previously demanded proof *"by a test that forces the failure, not asserted from reading the transaction boundary."* **DC-24 declares that unachievable in this repo** — every backend suite substitutes an in-memory Prisma mock and `lambda-handler.e2e.spec.ts` implements `$transaction` as a pass-through with no rollback semantics. The document was asserting and denying the same gate in two places. The clause now demands what *is* provable; §8 DC-24 records what is not.

#### Scenario: Double approval is refused

- GIVEN a registration already approved
- WHEN an approval is submitted for it again
- THEN it is refused with `409` and the standard envelope
- AND IT MUST NOT create a second `Actor`
- AND IT MUST be impossible **by construction, not by a read-then-check**: a conditional status update whose zero-row result *is* the refusal. A read-then-check races, and the race publishes two actors — two public records of one organisation, from one act of consent

#### Scenario: The generated natural key does not collide

- GIVEN chunk 2 imported actors under namespaced natural keys
- WHEN an approval generates a `traderId` for a self-registered actor
- THEN the generated key is unique across the whole table and distinguishable from every imported namespace
- BUT it must NOT reuse a prefix chunk 2 already claimed. Chunk 2 fixed **eight** — `OFB · OFS · OFG · BBB · HUM · DSP · SDC · QDS` — and it must not be the mockup's `TZ-`, which `backend/prisma/seed-data.ts` already uses as `TZ-SEED-*`
- AND IT MUST be generated server-side, never supplied by the applicant — `traderId` is a non-public identifier the applicant has no business choosing
- AND IT MUST handle a collision as a recoverable, explained error naming the colliding key, never an unhandled fault. `ActorCreateDto` accepts **any** client-supplied `traderId` with `@IsString() @MinLength(1)` — no pattern, no reserved prefixes — so a colliding key can pre-exist by admin creation. An unhandled Prisma `P2002` inside the approval transaction would surface as a `500` and leave that registration **permanently unapprovable with no operator path forward**

> *3a Judgment Day S-2 falsified the claim that a reference-derived key is collision-free "by construction". Prefix count corrected six → eight; the `TZ-` availability claim retracted.*

---

### FR-13: Reject with a structured reason; no actor is created

- **Description:** Rejecting a registration MUST record a structured reason and an optional note to the applicant, MUST NOT create an `Actor`, and MUST be audited.
- **Rationale / Source:** Proposal §4.4; mockup reject modal.
- **PII/RBAC impact:** `Admin` only. The note is later readable by the applicant through 3a's status lookup, so it is **applicant-facing text** and must be treated as such — it is the one `Registration` field the public surface may return.

#### Scenario: Rejection is terminal for this chunk

- GIVEN a pending registration
- WHEN an Admin rejects it with a reason
- THEN its status becomes `REJECTED`, the reason and note are stored, and an audit entry is written
- AND the interface states that rejection cannot be undone from that screen and that the applicant must submit again
- BUT it must NOT create an `Actor`, publish any field, or alter the stored consent record
- AND IT MUST make the reason mandatory, because a rejection with no recorded reason is unauditable and leaves the applicant nothing actionable
- AND IT MUST refuse a second adjudication of an already-adjudicated registration by the same conditional-update construction as FR-12, returning `409`

#### Scenario: The note reaches the applicant through the fallback channel

- GIVEN a rejected registration carrying a note
- WHEN the applicant looks it up by reference and email through 3a's public lookup
- THEN the status and the note are returned
- AND IT MUST work with email delivery disabled, since the note is the only explanation the applicant gets and email is a known-unreliable channel in this project
- BUT it must NOT cause that public response to carry anything beyond `status` and `reviewNote` — the reason code, the reviewer's identity and the payload stay admin-only

---

### FR-14 (adjudication slice): Decision notifications carry the reference and are never the only channel

> **Scope.** 3a owns FR-14's submission message and built `MailService`. **This spec owns the approval and rejection messages only** — the slice 3a's archive summary records as straddling the boundary. The requirement's text is 3a's; what follows are the scenarios this spec must satisfy.

- **Description:** The system SHOULD email the applicant on approval and on rejection. Every message MUST carry the reference code. **No part of adjudication MAY depend on email delivery for correctness.**
- **Rationale / Source:** Proposal §4.6; epic A-3/R-3 — admin invites were converted to a no-email temporary-password handoff because `@cgiar.org` mail did not arrive (`backend/CLAUDE.md`).
- **PII/RBAC impact:** Messages are addressed to the verified `submitterEmail` and MUST NOT include another registration's data. Message bodies MUST NOT be logged.

#### Scenario: A send failure does not roll back an adjudication

- GIVEN an approval whose notification send fails
- WHEN the operation completes
- THEN the `Actor` is published and the registration is approved
- AND IT MUST NOT place the send inside the adjudication transaction, since a mail-provider outage would then block publication entirely
- AND IT MUST dispatch **after commit**, never before it — a message announcing a decision that then rolls back is worse than no message

#### Scenario: The whole outcome path works with email disabled

- GIVEN `MAIL_TRANSPORT` set to the no-op transport
- WHEN an Admin approves one registration and rejects another
- THEN both adjudications succeed and both applicants can still learn the outcome by looking up the reference they hold
- AND IT MUST log the send attempt and its outcome in a way an operator can find, since a silently dropped notification is otherwise indistinguishable from a delivered one
- BUT it must NOT log the message body, the applicant's email address, or any payload field

---

### FR-16: The audit-action taxonomy is widened end-to-end, backend and frontend

- **Description:** Adding `REGISTRATION_APPROVE` and `REGISTRATION_REJECT` MUST widen **every** surface that enumerates audit actions — the Prisma enum, the audit service, the frontend type union, and the badge/label map — in the same change. The frontend union MUST also gain `IMPORT`, which the backend already emits and the frontend already fails to render.
- **Rationale / Source:** Proposal §7.2 **RA5**, a SEVERE finding verified against this working copy on 2026-09-01. `frontend/CLAUDE.md` makes the exact-union mirror a review-failing rule: *"Types mirror backend contracts EXACTLY — exact string-literal unions."*
- **PII/RBAC impact:** None directly. The audit history surface is already Admin-only.

#### Scenario: The live drift is closed, not merely avoided

- GIVEN `ActorAuditAction` in `backend/prisma/schema.prisma` carries `IMPORT`, and `ActorAuditService.logImport` writes rows with it
- WHEN the frontend renders an actor's history
- THEN every action the backend can emit renders with a correct label and badge
- BUT it must NOT be true, as it is today, that `AuditEntry['action']` in `frontend/lib/api/actors-admin.ts` declares a five-member union omitting `IMPORT` while `actionBadgeClasses` in `ActorHistoryPanel.tsx` switches those five with **no `default` branch** and returns `undefined` for anything else
- AND IT MUST fail loudly rather than silently for a future unknown action — the current shape degrades to an unstyled badge, which is precisely why this drift survived undetected since the import spec shipped
- AND IT MUST be gated by a test that **fails against the pre-change code**, per KZ-002's third recurrence: a gate that cannot fail is not a gate

#### Scenario: An approval is visible in its actor's history; a rejection is not misfiled

- GIVEN an approved registration that created an `Actor`
- WHEN an Admin opens that actor's history
- THEN the `REGISTRATION_APPROVE` row is present, labelled and badged, carrying the real actor's identity
- AND IT MUST NOT be excluded from actor history — that row is the audit trail for this spec's most consequential write
- BUT a `REGISTRATION_REJECT` row must NOT appear in any actor's history: it has no actor, so it is written with `actorId` = the **registration** id. `ActorAuditLog.actorId` is deliberately FK-less, so this bends no constraint — but any query joining audit rows to actors must account for it

---

## 7. Non-Functional Requirements

> NFR IDs continue 3a's numbering (§2). NFR-1, NFR-2, NFR-3, NFR-5, NFR-6, NFR-7, NFR-8, NFR-9 and NFR-10 are **re-scoped to this spec's surface**, not redefined. NFR-11 is new.

| ID | Requirement | Measure |
|---|---|---|
| **NFR-1** | **PII boundary, extended to this spec's routes (release gate).** No public path returns any `Registration` payload field, `submitterEmail`, internal `id`, reviewer identity, or rejection reason code. Every route this spec adds MUST be covered by the module-scoped route-totality assertion in `pii-boundary.spec.ts`, classified as admin-gated rather than merely absent. | Zero occurrences of fixture **values** for those fields on every public path, over HTTP. The `FIXTURE_MAP` totality assertion is **bidirectional** and derives its route set from `MODULE_METADATA.CONTROLLERS` — 3a's T-13 rework made it module-scoped **specifically so this spec's admin controller cannot land uncovered**, proven there by adding a throwaway second controller and observing the named failure. **Build fails on violation.** |
| **NFR-2** | **Consent integrity at publication.** The published `Actor` carries the stored acceptance moment verbatim; nothing is re-derived at approval time. | For an approved registration, `Actor.consentObtainedAt` equals `Registration.consentAcceptedAt` **exactly**, `consentMethod = PORTAL_CHECKBOX`, `consentReference` = the reference, `registrationSource = SELF_REGISTERED`. Asserted by value on the created actor. |
| **NFR-3** | **Adjudication atomicity.** Approval is all-or-nothing across actor creation, crop links, status change and audit. | **Gated:** every write occurs inside one `$transaction` callback; a throw at any step propagates and is not swallowed; a forced throw leaves the mock's write set empty downstream of it. **Not gated:** that MySQL actually rolls back — the harness mocks Prisma (DC-24). Stating both is the requirement; claiming the second would be a false gate on this spec's one irreversible operation. |
| **NFR-5** | **Accessibility (WCAG 2.1 AA)** on the two new screens and every new component: keyboard operable, visible focus, labelled controls, `aria-describedby` field errors, live-region result announcement. | `jest-axe` clean **for the rules jsdom can evaluate**. Contrast, focus order and focus visibility are **explicitly not covered** by that gate — see §8 DC-16. |
| **NFR-6** | **Token conformance.** No hardcoded colours, radii, shadows or durations in new components. | Every value resolves to a token from `docs/ux-ui/design.md` §7 via `tailwind.config.ts`. Zero hex literals in new frontend files, grep-verifiable. `danger` is reserved for destructive semantics and MUST NOT style the publish action. |
| **NFR-7** | **Static-export conformance.** No SSR, ISR, dynamic path segment, or Next route handler is introduced. | `cd frontend && npm run build` succeeds under `output: 'export'`. The detail screen uses the query-param pattern (`admin/registrations/review?id=`) inside a `<Suspense>` boundary, never a `[id]` directory (`frontend/CLAUDE.md`). |
| **NFR-8** | **Observability without PII.** Every adjudication request emits one structured log line; no line carries a payload field, an email address or a phone number. | Structured entries carry request id, route, method, status, role and latency. **The obligation has a specific wiring trap:** `RegistrationsModule.configure()` applies `RequestContextMiddleware` via `forRoutes(RegistrationsController)` — one named class. A second controller added to that module emits **nothing** unless it is added to that call. A test asserts a line is emitted for an admin adjudication route, and that PII fixture values are absent from it. |
| **NFR-9** | **Queue performance.** The queue stays paginated and indexed at the volume R-5 anticipates. | The query uses the `@@index([status, createdAt])` access pattern and is never unbounded; `pageSize` is capped (frontend clamps at 100 per `frontend/CLAUDE.md`, server rejects above it). **No numeric latency budget is set** — consistent with `docs/trd/trd.md` OQ-TRD-1, which records that QA-5 has no agreed p95. Inventing one here would be a figure with no measurement behind it. |
| **NFR-10** | **Email independence for outcomes.** Every applicant-visible outcome of an adjudication is reachable without email. | With the no-op transport selected, an applicant holding a reference reaches status and outcome — including a rejection note — with no mail delivered. |
| **NFR-11** | **Type fidelity of the audit-action contract (new).** The frontend audit-action union is exactly the backend enum — same members, same spelling, no widening to `string`. | A test derives or asserts the union against the backend's enum member list and fails on any divergence, **demonstrated to fail against the pre-change code** where `IMPORT` is missing. `frontend/CLAUDE.md` records that loosening such a union has FAILed reviews before. |

---

## 8. Defect Classes & Their Gates

**A gate blind to the defect class this spec most often produces is not a gate.** This spec's dominant class is *wrong or over-broad publication* — and two of its three worst failures have **no automated gate at all**. That is stated here rather than papered over.

### Classes with a real gate

| # | Defect class | Gate |
|---|---|---|
| **DC-6** | Approval writes wrong consent provenance | Backend test asserting all four provenance fields on the created `Actor`, **by value**. This is the whole gate — the `isConsentProvenanceSatisfied` call is retained as drift protection and is **not** counted as a gate, because with all four values set to satisfying constants it cannot return false (3a A22·B31) |
| **DC-7** | Generated `traderId` collides with a chunk-2 imported key, or with an admin-created key | Test over the generation function against all **eight** namespaces; a `P2002`-to-`409` test for the pre-existing-key case; the `@unique` constraint as backstop |
| **DC-8** | An admin endpoint is reachable by `Staff` or anonymous | Guard test per endpoint returning `403`/`401`, independent of the serializer (QA-3). Five endpoints × two callers |
| **DC-23** | **A non-publishable payload field reaches the created `Actor`** — most plausibly `contactPerson` → `Actor.position`, publishing a named natural person | Backend test asserting, on the actor created by approval, that no review-context fixture **value** appears in **any** column — by value, not by field name, so a renamed target still fails. **This is the highest-value gate in the spec** |
| **DC-25** | A queue index is dropped or split silently | Partially gated: the `where`/`orderBy` shape is asserted. Index *usage* is not — see the accepted-risk table |
| **DC-27** | **The frontend audit-action union or badge map drifts from the backend enum** (RA5 — live in the repo today for `IMPORT`) | NFR-11's test, **run against the pre-change code and shown to fail there**. Plus `npx tsc --noEmit`, since a total `Record<Action, …>` map turns a missing member into a compile error — note `next/jest` uses SWC and does **no** type checking, so `npm test` alone does not catch it |
| **DC-28** | **A route this spec adds escapes the PII release gate** — or the gate fails because the new admin routes legitimately return payload data and `FIXTURE_MAP` has no way to say so | The bidirectional totality assertion fails by name for an uncovered route. The fixture entries for admin routes must assert **`401`/`403` for non-Admin callers with zero fixture values in the body**, not public-cleanliness of an Admin response. Proven by adding a throwaway route and observing the named failure, then removing it |
| **DC-29** | **Adjudication requests emit no structured log line**, because `forRoutes(RegistrationsController)` was not extended to the new controller | Test asserting one line is emitted for an admin adjudication request through a real HTTP pipeline. This is the DC-22 shape recurring: a silent observability gap, not an error |
| **DC-30** | **Double approval publishes two actors** under a read-then-check | Test asserting the second approval returns `409` and no second actor is created; and that the status transition is a conditional update whose zero-row result is the refusal, not a prior read |
| **DC-31** | Duplicate dismissal is row-level, so clearing one candidate suppresses all of them | Test dismissing one of three candidates and asserting the other two still surface after reload |
| **DC-32** | The rejection reason code, the reviewer's identity, or the payload leaks into 3a's public lookup response | Extension of the existing lookup assertions: the public response carries `status` and at most `reviewNote`, by value |
| **DC-15** | The static export breaks (a dynamic segment or route handler sneaks in) | `cd frontend && npm run build` |
| **DC-13** | A hardcoded colour or duration enters a new component | Grep gate for hex literals in this spec's new frontend files; `npm run lint` |

### Classes with **no** automated gate — substituted or accepted

| # | Class | Why no gate | Substitute |
|---|---|---|---|
| **DC-24** | **Transaction rollback is never actually exercised** | Every backend suite substitutes an in-memory Prisma mock; `lambda-handler.e2e.spec.ts` implements `$transaction` as a pass-through with no rollback semantics. A "forced failure at step N" test can only assert which mock calls occurred — which **is** inspection, the thing NFR-3 originally excluded | **Accepted risk, recorded — a false gate, not a missing one.** Substitutes: assert structurally that all writes are inside the single callback and no `catch` swallows a throw; note that migration rehearsal runs against real MySQL, so MySQL's rollback semantics are not in doubt — only our use of them. A DB-backed harness would close this and is **out of scope**, recorded as a follow-up |
| **DC-16** | **Contrast, focus order, focus visibility** on the two new screens | jsdom has no layout or paint engine. This repo's `jest-axe` **disables the whole `cat.color` rule set by default**, so `color-contrast` never runs and never reports — a green axe result says nothing whatever about contrast. Focus order and focus visibility are equally unevaluable | **Human check at the Phase-3 HITL pause**, on a real browser render, against `docs/ux-ui/design.md` §7 — which records that `--color-accent` (~3.6:1) and `--color-highlight` (~2.0:1) fail AA for small body text. KZ-003 applies: these components take plain props, so a throwaway harness renders them with no stack, no database and no login. **This check must not be deferred on auth grounds** |
| **DC-33** | **The reviewer approves something they should not have** | Not an engineering property. The system can enforce that a human acted, that they typed an acknowledgement, and that the act is attributable and audited. It cannot evaluate whether the judgement was right, and there is **no un-publish in this spec** | **Accepted risk, recorded, and it is R-1.** Substitutes are all procedural: the typed acknowledgement names the specific policy version and acceptance date; the payload is shown in full with review-context fields marked; duplicates are surfaced; the act is audited and attributable server-side. Operational remedy for a wrong publication — deleting the created `Actor` — exists on the actors admin surface and is Admin-only, but it is **not** a rollback: the audit trail retains both acts, and this spec neither builds nor tests that path |
| **DC-34** | **Duplicate detection misses a real duplicate** | Detection is equality on normalized phone, lowercased email, normalized name, plus a GPS proximity box. An organisation registering with a new phone, a new address and a spelling variant matches none of them. No test can establish recall against duplicates nobody has enumerated | **Accepted risk, recorded, and it is by design.** FR-11 requires detection to warn, never to decide, precisely because its recall is unknown. Gated: that a *known* duplicate fixture **is** surfaced, and that detection never blocks. Not gated: that no duplicate is ever missed |
| **DC-35** | **Queue detection cost at scale** | Full detection per row would be N passes per page load. The list endpoint returns a **count** per row, not candidates; `phone` and `email` are not indexed on `Actor`, so detection scans | **Accepted, with a stated trigger.** Trivial at ~1,300 rows. Indexing two PII columns to serve an admin-only warning is not yet justified — revisit well beyond the PRD's 1,000+ target. Recorded rather than optimised |

---

## 9. Design-Relevant Decisions Carried Forward

Settled during 3a's requirements and Judgment Day, confirmed by the user, and binding on `design.md`. Full text in the archived 3a `requirements.md` §9; restated here in one line each so this spec is readable without it.

| ID | Decision |
|---|---|
| **D-2** | Applicant-facing duplicate hints are **excluded** — they would turn the public form into a membership oracle and disclose `traderId`. Detection is review-time only. |
| **D-3** | **Bulk approve/reject excluded.** Each publication is a consent decision. The mockup's *"2 selected → Approve & publish"* bar is not built. Workload (R-5) does not override the consent argument. |
| **D-4** | **The reviewer cannot edit the payload before approving.** A reviewer-edited record would be published as consented-to when it is not what was consented to. Approve as submitted, or reject. |
| **D-5** | **GPS/district consistency validation excluded** — needs a Tanzania administrative-boundary dataset the project does not have. The detail shows raw coordinates and a map link. |
| **D-6** | **Activity trail in, internal notes out.** The trail derives from stored fields and adds no column; a notes thread would add both a column and a write path. `reviewNote` covers the applicant-facing message. |
| **D-7** | `AWAITING_APPLICANT` and `WITHDRAWN` are declared in the enum but get **no UI** — chunk 4 makes them reachable. A segment for an unreachable status is KZ-002's exact shape. |
| **D-8** | The `traderId` namespace is server-chosen and must collide with none of chunk 2's eight prefixes, and must not be the mockup's `TZ-`. 3a's `design.md` DD-4 derives it from the reference under a distinct prefix (`REG-2026-0184` → `SR-2026-0184`); **this spec re-confirms or re-decides that literal in `design.md`**, since uniqueness table-wide is not guaranteed by construction. |
| **D-9** | **Two submitted fields have no `Actor` column** (`contactPerson`, `otherCrops`) and stay in the admin-only payload as review context. Growing the `Actor` schema for two free-text fields was rejected. |
| **D-11** | **Approval is a fifth consent write path** and must call chunk 1's shared invariant rather than inline an equivalent check. |
| **D-12** | The audit taxonomy does not cover adjudication; 3a's `design.md` DD-6 resolves it as **two additive enum members and two additive service methods** — `logCreate` hardcodes `CREATE` and takes no action parameter, so it cannot be reused. |

### New here

| ID | Decision |
|---|---|
| **D-13** | **The audit-history read path is in scope, and so is `IMPORT`.** RA5's drift is live today and degrades silently. Fixing `IMPORT` in the same change is nearly free and is the only way the new members' gate can be shown to fail against pre-change code (FR-16, DC-27). |
| **D-14** | **The PII release gate's `FIXTURE_MAP` gains a route classification.** It currently expresses one idea — *this public route leaks nothing*. This spec's routes are admin-gated and legitimately return PII to an Admin, so the map must be able to say *this route is admin-only; assert `401`/`403` and a clean body for non-Admin callers*. Without that, the totality assertion either fails on correct code or is loosened into uselessness. **`design.md` owns the mechanism.** |

---

## 10. Data & Schema Impact

**One migration, additive in semantics, and the only structural change in this epic.**

| Object | Change | PII |
|---|---|---|
| `ActorAuditAction` (enum) | **Two additive members:** `REGISTRATION_APPROVE`, `REGISTRATION_REJECT` | — |
| `Registration` (model) | **No structural change.** 3a declared every adjudication column; this spec is the first to write them | payload, `submitterEmail` — unchanged, still structurally contained |
| `Actor` (model) | **No structural change.** Gains rows, using columns chunk 1 shipped | — |
| `ActorAuditLog` (model) | **No structural change**, but its `action` column's enum widens — see below | audit JSON contains PII; admin-only surface, unchanged |

**What the generated SQL will actually contain.** On MySQL, extending an enum emits:

```
ALTER TABLE `ActorAuditLog` MODIFY `action` ENUM(...)
```

The in-repo precedent is `backend/prisma/migrations/20260710132750_add_import_audit_action/migration.sql`. This is **additive in semantics** — it widens accepted values, destroys no data, rewrites no rows — which is what `backend/CLAUDE.md`'s additive-only rule protects. **Disclosed here so the migration task's done-criteria assert what the generated SQL will contain:** a criterion demanding "no `MODIFY`" would FAIL a correct migration, or worse, invite hand-editing it. No `DROP`, no data `UPDATE`, no column narrowed or retyped.

**Rehearsal target.** Per `backend/CLAUDE.md` as amended 2026-08-05: rehearse against whatever MySQL 8 `backend/.env`'s `DATABASE_URL` points at — in practice the shared dev RDS. `migrate dev` provisions a shadow database there, which is acceptable on dev and never on PROD. A reset or drift prompt is an **abort-and-report** condition.

**No new PII field is introduced.** `duplicateDismissals` stores actor ids and reviewer identity, not applicant PII. No addition to `PII_ALLOWLIST` or `NEVER_PUBLIC_FIELDS` — both enumerate `Actor` columns for the `Actor` serializer and neither governs `Registration`.

---

## 11. Out of Scope

**Everything 3a owns:** the public form, consent capture, OTP, the receipt, the status lookup, the four public endpoints, rate limiting, the payload cap, `MailService` itself, the logging module, and the frontend trader taxonomy (3a FR-15, closed there).

**Deliberately excluded here** (each with its reason above): bulk approve/reject (D-3) · reviewer editing of the payload (D-4) · GPS/district consistency validation (D-5) · an internal-notes thread (D-6) · applicant-facing duplicate feedback (D-2) · UI for `AWAITING_APPLICANT` / `WITHDRAWN` (D-7).

**Deferred to other work:**

- **The information-request round-trip and applicant withdrawal** — chunk 4, `docs/specs/admin/registration-info-requests/`.
- **"Export queue (CSV)"** — a new PII-bearing admin export surface, unscoped by the proposal and required by no requirement here.
- **A public "self-declared" badge** on approved actors — a product decision, open as epic OQ-3.
- **Un-publish / undo of an approval.** Deleting the created `Actor` exists on the actors admin surface; it is not a rollback and this spec neither builds nor tests it (DC-33).
- **A DB-backed test harness** that would close DC-24 by exercising real rollback.
- **A retention or deletion policy** for rejected registrations' PII — R-7 below; ties to PRD OQ-4.
- **Indexing `Actor.phone` / `Actor.email`** to speed duplicate detection (DC-35).

---

## 12. Dependencies & Assumptions

### Dependencies

| # | Dependency | Status |
|---|---|---|
| **DEP-1** | Chunk 1 — `registrationSource`, `consentMethod`, `consentObtainedAt`, `consentReference` on `Actor` and the shared consent-provenance invariant | **Met.** Archived 2026-08-04. `isConsentProvenanceSatisfied` present in `backend/src/common/consent-provenance.policy.ts` |
| **DEP-2** | Chunk 3a — `Registration` with adjudication columns, `RegistrationStatus`, `RegistrationsModule`, `MailService`, `RequestContextMiddleware` | **Met.** Archived 2026-08-06, 23/23 tasks PASS. Verified in this working copy 2026-09-01 |
| **DEP-3** | `ActorAuditService` writing inside the caller's `$transaction` | **Met.** Every method takes `tx: Prisma.TransactionClient` |
| **DEP-4** | `ActingAdminResolver` for server-side reviewer identity | **Met** |
| **DEP-5** | `AcknowledgeDialog` with a typed acknowledgement gate | **Met** |
| **DEP-6** | SES sender identity and Lambda env for notifications | **Met.** 3a's open blocker **T3-A1 is closed** — `MAIL_TRANSPORT`, `MAIL_SENDER_ADDRESS`, `OTP_HMAC_SECRET` and an `ses:SendEmail` policy are all present in `infra/20-backend/template.yaml`. Deliverability itself remains ungated (DC-18, 3a) |
| **DEP-7** | A stable frontend admin test environment | **AT RISK — see OQ-1.** 3a's archive records a measured `(admin)/admin/actors/**` flake: 32/32 green in 2.3 s isolated vs 29.3 s under full load, a 13× slowdown attributed to CPU starvation rather than logic, with a follow-up spec recommended as **blocking for the next frontend-heavy chunk**. This spec is that chunk |

### Assumptions

| # | Assumption | Confidence |
|---|---|---|
| **A-1** | The consent captured by 3a is a sufficient legal basis for publication, given an Admin's review | **Confirmed** at the epic level; the legal wording is the program team's, not engineering's |
| **A-2** | ~1,300 existing actors is the scale duplicate detection runs against; a linear scan is acceptable there | Verified against chunk 2's import volume |
| **A-3** | Reviewers are few and trusted; there is no reviewer-vs-reviewer concurrency problem beyond double-adjudication of one row, which FR-12/FR-13 close by conditional update | Reasonable; not measured |
| **A-4** | The client mockup is **flow-authoritative and copy-provisional** — the client stated it is approximate | Stated by the client, recorded in the proposal §11 |

### Inherited open questions

- **PRD OQ-3** — whether public GPS should be jittered. Approval publishes exact coordinates under the current default; if OQ-3 resolves the other way, this path inherits the change rather than pre-empting it.
- **PRD OQ-4** — PII retention and governance. R-7 below is its concrete instance.
- **TRD OQ-TRD-1** — no agreed p95 latency budget, which is why NFR-9 sets none.

---

## 13. Open Questions

These need a decision before or during `/akili-execute`. None blocks writing `design.md`; each is carried with a stated default.

| # | Question | Default if unanswered |
|---|---|---|
| **OQ-1** | **Does the `(admin)/admin/actors/**` test flake get its own fix first?** 3a's archive recommends a follow-up spec as **blocking** for the next frontend-heavy chunk — this one. Two frontend-heavy screens land here, and a 13× slowdown under full load will produce failures an Implementer cannot distinguish from real ones, burning rework attempts on noise. | **Proceed, and carry it as a named execution risk.** The flake is CPU starvation, not logic; targeted runs (`npm test -- <pattern>`) avoid it, and `tasks.md` will prefer the smallest verifying command anyway. Escalate at the first ambiguous failure rather than pre-emptively spending a spec. |
| **OQ-2** | ~~**`SR-` as the `traderId` prefix**~~ — **CLOSED 2026-09-01 by `design.md` DD-23.** Confirmed as `REG-<year>-<seq>` → `SR-<year>-<seq>`, checked against chunk 2's eight prefixes and `TZ-SEED-*`, with table-wide uniqueness explicitly **not** claimed by construction (hence the `P2002` → `409` path). | — resolved |
| **OQ-3** | **What happens to a rejected registration's PII, and when?** Rejected rows hold an organisation's phone, email and coordinates for an organisation that will never be published. There is no purge anywhere in the system (four tables already hold personal data with no retention policy). | **Carry as an accepted risk (R-7), do not invent a policy.** Engineering can implement any retention rule; it cannot choose one. Route to the program team via PRD OQ-4. |
| **OQ-4** | **Should the notification emails be reviewed by the program team before they ship?** They are the first outbound messages the registry sends to an external organisation announcing a decision about them. | **Draft them in `design.md` as copy-provisional**, ship behind the no-op transport by default, and flag for program-team review at the Phase-3 HITL pause. |

---

## 14. Requirement ID Index

| ID | Title | Scenarios | Source |
|---|---|---|---|
| **FR-9** | Admin registrations queue | 5 | Inherited 3a, amended |
| **FR-10** | Registration detail with consent record and activity trail | 3 | Inherited 3a, amended (S-4) |
| **FR-11** | Duplicate detection warns, never decides | 3 | Inherited 3a, +1 new scenario (per-candidate persistence) |
| **FR-12** | Approve and publish — atomic, gated, audited | 6 | Inherited 3a, amended (S-2, S-3), +1 new scenario (projection table) |
| **FR-13** | Reject with a structured reason | 2 | Inherited 3a |
| **FR-14** | Decision notifications (adjudication slice) | 2 | Inherited 3a, scoped |
| **FR-16** | Audit-action taxonomy widened end-to-end | 2 | **New** — RA5 |
| | **7 requirements · 23 scenarios** | | |

| ID | Non-functional |
|---|---|
| NFR-1 | PII boundary extended to this spec's routes — **release gate** |
| NFR-2 | Consent integrity at publication |
| NFR-3 | Adjudication atomicity (honest measure) |
| NFR-5 | Accessibility WCAG 2.1 AA |
| NFR-6 | Token conformance |
| NFR-7 | Static-export conformance |
| NFR-8 | Observability without PII |
| NFR-9 | Queue performance |
| NFR-10 | Email independence for outcomes |
| NFR-11 | **New** — type fidelity of the audit-action contract |

**Defect classes:** DC-6, DC-7, DC-8, DC-13, DC-15, DC-23, DC-25 (inherited) · DC-27…DC-32 (new, gated) · DC-16, DC-24 (inherited, no gate) · DC-33, DC-34, DC-35 (new, no gate).

---

## 15. Risks

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | **Irreversible publication.** Approval discloses another party's phone, email and exact GPS. There is no un-publish in this spec | `AcknowledgeDialog`'s typed gate, re-validated server-side; the dialog names the policy version and acceptance date being attested to. **DC-33 records that the judgement itself is ungateable** |
| **R-2** | **Partial adjudication** — an orphan `Actor`, or an approved registration with no actor | One `$transaction`, compare-and-set first. Evidence limits recorded honestly (NFR-3, DC-24) |
| **R-3** | **Wrong projection publishes a natural person's name** | Value-asserted gate over every column (DC-23); the projection table in FR-12 is the contract |
| **R-4** | **Silent audit-history degradation** (RA5) | Both frontend files in scope, gated by a test proven to fail pre-change (FR-16, DC-27, NFR-11) |
| **R-5** | **Reviewer workload** if the named cohort registers in a burst (100+) | Segments, oldest-first, indexed queue. Bulk adjudication stays excluded — workload does not override the consent argument |
| **R-6** | **Duplicates against chunk 2's ~1,300 imported actors** | Per-candidate detection and dismissal; duplicate as a first-class rejection reason. Recall is unknown and recorded as such (DC-34) |
| **R-7** | **Retention of rejected registrations' PII** | Unresolved; ties to PRD OQ-4 and OQ-3 above. Carried as an accepted risk — do not invent a policy |
| **R-8** | **The release gate blocks the whole spec on day one.** The module-scoped totality assertion fails the moment the admin controller is registered, before any fixture exists | Deliberate, and it is the gate working. D-14 makes the fixture classification a first-class design item rather than a surprise during execution |

---

**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII is `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport` on `Actor`, plus `payload` and `submitterEmail` on `Registration`. All AWS commands use `--profile IBD-DEV`, except `infra/scripts/deploy-frontend.sh`, which reads `AWS_PROFILE`.
