# Tasks — Admin Actor Bulk Import (Excel)

- Spec path: docs/specs/admin/actor-import/
- Status: Approved (JuanCode, 2026-07-10)
- Author / Date: SDD (Leader) — 2026-07-10
- Traces: requirements.md FR-1..FR-11 / NFR-1..NFR-8 (Approved); design.md §1–§10 (Approved)

## Tasks

- [x] T-1 Add `IMPORT` audit action (enum migration)  (deps: none)
      Scope: add `IMPORT` to `ActorAuditAction` in `schema.prisma`; generate + check in the additive migration; local rehearsal only (RDS apply happens in T-9).
      Traces: FR-8, NFR-7; design.md §2
      Files: backend/prisma/schema.prisma, backend/prisma/migrations/*add_import_audit_action*
      Verify: `cd backend && npx prisma migrate dev --name add_import_audit_action && npm run build`
      Done when: migration applies on local MySQL, diff touches only the enum, client exposes `IMPORT`, backend compiles.
      Skills: nestjs-expert

- [x] T-2 Template column map (single source of truth)  (deps: none)
      Scope: `common/template-columns.ts` — ordered column defs `{ header, field, required, allowedValues?, format? }` built from `CANONICAL_REGIONS`, `TRADER_TYPES`, sex values, the 3-crop YES/NO columns (DR-3), and `ConsentStatus`; export the template version constant (`v1`). Unit tests pin header order, required flags, and that allowed values equal the normalize.ts constants.
      Traces: FR-1, NFR-8; design.md §4, §8 DR-3
      Files: backend/src/common/template-columns.ts, template-columns.spec.ts
      Verify: `cd backend && npm test -- template-columns`
      Done when: tests green; column map covers the full Actor field set incl. 3 crop columns and version constant.
      Skills: nestjs-expert

- [x] T-3 Template generator script + committed asset  (deps: T-2)
      Scope: `backend/scripts/generate-import-template.ts` (exceljs as dep) — Data sheet (headers + dropdown data-validations from the column map), Instructions sheet (per-column required/format/allowed values + version stamp), **fixed workbook created/modified dates** (byte-stable, DR-7); npm script `generate:template` writing `frontend/public/templates/actor-import-template.xlsx`; commit the generated asset. Test asserts regenerating byte-equals the committed file.
      Traces: FR-1, NFR-8; design.md §4, §8 DR-2/DR-7
      Files: backend/scripts/generate-import-template.ts, backend/package.json, frontend/public/templates/actor-import-template.xlsx, backend/src/common/generate-template.spec.ts (or scripts test)
      Verify: `cd backend && npm run generate:template && git diff --exit-code frontend/public/templates/ && npm test -- template`
      Done when: asset committed; regeneration is byte-identical; Instructions sheet lists exactly the enforced allowed values + version.
      Skills: nestjs-expert

- [x] T-4 Import request DTO + report types  (deps: none)
      Scope: `dto/actor-import-request.dto.ts` (`fileName @Matches(\.xlsx$)i`, `fileBase64 @IsBase64`, `mode @IsIn(['preview','commit'])`, `acknowledged? @IsBoolean`); `actor-import.types.ts` (`ImportReport`, `RowResult` per design §3). Unit tests for accept/reject (bad extension, non-base64, bad mode).
      Traces: FR-2, FR-3; design.md §3
      Files: backend/src/actors/dto/actor-import-request.dto.ts, backend/src/actors/actor-import.types.ts, dto spec file
      Verify: `cd backend && npm test -- actor-import-request`
      Done when: DTO tests green; types match the design contract exactly.
      Skills: nestjs-expert, api-design-principles

- [x] T-5 `ActorImportService` + `logImport` (parse, validate, dedupe, preview, chunked commit)  (deps: T-1, T-2, T-4)
      Scope: per design §4 — base64 decode with 4 MB guard; exceljs load hardened (parse errors → 400); row cap 1,000; map/normalize via column map + `normalize.ts`; validation parity with `AdminActorCreateDto` bounds; GPS out-of-range → cleared + warning (DR-5); in-file dedupe (first wins) + single-query DB dedupe; consent gate (GRANTED needs `acknowledged` on commit, empty → UNKNOWN); preview = no writes; commit = stateless re-validate then chunks of 100, each one `$transaction` (creates + crop links + `ActorAuditService.logImport` batch, acknowledged persisted); chunk failure isolates (later chunks proceed); report totals always consistent. Acting email pre-resolved once.
      Traces: FR-2..FR-8, NFR-1, NFR-4, NFR-6; design.md §3, §4, §8 DR-4/DR-5/DR-6
      Files: backend/src/actors/actor-import.service.ts, actor-audit.service.ts (+logImport), actor-import.service.spec.ts, actor-audit.service.spec.ts (extended)
      Verify: `cd backend && npm test -- actor-import && npm test -- actor-audit`
      Done when: unit tests cover every §10 unit item (mapping, per-field validation, GPS warning, both dedupes, consent gate, chunk fault isolation, totals, caps) and pass.
      Skills: nestjs-expert, error-handling-patterns, api-design-principles

- [x] T-6 Controller route, body limit, and e2e  (deps: T-5)
      Scope: `@Post('import')` `@HttpCode(200)` on `AdminActorsController` (before `:id` routes); raise the JSON body limit to 8 MB in BOTH entrypoints via the shared bootstrap pattern (design §4/§9 — same factory discipline as W-1); e2e per design §10: RBAC 401/403/200, preview-writes-nothing, mixed-fixture commit lifecycle (created/skipped/failed/warning + audit entries via history route), re-upload idempotence (0 created), GRANTED-without-ack rows fail, not-xlsx/over-cap → 400, no PII values in report bodies, **pii-boundary + public reads regression green**.
      Traces: FR-2..FR-8, FR-10, FR-11, NFR-1, NFR-4, NFR-5; design.md §3, §4, §6
      Files: backend/src/actors/admin-actors.controller.ts, backend/src/main.ts, backend/src/lambda.ts (or shared bootstrap helper), backend/src/test/admin-actor-import.e2e.spec.ts
      Verify: `cd backend && npm test -- admin-actor-import && npm test -- pii-boundary && npm run build`
      Done when: e2e green incl. idempotence and PII assertions; full backend suite green; build clean.
      Skills: nestjs-expert, api-design-principles

- [x] T-7 Frontend API client `importActors`  (deps: T-6)
      Scope: extend `lib/api/actors-admin.ts` — `importActors(file: File, mode, token, acknowledged?)`: client-side `.xlsx`/size guard, File → base64, POST, typed `ImportReport` return; error mapping via `ApiError` (400 details, 401/403). Unit tests for encoding, URL/body, guards, error mapping.
      Traces: FR-2, FR-3, FR-7; design.md §3, §5
      Files: frontend/lib/api/actors-admin.ts, frontend/lib/api/actors-admin.test.ts
      Verify: `cd frontend && npm test -- actors-admin`
      Done when: client tests green; `ImportReport` type mirrors the backend contract.
      Skills: vercel-react-best-practices

- [x] T-8 Import page, preview table, and toolbar entry  (deps: T-3, T-7)
      Scope: `/admin/actors/import` page per design §5 — template download link (static asset), labeled `.xlsx` picker with client guard, preview (totals chips + `ImportPreviewTable`: row #, traderId, name, outcome badge, inline errors/warnings, invalid-first), confirm step gated by `AcknowledgeDialog` when previewed rows publish (GRANTED), result view with live-region summary, back-to-actors with refetch; **Import** toolbar button beside New actor; tokens only; WCAG AA states. Component tests: flow states, ack gating, badge/error rendering, non-xlsx rejection, template link.
      Traces: FR-1 (link), FR-6 (ack UI), FR-9, NFR-2, NFR-3; design.md §5
      Files: frontend/app/(admin)/admin/actors/import/page.tsx, frontend/components/admin/ImportPreviewTable.tsx (+tests), frontend/app/(admin)/admin/actors/page.tsx
      Verify: `cd frontend && npm test -- Import && npm run build`
      Done when: full flow works against the client; export build green; console behavior (filters/selection/bulk/rows) untouched.
      Skills: ui-ux-pro-max, frontend-design, vercel-react-best-practices

- [x] T-9 Deploy: migration + backend + frontend + live verification  (deps: T-6, T-8)
      Scope: apply `add_import_audit_action` to dev RDS (`prisma migrate deploy`, secrets composed in-process per runbook); deploy backend (built template, CORS preserved) + frontend; live checklist: template downloads from CloudFront, preview+commit of a small real file from `/admin/actors/import`, re-upload → all skipped, imported actors visible in console with `IMPORT` history entries and absent from the public map/directory (UNKNOWN), 401 on the route without token, smoke.sh PASS. All AWS via `--profile IBD-DEV`; requires explicit user authorization.
      Traces: NFR-6, NFR-7, FR-1..FR-11 (live); design.md §7
      Files: none new (deploy artifacts); execution.md evidence
      Verify: `smoke.sh` + manual live checklist recorded in execution.md
      Done when: migration applied, both apps deployed, live checklist PASS, no public-surface regression.
      Skills: aws-serverless

## Dependency Graph

```
T-1 ─┐
T-2 ─┼→ T-5 → T-6 → T-7 → T-8 → T-9
T-4 ─┘                 T-2 → T-3 → T-8
                       T-6 → T-9
```

Parallel-friendly: T-1, T-2, T-4 have no deps; T-3 can run parallel to T-5/T-6/T-7.

## Testing & Verification Expectations

- Targeted jest per task; full gates at T-6 (backend suite + build) and T-8 (frontend suite + export build).
- PII boundary re-verified at T-6 — any failure is a release blocker (FR-11).
- Template byte-stability enforced by T-3's `git diff --exit-code` check.
- T-9 touches AWS: every command `--profile IBD-DEV`; migration via `migrate deploy` only.

## Execution Conventions

- Commits: `[SPEC:admin/actor-import] <message>`.
- Leader maintains `execution.md` per loop iteration with PASS/FAIL + evidence.
- No new PII fields; uploaded file contents never logged or persisted (FR-11).
