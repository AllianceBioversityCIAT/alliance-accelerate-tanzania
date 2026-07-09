# Proposal — Fix Dead e2e Suites (Jest testRegex naming)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `bugfix/dead-e2e-tests` |
| Proposal date | 2026-07-08 |
| Author | SDD (Leader) on behalf of JuanCode |
| Status | **Approved** (JuanCode, 2026-07-09 — Option B) |
| Suggested depth | Lite (single-cause bugfix, but touches RBAC test evidence) |

## 2. Intent

Make the backend's RBAC end-to-end suite actually run, and prevent a misnamed test file from ever again silently not-running. Discovered during the `admin/bulk-actor-operations` validation: the `admin/user-management` RBAC e2e never executes.

## 3. Problem / Current Behavior

The backend Jest config uses `testRegex: ".*\\.spec\\.ts$"` (`backend/package.json`). File-name reality:

| File | Ends with | Matches `.spec.ts$` | Runs? |
|---|---|---|---|
| `src/test/admin-actors.e2e.spec.ts` | `.e2e.spec.ts` | ✅ | **RUNS** (21 tests) |
| `src/users/users.e2e-spec.ts` | `.e2e-spec.ts` | ❌ (`-spec.ts`, not `.spec.ts`) | **DEAD — never runs** |

So the **`admin/user-management` RBAC e2e matrix (401/403/200 over the real `JwtAuthGuard`+`RolesGuard`) has never actually executed** — it was written (T-5 of that spec) and reviewed by reading the file, but the runner silently skips it. Its sibling `users.service.spec.ts` still runs and covers the service logic, so the gap is specifically the over-the-wire guard assertions. The user-management spec was validated/archived believing this e2e ran (its unit coverage did). The bulk-actor implementer avoided the trap by naming its file `admin-actors.e2e.spec.ts` (dot), which is why that spec's e2e is genuinely green.

Nothing warns when zero test files match a pattern or when an expected suite isn't collected — so the miss was invisible.

## 4. Proposed Outcome

- `users.e2e-spec.ts` is renamed so the runner picks it up, and its RBAC e2e actually runs (either passing, or surfacing a real gap to fix).
- A misnamed or uncollected e2e file can no longer silently pass — the config recognizes both naming conventions and/or CI fails on a suspicious zero/low collection.
- One documented e2e naming convention going forward.

## 5. Scope

- **Rename** `backend/src/users/users.e2e-spec.ts` → `users.e2e.spec.ts` (matches `testRegex`).
- **Run it** and address the outcome: if it passes, done; if it now FAILS (it has never executed against the guards), fix the test or the code it exposes — that discovery is the point.
- **Harden recurrence** (pick in design): broaden/standardize `testRegex` to also match `*.e2e-spec.ts`, and/or add a guard (e.g. `--passWithNoTests=false` is default; add a CI assertion on expected suite/count, or a lint rule / naming check) so a skipped e2e is caught.
- **Sweep** the tree for any other `*.e2e-spec.ts` (currently only this one) and align them.

## 6. Non-Goals

- Rewriting the substance of the user-management e2e (only make it run + fix any real failures it reveals).
- Frontend tests (they run fine — 784 green).
- The local iCloud `node_modules`/`.git` corruption (separate environment issue).
- Re-validating or un-archiving `admin/user-management` beyond noting the corrected evidence.

## 7. Affected Users, Systems, And Specs

- **Developers / CI:** gain a genuinely-running RBAC e2e + a guard against silent skips.
- **Files:** `backend/src/users/users.e2e-spec.ts` (rename), possibly `backend/package.json` (jest config).
- **Specs:** follow-up flagged in archived `admin/bulk-actor-operations` `validation-report.md` §7 + `archive-summary.md` §9; corrects test-evidence for archived `admin/user-management`.

## 8. Requirement Delta Preview

### ADDED
- The backend RBAC e2e suite for user-management MUST be collected and executed by `npm test`.
- The test runner MUST recognize the `*.e2e.spec.ts` convention (and/or `*.e2e-spec.ts`), and CI SHOULD fail if an expected e2e suite is not collected.

### MODIFIED
- `users.e2e-spec.ts` becomes a running suite (was silently skipped).

### REMOVED
- None.

## 9. Approach Options

**Option A — Rename only.** Rename `users.e2e-spec.ts` → `users.e2e.spec.ts`. Minimal; makes it run. Doesn't prevent a future misnamed file from being skipped.

**Option B — Rename + broaden the regex + document convention (recommended).** Rename the file AND change `testRegex` to also match the hyphenated form (e.g. `.*\.(spec|e2e-spec)\.ts$` or `.*\.spec\.ts$|.*\.e2e-spec\.ts$`), so both conventions run; add a one-line note on the standard name. Small, defensive, prevents recurrence with near-zero risk.

**Option C — Rename + CI guard on suite collection.** Rename + add a check that asserts a minimum/expected set of e2e suites is collected (fails CI otherwise). Strongest guarantee, but more moving parts than warranted for a Lite bugfix.

## 10. Recommended Approach

**Option B.** Renaming fixes the immediate dead suite; broadening the regex ensures any file using either the `.e2e.spec.ts` or `.e2e-spec.ts` convention is actually run, closing the silent-skip class of bug with a one-line config change. If renaming reveals real failures in the long-dormant e2e, fix them as part of this bugfix.

## 11. Risks, Dependencies, And Open Questions

- **Risk (the important one):** the user-management e2e has **never run**, so enabling it may surface **real failures** (drift since it was written, or assertions that were always wrong). This is a feature of the fix — it converts dead code into real signal — but it may expand the change. Flag any failures for a decision.
- **Risk:** broadening `testRegex` could pick up a stray file; low, since only the two e2e files exist and both are intended suites.
- **Dependency (stale, resolved 2026-07-09):** ~~a clean clone — the local repo was corrupted by iCloud sync~~ — the local `.git` object store was repaired on 2026-07-09 (refs cleaned, missing objects restored from origin, fsck clean, full suites + push working); no fresh clone needed.
- **OQ-1:** standardize on `.e2e.spec.ts` (matches current regex, rename the one offender) vs keep `.e2e-spec.ts` and broaden the regex — decide the canonical convention in `/sdd-specify`.

## 12. Success Criteria

- `cd backend && npm test` collects and runs the user-management RBAC e2e (suite count increases by one; its 401/403/200 assertions execute).
- Any failures the newly-running suite reveals are resolved (or explicitly triaged).
- A misnamed/uncollected e2e file is caught (regex covers both conventions and/or a CI guard).
- No other suite regresses; full backend suite green.

## 13. Next Step

```text
/sdd-specify bugfix/dead-e2e-tests
```
