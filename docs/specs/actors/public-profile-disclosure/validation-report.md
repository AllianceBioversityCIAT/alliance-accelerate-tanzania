# Validation Report — Public Profile Disclosure

## 1 · Document Control

| Field | Value |
|---|---|
| Spec | `docs/specs/actors/public-profile-disclosure` |
| Branch | `public-profile` (22 commits ahead of `main`) |
| Date | 2026-09-07 |
| Method | Four independent read-only auditors, each on a dimension the others did not touch. The Leader orchestrated all 20 tasks and therefore audited nothing (`author ≠ auditor`); it verified findings and performed mechanical phases only. |
| Recommendation | **Archive-ready, with one open finding that is not this spec's** |

## 2 · Summary

**Verdict: PASS.** All 20 tasks closed with Reviewer evidence; the six build gates are green; the spec delivered what it promised and stayed inside its own budget.

Validation found **7 FAIL-level defects**. All seven are **closed**, each verified in the working tree rather than accepted from a report. Two of them were things the Leader had wrongly routed *out* of the spec.

One finding remains **open and is deliberately not fixed here**: an intermittent backend test failure that predates this spec.

| Dimension | Result |
|---|---|
| Task completion | **PASS** — 20/20 `[x]`, all 20 with `execution.md` entries |
| File existence | **PASS** — every design artefact present; `RestrictedContactPanel.tsx` correctly deleted |
| Build integrity | **PASS** — 6/6 gates |
| Requirement coverage | **PASS** after remediation — 15 scenarios, 24 `BUT`/`AND IT MUST` clauses, audited at clause granularity |
| Design conformance | **PASS** — DD-1…DD-11 all implemented |
| Code quality (4R) | **PASS**, 11 advisories recorded |
| Constitution impact | **PASS** — 16 documents in one commit (`611e8dfcc`) |

## 3 · Task Completion

20/20 `[x]`, zero `[~]`, zero `[ ]`. Every task has an `execution.md` entry containing a Reviewer verdict.

Three tasks took three attempts each — **T-16, T-17, T-20**. In every case the reworks found real defects, and in two cases the defect was in the task text the Leader had written, not in the Implementer's work.

## 4 · File Existence

| Artefact | State |
|---|---|
| `pii-consent.policy.ts`, `role-aware.serializer.ts`, `pii-boundary.spec.ts` | present |
| `ProfileContact.tsx`, `csv.ts`, `smoke.sh` | present |
| `RestrictedContactPanel.tsx` | deleted, as designed |
| `docs/specs/archive/` | **untouched** — the task's stated Disqualifier, verified |

## 5 · Build Integrity

| Gate | Result |
|---|---|
| `backend` build (`nest build`) | OK |
| `backend` lint (`eslint --quiet`) | clean |
| `backend` tests (`--runInBand`) | **1061** (was 1052; remediation added 9) |
| `frontend` `tsc --noEmit` | clean |
| `frontend` build (static export) | OK — all routes prerendered as static, so the no-SSR constraint holds |
| `frontend` tests | **1637+** |

> **`--runInBand` is mandatory and is not what `npm test` does.** `backend/package.json`'s test script is bare `jest` with no `maxWorkers`. Running it as-published produced **21 phantom failures** during this validation. See §11, finding R-1.

## 6 · Requirement Coverage

Audited at **scenario and clause granularity**, not by ID — an ID-keyed traceability table can look complete while a scenario is orphaned.

**15/15 scenarios PASS. 24/24 clauses PASS** after remediation.

Three clauses failed initially and are now closed:

| Clause | Why it failed | Closed by |
|---|---|---|
| FR-9 · *"must NOT be circumventable by a query parameter, a filter, or a page-size value"* | Every list assertion requested bare `/api/v1/actors`. Zero tests varied the request shape. | `it.each` over 6 shapes (`region`, `role`, `crop`, `search`, `pageSize=100`, `page=2&pageSize=1`), each asserting `data.length > 0` **before** sweeping, so no shape can pass vacuously |
| FR-4 · *"must NOT be backfilled, invented, or derived from any other column"* (import path) | The only test ran against a row where **every derive-source was also empty**. It passed with the defect present. | A row with distinct sentinels in `position`, `marketLocation`, `sex`, `traderName`; mutation `contactPerson = cells.position` demonstrated red |
| FR-6 · *"must NOT hide a row whose value is absent"* | The em-dash test covered 5 of the 7 rendered rows. `Sex` and `Other Crops` were unguarded. | Both added to the em-dash and value assertions; hiding the `Sex` row and removing its value each demonstrated red |

**The strongest clause in the spec** is FR-2's *"must NOT be distinguishable from a request for a non-existent id"*: two apps, the **same** id, one with a real non-granted row and one with an empty mock, compared byte-for-byte. The naive two-different-ids comparison would have been a false pass, and the test explicitly refuses it.

**FR-8's single-commit clause is satisfied** — commit `611e8dfcc` carries all 16 constitutional documents together.

## 7 · Linting & Code Quality — 4R advisories

Eleven advisories were raised. **All eleven are closed**, because each was a claim that was false about an artefact — the defect class this spec exists to eliminate:

| Site | Was |
|---|---|
| `docs/ux-ui/design.md:102` | *"the two non-publishable fields marked as review-only context"* — both halves false |
| `requirements.md` ×3 | contact block described as **four** fields; it is five |
| `proposal.md` ×3 | marked the **surviving** CSV rule as *superseded* — a reader concluded the opposite of the decision |
| `smoke.sh` header + `infra/README.md` | described less than the script does |
| `RegistrationDetailPanel.tsx:19` | *"public directory"* where the contact block reaches only the profile |
| `execution.md` T-16 | attributed a crash to the compiler; `next/jest` uses SWC and does not typecheck |
| `execution.md` T-12 | cited a test name that T-17 had renamed |
| `execution.md` T-10 | 5 + 7 = **12**, not the eleven `tasks.md` asks to assign |
| `general-setup/` ×3 | prescribed a withholding recipe that omits the act that withholds |

The last one is worth stating on its own. **All three policy field-set constants have zero runtime consumers** — `PII_ALLOWLIST`, `PUBLICLY_DISCLOSED_FIELDS`, and `CONTACT_BLOCK_FIELDS` are declarations the suite asserts against. What actually withholds a field is **not naming it in `toPublicListItem` / `toPublicDetail`**. The templates bind every future spec and named neither projection.

## 8 · Design Conformance

**DD-1 … DD-11: all implemented.** Verified against live source, including DD-9 (`include`, never `select`), DD-6 (`PublicActor` as a load-bearing alias), and DD-11 (falsifiability claims state type-reachability).

### The budget held

| Category | Net |
|---|---|
| Deliverable code | **+2,228** |
| Constitutional documents | +8 |
| The spec's own audit trail | +2,660 |

`design.md` §16's band was **1,700–2,400 net LOC**. Code landed inside it, with a 20th task added mid-flight. What grew was the audit trail, which the budget never measured.

Three documents asserted *~2,080* and **none of them measured it** — a figure agreed by three documents and established by none. Now measured.

### Two findings the Leader wrongly routed out

Both were re-classified by an auditor and both are now fixed:

**`AUDITABLE_FIELDS` — this spec opened an audit hole.** Measured:

| | `AUDITABLE_FIELDS` | `AdminActor` | uncovered |
|---|---|---|---|
| before (`main`) | 21 | 25 | **none — set complete** |
| after T-2 | 21 | 27 | **`contactPerson`, `otherCrops`** |

Because `logUpdate` returns `null` on an empty diff, an admin edit changing **only** `contactPerson` wrote **no audit row at all** — not a row missing a field. `logRegistrationApprove` omitted both too, so the applicant-supplied contact name was absent from the audit record of the moment it entered the public registry. `contactPerson` is a **third party's name**, now publicly disclosed and admin-editable; it could be changed or erased without trace.

Closed: both added, mutation demonstrated red, and the completeness re-derived (23 = 27 − `id`/`createdAt`/`updatedAt` − `crops`). `backend/CLAUDE.md`'s audit guarantee is true again.

The Leader had accepted the T-2 Reviewer's *"proposal, not task"* routing. That was a **scope** argument, not a correctness one, and design §4's budget-tripwire mechanism — used correctly for T-20 — was available and unused.

**TRD §3 — this spec created a contradiction.** §3 was complete and true before: the columns did not exist. T-1 added them, T-17 rewrote the surrounding prose, and left §3's entity table contradicting the paragraph directly below it — while §3 is declared authoritative for the import service, which T-4 extended to v3. Both columns now declared, mirroring `schema.prisma`.

## 9 · Test Evidence Summary

No `test-report.md` exists; coverage was verified directly.

Every remediation carries a **demonstrated red**, not a green run:

| Guard | Mutation | Result |
|---|---|---|
| `contactPerson` audit row | remove `'contactPerson'` from `AUDITABLE_FIELDS` | `Received: null` — red |
| import derive guard | `contactPerson = cells.position` | `Received value: "Sentinel Position"` — red |
| em-dash, `Sex` row | make the row conditional | `Unable to find an element with the text: Sex` — red |
| `sex` value | replace with `'—'` | `Unable to find an element with the text: Female` — red |

The import mutation also confirmed the **old** test still passed under the defect — the auditor's diagnosis, verified rather than assumed.

## 10 · Agent Guide / Constitution Impact

T-17 moved 16 documents in one commit, including four `.agents/*` persona contracts that — left alone — instructed the next agent to revert this spec. `.agents/reviewer.md` made serialising `phone`/`email` to `Public` an automatic FAIL; `.agents/tester.md` mandated a test that fails against the shipped contract.

`AGENTS.md` and `backend/AGENTS.md` declare themselves mirrors of files T-17 had already fixed, so leaving them created a contradiction between a file and its own declared source. Both now track.

## 11 · Remediation

### Closed (7 FAIL + 11 advisories)

All verified in the tree. Backend `+146/−2` across 4 files, frontend `+18/−5`, docs and infra `+37/−21`.

### R-1 · OPEN — intermittent backend test failure (not this spec's)

**The failing test is identified**, and it is not where the Leader first assumed:

```
FAIL src/contact/contact.e2e.spec.ts
● POST /api/v1/contact (T-7 — submission, honeypot, throttle e2e)
  › rejects an empty string "subject" with 400 naming it
```

That test asserts a **400** from validation. It sits in a suite that also exercises the `@nestjs/throttler` guard on `ContactController`. If the throttle bucket is already spent by the time it runs, the request returns **429** and the assertion fails — a **rate-limiter state leak**, not a validation defect.

| Observation | Result |
|---|---|
| `admin-registrations-reject` isolated, ×5 | 25/25 — **not the culprit** |
| `contact.e2e.spec.ts` isolated, ×3 | **23/23 every run** |
| Full backend suite, `--runInBand` | failed 2 of 5 runs, 1 test each |
| The failing test, when captured | `contact.e2e.spec.ts` — and that file carries **19** throttle/`429` references |

Green in isolation, intermittent only in a full run, in the one suite that owns a rate limiter: the throttle counter survives across test files, so a request the test expects to be rejected by **validation** is instead rejected by the **limiter**.

**A correction the Leader made to itself, recorded because it nearly shipped.** The first failure of the day appeared in `admin-registrations-reject`, and the temptation was to write *"known flake in `admin-registrations-reject`"* into this report. That attribution is **false**. It was refused for the right reason — a claim about an artefact that had not been re-examined is the exact defect this spec spent itself eliminating — and capturing the identity proved the refusal correct.

**What still cannot be claimed:** the true failure rate. Three of the runs were contaminated by the Leader's own overlapping measurements (§12), so the 2-of-5 figure mixes clean and contended observations and should not be quoted as a rate.

A suite containing PII release gates whose verdict varies between identical runs is not a reliable gate, even when today's failure touches no PII assertion. Together with the `--runInBand` finding, this says the repository's **test infrastructure needs its own spec**, not a patch inside this one.

### Routed out — confirmed pre-existing

| Finding | Evidence |
|---|---|
| `npm test` is bare `jest`; parallel runs manufacture failures | `package.json` untouched by this spec; the documented-correct form lives only in prose |
| TRD §4 phantom rows (`/actors/geo`, `/export`, `/crops`) | No controller implements any; a `registration-source-and-consent` scope note from 2026-08-04 already recorded it |
| `npm run test:e2e` cited in five files; script absent | `CLAUDE.md` records its removal; this spec's own `judgment.md` J-3 refuted it independently |

## 12 · Leader Process Failures

Recorded because a validation that omits how it was conducted is not auditable.

**Three invalid measurements**, all from the same cause: **measuring without first verifying that nothing else was measuring.**

1. Ran the gate immediately after a worker reported → 1 phantom failure. Re-ran: clean, three times.
2. Ran the full suite as bare `npm test` → **21 phantom failures**, and nearly began "fixing" 21 admin-route tests that were never broken.
3. Started a diagnostic run **while three stability runs were in flight** — five concurrent jest processes. This contaminated the evidence for R-1, the one finding that needed clean characterisation.

The third is the worst: it did not cost time, it cost **the ability to characterise a real finding**. The lesson was already written in `execution.md` before the third occurrence.

**Two findings wrongly routed out** (§8), both re-classified by auditors, both this spec's own.

**One false claim written by the Leader** — `execution.md`'s T-19 entry stated *"no seeder sets either column"* and described a two-column `UPDATE`. `SeedActor` carries **none** of the seven profile fields, and the `UPDATE` wrote seven columns. Mechanism: a grep answered the question asked; a claim was written about the question not asked. **Instance seventeen**, in the entry whose evidence is least re-derivable. Corrected with the mechanism recorded, not silently rewritten.

## 13 · Archive Readiness

**Ready.**

- 20/20 tasks `[x]` with evidence
- 0 unresolved FAIL findings
- Advisories closed or accepted with owners
- Scenarios and clauses covered, negative constraints falsifiably guarded
- Drift reflected in the documents
- One open finding (R-1) characterised with its limits and routed to its own proposal

Two items remain **legal's, not this spec's**: the consent-policy text is still `[PLACEHOLDER TEXT — pending legal review]` with `CONSENT_POLICY_VERSION` deliberately un-bumped, and the email-purpose gap is unresolved. NFR-7's third member — applicants who registered under the old promise — is **empty**: nobody has registered and the application has not been delivered, confirmed by Daniela Gómez on 2026-09-07.

That last fact changes what T-20 accomplished: it corrected a false notice to a data subject **before it was ever shown**, rather than after.

```text
/akili-archive actors/public-profile-disclosure
```
