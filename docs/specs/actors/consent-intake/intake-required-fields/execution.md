# Execution — One intake contract: required fields, generated Trader ID, duplicate detection, template v4

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/actors/consent-intake/intake-required-fields` |
| Branch | `feature/atp-84-consent-request-email` |
| Started | 2026-10-02 |
| Leader | Claude Code session (`opus`) |
| Implementer | `.claude/agents/akili-implementer.md` (`sonnet`) |
| Reviewer | `.claude/agents/akili-reviewer.md` (`opus`, read-only), so author ≠ auditor |
| Approval Mode | gated |
| Budget (tripwire) | 8 tasks · ~1,800 LOC · ~13 review rounds (`tasks.md` Document Control) |

## 2. Task Execution History

### T-1 — The intake contract, and the required set on admin create and edit

**Attempt 1 — FAIL** (2026-10-02)
- **Implementer:** `akili-implementer` (sonnet), effort high, skills `nestjs-expert` + `tdd`. Exemplars: `consent-provenance.policy.ts`, `admin-actor-dto.spec.ts`.
- **Files changed:**
  - new: `backend/src/common/intake-contract.ts`, `backend/src/common/intake-contract.spec.ts`
  - modified: `backend/src/actors/dto/actor-create.dto.ts`, `dto/admin-actor-create.dto.ts`, `actors-admin.service.ts`, `actors-admin.service.spec.ts`, `dto/actor-dto.spec.ts`, `dto/admin-actor-dto.spec.ts`, `backend/src/test/admin-actors-crud.e2e.spec.ts`
- **Implementer verification:** 84 suites / 1290 tests passed; build clean; eslint 0.
  - All 5 falsifiers were reported red on the validation assertion, then restored.
  - The Implementer self-caught an inert email-bound fixture (`isEmail` rejects a local part over 64 characters on format, so the bound test could not discriminate) and replaced it with `validEmailOfLength`.
- **Evidence re-run (Leader, inline):** **VERIFIED**. Same 84 / 1290, build clean, eslint 0.
- **Reviewer:** `akili-reviewer` (opus), **FAIL**:
  1. **The NFR-1 test is one-directional.**
     - The reference side loops over a hardcoded `PAYLOAD_FIELDS`, not over `INTAKE_REQUIRED_FIELDS`.
     - It misses two drifts: removing `phone` from the declaration together with the admin DTO, and self-registration gaining a new required field.
     - `isRequired()` is vacuous when a property has no metadata at all.
     - Violates design §4.1 ("asserts all three **equal** the declaration") and NFR-1.
  2. **A weakened assertion.** The e2e `expect(res.body.contactPerson).toBeNull()` was deleted with a false "covered below" comment; `actor-incomplete-1` keeps a non-null contactPerson. Violates tasks.md §2 (*Consumers are part of Verify*).
- **Advisory (4R):**
  - PATCH `{crops: null}` produces a TypeError and a 500 in `missingIntakeFields`, where it should be a 400. This is pre-existing in kind.
  - FR-1's "same field-level messages" clause has no owner in the §5 closure table.
  - The merged check rejects whitespace-only `contactPerson`/`phone`, which create and self-registration accept. That makes the rules asymmetric.
  - The create test passes `crops: []`.
  - `validEmailOfLength` is copy-pasted three times.
- **runtime events:** none.

**Leader decisions after attempt 1:**
- **The closure gap is the Leader's own** (KZ-001), not the Implementer's.
- **Execute-time spec edit:** in `tasks.md` §5, I added a row for FR-1 "MUST use the same field-level messages the self-registration path uses".
  - Owners: T-1 for create; T-4 for import.
  - Interpretation, recorded here: the clause binds where a self-registration counterpart exists for the same omission, which means create and import. A PATCH merged-state omission has no self-registration counterpart, so it keeps `<field> is required`.
  - This narrows nothing the requirement states about create and import.
- **Attempt 2 brief:**
  - The Reviewer's report is carried verbatim, with effort bumped to xhigh.
  - The `crops: null` → 400 fix and the whitespace symmetry go in tagged `[advisory-grade]`, so they cannot fail the task.

**Attempt 2 — PASS** (2026-10-02)
- **Implementer:** `akili-implementer` (sonnet), effort xhigh. It received the Reviewer's attempt-1 report verbatim.
- **Files changed (cumulative):** the attempt-1 set, plus `intake-contract.ts` (`SCALAR_REQUIRED_FIELDS` is now derived from `INTAKE_REQUIRED_FIELDS`; `crops: null` is treated as `[]`; no trimming), a rewritten `intake-contract.spec.ts`, an `actor-incomplete-2` fixture in `admin-actors-crud.e2e.spec.ts`, and the service-spec create fixture.
- **Implementer verification:** 84 suites / 1301 tests; build clean; eslint 0. Every falsifier was shown red and then restored:
  - the five from tasks.md;
  - drift (a): phone removed from the declaration and the admin DTO, red on set-equality;
  - drift (b): `district` made required on self-registration, red on set-equality;
  - the message mutation, red on the FR-1 message test;
  - the `crops: null` guard removed, where the e2e reported "expected 400, got 500".
- **Evidence re-run (Leader, inline):** **VERIFIED**. 84 / 1301, build clean, eslint 0.
- **Reviewer:** `akili-reviewer` (opus), **PASS**. Both attempt-1 issues are resolved, and the named conformance check passes: FR-1's same field-level messages hold on create. `registration-create.dto.ts` is unchanged.
  - The Reviewer's boundary: every red/green above is the Implementer's account, corroborated only by the Leader's re-run.
- **Advisory (4R):**
  - `crops: null` and the whitespace symmetry are handled.
  - **An open product ruling.** The merged-state check runs before the consent logic. So a consent-*withdrawal*-only edit on an incomplete legacy actor returns 400 until the actor is completed, and design §4.4 does not exempt it. **Escalated to the product owner at the T-1 continue gate.**
  - `validEmailOfLength` is still duplicated three times. Deferred.
  - The interface keys of `IntakeRequiredStoredState` / `IntakeRequiredPatch` are hand-named, but are compile-checked through indexing.
- **runtime events:** none.
- **Requirements covered:** FR-1 (API side: create and edit, bounds, crops, the legacy-actor read and write), NFR-1 (DTO half), and the FR-1 messages clause (create).
- **Final status:** **PASS**. 2 attempts, 2 review rounds.
