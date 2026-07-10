# Requirements — Admin Actor Bulk Import (Excel)

- Spec path: docs/specs/admin/actor-import/
- Status: Draft
- Author / Date: SDD (Leader) — 2026-07-10
- Related: docs/prd.md (US-6, AC-5, Data Import/Export goal); docs/system-design/design.md §2 (admin IA), §7 (tokens), §10 (a11y); docs/detailed-design/detailed-design.md (ImportModule, CSV header→field mapping, GPS rule — **with a recorded deviation: skip instead of upsert**); proposal.md (Approved 2026-07-10); archived `2026-07-09-admin--actor-crud-audit` (create validation, `ActorAuditLog`), `2026-07-08-admin--bulk-actor-operations` (console, result patterns), `2026-07-01-admin--user-management` (admin foundation)

## 1. Summary

The fourth admin module: bulk-load actors from an **Excel (.xlsx)** file. Field staff fill a **downloadable canonical template** offline (instructions sheet + data sheet); an Admin uploads it at the actors console, reviews a **validate-first preview** (to-create / duplicates-to-skip / invalid rows with reasons), confirms, and the valid rows are created in batched transactions with per-row results and `IMPORT` audit entries. Actors whose `traderId` already exists are **skipped — never re-created, never modified**. Imported actors default to `consentStatus = UNKNOWN`, so imports are never publicly visible until explicitly unlocked through the existing acknowledged bulk-unlock flow. Advances PRD US-6/AC-5.

## 2. Requirement Numbering & Writing Standards

- Functional `FR-1…`; non-functional `NFR-1…`. Atomic, testable, traceable (RFC 2119).
- RBAC roles `Public`/`Staff`/`Admin`; PII = `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport`; AWS via `--profile IBD-DEV`.
- **Constitutional deviation (approved at proposal):** detailed-design specified "upsert by `traderId`" for import; this spec changes the behavior to **skip existing** — an outdated field file must never overwrite curated registry data.

## 3. Glossary

- **Template** — the canonical `.xlsx` the app offers for download: an **Instructions sheet** (how to fill each column, required/optional, allowed values, template version) and a **Data sheet** (canonical headers only, no data).
- **Preview (dry run)** — server-side validation of an uploaded file that reports what *would* happen (created / skipped / failed per row) **without writing anything**.
- **Skip** — a row whose `traderId` already exists in the registry (or appeared earlier in the same file) is reported and not imported; the existing actor is untouched.
- **Row result** — the per-row outcome: `created`, `skipped-duplicate` (DB or in-file), or `failed` (validation errors with field-level reasons), always tied to the Excel row number.
- **Template version** — an identifier stamped in the Instructions sheet identifying the schema the template was generated from.

## 4. System Context & Scope

**In scope:** template asset + regeneration tooling; Admin-only upload endpoint with preview and commit modes; row validation (same rules as single create); skip-on-duplicate; batched transactional creates; per-row reporting; `IMPORT` audit entries (additive enum migration); the actors-console import UI (template link, upload, preview table, confirm, result summary).

**Out of scope (see §9).**

## 5. Stakeholders / Personas

- **Field staff / enumerators** — fill the template offline during field campaigns; never touch the app.
- **Admin operator** — downloads/distributes the template, uploads filled files, reviews previews, confirms imports; accountable via audit.
- **Compliance reviewer** — relies on consent-safe defaults (imports never auto-publish) and the audit trail.
- **Public/Staff** — unaffected; public surface unchanged.

## 6. Functional Requirements

### FR-1: Canonical template download
- **Description:** The system SHALL offer, from the admin actors console, a downloadable `.xlsx` template containing (a) a **Data sheet** whose headers map 1:1 to the Actor schema (identity, region/district, type, sex, position, market location, capacity, technical support, phone, email, GPS ×4, crops, consent status) and (b) an **Instructions sheet** documenting, per column: required vs optional, format, and the allowed values for constrained fields (canonical regions, trader types, sex values, crop names, consent statuses), plus a **template version** stamp. The template MUST contain no actor data and no PII.
- **Rationale:** proposal §4.1; without a canonical format, field files need manual cleaning.
- **Acceptance (Given/When/Then):**
  - GIVEN the actors console, WHEN an Admin uses the Import entry point, THEN a working template download is available.
  - GIVEN the downloaded template, WHEN inspected, THEN its Data-sheet headers cover the full Actor field set and its Instructions sheet lists the allowed values that server validation actually enforces, plus the version stamp.
- **PII/RBAC impact:** template is data-free (safe as a static asset); the flow lives in the Admin console.

### FR-2: Admin-only Excel upload with validation
- **Description:** The system SHALL provide an Admin-only endpoint accepting one `.xlsx` upload, enforcing bounded file size and row count (caps finalized in design; over-cap → 400 with a clear message). Every data row MUST be validated with the same rules as single actor create (required fields, canonical region/type, GPS bounds, email format, valid crop names, consent enum), reporting **field-level errors per Excel row number**. Non-`.xlsx` or unparsable files → 400 without partial processing.
- **Rationale:** proposal §5; parity with the create form (AC-5).
- **Acceptance:**
  - GIVEN a valid `.xlsx` within caps, WHEN uploaded, THEN each row is classified (valid / duplicate / invalid-with-reasons).
  - GIVEN a `.csv`, corrupt file, or over-cap file, WHEN uploaded, THEN 400 with a human-readable reason and nothing is written.
  - GIVEN a row with an unknown region and a bad email, WHEN validated, THEN its result lists both field errors with the row number.
- **PII/RBAC impact:** uploaded content contains PII — Admin-only, TLS, never persisted server-side beyond the request, never echoed outside the admin surface (see FR-11).

### FR-3: Validate-first preview (dry run)
- **Description:** Before anything is written, the Admin SHALL see a preview: counts (to-create / to-skip / invalid) and a per-row detail table. The preview MUST NOT write to the database. Proceeding to the actual import MUST be an explicit, separate confirmation, and the commit MUST re-validate server-side (the preview is informative, not authoritative).
- **Rationale:** proposal §4.2; field data quality demands a review gate.
- **Acceptance:**
  - GIVEN an uploaded file, WHEN the preview is produced, THEN the database is unchanged (actor count identical).
  - GIVEN a preview, WHEN the Admin confirms, THEN the commit re-validates and applies; WHEN the Admin cancels, THEN nothing is written.
- **PII/RBAC impact:** Admin-only.

### FR-4: Skip existing actors (duplicate rules)
- **Description:** A row whose `traderId` already exists in the registry SHALL be **skipped**: not created, and the existing actor NOT modified in any way. Rows repeating a `traderId` seen earlier **in the same file** SHALL also be skipped (first occurrence wins) and reported as in-file duplicates. Skips are reported per row with the reason (`exists in registry` / `duplicate in file`).
- **Rationale:** approved product decision (proposal); protects curated data from stale field files. Deviation from detailed-design upsert recorded in §2.
- **Acceptance:**
  - GIVEN a file where 3 rows' `traderId`s already exist, WHEN imported, THEN those 3 are reported skipped, 0 fields of the existing actors change (incl. `updatedAt`), and the rest import normally.
  - GIVEN the same file uploaded twice, WHEN the second import commits, THEN 0 actors are created and every row reports skipped.
  - GIVEN two rows in one file with the same `traderId`, WHEN imported, THEN the first valid one is created and the second reports `duplicate in file`.
- **PII/RBAC impact:** none beyond the surface itself.

### FR-5: Batched, fault-isolated import
- **Description:** On confirmation, valid rows SHALL be created in batched transactions such that (a) an invalid or skipped row NEVER blocks or corrupts valid rows, (b) a mid-import infrastructure failure NEVER leaves a partially-written batch (each batch is atomic), and (c) crop assignments are created with their actors. The response MUST report exactly which rows were committed.
- **Rationale:** AC-5 ("a bad row never corrupts the table"); NFR-4 lineage from prior specs.
- **Acceptance:**
  - GIVEN a file with 10 valid and 2 invalid rows, WHEN committed, THEN 10 actors exist with their crops and the 2 failures are reported with reasons.
  - GIVEN a simulated batch failure, WHEN it occurs, THEN no partial actors from that batch exist and the response reflects reality.
- **PII/RBAC impact:** Admin-only.

### FR-6: Consent-safe default
- **Description:** An imported actor's `consentStatus` SHALL default to `UNKNOWN` when the template column is empty. A file MAY set `GRANTED`/`DENIED`/`UNKNOWN` explicitly; however, setting `GRANTED` via import SHALL require the same explicit acknowledgement gate as the create form (a file-level acknowledgement at confirm time — without it, rows carrying `GRANTED` fail validation with a clear message). Imported actors MUST NOT become publicly visible as a side effect of import unless that acknowledged consent was provided.
- **Rationale:** proposal §4.3; consistency with FR-4 of bulk-actor-operations and FR-1/FR-3 of actor-crud-audit (server-enforced acknowledgement whenever a write publishes).
- **Acceptance:**
  - GIVEN rows with an empty consent column, WHEN imported, THEN the created actors are `UNKNOWN` and absent from the public directory/map.
  - GIVEN rows with `GRANTED` and no acknowledgement at confirm, WHEN committed, THEN those rows fail with an acknowledgement-required message; WHEN the Admin confirms WITH the acknowledgement, THEN they import as `GRANTED` and the acknowledgement is recorded on their audit entries.
- **PII/RBAC impact:** the consent gate is the PII-publication control — server-enforced.

### FR-7: Per-row result report
- **Description:** The commit response (and UI) SHALL report, for every data row of the file: the Excel row number, the `traderId`, and the outcome (`created` with the new actor id / `skipped-duplicate` with reason / `failed` with field-level errors), plus aggregate counts. The report MUST match what actually happened in the database.
- **Acceptance:**
  - GIVEN a completed import, WHEN the report is compared with the registry, THEN every `created` row exists and every `skipped`/`failed` row does not (beyond pre-existing actors).
- **PII/RBAC impact:** the report may echo `traderId`/`traderName` (non-PII identity); it MUST NOT echo phone/email values in error messages.

### FR-8: Import audit trail
- **Description:** Every actor created by an import SHALL get an `ActorAuditLog` entry with a new action `IMPORT` (additive enum migration), the acting Admin (sub + resolved email), timestamp, identity snapshot, and a full field snapshot — consistent with `admin/actor-crud-audit` FR-5. Entries are written transactionally with their batch and batched efficiently. The consent acknowledgement (FR-6) is persisted on the relevant entries. Skipped rows produce NO audit entries (nothing changed).
- **Acceptance:**
  - GIVEN a commit creating N actors, WHEN it completes, THEN exactly N `IMPORT` audit entries exist, visible in each actor's History panel.
  - GIVEN a batch that rolls back, WHEN inspected, THEN no orphan audit entries exist for it.
- **PII/RBAC impact:** audit content is PII-bearing — same Admin-only containment as actor-crud-audit.

### FR-9: Import UI on the actors console
- **Description:** The `/admin/actors` console SHALL gain an **Import** entry point opening an import view/flow with: the template download (FR-1), a file picker restricted to `.xlsx`, upload with progress/disabled states, the preview table (counts + per-row outcomes, invalid rows grouped with their reasons), the confirm step (including the consent acknowledgement when the file publishes actors, per FR-6), the final result summary (live-region announced), and a refreshed actors table afterwards. Loading/empty/error states throughout; existing console behavior (filters, selection, bulk bar, row actions) unaffected.
- **Acceptance:**
  - GIVEN the console, WHEN an Admin completes the flow with a mixed file, THEN preview and result tables render the per-row outcomes and the new actors appear in the table after refresh.
  - GIVEN a non-Admin, WHEN they navigate to the import view, THEN the client redirects AND the API independently rejects (FR-10).
- **PII/RBAC impact:** Admin console only.

### FR-10: Server-side Admin RBAC
- **Description:** The import endpoint(s) MUST require an authenticated Admin via the established guard stack — 401 unauthenticated, 403 Staff/Public — never client-only.
- **Acceptance:** GIVEN each new route, WHEN called without a token → 401; by Staff/Public → 403; by Admin → allowed.
- **PII/RBAC impact:** core gate; release blocker if violated.

### FR-11: PII containment & public surface unchanged
- **Description:** Uploaded file contents (PII-bearing) MUST NOT be persisted server-side beyond request processing, logged, or echoed in error messages/reports beyond non-PII identity fields (`traderId`, `traderName`, row numbers, field *names*). The public `GET /api/v1/actors[/:id]` and metrics behavior MUST remain unchanged (existing PII-boundary tests stay green).
- **Acceptance:**
  - GIVEN any import error/report path, WHEN inspected, THEN no phone/email values appear.
  - GIVEN the public API after this change, WHEN regression-tested, THEN behavior is unchanged.
- **PII/RBAC impact:** defense in depth, extended to file handling.

## 7. Non-Functional Requirements

- **NFR-1 (Security / least privilege):** Admin-only server-side on all new routes; file parsing hardened against malformed input (parser failures → clean 400, never a crash/hang); no new AWS IAM; upload travels TLS through the existing API Gateway.
- **NFR-2 (Static export preserved):** import UI is `'use client'` within the `(admin)` shell; the template is a static asset of the export build; no SSR/route handlers.
- **NFR-3 (Accessibility — WCAG 2.1 AA):** file input labeled and keyboard-operable; preview/result tables navigable with proper headers; progress and results announced via live regions; dialogs reuse the compliant existing components; tokens only.
- **NFR-4 (Integrity & errors):** batch atomicity (FR-5); commit re-validates (FR-3); correct HTTP codes (400 validation/format/over-cap, 401/403, 413 if the gateway rejects size); report always consistent with committed state.
- **NFR-5 (Tests):** backend unit (parsing, validation, dedup in-file+DB, consent gate, batching, audit) + e2e (RBAC matrix, preview-writes-nothing, commit lifecycle, re-upload idempotence, PII-boundary regression); frontend (flow states, preview/result rendering, acknowledgement gating, a11y basics); template regeneration determinism. All suites green.
- **NFR-6 (Performance / limits):** a max-size file (cap ≈1,000 rows, finalized in design) completes preview and commit each within one Lambda invocation (< API Gateway 30s timeout); batched inserts (`createMany` batches sized in design); template regeneration is a dev-time script, not a runtime cost; xlsx parser chosen/configured with Lambda bundle size and cold start in mind.
- **NFR-7 (Migration safety):** the only schema change is the **additive** `IMPORT` value on `ActorAuditAction`; rehearsed locally, applied with `prisma migrate deploy` (`--profile IBD-DEV`); rollback documented.
- **NFR-8 (Template anti-drift):** the committed template is generated by a script from the SAME canonical constants the DTOs/normalizers use (regions, trader types, sex, crops, consent values) and stamped with a version; regenerating without schema changes is byte-stable, and validation errors reference the template version when a stale template is detected (best effort).

## 8. Data & Schema Impact

- **`ActorAuditAction` enum:** + `IMPORT` (additive migration; no table/column changes).
- **No new tables/columns.** Created actors use the existing `Actor`/`CropsOnActors` shapes; `PII_ALLOWLIST` unchanged.
- Uploaded files are processed in-memory per request — nothing stored in S3/DB.

## 9. Out of Scope

- **Update/upsert mode** (skip-only v1); **CSV support**; **Staff access**; **CSV/Excel export** (separate `admin/export`); **async/queued imports**; **executing the legacy real-source-file import** (still legal-gated; its `RawSourceRow` code path stays untouched); localization of the template (English v1, matching the app).

## 10. Dependencies & Assumptions

- Builds on: admin foundation (shell, guards, `apiFetch`), actor-crud-audit (create validation rules, `ActorAuditService`, `ActingAdminResolver`, History panel), bulk-actor-operations (console, result-summary patterns), `common/normalize.ts` canonical constants, and the dormant `import.service.ts` **patterns** (quarantine/dedup/UNKNOWN default).
- **Assumption:** a new backend xlsx-parsing dependency is acceptable (chosen in design for Lambda fit).
- **Assumption:** multipart or base64 upload through the existing API Gateway proxy works within its ~10MB payload limit (validated in design; a 1,000-row xlsx is well under 1MB).
- Deploy: standard backend/frontend scripts + the enum migration, all `--profile IBD-DEV`.

## 11. Open Questions

Resolved at proposal approval (2026-07-10): **duplicates → skip**; **Admin-only**; **.xlsx only**.

For design:
- **OQ-1:** exact row cap (default ≈1,000) and upload transport (multipart vs base64 JSON) through API Gateway/serverless-express.
- **OQ-2:** preview/commit as one endpoint with a `dryRun` flag vs two endpoints (commit re-validates either way, per FR-3).
- **OQ-3:** crops column format in the template — comma-separated names vs one YES/NO column per crop.
- **OQ-4:** invalid-GPS rows — import with GPS nulled + flagged (detailed-design rule) vs fail the row.
- **OQ-5:** template distribution — static asset under `frontend/public/` (URL technically public, contains no data) vs admin-fetched download; and the regeneration script's home (`frontend/scripts/` vs `backend/scripts/`, sharing the canonical constants).

## 12. Requirement ID Index

| ID | Title | Type |
|---|---|---|
| FR-1 | Canonical template download | Functional |
| FR-2 | Admin-only Excel upload with validation | Functional |
| FR-3 | Validate-first preview (dry run) | Functional |
| FR-4 | Skip existing actors (duplicate rules) | Functional |
| FR-5 | Batched, fault-isolated import | Functional |
| FR-6 | Consent-safe default | Functional |
| FR-7 | Per-row result report | Functional |
| FR-8 | Import audit trail | Functional |
| FR-9 | Import UI on the actors console | Functional |
| FR-10 | Server-side Admin RBAC | Functional |
| FR-11 | PII containment & public surface unchanged | Functional |
| NFR-1 | Security / least privilege | Non-functional |
| NFR-2 | Static export preserved | Non-functional |
| NFR-3 | Accessibility (WCAG 2.1 AA) | Non-functional |
| NFR-4 | Integrity & errors | Non-functional |
| NFR-5 | Test coverage | Non-functional |
| NFR-6 | Performance / limits | Non-functional |
| NFR-7 | Migration safety | Non-functional |
| NFR-8 | Template anti-drift | Non-functional |

---
**Conventions reminder:** roles `Public`/`Staff`/`Admin`; PII server-side protection; static export (no SSR); AWS `--profile IBD-DEV`; consent (`GRANTED`) is the public-visibility gate.
