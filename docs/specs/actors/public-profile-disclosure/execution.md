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

### Scope amendment — T-20 added (2026-09-04)

**Approved by Daniela Gómez** after the T-3 Reviewer performed a KZ-004 forward sweep and found the superseded claim alive at **six sites, not the two that had been flagged**:

| # | Site | Severity |
|---|---|---|
| 1 | `admin-registration.serializer.ts` — two field JSDocs **plus the module JSDoc** (unflagged) | low |
| 2 | `frontend/lib/api/registrations-admin.ts` — three references | low |
| 3 | `RegistrationDetailPanel.tsx` — a **rendered badge**: "Review context — will not be published" | medium |
| 4 | `RegistrationDetailPanel.test.tsx` — **four green assertions pinning that badge** | medium |
| 5 | `RegistrationForm.tsx` — **applicant-facing helper text**: "Review context — not published to the public directory" | **high** |

**Site 5 is why this became a task rather than a note.** It is not a stale comment: it is a **notice made to a data subject at the moment of collection**, about a field the form marks *required*. The public registration form promises the applicant that their contact person will not appear in the public directory. This spec publishes it.

The Reviewer's reasoning for refusing to let T-3 fix a subset is recorded because it is the general rule, not a one-off: **correcting only the backend half would leave code asserting "published" while an admin screen renders "will not be published" under four green tests — KZ-004's reverse direction, the failure the sweep rule exists to prevent.** Partial correction here is worse than none.

**Budget:** 19 → 20 tasks, ~2,000 → ~2,080 LOC, ~28 → ~29 rounds. Recorded per the tripwire rule rather than absorbed.

**Escalated, NOT solved by T-20 — for NFR-7's owner (programme/legal).** T-20 corrects the text going forward. It does not address **applicants who already registered under the old promise**. Whether their `contactPerson` may be published at all, or whether they must be re-consulted, is a programme decision. This is the **third** member of the NFR-7 conversation, alongside the placeholder consent policy and the `submitterEmail` purpose gap — and it is the most concrete of the three, because unlike those it is a specific sentence shown to specific people about a specific field.

### T-3 — Publish `contactPerson`/`otherCrops` on approval, DD-18 reversal recorded

| Field | Value |
|---|---|
| Status | **PASS** (attempt 2 of 3) · auto-approved (pre-approved mode) |
| Date | 2026-09-04 |
| Implementer attempts | 2 — attempt 1 FAIL (new false claim in the replacement comment), attempt 2 PASS |
| Requirements covered | FR-4 both scenarios · design.md §7.3, DD-5, RV-3 · D-10, D-12 |
| Files changed | `admin-registrations.service.ts`, `…service.spec.ts`, `dto/registration-create.dto.ts`, `test/admin-registrations.e2e.spec.ts` |
| Effort | **xhigh** (Leader deviation from the spec's `medium` — reverses a compile-time security guard), bumped to **max** on rework |

#### What this task actually did

It **removed a compile-time security guard on purpose.** `RegistrationApprovalPayload`'s omission of `contactPerson` made `position: payload.position ?? payload.contactPerson` a compile error. That member now exists, so the type can no longer stop `contactPerson` being read into the wrong slot. Design §11 RV-3 accepts this as **a genuine, weaker substitute — not an equal swap**, and the rewritten JSDoc says so in those terms.

#### The five escaping variants — each verified discriminating BY THE REVIEWER, not by tracing

The Implementer was candid that it validated the tests *"by tracing each mutation's data flow … not by hand-mutating and reverting"* — reasoning, not demonstration. The Reviewer re-derived each independently against the production code and the mock's storage semantics:

| Variant | Verdict |
|---|---|
| `position: payload.position ?? payload.contactPerson` | discriminates, for the claimed reason |
| `traderName: … ?? payload.contactPerson` | discriminates — but the input is **unreachable** (see below) |
| `marketLocation: … ?? payload.contactPerson` | discriminates, for the claimed reason |
| reverse `contactPerson: … ?? payload.position` | discriminates, for the claimed reason |
| unconditional clobber `position: payload.contactPerson` | discriminates, for the claimed reason |

**The green run is load-bearing here, unusually.** Four of the five tests assert `null`/`undefined` on a field the *default* fixture populates. Had the fixture overrides not reached `approve()`, those four would be red today. Green therefore demonstrates the override path is live — the one premise tracing alone could not establish.

On `traderName`: the state asserted (`undefined`) is **unreachable** through any validated payload (`@MinLength(1)`; non-nullable column). The Reviewer's ruling is that this cuts both ways — *no* reachable input could exercise that mutation, so an unreachable fixture is the only possible standing test for it. Low value, not weak coverage. Annotated in the test name on rework so a reader does not mistake `toBeUndefined()` for a supported contract.

#### Attempt 1 — Reviewer `STATUS: FAIL`

**The correction introduced a fresh false claim — KZ-008's third instance in this spec, and the same defect class the task existed to close, recurring inside its own remedy.** The replacement JSDoc asserted in the present tense that the detail endpoint *"discloses"* both fields to `Public`. False at HEAD: `toPublic` returns exactly eight keys (`id, traderName, region, district, traderType, capacityTons, crops, gps`) and names neither field. Publication does not arrive until T-7/T-8.

Two consecutive attempts at this one comment asserted something about `role-aware.serializer.ts` **without opening it**. The rework brief made opening it a precondition.

#### Attempt 2 — Reviewer `STATUS: PASS`

Every claim in the replacement text was verified independently against the file it names: approval writes both fields; the attribution string is the one DD-5 *prescribes* verbatim; the future tense is correct (Leader and Reviewer both re-read `toPublic`); `toPublicDetail` is genuinely T-7's deliverable per `tasks.md`/§7.2; and the `design.md §4.6 step 3` citation resolves — **the Leader's suspicion that it was a decaying anchor was wrong**. It points at the archived `public-self-registration` design, whose §4.6 step 3 reads *"`contactPerson` and `otherCrops` are not carried — and `contactPerson` must not land on `Actor.position`"*, exactly the claim being superseded, and the file already had a uniform convention that bare `design.md` means that document.

**Verification:** `npm test -- --silent admin-registrations --runInBand` → 6 suites / 120 tests · `npx eslint "{src,test}/**/*.ts" --quiet` clean · full suite `--runInBand` → 75 suites / **1023** tests (was 1018 → +5).

#### Scope deviations, both adjudicated and accepted

1. **`backend/src/test/admin-registrations.e2e.spec.ts`** edited though absent from T-3's `Files:` list and from design §4. Justified: its approve happy-path asserted `not.toContain('Grace Mushi')`, which this task's production change makes false, and the file *matches T-3's own verify pattern* — leaving it would have planted a known-red test inside the specified gate. The replacement asserts per-slot by value over a real HTTP response. **§4 closed-set amendment recorded.**
2. **Admin list-endpoint assertions left untouched.** The Implementer claimed `GET /admin/registrations` never returns payload data. The Reviewer **verified** it rather than accepting it: `toAdminRegistrationListRow` is an eight-key literal pick (`id, reference, applicant, traderType, region, submittedAt, status, duplicateCandidateCount`) — no payload field reaches the wire, so those assertions remain true *and* discriminating.

#### ADVISORY (non-gating)

- **A2:** the new gate test's comment claims a cross-wire "would make one of these `.toBe(...)` calls fail" — true for the 18 slots it enumerates, not for `traderId` (covered by the P2002 test) or the five provenance columns (covered by a sibling describe). No coverage hole; a slightly over-broad comment.
- **A3:** the old whole-object `not.toContain('Grace Mushi')` sweep caught a cross-wire into *any* slot, including unnamed ones. That construction is gone — the value is now legitimately present. A strictly stronger replacement exists and was not used (assert the value occurs **exactly once** in the serialized actor). The delivered form does match RV-3's specified remedy. **Recorded, not actioned.**
- **A4:** `AUDITABLE_FIELDS` still omits both fields, so `logRegistrationApprove`'s snapshot now records two fewer columns than `approve()` writes. Before this diff there was nothing to omit; after it, the audit record of a published actor is incomplete. Already routed to a separate proposal.
- **A5 → folded into T-20:** the bare `design.md` citations in this DTO file point at an *archived* document while the same JSDoc names a live spec folder two lines above. Resolves correctly today; qualifying them as `public-self-registration design.md §4.6` during T-20's sweep of this file's neighbours retires the ambiguity at no cost.

---

### T-4 — Import template v3

| Field | Value |
|---|---|
| Status | **PASS** (attempt 1) · auto-approved (pre-approved mode) |
| Date | 2026-09-04 |
| Implementer attempts | 1 |
| Requirements covered | FR-5 both scenarios, all four clauses · design.md §7.4 · D-5, D-13 |
| Files changed | 6 · +269 lines · `TEMPLATE_VERSION` v2 → v3, workbook regenerated (10864 → 10984 bytes) |

#### The bounds — where the T-1 obligation finally landed

`contactPerson` ≤ **120**, `otherCrops` ≤ **300**, both in `validateRow`, both following the `consentReference` ≤255 precedent exactly (field-level `ImportRowError`, scalar left `undefined` so `buildCreateData` drops it rather than truncating). Reviewer cross-checked all four declarations:

| Field | Parser | Column | `ActorCreateDto` |
|---|---|---|---|
| `contactPerson` | 120 | `VARCHAR(191)` | `@MaxLength(120)` |
| `otherCrops` | 300 | `@db.VarChar(300)` | `@MaxLength(300)` |

**T-1's Reviewer recorded that the `contactPerson` half had been "carried forward nowhere". This was its only possible landing site, and it landed.** Had the T-4 brief omitted it, it would have been lost for good — no test could have found it, because error 1406 is unreachable in a harness with no `new PrismaClient(`.

#### Two behaviours worth recording as precedent

**1. A real falsifying-input check, not a traced one.** The Implementer flipped `district`'s `required` flag to `true`, observed the D-13 pin redden, and reverted. **This is the first task in the spec to *demonstrate* rather than *reason about* its gate's discrimination** — the standard KZ-002 actually asks for. The Reviewer independently confirmed the pin would redden (`toEqual` over a 26-entry `{field: boolean}` map is recursive value equality, so a flipped boolean, a removed column, and an unpinned added column all redden), while correctly noting it cannot confirm the flip/revert was performed — that remains the Implementer's account, consistent with the source.

**2. It changed nothing where nothing needed changing, and said why.** FR-5's second scenario requires the stale-template message to *name the action*. The Implementer read it before touching it and found the message already reads *"This template is out of date (found {v}, current is v3). Please re-download the import template from the 'Download template' link on this page and try again."* — added by an earlier spec, pinned by two named tests, referencing a UI element it verified exists. The Reviewer confirmed all three claims and one more the Implementer did not: the version check runs **before** `locateDataSheet`, so a real v2 workbook still gets the specific message rather than a generic header-mismatch 400. **Reporting "no change needed" was the correct outcome**; a cosmetic edit would have been easier and worse.

#### Clause sweep (KZ-013) — all four FR-5 clauses owned

Round-trip through `tx.actor.create.mock.calls[0][0].data` (a genuine parse → validate → scalar → Prisma `data` path, not a header assertion); required-flag pin by value; "no allowed-value list **is** the agreement" proved **by value** in `generate-template.spec.ts` (`Required: No`, `Allowed values: —`, both asserted as strings, so a flipped flag or an added list reddens); field-names-only error path unchanged, still guarded by the pre-existing PII canaries.

**Verification:** `npm run generate:template` → 10984 bytes · `npm test -- --silent "template|import" --runInBand` → 8 suites / 149 tests · `npx eslint … --quiet` clean · full `--runInBand` → 75 suites / **1036** tests (was 1023 → +13).

**Scope:** exactly the declared files. `generate-import-template.ts` appears in T-4's `Files:` list but needed **no** edit — it derives headers, Instructions rows, widths and dropdowns entirely from `TEMPLATE_COLUMNS`. Reviewer verified this is a correct omission, not a miss.

#### ADVISORY (non-gating)

- **A2 — the format hint's bound is not tied to the parser's.** `format: '… (max 120 chars)'` is asserted only by `toBeTruthy()`. Changing the parser bound to 150 would leave the Instructions sheet saying "max 120" with nothing reddening. **Pre-existing pattern** (`consentReference`'s hint has the same shape), so not a regression. Recorded, not actioned.
- **A3 — wording drift for T-19's operator read:** the error quotes the `"Download template"` link; the rendered label is `Download template (.xlsx)`.
- **A1** — the "published once consent is `GRANTED`" comments are future-tense-in-fact; identical to the soft spot already recorded at T-2. No new defect.

#### Flake — second occurrence, and it lands on the file T-11/T-12 depend on

An earlier full-suite run timed out (20s) in `src/test/pii-boundary.spec.ts` — **untouched by this diff** — under sandbox load; isolated re-run passed in 2.8s, full re-run clean. The Implementer reported it rather than only reporting the green.

The Reviewer agreed it is environmental on four corroborants: the file is untouched, the failure was a *timeout* not an assertion, it passed isolated and on re-run, and T-2 already recorded identical parallel-worker contention. **This is the second hit on `pii-boundary.spec.ts` specifically — the exact file T-11 rewrites and T-12 mutates.** The standing `--runInBand` mandate for those tasks is now confirmed as necessary rather than precautionary.

---

## Milestone — PR 1 (data phase) complete

T-1, T-2, T-3, T-4 closed, plus T-5 (sequenced early as T-11's prerequisite). **5 of 20 tasks.**

| Metric | Budgeted | Actual so far |
|---|---|---|
| Review rounds | ~29 total | **7** across 5 tasks (1.4/task) |
| Backend tests | — | 1007 → **1036** (+29) |
| Frontend tests | — | **1632** |

Two FAILs, both on the same defect class — a claim asserted about a file nobody opened. Both caught by review, neither by a suite.

---

### T-6 — Restructure the policy constants and pin every one by value

| Field | Value |
|---|---|
| Status | **PASS** (attempt 3 of 3 — the last before HALT) · auto-approved (pre-approved mode) |
| Date | 2026-09-04 |
| Implementer attempts | **3** — FAIL, FAIL, PASS |
| Requirements covered | FR-1, FR-3, FR-9 · design.md §7.1, DD-1, DD-2 · D-1c |
| Files changed | `pii-consent.policy.ts` (+197/-52), `pii-consent.policy.spec.ts` (+91) |
| Effort | xhigh → max (bumped on each rework) |

#### Final state

| Constant | Members |
|---|---|
| `PII_ALLOWLIST` | `[]` — retained, documented, pinned |
| `PUBLICLY_DISCLOSED_FIELDS` | `phone, email, sex, position, marketLocation, contactPerson, otherCrops` |
| `CONTACT_BLOCK_FIELDS` | `contactPerson, position, phone, email, marketLocation` |
| `NEVER_PUBLIC_FIELDS` | `traderId, gpsAltitude, gpsAccuracy, registrationSource, consentMethod, consentObtainedAt, consentReference, technicalSupport` |

All four pinned by value (`toEqual` against a literal — length- and order-sensitive, so an added, removed **or reordered** member reddens). Falsifying-input check performed for real in attempt 1: deleting `'phone'` reddened two named tests.

**The expected non-result held throughout: zero suites turned red.** That is D-1c manifesting, not correctness. The seven sites now assert nothing, silently, and remain untouched — verified by `git diff --stat` returning empty for all seven. **That list is T-9's work order.**

#### Three attempts, one defect, two signs

| Attempt | The membership rule was stated… | Failure |
|---|---|---|
| 1 | **by history** — *"the old allowlist, minus `technicalSupport`, plus `contactPerson`"* | **Under**-inclusive. A rule phrased as an edit to a retired constant has no slot for a column created by T-1 → `otherCrops` belonged to **no constant at all**, inside the very task written to guarantee nothing is asserted by an empty iteration. |
| 2 | correctly by policy, **and then again** by FR-1 intersection | **Over**-inclusive. *"FR-1's set intersected with literal Actor scalar field names"* admits `traderName`, `traderType`, `region`, `district`, `capacityTons` — twelve members, not seven — and revived the reading design §7.1 had just rejected. |
| 3 | **once**, by policy; every restatement deleted | PASS. |

**The defect was never the wording. It was restating the rule at all.** Each reformulation was a fresh chance to be wrong and both chances were taken. Attempt 3's brief changed from *"write a correct definition"* to *"delete the second one and do not replace it"*, plus a self-check before reporting: grep your own diff for sentences that define membership — **there must be exactly one**.

**Root-cause note.** Three different model instances wrote this JSDoc; two failed the same way. That is a signal about the task's shape, not the workers' competence: T-6 asked a code comment to *carry* a normative definition, and a definition that lives in two places is a definition that can disagree with itself — the same single-source-of-truth discipline this whole spec enforces on code, applied to the prose describing it. **Recorded for Kaizen.**

#### A second defect attempt 1 introduced, caught before it propagated

The rewritten `NEVER_PUBLIC_FIELDS` JSDoc told T-9 to re-point the iteration to *"this set plus `PUBLICLY_DISCLOSED_FIELDS`"*. That iteration is `FORBIDDEN_KEYS`, an **absence** set applied to list, detail **and** `/metrics`. Following the instruction would have forbidden `phone`, `email`, `position`, `marketLocation`, `contactPerson` on the detail path — **precisely the fields FR-1 requires present there.**

A wrong instruction planted in the file T-9's Implementer reads first. Replaced with an explicit three-polarity block (absence-everywhere / absence-on-list / presence-on-detail), and attempt 3 refined it further with a by-key vs by-value distinction for `/metrics` that the Reviewer verified against DD-4's table and `LEAKABLE_PII_VALUES`' actual call sites.

#### Leader corrections made in parallel — these were mine, not the Implementer's

1. **`design.md` §7.1 was ambiguous.** Its Meaning column read *"must appear on the detail path for a `GRANTED` actor"*, which reads as FR-1's whole published set — **and that set is not verbatim implementable as a field-name array**: it names *"exact GPS"* (not a field name; `gps: {lat, long}`, computed by `publicGps`) and `crops` (a relation array). Faced with an unimplementable rule the Implementer substituted one by history. The adopted rule is now recorded in §7.1 **by policy**: *every field whose public disclosure this revision introduces.* **The ambiguity was the design's; the omission was the task's.**
2. **FR-8 undercounted.** It enumerated **six** constitutional documents; `backend/CLAUDE.md`'s `## PII & RBAC` section claims those fields *"exit ONLY through Admin-gated routes/serializers"*, which T-7/T-8 falsify — and it binds every future agent working in `backend/`. Corrected to **seven**, with T-17's scope widened to match. **This was not scope creep:** FR-8's own scenario ("zero surviving statements … when the repository is swept") already covered the file; only the enumeration was short. Recorded in FR-8 as an explicit principle — **the table enumerates, the sweep is the authority.**

#### ADVISORY (non-gating, recorded not actioned)

- **A1:** the JSDoc opener still paraphrases the runtime contract in wording close to the ambiguous revision-3 phrasing. The Reviewer judged it subordinate — every proposition in it is **true of all seven members**, unlike attempt 2's false equality — and offered a belt-and-braces clause. **Not actioned:** T-6 is complete, and widening a closed task to absorb an advisory is forbidden.
- **A2:** the polarity bullet's *"ONLY BY KEY on the list path"* is silent on by-value absence on the list path, which FR-9 does require. The complete statement sits 55 lines above in the same file, so it is not self-contradictory — but the two read in tension out of context.

**Verification:** `npm test -- --silent pii-consent --runInBand` → 11 tests · `npx eslint "{src,test}/**/*.ts" --quiet` clean · full `--runInBand` → 75 suites / **1039** tests.

---

### T-7 — Split the serializer into list and detail projections

| Field | Value |
|---|---|
| Status | **PASS** (attempt 1) · auto-approved (pre-approved mode) |
| Date | 2026-09-04 |
| Implementer attempts | 1 |
| Requirements covered | FR-1, FR-9 · design.md §6, §7.2, DD-3, DD-6, DD-9 · D-1b |
| Files changed | `role-aware.serializer.ts` (+160/-…), `role-aware.serializer.spec.ts`, `actors.controller.ts`, `actors.controller.spec.ts` · +259/-58 |

`PublicActorListItem` (10 keys) and `PublicActorDetail extends PublicActorListItem` (+5 contact-block keys). Both projections are explicit literal picks — **no spread anywhere on the projection path**, verified by the Reviewer. `toPublicDetail` composes by calling `toPublicListItem` and copying each field **by name**, so a field added to either interface fails to compile in the literal that omits it: the two shapes cannot drift silently, and the guard is the type system rather than a convention.

**Verification:** targeted 16/16 · `npm run build` clean · eslint clean · full `--runInBand` → 75 suites / **1041** tests.

#### The interim type falsehood — ruled acceptable, and why the reasoning matters

To keep the tree compiling without touching `actors.service.ts` (T-8's file), T-7 aliased `toPublic`/`PublicActor` to the **list** projection and bridged the controller with `return actor as PublicActorDetail`. **`findOnePublic` is therefore annotated with five fields it does not emit at runtime.** The type is false, and a comment does not make it true.

The Reviewer ruled it **acceptable interim engineering, not a FAIL**, on grounds worth preserving:

1. **It is not the KZ-008 class.** KZ-008's harm is a claim *nobody can check*, indistinguishable from a true one. This claim is stated false at the site in six lines, names the mechanism, names the successor task, and says explicitly that it does not add the contact block at runtime. Every load-bearing statement reconciled against source. That is the discipline working, not failing.
2. **The contradiction is the spec's, not the Implementer's.** `design.md` §4 prescribes the annotation verbatim and T-7's Done-when repeats it, while T-7's Files list excludes `actors.service.ts` and T-8 owns the wiring. **Those two constraints cannot both be satisfied by a truthful type.** An escape hatch was forced the moment the spec was written this way.
3. **The alias direction was the right trade, and it is not a close call.** Aliasing to `toPublicDetail` would have made the *list* endpoint serialize `phone`, `email`, `position`, `marketLocation` for every actor at up to 100 per page — the exact bulk-exposure breach FR-9 and DD-3 exist to prevent, committed to the mainline. The Reviewer: *"'Fails visibly' is the right tiebreak when the competing options are equally safe. It is not a licence to commit the defect in order to trigger the alarm. **Redness bought by shipping the leak is not a safety property; it is the leak with a bell on it.**"*
   Worse, that red would have been **indistinguishable** from the red the spec legitimately expects after T-8 — so an agent arriving mid-spec would have had a documented reason to "fix" it by inverting the gate, cementing the list leak behind a green suite.
4. **Blast radius, honestly stated:** nothing but T-8 protects a consumer trusting the annotation. No test drives service→controller→wire for presence until T-11; the existing detail-path assertion points the *wrong way* (asserts absence) so it cannot guard; the controller unit test mocks the service; ESLint is non-type-aware by design. The exposed consumer is **T-13**, whose dependency edge is `T-7 → T-13`, not `T-8 → T-13`. Failure mode is benign: T-14 renders em-dashes — under-delivery visible on first page load, no disclosure.

#### "No suite broke" — the Reviewer's reading, which is sharper than the Implementer's

**Correct but incomplete.** `pii-boundary.spec.ts`'s still-green detail-path absence assertion is **positive corroboration**, not absence of evidence: had the cast been anything other than a runtime no-op, it would be red. It points the same way as reading `actors.service.ts`.

**But T-7 was not behaviour-neutral.** Because the service still calls the alias, `sex` and `otherCrops` are now **live on the wire for both public routes**. That is a real widening of the public contract and nothing reddened — `sex` left `FORBIDDEN_KEYS` when T-6 emptied `PII_ALLOWLIST`, and neither field has a value in `LEAKABLE_PII_VALUES`. Nothing *should* have reddened (both are intended list-set members under FR-9/A-1), so it is not a defect — **but the widening is unguarded until T-11.** Recorded rather than left implicit.

#### Leader action taken — T-8's scope amended (Reviewer advisories 1 and 2)

The Reviewer found that **no task owned removing T-7's scaffolding**, and that the scaffolding is *actively dangerous during T-8*:

> Once T-8 lands, `return actor as PublicActorDetail` silently degrades to a redundant upcast that nothing flags. **Worse: if T-8 wires `findPublic` but forgets `findOnePublic`, the cast keeps the tree compiling — it suppresses precisely the TS error that would have caught it instantly.** For a design whose stated virtue is "structural, not disciplinary" (DD-6), a comment has replaced a compiler check.

And separately: `role-aware.serializer.ts` appears in **no task after T-7**, so the deprecated `toPublic`/`PublicActor` aliases would have survived to spec close — leaving a third live name for the list shape, which is the convergence hazard **D-4** was rewritten to prevent.

**T-8's Files list and Done-when are amended** to require deleting the cast *first* (so the compiler reports when the wiring is complete) and removing both aliases. **This is scope clarification, not widening:** T-7's own JSDoc already says *"Remove this export once T-8 lands"*, and a wiring task that leaves a deprecated alias behind has not finished wiring. Recorded explicitly because the Advisory-Never-Becomes-A-Task rule deserves an argued exception, not a silent one.

#### ADVISORY (non-gating, recorded not actioned)

- **A3:** `actors.controller.spec.ts`'s new header states in the present tense that the detail route returns the contact block, **without** the interim caveat its production sibling carries. Legitimate for a mocked unit test; as prose it is the same false claim minus the disclaimer.
- **A4 — for the retrospective, not this Implementer:** T-7's Done-when required an annotation T-7 was structurally forbidden to make true. **Annotations should move in the task that makes them true.** Never split a type from its runtime across a task boundary on a PII surface. This is a decomposition lesson and it is mine.

---
