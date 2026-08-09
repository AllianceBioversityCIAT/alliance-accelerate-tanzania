# Requirements — Searchable Region Select

- Spec path: `docs/specs/enhancement/searchable-region-select/`
- Status: Approved
- Author / Date: JuanCode — 2026-08-06
- Depth: **Standard** (re-checked at design.md §Budget)
- Related: `docs/prd.md` (public self-registration, public directory/map), `docs/ux-ui/design.md` §8 (Component Inventory), §10 (Accessibility), §7 (Tokens), `docs/trd/trd.md` §4 (`?region=` filter contract)
- Predecessor: `[SPEC:quick/market-location-hint]` (commit `cffea52`) — same user review session of `/register`

---

## 1. Summary

Tanzania has **31 canonical regions**. Every region control in the product is a native `<select>` that forces the user to scroll a 31-item list with no way to type. This spec introduces one reusable **`SearchableSelect`** primitive — a type-to-filter combobox — and adopts it at **3 of the 4 public-facing** region controls. The remaining 3 sites keep their native `<select>` and are explicit non-goals (§6).

The problem is sharpest on `/register`, where the target user is a Tanzanian smallholder trader on a phone completing a form they will fill exactly once. It is the same problem, unmodified, on `/directory` and `/map`, where an anonymous visitor filters the public registry.

**Why this is not a copy tweak:** the repository has **no headless UI dependency** — no shadcn, no Radix, no Headless UI. `frontend/package.json` runtime deps are `react`, `react-dom`, `next`, `gsap`, `@gsap/react`, `leaflet`, `recharts`, `aws-amplify`, and `components/ui/` contains only `Button`, `Skeleton`, `StatCard`. The combobox is hand-built against the WAI-ARIA 1.2 pattern, which is behavior, keyboard handling, and focus management — not styling.

---

## 2. Requirement Numbering & Writing Standards

- Functional requirements `FR-1…FR-6`; non-functional `NFR-1…NFR-5`.
- RFC 2119 keywords: **MUST / SHOULD / MAY**.
- Numeric claims used throughout, reconciled per KZ-005: **31** canonical regions (`frontend/lib/content/regions.ts`, mirroring `CANONICAL_REGIONS` in `backend/src/common/normalize.ts`); **6** total `REGIONS` consumer sites, split **4 public-facing / 2 admin-facing**; **4** adopted (3 original + `components/admin/ActorForm.tsx` via T-7, added post-hoc and user-authorized — see §6); **2** deferred (§6). The public/admin split was wrong in the first draft and corrected by Judgment Day JD-9 — see §6.

---

## 3. Functional Requirements

### FR-1: Type-to-filter the region list

- **Description:** The system MUST let a user narrow the region list by typing, without leaving the keyboard or the control.
- **Rationale / Source:** User review of `/register`, 2026-08-06. `docs/ux-ui/design.md` §1.5 ("Accessible by default"), §8 (Search bar / Select inventory).
- **PII/RBAC impact:** None. `region` is a public, non-PII field (`docs/trd/trd.md` §8 — the PII allowlist is `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport`; `region` is absent from it). Anonymous `Public` users operate this control on `/directory` and `/map`.

#### Scenario: Narrowing by substring

- GIVEN the region control is open with all 31 regions listed
- WHEN the user types `kus`
- THEN only regions whose name contains `kus`, case-insensitively, remain listed (`Kusini Unguja`, `Kusini Pemba`)
- AND the match MUST be a **substring** match, not prefix-only — `Pemba` MUST surface both `Kaskazini Pemba` and `Kusini Pemba`
- AND the match MUST ignore diacritics and leading/trailing whitespace
- BUT it must NOT perform any network request — the 31 options are a static client-side constant

#### Scenario: No match

- GIVEN the region control is open
- WHEN the user types a string matching no region (e.g. `zzz`)
- THEN a visible, non-empty "No regions match" message replaces the option list
- AND IT MUST leave the previously committed value unchanged — typing alone never clears a selection
- BUT it must NOT close the popup or discard what the user typed

### FR-2: Full keyboard operation

- **Description:** The control MUST be fully operable by keyboard alone, conforming to the WAI-ARIA 1.2 combobox pattern with a filtered listbox popup.
- **Rationale / Source:** `docs/ux-ui/design.md` §10 ("All interactive elements keyboard reachable with visible focus rings; logical tab order"). WCAG 2.1 AA SC 2.1.1.
- **PII/RBAC impact:** None.

#### Scenario: Keyboard traversal and commit

- GIVEN focus is on the region control
- WHEN the user presses `ArrowDown`
- THEN the popup opens and the first option becomes the active option
- AND `ArrowUp` / `ArrowDown` MUST move the active option, `Home` / `End` MUST jump to first / last, `Enter` MUST commit the active option and close the popup, and `Escape` MUST close the popup without committing
- AND IT MUST express the active option via `aria-activedescendant` on the input, with `aria-expanded`, `role="combobox"`, and `aria-controls` correctly maintained — DOM focus MUST remain on the text input at all times
- BUT it must NOT trap `Tab`: pressing `Tab` MUST close the popup and move focus to the next control in document order

#### Scenario: Abandoning a partial search

- GIVEN a region is already committed and the user has typed a partial string that does not match it
- WHEN the control loses focus without a commit (blur, `Tab`, or `Escape`)
- THEN the displayed text MUST revert to the committed region's exact name
- AND IT MUST NOT leave the input showing an uncommitted fragment that misrepresents the stored value

### FR-3: Canonical value fidelity

- **Description:** The control MUST only ever emit a string that is byte-identical to a member of `REGIONS`.
- **Rationale / Source:** `frontend/lib/content/regions.ts` — the backend validates `?region=` by exact-string equality against `CANONICAL_REGIONS` and returns **400** for anything else. A free-text combobox is the exact mechanism by which a non-canonical string could reach the API.
- **PII/RBAC impact:** None.

#### Scenario: Typed text is never a value

- GIVEN the user has typed `Dar` and the popup shows `Dar es Salaam`
- WHEN the user blurs or submits without selecting an option
- THEN the emitted value MUST be the previously committed value or empty — never the literal string `Dar`
- BUT it must NOT accept free text as a value under any interaction path, including paste and autofill
- AND IT MUST treat the search text and the committed value as two separate pieces of state

### FR-4: Adoption in the public registration form

- **Description:** `/register`'s Region field MUST use the new control while preserving every behavior the field has today.
- **Rationale / Source:** The originating user request. `docs/ux-ui/design.md` §4 (Registration Form).
- **PII/RBAC impact:** None for `region` itself; the control sits inside a form that collects PII, so it MUST NOT introduce any new logging, analytics, or network call.

#### Scenario: Required-field validation is preserved

- GIVEN the registration form is submitted with no region selected
- WHEN client-side validation runs
- THEN the error `Select a region.` appears both inline and in the error summary, exactly as today
- AND IT MUST keep the error-summary anchor `#<baseId>-region` resolving to a focusable element, so the summary link still moves focus (the same defect class already fixed for the crops group and the consent block in `RegistrationForm.tsx`)
- AND IT MUST preserve `aria-invalid`, `aria-describedby` → `#<id>-error`, the required-asterisk label, and the `disabled` state while `submitting`
- BUT it must NOT change the emitted payload shape, the field name, or `RegistrationPayloadInput`

### FR-5: Adoption in two of the three public filter surfaces

- **Description:** `DirectoryFilters` and `map/FilterControls` MUST use the new control, including their clearable and dynamic-option behavior.
- **Rationale / Source:** Same 31-region problem, same anonymous audience. `docs/ux-ui/design.md` §4 (Directory, Seed Map).
- **PII/RBAC impact:** None. Both are `Public`-reachable.

#### Scenario: Clearing the filter

- GIVEN a region filter is active on `/directory`
- WHEN the user picks the `All regions` option
- THEN `region` is removed from the query (set to `undefined`, not `''`) and `page` resets to `1`
- AND IT MUST keep the existing URL-synced filter state and the "clear filters" affordance working unchanged
- BUT it must NOT send `region=` as an empty parameter to the API

#### Scenario: Dynamic option subset

- GIVEN `map/FilterControls` receives a non-empty `regions` prop (only regions that actually have actors)
- WHEN the control renders
- THEN it MUST list exactly that subset, not all 31
- AND IT MUST fall back to the full 31-region list when the prop is `undefined` or empty, preserving today's behavior

### FR-6: Assistive-technology feedback on filtering

- **Description:** Changes to the filtered result set MUST be conveyed non-visually.
- **Rationale / Source:** WCAG 2.1 AA SC 4.1.3 (Status Messages). `docs/ux-ui/design.md` §10 ("errors announced via live region").
- **PII/RBAC impact:** None.

#### Scenario: Result count is announced

- GIVEN a screen-reader user is typing in the region control
- WHEN the filtered option count changes
- THEN a polite live region reports the new count (e.g. `2 regions available`) and reports the no-match case explicitly
- AND IT MUST be `aria-live="polite"`, never `assertive` — this is a status message, not an error
- BUT it must NOT announce on every keystroke when the count is unchanged

---

## 4. Non-Functional Requirements

| ID | Requirement | Measure |
|---|---|---|
| **NFR-1** | WCAG 2.1 AA for the new control in every state (closed, open, filtered, no-match, error, disabled) | `jest-axe` returns zero **violations** on each state — with the stated blind spots in §4.1 covered by the substitute checks named there |
| **NFR-2** | Token-only styling | Zero hex literals, zero `rgb()`, zero arbitrary Tailwind values (`bg-[#…]`) in the new files; only semantic tokens from `docs/ux-ui/design.md` §7. Verified by grep |
| **NFR-3** | No new runtime dependency; static-export safe | `frontend/package.json` `dependencies` unchanged; `npm run build` produces the static export with no SSR/route-handler violation |
| **NFR-4** | Filtering is synchronous and unthrottled | At n=31 the filter is a single O(n) case-insensitive scan per keystroke with no debounce and no network. Any debounce added is a defect, not an optimization |
| **NFR-5** | Respects `prefers-reduced-motion` | Any open/close transition is gated; with the preference set, the popup appears in its final state with no animation (`docs/ux-ui/design.md` §7 reduced-motion rule) |

### 4.1 Defect classes and the gate that catches each

Per the methodology's gate-coverage rule and **KZ-002**, each defect class this spec can produce is mapped to the command that catches it. A class with no automated check is named and substituted — or recorded as accepted risk.

| # | Defect class | Caught by | Adequate? |
|---|---|---|---|
| D1 | Wrong keyboard semantics (`ArrowDown` does nothing, `Escape` commits, `Tab` traps) | `npm test` — RTL `user-event` drives real key sequences and asserts `aria-expanded` / `aria-activedescendant` | **Yes** — this is state, and jsdom holds state faithfully |
| D2 | Non-canonical string emitted to the API (FR-3) | `npm test` — assert the `onChange` payload after blur/submit with uncommitted text | **Yes** |
| D3 | Regression in the three adopted call sites (validation, URL sync, page reset, dynamic subset) | `npm test` — the existing `RegistrationForm.test.tsx`, `DirectoryFilters` and `FilterControls` suites, plus new cases | **Yes** |
| D4 | Missing ARIA wiring / unlabeled control | `npm test` + `jest-axe` | **Yes** for structural rules |
| D5 | **Contrast of the new listbox surface, hover row, and active-option highlight** | ❌ **Nothing.** `jest-axe`'s `color-contrast` rule returns `incomplete` under jsdom — no layout engine, no computed style — and `toHaveNoViolations` does **not** fail on `incomplete`. This is documented verbatim in the existing `register-a11y.test.tsx` header | **No** → **substitute: human visual check at the HITL pause, or a T6 Multimodal review of a real-browser screenshot.** A green `npm test` says nothing here |
| D6 | **Popup overlay geometry** — clipped by an ancestor's `overflow`, escaping the viewport, colliding with the mobile virtual keyboard | ❌ **Nothing.** jsdom has no layout; this is a `getBoundingClientRect`-shaped property that returns zeros | **No** → **substitute: manual check in a real browser at ≥1 desktop and ≥1 mobile viewport, recorded in `execution.md`.** The registration form's Location fieldset is a `grid` inside a bordered `fieldset`, which is exactly the container shape that clips a popup |
| D7 | **Real focus order and focus-ring visibility** through the composed page | ❌ **Nothing** in jsdom — it can prove an element is *individually focusable*, not that tab order is correct or the ring is visible | **No** → **substitute: same manual browser pass as D6** |
| D8 | Screen reader does not actually announce the live region (FR-6) | Partial — jsdom asserts the region's `aria-live` value and text content, which is **presence, not announcement** (KZ-002) | **Accepted risk.** A real AT run (NVDA/VoiceOver) is out of scope for this spec. The test MUST carry a comment stating it proves the region updates, not that any AT speaks it |

**D5, D6 and D7 are the dominant defect classes of this spec** — it produces a floating, styled, keyboard-driven overlay, and the automated suite is structurally blind to all three. `npm test` passing is therefore **necessary and not sufficient**; the design and tasks must carry the manual browser pass as a first-class gate, not a footnote.

---

## 5. Data & Schema Impact

**None.** No Prisma model, migration, API contract, DTO, or field changes. `region` remains a non-PII `String`, validated server-side by exact-string equality against `CANONICAL_REGIONS` exactly as today. The PII allowlist in `backend/src/common/pii-consent.policy.ts` is untouched.

---

## 6. Out of Scope

| Non-goal | Why |
|---|---|
| The remaining **1 admin-facing** region select — `app/(admin)/admin/actors/page.tsx` (`components/admin/ActorForm.tsx`, the other admin site, was adopted post-hoc as **T-7**, user-authorized after visual comparison against the live public deploy) | Staff/Admin are trained repeat users on desktop; the public audience is the stated problem. The primitive is built to be reused, so adopting it later is a mechanical follow-up spec |
| **`components/dashboard/DashboardFilters.tsx` — deferred, but NOT for the reason above** | ⚠️ **Corrected after Judgment Day round 1 (JD-9).** An earlier draft of this section grouped this file with the admin sites and justified deferring it as "Staff/Admin are trained repeat users on desktop." **That is verifiably false:** it renders through `app/(public)/dashboard/page.tsx` — the public shell — and `RequireRole` appears nowhere in the public tree. An anonymous visitor reaches it. There are **4** public-facing region selects, not 3. It is deferred purely to hold this spec's size (the 4th adoption would add ~60 LOC and a 7th task), and the cost is real and named: a public user on `/dashboard` keeps the exact 31-item scroll problem this spec exists to fix, and the redundant `aria-label` at `DashboardFilters.tsx:147` survives there too. **Its follow-up is higher priority than the 2 admin sites', not equal to it.** |
| Generalizing the control to the **crop** and **trader-type** selects | 3 and ~8 options respectively — a searcher adds cost with no benefit |
| Multi-select region filtering | Not requested; the backend `?region=` contract is single-valued |
| Swahili localization of the control's strings | Product-wide gap already tracked in `docs/ux-ui/design.md` §13; copy stays externalizable |
| A real screen-reader (NVDA/VoiceOver) verification pass | Accepted risk D8 |
| Adding a headless UI dependency (Radix, Headless UI, shadcn) to avoid hand-building | Would be the larger, riskier change: a new runtime dep, a bundle cost on a static-export public site, and a precedent the repo has deliberately not set. Recorded here so the choice is visible, and re-argued in `design.md` §8 |

---

## 7. Dependencies & Assumptions

- **Depends on:** `frontend/lib/content/regions.ts` remaining the single frontend source of region strings. No AWS resource, no `--profile IBD-DEV` command, no infra change.
- **Assumes:** `jest-axe` and `@testing-library/user-event` are usable in the existing `next/jest` harness. `jest-axe` is confirmed present in `devDependencies`; **`@testing-library/user-event` is NOT in `package.json`** — see OQ-2.
- **Assumes:** the `Field` wrapper and `inputClasses` conventions in `RegistrationForm.tsx` stay the visual contract for form controls, and `LABEL_CLASS`/`SELECT_CLASS` stay it for the two filter components.

---

## 8. Open Questions

| ID | Question | Blocking? |
|---|---|---|
| **OQ-1** | `DirectoryFilters` currently sets **both** a visible `<label htmlFor>` and a redundant `aria-label="Filter by region"` on the select — the `aria-label` silently overrides the visible label as the accessible name. Fix while adopting, or leave the pre-existing inconsistency untouched to keep the diff honest? | No — default is **fix it**, and say so in the review |
| **OQ-2** | `@testing-library/user-event` is absent from `devDependencies`. Keyboard tests can be written with `fireEvent.keyDown`, which is lower fidelity (it does not replay the real browser event sequence). Add the devDependency, or write the suites with `fireEvent`? | No — default is **add the devDependency** (dev-only, no bundle impact, materially better evidence for D1) |
| **OQ-3** | Should the control expose a visible clear (`×`) affordance on the two filter surfaces, in addition to the `All regions` option? | No — default is **no**, to keep parity with the crop/role filters beside it |

---

**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport`. `region` is **not** PII. No AWS command is required by this spec.

## 9. Requirement ID Index

| ID | Title | Primary surface |
|---|---|---|
| FR-1 | Type-to-filter the region list | `SearchableSelect` |
| FR-2 | Full keyboard operation | `SearchableSelect` |
| FR-3 | Canonical value fidelity | `SearchableSelect` |
| FR-4 | Adoption in the public registration form | `RegistrationForm.tsx` |
| FR-5 | Adoption in two of the three public filter surfaces | `DirectoryFilters.tsx`, `map/FilterControls.tsx` |
| FR-6 | Assistive-technology feedback on filtering | `SearchableSelect` |
| NFR-1 | WCAG 2.1 AA | all |
| NFR-2 | Token-only styling | all |
| NFR-3 | No new runtime dependency; static-export safe | all |
| NFR-4 | Synchronous, unthrottled filtering | `SearchableSelect` |
| NFR-5 | Reduced-motion respect | `SearchableSelect` |
