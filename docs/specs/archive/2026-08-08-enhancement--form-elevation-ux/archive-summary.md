# Archive Summary — Form elevation close-out and ladder completion

## 1. Document Control

| Field | Value |
|---|---|
| **Original spec path** | `docs/specs/enhancement/form-elevation-ux/` |
| **Archive path** | `docs/specs/archive/2026-08-08-enhancement--form-elevation-ux/` |
| **Archive date** | 2026-08-08 |
| **Final status** | **COMPLETE** — 6/6 tasks `[x]`, all 7 FRs and 6 NFRs discharged |
| **Branch** | `enhancement/app-visual-refresh-v2` (git worktree) |
| **Opening commit** | `02ce79d` |
| **Closing commit** | `9102cf0` |
| **Approval mode** | `gated` |
| **Predecessor** | `enhancement/app-visual-refresh` (T-7 landed at `14a56f9`; that spec's T-6 remains `[~]`) |

## 2. Final Status

Every requirement closed. The three requirements with **no automated gate** — FR-1 (legend
artefact), FR-2 (`--shadow-xs` perceptibility), FR-7 (density) — were closed on **explicit user
approval of a deployed capture set**, not on direction-to-proceed. That distinction is the one
`tasks.md` T-6 disqualifier (c) exists to protect, and it held.

## 3. Requirements Delivered

| ID | Requirement | Outcome | Closing evidence |
|---|---|---|---|
| FR-1 | `<legend>` produces no visual artefact | **Delivered** — card treatment moved to a wrapping `<div>`; fieldset reduced to `border-0 p-0 m-0`, semantics intact | User: *"Approve — artefact resolved"* on the deployed set |
| FR-2 | `--shadow-xs` perceptible or removed | **Delivered** — re-tuned `0.04` → `0.12` alpha, geometry unchanged; both `inputClasses()` copies covered | User: *"Approve — visible enough"* |
| FR-3 | `--shadow-lg` has real consumers | **Delivered** — all four dialogs `shadow-md` → `shadow-lg`; rule body present in the built bundle | Rule-body extraction, baseline vs after |
| FR-4 | `REACHABLE` citations match the code | **Delivered** — 34/34 citations re-resolved, 10 corrected, 1 false citation replaced; no ledger entry weakened | 129/129 contrast pairs pass, unchanged |
| FR-5 | GPS copy programmatically associated | **Delivered** — `id` + `aria-describedby` on both GPS inputs, per-field hints preserved | RTL assertion on the resolved accessible description |
| FR-6 | Consent badge hugs its content | **Delivered** — `self-start` on `ConsentBadge` **and** `SourceBadge` | `getBoundingClientRect`: 72.547 px vs ≈105 px, corroborated from the 1440 frame at known scale |
| FR-7 | Density evaluated against a rendered baseline | **Delivered as "evaluated, no change"** — the whitespace is underfilled grid cells, which FR-7's own disqualifier (b) forbids changing | User: *"Approve — no change was right"* |
| NFR-1 | 3:1 boundary floor preserved | Met — `border border-border` on all 11 wrappers |
| NFR-2 | Tokens only; only `--shadow-xs` may change value | Met |
| NFR-3 | Accessibility preserved or improved | Met — 1281/1281 suite green, `jest-axe` clean, FR-5 adds association |
| NFR-4 | No behavioural change | Met — no validation, payload, or API-client file in the diff |
| NFR-5 | Rendered evidence before deploy | Met — 12 full-page frames, each asserting `window.innerWidth` and the served stylesheet hash |
| NFR-6 | No bundle-size regression | Met with a caveat — see §9 |

## 4. Files Changed

11 files, matching `design.md` §3 (as amended) **one-for-one**. No file outside the whitelist changed.

| File | Change |
|---|---|
| `docs/ux-ui/design.md` | `--shadow-xs` value + §7 ladder-order note |
| `frontend/app/globals.css` | `--shadow-xs` → `0 1px 2px rgba(61,47,32,0.12)` |
| `frontend/components/register/RegistrationForm.tsx` | fieldset→card restructure ×5, GPS ARIA |
| `frontend/components/admin/ActorForm.tsx` | fieldset→card restructure ×6 |
| `frontend/components/admin/ActorsTable.tsx` | `self-start` on both badges |
| `frontend/components/admin/{Confirm,Acknowledge,CreateUser,EditUser}Dialog.tsx` | `shadow-md` → `shadow-lg` |
| `frontend/components/register/RegistrationForm.test.tsx` | FR-5 RTL assertion (+24) |
| `frontend/lib/contrast.test.ts` | `REACHABLE` citation sweep |

**LOC.** `git diff -w`: **133 insertions / 47 deletions** against a ~120 estimate and a 200 tripwire
— within budget. The **raw** count is 334 / 248, which would have tripped the tripwire; the excess
is reindentation from T-1's 11 wrapper elements, not new logic. The `-w` basis was ruled standing at
T-1 and is recorded here because the two numbers differ enough to mislead a later reader.

## 5. Test Evidence Summary

**No `test-report.md`** — `/akili-test` was not run, and its absence is **explicitly accepted at
archive**. The spec is entirely presentational; its dominant defect class is rendered appearance,
which no test suite in this repo evaluates. Verification was carried by per-task gates plus the
rendered/human gates T-6 exists to run.

| Gate | Result |
|---|---|
| `npm test -- --silent` (full suite, T-6) | **86 suites, 1281 tests, all passed** — a clean run, so the flakiness conditional never fired |
| `npm run build` | Success, static export, shared First Load JS 103 kB |
| `npx next lint --quiet` | No warnings or errors |
| Contrast suite | 129/129 pairs, unchanged |
| Rendered evidence | 15 PNGs under `captures/deployed/` — 4 surfaces × 3 widths, plus 3 crops |

**Capture provenance.** All **12 full-page frames** assert in-page `window.innerWidth == target` at
`devicePixelRatio: 2` **and** that the loaded stylesheet is `d4851289373f404a` with `--shadow-xs`
resolving to `0.12`. The **3 crops** carry only inherited provenance — cite a frame, not a crop, when
build attribution is the question.

## 6. Validation Summary

**No `validation-report.md`** — `/akili-validate` was not run, and its absence is **explicitly
accepted at archive**. Two considerations supported accepting it:

1. T-6 already performed the checks validation would repeat — full-suite, build, lint, diff-scope
   against the design whitelist, LOC tripwire, and a clause-by-clause disqualifier sweep per task.
2. The spec's unautomatable requirements were closed on a **human gate**, which is the strongest
   evidence available for them and which a validation pass could not strengthen.

**Zero unresolved FAIL findings.** All five Reviewer FAILs were remediated and re-reviewed to PASS.

## 7. Execution Metrics

| Signal | Value |
|---|---|
| Tasks | 6 / 6 — budget exact |
| Review rounds | **12** against an 8-round budget — **tripwire exceeded** |
| Reviewer FAIL rework rounds | **5** (T-2 ×1, T-4 ×2, T-6 ×2) |
| Attempt ceiling reached | **1** (T-4, 3 attempts — reached, not exceeded) |
| HALTs / FATAL_FAILs / PRODUCT_BUGs | **0 / 0 / 0** |
| `## Pivot Record` blocks | **0** |
| Recorded Leader errors | **2** (both T-4) + 4 Leader corrections to the record (T-2, T-3, T-5, T-6) |
| Spec amendments during execution | **2**, both user-approved, neither widening scope (`design.md` §3 whitelist; `tasks.md` T-6 Done-when) |
| Advisories recorded (4R lens) | ~15, **none** converted into tasks |
| Harness delivery failures | **16** — workers idle without emitting a report, resending completed work on re-prompt; **0 rework attempts consumed** |
| Deploys | 1 operator-authorised Dev deploy; invalidation `I266OLYP1OP2U17COUWOEGAXF0` |

**Where the rework went.** All five FAILs were on **records, not code** — comment accuracy (T-4 ×2,
where the `self-start` fix and FR-5 wiring were correct from attempt 1 and never changed), a stale
`design.md` §7 line range (T-2), and capture-manifest caption integrity (T-6 ×2). No shipped code
defect reached a Reviewer.

## 8. Accepted Warnings & Follow-Ups

| # | Item | Disposition |
|---|---|---|
| 1 | `/register` **scrolls horizontally at 768 px** (≈1209 CSS px against `innerWidth` 768, driven by the header) | Pre-existing, out of scope per `requirements.md` §6. **Now has deployed evidence** — cite `captures/deployed/1-register__768.png` in the `bugfix/` proposal |
| 2 | `primary` / `primary-hover` on `surface-alt` sit in `UNREACHABLE` but **are** reachable (`about/page.tsx:485`) | Masks no failure (≈7.3:1, would pass on promotion). Warrants a follow-up proposal, not a rework round |
| 3 | **NFR-6 baseline is in-spec, not pre-spec** — route totals held (`/register` 111 kB, `/admin/actors` 161 kB) and the diff adds no import, but a strictly comparable pre/post pair was never captured | Accepted |
| 4 | `tasks.md` T-3's verify line `grep -c 'shadow-lg' …` **is defective** and returns `1` in both states | Standing ruling: use `grep -o '\.shadow-lg{[^}]*}'`. Recorded in `execution.md` → T-3 |
| 5 | **DD-2's design tension survives** — an input on a white card may want to be a *well* rather than a raised chip | Closed for this spec; the user approved the `0.12` re-tune |
| 6 | `375` / `768` ActorForm **harness** frames are not representative of the real route | Superseded by act 2's deployed frames; noted for anyone reading the earlier captures |
| 7 | `--shadow-xs` at `0.12` was approved with the honest caveat that the Leader **could not distinguish it from flat** at native scale | Accepted with the weakness of the evidence in front of the user |
| 8 | Predecessor `enhancement/app-visual-refresh` T-6 remains `[~]` | Independent of this spec — every remaining item there is evidentiary, not code-changing |

## 9. Historical Notes

**The load-bearing decision (DD-1).** The `<legend>` cannot straddle a card border without breaking
the silhouette. Moving the card treatment to a wrapping `<div>` and reducing the `<fieldset>` to
`border-0 p-0 m-0` resolved FR-1 with no float, no `sr-only` duplication, and **no test assertion
edited**. The three alternatives all broke something; `float-left w-full` had already shipped a
broken registration form to Dev on 2026-08-07 **with contrast, lint and build all green** — none of
those gates evaluates layout. That incident is why NFR-5 exists.

**The elevation ladder is now fully consumed.** Four rungs, every one with real consumers:
`xs` (inputs) · `sm` (form-section cards) · `md` (cards) · `lg` (all four dialogs). Before this spec
`lg` had **zero** consumers and `.shadow-lg` was absent from the built bundle.

**Two structural facts corrected in flight.** There is **no shared input primitive** —
`inputClasses()` is a byte-identical duplicate in `RegistrationForm.tsx` and `ActorForm.tsx`, so
every input-level change must be made twice. Extracting one is recorded and deliberately out of
scope. And `ConsentBadge` stretching was a **flex-parent** effect, not a badge-class defect, which is
why reading the badge alone suggested no defect existed.

**A deploy-script trap, discovered the hard way.** `infra/scripts/deploy-frontend.sh` reads
`AWS_PROFILE` and **parses no flags** — `PROFILE="${AWS_PROFILE:-IBD-DEV}"`. Running it as
`./deploy-frontend.sh --profile IBD-DEV` silently ignores the flag and lets an ambient
`AWS_PROFILE` win, which is exactly what happened at T-6 (the run announced `MELIA-DEV`). The
correct invocation is `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`.

**KZ-003 narrowed, not refuted.** The throwaway-harness shortcut works for admin components because
the harness is placed **outside** the `(admin)` route group — `RequireRole` returns `null` and
redirects for a `Public` session. Three prior tasks' success implied a broader guarantee than exists.

**Self-illustrating.** This spec was written partly to close a KZ-008 citation defect, and produced
three fresh instances of the same class inside its own execution — two in task comments, one in its
capture manifest, for its hardest-gated requirement. See `kaizen-log.md` → KZ-008 recurrence ×2 and
KZ-009.

---
**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email`. All
AWS commands use `--profile IBD-DEV` — except `deploy-frontend.sh`, which takes `AWS_PROFILE`.
