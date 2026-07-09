# Requirements — Fix Dead e2e Suites (Jest testRegex naming)

- Spec path: docs/specs/bugfix/dead-e2e-tests/
- Status: Approved (JuanCode, 2026-07-09)
- Author / Date: SDD (Leader) — 2026-07-09
- Related: proposal.md (Approved 2026-07-09, Option B); archived `2026-07-01-admin--user-management` (the suite that never ran, its T-5); archived `2026-07-08-admin--bulk-actor-operations` validation-report §7 (where the bug was discovered); archived `2026-07-09-admin--actor-crud-audit` W-1 (shared `createValidationPipe()` the revived suite must adopt)
- Depth: **Lite**

## 1. Summary

The backend Jest config (`testRegex: ".*\.spec\.ts$"`) silently skips `backend/src/users/users.e2e-spec.ts` (hyphen, not dot) — so the user-management RBAC e2e matrix (14 tests: 401/403/2xx over the real guards) **has never executed**. This bugfix makes that suite run, standardizes the e2e naming convention, and makes the runner tolerant of both spellings so a misnamed suite can never silently not-run again.

## 2. Requirement Numbering & Writing Standards

Per `general-setup/requirements.md`: FR-n / NFR-n, RFC 2119, atomic and testable. No PII or RBAC *behavior* changes — this spec only makes existing RBAC *evidence* real.

## 3. Glossary

- **Dead suite** — a test file present in the tree that the runner's `testRegex` never collects, so it always "passes" by absence.
- **Dot convention** — `*.e2e.spec.ts` (the 3 running e2e suites); **hyphen convention** — `*.e2e-spec.ts` (the 1 dead file; also NestJS scaffolding default).

## 4. System Context & Scope

**In scope:** the backend Jest collection config; the rename of the single offending file; whatever real failures the never-run suite reveals when first executed; alignment of its bootstrap with the current shared pipe. **Out of scope:** rewriting the suite's substance, frontend tests, re-archiving `admin/user-management`.

## 5. Stakeholders / Personas

- **Developers / reviewers** — regain trust that a green `npm test` means every authored suite actually ran.
- **Compliance reviewer** — the user-management RBAC evidence becomes real instead of assumed.

## 6. Functional Requirements

### FR-1: The user-management RBAC e2e suite runs
- **Description:** `cd backend && npm test` MUST collect and execute the users RBAC e2e suite (today `users.e2e-spec.ts`, 14 tests). The suite count reported by Jest MUST increase from 26 to 27, and any failures it reveals MUST be fixed (or explicitly triaged with the user) within this bugfix.
- **Rationale:** proposal §3 — the 401/403/2xx guard matrix was validated by reading, never by running.
- **Acceptance (Given/When/Then):**
  - GIVEN the fixed configuration/naming, WHEN `npm test` runs, THEN the users e2e suite appears in the run (27 suites) and all its tests execute.
  - GIVEN `npx jest --listTests`, WHEN inspected, THEN the users e2e file is listed.
- **PII/RBAC impact:** none to behavior; strengthens RBAC test evidence.

### FR-2: One canonical e2e naming convention, both spellings collected
- **Description:** The canonical e2e file name SHALL be `*.e2e.spec.ts` (matching the 3 existing running suites); the offender SHALL be renamed to it. Additionally, the Jest `testRegex` MUST also match the hyphen form (`*.e2e-spec.ts`) so a future file using NestJS's default scaffolding convention still runs instead of dying silently. The convention SHALL be documented where the config lives.
- **Acceptance:**
  - GIVEN a file named `x.e2e-spec.ts` (hyphen), WHEN tests are collected, THEN it is included.
  - GIVEN the tree after this fix, WHEN searched, THEN no `*-spec.ts` files remain (all renamed to the dot convention).
- **PII/RBAC impact:** none.

### FR-3: Revived suite matches the production bootstrap
- **Description:** The revived suite MUST build its test app with the shared `createValidationPipe()` (W-1, `common/validation-pipe.ts`) instead of its current inline `new ValidationPipe(...)`, keeping all e2e suites on the exact production envelope.
- **Acceptance:**
  - GIVEN the revived suite, WHEN read, THEN its bootstrap uses the shared factory (same as the two admin e2e suites).
- **PII/RBAC impact:** none.

## 7. Non-Functional Requirements

- **NFR-1 (No regression):** the full backend suite stays green (`npm test`, 274 existing tests + the revived 14 or their fixed equivalents); frontend untouched.
- **NFR-2 (No collateral collection):** broadening `testRegex` MUST NOT pick up unintended files (verify collected-file list before/after differs only by the revived suite).

## 8. Data & Schema Impact

None. Config + test files only.

## 9. Out of Scope

Rewriting the RBAC suite's substance; CI pipeline additions (Option C); frontend; un-archiving `admin/user-management` (its archive gets no edit — this spec is the corrective record).

## 10. Dependencies & Assumptions

- Local repo healthy (the proposal's iCloud/clean-clone dependency was resolved 2026-07-09 — see proposal §11).
- The suite mocks the JWT verifier — no AWS/Cognito access needed to run it.

## 11. Open Questions

- **OQ-1 (resolved at approval):** canonical = `.e2e.spec.ts` + regex tolerant of `.e2e-spec.ts` (Option B).
- **OQ-2 (execution-time):** if the revived suite reveals failures that indicate a *real product bug* (not a stale test), pause and surface it to the user before fixing product code.

## 12. Requirement ID Index

| ID | Title | Type |
|---|---|---|
| FR-1 | The user-management RBAC e2e suite runs | Functional |
| FR-2 | Canonical convention + both spellings collected | Functional |
| FR-3 | Revived suite matches production bootstrap | Functional |
| NFR-1 | No regression | Non-functional |
| NFR-2 | No collateral collection | Non-functional |
