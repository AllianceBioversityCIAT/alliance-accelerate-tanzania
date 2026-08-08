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
