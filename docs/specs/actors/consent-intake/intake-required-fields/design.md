# Design — One intake contract: required fields, generated Trader ID, duplicate detection, template v4

- Spec path: `docs/specs/actors/consent-intake/intake-required-fields/`
- Status: Draft
- Traces requirements: FR-1 to FR-6 and NFR-1 to NFR-4 in this spec's [`requirements.md`](requirements.md)
- Author / Date: AKILI (Leader), 2026-10-02. Premises verified at `609a752` by a delegated scout and by the Leader.
- Revision: **r2** (2026-10-02). r1 applied judgment round 1 ([`judgment.md`](judgment.md)): C-1 to C-3, S-1 to S-3, I-1 to I-12. r2 applies round 2: N-1 and N-2.

**The answer in four lines:**
1. A single shared **intake contract** module defines the required set and its bounds. The admin DTOs and the template generator consume it, and a test pins it against self-registration's DTO.
2. Trader IDs come from a new per-year **`ActorSequence`** that hands out ranges, in the format `TM-<year>-<NNNN>`.
3. The existing duplicate matcher is reused, with a **strength-first, uncapped strong set** for intake. A strong match makes the API refuse creation unless the request names every strong candidate as confirmed. This is stateless, so a stale confirmation can never pass.
4. Import replaces its Trader-ID dedupe with the same check, against the database and against earlier rows. The template ships as **v4**.

## 1. Approach Overview

```
ActorForm ──POST /admin/actors {…, confirmedNotDuplicateOf?}──▶ ActorsAdminService.create
                                                                   │ 1 validate the required set (DTO, from the intake contract)
                                                                   │ 2 IntakeDuplicateService.check(candidate)
                                                                   │      strong ⊄ confirmed → 409 {duplicateCandidates}
                                                                   │ 3 allocateTraderIds(1)       (own tx, before the create tx)
                                                                   │ 4 tx: actor.create + logCreate(+ duplicateConfirmation)
                                                                   ▼
                                                     201 {…actor, duplicateWarnings: weak[]}

Import page ──POST /admin/actors/import {file, mode, duplicateConfirmations?}──▶ ActorImportService.run
   validateRow (intake contract) → classifyDuplicates (DB + in-file) → applyConsentGate
   → [commit] per chunk: allocateTraderIds(chunk size) → chunk tx create + logImport(+ confirmation per row)
                          (P2002 on traderId → re-allocate and retry that chunk, ≤ 3)
```

Self-registration is untouched (FR-1: it is the reference).

## 2. Data Model Changes

| Change | Migration | Notes |
|---|---|---|
| New model **`ActorSequence { year Int @id; seq Int @default(0) }`** | `YYYYMMDDHHMMSS_add_actor_sequence`. Additive. | A sibling of `RegistrationSequence`, not a generalization. That table's PK, name and session variable are hardcoded in `registration-reference.util.ts` (P-9); generalizing it would rewrite the PK under a live feature. |
| **`ActorAuditLog.duplicateConfirmation Json?`** | `YYYYMMDDHHMMSS_add_audit_duplicate_confirmation`. Additive, nullable. | Holds the list of candidates the admin confirmed were not duplicates, each a **snapshot**: `{kind: 'actor', actorId, traderId, traderName, matchedOn}` or `{kind: 'row', row, traderName, matchedOn}`. It is a separate column, not a key in `changes`, because the history renderer's `isSnapshot` depends on the `changes` shape (P-12). This follows the `acknowledged` column precedent (`logRegistrationApprove`). |
| `Actor.traderId` | none | Stays `@unique`. Values are now system-assigned for team-managed actors. |

- **Classification:** neither new column reaches any public projection; `ActorAuditLog` is admin-only. `pii-consent.policy.ts` is unchanged. The snapshot carries **attribute names only**, never matched values (NFR-3).
- **Rollback:** both migrations are additive. Rolling the code back leaves an unused table and column (`backend/CLAUDE.md`: migrations are additive-only).

## 3. API Surface & Contracts

| Endpoint | Change |
|---|---|
| `POST /api/v1/admin/actors` | **Request:** `traderId` is removed from the DTO (it is stripped by `whitelist`, P-1). The required set and bounds come from the intake contract. A new optional field, `confirmedNotDuplicateOf: string[]` (actor ids, ≤ 50). **Response 201:** the existing `AdminActor` plus `duplicateWarnings: DuplicateCandidate[]` (weak, always present, possibly empty). **409:** `{statusCode, message: 'Possible duplicate', duplicateCandidates: DuplicateCandidate[]}`, listing the strong candidates not yet confirmed. |
| `PATCH /api/v1/admin/actors/:id` | `traderId` is removed from the DTO and from `SCALAR_FIELDS` (P-6). The required set is checked against the **merged** state (stored values plus patch), so an incomplete legacy actor cannot be saved without completing it (FR-1 scenario 3). A violation returns 400 with `details[{field, message}]`. No duplicate check runs on edit (out of scope). |
| `POST /api/v1/admin/actors/import` | **Request:** an optional field, `duplicateConfirmations: {row: number; candidates: string[]}[]`. Each candidate key is `actor:<id>` or `row:<n>`; at most 1,000 entries, ignored in preview. **Response row:** the outcome union becomes `created \| possible-duplicate \| failed`. `skipped-exists` and `skipped-duplicate-in-file` are **removed** (§8 DD-5). Each row gains `duplicateCandidates` (strong) and `duplicateWarnings` (weak). **Totals** (`ImportReportTotals`): `rows`, `toCreate`, `created`, `failed` and `warnings` are kept; `skipped` is **renamed** `possibleDuplicate`. Then `created + possibleDuplicate + failed = rows` after commit (FR-4 last scenario), and `toCreate + possibleDuplicate + failed = rows` in preview. |

`DuplicateCandidate` stays `{actorId, traderId, traderName, matchedOn}`. For an in-file match it is `{row, traderName, matchedOn}`, discriminated by `kind`. No `phone` or `email` value appears on any of these surfaces (NFR-3).

**Deploy coupling:** these contracts change together. Backend and frontend ship in the same release window. Old-frontend-against-new-API is admin-only, and its worst case is that the old import UI shows an unknown outcome label. That is accepted for the minutes between the two deploys.

## 4. Backend Design

### 4.1 Intake contract — `backend/src/common/intake-contract.ts` (new)
- Declares the required set and the bounds as data, taking self-registration's values: `traderName` ≤ 200, `contactPerson` ≤ 120, `phone` ≤ 40, `email` ≤ 191, `capacityTons` ≥ 0, `crops` non-empty.
- `ActorCreateDto` / `AdminActorCreateDto` carry decorators that match the declaration.
- `template-columns.ts` takes its `required` flags from the declaration.
- **The NFR-1 test** reads class-validator metadata from `RegistrationPayloadDto` (and `RegistrationCreateDto.email`) and from `AdminActorCreateDto`, plus the template's required headers. It asserts all three equal the declaration. Mutating any one reddens it.

### 4.2 Trader ID allocation — `backend/src/actors/trader-id.util.ts` (new)
- `allocateTraderIds(prisma, count, now)` returns `count` consecutive IDs from one raw `INSERT … ON DUPLICATE KEY UPDATE seq = seq + count`. The statement captures the post-increment value, and the range is `[value − count + 1, value]`. It mirrors `allocateRegistrationReference`'s session-variable mechanism (P-9). That mechanism's record covers the single increment only; **the range variant is new**, and its arithmetic is pinned by a unit test (§10).
- It runs in **its own transaction, before** the create transaction (P-9 says it cannot nest). A failed create burns its number. **Gaps are accepted:** the ID is a key, not a count.
- Format `TM-<UTC year>-<seq, zero-padded to 4, widening past 9999>`. The `TM-` prefix is unused today (grep in P-10).
- **Retry, on both paths.** A `P2002` on `traderId` triggers re-allocation, up to 3 attempts (`MAX_REFERENCE_ALLOCATION_ATTEMPTS` precedent). The admin never sees a uniqueness error (FR-2 scenario 2).

  | Path | What one retry wraps | When the 3 attempts are exhausted |
  |---|---|---|
  | Create | Allocation plus the create transaction | The request fails with a 500. |
  | Import | Allocation plus **one chunk's** transaction (§4.5), because an allocation cannot nest inside an open transaction (P-9) | Only that chunk fails: its rows are `failed` with today's `batch-rolled-back` reason. Later chunks still run, and the request still returns its report. This preserves the import's existing fault isolation (P-23). |

### 4.3 Intake duplicate check — `backend/src/actors/intake-duplicate.service.ts` (new)
- **Reuses the matching functions, not the service.** The normalizers and `computeMatchedOn` are exported from `duplicate-detection.service.ts` (today they are module-private, P-2). `IntakeDuplicateService` runs its own actor scan, its own strength-first ordering and its own cap. It never calls `detectForBatch`, whose cap is the DD-3 hazard. The registration queue's behavior and its cap are unchanged.
- **Strength:** strong = `matchedOn` includes `phone` or `email`; weak = everything else.
- **Uncapped strong set (DD-3):** the registration matcher sorts by `matchedOn.length` and slices to 5 (P-3). An email-only strong match therefore loses to five name+GPS weak matches and **would vanish**, so the actor would be created unconfirmed. Intake returns **every** strong candidate, with weak candidates capped at 5 after them.
- **One actor scan per call** (P-2's full `findMany`), reused for a whole import batch. **In-file matching** indexes earlier rows by normalized phone, email and name (maps), with a linear GPS-box scan. At 1,000 × ~1,300 that is about 1.3 M comparisons in memory, against the NFR-2 budget (measured in T-3; P-14).
- **Module wiring:** `IntakeDuplicateService` is a new provider in `ActorsModule`, needing only `PrismaService`. `DuplicateDetectionService` is **not** injected into `ActorsModule`; only its exported pure functions are imported. Nothing needs to be exported from `RegistrationsModule`, which exports nothing today (P-11).

### 4.4 Create and update — `ActorsAdminService`
- **Create:**
  1. Validate.
  2. Run `check`. If the strong candidates are not a subset of `confirmedNotDuplicateOf`, throw a `409` carrying the unconfirmed candidates. **The server recomputes every time:** a confirmation names actor ids, so a changed email that now matches actor B is unconfirmed, and FR-3's "not reusable" scenario holds by construction.
  3. Allocate.
  4. In the transaction, create with the scalar data **plus the allocated `traderId`**. `traderId` leaves `SCALAR_FIELDS`, so `buildScalarData` (shared by create and update) no longer carries it, and create adds it explicitly. Then call `logCreate` with `duplicateConfirmation`: the snapshot of the confirmed strong candidates, or null.
- **Update — merged-state check:** this follows the precedent of `isConsentProvenanceSatisfied(before, dto)` in `update` (P-21). Each required scalar is checked as `dto` value if present, else the stored value. **`crops` is a relation** (P-22: `update` replaces links with `deleteMany` then re-creates them):
  - When `dto.crops` is absent, the stored links count.
  - An explicit `crops: []` is rejected with a 400 on `crops`, so a PATCH can no longer wipe every crop.
- **Response** carries the weak candidates as `duplicateWarnings`.
- **`mapPrismaError`:** the "An actor with this traderId already exists" branch is **removed**. *Amended 2026-10-02 during T-2: the r2 text kept it "for the allocation-retry path", but the retry loop never routes a collision there, so it would be dead code.* The retry's collision test (`isTraderIdCollisionError`) is narrowed to a `P2002` whose `meta.target` names `traderId`. **On MySQL, `meta.target` is the index-name string `Actor_traderId_key`** (measured against the local container, execution.md T-2 attempt 2), so the check accepts that string and, for portability, an array of field names that includes `traderId`. Any other `P2002` falls through to `mapPrismaError`'s generic 409, as today.

### 4.5 Import — `ActorImportService`
- `validateRow` consumes the intake contract. The Trader ID cell and `registrationSource` parsing go away, and imports are always `TEAM_MANAGED`.
- `dedupeInFile` / `dedupeAgainstDb` (Trader ID based, P-4) are **replaced** by `classifyDuplicates`. It runs `check` in one batch over every row that **passed validation** (FR-1, the consent gate excluded). Rows that `failed` are neither matched nor match sources. Then:
  - If a row's strong keys are a subset of its `duplicateConfirmations` entry, it proceeds.
  - Otherwise it becomes `possible-duplicate`, and in commit mode it is not created.
- **In-file direction:** only *later* rows match *earlier* rows (FR-4 scenario 2).
  - Match sources are the earlier rows that passed validation, **including rows that are themselves `possible-duplicate`**. So two identical unconfirmed rows do not both silently pass.
  - **A `failed` row is never a match source.** It can never be created, so a confirmation asked against it would have no duplicate behind it (judgment S-2).
  - A row that the consent gate later fails stays a match source. Its identity is valid, and only its consent provenance is not.
- **Commit — the chunk loop changes** (P-5, P-23). Today each chunk is one transaction that creates its rows one by one, and any error marks the whole chunk `batch-rolled-back`. The loop now does three things per chunk:
  1. `allocateTraderIds(chunk size)` runs **before** the chunk's transaction.
  2. On a `P2002` on `traderId`, the loop re-allocates and retries **that chunk** (§4.2), up to 3 times.
  3. Exhausted retries, and any other error, keep today's whole-chunk failure: that chunk's rows are `failed`, and the loop continues with the next chunk. Nothing is rethrown out of `commit`.

  `logImport` writes each row's `duplicateConfirmation`. A `row` snapshot is resolved to the created `traderId` when the referenced row was created earlier in the same import.
- **Stale preview:** commit recomputes everything, so FR-4's "premise changed" scenario needs no extra state.

### 4.6 Template v4 — `backend/src/common/template-columns.ts`, `backend/scripts/generate-import-template.ts`
- `TEMPLATE_VERSION = 'v4'`. Trader ID, GPS Altitude, GPS Accuracy and Registration Source are dropped. The required flags come from the intake contract.
- `HOW_TO_LINES` gains one line: Trader IDs are assigned by the system, and possible duplicates are held for review.
- Regenerate `frontend/public/templates/actor-import-template.xlsx`; the byte-identity test (P-7) is the gate.
- **The hidden Lists sheet re-letters only the columns after Registration Source** (P-8). Consent Method moves from I to H. The two tests that hardcode Lists columns (Region = B, the crop YES/NO = D) sit before it and are unaffected. No existing test pins the shifted letter, so T-4 adds one.

### 4.7 Baseline documents (FR-6)

These edits sit on constitutional baselines, so the owning task gets a **mandatory Reviewer** whatever its size (CLAUDE.md, *blast radius*).

| Document | Edit |
|---|---|
| `docs/prd.md` | State the single required set and the system-generated Trader ID for team-managed intake. |
| `docs/trd/trd.md` | <ul><li>Data model: replace "natural key from source data; import dedupes on this".</li><li>Replace the "upsert by `traderId`" line.</li><li>Update QA-9's tactic and outcome shape, which are already stale against today's code (`inserted/updated/failed` versus `created/skipped-*/failed`).</li><li>Add `ActorSequence` and the audit column to the model.</li><li>Add the new ADR (DD-6).</li></ul> |
| `backend/CLAUDE.md` + `backend/AGENTS.md` | Keep the template-bump line accurate for v4. These are updated **in lockstep** (root CLAUDE.md, *Module Guides*; KZ-015). |

## 5. Frontend Design

| Unit | Change |
|---|---|
| `lib/api/client.ts` | `ApiError` keeps the parsed error **body** (`body?: unknown`). Today only `details` survive (P-13), so a 409's `duplicateCandidates` would be lost. |
| `lib/api/actors-admin.ts` | `AdminActorCreateInput` loses `traderId` and gains `confirmedNotDuplicateOf?`. The create result gains `duplicateWarnings`. `ImportRowResult` gets the new outcome union, `duplicateCandidates` and `duplicateWarnings`. The import request gains `duplicateConfirmations?`. Types mirror the backend exactly (frontend/CLAUDE.md). |
| `components/admin/ActorForm.tsx` | <ul><li>The Trader ID input is removed in **create**; in **edit**, the ID is shown as read-only text.</li><li>`validate()` mirrors the required set and bounds.</li><li>`mapApiError` stops routing every 409 to the `traderId` field (P-13). A 409 carrying `duplicateCandidates` opens **`DuplicateConfirmDialog`**: the candidates are listed with their matched attributes (reusing `lib/content/duplicate-candidates.ts` labels), with *Not a duplicate — create* and *Cancel*. Confirming resubmits with the ids.</li><li>`onSuccess` now receives the created actor, which chunk 2 needs as well.</li></ul> |
| `components/admin/DuplicateConfirmDialog.tsx` (new) | Built on `DialogFooter` + `useDialogFocusTrap` with the `shadow-lg` + `bg-backdrop` elevation. Tokens only. Announced through `aria-live` (NFR-4). |
| `app/(admin)/admin/actors/new/page.tsx` | If `duplicateWarnings` is non-empty, it shows an informational dialog before redirecting: *"Created TM-2026-0012. Similar actors: …"*, with a single **OK** button and no choice to make (FR-3 weak scenario). Otherwise it redirects as today. |
| `app/(admin)/admin/actors/import/page.tsx` + `ImportPreviewTable.tsx` | <ul><li>Preview rows marked `possible-duplicate` show their candidates and a per-row **Not a duplicate — create** checkbox. The page holds the confirmations and sends them on commit.</li><li>Weak warnings show as a secondary line on the row.</li><li>The Trader ID column shows the assigned ID after commit and "—" in preview.</li><li>Labels are *Possible duplicate — not created* and *Created (similar actor exists)*.</li><li>The `hidden md:block` table and the `md:hidden` cards change together (P-19; the breakpoint is per table under frontend/CLAUDE.md).</li><li>The new warning line uses `bg-surface-alt text-warning`, never a `/NN` opacity modifier. The file's existing `bg-warning/10` emits no CSS (frontend/CLAUDE.md; judgment I-11).</li></ul> |
| `components/admin/ActorHistoryPanel.tsx` | Renders `duplicateConfirmation` as *"Confirmed not a duplicate of TZ-… (matched on email)"*. |

## 6. Security & RBAC
- Every changed endpoint stays behind `JwtAuthGuard + RolesGuard + @Roles('Admin')`.
- Candidates and snapshots carry no contact values (NFR-3), gated by a key-set test with a leaking variant.
- `confirmedNotDuplicateOf` / `duplicateConfirmations` are bounded arrays, validated as strings. An unknown id never matches a candidate, so it cannot confirm anything.
- There is no new public surface.

## 7. Infrastructure / Deployment
- No AWS resource changes. The migrations run through the existing Prisma path (`backend/CLAUDE.md` runbook).
- **Deploy paths:** the backend deploy applies the migrations, and the frontend deploy (`AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`) ships the regenerated template asset. Both are needed in the same release (§3 *Deploy coupling*).

## 8. Decision Records

### DD-1: One declared contract, three consumers
- Context: three hand-maintained rule sets drifted (FR-1).
- Options considered: (a) copy the rules; (b) derive the DTO decorators at runtime; (c) declare the rules once and pin the consumers with a metadata test.
- Decision: **(c)**. Decorators stay idiomatic and the test makes drift loud.
- Consequences:
  - Frontend validation is a fourth copy that cannot import the backend module. It is pinned by its own test against the same literal list (accepted).
  - The metadata read is feasible (P-20) but unprecedented here. If it proves brittle in T-1, the fallback is the repo's existing black-box `validate()` convention: one removal per field, per DTO.

### DD-2: A sibling sequence table with range allocation
- Decision: a new `ActorSequence`, not a generalized `RegistrationSequence` (P-9). One allocation statement per import.
- Consequences: gaps on failure; two tables with the same shape.

### DD-3: Strength-first, uncapped strong candidates for intake
- Context: the registration matcher caps at 5 by match count (P-3). That is fine for an advisory queue and unsafe for a gate.
- Decision: intake keeps every strong candidate and caps the weak ones.
- Consequences: a pathological dataset could list many strong candidates in a dialog. That is acceptable, and it is itself a signal.

### DD-4: Stateless, server-recomputed confirmation
- Options considered: (a) a confirmation token from preview; (b) the server re-checks on every submit, and the request names what was confirmed.
- Decision: **(b)**. No new state, and FR-3 and FR-4's stale-premise scenarios hold by construction.

### DD-5: Replace the Trader-ID dedupe outcomes *(reversion; challenged per Step 2.3)*
- It removes `skipped-exists` / `skipped-duplicate-in-file` and the Trader ID input. **Challenge question: "what does removing this break?"** Answers, from the consumer sweep (P-15):
  1. **Re-import idempotency.** It is preserved: a re-uploaded workbook's rows strongly match (v4 rows always carry phone and email) and are held. FR-4 scenario 1 tests this.
  2. **A legacy actor with no phone or email** (pre-v4 data) is matched only weakly by name, so a re-imported copy **would be created**, with a warning. **Accepted under D-3** (all current data is test data), and the warning makes it visible. Revisit if real legacy data without contact fields is ever imported.
  3. **The removed outcomes are pinned in 10 files** (`skipped-exists`) and **8 files** (`skipped-duplicate-in-file`). These sets overlap, and include production files. **Trader ID** appears in test files 303 times across 36 files (P-15). All of them are rewritten in the owning tasks, not deleted.
  4. The archived onboarding `mapping.md` prefixes (`OFB-` and others) no longer apply. It is frozen, so nothing changes there.
- Outcome: no unaddressed breakage, and the design stands.

### DD-6: The TRD records the change as an ADR
Replacing the natural key as the duplicate guard is a TRD-level decision; TRD :71 says "import dedupes on this" (P-16). The ADR number is **allocated at archive time on `main`**, after checking unmerged branches (CLAUDE.md *Concurrency protocol*). Chunk 2's planned "ADR-017" is renumbered then if needed.

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| NFR-2 over budget on a 1,000-row import | Measured in T-3 with a fixture. Indexed maps for in-file matching; one actor scan per call. |
| A strong match silently capped away | DD-3, plus a test where the fixture holds 5 name+GPS weak matches and 1 email-only strong match (the falsifier). |
| Large test churn | Budgeted (§11). Consumers are listed per task. |
| Deploy skew between backend and frontend | §3 *Deploy coupling*. Admin-only, so the window is short. |
| A Trader ID collision inside an import chunk | The per-chunk allocate-and-retry (§4.5). A collision costs one chunk retry. Only if 3 retries all collide, which is not expected with atomic allocation, do that chunk's rows fail. Other chunks are never affected. |

## 10. Test Plan Outline

| FR | Tests |
|---|---|
| FR-1 | <ul><li>The NFR-1 metadata test.</li><li>DTO specs for each missing field and bound.</li><li>The falsifier "`otherCrops` filled + `crops: []` → rejected".</li><li>Service tests for the merged-state edit, including `crops` absent (kept) and `crops: []` (rejected).</li><li>A direct-API e2e that skips the form.</li></ul> |
| FR-2 | <ul><li>Allocation util spec: range arithmetic, format, widening.</li><li>Retry specs for create and for an import chunk: the stubbed `P2002` resolves after re-allocation, and no row is lost.</li><li>Exhaustion specs: create returns 500; an import chunk whose 3 attempts all collide marks only its own rows `failed`, a later chunk is still created, and the response is a report, not an error.</li><li>A test that `traderId` in the body is ignored.</li><li>A test that existing IDs are untouched.</li><li>**Concurrency against real MySQL is a declared gap** (P-17: the harness mocks Prisma). The substitute is the atomic single-statement allocation, plus the retry specs.</li></ul> |
| FR-3 | Service: strong produces a 409; confirmed creates and audits; weak creates with warnings; a changed email re-asks; the capped-away falsifier. E2e: a direct POST without confirmation. |
| FR-4 | Import service: re-upload holds all; in-file direction; **a failed row sharing a phone with a later valid row does not flag it**; per-row confirm; stale premise; weak created; totals sum (preview and commit forms). |
| FR-5 | The generator byte test. Version rejection of v3. The GRANTED provenance row unchanged. |
| FR-6 | The recorded search from requirements FR-6. |
| NFR-3 | Candidate key-set test with a leaking variant. |
| NFR-4 / layout | Component tests (focus, `aria-live`). **Rendered captures at 375/768/1440** for the dialog and the preview table (no automated gate). |

## 11. Budget (tripwire for `/akili-execute`)

| Measure | Estimate |
|---|---|
| Tasks | ~~7~~ **8**: re-sized at decomposition, when import was split into template/validation (T-4) and duplicates (T-5). See tasks.md Document Control. |
| LOC (incl. tests and fixture churn) | **~1,800**: about 700 production, about 1,100 tests |
| Review rounds | ~~~12~~ **~13** (most tasks 1–2; T-3 and T-5 up to 3) |

The proposal's Lite estimate was re-checked here. Standard is right; it is not Full, because there is no new public surface or infra.

## 12. Premise Ledger

**Count:** 24 rows. 23 verified, 1 `UNVERIFIED` (P-14, High). *r1: the r0 line said "17 rows, 15 verified" against a table of 18 (judgment C-1). P-17 is now settled; P-19 to P-23 were added.*
**Blast-radius triggers fired:**
- `live-path`: the admin create and import user actions (P-18).
- `shared-state`: the matcher is shared with the registration queue (P-2, P-3).
- `consumer`: the response shapes and stored fields change (P-15).

| # | Claim | Class | Citation (as run) | Verified at | If false | Settled by |
|---|---|---|---|---|---|---|
| P-1 | The global pipe is `whitelist: true` without `forbidNonWhitelisted`, so an undeclared body property is stripped. | data-env | `backend/src/common/validation-pipe.ts` `createValidationPipe`; used by `main.ts` and `lambda.ts` | 609a752 | FR-2 scenario 3 needs a different mechanism (High) | — |
| P-2 | `DuplicateDetectionService.detectForBatch` loads all actors with no `where` per call; the normalizers and `computeMatchedOn` are module-private. Its callers are `admin-registrations.service.ts` `list` and the detail read. | shared-state | `duplicate-detection.service.ts` `detectForBatch`, `normalize*ForMatch`, `computeMatchedOn`; `grep -rn "detectForBatch" backend/src` → 2 production call sites | 609a752 | §4.3 export and reuse plan (High) | — |
| P-3 | Candidates are sorted by `matchedOn.length` desc and sliced to `MAX_CANDIDATES_PER_REGISTRATION = 5`. | shared-state | `duplicate-detection.service.ts`, the sort and `slice` at the end of `matchOne` (read by the Leader) | 609a752 | DD-3 unnecessary (Low) | — |
| P-4 | Import dedupe is Trader-ID based: `dedupeInFile` uses a Set of `traderId`; `dedupeAgainstDb` uses `findMany where traderId in`. | location | `actor-import.service.ts` `dedupeInFile`, `dedupeAgainstDb` | 609a752 | §4.5 replacement scope (High) | — |
| P-5 | Import commits in per-chunk transactions (`COMMIT_CHUNK_SIZE = 100`), with `logImport` once per chunk. | location | `actor-import.service.ts` `COMMIT_CHUNK_SIZE`, `commit` | 609a752 | §4.5 allocation-before-loop (Low) | — |
| P-6 | `AdminActorUpdateDto` is `PartialType(AdminActorCreateDto)` and `traderId` is in `SCALAR_FIELDS`, so it is editable today. | existence | `admin-actor-update.dto.ts`; `actors-admin.service.ts` `SCALAR_FIELDS` | 609a752 | FR-2 edit clause needs no work (Low) | — |
| P-7 | A test asserts the committed template is byte-identical to generator output. | existence | `backend/src/common/generate-template.spec.ts` "matches the committed static asset byte-for-byte" | 609a752 | FR-5 needs a new gate (High) | — |
| P-8 | The generator's hidden Lists sheet assigns columns in `allowedValues` order; tests hardcode Lists columns B and D. | consumer | `generate-import-template.ts` Lists block; `generate-template.spec.ts` Lists assertions | 609a752 | T-4 consumer list (Low) | — |
| P-9 | `allocateRegistrationReference` opens its own `$transaction` with a raw `INSERT … ON DUPLICATE KEY UPDATE` on `RegistrationSequence(year PK)`, and cannot nest. | other | `registration-reference.util.ts` `allocateRegistrationReference` and its class doc | 609a752 | DD-2 shape (High) | — |
| P-10 | No code uses a `TM-` Trader ID prefix. | existence | `grep -rn "'TM-\|\"TM-\|TM-[0-9]" backend/src backend/prisma frontend/lib` → 0 hits. Known prefixes: `SR-` (DD-23), `SYN-` (`seed-synthetic.ts`), `TZ-SEED-` (`seed-data.ts`), `OFB/OFS/OFG-` (archived mapping) | 609a752 | Format choice (Low) | — |
| P-11 | `RegistrationsModule` exports nothing and does not import `ActorsModule`; `ActorsModule` imports only `PrismaModule`. | other | `registrations.module.ts` `@Module` (no `exports`; the doc says "`ActorsModule` already provides this same class but does not export it"); `actors.module.ts` `imports: [PrismaModule]` | 609a752 | §4.3 wiring: reuse goes through exported functions, not DI (Low) | — |
| P-12 | The history renderer branches on the `changes` shape via `isSnapshot`. | consumer | `frontend/components/admin/ActorHistoryPanel.tsx` `isSnapshot` | 609a752 | The separate audit column becomes optional (Low) | — |
| P-13 | `ActorForm.mapApiError` maps every 409 to `fieldErrors.traderId`; `apiFetch` copies only `envelope.details` into `ApiError`. | live-path | `ActorForm.tsx` `mapApiError`; `lib/api/client.ts` `ApiError`, `apiFetch` | 609a752 | §5 client change scope (High) | — |
| P-14 | Detection over 1,000 rows × ~1,300 actors fits NFR-2. | data-env | `UNVERIFIED — confirm at source before relying on it` | — | §4.3 algorithm, or a pre-filtered query (High) | T-3, first step: a measured run with a 1,000-row fixture |
| P-15 | Consumers of the removed outcomes and of Trader ID input. `skipped-exists`: **10** files; `skipped-duplicate-in-file`: **8**, both including `backend/src/test/partner-profile-onboarding-import.e2e.spec.ts`; `traderId` in tests: 36 files / 303 lines. | consumer | `grep -rl "skipped-exists" backend/src frontend/app frontend/components frontend/lib \| wc -l` → 10; same for `skipped-duplicate-in-file` → 8 (Leader, re-run r1); `grep -rc traderId --include=*.spec.ts --include=*.test.ts --include=*.test.tsx` → 36 files / 303 lines (scout and judge, as run). *r0 said 9 and 7 (judgment C-2).* | 609a752 | Task scope and budget (Low) | — |
| P-16 | The TRD states that the import dedupes and upserts by `traderId`. | location | `grep -n traderId docs/trd/trd.md`: the data-model "Natural key… import dedupes on this", the "upsert by `traderId`" line, and QA-9 | 609a752 | FR-6 / T-7 scope (Low) | — |
| P-17 | The backend e2e harness **cannot** run against a real MySQL: it is AppModule plus an in-memory Prisma mock override. | data-env | `backend/CLAUDE.md` *Testing conventions*; `backend/src/test/admin-actors-crud.e2e.spec.ts` `describe('Admin actors CRUD e2e (HTTP + in-memory Prisma)'`; `admin-actor-import.e2e.spec.ts` `overrideProvider(PrismaService)` (judges A and B). *r0 carried this `UNVERIFIED`, wrongly phrased as the opposite (judgment C-3).* | 609a752 | FR-2 concurrency is a declared gap (§10), so no task spike is needed (Low) | — |
| P-18 | The *New actor* submit reaches `ActorsAdminService.create`, and the import page reaches `ActorImportService.run`. | live-path | `app/(admin)/admin/actors/new/page.tsx` → `ActorForm` (`mode="create"`) → `createActor` (`lib/api/actors-admin.ts`) → `POST admin/actors` (`admin-actors.controller.ts`) → `ActorsAdminService.create`; import page → `importActors` → `POST admin/actors/import` → `ActorImportService.run` | 609a752 | Everything (High) | — |
| P-19 | `ImportPreviewTable` splits table and cards at `md`, not `lg`. | location | `frontend/components/admin/ImportPreviewTable.tsx`: `hidden md:block overflow-x-auto` and `flex flex-col gap-3 md:hidden` (Leader, re-run r1). *r0 §5 said `lg` from memory (judgment S-3, KZ-008).* | 609a752 | §5 layout instruction and the T-6 capture widths (Low) | — |
| P-20 | class-validator exposes the decorator metadata of a DTO, inherited classes included, for the NFR-1 test. | existence | `backend/node_modules/class-validator/types/metadata/MetadataStorage.d.ts` `getTargetValidationMetadatas`; its `.js` "inherited classes" block; `backend/package.json` `class-validator ^0.14.1` (judge B) | 609a752 | DD-1 gate falls back to black-box `validate()` (Low) | — |
| P-21 | `update` already checks a rule against the merged state of `before` and `dto`. | other | `actors-admin.service.ts` `isConsentProvenanceSatisfied(before, dto)` inside `update` (Leader, grep r1) | 609a752 | §4.4 merged-check approach needs its own mechanism (Low) | — |
| P-22 | `update` replaces crop links wholesale: `cropsOnActors.deleteMany`, then re-create from `dto.crops`. | live-path | `actors-admin.service.ts` `update`, `tx.cropsOnActors.deleteMany({ where: { actorId: id } })` (Leader, grep r1) | 609a752 | §4.4 crops rule (Low) | — |
| P-23 | The import commit creates each row inside one transaction per chunk. Any error marks the whole chunk `batch-rolled-back`, the `catch` never rethrows, and later chunks still run. | location | `actor-import.service.ts` `commit`, `BATCH_ROLLED_BACK_REASON` (judges A and B; Leader grep r1) | 609a752 | §4.5 per-chunk allocation and retry (High) | — |
| P-24 | `buildScalarData` maps `SCALAR_FIELDS` and is shared by `create` and `update`. | location | `actors-admin.service.ts` `buildScalarData`, called from both `create` and `update` (`grep -n buildScalarData backend/src/actors/actors-admin.service.ts`, Leader r2; judge A N-2) | 609a752 | §4.4 merge point for the allocated `traderId` (Low) | — |
