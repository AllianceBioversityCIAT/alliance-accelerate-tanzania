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

