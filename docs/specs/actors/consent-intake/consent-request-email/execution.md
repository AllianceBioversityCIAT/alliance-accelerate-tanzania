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

#### T-2 continue gate — decision recorded (2026-10-05)

- **Product owner:** fix the shared `acceptanceStatement` inside T-3 as its first step. It becomes per edition, and the v1.0 hash is pinned.
- **Execute-time spec edits:**
  - `design.md` §7.2: the file shape and the pinned-hash bullet.
  - `tasks.md` T-3: a first-step scope item.
- **Carry:** T-3's Reviewer brief lists "conformance to `design.md` §7.2 as amended 2026-10-05" and "§5.7 rule 4 as amended 2026-10-05".

### T-3 — Eligibility, preview, enqueue and supersession — in progress

- **Leader choices:**
  - Skills: `nestjs-expert`, `tdd`, `api-design-principles`.
  - Effort: `xhigh`.
  - Review: two lens Reviewers, A on risk / constraint interaction and B on API / wiring.

#### Attempt 1 — **FAIL** (both Reviewers, same issue)

**Files changed**
- **New:**
  - `consent-requests/{consent-eligibility,consent-supersession.service,consent-supersession.module,consent-requests.service,admin-consent-requests.controller,consent-requests.module}.ts`, with specs for the eligibility, supersession and requests services
  - `consent-requests/dto/consent-request-send.dto.ts`
  - `actors/admin-actor-where.util.ts`
  - `test/support/consent-request.mock.ts`
  - `test/admin-consent-requests.e2e.spec.ts`
- **Modified:**
  - `admin-consent-editions.json`, `admin-consent-policy.ts` and its spec: the per-edition `acceptanceStatement`, and the v1.0 hash pinned at `0a2d028028794882ef6cfaf8997c03c0f07d131b304641594f8654696def3fbe`
  - `actors-admin.service.ts` (hooks and D-24) and its spec
  - `actors.module.ts`
  - `app.module.ts`
  - `test/admin-actors-crud.e2e.spec.ts` and `test/admin-actors.e2e.spec.ts` (mock extension)

**Implementer verification:**
- 92 suites / 1496 tests.
- Lint, build and `tsc` clean.
- 6 falsifiers executed red.

**Evidence re-run (Leader):** **VERIFIED**, with one flake recorded.
- Run 1: 1 failure in `registrations-throttle.e2e.spec.ts`. T-3 does not touch that suite.
- That suite alone: 2/2 green with `--forceExit`. The open handle at exit predates this task.
- Run 2, full suite: 92 suites / 1496 tests green.

**Reviewer A (risk), FAIL — verbatim issue:**

> `ConsentRequestSendDto` accepts `scope: 'single'` with any target — up to 1000 ids or a `filter` target that can match every actor. With `single`, `evaluateConsentEligibility` skips neither `declined` nor `pending_request`, and `enqueue` supersedes every eligible actor's pending request. So one direct `POST /admin/consent-requests` with `{target:{kind:'filter',filter:{}},scope:'single'}` re-asks every decliner and supersedes every open link across the registry. The decliner skip (D-21) and the pending block become client-side only.
>
> **Violated Rule:** requirements.md FR-2 scenario "a single send re-asks a decliner": "BUT a bulk send MUST skip it" + "AND IT MUST be enforced by the API". design.md §5.2 step 1: "For `single` it first calls `supersedePendingFor(tx, [actorId])`" (a single actor).
>
> **Remediation:** Server-enforce that `scope: 'single'` requires `kind: 'ids'` with exactly one id (a DTO validator — `@ValidateIf` on scope + `ArrayMaxSize(1)` — or a service-level `BadRequestException`). Add e2e tests showing a 400 for `single` with 2 ids and with a filter target, executed red first.

**Reviewer B (API), FAIL:** the same issue. Its remediation asks for a 400 in the standard `details` envelope unless `target.kind === 'ids' && ids.length === 1`, and for e2e tests on `single` + filter and `single` + 2 ids, where the second case is the falsifier.

**Advisories (A and B):**
1. The pending set is defined twice, in `isPending` and in the supersession `OR`.
2. The "drop FAILED" red came from the FAILED eligibility unit test and the `OR` shape pin, not from the double-enqueue fixture `tasks.md` names, which uses QUEUED.
3. **Concurrent double-enqueue:** `evaluateTarget` runs outside the transaction with no lock, so two concurrent bulk enqueues can create two QUEUED rows for one actor. This is a design gap, to be routed to the product owner.
4. Unknown ids are excluded from `total` without a `notFound` count.
5. `{ kind: 'filter' }` without a `filter` object resolves to all actors, matching `adminList`'s semantics; there is no `@IsDefined`.
6. The withdrawal fixture checks the `updateMany` call rather than the resulting request status, and its fixture differs from `tasks.md`'s wording.
7. The e2e filter test hard-codes `total: 3` and its `matchesActorWhere` ignores `registrationSource` / `consentMethod`.
8. Reviewer A confirmed that `isConsentProvenanceSatisfied(null, …)` guarantees a batch date on bulk unlock, which settles B's unverified question.

#### Attempt 2 — **PASS**

**Rework brief:** delivered by message to the attempt-1 Implementer, whose context survived. Both FAIL reports were copied verbatim. Effort was raised to `max`.

**Files changed (this attempt):**
- `consent-requests.service.ts`: `assertScopeTargetConsistency` is the first statement in both `preview` and `enqueue`, and throws a standard-envelope `400` with `details[field='scope']`.
- `consent-requests.service.spec.ts`: `it.each` covering both routes × (filter target, 2 ids), plus the accepting 1-id case.
- `test/admin-consent-requests.e2e.spec.ts`: 400s on both routes, the enqueue rejection asserts 0 rows created, and 1 id returns 200/201.

**Red run:** with the guard calls removed, the 4 new tests failed on status (`expected 400, got 200/201`).

**Falsifier:** guard calls deleted → the same 4 tests went red. After the revert, the e2e suite was 18/18 green.

**Implementer verification:** 92 suites / 1507 tests. Lint, build and `tsc` clean.

**Evidence re-run (Leader): VERIFIED.** 92 suites / 1507 tests. Lint, build and `tsc` OK.

**Reviewer (rework; override (e)): PASS.**
- The guard runs before any read or write on both routes.
- It covers a filter target, more than one id, missing `ids`, and duplicate ids.
- `bulk` is unaffected.
- No global exception filter exists, so the envelope reaches the client unchanged.
- The tests use eligible seed actors, so they would fail without the guard.
- No regression in the delta.

**Leader-inline after PASS (comment-only, no logic):** three ~20-line "REWORK (attempt 2)" comment blocks were cut to one line each. This applies the user's standing preference that comments match the change size; the history lives in the commit message. Re-run after the edit: 65 targeted tests green; eslint and `tsc` OK.

**Execute-time spec edit:** `design.md` §5.1 (the `single` ⇒ exactly one id rule) and §6 (the 400s on both routes), per Reviewer advisory 1. It records the contract that ships and does not change any requirement's meaning. **Carry:** the next Reviewer brief (T-4).

**Runtime events:** none.

**Requirements covered:**
- FR-2: all scenarios, including the BUT and the API enforcement.
- FR-3: resend supersedes (server side).
- FR-4: *all matching* and *filter changed* (server side).
- FR-5: ids target (server side).
- FR-10: D-24.
- FR-12: all three scenarios. The AND on a later Accept is completed in T-5.

**Open items routed to the product owner at the T-3 continue gate:**
- **Concurrent double-enqueue (attempt-1 advisory 3).** Eligibility is evaluated outside the enqueue transaction with no lock. Two simultaneous bulk sends for the same actor (a double click, two tabs) can create two QUEUED rows, so the actor gets two emails. This is spec-caused: FR-4's "none sent twice" intent.
- **Unknown ids.** They are excluded from `total` with no `notFound` count. This is recorded for T-9's UI.

- **Final verification:** VERIFIED.

#### T-3 continue gate — decisions recorded (2026-10-05)

- **D-25 (product owner):** the server-side lock goes into T-4 (concurrent double enqueue).
- **Budget re-baseline (product owner):** continue with two Reviewers on critical tasks. The accepted ceiling is about 30 verdicts. LOC is at +33 % for T-1…T-3, and the total of ~11,300 still stands.
- **Execute-time spec edits:**
  - `requirements.md`: D-24's row is unchanged; D-25 is added.
  - `design.md`: §5.2 step 1 (the lock) and §10 (the re-baseline note).
  - `tasks.md` T-4: scope and tests.
- **Carry:** T-4's Reviewer brief covers design §5.1/§6 (amended in T-3) and §5.2 step 1 (amended here).

### T-4 — Dispatch, token, email, retry and the queue — in progress

- **Leader choices:**
  - Skills: `nestjs-expert`, `tdd`, `error-handling-patterns`.
  - Effort: `xhigh`.
  - Review: two lens Reviewers, A on concurrency / security and B on mail / API.

#### Attempt 1 — **FAIL** (both Reviewers)

**Files changed**
- **New:**
  - `consent-requests/consent-token.util.ts`
  - `consent-requests/dto/consent-request-batch.dto.ts`
  - `mail/templates/consent-request.template.ts` and its spec
- **Modified:**
  - `consent-requests.service.ts` (`dispatch`, `retry`, `queue`, the D-25 lock) and its spec
  - `admin-consent-requests.controller.ts`
  - `consent-requests.module.ts`
  - `actor-audit.service.ts` (`logConsentRequested`)
  - `mail.service.ts` and its spec
  - `test/support/consent-request.mock.ts`
  - `test/admin-consent-requests.e2e.spec.ts`

**Implementer verification:** 93 suites / 1533 tests. Lint, build and `tsc` clean. Five falsifiers executed red. The budget test observed sent=3, remaining=2 at 8,700 ms of fake time.

**Evidence re-run (Leader): VERIFIED.** 93 suites / 1533 tests. Lint, build and `tsc` OK.

**Reviewer A (concurrency / security): FAIL.** Verbatim issues:
1. "NFR-1's own test clauses are not covered — no test asserts the token is 32 bytes or that the stored column equals `sha256(token)`; the dispatch test only checks `tokenHash` is truthy and `!== token`. Storing sha1, a truncated hash, or 16 random bytes would all stay green." Violated: NFR-1; T-4 traces NFR-1. Remediation: assert `row.tokenHash === createHash('sha256').update(token).digest('hex')` and `Buffer.from(token,'base64url').length === 32`; add a falsifier run (change the hash algorithm → red).
2. "T-4's mandated Red run is absent from the evidence: the concurrency test red on 'sent once' with the claim CAS removed. tasks.md also requires 'the fake transport defers its resolution'; the dispatch concurrency test uses `mockResolvedValue(undefined)` with no guard proving the two calls interleave — if serialized it would still pass (one dispatch sends all 4)." Violated: T-4 Red run, Disqualifier, Done-when. Remediation: make the transport deferred, add a vacuity guard (e.g. `r1.sent ≥ 1 && r2.sent ≥ 1`, or ≥ 1 claim `updateMany` count 0), then execute and record the claim-CAS-removed red run.
3. "D-25's falsifier is nominal. The mock's gates ARE the lock, so 'drop the lock' reddens on `queryRawCalls === 0`, not on 'two rows'. Whether MySQL `FOR UPDATE` actually blocks under Prisma's interactive transaction (with the read-view timing above) is unevaluable here and undeclared." Violated: D-25; KZ-002 / KZ-013 option B. Remediation: record an explicit UNEVALUABLE-in-unit gap with an owner (a local or dev MySQL probe running two concurrent `enqueue`s for one actor), and record that the lock must stay the first statement in the transaction.

**Reviewer B (mail / API): FAIL.** Verbatim issues:
1. "The email never states the site address as wording. The intro reads '…publish information about ${organizationName} on the ACCELERATE Tanzania Registry.' with no address; in the HTML part the URL appears only inside the button's `href`." Violated: FR-7 Content ("on the ACCELERATE Tanzania Registry (site address)"); design §7.1. Remediation: interpolate `getPublicAppBaseUrl()` into the intro (text and HTML), and extend the template spec to assert the paragraph contains the base URL outside the link.
2. "A false coverage claim: `consent-requests.service.spec.ts` says 'its own unit tests cover `logConsentRequested`'s row shape' — `actor-audit.service.spec.ts` has no such test; the e2e checks only `action`, `actorId`, `actingSub`. Nothing pins `traderId`/`traderName` from the snapshot, `actingEmail`, or `changes = { requestId, recipientEmail }` with no token." Violated: T-4 Scope; FR-13; `backend/CLAUDE.md` Audit. Remediation: add a unit test for `logConsentRequested` asserting every field, and remove or correct the false comment.

**Advisories:**
- A `timeout` classification by `err.name` regex is fragile under minification.
- `retry` does not clear `failureReason`.
- `batchId` could use `@IsUUID`.
- `retry` has no 401/403 test and `queue` has no 403 test.
- Long docblocks.
- An explicit ≤ 11.5 s assertion.
- A DB error after a successful send aborts the loop with a 500 (recovered by the stale sweep).
- `failureReason 'timeout'` covers both cases.
- §5.8's owners now live in private helpers.

**Execute-time spec edit:** `design.md` §5.8's write-site table now names `dispatch`'s private helpers. This is a wording fix, not a change in meaning. Carry: T-4 attempt 2's Reviewer and T-6.

#### Attempt 2 — **PASS**

**Rework brief:** delivered by message to the attempt-1 Implementer. All five FAIL items were copied verbatim. Effort was raised to `max`.

**Files changed (this attempt):**
- `mail/templates/consent-request.template.ts`: the intro now names the site address (`getPublicAppBaseUrl()`).
- Its spec: the link extraction targets the "Review and respond" line, and a new test asserts the site address appears before the first `<a href`.
- `actors/actor-audit.service.spec.ts`: 5 `logConsentRequested` tests covering every field (snapshot trader fields, requesting-admin identity, null-email fallback, `changes` exactly `{ requestId, recipientEmail }`).
- `consent-requests.service.spec.ts`:
  - NFR-1 asserts a 32-byte token and `tokenHash === sha256(token)`.
  - A deferred real-timer transport with a vacuity guard (`r1.sent ≥ 1 && r2.sent ≥ 1`) and a wall-clock overlap check.
  - A `findFirst`-barrier single-row race test.
  - The false coverage comment was corrected.

No dispatch or token production logic changed.

**Falsifiers (executed red, then reverted):**

| Mutation | Red assertion |
|---|---|
| sha256 → sha1 | The hash assertion |
| `randomBytes(16)` | The 32-byte assertion |
| Claim compare-and-set without `status` (**the mandated red run**) | The 4-row test got 5 sends; the single-row race got 2 (expected 1) |
| Intro without the address | The site-address test |
| Wrong `actingSub` plus a leaked `token` key | 2 of the 5 audit tests |

**D-25 live corroboration** (a throwaway probe, **not committed**, run by the author and deleted afterwards):
- **Shape:** the real `ConsentRequestsService` and a real `PrismaClient` against the local `accelerate-mysql` (MySQL 8). One eligible actor was seeded, then two concurrent `enqueue({ kind: 'ids', ids: [actor] }, 'bulk')` calls ran.
- **With the lock:** 4/4 runs left exactly 1 QUEUED row; the other call saw `pending_request`.
- **Without the lock** (the call commented out, then restored): 5/5 runs left 2 QUEUED rows.
- **Restored:** 1 row.
- Seeded rows were cleaned up (0 left).
- The unit test remains a simulated-lock regression guard: it checks the call exists and its order, and the lock-first ordering is pinned by the spec's ordering test. **The lock must remain the first statement of the enqueue transaction** (design §5.2 step 1, note added).

**Implementer verification:** 93 suites / 1540 tests. Lint, build and `tsc` clean.

**Evidence re-run (Leader): VERIFIED.** 93 suites / 1540 tests. Lint, build and `tsc` OK. No probe file remains in the tree.

**Reviewer (rework; override (e)): PASS.** All five issues are closed by assertions that would go red. The interleaving is structurally proven: a sequential run would hang on the `findFirst` barrier, so it cannot pass vacuously. The A/B probe discharges A-3. There is no production regression.

**Leader-inline after PASS (comment-only):** three test comments that overclaimed were corrected. The D-25 test is now labelled a simulated lock that points to this probe, and the stale `Buffer.byteLength` wording is fixed. Re-run: 26/26 tests in the spec; lint OK.

**Execute-time spec edit:** design §5.2 step 1 gains the lock-first and deadlock note. Carry: T-5's Reviewer.

**Runtime events:** none.

**Requirements covered:**
- FR-4: retryable; closing the tab (server side).
- FR-6: both scenarios.
- FR-7: all three scenarios.
- FR-8: the 30-day window.
- FR-13: the consent-requested trail.
- NFR-1: the send side.
- NFR-6: unit level. Live throughput remains P-9, owned by T-14.
- NFR-7.
- D-25.

**ADVISORY (recorded):**
- A vacuous test: "writes inside the caller-supplied tx".
- Overlapping bulk locks rely on InnoDB primary-key ordering (now noted in the design).
- `retry` does not clear `failureReason`.
- `@IsUUID` on `batchId`.
- `retry` has no 401/403 test and `queue` has no 403 test.
- The `timeout` classification by `err.name` regex.
- Long docblocks in the controller and the audit service.
- A DB error after a successful send gives a `500`, recovered by the stale sweep.

- **Final verification:** VERIFIED.

## Run continuation — 2026-10-06

**Standing authorization (product owner, 2026-10-06):** "Continúa con el resto de las tareas, sin parar. Ajusta el presupuesto cuando sea necesario, y solo para si necesitas que tome una decisión."

From here on:
- Continue gates auto-pass after a PASS.
- Budget re-baselines are recorded, not asked.
- The run stops only for a product decision, a HALT, or a Pivot.

#### Decision during T-5 (2026-10-06): D-26

- **Product owner:** use optimistic version control for admin edits.
- **Why it came up:** the T-1 advisory B3 race is wider than a race. The admin form always re-sends `consentStatus`, so a form opened before the actor accepted silently reverts the actor when saved.
- **Execute-time spec edits:**
  - `requirements.md`: the D-26 row and a scenario under FR-10.
  - `design.md`: new §5.7a.
  - `tasks.md`: T-6 takes the backend half (it does not conflict with T-5's files); T-11 takes the frontend half.
- **Carry:** the T-6 and T-11 Reviewer briefs.

### T-5 — Public view and respond, throttle, and the PII release gate — in progress

- **Leader choices:**
  - Skills: `nestjs-expert`, `tdd`, `api-design-principles`.
  - Effort: `max`.
  - Review: three lens Reviewers (security, PII, concurrency).

#### Attempt 1 — **FAIL** (PII lens; security **PASS**; concurrency **PASS**)

**Files changed**
- **New:**
  - `consent-requests/consent-public.{controller,service}.ts` and the service spec
  - `consent-requests/consent-throttle.guard.ts`
  - `consent-requests/dto/consent-public.dto.ts`
  - `test/consent-public.e2e.spec.ts`
  - `test/support/consent-public.fixture.ts`
- **Modified:**
  - `consent-requests.module.ts`
  - `actor-audit.service.ts` and its spec (`logConsentResponded`)
  - `test/pii-boundary.spec.ts` (the derived gate over `ConsentRequestsModule`)
  - `test/lambda-handler.e2e.spec.ts`
  - `test/support/consent-request.mock.ts`
  - `common/payload-cap.config.ts` and its spec (`/api/v1/consent` capped at 32 KB, added by the Leader under NFR-4 before review)

**Implementer verification:** 95 suites / 1637 tests. Lint, build and `tsc` clean. 16 falsifiers plus the payload-cap falsifier executed red.

**Evidence re-run (Leader): VERIFIED.** 95 suites / 1637 tests. Lint, build and `tsc` OK.

**PII Reviewer: FAIL.** Verbatim:
1. "The value sweep covers only `traderId`, `technicalSupport` and `gpsAltitude` (`'526'`). The other five never-public fields are never searched for by value: `consentObtainedAt` and `consentReference` are `null` on the fixture; `consentMethod` (`NOT_RECORDED`), `registrationSource` (`TEAM_MANAGED`) and `gpsAccuracy` (`7`) are populated but not in `CONSENT_NEVER_PUBLIC_VALUES`. The non-vacuity test only checks `Object.keys(fixture)).toContain(field)`, so a key holding `null` passes." Violated: T-5 Tests, the Disqualifier (KZ-002), NFR-3, QA-1. Remediation: give those fields distinctive non-null values; add every never-public value to the sweep list, derived from `NEVER_PUBLIC_FIELDS`; assert each value is non-null; re-seed the actor after the gate's Accept, or sweep the post-accept `consentReference`.
2. "The `tokenHash` *value* (`hashConsentToken(token)`) is never swept on the gate's public routes." Violated: NFR-3, NFR-1. Remediation: add both tokens' hashes to `CONSENT_LEAKABLE_VALUES`.

**Security Reviewer: PASS.** Advisories:
- A1: lock-order inversion between respond (request, then actor) and enqueue / D-26 (actor, then request) can deadlock and return a `500`.
- The `@Throttle` override is unproven while the limits are equal (20/60).
- The P-14 pin sits on `respond` rather than `view` (stronger in substance; this is the recorded deviation).
- Prisma validation errors could log arguments.
- A small timing difference on the actor-deleted miss.

**Concurrency Reviewer: PASS.** The race is structurally real: serialized calls would time out. `rollback: false` is sound. The actor is written through Prisma, so `@updatedAt` advances (D-26). Advisories:
- A1: the same lock order.
- A2: the actor read is non-locking, so the audit `from` values could be stale.
- A3: a Decline on an actor already `DENIED` writes an empty-diff row.
- No test enforces "respond is the only writer of `EMAIL_LINK`".

**Leader decisions (standing authorization; technical, no product impact):**
- **Lock order:** respond locks the actor row first (design §5.4 step 0, amended). This fixes A1 and A2.
- **A3:** keep the empty-diff Decline row as an event record (design §5.4 step 4, documented).
- **Wording:** design §5.4 now says `requestId` goes in `changes`, not "the snapshot".
- **The "respond is the only `EMAIL_LINK` writer" gate:** routed to T-6 (`tasks.md` T-6 scope). Nobody owned it.

#### Attempt 2 — **FAIL** (single rework Reviewer)

**Files changed:**
- `consent-public.service.ts`: the lock comes first.
- `consent-public.service.spec.ts`: lock-order tests.
- `test/support/consent-public.fixture.ts`: all 8 never-public values are non-null and the sweep list is derived.
- `test/pii-boundary.spec.ts`: the sweep and the non-vacuity test were rewritten.
- `test/consent-public.e2e.spec.ts`
- `test/lambda-handler.e2e.spec.ts`: a `$queryRaw` stub.

**Implementer verification:** 95 suites / 1640 tests, green. Falsifiers: a null fixture value, three leaked values, a leaked token hash, and the lock moved after the CAS, all executed red. One transient failure of the registrations 429 test occurred during a mutation run; it did not reproduce.

**Evidence re-run (Leader): VERIFIED.** 95 suites / 1640 tests. Lint, build and `tsc` OK.

**Reviewer: FAIL.** Verbatim:
1. "The audit `from` values can be stale after a concurrent admin change. In `consent-public.service.ts:193`, the plain `findUnique({ tokenHash })` is the transaction's first ordinary (non-locking) read. Under InnoDB REPEATABLE READ (MySQL's default, and `$transaction` sets no isolation level), that first read fixes a snapshot; every later ordinary read sees it, including the `before` read at line 241. Only the `FOR UPDATE` itself sees the latest row. If an admin consent update (D-26) commits between line 193 and the lock, `before` still returns the pre-admin values, so the audit row's `from` is wrong, and for a Decline so is the `after` it builds. The comment at line 239 claims the opposite." Violated: design §5.4 step 0/2 (amended 2026-10-06); the `backend/CLAUDE.md` Audit rule. Remediation: read `before` with a locking read (have the lock return the fields), or run the transaction at READ COMMITTED; correct the comment.
2. "The non-vacuity test (`pii-boundary.spec.ts:2838`) is still vacuous for `consentMethod`, `consentObtainedAt` and `consentReference`. Every test in that describe shares one harness from `beforeAll`; the gate test's respond Accept has already set that actor to `EMAIL_LINK`, `respondedAt` and the request id. The test sweeps the original fixture values, which the live actor no longer holds. The gate covers these three only because `view` happens to run before `respond`, an order nothing pins." Violated: tasks.md T-5 / attempt-1 FAIL item 1; KZ-002; NFR-3. Remediation: point `CONSENT_GATE_RESPOND_TOKEN` at a second actor so an Accept can never change the actor `view` previews, or sweep `neverPublicValues(<live actor>)` taken from the harness.

**Advisory:** check whether the enqueue and D-26 paths have a plain read before their lock. Enqueue was corroborated live by the T-4 probe. D-26 is not written yet, so the T-6 brief must carry "the lock is the transaction's first statement".

#### Attempt 3 — code **PASS**; one Leader-owned spec drift fixed and re-checked

**Rework brief:** delivered by message to the same Implementer (the final attempt). The Leader chose the remediation: the routing read moves outside the transaction, the lock is the first statement, and `before` is built from the locked row. The respond token now uses a second actor.

**Files changed (this attempt):**
- `consent-public.service.ts`
- `consent-public.service.spec.ts`: a global call-order test, and a test that `before` comes from the locked row.
- `test/support/consent-public.fixture.ts`
- `test/consent-public.e2e.spec.ts`: deletion between routing and the lock gives the uniform miss; a post-CAS failure rolls everything back.
- `test/lambda-handler.e2e.spec.ts`
- `test/pii-boundary.spec.ts`: the second actor; the non-vacuity test answers its own Accept and sweeps the live viewed actor.

**Falsifiers:**

| Mutation | Red assertion |
|---|---|
| Routing read moved back inside the transaction | Order test: `Expected "consentRequest.findUnique", Received "$transaction"` |
| `before.consentStatus` hardcoded | Locked-row test: `Expected "DENIED", Received "UNKNOWN"` |
| Both tokens on actor 1 | Non-vacuity guard: `Expected "EMAIL_LINK", Received "NOT_RECORDED"` |

**Implementer verification:** 95 suites / 1642 tests. Lint, build and `tsc` clean.

**Evidence re-run (Leader): VERIFIED.** 95 suites / 1642 tests. Lint, build and `tsc` OK.

**Leader probe, real local MySQL 8:** Docker had stopped overnight; I restarted `accelerate-mysql` (the local environment is disposable). A `$queryRaw` row returns enum columns as `string` and `DateTime` columns as `Date`, so building `before` from the raw locked row is type-faithful. The probe was a throwaway file, deleted afterwards.

**Reviewer: code verified correct on all three points.** The verdict was **FAIL** only because `design.md` §5.4 still described the attempt-2 order. The Leader had chosen the attempt-3 remediation without amending the spec, which is a Leader-owned defect, not Implementer work.

**Resolution:**
- The Leader amended §5.4: the routing read is outside the transaction, the lock is the first statement selecting the four consent fields, and `before` comes from the locked row.
- The same Reviewer re-checked the doc diff alone: **PASS**. Every step matches `respond`, and §5.7a does not contradict it.
- The §3 overview diagram was aligned as well (Reviewer advisory).
- This closes the attempt without a 4th Implementer attempt. The 3-attempt ceiling bounds Implementer rework, and none was owed. The run continued without stopping under the standing authorization; the path is recorded here for audit.

**Runtime events:** none.

**Requirements covered:**
- FR-1: an old request renders its own edition.
- FR-3: the AND that R1's link is dead.
- FR-8: day 30 vs 31; used, and its AND.
- FR-9: server parts, including GPS as-if-granted.
- FR-10: accept publishes, decline, race, respondent contact differs, the sentinel trail.
- FR-11.
- FR-12: the AND that a later Accept does not grant.
- NFR-1 (respond side), NFR-2, NFR-3, NFR-4 (throttle plus the 32 KB cap), NFR-5 (the race; real-MySQL contention remains the declared gap).

**ADVISORY (recorded):**
- The order test watches a fixed list of methods; a proxy recording every `tx` call would be stricter.
- A stale comment at `pii-boundary.spec.ts:2666`.
- The `@Throttle` override is unproven while its figures equal the global ones.
- Prisma validation errors could log arguments (NFR-1 residual).
- A timing difference on the actor-deleted miss.
- The registrations 429 test flaked transiently again. It predates T-5 (first seen in T-3).
- **Forward pointer to T-6 (D-26):** the admin update's actor lock must be the transaction's **first** statement (§5.7a), the same InnoDB snapshot rule.

- **Final verification:** VERIFIED.

### T-6 — Evidence read, edition text, audit kinds and the immutability gate — **PASS** (attempt 1/3), 2026-10-06

- **Leader choices:**
  - Skills: `nestjs-expert`, `tdd`.
  - Effort: `xhigh`, raised from `high` because the task now carries D-26.
  - Review: two lens Reviewers.
- **Requirements covered:**
  - FR-13: retention for a deleted actor; no edit path, with its AND test.
  - FR-14: server side.
  - FR-10: the D-26 stale-form scenario.
  - NFR-9.
  - The requirements defect-class row "respond is the only `EMAIL_LINK` writer".
  - QA-3 for the new routes.

**Files changed**
- **New:**
  - `consent-requests/consent-evidence.service.ts` and its spec
  - `actors/audit-entry.serializer.spec.ts`
  - `test/consent-evidence-immutability.spec.ts`
- **Modified:**
  - `admin-consent-requests.controller.ts`: the prefix moved from `admin/consent-requests` to `admin`; every existing path is unchanged; the evidence and editions routes are added.
  - `consent-requests.module.ts`
  - `actors-admin.service.ts` (D-26: lock first, then a 409 on a stale `expectedUpdatedAt`) and its spec
  - `dto/admin-actor-update.dto.ts` and the DTO spec
  - `test/admin-actors-crud.e2e.spec.ts`
  - `test/admin-consent-requests.e2e.spec.ts`
  - `test/pii-boundary.spec.ts`
  - `test/support/{actor-sequence,consent-request}.mock.ts`

**Implementer verification:** 98 suites / 1686 tests. Lint, build and `tsc` clean.

**Falsifiers (executed red):**

| Mutation | Red |
|---|---|
| A scratch `consentRequest.update` | The owners tests |
| `tokenHash` in the evidence select | The key-set tests |
| `ACCEPTED` in the supersede `where` | The terminal tests |
| A scratch `EMAIL_LINK` actor write | The single-writer sweep |
| The D-26 comparison always false | The stale-version and respond-after-load tests |
| A read placed before the lock | The order test |
| A broken `EXPIRED` threshold | Its tests |
| The PII fixtures removed | Totality |

**Evidence re-run (Leader): VERIFIED.** 98 suites / 1686 tests. Lint, build and `tsc` OK.

**Reviewers**

| Lens | Verdict | Summary |
|---|---|---|
| A — D-26 / gates | **PASS** | The lock is the first transaction statement; the order test asserts `order[0] === 'lock'` directly. The 409 envelope matches §5.7a verbatim and nothing is written on conflict. The existing rule order is unchanged after the lock. The owner allowlist matches §5.8 as amended. Both sweeps fail closed against their scratch probes. |
| B — API / evidence | **PASS** | The prefix change keeps all five existing paths, with no collisions with any `admin/*` or `users` controller. The evidence response carries every FR-14 field, with no `tokenHash` or `storageKey`. `EXPIRED` uses the same `<= now` boundary as the public path. The PII fixtures cover both new routes. The mock changes make no suite vacuous. |

**Runtime events:** none.

**ADVISORY (recorded, not dispatched):**
1. The `EMAIL_LINK` single-writer sweep matches write syntax only. Indirection is invisible to it: a local variable, a helper return, a shorthand property, or `ConsentMethod['EMAIL_LINK']`. A fail-closed rewrite would flag every non-comparison reference.
2. `claimAndSendOne`'s claim and result writes are not exercised against answered rows; the static check covers them.
3. Nothing pins that only `dispatch` calls its private helpers.
4. `expectedUpdatedAt: null` gives a spurious 409. `@IsOptional` lets `null` through, and the code checks `!== undefined`.
5. A crops-only PATCH does not bump `Actor.updatedAt`, so a concurrent crops-only API edit goes undetected. The form always re-sends scalars, so the gap is limited to non-form callers.
6. The order test records only two delegates.
7. "`respond` bumps `updatedAt`" relies on Prisma's `@updatedAt`; nothing tests it.
8. The mock's lock predicate is broader than D-26 needs.
9. Evidence and the live link differ on a `SENT` row with a null `expiresAt`. No writer produces that state.

**For T-11:** the evidence field list is in `consent-evidence.service.ts`, `ConsentRequestEvidence` / `ConsentDocumentEvidence`.

- **Final verification:** VERIFIED.

### T-7 — Consent documents: bucket, IAM, storage port and routes — **PASS** (attempt 1/3 plus a Leader-ordered follow-up), 2026-10-06

- **Leader choices:**
  - Skills: `aws-serverless`, `nestjs-expert`, `tdd`.
  - Effort: `xhigh`.
  - Review: two lens Reviewers (infra / security, service / API), then one delta Reviewer.
- **Requirements covered:**
  - FR-13: the document-uploaded trail.
  - FR-15: server side.
  - FR-16: expiry and role.
  - NFR-8: template and pins. Live behaviour is owned by T-14.

**Files changed**
- `infra/20-backend/template.yaml`: `ConsentDocumentsBucket` (all four Block Public Access settings, `BucketOwnerEnforced`, AES256, versioning, one lifecycle rule on `incoming/`, `POST` CORS, `Retain`, tags), a TLS-only bucket policy, the `CONSENT_DOCUMENTS_BUCKET` env var, and IAM:
  - one statement for put/get/delete on `incoming/*`;
  - one for put/get on `stored/*`;
  - and, from the follow-up, `ListBucket` conditioned on `s3:prefix incoming/*`.
- Backend:
  - `document-storage.ts`, `s3-document-storage.ts`, `unconfigured-document-storage.ts`, `document-storage.factory.ts`, `consent-documents.service.ts`, `dto/consent-document-upload-url.dto.ts`, with specs;
  - `admin-consent-requests.controller.ts` (4 routes);
  - `consent-requests.module.ts`;
  - `actor-audit.service.ts` (`logConsentDocumentUploaded`) and its spec;
  - `consent-evidence.service.ts` (exports the document mapper);
  - `test/consent-documents-template.spec.ts`;
  - the e2e and PII gate fixtures.
- `backend/package.json` and the lockfile: the S3 client, presigned-post and request-presigner packages, plus `js-yaml` and its types as devDependencies.

**Red run:** the presign and download pins were observed red against a stub (empty conditions, a 3600 s expiry). The service tests were written alongside the code; their falsifiers below are the evidence.

**Falsifiers (executed red, then reverted):**

| Mutation | Red |
|---|---|
| A 20 MB length condition | The presign pin |
| `attachment` dropped | The download pin |
| The `HeadObject` comparison skipped | 4 mismatch tests |
| `s3:*` added | 3 template tests |
| `Resource: "*"` added | 4 template tests |
| *Follow-up:* the `ListBucket` condition dropped | 3 template tests |
| *Follow-up:* the loser's re-read removed | The concurrent-loser test |

**Implementer and Leader verification:**
- Attempt 1: 102 suites / 1738 tests.
- After the follow-up: 102 suites / 1743 tests (run with `--forceExit`; the Jest open-handle notice predates this task).
- Lint, build and `tsc` OK.
- `AWS_PROFILE=IBD-DEV ./infra/scripts/validate.sh` (it runs `sam validate --lint`):

  ```
  ==> Validation summary
      PASS  10-data-auth
      PASS  20-backend
      PASS  30-frontend
  ==> All templates valid.
  ```
- `./infra/scripts/tests/run-tests.sh`: 51 cases, all passed (the account-id scan is green).

**Evidence re-run (Leader): VERIFIED**, both before and after the follow-up.

**Reviewers**

| Lens | Verdict | Summary |
|---|---|---|
| Infra / security | **PASS** | The bucket matches §7.4 exactly. IAM is least privilege; the split into two statements is needed so `stored/` gets no delete. The presign conditions are exact. The filename sanitizer blocks header injection. No account-id literal. No new deploy parameter. The bucket name is 51 characters. |
| Service / API | **PASS** | The confirm order (head → copy → transaction claim plus audit → delete) is safer than the original design. The compare-and-set gives one audit row. The real signed policy is decoded in the tests. No `storageKey` leaks. |
| Follow-up delta | **PASS** | `ListBucket` is on the bucket ARN only with the prefix condition. A `403` stays an error. The loser fallback is correct. §5.6 matches the code. |

**Leader-ordered follow-up (both lens Reviewers' advisory 1, which this spec caused):** without `s3:ListBucket`, a `HeadObject` on a missing key returns `403`, so `confirm` would return `500` in production instead of `422`. Fixed with design amendments 2026-10-06:
- §5.6: the confirm order and concurrent-loser behaviour.
- §7.4: the prefix-scoped `ListBucket`.

Also: the concurrent loser now re-reads and returns the STORED evidence, and the e2e override is restored in `finally`.

**Runtime events:** none.

**ADVISORY / risks (recorded):**
- **A-1, owned by T-14 (added to its step 2):** S3 may not apply the `s3:prefix` condition to `HeadObject`'s implicit list check. The live test expects `422` for a missing upload; the fallback is defined there.
- **First-merge risk:** `20-backend` deploys on every merge to `main`, and the deploy role's S3 permissions are unknown. No policy in the repo mentions `CreateBucket`. If a bucket call is denied after create, `Retain` leaves an orphan, and the next deploy fails with "already exists". **Check the deploy role before merging.** T-12 adds the recovery note to `docs/infrastructure.md`.
- Non-ASCII filenames download as `_`.
- Document ids are `randomUUID()`, not cuid; either fits.
- One transient failure of `contact-no-writes.e2e.spec.ts` at its 20 s timeout while other processes were running. It passed alone and in the full suite.
- The service header comment does not mention the head step.

- **Final verification:** VERIFIED.

### T-8 — Public consent page — **PASS** (attempt 1/3), 2026-10-06

- **Leader choices:**
  - Skills: `frontend-design`, `tailwind-design-system`, `vercel-react-best-practices`, `react-doctor`.
  - Effort: `high`.
  - Review: one Reviewer, with a visual check of the captures.
- **Requirements covered:**
  - FR-9: all scenarios.
  - FR-10: UI.
  - FR-11: the page shows no record on a miss.
  - NFR-10: axe and captures.
  - NFR-11.

**Files changed**
- **New:**
  - `app/(consent)/layout.tsx` and its test
  - `app/(consent)/consent/page.tsx` and its test
  - `components/consent/{ConsentRecordPreview,RespondentFields,ConsentResponseForm,ConsentDeadEnd,ConsentRichText}.tsx`
  - `components/register/ConsentTextScrollGate.tsx`
  - `lib/api/consent-public.ts` and its test
  - `lib/content/consent-requests.ts`
- **Modified:** `components/register/ConsentPolicyDisclosure.tsx`, which now delegates to the gate.

**Falsifiers (executed red, then reverted):**

| Mutation | Red |
|---|---|
| Page moved to `(public)` (the red run) | Layout test: provider, banner and GA rendered |
| `view` called before `replaceState` | Ordering test: `Expected < 1, Received 2` |
| The gate's `disabled` stripped | 6 tests |

**Implementer verification:**
- 123 suites / 1877 tests.
- Lint clean on new files; `tsc` clean.
- Build is static; `out/consent/index.html` exists with the noindex meta and no gtag.
- `react-doctor` reports no issues.

**Captures:** headless Chromium over CDP, API intercepted, fonts awaited. Ready, dead-end and done-accepted states at 375, 768 and 1440. `scrollWidth` equals `clientWidth` in all 9 cells, and the address bar reads `/consent/` after load. Kept in the scratchpad, `t8-captures/`, not in the repo.

**Evidence re-run (Leader): VERIFIED.** 123 suites / 1877 tests; `tsc`; build; `out/consent/index.html`; 0 gtag hits.

**Reviewer (checklist plus visual): PASS.** No analytics, the strip happens before `view`, and every §7.3 state is present with no-token kept distinct from dead-end. The dead-end shows no record. The preview has public keys only. The respondent fields are never pre-filled. The gate extraction is behaviour-preserving. Tokens are clean. The captures are legible, with nothing clipped.

**Runtime events:** none.

**ADVISORY (recorded):**
- The gate's progress copy says "end of the policy"; on `/consent/` the document is the "Consent for Publication".
- Loading is a text line, not the skeleton §7.3 names.
- The shared gate lives in `components/register/`.
- No captures of the field-error and decline-confirm states.
- The client edition type has no `issuedAt`, mirroring the backend.

**Pre-existing defects found (out of scope, follow-ups for the product owner):**
1. **`/register` renders the consent-policy version as "vv1.0".** The gate prefixes `v` to a version that already starts with `v` (`ConsentPolicyDisclosure` at HEAD: `v{policy.version}`). The consent page strips one.
2. **The public profile labels a southern latitude "° N"** (`ProfileLocation.tsx`; e.g. `-3.3869° N` for Tanzania). The consent preview copies it.

- **Final verification:** VERIFIED.

### T-9 — Bulk send from Admin → Actors — in progress

- **Leader choices:**
  - Skills: `frontend-design`, `shadcn-ui`, `vercel-react-best-practices`, `react-doctor`.
  - Effort: `high`.
  - Review: one Reviewer, with a visual check.

#### Attempt 1 — **FAIL**

**Files changed**
- **New:**
  - `lib/api/consent-requests-admin.ts` and its test
  - `lib/admin/useConsentDispatch.ts` and its test
  - `components/admin/{SendConsentDialog,ConsentQueueBanner,ConsentSelectionStrip}.tsx` and their tests
- **Modified:**
  - `BulkActionBar.tsx` and its test
  - `DialogFooter.tsx` (optional `cancelLabel` and `hideConfirm`)
  - `app/(admin)/admin/actors/page.tsx` and its test
  - `lib/content/consent-requests.ts`

**Falsifiers (executed red):**
- Filter mode sending ids → the filter-target test.
- The loop stopping early → 11 tests.
- A skip-reason key removed → `tsc` TS2741.

**Leader follow-up before review:** `react-doctor`, which the Implementer had not run, reported 3 "ref mutated during render" errors and a `transition-all`. The Implementer fixed them; `react-doctor` now reports 0 errors and 5 warnings.

**Evidence re-run (Leader): VERIFIED.** 128 suites / 1929 tests. `tsc` and build OK.

**Leader-accepted deviation (standing authorization):** in all-matching mode, Unlock, Lock and Delete are disabled with a hint, because they act on ids only and would otherwise apply to just the visible rows while the bar reads "All N matching". The Reviewer confirmed it does not regress anything outside that mode.

**Reviewer: FAIL.** Verbatim:

> The "one in flight" guard (`runningRef`) is local to each `useConsentDispatch` instance, and the actors page creates two: one in `ConsentQueueBanner`, one in `SendConsentDialog`. Nothing coordinates them, so a tab can have two dispatch calls in flight at once.
> - **Resume while sending:** while the banner's Resume sending loop runs, the Send consent request button stays enabled (its `disabled` only tracks `dialogLoading`), so an admin can confirm a new batch and run both loops together.
> - **Close mid-run:** closing the dialog mid-run lets the orphaned in-flight call finish, while `closeSendDialog` bumps `queueRefreshKey` and the banner immediately offers Resume sending, so a second call can start beside the first.
> - **False stall error:** in the first case the banner loop (no `batchId`) also drains the dialog's batch; the dialog's steps then report `sent+failed = 0` with `remaining > 0`, and after `MAX_STALLED_STEPS` the dialog shows "Sending stopped making progress" though sending is going fine.
>
> No test drives two instances. **Violated Rule:** design.md §5.2 ("One dispatch at a time per tab keeps the load to one Lambda concurrency slot of the 5 reserved (P-10)"); requirements.md FR-4 *closing the tab*. **Remediation:** a single dispatch owner on the page (lift `useConsentDispatch` into `ActorsView` or a context and pass state and actions to both the banner and the dialog), or have the banner report `running`, disable Send while it is true, and disable the banner while the dialog is mounted. Add a page test: start Resume, try to open or confirm a send, and assert `mockDispatch` never has two pending calls.

**Advisories:**
- The deviation is OK.
- No stale-ref bug.
- `transition-[width]` is acceptable.
- **A contradictory count in all-matching mode:** "All 140 matching" in the bar and strip versus "25 actors selected" from `ActorsTable`.
- The error-copy fallback shows `Error.message`.

#### Attempt 2 — **PASS**

**Rework brief:** delivered by message to the same Implementer, with the FAIL copied verbatim. Effort was raised to `xhigh`.

**Files changed (this attempt):**
- `lib/admin/useConsentDispatch.ts`: `reset()`, guarded so it does nothing while a loop runs, and the exported `ConsentDispatch` type.
- `components/admin/{SendConsentDialog,ConsentQueueBanner}.tsx` and their tests: both take the page-owned dispatch as a prop.
- `BulkActionBar.tsx`: a `sendDisabled` prop.
- `ActorsTable.tsx` and its test: an optional `selectionSummary` prop, so the all-matching count no longer contradicts the bar.
- `app/(admin)/admin/actors/page.tsx` and its test: one `useConsentDispatch` owned by `ActorsView`.
- `lib/content/consent-requests.ts`: the close copy now says sending continues.

**Tests:**
- Resume while sending: Send is disabled and no preview or enqueue call happens.
- Close mid-run: the loop stays visible in the banner, Resume is absent, and at most one dispatch call is ever pending (checked by holding the calls open).
- The obsolete dialog test "closing stops the loop" was deleted; its behaviour is now intentionally the opposite.

**Falsifier:** the banner given its own hook again → both page tests red (`Received element is not disabled`, and the running banner missing). After the revert, the page suite was 43/43.

**Implementer verification:** 128 suites / 1932 tests. `tsc` clean, lint 0 errors, build OK. `react-doctor` reports 0 errors and 5 warnings: 2 complexity warnings in the new components and 3 in T-8 files.

**Captures:** the banner and the progress dialog were re-captured at 375, 768 and 1440. `scrollWidth` equals `clientWidth` in every state.

**Evidence re-run (Leader): VERIFIED.** 128 suites / 1932 tests. `tsc` and build OK.

**Reviewer (rework; override (e)): PASS.** There is one dispatch owner per page. The guard is page-wide. `reset()` cannot clear a running loop. Both new tests are real. The deleted test was legitimately obsolete. The `selectionSummary` prop is minimal and safe for T-11.

**Leader-inline after PASS (comment-only):** the stale "Any loop in flight stops" comment in `SendConsentDialog` was corrected (Reviewer advisory 1).

**Runtime events:** none.

**Requirements covered:**
- FR-2: the skip breakdown in the UI.
- FR-4: all scenarios.
- FR-6: the UI loop.
- NFR-10: axe and captures.

**ADVISORY (recorded):**
- Escape or a backdrop click during `enqueuing` still closes the dialog. The shared guard keeps two dispatch calls from coexisting; the worst case is counters shown on a second dialog.
- The `dispatch` object is new on every render.
- Test 1's max-pending check cannot fail while Send is disabled; the disabled check is what catches the defect.
- Two complexity warnings remain.

- **Final verification:** VERIFIED.

### T-10 — Single send: actor page action, post-create prompt, import offer — **PASS** (attempt 1/3), 2026-10-06

- **Leader choices:**
  - Skills: `frontend-design`, `react-doctor`.
  - Effort: `medium`.
  - Review: one Reviewer. This was not a skip: override (b) applies because the shared `SendConsentDialog` contract changed.
- **Requirements covered:**
  - FR-3: the edit-page action with its reason, Resend, the post-create prompt with its AND MUST NOT when `GRANTED`, and warnings plus prompt.
  - FR-5: all scenarios, including the BUT on this commit's actors only.
  - FR-2: a single send re-asks a decliner (UI).

**Files changed**
- **New:**
  - `components/admin/SendConsentAction.tsx`
  - `components/admin/SendConsentPrompt.tsx`
- **Modified:**
  - `SendConsentDialog.tsx`: an optional `scope`, default `'bulk'`.
  - `lib/api/consent-requests-admin.ts`: evidence types and `getActorConsentEvidence`.
  - `lib/content/consent-requests.ts`
  - The `new`, `edit` and `import` pages and their tests. `DuplicateWarningInfoDialog` is replaced by the prompt.

**Falsifiers (executed red, then reverted):**

| Mutation | Red |
|---|---|
| The `GRANTED` gate dropped (the red run) | 2 new-page tests |
| All rows' ids passed to the CTA | 2 import tests (extra `failed-ghost`, `dup-ghost`) |

**Implementer verification:**
- 128 suites / 1946 tests.
- `tsc`, lint (0 errors) and build OK.
- `react-doctor` reports 0 errors.
- Captures at 375 and 1440 with no horizontal overflow. The `GRANTED`-create prompt was not captured, because the form's `GRANTED` path needs a method; unit tests cover it.

**Evidence re-run (Leader): VERIFIED.** 128 suites / 1946 tests. `tsc` and build OK.

**Reviewer: PASS.**
- The `GRANTED` gate sits at both the page and the prompt.
- A single send uses exactly one id.
- "Resend" from evidence is consistent with the backend's pending set.
- Import ids come from `created` rows only.
- The `scope` prop is backward compatible.
- Each page has one dispatch owner.
- The evidence types mirror the backend.

**Runtime events:** none.

**ADVISORY (recorded):**
1. **An unowned clause, routed to pre-archive validation:** FR-3 says "Choosing Send sends one request **and confirms it**". On a clean send the prompt navigates without a confirmation message, and the actors list has no flash mechanism. Design §7.3 says "defaults to Send, and then navigates".
2. `queued === 0` navigates silently.
3. The `notSent` copy says "resume" when the row is `FAILED`, where the action is Retry.
4. Prompt focus drops to `<body>` while sending, and does not move to "Continue to actors".
5. The import CTA count goes stale after a send, and a failed preview hides the CTA.

- **Final verification:** VERIFIED.

### T-11 — Evidence panel, document field, history labels and method lists — in progress

- **Leader choices:**
  - Skills: `frontend-design`, `tailwind-design-system`, `react-doctor`.
  - Effort: `high`.
  - Review: two lens Reviewers, A on form and consent rules and B on evidence and upload plus a visual check.

#### Attempt 1 — **FAIL** (B); A **PASS**

**Files changed**
- **New:**
  - `components/admin/ConsentEvidencePanel.tsx` and its test
  - `components/admin/ConsentDocumentField.tsx` and its test
- **Modified:**
  - `ActorForm.tsx`: read-only `EMAIL_LINK`, frozen date and reference, the select swap with the D-24 clear, `expectedUpdatedAt`, the 409 notice, and the held document file.
  - `ActorsTable.tsx`: a total label/class `Record`; the test iterates `CONSENT_METHODS`.
  - `ActorHistoryPanel.tsx`: the 3 new actions and "Consent link (actor)".
  - `SendConsentPrompt.tsx`: an optional `notice`.
  - The `new`, `edit` and `actors` pages.
  - `lib/api/actors-admin.ts`: the `CONSENT_METHODS` runtime array, `EMAIL_LINK`, and the audit action union.
  - `lib/api/consent-requests-admin.ts`
  - `lib/content/consent-requests.ts`
  - The tests for each.

**Red run:** the derived-union `ActorsTable` test was red against the old switch, which rendered "Not recorded".

**Falsifiers (executed red, then reverted):**

| Mutation | Red |
|---|---|
| The `EMAIL_LINK` label removed | `tsc` TS2741 plus 2 Jest tests |
| Upload before the create resolves | The create-fails tests |
| The date left editable | The frozen-evidence test |
| `expectedUpdatedAt` not sent | The form test and the edit-page 409 test |
| Reload made a no-op | The reload test |

**Implementer verification:** 130 suites / 1997 tests. `tsc`, lint (0 errors), build and `react-doctor` (0 errors) clean.

**Evidence re-run (Leader): VERIFIED.** 130 suites / 1997 tests. `tsc` and build OK.

**Reviewer A (form and consent rules): PASS.** Every stored-state × status combination was traced through `buildDto` against `enforceConsentMethodRules`, D-24 and provenance: no spurious `400` and nothing forbidden is submittable. D-26 is wired: `admin-actor.serializer` emits `updatedAt`. The method lists and history labels conform.

**Reviewer B (evidence and upload): FAIL.** Verbatim:

> In `ConsentDocumentField`, the type/size rejection message is not linked to the input. `aria-describedby` points at `messageId`, which is the `role="status"` div holding the availability, uploading and attached messages. The error is rendered in a separate `<p role="alert">` that has no id, so it is outside the input's accessible description. With storage enabled, `aria-invalid="true"` refers to an empty description; a screen-reader user who comes back to the field hears "invalid" with no reason. The rejection test checks `aria-invalid` and the alert text, but not the accessible description, so it stays green.
>
> **Violated Rule:** `requirements.md` FR-15 scenario "wrong type or size… rejects it with a field error"; `frontend/CLAUDE.md` § API client conventions ("forms map … to inline field errors via `aria-describedby`") and § Admin shell ("WCAG 2.1 AA … error association").
>
> **Remediation:** Give the error `<p>` its own id (e.g. `${uid}-error`) and add it to `aria-describedby` when `errorMessage` is set. In the 12 MB / `.docx` test, add `expect(input).toHaveAccessibleDescription(/larger than 10 MB|PDF, JPG or PNG/)`, and confirm it goes red before the fix.

**Advisories, A and B (recorded):**
- `onSuccess` gained an `extras` argument (a P-25 drift: the form still never uploads).
- The failed-upload notice says "from the actor page" but navigates to the list.
- The history panel does not refresh after an immediate upload.
- Focus is lost while an upload runs.
- `consent-evidence` is fetched twice per edit-page load.
- No client-side check on file names over 255 characters.
- No test of the re-grant PATCH body.
- No test of the stored DENIED plus `EMAIL_LINK` case.
- Stale comments in `ActorForm` ("no separate blank option", "never a blank sentinel"), and the history test's `ALL_EIGHT_ACTIONS` now holds 11 actions.
- `SendConsentAction` is not re-keyed on Reload.

#### Attempt 2 — **PASS**

**Rework brief:** delivered by message to the same Implementer, with the FAIL copied verbatim.

**Files changed (this attempt):**
- `ConsentDocumentField.tsx`: the error `<p>` gets its own id, and `aria-describedby` = the hint, plus the status (only when shown), plus the error (when shown).
- Its test: the 12 MB, `.docx` and storage-refusal tests assert the accessible description.
- Comment-only corrections in `ActorForm.tsx`.
- `ALL_EIGHT_ACTIONS` renamed to `ALL_ACTIONS`.
- `ConsentEvidencePanel.tsx`: the formatter hoisted to module scope. The output is identical.

**Red run:** on the existing code, 3 failed and 7 passed ("Expected element to have accessible description"). After the fix: 10/10.

**Falsifier:** the old `describedby` → the same 3 red; restored → 10/10.

**Implementer verification:** 130 suites / 1997 tests. `tsc`, lint (0 errors), build and `react-doctor` (0 errors) clean.

**Evidence re-run (Leader): VERIFIED.** 130 suites / 1997 tests. `tsc` and build OK.

**Reviewer (rework; override (e)): PASS.** The error id is present whenever `errorMessage` is set, covering both the rejection and the upload error. The old wiring provably fails the new assertions. The comment edits are accurate. The formatter output is unchanged.

**Runtime events:** none.

**Requirements covered:**
- FR-14: all.
- FR-15: UI.
- FR-16: the download action.
- FR-13: trail labels.
- FR-10: form, including frozen evidence, the select swap and D-26.
- NFR-10: axe and captures (`t11-captures`, 22 scenarios, no horizontal overflow).

**ADVISORY (recorded):** the "uploading" and "attached" messages are announced only through `aria-live`, not through the input's description. No test asserts that the error id is removed once a valid file clears the error. Attempt 1's advisories stand.

- **Final verification:** VERIFIED.

### T-12 — Baseline documents — in progress

- **Leader correction before the brief:** `tasks.md` T-12 said ADR-NNN would be "allocated now". Root `CLAUDE.md` § Concurrency protocol allocates ADR numbers at apply time on the default branch, never from a spec branch, and chunk 1 used a placeholder. T-12 therefore writes `ADR-NNN` (candidate ADR-018). Unmerged-branch check, 2026-10-06: every branch tops out at ADR-017.
- **Budget re-baseline (standing authorization):** LOC through T-11 is 16,985 (backend, frontend and infra, excluding lockfiles and specs) against the ~16,000 projection. The new projection is **~17,700**, with T-12 and T-13 docs at about 700. Review verdicts so far: 30. The projection is **~34**.
