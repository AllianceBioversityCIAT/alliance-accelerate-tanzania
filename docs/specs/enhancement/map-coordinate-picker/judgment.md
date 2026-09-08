# Judgment Day — `enhancement/map-coordinate-picker` design review

| Field | Value |
|---|---|
| Target | `design.md` (immutable at review time), with `requirements.md` / `proposal.md` as in-scope context |
| Mode | `judgment_day` — blind dual judge |
| Rounds | 2 fix rounds, 1 scoped re-judgment (of 2 permitted each) |
| Judges | Two, parallel, blind, read-only, **Sonnet** — author ≠ auditor (design authored on Opus) |
| Skill resolution | `judgment-day` reference files absent on this machine; ran on the skill document's own contract. Ledger persisted here for `/akili-archive` |
| Date | 2026-09-08 |

## Counts

| | |
|---|---|
| **Confirmed** (both judges) | **2** — both WARNING/SUGGESTION severity |
| **Suspect** (one judge) | **10** |
| **Contradiction** | **1** — resolved by the parent, see below |
| Judge A | 1 SEVERE · 4 WARNING · 2 SUGGESTION |
| Judge B | 2 SEVERE · 3 WARNING · 3 SUGGESTION |

## Corroboration the round produced

Both judges independently ran `npm run build` and **each reproduced M-1 (`/register` 113 kB) and M-3 (`/map` 112 kB) exactly**, and both independently confirmed the private-constant, validation-divergence, `Decimal(10,7)`, missing-`LeafletMap`-test, `jest-axe`, token-name, and M-5 concurrency claims. The central §2 argument is corroborated from two independent measurements, not just the author's.

> **Process note.** Both judge briefs omitted a prohibition on running measurement commands, so two `npm run build` runs executed concurrently against one checkout — a `CLAUDE.md` Concurrency-protocol violation caused by the parent's brief, not by the judges. No harm resulted (both runs agree exactly with each other and with M-1/M-3), but future judge briefs must forbid measurement or serialize it.

## Contradiction — resolved

| | |
|---|---|
| **JB-1** | Judge B: the ATP-57 CDP precedent is false; the real precedent is ATP-62 / `usage-analytics` |
| | Judge A: the ATP-57 precedent is real, citing a dated docblock in `RegistrationForm.test.tsx` |
| **Resolution** | **Judge A is correct.** `RegistrationForm.test.tsx` carries, under an `ATP-57` comment block, a `[2026-09-08]` docblock recording a headless-Chrome measurement at 375×667 against the static export (page 2995 px, submit at y=2369, post-submit `scrollY=222`), explicitly noting the measurement is not reproducible from the suite. The citation stands unchanged |
| **B's surviving caveat** | Valid and retained: that precedent establishes **headless Chrome + CDP + static export** works here — it does **not** establish that *network-request* capture was ever used (a different CDP domain from scroll/layout reads). Recorded as **F-11** |

## Frozen findings ledger

| ID | Judges | Sev | Finding | Status |
|---|---|---|---|---|
| **F-1** | A only, **parent-verified** | SEVERE | `seed-data.ts` coordinates claimed at "5–6 dp"; actual max is **4 dp** (20 values at 4, rest at 0–3, **none** at 5–6). Parent re-measured independently and confirms. Root cause: the 5–6 dp figure came from the **Dev API** corpus, but the sentence names the **seed file** — an artefact that does not bear the claim (KZ-008), inside two documents that cite KZ-011 by name | **Fix** |
| **F-2** | B only | SEVERE | NFR-1b's CDP network capture carries **no runnable command and no durability mechanism** — unlike every other Test Plan row. D-5b's defect class is automatable (unlike D-3/D-4), so as written the design closes KZ-002 for one execution and leaves nothing to catch a future `initiallyOpen` flip on `/register` | **User decision** |
| **F-3** | **A + B** | WARNING | `isSamePoint` compares at `COORDINATE_PRECISION` (5), so it answers "is the marker already where the fields say?" correctly **only for picker-written values**. A hand-typed 7-dp value (which FR-6 forbids rounding) never equals its own 5-dp form → a redundant `setLatLng`/pan. Both judges traced it to no *visible* bug, but DD-4's "settles in exactly one pass" is proven only for the write path | **Fix** |
| **F-4** | **A + B** | SUGGESTION | "~43 kB gzip" is 41+2, each rounded down first. Measured: 42.7 kB JS + 2.7 kB CSS ≈ **44–45 kB**. Immaterial to the 116 kB bar; exactly the compounding-rounding KZ-005 warns about | **Fix** |
| **F-5** | B only | WARNING | §7.2 types the extracted constants `readonly [number, number]` — structurally wrong for `TANZANIA_BOUNDS`, which is a **pair of pairs** (`L.LatLngBoundsExpression`). An Implementer hits this immediately | **Fix** |
| **F-6** | B only | WARNING | §2 calls `/map` "the most eager mount possible"; `ActorMap` actually gates `LeafletMap` behind loading/error/empty early returns. Still eager in the FR-7 sense (no user gesture), so **the conclusion survives** — but the supporting claim is overstated | **Fix** |
| **F-7** | A only | WARNING | §1 says the two forms differ by "one prop"; §7.5's own table shows **two** (`initiallyOpen` *and* `describedBy`) | **Fix** |
| **F-8** | A only | WARNING | DD-2 says option (b) costs "one fewer prop"; 3 props → 1 prop is **two** fewer | **Fix** |
| **F-9** | A only | WARNING | Neither PR's review focus names the D-5a/NFR-1 route-table gate — and PR 2 is exactly where a stray top-level `import 'leaflet'` would land | **Fix** |
| **F-10** | A only | SUGGESTION | NFR-2 requires accessible names + visible focus on the reveal/clear controls; the design never names the concrete element implementing them | **Fix** |
| **F-11** | B only (from JB-1) | WARNING | The ATP-57 precedent proves headless-Chrome/CDP/static-export works here, **not** that network-request capture was used. Transfer must be demonstrated, not assumed | **Fix** |
| **F-12** | B only | SUGGESTION | `requirements.md` header cites `docs/ux-ui/design.md` **§5.1**; §5 is "Navigation Model" with no §5.1 — the fieldset/form content is under **§6 Layout Patterns** | **Fix** |
| **F-13** | B only | SUGGESTION | DD-6 asserts "DD-1…DD-5 are local to this spec" while six DDs exist, excluding itself without saying why | **Fix** |

---

## Round 2 — scoped re-judgment

Same protocol: two blind parallel Sonnet judges, over the frozen ledger plus the fix delta. **Both briefs forbade measurement commands**, correcting the round-1 process violation.

**Both judges agreed exactly: 12 RESOLVED · 0 PARTIAL · 0 UNRESOLVED · 1 REGRESSED.**

### The regression — F-1, and it is the most instructive event of this review

| | |
|---|---|
| What happened | The round-1 fix for F-1 replaced a false seed-data claim (*"5–6 dp"*) with a **new false claim**: *"30 coordinate values"*. The true count is **28** |
| Root cause | The parent's original count used the regex `[0-9]*` — a **star** quantifier, which matches the empty string. `gpsLatitude: number;` / `gpsLongitude: number;` from the `interface SeedActor` **type declaration** therefore matched with an empty numeric part and were scored as two phantom "0 dp" values. Those two phantoms are the entire 30-vs-28 gap. The decimal-place distribution (20/4/3/1, none at 5–6) was correct throughout |
| Detection | Parent re-measured with a corrected regex and found 28 **before** the second judge returned; both judges then independently reported 28. **Triple corroboration on the replacement value** |
| Correction | DD-3 now reads "**28** coordinate values (14 actor lat/lng pairs) … 20 at 4 dp, 4 at 3 dp, 3 at 2 dp, 1 at 1 dp". Forward sweep confirms no stale `30` survives |

**This is KZ-008 reproducing inside its own remediation** — a fix written to remove a false artefact claim carried a false artefact claim of its own, in a document that cites KZ-011 by name, under a brief that explicitly warned about this hazard. The warning did not prevent it; **the measurement did**. Strong candidate for the `/akili-archive` Kaizen retrospective, and direct evidence for the kaizen log's own closing line: *"A spec that fixes a defect class is the most likely place to reproduce it."*

Corollary worth carrying: **a `*`-quantified numeric regex silently counts non-matches as zeros.** Require `+`, or require a digit, when counting data literals.

### Also fixed in round 2
- **RA-2** (Judge A, SUGGESTION) — a leftover *"A third, D-5b"* clause in requirements §2.4, redundant after the D-5 split. Merged.

### Noted, not actioned
- Judge B observed that `Button`'s `{...buttonRest}` spread sits **after** the literal `type="button"`, so a caller-supplied `type` would override it. Judge B classed it as not fix-invalidating and the design never passes `type`. Recorded for the Implementer's awareness only.

### Second re-judgment: deliberately not spent

The contract permits a second scoped re-judgment. The parent declined it: the round-2 delta is **one digit plus one merged sentence**, and the replacement value was verified three independent ways (parent's corrected measurement, Judge A, Judge B) before it was written. A further blind round over a triple-corroborated single digit would be ceremony, not corroboration. Recorded as a decision rather than an omission.

## Final disposition

| F-ID | Outcome |
|---|---|
| F-1 | Fixed in round 1, **regressed**, re-fixed and re-verified in round 2 |
| F-2 | Resolved — one-time gate + named third gap + §13 follow-up (user decision) |
| F-3 … F-13 | Resolved, both judges concurring |
| RA-2 | Resolved |
| JB-1 | Contradiction — resolved in Judge A's favour; caveat retained as F-11 |

**JUDGMENT: APPROVED ✅**

Safe to decompose into `tasks.md`.
