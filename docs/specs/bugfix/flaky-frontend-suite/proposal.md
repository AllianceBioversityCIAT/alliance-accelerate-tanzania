# Proposal — The frontend Jest suite is nondeterministic under parallel load

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `bugfix/flaky-frontend-suite` |
| Proposal date | 2026-08-07 |
| Author | AKILI (Leader) on behalf of JuanCode |
| **Type** | **Bugfix** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting `/akili-specify` |
| **Parallel-safe** | **yes** — test-harness only; no production code |
| Suggested depth | **Standard** — the fix is small once located, but locating it is a real diagnosis, and the acceptance criterion must survive being *fooled by chance* |
| Origin | Characterised during `enhancement/app-visual-refresh`, where it made T-6's `tasks.md` gate literally unusable and had to be restated mid-execution |

## 2. Problem / Current Behaviour

`cd frontend && npm test -- --silent` returns a **different result on every run against an identical tree**. Four consecutive runs on the same commit:

| Run | Failures | Suites that failed |
|---|---|---|
| 1 | **1** | `app/(admin)/admin/actors/import/page.test.tsx` |
| 2 | **0** | — |
| 3 | **3** | 3 suites |
| 4 | **3** | `actors/page.test.tsx`, `ActorForm.test.tsx` |

The failing **identity changes between runs**, which is what rules out a genuine assertion bug.

Every suite observed failing **passes in isolation**: the two from run 4 pass **65/65 in 12.5 s**, versus **45–56 s** for the same suites under full-suite load. The durations are the tell — these are timeouts under resource contention, not wrong expectations.

## 3. Why this matters more than a nuisance

**A nondeterministic suite cannot serve as a release gate, and it quietly disables every gate defined in terms of it.**

Concretely, during `app-visual-refresh`:

1. The spec's pre-execution baseline recorded the failure as *"deterministic across two consecutive full-suite runs — it is not a flake."* **That conclusion was wrong**, drawn from a two-run sample. It is recorded, superseded in place, in that spec's `execution.md`.
2. T-6's done-condition read *"gates green"*, which is unreachable. It was restated as *"no new failures against the recorded baseline (1 failed)"* — **also unusable**, because the baseline is not a fixed number.
3. It had to be restated a second time, mid-execution, as a **per-suite isolation gate**: every suite failing under load must pass in isolation, and no failure may reference a token that spec changed.

That third form is a workaround, not a gate. It cannot detect a *real* regression that happens to look like the flake — which is the actual danger. A genuine order-dependent bug introduced tomorrow would be indistinguishable from today's noise, and the honest reviewer would wave it through.

There is a second-order cost the team is already paying: **the suite trains its readers to ignore it.** A red run is currently uninformative, so red stops meaning anything.

## 4. Hypotheses to test (not conclusions)

Ordered by how cheaply they can be falsified. `/akili-specify` should treat these as a starting list, not an answer.

1. **Shared mutable module state across suites** — a module-level cache, a singleton API client, or an unreset `jest.mock` leaking between files that Jest's per-worker module registry does not isolate the way the tests assume.
2. **Real timers / unawaited async** — a `setTimeout`, debounce, or un-awaited promise resolving after its test completes, so the failure lands in whichever suite happens to be running next. This fits the *varying identity* better than anything else.
3. **Default `testTimeout` too tight for loaded workers** — 45–56 s vs 12.5 s isolated says the machine is saturated. Raising the timeout would *mask* rather than fix, so this must be distinguished from (1) and (2), not conflated with them.
4. **Worker count vs available cores** — `maxWorkers` unset on a machine also running dev servers and other agents.

Note that `next/jest` uses SWC and performs **no type checking**, so nothing here is a compile-order effect.

## 5. Acceptance criteria — the part that needs care

The obvious criterion is *"the suite passes."* **That is not sufficient: it passed on run 2 while fully broken.** A single green run is exactly the evidence this bug knows how to produce.

Any acceptance evidence MUST therefore be **statistical and adversarial**:

- **N consecutive full-suite runs green**, N ≥ 10, on a *loaded* machine — not a quiet one. A quiet-machine pass reproduces the run-2 illusion.
- Deliberately **hostile scheduling** must also stay green: `--randomize` (or equivalent seed shuffling) and a constrained `--maxWorkers`, since order-independence is the property actually being claimed.
- If the resolution is a raised timeout, the spec MUST state plainly that it is **mitigation, not a fix**, and say what remains unproven — otherwise this closes as a KZ-002 presence assertion wearing a green checkmark.

## 6. Out of scope

- The three pre-existing `no-img-element` lint advisories in `*.test.tsx` files (unrelated, zero errors).
- Backend (`backend/`) test stability — not observed to have this problem.
- Any production-code change. If diagnosis finds a **product** bug rather than a harness bug, that is a finding to escalate and re-scope, not to fix inside this spec.

## 7. Risks

| Risk | Mitigation |
|---|---|
| "Fixed" by raising timeouts, hiding a real leak | §5 forbids claiming a fix for a mitigation; hostile-scheduling runs are required |
| Flake is environment-specific (this machine's core count) | Record cores/load with the evidence; reproduce under a constrained `maxWorkers` |
| Chasing it consumes more than it returns | Timebox diagnosis; if unlocated, land the *gate* honestly (isolation-based, documented as such) and stop — a truthful weak gate beats a false strong one |
