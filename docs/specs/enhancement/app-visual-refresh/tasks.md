# Tasks — Warm-Earth Surface System (app-wide visual refresh)

- **Spec path:** `docs/specs/enhancement/app-visual-refresh/`
- **Status:** Draft · **Depth:** Standard · **Approval Mode:** `gated`
- **Budget (design.md §11):** 6 tasks · ~200 LOC · 7 review rounds
- **Traces:** `requirements.md` FR-1…FR-8, NFR-1…NFR-7, AR-1 · `design.md` §5, §8, §10

> ⚠️ **`/akili-execute` must resolve OQ-3 before its first commit.** This branch was cut from `actor-register` @ `95bb89d` and carries 5 unmerged commits plus unrelated uncommitted work. Implementation is unblocked; **committing is blocked** until the base is settled.

---

## Tasks

- [x] **T-1** Build the contrast harness with a known-failure ledger  (deps: none)
      **Size:** M (~120 LOC) · **Skills:** `ui-ux-pro-max`, `tdd`
      **Scope:** A pure `contrastRatio(fg, bg)` + `compositeOver(fg, bg, alpha)` utility and a matrix test over the token palette. Ships **before** any token changes and is green in both states.
      The test asserts **two** things: every pair outside `KNOWN_FAILURES` meets its threshold, **and** every pair inside it still fails. The second assertion is what stops the ledger rotting — a pair fixed by accident breaks the build until it is delisted.
      `KNOWN_FAILURES` seeds with the **4** FR-2 shipped failing pairs plus `warning`/`bg` (defensive — T-3 names it as a required ground with no current render site) = **5 entries**, each cited to this spec.
      Matrix: 7 inks (`fg`, `muted`, `primary`, `primary-hover`, `success`, `warning`, `danger`) × 9 grounds (`bg`, `surface`, `surface-alt`, `restricted`, `highlight-tint`, `highlight/20`, `warning/10`, `danger-soft`, `primary-soft`). Large-text/UI-only tokens (`accent`, `highlight`, `crop-*`) asserted at 3:1 and labelled as such.
      Also asserts FR-6 frozen-token equality (Group F) so brand drift is caught from this point forward.
      **Traces:** NFR-1, FR-2 (ledger), FR-6 (*"BUT it MUST NOT be claimed on the basis of the diff alone; an explicit equality assertion is required"*), design.md DD-7, §10
      **Files:** `frontend/lib/contrast.ts`, `frontend/lib/contrast.test.ts`
      **Verify:** `cd frontend && npm test -- contrast --silent`
      **Done when:** suite green, and each ledger entry is asserted-failing against the *current* (unchanged) tokens.
      **Evidence is disqualified if:** the matrix omits any ink×ground combination that a component can actually produce. A green run over an incomplete matrix is not evidence — report the omissions instead of passing. Ratios are deterministic; if two runs disagree, the utility is wrong, not flaky.

- [x] **T-2** Re-author surface and ink tokens, including the derived backdrop  (deps: T-1)
      **Size:** S (~40 LOC) · **Skills:** `tailwind-design-system`
      **Scope:** Group A (`bg`, `surface-alt`, `border`, `fg`, `muted`, `restricted-bg`) and Group B (`backdrop`, recomputed from the new `fg`). `--color-surface` stays `#FFFFFF`.
      All declarations stay inside `:root` — no colour literal may appear outside it (NFR-4 keeps a future `.dark` scope cheap).
      **Traces:** FR-1 both scenarios · design.md §5.1 Groups A–B, DD-2, DD-5 · NFR-4
      **Covers clauses:** *"BUT it MUST NOT change `--color-surface`"* · *"AND `--color-bg`, `--color-surface-alt`, `--color-border`, `--color-fg`, `--color-muted`, `--color-restricted-bg` MUST each carry a non-zero warm hue (R > B)"* · *"AND IT MUST hold ≥ 4.5:1 for `--color-bg` ink on `--color-fg` ground"* (footer)
      **Files:** `frontend/app/globals.css`
      **Verify:** `cd frontend && npm test -- contrast --silent && npm run build`
      **Done when:** contrast suite still green (ledger unchanged — these tokens are not the FR-2 inks), `R > B` holds for all six Group A values, and `--color-backdrop`'s rgb triplet equals the new `--color-fg`.
      **Evidence is disqualified if:** `--color-backdrop` was updated by editing its alpha or by eye rather than by recomputing from `--color-fg` — the two must be the same colour at 40%, and a near-miss reads identical on screen while making the source comment false (KZ-008).

- [x] **T-3** Remediate the four AA failing pairs and decouple warning from crop identity  (deps: T-1, T-2)  *(landed atomically with T-2 per ADJ-4)*
      **Size:** S (~10 LOC) · **Skills:** `ui-ux-pro-max`
      **Scope:** `--color-warning` → a value clearing 4.5:1 on `surface`, `bg`, `surface-alt` **and its own 10% composited chip**. `--color-success` → a value clearing 4.5:1 on `highlight-tint`, `highlight/20` and `restricted`. Empty `KNOWN_FAILURES` in the same commit.
      **The crop tokens are not touched.** This must be two independent token edits, never a find-and-replace of `#C9821B`.
      **Traces:** FR-2 both scenarios, FR-3 scenario · design.md §5.1 Group C, DD-3
      **Covers clauses:** *"AND IT MUST be verified against the composited chip colour, not against the base surface"* · *"BUT it MUST NOT be achieved by enlarging the text or removing the warning styling"* · *"BUT it MUST NOT change `--color-highlight` or `--color-highlight-tint`"* · *"THEN `--crop-sorghum` MUST remain byte-identical"* · *"AND `--crop-bean` and `--crop-groundnut` MUST likewise remain unchanged"* · *"BUT it MUST NOT be implemented as a single find-and-replace of `#C9821B`"*
      **Files:** `frontend/app/globals.css`, `frontend/lib/contrast.test.ts`
      **Verify:** `cd frontend && npm test -- contrast --silent && git diff -U0 -- frontend/app/globals.css | grep -c 'crop-'`
      **Done when:** `KNOWN_FAILURES` is empty, the full matrix passes at its thresholds, and the `git diff` shows **zero** `--crop-*` lines changed.
      > **Corrected 2026-08-07 (T-3 Implementer finding, confirmed by the Reviewer).** The original form, `git diff -- … | grep -c 'crop-'`, is **unsound**: it returns **1**, not 0, because `--crop-sorghum` falls inside the default 3-line unified-diff context radius below the `--color-restricted-bg` edit, and `grep -c` counts context lines regardless of `+`/`-` prefix. The check would therefore report a violation for *any* edit landing within three lines of a crop token, and would equally pass by luck if the radius happened to exclude a real change. `-U0` restricts the diff to changed lines, so only a genuine crop edit can appear. Equivalent alternative: `git diff -- frontend/app/globals.css | grep -E '^[+-].*crop-'` (expect no output). **A verification command that can be satisfied by accident is not a gate** — this is the same defect class as a presence assertion (KZ-002).
      **Evidence is disqualified if:** the chip pair was checked against `#FFFFFF` instead of the composited 10% wash. That is the pair that fails hardest today (2.83:1) and checking the wrong ground yields a passing number for a failing pixel.
      **Also owed here (T-1 advisory #1):** `REACHABLE.fg.citedAt` in `contrast.test.ts` cites `ui/Button.tsx:44` for `"bg-surface text-fg"`; the real line is **49** (the `:51` in the same string is correct). Fix the citation while emptying the ledger — this matrix is T-3's to own, and a false `file:line` is exactly the unfalsifiable-evidence failure KZ-008 names.

- [x] **T-4** Add the elevation ladder and gradient tokens, with Tailwind mappings  (deps: T-2)
      **Size:** M (~45 LOC) · **Skills:** `tailwind-design-system`
      **Scope:** Four warm-tinted shadow steps (`xs`/`sm`/`md`/`lg`) replacing the two cool ones, plus `--gradient-hero` / `--gradient-band`. **Every new token gets a `tailwind.config.ts` entry in the same task** — `boxShadow.xs`, `boxShadow.lg`, and a `backgroundImage` family.
      `--shadow-sticky-edge` is not touched (DD-4): its `inset` geometry is load-bearing for the admin sticky-column boundary, not decorative.
      **Traces:** FR-4 scenario, FR-5 scenario · design.md §5.1 Groups D–E, §5.2, DD-4
      **Covers clauses:** *"THEN at least four shadow steps MUST exist, each mapped to a Tailwind utility"* · *"AND the shadow colour MUST be warm-tinted"* · *"BUT it MUST NOT alter `--shadow-sticky-edge`"* · *"BUT it MUST NOT require an arbitrary Tailwind value"* · *"AND IT MUST NOT apply a gradient behind body text where it would make any ink's worst-case ratio fall below NFR-1"*
      **Files:** `frontend/app/globals.css`, `frontend/tailwind.config.ts`
      **Verify:** `cd frontend && npm run build && npm run lint`
      **Done when:** `shadow-xs`/`shadow-sm`/`shadow-md`/`shadow-lg`/`bg-gradient-hero`/`bg-gradient-band` all resolve to non-empty values in the built CSS, and `--shadow-sticky-edge` is byte-identical.
      **Evidence is disqualified if:** proven only by the CSS variable existing in `:root`. **This is the D-4 trap**: a token with no `tailwind.config.ts` entry generates no utility class, `npm run build` still succeeds, and a variable-presence assertion still passes while the class does nothing. Only the built CSS output or a screenshot counts. Defer the rendered half to T-6, but do not mark this task done on a presence check alone.

- [ ] **T-5** Sync the baseline docs, sweep stale values, and correct QA-11  (deps: T-2, T-3, T-4)
      **Size:** M (~30 LOC docs) · **Skills:** `cognitive-doc-design`
      **Scope:** Four edits, each closing a named clause:
      1. `docs/ux-ui/design.md` §7 token block → matches `globals.css` exactly.
      2. §7 accent-usage note → extended to cover `warning` and to state the marker-vs-ink threshold split, **recording that `--color-warning` and `--crop-sorghum` are intentionally distinct** so a future cleanup does not re-merge them (DD-3). Also records that the Hero scrim and `--gradient-hero` are different mechanisms (DD-6), and the dark-scope shadow-alpha note (OQ-4).
      3. Two stale comments: `frontend/components/shell/Footer.tsx:2`, `frontend/components/dashboard/DashboardMapPanel.tsx:51`. **`DashboardMapPanel.tsx:50` cites `#FFFFFF` for `--color-surface` and stays correct — do not edit it.**
      4. `docs/trd/trd.md` QA-11 → response measure records that `color-contrast` is not evaluable under jsdom and names the computed-ratio test instead.
      5. **Added 2026-08-07 (T-4 Reviewer advisory #1).** `design.md` §5.1 **Group E** describes `--gradient-hero` as a *"Diagonal canvas→**surface** wash"*, implying two stops (`bg`→`surface`), but the approved `mockup/index.html:50` and the landed implementation use **three** (`surface-alt`→`bg`→`surface`). Reconcile the prose to the approved three-stop form. **Also record `--gradient-band`'s landed value**, which no document currently states — design.md gives only the purpose sentence *"Vertical canvas→alt wash for section transitions"* and the mockup has no such token, so the value in `globals.css` was a disclosed T-4 derivation. Whatever survives T-6's HITL gate is what §7 must record.
      **Traces:** FR-7 scenario, FR-8 scenario, FR-3 (*"AND IT MUST be recorded in `design.md` §7"*) · KZ-004, KZ-008
      **Covers clauses:** *"THEN §7's token block MUST match `globals.css` exactly"* · *"AND §7's accent-usage contrast note MUST be extended"* · *"AND the two stale comment sites MUST be corrected"* · *"BUT it MUST NOT rewrite anything under `docs/specs/archive/**`"* · *"AND IT MUST close by grep"* · *"BUT it MUST NOT weaken or remove the QA-11 accessibility scenario itself"* · *"AND IT MUST NOT claim contrast coverage from `jest-axe` anywhere else in the baseline"*
      **Files:** `docs/ux-ui/design.md`, `docs/trd/trd.md`, `frontend/components/shell/Footer.tsx`, `frontend/components/dashboard/DashboardMapPanel.tsx`
      **Verify:** for each superseded value `V` in {`#FFFFFF`-as-bg, `F7F7F7`, `#333333`, `#666666`, `#E2E2E2`, `F3F3F3`, `rgba(51, 51, 51`, old `warning`, old `success`}: `grep -rn "V" docs frontend | grep -v 'docs/specs/archive/' | grep -v 'docs/specs/enhancement/app-visual-refresh/'` returns nothing unintended. Then `cd frontend && npm run lint`.
      **Done when:** every sweep returns clean, and `jest-axe` is not cited as contrast coverage anywhere in `docs/`.
      **Evidence is disqualified if:** the sweep was run only over the files this spec names. **KZ-004 exists because per-site fixes miss the sites nobody listed** — the sweep is per *value* across the whole repo, then filtered to exclude the frozen archive, never a walk of a predetermined file list.

- [ ] **T-6** Capture rendered evidence and run the human visual gate  (deps: T-2, T-3, T-4, T-5)
      **Size:** M · **Skills:** `ui-ux-pro-max`, `frontend-design`
      **Scope:** Start the local stack per `docs/infrastructure.md` § Local Environment (do **not** guess start commands). Capture each surface in `design.md` §5.4 at **375 / 768 / 1440 px**: Home/Hero, directory cards, admin actors table, import preview (the two 12px warning pairs), map + filter rail, footer, one dialog (backdrop + `shadow-lg`).
      Compare against `mockup/index.html`. Attach captures to `execution.md`.
      Confirm NFR-7 by diff and NFR-3/NFR-5 by build.
      **Traces:** D-4, D-5, AR-1 · FR-1 scenario 2 (*"BUT it MUST NOT be treated as a text-only token change; the footer is a rendered surface requiring visual evidence"*) · FR-4 (*"AND IT MUST be proven by rendered evidence, not by asserting the CSS variable exists"*) · NFR-3, NFR-5, NFR-7
      **Files:** `docs/specs/enhancement/app-visual-refresh/execution.md` (+ captures)
      **Verify:** `cd frontend && npm test -- --silent && npm run build && npm run lint && git diff --stat`
      > **Suite gate restated 2026-08-07 — the full suite is nondeterministic, so "green" is not a usable gate.** Four Leader runs on an unchanged tree gave **1, then 0, then 3, then 3** failures, with *different* suites failing each time (`actors/import/page.test.tsx`, `actors/page.test.tsx`, `ActorForm.test.tsx`). Every failing suite **passes in isolation** (65/65 in 12.5 s vs 45–56 s under parallel load) — timeout-class contention, confirmed by the Reviewer as unrelated to this spec (the flaky suites contain **zero** references to any semantic colour token). The earlier baseline note in `execution.md` calling this failure "deterministic" was drawn from too small a sample and is **superseded**. **The gate is therefore:** every suite that fails under full-suite load MUST pass when run in isolation, and no failure may reference a token this spec changed. A bare pass/fail count is *not* evidence either way. This flakiness is **pre-existing repo health, out of scope here** — it warrants its own `bugfix/` spec and must not be absorbed silently into this one.
      **Done when:** gates green (suite gate per the note above); `git diff --stat` shows **only** `globals.css`, `tailwind.config.ts`, `lib/contrast*`, the two comment-only component edits, and docs; captures exist for all seven surfaces at all three widths; **and the user has approved the visual result at the HITL gate.**
      **Evidence is disqualified if:** (a) captures were taken without a hard reload, so stale CSS is in the frame; (b) `shadow-xs` and `shadow-lg` are visually indistinguishable in the capture — that means the ladder did not apply and the capture is *inconclusive*, which must be reported as inconclusive, never collapsed into a pass because the command exited `0`; (c) the user has not actually looked. **AR-1 is not machine-decidable — no automated result substitutes for the human gate here.**

---

## Dependency Graph

```
T-1 ─┬─▶ T-2 ─┬─▶ T-3 ─┐
     │        │        ├─▶ T-5 ─▶ T-6
     └────────┴─▶ T-4 ─┘
```

`T-1 → T-2 → T-3 → T-5 → T-6` · `T-2 → T-4 → T-5`

A task is eligible when its status is `[ ]`/`[~]` and every dependency is `[x]`. **T-4 may run in parallel with T-3** (disjoint token groups, same file — sequence them if the Leader is running a single Implementer). No cycles.

---

## Coverage Closure (KZ-001)

Closes at scenario and clause granularity. **A gap is never discharged by citing a different requirement.**

| Requirement | Scenario | Owning task |
|---|---|---|
| FR-1 | Canvas separates from card | T-2 |
| FR-1 | Footer is a surface, not only ink | T-2 (value) + **T-6** (rendered proof) |
| FR-2 | Warning text legible at 12px | T-3 (fix) + T-1 (ledger) |
| FR-2 | Success text on its tint | T-3 (fix) + T-1 (ledger) |
| FR-3 | Fixing warning does not repaint the map | T-3 (tokens) + T-5 (§7 record) |
| FR-4 | Depth becomes perceptible | T-4 (tokens+mapping) + **T-6** (rendered proof) |
| FR-5 | Gradient surface without hardcoding | T-4 |
| FR-6 | The brand survives the refresh | T-1 (equality assertion) |
| FR-7 | No document outlives its values | T-5 |
| FR-8 | The gate names what it can actually see | T-5 |
| NFR-1 | — | T-1 (harness), T-2/T-3 (satisfaction) |
| NFR-2 | — | T-5 (grep sweep) |
| NFR-3, NFR-5 | — | T-6 (build) |
| NFR-4 | — | T-2 (`:root`-only declarations) |
| NFR-6 | — | T-1 (frozen-token equality) |
| NFR-7 | — | T-6 (`git diff --stat`) |
| AR-1 | Accepted risk — no automated gate | **T-6 human gate only** |

**Two clauses deliberately split across tasks** because a token value and its rendered effect are different proofs: FR-1 scenario 2 and FR-4. Neither is closed by its token task alone — this is the KZ-002 rule applied, not a decomposition gap.

---

## Testing & Verification Expectations

- Frontend gates: `cd frontend && npm test -- --silent` · `npm run build` · `npm run lint`.
- Prefer the targeted `npm test -- contrast --silent` during T-1…T-3.
- **No AWS command runs in this spec.** Nothing deploys; `deploy-frontend.sh` is out of scope.
- **A presence-assertion is not behavioural proof (KZ-002).** T-4's variable-exists check and T-1's class-name assertions each record what they cannot prove; the behaviour itself is proven in T-6.
- **An inconclusive verification is a legitimate, reportable outcome.** T-6 states explicitly when a capture is inconclusive. It must never be collapsed into a pass.

## Execution Conventions

- Commits: `[SPEC:enhancement/app-visual-refresh] <message>`.
- Leader maintains `execution.md`: one entry per loop iteration, evidence before checkbox.
- **Budget tripwire:** >8 tasks or >300 LOC → stop and escalate. That overrun means the change stopped being token-only and started touching components — NFR-7 failing, not ambition.
- **Blocked on OQ-3:** do not commit until the branch base is resolved.
