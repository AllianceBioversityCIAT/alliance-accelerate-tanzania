# Proposal — Map Coordinate Picker

## Document Control

| Field | Value |
|---|---|
| Spec path | `enhancement/map-coordinate-picker` |
| Slug | `map-coordinate-picker` — derived from the free-text argument (ATP-55, Option 2 only) |
| Type | **Change** |
| Approval Mode | `gated` |
| Source | Jira **ATP-55**, scoped by the product owner on 2026-09-08 to Option 2 only |
| Depends on | none |
| Parallel-safe | **yes** — touches two form components and adds one new one; no shared module, migration, or API contract |
| Author | Daniela Gómez |
| Date | 2026-09-08 |

## Intent

Let a person set an actor's location by placing a pin on a map, instead of typing two decimal numbers they do not know.

## Problem / Current Behavior

Both forms that capture location ask for raw decimal coordinates in two numeric inputs:

| Form | Field render | Helper text |
|---|---|---|
| `RegistrationForm` (public self-registration) | `renderInput('gpsLatitude', …, 'number', …)` | *"Decimal between -90 and 90"* |
| `ActorForm` (admin) | same pattern, in the `Location` fieldset | same |

GPS is **optional** — `validate()` in `RegistrationForm` accepts both fields blank and range-checks them only when both are present ("enter both coordinates, or leave both blank"). So the likely failure is not a wrong coordinate; it is **no coordinate at all**.

That matters because the map is a headline deliverable: PRD **AC-3** plots a marker for every actor with valid `gpsLatitude`/`gpsLongitude`. An actor who self-registers without coordinates is absent from it.

There is also no way to *see* a wrong coordinate. An admin looking at `-6.8` / `39.2` in two number inputs cannot tell that the pin lands in the sea.

> **Unmeasured, and it should be measured before specifying.** How often self-registered actors actually leave GPS blank is not known. The committed seed (`backend/prisma/seed-data.ts`) is 15 curated records with coordinates on all of them — a demo fixture, not evidence either way. **Measure it** by counting `gpsLatitude IS NULL` among `Actor` rows with `registrationSource = SELF_REGISTERED` in Dev. If the rate is low, this change is a nice-to-have; if it is high, it is the difference between a populated map and an empty one. (KZ-011 — do not reason about reality that can be measured.)

## Proposed Outcome

- A person setting a location drags a pin on a small embedded map, and the coordinate fields fill in as they do.
- A record that already has coordinates opens with its pin already placed, so a wrong one is visible at a glance and correctable by dragging.
- The manual number fields stay present, editable, and authoritative — the picker writes into them, it does not replace them.

## Scope

| In | Notes |
|---|---|
| One new component — a Leaflet pin picker | Single draggable marker; click on the map also moves it |
| Pin → fields | Moving the pin writes `gpsLatitude` / `gpsLongitude` |
| Fields → pin | Existing values place the pin when the form opens; typing in the fields moves it |
| Adopted in `RegistrationForm` and `ActorForm` | The same component in both |
| Existing validation unchanged | Range checks and the both-or-neither pairing rule keep working, on the same fields |
| A way to clear the point | Returning both fields to blank, since blank is a valid state |

## Non-Goals

| Out | Why |
|---|---|
| "Use my current location" (browser Geolocation) | ATP-55 Option 1 — deferred by the product owner on 2026-09-08. Worth noting: **nothing blocks it today** — there is no `Permissions-Policy` header anywhere in `infra/` or `next.config` (verified 2026-09-08). A future `geolocation=()` would break it silently |
| Google Maps | `CLAUDE.md` mandates Leaflet, which is already installed (`leaflet@^1.9.4`) and already in use |
| Address / place search (geocoding) | A separate capability with its own service dependency |
| Making GPS required | The both-or-neither optional rule is unchanged |
| Filling `gpsAltitude` / `gpsAccuracy` | The admin form has four GPS fields; a map pin produces only two. The other two stay manual |
| Any change to the public map (`/map`) | Different surface, different component |

## Affected Users, Systems, And Specs

| Area | Impact |
|---|---|
| Public applicants (mobile-first) | Primary beneficiary — see Risk R3, this is also where the cost lands |
| Admin / staff | Can see and visually correct a wrong coordinate |
| `frontend/components/register/RegistrationForm.tsx` | Adopts the picker in its Location section |
| `frontend/components/admin/ActorForm.tsx` | Adopts the picker in its `Location` fieldset |
| `frontend/components/map/` | Source of the reusable constants (Tanzania center, OSM tile URL + attribution) — **not** modified |
| Backend / schema / API | **None.** No new field, no migration, no contract change |
| Related specs (all archived) | `archive/2026-08-08-enhancement--searchable-region-select` — the precedent: one control adopted into both forms · `archive/2026-06-23-seed-map--discovery-map` — the Leaflet + static-export pattern this reuses |

## Visual Reference

- **Source:** None
- **Location:** —
- **Notes:** No Figma or mockup supplied. The pattern (small map, one draggable pin, coordinates below) is conventional enough to specify without one, but a mockup would settle **OQ-1** — whether the map is always visible or opens behind a disclosure — which is a layout decision with real mobile cost. Offer a `stitch-design` mockup of the Location section in both forms at `/akili-specify` time if that question stays open.

## Requirement Delta Preview

### ADDED

- A map control in the Location section of both forms, with a single draggable pin.
- Two-way binding between the pin and the existing coordinate fields.
- A pin pre-placed from existing values when a record opens.
- A way to clear the placed point back to blank.

### MODIFIED

- The Location section of both forms gains the control. The coordinate inputs themselves keep their labels, types, helper text, validation, and error wiring.

### REMOVED

- Nothing.

## Approach Options

| | Option | Trade-off |
|---|---|---|
| **A** | **New `CoordinatePicker` component**, dynamic-imported with `ssr: false`, sharing the tile URL / attribution / Tanzania center constants with the existing map | One more component, but the public map stays untouched and the picker owns only what a picker needs |
| **B** | **Add a "picker mode" to the existing `LeafletMap`** | Looks like reuse, is coupling. `LeafletMap` exists to plot many actors with role colours, popups, and a legend; a picker needs one draggable marker. A mode flag would tie the public map's lifecycle to form internals and put two unrelated reasons to change in one file |
| **C** | **Admin form first, registration later** | Halves the first slice and lands the "see the wrong pin" value where correction happens. But the applicant-side blank-coordinate problem is the one that empties the map, and the component is the same either way — so this splits delivery without reducing the work |

## Recommended Approach

**Option A**, with one design constraint that should be settled in the spec rather than discovered in review:

> **The coordinate logic must be testable without Leaflet.**

This is not a preference. Measured on 2026-09-08: **`LeafletMap.tsx` has no test file**, and `ActorMap.test.tsx` mocks `next/dynamic` so the Leaflet layer is replaced by a stub and never runs. For a map that only *displays* markers, that is a tolerable gap. For a picker, the pin-to-coordinate behaviour **is** the feature — mocking Leaflet away would leave the whole thing unproven while the suite stayed green, which is exactly KZ-002.

So the component should split:

| Part | What it is | How it is proven |
|---|---|---|
| Coordinate seam | Pure functions / callbacks: `latlng → field strings`, `field strings → latlng or none`, rounding, out-of-range and blank handling | Ordinary unit tests, no Leaflet, mutation-verifiable |
| Leaflet shell | Marker creation, drag and click wiring, lifecycle | Real-browser check; **declared as an unevaluable gap in jsdom**, per KZ-002 / KZ-013 — never asserted by a test that cannot fail |

There is a working precedent for the browser half in this repo as of 2026-09-08: the ATP-57 scroll behaviour was verified by driving headless Chrome over CDP against the static export, and the numbers were recorded in the test's docblock instead of being claimed by an assertion jsdom cannot evaluate.

## Risks, Dependencies, And Open Questions

| ID | Risk | Mitigation |
|---|---|---|
| **R1** | Leaflet is entirely untested here (measured — see above), so a picker built on it inherits zero existing coverage | The seam split in Recommended Approach |
| **R2** | jsdom has no layout engine, so drag, pin position, and map fit cannot be asserted | Declare the gap explicitly; verify in a real browser and record the measurement |
| **R3** | **Bundle cost on the mobile-first registration form.** `/register` is currently 7.43 kB / 113 kB first load (measured, `next build`, 2026-09-08) and does **not** load Leaflet today. Self-registration is the primary mobile channel, on Tanzanian networks | `ssr: false` dynamic import only helps if the picker is not mounted eagerly — this is what makes **OQ-1** a real question, not a styling preference |
| **R4** | Two very high-traffic files; KZ-010 is the repo's most-recurrent lesson | **Currently clear** — PRs #59 and #60 are merged and no PRs are open (verified 2026-09-08). Re-run the check at `/akili-specify` time, not from this document |
| **R5** | A second OSM tile surface, now on a public form rather than one map page, increases tile requests against OSM's usage policy | Attribution is already handled in the existing map; confirm the added load is acceptable, or lazy-mount (**OQ-1** again) |

| ID | Open question | Why it matters |
|---|---|---|
| **OQ-1** | Does the map render eagerly in the Location section, or behind a "Set on map" disclosure that mounts it on demand? | Decides R3 and R5. Recommend the disclosure for `RegistrationForm` (mobile, cost-sensitive) and eager for `ActorForm` (desktop, and seeing a wrong pin without clicking is the point) |
| **OQ-2** | What fraction of self-registered actors actually have blank GPS? | Decides whether this is important or merely nice. Measurable today — see Problem |
| **OQ-3** | Round the written coordinates to a fixed precision? | A pin drag yields ~13 decimals. The column is `Decimal(10,7)`, so a value must be reduced to 7 decimals somewhere — better in the picker, deliberately, than silently at the database |

**Resolved before specifying — not an open question:** accessibility. The manual number inputs remain present and editable, so the keyboard and screen-reader path already exists and is unchanged; the map is an enhancement layered beside it, not the only way in. This satisfies ATP-55's "non-map fallback" criterion by construction.

## Success Criteria

- A person can set an actor's location in both forms without typing a coordinate.
- A record with existing coordinates opens with its pin already on the map.
- Moving the pin updates the fields, and editing the fields moves the pin.
- The point can be cleared back to blank, and blank still submits.
- Existing range and both-or-neither validation behave exactly as they do today.
- The coordinate logic has tests that fail when it breaks; the Leaflet interaction has a recorded real-browser verification and a declared jsdom gap.
- No hardcoded colours or geometry — tokens per `docs/ux-ui/design.md` §7.
- `/register` first-load cost is measured after the change and consciously accepted (R3).

## Next Step

```text
/akili-specify enhancement/map-coordinate-picker
```
