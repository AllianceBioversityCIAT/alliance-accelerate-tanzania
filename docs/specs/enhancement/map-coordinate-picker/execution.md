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

### T-2 — Extract map constants · attempt 1 · Reviewer **FAIL**

**Date:** 2026-09-08 · **Implementer:** sonnet, effort `medium` · **Reviewer:** opus, read-only

**Files:** `frontend/components/map/map-constants.ts` (new, 42 lines, **zero import statements**), `frontend/components/map/LeafletMap.tsx` (edited).

**Verification (Implementer):** `npm test -- map` → 8 suites / 67 tests passed · `npm run build` → `/map` **112 kB** (= M-3), `/register` **113 kB** (= M-1) · `npx tsc --noEmit` clean.

**Type route:** `tsc` **did** reject the direct assignment, exactly as the Leader's brief predicted — `TS2322: The type 'readonly [number, number]' is 'readonly' and cannot be assigned to the mutable type 'LatLngTuple'`. Implementer took the preferred route: `readonly` retained in the shared module, spread at the one `L.map()` call site.

**Falsifying input — the gate cannot fail, and that is the honest finding.** Shifting `TANZANIA_CENTER`'s latitude by a full degree left the suite at 67/67, `tsc` clean, and the build table byte-identical. **Nothing reacted.** Corroborated structurally by the Reviewer: `components/map/` has no `LeafletMap.test.tsx`, and `ActorMap.test.tsx` mocks `next/dynamic`, so the 67 green tests provably never load the module under change. Declared gap (KZ-013 form B), not a defect.

**Leader verification the harness cannot do:** because no gate can catch a wrong value, the Leader compared every numeric literal and both strings between the committed original and the new module — six numbers, tile URL, and the attribution string all **identical**. The Reviewer independently re-derived the same comparison.

**Reviewer PASSED on:** FR-8 (grep for both the four *symbols* and the two raw *literals* — the literal grep is the one that matters, since a re-typed attribution string carries no symbol name; exactly two files match) · FR-8's review-only `BUT` clause (no `pickerMode`, no new prop, no coupling; `LeafletMapProps` byte-identical) · **NFR-6, established by reading the installed Leaflet source** rather than from recall: `toLatLngBounds` → `new LatLngBounds(a)` iterates `a.length` and indexes, with no arity check or tuple brand, so `.map(c => [...c])`'s plain `number[][]` is interpreted identically to the original nested literal; `toLatLng`'s `length === 2` branch likewise for `center`. Allocation sits inside the `useEffect`'s post-guard path, so it is one extra pair of arrays per map init · §7.2 type route judged the correct trade.

#### Reviewer verdict — FAIL, 1 issue (KZ-008)

**The new docblock asserts something this same task falsified, and the diff contradicts itself 140 lines apart.** `map-constants.ts` says *"Leaflet's structural types accept a plain tuple at any call site that expects them"* — while `LeafletMap.tsx`, same change, says the opposite and works around it. `L.LatLngTuple` is mutable; a `readonly` tuple is **not** accepted, which is the `TS2322` the Implementer had just reported.

The cost is concrete, not stylistic: this module exists to be imported by a second consumer (T-3), its docblock is the first thing that implementer reads, it promises the assignment will just work, and it will not — T-3 hits the identical error with the warning removed. *Violated:* KZ-008 (High, recurrence ×3), secondarily KZ-005.

#### Leader actions — the false claim came from *my* design document, and a dead gate was found one task ahead

1. **`design.md` §7.2 was the source.** It read *"Leaflet's structural types would satisfy those positions anyway."* The Implementer inherited the error rather than inventing it. Corrected at source with the measured `TS2322`, plus an explicit note that **T-3 will hit the identical error and that is expected**. Without this, fixing only the docblock would leave T-3 re-reading the false premise from the design.
2. **T-3's Verify command could not run — a third KZ-002 in a verification line.** It specified `npx eslint "…" --quiet`. Measured by the Leader: `frontend/` has no `eslint.config.*`, only legacy `.eslintrc.json` against `eslint@^9`, and the command aborts with *"ESLint couldn't find an eslint.config.(js|mjs|cjs) file."* Replaced with `npm run lint` (`next lint`, which shims the legacy config and does not mutate).
3. **Root cause of (2), recorded because it will recur:** root `CLAUDE.md`'s `npx eslint … --quiet` guidance is a **`backend/` rule**, motivated by `backend/`'s `npm run lint` running `--fix` on the diff under review. `frontend/`'s does not mutate. The Leader misapplied a backend rule to a frontend task when authoring T-3. `tasks.md` § Execution conventions now states the distinction. **The constitution was not wrong; its scope was misread.**

> **Pattern worth naming for the Kaizen retrospective.** This spec has now produced **three** KZ-002 instances, and all three were in *verification lines*, never in requirements or design intent: NFR-1's route table (caught at design review), T-1's round-trip falsifier (caught at code review), T-3's eslint command (caught by a Reviewer reading one task ahead). The requirements and design have held up; the gates authored alongside them have not. The Leader now measures every Verify command before its task starts.

#### ADVISORY (recorded, non-gating, not tasks)

- **T-3 zoom:** `INITIAL_ZOOM`/`ACTOR_ZOOM` correctly stayed in `LeafletMap` (Reviewer independently judged the Leader's scope decision correct against FR-8). T-3 must declare its **own** local zoom for a ~300 px embedded viewport and must not import `LeafletMap`'s — importing them would be FR-8's forbidden coupling arriving by the back door. **Carry into T-3's brief.**
- **Bare requirement IDs are now ambiguous across two specs in adjacent files.** `LeafletMap.tsx` carries seed-map IDs (its `NFR-4` = "OSM attribution required"); `map-constants.ts` adds this spec's (whose `NFR-4` = "coordinate logic testable without Leaflet"). Same token, different meaning. Fold a qualified citation into the docblock fix.
- T-2 sized at ~35 LOC, delivered 42 — ~22 of them docblock. No breach.

**Reviewer's audit boundary (KZ-012):** the 67/67, the route table, and the clean `tsc` are the Implementer's account. Two were reconciled against source (112 kB is structurally expected from the module graph; the green suite is provably *incapable* of reacting to this change). The `tsc` result has no independent corroboration available to a read-only auditor — and it is the one claim the FAIL depends on being true.

### T-2 — Extract map constants · attempts 2–3 · Reviewer **PASS** ✅

**Date:** 2026-09-08 · **Implementer:** sonnet, effort `high` → `xhigh` · **Reviewer:** opus, read-only

**Attempt 2 (FAIL → not recorded separately above; folded here):** fixed attempt 1's false docblock sentence and reproduced the `TS2322` independently with a throwaway type-check file rather than trusting `design.md`. **But the replacement carried a new false claim** — `` `L.LatLngTuple` is `[number, number]` `` — transcribed faithfully from the Leader's own §7.2 correction. Reviewer also found the forward-looking sentence *"will hit the identical `TS2322`"* to be a prediction stated as certainty, **self-defeating** (a consumer who follows the docblock and spreads never hits it) and false for `TANZANIA_BOUNDS`, which fails against a different target.

**Attempt 3 (PASS):** both corrected. Implementer independently re-read the `.d.ts` before transcribing and confirmed no discrepancy. Also dropped the bare `T-2` from the comment this task added to `LeafletMap.tsx` and qualified `FR-8`.

**Verification:** `npm test -- map --silent` → 8 suites / 67 tests · `npm run build` → `/map` **112 kB** (= M-3), 27/27 pages, export OK · `npx tsc --noEmit` clean.

**Reviewer PASS summary:** re-read all four declarations at `@types/leaflet@1.9.21` lines 164/166/200/202 itself; the new arity text matches byte-for-byte, and the differentiated-targets replacement introduces no fresh false claim. It accepted the Leader's adjudication on the pre-existing "structurally identical" phrasing, adding the sharper reason: a *mutable* `[number, number]` **is** assignable to `[number, number, number?]`, so the optional third element is not what breaks the assignment — mutability is the sole operative difference, making "declared mutable" the only load-bearing part of that sentence.

#### The Leader's error, recorded in full because the mechanism will recur

`design.md` §7.2's first correction asserted `L.LatLngTuple` is `[number, number]`. The installed source says `[number, number, number?]`. **The Implementer transcribed my text faithfully; the source was mine and it was wrong.**

Mechanism: the compiler's message reads *"cannot be assigned to the mutable type `LatLngTuple`"* — it names the alias **without expanding it**. I read the message, inferred the expansion, and wrote the inference as primary-source fact without opening the `.d.ts`. This is structurally identical to `judgment.md` **F-1**, where a `*`-quantified regex counted type declarations as data and I wrote the artefact as a measurement. **Both times the fix was not more care — it was opening the artefact.** §7.2 now records the mechanism alongside the corrected declarations.

That makes **four KZ-008 instances in this spec, two of them authored by the Leader**, and every one of them caught by measurement rather than by review-by-reading alone.

#### ADVISORY (recorded, non-gating, not tasks)

1. **Measurement boundary on the new text:** *"so the message differs between them"* is **inferred from verified declarations, not observed** — the `TANZANIA_BOUNDS` error has never been produced, because both call sites spread. The docblock correctly reserves its "measured, not assumed" tag for the one string that was measured. If T-3 ever produces the bounds error, that is the moment to quote it or drop the sentence; it must not accrete a "measured" tag without one.
2. **`LeafletMap.tsx` line 16 carries a bare `T-2` belonging to the archived seed-map spec** (`// T-2 baseline remains:`, paired with `// T-3 additions` at line 7), now sitting ~140 lines above a comment reading `enhancement/map-coordinate-picker FR-8`. Two unrelated `T-2`s in one file. Pre-existing, out of scope here — **qualify opportunistically in T-3**, which touches this directory anyway.
3. `LeafletMap.tsx` and `map-constants.ts` state the same fact at different precisions. Not a defect (see above). Align only if T-3 opens that comment block for another reason.

**Reviewer's audit boundary (KZ-012):** the suite, page count, route table and clean `tsc` are the Implementer's account. The Reviewer reconciled 112 kB structurally — comments are stripped from the bundle, so it is the only value a comment-only diff *could* produce.

---

## Budget re-baseline — after T-2, user-approved 2026-09-08

**Tripwire state at the T-2 gate:** 2/7 tasks · **7 of 9 review rounds** · ~323 of 635 LOC.

The round budget failed; the LOC and task budgets held. Escalated to the user *before* spending past it rather than at the breach.

**Cause, measured not guessed.** Six of seven rounds went to the accuracy of **prose**, not the correctness of code. T-2 is the clean case: its code was accepted on attempt 1 and never changed again, while three Implementer spawns and three review rounds went entirely into one docblock. Every FAIL was legitimate — and the `LatLngTuple` one was caught *before* T-3 could inherit the false premise — so the discipline is sound and the estimate was wrong. The original 9 assumed reviews audit code; this Reviewer also audits documentation truth, and keeps finding real defects doing it.

**Also settled:** the question raised at the T-1 gate (outlier vs. uniform underestimate) appears to resolve to **outlier**. T-2 landed at 42 lines against ~35, and the running total is 323/635 at 2/7 tasks.

> ⚠️ **This conclusion was FALSIFIED at the T-3 gate — see the escalation below.** It was wrong twice over: T-2 did not finish at 42 lines (its attempt-2/3 docblock rewrites took it to **63**, +80 %, not +20 %), and T-3 came in at **296 against 135** (+119 %). Every task has overrun and the trend is upward. Recorded here rather than edited away, because the reasoning error — treating two data points as a trend and closing the question — is the finding.

**Two changes, both applied:**
1. `design.md` §11 review-round budget **9 → 16**, with the measured rationale recorded in the budget row itself so the number is not mistaken for a fresh guess.
2. `tasks.md` § Execution conventions now narrows the **gate** (not the reporting): documentation-accuracy findings FAIL only when the false claim would mislead a downstream task — a docblock in a module another task imports, an instruction in a spec document, a comment stating a verification result. Prose imprecision with no downstream reader is ADVISORY. Reviewers still report everything.

**Leader accountability, recorded for the retrospective:** of the four false claims this spec has produced, **two were the Leader's** — `judgment.md` F-1 (a `*`-quantified regex counting type declarations as data, written up as a measurement) and `design.md` §7.2's `LatLngTuple` arity (the compiler's message names an alias without expanding it; the expansion was inferred and written as primary-source fact). **Identical mechanism both times:** reading something that *describes* an artefact and recording the inference as the artefact. Both were caught by measurement; neither would have been caught by re-reading more carefully.

### T-3 — Leaflet shell · attempt 1 · Reviewer **FAIL** (2 issues) + budget escalation

**Date:** 2026-09-08 · **Implementer:** sonnet, effort `xhigh`, skills `vercel-react-best-practices` + `tailwind-design-system` + `react-doctor` · **Reviewer:** opus, read-only

**File:** `frontend/components/map/CoordinatePickerMap.tsx`, 296 lines, no other file touched.

**Verification (Implementer):** `npx tsc --noEmit` clean · `npm run build` 27/27 pages, `/map` 112 kB and `/register` 113 kB **both unchanged** (component imported nowhere yet — dead code, correct at this task) · `npm run lint` only pre-existing unrelated warnings · `react-doctor` 0 issues on changed files.

**Falsifying input demonstrated:** inserting `#1F4E8C` into the divIcon made the token grep return `80: background: #1F4E8C;` (exit 0); reverted, clean (exit 1). Genuine discrimination test with an inspectable control.

#### FAIL 1 — `maxBounds` makes the feature's own purpose unreachable *(Leader-flagged, Reviewer confirmed independently)*

The picker passed `maxBounds: TANZANIA_BOUNDS`. Both `setView` and `panTo` route through `_limitCenter`, which **offsets the requested centre back inside the bounds**. So an actor whose stored coordinates fall outside the Tanzania bbox gets a marker at the right `LatLng` and a view clamped to the bbox edge — **the pin is never on screen.**

Why this is the central case, not an edge case: a *wrong* coordinate is disproportionately one outside Tanzania. Transposed lat/lng turns `(-6.8, 39.28)` into `(39.28, -6.8)` — the Atlantic off Morocco — and both axes pass `parseCoordinatePair`, because "in range" is `[-90,90]`/`[-180,180]`, not the bbox. The admin sees an empty Tanzania map with no pin and no signal anything is wrong. That is precisely the failure `proposal.md` commissioned the feature to fix. *Violated:* FR-2 description, FR-2 sc. 1, FR-2 Rationale, `design.md` §7.4 (which specifies no bounds restriction).

**Reviewer's independent verification went further than the Leader's** and closed three holes in it: `panTo` is a thin delegate to `setView` (no unclamped path); `_getBoundsOffset`/`_rebound` take the **hard-clamp** branch when the bbox exceeds the viewport, not a nudge; and `maxBoundsViscosity` is read **only** by `Drag._onDragStart`, never by `_limitCenter` — plus `setMaxBounds` registers `_panInsideMaxBounds` on `moveend`, so even a view that somehow lands outside is panned back afterwards.

#### FAIL 2 — `PICKER_ZOOM = 12` used for the *empty* view *(Reviewer only — the Leader missed this, and it hurts the primary flow more than FAIL 1)*

The map initialises at z12 on `TANZANIA_CENTER` even when no coordinates exist. Measured by the Reviewer: at z12 and −6.37° latitude, resolution is `156543.03 × cos(6.37°) / 2^12` ≈ **38 m/px**, so the `h-80` (320 px) container shows roughly **12 km** of rural Singida — about **1 %** of the country's width, with no recognisable landmark. A person must zoom out ~6 levels before FR-1 sc. 2 (click to place the pin) is usable.

**That is the `/register` flow, where the fields are blank by definition** — the mobile-first channel this whole spec exists to serve. And the docblock asserts the zoom is fit for *"a placed point (FR-2 sc. 1) **or** the Tanzania default (FR-2 sc. 2)"*, which is false for the second half — a downstream-facing false claim in the module T-4 imports, so it gates under the narrowed rule. *Violated:* FR-2 sc. 2, `design.md` §7.4 Mount row ("at the Tanzania view" — the only such view this codebase defines is `INITIAL_ZOOM = 6`), and the narrowed documentation gate.

**Remediation:** split the two view policies — keep `PICKER_ZOOM = 12` for `setView` on a placed point, give the initial/empty view its own overview zoom (or `fitBounds(TANZANIA_BOUNDS)`). The Reviewer notes this is also the **constructive** resolution of the Implementer's flagged judgment call: `TANZANIA_BOUNDS` belongs in *framing* the initial view, never in caging it. No effect reordering needed.

#### Reviewer PASSED on everything else, by reading Leaflet's source

- **Forward pointer (1) — the `isSamePoint` contract holds, verified at source level.** `worldCopyJump` defaults false and is never set; no `.wrap()`; every write is verbatim from `parseCoordinatePair`. Critically, it answered the Leader's open question: **Leaflet's `LatLng` constructor does not normalize or round** — `this.lat = +lat; this.lng = +lng;` and nothing else — and `MarkerDrag._onDrag` assigns `layerPointToLatLng(iconPos)` unwrapped and unrounded. **There is no path by which the stored double differs from the parsed double.** DD-4's `===` is sound.
- **Effects:** dependency arrays correct (`onChange`/`disabled` read through refs, not captured); StrictMode double-invoke safe because `map.remove()` clears `_container._leaflet_id`; the docblock's "placement effect also runs on mount" claim is **true**, but only because hook declaration order puts init first — an unrecorded load-bearing precondition.
- **`disabled`** closes both write paths: click guarded by `disabledRef.current`; drag disabled via `marker.dragging.disable()`, with `removeHooks` detaching `dragend` so an interrupted gesture writes nothing.
- **NFR-3:** all three CSS custom properties confirmed present in `globals.css`; no hex/rgb/arbitrary values; container uses `border border-border`, per the 1.05:1 rule.
- **Clause-sweep honesty:** every (B) carries a real structural reason. The Reviewer tested the KZ-003 assumption rather than accepting it — `getSize()` returns 0×0 in jsdom, corrupting `_limitCenter`, projection and marker positioning — so none of the deferred clauses is testable without the stack. Three clauses were arguably *under*-credited (declared (B) when a partial (A) existed); that is the safe direction.

#### ADVISORY (recorded, non-gating, not tasks)

1. **Forward pointer (1)'s comment names the wrong methods.** It promises `setView`/`panTo` are fed parsed values — but those move the map *centre* and cannot affect `isSamePoint`, which compares `marker.getLatLng()`. The load-bearing call is **`marker.setLatLng`**, unmentioned. True but protecting the wrong invariant; a future editor could satisfy it literally and still break the guard.
2. The DD-4 comment describes the steady state as if it were the first pass — after a drag the marker is at ~13 dp and `isSamePoint` correctly reports **not** equal, which is what triggers the snap.
3. Record the hook-declaration-order precondition in the lifecycle docblock.
4. **`alt: 'Selected location'` is silently dropped for a `divIcon`** — Leaflet applies `alt` only to `IMG` elements, while `title` applies to any. The marker is focusable (`keyboard: true` → `tabIndex=0`, `role="button"`), so its only accessible name is the inner `aria-label`. One-word fix: add `title`.
5. **Clicking the pin itself rewrites a hand-typed 7-dp value.** Marker clicks bubble to the map handler with `data.latlng = target.getLatLng()`, so a click (or Enter) on the pin calls `onChange` and rounds `-6.8123456` → `-6.81235` **without the pin moving**. FR-1 sc. 2 scopes to "a point that is not the marker", so undefined rather than violated. **Add to T-7 gate 2's observation list.**
6. Removing `maxBounds` opens a reachable antimeridian edge: an unbounded pan lets a click yield `lng = 200`, which round-trips to a removed marker (defined FR-2 sc. 3 behaviour, but confusing). Consider wrapping only the click-derived longitude.
7. `panTo` fires on every settle, so each drag recentres the map — conformant with §7.4, but may visibly snap. For the T-7 observer to judge.
8. **Carry-over now unowned:** the `LeafletMap.tsx` bare-`T-2` qualification was directed at T-3 "opportunistically"; the Implementer correctly declined (one file in scope) and said so. T-5/T-6 do not touch that directory. **The Leader must reassign it or drop it.**

**Reviewer's audit boundary (KZ-012):** everything above is established by reading source. The clean `tsc`, the route table, lint and `react-doctor` are the Implementer's account, produced by the agent that wrote the code. They reconcile (unchanged route sizes are exactly right for a module imported nowhere) but are not independently verified. **Both FAIL issues are runtime-view properties that no committed gate would redden** — they must be confirmed by observation at T-7 gate 2, and FAIL 2 should be one of gate 3's rendered captures.

### T-3 — Leaflet shell · attempt 2 · Reviewer **PASS** ✅

**Date:** 2026-09-08 · **Implementer:** sonnet, effort `xhigh` · **Reviewer:** opus, read-only

**Both FAILs closed, verified unreachable at source.** `maxBounds`/`maxBoundsViscosity` removed entirely and `L.map()` now takes **no options object at all**, so there is no nested option to hide one in — the Reviewer confirmed `_limitCenter` returns its argument when `bounds` is falsy and `_panInsideMaxBounds` is registered *only* by `setMaxBounds`, which `initialize` calls only `if (options.maxBounds)`. `PICKER_ZOOM = 12` now appears exactly once, on the placed-point path; the empty view is `map.fitBounds(TANZANIA_BOUNDS)`, hand-checked by the Reviewer to frame the country at **≈z5** in a 375 px layout.

**Antimeridian:** click-derived longitude normalised with `L.Util.wrapNum(lng, [-180,180], true)`. Verified three ways — the Implementer extracted the function body and ran it in Node (`wrapNum(200,…) === -160`); the Reviewer confirmed the runtime export (leaflet-src.js:113/:264), the `@types/leaflet` declaration (:3138), the arithmetic by hand, and that `includeMax: true` is **Leaflet's own idiom for this exact call** (`CRS.wrapLatLng`, :1684) — with `false`, a legitimate `lng = 180` would flip to `-180`.

#### The Leader's zero-size-container risk — adjudicated as a T-4 constraint, not a T-3 defect

The Leader flagged that swapping `center`/`zoom` for `fitBounds` introduces a layout dependency: `getBoundsZoom` divides by `getSize()`. The Reviewer confirmed the mechanism precisely — a 0×0 container yields `scale = 0` → `getScaleZoom(0)` = **`-Infinity`** (not `NaN`, so the `isNaN → Infinity` escape does not fire), clamped to **zoom 0**: the whole world, correctly centred on Tanzania. **And it is sticky** — Leaflet's resize handler calls `invalidateSize`, which preserves centre and zoom and never re-fits, so a map initialised at 0×0 stays at z0 for its lifetime. Nothing in the file mitigates it.

**But it is not a T-3 defect**, on an argument stronger than the Leader's framing: `design.md` §7.3 already requires that the wrapper **not render** `CoordinatePickerMap` while closed, and a `display:none` mount would still execute the dynamic import — so the chunk, the CSS and the tiles all appear in the NFR-1b capture. **T-7 gate 1 reddens on exactly this mistake, and that gate is required to be mutation-verified before it is trusted.** Failing T-3 would mean failing a file for a defect living in a file nobody has written yet.

The Reviewer did not suppress the counter-argument: the fix genuinely trades layout-independence for aspect-ratio-correct framing, and if the Leader wants that neutralised inside T-3 the minimal form is a guard (`fit only when clientHeight > 0, else setView([...TANZANIA_CENTER], 5)`) — but that is a **hardening request a Leader may issue, not a conformance defect a Reviewer can manufacture a FAIL from.** Recorded as offered and not taken.

**→ Carried into T-4/T-5's brief as a hard constraint** (below), and one line added to T-7 gate 2.

**Also corrected by the Reviewer:** the Leader's trace of the init order was right but the "no window" phrasing was not — `fitBounds`-before-`addTo` **is** load-bearing (swapping them makes `getCenter()` throw `Set map center and zoom first.`), but it fails **loudly**, which is why only the silent declaration-order hazard needed a comment.

#### Comment trim: +11 lines, not the −40/−60 the Leader asked for — accepted

The Implementer flagged the miss explicitly rather than claiming the target. The Reviewer went looking for redundant prose to justify calling it a defect and **found none worth cutting** (it found redundant *code* instead — advisory 4). Every addition is a decision rationale, a measured result, or a hazard, which is exactly what the new comment rule says earns a place. **The Leader's 40–60 figure was a guess; the rule was applied correctly and the guess was wrong.** The dropped lifecycle table's one load-bearing fact survives, and in a stronger form — the placement effect's mount behaviour now also carries the React rule that makes it true, the declaration-order precondition, and the silent failure mode.

#### KZ-008 sweep: 12 comment claims checked against installed source, all borne except two

Verified true: the `wrapNum` behaviour and export; `alt` reaching only `IMG` while `title` applies to any element (:7903–7909, quoted verbatim); `DivIcon.createIcon` building a `<div>`; `keyboard: true` → `tabIndex`/`role="button"`; the declaration-order precondition; the `fitBounds` rationale; the ≈38 m/px arithmetic (reproduced: 37.98); forward pointer 2's `INITIAL_ZOOM`/`ACTOR_ZOOM` values; forward pointer 1's `marker.setLatLng` correction.

#### ADVISORY (recorded, non-gating, not tasks — two are real and cheap)

1. **A drag can also produce an out-of-range longitude; the "click-only" justification is a true premise with a false conclusion.** The comment reasons *"a marker drag can't leave the rendered viewport"* — true and irrelevant: with `maxBounds` gone and `TileLayer`'s default `noWrap: false` repeating the world, **the viewport itself can sit past lng 180**. Pan east to 175–190, drag the marker, and `dragend` writes `"185.00000"`, which `parseCoordinatePair` rejects — the marker vanishes and the person gets a range error they did not cause. Non-gating: needs a ~145° pan in a 320 px map, and the consequence is a correctly-messaged validation error. **One-line fix when the file is next open:** the same `wrapNum` inside `createMarker`'s `dragend`, and delete the "click-only" sentence.
2. **`(TS2322, measured via npx tsc --noEmit)` carries a measurement tag that cannot be corroborated** — and it trips the exact tripwire the T-2 review set (*"must not accrete a 'measured' tag without one"*). The substance is true and the instruction a reader acts on ("spread first") is correct, but TS2322 is the **assignment** code, whereas the direct form here would be a call **argument** → **TS2345**. Ask for the verbatim string or drop the parenthetical; `design.md` §7.2 already carries the one genuinely measured instance.
3. **The `LeafletMap.tsx` fix is half a pair.** Line 16's bare `T-2` is now qualified, but line 7 still reads `// T-3 additions (pins/popup/legend…)` — and *this* spec's T-3 is the file that just imported from it, so that reference is now **more** ambiguous than the one that was fixed.
4. **Dead code:** the init effect's `dragging/doubleClickZoom/touchZoom` disable block is redundant — the `[disabled]` effect also runs on mount, after it, and does the same plus the marker.
5. One DD-4 sentence describes a pass that does not occur (deps are `[latitude, longitude]`, so nothing re-runs after the snap; the loop terminates because the effect stops firing). Inherited verbatim from `design.md` DD-4, load-bearing half is correct.

#### → T-7 observation list now carries five items
(i) after revealing the picker on `/register` with blank fields, confirm the empty view frames **Tanzania, not the world**; (ii) drag near the antimeridian; (iii) clicking the pin itself rounds a hand-typed 7-dp value; (iv) `panTo` recentres on every drag settle — may visibly snap; (v) an antimeridian click teleports the pin before `panTo` converges.

#### → Hard constraint carried to T-4/T-5
**The shell must be mounted only into a laid-out container — never behind `display:none`, `hidden`, or a zero-height wrapper.** A picker mounted at 0×0 fits to zoom 0 and *stays there for its lifetime*, because `invalidateSize` preserves zoom and never re-fits. This is not advisory: it is the condition under which FAIL 2's fix works at all.

**Reviewer's audit boundary (KZ-012):** all of the above established by reading source; it ran no commands. The `tsc`, build, lint and `react-doctor` results are the Implementer's account, reconciling with a module still imported nowhere.

### Post-T-3 advisory corrections · Reviewer **PASS** ✅

**Date:** 2026-09-08 · **Authorisation:** user, explicitly, at the T-3 gate. Recorded because the protocol forbids the Leader turning an advisory into work on its own initiative — the user deciding directly is the sanctioned route. Scope was the two named items; advisories 3–6 were held out and remain recorded-only.

**Item 1 — a drag could also produce an out-of-range longitude.** The `dragend` path now applies the same `L.Util.wrapNum(pos.lng, [-180,180], true)` as the click path, inside `createMarker` — the one helper both write paths share, so they cannot re-diverge. The false *"click-only: a marker drag can't leave the rendered viewport"* sentence is gone.

Reviewer confirmed the premise at source rather than accepting it: `Marker.Drag._onDrag` assigns `layerPointToLatLng(iconPos)` **unwrapped**, `worldCopyJump` defaults false, so `getLatLng().lng` genuinely can be 185 — which `parseCoordinatePair` rejects, removing the pin and leaving an out-of-range value in the form. Real bug. A repo-wide grep confirmed exactly one `dragend` registration and one `onDragEnd` call, so the fix covers every drag write path.

**Latitude verified two independent ways** (the Implementer checked both rather than taking the Leader's word): no CRS in Leaflet's distribution sets `wrapLat` (`Earth` sets only `wrapLng`; `wrapLat` exists solely as a commented-out placeholder), and `SphericalMercator.unproject`'s `2·atan(exp(y/R)) − π/2` is strictly within (−90°, 90°) for any finite Y.

**Item 2 — the uncorroborated "measured" tag. Measured, and the suspicion was right.** Removing the spread and running `tsc` produced **TS2345**, not TS2322:

```
error TS2345: Argument of type 'readonly [readonly [number, number], readonly [number, number]]'
is not assignable to parameter of type 'LatLngBoundsExpression'.
```

The original tag was wrong twice over — it claimed a measurement nobody took, **and** named the wrong code, because `fitBounds` takes an argument (TS2345) where `map-constants.ts`'s genuine case is an assignment (TS2322). **Sixth false comment claim in this spec, and again found by measuring rather than re-reading.**

**How the Reviewer corroborated a string it could not produce** (KZ-012 in practice): checked that `fitBounds`'s declaration puts the value in argument position, so TS2345 is the predicted code; that the quoted type text matches `TANZANIA_BOUNDS`'s declaration character-for-character including both nested `readonly`s; that the elaboration names `LatLngBoundsLiteral`, the correct failing constituent of the union; that **column 19 is exact** (4-space indent + `map.fitBounds(`); and that line 167 reconciles with the reported +25/−5 diffstat. Its note is worth keeping: *"the measurement corrected the claim in the direction I predicted, which is the opposite of what a fabricated re-quote would do."*

**DD-4 interaction — traced, convergent.** The one genuinely new behaviour: after a past-antimeridian drag the marker sits unwrapped at 185.2 while `onChange` writes `−174.8`. `isSamePoint` reports not-equal, the effect sets and pans one world-width west, `_tryAnimatedPan` rejects the animation (offset exceeds viewport) so it is an instant reset rather than a slide, tiles are identical under `noWrap: false`, and the next render compares equal and early-returns. **One pass, no oscillation.** The invariant holds because the wrap touches a *number on the write path*, never a `LatLng` that `isSamePoint` reads back.

**Advisories (recorded):** the ±90 asymptote is true of the real-valued function but `Math.exp` overflow makes exactly ±90 representable in IEEE-754 — unreachable by a drag and in-range anyway; `noWrap` is declared on `GridLayer` and inherited by `TileLayer`; and no test drives a past-antimeridian drag, so D's convergence is reasoned, not asserted.
