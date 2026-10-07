# Archive Summary — Consent request by email for team-managed actors

> **Outcome: delivered and live.** An admin can request consent from team-managed actors by email, and the actor accepts or declines on a link valid for 30 days. Every request and answer is kept as immutable evidence, and admins can upload signed documents to a private S3 bucket. The feature merged in PR #88 and was verified live on 2026-10-07 (T-14). The final validation found no code defect.

## 1. Document Control

| Field | Value |
|---|---|
| Spec | `actors/consent-intake/consent-request-email` (child 2 of the `actors/consent-intake` family, ATP-84) |
| Archive date | 2026-10-07 |
| Archived to | `docs/specs/archive/2026-10-07-actors--consent-intake--consent-request-email/` |
| Branches | `feature/atp-84-consent-request-flow` (T-1…T-13, R-A…R-H; PR #88, merged `0b6085e`) · `docs/atp-84-consent-t14-archive` (T-14, final validation, archive) |
| Kaizen entry | `docs/specs/kaizen/actors--consent-intake--consent-request-email.md` |

## 2. Original Spec Path
`docs/specs/actors/consent-intake/consent-request-email/`

## 3. Archive Date
2026-10-07

## 4. Final Status

| Item | Status |
|---|---|
| Tasks | 14/14 `[x]`, each with its Reviewer PASS recorded in `execution.md` before the checkbox flipped |
| Validation | Archive-ready. Two validation passes plus a final pre-archive validation. No FAIL remains; accepted gaps are listed in `validation-report.md` |
| Live verification (T-14) | PASS. Throughput is below the 1.1 sends/s threshold (0.72/s) and was **accepted by the product owner**, with the async worker (A2) deferred |
| Budget | 48 review verdicts and ~18,500 LOC, against ~20 rounds and ~11,300 LOC planned. The post-R-C overrun was not escalated and is recorded at close-out (design §10) |

## 5. Requirements Delivered

| Area | Requirements |
|---|---|
| Sending: single, selection, filters, post-create prompt, import offer, eligibility, resumable time-boxed dispatch, failure reasons | FR-1…FR-7, NFR-6 |
| Public consent page: preview, accept/decline, answerable once, uniform 404, throttle, payload cap | FR-8…FR-11, NFR-1…NFR-5 |
| Evidence: immutable request rows, audit sentinel, evidence panel, `EMAIL_LINK` never admin-assertable | FR-12…FR-14, NFR-9 |
| Signed documents: private S3, presigned POST, confirm with checks, attachment-only download, access logging | FR-15, FR-16, NFR-8 |
| Accessibility, captures, baselines and guides | NFR-10, NFR-11, FR-17 |

## 6. Files Changed Summary
About 146 files (`git diff --stat 342390a..0b6085e`). The main ones:

| Layer | Files |
|---|---|
| Database | One additive migration, `20261005203611_add_consent_requests` |
| Backend | New `backend/src/consent-requests/` module (admin and public controllers, dispatch, evidence, documents, S3 storage); changes to `actors-admin.service.ts` (rules 1–4, supersession, D-26 409), the actor DTOs and the audit service |
| Frontend | New `app/(consent)/consent/`, `components/consent/*`, and admin components (`SendConsentDialog`, `SendConsentPrompt`, `SendConsentAction`, `ConsentQueueBanner`, `ConsentSelectionStrip`, `ConsentEvidencePanel`, `ConsentDocumentField`) plus `lib/admin/useConsentDispatch`; changes to the actors list, new, edit and import pages, `ActorForm`, `ConsentPolicyDisclosure` → `ConsentTextScrollGate`, and `ProfileLocation` |
| Infra | `infra/20-backend/template.yaml`: the documents bucket and the access-log bucket (both Retain and versioned), scoped IAM, `CONSENT_DOCUMENTS_BUCKET` |
| Docs | PRD, TRD (ADR-NNN placeholder, QA-14), UX design, `infrastructure.md`, root and backend guides, `.agents/*` |

## 7. Test Evidence Summary
- **Gates at close-out:** backend 103 suites / 1759 tests; frontend 132 suites / 2033 tests; lint, builds, `validate.sh` and the infra script tests all green.
- **Real-MySQL probes:** the D-25 enqueue lock (one row with the lock vs two without), and NFR-5's concurrent responds held behind a row lock (6/6 runs with exactly one winner).
- **T-14 live checks:**
  - throughput logs;
  - a document probe: 422 for a never-uploaded document, `EntityTooLarge`, wrong type, unsigned PUT 403, and a valid upload;
  - download link expiry;
  - accept and decline end to end;
  - infra's Block Public Access read and access-log listing;
  - 14 captures, reviewed and kept out of the repo by the product owner's decision.

No `/akili-test` run, so there is no `test-report.md`. Coverage evidence comes from the validators' clause-level audits.

## 8. Validation Summary

| Pass | Result |
|---|---|
| 2026-10-06 first validation | Not archive-ready: 2 unimplemented clauses, a GPS display defect, document drift. Fixed by R-A, R-B and R-C |
| 2026-10-06 re-validation | One blocking item (FR-10 Decline identity) and the `ListBucket` fallback. Fixed by R-D |
| 2026-10-07 final validation | Coverage PASS; facts PASS (~105 claims); consistency FAIL on a stale report and doc drift. Fixed by R-I |

Post-merge, SonarCloud on PR #88 raised 62 issues, with the gate failing on security and reliability. R-G and R-H fixed them; 7 entries were accepted with reasons in the PR comment.

## 9. Accepted Warnings Or Follow-Ups
- **A2 async worker:** deferred. The product owner accepted 0.72 sends/s (about 23 min per 1,000 actors, tab open).
- **UX follow-up:** on decline-confirm, the field errors from an earlier Accept attempt stay visible.
- **Accepted gaps** (`validation-report.md`):
  - 375/768 px captures were not retaken after R-G;
  - NFR-6's 1,000-actor completion is extrapolated;
  - the infra reads ran without `--profile`;
  - T-14 step 3 is narrative;
  - no frontend test that the failure list omits the address;
  - the `Content-Disposition` value was not captured live.
- **When the production database is reset:** empty the consent documents bucket too, every version and delete marker. It is `Retain`, and a DB reset leaves S3 objects orphaned.
- **ADR:** `ADR-NNN` (candidate ADR-018) is allocated in the kaizen apply pass on `main`. See the kaizen entry's pending items.

## 10. Historical Notes
- **Judgment day:** the design was APPROVED after two fix rounds (`judgment.md`).
- **Product-owner decisions during execution:**
  - D-24 (no link-evidence inheritance);
  - D-25 (enqueue lock);
  - D-26 (stale-form 409);
  - FR-3 confirmation;
  - the FR-15 amendment (the document row is the evidence);
  - the GPS fix in both components;
  - the Sonar option A (access logging);
  - P-9 accepted;
  - captures out of the repo;
  - Phase E skipped (the DB will be reset).
- **No staging environment:** the only deployed environment is production, so the merge deployed before T-14 could measure throughput (kaizen lesson 1).
