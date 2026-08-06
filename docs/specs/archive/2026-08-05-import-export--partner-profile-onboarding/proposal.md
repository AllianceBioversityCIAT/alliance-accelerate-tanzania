# Proposal — Partner Profile Workbook Onboarding

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `import-export/partner-profile-onboarding` |
| Proposal date | 2026-08-03 |
| Author | AKILI (Leader) on behalf of JuanCode |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting approval |
| Parent epic | [`epic/hybrid-actor-registration`](../../epic/hybrid-actor-registration/proposal.md) — chunk **2 of 4** |
| **Depends on** | `actors/registration-source-and-consent` (chunk 1) |
| **Parallel-safe** | **yes** — disjoint from `actors/public-self-registration` (chunk 3) |
| Suggested depth | **Full** (real client data at scale, PII-bearing, irreversible-if-wrong natural keys, consent gating) |
| Source file | `Partner Profile 14.4.2026.xlsx` (client, 2026-04-14) |

## 2. Intent

Get the client's real dataset — **8 sheets, ~1,318 rows** — into the registry through the existing Admin import, without inventing consent, without colliding natural keys, and without silently dropping records nobody can account for afterwards.

The deliverable is **a repeatable, auditable onboarding**: a documented per-sheet mapping into the canonical template, the small amount of code hardening that mapping requires, and a reconciliation report the program team can check.

## 3. Problem / Current Behavior

The Admin import expects **one flat Data sheet** with canonical headers. The client's workbook is nothing like it:

| Sheet | Data rows | Header row | Key mismatches vs. canonical template |
|---|---:|:---:|---|
| `Offtaker_Beans` | ~436 | 1 | Closest fit. `Trader_id`, `gpslatitude`, `Trader/processor type`. |
| `Offtaker_Sorghum` | ~128 | 1 | `Trader_ID`, `Trader name`, `gps-Latitude`; adds `Town`; **no Email, no Sex, no Position, no Market location**. |
| `Offtaker_Groundnuts` | ~151 | 1 | **No `Region` column at all** (only `District`, `Town`); adds `Need for Tecncal support`; `Capacity (volume)` without a unit. |
| `Bulk buyers_beans` | ~229 | **3** | `Offtaker name` instead of trader name; `Region_name`; **no trader id**; adds year established, aggregation capacity, grain pricing, farmer counts. |
| `Humantarian` | ~39 | **2** | Org `Name` + `Contact person` + `Designation` + `Category` + `Location` (not region/district) + `Telephone` + `Type of activities`. |
| `Digital Service Provider` | ~14 | **2** | Same shape as Humanitarian + `Website`. |
| `Seed Company` | ~10 | 1 (+ sub-header row 2) | `gps location` split across two cells (`lat` in G, `long` in H); heavy bean-trade commercial profile. |
| `QDS_ Seed producers` | ~311 | 1 | **~60 columns** of season/variety/planting/harvest/sales incl. up to 20 buyer-contact columns. One row per producer × season × variety. |

Beyond shape, four concrete blockers:

- **B-1 — `traderId` collisions.** `Trader_id` restarts per sheet: `1036` (beans), `1007` (sorghum), `1006` (groundnuts) all exist. The column is `@unique`. A naive load would silently skip real actors as "duplicates".
- **B-2 — Missing required `region`.** `region` is required by `ActorCreateDto`. `Offtaker_Groundnuts` has none; `Humantarian`/`DSP` have a free-text `Location` (`"West and South Tanzania "`, `"Arusha"`).
- **B-3 — Dirty values.** `Retaler`, `Lindi  Town` (double space), `Ye` for yes, trailing spaces throughout, phone numbers in several formats — bare 9-digit local (`7XXXXXXXX`), country-prefixed with internal spaces (`255 7XX XXX XXX`), leading-zero national (`07XXXXXXXX`), parenthesized country code (`(255)7XXXXXXXX`), and **two numbers in one cell** (`07XXXXXXXX/06XXXXXXXX`).

> **PII note (2026-08-04, `/akili-specify`):** this section originally quoted three **real** contact phone numbers copied from the client workbook, one belonging to a named contact on the `Seed Company` sheet. They were replaced with the format placeholders above. Real PII must never appear in a committed file — see `requirements.md` NFR-9 and its §9 D-7 grep gate. The redaction does not remove them from git history; that is a separate decision.
- **B-4 — No consent anywhere in the file.** Not one row carries consent evidence.

## 4. Proposed Outcome

1. A **per-sheet mapping specification** (`mapping.md`) that is the authoritative record of how each source column becomes a canonical column — including every column deliberately dropped and why.
2. A **namespaced natural key** scheme so `traderId` is globally unique and traceable back to its source sheet and row.
3. **Importer hardening** for the failure modes this real file exposes: multi-number phone cells, region derived from district, unit-less capacity, and a clearer stale-template message.
4. **A staged onboarding**: import to `consentStatus = UNKNOWN` (invisible to the public), then publish only the subset the AT team has consent evidence for, through the existing acknowledgement flow.
5. A **reconciliation report** — per sheet: rows read, mapped, quarantined (with reason), deliberately dropped — so the program team can audit that ~1,318 rows are accounted for.

## 5. Scope

**Documentation / data (the bulk of this spec):**
- `mapping.md` — per-sheet column mapping, drop list with rationale, region-derivation rules, key-namespacing rules.
- `reconciliation.md` — the counts, produced by running the onboarding.
- A **runbook** the AT team can re-run when the client sends an updated workbook.

**Backend hardening (small, targeted):**
- **Key namespacing:** prefix per source sheet (e.g. `OFB-1036`, `OFS-1007`, `OFG-1006`, `BBB-0042`, `HUM-0007`, `DSP-0003`, `SDC-0002`). Sheets without a source id get a stable positional key. Recorded in `mapping.md`, applied at mapping time.
- **Region derivation:** district → region against `CANONICAL_REGIONS` for `Offtaker_Groundnuts` and free-text `Location` for `Humantarian`/`DSP`. Unresolvable → **quarantine, never guess** (per R-5 of the epic).
- **Phone normalisation:** handle bare 9-digit local (`7XXXXXXXX` → `+2557XXXXXXXX`), country-prefixed with internal spaces (`255 7XX XXX XXX`), leading-zero national (`07XXXXXXXX`), parenthesized country code (`(255)7XXXXXXXX`), and **multi-number cells** (take the first, preserve the rest in `technicalSupport`? — no: see OQ-2).
- **Capacity units:** `Offtaker_Groundnuts`'s `Capacity (volume)` has no unit. Treated as tonnes only if the client confirms (OQ-1); otherwise the column is dropped rather than imported wrong.
- Stale-template message improvement (carried from chunk 1's `v2` bump).

**Explicitly a data task, not code:** the actual flattening of the 8 sheets into canonical template files is performed by the AT/Alliance team following `mapping.md`. This spec produces the map and the hardening; it does not teach the importer 8 schemas.

**Infra:** none.

## 6. Non-Goals

- **Teaching the importer the 8 source schemas.** That is epic Option B, deliberately declined.
- **The QDS seed-production dataset.** The ~311 QDS rows are onboarded *only* as organisations (name, category, region, district, contact, GPS) — deduplicated across seasons. Season, variety, acreage, harvest, class, and the up-to-20 buyer-contact columns are **dropped**, recorded as dropped, and left to a future spec if the program wants them.
- **Bulk-buyer trade metrics and seed-company commercial profiles** — grain pricing, USD value, demand, challenges narrative, `Where can NARS/CIAT Support`. Dropped at mapping time.
- **Publishing anything.** Everything lands `UNKNOWN`. Making records public is a separate, consent-evidenced act by the AT team.
- **An update/upsert mode.** The importer skips existing `traderId` (archived `admin/actor-import` decision); re-onboarding a corrected workbook means correcting in-app or a follow-up spec.
- **Automated de-duplication across sheets.** An organisation appearing in both `Seed Company` and `Bulk buyers_beans` is a judgement call for the AT team, flagged by the report, not merged by code.

## 7. Affected Users, Systems, And Specs

| Area | Impact |
|---|---|
| **Users** | Admin (runs the import); AT/Alliance data team (does the mapping). Public sees nothing new until consent is evidenced. |
| **Backend** | `common/normalize.ts` (region-from-district, phone), `actors/actor-import.service.ts`, `import/import.service.ts`. No new endpoint. |
| **Frontend** | Import result view may need a per-reason quarantine breakdown; otherwise unchanged. |
| **Data** | ~1,318 source rows → an expected **~900–1,000 actor records** after QDS season/variety dedup (to be confirmed by the reconciliation, not assumed). All `UNKNOWN`. |
| **Specs** | Consumes chunk 1's taxonomy + template. Extends archived `admin/actor-import`. |
| **Constitutional** | **TRD §3** — the CSV-header→field table is described as *authoritative for the import service*; it now describes the **canonical template**, not this client workbook. Worth a clarifying note so the two are not confused. |

## 8. Requirement Delta Preview

### ADDED
- Namespaced `traderId` scheme with per-sheet prefixes.
- District→region derivation with explicit quarantine on failure.
- Multi-format and multi-number phone normalisation.
- Per-reason quarantine breakdown in the import result.
- `mapping.md`, `reconciliation.md`, and the re-run runbook.

### MODIFIED
- `normalize.ts` gains derivation helpers; existing normalisers unchanged in behavior.
- Import result envelope gains a reason breakdown (additive field).

### REMOVED
- Nothing.

## 9. Approach Options

| | **A — Documented manual mapping (recommended)** | **B — Per-sheet adapter code** | **C — One-off throwaway script** |
|---|---|---|---|
| Where the mapping lives | `mapping.md` + team-produced template files | 8 parsers in the importer | A script nobody maintains |
| Re-runnable on an updated workbook | Yes, by the team | Yes, automatically | Only by its author |
| Effort | ~1.5 wk | ~4 wk | ~0.5 wk |
| Handles the client changing the workbook shape (likely) | Gracefully — edit the doc | Poorly — 8 parsers to update | Not at all |
| Auditability | High — the map is the artifact | Medium — buried in code | None |

## 10. Recommended Approach

**Option A.** The workbook is a *human artifact that keeps changing* — it already has three different header rows, inconsistent spellings of the same column, and a sub-header row in one sheet. Encoding that in 8 parsers buys automation of a step that runs a handful of times, and buys it at the price of 8 things to break the next time the client edits a header.

The mapping document is also the higher-value artifact: it is what makes the onboarding **auditable**, and it is exactly the specification a native importer (epic Option B) would need if the program later funds one.

**Assumptions:**

| ID | Assumption | If wrong |
|---|---|---|
| **A-1** | The AT/Alliance team will do the flattening from `mapping.md`. | Escalate to Option B; re-scope. |
| **A-2** | ~900–1,000 distinct organisations is the right order of magnitude after QDS dedup. | The reconciliation reports the truth; no logic depends on the estimate. |
| **A-3** | Dropping QDS production data and commercial trade metrics is acceptable to the program. | Those become their own epic — **confirm before executing**, because unmapped columns are the cheapest thing to reverse *now* and the most expensive after a 1,000-row import. |

## 11. Risks, Dependencies, And Open Questions

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | **Key namespacing is effectively irreversible.** Once ~1,000 actors carry `OFB-1036`-style ids, changing the scheme means rewriting every row and every audit reference. | Decide the scheme in `/akili-specify`, write it into `mapping.md`, and get explicit approval **before** any import runs. |
| **R-2** | **Real PII at real scale.** ~1,300 phone numbers and emails for real Tanzanian traders enter the DB in one operation. | Everything lands `UNKNOWN` → excluded from every public read by the ADR-004 `WHERE`. `pii-boundary.spec.ts` must be green before the import runs, not after. |
| **R-3** | **Silent data loss.** Quarantined and dropped rows are the easiest thing to lose track of; a "successful import" of 700 rows from a 1,318-row file reads as success. | The reconciliation report is a **deliverable**, not a log line. Every source row must be classified. |
| **R-4** | **`Bulk buyers_beans` has no trader id and no contact person** — only an offtaker name, region, district, and metrics. | Positional keys + name-based dedup flagging. If the sheet cannot yield a usable identity, defer it rather than importing ghosts. |
| **R-5** | **Multi-number phone cells** (`07XXXXXXXX/06XXXXXXXX`) — picking one silently discards a real contact. | See OQ-2. Do not decide this silently in code. |
| **R-6** | **Import runs against dev RDS via Lambda** with a bounded row count and a synchronous request (archived `admin/actor-import` design). ~1,000 rows in one upload may approach that bound. | Split into per-sheet uploads (which the mapping produces naturally) and confirm the row cap during `/akili-specify`. |
| **OQ-1** | `Offtaker_Groundnuts` `Capacity (volume)` has **no unit** — values like `400`, `70`. Tonnes, kg, or bags? | **Ask the client.** Importing this wrong corrupts the map's capacity filter. Drop the column until answered. |
| **OQ-2** | Multi-number phone cells: keep first, keep both in a new field, or quarantine? | Product decision; `phone` is PII so a second field expands the PII surface. |
| **OQ-3** | Does the program want the QDS production data represented at all, or is the organisation list sufficient? | If yes, that is a new epic — decide now so the drop is a decision rather than an omission. |
| **OQ-4** | Is `Humantarian`'s free-text `Location` (`"West and South Tanzania "`) mappable to a single region at all, or should such records import region-less and be excluded from the map? | `region` is currently required — this may need a rule change or a manual pass. |

## 12. Success Criteria

- `mapping.md` accounts for **100% of source columns** across all 8 sheets — each mapped, derived, or explicitly dropped with a reason. No column unaccounted for.
- The reconciliation report accounts for **100% of source rows** — mapped, quarantined (with reason), or deliberately dropped.
- Zero `traderId` collisions after namespacing.
- Every imported actor is `consentStatus = UNKNOWN` and `registrationSource = TEAM_MANAGED`; **zero** appear in any public read path or in `/metrics` — asserted, not assumed.
- Re-running the runbook on an unchanged workbook creates **zero** new records (skip-on-duplicate proven).
- Gates green, including `pii-boundary.spec.ts`.

## 13. Visual Reference

- **Source:** None — this chunk is data mapping and importer hardening. The existing Admin import screens are reused unchanged apart from a richer quarantine breakdown in the result table.
- **Location:** n/a.

## 14. Next Step

Only after chunk 1 is executed:

```text
/akili-specify import-export/partner-profile-onboarding
```

**Before that spec is approved, OQ-1 and OQ-3 should be put to the client** — both change what gets imported, and both are far cheaper to answer than to undo.
