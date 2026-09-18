# Execution Log — Form elevation close-out and ladder completion

## 1. Document Control

| Field | Value |
|---|---|
| **Spec path** | `docs/specs/enhancement/form-elevation-ux/` |
| **Log opened** | 2026-08-08 |
| **Opening commit** | `02ce79d` — `[SPEC:enhancement/form-elevation-ux] specify — requirements, design, tasks` |
| **Branch** | `enhancement/app-visual-refresh-v2` (git worktree) |
| **Approval Mode** | `gated` — inherited from `proposal.md` |
| **Budget (`design.md` §11)** | 6 tasks · ~120 LOC · 8 review rounds |
| **Tripwires** | >8 tasks · >200 LOC · any validation/submission/payload/API-client change (NFR-4) · any file outside `design.md` §3 · FR-7 spacing change >1 Tailwind step |
| **Orchestration** | Leader (T1, `opus`) → Implementer (T2, `sonnet` via `.claude/agents/akili-implementer.md`) → Reviewer (T3, `opus` via `.claude/agents/akili-reviewer.md`). `author ≠ auditor` enforced by wrapper `model:` bindings. |

### 1.1 Opening-state notes

Recorded at log creation so later readers are not left inferring them.

- **Spec status at execution start.** `requirements.md`, `design.md` and `tasks.md` all carry
  `Status: Draft — awaiting approval`. The user's `/akili-execute` invocation on 2026-08-08 is
  taken as approval to **execute**. It is explicitly **not** the FR-1 / FR-2 / FR-7 aesthetic
  sign-off: `requirements.md` §8 and T-6's disqualifier (c) forbid recording direction-to-proceed
  as visual approval, and that gate remains open at T-6.
- **Concurrent worktree.** A `next dev` server occupies `:3000` and belongs to a **different**
  worktree (`.claude/worktrees/searchable-region-select-review`), serving different code. All
  rendered verification in this spec uses `:3100`. Recorded because a capture taken against
  `:3000` would be evidence about the wrong tree — a defect no diff review would catch.
- **CodeGraph.** `.codegraph/codegraph.db` is present in this working copy, so `codegraph_*`
  lookups are available to workers. (Per `CLAUDE.md`, this is a property of the checkout and is
  recorded here, not in the constitution.)
- **Local environment.** `docs/infrastructure.md` §6 contract used. The backend API on `:3001` was
  **down** for T-1's render; layout verification does not depend on it, but data-populated selects
  render empty in T-1's captures.
- **Playwright** is available globally (`v1.62.1`) and is deliberately **not** vendored into the
  repo, per `app-visual-refresh/captures/README.md`.

### 1.2 Task-selection decision (T-1 first, no parallelism)

T-1, T-3 and T-4 are all dependency-free roots, and `tasks.md` notes T-3/T-4 may run parallel to
T-1. The Leader **serialized them anyway**:

- **T-4 shares a file with T-1** (`RegistrationForm.tsx`) — not disjoint, so not parallel-safe.
- **T-3's verification greps the built CSS bundle** (`grep -c 'shadow-lg' .next/static/css/*.css`)
  immediately after `npm run build`. T-1 also builds. Both workers share one `frontend/.next/`, so
  a concurrent build makes T-3's grep a measurement of the wrong bundle — the
  `AGENTS.md` *Concurrency protocol* failure mode that "surfaces in the wrong worker" and that no
  diff review catches.

## 2. Task Execution History

<!-- Entries appended per task, in execution order. -->

### T-1 — Move the card treatment to a wrapping `<div>`; leave the fieldset semantic-only

| Field | Value |
|---|---|
| **Status** | **PASS** |
| **Date** | 2026-08-08 |
| **Implementer attempts** | **1** |
| **Reviewer verdict** | `STATUS: PASS` (attempt 1, lens-checklist mode) |
| **Requirements covered** | FR-1 (all clauses) · NFR-1 · NFR-3 · NFR-4 · NFR-5 |
| **Design** | DD-1, §7.1, §7.2 |
| **Skills assigned** | `tailwind-design-system`, `frontend-design`, `react-doctor` |
| **Effort assigned** | `high` — above the T2 `medium` default |

**Leader effort deviation, recorded per `.agents/leader.md`.** T-1 is a uniform mechanical
restructure, which reads as `medium`. It was dispatched at `high` because the task carries five
explicit evidence disqualifiers and this exact surface has already produced two failures: the
`float-left w-full` attempt that shipped a broken registration form to Dev with contrast, lint and
build all green, and a `getBoundingClientRect` probe that returned `straddles:false` and was used to
argue VF-4 did not exist. The cost of a third failure here is a deploy, not a rework round.

#### Attempt 1

**Files changed** (2 of the 10 whitelisted in `design.md` §3):

| File | Change |
|---|---|
| `frontend/components/register/RegistrationForm.tsx` | 5 fieldsets restructured (Identity, Location, Crops & capacity, Contact, Data protection & consent) |
| `frontend/components/admin/ActorForm.tsx` | 6 fieldsets restructured (Identity, Location, Capacity & support, Contact, Crops, Consent & provenance) |

`frontend/lib/contrast.test.ts` — **deliberately unmodified**; adjudicated below.

**The uniform pattern, applied 11/11 (byte-identical at every site):**

- wrapper `<div>`: `rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm` (the exact string the fieldset previously carried)
- `<fieldset>`: `border-0 p-0 m-0`
- `<legend>`: `mb-4 text-base font-semibold text-fg` (was `bg-surface px-2 text-base font-semibold text-fg`)

**Diff size.** Raw `git diff --stat` reads **249 insertions / 227 deletions**; whitespace-insensitive
`git diff -w --stat` reads **44 insertions / 22 deletions**. The gap is reindentation forced by the
added wrapper element. Substantive LOC ≈ 55 against T-1's ~60 estimate — **no budget tripwire**.

**Verification** (Implementer-run, tree quiet):

| Command | Result |
|---|---|
| `npm test -- RegistrationForm ActorForm contrast --silent` | 3 suites, **180 tests, all passed** (run twice, identical) |
| `npm run build` | **Succeeded** — static export complete, `/register` and all admin routes present, no `t1-harness-temp` in output (confirms harness cleanup) |
| `npx next lint --quiet` | **No ESLint warnings or errors** (Next 15.5 emits a deprecation notice for `next lint`) |

**Rendered evidence — FR-1 has no automated gate (`requirements.md` §8), so this is the gate.**

Captured with Playwright 1.62.1 (global, deliberately not vendored per
`app-visual-refresh/captures/README.md`) against `PORT=3100 npm run dev`, `deviceScaleFactor: 2`.
Artefacts in the session scratchpad, **not** the repo, so `git diff --stat` stays clean for T-6:
`t1-captures/{register-form,actorform-harness}__{375,768,1440}.png`, matching `__corner.png` crops,
and `manifest.json` carrying a per-shot `window.innerWidth` reading plus a
`getBoundingClientRect` + `getComputedStyle` probe on every wrapper / fieldset / legend.

- In-page `window.innerWidth`: **375 / 768 / 1440 exact on all 6 shots**, zero mismatches.
- Probe at 375: wrapper `x=16`, `border 1px rgb(230,223,213)`, `borderRadius 10px`,
  `background rgb(255,255,255)`; `fieldsetBorder 0px`; legend `x=33`, `legendPaddingLeft 0px`,
  `legendMarginBottom 16px`. 16 + 1 px border + 16 px (`p-4`) = 33 — the legend sits **exactly** on
  the card's padding box.

**Leader adjudication on the pixels.** Required by `requirements.md` §10 ("Measure *and* look") and
T-6 disqualifier (b), which fixes the adjudication as the Leader's, not a probe's and not a T6
model's. The Leader opened `register-form__{375,768,1440}__corner.png`,
`actorform-harness__1440__corner.png` and the full-page `register-form__1440.png` directly:

- Border continuous and corner radius unbroken around the full perimeter at all three widths, on
  both forms. **No white tab. VF-4 is resolved.**
- Legend text flush with the card's left padding; section title still visually dominant over field
  labels (FR-1's second acceptance criterion).
- Full-page 1440: five clean cards, `lg:grid-cols-2` field arrangement intact, no overlap and no
  crushed inputs. **This is the specific check the reverted `float-left` attempt failed while every
  automated gate passed green** (NFR-5).
- Only artefact visible: `We couldn't load the consent policy` — the backend on `:3001` was down.
  Data-dependent selects render empty for the same reason. Neither is a layout finding.

**Reviewer verdict — `STATUS: PASS`.** Audited independently, counting in the tree rather than from
the diff hunks: 12 `<fieldset>` sites repo-wide, 11 being the spec's targets and the 12th
`DirectoryFilters.tsx:90` (already borderless, out of scope per `requirements.md` §6, untouched).
All 11 verified as wrapper → fieldset → legend-as-first-child, with wrapper and fieldset class
strings byte-identical at every site, and no wrapper enclosing two fieldsets.

- **NFR-1** — 11/11 wrappers carry `border border-border`, 11/11 fieldsets are `border-0`. The
  1.05:1 `--color-surface` / `--color-bg` pair never becomes the sole boundary. Disqualifier (a)
  not triggered.
- **NFR-3** — legend is the fieldset's first child at all 11 sites, so the group keeps its
  accessible name; no `aria-*`, `role`, `id`, `htmlFor` or `tabIndex` touched. Reviewer noted the
  sharpest latent risk was avoided: **no `display` utility was applied to any `<fieldset>`**, and
  `display: flex/grid/contents` on a fieldset is what breaks legend rendering.
- **NFR-4** — zero hits for `closest(` / `parentElement` / `querySelector` / `getElementById` /
  `useRef` / `scrollIntoView` / `focus()` in either changed file. `select.closest('fieldset')`
  still resolves because the grid `<div>` stays *inside* the fieldset and the wrapper sits outside
  it. Error-summary anchors resolve by `href="#id"`, which is scope-independent. A class-only
  `<div>` with no `tabIndex` cannot reorder focus, and React's delegated listeners attach at the
  root. No global CSS rule targets `fieldset`/`legend`.
- **NFR-2** — `mb-4`, `border-0`, `p-0`, `m-0` are standard Tailwind scale utilities
  (`docs/ux-ui/design.md` fixes the scale as Tailwind default, 4 px base). No hex, no `rgb()`, no
  arbitrary `[...]` value in the diff.
- **Disqualifier (c)** — no test edited, corroborated two ways: `ActorForm.test.tsx:529-531` holds
  the identical assertion at identical line numbers, and `contrast.test.ts:326` still carries the
  *stale* `783`/`602` citations, which an edited file would plausibly have corrected.

#### Leader adjudication — the `contrast.test.ts` non-edit

T-1's work order contains an in-the-same-change clause naming KZ-004/KZ-008, so leaving the file
untouched was the one claim in the report that needed adversarial checking rather than acceptance.
The Reviewer was tasked explicitly with both failure modes and verified independently. **The
non-edit is correct:**

- Grepping the whole file for `ActorForm|RegistrationForm` returns **exactly one** hit,
  `contrast.test.ts:326` — `'admin/ActorForm.tsx:783, admin/ConfirmDialog.tsx:216,
  register/RegistrationForm.tsx:602 (bg-danger-soft text-danger, representative of 8 sites)'`.
- Both cited sites are top-level error containers **above** the first fieldset:
  `ActorForm.tsx:784` (`formError`) and `RegistrationForm.tsx:603`
  (`data-testid="error-summary"`). The old-side diff hunks begin at `-788` and `-619`; 784 < 788
  and 603 < 619, so the restructure moved neither line.
- T-1's clause is **conditional** — "every `REACHABLE` citation … *that this restructure moves*".
  Nothing moved, so it is satisfied vacuously rather than skipped.
- Decisively, `design.md` **DD-4** states the sweep "must run **after** DD-1 lands, not before".
  The design assigns the off-by-one correction to the post-DD-1 sweep, i.e. to T-6 §1 — whose own
  scope text reads "not only the two known-stale ones **and not only what T-1 moved**", which
  places them inside T-6 rather than presupposing T-1 fixed them.

The `tasks.md` Coverage row `FR-4 → T-1 (same-change) + T-6 §1` therefore labels T-1's *conditional*
clause and adds no unconditional obligation. Recorded at length because the opposite reading would
have been a legitimate FAIL, and because this is exactly the KZ-008 defect class that survived
`app-visual-refresh` T-7.

#### Leader adjudication — three legend edits where Scope licensed one

T-1's Scope licensed one legend change ("the `<legend>` loses `bg-surface`"). The change makes
three: `-bg-surface`, `-px-2`, `+mb-4`. Both extra edits were accepted as **required by T-1's own
`Done when` clause**, "a rendered capture … shows no white tab and **no misaligned legend**":

- **`px-2` removal is the horizontal half.** That padding existed only to notch the border the
  legend used to straddle. Retained on a now-borderless legend it offsets the title 8 px inboard of
  the card's padding box while every field label below sits flush — precisely risk (b) that
  `design.md` DD-1's Reversion challenge names ("a borderless `<legend>` retaining default browser
  padding and reading misaligned against the card's padding box"). The probe confirms the fix:
  legend `x=33` = padding-box start; with `px-2` it would render at `x=41`.
- **`mb-4` is the vertical half.** A straddling native legend consumed no flow space below itself.
  `design.md` §7.1 re-specifies it as "a normal block heading *inside* the card"; with no bottom
  margin it renders flush against the first field label. `16px` was chosen to match the `gap-4`
  rhythm already inside every field grid, so legend-to-first-field reads as one more inter-field
  gap rather than a new interval.
- **Not a T-5 encroachment.** T-5 owns *section* spacing ("tighter **section** spacing"); `mb-4` is
  intra-card heading spacing created by the restructure. `design.md` DD-5 anticipates exactly this:
  "DD-1 already changes where padding lives, so density is re-judged against the *post*-DD-1
  render." FR-7's disqualifier (a) is scoped to T-5's density tuning, not to spacing DD-1
  structurally necessitates.

#### ADVISORY (4R lens) — recorded, non-gating, and **not** convertible into tasks

Per `/akili-execute` §2.4, these never gate, never consume attempts, and may not mint or widen a
task. Three carry forward as **briefing context for already-approved tasks**, which informs
existing scope rather than growing it; two are recorded and die here.

| # | Lens | Finding | Disposition |
|---|---|---|---|
| **1** | risk | FR-4's known-stale pair (`ActorForm.tsx:783→784`, `RegistrationForm.tsx:602→603`) now has **T-6 §1 as its only owner**. If T-6 is compressed, the KZ-008 defect survives the whole spec — as it survived `app-visual-refresh` T-7. The same entry's third citation, `ConfirmDialog.tsx:216`, also needs re-resolution; T-3's swap at `ConfirmDialog.tsx:154` is a same-line class change that inserts no lines, so 216 should not shift — **to be confirmed at T-6, not assumed** | **Carried into the T-6 brief** as named line items |
| **2** | reliability | T-1 moved T-5's baseline in the **loose** direction: `mb-4` adds vertical space that did not previously exist, ≈ +96 px on `ActorForm` and +80 px on `RegistrationForm` at every width | **Carried into the T-5 brief** — T-5 must not read T-1's added space as pre-existing looseness |
| **3** | readability | The completion report under-declared its own diff: three legend class deltas against a Scope line licensing one. Both extras were correct, neither was called out | Recorded. Fed forward as a **report-shape requirement** in later briefs: enumerate every class delta against the Scope line |
| **4** | risk | The pattern is **silently reversible**. Nothing in either file records *why* the card lives on a `<div>`. A later "simplification" folding the treatment back onto the `<fieldset>` reintroduces VF-4 and breaches NFR-1 in one edit, and would pass contrast, lint and build — the NFR-5 blind spot exactly. `DirectoryFilters.tsx:90`, the precedent `design.md` §7.1 cites, has the same gap | **Recorded and closed here.** A code comment is not in T-1's approved scope and an advisory may not mint one. Genuinely worth a follow-up proposal |
| **5** | risk | The §11 raw-LOC tripwire reads false: T-1 alone is 249/227 raw but ~55 substantive. T-6's verify runs bare `git diff --stat` | **Standing ruling recorded:** the §11 200-LOC tripwire is evaluated on **`git diff -w`** LOC. Prevents both a spurious escalation and a waved-off real overrun |

**Issues encountered:** none in the work. One orchestration note: the Reviewer went idle without
emitting its verdict and had to be re-prompted for the report. It resent the completed audit rather
than redoing it, so **no rework attempt was consumed** — a harness delivery failure, not a work
failure.

**Final verification result:** 180 tests pass · build succeeds · lint clean · 6/6 captures at
asserted widths · FR-1 confirmed resolved by Leader inspection of the pixels at all three widths on
both forms.

**Commit:** `3d62cf0`

---

### T-3 — Give `--shadow-lg` its consumers: the four dialogs

| Field | Value |
|---|---|
| **Status** | **PASS** |
| **Date** | 2026-08-08 |
| **Implementer attempts** | **1** |
| **Reviewer verdict** | `STATUS: PASS` (attempt 1, lens-checklist mode) |
| **Requirements covered** | FR-3 (all clauses) · NFR-2 · NFR-4 · NFR-6 |
| **Design** | DD-3 |
| **Skills assigned** | `tailwind-design-system` |
| **Effort assigned** | `low` |

**Leader effort rationale.** `low` rather than the `medium` default, deliberately: T-3 is four
one-line class swaps, and its failure mode is **over-reach, not under-thinking** — the four dialogs
carry a real backdrop inconsistency that `design.md` DD-3 forbids fixing here. Depth would not have
helped; a hard scope fence would, so the brief spent its budget there. Task selected out of document
order (ahead of T-2) by user decision at the T-1 gate, to bank the cheap machine-checkable work
before spending user attention on T-2's perceptual judgement.

#### Attempt 1

**Files changed** (4 of the 10 whitelisted in `design.md` §3) — one line each, 4 insertions /
4 deletions total:

| File | Line | Change |
|---|---|---|
| `ConfirmDialog.tsx` | 154 | `shadow-md` → `shadow-lg` |
| `AcknowledgeDialog.tsx` | 216 | `shadow-md` → `shadow-lg` |
| `CreateUserDialog.tsx` | 216 | `shadow-md` → `shadow-lg` |
| `EditUserDialog.tsx` | 184 | `shadow-md` → `shadow-lg` |

All four panel strings were byte-identical before
(`'rounded-md bg-surface p-6 shadow-md border border-border'`) and byte-identical after. Every line
matched the spec's cited number — T-1 did not touch these files. **Exactly one class token changed
per file, four total, matching the Scope line with no extras.**

**Token wiring:** `tailwind.config.ts:58` — `lg: 'var(--shadow-lg)'`; `app/globals.css:73` —
`--shadow-lg: 0 16px 40px rgba(61,47,32,0.14)`. `docs/ux-ui/design.md` §7 designates `--shadow-lg`
for "dialogs, popovers, map rail", so dialogs are the correct consumer.

**Verification:**

| Command | Result |
|---|---|
| `npm test -- Dialog --silent` | 2 suites, **21 tests passed** |
| `npm run build` | **Succeeded**, static export 23/23 pages (run twice — clean baseline + final) |
| `npx jest "admin/actors/page.test.tsx" "admin/users/page.test.tsx" "ActorsTable.test.tsx"` (**Leader-run**, closing the gap below) | 3 suites, **72 tests passed** |

#### The `grep -c` gate is defective — found by the Implementer, confirmed by the Reviewer

`tasks.md` T-3's literal verify line is `grep -c 'shadow-lg' .next/static/css/*.css`, and
**it cannot work**. Both agents established the mechanism independently: the production CSS is
minified onto one physical line, and the `:root` `--shadow-lg:` custom-property declaration sits on
that same line — so a count-mode grep returns `1` whether or not any consumer exists. Measured `1`
before **and** `1` after.

Had T-3 been discharged on the task's own command, it would have produced a number that looked like
evidence and proved nothing — **KZ-002 exactly**, in the verification line of a task written to end
a KZ-002 failure.

The working evidence is a **rule-body** extraction, run on clean `rm -rf .next && npm run build`
in both states:

| State | `grep -o '\.shadow-lg[^}]*}'` |
|---|---|
| **Baseline** (pre-edit) | **no matches** — corroborates `requirements.md` §9's "`shadow-lg` consumers: **0**" |
| **After** | `.shadow-lg{box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}` and `.shadow-lg{--tw-shadow:var(--shadow-lg);--tw-shadow-colored:var(--shadow-lg)}` |

The Reviewer reproduced both fragments itself from
`.next/static/css/1be7598536ccb7c7.css` and judged the second **stronger** than FR-3's literal
criterion required: a Tailwind stock value would emit hardcoded geometry
(`--tw-shadow:0 10px 15px -3px rgb(0 0 0/.1)…`), whereas this emits the custom property, proving the
utility resolves through the project token. And since Tailwind only emits a utility whose class
appears in scanned content, **the rule's existence is itself the consumer proof** — set against a
baseline with no `.shadow-lg` rule body at all.

**Standing ruling recorded:** the working form is `grep -o '\.shadow-lg{[^}]*}'`, expecting two
fragments one of which contains `var(--shadow-lg)`. Any later reader of T-3's verify line should use
that instead.

#### Leader adjudication on the pixels

FR-3's Done-when includes "a rendered dialog capture shows the panel more raised than a `shadow-sm`
fieldset" — a comparison, so a class check cannot close it. Captures taken via a throwaway harness
(deleted before reporting; **KZ-003** confirmed again — the dialogs take plain props and need no
Cognito session), scratchpad `t3-captures/`. The Leader opened
`0-fieldset-shadow-sm.png` and `1-confirm-dialog-shadow-lg.png` directly:

- The `shadow-sm` reference fieldset carries a barely-perceptible hairline edge.
- The `shadow-lg` dialog panel sits on a large, soft, spread shadow that clearly lifts it off the
  backdrop. **Visibly more raised. Closed on the pixels.**

**Recorded honestly as partially unclosed:** FR-3's criterion also reads "more raised than a
`shadow-md` **card**", and no side-by-side `lg`-vs-`md` frame was captured — the harness had no
`shadow-md` reference. Two things stand in for it: the ladder is strictly monotonic on all three
axes (`xs` 1px/2px/0.04 → `sm` 2px/4px/0.07 → `md` 6px/16px/0.10 → `lg` 16px/40px/0.14), so
`lg > md` is deterministic rather than a judgement; and the capture proves `lg` is plainly
perceptible. T-6 §2's durable set captures an open dialog regardless. Noted rather than waved
through, per `requirements.md` §10.

#### Leader correction — test coverage of the four dialogs

The Implementer flagged that `npm test -- Dialog` selects only two suites, since `ConfirmDialog` and
`EditUserDialog` have no dedicated test file. The Leader ran the three indirect suites to close that
gap (72 tests, green) and **initially reported both dialogs as covered indirectly. The Reviewer
checked and that was wrong:**

- **`ConfirmDialog` is genuinely covered indirectly** — opened and driven at `ActorsTable.test.tsx:270`,
  `actors/page.test.tsx:507,537,614`, `users/page.test.tsx:312`.
- **`EditUserDialog` is covered by no test at all.** The string `EditUserDialog` appears in no test
  file; `users/page.test.tsx`'s three `getByRole('dialog')` assertions are `ConfirmDialog` and an
  inline reset-password panel. What covers it here is the successful build plus the rendered `4-edit`
  capture — **not a test.**

Adequate for a one-token class change on a file whose tests assert no shadow, but "exercised
indirectly" overstated it and the record is corrected here. Related: the Done-when clause "all four
dialog test suites pass unmodified" **presupposes four suites that do not exist** — a `tasks.md`
defect, not an implementation gap. On substance the clause holds: no test file is in the diff, and
no test in `components/admin` asserts any dialog shadow class (the only `shadow` assertions in the
tree are `ActorsTable.test.tsx:547,551` for `shadow-sticky-edge`), so no test *could* have needed
editing.

#### Negative clauses — verified untouched

The Reviewer confirmed by reading the files, not the diff: `role="dialog"`, `aria-modal`,
`aria-labelledby`, `onKeyDown={handleKeyDown}`, `handleKeyDown` bodies and `dialogRef` wiring are
present and unmodified in all four; only one `className` array line changed per file. The backdrop
split DD-3 forbids fixing is **intact** — `ConfirmDialog.tsx:139` / `AcknowledgeDialog.tsx:201` on
`bg-backdrop`, `CreateUserDialog.tsx:201` / `EditUserDialog.tsx:170` on `bg-fg/40`. No `shadow-md`
remains anywhere in `components/admin`.

#### ADVISORY (4R lens) — recorded, non-gating, **not** convertible into tasks

| # | Lens | Finding | Disposition |
|---|---|---|---|
| **1** | risk | `tasks.md` T-3's `grep -c` verify line is a broken gate (pinned at `1` in both states) | **Standing ruling recorded above.** T-6's own verify does not use it, so no live gate depends on it |
| **2** | risk | **A fifth `role="dialog"` panel remains on `shadow-md`:** `frontend/app/(admin)/admin/users/page.tsx:488-495`, an inline reset-password handoff dialog carrying the byte-identical panel string. FR-3's rationale clause *"so no two dialogs diverge in elevation"* is therefore **not fully achieved at the requirement level**, and `requirements.md` §9's "Dialogs on `shadow-md`: **4**" counted named dialog *components* rather than `role="dialog"` *panels* | **Escalated to the user at the T-3 gate** — see below. T-3 could not have fixed it: the file is off `design.md` §3's whitelist and T-6's done-when requires `git diff --stat` show only those 10 files |
| **3** | risk | `design.md` §7 also designates `--shadow-lg` for popovers and the map rail; `components/map/ActorPopup.tsx:66` and `components/map/MapLegend.tsx:47` are both still on `shadow-md`. Entirely outside this spec | Recorded so the ladder's remaining gaps are logged rather than rediscovered. **Closed here** |
| **4** | reliability | NFR-6: first-load JS unchanged (class-string edit only). CSS grows by the two small `.shadow-lg` rules; nothing is dropped, since `shadow-md` retains ~20 consumers elsewhere. Net-neutral in NFR-6's sense, but a small increase rather than literally zero | Recorded. **Closed here** |

**Advisory 2 is a spec-coverage finding, not new work.** Per `/akili-execute` §2.4 an advisory may
neither mint a task nor widen one, so it is surfaced to the user as a decision rather than absorbed.
FR-3's *enumerated* MUST names exactly four components and all four are done; it is the
*rationale* clause that the fifth panel leaves open, on a file this spec is forbidden to touch.

**Issues encountered:** none in the work. The Reviewer again went idle without emitting its verdict
and was re-prompted; it resent the completed audit rather than redoing it, so **no rework attempt was
consumed.** Second occurrence — a harness delivery pattern, not a work failure.

**Final verification result:** 21 + 72 tests pass across 5 suites · build succeeds, 23/23 pages ·
`.shadow-lg` present in the bundle and provably resolving through `var(--shadow-lg)`, against a
baseline with no rule body · all four panels confirmed on `shadow-lg` in the tree · backdrops, focus
trap, escape handling and `role` untouched · FR-3's `shadow-sm` comparison closed on the pixels by
Leader inspection.

**Commit:** `021dc09`

---

### T-2 — Resolve `--shadow-xs`: re-tune to a perceptible value, or remove the rung

| Field | Value |
|---|---|
| **Status** | **PASS** (on attempt 2) |
| **Date** | 2026-08-08 |
| **Implementer attempts** | **2** |
| **Reviewer verdicts** | attempt 1 → `STATUS: FAIL` · attempt 2 → `STATUS: PASS` |
| **Requirements covered** | FR-2 (re-tune branch, all clauses) · NFR-2 · NFR-6 |
| **Design** | DD-2 |
| **Skills assigned** | `tailwind-design-system`, `frontend-design` (attempt 2: `tailwind-design-system` only — docs-only remediation) |
| **Effort assigned** | attempt 1 `high` · attempt 2 **`xhigh`** (rework rule: bump one level) |
| **Branch taken** | **Primary (re-tune).** Fallback not required — a value survived the window |
| **Outcome** | `--shadow-xs`: `rgba(61,47,32,0.04)` → **`rgba(61,47,32,0.12)`**. Geometry frozen at 1px/2px |

**Leader effort rationale.** `high` at attempt 1 rather than `medium`: the code is one CSS value, but
the task's difficulty is entirely evidentiary and its predecessor discharged the same question on a
presence assertion. Deliberately **not** `xhigh`, which would have triggered parallel lens reviewers —
disproportionate for ~15 LOC, and `.agents/leader.md`'s Delegation Ceiling prefers one subagent.
Attempt 2 went to `xhigh` per the rework rule.

#### Attempt 1 — `STATUS: FAIL`

**Files changed:** `frontend/app/globals.css:70` and `docs/ux-ui/design.md:120` — the token value only.
Neither `inputClasses()` copy changed and `tailwind.config.ts` was untouched, which is **correct for
the primary path**: only the custom property's value moves, and the class strings resolve through it.

**Candidate sweep — the substance of this task.** The Implementer rejected eyeballing a compressed
render and instead extracted **raw RGB via ImageMagick `txt:` dump** from the PNGs pre-compression,
cross-checked against **4× nearest-neighbour (no-blur, no-interpolation)** magnified crops. Both
methods agreed. All candidates rendered against the **real post-T-1 `/register`** at 1440,
`deviceScaleFactor: 2`, **no downsampling** — the predecessor's capture set was downsampled 50% and
its own README warns that is not authoritative for shadow judgements.

| alpha | peak RGB | Δ from white | verdict |
|---|---|---|---|
| 0 (none) | 255,255,255 | 0 | reference |
| **0.04 (shipped)** | 249,249,248 | ~6 | **imperceptible — reproduces T-7's exact non-result** |
| 0.06 | ~250 | ~9 | still imperceptible |
| 0.08 | 243,242,241 | ~13 | faint, **reported inconclusive** |
| 0.10 | 240,239,237 | ~15 | **reported not confidently visible** |
| **0.12 (chosen)** | 237,235,234 | ~18 | visible warm gradient in 4× zoom, clearly distinct from 0.04/none |
| 0.14 | 234,232,231 | ~21 | visible |
| 0.16 / 0.20 / 0.25 | 231…/225…/217… | ~24/~31/~40 | clearly visible |

**Leader pixel adjudication.** At **native scale** the Leader could **not** distinguish `card-004.png`
from `card-012.png` — recorded as a limitation of the Leader's own viewing path, which downsamples,
not as evidence of absence. At **4× no-blur zoom** the difference is real: `0.04` is a crisp border
line with white beneath; `0.12` shows a soft warm band below the border. `0.16` proved only
marginally stronger than `0.12`, so the intensity cap cost little visibility. Recorded read:
**`0.12` crosses from indistinguishable to distinguishable under magnified inspection of a 2× capture,
but is marginal at native scale.** The Leader carried this to the Reviewer as an open question rather
than resolving it, precisely because disqualifier (c) makes "inconclusive reported as a pass" the
failure mode this task exists to prevent.

**Reviewer FAIL — the dispositive finding.** `docs/ux-ui/design.md` **§7 spans lines 75–165**, and
while line 120 was corrected to `.12`, **line 164 still read**:

> **Dark-scope shadow alphas (open, OQ-4):** the elevation ladder's alpha steps (`.04`/`.07`/`.10`/`.14`) are calibrated against the current light, warm canvas.

§7 therefore asserted **two contradictory values for the same token**, 44 lines apart, inside the file
*and* the section T-2 was instructed to update. The report had claimed "exactly two live sites carried
the old value, both fixed" — there were **three**. Root cause: the sweep's grep terms (`0.04`,
`shadow-xs`, four-rung phrasing) **cannot match `` `.04` ``** inside a backticked list on a line that
never contains `shadow-xs`. This is **KZ-004's reverse direction** and **KZ-008** — a document
asserting a property the values lack. A second issue was raised alongside: §7's ladder block presents
four ascending rungs whose alphas read `.12`/`.07`/`.10`/`.14` with no note that the ordering is
geometric.

#### Attempt 2 — `STATUS: PASS`

Scoped by the Leader to **documentation only**, with an explicit instruction **not to re-render,
re-measure or re-choose the value**: attempt 1's perceptual work was independently corroborated, and
re-running a settled perceptual judgement risks a different answer to a closed question.

**Two edits, both in `docs/ux-ui/design.md`:**

1. **Line 164** — `` (`.04`/`.07`/`.10`/`.14`) `` → `` (`.12`/`.07`/`.10`/`.14`) ``. The OQ-4 note's
   substance stands; a raised `xs` strengthens rather than weakens its point about dark-scope
   recalibration.
2. **Line 166, new note** in §7's trailing blockquote, matching the voice of the four cross-cutting
   notes already collected there:
   > **Ladder order is geometric, not by alpha:** the four rungs are ordered by offset/blur (`xs` 1px/2px → `sm` 2px/4px → `md` 6px/16px → `lg` 16px/40px); `--shadow-xs` deliberately carries a higher alpha (`.12`) than `--shadow-sm` (`.07`) because it must register across a much smaller 2px footprint, and it remains the geometrically lightest rung.

**Corrected sweep, then independently re-run by the Reviewer with wider terms**, including the class
grep could not catch:

| Term class | Result |
|---|---|
| Numeric spellings (`0\.04`, `\.04\b`, `\b4 ?%`) | Only `Hero.tsx:12,134,165` (GSAP `scale: 1.04`), `accelerate-project-source-data.md:181` ("18.4%"), `seed-synthetic.ts:57-58` (seed weights). **No stale ladder value anywhere** |
| **Shape claims** (`monotonic\|increasing\|ascend\|lightest\|heaviest\|four (steps\|rungs)\|progressiv`, plus `raised\|depth\|elevat\|subtle\|flat\|opacity\|alpha` scoped to the file) | The **only** ladder-shape assertion in the non-spec tree is the new line-166 note. **No surviving statement claims monotonic alpha, ascending opacity, or that `xs` is faintest** |
| Raw values (`rgba(61, ?47, ?32`) | Only `globals.css:70-73`. `tailwind.config.ts:54-58` holds `var()` references with no literals |

**Every factual claim in the new note verified** against `design.md:120-123` and `globals.css:70-73`:
the offset/blur chain is exact and strictly monotonic in both offset and blur; `xs .12 > sm .07` is
exact; "remains the geometrically lightest rung" is true (1px/2px is the smallest offset and blur of
the four). **No new KZ-008 defect introduced by the note written to fix one.**

**Verification:** `npm test -- contrast --silent` → **129/129 pass** · `npm run build` → compiled and
statically exported, `/register` First Load JS **111 kB unchanged** · `npx next lint --quiet` → "No
ESLint warnings or errors."

Also confirmed by the Reviewer: NFR-2 (`sm`/`md`/`lg` byte-identical in both files; only `xs`'s alpha
moved; no literal outside the sanctioned token definition; no component touched) · NFR-6 (value-only
change of identical byte length) · `design.md` §3 (both files whitelisted; `tailwind.config.ts:55`
still maps `xs`, and both `inputClasses()` copies still carry `'shadow-xs'` — correct, since the
fallback was not taken and **no orphan token exists**) · disqualifiers (a) and (b) do not fire.

#### Leader correction — a measurement that must not enter the record as stated

Attempt 1's selection rule was reported as *"0.12 is the highest alpha at-or-under `--shadow-sm`'s own
measured peak intensity (1.19 vs `sm` ≈ 1.20)"*. **That `sm` figure is arithmetically impossible.**
`sm` at declared alpha 0.07 over the warm canvas `#FBF9F6` (251,249,246) with shadow ink (61,47,32)
reaches, at **zero blur attenuation** — the absolute ceiling — RGB(238,235,231), CR vs white ≈ **1.18**;
with realistic attenuation across a 4px blur its true peak is nearer **1.09–1.14**. The reported 1.20
exceeds the mathematical ceiling, so that sample was not pure `sm` shadow — most likely a
`--color-border` pixel (`#E6DFD5`, CR ≈ 1.32) or the card/canvas boundary. The two figures were also
measured over **different grounds** (`xs`'s shadow falls on `--color-surface`, `sm`'s on
`--color-bg`), so they were never a like-for-like comparison.

**Consequence, recorded honestly:** on the corrected bound, `0.12` sits *above* `sm`'s peak per-pixel
intensity, and the Implementer's own stated rule would have selected 0.08–0.10. **The chosen value
still stands, but on a different and sounder basis than the one originally given.**

FR-2's lighter-than-`sm` clause is therefore recorded here on the **geometric axis only** — DD-2's
authorised basis, exact and background-independent: `xs` spreads ~2.5 CSS px against `sm`'s ~5, half
the footprint, with geometry frozen at 1px/2px vs 2px/4px. DD-2 pre-authorises exactly this state in
terms — *"stays **geometrically** lighter than `--shadow-sm` … **even at a higher opacity**"* — so the
non-monotonic alpha is an approved design position, not a defect. The peak-CR comparison is
**explicitly not load-bearing** and should not be cited.

#### Leader correction — T-3's monotonicity claim is superseded

T-3's entry above records *"the ladder is strictly monotonic on all three axes (`xs` 1px/2px/0.04 → …)"*,
used as the stand-in for the missing `lg`-vs-`md` frame. After T-2 that global framing is **false at
the `xs`→`sm` step**. **T-3's entry is deliberately left unedited — it was true when written** — and
the supersession is recorded here instead.

**T-3's inference survives on its own terms:** it needed only `md` 0.10 → `lg` 0.14, which T-2 did not
touch, so `lg > md` remains deterministic on all three axes and T-3's conclusion is unaffected. Only
the over-broad "all three axes" phrasing is retracted. The ladder remains strictly monotonic in
**offset and blur** across all four rungs; it is no longer monotonic in **alpha**, by design.

#### ADVISORY (4R lens) — recorded, non-gating, **not** convertible into tasks

| # | Lens | Finding | Disposition |
|---|---|---|---|
| **1** | risk | **T-2's evidence is not durable, and FR-2 needs it later.** The candidate PNGs and pixel dumps live only in the session scratchpad; no `captures/` directory exists under this spec. `requirements.md` §8 classes FR-2 as having **no automated check**, T-6 §3 must present FR-2 for explicit human approval, and T-6 disqualifier (a) requires captures. Regenerating at T-6 risks a non-reproducible comparison | **Carried into the T-6 brief.** T-6 already owns a durable capture set (`tasks.md` T-6 Files lists "+ captures"), so this is scope T-6 has, not new scope |
| **2** | risk | **`design.md` §3 cites a section that does not exist.** Its whitelist row reads "`docs/ux-ui/design.md` \| §7 `--shadow-xs` value, **§5.1** ladder note", but that file's §5 is *Navigation Model* with no §5.1 — the §5.1 ladder note lives in `app-visual-refresh/design.md`. Independently flagged by the Implementer's `Not Done` field and by the Reviewer | **Carried into the T-6 brief** so T-6's §3 diff check is not run against a phantom target. Also relevant had the fallback been taken, since T-2's fallback clause cites the same phantom §5.1 |
| **3** | readability | A one-clause pointer at line 120 would close the remaining discoverability gap: an agent editing `design.md:120-123` sees `.12` above `.07` with nothing on-screen explaining it, and a targeted `Read` with an offset would miss the note 46 lines below | **Recorded and closed here.** Not worth a third rework round; the Reviewer's own recommendation is to fold it into whatever next change touches §7 |
| **4** | readability | "a much smaller 2px footprint" in the new note is loose — 2px is the blur radius; painted extent is offset 1px + blur 2px. Defensible shorthand; "a 1px/2px footprint" would be exact | **Recorded and closed here** |
| **5** | risk | Edit B's placement (~46 lines below the token block) is "acceptable, not ideal" — mitigated by sitting in the blockquote where all four other cross-cutting token notes live, immediately adjacent to the dark-scope note listing the same four alphas, so the two read as a pair. No spec clause governs placement | **Recorded and closed here** |

**Issues encountered.** One rework round consumed, on a genuine defect. Two process notes:

1. **The failing sweep was a grep-pattern defect, not a diligence failure** — `0.04` cannot match
   `` `.04` ``. Attempt 2's brief therefore supplied the pattern (`\.04\b`) and the section's true
   line range (75–165) rather than repeating the instruction to "sweep carefully".
2. Both Reviewers again went idle without emitting a verdict and were re-prompted; each resent its
   completed audit rather than redoing it, so **no rework attempt was consumed** by either. Fourth and
   fifth occurrences — a harness delivery pattern, not a work failure.

**Final verification result:** 129/129 contrast pairs pass · build succeeds, `/register` 111 kB
unchanged · lint clean · `--shadow-xs` moved across a real perceptual boundary (Δ6 → Δ18 peak),
corroborated by two independent methods and a second observer · §7 self-consistent end to end, with
the shape-claim term class swept and clear · no orphan token, fallback correctly not taken.

**Commit:** `35dd05a`

---

### T-4 — Associate the GPS copy, and stop the badges stretching

| Field | Value |
|---|---|
| **Status** | **PASS** (on attempt 3 — the final attempt) |
| **Date** | 2026-08-08 |
| **Implementer attempts** | **3** (the 3-attempt ceiling, reached but not exceeded) |
| **Reviewer verdicts** | 1 → `FAIL` · 2 → `FAIL` · 3 → `PASS` |
| **Requirements covered** | FR-5 (all clauses) · FR-6 (all clauses) · NFR-3 |
| **Design** | §7.3, §7.4 |
| **Skills assigned** | `react-doctor`, `vercel-react-best-practices` (attempts 2–3: `react-doctor` only — comment-only remediations) |
| **Effort assigned** | attempt 1 `high` · attempt 2 **`xhigh`** · attempt 3 **`xhigh`** |

**Effort note.** Attempt 3 stayed at `xhigh` rather than escalating to `max`: the *Tier ↔ effort rule*
forbids `max` on a cheaper tier (the Implementer is T2), and the remaining work was a subtractive
edit where brief precision mattered more than reasoning depth.

#### The code, settled at attempt 1 and unchanged thereafter

**FR-5 — GPS copy programmatically associated.** `renderInput` gained a **6th** optional positional
parameter `extraDescribedBy`, composed into the existing token list so the per-field hint is
**appended alongside, never replaced**:

```tsx
aria-describedby={
  [hint ? `${id}-hint` : '', extraDescribedBy ?? '', error ? `${id}-error` : '']
    .filter(Boolean).join(' ') || undefined
}
```

`gpsHintId = \`${baseId}-gps-hint\`` follows the existing `baseId` pattern (as `${baseId}-crops-label`
does) rather than a hardcoded string; the GPS `<p>` carries `id={gpsHintId}`; both GPS calls pass it.

| Input | Before | After |
|---|---|---|
| GPS latitude | `…-gpsLatitude-hint` | `…-gpsLatitude-hint …-gps-hint` |
| GPS longitude | `…-gpsLongitude-hint` | `…-gpsLongitude-hint …-gps-hint` |

**FR-6 — badges hug content.** `self-start` added to **both** `SourceBadge` and `ConsentBadge`, on the
**badge itself** rather than the wrapper, per `design.md` §7.3 so it holds under any future
re-parenting.

#### Evidence — both halves cleared their disqualifiers

**FR-5 (disqualifier: presence assertions).** A new RTL test asserts the **resolved accessible
description** for both inputs via `toHaveAccessibleDescription`, four assertions covering the shared
copy *and* each per-field hint. The Implementer read
`node_modules/@testing-library/jest-dom/dist/matchers-98b869c1.js:468-508` first to confirm the
matcher resolves `aria-describedby` to referenced elements' text via `dom-accessibility-api` rather
than reading the attribute string — the difference between a behavioural proof and **KZ-002**.

**FR-6 (disqualifier (a): only a measured width proves the fix).** jsdom cannot measure layout, so
this was closed in a real browser: Playwright/Chromium at 1440×900 against a throwaway harness
rendering the **real exported `ActorsTable`** (KZ-003 again — plain props, no Cognito), reproducing the
production wrapper chain rather than approximating it. Harness deleted; absent from `git status` and
from the build's 23-route list.

| State | `Published` | longer-status badge | Reading |
|---|---|---|---|
| **Before** | **120.53 px** | **120.53 px** | **Identical despite different text** — the stretch defect established, not assumed. `cellWidth 152.53 = 120.53 + 32` (`px-4`×2) confirms the badge filled its cell's content box |
| **After** | 72.547 px | 57.0625 px | Differ, and each equals text + padding exactly: 56.547+8+8 and 41.0625+8+8 |

The Reviewer ruled the revert-and-remeasure baseline legitimate (the only layout-affecting delta in
those class strings was `self-start`; the rest was comment) and the arithmetic exact (no border class,
so border-box = content + padding).

**NFR-4 — the highest-risk item in the diff.** A 6th *optional positional* parameter silently
mis-binds if any existing call already passes six arguments. The Reviewer swept **all eleven**
`renderInput(` call sites: argument counts 4, 2, 2, **6, 6**, 5, 4, 5, 2, 4, 4 — only the two GPS calls
pass a 6th, and both pass `gpsHintId`. `ActorForm.tsx`'s `renderInput` is a separate function,
untouched. `next.config.mjs` sets no `typescript.ignoreBuildErrors`, so the green build is a real
type-check of the new signature.

#### Attempt 1 — `FAIL`: a fresh KZ-008 defect

The explanatory comment added to `ActorsTable.tsx` claimed the badge is *"dropped into more than one
`flex flex-col` parent (ConsentCell, the ≥lg row actions, the <lg card list)"* with *"the default
`align-items: stretch` on any of them"*. Grepped against the code, **two of three named sites were
false**: the ≥lg site is a `<td>` (not a flex container at all, and `RowActions` contains **no badge**),
and the `<lg` card site is `flex items-center` — a row, with centring, which does not stretch.

A committed comment asserting a tree the code lacks, landed inside the spec whose FR-4 exists to
remove that exact class from `contrast.test.ts`. The `self-start` code was correct throughout.

#### Attempt 2 — `FAIL`: the fix reintroduced the defect in miniature

The rewritten prose was verified **true clause by clause**. But inserting ~10 comment lines shifted
every site the comment cited, leaving all three coordinates **stale by exactly 8**:

| Cited | Resolves to | Real site |
|---|---|---|
| `:670` | the trader-name `<td>`, which renders **no badge** | `:677/:678` |
| `:440` | inside the `<article>` whose class is **`flex flex-col gap-3`** — *inverting* the comment's own "a row, not a column" | `:448` |
| `:343` | `function ConsentCell({` | `:351` |

**Leader-predicted before the audit ran** and flagged in the Reviewer's brief as the most likely
residual defect — the comment's own insertion moved the lines it cited.

#### Attempt 3 — `PASS`: subtractive, not renumbered

Remediation was **deletion of the coordinates, not correction of them.** Renumbering restores a defect
that had already recurred once inside a single task and would recur on the next edit to the file;
deletion ends it permanently, and the descriptive text ("`flex flex-col gap-1`") remains findable by
search. Verified by the Leader against the saved file:
`grep -nE ":[0-9]{2,}|\(:"` → **no matches**. Class strings byte-identical across all three attempts.

`npm test -- RegistrationForm ActorsTable --silent` → **2 suites, 46 tests pass** · `npx next lint
--quiet` → clean. `npm run build` skipped on attempts 2–3 by Leader authorisation (comment-only);
run green on attempt 1, with `/register` 7.61 kB / 111 kB and `/admin/actors` 7.79 kB / 161 kB
unchanged (NFR-6).

#### Two Leader errors, recorded

1. **An ambiguous citation in the attempt-2 brief.** It said to cite "`design.md` §7.3" without naming
   *which* `design.md`. The Implementer checked `docs/ux-ui/design.md`, correctly found it has no
   numbered subsections, and **declined to cite a section it could not resolve** — substituting an
   accurate `requirements.md` FR-6 reference. §7.3 does exist, at line 86 of the **spec's** `design.md`.
   The worker's method was right and its conclusion was wrong because the brief was ambiguous; the
   Reviewer ruled the substitution accurate and the missing citation **not** a defect. Worth noting
   the worker generalised "no numbered subsections" from one file to another without checking the
   second — safe here, but the same shortcut on a load-bearing citation produces the very defect
   under remediation.
2. **A worked example that damaged the prose.** The attempt-3 brief supplied
   *"…at ≥lg (:670, not a flex container)"* → *"…at ≥lg, not a flex container"*, which is correct for a
   one-item parenthetical and wrong for a **two-item list** — the parentheses were carrying the
   grouping. The Implementer followed it faithfully, producing prose whose claims are true under a
   correct parse but whose negation can be mis-bound across both items. Carried as an advisory rather
   than a fourth attempt (there was none available), on the Reviewer's ruling below.

#### Reviewer's ruling on the residual ambiguity — advisory, not a violation

The Leader put the rollback consequence in the brief explicitly: a FAIL here would HALT and
`git restore .`, **discarding the conformant `self-start` fix, the FR-5 ARIA wiring and the new RTL
test**, none of which had any defect. Not to lower the bar, but because a Reviewer weighing comma
placement against that loss should know the real trade. The ruling:

- **KZ-008 governs the truth value of an assertion** — that is what makes it falsifiable and therefore
  the same class as a missing test. Every clause here is true; only the grouping punctuation is
  damaged, and the mis-parse self-corrects on the following clause. Extending KZ-008 to recoverable
  ambiguity would convert it into a prose-quality rule, which is neither what it says nor what it was
  recorded for.
- **Strictly better than what it replaced:** three definitively false coordinates, one inverting its
  own claim, traded for claims true under a correct parse.
- **The comment is entirely optional** — nothing in FR-6, T-4 or the design requires a comment at the
  badge sites; deleting both blocks would be fully conformant. An optional true comment cannot be the
  thing that HALTs a task and discards working code.

#### Two spec defects found — the code is right and the documents are wrong

1. **`requirements.md` FR-6 asserts `SourceBadge` shares "the identical class string and the identical
   wrapper."** The class string claim is true; **the wrapper claim is false** — `SourceBadge` is never a
   child of `ConsentCell`'s `flex flex-col` wrapper. Its parents are a `<td>` at ≥lg and a
   `flex items-center` row in the `<lg` card, **neither of which stretches it**. §9's second structural
   fact generalises the stretch to both badges on the same wrong premise.
   **Consequence for the record: `SourceBadge`'s fix is DEFENSIVE, not verified-fixed.** It had no
   width defect at its current call sites, so it is unmeasured and *unmeasurable* there. Only
   `ConsentBadge` was measured — which is exactly what T-4's Done-when names, so this is a **complete
   discharge, not a gap**. FR-6's obligation to apply it to `SourceBadge` is satisfied, and
   disqualifier (b) does not trigger. Recorded in these words because **two attempts independently
   re-derived this**, which is the cost of leaving it unwritten. The committed code comment is now
   *more* accurate than FR-6's own rationale.
2. **`design.md` §3's whitelist omits `frontend/components/register/RegistrationForm.test.tsx`**, while
   T-4's Done-when *mandates* "assert in RTL, not by reading the source" — unsatisfiable without a test
   file. §3 already lists `contrast.test.ts`, so the table was never production-only; the omission is
   in the whitelist, not the diff. §11's budget line even allots "tests ~25" (the actual hunk is 24).
   **Standing ruling: this is in scope, and T-6's Done-when check must expect ELEVEN files, not ten** —
   the ten listed plus this test file. Surfaced to the user at the T-4 gate as a candidate §3
   amendment, since amending an approved spec document is the user's call, not the Leader's.

#### ADVISORY (4R lens) — recorded, non-gating, **not** convertible into tasks

| # | Lens | Finding | Disposition |
|---|---|---|---|
| **1** | readability | The attempt-3 deletion cost the two-item list its grouping: *"parents are a plain `<td>` at ≥lg, not a flex container and a `flex items-center` row in the <lg card, a row, not a column"* — a careless reader can bind the negation across both items. Reviewer supplied a rewrite that splits the list and **adds no `file:line` references** | **Recorded and closed here.** For whatever next change touches `ActorsTable.tsx`; not owed by T-4. Any rewrite must keep the two facts separable and must not reintroduce coordinates, which have gone stale **twice** inside this one task |
| **2** | risk | `self-start` overrides the parent's `items-center` for both badges in the `<lg` card row, top-aligning instead of centring. **Inert today** — both badges are single-line and equal height, so start and centre coincide. A difference appears only if a label wraps at a narrow width. A consequence of §7.3 mandating the child-side fix, not a deviation, and it touches no FR-6 protected property | **Carried into the T-6 brief** — worth one glance in the 375 px card capture rather than a surprise |
| **3** | readability | The attempt-1 report described `extraDescribedBy` as "a 9th param"; it is the **6th**. Code correct, report wrong. Transient, so not a FAIL — but it becomes a KZ-008 defect the moment it is copied into a persistent audit record | **Actioned:** recorded as "6th" above. Flagged by the Reviewer specifically to stop the propagation |

**Issues encountered.** Two rework rounds consumed, both on comment accuracy rather than code — the
`self-start` fix and FR-5 wiring were correct from attempt 1 and never changed. Reviewers again went
idle without emitting verdicts and were re-prompted; each resent its completed audit rather than
redoing it, so **no rework attempt was consumed** by the delivery pattern. Occurrences 6, 7 and 8.

**Final verification result:** 46 tests pass across 2 suites · lint clean · build green (attempt 1)
with both route bundles unchanged · FR-5 closed on a resolved-accessible-description assertion, not a
presence check · FR-6 closed on a real-browser before/after measurement showing 120.53/120.53 px →
72.547/57.0625 px, each exactly text + padding · zero `file:line` coordinates remaining in
`ActorsTable.tsx`.

**Commit:** `27c7097`

---

### T-5 — Evaluate form density against a rendered baseline

| Field | Value |
|---|---|
| **Status** | **PASS** |
| **Date** | 2026-08-08 |
| **Implementer attempts** | **1** |
| **Reviewer verdict** | `STATUS: PASS` |
| **Requirements covered** | FR-7 (all clauses, **including the no-change outcome**) |
| **Design** | DD-5 |
| **Skills assigned** | `ui-ux-pro-max`, `frontend-design` |
| **Effort assigned** | `high` |
| **Outcome** | **NO CHANGE ADOPTED.** `git diff --stat` empty. FR-7 discharged by its no-change branch |

**This is a deliberate, evidenced decision — not an omission.** `tasks.md` sizes T-5 at "0–20 LOC —
**may correctly be 0**"; its Done-when states *"Evaluated at three widths, no change warranted" fully
satisfies FR-7*; `requirements.md` §11 Q3 confirms the no-change close "is a pass, not a failure".
The Leader's brief said so explicitly and warned that hunting for something to tune so the task has
an output is the failure mode disqualifier (a) exists to catch.

#### Evidence

Six captures at 375 / 768 / 1440 on both forms, `deviceScaleFactor: 2`, in-page `window.innerWidth`
asserted per shot and matching target exactly on all six. Rendered against the **post-T-1 tree at
`27c7097`**, which DD-5 requires as the baseline. The Reviewer independently corroborated the
metadata from the files themselves: pixel widths are 2880 / 1536 / 750, exactly 375/768/1440 at
`deviceScaleFactor: 2`.

#### The finding — better than the premise it was given

The spec's premise was *"at 1440 the forms read loose"*, inherited from DR-5. Checked against the
actual render, that does not hold **as a section-density defect**. The salient whitespace is
**underfilled grid cells**, which is a grid-arrangement property — and FR-7's disqualifier (b)
explicitly forbids changing the field arrangement. No one-step padding or gap change touches it.

The Reviewer verified the diagnosis field-by-field against `ActorForm.tsx` (container
`flex flex-col gap-6` at :778; six cards `p-4 sm:p-6`; no `Field` carries a `col-span`, so field count
maps 1:1 to grid cells):

| Section | Grid | Fields | Empty cells at ≥1024 |
|---|---|---|---|
| Identity | `lg:grid-cols-3` | 5 | 1 |
| Location | `lg:grid-cols-3` | 7 | 2 |
| Capacity & support | `sm:grid-cols-2` | 2 | 0 |
| Contact | `sm:grid-cols-2` | 2 | 0 |
| Crops | `flex flex-wrap` (not a grid) | 3 checkboxes | full-width card, one short row |
| **Consent & provenance** | `lg:grid-cols-4` | 5 | **3 adjacent** |

**Two corrections to the record, neither verdict-changing** — and both mean the case was *understated*:

1. **Row mis-attribution, made by both the Implementer and the Leader.** Location's row 2 (GPS
   latitude / longitude / **altitude**) is **full**; both empty cells sit in the GPS-**accuracy** row.
   The Leader asserted otherwise when adjudicating the pixels and is corrected here.
2. **The largest contiguous empty block is `Consent & provenance`** — 5 fields in `lg:grid-cols-4`,
   three adjacent empty cells — which **neither** the Implementer nor the Leader singled out. It is the
   strongest support for the diagnosis, so the load-bearing conclusion was under-argued, not inflated.

`RegistrationForm` (5 cards, `gap-6`, all grids `lg:grid-cols-2`) fills its grids more completely —
Location's first grid and Contact each leave **one** empty cell, versus ActorForm's two-to-three
adjacent. The Reviewer noted the report's stronger phrasing ("does not show ActorForm's empty-cell
looseness") overstates slightly in kind while being right in degree.

#### Why "no change" is reasoned rather than a shrug

The Reviewer's assessment, which the Leader adopts: the report **locates** the actual source of the
whitespace, **shows it is outside FR-7's permitted reach**, and **states a falsification condition** —
a one-step tightened candidate (e.g. `gap-6`→`gap-5`) that visibly read calmer without shrinking a hit
area or changing arrangement. Having established that the only permitted lever cannot move the
observed effect, declining to build that candidate is coherent rather than evasive. It also declined
to claim an improvement it could not point to, which is exactly what FR-7's `AND IT MUST` clause and
`requirements.md` §10 ("inconclusive MUST be reportable as inconclusive") require.

**Done-when satisfied without an "after" state.** The Leader briefed the Reviewer that this was the
one place a defensible FAIL existed. It ruled the clause discharged, on three independent spec
statements: the Done-when's own gloss ("not required to produce a diff"); FR-7's criterion being
**conditional** ("GIVEN both forms captured before and after **any spacing change**" — with no change,
the GIVEN never fires); and disqualifier (a) being **one-directional** ("**spacing changed** without a
before/after comparison"), so the comparison burden attaches to *adopting*, not to *declining*.

**T-1's `mb-4` correctly excluded.** All eleven legends verified carrying it (6 × 16 px = 96 px on
`ActorForm`, 5 × 16 px = 80 px on `RegistrationForm`), matching the figure in the Leader's brief. DD-5
makes that spacing part of the baseline rather than fat to trim, and it was treated so. **No spurious
tightening** — the specific trap this task walked into naturally.

**Disqualifier sweep:** (a) no spacing change, nothing to justify · (b) no diff, so no hit area and no
grid arrangement changed · (c) no Tailwind scale step taken, so §11's tripwire is not near. Verify
commands skipped by Leader authorisation — the tree is unchanged, so a green suite would prove nothing
about FR-7.

#### A correction to a KZ-003 assumption three tasks relied on

The Implementer reports — and the Reviewer confirmed at `frontend/lib/auth/RequireRole.tsx:84-90` and
`app/(admin)/layout.tsx:86` — that `RequireRole` returns `null` and `router.replace('/login')` for a
`Public` session, wrapping the whole `(admin)` group. **So plain props alone do not render an admin
route**; the harness had to be placed **outside** the guarded route group.

KZ-003 still holds (the component genuinely takes plain props and needs no stack), but the shortcut is
narrower than three prior tasks' success implied: it works because the harness escapes the guard, not
because the guard tolerates fake props. The Reviewer's framing is the right one — this is a limitation
of the throwaway shortcut, **not** a refutation of the documented method, which is a Playwright
`state.json` storage state from a real admin session
(`app-visual-refresh/captures/README.md:46-49`).

#### Evidence preserved into the repository — Leader action

Acting on the Reviewer's advisory 4 **during T-5's close-out rather than deferring**: the captures
existed only in a session scratchpad subject to reclamation, and FR-7 has **no automated gate**
(`requirements.md` §8), so T-5's sole evidence would have vanished. Thirteen PNGs (2.0 MB) copied to
`docs/specs/enhancement/form-elevation-ux/captures/`, following the predecessor's precedent of
committing PNG evidence:

- **FR-7 (T-5):** `{actor,registration}-form-{375,768,1440}.png` — the six-capture set above.
- **FR-2 (T-2):** `card-004.png` / `card-012.png` (the native-scale pair) and
  `sweep-00-none-zoom.png` / `sweep-01-current-004-zoom.png` / `g-0.12-zoom.png` (the 4× no-blur
  crops that actually settled it).
- **FR-1 (T-1):** `register-form__1440__corner.png` / `actorform-harness__1440__corner.png`.

These are the three requirements `requirements.md` §8 classes as having **no automated check**. T-6 §3
must present them for explicit human approval, so they needed to outlive the session.

#### ADVISORY (4R lens) — recorded, non-gating, **not** convertible into tasks

All five bear on T-6 and are **carried into its brief**; none blocks T-5.

| # | Lens | Finding | Disposition |
|---|---|---|---|
| **1** | risk | **The 768 and 375 ActorForm frames are not representative and must not be reused as T-6 evidence.** The harness renders cards edge-to-edge with no page padding and no sidebar; the real route adds `p-4 sm:p-6` on `<main>` plus a 224 px `md:w-56` aside — ≈496 px of content at 768 versus ≈720 px captured. The **1440** frame *is* faithful, since `mx-auto max-w-4xl` (896 px) binds under both the harness and the real 1120 px content region | Carried to T-6 |
| **2** | risk | **The admin ground is white, not the warm canvas.** `app/(admin)/layout.tsx:87` sets `bg-surface` (`#FFFFFF`) while `body` is `--color-bg` `#FBF9F6`. On `/admin/actors/new` the card fill **equals** its ground, so separation rests on `border-border` + `shadow-sm` **alone** — making **NFR-1's border floor load-bearing there in a way it is not on `/register`**. Also means FR-1's description ("filled fieldsets on a warm canvas") is true for `/register` and **not** for the admin route | Carried to T-6. Materially sharpens why NFR-1 forbids trading the border for a shadow |
| **3** | risk | A dev-mode overlay is painted over content in three T-5 captures (over "Capacity (tons)" at 768, over the latitude hint at 375, at the left edge of `registration-form-1440`). Tolerable in a density probe; **not** acceptable in T-6's evidence set | Carried to T-6 |
| **4** | risk | The captures were transient and FR-7 has no automated gate | **Actioned this task** — see above |
| **5** | risk | These are **local-tree** captures with the backend down, whereas `requirements.md` §7 points rendered verification at the Dev CloudFront origin. Correct for T-5 (the post-T-1 tree is undeployed), but **T-6 must not inherit them as deployed evidence**, and should use storage state against the real routes | Carried to T-6 |

**Issues encountered:** none in the work. The Reviewer again went idle without emitting its verdict and
resent the completed audit on re-prompt — no rework attempt consumed. Occurrence 9.

**Final verification result:** six captures at asserted widths on both forms against the correct
post-T-1 baseline · grid-cell diagnosis verified field-by-field against the source · no spacing
changed, no hit area touched, no grid arrangement altered · **FR-7 discharged by the no-change
branch, as a recorded decision backed by a comparison.**

**Commit:** `225a4e4`

---

### T-6 — Close FR-4's sweep, capture the full rendered set, and run the human gate

| Field | Value |
|---|---|
| **Status** | **PASS — all three acts complete.** *(Corrected at archive, 2026-08-08: this row read "`[~]` — ACT 1 COMPLETE, ACTS 2 AND 3 OUTSTANDING", written when acts 2–3 were still blocked and never refreshed when they closed further down this entry. The header table contradicted its own body — a KZ-008 defect in the record of the task that spent two rework rounds removing that exact class. Corrected rather than left, because an archived record that contradicts itself misleads every later reader; the original wording is preserved in this note.)* |
| **Date** | 2026-08-08 |
| **Act 1 (FR-4 closure)** | **PASS** — Implementer 1 attempt, Reviewer `STATUS: PASS` |
| **Act 2 (deployed capture set)** | **COMPLETE** — 4 surfaces × 3 widths against deployed Dev after invalidation `I266OLYP1OP2U17COUWOEGAXF0` |
| **Act 3 (human visual gate)** | **DISCHARGED** — explicit user approval of FR-1, FR-2 and FR-7 |
| **Requirements covered** | **FR-4 (all clauses), plus FR-1 / FR-2 / FR-7 rendered closure, NFR-5, NFR-6 — all closed** |
| **Design** | DD-4 |
| **Skills assigned** | `tailwind-design-system` |
| **Effort assigned** | `xhigh` |

**Written when act 1 landed alone, and left in place.** At the time the task was held at `[~]`
deliberately: act 1 needed no deploy, and the remaining two acts were gated on things no agent can
supply. Both have since closed — see "Act 2" and "Act 3" below.

#### Act 1 — FR-4 closure: PASS

**Scope of the sweep, measured rather than assumed.** The Leader's regex found 33 citations; the
Implementer derived its own list from the file and found more, and the Reviewer — independently
inventorying all 543 lines — found **34 distinct `file:line` citations** across four locations: the
`GROUNDS` docblock (195–202), all seven `citedAt` strings, the `UNREACHABLE` prose block (383–398),
and the large-text/UI-only comment (428–443).

**The Leader's regex list was deliberately marked non-authoritative in the brief** — "a citation in a
format my pattern missed would be invisible to it, and that is precisely how the last two sweeps
failed." That proved correct: `globals.css:93-96` (a line *range*) and the entire large-text comment
block were outside the regex, **and two of those were stale.**

**Ten stale citations corrected — not the two the spec named.** FR-4's `AND IT MUST` clause requires
sweeping every citation "not only the two named here", and the sweep found five times that number:

| Citation | Disposition | Cause |
|---|---|---|
| `globals.css:93-96` | → **102-106** | Outside the Leader's regex; now exactly bounds the `body { … }` rule |
| `(public)/about/page.tsx:322` | → **81** | **Wrong section**, not merely wrong line — `:322` is inside §3.6 (`bg-surface-alt`), while the citation claims the `bg-bg` section opened at `:58` |
| `shell/Header.tsx:41,48` | → **147** | Old lines land in `AvatarCircle`'s body, unrelated |
| `admin/UsersTable.tsx:333` | → **334** | Off by one |
| `(public)/about/page.tsx:485` | → **`admin/ActorHistoryPanel.tsx:182`** | **Replaced, not renumbered** — see below |
| `admin/ActorsTable.tsx:384` | → **398** | **T-4's** two comment blocks (10 + 4 lines) — exactly the +14 the Leader predicted |
| `admin/ActorForm.tsx:783` | → **784** | The known off-by-one from `app-visual-refresh` T-7, confirmed |
| `register/RegistrationForm.tsx:602` | → **615** | Already stale by one before this spec; **T-1**'s wrapper and **T-4**'s GPS additions shifted it further |
| `directory/ActorCard.tsx:72` | → **73** | `:72` is the bare `<article` tag with no class |
| `(public)/about/page.tsx:227` | → **231** | `:227` is the grid wrapper, not the `bg-surface` card |

Two `GROUNDS` entries also gained a missing `admin/` prefix (`ImportPreviewTable.tsx:98`,
`UsersTable.tsx:282`) — a consistency fix in a file already under edit.

#### The one citation that was replaced rather than renumbered

`(public)/about/page.tsx:485` → `admin/ActorHistoryPanel.tsx:182`. Every other edit renumbers; this
one **swaps which site witnesses the claim** that `primary-hover` is reachable on `surface` — the
closest thing in the diff to fitting evidence to a conclusion, and briefed to the Reviewer as
priority 1.

**The old citation was genuinely false.** `:485` carries `text-primary hover:text-primary-hover` but
sits inside the §3.8 Credits `<section className="bg-surface-alt …">` opened at `:466` — it asserted
`surface` reachability from a `surface-alt` site. The four case-study cards (`:332/:354/:376/:396`,
all `bg-surface`) carry `text-primary` but **no `hover:` variant**; `:485` is the file's only
`hover:text-primary-hover`.

**The new citation is true, and its oddity resolves.** The Leader flagged an apparent contradiction —
the cited line `:182` is *lexically before* the `bg-surface` article the citation says contains it
(`:211`). The Reviewer confirmed the containment is **render-time, not lexical**: `:181-182` sit in
`SnapshotDetails` (149–205), which `HistoryEntry` (207–232) renders at **`:225`, inside** its
`<article className="… bg-surface …">`. Not a KZ-008 defect introduced by the fix — the failure mode
that caught T-4 twice.

The Reviewer also ruled on `:212` vs `:211`: **keep `:212`**, because `:211` is `<article` and `:212`
is the `className` carrying `bg-surface`, and the file's stated method cites the line of the class
literal. Every prior precedent had tag and class on one line, so this is the first case that
distinguishes them.

#### The "unchanged" claims were re-resolved, not accepted

A sweep's characteristic failure is declaring a citation unmoved without reading it, so the Reviewer
independently resolved a targeted sample plus ~25 more:

| Citation | Verdict |
|---|---|
| `ActorsTable.tsx:204` | ✓ unmoved — it precedes T-4's insertions |
| `ActorsTable.tsx:398` | ✓ +14 confirmed; old `:384` now holds the `text-fg` sibling |
| `ConfirmDialog.tsx:216` | ✓ unmoved — **discharges the prior Reviewer's explicit "to be confirmed at T-6, not assumed" flag** on T-3's same-line swap |
| `ActorForm.tsx:784`, `RegistrationForm.tsx:615` | ✓ both resolve to `bg-danger-soft … text-danger` |
| `Header.tsx:147` | ✓ `text-muted` "Signed in ·" inside the `bg-surface` dropdown at `:140` |
| `about/page.tsx:81` | ✓ `text-muted` inside the `bg-bg` section at `:58` |

On collapsing `Header.tsx:41,48` into a single `:147`: **no coverage lost** — the gate is `grounds[]`,
which is untouched, `muted` retains four witnesses across its four grounds, and a second uncited
witness exists at `Header.tsx:218`.

#### The newly-reachable-pairs clause: a reasoned negative, verified two ways

**None added, and that is correct.** The Implementer's matrix argument — every ink whose `grounds[]`
contains `'bg'` also contains `'surface'` — was verified true for all inks. The Reviewer did **not**
rely on that framing alone and enumerated the inks actually rendered inside the 11 fieldsets:
`text-fg` (legends, labels), `text-muted` (hints, placeholders), `text-danger` (required markers,
errors), and `text-primary` on the checkbox accent — **the one ink the matrix framing could have
missed**, since `primary` has no `'bg'` entry. It is already gated on `surface`. `ConsentPolicyDisclosure`,
nested inside a `RegistrationForm` fieldset, adds nothing new.

**Additionally over-determined:** per `requirements.md` §9 the fieldsets already carried `bg-surface`
before this spec — `app-visual-refresh` T-7 put it there, and T-1 only moved the fill to a wrapper.
**The ground never changed**, so FR-4's bg→surface clause had nothing to catch. This was flagged in
the Leader's brief and is now confirmed.

#### Ledger integrity — the absolute clause, verified by three routes

FR-4: *"**BUT it MUST NOT** weaken, skip, or delete an existing failing-pair ledger entry to make the
suite pass."*

1. `KNOWN_FAILURES` is still `const KNOWN_FAILURES: KnownFailure[] = [];` (`:236`), interface and
   `findKnownFailure` intact.
2. No `grounds[]` array changed — all 11 changed lines accounted for as `citedAt` strings or comment
   text (2 docblock + 1 `globals.css` + 3 `muted` + 1 `primary-hover` + 2 `danger` + 2 large-text).
3. **Structural corroboration, the strongest of the three:** the current `grounds[]` produce
   22 gated + 41 unreachable + 10 large-text + 39 frozen + 12 seam + 5 accounting = **exactly 129**.
   Any `grounds[]` edit would shift the 22/41 split and move that total. **The identical 129/129
   before and after is therefore evidence, not merely consistent with the claim.**

**Verification:** `npm test -- contrast --silent` → **129/129 passed**, before and after.
`git diff --stat` → only `frontend/lib/contrast.test.ts`, 11 insertions / 11 deletions.

#### Two citations deliberately left alone — ruled acceptable

`directory/ActorCard.tsx:95` and `(public)/about/page.tsx:239` cite a `CROP_TEXT[…]` **lookup** line
rather than the static `Record` literal. The Implementer flagged them and declined to rewrite the
citation convention unilaterally. The Reviewer ruled **leaving them correct, not merely acceptable**:
the prose claims "every `text-crop-*` **site** … renders inside a `bg-surface` card", and for a
*reachability* claim the site is where ink meets ground — the application line, not the lookup table.
Both also sit outside `REACHABLE` proper, so sweeping them at all exceeded FR-4's literal clause.

#### ADVISORY (4R lens) — recorded, non-gating, **not** convertible into tasks

| # | Lens | Finding | Disposition |
|---|---|---|---|
| **1** | risk | **`home/Hero.tsx:60` points at a comment, not the class.** `:60` is `// bg-surface with shadow-md …`; the applied class is `:61`. The pair is true and nothing is misasserted, but this is **the same off-by-one shape as the two citations FR-4 was written for**, and it survived because `grep -rn 'bg-surface'` legitimately matches a comment. Suggest `:60,66` → `:61,66` | **Recorded and closed.** A live-but-harmless citation defect; an advisory may not mint a task. Genuinely worth folding into the next change touching this file |
| **2** | risk | **`primary` / `primary-hover` are demonstrably reachable on `surface-alt`** — `about/page.tsx:485` renders exactly that combination inside the `bg-surface-alt` section — yet both sit in `UNREACHABLE`, which the file's own PROMOTION RULE says to correct. **Outside FR-4's clauses** (scoped to fieldsets and the bg→surface migration) and it masks no failure: `#1F4E8C` on `#F4F0EA` computes to **≈7.3:1**, and `primary-hover` is darker still, so both would pass on promotion | **Recorded and closed.** Warrants a follow-up proposal, not a rework round. Notable that the Implementer had this evidence in hand when it moved the citation |
| **3** | readability | A docblock claim at 264–268 ("Every site cited below uses a static, purge-safe class literal") is now slightly overstated — the crop citations resolve through a runtime `Record` lookup. Literals are static so purge-safety holds; the *application* is dynamic. Pre-existing, untouched by this diff | **Recorded and closed** |

#### What remains before T-6 can close

| Act | Blocker | Owner |
|---|---|---|
| **2 — deployed capture set** | `/register`, `/admin/actors/new`, the admin table and one open dialog at 375/768/1440, against the Dev CloudFront origin per `requirements.md` §7. **Requires an operator-run deploy** (`infra/scripts/deploy-frontend.sh --profile IBD-DEV`) — deploys are never agent-run. All evidence to date is local-tree | **User** deploys; agent captures |
| **3 — human visual gate** | Explicit approval of **FR-1, FR-2 and FR-7**, the three requirements with no automated gate (`requirements.md` §8). T-6 disqualifier (c): *"continue", "do as you see fit", or silence are **not** aesthetic sign-off* — a conflation this project already had to correct once | **User only** |
| **Diff-scope check** | ~~T-6's Done-when requires `git diff --stat` show "only the 10 files in `design.md` §3". **It will show 11**~~ — **RESOLVED, see below** | ~~User decision~~ **Done** |

#### `design.md` §3 amended, and both machine-checkable gates now run green

User-approved at the T-6 gate (2026-08-08). Two factual corrections to §3, neither widening scope:

1. **`frontend/components/register/RegistrationForm.test.tsx` added to the whitelist.** T-4's
   Done-when *mandates* "assert in RTL, not by reading the source", which no other file can carry —
   §3 could not simultaneously require an RTL assertion and forbid the only file able to hold one.
   §3 already listed `contrast.test.ts`, so the table was never production-files-only, and §11's
   budget already allotted "tests ~25" (the actual hunk is 24). The omission was in the whitelist,
   not in the diff.
2. **The phantom `§5.1` reference removed.** The `docs/ux-ui/design.md` row cited a "§5.1 ladder
   note" in a file whose §5 is *Navigation Model* with no §5.1 — that note lives in
   `app-visual-refresh/design.md`. Flagged independently by the T-2 Implementer (which correctly
   declined to cite a section it could not resolve) and by two Reviewers. **FR-2's fallback branch
   cites the same phantom section**, so had that branch been taken it would have sent a worker
   hunting for a section that does not exist.

`tasks.md` T-6's Done-when is annotated to check against §3's list **as it now stands**, not against
the literal number 10.

**Gate 1 — diff scope (T-6 Done-when).** `git diff --name-only 02ce79d..HEAD`, excluding the spec's
own folder: **exactly 11 files, matching §3's amended list one-for-one** — `docs/ux-ui/design.md`,
`globals.css`, the four dialogs, `ActorForm.tsx`, `ActorsTable.tsx`, `RegistrationForm.tsx`,
`RegistrationForm.test.tsx`, `contrast.test.ts`. **No file outside §3 changed. PASS.**

**Gate 2 — LOC tripwire (`design.md` §11, >200).** Measured on the **`git diff -w`** basis per the
standing ruling recorded in T-1's entry: **133 insertions / 47 deletions** against a ~120 estimate.
**Within budget; tripwire not tripped.**

The ruling earns itself here: the **raw** count over the same range is **334 insertions / 248
deletions**, which would have tripped the 200-line tripwire and forced a spurious escalation. The
excess is reindentation from T-1's 11 wrapper elements, not new logic.

**Carried into act 2's brief when it runs** — the advisories accumulated from T-1, T-2, T-3, T-5:
the `768`/`375` ActorForm harness frames are **not** representative of the real route (missing page
padding and sidebar; ≈496 px real content at 768 vs ≈720 px captured) · the admin shell is
`bg-surface` **white**, so card fill equals ground there and **NFR-1's border floor is load-bearing on
admin surfaces in a way it is not on `/register`** · a dev-mode overlay paints over content in three
T-5 frames and must not appear in act 2's set · authenticated surfaces need a Playwright `state.json`
storage state, since `RequireRole` redirects before content renders · the known-stale
`ConfirmDialog.tsx:216` question is now **discharged**, not outstanding.

**Issues encountered.** The Implementer and the Reviewer both went idle without emitting reports and
resent completed work on re-prompt — occurrences 10 and 11 of the harness delivery pattern; **no
rework attempt consumed** by any of them.

**Act 1 final verification result:** 34/34 citations resolve against the current tree · 10 stale
citations corrected, including two the Leader's own regex could not see · one false citation replaced
with a verified true one · no ledger entry weakened, skipped or deleted, corroborated structurally ·
129/129 contrast pairs pass, unchanged. **FR-4 is closed.**

**Act 1 commit:** `d1b9e3b`

#### Act 2 — deployed capture set: COMPLETE

**The deploy.** `requirements.md` §7 requires rendered verification against the Dev CloudFront origin,
and `design.md` §12 makes deploys **operator-run**. The user ran
`./infra/scripts/deploy-frontend.sh --profile IBD-DEV` themselves; it failed announcing profile
`MELIA-DEV` and could not describe `accelerate-tz-dev-backend`. **Root cause: the script reads
`AWS_PROFILE` and parses no flags** (`PROFILE="${AWS_PROFILE:-IBD-DEV}"`), so `--profile IBD-DEV` was
silently ignored and the shell's `AWS_PROFILE=MELIA-DEV` won, pointing the lookup at the wrong
account. The user then **explicitly instructed the Leader to deploy with the correct profile.**

Recorded plainly because the script's own header says it is *"NOT run by the SDD agent loop"*: the
Leader ran it **on the user's explicit instruction**, not on its own initiative, after verifying all
three stacks were `UPDATE_COMPLETE` under `IBD-DEV`. Correct invocation is
`AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`.

**Freshness gate (disqualifier (a)) — discharged before any capture.** CloudFront invalidation
`I266OLYP1OP2U17COUWOEGAXF0` was polled to `Completed`, then the Leader fetched the served bundle and
asserted this spec's changes are live in `/_next/static/css/d4851289373f404a.css`:

| Change | Asserted in served CSS |
|---|---|
| T-2 | `--shadow-xs:0 1px 2px rgba(61,47,32,0.12)` |
| T-3 | `.shadow-lg{--tw-shadow:var(--shadow-lg);--tw-shadow-colored:var(--shadow-lg)}` |
| T-4 | `self-start` present |

**Auth.** The existing Playwright storage state's id/access tokens had expired ~24 h earlier
(`exp` −1452 min), but it **silently re-authenticated via its refresh token**. No credentials were
requested, read, or guessed. The Leader had pre-authorised stopping and asking the user for a login
had it failed.

**Captured:** all four surfaces × three widths against the deployed origin. Every one of the 12 base
frames asserts, in page, `window.innerWidth == target` at `devicePixelRatio: 2`, **and** that the
loaded stylesheet is `d4851289373f404a` with `--shadow-xs` resolving to the `0.12` value.

**Safety on a live environment.** The only interaction was opening a delete-confirmation dialog and
dismissing it with Escape. The Reviewer corroborated this from the artefacts rather than accepting
it: `4-dialog__1440.png` and `4-dialog__375.png` show the confirmation field empty, the Delete button
**disabled**, and the helper text "Confirm is disabled until the acknowledgement is entered exactly".
**No create, edit, publish, import, or delete was performed.**

#### Act 3 — the human visual gate: DISCHARGED

`requirements.md` §8 classes FR-1, FR-2 and FR-7 as having **no automated check**, and T-6
disqualifier (c) states that "continue", "do as you see fit", or silence are **not** aesthetic
sign-off. The Leader presented the deployed set and asked three separately-answerable questions. The
user answered each **explicitly**:

| Requirement | User's verdict |
|---|---|
| **FR-1** — legend artefact | **"Approve — artefact resolved"** |
| **FR-2** — `--shadow-xs` perceptibility | **"Approve — visible enough"** |
| **FR-7** — density left unchanged | **"Approve — no change was right"** |

The Reviewer ruled disqualifier (c) satisfied, noting the **FR-2 approval is the strongest of the
three** precisely because it was asked with the honest caveat that the Leader could not distinguish
`0.12` from flat at native scale, and with the pre-authorised removal fallback offered as an equal
option — *"the user approved with the weakness of the evidence in front of them. That is sign-off,
not inference."*

#### Gate results

| Gate | Result |
|---|---|
| **Full suite** `npm test -- --silent` | **86 suites, 1281 tests, ALL PASSED** — a clean run, so the Suite gate's flakiness conditional never fired |
| `npm run build` | **Success**, static export, shared First Load JS 103 kB |
| `npx next lint --quiet` | **No ESLint warnings or errors** |
| **Diff scope** vs amended `design.md` §3 | **exactly 11 files, one-for-one. PASS** |
| **LOC** (`git diff -w`) | **133 insertions / 47 deletions** vs ~120 estimate, 200 tripwire. **PASS** |

#### Two rework rounds on the evidence record itself

**Round 1 — `STATUS: FAIL`, record integrity.** The Reviewer found `manifest.json` asserting of two
PNGs that they showed "FR-1: card top-left corner, border/radius unbroken" — **neither contained a
corner**, and the admin one contained no border edge at all; the capture report compounded it by
describing them as showing "a continuous rounded white border". Two further entries recorded a
`./t6-captures/` path that is not where the files live. **KZ-008 landing in the spec's own evidence
index, for its hardest-gated requirement** — after this spec had already spent FR-4 and two T-4
rework rounds removing that exact class. The Leader had independently found the mis-framing when
adjudicating the pixels and put it in the Reviewer's brief rather than letting it pass.

Remediated **subtractively** per T-4 attempt 3's precedent: the two mis-framed PNGs were **deleted,
not re-cropped**. FR-1's criterion is a silhouette "continuous and unbroken around the full
perimeter", which a whole-card frame demonstrates *better* than a corner crop — so a re-crop would
have meant a fresh authenticated browser run to produce weaker evidence. The three retained crops
were each verified against their `purpose` strings.

**Round 2 — `STATUS: FAIL`, a defect the remediation introduced.** The new `README.md` section
claimed *"Every entry in `deployed/manifest.json` asserts … `window.innerWidth` … and the served
stylesheet"*. False for the three crop records, which carry only `id`/`width`/`file`/`purpose` — so
3 of 15 PNGs had no manifest-recorded tie to the build, **landing on exactly the three artefacts
whose captions had just failed an integrity audit.** Fixed by narrowing the claim to the twelve
full-page frames and stating the crops' weaker, inherited provenance explicitly, with an instruction
to cite a frame rather than a crop when build attribution is the question.

**A Leader authoring note, recorded for transparency.** The round-2 fix was written by the **Leader**,
not an Implementer: `captures/` sits under `docs/specs/<spec-path>/`, which `.agents/leader.md`
assigns to the Leader; the Reviewer had specified the exact remediation; and a further delegated round
for one clause was poor economy. **It was still sent for independent confirmation** — the spec's
terminal gate was not closed on an unaudited Leader edit. The Leader also added a paragraph *beyond*
the remediation (recording that the corner crops existed, were mis-framed, and were deleted) and
explicitly asked the Reviewer to judge it rather than accept it; the Reviewer kept it as "accurate in
substance, appropriate to record" and supplied two one-clause precision corrections, **both applied**
— including one where the Leader's phrasing had overstated the defect.

**Also cleared in round 2:** the Leader had flagged the badge caption's numeric claim
("Team-managed 106.5px vs Published 72.5px") as a possible residual instance of the same class, since
an image cannot demonstrate a measurement. The Reviewer **measured it from the base frame at known
scale** (2880 device px for a 1440 CSS-px viewport) and obtained ≈105 and ≈72 CSS px, corroborating
the caption and T-4's independent `getBoundingClientRect` reading of 72.547 px. **True and checkable
from the artefact set — not a defect.**

#### ADVISORY (4R lens) — recorded, non-gating, **not** convertible into tasks

| # | Lens | Finding | Disposition |
|---|---|---|---|
| **1** | risk | **`/register` scrolls horizontally at 768 px.** `1-register__768.png` is ≈1209 CSS px wide against an `innerWidth` of 768, driven by the header, whose rightmost control sits at ≈1153 CSS px; the footer band would end mid-screen when scrolled right. The admin 768 frame shows no overflow. This is the pre-existing **nav clipping at 768 px** that `requirements.md` §6 puts out of scope and attributes to another spec | **Recorded and closed here.** Now has *deployed* evidence for the `bugfix/` proposal §6 anticipates — cite `captures/deployed/1-register__768.png` |
| **2** | reliability | NFR-6's baseline is the earliest **in-spec** build (T-2, post-T-1), not a pre-spec build at `02ce79d`. Route totals held (`/register` 111 kB at T-2 and again at T-4; `/admin/actors` 161 kB), and the mechanism argument is decisive — the diff adds no import, dependency or component — but a strictly-comparable pre/post pair was never captured | **Recorded and closed** |
| **3** | readability | The `4-dialog` manifest entries are ordered 1440/375/768 with later timestamps on 375/768, evidence of the re-capture after the first attempt targeted a CSS-hidden desktop-table button (zero-size bounding box) rather than the visible card-view control. Not an accuracy defect | **Recorded and closed** |
| **4** | risk | DD-2's recorded design tension — that an input on a white card may be a *well* rather than a raised chip, and might need no shadow at all — **survives** the `0.12` re-tune. Correctly not acted on, and the user has now approved the re-tune | **Closed for this spec** |

**Issues encountered.** Two rework rounds, both on the evidence record rather than on code or
requirements. Every worker in this task went idle without emitting its report and resent completed
work on re-prompt — occurrences 12 through 16 of the harness delivery pattern; **no rework attempt
was consumed by any of them.**

**T-6 final verification result:** FR-4 closed on a 34-citation sweep · four surfaces captured at
three widths against deployed Dev with per-shot bundle-freshness assertions · **explicit user
approval of FR-1, FR-2 and FR-7** · full suite 1281/1281 · build and lint clean · diff scope 11/11
against amended §3 · LOC within budget · evidence record verified internally consistent after two
integrity rounds. **T-6 CLOSES.**

**Commits:** `d1b9e3b` (act 1) · `a5ae948` (§3 amendment + gates) · this entry's commit (acts 2–3)
