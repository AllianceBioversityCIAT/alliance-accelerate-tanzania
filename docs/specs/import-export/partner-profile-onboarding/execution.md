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
