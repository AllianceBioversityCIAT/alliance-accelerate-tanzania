# Proposal — Registration Information Requests & Withdrawal

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `admin/registration-info-requests` |
| Proposal date | 2026-08-03 |
| Author | AKILI (Leader) on behalf of JuanCode |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting approval |
| Parent epic | [`epic/hybrid-actor-registration`](../../epic/hybrid-actor-registration/proposal.md) — chunk **4 of 4** |
| **Depends on** | `actors/public-self-registration` (chunk 3) — archived 2026-08-06 to `docs/specs/archive/2026-08-06-actors--public-self-registration/` |
| **Parallel-safe** | no |
| Suggested depth | **Lite** (one new round-trip on an existing module; no new entity, no new public surface class) |

## 2. Intent

Close the loop the mockup shows but chunk 3 deliberately leaves open: when a submission is *almost* right, let the reviewer **ask for specific corrections** instead of rejecting it, and let the applicant supply them and resubmit. Let an applicant **withdraw** a submission they no longer want reviewed.

This is the smallest chunk and the most droppable one — chunks 1–3 ship a complete, usable registration loop without it.

## 3. Problem / Current Behavior

After chunk 3, a reviewer looking at a submission with one bad GPS coordinate and a missing capacity figure has exactly two options: **approve it wrong, or reject it entirely**. Rejection sends the applicant back to a blank form to retype everything, which in practice means they do not come back.

Applicants likewise have no way to say "ignore this, I submitted it twice" — the reviewer must reject it and the applicant never learns why they should not have.

Both `AWAITING_APPLICANT` and `WITHDRAWN` exist in `RegistrationStatus` after chunk 3 but are unreachable.

## 4. Proposed Outcome

1. **Request more information** — the reviewer selects which specific fields need revision (the mockup shows checkboxes: *Annual average capacity · GPS coordinates · Phone number*), writes a message to the applicant, and moves the registration to `AWAITING_APPLICANT`.
2. **Applicant revision** — the applicant returns via the emailed link *or* the reference-code status page, sees exactly which fields were flagged and the reviewer's message, edits **only those fields**, and resubmits. Status returns to `PENDING_REVIEW`.
3. **Withdrawal** — the applicant can withdraw a `PENDING_REVIEW` or `AWAITING_APPLICANT` submission from the receipt or status page. Status becomes `WITHDRAWN`; it leaves the active queue.
4. **Revision history** — the reviewer sees what changed between the original submission and the resubmission, so a second review is a diff, not a re-read.

## 5. Scope

**Data (additive):**

```prisma
model Registration {
  // ... chunk 3 fields ...
  requestedFields  Json?      // string[] of field keys the reviewer flagged
  requestMessage   String?  @db.Text
  revisionCount    Int      @default(0)
  revisions        Json?      // append-only prior payloads, for the review diff
}
```

No new model. No new enum values — chunk 3 already defines `AWAITING_APPLICANT` and `WITHDRAWN`.

**Backend:**

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/v1/admin/registrations/:id/request-info` | Admin | Flagged fields + message → `AWAITING_APPLICANT`; notifies applicant. |
| `GET /api/v1/registrations/revision` | Public | Reference + email (or a signed link token) → the flagged fields, the reviewer message, and **only the current values of the flagged fields**. |
| `PATCH /api/v1/registrations/revision` | Public | Accepts values for the flagged fields **only**; validates them the same way the original submission was; → `PENDING_REVIEW`, `revisionCount++`. |
| `POST /api/v1/registrations/withdraw` | Public | Reference + email → `WITHDRAWN`. Terminal. |

- **Field allowlist enforced server-side.** A revision request carrying a field the reviewer did not flag is rejected — the applicant cannot rewrite their whole submission (least of all the consent record) under cover of a correction.
- **Consent is immutable across revisions.** `consentAcceptedAt` and `consentPolicyVersion` are never re-written by a revision. If the policy version has moved on, the reviewer must reject and ask for a fresh submission (OQ-2).
- Revision links are **single-purpose and expiring**; the reference-code path remains the fallback per the epic's A-3.

**Frontend:**
- Admin: *Request more information* modal (field checkboxes + message); a revision-diff view on the detail screen.
- Public: revision screen reached from the emailed link or the status page; withdraw action with confirmation on the receipt and status screens.

**Infra:** SES templates for the information-request and revision-received notices.

## 6. Non-Goals

- **Free-form applicant↔reviewer messaging.** One flagged-field request, one revision. Not a support inbox.
- **Unlimited revision rounds.** Bounded (see OQ-1); past the bound the reviewer approves or rejects.
- **Reviewer editing the submission directly.** The applicant supplies their own corrections — otherwise the record stops being self-declared and the consent basis blurs.
- **Withdrawal after approval.** Once published, the record is an `Actor`; removal is an admin action with audit, not an applicant self-service action. (Data-subject erasure ties to PRD OQ-4 and is not solved here.)
- **Notifying the applicant of anything beyond the request and the outcome.**

## 7. Affected Users, Systems, And Specs

| Area | Impact |
|---|---|
| **Users** | Applicants (revise, withdraw); Admin reviewers (request info, review a diff). |
| **Backend** | `registrations` module only — additive columns, four endpoints. |
| **Frontend** | One admin modal + a diff view; one public revision screen + withdraw action. |
| **Data** | Four additive columns on `Registration`. |
| **Specs** | Strictly extends chunk 3. Touches nothing chunk 1 or 2 owns. |
| **Constitutional** | **TRD §4** gains four endpoints. Minor **`docs/ux-ui/design.md` §4** additions. No PRD change — chunk 3 already moved self-onboarding in scope. |

## 8. Requirement Delta Preview

### ADDED
- Four `Registration` columns (`requestedFields`, `requestMessage`, `revisionCount`, `revisions`).
- Four endpoints (one admin, three public).
- Reviewer *request more information* modal with per-field selection.
- Applicant revision screen restricted to the flagged fields.
- Withdrawal from receipt and status screens.
- Revision-diff view at review.
- SES templates for request + revision-received.
- `pii-boundary.spec.ts` coverage for the three new public paths.

### MODIFIED
- `AWAITING_APPLICANT` and `WITHDRAWN` become reachable states; the admin queue's status filters begin returning rows for them.
- The submission receipt gains a withdraw action.

### REMOVED
- Nothing.

## 9. Approach Options

| | **A — Field-scoped revision (recommended)** | **B — Full-form re-edit** | **C — Reject-and-resubmit only** |
|---|---|---|---|
| What the applicant can change | Only the flagged fields | Everything, including consent | Nothing — they start over |
| Re-review cost | A diff of 1–3 fields | A full re-read | A full read |
| Risk of consent being silently re-written | None — untouchable | **Real** | n/a |
| Effort | ~1 wk | ~0.8 wk | 0 (this is chunk 3's behavior) |

## 10. Recommended Approach

**Option A.** It is barely more work than B and materially safer: a full-form re-edit means the payload that was consented to is not the payload that gets published, and reconstructing which version the applicant actually agreed to becomes an archaeology exercise. Scoping the revision to the reviewer's own flagged list keeps the consented submission intact and makes the second review a glance instead of a re-read.

Option C is the honest baseline — it is what ships without this chunk, and it is genuinely acceptable. This spec should be dropped without hesitation if chunks 1–3 run long.

## 11. Risks, Dependencies, And Open Questions

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | **Field-allowlist bypass.** A crafted `PATCH` could try to modify unflagged fields — including `consentAcceptedAt`, `submitterEmail`, or the status itself — turning a correction into privilege escalation. | Server-side allowlist derived from the stored `requestedFields`, never from the request body. Explicit negative tests. |
| **R-2** | **Revision links are bearer credentials.** Anyone holding the emailed link can alter a real organisation's submission. | Single-purpose, expiring, single-use-per-round tokens; the reference-code path additionally requires the matching email. |
| **R-3** | **SES dependency again** (epic R-3). An information request that never arrives leaves a submission stuck in `AWAITING_APPLICANT` forever. | The status page shows the request and the flagged fields without any email. Add a stale-`AWAITING_APPLICANT` indicator in the queue so reviewers can see abandoned ones. |
| **R-4** | **Revision ping-pong.** Unbounded rounds let a submission live indefinitely and inflate `revisions`. | Bound the rounds (OQ-1) and cap stored revision history. |
| **R-5** | **PII in `revisions`.** Every prior payload — including superseded phone numbers and emails — accumulates in an admin-only JSON column. | Same admin-only treatment as `payload`; include in `pii-boundary.spec.ts`; fold into the retention answer for PRD OQ-4. |
| **OQ-1** | How many revision rounds before the reviewer must decide? (Suggested default: **2**.) | Product decision; one constant. |
| **OQ-2** | If the consent policy version changes while a registration sits in `AWAITING_APPLICANT`, must the applicant re-accept before resubmitting? | Legal input. Affects one branch, but getting it wrong publishes a record consented under superseded terms. |
| **OQ-3** | Should a withdrawn registration be purgeable by the applicant, or retained for audit? | Ties to PRD OQ-4 (PII retention), still open. |

## 12. Success Criteria

- A reviewer can flag specific fields with a message; the registration moves to `AWAITING_APPLICANT` and leaves the pending queue.
- The applicant can revise **only** the flagged fields — a request touching any other field is rejected with a `400`, proven by a negative test.
- `consentAcceptedAt` and `consentPolicyVersion` are byte-identical before and after a revision round.
- Resubmission returns the registration to `PENDING_REVIEW` and the reviewer sees a field-level diff.
- Withdrawal is terminal: a `WITHDRAWN` registration cannot be revised, resubmitted, or approved.
- The whole round-trip completes using **only** the reference code, with email delivery disabled.
- No public path exposes any registration field beyond the flagged ones and the reviewer message — `pii-boundary.spec.ts` green.
- Gates green in `backend/` and `frontend/`.

## 13. Visual Reference

- **Source:** Client-supplied mockup strip (approximate; copy provisional).
- **Location:** `../../archive/2026-08-06-actors--public-self-registration/mockup/self-registration-flow.png` — the right-hand panels.
- **Covers:** the *Request more information* modal (field checkboxes + message to the applicant), the amber "Information requested" result banner, and the applicant's return-via-emailed-link screen (*"A reviewer needs two things"* → fill the flagged fields → *Request for review*), including the withdraw affordance.
- **Not covered:** the reference-code path into the same revision screen (the mockup assumes email) and the revision-diff view at review — both are additions this proposal makes over the mockup, and both need design attention during `/akili-specify`.

## 14. Next Step

Only after chunk 3 is executed:

```text
/akili-specify admin/registration-info-requests
```
