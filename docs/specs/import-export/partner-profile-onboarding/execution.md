# Execution Log — Partner Profile Workbook Onboarding

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/import-export/partner-profile-onboarding/` |
| Execution started | 2026-08-04 |
| Orchestrated by | `/akili-execute` — Leader → Implementer → Reviewer |
| **Approval Mode** | **`gated`** (`proposal.md` §1) — the continue/pause gate stops for the user after every task |
| Baseline commit | `ccf4ced` — spec documents landed before any task ran, so each task's diff is isolated |
| Tasks | 12 (`tasks.md` T-1 … T-12) |
| Budget tripwire (`design.md` §13) | 12 tasks · ~900 code LOC · ~1,250 doc lines · ~18 review rounds |
| CodeGraph | **Absent in this checkout** — only `.codegraph/config.json` is committed, the database is gitignored. Workers explore by file; no `codegraph_*` guidance was issued |
| Local stack | **Not required.** No task in this spec needs a running database or server; the two uncoverable at-scale properties are discharged by operator steps (T-9, T-10), not by this run |

### 1.1 Standing verification caveat (carried into every entry)

Two artifact classes, two regimes (`tasks.md` preamble). Code tasks (T-1…T-6, T-11) have runnable gates. Document tasks (T-7…T-10, T-12) mostly do **not** — their verification is arithmetic plus human review. Per KZ-002 and `design.md` §12.1, **six properties have no gate in this repository** and are never claimed from a green run:

1. right-canonical-column mapping · 2. sheet trader-type correctness · 3. QDS hand-classification · 4. district→region *correctness* · 5. public invisibility at scale · 6. key determinism across runs.

### 1.2 Leader skill/effort deviations from `tasks.md`

| Task | Deviation | Reason |
|---|---|---|
| T-12 | Dropped `software-architect` | That skill is for quality-attribute scenarios, ADRs, and C4 views. T-12 is a ~15-line clarifying note under an explicit no-ADR / no-renumber constraint; the skill's cost buys nothing. Repo conventions suffice |

---

## 2. Task Execution History

<!-- Entries appended below, one per task loop. Evidence before checkbox: the Reviewer PASS lands here first, then `tasks.md` flips to [x], then the commit. -->

### T-12 — Add the TRD clarifying note

- **Date:** 2026-08-04
- **Status:** ✅ **PASS** on attempt 2 (1 rework round)
- **Traces:** `requirements.md` §8 (TRD clarification)
- **Skills:** none (deviation recorded in §1.2) · **Effort:** `low`
- **Dispatched with:** T-1 in parallel — the only dependency-free pair sharing no build output (T-12 edits one Markdown file; T-2/T-4/T-6 are all backend and would contend for `node_modules`/Jest, and T-2 edits the *same two files* as T-1)

#### Attempt 1 — Reviewer FAIL

- **Files changed:** `docs/trd/trd.md` (single hunk at §3, 2 insertions, 0 deletions)
- **Implementer verification:** `git diff` confined to §3; `grep -n '^## '` before/after showing headings `1.`…`13.` unchanged in sequence, downstream line numbers shifted +2. `Not Done / Assumptions: none`
- **Leader corroboration:** I independently measured the BEFORE heading list before dispatch; it matched the Implementer's claim exactly

**Reviewer verdict: FAIL — one issue.**

> **Discovered Issue:** The note ends *"See `docs/specs/import-export/partner-profile-onboarding/mapping.md` for a worked example of that mapping step."* That path does not exist (T-7 creates it; T-12 does not depend on T-7), and it will cease to exist again at archive time when the spec folder relocates to `docs/specs/archive/<YYYY-MM-DD>-import-export--partner-profile-onboarding/` — the relocation demonstrated by all 21 archived specs, including chunk 1's, archived in this repo today. A constitutional document is left asserting a resource the reader cannot reach, in both the present and the post-archive state.
>
> **Violated Rule:** `docs/trd/trd.md` §12.5 **ADR-009** (citation stability is an accepted architectural commitment; a constitutional document must not depend on a path documented as temporary) · `CLAUDE.md` **§ Spec taxonomy under `docs/specs/`** · `CLAUDE.md` **§ CodeGraph** (in-repo precedent: a shared guide asserting a resource absent from the checkout is a defect corrected by the factual-claims sweep).
>
> **Remediation Suggestion:** Delete the final sentence, or replace it with a path-free, archive-stable reference. Do **not** substitute the future archive path — the date is unknown at write time, trading a broken link for a guessed one.

Audited clean in the same pass and **not re-opened on attempt 2**: heading integrity (a two-insertion, zero-deletion hunk cannot renumber a heading; §1–§13 verified present, sequential, unduplicated), ADR containment (ADR-001…ADR-009 all `Accepted` and intact, far outside the hunk), scope containment, and both of T-12's Done-when clauses — the Reviewer judged *"it is never read against this table directly"* to be the load-bearing clause that actually forecloses `requirements.md` §8's stated failure mode.

#### Leader adjudication of attempt 1

**The defect is in the Leader's brief, not the Implementer's execution.** `design.md` nowhere asks for a `mapping.md` link; the citation originates solely in my Implementer brief. The Reviewer identified this attribution unprompted and recommended not charging the Implementer a rework round.

**Consequence for the effort dial:** the standing rework rule bumps effort one level on every retry, on the theory that a failed fix is under-thinking. That theory does not hold here — the Implementer executed a faithful instruction that was itself wrong. Attempt 2 therefore stays at `low`, with the correction scoped to one sentence and the four already-clean properties explicitly excluded from re-audit. Recorded because it is a deliberate departure from the default.

#### ADVISORY (4R, non-gating — recorded and closed here, not converted into work)

- **Readability.** The note would bite harder immediately after `trd.md:66` — the *"authoritative for the import service"* sentence it qualifies — rather than after the table 25 lines later, since a reader can form the misconception before the correction arrives. Current placement is defensible (the note is *about* the table).
- **Risk — standing decay class.** Outbound links from `docs/prd.md`, `docs/trd/trd.md`, `docs/ux-ui/design.md`, or `docs/infrastructure.md` into `docs/specs/<active>/` are guaranteed to decay: the target always moves at archival, and **no gate in this repository checks a markdown link**. The Reviewer proposes constitutional documents cite specs by name and domain, never by active path. Carried here for `/akili-archive` to consider as a Kaizen candidate; per the advisory rule it is **not** minted as a task in this spec.

#### Attempt 2 — Reviewer PASS

- **Files changed:** `docs/trd/trd.md` — the final sentence only. Sentences 1–3 byte-identical to attempt 1; still a single 2-insertion, 0-deletion hunk in §3
- **Fix applied:** the path-bearing citation was replaced with a role-based reference — *"A worked example of that mapping step is produced per onboarding as the `mapping.md` of the relevant import-export spec."* No path, so archival relocation cannot break it
- **Verification (Leader-measured, since the Reviewer has no `Bash`):**
  - `git diff --stat -- docs/trd/trd.md` → `1 file changed, 2 insertions(+)`, zero deletions
  - `grep -c 'docs/specs' docs/trd/trd.md` → **0** — the new precedent is not reintroduced; the TRD again holds no spec-path reference. The Reviewer re-ran this itself rather than inherit it, since it was the remediation's load-bearing claim
  - `grep -n '^## '` → headings `1.`…`13.` sequential and unduplicated
- **Scoped re-audit:** items 1–4 (heading integrity, ADR containment, scope containment, Done-when) were excluded by the Reviewer's own attempt-1 recommendation and stand as audited there

**Reviewer verdict: PASS.** *"The single FAIL issue is fully closed — the path-bearing citation is gone, the TRD holds zero `docs/specs` references (verified by me), and archival can no longer break the reference. Sentences 1–2 are byte-identical to the already-audited text, so T-12's Done-when remains satisfied."*

Two questions the Reviewer ruled on rather than waving through:

- **Register.** *"is produced per onboarding"* is habitual/normative, not a claim that a specific file exists in this checkout today — matching §3's existing voice (the adjacent Prisma block is itself labelled *"reference — authoritative shape"*). So it is not the false-existence claim the CodeGraph factual-claims precedent forbids.
- **Overreach.** Naming `mapping.md` in the TRD does not encroach on FR-1: the sentence carries no RFC-2119 MUST, creates no gate, and is correctly generic ("per onboarding", "the relevant import-export spec") so it generalises beyond this client.

#### Requirements covered

`requirements.md` §8 (TRD clarification) — closed by the *"it is never read against this table directly"* clause, which forecloses the stated failure mode (a reader mapping the client's `gpslatitude` spellings onto the canonical schema) rather than merely describing a distinction.

#### Additional ADVISORY from attempt 2 (non-gating, recorded and closed)

- **Resilience — the failure mode improved in kind, not degree.** Attempt 1's defect was a *certain, silent* break that no gate here checks. The replacement's worst case is that a future spec names the artifact something other than `mapping.md`, leaving the sentence mildly stale — a descriptive inaccuracy a reader detects in context, not a pointer that fails closed. Transferable rule: **constitutional documents describe artifacts by role, never by location.**
- **Soft filename coupling.** `mapping.md` is now named in a constitutional document. Not a dependency and needs no action — flagged only so that if a later spec splits the artifact per sheet-group (`design.md` §13 contemplates exactly that), whoever does it knows this sentence exists.

#### Reviewer self-correction (recorded for audit honesty)

The Reviewer's attempt-1 report transcribed §10 and §11 as lines 215 and 225; they are 208 and 215. The underlying measurement was correct and agreed with mine — only two transcribed line numbers were wrong. The gate was heading *numbers* (1–13, sequential, unduplicated), which was and remains correct, so no finding changes.

#### Issues encountered

One, fully attributed above: the Leader's brief instructed a path-bearing citation that violated ADR-009's citation-stability commitment. Cost: one rework round. The Implementer's execution was faithful on both attempts.

---

### T-1 — Add `normalizePhone()` to `common/normalize.ts`

- **Date:** 2026-08-04
- **Status:** ✅ **PASS** on attempt 1 (0 rework rounds)
- **Traces:** FR-5 (all clauses) · `design.md` §4.1, DD-3 · NFR-4, NFR-5, NFR-6, NFR-9
- **Skills:** `tdd` (Leader-assigned per `tasks.md`; kept — a table-driven pure function with expected values fixed by FR-5 is exactly where red→green earns its cost), `systematic-debugging` (available, not needed) · **Effort:** `xhigh`

#### Attempt 1 — Reviewer PASS

- **Files changed:** `backend/src/common/normalize.ts` (+86: `TZ_COUNTRY_CODE`, exported `PhoneNormalizationResult`, `normalizePhone()`, private `normalizeSinglePhone()`), `backend/src/common/normalize.spec.ts` (+134: one `describe` per FR-5 format group). No other file touched — `actor-import.service.ts` correctly left for T-3
- **Signature:** `normalizePhone(raw: string | null | undefined): { phone: string | null; additionalCount: number }`
- **Verification:**
  - `cd backend && npm test -- normalize` → **36 passed, 36 total**, 0 failed
  - `npx eslint "src/common/normalize.ts" "src/common/normalize.spec.ts" --quiet` → clean (non-mutating form; `--fix` not used, per the asymmetry rule)
  - `npm run build` → clean
  - Import graph: `grep -nE '^import' src/common/normalize.ts` → **zero matches**; the file imports nothing, so NFR-5 purity holds by construction
- **TDD sequence (red→green, evidenced):** red on `TS2305: no exported member 'normalizePhone'` → minimal green → remaining FR-5 groups added, which immediately exposed that the first implementation did not split on `/` at all → fixed → green

**Reviewer verdict: PASS.** *"Conforms to FR-5 clause-by-clause — all six measured formats have exact-value table-driven cases, the `/`-cell returns the first number plus a count with the discarded digits structurally absent from the return value, unrecognisable non-empty input returns `null` (never a partial string), and the function is pure with a zero-import graph."* The Reviewer read both files at source and confirmed the diff was complete with no undisclosed change.

**Disqualifier clauses checked explicitly (all clear):**

| T-1 disqualifier | Finding |
|---|---|
| Existence / non-null assertions instead of exact strings (KZ-002) | **Not triggered.** Every assertion is a whole-object `toEqual` on an exact string. No `toBeDefined`, no `not.toBeNull` anywhere in the block. The `not.toContain('700000007')` case is *supplementary* to an exact-value assertion in the same group, not a substitute |
| A real workbook phone number in a fixture (NFR-9) | **Clear.** Every fixture is in the synthetic `700000001`…`700000009` family, with an explicit no-real-numbers note in the block header |
| A FR-5 format with no case (<6 groups) | **Clear.** Six format groups + null branch + determinism, enumerated by line number in the audit |

**Cross-check the Reviewer performed unprompted:** the measured source's multi-number example (`proposal.md` B-3) is two *leading-zero* numbers, while the test uses bare-9 forms on both sides. Behaviorally equivalent — both sides route through `normalizeSinglePhone` and the leading-zero branch is independently covered.

#### NFR-9 grep gate — Leader observation, not a T-1 defect

I ran the `requirements.md` §9 D-7 gate myself: it returns **43 hits repo-wide**, all synthetic (`+255700000000` in many files, plus `+255711111111` and `+255799999999`). **`requirements.md` §9 D-7's own description of its gate — that it "returns nothing once the *three* `+2557000000*`-style test fixtures are excluded" — was therefore already inaccurate before this task ran.** T-1's fixtures join that same pre-existing synthetic family and introduce nothing traceable to the workbook, so NFR-9's substance holds.

Recorded as an inaccuracy in the requirement's gate description, owned by the Leader. It is **not** minted as a task in this spec (advisory rule) and it does not block: the gate's *purpose* — no real PII committed — is verifiably met. Flagged for the user at the gate and for `/akili-archive`'s factual-claims sweep.

#### ADVISORY (4R, non-gating — recorded; A2 carries forward into T-3's brief, which is scope T-3 already owns)

- **A1 (risk) — the bare-9 branch accepts any 9 digits.** `normalizePhone('123456789')` returns `+255123456789`. Real TZ mobiles begin 6 or 7; landlines 2. The Reviewer declined to FAIL because FR-5's clause forbids inventing a country code "for a number **whose length** does not match a known Tanzanian pattern" — the operative property as written is *length*, and the implementation gates on exactly length. FAILing would have meant citing text that does not exist. **The risk is workbook-specific, not theoretical:** this spec already records column-shifted rows (FR-4 — 4 `Offtaker_Groundnuts` rows carry a phone in the trader-type column), so a 9-digit non-phone numeric landing in the phone column becomes a plausible-looking `+255…` instead of a `null` + warning that would surface it for repair. Reviewer's options, in its preference order: (a) constrain the bare-9 branch to `^[67]\d{8}$`, leaving landlines to the leading-zero branch; (b) keep the breadth but add a *documenting* test so it is a recorded decision rather than an untested consequence. **Escalated to the user at the approval gate** — tightening FR-5's reading is a spec decision, not a Reviewer-forced edit or a Leader-minted task.
- **A2 (reliability) — binds T-3, and will be copied into its brief.** `additionalCount` counts *segments*, not validated numbers: `'700000006/garbage'` → count 1, and `'garbage/700000007'` → `{phone: null, additionalCount: 1}`. This satisfies `design.md` §4.1's *positional* definition of the count, which is the property FR-5's "naming the discarded value's position" actually needs. Two consequences T-3 must honor: **`{phone: null, additionalCount ≥ 1}` is reachable**, so T-3 must emit *both* the null-branch warning and the multi-number warning for one cell and must never assume `phone !== null` whenever `additionalCount > 0`; and empty segments are filtered *before* counting (`'a//b'` → 1), so "positions 2…n+1" is an invariant over non-empty segments. Wording the warning as *"an additional value was present at position N and was not stored"* stays true in every case while carrying no digits.
- **A3 (readability).** `normalizeSinglePhone` builds two `RegExp` objects per call via `new RegExp(...)`, whereas this file hoists lookups to module load (`REGION_BY_LOWER`, `TRADER_TYPE_BY_LOWER`). At ~1,300 rows the runtime cost is irrelevant; the style inconsistency and the double-escaped `\\+${TZ_COUNTRY_CODE}\\d{9}` are the real cost. The first two branches also differ only by an optional `+`.
- **A4 (evidence accuracy).** The Implementer reported a baseline of 24 tests; it was **23** (23 existing `it(` blocks + 13 new = 36, matching the reported "36 passed, 36 total" exactly). The final figure and the "existing tests untouched" claim both hold, so nothing was hidden — recorded only because **a wrong baseline is the mechanism by which a silently-deleted test would hide**, and that mechanism deserves to be named even when it did not fire.

#### Amendment A1 — user-approved tightening of the bare-9 branch (in flight)

At the gated approval pause the user reviewed ADVISORY A1 and chose the Reviewer's **option (a)**: constrain the bare-9-digit branch to the real Tanzanian mobile prefixes `^[67]\d{8}$`, leaving landlines to the existing leading-zero branch.

This is an **approved scope amendment, not a rework**: T-1 passed review against FR-5 as written, and the Reviewer explicitly declined to FAIL because FR-5's clause turns on *length*. Effort is therefore `medium` (a small, well-specified regex + test change) rather than a bump — the rework escalation rule applies to failed fixes, and nothing failed here.

**Status handling.** `tasks.md` T-1 is moved back to `[~]` for the duration, even though it holds a genuine Reviewer PASS. Rationale: the two writes (`tasks.md`, code) are not atomic, and a `[x]` sitting over half-amended code is the unfalsifiable-completion state this methodology exists to prevent. `[~]` plus this paragraph is recoverable; the reverse is not. It returns to `[x]` on the amendment's PASS.

**Amendment outcome: ✅ PASS** (Reviewer, scoped delta audit; prior T-1 PASS stands for the remainder).

- **Files changed:** `backend/src/common/normalize.ts` (bare-9 branch `/^\d{9}$/` → `/^[67]\d{8}$/`, with the durable rationale in the code comment rather than only in this log), `backend/src/common/normalize.spec.ts` (+2 cases inside the existing bare-9 `describe`: a `6…` positive and an `812345678` → `{phone: null, additionalCount: 0}` negative)
- **Verification:** `npm test -- --silent normalize` → **38 passed, 38 total** (36 + 2) · `npx eslint … --quiet` → exit 0, non-mutating form · `npm run build` → clean
- **Reviewer confirmed at source** that `normalize.ts:360` and `normalize.spec.ts:214-236` match the diff exactly, with 38 `it(` blocks matching the reported count and no other code change
- **Landline clause re-verified by hand:** the leading-zero branch is byte-identical, so `'022 700 0005'` → `0227000005` → `slice(1)` → **`+255227000005`** is unaffected. Branch order still resolves the three earlier branches first, so no country-prefixed or leading-zero value is touched by the narrower fourth
- **`^[67]\d{8}$` preserves the length semantics** (1 prefix + 8 = 9 digits); only the leading digit is constrained, so FR-5's length-based clause is not contradicted

**NFR-3 — the edited test title, ruled on explicitly rather than waved through.** The Implementer retitled `'prepends +255 to a bare 9-digit number'` → `'…starting with 7'`, body byte-identical. Reviewer verdict: **acceptable clarification, not a violation**, on two independent grounds. Substantively, NFR-3's clause exists to catch a contract change masked by a weakened assertion; the assertion here is byte-for-byte unchanged, so the set of implementations it rejects is exactly what it rejected before — nothing was accommodated. Formally, `tasks.md` §Coverage-closure assigns NFR-3's test-edit clause to T-3/T-4/T-5/T-6, and T-1's own disqualifier list contains no test-edit clause. Additional note for the record: leaving the title alone would have produced a case titled *"prepends +255 to a bare 9-digit number"* sitting beside one asserting a bare 9-digit number returns `null` — the rename removes a real inconsistency rather than creating one.

**NFR-9 on the new fixtures:** met. `612345678` / `812345678` are ascending digit runs, obviously synthetic, and `812345678` is not a valid TZ prefix at all. D-7 bookkeeping: `612345678` and `+255612345678` **do** match the D-7 pattern (`[67][0-9]{8}`), so the repo-wide count rises from 43 by ~3; `812345678` does not match (leading `8`). All synthetic.

#### Residual asymmetry after A1 — ADVISORY, escalated to the user, NOT expanded unilaterally

Both country-prefixed branches still accept `^\+?255\d{9}$`, so `255012345678` → `+255012345678`. Reviewer agrees with the Implementer that this is **not a defect** — FR-5's `BUT NOT` clause constrains *length*, and 255 + 9 digits matches a known TZ length; the branch is also unchanged by this delta and already carried a PASS at `3f1b533`. There is no `Violated Rule` to cite.

**Two corrections the Reviewer made to the Implementer's framing, both material to the user's decision:**

1. **The fix is *not* a symmetric copy of A1.** Tightening to `^\+?255[67]\d{8}$` would reject a country-prefixed **landline** (`255 22 700 0005` → `255227000005`, leading digit `2`) — a plausible source value. The consistent rule after a country code is "mobile **or** landline" (roughly `^\+?255(?:[67]\d{8}|2\d{8})$`), not just `[67]`. A1 was a *deduction* (absent the trunk `0`, a bare 9-digit can only be mobile); this is a *preference*, which is why it needs the user rather than an inline edit.
2. **One sub-case is indefensible under any reading and is the cheap offer:** a leading `0` after the country code (`255` + `0…` → `+2550…`). The national trunk `0` and a country code are mutually exclusive in E.164, so no valid TZ number has that shape and rejecting it costs no measured format. `^\+?255[1-9]\d{8}$` closes it while leaving the mobile-vs-landline question open.

#### ADVISORY from the amendment round

- **B1 (accuracy of a committed claim) — being fixed, see A1b below.** The block header at `normalize.spec.ts:208-210` still claims *"All fixture numbers are synthetic (`+2557000000*` shape, NFR-9)"*. The two new fixtures are not of that shape, so the comment now misdescribes the file **in exactly the place a future reader checks the PII rule**.
- **B2 (behavior narrowing worth recording — safe direction, but real).** The mechanism producing bare 9-digit values in this workbook is Excel dropping a leading zero from a numeric cell, and that mechanism applies to **landlines** too: `022 700 0005` stored as a number becomes `227000005`, which the old branch accepted as `+255227000005` and the new one **quarantines**. This is the *safe* direction (null + warning + a created row, recoverable by the AT team per FR-5's null branch) and not an FR-5 violation, since the measured landline format retains its leading zero. But it is a narrowing beyond the mobile/column-shift rationale in the code comment. **Recorded here so it is a decision and not a surprise mid-run:** if the onboarding surfaces a batch of `2XXXXXXXX` quarantines, adding `^2\d{8}$` is the documented one-line amendment.

#### Amendment A1b — B1 comment accuracy (landed with T-2)

B1 is an inaccuracy **introduced by A1 itself**: the new fixtures outgrew the shape the block comment pins. Fixing it is completing A1, not improving something A1 found. It is one comment line in `normalize.spec.ts`, which is also one of the two files **T-2 already edits** — so rather than spend a second full Implementer round on a single line, it is dispatched inside T-2's Implementer brief, explicitly labeled as a T-1 amendment and audited as a separate item. The Leader does not write it (the no-code rule stands; a runtime failure or an advisory does not waive it).

**Rationale recorded for future readers:** the accepted-breadth risk was not theoretical. This spec's own FR-4 documents 4 `Offtaker_Groundnuts` rows carrying a phone number in the trader-type column, so a column-shifted 9-digit ID or capacity value would have normalized into a syntactically valid `+255…` — a wrong value that every gate accepts, which is precisely the defect class `requirements.md` §9 D-6 names as ungated. Quarantining it instead aligns the function with the "never guess" contract the rest of `normalize.ts` follows.

---

### T-2 — Add `DISTRICT_TO_REGION` to `common/normalize.ts`

- **Date:** 2026-08-04
- **Status:** ✅ **PASS** on attempt 1 (0 rework rounds) — **both** lenses
- **Traces:** FR-3 · `design.md` §4.2, DD-1 · NFR-4
- **Skills:** none beyond repo conventions (concurred with `tasks.md`: the difficulty is judgment about Tanzanian administrative geography, which no skill supplies) · **Effort:** `xhigh`
- **Review mode: parallel lens reviewers**, not the default checklist. Justification: T-2's dominant defect class (**D-1b**, a district mapped to the *wrong* region) has **no automated gate** — both code assertions pass on a wrong pairing, because a wrong region is still a *valid* region. An independent second model is the only substitute available short of the human gate, so one reviewer took spec conformance (the PASS/FAIL gate) and one took nothing but the factual correctness of the 28 pairings

#### Files changed & verification

- `backend/src/common/normalize.ts` — `DISTRICT_TO_REGION` as a `Map<string, CanonicalRegion>`, 28 entries, alphabetically ordered, placed immediately after `normalizeRegion`
- `backend/src/common/normalize.spec.ts` — membership test + a regression pin that `normalizeRegion('Arusha/Dodoma')` still quarantines; also applied **T-1 amendment A1b** (the `normalizePhone` header comment no longer pins the outgrown `+2557000000*` fixture shape)
- `npm test -- normalize` → **40/40** (38 → 40; exactly the 2 new blocks) · `npx eslint … --quiet` → clean · `npm run build` → clean · `git status --short` → only the two intended files (Leader-confirmed)
- Workbook read **in place** at its location outside the repo; measurement script confined to the session scratchpad. **No workbook or extract entered the repository**

#### The measured-count discrepancy — the main event

The Implementer measured **38 distinct / 10 contaminated / 28 real** against the design's **40 / 11 / 29**, and **reported the gap instead of forcing agreement**. Its operative definition: *distinct values in the district position of rows whose region is **blank***, across `Offtaker_Sorghum` (6 blank-region rows), `Offtaker_Groundnuts` (150 — no `Region` column at all), and `Bulk buyers_beans` (4 rows with own-row region blank and district present). QDS measured as contributing **zero** (all 26 `cbo` rows already carry `region_name`); `Seed Company` excluded by DD-11.

**Conformance reviewer's ruling — the narrower definition is the *functionally correct* one.** FR-3's only derivation licence is scoped exactly that narrowly: the OFG criterion ("which has **no `Region` column**") and the district-rescue scenario ("`Region_name` **blank** AND `District` = a district present in the lookup table"). **No clause licenses district-rescuing a row whose Region cell holds an ambiguous value** — the opposite is mandated, since FR-3 requires the 4 ambiguous `Humantarian` locations to quarantine "matching `normalizeRegion`'s existing refusal to resolve `Arusha/Dodoma`", and both `BUT NOT` clauses forbid substituting anything for an unresolved value. So a district appearing *only* on ambiguous-region rows must not be derivable; including it would widen the table into the guess FR-3 twice forbids. `design.md` §4.2's unqualified "40 distinct values appear in the district position" is a **sizing sentence, not an acceptance criterion**.

**Independent corroboration the reviewer produced without re-reading the workbook** — this is what moved the measurement from "plausible" to "verified": OFS 6 = §3.1's "`Region` blank on 6" ✓ · OFG 150 = §3.1's row count with no Region column ✓ · **BBB 4 = §3.1's "only 14 of 26 have a resolvable region" (⇒ 12 region-less) minus FR-3's "8 of 26 with neither a region nor a district" = exactly 4 with a district but no region** ✓. That last is an exact match across two independent spec figures which the Implementer could not have back-fitted from any single number.

**Classification: a recordable measurement correction, NOT a Pivot.** The approach, DD-1's decision (option c), the artifact shape, and every FR clause survive intact; only a size estimate moves. In-spec precedent is direct — `requirements.md` §3.1's own "Count correction (during Phase 2)" moved QDS 42 → ~23 and the total 825 → 806 while the decision it supported stood, and §3.1's preamble states "Where measurement contradicted `proposal.md`, measurement wins". `tasks.md` line 247 ("Inconclusive is a legitimate outcome… report the spread instead of committing a number") points the same way.

**28 entries does not violate the Done-when clause** *"the map has exactly the districts `mapping.md` will publish"*: that is a **forward** consistency clause, and T-7 publishes **from** this constant with the doc↔constant test as its gate — so consistency holds by construction at 28 exactly as at 29. No FR states 29, 40, or 11; those figures live only in `design.md` and `tasks.md` prose.

#### Geography lens — all 28 pairings CORRECT, with honest confidence grading

Independent verdict: **zero WRONG, zero UNCERTAIN, nothing to omit.** Both flagged traps confirmed independently — `mbozi → Songwe` and `momba → Songwe` — on the basis that **Songwe Region (2016) comprises Mbozi + Momba + Ileje + Songwe DC + Tunduma TC, all carved from Mbeya**, with Mbozi holding the regional HQ (Vwawa). "Mbeya" is the stale pre-2016 answer for both.

**An adversarial check it added unasked, and the strongest one available:** whether any key is a **district name that exists in two regions**, which would make a single stored answer wrong for some rows. It checked all 28 and found **none unique-name violations**. That materially raises confidence, because it means no pairing can be wrong-*by-ambiguity* — only wrong-by-recall.

Also ruled explicitly, as asked: `kahama → Shinyanga` (was in neither the Simiyu nor the Geita 2012 transfer group), `kishapu → Shinyanga` (borders Simiyu but was not transferred), `mlele`/`mpanda → Katavi` (Rukwa retained Sumbawanga, Nkasi, Kalambo), `bariadi → Simiyu` (its regional capital), `nanyumbu → Mtwara` (split from Masasi, so it inherits Mtwara despite bordering Ruvuma), `kakonko`/`uvinza → Kigoma` (both 2012 intra-Kigoma splits), `temeke → Dar es Salaam` (a DSM municipality), and all four `…town`/`…city` variants sharing their parent's region.

**The limitation it stated rather than hid, and which the PASS does not erase:** *every* ruling rests on **recall**, because it confirmed there is **no authoritative Tanzanian administrative list anywhere in this repository** — no gazetteer, no fixture, no reference doc — and `mapping.md` does not exist yet. It explicitly declined to claim the review discharges `requirements.md` §9 **substitute 4**: *"My contribution is that an independent model, reasoning separately, reached the same 28 answers as the author and found no collision-ambiguity; that is corroboration, not authority."*

It graded where the human gate should spend attention: **highest residual risk on the six districts whose correctness rests on a 2012–2016 administrative event reasoned from parent-district provenance rather than direct recall — `momba`, `mlele`, `kakonko`, `uvinza`, `kishapu`, `nanyumbu`** — to be checked against TAMISEMI / PO-RALG council lists or NBS regional profiles. **Substitute 4 remains OWED, narrowed not discharged.**

#### Requirements covered

FR-3's derivation-table clause and the `DISTRICT_TO_REGION` half of "quarantined where not" (the district-rescue *scenario* itself is T-11's). NFR-4 (single source of truth — the reviewer grepped `backend/src` for any competing district→region list and found none), NFR-5 (purity — `normalize.ts` still has **zero** import statements), NFR-9, NFR-3 (one new export; no existing export, signature, or assertion altered).

**Explicitly NOT covered, with a named owner:** `design.md` §4.2's **second** assertion (doc↔constant agreement) belongs to **T-7**, named there in three places — Scope, Files, and Done-when — with the `T-2→T-7` dependency edge existing precisely so the constant lands first. The reviewer confirmed this is a correct deferral and not a KZ-001 gap: the clause has a named owner, file, and gate one task downstream, and is not discharged by substituting a different satisfied requirement. The deferral is also *forced* — an entry-for-entry assertion against a document that does not exist cannot be written, and a placeholder would be KZ-002 in reverse.

#### ADVISORY (4R, non-gating — recorded and closed here; none is minted as a task or used to widen one)

- **A-1 — the real loose thread, and it is not the count.** `design.md` **DD-1** states "**162 rows across 5 sheets**" need region derived from district. The measurement accounts for **160 rows across 3 contributing sheets**. The 2-row residual is numerically identical to the 2 missing distinct values (1 contaminated, 1 real), suggesting the design's 40 counted one district-position value from each of two sheets outside the blank-region scan. One is explained (`Offtaker_Sorghum` row 111 — a person name in the district column on a row whose Region cell holds an ambiguous multi-region value, so it quarantines through the existing path regardless). The second is unexplained; the reviewer's candidate is **`Humantarian`**, the only sheet with location data covered by neither DD-11 nor a blank-region scan. **Deliberately not a FAIL, because the omission direction is the safe one:** an absent district produces a quarantine on `region` — which FR-3 explicitly prefers to a derivation — and surfaces as a visible line item in T-10's `reconciliation.md`. **Under-coverage cannot produce a D-1b defect; over-coverage can.** `Humantarian`'s columns belong to **T-8**, so the question is recorded for T-8's measurement rather than folded into T-7.
- **A-2 — small doc regression from A1b.** The removed text named the sanctioned synthetic fixture shape in-file, and `requirements.md` §9 D-7 defines its gate as clean "once the three `+2557000000*`-style fixtures are excluded". Gate behavior is unchanged, but the file no longer documents which prefix that exclusion refers to. Recorded only; **not** folded into a later task's scope.
- **A-3 — the vacuity guard is the weakest useful form.** `expect(DISTRICT_TO_REGION.size).toBeGreaterThan(0)` is correctly a *vacuity guard*, not a KZ-002 presence-assertion (a `for…of` over an empty Map passes with zero assertions executed, so without it the membership test is unfalsifiable). But `toBe(28)` would also catch a **duplicate key in the Map literal** — `new Map([...])` resolves duplicates last-wins with no error, so exact size is the only assertion that can see a collision. T-7's entry-for-entry doc↔constant assertion subsumes this.
- **A-4 — the ambiguous-quarantine test is a regression pin, not new evidence.** It was green before this change. T-2's Done-when demands it explicitly and the inline comment says so; recorded so it is never later miscounted as coverage.
- **A-5 —** the doc comment forward-references `mapping.md`, which does not exist until T-7. Intended and harmless, but `normalize.ts` carries a dangling doc pointer until T-7 lands. **Note the contrast with T-12's FAIL:** that was a *path* citation in a constitutional document; this is a filename reference in a spec-scoped source comment, and the Reviewer did not treat it as the same class.
- **A-6 (geography lens) — a disputed date inside the comment that justifies the riskiest pairing.** The code comments Momba as "est. 2015"; the geography reviewer's recall says 2012 (with Mlele, Kakonko, Uvinza). **The pairing is unaffected either way** — any creation before 2016 lands it in Songwe via Mbozi. Neither agent can substantiate a date from this repository. Per `tasks.md` line 247, the honest resolution is to drop the unverifiable year and keep the substantive chain (carved from Mbozi → travelled into Songwe in 2016) rather than assert a contested number; escalated to the user rather than silently changed, since it is a factual claim in committed code.
- **A-7 (conformance lens) — a specific, named hazard for T-7.** If T-7 publishes display-cased district names (`Kahama Town`) while the constant holds `kahama town`, the doc↔constant test must fold case — *and case-folding is exactly where an implementer reaches for a loose match that then passes on a genuine mismatch*, defeating the assertion `design.md` §4.2 calls "what makes §1's no-drift claim true rather than aspirational". Recommendation for T-7's brief: publish the **verbatim lower-cased key** in its own column (also more honest — these are measured *source strings*, not canonical district names), with any display casing in a separate column excluded from the assertion. This is a **framing instruction for a gate T-7 already owns**, not added scope.


#### Requirements covered

FR-5 — all six measured formats, the multi-number first-plus-count behavior, and the never-guess `null` return. **Not** FR-5's `null`-branch *import* behavior (row created, `phone` null, warning) — that is T-3, correctly out of scope here. NFR-4 (`TZ_COUNTRY_CODE` in `normalize.ts`, no duplicated pattern), NFR-5 (zero-import purity), NFR-6 (determinism asserted), NFR-9 (synthetic fixtures only), NFR-3 (purely additive — no existing export, signature, or test altered).

---

### Amendment A2 (T-1) + A-6 closure — country-prefix trunk-0, and the disputed date

- **Date:** 2026-08-04
- **Status:** ✅ **PASS** · **Effort:** `medium` (two well-specified deltas, neither a rework — nothing failed)
- **Traces:** FR-5 (`BUT NOT` invent a country code) · T-1 §"Residual asymmetry after A1" · T-2 ADVISORY **A-6**
- **Executed inline by the Leader** rather than through an Implementer → Reviewer loop. Recorded plainly because it is a **deviation from the `/akili-execute` persona rule**: the session operates under a standing instruction not to spawn subagents unless the user asks. Both deltas are user-approved decisions with the rationale already written by the prior Reviewer rounds, so no new design judgment was exercised here — but the independent second reader is genuinely absent, and this entry should be read with that discount rather than as a two-model PASS.

#### Delta 1 — A2, the trunk-0 sub-case (`normalize.ts`)

The user chose the Reviewer's **cheap offer** from T-1's residual-asymmetry advisory, not the symmetric copy of A1. Both country-prefixed branches move from `^\+?255\d{9}$` to `^\+?255[1-9]\d{8}$`.

- **What this rejects:** `+2550…` / `2550…` only. A national trunk `0` and a country code are mutually exclusive in E.164, so this shape has no valid reading — it is a national number with `255` pasted in front and the trunk `0` never dropped. Normalizing it yields a number one digit off from the intended subscriber, which no downstream gate can see.
- **What this deliberately does NOT do:** constrain mobile-vs-landline. That question stays open for real data, exactly as the Reviewer framed it — `^\+?255[67]\d{8}$` would have rejected a country-prefixed **landline**, a plausible source value.
- **Length semantics preserved:** `[1-9]` + 8 = 9 digits, so FR-5's length-based clause is not contradicted; only the first subscriber digit is constrained.

#### Delta 2 — A-6, the disputed date (`normalize.ts`)

`est. 2015` removed from the Momba comment. Two reviews disagreed (2015 vs 2012) and neither could substantiate a source from this repository; the pairing does not depend on the year, since any creation before 2016 routes Momba into Songwe via Mbozi. The substantive reasoning chain (carved from Mbozi → travelled into Songwe in the 2016 split) is kept, and the comment now states **why** the year is absent so a future reader does not helpfully restore it. **A-6 is closed.**

#### Verification

- `npm test -- normalize --silent` → **42 passed, 42 total** (38 + 4 new)
- `npm test -- --silent` (full backend) → **466 passed, 37 suites**, 0 failed — run because `normalize.ts` is consumed repo-wide and this delta narrows a shipped branch
- `npx eslint "{src,test}/**/*.ts" --quiet` → exit 0 (non-mutating form)
- No existing test edited (NFR-3) — the 4 new cases are additive inside the existing country-prefixed `describe`

#### Tests added, and the one that exists to catch over-tightening

| Case | Asserts |
|---|---|
| `+255012345678` → `null` | plus-prefixed trunk-0 quarantines |
| `255012345678` → `null` | bare-prefixed trunk-0 quarantines |
| `(255) 012345678` → `null` | the de-parenthesized path routes through the same constraint |
| `255 22 700 0005` → `+255227000005` | **a country-prefixed landline still normalizes** |

The fourth is the load-bearing one. Without it a future edit to `[67]` would pass every other assertion in the block while silently quarantining landlines — the precise over-tightening the Reviewer warned against. All fixtures synthetic (NFR-9).

#### Interaction with B2, checked rather than assumed

T-1 ADVISORY **B2** records that Excel dropping a leading zero turns a landline into a bare `2XXXXXXXX`, which A1 already quarantines. A2 does **not** widen that: it touches only the two *country-prefixed* branches, and the bare-9 and leading-zero branches are byte-identical. B2's documented one-line remedy (`^2\d{8}$`) remains available and remains unexercised.

#### Requirements covered

FR-5's `BUT NOT`-invent-a-country-code clause, tightened one sub-case. NFR-3 (additive), NFR-4, NFR-5 (zero-import purity intact), NFR-6, NFR-9.

---

### T-3 — Wire phone normalization into the import row pipeline

- **Date:** 2026-08-04
- **Status:** ✅ **PASS** on attempt 1 (0 rework rounds), with **one user-approved edit to an existing test** — see the NFR-3 section below, which is the part of this entry that most deserves scrutiny
- **Traces:** FR-5 (`null` branch, no-silent-loss, no-PII-in-warning, no-second-field) · `design.md` §4.1, DD-3, §10.1 **F-1**
- **Skills:** `nestjs-expert`, `error-handling-patterns` (both applied as repo convention rather than loaded — the change adds no Nest construct, no DI, and no new error path; it pushes onto the warning array `resolveGps` already uses) · `tdd` **not followed in its red→green form** — see "TDD deviation" below · **Effort:** `medium`
- **Ran alone**, as `tasks.md` requires: T-3, T-4, and T-6 all edit `actor-import.service.ts`
- **Executed inline by the Leader**, same standing no-subagent instruction recorded under Amendment A2. **No independent Reviewer read this diff.** The mutation testing below exists specifically to substitute *some* adversarial pressure for the missing second model; it is not equivalent, and this entry should be discounted accordingly.

#### This task NARROWS shipped behavior (F-1) — stated plainly, not as an additive change

Before T-3, `actor-import.service.ts:531` stored the Phone cell verbatim: `phone: cells.phone || undefined`. After T-3, a value `normalizePhone()` does not recognise stores as **`null` plus a warning**. A caller who previously imported a non-Tanzanian number kept the digits and now loses them from the `phone` column. This is `design.md` §10.1 **F-1**, deliberate and desirable — and it is a **removal**, not an addition. Describing it as purely additive would be false.

#### Files changed

| File | Change |
|---|---|
| `actor-import.service.ts` | `normalizePhone` import; two warning constants (one fixed string, one count-parameterized builder); a phone-resolution block in `validateRow`; `phone: cells.phone \|\| undefined` → `phone`; `ActorScalarData.phone` widened `string?` → `string \| null \| undefined` |
| `actor-import.service.spec.ts` | +9 cases in a new `phone normalization (FR-5, T-3)` describe. **No existing case touched** |
| `admin-actor-import.e2e.spec.ts` | **One existing fixture constant changed** — the subject of the next section |

`ActorScalarData` is module-private (3 references, all in this file), so widening it changes no exported contract. `buildCreateData` drops `undefined` but **keeps `null`**, which is what makes the column write NULL rather than fall to a default — the behavior FR-5 asks for, and the reason `null` rather than `undefined` is the right value to assign.

#### NFR-3 — an existing test WAS edited. Escalated to the user, approved, and recorded here in full

`tasks.md` T-3 disqualifies evidence if "an existing test was edited to accommodate the change". One was. **I stopped and escalated rather than edit it**, and the user chose the resolution.

**What broke.** `admin-actor-import.e2e.spec.ts` asserted `totals.warnings === 1`; it became 2. Verbatim:

```
● Admin actor import e2e › Commit lifecycle with a mixed fixture (FR-4..FR-8, FR-11)
  › creates valid rows with crops + IMPORT audit, skips/fails the rest, and never echoes PII
    - "warnings": 1,
    + "warnings": 2,
      at Object.<anonymous> (src/test/admin-actor-import.e2e.spec.ts:668:31)
Test Suites: 1 failed, 36 passed, 37 total · Tests: 1 failed, 465 passed, 466 total
```

**Why it broke — a fixture premise, not a contract.** `IMPORT_PII_PHONE` was `'+255-000-IMPORTLEAK'`: a greppable **sentinel string**, not a phone number. It exists so that a PII leak into a report body is unmistakable. Under FR-5 it is now correctly unnormalizable, so the row gains a second warning and `phone` clears.

**The trap, which is why this could not be a routine assertion update.** The same test does `expect(bodyText).not.toContain(IMPORT_PII_PHONE)` and `expect(detail.body.phone).toBe(IMPORT_PII_PHONE)`. Had I simply updated the expectations to `warnings: 2` / `phone: null`, the leak assertion would have become **trivially true** — no phone is stored, so no phone can leak. The PII canary would have stayed green while testing nothing. That is KZ-002 in its most dangerous form: not a weak assertion added, but a strong one silently hollowed out.

**Resolution chosen by the user: repair the fixture, not the assertions.** `IMPORT_PII_PHONE` → `'+255700123456'` — valid, already canonical (so it round-trips unchanged), and its digits appear nowhere else in `src/` (grepped) so greppability survives. **Every assertion in that test is byte-identical to before**, including both PII assertions, and `warnings` stays 1. The set of implementations the test rejects is unchanged; only the fixture's premise was repaired. A comment at the constant records why it must stay a valid number, so a future reader does not "simplify" it back into a sentinel.

The two alternatives were put to the user and declined: accepting the narrowing in the assertions (the hollowing-out above), and additionally seeding an eighth unnormalizable-phone row into `mixedRows()` (more coverage, but it shifts every row-count assertion in a shared fixture — cost not worth it while the unit suite covers the same behavior).

#### TDD deviation — recorded because the skill was assigned and not followed as written

`tasks.md` assigns `tdd`. All 9 new cases passed on their first execution: the implementation was written first. Rather than claim a red→green cycle that did not happen, I substituted **mutation testing** — reverting parts of the implementation and checking the tests actually go red. Two mutations:

| Mutation | Effect |
|---|---|
| **M1** — revert the create payload to `phone: cells.phone \|\| undefined`, keep warnings | **5 of 9 red** |
| **M2** — remove both `warnings.push(...)` calls, keep the payload | **4 of 9 red** |

**7 of 9 cases are killed by at least one mutation.** The remaining three, named rather than glossed:

- *"puts no digit of the discarded numbers anywhere in the report"* and *"writes no second number into any other Actor field"* — **negative assertions, unkillable by construction.** Removing the feature also removes the leak vector, so they pass on an empty implementation. They are supplementary guards against a *future* regression that starts echoing values, not evidence that T-3 works.
- *"leaves an empty Phone cell absent and unwarned"* — a **deliberate regression pin** (it was green before this change), labeled as such in its own comment so it is never later miscounted as coverage.

Mutation testing is weaker than an independent reviewer and weaker than genuine red→green. It is what was available.

#### Verification

- `npm test -- actor-import.service --silent` → **45 passed, 45 total** (36 + 9)
- `npm test -- --silent` (full backend) → **475 passed, 37 suites**, 0 failed
- `npx eslint "{src,test}/**/*.ts" --quiet` → exit 0 (non-mutating form; `npm run lint` deliberately not used — it runs `--fix` and mutates the diff under review)
- `npm run build` → exit 0

#### Done-when, clause by clause

| Clause | Evidence |
|---|---|
| Non-empty unnormalizable cell → **created** row, `phone === null`, warning | `expect(created).toHaveProperty('phone')` + `toBeNull()` + `outcome === 'created'`. The `toHaveProperty` is load-bearing: it distinguishes an explicit `null` from a dropped key |
| `/`-separated cell → first number + warning | `'700000006/700000007'` → `+255700000006`, exact warning string asserted |
| No warning text contains any digit from the input | Report JSON greppped for both discarded numbers |
| Existing import tests green **without edits** | True for `actor-import.service.spec.ts`. **False for the e2e fixture** — see the NFR-3 section |

#### Disqualifier clauses checked explicitly

| T-3 disqualifier | Finding |
|---|---|
| Row *failed* instead of created | **Clear.** No `errors.push` on the phone path; the row stays a create candidate. Asserted in three cases |
| Raw string stored as fallback | **Clear.** Asserted directly, plus a case confirming a mixed free-text cell leaves no trace in the report |
| Warning embeds discarded digits | **Clear.** The builder takes a `number` count and can only emit positions; `normalizePhone` never returns the values, so there is nothing to embed |
| Existing test edited | **TRIGGERED and disclosed above.** User-approved, with no assertion weakened |
| Change described as purely additive | **Clear.** F-1 stated at the top of this entry and in the spec file's own block comment |

#### Interaction with T-1 advisory A2, verified not assumed

A2 warned that `additionalCount` counts **segments**, so `{ phone: null, additionalCount ≥ 1 }` is reachable and the pipeline must never assume `phone !== null` when the count is > 0. The implementation uses two **independent** `if`s, not `if/else`. Covered by *"raises BOTH warnings when the first segment is unusable and later ones exist"* (`'n/a/700000007'` → 3 segments, first unusable), which M1 and M2 both kill.

#### Requirements covered

FR-5's `null`-branch import behavior (row created, `phone` null, warning), the multi-number warning, no-PII-in-warning, and no-second-field. NFR-3 (additive in `actor-import.service.ts`; one approved fixture repair elsewhere), NFR-6 (the warning builder is a pure function of the count).

**NOT covered here:** FR-5's at-scale behavior on the real workbook — this suite mocks Prisma. That belongs to T-11's fixture run and the T-9 operator check.

---

### T-7 — HALTED BEFORE START: the source workbook is not reachable

- **Date:** 2026-08-04
- **Status:** ⛔ **BLOCKED on an input** — not started, nothing written. `tasks.md` T-7 stays `[ ]`
- **Escalated to the user**, who owns supplying the workbook

T-7 was selected as the next task (deps `T-2` satisfied, and it is the deliverable most likely to overrun the §13 budget). It cannot be authored.

**What is missing.** `mapping.md` requires *complete* per-column dispositions for `Offtaker_Beans` (16 columns), `Offtaker_Sorghum` (13), and `Offtaker_Groundnuts` (13). The source workbook is **not in this repository** — `find . -iname "*.xlsx"` outside `node_modules` returns only the generated canonical template (`frontend/public/templates/`, `frontend/out/templates/`). And **no complete column inventory was ever recorded in the spec.** What exists is reconnaissance fragments:

| Source | What it records | Coverage |
|---|---|---|
| `proposal.md:31` | `Offtaker_Beans`: `Trader_id`, `gpslatitude`, `Trader/processor type` | 3 of 16 |
| `proposal.md:32` | `Offtaker_Sorghum`: 4 named present, 4 named **absent** | partial, of 13 |
| `proposal.md:33` | `Offtaker_Groundnuts`: `District`, `Town`, `Need for Tecncal support`, `Capacity (volume)` | 4 of 13 |
| `requirements.md` §3.1 | Header rows, physical row counts, anomalies | **no column names at all** |

**Why proceeding would be worse than stopping.** Authoring the document means inventing roughly 30 column names. FR-1's only automated gate (`requirements.md` §9 **D-5**) is **arithmetic** — dispositions must sum to the measured column count — and 16 fabricated names sum to 16. The gate goes green on fabrication. This is T-7's own disqualifier ("arithmetic closure is not mapping correctness", D-6) in its worst form: not merely unverified, but invented, in the spec's load-bearing deliverable, with **T-8, T-9, and T-10 all inheriting from it**.

Under-coverage in T-2 was safe because an absent district quarantines (see T-2 ADVISORY A-1). **This is the opposite direction** — a fabricated mapping produces confident, wrong onboarding with no gate anywhere in the chain to catch it.

**Unblocks when** the workbook is readable from this checkout. Then T-7's evidence requirement — a stated cell-by-cell trace, with the sheets and row counts named — becomes satisfiable rather than theatrical.

**T-8, T-9, T-10 are transitively blocked** (`T-7→T-8→{T-9,T-10}`). T-11 depends on T-7 as well, though its fixture is PII-scrubbed and synthetic by design, so it may prove partially executable once T-3/T-4 are in — to be assessed when reached, not assumed now.

---

### T-4 — Add the per-reason breakdown to the import report

- **Date:** 2026-08-04
- **Status:** ✅ **PASS** on attempt 1 (0 rework rounds)
- **Traces:** FR-7 (all clauses) · `design.md` §3, §4.3, DD-4 · NFR-3, NFR-6, NFR-7, NFR-8
- **Skills:** `nestjs-expert`, `api-design-principles`, `error-handling-patterns` as repo convention; `tdd` **not followed in its red→green form**, mutation testing substituted again (same reason and same discount as T-3) · **Effort:** `medium`
- **Ran alone** — T-3, T-4, T-6 all edit `actor-import.service.ts`
- **Executed inline by the Leader; no independent Reviewer.** Same standing constraint recorded under Amendment A2 and T-3

#### Files changed

| File | Change |
|---|---|
| `actor-import.types.ts` | New exported `ImportFailureReason { reason, count }`; new **optional** `failureBreakdown?: ImportFailureReason[]` on `ImportReport`. No existing member altered |
| `actor-import.service.ts` | `ROW_LEVEL_ERROR_FIELD` / `BATCH_ROLLED_BACK_REASON` constants; module-level `templateColumnIndex()`; `buildFailureBreakdown()` + `failureReasonFor()`; 4 lines in `buildReport` |
| `actor-import.service.spec.ts` | +9 cases in a new `failure breakdown (FR-7, T-4)` describe. **No existing case touched** |

**Purely additive, and this one genuinely is** — unlike T-3, which narrowed (F-1). Asserted rather than claimed: a test pins `Object.keys(report.totals).sort()` and `Object.keys(report).sort()`, so adding, renaming, or dropping any report field fails the suite.

#### The one-reason-per-row rule, and the trap it exists for

`tasks.md` is explicit that `errors[0]` is **not** correct, and the reason is concrete rather than stylistic: `validateRow` pushes `region` (line ~358) **before** `traderType` (line ~374), while `TEMPLATE_COLUMNS` orders **Trader Type at index 2 and Region at index 3**. A row failing both is therefore attributed to `region` by insertion order and `traderType` by template order. Verified at source before implementing, not assumed from the task text.

The implementation sorts a **copy** of the row's errors on `templateColumnIndex` and takes the first. `_row` is not a template column, so it returns `MAX_SAFE_INTEGER` and sorts last; `Array#sort` is stable in V8, so ties keep insertion order and repeated runs agree (NFR-6).

**Mutation check on exactly this rule:** replacing the sort with `const [first] = errors` turns *"names a multi-error row by TEMPLATE ORDER, not by insertion order"* red and leaves the other 8 green — the discrimination is real, and it is isolated to the test written for it. That test also pins its own premise (`errors.map(e => e.field)` equals `['region','traderType']`), so if `validateRow`'s push order ever changes the test fails loudly instead of quietly passing for the wrong reason.

#### Determinism — one deliberate choice worth recording

Ordering is count descending, then reason ascending, with the tie-break written as a plain `<`/`>` comparison rather than `localeCompare`. `localeCompare` is locale-sensitive; under a different `LANG` the same input could order differently, which is precisely what NFR-6 forbids. A cheap, easy-to-miss determinism leak, avoided on purpose.

#### Done-when, clause by clause

| Clause | Evidence |
|---|---|
| Counts **sum to `failed + skipped` exactly** on a mixed fixture | Asserted on a 6-row fixture containing a create, an in-file duplicate, an existing-id skip, **a multi-error row**, and a single-error row. Both sides pinned independently (`failed` 2, `skipped` 2, sum 4) so a change moving both together cannot stay green |
| Ordering stable across two runs on identical input | Two full runs, `JSON.stringify` compared |
| `_row` surfaces as `batch-rolled-back`, never a column name | Rollback forced via `$transaction.mockRejectedValueOnce`; exact-array assertion plus `not.toContain('_row')` |
| Every pre-existing field keeps name, type, optionality | `Object.keys` assertions on both `report` and `report.totals` |

#### Disqualifier clauses checked explicitly

| T-4 disqualifier | Finding |
|---|---|
| Sum invariant asserted on a fixture with **no multi-error row** | **Clear.** The mixed fixture contains one, and a second test isolates the multi-error attribution rule on its own |
| Any existing test needed editing | **Clear.** Nothing outside the new describe changed. (Contrast T-3, where one fixture edit was required and disclosed) |
| A reason slug can carry a value rather than a field/outcome name | **Clear.** The vocabulary is closed by construction: slugs come only from `ImportRowError.field`, from `outcome` strings, or from the `batch-rolled-back` literal. No code path interpolates a cell value into a reason |

#### Requirements covered

FR-7 (breakdown, sum invariant, deterministic ordering, `_row` mapping, additive). NFR-3 (additive, asserted), NFR-6 (ordering + locale-independent tie-break). **NFR-7 and NFR-8 are traced by `tasks.md` to this task but are not exercised by it** — the breakdown is computed from already-assembled row results and touches no transaction boundary, so audit-in-same-`$transaction` and no-partial-corruption remain properties of the pre-existing commit path, unchanged and unretested here. Stating that rather than claiming coverage the change does not provide.

**FR-7's frontend clauses are T-5's**, which is now unblocked.

---

### T-5 — Mirror the breakdown in the frontend and render it in the preview branch

- **Date:** 2026-08-04
- **Status:** ✅ **PASS** on attempt 1 (0 rework rounds)
- **Traces:** FR-7 (FE clauses) · `design.md` §5, §6, R-6
- **Skills:** `react-doctor` **run before reporting** (as `tasks.md` requires — results below); `vercel-react-best-practices` and `tailwind-design-system` as convention; `shadcn-ui` **not loaded** — no primitive was added or adapted, the breakdown is a `div`/`ul` using classes already present in this file · **Effort:** `medium`
- **Executed inline by the Leader; no independent Reviewer.** Same standing constraint as T-3/T-4

#### Files changed

| File | Change |
|---|---|
| `frontend/lib/api/actors-admin.ts` | Mirrored `ImportFailureReason` + optional `failureBreakdown?` on `ImportReport` |
| `frontend/app/(admin)/admin/actors/import/page.tsx` | New `FailureBreakdown` component; rendered in the **preview** branch beside `TotalsChips`, wrapped in `role="status" aria-live="polite"` |
| `frontend/app/(admin)/admin/actors/import/page.test.tsx` | +5 cases. **No existing case touched** |

`ImportPreviewTable.tsx` **unchanged**, per `design.md` §5 / judgment C-14 — its prop surface is `{ rows }` and it holds no live region.

#### "Exact optionality and union" — what that meant here, since it is the disqualifier

The mirror is character-for-character: `reason: string`, `count: number`, and `failureBreakdown?:` optional.

`reason` is `string` on **both** sides. This is a faithful mirror, **not** a union widened to make something compile — the distinction the disqualifier turns on. There is no narrower type to mirror: `TEMPLATE_COLUMNS` is annotated `readonly TemplateColumn[]` whose `field` is `string`, so the column half of the reason vocabulary produces no literal union at the type level even though it is closed in behavior. Narrowing the frontend alone would make it assert something the wire does not guarantee. Recorded in a comment on the type so a future reader does not "restore" a union that never existed.

**Optionality carries a real semantic**, also commented: the backend **omits** `failureBreakdown` on a clean import rather than sending `[]`. The component handles both anyway (`!breakdown || length === 0`), and there is a test for each.

#### Verification

- `npm test -- import --silent` → **28 passed, 2 suites** (23 + 5)
- `npm test -- --silent` (full frontend) → **998 passed, 70 suites** — see the flake note below
- `npm run lint` → exit 0 (1 pre-existing `<img>` warning in `layout.test.tsx`, untouched)
- `npm run build` → static export succeeded, all routes `○ (Static)`
- `npx tsc --noEmit` → **exits non-zero on a PRE-EXISTING error**, see below

#### `npx tsc --noEmit` is red on this branch, and it is not T-5's

```
app/(admin)/admin/actors/page.test.tsx(45,64): error TS2556:
A spread argument must either have a tuple type or be passed to a rest parameter.
```

**Proven pre-existing, not assumed:** `git stash push -- .` then `npx tsc --noEmit` reproduces the identical error with every T-5 change removed. `git log` attributes the line to `[SPEC:actors/registration-source-and-consent] T-8` (`useSearchParams: (...args: unknown[]) => mockUseSearchParams(...args)`).

It is the **only** error `tsc` reports, so all three T-5 files are type-clean — the property T-5's gate actually cares about (the disqualifier exists because the SWC transform does no type checking). But the gate as written cannot go green on this branch until that unrelated line is fixed.

**Not fixed here, deliberately.** It belongs to a different spec, in a file T-5 does not touch; folding it into this commit would put an unrelated repair inside T-5's audit trail. **Flagged for the user** as a candidate `bugfix/` spec — the likely one-line fix is `useSearchParams: () => mockUseSearchParams()`.

#### A one-off test failure I could not identify — reported rather than explained away

One full-suite run reported `1 failed, 997 passed`. The failing test's name was not captured, and **four consecutive re-runs since are 998/998 green**. Two earlier one-off failures this session *were* explained (I ran `cp` and `jest` in one command, so jest read a half-written file — the concurrency trap `CLAUDE.md` §Concurrency names, self-inflicted); this one has no such explanation, because nothing was being written at the time.

Per `tasks.md` §Testing ("inconclusive is a legitimate outcome"), recorded as **observed once, unidentified, not reproduced in 4 runs**. It is not evidence of a T-5 defect and it is not evidence of a clean suite either. If it recurs, `--runInBand` plus a captured name is the next step.

#### `react-doctor` — run before reporting, as assigned

Score **79/100**, 3 warnings, **none in T-5's code**. The scan scope is the whole branch (`actor-register → main`), not this diff.

| Finding | Location | Verdict |
|---|---|---|
| `ActorsView` over 300 lines | `admin/actors/page.tsx:281` | Pre-existing, different spec |
| `ActorImportPage` updates 7 `useState` | `import/page.tsx:206` | Pre-existing page-state block. **T-5 added no state at all** |
| Loading flag reset outside `finally` | `admin/actors/edit/page.tsx:127` | Pre-existing, file untouched |

`FailureBreakdown` is a pure presentational component — no state, no effects, nothing to memoize. Per the skill's own guidance ("ignore unrelated pre-existing code"), none of the three is actioned here.

#### Done-when, clause by clause

| Clause | Evidence |
|---|---|
| Type matches the backend character-for-character in optionality and union | Side-by-side mirror; both `string`; both optional. `npx tsc --noEmit` reports nothing in this file |
| Breakdown renders after a preview | 5 reasons/counts asserted via `getAllByRole('listitem')` |
| Sits inside a live region | `closest('[aria-live]')` asserted `polite` + `role="status"` |
| Only semantic token classes | `bg-surface`, `border-border`, `text-fg`, `text-muted`. Grep for `#hex`, `rgb(`, `bg-[`, `text-[`, `border-[` over the file returns nothing |

#### Disqualifier clauses checked explicitly

| T-5 disqualifier | Finding |
|---|---|
| Union widened to `string` / optionality flipped to make types compile | **Clear**, and argued above rather than asserted: `string` is the backend's own type, and optionality was preserved *with* its semantic (absent ≠ empty), each covered by a test |
| Assertion checks only that the element **renders** | **Clear.** The live-region test asserts the attributes — **and records what it cannot prove**: jsdom builds no accessibility tree and `jest-axe` cannot evaluate whether a live region actually announces. That is a human/AT check, explicitly **not covered** (KZ-002). Written into the test body, not just this log |
| Any hex, `rgb()`, or arbitrary `bg-[…]` | **Clear** by grep |
| `npm test` green while `npx tsc --noEmit` was never run | **Clear** — it was run, it is red, and the red is pre-existing and located |

#### Mutation check (same substitute for red→green as T-3/T-4)

| Mutation | Effect |
|---|---|
| Drop `role="status" aria-live="polite"` from the wrapper | **1 red** — the live-region test |
| Re-sort the list client-side by reason | **2 red** — the ordering test and the render test |

The ordering test deliberately feeds an order the client would *not* produce on its own (`zzz…` count 9 before `aaa…` count 1), so it proves the component renders backend order rather than imposing its own. Ordering is a backend invariant (NFR-6); a client-side sort would silently make the backend's guarantee untestable from the UI.

#### Requirements covered

FR-7's frontend clauses — exact mirror, preview-branch placement, `aria-live` region, token discipline. **NOT covered:** whether the region actually announces to a screen reader (no harness can evaluate it — human/AT check), and FR-7's backend clauses, which are T-4's.



---

### T-6 — Add the download location to the stale-template message

- **Date:** 2026-08-04
- **Status:** ✅ **PASS** on attempt 1 (0 rework rounds)
- **Traces:** FR-11 (both acceptance criteria) · `design.md` §4.4 · NFR-3
- **Skills:** none beyond repo conventions, as `tasks.md` specifies — no deviation · **Effort:** `medium` (not `low`: the task is one string, but two disqualifiers turn on test construction rather than on the string)
- **Ran alone** — T-3, T-4, T-6 all edit `actor-import.service.ts`
- **Independent Reviewer gate restored.** T-3 and T-4 record a standing constraint that the Leader executed them inline with no independent Reviewer. That constraint did **not** apply here: `akili-implementer` and `akili-reviewer` both spawned normally on their wrapper-bound models, so this task had genuine `author ≠ auditor` separation

#### Files changed

| File | Change |
|---|---|
| `actor-import.service.ts` | **One** template literal at line 232. Nothing else |
| `actor-import.service.spec.ts` | +1 `it` block after line 197. No existing case touched |
| `admin-actor-import.e2e.spec.ts` | +1 `it` block after line 1002. No existing case touched |

Before → after, the only production change in the task:

```
- Please re-download the import template and try again.
+ Please re-download the import template from the "Download template" link on this page and try again.
```

#### File-scope deviation from the declared `Files` list — adjudicated in scope

The diff touches `backend/src/test/admin-actor-import.e2e.spec.ts`, which the task's `Files` list does not name. Recorded because an undeclared file is exactly the kind of quiet widening this log exists to catch.

Adjudicated **in scope**, on the spec's own text rather than on convenience: the task's disqualifier clause names `admin-actor-import.e2e.spec.ts:990` as a protected artifact, `design.md` §4.4 names both suites as FR-11's assertion surface, and the task's own `Verify` command (`npm test -- import`) is the pattern that pulls the e2e suite in. A `Files` list that cites a file's line number as a constraint has already admitted that file into the task's blast radius. The change there is additive test coverage with zero production code.

**Process note, non-gating:** the Implementer did not flag the undeclared file in its report; the Leader found it while extracting the diff. A completion report should name a file outside the declared list.

#### Why the new assertions are evidence and not restatement

This is the task's primary disqualifier: the pre-existing assertions (`actor-import.service.spec.ts:195`, `admin-actor-import.e2e.spec.ts:1000-1001`) are **already green with zero code change**, so any test that only re-proves "names both versions" proves nothing about T-6.

Both new assertions pin `/link on this page/i`. That substring does not occur anywhere in the pre-change message, so each fails deterministically against HEAD and passes only because of the production edit. This is the same discrimination property T-3 and T-4 established by mutation: revert the one string and both new tests go red while every pre-existing assertion stays green.

#### NFR-3 — additive only, verified at source rather than from the diff

The Reviewer checked the protected assertions in the files, not merely in diff context: `actor-import.service.spec.ts:191-197` and `admin-actor-import.e2e.spec.ts:974-1002` are byte-identical to HEAD, with insertions beginning after each. Both `out of date` and `re-download` survive the reword verbatim, so neither pre-existing regex needed editing. A repo-wide grep for the message substrings found no other pinning site. `TEMPLATE_VERSION`, exported signatures, report fields, and template columns are untouched.

#### FR-11's BUT-NOT clause

`detectTemplateVersion`, the case-insensitive comparison at lines 227-230, the ordering relative to `locateDataSheet`, and the `BadRequestException` envelope shape are all unchanged. The diff is one line inside the existing throw.

#### Verification

| Command | Result |
|---|---|
| `cd backend && npm test -- --silent import` | **92 passed, 4 suites** |
| `cd backend && npx eslint "{src,test}/**/*.ts" --quiet` | clean, no output — the non-mutating form the root guide requires for a diff under review |

**Leader check on the verification's own coverage, because a green run can be green for the wrong reason.** `npx jest import --listTests` returns `src/test/admin-actor-import.e2e.spec.ts`, `src/actors/actor-import.service.spec.ts`, `src/import/import.service.spec.ts`, `src/actors/dto/actor-import-request.dto.spec.ts`. Both new assertions are inside that set. Had the e2e suite fallen outside the pattern, the 92-green run would have been evidence of nothing for half the change — the backend `testRegex` is `.*\.(spec|e2e-spec)\.ts$` with `rootDir: src`, so an `.e2e.spec.ts` file under `src/` is collected by the default run.

#### Reviewer verdict — `STATUS: PASS`

> The reword adds the download location while preserving both `out of date` and `re-download`, so neither protected assertion was edited (NFR-3 holds); the two new assertions on `/link on this page/i` fail against the pre-change message and therefore prove the new element specifically, clearing the task's disqualifier. Detection logic and the 400 envelope are untouched (FR-11 BUT-NOT), and the e2e file, though outside the declared Files list, is the assertion surface `design.md` §4.4 itself names — additive coverage, not scope creep.

#### ADVISORY (4R lens findings — recorded, non-gating, and not tasks)

Per `/akili-execute`, these are recorded here and die here. None may become a task in this spec.

| # | Finding | Leader disposition |
|---|---|---|
| A-1 | **Cross-layer coupling with no binding test.** The backend 400 now quotes a frontend label that lives at `frontend/app/(admin)/admin/actors/import/page.tsx:442` as `Download template (.xlsx)`. Nothing binds the two — renaming the link sends the admin hunting for a control that no longer exists, and every backend test still passes | Real, and out of scope. FR-11 asks for a download location, not for a cross-layer lock. Candidate for a future proposal, not for this spec |
| A-2 | **The message assumes a browser context the API cannot guarantee.** "on this page" is meaningful only to the import page; a script or future integration caller receives an unactionable instruction | Accurate. The endpoint's only current client is that page (`lib/api/actors-admin.ts` → `importActors`), and `page.tsx:263` renders the server's 400 message verbatim on the same screen as the link, so the wording is literally true for every caller that exists today. Not a requirement breach |
| A-3 | **Fixture duplication.** The new e2e test copies ~10 lines of workbook construction from the test above it | Noted. Folding the assertion into the existing test would have required editing the protected block, which NFR-3 forbids — the separate test is the defensible call |

#### Done-when, clause by clause

| Clause | Evidence |
|---|---|
| Message contains the detected version | `found ${templateVersionDetected}` — unchanged from HEAD |
| Message contains the current version | `current is ${TEMPLATE_VERSION}` — unchanged from HEAD |
| Message contains the **download location** | `the "Download template" link on this page` — new; matches the real affordance at `page.tsx:427,442` |
| `out of date` and `re-download` both remain present | Both verbatim in the new string; both pre-existing regexes still match, unedited |

#### Requirements covered

FR-11, both acceptance criteria, including the BUT-NOT clause. **Nothing in this task is in the uncoverable set** — unlike most of this spec, FR-11 is fully gated by a runnable assertion, and the gate discriminates.

#### Issues encountered

None in the work. One orchestration note: the Reviewer completed its audit but went idle without delivering the report, and had to be asked for it explicitly. No effect on the verdict or the evidence.

---

### T-11 — Worked-example fixture + preview assertions, and the PII release gate

- **Date:** 2026-08-04
- **Status:** 🔄 **IN PROGRESS** — attempt 1 FAILed review, attempt 2 dispatched. `tasks.md` T-11 is `[~]`
- **Traces:** FR-2 (idempotent re-run scenario) · FR-3 (district-rescue, quarantine on absent district) · FR-5 · FR-7 · NFR-1 · `design.md` §12, R-1 substitute 2
- **Skills:** `nestjs-expert`, `tdd`, `systematic-debugging` as `tasks.md` specifies — no deviation · **Effort:** `xhigh`
- **Review mode:** **parallel lens reviewers** (3), per `/akili-execute`'s effort-`xhigh` rule — spec conformance / scenario closure, PII+NFR-9+risk, and evidence quality. Each received the same file and one named lens

#### Dependency-order deviation — approved, and the reason it was safe

T-11 declares `deps: T-3, T-4, T-7`. T-3 and T-4 are `[x]`; **T-7 is blocked** on the source workbook and `mapping.md` does not exist. The Leader assessed the `T-7 → T-11` edge as **nominal** and the user approved running out of order:

- the fixture is driven through the import endpoint, which accepts only the canonical template (`locateDataSheet` matches on `TEMPLATE_HEADERS`), so its columns come from `TEMPLATE_COLUMNS` — the source workbook could not have supplied them;
- T-11's five dirt classes are enumerated in its own scope line and `requirements.md` §3.1, not derived from `mapping.md`;
- NFR-9 mandates synthetic values regardless.

The brief carried a hard stop-condition: if any clause needed a mapping decision, park at `[~]` rather than invent one. **It was not triggered.** The conformance Reviewer verified this independently against the file — the three inputs that could plausibly have needed `mapping.md` are `Mbozi → Songwe` (read from the shipped `DISTRICT_TO_REGION` at `normalize.ts:175`), the trader types (prescribed by FR-4 / DD-2), and the column shape (`TEMPLATE_COLUMNS`). The assessment held.

#### Attempt 1 — files changed

| File | Change |
|---|---|
| `backend/src/test/partner-profile-onboarding-import.e2e.spec.ts` | **New**, 526 lines. Own Prisma mock, workbook builder, `TestJwtAuthGuard`; real `AppModule` with `PrismaService` overridden. No existing file touched |

Renamed from `-onboarding.e2e.spec.ts` during the attempt so the `npm test -- import` substring pattern collects it.

#### Attempt 1 — verification

| Command | Result |
|---|---|
| `npm test -- pii-boundary --silent` | PASS, 10/10 |
| `npm test -- import --silent` | PASS, 5 suites / 95 tests |
| `npm test -- --silent` (full backend) | PASS, 38 suites / 489 tests, 0 failed |
| `npx eslint "{src,test}/**/*.ts" --quiet` | exit 0 |
| `npm run build` | exit 0 |

#### Attempt 1 — lens verdicts

| Lens | Verdict |
|---|---|
| Spec conformance / scenario closure | ❌ **FAIL** — 1 issue |
| PII / NFR-9 / risk | ✅ **PASS** — 5 advisories |
| Evidence quality (KZ-002) | ❌ **FAIL** — 1 issue |

**Both FAILs adjudicated in scope by the Leader before consuming the attempt**, per the parallel-lens rule. Neither is a lens straying outside the task: the conformance issue cites a clause `tasks.md`'s own coverage-closure table assigns to T-11, and the evidence issue cites `tasks.md` § Testing & Verification Expectations, which is a standard this spec set for itself.

**FAIL 1 (conformance) — FR-10's DMS scenario has no closing assertion.** The coverage table co-assigns *"Scenario: DMS coordinates blanked, actor still imports"* to **T-8 and T-11**. T-8 is a document task with explicitly no automated gate, so accepting T-11 as-is would leave the code-observable half of the clause owned by nobody. No fixture row sets any GPS cell and no assertion references coordinates. The Reviewer checked the nearest pre-existing coverage and ruled it does not read across: `actor-import.service.spec.ts:290-315` covers an out-of-range **numeric** latitude (`200`), while FR-10's clause concerns a **DMS string** reaching a decimal column — a different input class. It further noted the legacy `src/import` module *quarantines* on non-numeric GPS while the admin importer clears-and-warns, so the two paths genuinely differ.

**FAIL 2 (evidence, KZ-002) — a label claims a property the harness cannot evaluate.** The describe at line 470 is titled `'Idempotent re-run (FR-2 scenario: "re-running the mapping on an unchanged workbook")'`. The test proves the upload half well — re-POSTing byte-identical input creates nothing — but it cannot touch the *mapping* half, because no mapping is re-run and the keys are literals in the test file. Re-POSTing identical bytes holds key generation constant by construction, which is exactly the step FR-2's determinism clause is about. That property is enumerated as ungated in three places (`design.md` §12.1 item **6**, `requirements.md` §9 substitute 6, the `tasks.md` preamble). The file's *"What this suite does NOT claim"* block disclaims §12.1 items 1-5 by name and is **silent on item 6** — the one item this describe title would lead a reader to believe was just discharged. Remediation is documentation only; no assertion is wrong.

#### Attempt 1 — what the reviewers confirmed was sound

Recorded because a FAIL entry that lists only defects misrepresents the attempt, and because these were the properties most likely to produce a false green.

- **Preview-writes-nothing is a real proof, not a vacuous one.** The mock asserted on is the instance injected via `overrideProvider(PrismaService)`, and the transaction client is wired to the same `jest.fn` objects, so a write inside `$transaction` would increment the same counter. Confirmed live by the commit test asserting `toHaveBeenCalledTimes(3)`/`(1)` on those same mocks. The Reviewer traced every Prisma call site in `actor-import.service.ts` and found all mutation nested inside the single `$transaction` at `:922`, making `$transaction` `not.toHaveBeenCalled()` a chokepoint that forecloses `createMany`, `upsert`, and audit writes as a class.
- **Idempotency genuinely persists state between the two POSTs.** `reset()` is called only in `beforeEach`, not between runs; run 2 re-enters the real service, `dedupeAgainstDb` queries the mock's `findMany`, and both rows route to `skipped-exists` through production code. The load-bearing assertion is the cumulative `actor.create` count of **2** across both runs — 4 if run 2 had written.
- **All five outcome classes are non-vacuous.** The Implementer mutation-checked two; the Reviewer judged the other three by reading. `rowByNumber` returns `undefined` on a miss so a dropped row throws rather than skips, and every assertion is exact-value rather than presence.
- **PII: exhaustively clean.** Every literal enumerated, not sampled. No client-workbook name, phone, email, or coordinate. No path read, snapshot, env lookup, or fixture directory through which real data could later be absorbed; no `.only`/`.skip`. `+44 20 7946 0958` verified inside Ofcom's reserved `020 7946 0xxx` drama block — provably not anyone's real number.
- **FR-6's two non-at-scale clauses, discharged by citation, were verified rather than accepted.** The conformance Reviewer read `pii-boundary.spec.ts` and confirmed both hold there, with one mechanism nuance worth recording: for `/actors` and `/metrics` consent really is pinned in the `WHERE`, but the **detail** path (`findOnePublic`) fetches by id and re-checks via `isPublic()` — a service-level guard applied before projection, not a `WHERE`. Satisfies the clause's intent; "WHERE-pinned" is not literally true on all three paths. Chunk-1 shipped design, not introduced here.
- **FR-3's district-rescue scenario is partially covered, and the uncovered half is an inherent limit.** DD-1 places derivation at mapping time and states the constant is not consumed by the importer, so no code path exists to exercise the stronger reading. The suite records this at the point of use rather than overselling it.

#### Attempt 1 — ADVISORY findings (recorded, non-gating, and not tasks)

| # | Lens | Finding | Leader disposition |
|---|---|---|---|
| A-1 | PII | The docblock justifies `Mbozi` as "not a value read from the client workbook." The `DISTRICT_TO_REGION` district **set** demonstrably was derived from workbook measurement in T-2 (`design.md` §4.2). The conclusion is unaffected — district names are in none of NFR-9's four categories and the pairing is already committed — but the premise is false, in a file that is itself an audit artifact | **Folded into attempt 2's brief.** Not scope growth: a false factual statement in the deliverable under rework, and the same defect class as FAIL 2 (prose claiming more than the facts support) |
| A-2 | Evidence | The comment at `:403` claims "deterministic order" and the sum invariant. All three breakdown counts are `1`, so the count-descending primary key is never exercised, and the fixture has no multi-error row. Both properties **are** gated — by T-4, in the same `npm test -- import` run — so there is no coverage gap, but a reader of this file alone would take the comment at face value | **Folded into attempt 2's brief**, same reasoning as A-1 |
| A-3 | Evidence | `:489-491` and `:509-512` use `expect(rows.every(…)).toBe(true)`, which prints only "Expected: true / Received: false" on failure. Diagnosability only; neither is vacuous | Passed as optional. Not required for PASS |
| A-4 | Evidence | Collection by `npm test -- import` rests on the substring surviving in the filename. Bounded — the full run still collects it via `testRegex` | Recorded so the coupling is known |
| A-5 | PII | `requirements.md` §9 D-7 says the grep gate is clean "once the **three** `+2557000000*`-style fixtures are excluded"; a repo-wide grep now returns ~30 across a dozen files. **Already stale before T-11** (T-1 added several), so not chargeable here. Recommend restating D-7's exclusion as a pattern rather than a count | **Out of scope for this spec's tasks.** Candidate for the archive doc sweep, not for T-11 |
| A-6 | PII | Fixture ids track the class number, not the Excel row number (`PPO-3` sits on row 4). Cosmetic | No action |
| A-7 | Evidence | The zero-write proof's durability is incidental: a future pre-transaction write would evade both assertions, though the trimmed mock would throw rather than pass silently | Recorded |
| A-8 | Conformance | `pii-boundary.spec.ts`'s header frames its scope note as "T-7", meaning **chunk 1's** T-7 — momentarily confusing beside this spec's blocked T-7. Pre-existing; NFR-3 forbids editing it here | No action |

#### Attempt 2 — effort held at `xhigh`, deviating from the rework bump rule

The rework rule bumps effort one level on every retry, which would put attempt 2 at `max`. Held at `xhigh` deliberately, for two reasons that both point the same way:

1. **The tier↔effort rule forbids it.** `max` on a T2 Implementer is exactly the "never `max` a cheaper tier" case; the prescribed alternative is escalating the tier, which here would collide with `author ≠ auditor` (the Reviewers run on the T3 model).
2. **The rule's rationale does not apply.** It exists because "a fix that failed is usually under-thinking." Neither FAIL is a reasoning failure: attempt 1 was strong on every property most likely to produce a false green, and both remediations arrived fully specified — the conformance Reviewer traced its proposed fixture row through `resolveGps` → `numOrNull` and confirmed it passes against the shipped importer with no production change, including the exact totals the sum assertion must become.

#### Attempt 2 — ❌ FAIL (both prior FAILs closed; the fix introduced two new findings)

Same three lenses re-run. **PII PASSed again** after ruling on the delta's new literals. Conformance and evidence both FAILed, and — importantly — **they converged independently on the same two issues**, which is why attempt 3's brief could be written as a single consolidated remediation rather than a merge of competing opinions.

**What attempt 2 closed, verified by the lens that raised it:**

- **Conformance FAIL 1 (FR-10's DMS scenario) — preview half closed.** `dmsCoordinatesRow` added as Class 6 / Excel row 8. `outcome === 'create'` asserted; the warning string verified **byte-exact** against the shipped `GPS_CLEARED_WARNING` (`actor-import.service.ts:75`), em dash included. The mechanism was re-traced at source: `numOrNull` → `null` → `isValidLatitude(null)` false → cleared. Sum invariant holds on both sides (4 + 1 + 2 = 7); `failureBreakdown` correctly unchanged; no pre-existing row's assertions shifted.
- **Evidence FAIL (KZ-002 label overclaim) — closed.** The lens checked the replacement prose against the sources it cites rather than accepting it: the new "does NOT claim" bullet faithfully restates `design.md` §12.1 item 6, and its ownership claim matches `tasks.md:231`. The retitled describe no longer quotes the "re-running the mapping" clause.
- Advisories A-2 and A-3 applied; the `every(...)` → `map(...).toEqual([...])` swap was judged a **strengthening** (it now pins order and length) rather than a cosmetic change.

**FAIL A (both lenses) — the commit-side GPS assertion is laundered by the serializer.** `admin-actor.serializer.ts:127-134` (`toNullableNumber`) coerces every non-finite and non-numeric value to `null` before a test can observe it. So `expect(body.gpsLatitude).toBeNull()` passes identically whether GPS was correctly cleared, or `NaN` was stored, or **the raw DMS string was persisted into the decimal column** — the last being precisely what FR-10 forbids. Only a coercion to a *finite* number would go red. The comment above it claimed the assertion proved "the DMS string never reached the decimal columns", which is the one case it is structurally blind to.

The conformance lens noted this was a weakness in **its own attempt-1 remediation**, not a deviation by the Implementer — it prescribed the weaker of the two available observations. Recorded because a review loop that never catches its own prescriptions is not adversarial.

**FAIL B (both lenses) — stale counts survived the rework, two of them in Jest-printed titles.** `:83` and `:387` still said "five dirt classes" over six; `:465` said `creates 3 rows` four lines above an assertion of `created: 4`. The file-header docblock *was* updated, which is what made the rest easy to miss. These strings appear verbatim in the run output this task is evidenced by, so the primary evidence surface would have reported the wrong counts.

**Attempt 3 also adopts a fixture-value change both lenses converged on independently.** The PII lens (ADVISORY-1) and the conformance lens (advisory 1) each proposed replacing the valid DMS coordinate with an **out-of-range** one (`8°75'13"S`). It is better on three counts at once: provably not a location, so the residual "is this a real place" question closes permanently; identical code path, so zero coverage loss; and **more faithful to the measured data** — `design.md` DD-10 records that of the 71 DMS cells in the QDS sheet at least one has out-of-range minutes, and `requirements.md` FR-10's GIVEN names exactly that. The fixture's stated purpose is to reproduce the structure of measured anomalies; the valid coordinate did not.

**On the coordinate that prompted it.** The Leader flagged `8°55'13"S, 33°27'39"E` as possibly landing in Mbozi district, beside the client material. **That was wrong, and the PII lens corrected it:** the point decimalizes to −8.9203, 33.4608 — the urban core of **Mbeya city**, ~60 km from Mbozi and in a different region. Its longitude matches to four decimal places a Mbeya coordinate already committed and cleared inside `pii-boundary.spec.ts:119-120`, the release-gate suite itself. The lens also sharpened the applicable test: NFR-9's operative clause for a coordinate is **provenance**, not geographic reality — a public gazetteer fact is out of scope even if it names a real place, while a value copied from one of the 71 QDS cells would be in scope even though "coordinate" is absent from NFR-9's four enumerated categories. Ruled NFR-9-safe, not marginal. The swap in attempt 3 is an improvement on an already-passing value, not a remediation.

#### Attempt 3 — ✅ PASS (both gating lenses)

Both attempt-2 FAILs closed, plus a fixture improvement and three prose corrections, in one pass.

**Item 1 — the unlaundered write-path assertion.** Both lenses had prescribed the same fix and it was taken: pull the `prismaMock.actor.create` call whose `data.traderId === 'PPO-6'` and assert the four GPS keys are **absent** from the payload. Both reviewers then verified the assertion actually discriminates, at source:

- the cleared path returns `{}` from `resolveGps` (`:723-726`), so the fields are `undefined` at `:619-622` and `buildCreateData` (`:998-1002`) copies only `value !== undefined` — the keys are **omitted**, never set to `null`, so `not.toHaveProperty` is the matcher that matches reality;
- both regressions the GET is blind to — a raw-string persist and a `parseFloat`-style coercion — leave the key **present**, and fail;
- `mock.calls` survives to the assertion: `mockClear()` is reached only via `reset()` in `beforeEach`, no `clearMocks`/`resetMocks` exists in the backend config, and the three intervening GETs touch `findUnique` only;
- `expect(dmsCreateCall).toBeDefined()` closes the `.find()` vacuity hole, and the `!` is only reachable past that throw;
- the mock spreads `data` into a fresh object and never mutates the captured arg, so `call[0].data` is the payload as the service built it.

The idiom is the repo's own: `actor-import.service.spec.ts:313-316` already does exactly this for the adjacent case, and that test is unedited.

**Item 2 — the three stale counts and the missing traces.** `:84` and `:395` now read "six dirt classes" over six classes; `:473` reads "creates 4 rows" above assertions of `created: 4` and `toHaveBeenCalledTimes(4)`; `FR-10` appears in the header trace, the preview describe, and the commit describe. Confirmed against the actual `--verbose` output, since these strings *are* the evidence surface.

**Item 3 — the out-of-range DMS value, adopted from two independent advisories.** `8°75'13"S` / `33°75'39"E`. Both lenses confirmed it takes the byte-identical branch (`Number()` → `NaN` → `numOrNull` → `null` → `isValidLatitude(null)` false → cleared + warning) and that it is *more* faithful than the value it replaced: `requirements.md:292` puts "at least one value with an out-of-range minutes component" in FR-10's own GIVEN, and DD-10 records the measured anomaly. The conformance lens added an argument neither advisory had made — it also hardens the test against FR-10's *permitted alternative* branch ("converted by a rule stated in `mapping.md`"), because a future DMS converter would still have to reject 75 minutes.

**Item 4 — three prose corrections.** The unverifiable negative is gone (an out-of-range value cannot correspond to any location, so provenance is irrelevant rather than merely unchecked); the FR-10 ownership claim is narrowed to "T-11's half, T-8 owns the mapping-side half", verified against `tasks.md:222`; and a clause now states that nothing in Class 6 is DMS-specific — the gate is `Number()` non-finiteness, so any unparseable string exercises the identical path.

**Optional strengthening also taken:** `toContain` → `toEqual(['GPS out of range — imported with GPS cleared'])` on the warnings array. Both lenses independently proved this is not brittle rather than assuming it: only three warning strings exist in the backend, row 8 has no phone cell (both phone warnings sit inside `if (cells.phone)` and `buildWorkbook` writes `''`), and a blank consent cell defaults to `UNKNOWN` so `CONSENT_ACK_WARNING` is unreachable. Exactly one warning can fire.

#### Verification — re-run by the Leader after the workers reported, tree quiet

Both reviewers are read-only and explicitly handed the whole-tree confirmation to the Leader. Taken rather than assumed:

| Command | Result |
|---|---|
| `git status --porcelain` | `?? backend/src/test/partner-profile-onboarding-import.e2e.spec.ts` plus `M` on this spec's `execution.md` and `tasks.md` (Leader bookkeeping) — **nothing else** |
| `npm test -- pii-boundary --silent` | 1 suite, **10/10 passed** |
| `npm test -- import --silent` | 5 suites, **95/95 passed** |
| `npx eslint "{src,test}/**/*.ts" --quiet` | clean, no output |

**NFR-3 confirmed at the tree level:** no production file and no pre-existing test file was modified across all three attempts. The entire task is one new untracked file.

#### Final lens verdicts — `STATUS: PASS` ×2

> **Conformance:** Both attempt-2 FAILs are genuinely closed — the call-args assertion reaches past `toNullableNumber` and discriminates both the coercion and the raw-string regression on a path proven to omit the keys, and all three counts plus all three FR-10 trace parentheticals are corrected. The out-of-range fixture value takes the identical code path, matches FR-10's own GIVEN, and leaves every Class 6 assertion with teeth.

> **Evidence:** Both prior FAILs are genuinely closed — the call-args assertion reaches past the serializer that provably launders the read surface, and the split comment claims exactly what `buildCreateData`'s undefined-dropping delivers; all three counts and the FR-10 trace parentheticals are corrected, and the tightened `toEqual` is unreachable-by-construction from any other warning path.

The PII lens PASSed attempts 1 and 2 and was **not re-run on attempt 3**, deliberately: the delta adopted that lens's own prescription and *removed* the only real-location value in the file, replacing it with a coordinate that cannot resolve to any place. There was no new PII surface for it to rule on. Recorded as a Leader decision rather than an omission.

#### Done-when, clause by clause

| Clause | Evidence |
|---|---|
| Fixture exercises ≥5 distinct outcome classes | **Six.** Dirty district, contaminated row, unnormalizable phone, duplicate key, blank required field, DMS coordinates |
| Preview writes nothing — **asserted, not assumed** | `actor.create` and `$transaction` both `not.toHaveBeenCalled()` on the injected mock. The evidence lens verified the mock is the instance the service resolves and that the transaction client is the same `jest.fn` set, so a write inside the transaction would move the same counter — and that the counter demonstrably moves, since the commit test reads 4 and 1 on those same mocks |
| A second identical run yields zero creates | `created: 0, skipped: 2`, every row `skipped-exists`, and the cumulative `actor.create` count still **2** across both POSTs. No `reset()` between them — verified, this was the run's most likely false green |
| `pii-boundary.spec.ts` is green | 10/10, unmodified |

#### Requirements covered — and what is not

Closed by assertion: FR-2's idempotent-re-run scenario (upload half), FR-3's quarantine-on-absent-district clause, FR-5, FR-7's HTTP-boundary regression pin, FR-10's DMS scenario (T-11's half), NFR-1.

**Not covered, and now stated in the file itself rather than only here:**

1. **FR-2's key determinism across two *mapping* runs** (`design.md` §12.1 item 6). Re-POSTing byte-identical input holds key generation constant by construction. Owned by T-7/T-8, verified only by re-running and diffing.
2. **FR-6's at-scale public-invisibility clause.** The suite mocks Prisma and structurally cannot observe an onboarded dataset. Discharged by T-9's operator check.
3. **FR-3's district-rescue derivation.** DD-1 places derivation at mapping time and the constant is not consumed by the importer, so no code path exists to exercise. The suite asserts the code-observable half (created, not quarantined) and says so at the point of use.

FR-6's two other clauses ("`gps` null for non-`GRANTED`", "consent pinned in `WHERE`") are discharged by `pii-boundary.spec.ts`. The conformance lens **read that suite rather than accepting the citation** and confirmed both hold, with one nuance worth recording: for `/actors` and `/metrics` consent really is pinned in the `WHERE`, but the detail path (`findOnePublic`) fetches by id and re-checks via `isPublic()` — a service-level guard before projection, not a `WHERE`. Satisfies the clause's intent; "WHERE-pinned" is not literally true on all three paths. Chunk-1 shipped design, not introduced here.

#### Attempt-3 advisories (recorded, non-gating, not tasks)

| # | Lens | Finding |
|---|---|---|
| A-9 | Evidence | `not.toHaveProperty('gpsAltitude')`/`('gpsAccuracy')` are tautological for *this* fixture — both cells are blank, so the keys would be absent even under a regression that stopped clearing all four. Harmless (no prose claims otherwise) and the load-bearing version already exists at `actor-import.service.spec.ts:290-317`, where the fixture supplies real altitude and accuracy |
| A-10 | Conformance | The file-header trace lists NFR-1 but not FR-6, though `tasks.md:200,202` assign two FR-6 clauses to T-11. The coverage is real — carried by `pii-boundary.spec.ts` — only its trail is implicit |

#### Issues encountered

Three orchestration notes, none affecting a verdict:

1. **Reviewers repeatedly went idle without delivering their reports** — the conformance lens once, the evidence lens twice (it eventually sent in two parts, then resent the whole audit unprompted). Each had to be chased by explicit request. The audits themselves were complete and high quality; the delivery step was unreliable.
2. **A Leader hypothesis was wrong and a Reviewer corrected it.** The Leader flagged the attempt-2 DMS coordinate as possibly landing in Mbozi district beside the client material. It is Mbeya city centre, ~60 km away and in a different region. Recorded because the correction is the reason the value was ruled safe on evidence rather than on the Leader's suspicion.
3. **A Reviewer identified a weakness in its own prior prescription.** The attempt-1 conformance remediation prescribed the GET-based GPS check, which attempt 2 implemented faithfully — and the same lens then failed it, on the grounds that its own prescription was the weaker of the two available observations. Worth recording: a review loop that never overturns its own prescriptions is not adversarial.

---

### T-7 UNBLOCKED — the source workbook was located outside the repository

- **Date:** 2026-08-04
- **Found at:** `~/Downloads/Partner Profile 14.4.2026.xlsx` — outside the checkout, which is why every prior `find` inside the repo returned only the generated canonical template

The earlier HALT recorded the blocker as "the workbook is not in this repository", which was true and remained true — the file had simply never been searched for outside it. Located by searching the user's `Downloads`, `Desktop`, `Documents`, and `Development` folders.

**It stays outside the repository.** NFR-9's headline clause is "the source workbook and its PII stay out of the repository" — the file is read in place and is never copied, committed, or added to a fixture directory.

**Identity confirmed against `requirements.md` §3.1 before any task ran**, so no task proceeds on an assumed-correct input:

| Sheet | Measured rows | Header row | Measured columns | §3.1 expects |
|---|---|---|---|---|
| `Offtaker_Beans` | 437 | 1 | 16 | 16 ✅ |
| `Offtaker_Sorghum` | 129 | 1 | 13 | 13 ✅ |
| `Offtaker_Groundnuts` | 152 | 1 | 13 | 13 ✅ |
| `Bulk buyers_beans` | 235 | **3** | 17 | 17, header 3 ✅ |
| `Humantarian` | 44 | **3** | **10** | 9 ⚠ see below |
| `Digital Service Provider` | 20 | **2** | 9 | 9 ✅ |
| `Seed Company` | 13 | 1 | 26 | 26 ✅ |
| `QDS_ Seed producers` | 312 | 1 | 41 | 41+ ✅ |

8 sheets, as the spec records. Seven of eight column counts match exactly, and all four non-standard header rows match.

**One discrepancy, flagged not settled:** `Humantarian` measured **10** non-empty header cells where `tasks.md` T-8 says 9. The Leader's measurement took the widest of the first five rows, which can over-count if a stray cell sits outside the header band. This is **T-8's** sheet, not T-7's, so it is recorded here for T-8 to resolve at source rather than adopted as a correction now. T-8 must reconcile it explicitly — FR-1's only automated gate is that dispositions sum to the measured column count, so an unresolved ±1 would make that gate meaningless for this sheet.

**Correction to the table above, made by the Leader against its own entry:** the "Measured rows" column reports `ws.rowCount` — the sheet's physical extent including the header and any trailing formatting — **not** data rows. Read as data rows it would contradict `requirements.md` §3.1, which it does not: 437/129/152 correspond to §3.1's 436/115/150 data rows exactly. Corrected here rather than left to be misread, since this log is an audit artifact.

---

## Pivot Record: T-7 — `requirements.md` §3.1 measurements contradict the source workbook

- **Date:** 2026-08-04
- **Trigger:** T-7's Implementer, having the real workbook for the first time, reported two figures that disagree with the approved spec. **The Leader verified both independently before treating either as true** — the spec's numbers and the worker's numbers were given equal suspicion.
- **Status:** T-7 is `[~]`, **not** reviewed and **not** certified. **T-8 is not started.** Execution is stopped for user approval per the Pivot Protocol.

### Why this is a pivot and not a rework

Nothing is wrong with T-7's *implementation*. What is wrong is the **approved requirements**: they record measurements of a workbook nobody could open when they were written, and the workbook now says otherwise. The rework loop cannot fix that — an Implementer told to match `requirements.md` would faithfully reproduce the wrong numbers, and a Reviewer auditing against `requirements.md` would pass them.

This is also the moment the spec was designed to catch. `requirements.md` §9 **D-6** states that arithmetic closure is not mapping correctness, and FR-1's only automated gate (**D-5**) is that dispositions sum to the measured column count. **If the "measured" counts are wrong, D-5 certifies fabrication.** T-8, T-9 and T-10 all inherit these figures, and T-10's entire deliverable is a reconciliation whose arithmetic must close against them.

### Finding 1 — blank source ids: **38**, not 52

| Sheet | `requirements.md` §3.1 | Leader measurement | Implementer measurement |
|---|--:|--:|--:|
| `Offtaker_Beans` | 15 | **15** ✅ | 15 |
| `Offtaker_Sorghum` | 30 | **17** ❌ | 17 |
| `Offtaker_Groundnuts` | 7 | **6** ❌ | 6 |
| **Total** | **52** | **38** | 38 |

Method: counted rows whose `Trader_id`/`Trader_ID` cell is empty after trimming, over rows with at least one non-empty cell. The blank-id rows are contiguous tails in every sheet — Beans 423-437, Sorghum 100-116, Groundnuts 147-152 — which is consistent with unfinished data entry rather than scattered omissions, and makes the count easy to confirm by inspection.

The 2 `Offtaker_Sorghum` intra-sheet duplicate ids are **confirmed correct** (the only sheet with `dupIds > 0`).

**Consequence:** the positional-key population for these three sheets is **38 blank + 2 duplicate = 40**, not 54.

Cited and now wrong in: `requirements.md` §3.1 (per-sheet notes), `requirements.md` §4 comparison row, `requirements.md` **FR-2's acceptance criterion** (*"a positional key to each of the **52** rows"*), `design.md` §9 sizing table, `design.md` DD-9 context, `tasks.md` T-7 scope, `tasks.md` coverage-closure row *"Positional keys for 52 blank + 2 intra-sheet dups"*.

### Finding 2 — `Offtaker_Groundnuts` contaminated tail: rows **149-152**, not 147-151

The Implementer's claim was checked by measuring the contamination *shape* per row, without reading any value into the log:

| Row | Long digit run in `Trader type` | Word count in `District` |
|---|---|---|
| 144-146 | no | 0-1 |
| **147** | **no** | 1 |
| **148** | **no** | 1 (an ordinary category word) |
| **149** | **yes** | 2 |
| **150** | **yes** | 2 |
| **151** | **yes** | 3 |
| **152** | **yes** | 3 |

Exactly **four** rows carry a phone number in the trader-type column — which independently corroborates `requirements.md` §3.1's own figure of 4 for this sheet, a figure the spec gets *right*. Rows 147 and 148 have a blank id but are otherwise ordinary data; they belong in the positional-key register, not the contamination register.

Cited and now wrong in: `design.md` §9 (*"rows **147–151**"*), `tasks.md` T-7 scope. Note `Offtaker_Sorghum` 110-116 was **not** contradicted and stands.

### Suspected, not verified — and why T-8 must not start on them

These surfaced from the Leader's coarse sheet scan (widest of the first rows), which is reliable enough to raise a question and **not** reliable enough to correct a requirement:

| Item | §3.1 says | Coarse measurement |
|---|---|---|
| `Humantarian` header row | 2 | 3 |
| `Humantarian` columns | 9 (`tasks.md` T-8) | 10 |
| `QDS_ Seed producers` columns | **55** | 41 (`tasks.md` T-8 says "41+") |

`requirements.md` §3.1 and `tasks.md` T-8 **already disagree with each other** on the QDS column count — 55 versus "41+" — independently of any measurement. That disagreement predates this pivot and was invisible while the workbook was unreachable.

All three items are inputs to T-8's arithmetic gate. Starting T-8 before they are settled would run the spec's load-bearing document against a gate that cannot fail.

### Options

1. **Re-measure §3.1 in full, correct the derived figures, then resume.** One scripted pass over all eight sheets producing header row, data rows, and column count; correct `requirements.md` §3.1 and every derived figure in `design.md` and `tasks.md`; then review T-7 against corrected numbers and run T-8. Highest confidence, and it makes D-5 a real gate for the first time.
2. **Correct only the two verified findings and proceed.** Cheaper, but leaves T-8 running against the unresolved `Humantarian` and QDS counts — i.e. against a gate known to be untrustworthy for two of its five sheets.
3. **Accept the spec's figures and record the workbook as disagreeing.** Rejected on its face; it would mean knowingly shipping a mapping whose row registers do not match the file it maps.

**Leader recommendation: option 1.** The cost is one measurement pass, and it is the only option under which T-8, T-9 and T-10 inherit numbers anyone has checked.

### Awaiting

Explicit user approval of the pivot and the option, per the Pivot Protocol. No approved requirement has been edited yet — the corrections depend on which option is chosen, and churning `requirements.md` twice would be worse than waiting.

### Resolution — user approved **option 1** (full §3.1 re-measurement), and it shrank the pivot

The re-measurement was run over all eight sheets. **`requirements.md` §3.1 is correct on every sheet for header row, named-column count, and physical data rows.** The pivot reduces to the two originally verified findings.

| Sheet | Header row | Named columns | Data rows | §3.1 |
|---|--:|--:|--:|---|
| `Offtaker_Beans` | 1 | 16 | 436 | ✅ |
| `Offtaker_Sorghum` | 1 | 13 | 115 | ✅ |
| `Offtaker_Groundnuts` | 1 | 13 | 150 | ✅ |
| `Bulk buyers_beans` | 3 | 17 | 166 | ✅ |
| `Humantarian` | 2 | 9 | 35 | ✅ |
| `Digital Service Provider` | 2 | 9 | 13 | ✅ |
| `Seed Company` | 1 (+ sub-header row 2 = `lat`/`long`) | 26 | 11 | ✅ |
| `QDS_ Seed producers` | 1 | 41 named / **55 physical** | 311 | ✅ both, see below |

**All three "suspected" items were the Leader's measurement error, not the spec's.** Recorded plainly because the earlier entry above asserted them:

- `Humantarian` is header row **2** with **9** named columns and 35 data rows, exactly as §3.1 says. The earlier "header row 3, 10 columns" came from a heuristic that took the widest of the first rows — which lands on a data row when the header has a gap. The `⚠` on that sheet is **withdrawn**, and T-8 does *not* need to reconcile a ±1.
- `Digital Service Provider` and `Seed Company` likewise match, once the merged title row and the `lat`/`long` sub-header are accounted for. `Seed Company`'s data genuinely starts at row 3.

**The QDS "55 vs 41" disagreement is definitional, not factual — and it is the more useful finding.** The sheet has **55 physical columns**, of which **41 carry a header name**; `columnCount` is 55 and `actualColumnCount` is 53. `requirements.md` §3.1's "55 columns" counts physical extent; `tasks.md` T-8's "41+" counts named headers. Both are accurate measurements of different things.

That matters because FR-1's only automated gate (**D-5**) is *"dispositions sum to the measured column count"* — and with two defensible counts differing by 14, the gate is ambiguous rather than wrong. **T-8 cannot satisfy D-5 until the spec says which count it means.** A disposition per named header (41) leaves 14 physical columns undocumented; a disposition per physical column (55) requires dispositioning 14 columns that have no name to disposition. The spec has to choose, and the choice belongs in `requirements.md` FR-1, not in an Implementer's judgment.

### Corrections to make, and their blast radius

| # | Correction | Sites |
|---|---|---|
| C-1 | Blank source ids **52 → 38** (Sorghum 30 → **17**, Groundnuts 7 → **6**; Beans 15 unchanged) | `requirements.md` §3.1 rows, §4 comparison row, **FR-2 acceptance criterion**; `design.md` §9 sizing table, DD-9 context; `tasks.md` T-7 scope, coverage-closure row |
| C-2 | `Offtaker_Groundnuts` contaminated tail **147–151 → 149–152** | `design.md` §9; `tasks.md` T-7 scope |
| C-3 | `design.md` §9's `Offtaker_Groundnuts` row reads "4 phone-in-type-column · **5** contaminated tail". The 4 phone-in-type rows **are** rows 149–152 — the same 4 rows, not 4 plus 5. Its `~141` net yield is derived from the double count | `design.md` §9 row, and §9.1's expected-yield chain if the total moves |
| C-4 | FR-1 must state **which** column count D-5 gates on (41 named or 55 physical), for QDS and as a general rule | `requirements.md` FR-1; `tasks.md` T-8 scope |

C-3 and C-4 both feed **T-10**, whose entire deliverable is a reconciliation that must close arithmetically. C-4 blocks T-8 outright.

### Finding 3 — the column-count denominator is wrong on five sheets, and it reopens T-7

Resolving C-4 required knowing whether unnamed columns hold data. They do, and not marginally. Fill rates measured over data rows:

| Sheet | Unnamed column | Filled | §3.1 column count |
|---|---|--:|--:|
| `Offtaker_Beans` | physical col 2 | **421/436 (97%)** | 16 |
| `Humantarian` | physical col 1 | **35/35 (100%)** | 9 |
| `Digital Service Provider` | physical col 1 | **13/13 (100%)** | 9 |
| `Seed Company` | physical col 12 · col 8 | 11/11 · 6/11 | 26 |
| `QDS_ Seed producers` | physical col 13 · col 19 | 305/311 (98%) · 108/311 | 55 (physical) / 41 named |
| `Offtaker_Sorghum` · `Offtaker_Groundnuts` · `Bulk buyers_beans` | — | none | complete as stated |

QDS additionally has physical columns 45-54 filled on 2-4 rows each — plausibly stray notes rather than columns, and a judgment T-8 must record either way.

**This reopens T-7.** Its `Offtaker_Beans` dispositions sum to 16/16 and were produced from a genuine full trace of all 436 rows — but the trace covered the **named** columns, because that is the universe `requirements.md` §3.1 defines. A column filled on 97% of rows is undocumented, which is precisely what FR-1's *"BUT NOT leave any column implicit"* forbids. `Offtaker_Sorghum` and `Offtaker_Groundnuts` are unaffected: both are complete at 13.

**This is D-6's warning arriving in its exact predicted form**, and worth recording precisely because the gate went green. The spec anticipated "the counts sum but a column's target was never checked". What happened is one level beneath that: the counts summed against a **denominator that omitted a data-bearing column**, so no per-column check could have surfaced it. Neither the Implementer nor an arithmetic gate could catch this — only re-deriving the column universe from the file could, which is what this pass did.

**C-4 is therefore not a choice between 41 and 55.** Neither is right: 41 omits 12 data-bearing columns, and 55 demands dispositions for 2 columns that are empty. The defensible rule, which also generalises to the other four sheets:

> D-5's denominator is **every column that carries a header name or contains data in any data row**. Columns that are physically present but both unnamed and empty are recorded once as sheet extent and are not dispositioned.

Under that rule the per-sheet denominators become: Beans **17**, Sorghum 13, Groundnuts 13, BBB 17, Humantarian **10**, DSP **10**, Seed Company **28**, QDS **53**.

This is a change to FR-1's acceptance criterion, not an implementation detail, so it is held for user approval with the rest of the pivot.

### Pivot applied — user approved all four corrections; the worker died after writing, before reporting

The Implementer dispatched to apply C-1…C-4 and finish T-7 **failed on a runtime condition, not a work condition**: `You've hit your session limit · resets 7:30pm (America/Bogota)`. It produced no completion report. The Leader therefore inspected the working tree directly rather than assuming either success or failure.

**Finding: the work is complete.** The agent finished every write and died before reporting. Verified by reading the diff and the artifact, not by trusting the absence of an error:

| Correction | Applied at | Verified |
|---|---|---|
| C-1 · blank ids 52 → 38 | `requirements.md` §3.1 (Sorghum 30→17, Groundnuts 7→6), §4 comparison row, **FR-2 acceptance criterion**; `design.md` §9 sizing, DD-9; `tasks.md` T-7 scope, coverage row | ✅ |
| C-2 · contaminated tail 147–151 → 149–152 | `design.md` §9; `tasks.md` T-7 scope | ✅ |
| C-3 · the 4-plus-5 double count | `design.md` §9.1 row corrected to 5 distinct rows (148 free-text type + 149–152 contaminated), **and the chain propagated**: sheet net ~141 → ~145, grand total ~748 → **~752**, carried into DD-8, `requirements.md` §3.1 total and assumption **A-2**, `tasks.md` T-10 scope and the FR-8 coverage row | ✅ |
| C-4 · FR-1 column-universe rule | `requirements.md` **FR-1 acceptance criteria** (the rule itself), §3.1 (new per-sheet denominator column), `mapping.md` §1.4, `tasks.md` T-7 and **T-8** scopes with all five denominators pre-computed | ✅ |

**Item E — `Offtaker_Beans` physical column 2 — resolved, and resolved on evidence.** The column holds sequential whole numbers `1…421`, equal to `(row − 1)` for every filled row, blank on exactly the 15 rows whose `Trader_id` is blank (423–437, the unfinished-entry tail). It is a **row-serial-number / auto-index column**: no name, contact value, or free text, and it carries nothing the physical row number does not already give. Disposed `DROPPED (redundant row-serial-number)` with that reasoning recorded in `mapping.md`, and explicitly ruled **not PII**.

`Offtaker_Beans` now reconciles **14 MAPPED + 1 DERIVED + 1 EMPTY-IN-SOURCE + 1 DROPPED = 17 = 17**. `Offtaker_Sorghum` and `Offtaker_Groundnuts` are unaffected at 13 each — neither has an unnamed data-bearing column.

`mapping.md` §5 additionally publishes the denominator table for all eight sheets, so T-8 inherits verified numbers rather than re-deriving them.

**Leader verification, run with the tree quiet:** `npm test -- normalize --silent` → **43/43 passed, 1 suite**. The doc↔constant assertion added by T-7 is green against the corrected document.

### T-7 status: complete but **not certified** — awaiting the independent Reviewer

T-7 stays `[~]`. Everything it owes is written and the Leader's own checks pass, but **no Reviewer has audited it**, and `author ≠ auditor` is not waived by a runtime failure — `/akili-execute`'s fallback table is explicit that the Reviewer role is never performed inline by the Leader.

**Resume point, for whoever picks this up:**

1. Spawn the Reviewer on the T-7 diff — `mapping.md` (new), `normalize.spec.ts` (+59), and the pivot edits to `requirements.md` / `design.md` / `tasks.md`. The pivot edits change **approved requirements**, so they deserve the same audit as the mapping itself; FR-1's new acceptance criterion and the ~752 chain are the two highest-value things to check.
2. On PASS: flip T-7 to `[x]` (evidence first, per the standing rule) and commit.
3. Then T-8, which is now fully unblocked and has its five denominators pre-computed in `mapping.md` §5 and `tasks.md`.

**Uncommitted at this point:** `mapping.md` (new), and modifications to `normalize.spec.ts`, `requirements.md`, `design.md`, `tasks.md`, `execution.md`. Nothing is staged. The work is intact in the working tree.

### T-7 attempt 1 — ❌ Reviewer FAIL, 3 issues (8 advisories)

The Reviewer cleared the things most likely to be wrong, and the clearances were argued rather than asserted:

- **NFR-9 clean.** No phone, email, contact-person name, individual producer name — or any organisation name — appears in `mapping.md`. Both contaminated registers are row-number only, each closed with an exhaustiveness statement. The hand-repair note describes *where* the real values sit without reproducing them.
- **D-6's disqualifier not triggered.** The Reviewer found four independent signals of a real trace: value-frequency tables closing exactly against data-row counts on all three sheets, fill counts at a granularity nobody invents, Groundnuts' 4 contaminated rows corroborated three mutually-agreeing ways, and — the strongest — `mapping.md` §2's "Sorghum contributes zero real districts" reconciling exactly with `design.md` §4.2's independently measured T-2 figure of 10 contaminated district cells (Sorghum 6 + Groundnuts 4). It also confirmed targets were checked semantically, citing `Town → marketLocation` while a `District` column exists, which is D-6's own worked example.
- **Beans column 2's `DROPPED` is the only defensible label**, since `EMPTY-IN-SOURCE` is defined as 0% filled and no canonical field accepts a source row serial.
- **The doc↔constant test is well built** — it parses only between explicit markers and asserts **both** directions, so neither a dropped row nor a swapped pairing can pass.
- C-1, C-2, C-4 land at every site; no stale figure survives outside "corrected from …" annotations; no section renumbered.

**FAIL 1 — the ~752 chain is still wrong, in the same way C-3 fixed.** `design.md` §9.1's `Offtaker_Sorghum` row quarantines `11 "Retaler" · 6 blank region · 7 contaminated tail` = 24. But `mapping.md` — the deliverable under review — states in two places that the **6 blank-`Region` rows are inside the 7-row contaminated register**, not beside it. The distinct set is `11 + 7 = 18`, so the sheet is ~97, not ~91. Six rows counted twice: structurally identical to the "4 phone-in-type + 5 contaminated" defect C-3 corrected one row above in the same table.

The Reviewer also flagged that §9.1's Beans row assumes a single quarantine while `mapping.md` newly measures a second (an `"Arusha/Dodoma"` value `normalizeRegion` refuses), and correctly declined to guess whether it is the same row as the blank-trader-type one.

**Leader measurement settling it:** they are **distinct rows** — the ambiguous region is row **425**, the blank trader type is row **436**. Beans therefore has 2 quarantines and nets **434**.

Re-derived chain, now closed on measurement rather than estimate:

`434 + 97 + 145 + 18 + 31 + 10 + 0 + 22 = **~757**`

**FAIL 2 — `mapping.md` §3.3 asserts a false statement about its sibling documents**, claiming they "still say 147–151". As of the pivot edits in this same change set they say 149–152, and per Finding 2 `requirements.md` never carried that range at all. A committed document asserting a state that is not the current state.

**FAIL 3 — FR-1's `EMPTY-IN-SOURCE` scenario has an unmet MUST clause.** The scenario requires stating that the canonical `Email` column is *therefore left blank for every beans row*; `mapping.md` records the 0/436 measurement and stops. `tasks.md` assigns that scenario wholly to T-7.

**Leader adjudication on ownership.** The Reviewer noted FAIL 1 may be cleaner as a pivot amendment (**C-5**) than a T-7 rework, since C-3 as approved was scoped to the Groundnuts row. Adjudicated as **in scope for this rework**: it is the same defect class the user already approved correcting, exposed by T-7's own trace, and the corrected figure is what T-10 will reconcile against. Extending an approved correction to a site the approved scope did not name is faithful to its intent, not new scope. Recorded as **C-5** so the amendment is visible as an amendment.

### T-7 attempt 2 — ❌ FAIL, one narrow issue (the three prior FAILs closed)

All three attempt-1 FAILs closed and independently re-verified: the ~752 chain re-derived to **~757** at all six propagation sites with no live stale citation, `mapping.md` §3.3's false claim replaced with a resolution marker, and FR-1's `EMPTY-IN-SOURCE` MUST clause satisfied. The Reviewer also confirmed `mapping.md` and `design.md` §9.1 now agree sheet-by-sheet — the disagreement that exposed the whole defect is gone.

**The one blocking item was in prose the fix itself introduced.** Resolving advisory A1 required declaring a convention for §9.1's pre-quarantine column, and the declared sentence listed **DD-11** among the "structural candidacy decisions already made elsewhere". But §9.1's own `Seed Company` row applies DD-11 as a quarantine *inside* the table. Applied literally the rule yields a pre-quarantine sum of **795**, contradicting the **806** the same table states two rows below — reintroducing precisely the mismatch the convention was written to remove.

The Reviewer's diagnosis was the useful part: DD-11 is not a candidacy decision at all. D-1, D-3 and DD-6 each remove rows from candidacy (249 individuals, 3 foreign actors, the 289-312 tail); DD-11 removes none — it quarantines 11 candidates *pending* the AT-team region pass meant to unblock them. The table was right; the parenthetical was wrong.

### T-7 attempt 3 — ✅ **PASS**

Three text edits, no figure permitted to move. Took the carve-out option rather than striking `DD-11`, so the distinction is taught in place instead of hidden:

> …(D-1, D-3, DD-6) — **DD-11 excepted**: its 11 `Seed Company` rows stay in the pre-quarantine count as candidates, because DD-11 quarantines them pending the AT-team region pass rather than removing them from candidacy, so this table records that exclusion in its own quarantine column…

Also folded in two advisories of the same defect class: rows **425** and **436** were added to `mapping.md` §3.1 (so `design.md` §9.1's C-5 attribution became true as written, rather than citing row numbers only the Leader's measurement held), and one present-tense stale-state verb was corrected.

**Reviewer verification, done from the file rather than from the report:**

- The carve-out **does necessary work** — without it the convention could be read as absorbing DD-11, netting `Seed Company` to 0 before the table and dropping the column to 795. Applied literally it now produces exactly the printed table.
- The amended sentence **describes all four decisions correctly**, checked against each decision's own source text (`requirements.md:86`, `:88`; `design.md:335`, `:372`), and agrees with `requirements.md` §3.1's independent "11 candidates → 0 net".
- Both columns re-derived **from the file**: pre-quarantine **806**, nets **757**, every per-sheet figure unchanged. The attempt's one hard constraint held.
- NFR-9 still clean: `425` and `436` are 3-digit ordinals that cannot match the D-7 gate pattern, and physical row numbers are the identification form DD-5 and FR-2 *require*.

**Leader verification, tree quiet:** `npm test -- normalize --silent` → **43/43 passed**. `git status` shows only the six expected paths. The four surviving `~752`/`~748` occurrences are all "corrected from …" history, as the Reviewer independently found.

#### What T-7 delivered

| Artifact | Content |
|---|---|
| `mapping.md` (new) | Structure per `design.md` §4.5; the published 28-row district→region table; complete per-column dispositions for `Offtaker_Beans` (**17**), `Offtaker_Sorghum` (13), `Offtaker_Groundnuts` (13); the 38-blank-id positional keys; the 2 intra-sheet duplicates; the `"Retaler"` quarantine decision; the 4 phone-in-trader-type rows; `Beans.Email` as `EMPTY-IN-SOURCE` with its consequence stated; both contaminated registers **by row number only**; and §5's denominator table for all eight sheets, which T-8 inherits |
| `normalize.spec.ts` | The doc↔constant test — parses only between explicit markers and asserts **both** directions, so neither a dropped row nor a swapped pairing can pass |
| `requirements.md` · `design.md` · `tasks.md` | Corrections C-1…C-5 under the user-approved pivot |

#### Requirements covered — and what remains ungated

FR-1 (all clauses and both scenarios), FR-2's blank-id/duplicate/physical-row clauses, FR-3's OFG derivation, FR-4's column-driven typing and the `"Retaler"` decision, NFR-9.

**Still ungated, by design (`design.md` §12.1):** whether each column maps to the *right* canonical field (D-6 — the arithmetic gate cannot see it; discharged here by a full cell-by-cell trace of 436/115/150 rows, which is evidence, not a gate), district→region *correctness*, and key determinism across mapping runs.

#### Attempt-3 advisories (recorded, non-gating, not tasks)

| # | Finding |
|---|---|
| A-11 | Two more present-tense stale-state assertions survive in `mapping.md` (lines 235 and 316: "cite" for states now corrected). Each sits directly above its own explicit resolution sentence, so no reader is misled; one verb each would close them |
| A-12 | §9.1's convention sentence is correct but its "after X … and before Y" frame is now split by a ~50-word carve-out. Splitting it into two sentences would restore scannability without changing the rule |
| A-13 | **Pre-existing and outside T-7's scope:** `design.md` §7 still sizes the PII exposure against a "retained ~795-record set", a figure the C-3/C-5 chain moved to ~757. C-5's propagation list did not include §7. The derived values there (~750 phones, ~43 emails, echoed in R-2) are proportional estimates that gate nothing. Belongs to whoever next touches §7 or T-10 |

---

### T-8 — `mapping.md`, the five remaining sheets

**Status: IN REWORK — attempt 1 ❌ FAIL (2 of 3 lens Reviewers), attempt 2 dispatched.** Date: 2026-08-05.

**Leader delegation decisions.** Effort **xhigh** (118 columns, no correctness gate, irreversible keys, an NFR-9 disqualifier this spec has already tripped once). Not `max`: the Implementer is T2/`sonnet` and the tier↔effort rule forbids `max` on a cheaper tier; escalating the tier would have collided with the `opus`-bound Reviewer and broken `author ≠ auditor`. Skills: **`cognitive-doc-design` only** — `product-manager-toolkit` was dropped from the task's listed set because T-8 authors no requirements and `design.md` §4.5 is already the format authority (deviation recorded per `.agents/leader.md`). Review mode: **parallel lens Reviewers** (xhigh + PII/data-loss surface), three lenses — conformance, NFR-9/fidelity, and the §8 findings block.

**Not split.** `design.md` §13's watch item authorizes a per-sheet-group split of the `mapping.md` task. Held in reserve rather than applied pre-emptively: a split costs a `tasks.md` decomposition change and is the right response to a failure, not a prediction of one. Attempt 1 returned all five sheets with correct arithmetic, so the single-unit dispatch was sound.

#### Runtime failures — four dead workers, zero consumed attempts

The first Reviewer round died on `API Error: Connection closed mid-response`; a retry and the two sibling lenses then died together on `ENOTFOUND`. These are **environment blockers, not work FAILs** (`/akili-execute` runtime-failure fallback), and none consumed a rework attempt. Connectivity was verified restored (DNS + API reachable) and the working tree confirmed intact before re-dispatch. **The Reviewer was never inlined** — the fallback table forbids it, because the Leader auditing work it supervised breaks `author ≠ auditor`, and an infrastructure outage does not suspend a correctness constraint. All three lenses then completed but went idle without transmitting; each was queried directly, with an explicit instruction to report an incomplete audit honestly rather than reconstruct a verdict. All three confirmed the analysis had completed and the failure was transmission only.

#### Attempt 1 — Implementer report

`mapping.md` §4 (all five sheets authored, replacing the skeleton), §5 (reconciliation updated, all 8 sheets ✅), §7.1 (verification recorded), §8 (new — findings). No other file touched. Cell-by-cell trace claimed over all five sheets in full: 166+35+13+11+311 = **536 rows**.

| Sheet | Denominator | Dispositions | Sum |
|---|--:|---|---|
| `Bulk buyers_beans` | 17 | 6 MAPPED + 11 DROPPED | 17 ✅ |
| `Humantarian` | 10 | 6 MAPPED + 4 DROPPED | 10 ✅ |
| `Digital Service Provider` | 10 | 5 MAPPED + 4 DROPPED + 1 EMPTY-IN-SOURCE | 10 ✅ |
| `Seed Company` | 28 | 5 MAPPED + 1 DERIVED + 15 DROPPED + 7 EMPTY-IN-SOURCE | 28 ✅ |
| `QDS_ Seed producers` | 53 | 7 MAPPED + 2 DERIVED + 44 DROPPED | 53 ✅ |

**`design.md` DD-1's residual — resolved.** All 31 non-ambiguous `Humantarian` `Location` values are exact `CANONICAL_REGIONS` members; none are district-level. `DISTRICT_TO_REGION` needs no entry, §2's table is unchanged, and DD-1 closes at **3 contributing sheets**. DD-1's separate 2-row residual stays open.

**NFR-9 near-miss, self-caught.** The Implementer's first draft of the `Seed Company` disposition table quoted a real multi-number phone cell verbatim from the workbook, and redacted it before reporting. **Leader independent verification:** the D-7 gate returns clean, and because D-7's pattern covers only mobile prefixes (`6`/`7`), a wider scan was run over every digit run and `@`-token in the 355 new lines — all are arithmetic, dates, or documented synthetic fixtures. Nothing real survives. Recorded because the near-miss, not the catch, is the signal: this spec has now reached for a real value twice (`proposal.md` OQ-1 being the first).

#### Attempt 1 — Reviewer verdicts

| Lens | Verdict |
|---|---|
| Spec conformance + clause coverage | ❌ **FAIL** — 4 issues, 6 advisories |
| NFR-9 / measurement fidelity | ❌ **FAIL** — 2 issues (1 convergent), 9 advisories. **PII containment CLEAN** |
| §8 findings block + document reliability | ✅ **PASS** — 7 advisories |

**Cleared, argued rather than asserted:**

- **NFR-9 containment clean.** The QDS `cbo` hand-classification names rows only; its stated rationale narrows the name space by nothing — no initial, word count, language, or translation. Every organisation name in the new content was checked individually and each is a research institute or agency, permitted by DD-7. The reviewer re-ran the D-7 gate independently.
- **All five denominators re-derived by two Reviewers independently**, by counting the tables rather than trusting the report. Physical-extent arithmetic closes separately (SDC 30−2, QDS 55−2, BBB 19−2, HUM 12−2).
- **Disjointness verified set-wise** — the T-7 FAIL-1 defect class. BBB 14+4+8=26 checked element by element; QDS dedup-removed {19,25,26} and personal-name {2,4,8,20,23} are disjoint with all five inside the retained 23; DSP partitions 13 rows into 2+8+3 with the D-3 exclusions held outside the row arithmetic. **The trap T-7 fell into twice is handled correctly here.**
- **Eleven sibling-document quotations verified true at source** (T-7 FAIL-2 class).
- **The "gates green" disqualifier is not triggered** — §7.1 labels the green `normalize` suite a regression guard, not evidence of mapping correctness.

**FAIL issues carried into attempt 2** (full Reviewer text passed to the Implementer unchanged, per the Structured Feedback rule):

1. §4's intro says "three" findings, §8's says "four", §8 has **five**. Internal contradiction in the block whose authority rests on counting carefully.
2. **FR-1's forward-fill scenario, clause 3 unmet** — the per-block year-metric **rows** are never recorded as `DROPPED (trade metrics — epic §6)`; only the columns are, and the 140-row figure appears nowhere. Same omission shape as T-7's FAIL 3 (measurement recorded, trailing MUST clause dropped). KZ-001 binds.
3. **261 vs 249 QDS individuals** — §4.5 records 261 physical rows; FR-10 and §3.1 say 249. Almost certainly physical-rows vs distinct-names, but unstated, and unreported in §8 while every *smaller* divergence was reported. T-10 would inherit the ambiguity.
4. **Stale Status header** — line 5 still declares §4 "pending T-8 — headers only" in the change set that authored it; line 6 points only at §6 now that §8 exists; line 4's `Traces:` omits FR-10, DD-6, DD-10, DD-11. **Flagged independently by both FAILing lenses** — the strongest signal in the batch, and precisely the stale-present-tense class T-7 FAILed on.
5. **§4.4's `Contact name` disposition contradicts both OQ-1 and its own closing line** — it reads as asserting a phone number sits in a name column, which would be a DD-5 contamination the same paragraph says does not exist. Both cannot stand.

One advisory-origin item was folded into the rework brief, explicitly labeled non-gating: `design.md` §12's FR-10 coverage row holds `mapping.md` to *stating* the blank-`producer_category` rule, which §4.5 records only as a row-specific observation — leaving a refreshed workbook's blank row with no stated disposition (R-5). No figure moves.

#### §8's findings — independently verified, and the basis of a pending pivot

The findings lens returned **PASS** on the block itself. Verified: `434+97+145+18+31+10+0+22 = 757` matches `design.md:276` verbatim; the corrected `434+97+145+18+31+8+0+18 = 751`; deltas −2 (DSP) and −4 (QDS). **The 806 pre-quarantine ceiling is unaffected** — both changed cells are net-column only — so assumption **A-2**'s ±5% tolerance survives (751 is 0.8% off 757).

Finding 8.4 was audited specifically against KZ-001 and **does not discharge a required clause by citing a different one**: it does not claim FR-10's blank-category mandate is inapplicable, it observes that the mandate's only instance in this workbook (row 312) is *also* caught by FR-10's rows-289–312 exclusion, so `design.md` §9.1 subtracted a row from a set the row was never in. **That is T-7's FAIL-1 defect being identified, not committed.**

Corroboration available without the workbook: BBB's 12 `…AMCOs` identity rows are exactly the union of §4.1's 4 district-rescued and 8 quarantined rows — the AMCOs are precisely the 12 blocks with no region on the identity row.

**Pending user decision.** The amendment surface is larger than §8 cites — live sites for the 757 chain at `design.md:274`, `:276`, `:280`, `:351`, `requirements.md:45`, `:386`, `tasks.md:210`; per-sheet cells at `design.md:271`, `:273`, `requirements.md:42`, `:44` (which use a `candidates → net` form and must be extended, not overwritten); a second live "15 AMCOs" at `design.md:311` and `:383`; a second "7 of 11 GPS" at `requirements.md:170`. **`design.md` DD-1's closure is absent from §8** — being an agreement rather than a contradiction — so an amendment drafted from §8 alone would leave DD-1 pointing at a finished task. Added to the adjudication list by Leader.

#### Pivot Record: T-8 — user approved the full amendment (2026-08-05)

**Decision: option 1 — amend now, in full.** All five §8 findings plus `design.md` DD-1's closure propagate into `requirements.md`, `design.md`, and `tasks.md`, recorded as corrections **C-6…C-13** in the shape of T-7's approved C-1…C-5. *(Range corrected from "C-6…C-11" — a Leader labelling error caught by the amendment's Reviewer. The approved **scope** is unchanged and always included both items the extra IDs cover: DD-1's closure is **C-12** and `design.md` §7's stale ~795 PII sizing is **C-13**, both named in the amendment-surface paragraph below when the user approved it. Only the label was short.)* Rationale accepted: T-10's entire deliverable is reconciliation arithmetic against `design.md` §9.1, and T-9's runbook is written against the same figures — opening either against a known-wrong 757 guarantees rework, and the correction would then land with no approval gate of its own.

**Sequenced after T-8's rework, deliberately.** The amendment is *not* dispatched concurrently with the in-flight rework attempt 2, despite touching a disjoint file set. Conformance FAIL 3 (261 physical rows vs FR-10's 249 distinct names) may resolve into a **sixth §8 finding**, and an amendment drafted from the current §8 would then be incomplete at exactly the point this pivot exists to fix. The correction list is finalized against the **post-rework** §8, not the present one.

**Amendment surface — mapped, and larger than §8 cites.** Yield chain: `design.md:274`, `:276`, `:280`, `:351` (DD-8); `requirements.md:45`, `:386` (A-2); `tasks.md:210`. Per-sheet cells `design.md:271`, `:273` and `requirements.md:42`, `:44` take the **`candidates → net` form** (`10 → 8 net`, `~23 → 18 net`) rather than being overwritten, matching how §3.1 already renders `Seed Company`. Second live sites §8 does not cite: "15 AMCOs" at `design.md:311` and `:383` (F-3); "7 of 11 have GPS" at `requirements.md:170` (FR-3). The `~23` mentions at `requirements.md:58`, `:86`, `:281` are **candidate** counts and stay. `judgment.md` is a frozen record and is not amended. **`design.md` §7's ~795-record PII sizing (advisory A-13 from T-7) is now in scope** — the C-3/C-5 chain moved it to ~757 and this pivot moves it again.

#### T-8 attempt 2 — ✅ **PASS** (both re-audited lenses)

Eight discrete edits, 62 lines, `mapping.md` only. **No figure moved** — verified three ways: the Implementer's own spot-check, the Leader's inline grep for both yield chains and the `17+10+10+28+53` denominator sum, and both Reviewers re-deriving the partitions from the file.

| Lens | Verdict |
|---|---|
| Spec conformance + clause coverage | ✅ **PASS** — 3 advisories |
| NFR-9 / measurement fidelity | ✅ **PASS** — 4 advisories |

**The five FAIL closures, as verified rather than as reported:**

1. **§4/§8 item-count contradiction** — both counts removed; a grep for any residual `(three|four|five) (items|findings|places|disagreements)` returns nothing.
2. **FR-1 forward-fill clause 3** — `mapping.md` now records the **140** non-identity year-metric rows (166−26) with `requirements.md:125`'s disposition string reproduced **verbatim, parenthetical included**, at the clause's own site. The FR-8 cross-reference was checked at source rather than accepted: `requirements.md:253` defines exactly four buckets and there is no `dropped` bucket, so the 140 rows can only land in `collapsed-into-block`. The note is a real disambiguation of two vocabularies, not a hedge.
3. **261 vs 249** — cleared on three independent grounds, and **correctly not a sixth §8 finding**. `requirements.md:44` and `:86` both frame 249 as a share of **distinct names** ("249 of 292"), so the by-name reading is textually established, not invented to close a gap. The collapse arithmetic closes under *both* admissible readings of the tail (12+3+4, or 12+3+3+1 via the row-23 cross-block name collision), and the document's hedged "is consistent with" is the correct strength for a claim it did not measure. A finding is warranted when measurement **contradicts** the draft; here measurement and draft are compatible under a stated unit convention, and elevating a unit difference to a finding would have *misreported* it as a disagreement.
4. **Stale front matter** — `:5`/`:6`/`:4` now true, corroborated inside the document by §5's 8-sheet table. No fresh over-claim: both new paragraphs are explicitly version-scoped ("in *this* workbook version"), the opposite of the failure mode.
5. **§4.4 `Contact name`** — the rewrite matches `requirements.md:392` and `proposal.md:46` at source. The contradiction with "No contaminated-row register" is gone **structurally**: a person's name in a column headed `Contact name` is not a column shift, so there is nothing to register. Resolving this without re-opening the workbook was legitimate *here specifically* because the rewritten sentence is no longer a claim about a cell — it is a claim about what two sibling documents say, and both say it. Had any assertion about cell contents survived, the re-check would have been mandatory.

**NFR-9 — clean, independently re-established.** The PII Reviewer ran its own digit/email scan (not inheriting the Leader's) and confirmed the 58 synthetic-fixture occurrences across 12 files in `backend/src` are real test data. Attempt 2's only row citation is **312**, already present in §4.5's selection table — no new identification. The `cbo` hand-classification (rows 2, 4, 8, 20, 23) is untouched and row-number-only.

**On the §4.4 identification question, argued rather than waived:** the new sentence names no one, cites no row, and does not narrow to one row among 11. Measured against what a reader already holds, `requirements.md` §10 OQ-1 states the same fact *and* names the three `proposal.md` line numbers that carried the redacted values — a strictly sharper pointer into git history than anything `mapping.md` adds. The Reviewer recorded that it would have FAILed the sentence had it narrowed to a row, or had it been placed where it could be triangulated against the adjacent multi-number-cell reference.

**§8 integrity confirmed against the diff, not by reading alone:** attempt 2 touched §8 at exactly one line — the intro's count word. §8.1–§8.5 are byte-identical. **The amendment basis is safe.**

#### Advisories (recorded, non-gating, and per `/akili-execute` they do not become tasks)

| # | Finding |
|---|---|
| A-14 | `Traces:` (`:4`) is now correct but still incomplete — the body cites FR-5, FR-6 and (new this attempt) FR-8. Consistent with the line listing primary traces since T-7; nothing listed is false |
| A-15 | §4.4's OQ-1 clause is **not load-bearing** — the disposition already stands on "would create a new PII surface". It is a third restatement of a disclosure `requirements.md` §10 OQ-1 and `proposal.md` §46 make more precisely. Deleting it is the cheapest safe form; keeping it is defensible, which is why this is advisory |
| A-16 | "**the** contact named in this column" uses a definite article over an 11-row column; "a contact" is the accurate form |
| A-17 | §4.1 and §4.5 state what `reconciliation.md` "buckets" / "uses" in the present tense, but that document does not exist yet. Sound inferences from FR-8, but they are prescriptions on a future task — either hold T-10 to them or soften the tense |
| A-18 | The **249 by-name figure remains inherited, not independently measured.** T-10 should measure `distinct(individual names)` during its row-level accounting rather than assume it — the measurement that converts consistency into confirmation |

#### Carried into T-9 / T-10 briefs (not gaps in T-8)

- **T-10 must satisfy 261 and 249 in different units**: `requirements.md:258` requires each sheet's four buckets to sum to its physical row count (311 for QDS), so the `excluded` bucket carries **261**; `requirements.md:261` separately requires the **249** excluded individuals and 3 foreign actors be recorded as *decisions* citing D-1 and D-3. Both, not either.
- A-17's present-tense prescriptions on `reconciliation.md` are now commitments T-10 inherits.

#### Verification (final)

| Check | Command | Result |
|---|---|---|
| Doc↔constant regression guard | `cd backend && npm test -- normalize --silent` | **PASS**, 43/43 |
| NFR-9 grep gate | `requirements.md` §9 D-7's command | **Clean** — documented synthetic fixtures only; re-run independently by the Leader and by the PII Reviewer |
| Per-sheet column arithmetic | Manual, shown in §4.1–§4.5 and §5 | **17 / 10 / 10 / 28 / 53**, all closing; 118 total |

**Not offered as evidence of mapping correctness** — per `tasks.md` T-8's own disqualifier, this task has no correctness gate. What remains unverified is `design.md` §12.1's uncoverable set: whether each column landed on the semantically right canonical field (D-6/R-1), whether each trader-type assignment is factually correct, and whether the QDS hand-classification is right. **No Reviewer could open the workbook** (the wrapper grants `Read`/`Grep`/`Glob` only), so every workbook-sourced figure rests on the Implementer's full-sheet trace of 536 rows and on internal consistency across five denominators, four disjointness partitions, and every sibling-document citation checked at source.

#### Pivot amendment C-6…C-13 — applied, reviewed, ✅ **PASS on attempt 2**

**Files:** `requirements.md`, `design.md`, `tasks.md` (the corrections) + `mapping.md` (resolution markers). `judgment.md` untouched — it is a frozen historical record. No code touched.

**Attempt 1 — ❌ FAIL, one issue.** An independent Reviewer cleared both invariants, the arithmetic, C-13's rescale, and every second-site propagation, and FAILed on a single orphan: `mapping.md` §4.1 still read *"`requirements.md` §10 states **15**"* and framed it as a live discrepancy, 358 lines from the §8.1 marker that resolved it. Every other falsified quotation was covered; this was the sole site of its class left uncovered.

**Attempt 2 — ✅ PASS.** The marker was added in the established form, and it keeps two things distinct that were easy to conflate: the **count** discrepancy (15 → 12) is resolved, while **OQ-4's taxonomy question** (`bulk_buyer` vs `cooperative`) remains genuinely open per DD-2's interim default. Marking the whole paragraph resolved would have silently settled an open question — precisely what `tasks.md` T-8 forbids ("OQ-4 is flagged, not silently settled").

**Verification discipline, stated rather than implied:** attempt 2's delta was **one marker, at the line the Reviewer named, in the text the Reviewer dictated**. The Leader verified it inline — the marker is present, its content matches, OQ-4's open question survives beside it, and a diff of the two states confirms nothing else changed. **A second full audit was not run for that single marker**, on proportionality. Everything else in this amendment carries a genuine independent PASS.

#### Two Leader errors in this amendment, recorded rather than quietly fixed

1. **The `mapping.md` staleness was a briefing error.** The amendment brief said *"do not touch `mapping.md`"* — correct while §8 was being used as the drafting authority, and wrong the moment the corrections landed, because `mapping.md`'s claims about its siblings were falsified by the very edits it authorized. Caught by the Leader's own post-amendment verification, before review. **The general lesson: when a document records "the sibling says X", correcting the sibling is not the end of the change — it is the middle of it.**
2. **The correction-ID range was mislabelled.** Recorded and reported as "C-6…C-11" when the approved scope contained **eight** items. The scope was never short — DD-1's closure (**C-12**) and `design.md` §7's stale ~795 PII sizing (**C-13**) were both named in the amendment-surface paragraph the user approved. Only the label was. Caught by the amendment's Reviewer; corrected in this file and in `tasks.md` with the reason visible.

#### Invariants — verified independently by the Leader, not accepted on report

| Invariant | Result |
|---|---|
| `806` pre-quarantine ceiling untouched | ✅ No diff line moves it; `436+115+150+26+35+10+11+23 = 806` still closes. Both changed cells are net-column-only |
| A-2's ±5% tolerance survives | ✅ 751 vs 757 is 0.8% |
| Per-sheet cells use `candidates → net`, not overwrite | ✅ `10 candidates → 8 net`, `~23 candidates → 18 net`, matching §3.1's pre-existing `11 candidates → 0 net` |
| Chain re-derives | ✅ `434 + 97 + 145 + 18 + 31 + 8 + 0 + 18 = 751` |
| Superseded figures legible, not rewritten | ✅ 11 `Resolved 2026-08-05` markers; every surviving `757`/`752`/`748`/`795`/`71`/`15`/`7 of 11` is a "corrected from …" annotation |
| Candidate counts unchanged | ✅ `requirements.md`'s `~23` in §3.1's count-correction note, D-1, and FR-10 are candidate figures and stay |
| Gates | ✅ `npm test -- normalize --silent` 43/43 · NFR-9 D-7 clean · wide digit/email scan returns only arithmetic, dates, counts |

**Extra live sites found during the work, beyond the Leader's mapped surface:** `design.md` §9's findings-table row (a fourth C-11 site) and `mapping.md` §4.5's "reported in §8 and not resolved here" sentence, which its own resolution falsified. Both found by the Implementer verifying line by line rather than working the list — the behavior the brief asked for.

#### Advisories (recorded, non-gating)

| # | Finding |
|---|---|
| A-19 | `requirements.md:88` (D-3's consequence) says "DSP yields 10, not 13" and `design.md:280` says §3.1 "already **nets** DSP to 10". Under the new rendering 10 is DSP's *candidate* count and 8 its net. Both are defensible as descriptions of D-3's own effect, but they use yield vocabulary for a candidacy figure |
| A-20 | `mapping.md` §8's intro still says the findings "are reported here for the Leader to adjudicate"; covered by the section-closing marker that quotes and supersedes the identical closing sentence, but weaker than a marker at the intro itself |

**Still true after this amendment:** every figure it moved rests on measurement **no Reviewer could verify** — the wrappers grant `Read`/`Grep`/`Glob` and cannot open the workbook. `mapping.md` §8 is the accepted authority, itself verified for internal consistency and sibling fidelity rather than for measurement truth. `design.md` §12.1's uncoverable set is unchanged by any of this.

---

### T-9 — Author the re-run runbook

**Status: ✅ PASS on attempt 2 of 3.** Date: 2026-08-05. Effort `high` → `xhigh` on rework. Skills: `cognitive-doc-design`. Review mode: single lens (checklist), one Reviewer, `opus` — author ≠ auditor held.

**Files:** `runbook.md` (new). No other file, no code.

#### Attempt 1 — ❌ FAIL, 3 issues. The five clauses were fine; the procedure was fiction.

The Reviewer cleared all five `design.md` §4.6 MUST clauses (preview-writes-nothing appeared at four independent sites) and all three disqualifiers, then failed the document on **FR-9's actual bar — "a competent AT team member can follow this without reading the spec or the source code."**

1. **The preview/commit procedure described a UI that does not exist.** The runbook said to upload each file twice and "choose commit". The shipped page has **no mode selector and no second upload**: `processFile()` fires preview automatically on selection, and the commit is an **"Import N actors"** button the runbook never named. An operator following step 5 literally would re-select the file, trigger *another preview*, and loop.
2. **The metrics check demanded a pre-commit baseline the runbook never had the operator record.** By step 6 the baseline was unrecoverable, so the natural failure mode was glancing at a plausible number and recording a pass. `design.md` §7.1 makes the comparison the mechanism, not a detail.
3. **The public-detail check was unreachable** — it asked for "the id of one record you just committed" without saying that this is the **internal database id**, not the `traderId` the operator built (`OFB-1036`), and without giving the `/profile?id=` route. An operator would use the Trader ID, get a 404 for the wrong reason, and record a **false pass on the one check whose purpose is catching a leak**.

**Why this is the most valuable review of this spec's execution:** the document was *correct* — every clause present, every figure right — and **unusable**. Only a Reviewer that opened `import/page.tsx` instead of re-reading the spec could tell the difference. Clause-completeness and executability are different properties, and T-9's gate is the second one.

#### Attempt 2 — ✅ PASS

Rewritten against the real screens (`import/page.tsx`, `MetricsBand.tsx`, `profile/page.tsx`, the admin actors list). Quick path grew 7 → 8 steps with **"Record the pre-commit baseline"** inserted *before* the commit.

**The Reviewer verified each closure against source, not against the report:**

- Preview fires automatically (`processFile` → `importActors(picked, 'preview')`), reached from both picker and drop handler; **no mode selector exists in the file**. Commit is `` `Import ${toCreate} actor${toCreate === 1 ? '' : 's'}` `` inside the "Review and confirm" section, committing the **same in-memory file** — so the runbook's "the system never asks you to upload it a second time" is *literally* true, not a paraphrase.
- **The baseline is semantically the right comparison, not just obtainable.** `metrics.service.ts` pins `consentStatus: GRANTED` in its `WHERE`, so an import landing every row `UNKNOWN` **must** leave "Actors mapped" untouched. That is what makes "same as the baseline" a real assertion rather than a tautology.
- **The Trader-ID trap is named where it bites.** The post-commit table renders `row.traderId` only and never `actorId`, so `OFB-1036` is exactly what an operator would reach for — and the warning sits in the same sentence as the id lookup, not in a distant note.
- Quick path 1–8 maps one-to-one onto detailed steps 1–8; nothing orphaned or doubled by the insertion.

**Regression — all clear after a rewrite that touched most of the document.** Five MUST clauses intact; all three disqualifiers clear (no `/actors/geo`, no `/export`, three `GRANTED` mentions all prohibitions, the check still explicitly manual); endpoint, bounds and `v2` re-download intact; `mapping.md` §3/§4 citations still resolve. **The reworded public surfaces still map to exactly three and no others:** Directory list → `GET /api/v1/actors`, `/profile?id=` → `/actors/:id`, home metrics band → `/metrics`.

**A design property surfaced by this review, worth recording:** the shipped UI **structurally enforces preview-before-commit** — the commit reuses the exact previewed `File` and there is no path to commit an unpreviewed file. That is a **stronger** guarantee than `design.md` §4.6 item 1 asks for: the spec's most safety-critical operational rule is enforced by the product, not by operator discipline.

**A false claim that did not leak.** Attempt 1's report asserted "`mapping.md` has no §5" — false; §5 is "Column-count reconciliation — all 8 sheets". The Reviewer confirmed the error stayed in the *report* and never reached the deliverable, which makes no §5 reference at all.

#### Advisories (recorded, non-gating; per `/akili-execute` they do not become tasks)

| # | Finding |
|---|---|
| A-21 | Step 6 overstates the commit screen: `FailureBreakdown` renders **only in the preview branch**; the result branch shows the live summary, `TotalsChips` and the per-row table, with no aggregate breakdown (as `design.md` §5 intends). The "count doesn't match" troubleshooting row therefore sends the operator post-commit to a panel that is not there. Honest wording: read and record the breakdown **at preview time** |
| A-22 | Two surfaces are described but not named — the public actor list is the **Directory** page and the Admin import page is reached from the **Import** button on `/admin/actors`. Related: the Admin actors list has **no free-text search** (region/traderType/consent filters only, sorted by `traderName`), so "find one record you just committed" among ~750 means filtering or paging alphabetically — an operator will expect a search box |
| A-23 | The `Seed Company` row correctly says 0 created is expected (DD-11), but **the screen will contradict it**: with `toCreate === 0` the commit button is disabled and the page reads *"No rows are eligible to import. Fix the file and upload again."* The runbook says "nothing to do" while the screen says fix the file. Also "its location columns hold no data at all" is slightly strong — lat/long are 6/11 filled; it is the **region/district** column that is empty and drives the quarantine |

**A-21 and A-23 describe the screen contradicting the runbook**, which is FR-9's own subject matter. The Reviewer classified both as non-blocking one-sentence fixes and they are recorded here rather than actioned, per the advisory rule. Flagged to the user as a candidate follow-up.

---

### T-10 — `reconciliation.md`, skeleton with expected counts

**Status: ✅ PASS on attempt 2 of 3.** Date: 2026-08-05. Effort `xhigh`. Skills: `cognitive-doc-design`. Review mode: single lens, one Reviewer, `opus` — author ≠ auditor held.

**Files:** `reconciliation.md` (new). No other file, no code.

#### Scope completed in two passes, the second under an extended workbook grant

The first pass built the document from recorded figures and correctly **reported two gaps rather than fabricating**: `mapping.md` never enumerated `Offtaker_Sorghum`'s 11 `"Retaler"` quarantine rows, and neither `mapping.md` nor `design.md` enumerated DD-7's cross-sheet duplicate list. **Both gaps were a Leader briefing error** — the brief forbade opening the workbook, while FR-8 requires enumerating every quarantined and excluded row and DD-7 requires the duplicate list *by organisation name and row*. Neither dataset existed in the repository. Access was granted for exactly those gaps (and later extended once more, see the FAIL below). **Reporting rather than inventing was the correct behavior and was not charged as a rework attempt.**

#### F-1 and F-2 — measured

- **F-1:** the 11 `"Retaler"` rows are **2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17**, and are **provably disjoint** from the 7-row contaminated tail (110–116). This **independently confirms correction C-5**'s `11 + 7 = 18` distinct OFS quarantines. No pivot triggered.
- **F-2 — a new sibling contradiction: 11 duplicate groups / 24 records, not `design.md`'s 8 / 18.** Reported, not adopted. The finding's force is that it was **always detectable without the workbook**: `mapping.md` §4.5 already stated in prose that the QDS tail *"repeats all 11 `Seed Company` organisations verbatim"* — eleven, sitting beside an estimate of eight, unreconciled. The Reviewer added a corroboration the document did not claim: **18 records over 8 groups requires exactly two 3-sheet groups, and the measurement found exactly two** — the estimate's shape survived; only its pair count was short. Two further low-confidence pairs were correctly held *outside* the count. **Operationally material:** two groups (3-sheet) mean that once `Seed Company`'s DD-11 quarantine lifts, **each risks two live actors for one real organisation** — precisely what DD-7 exists to prevent, now identified by name and row *before* the run.

#### Attempt 1 — ❌ FAIL, one issue

**The 261 QDS `individual` rows — 21% of the workbook — were the only members of a non-`imported`, non-`collapsed` bucket never named by row number, and the document contradicted its own §1 in declining.** §4.8 argued FR-8's *"record the 249 as a decision"* clause substituted for the enumeration clause. It does not: FR-8's C-13 clarification carves out exactly **two** buckets as count-only — `imported` and `collapsed-into-block` — and `excluded` is not one of them. The clauses are joined by AND. **This is the KZ-001 failure mode** — discharging a required clause by citing a different satisfied one — and it landed on the single place where the document's answer to *"are all source rows accounted for?"* was weaker than its own promise.

#### Attempt 2 — ✅ PASS

**The fix exceeded the Reviewer's own remedy.** The Reviewer proposed *deriving* the range (28–288) from contiguity and labelling it derived-not-measured. The Leader instead extended the existing workbook grant so it could be **measured**: `producer_category` read across QDS rows 2–312 → a **single contiguous block, rows 28–288 (261 rows)**, 259 `individual` + 2 `individuals`. This **confirms `requirements.md` §3.1's "sorted by category"** exactly, so no non-contiguity finding arises. A derived range would have carried a caveat into the document the program lead reads; a measured one does not.

The Reviewer verified the range is **arithmetically forced** even without the workbook: the tail is 289–312, every cited `cbo` row falls in 2–26, so `311 − 261 − 24 = 26` leaves only one possible contiguous block. Independent confirmation of a measurement it could not take.

**Every identity closes from the file itself:** `288−28+1 = 261` · `26+261+24 = 311` · `290 = 261+24+5` · `806−50−5 = 751` · all eight sheets closing · both axes at **1,237**.

**The 751 agreement is not bookkeeping made to match.** Per-sheet `imported` values (434, 97, 145, 18, 31, 8, 0, 18) match `design.md` §9.1's amended net **sheet by sheet**, not merely in total.

**The 806→751 bridge survived the check that mattered.** The Leader challenged its reasoning rather than its arithmetic — DSP's 3 foreign exclusions also sit in the `excluded` bucket, so "the 5 personal-name exclusions are the only un-netted reason" had to be tested. It holds: `design.md` §9.1's convention nets D-1, D-3 and DD-6 out *before* 806 (which is why DSP enters at 10, not 13, and QDS at ~23), **DD-11 excepted** — so the 50 correctly absorbs `Seed Company`'s 11, and the 5 personal names are genuinely the only `excluded`-bucket reason left. Given this spec produced three double-counts already, the check was worth making.

**NFR-9 clean on the part a grep cannot do.** The 261-row entry is a bare range plus a category value. Rows 2/4/8/20/23 stay row-number-only, and the row-23 corroboration points at no specific counterpart, so it identifies nobody. §6 names organisations only — including the one entry that could have gone wrong, a *live* `cbo` row permitted precisely because it is not among the five personal-name rows.

#### Advisories (recorded, non-gating)

| # | Finding |
|---|---|
| A-24 | §4.8 still says the workbook grant covered *"two"* gaps; §1 correctly says three (F-1, F-2, and the 261-row range). Residue from the pre-extension grant |
| A-25 | §1 promises rows are *"individually named by physical row number"* while §4 legitimately uses exhaustive contiguous ranges for the three large blocks. A range does name each row unambiguously; tightening §1 to "individually or as an exhaustive contiguous range" would close the phrasing gap |
| A-26 | **Not this document's defect:** `mapping.md` §3.2 is the only sheet section lacking a "physical columns not carrying a name" line, which is why §4.2's physical-vs-ordinal column offset has no corroborating entry to cite. Worth a line whenever `mapping.md` is next touched |

**Still unverified, by design:** every workbook-sourced figure — the `"Retaler"` rows, the 11 duplicate groups and their members, the 28–288 range — rests on measurement **no Reviewer could take**, since the wrappers grant `Read`/`Grep`/`Glob` only. What was verified is internal consistency, forced arithmetic, and fidelity to sibling documents. §7 (cell-by-cell trace) and §8 (operator post-commit check) are **correctly blank** — both require an actual onboarding run.
