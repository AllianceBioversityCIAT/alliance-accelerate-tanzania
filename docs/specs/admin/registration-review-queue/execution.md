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
