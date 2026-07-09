# Archive Summary — Admin Actor CRUD + Audit History

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/admin/actor-crud-audit/` |
| Archive path | `docs/specs/archive/2026-07-09-admin--actor-crud-audit/` |
| Archive date | 2026-07-09 |
| Final status | **Done — implemented, validated PASS, deployed to dev, live-verified (smoke + user browser confirmation)** |
| Depth | Full |

## 2. Original Spec Path

`docs/specs/admin/actor-crud-audit/` — third module under the `admin/` taxonomy; the sibling spec deferred by `2026-07-08-admin--bulk-actor-operations` (its OQ-2).

## 3. Archive Date

2026-07-09 (proposed, specified, executed, validated, remediated, and deployed the same day).

## 4. Final Status

Complete. All 11 tasks `[x]`. Implementation by OpenCode (Leader→Implementer→Reviewer loop, T-1..T-10; one real FAIL→fix cycle at T-7); validation, W-1 remediation, and T-11 deploy by Claude; user confirmed the live admin flows in the browser.

## 5. Requirements Delivered

Admin single-actor CRUD + durable audit history:

- **FR-1..FR-4** — create / admin detail / partial update / delete endpoints (`/api/v1/admin/actors[...]`), validated DTOs, 409 on duplicate `traderId`, consent-GRANTED acknowledgement guard on create and update.
- **FR-5** — every admin write (single CRUD **and** the retrofitted bulk consent/delete) writes audit rows in the **same transaction**: acting Admin sub + Cognito-resolved email, timestamp, action, field-level diff (`{kind:'diff',fields:{f:{from,to}}}`) or snapshot; bulk consent acknowledgement now persisted (previously CloudWatch-only).
- **FR-6** — audit survives actor deletion (no FK + `traderId`/`traderName` snapshot).
- **FR-7** — per-actor history endpoint, newest-first, paginated (`@Max(100)`), works for deleted ids.
- **FR-8..FR-10** — shared `ActorForm` + `/admin/actors/new` + `/admin/actors/edit?id=…` (static-export-safe query-param pattern), row Edit/Delete actions + New actor toolbar, `ActorHistoryPanel` with diffs/snapshots/load-more.
- **FR-11/FR-12** — class-level Admin RBAC on all 5 new routes (live 401 matrix verified); PII containment incl. audit content (independent grep + pii-boundary regression green).
- **NFR-7** — first schema migration (`ActorAuditLog`), additive-only, applied to dev RDS via in-process secret composition (`IBD-DEV`).

## 6. Files Changed Summary

39 files, ~8,070 insertions across 12 `[SPEC:admin/actor-crud-audit]` commits (T-1..T-10, W-1 fix, T-11 docs). Backend: `prisma/schema.prisma` + migration, `actors/actor-audit.service.ts`, `acting-admin.resolver.ts`, `audit-entry.serializer.ts`, 3 DTOs, extended `actors-admin.service.ts` + `admin-actors.controller.ts` + `actors.module.ts`, `common/validation-pipe.ts` (W-1), e2e suites. Frontend: `lib/api/actors-admin.ts` (+`ApiError` in `client.ts`), `components/admin/ActorForm.tsx`, `ActorHistoryPanel.tsx`, `ActorsTable.tsx` row actions, `app/(admin)/admin/actors/{new,edit}/page.tsx`. Details per task in `execution.md`.

## 7. Test Evidence Summary

- Backend: **274 tests / 26 suites** green (incl. 32-test CRUD e2e with RBAC matrix, lifecycle with history-after-delete, tx rollback, W-1 envelope; pii-boundary 10/10).
- Frontend: **849 tests / 65 suites** green; static export build green.
- No standalone `test-report.md` — per-task evidence in `execution.md` + validation-report §9 accepted in its place (same convention as the bulk-actor-operations archive).

## 8. Validation Summary

`validation-report.md`: two-track conformance audit **backend 13/13 + frontend 10/10 PASS** with independent spot-checks (PII grep, tx placement, migration SQL, error envelope). Original verdict: PASS with 2 WARNs; **W-1 (400 details envelope) remediated same day** (shared `createValidationPipe()`, +6 tests); T-11 completed (backend `sam deploy` with CORS preserved, frontend deploy + invalidation, smoke 8/8, live 401 matrix). Final: **READY**, confirmed by user browser verification.

## 9. Accepted Warnings / Follow-Ups

- **R-3:** backend `npm run lint` broken (ESLint 9 without flat config) — **pre-existing**, not from this spec; follow-up to add `eslint.config.mjs`.
- **R-4 (cosmetic):** `acknowledged` persisted on non-consent updates when the client sends it; overstated Decimal-precision comment in `actor-audit.service.ts`; ActorForm Cancel wired to the success handler; client-side lower-bound pageSize clamp absent (server validates).

## 10. Historical Notes

- T-1's "local rehearsal only" was redirected by the user to dev RDS mid-execution (fetch/push had just been repaired after local git object corruption earlier the same day); secrets were composed in-process from Secrets Manager per the `migrate-seed.sh` pattern — never written or printed.
- T-11 was started and stopped in OpenCode, then completed here on explicit user authorization; the first frontend deploy attempt caught a leaked `AWS_PROFILE=MELIA-DEV` and was rerun forced to `IBD-DEV`.
- W-1 is the spec's signature lesson: frontend tests mocked an `ApiError.details` shape the backend never emitted — mock-vs-live drift caught only because validation checked the real Nest envelope. The fix aligned production, lambda, and e2e bootstraps on one shared pipe factory.
