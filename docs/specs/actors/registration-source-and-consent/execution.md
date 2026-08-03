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
