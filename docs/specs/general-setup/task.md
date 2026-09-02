# Template — `tasks.md`

> Methodology template. Every feature spec stores its executable task list as `docs/specs/<spec-path>/tasks.md` following this format.
> Consumed by `/akili-execute` (Leader → Implementer → Reviewer loop). This is NOT a feature spec.

## Task Format

Each task is a single checklist item with an ID, status box, dependencies, and a verification command.

```
- [ ] T-<n> <imperative title>  (deps: T-<x>, T-<y> | none)
      Scope: <what to implement — narrow, single-concern>
      Traces: FR-<n> (requirements.md), design.md §<n>
      Files: <expected files/dirs touched>
      Verify: <exact command, e.g. `cd backend && npm run test -- actors`>
      Done when: <observable, testable completion condition>
```

### Status boxes
- `[ ]` not started · `[~]` in progress / halted (see `execution.md`) · `[x]` complete & reviewed PASS.

### Status transitions (managed by the Leader)
`[ ]` → `[~]` on start → `[x]` on Reviewer PASS. A task that fails review 3× stays `[~]` and is escalated.

### Coverage closure (KZ-001)
Decomposition is complete only when **every scenario and every MUST/`BUT it must NOT` clause** — not merely every requirement *ID* — maps to a named task. A traceability table keyed on IDs hides scenario-level gaps. **A gap may never be discharged by citing a different requirement that happens to be satisfied**; each clause is owned or it is unowned.

## Dependency Graph
List edges so the Leader can pick the next eligible task (all deps `[x]`):
```
T-1 → T-2 → T-4
T-1 → T-3 → T-4
```
A task is **eligible** when its status is `[ ]`/`[~]` and every dependency is `[x]`. Order ties broken by document order.

## Testing & Verification Expectations

**Presence is not behaviour — and this applies to documents, not only tests (KZ-002, recurrence).** A procedure
carrying every required clause can still be unexecutable. Operator-facing documents are verified against the
**running product**, not against the spec that specified them.
- Every task MUST carry a runnable `Verify` command; the Implementer runs it before reporting completion.
- Prefer the smallest verifying command (targeted test) over full-suite runs.
- Backend: `npm run test` / `npm run build` / `npm run lint`. Frontend: `npm run build` / `npm run lint` / component tests.
- Infra tasks: validation/plan/dry-run commands, always with `--profile IBD-DEV`.
- **A presence-assertion is not a behavioral proof (KZ-002).** A test asserting that a class, config entry, or attribute *exists* must record what it **cannot** prove — it will pass while the feature does nothing. A property the harness structurally cannot evaluate (layout, contrast, focus order, whether a style actually applies) is **not covered**: route it to a human/T6 check instead of counting it as verified.
- **Prove the gate discriminates before trusting it (KZ-002, recurrence ×3).** A `Verify` command that greps or counts **generated output** (built bundles, minified CSS, compiled artifacts) MUST be run against the **pre-change** state and shown to return a different result. A gate that cannot fail is not a gate — it produces a number that looks like evidence and proves nothing.
- **Sweep every clause the task owns — do not fix only the named one (L-3, `enhancement/usage-analytics`).** A task brief MUST require, for **each** clause the task owns, either **(A)** the concrete mutation that reddens a **named** test, or **(B)** an explicit unevaluable gap with its structural reason. There is no third option: *"structurally covered"* is acceptable only as **(B)**. Without this, review degenerates into whack-a-mole — each round fixes the clause that was named while the next instance of the same class survives. Measured effect when introduced preventively from attempt 1: two tasks needed 3 attempts each under *fix-the-named-clause*; the next two needed **2** and **1**, and one Implementer caught the vacuity trap itself before review.
- **An assertion about an artefact is a defect when the artefact does not bear it (KZ-008, recurrence ×2).** This governs **evidence artefacts** — capture manifests, README provenance claims, status tables in `execution.md` — exactly as it governs code comments. Re-resolve every such claim against the artefact it names at the moment it is written, and again before the record is frozen.

## Execution Conventions
- Commits use the JCSPECS standard: `[SPEC:<spec-path>] <message>`.
- The Leader maintains an audit trail in `execution.md` (one entry per loop iteration: PASS/FAIL, files, verification evidence).
- No task may introduce a new PII field without it being declared in `requirements.md` and added to the PII allowlist.
- Tasks touching AWS MUST keep `--profile IBD-DEV`.

## Example (illustrative)
```
- [ ] T-1 Add `marketSegment` field to Actor model  (deps: none)
      Scope: Prisma model + migration; no API change yet.
      Traces: FR-2, design.md §2
      Files: backend/prisma/schema.prisma, backend/prisma/migrations/*
      Verify: `cd backend && npx prisma migrate dev --name add_market_segment && npm run build`
      Done when: migration applies cleanly and client types compile.
```
