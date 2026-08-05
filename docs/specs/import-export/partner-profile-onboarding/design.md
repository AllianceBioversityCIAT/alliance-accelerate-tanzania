# Design — Partner Profile Workbook Onboarding

- Spec path: `docs/specs/import-export/partner-profile-onboarding/`
- Status: Draft — **revised after Judgment Day round 1** (see `judgment.md`)
- Traces requirements: FR-1 … FR-11, NFR-1 … NFR-9 from this spec's `requirements.md`
- Author / Date: AKILI (`/akili-specify`) — 2026-08-04
- Depth: **Full**

> **Revision note.** This document was rewritten to close the findings in `judgment.md` (15 confirmed + 21 single-judge). Seven confirmed-severe and four verified single-judge-severe defects are corrected below, including a wrong endpoint path, two asserted endpoints that do not exist, a PII gate that could not test its own claim, and a trader-type decision that contradicted the approved FR-4. **Unresolved:** `judgment.md` X-1 (section-numbering conformance) is a judge contradiction escalated to the user and is *not* settled here — the numbering is unchanged pending that ruling.

---

## 1. Approach Overview

**The importer is not taught anything about the client's 8 schemas.** It keeps its existing contract — one flat `Data` sheet with canonical headers, `Trader ID`/`Trader Name`/`Trader Type`/`Region` required — and the AT team produces **one filled canonical template per source sheet** by following `mapping.md`. That is epic §9 Option A, and every decision below protects it.

Three consequences shape the whole design:

1. **The load-bearing artifact is a document, not code.** `mapping.md` is where correctness lives. The four code changes exist only to remove failure modes the mapping cannot avoid by hand. §4.5 specifies its required structure.
2. **The importer is a *shape* backstop only — not a meaning backstop.** It rejects a blank required field, an out-of-range number, and a value it cannot normalize. It does **not** reject a plausible-but-wrong value. `Region` and `Trader Type` are validated by `normalizeRegion` / `normalizeTraderType` (`actor-import.service.ts:360,376`), which accept a **superset** of the canonical lists: 10 region aliases plus trailing-" Region" stripping, and 18 trader-type aliases including `cbo → humanitarian` (`normalize.ts:77-88, 120-126, 179-198`). The canonical-only constraint exists solely as an in-Excel dropdown (`generate-import-template.ts:207-220`), which is client-side and **not paste-proof**. §11 R-1 is therefore the governing risk, and DD-2 is designed around this weakness rather than assuming it away.
3. **Preview mode is the one gate we already own.** `ActorImportService` supports `mode: 'preview'` (`actor-import.service.ts:187-198`) — full validation, per-row outcomes, zero writes. Every sheet is previewed before commit, so the reconciliation is produced before anything is persisted.

```
Partner Profile 14.4.2026.xlsx        (outside the repo — NFR-9)
        │
        │  AT team applies mapping.md  (human step — the R-1 blind spot)
        ▼
8 × filled canonical template (v2)    one file per source sheet
        │
        │  POST /api/v1/admin/actors/import   mode=preview   ← Admin-guarded, per-sheet, ≤1000 rows
        ▼
ImportReport + reason breakdown  ──────► reconciliation.md
        │
        │  human review of the breakdown, then mode=commit
        ▼
Actor rows: consentStatus=UNKNOWN · registrationSource=TEAM_MANAGED
        │
        └──► invisible to Public (ADR-004 WHERE) — see §7 for what is and is not asserted
```

**Unchanged:** Prisma schema, `TEMPLATE_VERSION` (`v2`), the template's columns, every endpoint, every guard, the PII allowlist, and all infrastructure. **No `--profile IBD-DEV` action is required by this spec.**

---

## 2. Data Model Changes

**None.** No migration, no new entity, no new field, no new PII field.

Chunk 1 already shipped everything this onboarding writes into — verified present in this checkout on 2026-08-04:

| Needed | Where | Status |
|---|---|---|
| 10 `TRADER_TYPES` incl. the 4 new codes | `backend/src/common/normalize.ts:143` | Present |
| `RegistrationSource` / `ConsentMethod` enums + 4 `Actor` columns | `backend/prisma/schema.prisma:24-59` | Present |
| `TEMPLATE_VERSION = 'v2'` + 4 consent/source columns | `backend/src/common/template-columns.ts:28` | Present |

`phone` remains PII per `common/pii-consent.policy.ts`. **Normalizing a value does not change its classification** — the allowlist is untouched.

---

## 3. API Design

One **additive, optional** field on the import report. No new endpoint, no auth change, no envelope change.

| Endpoint | Auth | Change |
|---|---|---|
| **`POST /api/v1/admin/actors/import`** | **Admin** (`@Controller('admin/actors')` + `@Post('import')`, global prefix `api/v1`) | Response gains an optional reason-breakdown array. Every existing field of `ImportReport`, `ImportReportTotals`, and `ImportRowResult` keeps its name, type, and meaning (NFR-3) |

> The route lives on the **Admin-guarded** controller (`admin-actors.controller.ts:56,130`), not on the anonymous `actors` controller, which exposes only `@Get()` and `@Get(':id')`. The canonical path is fixed in `lambda-handler.e2e.spec.ts:142`.

**Shape contract** (described rather than typed out — `design.md` in this methodology records decisions, not implementations): an optional array of `{ reason, count }` pairs, ordered deterministically (count descending, then reason ascending) so two runs over the same input produce identical output (NFR-6). `reason` is a stable, machine-readable slug — **never** free-text and **never** PII-bearing (FR-7).

**Reason vocabulary** is closed and derived from three existing sources, with no new error taxonomy invented:

| Source | Slug shape | Example |
|---|---|---|
| The failing column's `field` on `ImportRowError` | the field name | `region`, `traderType`, `traderId` |
| The existing `skipped-*` row outcomes | the outcome code | `skipped-exists`, `skipped-duplicate-in-file` |
| The batch-rollback pseudo-field (`actor-import.service.ts:885-889`) | `_row` mapped to an explicit slug | `batch-rolled-back` |

`_row` is **not** a template column and has no ordinal in `TEMPLATE_COLUMNS`; DD-4 defines how it is ordered and named so it can never surface as a bogus column reason.

**Invariant:** the breakdown's counts sum to `failed + skipped` exactly. DD-4 explains why that forces one reason per row.

**Frontend mirror is mandatory, not optional.** `frontend/CLAUDE.md` requires `lib/api/actors-admin.ts` types to mirror backend contracts *exactly* — matching optionality and exact string-literal unions. Loosening a union to `string` or flipping optionality has FAILed reviews in this repo before.

---

## 4. Backend Module Design

No new module, controller, guard, or provider. Four narrow code changes in two existing files plus their tests, and one document-structure specification (§4.5).

| # | Change | File | Kind |
|---|---|---|---|
| 4.1 | `normalizePhone()` — pure; canonical E.164 or `null`, plus a count of additional numbers in the cell | `src/common/normalize.ts` | Added pure function |
| 4.2 | `DISTRICT_TO_REGION` — closed lookup over the 28 real district values needing derivation | `src/common/normalize.ts` | Added constant |
| 4.3 | Reason breakdown assembled in `buildReport()` | `src/actors/actor-import.service.ts`, `actor-import.types.ts` | Added optional field |
| 4.4 | Stale-template message gains the download location | `src/actors/actor-import.service.ts` | Changed string |
| 4.5 | `mapping.md` required structure | *document* | Specification |

### 4.1 Phone normalization (FR-5)

Lives in `normalize.ts` beside `normalizeRegion` / `normalizeTraderType`, obeying the two contracts that file already establishes: **purity** (no Nest, no Prisma, no I/O — NFR-5) and **never guess** (return `null` rather than a partially-mangled string).

Formats to handle are exactly those measured in the source: bare 9-digit local, leading-zero national, country-prefixed with internal spaces, parenthesized country code, landline with internal spaces, and a cell holding two numbers separated by `/`.

**PII constraint that shapes the signature:** the multi-number case must be *reportable* without the discarded digits ever leaving the function. The return therefore carries a **count**, not the extra values — and because the kept number is always the first, a count of *n* means the discarded values occupy positions 2…*n*+1, which is what FR-5's "naming the discarded value's position" requires. Nothing downstream can log a phone number it was never given (FR-5, NFR-9).

**The `null` branch is specified, not left to the implementer (`judgment.md` S-2).** When the source cell is non-empty and `normalizePhone()` returns `null`:

- the row is **created**, not failed — an unusable phone is not grounds to reject a real organisation;
- `phone` is written as **`null`**, never the raw string — storing an unnormalizable value would defeat the change;
- the row carries a **warning** identifying the column, so the AT team can repair the cell and correct the record in-app.

This is a deliberate behavior change from today's verbatim store (`actor-import.service.ts:531` `phone: cells.phone || undefined`), and it is the one place this spec **narrows** existing import behavior. Recorded as such against NFR-3 in §10 F-1, because a non-Tanzanian number that previously stored verbatim will now store as `null` + warning.

### 4.2 District → region lookup (FR-3)

A closed map from district name to `CanonicalRegion` covering the **28 real district values** measured as requiring derivation. (38 distinct values appear in the district position of the qualifying rows; **10 are contaminated cells holding company or person names**, not districts — DD-5 routes those to the register, not the lookup.) Sits beside `CANONICAL_REGIONS` as the single source of truth (NFR-4).

> **Count correction (during execution, T-2 — 2026-08-04).** This section previously read **29 real / 40 distinct / 11 contaminated**. Direct re-measurement of the workbook during T-2 yielded **28 / 38 / 10**, and per §3.1's standing rule — *measurement wins over estimate* — the measured figures govern. Recorded rather than reconciled away, exactly as §3.1's earlier "Count correction (during Phase 2)" handled QDS 42 → ~23.
>
> **The operative definition matters more than the count, and is stated here because a future re-measurement must reproduce it:** the qualifying rows are those whose **`region` is blank** — `Offtaker_Sorghum` (6), `Offtaker_Groundnuts` (150, no `Region` column at all), and `Bulk buyers_beans` (4 with a district but no region). `QDS` contributes **zero** (all 26 `cbo` rows already carry `region_name`); `Seed Company` is excluded by DD-11.
>
> The earlier "40 distinct values appear in the district position" was unqualified by region-blankness. Narrowing it is not merely a recount — it is what **FR-3 licenses**: FR-3 permits derivation only where the region column is absent or blank, and *requires* an ambiguous region value to quarantine ("matching `normalizeRegion`'s existing refusal to resolve `Arusha/Dodoma`"). District-rescuing a row whose region is present-but-ambiguous would be the guess FR-3 twice forbids. One of the two dropped values is exactly that case: an `Offtaker_Sorghum` row holding a person name in the district position whose own `Region` cell carries an ambiguous multi-region value, so it quarantines through the existing path regardless.
>
> **Corroboration (produced by the T-2 conformance reviewer without re-reading the workbook):** BBB's 4 = §3.1's "only 14 of 26 have a resolvable region" (⇒ 12 region-less) minus FR-3's "8 of 26 with neither a region nor a district" — an exact match across two independent spec figures.
>
> **Unresolved and tracked:** DD-1's "162 rows across 5 sheets" does not reconcile with the measured **160 rows across 3 contributing sheets**; see DD-1's own correction note. The residual is the safe direction — an absent district quarantines, which FR-3 prefers to a derivation.

**Not consumed by the importer** (DD-1). It exists to be tested and to source the lookup table published in `mapping.md`.

**Two assertions, because one is not enough (`judgment.md` S-3):**

1. **Membership** — every value in the map is a member of `CANONICAL_REGIONS`. Catches a typo'd region.
2. **Doc↔constant agreement** — the table published in `mapping.md` matches `DISTRICT_TO_REGION` entry-for-entry. This is what makes §1's no-drift claim true rather than aspirational, and it mirrors the byte-stable-template precedent already in this repo (`generate-template.spec.ts`).

**What neither assertion can catch:** a district mapped to the *wrong* region. Both assertions pass. That defect is listed in §12's uncoverable set and corrected in `requirements.md` §9, which previously mis-classified it as automated.

### 4.3 Reason breakdown (FR-7)

Assembled inside the existing `buildReport()`, which already computes `created` / `skipped` / `failed` / `warnings` by filtering the per-row results. The breakdown is one more pass over the same array — no new query, no change to transaction boundaries, no effect on the per-row isolation PRD AC-5 and TRD QA-9 depend on.

### 4.4 Stale-template message (FR-11)

**The shipped message already names both versions** (`actor-import.service.ts:167-169`), and two suites already assert it: `actor-import.service.spec.ts:195` (`/out of date.*re-download/i`) and `admin-actor-import.e2e.spec.ts:990` (`/out of date/i`). The only new element is the **download location**.

Consequences for the implementer: the reworded message MUST keep both `out of date` and `re-download` present so neither existing assertion needs editing (NFR-3 forbids editing a test to accommodate a change), and §12's FR-11 row asserts the **new** element specifically — otherwise the gate is green before any work is done.

### 4.5 `mapping.md` required structure (FR-1) — *added after judgment*

The design previously called `mapping.md` the load-bearing artifact without specifying it, leaving FR-1's only checkable property unrepresented. Required structure, per sheet:

| Element | Requirement |
|---|---|
| **Provenance header** | Source workbook filename + date, the sheet's **header row**, and its **first data row** — including `Bulk buyers_beans` = header row 3 and `Seed Company` first data row **3** (row 2 is a `lat`/`long` sub-header) |
| **Column disposition table** | Every column, each with **exactly one** of four dispositions |
| **Disposition vocabulary** | `MAPPED → <canonical column>` · `DERIVED → <canonical column> (rule)` · `DROPPED (reason)` · `EMPTY-IN-SOURCE (present, no data)` |
| **Column-count reconciliation** | A stated total that **sums to the sheet's measured column count** in `requirements.md` §3.1. This is the FR-1 gate (`requirements.md` §9 D-5) |
| **Key rule** | The sheet's prefix and whether it uses source ids or positional keys (DD-9) |
| **Trader-type assignment** | Column-driven or sheet-level, per DD-2 |
| **Contaminated-row register** | Affected rows by **physical row number only** (DD-5, S-4) |

`EMPTY-IN-SOURCE` is not cosmetic: `Offtaker_Beans.Email` (0/436), `DSP.Website` (0/13), and 7 `Seed Company` columns exist but hold no data. Recording them as `DROPPED` would misrepresent the source.

### 4.6 Runbook required contents (FR-9) — *added after judgment*

FR-9 carries five MUST clauses and previously had no design section. The runbook MUST:

1. Require a **preview run per sheet before any commit**, and state that preview writes nothing.
2. State the measured upload bounds — `MAX_DATA_ROWS = 1000`, 4 MB decoded (`actor-import.service.ts:55-56`) — and prescribe **one upload per source sheet** (DD-8).
3. Require the current template version (`v2`) be re-downloaded, since a stale template is rejected.
4. Carry the **post-commit public-invisibility check** of §7.
5. **Never instruct anyone to set `consentStatus` to `GRANTED`.** Publication is a separate, consent-evidenced act by the AT team. This is the clause with legal consequence and is restated here deliberately.

---

## 5. Frontend Design

Minimal and confined to the existing Admin import screen — no new route, no new page, no static-export implication.

| File | Change |
|---|---|
| `frontend/lib/api/actors-admin.ts` | Mirror the additive `ImportReport` field with **matching optionality** and the exact reason union |
| `frontend/app/(admin)/admin/actors/import/page.tsx` | Render the breakdown in the **preview** branch, inside a live region. This file holds the `report` object and the existing live-region pattern |
| `frontend/components/admin/ImportPreviewTable.tsx` | Unchanged, or extended only if the breakdown is placed inside it |

**Placement corrected after judgment (`judgment.md` C-14).** The design previously put the breakdown in `ImportPreviewTable.tsx` and claimed it would announce "through the existing `aria-live` region pattern". That component's entire prop surface is `{ rows: ImportRowResult[] }` and it contains **no live region**. The live regions are in `page.tsx` — `:510` (previewing spinner) and `:586-588` (commit result) — while the preview branch renders `TotalsChips` and `ImportPreviewTable` **outside** any live region. Since preview is the mode §1 designates as the gate, the breakdown belongs in `page.tsx` next to `TotalsChips`, where both the data and the pattern already are.

**Token discipline (zero tolerance, `frontend/CLAUDE.md`):** semantic token classes only — `bg-surface`, `text-fg`, `text-muted`, `border-border`, `text-danger`. No hex, no `rgb()`, no arbitrary `bg-[#…]`.

**Accessibility:** the breakdown is a status summary that changes after a preview, so it announces via a `role="status" aria-live="polite"` region consistent with the existing pattern (WCAG 2.1 AA, `docs/ux-ui/design.md` §10).

**No table-breakpoint work.** The breakdown is a short summary list, not a data table, so the per-table `md`/`lg` split and sticky-column conventions do not apply.

---

## 6. Shared Contracts

`ImportReport` is a hand-mirrored contract across the two packages (there is no generated client). The additive field must land in **both** `backend/src/actors/actor-import.types.ts` and `frontend/lib/api/actors-admin.ts`, with identical optionality, in the same change — a backend-only landing leaves the frontend type lying about the wire shape.

---

## 7. Security & RBAC

| Concern | Position |
|---|---|
| **New surface** | None. No endpoint, role, guard, or public read path is added or altered |
| **Route guard** | Import is on the Admin-guarded controller (`admin-actors.controller.ts:56`), reached at `POST /api/v1/admin/actors/import` |
| **PII** | `phone` stays PII. The normalizer is pure and never logs. The breakdown's `reason` slugs are column names and outcome codes — structurally incapable of carrying a value |
| **Consent** | Every record lands `UNKNOWN`, excluded by the ADR-004 Prisma `WHERE` from every public read *and* `/metrics` |
| **Audit** | Unchanged — import already writes `ActorAuditLog` inside the same `$transaction` |
| **Release gate** | `src/test/pii-boundary.spec.ts` green **before** any commit-mode upload and after (NFR-1) |
| **The real exposure** | **Measured, not asserted:** 1,023 of 1,097 identity rows in the workbook carry a phone number and 56 carry an email. In the retained **~751-record set** (corrected from ~795 at the T-8 pivot — `execution.md` — C-13; the intervening ~757 figure from the T-7 rework was never propagated to this row, per advisory A-13) that is roughly **~700 phone numbers and ~38 emails** for real Tanzanian organisations and contacts, rescaled at the same 1,023/1,097 and 56/1,097 rates. These are proportional estimates that gate nothing. The protection is consent gating |

### 7.1 What the PII gate does and does not prove (`judgment.md` C-2, C-3)

The previous draft claimed `npm test -- pii-boundary` asserts zero onboarded actors across `/actors`, `/actors/:id`, `/actors/geo`, `/export`, `/metrics`. **Two of those five endpoints do not exist, and the suite cannot see onboarded data at all.** Both corrected here.

**The public read paths that exist** are `/actors`, `/actors/:id`, and `/metrics`. There is no `geo` and no `export` route anywhere in `backend/src` — `pii-boundary.spec.ts:30-39` already records this as a scope correction made in chunk 1, and re-asserting it would be an Inherited-Claim FAIL under `.agents/reviewer.md`.

**What `pii-boundary.spec.ts` proves:** the boundary holds over the real HTTP → controller → service → serializer path, using a **mocked `PrismaService` serving in-memory fixtures** (`:19-26`). It is a genuine end-to-end proof of the *serializer and consent logic* and a hard release gate. It is **not** an observation of the onboarded dataset — no MySQL is reachable in the test environment.

**Therefore FR-6's at-scale clause needs a mechanism outside the test suite.** Two parts:

1. **Runbook post-commit check (§4.6 item 4).** After each sheet's commit, an operator issues unauthenticated requests to `/api/v1/actors` (searching a distinctive onboarded `traderName`), `/api/v1/actors/:id` for a known onboarded id, and `/api/v1/metrics` (comparing the count against the pre-commit baseline). Expected: zero onboarded actors present, metrics unchanged. Recorded in `reconciliation.md`.
2. **Honest limitation.** That check is **manual and operator-run**. No automated gate in this repository can assert public invisibility over the real committed dataset, because the only HTTP-level suite mocks the database. This is stated rather than papered over, and it is listed in §12's uncoverable set.

---

## 8. Infrastructure / Deployment

**None.** No SAM template change, no new AWS resource, no environment variable, no secret. No `--profile IBD-DEV` command is required by this spec.

Uploads run against the existing Admin endpoint. The measured bounds constraining *operation* (not deployment) are `MAX_DATA_ROWS = 1000` and a 4 MB decoded cap (`actor-import.service.ts:55-56`) — DD-8.

---

## 9. Measured findings that changed the design

Each invalidated something in `proposal.md` and now drives a decision.

| Finding | Design consequence |
|---|---|
| `Bulk buyers_beans` is block-structured — 166 rows → **26** organisations | Forward-fill is a mapping rule (FR-1), not an importer feature |
| **4 sheets' category columns cannot type actors**; DSP resolves **0 of 13**; QDS `cbo` → `humanitarian` via the *existing* alias | DD-2: canonical codes written directly, per-sheet or column-driven as FR-4 specifies |
| **38 blank source ids · 2 intra-sheet duplicates · 5 sheets with no id column** (`Bulk buyers_beans`, `Humantarian`, `Digital Service Provider`, `Seed Company`, `QDS` ≈ 105 actors) — corrected from 52 at the T-7 pivot (`execution.md` Finding 1) | DD-9's positional-fallback key |
| **Contaminated tail blocks**: `Offtaker_Sorghum` rows 110–116 and `Offtaker_Groundnuts` rows **149–152** hold company/person names in the district and town columns, and the same 4 rows hold a phone number in the trader-type column — corrected from 147–151 at the T-7 pivot (`execution.md` Finding 2) | DD-5: register by physical row number, hand-repair-or-quarantine |
| **QDS rows 289–312 are not producers** — the `seed source` vocabulary (research institutes + the `Seed Company` sheet repeated verbatim) | DD-6: QDS yields ~**23**, not 42 |
| **11 cross-sheet duplicate groups, 24 records** — one organisation appears in `Seed Company`, `Bulk buyers_beans`, **and** QDS — corrected from 8 groups / 18 records at the T-10 finding (`execution.md`, `reconciliation.md` §6) — **C-14** | DD-7: flag, never merge |
| **70 QDS coordinate cells are DMS** (corrected from 71 at the T-8 pivot — `execution.md` — C-11), one with out-of-range minutes | DD-10: blank + flag, never coerce |
| **`Seed Company` has no region and no district data** (its location column is 0/12 filled) | **DD-11**: all 11 quarantine pending an AT-team region pass |
| ~~40 distinct district values need derivation, but only **29 are real districts**~~ → **corrected at T-2 to 38 distinct / 28 real / 10 contaminated** (§4.2) | Sizes `DISTRICT_TO_REGION` (§4.2) and separates it from contamination |
| **1,023 of 1,097** identity rows carry a phone; **56** carry an email | Sizes the real PII exposure (§7) with a measurement instead of an assertion |

### 9.1 Expected yield — pre- and post-quarantine (`judgment.md` S-8)

The previous draft presented a single figure that was in fact the **pre-quarantine** sum, while the requirements mandate quarantining specific counted rows inside it.

> **Correction (T-7 pivot, 2026-08-04 — `execution.md` Finding 2 / correction C-3).** The `Offtaker_Groundnuts` row below previously read "4 phone-in-type-column · 5 contaminated tail", summing to 9 quarantined rows and a net of ~141. **Those two counts named the same 4 rows twice** — the contaminated tail *is* rows 149–152, the same rows that carry the phone number in the trader-type column, not a separate set of 5. `mapping.md` §3.3's own measurement records the real, non-overlapping quarantine set for this sheet: row 148 (free-text trader type, no defensible alias) **plus** rows 149–152 (contaminated, phone-in-type-column) = **5** distinct rows, not 9. The row below is corrected to that, which moves this sheet's net from ~141 to **~145** and the grand total from ~748 to **~752**.

> **Amendment C-5 (T-7 rework, 2026-08-04 — audit found two more of the same class of double-count).** Two further rows below repeated C-3's mistake: (1) `Offtaker_Sorghum` quarantined "11 `"Retaler"` · 6 blank region · 7 contaminated tail" = 24 — but `mapping.md` §3.2 states in two places that the 6 blank-`Region` rows sit **inside** the 7-row contaminated tail (rows 110–116), not beside it. The distinct set is **11 + 7 = 18**, not 24, moving this sheet's net from ~91 to **~97**. (2) `Offtaker_Beans` quarantined only "1 blank trader type" — but `mapping.md` §3.1 also records a second, distinct quarantine on this sheet: one ambiguous-region row (row 425, region value `"Arusha/Dodoma"`, refused by `normalizeRegion`) that is **not** the same row as the blank-trader-type row (row 436). The Leader confirmed the two rows are distinct by direct measurement of the source workbook. Beans therefore quarantines **2**, not 1, moving this sheet's net from ~435 to **~434**. Net effect on the grand total: ~752 → **~757**. Propagated to DD-8 below, `requirements.md` §3.1 and assumption **A-2**, and `tasks.md` T-10's scope and the FR-8 coverage row.

> **Amendment C-6/C-7/C-8 (T-8 pivot, 2026-08-05 — `execution.md`, `mapping.md` §8).** T-8's cell-by-cell trace of the five remaining sheets found two further corrections to the table below, independently verified before amendment. (1) **Digital Service Provider:** 2 of its 10 domestic rows carry a region-ambiguous value (`"West and South Tanzania "`) that `normalizeRegion` refuses — the same refusal class as `Humantarian`'s `"Across Tz"` — beyond the 3 D-3 foreign exclusions already netted out of the pre-quarantine count. DSP's expected net moves from 10 to **8** — **C-6**. (2) **QDS:** this table's "1 blank category" quarantine had no basis — the sheet's only blank-`producer_category` row (row 312) sits inside the already-excluded 289–312 tail (FR-10), so it was never a member of the ~23-candidate `cbo` block and cannot be subtracted from it a second time. Applying DD-6's mandatory hand-classification instead finds 5 of the 23 distinct `cbo` names are personal names, which D-1 requires excluding. QDS's expected net moves from ~22 to **18** — **C-7**. Net effect on the grand total: ~757 → **~751** — **C-8**. `Humantarian` (31) and `Bulk buyers_beans` (18) were independently re-confirmed, not contradicted, by this pass.

| Sheet | Pre-quarantine | Mandated quarantines / exclusions | Expected net |
|---|--:|---|--:|
| `Offtaker_Beans` | 436 | 1 ambiguous region (row 425) · 1 blank trader type (row 436) — **2 distinct** | ~434 |
| `Offtaker_Sorghum` | 115 | 11 `"Retaler"` (DD-2) · 7 contaminated tail (rows 110–116, which contain all 6 blank-region rows) — **18 distinct** | ~97 |
| `Offtaker_Groundnuts` | 150 | 1 free-text trader type (row 148) · 4 contaminated tail (rows 149–152, phone-in-type-column) — **5 distinct, not 9** | ~145 |
| `Bulk buyers_beans` | 26 | 8 with neither region nor district | 18 |
| `Humantarian` | 35 | 4 ambiguous locations | 31 |
| `Digital Service Provider` | 10 | 3 foreign (D-3) — already excluded from this candidate count; see the pre-quarantine-convention note below · 2 region-ambiguous domestic rows (same refusal class as `Humantarian`'s `"Across Tz"`) — net corrected 10 → 8 at the T-8 pivot, `execution.md` — **C-6** | 8 |
| `Seed Company` | 11 | **11 — no region data (DD-11)** | 0 |
| `QDS` (organisations) | ~23 | 5 personal names among the `cbo` block (DD-6 hand-classification, D-1) — **not** "1 blank category": that row sits inside the already-excluded 289–312 tail, not the ~23-candidate block. Net corrected ~22 → 18 at the T-8 pivot, `execution.md` — **C-7** | 18 |
| **Total** | **806** | | **~751** |

`434 + 97 + 145 + 18 + 31 + 8 + 0 + 18 = 751` (corrected from `434 + 97 + 145 + 18 + 31 + 10 + 0 + 22 = 757` at the T-8 pivot — **C-8**).

**Pre-quarantine-column convention (advisory, predates the T-7 pivot).** This column previously listed `Digital Service Provider` at its raw physical row count (13) and then subtracted the 3 D-3 foreign exclusions as a mandated quarantine — which made the column sum to 809, not the 806 the Total row stated, and disagreed with `requirements.md` §3.1, which already nets DSP to 10 (treating D-3's foreign exclusion as a candidacy decision made before this table, not a quarantine bucket inside it). This table now uses that same convention throughout: **"Pre-quarantine" is the candidate count after any structural candidacy decision already made elsewhere in this spec (D-1, D-3, DD-6) — DD-11 excepted: its 11 `Seed Company` rows stay in the pre-quarantine count as candidates, because DD-11 quarantines them pending the AT-team region pass rather than removing them from candidacy, so this table records that exclusion in its own quarantine column — and before the quarantine/exclusion decisions this table itself records.** DSP's row is corrected to 10 pre-quarantine, with D-3's exclusion noted for traceability but not subtracted a second time; the column now sums to **806**, unchanged from the ceiling already published everywhere else in this spec.

**~751 is the figure to expect; 806 is the pre-quarantine ceiling** (corrected from ~757 at the T-8 pivot, `execution.md` — C-8; the 806 ceiling is unaffected — both C-6 and C-7 are net-column-only corrections). Both are estimates against one workbook version. `reconciliation.md` reports the truth and no requirement depends on either number (A-2). A result near ~751 is the requirements **working**, not a defect — which is precisely why the earlier single figure was hazardous.

---

## 10. Design Decisions

### DD-1: Region derivation happens at mapping time, not in the importer

- **Context:** 162 rows across 5 sheets need `region` derived from `district`. `Offtaker_Groundnuts` has no `Region` column at all.
- **Measurement correction (T-2, 2026-08-04) — closed at the T-8 pivot (see below); originally left open deliberately.** Direct measurement found **160 rows across 3 contributing sheets**: `Offtaker_Sorghum` 6 · `Offtaker_Groundnuts` 150 · `Bulk buyers_beans` 4. `QDS` contributes **zero** (all 26 `cbo` rows already carry `region_name`) and `Seed Company` is excluded by DD-11, so the "5 sheets" does not hold either. The 2-row residual is numerically identical to the 2 dropped distinct values in §4.2's correction, which suggests the original count included one district-position value from each of two sheets outside the blank-region scan. One is explained (an ambiguous-region `Offtaker_Sorghum` row); the second is not. The outstanding candidate is **`Humantarian`** — the only sheet with location data covered by neither DD-11 nor a blank-region scan — and confirming whether its 31 non-ambiguous rows resolve as *regions* (closing this at 3 sheets) or include district-level values (in which case `DISTRICT_TO_REGION` is short by one) belongs to **T-8**, which owns that sheet's columns. **Not closed by guessing:** the omission direction is the safe one, since an absent district quarantines on `region` — which FR-3 explicitly prefers to a derivation — and surfaces as a visible line item in `reconciliation.md`. Under-coverage cannot produce a D-1b defect; over-coverage can.
- **Closed (T-8 pivot, 2026-08-05 — `execution.md`, `mapping.md` §8 via §4.2) — C-12.** T-8 measured all 31 non-ambiguous `Humantarian` `Location` values against `CANONICAL_REGIONS` and found every one an exact member — none are district-level. `DISTRICT_TO_REGION` needs no entry from `Humantarian`, and **DD-1 closes at 3 contributing sheets**: `Offtaker_Sorghum`, `Offtaker_Groundnuts`, `Bulk buyers_beans`. The separate 2-row residual named above (the second, unexplained dropped-distinct-value) is **not** resolved by this finding and **stays open**.
- **Options:** (a) importer derives when `Region` is blank · (b) reference sheet added to the template for VLOOKUP · (c) published lookup table in `mapping.md`, sourced from a tested constant.
- **Decision: (c).**
- **Consequences:** The importer's contract is unchanged, so a blank or unresolvable `Region` still fails → quarantine. **(a) rejected** because it would silently rescue genuinely region-less rows on *every future import*, weakening a required field system-wide to serve one onboarding. **(b) rejected on cost, not on a version constraint** — correcting the earlier reasoning (`judgment.md` S-5): `TEMPLATE_VERSION` bumps on *column* change (`template-columns.ts:23-28`), and a new worksheet changes no column and no `TEMPLATE_HEADERS`, so it would **not** force a version bump. It is declined because it puts a reference dataset inside a distributed binary asset that must then be regenerated and re-shipped whenever Tanzania's administrative map changes, where (c) is a text edit.

### DD-2: Trader type written as canonical codes — column-driven where the column works, sheet-level where it does not

- **Context:** Measured resolve rates against the shipped `TRADER_TYPE_ALIASES`: `Offtaker_Beans` 435/436, `Seed Company` 11/11 — but `Digital Service Provider` **0/13** (free-text business descriptors, one a full sentence), `Humantarian` 26/35, and QDS's `cbo` resolves to **`humanitarian`**, which would mislabel 23 producers.
- **Decision** (corrected to match FR-4 — `judgment.md` C-4): the AT team writes canonical codes into the template's `Trader Type` column, assigned as follows:

| Sheets | Assignment |
|---|---|
| `OFB` · `OFS` · `OFG` | **Column-driven** — the source column genuinely distinguishes `informal_trader` from `offtaker`, and that distinction covers 701 of the pre-quarantine records |
| `BBB` | Sheet-level `bulk_buyer` |
| `HUM` | Sheet-level `humanitarian` |
| `DSP` | Sheet-level `digital_service_provider` |
| `SDC` | Sheet-level `seed_company` (the column agrees 11/11) |
| `QDS` | Sheet-level `qds_producer` |

- **The 11 `"Retaler"` rows (FR-4, OQ-3 — `judgment.md` C-5):** **quarantine, do not add an alias.** `normalize.ts:182` already carries the correctly-spelled `retailer → informal_trader`; adding `retaler` would bake a single workbook's typo into a shared taxonomy that every future import consults. The AT team corrects 11 cells in the source instead. **This closes OQ-3.**
- **`cbo` is avoided by construction, not by impossibility.** Writing canonical codes means the raw `cbo` value never reaches `normalizeTraderType`. But the alias remains live for anyone who *does* submit `cbo` — the previous draft's claim that the collision was "structurally impossible" was false (§1 consequence 2, `judgment.md` C-7). What is true: this onboarding never submits the value, so the collision cannot occur *on this path*.
- **Consequences:** `normalize.ts`'s alias map needs no change, so no existing import behavior shifts. Cost: the type becomes a mapping decision a human must get right — the R-1 blind spot, covered by the §12 substitutes.
- **OQ-4 remains open (`judgment.md` S-9):** 12 of the 26 `Bulk buyers_beans` organisations are named `…AMCOs` (Agricultural Marketing Co-operative Societies) (corrected from 15 at the T-8 pivot, `execution.md` — C-9) and are arguably `cooperative`. Sheet identity (`bulk_buyer`) is the **interim default**; the decision is flagged in `mapping.md` for the AT team and is not silently settled here.

### DD-3: Phone normalization is wired into the import path, not the write DTO

- **Context:** `phone` has no format validation anywhere (`actor-create.dto.ts:88` is `@IsOptional() @IsString()`). A DTO `@Transform` would normalize all writes uniformly.
- **Decision:** import path only.
- **Consequences:** The deciding factor is FR-5's no-silent-loss clause — a multi-number cell must raise a **warning**, and a DTO transform has nowhere to put one. Admin-form-entered phones therefore stay unnormalized. That asymmetry is **recorded as follow-up F-2 in §10.1** (the previous draft cited a follow-up record that did not exist — `judgment.md` S-16).

### DD-4: One reason per failed row, with a fully defined ordering

- **Context:** FR-7 requires the breakdown to sum to `failed + skipped`, but a row can carry several `errors` on different columns.
- **Decision:** attribute each row to exactly one reason, chosen by an explicit rule; keep full error lists on `rows[].errors`.
- **Ordering rule (specified after judgment — `judgment.md` S-7):** errors are **not** pushed in template-column order (`validateRow` pushes `region` at `:358` before `traderType` at `:374`, while `TEMPLATE_COLUMNS` orders Trader Type before Region), so `errors[0]` is **not** the answer. The implementation MUST sort a row's errors by each field's index in `TEMPLATE_COLUMNS` and take the first. The `_row` batch-rollback pseudo-field has no such index and is mapped to the explicit slug `batch-rolled-back`, sorted last.
- **Consequences:** The sum invariant is exact and testable. Cost: a row failing both `region` and `traderType` is counted once, so the breakdown answers *"what stopped the most rows?"*, **not** *"how many rows had any region problem?"*. Stated so nobody reads it as the latter.

### DD-5: A contaminated-row register, by row number only

- **Context:** Three sheets carry appended tail blocks whose columns mean something different from the header (§9). No lookup or normalizer fixes a company name sitting in a district column.
- **Decision:** `mapping.md` names every affected row by sheet and **physical row number**, each marked hand-repair or quarantine — **never by organisation or person name** (see DD-6 and NFR-9).
- **Consequences:** These rows become visible work items rather than mystery quarantines. Cost: the register is measured against one workbook version and must be re-derived when the client sends a new file — FR-9's runbook says so.

### DD-6: QDS yields ~23 producer groups, not 42

- **Context:** Rows 289–312 are research institutes and the `Seed Company` sheet repeated — the `seed source` vocabulary pasted into the producer-name column, not producers.
- **Decision:** onboard only the `cbo` block; exclude the tail as cross-sheet duplicates and non-producers.
- **Selection rules made explicit (`judgment.md` C-8):**
  - **Dedup key:** producer name, **case-insensitive**, whitespace-trimmed. 311 rows collapse to 292 distinct names; this rule is what makes ~23 reproducible.
  - **Blank `producer_category` → quarantine**, never an assumed category (the "never guess" rule the spec is built on).
  - **~5 `cbo` entries are personal names** rather than groups, and at least one pair is an internal duplicate. These are **hand-classified**.
- **PII rule for the hand-classification (`judgment.md` S-4):** the decisions are recorded **by physical row number only**. NFR-9 forbids any individual producer name in any committed file, and `mapping.md`/`reconciliation.md` are committed. No name, no initials, no partial identifier.
- **Consequences:** Refines the count behind D-1 without reversing it. Cost: a hand-classification no gate can verify, recorded in a form that cannot itself breach NFR-9.

### DD-7: Cross-sheet duplicates are flagged, never merged

- **Context:** 11 duplicate groups spanning 24 records; one organisation appears in three sheets under three spellings — corrected from 8 groups / 18 records at the T-10 finding (`execution.md`, `reconciliation.md` §6) — **C-14**.
- **Decision:** `reconciliation.md` lists candidates **by organisation name and row number** — organisation names are not PII; **individual** producer names are, and are excluded per DD-6. A human decides; code never merges.
- **Consequences:** Consistent with `proposal.md` §6. The loose-match key used for *detection* is deliberately not used for *identity* — a false match merging two real organisations would be silent and hard to unwind.

### DD-8: One upload per source sheet

- **Context:** `MAX_DATA_ROWS = 1000`, 4 MB decoded cap, single synchronous Lambda request. Total net yield ~751 (§9.1, corrected from ~757 at the T-8 pivot — `execution.md` — C-8) would *fit* one upload; the largest single sheet (436) fits comfortably.
- **Decision:** one upload per sheet anyway.
- **Consequences:** Per-sheet reconciliation counts come for free, a failure's blast radius is one sheet, and headroom under both caps stays wide. **The cap does not force splitting at this volume — auditability is the actual reason.**

### DD-9: Key scheme — prefix + source id, positional fallback

- **Context:** Decision D-2 in `requirements.md` §4, sized by measurement: **38** blank ids (corrected from 52 at the T-7 pivot, `execution.md` Finding 1), 2 intra-sheet duplicates, **5 sheets with no id column** (≈105 actors), 6 cross-sheet collisions.
- **Decision:** `<PREFIX>-<sourceId>` where the id exists and is unique in its sheet; `<PREFIX>-R<physicalRow>` otherwise.
- **Consequences:** Deterministic and reproducible, so FR-2's idempotent re-run works and `skipped-exists` is meaningful. Traceable to a cell in the client's file. **Irreversible in practice** — epic **R-6** (`traderId` collisions) and this spec's `proposal.md` **R-1** (key namespacing is effectively irreversible); the earlier draft mis-cited epic R-1, which is chunk 3's PII-surface risk (`judgment.md` S-14). This is why the scheme required explicit approval before any import.
- **Determinism has no automated gate.** Keys are produced by hand in a spreadsheet, so FR-2's "same workbook mapped twice yields byte-identical keys" and NFR-6's key clause are verifiable only by re-running the mapping and diffing. Listed in §12's uncoverable set.

### DD-10: DMS coordinates are blanked and flagged, never coerced

- **Context:** 70 QDS coordinate cells are degrees-minutes strings (corrected from 71 at the T-8 pivot — `execution.md` — C-11); at least one has out-of-range minutes. `Number()` on them yields `NaN`.
- **Decision:** leave GPS blank and flag the row.
- **Consequences:** `gpsLatitude`/`gpsLongitude` are optional, so the actor still imports — FR-10 forbids quarantining an actor merely for unusable GPS. Most affected rows disappear with the excluded individuals (D-1). A conversion rule was rejected because one measured value is already invalid, so conversion would need its own validation and quarantine path to serve very few records.

### DD-11: `Seed Company`'s 11 organisations quarantine pending a region pass — *added after judgment*

- **Context (`judgment.md` S-1):** the sheet has no region column and its location column (`Where is the offtaker based(Town/District)`) is **0 of 12 filled**. `region` is required at three layers: `schema.prisma:41`, `template-columns.ts:108-113` (`required: true`), and `actor-import.service.ts:357-358`. DD-1's district lookup cannot help — there is no district either.
- **Options:** (a) quarantine all 11 · (b) derive region from each company's GPS · (c) have a human supply the region.
- **Decision: (a), with (c) as the unblocking step.** All 11 quarantine; the AT team supplies a region per organisation — these are 11 named seed companies with public addresses, so this is minutes of work, not research.
- **Consequences:** `Seed Company` contributes **0** actors in the first pass (§9.1). **(b) rejected** — reverse-geocoding to an administrative region is a guess dressed as a derivation, and FR-3 explicitly forbids substituting a placeholder or nearest-neighbour region. Note only 6 of 11 have GPS anyway (corrected from 7 at the T-8 pivot — `execution.md` — C-10).

### 10.1 Follow-ups this spec knowingly defers

Recorded here because the previous draft cited a follow-up register that did not exist (`judgment.md` S-16).

| ID | Deferred item | Why not now |
|---|---|---|
| **F-1** | `normalizePhone()`'s `null` branch **narrows** existing import behavior: a value that previously stored verbatim now stores as `null` + warning (§4.1) | Deliberate and desirable, but it is a behavior change and must be visible in review rather than buried in NFR-3's "additive only" |
| **F-2** | Admin-form-entered phones remain unnormalized, so the same value is normalized on the import path and not on the form path (DD-3) | Fixing it needs a DTO `@Transform` with nowhere to surface the multi-number warning; a separate spec should decide the write-path contract |
| **F-3** | `OQ-4` — 12 `…AMCOs` typed `bulk_buyer` by sheet identity rather than `cooperative` (corrected from 15 at the T-8 pivot — `execution.md` — C-9) | Needs the program's taxonomy call; flagged in `mapping.md` |
| **F-4** | No automated gate exists for public invisibility over the real committed dataset (§7.1) | Requires a test environment with a reachable database; out of this spec's scope |

### Reversion challenge (Step 2.3)

**Triggered once, by DD-11's sibling: §4.1's `null` branch (F-1).** It removes existing behavior — the importer today stores an unnormalizable phone verbatim (`actor-import.service.ts:531`), and after this change it stores `null`.

*What does removing this break?* A caller who submitted a phone in a format the normalizer does not recognise — a non-Tanzanian number, for instance — previously kept the digits and now loses them from the `phone` column. **Concrete breakage addressed:** the row still imports, and a warning names the column so the value is recoverable from the source file. Not addressed, and accepted: a *future* canonical-template import of legitimately foreign contacts would silently blank them. Recorded as F-1 so it is visible rather than discovered.

No other decision removes, disables, or inverts delivered behavior. DD-1 and DD-3 *decline to extend* existing behavior; declining to add is not a reversion.

---

## 11. Risks & Mitigations

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | **A wrong-column mapping passes every gate.** The importer validates shape, not meaning — and its `Region`/`Trader Type` checks accept alias supersets, not the canonical lists (§1 consequence 2) | Mandatory human review of `mapping.md` at the HITL gate; ≥5-row cell-by-cell trace per sheet recorded in the reconciliation; residual risk accepted in writing (`requirements.md` §9) |
| **R-2** | **~700 real phone numbers and ~38 emails enter the DB** across the onboarding (§7, measured; rescaled to the ~751-record set at the T-8 pivot — `execution.md` — C-13) | Everything `UNKNOWN` → excluded by the ADR-004 `WHERE`. `pii-boundary.spec.ts` green before *and* after, plus the §7.1 operator-run post-commit check |
| **R-3** | **Silent data loss** — a 700-row "success" from a **1,237**-row source reads as success | Reconciliation classifies every physical row into one of four buckets; totals reconcile per sheet (FR-8) |
| **R-4** | **Irreversible keys** | Scheme fixed and user-approved before execution (DD-9); reproducible by construction, though only verifiable by re-running the mapping |
| **R-5** | The workbook is a **human artifact that keeps changing** — three header rows, three spellings of one concept, appended blocks already | The mapping doc is the artifact, editable in minutes. The contaminated-row register is version-bound (DD-5) |
| **R-6** | **Frontend/backend type drift** on the additive field | Both mirrors land in one change (§6); `frontend/CLAUDE.md` makes exact-mirror a review criterion |
| **R-7** | **A green suite mistaken for a correct mapping** (KZ-002) | `requirements.md` §9 states the disqualifier: "gates green" is not evidence of mapping correctness, and a Reviewer must reject it as such |
| **R-8** | **FR-6's at-scale clause has no automated gate** (§7.1) | Operator-run post-commit check in the runbook, recorded in `reconciliation.md`; limitation stated in §12 and `requirements.md` §9 rather than concealed |

---

## 12. Test Plan Outline

| FR | Coverage | Command |
|---|---|---|
| FR-1 | `mapping.md` column dispositions **sum to each sheet's measured column count** (§4.5); all four disposition values used correctly; header/first-data-row recorded per sheet | Manual review at the HITL gate — **no automated gate** |
| FR-2 | Key format conformance and uniqueness across all sheets; re-run of an unchanged workbook yields zero creates (`skipped-exists`) | `cd backend && npm test -- import` (fixture) + operator re-run |
| FR-3 | Every `DISTRICT_TO_REGION` value ∈ `CANONICAL_REGIONS`; **`mapping.md`'s table matches the constant entry-for-entry**; ambiguous/foreign/unknown still quarantine | `cd backend && npm test -- normalize` |
| FR-4 | Column-driven assignment preserved for `OFB`/`OFS`/`OFG`; the 11 `"Retaler"` rows quarantine (no alias added) | `cd backend && npm test -- normalize` + `mapping.md` review |
| FR-5 | Table-driven cases per measured format; multi-number returns first + count; **non-empty input yielding `null` → row created, `phone` null, warning raised**; no phone value in any warning text | `cd backend && npm test -- normalize` |
| FR-6 | Serializer/consent boundary over HTTP with mocked DB; **plus** the §7.1 operator post-commit check over the real dataset | `cd backend && npm test -- pii-boundary` + manual (see §12.1) |
| FR-7 | Breakdown sums to `failed + skipped`; deterministic ordering; `_row` maps to `batch-rolled-back`; existing report fields unchanged; no PII in slugs | `cd backend && npm test -- import` |
| FR-7 (FE) | Type mirrors backend optionality exactly; breakdown renders in the **preview** branch; announces via `role="status" aria-live="polite"`; token-only classes | `cd frontend && npm test -- import` |
| FR-8 | Per-sheet classification totals reconcile against `requirements.md` §3.1 | Arithmetic review — **no automated gate** |
| FR-9 | Runbook carries all five MUST clauses of §4.6 | Manual review |
| FR-10 | Case-insensitive dedup rule stated; blank `producer_category` quarantines; tail rows 289–312 excluded; DMS coordinates blanked not coerced | `mapping.md` review + `npm test -- import` fixture |
| FR-11 | Stale `v1` template message contains the **download location** (the new element), while `out of date` and `re-download` remain present so neither existing assertion is edited | `cd backend && npm test -- import` |
| NFR-1 | PII boundary green | `cd backend && npm test -- pii-boundary` |
| NFR-3 | Full gates green with **no existing test edited to accommodate a changed shape** | `cd backend && npm test -- --silent && npm run build && npx eslint "{src,test}/**/*.ts" --quiet` |
| NFR-4/5 | New constants in `normalize.ts`; new functions import no Nest/Prisma/IO | `cd backend && npm test -- normalize` + import-graph review |
| NFR-6 | Normalizer determinism asserted; **key determinism is not automatable** (see §12.1) | `cd backend && npm test -- normalize` |
| NFR-9 | No real PII in any committed file | `grep -rnE '\b(0[67][0-9]{8}\|255 ?[67][0-9]{8}\|[67][0-9]{8})\b' docs/specs backend/src --include='*.md' --include='*.ts'` |

**Fixture PII rule:** the worked-example fixture reproduces the source's *structure*, never its values. Synthetic names and phone numbers only (NFR-9).

### 12.1 What no gate in this repository covers

Stated per KZ-002, and expanded after judgment. Every item here is a **human or operator responsibility**, not a covered property:

1. **Whether a column was mapped to the *right* canonical column** (R-1). Shape checks pass on a wrong-but-valid value.
2. **Whether a sheet's assigned trader type is factually correct.**
3. **Whether the QDS `cbo` hand-classification is right.**
4. **Whether a district maps to the *correct* region** (§4.2). Membership and doc↔constant assertions both pass on a wrong pairing. `requirements.md` §9 previously mis-classified this as automated.
5. **Public invisibility over the real committed dataset** (§7.1, R-8). The only HTTP-level suite mocks the database.
6. **Key determinism across two mapping runs** (DD-9). Keys are hand-produced; verification means re-running and diffing.

---

## 13. Budget (Step 2.4 tripwire)

Estimated from the revised design. **A tripwire for `/akili-execute`, not a quality cap** — exceeding it means stop and escalate.

| Signal | Expected |
|---|---|
| **Tasks** | **12** (11 + a task for §4.6's runbook, previously undesigned) |
| **Code LOC** | **~900** — ≈400 implementation across 5 source files, ≈500 test across 4 test files |
| **Documentation lines** | **~1,250** (`mapping.md` ~600 · `reconciliation.md` ~400 · runbook ~200 · TRD note ~15) |
| **Review rounds** | **~18** (12 tasks + ~6 rework) |

**Changes from the pre-judgment budget, and why:**

- **Review rounds 13 → 18.** Chunk 1 planned ~12 for 10 tasks and **exceeded it** (`kaizen-log.md:34`). Repeating that rate on a spec whose largest deliverable has no automated gate would make the tripwire fire as noise. Six rework rounds is the honest allowance (`judgment.md` C-15).
- **`reconciliation.md` 250 → 400 lines**, with the reading stated: FR-8 requires every physical row be *classified*, which is satisfied by **per-sheet totals plus explicit enumeration of every quarantined and excluded row by number** — not by 1,237 individual line items. `requirements.md` FR-8 is amended to say so (`judgment.md` C-13).
- **File count corrected:** the ≈500 test LOC land in test files (`normalize.spec.ts`, `actor-import.service.spec.ts`, an import fixture spec, `import/page.test.tsx`) that the earlier "5 files" count excluded (`judgment.md` S-25).

**Sizing verdict: `Full` depth is correct, and the balance is unusual.** Code is a modest ~900 LOC; the documentation is the deliverable and carries the risk — 8 sheets × every column accounted for, plus a contaminated-row register and six explicitly uncoverable properties.

**Watch item for the Leader:** the `mapping.md` task — whichever number decomposition assigns it — is the largest single unit and the one no automated gate can verify. If it exceeds ~600 lines or needs more than 2 review rounds, split it per sheet-group rather than grinding.

---

## 14. Requirement → design traceability

Per-requirement, with no lumped rows (`judgment.md` C-12).

| Requirement | Design sections |
|---|---|
| FR-1 | **§4.5** (structure), §1, §9, DD-5 |
| FR-2 | DD-9, §12 |
| FR-3 | §4.2, DD-1, DD-11, §12 |
| FR-4 | **DD-2** (column-driven vs sheet-level, `"Retaler"`, OQ-4), §9 |
| FR-5 | §4.1 (incl. the `null` branch), DD-3, F-1, §12 |
| FR-6 | **§7.1**, §4.6 item 4, R-8, §12.1 item 5 |
| FR-7 | §3, §4.3, §5, §6, DD-4 |
| FR-8 | §9.1, DD-6, DD-7, R-3, §13 (reading) |
| FR-9 | **§4.6**, DD-8, DD-5 |
| FR-10 | DD-6 (dedup key, blank category, PII rule), DD-10 |
| FR-11 | §4.4, §12 |
| NFR-1 | §7, §12 |
| NFR-2 | §7.1, §12.1 item 5 |
| NFR-3 | §2, §3, §4.4, F-1, §12 |
| NFR-4 | §4.1, §4.2 |
| NFR-5 | §4.1 |
| NFR-6 | §3 (breakdown ordering), §4.1, DD-9 + §12.1 item 6 (key determinism uncovered) |
| NFR-7 | §4.3, §7 |
| NFR-8 | §4.3 |
| NFR-9 | §7, DD-5, DD-6, DD-7, §12 (fixture rule + grep gate) |

**D-1 → DD-6 · D-2 → DD-9 · D-3 → §9.1 and DD-2's DSP row** (the foreign-actor exclusion, previously uncited — `judgment.md` S-12).
