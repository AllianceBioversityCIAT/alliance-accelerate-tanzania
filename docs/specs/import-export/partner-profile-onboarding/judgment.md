# Judgment Day — Findings Ledger

- Spec path: `docs/specs/import-export/partner-profile-onboarding/`
- Target: `design.md` (draft) judged against `requirements.md` (approved) — Round 1
- Date: 2026-08-04
- Mode: `judgment_day` — blind dual judge, read-only
- Invoked at: `/akili-specify` Phase 2 Step 2.5, **Review Design** option (user-selected)

## Protocol record

| Item | Value |
|---|---|
| Judges | 2, launched in parallel against an immutable target, identical scope and criteria |
| Judge tools | Read / Grep / Glob only (`akili-reviewer` agent type) — no write capability |
| Judge model | Both **opus** (T3 Auditor per the project registry) |
| **Deviation from skill preference** | The skill prefers judges on a model *different* from the design's author (also opus). Independence here is supplied by **blindness** — fresh contexts with no access to the author's reasoning — rather than by a capability downgrade, because the target is a dense technical document where auditor capability is load-bearing. Recorded deliberately |
| Judge blindness | Neither judge saw the other's findings, nor the author's reasoning; each was told to form an independent judgment and not to ask what the other found |
| Delivery | Both judges initially went idle without delivering; findings retrieved by explicit request. Both were instructed that an honest partial report was preferable to a fabricated one |
| `review-refuter` | Not launched (forbidden — two-judge agreement is the corroboration mechanism) |
| Orchestrator verification | The parent independently re-verified the highest-impact factual findings against the codebase rather than accepting judge output at face value. Verified: C-1, C-2, C-3, C-7, S-1 |
| Raw findings | A: 25 (7 severe / 15 warning / 3 suggestion) · B: 26 (8 severe / 15 warning / 3 suggestion) |
| Merged distinct | **40** |

## Counts

| Class | Count |
|---|---|
| **CONFIRMED** (both judges, same defect) | **15** — 7 severe-class, 8 warning-class |
| **SUSPECT** (one judge only) | **21** — 4 severe, 13 warning, 4 suggestion |
| **CONTRADICTION** (judges disagree) | **1** |
| INFO (suggestion, confirmed) | included above |

---

## CONFIRMED — severe class (eligible for round-one fix)

### C-1 · Wrong API endpoint path · A-1 + B-1 · **orchestrator-verified**
`design.md` §1 (flow diagram) and §3 name `POST /api/v1/actors/import`. The real route is **`POST /api/v1/admin/actors/import`**.
**Evidence:** `admin-actors.controller.ts:56` `@Controller('admin/actors')` + `:130` `@Post('import')`; `main.ts:16` / `lambda.ts:24` `setGlobalPrefix('api/v1')`; `lambda-handler.e2e.spec.ts:142` `IMPORT_PATH = '/api/v1/admin/actors/import'`. `actors.controller.ts` has only `@Get()` and `@Get(':id')`.
**Impact:** §3's sole job is the API contract. A runbook (FR-9) written from it targets a 404, and it implies an unguarded public write path.

### C-2 · `/actors/geo` and `/export` do not exist · A-5 + B-2 · **orchestrator-verified**
§7 and §12 assert zero onboarded actors across five public paths including `/actors/geo` and `/export`. Neither endpoint exists anywhere in `backend/src`.
**Evidence:** Full route inventory across all controllers yields only `/actors`, `/actors/:id`, `/metrics` as public paths. `pii-boundary.spec.ts:30-39` **already documents this** as a scope correction recorded in chunk 1.
**Impact:** Two of five asserted paths are unassertable. `.agents/reviewer.md`'s Inherited-Claim Re-Check makes re-asserting a known-unverifiable claim a FAIL. **This is a verbatim repeat of the kaizen log's own deferred item** — *"the TRD documents `/actors/geo` across five sections as though implemented; it does not exist"* — copied forward after being read.

### C-3 · The PII gate structurally cannot test what FR-6/NFR-2 require · A-4 + B-3 · **orchestrator-verified**
FR-6 requires the zero-public-exposure assertion "GIVEN the full onboarding committed", over HTTP. §12 discharges it with `npm test -- pii-boundary`, a suite whose database is mocked.
**Evidence:** `pii-boundary.spec.ts:19-26` — *"the only thing faked is the database: a mocked `PrismaService` serves in-memory fixtures. The DB is the only seam because no MySQL is reachable here."*
**Impact:** The spec's most load-bearing safety requirement (~800 real contacts) has a gate that cannot fail on the condition it claims to test. Exactly the KZ-002 disqualifier the design's own §11 R-7 says a Reviewer must reject.

### C-4 · DD-2 contradicts FR-4 on 701 of ~806 actors · A-6 + B-4
DD-2 decides trader type is "a canonical code **per sheet**". FR-4's approved criterion requires `OFB`/`OFS`/`OFG` to be **column-driven** across two distinct types.
**Evidence:** FR-4: *"`OFB`/`OFS`/`OFG` → column-driven (`informal_trader` / `offtaker`)"*. DD-2 cites the column *working* on those sheets (435/436) and then discards it. §14 traces FR-4 → DD-2, so the traceability table hides the contradiction.
**Impact:** As written, all 701 offtaker rows collapse to one trader type — a wrong-value-in-a-valid-column defect no gate detects.

### C-5 · The 11 `"Retaler"` rows have no design mechanism · A-7 + B-4
FR-4 requires those rows be quarantined *"unless an alias for that exact typo is added deliberately, and MUST record which choice was made"*; OQ-3 is still open. The string `Retaler` appears nowhere in `design.md`.
**Evidence:** `normalize.ts:182` has `['retailer', 'informal_trader']` — the correctly-spelled alias, which does not match `Retaler`.
**Impact:** 11 rows with an undecided disposition and no owner. Per KZ-001 this clause may not be discharged by DD-2 being satisfied elsewhere.

### C-6 · FR-1's operative clauses are unmechanised · A-8 (warning) + B-6 (severe)
`design.md` contains no occurrence of "disposition", `EMPTY-IN-SOURCE`, or "column count". §12 has **no FR-1 row at all**.
**Impact:** The design calls `mapping.md` "the load-bearing artifact" (~600 lines, §13) yet never specifies its structure — so requirements §9's D-5 gate (dispositions sum to column count) cannot be run. KZ-001's exact shape.
*Severity split: A rated warning, B severe. Adjudicated **severe** — it is the largest deliverable and its only checkable property is unrepresented.*

### C-7 · §1's "fails at upload" backstop is false · A-2 (severe) + B-9 (warning) · **orchestrator-verified**
§1 claims a mapping error in `Region`/`Trader Type` "fails at upload" because those columns "admit only" the canonical lists, and DD-2 calls the `cbo → humanitarian` collision "structurally impossible". The server-side gate is the **alias-accepting normalizer**, not an exact-set check.
**Evidence:** `actor-import.service.ts:360` calls `normalizeRegion`, `:376` calls `normalizeTraderType`; `normalize.ts:194` is `['cbo', 'humanitarian']`. The canonical list is enforced only by the in-Excel dropdown (`generate-import-template.ts:211-219`) — client-side and not paste-proof.
**Impact:** The design's central safety argument rests on a false premise, and §11 R-1 concedes the opposite. DD-2's justification for needing no `normalize.ts` change collapses with it.
*Severity split: adjudicated **severe** — it underpins DD-2 and the §1 risk framing a Leader reads to size the work.*

---

## CONFIRMED — warning class (recorded; not auto-fixed)

| ID | Finding | Judges |
|---|---|---|
| C-8 | FR-10's case-insensitive dedup rule and blank-`producer_category` quarantine have no design statement — the dedup key is what makes ~23 reproducible | A-9 + B-23 |
| C-9 | `§10 Code Suppression` cross-reference resolves to nothing; §10 is "Design Decisions" and no such rule exists in the repo | A-17 + B-22 |
| C-10 | `Offtaker_Groundnuts` contaminated range "147–152" exceeds the sheet's last physical row (151) — and DD-5 makes exact row numbers the deliverable | A-11 + B-16 |
| C-11 | Count correction incoherent: `design.md` says "not 43", `requirements.md` records the superseded figure as 42 (and 42 is what 825 requires) | A-10 + B-20 |
| C-12 | §14's `NFR-1..9` lumped row cites §13 (Budget, discharges nothing) and omits §3/§4.1/§4.2 where NFR-4/5/6 actually live | A-18 + B-13 |
| C-13 | `reconciliation.md` budgeted ~250 lines against FR-8's per-row classification of **1,237** physical rows — either ~5× wrong or a silent reinterpretation | A-20 + B-19 |
| C-14 | `ImportPreviewTable.tsx` has no `aria-live` and takes only `{rows}`; the live regions are in `page.tsx`, which §5 does not list | A-15 + B-17 |
| C-15 | Review-round budget (~13, 2 rework) repeats a rate chunk 1 already **exceeded** at ~12 planned / 10 tasks | A-19 + B-25 |

---

## SUSPECT — severe, single judge (all four independently checked by the orchestrator and assessed correct)

| ID | Finding | Judge |
|---|---|---|
| S-1 | **`Seed Company`'s 11 actors have no path to a required `region`.** The sheet has no region and no district data (its location column is 0/12 filled), so DD-1's district lookup cannot serve them; FR-3's criteria never mention SDC. Either all 11 fail at upload (yield ~795) or a human invents a region — which FR-3 explicitly forbids | A-3 |
| S-2 | **The `normalizePhone()` null branch is unspecified.** §4.1 defines the return but never says what the pipeline does with `null` for a non-empty cell — fail the row, warn and drop, or store raw. Today `actor-import.service.ts:531` stores it verbatim. Three defensible implementations, one of which silently deletes real contacts on every future import | B-5 |
| S-3 | **§4.2's "cannot drift" has no mechanism, and the FR-3 gate is membership-only.** No generator or doc↔constant assertion is specified; asserting every value ∈ `CANONICAL_REGIONS` cannot detect a district mapped to the *wrong* region, yet requirements §9 D-1 marks that defect "automated: Yes" and §12's uncoverable list omits it | B-7 |
| S-4 | **DD-6 instructs recording personal names, which NFR-9 forbids.** "~5 entries are personal names … hand-classified, with the decision recorded" versus NFR-9's ban on any *individual producer name* in any committed file. No redaction or pseudonymisation mechanism is specified — and this spec already had to remediate exactly this breach once (OQ-1) | B-8 |

## SUSPECT — warning, single judge

| ID | Finding | Judge |
|---|---|---|
| S-5 | DD-1 rejects option (b) on a false constraint: `TEMPLATE_VERSION` bumps on **column** change, and a new worksheet changes no column or `TEMPLATE_HEADERS` (the generator already adds two non-Data sheets) | A-12 |
| S-6 | FR-11's gate is already green with zero code change — the shipped message names both versions; only the download location is new, and §12 does not assert it | A-13 |
| S-7 | DD-4's "first error in template-column order" is undefined for the `_row` commit-chunk failure and does not match push order (`region` at :358 before `traderType` at :374, while the template orders Trader Type first) — breaking the sum invariant | A-14 |
| S-8 | ~806 is the **pre-quarantine** sum, while the requirements mandate quarantining ~33 counted rows inside it; a reconciliation landing near ~773 will read as a defect rather than the requirements working | A-21 |
| S-9 | DD-2 silently settles OQ-4 (15 of 26 bulk buyers are AMCOs — cooperatives) without recording a decision | A-22 |
| S-10 | The FR-11 message rewording is constrained by two existing assertions (`/out of date.*re-download/i`, `/out of date/i`) that NFR-3 forbids editing | A-25 |
| S-11 | FR-3 mandates the quarantine slug `region-unresolved`; §3's field-derived vocabulary yields `region` | B-10 |
| S-12 | Decision **D-3** (3 foreign DSP actors excluded) is never cited in `design.md`; "outside Tanzania" and "foreign" appear nowhere. It survives only as the bare figure "10 DSP" | B-11 |
| S-13 | FR-9's runbook has five MUST clauses and no design section — including the legally consequential *"must NOT instruct anyone to set `consentStatus` to `GRANTED`"* | B-12 |
| S-14 | DD-9 cites "epic R-1" for irreversibility; epic R-1 is chunk 3's PII-surface risk. The correct citations are epic R-6 and this spec's `proposal.md` R-1 | B-14 |
| S-15 | "3 sheets with no id column" contradicts FR-2, which enumerates **five** (BBB, HUM, DSP, SDC, QDS ≈ 105 actors) — under-sizing the positional-key population | B-15 |
| S-16 | DD-3 dismisses the admin-form phone asymmetry as "recorded as a follow-up" — no such record exists in §11, requirements §10, or anywhere else | B-18 |
| S-17 | **Requirements-internal contradiction the design should have surfaced:** FR-4 requires 9 QDS rows self-declaring `Seed Company` be typed `seed_company`, while FR-10 excludes rows 289–312 where those rows sit. DD-6 adopts exclusion and never mentions the conflict | B-21 |

## SUSPECT — suggestion, single judge

| ID | Finding | Judge |
|---|---|---|
| S-18 | Phone fill-rate is never measured, yet "~800 real contacts" is the proportionality argument | A-23 |
| S-19 | §13's watch item pins `mapping.md` to `T-6` before `tasks.md` exists | A-24 |
| S-20 | Three different source-row totals in play: 1,100 (§11 R-3), 1,318 (`proposal.md` estimate), 1,237 (measured) | B-24 |
| S-21 | FR-5 requires the warning name the discarded value's **position**; §4.1 returns a count | B-26 |

---

## CONTRADICTION — escalated for explicit human decision

### X-1 · Does `design.md`'s section numbering violate the mandatory template?

| Judge | Position |
|---|---|
| **A (A-16, warning)** | It violates it. `docs/specs/general-setup/design.md` mandates §3 API, §4 Backend, §6 Security, §7 Infrastructure, §8 Decisions, §9 Risks, §10 Test Plan and says specs "MUST follow this structure". Inserting §6 "Shared Contracts" and §9 "Measured findings" shifts Security→§7, Infra→§8, Decisions→§10, Risks→§11, Tests→§12. The **archived chunk-1 design holds template numbering exactly for §1–§8** and appends §9–§12. Every downstream `§n` citation written from template convention then resolves wrongly — as C-9 demonstrates inside this very document |
| **B** | Not a finding. "The extra §6/§9/§13 sections follow this repo's convention of extending `docs/specs/general-setup/design.md`" |

**Why it matters beyond style:** A's supporting evidence — chunk 1's archived design conforming exactly — is checkable and was not contradicted by B, who asserted a convention without citing an instance. C-9 (a real dangling `§10` reference) is consistent with A's predicted failure mode.

**Decision required from the user.** Not resolved by the orchestrator.

---

## Round-one correction scope (proposed, awaiting user approval)

Per the skill's decision gate, only **CONFIRMED severe** findings are eligible without further authority: **C-1 … C-7**.

The orchestrator additionally recommends including **S-1 … S-4** (single-judge severe, each independently re-verified against the codebase) and the cheap factual corrections **C-9, C-10, C-11, C-12, S-12, S-14, S-15** — all one-line accuracy fixes whose cost is far below a later rework round.

**C-3 / S-1 / S-2 / S-3 / S-4 are not editorial.** Each requires a genuine design decision, not a wording change:
- **C-3** needs a real post-commit verification mechanism, or an honest statement that none exists and FR-6's at-scale clause is unmet.
- **S-1** needs a decision on 11 region-less seed companies.
- **S-2** needs the null-branch behavior chosen.
- **S-3** needs either a generator/assertion or an admission that district→region correctness is uncoverable.
- **S-4** needs a redaction rule reconciling DD-6 with NFR-9.

---

## Round-one correction — APPLIED 2026-08-04

User directive: **"Fix only"** — apply corrections, **skip scoped re-judgment**. Recorded because it changes what this receipt can claim.

**Fix actor:** the parent orchestrator, inline. The skill prefers a bounded fix actor; these are edits to documents the orchestrator authored, and no independence constraint exists for a fix step (unlike a judge). Recorded as a deliberate deviation.

### Corrected — confirmed severe

| ID | Correction |
|---|---|
| C-1 | Endpoint corrected to `POST /api/v1/admin/actors/import` in §1 and §3, with the Admin-guard note and the `lambda-handler.e2e.spec.ts:142` citation |
| C-2 | `/actors/geo` and `/export` removed from §7 and §12. New §7.1 states the three public paths that exist and cites the chunk-1 correction. `requirements.md` FR-6 amended |
| C-3 | New §7.1 separates what `pii-boundary.spec.ts` *does* prove (serializer + consent over real HTTP, mocked DB) from what it cannot (the onboarded set). Operator post-commit check added as §4.6 item 4 + R-8. `requirements.md` §9 D-3 split into D-3a (automated) / D-3b (**no gate**) |
| C-4 | DD-2 rewritten to match FR-4: **column-driven** for `OFB`/`OFS`/`OFG`, sheet-level for the rest, in an explicit table |
| C-5 | DD-2 now decides the 11 `"Retaler"` rows — **quarantine, no alias** (a workbook typo must not enter a shared taxonomy). **Closes OQ-3** |
| C-6 | New **§4.5** specifies `mapping.md`'s required structure: the four dispositions incl. `EMPTY-IN-SOURCE`, column-count reconciliation, per-sheet header/first-data-row. §12 gains an FR-1 row |
| C-7 | §1 consequence 2 rewritten: the importer is a **shape** backstop, not a meaning backstop — it calls the alias-accepting normalizers. DD-2's "structurally impossible" replaced with "avoided by construction on this path" |

### Corrected — verified single-judge severe

| ID | Correction |
|---|---|
| S-1 | New **DD-11**: all 11 `Seed Company` organisations quarantine pending an AT region pass; reverse-geocoding explicitly rejected. `requirements.md` FR-3 and §3.1 amended; net yield restated |
| S-2 | §4.1 specifies the `null` branch — **row created, `phone` null, warning raised**; never fail the actor, never store a mangled string. Logged as follow-up **F-1** because it narrows existing behavior |
| S-3 | §4.2 gains a **second assertion** (doc↔constant agreement) making the no-drift claim real; wrong district→region pairing moved to the uncoverable set. `requirements.md` §9 D-1 split into D-1a / **D-1b (no gate)** |
| S-4 | DD-6 records the QDS hand-classification **by row number only** — no name, initials, or partial identifier — reconciling it with NFR-9. DD-7 clarifies organisation names are not PII while individual producer names are |

### Corrected — confirmed and single-judge warnings

C-8 (dedup key + blank-category rule in DD-6) · C-9 (dangling "Code Suppression" ref removed) · C-10 (range → 147–**151**) · C-11 ("not **42**") · C-12 (§14 split **per requirement**, no lumped NFR row) · C-13 (`reconciliation.md` reading stated: per-sheet totals + enumeration of every non-imported row; budget 250→400) · C-14 (breakdown moved to `page.tsx`, which holds the report and the live-region pattern; §5 lists it) · C-15 (review rounds 13→**18**) · S-5 (DD-1 option (b) re-justified on cost — the `TEMPLATE_VERSION` constraint was false) · S-6 (FR-11 gate asserts the **new** download-location element) · S-7 (DD-4 defines the sort by `TEMPLATE_COLUMNS` index and maps `_row` → `batch-rolled-back`) · S-8 (§9.1 pre- vs post-quarantine table) · S-9 (OQ-4 recorded open, `bulk_buyer` interim, follow-up F-3) · S-10 (§4.4 names the two constraining assertions) · S-11 (`requirements.md` FR-3 slug aligned to the `region` field) · S-12 (D-3 cited in §14 and §9.1) · S-13 (new **§4.6** runbook contents incl. the never-set-`GRANTED` clause) · S-14 (DD-9 cites epic **R-6** + this spec's `proposal.md` R-1) · S-15 (**5** sheets with no id column) · S-16 (**§10.1** follow-up register F-1…F-4 now exists) · S-17 (`requirements.md` FR-4's 9-row exception **withdrawn** — it contradicted FR-10) · S-18 (§7 phone exposure **measured**: 1,023 of 1,097 rows phone-bearing, 56 email-bearing) · S-19 (watch item no longer pins `T-6`) · S-20 (1,100 → **1,237**) · S-21 (§4.1 explains count⇒position)

### Defect introduced by the fix round, and caught

The rewrite stated the pre-quarantine total as ~809. The correct sum is **806** (436+115+150+26+35+10+11+23). Corrected in §9.1 before this receipt was written. Recorded because a fix round is exactly where new arithmetic errors enter.

### Not corrected

| ID | Why |
|---|---|
| **X-1** | Judge contradiction on section-numbering conformance. **Escalated to the user and not ruled on.** Numbering left unchanged — the conservative choice, since renumbering would invalidate every `§n` citation in this ledger and in `requirements.md` |
| Scoped re-judgment | **Skipped at user direction** ("Fix only") |

---

## Terminal receipt

| Field | Value |
|---|---|
| Target | `design.md` (+ consequential `requirements.md` amendments) |
| Round | 1 of a permitted 2 |
| Confirmed | 15 (7 severe-class, 8 warning-class) — **all corrected** |
| Suspect | 21 (4 severe, 13 warning, 4 suggestion) — **all corrected**; the 4 severe were independently re-verified by the orchestrator first |
| Contradiction | 1 (**X-1, unresolved — awaiting user ruling**) |
| Correction work units | 1 fix round, inline, ~40 edits across 2 documents |
| Scoped re-judgment | **Not run** (user directive) |
| Independent final verification | **Not performed** — follows from skipping re-judgment |
| Artifacts | `judgment.md` (this ledger) · `design.md` (revised) · `requirements.md` (amended) |
| Skill resolution | `judgment-day`; project skills resolved from the root `CLAUDE.md` Skill Map and passed identically to both judges |

**JUDGMENT: ESCALATED ⚠️**

Escalated, not approved, for two reasons that are both honest rather than procedural: **X-1 remains an unresolved judge contradiction requiring a human decision**, and **no re-judgment or independent verification ran**, so nothing has audited the ~40 corrections just applied. The corrections are the author's own work checked by nobody — which is the precise condition the dual-judge protocol exists to remove. A future `/akili-validate` or the `/akili-execute` Reviewer is the next opportunity to catch what this round introduced.
