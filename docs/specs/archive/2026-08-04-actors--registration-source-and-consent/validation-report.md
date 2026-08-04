# Validation Report — Registration Source & Consent Provenance

## 1. Document Control

| | |
|---|---|
| **Spec path** | `docs/specs/actors/registration-source-and-consent/` |
| **Validated at** | HEAD `68c6996`, working tree clean |
| **Date** | 2026-08-04 |
| **Validator** | AKILI Leader (T3 / opus) with two independent T3 auditors: `val-FR` (FR-1..FR-9), `val-NFR` (NFR-1..NFR-8, design conformance, constitution impact) |
| **Author ≠ auditor** | Implementers were T2 / sonnet. Both auditors are opus and wrote none of the code. The Leader authored the FR-6 amendments and made the gate adjudications, and therefore **did not audit its own amendment text** — both auditors were briefed to treat it with extra suspicion. |
| **Preceding phase** | `/akili-test` was **not** run — no `test-report.md` exists. Coverage was verified directly against source rather than reused from a test report. Accepted by JuanCode before validation began. |

## 2. Summary

**Verdict: PASS with warnings. Archive-ready.**

| Dimension | Result |
|---|---|
| Task completion | **PASS** — 10/10 `[x]` |
| File existence | **PASS** |
| Build integrity | **PASS** (one known intermittent, §5) |
| Requirement coverage — FR-1..FR-9 | **9 PASS**, no unmet MUST |
| Requirement coverage — NFR-1..NFR-8 | **7 PASS**, 1 WARN (NFR-5) |
| NFR-1 PII boundary (**declared hard release gate**) | **PASS** |
| Design conformance | **PASS** with doc-side defects, 4 corrected during validation |
| Constitution impact | **PASS** |
| Unresolved FAIL findings | **none** |

**No requirement is unsatisfied.** The warnings are (a) an accessibility *instrument* limitation rather than an unmet clause, and (b) a set of documented follow-ups, two of which carry real risk and should not sit in a backlog.

**Headline caveat that is not a spec violation:** the four new trader types this spec adds to the backend taxonomy cannot be **selected** anywhere in the admin console — see §6 FR-4 and §11 R-3. FR-4's text is about normalization only, so the requirement is met as written, but the system-level consequence lands on the next spec.

## 3. Task Completion

| Check | Result |
|---|---|
| All tasks `[x]` | **PASS** — 10/10 |
| Execution notes per task | **PASS** — `execution.md` carries a section per task with reviewer verdicts, verification output, and advisory tables |
| Verification evidence | **PASS** — every task records its `Verify` command output; the Leader independently re-measured the suite, build, and release gates in a quiet tree |
| Review independence | **PASS** — every task reviewed by 1–2 opus lenses against sonnet implementers |
| Held tasks resolved | **PASS** — T-8 was `[~]` on the D-h human check; discharged 2026-08-04 as a T6 visual pass, which produced two real fixes |

## 4. File Existence

All files named in `design.md`'s file tree exist and carry the described changes. No expected deletion was skipped, no unexpected file was introduced. Verified: 4 new backend modules + specs, 1 migration, the regenerated template asset, 6 modified frontend modules + tests, and `tailwind.config.ts`.

## 5. Build Integrity

Measured by the Leader in a quiet tree (no delegated agent active), per the repo's concurrency protocol.

| Package | Command | Result |
|---|---|---|
| `backend/` | `npm test -- --silent` | **442 passed, 37 suites** |
| `backend/` | `npx jest src/test/pii-boundary.spec.ts src/test/lambda-handler.e2e.spec.ts` | **12 passed, 2 suites** — both declared release gates green |
| `backend/` | `npx eslint "{src,test}/**/*.ts" --quiet` | clean |
| `frontend/` | `npm test -- --silent` | **991 passed, 69 suites** (×3 consecutive) |
| `frontend/` | `npm run lint` | clean — 3 pre-existing `no-img-element` warnings in unrelated files |
| `frontend/` | `npm run build` | succeeds, static export 20/20 |
| `frontend/` | `npx tsc --noEmit` | only the pre-existing `TS2556` at `page.test.tsx:45` (J-4) |

**One intermittent failure, reported rather than smoothed.** `frontend/app/(admin)/admin/actors/import/page.test.tsx` fails ~**1 run in 7**:

```
● ActorImportPage — full flow (no acknowledgement) › previews on file select,
  then commits and shows the result summary
  expect(jest.fn()).toHaveBeenNthCalledWith(n, ...expected)
  n: 1   Expected: {}, "preview", "test-access-token"
  Number of calls: 0
console.error: An update to ActorImportPage inside a test was not wrapped in act(...)
  at setToken (app/(admin)/admin/actors/import/page.tsx:199:7)
```

Root cause confirmed at source: `import/page.tsx:189-206` sets `token` inside an un-awaited async `init()`, and `handleFileChange:258-261` early-returns via `handleAuthFailure()` while `token` is null. A test firing the file-select before that promise resolves sees zero calls. **The defect is in the test harness, not shipped behaviour** — the production window is one microtask against a human opening an OS file dialog. `import/page.tsx` has zero diff in this spec.

**Not a blocker; first in the follow-up.** The cost is not this assertion — it is that every future full-suite run carries ~14% odds of a red that someone reruns away, which is how a genuine regression gets dismissed. `tasks.md` is right that a gate failing 1-in-7 is not a gate.

**Environment boot smoke:** not run. `docs/infrastructure.md` §6 exists and is followed for migrations; the spec's behaviour is covered by e2e over HTTP plus the `lambda-handler` gate, so a stack boot adds nothing this validation needs.

## 6. Requirement Coverage

### Functional — 9 PASS, no unmet MUST

Both auditors read each requirement's own text, ignoring task scope lines and the execution narrative. This mattered: **four requirements in this spec were owned by no task**, three surfacing only at the final one.

| FR | Verdict | Note |
|---|---|---|
| FR-1 Registration source | **PASS** | Round-trip write→read-back; out-of-enum → field-level 400; 436→436 rows post-migration, sampled row byte-identical |
| FR-2 Consent provenance | **PASS** | All three fields persist + audit diff; future date → 400; >255 → 400; reference correctly optional |
| FR-3 Provenance on every write path | **PASS** | **All four paths call the one shared predicate** — create, update, bulk, per-row import — each verified individually, not inferred. `acknowledged` kept *alongside*, not replaced (DD-2). Trigger is value-change, not key-presence (R-9/J-1's misreading is absent) |
| FR-4 Trader taxonomy | **PASS as specified** | Normalization correct, aliases case/whitespace-insensitive, unknowns still quarantine, six pre-existing types byte-identical. **See R-3** — FR-4's text is normalization-only; the console consumer gap is real but outside every FR in this spec |
| FR-5 Template v2 + per-row enforcement | **PASS** | Asset byte-matches fresh generation; Instructions lists allowed values for the new enums; one bad row fails alone; v1 rejected with a re-download message |
| FR-6 Admin surfaces | **PASS** | Amendments verified against code, not accepted — see §8 |
| FR-7 Export safety | **PASS** | Named allowlist, no spread; CSV asserts names *and* non-default values. Positive half honestly deferred to OQ-5 (no admin export exists) |
| FR-8 Public boundary | **PASS** | `NEVER_PUBLIC_FIELDS` covers the four new fields plus three previously prose-only; `PII_ALLOWLIST` untouched (DD-6) |
| FR-9 Visible legacy gap | **PASS** | No backfill; `GRANTED` + `NOT_RECORDED` enumeration traced **end-to-end** — client → query DTO → service → Prisma `where`, AND-composed into both `findMany` and `count` |

**Negative constraints and strict validations were audited individually** — the clauses most often skipped, because task done-criteria encode the positive path. Each of FR-3's five `must NOT` clauses has both an implementation and a test, including *must NOT be satisfiable by `acknowledged` alone*, *must NOT overwrite existing evidence* (mixed batch with deliberately different batch values), and *must NOT block un-publish-then-strip*.

**One test-evidence gap:** FR-3's create scenario says *"AND no actor row is created."* No test asserts row absence after the 400. Structurally guaranteed — the throw precedes the transaction — so a coverage gap, not a defect.

**A fifth write path was looked for and characterized.** `src/import/import.service.ts` cannot reach `GRANTED`. But `prisma/seed-data.ts` and `seed-synthetic.ts:120` **do** write `GRANTED` with no provenance, bypassing the guard. Dev/ops scripts outside FR-3's enumerated surface, and the rows they produce land in exactly FR-9's visible-gap shape — accepted risk **D-f**, now concrete rather than theoretical.

### Non-functional — 7 PASS, 1 WARN

| NFR | Verdict | Note |
|---|---|---|
| **NFR-1** PII boundary (**hard gate**) | **PASS** | The serializer is a **literal 8-key pick** returning `PublicActor`, so an extra field is a compile error rather than a runtime leak. `pii-boundary.spec.ts` derives its forbidden set from the **union** of both constants — not a hand list — and asserts non-default **values** across `/actors`, `/actors/:id`, `/metrics`. Reached independently by both auditors |
| NFR-2 Additive/lossless migration | **PASS** | 4 `ADD COLUMN` + 1 `CREATE INDEX`; no `DROP`/`MODIFY`/`RENAME`/`UPDATE`. Rehearsed on shared dev RDS rather than local MySQL (deviation B-1, disclosed in `execution.md` §1.1, stronger ground not weaker) |
| NFR-3 No taxonomy/template drift | **PASS** | Allowed-value lists derive from `Object.values()` on the Prisma enums; nothing re-typed; a test pins the derivation |
| NFR-4 Asset byte-stability | **PASS** | Committed asset compared to a fresh generation. G-9 open: the Instructions *prose* omits the two new dropdown columns (the per-column table has them) |
| **NFR-5** WCAG 2.1 AA | **WARN** | FR-6's normative clause **is met** — each new control sets `aria-describedby` to its error node, which is `role="alert"`. But the measure names *"contrast per §7"*, which this gate **cannot produce**: under jsdom `color-contrast` returns *incomplete*, and `toHaveNoViolations` does not fail on incomplete. Focus order and focus visibility likewise unproven. Two surfaces routed to the D-h check were never examined: T-9's `lg:grid-cols-4` density and T-10's dialog focus order (A-2). **WARN not FAIL: what is unverified is the NFR's own instrument, not a stated requirement** |
| NFR-6 Auditable | **PASS** | All four in `AUDITABLE_FIELDS`; `DATE_FIELDS` kills the `Date`-identity false diff; the bulk audit is built from the **same** per-actor patch map that drives the write |
| NFR-7 Exactly one implementation | **PASS** | One predicate, four call sites, no second copy. Nest-free and DB-free, matching `pii-consent.policy.ts` |
| NFR-8 No hardcoded color/geometry | **PASS** | Grepped, not eyeballed: zero hex / `rgb()` / `hsl()` / arbitrary-bracket matches across all touched frontend files. `tailwind.config.ts`'s new `boxShadow` sits **inside `extend`** (default scale intact, so the `w-12`/`left-12` arithmetic is unaffected) and derives from `var(--color-border)` |

## 7. Linting & Code Quality

Lint clean in both packages. `react-doctor` **83/100** — one warning, `ActorsView` > 300 lines in `page.tsx`, pre-existing and widened by ~35 lines.

### 4R advisory sweep (advisory — does not drive the verdict)

| Lens | Finding |
|---|---|
| **Readability** | `ActorsView` remains oversized; a real but separate refactor |
| **Reliability** | `valuesEqual`'s `Date` branch is correct; the bulk audit mirrors the write by **shared object reference** rather than by re-inspection — a structural guarantee, not a coincidence |
| **Resilience** | Enum query params are validated against the same literals the selects render from, so no URL on `/admin/actors` can produce a `400`; the filter bar and its `Clear filters` escape hatch render outside every state guard |
| **Risk** | Two copies of the Tanzania offset helper (A-3) sit on the **exact semantics that caused T-9's FAIL** — the highest-drift-consequence duplication in the spec |

## 8. Design Conformance

**Conformant** to `design.md` §1–§12 and DD-1..DD-7, including the amended DD-4 (partition on missing-method-or-missing-date, per-row patch of only the missing fields, never overwriting a recorded value, `preserved` counting the fully-evidenced group).

### FR-6's two amendments — audited with suspicion, not deference

Both were authored under the Leader's direction, so both auditors were told to distrust them.

- **The final scenario text describes what the code does.** `hidden lg:block` / `lg:hidden`, sticky on the checkbox **and** Trader columns specifically, `TableSkeleton` moved to match.
- **The retained "MUST NOT truncate or drop the new columns' values silently" clause is genuinely met on both halves** — checked at source rather than accepting the amendment's own parenthetical. The Source and Consent cells carry no `truncate`, no `overflow-hidden`, no `max-w-*`; the card subtree has no clamp.
- **The amendments did not make an unmet requirement appear met.** The sticky columns were actually built — the file had zero `sticky` before — and the `md`→`lg` move is a separate, measured decision.
- **Both dated corrections in `design.md` §5 were verified against shipped code, with the first preserved byte-intact** and the second appended below it.

### Doc-side defects — 4 corrected during this validation, 3 accepted

| # | Defect | Disposition |
|---|---|---|
| 1 | **`tasks.md` T-8's "Not done if" still asserted `md`+** after the code and both other documents moved to `lg`+ | **Corrected.** The most serious of the set: a "Not done if" line *is* the completion contract, so it was describing a pattern the code deliberately does not implement. A second dated scope-correction note was appended rather than rewriting the first |
| 2 | **`design.md` §4.6 stated a falsehood** — that the four fields flow through the audit diff machinery *"unchanged"*. `AUDITABLE_FIELDS` is a hardcoded literal that had to be edited, plus `DATE_FIELDS` | **Corrected** with a note. An implementer trusting §4.6 would have shipped **NFR-6 unmet with a green suite** — no existing test asserts a *new* field appears in a diff. Same class as DD-3's banned wording |
| 3 | **`requirements.md` FR-8 claimed a future `/actors/geo` "only needs to be added to the suite's path loop"** — there is no path loop; the three paths are hand-written `describe` blocks | **Corrected.** The union-iteration half was true; the effort estimate was not |
| 4 | **`design.md` §3 still listed `/actors/geo`** among unchanged public contracts, contradicting FR-8's correction three sections away | **Corrected** |
| 5 | Both docs said `frontend/CLAUDE.md` *"is being synced separately"* — it has been | **Corrected** to past tense with what was synced |
| 6 | **`design.md` §5 mis-cites its authority for the Trader clamp**: it cites `docs/ux-ui/design.md` §9, but §9:149 reads *"scroll horizontally with sticky first column **rather than truncating data**"* — §9 argues against the clamp it is cited to support | **Accepted.** The clamp is still right and loses no data (full string in text content + `title`), but the citation is backwards |
| 7 | `design.md` §4.2's create cell is self-contradictory (*"beside the check at ~L137"* and *"inside the transaction"*) | **Accepted** — adjudicated conformant during execution |

### A root cause worth carrying to `/akili-audit`

**The `md`→`lg` retreat treats a symptom.** `docs/ux-ui/design.md` §9 specifies *"Admin sidebar → off-canvas drawer < `lg`"*, but `app/(admin)/layout.tsx:187` makes it persistent from `md`. Under the blueprint, `md` would have had the full 768px and the table may well have fit. Out of this spec's scope to fix — but that divergence is now **load-bearing on two amended requirements**, which is exactly the shape of thing an audit should catch before a third requirement leans on it.

## 9. Test Evidence Summary

No `test-report.md` — `/akili-test` never ran. Coverage was verified directly against source, which is the fallback the command prescribes.

| | |
|---|---|
| Backend | 442 tests, 37 suites. Both declared release gates green (`pii-boundary.spec.ts`, `lambda-handler.e2e.spec.ts`) |
| Frontend | 991 tests, 69 suites |
| Truth-table coverage | All 5 rows of `design.md` §4.1, plus a dedicated "never a key-presence check" block |
| Anti-vacuity | The PII suite iterates the **union** of both constants and asserts non-default **values**; the bulk mixed-batch test uses deliberately different batch values; FR-9's e2e fixture includes an evidenced `GRANTED` actor so the two filters must compose |
| Known gaps | FR-3's "no row is created" clause untested (structurally guaranteed); the `lg` breakpoint unpinned by any test (jsdom cannot evaluate breakpoints — rests on code reading plus the browser measurement) |
| Structural limits | `jest-axe` under jsdom cannot evaluate contrast, focus order, or focus visibility. Reviewers with `Read`/`Grep`/`Glob` only cannot run suites — every reviewer said so unprompted, and all run-evidence traces to the Implementer or the Leader |

## 10. Agent Guide / Constitution Impact

**PASS.** `frontend/CLAUDE.md` was updated at the close of this spec and **every new statement was verified factually true of the code** by an auditor who did not write it — including that `UsersTable.tsx` genuinely still splits at `md`, that `shadow-sticky-edge` exists in `tailwind.config.ts` and is applied to both `th` and `td` with no `border-r` remaining, that `divide-y` survives (the `border-separate` trap was **not** taken), and that the clamp lives on a block child rather than the `<td>`. No stale statement found. The parent `## Module Guides` index already lists the child and needs no change.

## 11. Remediation

Nothing blocks the archive. Ordered by risk, not by discovery.

> **Post-validation update (2026-08-04).** **R-1 and R-2 were fixed** before archive, at JuanCode's direction, as a separate bugfix outside this spec's diff. Reviewed by an independent opus lens: **PASS**, with the null-overwrite risk the fix could have introduced explicitly ruled out (the bulk partition guards the *row* on `=== null || === undefined`, so an explicit `null` reaches only rows already holding null — R-8 is unaffected). Every fix has a test verified to **fail without it** by stashing the change, not merely asserted to work.
>
> The round also grew beyond its brief in three ways worth recording, each found by a reviewer or the implementer rather than named in the original remediation:
> - **A sibling of R-2(a) on the bulk path.** `bulk-consent.dto.ts`'s `consentObtainedAt` had the identical bare `@IsDateString()`, and `bulkSetConsent` has **no** try/catch and never calls `mapPrismaError` — so a date-only value there was an *unhandled* 500, worse than the mapped one on create. Fixed. Leaving it would have shipped the worse asymmetry: one path returning a clean 400 while its sibling 500s on identical input.
> - **The transform did not mirror the convention its own comment claimed.** `value === '' ? null : value` is not `trim() || null`: a whitespace-only `'   '` still read as *changed* against a stored `null`, re-firing the FR-3 guard on a legacy actor — the same reachable bug, one space away. Now `trim() || null` in both DTOs, and the comments are true.
> - **R-1 had a second, user-visible half.** The `key` stopped the corruption, but `edit/page.tsx` never reset `error`/`loading`, so navigating from a bad id to a good one kept rendering "Could not load actor" over a successfully-resolved actor. Fixed with `setError(null); setLoading(true)`.
>
> **`IsFullInstant` and `IsNotFutureDate` now live in one shared home** (`backend/src/common/consent-date-validators.ts`) rather than being copied into the second DTO. `bulk-consent.dto.ts` already duplicated `IsNotFutureDate` "in miniature", so a copy would have made three definitions across two files — and two divergent answers to *"what is a valid instant"* is the drift class NFR-7 and DD-1 exist to prevent. The move was verified verbatim (only the `export` keyword differs) and every prior application site still carries its decorator, checked before and after — a silently dropped decorator would have weakened FR-2's future-date rejection while leaving the suite green.
>
> **Post-fix gates, Leader-measured:** backend **447/447, 37 suites** (+5 tests) with both release gates green and eslint clean; frontend **993/993, 70 suites** (+2 tests), lint clean, static export 20/20, `tsc --noEmit` showing only the pre-existing `TS2556` (R-8) and nothing from the new test file.
>
> **Recorded, deliberately not chased:** `'2026-01-15T24:00:00Z'` satisfies `@IsDateString`, the new regex, and JS parsing, but Prisma rejects hour 24 — a narrower residual 500 on the same field. Noted so the class is not mistaken for fully closed.
>
> R-3 through R-10 remain open as recorded below.

| # | Item | Severity | Why it matters |
|---|---|---|---|
| **R-1** | **J-1 — cross-actor data corruption.** `edit/page.tsx` renders `<ActorForm>` with **no `key`**; the effect never resets `loading`/`actor` when `id` changes; `ActorForm` freezes `values` in a one-shot `useState`. On a searchParams-only navigation `edit?id=A → edit?id=B` (browser back/forward — App Router does not unmount), the form holds A's values while the submit targets B: **a save writes A's data onto B.** Every field | **High** | One-line fix (`key={actor.id}`). Confirmed still open at source, not inherited from the log. **Schedule first** |
| **R-2** | **E-1/E-2 — a 500 where a 400 belongs, and a false 400.** `actor-create.dto.ts` has `@IsDateString()` with no `@Transform`/`@Type`, so `consentObtainedAt: "2026-01-15"` validates, reaches Prisma, and raises `PrismaClientValidationError` → **500**. Separately, `consentReference: ""` reads as *changed* against a stored `null`, so condition (b) fires and a legacy `GRANTED` actor is **rejected 400 on an unrelated edit** | **High** | Unreachable through the UI — but the spec states the client guard is *UX only*, and on these two inputs it is load-bearing. `actors/public-self-registration` is the declared next writer of this field. **One `@Transform` closes both** |
| **R-3** | **The four new trader types cannot be selected in the admin console.** `lib/content/roles.ts` keys `ROLES` on the original six, and **two** consumers derive from it: the Trader-type filter *and* `ActorForm`'s create/edit select. So an Admin can neither create an actor as, nor correct one to, `humanitarian` / `digital_service_provider` / `qds_producer` / `bulk_buyer`; `roleLabel` falls back to the raw string, so those actors render as snake_case | **High for the next spec** | **Not an FR-4 violation** — FR-4 is normalization-only and §11 scopes this spec to *"able to receive it."* But the ~590 workbook rows FR-4 exists to un-quarantine will import and then be undisplayable, unfilterable-by-dropdown, and unrepairable. The create/edit half was **never recorded anywhere** before this validation. `import-export/partner-profile-onboarding` inherits a larger obligation than its notes state: `roles.ts` must carry all ten types before the workbook lands. Filtering by URL (`?traderType=humanitarian`) does work — the query DTO validates as a plain string |
| **R-4** | **The 1-in-7 flaky import test** (§5) | **Medium** | Small fix. First in the follow-up, not eventual — a 14%-red suite trains people to rerun past failures |
| **R-5** | **A-3 — the Tanzania offset helper exists twice** (`ActorForm.tsx` private, `actors-admin.ts` exported), on the exact semantics that caused T-9's FAIL | **Medium** | Extract one shared helper |
| **R-6** | **NFR-5's unexamined surfaces** — T-9's `lg:grid-cols-4` fieldset density and T-10's dialog focus order (A-2, initial focus lands *below* the two new required inputs) | **Medium** | Needs a rendered look, which is now known to be cheap: these components take plain props and need neither the stack nor a login |
| **R-7** | **H-2 — deferred a third time.** The empty state says *"The registry is currently empty."* whenever no filter is set, and `?page=500` reaches it with no local control. Newly reachable because this spec moved `page` into the URL | **Medium** | The naïve clamp is known-broken (`totalPages` derives from `total`, `0` until the response lands) |
| **R-8** | **J-4 — no gate type-checks test files.** Jest runs through SWC; `npm run build` did not surface the known `TS2556` at `page.test.tsx:45` | **Low** | Decide whether `tsc --noEmit` joins the verification table |
| **R-9** | **B-2 — FR-9's enumeration query has no supporting index**, and `@@index([consentStatus])` is fully non-selective while every row is `GRANTED` | **Low** | Non-issue at 436 rows; revisit before the ~1,318-row import |
| **R-10** | Accepted doc defects #6 and #7 (§8); G-1/G-2/G-5/G-9 (importer date bounds, one message for three faults, `2026-02-30` → `2026-03-02`, Instructions prose) | **Low** | Recorded, none gating |

## 12. Archive Readiness Recommendation

**Ready to archive.**

| Criterion | Status |
|---|---|
| All required tasks `[x]` | ✅ 10/10 |
| No unresolved FAIL findings | ✅ none |
| WARNs accepted or assigned | ✅ NFR-5 accepted with instrument limits stated; every advisory carried into §11 |
| Tests cover key requirements and scenarios | ✅ with two named gaps, both non-defects |
| Drift reflected in the docs | ✅ 4 doc defects corrected during this validation, 3 accepted explicitly |
| Hard release gate | ✅ NFR-1 PASS; both gate suites green |

Two items should **not** sit in a backlog: **R-1** (a save writing one actor's data onto another) and **R-2** (a 500 on a plausible API input, plus a 400 that blocks editing legacy rows). Both are small, both are on paths the *next* spec in this epic will exercise.

**The method finding this spec should be remembered for:** four requirements reached the final task owned by no one, and every one was caught by a reviewer reading the requirement text rather than the task's scope line. In two cases the Leader had already cleared the omission from a more convenient reading. The sticky column is the sharpest instance — four documents agreed with each other and all four were wrong. **Cross-document consistency is not evidence of correctness; it is often one wrong idea copied forward.** Carried to the Kaizen retrospective.

Next: `/akili-archive docs/specs/actors/registration-source-and-consent`
