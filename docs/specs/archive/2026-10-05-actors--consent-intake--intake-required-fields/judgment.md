# Judgment Day — `design.md` (intake-required-fields)

| Field | Value |
|---|---|
| Target | `design.md` (draft of 2026-10-02) against `requirements.md`, `proposal.md`, `../family.md` and `../consent-request-email/proposal.md` |
| Code baseline | `609a752` |
| Mode | judgment_day, design review (`/akili-specify` Step 2.5) |
| Judges | A and B, blind, read-only, model `sonnet` (the author is `opus`) |
| Rounds | 2 of 2 used |
| State | **approved** (terminal) |

## Verdicts

- **Judge A:** FAIL, 3 severe. Premise rows: 15 confirmed, 2 contradicted, 1 not re-run.
- **Judge B:** FAIL, 6 severe. Premise rows: 15 confirmed, 2 contradicted, 1 not re-run.

## Frozen ledger

**Confirmed severe** — both judges rated it severe. These are eligible for auto-fix.

| ID | Finding | A | B |
|---|---|---|---|
| C-1 | The §12 count line says 17 rows, 15 verified. The table holds **18 rows, 16 verified**. | F-1 | F1 |
| C-2 | P-15's counts do not reproduce. Re-running the same grep gives **10** files for `skipped-exists` and **8** for `skipped-duplicate-in-file`, not 9 and 7. The missed file is `partner-profile-onboarding-import.e2e.spec.ts`. The Leader re-ran it and confirmed 10 and 8. | F-2 | F3 |
| C-3 | P-17 is settleable now and is **false**: the e2e harness is "AppModule + in-memory Prisma mock override" (`backend/CLAUDE.md` *Testing conventions*; `admin-actors-crud.e2e.spec.ts` `describe('… in-memory Prisma')`). FR-2's concurrency scenario must be declared a gap now. | F-3 | F2 |

**Suspect** — both judges found it, but they disagree on severity. Not auto-fixed.

| ID | Finding | A | B |
|---|---|---|---|
| S-1 | **Import has no Trader ID collision recovery.** IDs are allocated once before the chunk loop. A `P2002` inside a chunk transaction rolls back the whole chunk (up to 100 rows), and the §4.2 retry cannot nest inside it. This conflicts with §4.5's "the per-chunk transaction is unchanged" and with FR-2's guarantee for import. | warning (F-6) | severe (F6) |
| S-2 | **In-file matching scope is contradictory.** §4.5 says "`check` for every *valid* row" and also "a `failed` row still counts as an earlier row". A failed row can never be created, so a later row flagged against it asks for a confirmation with no real duplicate behind it. | warning (F-7) | severe (F4) and warning (F8) |
| S-3 | §5 says `ImportPreviewTable` splits at `lg`. **It splits at `md`** (`hidden md:block` / `md:hidden`). This claim about existing code has no ledger row. The Leader re-ran it and confirmed the finding; it is a KZ-008 instance (written from memory). | — | severe (F5) |

**Info** — warnings and suggestions, not auto-fixed.

| ID | Finding | Source |
|---|---|---|
| I-1 | §4.3 module wiring contradicts itself: intake reuses the pure functions, so the class is not needed by DI, and the rationale should be "not exported", not "cycle". | A F-4 |
| I-2 | §4.6 overstates the Lists re-lettering. Only Consent Method's letter shifts, and no test pins it. | A F-5, B F15 |
| I-3 | FR-6 lacks a design subsection. `backend/AGENTS.md` is not named, the stale TRD QA-9 outcome shape is not named, and the baseline task is not flagged for mandatory Reviewer dispatch. | B F7 |
| I-4 | The merge point for the allocated Trader ID is unnamed once `traderId` leaves `SCALAR_FIELDS`. | B F9 |
| I-5 | The PATCH merged-state check does not cover `crops`, which is a relation: undefined means keep the existing crops, and `[]` must be rejected. | B F10 |
| I-6 | The fields that survive in `ImportReportTotals` are unstated. | B F11 |
| I-7 | The NFR-1 metadata-test mechanism has no ledger row. It is feasible (`getMetadataStorage().getTargetValidationMetadatas`, inherited classes included) but unprecedented in this repo. | A F-8, B F12 |
| I-8 | The sibling proposal's chunk table still says Lite. | B F13 |
| I-9 | The generator path is cited without a directory: it is `backend/scripts/generate-import-template.ts`. | B F14 |
| I-10 | The FR-1 "Other crops alone" falsifier is not named in §10. | B F16 |
| I-11 | `ImportPreviewTable` already uses an inert `bg-warning/10`. The new warning line must use `bg-surface-alt text-warning`. | A F-9 |
| I-12 | P-9's track record covers the single increment, not the range variant. | A F-10 |

**Confirmed sound by B:** DD-3, DD-4, the merged-state approach (precedent: `isConsentProvenanceSatisfied(before, dto)` in `update`), the audit column, the `ActorSequence` range arithmetic, and the 409 body reaching the client once `ApiError.body` exists.

## Round 1 — correction and scoped re-judgment

- **Correction:** the product owner chose *Fix and Re-judge*. The fix produced `design.md` r1, resolving C-1 to C-3, S-1 to S-3 and I-1 to I-12.
- **Re-judgment:** both judges marked all 18 IDs resolved.
  - Judge A: PASS, with N-1 (warning) and N-2 (suggestion).
  - Judge B: FAIL, with N-1 (severe).
- **N-1:** the import retry-exhaustion behavior contradicted itself, saying "500" in §4.2 and "chunk-local" in §4.5 and §9. It was caused by the S-1 fix. The judges disagreed on severity, so it was escalated, and the product owner chose round 2.

## Round 2 — final correction and verification

- **Correction:** `design.md` r2 resolves N-1 with one behavior. Create exhausts to a 500; an import chunk exhausts to only its own rows `failed`, and later chunks still run. Exhaustion test specs were added. It also adds P-24, which resolves N-2.
- **Final verification:** both judges PASS, and both resolved N-1 and N-2.
  - Each independently re-verified P-23 against `commit()`: the bare `catch` never rethrows and the chunk loop continues.
  - Each confirmed the count line, 24 rows with 23 verified.
- **Info (both judges):** the §4.2 bullets interleaved two topics under identical labels. This was cosmetic, and it was restructured into a table after verification with no content change.

JUDGMENT: APPROVED ✅
