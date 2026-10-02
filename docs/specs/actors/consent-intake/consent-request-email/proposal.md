# Proposal — Consent request by email for team-managed actors (ATP-84)

**In one line:** an admin sends a consent-request email to one or many team-managed actors. The actor opens a 30-day link, identifies themself, and accepts or declines the Legal-approved *Administrator-Managed Registration* consent. Their answer sets `consentStatus` automatically and leaves an immutable, auditor-ready evidence record. The same change adds an optional signed-form upload (private S3) on actor create, unifies the required fields across the three intake paths, and trims the import template to v4.

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `actors/consent-intake/consent-request-email` |
| Parent Spec | `actors/consent-intake` (see [`family.md`](../family.md)) — chunk **2 of 2** |
| Slug | `consent-request-email` — derived from the free-text argument |
| Ticket | [ATP-84](https://cgiarmel.atlassian.net/browse/ATP-84) (subtask of ATP-75, *Post-handover improvements from client review meeting, 2026-10-01*) |
| Proposal date | 2026-10-02 |
| Author | AKILI (Leader) on behalf of Daniela Gómez |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | Approved — Daniela Gómez, 2026-10-02 (family split) |
| Branch | `feature/atp-84-consent-request-email` (from `main` @ `609a752`) |
| **Depends on** | `actors/consent-intake/intake-required-fields` |
| **Parallel-safe** | no — it shares `ActorForm.tsx` and `actor-import.service.ts` with chunk 1. Against other branches it is clear: no unmerged branch touches `backend/src/actors`, `backend/src/registrations`, `ActorForm.tsx` or the template (checked 2026-10-02: `enhancement/actor-multiple-types` has no commits ahead of `main`; `origin/infra/data-auth-public-app-url` touches only `infra/scripts/**`) |
| Suggested depth | **Full**. It adds a new public surface class (an unauthenticated write that moves an actor to `GRANTED`), a new evidence entity, new infrastructure (an S3 bucket), and constitutional amendments (PRD, TRD, ADR-017). |

### Decisions already taken (product owner, 2026-10-02)

| # | Decision |
|---|---|
| D-1 | **Legal has approved click-to-consent** in place of a signed document. Recorded on the product owner's statement; ATP-84's "Blocked on Legal review" is lifted. |
| D-2 | The link **expires after 30 days**. |
| D-3 | **No re-consent campaign** for actors already `GRANTED`: every actor in the current dataset is test data. |
| D-4 | **English only**, for both the email and the page. |
| D-5 | Drop these template columns: **GPS Altitude, GPS Accuracy, Registration Source**. An import is always `TEAM_MANAGED`. *Amended 2026-10-02: the first list also dropped Consent Method, Consent Obtained At and Consent Reference. Those are now kept (D-13).* |
| D-6 | **Required fields must be identical** across self-registration, the admin create form and the import. |
| D-7 | The manual create form gets an **optional upload of a consent obtained out of band**, stored in S3. |
| D-8 | The actor gives **name, position and email** (plus the document's other identity fields) before accepting. The consent text is adapted **only where the signature wording requires it**. |
| D-9 | The operation must be **fully traceable**: the actor's decision is stored and can be shown to an auditor. |
| D-13 | The **consent columns stay in the template, all optional**: Consent Status, Consent Method, Consent Obtained At, Consent Reference. A blank status imports as `UNKNOWN`, to be emailed later. A `GRANTED` row still needs a method and a date plus the file-level acknowledgement, which is today's provenance gate, unchanged. Use case: a handful of actors whose consent the team already holds. |
| D-14 | **No mockup.** The email reuses the established `email-layout.ts` design, and the page reuses existing patterns. |

## 2. Intent

Remove the manual consent chase for team-managed actors and make their consent **evidenced** rather than **asserted**.

## 3. Problem / Current Behavior

- **Consent comes from the admin's word, not from the actor.**
  - Every admin route to `GRANTED` requires `acknowledged: true` ("I confirm consent is on file") plus a method and a date (`isConsentProvenanceSatisfied` in `backend/src/common/consent-provenance.policy.ts`; `ActorsAdminService.create` / `update` / `bulkSetConsent`).
  - The system stores the admin's claim, never the actor's act. This is P-2 in `docs/specs/epic/hybrid-actor-registration/proposal.md`.
- **The consent document itself never reaches the platform.** ATP-84 describes the current process: the actor signs a paper form, scans it and sends it back, and the admin keeps it. Only a free-text `consentReference` (≤255 characters) points at it (`Actor.consentReference`, `backend/prisma/schema.prisma`).
- **Imported actors default to `UNKNOWN`.** That holds when the Consent Status cell is blank (`ActorImportService`, Consent Status parsing). They stay unpublished until an admin edits each one.
- **Required fields differ across the three paths** (verified in the DTOs and in `ActorForm.validate`):

  | Field | Self-registration (`RegistrationPayloadDto`) | Admin create (`ActorCreateDto` + `ActorForm`) | Import (`template-columns.ts` v3) |
  |---|---|---|---|
  | Trader ID | n/a — derived from the reference on approval (DD-23) | required | required |
  | Trader Name, Trader Type, Region | required | required | required |
  | Contact Person | **required** | optional | optional |
  | Crops (≥1) | **required** (`@ArrayNotEmpty`) | optional | optional |
  | Capacity (tonnes) | **required** | optional | optional |
  | Phone | **required** | optional | optional |
  | Email | **required** | optional | optional |

- **No email-link mechanism exists.** The only token-like object is the self-registration OTP, which is keyed by email, not by actor (`EmailVerification` model).
- **No document storage exists.** The only S3 bucket is the frontend origin (`infra/30-frontend/template.yaml`, `FrontendBucket`). The API Lambda runs **outside the VPC** (`infra/20-backend/template.yaml`, *NO VpcConfig*), so it can reach S3 directly.
- **Bulk sending is bounded by time.**
  - The API Lambda has `Timeout: 15` (`infra/20-backend/template.yaml`).
  - One microservice send measured 1132–1227 ms on 2026-09-16 (ADR-015). That measurement opened a connection per send.
  - At that rate one request can send **about 10 emails**, so "send to all ~1,000" cannot be one synchronous call. Throughput with a reused connection is `UNVERIFIED — confirm at source before relying on it` (measure during `/akili-specify`).

## 4. Proposed Outcome

| # | Behavior |
|---|---|
| O-1 | **Bulk send.** In **Admin → Actors**, the admin selects actors (rows, the visible page, or *all actors matching the current filters*) and clicks **Send consent request**. A confirm dialog shows how many will be sent and how many skipped, and why: no email, already `GRANTED`, or a request already pending. A result summary follows: *sent / skipped / failed*. |
| O-2 | **After creating one actor**, the form asks *"Send a consent request to <email>?"*, defaulting to yes when the actor has an email. A **Send consent request** action is also available on the actor's detail/edit page, which covers resends. |
| O-3 | **After an import commit**, the result screen offers *"Send consent requests to the N created actors with an email."* |
| O-4 | **The actor receives an email.** Its content: *"Your consent is requested to publish the following information about <Organization> on the ACCELERATE Tanzania Registry (<site>)."* It has a **Review and respond** button. The subject is a fixed string with no name or address in it (see R-5). |
| O-5 | **The link opens a public page.** It shows: the data that would be published (the actor's own record, the public-detail field set); the consent text; identity fields (organization pre-filled read-only; name, position, email and telephone required); an "I have read and accept" checkbox; and **Accept** and **Decline** buttons. |
| O-6 | **The response takes effect at once.** **Accept** sets `consentStatus = GRANTED`, with method set to a new value `EMAIL_LINK`, `consentObtainedAt` set to the server-witnessed response time, and `consentReference` set to the request id. The actor then appears in the public registry through the existing path. **Decline** sets `DENIED`. Both responses are final for that link; withdrawal later goes through the data-protection contact named in the consent text. |
| O-7 | **Evidence is permanent.** One `ConsentRequest` row records: who sent it and when, the address it went to, the consent edition and a hash of its text, the expiry, the response and when it was given, the respondent's identity fields, IP and user agent. It is never deleted, including when the actor is deleted, because the consent text says CIAT may retain consent records. The actor's activity trail gains *consent requested* and *consent accepted/declined* entries. |
| O-8 | **Admins can show it to an auditor.** The actor's page shows a **Consent evidence** panel: every request with its status (pending / accepted / declined / expired / superseded), the respondent's details, the exact consent edition, and any uploaded document, which downloads through a short-lived link. |
| O-9 | **Manual create and edit** offer an optional upload of a consent obtained out of band (PDF/JPG/PNG, ≤10 MB). The file goes to a private, encrypted S3 bucket and is recorded as `SIGNED_FORM` evidence. The existing acknowledgement gate still applies, because an uploaded file is still the admin's assertion. |
| O-10 | **Same required fields everywhere.** Admin create, admin edit and import require exactly what self-registration requires: Trader Name, Trader Type, Region, Contact Person, ≥1 crop, Capacity, Phone, Email. Trader ID stays required on the admin paths; see OQ-1. |
| O-11 | **Import template v4** drops the three columns in D-5 and keeps the optional consent columns (D-13). Imported actors are always `TEAM_MANAGED`. The workbook is regenerated, never hand-edited. |

## 5. Scope

- **Backend**
  - `ConsentRequest` model and migration.
  - New enum values: `ConsentMethod.EMAIL_LINK`, and audit actions `CONSENT_REQUESTED`, `CONSENT_RESPONDED`, `CONSENT_DOCUMENT_UPLOADED`.
  - A sentinel `actingSub` for actor-originated audit rows, since `ActorAuditLog.actingSub` is NOT NULL.
  - Admin endpoints: send by ids, send by filter, list evidence, upload-URL issuance, document download URL.
  - Public endpoints: read a request by token, respond. Throttled like `RegistrationsThrottleGuard`.
  - A `consent-request` mail template, a second consent-policy registry (*admin-managed* editions), and the required-field DTO changes.
  - Template v4: `template-columns.ts` with `TEMPLATE_VERSION = 'v4'`, the regenerated `.xlsx`, and import-service parsing.
- **Frontend**
  - Admin Actors: the bulk action, "all matching filters", and the progress/result banner.
  - `ActorForm`: required fields, the post-create prompt (`onSuccess` must receive the created actor), and the upload field.
  - Import result: the CTA.
  - Actor page: the Consent evidence panel.
  - Public page `app/(public)/consent/page.tsx`: token read from the URL **fragment**, then stripped.
- **Infra**
  - A private S3 bucket in `20-backend`: all four Block Public Access switches, SSE, `BucketOwnerEnforced`, a TLS-only bucket policy, versioning on.
  - Lambda IAM `s3:PutObject` / `s3:GetObject` scoped to that bucket.
  - A new `ConsentDocumentsBucket` env var. All commands run under `--profile IBD-DEV`.
- **Docs**
  - PRD: a new item/US/AC for consent requests, and the required-field change.
  - TRD: data model, API surface, a QA scenario for the token endpoint, and **ADR-017**.
  - `docs/infrastructure.md`: the new bucket.
  - ~~The import runbook~~: none exists outside the archive (chunk 1 requirements.md FR-6, amended 2026-10-02).

## 6. Non-Goals

- A re-consent campaign for actors who are already `GRANTED` (D-3).
- Swahili or other languages (D-4).
- Letting the actor **edit** their data on the consent page. Corrections go through the contact named in the consent text.
- Self-service **withdrawal** through the link after responding. Withdrawal stays a request to the data-protection contact.
- Automatic reminders or scheduled resends. An admin resends by hand.
- Malware scanning of uploaded files (see R-6).
- Delivery tracking (bounces, opens). The microservice gives no delivery signal (ADR-015 D-H).
- Changing the self-registration consent text or flow.

## 7. Affected Users, Systems, And Specs

| Area | Impact |
|---|---|
| Admin (Cognito `admin`) | New bulk action, post-create prompt, import CTA, evidence panel, upload. |
| Team-managed actor (new, anonymous recipient) | Receives the email and responds on a public page. This is a new persona in the PRD. |
| Public visitor | No change. Accepted actors appear through the existing `GRANTED` path (ADR-013). |
| `backend/src/actors/**`, `backend/src/registrations/consent-policy*`, `backend/src/mail/**`, `backend/src/common/{template-columns,consent-provenance.policy}.ts` | Modified. |
| New `backend/src/consent-requests/**` module | New. |
| `frontend/app/(admin)/admin/actors/**`, `components/admin/{ActorForm,BulkActionBar,ActorsTable}.tsx`, `app/(public)/consent/` | Modified / new. |
| `infra/20-backend/template.yaml` | New bucket and IAM. |
| `src/test/pii-boundary.spec.ts` | Must be extended. The public token read returns contact fields to an unauthenticated caller, which is a new PII surface. |
| Related archived specs | `2026-08-04-actors--registration-source-and-consent` (the provenance gate), `2026-09-15-legal--legal-notices-and-consent-copy` (ADR-014 registry), `2026-07-10-admin--actor-import`, `2026-07-08-admin--bulk-actor-operations`, `2026-06-25-changes--auth-wiring` (lists a "consent-request workflow" as deferred). |

## 8. Visual Reference

- Source: **None** — a mockup was offered and declined (D-14).
- Notes: four UI surfaces are in scope — the public consent page, the bulk send dialog with its result, the post-create prompt, and the evidence panel. All reuse existing patterns (`ConfirmDialog`, `BulkActionBar`, `ConsentPolicyDisclosure`'s scroll gate, `ConsentRecordCard`, `email-layout.ts`).

## 9. Requirement Delta Preview

### ADDED Requirements

- An admin can request consent by email from one actor, a selection, or all actors matching a filter. Ineligible actors are skipped and the skips are reported.
- The actor can accept or decline online within 30 days, after giving name, position, email and telephone. A link that has expired, been used, or been superseded shows a clear dead-end page with the contact address.
- The response updates `consentStatus` without admin action.
- Every request and response is stored immutably with the consent edition and its text hash, and admins can view it.
- An admin can attach a consent document to an actor on create or edit. It is stored privately in S3 and only admins can download it.
- An *Administrator-Managed Registration* consent edition registry is added: versioned, append-only, code not data (ADR-014 pattern).

### MODIFIED Requirements

- Admin create, edit and import require Contact Person, ≥1 crop, Capacity, Phone and Email, in addition to today's set.
- The import template moves to v4 without the D-5 columns. A v3 workbook is rejected as stale, which is the existing behavior.
- A second route to `GRANTED` that bypasses the admin acknowledgement gate is introduced. It is valid because the actor is the one consenting (ADR-017).

### REMOVED Requirements

- Importing an actor's **Registration Source**: an import is always `TEAM_MANAGED`. GPS Altitude and Accuracy can no longer be imported, but stay editable on the form (D-11).

## 10. Approach Options

### A. How the emails are sent (the time-bound problem in §3)

| Option | How | Pros | Cons |
|---|---|---|---|
| **A1 — Persist first, dispatch in client-driven chunks** | One call creates all `ConsentRequest` rows as `QUEUED` (fast DB work, no mail). The frontend then calls `dispatch` repeatedly; each call sends the next ≤N over **one reused AMQP connection** and marks rows `SENT` / `FAILED`. | No new infra. Every request is durable before any send. Failures are visible and can be retried. Progress UI is natural. | The admin's tab must stay open until done (a leftover `QUEUED` row can be resumed). N is unmeasured. |
| A2 — Async worker | The same persistence, then an async Lambda invoke or SQS drains the queue. | The browser can close. Scales to any volume. | A new Lambda, queue and IAM, plus a deploy of `20-backend` infra. More to test (KZ-auth-2: deploy paths). |
| A3 — Synchronous, cap at ~10 | One call sends at most ~10. | Smallest. | Fails D-9 ergonomics for 1,000 actors, and there is no durable "queued" state. |

### B. Upload path

| Option | Pros | Cons |
|---|---|---|
| **B1 — Presigned PUT from the browser** (API issues a 5-minute URL with content-type and size conditions, then confirms) | Bypasses API Gateway's 10 MB and Lambda's 6 MB payload limits. The import's base64 pattern does not scale to scans. | Two calls; an orphaned object is possible if the confirm never happens (lifecycle rule). |
| B2 — base64 through the API (as import does) | One call. | Hits payload limits with real scans and inflates them by 33 %. |

## 11. Recommended Approach

**A1 + B1, in two chunks.**

- **Why A1.** It is the smallest path that meets D-9. Persisting before sending means a crash mid-campaign leaves auditable `QUEUED` rows, not silent gaps. It adds no infra beyond the bucket. If measurement during `/akili-specify` shows N < ~25 even with connection reuse, escalate to A2 there, not in execution.
- **Token design.**
  - 32 bytes from a CSPRNG, base64url, stored only as SHA-256 (high entropy, so no HMAC is needed).
  - Carried in the URL **fragment** (`/consent#t=…`), so it never reaches CloudFront or API logs. The page strips it with `history.replaceState`.
  - Single-use. A resend supersedes the previous request.
  - The public endpoints use `POST` with the token in the body, and every miss gets the same 404.
- **Consent text.**
  - Stored as a new edition registry, `admin-managed-consent v1.0`, in the ADR-014 pattern.
  - Copied verbatim from the Legal-approved .docx except for these edits, which are all the click wording requires (D-8):

    | Original | Adapted |
    |---|---|
    | "By signing this Consent, I confirm that:" | "By accepting this Consent, I confirm that:" |
    | "By signing below, I expressly and voluntarily consent to:" | "By selecting **I accept** below, I expressly and voluntarily consent to:" |
    | Signature block: Organization Name / Name of Authorized Representative / Position/Title / Email / Telephone / Signature / Date | Form fields. Organization is pre-filled read-only; Name, Position, Email and Telephone are required inputs. **Signature** becomes the acceptance checkbox plus **Accept**. **Date** is recorded by the server. |

  - Everything else stays word for word, including the data-protection contact.
  - The **Decline** button is UI copy, not consent text.
  - The respondent's email and telephone are **evidence only**; they never overwrite the actor's record.

**Chunking (approved 2026-10-02; manifest in [`../family.md`](../family.md)):**

| Order | Chunk | Contents | Depth | Depends on |
|---|---|---|---|---|
| 1 | `actors/consent-intake/intake-required-fields` | O-10 + O-11, plus the generated Trader ID and duplicate detection added in specify (D-15 to D-18 there) | ~~Lite~~ **Standard** | none |
| 2 | `actors/consent-intake/consent-request-email` | O-1…O-9 (evidence model, email + public page, upload + S3, evidence panel, ADR-017) | Full | chunk 1 (both edit `ActorForm` and the import service) |

Chunk 1 is small, ships value at once, and removes the field-rule churn from the high-risk chunk. A single spec also works if you prefer one PR; the cost is a larger review.

## 12. Risks, Dependencies, And Open Questions

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | **A public, unauthenticated write moves an actor to `GRANTED` and publishes its contact block** (ADR-013). This is correctness-critical (effort `max`). | Token entropy, single use, expiry, uniform 404s, throttling, a QA scenario in the TRD, and an extended `pii-boundary.spec.ts`. The mutation must be demonstrated to fail the gate (KZ-002). |
| R-2 | **The page shows the actor's own contact data to whoever holds the link**, for example if the email is forwarded. | Accepted: the data is the recipient's own and the link lives only in their inbox. Show only the public-detail field set, never `NEVER_PUBLIC_FIELDS`. |
| R-3 | **The respondent may not be the authorized representative.** | The consent text already makes them confirm authority, and their identity is captured as evidence. CIAT may request proof, per the consent text. |
| R-4 | **Bulk throughput is unknown** (§3). | Measure send-on-reused-connection during specify (KZ-011: measure, never reason). Escalate to A2 if needed. |
| R-5 | The microservice **posts every subject line to Slack** (ADR-015). | Use a fixed subject with no organization name, recipient or reference, and extend the ADR-015 subject inventory. |
| R-6 | **Uploaded files are unscanned PII** (scans carry signatures). | Private bucket, admin-only short-lived GET, content-type and size allowlist, no inline rendering (`Content-Disposition: attachment`). Malware scanning is recorded as accepted risk. |
| R-7 | **Unified required fields break existing rows on edit**: an admin editing an old actor without a phone must now add one. | Acceptable under D-3 (test data). Stated in the PRD change. |
| R-8 | **The analytics shell on `(public)`** could record the URL. | The token lives in the fragment and is stripped before GA4 can mount. Whether GA4 records the fragment is `UNVERIFIED — confirm at source` during specify. |
| R-9 | **Bypassing the admin acknowledgement gate** is a deliberate constitutional change. | ADR-017, with a Reviewer on every baseline-touching task (CLAUDE.md, blast-radius rule). |

Applicable lessons:
- **KZ-001**: close coverage at clause level.
- **KZ-002 / KZ-013**: demonstrate a falsifier for the token and the PII gates.
- **KZ-006**: the new `ConsentRequest` object must be swept through the TRD's object list in the same change.
- **KZ-007**: the provenance gate × the actor path × the acknowledgement gate is a conjunctive constraint set.
- **KZ-010**: re-check `git log` before writing and committing.

### Open questions

| # | Question | Recommended default |
|---|---|---|
| OQ-1 | **Trader ID:** keep it required on the admin create form and the import, or auto-generate it as self-registration does? It is the import's duplicate key. | **Keep it required.** It is the team's own dataset identifier and the dedupe key. |
| ~~OQ-2~~ | **Decided (D-13, 2026-10-02):** the consent columns are kept, all optional. | — |
| ~~OQ-3~~ | **Decided (D-10, 2026-10-02):** the upload is available on **edit** too, with the same component as create. | — |
| ~~OQ-4~~ | **Decided (D-11, 2026-10-02):** GPS Altitude and Accuracy **stay on the admin form**. Only the template drops them, and the DB columns stay. | — |
| ~~OQ-5~~ | **Decided (D-12, 2026-10-02, on the Leader's recommendation):** a cross-actor evidence **export is deferred**. The per-actor panel (admin-only) meets D-9. | — |
| OQ-6 | Should Legal see the adapted wording (the three edits above) before release? | **Yes**, as a courtesy review of the diff only. It does not block specify. |

## 13. Success Criteria

- A test campaign to ≥100 imported actors completes from the UI, and every eligible actor ends with a `ConsentRequest` in `SENT` (or `FAILED` with a visible retry).
- Accepting a link makes the actor appear on `/directory` and `/profile` with no admin action. Declining sets `DENIED`. A reused, expired or superseded link changes nothing.
- For any `GRANTED` actor reached via the link, an admin can show, from the UI: who sent the request, when, to which address, the exact consent edition, and who accepted, when, and with which identity.
- `pii-boundary.spec.ts` covers the new public read, and a deliberately-leaking variant reddens it.
- The three intake paths reject the same missing-field set, and template v4 imports cleanly while a v3 file is rejected as stale.

## 14. Next Step

After chunk 1 is complete:

```text
/akili-specify actors/consent-intake/consent-request-email
```
