# Validation Report — Consent request by email for team-managed actors

> **Re-validation (2026-10-06, after R-A…R-D, `73f7d46`): no FAIL remains. Archive is blocked by T-14 only.**
> - Every FAIL below is closed: R-A (code), R-B (tests), R-C and R-D (documents, the IAM fallback, a resume test, and a real-MySQL NFR-5 probe).
> - The three parallel validators re-ran: coverage PASS; consistency and facts FAIL on one blocking contradiction (FR-10) and the `ListBucket` condition. Both were fixed in R-D, which passed review. Details are in `execution.md` § "Re-validation after R-C" and § R-D.
> - Gates at `73f7d46`: backend 1752 tests; frontend 2016 tests; lint, build, `validate.sh` and the infra script tests green.
> - **Open:** T-14, the live run on DEV, which needs the product owner: deploy-role S3 permissions, migrations, and steps 1–5, including the live 422 on a never-uploaded document. One advisory is also open: the `SendConsentPrompt` error copy when dispatch sets an error.
>
> The original report follows unchanged as the record of the first validation.

---

> **Verdict: NOT ARCHIVE-READY.** The code is sound and every gate is green. What blocks archive:
> - **2 behaviours not implemented**: the FR-3 send confirmation, and FR-15's `SIGNED_FORM` wording.
> - **1 new display defect**: the consent preview labels a southern latitude "° N".
> - **9 document inconsistencies**, left behind by execute-time amendments.
> - **T-14 (live verification on DEV) not run**.
>
> Remediation is small: 6 code or test items and one documentation sweep. T-14 still needs the product owner for the deploy.

## 1. Document Control

| Field | Value |
|---|---|
| Spec | `actors/consent-intake/consent-request-email` (chunk 2 of `actors/consent-intake`) |
| Commit validated | `ef67afc` on `feature/atp-84-consent-request-flow` |
| Date | 2026-10-06 |
| Method | Root `CLAUDE.md` § Validation dispatch: the Leader ran build integrity, then three independent validators ran in parallel (`opus`, read-only), each told not to defer to the Leader's framing. |
| Validator dimensions | A: clause-level coverage (152 clauses) · B: mutual consistency of decisions and documents · C: factual claims checked against code (~115 claims) |
| test-report.md | None (`/akili-test` was not run). Coverage evidence comes from the validators' own reading of code and tests. |

## 2. Summary

| Area | Result | Detail |
|---|---|---|
| Tasks | **WARN** | 13/14 `[x]`, each with its PASS record in the same commit as the flip. T-14 is `[ ]`; it is the live check and needs a deploy. |
| Files | PASS | Every design file exists. The §3 tree is stale for 5 later-added files (see §8). |
| Build | **PASS** | All packages green (§5). |
| Requirement coverage | **FAIL** | 137 covered · 9 partial · **2 unimplemented** · 4 deferred to T-14 |
| Design conformance | **FAIL** | Load-bearing behaviour matches. **3 factual FAILs** and **7 consistency FAILs**, all in documents except one display defect. |
| Constitution impact | WARN | `.agents/tester.md` QA-2 is still false for `/consent/view`. The template comment contradicts the IAM below it. |

## 3. Task Completion

| Task | Status | Evidence |
|---|---|---|
| T-1 … T-13 | PASS | `execution.md` holds attempts, falsifiers, the Leader's non-author re-run and the Reviewer verdicts. Validator B matched each `[x]` flip to its PASS lines in the same commit. |
| T-14 Live verification | **WARN, not run** | It needs a merge or deploy to DEV with the product owner present: broker throughput (P-9), live IAM and bucket, one real accept, and capture review. |

Records drifted (Validator B, W-2): the T-3, 4, 5, 9, 11, 12 and 13 entries in `execution.md` keep their "— in progress" headers above later PASS sections.

## 4. File Existence

All files named in `design.md` §3 exist. Not listed in §3:
- `actors/admin-actor-where.util.ts`
- `consent-requests/consent-evidence.service.ts`
- the split storage adapters `s3-document-storage.ts`, `unconfigured-document-storage.ts` and `document-storage.factory.ts`
- `components/admin/SendConsentAction.tsx`
- `components/admin/ConsentSelectionStrip.tsx`
- `components/consent/ConsentRichText.tsx`

**WARN:** §3 should be refreshed.

## 5. Build Integrity (run by the Leader on a quiet tree, `ef67afc`)

| Package | Command | Result |
|---|---|---|
| backend | `npm test -- --silent --forceExit` | 102 suites / 1743 tests passed |
| backend | `npx eslint "{src,test}/**/*.ts" --quiet` · `npm run build` · `npx tsc --noEmit` | clean · OK · clean |
| frontend | `npm test -- --silent` | 130 suites / 1997 tests passed |
| frontend | `npm run lint` · `npx tsc --noEmit` · `npm run build` | 0 errors · clean · OK |
| infra | `AWS_PROFILE=IBD-DEV ./infra/scripts/validate.sh` | 3 stacks PASS |
| infra | `./infra/scripts/tests/run-tests.sh` | all cases passed |
| custom-email-sender | `npm test` | 61 passed |

Known noise: the backend Jest run reports "did not exit one second after the test run" (an open handle that predates this spec), and the registrations 429 test flaked transiently 3 times during execution. Neither occurred in this run.

## 6. Requirement Coverage (Validator A: 152 clauses enumerated from `requirements.md` alone)

**The coverage table in `tasks.md` claimed full ownership. That was false for C-17 and C-111** (KZ-001 recurrence: closure cannot be self-certified).

| Class | Count | Clauses |
|---|---|---|
| COVERED | 137 | Includes all of FR-11's six cases on both endpoints, FR-1 "old request keeps its text" end to end, D-24, D-25 and D-26, RB-2, and frozen link evidence |
| **UNIMPLEMENTED** | **2** | **C-17** FR-3 "Choosing Send sends one request **and confirms it**": the prompt navigates without any confirmation. **C-111** FR-15 "recorded as **`SIGNED_FORM`** evidence": `ConsentDocument` has no method or kind, and no mapping exists. |
| PARTIAL | 9 | See the table below |
| DEFERRED-LIVE | 4 | C-120 (FR-16 link expiry), C-140 (NFR-6 throughput, P-9), C-146 (NFR-8 live IAM), C-151 (NFR-10 captures and their review) |

| Partial clause | Gap |
|---|---|
| C-34 FR-4 "BUT none … sent twice" | Retry requeues `FAILED/stale_claim` rows, whose email may already have gone. This is design R-10 (accepted), but FR-4's wording is absolute. No interrupted-run test exists. |
| C-36 FR-5 "MUST offer" | A failed preview silently hides the import offer. Untested. |
| C-47 FR-7 "the actor's email at the time of sending" | The claim-time email check exists, but only the `GRANTED` branch is tested. |
| C-55 FR-8 "30 days" | `CONSENT_LINK_VALIDITY_MS` is never asserted. |
| C-59 FR-8 "not derivable" | Tests pin 32 bytes and sha256 only. A deterministic token would pass. |
| C-73 FR-10 Decline "does the same" | No test pins the Decline audit row or its IP, user agent and `respondedAt`. |
| C-116 FR-15 "storage enforces" | Covered by presign pins only. T-14 has no direct oversized or wrong-type POST probe. |
| C-143 NFR-8 "can only put and get" | Drift: the template also grants `DeleteObject` on `incoming/*` and a conditioned `ListBucket` (design §7.4). The requirement text was never amended. |
| C-150 NFR-10 post-create prompt | No jest-axe or focus test. Focus drops to `<body>` while sending (T-10 advisory). |

## 7. Linting & Code Quality

The lint, `tsc` and `react-doctor` gates are clean (0 errors).

**4R advisory findings carried from `execution.md` (not gating):**
- the `EMAIL_LINK` single-writer sweep cannot see indirection;
- `expectedUpdatedAt: null` gives a spurious `409`;
- a crops-only PATCH does not bump `updatedAt`;
- the `timeout` classification uses an `err.name` regex;
- `retry` does not clear `failureReason`;
- complexity warnings on `SendConsentDialog`, `ConsentQueueBanner`, `ConsentDocumentField` and `ConsentEvidencePanel`;
- the T-8 gate copy says "end of the policy";
- the history panel does not refresh after an immediate upload;
- `consent-evidence` is fetched twice per edit page;
- InnoDB contention is covered only by probes (NFR-5 declared gap).

## 8. Design Conformance

**Verified true at HEAD (Validator C):**
- the data model and additive migration;
- eligibility and the pending set;
- the dispatch claim, compare-and-set, 7.5 s budget and stale sweep;
- the token;
- lock-first ordering at enqueue, admin update and respond;
- the as-if-granted projection and the uniform miss;
- the four supersession hooks;
- rules 1–4 and D-26;
- the §5.8 owners;
- all 13 routes;
- the mail subject and link;
- the bucket properties;
- the frontend method lists.

**Every code figure matches the documents** (Validator B): 7.5 s, 2 min, 30 days, 20/60 s per route, 32 KB, 10 MB, 300 s, 1,000 ids, 3 s + 0.2 s, 11.5 s/12 s, and nine mail kinds.

### FAIL

| # | Finding | Location → source |
|---|---|---|
| V-1 | **The consent preview labels a southern latitude "° N"**, e.g. `-3.38° N`. This is new code in this spec, copying the defect already on the public profile. The preview must show exactly what accepting publishes, and the profile shows the same wrong label. | `components/consent/ConsentRecordPreview.tsx` `formatGps`. The same pattern is in `components/profile/ProfileLocation.tsx` (pre-existing). |
| V-2 | §2 diagram: the document confirm order is the old one (delete before STORED). | `design.md` §2 → §5.6 amended; `consent-documents.service.ts` |
| V-3 | `tasks.md` T-7 scope: the old confirm order and a single IAM statement. | `tasks.md` T-7 → §5.6 / §7.4; the template |
| V-4 | §7.4 says "`Policies` gains one statement"; there are three. | `design.md` §7.4 → `infra/20-backend/template.yaml` |
| V-5 | A template comment says "No ListBucket" directly above the `ListBucket` grant. | `infra/20-backend/template.yaml` |
| V-6 | `tasks.md` T-5 scope still says "actor re-read". The code does lock-first and builds `before` from the locked row; the service header docblock has the same stale wording. | `tasks.md` T-5; `consent-public.service.ts` header → §5.4 amended |
| V-7 | The budget figures disagree. design §1, the §10 table, the `tasks.md` header and execution's Document Control still say ~11,300 LOC / ~20 rounds. Three re-baselines exist (~30 rounds; ~16,000 LOC / ~40; ~17,700 / ~31), and the third never reached `design.md`. Measured actuals: **~17,100 LOC, 32 verdicts**. | design §1/§10, `tasks.md`, `execution.md` |
| V-8 | `.agents/tester.md` QA-2: "and that `gps` is `null` for them" sits next to the `/consent/view` exception, where GPS is shown. This breaks FR-17's "no constitutional sentence left false". | `.agents/tester.md` |
| V-9 | design §4.2 says the document `id` is a cuid; the code uses `randomUUID()`. design §5.2 step order says the token is minted after the claim; the code mints it inside the claim compare-and-set. | `consent-documents.service.ts`, `consent-requests.service.ts` `claimAndSendOne` |

### WARN

- **DD-9 and §4.3** say "rules 1–3"; §5.7 now has rule 4 (D-24). This regresses judgment-day FB-5.
- **D-25 wording.** "Two simultaneous sends create one request" holds for `bulk`. For `single`, the second send supersedes the first by design (resend semantics).
- **"Single-use token"** appears in design R-1, `backend/CLAUDE.md`, the TRD ADR-NNN row and `tester.md`. `view` does not consume the token; only `respond` does.
- **§7.3 / UX `loading`** says "Skeleton"; the page renders a text status line.
- **R-4's escalation threshold** says ~1 send/s, while P-9 and T-14 say 1.1 sends/s.
- **requirements.md:**
  - OQ-7 still says "Confirm D-20…D-23".
  - "D-1…D-14 from proposal §1" is not quite right: D-10 to D-12 come from the proposal's OQ table, and D-11 is superseded.
  - The §3 "Today" rows are now historical and need an "as of `342390a`" note.
- **The Premise Ledger** has rows that no longer reproduce by design: P-2, P-3, P-17, P-20, P-24, P-30, plus P-6's lines and P-13's location. It needs a "verified at `342390a`; superseded by this spec" note.
- **`execution.md` Document Control** still states gated mode; the 2026-10-06 standing authorization replaced it.
- **The FR-3 / design §7.3 disagreement on confirmation** is the root of C-17.

## 9. Test Evidence Summary

- **Falsifiers:** every task records them executed red and reverted, plus the Leader's non-author re-run.
- **Live probes:**
  - D-25 lock, A/B against local MySQL 8: 1 row with the lock, 2 rows without (5/5 runs).
  - Raw `$queryRaw` types: `Date` and `string`.
- **Captures:** T-8 to T-11 headless captures at 375 and 1440 (and 768 for some states), with no horizontal overflow. **They live in the session scratchpad, not the repo** (C-151).
- **Declared gaps:**
  - real-MySQL row contention (NFR-5);
  - live IAM and bucket behaviour, including whether S3 applies the prefix-conditioned `ListBucket` to `HeadObject` (A-1, which Validator C rates likely to fail);
  - broker throughput (P-9).

  All three are owned by T-14.

## 10. Agent Guide / Constitution Impact

- `CLAUDE.md`, `AGENTS.md`, `backend/CLAUDE.md`, `backend/AGENTS.md` and the four personas were updated in T-13 and are in lockstep. The exception is `.agents/tester.md` QA-2 (V-8).
- **Pending for `/akili-archive`:**
  - allocate ADR-018 on `main`: replace all 5 `ADR-NNN` occurrences in the TRD, and re-run the unmerged-branch check first;
  - re-index CodeGraph if this checkout has one.
- A new module (`src/consent-requests/`) is documented in `backend/CLAUDE.md`. No child guide is required.

## 11. Remediation

| # | Item | Type | Owner suggestion |
|---|---|---|---|
| R-1 | **C-17: FR-3 confirmation.** Either show a short "Request sent to <email>" state before navigating (with a test), or amend FR-3 to match design §7.3 ("navigates"). | Code or decision | **Product owner decides** |
| R-2 | **C-111: FR-15 `SIGNED_FORM`.** Recommended: amend FR-15 so the stored `ConsentDocument` row itself is the out-of-band evidence, with no method field. The alternative is to add a kind field and show it. | Decision (recommend amend) | Product owner |
| R-3 | **V-1: GPS hemisphere** in `ConsentRecordPreview`, plus the identical pre-existing defect in `ProfileLocation`: render S and W for negative values, with tests. | Code | Implementer (profile fix is out of scope; the product owner decides whether to include it) |
| R-4 | Test gaps: C-36 (keep the import offer when preview fails), C-47, C-55, C-59, C-73, C-150 (axe and focus for the prompt). | Code and tests | Implementer |
| R-5 | Documentation consistency sweep: V-2 … V-9, all WARNs in §8, the C-143 NFR-8 wording, C-34 FR-4 wording (stale-claim retry is an explicit admin act, R-10), the §3 tree, and the `execution.md` headers and Document Control. | Docs | Implementer (docs) plus Reviewer, since it touches baselines |
| R-6 | T-14 additions: C-116 (direct oversized and wrong-type POST probes) and C-151 (commit or paste the captures; add 768 px for T-10; capture T-8's field-error and decline-confirm states). | Task scope | Leader edit to T-14 |
| R-7 | **T-14 itself.** Before merging, verify the deploy role's S3 permissions. Then the live checks with the product owner. | Live | Product owner plus Leader |

## 12. Archive Readiness Recommendation

**Not ready.** Archive becomes possible after:
1. R-1 and R-2 are decided and applied;
2. R-3 to R-6 are fixed, with Reviewer PASSes;
3. T-14 is run, or explicitly deferred by the product owner with its risks recorded (P-9, A-1, live IAM);
4. a re-validation confirms no FAIL remains.

Then run `/akili-archive actors/consent-intake/consent-request-email`.
