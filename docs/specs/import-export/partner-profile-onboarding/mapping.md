# Mapping — Partner Profile Workbook → Canonical Import Template

- Spec path: `docs/specs/import-export/partner-profile-onboarding/`
- Traces: `requirements.md` FR-1, FR-2, FR-3, FR-4, FR-10, NFR-9 · `design.md` §4.2, §4.5, DD-2, DD-5, DD-6, DD-9, DD-10, DD-11
- Status: **All 8 sheets delivered.** T-7 the document skeleton (§1–§2) and the three offtaker sheets (§3.1–§3.3); T-8 the five remaining sheets (§4.1–§4.5).
- Source: `Partner Profile 14.4.2026.xlsx`, read in place from outside this repository. **Never copied in** (NFR-9). Every count below was re-measured directly from the workbook on **2026-08-04** using `exceljs`, independently of the counts already published in `requirements.md`/`design.md` — see §6 and §8 for the places that re-measurement disagreed with the published draft.

---

## 1. How to read this document

### 1.1 Disposition vocabulary (FR-1)

Every column of every sheet gets **exactly one** of these four labels. A column missing from its sheet's table is a defect in this document, not a silent drop.

| Disposition | Meaning |
|---|---|
| `MAPPED → <field>` | The source value is copied to the named canonical field. The *importer's* existing normalizer (`normalizeRegion`, `normalizePhone`, …) still runs on it — that is unrelated to this label |
| `DERIVED → <field> (rule)` | A **human** applies a stated rule to produce the value that goes in the template cell — it is not a literal copy of the source cell |
| `DROPPED (reason)` | Not carried into the template. The reason is stated so the drop reads as a decision, not an omission |
| `EMPTY-IN-SOURCE (present, no data)` | The column exists in the source but is 0% filled. Recording it as `DROPPED` would misrepresent the source (`requirements.md` FR-1) |

### 1.2 Key rule (D-2, DD-9)

Every row's `Trader ID` is `<PREFIX>-<sourceId>` when the sheet has an id column and that id is non-blank and unique within the sheet; otherwise `<PREFIX>-R<physicalRow>`, where `<physicalRow>` is the row number in the client's workbook (so a key always resolves back to a cell). Prefixes: `OFB` (Beans) · `OFS` (Sorghum) · `OFG` (Groundnuts). A source id is **never reused** and rows are **never renumbered** to close a gap.

### 1.3 Fixed template values (FR-6) — every row, every sheet

The AT team writes these into every row regardless of source content. They are not derived from anything in the workbook:

| Template column | Value |
|---|---|
| Consent Status | `UNKNOWN` |
| Registration Source | `TEAM_MANAGED` |
| Consent Method | `NOT_RECORDED` |
| Consent Obtained At / Consent Reference | left blank |

**Never write `GRANTED`.** Publication is a separate, consent-evidenced act (`design.md` §4.6 clause 5).

### 1.4 Column universe — named headers + unnamed columns with data (FR-1, D-5 denominator — added at the T-7 pivot, 2026-08-04)

A sheet's column count for the FR-1/D-5 arithmetic (§5, and each sheet's "Reconciliation" line) is **not** simply its named-header count. The rule, settled during the T-7 pivot (`execution.md` Finding 3) and now in `requirements.md` FR-1:

> Every column that carries a header name, **or** contains data in any data row, is part of the column universe and gets exactly one disposition. A column that is physically present but both unnamed and empty is recorded once as the sheet's physical extent and is **not** dispositioned.

This is why `Offtaker_Beans` below sums to **17**, not 16: physical column 2 carries no header but is 97% filled (§3.1). The other two sheets in this task, `Offtaker_Sorghum` and `Offtaker_Groundnuts`, have no unnamed data-bearing columns, so their denominator equals their named-column count (13 each) and neither disposition table below changed for this reason.

### 1.5 What this document cannot verify (KZ-002, `requirements.md` §9)

A green `npm test -- normalize` proves the district→region table matches the constant and that the normalizers format things correctly. It proves **nothing** about whether a column's *target* is the right one, whether a trader-type assignment is factually correct, or whether a district→region pairing is the right pairing. That gate is human review at the HITL approval step, sheet by sheet, before any commit-mode upload (`design.md` §11 R-1).

**Cell-by-cell trace performed for this task:** all **three** sheets in §3, traced in full — not spot-checked. `Offtaker_Beans`: all 436 data rows, every column, via per-column fill-count and value-frequency scripts. `Offtaker_Sorghum`: all 115 data rows, including a full raw dump of rows 100–116 to resolve the tail boundary. `Offtaker_Groundnuts`: all 150 data rows (151 physical rows, one blank), including a full raw dump of rows 145–152 to resolve the contaminated-row boundary (§6.2 — this is where the published row range changed). This exceeds the §9 substitute-2 minimum (≥5 rows per sheet); it is a full trace because the sheets are small enough that a full trace cost no more than a sample would have, and because §6 shows a 5-row sample would have missed both corrections below.

---

## 2. Published district → region lookup table (FR-3, `design.md` §4.2)

Sourced from `DISTRICT_TO_REGION` in `backend/src/common/normalize.ts`. **Not consumed by the importer** (DD-1) — it exists to be tested (`normalize.spec.ts`) and to be applied **by hand** at mapping time, only where a sheet has no `Region` column or the `Region` cell is blank. The table below is asserted byte-for-byte against the constant by the doc↔constant test added in this task (`normalize.spec.ts`, `describe('mapping.md ↔ DISTRICT_TO_REGION')`).

A district **not** in this table is not guessed at — the row quarantines on `region` (`actor-import.service.ts:422-427`). This table only ever *rescues* a row; it never blocks one that would otherwise pass.

<!-- DISTRICT_TO_REGION:TABLE:START -->
| District (lowercase key) | Region |
|---|---|
| bariadi | Simiyu |
| dodoma | Dodoma |
| kahama | Shinyanga |
| kahama town | Shinyanga |
| kakonko | Kigoma |
| kasulu | Kigoma |
| kibondo | Kigoma |
| kigoma | Kigoma |
| kishapu | Shinyanga |
| kongwa | Dodoma |
| masasi | Mtwara |
| masasi town | Mtwara |
| mbeya | Mbeya |
| mbeya city | Mbeya |
| mbozi | Songwe |
| misungwi | Mwanza |
| mlele | Katavi |
| momba | Songwe |
| mpanda | Katavi |
| mpanda town | Katavi |
| mtwara | Mtwara |
| nanyumbu | Mtwara |
| nyamagana | Mwanza |
| sengerema | Mwanza |
| singida | Singida |
| tabora | Tabora |
| temeke | Dar es Salaam |
| uvinza | Kigoma |
<!-- DISTRICT_TO_REGION:TABLE:END -->

**28 entries** — matches `design.md` §4.2's T-2 count correction.

> **Corroborating measurement (this task, not previously stated at this precision).** Of the two sheets that feed this table via a *blank*-region scan (`Offtaker_Sorghum`, `Offtaker_Groundnuts` — `Offtaker_Beans` has no blank Region cells at all, see §3.1), **`Offtaker_Sorghum` contributes zero real districts.** All 6 of its blank-`Region` rows (§3.2) hold a person or organisation name in the district position, not an actual district — they are part of the same contaminated tail register as the 7th row in that block (row 111), whose `Region` cell is non-blank but equally unresolvable (an organisation name, not a district or region). Every row in `Offtaker_Sorghum`'s tail quarantines on `region` regardless of this table. This corroborates, without resolving, `design.md` DD-1's open reconciliation item (162 claimed vs. 160 measured rows across "5 sheets" vs. 3 contributing sheets) — the residual is `Humantarian`, which is **T-8's** sheet, not this one's.

---

## 3. The three offtaker sheets

### 3.1 `Offtaker_Beans` (prefix `OFB`)

**Provenance:** header row **1**, first data row **2**, last data row **437** → **436 data rows**, **16 named columns + 1 unnamed data-bearing column = 17 columns** under the FR-1 denominator rule (§1.4). Matches `requirements.md` §3.1's corrected denominator exactly.

**Physical columns not carrying a name (§1.4):** physical column **1** and physical columns **19–27** are unnamed and **0% filled** across all 436 rows — recorded once as sheet extent and **not** dispositioned. Physical column **2** is unnamed but **421/436 (97%) filled** with sequential whole numbers `1…421`, exactly equal to `(row − 1)` for every filled row, and blank for precisely the same 15 rows whose `Trader_id` is blank (rows 423–437, the unfinished-entry tail). This is a **row-serial-number / auto-index column** — it carries no information not already recoverable from the physical row number, and no name, phone, email, or free text. It is disposed below as column **0**.

**Key rule:** `OFB-<Trader_id>` where `Trader_id` is non-blank (421 of 436 rows); `OFB-R<row>` for the **15** rows where it is blank. No intra-sheet duplicate ids were found (0 groups) — every non-blank id is unique in this sheet.

**Trader type — column-driven (DD-2).** The AT team applies these aliases (already live in `TRADER_TYPE_ALIASES`) when writing the template's Trader Type column:

| Source value (`Trader/processor type`) | Count | → Canonical |
|---|--:|---|
| `Informal trader/retailer` | 255 | `informal_trader` |
| `Large offtaker` | 180 | `offtaker` |
| *(blank)* (row 436) | 1 | — quarantines (Trader Type is a required field) |

Resolve rate: **435 of 436** — the highest of the three offtaker sheets, and the only one with zero free-text or typo values.

**Column disposition table (17 of 17):**

| # | Source column | Disposition |
|--:|---|---|
| 0 | *(unnamed, physical column 2)* | `DROPPED (redundant row-serial-number)` — sequential index `1…421`, identical to `(row − 1)` for every filled row; carries no information beyond the physical row number, which the `traderId` positional-key scheme (D-2, §1.2) already derives independently. Not PII: no name, contact value, or free text |
| 1 | `Trader_id` | `MAPPED → traderId` (key rule above) |
| 2 | `Trader_name` | `MAPPED → traderName` |
| 3 | `Region` | `MAPPED → region` (436/436 filled; 1 value, `"Arusha/Dodoma"` (row 425), is ambiguous and quarantines via `normalizeRegion`'s existing refusal — not a defect in this sheet) |
| 4 | `District` | `MAPPED → district` (434/436 filled; 2 blank rows leave `district` null — harmless, `district` is optional) |
| 5 | `Trader/processor type` | `DERIVED → traderType (rule above)` |
| 6 | `Sex` | `MAPPED → sex` (436/436 filled; values are `Male`/`Female` only, both resolve via `normalizeSex`) |
| 7 | `Position` | `MAPPED → position` |
| 8 | `Market location` | `MAPPED → marketLocation` |
| 9 | `Capacity (volume in t)` | `MAPPED → capacityTons` (unit is **explicit in the header — tonnes**; 420/436 filled) |
| 10 | `Technical support required` | `MAPPED → technicalSupport` (206/436 filled — a low fill rate is not grounds to drop an optional free-text field) |
| 11 | `phone` | `MAPPED → phone` (435/436 filled; normalized by `normalizePhone`, T-3) |
| 12 | `Email` | `EMPTY-IN-SOURCE (present, no data)` — measured **0/436** filled; the canonical `Email` column is therefore left blank for **every** beans row — nothing is carried across, and no value is invented |
| 13 | `gpslatitude` | `MAPPED → gpsLatitude` |
| 14 | `gpslongitude` | `MAPPED → gpsLongitude` |
| 15 | `gpsaltitude` | `MAPPED → gpsAltitude` |
| 16 | `gpsaccuracy` | `MAPPED → gpsAccuracy` |

**Reconciliation:** 14 `MAPPED` + 1 `DERIVED` + 1 `EMPTY-IN-SOURCE` + 1 `DROPPED` = **17 = 17 measured columns** (16 named + 1 unnamed-with-data, FR-1 denominator rule, §1.4). ✅

**No contaminated-row register for this sheet.** No column-shift or appended tail block was found anywhere in the 436 data rows.

---

### 3.2 `Offtaker_Sorghum` (prefix `OFS`)

**Provenance:** header row **1**, first data row **2**, last data row **116** → **115 data rows**, **13 columns**. Matches `requirements.md` §3.1 exactly.

**Key rule:** `OFS-<Trader_ID>` where `Trader_ID` is non-blank and unique in-sheet; `OFS-R<row>` otherwise. See §6.1 for the corrected blank-id count.

- **17** blank `Trader_ID` rows (rows 100–116) → positional key.
- **2** intra-sheet duplicate ids → the **second** occurrence in each pair takes a positional key; the first keeps its source-id key:
  - rows **49** and **64** share an id → row 64 → positional.
  - rows **61** and **62** share an id → row 62 → positional.
- **19** rows total get a positional key on this sheet (17 + 2).

**Trader type — column-driven (DD-2), with a quarantine decision:**

| Source value (`Trader type`) | Count | → Canonical |
|---|--:|---|
| `Retailer` | 51 | `informal_trader` |
| `Large offtaker` / `Large Offtaker` | 46 | `offtaker` |
| `Retaler` (typo) | 11 | **quarantines — see decision below** |
| *(blank)* | 7 | quarantines — these are the 7 contaminated-tail rows (§ below), not a separate defect |

**Decision on `"Retaler"` (FR-4, OQ-3 — closed, matching DD-2):** **quarantine, no alias added.** `normalize.ts` already carries the correctly-spelled `retailer → informal_trader`; adding `retaler` would bake one workbook's typo into a shared taxonomy every future import consults. The AT team corrects the 11 cells in the source instead, or accepts the quarantine.

**Region:** 109/115 filled with a clean canonical or alias-resolvable value (verified against `normalizeRegion` row by row — zero unexpected quarantines among the 109). The remaining 6 are blank; combined with row 111 (whose `Region` cell is non-blank but holds an organisation name, not a region), **7 rows quarantine on `region`** — this is the same 7-row contaminated register below, not an independent count.

**Contaminated-row register (DD-5) — rows 110–116, 7 rows, by row number only:**

These rows sit after the sheet's ordinary data (which ends at row 99) and are column-shifted: a region-like or ambiguous value lands in `Trader name`, the `Region` cell is blank (or, for one row, holds an unrelated company name), the `District` cell holds a person's or organisation's name instead of a district, and the `Town` cell holds a phone number instead of a place.

| Row | Disposition |
|--:|---|
| 110 | Quarantine — no source id, blank region, non-district value in the district position |
| 111 | Quarantine — no source id, non-blank but unresolvable region value, non-district value in the district position |
| 112 | Quarantine — same pattern as 110 |
| 113 | Quarantine — same pattern as 110 |
| 114 | Quarantine — same pattern as 110 |
| 115 | Quarantine — same pattern as 110 |
| 116 | Quarantine — same pattern as 110 |

**No name, initial, or phone digit for any of these 7 rows appears anywhere in this document** (NFR-9) — the register above is exhaustive by row number.

**Column disposition table (13 of 13):**

| # | Source column | Disposition |
|--:|---|---|
| 1 | `Trader_ID` | `MAPPED → traderId` (key rule above) |
| 2 | `Trader name` | `MAPPED → traderName` |
| 3 | `Region` | `MAPPED → region` |
| 4 | `District` | `MAPPED → district` (100% filled; the 7 contaminated rows carry a non-district value here — recorded above, not re-validated by this disposition) |
| 5 | `Town` | `MAPPED → marketLocation` |
| 6 | `Trader type` | `DERIVED → traderType (rule above)` |
| 7 | `Capacity (volume in t)` | `MAPPED → capacityTons` (unit explicit — tonnes; 100/115 filled) |
| 8 | `Technical support required` | `MAPPED → technicalSupport` (2/115 filled — sparse but still mapped) |
| 9 | `phone` | `MAPPED → phone` (106/115 filled) |
| 10 | `gps-Latitude` | `MAPPED → gpsLatitude` |
| 11 | `gps-Longitude` | `MAPPED → gpsLongitude` |
| 12 | `gps-Altitude` | `MAPPED → gpsAltitude` |
| 13 | `gps-Accuracy` | `MAPPED → gpsAccuracy` |

**Reconciliation:** 12 `MAPPED` + 1 `DERIVED` + 0 `EMPTY-IN-SOURCE` + 0 `DROPPED` = **13 = 13 measured columns.** ✅

---

### 3.3 `Offtaker_Groundnuts` (prefix `OFG`)

**Provenance:** header row **1**, first data row **2**, last data row **152**, with **row 146 entirely blank** (a separator, not data) → **150 data rows**, **13 columns**. Matches `requirements.md` §3.1 exactly (150 data rows once the blank separator is excluded).

**No `Region` column at all** — region is **always** derived from `District` for this sheet (see the dedicated subsection below).

**Key rule:** `OFG-<Trader_ID>` where non-blank and unique; `OFG-R<row>` otherwise. **6** blank-id rows (147–152) → positional key. No intra-sheet duplicates. See §6.1 for the corrected count.

**Region derivation — the FR-3 scenario this sheet exists to exercise.** `District` (col) does double duty: it is copied verbatim into the template's `District` column (`MAPPED → district`), **and** its value is looked up in §2's table by a human to produce the template's `Region` cell (`DERIVED → region`, FR-3's "district rescues a region-less record" scenario). Measured resolve rate: **146 of 150** rows' district value is a member of §2's table; the remaining **4** are not — and those 4 are exactly the 4 contaminated rows below, so nothing is quarantined on `region` for a reason other than contamination.

**Trader type — column-driven (DD-2):**

| Source value (`Trader type`) | Count | → Canonical |
|---|--:|---|
| `Retailer` | 105 | `informal_trader` |
| `Large offtaker` / `Large Offtaker` | 40 | `offtaker` |
| `Produce/Trader` (row 148) | 1 | **quarantines** — free text with no defensible alias; recorded here rather than guessed |
| A phone number (rows 149–152) | 4 | quarantines — see the contaminated register below |

Resolve rate: **145 of 150** direct alias matches. The remaining 5 (1 free-text + 4 contaminated) are recorded, not silently absorbed.

**Contaminated-row register (DD-5) — corrected to rows 149–152, 4 rows, by row number only.**

> **Correction (this task, T-7 — 2026-08-04).** `design.md` §9 and `tasks.md` T-7's scope line both cite this register as **rows 147–151**. Direct, cell-by-cell inspection of rows 145–152 (§1.5) found the true boundary is **149–152**: rows 147 and 148 are ordinary, well-formed data (a real district — `Mbeya` and `Dodoma` respectively, both present in §2's table — with only a blank id and, for row 148, a non-resolving free-text trader type already recorded above). Neither holds a company or person name in the district position. The contamination pattern — a region-like value in `Trader name`, an **organisation name** in `District`, a **person's name** in `Town`, and a **phone number** in `Trader type` — is present in rows 149, 150, 151, and 152 only, which is also exactly the **4** rows the district-resolve-rate measurement above independently flags as unresolvable, and exactly the **4** "phone number in the trader-type column" rows `requirements.md` §3.1 already measures. Three independent measurements (contamination pattern, district-lookup failure, phone-in-type-column) agree on the same 4 rows, none of which are 147 or 148. This document uses the corrected range. **Resolved 2026-08-04.** Corrected in `design.md` §9/§9.1 and `tasks.md` T-7 under the user-approved T-7 pivot (`execution.md` C-2); `requirements.md` never carried the 147–151 range.

| Row | Disposition |
|--:|---|
| 149 | Quarantine — no source id, organisation name in the district position, person name in the town position, phone number in the trader-type position |
| 150 | Quarantine — same pattern as 149 |
| 151 | Quarantine — same pattern as 149 |
| 152 | Quarantine — same pattern as 149 |

**Hand-repair note for whoever works this register:** for each of these 4 rows, the *real* phone number is sitting in the `Trader type` cell and the *real* organisation name is sitting in the `District` cell. A hand-repair (rather than a quarantine-and-drop) would move each value to its correct column before re-running the mapping — the raw values are not reproduced here (NFR-9); they are recoverable from the four named rows in the source workbook only.

**No name, initial, or phone digit for any of these 4 rows appears anywhere in this document** (NFR-9).

**Column disposition table (13 of 13):**

| # | Source column | Disposition |
|--:|---|---|
| 1 | `Trader_ID` | `MAPPED → traderId` (key rule above) |
| 2 | `Trader name` | `MAPPED → traderName` |
| 3 | `District` | `MAPPED → district`; **also** `DERIVED → region (rule: §2 lookup)` — one physical column, two outputs, explained above |
| 4 | `Town` | `MAPPED → marketLocation` |
| 5 | `Trader type` | `DERIVED → traderType (rule above)` |
| 6 | `Capacity (volume)` | `DROPPED (unit unconfirmed — A-4/OQ-2)`. Unlike Beans/Sorghum, this header carries **no unit annotation**. Importing 144/150 filled values without knowing tonnes vs. kg vs. bags risks a silently wrong number in every one of them |
| 7 | `Need for Tecncal support` | `DROPPED (redundant Y/N flag)`. 143/150 filled (`yes`/`no`/one `ye` typo); the canonical template has no boolean "needs support" field, and the adjacent free-text column below already captures this more usefully |
| 8 | `Technical support required` | `MAPPED → technicalSupport` (110/150 filled, free text) |
| 9 | `gps-Latitude` | `MAPPED → gpsLatitude` |
| 10 | `gps-Longitude` | `MAPPED → gpsLongitude` |
| 11 | `gps-Altitude` | `MAPPED → gpsAltitude` |
| 12 | `gps-Accuracy` | `MAPPED → gpsAccuracy` |
| 13 | `phone` | `MAPPED → phone` (145/150 filled in the phone column itself; the 4 contaminated rows' real phone value sits in `Trader type` instead — see the register above, not double-counted here) |

**Reconciliation:** columns 1, 2, 3, 4, 8, 9, 10, 11, 12, 13 carry `MAPPED` (**10** columns — column 3's primary disposition is `MAPPED → district`) + column 5 carries `DERIVED` (**1** column) + columns 6, 7 carry `DROPPED` (**2** columns) + 0 `EMPTY-IN-SOURCE` = **13 physical columns, 13 accounted for.** ✅ Column 3's *second*, additional output (`DERIVED → region`) is documented above but is not a 14th column — it is the same physical `District` cell read twice, once verbatim and once through the lookup rule, which is why the arithmetic above counts it once.

---

## 4. The five remaining sheets

Authored by T-8 (2026-08-04). Every count below was re-measured directly from the workbook using `exceljs` — not copied from `requirements.md`/`design.md` — for the same reason T-7 re-measured the three offtaker sheets: these figures feed the irreversible `traderId` scheme (D-2) and the FR-3 region-quarantine gate. Places where this task's measurement disagrees with the published draft are reported as findings in §8, not silently resolved here.

### 4.1 `Bulk buyers_beans` (prefix `BBB`)

**Provenance:** header row **3**, first data row **5** (row 4 is a blank spacer), last data row **234** → **166 physical data rows**, forward-filled into **26** organisation blocks. **17 named columns + 0 unnamed-with-data = 17 columns** under the FR-1 denominator rule (§1.4). Matches `requirements.md` §3.1 exactly.

**Physical columns not carrying a name (§1.4):** physical column **1** and physical column **19** are unnamed and **0% filled** across all 166 data rows — recorded once as sheet extent and **not** dispositioned.

**Block structure and the forward-fill rule (FR-1 Scenario: Block-structured sheet is flattened by forward-fill).** Each organisation occupies one **identity row** — `Region_name`, `District`, `Year_estb`, `Latitude`, `Longitude`, `Altitude`, `Agregation Capacity (tons)`, and `Offtaker name` are populated **only** on this row — followed by zero or more **year-metric rows**, on which those eight columns are blank and `Variety of focus`, `            Years`, `Total actual aggregate (tons)`, `Total farmers`, `Total female farmer`, `Source of seed`, both grain-price columns, and `Remarks` carry that year's trade data instead. `Offtaker name` is the block-boundary marker: a non-blank value starts a new block; the seven other identity columns are forward-filled down every row in that block until the next marker. Measured directly, row by row: **166 data rows collapse into exactly 26 blocks** — one actor per organisation, not one per physical row. The **140** non-identity year-metric rows (166 physical rows − 26 identity rows) are `DROPPED (trade metrics — epic §6)` at the row level, per `requirements.md` FR-1's forward-fill scenario — each contributes no actor of its own, only the trade-metric column values already dropped below (columns 10–18). `reconciliation.md` (T-10, FR-8) buckets these same 140 rows as `collapsed-into-block`, not `dropped`, so that document's four-bucket vocabulary and this document's column-level vocabulary describe the same 140-row set without conflict.

**Key rule:** no id column on this sheet — every row is `BBB-R<row>`, where `<row>` is the identity row's physical row number (D-2, DD-9).

**Trader type — sheet-level (DD-2).** Every `BBB` actor is typed `bulk_buyer`; the sheet carries no category column to corroborate or contradict this.

**Region resolution — three outcomes, exhaustive and disjoint across the 26 blocks (FR-3):**

| Outcome | Count | Identity rows |
|---|--:|---|
| Region present directly on the identity row | **14** | 5, 14, 20, 31, 51, 68, 81, 87, 91, 104, 114, 117, 126, 212 |
| Region blank, `District` present and resolves via §2's table | **4** | 143 (Kibondo → Kigoma) · 150 (Kasulu → Kigoma) · 166 (Uvinza → Kigoma) · 186 (Kakonko → Kigoma) |
| Neither region nor district present — quarantine (FR-3) | **8** | 154 · 160 · 170 · 175 · 180 · 191 · 196 · 202 |

14 + 4 + 8 = 26, disjoint by construction (each block has exactly one outcome). Matches `requirements.md` §3.1's "only 14 of 26 have a resolvable region" and FR-3's "8 of 26 ... neither a region nor a district" exactly. The 4 district-rescued rows are exactly the 4 `Bulk buyers_beans` contributions to `DISTRICT_TO_REGION` cited in `design.md` §4.2.

**OQ-4, measured (not resolved — interim default per DD-2 stands).** OQ-4 asks whether the `…AMCOs` organisations should type as `cooperative` rather than sheet-level `bulk_buyer`. `requirements.md` §10 states **15** such organisations. Direct measurement of all 26 identity-row names found **12** containing `AMCOs`/`AMCos` (case-insensitive): identity rows 143, 150, 154, 160, 166, 170, 175, 180, 186, 191, 196, 202. This is a measured discrepancy with the published figure, reported as a finding (§8) rather than silently adopted either way; it does not change DD-2's interim `bulk_buyer` assignment, which this task leaves standing and un-overridden.

**Column disposition table (17 of 17):**

| # | Source column | Disposition |
|--:|---|---|
| 2 | `Region_name` | `MAPPED → region` (forward-filled per block; resolves directly for 14, derived via district for 4, quarantines for 8 — table above) |
| 3 | `District` | `MAPPED → district` (forward-filled per block) |
| 4 | `Year_estb` | `DROPPED (no canonical field — establishment year is not part of the Actor schema)` |
| 5 | `Latitude` | `MAPPED → gpsLatitude` (forward-filled per block) |
| 6 | `Longitude` | `MAPPED → gpsLongitude` (forward-filled per block) |
| 7 | `Altitude` | `MAPPED → gpsAltitude` (forward-filled per block) |
| 8 | `Agregation Capacity (tons)` | `DROPPED (trade capacity metric — out of scope, requirements.md §3.3)` |
| 9 | `Offtaker name` | `MAPPED → traderName` (forward-filled per block; also the block-boundary marker for the forward-fill rule above) |
| 10 | `Variety of focus` | `DROPPED (trade metric — out of scope, requirements.md §3.3)` |
| 11 | `            Years` | `DROPPED (trade metric — the year-metric row's year, out of scope)` |
| 12 | `Total actual aggregate (tons)` | `DROPPED (trade metric — out of scope)` |
| 13 | `Total farmers` | `DROPPED (trade metric — out of scope)` |
| 14 | `Total female farmer` | `DROPPED (trade metric — out of scope)` |
| 15 | `Source of seed` | `DROPPED (trade metric — out of scope)` |
| 16 | `Grain price-contract farmers (TSh/kg)` | `DROPPED (trade metric — out of scope)` |
| 17 | `Grain price-non contract farmers (TSh/kg)` | `DROPPED (trade metric — out of scope)` |
| 18 | `Remarks/Quality criteria/ Pricing mechanism/Area of support` | `DROPPED (trade metric — free-text pricing/quality commentary, out of scope)` |

**Reconciliation:** 6 `MAPPED` + 0 `DERIVED` + 11 `DROPPED` + 0 `EMPTY-IN-SOURCE` = **17 = 17 measured columns.** ✅

**No contaminated-row register for this sheet.** No column-shift was found in any of the 166 data rows; every deviation from the block pattern is accounted for by the forward-fill rule and the region-resolution table above.

---

### 4.2 `Humantarian` (prefix `HUM`)

**Provenance:** header row **2** (row 1 is a merged title, `D1:H1`, reading *"LIST OF HUMANITARIANS SUPPORTING SEED RELATED ACTIVITIES"*), first data row **3**, last data row **37** → **35 data rows**, **9 named columns + 1 unnamed data-bearing column = 10 columns** under the FR-1 denominator rule (§1.4). Matches `requirements.md` §3.1 exactly.

**Physical columns not carrying a name (§1.4):** physical column **1** is unnamed but **35/35 (100%) filled** with the sequential whole numbers `1…35` — a row-serial-number column, identical in kind to `Offtaker_Beans` column 0 (§3.1). Physical columns **11–12** are unnamed and **0% filled** — recorded once as sheet extent, not dispositioned.

**Key rule:** no id column — every row is `HUM-R<row>` (D-2, DD-9).

**Trader type — sheet-level (DD-2).** Every `HUM` actor is typed `humanitarian`. The source `Category` column is **not** the driver (FR-4): it resolves against `TRADER_TYPE_ALIASES`/`TRADER_TYPE_BY_LOWER` for only **26 of 35** rows — measured directly by evaluating every filled `Category` value against the live alias map. The 9 that do not resolve are `FO` (1), `Public` (2), `UN` (1), `"Cooperative for University Graduates"` (1, does not exact-match the `cooperative` alias), `Program` (1), and 3 blank cells. Matches `requirements.md` FR-4's cited resolve rate exactly.

**DD-1 residual, resolved by this task.** `design.md` DD-1 left open whether `Humantarian`'s ~31 non-ambiguous `Location` values are region-level (closing DD-1 at 3 contributing sheets) or include district-level values (in which case `DISTRICT_TO_REGION` would be short by one or more entries). Measured: **every one of the 31 non-ambiguous values is an exact, case-correct member of `CANONICAL_REGIONS`** — `Arusha`, `Iringa`, `Manyara`, `Dodoma`, `Kagera`, `Songwe`, `Mbeya`, `Dar es Salaam`, `Morogoro`, `Kigoma`, `Tanga`. None require district derivation. **This closes DD-1 at 3 contributing sheets** (`Offtaker_Sorghum`, `Offtaker_Groundnuts`, `Bulk buyers_beans`, per §2's corroborating note); `Humantarian` contributes **zero** entries to `DISTRICT_TO_REGION`. Per this task's brief, no entry is added to `normalize.ts` or §2's table — there is nothing to add.

**Region — the 4 ambiguous quarantines (FR-3 Scenario):**

| Row | Value | Reason |
|--:|---|---|
| 9 | `"Across Tz"` | Not a single region — refused by `normalizeRegion` |
| 10 | `"Across Tz"` | Same |
| 31 | `"Iringa/Mbeya"` | Multi-region value |
| 36 | `"Dodoma/Mara"` | Multi-region value |

The remaining 31 rows carry a `MAPPED → region` value directly (list above).

**Column disposition table (10 of 10):**

| # | Source column | Disposition |
|--:|---|---|
| 0 | *(unnamed, physical column 1)* | `DROPPED (redundant row-serial-number)` — identical treatment to `Offtaker_Beans` column 0 (§3.1); no name, contact value, or free text |
| 1 | `Name` | `MAPPED → traderName` (35/35 filled) |
| 2 | `Contact person` | `DROPPED (no canonical field for a contact person's name — 34/35 filled; mapping it would create a new PII surface outside the allowlist in `common/pii-consent.policy.ts`)` |
| 3 | `Crops` | `DROPPED (no canonical field for a free-text, multi-crop descriptor — e.g. "Nutritious crops", "Various Crops", "Grains" name no single one of the three in-scope crops; the three canonical crop-toggle fields are per-scope defaults, not per-row derivations, consistent with §3.1–3.3, where none of the three crop-specific offtaker sheets populate them either)` |
| 4 | `Designation` | `MAPPED → position` (34/35 filled; job title/role, same use as `Offtaker_Beans`' `Position` column) |
| 5 | `Category` | `DROPPED (resolves for 26 of 35 — FR-4; measured resolve rate above)` |
| 6 | `Location` | `MAPPED → region` (31/35 resolve directly; 4 quarantine — table above) |
| 7 | `Email` | `MAPPED → email` (33/35 filled) |
| 8 | `Telephone` | `MAPPED → phone` (33/35 filled; normalized by `normalizePhone`, T-3) |
| 9 | `Type of  activities` | `MAPPED → technicalSupport` (35/35 filled; the field is repurposed here to carry the organisation's stated seed-related activities — the only free-text field available, and the closest canonical equivalent to what this column records) |

**Reconciliation:** 6 `MAPPED` + 0 `DERIVED` + 4 `DROPPED` + 0 `EMPTY-IN-SOURCE` = **10 = 10 measured columns.** ✅

**No contaminated-row register for this sheet.** No column-shift or appended tail block was found in the 35 data rows.

---

### 4.3 `Digital Service Provider` (prefix `DSP`)

**Provenance:** header row **2**, first data row **3**, last data row **15** → **13 data rows**, **9 named columns + 1 unnamed data-bearing column = 10 columns** under the FR-1 denominator rule (§1.4). Matches `requirements.md` §3.1 exactly.

**Physical columns not carrying a name (§1.4):** physical column **1** is unnamed but **13/13 (100%) filled** with the sequential whole numbers `1…13` — the same row-serial-number pattern as `Humantarian` column 0.

**Key rule:** no id column — every row is `DSP-R<row>` (D-2, DD-9).

**Trader type — sheet-level (DD-2).** Every retained `DSP` actor is typed `digital_service_provider`. The source `Category` column resolves **0 of 13** — free-text business descriptors (`"Business companies & Digitalization"`, `"Public"`, `"agricultural value added service (Agri VAS) provided by mobile network operator Tigo in Tanzania."`, …), none matching `TRADER_TYPE_ALIASES`/`TRADER_TYPE_BY_LOWER`. Matches `requirements.md`/`design.md`'s measured 0/13 exactly.

**Foreign exclusion (D-3) — 3 rows, confirmed by direct measurement:**

| Row | `Location` value |
|--:|---|
| 10 | `"Nairobi Kenya"` |
| 12 | `"Kampala Uganda"` |
| 15 | `"Nairobi, Kenya."` |

Excluded at mapping time, reason `"outside Tanzania — PRD §5"` (D-3). These 3 rows sit outside the disposition table's row-count arithmetic below, consistent with `design.md` §9.1's convention that D-3's exclusion is a candidacy decision made before the yield table, not a quarantine bucket inside it.

**Finding — 2 further region-ambiguous rows among the 10 domestic candidates, reported in §8 (not previously recorded in `requirements.md`/`design.md`):**

| Row | `Location` value | Why it quarantines |
|--:|---|---|
| 3 | `"West and South Tanzania "` | Multi-region descriptive text, not a single canonical region or a resolvable district — refused by `normalizeRegion`, the same class of refusal already documented for `Humantarian`'s `"Across Tz"` (§4.2) |
| 4 | `"West and South Tanzania "` | Same |

The remaining **8** domestic rows carry a clean, exact `CANONICAL_REGIONS` value directly (`Dar es Salaam` on rows 5, 6, 8, 9, 11, 13, 14; `Dodoma` on row 7).

**Column disposition table (10 of 10):**

| # | Source column | Disposition |
|--:|---|---|
| 0 | *(unnamed, physical column 1)* | `DROPPED (redundant row-serial-number)` |
| 1 | `Name` | `MAPPED → traderName` (13/13 filled) |
| 2 | `Contact person` | `DROPPED (no canonical field for a contact person's name — would create a new PII surface, consistent with `Humantarian`)` |
| 3 | `Crops` | `DROPPED (no canonical field for a free-text, multi-crop descriptor — consistent with `Humantarian`; 12/13 filled)` |
| 4 | `Designation` | `MAPPED → position` (13/13 filled) |
| 5 | `Category` | `DROPPED (resolves for 0 of 13 — FR-4)` |
| 6 | `Location` | `MAPPED → region` (8 resolve directly; 2 quarantine — table above; 3 rows already excluded before this count — D-3) |
| 7 | `Email` | `MAPPED → email` (13/13 filled) |
| 8 | `Telephone` | `MAPPED → phone` (13/13 filled; normalized by `normalizePhone`) |
| 9 | `Website` | `EMPTY-IN-SOURCE (present, no data)` — measured **0/13** filled, matching `requirements.md`/`design.md` exactly |

**Reconciliation:** 5 `MAPPED` + 0 `DERIVED` + 4 `DROPPED` + 1 `EMPTY-IN-SOURCE` = **10 = 10 measured columns.** ✅

**No contaminated-row register for this sheet.**

---

### 4.4 `Seed Company` (prefix `SDC`)

**Provenance:** header row **1** (+ sub-header row **2** = `lat`/`long` for physical columns 7–8), first data row **3**, last data row **13** → **11 data rows**, **26 named columns + 2 unnamed data-bearing columns = 28 columns** under the FR-1 denominator rule (§1.4). Matches `requirements.md` §3.1 exactly.

**Physical columns not carrying a name (§1.4):** physical column **8** carries no **row-1** header — its only label is the row-2 sub-header `"long"` — and is **6/11 filled**; it is dispositioned as an unnamed data-bearing column per the FR-1 rule's data-in-any-row test, distinct from column 7's row-1-named `"gps location"`. Physical column **12** carries no header on either row but is **11/11 filled** — see the finding below. Physical columns **10–11** are unnamed and **0% filled** — recorded once as sheet extent, not dispositioned.

**Key rule:** no id column — every row is `SDC-R<row>` (D-2, DD-9).

**Trader type — sheet-level, corroborated (DD-2).** Every `SDC` actor is typed `seed_company`. The source `Category` column holds the literal value `"Seed Company"` on **11 of 11** rows, which resolves via `TRADER_TYPE_ALIASES['seed company']` to the same code — corroborating, not driving, the sheet-level assignment (DD-2: *"the column agrees 11/11"*, confirmed).

**Region — all 11 quarantine pending an AT-team region pass (DD-11).** The named location column (`Where is the offtaker based(Town/District)`, physical column 9) is **0/11** filled and the sheet has no other named region or district column, so all 11 organisations quarantine on `region` per `design.md` DD-11. This task's measurement **confirms** DD-11's binding disposition; it does not change it. The finding below bears on how DD-11 is *unblocked*, not on whether it applies.

> **Finding — physical column 12 (reported in §8; DD-11's premise re-examined, not overridden).** DD-11's "no district data at all" reading cites only the named column 9. Direct measurement shows column 12 — unnamed on both header rows — is **11/11 filled** with short place-name text in the same shape as the missing "Town/District" column: `Haydom/Mbulu` (row 3) · `Ausha` (row 4) · `Aruaha` (row 5) · `Arusha` (rows 6, 7, 9, 10) · `Mbeya and Arusha` (row 8) · `Mbeya/Mbeya` (rows 11, 13) · `Mbozi/Mbeya` (row 12). This reads as the sheet's true "Where is the offtaker based" answer, physically displaced 3 columns from its own header — not absent data, misplaced data. It does not change this task's disposition (DD-11's quarantine-all-11 stands; this task has no authority to reinterpret a bound design decision), but it changes the *cost* of DD-11's mandated AT-team region pass: 4 of the 11 values are an exact `CANONICAL_REGIONS` match (`Arusha`) needing no lookup, 2 are a single-letter typo away from one (`Ausha`, `Aruaha`), 2 read as one region with a redundant repeat (`Mbeya/Mbeya` ×2), 1 names a district already in §2's table (`Mbozi` → `Songwe`), and only 2 are genuinely ambiguous or need a district not yet in the table (`Haydom/Mbulu`, `Mbeya and Arusha`).

**GPS coordinates — measured discrepancy (reported in §8).** `design.md` DD-11 states "only 7 of the 11 have coordinates anyway." Direct measurement of physical columns 7–8 (`lat`/`long`) finds **6 of 11** rows filled (rows 3, 5, 7, 8, 9, 10), not 7. Does not change DD-11's decision to reject reverse-geocoding as a substitute derivation, which holds regardless of whether the count is 6 or 7.

**Column disposition table (28 of 28):**

| # | Source column | Disposition |
|--:|---|---|
| 1 | `Name of offtakers` | `MAPPED → traderName` (11/11 filled) |
| 2 | `Category` | `DERIVED → traderType (sheet-level `seed_company` per DD-2; corroborated 11/11 by this column, not driven by it)` |
| 3 | `Contact name` | `DROPPED (no canonical field for a contact person's name — would create a new PII surface; the contact named in this column is the individual whose phone number was redacted from `proposal.md` per `requirements.md` §10 OQ-1, underscoring why)` |
| 4 | `Phone number` | `MAPPED → phone` (11/11 filled; normalized by `normalizePhone`; at least one multi-number cell — first kept, warning raised per FR-5; row not cited here to avoid reproducing the value, NFR-9) |
| 5 | `e-mail` | `MAPPED → email` (10/11 filled) |
| 6 | `website` | `DROPPED (no canonical field for a URL — 7/11 filled; unlike `Digital Service Provider`'s 0/13, this column has real data with nowhere to go)` |
| 7 | `gps location` (`lat`) | `MAPPED → gpsLatitude` (6/11 filled — see the GPS finding above) |
| 8 | *(unnamed except the row-2 sub-header `"long"`)* | `MAPPED → gpsLongitude` (6/11 filled; unnamed column dispositioned like any other per §1.4) |
| 9 | `Where is the offtaker based(Town/District)` | `EMPTY-IN-SOURCE (present, no data)` — measured **0/11** filled; this is the column DD-11's quarantine is built on |
| 12 | *(unnamed, physical column 12)* | `DROPPED` — see the finding above; not carried into the template automatically, pending a design decision on whether/how to use it |
| 13 | `Number of farmer group` | `DROPPED (seed-company commercial profile — out of scope, requirements.md §3.3; 2/11 filled)` |
| 14 | `Total ## of bean producers` | `DROPPED (commercial profile — out of scope; 2/11 filled)` |
| 15 | `Seed source` | `DROPPED (commercial profile — out of scope; 2/11 filled)` |
| 16 | `# Male` | `EMPTY-IN-SOURCE (present, no data)` — 0/11 |
| 17 | `# Female` | `EMPTY-IN-SOURCE (present, no data)` — 0/11 |
| 18 | `Year` | `EMPTY-IN-SOURCE (present, no data)` — 0/11 |
| 19 | `Corridor` | `DROPPED (commercial profile — out of scope; 1/11 filled)` |
| 20 | `Bean markert type` | `EMPTY-IN-SOURCE (present, no data)` — 0/11 |
| 21 | `Name of the variety` | `DROPPED (commercial profile — out of scope; 1/11 filled)` |
| 22 | `Districts where  sourced the products` | `DROPPED (commercial profile — out of scope; 2/11 filled)` |
| 23 | `Current Grain demanded(t)-2020` | `DROPPED (commercial profile — out of scope; 2/11 filled)` |
| 24 | `Volume handled (t)-2019` | `DROPPED (commercial profile — out of scope; 2/11 filled)` |
| 25 | `Where do you sell your beans to/product` | `DROPPED (commercial profile — out of scope; 1/11 filled)` |
| 26 | `Estimated value in USD` | `EMPTY-IN-SOURCE (present, no data)` — 0/11 |
| 27 | `Challenges in bean trade` | `DROPPED (commercial profile — out of scope; 1/11 filled)` |
| 28 | `How do you handle these challenges` | `DROPPED (commercial profile — out of scope; 1/11 filled)` |
| 29 | `Where can NARS/CIAT Support` | `DROPPED (commercial profile — out of scope; 1/11 filled)` |
| 30 | `Any observation?` | `EMPTY-IN-SOURCE (present, no data)` — 0/11 |

**Reconciliation:** 5 `MAPPED` + 1 `DERIVED` + 15 `DROPPED` + 7 `EMPTY-IN-SOURCE` = **28 = 28 measured columns.** ✅

**No contaminated-row register for this sheet.** No column-shift beyond the physical-column-12 finding above, which is a displacement, not row-level contamination.

---

### 4.5 `QDS_ Seed producers` (prefix `QDS`)

**Provenance:** header row **1**, first data row **2**, last data row **312** → **311 physical data rows** (292 distinct producer names, case-insensitive — confirmed by direct measurement, matching `design.md` DD-6 exactly), **41 named columns + 12 unnamed data-bearing columns = 53 columns** under the FR-1 denominator rule (§1.4). Matches `requirements.md` §3.1 exactly.

**Physical columns not carrying a name (§1.4):** physical columns **13** (305/311 filled — a season/year value) and **19** (108/311 filled — a seed-source class, e.g. `"research"`, `"seed co"`, `"farm saved seed"`) are unnamed but data-bearing. Physical columns **45–54** are unnamed and carry the tail of the `buyer_contact/soldto_N` series — the same PII-bearing buyer-name columns as the 9 *named* `buyer_contact/soldto_1`…`9` columns (36–44) and the 1 named `buyer_contact/soldto_20` (55); their header labels are simply missing on this stretch of the series (2–4 rows filled each). Physical columns **15** and **29** are unnamed and **0% filled** — recorded once as sheet extent, not dispositioned.

**Selection rule (D-1/FR-10) — organisation-only, applied to `producer_category`:**

| `producer_category` (case-insensitive) | Rows | Disposition |
|---|--:|---|
| `individual` / `individuals` | 261 | **Excluded (D-1)** — natural persons |
| `public` | 12 | Part of the excluded tail (rows 289–312 below) |
| `seed agency` / `seed company` / `company` | 11 | Part of the excluded tail (rows 289–312 below) |
| *(blank)* | 1 | Row 312 — part of the excluded tail |
| `cbo` | 26 | **Candidate organisations** — hand-classified below |

26 + 261 + 12 + 11 + 1 = 311. ✅

**Reconciling the `individual` row count with FR-10's cited exclusion.** This task measures **261** *physical rows* carrying `producer_category` = `individual`/`individuals` (table above) — the FR-1 denominator-rule unit (§1.4) used throughout this document. `requirements.md` FR-10 and §3.1 both cite **249** individuals excluded; that figure counts the same rows **by distinct name** under DD-6's case-insensitive, whitespace-trimmed dedup rule — the same rule the `cbo` block below applies, where 26 physical rows collapse to 23 distinct names. 261 physical rows collapsing to 249 distinct names (12 collapses) is consistent with the sheet-wide **311 physical rows → 292 distinct names** total (19 collapses; the `cbo` block below already accounts for 3 of those). `reconciliation.md` (T-10, FR-8) uses **261** for its row-level accounting; FR-10's **249** is the same set counted by name — the two figures are not in conflict.

**Standing rule for blank `producer_category` (FR-10, for future workbook refreshes — R-5).** A blank `producer_category` value quarantines outright, independent of any other selection outcome. In *this* workbook version the rule fires on **zero** rows: the sheet's one blank-category row (row 312, table above) already sits inside the excluded 289–312 tail below under a different, independently-sufficient exclusion reason, so the standing rule has no additional effect here — but a refreshed workbook carrying a blank-category row outside that tail would quarantine on this rule alone. This does not change any figure in this section or in §8.4.

**Excluded tail — rows 289–312, 24 rows, confirmed by direct measurement (FR-10).** This block is not producers. Rows 289–300 (12 rows) are research-institute name variants — `ARI Maruku` (×4, across different regions), `ARI Uyole` / `ARI Uyole SSTP` / `SSTP ARI Uyole project` / `Tari uyole` / `Tari uyole Farm operation` (5 spellings of one institute), `ASA` / `ASA -Mbozi` (2 more) — roughly 3 real institutes under 8+ spellings, matching `design.md` DD-6's description. Rows 301–312 (12 rows) repeat all **11** `Seed Company` sheet organisations verbatim (one, `Agricultural Seed Agency`, is labelled `"Seed Agency"` here rather than `"Seed Company"`) plus one additional entry (row 312, blank category). Importing this block would create duplicate actors for organisations already onboarded from their own sheets (FR-10).

**The `cbo` block — 26 rows, hand-classified by row number only (DD-6, NFR-9). No name, initial, or partial identifier for any row below appears anywhere in this document.**

*Case-insensitive, whitespace-trimmed dedup (DD-6's rule) collapses 26 rows to 23 distinct names:*

| Rows | Why they collapse |
|---|---|
| 10, 19 | Same name (case-insensitive); **districts differ** between the two rows — the dedup key is name-only, so this still collapses to one actor (keyed on row 10, the first occurrence); the district discrepancy is flagged here for AT-team resolution, not resolved by this task |
| 21, 25 | Exact duplicate — same name, same district |
| 22, 26 | Same name after whitespace-trim (one occurrence has a trailing space), same district |

*Hand-classification of the 23 distinct names — personal name vs. genuine group (DD-6):*

| Rows | Classification | Disposition |
|---|---|---|
| 2, 4, 8, 20, 23 | **Personal name** — a natural person's first-and-last name, not a group/organisation name | **Excluded**, per D-1's organisation-only rule. The same rationale that excludes the 261 `individual`-category rows applies here: onboarding these 5 would create records whose `traderName` is a natural person's name alongside phone and farm GPS (`requirements.md` FR-10's PII/RBAC note). One of the five (row 23) shares its exact name with a row elsewhere on the sheet independently labelled `individual`, corroborating the classification without being required to make it |
| 9 | Names a family/household unit, not an individual by name | Kept as a candidate — does not carry a personal name in the sense above |
| the other 17 distinct names | Group or cooperative name | Kept as candidates |

**Net QDS candidates: 26 `cbo` rows − 3 duplicate rows (19, 25, 26) − 5 personal-name exclusions (2, 4, 8, 20, 23) = 18.** No row in this candidate set has a blank `producer_category` — all 26 are labelled `cbo` by construction of the selection rule above, and the sheet's one genuinely blank-category row (312) sits inside the already-excluded 289–312 tail. See §8 for how this reconciles against `design.md` §9.1's expected net.

**Key rule:** no id column — every row is `QDS-R<row>`; for a collapsed duplicate, `<row>` is the **first** physical occurrence (D-2, DD-9).

**Trader type — sheet-level (DD-2).** Every retained `QDS` actor is typed `qds_producer`, written directly — never derived from `producer_category`, whose `cbo` value would otherwise resolve via the *existing* `TRADER_TYPE_ALIASES['cbo']` entry to `humanitarian` (FR-4's stated risk).

**Region / district.** All 26 `cbo` rows carry a non-blank `region_name`, and it is always a canonical region value — **QDS contributes zero rows to `DISTRICT_TO_REGION`** (matches `design.md` §4.2's operative definition exactly). `district_name` is filled for most rows and left blank (harmless — optional) where absent (e.g. rows 15, 16, 23).

**DMS coordinates (FR-10 Scenario).** Measured **70** DMS-format coordinate cells (35 `latitude` + 35 `longitude`, the same 35 rows for both) — a small measured difference from `requirements.md`'s cited **71**, reported in §8 and not resolved here; it does not change the disposition below. DMS values use the pattern `01⁰33.939″` (degree symbol `⁰`, seconds mark `″`) rather than plain ASCII. At least 5 confirmed values carry an out-of-range minutes component (≥ 60), e.g. row 6's longitude `030⁰94.818″`. Per DD-10: DMS cells are **left blank and the row flagged**, never passed to `Number()` coercion. `gpsLatitude`/`gpsLongitude` are optional, so affected rows still import.

**Altitude unit text.** `altitude` (physical column 12) mixes plain numbers with `"<number> masl"` strings (e.g. `"1325 masl"`). `DERIVED → gpsAltitude (rule: strip the trailing unit suffix "masl", keep the numeric value; plain numeric cells pass through unchanged)`.

**Column disposition table (53 of 53).** Physical columns 15 and 29 are deliberately absent from this table — unnamed and 0% filled, they are sheet extent only per §1.4, not part of the 53-column denominator.

| # | Source column | Disposition |
|--:|---|---|
| 1 | `name_seedproducer` | `MAPPED → traderName` |
| 2 | `producer_category` | `DERIVED → traderType (sheet-level `qds_producer` per DD-2; selection rule above)` |
| 3 | `region_name` | `MAPPED → region` (all 26 `cbo` rows filled with a canonical value) |
| 4 | `district_name` | `MAPPED → district` |
| 5 | `ward_name` | `DROPPED (no canonical field for this administrative sub-unit; district and marketLocation already locate the record)` |
| 6 | `village_name` | `MAPPED → marketLocation` |
| 7 | `males` | `DROPPED (no canonical field for a group's gender-composition headcount; `sex` is a per-individual field, not applicable at organisation level)` |
| 8 | `females` | `DROPPED (same reason as `males`)` |
| 9 | `contact_number` | `MAPPED → phone` (normalized by `normalizePhone`) |
| 10 | `latitude` | `MAPPED → gpsLatitude` (DMS cells blanked + flagged, never coerced — see above) |
| 11 | `longitude` | `MAPPED → gpsLongitude` (same DMS handling) |
| 12 | `altitude` | `DERIVED → gpsAltitude (rule above — strip "masl" unit suffix)` |
| 13 | *(unnamed)* | `DROPPED (season/year — production dataset, out of scope, FR-10)` |
| 14 | `season_name` | `DROPPED (production dataset — out of scope, FR-10)` |
| 16 | `variety_name` | `DROPPED (production dataset — out of scope, FR-10)` |
| 17 | `variety_num` | `DROPPED (production dataset — out of scope, FR-10)` |
| 18 | `seed source` | `DROPPED (production dataset — out of scope, FR-10)` |
| 19 | *(unnamed)* | `DROPPED (seed-source class — production dataset, out of scope, FR-10)` |
| 20 | `seed_sourcedclass` | `DROPPED (production dataset — out of scope, FR-10)` |
| 21 | `produced_class` | `DROPPED (production dataset — out of scope, FR-10)` |
| 22 | `Acrage_planted` | `DROPPED (production dataset — out of scope, FR-10)` |
| 23 | `quantity_planted_kgs` | `DROPPED (production dataset — out of scope, FR-10)` |
| 24 | `amount_harvested_tonnes (before sorting)` | `DROPPED (production dataset — out of scope, FR-10)` |
| 25 | `amount_harvested_tonnes (after sorting)` | `DROPPED (production dataset — out of scope, FR-10)` |
| 26 | `comment/observation` | `DROPPED (production dataset — out of scope, FR-10)` |
| 27 | `variety_sold` | `DROPPED (production dataset — out of scope, FR-10)` |
| 28 | `variety_1` | `DROPPED (production dataset — out of scope, FR-10)` |
| 30 | `varietysold_name` | `DROPPED (production dataset — out of scope, FR-10)` |
| 31 | `in_packsize` | `DROPPED (production dataset — out of scope, FR-10)` |
| 32 | `source of the seed` | `DROPPED (production dataset — out of scope, FR-10)` |
| 33 | `class of the seed sold` | `DROPPED (production dataset — out of scope, FR-10)` |
| 34 | `amount sold in kg` | `DROPPED (production dataset — out of scope, FR-10)` |
| 35 | `buyers numbers` | `DROPPED (production dataset — out of scope, FR-10)` |
| 36–44 | `buyer_contact/soldto_1` … `buyer_contact/soldto_9` (9 columns) | `DROPPED (buyer-contact columns — out of scope, FR-10; natural-person buyer names, NFR-9)` |
| 45–54 | *(unnamed, `buyer_contact/soldto` overflow, 10 columns)* | `DROPPED (same `soldto_N` series as 36–44/55, header labels missing on this stretch; out of scope, FR-10; natural-person buyer names, NFR-9)` |
| 55 | `buyer_contact/soldto_20` | `DROPPED (buyer-contact columns — out of scope, FR-10; natural-person buyer names, NFR-9)` |

**Reconciliation:** 7 `MAPPED` (`traderName`, `region`, `district`, `marketLocation`, `phone`, `gpsLatitude`, `gpsLongitude`) + 2 `DERIVED` (`traderType`, `gpsAltitude`) + 44 `DROPPED` (3 + 15 named/unnamed production-dataset columns + 6 sale-detail columns + 9 named buyer-contact + 10 unnamed buyer-contact + 1 named buyer-contact = 44) + 0 `EMPTY-IN-SOURCE` = **53 = 53 measured columns.** ✅

**No contaminated-row register for this sheet.** The 289–312 tail is an excluded block (FR-10), not row-level contamination of otherwise-valid data — recorded above, not repeated as a register.

---

## 5. Column-count reconciliation — all 8 sheets

Denominators are per the FR-1 column-universe rule (§1.4): named columns plus any unnamed column that carries data in any data row.

| Sheet | Measured denominator (`requirements.md` §3.1) | Dispositions recorded | Status |
|---|--:|--:|---|
| `Offtaker_Beans` | 16 named + 1 unnamed = **17** | 17 | ✅ T-7 |
| `Offtaker_Sorghum` | 13 (no unnamed data-bearing columns) | 13 | ✅ T-7 |
| `Offtaker_Groundnuts` | 13 (no unnamed data-bearing columns) | 13 | ✅ T-7 |
| `Bulk buyers_beans` | 17 (no unnamed data-bearing columns) | 17 | ✅ T-8 |
| `Humantarian` | 9 named + 1 unnamed = **10** | 10 | ✅ T-8 |
| `Digital Service Provider` | 9 named + 1 unnamed = **10** | 10 | ✅ T-8 |
| `Seed Company` | 26 named + 2 unnamed = **28** | 28 | ✅ T-8 |
| `QDS_ Seed producers` | 41 named + 12 unnamed (cols 13, 19, 45–54) = **53** | 53 | ✅ T-8 |

**All 8 sheets now carry a full column disposition, closing FR-1's column universe for the whole workbook.** T-7 delivered the three offtaker sheets (§3.1–§3.3); T-8 delivered the remaining five (§4.1–§4.5). Every denominator above matches `requirements.md` §3.1 exactly, and every sheet's disposition count sums to its own denominator (shown per-sheet in each Reconciliation line in §3/§4). §8 records the measurement discrepancies T-8 found against the published draft — none of them change a denominator or a disposition count in this table.

---

## 6. Measurement corrections raised by this task

Per this spec's standing rule (`requirements.md` §1: *"measurement wins over estimate"*), the counts below were re-verified directly against the workbook — not copied from the task brief or `design.md` — because they feed a natural-key scheme this spec calls irreversible (D-2). Both corrections are visible in the raw cell dumps behind §3.2/§3.3 and were independently cross-checked at least twice before being recorded here.

### 6.1 Blank-id counts

| Sheet | Previously stated | Measured (this task) | Verified by |
|---|--:|--:|---|
| `Offtaker_Beans` | 15 | **15** | Exact match — no correction |
| `Offtaker_Sorghum` | 30 | **17** | Full column dump, rows 2–116, cell type + value; blanks are contiguous at rows 100–116 |
| `Offtaker_Groundnuts` | 7 | **6** | Full column dump, rows 2–152 excluding the blank row 146 |
| **Total (3 sheets)** | **52** | **38** | — |

The **2** intra-sheet duplicate ids in `Offtaker_Sorghum` are confirmed exactly as stated (rows 49/64 and 61/62) — that part of the prior count is correct. Total positional-key rows across the three offtaker sheets is therefore **40** (38 blank + 2 duplicate-second-occurrence), not 54.

**Why this matters:** FR-2, `design.md` DD-9, and `tasks.md` T-7's own scope line all cite **52**. This document uses the measured **38**/**40** throughout §3, because a positional key is either right or it silently corrupts a `traderId` — the one thing FR-2 calls irreversible.

**Resolved 2026-08-04.** The Leader independently re-verified this finding, the user approved the pivot (Option 1, full §3.1 re-measurement), and `requirements.md`, `design.md`, and `tasks.md` are now corrected to **38**/**40** throughout — see `execution.md`'s Pivot Record.

### 6.2 `Offtaker_Groundnuts` contaminated-row register

`design.md` §9 and `tasks.md` T-7 cited rows **147–151**. Measured: **149–152**. Full correction and evidence in §3.3.

**Resolved 2026-08-04.** Corrected in `design.md` (§9, §9.1's yield chain, DD-9's sibling) and `tasks.md` as part of the user-approved T-7 pivot — see `execution.md`'s Pivot Record.

**Why a 5-row sample would have missed this:** `design.md` §9's substitute-2 minimum is 5 rows per sheet. A 5-row sample landing on 147–151 (the previously published range) would have shown rows 147–150 as *plausibly* contaminated (148 already has an unresolved trader type; 149–150 are genuinely contaminated) and might not have surfaced that 147 itself is clean and 152 is missing from the range entirely. Only tracing the full 8-row block (145–152) made the true 4-row boundary unambiguous — the basis for §1.4's decision to trace all three sheets in full rather than sample them.

---

## 7. Verification run for this task

| Check | Command | Result |
|---|---|---|
| Doc↔constant assertion | `cd backend && npm test -- normalize` | See task report |
| Per-sheet column-count arithmetic | Manual, shown in §3.1/§3.2/§3.3 and §5 | Shown above |
| NFR-9 grep gate | `requirements.md` §9 D-7's command | See task report |

### 7.1 T-8 verification (2026-08-04)

| Check | Command | Result |
|---|---|---|
| Doc↔constant assertion (regression guard — §2's table is unchanged by this task) | `cd backend && npm test -- normalize --silent` | **PASS.** `src/common/normalize.spec.ts`, 43/43 tests |
| Per-sheet column-count arithmetic, §4.1–§4.5 | Manual, shown in each sheet's Reconciliation line and §5 | 17+10+10+28+53 = 118, each sheet's disposition count equals its own denominator |
| NFR-9 grep gate | `requirements.md` §9 D-7's command, run against `docs/specs/import-export docs/specs/actors docs/specs/admin docs/specs/epic backend/src` | **Caught and fixed one violation during this task** — a first draft of §4.4's `Phone number` row quoted the real `Seed Company` multi-number phone cell verbatim. Corrected before this report; re-run returns only the pre-existing synthetic `+2557000000*`/`+255711111111`/`+255799999999`/`612345678`/`812345678`-family test fixtures already present in `backend/src/test` and `backend/src/common/normalize.spec.ts` (same baseline `execution.md:138` records for T-1) |

**Cell-by-cell trace performed for this task.** All five sheets were traced in full, not spot-checked, extending §1.5's standard beyond the §9 substitute-2 minimum (≥5 rows per sheet) for the same reason T-7 gave: a full trace on sheets this size costs no more than a sample, and a sample would have missed the `Seed Company` column-12 finding (§8.3) and the QDS cbo-block duplicate/personal-name findings (§8.4), both of which required inspecting every row, not a subset. `Bulk buyers_beans`: all 166 physical data rows, block boundaries and forward-fill columns verified by script. `Humantarian`: all 35 data rows, `Category` alias-resolution checked value-by-value against the live `TRADER_TYPE_ALIASES`/`TRADER_TYPE_BY_LOWER` maps, `Location` checked value-by-value against `CANONICAL_REGIONS`. `Digital Service Provider`: all 13 data rows. `Seed Company`: all 11 data rows, every one of the 30 physical columns' fill rate measured individually. `QDS_ Seed producers`: all 311 data rows for category/region/district fill and dedup; all 55 physical columns' fill rate measured; the 26-row `cbo` block traced name-by-name for dedup and personal-name hand-classification.

---

## 8. Findings raised by this task (T-8)

Per this spec's standing rule (`requirements.md` §1: *"measurement wins over estimate"*) and this task's brief (*"if the workbook contradicts `requirements.md`/`design.md`, report the contradiction as a finding — do not silently adopt either side, and do not edit the sibling documents"*), the items below are measured disagreements with the published draft. None of them change a §1.4 denominator or a disposition count in §4 or §5 — every sheet's disposition table already sums to its measured denominator regardless of how these are ultimately resolved. They are reported here for the Leader to adjudicate, exactly as T-7's §6 reported its own.

### 8.1 `Bulk buyers_beans` — OQ-4's `…AMCOs` count

`requirements.md` §10 (OQ-4) states **15** of the 26 organisations are named `…AMCOs`. Direct measurement of all 26 identity-row names (§4.1) found **12**: identity rows 143, 150, 154, 160, 166, 170, 175, 180, 186, 191, 196, 202. Does not affect DD-2's interim `bulk_buyer` assignment (OQ-4 remains open either way), and does not change the 26/18-net BBB figures anywhere else in this spec.

### 8.2 `Digital Service Provider` — 2 additional region-ambiguous domestic rows

`design.md` §9.1 nets `Digital Service Provider` at **10** (the 13 physical rows minus the 3 D-3 foreign exclusions, with no further quarantine). Direct measurement of the 10 domestic rows' `Location` values (§4.3) found rows 3 and 4 both hold `"West and South Tanzania "` — a multi-region descriptive value that `normalizeRegion` refuses, the same class of refusal FR-3 already documents for `Humantarian`'s `"Across Tz"`. If these 2 rows quarantine on `region` the same way the `Humantarian` scenario is required to, `Digital Service Provider`'s expected net becomes **8**, not 10 — a **−2** shift to `design.md` §9.1's yield table and the ~757 grand total. This task does not alter the DSP disposition table's `MAPPED → region` label (a source value being ambiguous does not change what it maps to); it flags that the yield table's arithmetic needs the Leader's review.

### 8.3 `Seed Company` — physical column 12 and the GPS count

Two related measurements against DD-11 and its "only 7 of the 11 have coordinates" note, both detailed in full in §4.4:

- **Column 12** (unnamed on both header rows, 11/11 filled) holds what reads as the sheet's true "Where is the offtaker based" data, physically displaced from its own header (column 9, 0/11 filled). This does not change DD-11's binding quarantine-all-11 disposition, but it changes how the AT team's mandated region pass gets done — from "no information" to "mostly-there text needing light cleanup."
- **GPS coordinates**: measured **6 of 11** rows filled (rows 3, 5, 7, 8, 9, 10), not the 7 DD-11 cites. Does not change DD-11's rejection of reverse-geocoding as a substitute derivation.

### 8.4 `QDS_ Seed producers` — the cbo-block net and the "1 blank category" line

`design.md` §9.1 states QDS nets at **~22** (~23 pre-quarantine, 1 blank-category quarantine). Direct measurement (§4.5) instead finds:

- The **26** `cbo` rows collapse to **23 distinct names** under DD-6's case-insensitive dedup rule — matching the *pre-quarantine* ~23 exactly.
- **No row in the `cbo` block has a blank `producer_category`** — all 26 are `cbo` by construction of the selection rule. The sheet's one genuinely blank-category row (row 312) sits inside the already-excluded 289–312 tail, so it cannot also be an independent quarantine inside the ~23. This task could not locate a basis for §9.1's "1 blank category" line for QDS.
- Applying DD-6's mandatory hand-classification instead finds **5 of the 23** distinct `cbo` names are personal names (rows 2, 4, 8, 20, 23), which D-1's organisation-only rationale requires excluding — the same reasoning that excludes the 261 `individual`-category rows elsewhere on the sheet.

Net: **23 − 5 = 18**, not ~22 — a **−4** shift to `design.md` §9.1's yield table and the ~757 grand total.

**Combined effect if the Leader accepts 8.2 and 8.4 as written:** `design.md` §9.1's total moves from **434 + 97 + 145 + 18 + 31 + 10 + 0 + 22 = 757** to **434 + 97 + 145 + 18 + 31 + 8 + 0 + 18 = 751**. `Humantarian` (31) and `Bulk buyers_beans` (18) are independently **confirmed**, not contradicted, by this task's measurement — stated explicitly because T-7 FAILed once on an unverified sibling-document claim, and this task verified both before writing this line.

### 8.5 Minor: QDS DMS cell count

`requirements.md`/`design.md` cite **71** DMS-format coordinate cells. Direct measurement found **70** (35 latitude + 35 longitude, the same 35 rows for both). Does not change DD-10's blank-and-flag disposition.

**None of §8.1–8.5 required editing `normalize.ts`, `requirements.md`, `design.md`, or `tasks.md` — per this task's file-list constraint, they are reported here for the Leader to adjudicate, not resolved by edit.**
