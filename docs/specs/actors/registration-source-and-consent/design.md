# Design — Registration Source & Consent Provenance

- **Spec path:** `docs/specs/actors/registration-source-and-consent/`
- **Status:** Draft
- **Traces requirements:** FR-1..FR-9, NFR-1..NFR-8 from this spec's `requirements.md`
- **Depth:** Standard · **Tier:** LITE (inherits TRD ADR-001; nothing here escalates it)

---

## 1. Approach Overview

Four additive columns on `Actor`, two new enums, and **one shared invariant** that every consent-bearing write must satisfy.

The whole design turns on where that invariant lives. Consent can be set from **four** places today — admin create, admin update, admin bulk set-consent, and Excel import — each with its own acknowledgement check written separately. Adding a fifth check by hand in each place would produce four subtly different rules within a year. Instead the rule becomes **one pure function in `common/`**, consulted by all four call sites, mirroring how `pii-consent.policy.ts` already centralises the consent *read* rule (TRD ADR-003/ADR-004).

Nothing about the public read path changes. The role-aware serializer builds public output by **explicit allowlist of public fields** (TRD §3), so new columns are non-public by construction — a property this design leans on rather than re-implements.

```
        write payload
             │
             ▼
   ┌──────────────────────────┐
   │ consent-provenance guard │  ← ONE pure function, common/
   │ fires on VALUE CHANGE,   │
   │ never on field presence  │
   └──────────────────────────┘
             ▲   ▲   ▲   ▲
    create ──┘   │   │   └── import (per row)
       update ───┘   └── bulk set-consent (per batch)
```

**Tactics (per the Decision Spine):** *single point of enforcement* for the invariant (modifiability + security); *allowlist-by-construction* for the public projection (security — QA-1); *additive, defaulted migration* for zero-downtime schema change (availability — QA-4).

---

## 2. Data Model Changes

Additive only. Reference `docs/trd/trd.md` §3.

| Element | Kind | Default | Nullable | Notes |
|---|---|---|:-:|---|
| `RegistrationSource` | New enum | — | — | `TEAM_MANAGED`, `SELF_REGISTERED` |
| `ConsentMethod` | New enum | — | — | `NOT_RECORDED`, `PORTAL_CHECKBOX`, `SIGNED_FORM`, `EMAIL`, `VERBAL_FIELD` |
| `Actor.registrationSource` | Column | `TEAM_MANAGED` | no | FR-1 |
| `Actor.consentMethod` | Column | `NOT_RECORDED` | no | FR-2 |
| `Actor.consentObtainedAt` | Column | — | yes | `DateTime`, FR-2 |
| `Actor.consentReference` | Column | — | yes | Bounded string (255), FR-2 |
| `@@index([registrationSource])` | Index | — | — | Supports the FR-6 filter |

**Migration plan.** Single additive migration. Both enum columns are `NOT NULL` **with a default**, so MySQL backfills existing rows in one statement without a separate data migration and without a nullable-then-tighten two-step. No column is dropped, renamed, or narrowed. Reversible by dropping the four columns and two enums — no data other than the new fields is lost on rollback.

**Backfill: deliberately none.** Per FR-9, legacy `GRANTED` rows land on `NOT_RECORDED` / `null` and stay there. That is the point: the gap must be *visible*, not filled with a plausible guess.

`PORTAL_CHECKBOX` is declared here and written by nobody in this spec — chunk 3 (`actors/public-self-registration`) is its only writer. Declaring it now saves that spec a migration.

---

## 3. API Surface & Contracts

No new endpoints. Four existing contracts change.

| Endpoint | Change | Breaking? |
|---|---|:-:|
| `POST /api/v1/admin/actors` | Accepts the four fields; enforces the invariant | No — fields optional |
| `PATCH /api/v1/admin/actors/:id` | Accepts the four fields; enforces the invariant | No — fields optional |
| `POST /api/v1/admin/actors/bulk-consent` | **Requires** `consentMethod` + `consentObtainedAt` when `consentStatus = GRANTED` | **YES** — see §8 DD-4 and the Step 2.3 challenge |
| `POST /api/v1/admin/actors/import` | Parses the new template columns; enforces the invariant per row | No — new columns optional |
| `GET /api/v1/admin/actors` | Response gains four fields; query gains `registrationSource` + `consentMethod` filters | No — additive |

Every **public** contract (`/actors`, `/actors/:id`, `/actors/geo`, `/metrics`) is unchanged, including its response shape (FR-8).

Error envelope stays the project standard — `{ statusCode, error, message, details: [{field, message}] }` from `createValidationPipe()`, so the frontend's existing inline field-error mapping works with no change.

---

## 4. Backend Design

### 4.1 The shared invariant (`common/consent-provenance.policy.ts`)

A new pure, Nest-independent module beside `pii-consent.policy.ts`, matching its style (DB-free, unit-testable with plain objects).

It exposes one predicate answering: *given the stored actor state and the submitted payload, is the resulting record allowed?*

**The trigger is a value change, never field presence.** This is the single most important sentence in this design — see DD-3 for why an earlier draft got it wrong.

The predicate fires when the **effective post-write** `consentStatus` is `GRANTED` **and** at least one of:

| # | Condition | Closes |
|---|---|---|
| **(a)** | Stored `consentStatus` was **not** `GRANTED` — a transition *into* published state | Granting without evidence |
| **(b)** | The write changes a provenance field to a value **different from** stored | *Grant-then-strip* — granting with evidence, then clearing it in a second request |

When it fires, it evaluates the **effective post-write state** (stored ∪ payload), so a `PATCH` supplying only the missing date on an already-`GRANTED` actor that has a method recorded is correctly allowed.

**Worked cases** (each is an FR-3 scenario and a required test):

| Write | (a) | (b) | Outcome |
|---|:-:|:-:|---|
| Create `GRANTED`, no provenance | ✓ | — | **Reject** |
| `UNKNOWN` → `GRANTED` with method + date | ✓ | — | Allow |
| Legacy `GRANTED`+`NOT_RECORDED`, edit `district` (form sends full object) | ✗ same value | ✗ same value | **Allow** ← the case the naive reading breaks |
| `GRANTED`+`SIGNED_FORM` → set `consentMethod = NOT_RECORDED` | ✗ | ✓ | **Reject** |
| `GRANTED`+`SIGNED_FORM` → `DENIED` **and** clear provenance | effective ≠ `GRANTED` | — | Allow (un-publishing first is legitimate) |

This is a **specification/policy function**, not a Nest guard. A guard would be the wrong layer: the rule depends on *stored entity state*, which a guard does not have without a DB read it has no business doing.

**Concurrency assumption (J-4).** Each call site reads `before` and evaluates the predicate **inside the same `$transaction` as the write**, before any write is attempted. Under MySQL's default `REPEATABLE READ` this makes each transaction's decision consistent with its own snapshot, and no interleaving of concurrent `PATCH`es was found that defeats the invariant. This is an **assumption of the design, not an accident**: a future refactor that moves the `before` read outside the transaction, or introduces optimistic locking, must re-examine it.

### 4.2 Call sites

| Path | Where the guard runs | Provenance granularity |
|---|---|---|
| `ActorsAdminService.create` | Beside the existing `acknowledged` check (~L137), inside the transaction | Per actor, from the payload |
| `ActorsAdminService.update` | Beside the existing check (~L224), after loading the current row | Per actor, merged stored ∪ payload |
| `ActorsAdminService.bulkSetConsent` | Before the batch transaction (~L346) | **Per batch** — one method + date applied to every id (DD-4) |
| `ActorImportService` | Inside `applyConsentGate` (~L558), per row | Per row, from the new template columns |

`SCALAR_FIELDS` (the `buildScalarData` allowlist, ~L59) gains the four field names — this is what actually persists them, and omitting it is the most likely silent failure in the whole spec.

### 4.3 DTOs

| DTO | Change |
|---|---|
| `ActorCreateDto` | Four optional validated fields: `@IsIn` on both enums, `@IsDateString` + not-in-future on the date, `@MaxLength(255)` on the reference |
| `AdminActorUpdateDto` | Inherits via the existing `Partial<>` derivation — no separate edit |
| `BulkConsentDto` | **New required-when-`GRANTED`** `consentMethod` + `consentObtainedAt`; optional `consentReference` |
| `ActorImportRequestDto` | Unchanged — the new columns arrive inside the workbook, not the request body |

Enum values come from the Prisma-generated types, never re-typed as string literals (NFR-3, matching how `CONSENT_VALUES` is already derived).

### 4.4 Taxonomy (`common/normalize.ts`)

`TRADER_TYPES` gains four codes; `TRADER_TYPE_ALIASES` gains the workbook spellings (`INGO`, `NGO/INGO`, `Digital Service Provider`, `QDS`, `cbo`, `Bulk buyer`, `Offtaker name`-adjacent variants). Existing entries are untouched, so FR-4's second scenario holds by construction.

Ambiguous values stay **absent** from the alias map so they quarantine — the file's existing documented convention.

### 4.5 Serializers

- `admin-actor.serializer.ts` — `AdminActor` interface and `toAdminActor` gain the four fields (explicit field pick, matching the existing style).
- `role-aware.serializer.ts` — **no change.** Its public output is an explicit allowlist; new columns are excluded by construction.
- `pii-consent.policy.ts` — gains a `NEVER_PUBLIC_FIELDS` constant (§8 DD-6).

### 4.6 Audit

No new `ActorAuditAction`. The four fields flow through the existing diff machinery in `actor-audit.service.ts`, so an update touching them produces a normal `UPDATE` row and bulk consent keeps writing `BULK_CONSENT` (NFR-6). Audit JSON already contains PII and is already admin-only.

---

## 5. Frontend Design

All within `(admin)`. No public surface changes.

| Component | Change |
|---|---|
| `lib/api/actors-admin.ts` | `AdminActor`, `AdminActorCreateInput`, `AdminActorListQuery`, `BulkConsentInput` gain the fields. Type fidelity with the backend contract is the file's stated job. |
| `components/admin/ActorsTable.tsx` | **Source** column (chip) and **Consent** column (status chip + method caption). Horizontal scroll with sticky first column below `md` per `docs/ux-ui/design.md` §9 — the existing table pattern already does this. |
| `app/(admin)/admin/actors/page.tsx` | Two filters, URL-synced via the established query-param routing pattern (`frontend/CLAUDE.md`). |
| `components/admin/ActorForm.tsx` | New **Consent & provenance** fieldset (status · method · date · reference) with client-side FR-3 validation as UX only. |
| `components/admin/AcknowledgeDialog.tsx` | Gains **optional** method + date inputs, enabled by a new prop. See the shared-component note below — this is not a blanket change. |
| `lib/dashboard/csv.ts` | **No change — and that is the requirement.** It serializes `PublicActor` through a named public-column allowlist with an explicit no-spread rule. The new fields are not on `PublicActor`, so FR-7 holds by construction. A test asserts their absence. There is **no admin export** to extend (see `requirements.md` FR-7 scope correction and OQ-5). |

**`AcknowledgeDialog` is shared by three call sites (J-2).** An earlier draft treated it as a bulk-only component. It is not:

| Call site | Needs method + date? | Why |
|---|:-:|---|
| `app/(admin)/admin/actors/page.tsx:686` — bulk unlock | **Yes** | DD-4: the batch supplies them |
| `app/(admin)/admin/actors/import/page.tsx:618` — import commit | **No** | DD-5: provenance comes from per-row template columns |
| `components/admin/ActorForm.tsx:609` — single create/edit grant | **No** | The form's own *Consent & provenance* fieldset already collects them; duplicating here would be confusing |

The new inputs are therefore **opt-in via prop**, rendered only at the bulk call site. Adding them unconditionally would leak redundant fields into two dialogs that already have their answer — and would ask the import flow for a value it structurally cannot supply.

**Tokens.** Consent and source chips reuse the existing status-chip geometry and the `docs/ux-ui/design.md` §7 palette — `--color-success` for `GRANTED`, `--color-warning` for missing provenance, `--color-muted` for `NOT_RECORDED`. **No new geometry, no new colors** (NFR-8). The "restricted chip" pattern (DD-2 in the UX blueprint) is the visual precedent.

**Accessibility (NFR-5).** New selects carry associated `<label>`s; the FR-3 client error is bound via `aria-describedby` and announced in a live region, matching the form's existing error handling.

---

## 6. Security & RBAC

| Concern | Design |
|---|---|
| Who can read the new fields | `Admin` only. Admin controllers are already class-level `@Roles('Admin')` + `JwtAuthGuard` + `RolesGuard`. |
| Who can write them | `Admin` only, same guard stack. |
| Public exposure | **Structurally impossible** without an explicit code change: the public serializer allowlists public fields. FR-8 asserts this end-to-end anyway (defense in depth — ADR-003's reasoning applied one field-group out). |
| PII classification | The four fields are **not** added to `PII_ALLOWLIST` — see DD-6. |
| Acting identity | Unchanged: resolved server-side via `acting-admin.resolver.ts`; never trusted from the client. |

**This spec does not weaken any existing control.** It adds a gate; it removes none.

---

## 7. Infrastructure / Deployment

| Item | Detail |
|---|---|
| New AWS resources | None |
| Migration | `npx prisma migrate deploy`, `DATABASE_URL` composed **in-process** from Secrets Manager per `backend/CLAUDE.md` — never written to a file, never printed. Do **not** run `migrate-seed.sh` whole against the live DB (it also seeds). |
| Rehearsal | Local docker `accelerate-mysql` first, per the migrations runbook |
| Profile | `--profile IBD-DEV`, region `eu-west-1`, on every command |
| Template asset | `npm run generate:template` regenerates `frontend/public/templates/actor-import-template.xlsx` byte-stably; the asset is committed |

### Rollout ordering (this is the risky part)

Backend and frontend deploy to **separate stacks** (Lambda vs S3/CloudFront), so they cannot land atomically. The `bulk-consent` contract change means:

> **A backend-first deploy breaks admin bulk-unlock until the frontend follows** — the old client sends no method/date and receives a `400`.

Mitigations, in order of preference:
1. **Deploy frontend and backend in the same window**, frontend second. The failure mode is a clean, legible `400` on one admin action for a few minutes — not data corruption, not a public-facing outage.
2. Migration first (additive, safe alone), then backend, then frontend.
3. Do **not** make the bulk fields optional to dodge this — that would reopen the exact hole DD-4 closes.

---

## 8. Decision Records (ADR-style)

### DD-1: One shared invariant function, not four inline checks

- **Context:** Four code paths can set `consentStatus`, each with its own separately-written `acknowledged` check. A fifth rule added by hand in four places will drift.
- **Options:** (a) inline the check at each site; (b) a NestJS guard; (c) one pure policy function in `common/`.
- **Decision:** (c). Mirrors `pii-consent.policy.ts`, which already centralises the consent *read* rule.
- **Rejected (b):** a guard runs before the service has loaded the stored entity, and the invariant depends on stored state (§4.1). A guard would need its own DB read — wrong layer, duplicated query.
- **Consequences:** One edit site when legal revises the rule. Costs one indirection per write path. **Residual risk D-f:** a *future* write path can still forget to call it — mitigated by design, not machine-checkable (requirements §8).

### DD-2: Provenance is a second, independent gate — `acknowledged` stays

- **Context:** `acknowledged` already gates `GRANTED` on all four paths.
- **Decision:** Keep both. `acknowledged` = *deliberateness* ("you accept responsibility for publishing this now"); provenance = *evidence* ("the actor agreed, here is where that is recorded").
- **Rejected:** collapsing them into one flag — would let a confident Admin publish with no evidence, or a well-evidenced record publish by accident.
- **Consequences:** Two things to satisfy when granting. Accepted: they are genuinely different questions.

### DD-3: The invariant triggers on **value change**, evaluated on effective post-write state

- **Context:** Three candidate rules, two of which are broken:
  1. *"Every write to a `GRANTED` actor must have provenance"* → every legacy `GRANTED` actor becomes **uneditable**; you could not fix a typo in its district.
  2. *"Fire when the payload **contains** `consentStatus` or a provenance field"* → looks safe, **is not**. `frontend/components/admin/ActorForm.tsx:186-207` builds a **full object** on every save, so `consentStatus` is always in the body regardless of what changed. This reading collapses into rule 1 in practice.
  3. *"Fire when a **value** changes"* → correct.
- **Decision:** Rule 3, per the truth table in §4.1.
- **Corrected after Judgment Day (J-1).** The first draft of this DD said "touches", never defined it, and left R-4 asserting the risk was already mitigated. Under this repo's prevailing idiom (`field in dto`; `buildScalarData` at `actors-admin.service.ts:453`) an implementer would have read "touches" as *key present* — reading 2 — and shipped the bug. **The word "touches" is now banned from this spec's normative text.**
- **Precedent:** the codebase already solved this exact problem once. The existing acknowledgement check at `actors-admin.service.ts:221-224` is deliberately transition-scoped (`before.consentStatus !== GRANTED`) so that resubmitting an unchanged status does not re-trigger it. This design follows that precedent instead of inventing a second convention beside it.
- **Consequences:** The guard needs the stored row, which all four call sites already load (or can load) inside their transaction. More subtle than a one-line check — which is exactly why it lives in one tested function (DD-1) with the §4.1 truth table as its test matrix.

### DD-4: `bulkSetConsent` takes **batch-level** provenance

- **Context:** Bulk unlock can set `GRANTED` on up to 500 actors with no consent data at all. Exempting it would make it the standard way to publish without evidence — the hole this spec exists to close, opened by the spec that closes it.
- **Options:** (a) exempt bulk; (b) per-id provenance; (c) one method + date applied to the whole batch; (d) one method + date that **fills only where provenance is missing**.
- **Decision:** **(d)** — corrected from (c) after Judgment Day (J-3).
- **Rejected (a):** defeats the spec. **Rejected (b):** the bulk UI is a checkbox multi-select over a table; per-id evidence entry is a different feature (and if you have per-id evidence, you are editing records one at a time anyway).
- **Why (c) was wrong:** `bulkSetConsent` writes a single uniform `updateMany` with no per-actor read (`actors-admin.service.ts:373-376`). Extending that shape to provenance means an Admin who bulk-unlocks a **mixed** selection overwrites the specific evidence some actors already carry (`SIGNED_FORM` + its real date, recorded during an individual edit) with the batch's generic values. That is silent, spec-sanctioned destruction of exactly the audit trail this spec exists to create — and nothing in the UI would have warned them.
- **Decision detail:** each batch value fills **only the provenance fields a row is actually missing**. A row is in the fill set when it lacks a method (`NOT_RECORDED`) **or** lacks a date (`null`), and it is written on exactly the fields it lacks — a recorded value is never overwritten. Actors already holding complete evidence keep theirs untouched. The result envelope reports the preserved count so the operation is legible rather than mysterious.
  > **Amended 2026-08-03 during T-4 execution (approved by JuanCode).** This detail originally read *"batch values apply only to actors whose `consentMethod` is `NOT_RECORDED`"*, using R-8's shorthand. Both Reviewers found that reading irreconcilable with FR-3's core rule and its bulk scenario: an actor with a recorded method but a **null date** was classified "already evidenced", received a status-only write, and ended `GRANTED` with no date — the invariant broken on the path it exists to protect. Reachable via create/import with a method and no date, and via the un-publish-then-strip §4.1 row 5 permits. The `missing` wording above is the option (d) this decision always intended; see `execution.md` T-4 advisory F-1.
- **Consequences:** The uniform `updateMany` becomes a partitioned write — one `updateMany` per distinct missing-field group (bounded at ≤7, independent of batch size) plus one status-only write — still inside the existing transaction. **Breaking contract change** — see §7 rollout and §9. Semantically honest: a batch unlock is one consent decision covering a set — *"the 40 actors from the March signed-form campaign"* — and such a decision should never silently outrank evidence someone already took the trouble to record.

### DD-5: Import provenance is per-row; the file-level acknowledgement stays

- **Context:** `actor-import.service.ts` has a **file-level** `acknowledged` flag (archived `admin/actor-import` FR-6), but evidence is inherently per-actor.
- **Decision:** Provenance comes from the new per-row template columns; the file-level ack is unchanged. A row asserting `GRANTED` without row provenance fails **that row** with a reason and does not disturb its neighbours (preserves QA-9).
- **Consequences:** Consistent with the importer's existing per-row isolation guarantee.

### DD-6: `NEVER_PUBLIC_FIELDS` — resolves OQ-3

- **Context:** Should the four fields join `PII_ALLOWLIST`? That constant's documented meaning is *PII on the Actor that the public serializer must hide*. `registrationSource` is not PII. But TRD §8 already names a second, **constant-less** category: *"`traderId`, `gpsAltitude`, and `gpsAccuracy` are likewise never public."*
- **Decision:** Add `NEVER_PUBLIC_FIELDS` to `pii-consent.policy.ts` covering that existing never-public set **plus** the four new fields. `PII_ALLOWLIST` is untouched — its meaning stays exactly what it says.
- **Rejected:** overloading `PII_ALLOWLIST` (makes the constant lie about what it contains, and a future reader would reasonably remove `registrationSource` from it as miscategorised).
- **Consequences:** `pii-boundary.spec.ts` iterates the **union** of both constants instead of a hand-maintained list — which also gives the three previously-constant-less fields a real home. One new concept; net reduction in things that are true only in prose.

### DD-7: The four categories go on `traderType` — with a recorded revisit trigger

- **Context:** OQ-1 — are `humanitarian` / `digital_service_provider` trader *types*, or a separate `sector` dimension?
- **Decision:** `traderType`, for now.
- **Argument:** a second dimension changes the **public** API shape, the map filter, the directory chips, and the export — a materially larger change than this spec, touching surfaces this spec otherwise leaves alone.
- **Revisit trigger (not "we might need it later"):** when a single actor legitimately needs **two categories simultaneously** — e.g. an INGO that is also an offtaker. `traderType` is single-valued; the first real dual-category actor is the evidence that forces the split. Recorded here so the next architect sees the trigger, not just the choice.
- **Consequences:** If the trigger fires after ~1,000 rows carry a value, the split is a data migration. Accepted, because paying for a second dimension now is certain cost against uncertain need.

---

## 9. Step 2.3 — Reversion Challenge

**Trigger:** DD-4 removes an existing, working capability — bulk-unlocking with `acknowledged` alone.

**Question asked:** *what does requiring method + date on bulk unlock break?*

| Breakage found | Addressed by |
|---|---|
| `lib/api/actors-admin.ts` `bulkSetConsent()` sends `{ids, consentStatus, acknowledged}` → `400` on every unlock | Frontend type + call updated in the same spec (§5) |
| `AcknowledgeDialog` collects only the typed acknowledgement text — it has no method/date inputs, **and it is shared by three call sites**, only one of which should gain them | Opt-in prop, bulk call site only (§5 table). Real UI work with prop-threading, not a one-liner (own task) |
| **Deploy-window gap**: separate stacks mean backend-first breaks bulk unlock in production until the frontend lands | §7 rollout ordering — deploy together, frontend second; failure mode is a clean `400`, not corruption |
| Existing e2e/unit tests calling the old bulk shape will fail | Test updates scoped into the same task as the DTO change |

**Verdict:** the reversion stands — but it is **not** the "additive migration + admin surfacing" the proposal described, and the deploy-window gap was invisible until this challenge. It is now the main rollout risk in §7.

---

## 10. Budget (Step 2.4 — tripwire for `/akili-execute`)

| Metric | Expected |
|---|---|
| **Tasks** | **10** |
| **Lines of code** | **~1,250** (backend ~730, frontend ~520) |
| **Review rounds** | **~12** (one per task + ~2 rework) |

*Revised up from ~1,100 after Judgment Day:* J-3's partitioned bulk write plus its result-envelope field (~+60 backend) and J-2's opt-in prop-threading across three `AcknowledgeDialog` call sites (~+60 frontend), plus the additional required tests. Task count is unchanged — the work lands inside tasks that already existed.

**Sizing verdict:** this sits at the **upper edge of Standard**, driven mostly by DD-4's frontend consequences and the four call sites. It is not `Lite` (the proposal's guess) and does not need `Full` (no new module, no new endpoint, no new external integration, tier unchanged).

**Split option, offered not taken:** FR-4 (taxonomy) is genuinely independent of FR-1/2/3 (provenance) — it shares no field, no guard, and no UI. Extracting it into its own ~2-task spec would let chunk 2 (`partner-profile-onboarding`) start on the taxonomy alone without waiting for the consent work. Not done by default because the user already approved this decomposition and re-chunking costs another cycle — **raise it if chunk 2 becomes urgent.**

> `/akili-execute` compares actuals against these three numbers and **stops to escalate** if they are exceeded. Exceeding is information, not failure.

---

## 11. Risks & Mitigations

| ID | Risk | Mitigation |
|---|---|---|
| **R-1** | `SCALAR_FIELDS` not updated → fields validate, return `200`, and **silently never persist**. The most likely defect in this spec, and it passes a naive happy-path test. | A round-trip test (write → read back) per field, not just a `201` assertion. Called out in the task's done-criteria. |
| **R-2** | Deploy-window gap breaks bulk unlock (§7, §9). | Ordered rollout; clean `400`; short window; dev environment. |
| **R-3** | Template regeneration is byte-stability-sensitive; a careless regen reddens the suite for reasons unrelated to the change. | Follow `backend/CLAUDE.md`: bump `TEMPLATE_VERSION` → regenerate → commit asset → verify `generate-template.spec.ts` in the same task. |
| **R-4** | *(Superseded by R-9 after Judgment Day.)* This row previously claimed DD-3 already mitigated the legacy-uneditable risk. It did not — the mitigation was an undefined word. See **R-9**. | — |
| **R-5** | Migration on RDS via the wrong script. `migrate-seed.sh` **also seeds**. | Runbook in §7; never run it whole against a live DB. |
| **R-6** | Admin table crowding with two more columns (defect class D-h — no automated gate). | Human or T6 visual check at the execute HITL pause, at `md` and `lg`. |
| **R-7** | An alias maps to a semantically wrong type (D-g). | Alias table reviewed by someone who knows the dataset; OQ-1/DD-7 is the same question one level up. |
| **R-8** | **Bulk unlock destroys specific consent evidence** by overwriting per-actor provenance with generic batch values (J-3). Silent, and it degrades precisely the audit trail this spec creates. | DD-4 option (d): fill only where `consentMethod = NOT_RECORDED`; report the preserved count in the result envelope. Explicit test with a **mixed** batch (some actors evidenced, some not). |
| **R-9** | **The guard is implemented as key-presence rather than value-change** (J-1), making every legacy `GRANTED` actor uneditable. The most likely misreading, because key-presence is this file's prevailing idiom. | DD-3 + the §4.1 truth table; the "edit district on a legacy granted actor" case is a **required** test, not an optional one. |

---

## 12. Test Plan Outline

| Requirement | Test | Level |
|---|---|---|
| FR-1, FR-2 | Round-trip write→read per field (**covers R-1**) | Integration (e2e harness) |
| FR-3 | The guard's **full §4.1 truth table**, all five rows, as a table-driven unit test | Unit (pure function) |
| FR-3 | **Edit `district` on a legacy `GRANTED` + `NOT_RECORDED` actor, sending the full object the admin form actually sends, succeeds** (**covers R-9 / J-1** — the highest-value single test in this spec) | Integration (e2e harness) |
| FR-3 | Strip-after-grant is rejected; un-publish-then-strip is allowed | Integration |
| FR-3 | Each of the four call sites rejects grant-without-provenance (**NFR-7 completeness**) | Integration per path |
| FR-3 (bulk) | Rejected batch leaves **zero** partial writes | Integration, transactional |
| FR-3 (bulk) | **Mixed batch: evidenced actors keep their own provenance, unevidenced get the batch values, envelope reports the preserved count** (**covers R-8 / J-3**) | Integration |
| FR-4 | Alias table drives normalisation; unknown values still quarantine; six existing types byte-identical | Unit (`normalize.spec.ts`) |
| FR-5 | Template columns present, version bumped, asset byte-stable, stale `v1` rejected legibly | Unit (`template-columns.spec.ts`, `generate-template.spec.ts`) |
| FR-5 | Import row asserting `GRANTED` without provenance fails **only that row** | Integration (`admin-actor-import.e2e.spec.ts`) |
| FR-6 | Table renders both columns; filters compose and URL-sync; form blocks invalid grant | Component (Testing Library) |
| FR-6 / NFR-5 | `jest-axe` clean on changed table and form | Component |
| FR-7 | Public dashboard CSV contains none of the four field names or values | Unit (`lib/dashboard/csv.test.ts`) |
| **FR-8 / NFR-1** | **Zero occurrences of the four field names on every public path, end-to-end over HTTP** | `src/test/pii-boundary.spec.ts` — **hard release gate** |
| FR-9 | Migration leaves legacy grants at `NOT_RECORDED`/`null`, still public; filter enumerates them | Integration |
| NFR-2 | Row count + field sample identical pre/post migration on local MySQL | Manual rehearsal, recorded in `execution.md` |
| NFR-6 | Update touching the fields produces an `ActorAuditLog` diff row | Unit (`actor-audit.service.spec.ts`) |
| — | `lambda-handler.e2e.spec.ts` stays green (bootstrap untouched, but DTO changes cross the parser) | e2e |

**Not automatable** (requirements §8): D-f (future-path bypass — design-mitigated, accepted), D-g (alias semantic correctness — human), D-h (table visual crowding — human or T6).
