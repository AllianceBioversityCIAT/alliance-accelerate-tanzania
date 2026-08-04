# Proposal — Hybrid Actor Registration (Epic Umbrella)

> **This is an umbrella.** It records the decomposition, the build order, and the decisions taken from the client thread. It is **not** itself specified or executed — each child chunk below has its own `proposal.md` and its own `/akili-specify` run.

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `epic/hybrid-actor-registration` |
| Slug | `hybrid-actor-registration` — **derived from free-text argument** (client thread on three registration options + new Partner Profile workbook) |
| Proposal date | 2026-08-03 |
| Author | AKILI (Leader) on behalf of JuanCode |
| **Type** | **Change** (epic — decomposed into 4 bounded changes) |
| **Approval Mode** | **gated** (no explicit end-to-end mandate given) |
| Status | Draft — awaiting approval |
| Source | Client thread (Daniela + Accelerate Tanzania lead), `Partner Profile 14.4.2026.xlsx` (2026-04-14), mockup strip |

## 2. Intent

The client chose a **hybrid** of registration options 1 and 2: some actors (all NGOs, all seed companies, some traders) **self-register through the portal** and accept consent there; the rest are **onboarded from the Excel workbook by the Accelerate Tanzania team**, with consent obtained out-of-band **before** publication.

The platform must therefore (a) know, per actor, **which track it came from**, (b) know **whether and how consent was obtained**, and (c) grow a **public submission + admin review loop** it does not have today.

## 3. Problem / Current Behavior

| # | Today | Consequence |
|---|---|---|
| P-1 | Actors enter only through the admin console or Admin `.xlsx` import. There is no public write path of any kind. | Option 1 is not buildable today; the PRD lists it as **out of scope for v1** (§5). |
| P-2 | `consentStatus` records *whether* consent is `GRANTED` — but not **who obtained it, when, how, or against which policy text**. | For Excel-track actors, "consent obtained before publishing" is an unauditable claim. There is no evidence trail behind a `GRANTED` flag. |
| P-3 | Nothing distinguishes a team-curated record from an actor-submitted one. | The client's request to "clearly identify which actors self-register and which are uploaded from Excel" has nowhere to live. |
| P-4 | `TRADER_TYPES` covers 6 types: `seed_company · cooperative · ngo · offtaker · research_institute · informal_trader`. | The new workbook carries **humanitarians/INGOs, digital service providers, QDS seed producers, and bulk buyers** — four categories with no canonical code, so those ~700 rows cannot be imported without falling into quarantine. |
| P-5 | The canonical import template is one flat Data sheet. `Partner Profile 14.4.2026.xlsx` is **8 sheets, ~1,318 data rows, 8 different schemas**, with header rows at row 1, 2, *and* 3, and the same concept spelled differently per sheet (`Trader_id` / `Trader_ID`, `gpslatitude` / `gps-Latitude` / `Latitude` / `latitude`). | The workbook cannot be uploaded as-is. Some mapping step must exist, and where it lives is the single largest scoping decision in this epic. |

### 3.1 What already exists (do not rebuild)

Consent is **not** greenfield. The following is built, tested, and constitutionally locked — the chunks below extend it, never replace it:

- `ConsentStatus` enum (`GRANTED` / `DENIED` / `UNKNOWN`, default `UNKNOWN`) on `Actor`.
- Consent pinned in the **Prisma `WHERE`**, not the serializer — non-`GRANTED` actors are absent from every public read *and* from `/metrics` (TRD ADR-004, QA-2).
- Exact GPS consent-gated; `PII_ALLOWLIST` as the single runtime source of truth (`common/pii-consent.policy.ts`).
- A `Consent Status` column already in the import template (`common/template-columns.ts`).
- End-to-end proof in `src/test/pii-boundary.spec.ts` — a **hard release gate**.

Daniela's proposed *"Consent obtained"* column is therefore largely **already shipped**. The real gap is **provenance**, not the flag.

### 3.2 The client workbook, measured

| Sheet | Data rows | Header row | Shape | Fits flat `Actor`? |
|---|---:|:---:|---|---|
| `Offtaker_Beans` | ~436 | 1 | Closest to canonical (Trader_id … gpsaccuracy) | **Yes** |
| `Offtaker_Sorghum` | ~128 | 1 | Same concepts, renamed headers, adds `Town`, no Email | **Yes** |
| `Offtaker_Groundnuts` | ~151 | 1 | No Region column; adds `Need for Tecncal support` | **Yes**, region must be derived from district |
| `Bulk buyers_beans` | ~229 | **3** | Aggregation capacity, contract/non-contract grain pricing, farmer counts | **Partly** — trade metrics have no home |
| `Humantarian` | ~39 | **2** | Org + contact person + designation + activity type | **Yes**, as `humanitarian` |
| `Digital Service Provider` | ~14 | **2** | Org + contact person + website | **Yes**, as `digital_service_provider` |
| `Seed Company` | ~10 | 1 (+ sub-header row 2) | Bean trade profile: volumes, demand, USD value, challenges, split lat/long cells | **Partly** |
| `QDS_ Seed producers` | ~311 | 1 | **~60 columns** of season/variety/planting/harvest/sales, incl. up to 20 buyer-contact columns | **No** — this is production data, not actor metadata |

**Total ≈ 1,318 rows**, but rows ≠ organisations: the QDS sheet is one row per producer × season × variety.

## 4. Proposed Outcome

1. Every actor record carries **`registrationSource`** (`TEAM_MANAGED` | `SELF_REGISTERED`) and **consent provenance** (`consentMethod`, `consentObtainedAt`, `consentReference`) — visible in the admin console and exportable.
2. The **canonical import template** gains the matching columns, so the AT team can track both of Daniela's requested columns in the workbook they actually upload.
3. Actors can **self-register through the public portal**, read and accept the consent policy in-flow, and receive a reference code. Nothing they submit is public until an Admin approves it.
4. Admins get a **Registrations queue** to approve-and-publish, reject, or ask for more information — with the "consent is on file" confirmation gate the mockup shows.
5. The 8-sheet workbook is onboarded through a **documented mapping into the canonical template**, with the four missing trader types added to the taxonomy.

## 5. Decomposition & Build Order

Scored with RICE (`product-manager-toolkit`). *Reach* = records or actors touched; *Effort* in person-weeks.

| # | Chunk | Spec path | R | I | C | E | **RICE** | Depends on | Parallel-safe |
|---|---|---|---:|:-:|:-:|:-:|---:|---|:-:|
| **1** | Registration source & consent provenance | `actors/registration-source-and-consent` | 1318 | 3 | 1.0 | 0.5 | **7908** | none | n/a (first) |
| **2** | Partner Profile workbook onboarding | `import-export/partner-profile-onboarding` | 1318 | 3 | 0.7 | 1.5 | **1845** | Chunk 1 | **yes** (vs. 3) |
| **3** | Public self-registration + review queue | `actors/public-self-registration` | ~150 | 3 | 0.8 | 3.0 | **120** | Chunk 1 | **yes** (vs. 2) |
| **4** | Registration information requests | `admin/registration-info-requests` | ~40 | 2 | 0.8 | 1.0 | **64** | Chunk 3 | no |

**Build order: 1 → (2 ∥ 3) → 4.**

Chunk 1 is a hard prerequisite for everything: chunk 2 needs the template columns and the extended taxonomy; chunk 3's approve-and-publish step writes exactly the fields chunk 1 introduces. Chunks 2 and 3 touch disjoint modules (`import` + template asset vs. a new `registrations` module + public/admin UI) and can run concurrently in separate worktrees per the fleet pattern.

Chunk 4 is deliberately last and independently droppable — the loop in chunks 1–3 is complete and shippable without it (an Admin can reject with a reason and ask the applicant to resubmit).

## 6. Scope

**In scope (across the four chunks):** actor-level registration-source and consent-provenance fields; import-template columns; taxonomy extension to 10 trader types; a public registration submission endpoint and form with in-flow consent; an admin review queue with approve/publish, reject, and request-info; a documented mapping runbook for the 8-sheet workbook.

**Out of scope for the whole epic:**

- **Option 3** (actors filling the Excel themselves) — the client dropped it in favour of 1 + 2.
- **Ingesting the QDS production dataset** (seasons, varieties, planting/harvest, per-buyer sales). It is a different domain object from `Actor`; representing it is a separate epic if the program wants it.
- **Bulk-buyer trade metrics and seed-company commercial profiles** (grain pricing, USD value, challenges narrative). Those columns are dropped at mapping time; only the organisation-shaped fields are onboarded.
- **Actor self-service editing after publication.** An approved actor cannot log in and change its own record; corrections go through the AT team.
- **Public accounts / a public Cognito user pool.**
- **Swahili localisation** of the registration form and consent policy (English-only, consistent with v1 — but copy must stay externalizable).
- **The legal text of the consent policy itself.** Engineering ships the mechanism and versions the text; the program/legal team supplies the wording.

## 7. Affected Users, Systems, And Specs

| Area | Impact |
|---|---|
| **Users** | New: prospective actors (anonymous, self-registering). Changed: Admin gains a review queue; AT team gains consent-tracking columns. |
| **Backend** | `actors` (schema + serializers + admin surface), `import` (template + taxonomy), **new** `registrations` module, `common/normalize.ts`, `common/template-columns.ts` (bump `TEMPLATE_VERSION`), `common/pii-consent.policy.ts` (review, likely unchanged). |
| **Frontend** | **New** public `/register` + `/register/status`; **new** `(admin)/admin/registrations`; changed admin actors table/form (source + consent provenance). |
| **Data** | Additive Prisma migrations only (2 enums + 4 `Actor` columns in chunk 1; 1 enum + 1 model in chunk 3). Regenerated template asset. |
| **Infra** | SES sending for applicant notifications (chunk 3) — see R-3. No new stacks expected. |
| **Constitutional** | **PRD §5 must be amended** — "Self-service public registration / actor self-onboarding" moves from Out-of-Scope to In-Scope, with a new user story and acceptance criterion. **TRD** gains the `registrations` module (§2), the new entities (§3), the new endpoints (§4), and at least one ADR for the public write path. **`docs/ux-ui/design.md`** gains the register/status/queue screens in §2 and §4. |

## 8. Requirement Delta Preview

### ADDED

- Per-actor registration source and consent provenance (method, date, reference), surfaced in admin UI and export.
- Two import-template columns for source + consent provenance; `TEMPLATE_VERSION` bump.
- Four trader types: `humanitarian`, `digital_service_provider`, `qds_producer`, `bulk_buyer` (+ source-value aliases).
- Public, unauthenticated registration submission with in-flow consent acceptance and a returned reference code.
- Admin registration queue with approve-and-publish / reject / request-info and a consent confirmation gate.
- Audit coverage for registration adjudication.

### MODIFIED

- **PRD §5** — self-onboarding moves in scope (see §7).
- **Consent semantics** — `GRANTED` alone stops being sufficient for a *newly published* record; it must be accompanied by a recorded method and date. Existing `GRANTED` records are backfilled as `NOT_RECORDED` / `SIGNED_FORM` per the AT team's determination, never silently invented.
- **Import template** — new columns, new allowed values, regenerated byte-stable asset.
- **Admin actors table** — new source/consent columns and filters.

### REMOVED

- Nothing. Every change is additive; no existing behavior is deprecated.

## 9. Approach Options

The decisive fork is **how the 8-sheet workbook reaches the platform**. The other three chunks' shape follows from it.

| | **A — Team flattens to the canonical template** | **B — Platform ingests all 8 sheets natively** | **C — Ingest organisation-shaped sheets only** |
|---|---|---|---|
| Data model | Unchanged beyond chunk 1 | Per-type entities; `Actor` becomes a supertype | Flat `Actor` + extended taxonomy |
| Importer | Unchanged | Multi-sheet, per-schema parsers | Per-sheet header adapters |
| QDS production data | Not represented | Represented (new domain) | Explicitly deferred |
| Effort | ~1.5 wk (mapping runbook + taxonomy) | ~8–12 wk, multi-spec epic | ~4 wk |
| Risk | Mapping is manual and repeatable-by-hand only | Large surface, uncertain requirements, PII expands | Middle |
| Reversible? | **Yes** — B or C remain open later | Hard to unwind | Moderately |

## 10. Recommended Approach

**Option A**, decomposed as §5.

It is the smallest path that satisfies what the client actually asked for. The thread asks for two things — *know who self-registers* and *know who has consent* — and neither requires the platform to understand a QDS seed-production ledger. The registry's job per the PRD is **discoverability of actors**, not custody of agronomic trial data; ingesting the QDS sheet natively would quietly redefine the product.

Option A also keeps every heavier option open: the mapping runbook produced in chunk 2 is exactly the specification a future native importer would need, so the analysis is not thrown away if the program later chooses B.

**Assumptions carried (stated because they were not confirmed — each is cheap to reverse before `/akili-specify`):**

| ID | Assumption | If wrong |
|---|---|---|
| **A-1** | The AT/Alliance team flattens the workbook into the canonical template; the platform's importer is not taught the 8 schemas. | Re-scope chunk 2 toward Option C or B. |
| **A-2** | Self-registration requires **email verification by one-time code**, not a Cognito account. | Chunk 3's identity layer changes; queue and consent logic do not. |
| **A-3** | The review loop uses **SES email plus an in-portal reference-code fallback**, so it survives silent email failure. | Drop the fallback (smaller) or block chunk 3 on an SES-hardening spec (larger). |
| **A-4** | An in-portal checkbox against a **versioned** policy text is legally sufficient consent for self-registrants. | Chunk 3 must add a countersigned-document step before publication. |

## 11. Risks, Dependencies, And Open Questions

| ID | Risk / dependency | Mitigation |
|---|---|---|
| **R-1** | **PII surface grows.** A registration payload holds `phone`/`email` for an actor who is **not yet approved** — a record class the `PII_ALLOWLIST` and consent `WHERE` were never designed for. | Chunk 3 must treat `Registration` as admin-only in its entirety (no public read of any submission field except its own status), and extend `pii-boundary.spec.ts` to cover it. This is a **release gate**, not a nice-to-have. |
| **R-2** | **Anonymous public write path.** The first unauthenticated `POST` in the system: spam, abuse, and payload-size vectors against a Lambda + RDS with a constrained pool. | Rate limiting, payload caps, email-code verification (A-2), and no DB write before verification. Flag to `software-architect` during `/akili-specify` for chunk 3. |
| **R-3** | **SES deliverability is a known, realised failure in this project** — admin user invites were deliberately converted to a no-email temporary-password handoff because `@cgiar.org` mail did not arrive. The mockup's whole applicant round-trip rides on email. | A-3's reference-code fallback. Do **not** let chunk 3 depend on email as its only channel. |
| **R-4** | **Consent backfill is a data-integrity trap.** ~1,318 incoming records need a defensible consent state; inventing `GRANTED` to make the directory look full would breach ADR-004, the ethical basis for publishing at all. | Import default stays `UNKNOWN`. Publication remains behind the existing acknowledgement flow. The AT team supplies consent evidence per record. |
| **R-5** | **Region is missing on `Offtaker_Groundnuts`** and district spellings are dirty across sheets (`Lindi  Town`, `Retaler`). `region` is a **required** field. | Chunk 2's mapping runbook must derive region from district against `CANONICAL_REGIONS` and quarantine what it cannot resolve, rather than guessing. |
| **R-6** | **`traderId` collisions across sheets.** `Trader_id` restarts per sheet (`1036`, `1007`, `1006` all appear); the DB has `@unique` on it. | Namespace the natural key at mapping time (e.g. `OFB-1036`). Must be decided in chunk 2, before any import runs. |
| **OQ-1** | Are the four new trader types the right taxonomy, or should `Humanitarian` / `DSP` be a separate *sector* dimension rather than a trader type? | Decide in chunk 1's `/akili-specify`. |
| **OQ-2** | Who is the legal owner of the consent policy text, and does it need a version-controlled Swahili translation before go-live? | Program/legal — blocks chunk 3's copy, not its mechanism. |
| **OQ-3** | Should self-registered actors be visually distinguished in the **public** directory (a "self-declared" badge)? | Product decision; affects chunk 3's UI only. |

## 12. Success Criteria

- Every actor in the registry has a non-null `registrationSource`, and every **publicly visible** actor has a recorded consent method and date.
- The AT team can answer "who has consent?" and "who will self-register?" from an export, without a side spreadsheet.
- ≥ 1 organisation completes portal self-registration end-to-end (submit → review → publish) with zero PII exposure to `Public` at any stage — asserted by `pii-boundary.spec.ts`.
- The 8-sheet workbook is onboarded with a per-sheet reconciliation count (mapped / quarantined / dropped) that the program team can audit.
- **No regression:** `pii-boundary.spec.ts` and the full backend + frontend gates stay green throughout.

## 13. Next Step

Approve this decomposition, then specify chunk 1 first:

```text
/akili-specify actors/registration-source-and-consent
```

Chunks 2 and 3 may then be specified in parallel; chunk 4 only after chunk 3 is executed.

## 14. Visual Reference

- **Source:** Client-supplied mockup strip (approximate, explicitly not final design — the client noted the copy is provisional).
- **Location:** `docs/specs/epic/hybrid-actor-registration/mockup/self-registration-flow.png` (also copied into `docs/specs/actors/public-self-registration/mockup/`).
- **Covers:** landing CTA → registration form (organisation · location · crops & trade · contact · consent) → validation and consent-required states → submission received (`REG-2026-0184`) with withdraw link → admin Registrations queue (6 statuses) → registration detail → approve-and-publish / request-more-information / reject modals → result banners → applicant return-via-emailed-link revision screen.
- **Not covered by any visual:** chunks 1, 2, and 4. Chunk 1's admin-table additions and chunk 2's runbook are non-visual or reuse existing screens.
- **No Figma file was provided.** If one is produced later, attach it to chunk 3 before `/akili-specify`.
