# Execution Log — Consent request by email for team-managed actors

## Document Control

| Field | Value |
|---|---|
| Spec | `actors/consent-intake/consent-request-email` (chunk 2 of `actors/consent-intake`) |
| Branch | `feature/atp-84-consent-request-flow` |
| Started | 2026-10-05 |
| Approval Mode | gated: the continue gate stops after every task |
| Leader | Claude Code session, `opus` (T1) |
| Implementer / Reviewer | `.claude/agents/akili-implementer` (T2) / `.claude/agents/akili-reviewer` (T3) — author ≠ auditor enforced by the wrappers |
| Budget (design §10) | 14 tasks · ~11,300 LOC · ~20 review rounds. Escalate above +25 %. |
| Local environment | Native route. MySQL 8 is the `accelerate-mysql` container on `localhost:3306` (the pre-check passed 2026-10-05: Node v26.10.0, port open), so it is the migration rehearsal target. |

## Task Execution History

### T-1 — Schema, enums and the admin-assertable method rules — **PASS** (attempt 1/3), 2026-10-05

- **Requirements covered:** FR-10 (BUT on the admin gate; AND IT MUST NOT write or move into `EMAIL_LINK`; scenario *link evidence is frozen*), FR-13 (record shape), NFR-9 (no FK).
- **Leader choices:**
  - Skills: `nestjs-expert` and `tdd` (consent-gate business rules, so `tdd` earns its cost).
  - Effort: `max` (Prisma migration plus consent gate).
  - Review mode: two parallel lens Reviewers (effort `max`, migration surface).
- **First step (owned by T-1):** the Implementer re-read `frontend/components/admin/ActorForm.tsx` `buildDto`. It unconditionally includes `consentMethod: values.consentMethod` on every save, create and edit, so P-16's refutation holds. That is why the update DTO keeps the full set and the gate lives in `ActorsAdminService.update`.

#### Attempt 1

**Files changed**
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261005203611_add_consent_requests/migration.sql` (new)
- `backend/src/common/consent-methods.ts` (new)
- `backend/src/common/template-columns.ts` and its spec
- `backend/src/common/consent-provenance.policy.ts` (exports `isSameProvenanceValue`)
- `backend/src/actors/actors-admin.service.ts` (`enforceConsentMethodRules`, rules 1–3; the bulk partition) and its spec
- `backend/src/actors/dto/{actor-create,admin-actor-update,bulk-consent}.dto.ts`
- `backend/src/actors/dto/{actor-dto,admin-actor-dto}.spec.ts`
- `backend/src/actors/dto/bulk-consent.dto.spec.ts` (new)
- `backend/src/actors/actor-import.service.spec.ts`

`actor-import.service.ts` is unchanged. It inherits the assertable set through `template-columns.ts`'s `CONSENT_METHOD_VALUES`, confirmed by both Reviewers.

**Migration SQL:** two enum `MODIFY` statements that only append values, plus two `CREATE TABLE`. No `DROP` and no `FOREIGN KEY`. Applied to the local `accelerate-mysql` container with no reset or drift prompt.

**Implementer verification:**
- Full backend suite: 87 suites / 1431 tests green.
- `eslint --quiet`: clean. `npm run build`: clean.
- `git diff --exit-code` on the template `.xlsx`: exit 0 (byte-identical).

**Falsifiers** (executed on the real file with a backup and restore, verified by grep/diff, then reverted):

| # | Mutation | Red assertion |
|---|---|---|
| 1 | `Object.values(ConsentMethod)` in `actor-create.dto.ts` | The "rejects EMAIL_LINK" tests: `Received array: []` |
| 2 | Rule 2 deleted | The re-grant test: `Expected constructor: BadRequestException / Received value: undefined` |
| 3 | Rule 3 deleted | All three `it.each` fixtures |
| 4 | Bulk `GRANTED + EMAIL_LINK` skip removed | `preserved: 1` expected, `0` received |

**Evidence re-run (Leader, inline, non-author): VERIFIED.**
- `npm test -- --silent` → 87 suites / 1431 tests passed.
- `eslint --quiet` OK. `npm run build` OK.
- The template is unchanged.
- `grep FOREIGN|DROP` on the migration → none.
- The tree was quiet: no Jest or build process from other sessions.

**Reviewers**

| Lens | Verdict | Summary |
|---|---|---|
| A — consent gate / risk-security | **PASS** | No admin path (create, update, bulk, import, registration approve) can write `EMAIL_LINK`, move into `GRANTED` with it, or alter `GRANTED + EMAIL_LINK` evidence. `before` is read inside the transaction. The acknowledgement gate is byte-unchanged. Every refusal fixture reaches its rule. |
| B — data / migration / reliability | **PASS** | The schema matches §4.1/§4.2 column by column. The migration is additive and metadata-only on MySQL 8. The assertable-set and full-set sites match the §5.7 table. The `template-columns.spec` edit is a legitimate update. Nothing is out of scope. |

**Runtime events:** none.

#### ADVISORY (4R — recorded, not gating)

1. **(A1, B2) Mixed provenance on a re-grant.** Both Reviewers raised this. A bulk fill of a `DENIED + EMAIL_LINK` row, or a single re-grant with an admin method, keeps the link-era `consentObtainedAt` (`respondedAt`) and `consentReference` (a request id) under an admin-asserted method. This matches §5.7 as written. **Routed to the product owner at the T-1 continue gate:** it is spec-caused, so the routing test puts it inside the spec, not in the advisory queue.
2. **(A2, B1)** Rule 3 compares dates as ISO strings. An identical instant sent in another format gets a 400. This fails safe, and today's form is unaffected. Consider a `getTime()` comparison.
3. **(A3)** Rule 3 has no tests with `null`, and no test that a status change away from `GRANTED` releases the freeze.
4. **(B3)** Forward pointer to T-5. `update` reads `before` with no row lock, so a `respond()` committing between the read and the write could be overwritten by the admin's re-sent `consentMethod`. **Carried into the T-5 brief.**
5. **(A4, B4)** `prisma format` whitespace churn in `ActorAuditLog`. Harmless.

- **Final verification:** VERIFIED as above.
- **Issues encountered:** one Implementer test run stalled while piped through `tail`. The direct re-run was green. Other idle `claude` sessions share this checkout; none ran Jest during measurement.

#### T-1 continue gate — decision recorded (2026-10-05)

- **D-24 (product owner):** an admin re-grant of a link-accepted actor does not inherit the link's `consentObtainedAt` or `consentReference`.
- **Execute-time spec edits** (they carry D-24 and do not change any approved requirement's meaning; this is a new decision):
  - `requirements.md`: the decisions table gains D-24, and FR-10 gains a scenario.
  - `design.md` §5.7: the Update rule gains rule 4.
  - `tasks.md` T-3: scope, traces, tests and falsifier gain D-24.
- **Carry:** T-3's Reviewer brief lists "conformance to `design.md` §5.7 rule 4 as amended 2026-10-05".

### T-2 — Admin-managed consent edition registry — **PASS** (attempt 1/3), 2026-10-05

- **Requirements covered:** FR-1 (verbatim; AND MUST NOT "signing"/"signature"; append-only; an old request keeps its text, registry side; BUT the self-registration policy is unchanged).
- **Leader choices:**
  - Skills: `tdd`.
  - Effort: `medium`.
  - Review: the `Review: checklist` predicate was met, but I invoked **override (a)/(g)**: this Legal text is what every actor accepts. A single checklist Reviewer was spawned.
- **First step:** `shasum -a 256` on the `.docx` returned `80fe083f90b01427e369f8a0e23f00841ff450f732e99bdb22cbf8ec5a9ba1c7`, which matches P-18. The fixture was regenerated from the `.docx` with `textutil`.

#### Attempt 1

**Files changed (all new):**
- `backend/src/consent-requests/admin-consent-editions.json`
- `backend/src/consent-requests/admin-consent-policy.ts`
- `backend/src/consent-requests/admin-consent-policy.spec.ts` (14 tests)
- `backend/src/consent-requests/__fixtures__/legal-admin-consent-v1.0.txt`

**JSON shape:** `sections[{ heading, body }]`. Bullets are inline `- ` lines. The closing "I confirm…" paragraph is the top-level `acceptanceStatement`, as in the exemplar. The bold "I accept" is stored as markdown `**I accept**`. `issuedAt` is `2026-10-05`.

**Implementer verification:**
- 14 targeted tests green.
- `npm test -- --silent consent` → 5 suites / 63 tests.
- Full suite → 88 suites / 1445 tests.
- Lint and build OK; `dist/consent-requests/admin-consent-editions.json` is emitted.
- The self-registration editions file is byte-unchanged.

**Falsifiers (executed red, then reverted):**

| Mutation | What went red |
|---|---|
| One word changed | The verbatim test and the digest |
| "By accepting" → "By signing" | The negative-word test and the digest. The verbatim test stays green by construction, because the reversal becomes a no-op. |
| An extra section added | The heading pin and the verbatim test |

**Deviation (recorded):** the "verbatim test red before the JSON exists" order was not followed literally. The JSON was generated by a script with anchor asserts. The three falsifier runs discharge the same risk; the Reviewer accepted this.

**Evidence re-run (Leader, inline): VERIFIED.**
- 88 suites / 1445 tests.
- Lint and build OK.
- Self-registration editions unchanged.
- `grep sign*` on the JSON → 0.
- The data-protection contact is present.

**Reviewer (checklist): PASS.** It compared the JSON with the fixture line by line and found it verbatim except the two rewordings and the excluded signature block. The normalizer cannot mask a word change. The hash matches §7.2. Freezing is applied at four levels, and nothing is out of scope.

**Runtime events:** none.

#### ADVISORY (4R — recorded, not gating)

1. **A spec-caused gap, routed to the product owner at the T-2 continue gate.** `acceptanceStatement` is shared by every edition (the §7.2 shape). Editing it would change v1.0's text and hash, breaking FR-1's "an old request keeps its text". The code comment claiming otherwise is false. The proposal: make it per edition and pin the literal v1.0 hash before T-3 stores any hash.
2. No literal pin of the v1.0 hash exists, so a change to the serialization would silently invalidate stored hashes. This is folded into item 1's proposal.
3. `allEditionsDigest` excludes `acceptanceStatement` and `issuedAt`.
4. The red-run order deviation (above).
5. A duplicate glyph in the normalizer regex `[••]`.
6. The "three occurrences" wording is consistent: the third is the excluded `Signature:`.

- **Final verification:** VERIFIED.
