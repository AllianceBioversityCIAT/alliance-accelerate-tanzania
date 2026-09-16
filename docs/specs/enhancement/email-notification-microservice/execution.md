# Execution Log — Email via the OneCGIAR Notification Microservice

## Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/enhancement/email-notification-microservice/` |
| Branch | `email-ms` |
| Approval Mode | `gated` |
| Triad | Leader (opus) → Implementer (`akili-implementer`, sonnet) → Reviewer (`akili-reviewer`, opus) |
| Budget (design.md) | 17 tasks · ≈1,850 lines · 3 review rounds |
| Started | 2026-09-16 |

**Author ≠ auditor** is enforced by the Step 8E wrappers' `model:` bindings, not by convention.

---

## Task Execution History

### T-1 — Create the canonical timing constants and their invariant tests

| | |
|---|---|
| **Status** | ✅ **PASS** on attempt 1 |
| Date | 2026-09-16 |
| Implementer attempts | 1 |
| Requirements covered | NFR-7, NFR-1 · `design.md` §12, DD-10 |

**Leader skill/effort selection (deviation recorded).** `tasks.md` T-1 lists `nestjs-expert`; I assigned **no stack skill**. Reason: the deliverable is a constants module plus arithmetic assertions — there is no NestJS surface (no DI, no module registration, no provider). Effort **`medium`**: small work, but the constants govern an address-enumeration timing oracle, so it is not `low`.

**Files changed**

- `backend/src/mail/mail-timing.ts` (new, 109 lines)
- `backend/src/mail/mail-timing.spec.ts` (new, 118 lines)

Scope containment confirmed by the Leader with `git status --porcelain` (the Reviewer flagged, correctly, that it could only establish this by reading — A6). Result: exactly the two new files, plus this untracked spec folder. `registrations.service.ts` and `email-verification.service.ts` untouched.

**Verification**

`cd backend && npm test -- mail-timing --silent` → **7/7 pass**. Implementer also reported clean: `npx eslint` on both files (exit 0), full `npm test -- --silent` (77 suites / 1087 tests), `npm run build` (exit 0).

**Mutation evidence (KZ-002 — a gate not shown to fail is not evidence)**

| Invariant | Mutation | Result | Reverted |
|---|---|---|---|
| 1 — `PRESEND + SEND ≤ FLOOR` | `MAIL_SEND_TIMEOUT_MS` 1200 → 1300 | 2 tests red (the pin + the invariant; 800+1300 = 2100 > 2000) | ✅ green |
| 2 — `LOCK_WAIT + PROBE < SEND` | `MAIL_PROBE_TIMEOUT_MS` 250 → 1050 | 2 tests red (the pin + the invariant; 200+1050 = 1250 ≮ 1200) | ✅ green |

The Reviewer re-derived both outcomes arithmetically from the source and confirmed the failure counts reconcile exactly, while recording that it executed nothing itself (A6).

**Reviewer verdict — `STATUS: PASS`**

> All four constants match design.md §12.1/§12.2 exactly, both §12.3 invariants are asserted at the correct strictness with invariant 1 in DD-10's composed (three-term) form, the mutation evidence reconciles arithmetically against the source, and the change is confined to T-1's two Files with registrations.service.ts and email-verification.service.ts provably untouched.

Notable audit findings within the gate: invariant 2 uses `toBeLessThan` where a `≤` would have been a silent weakening — it is not present; invariant 1 is composed as a **sum**, i.e. the three-term shape DD-10 mandates rather than the two-term comparison NFR-7's revision-4 note condemns.

**Decisions made**

*The floor-constant tension.* `VERIFICATION_CODE_RESPONSE_FLOOR_MS` lives in `registrations.service.ts` at `900`; §12.1's target is `2000`; **T-7 owns re-deriving it and T-1 was forbidden to touch it.** The Implementer chose to assert invariant 1 against a locally-scoped target constant, having first verified that T-7's `Files:` list contains no `mail-timing.*` — so the alternative ("export a target, let T-7 wire it") had no planned landing step. The Reviewer independently verified that premise and judged the choice correct: asserting against the live `900` would have shipped a permanently red, unowned test.

**ADVISORY findings (4R lenses — non-gating, recorded per the Advisory rule)**

| ID | Finding | Leader disposition |
|---|---|---|
| **A1** | The second test asserts the **negation** of invariant 1 against the live constant, inside the `describe` block named for invariant 1. It reddens when T-7 lands, in a file T-7 does not own. The obvious minimal repair (weaken `<` to `≤`) would make it vacuous — the "green gate over a live defect" shape NFR-7 condemns | **Transferred mechanically** — `mail-timing.spec.ts` added to T-7's `Files:` with an explicit instruction to **delete** that test, not weaken it. A pointer filed and not transferred is not carried (leader playbook) |
| **A2** | `mail-timing.spec.ts` line 105 reads `// T-7 will make this pass:` above three lines correctly explaining T-7 makes it **fail** | Folded into A1's transfer — the same lines are deleted. Not reopened as T-1 rework: the Reviewer PASSed and an advisory may not widen a closed task |
| **A3** | ⚠️ **Design defect, not an implementation one.** `design.md` §12.1 documents the allowance as covering "the `EmailSendBudget` upsert, `emailVerification.create`, and code generation + hashing". **Only the upsert is inside `issueCode`'s `$transaction`** — Leader-verified directly: `generateCode`, `hashCode` and `emailVerification.create` run *after* it. T-7's specified mechanism (a transaction timeout) would therefore bound **one of three terms**, and NFR-7's "every term inside the padded window MUST be bounded at runtime" would not hold | **Design amended before T-7 is dispatched.** See *Design correction* below |
| **A4** | `design.md` §4.1's Phase-A inventory does not list `mail-timing.ts`; it places "The §12 constants" in `registrations.service.ts` and the invariant test in `registrations.service.spec.ts`. `tasks.md` T-1 mandates the new `mail/` module | Design reconciled to the task, which is what shipped and what the Reviewer validated |
| **A5** | `design.md` DD-10 says Prisma's 5000 ms ceiling is "5.5× the allowance" — stale from the old `900`. Correct against `800` is **6.25×**. *Two documents, one ratio, two values — the exact failure §12 exists to prevent* | Corrected in `design.md` |
| **A6** | Every red/green result was produced by the agent that wrote the code; the Reviewer re-derived but executed nothing, and established scope by reading | Leader ran `git status --porcelain` — scope containment now established by execution, not inference |
| **A7** | `mail-timing.spec.ts` imports from `../registrations/registrations.service` — the **reverse** of the dependency direction T-1's Scope line claims. Test-only; no runtime cycle (nothing in `mail/` reaches into `registrations/`), so no DI or bundle impact. But a four-constant unit test now transitively loads `@prisma/client` | Recorded so it is not later mistaken for an accidental import. Disappears with A1's deletion in T-7 |

**Issues encountered:** none blocking. One design defect surfaced (A3) and was corrected before it could reach the task it would have broken.

---

## Design correction — A3 (recorded during T-1, applied before T-7)

**Not a Pivot.** No approved work is undone, no task is blocked, and the requirement is unchanged — NFR-7 already demands that *every* term inside the padded window be bounded. What was wrong is the **mechanism** `design.md` specified for satisfying it, and T-7 had not yet been dispatched.

**The defect.** `issueCode`'s `$transaction` wraps only the `EmailSendBudget` upsert and its read-back. `generateCode()`, `hashCode()` and `await this.prisma.emailVerification.create(...)` execute *outside* it. A Prisma transaction timeout therefore bounds the budget upsert and nothing else.

**Why it matters more than a one-third shortfall.** The **over-cap branch throws immediately after the transaction**; the **accepted branch** additionally pays `emailVerification.create` — a further unbounded database round-trip. The unbounded term is precisely the one that *differs between the two branches*, which is the divergence the constant-time floor exists to erase. Bounding only the transaction would have left the timing oracle open while `mail-timing.spec.ts` asserted the arithmetic was sound — the same green-gate-over-a-live-defect shape that Judgment Day rounds 2 and 3 both condemned.

**The correction.** The allowance is applied as a deadline over the **whole pre-send region** — `requestVerificationCode` bounds its `issueCode(...)` call as a unit — rather than as a Prisma transaction option. This bounds every term inside it regardless of `issueCode`'s internal structure, and it survives someone later moving work into or out of that transaction.

Amended: `design.md` §12.1 ("Covers" and "Enforced by"), DD-10's mechanism sentence, §4.1, §10; `tasks.md` T-7 scope and Done-when.

---
