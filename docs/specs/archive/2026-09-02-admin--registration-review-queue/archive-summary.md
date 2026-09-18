# Archive Summary — Admin Registration Review Queue

## 1. Document Control

| Field | Value |
|---|---|
| Spec Path | `admin/registration-review-queue` |
| Archive Date | 2026-09-02 |
| Archive Path | `docs/specs/archive/2026-09-02-admin--registration-review-queue/` |
| Branch | `registration-review` (spec branch — constitution sync deferred) |
| Final Status | **Complete** — 16/16 tasks, validation PASS, 0 open code findings |
| Kaizen Entry | `docs/specs/kaizen/admin--registration-review-queue.md` |

## 2. Final Status

The registry's first path from a private self-registration to a public `Actor` record.
Sixteen tasks, each Reviewer-PASSed with evidence recorded before its checkbox flipped.

| Gate | Result |
|---|---|
| Backend | **1003 / 1003**, 75 suites |
| Frontend | **1620 / 1620**, 108 suites |
| `tsc --noEmit` | **0 errors** (was red repo-wide on entry — see A-73) |
| Static export | 27 / 27 pages |
| Lint (backend `npx`, frontend) | clean |

## 3. Requirements Delivered

FR-9 … FR-14 and FR-16, plus NFR-1 … NFR-11. All 23 scenarios audited at **clause**
granularity — every `BUT it must NOT` and `AND IT MUST` limb owned by a named task with
code and automated test evidence. No requirement carries a FAIL.

Five admin endpoints (list · detail · approve · reject · dismiss-duplicate), two screens
(`/admin/registrations`, `/admin/registrations/review?id=`), a duplicate-detection
service, a derived activity trail, and two new audit actions.

## 4. Files Changed Summary

| Area | What changed |
|---|---|
| `backend/src/registrations/**` | The admin service, controller, DTOs, duplicate detection, the frozen rejection-reason list, and three serializers |
| `backend/src/actors/actor-audit.service.ts` | `logRegistrationApprove` / `logRegistrationReject`; the approve row uniquely also sets `acknowledged: true` |
| `backend/prisma/` | `ActorAuditAction` 6 → 8 members, with its migration |
| `frontend/components/admin/` | `RegistrationsTable`, `RegistrationDetailPanel`, `DuplicateWarningCard`, `ActivityTrail`, `ConsentRecordCard`, `RejectDialog`; `AcknowledgeDialog` gained a `tone` prop |
| `frontend/app/(admin)/admin/registrations/` | Queue and detail screens, query-param routed inside `<Suspense>` |
| `frontend/lib/` | Typed admin client, shared status vocabulary, shared duplicate-count label |
| Baseline docs | `docs/trd/trd.md` §2/§4/§8/§12.5 (**ADR-012**)/§13 · `docs/ux-ui/design.md` §2/§4/§5 |

## 5. Test Evidence Summary

No `test-report.md` — **`/akili-test` never ran, and its absence is explicitly accepted
at archive.** Coverage was verified directly during validation instead, at clause
granularity, and the result carries no FAIL.

The strongest work: the DC-23 projection gate, the DC-31 three-candidate dismissal gate,
the DC-32 public-lookup sweep, FR-9's 403-indistinguishability test (byte equality on
`res.text`, not just `res.body`), and NFR-1's **bidirectional** route-totality assertion,
which a sixth route cannot slip past.

**What was never executed, stated rather than left to inference:** the public-submission
→ admin-queue seam. There is e2e coverage on both sides but no test crossing the
handover; it was verified by a field-by-field payload comparison over Leader-authored
fixtures. Two things blocked a genuine local run and are recorded for whoever tries next
— Cognito is deliberately unset in `backend/.env`, and with `MAIL_TRANSPORT=no-op` the
OTP is unrecoverable because `EmailVerification.codeHash` is HMAC-SHA-256 and the
plaintext is never stored or logged.

## 6. Validation Summary

Opened at **1 FAIL · 17 WARN · 1 integration blocker**; closed with **0 open code
findings**.

| Finding | Outcome |
|---|---|
| **FAIL** — `design.md` §7.1 named an analytics-exclusion gate that does not exist, and self-certified as *"verified rather than assumed"* | Closed. The real gates are **stronger** than the one described — a behavioural render assertion, not a source sweep. Correction closure applied in both directions |
| **Blocker** — 10 commits behind `main`, conflicting baselines | Closed. Not an additive conflict: both branches had allocated **ADR-011 to different decisions**. `main` is the trunk and its ADR is deployed and cited from a frozen archived spec, so this spec's became **ADR-012**; 14 citations swept |
| 4 code WARNs (R4–R7) | Closed. R4's compare-and-set was **verified against live MySQL**, not only mocks — the stale-predicate case matches 0 rows, which is what closes the race |
| 10 deferred items (R8–R17) | Closed after the user challenged the scoping — most were one-line |
| 4 repo-health tickets (A-73, A-92, A-93, A-94) | All closed. Two refuted their own ticket's premise |

## 7. Accepted Warnings & Follow-Ups

| Item | Status |
|---|---|
| **No CloudWatch alarm on a dropped approval notification** | Open. Infra work: from the database an operator cannot tell an approved applicant was never notified |
| Chunk-4 contrast trap — `AWAITING_APPLICANT`/`WITHDRAWN` keep an ungated `bg-border text-muted` pairing, unreachable today (D-7) | Open, and a live trap for `admin/registration-info-requests` |
| Remaining §7.2 advisories (`aria-live` mounting, dialog focus restore, the asymmetric MailService override) | Recorded; no defect in shipped behaviour |
| The `A-nn` advisory sequence in `execution.md` has gaps | Recorded before the record froze |
| Seven `Pending Items` in the Kaizen entry | Await the apply phase on the default branch |

## 8. Historical Notes

**Four defects that every green test certified**, found only by running the check rather
than reading it: a MySQL JSON path written PostgreSQL-shaped (`region` for `$.region`) that
would have 500'd on three filters; an ungated 404 whose test a plain `Error` kept green; a
fabricated audit identity (`?? ''` claiming "reviewed by an empty identity"); and a
cross-task null-email drop living between two individually correct constraints (KZ-007).

**The budget tripwire fired and was adjudicated, but its cadence was only half kept.**
Final code LOC was 13,310 against a ~8,200 budget and a ~9,200 halt. `tasks.md` mandates a
re-measure at T-4/T-8/T-12/T-16; `execution.md` records **T-12 and T-16 only**, and the
last was outstanding until a Reviewer flagged it. By the first measurement the halt was
already exceeded — so the tripwire caught the breach late, not early. The estimate is left
in `design.md` §11 and annotated rather than rewritten: an estimate silently corrected
after the fact teaches nothing about estimating.

**A concurrency incident, recorded because the protocol exists for it.** Mid-archive
another session moved this shared checkout `registration-review → main → tracking-tools →
main → reset`. No work was lost, but a subordinate agent caught it — not the Leader — by
checking `reflog` for an anomaly it was not asked to look for, and its verification had
already been measured on the wrong branch (KZ-010).

**The run's most reusable finding is about corrections, not code.** Five remediation
review rounds produced **five FAILs — a 100% rate**. Every fix reviewed contained a defect
in the fix; two were the Leader's own, written while correcting other authors' false
claims. The corollary adopted at the HALT: where a correction can be made by *deleting*
the false text rather than replacing it, deletion is the lower-risk correction.
