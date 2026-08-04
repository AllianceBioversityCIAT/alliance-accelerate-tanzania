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

#### Requirements covered

FR-5 — all six measured formats, the multi-number first-plus-count behavior, and the never-guess `null` return. **Not** FR-5's `null`-branch *import* behavior (row created, `phone` null, warning) — that is T-3, correctly out of scope here. NFR-4 (`TZ_COUNTRY_CODE` in `normalize.ts`, no duplicated pattern), NFR-5 (zero-import purity), NFR-6 (determinism asserted), NFR-9 (synthetic fixtures only), NFR-3 (purely additive — no existing export, signature, or test altered).


