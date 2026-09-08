# Tasks — Map Coordinate Picker

- Spec path: `docs/specs/enhancement/map-coordinate-picker/`
- Status: Approved
- Depth: **Standard** · Budget: **7 tasks · ~635 LOC · 9 review rounds** (`design.md` §11)
- Traces: `requirements.md` FR-1…FR-8, NFR-1…NFR-6 · `design.md` §3–§12
- Design reviewed: `judgment.md` — **JUDGMENT: APPROVED ✅** (2 fix rounds, 1 scoped re-judgment)

## Reading order

`T-1` and `T-2` are independent and may run in parallel. Everything else is a chain. **PR 1 = T-1…T-4** (no user-visible change). **PR 2 = T-5…T-7**.

```
T-1 (seam) ─┬─→ T-3 (Leaflet shell) ──→ T-4 (wrapper) ─┬─→ T-5 (ActorForm) ──┬─→ T-7 (browser gates)
T-2 (consts)┘                                          └─→ T-6 (RegForm) ────┘
```

A task is eligible when its status is `[ ]`/`[~]` and every dependency is `[x]`.

---

## Tasks

- [x] **T-1  Coordinate seam — `lib/geo/coordinates.ts` + unit tests**  (deps: none)
      **Size:** ~170 LOC (60 prod / 110 test) · **Skills:** `tdd` (Leader-assigned — this is the logic-heavy task the skill earns its cost on), `systematic-debugging` if a case resists
      **Scope:** Pure module. Exports `COORDINATE_PRECISION = 5`, `LATITUDE_RANGE`, `LONGITUDE_RANGE`, `formatCoordinate`, `parseCoordinatePair`, `isSamePoint`. **Imports nothing from `leaflet`, `react`, or any component.**
      **Traces:** FR-6 (all clauses) · FR-2 sc. 3 · FR-3 sc. 1 (byte-for-byte round trip) · NFR-4 · `design.md` §7.1, DD-3, DD-4
      **Files:** `frontend/lib/geo/coordinates.ts`, `frontend/lib/geo/coordinates.test.ts`
      **Verify:** `cd frontend && npm test -- coordinates`
      **Falsifying input (the check MUST be able to fail) — one per clause, each demonstrated, not predicted:**
      - `COORDINATE_PRECISION` 5 → 6 → the **rounding** cases redden. ⚠️ **Corrected 2026-09-08 (T-1 review, Reviewer issue 2):** this task originally claimed the same mutation also reddens the round-trip case. **It does not.** `format → parse → format` is *stability*, which is precision-invariant by construction — the round-trip test stays green at any precision. A falsifier that cannot fail the clause it is assigned to is the KZ-002 defect in the work order itself.
      - **round-trip** needs its own mutation: make `parseCoordinatePair` round its output (e.g. `Number(lat.toFixed(4))`), or make `formatCoordinate` non-idempotent → the round-trip case reddens. **Known property, recorded after the T-1 review:** this clause has no *uniquely*-killing mutation — it is entailed by the two clauses either side of it (format rounds to 5; parse never rounds), so every natural falsifier reddens a neighbour too. That is a property of the design, not a gap. Do not chase isolation here.
      - `parseCoordinatePair` returns a point for `lat=91` → the out-of-range case reddens.
      - `isSamePoint` compares via `formatCoordinate` instead of the parsed value → the hand-typed-7-dp case reddens (the **F-3** defect the design judges caught).
      - **drop either conjunct** from `isSamePoint`'s two-axis comparison → the corresponding single-axis test reddens. A suite in which `return point.lat === parsed.lat` alone passes has not covered DD-4.
      **Disqualifies the evidence:** a test file that imports `leaflet` (even type-only at runtime), mocks it, or mounts a form has **failed NFR-4**, not satisfied it — report it rather than passing. A green run whose test names do not include the four `null` cases of FR-2 sc. 3 individually is not coverage of that scenario.
      **Done when:** all six exports behave per §7.1; every FR-2 sc. 3 case (blank, half-filled, non-numeric, out-of-range) has its own named test; FR-6's round-trip stability and the "never round a typed value" clause each have a named test **and a demonstrated falsifier**; `isSamePoint` has named tests for the picker-written path, the hand-typed path, **and each axis varying alone**.

- [x] **T-2  Extract map constants — `components/map/map-constants.ts`**  (deps: none)
      **Size:** ~35 LOC · **Skills:** none beyond the repo conventions
      **Scope:** Move `TANZANIA_CENTER`, `TANZANIA_BOUNDS`, `OSM_TILE_URL`, `OSM_ATTRIBUTION` out of `LeafletMap.tsx` into a new module and import them back. **Values change by zero bytes.** Types are the two distinct tuple shapes from `design.md` §7.2 — `readonly [number, number]` for the center, `readonly [readonly [number, number], readonly [number, number]]` for the bounds.
      **Traces:** FR-8 (both clauses) · NFR-6 · `design.md` §7.2, DD-5
      **Files:** `frontend/components/map/map-constants.ts` (new), `frontend/components/map/LeafletMap.tsx` (edit)
      **Verify:** `cd frontend && npm test -- map && npm run build`
      **Falsifying input:** alter any extracted value (e.g. shift `TANZANIA_CENTER` by a degree) → the map suite and/or the rendered view diverge. Add a `pickerMode` prop to `LeafletMap` → violates FR-8's `BUT` clause; caught by review, **not** by any command — stated here so the Implementer knows it is unguarded.
      **Disqualifies the evidence:** `/map` First Load JS moving off **112 kB** (M-3) means the extraction changed the module graph, not just its shape — inconclusive, investigate rather than pass.
      **Done when:** the four constants exist in exactly one module; `LeafletMap.tsx` declares none of them; `/map` still builds at 112 kB; the map suite is green.
      **What this cannot prove:** that the public map still *looks* right. Extraction is byte-for-byte on values, but no automated gate renders `/map` — a glance at it during T-7's captures is the cheapest cover.

- [ ] **T-3  Leaflet shell — `components/map/CoordinatePickerMap.tsx`**  (deps: T-1, T-2)
      **Size:** ~135 LOC · **Skills:** `vercel-react-best-practices` (effect/ref lifecycle), `tailwind-design-system` (token discipline)
      **Scope:** The only module importing `leaflet` / `leaflet/dist/leaflet.css`. Map + marker refs, **no coordinate state**. Mount, prop-change, `dragend`, map `click`, unmount per `design.md` §7.4. Marker is an `L.divIcon` whose inline style uses `var(--token)` references only — the purge-proof pattern `LeafletMap.buildDivIcon` already establishes.
      **Traces:** FR-1 sc. 1 + sc. 2 · FR-2 sc. 1 + sc. 2 + sc. 3 · FR-3 sc. 1 + sc. 2 · NFR-3 · `design.md` §7.4, DD-4
      **Files:** `frontend/components/map/CoordinatePickerMap.tsx`
      **Verify:** `cd frontend && npm run build && npm run lint` **plus** `grep -nE '#[0-9a-fA-F]{3,8}|rgb\(|bg-\[' frontend/components/map/CoordinatePickerMap.tsx` returning nothing.
      ⚠️ **Corrected 2026-09-08 (T-2 review, Reviewer advisory 2 — a gate that could not run).** This line previously read `npx eslint "…" --quiet`. **That command cannot start in `frontend/`:** the package has no `eslint.config.*` flat config, only the legacy `.eslintrc.json`, against `eslint@^9`. Measured — `npx eslint components/map/LeafletMap.tsx --quiet` returns *"ESLint couldn't find an eslint.config.(js|mjs|cjs) file."* `npm run lint` is `next lint`, which shims the legacy config and **does not** mutate files, so the backend `--fix` hazard that motivates the `npx` form does not exist here. A gate that cannot run cannot fail — the third instance of that class this spec has produced in a *verification line*, and the reason the Leader now measures every Verify command before a task starts.
      **Falsifying input:** insert a literal `#1F4E8C` into the divIcon style → the grep reddens (run it *with* the hex first to prove the gate discriminates — KZ-002).
      **Disqualifies the evidence — read this before reporting:** **there is no automated gate for this task's actual behaviour.** jsdom has no layout engine and cannot evaluate marker creation, drag, click wiring, or map fit (**D-3**). The build and grep prove only that the file compiles and uses tokens. **Do NOT write a jsdom test asserting marker position, drag, or map fit** — such a test cannot fail and would be the KZ-002 defect this spec exists to avoid. Report the behaviour as **unverified pending T-7**, which is a legitimate, expected outcome for this task.
      **Done when:** compiles, lints, token-clean, and every FR-1/FR-2/FR-3 clause it owns is either exercised by T-4's recording stub **or** listed by the Implementer as a D-3 gap to be closed in T-7 — each clause gets (A) a reddening test or (B) a declared gap, per KZ-013. No third option.

- [ ] **T-4  Wrapper — `components/map/CoordinatePicker.tsx` + tests**  (deps: T-3)
      **Size:** ~190 LOC (105 prod / 85 test) · **Skills:** `vercel-react-best-practices`, `ui-ux-pro-max` (disclosure + clear affordance), `react-doctor` before reporting
      **Scope:** Client component importing **no Leaflet**. Props per `design.md` §7.3. Owns the disclosure (`initiallyOpen` seeds open state), the clear control, and the `dynamic(() => import('./CoordinatePickerMap'), { ssr: false, loading })` boundary. Reveal and clear are `components/ui/Button.tsx` `variant="secondary"` — a real `<button type="button">` that cannot submit the form, already carrying `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`. Tests replace the shell with a **recording stub** exposing received props/callbacks.
      **Traces:** FR-4 sc. 1 + sc. 2 · FR-7 sc. 1 (shell not rendered while closed) + sc. 2 · FR-1 sc. 1 "never one alone" · NFR-2 (control names + focus) · `design.md` §7.3, DD-2
      **Files:** `frontend/components/map/CoordinatePicker.tsx`, `frontend/components/map/CoordinatePicker.test.tsx`
      **Verify:** `cd frontend && npm test -- CoordinatePicker`
      **Falsifying input:** make the clear control call `onChange('', longitude)` → the "clears both" test reddens. Render the shell while closed → the FR-7 sc. 1 test reddens. Remove the accessible name from the reveal button → the `jest-axe`/role-name query reddens.
      **Disqualifies the evidence:** a test asserting the shell is absent that would **also** pass if the component threw or rendered nothing at all — assert on the reveal control's presence in the same test, or the absence proves nothing. A `jest-axe` pass is **not** evidence about the map's keyboard story (D-8 folds into D-3); do not report it as such.
      **Done when:** clear writes `('', '')`; the control is disabled (not absent-then-present) when both fields are blank; the shell is provably unrendered while closed and rendered after reveal; `jest-axe` clean; `react-doctor` run.

- [ ] **T-5  Adopt in `ActorForm` (eager)**  (deps: T-4)
      **Size:** ~50 LOC (28 prod / 22 test) · **Skills:** `ui-ux-pro-max`, `tailwind-design-system`
      **Scope:** Insert `<CoordinatePicker initiallyOpen …/>` **inside the existing Location `<fieldset>`, adjacent to the coordinate inputs**. Wire `onChange` to two `setField` calls. Keep the card-wrapping-`div` + semantic-only `fieldset` shape. **`validate()`, `buildPayload`, and all four GPS inputs are untouched.**
      **Traces:** FR-5 sc. 1 + sc. 2 (incl. `gpsAltitude`/`gpsAccuracy` stay manual) · FR-1 sc. 3 (half-filled pair, the C-2 divergence) · FR-2 sc. 1 (pin pre-placed on edit) · FR-4 sc. 1 (`BUT` must not clear other fields)
      **Files:** `frontend/components/admin/ActorForm.tsx`, `frontend/components/admin/ActorForm.test.tsx`
      **Verify:** `cd frontend && npm test -- ActorForm && git diff --stat frontend/components/admin/ActorForm.tsx`
      **Falsifying input:** change one character of `ActorForm.validate()` → existing GPS validation tests redden (proving they guard FR-5 sc. 2). Have the picker write only latitude → the FR-1 sc. 3 test reddens.
      **Disqualifies the evidence:** if `git diff` shows any edit inside `validate()`, `buildPayload`, or the four `renderInput('gps…')` calls, **FR-5 is violated regardless of a green suite** — the suite does not assert the absence of edits. Report the diff, do not self-certify.
      **Done when:** picker renders in the Location fieldset; a half-filled pair is resolved by placing the pin; opening an actor with coordinates shows the pin pre-placed; the diff touches no validation, payload, or input-rendering code.

- [ ] **T-6  Adopt in `RegistrationForm` (behind the disclosure)**  (deps: T-4)
      **Size:** ~55 LOC (32 prod / 23 test) · **Skills:** `ui-ux-pro-max`, `tailwind-design-system`
      **Scope:** Same insertion, `initiallyOpen={false}`, passing the form's existing `gpsHintId` as `describedBy`. `validate()` (including the both-or-neither rule) and `buildPayload` untouched.
      **Traces:** FR-7 sc. 1 (`BUT` the inputs stay visible without revealing the map) + sc. 2 (reveal places pin from already-typed coords) · FR-5 sc. 1 + sc. 2 · FR-1 sc. 3
      **Files:** `frontend/components/register/RegistrationForm.tsx`, `frontend/components/register/RegistrationForm.test.tsx`
      **Verify:** `cd frontend && npm test -- RegistrationForm && git diff --stat frontend/components/register/RegistrationForm.tsx`
      **Falsifying input:** hide the coordinate inputs behind the reveal control → the FR-7 sc. 1 `BUT` test reddens (the inputs must be queryable with the map closed). Drop `describedBy` → the `aria-describedby` assertion reddens.
      **Disqualifies the evidence:** same as T-5 — a green suite does not prove `validate()` was untouched; the diff does. Also: **this task cannot prove FR-7's network behaviour.** A jsdom test showing the shell unrendered is not the same claim as "no Leaflet request was made" — that is T-7 (NFR-1b).
      **Done when:** reveal control present and labelled; coordinate inputs usable with the map never revealed; revealing places the pin from typed values; `gpsHintId` still joins both inputs' `aria-describedby`; diff touches no validation or payload code.

- [ ] **T-7  The three declared gaps — browser gates and rendered captures**  (deps: T-5, T-6)
      **Size:** ~0 LOC of product code; output is **evidence**, recorded in `execution.md` · **Skills:** `playwright-cli` **only if installed in the running environment** — it is not vendored here, so the task must remain completable with raw CDP over headless Chrome (the ATP-57 route)
      **Scope:** Three checks, none of which any jsdom test may claim.
      1. **NFR-1b / D-5b** — serve `frontend/out/`, load `/register` in headless Chrome over CDP, record all network requests. **Pass:** zero requests matching the Leaflet chunk, the Leaflet CSS, or `tile.openstreetmap.org`.
      2. **D-3** — drive the picker in a real browser on both forms: marker created, draggable, map click moves it, fields update, typed values move the pin, clear empties both.
      3. **NFR-5 / D-4** — rendered captures of both forms' Location section at **375 / 768 / 1440**, checking no horizontal overflow.
      Plus the build gate: `cd frontend && npm run build` → `/register` ≤ **116 kB** (NFR-1 / D-5a), `/map` still **112 kB** (NFR-6).
      **Traces:** NFR-1, NFR-1b, NFR-5, NFR-6 · FR-7 sc. 1 · FR-1 sc. 1/sc. 2 and FR-2/FR-3's Leaflet halves · `design.md` §2, §10, §13
      **Files:** `docs/specs/enhancement/map-coordinate-picker/execution.md` (evidence), capture images
      **Verify:** the three procedures above, each recorded with its raw observation.
      **Falsifying input — mandatory, run BEFORE trusting gate 1:** temporarily render `<CoordinatePicker initiallyOpen />` on `/register` and confirm the capture **fails** (chunk + CSS + tiles all appear). **A gate not shown to fail is not a gate** (KZ-002, recurrence ×3). Record both the failing and passing runs.
      **Disqualifies the evidence:**
      - A capture recording **zero requests of any kind** means the harness never observed the page — **inconclusive, not a pass.**
      - A capture taken at a viewport the browser did not actually apply is not evidence; confirm the applied width appears in the capture itself.
      - The precedent (ATP-57's dated docblock in `RegistrationForm.test.tsx`) proves headless-Chrome/CDP/static-export works here; it does **not** prove network interception. If that transfer fails, **escalate — do not substitute a jsdom assertion or a source-code reading.**
      - "I could not run the browser" is a legitimate, reportable outcome and MUST be escalated, never recorded as a pass.
      **Done when:** gate 1 shown failing under mutation and passing on the real build; gate 2's observations recorded verbatim; captures at all three widths reviewed at the HITL pause; build numbers recorded. **NFR-1b is one-time and not committed** — restate the residual-regression gap in `execution.md` so it survives into the archive.

---

## Coverage closure (KZ-001 — scenario and clause granularity, not requirement ID)

Every scenario and every `BUT it must NOT` / `AND IT MUST` clause is owned by exactly one task. A gap is never discharged by citing a different requirement.

| Requirement · scenario · clause | Owner |
|---|---|
| FR-1 sc. 1 drag writes both · *AND IT MUST write both, never one alone* | T-3 (behaviour), T-4 (API makes it inexpressible) |
| FR-1 sc. 1 · clears pre-existing error · *BUT must NOT alter other fields / submit* | T-5, T-6 (both forms' wiring) |
| FR-1 sc. 2 map click | T-3, verified T-7 gate 2 |
| FR-1 sc. 3 half-filled pair · *AND IT MUST behave identically in both* · *BUT must NOT change `validate()`* | T-5, T-6 |
| FR-2 sc. 1 pin pre-placed + centered | T-3, T-5 |
| FR-2 sc. 2 no coords · *BUT must NOT place at 0,0* | T-3, T-1 (`parseCoordinatePair` → `null`) |
| FR-2 sc. 3 four unplaceable cases · *AND IT MUST leave values as typed* · *BUT must NOT throw / block* | T-1 (all four named tests), T-3 |
| FR-3 sc. 1 typing places pin · *AND IT MUST NOT rewrite typed values* | T-1, T-3 |
| FR-3 sc. 2 invalid removes marker | T-1, T-3 |
| FR-4 sc. 1 clear · *AND IT MUST clear both* · *BUT must NOT clear others / reset view* | T-4 (both), T-5 (other fields) |
| FR-4 sc. 2 nothing to clear · *BUT must NOT be enabled with no effect* | T-4 |
| FR-5 sc. 1 non-map path · *AND IT MUST need no map* · *BUT must NOT relabel / require GPS* | T-5, T-6 (diff-verified) |
| FR-5 sc. 2 each form keeps its rules · *AND IT MUST leave altitude/accuracy manual* | T-5 |
| FR-6 sc. 1 rounding · *AND IT MUST ≤7 dp* · *AND IT MUST round-trip* · *BUT must NOT round typed* | T-1 (a named test per clause) |
| FR-7 sc. 1 no Leaflet on load · *AND IT MUST use network observation* · *BUT must NOT hide the inputs* | T-7 gate 1 (network), T-6 (inputs visible) |
| FR-7 sc. 2 reveal mounts + places pin | T-4, T-6 |
| FR-8 sc. 1 one definition · *AND IT MUST leave `/map` identical* · *BUT must NOT add a mode flag* | T-2 (flag clause is review-only — unguarded, stated in T-2) |
| NFR-1 / NFR-1b / NFR-5 / NFR-6 | T-7 |
| NFR-2 | T-4 (controls), T-5/T-6 (`jest-axe`); map keyboard = D-3 gap, T-7 |
| NFR-3 | T-3 (grep gate), T-5/T-6 |
| NFR-4 | T-1 (disqualifier enforces it) |

**Clauses owned by no automated gate, declared not discharged:** FR-8's *"no `pickerMode` flag"* (review-only) · the whole of D-3 (T-7 gate 2) · D-4 (T-7 gate 3) · NFR-1b's durability beyond this execution (`design.md` §13).

## Estimated LOC

| Task | Prod | Test |
|---|---|---|
| T-1 | 60 | 110 |
| T-2 | 35 | — |
| T-3 | 135 | — |
| T-4 | 105 | 85 |
| T-5 | 28 | 22 |
| T-6 | 32 | 23 |
| T-7 | — | evidence only |
| **Total** | **395** | **240** |

**635 LOC**, matching the `design.md` §11 budget. `/akili-execute` stops and escalates on exceeding 7 tasks, 635 LOC, or 9 review rounds.

## Execution conventions

- Commits: `[SPEC:enhancement/map-coordinate-picker] <message>`.
- Evidence before checkbox: append the Reviewer's PASS to `execution.md` **first**, then flip `tasks.md`, then commit.
- Re-run the KZ-010 concurrency check (`git log --oneline --all -20 -- <target paths>`) **at execution start** — M-5 was clear on 2026-09-08, but that is a reading of that moment, not a property of the repo.
- **Linting in `frontend/` is `npm run lint` (`next lint`), never `npx eslint`.** Root `CLAUDE.md`'s `npx eslint … --quiet` guidance is a **`backend/` rule** — it exists because `backend/`'s `npm run lint` runs `eslint --fix` and mutates the diff under review. `frontend/`'s does not mutate, and `npx eslint` cannot run here at all (no flat config). Applying the backend rule to a frontend task is what produced T-3's dead gate.
