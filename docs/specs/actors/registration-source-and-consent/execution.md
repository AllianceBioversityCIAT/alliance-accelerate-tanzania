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

