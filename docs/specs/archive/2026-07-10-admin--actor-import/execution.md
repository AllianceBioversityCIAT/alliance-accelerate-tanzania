# Execution Log — Admin Actor Bulk Import (Excel)

- Spec path: docs/specs/admin/actor-import/
- Status: In Progress
- Leader: Claude (JCSPECS Leader mode)
- Started: 2026-07-10

---

## 1. Document Control

| Document | Version / Date | Notes |
|---|---|---|
| requirements.md | Approved 2026-07-10 | FR-1..FR-11, NFR-1..NFR-8 |
| design.md | Approved 2026-07-10 | §1–§10, DR-1..DR-7 |
| tasks.md | Approved 2026-07-10 | T-1..T-9 |
| execution.md | Created 2026-07-10 | This file |

Environment note: local MySQL available (docker `accelerate-mysql` on 3306, `backend/.env` → `localhost:3306/accelerate`) — T-1 rehearses locally per the task; RDS apply deferred to T-9.

---

## 2. Task Execution History

### T-1 — Add `IMPORT` audit action (enum migration)

- **Status:** PASS · **Date:** 2026-07-10 · **Attempts:** 1
- **Implementer:** appended `IMPORT` to `ActorAuditAction` + migration `20260710132750_add_import_audit_action` (single `ALTER TABLE ... MODIFY action ENUM(...)`). Verified: `prisma migrate dev` clean on local docker MySQL, client regenerated with `IMPORT`, `nest build` clean. AWS untouched.
- **Reviewer:** PASS — independently confirmed the diff is exactly +1 enum line, migration strictly additive preserving prior value order (NFR-7, design §2); re-ran build (exit 0) and verified `ActorAuditAction.IMPORT` in the generated client. Noted unrelated untracked files belong to T-2/T-4 (in flight) — commit staged only T-1 files.
- **Covers:** FR-8 (foundation), NFR-7.

### T-4 — Import request DTO + report types

- **Status:** PASS · **Date:** 2026-07-10 · **Attempts:** 1
- **Implementer:** `ActorImportRequestDto` (fileName `.xlsx` gate, base64, mode enum, optional acknowledged), `actor-import.types.ts` (`ImportReport`/`ImportRowResult` per design §3), DTO spec. Verified: `npm test -- actor-import-request` → 8/8.
- **Reviewer:** PASS — validators and report types match design §3 field-for-field (incl. exact outcome union); house style + `@sdd-spec` traceability confirmed; tests non-tautological; re-ran suite independently (8/8).
- **Covers:** FR-2, FR-3 (contract layer).

### T-2 — Template column map (single source of truth)

- **Status:** PASS · **Date:** 2026-07-10 · **Attempts:** 1
- **Implementer:** `common/template-columns.ts` (ordered 20-column map, allowedValues imported from `CANONICAL_REGIONS`/`TRADER_TYPES`/Prisma `ConsentStatus`, 3 YES/NO crop columns, `CROP_COLUMN_CATALOG`, `TEMPLATE_VERSION='v1'`) + 11 pinning tests. Verified 11/11 green.
- **Reviewer:** PASS — single-source-of-truth confirmed (no copied literals for region/type/consent); full field coverage vs schema; required flags match `ActorCreateDto`; crop catalog matches `CROP_NAMES`/seed slugs; re-ran 11/11. Non-blocking note: `SEX_VALUES`/`CROP_YES_NO` are local literals (no exported canonical source exists); tests pin equality, drift contained.
- **Covers:** FR-1 (foundation), NFR-8.
- **Leader action:** installed `exceljs` once (needed by both T-3 and T-5) to avoid a concurrent package.json race between parallel implementers.

### T-5 — `ActorImportService` + `logImport`

- **Status:** PASS · **Date:** 2026-07-10 · **Attempts:** 1
- **Implementer:** full pipeline per design §4 (4MB/1,000-row caps → 400, hardened exceljs load, Data-sheet locate w/ header fallback, normalize.ts + DTO-parity validation, GPS clear+warn, in-file + single-query DB dedupe, consent gate, preview purity, chunked commits of 100 with per-chunk tx + `logImport` batch, chunk fault isolation, once-only crop-id/acting resolution); `ActorAuditService.logImport` mirroring `logBulkDelete`. Verified: actor-import 30/30, actor-audit 21/21, build clean.
- **Reviewer:** PASS — re-ran all verification; checklist 10/10. Explicitly ACCEPTED the implementer's DR-5 broadening (non-numeric/negative GPS cells also clear+warn instead of failing the row) as consistent with the decision record's rationale, not scope creep. FR-11 verified via test asserting a seeded email value never appears in report JSON.
- **Covers:** FR-2..FR-8, FR-11 (service layer), NFR-1/4/6.
- **Decision recorded:** DR-5 interpretation extended to malformed (not just out-of-range) GPS cells — an otherwise-valid actor never fails on a dirty GPS cell; it imports unplotted with a warning.

### T-3 — Template generator script + committed asset

- **Status:** PASS · **Date:** 2026-07-10 · **Attempts:** 1
- **Implementer:** `scripts/generate-import-template.ts` (Instructions + Data + veryHidden Lists sheets, 7 range-based dropdowns rows 2..1001, `generate:template` npm script) → `frontend/public/templates/actor-import-template.xlsx` (~10.4 KB); byte-stability spec driving the exported build function. Verified: stable shasums across 6+ runs, 17 template tests green, build clean.
- **Reviewer:** PASS — independently regenerated twice (identical sha256, git-diff clean vs committed asset), opened the xlsx read-only (20 headers frozen/bold, dropdowns on exactly the 7 constrained columns, all 20 columns documented + v1 stamp, zero data/PII), confirmed dev-time-only usage.
- **Decisions accepted by Reviewer:**
  - **(A) ZipWriter finalize wrap:** exceljs/JSZip stamp `new Date()` on auto-created ZIP folder entries with no public API; the script wraps the private `ZipWriter.prototype.finalize` to pin all entry mtimes. Judged contained (dev-time only, never imported by runtime) and genuinely guarded — a moved private path throws at load; a silent no-op mismatches the committed-asset byte-comparison test.
  - **(B) veryHidden Lists sheet:** Region's 31 values exceed Excel's 255-char inline validation limit → range-based dropdowns from a hidden sheet, still derived from `template-columns.ts` (NFR-8 preserved).
- **Minor note:** implementer's report cited an earlier-iteration hash; the load-bearing invariant (regeneration == committed asset) verified independently.
- **Covers:** FR-1, NFR-8.

### T-6 — Controller route, body limit, and e2e

- **Status:** PASS · **Date:** 2026-07-10 · **Attempts:** 1
- **Implementer:** `@Post('import')` `@HttpCode(200)` before the `:id` routes; shared `common/body-parser.config.ts` (`JSON_BODY_LIMIT='8mb'` + `configureBodyParser`) consumed identically by main.ts, lambda.ts, AND the e2e bootstrap (W-1 discipline); 16-test e2e covering the full design §10 plan. Verified: e2e 16/16, pii-boundary 10/10, full suite 32/354, build clean; body limit proved behaviorally (>100 kB requests reach the service, not a 413).
- **Reviewer:** PASS — route order + class-level guard coverage confirmed; single-constant body limit in both entrypoints with e2e parity; every §10 e2e item present and non-tautological (incl. FR-11 no-PII-echo and public regression); mock extensions faithful; re-ran all gates (354/354). Noted `app.useBodyParser` as the idiomatic NestExpress equivalent of the design's `express.json({limit})` sketch — not a substantive deviation.
- **Covers:** FR-2..FR-8, FR-10, FR-11 (HTTP layer), NFR-4/NFR-5.

### T-7 — Frontend API client `importActors`

- **Status:** PASS · **Date:** 2026-07-10 · **Attempts:** 1
- **Implementer:** contract types mirroring `actor-import.types.ts` + `importActors(file, mode, token, acknowledged?)` with pre-network `.xlsx`/4MB guards (plain Error), FileReader→base64, `apiFetch` POST, ApiError/AuthFailureError propagation. Verified: 51/51 (14 new), `tsc --noEmit` clean. Note: `FileReader.readAsDataURL` instead of `arrayBuffer` (jsdom lacks `Blob.arrayBuffer`) — same wire format.
- **Reviewer:** PASS — type fidelity verified field-by-field (exact 5-value outcome union, optionality preserved — the failure mode that cost the prior spec's T-7 an attempt); guards proven to skip fetch; acknowledged omission semantics correct (explicit false included); diff purely additive; re-ran tests + tsc.
- **Covers:** FR-2, FR-3, FR-7 (client layer).

### T-8 — Import page, preview table, and toolbar entry

- **Status:** PASS · **Date:** 2026-07-10 · **Attempts:** 1
- **Implementer:** `ImportPreviewTable` (invalid-first, badges reusing the console's exact token classes, mobile cards), `/admin/actors/import` page (template link → picker → preview chips+table → gated confirm → result with live region; ApiError alert; auth → /login; reset at every step), Import toolbar button. Verified: Import tests 17/17, full suite 67/882, build green with `○ /admin/actors/import` static.
- **Reviewer:** PASS — tokens byte-identical to existing badges (zero hardcoded values); FR-9 flow complete; NFR-2/NFR-3 confirmed; console diff scoped to the link; re-ran gates. **Flagged (accepted, non-blocking):** GRANTED-ack detection couples to the backend warning STRING via `/acknowledgement/i` — ruled acceptable because the approved §3 contract has no structured flag and the flow **fails closed** (server-enforced FR-6 rejects GRANTED-without-ack regardless), so worst case is a confusing failure, never publication. One cold-start test flake observed once, then 8 clean runs.
- **Covers:** FR-1 (link), FR-6 (ack UI), FR-9, NFR-2, NFR-3.
- **Follow-up recommended (design §3 enhancement, post-spec):** add a structured `needsAcknowledgement` flag to the ImportReport (or export a shared `CONSENT_ACK_WARNING` constant) to remove the string coupling.

### T-9 — Deploy: migration + backend + frontend + live verification

- **Status:** PASS (machine-checkable scope; in-browser admin flow handed to the user) · **Date:** 2026-07-10 · **Executor:** Leader (user authorized: "autorizado, ejecuta la T-9")
- **Deploy evidence (all AWS via `IBD-DEV`, eu-west-1):**
  1. **Migration** — `20260710132750_add_import_audit_action` applied to dev RDS via `prisma migrate deploy` (DATABASE_URL composed in-process from Secrets Manager per runbook; nothing written/printed): "All migrations have been successfully applied."
  2. **Backend** — `nest build` → `sam build` (Build Succeeded) → `sam deploy` to `accelerate-tz-dev-backend` with `AllowedOrigin` preserved to the CloudFront URL: "Successfully created/updated stack."
  3. **Frontend** — `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`: build with live API URL, S3 sync (incl. `/templates/`), CloudFront invalidation. "Frontend deployed."
- **Live verification:**
  - `smoke.sh` → **SMOKE PASSED** (API healthy + PII-safe, frontend served, S3 private).
  - `POST /admin/actors/import` without token → **401** (FR-10 live).
  - `GET /templates/actor-import-template.xlsx` via CloudFront → **200**, correct xlsx content-type, **byte-identical to the committed asset** (sha1 `701ac6bc…` matches — NFR-8 end-to-end).
  - `GET /admin/actors/import` via CloudFront → **200** (static page served).
- **Pending user browser confirmation (needs an Admin Cognito session):** download template from the UI, fill a small real file, preview → confirm → result; re-upload → all skipped; imported actors visible in console with `IMPORT` history entries and absent from the public map/directory (UNKNOWN default).

---

### T-9 REOPENED — live browser verification found two defects (2026-07-10)

The user exercised the deployed flow and reported:
1. **PROD BUG (500):** uploading the empty template returns "The file could not be processed — Internal server error". CloudWatch root evidence: `TypeError: Cannot delete property '0' of [object Uint8Array]` at class-validator's whitelist inside the global ValidationPipe — the body reaches the pipe as RAW BYTES under **serverless-http** (lambda path). Local repro against the service with the same file returns a clean 0-row report, and the e2e suite (supertest) passes — **no test exercises the real Lambda handler**; that harness gap let this ship. Rework: `impl-fix500` (handler-level reproducing test → parser fix in the shared body config + defense-in-depth 400 for non-object bodies).
2. **UX:** the native file input reads as a text field, not a button; step layout feels flat; the empty-file case and generic errors need clear messaging. Rework: `impl-fixux` (hidden-input + styled button + drop zone, flow polish, rows===0 notice, friendlier generic error).

### T-9 rework — both fixes PASS + redeployed (2026-07-10)

**Fix 1 — latent serverless-http 500 (impl-fix500 / rev-fix500 PASS):**
- **Root cause (reviewer-verified against installed sources + isolated repro):** `serverless-http@3.2.0` builds its synthetic request with `complete:true`/`readable:false` and pre-assigns `req.body` as a raw Buffer; `body-parser@2.3.0`'s `read()` early-returns on `onFinished.isFinished(req)` → **skips parsing entirely** → the Buffer reaches the global ValidationPipe → class-validator `whitelist` deletes indices off a Uint8Array → TypeError → 500.
- **Timeline resolved:** NOT a regression — express 5.2.1/body-parser 2.3.0/serverless-http 3.2.0 unchanged since bootstrap (511f426); the exceljs install didn't touch them; T-6's `useBodyParser` didn't cause it (default parsers skip identically, proven in isolation). **No authenticated body-carrying write had ever executed on the deployed Lambda** — prior live verifications were GETs + unauthenticated 401s (rejected at the guard, before body parsing). Import was the first authenticated JSON POST through serverless-http.
- **Blast radius:** ALL authenticated JSON write routes on the deployed Lambda (admin CRUD, bulk ops, users, import) were latently broken; this fix repairs all of them.
- **Fix (both entrypoints via the shared helpers — W-1 symmetry):** (a) `normalizeServerlessJsonBody` middleware in `body-parser.config.ts` — parses leftover Buffer/string JSON bodies (8MB → 413, malformed → 400), no-op on the local streamed path; (b) `BodyShapeValidationPipe` in `validation-pipe.ts` — non-plain-object bodies → clean 400 before class-validator (defense in depth; verified safe for all 8 `@Body()` routes).
- **The harness gap is closed:** new `src/test/lambda-handler.e2e.spec.ts` drives the REAL `lambda.ts` handler with a faithful APIGW v2 event — red (500) before the fix, green after. Full suite 356/33 green; build clean.
- **Non-blocking nit (follow-up):** `JSON_BODY_LIMIT` ('8mb') and `JSON_BODY_LIMIT_BYTES` are hand-synced literals — derive one from the other.

**Fix 2 — import page UX (impl-fixux / rev-fixux PASS):** sr-only input + styled primary button inside a dashed drop zone (drag & drop through the same validation path), file chip with size + replace control, numbered step badges, `rows===0` friendly notice, generic 5xx message (400 messages still verbatim). Tokens-only verified (zero hardcoded values); WCAG AA preserved; Import tests 22/22, full suite 887, static export green.

**Redeploy:** backend `sam deploy` (Successfully updated) + frontend deploy + invalidation. Post-deploy: smoke PASSED, import route 401 without token. **Authenticated browser re-verification handed to the user.**

### T-9 CLOSED — user browser confirmation (2026-07-10)

After the rework redeploy (and the adjacent admin-shell mobile fixes committed outside this spec: sidebar placeholder removal `df7a3e1`, hamburger/stacked-body/brand-link `9f5f1ae`, mobile public-site link `54bced8`), the user re-verified the deployed flow on desktop and mobile and confirmed: **"todo funciona bien"**. T-9 marked `[x]`.

## 3. Summary

All 9 tasks complete — T-1..T-8 Reviewer PASS on first attempt; T-9 deployed, reopened on live user findings (empty-template 500 + picker UX), reworked with two PASS fixes, redeployed, and user-confirmed. The rework surfaced and repaired a **latent bootstrap-era serverless-http/body-parser bug that silently broke every authenticated write on the deployed Lambda**, now guarded by a handler-level test harness. Final gates: backend 356/356 (33 suites), frontend 890/890 (67 suites), builds + lints green, live smoke PASS.

