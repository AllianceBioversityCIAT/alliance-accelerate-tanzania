# Tasks — Searchable Region Select

- Spec path: `docs/specs/enhancement/searchable-region-select/`
- Traces: `requirements.md` FR-1…FR-6 / NFR-1…NFR-5 · `design.md` §5.1–§5.7, DD-1…DD-6
- Budget (`design.md` §11): **6 tasks · ~820 LOC · 7 review rounds.** `/akili-execute` escalates to the user rather than continuing when an actual exceeds these.
- Judgment Day: `judgment.md` — `APPROVED ✅`. JD-10 and JD-11 were left for this decomposition and are now closed in `design.md` §5.3.

---

## Standing rules for every task in this spec

**The verification asymmetry.** Suppress passing noise; **paste failures complete and verbatim** — that output is the Reviewer's evidence.

**Lint command — corrected 2026-08-06, after the original form failed in T-1 *and* T-2.** This spec's verify blocks originally specified `npx eslint "<path>" --quiet`. **That command does not execute in this repo at all:**

```
ESLint: 9.39.4
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
From ESLint v9.0.0, the default configuration file is now eslint.config.js.
```

The repo ships only a legacy `.eslintrc.json` while ESLint 9 defaults to flat config. Both T-1 and T-2 hit it and each independently substituted a working equivalent — **a procedure carrying every required clause can still be unexecutable, which is KZ-002's recurrence extended to documents.** Every remaining verify block below now specifies the working form:

```
cd frontend && npx next lint --file <path> [--file <path>]
```

This is not a weaker gate: in T-2 it caught a real `react-hooks/exhaustive-deps` violation that the Implementer then fixed. `ESLINT_USE_FLAT_CONFIG=false npx eslint "<path>" --quiet` also works if the flat-config migration ever lands. **Never run `npm run lint` in `backend/`** — it runs `eslint --fix` and mutates the diff under review.

**Three defect classes have no automated gate in this repo** (`requirements.md` §4.1): **D5** contrast, **D6** popup geometry, **D7** real focus order. `jest-axe`'s `color-contrast` rule returns `incomplete` under jsdom and `toHaveNoViolations` does **not** fail on `incomplete`; `getBoundingClientRect` returns zeros. **A green `npm test` is necessary and not sufficient for this spec.** T-6 is the gate for all three, and it is a gate, not a courtesy.

**Presence is not behavior (KZ-002).** Any test asserting that a class, attribute, or config entry *exists* must carry a comment stating what it cannot prove. `motion-reduce:` being in the class list does not prove the transition is suppressed.

---

- [x] **T-1  Pure region matcher + unit tests**  (deps: none)
      **Size:** S · ~70 LOC (helper ~25, tests ~45)
      **Traces:** FR-1 (both scenarios' matching clauses) · `design.md` §5.4
      **Skills:** `tdd` — Leader-assigned here specifically: this is a pure function with exact expected values available from FR-1's scenarios, which is where red-green earns its cost. Not assigned to any other task in this spec.
      **Files:** `frontend/lib/text/fold-search.ts`, `frontend/lib/text/fold-search.test.ts`
      **Scope:** One exported pure predicate performing case-insensitive, diacritic-folded, whitespace-trimmed **substring** matching. Nothing else — no React, no DOM, no knowledge of regions.
      **Tests must cover, from FR-1's clauses:**
        · substring, **not** prefix — `Pemba` matches BOTH `Kaskazini Pemba` and `Kusini Pemba` (FR-1's explicit `AND`)
        · case-insensitivity — `kus` matches `Kusini Unguja`
        · diacritic folding — a query typed with combining marks matches an unaccented region
        · leading/trailing whitespace ignored
        · empty query returns all inputs
      **Verify:** `cd frontend && npm test -- --silent --testPathPatterns fold-search`
      **Done when:** every FR-1 matching clause has a named test; the helper has no import from `react`, `next`, or `@/components`.
      **Evidence is DISQUALIFIED if:** the substring case is tested only with a prefix example (`Kus` → `Kusini …` passes under a prefix-only implementation and proves nothing about FR-1's actual requirement). At least one assertion must use a query that matches **mid-string**.

- [x] **T-2  `SearchableSelect` primitive — state, keyboard, ARIA, live region**  (deps: T-1)
      **Size:** L · ~420 LOC (component ~250, tests ~170) — the largest task; the budget allots it **2 review rounds**
      **Traces:** FR-1 (no-match scenario), FR-2 (both scenarios), FR-3 (all clauses), FR-6 · NFR-1, NFR-2, NFR-3, NFR-4, NFR-5 · `design.md` §5.1, §5.2, §5.3, §5.7 · DD-2, DD-3, DD-4 · JD-2, JD-8, JD-10, JD-11
      **Skills:** `frontend-design`, `tailwind-design-system`, `vercel-react-best-practices`, then `react-doctor` before reporting completion.
      **Files:** `frontend/components/ui/SearchableSelect.tsx`, `frontend/components/ui/SearchableSelect.test.tsx`, `frontend/package.json` (devDep only)
      **Prerequisite:** add `@testing-library/user-event` to **`devDependencies`** (OQ-2). `dependencies` must stay byte-identical (NFR-3).
      **Scope:** The controlled primitive per `design.md` §5.1's prop table. **Popup markup and behavior, but rendered inline for now** — the portal and reflow positioning are T-3's, so this task's popup may be plainly positioned and T-3 replaces that. Everything else is final here.
      **Clause-level scope — each of these is an owned requirement clause, not a summary:**
        · **FR-3 / DD-2** — `searchText` and the committed `value` are separate states; `onChange` has exactly **two** call sites, both passing an option's `value`. Typed text is never emitted, on any path **including paste and autofill** (FR-3's `BUT`)
        · **FR-2** — `ArrowUp`/`ArrowDown`/`Home`/`End`/`Enter`/`Escape` per §5.3; `aria-activedescendant`, `aria-expanded`, `role="combobox"`, `aria-controls`; DOM focus **never leaves the input** (DD-4); **`Tab` is not intercepted** (FR-2's `BUT`)
        · **FR-2** — closing reverts the display to the committed label; no uncommitted fragment survives (FR-2's `AND IT MUST NOT`)
        · **JD-8** — popup `mousedown`/`pointerdown` calls `preventDefault()` so a pointer commit survives the blur that would otherwise precede it
        · **JD-2** — `invalid` sets **`aria-invalid="true"`** on the input **and** the `border-danger` class. It renders **no message** (DD-3)
        · **FR-1 no-match** — visible `noMatchLabel`; the committed value is unchanged; the popup does **not** close and the typed text is **not** discarded
        · **FR-6 / JD-10** — a separate, visually-hidden `aria-live="polite"` region emitting exactly `No regions match` / `1 region available` / `<n> regions available`, written **only on count change**
        · **JD-11** — the `Home`/`End` deviation from the APG editable-combobox pattern is recorded in the component's doc comment. An undocumented divergence from a named pattern is the KZ-008 shape
        · **NFR-2** — tokens only; **NFR-4** — no debounce, no `setTimeout` in the filter path
      **Verify:** `cd frontend && npm test -- --silent --testPathPatterns SearchableSelect` · `cd frontend && npx eslint "components/ui/SearchableSelect.tsx" --quiet` · `cd frontend && git diff --stat package.json` (must show devDependencies only) · `grep -nE "#[0-9a-fA-F]{3,6}|rgb\(|bg-\[" components/ui/SearchableSelect.tsx` (must return nothing)
      **Done when:** every clause above has a named test; `jest-axe` runs over **6** states (closed, open, filtered, no-match, invalid, disabled) with zero **violations**; the doc comment records the `Home`/`End` deviation AND states that the axe runs say nothing about contrast.
      **Evidence is DISQUALIFIED if:**
        · the `jest-axe` result is reported as proof of accessibility without stating that `color-contrast` returned `incomplete` and was not evaluated — a green axe run here is evidence about **structure only** (D5)
        · the `motion-reduce:` assertion is described as proving reduced motion works; it proves the class is present (KZ-002)
        · FR-3 is tested only via the blur path. Paste and `Escape` are separate clauses and need their own assertions
        · any keyboard test uses `fireEvent.keyDown` instead of `user-event` — the devDependency exists precisely so the real event sequence is replayed

- [x] **T-3  Portal + reflow positioning**  (deps: T-2)
      **Size:** M · ~140 LOC (component delta ~100, tests ~40)
      **Traces:** `design.md` §5.5, DD-5 **including its Judgment Day amendment** · JD-1, JD-6 · risk row "popup lag during momentum scroll"
      **Skills:** `vercel-react-best-practices`, then `react-doctor`.
      **Files:** `frontend/components/ui/SearchableSelect.tsx`, `frontend/components/ui/SearchableSelect.test.tsx`
      **Scope:** Replace T-2's inline popup with a `createPortal` into `document.body`, `position: fixed`, anchored to the input's rect. Vertical flip when space below is insufficient; width matched to the anchor.
      **The reflow rule is the whole point of this task** (§5.5's table) — implement it exactly:
        · capture-phase `scroll` on `document` → **reposition**, but **ignore the event when `popupRef.current.contains(event.target)`**. This exclusion is what stops the popup's own list scroll from moving or closing it (JD-1)
        · `resize` on `window`, and `resize`/`scroll` on `visualViewport` → **reposition**. This is the mobile-virtual-keyboard path (JD-6)
        · anchor entirely out of the viewport → **close**. The only remaining close case
        · all recomputation `requestAnimationFrame`-throttled; listeners attached only while open
        · **`scrollIntoView` is forbidden** — adjust the list's own `scrollTop` directly, or it may scroll ancestors and re-enter the handler
      **Verify:** `cd frontend && npm test -- --silent --testPathPatterns SearchableSelect` · `cd frontend && npm run build` (static export must still succeed — a portal is client-only)
      **Done when:** the popup renders under `document.body`; a dispatched scroll whose target is inside the popup provably does **not** trigger a reposition; `scrollIntoView` appears nowhere in the file.
      **Evidence is DISQUALIFIED if:** any test claims the popup is *correctly positioned*. **jsdom returns zeros from `getBoundingClientRect`** — placement is structurally unverifiable here (D6). This task can prove the **listener wiring and the exclusion logic**; it cannot prove geometry, and reporting otherwise is a false pass. Geometry belongs to T-6.

- [ ] **T-4  Adopt in the public registration form**  (deps: T-3)
      **Size:** S · ~80 LOC (component ~20, test updates ~60)
      **Traces:** FR-4 (all clauses) · `design.md` §5.6 · JD-2
      **Skills:** `tailwind-design-system`, then `react-doctor`.
      **Files:** `frontend/components/register/RegistrationForm.tsx`, `frontend/components/register/RegistrationForm.test.tsx`, `frontend/app/(public)/register/register-a11y.test.tsx`
      **Scope:** Swap `renderSelect('region', …)` for the new control inside the existing `Field` wrapper. **Update this file's own suites in the same task** — never deferred (`design.md` §9 row 5: the existing tests select via `selectOptions` and will break, and during the rewrite they stop guarding what they guarded).
      **Clause-level preservation — FR-4's `AND IT MUST` list, each owned here:**
        · `aria-invalid` present when errored, absent when clean (JD-2)
        · `aria-describedby` → `#<id>-error`
        · the required asterisk on the label
        · `disabled` while `submitting`
        · the error-summary anchor `#<baseId>-region` resolving to a **focusable** element — the same dead-anchor defect already fixed for the crops group and the consent block
        · `Select a region.` appearing inline **and** in the summary, from the one `errors` record — FR-4's `BUT it must NOT` change the payload shape, field name, or `RegistrationPayloadInput`
      **Verify:** `cd frontend && npm test -- --silent --testPathPatterns "RegistrationForm|register-a11y"` · `cd frontend && npx next lint --file components/register/RegistrationForm.tsx`
      **Done when:** every clause above has a named assertion; the emitted payload is byte-identical to before the swap for the same inputs.
      **Evidence is DISQUALIFIED if:** the rewritten suite has **fewer** assertions than the one it replaced, or drops a case the old suite covered. The Reviewer diffs deletions specifically (`design.md` §10 risk row 3) — a suite that got shorter while the feature got more complex is a weakened gate, not a passing one.

- [x] **T-5  Adopt in the two public filter surfaces**  (deps: T-3)
      **Size:** M · ~110 LOC (components ~50, test updates ~60)
      **Traces:** FR-5 (both scenarios) · `design.md` §5.6 · OQ-1 · JD-4
      **Skills:** `tailwind-design-system`, then `react-doctor`.
      **Files:** `frontend/components/directory/DirectoryFilters.tsx`, `frontend/components/map/FilterControls.tsx`, and their suites
      **Scope:** Both region selects → the new control with `clearOptionLabel="All regions"`. Suites updated in the same task, same rule as T-4.
      **Clause-level scope:**
        · clearing emits `region: undefined`, **never `''`** (FR-5's `BUT it must NOT` send an empty parameter), and resets `page: 1`
        · URL-synced filter state and the `hasActiveFilters` "clear filters" affordance keep working
        · `FilterControls` lists exactly the dynamic `regions` subset when non-empty, and **falls back to all 31** when undefined/empty (FR-5's `AND IT MUST`)
        · `role="group"` around `FilterControls` preserved
        · **OQ-1 fixed at BOTH sites** — remove the redundant `aria-label="Filter by region"` that overrides the visible label, at `DirectoryFilters.tsx:141-149` **and** `FilterControls.tsx:150`. JD-4 exists because the design first credited this at one site only
      **Verify:** `cd frontend && npm test -- --silent --testPathPatterns "DirectoryFilters|FilterControls|DirectoryView|DiscoverRail|directory-a11y|map-a11y"` · `cd frontend && npx next lint --file components/directory/DirectoryFilters.tsx --file components/map/FilterControls.tsx` · `cd frontend && npm run build`
      **Done when:** both sites converted, both suites updated, the accessible name of each region control is its visible label, and no `region=` empty parameter can be produced.
      **Evidence is DISQUALIFIED if:** the `undefined`-not-`''` clause is asserted by inspecting component state rather than the value handed to `onChange`. The defect FR-5 guards against is what reaches the API, so the assertion must be on the emitted query object.

- [ ] **T-6  Manual browser pass — the gate for D5, D6, D7**  (deps: T-4, T-5)
      **Size:** S · no production LOC; output is evidence
      **Traces:** `requirements.md` §4.1 defect classes **D5, D6, D7** · `design.md` §10 (all rows), §12 final row · the momentum-scroll risk row
      **Skills:** none. `playwright-cli` is **not** vendored in this repo (root `CLAUDE.md`), so this is a human pass and must remain completable without it.
      **Files:** `execution.md` (evidence only — no source changes)
      **Scope:** Run the three converted controls in a real browser at **two viewports each** — one desktop, one mobile (or a real phone). Six checks minimum.
      **What to look at, mapped to the class no test can see:**
        · **D6** — does the popup escape `#discover-rail-body`'s `overflow-y-auto` on `/map` without being clipped? Does it flip up near the viewport bottom? Does the **mobile virtual keyboard** leave it usable rather than closing or covering it (JD-6's path — the mechanism was designed for this and has never been observed working)?
        · **D6 — two defects T-3's review found and fixed *blind*, whose real-world effect only this pass can confirm.** Both were located by a Reviewer reading code, both are invisible to jsdom by construction, and the fixes are therefore unverified in a browser. Check each deliberately rather than assuming the fix worked:
          — **flip-above placement with the keyboard open.** T-3 shipped a flip-above branch that wrote its `bottom` offset in the *visual*-viewport frame while CSS resolves it in the *layout* frame — error zero on desktop, **equal to the keyboard height on mobile**, which put the popup roughly a keyboard's height below the anchor it should sit above. Fixed to `document.documentElement.clientHeight - rect.top + gap`. **Open the popup near the bottom of a mobile viewport with the keyboard up and confirm it sits immediately above the input**, not adrift. Note the flip *decision* and the out-of-viewport test deliberately still use the visual viewport — that asymmetry is correct and documented at the write site; do not report it as a defect.
          — **stacking order at every adoption site.** T-3 carried `z-10` across the port into `document.body`'s root stacking context, where two of the three adoption sites sit under a `sticky top-0 z-40` header and `/map` carries Leaflet's `z-[1000]` legend. Raised to `z-50`, this repo's floating-overlay convention. **A class assertion cannot prove paint order (KZ-002)** — confirm visually at all three sites that the open popup paints *above* the header, and on `/map` above or acceptably against the legend. If the popup loses to `MapLegend`'s `z-[1000]`, that is a separate, then-evidenced change and must be escalated, not fixed in place during this pass.
        · **D5** — is the active/hover option's `bg-primary-soft` behind `text-fg` actually legible? **Measure it** with browser devtools or a contrast checker; do not inherit `design.md` §5.7's reasoning, which JD-16 showed misquotes its own source
        · **D7** — tab into and out of each control: is the focus ring visible, and is the order sane through the composed page?
        · **Momentum scroll** — scroll the map rail hard on a low-end-profile mobile with the popup open; does it lag or judder?
        · **Touch targets** — options ≥44px tall on mobile (`design.md` §9 row 1's mitigation. **JD-13 resolved 2026-08-06:** the miscitation of WCAG 2.5.8 was corrected at source; 44px is a platform-HIG target — iOS HIG 44pt, Material 48dp — and **not** a WCAG 2.1 AA requirement. Do not re-cite a WCAG SC for it)
      **Verify:** manual. Record in `execution.md`: **each of the 6 site×viewport combinations by name**, the measured contrast ratio, and a pass/fail per defect class.
      **Done when:** all six combinations are recorded with an explicit verdict. A failure here is a **normal outcome** and blocks the spec until fixed — it is not a formality.
      **Evidence is DISQUALIFIED if:** the report says "looks fine" without naming the six combinations, or reports contrast without a measured ratio. **"I could not check mobile" is a legitimate, reportable outcome and must be escalated — it must NOT be recorded as a pass.** This task exists because the automated suite is blind here; a hand-waved T-6 removes the only gate these three classes have.

---

## Dependency Graph

```
T-1 → T-2 → T-3 → T-4 ┐
                  ↓    ├→ T-6
                  T-5 ─┘
```

No cycles. T-4 and T-5 are independent of each other and may run in parallel once T-3 is `[x]`.

---

## Coverage Closure (KZ-001)

Closure is at **scenario and clause** granularity, not requirement ID. A gap may never be discharged by citing a different requirement that happens to be satisfied.

| Requirement | Scenario / clause | Owner |
|---|---|---|
| FR-1 | "Narrowing by substring" — substring **not** prefix; case; diacritics; trim | **T-1** |
| FR-1 | ↳ `BUT it must NOT` perform any network request | **T-2** |
| FR-1 | "No match" — visible message | **T-2** |
| FR-1 | ↳ `AND IT MUST` leave the committed value unchanged | **T-2** |
| FR-1 | ↳ `BUT it must NOT` close the popup or discard typed text | **T-2** |
| FR-2 | "Keyboard traversal" — Arrow/Home/End/Enter/Escape | **T-2** |
| FR-2 | ↳ `AND IT MUST` `aria-activedescendant` + `aria-expanded` + `role` + `aria-controls`, focus stays on input | **T-2** |
| FR-2 | ↳ `BUT it must NOT` trap `Tab` | **T-2** |
| FR-2 | "Abandoning a partial search" — revert on blur/Tab/Escape | **T-2** |
| FR-2 | ↳ `AND IT MUST NOT` leave an uncommitted fragment displayed | **T-2** |
| FR-2 | pointer-commit path (JD-8) | **T-2** |
| FR-3 | "Typed text is never a value" — emitted value is committed or empty | **T-2** |
| FR-3 | ↳ `BUT it must NOT` accept free text on any path, **incl. paste and autofill** | **T-2** |
| FR-3 | ↳ `AND IT MUST` keep search text and value as separate state | **T-2** |
| FR-4 | "Required-field validation preserved" — inline + summary error | **T-4** |
| FR-4 | ↳ `AND IT MUST` keep the summary anchor resolving to a focusable element | **T-4** |
| FR-4 | ↳ `AND IT MUST` preserve `aria-invalid`, `aria-describedby`, asterisk, `disabled` | **T-2** (component sets it) + **T-4** (asserts it) |
| FR-4 | ↳ `BUT it must NOT` change payload shape, field name, or `RegistrationPayloadInput` | **T-4** |
| FR-5 | "Clearing the filter" — `undefined` not `''`, `page: 1` | **T-5** |
| FR-5 | ↳ `AND IT MUST` keep URL-synced state + clear-filters affordance | **T-5** |
| FR-5 | ↳ `BUT it must NOT` send an empty `region=` parameter | **T-5** |
| FR-5 | "Dynamic option subset" — exact subset | **T-5** |
| FR-5 | ↳ `AND IT MUST` fall back to all 31 when undefined/empty | **T-5** |
| FR-6 | "Result count is announced" — count on change | **T-2** |
| FR-6 | ↳ `AND IT MUST` be `polite`, never `assertive` | **T-2** |
| FR-6 | ↳ `BUT it must NOT` announce when the count is unchanged | **T-2** |
| FR-6 | ↳ explicit no-match announcement (JD-10, `design.md` §5.3) | **T-2** |
| NFR-1 | axe over 6 states, zero violations | **T-2** |
| NFR-1 | ↳ contrast (**D5** — no automated gate) | **T-6** |
| NFR-2 | token-only, grep-verified | **T-2**, **T-4**, **T-5** |
| NFR-3 | `dependencies` unchanged; static export builds | **T-2** (deps), **T-3** (build) |
| NFR-4 | no debounce in the filter path | **T-2** |
| NFR-5 | `motion-reduce:` present (presence only) | **T-2** |
| NFR-5 | ↳ transition actually suppressed (no automated gate) | **T-6** |
| DD-5 | reflow rule, popup-origin exclusion, no `scrollIntoView` (JD-1, JD-6) | **T-3** |
| DD-5 | ↳ geometry actually correct (**D6** — no automated gate) | **T-6** |
| — | real focus order + ring visibility (**D7** — no automated gate) | **T-6** |
| OQ-1 | redundant `aria-label` removed at both adopted sites (JD-4) | **T-5** |
| OQ-2 | `@testing-library/user-event` added as a devDependency | **T-2** |
| OQ-3 | no clear-`×` affordance — resolved as "no" | *(no task: the resolution is the absence of a prop)* |
| JD-11 | `Home`/`End` APG deviation documented in the component | **T-2** |

**Unowned clauses: none.** Every scenario and every `BUT` / `AND IT MUST` above has a named task.

**D8 (a real screen reader actually announcing) is an accepted risk with no owner** — recorded in `requirements.md` §4.1 and §6, deliberately, not overlooked. T-2's live-region test proves the region updates, **not** that any AT speaks it, and must say so.

---

## Execution Conventions

- Commits: `[SPEC:enhancement/searchable-region-select] <message>`
- Evidence before checkbox: append the `execution.md` entry with the Reviewer's PASS **first**, then flip `tasks.md` to `[x]`, then commit.
- No task introduces a PII field; `region` is not PII. No AWS command, no `--profile IBD-DEV` usage, no backend file in scope.
- Reviewer model must differ from the Implementer's (root `CLAUDE.md` Model Routing). T-2 and T-3 are the correctness-critical pair; T-1/T-4/T-5 are standard scope.
