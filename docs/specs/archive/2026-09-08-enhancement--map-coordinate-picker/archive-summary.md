# Archive Summary — Map Coordinate Picker

## Outcome

**Delivered and validated.** A person can now set an actor's location by dragging a pin instead of typing two decimals they do not know — in both forms, with the manual inputs untouched and authoritative.

| Field | Value |
|---|---|
| Original spec path | `docs/specs/enhancement/map-coordinate-picker/` |
| Archive date | 2026-09-08 |
| Source | Jira **ATP-55** (Option 2 only) · branch `map-picker` |
| Final status | **Complete** · 7/7 tasks · validation **READY WITH WARNINGS**, 0 FAIL |
| Depth | Standard · `gated` approval mode throughout |

## Requirements delivered

| | |
|---|---|
| **FR-1** | Drag or click places the pin and writes **both** coordinate fields |
| **FR-2** | A record with coordinates opens with its pin placed and centred |
| **FR-3** | Typing moves the pin; the fields stay the source of truth |
| **FR-4** | A clear control returns both fields to blank |
| **FR-5** | Both forms' inputs, validation and payload builders **byte-identical** |
| **FR-6** | Writes rounded to 5 dp — inside the `Decimal(10,7)` column, round-trip stable |
| **FR-7** | `/register` fetches no Leaflet until the map is asked for |
| **FR-8** | Map constants live in one module, shared by both tile surfaces |

## Files changed

**New:** `frontend/lib/geo/coordinates.ts` (+ tests) · `frontend/components/map/{map-constants.ts, CoordinatePickerMap.tsx, CoordinatePicker.tsx}` (+ tests)
**Edited:** `LeafletMap.tsx` (constants extracted) · `ActorForm.tsx` and `RegistrationForm.tsx` (adoption, ~19 lines each) · `frontend/CLAUDE.md` + `AGENTS.md` (new *Map surfaces* section)
**~1,192 LOC** against a 635 estimate — 56 % of the overrun is test code. No backend, schema, migration or API change.

## Test evidence

**111 suites / 1,682 tests passing** · lint and typecheck clean · `/register` 118 kB (≤119) · `/map` unchanged at 112 kB.
**`/akili-test` was not run** — coverage was built inside the execute loop, so every test was written by the agent that wrote the code. Accepted; the per-task *demonstrated-falsifier* discipline substituted for it and caught four non-discriminating suites.
Real-browser evidence (T-7, raw CDP): the NFR-1b network A/B mutation-verified, all five Leaflet behaviours driven, the mount-with-a-point branch confirmed at z12 centred pixel-exact, focus ring measured at `rgb(31,78,140)`, no horizontal overflow at 375/768/1440, `mt-4` measured at 16 px. **11 captures retained** under `captures/`.

## Validation

**0 FAIL · 6 WARN · 1 BLOCKED.** No finding was in the code; all six corrections were to documents and all were applied. Judgment was delegated to an independent auditor because the Leader authored the specs it would otherwise have validated.

## Accepted warnings and follow-ups

| | Status |
|---|---|
| Pin-click relocates the point ~31 m and truncates a typed 7th decimal | **Accepted as-is by user decision.** Conformant to FR-1 sc. 2; a fix would be unapproved scope. Candidate remedy preserved in `validation-report.md` |
| `ActorForm` never driven in a browser | **Not attempted** (an absent Cognito session, a choice not a wall). Three-item residual enumerated |
| NFR-1b is one-time, not committed | Declared in five places. A committed browser harness (`design.md` §13) was **assessed and deliberately not built** — it would guard finished, rarely-touched code whose failures are visible, not silent |
| OQ-2 — the self-registered blank-GPS rate | Unmeasured and unmeasurable from this checkout; the closing SQL is in `requirements.md` §2.3 |
| Three coverage clauses demoted (A) → declared (B) at validation | Structurally sound, unasserted |
| No PR opened | 12 commits on one branch; `design.md` §12 planned two PRs |

## Historical notes

Three findings no automated gate could have produced, all caught by a reader:
- **`maxBounds` made the feature's own purpose unreachable** — an actor outside Tanzania got a correct marker and a clamped view, so the wrong pin the feature exists to expose was the one it could not show.
- **The empty view opened at 12 km of rural Singida** on the mobile form where the fields are blank by definition.
- **The picker sat flush against the inputs at 0 px** — `gap-4` separates grid cells and adds nothing below the last row.

And one measurement that closed the spec's own central argument: the **eagerly-mounting build reported `/register` at 118 kB, identical to the passing build** — proving the route table is structurally blind to the defect FR-7 exists to prevent, which until then had been an inference from `/map`.
