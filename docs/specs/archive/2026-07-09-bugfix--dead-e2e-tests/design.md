# Design — Fix Dead e2e Suites (Jest testRegex naming)

- Spec path: docs/specs/bugfix/dead-e2e-tests/
- Status: Approved (JuanCode, 2026-07-09)
- Author / Date: SDD (Leader) — 2026-07-09
- Traces requirements: FR-1..FR-3, NFR-1..NFR-2
- Depth: **Lite**

## 1. Approach Overview

Three surgical changes, no architecture impact: (1) rename the one dead file to the dot convention, (2) broaden the Jest `testRegex` in `backend/package.json` to also collect the hyphen convention, (3) align the revived suite's bootstrap with the shared `createValidationPipe()`. Then run the suite for the first time and fix what it reveals.

## 2. Data Model Changes

None.

## 3. API Surface & Contracts

None.

## 4. Backend Design

**Changes:**

```
backend/src/users/users.e2e-spec.ts  →  backend/src/users/users.e2e.spec.ts   (git mv, FR-2)
backend/package.json                     jest.testRegex change (FR-2)
```

- **`testRegex`:** `".*\\.spec\\.ts$"` → `".*\\.(spec|e2e-spec)\\.ts$"`.
  - Matches everything it matched before (`.spec.ts` suffix, incl. `.e2e.spec.ts`) **plus** `*.e2e-spec.ts`.
  - A one-line comment is impossible in JSON — document the convention in the suite header instead: the revived file's doc block states "canonical: `*.e2e.spec.ts`; the runner also collects `*.e2e-spec.ts` defensively".
- **Bootstrap alignment (FR-3):** in the renamed file, replace the inline `app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))` with `app.useGlobalPipes(createValidationPipe())` (import from `../common/validation-pipe`), and drop the now-unused `ValidationPipe` import — identical to how the two admin e2e suites were aligned in W-1.
- **First-run triage (FR-1):** the suite has never executed; expected risk points are drift in mocked service shapes or envelope-dependent assertions. Stale-test failures are fixed in place; anything indicating a real product bug pauses for user decision (requirements OQ-2).

## 5. Frontend Design

None.

## 6. Security & RBAC

No behavior change. Outcome is stronger evidence: the 401/403/2xx matrix over the real `JwtAuthGuard`+`RolesGuard` finally executes on every `npm test`.

## 7. Infrastructure / Deployment

None. No deploy — test-only change (the backend artifact is unaffected; no redeploy needed).

## 8. Decision Records (ADR-style)

### Decision: canonical `.e2e.spec.ts`, regex tolerant of both (Option B)
- **Context:** one dead file; two conventions in the wild (dot = 3 running suites; hyphen = NestJS scaffold default). **Options:** rename only (A); rename + tolerant regex (B); CI collection guard (C). **Decision:** B — the rename fixes today, the regex closes the silent-skip class forever at one line of config; C's moving parts aren't warranted for Lite. **Consequences:** either spelling runs; naming stays visually consistent in-tree.

### Decision: fold the W-1 pipe alignment into the revive
- **Context:** the dead suite predates W-1's shared pipe factory; reviving it verbatim would reintroduce the drift W-1 eliminated. **Decision:** switch it to `createValidationPipe()` in the same task. **Consequences:** all four e2e suites bootstrap identically to production.

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Never-run suite fails on first execution | expected; fix stale tests in place; real product bugs pause for user decision (OQ-2) |
| Broadened regex collects a stray file | verify `npx jest --listTests` before/after differs by exactly one file (NFR-2) |
| Envelope-dependent assertions vs the W-1 pipe | suite now uses the same factory as production, so assertions verify the real contract |

## 10. Test Plan Outline

- `npx jest --listTests` includes the renamed file; diff vs before = exactly +1 (NFR-2).
- `npm test` → 27 suites, all green (FR-1, NFR-1); revived suite's 14 tests (or their fixed forms) execute.
- Negative probe (manual, not committed): a scratch `x.e2e-spec.ts` with one trivial test is collected under the new regex, then removed (FR-2).
