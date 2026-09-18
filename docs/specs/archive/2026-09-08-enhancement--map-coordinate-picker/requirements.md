# Requirements — Map Coordinate Picker

- Spec path: `docs/specs/enhancement/map-coordinate-picker/`
- Status: Approved
- Depth: **Standard**
- Author / Date: Daniela Gómez / 2026-09-08
- Source: Jira **ATP-55** (Option 2 only, scoped by the product owner 2026-09-08) · `proposal.md` in this folder
- Related: `docs/prd.md` AC-3 · `docs/ux-ui/design.md` §7 (tokens), §6 (Layout Patterns — grouped form fieldsets) · `docs/trd/trd.md` §3 (Actor model) · `frontend/CLAUDE.md` (static export, tokens, testing)

## 1. Summary

Both forms that capture an actor's location — `RegistrationForm` (public self-registration) and `ActorForm` (admin) — ask for raw decimal coordinates in two number inputs. This spec adds a small embedded Leaflet map with a single draggable pin, bound two-way to those inputs, so a location can be set without typing a coordinate and a wrong coordinate becomes visible instead of invisible.

The manual inputs stay present, editable, and authoritative. The picker writes into them; it does not replace them. That is what preserves the existing keyboard/screen-reader path and satisfies ATP-55's non-map-fallback criterion **by construction** rather than by a parallel implementation.

Advances PRD **AC-3** (every actor with valid `gpsLatitude`/`gpsLongitude` is plotted on the map). No backend, schema, migration, or API-contract change.

## 2. Requirement Numbering & Writing Standards

Functional `FR-n`, non-functional `NFR-n`. RFC 2119 keywords. Citations anchor to symbols and unique literals, never `file:line` (KZ-009).

### 2.1 Findings that correct the proposal (KZ-011 — measured, not reasoned)

Three claims in `proposal.md` were checked against the codebase and the Dev environment on 2026-09-08. Two are false and one is confirmed. They are recorded here because `requirements.md` is the first document a downstream agent trusts.

| # | Proposal claim | Verified state | Consequence |
|---|---|---|---|
| **C-1** | Scope table: *"`frontend/components/map/` — Source of the reusable constants — **not** modified"* | **FALSE.** `TANZANIA_CENTER`, `TANZANIA_BOUNDS`, `OSM_TILE_URL`, `OSM_ATTRIBUTION` are **module-private `const`s in `LeafletMap.tsx`** — none is exported, and no shared map-constants module exists anywhere in `frontend/` (grep for `OSM_TILE_URL`, `TANZANIA_CENTER`: single file, zero exports) | Sharing them **requires touching `components/map/`**. Resolved by **FR-8** |
| **C-2** | Scope table: *"Existing validation unchanged — Range checks and **the both-or-neither pairing rule** keep working"* | **HALF TRUE.** Only `RegistrationForm.validate()` carries the pairing rule (`'Enter both coordinates, or leave both blank.'`). `ActorForm.validate()` range-checks `gpsLatitude` and `gpsLongitude` **independently** — a latitude-only record is valid in the admin form and invalid in the public one | The two forms have **different** legal states. The picker must be correct under both. Resolved by **FR-5** and **FR-1 scenario 3** |
| **C-3** | *"The column is `Decimal(10,7)`, so a value must be reduced to 7 decimals somewhere"* | **CONFIRMED.** `backend/prisma/schema.prisma`: `gpsLatitude Decimal? @db.Decimal(10, 7)`, `gpsLongitude` likewise | **FR-6** fixes the precision in the picker, deliberately, rather than letting MySQL round silently |

### 2.2 Measurements taken for this spec

All taken 2026-09-08 on this checkout / the `IBD-DEV` Dev API. **Not** re-reasoned from the proposal.

| ID | Measurement | Value | Method |
|---|---|---|---|
| **M-1** | `/register` route size / First Load JS, pre-change | **7.43 kB / 113 kB** | `cd frontend && npm run build` route table (matches the proposal) |
| **M-2** | Leaflet vendor chunk, already built and **lazy** (in no route's First Load JS) | **148,505 B raw / 42,672 B gzip** JS + **10,611 B raw / 2,692 B gzip** CSS in its own file → **45,364 B ≈ 44 kB gzip total**. (An earlier draft said *~43 kB*, summing two separately rounded-down figures — KZ-005; corrected from the byte counts, which two judges reproduced independently) | Chunk identified by `tile.openstreetmap` / `_leaflet_pos` literals in `.next/static/`; contains no `react-dom`, so it is Leaflet alone |
| **M-3** | `/map` First Load JS — proof the `ssr: false` split already works | **112 kB**, i.e. Leaflet is *not* counted into it | same build |
| **M-4** | Test harness: `jest-axe@^10`, `@types/jest-axe` present; `RegistrationForm.test.tsx` and `ActorForm.test.tsx` both exist and both already assert on GPS fields | present | `frontend/package.json`, `ls`/`grep` over `*.test.tsx` |
| **M-5** | Concurrency pre-flight (KZ-010, proposal R4) | **clear** — 0 unmerged commits touching `RegistrationForm.tsx`, `ActorForm.tsx`, or `components/map/` on any of the 7 other local branches; 0 open PRs | `git log main..<branch> -- <paths>` per branch; `gh pr list --state open` |

### 2.3 The measurement that could **not** be taken (OQ-2)

Proposal **OQ-2** asks what fraction of *self-registered* actors leave GPS blank — the number that decides whether this work is important or merely nice.

| What was measured | Result |
|---|---|
| Approved actors on the Dev public list (`GET /api/v1/actors`, 5 pages, `pageSize=100`) | **436 actors, 1 without coordinates — 0.2 %** |

**This does not answer OQ-2, and must not be read as if it did.** The public list projection carries no `registrationSource`, and those 436 are overwhelmingly bulk-imported records, not self-registrations; pending self-registrations are not on the public list at all. The self-registered cohort is unobservable from any unauthenticated endpoint, and `backend/.env` points at **localhost**, not the Dev RDS.

**Recorded as an accepted, named gap.** It is closable in one query by anyone with Dev DB or admin-token access:

```sql
SELECT COUNT(*) AS total,
       SUM(gpsLatitude IS NULL OR gpsLongitude IS NULL) AS missing
FROM Actor WHERE registrationSource = 'SELF_REGISTERED';
```

What the 0.2 % *does* establish: the map is well-populated today, so this change is **insurance against a future self-registration cohort**, not a repair of a currently-empty map. That reframes the value, and it is stated here so nobody claims otherwise downstream. See **OQ-2** in §8.

### 2.4 Defect classes this spec can produce, and the gate for each

Required by the methodology: a gate blind to the defect class the spec most often produces is not a gate.

| # | Defect class | Gate | Can it fail? |
|---|---|---|---|
| **D-1** | Coordinate transform wrong — parse, round, range, blank, half-filled | `cd frontend && npm test -- coordinate` — pure unit tests on the seam, no Leaflet | **Yes.** A wrong rounding constant, an inverted lat/lng, or accepting `lat=91` reddens named cases |
| **D-2** | Two-way binding defect — pin writes but fields do not re-place the pin, or a feedback loop | Component tests with the Leaflet shell replaced by a **recording stub** that exposes the props/callbacks it received | **Yes** for the React side. **No** for anything that requires Leaflet to actually run — see D-3 |
| **D-3** | Leaflet interaction broken — marker not draggable, map click not wired, marker not created, map never sized | **No automated gate exists.** jsdom has no layout engine and the Leaflet layer is stubbed out (`ActorMap.test.tsx` already mocks `next/dynamic`; `LeafletMap.tsx` has **no test file at all**) | **Declared unevaluable gap (KZ-002 / KZ-013 form B).** Substituted by a **real-browser check over CDP against the static export**, with the observations recorded verbatim — the same route ATP-57's scroll behaviour used |
| **D-4** | Layout defect — map overflows or is unusable at 375 px, breaks the `/register` grid | **No automated gate.** Contrast, lint and build are all blind to layout — this exact class shipped to Dev green once already (`frontend/CLAUDE.md`, the `float-left w-full` warning) | **Declared gap.** Substituted by rendered captures at **375 / 768 / 1440** at a HITL pause. Never asserted by a jsdom test |
| **D-5a** | **Dynamic split broken** — Leaflet static-imported into the picker's wrapper, moving ~44 kB gzip into the initial bundle | `npm run build` route table, compared against **M-1 (113 kB)** | **Yes** — a top-level `import 'leaflet'` in `CoordinatePicker.tsx` breaches the bar (~44 kB would land at ~162 kB, unmistakable against the 119 kB ceiling) |
| **D-5b** | **Leaflet fetched anyway on `/register`** — the picker mounted eagerly, so the lazy chunk, its CSS, and OSM tiles are all requested at page load | **The route table CANNOT see this** — `/map` mounts `ActorMap` eagerly and still reports 112 kB (M-3), so the table reads identical either way. Gated instead by a **real-browser network observation** over CDP on the built static export: zero requests matching the Leaflet chunk, the Leaflet CSS, or `tile.openstreetmap.org` | **Yes**, and it must be **proven** so: render the picker with `initiallyOpen` on `/register` and show the gate fails, before trusting it. **Disqualifier:** a capture recording zero requests of *any* kind means the harness never observed the page — inconclusive, not a pass |
| **D-6** | Design-token violation (hardcoded colour/geometry) | `npm run lint` + grep for `#`, `rgb(`, `bg-[` in the new/changed files | **Yes** — a literal hex in the new component reddens the grep |
| **D-7** | Regression in existing coordinate validation or error wiring | `npm test -- RegistrationForm ActorForm` — both suites already assert on GPS fields (**M-4**) | **Yes** — changing either `validate()` reddens existing cases |
| **D-8** | Accessibility regression on the two forms | `jest-axe` on both form suites (**M-4**) | **Partial.** Catches labelling/ARIA on the DOM jsdom renders. **Cannot** evaluate the map's own keyboard story, because the Leaflet layer never runs — folded into the **D-3** gap |

**Three gaps, all declared: D-3 and D-4 have no automated gate and are substituted; D-5b has a gate that will be run once but not committed** (see NFR-1b) — D-5b was originally given a gate that could not fail at all, and `design.md` §2 records both the finding and the replacement. Both substitutions are named above and are owned by tasks in `tasks.md`. Nothing in this spec may report them as verified by a jsdom test.

## 3. Functional Requirements

### FR-1: Placing the pin writes both coordinate fields

- **Description:** The picker MUST render exactly one marker. Dragging the marker, or clicking anywhere on the map, MUST move it, and MUST write the marker's position into `gpsLatitude` and `gpsLongitude` as strings, through the form's existing `setField` path so the existing error-clearing behaviour applies unchanged.
- **Rationale / Source:** ATP-55 Option 2; PRD AC-3; proposal Success Criteria 1.
- **PII/RBAC impact:** None. Coordinates are already a public, disclosed field on the map; no new field, no change to `pii-consent.policy.ts` or the role-aware serializer.

#### Scenario 1: Drag the pin

- GIVEN a form whose coordinate fields are blank and whose picker is mounted
- WHEN the person drags the marker to a point in Tanzania
- THEN both `gpsLatitude` and `gpsLongitude` show the marker's position
- AND any pre-existing validation error on either field is cleared
- AND IT MUST write **both** fields in the same interaction — never one alone
- BUT it must NOT alter any other form field, and must NOT submit the form

#### Scenario 2: Click the map

- GIVEN the picker is mounted
- WHEN the person clicks a point on the map that is not the marker
- THEN the marker moves to that point
- AND both fields update exactly as in Scenario 1

#### Scenario 3: Writing over a half-filled pair (the C-2 divergence)

- GIVEN `ActorForm` with `gpsLatitude` filled and `gpsLongitude` blank — a state that form's `validate()` accepts
- WHEN the person places the pin
- THEN both fields are written, resolving the pair
- AND IT MUST behave identically in `RegistrationForm`, where the same half-filled state is a validation error
- BUT it must NOT change either form's `validate()` to make the two agree — the divergence is out of scope (§6)

### FR-2: Existing coordinates place the pin when the form opens

- **Description:** When a form mounts with both coordinate fields holding valid, in-range numbers, the picker MUST place the marker at that position and center the map on it. When it does not, the picker MUST render with no marker, centered on Tanzania.
- **Rationale / Source:** Proposal Success Criteria 2 — "a wrong pin is visible at a glance". This is the whole admin-side value.

#### Scenario 1: Edit an actor that has coordinates

- GIVEN `ActorForm` opened for an actor with `gpsLatitude = -6.8`, `gpsLongitude = 39.28`
- WHEN the picker mounts
- THEN the marker is at that position and the map is centered on it
- AND IT MUST center on the actor's point, not on the Tanzania default

#### Scenario 2: No coordinates

- GIVEN a form whose coordinate fields are both blank
- WHEN the picker mounts
- THEN no marker is rendered
- AND the map is centered on the Tanzania default view
- BUT it must NOT place a marker at `0,0`, at the map center, or anywhere else — absence of a coordinate is not a coordinate

#### Scenario 3: Values the picker cannot place

- GIVEN a form where the coordinate fields hold a half-filled pair, a non-numeric string, or an out-of-range value (`gpsLatitude = 91`, `gpsLongitude = 181`)
- WHEN the picker mounts or re-reads the fields
- THEN no marker is rendered
- AND IT MUST leave the field values exactly as typed — the picker never corrects, clamps, or erases what a person entered
- BUT it must NOT throw, and must NOT prevent the form from rendering or submitting

### FR-3: Typing in the fields moves the pin

- **Description:** Editing either coordinate input MUST re-place the marker whenever the resulting pair is valid and in range, and MUST remove the marker whenever it is not. The fields remain the source of truth.
- **Rationale / Source:** Proposal Success Criteria 3.

#### Scenario 1: Type a valid pair

- GIVEN a mounted picker with no marker
- WHEN the person types a valid latitude and a valid longitude
- THEN the marker appears at that position
- AND IT MUST NOT re-write the field values it just read — a value typed by a person must survive the round trip byte-for-byte

#### Scenario 2: Type an invalid or partial value

- GIVEN a mounted picker with a marker placed
- WHEN the person clears one field, or types a value outside its range
- THEN the marker is removed
- AND the existing inline validation behaves exactly as it does today, per each form's own `validate()`

### FR-4: Clearing the point

- **Description:** The picker MUST offer a labelled control that returns both coordinate fields to blank and removes the marker. Blank remains a legal, submittable state in both forms.
- **Rationale / Source:** Proposal Scope — "A way to clear the point, since blank is a valid state"; Success Criteria 4.

#### Scenario 1: Clear a placed point

- GIVEN a form with a placed marker and both fields filled
- WHEN the person activates the clear control
- THEN both fields are blank and the marker is gone
- AND the form submits successfully with no coordinates
- AND IT MUST clear **both** fields — leaving one behind recreates the half-filled state of FR-1 scenario 3
- BUT it must NOT clear any other field, and must NOT reset the map view

#### Scenario 2: Nothing to clear

- GIVEN a form with no marker and both fields already blank
- WHEN the picker renders
- THEN the clear control is either absent or disabled, and is never a control that appears to do nothing
- BUT it must NOT be present-and-enabled while having no effect

### FR-5: The manual inputs are unchanged and remain authoritative

- **Description:** The two coordinate inputs MUST keep their current labels, `type="number"`, hint text, `aria-describedby` wiring (including `RegistrationForm`'s shared `gpsHintId`), error association, and disabled-while-submitting behaviour. Neither form's `validate()` and neither form's payload builder may change. The picker is additive.
- **Rationale / Source:** Proposal Scope + the resolved accessibility note; `frontend/CLAUDE.md` form conventions.

#### Scenario 1: The non-map path still works end to end

- GIVEN a person who never interacts with the map
- WHEN they fill both coordinates by keyboard and submit
- THEN the form behaves exactly as it does today, including validation messages and the error summary
- AND IT MUST require no map interaction to reach any valid outcome
- BUT it must NOT remove, relabel, reorder, or re-type either input, and must NOT make GPS required

#### Scenario 2: Each form keeps its own rules

- GIVEN the two forms' differing validation (C-2)
- WHEN either form is submitted
- THEN `RegistrationForm` still enforces "enter both coordinates, or leave both blank" and `ActorForm` still range-checks each field independently
- AND IT MUST leave `gpsAltitude` and `gpsAccuracy` in `ActorForm` manual and untouched

### FR-6: Written coordinates are rounded to a fixed precision

- **Description:** Coordinates the picker writes MUST be rounded to a single fixed number of decimal places, no greater than **7** — the scale of the `Decimal(10,7)` columns (C-3). The same constant MUST govern both write directions so a value written by the picker, re-read by the picker, and written again is stable. Values a *person* typed are never rounded (FR-2 scenario 3, FR-3 scenario 1).
- **Rationale / Source:** Proposal OQ-3. A pin drag yields ~13 decimals; without this, MySQL rounds silently and the stored value differs from the submitted one.

#### Scenario 1: A drag produces a long decimal

- GIVEN the picker writes coordinates
- WHEN the marker lands at latitude `-6.812345678901`
- THEN the field receives the value rounded to the fixed precision
- AND IT MUST be at most 7 decimal places, so the value stored equals the value submitted
- AND IT MUST round-trip: re-reading that field and re-writing it yields the identical string
- BUT it must NOT round a value the person typed into the field themselves

### FR-7: The registration form does not pay for Leaflet until it is asked for

- **Description:** `/register` MUST NOT include Leaflet's code in its initial page load. The picker in `RegistrationForm` MUST mount only after a deliberate user action on a labelled control. `ActorForm` MAY mount its picker eagerly, because seeing a wrong pin without clicking is that form's entire value and it is a desktop admin surface.
- **Rationale / Source:** Proposal R3 + OQ-1, now decided on measurement: the Leaflet payload is **~44 kB gzip** (M-2) against a **113 kB** first load (M-1) on the primary mobile channel. Also mitigates R5 (OSM tile-request volume from a public form).

#### Scenario 1: Registration page first load

- GIVEN a person opens `/register`
- WHEN the page finishes loading
- THEN no Leaflet JS or CSS has been requested
- AND IT MUST be verified by **observing the built page's network activity**, not by the `next build` route table — that table reports the same number whether the map mounts eagerly or not (M-3), so it cannot see this defect (`design.md` §2)
- BUT it must NOT hide the coordinate inputs behind the same control — they stay visible and usable without ever revealing the map

#### Scenario 2: Revealing the map

- GIVEN a person on `/register`
- WHEN they activate the reveal control
- THEN the picker mounts, and behaves per FR-1 through FR-6
- AND IT MUST place the pin from any coordinates already typed, exactly as FR-2 requires on mount

### FR-8: Map constants become shared rather than duplicated

- **Description:** The Tanzania center, the Tanzania bounds, the OSM tile URL, and the OSM attribution MUST exist in exactly one module, imported by both `LeafletMap` and the picker. Because they are currently module-private in `LeafletMap.tsx` (C-1), this requires editing that file — a fact the proposal denied and this spec accepts.
- **Rationale / Source:** C-1. Two OSM surfaces with divergent attribution strings would be an attribution-compliance defect, and a duplicated tile URL is a two-place edit waiting to be a one-place edit.

#### Scenario 1: One definition

- GIVEN the picker and the public map both render OSM tiles
- WHEN either module's tile URL or attribution is read
- THEN both resolve to the same exported constant
- AND IT MUST leave the public map's rendered behaviour byte-identical — this is an extraction, not a redesign
- BUT it must NOT add a `pickerMode` flag or any other coupling to `LeafletMap` (proposal Option B, rejected)

## 4. Non-Functional Requirements

| ID | Requirement | Measurement |
|---|---|---|
| **NFR-1** | `/register` First Load JS MUST NOT exceed **119 kB**. ⚠️ **Amended 2026-09-08 at the T-6 gate, user-approved. This ceiling was set BY MEASUREMENT AFTER implementing, not before — do not read it as a budget that was met.** The original **116 kB** was M-1's 113 kB plus a **guessed** ≤3 kB for a component that did not yet exist. Measured after adoption: **118 kB** (+5 kB): the page chunk grew 7.43 → 8.94 kB and the rest is the `next/dynamic` runtime, which `/register` did not previously load (the admin routes grew only ~1 kB because they already had it). **Leaflet is not in it** — verified twice independently, by grepping every chunk `out/register/index.html` loads for `tile.openstreetmap` and `_leaflet_pos`: zero hits. The requirement's *purpose* — keep Leaflet's ~44 kB (M-2) off the initial load — holds intact; only the author's estimate of the wrapper's own weight was wrong | `cd frontend && npm run build` route table (**D-5a**). **Disqualifier:** if the build ran against a dirty `.next/` or a different dependency tree than M-1's, the number is not comparable — rebuild clean or report the run as inconclusive. **This gate does not cover FR-7 — see NFR-1b** |
| **NFR-1b** | Loading `/register` MUST issue **zero** network requests for Leaflet's JS chunk, Leaflet's CSS, or OSM tiles, until a person reveals the map | Real-browser network capture over CDP against the built static export (**D-5b**). Required because the route table structurally cannot discriminate eager from on-demand mounting (M-3, and `design.md` §2). **The gate must be mutation-verified before it is trusted**, and a capture with no requests at all is inconclusive, not a pass. **One-time, execution-only — not a committed test** (user decision 2026-09-08): a later eager-mount regression will not be caught automatically. Declared as a third accepted gap beside D-3 and D-4; see `design.md` §2 *Durability* and §13 |
| **NFR-2** | The full location-setting path MUST remain operable by keyboard and screen reader **without the map**: both inputs keep visible labels, hint association, and error association. The picker's own controls (reveal, clear) MUST have accessible names and visible focus | `jest-axe` on both form suites (M-4) — **0 violations**. **Known limit:** this cannot evaluate the map's own keyboard story (D-3/D-8); that is a declared gap, not a pass |
| **NFR-3** | No hardcoded colours or geometry. Only semantic tokens from `docs/ux-ui/design.md` §7 | `npm run lint` plus a grep for `#`-hex, `rgb(`, and `bg-[` across the changed files. `LeafletMap`'s precedent for runtime-injected markup is `var(--token)` in an inline style, never a hex |
| **NFR-4** | The coordinate logic MUST be unit-testable **without Leaflet, without jsdom layout, and without mounting either form** — pure functions over strings and numbers | The seam's test file imports neither `leaflet` nor any form component. **Disqualifier:** a test that needs `jest.mock('leaflet')` to run has failed this requirement, not satisfied it |
| **NFR-5** | The picker MUST be usable and MUST NOT cause horizontal overflow at **375 / 768 / 1440** px | Rendered captures at all three widths at a HITL pause (D-4). **Disqualifier:** a capture taken at a viewport the browser did not actually apply is not evidence — confirm the applied width in the capture before recording it |
| **NFR-6** | The public map (`/map`) MUST behave identically after the FR-8 extraction | `npm test -- map` stays green **and** `/map` First Load JS stays at **112 kB** (M-3) |

## 5. Data & Schema Impact

**None.** No new entity, field, migration, or seed change. `gpsLatitude` / `gpsLongitude` already exist as `Decimal(10,7)` and are already publicly disclosed on the map projection. No change to `backend/src/common/pii-consent.policy.ts` or `role-aware.serializer.ts`, and therefore no new classification obligation.

## 6. Out of Scope

| Out | Why |
|---|---|
| "Use my current location" (browser Geolocation) | ATP-55 Option 1, deferred 2026-09-08. Note for the future: no `Permissions-Policy` header exists in `infra/` or `next.config` today, so nothing blocks it — a later `geolocation=()` would break it silently |
| Address / place search (geocoding) | Separate capability, separate service dependency |
| Google Maps | Root `CLAUDE.md` mandates Leaflet, already installed (`leaflet@^1.9.4`) |
| Making GPS required | Both forms keep GPS optional |
| Filling `gpsAltitude` / `gpsAccuracy` | A pin yields two numbers, not four |
| **Reconciling the C-2 validation divergence** between the two forms | Real, now documented, and a behaviour change to admin validation that this enhancement has no mandate to make. Raised as **OQ-3** |
| Any change to the public map page (`/map`) beyond the FR-8 constant extraction | Different surface. NFR-6 pins it in place |
| A test suite for `LeafletMap` itself | It has none today; adding one is a separate, larger piece of work than this spec's D-3 substitution |

## 7. Dependencies & Assumptions

- **No upstream spec dependency.** Not a member of any `family.md`; `Depends on: none` per the proposal.
- Precedents reused: `archive/2026-06-23-seed-map--discovery-map` (the `dynamic(… { ssr: false })` Leaflet pattern, and `ActorMap.tsx` as the reference wrapper) · `archive/2026-08-08-enhancement--searchable-region-select` (one control adopted into both forms).
- **Assumption:** the real-browser checks (D-3, and NFR-1b's network capture) use headless Chrome over CDP against the static export — the route ATP-57 used successfully in this repo, recorded in a dated `[2026-09-08]` docblock in `RegistrationForm.test.tsx`. **That precedent covers page/layout reads, not network interception** (a different CDP domain), so the transfer must be demonstrated when the task runs rather than assumed. If either route is unavailable, the gap escalates to the user rather than being downgraded to a jsdom assertion.
- No AWS resource change. The Dev API base URL used for §2.3's measurement came from `aws cloudformation describe-stacks --profile IBD-DEV`.

## 8. Open Questions

| ID | Question | Status |
|---|---|---|
| **OQ-1** | Eager vs. on-demand mount | **Closed by measurement.** M-2 (~44 kB gzip) against M-1 (113 kB) decides it: on-demand for `RegistrationForm`, eager for `ActorForm`. Now **FR-7** |
| **OQ-2** | What fraction of *self-registered* actors leave GPS blank? | **Open, and unmeasurable from here** (§2.3). The 0.2 % figure is the approved-actor population and does **not** answer it. Consequence if left open: this ships as insurance rather than repair — worth knowing before prioritising, not before building. Query provided in §2.3 |
| **OQ-3** | Should `ActorForm` adopt `RegistrationForm`'s both-or-neither pairing rule? | **Open, deliberately out of scope** (§6). Flagged because C-2 surfaced it, not because this spec should fix it |
| **OQ-4** | Fixed precision: which value ≤7? | **Closed.** 7 dp = the column scale exactly (~1.1 cm); 5 dp ≈ 1.1 m, well beyond pin-placement accuracy on a phone and far more readable in a number input. **Closed — fixed at 5** at the Phase 1 gate (user-confirmed 2026-09-08). See `design.md` DD-3 |

## 9. Requirement ID Index

| ID | Title | Gate(s) |
|---|---|---|
| FR-1 | Placing the pin writes both coordinate fields | D-1, D-2, D-3 |
| FR-2 | Existing coordinates place the pin when the form opens | D-1, D-2, D-3 |
| FR-3 | Typing in the fields moves the pin | D-1, D-2, D-3 |
| FR-4 | Clearing the point | D-1, D-2, D-7 |
| FR-5 | The manual inputs are unchanged and remain authoritative | D-7, D-8 |
| FR-6 | Written coordinates are rounded to a fixed precision | D-1 |
| FR-7 | `/register` does not pay for Leaflet until asked | **D-5b** (D-5a does not cover it) |
| FR-8 | Map constants become shared rather than duplicated | D-6, NFR-6 |
| NFR-1 | `/register` First Load JS ≤ **119 kB** (amended post-measurement at T-6) | D-5a |
| NFR-1b | Zero Leaflet/tile requests on `/register` load | D-5b (mutation-verified) |
| NFR-2 | Non-map path fully accessible | D-8 (partial; D-3 gap) |
| NFR-3 | Design tokens only | D-6 |
| NFR-4 | Coordinate logic testable without Leaflet | D-1 |
| NFR-5 | No overflow at 375 / 768 / 1440 | D-4 (substituted) |
| NFR-6 | `/map` unchanged after extraction | D-1, D-5a |
