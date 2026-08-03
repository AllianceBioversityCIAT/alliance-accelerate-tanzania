# Execution Log — Registration Source & Consent Provenance

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/actors/registration-source-and-consent/` |
| Execution started | 2026-08-03 |
| Orchestrator | AKILI Leader (Claude Code, T1) on behalf of JuanCode |
| Approval Mode | **gated** (from `proposal.md` §1) — the continue/pause gate stops for the user after every task |
| Branch | `actor-register` |
| Budget (`design.md` §10) | 10 tasks · ~1,250 LOC · ~12 review rounds |
| Commit standard | `[SPEC:actors/registration-source-and-consent] <message>` |

### 1.1 Environment resolution (recorded once, applies to every DB-touching task)

The spec's `tasks.md` migration convention assumes a **local disposable MySQL** ("rehearse on local docker MySQL first"). That route was unavailable at execution time and the user selected the documented fallback instead.

| Fact | Value |
|---|---|
| Local MySQL | **Unavailable** — no `backend/.env`, Docker daemon down, port 3306 closed |
| Route chosen by user | **Dev RDS** (`docs/infrastructure.md` §6 fallback route) |
| Stack | `accelerate-tz-dev-data-auth` (`--profile IBD-DEV`, `eu-west-1`) |
| Endpoint | `accelerate-tz-dev-data-auth-db-5imffsidnqt9.ckr5yv8lavgw.eu-west-1.rds.amazonaws.com:3306/accelerate` |
| Reachability | Confirmed — DevCidr ingress already covers the operator IP |
| Credentials | Composed by the Leader from Secrets Manager (`DbSecretArn` stack output) into `backend/.env`, mode `600`, confirmed gitignored (`backend/.gitignore:15`) |
| Pre-flight drift check | `npx prisma migrate status` → *"3 migrations found… Database schema is up to date!"* — **no drift**, so no reset path is reachable |

**Recorded deviation — T-1 verification command.** `tasks.md` T-1 specifies `npx prisma migrate dev`. Against a *shared* dev RDS that command is unsafe: its drift check can offer to reset the database. The Leader substitutes an equivalent, non-destructive sequence that satisfies the same done-criteria:

```
npx prisma migrate status                    # read-only drift check (done: no drift)
npx prisma migrate dev --create-only --name add_registration_source_and_consent_provenance
<inspect generated SQL: additive only — no DROP, no MODIFY of existing columns>
npx prisma migrate deploy                    # applies; has no reset path
npx prisma generate && npm run build         # T-1's compile criterion
```

Rationale: `migrate deploy` is also what `infra/scripts/migrate-seed.sh:140` uses against RDS, so this matches the repo's own established RDS posture. `migrate-seed.sh` was **not** run whole — it also seeds (`tasks.md` Execution Conventions).

### 1.2 Orchestration decisions

- **Antigravity / T6 multimodal: deferred, not required for Phase A–B.** The only genuine vision need in this spec is T-8's `Human check required (D-h)` — column crowding at `md`/`lg`, which `jest-axe` structurally cannot see. `agy` is installed and confirmed available for that task.
- **Parallelism.** `tasks.md` marks T-1 and T-5 as both immediately eligible. They are dependency-independent but **not** execution-independent: T-1 runs `prisma migrate*`, which rewrites `node_modules/.prisma`, while T-5's Jest run imports `@prisma/client` from that same tree — the exact cross-worker contention `.agents/leader.md` → *Directory boundaries* warns produces errors in the wrong worker. Waves used instead:

  | Wave | Tasks | Justification |
  |---|---|---|
  | 1 | T-5 alone | Jest-only, no DB, no Prisma regeneration |
  | 2 | T-1 alone | `backend/prisma/` is serialize-always |
  | 3 | T-2 + T-7 parallel | Both `backend/src/common/`, disjoint files, Jest-only verifies |

- **Delegation mechanism:** native Claude Code Agent spawns against the `.claude/agents/akili-*` wrappers, which carry the `## Model Routing` tier bindings and enforce `author ≠ auditor` by configuration.

---

## 2. Task Execution History

<!-- Entries appended below, one per task, in execution order. -->

### T-5 — Extend the trader taxonomy

| Field | Value |
|---|---|
| **Status** | **PASS** on attempt 1 (no rework) |
| Date | 2026-08-03 |
| Wave | 1 (executed alone — see §1.2 for why T-5 ∥ T-1 was rejected) |
| Implementer attempts | 1 |
| Effort assigned | `medium` |
| Skills assigned | **none** — deviation from `tasks.md`, which also lists none. Pure data + unit tests; `nestjs-expert` would be pure overhead on a file with no Nest surface |
| Requirements covered | FR-4 · `design.md` §4.4, DD-7 |

**Files changed**
- `backend/src/common/normalize.ts` — 4 codes appended to `TRADER_TYPES`; 6 entries appended to `TRADER_TYPE_ALIASES`
- `backend/src/common/normalize.spec.ts` — table-driven cases: FR-4 spellings, case/whitespace insensitivity, quarantine-still-holds, pre-existing-six regression

**Alias table added** (surfaced here because defect class **D-g** requires a human who knows the dataset to ratify it)

| Source spelling | Canonical type |
|---|---|
| `INGO` | `humanitarian` |
| `NGO/INGO` | `humanitarian` |
| `cbo` | `humanitarian` |
| `Digital Service Provider` | `digital_service_provider` |
| `QDS` | `qds_producer` |
| `Bulk buyer` | `bulk_buyer` |

Deliberately left unmapped so they quarantine: the `"Offtaker name"`-adjacent variant named without a concrete spelling in §4.4, and `Community Group`.

**Verification**
- Implementer, as prescribed by the task: `cd backend && npm test -- normalize --silent` → PASS, 23/23 tests, 1 suite.
- Leader, inline after the Reviewer's ADVISORY A-1: `cd backend && npm test -- --silent` → **1 failed, 377 passed, 378 total**. Sole failure verbatim:

```
FAIL common/generate-template.spec.ts
  ● generate-import-template › matches the committed static asset byte-for-byte
    expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false
      at Object.<anonymous> (common/generate-template.spec.ts:45:41)
```

**Reviewer verdict — PASS.** Diff is strictly additive and spec-conformant: all six spellings named in `design.md` §4.4 are aliased; the lookup at `normalize.ts:211` does `raw.trim().toLowerCase()` before consulting the map, so the case/whitespace criterion holds; the pre-existing six types and twelve aliases are untouched. The Reviewer additionally verified **no key collision** between the six new alias keys and the twelve existing ones, which upgrades the "byte-identical" criterion from *sampled by test* to *guaranteed by construction*.

**Reviewer correction to the Leader's brief (recorded — the brief was wrong, not the diff).** The Leader's review brief asked for a DD-7 conformance check on the `cbo`/`ngo-ingo` mappings. DD-7 (`design.md:266-272`) decides only whether the four categories belong on `traderType` or on a new `sector` dimension; it neither authorizes nor forbids any alias. Alias semantics are routed to a human by `requirements.md` §8 D-g and `design.md` §11 R-7. The check as framed had no failing condition available to it.

**ADVISORY findings (4R lens — recorded, non-gating, and none of them mints a new task)**

| ID | Finding | Disposition |
|---|---|---|
| **A-1** | This change necessarily breaks `generate-template.spec.ts`'s committed-asset byte-match: `template-columns.ts:80` sets the Trader Type column's `allowedValues: TRADER_TYPES`, which lands in both the Instructions sheet string and the hidden Lists sheet range (`Lists!$A$1:$A$6` → `$A$1:$A$10`). T-5's prescribed Verify command is structurally blind to it. | **Confirmed by execution**, not just inspection. **Anticipated by the spec** — `tasks.md` T-6 owns asset regeneration and carries the `T-5 → T-6` edge for exactly this reason. Red window is contained inside PR 1 (T-1…T-7) and never reaches a merged branch. No action; T-6 closes it. |
| **A-2** | `ngo/ingo → humanitarian` is the highest-value item for the D-g check: §4.4 mandates the *spelling* be aliased but never states its *target*, and the taxonomy now holds both `ngo` and `humanitarian`. A slash-joined pair naming two live codes is the same shape as `"Arusha/Dodoma"`, this file's own canonical ambiguous-value example (`normalize.ts:74`). | Surfaced to the user at the review pause alongside `cbo`. Not a scope violation — the spec requires the alias to exist. |
| **A-3** | `normalizeTraderType('Offtaker name') → null` is now pinned by a test, converting a deliberate omission into asserted behavior. If the workbook's category column holds an "Offtaker name"-ish literal meaning `offtaker`, that test must change in chunk 2. | Recorded for chunk 2. |
| **A-4** | `frontend/lib/content/roles.ts:35` keys `ROLES` on the six original types only. Nothing breaks (`roleLabel` falls back to the raw string, color falls back to `muted`), but public map/directory/dashboard will render raw snake_case and a grey dot once actors carry the new codes. No task in this spec covers it — T-8/T-9/T-10 are admin-only and FR-4 records "PII/RBAC impact: None". | **Spec gap for chunk 2, not a T-5 defect.** Per the Advisory-Never-Becomes-A-Task rule this does **not** mint a task here; escalated to the user as input to the epic's chunk 2. |
| **A-5** | `trim()` is not internal-whitespace normalization: `'bulk  buyer'` and `'NGO / INGO'` will quarantine. FR-4's stated bar is `"  INGO "`, which is met. | Conformant. Recorded as a likely source of unexplained quarantines during chunk 2 import. |

**Decisions made**
- Reviewer spawned on the T3 wrapper (`author ≠ auditor` enforced by `.claude/agents/akili-reviewer.md`).
- Leader ran the full-suite check inline rather than delegating: `.agents/leader.md` → *Delegation Ceiling*, "never delegate your own verification".
- Template asset **not** regenerated here despite the red test. Regenerating now would (a) take T-6's scope and (b) produce an intermediate asset T-6 immediately regenerates, since T-6 also adds four columns and bumps `TEMPLATE_VERSION` to `v2`.

**Issues encountered**
- The Reviewer's first delivery arrived as an idle notification with no report body; the verdict was recovered by an explicit resend request. No re-audit was run.

**D-g human check — RATIFIED 2026-08-03 by JuanCode (dataset owner).** The alias table above was surfaced at the gated review pause with the Reviewer's A-2 objection stated in full (`NGO/INGO` names two live codes and is structurally the same shape as the file's own canonical ambiguous example `"Arusha/Dodoma"`). The user's decision: **keep the mapping as committed** — `cbo`, `INGO`, and `NGO/INGO` → `humanitarian`, with the pre-existing `ngo` alias (formally registered local NGO) left intact and semantically distinct. A-2 is closed; D-g is discharged for this spec.

---

### T-1 — Add registration-source and consent-provenance columns to the Actor model

| Field | Value |
|---|---|
| **Status** | **PASS** on attempt 1 (no rework) |
| Date | 2026-08-03 |
| Wave | 2 (executed alone — `backend/prisma/` is serialize-always) |
| Implementer attempts | 1 |
| Effort assigned | `xhigh` |
| Skills assigned | `nestjs-expert`. **`tdd` deliberately withheld** — this task writes no business logic; red→green would be pure overhead on a schema change |
| Requirements covered | FR-1, FR-2, NFR-2, FR-9 · `design.md` §2 |

**Effort-vs-tier note.** `.agents/leader.md` calls Prisma migrations `max` work, but the tier↔effort rule forbids `max` on a cheaper tier, and escalating the Implementer to opus would have collapsed `author ≠ auditor` (the Reviewer wrapper is already opus). Resolved by running the T2 Implementer at `xhigh` and having the **Leader personally gate the generated SQL** before it reached the database — the migration was authored with `--create-only`, inspected, and only then applied.

**Files changed**
- `backend/prisma/schema.prisma` — `RegistrationSource` + `ConsentMethod` enums; four `Actor` columns; `@@index([registrationSource])`
- `backend/prisma/migrations/20260803182419_add_registration_source_and_consent_provenance/migration.sql` (new)

**Migration SQL (gated by the Leader before apply)**

```sql
-- AlterTable
ALTER TABLE `Actor` ADD COLUMN `consentMethod` ENUM('NOT_RECORDED', 'PORTAL_CHECKBOX', 'SIGNED_FORM', 'EMAIL', 'VERBAL_FIELD') NOT NULL DEFAULT 'NOT_RECORDED',
    ADD COLUMN `consentObtainedAt` DATETIME(3) NULL,
    ADD COLUMN `consentReference` VARCHAR(255) NULL,
    ADD COLUMN `registrationSource` ENUM('TEAM_MANAGED', 'SELF_REGISTERED') NOT NULL DEFAULT 'TEAM_MANAGED';

-- CreateIndex
CREATE INDEX `Actor_registrationSource_idx` ON `Actor`(`registrationSource`);
```

**Verification (all against the dev RDS — see §1.1)**

| Command | Result |
|---|---|
| `npx prisma migrate dev --create-only --name add_registration_source_and_consent_provenance` | Migration authored, **not** applied |
| Leader inspection of generated SQL | Additive only — no `DROP`, `MODIFY`, `CHANGE`, `RENAME`, `UPDATE`, `INSERT` |
| `npx prisma migrate deploy` | "All migrations have been successfully applied." |
| `npx prisma generate` | Prisma Client v6.19.3 generated |
| `npm run build` | Clean |
| `npx eslint "{src,test}/**/*.ts" --quiet` | Clean |
| `npm test -- --silent` | 377/378 — sole failure is the known T-5 template byte-match, closed by T-6 |

**Lossless-migration proof.** 436 rows before, 436 after. Sampled row `cmqsgkbmr0003ca66wayev52j` byte-identical on every pre-existing field. Full-table sweep: 0 rows with non-default `registrationSource`, 0 non-default `consentMethod`, 0 non-null `consentObtainedAt`, 0 non-null `consentReference`. The Reviewer noted this same count independently clears **R-5** — a stray `migrate-seed.sh` run would have moved the row count, and it did not.

**FR-9 confirmed.** No backfill. `consentStatus = GRANTED AND consentMethod = NOT_RECORDED` = **436 of 436**.

> **Carry-forward for T-3 (R-9).** The entire current dataset is the legacy-unevidenced case. That promotes R-9 from an edge case to a total-outage risk: if the T-2 predicate is implemented as *key-present* rather than *value-changed*, **every actor in the database becomes uneditable**, not merely a legacy subset. T-3's brief must state this.

**Reviewer verdict — PASS.** All 21 pre-existing `Actor` fields verified byte-identical across the `prisma format` realignment on name, type, optionality, and attributes — including both `// PII` trailing comments and the two *distinct* `Decimal` precisions (`10,7` for lat/long vs `10,2` for altitude/accuracy), which the Reviewer identified as the classic realignment casualty. Corroborated independently by the SQL containing no `MODIFY`. Enum members and their **order** match §2 exactly, which matters because MySQL stores enum members ordinally. Scope containment verified by repo-wide grep: the four new symbols appear in exactly two files.

**Reviewer correction to the Leader's brief (recorded — the brief was wrong, not the diff).** The Leader's check #5 hypothesised that `design.md` §2 might specify a composite index (`[consentStatus, consentMethod]`) since that is what FR-9's enumeration query needs. It does not: §2 lists exactly one index, `@@index([registrationSource])`, annotated *"Supports the FR-6 filter"*, and `requirements.md` §10 agrees. Implementing the composite would itself have been a §2 divergence and a FAIL. The Implementer built what the spec authorises. *(Second Leader-brief error this run — see the T-5 entry's DD-7 correction. Both were the Leader over-specifying a check against a document section it had not re-read.)*

**ADVISORY findings (recorded, non-gating)**

| ID | Finding | Disposition |
|---|---|---|
| **B-1** | The local-docker-MySQL rehearsal mandated by `tasks.md` T-1, NFR-2's measure, `design.md` §7, and `backend/CLAUDE.md` was **not** performed — everything ran against the shared dev RDS. | **Accepted, and recorded rather than hidden.** §1.1 above documents the route, the user's decision, and the reason. NFR-2's substance was demonstrated on *stronger* ground than the rehearsal would have given: 436 real rows instead of a scratch DB. This spec has no further migrations; the note binds the next one. |
| **B-2** | FR-9's enumeration query (`consentStatus = GRANTED AND consentMethod = NOT_RECORDED`, implemented by T-8) has **no supporting index**, and the existing `@@index([consentStatus])` is fully non-selective for it today since all 436 rows are `GRANTED`. `design.md` §3 also promises a `consentMethod` list filter, likewise unindexed. | Non-issue at 436 rows and at the ~1,318-row import scale. **Raise against `design.md` §2 before T-8 starts.** Per Advisory-Never-Becomes-A-Task this mints no task here. |
| **B-3** | Prisma emitted the four `ADD COLUMN`s alphabetically while `schema.prisma` declares `registrationSource` first. | Cosmetic — Prisma addresses columns by name. Noted so a future reader does not mistake it for drift. |

**Issues encountered (T-1)**
- **Second consecutive Reviewer delivery failure.** Both `rev-T5` and `rev-T1` emitted an idle notification with no report body; both verdicts were recovered intact by an explicit resend request, and neither re-ran its audit. This is a harness-level delivery pattern, not an agent defect — it costs one round trip per review. Mitigation applied from T-1 onward: the Reviewer brief now explicitly instructs "deliver your verdict as a normal reply".

---

### T-2 — Implement the shared consent-provenance invariant

| Field | Value |
|---|---|
| **Status** | **PASS** on attempt 1 (no rework) |
| Date | 2026-08-03 |
| Wave | 3 — ran **in parallel with T-7** (disjoint files, both `backend/src/common/`, Jest-only verifies, no Prisma regeneration) |
| Implementer attempts | 1 |
| Effort assigned | `xhigh` |
| Skills assigned | `nestjs-expert`, **`tdd`** — Leader-assigned for this task specifically: a pure business rule with a published five-row truth table is the case where red→green earns its cost |
| Requirements covered | FR-3, NFR-7 · `design.md` §4.1, DD-1, DD-3 |

**Files changed** — `backend/src/common/consent-provenance.policy.ts` (new), `backend/src/common/consent-provenance.policy.spec.ts` (new). No call sites wired, per scope.

**Verification:** `cd backend && npm test -- consent-provenance --silent` → PASS, 9/9 tests, 1 suite. TDD honored — red confirmed first (`Cannot find module './consent-provenance.policy'`) with expected values written from §4.1 and FR-3 by hand before the implementation existed.

**Reviewer verdict — PASS**, and this audit is the strongest evidence in the run so far because the Reviewer **independently derived all five §4.1 rows from the spec text before opening the Implementer's test file**, then compared. All five matched. That satisfies the task's `Evidence is disqualified if` clause directly: the tests are traceable to the requirements rather than reverse-engineered from behavior.

The discriminating row is **row 3** — stored `GRANTED` + `NOT_RECORDED`, payload the full object as `ActorForm.tsx` actually builds it (status and method present as keys, values equal to stored) → **allowed**. A key-presence implementation returns `false` there. With all 436 live actors in exactly that state, this single row is what keeps the database editable, and the suite genuinely can fail the R-9 bug rather than merely documenting the code.

**Adjudication of the three concerns the Leader raised in the review brief** — all three resolved in the diff's favour:

| Leader's concern | Reviewer's adjudication |
|---|---|
| `if (!(field in payload)) return false;` is literally a key-presence check (R-9 re-entry?) | **Not the trigger.** It can only *suppress* condition (b), never fire it, and is provably redundant — `in` returning false implies `payload[field] === undefined`, which the next line already handles identically. The banned idiom is key presence *as the trigger*; this is a pre-filter on provenance fields, not on `consentStatus`. |
| `??` (line 107) vs `!== undefined` (line 109) asymmetry | **Load-bearing in the correct direction.** FR-3's strip scenario rejects "*or clearing `consentObtainedAt`*". Line 109 must honor an explicit `null`; had it used `??` it would fall back to the stored date and wrongly allow. `consentMethod` is non-nullable in `schema.prisma` with `@IsIn` at the DTO, so a payload cannot legitimately carry `consentMethod: null`. |
| `consentReference` in `PROVENANCE_FIELDS` (Implementer flagged as assumption) | **Spec-backed, not invented.** `requirements.md` §3 defines provenance as "method, date obtained, reference"; FR-3's trigger fires on "**any** provenance field". FR-2's "must NOT require a reference" is separately preserved — the return expression never tests `consentReference`. |

**ADVISORY findings (recorded, non-gating — no code was changed after the PASS, and none of these mints a task)**

| ID | Finding | Disposition |
|---|---|---|
| **C-1** | Line 97's `field in payload` is provably redundant and is the exact idiom **DD-3 bans by name**. Removing it is a zero-behavior-change deletion. | Recorded only. Touching audited code post-PASS would invalidate the diff the Reviewer cleared. Worth folding into a future touch of this file. |
| **C-2** | Line 107 could use `!== undefined` for symmetry with 109. | Not required by any current scenario. Recorded. |
| **C-3** ⚠️ | **Carry-forward constraint on T-3 / T-6 / T-9.** `isSameValue` treats `''` and `null` as *different*, and the final check treats `consentObtainedAt: ''` as "has a date". `ActorForm.buildDto` currently uses the `values.x.trim() \|\| null` idiom throughout, so the admin path is safe **only if T-9 keeps that idiom for the two new text fields**. The importer is the real exposure: blank spreadsheet cells arrive as `''`, and T-6 calls this predicate per row inside `applyConsentGate`. A row whose `consentReference` parses to `''` against a stored `null` fires condition (b) spuriously and **rejects an otherwise-valid legacy row — R-9's failure mode re-entering through a different door.** Additionally: T-6 must normalize the row's `consentStatus` **before** calling the predicate; a raw `'granted'` short-circuits the early return. | **Must appear verbatim in the T-3, T-6, and T-9 Implementer briefs.** |
| **C-4** | The explicit-`null` date-clear branch (lines 108–111) is the only line in the module no test exercises — and it is the branch whose asymmetry carries the whole reject semantics. `design.md` §12 places that scenario at Integration level, so it is not a T-2 done-criterion. | Recorded. Cheaper to cover in T-3 than to discover in production. |
| **C-5** | `tasks.md` T-2 and `design.md` §12 both say "table-driven"; the suite uses five discrete `it` blocks rather than `it.each`. | Substance met (all five rows, both named rows). The per-row spec citations that make the evidence auditable would be lost in a bare data table. Deviation on the record. |

---

### T-7 — Close the public boundary (hard release gate, NFR-1)

| Field | Value |
|---|---|
| **Status** | **PASS** on attempt 1, after an approved scope correction (below) |
| Date | 2026-08-03 |
| Wave | 3 — ran **in parallel with T-2** |
| Implementer attempts | 1 |
| Effort assigned | `xhigh` |
| Skills assigned | `nestjs-expert` |
| Requirements covered | FR-7, FR-8, NFR-1 · `design.md` §4.5, §6, DD-6 |

**Files changed** — `backend/src/common/pii-consent.policy.ts`, `backend/src/common/pii-consent.policy.spec.ts`, `backend/src/test/pii-boundary.spec.ts`, `frontend/lib/dashboard/csv.test.ts`.

`NEVER_PUBLIC_FIELDS = ['traderId', 'gpsAltitude', 'gpsAccuracy', 'registrationSource', 'consentMethod', 'consentObtainedAt', 'consentReference']`. `PII_ALLOWLIST` byte-unchanged and now **test-pinned** by an exact `toEqual` plus a disjointness assertion between the two constants — so a future overload of `PII_ALLOWLIST` breaks a test instead of passing silently. That exceeds DD-6's requirement.

**Verification:** `cd backend && npm test -- "pii" --silent` → PASS, 2 suites, 18 tests. `cd frontend && npm test -- csv --silent` → PASS, 1 suite, 32 tests. `npx eslint --quiet` on the three backend files → clean.

#### SCOPE CORRECTION — `/actors/geo` (approved by JuanCode, 2026-08-03)

The Implementer surfaced this in a `Not Done / Assumptions` field rather than quietly omitting it. **T-7's done-criteria named four public paths; `/actors/geo` has never existed.**

Verified three times independently — by the Implementer, by the Leader, and by the Reviewer with fresh eyes and a deliberate instruction to invert the adjudication if it found the endpoint:

1. Full route inventory of `backend/src`: the entire HTTP surface is `health`, `metrics`, `actors` (`@Get`, `@Get(':id')`), `admin/actors`, `users`, `auth`. No `geo` route, sub-route, or alternate controller.
2. Case-insensitive string search across `backend/src`: only an unrelated `gpslatitude` import fixture.
3. Case-insensitive search across all of `frontend/`: matches **only** `package-lock.json` (`@types/geojson`, a transitive Leaflet dependency).

**The Reviewer's finding that settles it:** the public map and directory reach their data through `frontend/lib/api/actors.ts` → `GET /api/v1/actors` and `GET /api/v1/actors/{id}` — **paths this suite already asserts**. So the correction is stronger than "the criterion names a nonexistent path": the surface `/actors/geo` was meant to protect *is covered*.

Decision: **descope `/actors/geo` from the criterion**, mirroring the FR-7 precedent already recorded in this spec's `requirements.md` (its admin export likewise does not exist). `tasks.md` T-7 and `requirements.md` FR-8 both amended with the rationale. When the endpoint is eventually built it inherits the assertion nearly free, because `FORBIDDEN_KEYS` iterates the union of the two constants rather than a hand-maintained literal.

**TRD drift recorded, out of scope for this spec.** `docs/trd/trd.md` documents `/actors/geo` in its API-surface table (§157), map description (§179), tactics (§286), and quality-attribute scenarios QA-1 and QA-6, as though implemented. That divergence pre-dates this spec and belongs to `/akili-audit`.

**Reviewer verdict — PASS.** The finding that matters most is **not** about the tests: `role-aware.serializer.ts:80-91`'s `toPublic` is a literal object construction over seven named keys — no spread, no `delete`, no `Object.assign`, no dynamic key copy — with `PublicActor` as the return type, so an accidental extra key is a **compile error**, not a runtime leak. A column added to Prisma tomorrow is invisible to the public unless someone deliberately types its name in. The tests are correctly positioned as *detection over a structurally sound mechanism*, which is the right relationship and is what FR-8's "must NOT be achieved by omitting them from one serializer while another read path selects `*`" demands. The Prisma reads do select `*`; that is harmless precisely because the pick is downstream and total.

The Reviewer also confirmed the value assertions are **mutation-sensitive and free of false positives**: it enumerated the actual public response body and checked every sentinel against it. `'2026-02-14'` can only appear via a genuine provenance leak, because `PublicActor` emits no date field at all. It named the choice of non-default fixture values "the single best judgement in the diff" — with the live defaults (`TEAM_MANAGED`/`NOT_RECORDED`/`null`/`null`, which all 436 rows carry) the assertions would have passed vacuously.

**ADVISORY findings (recorded, non-gating)**

| ID | Finding | Disposition |
|---|---|---|
| **D-1** | `gpsAccuracy`'s **value** is not value-asserted. `LEAKABLE_PII_VALUES` covers `traderId` and `gpsAltitude` but not `gpsAccuracy`, whose fixture value is a bare `5` — unassertable, since `35.7416` contains it. The done-criterion does say "any name **or its value**". | Pre-dates this diff. One-line fix using the technique the Implementer already applied correctly to the four new fields: give the fixture a distinctive sentinel (e.g. `7.7331`) and add it to the list. Fold into a later touch of this file. |
| **D-2** | `expect(collectForbiddenValues(wire)).toHaveLength(0)` is unreachable-by-construction — `expectNoPiiKeys` throws on the first forbidden key one line earlier. | Cosmetic. Reads like the value check when the real one is the `LEAKABLE_PII_VALUES` loop below it. |
| **D-3** | `pii-boundary.spec.ts:276-278` claims to "mirror production bootstrap exactly" but constructs `new ValidationPipe(...)` directly instead of the shared `createValidationPipe()` (`backend/CLAUDE.md`'s two-entrypoint rule). | Pre-existing code, untouched by this diff, irrelevant to PII. The **comment** overstates. Flagged so it is not later mistaken for a T-7 regression. |
| **D-4** | `SerializableActor` explicitly declares every *other* never-public column under "Non-public columns — accepted on input, NEVER emitted", but the four new fields were not added there. | **Not a defect** — `design.md` §4.5 mandates "no change" to that file and the Implementer followed the design. Structural safety is unaffected. Noted only: the file's own documentation convention now under-declares by four, and they belong there if a future task touches that interface. |

**Process note.** The Implementer reported this gap in a `Not Done / Assumptions` field instead of silently narrowing scope, which is what allowed it to be adjudicated properly rather than discovered at release. Per `/akili-execute` Step 2.3.0 the task was held out of `[x]` until the user decided, even though the Reviewer returned PASS.


---

### T-3 — Wire provenance into admin create and update

**Status:** `[x]` PASS · **Wave 4** (solo — `actors-admin.service.ts` is the backend's most central file; nothing parallelisable until T-4/T-6)
**Implementer:** `akili-implementer` (T2 / sonnet, effort `xhigh`) · attempt 1, no rework
**Reviewers:** parallel lens mode (4R) — effort `xhigh` on a data-integrity surface. `rev-T3-conformance` (T3 / opus, spec conformance + reliability) and `rev-T3-risk` (T3 / opus, risk + resilience). **Both PASS, reached independently.**

**Diff:** 7 files, +600 / −4. Beyond the task's Files list: `actor-audit.service.ts`, `actors-admin.service.spec.ts`, `actor-audit.service.spec.ts`.

#### The two named risks, and how they were actually closed

**R-1 — silent persist.** The four names are in `SCALAR_FIELDS` (`actors-admin.service.ts:79-82`) and consumed by `buildScalarData`'s loop (`:510-520`). What makes the criterion *proven* rather than merely asserted: the e2e harness's Prisma mock is a **real store** — `create` pushes `args.data` into an array (`admin-actors-crud.e2e.spec.ts:382-396`), `update` merges into the stored row (`:397-407`), `findUnique` reads back out of it (`:363-366`). Remove any one name and the follow-up `GET` returns `undefined`. Both Reviewers verified this independently against the mock's source; neither accepted the read-back at face value. `whitelist: true` (`validation-pipe.ts:93`) adds a second witness — an undeclared property would be stripped before the service saw it.

**R-9 — the total-outage risk (436/436 live rows are `GRANTED` + `NOT_RECORDED`).** `rev-T3-risk` traced the ordinary admin edit end to end against the real emitter, not the test's imitation: `ActorForm.buildDto()` sends a full object with `consentStatus: 'GRANTED'` and **none** of the three provenance keys (T-9 has not landed) → `transitionsIntoGranted` false → `provenanceValueChanged` false, guarded twice (`!(field in payload)` **and** `submitted === undefined`, the latter catching the classic `PartialType`-materialises-`undefined` trap) → write proceeds. `rev-T3-conformance` independently diffed the e2e body key-by-key against `buildDto()` (`ActorForm.tsx:186-207`): the same 18 keys, `acknowledged` correctly absent because `needsAcknowledgement()` returns `false` when the initial status is already `GRANTED`. The body carries `consentStatus: 'GRANTED'` — which is exactly what makes the test discriminating, since a key-presence implementation fails it.

#### Five open questions the Leader put to the Reviewers — two resolved against the design doc, not the code

1. **Create-path guard placement.** §4.2's create cell asks for two things that cannot both hold: "beside the existing `acknowledged` check (~L137)" **and** "inside the transaction" — that check has always been outside, and `$transaction` does not open until `:159`. On create `stored` is `null`, the predicate is a pure function of the payload, and §4.1's concurrency assumption is explicitly about the `before` read, so there is no read-then-decide window to race. Both Reviewers ruled: **conformant; the text is self-contradictory and should be corrected.** Placing it at `:149-154` also avoids a Cognito `resolveActing` lookup on a rejected write.
2. **Three files beyond the Files list — necessity, and `design.md` §4.6 is factually wrong.** §4.6 states the fields "flow through the existing diff machinery ... unchanged". `AUDITABLE_FIELDS` (`actor-audit.service.ts:32-57`) is a **hardcoded literal** driving both `buildDiff` and `buildSnapshot`. Had the Implementer taken §4.6 at its word, **NFR-6 would be silently unmet with the whole suite green.** Two facts place this inside the spec's own boundaries: §12's test plan already assigns NFR-6 to `actor-audit.service.spec.ts`, and T-4's Files list already names `actor-audit.service.ts`. The two fixture edits are compile-forced — `AdminActor` gained two *required* properties. Fixtures were set to the Prisma defaults, making a bare `fixtureActor()` a legacy `GRANTED` + `NOT_RECORDED` row: the R-9 shape.
3. **The modified pre-existing unit test — correctly updated, coverage net-increases.** `'allows GRANTED transition when acknowledged is true'` asserted behaviour FR-3 now forbids. The allow-case was kept (with provenance added) *and* a new reject-case added asserting neither `actor.update` nor `actorAuditLog.create` fires. One test in, two out.
4. **The hand-built 400 envelope — exact match**, byte-for-byte with `createValidationPipe()`'s `exceptionFactory` (`validation-pipe.ts:97-102`), using the exported `FieldErrorDetail` type. Noted as *better* than the prevailing service-layer idiom: the neighbouring `acknowledged` rejections throw `new BadRequestException('string')`, which yields no `details` array and maps to no inline field.
5. **Deficient-fields-only reporting — matches FR-3**'s "naming the missing field" (singular). `rev-T3-conformance` further proved `details: []` is unreachable: the predicate returns `false` only under the exact conditions `buildProvenanceError` pushes a detail for, computed from the same merge.

#### `DATE_FIELDS` — a correctness fix the task would otherwise have shipped broken

`valuesEqual` (`actor-audit.service.ts:325-336`) compares with `===` and has no `Date` branch. In production Prisma returns a fresh `Date` on both the `before` and `after` refetch, so **every unrelated update** to an actor with `consentObtainedAt` set would emit a spurious diff — and defeat the empty-diff skip at `:154-156`, writing an `UPDATE` audit row for a genuine no-op. The fix sits in `serializeValue`, the single funnel for both `buildDiff` and `buildSnapshot`. `consentObtainedAt` is the only `Date`-typed member of `AUDITABLE_FIELDS`, so the fix is complete.

#### Verification

Implementer: `admin-actors` 67/67 · `lambda-handler` 2/2 (release gate — DTO changes cross the serverless-http parse path supertest does not exercise) · `npx eslint "src/**/*.ts" --quiet` clean · `npm run build` clean · full suite `1 failed, 404 passed, 405 total`.

**Leader-run, after both Reviewers reported (tree quiet):** `rev-T3-risk` found the task's own verify command is **insufficient** — the pattern `admin-actors` does not match `actors-admin.service.spec.ts` or `actor-audit.service.spec.ts` ("actors-admin" ≠ "admin-actors"), so the two modified unit specs were outside it. Re-measured explicitly:

```
PASS src/common/consent-provenance.policy.spec.ts
PASS src/actors/actor-audit.service.spec.ts
PASS src/actors/actors-admin.service.spec.ts
PASS src/test/pii-boundary.spec.ts
PASS src/test/admin-actors-crud.e2e.spec.ts
Test Suites: 5 passed, 5 total
Tests:       123 passed, 123 total
```

Known-red unchanged and unrelated: `common/generate-template.spec.ts` byte-match, owned by **T-6** (T-5 widened `TRADER_TYPES`, which feeds `template-columns.ts`'s allowed-value lists, so the committed `v1` asset cannot match a fresh generation until T-6 regenerates it and bumps `TEMPLATE_VERSION`). Baseline moved 388 → 404 passed, no other regressions.

#### ADVISORY findings (recorded, non-gating — no advisory mints a task)

| ID | Finding | Disposition |
|---|---|---|
| **E-1** | **C-3 confirmed at the DTO layer, not discharged.** `@IsOptional()` skips only `null`/`undefined`, so `consentReference: ''` passes validation and reaches `isSameValue('', null)` → "changed" → condition (b) fires → a legacy `GRANTED` actor is rejected `400`. Asymmetrically, `consentObtainedAt: ''` is rejected at the DTO by `@IsDateString()`. Nothing ships it today — `buildDto` uses `values.x.trim() \|\| null` throughout. | **Carry-forward to T-6 and T-9 briefs, verbatim.** `rev-T3-risk` notes the cheapest structural close is a `@Transform(({value}) => value === '' ? null : value)` in `actor-create.dto.ts` — i.e. in T-3's own file — rather than a discipline requirement on two future tasks. **Flagged, not applied:** applying it now would widen T-3 after PASS. Raise with the user before T-9. |
| **E-2** | **Date-only strings are a `500`, not a `400`.** Found by `rev-T3-conformance`, independently confirmed by `rev-T3-risk` via full code trace: `@IsDateString()` is `isISO8601` and accepts `"2026-01-01"`; no `@Type(() => Date)` transforms it; Prisma's `DateTime` requires a full RFC-3339 instant and raises `PrismaClientValidationError`, which is **not** a `PrismaClientKnownRequestError`, so `mapPrismaError` (`:552-565`) rethrows and Nest renders a 500. `IsNotFutureDate` does not rescue it — `new Date('2026-01-01')` parses fine. | **Unreachable today; live the moment T-9 lands**, since `<input type="date">` emits exactly `YYYY-MM-DD`. **Must be in T-9's brief explicitly.** T-3 is not at fault — §4.3 prescribed `@IsDateString`. The same `@Transform` closes E-1 and E-2 together. |
| **E-3** | `IsNotFutureDate` compares against `Date.now()` in UTC. A date-only value parses as UTC midnight, so an admin at UTC+3 recording "today" between 00:00 and 03:00 local gets a spurious "must not be a future date". | Cosmetic, but it lands on the one field this spec exists to collect. Note for T-9. |
| **E-4** | `'SELF_REGISTERED' as never` casts in `actors-admin.service.spec.ts` (~L151-154, L196-197). Not masking a real contract gap — the fields are properly declared, `Object.values()`-derived enums are string-literal unions that would typecheck unaided, and the e2e proves acceptance over HTTP under `whitelist: true`. | Real minor erosion: the casts disable checking on precisely the fields under test. The `consentStatus: ConsentStatus.GRANTED` line two rows above shows the right idiom. Fold into a later touch. |
| **E-5** | Minor DD-1 tension: `actors-admin.service.ts:249-253` recomputes the effective-value merge that the policy already computes internally (`consent-provenance.policy.ts:107-111`), purely to build the error *message*. | Drift yields a misleading `400` detail, never a wrong decision — NFR-7 holds, the *decision* has exactly one implementation. If T-4 needs the same message, have the policy return the failing fields instead of re-deriving at a third call site. |

**Design-doc defects for `/akili-audit` (not this spec's to fix):** `design.md` §4.6's "flows through unchanged" claim is false about `AUDITABLE_FIELDS`, and §4.2's create cell prescribes a self-contradictory placement. Both were caught only because the Reviewers were asked to rule on the text rather than assume it. Recorded here so the code is not later mistaken for drift from the design.

**Process finding — Reviewer delivery failure is now systematic, not anecdotal.** Four of four Reviewers this run (`rev-T5`, `rev-T1`, `rev-T3-conformance`, `rev-T3-risk`) went idle **without delivering a report body**, each recovered by an explicit `SendMessage` resend request. Every brief since T-1 has carried the instruction "deliver your verdict as a normal reply containing the full audit text and the `STATUS:` line" and it did not prevent recurrence. Each resend was explicitly scoped "do NOT re-run the audit — resend the verdict you already reached, and if you did not complete it, say so plainly" so that no verdict is reconstructed post-hoc. **For the Kaizen log.**

---

### T-4 — Bulk set-consent: batch provenance that fills without overwriting

**Status:** `[x]` PASS on **attempt 2** · **Wave 5** (parallel with T-6; disjoint file lists verified before dispatch)
**Implementer:** `akili-implementer` (T2 / sonnet, effort `xhigh`) — attempts 1 and 2
**Reviewers:** parallel lens mode (4R), all T3 / opus. Attempt 1: `rev-T4-conformance` **FAIL**, `rev-T4-risk` **FAIL** (same defect, reached independently). Attempt 2: `rev-T4b-conformance` **PASS**, `rev-T4b-risk` **PASS**.

**Diff (cumulative):** 7 files, +838 / −41.  Beyond the task's Files list: `admin-actors.controller.ts` (must thread the new fields or the feature is unreachable over HTTP) and `actors-admin.service.spec.ts` / `actor-audit.service.spec.ts` (the old 4-arg signature and 3-key envelope were asserted throughout). Both Reviewers ruled these mechanical consequences of the signature change the work order itself mandates.

#### Attempt 1 — FAIL, and why the effort dial was deliberately NOT bumped

The partition predicate was `consentMethod === NOT_RECORDED` **alone**. An actor with a **recorded method but a null `consentObtainedAt`** was classified "already evidenced", received the status-only write, and ended `GRANTED` with no date — FR-3 violated silently on the very path FR-3 exists to close, leaving the actor publicly visible with no recorded consent date.

Two independently-traced reachability paths:
1. **Create/import** `{consentStatus: 'UNKNOWN', consentMethod: 'EMAIL'}` with no date. `isConsentProvenanceSatisfied` early-returns `true` (effective status ≠ `GRANTED`), every DTO field is `@IsOptional`, and `SCALAR_FIELDS` persists the method. On the import path this is the *plausible data-entry shape*: method column filled, date column blank.
2. **Un-publish-then-strip**, which `design.md` §4.1 row 5 **explicitly permits** — clearing only the date leaves `DENIED` / `SIGNED_FORM` / `null`. The risk Reviewer called this "the stronger of the two… reachable purely through paths the spec blesses."

**The root cause is a document contradiction, not under-thinking.** DD-4's decision text says option (d) *"fills only where provenance is **missing**"*; `NOT_RECORDED` appears only as R-8's shorthand at `design.md:322`. The Implementer followed the shorthand. The conformance Reviewer's own words: *"a defensible reading of DD-4's shorthand colliding with FR-3's normative MUST, not carelessness."*

**Leader deviation, recorded:** the rework rule says bump effort one level on retry. **I did not.** That rule assumes the failure was under-thinking; here the failure was an ambiguous specification, which a sharper brief fixes and a higher dial does not. Attempt 2 ran at the same `xhigh` with a brief carrying the adjudicated design. It passed both lenses first time.

**Second attempt-1 finding (risk lens):** `actor-audit.service.ts` was modified but **its own suite never ran** — `admin-actors`, `actors-admin`, and `lambda-handler` are path regexes and none matches `actor-audit.service.spec.ts`. Attempt 2 ran it: 22/22. This is the second time this run that a work order's verify command failed to cover what the task changed (see T-3).

#### The adjudicated design (Leader ruling, adopted verbatim from the risk Reviewer)

Widening the fill set creates a new sub-case: a row with a **real recorded method** but a missing date. Applying the batch's generic method there would be exactly DD-4's rejected option **(c)** — *"silent, spec-sanctioned destruction of exactly the audit trail this spec exists to create."* Both Reviewers ruled it out. **Fill only the genuinely missing fields per row; never overwrite a recorded value.**

Implemented as: partition on `missingMethod || missingDate`; build a per-row patch containing only that row's missing fields; group rows by the patch's sorted key set into bounded `updateMany` calls (**≤7** — 6 fill shapes + preserved; my brief said ≤5, my arithmetic was wrong, the property that mattered is boundedness independent of batch size versus a per-row loop against the 500-id cap); and replace `logBulkConsent`'s single `fill` argument with a **per-actor patch map** built once and handed to both the write and the audit.

**`preserved` contract (Leader ruling):** stays *"received no provenance write at all"* — the fully-evidenced group — documented in the interface doc comment. A date-fill row is neither preserved nor fully filled; a third counter was not worth the envelope churn. The conformance Reviewer independently validated the related sub-ruling (a row missing **only** its reference stays preserved) against text I had not cited: FR-2 says *"it must NOT require a reference — `consentReference` is optional evidence-locating text, not a key."* A `null` reference is its own reference.

#### Attempt 2 — what the two lenses verified

**The audit mirrors the write by construction, not by inspection.** `patches.set(row.id, patch)` and the group's `data: {consentStatus, ...patch}` are the **same object reference**, built in one loop iteration; `logBulkConsent` consumes that same map and only ever *suppresses* an entry when `from === to`. The risk Reviewer checked each suppression and proved none can fire on a written field: `consentMethod` patched only when the row is `NOT_RECORDED` and the batch cannot be; the date only when stored is `null` against a non-null string; the reference only when stored is `null`. So every field written yields exactly one audit entry and no entry names an unwritten field.

**Grouping is collision-free, disjoint, total, bounded.** Two rows sharing a key were missing the identical field set and get identical `data`. An empty patch is unreachable (reaching patch construction requires a missing field, which sets a key). `preservedIds ∪ ⋃groups[].ids = foundIds`, each id exactly once.

**The tests are genuine regression tests.** The risk Reviewer diagnosed why attempt 1 escaped — *"every fixture in the suite is either fully evidenced or fully unevidenced"* — and then verified the fix closes it, testing both plausible reverts: revert the predicate to method-only ⇒ two fixtures flip to `preserved: 1`, failing exact-args assertions; revert the patch map to a shared `fill` ⇒ exact `changes.fields` `toEqual` assertions gain a phantom `consentMethod`. **Both fail.** Three partial fixtures were added (recorded method + null date; recorded method + null date + own reference; `NOT_RECORDED` + own reference `OWN-REF-1`).

**Zero rows on rejection** holds and is stronger than a read-back: the gate precedes `resolveActing`, `findMany`, and `$transaction`, and unit tests assert `findMany`/`updateMany`/`createMany` were **not called**. DD-2's two gates remain independent. The audit `createMany` is awaited *before* the writes inside the same `$transaction`, so there is no write-without-audit path.

#### Verification

Attempt 2: `admin-actors` 69/69 · `actors-admin` 43/43 · **`actor-audit` 22/22** (the suite attempt 1 never ran) · `npx eslint "src/**/*.ts" --quiet` clean · `npm run build` clean · full suite **437/437, 37 suites** (baseline 427; +10 new tests).

#### ADVISORY findings (recorded, non-gating — no advisory mints a task)

| ID | Finding | Disposition |
|---|---|---|
| **F-1** ⚠️ | **`requirements.md:146` and `design.md:250` now contradict the correct code.** Both still say batch provenance is *"applied **only** to the actors whose `consentMethod` is `NOT_RECORDED`"* — attempt 1's partition. The risk Reviewer: line 146 is *"irreconcilable with line 150 and FR-3's core rule at line 112"* for the recorded-method/null-date row. **Leaving it unamended guarantees the next auditor re-litigates this.** | **Raised to the user as a recommended spec amendment** ("fills only the provenance fields a row is actually missing"). Not silently edited: amending an acceptance criterion is the user's call under `gated` approval, and I have already amended two documents this run only with explicit approval. |
| **F-2** | **Concurrency (carried from attempt 1's ADVISORY-2).** The partition derives from the transaction's `findMany` snapshot while `updateMany … WHERE id IN (…)` re-evaluates against the latest committed row version, so a concurrent individual `PATCH` recording evidence between snapshot and write is overwritten. Reassessed after the fix: rows exposed grew, but fields written per row shrank to only the missing ones — **not materially worse**, so it stays advisory. | Cheap structural close if ever wanted: add the missing-field predicate to each group's `where` (`consentMethod: NOT_RECORDED` / `consentObtainedAt: null`), making each write verify against the current row. Would decouple audit rows from rows actually updated, so count reporting needs its own thinking. |
| **F-3** | **Fixture-shape brittleness** (`actors-admin.service.ts:480`): `missingDate` uses `row.consentObtainedAt === null` on the raw Prisma row, while `consentReference` three lines below tests `=== null \|\| === undefined`. Raised by the conformance lens; I asked the risk lens for a blocking-vs-advisory ruling rather than deciding on preference. | **Ruled ADVISORY.** `undefined` is unreachable in production — the `findMany` has no `select`, so Prisma materialises every scalar; and a future selective read omitting the field would be a **compile error, not a silent `undefined`**. Exposure is confined to test doubles, where the danger runs the *other* way (a fixture omitting the key would make a test pass on a shape that should have caught a bug — a detection weakness, not a destruction path). Carry-forward: `== null` plus normalising the reference test, folded into the next change touching `bulkSetConsent`. |
| **F-4** | Test gap in grouping: no single call exercises ≥2 **distinct** fill groups together, and the "bounded independent of batch size" claim is unasserted. | A 3-actor batch (date-only-missing, method-only-missing, fully evidenced) would test the collision hypothesis directly. Three reachable partition shapes also lack tests, per the conformance lens. |
| **F-5** | **Date-only ISO strings reach Prisma raw** — `@IsDateString()` accepts `'2026-07-01'`, handed unchanged to a `DateTime` column and recorded verbatim in the audit `to`. Shared with T-3's merged create/update path, **not introduced here**. | Same root as **E-2**. Becomes reachable when T-9/T-10 wire an `<input type="date">`. **Must be in T-9's brief** — see E-2's disposition. |
| **F-6** | Duplicated `IsNotFutureDate` decorator: `bulk-consent.dto.ts` is a byte-identical copy of `actor-create.dto.ts`'s, so FR-2's not-in-the-future rule now has two implementations that can drift — the failure mode NFR-7 exists to prevent for FR-3. | Follow-up: export one decorator from `backend/src/common/` and import it in both DTOs. |
| **F-7** | Reference-fill asymmetry: a `null` `consentReference` is filled for fill-set rows but not for preserved rows. | Defensible and documented ("preserved means provenance is untouched"), but the same missing field is treated two ways within one batch. Noted. |

**Breaking contract change — deploy constraint, not a merge constraint.** Confirmed independently by both lenses at `frontend/app/(admin)/admin/actors/page.tsx:384-386`: `handleUnlockConfirm` sends `{ids, consentStatus:'GRANTED', acknowledged:true}` with no provenance, and `frontend/lib/api/actors-admin.ts` declares neither the new input fields nor `preserved`. **Every admin bulk unlock returns 400 until T-10 lands.** `design.md` §7/§9 anticipate exactly this (*"a clean, legible 400 on one admin action"*) and `tasks.md`'s PR strategy states it. Shipping T-4 before T-10 is spec-sanctioned; **deploying PR 1 to a live environment without PR 2 in the same window is not.** Surfaced to the user.

---

### T-6 — Template columns, version bump, and per-row import enforcement

**Status:** `[x]` PASS on **attempt 2** · **Wave 5** (parallel with T-4; disjoint file lists verified before dispatch)
**Implementer:** `akili-implementer` (T2 / sonnet, effort `xhigh`) — attempts 1 and 2
**Reviewers:** parallel lens mode (4R), all T3 / opus. Attempt 1: `rev-T6-conformance` **PASS**, `rev-T6-risk` **FAIL**. Attempt 2: `rev-T6b-risk` **PASS** (single lens — see the dispatch note below).

**Diff (cumulative):** 6 source files, +734 / −26, plus the regenerated binary `frontend/public/templates/actor-import-template.xlsx` (10,373 → 10,864 bytes). Beyond the Files list: `actor-import.service.spec.ts` — two pre-existing tests built `GRANTED` rows with no provenance and now correctly fail, so the fixture update was forced.

**This task also cleared the run's known-red suite.** T-5 (merged) widened `TRADER_TYPES`, which feeds `template-columns.ts`'s allowed-value lists, so the committed `v1` asset could no longer byte-match a fresh generation. The regeneration + `v2` bump closes it. Baseline moved 405 → 437 tests, all green.

#### The split verdict, and the Leader adjudication it required

Conformance returned **PASS** on all four done-criteria; risk returned **FAIL** on two issues, both inside the new `parseConsentObtainedAt`. **I ruled both in scope.**

**Issue 1 — the serial branch had no plausibility bound.** Any bare number in the *Consent Obtained At* cell was silently converted to a date and accepted as consent evidence. Two consequences, and the first is the one that decided it:

- **Silent fabricated evidence.** `2026` → `1905-07-18`; `15` → `1900-01-13`; **`0` — which a formula over an empty reference produces routinely** — → `1899-12-30`. Each satisfied the gate with no error and no warning: the row previewed as `create` and committed, **publishing a `GRANTED` actor whose evidence date was manufactured by a parse.** That is this spec's core failure arriving through the format layer instead of the policy layer.
- **Loss of per-row isolation at commit.** `20260115` — a plausible way to type `2026-01-15` without separators — maps to year ≈ 57,369. `Number.isNaN` is false, so the function returned `toISOString()`'s **expanded-year** form (`+057369-…`), which is not RFC-3339. Prisma raises `PrismaClientValidationError` *inside* the commit transaction, the chunk `catch` swallows it, and **all up to 100 rows in that chunk fail** with an opaque message — after a preview that reported them all as clean creates. The conformance lens had filed this as advisory A-1; the risk lens elevated it and corrected the mechanism (the failure is Prisma's, before MySQL's).

**Issue 2 — no not-in-the-future check**, unlike both other write paths. `2030-01-01` imported cleanly as satisfied provenance.

**Leader scope ruling on Issue 2, recorded because the Reviewer explicitly offered the opposite.** It noted FR-5 mandates FR-3 parity explicitly and FR-2 parity only by implication, and offered to push this to a follow-up. **I kept it in scope**, on consequence rather than letter: once such an actor exists, an Admin editing *any* unrelated field through `ActorForm` (which submits the full object) receives a `400` from `@IsNotFutureDate` and **cannot save the record** — R-9, this spec's named top risk, re-entering through the import door. And the remediation was the same three lines in the same function, so splitting it would have cost more than fixing it. It widened no file list.

**Leader deviation, recorded (same as T-4):** the rework rule says bump effort one level on retry. **I did not.** The defect was an unspecified plausibility window, not under-thinking. Attempt 2 ran at the same `xhigh` and passed first time.

**Dispatch note — attempt 2 was re-reviewed by one lens, deliberately.** Conformance had already cleared all four criteria on attempt 1, and the rework was confined to `parseConsentObtainedAt` plus two one-liners. A second conformance pass would have been symmetry, not need; I folded the one conformance-flavoured question (whether the e2e lock makes criterion (4) regression-proof) into the risk brief instead.

#### What attempt 2 changed, and what the re-audit verified

Named constants `MIN_PLAUSIBLE_EXCEL_SERIAL = 36526` (1 Jan 2000) and `EXCEL_EPOCH_UTC_MS`; the full-instant branch now round-trips through `new Date(raw)` instead of echoing its input; and a shared `accept(parsed)` helper on **all three** branches rejecting `NaN` or `> Date.now()`.

The Reviewer probed thirteen inputs and confirmed **no reachable throw** — `toISOString()` is only called after the `NaN` guard, so the `RangeError: Invalid time value` leg is unreachable. `46023` stays valid, `46023.5` keeps time-of-day semantics, negatives never reach the epoch arithmetic (the `^\d+` regex bars the sign), and `2026-13-45T99:99:99Z` is now closed.

**It also corrected me.** I had asked whether a magnitude ceiling was needed *in addition* to the future check, suspecting the expanded-year leg was only partly closed. It ruled no, and showed why the set is provably empty: expanded ISO form needs year `< 0` or `> 9999`; the negative side is unreachable because the digit-only regex rejects the sign *before* `Number()`, and the positive side needs a serial implying ~year 10000, necessarily `> now`. Adding a ceiling would be a second guard over an empty set. It noted the closure is *implicit* and suggested a comment recording the dependency instead — cheaper than the guard.

**`MIN_PLAUSIBLE_EXCEL_SERIAL` does not overshoot**, which I had flagged as a risk of its own (rejecting legitimate older data is a different bug, not a win). 36526 is arithmetically exactly 2000-01-01 off the 1899-12-30 epoch, and the bound applies **only to the bare-number branch**: an old date typed as text (`1998-05-01`) goes down the date-only branch, unbounded; a real Excel date-formatted cell arrives as a `Date` and takes the full-instant branch, also unbounded. The only data it can reject is an un-formatted bare number below 36526 — a mistyped year, day, or `0`.

**The `parsed.toISOString()` change is unobservable**, for a more specific reason than the Implementer gave: the branch's dominant source is `cellToString`, which itself produced the string via `toISOString()`, so the round-trip is byte-identical; offsets were never accepted (the regex requires a literal `Z`); and sub-second truncation is moot because **T-1's migration created the column as `DATETIME(3)`**, so MySQL truncates to milliseconds regardless.

**The e2e lock is real, not nominal.** `TEMPLATE_HEADERS.slice(0, 20)` is exactly the pre-T-6 header set, so the fixture genuinely fails `headerMatches`; move the version check back after `locateDataSheet` and the test flips to the generic "no Data sheet" 400 and fails on both `/out of date/i` and `/re-download/i`. And it runs in the **default `npm test` gate** (jest `testRegex` covers `.spec.ts` under `rootDir: src`), not only under `test:e2e`.

**Regression re-check — every attempt-1 clearance holds**, including a check the Reviewer ran unprompted: `applyConsentGate`'s early exit changed from `!row.create?.consentGranted` to `!row.create`, so the predicate now runs for `DENIED`/`UNKNOWN` rows too — safe, they return `true` at the policy's first branch. It also proved `buildProvenanceRowErrors` can never return an empty array on a real failure, so there is no reason-less `failed` row.

#### Verification

Attempt 2: `npm run generate:template && npm test -- "template|import" --silent` → 6 suites, **93/93** · `lambda-handler` 2/2 · `npx eslint "src/**/*.ts" --quiet` clean · `npm run build` clean · full suite **437/437, 37 suites**. Asset md5 `33a2d8c2a0e27465b20ccf537dadfc06` — **unchanged from attempt 1** (the rework touched only validation logic and tests), **independently confirmed by the Leader** against the committed file.

#### ADVISORY findings (recorded, non-gating — no advisory mints a task)

| ID | Finding | Disposition |
|---|---|---|
| **G-1** ⚠️ | **The date-only branch still has no lower bound.** `0026-01-15` — a realistic typo — is past, well-formed, accepted, and written. MySQL's `DATETIME` range starts at `1000-01-01`, so this is the **last input class the in-memory Prisma mock cannot adjudicate.** | Deliberately **not** a FAIL, and the reasoning is worth preserving: the admin path accepts the same value (`@IsDateString` + `IsNotFutureDate` have no lower bound either), so the importer is now *exactly* as strict as the write paths FR-5 tells it to match. **Tightening only the importer would be an unspecified divergence.** The right fix is a shared minimum in the policy/DTO layer, owned by a task that covers all paths. |
| **G-2** | **The rejection message conflates three faults.** A future `2030-01-01`, a bare `2026`, and `"March"` all report *"Consent Obtained At must be a valid date."* Telling an admin that a well-formed date is not a valid date is the same legibility problem FR-5 objects to for stale templates. | Distinct messages cost nothing. Worth scheduling with G-1. |
| **G-3** | **E-3's timezone issue now lands on the field-staff path.** Tanzania is UTC+3; a date-only "today" parses as UTC midnight, so between 00:00 and 03:00 EAT a spreadsheet carrying today's date fails the row. | Inherited from `IsNotFutureDate` and consistent by design — but the importer is where "today" is the most common entry. Note for T-9 alongside E-3. |
| **G-4** | **Time-bomb fixture.** The future-date e2e hardcodes `'2030-01-01'`; on 2030-01-02 that row becomes valid and the test inverts. | Derive from `Date.now()` instead. |
| **G-5** | **Silent month rollover.** `2026-02-30` is accepted and stored as `2026-03-02` — ES ISO parsing range-checks the day 01–31 but not against the month. Not fabricated evidence, but not the date the admin typed. | Recorded. |
| **G-6** | Version detection was "best effort" (NFR-8) and is now a **blocking 400**, including for a *newer* stamp (*"out of date (found v3, current is v2)"*). | Mitigated in practice: the labelled `Template version: vN` match always overrides a stray bare token, and the generator writes the labelled form. |
| **G-7** | Ordering nit: version detection now precedes the `MAX_DATA_ROWS` cap, mildly inverting the intent commented at `actor-import.service.ts:179`. | Harmless — it walks only the Instructions sheet, and `workbook.xlsx.load` has already materialised the file. |
| **G-8** | The **unit-spec** version test is now self-referential (`toBe(TEMPLATE_VERSION)` against a workbook stamped with `TEMPLATE_VERSION`) — it passes for any value. The Implementer flagged this honestly as a declined residual, correctly per my scoping ("the e2e fixture"). | Redundant rather than wrong; the dedicated mismatch test and the e2e `slice(0,20)` lock carry the real assertions. Leaving it is fine. |
| **G-9** | `generate-import-template.ts:62`'s Instructions prose still lists the dropdown columns without *Registration Source* and *Consent Method*, on the sheet field staff actually read. | Cosmetic — criterion (2) holds via the per-column table. **Deliberately deferred:** the fix changes asset bytes and must be batched with a regeneration, which would have invalidated the byte-match mid-review. |

**Structural verification gap — recorded for `/akili-audit`, not expanded into this task.** Both test harnesses use an in-memory Prisma mock (`backend/CLAUDE.md`'s stated e2e convention), so **nothing in the repo verifies that the string this parser emits is accepted by real Prisma/MySQL.** I proposed recording it rather than widening T-6 and asked the Reviewer to disagree if that was wrong; it agreed, on stronger grounds than mine: the attempt-1 defect class is now closed **by construction** — every accepted string is `toISOString()` of a valid instant in `[2000, now]`, inside `DATETIME(3)`'s range — so the mock's blindness no longer conceals a known-bad value. A real-DB harness is test-architecture work, and dev RDS is reachable (see §1.1) whenever it is scheduled. **G-1 is the concrete form this finding should take.**

---

### T-8 — Surface source and consent in the admin actors table

**Status:** `[~]` — **code complete and PASSed by both lenses; blocked on the D-h human visual check** (see below). Not `[x]`: the work order requires that check *before* the task is called done, and a checkbox without it would be exactly the unfalsifiable completion this methodology forbids.
**Implementers:** `akili-implementer` (T2 / sonnet). `impl-T8` (frontend, effort `xhigh`) · `impl-T8-api` (backend increment, effort `high`) · `impl-T8b` (rework, effort `xhigh`).
**Reviewers:** parallel lens mode (4R), all T3 / opus. Attempt 1: `rev-T8-conformance` **FAIL**, `rev-T8-risk` **FAIL**. Attempt 2: `rev-T8b-conformance` **PASS**, `rev-T8b-risk` **PASS**.

**Diff (cumulative):** 10 files, +1196 / −126 — 6 frontend, 4 backend.

#### Why three backend files appear under a Phase-C UI task (recorded so it is not read as scope leakage)

The frontend Implementer reported that the admin list query accepted only `region`, `traderType`, `consentStatus`: **`registrationSource` and `consentMethod` were neither validated nor filtered server-side**, making T-8's own done-criterion — FR-9's enumeration filter — **unachievable within its assigned file list**. They reported it rather than papering over it with a client-side filter, which is what allowed it to be adjudicated.

**`design.md` §3 already specified it** (the `GET /api/v1/admin/actors` row: *"query gains `registrationSource` + `consentMethod` filters"*), and `requirements.md` §14 already assigns FR-9 to *"T-8 (enumeration filter)"*. Only `tasks.md`'s **Files** list omitted it. So the design was correct and the **decomposition** was the defect — a sharper finding than a design gap, because a spec that specifies without assigning produces exactly this silence.

**Leader ruling:** dispatched a second Implementer for the backend increment rather than minting a new task. The conformance Reviewer independently endorsed this and named the alternatives' costs: minting a task would have created a Phase-C task that Phase-B logically owns, with T-8 blocked on it — the same work, one extra round-trip, and a dependency graph contradicting §14. The other options were leaving T-8 permanently unachievable, or recording a PASS whose criterion held only at mock level.

#### Attempt 1 — FAIL on both lenses, for two different defects

**Risk lens — a URL-borne invalid filter dead-ended the page.** Moving all five filters into the URL (see below) exposed three enum params to unvalidated casts. A `?consentMethod=NOT_A_METHOD` — a typo when sharing, or a link outliving an enum rename — flowed unchecked to the API, the new `@IsIn` correctly `400`d, and the admin landed on an error page whose **only** control was a `Retry` that could never succeed: the filter bar and `Clear filters` rendered only inside the populated branch, and the backend's `details` field-error array was discarded, so the admin could not even tell which filter was wrong. **All three dead-ends were new** — pre-T-8 those values could only originate from the selects. And the precedent T-8 claimed to mirror does not have the flaw: `DirectoryView` renders its filter bar **above** its loading/error/empty ternary. T-8 copied its read/write helpers but not its error-state resilience — while FR-6 makes shareable filter links the headline affordance, so a slightly-wrong link is foreseeable, not contrived.

**Both lenses — a stale doc comment, and this one was the Leader's fault.** `lib/api/actors-admin.ts` carried a "Backend gap" paragraph stating the two params were not validated server-side and *"the live API currently ignores them"*. **It was true when written**; the backend increment I dispatched afterwards made it false. The file whose declared job is contract fidelity then asserted the opposite of code in the same tree, in the direction that matters — a reader would conclude FR-9 does not work server-side and might "simplify" the client by dropping the params, or redo the backend work. The conformance Reviewer refused to wave it through on the grounds that *"prose that misled an implementer"* is the failure mode this spec has already recorded twice (DD-3's banned word, R-9). Three sibling false comments were fixed with it, including `page.tsx`'s `router.replace` rationale, which asserted the **opposite** of what `replace` does.

**Leader deviation, recorded (third time this run, second distinct reason):** the rework rule says bump effort one level. Attempt 1 was `xhigh`; one level is `max`, but the tier↔effort rule forbids `max` on a T2 tier and prescribes escalating the tier instead — and escalating for a narrow, fully-specified remediation would be disproportionate. Kept at `xhigh`; passed both lenses first time.

#### Scope expansion the Implementer made, and why both lenses ruled it necessity

They converted **all five** filters to URL sync, not just the two new ones, because none had it before. Their argument: a page where 2 of 5 filters survive a reload and 3 do not is a worse outcome. The conformance lens went further and ruled it structurally forced — all five go through one `handleFilterChange` and one page-reset rule, so a hybrid would mean two sources of truth in one component with divergent reset semantics: *"strictly more code and more failure modes."* Pagination had to move too, since `page` is reset by filter changes. **Every line is consequence, not addition.**

#### The a11y fold-in — an authorised advisory resolution, not silent drift

The risk lens found the FR-9 flag was **emphasis-only**: a `GRANTED` + `NOT_RECORDED` row was distinguished from its neighbours solely by `text-warning`, so colour-blind and AT users got **zero** signal that the row was exceptional. It offered this as foldable rather than deferred, and the Leader took it. **Reasoning recorded, because advisories must not silently mint or widen work:** T-8 explicitly traces **NFR-5** (WCAG 2.1 AA on the changed table); colour-only signalling is a WCAG **1.4.1** failure, so this is T-8's own acceptance criterion, not a new one; the defect lived entirely in markup T-8 introduced; and the change is one function plus its two call sites.

The decisive point, from the conformance lens: **`jest-axe` has no rule for 1.4.1 semantic meaning**, so NFR-5's automated measure was *structurally blind* to this. A gap the task's own gate cannot see, in the task's own new UI, is what should be folded in rather than deferred.

Implemented as `consentMethodCaptionText()` → `"Not recorded — no evidence"` for the flagged case only, in both the table cell and the mobile card. **The risk lens then verified the new wording is not a lie**, which was the Leader's specific concern (a `GRANTED` + `NOT_RECORDED` actor could in principle also hold a `consentReference`, making "no evidence" false): it traced reachability against `isConsentProvenanceSatisfied` and found `consentReference` is a member of `PROVENANCE_FIELDS`, so setting it on a legacy row fires trigger (b) and is rejected `400`; create and import both require a non-`NOT_RECORDED` method to reach `GRANTED`; and DD-4's partitioned fill leaves every batch member with a method. **So the flagged state provably implies no method, no date, and no reference** — the caption is true for every state the four write paths can produce.

#### Attempt 2 — what both lenses verified

- **The 400 is closed at its source, and more completely than asked.** `enumParam()` validates against the **same array literals the selects render their options from**, so anything renderable is accepted and vice versa — correct by construction, not by coincidence. The risk lens then checked *every other* query param this page reads and confirmed **no combination of URL params on this page can now produce a `400`**.
- **The escape hatch is independent of the prevention.** The filter grid, page-size select, and a single `Clear filters` render outside every state guard — verified enabled and correctly populated in the error state, the empty state, and the pre-session window. `Clear filters` appears iff at least one accepted filter is active, in every state.
- **No previously-passing criterion regressed**: FR-9's AND-composition still proven three ways (dropping either clause changes the count, so `total === 1` fails both ways), NFR-8 token discipline intact under the longer caption, below-`md` scroll-not-drop plus card parity, the `<Suspense>` static-export pattern, type fidelity against the Prisma enums, `jest-axe` coverage, and no shared e2e fixture made vacuous. **No pre-existing test was weakened** — the two changed `ActorsTable` assertions kept their `toHaveClass('text-warning')` **and** `not.toHaveClass('text-muted')` checks; only the expected text grew.
- **The six `exhaustive-deps` suppressions remain sound** after the refactor. The risk lens enumerated each hook's closure against its dep array and confirmed the five primitives still fully derive `filters`, with `enumParam` contributing nothing (module-level pure function). No stale closure is reachable.

#### Verification

Frontend: scoped `"ActorsTable|actors/page"` 48/48 · full **951/951, 69 suites** (Leader-measured baseline before T-8: **920/920**) · `npm run lint` clean (only pre-existing `no-img-element` warnings in unrelated files) · `npm run build` succeeds, static export 20/20 pages · `react-doctor` **87/100**, one warning (`ActorsView` > 300 lines — pre-existing, deliberately not split because T-9/T-10 land on that file; both lenses agreed).
Backend: `admin-actors` 73/73 · `actors-admin` 44/44 · eslint clean · build clean · full **442/442, 37 suites** (Leader-measured baseline: **437/437**).

#### ⚠️ OUTSTANDING — the D-h human visual check (why this task is `[~]`)

The work order: *"`jest-axe` sees DOM semantics and contrast, **not** column crowding. Two more columns on an already-dense table needs a human or T6 look at `md` and `lg` before this is called done."*

**Blocked on an authenticated admin session.** The check needs the table rendered with real data density; `/admin/actors` requires a Cognito session the Leader does not hold. `agy` is installed (v1.1.10) so the T6/Antigravity route is available, but it needs a **screenshot**, whose production needs the same session. Both routes share the blocker. Raised to the user with three options: they inspect it; they supply screenshots at `md`/`lg`; or they authenticate a Chrome session the Leader can drive.

**What the check must decide** — both lenses converged on this, and it is not about T-8's correctness but about accepting a documented non-conformance:

- `docs/ux-ui/design.md` §9 says flatly *"Tables scroll horizontally with sticky first column rather than truncating data"* — **no breakpoint qualifier**. No column carries `sticky` at any breakpoint, and every cell is `whitespace-nowrap`. **Pre-existing** (the wrapper and the missing class both pre-date this diff), so both lenses ruled it advisory rather than a T-8 failure.
- But T-8 pushes `lg` from *"probably fits"* to **guaranteed horizontal scroll**: ~1450–1650px of intrinsic row width across nine columns, against an `lg` viewport minus a 240–280px persistent sidebar. The consequence: **scroll right to read Consent and the Trader name leaves the viewport — you act on a row you can no longer identify.**
- **Bounded, and the bound matters for severity:** `ConfirmDialog`'s title is `Delete ${traderName}?`, so Delete re-confirms identity by name, and Edit navigates to a form showing the record. So this is a usability and mis-click defect, **not a data-loss one.**
- The risk lens's framing, adopted: *"treat the visual check as a gate on whether to accept §9 non-conformance for another two tasks, not as a gate on T-8's correctness."*
- Two things worsen the crowding and both are already recorded: A-4's raw snake_case fallback makes the Type column **widest** exactly on the rows that also carry the two new columns, and the new `"Not recorded — no evidence"` caption raises the Consent column's minimum width at every breakpoint (the desktop cell is `whitespace-nowrap`; the mobile card wraps freely).

**Spec-text defect that caused the ownership gap:** `design.md` §5's premise — *"Horizontal scroll with sticky first column below `md` … the existing table pattern already does this"* — is **false on both halves**: below `md` there is no table (it is `hidden md:block`, with cards instead), and no column is sticky at any breakpoint. That false premise is why no task ever owned the sticky column. Recorded for `/akili-audit` alongside §4.2, §4.6, and §5's other claim.

#### ADVISORY findings (recorded, non-gating — no advisory mints a task)

| ID | Finding | Disposition |
|---|---|---|
| **H-1** ⚠️ | **A-4 is functional, not cosmetic.** `frontend/lib/content/roles.ts:35` keys `ROLES` on the original **6** trader types. T-5 added four. So `traderTypeOptions` — built from `Object.entries(ROLES)` (`page.tsx:602`) — means the four new types are **not selectable in the Trader-type filter at all**: an imported `humanitarian` or `qds_producer` actor is unreachable by that filter, *and* renders as raw snake_case in the Type column. | **Own task, raised in priority.** Reported as cosmetic; both lenses found the consequence is FR-6-adjacent and functional. Not fixed here — `roles.ts` drives public surfaces too, so it is a separate decision. |
| **H-2** ⚠️ | **The empty state can assert something false.** `?page=500` (a stale or shared link) lands on the empty state reading *"The registry is currently empty."* while `total` may be 1,000, with **no local control**: pagination lives in the populated branch and `Clear filters` is hidden because no filter is set. **Newly reachable** — this diff moved `page` from React state into the URL. | **Home: T-10** (the next task to open `page.tsx`). **The Leader was about to fold in a one-line clamp; the risk lens rejected it as itself broken:** `Math.min(page, totalPages)` derives its bound from `total`, which is `0` until the first response — *after* the request that needs `page` — so it collapses **every deep link to page 1** on first render and destroys FR-6's shareable pagination. **Prescribed remediation:** fix the empty-state copy to account for `page > 1` and render a page-reset affordance; the rejected alternative (a post-response effect calling `pushParams({page: undefined})`) introduces the URL-writing effect this design avoids plus a double request. Not left floating a third time, per the Reviewer's insistence. |
| **H-3** | Two comments still call the filter bar *"interactive"* in the loading state; all six controls carry `disabled={loading}`. The conformance lens offered to make this the FAIL, for uniformity with the attempt-1 comment FAIL. | **Leader adjudication, recorded:** accepted its class distinction and did **not** gate. The attempt-1 comment made a false claim about **another layer's shipped contract**, which sends a reader to redo existing work; this is an over-strong adjective about a **transient local state**, beside a load-bearing sentence that is accurate. Different consequence, not the same defect at smaller size. **Carry-forward to T-9's brief** (one word in two places). |
| **H-4** | One vacuous iteration in the new label loop: `getAllByText(t => t.startsWith('Email'))` is un-scoped, so the table's own `<th>Email</th>` satisfies it whatever the caption renders. Both lenses noted the `startsWith` loosening did **not** cause it — exact `getAllByText('Email')` matched the same `<th>`. | Scoping the query to the consent cell restores it. Not a done-criterion; `SIGNED_FORM` and `NOT_RECORDED` are separately and strictly proven. |
| **H-5** | A rejected enum value **stays in the URL**: `pushParams`'s preservation loop copies unknown keys forward, so a bogus param re-propagates if the link is shared again while the UI shows "All", and with only an invalid filter present `Clear filters` is hidden. | Cosmetic — no request carries it, no `400`. But a filter silently dropped from a shared link. |
| **H-6** | **Pre-existing out-of-order refetch window.** `fetchActors` applies `setActors`/`setTotal` with no request-generation guard. `disabled={loading}` closes the ordinary path, but `handleDeleteActor` and the three bulk handlers refetch *without* raising `loading`, leaving a window where responses can land out of order. | Unchanged by this diff. A monotonic request id closes it whenever that code is next touched. |
| **H-7** | `TableSkeleton` is also the `<Suspense>` fallback, where no filter bar exists above it — so removing the skeleton's filter row means first paint shows rows-only and the bar then pushes content down: a small CLS regression on the static-export CSR bailout. | Minor. Same edit site as H-3. |
| **H-8** | `consentMethodLabel`/`sourceLabel` use a `default:` branch meaning `NOT_RECORDED`/`TEAM_MANAGED`. Safe under the exact-union types, but a future sixth `ConsentMethod` would render a `GRANTED` actor as "Not recorded" **without** the warning — mislabelled rather than merely unlabelled. | Recorded. Same class as H-1: an enum widened in one place and not another. |
| **H-9** | `DirectoryView.tsx:170-175` still carries the inverted `router.replace` rationale that T-8 corrected in its own copy. Pre-existing, on a public-surface file. | One-line fix whenever that file is next opened. |
| **H-10** | `admin-actors.e2e.spec.ts`'s `FORBIDDEN_KEYS` hand-lists `PII_ALLOWLIST + traderId/gpsAltitude/gpsAccuracy` under a comment claiming *"Mirrors pii-boundary.spec.ts exactly."* False since **T-7**, and T-8 added a `GRANTED` fixture carrying `SIGNED_FORM`/`DOC-200` that now flows through this file's public-read regression, checked by a scanner blind to those four keys. **Not a leak** — the real gate (`pii-boundary.spec.ts`) iterates the derived union and covers it. | T-7 territory; the local scan is weaker than its comment reads. |

---

### T-9 — Add the Consent & provenance fieldset to the actor form

**Status:** `[x]` PASS on **attempt 2**, plus a scope-completion increment.
**Implementers:** `akili-implementer` (T2 / sonnet). `impl-T9` (attempt 1, `xhigh`) · `impl-T9b` (rework, `xhigh`) · `impl-T9-source` (FR-6 scope gap, `high`).
**Reviewers:** parallel lens mode (4R), all T3 / opus. Attempt 1: `rev-T9-conformance` **FAIL**, `rev-T9-risk` **PASS**. Attempt 2: `rev-T9b-conformance` **PASS**, `rev-T9b-risk` **PASS**. Increment: `rev-T9c-risk` **PASS** (single lens — deliberate, see below).

**Diff (cumulative):** 3 files, +611 / −13.

#### The two lenses split on severity, and the FAIL lens was right

Both lenses found the **same fact**: `dateOnlyToInstant`'s `+03:00` output never compares byte-equal to a stored `Date.toISOString()` inside `isSameValue`, so the server's condition (b) fires on **every** save of an actor holding a consent date. They diverged on what that costs.

`rev-T9-risk` classed it **ADVISORY** because no live `400` was reachable. `rev-T9-conformance` classed it **blocking** on different harm — and the Leader adjudicated in its favour:

- **Silent rewrite of an evidence field.** A `consentObtainedAt` carrying a real time-of-day (written via API, import, or bulk) was rewritten to Tanzania midnight by an *unrelated* edit; import-written UTC-midnight instants drifted **−3h**.
- **Phantom audit entry.** `logUpdate` diffs before/after rows, so that rewrite produced a real `UPDATE` row naming `consentObtainedAt` on an edit the admin never made — on the spec whose purpose is a trustworthy consent audit trail (NFR-6, §4.6).

**Reachability of a `400` was the wrong axis to judge it on**, and `rev-T9b-risk` opened its re-audit by saying so unprompted. This is the mirror of T-6, where the risk lens elevated what conformance had filed as a footnote. **Two lenses earn their cost by disagreeing, not by agreeing** — in both directions.

**Second FAIL (conformance):** NFR-5's verification is *"`jest-axe` clean on the changed **table and form**"*, and `design.md` §12 lists it as a required component test. T-8 delivered the table half; `ActorForm.test.tsx` had **zero** `axe` usage, and **T-10 touches only `AcknowledgeDialog`**, so the form half would never have been closed.

#### The remediation, and why it beat the Leader's own plan

The Leader's instinct was to align T-6's importer to `+03:00`. The conformance lens's remediation was better and was adopted verbatim: **resend the stored value byte-verbatim when the date field was not edited.** That fixes the corruption for dates **already written** by the importer and the bulk path — not only future ones — and preserves any stored time-of-day. **T-6 was therefore not reopened**, which was the right call: the corruption path is closed at the consumer, so the cross-path convention difference stops mattering for data integrity.

`resolveConsentObtainedAt(values, mode, initialValues)`: **untouched** (edit mode **and** `instantToDateOnly(stored) === field`) → resend `stored` verbatim; **new or changed** → `dateOnlyToInstant`, still `+03:00`-anchored. Both lenses independently confirmed the anchoring is correct and closes a real `IsNotFutureDate` bug for admins recording "today" between 00:00–03:00 EAT.

#### What the re-audit established that the Implementer did not claim

- **Byte-equality holds by construction, not by hope.** `admin-actor.serializer.ts` returns the raw Prisma `Date`, Nest serializes it via `JSON.stringify` → `toISOString()`, and `actor-create.dto.ts` carries **no** `@Type(() => Date)` — so the resent string reaches `isSameValue` as a string and is compared against `normalize(storedDate) = toISOString()`. The column is `DATETIME(3)`, so millisecond precision survives. Verified for **every** writer: form (`+03:00`), API, importer (UTC midnight), bulk (batch instant) — all canonicalised to `…sssZ` by `toAdminActor`, so all four round-trip byte-identically.
- **The ambiguous-rendering case the Leader raised is not reachable as a defect.** `instantToDateOnly` is many-to-one (`10:30Z` and the previous day's `22:00Z` both render the same date), but the verbatim branch fires only when the admin's chosen **calendar date** equals that rendering — and a calendar date is the *only* state an `<input type="date">` can express. To change anything visible, the admin must change the date, which flips to rebuild. The residual is a **capability limit, not a bug**: a wrong stored *time-of-day* cannot be corrected from this form, which is inherent to a date-only control.
- **The client mirror and the wire body agree by construction** on `consentObtainedAt`: `needsProvenanceCheck` compares against `toFormValues(initialValues).consentObtainedAt`, which *is* the same expression `resolveConsentObtainedAt` uses as its predicate.
- **The fix could not introduce a rejection.** `rev-T9b-risk` checked every writer for a future-dated store — create/update and bulk DTOs carry `IsNotFutureDate`, and the importer rejects future dates itself — so a stored instant is always ≤ its write time ≤ now. It also noted the pre-fix midnight rebuild had been an **accidental** safety net (it shifted "today" into the past); that net is no longer needed.

#### The FR-6 scope gap — the second decomposition gap this spec produced

A Reviewer found, and the Leader verified at source, that `requirements.md` **FR-6**'s Description says *"the admin create/edit form MUST capture **all four fields** in a dedicated section"* — including **`registrationSource`**. `tasks.md`'s T-9 scope line reads "status · method · date · reference", dropping it, and T-10 is `AcknowledgeDialog` only. **No task owned it**, so FR-6 would have been marked covered with a MUST unmet.

**Leader error, recorded.** An earlier pass cleared the omission by reading only **FR-1**, whose "Admin sets the source explicitly" scenario *is* payload-level (satisfied by T-3) and which §14 attributes to T-1/T-3/T-8. That reading of FR-1 was right; **FR-6 imposes the form control independently, and FR-6 is the requirement that was missed.** The Leader had reported to the user that the omission was correct, and corrected that statement when the second conformance lens pressed it.

Closed inside T-9 rather than as a new task — the same adjudication as T-8's filter gap, and for the same reason: FR-6 is on T-9's `Traces` line.

**This is the second gap of identical shape** (T-8: `design.md` §3 specified two list-query filters that `tasks.md` assigned to nobody). Both were caught **only because a Reviewer read the requirement rather than the task's scope line.** Recorded as a method finding for `/akili-audit`: this spec contains requirements no task owns, and independent audit was the only net that caught them.

#### The risk the increment introduced, and why it is closed

Before the increment `buildDto` **omitted** `registrationSource`, so `buildScalarData` left the stored value alone. It is now sent explicitly on every save and `SCALAR_FIELDS` includes it, so it is **written on every save** — safe only if prefill is correct in every reachable state. Otherwise an ordinary unrelated edit would **silently flip a `SELF_REGISTERED` actor to `TEAM_MANAGED`**, corrupting the exact field this spec exists to record, and `registrationSource` is in `AUDITABLE_FIELDS`, so the audit would show a change nobody made.

`rev-T9c-risk` closed it **by construction**: `edit/page.tsx` gates the form's mount behind a resolved `adminGetActor` (`loading`, `!token`, `!id`, `error || !actor` all return early), so there is **no mount-with-undefined-then-populate path** — which is the only shape that would freeze `values` at the default, since `useState(() => toFormValues(initialValues))` is one-shot. The serializer always emits the field off a non-nullable column; `''` is unreachable because the bespoke select emits no blank option (the Implementer correctly bypassed the generic `renderSelect`, which always prepends one); and a degenerate `undefined` **fails safe** — `JSON.stringify` drops the key, `field in dto` is false, stored value untouched.

**The Leader asked whether omit-when-unchanged should be required instead. The Reviewer said no, and the reasoning is worth keeping:** given a correct prefill the two shapes are indistinguishable; given an *incorrect* prefill, omit-when-unchanged compares against the same wrong `initialValues`, finds a difference, and sends the wrong value anyway. `resolveConsentObtainedAt` earns its complexity because the date has a lossy representation; a bare enum has none. Also structurally different from the date case: `buildDiff` diffs **before/after DB snapshots**, not the DTO, so re-sending an identical enum writes no audit row.

**Single-lens review for the increment — deliberate.** Both lenses had already passed the fieldset; the increment adds one select, and the risk that mattered was one class (silent corruption). The conformance questions worth asking (FR-6 actually satisfied, labels consistent across surfaces, guard untouched) were folded into the risk brief instead of spawning a second agent for symmetry.

#### Verification

`npm test -- ActorForm --silent` **32/32** · full suite **965/965, 69 suites** (Leader-measured baseline before T-9: **951/951**) · `npm run lint` clean (3 pre-existing `<img>` warnings in unrelated files) · `npm run build` succeeds, static export 20/20 · `react-doctor` **86/100**, one warning on `page.tsx:274` (`ActorsView` > 300 lines — a file T-9 does not touch).

**Labels verified consistent across three surfaces** by the Reviewer at source, not from the report: `ActorsTable.tsx` `sourceLabel`, `page.tsx` `SOURCE_OPTIONS`, and `ActorForm.tsx` all render "Team-managed" / "Self-registered".

A pre-existing `tsc --noEmit` error at `page.test.tsx:45` (`TS2556`, a T-8 test file) was confirmed present on the committed baseline via `git stash` — see **J-4**.

#### ADVISORY findings (recorded, non-gating — no advisory mints a task)

| ID | Finding | Disposition |
|---|---|---|
| **J-1** ⚠️ | **Pre-existing data-corruption path, broader than this field.** `ActorForm` initialises `values` once and never re-syncs, and `EditActorView` does not reset `loading`/`actor` when `id` changes — and App Router does not unmount on a searchParams-only navigation. So `edit?id=A → edit?id=B` via browser back/forward keeps A's values while `initialValues.id` is B, and **a save would write A's data onto B**. Predates T-9, hits every field. | `key={actor.id}` on `<ActorForm>` in `edit/page.tsx` closes it. **Follow-up task** — not a rework here, and omit-when-unchanged would not have fixed it. |
| **J-2** | **The increment's safety property lives outside the diff.** The always-write is safe *because* `edit/page.tsx:131-181` gates the mount on a resolved fetch. Nothing in `ActorForm.tsx` records that dependency; a future change that mounts the form before the fetch resolves, or passes a list row as `initialValues`, reinstates the silent flip. | One comment at `buildDto`'s `registrationSource` line naming the precondition would make the coupling visible where the change would be made. |
| **J-3** | **The verbatim resend is coupled to the serializer's output shape.** If `admin-actor.serializer.ts` ever formats `consentObtainedAt` differently (custom formatter, date-only, `+03:00`, dropped milliseconds), byte-equality breaks and (b) fires on edits that touched nothing — benign for a fully-evidenced actor, a hard `400` for the reachable `GRANTED` + `NOT_RECORDED` + non-null-date shape. | Discoverable only from the form side today. Worth a note on the serializer, where such a change would actually be made. |
| **J-4** | **Type errors in `frontend/**/*.test.tsx` are covered by no gate.** Jest runs through SWC without type-checking, and `npm run build` did not surface the T-8 `TS2556`. Test-file type fidelity currently rests on `npx tsc --noEmit`, which is **not** in the verification table. | This spec's own evidence for why it matters: T-9's fixture only satisfies the T-8-widened `AdminActor` because the Implementer added four fields by hand — exactly what a type gate should catch instead of review. Worth deciding whether `tsc --noEmit` becomes a gate. |
| **J-5** | `consentReference` is the one field where the client mirror compares **form** values (`trim()`) while the wire sends `trim() \|\| null` — a stored `''` or whitespace-padded reference would let the client say "unchanged" while the server reads a change. | Unreachable to a `400` today (any validly-`GRANTED` actor carries method + date; the 436 legacy rows hold `null`); worst case a benign normalising audit line. Making the mirror structural means comparing the **body `buildDto` will send** rather than form values. |
| **J-6** | `ActorHistoryPanel.tsx` renders audit diff values through `String(value)`, so a Tanzania-midnight instant prints as the **previous UTC day** to an admin auditing consent. | Real, outside T-9's file scope. Format instants at `+03:00` in that panel. |
| **J-7** | **`jest-axe` cannot verify contrast here.** Under jsdom no CSS custom properties resolve and there is no layout, so axe's `color-contrast` rule cannot fire. NFR-5's "contrast per §7" is **unverified by this gate** and rests on token-class review. Also unverified: keyboard order, focus management, whether the live region actually announces. | Same structural limit recorded for T-8. The contrast question routes to the held D-h check. |
| **J-8** | `Field` computes a `describedBy` joining hint + error ids and **never applies it**, so the two new hints are visible but not programmatically associated. Pre-existing for every hinted field (`gpsLatitude`, `capacityTons`); T-9 widens it by two. `jest-axe` has no rule that catches it, so the new axe tests stay green through it. | Plumbing `describedBy` onto the control fixes all of them in one edit. |
| **J-9** | No test pins `aria-invalid="true"` on the two new error fields (the code sets it correctly; axe does not check for presence). `CONSENT_METHOD_OPTIONS` is now duplicated verbatim in `ActorForm.tsx` and `page.tsx`. The date input has no `max` bound, so a future date is caught only server-side — **spec-conformant**, since FR-2 puts that rule server-side and §5 makes the client check UX-only. | Minor. |
| **J-10** | **Do not delete the `SELF_REGISTERED` prefill test as redundant.** The pre-existing "prefills all fields" assertion is non-discriminating in isolation, because the fixture's `TEAM_MANAGED` equals the create-mode default — it would pass with prefill fully broken. The dedicated `SELF_REGISTERED` test is the real guard against the whole silent-flip class. | Recorded so a future cleanup does not remove the load-bearing test. |
| **J-11** | `TANZANIA_UTC_OFFSET_HOURS`'s derivation is valid only for whole-hour, non-negative offsets — the comment invites editing it "alone", but `3.5` would silently produce `'+3.5:00'`. Harmless for EAT (fixed UTC+3, no DST). | Comment overstates the safety of editing it. |

**D-h note:** T-9's work order carries **no** human-check requirement, so this task is `[x]`. But the new fieldset is `lg:grid-cols-4` — a density no other fieldset in this form uses (the rest cap at `lg:grid-cols-3`) — and a native date input plus a free-text reference at quarter width may crowd. **Both lenses routed it to T-8's held D-h check**, so that check now covers two surfaces: `/admin/actors` and the edit form, at `md` and `lg`.
