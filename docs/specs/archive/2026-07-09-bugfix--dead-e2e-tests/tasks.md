# Tasks — Fix Dead e2e Suites (Jest testRegex naming)

- Spec path: docs/specs/bugfix/dead-e2e-tests/
- Status: Approved (JuanCode, 2026-07-09)
- Author / Date: SDD (Leader) — 2026-07-09
- Traces: requirements.md FR-1..FR-3, NFR-1..NFR-2; design.md §4, §8–§10
- Depth: **Lite**

## Tasks

- [x] T-1 Rename, broaden regex, align pipe, and revive the suite  (deps: none)
      Scope: `git mv backend/src/users/users.e2e-spec.ts backend/src/users/users.e2e.spec.ts`; change jest `testRegex` in `backend/package.json` to `".*\\.(spec|e2e-spec)\\.ts$"`; in the renamed file switch the bootstrap to `createValidationPipe()` (import from `../common/validation-pipe`, drop the inline `ValidationPipe`) and document the canonical naming convention in its header. Run the suite for the first time; fix stale-test failures in place — if a failure exposes a real product bug, STOP and surface it (OQ-2).
      Traces: FR-1, FR-2, FR-3; design.md §4, §8
      Files: backend/src/users/users.e2e.spec.ts (renamed), backend/package.json
      Verify: `cd backend && npx jest --listTests | grep users.e2e && npm test`
      Done when: `--listTests` includes the renamed suite and differs from before by exactly one file (NFR-2); `npm test` reports **27 suites, all green** with the users RBAC matrix executing (FR-1, NFR-1); no `*-spec.ts` files remain in the tree.
      Skills: nestjs-expert

## Dependency Graph

```
T-1 (single task)
```

## Testing & Verification Expectations

- The Verify command is the whole gate: collection proof (`--listTests`) + full backend suite.
- No deploy step — test-only change.

## Execution Conventions

- Commit: `[SPEC:bugfix/dead-e2e-tests] <message>`.
- Execution evidence in `execution.md` (include the first-run outcome of the revived suite — pass or the triaged failures).
