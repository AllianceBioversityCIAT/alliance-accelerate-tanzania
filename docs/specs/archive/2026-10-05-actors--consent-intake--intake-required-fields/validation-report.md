# Validation Report — Intake required fields, generated Trader ID, duplicate detection, template v4

**Verdict (re-validated 2026-10-05 after remediation): ARCHIVE-READY.** The 4 FAILs and the actionable WARNs are fixed and reviewed (§13). What remains is accepted or recorded as open items for archive. *Original verdict: NOT YET ARCHIVE-READY, 4 FAIL / 21 WARN.* The code is sound:
- every build, test and lint gate is green;
- 50+ factual claims hold against the code;
- every FR-1 to FR-5 clause has code plus a test that would turn red if the clause broke.

The four FAILs are three documentation contradictions and one missing `aria-live` region. All four are small and can be fixed in one pass.

## 1. Document Control

| Field | Value |
|---|---|
| Spec | `docs/specs/actors/consent-intake/intake-required-fields` (chunk 1 of `actors/consent-intake`) |
| Code range | `1bf27d0..c5530e0` on `feature/atp-84-consent-request-email` |
| Date | 2026-10-05 |
| Method | CLAUDE.md *Validation dispatch*: 3 independent read-only validators (opus) in parallel, one per dimension, each told not to defer to the Leader. The Leader ran the build gates. |
| Implementer / Reviewers | sonnet / opus (author ≠ auditor) |
| `test-report.md` | absent (`/akili-test` was not run). Coverage was verified directly. |

## 2. Summary

| Dimension | Verdict | FAIL | WARN |
|---|---|---|---|
| Build integrity (Leader) | PASS | 0 | 0 |
| 1 · Clause-level coverage | FAIL | 1 | 9 |
| 2 · Decision consistency | FAIL | 2 | 11 (+7 info) |
| 3 · Factual claims vs code | FAIL | 1 | 2 |
| Hard constraints (PII, static export, tokens, AWS, leftovers) | PASS | 0 | 0 |

## 3. Task Completion

All **8/8 tasks are `[x]`**. Each has a Reviewer PASS in `execution.md`, written before its checkbox. T-5 was reopened once (commit `b6e8853`) and closed again with a PASS. **WARN:** T-5's done-when says "all six falsifiers shown red", but falsifier 5's commit form was never executed red (see C-10). On reading it does discriminate.

## 4. File Existence

All files in design §4–§5 exist: `intake-contract.ts`, `trader-id.util.ts`, `intake-duplicate.service.ts`, `DuplicateConfirmDialog.tsx`, `lib/content/intake-required-fields.ts`, the 2 additive migrations, and the regenerated template. No probe, harness, `.only` or `console` leftovers remain. `git diff --name-only` shows nothing under `infra/`.

## 5. Build Integrity (Leader, quiet tree, HEAD `c5530e0`)

| Gate | Result |
|---|---|
| `backend` `npm test -- --silent` | 86 suites / 1,412 tests, exit 0 |
| `backend` `npm run build` · `npx eslint … --quiet` | 0 · 0 |
| `npx prisma migrate status` | up to date |
| `frontend` `npm test -- --silent` | 120 suites / 1,836 tests, exit 0 |
| `frontend` `npx tsc --noEmit` · `npm run lint` · `npm run build` | 0 · 0 · 0 |
| `./infra/scripts/validate.sh` | 0 |

## 6. Requirement Coverage (dimension 1)

| Requirement | Verdict | Note |
|---|---|---|
| FR-1 | PASS on create and import; **WARN** on edit | W-1 (form-side edit untested), W-2 (edit messages exempt only by the Leader's reading, C-11), W-3 (`PATCH {region:null}` → 500) |
| FR-2 | PASS | Real-MySQL concurrency is a declared gap; the Leader's probes are recorded |
| FR-3 | PASS | Low-risk WARN: the trailing-space email is not exercised |
| FR-4 | PASS | — |
| FR-5 | PASS | Includes the reopened T-5 consent-gate fix |
| FR-6 | PASS on its grep | The TRD/PRD content FAILs are under dimensions 2 and 3 |
| NFR-1 | PASS | — |
| NFR-2 | **WARN** | Timed against a mocked DB only (worst case 194.6 ms); no committed timing test |
| NFR-3 | PASS | — |
| NFR-4 | **FAIL** | The per-row confirmation is never announced through `aria-live` (F-4). The dialogs' `aria-live` exists but no test asserts it (W-8). |

## 7. Linting & Code Quality

Lint is clean on both packages. Hard constraints are clean:
- **PII:** candidates and snapshots carry attribute names only; `NEVER_PUBLIC_FIELDS` is untouched.
- **Static export:** nothing that breaks it was added.
- **Tokens:** no `/NN` opacity on a token and no hex. The only `bg-warning/10` is in a test that asserts it is absent.
- **AWS:** nothing touched.

**4R advisory (carried over from execution.md):**
- an unconfirmed held `GRANTED` row in commit mode is untested (W-4);
- the over-cap checkbox test clicks a disabled control (W-5);
- comment density;
- the import "To create" chip contradicts the button count;
- "No rows are eligible … upload again" appears when rows could be ticked instead;
- the acknowledgement dialog fires for unticked held `GRANTED` rows;
- house-wide: the 375 px dialog gutter, `DialogFooter` dropping focus while loading, and no focus restore on close.

## 8. Design Conformance (dimensions 2 and 3)

**FAIL**

| ID | Finding | Fix |
|---|---|---|
| **F-1** (C-1) | `../consent-request-email/proposal.md` O-10, OQ-1 and the MODIFIED line still say "Trader ID stays required on the admin paths". OQ-1 is the only question not struck through. That contradicts D-15, and chunk 2's specify reads this file. | Strike OQ-1 as decided (D-15 to D-18), and amend O-10 and the MODIFIED line. |
| **F-2** (C-2) | PRD AC-5 and US-6 say the import "maps every column in the canonical schema". TRD :67 and :94, from the same commit, say v4 drops Trader ID, GPS altitude/accuracy and registration source. | "maps every column of the v4 import template (`common/template-columns.ts`)". |
| **F-3** (FAIL-1) | TRD :56 credits the live import, "with identity-based duplicate detection", to `ImportModule`. That module is design-only and not registered in `app.module.ts`. The real import is `ActorImportService` in `ActorsModule`. An agent following the TRD would edit the wrong module. | Move the description to the `ActorsModule` row and mark `ImportModule` as design-only. |
| **F-4** (coverage) | NFR-4: the "N actors will be created" line on the import page changes on every tick but is not in a live region, and `ImportPreviewTable` has no `aria-live`. | Wrap it in `role="status" aria-live="polite"` and add a test. |

**WARN** (documentation; one-line amendments)

| ID | Finding |
|---|---|
| C-3 | The TRD §4 rewrite marks the actor writes Admin-only. TRD §8 :241 still says Staff can create/edit, and so do PRD :29 and US-4. Add these to open item 2 (the RBAC product decision). |
| C-4 | TRD :184 reads as if preview does not classify duplicates. It does, in both modes. |
| C-5 / F-3 | The same `ImportModule` issue. |
| C-6, W-facts-2 | Design §12 still says "1 UNVERIFIED (P-14)". P-14 was settled in T-3 (mocked timing). |
| C-7 | §4.5 excludes `failed` rows as match sources for reason S-2, but keeps consent-gate-failed rows as sources. Since the T-5 fix, held rows that fail provenance are `failed` too. State the reason explicitly or pick one rule. |
| C-8 | DD-3 and §4.3 still say "every strong candidate". The amended §3 caps the wire list at 50 and weak at 5+5. |
| C-9 | tasks.md PR strategy and the execution.md Document Control still quote the ~1,800 LOC / ~13 rounds budget. |
| C-10 | T-5 `[x]` versus falsifier 5's commit form never executed red. |
| C-11 | The FR-1 "same messages" clause was narrowed to create/import in tasks and execution only. requirements.md has no amendment. |
| C-12 | ADR-NNN omits DD-5 item 2 (legacy actors re-imported as weak duplicates), and execution.md cites it to §9 instead of DD-5. |
| W-facts-1 | Design §5 says the dialog reuses `lib/content/duplicate-candidates.ts` labels. It defines its own `MATCH_ATTRIBUTE_LABEL`, a copy of `DuplicateWarningCard`'s, so the two can drift. |

**Info:** C-13 to C-20 (ADR-017 citations in chunk 2, statuses in family, requirements and design, NFR-1 wording, §4.7 scope note, budget footnotes). They are listed in the validator output, which the Leader holds.

## 9. Test Evidence Summary

There is no `test-report.md`. Coverage evidence is the Implementer's falsifier reds, each re-run by the Leader (re-run status VERIFIED on every attempt), plus Reviewer reading. Declared gaps (design §9) all hold:
- real-MySQL concurrency, partially substituted by probes;
- the check-then-create race;
- the 50-candidate limit, which is tested;
- the uncompressed-preview size, relying on gzip;
- layout, covered by HITL captures instead of a test.

## 10. Agent Guide / Constitution Impact

No new module boundary was created. `IntakeDuplicateService` lives inside `ActorsModule`. `backend/CLAUDE.md` and `AGENTS.md` are version-agnostic and still accurate; this is a recorded scoped deviation. A CodeGraph re-index is pending at archive. The ADR-NNN number is to be allocated at archive on `main`, then swept in 4 TRD citations plus chunk 2's 5 "ADR-017" mentions.

## 11. Remediation

| Priority | Item | Owner | Size |
|---|---|---|---|
| **Must** | F-1 sibling proposal, F-2 PRD AC-5/US-6, F-3 TRD :56 | docs | ~15 lines |
| **Must** | F-4 `aria-live` on the import create-count line, with a test | frontend | ~10 lines |
| Should | W-3 `PATCH {region:null}` → field 400 (and the other identity fields), with a test | backend | small |
| Should | W-4 spec: unconfirmed held `GRANTED` row in commit stays `possible-duplicate` | backend test | small |
| Should | W-1 form edit-mode required-set test; W-8 `aria-live` / focus tests for both dialogs | frontend tests | small |
| Should | C-4, C-6, C-7, C-8, C-9, C-11, C-12, W-facts-1 doc amendments | docs | one line each |
| Accept or follow-up | C-3 RBAC drift (product decision); NFR-2 real-DB timing; W-5 over-cap test; UX copy items | product owner | — |

## 12. Archive Readiness Recommendation

**Not yet.** Fix the 4 FAILs, which are small. Then either fix or explicitly accept the WARNs, re-run the gates, and archive with:

```text
/akili-archive actors/consent-intake/intake-required-fields
```

## 13. Remediation outcome (2026-10-05)

| Unit | Content | Outcome |
|---|---|---|
| R-1 code + tests | F-4 `aria-live` on the import create-count; W-3 `PATCH` identity-field `null` → 400 (`missingIdentityFields`); W-4 unconfirmed held `GRANTED` commit spec; W-1 edit-mode form test; W-8 dialog `aria-live` and focus tests; fixture rename | **PASS**, first attempt |
| R-2 docs | F-1 sibling proposal; F-2 PRD AC-5/US-6; F-3 TRD `ImportModule` → `ActorsModule`; C-4, C-6, C-7, C-8, C-9, C-11, C-12, W-facts-1, C-14; **RBAC rulings** (product owner, 2026-10-05): only **Admin** creates, edits, imports and views actor PII. Applied to PRD persona row, Goals row, US-4, US-5, US-7 and AC-6, and to TRD §4, §5, §8, the C4 box and QA-3. Cancelled export marked not live. | **HALT after 3 attempts.** The last open item, a "§203" line-number citation, was fixed **Leader-inline with product-owner approval**. An independent Reviewer then gave **PASS**, and a byte diff shows only those two lines changed. |

**Gates after remediation** (Leader, quiet tree):
- backend: 1,416 tests, exit 0; build and eslint clean;
- frontend: 1,842 tests, exit 0; tsc, lint and build clean;
- FR-6 grep: 0.

**Accepted or open for archive:**
- ADR-NNN number allocation: 4 TRD citations, plus chunk 2's "ADR-017" mentions.
- NFR-2 measured against a mocked DB only.
- The over-cap checkbox test cannot discriminate (the real gates are tested).
- Falsifier 5's commit form was never run red (it discriminates on reading).
- UX copy: the "To create" chip; "No rows are eligible"; the acknowledgement dialog for unticked held `GRANTED` rows.
- House-wide dialog items: gutter, focus while loading, focus restore.
- TRD §8 "Enforcement" shows a lowercase `@Roles('admin')`.
- The `app.module.ts` docblock still says "Import module arrives in T-8".
- The `NFR-1` spec still lists the identity fields by hand.

Archive with:

```text
/akili-archive actors/consent-intake/intake-required-fields
```
