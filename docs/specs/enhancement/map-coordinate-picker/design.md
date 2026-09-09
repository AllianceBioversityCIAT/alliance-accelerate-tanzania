# Design — Map Coordinate Picker

- Spec path: `docs/specs/enhancement/map-coordinate-picker/`
- Status: Approved
- Depth: **Standard**
- Traces requirements: FR-1…FR-8, NFR-1…NFR-6 from this spec's `requirements.md`
- Author / Date: Daniela Gómez / 2026-09-08

## 1. Executive Summary

Four modules, front-end only, no backend touched:

| Module | Kind | Why it exists |
|---|---|---|
| `frontend/lib/geo/coordinates.ts` | **Pure seam** — no React, no Leaflet | Every coordinate rule lives here so it is provable by ordinary unit tests (NFR-4). This is the whole answer to R1/R2 |
| `frontend/components/map/map-constants.ts` | **Extracted constants** | Tanzania center/bounds, OSM tile URL, OSM attribution — one definition, imported by both maps (FR-8) |
| `frontend/components/map/CoordinatePicker.tsx` | **Client wrapper**, imports no Leaflet | Owns the disclosure, the clear control, and the `dynamic(… ssr:false)` boundary. Testable in jsdom |
| `frontend/components/map/CoordinatePickerMap.tsx` | **Leaflet shell**, dynamic-import target | Marker lifecycle, drag/click wiring. Declared unevaluable in jsdom (D-3) |

Both forms then adopt `CoordinatePicker` in their Location section, differing in two props — `initiallyOpen` and `describedBy` (§7.5).

**The load-bearing design decision is the seam split (DD-1).** `LeafletMap.tsx` has no test file, and `ActorMap.test.tsx` mocks `next/dynamic` so the Leaflet layer never runs. For a map that only displays markers that is a tolerable gap; for a picker, the pin↔coordinate behaviour *is* the feature. Splitting it means the part that can be wrong is the part that is tested.

## 2. Finding: the gate FR-7 was given cannot fail (KZ-002)

**This was found during design, and it changes `requirements.md`.**

`requirements.md` originally gated FR-7 on NFR-1's `next build` route table. That gate does not discriminate the defect FR-7 exists to prevent.

| Evidence | Value |
|---|---|
| `/map` statically imports `ActorMap` and renders it with **no user gesture gating it** — the map appears as soon as actor data resolves. (`ActorMap` does hold `LeafletMap` behind loading/error/empty early returns, so "unconditional on mount" would overstate it; what matters for FR-7 is that nothing asks the person first) | `app/(public)/map/page.tsx`, `import ActorMap from '@/components/map/ActorMap'` |
| `/map` First Load JS | **112 kB (M-3)** — Leaflet excluded |

So a `dynamic(… { ssr: false })` child is kept out of **First Load JS** whether it is mounted eagerly or on demand. The route table would read identical for both, and would report green on the exact regression FR-7 forbids. A gate that cannot fail is not a gate.

**What the route table *does* prove**, and should still be run for: that the dynamic split is intact at all. A careless `import 'leaflet'` at the top of `CoordinatePicker.tsx` would move ~44 kB gzip into First Load JS and breach the ceiling unmistakably. That is a real, distinct defect (**D-5a**) and this gate catches it.

**What must be added** — a gate that *can* fail on eager mounting: a **real-browser network observation** on the built static export.

| | |
|---|---|
| **Gate** | Serve `frontend/out/`, load `/register` in headless Chrome over CDP, record every network request until load settles |
| **Pass** | Zero requests whose URL matches the Leaflet chunk, the Leaflet CSS file, or `tile.openstreetmap.org` |
| **Falsifying input** | Render `<CoordinatePicker initiallyOpen />` on `/register`. The chunk, the CSS, and tile images all appear. **This mutation must be run and shown to fail the gate before the gate is trusted** |
| **Precedent, and its limit** | Headless Chrome over CDP against the static export is proven in this repo — `RegistrationForm.test.tsx` carries a dated `[2026-09-08]` docblock recording a 375×667 scroll measurement under its `ATP-57` block. **That precedent covers page/layout reads, not network interception**, which is a different CDP domain. The transfer must be demonstrated when the task runs, not assumed; if network capture proves unavailable, escalate rather than substituting a weaker check |
| **Disqualifier** | If the capture records zero requests *of any kind*, the harness did not observe the page — that is an inconclusive run, not a pass |
| **Durability** | **One-time, execution-only — and this is a named gap, not an oversight.** The check runs during this spec's execution and its output is recorded verbatim; no browser test is committed, because this repo has no committed browser-test harness and adding one is out of scope here (user decision, 2026-09-08). **Residual risk, accepted and stated:** a later change that flips `/register` to mount the picker eagerly will **not** be caught by any automated gate — `D-5a` is structurally blind to it by the argument above. That risk sits beside D-3 and D-4 as a third declared gap, and is the strongest argument for the follow-up proposal in §13 |

**Correction applied to `requirements.md` in the same change** (Correction Closure): NFR-1 is now split into **NFR-1** (route table) and **NFR-1b** (network capture), the **D-5** row into **D-5a**/**D-5b**, and FR-7 scenario 1 names the network gate explicitly. Nothing else in the spec folder cited the old single-gate wording.

## 3. Architecture Overview

```
frontend/
├─ lib/geo/coordinates.ts              NEW  pure seam — no React, no Leaflet
├─ components/map/
│  ├─ map-constants.ts                 NEW  extracted from LeafletMap.tsx (FR-8)
│  ├─ LeafletMap.tsx                   EDIT deletes 4 private consts, imports them instead
│  ├─ CoordinatePicker.tsx             NEW  wrapper: disclosure + clear + dynamic boundary
│  └─ CoordinatePickerMap.tsx          NEW  Leaflet shell (lazy chunk)
├─ components/register/RegistrationForm.tsx   EDIT  Location section, initiallyOpen={false}
└─ components/admin/ActorForm.tsx             EDIT  Location fieldset, initiallyOpen
```

Data flow — the form is the single source of truth throughout:

```
form state (strings)  ──props──▶  CoordinatePicker  ──props──▶  CoordinatePickerMap
       ▲                                                              │
       └──────────── onChange(lat, lng) ◀── drag / click / clear ─────┘
```

There is no coordinate state inside the picker. The marker is a *projection* of the two form strings, recomputed on every prop change. That is what makes FR-3 ("the fields remain the source of truth") structural rather than a behaviour to be maintained.

## 4. Data Model Changes

**None.** No Prisma model, field, migration, seed, or backfill. `gpsLatitude` / `gpsLongitude` already exist as `Decimal(10,7)` and are already disclosed on the public map projection, so there is nothing to classify in `backend/src/common/pii-consent.policy.ts` and no change to `toPublicListItem` / `toPublicDetail` in `role-aware.serializer.ts`.

## 5. API Surface & Contracts

**None.** No endpoint added, changed, or called. The picker never talks to the API; it writes into form state that the existing submit path already carries.

## 6. Backend Design

**No backend change.** Existing server-side validation on `gpsLatitude` / `gpsLongitude` is untouched and remains the authoritative check — the picker's client-side rounding is a convenience, never a substitute.

## 7. Frontend Design

### 7.1 The seam — `lib/geo/coordinates.ts` (NFR-4, FR-6)

Pure functions over strings and numbers. Imports nothing from `leaflet`, `react`, or any component. This is the module the D-1 gate tests.

| Export | Responsibility | Requirement |
|---|---|---|
| `COORDINATE_PRECISION` | The single rounding constant — **5** (see DD-3) | FR-6 |
| `LATITUDE_RANGE`, `LONGITUDE_RANGE` | `[-90, 90]`, `[-180, 180]` — mirrors both forms' existing checks, does not replace them | FR-2 sc. 3 |
| `formatCoordinate(n)` | Number → the string written into a field, rounded to `COORDINATE_PRECISION` | FR-6 |
| `parseCoordinatePair(lat, lng)` | Two raw field strings → a point, **or `null`**. Returns `null` for blank, half-filled, non-numeric, and out-of-range — the four cases of FR-2 sc. 3, collapsed into one answer the shell cannot misread | FR-2, FR-3 |
| `isSamePoint(point, lat, lng)` | The redraw guard (DD-4) — compares the marker's position **numerically against `parseCoordinatePair(lat, lng)`**, at whatever precision those strings carry. Deliberately *not* a comparison at `COORDINATE_PRECISION`: that would report "different" forever for a hand-typed 7-dp value, which FR-6 forbids rounding | FR-1, FR-3 |

Deliberately **absent**: any function that mutates a field the person typed. `parseCoordinatePair` answers a question; it never repairs its input. That is what makes FR-2 sc. 3's *"leave the field values exactly as typed"* structural.

### 7.2 Extracted constants — `components/map/map-constants.ts` (FR-8)

`TANZANIA_CENTER`, `TANZANIA_BOUNDS`, `OSM_TILE_URL`, `OSM_ATTRIBUTION`, moved verbatim out of `LeafletMap.tsx`.

**Typed as plain tuples, not Leaflet's `L.LatLngExpression` / `L.LatLngBoundsExpression`** — note the two shapes differ: `TANZANIA_CENTER` is `readonly [number, number]`, while `TANZANIA_BOUNDS` is a pair of pairs, `readonly [readonly [number, number], readonly [number, number]]`. **Correction (T-2 review, 2026-09-08 — twice; read the second half, the first correction was also wrong).** An early draft claimed *"Leaflet's structural types would satisfy those positions anyway."* They do not: a `readonly` tuple is rejected, and `npx tsc --noEmit` produced `TS2322: The type 'readonly [number, number]' is 'readonly' and cannot be assigned to the mutable type 'LatLngTuple'` during T-2. **The first correction then asserted `L.LatLngTuple` is `[number, number]`. That is also false.** Read from the installed primary source — `frontend/node_modules/@types/leaflet/index.d.ts`, `@types/leaflet@1.9.21` — the declarations are:

```ts
export type LatLngTuple = [number, number, number?];      // line 164 — third element is optional altitude
export type LatLngExpression = LatLng | LatLngLiteral | LatLngTuple;
export type LatLngBoundsLiteral = LatLngTuple[];          // line 200 — an ARRAY, not a 2-tuple
export type LatLngBoundsExpression = LatLngBounds | LatLngBoundsLiteral;
```

What is true of `LatLngTuple`, and all that is needed here, is that it carries **no `readonly`** — which is why the assignment is rejected and why a consumer spreads at the call site (`[...TANZANIA_CENTER]`), as `LeafletMap.tsx` now does. Note also that the two exports fail **differently**: `TANZANIA_CENTER` against `LatLngTuple`, `TANZANIA_BOUNDS` against `LatLngBoundsLiteral` (`LatLngTuple[]`). They are not "the same error". Keeping the exports `readonly` remains correct and deliberate — it keeps this module importable by code that must not pull Leaflet in (its whole purpose), and protects shared values from consumer mutation — at the cost of one spread per call site. A later consumer that assigns one of these exports directly will meet the same **kind** of rejection; a consumer that spreads from the first line, which is what this note exists to produce, will meet none.

> **Why this correction is recorded in full rather than silently applied.** The arity error came from reading the compiler's message — which names the alias `LatLngTuple` without expanding it — and writing the inferred expansion as fact, without opening the `.d.ts`. That is the same mechanism as `judgment.md` **F-1** (a regex artefact read as a count) and it is the fourth KZ-008 instance in this spec. In both cases the fix was not more care; it was **opening the artefact**. `LeafletMap.tsx` deletes its four `const`s and imports instead — a pure extraction, no value changed, which is what NFR-6 pins.

### 7.3 `CoordinatePicker.tsx` — the wrapper (FR-4, FR-7)

Client component. **Imports no Leaflet**, directly or transitively, so it is fully renderable in jsdom and adds only its own few kB to whichever route mounts it.

Props:

| Prop | Type | Note |
|---|---|---|
| `latitude`, `longitude` | `string` | The raw form values, passed straight through |
| `onChange` | `(lat: string, lng: string) => void` | **The only write path.** Always a pair — see DD-2 |
| `initiallyOpen` | `boolean` | `false` in `RegistrationForm`, `true` in `ActorForm` (FR-7) |
| `disabled` | `boolean` | Mirrors each form's `submitting` |
| `describedBy` | `string \| undefined` | Lets `RegistrationForm` pass its existing `gpsHintId` so the picker joins the same description, per FR-5 |

Responsibilities:
- **Disclosure.** When closed, renders only a labelled reveal control and does **not** render `CoordinatePickerMap` — so the lazy chunk is never requested (FR-7 sc. 1). `initiallyOpen` seeds the open state; it is not a lock.
- **Both the reveal and clear controls are `components/ui/Button.tsx`** (`variant="secondary"`), which renders a real `<button type="button">` — so neither submits the form — and whose `BASE_CLASSES` already carry `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`. That is how NFR-2's *visible focus* clause is satisfied without new styling; the accessible name is the button's own text. `ButtonAsButton` spreads the full `<button>` prop set, so `disabled`, `aria-expanded`, and `aria-controls` pass straight through.
- **Clear control** (FR-4). Calls `onChange('', '')`. Rendered disabled — not hidden — when both fields are already blank, so the control does not appear and vanish as the person works (FR-4 sc. 2 permits either; disabled is the steadier layout).
- **The `dynamic()` boundary.** `dynamic(() => import('./CoordinatePickerMap'), { ssr: false, loading: … })`, following `ActorMap.tsx` exactly.

### 7.4 `CoordinatePickerMap.tsx` — the Leaflet shell (FR-1, FR-2, FR-3)

The only module importing `leaflet` and `leaflet/dist/leaflet.css`. Holds a map ref and a marker ref; holds **no coordinate state**.

| Trigger | Behaviour |
|---|---|
| Mount | Init map. `parseCoordinatePair` → point: create draggable marker there, center on it. `null`: no marker, center `TANZANIA_CENTER` at the Tanzania view (FR-2 sc. 1, 2) |
| `latitude` / `longitude` prop change | Re-parse. `null` → remove the marker. Point → if `isSamePoint`, do nothing (DD-4); else move the marker and pan (FR-3) |
| Marker `dragend` | `onChange(formatCoordinate(lat), formatCoordinate(lng))` (FR-1 sc. 1) |
| Map `click` | Same call. If no marker exists, one is created (FR-1 sc. 2) |
| Unmount | `map.remove()` — same lifecycle discipline as `LeafletMap` |

**Marker styling** follows `LeafletMap`'s established purge-proof pattern: an `L.divIcon` whose inline style references CSS custom properties (`var(--color-primary)`, `var(--color-surface)`, `var(--shadow-sm)`), never a Tailwind class (runtime-injected HTML is not scanned by Tailwind) and never a hex (NFR-3).

**Container:** fixed-height, `border border-border rounded-md overflow-hidden`. Per `frontend/CLAUDE.md`, a `border`, not a shadow, is what carries a section boundary — `--color-surface` on `--color-bg` is only 1.05:1. Height comes from Tailwind spacing scale, not an arbitrary value.

### 7.5 Adoption in the two forms (FR-5)

Both keep the card-wrapping-`div` + semantic-only `<fieldset>` shape mandated by `frontend/CLAUDE.md`. The picker is inserted **inside the existing Location fieldset, adjacent to the coordinate inputs** — not replacing them, not wrapping them.

| | `RegistrationForm` | `ActorForm` |
|---|---|---|
| Mount | `initiallyOpen={false}` — reveal control (FR-7) | `initiallyOpen` — eager |
| `describedBy` | its existing `gpsHintId` | none (that form has no shared GPS paragraph) |
| Untouched | `renderInput('gpsLatitude'…)`, `renderInput('gpsLongitude'…)`, `validate()`, `buildPayload` | the same — but the payload builder here is **`buildDto`**, not `buildPayload` — plus `gpsAltitude` / `gpsAccuracy` stay manual |
| `onChange` wiring | two `setField` calls — the existing per-field write path, so existing error-clearing applies unchanged | same |

Neither form's `validate()` is edited. The C-2 divergence (`ActorForm` has no both-or-neither rule) is preserved exactly as found; see OQ-3.

## 8. Design Decisions

### DD-1: Split the picker into a pure seam and a Leaflet shell
- **Context.** Leaflet has zero test coverage in this repo (`LeafletMap.tsx` has no test file; `ActorMap.test.tsx` mocks `next/dynamic`). Building the picker as one component would leave the pin↔coordinate logic — the actual feature — unproven while the suite stayed green.
- **Options.** (a) One component, mock Leaflet in tests. (b) Seam + shell. (c) Build it untested and rely on manual QA.
- **Decision.** (b).
- **Consequences.** Every coordinate rule is a pure function with real unit tests. What remains unprovable in jsdom shrinks to marker lifecycle and event wiring — declared as D-3, substituted with a real-browser check. (a) is rejected explicitly by NFR-4: a test needing `jest.mock('leaflet')` to run has *failed* that requirement, not satisfied it. **KZ-002.**

### DD-2: One write path, and it always writes a pair
- **Context.** FR-1 requires both fields written together; FR-4 requires both cleared together. Half-filled pairs are a legal state in `ActorForm` and an error state in `RegistrationForm` (C-2).
- **Options.** (a) `onLatitudeChange` + `onLongitudeChange` + `onClear`. (b) A single `onChange(lat, lng)`, with clear expressed as `onChange('', '')`.
- **Decision.** (b).
- **Consequences.** Writing one field without the other is not expressible in the component's API, so FR-1's *"never one alone"* and FR-4's *"clear both"* hold by construction rather than by discipline. Two fewer props (three write-props collapse to one). The cost: `onChange('', '')` is slightly less self-describing than a named `onClear` — accepted, and the call site is one line in each form.

### DD-3: Round to 5 decimal places
- **Context.** A pin drag yields ~13 decimals; the column is `Decimal(10,7)`, so *something* rounds. FR-6 requires ≤7.
- **Options.** 7 dp (~1.1 cm, the column scale exactly) · 6 dp (~11 cm) · 5 dp (~1.1 m).
- **Decision.** **5**, in one exported constant.
- **Consequences.** 1.1 m is far finer than anyone can place a pin on a phone-sized map, and `-6.81235` is legible in a number input where `-6.8123457` is not. Any value ≤7 round-trips losslessly through the column, so nothing is lost that the database would have kept.
- **Corrected claim (judgment ledger F-1).** An earlier draft argued this "matches the corpus" because *"existing seed data sits at 5–6 dp."* **That was false.** `backend/prisma/seed-data.ts` carries **28** coordinate values (14 actor lat/lng pairs) at a maximum of **4 dp** — 20 at 4 dp, 4 at 3 dp, 3 at 2 dp, 1 at 1 dp — and **none** at 5 or 6. The 5–6 dp figure came from the **imported Dev corpus** observed via the public API, not from the seed file the sentence named — an assertion about an artefact that does not bear it (KZ-008), in a spec that cites KZ-011 by name. The corpus argument is withdrawn; DD-3 rests on the precision and legibility rationale above, which is independent and unaffected. Reversible: one constant. *(User-confirmed at the Phase 1 gate.)*

### DD-4: Guard the two-way binding by comparing at written precision
- **Context.** Pin writes fields → fields are props → props re-place the pin. Without a guard this is a loop, and with a naive float compare it never settles, because the value written back is rounded and the marker's own position is not.
- **Decision.** `isSamePoint(markerPos, latString, lngString)` compares the marker's position **numerically** against `parseCoordinatePair(latString, lngString)`. Equal → the effect does nothing.
- **Consequences.** It settles in one pass on **both** paths, because placement always sets the marker to exactly the parsed value:
  - *Picker-written.* Drag leaves the marker at ~13 dp; `onChange` writes 5-dp strings; the effect re-parses, finds the marker ≠ the parsed value, and snaps it to exactly `-6.81235`. The next run compares equal and does nothing.
  - *Hand-typed.* A 7-dp value the person typed is placed verbatim, so the marker already equals the parsed value and the guard reports equal immediately — no redundant redraw, and the typed string is never rewritten (FR-3 sc. 1).
  An earlier draft compared at `COORDINATE_PRECISION` instead; that reports "different" forever for any value carrying more than 5 decimals, which FR-6 explicitly permits a person to type. Both judges caught it (judgment ledger **F-3**).
  Because the comparison is a pure function it is unit-testable **without Leaflet** — precisely the class of bug jsdom could otherwise never catch, since drag jitter and marker snap-back are invisible to every automated gate this repo has.

### DD-5: Extract the constants rather than duplicate or flag them
- **Context.** The four map constants are module-private in `LeafletMap.tsx` (C-1 — the proposal claimed otherwise).
- **Options.** (a) Duplicate them in the picker. (b) Add a `pickerMode` flag to `LeafletMap` (proposal Option B). (c) Extract to a shared module.
- **Decision.** (c).
- **Consequences.** One definition of the OSM attribution across two public tile surfaces — duplication here is an attribution-compliance risk, not just untidiness. (b) is rejected: `LeafletMap` exists to plot many actors with role colours, popups and a legend; a picker needs one draggable marker, and a mode flag would tie the public map's lifecycle to form internals. (c) costs one edit to `LeafletMap.tsx`, pinned by NFR-6.

### DD-6: No TRD ADR is allocated
- **Context.** `CLAUDE.md`'s concurrency corollary requires checking unmerged branches before taking an ADR number, because ADR-011 was allocated twice and cost a 14-citation sweep.
- **Decision.** This spec allocates **no** ADR number. It introduces no new module or service, no integration, no persistence or communication-topology change, and its only NFR impact is one route's bundle — none of the triggers for an architecturally-significant decision.
- **Consequences.** Nothing to collide with; the shared counter is not touched. DD-1…DD-5 (the design decisions proper — DD-6 is a process decision about numbering, not a design choice) are local to this spec.

### Step 2.3 — Reversion challenge: not triggered
No design decision removes, disables, or inverts already-delivered behaviour. DD-5 relocates constants without changing a value (NFR-6 pins the public map's behaviour byte-identical); §2 *adds* a gate rather than dropping one; the forms' `validate()` and payload builders are explicitly untouched (FR-5). Recorded rather than skipped silently.

## 9. Risks & Mitigations

| ID | Risk | Mitigation | State |
|---|---|---|---|
| **R1** | Leaflet has zero coverage here, so the picker inherits none | DD-1 seam split; D-3 real-browser substitute | Designed |
| **R2** | jsdom cannot evaluate drag, marker position, or map fit | Declared unevaluable gap (D-3), never asserted by a jsdom test | Accepted, declared |
| **R3** | Bundle cost on the mobile-first registration form | **Measured**: ~44 kB gzip (M-2) vs 113 kB (M-1) → FR-7 disclosure, gated by §2's network check | Closed by measurement |
| **R4** | Two very high-traffic files; KZ-010 is the repo's most-recurrent lesson | Re-run at specify time: **clear** (M-5). Re-run again before execution starts, not read from here | Clear on 2026-09-08 |
| **R5** | A second OSM tile surface on a public form increases tile load | The disclosure means `/register` requests **zero** tiles until a person asks for the map — the same decision that closes R3. Attribution shared via DD-5 | Mitigated by FR-7 |
| **R6** | *New.* The `/register` layout at 375 px — a map inside an already-dense form. Lint, build and contrast are all blind to this, and this exact class shipped to Dev green once (`frontend/CLAUDE.md`) | D-4: rendered captures at 375/768/1440 at a HITL pause, never a jsdom assertion | Declared gap |

## 10. Test Plan Outline

| Layer | Covers | Command |
|---|---|---|
| Seam unit tests — `lib/geo/coordinates.test.ts` | FR-2 sc. 3 (all four `null` cases), FR-6 (rounding, round-trip stability), DD-4 (`isSamePoint`) | `cd frontend && npm test -- coordinates` |
| Wrapper component tests — `CoordinatePicker.test.tsx`, Leaflet shell replaced by a **recording stub** | FR-4 (clear writes both blank, disabled when nothing to clear), FR-7 sc. 1–2 (shell not rendered while closed; rendered after reveal), prop pass-through | `cd frontend && npm test -- CoordinatePicker` |
| Form suites — existing `RegistrationForm.test.tsx`, `ActorForm.test.tsx` | FR-5 (inputs, validation, error wiring, `aria-describedby` unchanged), FR-1 sc. 3, NFR-2 via `jest-axe` | `cd frontend && npm test -- RegistrationForm ActorForm` |
| Build gate | **D-5a** / NFR-1 (dynamic split intact, `/register` ≤ 119 kB — amended post-measurement at T-6, was 116 — `/map` still 112 kB) | `cd frontend && npm run build` |
| **Real-browser network check** | **D-5b** / **NFR-1b** — FR-7 (§2), the gate that *can* fail on eager mounting | CDP over the static export; mutation-verified first. **One-time, not committed** — see §2 *Durability* and §13 |
| **Rendered captures** | NFR-5 / D-4 at 375 / 768 / 1440 | HITL pause |

Explicitly **not** written: any test asserting marker position, drag behaviour, or map fit in jsdom. Those are D-3, and a jsdom test claiming them would be the KZ-002 defect this spec is built to avoid.

## 11. Budget (Step 2.4 — the tripwire for `/akili-execute`)

| Metric | Expected |
|---|---|
| **Tasks** | **7** |
| **LOC** | **RETIRED as a tripwire — 2026-09-08, T-4 gate, user-approved.** History: 620 (Phase 2) → 635 (Phase 3) → ~900 (T-3 gate) → **retired**. Actuals: T-1 261/170 · T-2 63/35 · T-3 327/135 · T-4 314/190 — **965 lines against the ~900 it had just been raised to.** **A tripwire raised twice without any scope change is not measuring the thing it was meant to protect.** The task count never moved (7), no requirement grew, and the entire overrun is documentation — the same documentation that caught two defects no test could see (`isSamePoint`'s normalization contract, the 0×0 container). LOC was a reasonable proxy before execution; four tasks of evidence say the real cost here is **review rounds**, which remain a live gate. Recorded rather than raised a third time. |
| **Review rounds** | **16** — re-baselined 2026-09-08 after T-2, user-approved. The original **9** assumed reviews audit *code*. Measured across T-1 and T-2: **7 rounds, 6 of them spent on the accuracy of prose rather than the correctness of code** — T-2's code was accepted on attempt 1 and never changed again, while three rounds went into one docblock. Every FAIL was legitimate (a false claim in a module written to be read by the next implementer is a real defect, and one of them was caught before T-3 could inherit it), so the discipline is not the problem — the estimate was. LOC and task count both held: 323 of 635 at 2/7 tasks, so T-1's overrun was the test-dense outlier it looked like, not a uniform underestimate. |

Sized against the finished design, not the Phase 0 guess, then reconciled against the actual decomposition, then **re-baselined once in flight on measured evidence** (rounds only — see the row above) (KZ-005 — a figure that contradicts a sibling document's prose is a defect detectable without re-measuring). The estimate matches **Standard** depth — no re-scoping recommended. `/akili-execute` must **stop and escalate** rather than continue past any of these three numbers.

## 12. PR Strategy

At 965 lines across T-1…T-4 alone (measured; the Phase-3 estimate was 635), the work is far above the ~400 line where a single PR stops being reviewable. Two PRs, at the seam the design already draws:

| PR | Contents | Review focus |
|---|---|---|
| **PR 1 — the picker** | `lib/geo/coordinates.ts` + tests, `map-constants.ts`, `LeafletMap.tsx` extraction, `CoordinatePicker.tsx` + `CoordinatePickerMap.tsx` + tests | The coordinate rules and the seam boundary. Nothing user-visible changes yet — the public map must be byte-identical (NFR-6) |
| **PR 2 — adoption** | Both form edits, the network gate, the rendered captures | That the two forms are otherwise untouched (FR-5); **the `npm run build` route table (D-5a / NFR-1)** — PR 2 is where the picker is first mounted, so it is the first PR in which a stray top-level `import 'leaflet'` could move weight into `/register`; and the three substituted/declared gaps (D-3, D-4, NFR-1b's durability) |

PR 1 ships dead code deliberately: it is the half that can be reviewed on logic alone, before any user-facing surface moves. PR 2's description should link back to PR 1 and state that the coordinate rules were reviewed there and are out of scope for it.

## 13. Follow-up worth proposing separately

Three of this spec's checks — **D-3** (Leaflet interaction), **D-4** (layout at 375/768/1440) and **NFR-1b** (no Leaflet requests on `/register`) — are all verified by driving a real browser, and all three are one-time. That is the right call for this spec (the repo has no committed browser-test harness, and building one here would roughly double the budget), but it means three declared gaps accumulate in one enhancement.

A committed browser-test harness would close all three at once and would pay for itself across the map surfaces generally. Recommended as its own `/akili-propose`, not folded in here. Recorded so the accumulation is visible rather than implicit.
