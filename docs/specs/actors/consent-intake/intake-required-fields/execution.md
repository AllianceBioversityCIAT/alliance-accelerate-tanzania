# Execution — One intake contract: required fields, generated Trader ID, duplicate detection, template v4

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/actors/consent-intake/intake-required-fields` |
| Branch | `feature/atp-84-consent-request-email` |
| Started | 2026-10-02 |
| Leader | Claude Code session (`opus`) |
| Implementer | `.claude/agents/akili-implementer.md` (`sonnet`) |
| Reviewer | `.claude/agents/akili-reviewer.md` (`opus`, read-only), so author ≠ auditor |
| Approval Mode | gated |
| Budget (tripwire) | 8 tasks · ~1,800 LOC · ~13 review rounds (`tasks.md` Document Control) |

## 2. Task Execution History

### T-1 — The intake contract, and the required set on admin create and edit

**Attempt 1 — FAIL** (2026-10-02)
- **Implementer:** `akili-implementer` (sonnet), effort high, skills `nestjs-expert` + `tdd`. Exemplars: `consent-provenance.policy.ts`, `admin-actor-dto.spec.ts`.
- **Files changed:**
  - new: `backend/src/common/intake-contract.ts`, `backend/src/common/intake-contract.spec.ts`
  - modified: `backend/src/actors/dto/actor-create.dto.ts`, `dto/admin-actor-create.dto.ts`, `actors-admin.service.ts`, `actors-admin.service.spec.ts`, `dto/actor-dto.spec.ts`, `dto/admin-actor-dto.spec.ts`, `backend/src/test/admin-actors-crud.e2e.spec.ts`
- **Implementer verification:** 84 suites / 1290 tests passed; build clean; eslint 0.
  - All 5 falsifiers were reported red on the validation assertion, then restored.
  - The Implementer self-caught an inert email-bound fixture (`isEmail` rejects a local part over 64 characters on format, so the bound test could not discriminate) and replaced it with `validEmailOfLength`.
- **Evidence re-run (Leader, inline):** **VERIFIED**. Same 84 / 1290, build clean, eslint 0.
- **Reviewer:** `akili-reviewer` (opus), **FAIL**:
  1. **The NFR-1 test is one-directional.**
     - The reference side loops over a hardcoded `PAYLOAD_FIELDS`, not over `INTAKE_REQUIRED_FIELDS`.
     - It misses two drifts: removing `phone` from the declaration together with the admin DTO, and self-registration gaining a new required field.
     - `isRequired()` is vacuous when a property has no metadata at all.
     - Violates design §4.1 ("asserts all three **equal** the declaration") and NFR-1.
  2. **A weakened assertion.** The e2e `expect(res.body.contactPerson).toBeNull()` was deleted with a false "covered below" comment; `actor-incomplete-1` keeps a non-null contactPerson. Violates tasks.md §2 (*Consumers are part of Verify*).
- **Advisory (4R):**
  - PATCH `{crops: null}` produces a TypeError and a 500 in `missingIntakeFields`, where it should be a 400. This is pre-existing in kind.
  - FR-1's "same field-level messages" clause has no owner in the §5 closure table.
  - The merged check rejects whitespace-only `contactPerson`/`phone`, which create and self-registration accept. That makes the rules asymmetric.
  - The create test passes `crops: []`.
  - `validEmailOfLength` is copy-pasted three times.
- **runtime events:** none.

**Leader decisions after attempt 1:**
- **The closure gap is the Leader's own** (KZ-001), not the Implementer's.
- **Execute-time spec edit:** in `tasks.md` §5, I added a row for FR-1 "MUST use the same field-level messages the self-registration path uses".
  - Owners: T-1 for create; T-4 for import.
  - Interpretation, recorded here: the clause binds where a self-registration counterpart exists for the same omission, which means create and import. A PATCH merged-state omission has no self-registration counterpart, so it keeps `<field> is required`.
  - This narrows nothing the requirement states about create and import.
- **Attempt 2 brief:**
  - The Reviewer's report is carried verbatim, with effort bumped to xhigh.
  - The `crops: null` → 400 fix and the whitespace symmetry go in tagged `[advisory-grade]`, so they cannot fail the task.

**Attempt 2 — PASS** (2026-10-02)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received the Reviewer's attempt-1 report verbatim.
- **Files changed (cumulative):** the attempt-1 set, plus `intake-contract.ts` (`SCALAR_REQUIRED_FIELDS` is now derived from `INTAKE_REQUIRED_FIELDS`; `crops: null` is treated as `[]`; no trimming), a rewritten `intake-contract.spec.ts`, an `actor-incomplete-2` fixture in `admin-actors-crud.e2e.spec.ts`, and the service-spec create fixture.
- **Implementer verification:** 84 suites / 1301 tests; build clean; eslint 0. Every falsifier was shown red and then restored:
  - the five from tasks.md;
  - drift (a): phone removed from the declaration and the admin DTO, red on set-equality;
  - drift (b): `district` made required on self-registration, red on set-equality;
  - the message mutation, red on the FR-1 message test;
  - the `crops: null` guard removed, where the e2e reported "expected 400, got 500".
- **Evidence re-run (Leader, inline):** **VERIFIED**. 84 / 1301, build clean, eslint 0.
- **Reviewer:** `akili-reviewer` (opus), **PASS**. Both attempt-1 issues are resolved, and the named conformance check passes: FR-1's same field-level messages hold on create. `registration-create.dto.ts` is unchanged.
  - The Reviewer's boundary: every red/green above is the Implementer's account, corroborated only by the Leader's re-run.
- **Advisory (4R):**
  - `crops: null` and the whitespace symmetry are handled.
  - **An open product ruling.** The merged-state check runs before the consent logic. So a consent-*withdrawal*-only edit on an incomplete legacy actor returns 400 until the actor is completed, and design §4.4 does not exempt it. **Escalated to the product owner at the T-1 continue gate.**
  - `validEmailOfLength` is still duplicated three times. Deferred.
  - The interface keys of `IntakeRequiredStoredState` / `IntakeRequiredPatch` are hand-named, but are compile-checked through indexing.
- **runtime events:** none.
- **Requirements covered:** FR-1 (API side: create and edit, bounds, crops, the legacy-actor read and write), NFR-1 (DTO half), and the FR-1 messages clause (create).
- **Final status:** **PASS**. 2 attempts, 2 review rounds.
- **Product-owner ruling (2026-10-02, Daniela Gómez) — option 1.** Every edit, a consent-withdrawal-only edit included, requires a complete actor. No exemption is added. The rationale is D-3: current data is test data, and no new actor can be incomplete.

### T-2 — System-generated Trader ID on admin create

- **First step (P-17):** confirmed. `backend/CLAUDE.md` *Testing conventions* states the e2e harness is "AppModule + in-memory Prisma mock override". The gap stands for tests.
- **Environment:** local MySQL is the existing `accelerate-mysql` Docker container, started by the Leader after the product owner started Docker Desktop. `prisma migrate status` was up to date at 81762fa.

**Attempt 1 — FAIL** (2026-10-02)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It is a T2 tier, so effort cannot be raised to `max`; the tier rule escalates the tier instead, and the Leader chose not to, because the Reviewer runs on opus.
- **Files changed:**
  - new: `backend/prisma/migrations/20261002165928_add_actor_sequence/`, `backend/src/actors/trader-id.util.ts` (+ spec)
  - modified: `schema.prisma`, `dto/actor-create.dto.ts`, `actors-admin.service.ts` (+ spec), `dto/actor-dto.spec.ts`, `common/intake-contract.spec.ts`, `test/admin-actors-crud.e2e.spec.ts`
- **Implementer verification:**
  - The migration applied to local MySQL; 85 suites / 1316 tests passed; build clean; eslint 0.
  - All 4 falsifiers were reported red, then restored.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 85 / 1316, build, eslint 0, migrate status up to date.
- **Leader extra evidence, real MySQL.** A throwaway probe (`backend/src/__alloc_probe.ts`, deleted afterwards) called `allocateTraderIds` against the local container:
  - Allocating 3 then 2 gave `TM-2099-0001..0003` and `TM-2099-0004..0005`, which are contiguous.
  - 20 concurrent `allocateTraderIds(…, 1)` calls over the Prisma pool gave 25 ids in total, 25 distinct.
  - This **partially substitutes** the P-17 concurrency gap: one process, pooled connections. No committed test would fail on non-atomic SQL.
- **Reviewers:** parallel lens mode, because the task touches a migration.
  - **A** (`opus`; conformance + reliability + risk): **FAIL**. Two comments in `trader-id.util.ts` and `trader-id.util.spec.ts` claim the range allocator "has proven under real concurrent load" and "inherits that proof by construction".
    - The cited source makes that claim for `EmailSendBudget`, not `RegistrationSequence`.
    - The statement shape is not identical: it adds `count`.
    - Violates design §4.2 ("the range variant is new") and the T-2 Disqualifier.
  - **B** (`opus`; conformance + resilience + readability): **FAIL**.
    1. Oversized comment blocks: an 11-line block above a two-field model, about 20 added docstring lines, a 22-line spec header, and 6–8 line blocks per test. This violates the memory rule *comments match the change size*.
    2. Inaccurate comments:
       - (a) `mapPrismaError`'s `traderId` branch is dead: `isTraderIdCollisionError` catches *every* P2002, and nothing routes a collision to `mapPrismaError`. That contradicts design §4.4 ("kept for the allocation-retry path").
       - (b) The same "inherits by construction" overclaim as A.
  - Both reviewers PASS conformance and resilience.
- **Advisory (4R):**
  - Narrow `isTraderIdCollisionError` to `meta.target` containing `traderId` (A).
  - Falsifier 3 reddened on the call count, not the status (A; the Leader accepts it as a direct assertion).
  - Burned ids on a 400 inside the transaction (A, B; accepted by §4.2).
  - The `requiredPropertiesOf` `exclude` parameter is unused.
  - `NaN` on an empty `SELECT` result.
  - No PATCH-with-`traderId` e2e.
  - A UTC year-boundary flake in the unit tests (B).
- **runtime events:** none.

**Leader adjudication after attempt 1:**
- Both FAILs are in scope and caused by this task. They are false claims about artefacts (KZ-008) and comment density.
- **Execute-time design edit**, which does not change any requirement's meaning: design §4.4's `mapPrismaError` bullet is amended. Its old premise ("kept for the retry path") is false in the code as built.
  - New design: `isTraderIdCollisionError` is narrowed to a P2002 whose `meta.target` names `traderId`, which is reviewer A's advisory.
  - `mapPrismaError`'s now-dead `traderId` branch is removed.
  - A non-`traderId` P2002 falls through to the generic "Unique constraint violation" 409, as today.
- The edit is carried as a named conformance check into the attempt-2 Reviewer brief and the T-3 Reviewer brief.

**Attempt 2 — FAIL** (2026-10-02)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received both attempt-1 reports verbatim, plus the §4.4 edit and three `[advisory-grade]` items: the non-finite guard, removing `exclude`, and the year-boundary clock.
- **Implementer verification:** migrate status up to date; 85 suites / 1318 tests; build clean; eslint 0.
  - Falsifiers 2, 3 and the new 5 (un-narrowing) were re-run red.
  - Falsifiers 1 and 4 were unchanged since attempt 1.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 85 / 1318, build, eslint, migrate status.
- **Reviewer:** single reviewer, all four lenses. This deviates from parallel lens mode because the migration did not change in this attempt (the schema edit is comment-only).
  - **FAIL:**
    1. The narrowed `isTraderIdCollisionError` recognises only an **array** `meta.target`. If MySQL reports the index name as a **string**, a real collision is never retried, and the admin sees a 409. That breaks §4.2 and FR-2 scenario 2.
    2. A stale comment says the check "mirrors `mapPrismaError`'s read of `meta.target`", but that read was removed.
  - Attempt-1 FAILs A, B1 and B2 were all confirmed resolved.
- **Leader settled issue 1 against real MySQL** (local container, `@prisma/client` ^6.1.0). A throwaway probe (`backend/src/__p2002_probe.ts`, deleted) created two Actors with the same `traderId`. The result was:
  `code P2002 meta {"modelName":"Actor","target":"Actor_traderId_key"} typeof target string`.
  - **The finding is confirmed.** The defect was introduced by the Leader's own execute-time design edit after attempt 1.
  - Side observation, not in scope: the removed pre-existing `mapPrismaError` `traderId` branch also read `target` as an array, so it would never have fired on MySQL either.
- **Advisory:**
  - Leftover oversized comments: the 6-line JSDoc for the removed `traderId` field in `actor-create.dto.ts`, a 6-line comment over a 2-line test, and the `create()` docstring.
  - `registrations/admin-registrations.service.ts` still says "`ActorCreateDto` accepts any client-supplied `traderId`". That became stale with this task.
  - There is still no PATCH-with-`traderId` e2e.
- **runtime events:** none.

**Leader decision:**
- **Execute-time design edit:** design §4.4 now states that `meta.target` is matched in **both** shapes. On MySQL the measured shape is the index-name string `Actor_traderId_key`; an array that includes `traderId` is also accepted, for portability.
- Attempt 3 is the last allowed. Effort stays at xhigh (the T2 cap).

**Attempt 3 — PASS** (2026-10-02)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received the attempt-2 report verbatim and the measured MySQL shape.
- **Changes:**
  - `isTraderIdCollisionError` accepts both a string `meta.target` containing `traderId` and an array that includes it.
  - Fixtures now throw the real `'Actor_traderId_key'` shape.
  - The stale comment was removed.
  - Advisory trims were applied, and the stale sentence in `admin-registrations.service.ts` was fixed.
- **Implementer verification:** 85 suites / 1320 tests; build clean; eslint 0; migrate status up to date. Falsifiers 6, 1 and 5 were re-run red, then restored.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 85 / 1320, build, eslint.
  - **Real-engine check:** a throwaway probe (deleted) forced a real duplicate-`traderId` create on local MySQL, and `isTraderIdCollisionError(e)` returned **true**.
- **Reviewer:** `akili-reviewer` (opus), single reviewer, all four lenses, **PASS**. Both attempt-2 items are resolved, and the amended §4.4 is implemented. `.includes('traderId')` on a future composite index is judged a true Trader-ID collision, which is consistent with §4.4.
- **Advisory:**
  1. In `trader-id.util.spec.ts`, the comment on the `Actor_otherField_key` test wrongly claims the array-only revert reddens it. What actually reddens is the real-shape-true test. **Forward pointer → T-3 brief** (`[advisory-grade]` label fix).
  2. Optional: match the string exactly.
  3. The MySQL `meta.target` shape is now pinned only by fixtures and this log. Re-check it if `@prisma/client` moves past 6.x.
  4. No PATCH e2e (optional).
- **runtime events:** none.
- **Requirements covered:** FR-2 scenarios 1, 3 and 4 and the BUT clause for create and update. Scenario 2 uses retry specs, partially substituted by the real-MySQL probes; real concurrency through the test harness remains a declared gap.
- **Final status:** **PASS**. 3 attempts, 4 review verdicts (attempt 1 had two parallel lens reviewers).

**Budget check (recomputed now):** 2 of 8 tasks are done, and **6 review verdicts** have been used against ~13 (T-1: 2; T-2: 4). The budget is not yet exceeded, but the trend runs about 3 per task against ~1.6 planned. This is reported to the product owner at this gate.

## Budget tripwire — after T-2 (2026-10-02)

| Measure | Budget | Actual after 2 of 8 tasks | Source |
|---|---|---|---|
| LOC changed | ~1,800 | **~1,956** (T-1: +1096/−36; T-2: +692/−132) | `git diff --stat 1bf27d0 81762fa -- backend`; `git diff --stat 81762fa -- backend` |
| Review verdicts | ~13 | 6 | this log |
| Tasks | 8 | 2 done | tasks.md |

- **LOC is over budget with 6 tasks left.**
- **Cause:** tests dominate. Each task adds falsifier-backed specs and rewrites shared fixtures; for example, the e2e harness gained an in-memory `ActorSequence`.
  - The budget assumed about 700 production / 1,100 test LOC for the **whole** spec. T-1 and T-2 alone exceed that.
  - Review rounds also run at about 3 per task, against about 1.6 planned. Both FAIL sources were the Leader's own: a closure gap in T-1, and a design edit in T-2 that introduced the MySQL-shape defect.
- **Execution stopped. Escalated to the product owner** per `/akili-execute` *Budget Tripwire*.
- **Product-owner decision (2026-10-02): option 1.** Continue with the revised budget of **~5,500 LOC · ~22 review rounds** (tasks.md and design.md §11 updated). Execution resumes at T-3.
- **Leader process deviation (self-reported).** tasks.md's Budget row says execution "escalates to the user when any task reaches a 3rd review round". T-2's attempt 3 was its 3rd round, and **the Leader dispatched it without escalating first**. This rule was missed. The attempt passed and the product owner has since reviewed the budget, so nothing is reverted. From T-3 onward, a task's 3rd round stops for the user before dispatch.

### T-3 — Intake duplicate check and the admin-create gate

**P-14, settled (first step).** `IntakeDuplicateService.check()` was called once per candidate for 1,000 candidates, each against a 1,000-row **mocked** `actor.findMany`.
- Runs: 633 / 613 / 633 ms. The spread is 20 ms, against a 9.4 s margin to the 10 s disqualifier.
- **Limits:** local CPU only, a mocked scan with no DB fetch, not a Lambda timing, and the in-file index is excluded.
- **Outcome:** the matcher's comparison cost is not a Pivot risk. NFR-2 for the real import path is **re-timed in T-5**.

**Attempt 1 — FAIL** (2026-10-02)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh.
- **Files changed:**
  - new: `intake-duplicate.service.ts` (+ spec), migration `20261002200652_add_audit_duplicate_confirmation`
  - modified: `duplicate-detection.service.ts` (exports), `actors.module.ts`, `schema.prisma`, `actor-audit.service.ts` (+ spec), `audit-entry.serializer.ts`, `dto/admin-actor-create.dto.ts`, `actors-admin.service.ts` (+ spec), `admin-actors.controller.ts`, `trader-id.util.spec.ts` (the T-2 forward-pointer label fix), `test/admin-actors-crud.e2e.spec.ts`
  - The declared scope addition, exposing `audit-entry.serializer` `duplicateConfirmation` on the admin history read, was judged in scope and PII-safe by Reviewer A.
- **Implementer verification:**
  - The migration applied; 86 suites / 1353 tests; build clean; eslint 0.
  - All 6 falsifiers reported red, then restored.
  - The registration-queue specs are untouched and green.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 86 / 1353, build, eslint, migrate status.
- **Reviewers:** parallel lens mode.
  - **A** (`opus`; conformance + reliability + risk): **PASS**.
  - **B** (`opus`; conformance + resilience + readability): **FAIL**.
    1. `NormalizedActorRow` was exported with a comment saying `IntakeDuplicateService` reuses it, but nothing imports it (KZ-008; it is dead).
    2. `check()` has no batch form. That contradicts design §4.3, "one actor scan … reused for a whole import batch", and leaves T-5 to rework this service. `IntakeDuplicateIndex.match()` returns unsplit matches and `isStrongMatch` is private, so T-5 would duplicate the strong/weak rule.
- **Advisory (4R):**
  - The concurrent-create check-then-create race: both reviewers.
  - DD-3's uncapped strong set conflicts with `@ArrayMaxSize(50)` on `confirmedNotDuplicateOf` (A).
  - A T-6 forward pointer (A).
  - The P-14 limits (A, B).
  - The `classify` doc claims it is "independently unit-testable", but it is not exported (B).
  - `createIndex()` is uncalled (B).
  - Oversized comments (B).
  - There is no unknown-confirmed-id-with-no-strong-match test (B).
  - The `JsonNull` sentinel in the e2e mock (A).
- **runtime events:** none.

**Leader adjudication after attempt 1:**
- B's FAIL is in scope and caused by this task: the T-3 scope names the in-file API "for T-5", and design §4.3 names batch reuse.
- **Declared gap:** the concurrent-create race. Two simultaneous creates with the same email or phone can both pass the gate, because there is no DB uniqueness on contact fields.
  - FR-3 and the design are silent on concurrency, so this is a gap rather than a defect.
  - It is recorded here and as a design §9 risk row (execute-time edit), with the same standing as FR-2 scenario 2.
- **Accepted limit:** a create with more than 50 strong candidates cannot be confirmed, because of `ArrayMaxSize(50)`. Fifty strong matches for one new actor is itself a data defect. It is recorded as a design §9 risk row (execute-time edit); no code change.
- **Forward pointer → T-6:** a 409 lists only the unconfirmed candidates. The dialog must resubmit the **union** of every id confirmed during the session, or a confirm-A → 409-B sequence drops A and loops.
- **Forward pointer → T-6:** the in-memory e2e mock stores the `Prisma.JsonNull` sentinel, not `null`. Never assert `null` there.

**Attempt 2 — PASS** (2026-10-04)
- **Runtime events:**
  - A provider-limit stall (network outage, 600 s watchdog), climbed per the ladder:
    - **rung 1 tree probe:** partial edits were present (`loadActorSnapshot`, `checkBatch`, the `NormalizedActorRow` import), recorded and kept;
    - **rung 3:** resumed by message, and the worker's context survived. No attempt was consumed.
  - **Background waits:** the worker waited twice on its own `npm test`. It later reported two stalled Jest runs at 0 % CPU, which it killed and re-ran with direct file redirection.
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received Reviewer B's attempt-1 report verbatim.
- **Files changed (cumulative):** the attempt-1 set, plus:
  - `intake-duplicate.service.ts`:
    - `loadActorSnapshot` makes one scan, and `classifyAgainstSnapshot` is pure;
    - `checkBatch`, with `check` delegating to it;
    - a shared `partitionByStrength` also used by `IntakeDuplicateIndex.match()`, which now returns `{strong, weak}`;
    - `NormalizedActorRow` is genuinely imported;
    - `createIndex` is removed.
  - Spec additions.
  - Comment trims in `duplicate-detection.service.ts`, `actor-audit.service.ts`, `trader-id.util.spec.ts` and `actors-admin.service.spec.ts`.
  - An unknown-confirmed-id test.
- **Implementer verification:** migrate status up to date; 86 suites / 1358 tests; build clean; eslint 0.
  - **P-14 re-timed through `checkBatch`:** one snapshot, 1,000 candidates against 1,000 mocked actors gave **16 / 8 / 7 ms**. Limits: local CPU, a mocked scan, not Lambda, and the in-file index is excluded.
  - **Falsifiers, red then restored:**
    - the per-candidate scan, red on `toHaveBeenCalledTimes(1)`;
    - `traderName` classified strong in the shared rule, 9 reds across `intake-duplicate.service.spec` **and** `actors-admin.service.spec`;
    - the DD-3 cap;
    - the boolean confirmation.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 86 / 1358 (exit 0), build, eslint, migrate status, and no stray processes.
- **Reviewer:** `akili-reviewer` (opus), single reviewer, all four lenses (round 2 of this task), **PASS**.
  - Both attempt-1 items are resolved.
  - The §4.5 direction rule is supported by the caller-controlled add order.
  - The §9 rows describe the code accurately.
  - The P-14 timing remains author-reported, and its limits are stated above.
- **Advisory:**
  - **Forward pointer → T-5:** `IntakeDuplicateIndexMatch` carries `{key, …}`, while design §3 specifies the in-file candidate as `{kind:'row', row, traderName, matchedOn}`. T-5 must map `key → row` and must not leak `key` onto the wire.
  - There is no spec for "an unknown confirmed id plus a real strong match → 409". It holds by construction.
  - The comment correction in `trader-id.util.spec.ts` sits outside T-3's file list. It is noted in the commit message.
  - Long comments remain: a repeated defensive-stub note and a ~30-line module doc.
- **Requirements covered:** FR-3 on the API side (all five scenarios, the BUT clause and the PII line), NFR-3 on the create surface, and the NFR-2 premise (P-14).
- **Final status:** **PASS**. 2 attempts, 3 review verdicts (attempt 1 had two parallel lens reviewers).
