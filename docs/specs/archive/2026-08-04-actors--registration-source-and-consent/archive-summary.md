# Archive Summary — Registration Source & Consent Provenance

## 1. Document Control

| | |
|---|---|
| **Original spec path** | `docs/specs/actors/registration-source-and-consent/` |
| **Archive date** | 2026-08-04 |
| **Archive path** | `docs/specs/archive/2026-08-04-actors--registration-source-and-consent/` |
| **Depth** | Standard · **Type** Change · **Approval** gated |
| **Parent epic** | `docs/specs/epic/hybrid-actor-registration/` |
| **Commit range** | 10 task commits + validation + bugfix, ending `ea7a4cc` |

## 2. Final Status

**Complete and validated.** 10/10 tasks `[x]`, validation **PASS** with no FAIL findings, hard release gate (NFR-1, PII boundary) green.

| | |
|---|---|
| Requirements delivered | FR-1..FR-9 (9/9 PASS), NFR-1..NFR-8 (7 PASS, 1 WARN) |
| Test totals at archive | backend **447 tests / 37 suites**, frontend **993 tests / 70 suites** |
| Release gates | `pii-boundary.spec.ts`, `lambda-handler.e2e.spec.ts` — both green |
| Budget | 10 tasks / ~1,250 LOC planned. Task count held; review rounds **exceeded** the ~12 estimate (see §6) |

## 3. Requirements Delivered

| FR | What shipped |
|---|---|
| FR-1 | `registrationSource` on every actor, defaulting existing rows to `TEAM_MANAGED` (436→436 rows, sampled row byte-identical) |
| FR-2 | `consentMethod` / `consentObtainedAt` / `consentReference`, with future-date and length validation |
| FR-3 | One shared provenance invariant enforced on **all four** consent write paths — admin create, admin update, bulk set-consent, per-row import. Triggers on **value change**, never field presence |
| FR-4 | Four new trader types + source aliases for the client workbook's spellings; ambiguous values still quarantine |
| FR-5 | Template `v2` with Prisma-derived allowed-value lists, regenerated asset, per-row import enforcement |
| FR-6 | Admin table columns + two filters, form fieldset, opt-in dialog inputs, sticky first columns at `lg`+ |
| FR-7 | Public dashboard CSV carries none of the four fields |
| FR-8 | `NEVER_PUBLIC_FIELDS` covering the four new fields **plus** three that were previously prose-only |
| FR-9 | Legacy gap left deliberately visible and enumerable via `GRANTED` + `NOT_RECORDED` |

## 4. Files Changed Summary

| Area | Files |
|---|---|
| **Schema** | `prisma/schema.prisma`, one additive migration (4 `ADD COLUMN` + 1 index, no `DROP`/`MODIFY`/`UPDATE`) |
| **Backend — new** | `common/consent-provenance.policy.ts` (+ spec), `common/consent-date-validators.ts` (post-validation bugfix) |
| **Backend — changed** | `actors-admin.service.ts`, `actor-import.service.ts`, `actor-audit.service.ts`, `admin-actor.serializer.ts`, `pii-consent.policy.ts`, `common/normalize.ts`, `common/template-columns.ts`, DTOs (`actor-create`, `bulk-consent`, `admin-actor-list-query`) |
| **Frontend — changed** | `lib/api/actors-admin.ts`, `components/admin/ActorsTable.tsx`, `ActorForm.tsx`, `AcknowledgeDialog.tsx`, `app/(admin)/admin/actors/page.tsx`, `edit/page.tsx`, `tailwind.config.ts` |
| **Generated** | `frontend/public/templates/actor-import-template.xlsx` (regenerated, byte-stable, test-guarded) |
| **Constitution** | `frontend/CLAUDE.md` — per-table breakpoint rule + two sticky-column conventions |

## 5. Test Evidence Summary

`/akili-test` never ran; no `test-report.md` exists. Accepted by JuanCode, and coverage was verified directly against source during validation instead.

**What makes the evidence non-vacuous** — the property worth carrying forward:

- The PII suite derives its forbidden-key set from the **union** of `PII_ALLOWLIST` and `NEVER_PUBLIC_FIELDS` rather than a hand-maintained list, and asserts non-default **values** (not just key names) across `/actors`, `/actors/:id`, `/metrics`.
- The public serializer is a **literal 8-key pick**, so an extra field is a compile error, not a runtime leak.
- The bulk mixed-batch test uses deliberately **different** batch values, so it can actually detect an overwrite.
- FR-9's e2e fixture includes an evidenced `GRANTED` actor, so the two filters must genuinely compose.
- Every post-validation bugfix test was verified to **fail without its fix** by stashing the change.

**Known gaps:** FR-3's "no row is created" clause untested (structurally guaranteed — the throw precedes the transaction); the `lg` breakpoint unpinned by any test (jsdom cannot evaluate breakpoints).

## 6. Validation Summary

**PASS**, no FAIL findings. See `validation-report.md` for the full audit.

Two independent opus auditors split FR and NFR coverage. The Leader authored the FR-6 amendments and made the gate adjudications, so it audited neither — both auditors were briefed to treat that text with **extra suspicion rather than deference**.

Validation corrected four documentation defects and accepted three. The most serious: `tasks.md` T-8's "Not done if" line still asserted `md`+ after the code and both other documents had moved to `lg`+ — a completion contract describing a pattern the code deliberately does not implement.

**Budget tripwire exceeded, recorded rather than hidden.** The plan estimated ~12 review rounds. Actual: T-9 alone took two FAIL rounds plus an increment; T-8 was reopened after nine tasks and took a further FAIL round; T-10 took one escalated increment. The task count held at 10.

## 7. Accepted Warnings & Follow-Ups

**NFR-5 WARN** — accepted. FR-6's normative `aria-describedby` + live-region clause is met, but the measure names *"contrast per §7"*, which the gate **cannot produce**: under jsdom `color-contrast` returns *incomplete*, and `toHaveNoViolations` does not fail on incomplete. Focus order and focus visibility likewise unproven.

**Fixed before archive** (separate commit `ea7a4cc`, outside this spec's diff): R-1 cross-actor save corruption; R-2 consent-date 500-instead-of-400 and the spurious 400 on empty/whitespace `consentReference`, including the unhandled-500 sibling on the bulk path.

**Open, carried forward — highest first:**

| # | Item | Home |
|---|---|---|
| **R-3** | The four new trader types cannot be **selected** anywhere in the admin console. `lib/content/roles.ts` keys on the original six and gates **both** the filter dropdown and `ActorForm`'s create/edit select; `roleLabel` falls back to raw snake_case. **Not an FR-4 violation** (FR-4 is normalization-only), but the ~590 workbook rows FR-4 exists to un-quarantine will import and then be undisplayable and unrepairable | `import-export/partner-profile-onboarding` — **needs `roles.ts` to carry all ten types before the workbook lands** |
| **R-4** | `import/page.test.tsx` fails ~1 run in 7 (`setToken` outside `act` in an async `init()`). Root-caused; the defect is in the harness, not shipped behaviour | First in the follow-up. A 14%-red suite trains people to rerun past failures |
| **R-5** | The Tanzania offset helper exists twice, on the exact semantics that caused T-9's FAIL | Extract one shared helper |
| **R-6** | NFR-5's two unexamined surfaces: T-9's `lg:grid-cols-4` density, T-10's dialog focus order (A-2) | Now known to be cheap — these components take plain props and need neither the stack nor a login |
| **R-7** | H-2, deferred three times: the empty state claims "The registry is currently empty" for any `?page=` beyond the result set. Newly reachable because this spec put `page` in the URL. The naïve clamp is known-broken | Follow-up |
| **R-8** | No gate type-checks test files; a known `TS2556` survives in `page.test.tsx` | Decide whether `tsc --noEmit` joins the verification table |
| **R-9** | FR-9's enumeration query has no supporting index; `@@index([consentStatus])` is non-selective while every row is `GRANTED` | Revisit before the ~1,318-row import |
| **R-10** | `'2026-01-15T24:00:00Z'` residual 500; importer date lower bound; one error message for three distinct faults; Instructions-sheet prose omits the two new dropdown columns (G-9) | Low |
| **A-3** | **Root cause behind the `md`→`lg` retreat:** `docs/ux-ui/design.md` §9 specifies the admin sidebar as off-canvas below `lg`, but `layout.tsx` makes it persistent from `md`. Under the blueprint `md` would have had the full 768px. **Now load-bearing on two amended requirements** | `/akili-audit` |
| **A-4** | TRD documents `/actors/geo` across five sections as though implemented; it does not exist | `/akili-audit` (pre-dates this spec) |

## 8. Historical Notes

**What this spec should be remembered for.**

Four requirements reached the final task owned by **no task at all**. Every one was caught by a reviewer reading the requirement text rather than the task's scope line, and in two cases the Leader had already cleared the omission from a more convenient reading before retracting it.

The sharpest instance is FR-6's sticky first column, found after nine tasks had executed. It went unowned because the requirement's GIVEN was unsatisfiable as written — below `md` there is no table — and **the same false premise sat in four places that all agreed with each other**: `requirements.md` FR-6, `design.md` §5, `tasks.md` T-8, and `docs/ux-ui/design.md` §9.

> **Cross-document consistency is not evidence of correctness. It is often one wrong idea copied forward.**

Two more patterns worth keeping:

- **A green test can certify nothing.** T-8's Trader-cell clamp shipped as a **no-op** — `truncate` supplies `white-space: nowrap`, which raises a cell's min-content width to the full string and floors `max-width` out — while its class-presence test stayed green and no ellipsis rendered. Caught only by sending the *justification* back to be tested rather than accepted. The same shape recurred in `design.md` §4.6, which described a hardcoded list as automatic machinery.
- **A "blocked" gate was not blocked.** T-8 sat at `[~]` for a day on a human visual check believed to need an authenticated admin session. `ActorsTable` takes plain props; a throwaway harness rendered it with no stack and no login, and the check produced **two real fixes** within the hour. Presentational components should never be deferred on auth grounds again.

**Deviations disclosed, not hidden:** the migration was rehearsed on shared dev RDS rather than local MySQL (B-1, stronger ground than the measure required); FR-7's and FR-8's scope corrections both name endpoints that do not exist, verified independently twice each; every reviewer stated unprompted that its `Read`/`Grep`/`Glob` harness cannot run a suite, so all run-evidence traces to an Implementer or the Leader.
