# Tasks — Partner Profile Workbook Onboarding

- Spec path: `docs/specs/import-export/partner-profile-onboarding/`
- Traces: `requirements.md` FR-1…FR-11 / NFR-1…NFR-9 · `design.md` §1…§14
- Depth: **Full** · Budget (`design.md` §13): **12 tasks · ~900 code LOC · ~1,250 doc lines · ~18 review rounds**
- Status boxes: `[ ]` not started · `[~]` in progress/halted (see `execution.md`) · `[x]` complete & Reviewer PASS

> **Two artifact classes, two verification regimes.** Code tasks (T-1…T-6, T-11) have runnable gates. Document tasks (T-7…T-10, T-12) mostly do **not** — their verification is arithmetic plus human review, and each says so. A document task reporting "gates green" as evidence of correctness is reporting evidence it does not have (KZ-002); the Reviewer MUST reject that.

> **Read `design.md` §12.1 before starting any task.** Six properties have **no gate in this repository**: right-canonical-column mapping, sheet trader-type correctness, QDS hand-classification, district→region *correctness*, public invisibility at scale, and key determinism across runs. Do not claim any of them from a green run.

---

## Phase A — Pure normalizers (no dependencies)

- [x] **T-1** Add `normalizePhone()` to `common/normalize.ts`  (deps: none)
      **Scope:** One exported pure function. Handles the six measured formats — bare 9-digit local, leading-zero national, country-prefixed with internal spaces, parenthesized country code, landline with internal spaces, and a `/`-separated multi-number cell. Returns canonical `+255…` E.164 **or `null`**, plus a **count** of additional numbers found. No Nest, no Prisma, no I/O. **Does not** wire into the import pipeline — that is T-3.
      **Traces:** FR-5 (all clauses) · `design.md` §4.1, DD-3, NFR-4, NFR-5, NFR-6
      **Files:** `backend/src/common/normalize.ts`, `backend/src/common/normalize.spec.ts`
      **Verify:** `cd backend && npm test -- normalize`
      **Done when:** table-driven cases cover every measured format; a `/`-separated cell returns the **first** number plus count ≥ 1; unrecognisable non-empty input returns `null` (never a partial string); the function's import graph contains no framework or I/O module.
      **Evidence is DISQUALIFIED if:** any test asserts only that the function *exists* or that a return is non-null (KZ-002 — assert the exact normalized string per input); **any test fixture or assertion message contains a real phone number** from the client workbook (NFR-9 — use synthetic digits); or the tests pass while a format from `requirements.md` FR-5 has no case. A green run with fewer than six format groups covered is **not** evidence.
      **Skills:** `tdd` (logic-heavy, Leader-assigned), `systematic-debugging` if a case fights back

- [x] **T-2** Add `DISTRICT_TO_REGION` to `common/normalize.ts`  (deps: none)
      **Scope:** A closed lookup covering the **28 real district values** measured as needing derivation (corrected at execution from the design's estimate of 29 — see `design.md` §4.2 "Count correction"; the qualifying rows are those whose `region` is **blank**). Constant + membership test only. **Excludes** the 10 contaminated values that occupy the district position but hold company/person names — those belong to the register (DD-5), not the lookup. Does **not** change `normalizeRegion` and is **not** consumed by the importer (DD-1).
      **Traces:** FR-3 · `design.md` §4.2, DD-1, NFR-4
      **Files:** `backend/src/common/normalize.ts`, `backend/src/common/normalize.spec.ts`
      **Verify:** `cd backend && npm test -- normalize`
      **Done when:** every value in the map is a member of `CANONICAL_REGIONS` (asserted, not eyeballed); the map has exactly the districts `mapping.md` will publish; `normalizeRegion`'s existing behavior is untouched — ambiguous values like `"Arusha/Dodoma"` still quarantine.
      **Evidence is DISQUALIFIED if:** the membership test is presented as proof the pairings are **correct**. It is not — `Mbozi → Mbeya` is a valid canonical region and the wrong answer (`requirements.md` §9 **D-1b**, no gate). State that limitation in the task report. Also disqualified if a district whose region you were unsure of was included rather than **omitted** so its rows quarantine.
      **Skills:** none beyond repo conventions

---

## Phase B — Import pipeline (depends on Phase A)

- [x] **T-3** Wire phone normalization into the import row pipeline  (deps: T-1)
      **Scope:** Call `normalizePhone()` where the importer currently stores `phone` verbatim (`actor-import.service.ts:531`). Implement the **specified `null` branch**: row is **created**, `phone` written as `null`, and a **warning** raised naming the column. Multi-number cells raise a warning carrying the **count/position only**. No other Actor field receives a second number.
      **Traces:** FR-5 (`null` branch, no-silent-loss, no-PII-in-warning, no-second-field) · `design.md` §4.1, DD-3, §10.1 **F-1**
      **Files:** `backend/src/actors/actor-import.service.ts`, `backend/src/actors/actor-import.service.spec.ts`
      **Verify:** `cd backend && npm test -- import`
      **Done when:** a non-empty unnormalizable cell yields a **created** row with `phone === null` **and** a warning; a `/`-separated cell yields the first number plus a warning; no warning text contains any digit sequence from the input; existing import tests stay green **without edits**.
      **Evidence is DISQUALIFIED if:** the row is *failed* instead of created (FR-5 forbids rejecting an organisation over an unusable phone); the raw string is stored as a fallback; a warning message embeds the discarded digits; or an existing test was edited to accommodate the change (NFR-3 — that is the signal you changed a contract, not a value). **This task narrows shipped behavior (F-1)** — say so explicitly in the report rather than describing the change as purely additive.
      **Skills:** `nestjs-expert`, `tdd`, `error-handling-patterns`

- [x] **T-4** Add the per-reason breakdown to the import report  (deps: none)
      **Scope:** One **additive optional** field on `ImportReport`. Reason vocabulary closed to three sources: the failing column's `field`, the `skipped-*` outcomes, and `_row` mapped to the explicit slug `batch-rolled-back`. **One reason per row**, selected by sorting the row's errors on each field's index in `TEMPLATE_COLUMNS` and taking the first (`errors[0]` is **not** correct — `validateRow` pushes `region` before `traderType` while the template orders Trader Type first). Deterministic ordering: count descending, then reason ascending.
      **Traces:** FR-7 (all clauses) · `design.md` §3, §4.3, DD-4, NFR-3, NFR-6, NFR-7, NFR-8
      **Files:** `backend/src/actors/actor-import.types.ts`, `backend/src/actors/actor-import.service.ts`, `backend/src/actors/actor-import.service.spec.ts`
      **Verify:** `cd backend && npm test -- import && npm run build`
      **Done when:** the breakdown's counts **sum to `failed + skipped` exactly** on a mixed fixture; ordering is stable across two runs on identical input; `_row` surfaces as `batch-rolled-back` and never as a column name; every pre-existing field of `ImportReport` / `ImportReportTotals` / `ImportRowResult` keeps its name, type, and optionality.
      **Evidence is DISQUALIFIED if:** the sum invariant is asserted on a fixture with no multi-error row (that is the case the one-reason-per-row rule exists for — a single-error fixture cannot distinguish a correct implementation from `errors[0]`); any existing test needed editing; or a reason slug can carry a value rather than a field/outcome name.
      **Skills:** `nestjs-expert`, `api-design-principles`, `error-handling-patterns`, `tdd`

- [x] **T-5** Mirror the breakdown in the frontend and render it in the preview branch  (deps: T-4)
      **Scope:** Mirror the additive field in `lib/api/actors-admin.ts` with **exact** optionality and union. Render the breakdown in the **preview** branch of `import/page.tsx`, beside `TotalsChips`, inside a `role="status" aria-live="polite"` region. `ImportPreviewTable.tsx` is **not** the home — it takes only `{ rows }` and contains no live region.
      **Traces:** FR-7 (FE clauses) · `design.md` §5, §6, R-6
      **Files:** `frontend/lib/api/actors-admin.ts`, `frontend/app/(admin)/admin/actors/import/page.tsx`, and that page's test
      **Verify:** `cd frontend && npm test -- import && npm run lint && npx tsc --noEmit`
      **Done when:** the type matches the backend field character-for-character in optionality and union members; the breakdown renders after a preview; it sits inside a live region; only semantic token classes are used.
      **Evidence is DISQUALIFIED if:** the union was widened to `string` or optionality flipped to make types compile (this has FAILed review here before); the assertion checks only that the element **renders** without checking the announced region (`jest-axe` cannot evaluate whether a live region actually announces — say so); or any hex, `rgb()`, or arbitrary `bg-[#…]` value appears. `npm test` passing while `npx tsc --noEmit` was never run is **not** evidence — the frontend Jest transform does no type checking.
      **Skills:** `vercel-react-best-practices`, `react-doctor` (run before reporting), `tailwind-design-system`, `shadcn-ui`

- [x] **T-6** Add the download location to the stale-template message  (deps: none)
      **Scope:** Text only. Append where to obtain the current template. Detection logic (`detectTemplateVersion`) and the 400 envelope are untouched.
      **Traces:** FR-11 · `design.md` §4.4
      **Files:** `backend/src/actors/actor-import.service.ts`, `backend/src/actors/actor-import.service.spec.ts`
      **Verify:** `cd backend && npm test -- import`
      **Done when:** the message contains the detected version, the current version, **and the download location**; the substrings `out of date` and `re-download` both remain present.
      **Evidence is DISQUALIFIED if:** the assertion only re-checks "names both versions" — **that is already green with zero code change** (`actor-import.service.spec.ts:195`, `admin-actor-import.e2e.spec.ts:990`), so it proves nothing about this task. Assert the **new** element specifically. Also disqualified if either existing assertion had to be edited (NFR-3).
      **Skills:** none beyond repo conventions

---

## Phase C — Mapping specification (the load-bearing deliverable)

> Split into two tasks deliberately, pre-empting `design.md` §13's watch item. Each must follow the **§4.5 required structure** exactly.

- [ ] **T-7** `mapping.md` — structure + the three offtaker sheets  (deps: T-2) — ⛔ **BLOCKED: source workbook not in the checkout** (see `execution.md`). No complete column inventory exists in the spec either, so the per-column dispositions cannot be authored without fabricating ~30 column names — which FR-1's arithmetic gate (D-5) would pass. **T-8, T-9, T-10 are transitively blocked.**
      **Scope:** The document skeleton per `design.md` §4.5, the published district→region table (sourced from `DISTRICT_TO_REGION`), plus complete per-column dispositions for `Offtaker_Beans` (16 cols), `Offtaker_Sorghum` (13), `Offtaker_Groundnuts` (13). **Column-driven** trader types. Records: the 52-blank-id positional keys, the 2 intra-sheet duplicate ids, the `"Retaler"` quarantine decision (no alias), the 4 phone-in-trader-type-column rows, `Offtaker_Beans.Email` as **`EMPTY-IN-SOURCE`**, and the contaminated tail register (`Offtaker_Sorghum` 110–116, `Offtaker_Groundnuts` 147–151) **by row number only**. Adds the **doc↔constant test** asserting the published table matches the constant.
      **Traces:** FR-1 (all clauses + both scenarios) · FR-2 (blank ids, intra-sheet dups, physical row numbers, no-reuse/no-renumber) · FR-3 (OFG derivation, no placeholder) · FR-4 (column-driven, `"Retaler"`, phone-in-type rows, never feed raw values to `normalizeTraderType`) · NFR-9 · `design.md` §4.2, §4.5, DD-2, DD-5, DD-9
      **Files:** `docs/specs/import-export/partner-profile-onboarding/mapping.md`, `backend/src/common/normalize.spec.ts` (doc↔constant assertion)
      **Verify:** `cd backend && npm test -- normalize` (doc↔constant) **+** per-sheet column-count arithmetic against `requirements.md` §3.1 **+** the NFR-9 grep gate from `requirements.md` §9 D-7
      **Done when:** each sheet's dispositions **sum to its measured column count**; every column carries exactly one of the four dispositions; header row and first data row are recorded per sheet; the doc↔constant test passes; the grep gate returns clean.
      **Evidence is DISQUALIFIED if:** the column counts sum correctly but a column's **target** was never checked against the source semantics — arithmetic closure is not mapping correctness (`requirements.md` §9 **D-6**, no gate). The report MUST state which sheets received a cell-by-cell trace and how many rows. Also disqualified if any organisation-name-bearing contaminated row is identified by **name** rather than row number, or if any real phone/email/person name appears anywhere in the file.
      **Skills:** `cognitive-doc-design`, `product-manager-toolkit`

- [ ] **T-8** `mapping.md` — the five remaining sheets  (deps: T-7)
      **Scope:** Complete per-column dispositions for `Bulk buyers_beans` (17 cols), `Humantarian` (9), `Digital Service Provider` (9), `Seed Company` (26), `QDS_ Seed producers` (41+). Records: the BBB **forward-fill** rule collapsing 166 rows → 26; positional keys for all five sheets; sheet-level trader types; `HUM`/`DSP` `Category` as **`DROPPED`** with measured resolve rates; `DSP.Website` and the 7 empty `Seed Company` columns as **`EMPTY-IN-SOURCE`**; the 3 foreign DSP exclusions (**D-3**); the 8 region-less BBB quarantines; **all 11 `Seed Company` quarantines** (DD-11); the QDS rules — exclude 249 individuals, exclude rows 289–312, case-insensitive name dedup, blank-category quarantine, DMS coordinates blanked; and the `…AMCOs`/OQ-4 flag.
      **Traces:** FR-1 (both scenarios) · FR-2 (five positional-key sheets) · FR-3 (HUM ambiguous, foreign exclusion, BBB and SDC quarantines, no reverse-geocode) · FR-4 (sheet-level, `Category` dropped) · FR-10 (all clauses + DMS scenario) · NFR-9 · `design.md` DD-2, DD-6, DD-7, DD-10, DD-11
      **Files:** `docs/specs/import-export/partner-profile-onboarding/mapping.md`
      **Verify:** per-sheet column-count arithmetic against `requirements.md` §3.1 **+** the NFR-9 grep gate — **no automated gate for correctness**
      **Done when:** all five sheets' dispositions sum to their measured column counts; the forward-fill rule is stated and yields 26; every exclusion and quarantine above is recorded with its reason; the QDS `cbo` hand-classification is recorded **by row number only**; OQ-4 is flagged, not silently settled.
      **Evidence is DISQUALIFIED if:** any QDS individual or `cbo` entry is named, initialled, or partially identified (NFR-9 — this spec already remediated that breach once); the QDS exclusion is reported as a count without the row range; or "gates green" is offered at all — **this task has no correctness gate**, only arithmetic and the grep. Report the arithmetic and the human review, and say plainly what is unverified.
      **Skills:** `cognitive-doc-design`, `product-manager-toolkit`

---

## Phase D — Operational documents & verification

- [ ] **T-9** Author the re-run runbook  (deps: T-7, T-8)
      **Scope:** A standalone runbook the AT team can follow unaided, carrying all **five MUST clauses** of `design.md` §4.6: preview-per-sheet-before-commit (and that preview writes nothing); the measured upload bounds with one upload per sheet; re-download the `v2` template; the **operator post-commit public-invisibility check**; and **never set `consentStatus` to `GRANTED`**. States the correct endpoint `POST /api/v1/admin/actors/import`.
      **Traces:** FR-9 (all five clauses) · FR-6 (operator check) · NFR-2 · `design.md` §4.6, §7.1, DD-8, R-8
      **Files:** `docs/specs/import-export/partner-profile-onboarding/runbook.md`
      **Verify:** clause-by-clause checklist against `design.md` §4.6 — **manual review only**
      **Done when:** all five clauses are present and unambiguous; the endpoint path is the Admin-guarded one; the post-commit check names the three real public paths (`/actors`, `/actors/:id`, `/metrics`) and no others.
      **Evidence is DISQUALIFIED if:** the runbook names `/actors/geo` or `/export` (**neither exists** — this exact error was caught in judgment as C-2 and in chunk 1 before that); it instructs anyone to set `GRANTED`; or it describes the post-commit check as automated. A runbook that a competent AT member cannot execute without reading this spec has not met FR-9.
      **Skills:** `cognitive-doc-design`

- [ ] **T-10** `reconciliation.md` — skeleton with expected counts  (deps: T-7, T-8)
      **Scope:** The reconciliation structure with **expected** figures pre-filled from `design.md` §9.1 (806 candidates → ~748 net) and actuals left blank for the onboarding run. Per `requirements.md` FR-8's stated reading: per-sheet totals per bucket **plus explicit enumeration by row number** of every `quarantined` and `excluded` row. Includes the cross-sheet duplicate-candidate list (8 groups / 18 records, by organisation name and row), the 249 QDS individual exclusions and 3 foreign exclusions **as decisions citing D-1 and D-3**, a slot for the ≥5-row-per-sheet cell-by-cell trace, and a slot for the operator post-commit check result.
      **Traces:** FR-8 (all clauses) · FR-6 · FR-10 (exclusions recorded) · NFR-2, NFR-9 · `design.md` §9.1, DD-6, DD-7, §7.1
      **Files:** `docs/specs/import-export/partner-profile-onboarding/reconciliation.md`
      **Verify:** arithmetic — each sheet's four bucket counts sum to its **measured physical data-row count** in `requirements.md` §3.1 (1,237 total)
      **Done when:** every sheet's buckets reconcile; expected vs actual columns both exist; the duplicate-candidate list is present; both exclusion classes cite their decision ID; the trace and operator-check slots exist.
      **Evidence is DISQUALIFIED if:** a bare success count appears without the quarantined and excluded tallies beside it (that is the exact failure R-3 exists to prevent); any **individual** producer name appears (organisation names are permitted, individual names are not — NFR-9); or the arithmetic is reported as "checked" without the per-sheet sums shown.
      **Skills:** `cognitive-doc-design`

- [x] **T-11** Worked-example fixture + preview assertions, and the PII release gate  (deps: T-3, T-4, T-7) — ✅ **completed out of declared dependency order, user-approved.** T-3/T-4 were `[x]`; **T-7 was not**, being blocked on the source workbook. The `T-7 → T-11` edge proved nominal as assessed: the fixture is built from `TEMPLATE_COLUMNS` (the importer accepts no other shape), and T-11's five dirt classes are enumerated in its own scope and `requirements.md` §3.1, not derived from `mapping.md`. **No mapping decision was invented** — verified independently by the conformance Reviewer. PASS on attempt 3 of 3; three lens Reviewers, six FAIL findings closed. See `execution.md`
      **Scope:** A **PII-scrubbed** fixture template reproducing one real sheet's *structure* — dirty districts, a contaminated row, an unnormalizable phone, a duplicate key, a blank required field — driven through the e2e harness in `mode: 'preview'`, asserting expected per-row outcomes and the reason breakdown. Plus confirmation that `pii-boundary.spec.ts` is green (NFR-1 release gate) and an idempotency assertion for FR-2's re-run clause.
      **Traces:** FR-2 (idempotent re-run scenario) · FR-3 (district-rescue scenario, quarantine on absent district) · FR-5 · FR-7 · NFR-1 · `design.md` §12, R-1 substitute 2
      **Files:** `backend/src/test/` (fixture + spec), reusing the `admin-actors-crud.e2e.spec.ts` harness pattern
      **Verify:** `cd backend && npm test -- pii-boundary && npm test -- import`
      **Done when:** the fixture exercises at least five distinct outcome classes; preview writes nothing (asserted, not assumed); a second identical run yields zero creates; `pii-boundary.spec.ts` is green.
      **Evidence is DISQUALIFIED if:** the fixture contains **any real value** from the client workbook — names, phones, emails (NFR-9: structure only, synthetic values); the pass is claimed for FR-6's **at-scale** clause (this suite mocks the database and **cannot** observe onboarded records — `design.md` §7.1; that clause is discharged by T-9's operator check, not here); or preview is asserted to write nothing by inspecting the report rather than the database mock.
      **Skills:** `nestjs-expert`, `tdd`, `systematic-debugging`

- [x] **T-12** Add the TRD clarifying note  (deps: none)
      **Scope:** A short note in `docs/trd/trd.md` §3 distinguishing the **canonical import template** (which the CSV-header→field table describes) from **this client workbook** (which it does not). No section renumbering, no ADR change.
      **Traces:** `requirements.md` §8 (TRD clarification)
      **Files:** `docs/trd/trd.md`
      **Verify:** read-back — the note is present in §3 and no other section changed
      **Done when:** §3 states the table governs the canonical template, and that source workbooks are mapped onto it per their own spec.
      **Evidence is DISQUALIFIED if:** any existing `§n` heading number changed (archived specs cite them — ADR-009), or an accepted ADR was edited in place.
      **Skills:** `software-architect`

---

## Dependency Graph

```
T-1 ─► T-3 ─┐
            ├─► T-11
T-4 ────────┤
     └─► T-5│
T-2 ─► T-7 ─┼─► T-8 ─┬─► T-9
            │        └─► T-10
T-6         │
T-12        └─► (T-7 also feeds T-11)
```

Edges: `T-1→T-3` · `T-2→T-7` · `T-3→T-11` · `T-4→T-5` · `T-4→T-11` · `T-7→T-8` · `T-7→T-11` · `T-8→T-9` · `T-8→T-10`
No dependencies: **T-1, T-2, T-4, T-6, T-12** (eligible immediately). No cycles.

**Recommended first task: T-1** — pure, self-contained, no dependencies, and it unblocks the pipeline chain. T-2, T-4, T-6, and T-12 can run in parallel with it.

---

## Coverage closure — clause level, not ID level (KZ-001)

Chunk 1 shipped three requirement scenarios owned by no task because decomposition was validated against requirement **IDs**. This table is keyed on **clauses and scenarios**. A gap here may **not** be discharged by citing a different requirement that happens to be satisfied.

| Requirement | Clause / scenario | Owner |
|---|---|---|
| **FR-1** | Four dispositions incl. `EMPTY-IN-SOURCE` | T-7, T-8 |
| | Dispositions sum to column count (gate D-5) | T-7, T-8 |
| | Header row + first data row per sheet (BBB=3, SDC data=3) | T-7, T-8 |
| | `BUT NOT` leave any column implicit | T-7, T-8 |
| | *Scenario:* BBB forward-fill → 26, year rows dropped | T-8 |
| | *Scenario:* `EMPTY-IN-SOURCE` ≠ `DROPPED` (Beans.Email) | T-7 |
| **FR-2** | Zero collisions across the onboarding | T-7, T-8, T-11 |
| | Positional keys for 52 blank + 2 intra-sheet dups | T-7 |
| | Positional keys for the 5 id-less sheets | T-8 |
| | Physical source row number in the key | T-7, T-8 |
| | `BUT NOT` reuse an earlier id / renumber rows | T-7, T-8 |
| | *Scenario:* idempotent re-run → zero creates | T-11 |
| **FR-3** | OFG region derived from district | T-7 |
| | Absent district → quarantine on `region` | T-2, T-11 |
| | 4 ambiguous HUM locations quarantine | T-8 |
| | Exclude 3 foreign DSP actors (D-3) | T-8 |
| | Quarantine 8 region-less BBB orgs | T-8 |
| | **Quarantine all 11 `Seed Company` orgs (DD-11)** | T-8 |
| | `BUT NOT` placeholder / nearest-neighbour / most-frequent region | T-2, T-7, T-8 |
| | `BUT NOT` reverse-geocode GPS to a region | T-8 |
| | *Scenario:* district rescues a region-less record | T-11 |
| **FR-4** | Column-driven for OFB/OFS/OFG | T-7 |
| | Sheet-level for BBB/HUM/DSP/SDC/QDS | T-8 |
| | 11 `"Retaler"` rows — decision recorded (quarantine, no alias) | T-7 |
| | 4 phone-in-trader-type rows flagged as column-shifted | T-7 |
| | HUM/DSP `Category` recorded `DROPPED` with resolve rates | T-8 |
| | `BUT NOT` feed raw category text to `normalizeTraderType` | T-7, T-8 |
| **FR-5** | All six measured phone formats | T-1 |
| | Multi-number → first + count + warning | T-1, T-3 |
| | **`null` branch: row created, phone null, warning** | T-3 |
| | `BUT NOT` invent a country code | T-1 |
| | `BUT NOT` write a second number to another field | T-3 |
| | No phone value in any warning text | T-1, T-3 |
| **FR-6** | Zero onboarded actors on the 3 real public paths | T-9 (check), T-10 (record) |
| | `gps` null for non-`GRANTED` | T-11 |
| | Asserted over HTTP (operator-run; no automated gate) | T-9, T-10 |
| | `BUT NOT` serializer-only — consent pinned in `WHERE` | T-11 |
| **FR-7** | Breakdown sums to `failed + skipped` | T-4 |
| | Deterministic ordering | T-4 |
| | `_row` → `batch-rolled-back` | T-4 |
| | Purely additive — existing fields unchanged | T-4 |
| | `BUT NOT` PII in a key or message | T-4 |
| | FE exact mirror + `aria-live` | T-5 |
| **FR-8** | Four buckets, per-sheet reconciliation to 1,237 | T-10 |
| | Expected (~748) vs actual, difference explained | T-10 |
| | Cross-sheet duplicate candidates listed | T-10 |
| | 249 individuals + 3 foreign recorded as decisions (D-1, D-3) | T-10 |
| | `BUT NOT` bare success count | T-10 |
| **FR-9** | All five runbook MUST clauses | T-9 |
| | `BUT NOT` instruct setting `GRANTED` | T-9 |
| **FR-10** | Exclude 249 individuals | T-8 |
| | Exclude rows 289–312 (seed-source vocabulary) | T-8 |
| | Case-insensitive name dedup | T-8 |
| | Hand-classify `cbo` block, **by row number only** | T-8 |
| | Quarantine blank `producer_category` | T-8 |
| | `BUT NOT` import season/variety/harvest/buyer columns | T-8 |
| | *Scenario:* DMS coordinates blanked, actor still imports | T-8, T-11 |
| **FR-11** | Message names both versions **+ download location** | T-6 |
| | `BUT NOT` change detection logic or envelope | T-6 |
| **NFR-1** | `pii-boundary.spec.ts` green | T-11 |
| **NFR-2** | Invisibility at scale (operator check; no gate) | T-9, T-10 |
| **NFR-3** | Additive only; no test edited to accommodate | T-3, T-4, T-5, T-6 |
| **NFR-4** | New constants in `normalize.ts`, single source | T-1, T-2 |
| **NFR-5** | Purity — no Nest/Prisma/IO | T-1, T-2 |
| **NFR-6** | Normalizer + ordering determinism | T-1, T-4 |
| | Key determinism (**no gate** — `design.md` §12.1) | T-7, T-8 (stated, unverified) |
| **NFR-7** | Audit rows in the same `$transaction` | T-4 |
| **NFR-8** | No partial corruption | T-4 |
| **NFR-9** | No real PII in any committed file | T-7, T-8, T-10, T-11 + grep gate |

**Every clause above has a named owner.** Two are owned *and* explicitly marked unverifiable (FR-6's at-scale clause, NFR-6's key determinism) — owned by a human step, not by a gate. That is the honest state, not a gap.

---

## Testing & Verification Expectations

- Every task carries a runnable `Verify` **or** an explicit statement that no automated gate exists. The Implementer runs it before reporting.
- Prefer the smallest verifying command over a full-suite run.
- **Backend lint must be the non-mutating form:** `npx eslint "{src,test}/**/*.ts" --quiet`. `npm run lint` runs `eslint --fix` and **mutates files** — never use it to verify a diff under review.
- **Frontend types need `npx tsc --noEmit`.** The Jest transform (SWC) does no type checking, so a green `npm test` says nothing about type fidelity.
- **A presence-assertion is not a behavioral proof (KZ-002).** Any test asserting a class, config entry, or attribute *exists* must record what it cannot prove. Properties the harness structurally cannot evaluate — contrast under jsdom, whether a live region announces, whether a mapping is semantically right — are **not covered** and must be routed to a human or T6 check, never counted as verified.
- **Inconclusive is a legitimate outcome.** If a measurement varies more than the effect it measures, report the spread instead of committing a number.

## Execution Conventions

- Commits: `[SPEC:import-export/partner-profile-onboarding] <message>`.
- **Evidence before checkbox:** append the `execution.md` entry with the Reviewer's PASS **first**, then flip `tasks.md` to `[x]`, then commit.
- The Leader maintains `execution.md` — one entry per loop iteration (PASS/FAIL, files, verification evidence).
- No task introduces a new PII field. `phone` is already declared in `common/pii-consent.policy.ts`; normalizing it does not change its classification.
- No AWS action is required by this spec. Any that arises MUST use `--profile IBD-DEV`.
- **Budget tripwire (`design.md` §13):** 12 tasks · ~900 code LOC · ~1,250 doc lines · ~18 review rounds. Exceeding it means **stop and escalate to the user**, not continue quietly.
