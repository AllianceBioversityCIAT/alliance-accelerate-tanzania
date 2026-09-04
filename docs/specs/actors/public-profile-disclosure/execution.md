# Execution Log — Public Profile Disclosure

## Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/actors/public-profile-disclosure/` |
| Branch | `public-profile` |
| Execution started | 2026-09-04 |
| Approval Mode | **gated** (inherited) → **pre-approved** from T-2 onward, granted by Daniela Gómez 2026-09-04 after T-1/T-5 closed. Routine PASS gates auto-pass and are logged `auto-approved (pre-approved mode)`. **Exceptions always stop**: HALT, FATAL_FAIL, Pivot, budget tripwire, and T-19's human visual check. |
| Budget (design §16) | 19 tasks · ~2,000 net LOC (band 1,700–2,400) · ~28 review rounds |
| Triad | Leader (this session) → `akili-implementer` → `akili-reviewer` (wrapper-bound models; author ≠ auditor enforced by configuration) |

### Environment pre-check (2026-09-04, before T-1)

Run per `/akili-execute` Step 2.1 and the `## Local Environment` contract in `docs/infrastructure.md` §6.

| Check | Result |
|---|---|
| `node -v` | v26.8.1 ✅ |
| Prisma client generated | ✅ — backend suites run without a database |
| `DATABASE_URL` target | `localhost:3306`, db `accelerate` |
| MySQL reachable on 3306 | ❌ connection refused |
| Docker daemon | ❌ not running |
| Native MySQL on PATH | ❌ not installed |

**Consequence: T-1 (the Prisma migration) is environment-blocked**, and with it T-2, T-3, T-4, T-7, T-8 and every task downstream of the projection split. Surfaced to the user rather than blocked silently, as §6's pre-check row requires. User chose to start MySQL in Docker (`docker run … mysql:8`, per §6's documented invocation) — pending the Docker daemon being started by the user.

**Tasks reachable without a database: T-5, T-6, T-9, T-10.** Execution proceeds with those.

### Leader concurrency decision

Backend tasks run **sequentially, never in parallel**, even where `tasks.md` marks them independent. T-1, T-5 and T-6 are independent roots by file, but all three invoke `npm test` in the same package and would compete for `node_modules`, `.prisma`, and lockfiles. Per `CLAUDE.md` § Concurrency protocol, a measurement taken beside another worker is not slow, it is **wrong**. Parallelism here would buy minutes and cost trust in every green.

---

## Task Execution History

### T-5 — Give the non-granted gate fixtures distinct PII values

| Field | Value |
|---|---|
| Status | **PASS** |
| Date | 2026-09-04 |
| Implementer attempts | 1 |
| Requirements covered | FR-2 (both scenarios) · design.md §12 DD-10 · defect class D-2 · `judgment.md` J-7 |
| Files changed | `backend/src/test/pii-boundary.spec.ts` (+22 lines, 0 deletions) |

#### Attempt 1

**Implementer.** Added six field overrides to each of the two non-granted fixtures, inside the existing `fixtureActor({…})` literals, each with a comment citing DD-10:

| Field | GRANTED (all three) | `actor-unknown-1` | `actor-denied-1` |
|---|---|---|---|
| `sex` | `M` | `F` | `Other` |
| `position` | `Director` | `Iringa Offtake Coordinator` | `Tanga Market Trader` |
| `marketLocation` | `Arusha Central Market` | `Iringa Municipal Market` | `Tanga Central Market` |
| `technicalSupport` | `Needs cold storage` | `Needs solar dryer` | `Needs weighing scale` |
| `phone` | `+255700000000` | `+255711111111` | `+255722222222` |
| `email` | `director@example.com` | `iringa.offtaker@example.com` | `tanga.trader@example.com` |

**Verification (Implementer-run):**

```
cd backend && npm test -- --silent pii-boundary
PASS src/test/pii-boundary.spec.ts
Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
```

`npx eslint "src/test/pii-boundary.spec.ts" --quiet` — clean, no output.

**`Not Done / Assumptions`:** none reported.

**Reviewer verdict: `STATUS: PASS`.**

> The diff gives `actor-unknown-1` and `actor-denied-1` their own values for all six fields DD-10 names, verified pairwise-distinct against every GRANTED fixture by reading the fixture source rather than the Implementer's table; `'F'`/`'Other'` are canonical `normalizeSex` outputs, no value collides with `LEAKABLE_PII_VALUES`, both new comments are true of the file as it stands, no existing comment was overwritten, and the diff contains zero assertion changes as T-5 requires. Green is correctly recorded as a prerequisite, not as evidence of consent enforcement (KZ-002).

The Reviewer independently confirmed the Implementer's KZ-002 self-assessment by reading: across the assertion region, the only non-granted checks are ID-based or status-only 404s, and every value sweep runs against a response the consent `WHERE` has already emptied of non-granted rows. **No current assertion reads a non-granted actor's PII value**, so this change is inert today by design — which is precisely why T-5 precedes T-11 rather than following it.

**Reviewer limit stated (KZ-012):** the suite and linter were not executed by the Reviewer; the 25-passing and clean-eslint figures are the Implementer's account, corroborated by reading that nothing in the suite *could* depend on the changed values.

#### ADVISORY (does not gate — **carried forward to T-11**)

> **`sex: 'F'` cannot be asserted with the file's substring-sweep idiom.** The established pattern is `expect(JSON.stringify(wire)).not.toContain(v)`. A one-character `'F'` is already a substring of the *public* list body — `actor-granted-2`'s `traderName` is `'Dodoma Farmers Cooperative'` — so `not.toContain('F')` would fail on `GET /api/v1/actors` for a reason unrelated to consent. The natural "fix" for that false positive is to drop `sex` from the sweep, **silently losing coverage of a field DD-10 explicitly names**. (`'F'` is likewise a substring of `SELF_REGISTERED`, `SIGNED_FORM`, and `CONSENT-REF-SIGNED-9931`.)
>
> This is not an Implementer defect: `normalizeSex`'s space is closed at three values, `'M'` is taken by the granted fixtures, and DD-10 requires the two non-granted rows to differ — so `{F, Other}` is the only legal assignment up to a swap.
>
> **T-11 must assert `sex` absence by key on the non-granted row, or by exact value equality — never by substring — and must say so in the assertion's comment.** `'Other'` is safe against today's bodies but brittle for the same reason.

**Minor advisory:** `+255711111111` and `+255722222222` already appear as fixture phones in `actor-audit.service.spec.ts`, `duplicate-detection.service.spec.ts`, and `admin-actors-crud.e2e.spec.ts`. No functional interference (separate module scopes), but a grep on either value lands in four files, mildly weakening the "unmistakably this row" property the new comment invokes.

#### Leader notes

**Skill assignment deviation — `tdd` did not earn its cost here.** I assigned `tdd` to T-5 per the spec's skill map. The Implementer loaded it and then reported honestly that there was no red→green cycle to run: T-5 is fixture data with an explicit "no assertion changes" constraint, so there is nothing to make fail first, and the task's own falsifiability check is *"if anything turns red, stop"* rather than *"write a failing test"*. It declined to fabricate a red step. **That judgment was correct and the misassignment was mine** — recorded as a Kaizen signal: `tdd` belongs on the tasks that write assertions (T-11, T-12), not on the one that prepares their inputs.

---

### T-1 — Add `contactPerson` and `otherCrops` columns to `Actor`

| Field | Value |
|---|---|
| Status | **PASS** (attempt 2 of 3) |
| Implementer attempts | 2 — attempt 1 FAIL (column width), attempt 2 PASS |
| Files changed | `backend/prisma/schema.prisma` (+2 lines) · new migration `20260904142128_add_contact_person_other_crops/` |
| Date | 2026-09-04 |
| Requirements covered | FR-4, NFR-5 · design.md §5 |

#### Environment note

T-1 was environment-blocked at the start of the run (no reachable MySQL). Resolved during execution: the user started Docker Desktop; the Leader started the **pre-existing** `accelerate-mysql` container rather than recreating it (local is disposable by contract, but existing data is not destroyed without asking). Database `accelerate` present, reachable from the host on 3306. **Target is the local disposable container, not the shared dev RDS** — a divergence from `tasks.md`'s parenthetical, and compliant with `backend/CLAUDE.md`, which calls local docker MySQL the safer and preferred rehearsal target.

#### Attempt 1 — Reviewer `STATUS: FAIL`

**Implementer:** added both columns as bare `String?`; Prisma emitted:

```sql
ALTER TABLE `Actor` ADD COLUMN `contactPerson` VARCHAR(191) NULL,
    ADD COLUMN `otherCrops` VARCHAR(191) NULL;
```

Verification reported: `migrate dev` applied with no drift/reset/shadow prompt; `npm run build` clean; `npm test -- --silent` → **75 suites / 1007 tests passed**. Scope clean (`git status` showed only `schema.prisma` + the new migration dir). No `Not Done`.

**Reviewer FAIL — issue 1: `otherCrops` is `VARCHAR(191)` but its only writer accepts 300 characters.**

`RegistrationPayloadDto.otherCrops` carries `@MaxLength(300)`. Such a value passes validation and is persisted at full length into `Registration.payload` (a Prisma `Json` column with no 191 limit), so **rows that exist today can already hold 300 characters**. FR-4 then requires approval to write it into `Actor.otherCrops`, which cannot hold it.

The repository has already hit, fixed, and documented this exact bug class — 20 lines below the defective field, `submitterEmail` carries `@MaxLength(191)` precisely because a well-formed 200-character address "would pass `@IsEmail()`, reach `submitRegistration`'s insert, and MySQL would raise error 1406 (data too long) — a `500`", with a standing regression test. The width-matching convention holds across the schema:

| Field | Column | DTO bound |
|---|---|---|
| `technicalSupport` | `@db.Text` | `@MaxLength(2000)` |
| `consentReference` | `@db.VarChar(255)` | `@MaxLength(255)` |
| `submitterEmail` | `VARCHAR(191)` | `@MaxLength(191)` |
| **`otherCrops`** | **`VARCHAR(191)`** | **`@MaxLength(300)`** ← breaks it |

Outcome depends on `sql_mode`: strict → error 1406 → `500` on approve; non-strict → **silent truncation**, violating FR-4 with no error anywhere. The second is worse because it is invisible.

**Why it gated at T-1 and could not be deferred:** the width is decided here and nowhere else. Widening later needs `MODIFY COLUMN`, which T-1's own Disqualifier and `backend/CLAUDE.md` §Data & migrations forbid. The additive window closes when this migration is accepted.

**KZ-002 in the sharpest form yet seen in this spec:** no test in the repository drives a >191-character `otherCrops` through any write path, so **nothing in the 1007-test green run would have changed colour if this shipped**. The green suite was not evidence against the finding.

**Verified clean by the Reviewer in the same pass:** additive-only SQL (judged from the artefact, not the exit code); nullability and Prisma types conform to design §5; reversibility (NFR-5) satisfied — two nullable columns, no default/index/constraint/backfill; scope untouched; migration naming and timestamp ordering conform; nothing owed to the TRD by T-1 (that is T-17's).

#### ADVISORY (non-gating, carried forward)

- **To NFR-5 / spec close:** the dev-RDS apply is still outstanding — T-1 applied only to the local container. Do not discharge that obligation until `otherCrops` is widened.
- **To T-6:** the new columns sit interleaved among `sex`, `position`, `marketLocation` in `schema.prisma`. Declaration order has no semantic force, but **T-6 must not read that adjacency as membership** — `contactPerson` belongs in `CONTACT_BLOCK_FIELDS`; `otherCrops` and `sex` do not. This is the same UI-adjacency inference `design.md` §8 explicitly warns against (N-1/R2-5).
- **To T-4:** the Excel import becomes a second writer of `otherCrops`; its parser bound must be ≤ the column width chosen here.

#### Attempt 2 — Reviewer `STATUS: PASS`

Remediation briefed verbatim from the attempt-1 FAIL. `otherCrops` → `String? @db.VarChar(300)`; `contactPerson` deliberately **left** at `VARCHAR(191)` (bound `@MaxLength(120)`, 71 characters of headroom — widening it too would have been unrequested scope).

The applied attempt-1 migration was undone **surgically** rather than with `prisma migrate reset`, so other local data survived:

| Step | Action | Result |
|---|---|---|
| 2a | Prove the target | `DATABASE_URL` → `localhost:3306/accelerate`. **Confirmed local before touching anything**; an RDS host would have been an immediate stop |
| 2b | Undo attempt 1 | `DROP COLUMN` on both new columns + delete the `_prisma_migrations` row; removal confirmed |
| 2c | Remove the artefact | deleted `20260904141516_add_contact_person_other_crops/` |
| 2d | Prove no drift | `npx prisma migrate status` → `Database schema is up to date!` |
| 2e | Regenerate | `migrate dev` applied cleanly, **no reset/drift prompt** |

**Regenerated `migration.sql` (verbatim):**

```sql
-- AlterTable
ALTER TABLE `Actor` ADD COLUMN `contactPerson` VARCHAR(191) NULL,
    ADD COLUMN `otherCrops` VARCHAR(300) NULL;
```

**Verification:** `npm run build` clean · `npm test -- --silent` → **75 suites / 1007 tests passed**.

**Reviewer verdict:**

> The attempt-1 finding is closed exactly as required — `otherCrops` is `VARCHAR(300)` matching its `@MaxLength(300)`, `contactPerson` is untouched at `VARCHAR(191)` against a 120-character bound, and the migration was regenerated rather than amended, leaving one additive `ADD COLUMN` statement and a single migration directory. No fix-caused regression: the native-type annotation changes no generated type, matches the neighbouring `consentReference` declaration style, and scope is confined to `schema.prisma` plus the new migration.

The Reviewer re-derived the 300 bound itself rather than trusting the prior report, and closed a subtlety the first pass did not raise: `class-validator`'s `MaxLength` counts **UTF-16 code units** while MySQL `VARCHAR(n)` under `utf8mb4` counts **characters**, so a DTO-passing string can never exceed 300 stored characters. The boundary is exact in the safe direction — no astral-plane hole.

**KZ-002 — could any test have caught the width defect?** The Reviewer answered this explicitly and the answer is **no**: there is no `new PrismaClient(` anywhere under `backend/src`, so every suite including the e2e files runs against the in-memory Prisma mock. **No test executes SQL against MySQL, so error 1406 is unreachable in the harness**, and no test parses `schema.prisma` or any `migration.sql`. The 1007 green tests were evidence that nothing else broke — never evidence the width was right. That fact existed only in the SQL artefact, and only reading it surfaced it.

The nearest guard is `registration-create.dto.spec.ts`, which pins `{ field: 'otherCrops', maxLength: 300 }` by value — so raising the **DTO** bound past 300 reddens a test. But it pins the DTO, not the column, and **nothing ties the two together**.

**Reviewer limit (KZ-012):** steps 2a–2e, the build, and the 1007-test run rest on the Implementer's account — unverifiable read-only. Everything else was established from the artefacts.

#### ADVISORY (non-gating — **carried forward to T-2 and T-4**)

> **The additive window closes at T-1, and the two future writers of these columns currently have no bound at all.** No writer exceeds 300 today, so nothing FAILs — but the convention T-2 and T-4 will copy by local analogy is *"unbounded"*.
>
> **T-2 (admin path).** `ActorCreateDto` bounds only two of its free-text strings — `technicalSupport` (`@MaxLength(2000)`, backed by `@db.Text`) and `consentReference` (`@MaxLength(255)`, backed by `@db.VarChar(255)`). `district`, `position`, `marketLocation` and `phone` carry **no `@MaxLength`** against `VARCHAR(191)` columns — a **pre-existing error-1406 exposure**, out of scope here, but it means an Implementer adding `otherCrops` by analogy will add it unbounded and reopen the attempt-1 defect at 300. `ActorForm.tsx` has zero `maxLength` attributes, so there is no client backstop either. **T-2 must add `@MaxLength(300)` to `otherCrops` and `@MaxLength(191)` or tighter to `contactPerson`.**
>
> **T-4 (import path).** `actor-import.service.ts` already bounds `consentReference` at 255 to match its column — the precedent exists. The Implementer carried forward "`otherCrops` ≤300", but **the `contactPerson` ≤191 half is carried forward nowhere** and must be added to the T-4 brief.
>
> **Already consistent, worth preserving:** `RegistrationForm.tsx`'s `MAX_LENGTHS` sets `contactPerson: 120` / `otherCrops: 300`, matching the server DTO exactly. The public registration path is coherent end to end.

#### Leader notes

**The pre-existing unbounded-`@MaxLength` exposure on `ActorCreateDto` is NOT this spec's to fix.** Four fields (`district`, `position`, `marketLocation`, `phone`) can already overflow their `VARCHAR(191)` columns through the admin path. That is a real defect, found while reviewing this task, and it is **out of scope** — no requirement backs it, no budget line covers it, and `/akili-execute`'s *Advisory Never Becomes A Task* rule forbids minting work from an advisory. Recorded here so it is not lost; it earns a proposal of its own or nothing.

---

### T-2 — Surface both columns to the Admin projection and form

| Field | Value |
|---|---|
| Status | **PASS** (attempt 1) · auto-approved (pre-approved mode) |
| Date | 2026-09-04 |
| Implementer attempts | 1 |
| Requirements covered | FR-4 · design.md §7.3, §4 |
| Files changed | 14 (5 declared + 1 justified production deviation + 8 type ripples) · +303 lines |

#### Process incident — Leader misread a pause as a stall

The Implementer emitted a task-notification mid-run saying only *"Waiting on the backend test run."* The Leader read that as a stall, inspected the tree, **ran the verification itself** on a quiet tree, and briefed the Reviewer that the code was *unattested by its author*. The agent then resumed and delivered a full report. The Leader issued a mid-review correction to the Reviewer.

**Cost: none to the verdict.** The Reviewer stated it had already re-derived every credited claim from source and that nothing in its verdict rested on the Implementer's account — the report served as corroboration *of the author*, not of the code. **Kaizen signal:** a notification firing on a pause is indistinguishable from one firing on an abandonment; the Leader should inspect before characterising, which it did, but should not have narrated the conclusion before the agent's lifecycle was settled.

#### What landed

| Field | Bound | Where |
|---|---|---|
| `contactPerson` | `@MaxLength(120)` | `ActorCreateDto` — matches `RegistrationPayloadDto`; column is `VARCHAR(191)`, so 71 chars of headroom |
| `otherCrops` | `@MaxLength(300)` | same — matches both the `VARCHAR(300)` column and the public intake DTO |

The four pre-existing unbounded fields (`district`, `position`, `marketLocation`, `phone`) were **not** touched, per instruction.

**Verification (Leader-run, quiet tree):** backend `admin-actor` 4 suites / 128 tests · backend full 75 suites / **1018** tests (was 1007 → 11 added) · `npx eslint "{src,test}/**/*.ts" --quiet` exit 0 · frontend `ActorForm|actors-admin` 103 tests · frontend full 109 suites / **1632** tests. Implementer additionally ran `npx tsc --noEmit` clean in both packages.

#### Reviewer verdict: `STATUS: PASS`

> The two mandatory bounds landed and provably reach the update path; the four forbidden fields were not touched; the Disqualifier and the Falsifying input are each discharged by standing, discriminating tests; and the two undeclared production lines are necessary rather than creep.

**The update path was verified by reading, not assumed.** `AdminActorCreateDto extends ActorCreateDto` (plain `extends`, decorators inherited) and `AdminActorUpdateDto extends PartialType(AdminActorCreateDto)`, which copies validation metadata. Two independent corroborations: a pre-existing test proves `PartialType` carries decorators through this exact class chain, and the new inherited-`@MaxLength` test is **discriminating** — if `PartialType` dropped it, a 121-character string would validate clean and redden the test.

**Disqualifier discharged with nine populated round-trips**, counted by the Reviewer and reconciling exactly with 1007 → 1018. The two e2e round-trips are load-bearing and discriminating: the mock's `create` stores `{...args.data}` verbatim, so deleting `'contactPerson'` from `SCALAR_FIELDS` makes the GET body `null` and reddens the test. Only one of eleven is a `null`-only test, and it is supplementary.

#### Leader-required record — §4 closed-set amendment (Reviewer advisory 2)

`design.md` §4 declares its file list a **closed set**: *"if the implementation needs a file that is absent, that is a budget-tripwire event (§16), not a silent addition."* §4 lists `actors-admin.service.spec.ts` but **not** `actors-admin.service.ts`.

**Amendment recorded here, as §4 requires.** `backend/src/actors/actors-admin.service.ts` joins the closed set. The addition was **necessary, not creep**, verified by the Reviewer against source rather than accepted from the report: `SCALAR_FIELDS` is consumed only by `buildScalarData()`, which supplies the `data` argument to both `tx.actor.create` and `tx.actor.update`. Omit the two entries and the DTO validates the fields while the write silently drops them — *literally T-2's named Falsifying input*. Budget consequence: **+2 LOC, none material.**

#### KZ-002 — what 1018 green tests establish, and what they cannot

They **do** establish that `class-validator` rejects 121/301 and accepts 120/300, that both fields traverse DTO → `SCALAR_FIELDS` → Prisma `data` → stored row → `toAdminActor` → HTTP body on create *and* update, and that the 400 envelope names the right field.

They **cannot** establish anything about the database. There is still no `new PrismaClient(` under `backend/src`; the e2e harness overrides `PrismaService` with an in-memory object that stores whatever it is handed. **No test in this repository has ever written a 300-character `otherCrops` to MySQL.** Error 1406 remains unreachable in the harness. That the bounds fit their columns rests *only* on reading `schema.prisma`. **Had the T-1 migration never been applied, all 1018 tests would still be green.**

#### Positive finding worth preserving

Widening the `Actor` entity did **not** leak either column to the `Public` role. `toPublic` builds by explicit literal pick, so the new columns are absent from every public path **by construction** — the exact property DD-9 states and T-7's Falsifying input is designed to preserve. The design's central safety property held under its first real test.

#### ADVISORY (non-gating)

1. **`AUDITABLE_FIELDS` gap — routed as a proposal, NOT a task.** `actor-audit.service.ts`'s `AUDITABLE_FIELDS` was not extended, so neither field appears in any `ActorAuditLog` record. The Reviewer sharpened the consequence well beyond "invisible in `/history`": `logUpdate` returns `null` on an empty diff, so **an admin edit whose only change is `contactPerson` writes no audit row whatsoever** — a published natural person's name can be changed or erased with zero trace. `logDelete`/`logBulkDelete` snapshots lose it too. No new PII surface is created (the audit JSON is admin-only and already carries `phone`/`email`), so PII-adjacency is not an argument against closing it. **Out of scope: no FR/NFR here mentions audit, `actor-audit.service.ts` is absent from §4, and auditability belongs to `admin/actor-crud-audit`.** Ripples to T-3 and T-4, which will write these columns into an envelope that omits them.
2. **`renderTextarea`'s new `maxLength` parameter has zero callers.** `otherCrops` uses `renderInput`; the only `renderTextarea` call site (`technicalSupport`) passes nothing — and that is the one textarea with a real server bound. Untested dead capability. **Recorded, not actioned** — widening a task to absorb an advisory is forbidden.
3. **KZ-008 soft spots.** (a) `"Published once consent is GRANTED (FR-4)"` describes the spec's end state; as of this diff nothing publishes either field — publication arrives at T-7/T-11. Traceable rather than false, but future-tense would be honest. (b) `ActorForm.test.tsx`'s block header claims every test sets a non-empty value; its fourth test deliberately sets none.
4. **No rendered capture exists for the admin form change.** `frontend/CLAUDE.md` asks for 375/768/1440 captures on flow/positioning/spacing changes; this adds a third item to a two-column Contact grid (unbalanced final row) and a new half-width input under the Crops checkboxes. **Recorded as an unverified gap — T-19 is NOT widened to absorb it**, per the Advisory-Never-Becomes-A-Task rule. T-19's scope remains the public profile.

#### Carried forward to T-11 / T-12 — environmental, and it matters

Jest's **default parallel workers produce spurious timeouts in this sandbox**: the Implementer saw 12 failures in `admin-actors.e2e.spec.ts`, a file this task never touched, with the "worker failed to exit gracefully" warning; the same file alone (28/28) and the full pattern under `--runInBand` (128/128) were green. The Reviewer confirmed this is falsifiable rather than merely plausible — the diff adds no testing module, no app bootstrap, no timer, no socket, so **no resource in it could leak**. It is three Nest apps contending.

**T-11 and T-12 MUST run under `--runInBand`.** A spurious red in the task that demonstrates the gate can fail would be the worst possible false negative in this spec.

---
