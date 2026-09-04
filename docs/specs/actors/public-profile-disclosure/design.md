# Design — Public Profile Disclosure

- Spec path: `docs/specs/actors/public-profile-disclosure/`
- Status: Draft — **revision 3** (Judgment Day rounds 1 and 2 applied, 2026-09-04)
- Author / Date: AKILI on behalf of Daniela Gómez — 2026-09-04
- Traces requirements: FR-1…FR-9, NFR-1…NFR-7 from this spec's `requirements.md`
- Review record: `judgment.md` — **terminal state ESCALATED** (lineage exhausted 2/2). Round 1: 6 confirmed + 2 orchestrator-verified. Round 2: all 11 fixes landed, 7 further findings, all applied here.

## 1. Executive Summary

Revision 1 got two things wrong, both caught by dual review, both now structural rather than patched:

1. **The bulk-exposure control was in the wrong layer.** Withholding the contact block from the CSV does nothing, because `useDashboardActors` accumulates up to 1,000 actors into browser memory and `/map` does the same — a widened *list* response hands the whole registry's contact data to any anonymous visitor. **The control moves into the list projection (DD-3).** The CSV then cannot carry what its input never had.
2. **DD-1 cited a safety net that does not exist.** Revision 1 claimed the gate "already runs" a totality assertion catching an unclassified schema column. It does not — the only thing so named is a *route* totality in the registrations block. The real protection is the serializer's explicit-pick construction, which is a **design property, not a test**. Stated correctly now, and given the test it was missing.

The remaining risk is unchanged and concentrated: emptying `PII_ALLOWLIST` silently guts coverage in **seven** files, not one.

## 2. Approach Overview

| Tier | Change |
|---|---|
| Data | Two additive nullable columns on `Actor`. No alteration, no backfill. |
| Serialization | **Two public projections** where there was one — list and detail (DD-3). `PII_ALLOWLIST` empties but survives; `PUBLICLY_DISCLOSED_FIELDS` and `CONTACT_BLOCK_FIELDS` are added. |
| Query | **Unchanged.** `ActorsService` uses `include`, not `select` (`requirements.md` §2.1). |
| API | Detail widens; list widens *less*. Routes, auth, pagination, status codes unchanged. |
| Frontend | One component replaced; the actor type **splits** into list and detail shapes; the CSV inherits the list shape. |
| Docs | Six documents restate the policy; a new ADR supersedes ADR-003. |

## 3. Architecture Overview

Three barriers, where revision 1 had two:

1. **The consent pin** — `consentStatus = GRANTED` in the Prisma `WHERE` plus the `isPublic` re-check on detail. **Untouched.** Decides *who* is visible.
2. **The projection split** — *new.* Decides *how much* is visible per surface. The list projection is the bulk boundary; the detail projection is the disclosure surface.
3. **The allowlist serializers** — still explicit picks, never spreads. Two of them now.

## 4. Extended Directory Structure

Revision 1 listed ten files. Two rounds of dual review raised it to **40 code and asset line-items plus seven documents** — roughly four times the original estimate, and the reason §16 was rebased twice. **This is a closed set: if the implementation needs a file that is absent, that is a budget-tripwire event (§16), not a silent addition.**

```
backend/
  prisma/schema.prisma                        ~ +2 columns
  prisma/migrations/<ts>_add_contact_person_other_crops/   +
  src/common/
    pii-consent.policy.ts                     ~ PII_ALLOWLIST→[]; +PUBLICLY_DISCLOSED_FIELDS; +CONTACT_BLOCK_FIELDS; technicalSupport→NEVER_PUBLIC
    pii-consent.policy.spec.ts                ~ by-value pins on ALL constants (DD-2)
    role-aware.serializer.ts                  ~ split: toPublicListItem + toPublicDetail
    role-aware.serializer.spec.ts             ~ TWO PII_ALLOWLIST loops go vacuous — re-point (J-2)
    template-columns.ts                       ~ +2 columns, v2→v3
    template-columns.spec.ts                  ~ required-flag map pinned by value (D-13)
    generate-template.spec.ts                 ~ regenerated-asset assertion
  src/actors/
    actors.controller.ts                      ~ findOnePublic(): Promise<PublicActorDetail> — the annotation names the LIST shape after the split (R2-3)
    actors.controller.spec.ts                 ~ its detail-route fixture is typed PublicActor (R2-3)
    actors.service.ts                         ~ findPublic → list projection
    actors.service.spec.ts                    ~ FORBIDDEN_KEYS spread goes vacuous (J-2)
    actors-admin.service.spec.ts              ~ PII_ALLOWLIST loop = the ONLY Admin-PII proof (J-2)
    admin-actor.serializer.ts                 ~ +2 fields
    actor-import.service.ts                   ~ map 2 new cells
    actor-import.service.spec.ts              ~ +2 fields (1,069 lines)
    dto/actor-create.dto.ts, admin-actor-*.dto.ts  ~ +2 optional fields
  src/registrations/
    admin-registrations.service.ts            ~ RegistrationApprovalPayload +2; rationale rewritten (DD-5)
    admin-registrations.service.spec.ts       ~ per-slot assertions + standing mutation (RV-3)
    dto/registration-create.dto.ts            ~ contactPerson's "never published" comment is now FALSE
  src/test/
    pii-boundary.spec.ts                      ~ the inversion + LEAKABLE_PII_VALUES split (DD-4)
    admin-actors.e2e.spec.ts                  ~ FORBIDDEN_KEYS spread (J-2)
    admin-actors-crud.e2e.spec.ts             ~ FORBIDDEN_KEYS spread (J-2)
    admin-actor-import.e2e.spec.ts            ~ FORBIDDEN_KEYS spread (J-2)
  scripts/generate-import-template.ts         ~ v3
frontend/
  public/templates/actor-import-template.xlsx ~ regenerated (byte-stable)
  lib/api/actors.ts                           ~ PublicActorListItem + PublicActorDetail (DD-6)
  lib/api/actors-admin.ts                     ~ AdminActor +2
  lib/api/useActor.ts                         ~ returns the detail shape
  lib/api/actors.test.ts                      ~ VALID_ACTOR typed PublicActor, drives the getActor cases (R2-3)
  lib/api/useActor.test.ts                    ~ same; mock typed as bare jest.Mock, so drift goes STALE not RED (R2-3)
  lib/dashboard/csv.ts                        ~ PUBLIC_COLUMNS → list set; comment rewritten
  lib/dashboard/csv.test.ts                   ~ contact-block + filtered-set assertions
  lib/contrast.test.ts                        ~ cites RestrictedContactPanel as its WCAG subject
  components/profile/RestrictedContactPanel.tsx   − deleted
  components/profile/ProfileContact.tsx           +
  components/profile/ProfileView.tsx          ~ swap panel; detail shape
  components/profile/ProfileView.test.tsx     ~ asserts the panel EXISTS — inverts (334 lines)
  components/profile/profile-a11y.test.tsx    ~ same (273 lines)
  components/admin/ActorForm.tsx              ~ +2 fields (959 lines)
docs/                                         ~ six constitutional documents + new ADR
```

## 5. Data Model Changes

Two additive `String?` columns on `Actor`: `contactPerson`, `otherCrops`. Migration `add_contact_person_other_crops`; reversible by dropping two nullable columns; no backfill; applied to dev RDS with `--profile IBD-DEV` per `backend/CLAUDE.md`'s rehearsal rules (additive-only, inspect emitted SQL, abort-and-report on any drift or reset prompt).

`otherCrops` is free text and is **not** parsed into `Crop` relations.

## 6. API Design

| Endpoint | Role | Change |
|---|---|---|
| `GET /api/v1/actors` | Public | Widens to the **list set** — published set minus the contact block (FR-9) |
| `GET /api/v1/actors/:id` | Public | Widens to the **published set**, contact block included (FR-1) |
| `GET /api/v1/metrics` | Public | **None** |
| `POST /api/v1/admin/registrations/:id/approve` | Admin | Writes two more columns |
| `GET/POST/PATCH /api/v1/admin/actors*` | Staff/Admin | Two more fields in and out |

Absent optional values serialize as `null`, never omitted. **The list/detail difference is not a versioning accident** — it is the boundary in DD-3 and must be documented in the TRD endpoint table, or a future reader will "harmonise" the two shapes and silently reopen bulk exposure.

## 7. Backend Module Design

### 7.1 The policy module — three constants, three directions

| Constant | Meaning | Non-empty after this change? |
|---|---|---|
| `PUBLICLY_DISCLOSED_FIELDS` | Must appear on the **detail** path for a `GRANTED` actor | yes |
| `CONTACT_BLOCK_FIELDS` | Subset of the above; must **never** appear on the **list** path | yes |
| `NEVER_PUBLIC_FIELDS` | Must never appear on any public path (now including `technicalSupport`) | yes |
| `PII_ALLOWLIST` | Retained, **empty**, reserved for legal re-restriction (DD-2) | no — deliberately |

Every one of these gets a **by-value pin** in `pii-consent.policy.spec.ts`, including the empty one. A constant that silently changes size is the defect class this whole revision exists to close.

### 7.2 The serializers

`toPublicListItem` and `toPublicDetail`, both explicit literal picks, never spreads. `toPublicDetail` is `toPublicListItem` plus the contact block — expressed so the two cannot drift, while remaining two distinct picks rather than one pick plus a delete.

### 7.3 The approval projection

`RegistrationApprovalPayload` gains both fields, which removes a compile-time guard (RV-3). `position` still reads only from `payload.position`.

### 7.4 Import and template

Two optional columns appended **after** the existing ones — no column position shifts, and **no existing column's required flag changes** (D-13, pinned by value). `TEMPLATE_VERSION` `v2` → `v3`; workbook regenerated byte-stably via `npm run generate:template` and committed, per `backend/CLAUDE.md`. Neither new column carries an allowed-value list, so the Instructions sheet gains only two free-text rows — stated explicitly because FR-5 requires headers, allowed-value lists, and parser to agree, and "there is no list" is the agreement here.

The import error path's field-names-only rule is unrelated to public reads and stays.

## 8. Frontend / UX Component Architecture

`RestrictedContactPanel` is deleted; `ProfileContact` replaces it, reusing `ProfileLocation`'s pattern verbatim — labelled `<section>`, `<h2>`, `<dl>` grid of bordered cards on `bg-surface-alt`. Rows always render; absent values show an em-dash (FR-6).

Two sections: **Contact** (contact person, position, phone, email, market location) and **Profile** (sex, other crops).

> **`sex` is deliberately NOT in the contact block.** It sits in a UI section next to fields that are, which is exactly the adjacency that invites an implementer to "harmonise" it into `CONTACT_BLOCK_FIELDS` by analogy. It ships in the list set and the CSV (A-1). The gate constant is the source of truth, never the UI grouping (N-1/R2-5).

Phone and email render as plain text, not `tel:`/`mailto:` links (DD-7).

`lib/contrast.test.ts` currently names `RestrictedContactPanel` as the subject of two WCAG pairs; it must be re-pointed at `ProfileContact` rather than left describing a deleted file.

No new tokens. `--color-restricted-bg` survives — `Button`, `Hero`, and `contrast.test.ts` reference it.

## 9. Shared Contracts

The frontend actor type **splits**, mirroring the backend:

- `PublicActorListItem` — the list set. **`PublicActor` becomes an alias for it**, so the 45 existing consumers (directory, map, dashboard, CSV) compile unchanged and structurally cannot reach contact data.
- `PublicActorDetail extends PublicActorListItem` — adds the contact block. Consumed **only** by `useActor` and the profile.

This is the single most valuable property in the design: the components that render bulk views cannot even *name* a contact field, because their type does not have one.

## 10. Test Plan Outline

| FR/NFR | Coverage |
|---|---|
| FR-1 | Gate: every disclosed field present on **detail** for a `GRANTED` fixture |
| FR-2 | Gate: `UNKNOWN`/`DENIED` fixtures fully populated, absent everywhere; `/metrics` counts; **the two `404` bodies compared byte-for-byte** (D-11) |
| FR-3 | Gate: never-public absence (unchanged half) + `technicalSupport` still present for `Admin` |
| FR-4 | Per-slot assertions on **all three write paths** + the standing mutation test (RV-3, D-12) |
| FR-5 | `template-columns.spec.ts` incl. required-flag pin; v3 round-trip; stale-template message **read by a human** (D-9) |
| FR-6 | Component tests for both sections and the em-dash path; **page-level** absence of any "Restricted" affordance (D-14); **contrast/layout → human or T6** (D-8) |
| FR-7 | `csv.test.ts` naming the contact block + filtered-set fidelity (D-15) |
| FR-8 | Repo-wide grep sweep excluding `docs/specs/archive/` (D-7) |
| **FR-9** | **Gate: contact block absent from `GET /api/v1/actors` by key *and* by value** (D-1b) |
| NFR-2 | **The mutation demonstration** — remove the consent pin, show the suite reddens |
| **NFR-6** | Verified by the FR-9 list assertion **plus** a reading of the list projection — explicitly **not** by the CSV test, per its disqualifier |
| — | **D-1c sweep:** all seven `PII_ALLOWLIST` sites re-pointed; verified by grepping for the constant and showing no surviving iteration site |

Verification uses the failure-only forms in `CLAUDE.md`. There is no `test:e2e` script; the 16 `*.e2e.spec.ts` files run under the ordinary `npm test`.

## 11. Reversion Challenges

| # | Guard removed | What breaks | Resolution |
|---|---|---|---|
| **RV-1** | `RestrictedContactPanel` | Its own tests, two suites that assert it *exists*, `contrast.test.ts`'s WCAG subject, and design.md DD-2. `--color-restricted-bg` survives. | Tests inverted and re-pointed; DD-2 via FR-8; token kept. |
| **RV-2** | Five fields' membership in `PII_ALLOWLIST` | **Coverage in seven files, silently** — six beyond the gate (J-2), including the *only* proof that the Admin projection still returns PII. **Six** of the seven never import `NEVER_PUBLIC_FIELDS` — only `pii-consent.policy.spec.ts` and `pii-boundary.spec.ts` do — so relocating `technicalSupport` **deletes** its coverage instead of moving it. *(Count corrected from five, R2-7.)* | **DD-1** + the D-1c exhaustive sweep + by-value pins on every constant. |
| **RV-3** | The DD-18 compile barrier | The type error blocked `payload.contactPerson` in **every** slot; a single test covers one slot under one input. Escaping variants: `traderName ?? contactPerson`, `marketLocation ?? contactPerson`, the reverse `contactPerson ?? position`, and the unconditional `position: payload.contactPerson` clobber. | **Per-slot assertions across the whole projection**, plus a *standing* (not hand-run) mutation test. **Still weaker than a compile error** — recorded as a genuine, accepted loss, not an equal swap. |
| **RV-4** | `csv.ts`'s "never add phone/email" comment | A human-readable guard on the file most likely to be widened by reflex. | **Superseded by something stronger:** after DD-3 the CSV's input type has no contact fields, so the guard is now the type system, not a comment. |

## 12. Design Decisions

### DD-1: Each direction gets its own non-empty constant, and every constant is pinned by value

- **Context.** `pii-boundary.spec.ts` derives its checked fields from `[...PII_ALLOWLIST, ...NEVER_PUBLIC_FIELDS]`, and six further suites spread or loop over `PII_ALLOWLIST` directly. Emptying it deletes coverage in seven files with no test failure.
- **Decision.** Introduce `PUBLICLY_DISCLOSED_FIELDS` and `CONTACT_BLOCK_FIELDS`; re-point **all seven** sites; pin **every** policy constant by value in `pii-consent.policy.spec.ts`, including the deliberately empty one.
- **Correction to revision 1.** Revision 1 claimed a schema-column totality assertion already existed in the suite. **It does not.** The only assertion so named is a *route* totality over `RegistrationsModule`. What actually prevents an unclassified new column from leaking is the serializer's explicit-pick construction — a **design property, not a test**. The by-value pins are the test that was missing.
- *KZ-002, KZ-008.*

### DD-2: `PII_ALLOWLIST` stays, empty, pinned

Deleting it removes the designated one-edit point if legal re-restricts a field. Its by-value test becomes `expect([]).toEqual([])` — vacuous but harmless, and kept as the record that the set changed deliberately. The disjointness test likewise becomes trivially true; both are annotated in the suite rather than left to be rediscovered. *(OQ-1.)*

### DD-3: The bulk boundary lives in the list projection, not in the CSV

- **Context.** Revision 1 withheld the contact block from the CSV alone. Judgment Day J-13 verified this is inert: `useDashboardActors` (`DASH_PAGE_SIZE = 100` × `DASH_MAX_PAGES = 10`) and `app/(public)/map/page.tsx` accumulate every matching actor into browser memory, so the data is delivered regardless of what the download button writes.
- **Decision.** `GET /api/v1/actors` returns the list set; only `GET /api/v1/actors/:id` returns the contact block.
- **Consequences.** Harvesting cost rises from ~10 unauthenticated requests to one-per-actor. The profile is unaffected (it already reads the detail endpoint). The directory, map and dashboard are unaffected because none of them displays contact data. **The CSV does change** — it *loses* nothing and *gains* `sex` and `otherCrops` (A-1); saying it was "unaffected" was wrong (R2-5). **This reverses an FR-1 clause from revision 1** that required list and detail to carry identical field sets — that clause was written before the bulk path was understood, and it mandated exactly the exposure this decision closes.
- **Honest limit.** This is a cost increase, not prevention. `ActorsController` has no throttle guard, and adding one is out of scope. *(NFR-6.)*

### DD-4: `LEAKABLE_PII_VALUES` is split, not edited

That constant holds **eleven** values under one expectation. After this change they fall into three groups with three different expectations, so it splits into three constants and every call site is re-pointed. **All eleven are assigned below — an unassigned member is how `technicalSupport` would get dropped instead of moved (R2-2).**

| Group | Members | Detail | List | `/metrics` |
|---|---|---|---|---|
| **Detail-only** | `'+255700000000'` (phone) · `'director@example.com'` (email) · `'Director'` (position) · `'Arusha Central Market'` (marketLocation) | present | **absent** | absent |
| **Public everywhere** | *(none today — `sex` and `otherCrops` have no fixture value in this array)* | — | — | — |
| **Never public** | `'Needs cold storage'` (technicalSupport) · `'TZ-SEED-0001'` (traderId) · `'1400'` (gpsAltitude) · `'SELF_REGISTERED'` · `'SIGNED_FORM'` · `'2026-02-14'` · `'CONSENT-REF-SIGNED-9931'` | absent | absent | absent |

**Correction, 2026-09-04 (R2-1).** Revision 2 of this decision placed `'Arusha Central Market'` in the detail-only group while FR-7's table still had `marketLocation` in the list set — the constant and the requirement pointed opposite ways, and an implementer following the constant would have "fixed" the resulting failure by dropping `marketLocation` from `toPublicListItem`. Resolved by the A-1 decision: `marketLocation` **joins the contact block**, so the constant and the requirement now agree. *(Judge A F-5 / R2-1, both orchestrator-verified.)*

### DD-10: The gate's non-granted fixtures get distinct PII values

- **Context.** `fixtureActor()`'s defaults are inherited verbatim by `actor-unknown-1` and `actor-denied-1`, which override only seven keys (`id`, `traderId`, `traderName`, `region`, `traderType`, `consentStatus`, `crops`). All five fixtures therefore carry **byte-identical** `phone`, `email`, `position`, `marketLocation`, `sex`, `technicalSupport`, `district`, `capacityTons` and provenance values. Only `id`/`traderId`/`traderName` are per-row unique — and those are the three the existing non-granted assertions happen to use.
- **Why it matters here.** FR-2 requires that *no field of either non-granted actor appears in any public response body*. By value that is **unfalsifiable today**: on the detail path the granted actor legitimately supplies the same strings. A sweep asserting the DENIED actor's phone is absent can never fail. DD-4's split makes it worse before it makes it better, by moving four of those strings out of the only array that swept them.
- **Decision.** `actor-unknown-1` and `actor-denied-1` receive their **own** `phone`, `email`, `position`, `marketLocation`, `sex` and `technicalSupport` values, distinct from every granted fixture, following the pattern that file already uses for the deliberately non-default provenance values. Only then is FR-2's by-value clause falsifiable.
- **Consequences.** This is the concrete input that makes NFR-2's mutation demonstration meaningful for the *consent* direction, not only the field-identity one. **It is a prerequisite for the gate work, not a follow-up** — sequenced before the inversion, and it owns defect class **D-2**.
- *Judgment Day J-7, adjudicated TRUE by both round-2 judges. KZ-002.*

### DD-5: The DD-18 rationale is rewritten with attribution, not deleted

The comment must record **who** decided to publish `contactPerson` (Daniela Gómez), **when** (2026-09-03/04), and **which spec** authorises it — and must keep the narrower standing guard that `position` never falls back to `contactPerson`. *(FR-4, KZ-008.)*

### DD-6: The frontend type splits so bulk views cannot name a contact field

`PublicActor` aliases `PublicActorListItem`; `PublicActorDetail` extends it. The 45 existing consumers compile unchanged and lose the *ability* to reference contact data. Structural, not disciplinary. *(§9.)*

### DD-7: Phone and email render as text, not links

`tel:`/`mailto:` anchors put contact data in an `href` — trivially harvested, and no benefit over selecting text.

### DD-8: Supersedes TRD ADR-003 — number allocated at apply time

ADR-003 is **half** superseded: the consent pin stands; the field-identity allowlist does not. The new ADR records consent-as-the-boundary **plus** the list/detail split. Highest ADR on `main` is **ADR-012 [verified 2026-09-04, both judges]**, so ADR-013 is expected — but allocation happens on the default branch at apply time, re-checking unmerged branches first. *(KZ-010.)*

### DD-9: No `select` narrowing

`ActorsService` fetches whole rows and projects in the serializer. A `select` would be a second barrier that can silently disagree with the projection. One barrier, obviously placed. *(`requirements.md` §2.1.)*

## 13. Security & RBAC

Roles unchanged. Guards unchanged. The `Admin` projection is unchanged apart from the two new columns — **and its only proof of that is the `PII_ALLOWLIST` loop in `actors-admin.service.spec.ts`, which this change would otherwise silently delete** (J-2). Re-pointing it is not optional.

What widens: the `Public` role's field visibility on the **detail** path for consented actors. Nothing widens for non-consented actors, nothing widens in bulk, and no new write path exists.

## 14. Infrastructure / Deployment

One Prisma migration. No new AWS resources, no IaC or secret change. All AWS/SAM commands `--profile IBD-DEV`; frontend deploy via `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`.

Deploy order: migration → backend → frontend. A frontend ahead of a stale backend renders em-dashes rather than breaking.

## 15. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Seven suites go vacuous** (RV-2) | DD-1 + the D-1c exhaustive sweep + by-value pins. Highest-value work in the spec. |
| **Bulk exposure via list/map/dashboard** (J-13) | DD-3 — the boundary moves into the projection. |
| `LEAKABLE_PII_VALUES` mis-edited instead of split | DD-4. |
| Type widening re-opens the CSV | DD-6 — the type makes it unrepresentable. |
| `contactPerson` reaches `position` (RV-3) | Per-slot assertions + standing mutation; accepted as weaker than the compile error. |
| Migration on dev RDS | Additive nullable, no backfill, reversible; `backend/CLAUDE.md` rehearsal rules. |
| Six documents drift | One commit (FR-8). |
| Rendered profile defect | No automated gate — human or T6 (D-8). |
| Consent text still placeholder, and `email` was collected for verification not publication | NFR-7, accepted, owner programme/legal, with J-11 surfaced to them. |

## 16. Budget

Revised after dual review. Revision 1's figures (13 tasks / ~950 LOC / ~18 rounds) were computed against a file tree missing roughly a dozen files and were optimistic by 40–100% (Judge A F-9).

| Metric | Revision 1 | Revision 2 | **Revision 3** |
|---|---|---|---|
| Tasks | 13 | 17 | 19 → **20** |
| Net LOC | ~950 | ~1,600 | ~2,000 → **~2,080** (band 1,700–2,400) |
| Review rounds | ~18 | ~24 | ~28 → **~29** |

Revision 2's figures were still computed against an undercounted tree (R2-6): its own preamble said "ten files plus roughly a dozen" while the tree carried far more. Rebased here against the measured 40 line-items, plus DD-10's fixture work and the four files from R2-3.

The dominant lines are the seven-file vacuity sweep, `pii-boundary.spec.ts` (2,069 lines) with the `LEAKABLE_PII_VALUES` split, `actor-import.service.spec.ts` (1,069), `ActorForm.tsx` (959), and the two profile suites (334 + 273) that currently assert the *opposite* of FR-6.

**Tripwire:** exceeding these stops the Leader and escalates. Revision 1's tripwire was worded to misread a scoping miss as an implementation deviation; it now reads — *if the gate work alone exceeds ~450 LOC, check first whether a file outside §4 is being edited, and only then whether DD-1 was worked around.*

**Budget amendment, 2026-09-04 (T-20).** Approved by Daniela Gómez during execution after the T-3 Reviewer's KZ-004 forward sweep found **six live sites** asserting that `contactPerson`/`otherCrops` are review-context-only and unpublished — including a rendered admin badge with four tests pinning it, and **applicant-facing helper text in the public registration form** promising non-publication of a required field. No task owned any of them; §4's inventory listed none; T-17's sweep targets a different string. Recorded here rather than absorbed silently, per the budget-tripwire rule.

**Depth re-check:** confirms **Full**.
