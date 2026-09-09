# Validation Report — Map Coordinate Picker

## Verdict: **READY WITH WARNINGS** — archive after reading §11

**0 FAIL · 6 WARN · 1 BLOCKED · 1 advisory.** No finding is in the code. Every correction this validation produced was to a *document*, and all six have been applied.

| | |
|---|---|
| Spec path | `docs/specs/enhancement/map-coordinate-picker/` |
| Validated | 2026-09-08 · Leader Opus 5 (measurements) + independent auditor, opus, read-only (judgment) |
| Tasks | **7/7 `[x]`** · 10 commits on `map-picker` |
| Tests · Lint · Types | **111 suites / 1682 tests pass** · clean (pre-existing `<img>` warnings only) · clean |
| Routes | `/register` **118 kB** (≤119) · `/map` **112 kB** · `/admin/actors/edit` **165 kB** · `/admin/actors/new` **163 kB** |

### Independence — stated, because it is the rule most easily faked

The Leader **authored** `requirements.md`, `design.md` and `tasks.md`, and **five of this spec's nine false claims were its own.** It ran the objective measurements (tests, lint, typecheck, build, task status) and **delegated every conformance judgment** to an independent auditor. Self-validating one's own spec authorship is the collapse `author ≠ auditor` exists to prevent, and the four sharpest findings below are ones the Leader would not have raised against itself.

## 1. Task Completion — **PASS**
All 7 tasks `[x]`, each with a Reviewer PASS recorded in `execution.md` **before** the checkbox flipped. 8 FAILs across 15 review rounds; 0 HALTs, 0 FATAL_FAILs, 0 Pivots. One ordering defect: T-5 attempt 1's FAIL was written late and is marked as late in the log.

## 2. File Existence — **PASS**
All six new files present and matching `design.md` §3; both adoption blocks in place; `captures/` holds 11 PNGs + README.

## 3. Build Integrity — **PASS**
See the table above. `/map` unchanged at 112 kB satisfies NFR-6.

## 4. Requirement Coverage — **WARN** *(corrected during validation)*
Every FR and NFR is owned and evidenced **except three clauses the coverage table claimed as tested when they are not.** The audit walked the table row by row rather than trusting it:

| Clause | Was | Now |
|---|---|---|
| FR-4 sc. 1 *"must NOT clear any other field"* | (A), owner T-5 | **(B) declared** — no `ActorForm` test exercises the clear path at all; `onChange('', '')` is invoked in neither form suite |
| FR-4 sc. 1 *"must NOT reset the map view"* | (A), owner T-4 | **(B) declared** — the T-4 review had already recorded it as *"no test, satisfied structurally"*; it was never moved to the declared-gap list |
| FR-1 sc. 1 error-clearing + *"must NOT alter other fields / submit"* | T-5 (A) | **(B) on both sides** — T-6's half was demoted at its own gate and **the same reasoning was not applied to T-5's**. KZ-004 inside the coverage table |

All three behaviours are structurally sound. This was a documentation-truth defect — but the coverage table *is* the closure artefact, and a table that reads as complete is exactly how scenario-level orphans ship.

## 5. Linting & Code Quality — **PASS** · 4R advisory below
Design tokens verified by grep across all four new files: no hex, no `rgb(`, no arbitrary values. Static-export shape intact. Leaflet mandated and used, no `pickerMode` flag on `LeafletMap`.

## 6. Design Conformance — **WARN** *(corrected)*
Six cross-document discrepancies found; four independently recomputed by the auditor. Applied:
1. **`execution.md`'s header still carried the retired `635 LOC · 9 review rounds`** — the identical stale figure this spec caught in `tasks.md` and missed in its own.
2. **"The entire overrun is documentation" was false.** Recomputed: prod 639 (est. 395), test 553 (est. 240) — **56 % of the overrun is test code.** The claim also buried the real finding: **test estimation was off by 130 %.**
3. **The "7 of 9 rounds" that justified raising the round budget was never measured** — recounting the ledger gives **5**. The proportion holds; the number did not, and the Leader re-asserted it as "measurable and true" in the same paragraph admitting the counts were kept by recall.
4. **KZ-002 counted as three in one place and seven in another** — now enumerated.
Left as recorded: `proposal.md`'s "15 curated records" (actual 14, immaterial), and `design.md` §7.4's Mount row naming `TANZANIA_CENTER` where the code uses `fitBounds` (behaviourally equivalent — bbox centre `-6.365` vs `-6.37`).

## 7. Test Evidence — **WARN**
**`/akili-test` was never run; there is no `test-report.md`.** Coverage was built inside the execute loop, so **every test was written by the same agent that wrote the code it tests.** `author ≠ auditor` held for review and never for test authorship. The record shows the cost concretely — four author-written suites that could not discriminate:

| | Mutation that left everything green |
|---|---|
| T-1 | single-axis `isSamePoint` passed all 18 tests |
| T-4 | bare `<button>`s in place of `Button` left all 12 green (NFR-2 focus) |
| T-5 | deleting `initiallyOpen` reddened zero tests |
| T-6 | swapping the coordinate props left every test green |

Three of four were caught anyway, by Reviewers re-deriving mutations from source. The per-task **demonstrated-falsifier** discipline did most of a Tester's work. What still fell through is precisely §4's three clauses: ones no task brief demanded, because the table said they were owned.

## 8. Declared Gaps — **WARN** (one mislabelled)
| Gap | Assessment |
|---|---|
| **`ActorForm` never driven in a browser** | Well-enumerated (3-item residual), blocker correctly re-attributed to an **absent Cognito session**, not an absent backend. ⚠️ **Labelled *blocked* where it is partly a *choice*** — "no session forgery attempted" is a fact, not an impossibility. The same T-7 entry draws that distinction for the a11y carry-over and not for this |
| **NFR-1b one-time, not committed** | **PASS — the best-declared gap in the spec.** Declared in five places, and precise about what is uncovered: an eager *fetch* leaving props/render invariants intact |
| **OQ-2 unmeasured** | **PASS.** Honest non-measurement; premise re-checked and still holds (`backend/.env` → localhost). Note: OQ-1 and OQ-4 record user confirmation; **OQ-2 — whether the feature was worth building — records none** |

## 9. Constitutional Compliance — **PASS** (one WARN on a rationale)
Tokens, static export, Leaflet, PII boundary all verified. **PII passes on the boundary but the stated reason is wrong**: `requirements.md` §5 and FR-1 call coordinates *"already publicly disclosed"*; they are **consent-gated** — `publicGps()` returns `null` for any non-`GRANTED` actor before reading them. The conclusion (no serializer change) is right for a different reason: the change is frontend-only. **A future spec citing that sentence as precedent for "GPS is public" would be citing something false.** Recorded, not corrected, as it needs a PII-boundary decision rather than a wording fix.

## 10. Agent Guide / Constitution Impact — **WARN** *(corrected)*
The `## Constitution Impact` block was **owed from T-1 and written only at the close.** Two errors in the *Map surfaces* section written to prevent agents breaking things:
- It claimed **both** surfaces import all four constants. `CoordinatePickerMap` imports **three** — never `TANZANIA_CENTER`. An agent editing that constant would believe both maps move; only `/map` does.
- It conflated *plain tuples* (what keeps `leaflet` out of importers) with *`readonly`* (what causes `TS2345`), and gave a spread idiom insufficient for `TANZANIA_BOUNDS`, whose inner tuples stay readonly.
Both fixed in `frontend/CLAUDE.md` and mirrored; `AGENTS.md`'s duplicate rule numbers renumbered 1–9.

## 11. What an archive reader must know

**NFR-1's kilobyte ceiling is not what protects `/register`, and this spec proved it.** T-7's controlled A/B: the *mutated* build — picker eager, Leaflet chunk fetched, CSS fetched, twelve OSM tiles fetched — reported `/register` at **118 kB, identical to the passing build.** The route table is structurally blind to the defect FR-7 exists to prevent, at any ceiling.

What actually stands between `/register` and a ~44 kB Leaflet fetch: `CoordinatePicker`'s `{open && …}`, two committed jsdom tests that observe **props and rendering, never requests**, and one CDP capture **run once and not committed**. An eager *fetch* leaving those invariants intact — a `useEffect` prefetch, `<link rel=preload>`, a new mounting site — passes every gate this repo owns.

⚠️ **T-7's gate-1 mutation reddens one jsdom test by design. That test must never be "fixed".**

## 12. Remediation

**Applied (6):** three coverage-table demotions · the false overrun claim · the stale tripwire header · the unmeasured round count · the KZ-002 enumeration · both live-guide errors + renumbering.

**Carried out of the archive, not into it (4):**
| # | Item |
|---|---|
| 1 | **DECIDED 2026-09-08 — accepted as-is, no fix.** Clicking the pin relocates the point ~31 m and truncates a hand-typed 7th decimal. Measured, and **conformant** to FR-1 sc. 2 (Leaflet's marker-click branch is unreachable for a marker with no click listener, so T-3 advisory 5's mechanism is falsified). The user weighed it and accepted: 31 m on an agricultural actor changes nothing, and a fix would be scope no approved requirement covers. **Recorded as a decision, not an oversight** — the candidate remedy (skip `onChange` when the click resolves `isSamePoint` against the current fields) is preserved here in case the tolerance ever changes |
| 2 | **`design.md` §13's committed browser harness is unfiled** — it closes D-3, D-4 *and* NFR-1b at once |
| 3 | ~~Relabel the `ActorForm` residual from *blocked* to *not attempted*~~ — **done 2026-09-08**, in `execution.md` and `captures/README.md` |
| 4 | ~~Dead code + an unowned comment~~ — **done 2026-09-08.** The redundant init-effect disable block is removed (the `[disabled]` effect runs after it on the same mount and does strictly more); `LeafletMap.tsx`'s `// T-3 additions` is now qualified to the seed-map spec. 79 map tests green, typecheck clean, `/map` and `/register` unmoved |

**BLOCKED (1):** `design.md` §12 commits to two PRs at the T-4/T-5 seam. The auditor has no git or PR access and could not confirm whether that strategy was honoured. **10 commits sit on one branch; no PR has been opened.**

## 13. Archive Readiness

**Ready.** Nothing blocks it. The code conforms, the constitutional gates pass, all three mid-execution amendments are disclosed in the documents that carry them, and the two hardest-won findings are propagated into a live guide.

```text
/akili-archive enhancement/map-coordinate-picker
```

**For the Kaizen retrospective, two signals:**
1. **All seven KZ-002 instances were in *verification lines*** — never in requirements, never in design intent. The requirements and design survived two judgment rounds and fifteen reviews; the gates written alongside them did not.
2. **Nine false claims, five by the Leader, all five the same mechanism** — a property of an artefact asserted without opening it. **None was caught by re-reading; every one was caught by measuring.** The ninth was in the guide section written to stop other agents from making mistakes.
