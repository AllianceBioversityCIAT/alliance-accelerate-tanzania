# Requirements — Partner Profile Workbook Onboarding

- Spec path: `docs/specs/import-export/partner-profile-onboarding/`
- Status: Draft
- Author / Date: AKILI (`/akili-specify`) on behalf of JuanCode — 2026-08-04
- Depth: **Full** (real client PII at scale · irreversible natural keys · consent gating · 8 heterogeneous source schemas)
- Related: `docs/prd.md` §5 / AC-5 / US-6 · `docs/trd/trd.md` §3, §5, §8, QA-2, QA-9 · `docs/ux-ui/design.md` §4 (Import screen) · parent epic `epic/hybrid-actor-registration` (chunk **2 of 4**) · depends on archived `actors/registration-source-and-consent` (chunk 1)
- Source file: `Partner Profile 14.4.2026.xlsx` (client, 2026-04-14) — **not committed to this repository**; see NFR-9

---

## 1. Summary

Onboard the client's real dataset — **8 sheets, 8 different schemas** — into the registry through the *existing* Admin import, producing roughly **750 actor records** (806 candidates less the mandated quarantines) that are fully accounted for, carry a globally unique and traceable natural key, and are invisible to the public until the ACCELERATE Tanzania (AT) team evidences consent per record.

The deliverable is deliberately **a mapping specification plus narrow importer hardening**, not an importer that understands 8 schemas (epic §9 Option A). This advances PRD **US-6** (admin bulk import) and **AC-5** (per-row reporting, no partial corruption), and it is the first time the registry holds production data at scale.

> **This document is grounded in measurement, not in the proposal's estimates.** Every count below was measured directly from the source workbook on **2026-08-04** using `exceljs`. Where measurement contradicted `proposal.md`, measurement wins and §3.1 records the correction.

---

## 2. Requirement Numbering & Writing Standards

- Functional requirements are `FR-1 …`; non-functional `NFR-1 …`.
- Each requirement is atomic and testable. Priority via **MUST / SHOULD / MAY** (RFC 2119).
- Each requirement traces upward to a PRD story/criterion or an epic decision, and downward to a task in `tasks.md`.
- **Two artifact classes.** This spec produces *documents* (`mapping.md`, `reconciliation.md`, runbook) and *code* (`backend/src/common`, `backend/src/actors`). Requirements state which, because their verification differs fundamentally — see §9.

---

## 3. System Context & Scope

### 3.1 Measured source workbook

| Sheet | Header row | Physical data rows | **Actors yielded** | Column denominator (FR-1 D-5, see rule below) | Notes that change the mapping |
|---|:--:|--:|--:|:--:|---|
| `Offtaker_Beans` | 1 | 436 | **436** | 16 named + 1 unnamed-with-data → **17** | `Trader_id` blank on 15 rows · `Email` column present but **100% empty** · physical column 2 is unnamed but **421/436 (97%)** filled |
| `Offtaker_Sorghum` | 1 | 115 | **115** | 13 named + 0 unnamed → **13** | `Trader_ID` blank on 17 · **2 duplicate ids within the sheet** · `Region` blank on 6 · type `"Retaler"` (typo) on 11 |
| `Offtaker_Groundnuts` | 1 | 150 | **150** | 13 named + 0 unnamed → **13** | No `Region` column at all · `Trader_ID` blank on 6 · **4 rows carry a phone number in the trader-type column** (column-shifted rows) · `Capacity (volume)` has no unit |
| `Bulk buyers_beans` | **3** | 166 | **26** | 17 named + 0 unnamed → **17** | **Block-structured**: one identity row (region · district · offtaker name) followed by year-metric rows with blank identity. No id column. Only **14 of 26** have a resolvable region |
| `Humantarian` | **2** | 35 | **35** | 9 named + 1 unnamed-with-data → **10** | Row 1 is a merged title (`D1:H1`). No id column. `Category` resolves for only 26 of 35 · physical column 1 is unnamed but **35/35 (100%)** filled |
| `Digital Service Provider` | **2** | 13 | **10 candidates → 8 net** | 9 named + 1 unnamed-with-data → **10** | `Website` column present but **100% empty** · `Category` resolves for **0 of 13** · **3 actors are outside Tanzania** · physical column 1 is unnamed but **13/13 (100%)** filled · 2 of the 10 domestic rows carry a region-ambiguous value (`"West and South Tanzania "`) that `normalizeRegion` refuses, the same refusal class as `Humantarian`'s `"Across Tz"` — net corrected 10 → 8 at the T-8 pivot (`execution.md`) — C-6 |
| `Seed Company` | 1 (+ **sub-header row 2** = `lat`/`long`) | 11 | **11 candidates → 0 net** | 26 named + 2 unnamed-with-data → **28** | Data starts at **row 3**. No id column · 7 columns entirely empty · **no region and no district data at all** (location column **0/11** filled — corrected from 0/12 at the T-10 close, `execution.md` — **C-15**), so all 11 quarantine pending an AT-team region pass — FR-3, `design.md` DD-11 · two unnamed columns carry data: physical col 12 (11/11) and col 8 (6/11) |
| `QDS_ Seed producers` | 1 | 311 (292 distinct names) | **~23 candidates → 18 net** | 41 named + 12 unnamed-with-data → **53** | 55 physical columns · sorted by category · **249 of 292 (85%) are `individual` — natural persons** · **rows 289–312 are not producers at all** (research institutes + the `Seed Company` sheet repeated — the `seed source` vocabulary) · **70 coordinate cells are DMS, not decimal** (corrected from 71 at the T-8 pivot, `execution.md` — C-11) · altitude carries units in-cell · unnamed data-bearing columns: physical col 13 (305/311), col 19 (108/311), and cols 45–54 (2–4 rows each) · DD-6's mandatory hand-classification excludes 5 of the 23 distinct `cbo` names as personal names (D-1) — net corrected ~22 → 18 at the T-8 pivot (`execution.md`) — C-7; the sheet's one blank-`producer_category` row (312) sits inside the already-excluded 289–312 tail, not a separate quarantine |
| **Total** | | **1,237** | **806 candidates → ~751 net** | | 806 is the pre-quarantine ceiling; ~751 is the expected net after the quarantines FR-3/FR-4/FR-10 mandate (`design.md` §9.1, corrected from ~748 to ~752 to ~757 across the T-7 pivot/rework — C-3/C-5, then to ~751 at the T-8 pivot — C-8) |

**Column denominator rule (FR-1, added by the T-7 pivot — 2026-08-04):** the "column denominator" column above is what FR-1's acceptance criteria and D-5's arithmetic gate (§9) hold `mapping.md` to. It is **not** the same as a sheet's *named*-column count. See FR-1's acceptance criteria for the rule itself.

> **Count correction (during Phase 2).** An earlier draft of this table put QDS at 42 and the total at 825, by trusting `producer_category` to distinguish organisations from individuals. Deeper measurement showed the sheet's tail (rows 289–312) is the *seed-source vocabulary*, not a producer list — see `design.md` §9 and DD-6. The organisation-only decision (D-1) stands and is better justified; only the count changed. `reconciliation.md` reports the actual figure; no requirement depends on the estimate (A-2).

**Corrections to `proposal.md` (measurement vs. estimate):**

| Claim in `proposal.md` | Measured |
|---|---|
| `Bulk buyers_beans` ≈ 229 rows | **26 organisations** — the sheet is block-structured, not flat |
| `Offtaker_Sorghum` ≈ 128 rows | **115** |
| `Digital Service Provider` adds a `Website` column | Column exists, **0 of 13 filled** |
| QDS onboarded "only as organisations" | The sheet **is** 85% natural persons; genuine producer organisations must be *selected out*, and are only **~23** — its tail is the seed-source vocabulary, not producers (`design.md` DD-6) |
| Expected yield ≈ 900–1,000 (A-2) | **~806** after the §4 exclusion decisions |
| `traderId` collisions are the cross-sheet problem (B-1) | Cross-sheet overlap is only **6 ids**; the larger problems are **38 blank ids** and **2 intra-sheet duplicates** |

### 3.2 In scope

Documents: `mapping.md`, `reconciliation.md`, a re-run runbook, and a district→region reference table.
Code: phone normalization, a per-reason quarantine breakdown on the import report, and the district→region lookup constant.
Data: one filled canonical-template workbook **per source sheet**, produced by the AT team from `mapping.md`.

### 3.3 Out of scope

- Teaching the importer the 8 source schemas (epic Option B, declined).
- The QDS production dataset (season · variety · acreage · harvest · the up-to-20 buyer-contact columns) and **the 249 QDS natural persons** — see FR-10.
- Bulk-buyer trade metrics and seed-company commercial profiles.
- Publishing anything. Every record lands `UNKNOWN` (FR-6).
- An update/upsert import mode. The importer skips existing `traderId` by design.
- Automated cross-sheet de-duplication (FR-8 *flags* candidates; a human decides).
- Any new API endpoint, screen, or infrastructure.

---

## 4. Decisions taken at specify time

These were open questions in `proposal.md`; all three are now settled and **load-bearing on the requirements below**.

| ID | Question | **Decision** | Consequence |
|---|---|---|---|
| **D-1** | QDS: 249 of 292 producers are natural persons | **Organisations only — measured at ~23 records.** The 249 `individual` rows are excluded, as is the rows 289–312 seed-source block | Registry stays an *organisation* directory (PRD §1 framing). Avoids publishing named individuals with phone + farm GPS. Reversible later |
| **D-2** | `traderId` namespacing (irreversible — epic R-1) | **Prefix + source id, positional fallback**: `OFB-1036`; `OFB-R088` when the source id is blank or collides within its sheet | Guaranteed unique, traceable to sheet **and** row, and deterministic on re-run. Two key shapes coexist |
| **D-3** | 3 DSP actors outside Tanzania | **Excluded at mapping time**, reason recorded as *"outside Tanzania — PRD §5"* | `region` stays honest; the region filter and map are not corrupted. DSP yields 10, not 13 |

Sheet prefixes fixed by D-2: `OFB` · `OFS` · `OFG` · `BBB` · `HUM` · `DSP` · `SDC` · `QDS`.

---

## 5. Stakeholders / Personas

| Persona | Role here |
|---|---|
| **AT/Alliance data team** | Executes the mapping: fills one canonical template per sheet from `mapping.md`. Owns consent evidence |
| **Admin** (`Admin` role) | Runs preview + commit uploads; reads the per-reason quarantine breakdown |
| **Program lead** | Audits `reconciliation.md` — the answer to *"are all source rows accounted for?"* |
| **Public visitor** | **Sees nothing from this onboarding.** Every record is `UNKNOWN`, excluded by the ADR-004 `WHERE` |

---

## 6. Functional Requirements

### FR-1: Per-sheet mapping specification with total column accountability

- **Description:** The system MUST ship `mapping.md` recording, for **every column of every one of the 8 sheets**, exactly one disposition: `MAPPED → <canonical column>`, `DERIVED → <canonical column> (rule)`, `DROPPED (reason)`, or `EMPTY-IN-SOURCE (present, no data)`. No column may be unaccounted for.
- **Artifact class:** Document.
- **Rationale / Source:** epic §12 success criterion 1; `proposal.md` §4.1. `EMPTY-IN-SOURCE` is a new fourth disposition required by measurement — `Offtaker_Beans.Email`, `DSP.Website`, and 7 `Seed Company` columns exist but hold no data, and recording them as "dropped" would misrepresent the source.
- **Acceptance criteria:**
  - **Column universe / D-5 denominator rule (added by the T-7 pivot — 2026-08-04, resolving `execution.md` Finding 3):** the column universe a sheet's dispositions must sum to is **every column that carries a header name, OR contains data in any data row.** A column that is physically present but both unnamed and empty is recorded once as the sheet's physical extent and is **not** dispositioned. This is the denominator §3.1's "Column denominator" column states per sheet, and it can exceed the *named*-column count — e.g. `Offtaker_Beans` has 16 named columns but a denominator of **17**, because physical column 2 is unnamed yet 97% filled
  - GIVEN `mapping.md` WHEN every sheet's column count is compared against the measured **denominators** in §3.1 THEN each sheet's dispositions sum to its full denominator, not merely its named-column count
  - AND IT MUST record the **header row** and **first data row** per sheet, including `Bulk buyers_beans` = row 3 and `Seed Company` data starting at **row 3** because row 2 is a `lat`/`long` sub-header
  - BUT it must NOT leave any column implicit — a column absent from `mapping.md` is a spec defect, not a silent drop, and an unnamed data-bearing column is a column like any other for this purpose
- **PII/RBAC impact:** `mapping.md` describes PII columns (`phone`, `Email`, `Contact person`, `Telephone`, `contact_number`) but MUST NOT contain **any real PII value** as an example (NFR-9).

#### Scenario: Block-structured sheet is flattened by forward-fill

- GIVEN `Bulk buyers_beans`, where identity columns are populated only on the first row of each organisation's block
- WHEN the AT team applies `mapping.md`
- THEN identity (`Region_name`, `District`, `Offtaker name`) is **forward-filled** down the block and the block collapses to **one** actor row
- AND the sheet yields exactly **26** actors, not 166
- AND IT MUST record the per-block year-metric rows as `DROPPED (trade metrics — epic §6)`
- BUT it must NOT emit one actor per physical row

#### Scenario: A column present but empty is distinguished from a dropped column

- GIVEN `Offtaker_Beans.Email`, measured at 0 of 436 filled
- WHEN `mapping.md` records its disposition
- THEN it reads `EMPTY-IN-SOURCE`, not `DROPPED`
- AND IT MUST state that the canonical `Email` column is therefore left blank for every beans row

---

### FR-2: Deterministic, globally unique, traceable natural key

- **Description:** Every onboarded actor MUST carry a `traderId` of the form `<PREFIX>-<sourceId>` where the source id exists and is unique within its sheet, and `<PREFIX>-R<rowNumber>` otherwise (D-2). Keys MUST be reproducible: the same workbook mapped twice yields byte-identical keys.
- **Artifact class:** Document (rule) + verified by import.
- **Rationale / Source:** epic R-6; `proposal.md` R-1 (irreversible); PRD AC-5.
- **Acceptance criteria:**
  - GIVEN the 3 offtaker sheets, whose ids overlap on 6 values WHEN keys are assigned THEN zero `traderId` collisions occur across the whole onboarding
  - AND IT MUST assign a positional key to each of the **38** rows whose source id is blank and to the **2** `Offtaker_Sorghum` rows whose id duplicates another row in the same sheet
  - AND IT MUST use `<PREFIX>-R<row>` for all of `Bulk buyers_beans`, `Humantarian`, `Digital Service Provider`, `Seed Company`, and `QDS_ Seed producers`, which have no id column
  - AND `<rowNumber>` MUST be the **physical source row number** so a key resolves back to a cell in the client's file
  - BUT it must NOT reuse a source id that appeared earlier in the same sheet, and MUST NOT renumber rows to close gaps

#### Scenario: Re-running the mapping on an unchanged workbook is idempotent

- GIVEN a completed onboarding
- WHEN the same unchanged workbook is re-mapped and re-uploaded in commit mode
- THEN every row reports `skipped-exists` and **zero** actors are created
- AND IT MUST leave existing records byte-identical (the importer has no upsert mode)

---

### FR-3: Region resolution — derived where certain, quarantined where not

- **Description:** Every onboarded actor MUST carry a `region` drawn from `CANONICAL_REGIONS`. Where the source has no region column, region MUST be derived from district via a published lookup table. Where the source value is ambiguous, foreign, or unresolvable, the record MUST be quarantined or excluded — **never guessed**.
- **Artifact class:** Document (lookup table + rules) + code (`DISTRICT_TO_REGION`).
- **Rationale / Source:** epic R-5; `docs/trd/trd.md` §3 (`region` required); `normalize.ts` quarantine philosophy; PRD §5 (Tanzania only).
- **Acceptance criteria:**
  - GIVEN `Offtaker_Groundnuts`, which has **no `Region` column**, WHEN mapping runs THEN region is derived from `District` against the published table
  - GIVEN a district absent from the table THEN the row is quarantined against the **`region`** field. (Corrected after Judgment Day S-11: an earlier draft named a bespoke slug `region-unresolved`, but the breakdown vocabulary is derived from the failing column's `field` on `ImportRowError`, which `actor-import.service.ts:362-365` pushes as `region`. Inventing a slug here would have made a conformant implementation fail its own requirement.)
  - GIVEN the **4** ambiguous `Humantarian` locations (two multi-region values and two `"Across Tz"`) THEN those rows quarantine — matching `normalizeRegion`'s existing refusal to resolve `"Arusha/Dodoma"`
  - AND IT MUST exclude the 3 foreign DSP actors with the recorded reason from D-3
  - AND IT MUST quarantine the **8 of 26** `Bulk buyers_beans` organisations that have neither a region nor a district
  - AND IT MUST quarantine **all 11 `Seed Company` organisations** on the first pass: that sheet has no region column and its location column is **0 of 11 filled** (corrected from "0 of 12" at the T-10 close, `execution.md` — **C-15**), so district derivation cannot serve it. The AT team supplies a region per organisation to unblock them — these are 11 named companies with public addresses. Added after Judgment Day S-1, which found the sheet counted in the yield with no mechanism to satisfy a required field (`design.md` DD-11)
  - BUT it must NOT reverse-geocode GPS to an administrative region as a substitute — that is a guess wearing the costume of a derivation, and only 6 of the 11 have coordinates anyway (corrected from 7 at the T-8 pivot, `execution.md` — C-10)
  - BUT it must NOT substitute a placeholder, a nearest-neighbour, or a most-frequent region for an unresolved value

#### Scenario: District rescues a region-less record

- GIVEN a `Bulk buyers_beans` organisation with `Region_name` blank and `District` = a district present in the lookup table
- WHEN region derivation runs
- THEN the actor is created with the mapped region
- AND IT MUST record in `mapping.md` that the region was **derived**, not read from source
- BUT it must NOT mark the record as quarantined

---

### FR-4: Trader type assigned from sheet identity, not from the source category column

- **Description:** Canonical `traderType` MUST be written directly into the template's `Trader Type` column (which admits only `TRADER_TYPES`). The assignment MUST be driven by **sheet identity**, using a source category column only where its values unambiguously resolve to a canonical code.
- **Artifact class:** Document (per-sheet assignment table).
- **Rationale / Source:** Measurement. The source category columns are **not fit** to drive typing: `Digital Service Provider.Category` resolves for **0 of 13** rows (free-text business descriptors, one a full sentence), `Humantarian.Category` for 26 of 35, and QDS's `cbo` would resolve — via the *existing* `TRADER_TYPE_ALIASES` entry — to `humanitarian`, **misclassifying 23 QDS producers**.
- **Acceptance criteria:**
  - GIVEN each sheet WHEN `mapping.md` assigns trader types THEN the assignment is: `OFB`/`OFS`/`OFG` → column-driven (`informal_trader` / `offtaker`) · `BBB` → `bulk_buyer` · `HUM` → `humanitarian` · `DSP` → `digital_service_provider` · `SDC` → `seed_company` · `QDS` → `qds_producer`. (Corrected after Judgment Day S-17: an earlier draft carved out "the 9 rows self-declaring `Seed Company` → `seed_company`", which **contradicted FR-10** — those rows sit inside the 289–312 block FR-10 excludes as the seed-source vocabulary. Typing them would have created duplicate actors for seed companies already onboarded from their own sheet. The exception is withdrawn; FR-10's exclusion governs.)
  - AND IT MUST quarantine the **11** `Offtaker_Sorghum` rows typed `"Retaler"` unless an alias for that exact typo is added deliberately, and MUST record which choice was made
  - AND IT MUST quarantine the **4** `Offtaker_Groundnuts` rows whose trader-type cell contains a phone number, flagging them as **column-shifted rows requiring manual repair** — not as a taxonomy failure
  - AND IT MUST record that `Humantarian.Category` and `DSP.Category` are `DROPPED`, with the measured resolve rates as the reason
  - BUT it must NOT feed raw source category text into `normalizeTraderType` and accept whatever it returns

---

### FR-5: Phone normalization to E.164, with multi-number cells surfaced not silently truncated

- **Description:** The system MUST provide a phone normalizer producing Tanzanian E.164 (`+255…`) from the formats present in the source, and MUST NOT silently discard a second number in a multi-number cell.
- **Artifact class:** **Code** (`backend/src/common/normalize.ts` + import wiring).
- **Rationale / Source:** `proposal.md` R-5 / OQ-2. Measurement establishes this is genuinely unguarded today: `phone` is declared `@IsOptional() @IsString()` (`actor-create.dto.ts:88`) with **no format validation anywhere in the codebase**, so dirty values import verbatim.
- **Acceptance criteria (formats measured in the source):**
  - GIVEN a bare 9-digit local number THEN it normalizes to `+255` + the 9 digits
  - GIVEN a leading-zero national number (`0` + 9 digits) THEN the `0` is replaced by `+255`
  - GIVEN a country-prefixed number with internal spaces THEN spaces are stripped and `+` prepended
  - GIVEN a parenthesized country code THEN the parentheses are stripped
  - GIVEN a landline with internal spaces THEN it normalizes without loss
  - GIVEN a cell containing **two numbers separated by `/`** THEN the first normalizes into `phone` **AND the row carries a warning naming the discarded value's position** so the AT team can recover it
  - AND IT MUST return `null` — never a partially-mangled string — for input it cannot confidently normalize
  - BUT it must NOT invent a country code for a number whose length does not match a known Tanzanian pattern, and MUST NOT write a second number into any other Actor field (that would expand the PII surface — `proposal.md` OQ-2)
- **PII/RBAC impact:** `phone` is PII. The normalizer is pure and I/O-free; **no phone value may be logged**, including in warnings surfaced through the import report, which is Admin-gated but persisted in audit JSON.

#### Scenario: A multi-number cell does not silently lose a contact

- GIVEN a source phone cell holding two distinct numbers separated by `/`
- WHEN the row is imported
- THEN `phone` holds the normalized **first** number
- AND the row result carries a warning that a second number was present and not stored
- AND IT MUST NOT include the discarded digits in the warning text
- BUT it must NOT quarantine the row solely because a second number existed

---

### FR-6: Consent and registration-source posture — nothing becomes public

- **Description:** Every actor created by this onboarding MUST have `consentStatus = UNKNOWN`, `registrationSource = TEAM_MANAGED`, and `consentMethod = NOT_RECORDED`. Zero MUST appear in any public read path or in `/metrics`.
- **Artifact class:** Code-verified (assertion), document-stated (runbook).
- **Rationale / Source:** epic R-4 and ADR-004; `docs/trd/trd.md` QA-2; chunk 1's shipped defaults.
- **Acceptance criteria:**
  - GIVEN the full onboarding committed WHEN an anonymous visitor requests **`/actors`, `/actors/:id`, and `/metrics`** THEN **zero** onboarded actors appear in any response or count
  - **Scope correction (Judgment Day C-2):** an earlier draft also named `/actors/geo` and `/export`. **Neither endpoint exists** anywhere in `backend/src` — `pii-boundary.spec.ts:30-39` already records this as a correction made in chunk 1. Re-asserting them would be an Inherited-Claim FAIL under `.agents/reviewer.md`. The three paths above are the complete public read surface
  - AND IT MUST hold for `gps` — no exact coordinate is surfaced for a non-`GRANTED` record
  - AND IT MUST be **asserted over HTTP**, not inferred from the default value in the schema
  - BUT it must NOT be satisfied by the serializer alone; consent stays pinned in the Prisma `WHERE` (ADR-003/004)

---

### FR-7: Per-reason quarantine breakdown on the import report

- **Description:** The import report MUST carry an **additive** aggregation of failure reasons so an Admin can see *why* rows did not land without reading every row.
- **Artifact class:** **Code** (`backend/src/actors/actor-import.types.ts` + `actor-import.service.ts`).
- **Rationale / Source:** `proposal.md` §8; epic R-3 (silent data loss). Today `ImportReportTotals` counts `{rows, toCreate, created, skipped, failed, warnings}` and per-row `errors` are `{field, message}` with **no machine-readable code**, so no breakdown is derivable without grouping on `field`.
- **Acceptance criteria:**
  - GIVEN a preview or commit of a sheet with mixed outcomes WHEN the report is built THEN it includes a reason breakdown keyed by the failing `field` with a count per key, plus a distinct bucket for each `skipped-*` outcome
  - AND the breakdown's counts MUST sum to `failed + skipped` exactly
  - AND IT MUST be **purely additive** — every existing field of `ImportReport`, `ImportReportTotals`, and `ImportRowResult` keeps its current name, type, and meaning
  - BUT it must NOT include any PII in a key or a message, and MUST NOT change the existing per-row `errors` shape

---

### FR-8: Reconciliation report accounting for 100% of source rows

- **Description:** The system MUST ship `reconciliation.md` accounting for **every physical data row of every sheet** (1,237 in total) under exactly one of: `imported`, `collapsed-into-block`, `quarantined (reason)`, or `excluded (reason)`. Per-sheet totals MUST reconcile against §3.1.
- **How "every row" is satisfied (clarified after Judgment Day C-13):** by **per-sheet totals per bucket, plus explicit enumeration by row number of every `quarantined` and `excluded` row** — not by 1,237 individual line items. The `imported` and `collapsed-into-block` buckets are reported as counts, because a per-row list of successes adds no auditable information. Every row is therefore *accounted for* arithmetically, and every row that did **not** import is individually named.
- **Artifact class:** Document, produced by running the onboarding.
- **Rationale / Source:** epic §12; `proposal.md` R-3. A "successful import" of 700 rows from a 1,318-row file reads as success — the report is what makes that visible.
- **Acceptance criteria:**
  - GIVEN a completed onboarding WHEN `reconciliation.md` is read THEN each sheet's four classification counts sum to its measured physical data-row count
  - AND IT MUST state the **~806** expected total and the actual total, and explain any difference
  - AND IT MUST list cross-sheet duplicate **candidates** by organisation name — at minimum the one organisation measured in both `Seed Company` and `Bulk buyers_beans` — as flagged for human decision
  - AND IT MUST record the 249 excluded QDS individuals and the 3 excluded foreign actors as *decisions* (D-1, D-3), citing them
  - BUT it must NOT report a bare success count without the quarantined and excluded tallies beside it

---

### FR-9: Re-run runbook

- **Description:** The system MUST ship a runbook the AT team can follow unaided when the client sends an updated workbook.
- **Artifact class:** Document.
- **Acceptance criteria:**
  - GIVEN the runbook WHEN a competent AT team member follows it THEN they can produce the per-sheet template files, run preview, read the breakdown, and commit — without reading this spec or the source code
  - AND IT MUST require a **preview run per sheet before any commit**, and state that preview writes nothing
  - AND IT MUST state the measured upload bounds: `MAX_DATA_ROWS = 1000` and a 4 MB decoded-size cap per upload (`actor-import.service.ts:55-56`), and therefore prescribe **one upload per source sheet**
  - AND IT MUST require the current template version (`v2`) be re-downloaded, since a stale template is rejected
  - BUT it must NOT instruct anyone to set `consentStatus` to `GRANTED` as part of onboarding

---

### FR-10: QDS organisation-only selection

- **Description:** Per D-1, only genuine QDS **producer organisations** MUST be onboarded — measured at **~23**, the `cbo` block — deduplicated by producer name across seasons and varieties.
- **Artifact class:** Document (selection rule) + reconciliation evidence.
- **Acceptance criteria:**
  - GIVEN the 311 QDS rows / 292 distinct names WHEN the selection rule is applied THEN the 249 `individual` producers are excluded per D-1
  - AND IT MUST **also exclude rows 289–312**, which are not producers but the `seed source` vocabulary — 8 research-institute spellings of ~3 real institutes, plus the entire `Seed Company` sheet repeated verbatim (`design.md` DD-6). Importing them would create duplicate actors for organisations already onboarded from their own sheets
  - AND IT MUST deduplicate by name case-insensitively, so a producer appearing across multiple seasons yields **one** actor
  - AND IT MUST **hand-classify the `cbo` block**, where ~5 entries are personal names rather than groups and at least one pair is an internal duplicate — recording each judgment, since no gate can make it
  - AND IT MUST quarantine any producer whose `producer_category` is blank rather than assume a category
  - AND IT MUST record every exclusion as a counted, reasoned entry (FR-8)
  - BUT it must NOT import any of the season, variety, acreage, harvest, or buyer-contact columns
- **PII/RBAC impact:** Excluding the individuals is the *point* — it avoids creating 249 records whose `traderName` is a natural person's name alongside their phone number and farm GPS.

#### Scenario: DMS coordinates are not silently coerced

- GIVEN a QDS row whose latitude/longitude are in degrees-minutes form (measured on **70** cells, corrected from 71 at the T-8 pivot — `execution.md` — C-11), including at least one value with an out-of-range minutes component
- WHEN the row is mapped
- THEN GPS is either converted by a rule stated in `mapping.md` **or** left blank with the row flagged
- AND IT MUST NOT pass a DMS string into a decimal GPS column, where `Number()` coercion yields `NaN` or a wrong number
- BUT it must NOT quarantine the whole actor merely for unusable GPS — `gpsLatitude`/`gpsLongitude` are optional, so the actor imports without coordinates

---

### FR-11: Stale-template message clarity

- **Description:** The stale-template rejection message SHOULD name the current version, the detected version, and where to obtain the current template.
- **Artifact class:** Code.
- **Rationale / Source:** `proposal.md` §5 (carried from chunk 1's `v2` bump).
- **Acceptance criteria:**
  - GIVEN a `v1` workbook uploaded against `TEMPLATE_VERSION = v2` THEN the 400 names both versions and points to the download location
  - BUT it must NOT change the existing detection logic or the error envelope shape

---

## 7. Non-Functional Requirements

| ID | Requirement | Measure |
|---|---|---|
| **NFR-1** | **PII boundary holds.** `src/test/pii-boundary.spec.ts` MUST be green **before** any commit-mode upload runs, and after. | Test exits 0. This is a release gate (`backend/CLAUDE.md`), not a checklist item |
| **NFR-2** | **Public invisibility at scale.** With every onboarded record committed, zero appear in any of the three public read paths (`/actors`, `/actors/:id`, `/metrics`). | **Operator-run** post-commit HTTP check (`design.md` §7.1), recorded in `reconciliation.md`. No automated gate exists — the only HTTP-level suite mocks the database (§9 D-3b). Never inferred from schema defaults |
| **NFR-3** | **Additive-only changes.** No existing exported signature, report field, template column, or `TEMPLATE_VERSION` changes. | `npm run build` + existing suites green with **no test edited to accommodate a changed shape** |
| **NFR-4** | **Single source of truth.** New constants (`DISTRICT_TO_REGION`, phone patterns) live in `backend/src/common/normalize.ts` beside `CANONICAL_REGIONS`, edited in one place (TRD DD-5). | Code review; no duplicated region or district list elsewhere |
| **NFR-5** | **Purity.** New normalizers import no Nest, Prisma, or I/O, matching the existing `normalize.ts` contract. | Unit-testable with no harness; import graph inspected |
| **NFR-6** | **Determinism.** Key assignment and normalization are pure functions of their input — no clock, no randomness, no ordering dependence. | Same input twice → identical output, asserted in tests |
| **NFR-7** | **Audit integrity.** Import creates `ActorAuditLog` rows in the same `$transaction` as the actors, per existing behavior. | Existing import audit tests stay green |
| **NFR-8** | **No partial corruption.** A bad row never corrupts a committed row (PRD AC-5, TRD QA-9). | Existing per-row isolation tests stay green with the new breakdown in place |
| **NFR-9** | **The source workbook and its PII stay out of the repository.** No real phone, email, contact-person name, or individual producer name may appear in any committed file — spec documents included. | Grep gate: §9 D-7, verified clean 2026-08-04 after redacting three real numbers from `proposal.md` (§10 OQ-1). The workbook itself is read in place from outside the repo and never copied in |

---

## 8. Data & Schema Impact

**No Prisma schema change. No migration. No new entity, field, endpoint, or PII field.**

| Change | Location | Kind |
|---|---|---|
| `DISTRICT_TO_REGION` lookup constant | `backend/src/common/normalize.ts` | Added constant |
| `normalizePhone()` (+ multi-number detection) | `backend/src/common/normalize.ts` | Added pure function |
| Reason breakdown on the report | `backend/src/actors/actor-import.types.ts`, `actor-import.service.ts` | Added optional field |
| Stale-template message text | `backend/src/actors/actor-import.service.ts` | Changed string |

The PII allowlist is **unchanged** — `phone` is already declared PII in `common/pii-consent.policy.ts`. Normalizing a value does not change its classification.

> **TRD clarification needed (documentation-only):** `docs/trd/trd.md` §3 presents its CSV-header→field table as *"authoritative for the import service"*. It describes the **canonical template**, not this client workbook. A note distinguishing the two prevents a future reader mapping the client's `gpslatitude` spellings straight onto the canonical schema.

---

## 9. Defect classes this spec can produce, and the gate for each

The dominant risk here is **not** a code defect. It is a **semantically wrong mapping that every automated gate accepts** — a value landing in a structurally valid but factually wrong column. Naming that plainly (KZ-002) is the point of this section.

| # | Defect class | Gate | Automated? |
|---|---|---|---|
| **D-1a** | Phone normalizer returns a wrong value; a `DISTRICT_TO_REGION` value is not a canonical region; `mapping.md`'s published table drifts from the constant | `cd backend && npm test -- normalize` — table-driven format cases, membership assertion, and a doc↔constant assertion (`design.md` §4.2) | **Yes** |
| **D-1b** | **A district is mapped to the *wrong* region** | **No automated gate.** Membership and doc↔constant assertions both pass on a wrong pairing — e.g. `Mbozi → Mbeya` instead of `Songwe` is a valid canonical region, just not the right one. Corrected after Judgment Day S-3, which found this class previously mis-classified as automated | **NO** — see substitute 4 below |
| **D-2** | Report breakdown miscounts, or a field's shape changed | `cd backend && npm test -- import` + `npm run build`; assert breakdown sums to `failed + skipped` (FR-7) | **Yes** |
| **D-3a** | The serializer or consent `WHERE` leaks a record class | `cd backend && npm test -- pii-boundary` (NFR-1) — real HTTP → controller → service → serializer over the **three public paths that exist** | **Yes** |
| **D-3b** | **An onboarded record reaches the public surface at scale** | **No automated gate.** `pii-boundary.spec.ts:19-26` mocks `PrismaService` with in-memory fixtures, so it structurally cannot observe the onboarded dataset. Corrected after Judgment Day C-3. Substitute: the operator-run post-commit check in `design.md` §7.1 / §4.6 item 4, recorded in `reconciliation.md` | **NO** |
| **D-4** | `traderId` collision or non-reproducible key | Import preview reports `skipped-duplicate-in-file`; re-run yields zero creates (FR-2) | **Yes** |
| **D-5** | A source column silently omitted from `mapping.md` | Column-count reconciliation against §3.1, per sheet (FR-1) | **Partly** — the count is checkable; whether the *target* is right is not |
| **D-6** | **A column mapped to the wrong canonical column** (e.g. `Town` → `marketLocation` vs `district`), or a wrong trader type | **No automated gate exists.** The artifact is a human-filled spreadsheet; the importer validates *shape*, not *meaning*. A phone in the trader-type column passes every type check | **NO** |
| **D-7** | Real PII committed to the repository | `grep -rnE '\b(0[67][0-9]{8}\|255 ?[67][0-9]{8}\|[67][0-9]{8})\b' docs/specs/import-export docs/specs/actors docs/specs/admin docs/specs/epic backend/src --include='*.md' --include='*.ts'` returns nothing once the three `+2557000000*`-style test fixtures are excluded (NFR-9). Word boundaries matter: without them 14-digit migration timestamps match | **Yes** |
| **D-8** | Quarantine/exclusion tallies drift from reality | `reconciliation.md` totals reconcile per sheet (FR-8) | **Partly** — arithmetic is checkable; classification correctness is not |

**Substitutes for D-6 — the unmeasurable class.** Because no command can evaluate it:

1. **Mandatory human review of `mapping.md` at the HITL approval gate**, sheet by sheet, before any commit-mode upload. This is a named requirement of the runbook (FR-9), not an informal step.
2. **Preview-mode spot-check with a defined sample:** for each sheet, at least **5 rows** (or all rows if fewer) are traced cell-by-cell from source row to preview output. Recorded in `reconciliation.md`.
3. **Accepted residual risk:** below that sample rate, a wrong-column mapping can ship. Recorded here deliberately — an acknowledged blind spot is recoverable; an unacknowledged one consumes rework rounds (KZ-002).
4. **For D-1b (wrong district→region pairing):** the published table is reviewed against an authoritative Tanzanian administrative list at the HITL gate, and any district whose region is uncertain is **omitted from the table** so its rows quarantine rather than import wrong.
5. **For D-3b (public invisibility at scale):** the operator post-commit check is a **required runbook step**, not advisory — unauthenticated requests against `/actors` (searching a distinctive onboarded name), `/actors/:id` for a known onboarded id, and `/metrics` compared to a pre-commit baseline. Its result is recorded in `reconciliation.md`.
6. **Key determinism** (FR-2, NFR-6) is likewise uncovered: keys are produced by hand, so reproducibility is verified only by re-running the mapping and diffing.

**Disqualifying evidence (KZ-002).** A green `npm test` proves the *normalizers* work. It proves **nothing** about whether the AT team's filled template is correct. Any task reporting "gates green" as evidence of a correct mapping is reporting evidence it does not have, and the Reviewer MUST reject it.

---

## 10. Dependencies, Assumptions & Open Questions

**Dependencies:** chunk 1 (`actors/registration-source-and-consent`) — archived and verified present in this checkout: 10 `TRADER_TYPES`, `RegistrationSource`/`ConsentMethod` enums plus 4 `Actor` columns, `TEMPLATE_VERSION = v2`. Parallel-safe with chunk 3. No AWS resource, no `IBD-DEV` action required by this spec.

**Assumptions carried:**

| ID | Assumption | If wrong |
|---|---|---|
| **A-1** | The AT/Alliance team performs the flattening from `mapping.md` (epic Option A) | Escalate to Option B; re-scope entirely |
| **A-2** | **806** is the pre-quarantine ceiling and **~751** the expected net after the quarantines FR-3/FR-4/FR-10 mandate (`design.md` §9.1, corrected from ~748 to ~752 at the T-7 pivot, to ~757 at the T-7 rework — C-5, and to ~751 at the T-8 pivot — C-8); the net is right to ±5% | `reconciliation.md` reports the truth; no logic depends on the estimate |
| **A-3** | Dropping QDS production data and commercial trade metrics is acceptable to the program | Those become their own epic. Cheapest to reverse **now** |
| **A-4** | `Offtaker_Groundnuts.Capacity (volume)` unit is unconfirmed, so the column is **dropped**, not guessed | If the client confirms tonnes, a follow-up maps 144 capacity values |

**Open questions:**

- **OQ-1 — RESOLVED 2026-08-04 during this specify run.** `proposal.md` lines 44, 65, and 141 contained **three real contact phone numbers** copied from the workbook, one belonging to a named contact on the `Seed Company` sheet. All three were redacted to format placeholders and the D-7 gate now returns clean. **Residual decision for the user:** the values remain in git history; rewriting history is out of this spec's scope.
- **OQ-2:** `Offtaker_Groundnuts.Capacity (volume)` — tonnes, kg, or bags? Blocks 144 capacity values only; A-4 drops the column until answered.
- **OQ-3:** Should the 11 `"Retaler"` rows get a deliberate typo alias (`retaler → informal_trader`), or be corrected by the AT team in the source? Both are defensible; FR-4 requires the choice be recorded either way.
- **OQ-4:** 12 of the 26 `Bulk buyers_beans` organisations are named `…AMCOs` (Agricultural Marketing Co-operative Societies) (corrected from 15 at the T-8 pivot, `execution.md` — C-9). Type them `bulk_buyer` per sheet identity, or `cooperative` per what they are? FR-4 currently prescribes sheet identity.
- **OQ-5:** Does the program want the QDS production dataset represented at all (epic OQ-3, still open)? D-1 makes the organisation/individual split explicit but does not answer this.

---

## 11. Requirement ID Index

| ID | Title | Artifact | Traces to |
|---|---|---|---|
| FR-1 | Per-sheet mapping with total column accountability | Doc | epic §12·1; proposal §4.1 |
| FR-2 | Deterministic, unique, traceable natural key | Doc + import | epic R-6; proposal R-1; D-2 |
| FR-3 | Region derived where certain, quarantined where not | Doc + code | epic R-5; TRD §3; PRD §5 |
| FR-4 | Trader type from sheet identity | Doc | Measurement (§3.1) |
| FR-5 | Phone normalization to E.164 | **Code** | proposal R-5/OQ-2 |
| FR-6 | Nothing becomes public | Assertion | ADR-004; TRD QA-2 |
| FR-7 | Per-reason quarantine breakdown | **Code** | proposal §8; epic R-3 |
| FR-8 | Reconciliation of 100% of source rows | Doc | epic §12·2; proposal R-3 |
| FR-9 | Re-run runbook | Doc | proposal §5 |
| FR-10 | QDS organisation-only selection | Doc | D-1 |
| FR-11 | Stale-template message clarity | Code | proposal §5 |
| NFR-1..9 | PII gate · invisibility · additive-only · SSOT · purity · determinism · audit · isolation · no PII in repo | Mixed | TRD §8, QA-2/QA-9; PRD AC-5; KZ-002 |

---

**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`. PII = `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport` (`common/pii-consent.policy.ts`). All AWS commands use `--profile IBD-DEV` — this spec requires none.
