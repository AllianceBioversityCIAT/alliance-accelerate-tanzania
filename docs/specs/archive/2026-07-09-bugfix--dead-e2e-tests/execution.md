# Execution Log — Fix Dead e2e Suites (Jest testRegex naming)

- Spec path: docs/specs/bugfix/dead-e2e-tests/
- Status: Done
- Executor: Claude (user authorized: "aprobado, ejecuta la T-1 tú mismo")
- Date: 2026-07-09

---

## T-1 — Rename, broaden regex, align pipe, and revive the suite

- **Status:** PASS
- **Attempts:** 1

### Changes

- `git mv backend/src/users/users.e2e-spec.ts backend/src/users/users.e2e.spec.ts` (FR-2).
- `backend/package.json` — jest `testRegex`: `".*\\.spec\\.ts$"` → `".*\\.(spec|e2e-spec)\\.ts$"` (FR-2).
- `backend/src/users/users.e2e.spec.ts` — bootstrap switched from inline `new ValidationPipe({ transform: true, whitelist: true })` to the shared `createValidationPipe()` (W-1 alignment, FR-3); unused `ValidationPipe` import dropped; header documents the canonical `*.e2e.spec.ts` convention and the defensive hyphen collection.

### First-run outcome (FR-1 / OQ-2)

**The never-executed RBAC suite passed on its first run in history — no stale-test failures, no product bugs revealed.** The 401/403/2xx matrix over the real `JwtAuthGuard`+`RolesGuard` is genuinely green.

### Verification evidence

- `npx jest --listTests` → **27 files** (was 26; differs by exactly the revived suite — NFR-2) and includes `src/users/users.e2e.spec.ts`.
- `npm test` → **27 suites, 287 tests, all passed** (was 26/274 — the +13 are the revived RBAC tests) (FR-1, NFR-1).
- Negative probe (design §10): a scratch `probe.e2e-spec.ts` (hyphen) IS collected under the new regex (then removed, not committed) (FR-2).
- `find src -name "*-spec.ts"` → 0 files remain.

---
