# Requirements — Form elevation close-out and ladder completion

- **Spec path:** `docs/specs/enhancement/form-elevation-ux/`
- **Status:** Draft — awaiting approval
- **Author / Date:** AKILI (Leader) on behalf of JuanCode · 2026-08-08
- **Depth:** Standard
- **Related:** `docs/prd.md` §UX · `docs/ux-ui/design.md` §5.1, §5.5, §7 · `docs/trd/trd.md` §8 · `enhancement/app-visual-refresh` (FR-4, NFR-7, VF-1…VF-5)
- **Approval Mode:** `gated` (inherited from `proposal.md`)

## 1. Summary

Close out the form-elevation work that `app-visual-refresh` T-7 started, and finish the
elevation ladder it left half-wired. This spec advances the PRD's trust-and-legibility goal for a
public registry consulted by government partners: forms are the primary data-entry surface, and
their section hierarchy, focus affordances and screen-reader associations are what field staff and
admins actually operate.

**Read this first — the proposal is partly stale.** `proposal.md` was written 2026-08-07 and
describes a problem T-7 largely fixed later the same day. Its headline
(*"Form sections don't participate in the elevation system"*) **is no longer true**. What survives
is: one visible rendering artefact (VF-4), a token that is wired and invisible, a token with no
consumers, a stale test-citation map, and three DR-5 observations — of which **two are not what
the proposal guessed**. Verified current state is in §9.

## 2. Requirement Numbering & Writing Standards

- Functional requirements are `FR-1…`; non-functional `NFR-1…`.
- Each requirement is atomic, testable, unambiguous. MUST / SHOULD / MAY per RFC 2119.
- Each traces upward to the proposal or an inherited `app-visual-refresh` finding, and downward to
  a task in `tasks.md`.
- **Reconcile figures against prose (KZ-005).** Every count in this document is code-verified at
  2026-08-08 against commit `ea2c3ac`; §9 is the single source for those figures and no other
  section restates them independently.

## 3. Functional Requirements

### FR-1: The `<legend>` must not produce a visual artefact on the filled card

- **Description:** With fieldsets now filled (`bg-surface`) on a warm canvas, the native
  `<legend>` renders as a white tab that breaks the card's top-left rounded corner. The system
  MUST render section titles with an intact card silhouette, while preserving native
  `<fieldset>`/`<legend>` grouping semantics.
- **Rationale / Source:** VF-4 (severity **obvious**, rendered evidence in
  `app-visual-refresh/captures/9-register-form__*.png`) · proposal DR-4, which required this be
  decided rather than inherited.
- **Acceptance criteria:**
  - GIVEN `/register` and `/admin/actors/new` rendered at 375 / 768 / 1440
  - WHEN a section container is inspected
  - THEN the card's border and corner radius are continuous and unbroken around the full perimeter
  - AND the section title remains visually dominant over field labels
  - **BUT it MUST NOT** be achieved by removing or weakening `border border-border` — see NFR-1
  - **BUT it MUST NOT** remove the `<fieldset>`/`<legend>` pairing from the accessibility tree, or
    replace the legend with a `<div>`/`<p>` that leaves the group unnamed
  - **AND IT MUST** be proven by a rendered capture at all three widths **before** deployment, not
    by a computed-style assertion — see NFR-5 and the disqualifier in §10
- **PII/RBAC impact:** none. `/register` is `Public`; `/admin/actors/new` is `Admin`.

### FR-2: `--shadow-xs` must be perceptible at input scale, or be removed

- **Description:** `--shadow-xs` (`0 1px 2px rgba(61,47,32,0.04)`) is applied to inputs at rest in
  both forms and renders indistinguishable from flat. The system MUST resolve this: either the
  token carries a value perceptible at input scale, or the rung is removed and the ladder is
  documented as three steps.
- **Rationale / Source:** VF-2's `xs` half · `app-visual-refresh` FR-4's rendered-evidence clause,
  reported INCONCLUSIVE and inherited here · **KZ-002** — T-7 discharged this on a presence
  assertion (*"inputs carry `shadow-xs`"*) which was true and meant nothing.
- **Scope note — this narrowly lifts proposal §7.** §7 excluded "any token value change"; §5.7
  simultaneously made closing FR-4 an acceptance criterion. Both could not hold. By user decision
  (2026-08-08) **the exclusion is lifted for `--shadow-xs` only**; every other token value stays
  frozen (NFR-2).
- **Acceptance criteria:**
  - GIVEN the chosen resolution is *re-tune*
  - WHEN an input at rest is captured at 1440 at native scale (`deviceScaleFactor: 2`)
  - THEN the input's lower edge is distinguishable from the same input with no shadow, in a
    side-by-side capture
  - **AND IT MUST** remain lighter than `--shadow-sm` on the enclosing fieldset, preserving the
    nested-element-less-raised-than-its-container relationship (proposal DR-3)
  - **BUT it MUST NOT** be re-wired at its current value and re-reported as closed — that
    reproduces the exact non-result this requirement exists to correct
  - GIVEN the chosen resolution is *remove*
  - WHEN the token is dropped
  - THEN `--shadow-xs`, its `tailwind.config.ts` mapping, and both `inputClasses()` usages are
    removed together, and `docs/ux-ui/design.md` §7 states a three-rung ladder
  - **AND IT MUST NOT** leave the token defined with zero consumers — that is the `--shadow-lg`
    state this spec exists to end, not to duplicate
- **PII/RBAC impact:** none.

### FR-3: `--shadow-lg` must have real consumers

- **Description:** `--shadow-lg` is defined and mapped but has zero consumers; all four dialogs use
  `shadow-md`, and `.shadow-lg` is absent from the deployed CSS bundle. The system MUST give it
  its `design.md` §7-designated consumers — dialogs — or remove it.
- **Rationale / Source:** VF-2's `lg` half · `design.md` §7 assigns `--shadow-lg` to
  *"dialogs, popovers, map rail"* · user decision 2026-08-08 to wire it here rather than defer.
- **Acceptance criteria:**
  - GIVEN a dialog is open on the admin surfaces
  - WHEN its panel is captured
  - THEN the panel carries `shadow-lg` and is visibly more raised than a `shadow-sm` fieldset and a
    `shadow-md` card
  - AND `.shadow-lg` is present in the built CSS bundle
  - **AND IT MUST** apply to all four dialogs — `ConfirmDialog`, `AcknowledgeDialog`,
    `CreateUserDialog`, `EditUserDialog` — so no two dialogs diverge in elevation
  - **BUT it MUST NOT** alter any dialog's backdrop, focus trap, escape handling, or
    `role="dialog"` semantics; this is an elevation change only
- **PII/RBAC impact:** none. All four dialogs are `Admin`-only surfaces.

### FR-4: The contrast harness's `REACHABLE` citations must match the code

- **Description:** `frontend/lib/contrast.test.ts`'s `REACHABLE` map carries `file:line`
  citations that no longer resolve to the sites they name. The system MUST bring them back into
  correspondence, and MUST cover any ink/ground pair that became newly reachable when fields moved
  from `--color-bg` onto `bg-surface`.
- **Rationale / Source:** proposal §6 · **KZ-008** (a citation asserting a property the code lacks
  is a defect of the same class as a missing test) · **KZ-004** (the correction must sweep every
  site, not only the cited ones).
- **Acceptance criteria:**
  - GIVEN `REACHABLE` cites `admin/ActorForm.tsx:783` and `register/RegistrationForm.tsx:602`
  - WHEN those lines are read in the current tree
  - THEN each cited line contains the class pair the citation claims (currently they are at
    `784` and `603` — off by one after T-7)
  - **AND IT MUST** close by sweeping **every** `file:line` citation in the map, not only the two
    named here — KZ-004 exists because per-site fixes miss the sites nobody listed
  - **AND IT MUST** add any ink/ground pair inside a fieldset that is newly reachable on
    `--color-surface` and was previously only reachable on `--color-bg`
  - **BUT it MUST NOT** weaken, skip, or delete an existing failing-pair ledger entry to make the
    suite pass
- **PII/RBAC impact:** none.

### FR-5: The GPS-optional copy must be programmatically associated with the GPS fields

- **Description:** On `/register`, the GPS-optional explanation is a standalone `<p>` with no `id`
  and is referenced by no `aria-describedby`. Screen-reader users reach the GPS inputs without it.
  The system MUST associate it with both GPS controls.
- **Rationale / Source:** DR-5 *help-text association* — **reframed after verification.** DR-5
  claimed the copy *visually* attaches to `Market location`; that is contradicted by the spacing
  (16 px above, 8 px below, so proximity already groups it downward with GPS). The real defect is
  that it has no programmatic association at all.
- **Acceptance criteria:**
  - GIVEN a screen reader focuses `GPS latitude` or `GPS longitude` on `/register`
  - WHEN the accessible description is read
  - THEN it includes the GPS-optional explanation
  - **AND IT MUST** preserve each field's existing per-field hint
    (`Decimal between -90 and 90` / `-180 and 180`) rather than replacing it
  - **BUT it MUST NOT** change the copy's visual position or its `mt-4` / `mt-2` spacing — the
    visual grouping is already correct and is not the defect
- **PII/RBAC impact:** none. `/register` is `Public`.

### FR-6: The consent badge must hug its content

- **Description:** In `ActorsTable`, `ConsentBadge` and `SourceBadge` are `inline-flex` spans
  inside a `flex flex-col` wrapper whose default `align-items: stretch` stretches them across the
  cross axis. The system MUST render each badge at its content width.
- **Rationale / Source:** DR-5 *consent pill width* — **confirmed in code**, contrary to the
  proposal's note that it was unverified. `ActorsTable.tsx:306,319` are `inline-flex`;
  `ConsentCell`'s wrapper is `flex flex-col gap-1`, and `inline-flex` on a flex *child* does not
  prevent cross-axis stretching.
- **Acceptance criteria:**
  - GIVEN the admin actors table renders a row with a short status (`Published`) and one with a
    long status
  - WHEN the badges are measured
  - THEN each badge's width equals its text width plus its horizontal padding, and the two differ
  - **AND IT MUST** apply to `SourceBadge` as well — it shares the identical class string and the
    identical wrapper, so fixing only the consent badge leaves the same defect one column over
  - **BUT it MUST NOT** change badge colours, radius, padding, or the stacked chip-plus-caption
    arrangement `design.md` §5 specifies
- **PII/RBAC impact:** none. `Admin`-only surface.

### FR-7: Form section density must be evaluated against a rendered baseline

- **Description:** `ActorForm` stacks six `p-4 sm:p-6` sections; at 1440 the forms read loose. The
  system SHOULD tighten section density **only if** a rendered before/after comparison shows an
  improvement.
- **Rationale / Source:** DR-5 *density* — included by user decision (2026-08-08). It is the
  weakest-evidenced of the three and is deliberately the only `SHOULD` here.
- **Acceptance criteria:**
  - GIVEN both forms captured before and after any spacing change at 375 / 768 / 1440
  - WHEN the pairs are compared
  - THEN the change is adopted only if the six-section `ActorForm` reads calmer without fields
    becoming cramped
  - **AND IT MUST** be reported as *no change made* if the comparison is inconclusive — an
    inconclusive aesthetic result is a legitimate outcome, not a licence to ship a tweak
  - **BUT it MUST NOT** reduce any interactive control's hit area below 44×44 CSS px, nor change
    the two-column `lg:grid-cols-2` field arrangement
- **PII/RBAC impact:** none.

## 4. Non-Functional Requirements

### NFR-1: The section boundary stays above the WCAG 1.4.11 3:1 floor
`--color-surface` (`#FFFFFF`) against `--color-bg` (`#FBF9F6`) is **1.05:1**, so the *border*
carries the section boundary — a shadow adds to it and never substitutes for it.
`border border-border` MUST survive on all 11 fieldsets. **Evidence is disqualified if** any
fieldset loses its border on the argument that it now has a shadow.

### NFR-2: Tokens only, and only `--shadow-xs` may change value
No hex, `rgb()`, or arbitrary Tailwind values in any component touched. Every token value other
than `--shadow-xs` (FR-2) stays frozen — this spec consumes the ladder, it does not re-author it.

### NFR-3: Accessibility is preserved or improved, never traded
WCAG 2.1 AA throughout. Fieldset/legend grouping intact in the accessibility tree; focus-visible
rings, `aria-describedby` threading, and error association unchanged except where FR-5 adds to
them. `npm test` MUST stay green on the existing a11y assertions.

### NFR-4: No behavioural change
No form validation, submission, payload, API, or state-management change. Class, markup-structure,
token-value, and ARIA-wiring changes only. **Tripwire:** any diff touching `buildPayload`,
validation, or an API client is out of scope and stops the task.

### NFR-5: Layout-affecting changes require rendered evidence before deploy
FR-1 changes the legend's flow or positioning. `float-left w-full` was tried on 2026-08-07 and
**broke the grid layout while contrast, lint and build all passed green** — none of them evaluates
layout. Any change to flow or positioning MUST be captured at 375 / 768 / 1440 and inspected
before deployment.

### NFR-6: Bundle size does not regress
`/register`, `/directory` and the admin routes MUST NOT grow measurably; these are class and
token changes, so first-load JS should be unchanged.

## 5. Data & Schema Impact

**None.** No entity, field, migration, or Prisma change. No new PII field; `phone` and `email`
handling is untouched.

## 6. Out of Scope

- `DirectoryFilters.tsx:90` — deliberately `border-0`, a filter rail rather than a form section.
- **VF-5 / `PartnersStrip`** — routed to its own proposal by user decision (2026-08-08). It is a
  home-page marketing section unrelated to forms or the ladder.
- Backend, validation logic, submission behaviour, API contracts.
- Dashboard and admin table *surfaces* — already on `bg-surface`. FR-6 touches `ActorsTable` only
  for the badge-width defect, not its layout.
- **Nav clipping at 768 px** and the **375 px map-legend overlap** — real, pre-existing, attributed
  by git to other specs, and each warrants its own `bugfix/` proposal.
- Extracting a shared input primitive (see §9) — recorded, not undertaken here.

## 7. Dependencies & Assumptions

- **Hard prerequisite:** `enhancement/app-visual-refresh` — T-7 has landed (`14a56f9`); T-6 remains
  `[~]` pending AR-1 sign-off. This spec **may proceed** in parallel with that sign-off, because
  every remaining T-6 item is evidentiary rather than code-changing.
- Rendered verification runs against the Dev CloudFront origin `https://d3idqvvg0xa1r7.cloudfront.net`
  per `app-visual-refresh` T-6's environment decision. Deploys are **operator-run**
  (`infra/scripts/deploy-frontend.sh`, `--profile IBD-DEV`), not agent-run.
- Capturing the three authenticated surfaces requires a user-driven login; the harness and method
  are in `app-visual-refresh/captures/`.

## 8. Defect classes this spec can produce, and the gate for each

Per the AKILI rule that **a gate blind to the defect class the spec most often produces is not a
gate**. This spec's dominant output is rendered appearance, which is exactly where green
automated gates have already misled this project twice.

| Defect class | Caught by | Automated? |
|---|---|---|
| Token literal / non-token value introduced | `npx eslint --quiet` + grep for hex in the diff | ✅ |
| Contrast pair regression | `npm test -- contrast --silent` (129 pairs) | ✅ |
| Broken build / static-export violation | `npm run build` | ✅ |
| a11y association or role regression | `npm test` (RTL + jest-axe assertions) | ✅ |
| Badge width (FR-6) | RTL cannot measure layout — **rendered measurement** via `getBoundingClientRect` in a real browser | ⚠️ substituted |
| **Legend artefact (FR-1)** | **No automated check exists.** jsdom has no layout; `axe` cannot see a broken corner radius | ❌ **human + T6** |
| **Shadow perceptibility (FR-2)** | **No automated check exists.** A shadow's *presence* is assertable; its *visibility* is not | ❌ **human + T6** |
| **Density judgement (FR-7)** | Inherently subjective | ❌ **human only** |

**Substitutes for the three unautomatable classes**, mandatory not optional:
1. A rendered capture set at 375 / 768 / 1440 taken **before** deploy (NFR-5).
2. A **T6 Multimodal** review — registry routes this to Antigravity / `gemini-3.1-pro-high`.
   **Its verdict is advisory input, not a gate.** In `app-visual-refresh` T-6 two T6 rounds
   described the same defect incompatibly and a Leader geometry probe agreed with neither; the
   adjudication is the Leader's, on the pixels.
3. A **human visual gate** for FR-1, FR-2 and FR-7. Explicit approval — direction to proceed
   ("continue", "do as you see fit") **is not approval** and MUST NOT be recorded as such.

**Accepted risk:** FR-7 is unmeasurable and unsubstituted beyond human judgement. Recorded here so
the blind spot is acknowledged rather than discovered during rework.

## 9. Verified current state (source of figures for this spec)

Code-verified 2026-08-08 at `ea2c3ac`. Every count elsewhere in this spec refers here.

| Fact | Value |
|---|---|
| Fieldsets carrying `bg-surface` + `shadow-sm` + border | **11** (`ActorForm` ×6, `RegistrationForm` ×5) |
| Fieldset class string | `rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm` |
| Legend vs label | `600 / 16px` vs `500 / 14px` — DR-1 already satisfied |
| Legend wrap at 375 px | Does **not** occur — all legends 1 line (24 px against 24 px line-height) |
| `shadow-xs` sites | `ActorForm.tsx:512`, `RegistrationForm.tsx:452` — inside duplicated `inputClasses()` |
| `shadow-lg` consumers | **0** |
| Dialogs on `shadow-md` | 4 |
| Stale `REACHABLE` citations found | 2 (off by one; full sweep required per FR-4) |

**Two structural facts the proposal assumed wrongly:**

1. **There is no shared input primitive.** `components/ui/` contains only `Button`, `Skeleton`,
   `StatCard`. DR-3's premise that `Input`/`Select`/`FormField` exist is false — `inputClasses()`
   is a **byte-identical duplicate** in both forms. Any input-level change must be made twice, and
   the duplication is the divergence risk proposal §5.3 warns about, already realised. Extracting a
   shared primitive is **recorded and out of scope** (§6); FR-2 must instead change both copies in
   one task and state that it did.
2. **`ConsentBadge` stretching is a flex-parent effect**, not a badge-class defect — which is why
   reading the badge alone suggested no defect. See FR-6.

## 10. Global evidence disqualifiers

Applying to every task in this spec:

- **A presence assertion is not a behavioural proof (KZ-002).** "The class is applied", "the token
  is defined", "the attribute exists" prove presence. FR-1, FR-2 and FR-6 are *effect*
  requirements and MUST be closed on a rendered measurement or capture.
- **A green build is not evidence for a layout change (NFR-5).**
- **An inconclusive result MUST be reportable as inconclusive** and never collapsed into a pass
  because a command exited `0`.
- **A geometry assertion may not substitute for looking** on FR-1 specifically. A
  `getBoundingClientRect` probe returning `straddles:false` was used to argue VF-4 did not exist;
  it compared the wrong rectangle and was wrong. Measure *and* look.

## 11. Open Questions

1. **FR-1 mechanism is deliberately unspecified.** Header row inside the card, absolute
   positioning, or a visually-hidden legend plus a styled heading — chosen at design time in
   `design.md`, constrained by FR-1's negative clauses and NFR-5.
2. **FR-2's branch is a design decision**, not an implementation detail: re-tune or remove.
   `design.md` MUST pick one and state why; both are permitted by this requirement.
3. **FR-7 may legitimately produce no change.** If the rendered comparison is inconclusive, the
   task closes as *evaluated, no change* — that is a pass, not a failure.

## 12. Requirement ID Index

| ID | Title | Strength | Source | Automatable gate? |
|---|---|---|---|---|
| FR-1 | Legend produces no visual artefact | MUST | VF-4, DR-4 | ❌ human + T6 |
| FR-2 | `--shadow-xs` perceptible or removed | MUST | VF-2 `xs`, KZ-002 | ❌ human + T6 |
| FR-3 | `--shadow-lg` has real consumers | MUST | VF-2 `lg`, design.md §7 | ⚠️ partial |
| FR-4 | `REACHABLE` citations match code | MUST | KZ-008, KZ-004 | ✅ |
| FR-5 | GPS copy programmatically associated | MUST | DR-5 (reframed) | ✅ |
| FR-6 | Consent badge hugs content | MUST | DR-5 (confirmed) | ⚠️ substituted |
| FR-7 | Density evaluated against baseline | SHOULD | DR-5 | ❌ human |
| NFR-1 | 3:1 boundary floor preserved | MUST | WCAG 1.4.11 | ✅ |
| NFR-2 | Tokens only; only `xs` may change | MUST | proposal §7 (lifted narrowly) | ✅ |
| NFR-3 | Accessibility preserved or improved | MUST | WCAG 2.1 AA | ✅ |
| NFR-4 | No behavioural change | MUST | proposal §7 | ✅ |
| NFR-5 | Rendered evidence before deploy | MUST | the reverted `float-left` incident | ❌ procedural |
| NFR-6 | No bundle-size regression | MUST | `app-visual-refresh` NFR-3 | ✅ |

---
**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email`. All
AWS commands use `--profile IBD-DEV`.
