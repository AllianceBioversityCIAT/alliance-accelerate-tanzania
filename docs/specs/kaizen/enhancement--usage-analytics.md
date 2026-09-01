# Kaizen Entry — enhancement/usage-analytics

## Document Control

| Field | Value |
|---|---|
| Spec Path | `enhancement/usage-analytics` |
| Date | 2026-09-01 |
| Branch | `tracking-tools` — **spec branch** (no `Default Branch:` pin exists in the constitution, which the method treats as a spec branch regardless) |
| Archive Run | 1 |
| Jira | ATP-62 |

## Metrics

| Signal | Value | Source |
|---|---|---|
| Tasks executed | **11 of 11** (8 planned, T-9/T-10/T-11 added mid-execution by user approval) | `tasks.md` |
| Reviewer rounds | **15** | `execution.md` |
| Reviewer FAILs | **7** (T-2 ×2, T-3 ×2, T-4 ×1, T-6 ×2) | `execution.md` |
| Tasks passing on first attempt | 4 of 11 (T-1, T-5, T-7, T-9) | `execution.md` |
| HALTs / FATAL_FAILs | **0** | `execution.md` |
| Pivots | 0 — three scope additions instead, each user-approved from a measured finding | `execution.md` T-9, T-10, T-11 |
| Budget breaches | **3** (re-baselined once, ~580 → ~1,600; landed ~2,595) | `design.md` §11, `execution.md` closing budget |
| Test-to-implementation ratio | 0.76 estimated → 1.72 re-baselined → **~2.5 actual** — rose at every measurement | `execution.md` closing budget |
| Validation FAIL / WARN | 3 blocking / several accepted — all resolved | `validation-report.md` |
| `/akili-test` | **not run** — author == tester throughout | `validation-report.md` |
| Defects in the **Leader's own artefacts** | **6** | this file, L-1 |

**The single dominant signal:** every one of the 7 FAILs was the same defect class — *a gate that cannot fail*. That is **KZ-002 at recurrence ×4**, not a new lesson.

## Lessons

Three. Everything else this spec produced is recurrence of KZ-002, KZ-004, KZ-005 or KZ-008 and is queued below as digest updates rather than duplicated here.

### L-1 — Nothing in the methodology verifies that the SPEC is true

**Target:** Methodology · **Severity:** High

The clause sweeps, the coverage-closure table, the disqualifier clauses and the Reviewer gate all verify one direction: **does the code match the spec?** Nothing asks whether the spec is *true*. A requirement that is internally consistent and externally false passes every gate AKILI has.

Six defects in this spec were of that shape, all in Leader-authored documents, none catchable by any existing mechanism:

| # | Defect | Evidence |
|---|---|---|
| 1 | A mandated falsifying-input clause that **could not prove what it claimed** — the test rendered `AdminLayout` in isolation, so no root-layout mutation could ever redden it. FR-5's runtime guarantee was proven only because the Implementer ran an **unrequested** second probe. | `execution.md` T-5; `tasks.md` T-5 amendment |
| 2 | `requirements.md` FR-4 described GA4's default geography as "country/region". GA4 also derives **City** from IP. Transcribed faithfully, it became an affirmative false claim **in a privacy notice**, understating collection. | `execution.md` T-6 FAIL 1 |
| 3 | A rework brief that folded two items where one **falsified the other** — the instruction was self-falsifying, and the Implementer followed it correctly. | `execution.md` T-6 FAIL 2 |
| 4 | `design.md` §5.4's accepted-occlusion set was written **from reasoning rather than measurement**. It went 1 → 3 → 10 across two corrections, both times found by measuring, never by re-reading. | `design.md` §5.4; `execution.md` T-8, T-10 |
| 5 | While *recording* those corrections, the Leader introduced the same overclaim family one file over — "all seven footer controls at settled positions" when only three were, **refuted by the section's own arithmetic** (7 × 6 = 42, not the 16 it cited). | `execution.md` T-10 PASS |
| 6 | A brief instructing "state the change takes effect on the next page load, not immediately" — generalising past the task's own withdrawal scope, inducing a false claim about **when collection begins**. | `execution.md` T-11 FAIL 1 |

**Root cause:** a spec document's factual assertions about a third-party system, about the test harness, or about the codebase are load-bearing in exactly the way its behavioural clauses are — and they reach code, and visitor-facing copy, without passing any gate. All six were found by the Reviewer or the validator; **none by the Leader.**

**Sharpest instance:** #1 and #4 are the same error in different registers. A `Verify` clause is a claim about the harness; an accepted-risk list is a claim about rendered reality. Both were written from reasoning and both were wrong.

### L-2 — `author ≠ auditor` held on reading and collapsed on execution

**Target:** Methodology · **Severity:** High

The wrappers enforce `author ≠ auditor` by model binding, and it worked: read-only Reviewers audited to unusual depth (7 FAILs, nearly all for gates that could not fail; one traced `next/script`'s microtask chain through pinned vendor source; one caught a 1px border-box/content-box divergence).

But **no Reviewer ever executed anything.** Every red/green in this spec — every mutation probe, discrimination split, `elementFromPoint` result, line count — was produced by **the same agent that wrote the code**, and independently checked only for *plausibility against source*. On execution, author *was* auditor, and the Reviewer's role degraded to reviewing the Implementer's **account** of a measurement.

**The residue is predictable and was observed.** All three residual defects the validator found are execution-shaped, none reading-shaped:

- a measured A/B whose **control did not vary the variable of interest** (a reader cannot catch that; one re-run with the banner suppressed catches it immediately)
- a **runtime property** no test drives and no document questioned (`granted` → `denied` leaves the script running)
- a **line count nobody re-measured**, which then silently suppressed a budget breach

**The remedy is not a full `/akili-test`.** Gates proven to discriminate with recorded verbatim output need no re-testing. What is missing is a **scoped Tester pass on a different model for the execution-shaped claims only** — the measurements, not the reasoning.

### L-3 — The preventive clause sweep works, and belongs in the task brief by default

**Target:** Methodology · **Severity:** Medium · **Positive lesson**

T-2 and T-3 each took **3 attempts**, each round fixing the named clause while the Reviewer found the next instance of the same class — whack-a-mole. The loop closed only when the brief was restructured from *fix the named defect* to **sweep every clause**: for each, either name the concrete mutation that reddens a specific named test, or record it as an unevaluable gap with its structural reason. No third option; "structurally covered" accepted only as a declared gap.

Introduced preventively from attempt 1 thereafter:

| Task | Attempts | Framing |
|---|---|---|
| T-2 | 3 | fix the named clause |
| T-3 | 3 | fix the named clause → **sweep**, at attempt 3 |
| T-4 | **2** | sweep from attempt 1 |
| T-5 | **1** | sweep from attempt 1 |

T-4 also produced **four** discrimination probes unprompted where one was required, and T-5's Implementer **caught the vacuity trap itself, before review** — the first time in the spec.

**This is currently a Leader habit discovered mid-spec.** It belongs in `docs/specs/general-setup/task.md` as a default expectation of a task brief.

## Noted, not a lesson

- **Three scope additions, all user-approved from measured findings** (T-9, T-10, T-11), none from an advisory. The *Advisory Never Becomes A Task* rule held throughout: advisories were recorded and died there, and every scope growth came through the escalate-and-approve path the rule prescribes.
- **The budget tripwire fired correctly twice and was then forgotten.** The last budget table is T-4's; nothing after re-measured, and a 68-line error made the running total look smaller. A breach that is never measured **disarms the tripwire retroactively** — arguably a mechanism gap, but it is KZ-005 in substance, so it is queued as a digest update rather than a fourth lesson.
- **Measurement artefacts lived only in a session scratchpad** and were the sole evidence for a residual the spec accepts. Transcribed into `execution.md` before archive on the validator's advice.

## Pending Items

All items below await the **apply phase on the default branch**. Nothing outside this spec's own folder and this file was written.

### Kind: `guide-sync`

| Target | Change | Severity |
|---|---|---|
| `frontend/CLAUDE.md` | Add the consent banner to the `shadow-lg` elevation-ladder consumer list — the guide's own rule is that a rung's consumers are tracked. | Low |
| `frontend/CLAUDE.md` | Note `frontend/components/shell/PublicShellFrame.tsx` as the `(public)` shell's client seam, and that it reserves the consent banner's live-measured height. | Low |

### Kind: `factual-sweep`

| Target | Stale claim → replacement | Severity |
|---|---|---|
| `docs/ux-ui/design.md` §2 (IA) | `/privacy` annotated *"Privacy notice — static content"* → the page carries one interactive client island (`ConsentChoiceControl`). | Medium |
| `docs/ux-ui/design.md` §3 (Primary User Flows) | Five flows recorded, none mentions consent → the Explore flow now begins with a consent decision on first visit. | Medium |
| `docs/ux-ui/design.md` §4 (Screen Inventory) | The `Privacy` row describes contact-submission content only → it now also discloses analytics cookies, the four collected signals, Google as recipient, and the withdrawal asymmetry. | Medium |
| `docs/ux-ui/design.md` §6 (Layout Patterns) | Enumerates container/cards/directory/forms/map patterns, no overlay bar → the public shell carries a persistent `fixed bottom-0` bar until the visitor chooses, and `PublicShellFrame` reserves its measured height. **This is where the footer-clearance rule belongs.** | **High** |
| `docs/ux-ui/design.md` §8 (Component Inventory) | No consent-banner entry → add it. | Medium |
| `docs/infrastructure.md` §4/§5 | Describes runtime config as injected from stack outputs → `deploy-frontend.sh` now bakes a **fourth** `NEXT_PUBLIC_*` and, a new pattern, the first frontend build value **not** sourced from a CloudFormation output (a GA4 measurement ID is not a secret; the ruling against SSM correctly cites `trd.md` §8). | Medium |
| `infra/scripts/deploy-frontend.sh` header | PURPOSE step 3 shows a one-variable build prefix for what is now four; the "non-secret wiring values" enumeration lists four of **seven** echoed values; USAGE omits `GA_MEASUREMENT_ID`. Pre-existing for the Cognito pair, now worse by one. | Low |

### Kind: `trd-adr`

| Target | Decision text | Supersedes | Severity |
|---|---|---|---|
| `docs/trd/trd.md` §7 (Integration Points) | Add Google Analytics 4 — the project's **first third-party client-side integration** and its first client-side data transfer to a third party. Gated on explicit consent; no server component participates. | — | Medium |
| `docs/trd/trd.md` §12.5 (ADR Index) | **New ADR, number to be allocated at apply time** (deliberately unnumbered here — allocating from a branch is the collision this gate prevents). *Consent-gated client-side analytics, contained by layout placement.* Context: the registry had no usage measurement and no fallback telemetry. Decision: GA4 default measurement only, injected only after explicit consent (non-injection rather than consent-mode denied — DD-1), mounted in the `(public)` layout so `(admin)` cannot reach it (DD-3). Consequences: zero custom events is the PII mitigation, not an omission — no call site exists that could carry an actor id or a directory search string to Google, which is ADR-010's containment-over-filtering argument applied to the client. | **Supersedes nothing** | Medium |

### Kind: `standardization`

| Lesson | Target | Proposed edit (1–3 lines) | Status | Severity |
|---|---|---|---|---|
| **L-1** | `docs/specs/general-setup/requirements.md` § Writing Standards | *A requirement's factual claims about a third-party system, the test harness, or the codebase are load-bearing exactly as its behavioural clauses are, and no gate checks them. Any such claim must cite where it was verified, or be marked unverified. A `Verify` clause is itself a claim about the harness: state the mutation and confirm the test's render path can reach it.* | pending | High |
| **L-2** | `.agents/reviewer.md` | *You audit by reading. Every red/green result in a completion report was produced by the agent that wrote the code — you can judge whether a claimed split reconciles against the source, and you must, but you cannot re-run it. Where a claim rests on a measurement whose **control** you cannot inspect, say so rather than crediting it.* | pending | High |
| **L-3** | `docs/specs/general-setup/task.md` § Testing & Verification | *A task brief states every clause the task owns and requires each be marked either (A) with the concrete mutation that reddens a named test, or (B) an unevaluable gap with its structural reason. "Structurally covered" is acceptable only as (B).* | pending | Medium |

### Kind: `digest-update`

The digest is **already at its 10-row cap**, so these are recurrence and severity updates to existing rows, not additions.

| Lesson | Update | Severity |
|---|---|---|
| **KZ-002** | **Recurrence ×4.** All 7 FAILs in this spec were this class. New forms observed: a suite passing 11/11 while blind to the defect the task existed to prevent (deleting the guarded flag left every test green); an error-path test that could not fail on 3 of the 4 properties it named, because the handler runs in a microtask the synchronous assertions never reach; and — new — **a gate whose pass state depends on where an arbitrary sample lands**, which measures nothing even at zero failures. | High (unchanged) |
| **KZ-008** | **Recurrence ×3, 11 instances in one spec, 4 blocking.** Two were *corrections that introduced a fresh false claim* — including one where the Reviewer's own suggested wording, transcribed verbatim, was falsified by a second fix folded into the same brief. | High (unchanged) |
| **KZ-004** | **Recurrence.** New form: the two-direction sweep applies **inside a single rework brief**, not only across documents. Folding two items where one's text asserts a boundary the other's change moves produces a self-falsifying instruction. | High (unchanged) |
| **KZ-005** | **Recurrence ×2 in one spec, both by the Leader.** A 68-line file-length error that **suppressed a third budget breach**, and "20 rounds / 9 FAILs" reported when the log recorded 15 and 7. Neither was cross-checked against the document containing it. Suggest raising severity to **High**: an unmeasured breach disarms the tripwire retroactively. | Medium → **High** |
