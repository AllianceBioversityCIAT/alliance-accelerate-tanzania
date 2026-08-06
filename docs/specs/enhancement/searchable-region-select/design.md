# Design — Searchable Region Select

- Spec path: `docs/specs/enhancement/searchable-region-select/`
- Status: Approved
- Traces requirements: FR-1…FR-6, NFR-1…NFR-5 from this spec's `requirements.md`
- Depth: **Standard** — re-checked against the finished design in §11 (Budget)

---

## 1. Approach Overview

One new client-side primitive, `components/ui/SearchableSelect.tsx`, built by hand against the **WAI-ARIA 1.2 combobox-with-listbox-popup** pattern. It is adopted at 3 of the 4 public-facing region controls (FR-4, FR-5) — the 4th, `DashboardFilters`, is deferred for size, not because it is admin-facing (JD-9; see requirements §6). No backend, no API, no data-model change — this spec never leaves `frontend/`.

The primitive is **presentational and fully controlled**. It owns exactly two pieces of internal state that callers must not see (the search text and the open/active state) and delegates everything else — label, error message, layout, validation — to the caller, which already has those conventions (`Field` in `RegistrationForm.tsx`, `LABEL_CLASS`/`SELECT_CLASS` in the two filter components). This seam is what makes FR-4's "one error source" contract survive the swap: `RegistrationForm`'s single `errors` record keeps owning the error **message**, while the control owns the error **state flag** — it sets `aria-invalid` and the danger border, and renders no text.

Two structural facts from the codebase drive the rest of this document:

| Fact | Consequence |
|---|---|
| No headless UI dependency exists (`react`, `react-dom`, `next`, `gsap`, `@gsap/react`, `leaflet`, `recharts`, `aws-amplify`) and `components/ui/` holds only `Button`, `Skeleton`, `StatCard` | Everything is hand-built — DD-1 |
| `FilterControls` renders inside `#discover-rail-body`, which is `flex-1 overflow-y-auto p-4` (`components/map/DiscoverRail.tsx:208`) | An `absolute`-positioned popup is **clipped** at one of the three adoption sites — DD-5 |

---

## 2. Data Model Changes

**None.** No Prisma model, no migration, no seed, no backfill, no PII-allowlist change. `region` stays a non-PII `String` validated server-side against `CANONICAL_REGIONS`.

---

## 3. API Surface & Contracts

**No endpoint changes.** The only contract touched is the pre-existing `?region=` query parameter on the public read paths, and it is touched only in the sense that FR-3 exists to guarantee the frontend can never violate it. The backend's exact-string validation stays the authoritative gate.

---

## 4. Backend Design

**Not applicable.** No `backend/` file is touched by this spec.

---

## 5. Frontend Design

### 5.1 Component contract

`SearchableSelect` takes a controlled `value`, an `options` list, and callbacks. Its public surface, stated as a contract rather than code:

| Prop | Purpose | Notes |
|---|---|---|
| `id` | The element id the caller's `<label htmlFor>` and error-summary anchor target | The caller owns the label; the control must be a valid anchor target (FR-4) |
| `value` | The committed canonical region string, or `''` | Controlled — the component never holds it |
| `onChange(value)` | Fired **only** on a commit, never on typing | The FR-3 boundary |
| `options` | `{ value, label }[]` — the caller passes `REGIONS` or the dynamic subset | Satisfies FR-5's subset scenario without the control knowing about regions |
| `clearOptionLabel?` | When set, renders a first option that commits `''` | `"All regions"` for the two filters; **omitted** for the required registration field |
| `placeholder?` | Closed-state text when `value` is `''` | `"Select…"` / `"All regions"` |
| `disabled?`, `invalid?` | State flags | `invalid` MUST set **`aria-invalid="true"`** on the combobox input **and** drive the `border-danger` styling. It MUST NOT render a message — the caller owns that. *(Corrected by JD-2: the first draft said "border styling only", which would have silently dropped the `aria-invalid` that `RegistrationForm.tsx:541` sets today and FR-4 requires preserved.)* |
| `describedBy?`, `labelledBy?` | ARIA wiring the caller composes | Caller already builds these ids |
| `noMatchLabel?` | Copy for the empty-filter state | Default `"No regions match"` |

**What the component deliberately does NOT own:** the visible `<label>`, the error message text, the required asterisk, the field wrapper, and any knowledge of regions, filters, or forms. It is a generic select; "region" appears nowhere inside it.

### 5.2 State model — the FR-3 mechanism

Three internal states, and the separation between the first two is the entire correctness argument for FR-3:

| State | Owner | Meaning |
|---|---|---|
| `value` (prop) | **Caller** | The committed, canonical value. The only thing that ever reaches `onChange` |
| `searchText` | Component | What the user has typed. **Never emitted.** Reset to `''` on every open and every commit |
| `isOpen` + `activeIndex` | Component | Popup visibility and the `aria-activedescendant` target |

The input's displayed text is derived, not stored: when open it shows `searchText`; when closed it shows the label of `value`, or the placeholder. This makes FR-2's "abandoning a partial search" scenario fall out of the model rather than needing a special-case handler — closing *is* reverting, because the closed display never reads `searchText`.

`onChange` is called from exactly two places: committing an option (pointer or `Enter`), and committing the clear option. There is no third path, which is what makes "the emitted value is always canonical" auditable by reading two call sites instead of reasoning about every interaction.

**Pointer commits must survive the blur that precedes them** (JD-8). Because DD-4 keeps DOM focus on the input permanently, a `mousedown` on an option fires `blur` on the input *before* `click` — and FR-2 requires blur to close-and-revert, which would destroy the popup before the click could commit. Tap is the primary commit gesture on the mobile surface this spec exists to serve, so this is not an edge case. **The popup's `mousedown`/`pointerdown` handler MUST call `preventDefault()`**, so the input never blurs and the commit lands on `click`. Reverting on blur then applies only to genuine focus departures — `Tab`, `Escape`, and clicks outside the control.

### 5.3 Keyboard and ARIA contract (FR-2, FR-6)

Structure: a text `<input role="combobox">` with `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, and `aria-activedescendant`; an associated `<ul role="listbox">` of `<li role="option">` with `aria-selected`. **The listbox is not a DOM sibling** — DD-5 portals it to `document.body`, so `aria-controls` is what binds the two. *(JD-7 said "sibling", which the portal decision falsified; corrected here during Phase 3 because `tasks.md` T-3 implements the portal and an implementer reading this section literally would contradict it.)* **DOM focus never leaves the input** — the active option is communicated only through `aria-activedescendant` (DD-4).

| Key | Behavior |
|---|---|
| `ArrowDown` | Closed → open with first option active. Open → next option (stops at last, no wrap) |
| `ArrowUp` | Open → previous option (stops at first, no wrap) |
| `Home` / `End` | First / last option |
| `Enter` | Commit active option, close, return focus display to the committed label. Must **not** submit the form |
| `Escape` | Close without committing; second `Escape` is not intercepted |
| `Tab` | Close without committing, then let the event proceed — never intercepted (FR-2's explicit `BUT`) |
| printable chars | Filter; reset `activeIndex` to the first match |

A visually-hidden `aria-live="polite"` region reports the filtered count (FR-6). It is written only when the count **changes**, satisfying FR-6's `BUT it must NOT announce on every keystroke`.

**Exact announcement strings** *(closes JD-10 — FR-6 requires the no-match case be reported "explicitly", and the first draft left the zero-count wording to the implementer's guess)*:

| Filtered count | Live-region text |
|---|---|
| 0 | `No regions match` — the same words as the visible `noMatchLabel`, so the sighted and non-sighted experiences say the same thing. **Not** `0 regions available`, which states a quantity where the requirement asks for an explicit condition |
| 1 | `1 region available` |
| n > 1 | `<n> regions available` |

The visible `noMatchLabel` element is **not** the live region — it is static content inside the popup. The live region is separate and visually hidden.

**No wrap-around on arrow keys** is deliberate: ARIA 1.2 permits either, and non-wrapping matches the native `<select>` behavior being replaced, so a returning user's muscle memory is not inverted.

#### Documented deviation from the APG pattern — `Home` / `End` (closes JD-11)

The WAI-ARIA APG's **editable** combobox pattern reserves `Home` and `End` for **caret movement inside the text input**. FR-2 assigns them to first/last option, so this control deviates: a user editing a long typed filter string cannot use `Home`/`End` to move the cursor.

**The deviation stands** — FR-2 is approved, the strings being typed here are at most a few characters, and jumping to the ends of a 31-item list is the more valuable binding for this control's actual use.

**What changes is the claim built on top of it.** §9 row 6 and §10 previously offered *"strict ARIA 1.2 conformance"* as D8's principal mitigation. That was overstated, and D8's acceptance rested on it. The accurate statement is: **ARIA 1.2 pattern conformance with one documented deviation (`Home`/`End`)**. The deviation must be recorded in the component's own doc comment, because an undocumented divergence from a named pattern is the KZ-008 shape — a comment asserting a property the code lacks.

### 5.4 Matching (FR-1)

A pure exported helper performs case-insensitive, diacritic-folded **substring** matching (`normalize('NFD')` + combining-mark strip + `toLowerCase` + `trim`). It is pure and separately unit-testable, which is what lets FR-1's substring-not-prefix requirement be proven directly rather than through the component.

At n=31 the filter is a single synchronous `Array.filter` per keystroke. **No debounce** — NFR-4 states that adding one is a defect, because it would introduce a stale-render window for a computation that costs nothing.

### 5.5 Popup placement — the clipping problem

The popup renders through a **React portal into `document.body`** with `position: fixed`, anchored to the input's `getBoundingClientRect()`. See DD-5 for why the simpler options fail.

- **Vertical flip:** if the space below the input is smaller than the popup's max height, render above.
- **Width:** matched to the anchor's width.
- **Max height:** capped, with internal `overflow-y-auto`.
- **Reflow handling — reposition, never close** (amended by Judgment Day JD-1/JD-6; see DD-5's amendment note):

  | Event | Response |
  |---|---|
  | `scroll`, capture phase on `document` | Recompute position. **Ignore the event when `popupRef.current.contains(event.target)`** — the popup's own internal list scroll must never move or close it |
  | `resize` on `window`, and `resize`/`scroll` on `visualViewport` | Recompute position. `visualViewport` is what the **mobile virtual keyboard** moves; this is the JD-6 path |
  | Anchor scrolled entirely out of the viewport | Close — the only close-on-reflow case that remains |

  All recomputation is `requestAnimationFrame`-throttled: one `getBoundingClientRect` and two style writes per frame at most.

- **Active-option scrolling:** the list's own `scrollTop` is adjusted directly. **`scrollIntoView` is forbidden** — it may scroll ancestor containers, which would both fight the anchor and re-enter the scroll handler.

### 5.6 Adoption sites

| Site | Change | Preserved behavior it must not break |
|---|---|---|
| `components/register/RegistrationForm.tsx` | `renderSelect('region', …)` → the new control, inside the existing `Field` wrapper | Required asterisk; `Select a region.` inline + summary error from the one `errors` record; the `#<baseId>-region` summary anchor resolving to a focusable element; `disabled` while `submitting`; unchanged `RegistrationPayloadInput` |
| `components/directory/DirectoryFilters.tsx` | Region `<select>` → the new control with `clearOptionLabel="All regions"` | `region: undefined` (never `''`) on clear; URL-synced filter state; the "clear filters" button's `hasActiveFilters` logic. Also fixes OQ-1 (removes the redundant `aria-label` that overrides the visible label) |
| `components/map/FilterControls.tsx` | Same, plus the dynamic `regionOptions` subset. **Also fixes OQ-1 here** — the identical redundant `aria-label="Filter by region"` sits at `FilterControls.tsx:150` (JD-4: the first draft credited the fix only at `DirectoryFilters`, so an implementer reading this table literally would have fixed one site and left the other) | `page: 1` reset; fallback to all 31 when `regions` is empty/undefined; the surrounding `role="group"` |

`components/dashboard/DashboardFilters.tsx` and the 2 admin sites keep their native `<select>` (requirements §6).

**The distinct-shells argument covers only the 2 admin sites** (`docs/ux-ui/design.md` DD-5). It **cannot** cover `DashboardFilters`, which renders through `app/(public)/dashboard/page.tsx` — the public shell, anonymous-reachable, no `RequireRole` anywhere in that tree. JD-9 caught the first draft repeating a false classification from requirements §6 rather than flagging it. `DashboardFilters` is deferred purely for spec size, its cost is a public user left with the 31-item scroll and a surviving redundant `aria-label` at `DashboardFilters.tsx:147`, and its follow-up ranks **above** the 2 admin sites'.

### 5.7 Tokens (NFR-2)

No new token is introduced. The control composes existing ones from `docs/ux-ui/design.md` §7:

| Element | Tokens |
|---|---|
| Input (closed/open) | Reuses `RegistrationForm`'s `inputClasses` vocabulary — `bg-surface`, `border-border`, `text-fg`, `placeholder:text-muted`, `focus-visible:ring-primary`; `border-danger` when `invalid` |
| Popup surface | `bg-surface`, `border-border`, `rounded-md`, `shadow-md` |
| Active / hovered option | `bg-primary-soft` with `text-fg` — chosen because `--color-primary-soft` (`#E8EEF6`) is a tint of the brand blue that keeps body text on it well above AA, whereas `--color-highlight` (teal, ~2.0:1 on white) is explicitly disallowed for text backgrounds by §7's contrast note |
| Selected option check | `text-primary` |
| No-match message | `text-muted`, `text-sm` |
| Open/close transition | `--dur-fast` / `--ease-out`, gated behind `motion-reduce:` (NFR-5) |

**The contrast claim above is reasoned from the token documentation, not measured.** It is exactly defect class **D5**, which no automated gate in this repo can evaluate — it must be confirmed in the manual browser pass (T-6).

---

## 6. Security & RBAC

No change. `region` is not PII, the control performs no network call, and it introduces no logging or analytics. It is used on `Public`-reachable pages and inside the PII-collecting registration form — the design constraint there is purely negative: **add no new outbound call from that form**.

---

## 7. Infrastructure / Deployment

None. No IaC, no AWS resource, no `--profile IBD-DEV` command. Ships with the ordinary frontend deploy.

**One dependency change, dev-only:** `@testing-library/user-event` is added to `devDependencies` (OQ-2). Runtime `dependencies` stay byte-identical, satisfying NFR-3.

---

## 8. Decision Records

### DD-1: Hand-build the combobox rather than adding a headless UI dependency

- **Context:** The repo has no Radix / Headless UI / shadcn. `RegistrationForm.tsx`'s own header records the precedent: "no react-hook-form, no zod, no shadcn (none are in this project's `package.json`)". `docs/ux-ui/design.md` §8 says "Prefer shadcn/ui primitives" — an aspiration the codebase has consistently not followed.
- **Options:** (a) add Radix `Popover`+`Command`; (b) add shadcn's `Combobox`, which pulls in Radix plus `cmdk`; (c) hand-build.
- **Decision:** (c).
- **Consequences:** ~330 lines of interaction code this repo now owns and must keep ARIA-correct (reconciled with §11's budget after the DD-5 amendment — an earlier draft said ~200 here and ~260 there, judged as an unreconciled KZ-005 figure), versus a new runtime dependency tree on a static-export public site whose audience is on constrained mobile connections in Tanzania. The hand-built path also keeps a single, greppable implementation for the Reviewer. **Cost accepted honestly:** a library gets years of AT bug reports we will not get, which is precisely why D8 is recorded as an accepted risk rather than waved away.
- **Note vs. §8 of the UX blueprint:** this does **not** supersede the "prefer shadcn" guidance as a general rule; it records that for this one primitive the dependency cost outweighs it. If the project later adopts shadcn wholesale, this component is the natural first thing to replace.

### DD-2: Search text and committed value are separate states

- **Context:** FR-3 — a combobox is a text input, and the backend 400s on any non-canonical `region`.
- **Options:** (a) one state, with the input text *being* the value and validated on blur; (b) two states, where typed text is structurally incapable of becoming a value.
- **Decision:** (b).
- **Consequences:** (a) puts correctness in a validator that must be right on every exit path (blur, `Tab`, `Escape`, submit, paste, autofill). (b) puts it in the type of the state: `onChange` has two call sites and both pass an option's `value`. The property becomes auditable by reading, not by enumerating paths.

### DD-3: The caller owns the label and the error message

- **Context:** `RegistrationForm` has a disqualifying contract — one `errors` record read by both the summary and every inline message, with no second copy.
- **Options:** (a) the control renders its own label + error slot; (b) the control renders neither.
- **Decision:** (b) — the control receives `invalid` (a boolean that drives **both `aria-invalid` and the danger border**, never a message) plus `describedBy`/`labelledBy`.
- **Consequences:** A control that rendered its own error message would be a second error source, breaking the exact property `RegistrationForm.tsx` documents at length. This also keeps the two filter components' existing `LABEL_CLASS` markup untouched.

### DD-4: `aria-activedescendant`, not roving tabindex

- **Context:** Two conforming ARIA patterns exist for a combobox's active option.
- **Decision:** Keep DOM focus on the input permanently; express the active option via `aria-activedescendant`.
- **Consequences:** The user keeps typing while navigating with arrows — mandatory for a filter-as-you-type control. Roving tabindex would move focus into the list and break typing. Cost: `aria-activedescendant` has weaker support in a few older AT combinations than real focus, which lands again on D8.

### DD-5: Portal the popup to `document.body` with fixed positioning

- **Context:** `FilterControls` renders inside `#discover-rail-body` — `flex-1 overflow-y-auto p-4` (`DiscoverRail.tsx:208`). This was **verified in the codebase, not assumed**.
- **Options:**
  - **(a) `position: absolute` in normal flow.** Simplest, no math, testable. **Fails:** clipped by the rail's `overflow-y-auto`; the popup would scroll the rail instead of overlaying it. Fails at 1 of 3 adoption sites.
  - **(b) Inline expansion — the list pushes content down instead of overlaying.** Zero positioning code, unclippable, and arguably *better* on mobile (no virtual-keyboard collision). **Rejected because:** in the registration form's `lg:grid-cols-2` Location grid it shoves the adjacent GPS fields down on every open — a large layout shift on the exact screen this spec exists to improve.
  - **(c) Portal + `position: fixed`, anchored to the input's rect.** Correct at all three sites, one code path.
- **Decision:** (c), with **reposition-on-reflow** (see the amendment below).
- **Consequences:** More code than (a) and a hard dependency on `getBoundingClientRect`, **which returns zeros in jsdom** — so the placement logic is structurally unverifiable by the automated suite. This does not create defect class D6; it *sharpens* it, and is the single strongest reason the manual browser pass (T-6) is a gate and not a courtesy.

#### Amendment — Judgment Day round 1 (JD-1 confirmed by both judges; JD-6 raised by one, accepted by the user)

The original decision was **close-on-scroll**, chosen to "avoid a scroll-tracking loop that could desynchronize." Dual review established that this was wrong in two independent ways, and both live in the space *between* correct constraints (KZ-007) where no test looks:

1. **JD-1 —** element `scroll` events do not bubble, so catching the rail's scroll requires a capture-phase `document` listener, which **also fires for the popup's own internal list scroll**, including the programmatic scroll-into-view §5.3 mandates on every arrow press. The rule would close the popup exactly when a 31-option list is being navigated past its own fold.
2. **JD-6 —** on Android, focusing a text input opens the virtual keyboard, which fires a `resize` and usually a reveal-`scroll`. Close-on-reflow means **the popup closes as it opens**, on the primary user's device.

**The premature optimization created both defects.** A rAF-throttled reposition is one rect read and two style writes per frame — cheaper than the two failure modes it was avoiding. The rule is reversed to reposition-on-reflow, with popup-origin scroll events excluded by `contains(event.target)` and `scrollIntoView` forbidden outright (§5.5).

**Cost accepted:** the scroll-tracking loop DD-5 originally rejected now exists. It is bounded (rAF, no layout thrash, listeners attached only while open) and it is the price of a control that does not close itself on a phone.

### DD-6: Custom control at every breakpoint (no native fallback)

- **Context:** Confirmed with the user during specification. See §9's reversion challenge for the full cost analysis.
- **Decision:** One implementation at all viewport widths.
- **Consequences:** One behavior to test, review, and support. The mobile OS picker is given up — see §9.

---

## 9. Reversion Challenge (methodology Step 2.3)

**This design removes already-delivered behavior:** the native `<select>` at three sites, covered by existing passing tests. The challenge — *"what does removing this break?"* — was run against the codebase, and it changed the design.

| # | What the native `<select>` gives today | Real cost of removing it | Resolution |
|---|---|---|---|
| 1 | **OS-native mobile picker** (full-screen wheel/list, large hit targets, no keyboard collision) | **Genuine loss.** The custom popup must not be worse on the primary user's phone | Options get ≥44px touch targets (WCAG 2.5.8); popup max-height + internal scroll; **the mobile leg of T-6's manual pass is mandatory, not optional** |
| 2 | Native form submission semantics (`name`, native validation) | **None.** `RegistrationForm` is fully controlled and already sets `noValidate` (`RegistrationForm.tsx:590`); the two filters are controlled and submit nothing | No action |
| 3 | Browser autofill of an address-level field | **None.** `AUTOCOMPLETE_HINTS` in `RegistrationForm.tsx` has no `region` entry — `address-level1` is not set today, so no autofill behavior exists to lose | No action. Worth noting the new control *could* later expose an autocomplete token, which the native select was not configured to use anyway |
| 4 | Native **first-letter typeahead** (press `k` → jump to first `K…`) | Removed, but replaced by something strictly stronger — full substring filtering (FR-1) | Net gain |
| 5 | **Existing tests** at the three sites select via `selectOptions` / `<option>` queries | Those tests **will break** and must be rewritten. During the rewrite they stop guarding what they guarded | Made explicit: every adoption task (T-3…T-5) owns updating its own suite in the same task, never deferred to a later one |
| 6 | **Bulletproof AT support** across every browser/screen-reader combination | **The real cost, and it is not fully mitigable.** A hand-rolled combobox has known-good semantics but no field history | ARIA 1.2 pattern conformance **with one documented deviation** (`Home`/`End` — see §5.3) + recorded as accepted risk **D8**. This is stated plainly rather than mitigated away |
| 7 | Functional before hydration (static export) | **Negligible.** All three sites are inside `'use client'` trees that are inert pre-hydration regardless | No action |

**What the challenge changed:** finding #1 promoted the mobile browser check from an implied part of T-6 to an explicit, named gate; finding #5 forbade a "fix the tests later" task split. Findings #2 and #3 retired two costs that looked real before they were checked against the code.

---

## 10. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Popup clipped or mispositioned at a site the design did not anticipate | Medium — jsdom cannot see it | T-6's manual pass covers all 3 sites × 2 viewports; portal placement removes the known clipper |
| Hand-rolled ARIA is subtly wrong for a real screen reader | Medium | Pattern conformance with the one documented `Home`/`End` deviation (§5.3), `jest-axe` on all 6 states — and honest recording as **D8** |
| The three adoption sites' tests are weakened rather than translated during the rewrite | Medium | Each adoption task must preserve its suite's existing assertion *count and intent*; the Reviewer diffs deletions specifically |
| Contrast of `bg-primary-soft` under the active option is below AA in practice | Low | Reasoned from §7's documented contrast notes; confirmed in T-6 (**D5**) |
| Scope creep into the 3 deferred sites | Low | Named non-goals in requirements §6 |
| **Popup lag during momentum scroll on low-end Android** — the scroll-tracking loop DD-5's amendment knowingly accepted | Medium | rAF throttle, listeners attached only while open, one rect read + two style writes per frame. **jsdom cannot measure this** — it belongs to T-6's manual mobile leg alongside D5/D6/D7 |

---

## 11. Budget (methodology Step 2.4)

Estimated from the finished design. `/akili-execute` compares actuals against these and **escalates to the user rather than continuing** when a figure is exceeded. Exceeding is information, not failure.

| Measure | Expected |
|---|---|
| **Tasks** | **6** |
| **LOC** | **~820** total (~375 primitive + helper, ~255 its tests, ~190 across the 3 adoptions and their test updates) |
| **Review rounds** | **7** (2 on the primitive — it is the fiddly one; 1 each on the remaining 5) |

**Re-baselined after the DD-5 amendment** (Judgment Day round 2, raised by both judges). The original ~260/~700 figures were estimated against close-on-scroll — a single branch. Reposition-on-reflow is materially more mechanism: three listener registrations (capture-phase `document` scroll, `window` resize, `visualViewport` resize/scroll), an rAF throttle, the `contains(event.target)` origin exclusion, direct `scrollTop` management replacing `scrollIntoView`, and the pointer-commit `preventDefault` path — plus one more test row. **+70 primitive / +20 tests.** A budget estimated against a design that has since grown is a tripwire that no longer trips where it should.

**Reconciled against `tasks.md` (Phase 3).** The per-task figures sum to 820, not the 790 this row first carried after the re-baseline — the task-level breakdown is the better-informed estimate, so the budget follows it rather than the reverse. Per-task: T-1 70 · T-2 420 · T-3 140 · T-4 80 · T-5 110 · T-6 0 (evidence only) = **820**. Primitive-side 25 + 250 + 100 = 375; tests 45 + 170 + 40 = 255; adoptions 80 + 110 = 190.

**Depth re-check:** `Standard` holds. Six tasks and ~820 LOC are far above `Lite` (which would be 1 task under ~50 LOC) and well below the cross-cutting, migration-shaped work that would justify `Full` — there is no data, API, auth, or infra surface here at all.

**PR strategy:** ~820 LOC exceeds the ~400 threshold. **Two PRs** — PR 1 the primitive + its tests (T-1, T-2), reviewable in isolation with no product behavior change; PR 2 the three adoptions plus the manual browser pass (T-3…T-6 — three adoption tasks and T-6, which is the manual pass, not an adoption). PR 2 is where regression risk lives and should be reviewed against the preserved-behavior column in §5.6.

---

## 12. Test Plan Outline

| Requirement | Covered by | Harness limit |
|---|---|---|
| FR-1 | Unit tests on the pure matcher (substring, case, diacritics, trim) + component filter tests | — |
| FR-2 | RTL `user-event` key sequences asserting `aria-expanded`, `aria-activedescendant`, commit/revert, and that `Tab` is not intercepted | Proves state, not real focus order (**D7**) |
| FR-3 | Assert `onChange` payload after blur/Tab/Escape with uncommitted text; assert `onChange` is never called with the typed string | — |
| FR-4 | `RegistrationForm.test.tsx` — required-error inline + summary, anchor resolves to a focusable element, **`aria-invalid="true"` present on the combobox when errored and absent when clean** (JD-2), `aria-describedby` → `#<id>-error`, `disabled` while submitting, payload shape unchanged | — |
| FR-2 pointer path | Assert a pointer commit lands after the popup's `mousedown` `preventDefault` — i.e. the value commits and the input never blurred (JD-8) | jsdom dispatches the event order faithfully, so this **is** testable; what it cannot prove is real touch behavior |
| FR-5 | `DirectoryFilters` / `FilterControls` suites — clear → `undefined` not `''`, `page: 1`, dynamic subset, fallback to 31 | — |
| FR-6 | Assert the live region's `aria-live="polite"` and its text after filtering | **Presence, not announcement** — the test must say so (KZ-002, **D8**) |
| NFR-1 | `jest-axe` over 6 states: closed, open, filtered, no-match, invalid, disabled | `color-contrast` returns `incomplete` and never fails (**D5**) |
| NFR-2 | grep for hex / `rgb(` / `bg-[` in the new and modified files | — |
| NFR-3 | `git diff` on `package.json` `dependencies` + `npm run build` | — |
| NFR-4 | Code review: no `setTimeout`/debounce in the filter path | — |
| NFR-5 | Assert the `motion-reduce:` class is applied | **Presence, not effect** (KZ-002) — jsdom cannot prove the transition is suppressed |
| **D5, D6, D7** | **T-6 manual browser pass** — 3 sites × {desktop, mobile}, evidence recorded in `execution.md` | This is the gate for everything the rows above cannot see |
