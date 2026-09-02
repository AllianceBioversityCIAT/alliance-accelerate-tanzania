# Judgment Day — `admin/registration-review-queue` `design.md`

## Transaction

| Field | Value |
|---|---|
| Target | `docs/specs/admin/registration-review-queue/design.md` (immutable during review) |
| Mode | `judgment_day` — blind dual review |
| Lineage | **Fresh.** Chunk 3a's lineage terminated `escalated` and is exhausted; the split entitles each successor to its own lineage with two fix rounds (`proposal.md` §2) |
| Round | **1** |
| Opened / Closed | 2026-09-01 |
| In-scope context | `requirements.md`, `proposal.md`, root + module guides, PRD, UX/UI, TRD, kaizen Active Lessons, archived 3a, **and the working copy** |
| Judge routing | Both judges on **`sonnet`**, read-only (Read/Grep/Glob), identical prompt, launched in parallel, blind to each other |
| Routing rationale | The design's author is Opus 5. The registry maps T3 Auditor to `opus` — the author's own model — so the judges took T3's registry **fallback**, `sonnet`. One tier down, genuinely independent. `author ≠ auditor` was treated as the stronger constraint, on the evidence of `usage-analytics` L-2: model-bound read-only Reviewers demonstrably audited to unusual depth in this repo |
| Cost of that routing, stated | A one-tier reduction in auditor capability, accepted deliberately rather than silently |

## Corroboration outcome — read this before the ledger

**Zero findings were confirmed by both judges.** The two judges returned **completely disjoint** finding sets: A found a budget-arithmetic defect and an audit-surface gap; B found an unresolved literal and a branch-state claim. Neither saw what the other saw.

Under the skill's contract that makes every finding **`suspect`** — two-judge agreement is the corroboration mechanism, and it did not fire once.

**The parent therefore verified each finding directly against the working copy**, which for these particular findings is *stronger* evidence than a second opinion: all four are mechanically checkable facts (does a string appear in a file; what does an archived record say; is there a second `switch`; what branch is this), not judgment calls. Three verified **real**; one was **refuted**, and its evidence was invalid in an instructive way.

> **Recorded for Kaizen:** a two-judge protocol whose corroboration rate on this target was **0 of 4** did not fail — it produced four findings, three of which were real. But *agreement* was not what established them; **independent verification against the artefact was.** This is a signal about the corroboration mechanism's assumptions, not about these judges.

## Frozen Ledger

| ID | Sev | Reported by | Parent verification | Status |
|---|---|---|---|---|
| **A1** | SEVERE | A only | **CONFIRMED — and worse than reported** | Suspect by contract · verified real |
| **B1** | SEVERE | B only | **CONFIRMED** | Suspect by contract · verified real |
| **A2** | WARNING | A only | **CONFIRMED, both limbs** | Verified real |
| **B2** | WARNING | B only | **REFUTED** | Invalid evidence |
| **B3** | SUGGESTION | B only | Fair nuance | `info` |

---

### A1 — SEVERE — §11 Budget: two different metrics compared as one, and the conclusion is backwards

**Claim under judgment.** *"3a budgeted ~37 review rounds… actually closed 23 tasks in 11 rework rounds — 0.48/task, over-predicted 3.4×."*

**Defect.** `review rounds` and `rework rounds` are different metrics, reported side by side in the same sentence of 3a's own archive. The target compared 3a's **review-round budget** (37) against its **rework-round actual** (11) and concluded the budget over-predicted.

**Parent verification — the evidence is decisive and the conclusion inverts:**

- `archive-summary.md`: *"**11 rework rounds**, ~50 Reviewer lens reports"* — two metrics, one sentence.
- 3a `execution.md` Document Control: the tripwire was *"**>37 review rounds**"* — so **review rounds** is the metric that was budgeted.
- 3a `execution.md`, T-8 close: *"The spec's Execution Conventions halt-and-escalate at **>37 review rounds**. At T-8's close the run stood at **~38 with 8 tasks remaining**, so I halted and put three options to the user rather than exceeding it silently."*
- 3a `execution.md`, T-5: *"the run is at **22 of ~37 review rounds** with 13 tasks left"* — the count was tracked live against that metric throughout.

**On the metric actually budgeted, 3a was _under_-predicted, not over-predicted:** ~50 actual against a 37 budget, breached at T-8 with a HALT. The target asserts the opposite, omits the ~50 figure, and omits the HALT entirely.

**Consequence.** 3b's tripwire was set at **10** from the inverted ratio. On 3a's tracked metric (~50 / 23 ≈ 2.17 per task), 16 tasks predicts **~35**. A tripwire set at 10 against a process that consumes ~35 fires on ordinary progress — which disarms it exactly as thoroughly as setting it too high, and burns a user escalation each time.

**Correction.** Re-derive on one consistently-defined metric, disclose the ~50 and the T-8 HALT, and state which metric `/akili-execute` will actually count.

---

### B1 — SEVERE — the `traderId` literal is never stated, though `requirements.md` binds the design to state it

**Claim under judgment.** §6.2 step 2: *"Derive `traderId` from the reference | Needs no I/O; keep it before any write that could fail on it."*

**Defect.** No derivation rule, no prefix, no literal — anywhere in the document.

**Parent verification.** `grep -n "SR-\|prefix\|REG-2026" design.md` returns **nothing**. Meanwhile `requirements.md` D-8 binds the design in terms: *"this spec **re-confirms or re-decides that literal in `design.md`**, since uniqueness table-wide is not guaranteed by construction"*, and OQ-2 frames it as a decision to close (*"Confirm the literal, or pick another"*).

**Why this is SEVERE and not a WARNING.** It is a *"constraints, not mechanism"* clause answered with **silence** — the exact disclosure-failure shape that has now recurred three times in this epic (KZ-006 / C-10), and the judge is right that every other load-bearing literal in the document is stated explicitly with rationale. It governs collision-avoidance on the spec's one irreversible write; left unstated, an Implementer invents it, which is precisely what 3a's RA1 did.

**Correction.** State the derivation and the literal, check it against chunk 2's eight prefixes and `TZ-SEED-*`, and close OQ-2 in the document.

---

### A2 — WARNING — the audit widening is not actually end-to-end

**Two limbs, both verified.**

1. **A second `switch` on `AuditEntry['action']` exists and is unmentioned.** `ActorHistoryPanel.tsx` has `actionBadgeClasses`'s switch **and** a second one inside `SnapshotDetails` carrying `default: summary = 'Snapshot'`. It does not degrade silently the way the first does — but FR-16's own title is *"widened **end-to-end**"*, and DD-21's stated rationale is that a `default` branch guarantees the next recurrence is invisible. Naming one surface and not the other leaves a later reader unable to tell omission from decision.
2. **The `changes` envelope for the two new audit methods is unspecified.** The panel renders *"Details not available"* for any `changes` satisfying neither `isDiff` nor `isSnapshot`. Unpinned, the registry's most consequential audit row can render a correct badge above an empty body — and `logRegistrationReject` has no actor to snapshot at all, so its envelope is genuinely undefined by the current design.

**Correction.** Pin both envelopes explicitly; either extend the total-map treatment to `SnapshotDetails` or record it as deliberately excluded with the reason its existing `default` makes it safe.

---

### B2 — REFUTED — the branch claim is true; the finding's evidence was stale

**Claim under judgment.** Document Control: *"Branch | `registration-review` (carries `enhancement/usage-analytics`, 11/11 archived, not yet on `main`)"*.

**The finding asserted this is false**, citing *"gitStatus context ('Current branch: main', 'Status: (clean)')"*.

**Refutation.** That `gitStatus` is the **conversation-start snapshot** carried in a system prompt, explicitly documented as *"a snapshot in time, and will not update"*. It was accurate when the session opened and stale by the time the judge read it. Measured live at merge time:

```
git branch --show-current   → registration-review
git log --oneline main..HEAD → 16 commits ahead of main
```

The design's claim stands unchanged. The judge read the archive folder and the analytics test out of the **working tree** — which *is* the branch — and attributed them to `main` on the strength of the stale snapshot.

> **This is worth recording rather than deleting.** B2 is an instance of the very defect class its own review criterion 1 exists to catch: *a claim asserted from an artefact that was true when written and false when read*, rather than measured at the moment of use. The criterion caught it — in the judge applying it. `usage-analytics` **L-1** in miniature.

---

### B3 — SUGGESTION — `info` — QA-12's scenario is scoped to the four public paths

§2.2 states *"QA-3 and QA-12 both gain routes."* QA-12's scenario text in `docs/trd/trd.md` §13 names *"any of the four public self-registration paths"* — a closed set this spec does not touch, since it adds no public path. QA-3 (*"an authenticated `staff` user calls an admin-only endpoint"*) is the shape this spec's routes actually have. The claim is defensible only because ADR-010 ties QA-12 to the `pii-boundary.spec.ts` extension as a *mechanism* rather than to its own actor.

Recorded as `info`. It is resolved when TRD §13 is amended (already budgeted): either widen QA-12's actor text to cover admin-gated PII routes, or cite QA-3 alone.

---

## Round 2 — scoped re-judgment (fix delta only)

Same two judges, same model, blind, parallel, scoped to the fix delta plus this ledger.

| Finding | Re-judge A | Re-judge B | Disposition |
|---|---|---|---|
| **A1** budget metric | FIXED | FIXED | **Closed — both** |
| **B1** `traderId` literal | FIXED | FIXED | **Closed — both** |
| **A2** audit envelopes + second `switch` | FIXED (both limbs) | FIXED (both limbs) | **Closed — both** |

**Fix-caused defects: one raised, refuted.**

### RA1 — REFUTED — the `1.6/task` attribution is correct and is quoted from its source

**Finding.** §11's *"Chunk 1's 1.6/task rate under-read 3a by roughly a third"* misattributes the figure; 37 ÷ 23 = 1.609, so the rate "is 3a's own budgeted rate, not Chunk 1's".

**Refutation.** 3a's `design.md` §10.1 states the provenance in terms:

> `| Review rounds | **~37** | 23 tasks × **1.6/task**, chunk 1's demonstrated rate (≈16–17 rounds over 10 tasks per `archive-summary.md` §6) |`

1.6/task **is** chunk 1's demonstrated rate (16–17 rounds ÷ 10 tasks = 1.6–1.7). 3a *derived* 37 by multiplying 23 × 1.6, so dividing 37 by 23 recovers 1.6 necessarily — that is inverting the multiplication, not evidence of where the rate came from. The target's attribution is faithful to its source.

> **Both refutations in this lineage share one shape**, and it is worth recording. B2 asserted a branch state from a stale system-prompt snapshot; RA1 asserted a figure's provenance from arithmetic on a derived number. Neither read the artefact that records the fact — the live `git` state in one case, 3a's own budget table in the other. This is `usage-analytics` **L-1** appearing twice inside the review mechanism built to catch L-1.

## Round 1 disposition

| | |
|---|---|
| Confirmed by both judges | **0** |
| Verified real by the parent | **3** (A1, B1, A2) |
| Refuted | **1** (B2) |
| `info` | **1** (B3) |
| Fix rounds used | **1** of 2 (user-authorised 2026-09-01: correct all three verified findings) |
| Scoped re-judgments used | **1** of 2 |
| Round-2 outcome | **3/3 fixed, confirmed by both judges** · 1 fix-caused finding raised and **refuted** |
| Findings outstanding | **none** |

---

## Terminal receipt

| | |
|---|---|
| Target | `docs/specs/admin/registration-review-queue/design.md` |
| Rounds | 1 review + 1 scoped re-judgment |
| Confirmed by both judges (round 1) | 0 |
| Verified real by the parent (round 1) | 3 — A1, B1, A2 |
| Refuted | 2 — B2 (round 1), RA1 (round 2) |
| `info` | 1 — B3, resolved when TRD §13 is amended |
| Correction work units | 3 documentary edits to `design.md`, 1 backward-sweep edit to `requirements.md` (OQ-2 closed) |
| Fix rounds remaining | 1 |
| Artifacts | this ledger · `design.md` §6.2, §6.7, §7.5, §9 DD-23, §11 · `requirements.md` §13 |

# JUDGMENT: APPROVED ✅
