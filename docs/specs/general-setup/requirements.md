# Template — `requirements.md`

> Methodology template. Every feature spec under `docs/specs/<spec-path>/requirements.md` MUST follow this structure.
> This is NOT a feature spec. Copy and fill it when running `/akili-specify`.

## Spec Header (required)

```
# Requirements — <Feature Name>
- Spec path: docs/specs/<taxonomy>/<feature-slug>/
- Status: Draft | Approved | In Progress | Done | Archived
- Author / Date:
- Related: docs/prd.md §<n>, docs/ux-ui/design.md §<n>, docs/trd/trd.md §<n>
```

## 1. Summary
One paragraph: what this feature is and which PRD goal/user story it advances.

## 2. Requirement Numbering & Writing Standards
- Functional requirements are numbered **`FR-1`, `FR-2`, …**; non-functional **`NFR-1`, …**.
- Each requirement is **atomic, testable, and unambiguous**. No "fast"/"intuitive" without a measurable definition.
- Use **MUST / SHOULD / MAY** (RFC 2119) to signal priority.
- Each requirement traces upward (to a PRD user story / acceptance criterion) and downward (to tasks in `task.md`).

- **Reconcile figures against prose (KZ-005).** Every numeric claim must be cross-checked against narrative
  statements elsewhere in the same spec before it is published; a count that contradicts a sentence in a
  sibling document is a defect detectable without re-measuring.

- **A requirement's factual claims are load-bearing, and no gate checks them (L-1, `enhancement/usage-analytics`).**
  Every AKILI gate verifies one direction: *does the code match the spec?* Nothing asks whether the spec is
  **true**. A requirement that is internally consistent and externally false passes every gate the methodology
  has — and reaches code, and visitor-facing copy, unchallenged. So: any assertion about a **third-party system**,
  the **test harness**, or the **codebase** must cite where it was verified, or be explicitly marked unverified.
  Two corollaries, both from real defects:
  - **A `Verify` clause is itself a claim about the harness.** State the mutation that should redden the test *and*
    confirm the test's render path can actually reach it. A falsifying-input clause naming a mutation the harness
    cannot observe proves nothing while reading as rigour.
  - **An accepted-risk or accepted-limitation list is a claim about rendered reality.** Write it from a measurement,
    never from reasoning. One such list went 1 → 3 → 10 across two corrections; every correction came from measuring,
    none from re-reading.

- **Cite stable anchors, not line numbers (KZ-009).** `file:line` decays on its own — every edit above the
  cited line falsifies it, including edits made by the same task. In any persistent document, anchor citations
  to a **symbol, a unique class or literal string, or a section title**, and use bare line numbers only in
  transient agent reports.

## 3. Functional Requirements
For each:
```
### FR-<n>: <short title>
- **Description:** <what the system must do>
- **Rationale / Source:** PRD US-<n> / AC-<n>
- **Acceptance criteria (Given/When/Then):**
  - GIVEN <context> WHEN <action> THEN <observable outcome>
- **PII/RBAC impact:** <which roles; is PII involved? reference docs/trd/trd.md §8>
```

## 4. Non-Functional Requirements
Performance, security, accessibility (WCAG 2.1 AA), availability, cost. Each measurable (e.g. "p95 < 1s over 1,000 records").

## 5. Data & Schema Impact
New/changed entities or fields vs. `docs/trd/trd.md §3`. Flag any new **PII** field (must be added to the PII allowlist).

## 6. Out of Scope
Explicit non-goals for this spec.

## 7. Dependencies & Assumptions
Upstream specs, AWS resources (note `IBD-DEV` profile), open questions inherited from the PRD.

## 8. Open Questions
Anything needing user/stakeholder confirmation before `/akili-execute`.

---
**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email` (+ any newly flagged). All AWS commands use `--profile IBD-DEV`.
