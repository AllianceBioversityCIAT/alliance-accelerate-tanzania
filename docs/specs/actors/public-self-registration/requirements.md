# Requirements — Public Self-Registration & Admin Review Queue

- Spec path: `docs/specs/actors/public-self-registration/`
- Status: **Draft — revision 3.** Amended after Judgment Day round 1, then **split** 2026-08-05 (see `judgment.md` §5)
- Author / Date: AKILI (Leader) on behalf of JuanCode · drafted 2026-08-04, amended and split 2026-08-05
- Epic position: chunk **3a of 5** — the applicant flow. The admin review queue is chunk **3b**, `docs/specs/admin/registration-review-queue/`

> ## ⚠️ Scope boundary — read before anything else
>
> **This spec was split on 2026-08-05 (user-approved).** It now covers the **applicant flow only**. Everything an Admin does with a submission moved to **`docs/specs/admin/registration-review-queue/`** (chunk 3b).
>
> | Owned here (3a) | Moved to 3b |
> |---|---|
> | FR-1 entry points · FR-2 form · FR-3 consent · FR-4 OTP · FR-5 receipt · FR-6 status lookup · FR-7 abuse resistance · **FR-8 PII boundary (release gate)** · FR-14 submission receipt + `MailService` · FR-15 taxonomy | **FR-9** queue · **FR-10** detail + activity trail · **FR-11** duplicate detection · **FR-12** approve-and-publish · **FR-13** reject · FR-14's decision notices |
> | The **four public** endpoints | The **five admin** endpoints |
> | `RegistrationStatus`, `Registration` (**full model, adjudication columns included**), `EmailVerification` | The two `ActorAuditAction` members and two additive audit methods |
> | Mail, logging, throttling, payload cap — all built from zero | The approve transaction and `traderId` derivation |
>
> **FR-9 … FR-13 keep their IDs and their full text below, marked `→ 3b`.** They are deliberately *not* renumbered: `judgment.md`'s 31-finding ledger, the epic, and 3b's proposal all cite these IDs, and renumbering would silently invalidate that audit trail. Read them as inherited design material for 3b, not as obligations of this spec.
>
> **3a is deployable and safe on its own but not yet useful:** submissions accumulate at `PENDING_REVIEW` with no review surface, and nothing reaches the public. The two chunks should ship in close sequence.
>
> **Why split:** the two halves carry different dominant risks and so need different gate tables — 3a's is the first unauthenticated write path and unapproved PII at rest; 3b's is irreversible publication of another party's personal data. Procedurally, chunk 3's Judgment Day lineage reached `escalated` with one fix round left, and each successor is eligible for a fresh lineage. Full reasoning: `judgment.md` §5.
- Depth: **Full** · Type: **Change** · Approval Mode: **gated**
- Parent epic: `docs/specs/epic/hybrid-actor-registration/` — chunk **3 of 4**
- Depends on: `docs/specs/archive/2026-08-04-actors--registration-source-and-consent/` (chunk 1, **archived complete**)
- Related: `docs/prd.md` §5 (amended by this spec), §6, §7 · `docs/ux-ui/design.md` §2, §4, §7, §10 · `docs/trd/trd.md` §3, §4, §8, §12.5, §13
- Visual reference: `mockup/self-registration-flow.png` (client-supplied; **flow-authoritative, copy-provisional**)

---

## 1. Summary

This spec opens the registry's **first unauthenticated write path**. An organisation visits a public form, enters its own details, reads and accepts a versioned consent policy in flow, verifies its email address with a one-time code, and submits. It receives a **reference code** and nothing more. The submission is stored in a table with **no public read path for any submitted field**. An Admin later reviews it and either **approves and publishes** it — creating a real `Actor` carrying the consent provenance chunk 1 introduced — or **rejects** it with a reason.

This advances epic outcome 3 and 4, and amends **PRD §5**, which today lists *"Self-service public registration / actor self-onboarding"* under **Out of Scope (v1)**. It delivers the client's registration **option 1** for the named cohort (all NGOs, all seed companies, some traders), running alongside the team-managed Excel track that chunk 2 onboarded.

The load-bearing constraint is not the form. It is that `Registration` holds **phone and email for an organisation that is not published and may never be** — a record class that `PII_ALLOWLIST`, `NEVER_PUBLIC_FIELDS`, and the ADR-004 consent `WHERE` were all designed around `Actor`, not around this. Every requirement below that mentions PII exists because of that.

## 2. Requirement Numbering & Writing Standards

- Functional requirements are `FR-1 … FR-15`; non-functional `NFR-1 … NFR-10`.
- RFC 2119 keywords (`MUST` / `SHALL` / `SHOULD` / `MAY`) carry their normative meaning.
- Each requirement is atomic and testable, traces up to a PRD story / epic outcome, and down to a task in `tasks.md`.
- **Coverage closes at scenario and clause granularity, not requirement ID (KZ-001).** Every `Scenario`, every `BUT it must NOT`, and every `AND IT MUST` below is a separately ownable obligation. `tasks.md` §Coverage Closure enumerates them individually; an ID-keyed table is not sufficient evidence of coverage.
- **Numeric claims are reconciled against prose in this spec and its siblings before publication (KZ-005).** Counts appearing here (status counts, field counts, taxonomy size) are cross-checked against `design.md` and the mockup, and any figure that contradicts a sentence elsewhere is a defect detectable without re-measuring.
- **A presence-assertion is not a behavioural proof (KZ-002).** Where a requirement's measure names a property the automated harness structurally cannot evaluate, §8 says so and routes it to a substitute rather than counting it as covered.

## 3. Glossary

| Term | Meaning |
|---|---|
| **Applicant** | An anonymous, unauthenticated person submitting an organisation's details. Never holds credentials. A new persona for this system. |
| **Registration** | A stored submission awaiting adjudication. **Not** an `Actor`. Lives in its own table with no public read of any submitted field. |
| **Reference code** | The applicant-facing handle for a Registration (mockup: `REG-2026-0184`). The only value `POST /registrations` returns, and the fallback channel when email fails. |
| **Consent policy version** | An engineering-versioned identifier for the consent text an applicant accepted (mockup: `v2.1`). Stored per submission; displayed at review. Legal owns the wording, engineering owns the version. |
| **OTP** | The emailed one-time code proving the applicant controls the submitted email address. Verified **before** any Registration row exists. |
| **Publication** | The Admin act of turning an approved Registration into a public `Actor` with `registrationSource = SELF_REGISTERED`, `consentStatus = GRANTED`, `consentMethod = PORTAL_CHECKBOX`. |
| **Adjudication** | An Admin decision on a Registration: approve-and-publish, or reject. In this chunk there is no third option. |
| **Payload** | The submitted field set, stored as JSON. **Admin-only in its entirety.** |
| **Publishable subset** | The subset of payload fields that map onto real `Actor` columns. Fields outside it (contact person, other crops) are review context and are **never** published. |

## 4. System Context & Scope

```
   Applicant (anonymous)                          ┌ chunk 3b ────────────────────┐
          │                                       │ Admin (Cognito, group admin) │
          │ 1. GET  /register   (static, S3/CDN)   └──────────────┬───────────────┘
          │ 2. GET  /registrations/consent-policy                 │
          │    ◄── { version, sections }                          │
          │ 3. POST /registrations/verify   ──► OTP by SES         │
          │    ◄── 202, empty body, ALWAYS                         │
          │ 4. POST /registrations  (code + payload + consent)     │
          │    ◄── { reference } and nothing else                  │
          │ 5. POST /registrations/lookup  (body: reference+email) │
          │    ◄── status + review note only                       │
          ▼                                                        │ 3b: queue · detail
   ┌──────────────────────┐   no public read of payload, ever   ┌──▼──────────────────┐
   │  Registration table  │◄────────────────────────────────────│  Review queue (3b)  │
   │  payload  (PII)      │                                     └──┬──────────────────┘
   │  submitterEmail (PII)│                                        │ 3b: approve │ reject
   └──────────────────────┘                                        ▼             ▼
   ┌──────────────────────┐                            ┌──────────────────────────────┐
   │ EmailVerification    │  no row until code matches │ Actor (public) + AuditLog     │
   │ email · codeHash     │                            │ SELF_REGISTERED · GRANTED     │
   └──────────────────────┘                            │ PORTAL_CHECKBOX  (chunk 3b)   │
                                                       └──────────────────────────────┘
```

*Diagram corrected 2026-08-05 — Judgment Day C-11 PARTIAL. It previously showed `GET /registrations/lookup`, the verb the C-11 fix forbids, and omitted `consent-policy` entirely.*

**In scope (3a):** three public screens (`/register`, `/register/submitted`, `/register/status`); two public entry points (nav + landing CTA); **four public endpoints**; **one new enum and two new models** — `RegistrationStatus`, `Registration` (the **full** model, adjudication columns included, so 3b needs no migration), `EmailVerification`; a `MailService` with a no-op transport; a minimal structured-logging capability; rate limiting and a payload cap; extension of `pii-boundary.spec.ts` to the new module (**release gate**), including correcting that harness to use the production bootstrap helpers; trader-taxonomy completion across the four frontend files that consume it.

**Moved to chunk 3b:** the admin queue and detail screens, the **five admin endpoints**, duplicate detection, approve-and-publish, reject, the two `ActorAuditAction` members and two additive audit methods, and the approval/rejection notices.

> **Endpoint counts, twice corrected.** The proposal scoped 3 public + 4 admin. Judgment Day C-14 established the real figures as **4 public + 5 admin** — the design had added `GET /registrations/consent-policy` (which is what makes FR-3's "unknown policy version ⇒ 400" a reachable branch rather than dead code) and `POST /admin/registrations/:id/dismiss-duplicate` (FR-11 requires the *"not a duplicate"* judgement to persist). **After the split: 3a owns the four public endpoints; 3b owns the five admin ones.** §14's TRD-§4 amendment row is now 3a's four only — 3b amends §4 again for its five.

**Out of scope:** see §11.

## 5. Stakeholders / Personas

| Persona | Role | What this spec gives them |
|---|---|---|
| **Applicant** (prospective actor) | `Public`, anonymous — **new persona** | A way to enter the registry without going through the AT team; a reference code that works when email does not; visibility of their own submission's status and nothing else. |
| **Administrator** (program lead / data manager) | `Admin` | A queue, a full-detail review surface with the consent record and duplicate candidates, and two adjudication actions — one of which publishes PII and is therefore gated on a typed acknowledgement. |
| **Field/Data-entry staff** | `Staff` | **No new capability.** Adjudication is Admin-only: each approval is a publication decision about someone else's personal data (ADR-004). Staff continue to create actors directly. |
| **Public visitor** | `Public` | No visible change until a registration is approved, at which point the actor appears in the directory exactly like any other `GRANTED` actor. |
| **Program / legal team** | — | Owns the consent policy wording; engineering versions and stores it. A-1 **confirmed** (see §12). |

---

## 6. Functional Requirements

### FR-1: Public entry points into registration

- **Description:** The public site MUST offer two discoverable routes into the registration form: a persistent action in the public top nav, and a contextual call-to-action on the landing page.
- **Rationale / Source:** Epic outcome 3; PRD US-NEW-1 (§ added by this spec); mockup landing panel.
- **PII/RBAC impact:** None. Both are static links available to `Public`.

#### Scenario: Nav entry

- GIVEN an anonymous visitor on any public page
- WHEN they look at the top navigation
- THEN a **Register your organisation** action is present and links to `/register`
- AND it is visually distinct from **Staff sign-in**, which continues to serve `Staff`/`Admin`
- BUT it must NOT appear in the admin shell navigation, which is a different mode (`docs/ux-ui/design.md` DD-5)
- AND IT MUST be keyboard reachable with a visible focus ring and an accessible name that reads as an action, not a destination alone

#### Scenario: Landing CTA

- GIVEN an anonymous visitor on `/`
- WHEN they scroll past the hero actions
- THEN a CTA panel states that actors may add themselves and that **submissions are reviewed by the ACCELERATE team before publication**
- AND its action links to `/register`
- AND IT MUST state the review-before-publication fact, because a visitor who believes submission equals publication has been misled about what happens to their personal data

---

### FR-2: The registration form captures the submission set with validated input

- **Description:** `/register` MUST present a sectioned form — *Identity · Location · Crops & capacity · Contact · Data protection & consent* — and MUST validate every field against the same rules the authenticated admin create path enforces, so that an approved submission is directly publishable without re-entry.
- **Rationale / Source:** **Proposal** A-4 (field parity — `proposal.md` §10); proposal §4.2; mockup form panel. *(Corrected 2026-08-05 — Judgment Day A28·B25 PARTIAL. This cited "Epic A-4", which is the **consent-sufficiency** assumption, not field parity.)*
- **PII/RBAC impact:** The form collects `phone` and `email` (PII) and GPS from an anonymous caller. Nothing entered is readable back from any public endpoint (FR-8).

#### Scenario: Valid submission passes

- GIVEN an applicant who has completed every required field with valid values
- WHEN they submit
- THEN the payload is accepted and validated server-side against the same constraints as the admin actor-create DTO
- AND IT MUST be validated on the **server** regardless of any client-side validation, because the client is a static artifact an attacker controls

#### Scenario: Invalid submission is rejected with field-level errors

- GIVEN an applicant whose capacity is negative, whose email is malformed, and who has selected no main crop
- WHEN they submit
- THEN the request is rejected `400` with a `details` array carrying one entry per offending field
- AND the form renders an error summary naming the count of fields needing attention, plus an inline message on each offending field
- AND the summary and the inline messages agree — a field named in the summary is marked inline, and vice versa
- BUT it must NOT persist any Registration row
- AND IT MUST associate each inline error with its input via `aria-describedby`, and announce the summary through a live region, so a screen-reader user learns what failed without hunting

#### Scenario: GPS is optional and out-of-range GPS is rejected

- GIVEN an applicant who cannot supply coordinates
- WHEN they leave both GPS fields blank and submit
- THEN the submission is accepted, and the reviewer is responsible for placing the actor on the map
- AND the form states that leaving them blank is permitted
- BUT it must NOT accept a latitude outside [−90, 90] or a longitude outside [−180, 180] — those are rejected `400`, never silently nulled
- AND IT MUST reject a submission carrying exactly one of the two coordinates, since a half-coordinate cannot be plotted and would publish a false location

#### Scenario: Every canonical trader type is selectable

- GIVEN the canonical taxonomy carries **ten** trader types after chunk 1's FR-4
- WHEN an applicant opens the trader-type control
- THEN all ten are offered with human-readable labels
- BUT it must NOT offer only the original six, which is the current state of `frontend/lib/content/roles.ts` and would make four categories of organisation — including humanitarian/INGO actors, part of the client's named cohort — unable to describe themselves (see FR-15)

---

### FR-3: In-flow, versioned consent that cannot be bypassed or misrepresented

- **Description:** The form MUST make the Data Protection & Participant Consent Policy readable in place, MUST default its acceptance control to unaccepted, MUST block submission until acceptance is explicit, and MUST record the accepted **policy version** and acceptance **timestamp** with the submission. Acceptance MUST be validated server-side as a field, never trusted as a client assertion.
- **Rationale / Source:** Proposal §4.3, R-4; TRD ADR-004 (consent is *"the legal/ethical basis for publishing at all"*); mockup consent panel and expanded-policy state.
- **PII/RBAC impact:** This requirement *is* the lawful basis for later publishing `phone`, `email`, and exact GPS. Its failure does not degrade the feature — it invalidates every record the feature produces.

#### Scenario: Consent must be given before submission is possible

- GIVEN an applicant on a fully completed form who has not accepted the policy
- WHEN they attempt to submit
- THEN submission does not proceed and the consent requirement is stated
- BUT the acceptance control **must NOT** be pre-ticked, pre-selected, or accepted by default in any initial render
- AND IT MUST be possible to read the full policy text on the page itself, without navigating away and losing entered data

#### Scenario: The policy is readable before it is acceptable

- GIVEN an applicant who has expanded the policy but has not read to the end
- WHEN they look at the acceptance control
- THEN it is not yet enabled, and the interface says what remains (mockup: *"Keep scrolling — 2 of 6 sections read"*)
- AND once the end of the policy has been reached the control becomes enabled
- BUT this gating **must NOT** be the only thing standing between an unread policy and a published record — it is a UX affordance, and the server-side acceptance field (below) is the enforcement
- AND IT MUST remain operable by keyboard alone: a user who reaches the end of the policy by keyboard scrolling or by tabbing through it MUST be able to enable and tick the control without a pointer

#### Scenario: Server-side acceptance is mandatory

- GIVEN a crafted request that omits the consent-acceptance field, or sets it false, or sets it to a policy version the server does not recognise
- WHEN it reaches `POST /registrations`
- THEN it is rejected `400`
- BUT it must NOT create a Registration row in any of those three cases
- AND IT MUST record, on every accepted submission, the exact policy version string the applicant was shown — not the server's current version resolved at write time, since those differ if the policy is republished mid-session

#### Scenario: Consent is displayed at review, not inferred

- GIVEN a reviewer opening a registration detail
- WHEN they read the consent block
- THEN it states who consented, the policy version, and the acceptance timestamp
- AND IT MUST be the stored values that are shown, so a reviewer confirming *"consent is on file"* (FR-12) is confirming evidence rather than an assumption

---

### FR-4: Email verification by one-time code, before persistence

- **Description:** An applicant MUST prove control of the submitted email address by entering a one-time code sent to it. **No Registration row is written until the code has been verified.**
- **Rationale / Source:** Proposal §4.4, D1→A; epic A-2; risk R-1 (a submission flood is also an RDS connection flood, and TRD §12.4 defers RDS Proxy). Confirmed as authoritative over the mockup, which omits the step.
- **PII/RBAC impact:** The pre-verification store holds an email address and a code. It is not a Registration and is not readable by any caller.
- **Accepted cost — the one place email is load-bearing.** This requirement makes submission **impossible** without a delivered email, on a channel with a *realised* failure in this project (`backend/CLAUDE.md`: admin invites were converted to a no-email temporary-password handoff because `@cgiar.org` mail did not arrive). FR-14 and NFR-10 therefore scope email-independence to everything **after** submission; they do not and cannot cover this gate. There is no in-band fallback: an applicant whose code never arrives cannot register at all, and the remedy is operational (verified sending domain, SES sandbox exit, monitored bounce rate), not architectural. This is the deliberate trade the user accepted on 2026-08-04 in exchange for keeping unverified writes out of the database entirely. See R-1 in §12 and DC-22 in §8.

#### Scenario: The verified address is the published address

- GIVEN an applicant who verifies control of one email address
- WHEN the submission is later approved
- THEN the address that was verified is the address published as the actor's `email`
- BUT the submission **must NOT** carry a second, separate email field that could be published instead — one address is collected, verified, stored, and published, or FR-4's proof of control protects an address nobody ever sees
- AND IT MUST be that same address the review round-trip and every notification are sent to

> *Added 2026-08-05 — Judgment Day S-6.* The design defined a top-level verified `email` **and** a payload mirroring the admin DTO, which has its own `email`, without stating their relationship. Left unresolved, that ships either an unverified published contact address or a null one for the entire self-registered cohort.

#### Scenario: Code request and successful verification

- GIVEN an applicant who has entered a valid email address
- WHEN they request a code
- THEN a code is sent to that address and the request returns success **without disclosing whether the address was already known to the registry**
- AND WHEN they submit the form carrying a matching, unexpired code
- THEN the Registration is created
- BUT it must NOT create any Registration row at code-request time
- AND IT MUST return the same response shape and timing characteristics for a deliverable and an undeliverable address, so the endpoint is not an address-validity oracle

#### Scenario: Wrong, expired, or reused code

- GIVEN a submission carrying a code that is wrong, expired, or already consumed
- WHEN it reaches `POST /registrations`
- THEN it is rejected and no Registration row is created
- BUT it must NOT reveal which of the three conditions failed, since that distinction helps an attacker and helps a legitimate applicant not at all
- AND IT MUST bound the number of verification attempts per code, so a short code is not brute-forceable
- AND IT MUST increment that attempt counter on a **wrong** code, not only on a matching one. A counter that only advances when the guess is correct is not a bound at all — and since the throttler is per-container (`design.md` DD-5), this counter is the only shared control standing between a 6-digit code and an offline-parallel guesser. *(Clarified 2026-08-05 — Judgment Day S-1, where the designed lookup keyed on the code's hash and therefore could never observe a wrong guess.)*

---

### FR-5: Submission returns a reference and nothing else; the receipt makes it keepable

- **Description:** `POST /registrations` MUST return only the reference code. The receipt screen MUST present it prominently, make it copyable, explain what happens next in terms of behaviour this chunk actually implements, and tell the applicant to keep it.
- **Rationale / Source:** Proposal §4.5, §7, R-3; mockup receipt panel.
- **PII/RBAC impact:** The response body is the tightest point in the system where a leak would be invisible — it is the one public write response, and it must carry no echo of the payload.

#### Scenario: Response body is minimal

- GIVEN a successful submission
- WHEN the response is inspected
- THEN it carries the reference code
- BUT it must NOT echo any submitted field — not the organisation name, not the email, not the coordinates — because a response echo is a public read of unapproved PII by another name
- AND IT MUST NOT carry the Registration's internal `id`, which is the admin-detail key and must not become guessable public knowledge

#### Scenario: The receipt survives email failure

- GIVEN an applicant on the receipt screen
- WHEN they read it
- THEN the reference code is displayed as the primary content, with a copy action
- AND the screen instructs them to save it and states that it can be quoted to check status later
- AND a route to the status lookup (FR-6) is reachable from the receipt
- BUT it must NOT describe a review round-trip this chunk does not implement — the mockup's *"We may email you for more information… you'll get a link back to this form"* is chunk 4 behaviour and would be a false promise if shipped now
- AND IT MUST NOT present the reference code as an image or a canvas, so it can be selected and copied by assistive technology and by a user whose copy button fails

---

### FR-6: Public status lookup by reference and email

- **Description:** An applicant MUST be able to learn the status of their own submission by supplying the reference code **and** the matching submitter email. The response MUST carry status and the reviewer's note to the applicant, and nothing else.
- **Rationale / Source:** Proposal §4.5, §7; R-3 (*"the reference code + status lookup is the primary fallback, not a nicety"*).
- **PII/RBAC impact:** This is the only public endpoint that reads a Registration. It is therefore the highest-risk read surface in the spec and is gated on two factors the applicant holds and a guesser does not.

#### Scenario: Correct reference and email

- GIVEN a Registration with reference `REG-2026-0184` submitted by `neema@khsc.co.tz`
- WHEN a lookup supplies both, matching
- THEN the status is returned, together with the reviewer's note to the applicant if one exists
- BUT it must NOT return the stored payload, any submitted field, the internal `id`, the reviewer's identity, or any internal review metadata
- AND IT MUST compare the supplied email to the stored one case-insensitively, since a legitimate applicant will not reproduce their own capitalisation reliably
- AND IT MUST NOT carry the email address in a URL. Query strings reach request lines, `Referer` headers, browser history, and any access log later enabled — egress paths NFR-8's application-level assertion structurally cannot see. The lookup therefore takes its inputs in a request body. *(Added 2026-08-05 — Judgment Day C-11.)*

#### Scenario: A guessed reference discloses nothing

- GIVEN an attacker who has guessed or enumerated a valid reference code
- WHEN they look it up without the matching email
- THEN the response does not confirm that the reference exists
- BUT it must NOT differ — in status code, body shape, or message — between *"this reference does not exist"* and *"this reference exists but the email does not match"*
- AND IT MUST be rate-limited, so the email cannot be brute-forced against a known reference

---

### FR-7: Abuse resistance on every public registration path

- **Description:** Every public endpoint in this module MUST be rate-limited and MUST cap request body size. Rate limiting MUST take effect **before** any database write.
- **Rationale / Source:** Proposal R-1; epic R-2; TRD §12.4 (RDS Proxy deferred, so connection pressure is real); QA-8.
- **PII/RBAC impact:** Indirect but material — an unthrottled write path lets an attacker fill an admin-only table with PII-shaped garbage and starve the connection pool that serves the public directory.

#### Scenario: Flood is rejected cheaply

- GIVEN a caller exceeding the configured request rate on any public registration path
- WHEN the next request arrives
- THEN it is rejected with the standard error envelope and a `429`
- BUT it must NOT open a database connection or write a row to reach that decision
- AND IT MUST NOT leak internal detail or a stack trace in the rejection (QA-3, QA-10)

#### Scenario: Oversized payload is rejected

- GIVEN a request whose body exceeds the configured cap
- WHEN it arrives at any public registration path
- THEN it is rejected with a `400`-class error and the standard envelope
- AND IT MUST be rejected by the same shared bootstrap configuration used by both entrypoints, so the local server and the Lambda handler behave identically

---

### FR-8: No public path exposes any submitted field — release gate

- **Description:** No public endpoint, in any response, on any code path, SHALL return a stored `Registration` payload field, `submitterEmail`, internal `id`, reviewer identity, or any indication of whether a given organisation, phone number, or email address exists in the registry or the queue. `pii-boundary.spec.ts` MUST be extended to assert this over HTTP for every public path this module adds.
- **Rationale / Source:** Proposal §7 and R-2; epic R-1; TRD ADR-003, QA-1, QA-2. **This is a hard release gate**, in the same class as the existing PII boundary.
- **PII/RBAC impact:** This is the requirement the whole spec is organised around. A `Registration` sits outside every guarantee the codebase already proves: `PII_ALLOWLIST` and `NEVER_PUBLIC_FIELDS` enumerate `Actor` fields, and the ADR-004 consent `WHERE` filters `Actor` rows. Neither construct sees this table.

#### Scenario: Every public registration path is clean

- GIVEN the full set of public paths this module adds
- WHEN each is exercised end-to-end over HTTP with a Registration present in the store
- THEN no response body contains any payload field value, `submitterEmail`, internal `id`, or reviewer identity
- AND the assertion is made against **values** present in the fixture, not merely against key names, so a renamed key cannot pass
- BUT it must NOT be satisfied by inspecting a serializer in isolation — the proof is over HTTP, because that is the boundary an attacker reaches
- AND IT MUST fail the build when a new public path is added to the module without being covered, rather than silently omitting it

#### Scenario: The public form is not a membership oracle

- GIVEN an attacker probing the public form with a phone number or email address they suspect is in the registry
- WHEN they submit or request a code
- THEN the response is identical to one for an address or number that is absent
- BUT it must NOT return the mockup's applicant-facing duplicate hint, which names an existing actor's `traderId` and region — `traderId` is never public (TRD §8), and the hint would answer *"is this number registered?"* for any unauthenticated caller
- AND IT MUST keep duplicate detection entirely on the admin side (FR-11)

#### Scenario: Approved and rejected registrations stay non-public

- GIVEN a Registration that has been approved, and another that has been rejected
- WHEN any public path is exercised
- THEN neither registration's payload is retrievable
- AND IT MUST remain true that the published `Actor` created by an approval is the *only* public artifact of that registration — the Registration row itself never becomes readable, before or after adjudication

---

---

> ## FR-9 … FR-13 → moved to chunk 3b
>
> The five requirements below are **owned by `docs/specs/admin/registration-review-queue/`** as of the 2026-08-05 split. They are retained here in full, unrenumbered, because `judgment.md`'s ledger, the epic's decomposition table and 3b's proposal all cite these IDs — renumbering would silently break that audit trail, which is precisely the KZ-004 failure mode.
>
> **They are not obligations of this spec.** `tasks.md` for 3a owns none of them, and 3a's coverage closure excludes them. Treat them as pre-audited inherited material: each was reviewed by two blind judges, and the findings against them (C-1, C-7, C-12, S-2, S-4, S-7, A19·B22, RA1–RA5) are recorded in `judgment.md` with 3b's proposal §7.2 carrying the unresolved ones forward.

### FR-9: Admin registrations queue → **3b**

- **Description:** `Admin` MUST have a paginated, filterable, sortable queue of registrations with status segmentation, mirroring the conventions of the existing admin actors console.
- **Rationale / Source:** Proposal §4.6; epic outcome 4; mockup queue panel; R-6 (a burst from the named cohort could exceed 100 submissions).
- **PII/RBAC impact:** Admin-only. The queue renders organisation name and contact-person name, which are payload fields — so the endpoint is Admin-guarded and its serializer is an admin serializer, not the public one.

#### Scenario: Queue lists and segments by status

- GIVEN registrations in several statuses
- WHEN an Admin opens the queue
- THEN rows show reference, applicant, type, region, submitted date, review flags, status, and a review action
- AND status segments are available for the statuses this chunk can actually produce
- BUT it must NOT present a segment or control for `AWAITING_APPLICANT` or `WITHDRAWN`, which chunk 4 makes reachable — a control that can never return a row is a presence without a behaviour (KZ-002)
- AND IT MUST NOT present a *"No email"* flag: email is required and OTP-verified (FR-4), so the state the mockup's flag describes cannot occur

#### Scenario: Sorted oldest-first by default

- GIVEN a queue with submissions of differing ages
- WHEN it first loads
- THEN the oldest pending submission is first, so the longest-waiting applicant is reviewed first
- AND IT MUST keep filter and page state in the URL, so a reviewer can share or resume a queue view (`docs/trd/trd.md` §6)

#### Scenario: Only Admin reaches it

- GIVEN an authenticated `staff` user
- WHEN they call any admin registrations endpoint
- THEN the response is `403` with the standard envelope
- BUT it must NOT leak whether the requested registration exists
- AND IT MUST NOT rely on the client-side route guard for this — enforcement is server-side (TRD §8, QA-3)

#### Scenario: Page beyond the result set

- GIVEN a queue whose result set is smaller than the requested page
- WHEN the page loads
- THEN the empty state distinguishes *"nothing matches this filter or page"* from *"there are no registrations at all"*
- AND IT MUST NOT claim the queue is empty when it is not — the same defect is open on the actors table as carried-forward item R-7 from chunk 1, and this spec introduces a second URL-paged surface where it would recur

---

### FR-10: Admin registration detail with the consent record and an activity trail

- **Description:** `Admin` MUST be able to see every submitted field of one registration, the consent record, the duplicate assessment, and a read-only activity trail, on one screen, before adjudicating.
- **Rationale / Source:** Proposal §4.7; mockup detail panel; user decision (2026-08-04) to include the activity timeline and exclude internal notes, payload editing, and the location-consistency check.
- **PII/RBAC impact:** This is the one screen that renders the full PII-bearing payload. Admin-only, admin serializer, and the response is never reachable by `Public` or `Staff`.

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

#### Scenario: Activity trail is derived, not authored

- GIVEN a registration that was submitted, whose consent was recorded, and which has since been adjudicated
- WHEN the Admin reads the activity trail
- THEN it lists those events with timestamps, in order
- AND it lists a *"cleared as not a duplicate"* event when that judgement has been recorded, since that judgement **is** stored
- BUT it must NOT be a writable log or a note thread — internal notes are out of scope for this chunk (§11)
- BUT it must NOT claim a duplicate *check* occurred at a particular time. Detection runs at read time and is never persisted, so no such timestamp exists; presenting one would be a fabricated entry in the one surface whose purpose is an auditable consent trail
- AND IT MUST be derived from fields the registration already stores, so it cannot disagree with the record it describes

> **Amended 2026-08-05 — Judgment Day S-4.** The original scenario required a timestamped duplicate-check event *and* derivation from stored fields only. Those two clauses were mutually unsatisfiable: nothing stores a check time. The clause was corrected rather than a column added, because the derivation constraint is the one carrying the audit value.

---

### FR-11: Duplicate detection warns the reviewer; it never decides

- **Description:** At review time the system MUST surface candidate matches between the submission and existing actors, as a warning with enough context to adjudicate. It MUST NOT block, reject, merge, or auto-approve on the basis of a match.
- **Rationale / Source:** Proposal §4.10, R-5 (*"the same organisation may already exist as `OFB-1036`"* — chunk 2 imported ~1,318 rows under namespaced keys); mockup detail and queue flag.
- **PII/RBAC impact:** The comparison reads `phone` and `email` of existing actors. Admin-only, and the result is never surfaced publicly (FR-8).

#### Scenario: Candidate match is surfaced with context

- GIVEN a submission whose phone number matches an existing actor
- WHEN an Admin opens the detail
- THEN a warning names the number of candidates and, for each, the matching attribute and enough identity to judge it
- AND the queue row carries a corresponding flag so a reviewer can spot it before opening
- BUT it must NOT prevent approval, and it must NOT pre-select rejection
- AND IT MUST allow the reviewer to record that a candidate is **not** a duplicate, so the warning does not reappear identically at every subsequent visit

#### Scenario: Duplicate is a first-class rejection reason

- GIVEN a reviewer who has confirmed a submission duplicates an existing record
- WHEN they open the reject action
- THEN *"Duplicate of an existing registry record"* is an available reason
- AND IT MUST be recorded as the structured reason, not only as free text, so duplicates are countable later

---

### FR-12: Approve and publish — atomic, gated, audited

- **Description:** Approving a registration MUST, in a single transaction, create an `Actor` carrying the correct consent provenance, mark the registration approved with a link to the created actor, and write an audit entry. The action MUST be gated behind a typed acknowledgement that consent is on file. A failure at any step MUST leave no partial result.
- **Rationale / Source:** Proposal §4.8, §12; chunk 1 FR-2/FR-3 (provenance invariant on every consent write path); `backend/CLAUDE.md` (audit inside the same `$transaction`); archived `admin/bulk-actor-operations` (typed acknowledgement pattern); mockup approve modal.
- **PII/RBAC impact:** This is the moment private data becomes public. `Admin` only. It writes `consentStatus = GRANTED`, which is precisely the state ADR-004 makes publishable — so the acknowledgement gate is the human checkpoint on an irreversible disclosure.

#### Scenario: Approval publishes with correct provenance

- GIVEN a pending registration whose consent is recorded
- WHEN an Admin approves it after entering the acknowledgement exactly
- THEN an `Actor` is created with `registrationSource = SELF_REGISTERED`, `consentStatus = GRANTED`, `consentMethod = PORTAL_CHECKBOX`, `consentObtainedAt` equal to the stored acceptance timestamp, and `consentReference` equal to the registration reference
- AND the registration's status becomes approved and records the created actor and the acting reviewer
- AND an audit entry is written attributing the action to the acting admin resolved **server-side**
- AND only the publishable subset of the payload is written to the `Actor`; fields with no `Actor` column are not published
- AND IT MUST satisfy chunk 1's consent-provenance invariant rather than bypass it — this is a fourth consent write path and must go through the same shared check

#### Scenario: The acknowledgement gate is real

- GIVEN an Admin in the approve modal
- WHEN the acknowledgement text has not been entered exactly
- THEN the confirm action is unavailable
- AND the modal states what approval will do — that it creates an actor and publishes contact details and coordinates to the public directory
- BUT the gate **must NOT** be client-only: a crafted request that omits or misspells the acknowledgement is rejected server-side
- AND IT MUST name the policy version and acceptance date the reviewer is attesting to, so the acknowledgement is about a specific consent record rather than a general belief

#### Scenario: Atomicity under failure

- GIVEN an approval where actor creation succeeds and the audit write then fails
- WHEN the transaction resolves
- THEN nothing is committed: no `Actor`, no status change, no audit row
- BUT it must NOT leave an orphan `Actor` published without an approved registration behind it, and it must NOT leave a registration marked approved with no actor
- AND IT MUST be structurally provable: every write sits inside one `$transaction` callback, a throw at any step propagates unswallowed, and no `catch` absorbs it

> **Amended 2026-08-05 — Judgment Day S-3 residue.** This clause previously read *"AND IT MUST be provable by a test that forces the failure, not asserted from reading the transaction boundary."* **§8 DC-24 declares that unachievable in this repo** — every backend suite substitutes an in-memory Prisma mock, and `lambda-handler.e2e.spec.ts:51` implements `$transaction` as a pass-through with no rollback semantics. The document was asserting and denying the same gate in two places. The clause now demands what *is* provable; DC-24 records what is not, and names adopting a DB-backed harness as the out-of-scope work that would close it. **This scenario is owned by chunk 3b**, which must inherit the amended form, not the original.

#### Scenario: Double approval is refused

- GIVEN a registration already approved
- WHEN an approval is submitted for it again
- THEN it is refused with the standard envelope
- AND IT MUST NOT create a second `Actor`, since `traderId` uniqueness would either collide or produce a duplicate public record depending on how the key is generated

#### Scenario: The generated natural key does not collide with imported keys

- GIVEN chunk 2 imported actors under namespaced natural keys (`OFB-`, `OFS-`, `OFG-`, `BBB-`, `HUM-`, `DSP-` and siblings)
- WHEN an approval generates a `traderId` for a self-registered actor
- THEN the generated key is unique across the whole table and distinguishable from every imported namespace
- BUT it must NOT reuse a prefix chunk 2 already claimed. Chunk 2 fixed **eight** — `OFB · OFS · OFG · BBB · HUM · DSP · SDC · QDS` — and it must not be the mockup's `TZ-`, which the seed data already uses as `TZ-SEED-*`
- AND IT MUST be generated server-side, never supplied by the applicant, since `traderId` is a non-public identifier the applicant has no business choosing
- AND IT MUST handle a collision as a recoverable, explained error rather than an unhandled fault. The admin create path accepts **any** client-supplied `traderId` with no format constraint, so a colliding key can pre-exist; an unhandled Prisma uniqueness violation inside the approval transaction would surface as a `500` and leave that registration permanently unapprovable with no operator path forward. *(Added 2026-08-05 — Judgment Day S-2, which falsified the claim that a reference-derived key is collision-free "by construction". Prefix counts corrected from six to eight, and the `TZ-` claim retracted — A14, B19.)*

---

### FR-13: Reject with a structured reason; no actor is created

- **Description:** Rejecting a registration MUST record a structured reason and an optional note to the applicant, MUST NOT create an `Actor`, and MUST be audited.
- **Rationale / Source:** Proposal §4.9, §12; mockup reject modal.
- **PII/RBAC impact:** `Admin` only. The note is later readable by the applicant through the status lookup (FR-6), so it is applicant-facing text and must be treated as such.

#### Scenario: Rejection is terminal for this chunk

- GIVEN a pending registration
- WHEN an Admin rejects it with a reason
- THEN its status becomes rejected, the reason and note are stored, and an audit entry is written
- AND the interface states that rejection cannot be undone from that screen and that the applicant must submit again
- BUT it must NOT create an `Actor`, publish any field, or alter the stored consent record
- AND IT MUST make the reason mandatory, because a rejection with no recorded reason is unauditable and leaves the applicant nothing actionable

#### Scenario: The note reaches the applicant through the fallback channel

- GIVEN a rejected registration carrying a note
- WHEN the applicant looks it up by reference and email
- THEN the status and the note are returned
- AND IT MUST work with email delivery disabled, since the note is the only explanation the applicant gets and email is a known-unreliable channel in this project

---

### FR-14: Notifications carry the reference and are never the only channel

- **Description:** The system SHOULD email the applicant on submission, approval, and rejection. Every message MUST carry the reference code. **No part of the flow after submission MAY depend on email delivery for correctness.** The single deliberate exception is FR-4's verification gate, which precedes submission and is documented there as an accepted cost — this requirement does not cover it and must not be read as promising otherwise.
- **Rationale / Source:** Proposal §4 and R-3; epic A-3, R-3 (admin invites were converted to a no-email temporary-password handoff because `@cgiar.org` mail did not arrive — `backend/CLAUDE.md`).
- **PII/RBAC impact:** Messages are addressed to the verified submitter and MUST NOT include another registration's data. Message bodies MUST NOT be logged.

#### Scenario: The whole flow works with email disabled

- GIVEN email sending disabled or failing
- WHEN an applicant submits, and an Admin later approves or rejects
- THEN the applicant can still learn the outcome by looking up the reference they were shown on the receipt screen
- BUT a send failure **must NOT** fail the submission, the approval, or the rejection — the record of the decision is the database, not the mailbox
- AND IT MUST log the send failure in a way an operator can find, since a silently dropped notification is indistinguishable from a delivered one otherwise

#### Scenario: A send failure does not roll back an adjudication

- GIVEN an approval whose notification send fails
- WHEN the operation completes
- THEN the `Actor` is published and the registration is approved
- AND IT MUST NOT place the send inside the adjudication transaction, since a mail-provider outage would then block publication entirely

---

### FR-15: The public form's taxonomy matches the canonical taxonomy

- **Description:** The frontend trader-type source MUST carry all ten canonical trader types with labels, so that the public form, and every other surface reading it, can represent every actor category the backend accepts.
- **Rationale / Source:** Chunk 1 carried-forward item **R-3**, still open: `frontend/lib/content/roles.ts` keys on the original six and gates both the admin filter dropdown and `ActorForm`'s select, while `backend/src/common/normalize.ts` carries ten. FR-2's trader-type scenario depends on this.
- **PII/RBAC impact:** None.
- **Scope correction, 2026-08-05 (Judgment Day C-6).** This is **not** a one-file change. `roles.ts` derives its key type from a **six-member union in `lib/api/actors.ts`**, so widening the taxonomy requires that union, plus `RoleBadge.tsx`'s `ROLE_BG_CLASS` and `ROLE_CSS_VAR` maps and `MapLegend.tsx`'s `TRADER_TYPES` array — **four files**. All three maps are total `Record<TraderType, …>` (`RoleBadge.tsx:29`, `:43`, `roles.ts:35`), so a missing entry is a **compile error** and `npm run build` is the real guard. *(Corrected 2026-08-05 — RB10, and note the correction's own history: `design.md` was fixed first and this sibling sentence was left asserting the opposite, which is precisely the KZ-004 failure mode of treating a finding's cited site as the only site.)* One consumer **does** fail quietly and must be checked separately: `frontend/components/map/LeafletMap.tsx:67` relies on a `?? '--color-muted'` fallback.

#### Scenario: All ten types are available and labelled

- GIVEN the canonical taxonomy in the backend carries ten trader types
- WHEN any frontend surface renders a trader-type choice or label
- THEN all ten are present with human-readable labels and a legend colour token
- BUT it must NOT fall back to rendering a raw snake_case value for the four types added by chunk 1
- AND IT MUST take its colour tokens from `docs/ux-ui/design.md` §7, never a hardcoded hex value

---

## 7. Non-Functional Requirements

| ID | Requirement | Measure |
|---|---|---|
| **NFR-1** | **PII boundary (release gate).** No public path returns any `Registration` payload field, `submitterEmail`, internal `id`, or reviewer identity. | Zero occurrences of fixture values for those fields across **every** public path in the module, asserted end-to-end over HTTP in `pii-boundary.spec.ts`. Extends TRD QA-1 to a table QA-1 does not currently cover. **Build fails on violation.** |
| **NFR-2** | **Consent integrity.** Acceptance is server-validated; the accepted policy version and timestamp are stored verbatim and never rewritten. | A submission without valid server-side acceptance yields `400` and zero rows. For an approved registration, `consentObtainedAt` on the `Actor` equals the stored acceptance timestamp exactly, and `consentMethod = PORTAL_CHECKBOX`. |
| **NFR-3** | **Adjudication atomicity.** Approval is all-or-nothing across actor creation, status change, and audit. | **Measure amended 2026-08-05 (DC-24).** Gated: every write occurs inside one `$transaction` callback; a throw at any step propagates and is not swallowed; a forced throw leaves the mock's write set empty downstream of it. **Not gated:** that MySQL actually rolls back — the harness mocks Prisma, so real rollback cannot be exercised. The original measure demanded "fault injection, not inspection" and was unachievable in this repo; claiming it would have been a false gate on the spec's one irreversible operation. |
| **NFR-4** | **Abuse resistance.** Public paths are rate-limited and size-capped, and rejection precedes any DB write. | A request over the limit returns `429` with no DB round-trip; a body over the cap returns a `400`-class envelope. Both entrypoints (`main.ts`, `lambda.ts`) behave identically, proven through the real Lambda handler harness. |
| **NFR-5** | **Accessibility (WCAG 2.1 AA).** All new screens are keyboard operable with visible focus, labelled controls, `aria-describedby` field errors, and live-region error announcement. Motion respects `prefers-reduced-motion`. | `jest-axe` clean on every new screen and component **for the rules jsdom can evaluate**. Contrast, focus order, focus visibility, and the consent scroll-gate are **explicitly not covered** by that gate — see §8. |
| **NFR-6** | **Token conformance.** No hardcoded colours, radii, shadows, or durations in new components. | Every colour, radius, shadow, and duration resolves to a token from `docs/ux-ui/design.md` §7 via `tailwind.config.ts`. Grep-verifiable: zero hex literals in new frontend files. |
| **NFR-7** | **Static-export conformance.** No SSR, ISR, or Next route handlers are introduced. | `frontend` build succeeds under `output: 'export'`; the reference code, the OTP exchange, and the lookup are all client-side against the API (ADR-002, proposal R-7). |
| **NFR-8** | **Observability without PII.** Adjudication and submission emit structured logs; no log line carries a payload field, an email address, a phone number, or an OTP. | Structured entries carry request id, route, role, latency, and the reference code. A test asserts that PII fixture values do not appear in emitted log output for the submission and adjudication paths. |
| **NFR-9** | **Queue performance.** The queue stays paginated and indexed at the volume R-6 anticipates. | The queue query is indexed on the status/date access pattern and never unbounded. **No numeric latency budget is set** — consistent with TRD OQ-TRD-1, which records honestly that QA-5 has no agreed p95. Inventing one here would be a figure with no measurement behind it. |
| **NFR-10** | **Email independence after submission.** Every applicant-visible **outcome** is reachable without email. Scoped deliberately: FR-4's verification gate is the one step this does **not** cover. | With sending disabled, an applicant who already holds a reference code can reach status and outcome — including a rejection note — with no mail delivered. The measure starts at a submitted registration, because a submission cannot be reached without the OTP (FR-4). Stating the scope is the point: an unscoped "email independence" claim would be false. |

---

## 8. Defect Classes & Their Gates

**A gate blind to the defect class this spec most often produces is not a gate.** This section names what can go wrong, and what actually catches it. Where nothing automated can, that is stated rather than papered over.

| # | Defect class this spec can produce | Gate that catches it |
|---|---|---|
| **DC-1** | A public path returns an unapproved submission's PII | `pii-boundary.spec.ts` extension over HTTP, asserting fixture **values** for every public path in the module (NFR-1). **Release gate.** |
| **DC-2** | A response echoes a submitted field (submit response, error message, validation `details`) | Same suite, asserted against the `POST /registrations` and error-path responses specifically — an error envelope that reflects input back is the easiest leak to miss |
| **DC-3** | Consent bypassed — row created without server-validated acceptance | Backend negative tests: missing / false / unknown-version acceptance each yield `400` and zero rows |
| **DC-4** | Consent misrecorded — wrong version or a server-resolved timestamp instead of the applicant's | Backend test comparing the stored version and timestamp to the submitted ones, and the published `Actor`'s `consentObtainedAt` to the stored acceptance time |
| **DC-5** | Approval leaves a partial result (orphan actor, or approved-with-no-actor) | **Partially gated — see DC-24.** What *is* gated: that every write sits inside one `$transaction` callback and that a throw propagates rather than being swallowed. What is **not**: that the database actually rolls back |
| **DC-6** | Approval writes wrong provenance | Backend test asserting all four provenance fields on the created `Actor`, by value. **This is the whole gate.** *(Amended 2026-08-05 — A22·B31 residue. This row previously added "plus a test that the shared invariant is the code path taken", which is a **presence assertion that cannot fail**: with `stored = null`, `GRANTED`, `PORTAL_CHECKBOX` and a non-null date, `isConsentProvenanceSatisfied` — `consent-provenance.policy.ts:81-119` — returns true on every path. Keeping it listed as a gate inflated this table with something that certifies only that a function was called, which is the exact KZ-002 shape the table exists to expose. The invariant call is retained in `design.md` DD-3 as **drift protection**, explicitly not as a gate.)* |
| **DC-7** | Generated `traderId` collides with a chunk-2 imported key | Backend test over the generation function against the imported namespaces; uniqueness constraint as the backstop |
| **DC-8** | Admin endpoint reachable by `Staff` or anonymous | Guard tests per endpoint returning `403`/`401`, independent of the serializer (QA-3) |
| **DC-9** | Rate limit or payload cap absent on a path, or configured on only one entrypoint | Endpoint tests for `429`/oversize, plus `lambda-handler.e2e.spec.ts` exercising the real handler — the only harness that catches bootstrap divergence (`backend/CLAUDE.md`) |
| **DC-10** | The status lookup distinguishes "no such reference" from "wrong email" | Backend test asserting byte-identical response for both cases |
| **DC-11** | A queue control exists but can never act (`AWAITING_APPLICANT` segment, "No email" flag) | Frontend component test asserting the control is absent — this is a **presence** assertion and can only prove absence, which is the direction that matters here |
| **DC-12** | Frontend renders a raw snake_case trader type, or offers only six of ten | Frontend test over the taxonomy source asserting ten labelled entries, plus a form test asserting ten options |
| **DC-13** | A hardcoded colour or duration enters a new component | Grep gate for hex literals in the spec's new frontend files; `npm run lint` |
| **DC-14** | PII or an OTP appears in a log line | Log-capture test on the submission and adjudication paths asserting fixture PII values are absent |
| **DC-15** | The static export breaks (a route handler or server component sneaks in) | `cd frontend && npm run build` |
| **DC-23** | **A non-publishable payload field reaches the created `Actor`** — most plausibly `contactPerson` → `Actor.position`, which publishes a named natural person | Backend test asserting, on the actor created by approval, that no non-publishable payload value appears in **any** column — asserted against fixture values, not field names, so a renamed target still fails. *(Added 2026-08-05 — S-7. This class was absent from the original enumeration despite being a PII-disclosure path.)* |
| **DC-26** | The `429` body diverges from the documented error envelope | Endpoint test asserting the `429` carries `{ statusCode, message, error }`. `ThrottlerException` does not produce `error` by default, so this needs an explicit filter — the gate exists to catch its absence. *(Added 2026-08-05 — A21.)* |

### Classes with **no** automated gate — substituted or accepted

| # | Class | Why no gate | Substitute |
|---|---|---|---|
| **DC-16** | **Contrast, focus order, focus visibility** on the new screens | Under jsdom, `jest-axe`'s `color-contrast` rule returns **incomplete**, and `toHaveNoViolations` does **not** fail on incomplete. This exact gap was accepted as chunk 1's **NFR-5 WARN**; repeating it as if covered would be the second recurrence of KZ-002. | **Human check at the Phase-3 HITL pause**, on a real browser render, against `docs/ux-ui/design.md` §7 contrast guidance — with the note there that `--color-accent` and `--color-highlight` fail AA for small body text. Chunk 1's KZ-003 applies: these components take plain props, so a throwaway harness renders them with **no stack, no database, and no login** — this check must not be deferred on auth grounds. |
| **DC-17** | **The consent scroll-gate actually gates** | Whether the acceptance control enables only after the policy is scrolled to its end is a **layout and scroll-geometry** property. jsdom reports zero-height elements and does not lay out or scroll, so a test can assert the handler is wired but cannot prove the gate fires at the real end of the real text. A green test here would certify a control that enables immediately, or never. | Two-part: (a) a component test on the enabling **predicate** with injected scroll metrics, which proves the logic; (b) a **human check** in a real browser that the control is disabled on open and enabled at the end of the policy. (a) alone is a presence assertion and must record that it cannot prove (b) — KZ-002. |
| **DC-18** | **Email actually arrives** | SES deliverability cannot be gated in CI, and it is a **realised failure in this project** — admin invites were deliberately converted to a no-email temporary-password handoff because `@cgiar.org` mail did not arrive. | Not gated, by design. NFR-10 makes email non-load-bearing instead: the reference-code path is tested with sending disabled, so the flow is proven **without** the untestable dependency rather than despite it. |
| **DC-19** | **Rate limiting holds under real concurrent load** | Jest gives sequential requests against one process. It can prove the limiter rejects past a threshold; it cannot prove behaviour across concurrent Lambda executions, where an in-memory counter per container is a different control from a shared one. | **Accepted risk, recorded.** The functional gate (DC-9) proves the limiter exists and rejects. The distributed-correctness question is a design decision (`design.md`) and, if the chosen mechanism is per-container, that limitation is documented rather than tested away. |
| **DC-20** | **OTP entropy and brute-force resistance in practice** | A test can prove attempts are bounded and codes expire. It cannot establish that the code space and lockout are jointly sufficient against a distributed attacker. | Gate the bound and the expiry (FR-4); record the code length, lifetime, and attempt cap as explicit design parameters in `design.md` so the choice is reviewable rather than implicit. |
| **DC-21** | **The consent policy text is legally adequate** | Not an engineering property. Engineering versions and stores the text; it cannot evaluate the wording. | Out of scope by the epic's own boundary. A-1 is **confirmed** (§12), so the mechanism is the deliverable and the wording is the program/legal team's. |
| **DC-24** | **Transaction rollback is never actually exercised** — NFR-3's "fault injection, not inspection" is unachievable | Every backend suite substitutes an in-memory Prisma mock; `lambda-handler.e2e.spec.ts:51` implements `$transaction` as a pass-through with no rollback semantics, and the repo has no DB-backed test setup. A "forced failure at step N" test can only assert which mock calls occurred — which **is** inspection, the very thing NFR-3 excluded. | **Accepted risk, recorded — this was a false gate, not a missing one.** Substitutes: (a) assert structurally that all writes are inside the single `$transaction` callback and that no `catch` swallows a throw; (b) the migration rehearsal already runs against real MySQL, so the *rollback semantics of MySQL* are not what is in doubt — only our use of them. Adopting a DB-backed test harness would close this properly and is explicitly **out of scope** for this spec; recorded as a follow-up. *(Added 2026-08-05 — S-3. `requirements.md` previously claimed this class was gated, which was the dishonest row in an otherwise honest table.)* |
| **DC-25** | **A queue index is dropped or split, silently** — NFR-9's "uses the composite index" is unprovable | Index usage requires `EXPLAIN` against real MySQL; the harness mocks the datasource. A test can only assert the `where`/`orderBy` shape, which is a presence assertion. | **Accepted risk, recorded.** The assertable part (pagination present, `where`/`orderBy` shape stable) is gated; index *usage* is not. Chunk 1's carried-forward R-9 is the same class. *(Added 2026-08-05 — A27·B27.)* |
| **DC-22** | **An applicant is locked out because their OTP never arrives** | Undeliverable mail is not observable from inside the application, and it is not a code defect — the code path is correct and the applicant is still stuck. No test can distinguish "sent and lost" from "sent and read". | **Accepted risk, recorded, with an operational owner.** FR-4 documents this as the one step where email is load-bearing. Required before go-live rather than gated in CI: a verified sending domain, SES sandbox exit, and a monitored bounce/complaint rate. `design.md` must additionally log every send attempt and failure (NFR-8) so a lockout is diagnosable after the fact instead of invisible — that logging **is** testable and is the part this spec owns. |

---

## 9. Design-Relevant Decisions Surfaced During Requirements

Recorded here because each was settled while writing requirements and constrains `design.md`. All divergences from the mockup are listed — the client stated it is *"not a final design, and some of the texts shown there would not necessarily stay as they are"*, so it is treated as **flow-authoritative and copy-provisional**.

### D-1: The mockup omits the OTP step; the OTP wins

The mockup goes form → receipt with no verification. Proposal §4.4 and epic A-2 both specify email verification before persistence, and R-1 makes it the primary control on the first unauthenticated write path. **Confirmed by the user (2026-08-04): keep the OTP gate.** The registration flow therefore gains a step the mockup does not draw, and `design.md` owes it a screen state.

### D-2: The applicant-facing duplicate hint is removed

The mockup's form shows *"An organisation with this phone number is already in the registry (TZ-0421, Kilimanjaro)."* That discloses `traderId` — which TRD §8 lists among fields that are **never public** — and turns the public form into an oracle answering *"is this phone number in the registry?"* for any unauthenticated caller. **Confirmed by the user: duplicate detection is review-time only** (FR-8, FR-11). One mockup panel is not implemented.

### D-3: Bulk adjudication is excluded

The mockup's queue shows a *"2 selected → Approve & publish"* bar. Proposal R-6 states the opposite: *"Bulk approve is **not** in scope — each publication is a consent decision."* **Confirmed by the user: excluded.** Adjudication is per-record.

### D-4: The reviewer cannot edit the payload before approving

The mockup's detail screen offers *"Edit before approving"*. The epic's chunk-4 non-goals rule this out directly: *"the applicant supplies their own corrections — otherwise the record stops being self-declared and the consent basis blurs."* A reviewer-edited record would be published as consented-to when it is not what was consented to. **Confirmed by the user: excluded.** A submission is approved as submitted, or rejected.

### D-5: The GPS/district consistency check is excluded

The mockup's *"Falls inside Hai district, Kilimanjaro — consistent with the stated region"* requires a Tanzania administrative-boundary dataset the project does not have and has never specified. **Excluded** (§11). The detail screen shows the submitted coordinates and a link to the map instead.

### D-6: The activity trail is in; internal notes are out

**Confirmed by the user:** the read-only activity trail is included because it is derived entirely from fields the registration already stores — no column, no endpoint, and it makes the consent trail legible at the moment of adjudication. The mockup's *"Internal notes"* thread would add a column and a write path; the proposal's single `reviewNote` covers the reviewer's applicant-facing message, which is what FR-13 needs. **Excluded** (§11).

### D-7: `AWAITING_APPLICANT` and `WITHDRAWN` exist in the enum but get no UI

The proposal defines all five status values so chunk 4 needs no migration. Chunk 4 makes two of them reachable. Rendering a queue segment for a status that cannot occur ships a control with no behaviour — the exact shape of KZ-002. The enum values are declared; the segments are not (FR-9).

### D-8: The `traderId` namespace is a decision, and the mockup's is wrong

The mockup generates `TZ-0908`. Chunk 2 namespaced every imported key by source sheet (`OFB-`, `OFS-`, `OFG-`, `BBB-`, `HUM-`, `DSP-` and siblings); `TZ-` matches nothing this registry uses, and the mockup also shows an *existing* actor as `TZ-0421`, which no imported record is. Proposal OQ-3 suggested `SR-2026-0184`. **This spec requires a distinct, non-colliding, server-generated namespace (FR-12) and leaves the exact literal to `design.md`** — it is one constant, and it must be chosen against chunk 2's real prefixes rather than the mockup's invented one. **Resolves OQ-3.**

### D-9: Two submitted fields have no `Actor` column — and that is fine

The mockup collects **Contact person** and **Other crop(s)**. `Actor` has neither: `position` is a job title, not a person's name, and `crops` is a many-to-many over exactly three canonical crops. This is a partial failure of **this proposal's** assumption **A-4** (*"the self-registration form collects the same fields as the admin create form"* — `proposal.md` §10). Rather than growing the `Actor` schema for two free-text fields, both stay in the admin-only `payload` as **review context that is never published** (FR-10). A-4's real intent — that an approved submission is directly publishable without re-entry — holds for every field that has somewhere to go.

> **Attribution corrected 2026-08-05 — Judgment Day C-INFO (A28·B25).** This previously cited *epic* assumption A-4. The epic's A-4 is the **consent-sufficiency** assumption (the same claim as this spec's A-1, which is **confirmed**); field parity is the proposal's A-4. The miscitation had been copied into both `requirements.md` and `design.md` — KZ-005's exact shape — and would have led an auditor tracing D-9 upward to conclude the consent basis was partially failed.

**The publishable-subset boundary needs a gate, not just a mechanism.** Mapping `contactPerson` onto `Actor.position` is a live risk precisely because `position` *looks* like the right home for it — and doing so would publish a named natural person to the public directory. That defect class is now DC-23 in §8. *(Added 2026-08-05 — Judgment Day S-7.)*

### D-10: The receipt's step 2 copy describes chunk 4

The mockup receipt promises *"We may email you for more information… you'll get a link back to this form with the reviewer's notes."* That is chunk 4's round-trip, and it is not built here. Shipping the copy would promise a behaviour that does not exist. **Rewritten for what this chunk does** (FR-5), and the status-lookup route — which the mockup receipt omits entirely in favour of emailing the registry team — is surfaced, because R-3 makes it the primary fallback rather than a nicety.

### D-11: Approval is a fourth consent write path

Chunk 1 delivered a shared consent-provenance invariant enforced on **four** write paths (admin create, admin update, bulk set-consent, per-row import), triggering on value change. Approval is a **fifth** caller of that invariant and must go through it, not around it (FR-12). Inlining an equivalent check would reproduce exactly the defect chunk 1's DD-1 was written to prevent.

### D-12: The audit action taxonomy does not cover adjudication

`ActorAuditAction` carries `CREATE · UPDATE · DELETE · BULK_CONSENT · BULK_DELETE · IMPORT`. Approval is a create *with a distinct provenance and a distinct authority*, and rejection touches no actor at all. Whether adjudication reuses `CREATE` or gets additive enum members is a `design.md` decision; FR-12 and FR-13 only require that the action be auditable and attributable to the server-resolved acting admin.

---

## 10. Data & Schema Impact

Additive only. **Three new schema objects** — one enum and two models. **3a changes no existing table's structure.** `Actor` gains rows via approval, using columns chunk 1 already shipped — and that approval is **chunk 3b**, which is also where the one structural change in this epic lives: widening `ActorAuditAction`, emitted on MySQL as `ALTER TABLE \`ActorAuditLog\` MODIFY \`action\` ENUM(...)`.

> *Corrected 2026-08-05 — Judgment Day C-10 residue.* This paragraph previously said "Two new schema objects" against a table listing three, and asserted "no change to … `ActorAuditLog` structure" ten lines above the disclosure that the audit enum *is* modified. Both were stale rather than wrong-in-spirit: after the split, `ActorAuditLog` genuinely is untouched **by 3a** — but saying so without naming 3b's `MODIFY` is how the C-10 defect reappeared in the paragraph written to disclose it.

| Object | Change | PII |
|---|---|---|
| `RegistrationStatus` (enum) | **New.** `PENDING_REVIEW · AWAITING_APPLICANT · APPROVED · REJECTED · WITHDRAWN`. Two values are declared but unreachable in this chunk (D-7), so chunk 4 needs no enum migration. | — |
| `Registration` (model) | **New.** Submission record: reference, status, payload, submitter email, verification and consent timestamps, policy version, adjudication outcome and reviewer, published actor link, reason and note. | **Yes — payload and submitter email.** |
| `ActorAuditAction` (enum) | **Two additive members** for adjudication (D-12). | — |
| `EmailVerification` (model) | **New.** The pre-verification store: email, hashed code, attempt counter, expiry, single-use marker (FR-4). Also carries the per-email send-rate window. | **Yes — email address.** |
| `Registration` — lookup bounding | Additional columns bounding lookup attempts per reference, so FR-6's brute-force clause has a **shared, persistent** control rather than a per-container one. | — |

**Migration reality — corrected 2026-08-05 (Judgment Day C-10).** Two new tables and their indexes are `CREATE TABLE`. But extending `ActorAuditAction` on **MySQL** emits `ALTER TABLE \`ActorAuditLog\` MODIFY \`action\` ENUM(...)` — the in-repo precedent is `backend/prisma/migrations/20260710132750_add_import_audit_action/migration.sql`. So the migration is **not** free of `MODIFY`, and an earlier draft of this section wrongly said it was (and described the change in Postgres vocabulary for a MySQL datasource). The change is **additive in semantics** — it only widens an enum's accepted values, destroys no data, and rewrites no rows — which is what `backend/CLAUDE.md`'s additive-only rule protects. **This is disclosed here so the migration task's done-criteria assert what the generated SQL will actually contain**; a criterion demanding "no `MODIFY`" would FAIL a correct migration, or worse, invite hand-editing it.

**New PII declarations.** `Registration.payload` and `Registration.submitterEmail` are PII, and the pre-verification store holds an email address. These are **not** `Actor` fields, so they do not belong in `PII_ALLOWLIST` or `NEVER_PUBLIC_FIELDS` — both enumerate `Actor` columns for the role-aware serializer. Their protection is structural: **the table has no public read path for any submitted field** (FR-8). `design.md` must state how that structural guarantee is made checkable, because "there is no endpoint" is a property of today's code, not an invariant a future endpoint would trip over.

**Migration:** one migration, additive in semantics: two `CREATE TABLE`, one new enum-typed column, its indexes, and the two audit-enum values (which arrive as the `MODIFY` disclosed above). **No `DROP`, no data `UPDATE`, no column narrowed or retyped.** Rehearsed on local MySQL before RDS apply, per `backend/CLAUDE.md`. Note that chunk 1's cited precedent (`20260803182419_…`) was `ADD COLUMN` only and never extended an existing enum, so it is a precedent for the additive-only *posture*, not for this exact SQL.

---

## 11. Out of Scope

Non-goals of the proposal (§6), carried forward:

- **The information-request round-trip and applicant withdrawal** — chunk 4 (`admin/registration-info-requests`). `AWAITING_APPLICANT` and `WITHDRAWN` are declared but unreachable.
- **Public accounts or Cognito self-signup.** Applicants never hold credentials.
- **Self-service editing after publication.** Corrections go through the AT team.
- **Automatic publication.** No submission reaches the public without an Admin acting on it — non-negotiable under ADR-004.
- **Automatic duplicate rejection or merge.** Detection warns a human; it never decides (FR-11).
- **Swahili translation** of the form or the policy. Copy stays externalizable.
- **The legal wording of the consent policy.** Engineering versions and stores it.
- **File uploads** — logos, certificates, signed consent documents.

Added by this spec, from mockup panels deliberately not implemented (§9):

- **Bulk approve / bulk reject** from the queue (D-3).
- **Reviewer editing of the submitted payload** before approving (D-4).
- **GPS/district consistency validation** — needs an administrative-boundary dataset the project does not have (D-5).
- **Internal notes thread** on a registration (D-6).
- **"Export queue (CSV)"** — a new PII-bearing admin export surface, unscoped by the proposal and not required by any requirement here.
- **Applicant-facing duplicate feedback** on the public form (D-2).
- **Actor-level "self-declared" badge in the public directory** — proposal OQ-2, a product decision, deferred (§13).

Explicitly **not** deferred, despite belonging to another spec's follow-up list:

- **Frontend trader-taxonomy completion** (FR-15). It is chunk 1's open item R-3, nominally homed in chunk 2 — which archived on 2026-08-05 without closing it. FR-2 cannot be met while it is open, so this spec closes it.

---

## 12. Dependencies & Assumptions

### Dependencies

| # | Dependency | Status |
|---|---|---|
| **DEP-1** | **Chunk 1** — `registrationSource`, `consentMethod`, `consentObtainedAt`, `consentReference` on `Actor`, plus the shared consent-provenance invariant. | **Met.** Archived 2026-08-04, validated PASS. Verified present in `backend/prisma/schema.prisma`. |
| **DEP-2** | **`ActorAuditService`** writing inside the caller's `$transaction`. | **Met.** Existing service; `backend/CLAUDE.md` documents the pattern. |
| **DEP-3** | **Server-side acting-admin resolution** (`actors/acting-admin.resolver.ts`) — the access token carries only `sub`. | **Met.** Never trust client-sent identity. |
| **DEP-4** | **Shared bootstrap helpers** — `createValidationPipe()`, `configureBodyParser(app)` — applied by both entrypoints. | **Met.** An 8 MB JSON cap already exists; FR-7's cap for this module is narrower and must not be configured on one entrypoint only. |
| **DEP-5** | **`pii-boundary.spec.ts`** as an extendable harness. | **Met.** Chunk 1 left it deriving its forbidden-key set from a union of policy constants rather than a hand list. Extending it to a *different table* is new work, since those constants describe `Actor`. |
| **DEP-6** | **Application email sending.** | **NOT met — and weaker than the proposal assumed.** Proposal §5 states *"SES sending identity is already provisioned (`CreateSenderIdentity`)"*. The resource exists at `infra/10-data-auth/template.yaml:196-200`, but it is **conditional on `MakeSenderIdentity` = `HasSender` ∧ `CreateSenderIdentity`** — and `HasSender` is false whenever `SenderEmail` is `""`, its default. So under default parameters **no identity exists at all**. (`EnableSesSending` gates something different: the Cognito pool's `EmailConfiguration`.) There is also **no application-level sender**: no SES client, no `@aws-sdk/client-ses`, no nodemailer, no `AWS::SES::Template`. FR-4 and FR-14 therefore require building an email capability from zero, plus running the existing Phase-A enablement path (`infra/README.md` §6, `infra/10-data-auth/t9-enable-ses.sh`) and the operational work FR-4's accepted cost depends on. **This is the largest single under-estimate the proposal carries into this spec.** *(Gating corrected 2026-08-05 — Judgment Day A15; the earlier note named the wrong condition.)* |
| **DEP-11** | **Structured logging.** NFR-8, DC-14 and DC-22's diagnosability substitute all depend on it. | **NOT met — nothing exists.** Verified: zero matches for `new Logger` / `LoggerService` / `console.*` anywhere in `backend/src`; the only logging calls in the repo are in build scripts and seeds. TRD QA-10 documents structured CloudWatch logs as though implemented; they are not. A minimal capability (a request-id source **that also emits the per-request line**, scoped to this spec's paths) is therefore **in scope** — DC-22 makes that logging the thing traded in exchange for accepting the OTP-lockout risk, so it cannot be assumed. *(Added 2026-08-05 — Judgment Day C-5. Mechanism corrected 2026-08-05 during T-4 execution: this said "interceptor + request-id source", but an interceptor runs **after** guards and cannot emit for a guard-rejected request — including T-5's `429`, the abuse traffic this logging exists to make diagnosable. Emission lives in the middleware; see `design.md` §4.10.)* |
| **DEP-7** | **Frontend taxonomy source** carrying ten trader types. | **NOT met** — `frontend/lib/content/roles.ts` carries six. Closed by FR-15 inside this spec. |
| **DEP-8** | **Rate-limiting mechanism** at the API layer. | **NOT met — nothing to reuse.** Verified absent: no `@nestjs/throttler` dependency, no `@Throttle`/`RateLimit`/guard anywhere in `backend/src`, and **no throttling in any of the three SAM templates** — `infra/20-backend/template.yaml`'s `HttpApi` sets `CorsConfiguration` only. FR-7 is therefore built from zero, and `design.md` must name the mechanism *and* state whether it is per-container or shared (DC-19), since a per-container counter under Lambda concurrency is a materially weaker control than it appears. |
| **DEP-9** | **`traderId` generation.** FR-12 requires a server-generated natural key. | **NOT met.** `traderId` is today a **required, client-supplied** field (`@IsString() @MinLength(1)` in `actor-create.dto.ts`); no generator exists anywhere in the codebase. Sequence allocation must be collision-safe under concurrent approvals, with the `@unique` constraint as the backstop rather than the strategy. |
| **DEP-10** | **No global guard.** `app.module.ts` registers none — the API is public by default and guards are opt-in per controller. | **Met, but it cuts both ways.** It is why a public registration controller needs no special arrangement, and equally why FR-8's guarantee cannot rest on "we did not add an endpoint": a future controller in this module is public unless someone remembers otherwise. `design.md` owes a structural answer, not a convention. |

### Assumptions

| ID | Assumption | Status / if wrong |
|---|---|---|
| **A-1** | An in-portal checkbox against versioned policy text is legally sufficient consent for self-registrants. | **CONFIRMED** by the user on 2026-08-04, on the program/legal question the proposal flagged as the one whose failure would invalidate the feature. The checkbox mechanism is the consent basis. |
| **A-2** | Email verification is proportionate anti-abuse for this audience. | **Adopted** (FR-4, user-confirmed). If wrong: add a CAPTCHA or move to invite-only links. |
| **A-3** | SES plus the reference-code fallback is enough given known deliverability failures. | **Adopted**, with the fallback made load-bearing rather than optional (NFR-10, FR-14). |
| **A-4** | The registration form collects the same fields as the admin create form. | **Partially false** — two mockup fields have no `Actor` column. Resolved by D-9 without schema growth; A-4's intent (an approved submission is publishable without re-entry) holds. |
| **A-5** | The five status values cover chunks 3 and 4, so chunk 4 needs no enum migration. | Adopted from the proposal. If chunk 4 needs a sixth, it adds one additively. |
| **A-6** | The reviewer cohort is small enough that per-record adjudication is workable at the volume R-6 anticipates (a burst above 100 submissions). | Adopted, given D-3 excludes bulk actions. If wrong, bulk adjudication becomes a follow-up spec with its own consent argument — not a late addition here. |

### Inherited open questions

- **PRD OQ-3** (public GPS precision) — this spec publishes exact GPS for approved self-registrations, consistent with the current default and consent-gated per ADR-004.
- **PRD OQ-4** (PII retention/governance) — still open, and this spec **enlarges** it: rejected registrations hold PII for organisations that were never published. See §13 OQ-3.
- **TRD OQ-TRD-1** (no agreed p95 for interactive reads) — NFR-9 declines to invent one.

---

## 13. Open Questions

| ID | Question | Owner | Blocks |
|---|---|---|---|
| **OQ-1** | The consent policy **text** and its version literal. Engineering ships the mechanism and the version field; legal supplies the wording. | Program / legal | Copy only, not mechanism. A placeholder version and text let every requirement here be built and tested. Must be real before go-live. |
| **OQ-2** | Should self-registered actors carry a visible **"self-declared"** badge in the public directory? (Proposal OQ-2.) | Product | Nothing in this spec. `registrationSource` is stored and admin-visible; a public badge is an additive frontend change. Deferred (§11). |
| **OQ-3** | **Retention for rejected registrations.** They hold `phone` and `email` for organisations that were never published and never will be. Delete after N days? Anonymise? Retain for audit? | Program / legal | Nothing in this spec's mechanism, but it is the sharpest new edge on PRD OQ-4, and this spec is what creates the records. Recorded as an accepted risk if unanswered at execution. |
| **OQ-4** | Does the applicant-facing **reference code format** need to be human-dictatable over a phone call (the realistic fallback when email fails)? The mockup's `REG-2026-0184` is. | Product | A `design.md` parameter. Named because R-3 makes the reference the primary channel, and a code that cannot be read aloud accurately is not a fallback. |
| **OQ-5** | Is `Staff` genuinely excluded from adjudication, or should Staff review and Admin publish? | Product | §5 assumes Admin-only, following the proposal's endpoint table. A split would add a role boundary to FR-12 and is cheaper to decide now than after the guard is written. |

---

## 14. Requirement ID Index

| ID | Title | Traces to | Scenarios |
|---|---|---|---|
| FR-1 | Public entry points into registration | Epic outcome 3; mockup landing | 2 |
| FR-2 | Registration form captures the submission set with validated input | **Proposal** A-4; proposal §4.2 | 4 |
| FR-3 | In-flow, versioned consent that cannot be bypassed | Proposal §4.3, R-4; ADR-004 | 4 |
| FR-4 | Email verification by one-time code, before persistence | Proposal §4.4, D1→A; epic A-2 | **3** |
| FR-5 | Submission returns a reference and nothing else | Proposal §4.5, §7 | 2 |
| FR-6 | Public status lookup by reference and email | Proposal §4.5; R-3 | 2 |
| FR-7 | Abuse resistance on every public registration path | Proposal R-1; epic R-2 | 2 |
| FR-8 | No public path exposes any submitted field — **release gate** | Proposal §7, R-2; ADR-003; QA-1 | 3 |
| FR-9 | Admin registrations queue | Proposal §4.6; R-6 | 4 |
| FR-10 | Admin registration detail with consent record and activity trail | Proposal §4.7; user decision | 3 |
| FR-11 | Duplicate detection warns; never decides | Proposal §4.10, R-5 | 2 |
| FR-12 | Approve and publish — atomic, gated, audited | Proposal §4.8, §12; chunk 1 FR-3 | 5 |
| FR-13 | Reject with a structured reason; no actor created | Proposal §4.9 | 2 |
| FR-14 | Notifications carry the reference and are never the only channel | Proposal R-3; epic A-3 | 2 |
| FR-15 | The public form's taxonomy matches the canonical taxonomy | Chunk 1 R-3 (open) | 1 |
| NFR-1 | PII boundary — **release gate** | QA-1; proposal §7 | measure |
| NFR-2 | Consent integrity | ADR-004; chunk 1 FR-2 | measure |
| NFR-3 | Adjudication atomicity | Proposal §12 | measure |
| NFR-4 | Abuse resistance | Epic R-2; QA-8 | measure |
| NFR-5 | Accessibility WCAG 2.1 AA | `design.md` §10; QA-11 | measure + §8 DC-16/17 |
| NFR-6 | Token conformance | `docs/ux-ui/design.md` §7 | measure |
| NFR-7 | Static-export conformance | ADR-002; proposal R-7 | measure |
| NFR-8 | Observability without PII | QA-10 | measure |
| NFR-9 | Queue performance | QA-5; OQ-TRD-1 | measure |
| NFR-10 | Email independence | Epic R-3; proposal R-3 | measure |

**Scenario counts — corrected twice, and the correction history matters.**

| Set | Scenarios | Requirements |
|---|---:|---|
| **3a — this spec's obligation** | **25** | FR-1 (2) · FR-2 (4) · FR-3 (4) · FR-4 (**3**) · FR-5 (2) · FR-6 (2) · FR-7 (2) · FR-8 (3) · FR-14 (2) · FR-15 (1) |
| 3b — moved, retained for reference | 16 | FR-9 (4) · FR-10 (3) · FR-11 (2) · FR-12 (5) · FR-13 (2) |
| Document total | **41** | |

**`tasks.md` for 3a must account for 25**, not 41 and not 40. Coverage closure is at scenario and clause granularity, not requirement ID (KZ-001), and it excludes FR-9…FR-13.

> **Two corrections, both self-inflicted, both worth recording (KZ-005).** Both judges independently verified the original total of **40** as correct. The Judgment Day S-6 fix then added an FR-4 scenario — *"The verified address is the published address"* — and **this index was not updated**, leaving the document asserting 40 against a true 41 (RA6). That is the KZ-005 defect committed inside the document that carries the KZ-005 rule, and the uncounted scenario was a load-bearing one: its failure publishes an unverified or null contact address for the entire self-registered cohort. Verified by count on 2026-08-05: FR-4 has three `#### Scenario:` headings. The second correction is the 3a/3b split.

**Constitutional amendments this spec requires** (executed as tasks, not assumed):

| Document | Change |
|---|---|
| `docs/prd.md` §5 | Move *"Self-service public registration / actor self-onboarding"* from Out-of-Scope to In-Scope; add a user story and an acceptance criterion. |
| `docs/trd/trd.md` §2 | Add the `RegistrationsModule`. |
| `docs/trd/trd.md` §3 | Add `Registration` and `RegistrationStatus`; note that `PII_ALLOWLIST` / `NEVER_PUBLIC_FIELDS` describe `Actor` and do not cover this table. |
| `docs/trd/trd.md` §4 | Add the **four public** endpoints. *(3b amends §4 again for its five admin endpoints — do not document them here, or 3b's amendment task has nothing to do and the TRD describes endpoints that do not exist yet.)* |
| `docs/trd/trd.md` §8 | Add the unapproved-PII boundary and the no-public-read-of-payload rule. |
| `docs/trd/trd.md` §12.5 | New ADR for the public write path (and its rate-limiting posture). |
| `docs/trd/trd.md` §13 | New QA scenario for unapproved-submission confidentiality. |
| `docs/ux-ui/design.md` §2, §4 | Add `/register`, `/register/submitted`, `/register/status`. *(The admin queue and detail screens are 3b's amendment.)* |
