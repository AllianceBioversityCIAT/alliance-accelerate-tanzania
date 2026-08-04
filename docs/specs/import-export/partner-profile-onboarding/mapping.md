# Mapping — Partner Profile Workbook → Canonical Import Template

- Spec path: `docs/specs/import-export/partner-profile-onboarding/`
- Traces: `requirements.md` FR-1, FR-2, FR-3, FR-4, NFR-9 · `design.md` §4.2, §4.5, DD-2, DD-5, DD-9
- Status: **T-7 delivers the document skeleton (§1–§2) and the three offtaker sheets (§3.1–§3.3).** §4's five remaining sheets are `[ ]` **pending T-8** — headers only, so the document's shape is fixed before that task starts.
- Source: `Partner Profile 14.4.2026.xlsx`, read in place from outside this repository. **Never copied in** (NFR-9). Every count below was re-measured directly from the workbook on **2026-08-04** using `exceljs`, independently of the counts already published in `requirements.md`/`design.md` — see §6 for the three places that re-measurement disagreed with the published draft.

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

## 4. Sheets pending T-8 — skeleton only

These five headings exist so the document's shape is fixed before T-8 starts; **no disposition below is authored by this task.**

- [ ] `Bulk buyers_beans` (prefix `BBB`) — block-structured, forward-fill rule, positional keys only (no id column)
- [ ] `Humantarian` (prefix `HUM`) — merged title row, positional keys only, the DD-1 residual-row question (§2) belongs here
- [ ] `Digital Service Provider` (prefix `DSP`) — positional keys only, 3 foreign exclusions (D-3)
- [ ] `Seed Company` (prefix `SDC`) — positional keys only, all quarantine pending an AT-team region pass (DD-11)
- [ ] `QDS_ Seed producers` (prefix `QDS`) — organisation-only selection (D-1/FR-10), case-insensitive dedup, hand-classified `cbo` block by row number only

---

## 5. Column-count reconciliation — all 8 sheets

Denominators are per the FR-1 column-universe rule (§1.4): named columns plus any unnamed column that carries data in any data row.

| Sheet | Measured denominator (`requirements.md` §3.1) | Dispositions recorded | Status |
|---|--:|--:|---|
| `Offtaker_Beans` | 16 named + 1 unnamed = **17** | 17 | ✅ this task |
| `Offtaker_Sorghum` | 13 (no unnamed data-bearing columns) | 13 | ✅ this task |
| `Offtaker_Groundnuts` | 13 (no unnamed data-bearing columns) | 13 | ✅ this task |
| `Bulk buyers_beans` | 17 (no unnamed data-bearing columns) | — | pending T-8 |
| `Humantarian` | 9 named + 1 unnamed = **10** | — | pending T-8 |
| `Digital Service Provider` | 9 named + 1 unnamed = **10** | — | pending T-8 |
| `Seed Company` | 26 named + 2 unnamed = **28** | — | pending T-8 |
| `QDS_ Seed producers` | 41 named + 12 unnamed (cols 13, 19, 45–54) = **53** | — | pending T-8 |

**Corrected at the T-7 pivot (2026-08-04, `execution.md` Findings 1–3), superseding the counts this task originally reported to the team lead in §6.** The previous run of this table used the then-uncorrected 52-blank-id and 147–151 figures and named-column-only counts for the five pending sheets; all are now current across `requirements.md`, `design.md`, and `tasks.md` (user-approved pivot).

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
