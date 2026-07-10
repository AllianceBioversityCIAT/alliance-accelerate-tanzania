# Proposal — Admin Actor Bulk Import (Excel)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `admin/actor-import` |
| Proposal date | 2026-07-10 |
| Author | SDD (Leader) on behalf of JuanCode |
| Status | **Approved** (JuanCode, 2026-07-10) |
| Suggested depth | **Full** (file upload surface, batch writes at scale, PII-bearing input, template asset, audit-enum migration) |

## 2. Intent

The **fourth admin module**: bulk-load actors from an **Excel (.xlsx) file**. Field staff compile actor data offline in a **downloadable template** (with an instructions sheet), and an Admin uploads it from the console. The import validates every row, **skips actors that already exist** (`traderId`), reports a per-row result (created / skipped-duplicate / failed with reasons), and writes audit entries. This fulfills the PRD's US-6/AC-5 (bulk import) and the `admin/import` module deferred by every spec since `bulk-actor-operations`.

## 3. Problem / Current Behavior

- **No way to load field data in bulk.** Actors enter the registry one at a time via the admin create form (`admin/actor-crud-audit`) or by operator-run DB seeds. Field campaigns collect dozens–hundreds of actors offline; typing them one-by-one doesn't scale to the 1,000+ target.
- **An import foundation exists but is dormant:** `backend/src/import/import.service.ts` is pure, unit-tested mapping logic (normalizers, `traderId` dedup, quarantine of bad rows, `consentStatus='UNKNOWN'` default) designed for the **legacy source file's exact headers**, never wired to any controller, and legal-gated for that specific real file. There is no upload endpoint, no template, and no UI.
- **No canonical field-collection format:** without a template, spreadsheets arrive with arbitrary headers/values and require manual cleaning.

## 4. Proposed Outcome

1. **Template download (from the admin console):** a canonical `.xlsx` with an **Instructions sheet** (how to fill each column, required vs optional, allowed values for region/type/sex/crops/consent) and a **Data sheet** with the canonical headers — aligned 1:1 with the Actor schema and the admin create form's validation rules.
2. **Upload & validate-first flow:** Admin uploads the filled `.xlsx` at the actors console. The system parses and validates every row (same rules as single create: canonical region/type, GPS bounds, email format, crop names) and shows a **preview report** — N valid to create, M duplicates to skip, K invalid with row numbers + reasons — **before** anything is written.
3. **Confirmed import:** on confirmation, valid rows are created in batched transactions; **existing `traderId`s are skipped, never created again nor modified**; every created actor defaults to `consentStatus = UNKNOWN` unless the file says otherwise — imported actors are **never public by default** (publishing stays behind the existing bulk-unlock acknowledgement flow).
4. **Result report + audit:** final per-row summary mirrors the preview (created / skipped / failed); each created actor gets an `ActorAuditLog` entry (new `IMPORT` action, snapshot, acting Admin) consistent with `admin/actor-crud-audit`.

## 5. Scope

**Backend:**
- `POST /api/v1/admin/actors/import` — Admin-only, accepts the `.xlsx` (multipart), with a **dry-run/preview mode** and a commit mode; server-side parsing (new xlsx dependency), row validation reusing `common/normalize.ts` + the create-DTO rules; batched transactional creates; per-row result envelope; bounded file size and row count.
- Skip-on-duplicate rule on `traderId` (check against DB, and in-file duplicate detection).
- Audit integration: extend `ActorAuditAction` with `IMPORT` (additive enum migration) + batched audit rows via the existing `ActorAuditService`.
- Reuse the dormant import logic's **patterns** (normalizers, quarantine, UNKNOWN default); the legacy-header `RawSourceRow` shape stays untouched for its original purpose.

**Frontend (`frontend/app/(admin)/admin/actors/`):**
- An **Import** entry point on the actors console toolbar → import view/dialog: template download link, file picker, upload → preview table (counts + per-row errors) → confirm → result summary; loading/error/empty states; tokens + a11y per system-design.
- The template `.xlsx` served as a static asset of the export build (the template contains instructions + headers only — no data, no PII).

**Assets/tooling:** the template checked in under the frontend's public assets, plus a small script that regenerates it from the same canonical constants (regions, types, crops) so template and validation can't drift.

**Infra:** none expected — API Gateway/Lambda already handle the API; payload limits validated in design (a 1,000-row xlsx ≪ the ~10MB gateway cap).

## 6. Non-Goals

- **Update/upsert mode** — v1 only creates; existing actors are skipped (decided at proposal). Re-import-to-correct stays manual via the edit form; an update mode can be a follow-up.
- **CSV support** — template and upload are `.xlsx` only (decided at proposal).
- **Staff access** — Admin-only v1 (decided at proposal); opening a Staff surface is its own spec.
- **CSV/Excel export** — separate `admin/export` spec.
- **Executing the legacy real-source-file import** — still legal-gated and out of scope; this module is for new field-collected data.
- **Async/queued jobs** — v1 is synchronous within one Lambda invocation (bounded rows); a queue is a follow-up if volumes outgrow it.

## 7. Affected Users, Systems, And Specs

- **Users:** Admin operators (upload); field staff (fill the template offline — no app access needed).
- **Backend:** `actors`/`import` modules; one additive enum migration (`IMPORT`).
- **Frontend:** actors console toolbar + new import view; template asset.
- **Specs:** fourth `admin/` module; builds on `actor-crud-audit` (audit, create validation), `bulk-actor-operations` (console, result-summary patterns), `user-management` (admin foundation); PRD US-6/AC-5; detailed-design ImportModule §§ (adapted: skip instead of upsert — recorded as a deliberate deviation).
- **Constitutional note:** detailed-design says "upsert by `traderId`"; this spec changes that to **skip** per product decision — `/sdd-specify` must record the deviation and the rationale.

## 8. Requirement Delta Preview

### ADDED Requirements
- Downloadable canonical `.xlsx` template (instructions + data sheets) aligned with the Actor schema.
- Admin-only `.xlsx` upload with validate-first preview (per-row errors, duplicate detection in-file and vs DB) and explicit confirmation.
- Batch create with skip-on-existing-`traderId`; per-row result report (created / skipped / failed + reasons); bounded file size/row count.
- Imported actors default `consentStatus = UNKNOWN` (never public by default).
- `IMPORT` audit action; audit row per created actor.

### MODIFIED Requirements
- Detailed-design's import behavior changes from "upsert by traderId" to **skip existing** (deviation recorded).
- `ActorAuditAction` enum gains `IMPORT` (additive migration).

### REMOVED Requirements
- None.

## 9. Approach Options

**Option A — New Admin import endpoint + template asset + validate-first UI (recommended).**
Server-side xlsx parsing behind `POST /admin/actors/import` (dry-run + commit), reusing normalizers/create-validation/audit; template as a build asset regenerated from canonical constants. Complete, safe, consistent with every admin pattern established so far.

**Option B — Wire the dormant legacy ImportModule as-is.**
Fast start, but its row shape is the legacy file's dirty headers (not a clean template), it carries the legal-gate framing, and it lacks upload/preview/audit. Wrong foundation for a user-facing template flow.

**Option C — Client-side parsing (frontend reads the xlsx, calls existing create API per row).**
No backend parsing dependency, but validation becomes client-trusted, 1,000 sequential requests are slow and non-transactional, and per-row audit/atomicity guarantees are lost. Rejected.

## 10. Recommended Approach

**Option A.** It delivers the exact field-to-registry flow requested (template → offline capture → upload → preview → confirmed load), keeps every guarantee the admin surface already established (server-side validation, RBAC, audit, PII containment, consent-safe defaults), and turns the dormant import logic's proven patterns into a real user-facing capability without inheriting the legacy file's baggage.

## 11. Risks, Dependencies, And Open Questions

- **Risk — PII in transit/files:** the filled template contains phone/email. Upload is Admin-only over TLS; file contents are never persisted server-side beyond the request; preview/result reports echo row numbers + field names, not full PII values, outside the admin surface. The blank template itself has no PII (safe as a public asset).
- **Risk — Lambda limits:** parsing + creating ~1,000 rows in one invocation (memory, 30s API Gateway timeout). Mitigate: bounded row count per file (cap to finalize in design, e.g. ≤1,000), batched `createMany`, dry-run separated from commit. Async queue explicitly deferred.
- **Risk — template drift:** if the schema or canonical lists evolve, a stale template produces mass validation failures. Mitigate: template regenerated by script from the same constants the DTOs use; template version stamped in the Instructions sheet and echoed in error messages.
- **Risk — xlsx parsing dependency:** new backend dep (e.g. exceljs/xlsx) increases Lambda bundle; validate cold-start impact in design.
- **OQ-1 (design):** exact row cap per file and multipart vs base64-JSON upload through API Gateway.
- **OQ-2 (design):** dry-run and commit as one endpoint with a flag vs two endpoints; whether commit re-validates server-side (it must) or trusts the preview token.
- **OQ-3 (design):** crops column format in the template (comma-separated names vs one column per crop with YES/NO).
- **OQ-4 (design):** whether invalid-GPS rows import with GPS nulled + flagged (detailed-design §GPS rule) or fail the row.
- **Dependency:** none blocking — admin foundation, create validation, audit service, and normalizers all exist.

## 12. Success Criteria

- An Admin downloads the template, fills 2 sheets' worth of field data offline, uploads it, sees an accurate preview (valid / duplicate / invalid with row numbers), confirms, and the valid actors appear in the admin console — all without touching the DB manually.
- Re-uploading the same file creates **zero** new actors (all skipped as duplicates).
- Invalid rows never block valid ones and never corrupt committed data; every result is attributable per row.
- Imported actors are not publicly visible until explicitly unlocked via the existing acknowledged bulk-unlock flow.
- Each created actor has an `IMPORT` audit entry (who/when/snapshot); 401/403 enforced on the endpoint; public API + PII boundary unchanged.
- Backend + frontend suites green; template regeneration script produces the committed asset byte-identically.

## 13. Next Step

```text
/sdd-specify admin/actor-import
```
