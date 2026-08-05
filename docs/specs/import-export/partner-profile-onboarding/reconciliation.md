# Reconciliation Report — Partner Profile Onboarding (T-10 skeleton)

**Status: skeleton.** `Expected` columns are pre-filled from `design.md` §9.1 and `mapping.md` §3–§4. `Actual` columns are blank — the operator fills them in while running the onboarding, sheet by sheet, and this document becomes the completed reconciliation FR-8 requires.

**What this answers:** are all 1,237 physical source rows accounted for, and did nothing from this onboarding reach the public site? §2–§4 answer the first; §8 answers the second.

**Public read surface at commit time:** exactly `/actors`, `/actors/:id`, `/metrics`. No `geo` route and no `export` route exist in `backend/src` (`design.md` §7.1).

---

## 1. How to read this document

- **Four buckets, per FR-8:** `imported`, `collapsed-into-block`, `quarantined (reason)`, `excluded (reason)`. Every physical data row of every sheet falls into exactly one.
- **"Every row accounted for" does not mean 1,237 line items.** Per FR-8's clarification (Judgment Day C-13): `imported` and `collapsed-into-block` are reported as **counts only** — a list of 751 successes adds no auditable information. Every row that did **not** import is **individually named by physical row number**. §4 does that naming.
- **Units matter.** Some figures in this spec are physical-row counts, others are distinct-name counts after dedup. §5 states, for every figure that could be misread, which unit it is in.
- **NFR-9.** Organisation names are permitted (DD-7 requires them for the duplicate-candidate list). **Individual producer names are never permitted anywhere in this document** — QDS individuals and hand-classified personal names are identified by physical row number only, no name, no initials, no partial identifier.
- **Most of this document was built from `mapping.md` and `design.md` alone, both cited inline.** Three gaps in what those documents recorded — the OFS `"Retaler"` row numbers (§4.2), the DD-7 duplicate-candidate list (§6), and the QDS `individual`-category row range (§4.8) — required the source workbook, which this document's original scope excluded. The Leader granted access for exactly these measurements; all three are resolved below and flagged as **Findings** where a gap in a sibling document is the cause, since one of them (§6) also surfaced a discrepancy against the spec's own published estimate.

---

## 2. Grand totals — expected vs actual

| Bucket | Expected | Actual |
|---|--:|--:|
| `imported` | **751** | |
| `collapsed-into-block` | **143** | |
| `quarantined` | **50** | |
| `excluded` | **293** | |
| **Total (physical data rows)** | **1,237** | |

**Arithmetic, shown:** `751 + 143 + 50 + 293 = 1,237`. This equals `requirements.md` §3.1's measured physical-row total exactly. The per-sheet tables in §3 show the same sum closing sheet by sheet — this row is not an independent claim, it is those eight rows added together (§3's own total row).

**~806 pre-quarantine ceiling vs ~751 expected net (FR-8 acceptance criterion):** 806 is the candidate count after the structural candidacy decisions already made elsewhere in this spec (D-1's QDS organisation-only split, D-3's foreign exclusion, DD-6's tail exclusion) but before this document's own quarantine/exclusion decisions (`design.md` §9.1's stated convention). **The bridge, shown:** `806 − 50` (this document's `quarantined` bucket, §3) `− 5` (the QDS `cbo`-block personal-name exclusions, §4.8 — the one `excluded`-bucket reason not already netted out of 806, since D-1/D-3/DD-6's other exclusions are already subtracted before 806 by convention) `= 751`. **Any difference between 751 expected and the actual total below is explained in §9 once actuals are filled in** — that is the explicit content of FR-8's "explain any difference" clause.

---

## 3. Per-sheet bucket table (FR-8's core table)

Physical row counts are `requirements.md` §3.1's measured figures. Expected bucket values are derived from `design.md` §9.1 and `mapping.md` §3–§4, converted to **physical-row units** throughout (see the two unit traps noted under the table).

| Sheet | Physical rows (§3.1) | `imported` (exp.) | `collapsed` (exp.) | `quarantined` (exp.) | `excluded` (exp.) | Sum check | `imported` (act.) | `collapsed` (act.) | `quarantined` (act.) | `excluded` (act.) |
|---|--:|--:|--:|--:|--:|---|--:|--:|--:|--:|
| `Offtaker_Beans` (OFB) | 436 | 434 | 0 | 2 | 0 | 434+0+2+0 = 436 ✓ | | | | |
| `Offtaker_Sorghum` (OFS) | 115 | 97 | 0 | 18 | 0 | 97+0+18+0 = 115 ✓ | | | | |
| `Offtaker_Groundnuts` (OFG) | 150 | 145 | 0 | 5 | 0 | 145+0+5+0 = 150 ✓ | | | | |
| `Bulk buyers_beans` (BBB) | 166 | 18 | 140 | 8 | 0 | 18+140+8+0 = 166 ✓ | | | | |
| `Humantarian` (HUM) | 35 | 31 | 0 | 4 | 0 | 31+0+4+0 = 35 ✓ | | | | |
| `Digital Service Provider` (DSP) | 13 | 8 | 0 | 2 | 3 | 8+0+2+3 = 13 ✓ | | | | |
| `Seed Company` (SDC) | 11 | 0 | 0 | 11 | 0 | 0+0+11+0 = 11 ✓ | | | | |
| `QDS_ Seed producers` (QDS) | 311 | 18 | 3 | 0 | 290 | 18+3+0+290 = 311 ✓ | | | | |
| **Total** | **1,237** | **751** | **143** | **50** | **293** | **1,237 ✓** | | | | |

**Column-total cross-check, shown:** `imported` 434+97+145+18+31+8+0+18 = **751**. `collapsed-into-block` 0+0+0+140+0+0+0+3 = **143**. `quarantined` 2+18+5+8+4+2+11+0 = **50**. `excluded` 0+0+0+0+0+3+0+290 = **293**. Row sum and column sum both close at 1,237 — this is the "shown, not claimed" arithmetic the task brief requires.

**The two unit traps this table avoids, stated explicitly:**

1. **`Bulk buyers_beans` operates on 166 physical rows, not 26 organisations.** The sheet forward-fills 166 rows into 26 blocks (`mapping.md` §4.1); of those, 18 organisations have a resolvable region (`imported`) and 8 do not (`quarantined`, rows enumerated in §4.4). The other 140 physical rows are non-identity year-metric rows that never carried a region/district value of their own — they are `collapsed-into-block`, not `dropped` and not a fifth bucket. `18 + 140 + 8 = 166`.
2. **QDS's `excluded` column (290) is a physical-row figure, and it is not the "249" figure FR-8 also requires.** §5 below states both explicitly and in their own units — this table alone would be misread without it.

---

## 4. Row-by-row enumeration of every quarantined and excluded row (FR-8)

Per FR-8's clarification, only rows that did **not** import are named here. `imported` and `collapsed-into-block` rows are the count already shown in §3.

### 4.1 `Offtaker_Beans` (OFB) — quarantined 2, excluded 0

| Row | Bucket | Reason |
|--:|---|---|
| 425 | quarantined | `Region` value `"Arusha/Dodoma"` is ambiguous (two regions in one cell), refused by `normalizeRegion` |
| 436 | quarantined | `Trader Type` blank — required field |

Source: `mapping.md` §3.1.

### 4.2 `Offtaker_Sorghum` (OFS) — quarantined 18, excluded 0

| Row(s) | Bucket | Reason |
|---|---|---|
| 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17 | quarantined | `Trader type` = `"Retaler"` (typo) — 11 rows, quarantined rather than aliased (FR-4, OQ-3 decision) |
| 110, 111, 112, 113, 114, 115, 116 | quarantined | Contaminated tail (DD-5) — column-shifted: region-like value in `Trader name`, blank or unresolvable `Region`, an organisation/person name in the `District` position, a phone number in the `Town` position. Row 111 additionally carries a non-blank but unresolvable region value |

**F-1 resolved.** Measured directly from the source workbook (`Trader type` column, cell-by-cell over rows 2–116) under the Leader's grant of workbook access for this specific gap: **rows 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17** carry `"Retaler"` — exactly 11, matching `mapping.md` §3.2's count. **Disjointness check: pass.** None of these 11 rows overlap the 7-row contaminated tail (110–116) — the two sets are fully disjoint, so `design.md` §9.1's stated distinct quarantine count of `11 + 7 = 18` (correction C-5) holds exactly as measured; no pivot needed.

Source: `mapping.md` §3.2 (count); source workbook, `Offtaker_Sorghum` **physical spreadsheet column 7** (`Trader type`), rows 2–116 (row numbers, measured this session). This is `mapping.md` §3.2's disposition-table ordinal **6** — that table numbers only the sheet's 13 *named* columns starting at `Trader_ID` = 1, which is physical column 2, since physical column 1 is unnamed and 0% filled (§1.4's denominator rule) and is not assigned an ordinal. Physical index and `mapping.md`'s named-column ordinal are offset by exactly 1 throughout this sheet; both point at the same cell.

### 4.3 `Offtaker_Groundnuts` (OFG) — quarantined 5, excluded 0

| Row | Bucket | Reason |
|--:|---|---|
| 148 | quarantined | `Trader type` = `"Produce/Trader"` — free text, no defensible alias |
| 149 | quarantined | Contaminated tail (DD-5) — organisation name in `District`, person name in `Town`, phone number in `Trader type` |
| 150 | quarantined | Same pattern as 149 |
| 151 | quarantined | Same pattern as 149 |
| 152 | quarantined | Same pattern as 149 |

Source: `mapping.md` §3.3 (this task's own row-range correction, 149–152, superseding the earlier 147–151 figure — see `mapping.md` §6.2).

### 4.4 `Bulk buyers_beans` (BBB) — collapsed-into-block 140 (count only, not enumerated per FR-8), quarantined 8, excluded 0

| Row (identity row) | Bucket | Reason |
|--:|---|---|
| 154 | quarantined | Neither region nor district present on the identity row |
| 160 | quarantined | Same |
| 170 | quarantined | Same |
| 175 | quarantined | Same |
| 180 | quarantined | Same |
| 191 | quarantined | Same |
| 196 | quarantined | Same |
| 202 | quarantined | Same |

The 140 `collapsed-into-block` rows are the non-identity year-metric rows in each of the 26 blocks (block boundaries and forward-filled identity columns: `mapping.md` §4.1). They carry no region/district/name of their own and are reported as the single count in §3, per FR-8's explicit carve-out for this bucket.

Source: `mapping.md` §4.1.

### 4.5 `Humantarian` (HUM) — quarantined 4, excluded 0

| Row | Bucket | Reason |
|--:|---|---|
| 9 | quarantined | `Location` = `"Across Tz"` — not a single region, refused by `normalizeRegion` |
| 10 | quarantined | Same value, same reason |
| 31 | quarantined | `Location` = `"Iringa/Mbeya"` — multi-region value |
| 36 | quarantined | `Location` = `"Dodoma/Mara"` — multi-region value |

Source: `mapping.md` §4.2.

### 4.6 `Digital Service Provider` (DSP) — quarantined 2, excluded 3

| Row | Bucket | Reason |
|--:|---|---|
| 3 | quarantined | `Location` = `"West and South Tanzania "` — multi-region descriptive text, refused by `normalizeRegion` (same refusal class as HUM's `"Across Tz"`) |
| 4 | quarantined | Same value, same reason |
| 10 | excluded | Outside Tanzania — **decision D-3**, `"Nairobi Kenya"` |
| 12 | excluded | Outside Tanzania — **decision D-3**, `"Kampala Uganda"` |
| 15 | excluded | Outside Tanzania — **decision D-3**, `"Nairobi, Kenya."` |

Source: `mapping.md` §4.3. See §5 for D-3 cited as a decision.

### 4.7 `Seed Company` (SDC) — quarantined 11, excluded 0

| Row(s) | Bucket | Reason |
|---|---|---|
| 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 (all 11 data rows) | quarantined | **DD-11** — no region column and the named location column (`Where is the offtaker based(Town/District)`) is 0/11 filled; all 11 organisations quarantine pending an AT-team region pass |

Source: `mapping.md` §4.4. `mapping.md` §4.4 also reports an unnamed physical column (12) that reads as usable location text displaced from its own header — this does not change the quarantine disposition (DD-11 stands), only the AT team's cost to unblock it.

### 4.8 `QDS_ Seed producers` (QDS) — collapsed-into-block 3, quarantined 0, excluded 290

**Note on bucket choice for the 3 duplicate rows (settled — not open for relabelling).** FR-8's `collapsed-into-block` bucket was coined for `Bulk buyers_beans`'s forward-fill mechanic. QDS has no forward-fill, but its dedup rule (DD-6: case-insensitive, whitespace-trimmed producer name) collapses 3 physical rows into an already-counted actor the same way BBB's year-metric rows collapse into an already-counted block — in both cases several physical rows resolve into one actor that *does* land in the registry, which is exactly what separates `collapsed` from `excluded` (an excluded row's entity never enters the registry at all). The Leader has reviewed and upheld `collapsed-into-block` for these 3 rows; it is not open for relabelling. Two distinct mechanisms share the bucket, stated so no reader assumes it means only one thing: **`Bulk buyers_beans`** = forward-fill block collapse (§4.4); **QDS** = case-insensitive producer-name dedup under DD-6 (this section).

| Row(s) | Bucket | Reason |
|---|---|---|
| 19 | collapsed-into-block | Duplicate producer name (case-insensitive) of row 10 — dedup key collapses to row 10's actor. **Districts differ between rows 10 and 19** (`mapping.md` §4.5) — flagged there for AT-team resolution, not resolved by this document; carried forward here since this is what the program lead reads |
| 25 | collapsed-into-block | Exact duplicate (same name, same district) of row 21 — dedup key collapses to row 21's actor |
| 26 | collapsed-into-block | Duplicate of row 22 after whitespace-trim — dedup key collapses to row 22's actor |
| 2, 4, 8, 20, 23 | excluded | Hand-classified as a **personal name**, not a group/organisation name — excluded per **decision D-1**'s organisation-only rule (same rationale as the 261-row `individual`-category exclusion; row 23 independently corroborated by sharing its name with a row elsewhere on the sheet already labelled `individual`) |
| 289–300 (12 rows) | excluded | Research-institute name variants (≈3 real institutes under 8+ spellings) — not producers, **FR-10** |
| 301–312 (12 rows) | excluded | Repeats all 11 `Seed Company` sheet organisations verbatim (one relabelled `"Seed Agency"`) plus 1 additional row (312, blank `producer_category`) — not producers, **FR-10**. Importing this block would create duplicate actors for organisations already onboarded from their own sheet |
| **28–288 (261 rows)** | excluded | `producer_category` = `individual`/`individuals` — natural persons, excluded per **decision D-1** (§5) |

**The 261-row block is enumerated by row number, per FR-8.** Measured directly from the source workbook (`producer_category`, QDS rows 2–312) under the Leader's grant of workbook access for the two specific gaps this document had: the block is a single contiguous range, **rows 28–288**, confirming `requirements.md` §3.1's "sorted by category" holds exactly for this sheet (no non-contiguity finding). `producer_category` reads `individual` on 259 of these rows and `individuals` on 2 — both map to the same D-1 exclusion. This corrects an earlier draft of this section, which argued FR-8's "record as a decision citing D-1" clause (satisfied in §5) substituted for the enumeration clause instead of adding to it. FR-8's two acceptance-criteria clauses are additive, not alternatives: §5 still carries the required decision citation and the 261-vs-249 dual-unit statement: both are needed, and both are now present.

**Arithmetic for this sheet, shown:** `18` imported (23 distinct kept `cbo` names − 5 personal-name exclusions) + `3` collapsed + `0` quarantined + `290` excluded (`261` individual-category, rows 28–288 + `24` non-producer tail, rows 289–312 + `5` personal-name, rows 2/4/8/20/23) = **311**. `290 = 261 + 24 + 5`. Category-block sum check: `26` (`cbo`, rows 2–27) `+ 261` (`individual`/`individuals`, rows 28–288) `+ 24` (tail, rows 289–312) `= 311` ✓.

Source: `mapping.md` §4.5 (counts, dedup/personal-name rows); source workbook, `QDS_ Seed producers` column 2 (`producer_category`), rows 2–312 (the 28–288 range, measured this session).

---

## 5. QDS individual exclusions and DSP foreign exclusions, recorded as decisions (FR-8)

FR-8's acceptance criteria require these two exclusion classes to be recorded **as decisions citing D-1 and D-3**, not as bare tallies.

**Decision D-1 (`requirements.md` §4):** *"QDS: 249 of 292 producers are natural persons → Organisations only — measured at ~23 records. The 249 `individual` rows are excluded, as is the rows 289–312 seed-source block."* Rationale: the registry stays an organisation directory (PRD §1 framing) and avoids publishing named individuals alongside phone numbers and farm GPS.

**Decision D-3 (`requirements.md` §4):** *"3 DSP actors outside Tanzania → Excluded at mapping time, reason recorded as 'outside Tanzania — PRD §5'."* Rationale: keeps `region` honest so the region filter and map are not corrupted by a non-Tanzanian address.

**The 261-vs-249 dual unit, stated plainly (the arithmetic that gates this task's own verification):**

| Figure | Unit | What it counts |
|---|---|---|
| **261** | Physical rows | Every QDS physical data row whose `producer_category` cell reads `individual` or `individuals` (`mapping.md` §4.5's selection-rule table). This is the unit `requirements.md` §3.1's physical-row denominator uses, and the unit this document's §3/§4 buckets use throughout |
| **249** | Distinct producer names | The same 261 rows, collapsed under DD-6's case-insensitive, whitespace-trimmed dedup rule (12 collapses: 261 → 249). This is the unit `requirements.md` FR-10 and §3.1 cite, and the unit FR-8's acceptance criterion asks this section to record as a decision |

Both are correct, in their own units. `mapping.md` §4.5 states the reconciliation directly: *"261 physical rows collapsing to 249 distinct names (12 collapses) is consistent with the sheet-wide 311 physical rows → 292 distinct names total... `reconciliation.md` uses 261 for its row-level accounting; FR-10's 249 is the same set counted by name — the two figures are not in conflict."*

**Separately, 5 more physical rows** (2, 4, 8, 20, 23 — inside the `cbo` block, not inside the 261/249 `individual`-category set) are hand-classified personal names, also excluded under D-1's rationale but **not part of the 249/261 figures** — see §4.8. They are additional, not double-counted.

---

## 6. Cross-sheet duplicate candidates (DD-7)

**`design.md` §9/DD-7 estimate: 8 groups, 18 records.** `design.md` DD-7 requires these listed **by organisation name and row** — organisation names are permitted (not PII); individual producer names are, and are excluded per DD-6/§5 above. A human decides; code never merges (DD-7).

**F-2 resolved by direct measurement, under the Leader's grant of workbook access for this specific gap — and the measured count does not match the estimate.** Matching was done by normalized organisation name (case/punctuation-insensitive, cross-sheet only) over every candidate-bearing sheet's name column: `Seed Company` (11 rows), `Bulk buyers_beans` (26 identity rows), `QDS_ Seed producers` (all 311 data rows, rows 2–312, both the live `cbo` block and the FR-10-excluded 289–312 tail, since a name repeated in an already-excluded row is still an auditable cross-sheet fact), `Humantarian` (35), `Digital Service Provider` (13). Region/district was pulled where available, organisation-level only, to corroborate a match — never phone, email, or a contact person's name.

**Measured: 11 confirmed groups, 24 records** — more than the design.md estimate. All 11 are the `Seed Company` ↔ `QDS` tail correspondence `mapping.md` §4.5 already describes in prose (*"Rows 301–312 repeat all 11 `Seed Company` sheet organisations verbatim"*) but had never itself enumerated name-by-name; 2 of the 11 also match a `Bulk buyers_beans` row, extending them to 3-sheet groups.

| # | Organisation (as it reads in each sheet) | Records (sheet, row) | Match confidence | Note |
|--:|---|---|---|---|
| 1 | BAYMAC | `Seed Company` r3 · `Bulk buyers_beans` r91 (region `Manyara`, district `Mbulu`) · `QDS` r304 (tail; region `Manyara`, district `Mbulu`) | **Exact name, region+district corroborated** | 3 sheets, 3 records |
| 2 | ROGIMWA AGRO Co.Ltd / Rogimwa Agri Company | `Seed Company` r13 · `Bulk buyers_beans` r5 (region `Mbeya`, district `Mbeya`) · `QDS` r310 (tail) | Near-exact name (shared root "Rogimwa") | 3 sheets, 3 records |
| 3 | Crop Bioscience Solutions | `Seed Company` r4 · `QDS` r306 (tail) | Exact | 2 sheets, 2 records |
| 4 | SUBA AGRO-TRADING & ENGINEERING Co. LTD / Suba Agro | `Seed Company` r5 · `QDS` r311 (tail) | Near-exact | 2 sheets, 2 records |
| 5 | ALLSEM | `Seed Company` r6 · `QDS` r303 (tail) | Exact | 2 sheets, 2 records |
| 6 | Meru Agro / MERU AGRO | `Seed Company` r7 · `QDS` r308 (tail) | Exact (case-fold) | 2 sheets, 2 records |
| 7 | Beula Seed Company & Consultancy Ltd / BEULA seed company | `Seed Company` r8 · `QDS` r305 (tail) | Near-exact | 2 sheets, 2 records |
| 8 | Agricultural Seed Agency | `Seed Company` r9 · `QDS` r301 (tail, `producer_category` = `"Seed Agency"` there) | Exact | 2 sheets, 2 records |
| 9 | East Africa Seed | `Seed Company` r10 · `QDS` r307 (tail) | Exact | 2 sheets, 2 records |
| 10 | Agri-seed / Agriseed | `Seed Company` r11 · `QDS` r302 (tail) | Near-exact (hyphen only) | 2 sheets, 2 records |
| 11 | Rieta AgroSciences Tanzania Limited | `Seed Company` r12 · `QDS` r309 (tail) | Exact | 2 sheets, 2 records |

**11 groups × 2 records + 2 groups' extra `Bulk buyers_beans` member = 22 + 2 = 24 records.**

**Which members are live candidates vs. already-excluded, stated so the human decision this list exists for is well-scoped:** every `QDS` member above sits inside the 289–312 tail, already `excluded` under FR-10 regardless of any merge decision (§4.8) — its presence here is audit corroboration, not an open question. The live question is between each pair's `Seed Company` member (currently `quarantined` pending DD-11's region pass, §4.7) and, for groups 1–2, its `Bulk buyers_beans` member (`imported` or `quarantined` per §4.4's region-resolution table — row 91 is `imported`, row 5 is not in the 8-row BBB quarantine list, so also `imported`). **Once `Seed Company`'s quarantine is lifted, groups 1 and 2 each risk two live actors for one real organisation** — this is exactly the case DD-7 exists for.

**2 further pairs found, lower confidence — not included in the count above:**

| Organisation | Records | Why lower confidence |
|---|---|---|
| Muungano AMCOs / Muungano Group | `Bulk buyers_beans` r202 (region/district both blank — this row is already in §4.4's 8-row BBB quarantine list) · `QDS` r7 (`cbo`, live candidate; region `Kagera`, district `Kikukuru`) | `"Muungano"` ("union/unity") is a generic Swahili word; no region/district on the `Bulk buyers_beans` side to corroborate or refute |
| Mavuno Product Farmers Ltd / MAVUNO | `Bulk buyers_beans` r104 (region `Kagera`, district `Karagwe & Kyerwa`) · `Humantarian` r21 (location `Kagera`) | `"Mavuno"` ("harvest") is also generic, but **both rows share the `Kagera` region** — noted as a plausibility signal, not a confirmed match |

**Finding — the design.md/DD-7 estimate of "8 groups, 18 records" undercounts against direct measurement.** The 11-group, 24-record figure above already exceeds the estimate using only the `Seed Company`↔`QDS`-tail correspondence `mapping.md` §4.5 had already described in prose — a fact that was measurable from that description alone, without opening the workbook, and this task's own predecessor apparently did not reconcile the two. Per this task's brief (*"if your measurement yields a different count... report the discrepancy as a finding — do not silently adopt either figure"*), this is reported for the Leader's adjudication. `design.md` §9/DD-7 is not edited by this task.

---

## 7. Cell-by-cell trace — ≥5 rows per sheet (`requirements.md` §9 substitute 2)

Traces **source row → committed preview output**, run during the actual onboarding preview — distinct from `mapping.md`'s already-completed source→mapping-document trace (`mapping.md` §7.1, which traced all rows for 5 of 8 sheets during T-8, but at the mapping-authoring stage, not against a live preview run).

| Sheet | Rows traced (≥5, or all if sheet has fewer) | Cell-by-cell match? | Notes |
|---|---|---|---|
| `Offtaker_Beans` | | | |
| `Offtaker_Sorghum` | | | |
| `Offtaker_Groundnuts` | | | |
| `Bulk buyers_beans` | | | |
| `Humantarian` | | | |
| `Digital Service Provider` | | | |
| `Seed Company` | | | |
| `QDS_ Seed producers` | | | |

---

## 8. Operator post-commit public-invisibility check (`design.md` §7.1, NFR-2)

**Required runbook step, not advisory** (`requirements.md` §9 substitute 5). Run once per sheet after that sheet's commit, using unauthenticated requests against the three read paths that exist: `/actors`, `/actors/:id`, `/metrics`. There is no `geo` route and no `export` route.

| Sheet | `GET /api/v1/actors` (search a distinctive onboarded `traderName`) | `GET /api/v1/actors/:id` (a known onboarded id) | `GET /api/v1/metrics` (vs. pre-commit baseline) | Result |
|---|---|---|---|---|
| `Offtaker_Beans` | Expected: not found | Expected: 404/not returned | Expected: unchanged | |
| `Offtaker_Sorghum` | Expected: not found | Expected: 404/not returned | Expected: unchanged | |
| `Offtaker_Groundnuts` | Expected: not found | Expected: 404/not returned | Expected: unchanged | |
| `Bulk buyers_beans` | Expected: not found | Expected: 404/not returned | Expected: unchanged | |
| `Humantarian` | Expected: not found | Expected: 404/not returned | Expected: unchanged | |
| `Digital Service Provider` | Expected: not found | Expected: 404/not returned | Expected: unchanged | |
| `Seed Company` | Expected: not found (0 actors imported this sheet — all 11 quarantine, DD-11) | n/a | Expected: unchanged | |
| `QDS_ Seed producers` | Expected: not found | Expected: 404/not returned | Expected: unchanged | |

**Honest limitation, carried from `design.md` §7.1:** this check is manual and operator-run. No automated gate in this repository can assert public invisibility over the real committed dataset — the only HTTP-level suite (`pii-boundary.spec.ts`) mocks `PrismaService` with in-memory fixtures and structurally cannot observe the onboarded dataset (defect class D-3b, `requirements.md` §9).

---

## 9. Once actuals are filled in

- [ ] Every sheet's four `Actual` bucket values (§3) sum to that sheet's physical row count.
- [ ] The grand `Actual` total (§2) equals 1,237.
- [ ] Any difference between the 751 expected net and the actual imported total is explained here (FR-8 acceptance criterion).
- [x] §6's duplicate-candidate table is completed and measured (11 groups / 24 records, exceeding the 8/18 estimate — see the Finding in §6 for the Leader's adjudication).
- [x] Finding F-1 (§4.2, the 11 `"Retaler"` row numbers) is resolved from the source workbook.
- [x] The QDS `individual`-category block (§4.8) is enumerated by row range (28–288, 261 rows, contiguous) — not left as a decision-only citation.
- [ ] §7's cell-by-cell trace is completed for all 8 sheets.
- [ ] §8's operator post-commit check is run and recorded for all 8 sheets.
- [ ] `src/test/pii-boundary.spec.ts` is green before and after commit-mode upload (NFR-1).

---

## Findings raised by this task (not fixed, per this task's scope — reported for the Leader)

- **F-1 — resolved.** `mapping.md` §3.2 counted the `Offtaker_Sorghum` `"Retaler"` quarantine (11 rows) but did not enumerate row numbers. Measured this session, under a specific Leader-granted workbook-access exception: rows 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17 — confirmed disjoint from the 7-row contaminated tail (110–116). No pivot needed; `design.md` §9.1's `11 + 7 = 18` stands as measured. See §4.2.
- **F-2 — resolved, and it surfaced a second, more consequential finding.** Neither `mapping.md` nor `design.md` had enumerated the DD-7 duplicate-candidate list by organisation name and row. Measured this session, same access grant: **11 confirmed groups / 24 records**, not the estimated 8/18 — the design.md/DD-7 estimate was never reconciled against `mapping.md` §4.5's own prose description of the `Seed Company`↔`QDS`-tail overlap, which alone accounts for 11 groups. Reported as a discrepancy, not silently adopted either way, per this task's brief. `design.md`/`mapping.md` are not edited by this task. See §6.
