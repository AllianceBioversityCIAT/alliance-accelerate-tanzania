# Kaizen Entry — actors/consent-intake/consent-request-email

## Document Control

| Field | Value |
|---|---|
| Spec Path | `actors/consent-intake/consent-request-email` |
| Archive | `docs/specs/archive/2026-10-07-actors--consent-intake--consent-request-email/` |
| Date | 2026-10-07 |
| Branch | `docs/atp-84-consent-t14-archive` is a **spec branch**. This was resolved by fact against the `Default Branch: main` pin; there is no `Integration Branch:` pin. Every shared-file edit below was a pending item for the apply phase on **`main`**; it was applied there on 2026-10-07 (kaizen apply pass). |
| Archive Run | 1 |
| Approval Mode | gated, then a standing product-owner authorization (2026-10-06: "continue without stopping; stop only for a decision") |

## Metrics

| Signal | Value | Source |
|---|---|---|
| Tasks executed | 14, plus remediation rounds R-A…R-I | tasks.md, execution.md |
| Reviewer FAIL rework attempts | **16**. In T-1…T-13: 8 (T-3, T-4, T-5 ×2, T-9, T-11, T-12, T-13). In remediation and close-out: 8 (R-A, R-C, R-D, R-F ×2, R-G, T-14, R-I) | execution.md |
| HALTs / FATAL_FAILs | 0 / 0 | execution.md |
| Pivots | 0. Five execute-time product decisions (D-24, D-25, D-26, the FR-15 amendment, P-9 acceptance), none of them a design pivot | execution.md, requirements.md |
| PRODUCT_BUGs | n/a (no `/akili-test` run) | — |
| Judgment-day severe findings | Round 1: 3 confirmed and 6 single-judge. Round 2: 1 (RB-2). APPROVED | judgment.md |
| Validation FAIL / WARN | First pass: 2 unimplemented clauses, 3 factual and 7 consistency FAILs. Re-validation: 1 BLOCKING. Final: 1 BLOCKING (stale report). Each was fixed before archive | validation-report.md |
| Post-merge static analysis | SonarCloud on PR #88: 62 issues; gate red on security (S6258, then S6252) and reliability (S2871). Fixed in R-G and R-H | execution.md R-G, R-H |
| Escapes past review into manual testing | 2. A failed send showed only "Failed: 1", with no actor or reason (R-F). The Retry advice in R-F attempt 1 was wrong, caught by the Reviewer | execution.md R-F |
| Budget | 48 review verdicts and ~18,500 LOC, against ~20 / ~11,300 planned. The post-R-C overrun was not escalated | design.md §10 |
| Tasks closed under `REVIEW_WAIVED` / `REVIEW_SKIPPED` | 0 / 0 | execution.md |

**Headline (Gemba):**
- The code held up: final validation found no code defect across about 105 claims, and live T-14 passed.
- The waste was in **sequencing and Leader-authored text**:
  - a "do not ship" gate ran after the ship;
  - SonarCloud rules were met only at PR time;
  - status labels (PASS, a checkbox) were written before the verdict that justified them, three times.

## Lessons

- **KZ-actors--consent-intake--consent-request-email-1 — A live gate whose failure action is "do not ship" cannot run after the merge when the merge deploys to the only environment.** (Product + Methodology, Medium)
  - **Root cause.** T-14's decision rule was "below 1.1 sends/s, escalate to A2 rather than ship". It was written against a "DEV" environment that `docs/infrastructure.md` §1 says does not exist: `IBD-DEV` is production, and a merge to `main` deploys there automatically (OQ-INFRA-8). The feature was live before throughput could be measured. The measurement came in at 0.72/s, the gate could only be waived after the fact, and the waiver needed dated amendments across design, requirements and tasks (T-14 audit FAIL #1; R-I).
  - **Evidence:**
    - tasks.md T-14 step 1 and its done-when;
    - `execution.md` T-14, step 1 and the Reviewer's attempt-1 FAIL;
    - `docs/infrastructure.md` §1.
  - **Standardization:** P1 (local template), P2 (upstream).

- **KZ-actors--consent-intake--consent-request-email-2 — New S3 buckets went into the template without the access logging and versioning that the SonarCloud gate enforces.** (Product, Medium)
  - **Root cause.** Nothing in the project's IaC conventions says that a bucket declares server access logging and versioning. The rules surfaced only when SonarCloud analysed the PR: S6258 failed the security gate for the documents bucket, and after R-G added a log bucket, S6252 failed it again for that bucket. That cost two extra review rounds (R-G, R-H) after the PR was open. PR #87, the previous ATP-84 child, also needed a post-PR Sonar fix commit (`a66da8d`), so this is a recurring pre-PR blind spot.
  - **Evidence:**
    - `execution.md` R-G (trigger: gate security C) and R-H (trigger: S6252);
    - PR #88 comment 6029234384.
  - **Standardization:** P3.

## Noted, not a lesson

- **Recurrence of KZ-008** (an assertion about an artefact that the artefact does not bear). Status labels were written before the evidence that justified them:
  - R-D's heading said PASS before the re-check returned (self-reported in R-D's process note);
  - R-I's heading did the same (the Reviewer's advisory 1);
  - the T-14 checkbox was flipped before the evidence audit, then reverted by the Leader;
  - the R-C brief said "36 verdicts", but the record shows 35.

  → P4 (`digest-update`).
- **Recurrence of KZ-011** (Leader-authored claims not checked against reality). The local test guide given to the product owner had false steps:
  - A1: "create an actor without email" — but email is required;
  - A5: "type `EMAIL_LINK` in the import template" — but the template offers no such value;
  - "mail is no-op locally" — but her `.env` uses the real microservice.

  T-14 itself was written for a "DEV" environment that does not exist. → P5 (`digest-update`).
- **Concurrency.** An Implementer ran `git stash` / `git stash pop` in the shared checkout while a second Implementer was editing `frontend/` (R-G). The pop restored the tree, and the Leader re-verified it with full gates. This is sub-threshold and related to KZ-010 and KZ-auth--forgot-password-delivery-1. Parallel Implementers in one checkout should be told explicitly: no `git stash`.
- An Implementer reported a backend `npm test` hang, which did not reproduce once its own DB probe had exited (R-D).
- Validation remediation took more review rounds (R-A…R-I) than any single task. Most were doc-consistency findings, and the KZ-004 sweep discipline kept each one closing.

## Pending Items

### P1

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `docs/specs/general-setup/task.md` (live/HITL verification task guidance) |
| Edit | **A live check whose failure action is "do not ship" must run before the merge that deploys.** Here a merge to `main` deploys to production, the only environment (`docs/infrastructure.md` §1). If the check can only run on the deployed stack, write its failure action as a post-ship decision (rollback, flag-off, or an accepted risk), not "escalate rather than ship" (KZ-actors--consent-intake--consent-request-email-1). |
| Severity | Medium |
| Status | applied (2026-10-07), lightly reworded in `task.md` ("A merge to `main`…", "never" for "not"); same meaning |

### P2

| Field | Value |
|---|---|
| Kind | upstream |
| Target | methodology |
| Edit | `/akili-specify` task decomposition, live/HITL verification tasks: "If a live verification task's failure action is 'do not ship', schedule it before the merge, or confirm a non-production deploy target exists. When the default-branch merge deploys to production, rewrite the failure action as a post-ship decision. Otherwise the gate becomes a retroactive waiver." |
| Severity | Medium |
| Status | upstreamed (2026-10-07, `docs/specs/kaizen/upstream-2026-10-07.md`) |

### P3

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `docs/infrastructure.md` §2 (Network/security, S3 conventions) |
| Edit | **Every S3 bucket declares server access logging (to a dedicated private log bucket) and versioning, the log bucket included.** SonarCloud gates PRs on both (S6258, S6252). A bucket without them turns the PR's security rating red after it is opened (KZ-actors--consent-intake--consent-request-email-2). |
| Severity | Medium |
| Status | applied (2026-10-07) — placed in `docs/infrastructure.md` §5 (Infrastructure Rules) as rule 7, the durable rules list, rather than §2 |

### P4

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | KZ-008 |
| Edit | Add source `actors/consent-intake/consent-request-email`, recurrence ×10. **Status labels are assertions too:** a "PASS" heading or a `[x]` written before the Reviewer's verdict happened three times in one run (R-D, R-I, T-14). Write the verdict line only after it is returned, then flip the checkbox. |
| Severity | High |
| Status | applied (2026-10-07) |

### P5

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | KZ-011 |
| Edit | Add source `actors/consent-intake/consent-request-email`, recurrence ×6. Leader-authored **manual test guides** are spec text too: three steps given to the product owner were false against the code and her `.env`, and T-14 targeted a "DEV" environment `infrastructure.md` says does not exist. **Check each manual step against the code and the environment contract before handing it over.** |
| Severity | High |
| Status | applied (2026-10-07) |

### P6

| Field | Value |
|---|---|
| Kind | trd-adr |
| Target | `docs/trd/trd.md` |
| Edit | Replace the `ADR-NNN` placeholder in the ADR index (the "token-bearer consent link" decision: persist-then-dispatch, the actor-originated route to `GRANTED`, `EMAIL_LINK` never admin-assertable, the private document bucket) with the next free number. It is new, not superseding: it amends ADR-013 in part, as its row states. Replace all 5 `ADR-NNN` citations in the TRD with that number. **Before allocating, run `git log --oneline --all -20 -- docs/trd/trd.md` and read the newest unmerged branch's highest ADR** (root `CLAUDE.md` concurrency corollary). Candidate: ADR-018. On 2026-10-07 no ref carried an allocated ADR-018. |
| Severity | Medium |
| Status | applied (2026-10-07) — allocated **ADR-018**; all 5 citations replaced |

### P7

| Field | Value |
|---|---|
| Kind | factual-sweep |
| Target | root `CLAUDE.md` and `AGENTS.md` (verification table, custom-email-sender row) |
| Edit | "59 tests" → "61 tests". Measured 2026-10-07 with `cd infra/10-data-auth/functions/custom-email-sender && npm test`: `Tests: 61 passed, 61 total`. Update both mirrors in lockstep. Not caused by this spec, but the claim is false today. |
| Severity | Low |
| Status | applied (2026-10-07) |
