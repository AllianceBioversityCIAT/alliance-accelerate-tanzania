# Archive Summary — Fix Dead e2e Suites (Jest testRegex naming)

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/bugfix/dead-e2e-tests/` |
| Archive path | `docs/specs/archive/2026-07-09-bugfix--dead-e2e-tests/` |
| Archive date | 2026-07-09 |
| Final status | **Done — T-1 PASS on first attempt; revived suite green on its first-ever run** |
| Depth | Lite |

## 2. Original Spec Path

`docs/specs/bugfix/dead-e2e-tests/` — proposed 2026-07-08 (discovered during `admin/bulk-actor-operations` validation), approved and executed 2026-07-09.

## 3. Final Status

Complete. Single task T-1 `[x]`, executed by Claude on user authorization, first attempt.

## 4. Requirements Delivered

- **FR-1** — the user-management RBAC e2e (401/403/2xx over the real `JwtAuthGuard`+`RolesGuard`) is collected and executed by `npm test`: 26→27 suites, 274→287 tests, all green. **The suite passed its first-ever run — no stale tests, no product bugs (OQ-2 not triggered).**
- **FR-2** — canonical convention `*.e2e.spec.ts` (offender renamed via `git mv`); jest `testRegex` broadened to `".*\\.(spec|e2e-spec)\\.ts$"` so the NestJS-scaffold hyphen form can never silently not-run again (verified with a scratch probe file); zero `*-spec.ts` files remain.
- **FR-3** — revived suite bootstraps with the shared `createValidationPipe()` (W-1 alignment from `admin/actor-crud-audit`), so all four e2e suites mirror the production envelope exactly.
- **NFR-1/NFR-2** — full suite green; collection diff was exactly +1 file.

## 5. Files Changed Summary

One commit (`[SPEC:bugfix/dead-e2e-tests] T-1 ...`): `backend/src/users/users.e2e-spec.ts` → `users.e2e.spec.ts` (rename + pipe alignment + convention note in header), `backend/package.json` (testRegex). Evidence in `execution.md`.

## 6. Test / Validation Evidence

No standalone `test-report.md`/`validation-report.md` — accepted for Lite depth: the task's Verify command IS the validation (`jest --listTests` collection proof + full `npm test`), with the outcome recorded in `execution.md`.

## 7. Accepted Warnings / Follow-Ups

None from this spec. (Option C — a CI guard asserting expected suite collection — remains a possible future hardening, explicitly out of scope here.)

## 8. Historical Notes

- This bug meant the `admin/user-management` archive's RBAC e2e evidence (its T-5) was aspirational until today; this spec is the corrective record — the archived spec itself was not edited. The matrix turned out to be correct all along.
- The proposal's "clean clone" dependency (iCloud corruption) was resolved earlier the same day by repairing the local `.git` object store in place.
