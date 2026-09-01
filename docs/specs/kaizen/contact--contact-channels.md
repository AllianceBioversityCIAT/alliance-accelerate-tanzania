# Kaizen Entry — contact/contact-channels

## Document Control

| Field | Value |
|---|---|
| Spec Path | `contact/contact-channels` |
| Date | 2026-08-31 |
| Branch | `contact-section` — **spec branch** (default is `main`, via `origin/HEAD`; no `Default Branch:` pin exists in the constitution) |
| Archive Run | 1 |
| Approval Mode | gated |

## Metrics

| Signal | Value | Source |
|---|---|---|
| Tasks executed | 11 of 11 | `tasks.md` |
| Reviewer FAIL rework attempts | 1 (T-9, 2 attempts) | `execution.md` — T-9 |
| Tasks **reopened after passing** | 3 (T-2, T-3, T-5) — each by a Leader decision amending the design *after* the task was `[x]` | `execution.md` — Decisions A, B, C |
| Task reworked after a **human** gate failed | 1 (T-10, DC-9) | `execution.md` — T-10 DC-9 closure |
| HALTs / FATAL_FAILs | 0 | `execution.md` |
| Agent runtime failures | 1 (T-9's predecessor died pre-report; resumed rather than re-spawned) | `execution.md` |
| Pivots (`## Pivot Record`) | 0 recorded — but an **owner scope cut** removed an entire endpoint mid-spec | `proposal.md` §2.1 |
| Judgment-day rounds | **4**, terminal state **ESCALATED** | `judgment.md` |
| Judgment-day severe findings | 11 confirmed by both judges in round 1 alone | `judgment.md` §S |
| Design revisions | 6 | `design.md` |
| PRODUCT_BUGs | n/a — `/akili-test` not run | `validation-report.md` §8 |
| Validation FAIL / WARN findings | **4 / 6** | `validation-report.md` §5 |
| Validation WARN results | 3 (NFR-5, NFR-6, T-11) | `validation-report.md` §3, §4 |

**MUDA hunt.** The dominant waste was not implementation. It was **rework of the specification by its own author**: four adversarial rounds on a *document*, six revisions, three tasks reopened after passing, and an escalation whose root cause was a mechanism this spec had introduced itself. The owner named it directly mid-execution — *"No entiendo como un ajuste tan básico como una sección de contacto ha tomado todo el día"* — and was correct.

## Lessons

Three. Most of this spec's documentation findings were **not** new lessons — see `## Pending Items` D1–D3, where they are recorded as recurrences of KZ-004, KZ-008 and KZ-005 rather than duplicated here.

- **KZ-contact--contact-channels-1 — A design decision outlived the problem it was introduced to solve, and nothing re-derived it.** (Product + Methodology, **High**)
  - Root cause (5W1H): *why* did fire-and-forget dispatch exist? To close an **enumeration timing oracle** on the actor-contact endpoint (round-3 finding F-3). *What changed?* The owner cut that endpoint. *What did not?* The mechanism. No step in `/akili-execute` or in the judgment loop re-derives standing design decisions against a scope change, so it survived as inertia — buying only latency — and became the **root cause of six of the seven round-4 findings**: an unbuildable seam, a gate blind to its own violation, a racing structural gate, a partial-drain rule, a swallowed configuration error, and FR-5 narrowed away from its trigger. Removing it dissolved seven findings at once and made the design *shorter*.
  - Evidence: `judgment.md` round 4 (escalation); `design.md` DD-3 *"supersedes revisions 3–5"*; `requirements.md` FR-2's twice-amended note; `proposal.md` §2.1.
  - Standardization: → P1

- **KZ-contact--contact-channels-2 — Rendered geometry was inferred from CSS class inspection when it was measurable, and four review rounds propagated the wrong number.** (Product, **High**)
  - Root cause: no rule requires *measuring* layout. Reviewers reasoned about the header from Tailwind classes and arithmetic on estimated glyph widths. That estimate was wrong by **46px** (1224 estimated vs **1270** measured) and — decisively — missed that `max-w-7xl` caps usable width at **1216px permanently**, which is the single fact that determined the fix. It made "defer the descriptor to a wider breakpoint" look viable when it is *impossible*. Four rounds discussed this bar; the defect was found by the **owner**, opening a page-level horizontal scrollbar at 768px, and the whole diagnosis was replaced by one browser measurement taken in minutes.
  - Evidence: `execution.md` — T-10 DC-9 closure measurement table; `design.md` §5.2 (pre-fix description, corrected at validation); `validation-report.md` F-5.
  - Standardization: → P2

- **KZ-contact--contact-channels-3 — A change deemed too small for a Reviewer produced the worst finding in the whole validation, inside a constitutional baseline.** (Product, Medium)
  - Root cause: T-11 was configuration and documentation, judged low-risk, and the Leader **deliberately dispatched no Reviewer** — a decision recorded as reasoned and proportionate at the time. That same change wrote a false deployment topology into `docs/infrastructure.md` (*"CloudFront … proxies `/api`"*), contradicting §3 and §4 of its own document, and it was the only `FAIL` in a baseline the validation found. Risk was assessed by **diff size**, not by **blast radius**: a baseline document trains every future agent, so a wrong sentence there costs more than a wrong line of code, which a test would have caught.
  - Evidence: `execution.md` — T-11 *"No Reviewer was dispatched"*; `validation-report.md` F-1; `infra/30-frontend/template.yaml` (single S3 origin, no `/api` behaviour).
  - Standardization: → P3

## Noted, not a lesson

- **`/akili-test` was never run** — tests were authored inside `/akili-execute` by the Implementers, so *author ≠ reviewer* held throughout but *author ≠ tester* did not. Recorded as an accepted gap in `validation-report.md` §8 with its narrow high-value scope. Not yet a lesson: one occurrence, and the validation independently traced every clause.
- **A backend test failed once and was not identified** (`--silent` suppressed the detail; two subsequent full runs green). Recorded as unidentified rather than assigned to the known `registrations` 429-isolation flake. Feeds the recurrence check if unattributed failures repeat.
- **The pre-existing `admin/actors/import` ordering flake** (~1 in 5 full-suite runs, passes 6/6 in isolation) belongs to `import-export/partner-profile-onboarding`, not here. Surfaced twice now across specs.
- **`getCognitoAdminClient()` demands `COGNITO_CLIENT_ID` for a value `ListUsersInGroup` never uses**, and the bare `catch` hides the resulting silent fallback. Below the lesson bar as a one-line coupling; recorded in `execution.md` for the auth module's owner.
- **The AKILI slash commands live only at user level** (`~/.claude/commands/`), while root `CLAUDE.md` cites them as project process. A teammate cloning this repo has the personas but not the commands. Sub-threshold; noted for recurrence.

## Pending Items

> **Spec branch — nothing below has been written.** Every item awaits the apply phase on `main`. Recording them here loses nothing; applying them from this branch would write shared files the gate exists to protect.

### P1

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `.agents/leader.md` |
| Edit | **When scope is cut or a requirement is withdrawn mid-spec, re-derive every standing design decision whose stated rationale cited the removed surface.** A mechanism that outlives its reason is a defect, not inertia — and it will be defended by the findings it generates. |
| Severity | High |
| Status | pending |

### P2

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `frontend/CLAUDE.md` |
| Edit | **Never infer rendered geometry from class inspection.** Any "does it fit / overflow / crowd" question is answered by measuring `scrollWidth` vs `clientWidth` in a real browser, never by estimating glyph widths. Note that a `max-w-*` container caps usable width **permanently**, so "show it at a wider breakpoint" is frequently impossible rather than merely undesirable. |
| Severity | High |
| Status | pending |

### P3

| Field | Value |
|---|---|
| Kind | standardization |
| Target | root `CLAUDE.md` § AKILI multi-agent execution |
| Edit | **Reviewer dispatch is decided by blast radius, not diff size.** Any task touching a constitutional baseline (`docs/prd.md`, `docs/ux-ui/design.md`, `docs/trd/trd.md`, `docs/infrastructure.md`, `CLAUDE.md`) gets a Reviewer even when it is "just docs" — those files train every future agent, and no test covers them. |
| Severity | Medium |
| Status | pending |

### D1

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | **KZ-004** |
| Edit | Add `contact/contact-channels` as a source spec. **Recurrence ×2 (2026-08-31), and the standardization did not hold** — KZ-004 is already `Applied` in `.agents/leader.md` § Applying a correction, yet this spec produced *seven* instances of the same root cause: an amendment applied to one document while sibling statements resting on the withdrawn premise survived. Four were caught during execution (the fire-and-forget artifacts behind Decisions A–C and NFR-1's settle clause); three more survived to validation (`validation-report.md` F-3 phantom `DD-6` in two documents, F-4 NFR-2 never amended, F-5 the nav description that outlived its own fix). Recommend raising the rule from "grep the superseded value" to "grep the withdrawn **premise**" — the surviving sentences quoted no shared figure, which is precisely why a value-grep missed them. |
| Severity | High |
| Status | pending |

### D2

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | **KZ-008** |
| Edit | Add `contact/contact-channels` as a source spec. **Recurrence ×3.** This spec produced the pattern in every artefact class it touched: two constitutional baselines (`docs/infrastructure.md`'s false CloudFront topology, `docs/trd/trd.md`'s *"Always 202"*), a requirement claiming a build assertion that does not exist (F-6), a task table claiming an analytics assertion that does not exist (F-7), a TRD scenario describing a spy over log lines that never run (F-9), and code docblocks naming two functions that do not exist (F-10). Confirms the lesson's own clause that it *"recurs at every level of its own correction"*. |
| Severity | High |
| Status | pending |

### D3

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | **KZ-005** |
| Edit | Add `contact/contact-channels` as a source spec. **Recurrence ×2.** One browser measurement was published as two different figure sets — `execution.md` carried the final numbers (935px / 41px / 1015px / 201px) while `docs/ux-ui/design.md` carried the pre-CTA-margin ones (931 / 45 / 1007 / 209), both presented as measured. Extends the lesson from *"numeric claim vs prose"* to *"the same measurement published twice"*, which no prose cross-check catches. |
| Severity | Medium |
| Status | pending |

### G1

| Field | Value |
|---|---|
| Kind | guide-sync |
| Target | `backend/CLAUDE.md` and `frontend/CLAUDE.md` |
| Edit | Backend: note that `src/contact/` is a **stateless, no-Prisma module** whose zero-writes property is disciplinary, gated only by `contact-no-writes.e2e.spec.ts` — `PrismaModule` is `@Global()`, so nothing structurally prevents a write. Frontend: note that `components/contact/` never reads `err.message` or `err.status` (FR-5), partitioning solely on `Array.isArray(err.details)`. |
| Severity | Medium |
| Status | pending |

### F1

| Field | Value |
|---|---|
| Kind | factual-sweep |
| Target | root `CLAUDE.md` § Verification commands |
| Edit | Annotate the `infra/` row: `./infra/scripts/validate.sh` **currently exits non-zero on every run** — `20-backend` fails cfn-lint `W2531` on the EOL `nodejs20.x` runtime, unrelated to any change under test. Tracked as **ATP-60**. Until fixed, a red result from this command is not evidence about the change being verified. |
| Severity | High |
| Status | pending |

> **No `trd-adr` item.** DD-3's move from fire-and-forget to an awaited send governs this endpoint only; it overturns no ADR recorded in `docs/trd/trd.md`. The registrations path keeps its own fire-and-forget dispatch and its documented rationale, untouched.
