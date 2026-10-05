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
| Budget (tripwire) | 8 tasks · ~1,800 LOC · ~13 review rounds (`tasks.md` Document Control). *2026-10-05: superseded twice. See* Budget re-baseline — after T-5 *(~9,500 / ~26) and §3* Summary *(actual 8,916 / 24).* |

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

## Standing authorization — budget (2026-10-04, Daniela Gómez)

> "sigue, y si se pasa el presupuesto no pares, ajustalo y sigue"

- **For the rest of this spec**, a budget overrun does **not** stop execution. The Leader re-baselines the budget, records the delta and the cause here, and continues.
- **Leader's reading:** the tasks.md Budget row's "3rd review round" escalation is part of that same tripwire, so it is also covered: log it and continue.
- **Still stops for the product owner:** a HALT after 3 failed attempts, a Pivot, a `FATAL_FAIL`, and a destructive action. These are not budget events.

### T-4 — Template v4 and import row validation on the intake contract

**Attempt 1 — FAIL** (2026-10-04)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh.
- **Files changed:**
  - `common/template-columns.ts` (+ spec), `common/generate-template.spec.ts`, `common/intake-contract.spec.ts`
  - `scripts/generate-import-template.ts`
  - `actors/actor-import.service.ts` (+ spec)
  - `test/admin-actor-import.e2e.spec.ts`, `test/partner-profile-onboarding-import.e2e.spec.ts`
  - the regenerated `frontend/public/templates/actor-import-template.xlsx`
  - The legacy `backend/src/import/**` is untouched: `git diff --stat -- backend/src/import` is empty (Leader-checked).
- **Implementer verification:** 86 suites / 1382 tests; build; eslint 0. All 6 falsifiers reported red, then restored.
- **Evidence re-run (Leader, inline):** **VERIFIED**. The Leader re-ran `generate:template` and the byte-identity spec stayed green, so the generator is stable. 86 / 1382, exit 0; build; eslint.
- **Disqualifier (stated):** the import suites mock Prisma. They prove row routing and chunk fault isolation as the code handles it, **not** that per-chunk transactions commit or roll back in MySQL. That gap follows P-17.
- **Reviewers:** parallel lens mode.
  - **A** (conformance + reliability + risk): **FAIL**. The email ≤191 bound test cannot fail: the fixture's local part is over 64 characters, so `isEmail` rejects it first. That is the bound protecting a whole chunk from a `VARCHAR(191)` rollback.
  - **B** (conformance + resilience + readability): **FAIL**.
    1. The exhaustion test exhausts the last chunk, so a `break` on exhaustion would stay green, and the title is false.
    2. The same email-bound fixture as A.
    3. `CONTRACT_REQUIRED_PROPERTIES` is a hand re-typed copy of the contract, and its comment falsely says NFR-1 pins it.
    4. FR-5: "at least one crop" is not marked required anywhere in the template.
    5. A weakened assertion: the partner-profile e2e no-upsert before/after equality was deleted.
    6. Comment truthfulness and density: "3 contract scalars" when there are 4; "removed" for rewritten tests; 5–12-line blocks.
  - Both reviewers confirmed:
    - per-attempt allocation;
    - chunk-local exhaustion in code;
    - the real MySQL collision shape;
    - forced `TEAM_MANAGED`;
    - unchanged `GRANTED` provenance;
    - required set and bounds that match the admin path;
    - no data-loss path in the code.
- **Advisory (4R):**
  - The pre-existing isolation tests now reject the allocation transaction, not the chunk transaction, and their comments are stale. No test drives a non-collision error inside the chunk transaction.
  - Falsifier 5 asserts call counts, not distinct IDs.
  - Memoize `missingContractFieldErrors`. It runs one `validateSync` per missing field per row, which matters for the NFR-2 budget T-5 shares.
  - The `actor-import.types.ts` doc still describes `skipped-*` as live outcomes.
  - The `lambda-handler` e2e fixtures carry an inert `traderId` / `idPrefix`, and their rows now fail validation. The tests stay valid; this is a cleanup.
  - HOW_TO line 7's "held for review" depends on T-5 landing before release.
- **runtime events:** none.

**Concurrency observation (2026-10-04, during T-4 attempt 2):**
- The T-4 Implementer reported intermittent failures in files untouched by T-4 (`admin-registrations-reject.e2e.spec.ts`, `pii-boundary.spec.ts`). Each file passed in isolation afterwards.
- The Leader checked the process table and found **four other `claude` processes with this checkout as their cwd**: PIDs 14847 and 14928 (`--resume`, started 2026-10-01 08:34), and 95536 and 96006 (started 2026-10-01 14:42 / 15:44). Two of them showed non-zero CPU.
- The branch (`feature/atp-84-consent-request-email`), HEAD (`2e730f2`) and the working tree contain only this spec's changes. No foreign commits or edits have been detected so far.
- The Leader's own quiet-tree re-runs were green (86 / 1384, exit 0), after killing a stale idle Jest left by the worker.
- This is KZ-010 (one AKILI session per checkout). It is surfaced to the product owner at the T-4 gate.

**Attempt 2 — PASS** (2026-10-04)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received both attempt-1 reports verbatim.
- **Changes:**
  - Removed `CONTRACT_REQUIRED_PROPERTIES`. A contract-driven `it.each(INTAKE_REQUIRED_FIELDS)` over a `Record<IntakeRequiredField, CellMap>` replaces it.
  - The email fixture is now a well-formed 192-character address that self-asserts `isEmail`.
  - The exhaustion test now exhausts chunk 1, with chunk 2 still created.
  - HOW_TO line 4 says "At least one crop must be YES", with a test.
  - Restored the partner-profile no-upsert equality.
  - Memoized `missingContractFieldErrors`.
  - Added a non-collision chunk-create-transaction test.
  - Falsifier 5 now also asserts distinct IDs.
  - Corrected the `actor-import.types.ts` doc and comment fixes.
  - Regenerated the asset.
- **Implementer verification:** 86 suites / 1384 tests; build; eslint 0. Falsifiers red, then restored:
  - an exhaustion rethrow **and** a `break`;
  - the email bound branch removed;
  - a dummy contract field, which fails with TS2741 compile under ts-jest with diagnostics on;
  - the HOW_TO crop line reverted;
  - a simulated upsert;
  - a byte flip, the v3 stamp, and contactPerson not required.
- The Implementer later added a note: intermittent failures in untouched files (`admin-registrations-reject.e2e`, `pii-boundary`) that pass in isolation. It attributed them to concurrent sessions; see the concurrency observation above.
- **Evidence re-run (Leader, inline):** **VERIFIED** on a quiet tree. The Leader killed a stale idle Jest left by the worker. A first run exited 143 with all 86 / 1384 passing; a second run exited 0 with 86 / 1384. Build and eslint passed, and the regenerated template stays byte-identical.
- **Reviewer:** `akili-reviewer` (opus), single reviewer, all four lenses (round 2 of this task), **PASS**.
  - All substantive attempt-1 FAILs are fixed.
  - The compile-time drift gate was judged acceptable: the jest transform is plain `ts-jest` with diagnostics on. **Caveat:** setting `isolatedModules` or `diagnostics:false` would silently disable it.
- **Advisory:**
  1. Comment density did not go down; several 6–9 line blocks remain.
  2. New small comment inaccuracies:
     - (a) a garbled fragment in the `BLANK_OVERRIDE_FOR` doc;
     - (b) the spec header says every `skipped-*` scenario was REWRITTEN, but "names skipped rows" was deleted;
     - (c) the phone comment cites design §4.1 instead of the intake contract;
     - (d) the Contact Person comment says "above" when the check is below.
  3. Cached error objects are shared by reference across rows. Nothing mutates them today.
  4. HOW_TO line 7 depends on T-5.
  5. Stray `traderId` overrides remain in one chunk test and in `lambda-handler`.
  - **Forward pointer → T-5 brief:** advisories 1–2 and 5 go in as `[advisory-grade]` cleanup, since T-5 edits the same files.
- **runtime events:** none (the stale Jest was a worker leftover, not a runtime event).
- **Requirements covered:**
  - FR-1 import: missing cell, capacity 0, bounds, same messages;
  - FR-2 import path: per-chunk allocation, retry, chunk-local exhaustion;
  - FR-5: all four scenarios plus the Instructions sheet, including the crop requirement;
  - NFR-1: the template half, and the import side through the contract-driven test.
- **Final status:** **PASS**. 2 attempts, 3 review verdicts.
- **Product-owner decision (2026-10-04): option 2.** The other sessions are left open; the product owner is not working in them. The Leader continues and re-checks `git status` and `git log` before every commit.

### T-5 — Import duplicate classification and per-row confirmation

**Attempt 1 — FAIL** (2026-10-04)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh.
- **Files changed:** `actor-import.types.ts`, `actor-import.service.ts` (+ spec), `actor-audit.service.ts` (+ spec), `dto/actor-import-request.dto.ts` (+ spec), `test/admin-actor-import.e2e.spec.ts`, `test/partner-profile-onboarding-import.e2e.spec.ts`.
- **Implementer verification:** 86 suites / 1404 tests; build; eslint 0. All 6 falsifiers were reported red, then restored.
- **NFR-2 re-timing:** `run()` in preview over 1,000 rows, with the **real** `IntakeDuplicateService` and the in-file index, against a fake Prisma of 1,000 actors. Runs: **82.5 / 55.0 / 47.7 ms**.
  - Limits: local CPU, mocked DB.
  - The fixture used distinct identities, so the worst case of shared identities was not timed.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 86 / 1404, exit 0; build; eslint.
  - No `skipped-*` production hits, apart from one explanatory doc comment in `actor-import.types.ts`.
- **Reviewers:** parallel lens mode.
  - **A** (`opus`; conformance + reliability + risk): **FAIL**.
    - Strong in-file candidates are uncapped on the wire. N rows sharing one phone or email produce N(N−1)/2 candidates.
    - About 385 such rows exceed Lambda's 6 MB synchronous response limit, and the preview would 5xx with no report.
    - Neither §9 nor DD-3 covers this case.
    - Everything else conforms, including the snapshot resolution across chunks and the `logImport` alignment.
  - **B** (`opus`; conformance + resilience + readability): **FAIL**.
    1. The FR-4 weak scenario against an **existing actor** is untested. Only the in-file weak case is driven, and nothing exercises `dbResult.weak`.
    2. "No NFR-2 evidence." **This is the Leader's own brief omission:** the 82.5 / 55.0 / 47.7 ms timing was given to Reviewer A but not to Reviewer B. The evidence exists, as recorded above.
    3. A KZ-008 comment says "byte-identical after the second run", but the test only checks `traderName`.
- **Advisory (4R):**
  - Falsifier 5's commit-form red was not executed.
  - The countability fixture has a row named `'Weak Match'` that matches nothing.
  - "Ignored in preview" for `duplicateConfirmations` has no spec.
  - The `create` outcome is still in the union. It is needed, but design §3 and tasks.md say otherwise.
  - The `skipped-*` doc comment remains.
  - Candidate keys are not format-checked.
  - The `bulkRow` phone may normalize to a cleared value.
  - Comment density is still high.
  - Weak matches are DB ≤5 plus in-file ≤5 (acceptable; record it in §3).
  - The import `candidates` `ArrayMaxSize(50)` limit is not in §9.
  - Strings in `candidates` have no `@MaxLength`.
  - The NFR-3 unit key set covers only the `kind:'row'` shape.
- **runtime events:** none.

**Leader adjudication and execute-time design edits** (none changes a requirement's meaning):
- **design §3, import row:**
  - The outcome union is `create | created | possible-duplicate | failed`. `create` is the preview state; this documents what is already built.
  - **Per-row strong candidates on the wire are capped at 50**, with a `duplicateCandidatesTotal` count. Gating still uses the **full** strong-key set, so a row with more than 50 strong candidates cannot be confirmed. That joins the §9 accepted limit.
  - Weak matches are DB ≤5 plus in-file ≤5.
- **design §9:** the ">50" accepted-limit row is extended to the import's per-entry `candidates`, and to the wire cap.
- **tasks.md T-5 scope line:** the union is amended to match.
- **Attempt 2 brief:**
  - both reports, verbatim;
  - A's issue resolved by the edits above, with a shared-identity spec (N rows sharing one email give a bounded per-row length, a correct total, and are still gated) and a worst-case timing;
  - B's issues 1 and 3;
  - B's issue 2 answered by the recorded timing, plus a new worst-case timing;
  - `[advisory-grade]`: the preview-ignores-confirmations spec, falsifier 5 on the commit form, the `'Weak Match'` rename, the `@Matches` / `@MaxLength` on keys, an actor-kind NFR-3 key set, and the `skipped-*` comment.

**Attempt 2 — PASS** (2026-10-04)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received both attempt-1 reports verbatim, plus the design edits.
- **Changes:**
  - `MAX_WIRE_DUPLICATE_CANDIDATES = 50` and `duplicateCandidatesTotal`. Gating still uses the full `strongKeys`.
  - New specs: 200 rows sharing one email (length, total, gating), and "confirming the 50 shown does not create".
  - A DB-weak commit spec.
  - The admin e2e re-upload now compares full detail bodies with `toEqual`.
  - All `[advisory-grade]` items were left undone.
- **Implementer verification:** 86 suites / 1407 tests; build; eslint 0.
  - **Worst-case probe:** the real `IntakeDuplicateService`, preview mode, 1,000 rows all sharing one email, against 1,000 mocked actors. Timings **194.6 / 194.8 / 158.7 ms**; serialized report **3,979,526 bytes**. The last row was `possible-duplicate`, with 50 candidates out of 999.
  - The probe's name length and DB match count were not reported, so the size figure cannot be reproduced exactly.
  - **Falsifiers, red then restored:** 1, 2, 3, 4 and 6; removing the cap; folding DB weak matches into strong.
  - Falsifier 5 was not re-run in either attempt: its commit form was never executed red.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 86 / 1407, exit 0; build; eslint; quiet tree.
- **Reviewer:** `akili-reviewer` (opus), single reviewer, all four lenses (round 2 of this task), **PASS**. All attempt-1 FAILs are resolved.
  - The 3.80 MB figure is not a true worst case, because size scales with name length.
  - It is **not a defect**: NFR-2 is a timing budget, and in-Lambda gzip covers browser clients.
  - The reviewer asked for it to be recorded as a residual risk. **design §9 now has that row**, as an execute-time edit (doc only).
- **Done-when grep interpretation (Leader):** `actor-import.types.ts` keeps one doc comment that names the removed outcomes in order to explain what replaced them. The Leader accepts it as an explanatory reference, not a live use. It can be reworded in cleanup.
- **Advisory, not done:**
  - a "preview ignores confirmations" spec;
  - the `'Weak Match'` fixture name;
  - `@Matches` / `@MaxLength` on candidate keys;
  - duplicate `row` entries in `duplicateConfirmations`, which resolve last-wins;
  - docblock trims.
- **runtime events:** none.
- **Requirements covered:** FR-4 on the API side (all six scenarios and the BUT clause); NFR-2 on the import path, as timing; NFR-3 on the import surface.
- **Final status:** **PASS**. 2 attempts, 3 review verdicts.

## Budget re-baseline — after T-5 (2026-10-04, under the standing authorization)

| Measure | Revised budget | Actual after 5 of 8 tasks | New baseline |
|---|---|---|---|
| LOC changed (backend + template) | ~5,500 | **~6,286**: T-1 1,132; T-2 824; T-3 1,404; T-4 1,505; T-5 1,421 (`git diff --stat` per task commit) | **~9,500** |
| Review verdicts | ~22 | **15**: T-1 2; T-2 4; T-3 3; T-4 3; T-5 3 | **~26** |

- **Cause, unchanged:** tests dominate each task, and every task needed a rework round. Production code remains within the original estimate.
- **Remaining:** T-6 and T-7 (frontend) at about 1,200 LOC each, and T-8 (docs) at about 200.
- Per the product owner's standing instruction, **execution continues** with no stop.

### T-6 — Admin form: required fields, no Trader ID input, the duplicate dialog

**Attempt 1 — FAIL** (2026-10-04)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. Skills: `vercel-react-best-practices`, `tailwind-design-system`, `frontend-design`, `react-doctor`.
- **Files changed:**
  - new: `components/admin/DuplicateConfirmDialog.tsx`, `lib/content/intake-required-fields.ts`, `app/(admin)/admin/actors/new/page.test.tsx`
  - modified: `lib/api/client.ts` (+ test), `lib/api/actors-admin.ts` (+ test), `components/admin/ActorForm.tsx` (+ test), `components/admin/ActorHistoryPanel.tsx` (+ test), `app/(admin)/admin/actors/new/page.tsx`, `app/(admin)/admin/actors/edit/page.test.tsx`
- **Implementer verification:** `tsc` exit 0; 120 suites / 1811 tests; lint clean (4 pre-existing `<img>` warnings); static-export build with 27 routes. react-doctor went from 80 to 82.
  - All 6 falsifiers were reported red, then restored.
  - **Captures:** 9 PNGs at 375 / 768 / 1440 from a throwaway harness page (deleted). Fonts were loaded and there was no page overflow; at 375 only Leaflet's internal panes overflow.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 120 / 1811 exit 0; lint 0; build 0. No `/NN` token-opacity utilities in the added lines. The Leader viewed `duplicate-dialog-375`.
- **Reviewer:** `akili-reviewer` (opus), with all four lenses and the visual check over 4 captures. **FAIL:**
  - `FRONTEND_INTAKE_REQUIRED_FIELDS` is never used by `validate()`, which hardcodes each check. So the "frontend required-set pin" test compares an unused constant with a literal and **can never fail** when `validate()` changes.
  - Two comments claim the opposite.
  - Falsifier 5's red really came from "rejects a create with Phone left blank".
  - This is the KZ-002 class: a gate that cannot fail.
  - Type fidelity, the union of confirmed ids, the read-only Trader ID, the weak info dialog, the history line, tokens and captures all passed.
- **Advisory (4R):**
  - The dialog panel shows the browser's default focus outline, which is not a token. Focus Cancel instead, or add `focus:outline-none` to the `tabIndex=-1` panel.
  - At 375 the dialog touches the viewport edges, matching the house `ConfirmDialog`. That calls for a shared follow-up.
  - The copy "held for review" is misleading on create, where nothing is held. Suggest "has not been created".
  - The `ActorHistoryPanel.test` comment about the `JsonNull` sentinel does not match the `[]` fixture.
  - A stray blank line, and the confirmed-ids ref is not reset on Cancel (harmless).
- **runtime events:** none.

**Attempt 2 — FAIL** (2026-10-04)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received the attempt-1 report verbatim.
- **Changes:**
  - `validate()` now loops over `FRONTEND_INTAKE_REQUIRED_FIELDS` through a total `Record` (`REQUIRED_FIELD_CHECKS`), and the comments were corrected.
  - The panel got `focus:outline-none`.
  - The copy now reads "has not been created".
  - A `{}` non-array test was added to `ActorHistoryPanel`.
  - Captures re-taken.
- **Implementer verification:** 120 / 1812; tsc 0; lint; build.
  - Falsifier 5 (removing `phone` from the constant) gave TS2353, a red pin, and a red Phone-blank test.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 120 / 1812, exit 0; tsc; lint 0; build 0 with 27 routes. `out/` has no harness route, and no stray processes (one VS Code process, unrelated).
- **Reviewer:** `akili-reviewer` (opus), round 2. The attempt-1 FAIL is resolved, and the pin now catches the drift.
  - **New FAIL (NFR-4):** `DuplicateConfirmDialog` focuses the `tabIndex=-1` panel. `useDialogFocusTrap` only wraps at the first and last focusables, so **Shift+Tab from the panel escapes** to ActorForm's Submit button behind the backdrop, where Escape no longer works. No test covers this, because jsdom has no native Tab.
- **Advisory:**
  - "Not possible by construction" overstates it.
  - The pin compares two frontend copies; the backend is not pinned from the frontend (DD-1 accepts this).
  - Whitespace: the frontend trims, the backend does not, so the client is stricter.
  - Carried-over cosmetics.
- **runtime events:** none.
- **Leader note:** the next attempt is this task's **3rd review round**. Under the standing authorization it is logged and execution continues, with no stop. Attempt 3 is the last before a HALT.

**Attempt 3 — PASS** (2026-10-04)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received the attempt-2 report verbatim.
- **Changes:**
  - `DuplicateConfirmDialog` now focuses the first enabled button on open, and the panel's `tabIndex` / `focus:outline-none` are removed.
  - The weak info dialog already focused a real OK button; it is unchanged.
  - Tests: open focus is a BUTTON inside the dialog, and a Shift+Tab test goes through the hook's handler.
  - Advisory comments reworded. The client's trimmed blank check is kept, with a comment.
- **Implementer verification:** 120 suites / 1813 tests; tsc; lint; build.
  - **Falsifier:** reverting to panel focus turns both assertions red.
  - **Real browser** (headless Chrome via CDP, throwaway harness deleted):
    - initial focus: `BUTTON "Cancel"`, inside the dialog;
    - after Shift+Tab: `BUTTON "Not a duplicate — create"`, still inside the dialog.
  - Capture: `scratchpad/duplicate-dialog-375.png`.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 120 / 1813, exit 0; tsc; lint 0; build 0. The route list is identical to attempt 2 (27 lines), with no harness and no stray processes.
- **Reviewer:** `akili-reviewer` (opus), round 3, **PASS**.
  - The NFR-4 issue is resolved.
  - No regression in attempts 1–2's passing items.
  - The whitespace claim is verified: `buildDto` sends `trim() || null`.
- **Reviewer's boundary:** the native Tab order in the browser is the author's CDP measurement only. No test drives native tabbing.
- **Advisory:**
  - The `hasDuplicateCandidates` doc says a Trader ID collision "can no longer even occur"; "no longer client-attributable" is more accurate.
  - `DialogFooter` disables the focused button while loading, so focus drops to `<body>`. This is pre-existing, house-wide.
  - The 375 gutter (house-wide; follow-up).
  - The hook has no focus restore on close; this is a known defect.
- **runtime events:** none.
- **Requirements covered:**
  - FR-1 form side;
  - FR-2: ID shown, no input on create, read-only on edit;
  - FR-3 UI side: strong dialog, confirm and resubmit of the union, weak info dialog, audit line;
  - NFR-1 frontend half;
  - NFR-3 (no values);
  - NFR-4: focus trap, Escape, `aria-live`, captures.
- **Final status:** **PASS**. 3 attempts, 3 review verdicts. Round 3 was logged and continued under the standing authorization.

### T-7 — Import page: per-row confirmation and the new outcomes

**Attempt 1 — FAIL** (2026-10-04)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh.
- **Files changed:** `lib/api/actors-admin.ts` (+ test), `components/admin/ImportPreviewTable.tsx` (+ test), `app/(admin)/admin/actors/import/page.tsx` (+ test).
- **Implementer verification:** 120 suites / 1832 tests; tsc; lint; build with 27 routes. All 5 falsifiers were reported red, then restored.
  - **Captures** at 375 / 767 / 768 / 1440 (`scratchpad/t7-captures/`): fonts loaded, no overflow, and the table/cards swap exactly at 767 → 768.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 120 / 1832, exit 0; tsc; lint 0; build 0, with a route list identical to T-6's. `bg-warning/10` appears only in the test asserting its absence. The Leader viewed `t7-768.png`.
- **Reviewer:** `akili-reviewer` (opus), **FAIL**.
  1. The commit button and its copy still use `totals.toCreate`, which excludes ticked `possible-duplicate` rows.
     - (a) A re-upload where every row is flagged leaves the button **disabled**, and the page says "No rows are eligible". The confirmation can never be sent, and FR-4's main scenario cannot be completed.
     - (b) Otherwise the label undercounts what the commit actually creates.
  2. The copy "Skipped and failed rows are not imported" is stale.
  - **Leader's visual question, answered:** the Trader ID and post-commit labels in the preview section are a **harness fixture artifact**. `validateRow` sets `traderId: null` and the component renders `?? '—'`.
- **Advisory:**
  - In weak-warning lines, the inner `text-fg` spans override the amber colour.
  - The over-cap note should be tied with `aria-describedby` and start with a capital.
  - Page-test fixtures still carry preview-row `traderId`s; set them to `null`.
  - The `ImportRowResult.traderId` JSDoc describes the UI rather than the field.
- **runtime events:** none.

**Attempt 2 — PASS** (2026-10-04)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received the attempt-1 report verbatim.
- **Changes:**
  - `isConfirmableRow` is now the single source for both the payload and `confirmableCreateCount`, which is `toCreate` plus the ticked confirmable rows. That count drives the button's disabled state, its label and the summary.
  - The summary now reads "Possible duplicates you have not confirmed and failed rows are not imported."
  - The over-cap note has an `aria-describedby`.
  - Preview fixtures use `traderId: null`.
  - The `traderId` JSDoc was corrected.
  - The "To create" chip was deliberately left as the raw backend breakdown.
- **Implementer verification:** 120 suites / 1836 tests; tsc; lint; build.
  - Reverting the count turned 3 tests red.
  - Ignoring the over-cap rule turned the over-cap test red. The reviewer doubts this one; see below.
- **Evidence re-run (Leader, inline):** **VERIFIED**. 120 / 1836, exit 0; tsc; lint 0; build 0; same route list.
- **Reviewer:** `akili-reviewer` (opus), round 2, **PASS**. Both attempt-1 items are resolved.
  - **Issue recorded for action before archive** (not a T-7 defect; it cannot be fixed in the UI):
    - **The T-5 ordering bypasses the consent gate for held rows.** `classifyDuplicates` runs before `applyConsentGate`, and the gate skips `possible-duplicate` rows. That has two effects:
      - (a) A ticked `GRANTED` row with valid provenance fails at commit with "Acknowledgement is required…", unless another row triggered the acknowledgement dialog. FR-4 ("confirming a row → created") breaks for that row. It fails closed.
      - (b) A strongly matched `GRANTED` row with a blank Consent Method shows as `possible-duplicate` in preview, not `failed` with the provenance reason. That violates FR-5 ("when previewed … fails with today's provenance reason, unchanged").
    - `ImportRowResult` carries no consent status, so the UI cannot compensate.
- **Advisory:**
  - The "To create" chip next to a larger button count reads as contradictory. Relabel it, or show "+N confirmed".
  - "No rows are eligible … upload again" is misleading when rows could be ticked instead.
  - The over-cap falsifier clicks a *disabled* checkbox, so it may not discriminate. The disabled control is the real gate; this is low risk.
  - "Skipped" wording remains in a comment and in the `failureBreakdown` JSDoc.
  - Weak-line colour contrast and the lowercase note.
  - The captures were not re-taken after the copy change.
- **runtime events:** none.
- **Requirements covered:**
  - FR-4 UI side: confirm a row, weak warnings shown, totals shown, and unticked rows not created;
  - NFR-4.
  - FR-4 "confirming a row" for `GRANTED` rows is **open**: see the T-5 reopening below.
- **Final status:** **PASS**. 2 attempts, 2 review verdicts.

## Reopening T-5 (2026-10-04, Leader)

- **Why:** the T-7 reviewer found a defect in T-5's shipped code, which is commit `05d468f` (issue above).
  - **Routing test:** it is in scope (FR-4 and FR-5 are T-5's rows), and **this spec caused it** (the T-5 ordering).
  - It is an implementation defect against approved requirements, **not** a spec change. That makes it neither a Pivot nor an advisory.
- **What happens:** T-5 moves `[x] → [~]` for one more attempt (attempt 3) with this finding as the brief.
  - **Fix:** run the provenance check and the acknowledgement warning on `possible-duplicate` rows too.
  - **Precedence (design decision, Leader):** a provenance failure outranks the hold, so the row is `failed` with today's reason. Rationale: FR-5 says the reason is "unchanged", and a held row that can never be created is worse than a failed row.
  - This is an execute-time design edit to §4.5. It does not change any requirement's meaning: it restores FR-5.
- T-8 waits for it.
- **The product owner is informed at this gate.**

**T-5 attempt 3 (reopened) — PASS** (2026-10-05)
- **Runtime event:** a stall from a network outage, with the 600 s watchdog firing. Climbed per the ladder:
  - **rung 1 tree probe:** partial edits in `actor-import.service.ts` (+31/−5) and its spec (+116), kept;
  - **rung 3:** resumed by message, and the worker's context survived. No attempt was consumed.
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received the T-7 Reviewer's finding verbatim, plus the design §4.5 amendment.
- **Changes:**
  - `classifyDuplicates` no longer clears `row.create` on hold. Commit still gates on `state === 'candidate'`.
  - `applyConsentGate` now runs on `possible-duplicate` rows:
    - provenance fails: the row becomes `failed` with today's reason, and `create` is cleared;
    - provenance passes on a `GRANTED` row: the row stays held and carries `CONSENT_ACK_WARNING`, in preview only.
  - A held row that fails provenance keeps its candidates on the wire. The reviewer accepted this; design §3 does not limit candidates by outcome.
  - 5 new specs.
- **Implementer verification:** backend 86 / 1412; build; eslint. Frontend 120 / 1836, unaffected and unedited.
  - **Falsifiers, red then restored:**
    - skipping held rows again: 3 reds;
    - dropping the warning on held rows: red;
    - dropping the commit-time acknowledgement gate for confirmed rows: red.
- **Evidence re-run (Leader, inline):** **VERIFIED**. Backend 86 / 1412, exit 0; build; eslint.
- **Reviewer:** `akili-reviewer` (opus), **PASS**.
  - Every read of `row.create` and `state` was traced: no held row can be created unconfirmed.
  - The FR-5 reason text comes from the same `buildProvenanceRowErrors` call.
  - One reason per row and the totals invariants hold, as does KZ-007.
  - The frontend `reportNeedsAcknowledgement` picks up the held-row warning.
- **Advisory:**
  1. Untested: an **unconfirmed** held `GRANTED` row in commit mode without `acknowledged` must stay `possible-duplicate`, and commit mode must not add the warning to held rows.
  2. The acknowledgement dialog also fires when a held `GRANTED` row is left unticked. This is harmless friction.
  3. `totals.warnings` now counts held `GRANTED` rows.
- **Requirements now closed:** FR-5 "GRANTED without provenance → failed with today's reason, unchanged" for strongly matched rows, and FR-4 "confirming a row → created" for `GRANTED` rows.
- **Final status:** **PASS**. 3 attempts in total for T-5, plus 1 review verdict this round.

### T-8 — Baseline documents

**Attempt 1 — FAIL** (2026-10-05)
- **Implementer:** `akili-implementer` (sonnet), effort high. Skills: `software-architect`, `product-manager-toolkit`, `cognitive-doc-design`.
- **Changes:**
  - `docs/prd.md`: AC-4 extended.
  - `docs/trd/trd.md`:
    - the natural-key row (L71);
    - a new paragraph on `ActorSequence` and the audit column;
    - the CSV-import bullet;
    - QA-9;
    - a new `ADR-NNN` row.
  - `backend/CLAUDE.md` / `AGENTS.md` were not edited. Both are version-agnostic and agree.
- **Unmerged-branch ADR check:** no branch touches `trd.md` ahead of main, and main holds ADR-016.
- **Pre-change grep** at b6e8853 found 3 hits: TRD L71, L209 and L398.
- **Post-change grep:** 3 hits, all of them negations written by the Implementer.
- **Evidence re-run (Leader, inline):** the grep reproduced; each hit was read and is a negation.
- **Reviewer:** `akili-reviewer` (opus), the mandatory baseline review. **FAIL:**
  1. **TRD §4 (API surface) untouched**, though FR-6 bullet 2 says "data model **and API sections**". The rows list `POST/PATCH/DELETE /api/v1/actors` and `POST /api/v1/import` (multipart CSV), which no controller answers. The live routes are under `admin/actors`.
  2. **Stale import-contract lines (KZ-004):**
     - L56 `ImportModule` "transactional bulk upsert";
     - L87 contactPerson "optional on import";
     - L94 says the table lists accepted import headers, which still includes `Trader_id` and the GPS altitude/accuracy rows dropped in v4.
  3. The rewritten L211 keeps a false "CSV import: parse (streaming)". The real import is a base64 `.xlsx` loaded with exceljs. "Assigned immediately before its chunk commits" is imprecise.
  4. The negating mentions are not live instructions, but they can be deleted with no loss (KZ-008), so the grep should reach a literal 0.
- **Reviewer adjudication (b):** leaving `backend/CLAUDE.md` / `AGENTS.md` unedited is acceptable, recorded as a **scoped deviation** from T-8's Files list: they are version-agnostic and agree.
- **Advisory:**
  - ADR-NNN omits DD-5 item 2: legacy actors with no contact data are re-created on re-import.
  - The "can exceed 6 MB" claim cites only the 3.80 MB measurement; add §9's ~7 MB estimate and its provenance.
  - "Stays held" fits an import row, but an over-cap admin create is 409-blocked, not held.
  - "Neither column": `ActorSequence` is a table, not a column.
  - `ADR-NNN` is cited 4 times, and the archive-time allocation must sweep all four.
  - Pre-existing wording: PRD US-6 "update", and "CSV" in QA-9 / AC-5.
- **runtime events:** none.
- **Leader decision:** issues 1–4 are in scope (FR-6). The Leader-authored design §4.7 under-scoped §4, and the requirement outranks it.

**Attempt 2 — FAIL** (2026-10-05)
- **Implementer:** `akili-implementer` (sonnet), effort high. It received the attempt-1 report verbatim.
- **Changes:**
  - TRD §4 now lists the 9 real `/api/v1/admin/actors*` routes.
  - L56, L67, L71, L87 and L94 corrected.
  - §5 rewritten as an exceljs `.xlsx` base64 import with accurate allocation timing.
  - Negations deleted, so the recorded grep is literally 0.
  - ADR-NNN consequences extended.
  - PRD AC-5 changed to `.xlsx`.
  - The Implementer found but did not fix PRD L29 (Staff "import field-collected CSVs", while the route is Admin-only).
- **Evidence re-run (Leader, inline):** the recorded grep is empty (exit 1).
- **Reviewer:** `akili-reviewer` (opus), round 2.
  - All attempt-1 FAILs are resolved, and every new TRD route and sentence holds against the code. ADR-NNN appears 4 times, consistently.
  - **FAIL (KZ-004):** PRD L51 ("CSV bulk import service") and US-6 ("bulk-import a CSV … seed and **update**") are now false. They contradict AC-5 and TRD §5 "never CSV". US-6's "update" also echoes the removed upsert.
- **Adjudication of PRD L29:**
  - The word "CSVs" is this spec's surface: fix it.
  - "Staff can import / add / edit" is **pre-existing RBAC drift**, since every `/admin/actors*` route is Admin-only. Recorded for archive as a role-model item that needs a product decision; not fixed here.
- **Advisory:**
  - TRD L184 and L216, "each row's Trader ID allocated in its own transaction", reads as one transaction per row. It is one range per chunk.
  - §12.3 "per-row isolation" should read "per-row validation, per-chunk commit isolation".
- **runtime events:** none.
- Attempt 3 is this task's 3rd review round. It is logged and continues under the standing authorization.

**Attempt 3 — PASS** (2026-10-05)
- **Implementer:** `akili-implementer` (sonnet), effort high. It received the attempt-2 report verbatim.
- **PRD changes:**
  - L29: "CSVs" → "workbooks". The role claim is untouched.
  - L51: "`.xlsx` workbook bulk import (create-only)".
  - US-6: "an `.xlsx` workbook … seed and extend".
- **TRD changes (advisory):**
  - L184 and L216: one `ActorSequence` range per chunk.
  - §12.3: per-row validation and per-chunk commit isolation.
- **PRD sweep:** 11 hits, 3 updated, 8 unrelated. The recorded grep returned 0.
- **Evidence re-run (Leader, inline):** the grep was empty (exit 1). Any "CSV" mentions that remain in the PRD near "import" are only the legacy source files and a dated historical note.
- **Reviewer:** `akili-reviewer` (opus), round 3, the mandatory baseline review. **PASS.**
  - The range and isolation wording holds against `commitChunk` and `allocateTraderIds`.
  - No regression.
  - The KZ-004 sweep is clean.
- **Advisory:**
  - The PRD L29 Staff-import role drift must reach the archive ledger (below).
  - "Allocation keeps colliding" would be more exact as "Trader IDs keep colliding".
  - **ADR-NNN** appears in 4 places (TRD §3, the ADR index, QA-9 and the L71 row). Allocate the number at apply time on `main` after the unmerged-branch check, then sweep all four.
- **Scoped deviation (recorded):** `backend/CLAUDE.md` / `backend/AGENTS.md` were not edited. They are version-agnostic and agree; reviewer-accepted.
- **runtime events:** none.
- **Requirements covered:** FR-6, both bullets and the "no stale instruction survives" scenario.
- **Final status:** **PASS**. 3 attempts, 3 review verdicts.

## 3. Summary — all 8 tasks complete (2026-10-05)

| Task | Commit | Attempts | Review verdicts |
|---|---|---|---|
| T-1 intake contract | `81762fa` | 2 | 2 |
| T-2 generated Trader ID | `b55f95b` | 3 | 4 |
| T-3 duplicate gate on create | `2e730f2` | 2 | 3 |
| T-4 template v4 + import validation | `d238645` | 2 | 3 |
| T-5 import duplicates | `05d468f`, plus the reopen `b6e8853` | 3 | 4 |
| T-6 admin form | `e5b9cd9` | 3 | 3 |
| T-7 import page | `7fc6d31` | 2 | 2 |
| T-8 baseline docs | this commit | 3 | 3 |

**Budget, final:**
- About **8,916 LOC** changed in backend and frontend (`git diff --stat 1bf27d0 -- backend frontend`: +8,060 / −856), plus the PRD and TRD edits.
- **24 review verdicts**, within the re-baselined ~9,500 LOC / ~26.

**Declared gaps and accepted limits** (design §9):
- Real-MySQL concurrency is not covered by tests. Leader probes are recorded instead: 25/25 distinct IDs, and the collision shape.
- The concurrent-create check-then-create race.
- More than 50 strong candidates cannot be confirmed.
- The uncompressed import preview can exceed 6 MB; gzip covers it for browsers.
- Legacy actors with no contact fields re-import as weak duplicates (D-3). *This is design DD-5 item 2, not §9; corrected 2026-10-05.*

**Open items for archive** (none blocks merge):
1. **ADR-NNN** number allocation (4 citations).
2. **PRD L29 RBAC drift:** Staff is credited with importing and editing, but every `/admin/actors*` route is Admin-only. Pre-existing; needs a product decision.
3. **UX copy follow-ups:** the import "To create" chip versus the button count; "No rows are eligible … upload again" when rows could be ticked; the acknowledgement dialog firing for unticked held `GRANTED` rows.
4. **Untested branches:** an unconfirmed held `GRANTED` row in commit mode; the over-cap checkbox falsifier; falsifier 5's commit form.
5. **House-wide:** the 375 px dialog gutter; `DialogFooter` losing focus while loading; `useDialogFocusTrap` not restoring focus on close.
6. **Process:** the T-2 3rd-round escalation was missed, and four of the FAIL sources were Leader-authored (the T-1 closure gap, the T-2 design edit, the T-5 brief omission, the T-8 design under-scope). This is Kaizen input.

## 4. Validation remediation (2026-10-05)

- **Trigger:** `validation-report.md` found 4 FAIL and 21 WARN.
- **Product-owner decision: option 1, fix everything.**
- **RBAC ruling (product owner):** correct the PRD and TRD so that only **Admin** creates, edits and imports actors. The code already enforces this: every `/admin/actors*` route is `@Roles('Admin')`. This is a documentation correction, not a code change.
- **Split into two independent work units.** The file sets are disjoint and the docs unit runs no build, so they run in parallel:
  - **R-1 (code + tests):** F-4, W-3, W-4, W-1, W-8, and the "Weak Match" fixture rename.
  - **R-2 (docs):** F-1, F-2, F-3, the RBAC correction (PRD :29, US-4, TRD :241, and any other Staff-write claim), plus C-4, C-6, C-7, C-8, C-9, C-11, C-12, W-facts-1, and the C-14 statuses.
- Each unit goes through Implementer, then the Leader's re-run, then a Reviewer.

**R-1 (code + tests) — PASS** (2026-10-05)
- **Implementer:** `akili-implementer` (sonnet).
- **Changes:**
  - F-4: the import create-count line is now a polite live region, with a test.
  - W-3: `missingIdentityFields` makes `PATCH` with `traderName`, `traderType` or `region` set to `null` a 400. Three e2e tests.
  - W-4: a spec for an unconfirmed held `GRANTED` row in commit mode.
  - W-1: an edit-mode form test.
  - W-8: `aria-live` and focus tests for both dialogs.
  - The `'Weak Match'` fixture renamed.
- **Implementer verification:** all falsifiers red, then restored.
- **Evidence re-run (Leader, inline):** **VERIFIED**. Backend 86 / 1416, frontend 120 / 1842; builds, tsc and lint clean.
- **Reviewer:** **PASS**.
- **Advisory:**
  - The set-equality spec could spread `IDENTITY_REQUIRED_FIELDS`.
  - The live region re-reads its whole sentence.
  - Two long comments.
  - Whitespace-only identity values pass on create and edit alike. This is consistent.

**R-2 (docs) — FAIL** (2026-10-05)
- **What was right:** all 13 edited sentences hold against the code, and F-1, F-2 and F-3 are closed.
- **Issues:**
  1. PRD US-5 ("authorized staff … view full actor profiles including PII") contradicts the new PRD :29 and TRD §8 wording. Viewing falls outside the ruling, so it **goes to the product owner** rather than being rewritten silently.
  2. The TRD C4 L1 box "Staff / Admin … manages actors, imports, exports" still credits Staff.
  3. C-9 and C-12 were half closed in `execution.md`. **Fixed inline by the Leader** in `execution.md`, the Leader's own ledger.
- **Advisory:**
  - TRD QA-3 has stale paths.
  - PRD US-7 still credits Staff with export.
  - The TRD :170 wording "same as" should be "while".
  - Add a §4.3 pointer to the DD-3 amendment.
- **Next:** R-2 attempt 2 covers issue 2 and the advisories, plus US-5 as the product owner decides.
- **Product-owner ruling (2026-10-05), US-5: "Corregir a solo Admin".** Only Admin views full actor profiles with PII, which matches the code. Staff has no special actor permissions.

**R-2 attempt 2 — FAIL** (2026-10-05)
- **Resolved:** US-5 now reads Admin; the C4 box now reads Admin, without export; C-9 and C-12 closed. The out-of-list fixes at PRD :39 and :81 and TRD :203 were judged in scope (same defect class).
- **FAIL:** the TRD §8 Staff definition (:241) says Staff passes "only" `@Roles('Staff')` routes. `GET /api/v1/auth/me` is guarded by `JwtAuthGuard` only, so any authenticated Staff caller passes it (`roles.guard.ts`: no `@Roles` means any authenticated caller passes).
- **Advisory:** the TRD `ExportModule` row and the §5 "CSV export" bullet still describe the cancelled export as live.
- **Next:** attempt 3, the last allowed attempt.

## HALT: R-2 (validation remediation, docs) — 3 attempts used (2026-10-05)

- **Attempt 3** fixed the attempt-2 FAIL: the TRD §8 Staff definition now covers the `JwtAuthGuard`-only `GET /auth/me`, and every other controller was checked. It also correctly marked `ExportModule` and the §5 export bullet as not live.
- **The Reviewer still found FAIL:** both new sentences cite "**§203**", which is not a TRD section. It is a working-file line number of the §4 "removed rows" note. **Remediation:** change "§203" to "§4" in 2 places.
- **Tree state:** clean apart from this remediation's own approved and in-review edits (R-1 PASS, R-2 attempts 1–3). The Leader does **not** restore anything: the edits are correct apart from this 2-token citation.
- **Leader's root-cause hypothesis:** each attempt's own advisory additions introduced the next defect: the "same as" wording, the export rows, the line-number citation. The remediation loop kept widening scope through advisories.
- **Escalated to the product owner.**
- **Product-owner decision (2026-10-05): option 1, a Leader-inline fix** (the Implementer ladder's rung-5 fallback, approved explicitly). The Leader changed "§203" to "§4 removed-rows note" in TRD :57 and :217. `grep -n "§20[0-9]" docs/trd/trd.md` now returns 0. A Reviewer confirmation follows.
- **Leader-inline fix confirmed:** Reviewer **PASS**. The Leader's byte diff against the attempt-3 diff shows only the two citation lines differing.
- **Final gates** (Leader, quiet tree): backend 1416 / exit 0, build and eslint clean; frontend 1842 / exit 0, tsc, lint and build clean; FR-6 grep 0.
- **validation-report.md §13:** ARCHIVE-READY.
