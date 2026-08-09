# Execution — Warm-Earth Surface System (app-wide visual refresh)

## Document Control

- **Spec path:** `docs/specs/enhancement/app-visual-refresh/`
- **Approval Mode:** `gated` (from `requirements.md` Document Control)
- **Budget (`design.md` §11):** 6 tasks · **~760 LOC** *(re-baselined 2026-08-07 at the T-1 gate; originally ~200)* · 7 review rounds
- **Tripwire:** >8 tasks, or **any change to a component's markup, classes, props or behaviour** → stop and escalate. *(Was ">300 LOC". Replaced at the T-1 re-baseline because LOC only proxied for NFR-7; then reworded before T-5, because the first replacement read "any task edits a component file" and would have fired on T-5's NFR-7-**pre-authorized** comment-only edits. Full rationale in `design.md` §11.)*
- **Branch:** `enhancement/app-visual-refresh-v2`
- **Execution started:** 2026-08-07

### Agent routing for this run

Hybrid host split, approved by the user at the pre-execution gate.

| Role | Host | Model | Tier |
|---|---|---|---|
| Leader | Claude Code | `opus` (Opus 5, 1M) | T1 |
| Implementer (T-1…T-5) | Claude Code — `.claude/agents/akili-implementer.md` | `sonnet` | T2 |
| Reviewer | **Antigravity (`agy`)** | `claude-opus-4-6-thinking` | T3 |
| Visual gate (T-6) | **Antigravity (`agy`)** | `gemini-3.1-pro-high` | T6 |

**Why the Reviewer is cross-host:** running the Reviewer on a different *host process* makes
`author ≠ auditor` structural rather than conventional — the auditor cannot inherit any part of
the Implementer's context, because it is a different CLI with a different provider.

**Correction (2026-08-07) — how the read-only contract is actually enforced.** This block
originally claimed the Reviewer *"is dispatched with `--mode plan`, which denies writes at the
harness level."* **That is false and was never true in this run.** `--mode plan` is **incompatible
with `--print`**: plan mode proposes a plan and waits for an approval a non-interactive session can
never give, so it dies with *"Error: timeout waiting for response."* It is therefore unavailable as
a capability-level guarantee. The contract is enforced by **detection instead of capability**:
`agy-review.sh` fingerprints `git status --porcelain` + `git diff HEAD | shasum` before and after
each dispatch and exits 99, voiding the verdict, if the tree changed. Every review in this run
reported *"tree unchanged (read-only contract held)."* Left as a correction rather than a silent
edit — a claim about how a safety property is enforced is exactly the kind of assertion KZ-008
covers, and it appeared in the Leader's own document.

The wrapper also greps for a `STATUS:` line and exits **98** when absent, because `agy` can
terminate mid-flight and still exit 0 — see T-5's environment-failure note.

**Why the T-6 visual gate is cross-host:** `requirements.md` §3 names this routing explicitly —
*"Optionally routed to a T6 Multimodal review (registry: Antigravity / `gemini-3.1-pro-high`) for a
comps-vs-render comparison."* Gemini vision is the capability gap; root `CLAUDE.md` § Cross-host
dispatch maps T6 → Antigravity.

---

## OQ-3 resolved — branch base settled

`requirements.md` OQ-3 and `design.md` R-7 blocked **committing** (not implementation) until the
branch base was settled. Resolved at the pre-execution gate by user decision.

**Base:** `enhancement/app-visual-refresh-v2`, cut from `main` (`456f1ce`), then two cherry-picks:

| Commit | Origin | Why it is in the base |
|---|---|---|
| `0efdd3c` | `a048fea` | `[fix] restore the OTP mail send and the sticky public footer`. **Required by T-6:** the fix makes `(public)/layout.tsx` a full-height flex column so the footer sits at the viewport bottom on short pages. T-6 captures the footer as a rendered surface (FR-1 scenario 2); on a bare `main` base the visual gate would be judging a known, already-fixed, unrelated layout defect. |
| `7aeb358` | `5514fa6` | The spec itself (`proposal.md`, `requirements.md`, `design.md`, `tasks.md`, `mockup/index.html`) — absent from `main`. |

**Verified before cutting:** `frontend/app/globals.css`, `frontend/tailwind.config.ts`,
`frontend/components/shell/Footer.tsx` and `frontend/components/dashboard/DashboardMapPanel.tsx`
are **byte-identical** between `main` and the old `enhancement/app-visual-refresh` branch
(`git diff --stat main HEAD --` on those four paths returned empty). The spec's entire
implementation surface is therefore unaffected by the rebase onto `main`.

**Risk R-6 eliminated.** The `globals.css` / `tailwind.config.ts` conflict with
`enhancement/searchable-region-select` is gone, because that spec's commits are not on this
branch. This is exactly R-6's prescribed mitigation — *"Land alone; rebase the other spec on
top."* The `searchable-region-select` work (including its held `[~]` T-3) remains intact on the
old `enhancement/app-visual-refresh` branch and is rebased onto this one after the refresh lands.

`d900c84` (`[chore] track .codegraph/.gitignore`) was **deliberately not** cherry-picked: `main`'s
root `.gitignore` already carries `.codegraph/*` + `!.codegraph/config.json`, so the generated
graph database is protected from a `git clean -fd` HALT rollback without it. The commit's own
message records that it is redundant.

---

## Pre-Execution Baseline

Captured on `7aeb358` with a clean tree, **before any task ran**. `node_modules` was reinstalled
with `npm ci` against `main`'s lockfile first — the old branch carried an extra dependency from
`searchable-region-select`, and a stale tree would have made every subsequent measurement
untrustworthy (root `CLAUDE.md` § Concurrency protocol).

### Test suite — 1 pre-existing failure, NOT caused by this spec

```
Test Suites: 1 failed, 84 passed, 85 total
Tests:       1 failed, 1150 passed, 1151 total

FAIL app/(admin)/admin/actors/import/page.test.tsx
  ● ActorImportPage — failure breakdown › renders every reason with its count after a preview
```

**Characterised as order-dependent suite pollution, pre-existing on `main`:**

- The same file run **in isolation passes 19/19** (`npx jest "actors/import/page" --silent`).
- ~~The failure is **deterministic** across two consecutive full-suite runs — same single test, same
  count both times. It is not a flake.~~ **SUPERSEDED 2026-08-07 — this was wrong.** Two runs was
  too small a sample. Four runs on an unchanged tree gave **1, 0, 3, 3** failures with *different*
  suites failing each time. It **is** a flake — timeout-class contention, every failing suite passing
  in isolation. See the correction in the T-2+T-3 entry and the restated gate in `tasks.md` T-6.
- Nothing in this branch's base can cause it: the only frontend delta from `main` is
  `(public)/layout.tsx` (the sticky-footer fix), and the failing assertion is an `aria-live`
  region lookup in the **admin import** page.

**Consequence for T-6.** T-6's verification is the full suite (`npm test -- --silent`), whose
`tasks.md` done-condition reads *"gates green"*. That condition is **unreachable on this base for
reasons this spec did not create**. T-6's test gate is therefore evaluated as **"no new failures
against this recorded baseline"** — 1 failed / 1150 passed / 85 suites, with
`actors/import/page` green in isolation. Any second failure, or a change in that one, is a
regression owned by this spec.

> **This restatement was itself superseded on 2026-08-07.** It assumed the baseline was a *fixed
> count*, which the four-run evidence above disproves — "no new failures vs. 1 failed" is not a
> usable gate when the baseline ranges 0–3 with varying identity. The gate now in force is
> **per-suite isolation**: every suite failing under full-suite load must pass in isolation, and no
> failure may reference a token this spec changed. See `tasks.md` T-6.

This restatement is recorded here **before** T-1 rather than discovered at T-6, so it cannot
function as a retroactive excuse for a failure this spec does cause. It narrows nothing else:
`npm run build`, `npm run lint`, the contrast suite, and every diff-based gate are unchanged and
must be fully green.

### Build — green, static export 23/23

`npm run build` succeeded. Route sizes recorded because **NFR-3 requires first-load JS for `/`,
`/directory` and `/map` to be unchanged (±0 kB)** — a figure that is unverifiable if first measured
after the token change.

| Route | Size | First Load JS |
|---|---|---|
| `/` | 7.43 kB | **164 kB** |
| `/directory` | 6.1 kB | **157 kB** |
| `/map` | 2.62 kB | **110 kB** |
| `/dashboard` | 7.6 kB | 118 kB |
| `/admin/actors` | 7.78 kB | 161 kB |
| `/admin/actors/import` | 4.81 kB | 158 kB |
| First Load JS shared by all | — | **103 kB** |

Lint: green at baseline (the `next build` ESLint pass emitted warnings only — `no-img-element`
advisories in pre-existing files, zero errors).

### Design premises verified against the live tree

Every "Current" value in `design.md` §5.1 was checked against `frontend/app/globals.css` on this
base and **all match** — `--color-bg` `#FFFFFF`, `--color-surface` `#FFFFFF`, `--color-surface-alt`
`#F7F7F7`, `--color-fg` `#333333`, `--color-backdrop` `rgba(51, 51, 51, 0.40)`, `--color-muted`
`#666666`, `--color-border` `#E2E2E2`, `--color-success` `#2F7D32`, `--color-warning` `#C9821B`,
`--color-restricted-bg` `#F3F3F3`, `--crop-sorghum` `#C9821B`. The spec is not stale against the
new base.

---

## Leader findings carried into the run

Recorded before T-1. Neither is a Pivot: the spec is not wrong or unviable, and FR-7 already
mandates the repo-wide per-value sweep that surfaces the first of these. They are logged here so
they are adjudicated on the record at T-5/T-6 rather than arriving as a surprise FAIL.

### LF-1 — a third stale-comment site the spec does not enumerate

`frontend/lib/dashboard/chart-tokens.ts:27–34` documents the chart palette in a comment block that
quotes **`--color-warning  #C9821B`**, and adds *"(amber — same hue as sorghum; kept as semantic
alias)"*.

Both halves become false when T-3 lands:

- the hex is a superseded value → caught by FR-7's per-value sweep;
- **"kept as semantic alias" is the exact belief DD-3 exists to reverse.** Left in place it is a
  standing invitation for a future cleanup to re-merge `--color-warning` and `--crop-sorghum` —
  the precise regression FR-3 and DD-3 are written to prevent. This is KZ-008: a comment
  asserting a property the code lacks.

**Why the spec missed it:** `requirements.md` NFR-2 scopes its "3 hex occurrences, all comments"
count to `frontend/app` + `frontend/components`. `frontend/lib` is outside that scope statement,
but **inside** FR-7's sweep, which is repo-wide by value. This is KZ-004 behaving exactly as
designed — *"per-site fixes miss the sites nobody listed."*

**Adjudication:** in scope for **T-5** as a third comment-only edit. NFR-7 is not violated — its
text is *"exactly two **component** files change"*, and `chart-tokens.ts` is a lib module, not a
component; no markup, class, prop or behaviour changes. **T-6's allowed-diff list must be amended
to include `frontend/lib/dashboard/chart-tokens.ts`**, or T-6 will correctly FAIL a
scope-containment check on a file FR-7 obliged the Implementer to touch.

### LF-2 — `--color-warning` is a live chart series colour, on a surface §5.4 omits

`chart-tokens.ts:44` places `var(--color-warning)` at `CATEGORICAL_COLORS[7]`, consumed by
`categoricalColor()` for Recharts region / actor-type series on `/dashboard`.

T-3 darkens `--color-warning` `#C9821B` → `#8F5E10`, so **an 8th-category chart series changes
colour**. This is a legitimate downstream consequence of the token change, not a defect — but
`design.md` §5.4's rendered-verification list does not include the dashboard charts, so no capture
would show it.

Note the pre-existing drift this exposes: a *semantic* ink token is being used as a *categorical*
chart fill, which is why a 4.5:1 text-legibility fix propagates into a chart palette at all.
Recording it; **not** widening this spec to fix it (advisory-never-becomes-a-task).

**Adjudication:** add `/dashboard` charts to T-6's capture set as an 8th surface. Cheap — one more
screenshot on a stack that is already running — and it is the only evidence that would show an
unintended chart recolour.

---

## Task Execution History

<!-- One entry per task. Evidence before checkbox. -->

---

### T-1 — Build the contrast harness with a known-failure ledger — **PASS** (1 attempt)

| Field | Value |
|---|---|
| **Date** | 2026-08-07 |
| **Branch / base** | `enhancement/app-visual-refresh-v2` @ `7aeb358` |
| **Implementer** | Claude Code `akili-implementer` wrapper (T2 / `sonnet`), effort `medium`, skills `ui-ux-pro-max` + `tdd` |
| **Reviewer** | **Antigravity `agy`**, model `claude-opus-4-6-thinking` (T3) — cross-host, so `author ≠ auditor` is structural: a different CLI and provider that cannot inherit any part of the Implementer's context |
| **Orchestration** | Orca run `run_cf9f6be753e1`; task `task_cd7fa26a3508`; review task `task_a18de33e1810`; dispatch `ctx_2df4d9fb07fe`; terminal `term_6d180803` |
| **Attempts** | 1 (no rework) |
| **Files** | `frontend/lib/contrast.ts` (110 LOC, new) · `frontend/lib/contrast.test.ts` (566 LOC, new) |

**Verification evidence (re-run by the Leader independently of the Implementer):**

```
cd frontend && npm test -- contrast --silent
Test Suites: 1 passed, 1 total
Tests:       129 passed, 129 total
```

`npx tsc --noEmit` clean on both files. `git status` confirms `frontend/app/globals.css` **untouched** — T-1 ships before the token fix, as designed. The Leader also recomputed the ratios with a **separate** WCAG implementation; current-token figures reproduced exactly (warning/surface-alt 2.93, warning/bg 3.14, warning/surface 3.14).

#### Leader adjudications made during this task

- **ADJ-1 — Reachability scoping.** `tasks.md` T-1 says "7 inks × 9 grounds". Ruled that the **asserted** set is scoped to pairs components can actually render, on the text of NFR-1 (*"every surface it can land on"*), T-1's own disqualifier (*"can actually produce"*), and T-3's per-ink ground enumeration. All 63 pairs are still **computed**; reachability changes only what is **asserted**. Unreachable pairs are recorded in an `UNREACHABLE` block with ratios and a promotion rule. This ruling is the main driver of T-1's size overrun — recorded rather than elided.
- **ADJ-2 — `KNOWN_FAILURES` carries 5 entries, not 3.** The 4 FR-2 shipped pairs + `warning`/`bg` (defensive; T-3 names it as a required ground with no current render site).
- **ADJ-3 — `highlight`-as-ink dropped.** `grep -rn "text-highlight"` returns zero component results; asserting it as ink produced a *fabricated* failure on a Group F token FR-6 forbids changing. Removed.

#### Reviewer verdict (agy / `claude-opus-4-6-thinking`)

```
STATUS: PASS
SUMMARY: The contrast harness correctly parses tokens from the live globals.css (not
tautological), composites alpha-modifier grounds over --color-surface, asserts the
two-direction ledger shape required by design.md §10, implements WCAG math faithfully,
explicitly records its DD-7/grep-reachability limitations per KZ-002, and all five
KNOWN_FAILURES entries are verified as genuinely failing against current tokens with
cited render sites. Scope is exactly two new files, globals.css untouched.
```

The Reviewer independently confirmed: the FR-6 equality assertion parses the **live** `globals.css` rather than comparing a hardcoded palette to itself (the tautology that would have been an automatic FAIL); `parseRootTokens` is brace-counted, not a fixed-line regex, and throws rather than degrading silently; and all five ledger entries fail against current tokens.

**Read-only contract:** enforced by detection, not capability — `--mode plan` is incompatible with `--print` (plan mode waits for an approval a non-interactive session can never give), so it was unavailable as a capability-level guarantee. The working tree was fingerprinted before and after; it was **unchanged**, so the verdict stands.

#### ADVISORY (recorded, non-gating)

1. **Stale citation** — `REACHABLE.fg.citedAt` cites `ui/Button.tsx:44` for `"bg-surface text-fg"`; the actual line is **49** (`:51` in the same string is correct). Leader **verified this claim is true**. → Assigned to **T-3**, which owns this matrix.
2. `parseRootTokens` finds only the first `:root` block. One exists today; a future second block (inside `@layer`/media query) would be invisible. Resilience note.
3. `DECL_RE` does not handle multi-line values. All current values are single-line; a future multi-line value would truncate silently. Low risk against today's token set.

#### Spec amendments made at this task (user-approved at the T-1 gate)

- **FR-2 corrected from 3 → 4 shipped failing pairs.** The 4th is `text-warning` on `--color-surface-alt` at **2.93:1** (`ActorHistoryPanel.tsx:87`, BULK_CONSENT badge), which FR-2's original table never enumerated. **It needs no new token value** — the already-planned `#8F5E10` yields **4.90:1** there, so this is a documentation defect, not a design defect.
- **Two-direction sweep run (KZ-004).** Direction 1 found every count assertion across the three spec docs; direction 2 enumerated every `text-warning` / `text-success` render site. The sweep surfaced **additional sites** (`ActorsTable.tsx:282`, `app/(admin)/admin/users/page.tsx:349`, 7 `bg-highlight-tint` sites) but **no additional failing pair** — each maps to a pair already gated. FR-2 was accordingly restated to count **pairs** and cite *representative* sites, with the exhaustive site list living in the harness's `citedAt` fields where a test can keep it honest.
- **Counts reconciled (KZ-005)** across `requirements.md` §2/FR-2/FR-8/traceability, `design.md` §10, and `tasks.md` T-1.
- **`design.md` §11 budget re-baselined** — see the re-baseline note there. The LOC tripwire was replaced by a **component-edit** tripwire, which measures NFR-7 directly rather than proxying for it.

**Not done / carried forward:** advisory #1 (the `Button.tsx:44` → `:49` citation fix) is owed by T-3.

---

### ADJ-4 — T-2 and T-3 land as one atomic token commit (Leader ruling, 2026-08-07)

**Raised by:** the T-2 Implementer, which completed its `globals.css` edits correctly, found the mandated verify command red, and **stopped and reported rather than editing the test to force green** — the behaviour its brief's guardrail asked for. The finding is its analysis; this entry records the adjudication, not a rediscovery.

**Symptom.** With Group A/B landed and Group C untouched, `npm test -- contrast --silent` fails 3 of 129:

| Failing assertion | Live ratio | Expected | Nature |
|---|---|---|---|
| `success on restricted` | **4.319** | ≥ 4.5 | **Genuine new regression** |
| `warning on bg` | 2.986 | ledger pin 3.14 ±0.05 | Stale pin, still correctly < 4.5 |
| `warning on surface-alt` | 2.764 | ledger pin 2.93 ±0.05 | Stale pin, still correctly < 4.5 |

**Leader verification.** All three reproduced to three decimals with a WCAG implementation independent of both the harness and the Implementer.

**Root cause — the decomposition, not the edit.** `design.md` §5.1 states Group C's `success` figure as **"5.26:1 on restricted"**. That is `#2A6E2D` against the **new** `#F0EBE4`; the same value against the **old** `#F3F3F3` gives 5.62. So **design.md computed Group C against post-Group-A grounds all along** — the design documents always modelled the token change as a *single* state transition, and §10's "green in both states" means exactly two states. `tasks.md` split that transition into T-2 (grounds) and T-3 (inks), inventing a third, intermediate state that nothing in the design was built to survive.

**Why a T-2-only commit was refused.** `success`/`restricted` measured **4.616:1** before this spec — a 0.116 margin over AA. Warming the ground alone drops it to 4.319, i.e. **below AA**. Landing T-2 by itself would ship a *new* accessibility regression in a spec whose stated purpose is removing accessibility regressions, and would leave that regression in the tree for as long as anything delayed T-3. Re-baselining the two stale pins to keep the suite green would have been worse: it would have made the harness ratify the regression.

**Ruling.** T-2 and T-3 land in one commit. This is a **sequencing** decision, not a scope change — same two files, same total work, no requirement altered, no new task. T-4's dependency on T-2 is satisfied by the merged landing. Both tasks retain their own `execution.md` entry and both flip together; the Reviewer audits the combined diff against **both** task contracts, and that single review round is disclosed here rather than counted as two.

**What this vindicates.** The failure was caught by a *test*, in the intermediate state, before anything shipped — which is precisely what T-1's ledger was built to do and the return on its 676 LOC. It is also a live instance of **KZ-007** (*constraint sets are conjunctive — satisfying each member individually can still break the set*): Group A is correct in isolation, Group C is correct in isolation, and the defect lived in the interaction between them.

**Kaizen candidate KZ-009 (proposed, credited to the T-2 Implementer):** a known-failure ledger that pins a *measured ratio* couples the ledger to one token state, so any change to a **ground** stales the pin of every ink that lands on it — a false failure that looks like a regression. The pins here are disposed of when T-3 empties the ledger, so this spec needs no further action; the lesson is for the next spec that keeps a ledger across a ground change. Record after this spec closes, not before — an unproven lesson in the log is itself a KZ-002 defect.

---

### T-2 + T-3 — Re-author surface/ink tokens · Remediate the four AA failing pairs — **PASS** (1 review round, merged under ADJ-4)

| Field | Value |
|---|---|
| **Date** | 2026-08-07 |
| **Branch / base** | `enhancement/app-visual-refresh-v2` @ `9621de3` |
| **Implementer** | Claude Code `akili-implementer` wrapper (T2 / `sonnet`), effort `medium`, skill `tailwind-design-system` |
| **Reviewer** | **Antigravity `agy`**, model `claude-opus-4-6-thinking` (T3) — cross-host |
| **Attempts** | T-2: 1. T-3: 2 (first delivery went idle with the ledger un-emptied and no report; re-sent, completed) |
| **Files** | `frontend/app/globals.css` (9 lines) · `frontend/lib/contrast.test.ts` (ledger emptied, comment rewritten, citation fixed) |
| **Review rounds** | **1**, covering both task contracts — disclosed here, not counted as two |

**Token change (`git diff -U0`, all inside `:root`):**

| Token | Before | After | Group |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` | `#FBF9F6` | A |
| `--color-surface-alt` | `#F7F7F7` | `#F4F0EA` | A |
| `--color-fg` | `#333333` | `#2A2724` | A |
| `--color-muted` | `#666666` | `#6B6459` | A |
| `--color-border` | `#E2E2E2` | `#E6DFD5` | A |
| `--color-restricted-bg` | `#F3F3F3` | `#F0EBE4` | A |
| `--color-backdrop` | `rgba(51,51,51,.40)` | `rgba(42,39,36,.40)` | B |
| `--color-success` | `#2F7D32` | `#2A6E2D` | C |
| `--color-warning` | `#C9821B` | `#8F5E10` | C |

`--color-surface` unchanged at `#FFFFFF`. `--crop-sorghum` / `--crop-bean` / `--crop-groundnut` / `--crop-*-soft` byte-identical — FR-3's decoupling achieved by editing `--color-warning`'s line only, never a find-and-replace of `#C9821B`.

**All four FR-2 pairs remediated, verified against composited grounds:**

| Pair | Before | After |
|---|---|---|
| `warning` on `warning/10` chip (composited) | 2.83 | **4.854** |
| `warning` on `surface-alt` | 2.93 | **4.898** |
| `warning` on `surface` | 3.14 | **5.561** |
| `success` on `highlight/20` | 4.35 | **5.311** |
| `success` on `restricted` | 4.616 → 4.319 (mid-ADJ-4) | **5.260** |

**Verification evidence (Leader-run, independent of the Implementer):**

```
cd frontend && npm test -- contrast --silent
Tests: 129 passed, 129 total

npm run build → ✓ Compiled successfully · ✓ Generating static pages (23/23) · ✓ Exporting (2/2)
npx next lint --quiet → exit 0, "No ESLint warnings or errors"
git diff -U0 -- frontend/app/globals.css | grep -c 'crop-' → 0
```

NFR-3 holds: `/` 164 kB, `/directory` 157 kB, `/map` 110 kB — unchanged from the pre-execution baseline. Ratios independently recomputed with a WCAG implementation separate from the harness; all reproduce.

#### Reviewer verdict (agy / `claude-opus-4-6-thinking`)

```
STATUS: PASS
SUMMARY: The combined T-2/T-3 diff satisfies both task contracts: Group A/B grounds and
Group C inks land atomically (ADJ-4 reasoning independently verified as mathematically
sound), all 7 FR-2 remediation pairs clear 4.5:1 against correct composited grounds, crop
tokens are byte-identical, the KNOWN_FAILURES ledger empties without weakening any
assertion, all declarations stay inside :root, and the diff is exactly two files with no
component edits.
```

Independently confirmed by the Reviewer: DD-5's backdrop derivation (`#2A2724` → rgb(42,39,36), recomputed not eye-balled); FR-1's warm-hue clause (R > B for all six Group A values); **FR-1 scenario 2's footer inversion at 14.13:1**; and KZ-005 reconciliation of every ratio against design.md's stated figures (4.86 ↔ 4.8536, 5.26 ↔ 5.2599). Read-only contract verified by tree fingerprint — unchanged.

#### ADVISORY (recorded; both acted on immediately)

1. **T-3's verify command was unsound as written** — *Implementer finding, Reviewer-confirmed.* `git diff -- globals.css | grep -c 'crop-'` returns **1**, not 0: `--crop-sorghum` falls inside the default 3-line context radius and `grep -c` counts context lines regardless of prefix. **Fixed in `tasks.md`** to `git diff -U0`. A command satisfiable by accident is not a gate — same defect class as a presence assertion (KZ-002).
2. **Four files in the tree, not two** — `execution.md` and `tasks.md` are Leader bookkeeping, correctly excluded from the audited diff. Not a scope violation.
3. **Pre-existing full-suite flakiness** — see the correction below. **T-6's gate restated in `tasks.md`.**

#### Correction to the recorded baseline

The Pre-Execution Baseline above calls the `actors/import/page.test.tsx` failure **"deterministic across two runs."** That was drawn from too small a sample and is **wrong**. Four runs on an unchanged tree gave **1, 0, 3, 3** failures, with different suites failing each time. Every failing suite passes in isolation (65/65 in 12.5 s vs 45–56 s under load) — timeout-class contention. The Reviewer independently confirmed no mechanism connects this diff to those failures: the flaky suites contain **zero** references to any semantic colour token, and the only old-value references anywhere in tests are `parseColor`/`compositeOver` math fixtures and the FR-6 frozen `--crop-sorghum` assertion.

**Consequence:** T-6's gate as previously restated ("no new failures vs. a baseline of 1 failed") was **unusable**, because the baseline is not a fixed number. Replaced in `tasks.md` with a per-suite isolation gate. The flakiness itself is **pre-existing repo health and out of scope here** — it warrants its own `bugfix/` spec rather than being absorbed silently.

**Not done / carried forward:** `frontend/lib/dashboard/chart-tokens.ts:27-34` (LF-1, the third stale `#C9821B` comment site) is untouched and belongs to **T-5**'s per-value sweep — the Implementer correctly declined to claim it.

---

### T-4 — Elevation ladder and gradient tokens, with Tailwind mappings — **PASS** (1 attempt)

| Field | Value |
|---|---|
| **Date** | 2026-08-07 |
| **Base** | `73ebe9b` |
| **Implementer** | Claude Code `akili-implementer` wrapper (T2 / `sonnet`), skill `tailwind-design-system` |
| **Reviewer** | **Antigravity `agy`**, `claude-opus-4-6-thinking` (T3) — cross-host |
| **Attempts** | 1 |
| **Files** | `frontend/app/globals.css` (+15/−2) · `frontend/tailwind.config.ts` (+6/−0) — 2 files, **no component edits** |

**The elevation ladder (Group D):**

| Token | Value | Blur | Alpha |
|---|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(61,47,32,.04)` | 2px | .04 |
| `--shadow-sm` | `0 2px 4px rgba(61,47,32,.07)` | 4px | .07 |
| `--shadow-md` | `0 6px 16px rgba(61,47,32,.10)` | 16px | .10 |
| `--shadow-lg` | `0 16px 40px rgba(61,47,32,.14)` | 40px | .14 |

Monotonic in offset, blur and alpha — four genuinely distinct authored steps, not two duplicated. `--shadow-sticky-edge` **byte-identical** (DD-4 holds; only its line number shifted). `tailwind.config.ts` gains `boxShadow.xs`, `boxShadow.lg`, and a new `backgroundImage` family.

#### D-4 discharged by two independent methods

The D-4 trap is a token in `:root` with **no** Tailwind mapping: no utility class is generated, yet `npm run build` succeeds and a presence assertion passes while the class does nothing. Tailwind's purging also makes grepping built CSS useless — absence proves nothing when no component uses the class yet.

1. **Implementer** — compiled the utilities with the Tailwind v3.4.19 CLI against the *real* config (throwaway config spreading it, `content` pointed at a scratchpad probe; probe files never entered the repo). All six classes emitted real rules referencing the correct custom properties.
2. **Leader, independently** — `resolveConfig` confirmed `boxShadow` = `{sm, md, lg, xl, 2xl, inner, none, xs, sticky-edge}` and `backgroundImage` containing `gradient-hero` + `gradient-band`.

The Reviewer assessed this as a genuine discharge, not a presence check one level up, because it proves the config entry exists, the class name resolves to a real rule, and the rule contains the expected `var()` reference. **The rendered half is explicitly not claimed and remains T-6's.**

#### Value provenance — audited, not assumed

design.md §5.1 Group D specifies only *"warm base, N% alpha"* with **no concrete RGB**. The Implementer sourced `rgba(61,47,32,…)` and the hero stops from `mockup/index.html:46-50` — the approved visual reference, whose header states these are the numbers meant to land. **Leader-verified exact.** It then rewrote the hero gradient's three hex stops as `var(--color-surface-alt)` / `var(--color-bg)` / `var(--color-surface)`, byte-equal to T-2's landed `#F4F0EA` / `#FBF9F6` / `#FFFFFF`, so the gradient is token-driven per NFR-4 rather than a second hardcoded copy.

#### FR-5's contrast clause is provably satisfied — an unclaimed benefit of that rewrite

FR-5 forbids a gradient dropping any ink below NFR-1. Because the stops are now **token references to already-gated Group A grounds**, and every ink (max L = **0.139**) is darker than every stop (min L = **0.875**), contrast is **monotonic in ground luminance** — so the worst case necessarily falls at an *endpoint*, which the T-1 harness already gates. Verified over 21 sampled stops per segment:

| Ink | Worst ratio on either gradient |
|---|---|
| `fg` | 13.081 |
| `danger` | 5.758 |
| `success` | 5.495 |
| `muted` | 5.150 |
| `warning` | **4.898** |

All ≥ 4.5. **No new gate required.** The Reviewer audited the monotonicity argument and confirmed it, adding the correct caveat: a future *light* ink used as text on a gradient would break the premise — structurally mitigated because T-1's harness gates every ink/ground pair independently, so such a token could not pass unnoticed.

#### Reviewer verdict (agy / `claude-opus-4-6-thinking`)

```
STATUS: PASS
SUMMARY: The diff adds exactly four monotonically-stepped warm-tinted shadow tokens and two
gradient tokens in globals.css, each with a corresponding tailwind.config.ts mapping. Values
are byte-identical to the approved mockup; the sticky-edge shadow is untouched; the
compiled-CSS evidence and independent resolveConfig verification jointly discharge D-4 for
the mapping half, with rendered evidence correctly deferred to T-6.
```

Leader-run gates: `npm run build` ✓ (23/23 static, 2/2 export) · `npm test -- contrast --silent` **129/129** (tokens moved; suite must still pass) · `npx next lint --quiet` exit 0 · NFR-3 route sizes unchanged. Read-only contract verified by tree fingerprint.

#### ADVISORY

1. **design.md Group E prose contradicts the approved mockup** — Group E calls `--gradient-hero` a *"Diagonal canvas→**surface** wash"* (implying two stops, `bg`→`surface`), but the approved mockup and the implementation use **three** stops (`surface-alt`→`bg`→`surface`). The prose is an incomplete summary. **Added to T-5's scope** — the Implementer correctly followed the approved mockup over incomplete prose, so this is a documentation defect, not a T-4 defect.
2. `tailwind.config.ts:59` cites *"FR-6"* for the sticky-edge shadow, referring to a **different spec's** numbering, not this spec's frozen-token FR-6. Flagged by the Implementer, left alone; the Reviewer agreed it is out of scope. Recorded for a future housekeeping pass — fixing it satisfies no requirement here.
3. The FR-5 monotonicity bound depends on ink/ground luminance separation — see the caveat above.

#### Open judgment call carried to T-6's HITL gate

**`--gradient-band` is the only value in this task with no cited source.** design.md Group E gives only *"Vertical canvas→alt wash for section transitions"*, and the mockup has **no `--gradient-band` at all**. The Implementer derived `linear-gradient(180deg, var(--color-bg) 0%, var(--color-surface-alt) 100%)` and **disclosed it as a judgment call rather than presenting it as a lookup**. Accepted as a minimal faithful reading of those words — literally vertical, literally canvas→alt, no invented angle or stop split — and it is provably contrast-safe per the bound above. But it carries no design authority, so **the user decides its appearance at T-6's AR-1 gate**, and T-5 records whatever value survives into `design.md` §7.

---

### T-5 — Sync the baseline docs, sweep stale values, correct QA-11 — **PASS** (1 attempt; 2 prior review runs lost to a quota wall)

| Field | Value |
|---|---|
| **Date** | 2026-08-07 |
| **Base** | `ead16b5` |
| **Implementer** | Claude Code `akili-implementer` wrapper (T2 / `sonnet`), skill `cognitive-doc-design` |
| **Reviewer** | **Antigravity `agy`**, `claude-opus-4-6-thinking` (T3) — cross-host |
| **Attempts** | Implementation: **1**. Review dispatches: **3** — see the environment-failure note below. |
| **Files** | `docs/ux-ui/design.md` · `docs/trd/trd.md` · `Footer.tsx` · `DashboardMapPanel.tsx` · `chart-tokens.ts` (+ 2 Leader bookkeeping files) — **no runtime code** |

**Six scope items** (four original, two added mid-run): §7 token resync · accent-usage note extension (warning AA callout, marker-vs-ink split/DD-3, Hero-scrim-vs-gradient/DD-6, dark-scope shadow alphas/OQ-4) · three stale comments · QA-11 correction · **Group E prose reconciliation** (T-4 Reviewer advisory) · **LF-1 `chart-tokens.ts`**.

#### ADJ-5 — Full §7 resync accepted (Reviewer concurred)

The Implementer resynced **all** of `docs/ux-ui/design.md` §7, not only this spec's 7 tokens — pulling in `--color-highlight-tint`, `--color-danger-soft`, the three `--crop-*-soft` and `--color-backdrop`, which already existed in `globals.css` but were **missing from §7 before this spec began**. It disclosed this as a scope-width decision rather than doing it silently.

**Ruling:** accepted. FR-7's clause is unconditional — §7 *"MUST match `globals.css` exactly"* — and does not say "match the tokens this spec changed." A partial resync leaves the requirement **unsatisfied** and §7 in a known-false state: **KZ-008** by omission, and **KZ-004** (*per-site fixes miss the sites nobody listed*) as the cause. Documentation-only, zero runtime risk, mechanically verifiable. The Reviewer independently reached the same conclusion: *"The wider scope is the only scope that satisfies the requirement as written."*

#### Leader verification (mechanical, independent of the Implementer)

Extracted every `--token: value` pair from §7 (lines 79–140) and from `globals.css`, normalized and compared. **Coverage complete** — every `globals.css` token name now appears in §7. Three apparent value mismatches, all investigated and dismissed:

| Apparent mismatch | Finding |
|---|---|
| `--color-bg: #1C1F1A`, `--color-surface: #252825` | **False positive** — inside the commented-out `.dark` example at `globals.css:94-96`. Extraction artifact, not a doc defect. |
| `--font-sans` / `--font-display` | `globals.css` carries the Next font-loader `var(--font-inter)`; §7 documents design intent. **Pre-existing**, and fonts are frozen by Group F/FR-6. |
| `--shadow-*` | `rgba(61, 47, 32, 0.04)` vs `rgba(61,47,32,.04)` — identical CSS value, notation only. |

Reviewer agreed both surviving cases are value-equality, not byte-equality, and non-gating.

Also Leader-verified: `DashboardMapPanel.tsx:50` **byte-identical** (the trap held — it cites `#FFFFFF` for `--color-surface`, which T-2 deliberately left unchanged, so "correcting" it would have been the regression); `:51` corrected. `npx next lint --quiet` exit 0.

**The Implementer caught something the brief did not specify:** `Footer.tsx:2` had **both** hexes stale, not just `fg`'s — `text-bg` is `--color-bg`, which T-2 also moved. It verified against the live JSX (`className="bg-fg text-bg"` at `:31`) rather than trusting the old comment.

#### The per-value sweep (FR-7 / KZ-004)

Repo-wide by value via `git grep`, filtered only for the frozen archive and this spec's folder. Leader spot-checked its "legitimate occurrence" claims, which is where the real work was:

| Value | Disposition |
|---|---|
| `F7F7F7`, `#E2E2E2` | `infra/10-data-auth/template.yaml` — inline `style="background-color:#F7F7F7"` in an **SES email HTML template**. Email clients cannot use CSS custom properties, so this file was never in the token system. Correctly excluded. |
| `#333333`, `#666666` | Backend hits are **OTP digit strings** passed to `verifyCode(...)` — coincidental numeric matches, not colours. Correctly excluded. |
| `F3F3F3`, `2F7D32`, `rgba(28, 31, 26` | **Zero hits.** Clean. |
| `C9821B` | All remaining occurrences are `--crop-sorghum`'s live, correct value or T-1's FR-6 frozen fixtures. **Zero** pair it with `--color-warning`. |

#### LF-1 closed (KZ-008)

`chart-tokens.ts` previously read `--color-warning #C9821B (amber — same hue as sorghum; **kept as semantic alias**)`. Both halves were false after T-3, and the second is **the exact belief DD-3 exists to reverse** — left in place it invited a future cleanup to re-merge `--color-warning` and `--crop-sorghum`, the precise regression FR-3/DD-3 prevent. Now corrected and reversed, citing DD-3.

#### Reviewer verdict (agy / `claude-opus-4-6-thinking`)

```
STATUS: PASS
SUMMARY: The diff correctly syncs docs/ux-ui/design.md §7 to match globals.css (full resync per
FR-7's unconditional clause, ADJ-5 concurred), corrects all three stale comments (Footer.tsx,
DashboardMapPanel.tsx, chart-tokens.ts) with verified-true hex values, amends QA-11 to disclaim
jest-axe contrast coverage while preserving the accessibility scenario, and makes no
markup/class/prop/behaviour change to any component. Repo-wide per-value sweep independently
verified clean. All contrast ratio claims in the new accent-usage prose confirmed by independent
WCAG computation.
```

The Reviewer independently recomputed the ratio claims in the new accent-usage prose (that `#8F5E10` clears 4.5:1 on `surface`/`bg`/`surface-alt`/its own 10% chip) and confirmed the WCAG 1.4.3-vs-1.4.11 threshold statement, the DD-6 scrim distinction, and both Leader bookkeeping hunks including the tripwire correction.

#### ENVIRONMENT FAILURE — two review dispatches lost, and a hole in the Leader's own harness

The first two dispatches produced **no verdict**. The cause was an `agy` account quota: `Error: Individual quota reached … Resets in 34s`. The first attempt hit it *mid-flight*, so it emitted two lines of opening narration and **still exited 0** — and the Leader's `agy-review.sh` reported success on a review that never ran.

**This is the same defect class this spec keeps surfacing:** a gate reporting green for something it did not evaluate (KZ-002). Three instances now — T-1 replaced a presence assertion that could not fail, T-3's crop check could pass by accident, and the Leader's own review wrapper accepted a verdict-less transcript. **Fixed:** the wrapper now greps for a `STATUS:` line and exits 98 if absent, explicitly labelling the result as *neither PASS nor FAIL*.

**Not charged to the rework ceiling.** The 3-attempt ceiling governs spec-conformance FAILs. A quota wall is an environment blocker with a published reset window; charging attempts to it would have forced a bogus HALT on work that was never reviewed. The same cross-host Reviewer was retried at full rigor after the window rather than degrading to a weaker model to dodge a transient limit.

#### ADVISORY (recorded, non-gating, deliberately not acted on)

1. §7 omits the Next font-loader `var(--font-inter)` wrapper — benign (frozen token group, plumbing vs. design intent), but a future reader of FR-7's "match exactly" may flag it. For the next spec that touches typography.
2. Shadow notation differs between §7 and `globals.css` (identical values). Could trip a future *mechanical* diff. Future housekeeping.
3. `frontend/lib/content/crops.ts:70` cites *"System Design §7"* — the **pre-migration** doc path (`docs/system-design/design.md` → `docs/ux-ui/design.md`, per root `CLAUDE.md`). A stale **path**, not a stale value, so outside FR-7's per-value sweep. Recorded, not fixed.

**Not done / carried forward:** if T-6's HITL gate changes `--gradient-band`, **both** `docs/ux-ui/design.md` §7 and the spec-local `design.md` Group E need a follow-up touch — both currently record the pre-gate value, clearly labelled as such.

---

### T-6 — Rendered evidence and the human visual gate — **IN PROGRESS `[~]`**

| Field | Value |
|---|---|
| **Date** | 2026-08-07 |
| **Base** | `686a999` |
| **Environment** | **Dev on AWS** (user decision) — `https://d3idqvvg0xa1r7.cloudfront.net`, not localhost |

#### Why Dev and not localhost (user decision, 2026-08-07)

Three reasons, in order of weight:

1. **`npm run dev` is not the production CSS pipeline.** Tailwind purges and minifies differently in dev, so dev-mode output is *weaker* evidence for a token change than the production build. The deployed artifact **is** the production build.
2. **CORS makes the data-bearing surfaces unreachable from any other origin.** `AllowedOrigin` is locked to the CloudFront origin (`infra/20-backend/template.yaml:200`), so the admin table, import preview and dashboard cannot render real data from `localhost` without standing up a full local backend + MySQL. Dev already carries seeded data.
3. Port `3000` was held by another session's dev server; capturing against it would have screenshotted the **old** tokens — T-6's own disqualifier (a).

**The deploy was operator-authorized.** `deploy-frontend.sh:31-32` marks it "NOT run by the SDD agent loop"; the Leader raised that, and the user explicitly authorized the Leader to run it with permission prompts. Run as `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`.

**A profile defect surfaced en route.** The first invocation resolved to profile `MELIA-DEV` — the operator's *personal* account — because `deploy-frontend.sh:44` reads `PROFILE="${AWS_PROFILE:-IBD-DEV}"` and an ambient `AWS_PROFILE` wins over the mandated floor. It failed safe only because that account lacked a `20-backend` stack. **The same mechanism had already succeeded on 2026-07-09**, leaving a full `10-data-auth` stack (RDS + Cognito + Secrets) running ~30 days in the wrong account; removed on user instruction, with a CFN-generated final snapshot also deleted (RDS's default `DeletionPolicy` is `Snapshot`, not `Delete`, so a "complete" stack deletion silently leaves a billable artifact). Recorded as **`docs/specs/bugfix/deploy-profile-override/`** — out of scope here.

#### Disqualifier (a) discharged by machine, not by assertion

T-6 disqualifies captures taken "without a hard reload, so stale CSS is in the frame". On a CDN that claim is unfalsifiable as stated, so it was replaced with a check on what the origin actually serves:

| | Pre-deploy | Post-deploy |
|---|---|---|
| CSS served | `6fe7c0ace4c6903d.css` | **`dfc9f3630fb07d93.css`** |
| `#FBF9F6` `#F4F0EA` `#2A2724` `#8F5E10` `#2A6E2D` | all **absent** | all **present** ✅ |
| `#F7F7F7` `#333333` `#2F7D32` | all **present** | all **absent** ✅ |

CloudFront invalidation `I3LQJ4R9YP0DDEYGF8B24UOHVF` (`/*`). Captures taken while this check fails are inadmissible; it passes.

#### VF-1 — the gate's first real finding: form fieldsets do not participate in the elevation inversion

Raised by the **user** at the AR-1 gate, looking at `/register`: the form sections read flat.

**Measured cause — not an aesthetic opinion:**

```
0 of 12  <fieldset> elements in frontend/ carry `bg-surface`
11 of 12 use the identical string: `rounded-md border border-border p-4 sm:p-6`
```
*(`RegistrationForm.tsx` ×5, `ActorForm.tsx` ×6; the 12th, `DirectoryFilters.tsx:90`, is deliberately `border-0`.)*

Every form section is a **transparent** 1px outline, so what shows inside it is the canvas itself.

**This spec did not break it — it revealed it.** `design.md` §1 states the structural move as *"the canvas warm and the card white, so elevation reads from the card being lighter and warmer-lifted than its ground."* That holds for the 137 `bg-surface` consumers, but fieldsets were never among them. Previously `--color-bg` was `#FFFFFF`, so a transparent fieldset on a white canvas **looked** like a white card by accident. Warming the canvas removed the camouflage. The flatness pre-dates this spec; only its visibility is new.

**Consequence for the spec's own claims:** §1 over-states its reach. The elevation inversion does not apply to form pages at all, and no requirement in FR-1…FR-8 covers them — the token change cannot fix this, because a fieldset with no background class has nothing for a token to colour.

**Adjudication — out of scope, deliberately.** The fix (`bg-surface` + `shadow-sm` on 11 fieldsets) is a **class change to components**, which violates **NFR-7** verbatim (*"both changes are comment-only … No component's markup, classes, props or behaviour changes"*) and trips `design.md` §11's tripwire. Breaking the scope-containment tripwire in the final gate of the spec that authored it would be self-defeating, and T-6's gate *is* a diff-containment check. Routed to a new spec per user decision: **`docs/specs/enhancement/form-elevation-ux/`**.

#### Still outstanding

- **User's aesthetic approval** — AR-1 is not machine-decidable; disqualifier (c) requires that the user actually looked.
- **Admin login for two surfaces** — admin actors table and import preview, which carry the two 12px `warning` pairs FR-2 exists to fix. Cognito-gated; needs credentials or an operator-authenticated session.
- Capture set (8 surfaces × 375/768/1440) for the audit record.

#### VF-2 — FR-4's rendered-evidence clause and NFR-7 are jointly unsatisfiable for two of the four shadow steps

Found while establishing what T-6 could actually capture — **before** taking screenshots, so it is a finding rather than a retroactive excuse for a missing capture.

**Measured consumer counts** (`app/` + `components/`, excluding tests):

| Utility | Consumers | Rendered evidence obtainable? |
|---|---|---|
| `shadow-sm` | **34** | ✅ value changed `rgba(28,31,26,.06)` → `rgba(61,47,32,.07)` |
| `shadow-md` | **24** | ✅ value changed `rgba(28,31,26,.08)` → `rgba(61,47,32,.10)` |
| `shadow-xs` | **0** | ❌ **impossible — nothing renders it** |
| `shadow-lg` | **0** | ❌ **impossible — nothing renders it** |
| `bg-gradient-hero` | **0** | n/a — see FR-5 below |
| `bg-gradient-band` | **0** | n/a — see FR-5 below |

**FR-5 is SATISFIED, and its zero consumers are correct.** Its scenario is explicitly an *availability* requirement — *"GIVEN a hero band or section transition **needs** an atmospheric surface · WHEN the implementer styles it · THEN a `--gradient-*` token MUST be **available and mapped**"* — and **DD-6 deliberately declines** to replace the Hero scrim, which remains `bg-gradient-to-t from-fg/70 to-transparent` at `Hero.tsx:117` (Tailwind's native utility over the `fg` token, not the new token). Its one substantive constraint — no gradient dropping an ink below NFR-1 — is provably satisfied (T-4 entry, monotonicity bound, worst case 4.898).

**FR-4 is PARTIALLY satisfied.** Its scenario demands *"AND IT MUST be proven by rendered evidence, not by asserting the CSS variable exists."* Existence and mapping are proven (T-4, two independent methods). The **warm tint and the recalibration are proven on 58 real render sites** via `sm`/`md`. But `xs` and `lg` render nowhere, so T-6's disqualifier (b) applies: it anticipates judging whether *"`shadow-xs` and `shadow-lg` are visually indistinguishable in the capture"* and requires reporting **inconclusive**, *"never collapsed into a pass."* They are not indistinguishable — they are **unrenderable**. Reported as **INCONCLUSIVE**, not as a pass.

**Why it cannot be fixed here.** Wiring consumers means adding classes to components, which **NFR-7** forbids verbatim. So FR-4's rendered-evidence clause and NFR-7 are *each* satisfiable alone and **contradictory as a set** — a live instance of **KZ-007** (*constraint sets are conjunctive; satisfying each member individually can still break the set*), and the third KZ-007 instance in this spec after ADJ-4's Group A/C coupling.

**The root cause is an asymmetry `/akili-specify` should have caught.** `design.md` §5.1 Group D **names the intended consumers** — `--shadow-xs` → *"chips, inputs at rest"*, `--shadow-lg` → *"dialogs, popovers, map rail"* — so the wiring intent existed. But no task carries it and NFR-7 vetoes it. FR-5 was written as a pure affordance; FR-4 conflated two different claims: *"the ladder exists and is warm"* (provable today) and *"depth is perceptible in the app"* (requires consumers). Had FR-4 been written symmetrically with FR-5, there would be no contradiction.

**Adjudication (user decision, 2026-08-07): report partial, do not expand scope.** The wiring is routed to **`enhancement/form-elevation-ux`**, whose proposal already specifies `shadow-xs`/`sm` for form sections; `shadow-lg` is added there for dialogs/popovers per Group D's named consumers. Until that spec lands, `--shadow-xs` and `--shadow-lg` ship as **mapped-but-unconsumed affordances** — dead code in the app, honestly labelled as such rather than counted as delivered depth.

**`design.md` §5.4 carries a false row, discovered here.** It lists *"Home / Hero | **Only consumer of a gradient**"*, but `bg-gradient-hero` has zero consumers and DD-6 explicitly keeps the inline scrim instead. The Hero consumes *a* gradient (its scrim), not *the token*. T-5's sweep did not catch this because that sweep is per **value**, not per **claim** — a genuine limit of KZ-004's mechanism worth noting: a false assertion containing no stale literal is invisible to a value sweep.

---

### T-7 — Form-section elevation and hierarchy — **PASS** (1 attempt) · *amends NFR-7*

| Field | Value |
|---|---|
| **Date** | 2026-08-07 |
| **Base** | `c59f353` |
| **Implementer** | Claude Code `akili-implementer` (T2 / `sonnet`), skills `tailwind-design-system` + `react-doctor` |
| **Reviewer** | **Antigravity `agy`**, `claude-opus-4-6-thinking` (T3) — cross-host |
| **Files** | `RegistrationForm.tsx`, `ActorForm.tsx` — 2 files, **+24/−22**, class-only |

**Why this task exists, and what it cost.** At the AR-1 gate the user judged the form sections illegible and asked three times. The Leader had adjudicated it out of scope (VF-1) and routed it to a future spec; **the user's repeated request superseded that adjudication**. NFR-7 was amended explicitly rather than quietly — the spec is no longer token-only, and T-6's diff-containment check no longer proves what it originally proved. That loss is recorded in `requirements.md` beside the amendment so it stays visible to a later auditor.

**The change, per the design review's DR-1/DR-2/DR-3:**

| Element | Before | After |
|---|---|---|
| `<fieldset>` ×11 | `rounded-md border border-border p-4 sm:p-6` | `… bg-surface … shadow-sm` |
| `<legend>` | `px-2 text-sm font-semibold text-fg` | `bg-surface px-2 **text-base** font-semibold text-fg` |
| `inputClasses()` | *(no shadow)* | `+ shadow-xs` |

**DR-2 — reuse, not invention.** The fieldset now equals `ActorCard.tsx:73`'s proven pattern **minus `hover:shadow-md`** (a form section is not interactive). No new container idiom was designed.

**DR-1 — hierarchy separated on two axes.** `legend` (`text-base` + `semibold`) vs `label` (`text-sm` + `medium`) — previously one weight step apart, now size **and** weight. Only existing `--text-*` steps were used; FR-6 freezes their values.

**DR-4 — the legend notch, decided not inherited.** The Implementer gave the `<legend>` itself `bg-surface` rather than restructuring into a header row: minimal fix for exactly this bug, native `fieldset`/`legend` semantics untouched, no `sr-only` tricks or DOM restructuring. The notch still interrupts the border, but is now filled with the card's own white, so there is no colour jump to the warm canvas behind.

**DR-3 / VF-2 — `shadow-xs` now has a real consumer.** Wired to `<input>`/`<select>`/`<textarea>` via `inputClasses()`, correctly **excluding** the crop checkboxes (native controls, not text boxes). This is the consumer `design.md` §5.1 Group D always named, and it produces a semantically correct ladder: input (`xs`, 4%) nested inside section (`sm`, 7%). **VF-2's `xs` half moves from INCONCLUSIVE to demonstrable.** `shadow-lg` remains unconsumed and was **disclosed** rather than glossed — FR-4 stays partially open pending a dialog/overlay pass.

#### The accessibility constraint held

`--color-surface` (`#FFFFFF`) vs `--color-bg` (`#FBF9F6`) is **1.05:1**, so the **border** carries the section boundary under WCAG 1.4.11's 3:1 floor — not the background, not the shadow. The obvious reflex once a card gains fill and shadow is to drop the border; that would have been an accessibility regression. **`border border-border` verified present on all 11 fieldsets** by both Leader and Reviewer.

#### `REACHABLE` deliberately not updated — and that call was audited

The Implementer left `contrast.test.ts` untouched, arguing that moving fields onto `bg-surface` adds new **sites** of pairs (`fg`/`surface`, `muted`/`surface`, `danger`/`surface`) that were **already gated**, so no pair went unreachable→reachable and no `file:line` citation became false. **Leader confirmed** all three inks already list `'surface'` in `grounds[]`. **Reviewer independently confirmed** and added the convention check: the block comment states citations are *representative* sweep results, not exhaustive site lists, so omitting the new sites is consistent rather than a KZ-008 omission.

#### Reviewer verdict (agy / `claude-opus-4-6-thinking`)

```
STATUS: PASS
SUMMARY: The diff correctly applies the ActorCard card treatment (minus interactive states) to all
11 fieldsets across both forms, preserves `border border-border` on every one (WCAG 1.4.11 boundary
intact), separates legend/label hierarchy by two axes (size + weight) using only frozen text-scale
tokens, wires `shadow-xs` to all text-entry inputs while correctly excluding checkboxes, and
omitting the REACHABLE update is independently verified as sound because all ink/ground pairs
inside fieldsets were already gated. Scope is exactly two files, class-only, with no markup, prop,
or behaviour change.
```

Leader-run gates: contrast **129/129** · `next lint --quiet` clean · build 23/23 static, 2/2 export. NFR-3's three named routes (`/` 164, `/directory` 157, `/map` 110 kB) **byte-identical**; `/register` moved 7.55→7.56 kB from longer class strings. `react-doctor` scored 89/100 with no issues.

#### ADVISORY (non-gating)

1. `shadow-lg` still unconsumed — FR-4 partially open, routed onward. Not T-7's responsibility.
2. **Carried to T-6's capture:** the `bg-surface` legend is CSS-correct, but a legend that **wraps to two lines at 375 px** interacts with the border notch in a way only rendered evidence can settle. A D-5 class observation — confirm at the 375 px capture.
3. `citedAt` does not list the new fieldset sites. Consistent with the file's stated convention (representative, not exhaustive), so not a KZ-008 omission.

#### VF-3 — recorded, not actioned

While answering a user question about the Partners section, the Leader measured every home-page section transition. All three light tokens sit within **1.14:1** of each other, so **background alone cannot create structure anywhere in this design**:

| Transition | Ratio | Reads as |
|---|---|---|
| AboutStrip → HowItWorks | 1.080 | imperceptible |
| HowItWorks → CropCoverage | **1.000** | **no boundary — identical token** |
| CropCoverage → PartnersStrip | 1.051 | imperceptible |
| (the two `bg-fg` bands) | 13.08 / 14.85 | strong |

Sections 4–7 therefore read as **one continuous light mass** between the two dark bands. Switching `PartnersStrip` to `bg-surface-alt` would move 1.051 → 1.080 — still imperceptible, so the token choice is not the defect. **Same root cause as VF-1:** structure in this palette must come from borders, shadows or dark bands, never from background alone. Awaiting user direction; not actioned.

---

### T-6 — status at hand-off: **`[~]` HELD, not complete**

Marked `[~]` rather than `[x]` deliberately. Several done-conditions **are** met and independently evidenced; one is **not**. Declaring it complete would be precisely the unfalsifiable completion this spec spent seven tasks eliminating — and the Leader has no standing to claim it after logging three instances of the same defect in others' work and one in its own.

#### What IS proven

| Condition | Evidence |
|---|---|
| Disqualifier (a) — no stale CSS | **Machine-verified.** Origin serves `1f0a123924cc8161.css`; 5 new tokens present, 3 old absent; `.shadow-xs{` emitted. Pre-deploy baseline recorded for comparison. |
| Diff containment | **9 files from base `7aeb358`, all inside the amended-NFR-7 allowed set.** `app/(public)/layout.tsx` appears only in `main..HEAD` because it is the OQ-3 cherry-pick, i.e. branch *base*, not spec work. |
| Build / lint / contrast | 23/23 static, 2/2 export · `next lint --quiet` clean · contrast **129/129** |
| NFR-3 | `/` 164 kB, `/directory` 157 kB, `/map` 110 kB — byte-identical to baseline |
| **FR-2 rendered evidence** | The user's own admin capture shows `text-warning` ("Not recorded — no evidence") legible on a white row — the pair that was **2.93:1** and is now **5.561:1**. This was the surface the Leader could not reach without credentials. |
| Disqualifier (c) — "the user has not actually looked" | **Demonstrably satisfied.** The user reviewed the deployed result across several rounds, sent five captures, identified a real defect (VF-1), and directed a change (T-7). |

#### What is NOT met — stated plainly

**The 8-surface × 3-width capture set does not exist.** `resize_window` reported success twice while the rendered viewport stayed at 1568 px, so no 375 px or 768 px capture was obtained. Per the anti-rabbit-hole rule the Leader stopped after two attempts rather than continuing to fight the tool. **Consequence:** responsive behaviour at 375/768 is **unverified**, including the Reviewer's advisory about a `<legend>` wrapping to two lines at 375 px.

**Formal aesthetic sign-off was never given as such.** The user looked, criticised, directed a fix, and then said *"continua como te parezca mejor"*. That is direction to proceed — **not** a statement that the visual result is approved. Recorded as what it was.

#### VF-4 — the `<legend>` fill protrudes above the card edge

Found by zooming the rendered page (the capture work T-6 exists to do). A native `<legend>` straddles the border — half above, half below. Once filled with `bg-surface`, the upper half renders **white against the warm canvas**, reading as a small white tab attached to the card's top-left rather than a clean notch. Subtle (the edge is 1.05:1) and strictly better than the pre-T-7 state, but the silhouette is wrong.

**Root cause, and why it is not a quick fix:** no single background is correct for both halves of an element that crosses the border. Fill it like the card and it protrudes into the canvas; fill it like the canvas and it intrudes onto the card. The real fix is to stop it straddling — which means a header row, **carefully**, per the incident below. Routed to `enhancement/form-elevation-ux`.

#### INCIDENT — the Leader shipped a broken layout to Dev

The user asked for VF-4 fixed "rápidamente". The Leader applied `float-left w-full` to the 11 legends, ran contrast + lint + build (**all three green**), and deployed **without rendering the page first**.

**It broke the layout.** `float-left` removes the legend from normal flow; the fieldsets use a grid for their two-column field layout, and the grid collapsed — overlapping labels, inputs crushed against the right edge. Reverted to `14a56f9` and redeployed; the live site was verified back to the reviewed state (5 legends / 5 fieldsets / 14 inputs with the correct classes). Nothing was lost from the repository.

**Dev served a broken registration form for several minutes.** Recorded because it happened, not because it was noticed.

**The lesson, and it is the spec's own lesson turned on its author.** All three automated gates passed because **none of them evaluates layout**. That is the same defect class the spec has now catalogued four times — T-1's presence assertion, T-3's accidentally-satisfiable grep, the review wrapper accepting a verdict-less transcript, and now this. The operative rule:

> **A change that alters flow or positioning cannot be validated by the build.** It requires rendered evidence, and that evidence must come *before* the deploy, not after. Pure colour/shadow changes are covered by the pipeline; layout changes are not.

"Quickly" was treated as licence to skip verification. It was not, and the Leader owned the failure rather than the Implementer, who never saw this change.

#### Remaining work to close T-6

1. Capture 8 surfaces × 375/768/1440 with a viewport that actually resizes.
2. Confirm the 375 px `<legend>` wrap (Reviewer advisory, still open).
3. Obtain explicit aesthetic sign-off, or record a decision to close without it.

---

## T-6 — round 2 (2026-08-08): capture set completed, gate still open

Resumed at `981ce5f`. **No repository change in this round** — `git status` clean throughout,
HEAD unmoved. All artefacts are captures held outside the tree. The three items above are
answered below: (1) done, (2) done — does not reproduce, (3) still owed.

### The viewport blocker is gone

Round 1 died because `resize_window` reported success while the rendered viewport stayed at
1568 px. Replaced with Playwright driving a real `viewport` per context, installed **in the
scratchpad only** — not vendored into the repo, per the root guide's `playwright-cli` note that
teammates without it must still be able to run every command.

The fix is not "a different tool worked". It is that **the harness now asserts the thing that
failed silently before**: every capture evaluates `window.innerWidth` in-page and records it in
the manifest, and a mismatch against the requested width is written into the capture's status.
A capture cannot now claim a width it does not have. All 27 app captures returned
`inner == requested`.

### Capture set — complete

| # | Surface | 375 / 768 / 1440 | Independently verified as |
|---|---|---|---|
| 1 | Home / hero | ✅ | viewport-only **and** full-page (see Q5 below) |
| 2 | Directory cards | ✅ | — |
| 3 | Admin actors table | ✅ | `h1 = "Actor management"`, **25 table rows** |
| 4 | Import preview | ✅ | **3 preview rows, 6 warning-text matches** |
| 5 | Map + filter rail | ✅ | — |
| 6 | Footer | ✅ | scrolled to `document.body.scrollHeight` |
| 7 | Dialog | ✅ | `[role="dialog"]` count = 1 |
| 8 | `/dashboard` charts | ✅ | LF-1 surface |
| 9 | Register form | ✅ | extra — the VF-4 / DR-1 surface |

**Auth surfaces (3, 4, 7) were reached this round.** The user logged in to a headed Playwright
browser which polled `localStorage` for the Cognito idToken and saved the session; credentials
never entered the agent. Session carried `cognito:groups: ["admin"]`. This closes the gap round 1
recorded as *"the surface the Leader could not reach without credentials."*

**Surface 4 was not accepted in its idle state.** A first pass captured `/admin/actors/import`
with `tableRows = 0` — the upload screen, not the preview. The task names *"import preview (the
two 12px warning pairs)"*, so the idle screen is not the surface. A 3-row workbook was built
against the live template (downloaded from the origin, headers read with `exceljs`) to trigger
all three warning classes — `GPS_CLEARED_WARNING`, `CONSENT_ACK_WARNING`,
`PHONE_UNNORMALIZABLE_WARNING` (`actor-import.service.ts:75,77,88`). **Preview only; commit was
never clicked.** `importActors(file,'preview')` is a dry run and `'commit'` is a separate action
(`import/page.tsx:306-385`), so nothing was written to Dev.

### T6 visual gate — dispatched to Antigravity, and audited rather than relayed

Two rounds on `agy` / `gemini-3.1-pro-high`, per the routing in Document Control. Both returned
`FAIL`. **Neither verdict was adopted as written**; each contained a defect the Leader had to
adjudicate, and the record below is the adjudication, not the transcript.

**Round 1 silently renumbered its own answers** — it answered the VF-4 question under a "Q5"
heading, invented a map-modal question in Q4's slot, and never answered the question actually
asked as Q5 (home-page section structure). Round 2's brief pinned the numbering explicitly and
forbade substitution; it then answered Q5 honestly as `CANNOT VERIFY`, which was **correct and
was the Leader's fault** — the home captures were viewport-only, so sections 4–7 were never in
frame. Re-captured full-page afterwards.

| Finding | Verdict | Basis |
|---|---|---|
| Comp fidelity (Q1) | **holds** | warm canvas `#FBF9F6` vs white cards `#FFFFFF` reads as the comp intends at all three widths |
| `shadow-sm` vs `shadow-md` (Q3) | **distinguishable** | dialog panel separates clearly from the dimmed backdrop |
| Warning colour on data surfaces (Q7) | **legible, and distinct from danger/success** | supports FR-2 on the surfaces the Leader could not previously reach |
| **`shadow-xs` vs flat (Q2)** | **INCONCLUSIVE — disqualifier (b) fires** | see below |
| **VF-4 legend artefact (Q4)** | **CONFIRMED, obvious** | see below |
| Nav clipping at 768 px | **real, but pre-existing and out of scope** | see below |

### `shadow-xs` is present in the CSS and imperceptible on screen — VF-2's `xs` half is NOT closed

The gate reports inputs at rest as "functionally flat": `shadow-xs` is
`0 1px 2px rgba(61,47,32,0.04)`, and at 4 % alpha over 1 px it does not separate from flat in the
render. **Disqualifier (b) fires**, and its instruction is explicit — this is reported as
inconclusive and is *not* collapsed into a pass.

This matters beyond one screenshot. T-7's done-condition read *"inputs carry `shadow-xs`"* and was
discharged by confirming the class was applied. **That is a presence assertion, and KZ-002 says a
presence assertion is not a behavioural proof.** The class is genuinely applied — `.shadow-xs{…}`
is emitted in the deployed bundle and the inputs carry it — and the rendered result is still
nothing. T-7's *"This closes VF-2's `xs` half"* is therefore **withdrawn**: the token is wired
correctly and is perceptually inert. Whether the fix is a heavier `xs` or dropping the rung is a
design decision, and it belongs to `enhancement/form-elevation-ux` alongside the rest of VF-2.

Its sibling was already known: **`shadow-lg` has zero consumers.** All four dialogs use
`shadow-md` (`ConfirmDialog.tsx:154`, `AcknowledgeDialog.tsx:216`, `CreateUserDialog.tsx:216`,
`EditUserDialog.tsx:184`), and `.shadow-lg` is absent from the deployed bundle while `xs`/`sm`/`md`
are present. The task's *"one dialog (backdrop + `shadow-lg`)"* describes a state the app has never
had. Recorded as a gap and routed out by user decision (2026-08-08); T-6's allowed-files set is
`execution.md` + captures, so applying it here would have been the scope breach the tripwire exists
to catch. **Net: the four-rung ladder has two rungs that render — `sm` and `md`.**

### VF-4 confirmed — and the Leader's own probe was wrong first

Both gate rounds flagged the register-form legend, **with incompatible explanations**: round 1
said a white mask protrudes *above* the card into the canvas; round 2 said there is *no* masking
and the border strikes through the glyphs. They cannot both be true, so the Leader measured.

The measurement said `straddles: false`, `legendTop == fieldsetTop == 208.5`, `aboveBy: 0` —
apparently refuting both. **That probe was invalid and was nearly written into this log as fact.**
It compared the legend against the fieldset's *border-box* rectangle, which is not where the
border is painted when a `<legend>` interrupts it; the computation could not have detected the
artefact it was asked about. A cropped element screenshot settled it in one look.

**The artefact is real and obvious.** The legend's `#FFFFFF` fill breaks the card's top-left
rounded corner and reads as a white tab against the `#FBF9F6` canvas. Round 1's description was
right; round 2's "border strikes through the text" is wrong — the border is *interrupted*, not
crossing the glyphs. VF-4 stands as routed to `form-elevation-ux`, and its severity is **raised
from the "subtle" recorded at hand-off to obvious**.

Worth stating plainly: on the single most important open defect, two automated rounds disagreed
with each other and the Leader's first measurement agreed with neither. **What resolved it was
looking at the pixels.** That is the same lesson as the reverted `float-left` incident, arriving
from the opposite direction — there, a change was shipped because three green gates were mistaken
for rendered evidence; here, three machine results were mistaken for it again.

### The 375 px `<legend>` wrap advisory does not reproduce — closed

Measured at all three widths across all five legends: every one is `height = 24 px` against
`line-height = 24 px`, i.e. exactly one line, including the longest string
("Data protection & consent") at 375 px. The Reviewer advisory is **closed as not-reproducing**.

The same probe confirms **DR-1**: `<legend>` computes `600 / 16px` against `<label>` at
`500 / 14px` — separated on **two** dimensions, satisfying T-7's *"more than one step"*.

### Two defects found that are NOT this spec's — recorded, not absorbed

Both were surfaced by the gate and both were checked against `git` before being attributed.

1. **Nav clipping at 768 px.** Measured, not eyeballed: three items render past the viewport —
   `Directory` (right edge 789), `About` (861), `Register your organisation` (1085) against a
   768 px viewport. `Header.tsx:331` is `hidden md:flex`, so the desktop nav switches on at
   exactly the width where its six items no longer fit. **`Header.tsx` is untouched by this
   spec** (this spec's only `shell/` edit is `Footer.tsx`, comment-only); it was last changed
   `2b9fa1f` (2026-08-05, `actors/public-self-registration` T-15) — the commit that **added the
   199 px "Register your organisation" entry** that overflows the row.
2. **Map legend at 375 px** overlaps the zoom controls. `MapLegend.tsx:46` is
   `absolute bottom-6 left-3 z-[1000]` with no responsive variant — no token this spec changed is
   involved. Untouched by this spec; last changed `50c4e4d` (2026-08-05).

Neither is a regression from the token change; both pre-date it. They are recorded here and
**deliberately not turned into tasks in this spec** — that is the advisory-never-becomes-a-task
rule, and the same call already made for the flaky frontend suite. Each warrants its own
`bugfix/` proposal.

### Gates

**Not re-run this round, deliberately.** The working tree is byte-identical to `981ce5f`, the
state at which they were last run and recorded above: 23/23 static + 2/2 export,
`next lint --quiet` clean, contrast **129/129**, bundle sizes unchanged from baseline. Re-running
an unchanged tree would produce evidence about the same commit, and — per the suite-gate note —
the full suite is nondeterministic, so a fresh run could only *weaken* the record by adding a
flaky failure unrelated to this spec. Diff containment against base `7aeb358` re-checked: 18
files, all inside the amended NFR-7 allowed set.

Disqualifier (a) re-verified against the live origin: bundle `1f0a123924cc8161.css` carries all
five new tokens and none of the old. The single `C9821B` hit is **`--crop-sorghum`, not
`--color-warning`** (`--color-warning:#8F5E10`) — that is T-3's *decouple warning from crop
identity* working as designed, not a stale value. Disqualifier (c) does not apply; the user has
looked, repeatedly.

### T-6 status: still `[~]`

| Done-condition | State |
|---|---|
| Gates green | ✅ carried from `981ce5f`, tree unchanged |
| `git diff --stat` within the allowed set | ✅ 18 files, all allowed |
| Captures for all 8 surfaces × 3 widths | ✅ **met this round** |
| Disqualifier (a) — no stale CSS | ✅ machine-verified |
| Disqualifier (b) — ladder distinguishable | ❌ **fires** — `xs` imperceptible, `lg` unrenderable |
| **User has approved the visual result (AR-1)** | ❌ **not given** |

Two conditions are unmet, one of them a formal disqualifier. **AR-1 is not machine-decidable and
no accumulation of automated results substitutes for it.** T-6 is held at `[~]` for the second
time, on narrower and better-evidenced grounds than the first.

### VF-5 — raised by the user at the AR-1 gate, 2026-08-08

Looking at the home page's Partners section, the user asked whether its white space is
intentional. Measured on the live page at 1440 px:

| | |
|---|---|
| Section background | `#FFFFFF` (`bg-surface`) — the only pure-white full-bleed band on the home page |
| Neighbour above / below | `#FBF9F6` (**1.051:1**) / `#2A2724` |
| Section height | 694 px |
| Logo ink | 6 logos capped at 40 px → 240 px total (**~35 %**) |
| Side gutters | 80 px (`max-w-7xl` at 1440) |

**The colour is deliberate; its visibility is not.** `PartnersStrip.tsx:9` documents
`bg-surface` as the intended treatment (FR-6 / §5.3) — but that choice was made when
`--color-bg` was also `#FFFFFF`, so it had no visual consequence. This is the **third** instance
of the same pattern in this spec (VF-1 fieldsets, the home-section mass, now this): the refresh
did not create these, it removed the white-on-white camouflage that hid them.

**But the visible complaint is emptiness, not tone.** At 1.051:1 the band edge is below
perception, and `bg-surface-alt` would move it only to 1.080 — the same dead end already
recorded for every light-section transition here. 240 px of ink in a 694 px section is the
actual finding. The levers are logo scale, vertical rhythm, or a border; **never the background
token.**

`PartnersStrip.tsx` is untouched by this spec. **Recorded and routed to
`enhancement/form-elevation-ux` §9 by user direction; not actioned here** — no task was minted
in this spec for it, per the advisory-never-becomes-a-task rule.

### AR-1 remains ungiven — stated explicitly because the last close-out got this wrong

The user's instruction at this point was **"YES and continue"**, directing that VF-5 be recorded
and routed out and that execution proceed. **That is direction to proceed. It is not aesthetic
approval, and it is not recorded as such.** The previous hand-off logged
*"continua como te parezca mejor"* and had to note, correctly, that it was not sign-off; repeating
that conflation now — with the user's words once again being about *what to do next* rather than
*whether the result looks right* — would be the same error with a better audit trail.

**AR-1 is unmet.** T-6 stays `[~]`. Note that this is not currently the binding constraint:
**disqualifier (b) fires independently**, so T-6 could not reach `[x]` on this commit even with
sign-off in hand.

## T-6 — closed at archive (2026-08-08, `/akili-archive` on the merged tree)

**Disqualifier (b) is now moot.** This branch was merged with `enhancement/form-elevation-ux`
(already archived on the other line of work) before this archive ran. Verified directly against
the merged tree, not inherited as a claim: `frontend/app/globals.css` — `--shadow-xs:
0 1px 2px rgba(61,47,32,0.12)` (was `0.04`, the imperceptible value this section flagged) and
`--shadow-lg: 0 16px 40px rgba(61,47,32,0.14)`; `grep -rn "shadow-xs\|shadow-lg" components/`
shows `shadow-lg` consumed by all four dialogs (`ConfirmDialog.tsx:154`, `AcknowledgeDialog.tsx:216`,
`CreateUserDialog.tsx:216`, `EditUserDialog.tsx:184`) and `shadow-xs` consumed by both adopted
forms' inputs (`ActorForm.tsx:518`, `RegistrationForm.tsx:462`). The four-rung ladder now has four
rendering rungs, not two.

**AR-1 is now given.** The user reviewed the live Dev deploy (`https://d3idqvvg0xa1r7.cloudfront.net`,
post-merge — warm-earth tokens, the elevation ladder, and the unrelated `SearchableSelect` adoption
together) earlier in this session and, when asked directly and explicitly *"do you approve the
visual result?"* — not *"should I continue?"* — answered yes. Recorded as sign-off, not direction
to proceed, per this section's own standard for the distinction.

**Re-verification with the tree quiet:** `npm test -- --silent` — 88 suites / 1357 tests passing;
`npm run build` — static export clean, 23/23 pages; `npm run lint` — clean (pre-existing unrelated
`<img>` warnings only). Both formal blockers cleared. **T-6 → `[x]`.**
