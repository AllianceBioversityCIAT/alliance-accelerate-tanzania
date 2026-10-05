# Requirements — One intake contract: required fields, generated Trader ID, duplicate detection, template v4

- Spec path: `docs/specs/actors/consent-intake/intake-required-fields/`
- Parent Spec: `actors/consent-intake` ([`family.md`](../family.md)), chunk 1 of 2
- Status: Implemented and validated (2026-10-05)
- Author / Date: AKILI (Leader) on behalf of Daniela Gómez, 2026-10-02
- Depth: **Standard**. Raised from the proposal's Lite on 2026-10-02, when duplicate detection and the generated Trader ID were added to scope.
- Approval Mode: gated
- Related:
  - `docs/prd.md` (In Scope items 4 and 7, US-9)
  - `docs/trd/trd.md` (§3 data model, §4 API surface)
  - `docs/ux-ui/design.md` (admin forms, import preview)
  - [`proposal.md`](proposal.md) and the sibling [`../consent-request-email/proposal.md`](../consent-request-email/proposal.md) (decisions D-3, D-5, D-6, D-11, D-13)

### Decisions taken during specify (product owner, 2026-10-02)

| # | Decision |
|---|---|
| D-15 | **Trader ID is always system-generated** for admin-created and imported actors. It is no longer an input on the form or the template. Existing actors keep theirs. |
| D-16 | Duplicate detection replaces Trader ID as the safeguard against duplicate actors. |
| D-17 | **A strong match** (same email or same phone as an existing actor, or as an earlier row of the same workbook) means the actor is **not created automatically**. The admin is shown the match and asked. If they confirm "not a duplicate", it is created; otherwise it is not. |
| D-18 | **A weak match** (same name, or GPS within the proximity box, only) means the actor **is created**, with a visible warning naming the match. |

## 1. Summary

Today an actor can enter the registry three ways — self-registration, the admin form, and the Excel import — and each asks for a different set of fields (sibling proposal §3, required-field matrix). The import also relies on an admin-typed **Trader ID** as its only protection against duplicates. Typing that ID is a burden the self-registration path never has, and it fails silently: a mistyped ID that collides is skipped as "already exists".

This spec makes the three paths require **the same fields**. It has the system **generate** the Trader ID, and it replaces the ID-based protection with **duplicate detection on the actor's real identity** (email, phone, name, location). Strong matches are held for an explicit admin decision. The import template is published as **v4** to match.

The spec advances PRD In Scope item 4 (team-managed intake), and it is the field contract that chunk 2 (`consent-request-email`) builds on, since every actor will now have an email to send a consent request to.

## 2. Glossary

| Term | Meaning |
|---|---|
| **Intake path** | One of the three routes that create an actor: self-registration (approved by an admin), **admin create** (the *New actor* form), and **import** (the `.xlsx` upload). |
| **Required set** | The fields every intake path requires: Trader Name, Trader Type, Region, Contact Person, at least one crop, Capacity (tonnes), Phone, Email. |
| **Trader ID** | An admin-only business key, unique across actors, that is never public. It is distinct from the internal record id used in URLs. |
| **Strong match** | A candidate actor whose normalized email **or** normalized phone equals the new actor's. |
| **Weak match** | A candidate whose normalized name equals the new actor's, or whose GPS lies inside the proximity box, **and** that is not also a strong match. |
| **Duplicate confirmation** | The admin's explicit statement, for one new actor, that its strong matches are not the same actor. |

## 3. Functional Requirements

### FR-1: The same required set on every intake path

- **Description:** Admin create, admin edit and import MUST reject an actor that lacks any field of the required set. They MUST use the same field-level messages the self-registration path uses for the same omission. Self-registration's rules are the reference and MUST NOT change.
- *Amended 2026-10-05 (validation remediation, recording the execution-time interpretation from `execution.md` T-1):* "the same field-level messages" binds where a self-registration counterpart exists for the same omission — that is, **admin create** and **import**. A **PATCH** (edit) merged-state omission has no self-registration counterpart, since self-registration has no edit path, so edit keeps its own `<field> is required` message rather than mirroring self-registration's wording.
- **Rationale / Source:** D-6. Today's mismatch is in sibling proposal §3: Contact Person, crops, Capacity, Phone and Email are required on self-registration and optional on the admin form and the import.
- **Acceptance criteria:**
  - **Scenario: admin create without a phone.** GIVEN an admin fills the *New actor* form with every field except Phone, WHEN they submit, THEN the form shows "required" on Phone and no actor is created. AND IT MUST be rejected by the API too: a direct `POST` without `phone` returns `400` naming `phone`, so a client that skips validation cannot bypass the rule.
  - **Scenario: admin create with no crop.** GIVEN all three crop options are unselected and only *Other crops* is filled, WHEN the admin submits, THEN the form and the API both reject the actor for missing crop. BUT *Other crops* alone MUST NOT satisfy the crop requirement, which is the self-registration rule.
  - **Scenario: admin edit of an incomplete existing actor.** GIVEN an existing actor has no email, WHEN an admin edits any field and saves, THEN the save is rejected until Email is filled. BUT the actor MUST NOT be altered, hidden or flagged just by existing incomplete; the rule fires only on a write.
  - **Scenario: import row missing a required cell.** GIVEN a workbook row with a blank Contact Person, WHEN it is previewed or committed, THEN that row is reported `failed` with a reason naming *Contact Person*, and every other valid row is unaffected.
  - **Scenario: capacity of zero.** GIVEN Capacity is `0`, WHEN any path validates it, THEN it is accepted. Self-registration accepts `0`, and the rule is identical.
  - **Scenario: the same bounds, not only the same presence.** GIVEN a value exceeds a bound self-registration enforces (Trader Name > 200, Contact Person > 120, Phone > 40, Email > 191 characters), WHEN any admin path validates it, THEN it is rejected with a field error. Today such an email reaches the database and fails as a `500`: `email` is `VARCHAR(191)` in migration `0001_init_actor_model`, and `ActorCreateDto.email` has no maximum.
- **PII/RBAC impact:** Admin only. No field changes disclosure class. `phone` and `email` stay in `CONTACT_BLOCK_FIELDS`, governed by consent as today (ADR-013).

### FR-2: Trader ID is generated, never typed

- **Description:** When an admin creates an actor or an import row is committed, the system MUST assign a Trader ID that is unique across all actors. The admin form and the import template MUST NOT offer a Trader ID input. The admin edit view MUST show the Trader ID read-only. Self-registered actors keep their existing `SR-` derivation.
- **Rationale / Source:** D-15.
- **Acceptance criteria:**
  - **Scenario: create assigns an ID.** GIVEN an admin creates an actor, WHEN the create succeeds, THEN the actor has a Trader ID in the team-managed format (design.md fixes the format), and the admin sees it on the actor's page.
  - **Scenario: concurrent creates.** GIVEN two admins, or an import and a form create, create actors at the same moment, WHEN both succeed, THEN their Trader IDs differ. AND IT MUST never surface as a uniqueness error to the admin.
  - **Scenario: a client still sends `traderId`.** GIVEN a request to create or update an actor carries a `traderId`, WHEN the API processes it, THEN the value is ignored: it is never stored and never replaces the generated or existing ID. The global `ValidationPipe` runs with `whitelist: true` and without `forbidNonWhitelisted` (`backend/src/common/validation-pipe.ts`, `createValidationPipe`), so an undeclared property is stripped, not rejected. *Amended 2026-10-02: first drafted as "rejected with `400`", which the pipe does not do.* BUT an existing actor's Trader ID MUST NOT change on any edit.
  - **Scenario: existing actors.** GIVEN actors created before this change (for example `OFB-1036`, `TZ-SEED-0001`), WHEN this ships, THEN their Trader IDs are unchanged.
- **PII/RBAC impact:** `traderId` stays in `NEVER_PUBLIC_FIELDS`. No change.

### FR-3: Duplicate detection on admin create

- **Description:** Before an actor is created through the admin form, the system MUST compare it against existing actors. A **strong match** blocks creation until the admin either confirms it is not a duplicate or abandons the create. A **weak match** creates the actor and shows a warning naming the match.
- **Rationale / Source:** D-16, D-17, D-18.
- **Acceptance criteria:**
  - **Scenario: strong match.** GIVEN an existing actor `Kilimo Traders` has email `info@kilimo.tz`, WHEN an admin submits a new actor with email `INFO@kilimo.tz `, THEN no actor is created and the admin sees the candidate (Trader ID, name, and *which* attribute matched: email). The admin can choose **Not a duplicate — create** or **Cancel**.
  - **Scenario: confirmed not a duplicate.** GIVEN the strong-match prompt above, WHEN the admin chooses *Not a duplicate — create*, THEN the actor is created. AND IT MUST record in the actor's activity trail that the admin confirmed it was not a duplicate of the named candidate(s).
  - **Scenario: weak match only.** GIVEN an existing actor has the same normalized name and nothing else matches, WHEN the admin submits, THEN the actor is created and the success feedback names the weak match. BUT it MUST NOT ask for confirmation.
  - **Scenario: the confirmation is not reusable.** GIVEN an admin confirmed "not a duplicate" against candidate A, WHEN they change the email so that it now strongly matches a different actor B, and resubmit, THEN they are asked again about B.
  - **Scenario: the API enforces it.** GIVEN a direct `POST` with a strong match and no confirmation, WHEN the API processes it, THEN it returns a non-2xx response carrying the candidates, and no actor exists afterward.
- **PII/RBAC impact:** Admin only. A candidate exposes Trader ID, name and the *names* of the matched attributes, never the matched values. This is the existing `DuplicateCandidate` projection rule in `backend/src/registrations/duplicate-detection.service.ts`, `DuplicateCandidate` type.

### FR-4: Duplicate detection on import

- **Description:** Import preview MUST classify each otherwise-valid row against existing actors **and** against earlier rows of the same workbook. A strongly matched row MUST NOT be created on commit unless the admin confirmed that row in the preview. Weakly matched rows are created and reported with a warning.
- **Rationale / Source:** D-16, D-17, D-18. This replaces today's Trader-ID-based `skipped-exists` / `skipped-duplicate-in-file` (`backend/src/actors/actor-import.types.ts`).
- **Acceptance criteria:**
  - **Scenario: re-uploading the same workbook.** GIVEN a workbook was committed earlier, WHEN the same workbook is previewed again, THEN every row is shown as a possible duplicate of the actor it created, and committing without confirming any row creates **zero** actors.
  - **Scenario: within-file duplicate.** GIVEN rows 5 and 12 share a phone and neither matches an existing actor, WHEN previewed, THEN row 12 is flagged as a possible duplicate of row 5, and row 5 is not flagged.
  - **Scenario: confirming a row.** GIVEN row 12 is flagged, WHEN the admin marks it *Not a duplicate* and commits, THEN row 12 is created and its activity trail records the confirmation. BUT the other flagged rows the admin did not mark MUST NOT be created.
  - **Scenario: a confirmation whose premise changed.** GIVEN the admin confirmed row 12 in preview, WHEN, before commit, another admin creates an actor that newly strongly matches row 12, THEN the commit does not create row 12 and reports it as a possible duplicate again. A confirmation covers only the candidates the admin was shown.
  - **Scenario: weak match.** GIVEN a row matches an existing actor by name only, WHEN committed, THEN it is created and the result lists the warning.
  - **Scenario: the report stays countable.** GIVEN any mix of rows, WHEN the result shows, THEN *created + not created (possible duplicate) + failed* equals the number of data rows, and each non-created row carries exactly one reason.
- **PII/RBAC impact:** Admin only. The same candidate projection as FR-3, so no matched values appear in the preview or the result.

### FR-5: Import template v4

- **Description:** The published template MUST be version v4, with these changes:
  - The **Trader ID**, **GPS Altitude**, **GPS Accuracy** and **Registration Source** columns are removed.
  - The required set (FR-1) is marked required.
  - **Consent Status, Consent Method, Consent Obtained At and Consent Reference** stay, all optional, with today's `GRANTED` provenance gate unchanged (D-13).
  - Imported actors are always `TEAM_MANAGED`.

  A workbook of any earlier version MUST be rejected as stale, as today. The template's Instructions sheet MUST describe v4, including duplicate detection replacing Trader ID.
- **Rationale / Source:** D-5, D-13, D-15.
- **Acceptance criteria:**
  - **Scenario: v4 imports.** GIVEN a v4 workbook with valid rows, WHEN committed, THEN the rows are created as `TEAM_MANAGED`, with generated Trader IDs.
  - **Scenario: v3 is rejected.** GIVEN a v3 workbook, WHEN uploaded, THEN the whole file is rejected as a stale template, naming the version expected.
  - **Scenario: GRANTED row without provenance.** GIVEN a v4 row with Consent Status `GRANTED` and a blank Consent Method, WHEN previewed, THEN the row fails with today's provenance reason, unchanged.
  - **Scenario: the published file matches the code.** GIVEN the committed `frontend/public/templates/actor-import-template.xlsx`, WHEN the generator is re-run, THEN the output is byte-identical.
- **PII/RBAC impact:** None. GPS Altitude and Accuracy stay on the admin form and in the database (D-11).

### FR-6: Baseline documents state the contract

- **Description:**
  - `docs/prd.md` MUST state the single required set and the generated Trader ID.
  - `docs/trd/trd.md` MUST state the duplicate-detection rule and the Trader ID allocation in its data model and API sections.
  - The TRD's statements that the import dedupes or upserts on `traderId` MUST be replaced by the duplicate-detection rule. `backend/CLAUDE.md` and `backend/AGENTS.md` MUST stay accurate about the template version bump.
  - *Amended 2026-10-02:* no import runbook outside `docs/specs/archive/` exists (`find docs -iname "*runbook*" -not -path "*/archive/*"` returns nothing). The archived one is frozen.
- **Rationale / Source:** CLAUDE.md: constitutional baselines train every future agent.
- **Acceptance criteria:**
  - **Scenario: no stale instruction survives.** GIVEN the change is complete, WHEN `docs/prd.md`, `docs/trd/trd.md`, `docs/infrastructure.md`, `backend/CLAUDE.md`, `backend/AGENTS.md` and the template's Instructions sheet are searched for an instruction to type or build a Trader ID, for a claim that the import dedupes or upserts by `traderId`, or for "template v3", THEN no live instruction remains. Archived specs are frozen and excluded.

## 4. Non-Functional Requirements

| # | Requirement | Measure |
|---|---|---|
| NFR-1 | **One definition, not three copies.** The required set is defined once and consumed by the admin DTO, the import validator and the template generator. A test fails if any of them diverges from self-registration's set. | Mutating one path's rule, e.g. making Phone optional on import, reddens a named test. |
| NFR-2 | **Import preview stays within the Lambda budget.** Duplicate detection over a 1,000-row workbook against the current actor table completes inside the API timeout (`Timeout: 15` in `infra/20-backend/template.yaml`). | Measured in a test or locally with a 1,000-row fixture against ≥1,000 actors. Any single run over 10 s is a failure. |
| NFR-3 | **No matched value leaks.** Duplicate candidates on every surface carry Trader ID, name and the matched-attribute names only. | A test asserts the candidate key set. A deliberately leaking variant that adds `phone` reddens it. |
| NFR-4 | **Accessibility.** The duplicate prompt and the per-row confirmation are keyboard-operable, focus-trapped (dialogs), and announced via `aria-live`. They meet WCAG 2.1 AA. | Component tests, plus the HITL visual check below. |

### Defect classes and the gate that catches each

| Defect class | Gate |
|---|---|
| A path's required set drifts from the others | NFR-1 test (backend Jest) |
| The API accepts what the form rejects | API-level tests per path (backend Jest); the scenario includes a direct request |
| A Trader ID collision under concurrency | **Declared gap**: the e2e harness mocks Prisma (design.md P-17). The substitute is atomic single-statement allocation plus retry specs on both paths (design.md §10, FR-2). |
| A strong match is created without confirmation | Backend tests for FR-3/FR-4, including the stale-confirmation scenario |
| A type contract mismatch between frontend and backend | `npm run build` in both packages (the compile gate) |
| Template drift from code | Generator re-run and byte comparison (FR-5) |
| Prompt or preview layout breaks at 375/768/1440 | **No automated gate.** jsdom cannot measure layout. Substitute: rendered capture via headless Chromium at the three widths, at the HITL pause. |
| A stale doc instruction survives | The FR-6 search, run as recorded in the owning task |

## 5. Data & Schema Impact

- `Actor.traderId` stays `@unique` and becomes system-assigned for new team-managed actors. Allocation needs a race-safe sequence; design decides, likely mirroring `RegistrationSequence`.
- The duplicate confirmation is recorded in `ActorAuditLog`. Design decides between the existing `changes` JSON and a new action value.
- No new field has disclosure implications. `pii-consent.policy.ts` is unchanged.

## 6. Out of Scope

- Chunk 2: consent emails, the public consent page, evidence, S3.
- Duplicate detection on **edit**, for example an edit that changes an email to one already used.
- Changing self-registration's rules or its review-queue duplicate detection.
- Back-filling or flagging existing incomplete actors (D-3).
- Merging duplicates.

## 7. Dependencies & Assumptions

- None upstream. Chunk 2 depends on this spec (`family.md`).
- **Assumption:** the existing `DuplicateDetectionService` matching rules (normalization, the GPS box) are the right ones for admin intake. Design confirms they can run against an un-persisted candidate.
- No AWS resources change.

## 8. Open Questions

None blocking. Trader ID (OQ-1 of the proposal) is resolved by D-15 to D-18.
