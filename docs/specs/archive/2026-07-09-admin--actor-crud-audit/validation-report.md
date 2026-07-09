# Validation Report — Admin Actor CRUD + Audit History

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/admin/actor-crud-audit/` |
| Validation date | 2026-07-09 |
| Validator | SDD (Claude) — implementation executed by OpenCode (Leader/Implementer/Reviewer loop) |
| Inputs | proposal.md (Approved), requirements.md (Approved), design.md (Approved), tasks.md, execution.md |
| Method | Full-suite runs + builds, file-tree check, and a two-track code conformance audit (backend B1–B13, frontend F1–F10) with independent spot-checks (PII containment grep, transaction placement, migration SQL, error-envelope shape) |

## 2. Summary

> **Post-validation update (2026-07-09, same day):** W-1 was remediated (commit `[SPEC:admin/actor-crud-audit] W-1 fix`, backend now 274 tests green) and T-11 was completed (backend + frontend deployed to dev with `IBD-DEV`, smoke PASSED 8/8, live 401 matrix on all 5 new routes). See execution.md W-1/T-11 entries. Remaining before archive: user's in-browser admin check of the CRUD + History flows. §§3–11 below reflect the original validation snapshot except where marked.

**Overall: PASS with 2 WARNs — not yet archive-ready because T-11 (deploy + live verification) is `[~]` in progress.** *(superseded — see update above)*

T-1..T-10 are implemented, reviewed PASS in `execution.md`, and hold up under independent audit: 23/23 backend conformance checks and 10/10 frontend checks pass; both full test suites are green (backend **268/268**, frontend **849/849**); backend build and frontend static-export build + lint are clean; the migration is exactly the additive-only design (no FK, composite index, no existing-table changes) and is already applied to dev RDS. PII containment of audit data was verified independently (zero references outside the Admin surface). Two WARNs need attention — one integration gap to check during T-11 live verification (400 field-error envelope), one pre-existing tooling gap (backend lint broken).

## 3. Task Completion

| Task | Status | Evidence | Result |
|---|---|---|---|
| T-1 migration | `[x]` | Commit 72054d7; migration SQL verified against design §2; applied to dev RDS (documented deviation, below) | PASS |
| T-2 DTOs | `[x]` | Commit 0b69074; 17 tests; `@nestjs/mapped-types` added | PASS |
| T-3 resolver | `[x]` | Commit 7aa21ed; 5 tests; cache + null-on-failure verified (B4) | PASS |
| T-4 audit service | `[x]` | Commit 90fc424; 17 tests; envelope/empty-diff verified (B2/B3) | PASS |
| T-5 service CRUD | `[x]` | Commit 6eab22d; 34 tests; tx boundaries verified (B1) | PASS |
| T-6 controller + e2e | `[x]` | Commit 16b72ad; 32 e2e tests; RBAC matrix + lifecycle + PII regression verified (B5/B12) | PASS |
| T-7 API client | `[x]` | Commit 0c9958c; 36 tests; **1 real FAIL→fix loop** (consentStatus type fidelity) recorded | PASS |
| T-8 ActorForm + pages | `[x]` | Commit 7dabea0; 18 tests; static-export + ack gating verified (F2/F4) | PASS |
| T-9 row actions | `[x]` | Commit bdd6345; 8+16 tests; bulk behavior preserved (F5) | PASS |
| T-10 history panel | `[x]` | Commit d789756; 10 tests; states + pagination verified (F6) | PASS |
| T-11 deploy + live verify | `[x]` | Backend `sam deploy` (CORS preserved) + frontend deploy + CloudFront invalidation; smoke 8/8 PASS; 401 on all 5 new routes; migration was already on RDS. Admin-session browser checks handed to the user (execution.md) | PASS |

**Documented deviation (accepted):** T-1's "local rehearsal only" was redirected by the user to dev RDS; `execution.md` records the decision, the in-process secret handling (no secrets written/printed), and that only `migrate deploy` ran (no seed). Compliant with NFR-7's process intent.

## 4. File Existence

All 16 design-expected new files exist (backend service/resolver/serializer/DTOs/e2e, frontend form/panel/pages/client + all test files), plus expected modifications (`actors-admin.service.ts`, `admin-actors.controller.ts`, `actors.module.ts`, `ActorsTable.tsx`, `actors/page.tsx`, `client.ts`). Total spec footprint: **38 files, +7,757/−76** across 10 `[SPEC:admin/actor-crud-audit]` commits. **PASS**

## 5. Build Integrity

| Check | Result |
|---|---|
| Backend `npm run build` (nest build) | PASS |
| Backend `npm test` — 25 suites, 268 tests | PASS |
| Frontend `npm run build` (static export; `/admin/actors/new` + `/admin/actors/edit` prerendered ○ Static) | PASS |
| Frontend `npm test` — 65 suites, 849 tests | PASS |
| Frontend `npm run lint` | PASS (pre-existing `<img>` warning only) |
| Backend `npm run lint` | **WARN — broken, pre-existing**: exits 2 ("Oops! Something went wrong", ESLint 9.39.4 with no flat config in the repo; the lint script predates this spec and no ESLint file was ever committed). Not caused by this spec. Recommend a follow-up adding `eslint.config.mjs`. |

## 6. Requirement Coverage

| Req | Evidence | Result |
|---|---|---|
| FR-1 create | Route+DTO+service (B5/B6/B10); e2e 201/400/409; dup traderId → clean 409 (B7) | PASS |
| FR-2 admin detail | `getById` + 404 (B7); e2e | PASS |
| FR-3 update | Partial apply, crop replacement in-tx, GRANTED-transition ack guard (B6/B10); e2e | PASS |
| FR-4 delete single | Snapshot-then-delete in tx; typed ConfirmDialog wired (F5); e2e | PASS |
| FR-5 audit on every write | All 5 mutations audit in the same `$transaction` (B1, independently spot-checked at service lines 148/214/286/356/408); bulk retrofit preserves `BulkResult` (B2); ack persisted | PASS |
| FR-6 survives deletion | No-FK schema (migration SQL verified); e2e "history still returns entries" after delete (B12) | PASS |
| FR-7 history endpoint | Newest-first + id tiebreak, paginated `@Max(100)`, **no existence check** (B8) | PASS |
| FR-8 forms UI | Full field set, validation, ack gating, 409 inline (F3/F4) — **WARN on 400 inline detail** (§7 W-1) | PASS w/ WARN |
| FR-9 row actions | Edit link `edit?id=`, Delete confirm+refetch, New actor button, bulk untouched (F5) | PASS |
| FR-10 history panel | Diff rows, snapshot expandable, load-more, states (F6) | PASS |
| FR-11 RBAC | Class-level guard covers all 5 routes (B5); e2e 401/403 per route (B12) | PASS |
| FR-12 PII containment | Independent grep: zero audit references outside the admin surface; logs emit no `changes`/PII (B9); `pii-boundary` 10/10 green | PASS |
| NFR-1..NFR-6 | Verified across B/F checks + suites (tokens-only F8, static export F9/build, a11y F7, atomicity B1, perf clamps B8/F1) | PASS |
| NFR-7 migration safety | Additive-only SQL verified; applied to dev RDS; rollback documented | PASS |

## 7. Linting & Code Quality (audit findings)

**WARNs (actionable):**
- **W-1 (FR-8, integration):** `ActorForm` maps server 400 field errors from `ApiError.details` as `{field,message}[]`, but the backend uses Nest's **default** `ValidationPipe` envelope — there is no `details` field anywhere in `backend/src` (verified), and `message` is a `string[]`. Against the real API, per-field inline 400 errors silently degrade to the top-level banner (frontend tests pass because they mock `details`). Impact is low (client validation mirrors the DTOs, and 409→traderId mapping works — it keys off status), but this repeats the mock-vs-live lesson. **Verify during T-11 live check; follow-up: either a Nest exception factory emitting `{field,message}[]` details, or client-side parsing of Nest's default `message[]`.**
- **W-2 (pre-existing):** backend lint broken (§5).

**Minor notes (non-blocking):**
- `update()` forwards `dto.acknowledged` into the audit row for *any* update, so a non-consent edit sent with `acknowledged:true` stores the flag on an unrelated UPDATE entry — slightly muddies the flag's meaning.
- The "Decimal exact precision" comment in `actor-audit.service.ts` is overstated: `toAdminActor` coerces Decimal→JS number before the audit layer stringifies. Format conforms; comment should be corrected or serialization moved to the raw row.
- `ActorForm` Cancel button is wired to the `onSuccess` handler (works, semantically odd); `getActorHistory` clamps only the upper pageSize bound (server validates the rest).

## 8. Design Conformance

- **Backend B1–B13: 13/13 PASS** — tx-scoped audit writer, empty-diff skip, envelope shapes, resolver (ListUsers by sub + cache + null-on-failure, resolved pre-tx in all 5 methods), route order (bulk before `:id`), P2002→409, history semantics, module wiring, FK-free migration.
- **Frontend F1–F10: 10/10 PASS** — typed client with pageSize clamp, Suspense'd `useSearchParams` (no `[id]` segment), full-field form, ack gating exactly per the design's transition rule, row actions, history panel, a11y, **zero hardcoded colors/arbitrary values**, static-export safe, backward-compatible `ApiError`.
- **Proposal alignment:** all approved decisions implemented — audit covers todo lo admin (bulk retrofit in place), field-level diff, per-actor panel, retention-forever (no pruning), create included. Non-goals respected (no global audit page, no undo, no other entities).
- **Drift:** T-1 RDS deviation (documented, accepted); `ApiError` added to `client.ts` (T-8 execution notes justify it; audited backward-compatible).

## 9. Test Evidence Summary

- Backend: 268 tests / 25 suites — includes 17 DTO, 5 resolver, 17 audit-service, 34 admin-service, 32 CRUD e2e, 10 pii-boundary.
- Frontend: 849 tests / 65 suites — includes 36 client, 18 ActorForm, 8 ActorsTable + 16 page, 10 HistoryPanel.
- E2E covers the full FR-5/6/7 lifecycle including history-after-delete and tx atomicity; PII regression re-verified.
- **Missing evidence:** live verification against deployed dev (T-11) — including W-1's real-envelope behavior and the audit trail visible end-to-end in the History panel.

## 10. Remediation

| # | Item | Severity | Action |
|---|---|---|---|
| R-1 | Complete T-11: deploy backend + frontend, run the live checklist (`--profile IBD-DEV`); migration is already applied | Required for archive | **DONE** (execution.md T-11) |
| R-2 | W-1: fix the details-envelope mismatch (backend exception factory) | Should-fix | **DONE** — shared `createValidationPipe()` in `common/validation-pipe.ts`, both bootstraps + both e2e suites; +6 tests (274 total) |
| R-3 | W-2: add ESLint 9 flat config to backend (pre-existing) | Nice-to-have | Follow-up |
| R-4 | Minor notes in §7 (acknowledged-on-any-update, Decimal comment, Cancel semantics) | Cosmetic | Optional cleanup |

## 11. Archive Readiness Recommendation

**READY (updated)** — R-1 and R-2 are done: W-1 fixed and covered by tests, both apps deployed to dev, smoke 8/8, live 401 matrix green, public surface regression-free. The one remaining human step is the user's in-browser admin confirmation of the CRUD lifecycle + History panel (needs a Cognito Admin session). After that eyeball check:

```text
/sdd-archive admin/actor-crud-audit
```

R-3 (backend ESLint config, pre-existing) and R-4 (cosmetics) are acceptable follow-ups at archive time.
