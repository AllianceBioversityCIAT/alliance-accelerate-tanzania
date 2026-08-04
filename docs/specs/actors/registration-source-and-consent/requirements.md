# Requirements — Registration Source & Consent Provenance

- **Spec path:** `docs/specs/actors/registration-source-and-consent/`
- **Status:** Draft
- **Author / Date:** AKILI (Product Owner) on behalf of JuanCode — 2026-08-03
- **Depth:** **Standard** — raised from the proposal's `Lite` (see §9 D-1)
- **Type:** Change · **Approval Mode:** gated
- **Related:** `docs/prd.md` §4 (Protect PII), §7 AC-1/AC-6 · `docs/ux-ui/design.md` §7–8 · `docs/trd/trd.md` §3, §5, §8, ADR-003, ADR-004, QA-1/QA-2 · `proposal.md` (this folder) · parent epic `docs/specs/epic/hybrid-actor-registration/`
- **Extends (archived):** `admin/actor-crud-audit`, `admin/bulk-actor-operations`, `admin/actor-import`

---

## 1. Summary

The registry records **whether** an actor consented (`consentStatus`) but nothing about **how, when, or on what evidence**. It also cannot distinguish a record the Accelerate Tanzania team curated from one an actor submitted itself.

This spec adds **registration source** and **consent provenance** to the `Actor` entity, enforces that a publishable (`GRANTED`) actor carries real provenance on **every** write path, extends the trader taxonomy to cover the categories in the client's `Partner Profile 14.4.2026.xlsx`, and surfaces all of it in the admin console, the import template, and admin exports.

It advances PRD §4 *"Protect PII"* and AC-6, and is the data prerequisite for the whole `epic/hybrid-actor-registration` decomposition. It changes **nothing** a `Public` visitor can see.

---

## 2. Requirement Numbering & Writing Standards

Functional requirements are `FR-n`; non-functional `NFR-n`. Each is atomic, testable, and uses MUST / SHOULD / MAY per RFC 2119. Every requirement traces upward to the PRD or the parent epic's proposal, and downward to at least one task in `tasks.md`.

---

## 3. Glossary

| Term | Meaning |
|---|---|
| **Registration source** | Which track produced the record: `TEAM_MANAGED` (curated or imported by the AT team) or `SELF_REGISTERED` (submitted by the actor via the portal — set by a later spec). |
| **Consent provenance** | The evidence trail behind a consent decision: *method*, *date obtained*, *reference* to where the evidence lives. |
| **Publishable** | `consentStatus = GRANTED`. Per TRD ADR-004, only `GRANTED` actors appear in any public read or in `/metrics`. |
| **Consent write path** | Any code path that can set `consentStatus`. Today there are **four**: admin create, admin update, admin bulk set-consent, and Excel import (`actor-import.service.ts`, which has its own file-level consent gate). |
| **Acknowledgement** | The existing `acknowledged: true` flag already required when setting `GRANTED` (`admin/bulk-actor-operations` FR-4). Distinct from provenance — see §9 D-2. |

---

## 4. System Context & Scope

| | |
|---|---|
| **In** | `Actor` schema; admin create / update / bulk-consent write paths; `common/normalize.ts` taxonomy; `common/template-columns.ts` + generated template asset; `actor-import.service.ts`; admin serializer; admin actors table, filters, and form; admin export. |
| **Out** | Anything `Public` sees. The public self-registration portal (chunk 3). Workbook mapping (chunk 2). Backfilling real consent evidence for existing rows. Consent-document file storage. |
| **Unchanged** | `ConsentStatus` enum, the ADR-004 consent `WHERE`-pinning, `PII_ALLOWLIST`, the public serializer's output shape. |

---

## 5. Stakeholders / Personas

| Persona | Role | Interest |
|---|---|---|
| **Administrator** | `Admin` | Must record and audit consent evidence before publishing; sets provenance on create/edit/bulk. |
| **Field/Data-entry staff** | `Staff` | Fills the import template offline; needs the new columns to be self-explanatory. |
| **AT program lead** | business | Needs to answer *"who has consent?"* and *"who will self-register?"* from an export, not a side spreadsheet. |
| **Public visitor** | `Public` | **Must observe no change whatsoever.** |

---

## 6. Functional Requirements

### FR-1: Registration source on every actor

- **Description:** The system MUST record, for every `Actor`, whether the record originated from the team-managed track or actor self-registration. Existing records MUST default to `TEAM_MANAGED`.
- **Rationale / Source:** Client thread — *"clearly identify which actors will self-register through the portal and which ones will be uploaded from the Excel file"*; epic proposal §4.1.
- **Acceptance criteria:**

#### Scenario: Existing records after migration
- GIVEN the registry contains actors created before this change
- WHEN the migration is applied
- THEN every pre-existing actor reads back with `registrationSource = TEAM_MANAGED`
- AND no other field on any pre-existing actor changes
- AND IT MUST leave the total actor count identical before and after

#### Scenario: Admin sets the source explicitly
- GIVEN an Admin is creating or editing an actor
- WHEN they submit a payload containing a valid `registrationSource`
- THEN the value persists and appears in the admin detail response
- BUT it must NOT be accepted when the value is outside the enum — the request is rejected `400` with a field-level error

- **PII/RBAC impact:** Admin-only. Not PII, but deliberately withheld from `Public` (see FR-8 and §9 D-3).

---

### FR-2: Consent provenance fields

- **Description:** The system MUST record, per actor, the **method** by which consent was obtained, the **date** it was obtained, and a free-text **reference** pointing at the evidence.
- **Rationale / Source:** Epic proposal P-2 — a bare `GRANTED` is an unauditable assertion for the Excel track, where consent is collected by email or signed form entirely outside the platform.
- **Acceptance criteria:**

#### Scenario: Recording provenance for an out-of-band consent
- GIVEN an Admin holds a signed consent form for an actor
- WHEN they set `consentMethod = SIGNED_FORM`, `consentObtainedAt` to the signature date, and `consentReference` to the document identifier
- THEN all three persist and are returned on the admin detail read
- AND the change is captured in that actor's `ActorAuditLog` diff
- AND IT MUST reject a `consentObtainedAt` in the future with a `400`
- BUT it must NOT require a reference — `consentReference` is optional evidence-locating text, not a key

#### Scenario: Method defaults for untouched records
- GIVEN an actor whose provenance has never been set
- WHEN it is read by an Admin
- THEN `consentMethod` is `NOT_RECORDED`, `consentObtainedAt` is `null`, and `consentReference` is `null`

- **PII/RBAC impact:** Admin-only. `consentReference` MAY contain a person's name or an email thread identifier — treated as admin-only by construction rather than argued field-by-field (§9 D-3).

---

### FR-3: A publishable actor MUST carry provenance — on every write path

- **Description:** The system MUST reject any attempt to set `consentStatus = GRANTED` unless the resulting record has `consentMethod ≠ NOT_RECORDED` **and** a non-null `consentObtainedAt`. This MUST hold on **all four** consent write paths: admin create, admin update, admin bulk set-consent, and Excel import.
- **Rationale / Source:** TRD ADR-004 calls consent *"the legal/ethical basis for publishing at all."* A rule enforced on three of four paths is not a rule — the fourth becomes the way it gets bypassed.

> **Trigger semantics (normative — J-1).** The rule fires on a **value change**, never on mere field presence in the request body. Specifically, it fires when the **effective post-write** `consentStatus` is `GRANTED` **AND** either
> **(a)** the **stored** `consentStatus` was not `GRANTED` — a transition *into* published state — **or**
> **(b)** the write changes any provenance field to a value **different from** what is stored.
>
> This distinction is normative, not stylistic. `frontend/components/admin/ActorForm.tsx` submits a **full object** on every save — `consentStatus` is always present in the body regardless of what the Admin actually edited. A presence-based reading would therefore reject a pure `district` edit on any legacy `GRANTED` record, making every such record permanently uneditable. The codebase already solved this once: the existing acknowledgement check at `backend/src/actors/actors-admin.service.ts:221-224` is deliberately transition-scoped (`before.consentStatus !== GRANTED`). This requirement follows that precedent.

- **Acceptance criteria:**

#### Scenario: Create with GRANTED but no provenance
- GIVEN an Admin creates an actor with `consentStatus = GRANTED` and `acknowledged = true`
- WHEN the payload omits `consentMethod` or `consentObtainedAt`
- THEN the request is rejected `400` with a field-level error naming the missing field
- AND no actor row is created
- AND IT MUST NOT be satisfiable by `acknowledged` alone — acknowledgement and provenance are independent gates (§9 D-2)

#### Scenario: Update that transitions an actor to GRANTED
- GIVEN an existing actor with `consentStatus = UNKNOWN` and `consentMethod = NOT_RECORDED`
- WHEN an Admin patches only `consentStatus` to `GRANTED`
- THEN the request is rejected `400`
- AND the actor's stored `consentStatus` remains `UNKNOWN`
- BUT it must NOT reject when the same request also supplies a valid method and date

#### Scenario: Bulk unlock
- GIVEN an Admin selects actors and bulk-sets `consentStatus = GRANTED`
- WHEN the request does not carry a `consentMethod` and `consentObtainedAt` to apply
- THEN the whole request is rejected `400` and **no** actor in the batch is modified
- AND the batch remains transactional — a rejection leaves zero partial writes

#### Scenario: Bulk unlock MUST NOT overwrite existing, more specific evidence (J-3)
- GIVEN a batch selection mixing actors that already carry per-actor provenance (e.g. `SIGNED_FORM` with its own date) and actors with `consentMethod = NOT_RECORDED`
- WHEN an Admin bulk-unlocks the selection with a batch method and date
- THEN each batch value is applied **only** to the provenance fields a row is actually missing — a row lacking a method or a date is filled on exactly the fields it lacks
- AND every actor that already carried provenance keeps its own method, date, and reference **unchanged**
- AND the result envelope reports how many actors were left untouched because they already held evidence
- BUT it must NOT silently replace specific evidence with generic batch values — that would destroy the audit trail this spec exists to create
- AND IT MUST still leave **every** actor in the batch ending `GRANTED` **with** provenance, so the invariant holds for the whole selection

#### Scenario: Evidence cannot be stripped from a published actor
- GIVEN an actor that is `GRANTED` with `consentMethod = SIGNED_FORM` and a recorded date
- WHEN an Admin submits a write setting `consentMethod` back to `NOT_RECORDED` (or clearing `consentObtainedAt`) while leaving it `GRANTED`
- THEN the request is rejected `400`
- AND the stored provenance is unchanged
- BUT it must NOT block the same change when the write also moves `consentStatus` away from `GRANTED` — un-publishing and then clearing evidence is legitimate

#### Scenario: Editing a field unrelated to consent
- GIVEN an actor that is already `GRANTED` but was granted before this change and has `consentMethod = NOT_RECORDED`
- WHEN an Admin edits only its `district` through the admin form — which submits `consentStatus: GRANTED` and `consentMethod: NOT_RECORDED` in the body because it always sends a full object
- THEN the edit succeeds
- AND IT MUST succeed **specifically because no value changed** — stored `GRANTED` equals submitted `GRANTED`, stored `NOT_RECORDED` equals submitted `NOT_RECORDED`, so neither trigger (a) nor (b) fires
- BUT it must NOT be implemented as "is `consentStatus` a key in the body?" — under that reading this scenario fails and every legacy granted actor becomes uneditable

---

### FR-4: Extended trader taxonomy

- **Description:** `TRADER_TYPES` MUST additionally accept `humanitarian`, `digital_service_provider`, `qds_producer`, and `bulk_buyer`, with case-insensitive source aliases for the spellings present in the client workbook.
- **Rationale / Source:** Epic proposal P-4 — roughly 590 of ~1,318 incoming rows carry a category with no canonical code and would quarantine on `traderType` alone.
- **Acceptance criteria:**

#### Scenario: Workbook category values normalise
- GIVEN source values `INGO`, `Digital Service Provider`, `cbo`, and `Bulk buyer`
- WHEN each is normalised
- THEN each resolves to its canonical code without quarantine
- AND IT MUST remain case- and whitespace-insensitive (`"  INGO "` resolves identically)
- BUT it must NOT silently resolve an ambiguous or unknown value — anything unmapped still quarantines rather than defaulting to a type

#### Scenario: Existing six types are unaffected
- GIVEN any of the six pre-existing trader types
- WHEN it is normalised or validated
- THEN the result is byte-identical to the behavior before this change

- **PII/RBAC impact:** None. `traderType` is public today and stays public.

---

### FR-5: Import template carries the new columns

- **Description:** The import template MUST gain columns for registration source and the three provenance fields, with constrained dropdown values where the field is an enum. `TEMPLATE_VERSION` MUST be bumped and the committed `.xlsx` asset regenerated.
- **Rationale / Source:** Client thread — Daniela's two requested tracking columns; epic proposal §4.2.
- **Acceptance criteria:**

#### Scenario: A newly downloaded template round-trips
- GIVEN an Admin downloads the template after this change
- WHEN they fill the new columns and upload it
- THEN the values are parsed into the corresponding actor fields
- AND the Instructions sheet lists the allowed values for each new enum column
- AND IT MUST enforce FR-3 on import exactly as on the admin write paths — an import row asserting `GRANTED` without provenance fails **that row** with a reason, and does not corrupt the rows around it

#### Scenario: A stale template is rejected legibly
- GIVEN a template generated before this change (`TEMPLATE_VERSION = v1`)
- WHEN it is uploaded
- THEN the response tells the user the template is out of date and to re-download it
- BUT it must NOT fail with an opaque parse or column-mismatch error

---

### FR-6: Admin console surfaces source and consent provenance

- **Description:** The admin actors table MUST display registration source and consent (status **with** method), MUST allow filtering by both, and the admin create/edit form MUST capture all four fields in a dedicated section.
- **Rationale / Source:** Epic proposal §4.3; without a UI the fields are invisible to the people who must maintain them.
- **Acceptance criteria:**

#### Scenario: Filtering to find publishable-but-unevidenced actors
- GIVEN a registry containing a mix of sources and consent states
- WHEN an Admin filters by `consentStatus = GRANTED` and `consentMethod = NOT_RECORDED`
- THEN only the legacy actors lacking provenance are listed
- AND the filter state is URL-synced so the view is shareable

#### Scenario: Form blocks an unevidenced grant before submission
- GIVEN an Admin is editing an actor in the form
- WHEN they select `consentStatus = GRANTED` without a method or date
- THEN the form surfaces a field-level error and does not submit
- AND IT MUST also be rejected server-side if the client guard is bypassed (FR-3) — the client check is UX only
- AND the error MUST be associated with its input via `aria-describedby` and announced in a live region

#### Scenario: Small-screen behavior
- GIVEN the admin actors table below `lg`
- WHEN the new columns are present
- THEN the table is not rendered at all — a stacked card per actor renders instead, each carrying the Source badge and the Consent status-chip-plus-method-caption alongside the actor's other fields
- BUT it must NOT truncate or drop the new columns' values silently (met: both new values render in full on every card)

#### Scenario: Small-screen behavior at `lg` and up
- GIVEN the admin actors table at `lg` or wider
- WHEN the row count of columns exceeds the viewport width — which it reliably does once the persistent admin sidebar is subtracted from the available width
- THEN the table scrolls horizontally within its container, and the checkbox and Trader (row-identifying) columns stay sticky at the left edge so an admin can select and identify a row while any scrolled-to column, including Consent, is in view
- BUT it must NOT truncate or drop the new columns' values silently

> **Scope correction (2026-08-04, approved by JuanCode mid-execution).** The original scenario's GIVEN — "the admin actors table on a viewport narrower than `md`" — is unsatisfiable as written: below `md` there is no `<table>` to scroll. `ActorsTable.tsx` renders `hidden md:block` for the table and a `md:hidden` stacked-card list instead; `design.md` §5 shared the same false premise ("the existing table pattern already does this"). Discovered during T-10's requirement-level review (see `execution.md` → T-10, "the third unowned requirement") and assigned to T-8, which still owns the table.
>
> The scenario above is split in two to describe what actually ships: the card list below `md` (already correct — nothing was dropped or truncated), and the sticky-first-column table at `md` and up, where the crowding this requirement cares about actually occurs — most acutely at `lg`, where the sidebar narrows the available width. The "MUST NOT truncate or drop values silently" clause is unchanged and is met on both halves.

> **Scope correction (2026-08-04, approved by JuanCode mid-execution, second pass).** The correction directly above set the table's threshold at `md` and up. A live D-h visual check (browser harness, not jsdom) measured the actual scroll container at three widths and found `md` itself unusable, not merely crowded:
>
> | viewport | scroll container | frozen (checkbox + Trader) | scrollable strip | non-frozen content hidden |
> |---|---|---|---|---|
> | `md` 768px | ~494px | ~81% | ~94px | ~1036px |
> | `lg` 1024px | ~718px | ~56% | ~318px | ~812px |
> | `xl` 1280px | ~974px | ~41% | ~574px | ~556px |
>
> At `md`, Consent — the column this spec exists to surface — rendered as unreadable fragments ("lished", "ecorded — no ev"). The Trader-cell width clamp (T-8 increment, same date) improved the scrollable strip at `md` from ~45px to ~94px but did not make it usable. At `lg` the sticky columns do the job FR-6 describes.
>
> The threshold in the scenarios above is therefore `lg`, not `md`: `ActorsTable.tsx` now renders `hidden lg:block` for the table and `lg:hidden` for the stacked-card list — `md` gets the card treatment, same as everything below it. This does not reopen the first correction's finding (the GIVEN-below-`md` scenario was and remains unsatisfiable); it moves where the satisfiable table scenario begins. `frontend/CLAUDE.md`'s description of the admin table pattern is stale against this and is being synced separately, outside this task.

---

### FR-7: Export safety — public exports MUST NOT carry the new fields

- **Description:** No `Public`-scope export may contain `registrationSource`, `consentMethod`, `consentObtainedAt`, or `consentReference` — not as values, not as empty columns, not as headers.
- **Rationale / Source:** PRD AC-6; extends FR-8's boundary to the export path, which is a read path that bypasses the API serializer.
- **Acceptance criteria:**

#### Scenario: Public dashboard export stays clean
- GIVEN actors with provenance recorded
- WHEN the public Discovery Dashboard CSV is generated
- THEN none of the four field names or values appear anywhere in the output
- AND IT MUST hold by **construction** — `frontend/lib/dashboard/csv.ts` serializes `PublicActor` through a named public-column allowlist and explicitly forbids spread operators over actor objects; the new fields are not on `PublicActor` and must not be added to it
- BUT it must NOT be satisfied by filtering them out after the fact — the allowlist is the mechanism

> **Scope correction (discovered during Phase 3 exploration).** The original FR-7 also required an **Admin**-scope export to carry the four fields. **There is no admin export to carry them.** The only CSV path in the product is `frontend/lib/dashboard/csv.ts` (public Discovery Dashboard); `GET /api/v1/export` appears in `docs/trd/trd.md` §4 but is **not implemented**, and no admin export UI exists.
>
> Building one is a feature in its own right, well outside this spec's proposal. The positive half of FR-7 is therefore **deferred**: whenever an admin export is built, it must include these four fields, and that obligation is recorded in §13 OQ-5 rather than silently dropped.
>
> **This does not block the client's stated workflow.** The thread describes the AT team tracking consent *in their own spreadsheet* and uploading it — which FR-5's template columns serve directly. An export out of the portal was an inference of mine, not something the client asked for.

---

### FR-8: The new fields are never public

- **Description:** No public read path — `/actors`, `/actors/:id`, `/metrics`, public export — may expose `registrationSource`, `consentMethod`, `consentObtainedAt`, or `consentReference`.
- **Rationale / Source:** TRD §8, ADR-003, QA-1. See §9 D-3 for why these are admin-only rather than argued individually.

> **Scope correction (2026-08-03, approved by JuanCode during T-7 execution).** This description originally also named **`/actors/geo`**, inherited from `docs/trd/trd.md` QA-1. **That endpoint does not exist** — `backend/src/actors/actors.controller.ts` declares only `@Get()` and `@Get(':id')`, and two independent sweeps of `backend/src` and `frontend/` found no `geo` route, controller, or caller. It appears in the TRD (QA-1, QA-6) as a *planned* lightweight map-points feed. This mirrors the correction already recorded above for FR-7's admin export, which likewise does not exist.
>
> **The protected surface is covered regardless:** the public map and directory reach their data through `frontend/lib/api/actors.ts` → `GET /api/v1/actors` and `GET /api/v1/actors/{id}`, both of which this requirement asserts. When `/actors/geo` is eventually built, it inherits the assertion automatically — `pii-boundary.spec.ts` iterates the union of `PII_ALLOWLIST` and `NEVER_PUBLIC_FIELDS` rather than a hand-maintained list, so the new path only needs to be added to the suite's path loop.
>
> **TRD drift, pre-dating this spec:** `docs/trd/trd.md` documents `/actors/geo` in its API surface table (§157), its map description (§179), its tactics (§286), and quality-attribute scenarios QA-1 and QA-6, as though it were implemented. That divergence is out of this spec's scope — it belongs to `/akili-audit`.
- **Acceptance criteria:**

#### Scenario: Public response bodies
- GIVEN an actor with every new field populated
- WHEN an anonymous visitor requests it on **any** public path
- THEN the response body contains **zero** occurrences of the four field names and their values
- AND IT MUST be asserted end-to-end over HTTP in `src/test/pii-boundary.spec.ts`, not only at the serializer unit level
- BUT it must NOT be achieved by omitting them from one serializer while another read path selects `*`

---

### FR-9: Legacy `GRANTED`-without-provenance is reported, never invented

- **Description:** The system MUST make it possible for an Admin to list actors that are `GRANTED` but lack provenance. The migration MUST NOT populate provenance for such rows.
- **Rationale / Source:** Epic proposal R-4 — inventing consent evidence to make the data look complete would breach the very ADR (ADR-004) this spec exists to strengthen.
- **Acceptance criteria:**

#### Scenario: Migration leaves legacy grants visibly incomplete
- GIVEN pre-existing actors with `consentStatus = GRANTED`
- WHEN the migration is applied
- THEN those actors have `consentMethod = NOT_RECORDED` and `consentObtainedAt = null`
- AND they remain publicly visible (their `consentStatus` is untouched)
- AND IT MUST be possible for an Admin to enumerate exactly this set via the FR-6 filter
- BUT it must NOT guess, infer, or backfill a method or date for any of them

---

## 7. Non-Functional Requirements

| ID | Requirement | Measure |
|---|---|---|
| **NFR-1** | The PII/consent boundary MUST NOT regress. | `src/test/pii-boundary.spec.ts` green, extended to cover the four new fields on every public path. **Hard release gate.** |
| **NFR-2** | The migration MUST be additive and lossless. | Row count and a field-level sample identical before/after on the local MySQL rehearsal; no `DROP`, no `NOT NULL` added to an existing nullable column. |
| **NFR-3** | Template, DTO validation, and normalizer MUST NOT drift. | `template-columns.spec.ts` and `generate-template.spec.ts` green; allowed-value lists derived from the canonical constants, never re-typed. |
| **NFR-4** | The generated template asset MUST stay byte-stable. | `generate-template.spec.ts` asserts the committed `.xlsx` matches a fresh generation. |
| **NFR-5** | New admin UI MUST meet WCAG 2.1 AA. | `jest-axe` clean on the changed table and form; labels associated, errors in a live region, visible focus rings, contrast per `docs/ux-ui/design.md` §7. |
| **NFR-6** | Every change to the new fields MUST be auditable. | The four fields appear in the `ActorAuditLog` diff for admin updates; bulk consent writes `BULK_CONSENT` rows as today. |
| **NFR-7** | The FR-3 rule MUST have exactly one implementation. | A single shared guard consulted by all three write paths **and** the importer; asserted by a test that exercises each path against the same rule. |
| **NFR-8** | No hardcoded colors or geometry. | New chips and form controls use `docs/ux-ui/design.md` §7 tokens; reuse the existing status-chip pattern rather than new geometry. |

---

## 8. Defect Classes & Their Gates

Per the AKILI gate rule: a gate blind to the defect class this spec most often produces is not a gate. Each class below is mapped to the command that catches it — or explicitly marked unsubstituted.

| # | Defect class this spec can produce | Gate | Automated? |
|---|---|---|:-:|
| D-a | A new field leaks to `Public` | `src/test/pii-boundary.spec.ts` (end-to-end over HTTP) | ✅ |
| D-b | Migration loses or mutates existing data | Local MySQL rehearsal + pre/post row-count and sample assertion | ✅ |
| D-c | Template ↔ DTO ↔ normalizer drift | `template-columns.spec.ts`, `normalize.spec.ts` | ✅ |
| D-d | Regenerated template asset differs byte-wise | `generate-template.spec.ts` | ✅ |
| D-e | `GRANTED` set without provenance on **some** of the four paths | Per-path unit tests (create, update, bulk, import) against the shared guard (NFR-7) | ✅ |
| D-f | **A future write path bypasses the FR-3 guard** | Centralising the rule (NFR-7) makes bypass require deliberately not calling it — but *completeness over future paths* is not machine-checkable | ⚠️ **Partial** |
| D-g | **A taxonomy alias maps to the semantically wrong type** (e.g. is `cbo` really `qds_producer`?) | `normalize.spec.ts` proves the mapping is *applied*; it cannot prove the mapping is *correct* | ❌ **Human** |
| D-h | **Admin table becomes crowded/unreadable with 2 more columns**; chip contrast or wrapping regressions | `jest-axe` checks DOM semantics and contrast, **not** layout crowding or visual balance | ❌ **Human / T6** |

**Substitutions and accepted risks:**

- **D-f** — mitigated by design (NFR-7), not by a command. Accepted residual risk, recorded here rather than papered over.
- **D-g** — **human check at the Phase 1 HITL pause.** The alias table must be read and confirmed by someone who knows the dataset; OQ-1 below is the same question at the taxonomy level. This is a client-facing question, not a code question.
- **D-h** — **human check at the `/akili-execute` HITL pause**, or a T6 Multimodal visual review of the rendered admin table at `md` and `lg` breakpoints. Per the model registry's cross-host dispatch note, T6 routes to Antigravity/Gemini vision.

---

## 9. Design-Relevant Decisions Surfaced During Requirements

These arose from reading the code and change what the proposal assumed. They are recorded here because they alter scope; the design rationale lives in `design.md`.

### D-1: Depth raised `Lite` → `Standard`

The proposal estimated *Lite* ("additive migration + template regeneration + admin surfacing"). Inspection found the change touches **all four** consent write paths, the template generator and its committed asset, the admin serializer, the `SCALAR_FIELDS` allowlist, two frontend surfaces, and the PII boundary test. That is 8–10 tasks, not one. Specifying it as `Lite` would have under-resourced the FR-3 completeness problem, which is the risky part.

### D-2: Provenance is a **second, independent** gate on `GRANTED` — not a replacement for `acknowledged`

The codebase already rejects `GRANTED` without an acknowledgement in **four** places: `actors-admin.service.ts` create (~L137), update (~L224), and `bulkSetConsent` (~L346) per archived `admin/bulk-actor-operations` FR-4; plus `actor-import.service.ts` `applyConsentGate` (~L558) with a **file-level** acknowledgement per archived `admin/actor-import` FR-6.

These answer different questions. `acknowledged` asks *"do you, the Admin, accept responsibility for publishing this PII right now?"* — a **deliberateness** check. Provenance asks *"what evidence exists that the actor agreed?"* — an **evidence** check. Collapsing them would let a confident Admin publish with no evidence, or a well-evidenced record publish by accident. Both gates stay, and both must pass.

### D-3: `bulkSetConsent` is the load-bearing case

`bulkSetConsent` can set `GRANTED` on up to **500** actors in one call and currently takes no per-actor consent data. If it were exempted from FR-3, it would become the standard way to publish without evidence — the exact hole this spec exists to close, opened by the spec that closes it.

The proposal did not anticipate this. It is now in scope: `BulkConsentDto` gains a method and date, required when unlocking. This is the single largest addition over the approved proposal.

**Amended after Judgment Day (J-3).** The first draft said the batch values apply *uniformly to every actor*. That is wrong: `bulkSetConsent` writes a single `updateMany` with no per-actor read (`backend/src/actors/actors-admin.service.ts:373-376`), so uniform application would overwrite specific evidence already recorded on individual actors with the batch's generic values — silently degrading the audit trail this spec exists to build. Batch values now **fill only where provenance is missing**, and the result envelope reports how many actors were left untouched. See FR-3's bulk scenarios.

### D-4: All four new fields are admin-only by construction

Rather than arguing each field's sensitivity, the whole group is withheld from `Public`. `consentReference` may name a person or an email thread; `consentMethod`/`consentObtainedAt` describe internal governance; `registrationSource` could imply a quality judgement about a record. Admin-only is both safer and cheaper to reason about than four separate determinations — and it means FR-8 is one assertion, not four.

They are **not** added to `PII_ALLOWLIST`, because that constant declares *PII on the Actor that the public serializer must hide*. These fields are simply never selected into the public projection. Whether that distinction should be collapsed is **OQ-3**.

---

## 10. Data & Schema Impact

Additive only. Reference `docs/trd/trd.md` §3.

| Change | Kind | Notes |
|---|---|---|
| `RegistrationSource` enum | New | `TEAM_MANAGED` (default), `SELF_REGISTERED` |
| `ConsentMethod` enum | New | `NOT_RECORDED` (default), `PORTAL_CHECKBOX`, `SIGNED_FORM`, `EMAIL`, `VERBAL_FIELD` |
| `Actor.registrationSource` | New column | Non-null, defaulted |
| `Actor.consentMethod` | New column | Non-null, defaulted |
| `Actor.consentObtainedAt` | New column | Nullable `DateTime` |
| `Actor.consentReference` | New column | Nullable, length-bounded string |
| Index on `registrationSource` | New | Supports the FR-6 filter |

**New PII fields:** none declared. See D-4 and OQ-3 — the fields are admin-only but are not added to `PII_ALLOWLIST`, and that choice needs confirmation.

`PORTAL_CHECKBOX` is defined here but **never set by this spec** — chunk 3 (`actors/public-self-registration`) is its only writer. It is declared now so chunk 3 needs no second migration.

---

## 11. Out of Scope

- The public self-registration form and review queue (chunk 3) and information requests (chunk 4).
- Mapping the 8-sheet `Partner Profile 14.4.2026.xlsx` (chunk 2). This spec only makes the taxonomy and template **able** to receive it.
- Backfilling real consent evidence for existing records — an AT-team data task (FR-9 makes the gap visible; filling it is manual).
- Storing consent documents (no file upload / S3 evidence store). `consentReference` is a text pointer.
- Any change to `ConsentStatus`, ADR-004 `WHERE`-pinning, or the public serializer's output shape.
- Any change to what `Public` can see.

---

## 12. Dependencies & Assumptions

| | |
|---|---|
| **Upstream** | None. This is the first chunk of the epic. |
| **Downstream** | `actors/public-self-registration` and `import-export/partner-profile-onboarding` both depend on this. |
| **AWS** | Migration applied to dev RDS per `backend/CLAUDE.md` (`DATABASE_URL` composed in-process from Secrets Manager, never written to a file). All commands `--profile IBD-DEV`. |
| **A-1** | `consentReference` is free text, not a foreign key to a document store. If evidence files are wanted later, the column becomes an S3 key — a follow-up spec. |
| **A-2** | Legacy `GRANTED` actors stay published while their provenance is unrecorded. Retro-hiding them would remove ~existing public data without the program asking. FR-9 makes the gap auditable instead. **If the program prefers retro-hiding, that inverts FR-9 — confirm before execution.** |
| **A-3** | The four new trader types belong on `traderType`. See OQ-1. |

---

## 13. Open Questions

| ID | Question | Blocks | Owner |
|---|---|---|---|
| **OQ-1** | Should `humanitarian` and `digital_service_provider` be trader **types**, or a separate `sector`/`category` dimension? Overloading `traderType` is expedient; a second dimension is cheap now and expensive after ~1,000 rows carry a value. | FR-4 design, and the D-g human check | Architect + client |
| **OQ-2** | Is `VERBAL_FIELD` consent legally sufficient for publication, or admissible for the record but blocked from `GRANTED`? | One validation branch in FR-3 | Program / legal |
| **OQ-3** | Should the four fields be added to `PII_ALLOWLIST` (making the existing machinery hide them) or stay admin-only-by-omission (D-4)? The allowlist's documented meaning is *PII*, and `registrationSource` is not PII — but a single mechanism is harder to get wrong than two. | FR-8 implementation | Architect |
| **OQ-4** | Confirm A-2: legacy `GRANTED`-without-provenance actors stay published. | FR-9 | Program |
| **OQ-5** | **No admin export exists** (`GET /api/v1/export` is in TRD §4 but unimplemented; the only CSV is the public dashboard's). Does the AT team need one, or is tracking consent in their own workbook + the template columns (FR-5) sufficient? If an admin export is built later, it MUST include the four new fields — recorded here so the obligation is not lost. | Nothing in this spec; a future export spec | Program |

---

## 14. Requirement ID Index

| ID | Title | Covered by tasks |
|---|---|---|
| FR-1 | Registration source on every actor | T-1, T-3, T-8 |
| FR-2 | Consent provenance fields | T-1, T-3, T-8, T-9 |
| FR-3 | Publishable actor MUST carry provenance — every write path | **T-2**, T-3, T-4, T-6, T-9, T-10 |
| FR-4 | Extended trader taxonomy | T-5 |
| FR-5 | Import template carries the new columns | T-6 |
| FR-6 | Admin console surfaces source and provenance | T-8, T-9, T-10 |
| FR-7 | Export safety — public exports carry none of the fields | T-7 |
| FR-8 | The new fields are never public | **T-7** *(release gate)* |
| FR-9 | Legacy `GRANTED`-without-provenance reported, never invented | T-1 *(no backfill)*, T-8 *(enumeration filter)* |
| NFR-1 | PII boundary must not regress | T-7 |
| NFR-2 | Migration additive and lossless | T-1 |
| NFR-3 | No template / DTO / normalizer drift | T-5, T-6 |
| NFR-4 | Template asset byte-stable | T-6 |
| NFR-5 | WCAG 2.1 AA on new admin UI | T-8, T-9, T-10 |
| NFR-6 | Changes to the new fields are auditable | T-3, T-4 |
| NFR-7 | The FR-3 rule has exactly one implementation | T-2 |
| NFR-8 | No hardcoded colors or geometry | T-8, T-9 |

Every requirement maps to at least one task; every task traces back to at least one requirement.

---

**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport` (`common/pii-consent.policy.ts`). All AWS commands use `--profile IBD-DEV`.
