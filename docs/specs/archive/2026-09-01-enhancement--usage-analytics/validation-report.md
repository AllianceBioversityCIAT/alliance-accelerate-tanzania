# Validation Report — Baseline Usage Analytics (GA4) + Cookie Consent

| Field | Value |
|---|---|
| Spec path | `docs/specs/enhancement/usage-analytics/` |
| Date | 2026-08-31 (findings) · 2026-09-01 (remediation verified) |
| Branch | `tracking-tools`, 13 commits `23b199f`..`6a059e6` |
| Validator | T3 Auditor, fresh context, read-only tools |
| Verdict at time of audit | **CONDITIONAL PASS — not archive-ready**, 3 blocking items |
| Verdict after remediation | **PASS — archive-ready** |

## Summary

The feature is well built. FR-5's admin-exclusion assertion was called "the strongest-evidenced assertion I have audited in this repo." Three items blocked archive; all three are now resolved.

**An independence limitation, recorded rather than glossed:** the Leader who commissioned this validation **authored every spec document it validates against**. The validator was briefed explicitly not to treat those documents as ground truth, and that instruction earned its keep — two of the three blocking findings were defects in the spec documents, not in the code.

## Requirement coverage

| Requirement | Level | Note |
|---|---|---|
| FR-1 | **PASS** | Non-injection gate; `undecided`/`denied` tests set real measurement IDs so the consent gate is isolated from the missing-ID short-circuit. `config` *is* the page view. |
| FR-2 | **PASS** (after T-10) | Keyboard half passed throughout. Pointer half **failed** at audit — see F-1 — and is closed by T-10. |
| FR-3 | **PASS** | Every failure path resolves to `undecided`; `denied` returns `denied`, so rejection is as durable as acceptance. |
| FR-4 | **PASS** | Validator ran the codebase-wide sweep T-3's single-file gate could not. Zero custom-call sites in `frontend/`. |
| FR-5 | **PASS** | Root layout verified clean by reading; converse tests prevent "absent everywhere" passing; both probes are the right two. |
| FR-6 | **PASS** (after T-11) | Re-scoped, not deleted. Geographic copy corrected twice — see below. |
| FR-7 | **PASS** | The two genuinely unobservable clauses are recorded **in the test file**, not only in the log. |
| NFR-1 · NFR-2 · NFR-3 | **PASS** | Tokens verified **by reading**, class by class — the regex sweeps' recorded blind spots (stock-palette utilities, inline `style={{}}`) are not exercised anywhere. |
| NFR-4 | **PASS as recorded** | The inherited app-wide contrast gap is real and recorded in **four** places, not hidden. Amended to name `primary-fg`→`{primary, primary-hover}`. |
| NFR-5 | **PASS** (after T-10) | 3 widths, viewport verified in-page, zero horizontal overflow, `z-[1100]` over `z-[1000]` confirmed by `elementFromPoint`. |
| NFR-6 · NFR-7 | **PASS** | Static export shape structurally intact; PII boundary structural and verified codebase-wide. |

## The three blocking findings, and their resolution

### F-1 — FR-2 scenario 2 violated, and the experiment that dismissed it measured the wrong variable

T-8 found footer links under the banner and dismissed them as pre-existing on the strength of an A/B that reverted `LeafletMap.tsx` — **while leaving the banner present in both arms.** The variable of interest was never varied. Relative to this spec, the fixed bottom bar the spec introduced *is* the occluder. **The Leader accepted that conclusion and praised it as "measured, not asserted."**

Re-measured with two isolated Chrome profiles differing only in the stored consent record, 252 cells, `elementFromPoint` at every link's live rect centre, plus a **manipulation check** the worker added unprompted (`bannerPresent` true in all 18 Arm-A combinations, false in all 18 Arm-B). Result: **27 cells occluded in Arm A, reachable in Arm B**; 7 of 7 footer controls unreachable by pointer at some reachable scroll position.

**Resolved in T-10.** All **16 settled-position** occlusions eliminated (the three funder logos; 42/42 cells clean at max scroll). The **11 mid-transit** cells are accepted: a `fixed bottom-0` bar of height *h* necessarily overlays any element for an *h*-wide band of scroll space, invariant under trailing padding — and since `design.md` §5.4 *prescribes* `fixed bottom-0`, forbidding that would forbid the design the same spec mandates.

### F-2 — withdrawal does not stop collection in-session

`next/script` performs no unmount cleanup: after `granted` → `denied`, the script node, `gtag`, `dataLayer` and `_ga` cookies all survive the document. **Not a bug — library behaviour.** The defect was that `/privacy` implied otherwise.

**Resolved in T-11** by disclosure, not by code: the page now states that rejecting takes effect from the next page load, that already-loaded analytics keeps running for the rest of the visit including across in-site navigation, that accepting takes effect **immediately**, and that already-set cookies are not removed. `design.md` §5.2 gained an asymmetry table and DD-4's "immediately" was scoped to the context value.

### Figure errors in the Leader's own record

- `GoogleAnalytics.test.tsx` recorded at **259** lines; actual **327**. A 68-line error that **suppressed a third budget breach.**
- Task count stale at **8** in `tasks.md`, `execution.md` and `design.md` §11 prose after the re-baseline to 9.
- "20 review rounds / 9 FAILs" reported to the user and to the validator; the log records **15 and 7**. Neither figure was cross-checked against the document that contains it — the KZ-005 defect, committed while auditing others for it.

**All corrected** under two-direction sweeps.

## The three no-gate substitutions — all discharged, one only by coincidence

| Class | Verdict |
|---|---|
| Banner contrast → `contrast.test.ts` matrix | **Discharged, but passively.** The delivered banner uses exactly the pairs the substitution relies on, so it *is* covered — but nothing in `contrast.test.ts` cites the banner. Re-tokening it would redden nothing. |
| Layout/occlusion → T-8 rendered capture | **Method rigorous, verdict outran it.** The gate found the defect seven tasks and 1,475 tests could not; it then terminated in a PASS whose accepted set was wider than the document it validated against. |
| Live GA4 ingestion → accepted risk | **PASS.** Genuinely unmeasurable here, correctly recorded, post-deploy manual check named. |

## The `/akili-test` question

**A real gap, narrowly shaped.** `author ≠ auditor` held on **reading** — the Reviewers were read-only and audited to unusual depth (7 FAILs, nearly all for gates that could not fail). But **no Reviewer ever executed anything.** Every red/green in this spec was produced by the agent that wrote the code and checked only for plausibility against source.

All three residual defects are **execution-shaped, not reading-shaped**: a control that did not vary the variable, a runtime property no test drives, and a number nobody re-measured. That is the predicted residue of `author == tester` with a strong read-only auditor.

The remedy is not a full `/akili-test` — FR-1/FR-3/FR-4/FR-5's gates were proven to discriminate with recorded verbatim output. It is a **scoped three-flow Tester pass** on a different model: the footer measurement, a revocation test, and one build to settle a route count.

## Archive readiness

**Ready.** No FAIL remains. WARN items are accepted and recorded. Baseline-document syncs are queued as pending items for the default branch (see the kaizen entry) — the branch gate forbids writing them from `tracking-tools`.
