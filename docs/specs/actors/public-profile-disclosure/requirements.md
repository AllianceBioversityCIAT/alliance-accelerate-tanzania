# Requirements — Public Profile Disclosure

- Spec path: `docs/specs/actors/public-profile-disclosure/`
- Status: Draft
- Author / Date: AKILI on behalf of Daniela Gómez — 2026-09-04
- Depth: **Full** (cross-cutting: schema migration, public API contract, security-policy inversion, six constitutional documents)
- Branch: `public-profile`
- Related: `docs/prd.md` §US-1/AC-1/AC-6 · `docs/ux-ui/design.md` §7, §9, §12 (DD-2) · `docs/trd/trd.md` §3, §8, ADR-003, QA-1 · `proposal.md` (approved 2026-09-04)

## 1. Summary

Consent stops being a switch that unlocks *exact GPS only* and becomes the switch that unlocks *everything the actor supplied*. For an actor whose `consentStatus` is `GRANTED`, every field that actor provided — through the public registration form or the team's Excel workbook — appears on their **public profile**. The always-locked "Contact & Commercial Data" panel is removed. Nothing changes about **who** is visible: non-`GRANTED` actors remain absent from every public surface, and the admin's show/hide control is untouched.

**The list and detail endpoints deliberately differ.** The contact block (`contactPerson`, `position`, `phone`, `email`) is served only by `GET /api/v1/actors/:id`, never by the paginated list — so it is readable one profile at a time and is not obtainable in bulk (FR-9). This is the spec's one intentional asymmetry. It replaces an earlier, weaker plan to filter only the CSV, which Judgment Day showed was inert because the dashboard and map already load every actor into the browser.

This advances PRD **US-1** by inverting its trailing clause ("without seeing their phone or email") and supersedes PRD **AC-1**, **AC-6**, and TRD **ADR-003**'s field-identity framing with a consent-identity framing.

## 2. Requirement Numbering & Writing Standards

Governed by `docs/specs/general-setup/requirements.md` §2. Applied here in particular:

- **KZ-009** — citations anchor to symbols, constants, and section titles. No bare `file:line`.
- **KZ-011** — every claim about the codebase or harness cites where it was verified. Claims verified during this spec's authoring are marked **[verified 2026-09-04]**.
- **KZ-005** — numeric claims cross-checked against prose before publication.

### 2.1 Corrections to the approved proposal (implementation discovery)

Two proposal claims did not survive verification and are corrected here. The proposal remains the approved *intent*; these are scope facts.

| Proposal said | Reality **[verified 2026-09-04]** | Effect |
|---|---|---|
| "adjust the Prisma `select` in `ActorsService`" | `ActorsService.findPublic` and `findOnePublic` use `include: CROPS_INCLUDE` with **no `select`** — they already fetch every column and rely entirely on `toPublic` to project. | **No query change is needed.** The serializer is the sole gate. Slightly less work; and it means a serializer mistake leaks immediately, with no second barrier. |
| "five constitutional layers" | **Six.** `docs/specs/general-setup/requirements.md` closes with a *Conventions reminder* asserting `PII = phone, email (+ any newly flagged)`. | The methodology template itself states the old policy and must move with the rest (**FR-8**). |

**OQ-4 is resolved by measurement, not reasoning** (KZ-011): `bg-restricted` / `--color-restricted-bg` is referenced by `Button` (hover state) and `Hero` (home page panel), independently of the profile **[verified 2026-09-04]**. The token **survives**; deleting it would break two unrelated surfaces.

## 3. Glossary

| Term | Meaning here |
|---|---|
| **Actor-supplied field** | A value the actor themselves provided, via the public registration form or as their row in the team's Excel workbook. |
| **Published set** | The fields returned to the `Public` role for a `GRANTED` actor on the API and profile (FR-1). |
| **Contact block** | `contactPerson`, `position`, `phone`, `email`, **`marketLocation`** — served by the detail endpoint only (FR-1), never by the list (FR-9). `marketLocation` joined on 2026-09-04: it is where to physically find the named person, so classing it as organisational did not survive review (R2-5). |
| **List set** | Published set **minus** the contact block — what `GET /api/v1/actors` returns, and therefore what the CSV can carry (FR-9, FR-7). |
| **Never-public set** | `NEVER_PUBLIC_FIELDS` — fields excluded from `Public` responses for reasons other than being actor-declared PII. |
| **The gate** | `src/test/pii-boundary.spec.ts`, the end-to-end release gate over every public HTTP path. |
| **Consent pin** | The `consentStatus: GRANTED` clause in the Prisma `WHERE` of `ActorsService.findPublic`, plus the `isPublic` re-check in `findOnePublic`. |

## 4. System Context & Scope

**In scope:** the public actor profile page, the public actor read API (`GET /api/v1/actors`, `GET /api/v1/actors/:id`), the public dashboard CSV (narrowed structurally by FR-9), the `Actor` schema, the registration-approval projection, the Excel import template and parser, the admin actor form, and six constitutional documents.

**Untouched:** authentication, RBAC guards, the consent gate itself, `/metrics`, directory cards, map popups, and the registration intake contract.

## 5. Stakeholders / Personas

| Persona | Role | Effect |
|---|---|---|
| Public visitor | `Public` | Sees contact and commercial data on a `GRANTED` actor's profile, one actor at a time. The list, map, dashboard and CSV never carry it. |
| Registered actor | subject | Everything they submitted becomes public once an admin grants consent. |
| Field/data-entry staff | `Staff` | Two new editable fields; must re-download the v3 template. |
| Administrator | `Admin` | Unchanged authority; the show/hide (consent) control now carries more weight. |
| Programme / legal | owner of NFR-7 | Owns the consent wording that this spec deliberately does not write. |

## 6. Functional Requirements

### FR-1: The detail endpoint discloses the full actor-supplied record

- **Description:** For an actor whose `consentStatus` is `GRANTED`, `GET /api/v1/actors/:id` MUST return the **published set**: `traderName`, `traderType`, `region`, `district`, `crops`, `capacityTons`, `sex`, `otherCrops`, exact GPS, **and the contact block** (`contactPerson`, `position`, `phone`, `email`, `marketLocation`).
- **Rationale / Source:** `proposal.md` §2 and §5.1; supersedes PRD AC-1.
- **PII/RBAC impact:** This is the change. `PII_ALLOWLIST` becomes empty; `Public` gains, **on the detail path only**, fields previously restricted to `Staff`/`Admin`.

#### Scenario: Granted actor, all fields present

- GIVEN an actor with `consentStatus = GRANTED` and every published-set field populated
- WHEN an anonymous client requests `GET /api/v1/actors/:id`
- THEN the response contains every field of the published set with its stored value
- AND the response contains no member of the never-public set
- BUT it must NOT contain `technicalSupport`, `traderId`, `gpsAltitude`, `gpsAccuracy`, `registrationSource`, `consentMethod`, `consentObtainedAt`, or `consentReference`
- AND IT MUST NOT return the contact block from `GET /api/v1/actors` — list and detail **deliberately differ**, and that difference is FR-9

#### Scenario: Granted actor, optional fields absent

- GIVEN a `GRANTED` actor supplied only the fields required by their intake route
- WHEN an anonymous client requests that actor
- THEN each unsupplied published field is present in the response as `null`
- AND IT MUST NOT be omitted from the response object, so the contract shape is identical for every actor

### FR-9: The list endpoint withholds the contact block

- **Description:** `GET /api/v1/actors` MUST return the **list set** — the published set minus the contact block — for every actor, under every filter and page size. The contact block MUST be obtainable only one actor at a time, through the detail endpoint.
- **Rationale / Source:** **Judgment Day J-13 (2026-09-04), verified.** The prior design withheld the contact block from the CSV only. That is inert: `useDashboardActors` accumulates every matching actor (`DASH_PAGE_SIZE = 100` × `DASH_MAX_PAGES = 10`) into browser memory, and `app/(public)/map/page.tsx` does the same — so widening the list response puts the whole registry's contact data in any anonymous visitor's browser. **The control has to live in the projection, not in the download button.**
- **PII/RBAC impact:** This is the actual bulk-exposure boundary. FR-7 becomes a consequence of it rather than a control of its own.

#### Scenario: The list never carries contact data

- GIVEN a set of `GRANTED` actors with the full contact block populated
- WHEN an anonymous client requests `GET /api/v1/actors` under any filter, page, or page size
- THEN no item carries `contactPerson`, `position`, `phone`, `email`, or `marketLocation` — as keys or as values
- AND every item carries the list set
- BUT it must NOT be circumventable by a query parameter, a filter, or a page-size value — there is no request shape that widens the list projection
- AND IT MUST be asserted by **value** as well as by key, because the same strings legitimately appear in detail responses and a key-only check cannot tell the two apart

#### Scenario: The detail path remains the only contact source

- GIVEN an anonymous client that has listed every `GRANTED` actor
- WHEN it needs the contact block for all of them
- THEN it must issue one detail request per actor
- AND IT MUST be recorded in NFR-6 that this raises harvesting cost from ~10 requests to one-per-actor, and that this is the boundary's whole effect — not a claim that harvesting is prevented

### FR-2: Consent still governs visibility, unchanged

- **Description:** An actor whose `consentStatus` is not `GRANTED` MUST remain absent from every public read path and from `/metrics`, exactly as today. Consent MUST stay pinned in the Prisma `WHERE`, never in the serializer alone.
- **Rationale / Source:** TRD ADR-004, QA-2; `proposal.md` §6 non-goals. Restated as a requirement **because the gate protecting it is being rewritten** — behavior preserved by accident is behavior nobody is defending.
- **PII/RBAC impact:** The single most important invariant in this spec.

#### Scenario: Non-granted actor is unreachable

- GIVEN actors with `consentStatus` of `UNKNOWN` and `DENIED`, each with every field populated
- WHEN an anonymous client requests `GET /api/v1/actors/:id` for either
- THEN the response is `404`
- AND no field of either actor appears in any public response body
- BUT it must NOT be distinguishable from a request for a non-existent id
- AND IT MUST hold on the list path and `/metrics` counts as well, not only on detail

### FR-3: The never-public set stays never-public

- **Description:** `traderId`, `gpsAltitude`, `gpsAccuracy`, `registrationSource`, `consentMethod`, `consentObtainedAt`, `consentReference`, and `technicalSupport` MUST NOT appear in any `Public` response. `technicalSupport` MUST move from `PII_ALLOWLIST` into `NEVER_PUBLIC_FIELDS`, carrying its reason.
- **Rationale / Source:** `proposal.md` §5.1. `technicalSupport` is a staff-authored needs assessment (TRD §3 names it *"Technical support required"*), not an actor declaration, and is unreviewed free text that can incidentally carry personal data.
- **PII/RBAC impact:** Unchanged exposure; changed classification for one field.

#### Scenario: technicalSupport is populated but never emitted

- GIVEN a `GRANTED` actor with `technicalSupport` populated
- WHEN an anonymous client requests that actor on any public path
- THEN `technicalSupport` is absent from the response
- BUT it must NOT be absent from the `Admin` projection, which continues to return it
- AND IT MUST be declared in `NEVER_PUBLIC_FIELDS` with a comment recording *why* it is excluded, so a future reader does not "correct" it back as miscategorised

### FR-4: `contactPerson` and `otherCrops` persist and publish

- **Description:** `Actor` MUST gain nullable `contactPerson` and `otherCrops` columns. Registration approval MUST write both from the submission payload. Excel import MUST write both. The admin actor form MUST edit both. Both MUST appear in the published set.
- **Rationale / Source:** `contactPerson` is **required** on the public registration form (`RegistrationPayloadDto`) and is discarded at approval today **[verified 2026-09-04]** — the registry asks every applicant for a mandatory field it throws away. `otherCrops` confirmed publishable by Daniela Gómez, 2026-09-04 (OQ-2).
- **PII/RBAC impact:** `contactPerson` is a named natural person, published deliberately. This reverses a documented barrier (see FR-4's negative clause).

#### Scenario: Self-registered actor's contact person is published

- GIVEN a registration submitted with `contactPerson` and approved by an admin
- WHEN an anonymous client requests the resulting public actor
- THEN `contactPerson` carries the submitted value
- AND `otherCrops` carries its submitted value or `null`
- BUT it must NOT be reachable through `position`: `position` MUST be read only from `payload.position`, never falling back to `payload.contactPerson`
- AND IT MUST leave the rationale in `AdminRegistrationsService.approve` **rewritten**, recording who decided to publish `contactPerson` and when — not deleted (KZ-008)

#### Scenario: Pre-existing Excel actor has no contact person

- GIVEN an actor imported before this change, whose `contactPerson` is therefore `null`
- WHEN an anonymous client views their profile
- THEN the Contact section renders the Contact Person row with an em-dash placeholder
- AND IT MUST NOT be backfilled, invented, or derived from any other column

### FR-5: The import template carries the two new columns at v3

- **Description:** `TEMPLATE_COLUMNS` MUST gain `Contact Person` and `Other Crops` as optional columns; `TEMPLATE_VERSION` MUST bump `v2` → `v3`; the generated workbook MUST be regenerated; the parser MUST map both cells onto the new `Actor` fields.
- **Rationale / Source:** `proposal.md` P-4 — "the Excel has the same columns as the form" is false today in both directions **[verified 2026-09-04]**.
- **PII/RBAC impact:** None — the template is `Admin`/`Staff` only.

#### Scenario: A v3 row imports both new fields

- GIVEN a v3 workbook row with `Contact Person` and `Other Crops` populated
- WHEN an admin imports it
- THEN the created or updated actor carries both values
- AND the headers, the Instructions sheet's allowed-value lists, and the parser agree, with no drift
- BUT it must NOT change the required/optional status of any existing column
- AND IT MUST keep the import error path emitting field **names** only, never phone or email **values** — that separate protection is unrelated to public reads and MUST survive this change

#### Scenario: A v2 workbook is uploaded after the bump

- GIVEN an operator uploads a workbook stamped `v2`
- WHEN the import runs
- THEN stale-template detection reports the version mismatch
- AND IT MUST name the action the operator should take (download the current template), not merely report a mismatch

### FR-6: The public profile renders the full record

- **Description:** The profile page MUST replace the always-locked panel with the actor's real contact and commercial data. Every published field's label MUST always render; an absent value renders an em-dash placeholder.
- **Rationale / Source:** `proposal.md` §5.3 — explicit user decision; hiding empty rows was considered and rejected as not worth the complexity.
- **PII/RBAC impact:** The visitor-facing surface of FR-1.

#### Scenario: Locked panel is gone

- GIVEN any `GRANTED` actor's profile
- WHEN an anonymous visitor loads it
- THEN no "Restricted — Authorization Required" affordance appears anywhere on the page
- AND the contact fields render with their values
- BUT it must NOT hide a row whose value is absent — the label renders with a placeholder
- AND IT MUST use `docs/ux-ui/design.md` §7 tokens only, with no hardcoded color or geometry

#### Scenario: Accessible structure

- GIVEN the new contact section
- WHEN it is inspected by an automated accessibility checker and by a human at the review pause
- THEN it exposes a labelled section heading and definition-list semantics consistent with the existing location and capacity sections
- AND IT MUST meet WCAG 2.1 AA contrast — a property jsdom **cannot** evaluate, so it is verified by NFR-4's substituted check, not by the unit suite

### FR-7: The public CSV exports the export set, never the contact block

- **Description:** `PUBLIC_COLUMNS` in the dashboard CSV serializer MUST be extended to the **export set**, which after FR-9 is simply *the list set* — the CSV's input no longer contains the contact block, so its absence is **structural, not disciplinary**. The serializer's explicit-allowlist construction and no-spread rule MUST still be preserved, and its header comment MUST be rewritten to state the new reason.
- **Rationale / Source:** OQ-5 resolved 2026-09-04 (Daniela Gómez), then **re-grounded by Judgment Day J-13**: the CSV allowlist was never the control it was presented as. FR-9 is the control; this requirement now only ensures the CSV does not *re-introduce* what the projection already withholds.
- **PII/RBAC impact:** The CSV is built client-side from list data. Once the list lacks the contact block, the CSV structurally cannot carry it.

| Column | Profile (detail) | List + CSV |
|---|:---:|:---:|
| `traderName`, `region`, `district`, `traderType`, `capacityTons`, `crops` | ✅ | ✅ *(already exported)* |
| `sex`, `otherCrops` | ✅ | ✅ *(added to the export)* |
| `contactPerson`, `position`, `phone`, `email`, `marketLocation` | ✅ **detail only** | ❌ — not in the list response at all (FR-9) |
| exact GPS | ✅ | ❌ *(already excluded — "not useful for bulk analysis")* |
| never-public set | ❌ | ❌ |

> **A-1 — decided 2026-09-04 (Daniela Gómez), after the original justification was refuted.**
> `sex` is **added** to the export (it is not there today) and `marketLocation` is **withheld** from it.
>
> *The reasoning that was wrong:* the first draft justified keeping `sex` on the grounds that it "is not contactable once the person's name is withheld". **The name is not withheld** — `traderName` is the first CSV column, and `informal_trader` is a live trader type, so on those rows the name is a natural person (R2-5).
>
> *The reasoning that holds:* `marketLocation` is where to physically find that named person, so it belongs with the contact block regardless of how it is labelled. `sex` is a demographic attribute that locates nobody, and gender-disaggregated reporting is a real programme need. The export therefore carries a name and a sex, and no way to reach or find the person. That is the trade being made, stated plainly rather than defined away.

#### Scenario: Export omits the contact block

- GIVEN a dashboard view filtered to a set of `GRANTED` actors, each with the full contact block populated
- WHEN the visitor downloads the CSV
- THEN each row carries the export-set columns
- AND no row carries `contactPerson`, `position`, `phone`, or `email`
- AND no row carries any never-public field
- BUT it must NOT include any actor absent from the filtered `GRANTED` set
- AND IT MUST keep the serializer building rows by explicit named allowlist — no spread operator over an actor object, because a spread would silently readmit every field the moment `PublicActor` widens, which is exactly what FR-1 does to it

#### Scenario: Widening the API does not widen the export

- GIVEN `PublicActor` has gained the contact block (FR-1)
- WHEN the CSV serializer is compiled and run against actors carrying those fields
- THEN the exported columns are unchanged from the declared export set
- AND IT MUST be covered by an assertion that **names the contact block explicitly** and fails if any member appears in the output — the one test standing between a type widening and a silent bulk leak

### FR-8: All six constitutional documents state the new policy

- **Description:** Every document asserting that `phone`/`email` are withheld from `Public` MUST be updated in the same change.
- **Rationale / Source:** `proposal.md` R-3. A partial change leaves the repo self-contradictory and the next `/akili-audit` reverts it as drift.
- **PII/RBAC impact:** Documentation of the boundary, not the boundary itself.

| # | Document | Anchors to update |
|---|---|---|
| 1 | `CLAUDE.md` | the *Hard constraints* PII bullet |
| 2 | `docs/prd.md` | US-1, AC-1, AC-6, the persona table's "no access to PII", the *Protect PII* success metric |
| 3 | `docs/trd/trd.md` | both *PII set* statements (§3 and §8), ADR-003, QA-1, the `/actors` and `/actors/:id` endpoint rows |
| 4 | `docs/ux-ui/design.md` | principle 3, DD-2, the *PII block* component entry; `--color-restricted-bg` **stays** (§2.1) |
| 5 | `docs/specs/general-setup/requirements.md` | the closing *Conventions reminder* line |
| 6 | `docs/specs/general-setup/design.md` / `task.md` | the PII-allowlist instructions, which must still make sense with an empty allowlist |

#### Scenario: No surviving contradiction

- GIVEN the change is complete
- WHEN the repository is swept for statements that `phone` or `email` are hidden from `Public`
- THEN zero such statements survive outside `docs/specs/archive/`
- BUT it must NOT edit anything under `docs/specs/archive/` — archived specs are frozen records; this spec and the TRD carry the superseding decision
- AND IT MUST land documents 1–6 in a single commit, so no reviewer ever sees half a policy

## 7. Non-Functional Requirements

### NFR-1: Consent enforced at the query

Consent MUST remain pinned in the Prisma `WHERE` and re-checked by `isPublic` on the detail path. Serializer-only enforcement is forbidden. *(Preserved from TRD ADR-003/ADR-004; restated because its guarding test is being rewritten.)*

### NFR-2: The inverted gate MUST be demonstrably able to fail

The rewritten `pii-boundary.spec.ts` MUST be shown to **redden** when the consent pin is removed from `ActorsService.findPublic`. Demonstrated against the pre-change state, not argued. **A presence-assertion that passes while consent is broken is not a gate (KZ-002, recurrence ×4).**

- **Disqualifier:** if the mutation does not redden the suite, the suite is not evidence — report the gap and stop; do not record the task as verified.

### NFR-3: No new write path, no change to who is visible

This spec MUST NOT add an unauthenticated write path, change the consent state machine, alter the admin show/hide control, or modify `/metrics` semantics.

### NFR-4: Accessibility and token discipline

The new contact section MUST meet WCAG 2.1 AA and use `docs/ux-ui/design.md` §7 tokens only.

- **Contrast and rendered layout are not evaluable in jsdom.** They are verified by a human check at the review pause or a T6 visual review, and are recorded as such — not counted as covered by the component suite (KZ-002).

### NFR-5: Migration safety

Both new columns MUST be nullable and additive. The migration MUST require no backfill and MUST be applied to the dev RDS instance before the spec closes. No existing column may be altered or dropped.

### NFR-6: Bulk extraction is bounded by the list projection

Contact data MUST NOT be obtainable in bulk from any public surface. The control is **FR-9's list projection** — not the CSV allowlist, and not a rate limit.

**Why not the CSV allowlist.** It was proposed as the control and is not one (J-13, verified): `useDashboardActors` accumulates up to 1,000 actors into browser memory and `/map` does the same, so a widened list response hands the whole registry's contact data to any anonymous visitor regardless of what the download button emits.

**Why not a rate limit.** `ActorsController` carries no throttle guard — `ThrottlerModule` is registered but only `RegistrationsModule` and `ContactModule` opt in — and `MAX_PAGE_SIZE = 100` bounds a page, not a sweep. Adding throttling to a public read path is a separate decision with its own availability trade-offs, out of scope here.

**Residual exposure, stated honestly and quantified.** FR-9 raises the cost of harvesting the contact block from **~10 unauthenticated requests** to **one request per actor** (~1,000). That is a real increase in effort and observability, and it is **not** prevention: a determined scripted client still gets everything. Nothing in this spec claims otherwise.

- **Disqualifier:** a test proving the CSV lacks the contact block verifies FR-7, **not this NFR**. This NFR is verified by asserting the contact block's absence from the *list endpoint response* — by value, not only by key — and by reading the list projection. If the only evidence offered is a CSV test, this NFR is unverified.

### NFR-7: Consent wording is a known, owned gap

The consent policy served by `CONSENT_POLICY_SECTIONS` remains placeholder text; its *"How it is published"* section — the one that would authorise publishing contact data — is unwritten **[verified 2026-09-03]**. `CONSENT_POLICY_VERSION` is **not** bumped and existing `GRANTED` actors are **not** re-consented.

**One published field was collected for a different purpose — legal must be told this.** For self-registered actors, `Actor.email` is supplied by the applicant but **under a narrower purpose than publication**: `RegistrationPayloadDto` carries no `email` at all — the address is typed once as the top-level `RegistrationCreateDto.email`, for OTP verification, and `AdminRegistrationsService.approve` sets `email` from `Registration.submitterEmail`, the OTP-verified address the applicant gave for **identity verification and receipt delivery** [Judgment Day J-11, 2026-09-04]. This spec publishes it. The spec's own framing — "everything the actor supplied" — does not honestly cover it, and whoever drafts the consent wording must know that the address being published was collected under a narrower purpose than the one it will now serve.

**Accepted risk. Owner: programme/legal.** Out of scope by explicit user decision; recorded so it is a known open item rather than a later discovery. Legal's wording will need a version bump in a separate change.

## 8. Defect Classes And Their Gates

Per `/akili-specify`: name what this spec can get wrong, then say which command catches it. A gate blind to the dominant defect class is not a gate.

| # | Defect class | Gate | Automated? |
|---|---|---|---|
| D-1 | A never-public field leaks to `Public` | `pii-boundary.spec.ts` absence assertions over every public HTTP path | ✅ strong — unchanged half of the gate |
| D-1b | **The contact block reaches the list response** (and therefore the map, dashboard and CSV) — most likely as a silent consequence of widening the shared projection, not as a deliberate edit | FR-9's by-key **and** by-value assertion on `GET /api/v1/actors`, plus `csv.test.ts` naming the four fields | ✅ — must name the four fields explicitly, never assert a column count |
| **D-1c** | **A suite goes vacuous because a constant it iterates emptied.** Seven files spread or loop over `PII_ALLOWLIST`; all report green while asserting nothing (J-2) | Every such site re-pointed to a non-empty constant, **plus** a by-value pin on each policy constant so an accidental emptying fails loudly | ✅ — but only if the re-pointing is exhaustive; an unswept site is invisible |
| D-2 | A non-`GRANTED` actor becomes reachable | `pii-boundary.spec.ts` non-granted fixtures + `actors.service.spec.ts` | ✅ |
| D-3 | **The inverted gate is vacuous** — presence assertions pass while consent is broken | NFR-2's mutation demonstration (remove the consent pin → suite must redden) | ✅ *only if the mutation is actually run*; this is the meta-gate |
| D-4 | **List and detail contracts *converge*** — a future reader "harmonises" the two shapes and silently reopens bulk exposure. *(Rewritten 2026-09-04: divergence is now the design, not the defect. The old wording cited FR-1's cross-path assertion, a gate this revision deliberately removed — R2-4.)* | FR-9's list assertion, which fails the moment the contact block reappears there | ✅ |
| D-5 | Template header / allowed-values / parser drift | `template-columns.spec.ts` + regenerating the workbook | ✅ |
| D-6 | Migration breaks an existing column or needs a backfill | `prisma migrate` + `npm run build` + full backend suite | ✅ |
| D-7 | A constitutional document keeps the old claim | Repo-wide grep sweep for the superseded assertion, excluding `docs/specs/archive/` | ✅ scriptable |
| D-8 | **Rendered profile defect** — contrast, spacing, layout, responsive break | **None automated.** jsdom cannot measure layout or contrast; `axe` in jsdom returns incomplete for contrast | ❌ **substituted**: human check at the Phase-4 review pause, or a T6 Multimodal visual review |
| D-9 | **Stale-template message is unhelpful** to an operator | **None automated.** A test can assert the message exists; it cannot assert it tells an operator what to do | ❌ **substituted**: human read of the rendered message at the review pause |
| D-10 | `contactPerson` reaches `position` via a plausible one-line fallback | FR-4's negative clause + a targeted assertion on the approval projection | ✅ |

| D-11 | A non-`GRANTED` actor is **distinguishable** from a missing one (FR-2's `BUT`) | Gate assertion comparing the two `404` bodies byte-for-byte | ✅ |
| D-12 | `contactPerson` is **derived** from an adjacent column on a write path other than `approve()` — the import parser or the admin form (FR-4's `AND IT MUST NOT`) | Per-slot assertions on all three write paths | ✅ |
| D-13 | The v3 template changes an existing column's **required/optional status**, or the Instructions sheet's allowed-value lists drift (FR-5's two clauses) | `template-columns.spec.ts` pinning the required-flag map by value + generator round-trip | ✅ |
| D-14 | A "Restricted" affordance survives **somewhere on the page** after the panel is deleted (FR-6's `THEN`) | Page-level absence assertion, not component-level | ✅ |
| D-15 | The CSV includes an actor **outside the filtered `GRANTED` set** (FR-7's `BUT`) | `csv.test.ts` filtered-set fidelity assertion | ✅ |

D-8 and D-9 are the two classes with no automated gate. Both are **substituted**, not accepted-blind. No class is left unmeasured and unsubstituted.

## 9. Data & Schema Impact

| Change | Model | Type | Nullable | Note |
|---|---|---|---|---|
| Add `contactPerson` | `Actor` | `String?` | yes | Named natural person, published deliberately (FR-4) |
| Add `otherCrops` | `Actor` | `String?` | yes | Actor-declared free text (OQ-2, resolved) |

No column is altered or dropped. No backfill. `PII_ALLOWLIST` becomes empty **but is retained** as a documented constant (OQ-1): it is the designated one-edit point if legal re-restricts a field, and the gate iterates the union of both constants. `technicalSupport` relocates to `NEVER_PUBLIC_FIELDS`.

TRD §3's field table gains two rows; TRD §8's PII set becomes empty with the consent rule carrying the whole boundary.

## 10. Out of Scope

- Directory cards and map popups — contact data does not appear there.
- Publishing `technicalSupport`, and adding it to the registration form.
- The consent policy wording, `CONSENT_POLICY_VERSION`, and re-consenting existing actors (NFR-7).
- Backfilling `contactPerson` for previously imported actors (OQ-3).
- Retention, deletion, or takedown workflow for published contact data (PRD OQ-4, still open).
- Any change to authentication, RBAC guards, or the `Admin` projection's field set.

## 11. Dependencies & Assumptions

- **Branch `public-profile`**, level with `main`; no other local or remote branch touches `backend/src/{actors,registrations,common}` **[verified 2026-09-04]**.
- The dev RDS instance is reachable for the migration; all AWS commands use `--profile IBD-DEV`.
- Verification uses the failure-only forms in `CLAUDE.md`. There is **no `test:e2e` script** — `backend/package.json` defines only `build`, `start`, `start:dev`, `lint`, `test`, `generate:template`, `prisma:generate` **[re-verified 2026-09-04]**; the script and its `CLAUDE.md` row were removed during `admin/registration-review-queue`'s validation, and `CLAUDE.md` records that. The 16 `*.e2e.spec.ts` files run under the ordinary `npm test`.
  - *An earlier revision of this document asserted the script still existed and pointed at a missing config, stamped `[verified 2026-09-03]`. Both halves were false; Judgment Day J-3 caught it. Recorded rather than quietly deleted, because a `[verified]` stamp that did not survive a thirty-second re-check is exactly the KZ-011 failure this section exists to prevent.*
- CodeGraph is **not** initialized in this checkout **[verified 2026-09-04 — `.codegraph/` holds only `config.json`]**; `codegraph_*` tools are unavailable.

## 12. Open Questions

| # | Question | Status |
|---|---|---|
| OQ-1 | Keep `PII_ALLOWLIST` as an empty constant? | **Resolved** — keep it, documented. |
| OQ-2 | Publish `otherCrops`? | **Resolved 2026-09-04 (Daniela Gómez)** — yes. |
| OQ-3 | Backfill `contactPerson` for pre-existing actors? | **Resolved** — no backfill; renders as em-dash. |
| OQ-4 | Does `--color-restricted-bg` survive? | **Resolved 2026-09-04 by measurement** — yes; `Button` and `Hero` reference it. |
| OQ-5 | Which NFR-6 mitigation? (a) row cap on CSV, (b) contact on profile but not CSV, (c) full export. | **Resolved 2026-09-04 (Daniela Gómez)** — **(b)**. Changes FR-7 and NFR-6; supersedes `proposal.md` §5.2's CSV row. |
| **A-1** | **Assumption, not a question:** `sex` stays in the CSV export (gender-disaggregated reporting, not contactable); `position` leaves with the contact block. | **Open to override** — one word moves either. Proceeding as stated. |

## 13. Requirement ID Index

| ID | Title | Primary gate |
|---|---|---|
| FR-1 | Consent unlocks the full actor-supplied record | D-1, D-4 |
| FR-2 | Consent still governs visibility, unchanged | D-2, D-3, D-11 |
| FR-3 | The never-public set stays never-public | D-1 |
| FR-4 | `contactPerson` and `otherCrops` persist and publish | D-6, D-10, D-12 |
| FR-5 | Import template carries the two new columns at v3 | D-5, D-9, D-13 |
| FR-6 | The public profile renders the full record | D-8, D-14 |
| FR-7 | The public CSV exports the list set | D-1, D-1b, D-15 |
| FR-8 | All six constitutional documents state the new policy | D-7 |
| **FR-9** | **The list endpoint withholds the contact block** | **D-1b** |
| NFR-1 | Consent enforced at the query | D-2 |
| NFR-2 | The inverted gate MUST be able to fail | D-3, **D-1c** |
| NFR-3 | No new write path, no change to who is visible | D-2 |
| NFR-4 | Accessibility and token discipline | D-8 |
| NFR-5 | Migration safety | D-6 |
| NFR-6 | Bulk extraction bounded by the list projection | D-1b (list response, by value) |
| NFR-7 | Consent wording is a known, owned gap | — (accepted risk, external owner) |
