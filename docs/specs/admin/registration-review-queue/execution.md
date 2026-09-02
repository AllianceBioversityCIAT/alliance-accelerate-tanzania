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

### T-7 — `POST /admin/registrations/:id/dismiss-duplicate`

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 2) |
| Date | 2026-09-01 |
| Implementer attempts | **2** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **medium** → **high** (rework bump) · Skills: `nestjs-expert` |
| Reviewer | `akili-reviewer` (opus, T3) — single Reviewer, lens-checklist. **Reviewer concurred with the depth call**, noting the one thing it would not have accepted lightly was the write→read round trip — which is exactly where the defect was. |
| Review rounds consumed | **2** (running total: **16** of 35) |
| Requirements covered | FR-11 scenario 2 · `design.md` §4.3, §5 (decision 4), §8 |

#### Files changed
New: `dto/registration-dismiss-duplicate.dto.ts`, `admin-registrations-dismiss-duplicate.spec.ts`.
Modified: `admin-registrations.service.ts`, `.controller.ts`, both specs, `registrations.module.ts`, `pii-boundary.spec.ts`, and — at attempt 2 — `serializers/activity-trail.serializer.ts`.

---

#### THE HEADLINE FINDING — a defect living between two individually-correct tasks (KZ-007)

**T-6 was correct. T-7 was correct. The bug was between them.**

T-6 had been FAILed for coalescing a null reviewer identity to `''`, and fixed it properly: `ADJUDICATED` now carries `reviewedBySub`/`reviewedByEmail: string | null` with a JSDoc explaining that the resolver's null is *"a real, reachable production state… passed through verbatim, never coalesced"*.

T-7 then correctly persisted `dismissedByEmail: null` on resolver failure, citing that same lesson.

But T-6's **dismissal** guard in the same file still demanded a string:

```ts
typeof entry?.dismissedByEmail === 'string' &&   // ← null fails here
```

while `extractDismissedActorIds` — the *suppression* filter — needs only `actorId`. The two extractors diverge, so on `GET /admin/registrations/:id`:

- the candidate **is** suppressed from `duplicateCandidates`;
- the `DUPLICATE_DISMISSED` event **is silently dropped** from the activity trail.

**A reviewer's judgement disappears from the audit trail, and the warning it cleared disappears too** — "silence, not a wrong value", the failure mode this spec names at DC-29. It violates FR-10 scenario 3 (*"it lists a 'cleared as not a duplicate' event when that judgement **is** stored"*) and FR-11 scenario 2's final clause (*"…so the activity trail's entry is derived from a real stored fact"*).

**No test in either task could have seen it.** Each task's suite exercises only its own side of the seam. This is `docs/specs/kaizen-log.md` **KZ-007** verbatim — *"Constraint sets are conjunctive. Satisfying each member individually can still break the set; review must reason about interaction, since no test covers a defect that lives between two correct constraints"* — recurring on the exact field the previous task had been FAILed over.

**Leader scope ruling:** fixed in **T-7**, not by reopening T-6. `activity-trail.serializer.ts` is T-6's file, but the defect is T-7's — T-7 is the change that makes the state reachable, and nothing downstream would have found it (T-8/T-9 don't touch the trail, T-10 is the PII gate, T-6 was already `[x]`).

##### The gate — pre-fix run, verbatim

```
FAIL src/registrations/admin-registrations-dismiss-duplicate.spec.ts
  ● ... ROUND-TRIP — a resolver-null dismissal survives write→read ...
    expect(received).toHaveLength(expected)
    Expected length: 1
    Received length: 0
    Received array:  []
    > 296 |       expect(dismissedEvents).toHaveLength(1);
Tests: 1 failed, 11 skipped, 12 total
```

`Received length: 0` — the event did not merely lose its email, it **vanished**. Diagnosis and evidence match exactly.

##### The fix and why the guard is exactly right

```ts
(typeof entry?.dismissedByEmail === 'string' || entry?.dismissedByEmail === null) &&
```

The Reviewer verified: `undefined === null` is **`false`** (only loose `==` coerces), so a **missing key is still rejected** and T-6's skip-malformed-rather-than-throw contract survives intact; `42`, `{}`, `[]`, `true` are all still rejected. T-6's existing malformed-entry test omits **`dismissedAt`**, not the email, so it is unaffected and still proves what it did.

**The widening is complete** across every consumer — the serializer's push, `admin-registration.serializer.ts` (consumes `ActivityTrailEvent[]` opaquely, no field access), the service's producer type (already `string | null`), a same-named but module-private type that reads only `actorId`, all specs, and **zero frontend consumers** (T-13 confirmed unwritten). `backend/tsconfig.json` sets `"strictNullChecks": true`, so the green ts-jest suite is a genuine type-check of that claim.

**The round-trip test is load-bearing, not incidental.** It never hand-constructs the array it asserts on: it captures `prisma.registration.update.mock.calls[0][0].data.duplicateDismissals` — the array the **real** `dismissDuplicate` built — and feeds that exact value back as the `findUnique` row for a real `getById()`, which runs `buildActivityTrail`. Only the Prisma boundary is faked. That is a genuine write→read seam spanning both tasks, which is precisely why neither task's own suite could see it.

---

#### THE OTHER FINDING — the spec's own falsifying input is imprecise, and the Implementer proved it

`tasks.md` T-7 asserts the overwrite mutation makes **the three-candidate test** redden. It does not, and the Reviewer confirmed the reasoning is *provable rather than plausible*: with `duplicateDismissals: null → []`,

- append → `[...[], newEntry]` → `[newEntry]`
- overwrite → `[newEntry]`

**are the same value**, so no assertion over the write payload or anything derived from it can distinguish them. The three-candidate fixture starts empty, so it structurally cannot redden.

The task conflates **two distinct mutations** under one name:

| Mutation | Breaks | Caught by |
|---|---|---|
| Write only the requested candidate but **discard prior history** | dismissals from earlier sessions | the *pre-existing dismissal* test — needs prior history; candidate count irrelevant |
| Write the **whole detected set** rather than the one requested | the other candidates in the same session | the *three-candidate* test — needs ≥3 candidates; prior history irrelevant |

DC-31's own text in `requirements.md` describes the **second**; the task's `Falsifying input` line attaches the **first** to that test. Not jointly satisfiable by one test as specified. The Implementer built both and **disclosed the discrepancy rather than reporting a green it could not have earned** — the third time this spec's stated falsification has proven imprecise (T-1's was vacuous, T-4's clause was misassigned) and the second time an Implementer caught it pre-review.

**Recorded honestly (Reviewer's request):** the three-candidate test's discrimination is **argued from construction, not demonstrated by a mutation run** — the row-level alternative it guards is a *design shape*, not a one-line mutation of this write path, which holds no detected set to write. The pre-existing-history test *was* demonstrated, verbatim (`Expected length: 2 / Received length: 1`).

---

#### Other checks

**Identity (§8) is structurally server-sourced, not merely tested.** The service never receives the request body — the controller passes `dto.candidateActorId` and `user.sub` as two scalars, and the DTO declares one field. Body-sourced identity is impossible by construction. The null-resolver test asserts `toBeNull()` **and** `not.toBe('')`.

**`dismissedAt: new Date().toISOString()`** (carried-forward A-37), asserted by regex `^\d{4}-…Z$` and bracketed between before/after timestamps. The trail sorts with `localeCompare`, so an offset-bearing instant would have mis-ordered it.

**`FIXTURE_MAP`** — third admin route, second `:id`-scoped, first **write**. Both closures re-read against the key by hand; Reviewer independently confirmed they target `/api/v1/admin/registrations/<segment>/dismiss-duplicate` and not a sibling. `toBe(401)`/`toBe(403)` intact. Request count corrected to 10, with the A-38 wording fix (**only the 4 public requests hit a throttle bucket** — the admin routes carry no throttle guard).

**Body reachability:** the global pipe is `whitelist: true` without `forbidNonWhitelisted`, so unknown fields are **stripped, not rejected** — project-wide behaviour, consistent with §5 listing `400` only for the DTO's own constraints. Nothing but `candidateActorId` can reach the persisted entry.

#### Three disclosures, adjudicated (all upheld)

| Disclosure | Ruling |
|---|---|
| **Candidate validated against the `Actor` table, not against current detection** | **Upheld.** Validating against current detection would make the endpoint time-dependent (valid at T, rejected at T+1 as the match set shifts), would couple a write path to a service §6.5 defines as read-time and *"never persisted as a verdict"*, and would let detection **decide** whether a write is permitted — the one thing FR-11's title forbids. Dismissals are filtered against the current candidate set on read, so an entry naming a non-candidate is inert. |
| **Minimal `{ id, reference, status }` response** | **Upheld.** §5 names only `{ registration }` and pins no fields. Avoiding the detection call on the write path is consistent with the above. **Forward pointer → T-11**: the typed client must not expect `AdminRegistrationDetail` back. |
| **Non-atomic read-then-write** | **Advisory, not a violation.** FR-11 scenario 2 requires persistence across reloads, which this satisfies. DD-17's compare-and-set is scoped to *approval*, where a race publishes a second public record. Here a lost update **fails open** — the candidate reappears as a warning to re-clear, never a real duplicate silently suppressed. The fix would need `$executeRaw`/`JSON_ARRAY_APPEND`, disproportionate for this failure mode. |

#### Final verification — Leader-run on a quiet tree

| Command | Result |
|---|---|
| `npm test -- --silent dismiss-duplicate` | **12/12** |
| `npm test -- --silent activity-trail` | **12/12** (T-6's suite unchanged and green) |
| `npm test -- --silent admin-registrations` | **38/38** (3 suites) |
| `npm test -- --silent pii-boundary` | **25/25** |
| `npm test -- --silent` (full backend, **run twice**) | **70 suites / 915 tests green, both runs** |
| `npm run build` · `npx eslint … --quiet` | Clean |

#### ADVISORY (recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| **A-42** | **Test-suite flakiness — attribution recorded honestly rather than assumed.** Every full-suite run, **before and after this spec's changes**, emits `A worker process has failed to exit gracefully … tests leaking due to improper teardown`. Two workers reported intermittent single-test failures (`registrations-throttle.e2e`, `pii-boundary`, `admin-actors-crud.e2e`) that **do not reproduce on a quiet tree** — the Leader ran the full suite twice, green both times. Reviewer's analysis: the new dismiss suite uses plain `new` + `jest.fn()` with no Nest app, no supertest, no timers — **structurally incapable of leaking a handle**. `pii-boundary.spec.ts` boots four Nest apps, each with a matching `close()` — lifecycle symmetric, no missing teardown. All three flaky suites are app-booting, throttler-bearing, and **wall-clock sensitive**; `registrations-throttle.e2e.spec.ts` predates this spec entirely. **Verdict: pre-existing warning; plausible marginal contribution to per-worker pressure, unproven.** Cheap falsifier for later: `npm test -- --detectOpenHandles --runInBand` to name the handle. | Recorded. **Relevant to T-8**, which adds `admin-registrations.e2e.spec.ts` — another app-booting suite. |
| A-43 | Repeat dismissal of the same candidate **appends a second entry**. Filtering is unaffected (`matchOne` builds a `Set`), but the trail then shows two "cleared as not a duplicate" events for one candidate, and the JSON column grows unbounded on replayed requests. §4.3 pins no idempotency, and its *"membership is significant"* reads as set semantics. | Recorded. A no-op-if-present branch returning the same `200` would close it. |
| A-44 | Three JSDoc inaccuracies on the widened field (**KZ-008**): "already models **above**" (it is declared *below*); "this **type** used to be non-nullable, which made the guard reject a real row" — **a type cannot cause a runtime rejection**, TypeScript types are erased; the *guard* did the rejecting and the narrow type was its silent co-conspirator; and "only a **MISSING** key is rejected" — `42`, `{}`, `[]`, `true` are rejected too. | Recorded. The middle one matters most: it misnames the defect in the one comment whose job is to explain it. |
| A-45 | **The rejection side of the new disjunct is untested.** No test asserts a *missing* `dismissedByEmail` is still skipped (T-6's malformed fixture omits `dismissedAt`). Correct today, but a refactor to loose `== null` would accept a missing key and emit an event whose email is `undefined` — dropping the key from the JSON — **with nothing reddening**. One fixture line closes it. | Recorded. Coverage hardening for a future edit, not a defect in the shipped code. |
| A-46 | `''` is never *produced* on this path, but is not structurally impossible: `acting-admin.resolver.ts` returns `email ?? null`, so an empty-string Cognito `email` attribute would pass through as `''`. Pre-existing and shared identically with the endorsed `ADJUDICATED` path. | Recorded. |
| A-47 | `tasks.md` T-7's `Falsifying input` names a mutation its own named test structurally cannot satisfy. **The same wording pattern is about to be copied into T-8/T-9.** | **FORWARD POINTER → T-16** (spec amendment). Correct it to name two mutations, or specify the tighter single fixture: three candidates with **one already dismissed**, dismiss a second, assert only the third remains open — that single test reddens under *both* mutations. |

#### Decisions made

- Single Reviewer for the first write route (Reviewer concurred: no publication, no PII egress, a suppression flag on an admin-only warning).
- **The cross-task defect fixed in T-7, not by reopening T-6** — T-7 makes the state reachable, and no downstream task would have found it.
- The Implementer's contradiction of the task's falsifying input **accepted and endorsed**; two tests for two failure modes, rather than forcing one test to misrepresent both.

### T-8 — `POST /admin/registrations/:id/approve` — the transaction

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 3) |
| Date | 2026-09-01 |
| Implementer attempts | **3** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **max** → **high** → **high** · Skills: `nestjs-expert`, `tdd`, `error-handling-patterns` |
| Reviewers | Attempt 1: **three** parallel lens Reviewers — transaction/conformance, projection/PII-adversarial, carried-obligations/honesty. Attempt 2: 1 focused. Attempt 3: **none** (see the recorded decision below). All `akili-reviewer` (opus, T3). |
| Review rounds consumed | **4** (running total: **20** of 35) |
| Requirements covered | FR-12 scenarios 1–6 · FR-14 scenario 1 · NFR-2, NFR-3 · `design.md` §6.2, §6.3, DD-17, DD-18, DD-23, ADR-011 |

**This is the spec's irreversible surface — the system's only path from private submitted data to public record. There is no un-publish.** `tasks.md` PR 3: *"Review this one hardest — isolating it is the point."* Three lens Reviewers at attempt 1 was that.

#### Files changed
New: `dto/registration-approve.dto.ts`, `mail/templates/approval.template.ts`, `backend/src/test/admin-registrations.e2e.spec.ts` (481 lines).
Modified: `admin-registrations.service.ts` (+455/−5), `.spec.ts` (+582/−3), `.controller.ts`, `.controller.spec.ts`, `duplicate-detection.service.ts`, `serializers/admin-registration.serializer.ts`, `registrations.module.ts`, `actors/actor-audit.service.ts`, `mail/mail.service.ts`, `admin-registrations-dismiss-duplicate.spec.ts` (constructor signature), `pii-boundary.spec.ts`.

---

#### THE FALSIFICATION — recorded verbatim, because a spec file cites this entry for it

`admin-registrations.service.spec.ts`'s DD-18 block states the transcript *"is in the completion report / execution.md"*. **That citation becomes true here.** The mutation changed `approve` step 3's

```ts
position: payload.position ?? null,
```
to
```ts
position: (payload as unknown as { contactPerson?: string }).contactPerson,
```

and the DISQUALIFYING GATE test was re-run:

```
FAIL src/registrations/admin-registrations.service.spec.ts
  ● ... DISQUALIFYING GATE — asserts fixture VALUES absent from EVERY column ...

    expect(received).not.toContain(expected) // indexOf

    Expected substring: not "Grace Mushi"
    Received string: "{\"id\":\"actor-approved-1\",...,\"position\":\"Grace Mushi — DO NOT PUBLISH\",...}"

Tests: 1 failed, 45 skipped, 46 total
```

**The failure names the column** — `"position":"Grace Mushi — DO NOT PUBLISH"` appears verbatim in the received JSON. Source reverted; Leader-verified that `position: payload.position ?? null` is restored and that `contactPerson` appears in the service **only inside comments**.

**Why the cast is required, and why that strengthens rather than weakens the evidence.** `RegistrationApprovalPayload` deliberately declares no `contactPerson` member, so the realistic one-liner `position: payload.position ?? payload.contactPerson` **does not compile** (TS2339). DD-18 therefore has **two** defences, and the falsification demonstrates the second while the first is attested by the type:

| Defence | Mechanism | Status |
|---|---|---|
| **Compile-time** | `RegistrationApprovalPayload` omits `contactPerson`/`otherCrops` — the one-liner is a TS error on every build | Attested by the type; **guarded only by a JSDoc clause** (see A-56) |
| **Runtime** | The DC-23 by-value sweep over every `Actor` column | Demonstrated above |

The cast strips the first defence and shows the second still fires — i.e. it emulates the realistic form of the defect (someone widens the interface by one line, *then* maps the field). A Reviewer independently judged this *"genuine evidence, in fact stronger than the literal mutation."*

---

#### ATTEMPT 1 — all three lens Reviewers `PASS`

##### The transaction (lens 1)

Each of §6.2's eight steps is where the design puts it, and each *reason* holds. The conditional update `updateMany({ where: { id, status: PENDING_REVIEW } })` is **the first statement in the callback and the first statement in the method that touches the registration at all**; `count === 0` **is** the refusal, and the follow-up `findUnique` is diagnostic-only (404 vs 409 per DD-22) and gates no write.

**Double approval is closed by construction.** The Reviewer traced it under InnoDB semantics: the compare-and-set is a locking current read, so a second concurrent approval blocks on the first's row lock, re-evaluates after commit, sees `APPROVED`, gets `count = 0` → `409`. Step 8's unconditional update is safe **because step 1 took the lock first** — the ordering is load-bearing for more than the `409`, and it also blocks a concurrent *reject*. `assertAcknowledgement` and the Cognito `resolveActing` call both sit **before** `$transaction`, so no network round-trip runs while a row lock is held.

**Both `409` meanings are distinguishable**, and the `P2002` catch is genuinely narrow — the `try` block contains **exactly one statement**, `tx.actor.create`; the crop links, audit write and `publishedActorId` update all sit outside it. The Reviewer confirmed against `schema.prisma` that `Actor` has exactly **one** unique constraint besides the PK, so the message cannot misattribute today.

| Path | Message |
|---|---|
| Step 1, zero rows | `Registration ${id} has already been adjudicated` |
| Step 5, `P2002` | `An actor with traderId ${traderId} already exists` |

**Atomicity — the honest form.** `grep -n 'catch'` over the service returns three hits: two are JSDoc prose, the third is the **post-commit** `dispatchApprovalEmail` `.catch`. Inside `approve` there is exactly **one** `catch` and it re-throws. Every write is inside the single `$transaction` callback, and the "no bypass" test asserts each landed on the `tx` delegate — *a different object from the outer `prisma.*` mocks*, so a top-level bypass would have nothing to land on. **Reported as structurally asserted, never rollback-proven**, in the method doc, the describe title, and the e2e class doc, each naming DC-24.

**Step 4's provenance call.** The Reviewer checked the policy itself: `isConsentProvenanceSatisfied` returns true whenever effective method ≠ `NOT_RECORDED` and `consentObtainedAt` is non-null, and `Registration.consentAcceptedAt` is **non-nullable**. So §6.2's honesty note is factually correct — it cannot return false here. The code says *"drift protection, NOT a gate"*, and **no test asserts it as a gate**.

**Notification after commit (FR-14).** Dispatched after the awaited `$transaction`, on the destructured resolved result. `void … .catch(...)`, logging error **class name** and reference only — never the address. A mail failure cannot reject `approve()` nor roll anything back. Four proofs: a call-order array `['transaction-committed','notification-dispatched']`, rejection tolerance, an in-callback "not yet called" assertion, and an e2e forced-failure case.

##### The projection and PII boundary (lens 2)

All twelve columned payload fields land exactly where FR-12's table says, each target written once. **Two exclusions hold structurally, not by discipline** — `contactPerson` and `otherCrops` are not members of `RegistrationApprovalPayload` at all; a grep of the service returns **only doc-comment lines**. The three sourceless columns are literal `null`, not defaulted or conditional. `email: row.submitterEmail` — the OTP-verified address; the payload interface has no `email` member, so `payload.email` would not compile.

**The gate is value-based and genuinely total.** The Reviewer verified the "every column" claim rather than accepting it: `toAdminActor` maps **all 24 `Actor` columns plus `crops`**, cross-checked one by one against `schema.prisma`. There is no column the sweep cannot see.

**Nothing else leaks on the approve path.** The `409`/`404` bodies carry no payload value. The audit envelope is the §6.7-pinned full snapshot (carrying `phone`/`email`) reachable **only** through an `@Roles('Admin')` route. The mail template carries the recipient and the `reference` only — no payload field, no PII, and **not** the internal registration id. The structured log line structurally never reads `req.body`/`req.query`.

**What the created actor publishes.** `toPublic` emits only `id, traderName, region, district, traderType, capacityTons, crops, gps`. Every PII field the projection writes — `phone`, `email`, `sex`, `position`, `marketLocation` — is on the accepted-but-never-emitted list and cannot reach `Public`. The one field that becomes public *because of* this write is `gps`, gated on `consentStatus = GRANTED` — exactly what FR-12 intends and what the acknowledgement copy discloses.

##### The five carried obligations (lens 3) — all discharged

| # | Obligation | Verification |
|---|---|---|
| **DEC-1** | `acknowledged: true` on the approve audit row | Set as a **sibling** of `changes:` in the same `data` literal; `changes: this.buildSnapshot(actor)` byte-unchanged. **The forensic proof that T-2's assertions were untouched:** T-2's `execution.md` transcript carries line anchors `> 601` and `> 660`; in the current spec file, **lines 601 and 660 still carry exactly those statements** — any insertion above them would have shifted both. Asserted by value twice, against the **real** `ActorAuditService`. |
| **A-33** | Self-match false positive | `publishedActorId` in **both** selects, threaded through `toDuplicateDetectionInput`, excluded in `matchOne`. **Scoped, not blanket** — proven in both wrong directions: without the exclusion the self-test yields 1; with a blanket "skip APPROVED rows" the companion test yields 0 instead of 1. |
| **A-34** | The premature e2e citation | File created (481 lines), not a stub: value-based PII assertions over real HTTP on the exact adjacency trap, plus cross-row isolation. |
| **A-8** | `consentReference === reference` | Asserted by value; **and converted from a silent to a loud failure** by a runtime throw. |
| **A-42** | e2e hygiene | One app, `beforeAll`/`afterAll` symmetric, no timers, no `Date.now`, no sockets (Prisma overridden with a plain object), no throttle guard on admin routes. Not wall-clock dependent. |

**The A-8 throw, adjudicated.** Lens 1 flagged it as possibly repeating the step-4 "cannot fire" pattern; **lens 3 traced it more carefully and disagreed**, and the Leader went with lens 3: step 4 compares four locally-assigned constants with no I/O between assignment and check — provably unfireable — whereas the A-8 check compares a value that has round-tripped **through `tx.actor.create` → `findUnique` → `toAdminActor`**. Its failure set is small but **non-empty**, so it needs no "cannot fire" note. More importantly it does what A-8 asked: A-8's stated risk was that a relaxed assertion makes the approve row *"**silently** lose the reference"* — with the throw, divergence aborts before the audit write and the failure can no longer be silent.

---

#### ATTEMPT 2 — bounded hardening, then `FAIL`

Five items commissioned by the Leader from the attempt-1 advisories: three false-or-imprecise claims (**KZ-008**) and two converting a structural claim into a demonstrated one (**KZ-002**).

Four landed correctly:
- The falsification transcript was corrected — it had recorded `position: payload.contactPerson`, **which does not compile**, so a reader re-running it literally would hit TS2339 and might conclude the gate was broken.
- The A-8 comment stopped claiming sole authorship of a safety it shares with step 3's literal assignment.
- **The A-8 throw became a demonstrated gate.** A new test overrides `tx.actor.findUnique` to return a mutated `consentReference` and asserts `approve` rejects **and** `tx.actorAuditLog.create` was never called — proving the abort lands *before* step 7, not merely that something threw. Verified by falsification: with the throw commented out, `Received promise resolved instead of rejected / Resolved to value: {"actor": {..., "consentReference": "REG-2026-DIVERGED", ...}}`. Restored → green.
- **A coercion blind spot in the DC-23 gate was closed.** The existing sweep runs over `result.actor`, i.e. **after** `toAdminActor`, whose `toNullableNumber` coerces a non-numeric string to `null` — so a text value mis-mapped onto `gpsAltitude`/`gpsAccuracy` would satisfy the existing `toBeNull()` assertions **and vanish from the sweep**, with nothing else in the suite reddening. Two assertions now also sweep `tx.getCreatedActors()[0]`, the **pre-serialization create input**.

**But the pass introduced a KZ-008 defect of its own — in the very clause commissioned to prevent one.** The new guard JSDoc read:

> *"Do not replace this with `RawRegistrationPayload`: its `contactPerson`/`otherCrops` members are exactly what make the DD-18 adjacency mistake a compile error."*

**Inverted.** `RawRegistrationPayload` **declares** both members (Leader-verified: `contactPerson: string` at line 97), so they are exactly what would make the mistake **compile clean**. What makes it an error is *this* type's **omission** of them. The two halves of the block contradicted each other, and **the leading half argued the refactorer's case** — "Raw carries the protection" — i.e. an argument *for* the unification the paragraph forbids.

Not cosmetic: **nothing reddens on the unification itself.** Swapping the annotation changes no behaviour and all 951 tests stay green; only a *later* adjacency edit would then compile silently. This comment is the entire compile-time guard, so a clause pointing the wrong way is a guard pointing the wrong way.

#### ATTEMPT 3 — the one-clause correction

Applied the Reviewer's exact remediation text, plus one related overclaim (the transcript had attributed the *non-compilation* to the executed run; the run used the cast and demonstrated only the value leak).

**Leader-verified inline against ground truth:** the clause now reads *"…are exactly what **would make** the DD-18 adjacency mistake **COMPILE**. This type's omission of them is what makes it a compile error instead."* — correctly signed; `RawRegistrationPayload` does declare both members; `RegistrationApprovalPayload` still omits both (grep count 0).

**Recorded decision — no review round was spent on attempt 3.** The Reviewer dictated the exact replacement text and stated explicitly that *"no behavioural re-verification is needed"*; the change is two comment blocks with no design judgment remaining, and the Leader verified the corrected sentence against the two facts it asserts. Recording this so a missing round reads as a decision rather than an oversight.

#### Final verification — Leader-run on a quiet tree

| Command | Result |
|---|---|
| `npm test -- --silent admin-registrations` | **74/74** (4 suites) |
| `npm test -- --silent pii-boundary` | **25/25** |
| `npm test -- --silent actor-audit` | **30/30** (T-2's suite, untouched) |
| `npm test -- --silent` (full backend) | **71 suites / 951 tests** |
| `npm run build` · `npx eslint … --quiet` | Clean |

DB left at **0 registrations / 14 actors**.

#### ADVISORY (recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| **A-53** | **No test proves an Admin-authenticated `GET /admin/registrations` 200 body is PII-clean over HTTP.** The new e2e issues **no `GET` at all**, and `pii-boundary`'s admin variant only sends anonymous/Staff (its contract forbids an Admin-authenticated builder). That claim still rests on T-5's unit-level assertion. A 3-line authenticated `GET` asserting `res.text` carries no `submitterEmail`/payload PII is the cheapest place in the repo to close a real coverage hole. | **FORWARD POINTER → T-10** (the release gate), or T-16. |
| **A-54** | The `P2002` catch keys on `err.code` alone, not `err.meta.target`. Correct **today** because `Actor` has exactly one unique constraint — but a second `@unique` would make the `409` name `traderId` for an unrelated collision. | Recorded. Narrowing on `meta.target` would make the message's accuracy structural rather than schema-dependent. |
| **A-55** | `sendApproval` has no test in `mail.service.spec.ts`, which does cover `sendReceipt`/`sendVerificationCode` including the NFR-8 "no address in the log line" assertions. It delegates to the same private `dispatch()`, so behaviour is inherited. | **FORWARD POINTER → T-9** — FR-14 scenario 2's logging clause is T-9's trace; it should add `kind=approval` and `kind=rejection` log assertions with its own template. |
| **A-56** | **The compile-time half of DD-18 is guarded by prose alone.** No test reddens if the two interfaces are unified. A one-line type-level assertion (e.g. `@ts-expect-error` on `payload.contactPerson` against a `RegistrationApprovalPayload`-typed value) would fail to compile the moment the omission is undone, turning a prose guard into a mechanical one. | Recorded. Deliberately **not** folded in — advisory, and the Leader does not widen a task to absorb advisories. Worth doing when someone next touches that file. |
| A-57 | `deriveTraderIdFromReference` throws a bare `Error` (→500) for a non-`REG-` reference, at step 2 — i.e. after the status flip. A rollback restores `PENDING_REVIEW`, so it is recoverable, and it is unreachable today since references are always allocated with the prefix. | Recorded, not a defect. |
| A-58 | The e2e "second approval" test depends on the happy-path test having run earlier against the shared in-memory store. Jest runs `it`s in declaration order so it is deterministic, it is documented in the test, and the unit suite covers the case independently. | Recorded. |
| A-59 | `afterAll` calls `app.close()` unguarded — if `beforeAll` throws, the teardown error masks the real one. Identical to `admin-actors-crud.e2e.spec.ts`; pre-existing convention. | Recorded. |
| **A-60** | **`@HttpCode(200)`, not 201.** Unpinned by the spec; the module convention governs (`bulk/delete` 200, `import` 200, bare `create()` **201**, sibling `dismiss-duplicate` 200). An action verb on an existing resource with no `Location` header — 201 would be worse. The e2e's `.expect(200)` now pins it. | **FORWARD POINTER → T-11** (the typed client must expect 200) and **T-16** (consider pinning it in the spec). |

#### Decisions made

- **Three parallel lens Reviewers at attempt 1** — the maximum used in this spec, for the task `tasks.md` says to review hardest.
- **Lens 1 and lens 3 disagreed on the A-8 throw**; the Leader adopted lens 3's reading (the value round-trips through the DB, so the check is not vacuous) and instructed attempt 2 **not** to add a "cannot fire" note.
- **Five advisories folded into a bounded attempt 2** — three false-claim corrections (KZ-008 class, consistently treated as in-scope in this spec) and two gate-hardening additions inside T-8's own files. Five further advisories were **not** folded in and are recorded above with forward pointers.
- **No review round on attempt 3** (reasoned above).

#### Issues encountered

**The correction pass introduced a defect of the same class it was commissioned to fix — the third such occurrence in this spec** (T-3 attempt 2 did the same; T-4 attempt 2's comment fix was clean). **Candidate kaizen entry:** corrective edits to prose appear to carry a higher defect rate than the code changes they accompany, and in both occurrences the new false claim landed *inside the very artefact meant to prevent the original defect*.

### T-9 — `POST /admin/registrations/:id/reject` + `rejection-reasons.ts`

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 2) |
| Date | 2026-09-01 |
| Implementer attempts | **2** (attempt 1 stalled mid-task and was resumed — see the incident below) |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **high** → **xhigh** · Skills: `nestjs-expert`, `api-design-principles` |
| Reviewer | `akili-reviewer` (opus, T3) — single Reviewer, lens-checklist, carrying the PII lens explicitly |
| Review rounds consumed | **2** (running total: **22** of 35) |
| Requirements covered | FR-11 scenario 3 · FR-13 scenarios 1, 2 · FR-14 scenarios 1, 2 · NFR-10 · DC-32 · `design.md` §6.4 |

#### Files changed
New: `rejection-reasons.ts` + `.spec.ts`, `dto/registration-reject.dto.ts` + `.spec.ts`, `admin-registrations-reject.spec.ts` (400), `backend/src/test/admin-registrations-reject.e2e.spec.ts` (424), `mail/templates/rejection.template.ts`.
Modified: `admin-registrations.service.ts`, `.controller.ts`, `mail/mail.service.ts`, `mail.service.spec.ts`, `pii-boundary.spec.ts`.

---

#### INCIDENT — a stalled worker left a live PII probe in the tree

Attempt 1's Implementer ended with the text *"Waiting for the monitor notification before proceeding"* — **not a completion report**. The Leader checked `git status` rather than trusting the notification, and found:

**The DC-32 falsification probe was still live in `backend/src/registrations/serializers/public-registration.serializer.ts`**, spreading `rejectionReason` into the public lookup response. Nothing had been committed, so the repository was never at risk — but the probe was one commit away from putting an admin-only field on the public surface.

**Lesson, recorded:** *"the agent completed"* is not the same as *"the task is in a safe state."* Checking the tree before trusting a report is what caught it. The Leader resumed the agent with instructions to revert and finish, rather than spawning fresh, preserving 119 tool-uses of context.

**The Leader also captured the falsification evidence the stalled agent never reported** (tree quiet, no agent active) — see below.

---

#### DC-32 — the falsification, and a finding about the spec's own verification

**The task's named Verify target cannot carry this falsification.** With the probe live:

```
$ npm test -- --silent registrations-lookup
PASS src/registrations/registrations-lookup.e2e.spec.ts
Tests: 4 passed, 4 total
```

**Diagnosis (Leader, confirmed and strengthened by the Reviewer):** 3a's lookup suite has no REJECTED fixture carrying a `rejectionReason` — its fixture **type** declares only `status` and `reviewNote`, so no row even has the property and the probe's `!= null` guard never fires. Its only exhaustive assertion is `toEqual({ status: 'PENDING_REVIEW' })`, a second independent reason it is blind.

**The gates that genuinely catch DC-32:**

1. **The new reject e2e** — Leader-captured, verbatim:
```
FAIL src/test/admin-registrations-reject.e2e.spec.ts
  ● ... end-to-end: an Admin rejects with a reason and a note, under the no-op transport, and the applicant
    then reads the note (never the reason code) back through 3a's public lookup — FR-13 scenario 2, NFR-10, DC-32

    expect(received).toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

      Object {
    +   "rejectionReason": "DUPLICATE_OF_EXISTING_RECORD",
        "reviewNote": "We already list an active registrant at this location — please contact support if this is in error.",
        "status": "REJECTED",
      }

      > 337 |         expect(lookupRes.body).toEqual({
Tests: 1 failed, 6 passed, 7 total
```
2. **`pii-boundary.spec.ts`** — and it reddens **twice over**: its `REJECTED_REGISTRATION_ROW.rejectionReason` is non-null, so the rejected-fixture lookup assertion fails **and** `expectRegistrationResponseClean` fails, because `nonPublicValues()` puts `row.rejectionReason` into `REGISTRATION_LEAKABLE_VALUES`. (Note its `FIXTURE_MAP` `/registrations/lookup` entry uses the *APPROVED* row and is blind — the catching test is the rejected-fixture one further down.)

**FORWARD POINTER → T-16:** T-9's `Verify` second command should name `pii-boundary` (or the new reject e2e), **not** `registrations-lookup`. **This is the fourth time this spec's stated verification has proven imprecise** — T-1's falsifying input was vacuous, T-4's clause was misassigned to a route with no `:id`, T-7's named a mutation its own test structurally cannot detect, and now T-9's Verify target cannot exercise the leak it is meant to catch.

Probe reverted; **Leader-verified**: `git diff` on the serializer is empty, its output interface is `{ status, reviewNote? }`, the function body is byte-identical to committed, and `rejectionReason` appears solely in the *"accepted on input and NEVER emitted"* block.

---

#### ATTEMPT 1 — `FAIL`, on a premise that was itself false

The Reviewer FAILed on: *"the `400` for an **unknown** reason code is unexercised… **delete `@IsIn(...)` and every test in this change set stays green**, while `POST /reject` would then persist any string into `Registration.rejectionReason`."* It attributed the only apparent coverage to `isKnownRejectionReasonCode`, a helper with **zero production callers** (Leader-verified: `grep -rn` returned only its own definition).

**The zero-caller finding was correct. The "every test stays green" claim was not.**

The re-review Reviewer caught it, and **the Leader settled it empirically rather than by reading** — removing `@IsIn` and running the DTO spec alone:

```
    Received value has no prototype
    Received value: undefined

      82 |     const { error } = await run({ reason: 'THIS_IS_NOT_A_KNOWN_REASON_CODE' });
      83 |
    > 84 |     expect(error).toBeInstanceOf(BadRequestException);
         |                   ^

Test Suites: 1 failed, 1 total
Tests:       1 failed, 6 passed, 7 total
```

`dto/registration-reject.dto.spec.ts` — **created in attempt 1**, and running the **production** `createValidationPipe()` (*"the same factory `main.ts`/`lambda.ts` install"*) — already gated `@IsIn` through the real pipe. Mutation reverted; `reject` back to 34/34.

**The honest record:** the added e2e is a **second, HTTP-level gate**, not the first. It is genuinely worth keeping — it proves the gate through the real HTTP stack including the error envelope, which a DTO-level pipe test does not — but the rework's stated justification was wrong.

**This is the first Reviewer error in the run**, across 22 rounds, and it is recorded rather than quietly absorbed: writing *"unexercised"* into the permanent record would itself have been the KZ-008 pattern this spec keeps catching. The five other attempt-2 items were independently valid.

---

#### ATTEMPT 2 — `STATUS: PASS`

| Item | Outcome |
|---|---|
| **HTTP-level unknown-code gate** | Added, asserting the **pipe's envelope** (`details: [{ field: 'reason' }]`), not merely a status. **Mutation proof:** with `@IsIn` removed the request skips validation and reaches the service — `expected 400 "Bad Request", got 409 "Conflict"`. The Reviewer confirmed it discriminates **in any suite position**: placed above the happy path a missing `@IsIn` yields `200` *and* corrupts the shared store. |
| **`isKnownRejectionReasonCode`** | **Deleted** (function + its 3 tests). Zero references repo-wide including `docs/`; no spec mandates the export. |
| **Empty-string note (KZ-007 seam)** | Closed **on the write side**: `reviewNote: dto.note?.trim() ? dto.note.trim() : null`. `''`, `'   '`, tabs, newlines, NBSP → `null`; a note with one non-whitespace character survives and **internal newlines are preserved**, so deliberate multi-line formatting is intact. The seam is real: `toPublicRegistrationLookup` branches on `!= null`, so an empty-but-present string would have emitted `reviewNote: ""` to the applicant — and **T-14 cannot be the gate**, since a blank controlled `<textarea>` submits `''`, not `undefined`. |
| **Three KZ-008 naming corrections** | All three verified true by the Reviewer at source — including that no `PENDING_REVIEW` claim remains anywhere in the file. |
| **Attempt-line log assertions (FR-14 s2)** | Pin `'mail send attempt kind=approval'` / `'kind=rejection'` — substrings that exist **only** on the attempt line (the outcome line reads `mail send outcome`), so deleting the attempt log now reddens both. Previously `kind=…` appeared on both lines and `status=sent` only on the outcome line, so the attempt line was unpinned. |
| **Closed union (NFR-11)** | `REJECTION_REASONS_SOURCE … as const`; `RejectionReasonCode` is the five literals, not `string`; both `RejectionReason.code` and `RegistrationRejectDto.reason` typed to it. Runtime `Object.freeze` still in force on the array, each element, and the code list. Dropping `as readonly string[]` is **provably behaviour-neutral** — `class-validator` declares `IsIn(values: readonly any[])`. A sixth reason flows automatically to the union, the exports, and the DTO with no second edit site. |

#### What attempt 1 got right (Reviewer-endorsed, unchanged)

- **The end-to-end proof is genuine.** One `AppModule` instance and one shared store: the admin reject mutates the row, then **3a's real** `POST /registrations/lookup` — real controller, service, HMAC IP pseudonymisation, lookup-attempt counter, and serializer, all unmodified — reads it back. The assertion is `toEqual` (exhaustive), backed by raw-`res.text` sweeps for the reason code, the internal id, the reviewer email, and a payload contact-person value.
- **The no-op transport is genuinely selected.** `MailService` is **not** DI-overridden (unlike T-8's approve e2e): `MAIL_TRANSPORT='no-op'` + `resetMailTransport()` before boot, the real lazy factory resolves `NoOpMailTransport`, and a spy on its prototype proves the attempt reached it. **NFR-10 is proven, not asserted** — a DI-overridden `MailService` would have made the claim vacuous.
- **Clause sweep by value:** zero `actor.create` **call count** (asserted three times, on a mock that *has* the delegate so absence is counted rather than TypeErrored); consent columns equal by value **and** the `updateMany` payload never *names* them, with deliberately distinctive fixture values so a coincidental match cannot hide an overwrite.
- **The single `409` meaning** — no `traderId` derivation, no `P2002` catch, no second `ConflictException` site. Approval's second `409` was **not** copied in.
- **`FIXTURE_MAP`, fifth and final admin route** — both closures target `…/reject`, distinct from the identically-shaped `/approve` sibling; `toBe(401)`/`toBe(403)` intact; count 14 with only the 4 public requests hitting a throttle bucket. The bidirectional totality assertion is itself independent structural proof the route is registered.

#### Final verification — Leader-run on a quiet tree

| Command | Result |
|---|---|
| `npm test -- --silent reject` | **34/34** (4 suites) |
| `npm test -- --silent registrations-lookup` | 4/4 |
| `npm test -- --silent pii-boundary` | **25/25** |
| `npm test -- --silent admin-registrations` | **97/97** (6 suites) |
| `npm test -- --silent mail.service` | 9/9 |
| `npm test -- --silent` (full backend) | **75 suites / 987 tests** |
| `npm run build` · `npx eslint … --quiet` | Clean |

#### ADVISORY (recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| **A-61** | **Four of the five reason codes are pinned by no test** after the attempt-2 spec deletions — only `DUPLICATE_OF_EXISTING_RECORD` is asserted by value. A rename of e.g. `OTHER` would ship green while orphaning stored `Registration.rejectionReason` values, which the file's own docblock forbids. One line closes it: `expect(REJECTION_REASON_CODES).toEqual([…five literals])`. | Recorded. |
| **A-62** | **The reason list is served over no endpoint.** `design.md` §5 has five endpoints and none returns the reasons, so **T-14's select will hand-copy five code/label pairs across the module boundary** with nothing gating the drift. The closed union helps T-11's types but does not reach the frontend at runtime. | **FORWARD POINTER → T-14.** Must be in its brief. |
| **A-63** | The label *"Ineligible actor type for this registry"* asserts an **eligibility policy the PRD does not define** — there is no documented eligibility rule for actor type, so a reviewer selecting it records a judgement the registry has never published criteria for. The other four labels are applicant-neutral and carry no PII or accusatory framing. | **Routed to the user / product review.** Not blocking. |
| A-64 | `const row = (…) as RejectedRegistrationRow \| null` casts away Prisma's inferred `select` type; dropping a selected column later would keep compiling and fail at runtime. | Recorded. `Prisma.RegistrationGetPayload<{ select: … }>` would close it. |
| A-65 | `@MaxLength(2000)` measures the **untrimmed** string, so 2000 chars plus a trailing newline `400`s; and a note of only U+200B (not ECMAScript whitespace) still stores as present. Neither judged worth a change. | Recorded. |
| A-66 | The `rejection-reasons.ts` docblock claims a future addition/removal "is a compile error at every call site that assumed the old set" — strictly true only for *removals* and for **exhaustive** consumers (a `Record<RejectionReasonCode, …>` or `never`-checked switch). No such consumer exists yet; T-11/T-14 are the intended beneficiaries. | Recorded — **do not lean on this claim later**. |

#### Decisions made

- **The stalled agent was resumed rather than replaced**, preserving its context; the Leader captured the missing falsification evidence itself during the quiet window.
- **The attempt-1 FAIL premise was tested empirically, not accepted**, and the honest version recorded. The rework stands on its other five items.
- **A-63 routed to the user** rather than changed unilaterally — a reason label is product copy asserting policy, not an implementation detail.

### T-10 — PII release gate: discrimination proof and the by-value admin sweep

| Field | Value |
|---|---|
| Status | **PASS** (first attempt) |
| Date | 2026-09-01 |
| Implementer attempts | **1** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **xhigh** · Skills: `nestjs-expert`, `error-handling-patterns` |
| Reviewer | `akili-reviewer` (opus, T3) — lens-checklist, PII lens primary |
| Review rounds consumed | **1** (running total: **23** of 35) |
| Requirements covered | NFR-1 (release gate) · FR-9 scenario 3 · `design.md` DD-15, DD-16, DC-28 |

#### The notable result: `pii-boundary.spec.ts` needed ZERO changes

T-4 through T-9 each added its own `access: 'admin'` `FIXTURE_MAP` entry as it landed, along with the by-value sweep coverage and the corrected request-count title. **The widened gate assembled itself incrementally.** The Implementer read the file in full, found it already complete against T-10's Done-when, and declined to edit it — reasoning that re-editing a correct release gate risks exactly the collateral damage DD-16 warns about.

**This is DD-15's design working as intended.** Siting the admin controller inside the existing `RegistrationsModule` makes the gate **fail on day one** for every uncovered route (R-8, deliberate), so each task had to close its own hole rather than leaving a sweep-up for the end.

**The Leader did not accept "no change needed" on the Implementer's word.** The Reviewer verified independently against shipped code:

| Check | Result |
|---|---|
| Five route decorators on the controller, five `access: 'admin'` entries | ✔ |
| Each key's closures target **its own** route | ✔ — re-read one by one; the three write closures each carry the literal segment their key names, and both closures within each entry agree. **No sibling aliasing** (`approve`/`reject`/`dismiss-duplicate` share a shape). |
| Admin branch asserts `401` **and** `403`, both bodies swept | ✔ — including the exact `toBe(401)` form that catches `@UseGuards` order inversion |
| Sweep is **by value**, not field name | ✔ — `expect(res.text).not.toContain(leakableValue)` over fixture values, plus a key scan. A renamed field still fails. |
| Bidirectional totality intact | ✔ — and the second consumer still `throw`s on a missing entry rather than `continue`ing (R-10/DD-16 preserved) |
| Request-count prose (14 = 4 public + 5 admin × 2; only the 4 public hit a throttle bucket) | ✔ — verified against both controllers' guards |

---

#### PROBE 1 — a new route on an already-covered controller

A throwaway `@Get('t10-throwaway-probe')` on `AdminRegistrationsController`. **Verbatim:**

```
FAIL src/test/pii-boundary.spec.ts
  ● ... FIXTURE_MAP has EXACTLY one entry per route this module registers...
    expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 0
      Array [
        "GET /api/v1/admin/registrations",
        "GET /api/v1/admin/registrations/:id",
    -   "GET /api/v1/admin/registrations/t10-throwaway-probe",
        ...
  ● ... every discovered route's fixture response is PII-clean ...
    RA7: no FIXTURE_MAP entry for GET /api/v1/admin/registrations/t10-throwaway-probe — the totality test above should have caught this first.
Tests: 2 failed, 23 passed, 25 total
```

#### PROBE 2 — a second controller in the module (the one DD-15 turns on)

A throwaway `T10ThrowawaySecondController` with one route, registered in `RegistrationsModule.controllers`. **Verbatim:**

```
FAIL src/test/pii-boundary.spec.ts
  ● ... FIXTURE_MAP has EXACTLY one entry per route this module registers...
    - Expected  - 1
    + Received  + 0
      Array [
        "GET /api/v1/admin/registrations",
        "GET /api/v1/admin/registrations/:id",
        "GET /api/v1/registrations/consent-policy",
    -   "GET /api/v1/registrations/t10-throwaway-second-controller-probe",
        ...
  ● ... every discovered route's fixture response is PII-clean ...
    RA7: no FIXTURE_MAP entry for GET /api/v1/registrations/t10-throwaway-second-controller-probe — the totality test above should have caught this first.
Tests: 2 failed, 23 passed, 25 total
```

**Why probe 2 is not ceremony.** DD-15 records that siting the admin controller in a *sibling* module would have made this gate **pass** while the five most PII-dense routes in the system shipped with zero coverage — *"the green suite would actively certify it."* 3a's T-13 ran this probe pair **before any admin controller existed**. Running it now, with a second controller genuinely present, is what confirms the module-scoped derivation still walks every controller in the case it was designed against.

**Both probes run one at a time, each removed and `git diff`-confirmed before the next** — probe discipline tightened after T-9's Implementer left its DC-32 probe live in the tree.

**Removal verified three ways:** Leader `grep -rn "t10-throwaway|T10Throwaway" backend/src/` → **zero hits**; `git status --porcelain` → only the e2e file; and the **Reviewer confirmed by reading source rather than trusting `git status`** — the controller has exactly five route decorators, `RegistrationsModule.controllers` is exactly `[RegistrationsController, AdminRegistrationsController]`, and no `@Controller` anywhere in `backend/src` registers a sixth registrations route.

**The Reviewer also cross-checked the probe outputs for internal coherence** rather than taking them at face value: the Jest diff direction is correct for `expect(fixtureKeys).toEqual(derivedKeys)`; both sort positions are lexicographically correct (`:id` < `t10-…`; `/admin/…` < `/registrations/…`; `consent-policy` < `t10-…`); the second failure reproduces the `throw` literal verbatim including its trailing clause; and `2 failed + 23 passed = 25` matches the suite's known size.

---

#### A-53 CLOSED — and the mutation evidence, captured by the Leader

The carried gap: **no test proved an Admin-authenticated `GET /admin/registrations` 200 body is PII-clean over HTTP.** T-8's e2e issues **no `GET` at all** (Reviewer-verified: the only `.get(` in that file is the new one), and `pii-boundary`'s contract JSDoc **forbids** an Admin-authenticated builder — correctly, since a `200` carrying real PII to a legitimate Admin is *intended* behaviour, not a leak. So the claim rested only on T-5's unit-level assertion.

Closed in `admin-registrations.e2e.spec.ts` — the only correct home. It asserts the row carries exactly the eight-key projection and that `res.text` excludes `submitterEmail`, `contactPerson`, `position`, `district`, `marketLocation`, `phone`, `otherCrops`, GPS values, and the `duplicateDismissals` key.

**It is non-vacuous for a structural reason the Reviewer verified:** `buildPrismaMock`'s `findMany` **ignores `select`** and returns whole rows, so `list()` genuinely receives `payload` and `submitterEmail` — **the projection is the only thing keeping them off the wire.**

**The Leader ran the discrimination mutation itself** (the Implementer reported running it but did not quote the output; this spec's L-2 rule requires execution-shaped evidence recorded verbatim, not summarised). It revealed a **layered defence**:

**Step 1 — spreading `submitterEmail` into the projection alone fails at compile time:**
```
  ● Test suite failed to run

    src/registrations/admin-registrations.service.ts:176:5 - error TS2353: Object literal may only specify known properties, and 'submitterEmail' does not exist in type 'AdminRegistrationListRow'.

    176     submitterEmail: row.submitterEmail,
                ~~~~~~~~~~~~~~

Test Suites: 1 failed, 1 total
Tests:       0 total
```

**Step 2 — widening the interface first (the realistic two-step mistake) gets past the compiler, and the runtime gate then reddens naming the key:**
```
  ● Admin registrations list e2e (HTTP + in-memory Prisma) — T-10, A-53 › an authenticated Admin GET /admin/registrations 200s with a well-formed body carrying ONLY the eight-key list projection, and neither submitterEmail, payload PII beyond that projection, nor duplicateDismissals reaches the wire (A-53)

    expect(received).toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

    @@ -4,7 +4,8 @@
        "id",
        "reference",
        "region",
        "status",
        "submittedAt",
    +   "submitterEmail",
        "traderType",
      ]

      > 558 |       expect(Object.keys(row).sort()).toEqual(
      at Object.<anonymous> (test/admin-registrations.e2e.spec.ts:558:39)
```

Service restored; `git diff` empty. **Two independent gates: the closed interface, then the runtime key assertion.**

---

#### Final verification — Leader-run on a quiet tree

| Command | Result |
|---|---|
| `npm test -- --silent pii-boundary` | **25/25** |
| `npm test -- --silent` (full backend) | **75 suites / 988 tests** (987 baseline + the A-53 test) |
| `npm run build` · `npx eslint … --quiet` | Clean |

Files changed: **one** — `backend/src/test/admin-registrations.e2e.spec.ts` (+118).

#### THE RESIDUAL GAP — stated plainly, because the gate cannot close it

**Probe 2 proves the derivation is *module-complete*. It does not close DD-15's actual hazard, and cannot.** A controller sited in a sibling `AdminRegistrationsModule` remains **invisible** to a derivation rooted at `MODULE_METADATA.CONTROLLERS` of one module — the suite would go green while those routes shipped uncovered.

**Today the only defence is the DD-15 placement decision plus the `registrations.module.ts` JSDoc explaining why the controller must stay there. No test enforces it.** The file's own JSDoc states this honestly (*"pays for that with having to be explicitly walked module-by-module … rather than getting app-wide coverage for free"*).

This is structural, not a defect in this task.

#### ADVISORY (recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| **A-67** | **The sibling-module residual above.** If TRD §2/§4 is being amended anyway, that constraint deserves a sentence there rather than living only in a test-file comment and a module JSDoc. | **FORWARD POINTER → T-16.** |
| **A-68** | The scan-loop `it` title still routes readers to **`execution.md → T-13`** for the throwaway proofs. Not false — 3a's pair is recorded there — but the **current-generation pair, the one DD-15's argument actually turns on because it ran with a real admin controller present, is recorded here under T-10.** | Recorded. **This entry supersedes T-13's pair as the standing proof.** Amend the title at T-16 or leave this note as the pointer. |
| A-69 | `tasks.md` T-10's `Files:` line names only `pii-boundary.spec.ts`, while the task body directs the A-53 fix into `admin-registrations.e2e.spec.ts`. The diff follows the body, which is correct; **the `Files` line is the stale artefact.** | Recorded so the discrepancy is not later read as scope drift. |
| A-70 | The value sweep against a `401`/`403` body *reads* like an uncatchable gate. It is disclosed in the JSDoc as belt-and-suspenders, with the **key scan** and the exact **`toBe(401)`** named as the discriminating halves. | Recorded. **Must not be re-described later as a value-leak proof for admin routes** — that would be a KZ-008 instance. |

#### Decisions made

- **Declining to edit `pii-boundary.spec.ts` was upheld** — the gate was already complete, and churn on a hard release gate is a real risk (DD-16). The Reviewer verified completeness independently rather than accepting the claim.
- **The Leader ran the A-53 mutation itself** to satisfy L-2's verbatim-evidence rule, and recorded the layered type/runtime result the Implementer's summary had not conveyed.

### T-11 — `lib/api/registrations-admin.ts` — typed client

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 2) |
| Date | 2026-09-01 |
| Implementer attempts | **2** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **medium** → **high** · Skills: `vercel-react-best-practices` |
| Reviewer | `akili-reviewer` (opus, T3) — lens-checklist, **type fidelity (NFR-11) primary** |
| Review rounds consumed | **1** (running total: **24** of 35) |
| Requirements covered | FR-9…FR-13 (wire contracts) · NFR-11 · `frontend/CLAUDE.md` API conventions |

#### Files changed
New: `frontend/lib/api/registrations-admin.ts`, `registrations-admin.test.ts` (37 tests).
Modified (attempt 2): `frontend/lib/api/registrations.ts` (+8, the relocated rationale).

---

#### The mirroring is exact — verified type by type, not asserted

The Reviewer walked **all thirteen** mirrored types against their backend sources: **no union loosened, no optionality flipped, no field added, dropped, or renamed.** Highlights it checked rather than assumed:

- `AdminRegistrationPayload` preserves the serializer's **`| null` (not `?:`)** treatment across all six nullable leaves — correctly mirroring the *output* type, not the raw input type.
- `AdminConsentRecord.acceptedAtQualifier` is the single fixed literal `'RECORDED_AT_SUBMISSION'`, not `string`.
- `ActivityTrailEvent` is a **genuine discriminated union** — five separately-exported interfaces with literal `type` discriminants, narrowing verified to work.
- `AdjudicatedTrailEvent.status` correctly stays the narrower `'APPROVED' | 'REJECTED'` rather than widening to `RegistrationStatus`.

**The three carried wire facts all landed**, including the subtlest one: `dismissedBySub` is correctly left **non-nullable** (it comes from the validated JWT) while `dismissedByEmail`, `reviewedBySub` and `reviewedByEmail` are `string | null` — the T-6/T-7 FAIL fix survived the crossing.

#### The falsification is a real gate in four directions

The `never`-assertion consumer (`describeRegistrationStatus` → `assertNeverRegistrationStatus(x: never)`) was purpose-built and **declared as such**, since T-12/T-13 do not exist yet. The Reviewer judged it legitimate rather than self-serving, and catches:

| Mutation | Detected by |
|---|---|
| Union widened to `string` | `TS2345` at the `never` call site |
| Member removed | `TS2678` non-comparable case + the typed array literal |
| Member renamed | Both, simultaneously |
| Member added | `default` narrows to the new literal → `TS2345` |

**Why the two-command Verify exists:** `next/jest` uses SWC, which strips types without checking them, so `npm test` **structurally cannot** catch this defect class. That is the whole point of the task.

#### Wire assertions are real, with an honest caveat now recorded in the file

Genuinely non-echo: URL and querystring construction, `method`, `Authorization: Bearer`, and — the strongest part — the **serialized request body**, parsed out of the actual `RequestInit.body`. Error mapping is asserted by value against envelopes the Reviewer checked **verbatim against the service source** (`'Acknowledgement text does not match the required confirmation.'`, `Registration ${id} has already been adjudicated`, `Duplicate candidate ${x} not found for registration ${y}`).

The caveat, which attempt 2 wrote into the file: `expect(result).toEqual(LIST_RESPONSE)` and the `not.toHaveProperty` negatives **are** pass-through echoes at runtime — `apiFetch` returns `response.json()` untouched. Their real enforcement is `tsc`'s excess/missing-property check on the **type-annotated fixture literals**. A legitimate gate, but a different one than the header originally claimed.

**Commended by the Reviewer as exemplary KZ-002 honesty:** the file's own comment explaining that `status: 200` is a *fixture value*, not a behavioural proof, because `apiFetch` branches on `response.ok` rather than the numeric code — so the real pin is `@HttpCode(200)` on the controller.

---

#### ATTEMPT 1 — `FAIL` on two narrow items

**Issue 1 — `RegistrationStatus` was declared twice in `frontend/lib/api/`.** `registrations.ts` (chunk 3a's public lookup client) already exported a **byte-identical** union. TypeScript is structural, so nothing broke — *which is exactly the problem*: a future divergence would produce **no compile error anywhere**, only a silent mismatch, and only the new copy was protected by the exhaustive-switch harness.

**It contradicted the file's own reasoning 200 lines earlier**, where `AdminActor` is *imported* rather than redeclared *"so the two clients cannot drift on one wire shape."* The principle was applied to one type and not the other, and only the compliant half was disclosed. Repo precedent is single-declaration plus cross-module type import — `RegistrationSource` and `ConsentMethod` each exist exactly once in the whole frontend.

**Issue 2a — a doc claim the file refutes 150 lines later (KZ-008).** The header said `AWAITING_APPLICANT`/`WITHDRAWN` are values *"`list`'s `status` filter accepts and **`AdjudicatedTrailEvent`**/list rows may echo."* The `AdjudicatedTrailEvent` limb is **false** — line 196 of the same file declares `status: 'APPROVED' | 'REJECTED'` — and structurally unreachable, since `buildActivityTrail` only emits an `ADJUDICATED` event for those two statuses. **Leader-verified against both lines.**

**Issue 2b — the test header overclaimed** *"not mock echoes"* for assertions that are pass-through echoes (above).

#### ATTEMPT 2 — all three fixed, and the fix made the gate stronger

`registrations-admin.ts` now does `import type { RegistrationStatus } from './registrations'` + `export type { RegistrationStatus }`, so there is **one home** and T-12/T-13 have one import site. The still-accurate rationale moved onto the surviving declaration, with the false clause **replaced rather than edited** — the corrected text now states explicitly that `AdjudicatedTrailEvent.status` is *"a narrower `'APPROVED' | 'REJECTED'` sub-union, not this type."*

**The re-run falsification proves the fix did more than deduplicate.** Widening the now-shared union reddens **two** consumers:

```
components/register/StatusLookupForm.tsx(126,13): error TS2322: Type 'string' is not assignable to type 'never'.
lib/api/registrations-admin.test.ts(802,44): error TS2345: Argument of type 'string' is not assignable to parameter of type 'never'.
```

The first is a **real chunk-3a component**. Before the fix, the 3a copy had no consumer that would redden. **The exhaustive-switch harness now guards both clients** — which is precisely what the single-declaration rule buys.

**Leader-verified:** one `export type RegistrationStatus` remains (`registrations.ts:167`); the re-export sits at `registrations-admin.ts:42/54`; the false clause is gone.

---

#### `tsc --noEmit` — the Done-when is NOT satisfiable as written, and the honest record is stronger

**`npx tsc --noEmit` is already red on `main`, and has been since a prior spec's commit.** The Leader established this by **removing T-11's two files and re-running**:

```
app/(admin)/admin/actors/page.test.tsx(45,64): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
```

Introduced by `0158dc0` (`actors/registration-source-and-consent` T-8): `useSearchParams: (...args: unknown[]) => mockUseSearchParams(...args)` spreads into a zero-parameter `jest.fn()`. Outside T-11's change set; T-11 neither caused nor worsened it.

**Recorded disposition (Reviewer-directed):** do **not** mark the Done-when satisfied as literally worded, and do not let "tsc clean" stand. The honest form:

> `tsc --noEmit` reports **zero errors attributable to T-11**. The baseline is red with exactly one pre-existing error (`app/(admin)/admin/actors/page.test.tsx:45`, TS2556, from `0158dc0`); **the error set with T-11's files added is identical to the error set with them removed.**

The Reviewer noted this error-set diff is **strictly stronger evidence** than an exit-status check: *"a green baseline plus a green run proves only that the combination is clean, not that T-11 contributed nothing."*

**FORWARD POINTER → T-16:** amend the Done-when wording in `tasks.md`; do not silently reinterpret it.
**The baseline itself belongs in its own bugfix task** — one line — and **must not be folded into T-15**, which would mix an unrelated fix into the diff T-15's own gate is measured against.

#### ⚠️ T-15's GATE IS CURRENTLY VACUOUS — the most important finding of this task

**T-15's falsifying input reads *"remove one member from the `Record` → `tsc --noEmit` must fail."*** Since `tsc --noEmit` **already** exits non-zero on this checkout, the exit status carries **zero information** about the mutation — it reports failure both before and after. **A gate that returns the same result whether or not the defect is present is not a gate.** That is KZ-002's exact shape, arriving inside the task whose falsifying input was written to prevent it.

**T-15 must use an error-set diff, not an exit-status check:**
1. Capture the baseline: `npx tsc --noEmit 2>&1 | sort > /tmp/tsc-before.txt`, and record its contents verbatim (today: exactly one line).
2. Apply the mutation, re-run to `/tmp/tsc-after.txt`, `diff` the two.
3. **The gate is: the diff is non-empty AND the new error names the expected file and code** — `TS2741`/`TS2739` ("Property `<MEMBER>` is missing in type…") in `ActorHistoryPanel.tsx`. Assert on the **content** of the new error; an unrelated new error would otherwise pass a bare "diff is non-empty" check.
4. The post-change run must equal the baseline **exactly** — zero new entries.

The Reviewer's wider point stands regardless of the red baseline: *"even against a green baseline, '`tsc` must fail' would not have proven the failure came from the intended place."* Apply the same discipline to T-15's other falsifying input (the pre-change `IMPORT` run), quoting the jest assertion failure verbatim.

#### Final verification — Leader-run on a quiet tree

| Command | Result |
|---|---|
| `npm test -- --silent registrations-admin` | **37/37** |
| `npm test -- --silent` (full frontend) | **99 suites / 1,515 tests** (baseline 98/1,478) |
| `npx tsc --noEmit` | **The one pre-existing baseline error, and no other** |
| `npm run lint` | No errors; four pre-existing `<img>` warnings in unrelated files |

#### Two disclosures — both upheld

| Disclosure | Ruling |
|---|---|
| **`RegistrationApproveResult.actor` imports `AdminActor`** rather than redeclaring it | **Right call.** The backend's own `RegistrationApproveResult.actor` *is* `AdminActor` imported from the actors serializer — redeclaring would create a second mirror of a 24-field type the backend treats as one. `import type` erases at runtime, and `AcknowledgeDialog.tsx` sets the cross-module precedent. |
| **`region`/`traderType` typed `string`**, not the canonical vocabularies | **Upheld, and on stronger grounds than argued.** `AdminRegistrationListQueryDto` declares `region?: string`/`traderType?: string`; the vocabulary lives in the `@IsIn(CANONICAL_REGIONS)` **validator**, not the type. So `string` is an **exact** mirror of the declared contract, not a concession to consistency. |

#### ADVISORY (recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| **A-71** | **The falsification harness covers one union of six.** `RejectionReasonCode`, `DuplicateMatchAttribute`, `AdminRegistrationListSort`, `acceptedAtQualifier` and the `ActivityTrailEvent` discriminant have no `never`-assertion consumer. Typed fixtures catch *narrowing* and *renaming* on those, but **not widening to `string`** — a `string`-typed field accepts any literal. | **FORWARD POINTER → T-14.** Building `RejectDialog`'s labels as a **total `Record<RejectionReasonCode, string>`** converts the widening gap into a compile error for free — the same pattern T-15 uses for `actionBadgeClasses`. |
| **A-72** | **Path interpolation is unencoded** — `${BASE}/${id}` on all four `:id` routes, no `encodeURIComponent`. Identical to the exemplar; ids are cuids; the caller is an authenticated admin with their own token, so no privilege boundary is crossed. **But T-13 sources `id` from `?id=` in the URL**, so a crafted value containing `../` would be normalised by the URL parser and redirect the request to a different endpoint. | Recorded. Worth `encodeURIComponent` across both clients as a **separate hygiene task**. |
| **A-73** | The pre-existing `tsc` baseline error (`0158dc0`). | **Own bugfix task.** Explicitly **not** to be folded into T-15. |

#### Decisions made

- **No review round spent on attempt 2.** All three fixes were dictated verbatim by the Reviewer with exact remediation text; no type or behaviour changed; and the re-run falsification is **self-verifying and strictly stronger than before** (it now reddens a real 3a component as well as the harness). The Leader verified all three at source. Recorded so a missing round reads as a decision, not an oversight. Budget was also a factor: 11 rounds remained for five tasks at that point.

### T-12 — Queue page + `RegistrationsTable` + sidebar entry

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 3) |
| Date | 2026-09-01 |
| Implementer attempts | **3** — attempt 1 built at the `lg` starting position; attempt 2 applied the Leader's measurement (**not** a FAIL response); attempt 3 fixed the review's two FAIL issues |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **high** → **high** → **xhigh** · Skills: `tailwind-design-system`, `shadcn-ui`, `react-doctor`, `frontend-design` |
| Reviewer | `akili-reviewer` (opus, T3) — lens-checklist, tokens + absence assertions primary |
| Review rounds consumed | **1** (running total: **25** of 35) |
| Requirements covered | FR-9 scenarios 1, 2, 4, 5 · NFR-5, NFR-6, NFR-7 · `design.md` §7.2, §7.6 |

#### Files changed
New: `app/(admin)/admin/registrations/page.tsx` + `page.test.tsx`, `components/admin/RegistrationsTable.tsx` + `.test.tsx`, `components/admin/AdminSidebar.test.tsx`.
Modified: `components/admin/AdminSidebar.tsx` (the `NAV_ITEMS` entry).

---

#### THE BREAKPOINT — measured, and the measurement changed the answer

`design.md` §7.2 refuses to choose: *"Eight columns with one sticky sits between those two exemplars, and this design **does not pretend to know which side**."* It names choosing by argument as **`usage-analytics` L-1 defect #4** repeating — an accepted-set written from reasoning that went 1 → 3 → 10 across two corrections, *"both times found by measuring, never by re-reading."*

The Implementer built at the `lg` starting position and **correctly declined to decide**, making the table measurable instead. **The Leader ran the measurement** — headless Chrome via CDP at 768×900, against a 70-char worst-case applicant name, reproducing the archived `ActorsTable` method:

```
{"viewport":768,"container":481,"tableContent":1232,"frozenSticky":140,"scrollableStrip":341,"hiddenContent":751,"frozenPct":29}
```

| | **RegistrationsTable (measured)** | `ActorsTable` precedent |
|---|---:|---:|
| container | **481px** | 494px |
| frozen sticky | **140px (29%)** | ~400px (**81%**) |
| **scrollable strip** | **341px** | **94px** |
| hidden content | 751px | 1036px |

**Decision: `md`.** 341px is **3.6× the 94px** that forced `ActorsTable` to `lg`.

**The structural reason matters more than the ratio, and it is what went into the source comment.** This table's sticky column is **Reference** — a format-bounded `REG-YYYY-NNNN` code, measured at 140px. `ActorsTable`'s sticky column was `traderName`, an **unbounded** 55–60 character cooperative name that froze ~400px of a 494px container. **A reference code cannot grow with the data, so the failure mode that forced `ActorsTable` to `lg` is structurally impossible here.**

**Had this been reasoned rather than measured, "eight columns is close to nine, so use `lg`" is the plausible conclusion** — and it would have pushed tablet users onto cards for no reason. The Reviewer confirmed the record is *"faithful and structural… that would stop a re-litigation."*

The **skeleton moved to `md` too** (`page.tsx:285`, `:310`) — §7.2 warns it *"moves to the same breakpoint or it flashes the wrong shape."* No stray `lg:` gating remains in the table; the card view renders all eight columns, so nothing is lost below `md`.

---

#### What the Reviewer confirmed (attempt 2 state)

| Check | Finding |
|---|---|
| **Absence assertions** | Genuine, covering **both** forbidden segments and the flag: `toHaveLength(3)` *plus* the exact label array, `queryByText(/awaiting/i)`, `queryByText(/withdrawn/i)`, `queryByText(/no email/i)`, and a type-level `'email' in ROW_PENDING === false`. |
| **Defence in depth the Implementer did not claim** | `statusParam()` falls back to `PENDING_REVIEW` for any unrecognised value, so a hand-edited `?status=AWAITING_APPLICANT` **never reaches the API** even though the backend DTO still validates the full enum. *"The absence is enforced on the URL-read side, not only at render. That is the right shape."* |
| **Token discipline (NFR-6)** | Zero hex, zero arbitrary values. Sticky column uses opaque token backgrounds + `shadow-sticky-edge`, **never `border-r`**, with `max-w-xs truncate` on a **block-level child** not the `<td>` (the documented no-op trap). The badge triple is **byte-identical** to `ActorsTable`'s, so the claimed reuse is real. |
| **Empty-state probe** | **Sound, not fabricated** — the Reviewer verified at source that `list()` applies no default status filter, so `{pageSize:1}` genuinely measures the global total. The `systemEmpty: boolean \| null` tri-state falls back to the filtered message on probe failure. **It also avoids the R-7 defect `actors/page.tsx` still has**, which infers *"The registry is currently empty"* from filter count alone. |
| **Static export (NFR-7)** | Structurally confirmed — `useSearchParams` confined to a component reachable only through `<Suspense>`; no dynamic segment, no route handler. Build emits `/admin/registrations` as `○ (static)`. |
| **Scope adjudication** | The added `region`/`traderType`/`q` filters and sort control are **in scope, not creep** — `design.md` §7.1's route table names exactly those params, and FR-9 calls the queue *"filterable, sortable"*. |
| **Sidebar** | `NavItem` shape verbatim unchanged, no role field. The diff's column realignment is **forced** (`'Registrations'` is longer than the existing labels) — acceptable, not churn. |

---

#### ATTEMPT 3 — two FAIL issues

##### Issue 1 — `role="tablist"` without the tab widget's contract (NFR-5)

`StatusSegments` applied `role="tablist"` / `role="tab"` / `aria-selected` with **no `aria-controls`, no `role="tabpanel"`, no roving `tabindex`, no arrow-key handling.**

> A screen-reader user is told *"tab, 1 of 3, selected"* and will press arrow keys, which do nothing; there is no panel for the tab to control.

**This is the spec's own recurring shape — a presence without the behaviour it promises (KZ-002) — applied to an ARIA role instead of a segment.** And it was **invisible to every gate that ran**: axe's `aria-required-children`/`aria-required-parent` are both satisfied, and **no axe rule requires `aria-controls` on a tab**, so the green `jest-axe` result was expected and said nothing. Precisely the DC-16 blind spot.

It also broke in-repo precedent: this was the repository's **first and only** `role="tablist"`. The established pattern for a segmented control expressing selected state is **`aria-pressed`** (`ConsentChoiceControl.tsx:83,91`; `ActorListItem.tsx:50`); the only other `aria-selected` sits inside a genuine `role="listbox"`.

**Fixed** to `role="group"` + `aria-pressed={active}` — the honest contract for a control that **filters a list in place** rather than switching panels. **Leader-verified**: no `role="tab"`/`role="tablist"`/`aria-selected` remains; `role="group"` at line 250, `aria-pressed` at 257, matching the cited precedent.

**The falsification was re-run and survived the rewrite** — this mattered, because a falsifying input that stops working because its assertion was rewritten is worse than the original defect:

```
FAIL app/(admin)/admin/registrations/page.test.tsx
  ● RegistrationsPage › renders exactly three status segments, and none named Awaiting or Withdrawn
    expect(received).toHaveLength(expected)
    Expected length: 3
    Received length: 4
    Tests: 1 failed, 10 passed, 11 total
```
Reverted → 11/11. The assertion is intact at `page.test.tsx:185`.

##### Issue 2 — the test file recorded the wrong breakpoint

`RegistrationsTable.test.tsx:16` read *"Table (lg+) and card (<lg)"* while the component is gated at `md`. **A maintainer opening the paired test file — the natural first stop when changing the table — would read `lg`** and be handed exactly the contradiction §7.2 exists to prevent. §7.2's obligation is not only *measure* but **record the number**; a sibling file asserting the opposite degrades that record to a coin flip between two documents.

Fixed to `md`, with a note that **jsdom applies no breakpoints**, so the split is not verified by that render and lives in the component's class constants.

---

#### The Implementer caught its own KZ-008 defect mid-task

Worth recording, because it is the discipline this spec has spent eleven tasks trying to instil, self-applied:

> *"my first draft of this note claimed the split 'is asserted structurally, via the `TABLE_VISIBLE_CLASS`/`CARDS_VISIBLE_CLASS` constants' — I checked the test body before finalizing and found no such assertion exists (only row-count/rendering checks), so I corrected the note to say the split is **not** verified by this file. Flagging this myself since it's exactly the KZ-008 failure mode named in this task."*

#### Two reporting errors — the same failure mode, named as a pattern

The Reviewer found **two** confident claims in the attempt-2 report that the artefacts do not bear (**KZ-008**):

1. `AdminSidebar.tsx`'s modification described as *"pre-existing… not touched by me"* — it is **T-12's own** work; the file carries `// @sdd-spec admin/registration-review-queue (T-12)` and the `Registrations` entry.
2. ~~The DC-16 statement claimed *"this repo's `jest-axe` config disables `cat.color` entirely"* — **no such config exists**; there is no `configureAxe` anywhere in `frontend/`.~~ **RETRACTED at T-13 — this "correction" was itself wrong. See the T-13 entry's *Mechanism settled* section.** The Implementer's claim was **true**: `jest-axe`'s exported `axe` **is** `configureAxe()` (`node_modules/jest-axe/index.js:197`), which unconditionally disables every `cat.color` rule globally. "There is no `configureAxe` call in `frontend/`" and "the whole `cat.color` set is disabled" are **both true simultaneously** — the library calls it for you. Only item 1 (the `AdminSidebar.tsx` mis-attribution) stands.

Both were in a **report**, not in code. The conclusion of the DC-16 statement was right; the mechanism was misattributed.

#### The corrected DC-16 statement

**Contrast is *not* wholly ungated** — the original statement understated coverage in the safe direction. `frontend/lib/contrast.test.ts` is a **real automated contrast gate** running inside `npm test`, asserting ≥4.5:1 for most ink×ground token pairs this page uses.

What is genuinely ungated: **pairs outside its fixed matrix**, plus **focus order and focus visibility**.

> **⚠️ MECHANISM CORRECTED AT T-13.** The sentence originally here — *"the real mechanism is that jsdom's axe `color-contrast` rule reports `incomplete`, and `toHaveNoViolations` does not fail on `incomplete`"* — **is wrong**. The rule does not run at all: `jest-axe` exports `axe: configureAxe()`, and `configureAxe` pushes every `cat.color` rule as `enabled: false` into a **global** `axeCore.configure(...)` at module-export time. `design.md` §14 stated this correctly from the start, citing the file. The conclusion (contrast is not evaluated here) is unchanged; the mechanism was misstated. See the T-13 entry.

#### 📋 FOR THE DC-16 HUMAN CHECK — a specific number, not a general instruction

The Reviewer computed the one pairing on this screen with a concrete reason to look:

> **`PENDING_REVIEW` chip — `bg-border text-muted` at `text-xs` (12px) — computes to ≈4.45:1**, marginally under the 4.5:1 AA floor for small text. It is the dominant chip on the queue.

**No gate sees it**: `border` is not one of `contrast.test.ts`'s nine `GROUNDS`, so the pair falls outside the 7×9 matrix entirely. It is **byte-identical in `ActorsTable.tsx:208`, `UsersTable.tsx:283`, `ImportPreviewTable.tsx:75` and `AdminSidebar.tsx:72`** — a **repo-wide pre-existing condition, not T-12 drift**, and the Reviewer explicitly declined to gate on it.

**Give the human check this number rather than "verify contrast."**

#### Final verification — Leader-run on a quiet tree

| Command | Result |
|---|---|
| `npm test -- --silent RegistrationsTable` | **9/9** |
| `npm test -- --silent 'registrations/page'` | **11/11** |
| `npm test -- --silent` (full frontend) | **102 suites / 1,538 tests** (baseline 99/1,515) |
| `npm run build` | Static export OK — 26/26 pages, `/admin/registrations` `○ (static)` |
| `npx tsc --noEmit` | **Only** the one pre-existing unrelated error |
| `npm run lint` · `react-doctor` | Clean · **96/100, no issues** |

#### ADVISORY (recorded, non-gating, **not** convertible into new tasks)

| # | Finding | Disposition |
|---|---|---|
| **A-74** | **The empty-state probe swallows `AuthFailureError`.** Its inner `catch { setSystemEmpty(null); }` catches everything, so a token expiring between the main call and the probe shows *"No registrations match this view"* instead of routing to `/login`. Self-correcting on the next filter change. A narrow re-throw of `AuthFailureError` closes it. | Recorded. |
| **A-75** | **`lib/contrast.test.ts`'s promotion-rule ledger has drifted, and T-12 is now the third site.** `text-muted` on `bg-danger-soft` sits in that harness's `UNREACHABLE` set, whose PROMOTION RULE says a component introducing the pair should move it to `REACHABLE` with a `file:line` citation. **Pre-existing** at `actors/page.tsx:813` and `actors/import/page.tsx:547`. (Computed ≈4.70:1 — it passes AA, it is simply unregistered.) | Recorded. Worth a separate ticket. |
| **A-76** | **The `PENDING_REVIEW` chip's ≈4.45:1** (above). Repo-wide pre-existing, byte-identical in four other components. | **Routed to the DC-16 human check** with the specific number. |

#### Decisions made

- **The Leader ran the breakpoint measurement**, not the Implementer — the task assigns the obligation but the capability (headless Chrome via CDP) sat with the Leader. The Implementer's job was to make it measurable and not pre-empt the decision, which it did.
- **Attempt 2 is not counted as a rework attempt** against the 3-attempt ceiling: it applied the Leader's measurement rather than responding to a FAIL. The ceiling binds to spec-conformance FAILs.
- **No review round spent on attempt 3.** The two fixes were dictated verbatim by the Reviewer with an in-repo precedent cited by `file:line`; the falsification was re-run and shown to survive; and the Leader verified every changed line at source plus the full suite, build, `tsc` and lint. Recorded so a missing round reads as a decision, not an oversight — budget was also a factor (9 rounds remaining for four tasks).

---

## BUDGET TRIPWIRE — fired at T-12's close, escalated, user elected to continue

**Date:** 2026-09-01 · **Decision:** the user, at the T-12 gate

| Signal | At T-12 | Budget | Halt |
|---|---:|---:|---:|
| Tasks | 12/16 | 16 | 16 |
| Review rounds | 25/35 | ~35 | 35 |
| **LOC** | **~10,256** (7,328 backend + 2,928 frontend) | **~8,200** | **~9,200** |

**The LOC halt threshold is exceeded** — ~10,256 against ~9,200, and 25% over the ~8,200 budget. `tasks.md` requires this be measured at T-4/T-8/T-12/T-16 precisely so a breach cannot be *"disarmed retroactively"* by never being measured (`usage-analytics`: *"the tripwire fired correctly twice and was then forgotten"*).

**Escalated to the user rather than continued on assumption**, per the rule that exceeding a budget is **information, not failure**, and that the cost of a mis-sized spec is only recoverable while it is still running. Projection presented: ~12,000–13,000 at completion, with T-13 and T-14 the remaining substantial UI tasks.

**Leader's diagnosis of the cause.** The estimate was not wrong about the *work*; it was wrong about the *verification density*. Nearly every task shipped more test than implementation — T-8's spec file alone is **+582** against **+455** of service; T-9 added four test files. That is this spec's own methodology operating as designed: by-value sweeps over every column, three-candidate fixtures, write→read seam round-trips, end-to-end module-crossing proofs with a real no-op transport. **Those gates found four defects that every green test had certified** (T-4's MySQL JSON-path 500, T-6's ungated `404` and fabricated reviewer identity, T-7's cross-task null-email drop). The overage is not scope creep.

**Options presented:** (1) continue as planned, accepting ~12–13k; (2) trim T-13/T-14 test depth, saving ~1,500 lines at the cost of exactly the coverage that has been catching things; (3) ship T-15 early and pause at a clean boundary.

**User elected option 1 — continue as planned.** Recorded here so the breach is a decision on the record rather than an unremarked drift.

### T-13 — Detail page + `RegistrationDetailPanel`, `ConsentRecordCard`, `ActivityTrail`, `DuplicateWarningCard`

| Field | Value |
|---|---|
| Status | **PASS** (first attempt) |
| Date | 2026-09-01 |
| Implementer attempts | **1** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **high** · Skills: `tailwind-design-system`, `shadcn-ui`, `react-doctor`, `frontend-design` |
| Reviewer | `akili-reviewer` (opus, T3) — lens-checklist; DC-23's human half + tokens primary |
| Review rounds consumed | **1** (running total: **26** of 35) |
| Requirements covered | FR-10 scenarios 1, 2, 3 · FR-11 scenario 1 · NFR-5, NFR-6, NFR-7 · `design.md` §7.1, §7.3 |

#### Files changed
Ten new files: `app/(admin)/admin/registrations/review/page.tsx` + test, and `components/admin/{RegistrationDetailPanel,ConsentRecordCard,ActivityTrail,DuplicateWarningCard}.tsx` + tests. **No existing file touched** — no regression surface.

---

## ⚠️ MECHANISM SETTLED — and a Leader error, recorded plainly

**The Leader was wrong, propagated the error into a task brief, and flagged a true statement as false. This is the most important thing in this entry.**

### What happened

1. T-12's Implementer wrote that *"this repo's `jest-axe` config disables `cat.color` entirely."*
2. T-12's **Reviewer "corrected" it**, asserting no `configureAxe` exists and that the real mechanism is `color-contrast` reporting **`incomplete`** under jsdom.
3. **The Leader accepted that correction without reading the library**, recorded it in T-12's entry, and **wrote it into T-13's brief as an instruction**: *"There is no `configureAxe` in this repo — do not claim one."*
4. T-13's Implementer restated the original (correct) claim anyway. **The Leader then flagged that true statement to T-13's Reviewer as a false claim to settle.**
5. T-13's Reviewer **read `node_modules/jest-axe/index.js`** and settled it against the source.

### The truth, verified by the Leader at source

```js
const AXE_RULES_COLOR = axeCore.getRules(["cat.color"]);
// Color contrast checking doesnt work in a jsdom environment.
// So we need to identify them and disable them by default.
const defaultRules = AXE_RULES_COLOR.map(({ ruleId: id }) => ({ id, enabled: false }));
axeCore.configure({ rules: [...defaultRules, ...rules], ...otherGlobalOptions });
...
module.exports = { configureAxe, axe: configureAxe(), toHaveNoViolations };
```

**`jest-axe`'s exported `axe` *is* `configureAxe()`.** The library calls it at module-export time, pushing every `cat.color` rule as `enabled: false` into a **global** `axeCore.configure(...)`. So importing `{ axe } from 'jest-axe'` disables `color-contrast` process-wide before any test body runs.

**The rule does not run at all — it never reaches `incomplete`.** "Incomplete under jsdom" is what you would see calling `axe-core` **directly**; it is not what happens here.

### The Leader's reasoning error, named precisely

`grep -rn "configureAxe"` over `frontend/` returned **zero**, and the Leader treated that as **refutation**. It was not. *"There is no `configureAxe` call in `frontend/`"* and *"the whole `cat.color` set is disabled"* are **both true simultaneously** — the library calls it for you. **Absence of a call site was consistent with both readings, and was read as evidence for one.**

### The spec was right all along

`design.md` **§14** states the mechanism correctly **and cites the exact file**: *"`jest-axe` disables the whole `cat.color` rule set by default (verified in `node_modules/jest-axe/index.js`: `AXE_RULES_COLOR` mapped to `enabled: false`), so a green axe result says nothing whatever about contrast."*

**The Implementer was restating its own spec. The drift was entirely in the corrections.** The Reviewer also found the wrong `incomplete` story has since been written into **at least six source files** (`register-a11y.test.tsx:36`, `SearchableSelect.tsx:126`, `lib/contrast.ts:7`, …) — so this misconception predates and outlives this spec.

And the 3a comment the Leader suspected as the source (*"`cat.forms` is enabled by default, unlike `cat.color`"*) **is the one accurate line** — true as a statement about the effective rule set under `jest-axe`, which is the only rule set any test here sees.

### Corrections applied (KZ-004 two-direction sweep)

Both false statements in **T-12's entry** are retracted in place, with the mechanism corrected and pointers to this section. The superseded claim was grepped across `execution.md`; both occurrences are fixed.

### What this changes for DC-16 — it is slightly *worse* than previously recorded

**`color-contrast` does not run under `jest-axe` at all.** A green axe result says **nothing whatever** about contrast — not "reports incomplete", not "partially covered". Exactly what §14 always said, and precisely why the human check is non-negotiable.

---

#### THE PRIMARY GATE — the human half of DC-23

`REVIEW_CONTEXT_FIELDS` is a single `ReadonlySet<keyof AdminRegistrationPayload>` = `{contactPerson, otherCrops}`, and the badge renders from `.has(row.key)` — **one decision point, so rows and marking cannot drift apart.** Copy: *"Review context — will not be published"*, reinforced by an `sr-only` `<caption>` explaining these fields *"have no corresponding column on the public directory record and will never appear there."*

**The assertion counts the right thing.** It uses an **exact string**, so the longer `<caption>` text is not matched and the count is exactly the two badges — the reported `Expected length: 2 / Received length: 1` is a genuine mutation signal, not a caption artefact. And it is **not only a count**: further assertions place the badge **inside** `contactPerson`'s and `otherCrops`' rows and **absent** from `traderName`'s, so *a badge moved to the wrong row also reddens*.

**Why this matters:** T-8 built the machine half — those fields cannot be published, and a by-value sweep proves it. T-13 stops a reviewer **approving in the belief that a contact person's name will appear on the public profile.**

#### Other conformance (all PASS, Reviewer-verified at source)

| Clause | Finding |
|---|---|
| **Every submitted field displayed** | All 14 payload members accounted for — 12 in the table, GPS in the location card, plus `submitterEmail`. Nothing dropped. |
| **Timezone designator** | `Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', timeZoneName: 'short' })` emits a literal `UTC`, asserted on the rendered `<time>` textContent, **not on the prop**. |
| **Recorded-at-submission qualifier** | Data-driven from `acceptedAtQualifier` through a **genuinely total** `Record<…, string>` — widening the backend union makes the object literal a `tsc` error at the declaration site. Copy matches `schema.prisma`'s own comment: an **upper bound**, not an attested moment. Overstates nothing. |
| **Trail read-only** | No form control, asserted over a fixture carrying **all five** union members. `describeEvent` is an exhaustive `switch` **with no `default`**, so a sixth member is a compile error. |
| **`null` identity survived** | `resolveIdentity` returns `'identity unknown'` and **can never return `''`** — it tests truthiness, so `''` falls through exactly as `null` does. Asserted with an **anchored** regex `/^Approved by identity unknown$/`, which is what makes it real rather than a substring an `''` bug would also satisfy. The T-6/T-7 FAIL fix survived into the presentation layer. |
| **`DuplicateWarningCard`** | No invented fields — the render touches only `actorId`, `traderId`, `traderName`, `matchedOn`; **no `phone`/`email` value can appear because the type carries none.** Explicit *"a warning, not a verdict"* copy. |
| **A-35 "5+" cap discharged** | `CANDIDATE_CAP = 5` mirrors the backend's `MAX_CANDIDATES_PER_REGISTRATION`. The test asserts **both directions** — `'5+ possible duplicates found'` present **and** the bare `'5 possible duplicates found'` absent, exactly what A-35 asked for. |
| **NFR-7 — real evidence** | No `[id]` directory anywhere (glob-verified); `useSearchParams()` confined to a component reachable only through `<Suspense>`; build emits `○ /admin/registrations/review`. |
| **A-72 guard** | `SAFE_ID_PATTERN = /^[a-z0-9]+$/i` judged **against a real Prisma `cuid()`**, which emits lowercase base-36 only — so the pattern is a **strict superset of the real id space and rejects no legitimate id**, while blocking `../` **before** the network call (asserted by `adminGetRegistration` never being invoked). A guard that rejected valid ids would have been worse than the traversal. |
| **Tokens (NFR-6)** | Zero hex, zero `rgb()`, zero arbitrary values across all five components. `danger` used **only** on the `REJECTED` badge — no `danger` on any publish-adjacent affordance. |

#### The three disclosures — all upheld

- **GPS only in the location card:** §7.3 assigns coordinates their own presentation; FR-10 requires every field *displayed*, not displayed *in the table*. Duplicating them would be the drift risk.
- **`submitterEmail` unmarked:** correct — FR-12 maps it to `Actor.email` → published. Marking it review-context *"would be an affirmatively false statement to the reviewer."* The test pins the negative.
- **OpenStreetMap link:** reasonable; matches the repo's Leaflet/OSM provider, with `rel="noopener noreferrer"` and a visible focus ring.

#### Final verification — Leader-run

`RegistrationDetailPanel` 7/7 · `ConsentRecordCard` 4/4 · `ActivityTrail` 6/6 · `DuplicateWarningCard` 7/7 · `review/page` 6/6 · full frontend **107 suites / 1,568 tests** (baseline 102/1,538) · build emits the route as **static** · `tsc` shows only the one pre-existing unrelated error · lint clean · `react-doctor` 87/100 with **all five warnings in T-12's files, none in T-13's**.

#### ADVISORY (recorded, non-gating)

| # | Finding | Disposition |
|---|---|---|
| **A-77** | **KZ-008 shading:** `ConsentRecordCard.tsx` cites *"the same pattern `ActorHistoryPanel.tsx`'s `actionBadgeClasses` — DD-21 — uses"*. That artefact **does not bear the claim today** — it is still a `switch`; the DD-21 conversion is **T-15's** work. The precedent true *now* is the one DD-21 itself names: `RoleBadge.tsx`'s `ROLE_BG_CLASS`. | Recorded. **Self-closes when T-15 lands** — but must be **re-resolved at archive** (KZ-008's *"again before the record is frozen"*). |
| **A-78** | `statusLabel`/`statusBadgeClasses` in `RegistrationDetailPanel.tsx` are **byte-equivalent copies** of the same functions in `RegistrationsTable.tsx`. Two independent copies of the status vocabulary will drift. | **FORWARD POINTER → T-14**, which already reopens this file. A shared module (the `lib/content/roles.ts` precedent) closes it. |
| **A-79** | Both copies use `default:` rather than exhaustiveness, so a sixth `RegistrationStatus` degrades silently — the inverse of the discipline applied in the three sibling files. Inherited from T-12's accepted pattern. | Recorded; convert alongside A-78. |
| **A-80** | `RegistrationDetailPanel.test.tsx` asserts values for **7 of 14** payload fields; `traderType`, `sex`, `region`, `crops`, `capacityTons` render but are unasserted, so a dropped row among those would not redden. | **FORWARD POINTER → T-14** (cheap to close while the file is open). |
| A-81 | At the cap the card reads "5+ possible duplicates found" above exactly five rows with no explanation of the "+" — honest, but readable as a rendering bug. One clause ("showing the first 5") resolves it. | Recorded. |
| A-82 | An id failing `SAFE_ID_PATTERN` renders *"Missing registration id"*, slightly misleading for a present-but-malformed id. Defensive path only, unreachable from any in-app link. | Recorded. |

#### Decisions made

- **The Leader's own error is recorded above at length rather than quietly fixed**, because the failure mode — accepting a plausible correction without reading the artefact, then propagating it into a brief — is exactly what this spec's KZ-008 discipline exists to catch, and the Leader is not exempt from it.

### T-14 — Decision surfaces: approve via `AcknowledgeDialog`, `RejectDialog`, dismissal wiring

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 2) |
| Date | 2026-09-01 |
| Implementer attempts | **2** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **high** → **xhigh** · Skills: `shadcn-ui`, `tailwind-design-system`, `react-doctor` |
| Reviewer | `akili-reviewer` (opus, T3) — lens-checklist; acknowledgement gate + token semantics primary |
| Review rounds consumed | **2** (running total: **28** of 35) |
| Requirements covered | FR-11 scenario 2 (UI limb) · FR-12 scenario 3 · FR-13 scenario 1 (UI limb) · NFR-5 · NFR-6 (**see the NFR-6 finding below**) · `design.md` §7.4 |

#### Files changed
New: `components/admin/RejectDialog.tsx` + test (15 tests), `lib/content/registration-status.ts`.
Modified: `RegistrationDetailPanel.tsx` + test (26 tests), `DuplicateWarningCard.tsx` + test, `RegistrationsTable.tsx`, `review/page.tsx` + test.

---

## ⚠️ A SPEC DEFECT — NFR-6 fails at the rendered DOM, and T-14's contract is unsatisfiable as written

`design.md` §7.4 rejects `ConfirmDialog` **"twice over"**: it is for destructive confirms, **and** *"it hardcodes its confirm button as `bg-danger` — a red destructive button on a publish action, contradicting this project's rule that `danger` means destructive."*

**Verified at source by the Implementer, the Leader, and the Reviewer independently:**

| File | Confirm-button class |
|---|---|
| `ConfirmDialog.tsx:245` | `'rounded-md bg-danger px-4 py-2 text-sm font-medium text-primary-fg'` |
| `AcknowledgeDialog.tsx:379` | `'rounded-md bg-danger px-4 py-2 text-sm font-medium text-primary-fg'` |

**Byte-identical**, and both also carry `focus-visible:ring-danger`. **The design's second reason for rejecting `ConfirmDialog` applies verbatim to the replacement it mandates.**

**It is worse than §7.4.** `requirements.md` **FR-12 scenario 3** carries the same false clause — *"`ConfirmDialog` **additionally** hardcodes its confirm button as `bg-danger`"* — and **the word "additionally" is what makes it false**, asserting a contrast that does not exist. **The defect sits in `requirements.md` as well as `design.md`; T-16's sweep must hit both or KZ-004 fires.**

**NFR-6 fails at the rendered-DOM level.** Its measure is explicit: *"`danger` is reserved for destructive semantics and MUST NOT style the publish action."* The publish action's confirm button renders `bg-danger`. **Every line T-14 authored complies** — the violation arrives through a component the requirement itself **mandates**. T-14's Done-when clause *"`danger` used for rejection only"* is therefore **unsatisfiable as written**; no in-scope edit closes it.

**Disposition: recorded against T-16 and escalated to the user; it does not gate T-14.** Both remediations lie outside T-14's `Files` list and touch a component shared by **three shipped call sites across two archived specs** (bulk unlock, import commit, `ActorForm`). Editing it under T-14 would be exactly the unreviewed cross-spec collateral the Reviewer role exists to prevent; failing T-14 would return a task no in-scope edit can close.

**The decision itself survives intact** — `frontend/CLAUDE.md`'s *"required before any `consentStatus = GRANTED` submit"* is untouched and decisive on its own. **Only half the rationale falls.**

**Three things T-16 must carry, or the disposition fails:**
1. The prose fix in **both** documents.
2. **The visible outcome, escalated — not closed by the prose fix.** Amending §7.4 to say *"AcknowledgeDialog also renders `bg-danger`"* makes the docs true and **leaves the red publish button shipped**, converting a live NFR-6 violation into a documented one. Cheapest option for the user: a backwards-compatible **`tone?: 'danger' | 'primary'`** prop on `AcknowledgeDialog` defaulting to `'danger'`, so the three existing call sites render byte-identically and only the approve site opts into `bg-primary`.
3. **A note that the green token test does not prove NFR-6.** The passing assertion is scoped to the *trigger* buttons. Nobody should later read that green as coverage of the dialog confirm.

---

## The falsifying input was partially vacuous — discovered by running it

The Implementer ran **two** variants and reported both:

| Variant | Result |
|---|---|
| **A — props-preserving swap** (`import { ConfirmDialog as AcknowledgeDialog }`, same props) | **1 of 26** reddened — the import-identity grep only. **The rendering-based typed-input assertion did NOT redden.** |
| **B — the realistic misuse** (swap **and** drop `acknowledgementText`, as `ConfirmDialog` is invoked at most of its other call sites) | **7 of 26** reddened, including the primary typed-gate assertion |

**The Reviewer confirmed Variant A by line-for-line source comparison, not by trusting the report:** with `acknowledgementText` supplied and `provenance` omitted, the two components render **identical DOM** — same panel classes, same `aria-describedby` composition, same label `Type “…” to confirm`, same input attributes including `aria-invalid`, **byte-identical hint** (`'Confirm is disabled until the acknowledgement is entered exactly.'`), same error block, same button classes, equivalent disabled predicate. The only non-rendering difference is `cancelRef` focus.

**So the task's stated falsifying input — *"assert the approve path renders `AcknowledgeDialog`'s typed input; the swap must redden"* — is imprecise.** Variant B is the honest form for the rendering assertion; the import-identity grep is the honest form for the props-preserving case. **Fifth instance of this spec's stated verification proving imprecise — recorded for T-16.**

---

## ATTEMPT 1 — three FAIL issues

### Issue 1 — a regression introduced while claiming to close a gap

**T-14 deleted two `if (cancelled) return;` guards T-13 had shipped.** Leader-verified against the committed version: T-13 had **four** `cancelled` checks; attempt 1 had **two**, and the two guarding the **data write** were gone.

> `setDetail(data)` / `setError(...)` ran **unconditionally after the await**, with no cancellation token, no `AbortController`, no generation counter. On a soft navigation between two review URLs, **both fetches race and the later-resolving one wins — the panel displays registration A under `?id=B`.**

**The effect's own comment claimed the rewrite *closed* a pre-existing gap. It closed the `loading`-reset gap and opened a stale-response gap in the same edit.** Violated `.agents/reviewer.md` § *Stability & Integrity: are unrelated code blocks preserved?* — shipped behaviour removed **without disclosure**.

### Issue 2 — an ungated clause plus a false coverage claim
FR-12 scenario 3's *"the modal states what approval will do"* was implemented correctly but **asserted nowhere** — deleting the sentence reddened nothing — while the test header **claimed the coverage existed**. L-3's "no third option" rule: name the mutation or declare the gap.

### Issue 3 — the test header contradicted its own inline comment (KZ-008)
The header claimed `ConfirmDialog` *"renders a differently-worded hint"* and that the swap reddens the rendering assertion. **Both false**, and the file's **own inline comment stated the truth correctly and at length.** The file documented the spec's most consequential gate **twice, contradictorily, with the false version first.**

---

## ATTEMPT 2 — all three fixed, with mutation proofs

### Fix 1 — cancellation restored, and proven

`loadDetail(regId, accessToken, shouldApply: () => boolean)` re-checks the predicate after the await. **The Reviewer verified all three post-await write paths are gated** — success, and the `catch` guard sits **before** the `AuthFailureError` branch, so a stale 401's `router.push('/login')` is gated too.

**Mutation proof (guards removed, param retained):**
```
FAIL app/(admin)/admin/registrations/review/page.test.tsx
  ● RegistrationReviewPage › T-14: a stale response cannot overwrite a newer one after id changes mid-flight
    expect(element).toHaveTextContent()
    Expected element to have text content: REG-2026-0200
    Received: REG-2026-0184
Tests: 1 failed, 6 passed, 7 total
```

**The test is a genuine two-in-flight, out-of-order exercise**, not a simulation — the Reviewer traced it: both promises are never-auto-resolving deferreds, the test `waitFor`s proof that **both** fetches were issued before resolving anything, then resolves **B first, A second**.

**And the attempt-1 `loading`-reset fix survives alongside it.** The Reviewer noted the `!cancelled` conditional is **load-bearing, not defensive noise**: without it, a cancelled instance's `finally` would flip `loading` false while the new id's fetch is in flight, **flashing registration A's panel under `?id=B` — the same bug, one frame wide.**

### Fix 2 — the clause is now gated, and the scoping is what makes it meaningful
The new assertion is **`within(dialog)`-scoped**, which matters: `DecisionPanel` carries a **near-identical sentence**, so an unscoped query would have thrown on multiple matches and a lazily-scoped one **could have been satisfied by the panel copy while the dialog said nothing.** Scoped to the `role="dialog"` node, only the `AcknowledgeDialog` description can satisfy it. Mutation proof: deleting the disclosure clause reddened it; reverted → 26/26.

### Fix 3 — the header verified true against both dialogs' source
Rewritten to state that a props-preserving swap is **rendering-indistinguishable** and caught **only** by the import-identity grep. The Reviewer verified the secondary claim too: of five `ConfirmDialog` call sites, **three omit `acknowledgementText`**, so *"most of its other call sites"* is accurate.

---

## The five carried obligations — all landed, all verified

| # | Obligation | Verification |
|---|---|---|
| **A-71** | Total `Record<RejectionReasonCode, string>` | Proven by `TS2741` on removing a member. **But see A-83 — the protection A-71 promised does not actually exist.** |
| **A-62** | The hand-duplicated reason list documented as ungated | Reviewer checked **all five code/label pairs byte-for-byte against `REJECTION_REASONS_SOURCE`, ordering included** |
| **A-78** | Shared status vocabulary | `lib/content/registration-status.ts` consumed by **both** `RegistrationsTable` and `RegistrationDetailPanel` |
| **A-79** | Exhaustive, no `default:` | Both maps are total `Record<RegistrationStatus, string>` |
| **A-80** | Five unasserted payload fields | All five now covered |

## Auditability — "several" was not good enough

Told that an unenumerated dismissal set cannot be audited (**KZ-008 extends to evidence artefacts**), the Implementer enumerated **nine** `react-doctor` dismissals with file, line and reason — and **flagged two new findings in its own code** as judged false positives rather than dismissing them silently.

**The Reviewer confirmed both judgments correct**, tracing the second in detail: after `approveRegistration` resolves, the dialog closes *before* `await onRefresh()`, so the trigger is clickable while `approveLoading` is still true — but the dialog receives `loading={approveLoading}`, and both the `disabled` attribute and an internal `if (!canConfirm || loading) return;` guard block a second call. **No newer request exists for that `finally` to stomp.**

**The one provenance claim the Reviewer could not check (read-only tools), the Leader verified:** `role="list"`/`role="listitem"` **are** present in T-13's committed `DuplicateWarningCard.tsx` (lines 106, 110) — carried, not introduced by T-14. Dismissal correct.

## Final verification — Leader-run

`RejectDialog` 15/15 · `RegistrationDetailPanel` 26/26 · `review/page` 7/7 · full frontend **108 suites / 1,607 tests** (baseline 107/1,568) · build **27/27 static** · `tsc` only the one pre-existing unrelated error · lint clean.

## ADVISORY (recorded, non-gating)

| # | Finding | Disposition |
|---|---|---|
| **A-83** | **A-71's promised protection does not exist.** A total `Record<RejectionReasonCode, string>` catches a union member **added** (`TS2741`) or a map member **removed** — but **not widening to `string`**, which was A-71's *actual* concern: `Record<string, string>` is satisfied by any object literal, and `REJECTION_REASON_ORDER`'s `as RejectionReasonCode[]` cast erases the remainder. T-14 built exactly what was asked; **the false claim is inherited from T-11's review.** | **FORWARD POINTER → T-16.** **Sixth** instance of stated-verification imprecision. |
| **A-84** | **`handleRefresh`'s `() => true` leaves a narrow hole, and its comment justifies it wrongly in both halves.** A competing request *can* exist (navigating `?id=A` → `?id=B` while a post-mutation refresh for A is in flight — the refresh wins if it resolves later, **writing A's detail under `?id=B`: Fix 1's bug through the other door**). And `cancelled` never becomes true for a settled-and-current effect, so gating on it would drop **precisely** the refreshes that should be dropped. Window is genuinely narrow (no in-app link between review URLs; requires browser back/forward inside one GET's latency). | Recorded. The Reviewer declined to gate but noted *"a comment supplying an incorrect justification for the one remaining hole is the same defect in miniature."* Remediation: promote `cancelled` to a ref/generation counter and gate on it, **or** replace the rationale with the honest version. |
| **A-85** | **The import-identity grep is spelling-specific** — `/from ['"]\.\/ConfirmDialog['"]/` matches the relative form only, while `ActorsTable.tsx` in the same directory imports it as `@/components/admin/ConfirmDialog`. A props-preserving swap written that way evades **both** the grep and every rendering assertion. | Recorded. Widen to `/from ['"](\.\/\|@\/components\/admin\/)ConfirmDialog['"]/`. |
| **A-86** | **The `jest-axe clean (NFR-5)` header claim is narrower than it reads.** The axe test renders the default fixture, whose `duplicateCandidates` is `[]` — so the `<ul role="list">`/dismiss-button markup **and both dialogs are never axe-scanned**. Also `DuplicateWarningCard.tsx:1` still tags `@sdd-spec … (T-13)` though its body attributes the dismiss control to T-14 (compare `RegistrationDetailPanel.tsx:1`, correctly `(T-13, T-14)`). | Recorded. An axe case over the populated + open-dialog state would make the claim true. |
| A-87 | Fix 2's regex does not pin the destination (*"to the public directory"*); a sentence trimmed at "coordinates" would still pass. Low materiality — FR-12's clause as quoted stops there. Also: a failed post-mutation refresh replaces the whole panel with `NotFoundState`, **erasing the `role="status"` "approved and published" announcement** on the one irreversible path in the system. | Recorded. Routing refresh failures to the panel's own `announcementError` would close the second half. |

## Decisions made
- **The NFR-6 / `bg-danger` defect was not gated on T-14** — no in-scope edit closes it, and the fix touches a component shared by three shipped call sites across two archived specs. Escalated to the user and carried to T-16.
- **A second review round was spent on attempt 2** despite strong mutation evidence, because attempt 1 had introduced a genuine regression in shipped behaviour and a self-inspection would not have been an independent check of the fix.

### T-15 — Audit-action taxonomy end-to-end (FR-16)

| Field | Value |
|---|---|
| Status | **PASS** (first attempt) |
| Date | 2026-09-01 |
| Implementer attempts | **1** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **high** · Skills: `vercel-react-best-practices`, `react-doctor` |
| Reviewer | `akili-reviewer` (opus, T3) — type fidelity (NFR-11) primary |
| Review rounds consumed | **1** (running total: **29** of 35) |
| Requirements covered | FR-16 scenarios 1, 2 · NFR-11 (**see A-88**) · `design.md` §7.5, DD-21 |

#### The defect this closed was live in the repo
- `actors-admin.ts:203` had **five** members; the backend enum has **eight**. `IMPORT` shipped 2026-07-10 and was missing frontend-side for an entire spec cycle.
- `actionBadgeClasses` had **no `default`**, so an `IMPORT` row — which the backend **already emits** — rendered with no colour token at all.

#### Both gates demonstrably fail — the strongest part of the submission

**The pre-change run was free**, because the defect ships today; no mutation was needed:
```
FAIL components/admin/ActorHistoryPanel.test.tsx
  ● ... assigns a real, non-empty badge class to every action in the union — including IMPORT and the two registration actions
    expect(received).toMatch(expected)
    Expected pattern: /\bbg-\S+/
    Received string:  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium "
  ● ... gives REGISTRATION_APPROVE a real snapshot summary, not the generic "Snapshot" fallback
    expect(element).not.toBeInTheDocument()
    ... found <button ...>Snapshot<span aria-hidden="true">▸</span></button> instead
Tests: 2 failed, 10 passed, 12 total
```
After the fix: **12/12**. That received string — base classes plus a trailing space, no `bg-` token — **is what a user sees today** on any `IMPORT` row.

**The `tsc` gate, rewritten by the Leader because the task's version was vacuous** (`tsc --noEmit` already exits non-zero from a prior spec's `TS2556`, so exit status carries zero information). Error-set diff instead — removing `IMPORT` from the `Record` produced exactly one new line:
```
components/admin/ActorHistoryPanel.tsx(86,7): error TS2741: Property 'IMPORT' is missing in type '{ CREATE: string; ... }' but required in type 'Record<"CREATE" | ... | "REGISTRATION_REJECT", string>'.
```
Restored → matched the baseline **byte-for-byte**. The Reviewer confirmed it **also catches renames**, from both sides: renaming a `Record` key trips missing-member *and* excess-property checks; renaming a *union* member surfaces the mirror error **and** invalidates the test's `ALL_EIGHT_ACTIONS` literal.

#### ⚠️ THE SPEC WAS WRONG, AND FOLLOWING IT LITERALLY WOULD HAVE SHIPPED A VACUOUS GATE

`design.md:437` (§10's reversion-challenge table) states the call site *"joins the result into a class string, so `undefined` becomes the literal `"undefined"` in `className`."*

**False.** ECMA-262 `Array.prototype.join`: *"If element is undefined or null, let next be the empty String."* **Leader-verified:** `['base', undefined].join(' ')` → `"base "`.

**The Implementer's first draft asserted `not.toMatch(/undefined/)` — which passes against the *pre-fix* code too**, since that literal never appears. It would have been a green test certifying a live defect: **KZ-002, born from the spec's own false premise.** It caught this **by running the code**, and rewrote the assertion to require a `bg-` token, which genuinely reddens pre-fix.

The Reviewer confirmed the rewritten gate cannot be satisfied incidentally — the base class string contains no `bg-` substring — and that **§7.5 and §9's DD-21 are accurate** (they say "renders an unstyled badge", never "the literal undefined"). **The falsehood is confined to §10.**

**But §10's row is wrong TWICE, and the second error is more consequential.** The same cell also claims *"a backend enum member added later without a frontend edit now **fails the build**."* **Also false** — with no frontend edit the union is unchanged, the `Record` is total over it, `tsc` is clean, and the ninth action arrives at runtime as an unmapped key → unstyled badge, **identical to pre-change behaviour**. The compile error fires only when the **union** is widened without the map: it protects against a half-done frontend mirror, **never against an un-mirrored backend enum**. **T-16 must fix both clauses or the correction re-ships half the falsehood.**

#### Conformance verified at source

| Check | Finding |
|---|---|
| Eight members, exact | `schema.prisma:86-95` and `actors-admin.ts:203-211` — **same spelling, same order, no `string`** |
| `actionBadgeClasses` total | `Record<AuditEntry['action'], string>`, no fallback at the call site — a missing member is unrepresentable |
| `SnapshotDetails` **kept** its `default` | Confirmed. One case added; `UPDATE`/`BULK_CONSENT`/`IMPORT`/`REGISTRATION_REJECT` left to the default. **The Implementer did not "helpfully" convert the second map** — §7.5 says doing so would be *wrong, not merely unnecessary* |
| The new case is **reachable, not dead code** | `logRegistrationApprove` writes `buildSnapshot(actor)` → `{ kind: 'snapshot' }`, so `isSnapshot` narrows true and `SnapshotDetails` genuinely renders for `REGISTRATION_APPROVE` |
| `REGISTRATION_REJECT` gets no case | Correct — its row carries `actorId` = a **registration** id, and the read path filters on `actorId`, so it can never reach the panel. Asserted backend-side in T-2 |
| Tokens | All three new pairs reuse grounds **already asserted against threshold** in `contrast.test.ts`'s `REACHABLE` matrix — **zero new contrast ground introduced**. And the two registration values are **byte-identical to this spec's own `REGISTRATION_STATUS_BADGE_CLASSES`** from T-11/T-13, so the history badge matches the queue chip. **`danger` on rejection is §7.7's explicit instruction** — not the T-14 defect inverted |

#### The Leader's own inference was wrong, and the Reviewer caught it

I had reasoned that a green untouched 362-line suite would prove the five pre-existing badge values mapped across unchanged. **It would not** — that suite asserts labels, summaries, ARIA and identity, but **no `className` anywhere**, so green is compatible with any value having changed. The Reviewer said so plainly and routed the check to me.

**Leader-verified by `git diff` against the committed version — all five mapped byte-for-byte:**

| Action | Pre-change `switch` | Post-change `Record` |
|---|---|---|
| `CREATE` | `bg-highlight-tint text-success` | identical |
| `UPDATE` | `bg-primary-soft text-primary` | identical |
| `DELETE` | `bg-danger-soft text-danger` *(fallthrough)* | identical |
| `BULK_DELETE` | `bg-danger-soft text-danger` *(fallthrough)* | identical |
| `BULK_CONSENT` | `bg-surface-alt text-warning` | identical |

The `case 'DELETE': case 'BULK_DELETE':` fallthrough was correctly expanded into **two explicit keys with the same value**. Test file: **0 deletions**, 105 additions.

#### ADVISORY (recorded, non-gating)

| # | Finding | Disposition |
|---|---|---|
| **A-88** | **The `Record` docblock over-claims the gate's reach, in the very file the gate protects.** It says *"Adding a ninth backend action without adding it here is a compile error"* — but the frontend has **no link to `ActorAuditAction`**, so a backend-only addition produces no frontend error at all. **That is exactly the drift that produced this task**, and it remains **ungated after T-15**. Inherited from `design.md:437`. **NFR-11's measure is not literally met** — it asks for a test that *derives or asserts the union against the backend's enum member list*; the delivered test hardcodes eight members frontend-side. **`tasks.md` did not ask for the derivation, so the gap is between the requirement and its decomposition, not in the Implementer's work.** | **FORWARD POINTER → T-16.** **Seventh** stated-verification imprecision. Remediation: either make the link real (the frontend Jest suite runs in Node and can parse `schema.prisma`, closing backend-only drift; a type-level `Exact<>` assertion would additionally close A-83's widening hole), **or** adopt the A-62 posture and document the mirror as ungated. |
| **A-89** | **Both new comments cite a `design.md` that resolves to the wrong spec.** Neither file gained a second `@sdd-spec` line, so both still declare only `admin/actor-crud-audit (T-10)` — **whose `design.md` has no DD-21**. A reader following the file's own tag finds nothing. The repo convention is unambiguous and **this spec applied it three tasks ago** (`AdminSidebar.tsx`, `RegistrationDetailPanel.tsx (T-13, T-14)`). Additionally, the test comment attributes the `join` falsehood to *"§9's DD-21 row"* — **it lives in §10's reversion-challenge table.** A correction that mis-cites the location of what it corrects is the KZ-008 pattern at recurrence ×3. | Recorded. Remediation is **additions-only**, so it does not disturb the 0-deletions evidence. |
| A-90 | T-15 shifted the lines `contrast.test.ts` cites at `ActorHistoryPanel.tsx` (`:80` → `:87`, `:87` → `:91`, `:182`/`:212` → `:190`/`:221`). `citedAt` is documentation, not an assertion, so nothing reddens and the `grounds` arrays stay correct — but the artefact no longer bears the claim at the named lines (**KZ-009**: cite symbols, not line numbers). | Recorded. |

#### Decisions made
- **The Leader rewrote this task's `tsc` gate before dispatch**, after T-11's review established the baseline is red. The error-set diff proved strictly stronger than the exit-status check the task specified — it names the file and code, and catches renames.
- **The Leader's own "green untouched suite proves the values" inference was wrong**, was corrected by the Reviewer, and was closed by an actual `git diff`. Recorded rather than quietly fixed.

### T-16 — Amend the baseline documents

| Field | Value |
|---|---|
| Status | **PASS** (on attempt 2) |
| Date | 2026-09-01 |
| Implementer attempts | **2** |
| Implementer | `akili-implementer` (sonnet, T2) · Effort **medium** → **xhigh** · Skills: `software-architect`, `cognitive-doc-design` |
| Reviewer | `akili-reviewer` (opus, T3) — documentary accuracy (KZ-008), the only gate |
| Review rounds consumed | **2** (running total: **31** of 35) |
| Requirements covered | `requirements.md` §4.2 · `design.md` §9 ADR-011 · `judgment.md` B3 |

#### ⚠️ THIS TASK HAD NO VERIFICATION COMMAND — and none was invented

`tasks.md`: *"manual review at the HITL pause — **there is no command.** Say so; do not invent one"* and *"Falsifying input: **none exists.** Documentary conformance has no automated gate in this repo, and claiming one would be the **false-gate pattern this spec repeatedly refuses.** This task's evidence is a human read."*

Both the Implementer and the Reviewer stated this explicitly and neither ran or credited one. **The Reviewer was the human read**, re-resolving each claim against shipped source.

#### Files amended
`docs/trd/trd.md` — §2, §4, §8, **§12.5 (ADR-011)**, §13 (B3) · `docs/ux-ui/design.md` — §2 IA, §4 screens, §5 nav · spec `design.md` — §7.4, §10, §12 (R-13), §13 · spec `requirements.md` — FR-12 s3, NFR-11, §8 (DC-36) · plus two comment/string-only source touches.

---

#### ATTEMPT 1 — `FAIL`, and the failure is the spec's own recurring shape

**Issue 1 — §7.4 described a gate that does not exist.** It claimed *"the passing token-conformance test… is scoped to grepping for hardcoded hex/colour literals in new files."* **No such test exists.** The passing token test is a *rendering* assertion. The conclusion was sound, but **as written a reader concludes nothing asserts `danger` semantics anywhere** — false, and worse than the gap it recorded.

**Issue 2 — an amended line asserted a sidebar the code does not have.** `docs/ux-ui/design.md:76` read *"(Actors · **Import · Export** · Registrations · Users)"* — **five** entries. `AdminSidebar.tsx` ships **three**; Import/Export were removed 2026-07-10.

**The edit inserted `Registrations` into that parenthetical without re-resolving its siblings.** The appended sentence was exact; **the defect was the container it went into.** That is **KZ-004** — *a correction closes only when the superseded value is gone everywhere* — **committed inside the task whose disqualifying clause is "re-resolve every factual claim against the shipped code at the moment of writing."**

**This is the fourth time in this spec a correction introduced a fresh false claim** (T-3 attempt 2, T-8 attempt 2, T-12's report, T-16 attempt 1).

**Issue 3 (promoted from advisory) — `"zero rows ⇒ 409"` would have made a reader ship the wrong status.** Leader-verified: a zero-row count is followed by a **diagnostic `findUnique`** returning **404** when the id does not exist, **409** only when it does. §8's phrasing is true *of the race it describes*; **§4's was not**, and §4 is what an implementer reads.

#### ATTEMPT 2 — all corrected, and the Reviewer re-resolved every sub-claim

| Correction | Verified at source |
|---|---|
| §7.4 now names the real test | `RegistrationDetailPanel.test.tsx:505` — asserts danger on the Reject **trigger** (`:508`), absence on the Approve **trigger** (`:509–511`), `bg-danger` on `RejectDialog`'s confirm (`:514–519`), and **never renders `AcknowledgeDialog`** within that describe |
| Sidebar | `(Users · Actors · Registrations)` — matches `NAV_ITEMS` order **verbatim** |
| §4's approve row | *"zero rows ⇒ `409` when the row exists, `404` when it does not, DD-22"* |
| Kaizen citation | `design.md:437` → **"§10's DD-21 reversion-challenge row"** — a symbolic anchor, satisfying **KZ-009**, which the same table asserts two rows above |
| `trd.md:191` | *"two reads… and three writes…"* — matches §4's five rows exactly (two were `GET`s) |

**Two passages were deliberately left unchanged, and the Reviewer verified the reasoning rather than the edit** — the more valuable audit, since a justification for *not* changing something is the quietest way to leave a falsehood standing:
- **`trd.md:185` (reject)** states no status code of its own, so it genuinely **inherits** approve's corrected split — and the code bears it (`:958–968` mirrors approve's `:726–738`).
- **`trd.md:225` (§8)** is bounded head and tail by its scope (*"close the **double-adjudication race**"* … *"no window in which a **second request** can race"*). **In that race the row necessarily exists**, so `409` is the only outcome. True as scoped.

#### ADR-011 — entered `Accepted`
Substance and sentence order match `design.md` §9; the Decision/Status/Consequence split matches ADR-001–010; **all four sub-claims verified true of the shipped service.**

#### B3 — resolved: cite QA-3 alone
QA-12's actor is an **anonymous visitor** on a closed set of **four public paths** this spec does not touch; its five routes are Admin-gated with exactly QA-3's `401`/`403` shape. Widening QA-12 would blur public-surface containment with admin-endpoint authorization.

**And the resolution records the actual source of the ambiguity**, so B3 is not re-opened: ADR-010 ties QA-12 to `pii-boundary.spec.ts` as a *mechanism*, and this spec extends that **same file** to prove QA-3 — **one test file now serves two distinct QA scenarios.**

#### A deliberate omission, upheld
The Implementer **declined** an optional note that `pii-boundary.spec.ts`'s bidirectional key-equality is an accidental partial tripwire for the module-scoping residual. The Reviewer verified the mechanism and agreed: that tripwire fires only if the controller **moves out** while its fixture entries stay — **a different event from the one §2 warns about** (a route added *elsewhere*, invisible to both sides of the equality). Documenting a tripwire that does not cover the warned-about risk *"would have invited precisely the under-weighting the paragraph exists to prevent."*

---

## FINAL BUDGET RE-MEASURE — required by `tasks.md`, and the Reviewer caught that it was outstanding

| Signal | Final | Budget | Halt |
|---|---:|---:|---:|
| Tasks | **16/16** | 16 | 16 |
| Review rounds | **31** | ~35 | 35 |
| **Code LOC** | **13,310** (7,331 backend + 5,979 frontend) | ~8,200 | **~9,200** |
| Docs LOC | 2,183 | — | — |
| Commits | 16 | — | — |

**The LOC halt threshold was exceeded and stayed exceeded — final code LOC is 45% over the halt and 62% over budget.** Escalated at T-12 with a projection of 12,000–13,000; the actual is 13,310, at the top of that range. **The user elected to continue (option 1) with the overage on the record.** Recorded here at the close because `tasks.md` requires it at T-4/T-8/T-12/T-16 precisely so a breach *"never measured"* cannot disarm the tripwire retroactively — and this is the task whose own brief forbids that.

**Diagnosis, unchanged from T-12:** the estimate was wrong about *verification density*, not about the work. Nearly every task shipped more test than implementation, and those gates found defects every green suite had certified.

## FINAL TEST STATE — measured honestly, including a failure I chased down

| Suite | Result |
|---|---|
| Frontend | **108 suites / 1,609 tests green** |
| Frontend build | Static export OK, `✓ Exporting (2/2)` |
| Backend | **75 suites / 988 tests** — green on **4 of 6** full runs |

**The backend suite fails intermittently, and it is not this spec's doing.** Rather than report a green run, the Leader ran it six times and isolated the cause:

| Evidence | Finding |
|---|---|
| Failing suite | `src/test/admin-actors.e2e.spec.ts` — **8 tests, 34.3 s** (timeout-scale, not assertion-scale) |
| Touched by this spec? | **No** — zero lines in the diff since `07f4ca9` |
| In isolation | **28/28 in 1.26 s** — a **26× degradation** under full-suite load |
| Provenance | Last modified by `ea7a4cc` and `0158dc0`, both **prior** specs |

**This is A-42 with a name and hard numbers**: a pre-existing, load-induced timeout in an app-booting suite, unrelated to this spec's changes. It warrants its own bugfix ticket alongside the `tsc --noEmit` baseline error (A-73) — both are repo-health items this spec **surfaced but did not cause**, and neither was folded in.

#### ADVISORY

| # | Finding | Disposition |
|---|---|---|
| A-91 | **§8's `409` clause could seal its scope in six words.** True of the race it describes, but it names a mechanism (`updateMany` → `count === 0`) that in code branches on a follow-up `findUnique`. A reader arriving at §8 without §4 could carry away *"409 always"*. Suggested: *"…zero affected rows is the refusal (`409` here, since the row exists; an unknown id is an honest `404` — §4, DD-22)"*. | Recorded. Not a defect — the sentence is scoped and accurate. |
| A-92 | **Pre-existing IA drift in `docs/ux-ui/design.md` §2 (lines 31–33)**, deliberately not touched: `/admin/actors/[id]/edit` (a `[param]` segment `frontend/CLAUDE.md` forbids; ships as `?id=`), `/admin/import` (ships as `/admin/actors/import`), `/admin/export` (no page exists). | **Its own `bugfix/` ticket.** Correctly out of scope. |
| A-93 | **`admin-actors.e2e.spec.ts` load-induced flakiness** (above), and **A-73's `tsc --noEmit` baseline error**. | Two repo-health bugfix tickets. Surfaced, not caused, by this spec. |

#### Decisions made
- **A second review round was spent on attempt 2** despite three precisely-dictated corrections, because this is the **permanent constitutional record** and the spec has four instances of a correction introducing a fresh false claim. The Reviewer re-resolved nine sub-claims in the rewritten §7.4 alone.
- **The final budget re-measure was performed before the checkbox flipped**, as `tasks.md` requires — the Reviewer flagged it as outstanding.
- **The intermittent backend failure was chased to a named suite with numbers** rather than reported as "flaky" or omitted from a green summary.

---

## POST-SPEC ADJUSTMENT — 2026-09-02, at the DC-16 review

Recorded here rather than inside a task entry, because the spec was already closed at 16/16.

**Applicant-column clamp narrowed at the user's request during the DC-16 human check.** `RegistrationsTable.tsx`'s `APPLICANT_NAME_CLAMP_CLASS` went from `max-w-xs` (320px) to **`max-w-56` (224px)** — verified to emit real CSS (`max-width: 224px`, rendered 224px), and on Tailwind's spacing scale rather than an arbitrary value, so NFR-6's token discipline holds. No test asserted the old class on this component (the one that does, `ActorsTable.test.tsx:515`, is a different component and was not touched). `RegistrationsTable` 9/9 and the queue page 11/11 stayed green.

**T-12's breakpoint measurement was re-run rather than assumed still valid.** The change only shrinks `tableContent`; the container and the frozen Reference column are untouched, so the decision moves further into safety:

| @768px | T-12 (recorded) | After this change |
|---|---:|---:|
| frozen sticky | 140px | **140px** (unchanged) |
| **scrollable strip** | **341px** | **356px** |
| table content | 1232px | **1136px** |

**The `md` decision stands with more margin, not less** — still far from the 94px that forced `ActorsTable` to `lg`.

### DC-16 human check — partially completed at this session

| Property | Result |
|---|---|
| **Focus order** | ✅ Checked by the user via keyboard traversal on both screens — pass |
| **Responsive split** | ✅ Checked across 768px — pass |
| **Contrast** | ⚠️ **Measured in-browser rather than eyeballed** (see below) |

**Contrast measured with real computed styles at 12px:**

| Chip | Ratio | AA (4.5:1) |
|---|---:|---|
| **`Pending review`** (`bg-border text-muted`) | **4.42:1** | ❌ **fails** |
| `Rejected` | 5.28:1 | ✅ |
| `Approved` | 5.54:1 | ✅ |
| `N possible duplicates` | 5.56:1 | ✅ |

**This confirms A-76 empirically** (the review estimated ≈4.45:1; measured 4.42:1). It is the only one of the four below threshold, and it is the chip every pending registration carries — the default queue view. **Repo-wide pre-existing**: byte-identical in `ActorsTable`, `UsersTable`, `ImportPreviewTable` and `AdminSidebar`, so remediation is a five-site change, not one. **Not this spec's drift; still open for the user's decision.**

**Harness note.** The DC-16 check needed **no backend, no database and no Cognito login** — all five components take plain props, exactly as `design.md` §14 and KZ-003 predicted (*"this check must not be deferred on auth grounds"*). A throwaway `frontend/app/dc16-check/` page rendered both screens with realistic fixtures. **It is not part of the deliverable and must be deleted** (`rm -rf frontend/app/dc16-check`).

**One harness artefact worth recording, since it briefly looked like a defect:** the first fixture used `traderType: 'agrodealer'` / `'processor'`, which are **not canonical types**, so they rendered as raw strings beside a correctly-labelled `'seed_company'`. That was the fixture's fault, not the component's — the backend validates `traderType` against the canonical ten on the write path, so an unknown type cannot reach the queue from a real submission. Fixture corrected to `cooperative`/`offtaker`, which label correctly. Same for a `duplicateCandidateCount: 6` fixture: the server caps at 5, so 6 cannot occur.

### A-76 CLOSED — `PENDING_REVIEW` chip re-toned, 2026-09-02

The user judged the measured 4.42:1 chip visually wrong as well as sub-threshold, and asked for an amber. Resolved to **`bg-surface-alt text-warning`** in `lib/content/registration-status.ts`.

**Measured, not estimated** — and the first measurement was wrong, which is why the recommendation changed:

| Option | Ratio | Note |
|---|---:|---|
| **`bg-surface-alt text-warning`** (chosen) | **4.90:1** | Opaque — does not vary with the surface behind it |
| `bg-warning/10 text-warning` | 4.86 on `surface` · **4.64 on the warm `bg` canvas** | **Semi-transparent: contrast depends on what is behind it** |
| `bg-border text-muted` (previous) | **4.42:1** | ❌ below the 4.5:1 AA floor at 12px |

**An in-browser reading initially reported the translucent option at 5.56:1** — wrong, because `getComputedStyle` returns the *ancestor's* colour for a semi-transparent background rather than the composited one. Compositing 10% `#8F5E10` over each ground by hand gives 4.86/4.64. **Reporting the 5.56 would have recommended the weaker option on a measurement artefact.**

**Three reasons the opaque token is the better fix, beyond clearing the threshold:**
1. **It is predictable** — the translucent option's contrast shifts with the surface, and this chip renders over both `surface` (table rows) and `bg` (cards).
2. **It moves the pairing from ungated to gated.** `bg-border text-muted` sits **outside** `contrast.test.ts`'s matrix entirely (`border` is not one of its nine grounds), so nothing asserted it. `warning × surface-alt` **is** in the `REACHABLE` matrix — already asserted, and already used by `ActorHistoryPanel`'s `BULK_CONSENT` badge. `contrast` suite: **129/129**.
3. **The semantics were wrong before, not just the contrast.** `bg-border text-muted` is this repo's *neutral/inactive/skipped* pairing — `ActorsTable`'s default arm, `ImportPreviewTable`'s `skipped-*`, `UsersTable`'s inactive. `PENDING_REVIEW` **demands action**; it was borrowing an inactive token. Amber completes the triad with `APPROVED` (green) and `REJECTED` (red).

**Scope was one edit, not the five sites A-76 anticipated.** T-14's shared `REGISTRATION_STATUS_BADGE_CLASSES` module means one change covers the queue **and** the detail panel. The other four call sites keep `bg-border text-muted` because they use it for genuinely neutral states — **the token was never wrong there.** `AWAITING_APPLICANT`/`WITHDRAWN` also stay neutral, correctly: those are inactive states.

Verified rendered in-browser: the table chip resolves to `…bg-surface-alt text-warning`. `RegistrationsTable` 9/9 · `RegistrationDetailPanel` 26/26 · `contrast` 129/129.

**A-76 is closed. The remaining DC-16 items are R-13 (the red publish button) and the `Ineligible actor type` label — both still open for the user.**

### A-63 CLOSED — the `Ineligible actor type` reason re-labelled, 2026-09-02

The user chose **option 2 — re-label to something factual** — after the Leader laid out why the original was a governance problem rather than a wording one.

**The finding, sharpened before the decision.** Four of the five reasons describe **the submission** — a duplicate, incomplete information, unverifiable contact details, other. *"Ineligible actor type for this registry"* was the only one asserting a **policy about the applicant's category**, and:

1. **Neither the PRD nor the TRD defines eligibility.** A grep for `eligib`/`ineligib` across both returns **zero** matches. FR-11 requires the structured code be stored *"so duplicates are countable later"* — so the registry would have accumulated an auditable count of rejections for ineligibility **against criteria it has never published**.
2. **The form cannot express an ineligible type.** `registration-create.dto.ts` validates `traderType` with `@IsIn(TRADER_TYPES)` — the ten canonical types, **all legitimate registry members**. An applicant *cannot* submit an ineligible type. So the reason was either **unreachable** (a dead option in a five-item select) or **mislabelled** — a reviewer using it to mean *"this is not a seed-system actor at all"*, which is a different claim about a different field.

**Resolution:** `INELIGIBLE_ACTOR_TYPE` / *"Ineligible actor type for this registry"* → **`NOT_A_SEED_SYSTEM_ACTOR` / "Not a seed-system actor"**. That states a fact about the submission and applies no undefined policy.

**The code was renamed as well as the label, which required a judgment call against a written rule.** `rejection-reasons.ts`'s own docblock says a code *"is added here, never renamed or removed"* — but its stated justification is that *"a reason CODE **already written** to a `Registration.rejectionReason` column must keep resolving to a real reason forever."*

**Leader-verified before deciding:** `Registration` holds **0 rows** and `groupBy(['rejectionReason'])` returns **`[]`** — no stored value exists to orphan. **The invariant the rule protects is not engaged, so this is precisely the window in which the rule's own logic permits a rename; after deployment it would not be.** Leaving the code as `INELIGIBLE_ACTOR_TYPE` under a factual label would have created a code/label contradiction — its own KZ-008 smell.

**Five sites swept, and the rename is gated.** Backend `rejection-reasons.ts` · frontend `RejectionReasonCode` union · `RejectDialog`'s total `Record` · two pipe-message strings in `registrations-admin.test.ts` · and **`RejectDialog.test.tsx:59`, which pins all five option labels by exact array equality** — so the rename could not have been left half-done silently. (Contrary to A-61's read, the *frontend* does pin the labels; A-61's gap is on the backend's own spec.) Repo-wide grep for the old code and label: **zero** outside `execution.md`, which quotes them as history.

Backend **75 suites / 988 tests** · frontend **108 suites / 1,609 tests** · build static-export OK · `tsc` unchanged.

---

## DC-16 HUMAN CHECK — COMPLETE

| Property | Result |
|---|---|
| Focus order | ✅ user-verified by keyboard traversal, both screens |
| Focus visibility | ✅ user-verified |
| Responsive split at 768px | ✅ user-verified |
| Contrast | ✅ **measured**, not eyeballed — A-76 found and closed |

**Two of the three open items are now closed** (A-76 the chip, A-63 the label). **R-13 — the red `bg-danger` confirm button on the publish action — remains open** for the user, with the `tone?: 'danger' \| 'primary'` remediation named and deliberately not implemented under a task with no verification command.

**The spec is ready for `/akili-archive`.** The throwaway harness (`frontend/app/dc16-check/`) must be deleted first — it is not part of the deliverable.
