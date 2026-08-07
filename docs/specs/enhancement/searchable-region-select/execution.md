# Execution Log — Searchable Region Select

## Document Control

- Spec path: `docs/specs/enhancement/searchable-region-select/`
- Started: 2026-08-06
- Orchestration: AKILI Leader → Implementer → Reviewer, via the Step 8E wrappers (`.claude/agents/akili-implementer.md`, `akili-reviewer.md`) so `author ≠ auditor` is enforced by configuration rather than by convention.
- Budget (`design.md` §11): **6 tasks · ~820 LOC · 7 review rounds.** Running actuals tracked per entry below.
- Judgment Day: `judgment.md` — `APPROVED ✅`, 2/2 rounds, before execution began.

### Budget tracking

| | Budgeted | Actual so far | Δ |
|---|---|---|---|
| Tasks complete | 6 | 2 | — |
| LOC | ~1,530 (re-baselined 2026-08-06; was ~820) | 1,051 | — |
| Review rounds | 7 | 3 (9 lens reviewers) | — |

**Rework attempts are tracked per task and are not consumed by environment failures.** T-2 currently stands at **0 of 3** attempts despite one dispatch — see its entry below.

---

## Task Execution History

### T-1 — Pure region matcher + unit tests · **PASS** (attempt 1 of 3)

- **Date:** 2026-08-06
- **Implementer attempts:** 1
- **Requirements covered:** FR-1 (the "Narrowing by substring" scenario's matching clauses: substring-not-prefix, case-insensitivity, diacritic folding, whitespace trim) + T-1's "empty query returns all inputs". `design.md` §5.4. NFR-4.
- **Leader's skill/effort selection:** skill `tdd`, effort `medium`. `tdd` assigned deliberately, not by default — this is a pure function whose expected values are stated exactly in FR-1's scenarios, which is where red→green earns its cost. No deviation from the task's listed skills.
- **Exemplar cited in the brief:** `frontend/lib/dashboard/aggregate.ts` + `aggregate.test.ts` (pure functions, no React/fetch/IO, spec-tracing doc header, co-located test).

#### Attempt 1

- **Files changed:** `frontend/lib/text/fold-search.ts` (new, 35 lines), `frontend/lib/text/fold-search.test.ts` (new, 72 lines)
- **TDD evidence:** test file written first; run confirmed RED (`Cannot find module './fold-search'`); implementation written; re-run GREEN.
- **Implementer verification:**
  ```
  $ cd frontend && npm test -- --silent --testPathPatterns fold-search
  Test Suites: 1 passed, 1 total
  Tests:       7 passed, 7 total
  ```
  Plus `npx next lint --file lib/text/fold-search.ts --file lib/text/fold-search.test.ts` → "No ESLint warnings or errors."
- **Implementer `Not Done / Assumptions`:** scope complete. One shape choice recorded: the export is `matchesQuery(candidate, query)`, a per-candidate predicate rather than a list filter, per T-1's wording "one exported pure predicate". Reviewer independently confirmed this composes into `design.md` §5.4's `Array.filter` at T-2 and hides no gap.
- **Reviewer verdict:** `STATUS: PASS`
- **Reviewer summary:** The helper implements `design.md` §5.4 exactly (NFD + combining-mark strip + lowercase + trim + `includes`), and every FR-1 matching clause owned by T-1 has a named test. The disqualification clause is cleared by two genuinely mid-string assertions, and the diacritic test's NFD claim was verified against the file's actual bytes.

#### What the Reviewer actually verified (not merely restated)

The three checks the Leader asked for, because a green `7/7` proves none of them:

1. **The disqualification clause is genuinely cleared.** `matchesQuery('Kaskazini Pemba', 'Pemba')` matches at index 10 and `matchesQuery('Kusini Pemba', 'Pemba')` at index 7 — **both fail under a `startsWith` implementation**, so the suite discriminates prefix-only from substring rather than passing vacuously. The negative case (`'Dodoma'` vs `'Pemba'` → false) additionally blocks a trivially-true implementation.
2. **The diacritic comment is not a KZ-008 defect.** The Reviewer checked bytes, not glyphs: `\x{0301}` matches only the string literal (genuine decomposed NFD, as the comment claims), while `\x{00FA}|\x{00ED}` matches only the comment's own rendering. The comment asserts a property the literal actually has.
3. **FR-1's `BUT it must NOT perform any network request` is T-2's, not a gap here** — `tasks.md`'s Coverage Closure table assigns it explicitly. No clause was discharged by citing a different one (KZ-001).

#### ADVISORY (4R lens — non-gating, recorded and closed here; never becomes a task in this spec)

1. **Reliability — one-directional diacritic proof.** Folding is proven only for an accented *query* against an unaccented candidate; an accented *candidate* is untested. `fold()` applies to both sides so it would pass, and every string in `regions.ts` is pure ASCII, so it is currently unreachable. T-1's clause list names only the query direction — not a gap.
2. **Readability — NFC comment vs NFD literal.** The comment's quoted `'Kúsíní'` is precomposed while the literal below it is decomposed. The comment's claim about the literal is true and `fold()` handles both identically, so behavior is unaffected; a reader copy-pasting from the comment would get a different byte sequence.
3. **Audit hygiene — directed at the Leader, not the code.** The diff the Leader transported into the review brief was not byte-identical to disk (combining marks escaped for transport; section-bar comments omitted). Nothing material differed and the Reviewer audited the files on disk instead, but **a paraphrased diff is not the artifact the checkbox certifies.** *Leader's response: accepted. From T-2 onward the diff goes into the review brief verbatim, or the Reviewer is pointed at the working tree explicitly.*

#### Decisions

- Advisory 1 and 2 recorded and **not** actioned — per the Advisory Never Becomes A Task rule, an advisory may not mint new work or widen an approved task. Neither affects behavior; if either ever matters it must arrive as a proposal, not as scope smuggled into this spec.
- Advisory 3 changes **Leader process**, not spec scope, so it is adopted immediately for T-2.

#### Issues encountered

None. First-attempt PASS, no rework, no pivot, no budget escalation.

#### LOC vs. budget

T-1 was budgeted ~70 LOC (helper ~25, tests ~45); actual is **107** (35 + 72), **+37**. Recorded rather than escalated: the overage is 4.5% of the spec's ~820-line budget and is concentrated in test coverage and doc headers the exemplar convention requires. **Watch item** — if T-2 (budgeted 420) overshoots by a comparable proportion, the spec-level tripwire fires and this run stops for the user.

---

### T-2 — `SearchableSelect` primitive · **BLOCKED (environment)** · attempts consumed: **0 of 3**

- **Date:** 2026-08-06
- **Status:** `[~]` — dispatched, blocked before any work was produced. **Not a HALT, not a FAIL, not a Pivot.**

#### What happened

The Implementer was spawned once through the Step 8E wrapper (`akili-implementer`, model `sonnet`/T2, effort `xhigh`). It terminated before writing any file, reporting:

```
You've hit your session limit · resets 11:10pm (America/Bogota)
```

This is the `/akili-execute` **runtime-failure** case — a harness/environment blocker, not a work outcome. Per that rule it does **not** consume a rework attempt, and the 3-attempt ceiling for T-2 remains fully intact at 0 of 3.

#### Tree state verified by the Leader before recording

Checked inline, not assumed:

- `frontend/components/ui/` contains only the pre-existing `Button.tsx`, `Skeleton.tsx`, `StatCard.tsx`, `StatCard.test.tsx`. **No `SearchableSelect.tsx` or `SearchableSelect.test.tsx` was created.**
- `@testing-library/user-event` is **still absent** from `frontend/package.json` — the OQ-2 prerequisite was never installed.
- `git status` shows no change attributable to this dispatch. The only modification to this spec's files is the Leader's own `[ ]` → `[~]` transition in `tasks.md`.

**No rollback was required** and none was performed. There is no partial or broken code in the working tree. A future attempt starts from a clean slate, not from a resume.

#### Pre-existing unrelated modifications (not from this spec)

`backend/src/lambda.ts` and `frontend/app/(public)/layout.tsx` were already modified in the working tree when this run began, and `.codegraph/.gitignore` was untracked. They are outside T-2's file scope, were not touched by this dispatch, and remain uncommitted. They are recorded here because any diff extracted for a future T-2 review must be scoped to T-2's own files rather than taken as a whole-tree diff.

#### Leader's decision

No inline fallback was taken. The `/akili-execute` runtime-failure table permits the Leader-inline Implementer path only with explicit user approval, and it would not have helped regardless: the exhausted quota belongs to the session, so the Leader shares it. Retrying the spawn immediately was also declined as futile — a usage ceiling does not clear on retry the way a transient spawn error does; it clears on the stated reset.

The task is parked at `[~]` with this entry as its full state. T-2's brief is reproducible from `tasks.md` and needs no reconstruction from this log.

#### Skill and effort selection (recorded now so the retry does not re-derive it)

- **Skills:** `frontend-design`, `tailwind-design-system`, `vercel-react-best-practices`, then `react-doctor` before reporting. No deviation from the task file's list.
- **Effort:** `xhigh`. Selected because a hand-rolled ARIA state machine plus the FR-3 value boundary is the effort dial's *complex / ambiguity* row. `max` was ruled out by the tier↔effort rule — the Implementer is T2, and a cheaper tier is never run at `max`; the tier would have to be escalated instead.
- **Review mode:** `xhigh` selects **parallel lens reviewers** rather than the single lens-checklist Reviewer. Planned as 3 lens-scoped Reviewers on `opus`/T3, each receiving the same diff plus baseline spec conformance: (1) the FR-3 / keyboard state machine, (2) the ARIA and live-region contract, (3) evidence quality against T-2's four pre-declared disqualification clauses.
- **Exemplar cited in the brief:** `frontend/components/admin/AcknowledgeDialog.tsx` + `AcknowledgeDialog.test.tsx` — the closest existing shape (interactive overlay, `'use client'`, spec-trace header, enumerated ARIA doc block, keyboard handling, live region, co-located test). Secondary: `frontend/components/ui/StatCard.tsx` for `components/ui/` family conventions.

#### Issues encountered

One, external: session quota exhaustion mid-dispatch. No spec defect, no design ambiguity, and no evidence bearing on whether T-2's approach is sound — that question remains entirely unanswered.

---

### T-2 — `SearchableSelect` primitive · attempt 1 · **IMPLEMENTED, REVIEW NOT YET RUN** · **BUDGET TRIPWIRE FIRED**

- **Date:** 2026-08-06
- **Status:** `[~]` — code exists and self-verifies, but **no Reviewer has audited it**. The task is not `[x]` and must not be until a Reviewer PASS is recorded above the checkbox.
- **Dispatch:** second spawn of `akili-implementer` (`sonnet`/T2, effort `xhigh`) after the quota blocker above. Brief was the compact pointer form — the worker read `tasks.md` T-2, this log's blocked entry, `requirements.md`, and `design.md` from disk rather than receiving them as Leader output.

#### Files changed

| File | Lines | Note |
|---|---|---|
| `frontend/components/ui/SearchableSelect.tsx` | 405 (new) | budgeted ~250 |
| `frontend/components/ui/SearchableSelect.test.tsx` | 415 (new) | budgeted ~170; 36 tests |
| `frontend/package.json` | +1 | `@testing-library/user-event` in **devDependencies** only |
| `frontend/package-lock.json` | regenerated | `npm install` side effect, not hand-edited |

Line counts independently re-measured by the Leader with `wc -l` after the worker reported (never beside it) and match the Implementer's own figures exactly. The `package.json` diff was read directly: one insertion, positioned inside the `devDependencies` block. **`dependencies` is byte-identical — NFR-3 holds.**

#### Implementer verification — verbatim

```
$ cd frontend && npm test -- --silent --testPathPatterns SearchableSelect
Test Suites: 1 passed, 1 total
Tests:       36 passed, 36 total
Snapshots:   0 total
Time:        1.582 s, estimated 3 s
```

```
$ grep -nE "#[0-9a-fA-F]{3,6}|rgb\(|bg-\[" components/ui/SearchableSelect.tsx
(no output, exit 1)
```

```
$ cd frontend && git diff --stat package.json
frontend/package.json | 1 +
1 file changed, 1 insertion(+)
```

Supporting evidence the Implementer volunteered: `grep -n "onChange(" components/ui/SearchableSelect.tsx` returns **exactly 2 hits**, both `onChange(option.value)` — the grep-verifiable form of the FR-3 / DD-2 "two call sites" clause. `react-doctor` scored 97/100 with no issues on the changed files.

#### The task's literal lint command does not execute in this repo

T-2's verify block specifies `npx eslint "components/ui/SearchableSelect.tsx" --quiet`. It fails at the tooling level, repo-wide and unrelated to this diff:

```
ESLint: 9.39.4
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
From ESLint v9.0.0, the default configuration file is now eslint.config.js.
```

The repo ships only a legacy `.eslintrc.json` while ESLint 9.39.4 defaults to flat config. **T-1 hit the identical wall** and also substituted `npx next lint --file …`. The Implementer reported the raw failure verbatim rather than silently swapping the command, and ran two working equivalents:

- `ESLINT_USE_FLAT_CONFIG=false npx eslint "components/ui/SearchableSelect.tsx" --quiet` → exit 0, zero errors
- `npx next lint --file components/ui/SearchableSelect.tsx --file components/ui/SearchableSelect.test.tsx` → `✔ No ESLint warnings or errors`

The second run caught a genuine `react-hooks/exhaustive-deps` warning on the first pass (`renderedOptions` unmemoized while used as a `useCallback` dependency), fixed by wrapping `matchedOptions`/`renderedOptions` in `useMemo`. **The substituted command found a real defect, so it is not a weaker gate in this instance** — but the recurrence across two tasks makes this a spec-level defect in the verify blocks, not a one-off. **This is the KZ-002 recurrence shape extended to documents: a procedure carrying every required clause can still be unexecutable.** It is recorded here for Kaizen; correcting the remaining tasks' verify commands is a spec edit, not something to smuggle into T-2.

#### Implementer's design decisions (recorded — these are shape choices, not new scope)

1. `clearOptionLabel` is prepended to the options array as an ordinary option riding the same two commit call sites, rather than getting its own code path. **This is what keeps "exactly two `onChange(` call sites" literally true** rather than true-with-an-exception.
2. In the no-match state the listbox renders one non-interactive `<li role="option" aria-disabled="true">` carrying the message, instead of swapping to a `<p>` outside the listbox — an empty `<ul role="listbox">` is itself an axe `aria-required-children` violation, which the Implementer hit and fixed. The row is excluded from `renderedOptions`, so it can never become the active descendant or a commit target.
3. `aria-controls` is set unconditionally whenever `isOpen`, including the no-match state, because axe's `aria-required-attr` requires it whenever `aria-expanded="true"` on a combobox. Decision 2 makes the reference always valid.
4. Clicking the closed input opens the popup, not only `ArrowDown`. Not required by any FR-2 scenario and not contradicted by one; justified for the touch audience this spec exists to serve.

Decisions 2 and 3 are **coupled** — 3 is only sound because 2 guarantees a listbox always exists while open. A reviewer evaluating either in isolation would miss that dependency.

#### KZ-007 interaction, as reasoned by the Implementer

Blur-reverts-and-closes (FR-2) and pointer-commit-must-survive-blur (JD-8) are reconciled **by scope rather than by an ordering hack**: `preventDefault()` on the popup's `mousedown`/`pointerdown` stops the browser shifting focus at all on a pointer commit, so `handleBlur` never fires on that path. It fires only for `Tab`, genuine outside clicks, and not for `Escape` (which closes via keydown). No document-level click-outside listener exists or is needed, because DD-4 keeps focus on the input for the component's entire lifetime except through those paths.

**This claim is exactly what the lens Reviewers must attack, not accept.** It is the single most load-bearing correctness argument in the task and it is currently asserted by its own author.

#### `Not Done / Assumptions` — carried verbatim per the Leader's Step 2.3 obligation

> - **Budget: materially over.** Component is 405 lines (budgeted ~250, +62%) and tests are 415 lines (budgeted ~170, +144%). Combined 820 vs. the task's ~420 line target, +95%. I did not cut required coverage to hit the number — every owned clause, both disqualification-clause checks, and the KZ-007 interaction are covered — but this is a real, reportable overshoot on top of T-1's own +37 lines (53%), and it eats into the spec-level ~820 total budget on its own. Flagging per your "live tripwire" note rather than quietly proceeding.
> - The T-2 verify block's literal `npx eslint ... --quiet` command does not run in this environment due to a pre-existing ESLint 9 / `.eslintrc.json` mismatch (not something I introduced) — I substituted `ESLINT_USE_FLAT_CONFIG=false npx eslint ...` and `npx next lint --file ...` (both zero warnings/errors) and reported the raw command's failure verbatim above rather than silently swapping it.
> - Scope was held to exactly the three files in the brief; I did not touch `RegistrationForm.tsx`, `DirectoryFilters.tsx`, or `FilterControls.tsx` (T-4/T-5's job), and the popup remains plainly `absolute`-positioned per the brief's explicit scope boundary (T-3 owns the portal).

**Leader's adjudication of that field:** none of the three items is *scope still owed*. The first is a budget report, the second a tooling deviation with the failure disclosed, the third an affirmative confirmation that scope was held. The Step 2.3 rule exists to catch omitted work, and no work was omitted. **T-2 therefore remains eligible for review — but not for `[x]`, which requires a Reviewer PASS that does not yet exist.**

#### BUDGET TRIPWIRE — escalated to the user, run paused

`design.md` §11 budgets **~820 LOC for all six tasks**. Actuals after two tasks:

| | Budgeted | Actual | Δ |
|---|---|---|---|
| T-1 | ~70 | 107 | +53% |
| T-2 | ~420 | 820 | +95% |
| **Running total (2 of 6 tasks)** | **~490** | **927** | **+89%** |
| Remaining at budget (T-3 140 · T-4 80 · T-5 110) | ~330 | — | — |
| **Projected spec total** | **~820** | **~1,257** | **+53%** |

**T-2 alone consumed the entire six-task budget.** The projection above is optimistic — it assumes T-3, T-4 and T-5 all land exactly on estimate, which neither completed task has done.

Per `/akili-execute`'s Budget Tripwire the run **stops here for the user** rather than continuing on the assumption that finishing is what was wanted. Escalated before spawning the lens Reviewers, deliberately: three `opus` lens reviews over 820 lines is itself a material cost, and if the user's answer is to re-scope T-2 it would be spent on code that is about to change.

**Leader's reading of the cause:** this looks like a mis-estimate rather than a bloated implementation. The overshoot is concentrated in tests (+144%) over component code (+62%), and the test volume is what this spec's own standing rules demand — 9 owned clauses each needing a named test, 6 axe states, four pre-declared disqualification checks, and a KZ-007 interaction case. `design.md` §11 was already re-baselined once during Judgment Day (+70 primitive / +20 tests) and still under-called it. **That does not make the number wrong to enforce** — a budget that bends silently on contact is not a tripwire, and the user owns the decision to scale work down.

**No review round has been consumed.** T-2 stands at 1 Implementer attempt, 0 of 2 budgeted review rounds.

**User decision on the tripwire (2026-08-06):** review first with the full 3-lens panel, then re-baseline `design.md` §11 with the Reviewers' input on whether the 820 lines are necessary coverage or redundancy. Recorded because it changes the order of operations, not the budget: §11 has **not** been amended, and any amendment must be a deliberate, caused edit rather than a silent accommodation of the actual.

#### Review round 1 — parallel lens panel (`opus`/T3 × 3, per the `xhigh` effort selection)

Diff transport: both component files are **new and untracked**, so no "before" state exists and the working tree *is* the diff byte-for-byte. The Reviewers were pointed at the paths directly rather than handed a Leader-transcribed diff — which is the second of the two options T-1's Advisory 3 committed the Leader to ("the diff goes into the review brief verbatim, **or** the Reviewer is pointed at the working tree explicitly"). The one-line `package.json` change was inlined, since that file *does* have a before state.

Each lens received baseline spec conformance plus one deep territory, and each was told explicitly that the inline popup is correct for T-2 and that flagging the missing portal would be a reviewer scope error (T-3 owns it).

##### Lens 2 — ACCESSIBILITY & RESILIENCE · **`STATUS: FAIL`** · 2 issues

**Issue 1 — the doc comment's genericity claim is false (KZ-008).**
`SearchableSelect.tsx:16-18` asserts the component has no domain knowledge except the caller-overridable `noMatchLabel` default. The code carries **three** region-word literals: that default (line 126, replaceable) **plus** the two live-region count strings at lines 183-185 (`'1 region available'` / `` `${n} regions available` ``), which are unconditional and **unreachable from the public prop surface**. A caller reusing the primitive for the crop or trader-type select — which requirements §6 explicitly contemplates as "a mechanical follow-up spec" — gets `3 regions available` announced for crops with no prop to fix it, while the comment tells the next maintainer no such leak exists.

*The code is not the defect.* `design.md` §5.3's announcement table mandates those exact strings, so the Implementer had no choice. **The defect is the claim built on top of them** — the same shape §5.3's own `Home`/`End` subsection was written to prevent. Violated: `design.md` §5.1 ("'region' appears nowhere inside it") read against §5.3's mandated strings, and `tasks.md` T-2 clause line 51.

Remediation is **comment-only**: state that three region-word literals exist, that two are non-overridable because §5.3 fixes their wording, and why. **Do not change the strings and do not add a prop** — §5.3 fixes the wording and a new prop is outside T-2.

**Issue 2 — two of FR-6's three conjoined properties have no named test.**
`tasks.md:50` states the clause as "a **separate**, **visually-hidden** `aria-live="polite"` region emitting exactly …". Only the third is asserted.

The Reviewer *demonstrated* rather than asserted this: **delete `sr-only` from `SearchableSelect.tsx:400` and all five FR-6 tests still pass**, while `2 regions available` renders as visible text under the input, changing on every keystroke, on `/register` and both public filter surfaces. Separately, `document.querySelector('[aria-live]')` and `screen.getByRole('option')` are never proven to be distinct nodes — if a future edit collapsed the live region onto the visible no-match `<li>`, every existing assertion would still pass, leaving §5.3's "the visible `noMatchLabel` element is **not** the live region" ungated.

Violated: `tasks.md` T-2 clause line 50 and its Done-when at line 54 ("every clause above has a named test"); `design.md` §5.3. Remediation: assert `sr-only` presence with the KZ-002 disclosure comment, and assert the two nodes are distinct.

##### Lens 2's "verified clean" list — carried so rework does not churn what already holds

The Reviewer verified and explicitly cleared: all three announcement strings byte-for-byte incl. the zero case as an explicit condition (never `0 regions available`); `aria-live="polite"` rendered unconditionally so the region exists before its first update; JD-2/DD-3 (`aria-invalid` present-when-invalid/absent-when-clean matching `RegistrationForm.tsx:541`, no message rendered, gated by a `queryByRole('alert')` negative); JD-11's `Home`/`End` record, checked as *precise* — the code preventDefaults only under `if (isOpen)` and the comment scopes the loss to "while the popup is open"; the D5 contrast disclosure in both required places; the D8 disclosure on the live-region test; all 6 axe states genuinely reaching distinct renders; **token choice** not merely hex-absence — `inputClasses` byte-identical to `RegistrationForm.tsx:451-456` apart from `error`→`invalid`, and `duration-fast`/`ease-out` confirmed to resolve to the project tokens via `tailwind.config.ts:73-76`'s `extend` rather than Tailwind stock; NFR-5's presence-only disclosure; NFR-4 (no `setTimeout`, no debounce); and the ARIA structure incl. the no-match row's unreachability as active descendant or commit target.

##### Lens 2 ADVISORY (recorded, non-gating, **not** actioned — see Leader ruling)

1. **JD-13 — the WCAG citation at `SearchableSelect.tsx:381` is wrong.** The comment cites `WCAG 2.5.8` for a 44px touch target. 2.5.8 *Target Size (Minimum)* is **WCAG 2.2** AA and requires **24×24** CSS px; the 44×44 figure is WCAG 2.5.5 (2.1, Level **AAA**) and platform HIGs. This project's bar is WCAG 2.1 AA. The Reviewer correctly did **not** gate: the Implementer faithfully quoted an approved document, so **the defect is upstream in `design.md` §9 row 1**, which `tasks.md:121` already tracks as JD-13.
2. FR-6's "only on count change" mechanism is sound (React skips the `textContent` write when a host element's single string child is unchanged) but rests on the untested invariant that the live-region span has **exactly one** string child; a second child or an interpolated space kills it with no failing test.
3. The axe runs never exercise the `labelledBy` path — `renderControl()` supplies a `placeholder`, which satisfies `aria-input-field-name` on a native text input, so the composed-label path is unexercised. Legitimately T-4/T-5 coverage; flagged so T-2's green axe run is not assumed to cover it.
4. `options.find` fallback at line 170: if `value` is set but absent from `options`, the closed control shows the placeholder while a value is committed. Reachable at `FilterControls`, whose dynamic subset can shrink under an active filter. **T-5's concern.**
5. **T-3 hazard:** the `open`/`filtered`/`no-match` axe runs pass RTL's `container`. Once the popup portals to `document.body` (DD-5), `container` no longer contains it and those three runs **silently stop covering the listbox while staying green**. T-3 must re-target them or NFR-1's evidence degrades without failing.

**Leader ruling on Advisory 1.** The Reviewer suggested folding the JD-13 comment fix into this rework "since the file is being reworked anyway." **Declined.** *Advisory Never Becomes A Task* forbids both minting new work from an advisory and **widening an existing task to absorb one** — and the cheapness of the fix is precisely the argument the rule exists to refuse, since every scope leak is locally cheap. The defect is in `design.md` §9 row 1, not in this diff; correcting it is a spec edit that belongs to the user's decision, not to T-2's rework brief. Advisories 2–5 are recorded and likewise not actioned here; 5 is the most consequential and must reach T-3's brief as *inherited context*, which is transport of an existing finding, not new scope.

##### Lens 1 — CORRECTNESS & RELIABILITY · **`STATUS: FAIL`** · 1 defect + the test gap that hides it

**The Implementer's JD-8 / KZ-007 argument survived attack.** This is recorded first because it is a positive result, and because it is what makes the actual finding credible. The Reviewer was told to break the claim that blur-reverts and pointer-commit-survives-blur are reconciled by scope rather than by an ordering hack, and tried four ways — outside click with no document listener (browsers move focus to `body` and fire `blur`; `user-event` replicates it; `design.md` §5.2 explicitly endorses the reduction), popup surviving a genuine focus departure (the only outside element that cancels `mousedown` is another `SearchableSelect` popup, unreachable without first blurring this one), press-inside/release-outside drag (no blur, no commit, matches native), and popup-scrollbar click (correct). **All four failed. The argument holds.** The Reviewer then found the defect somewhere else entirely.

**Issue 1 — the committed label leaks into `searchText` on the first keystroke after a commit; typing stops filtering.**

Two individually-correct constraints, defect living exactly between them — the KZ-007 shape, found by the lens assigned to hunt it:

```
:171   const displayValue = isOpen ? searchText : committedLabel;
:206   setSearchText(event.target.value);
```

**Leader independently confirmed both lines by reading the file** — brief preparation, not re-review: a mis-transmitted mechanism produces a wrong fix.

The input is a stateful editable element, not a derived view. Sequence, ordinary and reachable at all three adoption sites: user commits `Dodoma` → `isOpen` is `false` so React writes `"Dodoma"` into the DOM node, while **DOM focus deliberately stays on the input** (DD-4/JD-8 — the entire point of the pointer-commit guard) → user types `k` → the `input` event carries `"Dodomak"` (or `"kDodoma"`/`"Dodkoma"` depending on where React's `resetAfterCommit` leaves the caret; the position varies, the leak does not) → the whole string becomes `searchText` → `matchesQuery` finds nothing → the user sees **"No regions match" against a full, valid 31-region list**, in a control whose entire purpose is making that list searchable.

A second path reaches the same state: `Tab` in (browsers select-all on tab-focus), press `Home`/`End`/`ArrowUp` while closed — none are intercepted when `!isOpen`, so the browser collapses the selection — then type.

The common paths work only by accident of two unrelated protections: tab-focus select-all, and `handleClick`'s `searchText` reset. **Neither covers the post-commit path, because a commit changes no focus and fires no click.**

*Violated:* `design.md` §5.2 (`searchText` is "what the user has typed"; here it is assigned a label the user did not type, breaching the two-state separation in the **value→searchText** direction), §5.3's `printable chars` row ("Filter; reset `activeIndex` to the first match"), and `requirements.md` **FR-1** Description ("MUST let a user narrow the region list by typing"). **FR-3 itself is *not* violated** — no non-canonical string can reach `onChange`; the leak runs the other way. The Reviewer was explicit about that distinction rather than inflating the finding.

*Remediation (Reviewer's, adopted):* do not treat `event.target.value` as `searchText` when the control was closed — in `handleChange`, when `!isOpen`, derive from `(event.nativeEvent as InputEvent).data`, falling back to `event.target.value` when `data` is `null`, which preserves today's paste/autofill behavior so the existing FR-3 tests confirm it. Acceptable alternative: `readOnly` while `!isOpen`, provided the click / `ArrowDown` / printable-char open paths survive. **Selecting the label's text on commit is explicitly not sufficient** — it papers over the post-commit path and leaves the `Tab`-then-caret-move path intact.

**Issue 2 — no test commits and then types, so the suite is structurally blind to Issue 1.**

Every FR-1 filter test (lines 69–122) starts from `user.click(input)`, which resets `searchText` via `handleClick`. The JD-8 pointer-commit test (:233) and the `Enter` test (:161) both end at the commit and assert nothing after it. The suite proves each constraint in isolation and never drives the sequence in which they interact.

*Violated:* `tasks.md` T-2 Done-when ("every clause above has a named test") against §5.3's `printable chars` row, and `requirements.md` §4.1 defect class **D1**, which assigns wrong keyboard/state semantics to `npm test` as an *adequate* gate — adequate only if the sequence is driven. *Remediation:* a named test that commits via **both** paths (`Enter` and pointer — they leave the caret in different places), then types one character **without re-clicking**, asserting the list narrows and the input shows only what was typed. **It must fail against the current implementation before the fix, or it is not evidence.**

##### Lens 1 also verified clean

The two `onChange(` call sites are real and exhaustive (`:195` in `commitOption`, `:270` in the `Enter` case) and the count is *meaningful* — `clearOptionLabel` is prepended into `renderedOptions` at `:165` and reaches both sites through the same paths, with no third route. `matchesQuery` argument order matches `fold-search.ts:31`. The Decisions 2+3 coupling holds: the `<ul>` renders unconditionally while open so `aria-controls` always resolves; the no-match `<li>` carries no `id`, is excluded from `renderedOptions`, and `Enter` finds `undefined`. No-match boundary arithmetic is safe (`End` → `-1`, `ArrowDown` clamps to `-1`, both yield `undefined` — no crash, no phantom commit). No `fireEvent.keyDown` anywhere. The keyboard tests are **not vacuous** — the Reviewer checked each would fail against a plausible break: the `Enter`-does-not-submit test would fire `onSubmit` without the `preventDefault`, the JD-8 test would lose the commit without the popup's `preventDefault`, and the no-wrap test presses `ArrowUp` twice from index 1. **The autofill `fireEvent` exception is sound, not a dodge** — Chrome's autofill dispatches `input`/`change` with no key events, so `fireEvent.change` through the native setter *is* the real code path and `user.type` would have been weaker evidence.

##### Lens 1 ADVISORY (recorded, non-gating, not actioned)

- **A1** — `SearchableSelect.test.tsx:137` is named "…without wrapping" but only presses the **top** boundary; the bottom (`ArrowDown` at last) is untested. The code at `:239` is correct, so this is coverage, not a defect — but a name asserting a property half-untested is the KZ-008 shape in miniature.
- **A2** — with `clearOptionLabel` set, three `role="option"` rows render while the live region says `2 regions available` (`liveMessage` counts `matchedOptions`, not `renderedOptions`). Reviewer reads this as correct — "All regions" is an affordance, not a region — but undocumented, and **T-5 adopts both filter sites with that prop set**.
- **A3** — `Enter` is `preventDefault`ed even when closed (`:266`), removing implicit form submission from that field. T-2 is conformant (§5.3's `Enter` row and the doc comment cover it), but a native `<select>` *does* submit on `Enter`, so this is a behavior change at `/register` — **FR-4's "preserving every behavior the field has today" makes it T-4's territory.** Route it there rather than let it be rediscovered.
- **A4** — the `fetch` spy at `:91-101` is restored without `try/finally`; one failed expectation would leave every later test running against the stub, turning one failure into a cascade.
- **A5** — no test clicks genuinely non-focusable outside content; both blur tests depart via a focusable `<button>` or `Tab`. The "click outside" leg is the one the no-document-listener argument specifically rests on, and it is covered only by proxy.

Method note: the Reviewer ran no commands, per its read-only contract. Every finding is from static reading — which is what makes Issue 1's confirmation by the Leader worth the two lines it cost.

##### Lens 3 — EVIDENCE QUALITY, COVERAGE CLOSURE & SCOPE · **`STATUS: FAIL`** · 2 clause-level evidence gaps

**All four pre-declared disqualification clauses: NOT TRIGGERED.** Adjudicated individually.

- **Clause 1 (axe without the `color-contrast: incomplete` caveat)** — clear. The caveat appears in three independent places, including the `describe` **title** at `:377`, so it prints in the runner output and *travels with the evidence* rather than sitting in a file nobody reopens. The Reviewer called that the right placement.
- **Clause 2 (`motion-reduce:` overclaimed)** — clear. Describe block and component comment both say presence-only.
- **Clause 3 (FR-3 via blur only)** — clear. Five named paths: blur, Escape, paste (real `user.paste`), autofill, separate-state.
- **Clause 4 (`fireEvent.keyDown`)** — clear; none exists.

**Ruling on the disclosed `fireEvent` autofill exception: LEGITIMATE, CORRECTLY REASONED.** Three grounds: the disqualifier binds *keyboard* tests and autofill is defined by the absence of key events; `fireEvent.change` through the native setter **is** the shape of a browser autofill, so `user.type` would have replayed typing while claiming to test autofill — the substitute is the **higher-fidelity** choice, not the cheaper one; and it is disclosed twice and discriminates (against an implementation emitting the input's text on blur, it fails). The Reviewer added that the component sets `autoComplete="off"`, so the test deliberately exercises the path that attribute is meant to prevent rather than trusting the attribute — the correct posture for FR-3, whose premise is that no single guard is trusted.

**Coverage closure: 23 of 25 T-2-owned rows covered by a named test.** Two gaps, both guarding behavior the code already implements correctly:

- **Gap 1 — `aria-controls` claimed, not covered.** The closure row names four attributes; three are asserted, `aria-controls` nowhere in 415 lines. Explicitly **not** discharged by the axe runs: `aria-valid-attr-value` would catch the attribute pointing at a *missing* id, but nothing catches it being *absent*. Discharging a named clause by an adjacent green check is the shape KZ-001 forbids.
- **Gap 2 — revert-on-close proven for blur only.** The requirement and the closure row both enumerate three exits. Only blur has a display assertion; the Escape test never reads the input's value, and the Tab test renders with `value=""` so no uncommitted fragment exists for it to observe. **T-3 rewrites the popup mount lifecycle directly beneath this property.**

The Reviewer explicitly did **not** flag rows owned by T-1/T-3/T-4/T-5/T-6, and recorded the absence of portal/positioning code as **conformance, not a gap**.

**Discrimination audit.** Named as genuinely discriminating: the mid-string `Pemba` test (fails under `startsWith`, and also proves argument wiring against `fold-search.ts:31`'s `(candidate, query)` order); the JD-8 pointer-commit test — *"the strongest test in the file"*; the no-wrap test (discriminates against both wrap-around and a missing `Math.max` clamp); `Enter`-commits-never-submits; and the separate-state test. Named as weaker than their titles, non-gating: the `disabled` test is partly vacuous (`user.click` does not deliver pointer events to a disabled element, so the negatives would pass even with the internal guard deleted — though `toBeDisabled()` does prove the user-facing property); the no-network test spies `fetch` only; and the idempotence test cannot prove "must not announce when unchanged" by construction — but its name says exactly that and cites KZ-002/D8, so the honesty discipline is met and it is *the correct trade, not a defect*.

**The four volunteered shape decisions: all ruled within T-2's approved scope.** Decision 4 (clicking the closed input opens the popup) got the sharpest reasoning — the Implementer thought it was unrequired, but the Reviewer showed it is **entailed by an owned clause**: the design specifies no chevron or trigger button, so without it the pointer path has **no opening gesture at all**, making JD-8's pointer commit — the primary gesture on the mobile surface `requirements.md` §1 names as the target — structurally unreachable. Entailed, not smuggled.

##### Lens 3 ADVISORY — the budget answer the user asked for

**Direct verdict: the 820 lines are necessary coverage; `design.md` §11's estimate was low.**

- **Component 405 vs ~250 budgeted:** ~124 of the 405 are comment or divider lines, and **the doc header alone is 82** (`:4-85`). Executable code plus JSX is ≈ **280** — essentially on the §11 estimate. The overage is documentation *the spec itself compelled*: the JD-11 APG deviation and the D5 axe caveat are both mandated by T-2's own "Done when", plus the DD-2 state-model argument, the JD-8 interaction rationale, and the KZ-008 justification for the no-match row. **§11 estimated the code; it did not estimate the prose four separate clauses require the code to carry.**
- **Tests 415 vs ~170:** across 36 tests the Reviewer could name **exactly one** duplicating another's discriminating power (the `kus` test, largely subsumed by the mid-string `Pemba` test; its only unique contribution is result ordering). The six axe `it`s are mandated as six states; the five FR-3 tests as five exit paths. Everything else maps to a distinct clause.
- Its closing formulation: *"design.md §11 budgeted ~170 test lines for a task whose own 'Done when' enumerates ~25 required named assertions — the estimate was low, not the implementation fat."*

Other advisories: the `motion-reduce:` class is currently **inert** (the popup mounts at final opacity with no from-state, so nothing interpolates) — the comment does not overclaim, but **T-3 inherits an unexercised transition, not a working one**; the live-region count excludes the clear entry, so with `clearOptionLabel` set the listbox holds 6 rows while the region announces "5 regions available" (judged the better reading, but unasserted — **T-5's to cover**); hover sets the active option via `onMouseEnter`, the one behavior in the component with no assertion at all; and the Reviewer noted it ran no commands, taking "39 tests passing" as reported — correctly observing that **neither of its findings would be revealed by a green run, because both are assertions that do not exist**.

---

#### Leader's adjudication of round 1 — all six issues IN SCOPE, one rework attempt authorised

Three lenses, three `FAIL`s, six issues, **zero overlap between panels** — each lens found what it was pointed at and nothing it was not. Adjudicating each for scope before spending an attempt:

| # | Lens | Issue | In scope? | Kind |
|---|---|---|---|---|
| 1 | Correctness | `searchText` leaks the committed label after a commit | **Yes** — FR-1, §5.2, §5.3 | **Production** |
| 2 | Correctness | No commit-then-type test | **Yes** — Done-when, D1 | Test |
| 3 | ARIA | Doc comment's genericity claim false | **Yes** — KZ-008, clause line 51 | Comment |
| 4 | ARIA | FR-6's `separate` + `visually-hidden` unasserted | **Yes** — clause line 50, Done-when | Test |
| 5 | Evidence | `aria-controls` unasserted | **Yes** — Coverage Closure, T-2 row | Test |
| 6 | Evidence | Revert-on-close proven for blur only | **Yes** — Coverage Closure, T-2 rows | Test |

**No issue was rejected as reviewer scope-creep.** One production defect; five test-or-comment items.

**~14 advisories recorded and NOT actioned.** *Advisory Never Becomes A Task* was applied strictly, including to the JD-13 `WCAG 2.5.8` miscitation, which two lenses raised and one explicitly proposed folding into the rework "since the file is being reworked anyway." **Declined** — cheapness is the argument the rule exists to refuse, and the defect is upstream in `design.md` §9, which is a spec edit and the user's call. The rework brief named the out-of-scope items explicitly so the Implementer could not drift into them.

**Advisories that are routing information for later tasks** — transport of existing findings, not new scope — to be carried into those briefs: **T-3** inherits the axe-`container`-after-portal hazard (the three popup axe runs would silently stop covering the listbox while staying green) and the inert-transition note; **T-4** inherits `Enter`-preventDefault removing implicit form submission, which FR-4's "preserving every behavior the field has today" makes its problem; **T-5** inherits the live-region-count-vs-clear-entry divergence and the `options.find` fallback when a dynamic subset shrinks under an active filter.

**Effort for the rework: held at `xhigh`, not bumped.** The rework rule bumps one level per retry, but the tier↔effort rule forbids `max` on a cheaper tier and the Implementer is T2 — and escalating the tier would put the Implementer on `opus`, collapsing `author ≠ auditor` against an `opus` review panel. The bump was spent on brief precision instead: six issues transported **verbatim** per the Structured Feedback rule, with the Leader adding one binding constraint (the "select the label text on commit" remediation is ruled out — it passes the new test while leaving the `Tab`-then-caret-move path alive, which would be a false green).

---

### T-2 · attempt 2 (rework) — **IMPLEMENTED, ROUND 2 REVIEW IN FLIGHT**

| File | Lines | Δ from attempt 1 |
|---|---|---|
| `SearchableSelect.tsx` | 431 | +26 |
| `SearchableSelect.test.tsx` | 513 | +98 |
| **Total** | **944** | **+124** |

Tests: 36 → **39**. Leader re-measured both files with `wc -l` after the worker reported; figures match.

**Issue 1 remediation chosen: option 1 (`InputEvent.data`), not `readOnly`.** At `:229-231`:
```ts
const nextSearchText = isOpen
  ? event.target.value
  : ((event.nativeEvent as InputEvent).data ?? event.target.value);
```
Implementer's reasoning: `readOnly` would additionally have to reason about re-enabling editability at exactly the right moment without breaking the click / `ArrowDown` / printable-char open paths, whereas this is one branch taken only while closed. It also observed the fix closes the second path the lens flagged (`Tab`-in, caret-move-while-closed, then type) **for free** — those keys fall through to native caret movement while closed, and since `handleChange` no longer reads `target.value` in that state, caret position stops mattering.

**Issue 2 evidence — RED before the fix, verbatim:**
```
● … Enter commit …
  Expected the element to have value: k
  Received: Kaskazini Pembak
● … pointer commit …
  Expected the element to have value: k
  Received: Dodomak
Tests: 2 failed, 37 passed, 39 total
```
Then GREEN after: `Tests: 39 passed, 39 total`. **This is the ordering that makes the test evidence rather than decoration** — the brief required RED first precisely because a test authored after a fix proves nothing about the defect. The received values are the defect verbatim.

Issues 3–6 addressed as directed: the doc comment now states all three region-word literals and why two are non-parameterisable; the live region gains an `sr-only` assertion with the KZ-002 disclosure plus a node-distinctness assertion; `aria-controls` gains a named test across closed/open/after-Escape; and both the Escape and Tab tests now commit a value, type a fragment, and assert the revert.

**`Not Done / Assumptions`, carried verbatim:**
> - Did not touch anything on the OUT OF SCOPE list (WCAG 2.5.8 citation, `clearOptionLabel`, live-region semantics, new props, other adoption files, portal/positioning).
> - Assumption: for the Issue-2 regression tests I needed a stateful wrapper (`renderControlledControl`) since the existing `renderControl` mock doesn't close the value loop after a commit — added it as a small local test helper, not a production change.
> - Both files are still untracked in git (never committed from attempt 1), so there's no pre-existing git diff to show beyond the line counts above.

Leader's adjudication: **no scope owed.** The first item is a compliance confirmation, the second a disclosed test-only helper, the third a statement about git state.

#### Round 2 review — 2 lenses, and a Leader-raised hypothesis

Two lenses rather than three, proportionate to a narrow diff and to the **2 review rounds** §11 allots T-2. This is round 2 of 2. Lens A owns the production fix; lens B owns the five remediations plus regression against everything round 1 cleared. Each was told not to audit the other's territory — duplicating the last budgeted round wastes it.

**The Leader raised one specific hypothesis for lens A to test rather than assume.** The comment above the fix (`:222-225`) asserts *"paste reports the pasted string as `data`"*. Per the Input Events spec a paste fires `inputType: "insertFromPaste"` with **`data: null`** — the content travels in `dataTransfer`. If that is right, paste **while closed, after a commit** falls through to `event.target.value` and reintroduces the exact leak on that one path, and the existing paste test cannot see it because it pastes while the popup is already **open**, taking the `isOpen` branch. That would be two findings at once: a functional gap, and **KZ-008 recurring inside the fix for a KZ-008 issue**. Lens A was also asked to rule on `deleteContentBackward` (backspace reports `data: null`), IME `insertCompositionText`, and `insertReplacementText`.

Both lenses were told this is the last budgeted round and to be decisive in **both** directions — a manufactured finding costs a round the spec does not have, exactly as a missed one does.

**Attempts consumed: 2 of 3. Review rounds consumed: 2 of 2 budgeted.** A FAIL here exhausts the review budget and leaves one implementation attempt, which is a user escalation, not a routine continuation.

#### Round 2 verdicts — **both `PASS`** · T-2 CLOSED

##### Lens B — remediation landing & regression · `STATUS: PASS`

All five non-production remediations closed their clauses, and nothing round 1 cleared regressed. The Reviewer applied round 1's own discrimination standard rather than merely confirming the assertions exist: **deleting `sr-only` now fails the test** (round 1's demonstrated hole is closed), and the node-distinctness assertion fails only if the two elements collapse — precisely the edit §5.3 forbids.

On Issue 3 it counted the region-word literals itself — exactly three (`:133`, `:191`, `:192`) — and confirmed the corrected comment **did not overcorrect into a different false claim**, which is the real hazard when fixing a comment. Strings unchanged, prop surface still §5.1's 11 props, no prop added.

Issue 2's `renderControlledControl` was verified **purely additive**: `renderControl` still drives every pre-existing test, and 36 → 39 accounts exactly for the three new tests. The Reviewer enumerated the attempt-1 tests named in round 1's findings and confirmed none went missing — the "suite must not get weaker while the feature gets more complex" standard from `design.md` §10's risk row.

Full regression sweep clear: two `onChange(` call sites; JD-8's `preventPointerBlur` still wired to both `onMouseDown` and `onPointerDown`; the no-match `<li>` still id-less and handler-less with the unconditional-listbox coupling intact; boundary arithmetic unchanged; six axe states distinct; D5 caveat in all three required places; D8 disclosure; JD-11 record; tokens re-verified **by resolution against `tailwind.config.ts`**, not by hex-absence; NFR-3; NFR-4; zero `fireEvent.keyDown`. All four disqualification clauses re-confirmed clear after attempt 2.

##### Lens A — the Issue-1 fix across every input path · `STATUS: PASS`

**The Leader's paste hypothesis was refuted, with better evidence than the hypothesis had.** The `data`/`dataTransfer` split in the Input Events spec is **conditioned on the editing host**: `dataTransfer` carries the payload for *richly editable* hosts (contenteditable), while for a **plain-text host** — `<input type="text">`, all this component renders — engines put the plain string in `data`. Blink branches on exactly this (`DispatchBeforeInputDataTransfer` → `IsRichlyEditable`, else `data_transfer->getData("text/plain")` as `data`); Gecko splits the same way between TextEditor and HTMLEditor. **The Leader was reading the contenteditable case.**

The Reviewer verified both halves of the parenthetical in bytes rather than by plausibility: autofill's `change` maps to `EventType: 'Event'` (`@testing-library/dom/dist/event-map.js:120-126`) so `data` is `undefined` and the fallback is taken correctly; and paste traces end to end through `user-event`'s `paste.js:12-14` → `input.js:116-119,146` → `eventMap.js:131-137` → `createEvent.js:114-120`, arriving with non-null `data`. It also stated its epistemic position plainly — a spec-plus-engine-source argument, not a browser run — which is the right posture for a claim no test in this repo settles.

It then **bounded the blast radius before declining to gate**, which is why the PASS is credible rather than permissive: even if some engine did report `data: null` for a plain-text paste, the leak would reach `searchText` **only** — FR-3 is untouched because `onChange` still has exactly two call sites, so no non-canonical string can reach the API on any paste path — it self-clears on the next keystroke, Escape, or blur, and it is **not a regression**, since pre-fix that path behaved identically. The fix strictly improves or leaves unchanged; it never worsens.

It swept the other `inputType`s on the same branch and found **one** genuine harness/browser divergence: `deleteContentBackward` (Backspace) reports `data: null` in every browser but `''` in `user-event`, and `''` is not nullish, so the suite exercises the branch the browser does not. Ruled **acceptable, not a defect**: the fallback yields a string that is always a *prefix* of the committed label, so it always matches at least the committed option and **can never produce the Issue-1 symptom** of "No regions match" against a full valid list; §5.3's key table does not define Backspace-while-closed.

On the new tests: `renderControlledControl` was judged **faithful, not easier** — it holds `value` in `useState`, sets it from `onChange`, and destructures `value`/`onChange` out before spreading `...rest` so a test cannot accidentally override the controlled loop; it adds no state the component can lean on. It is the §5.1/§5.2 controlled contract, and what `RegistrationForm` does. Both regression tests were traced line by line against the quoted RED output and confirmed to fail pre-fix, with the option-list assertions as a second independent discriminator (the `✓` prefix appears in the Enter variant, where the committed value is in the filtered set, and not in the pointer variant, where it is not).

##### Round 2 ADVISORY (recorded, non-gating, **not** actioned)

- **ADV-1** — the paste-while-closed path has no test, and there is an **engine-independent formulation that retires the question entirely**: `data ?? stripPrefix(event.target.value, committedLabel)` is correct on every engine for paste, drop, autocorrect and autofill, and degrades to today's behavior for Backspace. **Recorded, not actioned** — it is a design improvement to approved, passing code, which is exactly what *Advisory Never Becomes A Task* forbids minting here. It is the strongest candidate in this spec for a follow-up proposal.
- **ADV-2** — one sentence of the fix's comment attributes the wrong mechanism: "that fallback is exactly what already made the paste and autofill paths correct" is true of autofill and false of paste twice over (the existing paste test pastes while **open** and never reaches `??`; and paste supplies `data`, so it does not use the fallback either). The claim and its stated mechanism cannot both be the reason.
- **ADV-3** — the Backspace harness/browser divergence deserves a line at the fix so the next reader does not "fix" it.
- **ADV-4** — a stale line reference at `SearchableSelect.test.tsx:298-299` predating the 405→431 growth.
- Lens B additionally noted the test file's KZ-002 header now says "**two** groups" of presence-only assertions where Issue 4's remediation created a third — **the identical enumeration-drift shape as Issue 3, one file over, introduced by Issue 3's own sibling fix.** Non-gating (the new assertion carries its own disclosure at the point of assertion), but the recurrence is the notable part and belongs in Kaizen.

ADV-2, ADV-3, ADV-4 and the header undercount are all **comment-accuracy items on passing code**. They are recorded here rather than actioned, because a third implementation attempt spent on comment precision would consume the last attempt before a HALT for zero behavioral gain. **They are the natural first edit whenever T-3 next opens this file**, and T-3's brief will carry them as inherited context — transport of existing findings, not new scope.

#### Leader's final verification (the evidence no Reviewer could produce)

Both Reviewers stated they ran no commands, and both correctly observed that the green run is the Leader's evidence, not theirs. Measured after all workers went idle, never beside them:

```
$ npm test -- --silent --testPathPatterns SearchableSelect
Test Suites: 1 passed, 1 total
Tests:       39 passed, 39 total
Time:        2.57 s

$ grep -nE "#[0-9a-fA-F]{3,6}|rgb\(|bg-\[" components/ui/SearchableSelect.tsx
(no matches)

$ git diff -- package.json
+    "@testing-library/user-event": "^14.6.3",

$ npm run build
○  (Static)  prerendered as static content
```

The **full `npm run build`** was run deliberately rather than only the targeted test: NFR-3 requires the static export to keep succeeding, and it is the one gate a component-scoped test run cannot exercise. It succeeds.

#### T-2 final status: **PASS on attempt 2 of 3**, after 2 of 2 budgeted review rounds

| | Budgeted | Actual |
|---|---|---|
| Implementer attempts | ≤3 | 2 |
| Review rounds | 2 | 2 (5 lens reviewers total: 3 + 2) |
| LOC | ~420 | **944** (component 431, tests 513) |
| Tests | — | 39 |

Requirements covered: FR-1 (no-match scenario), FR-2 (both scenarios), FR-3 (all clauses), FR-6 (all clauses); NFR-1, NFR-2, NFR-3, NFR-4, NFR-5; DD-2, DD-3, DD-4; JD-2, JD-8, JD-10, JD-11; OQ-2. Per `tasks.md`'s Coverage Closure table, all 25 T-2-owned rows now carry a named test.

#### Issues encountered

Two, both external to the spec's content: a session-quota blocker that killed the first Implementer dispatch before any work (recorded above, consumed no attempt), and the repo-wide ESLint 9 / `.eslintrc.json` mismatch that makes T-2's literal lint command unexecutable — **which has now recurred across two consecutive tasks** and is a defect in the remaining tasks' verify blocks, not a one-off. It is the KZ-002 recurrence shape extended to documents: *a procedure carrying every required clause can still be unexecutable*. Correcting T-3/T-4/T-5's verify commands is a spec edit and is flagged to the user rather than performed silently here.

One methodological note worth carrying to Kaizen: **the Leader's own hypothesis was wrong and the Reviewer refuted it with better evidence.** That is the panel working as designed — a Leader-raised suspicion is an instruction to *investigate*, never a finding, and the brief said so explicitly ("a hypothesis the Leader wants tested, not assumed"). Had it been transported as a finding, attempt 3 would have been spent "fixing" correct code.

---

## Interlude — JD-13 closed and the lint command corrected (commit `95bb89d`)

Between T-2 and T-3, at the user's explicit direction, two items held out of T-2's scope were closed as spec edits.

**JD-13 — the WCAG miscitation.** `design.md` §9 row 1 cited WCAG 2.5.8 for a 44px touch target. SC 2.5.8 *Target Size (Minimum)* is **WCAG 2.2 AA at 24×24 CSS px**; 44×44 is SC 2.5.5, **AAA**. This project targets WCAG 2.1 AA, which contains neither at AA. Two round-1 lens Reviewers re-raised it independently during T-2 and one proposed folding the fix into the rework; the Leader declined, because an advisory may not widen an approved task. The user then decided it.

Corrected **in both directions per KZ-004**, not only at the site the finding named — four sites in one change: `design.md` §9 row 1 (the origin), `SearchableSelect.tsx`'s option-row comment (the code that had begun quoting it), `tasks.md` T-6's touch-target bullet (which described JD-13 as pending), and `judgment.md`'s JD-13 row plus its "deliberately unfixed" list. 44px is now stated as a platform-HIG target (iOS HIG 44pt, Material 48dp) with **no WCAG SC cited anywhere.**

The reason it stopped being tolerable as a "deliberately unfixed" documentation item is worth recording: **the code had started quoting it.** A documentation defect is contained while it stays in documentation; it stops being contained the moment an Implementer faithfully copies it into a source comment, which is exactly what happened in T-2.

**The unexecutable lint command.** This spec's verify blocks specified `npx eslint "<path>" --quiet`, which **does not run in this repo at all** — ESLint 9.39.4 defaults to flat config and only a legacy `.eslintrc.json` is present. T-1 and T-2 each hit it and each independently substituted a working form. T-4 and T-5 now specify `npx next lint --file <path>`, and the Standing Rules section records the failure verbatim along with why the substitute is not a weaker gate (in T-2 it caught a real `react-hooks/exhaustive-deps` violation).

**Verified rather than assumed: the root `CLAUDE.md` verification table is NOT affected.** `backend/`'s `npx eslint` runs clean and `frontend/`'s `npm run lint` works. The broken form was local to this spec's own task files — a narrower defect than first suspected, and the check cost one command.

This is **KZ-002's recurrence shape extended to documents**: a procedure carrying every required clause can still be unexecutable.

---

### T-3 — Portal + reflow positioning · **IN REWORK (attempt 2 of 3)**

**Skills:** `vercel-react-best-practices`, then `react-doctor`. **Effort:** `xhigh` — T-3 is the other half of the correctness-critical pair (`tasks.md` line 199), and the reflow mechanism is concurrency-shaped.

#### Dispatch 1 — killed by a second session-quota blocker, partial work left in the tree

```
You've hit your session limit · resets 12:50am (America/Bogota)
```

Unlike the T-2 blocker, this one died **mid-task with work on disk** (component 608 lines, test 753). Per the runtime-failure rule this consumed **no rework attempt**. The Leader assessed the tree rather than rolling back — Step 4's automatic rollback binds a HALT after three failed attempts, not an environment blocker, and the partial work was coherent:

- `createPortal`, `visualViewport`, `requestAnimationFrame` and the `contains()` exclusion all present
- **`scrollIntoView` present only in two comments, never in code** — §5.5's prohibition held
- **Suite RED: 4 failed, 44 passed, 48 total**

#### The four failures, diagnosed by the Leader before respawning

Three were **the axe hazard firing exactly as briefed.** The dispatch had correctly re-targeted the `open`/`filtered`/`no-match` runs from RTL's `container` to `baseElement` so they actually cover the portalled popup — and that re-target immediately surfaced:

```
"All page content should be contained by landmarks (region)"
```

**Diagnosed as a test-harness artifact, not a component defect.** Auditing `document.body` in a component test trips axe's `region` rule because the render sits in no landmark. The Leader checked the repo precedent rather than guessing: **all 45 axe call sites in the frontend suite use `axe(container)`** — `register-a11y.test.tsx:173,183,355,390`, `directory-a11y.test.tsx:145-189`, `AcknowledgeDialog.test.tsx:316` — so `region` had never fired here and **no precedent existed for auditing `document.body`.**

The relief brief named the trap explicitly: **do not "fix" this by reverting to `container`.** That would restore the exact silent-coverage-loss hazard T-3 exists to prevent — runs going green while covering nothing, which is worse than a red run.

The fourth failure was substantive: the reposition was not firing on `visualViewport` events — **the JD-6 path**, the reason DD-5's close-on-reflow rule was reversed.

#### Dispatch 2 (the relief) — attempt 1 complete

| File | Lines | Δ vs T-2 close (`95bb89d`) |
|---|---|---|
| `SearchableSelect.tsx` | 623 | +192 |
| `SearchableSelect.test.tsx` | 782 | +269 |
| **Total delta** | | **+461** vs ~220 re-baselined (**2.1×**) |

Tests 39 → **48**. Leader re-measured; figures match.

**The visualViewport failure had a real root cause, not a bad stub.** The rAF throttle used `rafRef` as both the gate and the id store:

```js
if (rafRef.current !== null) return;
rafRef.current = requestAnimationFrame(() => { rafRef.current = null; recomputePosition(); });
```

Under the suite's synchronous rAF mock the callback nulls the ref **first**, then the pending outer assignment clobbers it back to non-null — so the gate is permanently "scheduled" and every later reflow event no-ops. Fixed by decoupling the gate (`schedulingRef`, a boolean set before the rAF call and cleared inside the callback) from the id bookkeeping (`rafRef`, retained only for `cancelAnimationFrame`), with the cleanup resetting both. The Implementer documented the race at the new ref so it is not reintroduced.

**Axe resolution:** kept `axe(baseElement)` on the three popup-open states with `{ rules: { region: { enabled: false } } }`, and — a narrowing the Leader noted and the evidence lens later confirmed as deliberate — left `closed`/`invalid`/`disabled` on `container`, where no portal exists and the rule need not be suppressed at all.

#### Review round 1 — 2 lenses. **Evidence `PASS`, Mechanism `FAIL`.**

##### Evidence lens · `PASS`

Verified the `region` disable **against axe-core's own source** rather than accepting the comment's reasoning: the rule (`axe.js:32906-32917`) is tagged `cat.keyboard`, `best-practice`, `RGAAv4` — **no `wcag2a`/`wcag2aa` tag** — so disabling it removes **zero WCAG 2.1 AA coverage** and NFR-1's measure is not eroded. It also confirmed the check id `region` is referenced by exactly one rule, so the hole masks nothing else: `aria-required-children`, `aria-valid-attr-value`, `aria-allowed-attr` and listbox structure all still run on the portalled popup. Narrower alternatives were shown not to exist (scoping to the portal subtree still trips `region`; a `wrapper` render option cannot enclose a portal targeting `document.body`).

**The re-target's necessity is proven, not asserted** — a test asserts `container.contains(listbox) === false`, which is the discriminator establishing that a `container`-scoped run would cover nothing.

Suite strength: the lens counted the non-T-3 tests one by one and reconciled to **exactly 39**, T-2's close count, with an independent property-by-property sweep finding every named T-2 assertion still present. Nothing deleted, nothing weakened. It judged the three modified axe runs a **net strengthening** — a strict coverage gain at the cost of one non-WCAG best-practice rule.

It singled out the zero-rect D6 guard test as "the quietly valuable one": it drives jsdom's real zero rect and would fail if `hasMeasuredLayout` were removed — **it is what proves every other test in the file is not silently closing the popup on its first reflow tick.**

It also adjudicated the `ActorForm.test.tsx` full-suite flake the Implementer reported, and found the investigation adequate *and* structurally supported: `SearchableSelect` is imported by exactly two files (itself and its test) and has **no adoption sites yet**, so cross-file interference is confined to worker CPU, not shared DOM. It noted approvingly that nobody had raised `testTimeout` to hide it.

##### Mechanism lens · `FAIL` — 2 issues

**The rAF fix was attacked across every interleaving and survived.** Sync rAF, async rAF, close-between-schedule-and-callback, unmount-between-schedule-and-callback, two-events-in-one-frame: *"The ordering dependency was removed, not relocated."* The key pairing is that the `isOpen` effect cleanup resets `schedulingRef` **unconditionally** rather than leaving it to a callback that may never run. The lens added a correction to the Implementer's own account: the pre-fix bug was **not** cosmetic in the suite — the two-dispatch visualViewport test would have failed on the stuck gate, which is why that test is now the de-facto regression guard.

**Both portal-survival questions the Leader flagged were re-derived at source level and cleared.** JD-8's `preventDefault` guard still holds because React 19's `completeWork` `case 4` (HostPortal) calls `listenToAllSupportedEvents(containerInfo)`, so `document.body` receives the delegated `mousedown`/`pointerdown` listeners and the guard fires through the React tree despite the DOM break. The no-click-outside-listener argument survives because **the portal changes DOM ancestry, not focus ownership, and `onBlur` was never scoped by ancestry.**

Every reflow clause verified correct: the JD-1 exclusion (including that the programmatic `scrollTop` writes fire a `scroll` whose target is the popup itself, so the loop is provably broken), all three JD-6 registrations with symmetric cleanup, close-only-on-out-of-viewport as the sole close path, no `scrollIntoView` in code, NFR-4 untouched, and **zero setState on the non-close reflow path** so a scroll tick causes no re-render — §5.5's cost model holds.

**Issue 1 — coordinate-frame inconsistency in the flip-above branch.** `recomputePosition` correctly uses the *visual* viewport for the flip **decision** and the out-of-viewport test, but the flip **placement** writes `bottom = viewportTop + viewportHeight − rect.top + gap` — a visual-viewport offset for a property CSS resolves against the **layout** viewport. `left` and `top` use pure `rect` (layout). Error = `innerHeight − (vv.offsetTop + vv.height)`: **zero on desktop, equal to the keyboard height on mobile.** Worked example at Chrome Android defaults puts the popup ~300px below the anchor it should sit above — **JD-6's outcome reached through the placement math instead of a close rule.** Violates `design.md` §5.5 and DD-5's amendment (JD-6). *Leader confirmed independently by reading the four style writes together: three in the layout frame, one in the visual frame.*

The lens **gated rather than routed to T-6, and justified it**: T-6's mobile leg is the only remaining gate for this class, and `tasks.md` T-6 explicitly contemplates "I could not check mobile" as a legitimate escalatable outcome — **a defect a reviewer has already located should not be handed to a gate that may not execute.**

**Issue 2 — `z-10` survived the port into the root stacking context.** Correct while the popup was a local sibling; wrong the moment it moved to `document.body`, where it competes with `sticky top-0 z-40` headers at two of the three adoption sites and Leaflet's `z-[1000]` legend at the third. Violates DD-5 option (c) ("correct at all three sites") and §10's clipping risk row. *Leader verified the precedent by census: `z-50` appears 9× across `components/`, `z-40` once (the sticky header), `z-[1000]` once (the Leaflet legend) — `z-50` is unambiguously this repo's floating-overlay convention.* Remediation is `z-50`, with `MapLegend`'s `z-[1000]` explicitly left out of scope pending T-6 evidence.

##### Round 1 ADVISORY (recorded, **not** actioned)

From the mechanism lens: (1) the rAF gate has no test that can observe frame *coalescing*, because the suite's rAF mock is synchronous — a queue-based mock would lock §5.5's cost; (2) the out-of-viewport close test uses the visual viewport, making the keyboard a theoretical closing agent — belongs on T-6's mobile leg; (3) touch-drag scrolling of the option list is newly interesting under the portal and unobserved on a device — belongs on T-6's checklist; (4) a mild KZ-008 shape — the doc header says "two style writes per frame" where the code performs four property writes.

From the evidence lens: (1) the axe coverage guards use `screen.getByRole` rather than `within(baseElement)`, so guard and axe context coincide by convention rather than structurally; (2) the `placeAbove` flip branch has no wiring test; (3) the disclosure comment omits its own strongest argument (that `region` carries no WCAG tag); (4) the `ActorForm` flake should be recorded here — **done, above**; (5) a request that the Leader confirm the verbatim verification runs are recorded before flipping the checkbox — **honored below.**

**Advisory 4 from the mechanism lens is the tempting one** — the Implementer is editing that exact function for Issue 1. It was named in the rework brief as explicitly off-limits. *Advisory Never Becomes A Task* holds hardest precisely when the file is already open, because that is when every scope leak is cheapest to justify.

#### Leader's verification of dispatch 2's state (measured with the tree quiet)

```
$ npm test -- --silent --testPathPatterns SearchableSelect
Test Suites: 1 passed, 1 total
Tests:       48 passed, 48 total

$ npm run build
○  (Static)  prerendered as static content

$ grep -n "scrollIntoView" components/ui/SearchableSelect.tsx
51: * directly, never `scrollIntoView` — ...     (comment)
495:  // directly — scrollIntoView is forbidden (§5.5): ...  (comment)
```

Recorded per the evidence lens's advisory 5. **These runs describe the state the Mechanism lens then FAILed** — a green suite and a successful static export were necessary and, once again, not sufficient: both of its findings are invisible to jsdom by construction.

**Attempts: 2 of 3 in flight. Review rounds: 2 of 1 budgeted — exceeded.** The budget position is escalated to the user at the task gate.

#### Attempt 2 (rework) — implemented, **REVIEW BLOCKED BY HARNESS LIMIT**

| File | Lines | Δ |
|---|---|---|
| `SearchableSelect.tsx` | 639 | +16 |
| `SearchableSelect.test.tsx` | 854 | +72 |

Tests 48 → **50**. Both FAILed issues addressed; nothing on the DO-NOT-TOUCH list altered.

**Issue 1 fix, at `:447`:**
```ts
popup.style.bottom = `${document.documentElement.clientHeight - rect.top + POPUP_GAP_PX}px`;
```
`rect` and a fixed element's `bottom` both resolve against the layout viewport, and `document.documentElement.clientHeight` is that same frame — so the whole expression is now in one coordinate system, consistent with the below-branch and with the `left`/`width` writes.

**Issue 2 fix, at `:546`:** `z-10` → `z-50`, with a comment recording that it is a page-level z-index now rather than a wrapper-local one.

**Leader-verified inline** (tree quiet, measurement taken after the worker reported):

```
$ npm test -- --silent --testPathPatterns SearchableSelect
Tests:       50 passed, 50 total

$ npm run build
✓ Generating static pages (23/23)   ✓ Exporting (2/2)
```

Confirmed by reading: line 447 carries the layout-frame expression; line 546 carries `z-50` with no `z-10` residue; and — the property most at risk of being "fixed" along with the bug — **the flip decision (`spaceBelow`/`spaceAbove`) and the out-of-viewport test still read the *visual* viewport**, which was correct and had to survive.

The new flip test asserts `bottom === '404px'` given `clientHeight` 800 and `vv.height` 500, where the pre-fix expression yields `'104px'` — **it reproduces the Mechanism lens's own worked example as its discriminator**, which is the strongest available form for a fix whose real-world effect jsdom cannot see.

#### BLOCKER — `author ≠ auditor` cannot be satisfied; T-3 held at `[~]`

Spawning the verification Reviewer failed:

```
Subagent spawn limit reached (200 of 200 agents spawned).
```

This is a **harness runtime failure, not a work outcome**, and it consumes no attempt. Per `/akili-execute`'s runtime-failure table the Reviewer role has exactly one prohibition and no inline path: *"**Never inline** — the Leader reviewing work it supervised breaks `author ≠ auditor`, and a runtime failure does not suspend a correctness constraint."*

**The Leader therefore did not review this diff and T-3 is not marked `[x]`.** The verifications above are *measurements*, which are the Leader's own work; they are not an audit, and recording them as one would be precisely the substitution the rule forbids. The temptation is real and worth naming: the fixes are two lines, the remediations were prescribed in detail by the lens that found the defects, and both landed where prescribed. That is an argument for expecting a PASS — not for skipping the agent that would issue it.

**What is and is not established:** round 1's Evidence lens PASSed the axe re-target and the full T-2 regression sweep, and round 1's Mechanism lens verified the rAF scheme, every reflow clause, JD-8's survival of the portal, and the no-click-outside-listener argument — **all of that stands.** What has never been audited is this 88-line rework and whether it regressed any of it.

Escalated to the user with the options the runtime-failure table allows: raise `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`; a fresh session (which resets the counter — the audit trail supports `/akili-resume`); cross-host dispatch per the Model Routing registry (T3 Auditor → `opencode/gpt-5.5-pro` or Antigravity `claude-opus-4-6-thinking`); or an **explicit, recorded waiver**. A waiver is the user's to grant and must be written here as a waiver, never as a PASS.

**Leader work completed while blocked** (neither requires a subagent nor an audit): T-6's D6 checklist now carries both T-3 defects by name, with what to look at and the explicit note that the flip-decision/flip-write viewport asymmetry is *correct* so the manual pass does not report it as a defect. This was owed — the Implementer deferred it to the Leader by instruction, since `tasks.md` is the Leader's file. Only the two **confirmed FAIL findings** were added, sharpening checks T-6 already owned; the round-1 **advisories** were not, including the two a Reviewer suggested for that checklist. Mechanism-lens advisory 2 (keyboard as a theoretical closing agent) turned out to be **already covered** by T-6's existing JD-6 bullet, so it needed nothing; advisory 3 (touch-drag scrolling of the option list) would have been a genuinely new check and was therefore **declined** — an advisory may not mint work, and T-6 is as much an approved task as any other.

---

## Kaizen candidates from this spec (for `/akili-archive` — deliberately NOT written into `kaizen-log.md`'s Active Lessons table here, which is the archive phase's to write)

**C-1 · KZ-002 recurrence ×3, documents variant — raise severity.** A verify command carrying every required clause can still be **unexecutable**. This spec's task files specified `npx eslint "<path>" --quiet`, which fails repo-wide; T-1 and T-2 each hit it independently and each substituted a working form before anyone noticed the pattern. **Candidate standardization:** a task's verify command must be *executed once* during `/akili-specify`, not merely written — an unexecuted command is an unverified claim about the environment, which is exactly what KZ-002 says a presence-assertion is about code.

**C-2 · A LOC budget drawn from the mechanism cannot see what clause-level decomposition mandates (NEW).** `design.md` §11 was re-baselined **twice** and exceeded **both** times — first at Judgment Day (for DD-5's mechanism growth), then after T-2 (for mandated prose), and T-3 still came in at **2.1×** the corrected figure. The evidence lens established the cause precisely: of T-2's 431 component lines, ~124 were comment and the doc header alone was 82, leaving executable code *essentially on the original estimate* — while ~170 test lines had been budgeted for a task whose own "Done when" enumerated ~25 required named assertions. **The estimator was measuring the wrong quantity, so correcting the number could not converge.** Candidate: when a task's "Done when" mandates documented deviations, disclosed harness blind spots, or a per-clause assertion count, those terms must be estimated explicitly — or the tripwire will fire repeatedly on correct work and stop discriminating, which is what happened here.

**C-3 · Advisory pressure peaks exactly when the file is already open (NEW).** Three separate times a Reviewer proposed folding a cheap, correct fix into a task already being reworked — JD-13's miscitation, the "two style writes" doc-header undercount, the touch-drag T-6 check — each argued from *"the file is being edited anyway."* Every one was declined, and JD-13 was later closed properly as a user-decided spec edit affecting **four** sites, which the in-task fix would have caught at one. Candidate: record that cheapness is the argument *Advisory Never Becomes A Task* exists to refuse, and that an advisory actioned in-task also skips the two-direction sweep KZ-004 requires.

**C-4 · A correction can reproduce its own defect one file over (sharpens KZ-008).** T-2's Issue 3 was a doc comment that miscounted the domain literals it disclosed. Its remediation added a third presence-only assertion group to the **test** file — whose own header still said "two groups." The enumeration-drift defect **reproduced itself into the sibling artifact while being fixed**, and was caught only because a later lens re-counted. Candidate: a fix to an enumeration must re-count every enumeration the change touches, not only the one that was wrong.

**C-5 · Evidence about the method, not a defect: `requirements.md` §4.1 predicted exactly where this spec would fail, and it did — twice.** §4.1 declared D5/D6/D7 as classes with **no automated gate** before any code existed. T-2 shipped 36 green tests over a bug that showed *"No regions match"* against 31 valid regions; T-3 shipped 48 green tests over a popup displaced by the keyboard's height on mobile. **Both defects were found by a Reviewer reading code, neither by a run**, and both sat in the declared-blind classes. This is the gate-coverage rule earning its cost and is worth recording as a positive control, not only lessons drawn from failures.
