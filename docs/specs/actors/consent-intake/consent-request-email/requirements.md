# Requirements — Consent request by email for team-managed actors

- Spec path: `docs/specs/actors/consent-intake/consent-request-email/`
- Parent Spec: `actors/consent-intake` ([`family.md`](../family.md)), chunk 2 of 2. Depends on chunk 1 `intake-required-fields`: **done**, archived 2026-10-05.
- Status: Approved (2026-10-05)
- Author / Date: AKILI (Leader) on behalf of Daniela Gómez, 2026-10-05
- Depth: **Full**. This change adds an unauthenticated write that moves an actor to `GRANTED`, a new evidence entity, a new S3 bucket, and constitutional amendments.
- Approval Mode: gated
- Ticket: [ATP-84](https://cgiarmel.atlassian.net/browse/ATP-84)
- Related:
  - `docs/prd.md`: §3 Personas, §5 In Scope items 4–5, AC-1, AC-4
  - `docs/trd/trd.md`: §3, §4, §8, §12.5 (ADR-004, ADR-010, ADR-013, ADR-014, ADR-015), §13 (QA-1, QA-3, QA-12)
  - `docs/ux-ui/design.md`: §2 IA, §4 Screen Inventory, §8 components
  - [`proposal.md`](proposal.md): outcomes O-1…O-9, decisions D-1…D-14, risks R-1…R-9
- Verified at commit `342390a`. Scout citations are recorded in `design.md` § Premise Ledger.

## 1. Summary

Today a team-managed actor reaches `GRANTED` only through an admin's assertion that "consent is on file". The admin ticks an acknowledgement and types a method and a date. The actor's own act is never captured, and the signed paper form never reaches the platform.

This spec gives the admin three new capabilities:

- **Request consent by email.** The request goes to one actor, a selection, or every actor matching a filter.
- **The actor answers.** The actor opens a 30-day link, identifies themself, and accepts or declines the Legal-approved *Administrator-Managed Registration* consent. That answer sets `consentStatus` with no admin action.
- **Every answer leaves evidence.** It produces an immutable record an admin can show an auditor. The admin can also attach a consent document obtained outside the platform, stored privately.

The spec advances PRD In Scope items 4 and 5, and it closes the "consent-request workflow" deferred by `2026-06-25-changes--auth-wiring`.

### Decisions inherited and added

D-1…D-14 are inherited from `proposal.md` §1 unchanged. D-1 (Legal approved click-to-consent) and D-8 (identity fields, minimal wording changes) are recorded **on the product owner's statement**.

| # | Decision (specify, 2026-10-05) | Status |
|---|---|---|
| D-20 | **Any later admin change to the actor's consent status or email supersedes its pending request.** Otherwise a link sent before an admin recorded a withdrawal could re-grant consent afterwards. | Confirmed — Daniela Gómez, 2026-10-05 (Phase 1 gate) |
| D-21 | **Bulk sending skips an actor whose latest request was declined.** A single-actor send can still re-ask that actor deliberately. | Confirmed — Daniela Gómez, 2026-10-05 (Phase 1 gate) |
| D-22 | **The consent method recorded on accept is a new value, `EMAIL_LINK`.** It is not the existing `EMAIL`, because `EMAIL` already means "an admin asserts consent came by email". Reusing it would mix evidenced and asserted consent under one value. | Confirmed — Daniela Gómez, 2026-10-05 (Phase 1 gate) |
| D-24 | **An admin re-grant of an actor who accepted by link does not inherit the link's date or reference.** The admin supplies the consent date. The link-era `consentReference` is cleared unless the admin enters a new one. Otherwise an admin-asserted method would sit beside the actor's own evidence (mixed provenance). | Confirmed — Daniela Gómez, 2026-10-05 (T-1 continue gate; raised by both T-1 Reviewers) |
| D-25 | **Two simultaneous sends for the same actor create one request, not two.** Enqueue locks the targeted actor rows and evaluates eligibility inside its own transaction. | Confirmed — Daniela Gómez, 2026-10-05 (T-3 continue gate; raised by both T-3 Reviewers) |
| D-26 | **An admin edit made from a stale form is refused, not applied.** The edit carries the version (`updatedAt`) the admin loaded. If the actor changed since, for example because the actor accepted by link, the save returns `409` and the form asks the admin to reload. It protects every concurrent edit, not only consent. | Confirmed — Daniela Gómez, 2026-10-06 (raised from T-1 Reviewer advisory B3, widened by the Leader) |
| D-23 | **Every link that cannot be answered shows the same dead-end page**, whether it is unknown, expired, already used, superseded, or its actor was deleted. The page never says which case applies. | Confirmed — Daniela Gómez, 2026-10-05 (Phase 1 gate) |

## 2. Glossary

| Term | Meaning |
|---|---|
| **Consent request** | One attempt to obtain one actor's consent by email. It records who asked, when, which address was used, which consent edition was sent, and what the actor answered. |
| **Admin-managed consent edition** | A versioned, immutable text of the *ACCELERATE Tanzania Registry Consent for Publication of Information (Administrator-Managed Registration)*. It lives in a registry separate from the self-registration consent policy (ADR-014 pattern). |
| **Link** | The URL in the email. It carries a secret **token** in the URL fragment (after `#`). |
| **Open request** | A request that has been sent, has not expired, and has not been answered or superseded. Only an open request's link works. |
| **Pending request** | An open request, or one that is queued, being sent, or failed and awaiting retry. A pending request blocks a new bulk send and is what admin changes supersede. *(Added 2026-10-05, judgment-day B-4.)* |
| **Respondent** | The person who answers on the consent page. They are not necessarily the actor's recorded contact person (proposal R-3). |
| **Eligible actor** | An actor a request may be sent to, as defined in FR-2. |
| **Consent document** | A file (PDF/JPG/PNG) an admin uploads as evidence of consent obtained outside the platform. |
| **Evidence** | The consent requests and consent documents recorded for one actor. |

## 3. System Context & Scope

Each line on current behaviour carries its evidence. The full citations are in `design.md` § Premise Ledger.

| Today | Evidence |
|---|---|
| Every admin route to `GRANTED` requires `acknowledged: true` plus a method other than `NOT_RECORDED` and a date. This applies to create, update and bulk. | `ActorsAdminService.create` / `update` / `bulkSetConsent`; `isConsentProvenanceSatisfied` |
| `ConsentMethod` has `NOT_RECORDED, PORTAL_CHECKBOX, SIGNED_FORM, EMAIL, VERBAL_FIELD`. No `EMAIL_LINK` exists. | `schema.prisma` `enum ConsentMethod`; `grep -rniE "EMAIL_LINK" backend/src backend/prisma` → 0 |
| Audit rows require a non-null `actingSub`, always an admin's Cognito sub. No system identity has ever been written. | `ActorAuditLog.actingSub`; scout grep for literal `actingSub:` → 0 |
| Audit rows have no foreign key to `Actor`, so they survive deletion. History is readable for a deleted actor. | `ActorAuditLog.actorId` comment; `ActorsAdminService.history` |
| Mail goes through `MailService` → AMQP microservice. One cached connection is reused, sends are serialized, and each send waits for a reply under a 3 s bound. There is no batch API. | `microservice-mail.transport.ts` module `cached`; `MAIL_SEND_TIMEOUT_MS = 3000` |
| Every mail subject is posted to Slack. | ADR-015 |
| Email links are built from `PUBLIC_APP_BASE_URL`. | `mail.config.ts` `getPublicAppBaseUrl` |
| Selection on Admin → Actors is page-scoped. No "all matching filters" exists. Select-all exists only in the `lg+` table. | `actors/page.tsx` `selectedIds`, `handleToggleAll` |
| The admin list filters are `region`, `traderType`, `consentStatus`, `registrationSource`, `consentMethod`. There is no text search. | `AdminActorListQueryDto` |
| No S3 SDK, no document storage, no presigned-URL code and no local S3 exist. | backend `package.json`; scout greps → 0 |
| The API Lambda has `Timeout: 15` and `ReservedConcurrentExecutions: 5`. | `infra/20-backend/template.yaml` `ApiFunction` |
| Analytics (GA4) mounts in `app/(public)/layout.tsx` after consent, with default config. No code reads or strips a URL fragment. | `GoogleAnalytics.tsx`; scout grep → 0 |
| Whether GA4's default `page_location` includes the URL fragment. | `UNVERIFIED — confirm at source before relying on it`. The design avoids depending on it (NFR-11). |
| The import commit result carries `actorId` per created row but no email. | `ImportRowResult.actorId` |
| The Legal-approved consent text is a `.docx`, not in the repo. sha256 `80fe083f…a9ba1c7`, 2026-10-02. | `textutil` extraction, recorded in design |

**In scope:**
- requesting consent: single, bulk and post-import;
- the email;
- the public consent page and its response;
- evidence and the evidence panel;
- consent-document upload and download;
- the new S3 bucket and IAM;
- the admin-managed edition registry;
- baseline and constitution updates.

**Out of scope:** see §9.

## 4. Stakeholders / Personas

| Persona | Role | Need |
|---|---|---|
| **Administrator** | Cognito `admin` | Obtain consent from many team-managed actors without chasing paper; prove it to an auditor. |
| **Team-managed actor (respondent)** | Anonymous, holds a link | Understand what will be published about their organisation and accept or decline in one visit. This is a **new persona** for the PRD. |
| **Auditor / Legal** (indirect) | Shown evidence by an admin | See who was asked, when, at which address, with which exact text, and who answered, when and how. |
| **Staff** | Cognito `staff` | No change. Staff has no actor-write capability (PRD §3, 2026-10-05 ruling), so every new admin route is `Admin`-only. |
| **Public visitor** | Anonymous | No change. An accepted actor appears through the existing `GRANTED` path (ADR-013). |

## 5. Functional Requirements

### FR-1: An admin-managed consent edition registry

- **Description:** The system MUST hold the *Administrator-Managed Registration* consent text as a versioned, append-only registry of editions. It is separate from the self-registration consent policy and follows the ADR-014 pattern. Edition `v1.0` MUST be the Legal `.docx` text **verbatim**, except for these three adaptations (D-8):
  - "By signing this Consent" → "By accepting this Consent";
  - "By signing below" → "By selecting **I accept** below";
  - the signature block becomes the page's form fields and acceptance control.

  Every request MUST record the edition it was sent with and a SHA-256 hash of that edition's text.
- **Rationale / Source:** D-1, D-8, D-9; proposal §11 *Consent text*; ADR-014.
- **Acceptance criteria:**
  - **Scenario: verbatim text.** GIVEN the Legal `.docx` text, WHEN it is compared with edition `v1.0` with the three named substitutions reversed, THEN every other sentence matches word for word, including the data-protection contact (Sylvia Kalemera, `S.Kalemera@cgiar.org`, TARI Selian address). AND IT MUST NOT contain the word "signing" or "signature" anywhere.
  - **Scenario: an old request keeps its text.** GIVEN a request was sent under `v1.0`, WHEN a later edition `v1.1` is added, THEN that request's page still renders `v1.0`, and its recorded hash still matches `v1.0`.
  - **Scenario: append-only.** GIVEN the registry, WHEN an existing edition's text is edited, THEN a named test reddens.
  - BUT the self-registration consent policy (`consent-policy.editions.json`) MUST NOT change.
- **PII/RBAC impact:** None. This is public text.

### FR-2: Eligibility

- **Description:** A request MAY be sent only to an **eligible actor**. Every send surface MUST apply the same rule and report each skipped actor with exactly one reason. An actor is eligible when all of these hold:
  1. It has an email.
  2. Its `consentStatus` is not `GRANTED` (D-3: no re-consent campaign).
  3. It has no **pending request**.
  4. **Bulk sends only:** its latest request was not declined (D-21).
- **Rationale / Source:** O-1, D-3, D-21.
- **Acceptance criteria:**
  - **Scenario: the reasons are distinct and exhaustive.** GIVEN a bulk target containing one actor of each kind (no email, `GRANTED`, pending request, latest declined, eligible), WHEN the confirm step shows, THEN it reports 1 to send and 4 skipped, each skip under its own reason.
  - **Scenario: an expired request does not block.** GIVEN an actor whose only request expired unanswered, WHEN targeted, THEN it is eligible.
  - **Scenario: a single send re-asks a decliner.** GIVEN an actor whose latest request was declined (`DENIED`), WHEN an admin sends to that one actor from its page, THEN it is sent. BUT a bulk send MUST skip it.
  - AND IT MUST be enforced by the API: a direct request naming an ineligible actor creates no request for it and returns it among the skipped, with its reason.
- **PII/RBAC impact:** Admin only.

### FR-3: Send to one actor

- **Description:**
  - The actor's edit page MUST offer **Send consent request**. It is disabled with its FR-2 reason when the actor is ineligible.
  - When the actor has a pending request, the same action reads **Resend**. A resend supersedes the pending request and sends a new link.
  - After a successful **create**, the admin MUST be asked *"Send a consent request to <email>?"*. The prompt defaults to **Send**.
- **Rationale / Source:** O-2.
- **Acceptance criteria:**
  - **Scenario: post-create prompt.** GIVEN an admin creates an actor (every created actor has an email, chunk 1 FR-1), WHEN the create succeeds, THEN the prompt shows with the email. Choosing **Send** sends one request and confirms it. Choosing **Not now** sends nothing. Either way the admin then lands where they do today. AND it MUST NOT appear when the created actor is `GRANTED`.
  - **Scenario: resend supersedes.** GIVEN actor A has an open request R1, WHEN the admin chooses Resend, THEN R1 becomes superseded and a new request R2 is sent. AND the link in R1's email MUST lead to the dead-end page (FR-11).
  - **Scenario: weak-duplicate warning and prompt together.** GIVEN a create returns duplicate warnings, WHEN it succeeds, THEN the admin sees both the warnings and the send prompt, without losing either.
- **PII/RBAC impact:** Admin only.

### FR-4: Bulk send from Admin → Actors

- **Description:**
  - **Targets.** The admin MUST be able to target the selected rows, the visible page, or **all actors matching the current filters** (any page). The filter targets are `region`, `traderType`, `consentStatus`, `registrationSource` and `consentMethod`.
  - **Confirm step.** **Send consent request** opens a confirm step stating how many will be sent and how many skipped, by FR-2 reason, **before anything is sent**.
  - **During and after.** While sending, progress is shown. When it ends, a result reports *sent / skipped / failed*. Failed requests can be retried.
  - **Card view.** Below `lg` (card view), the same targets MUST be reachable.
- **Rationale / Source:** O-1.
- **Acceptance criteria:**
  - **Scenario: all matching filters.** GIVEN 140 actors match `consentStatus=UNKNOWN&region=Arusha` across 6 pages, WHEN the admin chooses *all matching* and confirms, THEN requests are created for every eligible one of the 140, not only the 25 on screen.
  - **Scenario: nothing eligible.** GIVEN every targeted actor is ineligible, WHEN the confirm step shows, THEN the send action is unavailable and the skip breakdown is shown.
  - **Scenario: a failure is visible and retryable.** GIVEN the mail transport rejects 3 of 50 sends, WHEN the run ends, THEN the result reads 47 sent, 3 failed, and offers **Retry failed**. A retry sends only those 3.
  - **Scenario: closing the tab mid-run.** GIVEN a run is interrupted after 20 of 100, WHEN the admin returns to Admin → Actors, THEN the 80 unsent requests are still recorded as queued, and the admin can resume them. BUT none of them MUST be lost or sent twice.
  - **Scenario: the filter changed under the admin.** GIVEN the confirm step counted 140, WHEN an actor stops matching before confirming, THEN the send uses the server's evaluation at confirm time and the result reports the actual counts.
- **PII/RBAC impact:** Admin only. Counts and reasons carry no contact values.

### FR-5: Offer after an import commit

- **Description:** The import result screen MUST offer *"Send consent requests to the N actors created by this import"*. N is the number of created actors that are eligible. It runs the FR-4 confirm step and send over exactly those actors.
- **Rationale / Source:** O-3.
- **Acceptance criteria:**
  - **Scenario: offer counts eligible actors only.** GIVEN a commit created 12 actors, 2 of them imported as `GRANTED`, WHEN the result shows, THEN the offer names 10.
  - **Scenario: nothing created.** GIVEN a commit created 0 actors, WHEN the result shows, THEN no offer appears.
  - BUT the offer MUST NOT target any actor the import did not create in this commit.
- **PII/RBAC impact:** Admin only.

### FR-6: Every request is durable before it is sent

- **Description:**
  - Each request MUST be recorded before its email is attempted.
  - A send outcome MUST be recorded per request: sent, or failed with a non-PII reason.
  - Sending MUST proceed in steps that each finish inside the API's time limit, and the admin's screen drives them.
  - A request whose step never ran stays queued. Any admin can resume it from Admin → Actors.
- **Rationale / Source:** proposal §10 option A1; §3 *Bulk sending is bounded by time*; NFR-6.
- **Acceptance criteria:**
  - **Scenario: a crash mid-run.** GIVEN the API dies after sending 5 of a 10-request step, WHEN the run resumes, THEN the 5 sent are not sent again. The unsent ones are sent, or marked failed, exactly once each.
  - **Scenario: no duplicate concurrent dispatch.** GIVEN two browser tabs resume the same queue at once, WHEN both run, THEN each queued request is sent at most once.
- **PII/RBAC impact:** Admin only.

### FR-7: The email

- **Description:**
  - **Recipient and language.** The email MUST go to the actor's email at the time of sending, in English (D-4), using the established email layout.
  - **Content.** It MUST state that consent is requested to publish information about the organization (by name) on the ACCELERATE Tanzania Registry (site address). It MUST state that the link expires in 30 days.
  - **Action.** It MUST offer one **Review and respond** action leading to the consent page.
  - **Subject.** The subject MUST be a fixed string carrying no organization name, recipient address or reference (R-5).
- **Rationale / Source:** O-4, R-5, ADR-015.
- **Acceptance criteria:**
  - **Scenario: fixed subject.** GIVEN any two requests for different actors, WHEN their messages are built, THEN their subjects are byte-identical. AND IT MUST NOT contain the trader name, the address, the token, or the request id.
  - **Scenario: the link carries the token only in the fragment.** GIVEN a built message, WHEN its link is parsed, THEN the token appears only after `#`, and the path and query carry no token or identifier.
  - **Scenario: no token in logs.** GIVEN a send succeeds or fails, WHEN the backend logs it, THEN no log line contains the token or the recipient address.
- **PII/RBAC impact:** The body names the organization and goes only to that actor's address. The subject goes to Slack and so carries nothing identifying.

### FR-8: The link

- **Description:**
  - **Validity.** A link MUST be valid for **30 days** from sending (D-2) and only for a request that is still open.
  - **Single use.** Answering consumes it.
  - **Supersession.** A resend (FR-3) or an admin change to the actor's consent status or email (FR-12) supersedes it.
  - **Secrecy.** The token MUST NOT be derivable from anything else the system exposes.
- **Rationale / Source:** O-6, D-2, D-20; proposal §11 *Token design*.
- **Acceptance criteria:**
  - **Scenario: day 30 vs day 31.** GIVEN a request sent at T, WHEN opened at T + 30 days − 1 minute, THEN it works. WHEN opened at T + 30 days + 1 minute, THEN it shows the dead-end page.
  - **Scenario: used.** GIVEN a link was answered, WHEN opened again, THEN it shows the dead-end page. AND a second answer MUST change nothing.
- **PII/RBAC impact:** See NFR-1.

### FR-9: The public consent page

- **Description:** Opening a valid link MUST show, on one public page:
  1. **The data that would be published.** This is the actor's own record restricted to the public-detail field set (`toPublicDetail`'s fields) and never any `NEVER_PUBLIC_FIELDS`.
  2. **The consent edition's full text.**
  3. **Identity fields.**
     - Organization: pre-filled, read-only.
     - Name of authorized representative, Position/Title, Email and Telephone: required inputs, empty, never pre-filled from the record.
  4. **Acceptance controls.**
     - An "I have read and accept" checkbox that becomes available only after the text has been read to its end (the registration form's scroll gate).
     - An **Accept** button.
     - A **Decline** button.

  Decline does not require the checkbox or the identity fields.
- **Rationale / Source:** O-5, D-8, R-2.
- **Acceptance criteria:**
  - **Scenario: the record shown is the public set.** GIVEN an `UNKNOWN` actor with `technicalSupport`, `traderId` and `gpsAltitude` set, WHEN its page loads, THEN those values appear nowhere in the response or the page. Its phone, email, contact person, position and market location do appear, labelled as information that will be published.
  - **Scenario: identity is required for Accept.** GIVEN the checkbox is ticked and Position is empty, WHEN the respondent clicks Accept, THEN a field error names Position and nothing is recorded. AND IT MUST be enforced by the API too.
  - **Scenario: decline needs nothing.** GIVEN no field is filled, WHEN the respondent clicks Decline and confirms, THEN the decline is recorded.
  - **Scenario: the token leaves the address bar.** GIVEN the page is opened from the link, WHEN it has loaded, THEN the address bar shows `/consent/` with no fragment.
  - **Scenario: refresh after load.** GIVEN the fragment has been stripped, WHEN the respondent refreshes, THEN the page asks them to open the link from the email again. It does not show the dead-end wording, because the link is still valid.
  - BUT the page MUST NOT offer any way to edit the actor's data (proposal §6).
- **PII/RBAC impact:** A new public read of a **non-`GRANTED`** actor's contact block, to the token holder only. This is a constitutional change (FR-17, NFR-3).

### FR-10: Responding

- **Description:**
  - **Accept** MUST, in one atomic step, do all of the following:
    - mark the request accepted;
    - record the respondent's identity, the edition and hash, the server time, the IP address and the user agent;
    - set the actor's `consentStatus = GRANTED`, `consentMethod = EMAIL_LINK` (D-22), `consentObtainedAt` = that server time, and `consentReference` = the request's id;
    - write a *consent accepted* entry to the actor's activity trail.
  - **Decline** does the same with `consentStatus = DENIED`, and leaves method, date and reference unchanged.
  - The respondent's email and telephone are **evidence only** and MUST NOT overwrite the actor's record.
  - The response is final for that link.
- **Rationale / Source:** O-6, O-7, D-9, D-22.
- **Acceptance criteria:**
  - **Scenario: accept publishes.** GIVEN an `UNKNOWN` actor and a valid link, WHEN the respondent accepts with complete identity, THEN `GET /api/v1/actors/:id` returns the actor with its contact block, and it appears in `/directory`, with no admin action.
  - **Scenario: decline.** GIVEN an `UNKNOWN` actor, WHEN the respondent declines, THEN `consentStatus` is `DENIED`, and the actor stays absent from every public read.
  - **Scenario: the admin gate is bypassed by design, and only here.** GIVEN the respondent accepts, WHEN the actor becomes `GRANTED`, THEN no `acknowledged` flag was involved. BUT every admin route to `GRANTED` MUST still require it, unchanged (ADR-NNN, R-9). AND IT MUST NOT be possible for any admin path (create, edit, bulk unlock, import) to **write** `EMAIL_LINK` or to **move** an actor into `GRANTED` with method `EMAIL_LINK`. An admin re-grant of an actor who once accepted by link, then was set `DENIED`, must carry an admin-assertable method. *(Added 2026-10-05, judgment-day RB-2; reworded after FB-3.)*
  - **Scenario: an admin re-grant does not inherit link evidence (D-24).** GIVEN an actor whose stored method is `EMAIL_LINK` and whose status is not `GRANTED`, WHEN an admin moves it to `GRANTED` (single edit or bulk unlock), THEN the actor's method, `consentObtainedAt` and `consentReference` all come from the admin's request. A missing admin date is a `400` naming `consentObtainedAt`, and the stored reference is cleared unless one is sent. BUT the link-era `consentObtainedAt` and `consentReference` MUST NOT survive under the admin method.
  - **Scenario: a stale admin form cannot undo the actor's answer (D-26).** GIVEN an admin opened actor A's edit form while A was `UNKNOWN`, WHEN A accepts by link and then the admin saves the form, THEN the save is refused with `409` and A stays `GRANTED`. AND the form tells the admin that the actor changed and offers to reload. BUT a save whose version matches the stored one MUST proceed exactly as today.
  - **Scenario: link evidence is frozen.** GIVEN an actor `GRANTED` through a link, WHEN an admin edits its consent date, consent reference or method without changing its status (single edit or bulk unlock), THEN the edit of those fields is refused (single) or the row is left untouched (bulk). Other fields stay editable. AND to correct the consent record the admin MUST change the status. *(Added 2026-10-05, judgment-day FB-1/FB-2, confirmed by the product owner.)*
  - **Scenario: two answers race.** GIVEN two Accept submissions on one link arrive together, WHEN both are processed, THEN exactly one is recorded, and the other gets the dead-end response.
  - **Scenario: the respondent's contact differs.** GIVEN the respondent enters an email different from the actor's, WHEN they accept, THEN the actor's email is unchanged, and the evidence holds the respondent's.
- **PII/RBAC impact:** Unauthenticated write to `Actor.consentStatus`. Respondent identity, IP and user agent are new personal data, admin-readable only (NFR-9).

### FR-11: One dead-end page

- **Description:** A link that is unknown, malformed, expired, already answered, superseded, or whose actor was deleted MUST show one page. That page says the link is no longer valid and names the data-protection contact from the consent text. All six cases MUST be indistinguishable to the visitor and on the wire (D-23).
- **Rationale / Source:** proposal §11 *every miss gets the same 404*, D-23.
- **Acceptance criteria:**
  - **Scenario: six cases, one response.** GIVEN one token for each of the six cases, WHEN each is read and each is answered, THEN every response has the same status code and a byte-identical body.
  - **Scenario: the page shows no record.** GIVEN any of the six cases, WHEN the page renders, THEN no actor field and no organization name appears.
- **PII/RBAC impact:** No actor data is disclosed on a miss.

### FR-12: Admin changes supersede a pending request

- **Description:** When an admin changes an actor's `consentStatus` or `email` through any admin write path, any pending request for that actor MUST become superseded in the same transaction. That includes one being sent at that moment, whose link MUST then be dead. The admin write paths are edit, bulk consent and, by deletion, delete and bulk delete (D-20).
- **Rationale / Source:** D-20; KZ-007 (the admin gate and the actor path are a conjunctive set).
- **Acceptance criteria:**
  - **Scenario: withdrawal recorded by an admin.** GIVEN actor A has a pending request, WHEN an admin sets A to `DENIED` (single edit or bulk lock), THEN A's link leads to the dead-end page. AND a later Accept on it MUST NOT make A `GRANTED`.
  - **Scenario: email corrected.** GIVEN A has a pending request sent to `old@x.tz`, WHEN an admin changes A's email, THEN that link is dead.
  - **Scenario: unrelated edit.** GIVEN A has an open request, WHEN an admin edits only A's capacity, THEN the request stays open.
- **PII/RBAC impact:** Admin only.

### FR-13: Evidence is recorded and permanent

- **Description:**
  - **Request lifecycle.** Each request's record MUST hold:
    - who sent it, and when it was created and sent;
    - the address used;
    - the edition and its hash;
    - the expiry;
    - the status: queued, being sent, sent, failed, accepted, declined, superseded, or expired (derived);
    - the response time;
    - the respondent's identity, IP and user agent.
  - **Immutability.** Once a request is answered, its record MUST NOT change.
  - **Retention.** Requests and consent documents MUST survive the deletion of their actor (the consent text says CIAT may retain consent records).
  - **Activity trail.** The trail gains *consent requested*, *consent accepted* or *consent declined*, and *consent document uploaded* entries. Entries made by the actor's own response identify the consent link as their author, not an admin.
- **Rationale / Source:** O-7, D-9.
- **Acceptance criteria:**
  - **Scenario: deleted actor.** GIVEN an actor with two requests and one document, WHEN an admin deletes the actor, THEN all three evidence records remain, and the history endpoint still returns the actor's trail.
  - **Scenario: no edit path.** GIVEN an answered request, WHEN any admin route is exercised, THEN no route can change its response fields. AND IT MUST be shown by a test asserting the request record's columns are written only by the dispatch, retry, supersede and respond paths (design §5.8).
- **PII/RBAC impact:** Admin-only reads. New tables are named in the TRD's personal-data inventory (§3.1 pattern).

### FR-14: The Consent evidence panel

- **Description:** The actor's edit page MUST show a **Consent evidence** panel listing every request and every consent document, newest first. For each request it shows:
  - status;
  - sent by, and sent at;
  - the address used;
  - the edition, with a way to read its exact text;
  - when answered: the respondent's name, position, email, telephone, the response time with an explicit timezone, IP and user agent.

  Documents show file name, size, uploader, upload time and a **Download** action.
- **Rationale / Source:** O-8, D-9.
- **Acceptance criteria:**
  - **Scenario: auditor walk-through.** GIVEN a `GRANTED` actor reached via a link, WHEN an admin opens its page, THEN, without leaving it, they can state who sent the request, when, to which address, under which edition, and who accepted, when and with what identity.
  - **Scenario: empty.** GIVEN an actor with no evidence, WHEN the page loads, THEN the panel states there is no consent evidence yet.
  - **Scenario: expired is derived.** GIVEN a request sent 31 days ago and never answered, WHEN the panel loads, THEN it shows *Expired*.
- **PII/RBAC impact:** Admin only (`Staff` → 403, anonymous → 401, QA-3).

### FR-15: Upload a consent document

- **Description:**
  - **Where.** The create and edit forms MUST offer an optional upload of one consent document. Accepted types are PDF, JPG and PNG, at most 10 MB.
  - **Storage.** The file is stored in private, encrypted storage and recorded as `SIGNED_FORM` evidence for the actor.
  - **No gate bypass.** Uploading MUST NOT by itself change `consentStatus`, method or date. The existing acknowledgement gate still governs any move to `GRANTED`, because the file is still the admin's assertion (O-9).
  - **Unconfigured storage.** Where storage is not configured (the local stack), the field states that uploads are unavailable rather than failing on submit.
- **Rationale / Source:** O-9, D-7, D-10.
- **Acceptance criteria:**
  - **Scenario: create with a document.** GIVEN an admin creates an actor and attaches `consent.pdf` (2 MB), WHEN the create succeeds, THEN the evidence panel lists the document. AND the actor's consent fields are exactly what the form submitted.
  - **Scenario: wrong type or size.** GIVEN a 12 MB PDF or a `.docx`, WHEN chosen, THEN the form rejects it with a field error before any upload. AND IT MUST be enforced by storage too: a direct upload of 12 MB or a different content type is refused.
  - **Scenario: an upload that never completes.** GIVEN the browser starts an upload and is closed, WHEN the admin returns, THEN no document is listed. A half-uploaded file is never listed as evidence.
  - **Scenario: the actor create fails.** GIVEN the create is rejected (validation or duplicate), WHEN the admin fixes and resubmits, THEN at most one document is recorded.
- **PII/RBAC impact:** Uploaded files are unscanned PII (signatures). Admin-only, never public (R-6).

### FR-16: Download a consent document

- **Description:** **Download** MUST deliver the stored file through a link valid for **at most 5 minutes**, issued only to an `Admin`, delivered as an attachment (never rendered inline).
- **Rationale / Source:** O-8, R-6.
- **Acceptance criteria:**
  - **Scenario: link expiry.** GIVEN an issued link, WHEN used after 5 minutes, THEN storage refuses it.
  - **Scenario: role.** GIVEN a `Staff` token, WHEN it requests a download link, THEN `403`.
- **PII/RBAC impact:** Admin only.

### FR-17: Baselines and the constitution state the new surface

- **Description:**
  - **PRD.** It MUST gain the respondent persona, an in-scope item, a user story and acceptance criteria for consent requests.
  - **TRD.** It MUST gain §2 (the module), §3 (the evidence entities and the personal-data inventory), §4 (every new route), §8 (the token-bearer disclosure and the second route to `GRANTED`), §13 (a QA scenario for the token endpoints), and **ADR-NNN**. ADR-NNN is allocated at apply time; ADR-018 is the candidate, after checking unmerged branches.
  - **UX design.** `docs/ux-ui/design.md` MUST gain the `/consent` route (§2), the screens (§4), and the components (§8).
  - **Infrastructure.** `docs/infrastructure.md` MUST gain the bucket (§2) and its teardown and local implications.
  - **Root guides.** Root `CLAUDE.md` and `AGENTS.md`, plus `backend/CLAUDE.md` and `backend/AGENTS.md`, MUST amend the PII hard constraint so it names the token-bearer read as a third, single-actor disclosure path.
- **Rationale / Source:** CLAUDE.md *Reviewer dispatch is decided by blast radius*; KZ-006; KZ-015.
- **Acceptance criteria:**
  - **Scenario: no constitutional sentence is left false.** GIVEN the change is complete, WHEN the root and backend guides and the TRD are searched for every statement that the contact block is public "only" on `GET /api/v1/actors/:id` or "only for a `GRANTED` actor", THEN each hit is amended or explicitly scoped. Archived specs are frozen and excluded.
  - **Scenario: mirrors in lockstep.** GIVEN `CLAUDE.md` is amended, WHEN `AGENTS.md` is compared, THEN it carries the same amendment.
- **PII/RBAC impact:** None by itself.

## 6. Non-Functional Requirements

| # | Requirement | Measure |
|---|---|---|
| NFR-1 | **Token secrecy.** At least 256 bits from a CSPRNG. Stored only as a SHA-256 hash. Carried only in the URL fragment and in request **bodies**, never a path or query string. Never logged or audited, never returned by any API. | Tests: a 32-byte token; the stored column equals `sha256(token)`; a log spy over a send and a respond captures no token. Mutation: logging the token reddens it. |
| NFR-2 | **Uniform miss.** The six dead-end cases (FR-11) produce the same status and a byte-identical body, on both the read and the respond endpoints. | Test over all six on both endpoints. Mutation: a distinct message for "expired" reddens it. |
| NFR-3 | **Public PII boundary.** The token read returns exactly the public-detail key set and zero `NEVER_PUBLIC_FIELDS` by key and value. The respond endpoint echoes no respondent field and no actor field. The new public routes are **derived** into `pii-boundary.spec.ts`'s totality check, not hand-listed. | Extended `pii-boundary.spec.ts`. Mutations: adding `traderId` to the read reddens it; a new public route without a fixture reddens the totality check. |
| NFR-4 | **Abuse bounds.** The public endpoints are throttled per caller, like `RegistrationsThrottleGuard`. Above the limit the caller gets `429`, which reveals nothing about the token. | Test: request N+1 within the window → `429`. |
| NFR-5 | **Exactly one response per link.** The answer is a compare-and-set on the open state inside one transaction with the actor update and the audit row. Zero affected rows means the dead-end response. | Test with two concurrent responds on the in-memory harness: one success, one miss. **Declared gap:** real-MySQL row contention is not exercised (the e2e harness mocks Prisma), the same gap chunk 1 declared. |
| NFR-6 | **Dispatch fits the Lambda budget.** Each dispatch step stops starting new sends after a time budget that leaves headroom under `Timeout: 15`. A step never exceeds 12 s wall time. A 1,000-actor campaign completes from the UI. | Unit test with a delayed fake transport: the step returns within the design's worst case (budget 7.5 s + pre-send DB 0.3 s + one send bound 3.2 s + result write 0.5 s = 11.5 s, design §5.2). Throughput on the real broker is measured at execute time (design premise ledger, `UNVERIFIED`). |
| NFR-7 | **Slack-safe subject.** The consent-request subject is one constant. No identifier of any kind. | Template test (FR-7). |
| NFR-8 | **Storage security.** The bucket has all four Block Public Access settings, default encryption, `BucketOwnerEnforced`, a TLS-only policy, and versioning. The Lambda can only put and get objects under that bucket's document prefix. Upload links last ≤ 5 min and enforce type and ≤ 10 MB. Download links last ≤ 5 min with `Content-Disposition: attachment`. No `*` resources. | `validate.sh` + template assertions (design); `run-tests.sh` stays green (no account id literal); a presign unit test pins expiry, conditions and disposition. **Declared gap:** the live IAM and bucket behaviour have no automated gate (mocked SDK). The substitute is one real upload and download on DEV after deploy. |
| NFR-9 | **Immutability and retention.** Evidence rows have no foreign key cascade from `Actor`. Answered rows are never updated. Personal data in them (respondent identity, IP, user agent, the address used) is listed in the TRD inventory with "retained for compliance" as its stated policy. | FR-13 tests; TRD sweep in FR-17. |
| NFR-10 | **Accessibility.** The public page, the bulk confirm and result, the post-create prompt and the evidence panel meet WCAG 2.1 AA. That means labelled fields, errors via `aria-describedby`, `aria-live` for progress and results, focus-trapped dialogs, and keyboard operation. | `jest-axe` + component tests; rendered capture at 375/768/1440 at the HITL pause (no automated layout gate). |
| NFR-11 | **No token reaches analytics.** The consent page is structurally outside the analytics mount, so GA4 never loads on it, whatever GA4 does with fragments. | Test: the consent route's layout tree contains no `GoogleAnalytics`. Mutation: rendering the page under `(public)` reddens it. |

### Defect classes and the gate that catches each

| Defect class | Gate |
|---|---|
| Token disclosed (log, URL, response, analytics) | NFR-1 log spy; NFR-11 layout test; FR-7 link-parse test |
| A miss distinguishable from another miss | NFR-2 byte-identity test |
| Non-public field on the token read | Extended `pii-boundary.spec.ts` (NFR-3) |
| A new public route escapes the release gate | Derived totality check (NFR-3) |
| Double response or race | NFR-5 test. **Declared gap** on real MySQL. |
| Stale link re-grants after an admin withdrawal | FR-12 tests on edit and bulk-lock paths |
| Admin `GRANTED` gate weakened while adding the actor path | Existing provenance and acknowledgement tests stay green; a test that the respond path is the only caller writing `EMAIL_LINK`; and tests that admin edit and bulk unlock cannot produce `GRANTED` with `EMAIL_LINK` (RB-2: an `EMAIL_LINK` → `DENIED` → `GRANTED` re-grant), and tests that link evidence on a `GRANTED` actor cannot be edited (FB-2) or relabelled by bulk unlock (FB-1) |
| A bulk run sends twice or loses requests | FR-6 tests (claimed-dispatch ordering) |
| Dispatch exceeds the Lambda timeout | NFR-6 test. Real throughput is `UNVERIFIED`, measured at execute time. |
| Identifying subject on Slack | FR-7 subject test |
| Text diverges from Legal's | FR-1 verbatim test against a committed extract of the `.docx` |
| Type mismatch between frontend and backend | `npm run build` + `npx tsc --noEmit` (compile gate) |
| IAM or bucket misconfiguration live | **No automated gate.** The substitute is the post-deploy upload and download on DEV (NFR-8). |
| Layout of the new screens at 375/768/1440 | **No automated gate.** The substitute is a headless-Chromium capture at the HITL pause. |
| A constitutional sentence left false | FR-17 sweep, run as recorded in its task; Reviewer on every baseline task |

## 7. Data & Schema Impact

- **New entity, the consent request.** One row per request, with no foreign key to `Actor`, so it survives deletion. It holds the fields of FR-13 and the token hash. Admin-only; never in any public projection.
- **New entity, the consent document.** One row per uploaded file: actor, storage key, file name, type, size, uploader, times, upload state.
- **New values:**
  - `ConsentMethod.EMAIL_LINK`;
  - `ActorAuditAction` values for *consent requested*, *consent responded* and *document uploaded*. Design fixes the names. The frontend `AuditEntry['action']` union and `ActorHistoryPanel`'s total `Record` must follow, or the build fails.
- **Audit identity.** Actor-originated audit rows use a reserved sentinel `actingSub`. It is the first non-admin identity ever written (§3).
- **Disclosure classification.** `pii-consent.policy.ts` is **unchanged**: no `Actor` column is added. The token read reuses `toPublicDetail`'s field set. The new tables are contained structurally (ADR-010 pattern), never via the `Actor` serializer.
- Migrations are additive.

## 8. Dependencies & Assumptions

- **Upstream.** Chunk 1 is done: every new actor has an email, and `ImportRowResult.actorId` exists.
- **AWS.** The new bucket and IAM are in `infra/20-backend/template.yaml`, which ships on every merge to `main` (`docs/infrastructure.md` §3). Every command uses `--profile IBD-DEV`. The backend gains `@aws-sdk/client-s3` and `@aws-sdk/s3-presigned-post` / `s3-request-presigner`.
- **Assumption (user-stated, D-1).** Legal approved click-to-consent and the three wording changes. OQ-6 suggests a courtesy review of the diff.
- **Assumption.** The organization named on the page is the actor's `traderName`.

## 9. Out of Scope

- Re-consent for actors already `GRANTED` (D-3).
- Swahili (D-4).
- Editing data on the consent page, and self-service withdrawal.
- Automatic reminders, scheduled resends, and asynchronous workers (proposal option A2) unless NFR-6's measurement forces escalation.
- Malware scanning (R-6, accepted risk).
- Delivery tracking (ADR-015 D-H).
- A cross-actor evidence export (D-12).
- Changes to self-registration's consent text or flow.
- The Staff role gaining any of these actions.

## 10. Open Questions

| # | Question | Recommended default |
|---|---|---|
| OQ-6 | Should Legal see the three adapted sentences before release? | Yes, as a courtesy diff. It does not block execution. |
| OQ-7 | Confirm D-20…D-23 above. | As written. |
| OQ-8 | Should the post-create prompt also appear after **edit**, when an admin adds the first email? | No. The edit page's **Send consent request** action covers it. |

## 11. Requirement ID Index

| ID | Title | Proposal source |
|---|---|---|
| FR-1 | Admin-managed consent edition registry | §11, D-8 |
| FR-2 | Eligibility | O-1, D-3 |
| FR-3 | Send to one actor | O-2 |
| FR-4 | Bulk send | O-1 |
| FR-5 | Offer after import | O-3 |
| FR-6 | Durable before sent | §10 A1 |
| FR-7 | The email | O-4, R-5 |
| FR-8 | The link | O-6, D-2 |
| FR-9 | Public consent page | O-5 |
| FR-10 | Responding | O-6, O-7 |
| FR-11 | One dead-end page | §11 |
| FR-12 | Admin changes supersede | D-20 (new) |
| FR-13 | Evidence recorded and permanent | O-7 |
| FR-14 | Consent evidence panel | O-8 |
| FR-15 | Upload a consent document | O-9 |
| FR-16 | Download a consent document | O-8, R-6 |
| FR-17 | Baselines and constitution | R-9, KZ-006 |
| NFR-1…NFR-11 | §6 | R-1, R-2, R-4…R-8 |
