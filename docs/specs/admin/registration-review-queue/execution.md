# Execution Log — Registration Review Queue & Approve-to-Publish

## Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/admin/registration-review-queue/` |
| Branch | `registration-review` |
| Started | 2026-09-01 |
| Approval Mode | `gated`, relaxed by the user to **pause-per-phase** on 2026-09-01. HALT, Pivot, budget tripwire and `FATAL_FAIL` still stop immediately. |
| Leader | Claude Opus 5 (T1) |
| Implementer | `akili-implementer` wrapper — `sonnet` (T2) |
| Reviewer | `akili-reviewer` wrapper — `opus` (T3), read-only. `author ≠ auditor` enforced by wrapper `model:` bindings. |
| Budget | 16 tasks · ~8,200 LOC (halt ~9,200) · ~35 review rounds (halt 35). Re-measured at the close of T-4, T-8, T-12, T-16. |
| CodeGraph | **Not initialized in this checkout** — only `.codegraph/config.json` is present, no generated database. Workers explore by file; no `codegraph_*` guidance issued in briefs. |

### Pre-flight checks (Leader, before any spawn)

| Check | Result |
|---|---|
| Concurrency / branch overlap (KZ-010) | **Clean.** `origin/fix/registration-otp-mail-and-footer` is fully merged into `HEAD`; no divergent branch touches `backend/prisma/schema.prisma` or `backend/src/test/pii-boundary.spec.ts`. |
| Node version | `v26.8.1` (contract requires 20+). |
| `DATABASE_URL` target | `mysql://***:***@localhost:3306/accelerate` — a **local** MySQL 8 container (`accelerate-mysql`), **not** the shared dev RDS. The abort-and-report condition in T-1 / `design.md` §4.2 concerns a drift or reset prompt; the local target reduces but does not waive it. |
| Local stack | `accelerate-mysql` was stopped; started by the Leader under the `docs/infrastructure.md` §6 disposable-environment boundary rule. |
| Migration state | `npx prisma migrate status` → **8 migrations found, "Database schema is up to date!"**, no drift, no reset prompt. T-1 may proceed. |

---

## Task Execution History

### T-1 — Widen `ActorAuditAction` with the two adjudication members

| Field | Value |
|---|---|
| Status | **PASS** |
| Date | 2026-09-01 |
| Implementer attempts | **1** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **max** · Skills: `nestjs-expert` |
| Reviewers | **Parallel lens mode** — 2 lens-scoped Reviewers (opus, T3). Triggered by effort `max` *and* the migration surface. Held to 2 of the 2–4 range because the diff is three lines; recorded so the round count stays honest. |
| Review rounds consumed | **2** |
| Requirements covered | FR-16 (enum limb) · `design.md` §4.1, §4.2 |

**Skill/effort deviation:** none. Task-listed `nestjs-expert` and effort `max` were both kept. `tdd` deliberately **not** assigned — there is no logic to drive red→green, only a schema widening.

#### Attempt 1 — files changed

- `backend/prisma/schema.prisma` — `ActorAuditAction` 6 → 8 members
- `backend/prisma/migrations/20260901173422_add_registration_audit_actions/migration.sql` — new

#### Emitted SQL (verbatim, read from disk by both the Implementer and the Leader)

```sql
-- AlterTable
ALTER TABLE `ActorAuditLog` MODIFY `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'BULK_CONSENT', 'BULK_DELETE', 'IMPORT', 'REGISTRATION_APPROVE', 'REGISTRATION_REJECT') NOT NULL;
```

Satisfies `design.md` §4.2: `MODIFY` present as mandated, no `DROP`, no data `UPDATE`, no narrowed or retyped column. Structurally identical to the cited precedent `20260710132750_add_import_audit_action/migration.sql`.

**Why this is genuinely additive (Reviewer finding, stronger than the stated criterion):** MySQL stores `ENUM` by **ordinal index**, so the load-bearing property is not the presence of `MODIFY` but that the six pre-existing values keep their original positions. They do — the new list is an order-preserving superset with the two members appended at positions 7 and 8, so no stored row is remapped. A reordered list with identical membership would have silently rewritten every existing row.

#### Verification (commands and results)

| Command | Result |
|---|---|
| `npx prisma migrate status` (pre) | "8 migrations found", "Database schema is up to date!" — **no drift or reset prompt** |
| `npx prisma migrate dev --name add_registration_audit_actions` | Applied cleanly; **no drift/reset prompt encountered**, so the abort-and-report condition never triggered |
| `npm run build` | Clean |
| `npx prisma migrate status` (post) | "9 migrations found", "Database schema is up to date!" |
| `npm test -- --silent actor-audit` | 1 suite, **22 tests passed** |
| `npm test -- --silent` (full backend) | 64 suites, **826 tests passed** |
| `npx eslint "{src,test}/**/*.ts" --quiet` | Clean (the `--fix`-mutating `npm run lint` form was deliberately not run) |

#### Falsifying input — executed, recorded verbatim, reverted

**The task's stated falsifying input is vacuous as written at this task boundary**, and both Reviewers independently said so. T-1 adds no source that references either new member, so removing one narrows the generated union but nothing consumes it and the build stays green. A gate that cannot fail is not a gate (**KZ-002**).

The Implementer therefore constructed the missing consumer — a throwaway `backend/src/_t1-falsify-check.ts`:

```ts
import { ActorAuditAction } from '@prisma/client';
export const t1FalsifyCheck: ActorAuditAction = ActorAuditAction.REGISTRATION_APPROVE;
```

Baseline green confirmed with the file present. Then `REGISTRATION_APPROVE` was removed from `schema.prisma`, `npx prisma generate` re-run (client-only, no DB touch), and `npm run build` produced **verbatim**:

```
src/_t1-falsify-check.ts:8:66 - error TS2339: Property 'REGISTRATION_APPROVE' does not exist on type '{ CREATE: "CREATE"; UPDATE: "UPDATE"; DELETE: "DELETE"; BULK_CONSENT: "BULK_CONSENT"; BULK_DELETE: "BULK_DELETE"; IMPORT: "IMPORT"; REGISTRATION_REJECT: "REGISTRATION_REJECT"; }'.

export const t1FalsifyCheck: ActorAuditAction = ActorAuditAction.REGISTRATION_APPROVE;

Found 1 error(s).
```

The member was restored, the client regenerated, and the probe deleted. This is the same technique the spec's own `design.md` DD-15 / DC-28 use to prove a gate.

**Residue verified independently of the Implementer's account:**

| Residue class | Check | Result |
|---|---|---|
| Probe file on disk | Leader `ls`, Reviewer glob `backend/src/_t1*` | Absent |
| Probe in git | Leader `git status --porcelain` | Absent |
| Stale generated client | Reviewer read `node_modules/.prisma/client/index.d.ts` L94–103 and the client's copied `schema.prisma` | **Eight members present** — the final regenerate demonstrably won; does not rest on the reported run order |
| Compiled residue | Reviewer searched `backend/dist/` and `dist/tsconfig.build.tsbuildinfo` | No `_t1-falsify-check` reference |
| `backend/.env` (gitignored — invisible to `git status`) | **Leader, inline:** `stat` mtime = `2026-08-31 11:51:23`, byte-identical to the pre-flight reading taken *before* the Implementer spawned | **Not touched.** The `localhost:3306` target was pre-existing, not an Implementer edit |

#### Reviewer verdicts

**Lens 1 — spec conformance + correctness/reliability: `STATUS: PASS`**
> The diff is exactly the two additive enum members and one Prisma-generated migration whose SQL is structurally identical to the cited in-repo precedent, preserving all six existing ENUM values in their original ordinal positions so no stored row is remapped. Scope is clean (zero references to either member anywhere in `backend/src/`), the generated client carries eight members as read from disk, and the throwaway-consumer falsification is the same technique this spec's own design uses to prove a gate — with no residue left behind.

**Lens 2 — risk + resilience: `STATUS: PASS`**
> The diff is exactly the two additive enum members plus one order-preserving, superset-only `MODIFY` whose shape matches `design.md` §4.2 and the in-repo precedent; every done-criterion that leaves an artefact was verified against that artefact, including the generated client's eight-member union and the complete absence of the falsification probe from `src/`, `dist/` and the incremental build state. All remaining concerns are deploy-ordering, reversibility-coupling and declared-gap items, none of which is a spec-conformance violation.

#### ADVISORY (4R lens findings — recorded, non-gating, and **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| A-1 | **Rollback safety expires at T-2, one-way.** Once an adjudication row exists, rolling the *application* back past T-1 while the DB stays widened makes the old client's union unable to cover a value it reads from `ActorAuditLog.action`; the Prisma query engine errors. Shipping the migration ahead of its writers is the correct order and T-1 achieves it — the constraint is that the pairing is one-way afterwards. | Recorded. Constrains deploy ordering for PR 1 → PR 3. |
| A-2 | **If T-2…T-9 are abandoned, revert `schema.prisma` and the migration together or not at all.** Reverting one alone produces a drift prompt on the next `migrate dev`, which this task's own contract makes abort-and-report. Do not author a narrowing down-migration — that is the one non-additive change `backend/CLAUDE.md` forbids. | Recorded as a rollback constraint. |
| A-3 | **`backend/.env` is gitignored**, so a `git status` residue check structurally cannot see it. | **Resolved inline by the Leader** — mtime unchanged from pre-flight; not touched. See the residue table above. |
| A-4 | **No test will ever prove MySQL accepts the two new values.** The e2e harness overrides Prisma with an in-memory mock, so T-2's audit tests and later endpoint e2e would accept a nonexistent action string identically. Database acceptance is proven by the migration applying and by **no test**, now or later. | **Declared as an unevaluable gap**, joining the spec's `Not covered — declared, not discharged` set. Not a task. |
| A-5 | **Latent cross-boundary state, correctly sequenced.** The backend enum can now express two members that `AuditEntry['action']` in `frontend/lib/api/actors-admin.ts` cannot (still the five-member union already drifted on `IMPORT`). No defect is introduced here — nothing emits the members yet — but the window between T-2 (which starts emitting rows) and **T-15** (which closes FR-16) is exactly R-4's failure mode. | Recorded. **Reinforces the existing plan note that T-15 can be lifted out and shipped early**; creates no new task. |
| A-6 | Backend has no `switch`/`Record` over `ActorAuditAction` (`audit-entry.serializer.ts` passes it through), so the widening broke no exhaustiveness surface on this side. This is why the clean build is trustworthy rather than merely permissive. | Recorded as corroboration. |

#### Decisions made

- **Parallel lens review capped at 2**, not 4, for a three-line diff — proportionality against the 35-round budget. Recorded so the deviation from the 2–4 range is visible.
- The falsifying-input deviation was **accepted as a satisfaction, not an evasion**: it is the only one of the three available options (report unfalsifiable / claim an unobserved pass / construct the consumer) that honours KZ-002, and it is the in-repo precedent methodology.

#### Issues encountered

None. No drift prompt, no rework, no scope creep.

#### Final verification result

`npm run build` clean · `migrate status` = 9 migrations, schema up to date · full backend suite **64 suites / 826 tests passed** · eslint clean.

### T-2 — Two additive `ActorAuditService` methods with pinned `changes` envelopes

| Field | Value |
|---|---|
| Status | **PASS** |
| Date | 2026-09-01 |
| Implementer attempts | **1** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **high** · Skills: `nestjs-expert`, `tdd` |
| Reviewer | `akili-reviewer` (opus, T3) — **lens-checklist mode** (single Reviewer sweeping all four 4R lenses), per the effort-`high` row of the mode table |
| Review rounds consumed | **1** (running total: **3**) |
| Requirements covered | FR-16 · FR-12 (audit clause) · FR-13 (audit clause) · `design.md` §6.7 · 3a `design.md` DD-6 |

**Skill/effort deviation:** none. `tdd` was kept and earned its cost — the pinned envelope table is exactly the business rule red→green is for.

**Leader process note:** the initial Reviewer brief was dispatched with an unsubstituted `DIFF_PLACEHOLDER` token in place of the diff. The Leader detected this immediately and sent the complete 409-line diff as a follow-up message before the Reviewer consumed a round. No review round was wasted; recorded because an undocumented re-brief would look like a retry in the round count.

#### Attempt 1 — files changed

| File | Insertions | Deletions |
|---|---:|---:|
| `backend/src/actors/actor-audit.service.ts` | 117 | **1** |
| `backend/src/actors/actor-audit.service.spec.ts` | 262 | **0** |

**The disqualifying condition is satisfied and was verified by the Leader independently of the Implementer's account:** `git diff --numstat` on the spec file reports `262  0`, and `git diff -U0 | grep '^-'` returns nothing beyond the file header. The single deletion in the service file is the import line `import { ActorAuditAction, ActorAuditLog, Prisma } from '@prisma/client';`, widened to a multi-line form adding `Registration`. No existing signature or behaviour changed. The Reviewer confirmed the two new `describe` blocks sit between `logImport`'s and `toAuditEntry`'s with no existing fixture, `mockTx`, or `fixtureActor` touched.

#### The two methods and their pinned envelopes

`logRegistrationApprove(tx, actor, acting, _reference)` → `changes = buildSnapshot(actor)`, i.e. `{ kind: 'snapshot', values: {...AUDITABLE_FIELDS, crops} }` — byte-for-byte the shape `logCreate` writes, as §6.7 pins.

`logRegistrationReject(tx, registration, acting)` → `changes = { kind: 'snapshot', values: { reference, traderName, reason } }`. Row columns: `actorId` = the **registration** id, `traderId` = the reference, `traderName` = the submitted organisation name.

#### Verification

| Command | Result |
|---|---|
| `npm test -- --silent actor-audit` (the mandated command) | **PASS, 30/30** (18 new + 12 pre-existing) |
| `npm test -- --silent` (full backend, side-effect check) | 64 suites / **834 tests** green |
| `npx eslint "{src,test}/**/*.ts" --quiet` | Clean |
| `npm run build` | Clean |

#### Falsifying input — executed, recorded verbatim, reverted

`changes` mutated from `this.buildSnapshot(actor)` to the bare object `{ note: 'FALSIFYING_INPUT_MUTATION' }`, satisfying neither `isDiff` nor `isSnapshot`:

```
FAIL src/actors/actor-audit.service.spec.ts
  ● ActorAuditService › logRegistrationApprove › writes a REGISTRATION_APPROVE snapshot identical in shape to logCreate (FR-16, design.md §6.7)
    expect(received).toBe(expected) // Object.is equality
    Expected: "snapshot"
    Received: undefined
      > 601 |       expect(changes.kind).toBe('snapshot');
  ● ActorAuditService › logRegistrationApprove › satisfies isSnapshot-style narrowing so ActorHistoryPanel never falls through to "Details not available"
    expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false
      > 660 |       expect(isDiff || isSnapshot).toBe(true);
Test Suites: 1 failed, 1 total
Tests:       2 failed, 28 passed, 30 total
```

Reverted; suite back to 30/30. The gate is capable of failing.

#### Carried-forward FR-16 clause (delegated to T-2 by T-15's clause sweep) — discharged, with its ceiling stated

A test asserts by value that `logRegistrationReject` writes `actorId = 'registration-42'` (a registration id), `traderId = 'REG-2026-0999'`, and the payload's `traderName`. **This is a value assertion, not a presence assertion — not a KZ-002 recurrence.**

**Its honest ceiling, per the Reviewer:** it does not *prove* "can never appear in any actor's history". That conclusion rests on two premises the test does not itself assert — that the read path filters on `actorId` (**verified true** by the Reviewer at `actors-admin.service.ts`, `where: { actorId: id }` on both `findMany` and `count`), and that registration and actor ids are disjoint (both `cuid()`, so **improbable rather than structurally impossible**). `design.md` §6.7 concedes exactly this ceiling: *"no test can gate its rendering — only its persistence."*

#### Leader adjudication of the four disclosed assumptions

| # | Disclosure | Adjudication |
|---|---|---|
| 1 | `_reference` accepted but unused | **Correct reading, upheld.** §6.7 pins the envelope as identical to `logCreate`'s; a design wanting the reference *in* the envelope could not simultaneously pin that identity. Keeping the parameter is also right — §6.2 step 7 pins the four-arg call site for T-8. |
| 2 | `Pick<Registration, 'id'\|'reference'\|'payload'\|'rejectionReason'>` | **Upheld, and better than the full type** — keeps the audit service off adjudication columns it never reads and lets T-8 pass a `select`-narrowed row. |
| 3 | Envelope key names `reference` / `traderName` / `reason` | **Accepted.** §6.7 pins content in prose, not keys. `reason` is the only key diverging from its source column (`rejectionReason`); since `SnapshotDetails` renders keys verbatim as labels, it is arguably better copy. |
| 4 | `extractSubmittedTraderName` returns `''` on a malformed payload | **Accepted.** The row identifies its subject twice independently of this helper (`traderId` and `changes.values.reference`), so no audit row can fail to identify itself; the branch is unreachable for any row that passed `RegistrationPayloadDto` validation. Throwing would roll back a valid rejection over a cosmetic field — the wrong side of the fail-loud/fail-soft line here. |

#### PII judgement (explicitly checked, no gate tripped)

`buildSnapshot` captures `phone` and `email`, exactly as `logCreate`/`logDelete`/`logImport`/`logBulkDelete` already do. `backend/CLAUDE.md`: *"Audit JSON contains PII → admin-only surface"*; `requirements.md` §10 restates it for this spec as **unchanged**. The read path is Admin-guarded and untouched.

**Worth recording in the other direction:** `logRegistrationReject` extracts exactly **one** field from `Registration.payload` — which the conventions designate PII in its entirety — rather than snapshotting it. `contactPerson` (a named natural person) and `submitterEmail` never enter the audit JSON.

#### Reviewer verdict

**`STATUS: PASS`**
> Both methods are strictly additive, write only through the caller's `tx`, and emit envelopes matching §6.7's pinned table — `logCreate`'s exact `buildSnapshot` output for approve, and a `kind: 'snapshot'` envelope over reference/organisation name/reason for reject, both satisfying `ActorHistoryPanel`'s real `isSnapshot` narrowing. The 606-line existing suite is untouched, and no project audit gate (PII, RBAC, stack, validation) is implicated.

Caller-`tx` confinement was proven **structurally**, not merely by assertion: `ActorAuditService` has no constructor and no injected `PrismaService`, so both methods can only reach persistence through the `tx` parameter.

#### ADVISORY (4R lens findings — recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| A-7 | **T-9 must pass a registration whose `rejectionReason` is already set.** `logRegistrationReject` reads the reason off the passed object, so a caller passing the *pre*-update row silently writes `reason: null`. FR-13: *"a rejection with no recorded reason is unauditable."* | **FORWARD POINTER → T-9.** Must be copied into T-9's Implementer brief and its Reviewer brief. |
| A-8 | **T-8's Reviewer must verify `actor.consentReference === reference` at the call site** — it is the only thing that makes the discarded `_reference` harmless. NFR-2/DC-6 already require a by-value assertion, so it should cost nothing; if that assertion is ever relaxed, the approve audit row silently loses the reference and no T-2 test reddens. | **FORWARD POINTER → T-8.** Must be copied into T-8's briefs. |
| A-9 | The primary approve test uses default `fixtureActor()` (`consentReference: null`) and asserts `consentReference: null` while passing `'REG-2026-0184'` — the one fixture where the JSDoc's own rationale does not hold. | Recorded. Not reworked: advisory, and the second test's fixture is the realistic one. |
| A-10 | Test name *"identical in shape to `logCreate`"* is stronger than its `toMatchObject` subset assertion (omits `consentObtainedAt`, `gpsLongitude`, `gpsAltitude`, `gpsAccuracy`; tolerates a stray extra key). Divergence is impossible today since both call the same `buildSnapshot`. | Recorded. One line — `expect(approveChanges).toEqual(createChanges)` — would make the name literally true and survive an `AUDITABLE_FIELDS` change. |
| A-11 | Two comments claim more than the code demonstrates: the service JSDoc says the FR-16 clause is *"asserted here"* (the test asserts it, not the service); a test comment asserts a conclusion over an unasserted premise. | Recorded — a mild **KZ-008** shading. Not a defect in behaviour. |
| A-12 | Citation imprecisions: `extractSubmittedTraderName`'s JSDoc cites "§6.3's projection table" (§6.3 is prose; the table is in `requirements.md` FR-12), and a bare `(FR-2)` collides with this file's other bare `FR-2` from chunk 1. | Recorded — **KZ-009** adjacent (anchor precision). |
| A-13 | `registration as never` in all five reject tests defeats the narrowing that `Pick<…>` was chosen to provide; T-8's call site becomes its first real compile-time check. | Recorded. |
| **A-14** | **`ActorAuditLog.acknowledged` is left unset on the approve row.** `logBulkConsent` and `logImport` persist it; it is the **typed consent-acknowledgement flag** (Leader-verified at `actor-audit.service.ts` lines 176–194, 225–296, 342–360). FR-12's approve gate *is* a typed consent acknowledgement, server-side re-validated — so the spec's most consequential consent write does not record its own gate in the audit row. Counter-precedent, honestly noted: `logCreate` does not set it either, and §6.7 pins this envelope as identical to `logCreate`'s, so the Implementer followed the pinned instruction exactly. | **OPEN DESIGN QUESTION → owed at T-8.** Not a defect in this diff and **not a Pivot**: §6.7 pins the `changes` envelope, while `acknowledged` is a separate top-level column §6.7 simply does not mention — an omission in the design, not an error in it. Resolve when T-8 implements the acknowledgement gate; surfaced to the user at the Phase A gate. |

#### Decisions made

- Single-Reviewer lens-checklist mode (not parallel lenses): effort `high` puts T-2 in the checklist row, and the task touches no migration, security, or data-loss surface.
- **A-14 recorded as an open design question rather than escalated as a Pivot.** The spec is neither wrong nor unviable; it is silent on one column. Escalating would reopen the spec and re-run its approval gate for something T-8 can resolve in place.

#### Issues encountered

None requiring rework. One Leader-side brief defect (the `DIFF_PLACEHOLDER`), corrected before it cost a round.

#### Final verification result

`npm test -- --silent actor-audit` → **30/30 PASS** · full backend suite 64 suites / 834 tests green · eslint clean · build clean.
