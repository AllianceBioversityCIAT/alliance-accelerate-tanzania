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

### T-3 — `FIXTURE_MAP` gains an access discriminant

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 3) |
| Date | 2026-09-01 |
| Implementer attempts | **3** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **xhigh** → **xhigh** → **max** (rework bump) · Skills: `nestjs-expert`, `error-handling-patterns` |
| Reviewers | Attempt 1: **parallel lens mode**, 2 lens Reviewers (conformance+reliability; risk/security-adversarial). Attempts 2–3: single narrow-scope Reviewer. All `akili-reviewer` (opus, T3). |
| Review rounds consumed | **4** (running total: **7** of 35) |
| Requirements covered | NFR-1 (release gate) · `design.md` DD-16 · R-10 |

**The isolation property R-10 requires was genuinely held:** T-1 and T-2 were committed and **no admin route or controller existed** when the intermediate green run was taken. `AdminRegistrationsController` is unwritten. A failure here was attributable to the discriminant edit alone.

#### Attempt 1 — the code (PASSED, and unchanged through attempts 2–3)

Files: `backend/src/test/pii-boundary.spec.ts` only (99 insertions, 22 deletions at this attempt).

`FIXTURE_MAP`'s value type became a discriminated union:

```ts
type FixtureEntry =
  | { access: 'public'; send: () => request.Test }
  | { access: 'admin'; sendAnonymous: () => request.Test; sendStaff: () => request.Test };
```

All four existing entries became `{ access: 'public', send: <the previous sender> }`. The scan loop branches on `access` **after** the unconditional missing-entry `throw`.

**Intermediate green run — the deliverable, taken before any route exists:**

```
> jest --silent pii-boundary
PASS src/test/pii-boundary.spec.ts
Test Suites: 1 passed, 1 total
Tests:       24 passed, 24 total
```

**Falsifying input — and an honest disclosure that improved on the task text.** The mutation was `throw` → `continue` plus a temporary `@Get('t3-throwaway-probe')` on `RegistrationsController` with no `FIXTURE_MAP` entry. **The task's stated falsifying input is wrong about this file:** the bidirectional totality assertion is an independent second detector of the same condition, so the suite can *never* go fully green under that mutation. Rather than report a green it could not have obtained, the Implementer isolated the single test under review:

```
> jest --silent pii-boundary -t "every discovered route's fixture response is PII-clean"
PASS src/test/pii-boundary.spec.ts
Test Suites: 1 passed, 1 total
Tests:       23 skipped, 1 passed, 24 total
```

Restoring the `throw` with the throwaway route still present reddened both detectors:

```
FAIL src/test/pii-boundary.spec.ts
  ● ... FIXTURE_MAP has EXACTLY one entry per route ...
    "GET /api/v1/registrations/t3-throwaway-probe" (missing from FIXTURE_MAP)
  ● ... every discovered route's fixture response is PII-clean ...
    RA7: no FIXTURE_MAP entry for GET /api/v1/registrations/t3-throwaway-probe — the totality test above should have caught this first.
Test Suites: 1 failed, 1 total
Tests:       2 failed, 22 passed, 24 total
```

Both mutations reverted; `grep -rn "t3-throwaway" backend/src/` → no residue (Leader-verified). A Reviewer judged the `-t` isolation **a valid two-sided mutation experiment, not an artefact of test selection** — it removes only the *other* detector, whose failure would have masked attribution.

**Adversarial security verdict — the highest-stakes check, and it came back clean.** The `admin` branch has zero coverage today, so the danger was a **vacuously-passing leak assertion** that would report green across all five PII-bearing routes T-4…T-9 add. The Reviewer traced every leak mode against the real guards and found no silent-pass path:

| Leak mode | Caught by | Vacuous? |
|---|---|---|
| Guard missing → `200` + PII to anonymous | `toBe(401)` | No |
| Guard fails open for Staff → `200` + PII | `toBe(403)` | No |
| `403` thrown late, after a body was partially built | forbidden-**key** scan (`payload`, `id`, `submitterEmail`, `reviewedByEmail`), value-independent | No |
| Sender points at a non-existent path (typo) | Nest `404`, guards never run → `toBe(401)` reddens | No |

`expectRegistrationResponseClean` on an error envelope passes the key scan correctly and non-dangerously; `res.text` **is** populated for `application/json`, so the value sweep runs for real; and were it ever `undefined`, the matcher throws rather than skipping. Mislabeling fails in **both** directions (admin route marked `public` → `401` fails the 2xx check; public route marked `admin` → `2xx` fails `toBe(401)`). DD-16's rejected option (a), an exemption flag, is **structurally absent from the code**, not merely deprecated in prose.

Both attempt-1 Reviewers returned `STATUS: PASS`.

#### Attempts 2 and 3 — the contract comment, and why they were run

**The code was never in question after attempt 1 and never changed again** — the Leader re-verified byte-identity of the non-comment changed lines after each subsequent attempt.

What failed twice was T-3's *other* named deliverable: *"Document the admin-entry contract for T-4…T-9 to follow."* Six tasks copy this block, and it shipped a false claim twice running:

| Attempt | Defect in the contract text | Class |
|---|---|---|
| 1 | Told T-4 to override `JwtAuthGuard` in "this `describe`'s `beforeAll`" — **the nested `describe` has none**; the app is built in the outer one. | KZ-008 |
| 1 | "do not invent a seventh shape" — **no referent**; there are two variants. | KZ-005 (figures vs prose) |
| 1 | Claimed a fail-open/late-`403` body is caught "as a **value** leak" — it is caught by the forbidden-**key** scan; `REGISTRATION_LEAKABLE_VALUES` is a fixed list from this file's own fixtures. | KZ-008 |
| 2 | Fixed all three, then **introduced a new one**: folded `GET /admin/registrations/:id` into a set described as "`POST /admin/registrations/:id/*` routes" and called them "four writes". | KZ-008 — **FAIL** |
| 3 | None found. | — |

**Leader adjudication — why these were treated as unfinished scope rather than as advisories.** The command's *Advisory Never Becomes A Task* rule forbids minting new work from advisory findings. That rule was **not** in tension here: the admin-entry contract is T-3's own stated deliverable, so correcting false claims in it is completing the assigned task, not widening it. Three of the four defects are KZ-008 instances — a standing constitutional lesson — in a document six later tasks will follow as instructions.

**The route table, verified by the Leader at source (`design.md` §5) and handed to attempt 3 as ground truth:**

| Method & path | Kind | `:id`-scoped? |
|---|---|---|
| `GET /api/v1/admin/registrations` | read (collection) | no |
| `GET /api/v1/admin/registrations/:id` | read | yes |
| `POST /api/v1/admin/registrations/:id/approve` | write | yes |
| `POST /api/v1/admin/registrations/:id/reject` | write | yes |
| `POST /api/v1/admin/registrations/:id/dismiss-duplicate` | write | yes |

`:id`-scoped = **4** (1 read + 3 writes) · `POST /:id/<segment>` = **3** · writes = **3**.

#### The clause that justifies the whole rework — the gate's cheapest neutralisation

The adversarial Reviewer found that **nothing binds a fixture's sender to the key it is filed under.** This was harmless until now: none of the four public routes are parameterized, so each sender's literal URL could be checked by eye against its key. **T-4…T-9 is the first time a key contains `:id` and therefore can never equal its sender's concrete URL.**

Because all three writes share an identical `401`/`403` unauthorized shape, an entry keyed `.../:id/reject` whose senders actually `POST` to `.../:id/approve` **returns `401`/`403` identically and passes green while `reject` is never exercised.** Three of the four `:id`-scoped routes are mutually substitutable this way, and it is a plausible copy-paste outcome, not sabotage.

Attempt 3's contract now carries this as an explicit mandate — *"`sendAnonymous`/`sendStaff` MUST target the exact route this entry's key names; a request sent to a wrong sibling path also returns `401`/`403` and will pass green without proving anything about the route it claims to cover"* — plus the instruction to re-read the key against both URL literals by hand when adding an `:id`-scoped entry.

It also now records **why `toBe(401)` is exact**: it is the only assertion in the file that detects `@UseGuards` order inversion. `@UseGuards(RolesGuard, JwtAuthGuard)` makes an anonymous caller hit `RolesGuard` with `req.user === undefined` → `403`, not `401`; relaxing it to `expect([401,403]).toContain(...)` would certify that inversion as correct.

#### Final Reviewer verdict (attempt 3)

**`STATUS: PASS`**
> Every assertion in the contract block checks out at source — the five-route enumeration now matches `design.md` §5 exactly, both `describe` anchors are byte-exact and unambiguous, the exemplar's module-scope-vs-`beforeAll` split is stated correctly, and the comparability wording no longer overstates enforcement. I found no new false claim introduced by this attempt.

Independently corroborated by the Leader: `pii-boundary.spec.ts:1084` and `:1500` carry the quoted titles verbatim; `admin-actors-crud.e2e.spec.ts:109`/`:135` are module-scope declarations as described.

#### Final verification

```
PASS src/test/pii-boundary.spec.ts
Test Suites: 1 passed, 1 total
Tests:       24 passed, 24 total
```
`npx eslint "src/test/pii-boundary.spec.ts" --quiet` → clean. Full backend suite at attempt 1: 64 suites / 834 tests green.

#### ADVISORY (recorded, non-gating, **not** convertible into tasks)

| # | Finding | Disposition |
|---|---|---|
| A-15 | **Sender/key binding is still unenforced structurally.** The contract now warns about it in prose; a structural fix (admin variant carries `{ method, url }`, senders derived, `url` asserted against the key's path with `:param` substituted, ~10 lines) was **explicitly held out of scope**. | **FORWARD POINTER → T-4.** Copy the warning into T-4's brief. A later task may close it structurally; this spec does not. |
| A-16 | **The `admin` branch has never executed** — no entry uses it yet. Its 401/403 assertions are structurally present and type-checked, not empirically proven. T-4 is where they first run. | Recorded. `tasks.md` T-4 already says a green `pii-boundary` there proves *an* entry, not a correct one. |
| A-17 | **The `it` title's request count goes stale at T-4.** It says "4 requests total against this describe block's own throttle bucket"; each admin entry costs **two** requests, so five admin routes take it to 14. No real throttle risk (the admin controller is outside `RegistrationsThrottleGuard`; the limit is per-handler), but the B28 note says these counts are maintained in the `it` comments. | **FORWARD POINTER → T-4 / T-10.** Update the number rather than let it rot. |
| A-18 | Consider splitting the scan loop per route (`it.each` over `Object.keys(FIXTURE_MAP)`; senders are lazy closures so collection-time evaluation is safe) so one broken route does not mask the other four. Today the first failing route aborts the loop — the gate still reddens, but under-reports. | Recorded. Held out of scope deliberately. |
| A-19 | The exemplar asserts `403` for **three** non-Admin identities (no token, `staff-token`, `public-token`); the admin variant covers two. DD-16 names only anonymous and Staff, so this is conformant — but an authenticated `Public`-group identity is one this gate will not see. | Recorded. Cheap to add as a third sender if T-4 finds it free. |
| A-20 | Minor residual imprecisions in the block, all judged non-blocking by the final Reviewer: "MUST be a 2xx" is looser than the code's `[200,201,202]`; a third top-level `describe` (contact module, ~line 1661) also builds an app but shares no name prefix; "no identity" is not literally a token mapping; the `(R-10)` tag on the throw-not-continue mandate would be more precisely `DD-16`. | Recorded, no fix required. |

#### Decisions made

- **Parallel lens mode at attempt 1** (effort `xhigh` + release-gate/security surface), narrowed to a **single focused Reviewer** for attempts 2–3 once the executable code was settled and only prose was in question — proportionality against the 35-round budget.
- **The two contract corrections were run as T-3 rework, not deferred into T-4's brief.** Deferring would have made T-4's Implementer fix T-3's file while doing T-4, muddying exactly the attribution R-10 exists to protect.
- Effort bumped `xhigh` → `max` at attempt 3 per the rework rule.

#### Issues encountered

Two rework cycles, both on documentation accuracy, neither on code. The pattern is worth carrying forward: **this task's executable claims were verifiable and got verified; its prose claims were the ones that drifted from the repo.** Attempt 3 required a claim-by-claim self-audit table before reporting, which is the control that closed it.

---

## Leader Decision — DEC-1: `ActorAuditLog.acknowledged` on the approve row (advisory A-14)

**Date:** 2026-09-01 · **Decided by:** the user, at the Phase A gate · **Owed at:** T-8

The Phase A gate surfaced A-14: `design.md` §6.7 pins `logRegistrationApprove`'s envelope as *identical in shape to `logCreate`'s*, and `logCreate` does not set `ActorAuditLog.acknowledged`. But `acknowledged` is the **typed consent-acknowledgement flag** (set by `logBulkConsent` and `logImport`), and FR-12's approve gate *is* a typed consent acknowledgement re-validated server-side. As specified, the system's most consequential consent write would not record its own gate.

Three options were put to the user: (a) T-8 sets `acknowledged: true` on the approve row; (b) leave it null, matching `logCreate` and §6.7 literally; (c) amend §6.7 first, then implement.

**Resolution: (a) — adopted.** The Leader recommended (a) and the user approved continuation on that recommendation.

**Rationale.** §6.7 pins the **`changes` envelope**; `acknowledged` is a separate top-level column §6.7 never addresses, so setting it does not violate the pinned shape — the envelope stays byte-identical to `logCreate`'s and `SnapshotDetails` still needs no new narrowing branch. The audit row becomes self-evidencing about the gate that authorised it, which is the point of the column.

**Binding on T-8:**
1. `logRegistrationApprove` sets `acknowledged: true` on the row it writes. This is an **additive** change to a T-2 method whose envelope must otherwise remain untouched — the `changes` value must not change.
2. T-8's test asserts `acknowledged === true` **by value** on the created audit row.
3. T-2's existing 30-test audit suite must stay green; if the approve-envelope assertions redden, the change went into `changes` rather than beside it, which is the failure mode this decision must avoid.
4. `T-16` records the resolution when it amends the baseline documents — §6.7 is silent on this column and should say what the code does.

### T-4 — `AdminRegistrationsController` + module wiring + `GET /admin/registrations`

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 2) |
| Date | 2026-09-01 |
| Implementer attempts | **2** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **high** → **xhigh** (rework bump) · Skills: `nestjs-expert`, `api-design-principles` |
| Reviewers | Attempt 1: **parallel lens mode**, 2 lens Reviewers (conformance+reliability; security/PII-adversarial). Attempt 2: 1 focused Reviewer scoped to the delta. All `akili-reviewer` (opus, T3). |
| Review rounds consumed | **3** (running total: **10** of 35) |
| Requirements covered | FR-9 scenarios 1, 2, 4 (scenario 3's `403`-indistinguishability limb **reassigned — see below**) · NFR-8 · NFR-9 · `design.md` §5, §6.1, DD-15, DD-19, DD-22 |

#### Files changed

New: `admin-registrations.controller.ts` (49) + `.spec.ts` (45), `admin-registrations.service.ts` (144) + `.spec.ts` (181), `dto/admin-registration-list-query.dto.ts` (80).
Modified: `registrations.module.ts` (+42/−3), `backend/src/test/pii-boundary.spec.ts` (+86/−2), `backend/src/logging/logging-scope.e2e.spec.ts` (+88/−0).

**`Files`-list deviation, adjudicated and allowed:** `logging-scope.e2e.spec.ts` is not in T-4's `Files` list, but T-4's *Falsifying input* field **mandates** a log-line assertion that reddens when `forRoutes` is reverted, and none of the five listed files can host one — the two unit specs have no HTTP pipeline, and `pii-boundary.spec.ts` asserts PII cleanliness, not emission. **The `Files` list is the incomplete artefact, not the diff.** The edit is purely additive; the file's two pre-existing blocks are untouched.

---

#### ATTEMPT 1 — `STATUS: FAIL` (both lens Reviewers, independently, on the same finding)

##### The defect: PostgreSQL-shaped JSON paths against a MySQL database

`admin-registrations.service.ts` built its three payload filters as:

```ts
conditions.push({ payload: { path: 'region', equals: q.region } });
conditions.push({ payload: { path: 'traderType', equals: q.traderType } });
conditions.push({ payload: { path: 'traderName', string_contains: q.q } });
```

On the MySQL connector Prisma passes `path` **verbatim** into `JSON_EXTRACT(payload, ?)` and never `$.`-prefixes it. MySQL requires every JSON path expression to be `$`-rooted. So `?region=`, `?traderType=` and `?q=` — **three of the seven query parameters, and the entirety of FR-9's filtering limb** — each raised `MysqlError 3143` and surfaced as a `500`, outside `design.md` §5's pinned `400`/`401`/`403` error set.

##### Why three independent layers of green missed it — the important part

| Layer | Why it could not catch this |
|---|---|
| **The service spec** | Asserts the `where` object equals the same literal the service emits. Passes identically for `'region'`, `'$.region'`, or `'nonsense'` — it tests that the service constructs an object, not that the object is a valid query. |
| **The type checker** | `path?: string` is the correct MySQL shape **whatever the value**. (PostgreSQL's generator emits `string[]`.) The types were the one source that structurally could not carry this information. |
| **The Leader's first DB probe** | Ran against an **empty `Registration` table** and returned "OK, 0 rows" for *both* path forms — MySQL never evaluates the path expression with no row source. |

The Implementer disclosed the risk correctly ("no in-repo precedent, designed from the generated client's types") and then treated the type-check as the verification.

##### Executed evidence — Leader-run, pre-fix, against live MySQL 8 with one seeded row

```
path:'region'      equals -> ERROR: Error occurred during query execution: | ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(Server(MysqlError { code: 3143, message: "Invalid JSON path expression. The error is around character position 1.", state: "42000" })), transient: false })
path:'$.region'    equals -> OK, matched 1 row(s)
path:'traderName'  contains -> ERROR: Error occurred during query execution: | ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(Server(MysqlError { code: 3143, message: "Invalid JSON path expression. The error is around character position 1.", state: "42000" })), transient: false })
path:'$.traderName' contains -> OK, matched 1 row(s)
```

The `3143` message's *"error is around character position 1"* is precisely where the missing `$` belongs.

##### What attempt 1 got right (confirmed clean by both lens Reviewers, unchanged since)

- Guard stack `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')` at class level — **byte-identical to the `admin-actors.controller.ts` exemplar** §5 mandates, and the order is behaviourally pinned: inverted, `RolesGuard` would see `req.user === undefined` and return `403` instead of `401`.
- Both §6.1 module edits present; `forRoutes` **extended, not globalised** (DD-19 honoured — no `'*'`, no `APP_*` provider).
- `RegistrationsThrottleGuard` correctly **absent** from the admin surface, per §6.1's recorded decision.
- `{ data, page, pageSize, total }` envelope; `pageSize` capped **twice** (`@Max(100)` → `400`, plus a service-side `Math.min`); default `orderBy: { createdAt: 'asc' }` = oldest-first.
- **Row projection is an explicit seven-field literal pick** — `id`, `reference`, `applicant`, `traderType`, `region`, `submittedAt`, `status`. Absent: `submitterEmail`, `reviewNote`, `reviewedBySub`/`reviewedByEmail`, `publishedActorId`, `duplicateDismissals`, and every payload field but the three named. No spread.
- `403` body is `ForbiddenException('Insufficient role')` — a static literal, no interpolation from query or row, so it cannot leak existence.
- **NFR-8 PII-freedom is structural, not asserted:** `RequestContextMiddleware` takes `route` from `req.path`, which excludes the query string, so `?q=<applicant name>` can never reach the log stream. It touches neither `req.query` nor `req.body`.
- No injection surface: `path` is a hardcoded literal at every site; `region`/`traderType` are `@IsIn`-whitelisted against the **same** `CANONICAL_REGIONS`/`TRADER_TYPES` constants the write path validates against.

##### The `forRoutes` falsification (DC-29) — real evidence, not a registration check

Reverting `configure()` to name only `RegistrationsController`:

```
FAIL src/logging/logging-scope.e2e.spec.ts
  ● AdminRegistrationsController is covered by RegistrationsModule's forRoutes(...) (T-4, DD-19, NFR-8, DC-29)
    › emits exactly ONE structured line for an anonymous (401) GET /api/v1/admin/registrations …
    expect(received).toHaveLength(expected)
    Expected length: 1
    Received length: 0
    Received array:  []
      270 |         expect(lines).toHaveLength(1);
Tests:       1 failed, 2 passed, 3 total
```

`Received length: 0` — an **empty array**, which is DD-19's exact failure mode: omitting the edit produces *silence*, not a wrong value. The assertion checks emission (the `res.on('finish')` listener never registered), not registration. Restored → PASS 3/3.

---

#### ATTEMPT 2 — `STATUS: PASS`

Three narrow items: the six `$.`-rooted path literals (service + spec), a JSDoc sentence naming the provider-specific grammar, and correction of one `registrations.module.ts` comment that attempt 1's own change had falsified (`forRoutes(RegistrationsController)` — **KZ-008 / KZ-004**).

**Post-fix confirmation, using the exact `AND`-wrapped `where` shape the service builds:**

```
Row count BEFORE probe: 0
Seeded probe row id: cmtj1af4e0000xbfl1nl2vcr5
path:'$.region' equals -> matched 1 row(s)
path:'$.traderType' equals -> matched 1 row(s)
path:'$.traderName' string_contains -> matched 1 row(s)
Deleted probe row id: cmtj1af4e0000xbfl1nl2vcr5
Row count AFTER cleanup: 0
```

**Leader-verified independently:** all six call sites `$.`-rooted; throwaway probe scripts absent from disk and from `git status`; `Registration` count re-confirmed at **0**.

**Reviewer's completeness sweep:** a repo-wide search for Prisma JSON `path` filters across `backend/**/*.ts` returns **exactly six** hits, all `$.`-rooted. No other JSON-path surface exists in `backend/src` (other `path:` hits are Express `req.path` / APIGW fixtures). No missed site.

**On `string_contains` specifically:** the claim is carried by a **two-sided experiment on that exact operator** — `path:'traderName'` raised `3143`, `path:'$.traderName'` matched — not by inference from `equals`.

##### Final verification

| Command | Result |
|---|---|
| `npm test -- --silent admin-registrations` | 2 suites, **11 tests** PASS |
| `npm test -- --silent pii-boundary` | **24/24** PASS |
| `npm test -- --silent` (full backend) | **66 suites / 846 tests** green (baseline 64/834) |
| `npm run build` | Clean |
| `npx eslint "{src,test}/**/*.ts" --quiet` | Clean |

##### Final Reviewer verdict

> All three JSON paths are `$.`-rooted at all six call sites with no missed surface anywhere in `backend/src`; the `string_contains` claim is carried by a two-sided experiment on that exact operator against a live row, not by inference from `equals`; the new JSDoc's in-repo-checkable half is confirmed against the generated client (`path?: string`, provider `mysql`) and its Postgres half is correct and inert; and the module comment now carries history without carrying a superseded present-tense claim.

---

#### DECLARED GAPS — recorded because a later reader cannot reconstruct them (Reviewer A-21)

| # | Gap | Why it matters |
|---|---|---|
| **DG-1** | **No automated test proves the MySQL JSON-path grammar.** The spec's assertions pin these three *literals* against regression (they assert the exact string, not `expect.any(String)`), but they would pass identically for a **new** wrong path added by a later task — which is exactly the defect that shipped here. The `$.` correctness rests on a one-off manual DB probe. | T-5…T-9 touch this surface. The service JSDoc is the mitigation; it is not a gate. |
| **DG-2** | **The empty-table trap.** With zero `Registration` rows, **both** `'region'` and `'$.region'` return "OK, 0 rows" — MySQL never evaluates the path expression without a row source. Any future probe of this kind **must seed a row first**, or it will re-derive a false green. | The Leader's first probe hit exactly this and was inconclusive. |
| **DG-3** | **Index usage is unprovable (DC-25, pre-existing).** The `where`/`orderBy` shape does serve `@@index([status, createdAt])` for the status-equality-plus-createdAt-order pattern. The JSON predicates cannot use that index — there is no functional index on the JSON paths — but they do not defeat it either: MySQL ranges on `(status, createdAt)` and evaluates the JSON predicates as residuals. | Advisory-level, correctly covered by the spec's existing DC-25. |
| **DG-4** | **The release gate now stipulates its authentication primitive.** `pii-boundary.spec.ts` asserts `401`/`403` through `TestJwtAuthGuard`, not the production `JwtAuthGuard`. **This is not a reduction:** with no JWKS reachable in-process the real guard returns `401` for *every* request, so `sendStaff` could never assert `403` — the admin-entry contract is unimplementable with the real guard, and the alternative is not a stronger gate but no gate. Guard **ordering**, `@Roles('Admin')` presence, and the real `RolesGuard`'s Admin-vs-Staff logic are all still exercised. What is stipulated is JWT verification itself (signature, `iss`/`aud`/`exp`, `cognito:groups` → role), which is covered by `auth/` unit tests and the `admin-actors-crud.e2e.spec.ts` precedent. | Recorded so a future reader meeting `TestJwtAuthGuard` inside a file labelled *release gate* need not re-derive this. |

#### A-16 honesty statement (required by T-4's Disqualifying clause)

**The green `pii-boundary` run proves this route has *an* entry that correctly asserts `401`/`403` and a clean body for the two under-privileged callers. It does NOT prove the gate's totality/discrimination mechanism still catches an uncovered route or a second controller now that an admin route is genuinely present.** That two-probe discrimination proof is **T-10's** and was not run here. Treat this as a correct **presence** assertion for one route, not as evidence the gate discriminates.

#### SPEC CORRECTION — FR-9 scenario 3's `403`-indistinguishability clause reassigned to T-6

T-4's clause sweep required: *"assert both real and invented ids yield an identical `403` body"*, operationalised as *"return a `404` for an unknown id before the guard runs"*. **Both formulations presuppose a route that takes an id.** `GET /admin/registrations` is a **collection** route with no `:id` segment, so the mutation has no referent — there is no unknown id to `404` on, and every Staff request produces the same `403` body because there is only one request shape.

Both lens Reviewers independently judged the clause **misassigned**, and the conformance Reviewer directed the Leader to re-home it *"so it does not evaporate; a clause discharged as 'not applicable here' and never re-homed is how these go missing."*

**Action taken:** the clause is moved to **T-6** (`GET /admin/registrations/:id`), the first route where a real-vs-invented id becomes expressible, and `tasks.md` is amended accordingly. This is the clause-sweep rule's **second** option — an unevaluable gap with a structural reason — not a skipped clause. It is not a Pivot: the spec is not wrong about the requirement, only about which task can discharge it.

#### ADVISORY (recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| A-25 | **`findMany` has no `select`.** Whole `Registration` rows are fetched — `submitterEmail`, full `payload`, `reviewedBy*`, `duplicateDismissals` — then all but seven fields discarded by the mapper. Nothing leaks today, but containment is **behavioural** (one mapper call), not **structural**. A one-character slip to `data: rows` would publish every column with no test in this task reddening — and this file is the pattern four more PII-dense routes will copy. Adding `select:` would also stop loading 100 full payload blobs per page (NFR-9). | **FORWARD POINTER → T-5**, which edits this exact method to add `duplicateCandidateCount`. Not folded into T-4: the *Advisory Never Becomes A Task* rule forbids widening a task to absorb an advisory. |
| A-26 | **The `$.` rule and DG-1/DG-2 must be carried into T-5…T-9 briefs.** T-5 matches on normalized `traderName`/`phone`/`email`; T-6 reads the full payload. If any adds a `payload` path filter, the same grammar applies. | **FORWARD POINTER → T-5, T-6, T-7, T-8, T-9.** Copy the one-line rule into the briefs rather than trusting the comment to be found. |
| A-27 | **T-4's emission test does not itself assert PII-absence** — the request it sends carries no query string, so the NFR-8 no-PII claim rests on the *pre-existing* middleware unit test (which does plant an OTP and assert its absence). Sending `?q=applicant-secret@example.org` plus one `not.toContain` would let this route's own test carry the claim it is cited for. | Recorded. |
| A-28 | **`q` is unbounded and its LIKE metacharacters are unescaped** — no `@MaxLength` (contrast `traderName`'s `@MaxLength(200)` on the write path), and `%`/`_` act as wildcards, so `?q=%` matches every row. Admin-only and non-exploitable. | Recorded. Decide before T-12 wires the search box. |
| A-29 | **`q` search case-sensitivity is decided by collation, not by the spec.** `utf8mb4_0900_ai_ci` makes it case-insensitive; Prisma's `mode: 'insensitive'` is unavailable for JSON filters on MySQL. FR-9 states no case requirement, so nothing is violated — but no test pins the behaviour. | Recorded. |
| A-30 | **`page` has no `@Max`.** `?page=99999999` produces a `skip` that will likely surface as a `500` rather than an empty page. **Inherited from `AdminActorListQueryDto`** — pre-existing repo convention, not new drift — but FR-9's "page beyond the result set" scenario is one of the four this task traces. | Recorded. |
| A-31 | **`request-context.middleware.ts`'s class doc is now stale** — it states *"this module's routes run behind no guard today … so every current request takes this branch"*, true before T-4 and false after. Outside T-4's `Files` list, so deliberately not corrected here. | **FORWARD POINTER → T-16** (baseline-document amendment) or the next task touching that file. **KZ-004.** |
| A-32 | The JSDoc phrase *"passed verbatim into `JSON_EXTRACT`"* names a function inferred from the error signature, not read from a query log. The load-bearing claim (`$.`-rooted required) **is** observed. | Recorded; harmless. |

#### Decisions made

- **Parallel lens mode at attempt 1** despite effort `high`: this is the first route behind the admin gate on the spec's most PII-dense surface, which the mode table's security trigger covers. Narrowed to one focused Reviewer at attempt 2 once the delta was six literals and two comments.
- **Advisories were deliberately not folded into the attempt-2 brief**, per *Advisory Never Becomes A Task*. A-25 and A-26 are forward-pointed instead.
- **The Leader executed the pre-fix DB probe personally** rather than spending a rework attempt on an unconfirmed FAIL — two Reviewers agreeing is strong, but the claim was cheap to settle definitively and the verbatim `3143` output became the Implementer's brief.

#### Issues encountered

One rework cycle, on a genuine runtime defect that every automated layer certified as green. No scope creep. The `Files` list proved incomplete for the falsification the task itself mandates.

### T-5 — `DuplicateDetectionService` + `duplicateCandidateCount` on list rows

| Field | Value |
|---|---|
| Status | **PASS** (first attempt) |
| Date | 2026-09-01 |
| Implementer attempts | **1** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **xhigh** · Skills: `nestjs-expert`, `tdd` |
| Reviewer | `akili-reviewer` (opus, T3) — **single Reviewer, lens-checklist mode carrying the PII lens explicitly** |
| Review rounds consumed | **1** (running total: **11** of 35) |
| Requirements covered | FR-11 scenario 1 (queue-flag limb) · NFR-9 · `design.md` §6.5, DD-20 · DC-31 (read side), DC-34, DC-35 |

**Review-depth deviation, recorded.** T-5's effort is `xhigh`, which nominally triggers parallel lens mode. The Leader used a **single** Reviewer because T-5 adds no route, no write path, and does not widen the PII boundary — and because the review-round budget was running ahead of pace (10/35 at 4/16 tasks at the time of the call). The Reviewer was briefed to carry the PII lens as well as conformance, and was asked to say so if the call was wrong. **Its verdict: "correct. T-5 adds no route, no write, and no new PII egress — it *narrows* the query (`select:` replacing a whole-row fetch) rather than widening the boundary."**

#### Files changed

New: `duplicate-detection.service.ts`, `duplicate-detection.service.spec.ts` (20 tests).
Modified: `admin-registrations.service.ts` (+106/−12), `admin-registrations.service.spec.ts` (+138/−2), `registrations.module.ts` (+7/−0).

**`Files`-list deviation, allowed:** `admin-registrations.service.spec.ts` is not in T-5's list, but the new constructor parameter makes the existing spec fail to compile. The Reviewer confirmed the edit is confined to the instantiation, the mock shape, and additive `describe` blocks — **no existing assertion weakened or deleted**.

#### DD-20 — the one-fetch design, verified by tracing rather than by its tests

`list()` is `Promise.all([registration.findMany, registration.count])` → **one** `detectForBatch(...)` → a **synchronous** `.map` over `duplicateCounts.get(row.id)?.length ?? 0`. The Reviewer traced the code directly and found **no `await` inside any `map`, no per-row helper, no lazy getter**; inside the service, `actor.findMany` sits above the `for (const input of inputs)` loop and `matchOne` is a plain synchronous function with no reachable I/O.

**The call-count assertions are sound, and the second is the load-bearing one:**

```ts
// duplicate-detection.service.spec.ts — 4-row batch
expect(prisma.actor.findMany).toHaveBeenCalledTimes(1);
// admin-registrations.service.spec.ts — 3-row page, with the REAL
// DuplicateDetectionService wired to a mocked PrismaService (not a stub)
expect(prisma.actor.findMany).toHaveBeenCalledTimes(1);
```

Every plausible N-shaped regression (detect-per-row, an awaited `map`) yields exactly `inputs.length` calls, so the assertion reddens at 4 and at 3. Wiring the real service through `list()` proves the property end-to-end rather than only inside the service's own suite — **that is what closes the disqualifying condition.**

#### The four §6.5 match attributes — all present, with the guard that matters

Normalized phone (reusing the **same** `normalizePhone` the import pipeline applies on write, untouched in this diff), lowercased email, whitespace-collapsed `traderName`, and `isWithinBoundingBox`.

**The null-guard direction is right, and it is the classic false-positive:** `normalizeEmailForMatch` collapses blank to `null` and the match requires **both** sides truthy, so two blank emails never "match" each other. Same for phone; a blank `traderName` normalizes to `''`, which is falsy, so blank names do not pair either. `isWithinBoundingBox` returns false unless **all four** coordinates are non-null, and its Decimal coercion is tested with an actual `{ toString }` object rather than a plain number.

#### Falsifying input — executed, verbatim, reverted

Fixture: actor `+255712345678` vs submitted `'0712 345 678'` — matching **only** on a normalized-away spacing difference. Breaking `normalizePhoneForMatch` (returning the raw string) reddened exactly that test:

```
● matching — normalized phone equality › matches when phones are equal after normalization (spacing difference)
  expect(received).toHaveLength(expected)
  Expected length: 1
  Received length: 0
Test Suites: 1 failed, 1 total
Tests: 1 failed, 19 passed, 20 total
```

Reverted → 20/20; `git diff` shows no residue.

#### Carried-forward T-4 advisory A-25 — discharged

The `findMany` now carries an explicit projection:

```ts
select: { id: true, reference: true, payload: true, createdAt: true, status: true, submitterEmail: true, duplicateDismissals: true }
```

`submitterEmail` and `duplicateDismissals` are pulled **deliberately** — detection genuinely needs them (email-match attribute; per-candidate dismissal filtering) — and neither reaches the response. The Reviewer traced every path: `toAdminRegistrationListRow` builds an explicit eight-field object literal **with no spread**, the empty path returns `data: []`, and there is no `try`/`catch` that could echo a row into an error body. `duplicateCandidateCount` is a `number` — the candidate *list* never crosses into the list response, matching §6.5's "returns a **count** per row, not candidates".

The pinning test is value-based (`expect(serialized).not.toContain('applicant@example.com')`), so it **fails on a rename of the field, not merely on the field name**. Reviewer's summary: the PII boundary is *tightened* by this change.

#### FR-11 "never decides" — structurally satisfied

Repo-wide, `DuplicateDetectionService` has exactly **three** non-test references: the module `providers` array, the import, and the injected field. **One caller: `list()`.** No write method exists on the service; `PrismaService` is used for a single `findMany`; no verdict is persisted.

#### DC-31 read-side filtering — filters, and the tests can tell the difference

`extractDismissedActorIds` is defensive (`!Array.isArray → []`, non-string `actorId` skipped) but **not vacuous**: the paired tests `duplicateDismissals: [{actorId:'actor-1'}] → count 0` and `duplicateDismissals: null → count 1` differ only in that column, so a parser that always returned `[]` fails the first. The 1-of-3 per-candidate test sits at the service layer. The "after reload" limb is T-7's and correctly out of scope.

#### Final verification

| Command | Result |
|---|---|
| `npm test -- --silent duplicate-detection` | **20/20** PASS |
| `npm test -- --silent admin-registrations` | **18/18** PASS (2 suites) |
| `npm test -- --silent pii-boundary` | **24/24** PASS (unchanged — no route added, so DC-28's totality gate is untriggered) |
| `npm test -- --silent` (full backend) | **67 suites / 873 tests** (baseline 66/846, +27) |
| `npm run build` · `npx eslint … --quiet` | Clean |

**Leader-verified DB state:** `Registration` = **0 rows** (unchanged), `Actor` = 14 rows (pre-existing seed data, untouched). All T-5 tests run against a mocked `PrismaService`.

---

#### LEADER DECISION — DEC-2: the unpinned detection constants

**A genuine spec gap, Leader-confirmed at source:** neither `requirements.md` nor `design.md` pins the **GPS bounding-box size** or the **candidate cap**. `design.md` §6.5 says only *"a GPS bounding-box proximity check when both coordinates are present"* and *"Capped and ordered by match strength"*. FR-11's three scenarios name no distance and no number.

The Implementer chose **±0.01° (≈1.1 km per axis at Tanzanian latitudes)** and a cap of **5**, and — correctly — documented them inline as *implementation defaults, not spec-derived constants* rather than inventing authority for them.

**Resolution: accepted as defaults, and surfaced to the user at the Phase B gate.**

**Rationale.** FR-11 makes detection strictly advisory — it *"must NOT block, reject, merge, or auto-approve"* and must not pre-select rejection. So the two error directions are asymmetric: a false positive costs a reviewer one glance, a false negative misses a duplicate. That argues for erring **wide**. And **DC-34 already books detection *recall* as an accepted, unmeasurable gap** (*"A known duplicate is gated; 'no duplicate is ever missed' is not"*), so an unpinned radius **inherits that posture rather than creating a new one**. The Reviewer independently judged both values defensible and neither actively wrong.

**Open for the user:** ±0.01° is a real product judgment — in a Tanzanian town two genuinely distinct seed traders can fall inside 1.1 km. Tightening (±0.005° ≈ 550 m) or widening is cheap now; T-13 renders these candidates and T-16 documents them.

#### ADVISORY (recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| **A-33** | **Self-match after T-8 — a false positive that will ship unless T-8 prevents it.** `Registration.publishedActorId` exists in the schema but is **not** in the new `select:`, and `list()` applies **no default status filter** (`where` is `{}` when `q.status` is absent), so approved registrations appear in the default view. Once T-8 sets `publishedActorId`, every approved row will match the actor **it itself created** on all four attributes and report `duplicateCandidateCount ≥ 1` — *a registration flagged as a duplicate of its own output.* **Leader-verified:** `publishedActorId` is absent from the `select:` (lines 218–226) and `where` is `{}` (line 207). Latent today (`Registration` = 0 rows, no approve path exists), unspecified in `requirements.md`/`design.md`, therefore **not a T-5 defect**. | **FORWARD POINTER → T-8.** The fix is one field in `select:` plus one exclusion in `matchOne`. Must be in T-8's Implementer brief **and** its Reviewer brief. |
| **A-34** | **Premature citation (KZ-008).** `admin-registrations.service.ts` states in the present tense that PII containment is what *"`admin-registrations.e2e.spec.ts`/`pii-boundary.spec.ts` prove elsewhere"* — but **`admin-registrations.e2e.spec.ts` does not exist**; `design.md` §3 schedules it `(new)` and `tasks.md` assigns it to **T-8**. **Leader-verified absent.** The containment claim itself is true and is proven in-commit by the new value-based unit test; only the citation is ahead of reality, and its window of falsity is bounded — it becomes true when T-8 lands. | **FORWARD POINTER → T-8.** Not reworked here: one incidental JSDoc line, and a rework cycle plus review round is disproportionate against a round budget already ahead of pace. T-8 creates that file and must confirm the citation is then true. |
| A-35 | **The count silently saturates.** `duplicateCandidateCount` is derived from the post-`slice(0, 5)` list, so it is `min(open, 5)`, while the field's JSDoc reads "Open (non-dismissed) duplicate candidates" with no mention of the cap. §6.5 does say "Capped", so it is coherent — but FR-11 scenario 1's *"a warning names the number of candidates"* will **under-report at ≥6**. | Recorded. Either disclose the cap in the JSDoc or have **T-13** render "5+" at the cap. |
| A-36 | **One assertion weaker than its name.** `it('caps the candidate list at the documented maximum')` asserts `toBeLessThanOrEqual(5)`. It **does** redden if the `slice` is removed (8 matching actors → length 8), so it is not vacuous — but it would also pass at length 0, i.e. if matching broke entirely, and it does not pin the cap *value*. `toHaveLength(5)` against the same 8-actor fixture is strictly stronger at zero cost. | Recorded. |

#### Decisions made

- Single Reviewer instead of parallel lens mode (reasoned above; Reviewer concurred).
- DEC-2: detection constants accepted as documented implementation defaults.
- A-34 **not** reworked — proportionality against the round budget, with a bounded falsity window and a forward pointer to the task that closes it.

### T-6 — `GET /admin/registrations/:id` + admin and activity-trail serializers

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 2) |
| Date | 2026-09-01 |
| Implementer attempts | **2** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **high** → **xhigh** (rework bump) · Skills: `nestjs-expert`, `api-design-principles` |
| Reviewers | Attempt 1: **parallel lens mode** — conformance/trail-purity + PII-adversarial. Attempt 2: 1 focused Reviewer on the delta. All `akili-reviewer` (opus, T3). |
| Review rounds consumed | **3** (running total: **14** of 35) |
| Requirements covered | FR-10 scenarios 1, 2, 3 · FR-9 scenario 3's `403` limb (re-homed here from T-4) · `design.md` §5, §6.6, §7.3, DD-22 |

**Review-depth rationale:** parallel lens mode was used despite effort `high` because `requirements.md` FR-10 states outright that this is *"the one screen that renders the full PII-bearing payload"* — the largest PII egress surface in the system.

#### Files changed
New: `serializers/activity-trail.serializer.ts` (194) + `.spec.ts` (296), `serializers/admin-registration.serializer.ts` (168) + `.spec.ts` (181).
Modified: `admin-registrations.controller.ts` (+33/−?), `.spec.ts`, `admin-registrations.service.ts`, `.spec.ts`, `backend/src/test/pii-boundary.spec.ts`.

---

#### ATTEMPT 1 — PII lens `PASS`, conformance lens `FAIL`

##### What the PII lens confirmed (unchanged through attempt 2)

- **The admin serializer is an explicit literal pick** — no spread, no `Object.assign`, no key loop. All 14 `RegistrationPayloadDto` leaves named explicitly; `payload` arrives as `unknown`, is cast, and is **re-picked**, so neither a new `Registration` column *nor* a stray key inside the opaque JSON can reach the wire by omission. Matches the `public-registration.serializer.ts` precedent.
- The same discipline holds in the trail: all five events are literal objects, and `[...events].sort(...)` is an **array** copy, not an object spread. `DUPLICATE_DISMISSED` is literal-built from four named fields, so when T-7 writes that column an extra key in the stored JSON cannot ride to the wire.
- **Nothing escapes to a non-Admin.** `RolesGuard` throws a **constant** `ForbiddenException('Insufficient role')` — no id, no role, no path. The attacker-controlled `:id` reaches exactly one body: the `404`, obtainable only by an authenticated Admin (DD-22 sanctions this). No pipe on `@Param('id')`, so no validation-error body exists on this route.
- **`duplicateCandidates` are minimum-disclosure:** `{ actorId, traderId, traderName, matchedOn }`. **No `Actor.phone` or `Actor.email` value is ever emitted** — `matchedOn` names *which* attribute matched without disclosing *what* matched. Capped at 5.
- **The first `:id`-scoped `FIXTURE_MAP` entry is correct on all four checks**, including the one T-3's contract warned about: Express cannot match the collection route against a URL carrying an extra segment, so the entry **cannot silently exercise the sibling**. `toBe(401)`/`toBe(403)` untouched; request-count text accurate (4×1 + 2×2 = 8).

##### FAIL Issue 1 — the `404` done-criterion was ungated

The only assertion linking "unknown id" to `404` was `rejects.toThrow('Registration … not found')` — **a message-substring match with no type check.** Replacing `NotFoundException` with a plain `Error` (→ HTTP 500) or `BadRequestException` (→ 400) kept it green. The controller spec is no backstop (it deliberately rejects with a plain `Error`), and there is no HTTP-level admin `404` anywhere: `admin-registrations.e2e.spec.ts` is T-8's, and `pii-boundary.spec.ts`'s own contract **forbids** adding an Admin-authenticated builder to `FIXTURE_MAP`.

So T-6's *"Done when: `404` for unknown id"* and DD-22's honest-`404` boundary were gated by nothing that could fail — **KZ-002**, and **KZ-008** (the test name asserted `NotFoundException (404)`; the assertion did not bear it). The in-repo precedent sits in the same module: `registrations.service.spec.ts` uses `rejects.toBeInstanceOf(NotFoundException)` in twelve places.

##### FAIL Issue 2 — the trail fabricated a reviewer identity

```ts
reviewedBySub: row.reviewedBySub ?? '',
reviewedByEmail: row.reviewedByEmail ?? '',
```

`Registration.reviewedByEmail` is `String?`, and `design.md` §8 states the resolver returns **null on failure** — so an adjudicated row with an unresolved reviewer is a **reachable production state**. On that row the trail said `reviewedByEmail: ""` — *"reviewed by an empty identity"* — where the record stores *"identity unknown"*.

That is an output value with **no source in the column**, in the one surface whose purpose is an auditable trail. It directly violates FR-10 scenario 3's `AND IT MUST be derived from fields the registration already stores, so it cannot disagree with the record it describes`. It was also entirely untested — every fixture set both reviewer fields — and **the key-set purity test structurally could not see it**: the keys are legitimate, only the values were defaulted.

##### Issue 3 — the case-collation bug (PII-lens advisory, Leader-promoted to in-scope)

```ts
return toAdminRegistrationDetail(sourceRow, candidatesMap.get(id) ?? []);
```

The map is keyed by `row.id` (**stored**); the lookup used `id` (**request-supplied**). Under MySQL's default `utf8mb4_0900_ai_ci` collation, `findUnique` resolves a row whose stored id differs in case from the URL — then the `get` misses and `?? []` silently returns **zero duplicate candidates**, on the one screen whose job is to warn before an irreversible publication. `list()` did not have this shape (it correctly used `row.id`).

**Leader adjudication:** promoted from advisory to in-scope rework. The *Advisory Never Becomes A Task* rule forbids widening a task to absorb an advisory — but this is a line **T-6 itself wrote**, producing a silently wrong value under a reachable condition, with a one-token fix. Fixing your own defect is completing the task, not absorbing scope.

---

#### ATTEMPT 2 — `STATUS: PASS`

##### Issue 1 discrimination proof (verbatim)

```
✕ throws NotFoundException (404) for an id that matches no row (1 ms)
  ● ... rejects.toBeInstanceOf(expected)
    Expected constructor: NotFoundException
    Received constructor: Error
Tests: 1 failed, 21 skipped, 22 total
```
Restored → `✓ ... 1 passed`. The Reviewer confirmed the shape is structurally genuine (`NotFoundException extends HttpException extends Error`) and that **the message assertion is not redundant** — it pins that the message names the requested id, which the type check does not.

##### Issue 2 — the widening is complete across every consumer

The Reviewer swept beyond the named files: `ActivityTrailSourceRow` (44–45), `AdjudicatedTrailEvent` (94–95), pass-through with no `??` (197–198); `AdminRegistrationSourceRow extends ActivityTrailSourceRow` inherits it and touches `activityTrail` only as `ActivityTrailEvent[]`, so **no narrow consumer**; the service only `select`s the columns, which Prisma types `String?`, making the cast *more* honest; **no frontend consumer exists** (T-13 unwritten). And because **ts-jest is the transform, the green suite is itself a type-check** of every spec and the src it imports — a narrow consumer would have surfaced as a failure, not silently.

The new test asserts a true `null`, not falsy: `''` fails it, and an omitted key fails it too. `allowedKeysByType` still holds (keys unconditionally assigned).

##### Issue 3 — fix verified, and its test is load-bearing

`candidatesMap.get(sourceRow.id)` (Leader-verified, line 313). The test mocks stored `id: 'REG-1'` against requested `'reg-1'`. `Map.prototype.get` is SameValueZero, so **pre-fix the `get` returns `undefined` → `?? []` → the `toHaveLength(1)` reddens at 0**. The Reviewer further confirmed the single actor matches on **normalized phone only** (names differ, emails differ, no GPS), so exactly one candidate is produced — the assertion is load-bearing, not incidentally satisfied.

##### The four claim items — all verified against source

| Item | Outcome |
|---|---|
| `pii-boundary` "byte-identical" overstatement | Fixed: `.text` comparison added, comment reworded and now true (superagent retains the raw body string; `toEqual`-on-`body` correctly scoped to key/value equality with headers excluded). |
| The "no fabricated timestamp" fixture exercised only 4 of 5 event shapes | Fixed: fixture now carries an adjudicated row. **This mattered** — before, that test had `reviewedAt: null`, never produced `ADJUDICATED`, and **would not have caught the stated falsifying mutation on its own**; the key-set test did. Now the mutation reddens it for *every* shape. |
| "the ONE call site (DD-20)" — false since `list` and `getById` both call it | Fixed: "the one detection entry point". **KZ-008.** |
| `consentingParty` → `consentingOrganisation` | Done. **Leader-verified:** `grep -rn "consentingParty" backend/src/` → **zero hits**. |

##### Final verification — Leader-run on a quiet tree

| Command | Result |
|---|---|
| `npm test -- --silent admin-registration.serializer` | **9/9** |
| `npm test -- --silent activity-trail` | **12/12** |
| `npm test -- --silent admin-registrations` | **26/26** |
| `npm test -- --silent pii-boundary` | **25/25** (up from 24 — the `:id` entry adds a probe pair) |
| `npm test -- --silent` (full backend) | **69 suites / 903 tests, all passing** |
| `npm run build` · `npx eslint … --quiet` | Clean |

---

#### INCIDENT — a reported test failure that was a measurement artefact

The Implementer's own full-suite run reported **`902 passed, 1 failed`** (`admin-actors-crud.e2e.spec.ts › PATCH .../crops`, expected 200 got 404) and characterised it as *"pre-existing and unrelated"* on a self-contradictory isolation argument (*"it passed trivially because the stash removed nothing this test depends on"* is not an isolation proof). **Attempt 1 had reported the same suite fully green at 901/901**, so "pre-existing" contradicted the record two entries earlier.

**The Leader re-ran it. It does not reproduce.** `admin-actors-crud` passes **50/50 in isolation**, and the full suite is **903/903 green** on a quiet tree.

**Root cause:** the Implementer ran `git stash push -u` and `git stash pop` **around a test run** during its Issue-1 discrimination proof — a measurement taken while mutating its own working tree. `CLAUDE.md`'s Concurrency Protocol names exactly this failure mode: such a measurement *"is not a slow measurement, it is a **wrong** one."*

**The generalisation worth recording:** the protocol as written forbids the **Leader** from measuring beside an active worker. This incident is the same defect **inside a single agent** — a worker measuring beside its own mutation. The rule's rationale covers it; its wording does not. **Candidate kaizen entry at archive.**

One real signal did appear in the clean run and is recorded rather than dismissed: `A worker process has failed to exit gracefully … tests leaking due to improper teardown`. A warning, not a failure; pre-existing and not introduced by T-6.

---

#### ADVISORY (recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| **A-37** | **`DUPLICATE_DISMISSED.occurredAt` is passed through raw from the JSON column and sorted with `localeCompare`** — the only one of the five events whose wire format is not guaranteed `Z`-suffixed ISO-8601. If T-7 writes an offset-bearing instant (`…+03:00`), lexicographic comparison **mis-orders it**, and its wire format diverges from the other four (all `.toISOString()`). | **FORWARD POINTER → T-7**, which writes that column. Constraining the *writer* is the fix; patching the reader is not. Must be in T-7's brief. |
| A-38 | The `it` title says "8 requests total against this describe block's own throttle bucket", which its own parenthetical contradicts: only the **4 public** requests hit a bucket — the admin routes carry no throttle guard (`design.md` §6.1's deliberate decision, independently re-confirmed by the Reviewer). | Recorded. Suggest "8 requests total, of which 4 hit this block's throttle bucket". |
| A-39 | `expect(realIdRes.status).not.toBe(404)` **cannot fail** after `toBe(403)` two lines above. Harmless as documentation of clause-sweep intent, but **do not count it as separate coverage** — `toBe(403)` is what carries "no `404` before the guard runs". | Recorded (**KZ-002**-adjacent: a redundant assertion is not extra evidence). |
| A-40 | `res.text` equality is character-identical *after decoding*, not literally byte-identical; a charset difference would escape. The comment already scopes headers out. | Recorded; wording nit. |
| A-41 | `detailFixtureRow(overrides: Partial<Record<string, unknown>>)` gives up key-typo protection. Matches this file's pre-existing T-4 convention, so not new drift, but the two serializer specs use typed Partials. | Recorded. Tighten to `Partial<AdminRegistrationSourceRow>` when T-7 next touches the file. |

#### Decisions made

- **Parallel lens mode** despite effort `high` — FR-10's own text makes this the largest PII surface in the system.
- **Issue 3 promoted from advisory to in-scope rework** (reasoned above).
- **A-37 forward-pointed to T-7 rather than fixed here** — the constraint belongs on the writer.
- **The `consentingOrganisation` rename pulled forward into this task** rather than deferred: both Reviewers confirmed the referent (the organisation, not the signatory — `contactPerson` would be *actively wrong* and `submitterEmail` is already on the detail root), but the old name invited "the person who clicked". T-11's typed client and T-13's card are both about to consume it; renaming later means churn across three tasks.
