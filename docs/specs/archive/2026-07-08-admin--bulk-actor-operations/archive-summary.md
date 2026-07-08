# Archive Summary — Admin Bulk Actor Operations

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/admin/bulk-actor-operations/` |
| Archive path | `docs/specs/archive/2026-07-08-admin--bulk-actor-operations/` |
| Archive date | 2026-07-08 |
| Final status | **Done — merged, deployed to dev, live-verified, validated PASS** |
| Depth | Full |

## 2. Original Spec Path

`docs/specs/admin/bulk-actor-operations/` — the second entry under the `admin/` taxonomy.

## 3. Archive Date

2026-07-08.

## 4. Final Status

Complete. All 9 tasks `[x]` with Reviewer PASS (T-1..T-8) + Leader live-verification (T-9). Validation PASS. Backend + frontend deployed to dev (`--profile IBD-DEV`) and verified live.

## 5. Requirements Delivered

An Admin-only bulk actor management console:
- **FR-1** — Admin list of all actors (any consent status, PII), paginated + filterable.
- **FR-2** — multi-select table.
- **FR-3** — bulk set `consentStatus` (unlock=`GRANTED` / lock=`DENIED`), transactional, per-id result.
- **FR-4** — server-enforced typed **consent acknowledgement** on unlock (400 without it).
- **FR-5** — bulk delete (transactional, cascades crop links), per-id result.
- **FR-6** — server-side `@Roles('Admin')` on all admin routes.
- **FR-7** — PII containment; public `GET /actors` + PII boundary unchanged.
- **FR-8** — bounded batch (`@ArrayMaxSize(500)`).
- **FR-9** — `/admin/actors` console (selectable table, bulk-action bar, acknowledge/confirm dialogs, result summary); Actors sidebar item activated.

## 6. Files Changed Summary

- **Backend `backend/src/actors/`:** `dto/{admin-actor-list-query,bulk-consent,bulk-delete}.dto.ts`, `admin-actor.serializer.ts`, `actors-admin.service.ts`, `admin-actors.controller.ts`, `actors-admin.service.spec.ts`, `src/test/admin-actors.e2e.spec.ts`; `actors.module.ts` registers both.
- **Frontend:** `app/(admin)/admin/actors/page.tsx`, `components/admin/{ActorsTable,BulkActionBar,AcknowledgeDialog}.tsx`, `lib/api/actors-admin.ts`, `AdminSidebar.tsx` (Actors activated) + tests.
- **Infra (deploy-time fix):** `infra/20-backend/template.yaml` — corrected invalid flow-style YAML on the proxy routes to block style (latent since T-11).
- Commits `7bb06b2`(T-1)…`ba55fd4`(T-8); T-9 deploy + fix + archive in this PR.

## 7. Test Evidence Summary

- Backend **176/176** (21 suites) after a clean `npm ci`, incl. `admin-actors.e2e.spec.ts` (**21** — RBAC 401/403/2xx, over-cap 400, unlock-without-ack 400, public-read regression) + `actors-admin.service.spec.ts` + unchanged `pii-boundary.spec.ts`.
- Frontend **784** (selection, acknowledgement gating, bulk-call args, non-Admin redirect).
- Builds clean. Live (dev): admin endpoints 401 unauth, preflight 204, public `/actors` 200 unchanged, `/admin/actors` served 200.

## 8. Validation Summary

`validation-report.md`: **PASS** — all FR-1..9 + NFR-1..6 satisfied; design + constitutional conformance confirmed; no FAIL findings. (Validation initially surfaced masked failures from corrupted `node_modules`, resolved by clean reinstall.)

## 9. Accepted Warnings Or Follow-Ups

- **Cross-cutting (follow-up):** Jest `testRegex` `.*\.spec\.ts$` silently excludes hyphenated `*.e2e-spec.ts`. This spec's `admin-actors.e2e.spec.ts` (dot) runs correctly, but the archived **`admin/user-management` `users.e2e-spec.ts` never runs** — its RBAC e2e is dead. Recommend a bugfix to rename/relocate it and tighten the jest config to fail on zero-match.
- **Env:** local `node_modules` corruption under iCloud sync (`~/Desktop/DEV/`) repeatedly broke local build/test; ensure the deploy/CI env installs deps cleanly. `frontend/package-lock.json` is gitignored (no committed lockfile) — consider committing one for reproducibility.
- Backend ESLint 9 flat-config gap (repo-wide, accepted).
- Deferred features (separate specs): bulk field-edit, single-actor CRUD, CSV import, CSV export, durable audit log.

## 10. Historical Notes

- **Deploy-time YAML bug (T-9):** `sam build` surfaced invalid flow-style YAML (`{ ... Path: /{proxy+} ... }`) in the backend template — latent since the T-11 user-management CORS route change (which had deployed a hand-edited built template, skipping `sam build`). Fixed to block style + `sam validate` green.
- **`sam deploy` needs Docker** for the makefile build method (unavailable in the deploy env) → deployed via `aws cloudformation package`/`deploy` (same pattern as user-management T-11).
- **Design/impl deviation (accepted):** e2e placed at `src/test/admin-actors.e2e.spec.ts` (dot before `spec`) so the runner picks it up — documented in tasks.md.
- `consentStatus` remains the single public-visibility gate (ADR-1); no schema change.
