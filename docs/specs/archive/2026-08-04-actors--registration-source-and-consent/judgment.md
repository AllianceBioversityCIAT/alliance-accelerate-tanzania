# Judgment Day — Findings Ledger

- **Spec path:** `docs/specs/actors/registration-source-and-consent/`
- **Target (immutable):** `requirements.md` + `design.md` as of 2026-08-03
- **Mode:** `judgment_day` — blind dual review, invoked from `/akili-specify` Phase 2 Step 2.5
- **Round:** 1
- **Status:** ⚠️ **ESCALATED** — procedural, not substantive: two-judge corroboration was unobtainable (see *Judge A / C — delivery failure*). Findings themselves are corroborated by direct source verification.

## Protocol Record

| Item | Value |
|---|---|
| Judge A | `Plan` agent (read-only), model `opus`, blind fresh context |
| Judge B | `Plan` agent (read-only), model `sonnet`, blind fresh context |
| Author | This session (Opus 5) — authored `requirements.md` + `design.md` |
| Author ≠ auditor | **Partially satisfied.** Full model separation was not reachable: the session model *is* the T3 Auditor tier in the project registry. Independence is carried by **blind fresh context** (neither judge saw the authoring reasoning) plus **model diversity between the two judges**. Recorded honestly rather than claimed. |
| Fix rule | Only SEVERE findings confirmed by **both** judges are eligible. Single-judge SEVERE is recorded as `suspect`, never auto-fixed. |
| Round ceiling | 2 fix rounds, 2 scoped re-judgments |

## Judge B — delivered

| ID | Severity | Location | Claim |
|---|---|---|---|
| **J-1** | **SEVERE** | `design.md` §4.1 / DD-3; `requirements.md` FR-3 Scenario 4 | "Touches `consentStatus`" is never defined as *key-present* vs *value-differs*; the two readings give opposite outcomes for FR-3 Scenario 4 |
| J-2 | WARNING | `design.md` §5, §9 | `AcknowledgeDialog` has **three** consumers, not one; only bulk should gain method/date inputs |
| J-3 | WARNING | `design.md` DD-4, §11 | Batch provenance applied via uniform `updateMany` silently overwrites more-specific per-actor evidence; absent from the risk table |
| J-4 | SUGGESTION | `design.md` §4.1, §8 | Transaction-isolation reasoning for the stored ∪ payload read is unstated (judge could not construct a break) |

**Judge B totals:** severe=1 · warning=2 · suggestion=1

### J-1 — independent verification by the orchestrator

Judge B's two load-bearing claims were re-checked directly against the source before being treated as real:

| Claim | File:line | Verdict |
|---|---|---|
| The existing `acknowledged` check is **transition-scoped** (`dto.consentStatus === GRANTED && before.consentStatus !== GRANTED`) | `backend/src/actors/actors-admin.service.ts:221-224` | ✅ **Confirmed verbatim** |
| `ActorForm.buildDto()` always emits `consentStatus`, making every admin save a full-object PATCH rather than a sparse one | `frontend/components/admin/ActorForm.tsx:186-207` | ✅ **Confirmed** |

**Consequence if left unfixed:** under the codebase's own prevailing idiom (`field in dto`, `buildScalarData` at `actors-admin.service.ts:453`), an implementer would read "touches" as *key present*. Because the admin form always sends `consentStatus`, the guard would fire on **every** save of a legacy `GRANTED` + `NOT_RECORDED` actor — including a pure district edit — and reject it. Every legacy granted-without-provenance actor becomes permanently uneditable through the admin UI.

This is precisely the failure mode `design.md` R-4 names, while asserting DD-3 already mitigates it. It does not. The design also failed to reconcile against the existing transition-scoped precedent at `actors-admin.service.ts:221-224`.

**Proposed correction (NOT yet applied — awaiting Judge A and user approval):** define "touches" as **differs from stored value**. The invariant fires when the effective post-write state is `GRANTED` **and** either (a) the stored status was not `GRANTED` — a transition in — or (b) a provenance field actually changes value. This keeps the grant-then-strip hole closed (case b) while leaving legacy records editable (neither case fires on an unrelated edit).

## Judge A / C — delivery failure

| Attempt | Agent | Model | Outcome |
|---|---|---|---|
| 1 | `judge-a` (`Plan`) | opus | Idled without emitting a report |
| 2 | `judge-a` re-requested via mailbox | opus | Idled again without emitting a report |
| 3 | `judge-c` (`general-purpose`, replacement, blind to this ledger) | opus | Idled without emitting a report |

Three delivery failures across two agent types. The retry loop was stopped deliberately rather than continued — repeating a failing configuration is not evidence-gathering.

**Consequence:** the protocol's own corroboration mechanism (two independent judges agreeing) is unavailable for this round. The skill forbids substituting a refuter, so no in-protocol fallback exists. This is recorded as an **escalation**, per the rule that terminal states are `approved | escalated` only.

## Substitute corroboration — direct source verification

Rather than accept a single-judge report unchallenged, the orchestrator verified **every** Judge B finding against the source. This is arguably stronger than a second judge: it tests each claim against the code rather than against another model's inference.

| ID | Claim verified | File:line | Verdict |
|---|---|---|---|
| J-1 | Existing `acknowledged` check is transition-scoped | `backend/src/actors/actors-admin.service.ts:221-224` | ✅ Confirmed |
| J-1 | `ActorForm.buildDto()` emits `consentStatus` on every save (full-object PATCH) | `frontend/components/admin/ActorForm.tsx:186-207` | ✅ Confirmed |
| J-2 | `AcknowledgeDialog` has **three** consumers | `app/(admin)/admin/actors/page.tsx:686`, `app/(admin)/admin/actors/import/page.tsx:618`, `components/admin/ActorForm.tsx:609` | ✅ Confirmed |
| J-3 | `bulkSetConsent` writes a uniform `updateMany` with no per-actor read | `backend/src/actors/actors-admin.service.ts:373-376` | ✅ Confirmed |
| J-4 | Isolation reasoning unstated (judge could not construct a break) | `actors-admin.service.ts:204-270` | ✅ Accurate as a documentation gap |

**Result: 4/4 findings factually corroborated.** None were hallucinated.

## Fix round 1 — APPLIED (user chose "Fix only", 2026-08-03)

User accepted direct source verification in place of two-judge agreement, and elected **Fix only** — corrections applied without a scoped re-judgment. All four findings addressed.

| ID | Applied change | Files |
|---|---|---|
| **J-1** | Normative *Trigger semantics* block added to FR-3: the rule fires on **value change**, never field presence, with conditions (a) transition-in and (b) provenance value differs. DD-3 rewritten with the three candidate rules and why reading 2 is the trap. §4.1 gained a five-row truth table. The word **"touches" is banned** from normative text. New risk R-9. | `requirements.md` FR-3, §9 D-3 · `design.md` §4.1, DD-3, §11 |
| **J-2** | §5 gained a three-call-site table for `AcknowledgeDialog`; new inputs are **opt-in via prop**, bulk call site only. §9 challenge row corrected. Budget raised. | `design.md` §5, §9, §10 |
| **J-3** | DD-4 decision changed from option (c) *uniform* to option (d) **fill-only-where-missing**, with the preserved count reported in the result envelope. Two new FR-3 scenarios. New risk R-8. Requirements §9 D-3 amended. | `requirements.md` FR-3, §9 D-3 · `design.md` DD-4, §11 |
| **J-4** | Concurrency assumption stated explicitly in §4.1: guard reads `before` and evaluates inside the same `$transaction` before any write; MySQL `REPEATABLE READ` named as the relied-upon isolation level, flagged for re-examination on refactor. | `design.md` §4.1 |

**Test plan strengthened.** §12 now requires, as first-class tests: the full five-row truth table; the *edit-district-on-a-legacy-granted-actor* case sending the exact full object the admin form emits (R-9/J-1); strip-after-grant rejection plus un-publish-then-strip allowance; and a **mixed** bulk batch asserting evidenced actors keep their own provenance (R-8/J-3).

**Budget revised:** ~1,100 → **~1,250 LOC**; task count unchanged at 10.

## Corrections as proposed (historical record)

| ID | Correction | Touches |
|---|---|---|
| J-1 | Redefine DD-3: "touches" means **differs from stored value**, not *key present*. Invariant fires when effective state is `GRANTED` **and** either (a) stored status ≠ `GRANTED`, or (b) a provenance field changes value. Cite the existing precedent at `actors-admin.service.ts:221-224`. Add an explicit grant-then-strip scenario. | `design.md` DD-3/§4.1/R-4; `requirements.md` FR-3 |
| J-2 | State that `AcknowledgeDialog` is shared by three call sites; method/date inputs are **opt-in via prop**, enabled only at the bulk call site. Adjust the §10 budget for the prop-threading. | `design.md` §5, §9, §10 |
| J-3 | Bulk applies provenance **only to actors lacking it** (`consentMethod = NOT_RECORDED`); actors with existing evidence keep theirs, and the result envelope reports the count preserved. **This amends `requirements.md` FR-3's bulk scenario**, which currently mandates uniform application. Add as risk R-8. | `design.md` DD-4, §11; `requirements.md` FR-3 |
| J-4 | One line naming the transaction-scoped read + MySQL default isolation as an assumption of the guard. | `design.md` §4.1 |

## Terminal state

**`escalated`** — and it stays `escalated`, not `approved`.

The escalation was **procedural, not substantive**: every finding was corroborated (4/4 by direct source verification) and every one was fixed. But the protocol's terminal `approved` requires two-judge agreement, which was never obtained. Recording this as `approved` would claim a review that did not happen.

| What is true | What is not claimed |
|---|---|
| One judge delivered a complete report | Two independent judges agreed |
| All 4 findings verified against source by the orchestrator | An independent auditor confirmed them |
| All 4 corrections applied | A scoped re-judgment validated the corrections |

**Residual risk:** the corrections themselves are unreviewed — the author of the flawed DD-3 also wrote its replacement. A fix-caused defect would not have been caught. `/akili-execute`'s Reviewer (a different model, per AKILI routing) is the next independent check on this material; the corrected FR-3 semantics and the DD-4 partitioned write deserve its explicit attention.

For `/akili-archive`'s Kaizen *Measure* step: **1 severe confirmed, author-introduced, caught pre-implementation.** The severe finding was a defined-term omission ("touches") in a design whose entire correctness turned on that term — worth a lesson row about naming the trigger semantics of any cross-path invariant.
