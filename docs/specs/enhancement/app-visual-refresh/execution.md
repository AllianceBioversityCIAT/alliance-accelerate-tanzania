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
