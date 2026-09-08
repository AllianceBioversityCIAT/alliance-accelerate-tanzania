# Execution Log — Map Coordinate Picker

## Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/enhancement/map-coordinate-picker/` |
| Approval Mode | `gated` (from `proposal.md` Document Control) — the Leader pauses at every continue gate |
| Budget (tripwire) | **7 tasks · 635 LOC · 9 review rounds** (`design.md` §11). Exceeding any of the three stops the run and escalates |
| Leader | Opus 5 (T1) |
| Implementer | `akili-implementer` wrapper → **sonnet** (T2) |
| Reviewer | `akili-reviewer` wrapper → **opus** (T3), read-only. `author ≠ auditor` enforced by wrapper config |
| Design review | `judgment.md` — **APPROVED** (2 fix rounds, 1 scoped re-judgment, 13 findings) |
| Run started | 2026-09-08 |

### Pre-flight (execution start)

| Check | Result |
|---|---|
| KZ-010 concurrency — unmerged commits on `RegistrationForm.tsx`, `ActorForm.tsx`, `components/map/`, `lib/geo/` across all 7 other local branches | **clear, 0 commits** |
| Open PRs | **none** |
| Working tree | clean apart from this untracked spec folder |

> Re-run of the M-5 reading taken at specify time. M-5 was a reading of that moment; this is a reading of this one.

### Leader decision — T-1 and T-2 run sequentially, not in parallel

Both are eligible at start (`deps: none`) and touch disjoint files, so the command's Step 1.4 would permit two concurrent Implementers. **Declined.** Both tasks' verification runs Jest and/or `next build`, and root `CLAUDE.md` § Concurrency protocol is explicit that these are not read-only — they compete for `node_modules`, `.next/`, and lockfiles, and a measurement taken beside another worker is *wrong*, not merely slow. The parallelism would buy one task's latency and risk two corrupted verifications.

Recorded because this session already violated that rule once: the round-1 Judgment Day judge briefs omitted a measurement prohibition and two `npm run build` runs executed concurrently (see `judgment.md` → Process note). The round-2 briefs forbade it. This is the same lesson applied a third time, pre-emptively.

## Task Execution History

### T-1 — Coordinate seam · attempt 1 · Reviewer **FAIL**

**Date:** 2026-09-08 · **Implementer:** sonnet, effort `high`, skill `tdd` (Leader-assigned: pure logic with exact expected values in the requirements scenarios — the case where red→green earns its cost) · **Reviewer:** opus, read-only, lens-checklist mode

**Files:** `frontend/lib/geo/coordinates.ts` (98), `frontend/lib/geo/coordinates.test.ts` (151) — both new, no existing file modified.

**Implementer verification:** `cd frontend && npm test -- coordinates` → `Test Suites: 1 passed / Tests: 18 passed`. Also `npm run lint` (clean) and `npx tsc --noEmit` (clean in `lib/geo`).

**Reviewer verdict — FAIL, 2 issues:**

1. **`isSamePoint`'s two-axis conjunction is untested — a single-axis implementation passes all 18 tests.** Replacing the body with `return point.lat === parsed.lat;` leaves every `isSamePoint` test green: the pre-snap case differs on *both* axes, the two `true` cases are identical on both, and the unparseable case short-circuits on `parsed === null`. No test holds one axis equal while varying the other. Runtime consequence is a direct FR-3 failure — edit only the longitude, the guard reports "same", the marker never moves — and the seam is the guard's sole owner (`design.md` §7.4), so nothing downstream recovers it. *Violated:* T-1 "Done when" read with KZ-013 · FR-3 · DD-4.
2. **FR-6's round-trip clause has a named test but no demonstrated falsifier — and this task's predicted falsifier was provably wrong.** `format → parse → format` is stability, which is precision-invariant, so the `5 → 6` mutation cannot redden it. The Implementer's reported count of 3 reddened tests is internally consistent with that and corroborates its account, but the clause's owning test was never shown able to fail. *Violated:* T-1 "Falsifying input" and the KZ-013 rule it encodes · FR-6 sc. 1.

**Reviewer PASSED on:** NFR-4 (grep-verified: no `leaflet`/`react`/component import, no `jest.mock`, test imports exactly one module) · all four FR-2 sc. 3 cases individually named · the `Number()` coercion edges (`'0x10'`, `'1e2'`, `' 12 '`, `'+5'`, `'.5'`, `'-0'`) — judged **correct because they match both forms' own bare `Number()`**, which is the right criterion; diverging would be the defect · `toFixed` trailing zeros (`'39.00000'`) adjudicated **acceptable**: ≤7 dp, `Number('39.00000') === 39` so stored equals submitted, and both payload builders are unaffected · exemplar conformance.

**Reviewer's own audit boundary (KZ-012):** it cannot re-run Jest; the 18/18 and the three mutation results are the Implementer's account, reconciled against source but not independently executed.

#### Leader action — a defect in the work order, not the code

Reviewer issue 2 is a **spec defect I authored**. `tasks.md` T-1 predicted that the `5 → 6` mutation would redden the round-trip case. It cannot: round-trip stability is precision-invariant by construction. **A falsifier that cannot fail the clause it is assigned to is KZ-002 inside the verification line itself** — the same class this spec's `design.md` §2 exists to fix, reproduced one level down in a task I wrote.

Corrected in `tasks.md` T-1 before re-spawning: the falsifier list is now one-per-clause, the round-trip clause gets its own mutation (round `parseCoordinatePair`'s output, or make `formatCoordinate` non-idempotent), and a fifth falsifier is added for the dropped-conjunct defect of issue 1. "Done when" now requires a *demonstrated* falsifier, not a named test alone. Closure sweep: the wrong prediction appeared at exactly one site.

#### Forward pointer → T-3 (carry into that brief; do not rely on this record alone)

**ADVISORY 2** from this review is a real constraint on the Leaflet shell: `isSamePoint`'s exact `===` settles in one pass **only if T-3 sets the marker from the parsed value verbatim and reads back that same stored `LatLng`.** Any Leaflet path that normalizes — `LatLng.wrap()`, `worldCopyJump`, a `project`/`unproject` round trip, or re-deriving position from pixel coordinates — shifts the double and makes the guard report "different" forever, reproducing the F-3 symptom through a different door. DD-4 states the premise but nothing enforces it.

**Other advisories (recorded, non-gating, explicitly not new tasks):** the "byte-for-byte" test title overstates what a numeric comparison shows · no test pins `parseCoordinatePair('0','0') → {0,0}` (the exemplar's zero-is-valid discipline) · no test documents that the seam's coercion deliberately matches `validate()`'s · `toFixed` renders `39.00000` in a `type="number"` input, which T-5/T-6 must not "fix" by trimming zeros — that would weaken round-trip stability.

### T-1 — Coordinate seam · attempt 2 · Reviewer **PASS** ✅

**Date:** 2026-09-08 · **Implementer:** sonnet, effort `xhigh` (bumped from `high` per the rework rule) · **Reviewer:** opus, read-only

**Scope of the rework:** test file only. `coordinates.ts` **unchanged** — the Implementer reverted all three mutations and verified byte-identity with `diff`; the Leader independently confirmed 98 lines with both conjuncts of `isSamePoint` intact. A rework that touches no production code is the correct shape here, because neither FAIL issue was about the code.

**Files:** `frontend/lib/geo/coordinates.test.ts` 151 → 163 lines, 18 → 20 tests. Two tests appended to the DD-4 describe.

**Verification:** `cd frontend && npm test -- coordinates --silent` → `Test Suites: 1 passed / Tests: 20 passed, 20 total`. `npm run lint` → 0 errors.

**Mutation evidence — one-to-one between defect and detector:**

| Mutation | Reddened | Result |
|---|---|---|
| drop the `lat` conjunct (`return point.lng === parsed.lng`) | **exactly** `reports different when only the latitude differs` | 1 failed / 19 passed |
| drop the `lng` conjunct (`return point.lat === parsed.lat`) | **exactly** `reports different when only the longitude differs` | 1 failed / 19 passed |
| `parseCoordinatePair` rounds output via `Number(x.toFixed(4))` | the round-trip test **on its own assertion** — `Expected "-6.81235", Received "-6.81240"` (+2 incidental) | 3 failed / 17 passed |

**Reviewer verdict:** PASS. It re-derived every mutation outcome from source rather than trusting the report, and confirmed the reported failure *directions* (`Received: true`) are the ones the code implies. It also verified the new tests' values are exact-float-safe rather than accidentally passing: on the matching axis, the literal `-6.8` and `Number('-6.8')` take the same decimal→double path so equality is guaranteed; on the differing axis the separation is ~10¹² ULP.

**Reviewer's audit boundary (KZ-012), recorded:** no shell, so it could not run `git diff` to prove the delta is *confined* to the two additions. It verified the end state matches the described end state and that no prior test was mutated — the same evidence one step removed. The Leader's own `git diff --stat` supplies the confinement half.

**Requirements closed by T-1:** FR-6 (all clauses, each with a demonstrated falsifier) · FR-2 sc. 3 (four null cases, individually named) · FR-3 sc. 1 (seam half) · NFR-4 (grep-verified) · DD-4 both paths **and** each axis alone.

#### ADVISORY (recorded, non-gating, not tasks)

1. **The round-trip clause has no uniquely-killing mutation, and largely cannot.** It is *entailed* by the two clauses either side of it (format rounds to 5; parse never rounds), each independently tested — so every natural mutation that breaks round-tripping also breaks a neighbour. The Reviewer constructed the one isolating probe that exists (parse rounding conditional on the input's decimal count) and judged it too contrived to be worth chasing. **Recorded in `tasks.md` T-1 as a known property of FR-6's third clause** rather than left as an open question.
2. **LOC overrun — see the budget note below.**
3. The line-107 test title `"byte-for-byte as a number"` remains loose (a string property asserted numerically). Declined twice, still advisory, misleads no one who reads the body.

#### ⚠️ Budget signal — recorded now, not at the breach

**T-1 actual: 261 LOC (98 prod / 163 test) against an estimated 170 (60/110) — 53% over.** Surfaced by the Reviewer, independently re-measured by the Leader (`wc -l`) rather than accepted as reported (KZ-005).

No gate is breached: the tripwire is the **635 total**, and T-1 has consumed 261 of it plus 2 of 9 review rounds. But if the 53% ratio held across T-2…T-7 the spec would land near 970 LOC, well past the tripwire. **The point of a tripwire is that it fires early enough to be acted on**, so this is escalated to the user at the T-1 gate as information, not as a failure. Two readings are available and only execution will separate them: T-1 is the spec's most test-dense task by design (a pure seam whose whole purpose is provability, at a 1.66 test-to-prod ratio that later UI tasks will not repeat), or the per-task estimates were uniformly light.
