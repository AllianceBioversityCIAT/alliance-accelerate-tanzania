# Execution — Warm-Earth Surface System (app-wide visual refresh)

## Document Control

- **Spec path:** `docs/specs/enhancement/app-visual-refresh/`
- **Approval Mode:** `gated` (from `requirements.md` Document Control)
- **Budget (`design.md` §11):** 6 tasks · ~200 LOC · 7 review rounds
- **Tripwire:** >8 tasks or >300 LOC → stop and escalate
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
the Implementer's context, because it is a different CLI with a different provider. The Reviewer
is dispatched with `--mode plan`, which denies writes at the harness level and enforces the
read-only contract by configuration instead of by instruction.

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
- The failure is **deterministic** across two consecutive full-suite runs — same single test, same
  count both times. It is not a flake.
- Nothing in this branch's base can cause it: the only frontend delta from `main` is
  `(public)/layout.tsx` (the sticky-footer fix), and the failing assertion is an `aria-live`
  region lookup in the **admin import** page.

**Consequence for T-6.** T-6's verification is the full suite (`npm test -- --silent`), whose
`tasks.md` done-condition reads *"gates green"*. That condition is **unreachable on this base for
reasons this spec did not create**. T-6's test gate is therefore evaluated as **"no new failures
against this recorded baseline"** — 1 failed / 1150 passed / 85 suites, with
`actors/import/page` green in isolation. Any second failure, or a change in that one, is a
regression owned by this spec.

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
