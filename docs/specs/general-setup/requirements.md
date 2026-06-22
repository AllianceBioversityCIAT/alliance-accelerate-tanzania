# Template — `requirements.md`

> Methodology template. Every feature spec under `docs/specs/<spec-path>/requirements.md` MUST follow this structure.
> This is NOT a feature spec. Copy and fill it when running `/sdd-specify`.

## Spec Header (required)

```
# Requirements — <Feature Name>
- Spec path: docs/specs/<taxonomy>/<feature-slug>/
- Status: Draft | Approved | In Progress | Done | Archived
- Author / Date:
- Related: docs/prd.md §<n>, docs/system-design/design.md §<n>, docs/detailed-design/detailed-design.md §<n>
```

## 1. Summary
One paragraph: what this feature is and which PRD goal/user story it advances.

## 2. Requirement Numbering & Writing Standards
- Functional requirements are numbered **`FR-1`, `FR-2`, …**; non-functional **`NFR-1`, …**.
- Each requirement is **atomic, testable, and unambiguous**. No "fast"/"intuitive" without a measurable definition.
- Use **MUST / SHOULD / MAY** (RFC 2119) to signal priority.
- Each requirement traces upward (to a PRD user story / acceptance criterion) and downward (to tasks in `task.md`).

## 3. Functional Requirements
For each:
```
### FR-<n>: <short title>
- **Description:** <what the system must do>
- **Rationale / Source:** PRD US-<n> / AC-<n>
- **Acceptance criteria (Given/When/Then):**
  - GIVEN <context> WHEN <action> THEN <observable outcome>
- **PII/RBAC impact:** <which roles; is PII involved? reference detailed-design §8>
```

## 4. Non-Functional Requirements
Performance, security, accessibility (WCAG 2.1 AA), availability, cost. Each measurable (e.g. "p95 < 1s over 1,000 records").

## 5. Data & Schema Impact
New/changed entities or fields vs. `detailed-design.md §3`. Flag any new **PII** field (must be added to the PII allowlist).

## 6. Out of Scope
Explicit non-goals for this spec.

## 7. Dependencies & Assumptions
Upstream specs, AWS resources (note `IBD-DEV` profile), open questions inherited from the PRD.

## 8. Open Questions
Anything needing user/stakeholder confirmation before `/sdd-execute`.

---
**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email` (+ any newly flagged). All AWS commands use `--profile IBD-DEV`.
