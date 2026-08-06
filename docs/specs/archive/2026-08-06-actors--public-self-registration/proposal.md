# Proposal — Public Self-Registration & Admin Review Queue

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `actors/public-self-registration` |
| Proposal date | 2026-08-03 |
| Author | AKILI (Leader) on behalf of JuanCode |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting approval |
| Parent epic | [`epic/hybrid-actor-registration`](../../epic/hybrid-actor-registration/proposal.md) — chunk **3 of 4** |
| **Depends on** | `actors/registration-source-and-consent` (chunk 1) |
| **Parallel-safe** | **yes** — disjoint from `import-export/partner-profile-onboarding` (chunk 2) |
| Suggested depth | **Full** — the system's **first unauthenticated write path**, PII-bearing, consent-critical, new module + new public screens |

## 2. Intent

Let an actor add itself to the registry: open a public form, fill in its own information, read and accept the consent policy in-flow, and submit. Nothing becomes public until an Admin reviews it and approves publication.

This is registration **option 1** from the client thread, for the cohort the client named — *all NGOs, all seed companies, and some traders* — running alongside the team-managed Excel track rather than replacing it.

## 3. Problem / Current Behavior

- **There is no public write path.** Every endpoint in the system is either a public *read* or an authenticated admin write. Actors have no way to contribute their own data; every record must be typed or imported by the AT team, which does not scale to 1,000+ actors and keeps the data as stale as the last field campaign.
- **The PRD forbids it today.** §5 lists *"Self-service public registration / actor self-onboarding"* under **Out of Scope (v1)**. This spec is the amendment.
- **Consent for self-registrants has no mechanism.** Chunk 1 gives consent a `PORTAL_CHECKBOX` method, but nothing sets it — there is no flow in which an actor reads a policy and accepts it.
- **No review surface exists.** Even if submissions arrived, there is no queue, no adjudication, and no way to turn an accepted submission into a published actor.

## 4. Proposed Outcome

**Applicant side (public, unauthenticated):**

1. A **Register your organisation** entry point from the landing page and public nav.
2. A sectioned form — *Organisation details · Location · Crops & trade · Contact · Consent* — mirroring the fields the admin create form already validates, so a submission is directly publishable.
3. **In-flow consent**: the Data Protection & Participant Consent Policy is readable in place, and submission is blocked until it is explicitly accepted. The accepted **policy version** and timestamp are stored with the submission.
4. **Email verification by one-time code** before the submission is persisted — a verified contact for the review round-trip, and a spam gate (see §10, A-2).
5. A **submission receipt** with a reference code (`REG-2026-0184`), what-happens-next guidance, and a **public status lookup** by reference + email.

**Admin side:**

6. A **Registrations** queue with status filters (`Pending review · Awaiting applicant · Approved · Rejected · Withdrawn`), sortable and paginated like the actors console.
7. A **registration detail** view showing every submitted field plus the consent block (policy version, accepted-at).
8. **Approve & publish** — behind a typed confirmation (*"I confirm consent is on file"*), creating a real `Actor` with `registrationSource = SELF_REGISTERED`, `consentStatus = GRANTED`, `consentMethod = PORTAL_CHECKBOX`, `consentObtainedAt` = acceptance time, `consentReference` = the registration reference.
9. **Reject** — with a reason (including *"Duplicate of an existing registry record"*) and a note to the applicant.
10. **Duplicate detection** surfaced at review time (name/phone/email/GPS proximity against existing actors) as a *warning*, never an automatic block.

## 5. Scope

**Data (additive):**

```prisma
enum RegistrationStatus {
  PENDING_REVIEW
  AWAITING_APPLICANT   // set by chunk 4; reachable but unused here
  APPROVED
  REJECTED
  WITHDRAWN            // set by chunk 4
}

model Registration {
  id                   String   @id @default(cuid())
  reference            String   @unique          // REG-2026-0184
  status               RegistrationStatus @default(PENDING_REVIEW)
  payload              Json                      // submitted actor fields — PII-BEARING, ADMIN-ONLY
  submitterEmail       String                    // PII
  emailVerifiedAt      DateTime
  consentAcceptedAt    DateTime
  consentPolicyVersion String
  publishedActorId     String?                   // set on approve
  reviewedBySub        String?
  reviewedAt           DateTime?
  rejectionReason      String?
  reviewNote           String?   @db.Text
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@index([status, createdAt])
}
```

**Backend — new `RegistrationsModule`:**

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/v1/registrations/verify` | Public | Request an email one-time code. Rate-limited. **No `Registration` row written yet.** |
| `POST /api/v1/registrations` | Public | Submit with the code. Validates the full payload against the same rules as `ActorCreateDto`. Returns **only** `{ reference }`. |
| `GET /api/v1/registrations/lookup` | Public | Status by `reference` + `email`. Returns status and review note **only** — never the stored payload. |
| `GET /api/v1/admin/registrations` | Admin | Paginated, filterable queue. |
| `GET /api/v1/admin/registrations/:id` | Admin | Full detail incl. payload. |
| `POST /api/v1/admin/registrations/:id/approve` | Admin | Transactional: create `Actor` + set status + write `ActorAuditLog`. |
| `POST /api/v1/admin/registrations/:id/reject` | Admin | Reason + note. |

- **Consent policy versioning**: the policy text ships as a versioned constant; the accepted version is stored per submission and shown at review.
- Notifications via SES: submission receipt, approval, rejection — **each carrying the reference code**, so the status lookup works when mail does not (A-3).
- Audit: approval writes an `ActorAuditLog` entry via the existing `ActorAuditService`, inside the same `$transaction` as the actor creation.

**Frontend:**
- Public: `/register` (form + consent), `/register/submitted` (receipt), `/register/status` (reference lookup).
- Admin: `(admin)/admin/registrations` list + detail, with the three action modals.
- Landing-page and nav entry points.

**Infra:** SES sending identity is already provisioned (`CreateSenderIdentity`). Rate limiting and payload caps at the API layer — confirm the mechanism during `/akili-specify`.

**Constitutional:** amend **PRD §5** (self-onboarding → in scope) with a new user story and acceptance criterion; add the module to **TRD §2**, the entity to **§3**, the endpoints to **§4**, a security note to **§8**, and an **ADR for the public write path**; add the three public screens and the queue to **`docs/ux-ui/design.md` §2/§4**.

## 6. Non-Goals

- **The "request more information" round-trip and applicant withdrawal** — chunk 4. Here, an Admin approves or rejects; there is no write-back from the applicant. `AWAITING_APPLICANT` and `WITHDRAWN` exist in the enum but are not reachable yet.
- **Public accounts / Cognito self-signup.** Applicants never get credentials.
- **Self-service editing after publication.** Corrections go through the AT team.
- **Automatic publication.** No submission ever reaches the public without an Admin acting on it. Non-negotiable — it is the ADR-004 consent basis.
- **Automatic duplicate rejection.** Detection warns a human; it never decides.
- **Swahili translation** of the form or the policy (copy stays externalizable).
- **The legal wording of the consent policy.** Engineering versions and stores it; the program/legal team authors it.
- **File uploads** (logos, certificates, signed consent documents).

## 7. Affected Users, Systems, And Specs

| Area | Impact |
|---|---|
| **Users** | **New persona**: prospective actor (anonymous applicant). Admin gains a review responsibility. |
| **Backend** | **New** `registrations` module; `actors` (creation from a registration), `common/pii-consent.policy.ts` (review), `common/validation-pipe.ts` (unchanged, reused). |
| **Frontend** | 3 new public routes, 1 new admin section, landing/nav changes. |
| **Data** | 1 enum + 1 model, additive. |
| **Infra** | SES templates/sending; API-layer rate limiting. |
| **Specs** | Depends on chunk 1. Prerequisite for chunk 4. Reuses patterns from archived `admin/actor-crud-audit` (audit-in-transaction) and `admin/bulk-actor-operations` (typed acknowledgement gate). |

### PII boundary — the load-bearing constraint

`Registration.payload` and `submitterEmail` hold **phone and email for an actor that is not published and may never be**. This is a record class the current `PII_ALLOWLIST` and the ADR-004 consent `WHERE` were never designed for: those protect `Actor`, and a `Registration` is not an `Actor`.

Therefore:
- **No public endpoint returns any submitted field.** `POST /registrations` returns `{ reference }` and nothing else. `GET /lookup` returns status and review note only.
- The lookup requires **reference + matching email**, so a guessed reference alone discloses nothing.
- `pii-boundary.spec.ts` must be extended to cover every `registrations` public path. **Release gate.**

## 8. Requirement Delta Preview

### ADDED
- `Registration` entity + `RegistrationStatus` enum.
- Public verify / submit / lookup endpoints; admin list / detail / approve / reject endpoints.
- Public registration form with in-flow, versioned consent acceptance.
- Email one-time-code verification; rate limiting; payload caps.
- Admin registrations queue, detail, and three action modals with a typed approval gate.
- Duplicate-detection warning at review.
- Approve-and-publish transaction: `Actor` + consent provenance + audit entry.
- SES notifications carrying the reference code.
- `pii-boundary.spec.ts` coverage for the new module.

### MODIFIED
- **PRD §5** — self-onboarding moves from Out-of-Scope to In-Scope (+ new US and AC).
- **Public nav and landing page** — a registration entry point.
- **TRD §2/§3/§4/§8** + a new ADR.
- **`docs/ux-ui/design.md` §2/§4** — three public screens, one admin screen.

### REMOVED
- Nothing.

## 9. Approach Options

Two independent decisions. The first is the important one.

**D1 — Applicant identity**

| | **A — Email one-time code (recommended)** | **B — Open form, no verification** | **C — Cognito self-signup** |
|---|---|---|---|
| Spam exposure | Low | **High** — the queue absorbs it all | Low |
| Verified channel for review round-trip | Yes | No | Yes |
| Enables future self-service editing | No | No | **Yes** |
| New infrastructure | Code store + throttle | None | A public user pool tier, password flows, support burden |
| Effort | +0.5 wk | 0 | +2 wk |

**D2 — Storing the submission**

| | **A — `payload Json` (recommended)** | **B — Draft `Actor` row with a status** |
|---|---|---|
| Risk of an unapproved record leaking publicly | Low — different table, no public read | **High** — one forgotten `WHERE` publishes it |
| Schema drift as the form evolves | Tolerated | Rigid |
| Query/filter on submitted fields | Weak (acceptable — the queue filters on status/date) | Strong |

## 10. Recommended Approach

**D1 → A (email one-time code). D2 → A (`payload Json` in a separate table).**

D2 is the one worth defending. Storing submissions as draft `Actor` rows is superficially tidier, but it puts unapproved, unconsented PII inside the exact table every public read queries — and the only thing standing between it and publication would be a status predicate that some future endpoint forgets. Keeping registrations in a **separate table with no public read path at all** means a forgotten filter cannot leak an unapproved actor, because there is nothing to forget. That is the same defense-in-depth argument as ADR-003, applied one layer out.

D1 → A is the middle option on purpose: a Cognito pool for ~1,000 actors who each submit once is infrastructure with a permanent support cost for a one-time interaction.

**Assumptions:**

| ID | Assumption | If wrong |
|---|---|---|
| **A-1** | An in-portal checkbox against versioned policy text is legally sufficient consent for self-registrants. | A countersigned-document step must precede publication; the approval gate becomes evidence-bearing. Confirm with the program/legal team **before** `/akili-specify`. |
| **A-2** | Email verification is proportionate anti-abuse for this audience. | Add a CAPTCHA or move to invite-only registration links. |
| **A-3** | SES + reference-code fallback is enough given this project's known deliverability failures. | Block on an SES-hardening spec. |
| **A-4** | The self-registration form collects the same fields as the admin create form. | Divergence means an approved submission is not directly publishable — re-scope the approve step. |

## 11. Risks, Dependencies, And Open Questions

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | **First unauthenticated write path in the system.** Abuse, payload-size, and DB-write vectors against Lambda with a constrained RDS pool (TRD §12.4 defers RDS Proxy). A submission flood is also a connection flood. | Rate limit before the DB; verify email before persisting; cap payload size; load `aws-serverless` and `api-design-principles`. Flag to `software-architect` during `/akili-specify`. |
| **R-2** | **Unapproved PII at rest** — see §7. A `Registration` is outside every existing PII/consent guarantee. | Separate table, no public read of payload, lookup gated on reference **+** email, `pii-boundary.spec.ts` extended. Release gate. |
| **R-3** | **SES deliverability is a realised failure here** — admin user invites were converted to a no-email temporary-password handoff because `@cgiar.org` mail did not arrive (`backend/CLAUDE.md`). This flow is more email-dependent than that one was. | The reference code + status lookup is the primary fallback, not a nicety. The receipt screen must tell the applicant to **save the reference**. |
| **R-4** | **Consent could be misrepresented.** A checkbox that is pre-ticked, or a policy that cannot actually be read before accepting, would make every published self-registration legally worthless — and ADR-004 calls consent "the legal/ethical basis for publishing at all." | Unticked by default; policy readable in place; store the policy **version**; make consent acceptance a validated server-side field, not a client assertion. |
| **R-5** | **Duplicate submissions** against the ~1,000 actors chunk 2 is importing. The same organisation may already exist as `OFB-1036`. | Detection warns the reviewer with candidate matches; the reviewer decides. `Duplicate of an existing registry record` is a first-class rejection reason. |
| **R-6** | **Reviewer workload.** If the named cohort (all NGOs + all seed companies + some traders) registers in a burst, the queue could receive well over 100 submissions in a short window. | Queue filters, sort by age, and bulk-safe patterns from `admin/bulk-actor-operations`. Bulk approve is **not** in scope — each publication is a consent decision. |
| **R-7** | **Static-export constraint.** No SSR, no Next route handlers (ADR-002) — so the form, the code exchange, and the lookup are all client-side against the API, and the reference code cannot be rendered server-side. | Standard for this codebase; call it out so nobody reaches for a route handler. |
| **OQ-1** | Who authors and owns the consent policy text, and does it need Swahili before go-live? | Program/legal. Blocks copy, not mechanism. |
| **OQ-2** | Should self-registered actors carry a visible badge in the **public** directory (self-declared vs. team-verified)? | Product decision. Affects public UI only. |
| **OQ-3** | Should a `traderId` be auto-generated for approved self-registrations (e.g. `SR-2026-0184`), given chunk 2 namespaces the imported ones? | Decide with chunk 2's key scheme so the two do not collide. |
| **OQ-4** | Retention for rejected and withdrawn registrations — they hold PII for people who were never published. Delete after N days? | Ties to PRD OQ-4 (PII retention policy), still open. |

## 12. Success Criteria

- An organisation completes submit → verify → receipt without authenticating, and receives a reference code.
- **Zero** submitted field is retrievable from any public endpoint before approval — asserted end-to-end over HTTP in `pii-boundary.spec.ts`.
- Consent cannot be bypassed: a submission without server-validated acceptance is rejected `400`.
- Approve-and-publish creates an `Actor` with `SELF_REGISTERED` / `GRANTED` / `PORTAL_CHECKBOX` / correct `consentObtainedAt` / reference, plus an audit entry — **atomically**. A failure mid-way leaves no orphan actor and no falsely-approved registration.
- A rejected registration never produces an `Actor`.
- The status lookup works with the reference alone in hand, **with email delivery disabled** — proving the flow survives R-3.
- Gates green in `backend/` and `frontend/`, including `pii-boundary.spec.ts` and `lambda-handler.e2e.spec.ts`.

## 13. Visual Reference

- **Source:** Client-supplied mockup strip. The client stated it is **approximate** — "not a final design, and some of the texts shown there would not necessarily stay as they are." Treat it as flow-authoritative and copy-provisional.
- **Location:** `mockup/self-registration-flow.png` (this folder).
- **Covers:** landing CTA · registration form with all five sections · field-validation and consent-required error states · submission received (`REG-2026-0184`) · admin Registrations queue with status chips · registration detail · approve-and-publish modal with typed confirmation · reject modal with reason dropdown · result banners.
- **Also shown but belonging to chunk 4:** the *Request more information* modal, the applicant's return-via-emailed-link revision screen, and withdrawal.
- **No Figma file was provided.** If one is produced before `/akili-specify`, attach it here — it supersedes the strip for visual detail, never for flow.

## 14. Next Step

Only after chunk 1 is executed (may run in parallel with chunk 2):

```text
/akili-specify actors/public-self-registration
```

**Confirm A-1 (consent sufficiency) with the program/legal team before approving that spec** — it is the one assumption whose failure would invalidate the feature rather than merely re-scope it.
