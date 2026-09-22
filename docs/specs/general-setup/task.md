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
- **Naming a falsifying input is not enough — confirm the harness can *observe* it (KZ-002 ×8, `legal/legal-notices-and-consent-copy`).** A mutation the gate structurally cannot see proves nothing while reading as rigour, and the defect is then in the **falsifier**, not the test. Three gates in one spec could not fire, including one whose named mutation (`'use client'` plus a hook) was **measured** not to break static export at all. Run the mutation, watch it redden, and assert the mutation actually applied — a `replace` that matches nothing produces a green run indistinguishable from a passing falsifier.
- **Prove the gate discriminates before trusting it (KZ-002, recurrence ×6).** **Every gate a task declares** must be shown to fail — run the mutation, watch it redden, revert. A gate that cannot fail is not a gate; it produces a result that looks like evidence and proves nothing. The rule began life scoped to `Verify` commands that grep or count **generated output** (built bundles, minified CSS, compiled artifacts), which remains its sharpest case — but `enhancement/map-coordinate-picker` widened it on evidence: requiring a *demonstrated* falsifier per task found four suites that could not discriminate and **none involved generated output** (a single-axis comparator passed all 18 seam tests; bare `<button>`s in place of the styled component left all 12 accessibility tests green because Tailwind is not compiled under `next/jest`; deleting a prop reddened zero tests; swapping two props left every test green). Three of the four were caught by the Implementer before review.
- **The falsifier's own ENVIRONMENT is part of the falsifier (KZ-002 ×9, `bugfix/deploy-script-guardrails`).** Naming
  the mutation and confirming the harness can see it is still not enough: the mutation must be RUN the way the suite
  runs it. Five mutations were run by invoking test cases directly rather than through the runner that stubs `PATH`;
  they reached the real `aws` CLI and reddened on the wrong assertion for the wrong reason. **A correct gate plus a
  correct mutation still produced a worthless result.** A case that depends on a stubbed command MUST assert that
  dependency inside itself (e.g. `[[ "$(command -v aws)" == "$STUBS/aws" ]]`), so the mistake is impossible rather
  than merely recorded.
- **A linter rule is a claim about code that the linter cannot evaluate (KZ-014, `bugfix/deploy-script-guardrails`).**
  Applying one literally can invert a check. `shelldre:S7682` ("add an explicit return at the end of the function")
  fired on a bash PREDICATE whose body was its own test; appending `return 0` — the obvious fix — makes it **always
  true** and silently disarms the filter it guards, arriving through a code-quality tool on a green Quality Gate.
  **Where a function's exit status IS its return value, make the return explicit AND correct (`if …; then return 0;
  fi; return 1`), never unconditional — then mutate to the naive form and watch the suite redden.** Record the
  reasoning at the function so the next agent does not re-derive it.
- **Sweep every clause the task owns — do not fix only the named one (L-3, `enhancement/usage-analytics`).** A task brief MUST require, for **each** clause the task owns, either **(A)** the concrete mutation that reddens a **named** test, or **(B)** an explicit unevaluable gap with its structural reason. There is no third option: *"structurally covered"* is acceptable only as **(B)**. Without this, review degenerates into whack-a-mole — each round fixes the clause that was named while the next instance of the same class survives. Measured effect when introduced preventively from attempt 1: two tasks needed 3 attempts each under *fix-the-named-clause*; the next two needed **2** and **1**, and one Implementer caught the vacuity trap itself before review.
- **An assertion about an artefact is a defect when the artefact does not bear it (KZ-008, recurrence ×2).** This governs **evidence artefacts** — capture manifests, README provenance claims, status tables in `execution.md` — exactly as it governs code comments. Re-resolve every such claim against the artefact it names at the moment it is written, and again before the record is frozen.

## Execution Conventions
- Commits use the JCSPECS standard: `[SPEC:<spec-path>] <message>`.
- The Leader maintains an audit trail in `execution.md` (one entry per loop iteration: PASS/FAIL, files, verification evidence).
- No task may introduce a new field with disclosure implications without it being declared in `requirements.md` and classified in `backend/src/common/pii-consent.policy.ts` (publicly-disclosed / contact-block / never-public, or, to withhold it, declared in the retained `PII_ALLOWLIST` **and** omitted from `PUBLICLY_DISCLOSED_FIELDS`/`CONTACT_BLOCK_FIELDS` — `PII_ALLOWLIST` alone has zero runtime consumers and withholds nothing by itself). **All three of those constants are declarations that the test suite asserts against — none has a runtime consumer.** The act that actually withholds a field is **not naming it in `toPublicListItem` / `toPublicDetail`** (`backend/src/common/role-aware.serializer.ts`), which build public output by explicit literal pick; `role-aware.serializer.spec.ts` pins both projections' exact key sets, so a field added to a pick reddens there.
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
