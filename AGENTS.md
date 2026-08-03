# AGENTS.md — ACCELERATE Tanzania Seed Registry

Tool-agnostic guidance for any AI agent (Claude Code, OpenCode, Antigravity, etc.). Mirrors `CLAUDE.md`.

## Project
Public, serverless web platform mapping Tanzania's seed system (sorghum, common bean, groundnut) for 1,000+ actors. Full context: `docs/prd.md`.

## Constitutional baseline (read before acting)
- `docs/prd.md` — product requirements (what/why, personas, scope, acceptance criteria).
- `docs/ux-ui/design.md` — UI/UX system and **design tokens**.
- `docs/trd/trd.md` — Technical Requirements Document (architecture, quality attributes, data model, API, RBAC/PII).
- `docs/infrastructure.md` — environments blueprint + the **Local Environment contract**.
- `docs/specs/general-setup/` — templates (`requirements.md`, `design.md`, `task.md`) every feature spec must follow.

> **Path migration (2026-08-03):** `docs/system-design/design.md` → `docs/ux-ui/design.md`; `docs/detailed-design/detailed-design.md` → `docs/trd/trd.md`. Archived specs under `docs/specs/archive/` are frozen records and still cite the old paths.

## Mandated stack
Next.js (App Router, TS, Tailwind, **static export**) → S3/CloudFront · NestJS (TS) → Lambda + API Gateway · RDS **MySQL** via **Prisma** · **Leaflet** maps · **AWS Cognito** auth (`admin`/`staff` groups; anonymous = `Public`).

## Hard constraints
1. All AWS CLI / deploy / IaC commands use `--profile IBD-DEV`.
2. PII (`phone`, `email`) is never exposed to `Public`; enforce server-side.
3. No Next.js SSR/route handlers — server logic stays in NestJS.
4. Use design tokens from `docs/ux-ui/design.md §7`; no hardcoded colors/geometry.

## Verification commands (agent-lean)
Failure-only variants — a green run should cost one summary line.

| Package | Verify | Lint | Build |
|---|---|---|---|
| `backend/` | `cd backend && npm test -- --silent` | `cd backend && npx eslint "{src,test}/**/*.ts" --quiet` | `cd backend && npm run build` |
| `backend/` (e2e) | `cd backend && npm run test:e2e -- --silent` | — | — |
| `frontend/` | `cd frontend && npm test -- --silent` | `cd frontend && npm run lint` | `cd frontend && npm run build` |
| `infra/` | `./infra/scripts/validate.sh` (`--profile IBD-DEV`) | — | — |

**Asymmetry rule:** suppress passing noise only — **failures print complete and verbatim**, because that output is the evidence a Reviewer audits. `backend`'s `npm run lint` runs `eslint --fix` and **mutates** files; use the `npx eslint … --quiet` form when verifying a diff.

## Concurrency protocol (the checkout is a shared resource)
Binds every session that opens this repo, persona or not. These failures are filesystem-level and no diff review catches them.

- **One AKILI session per checkout**; additional sessions use `git worktree`.
- **Never run a measurement command (build, Jest, SAM validate, E2E) while a delegated agent is active** — they contend for `node_modules`, ports, lockfiles, `.next/`, `dist/`. The failure surfaces in the *wrong* worker.
- **Measure after the worker reports, never beside it.**

## Local stack
Never guess start commands — the `## Local Environment` contract in `docs/infrastructure.md` records the primary route, no-Docker fallback, pre-check, seed/reset, health check, and ports. Local is **disposable** (agents may start/seed/reset freely); cloud/PROD deploys are **governed** by `docs/infrastructure.md` §1–5 and never improvised.

## Module Guides
Children of this file; they add to or narrow these rules and never override them. A child guide missing from this index is drift.

- `backend/AGENTS.md` (mirrors `backend/CLAUDE.md`) — NestJS/Lambda specifics: two-entrypoint shared-bootstrap discipline, serverless-http body-parsing gotcha + handler-level test harness, migrations runbook, PII/audit rules, e2e conventions, template generator.
- `frontend/AGENTS.md` (mirrors `frontend/CLAUDE.md`) — static-export rules, query-param routing pattern, token discipline, API client/type-fidelity conventions, admin shell mobile patterns, generated assets.

## Specs & taxonomy
Feature specs live in `docs/specs/<domain>/<feature-slug>/` (e.g. `actors/`, `seed-map/`, `import-export/`), each with `requirements.md`, `design.md`, `tasks.md`, `execution.md`. Use `enhancement/`, `bugfix/`, or `epic/` prefixes for non-domain changes. Completed specs move to `docs/specs/archive/<YYYY-MM-DD>-<domain>--<slug>/`. Follow the `general-setup` templates.

## AKILI multi-agent execution
`.agents/{leader,implementer,reviewer,tester}.md` drive `/akili-execute` (Leader → Implementer → Reviewer) and `/akili-test` (Leader → Tester(s)). Commits use `[SPEC:<spec-path>] <message>`.

**Evidence before checkbox:** append the `execution.md` entry with the Reviewer PASS first, then flip `tasks.md` to `[x]`, then commit. Checkbox-without-evidence is an unfalsifiable completion.

## Model Routing

Criteria-first: match the model to the **dominant cognitive demand** of the phase. Principles — **ARCHITECT = BUILDER**; **author ≠ auditor** (Reviewer never on the Implementer's model); reserve deep-reasoning for propose/specify/verify **and the orchestrating Leader**; fast & cheap for archive/formatting only — **`tasks.md` decomposition is T1, not cheap formatting**.

### Capability tiers

| Tier | Demand |
|---|---|
| **T1 Architect** | Architecture reasoning, **task decomposition**, and **live orchestration judgment** (in-flight decomposition, runtime skill selection, FAIL adjudication, pivot). |
| **T2 Coder** | High-throughput correct code and test authoring against a settled design. |
| **T3 Auditor** | Adversarial reading of someone else's diff; conformance and defect detection. |
| **T4 Context-Ingest** | Large-context repository ingestion and summarization. |
| **T5 Fast-Cheap** | Mechanical formatting, archiving, status sweeps. |
| **T6 Multimodal** | Vision — screenshots, design comps, rendered-UI comparison. |

### Phase → tier

| Phase | Tier |
|---|---|
| `/akili-constitution`, `/akili-propose`, `/akili-specify` | T1 (repo ingestion within them: T4) |
| `/akili-execute` — **Leader** | T1 — orchestration judgment |
| `/akili-execute` — **Implementer** | T2 |
| `/akili-execute` — **Reviewer** | T3 — **must differ from the Implementer's model** |
| `/akili-test` — **Leader** | T1 (orchestration) |
| `/akili-test` — **Tester(s)** | T2 — prefer a model different from the Implementer (author ≠ tester) |
| `/akili-validate`, `/akili-audit` | T3 |
| `/akili-archive`, status sweeps | T5 |
| Visual/UI comparison against comps | T6 |

### Model registry — *Updated: 2026-08*

| Tier | Claude Code (`claude`) | OpenCode (`opencode`) | Antigravity (`agy`) | Fallback |
|---|---|---|---|---|
| **T1 Architect** | `opus` | `opencode/claude-opus-5` | `gemini-3.1-pro-high` | `sonnet` |
| **T2 Coder** | `sonnet` | `opencode/claude-sonnet-5` | `gemini-3.6-flash-high` | `haiku` |
| **T3 Auditor** | `opus` | `opencode/gpt-5.5-pro` | `claude-opus-4-6-thinking` | `sonnet` |
| **T4 Context-Ingest** | `sonnet` | `opencode/gemini-3.1-pro` | `gemini-3.1-pro-high` | `haiku` |
| **T5 Fast-Cheap** | `haiku` | `opencode/gemini-3.6-flash` | `gemini-3.6-flash-low` | `sonnet` |
| **T6 Multimodal** | `opus` | `opencode/gemini-3.1-pro` | `gemini-3.1-pro-high` | — |

CLI invocations confirmed on this machine: **Claude Code** `claude` · **OpenCode** `opencode` (v1.18.8) · **Antigravity** `agy` (v1.1.8, *not* `antigravity`). OpenCode slugs from `opencode models`; Antigravity identifiers from `agy models` (that host exposes effort-suffixed identifiers, not bare `pro`/`flash`).

**Cross-host dispatch:** T6 Multimodal → **Antigravity** (Gemini vision). Reach across hosts before degrading within one, but only for a real capability gap — a cross-host spawn costs a fresh context that a one-tier difference does not repay. Routing preference only; the dispatcher is a property of the machine, not the project.

**To change models, edit only this registry table.** Never pin a dated model name where a floating alias exists. Model selection is guidance only in command prompts — **never add `model:` to command frontmatter**; enforced bindings live only in the agent wrappers (`.claude/agents/`, `.opencode/agent/`, `.agents/agents/`).

### Effort dial

Effort is the second, **per-task** dimension, orthogonal to the tier: the tier picks the model, effort picks how hard it thinks on *this* task.

| Signal | Effort |
|---|---|
| Trivial / mechanical (copy, config, rename) | `low` |
| Standard, well-specified scope | `medium` |
| Complex — algorithm, concurrency, security, ambiguity | `xhigh` |
| Correctness-critical (PII boundary, auth, migrations) | `max` |

**Defaults by role:** T1 propose/specify/Leader `high` · T2 Implementer/Tester `medium` (flex by task) · T3 Reviewer `high` · T5 archive `low`.

- **Rework rule:** bump effort one level on every retry — a failed fix is usually under-thinking, not missing instructions.
- **Tier ↔ effort rule:** never `max` a cheaper tier; escalate the tier instead.
- **Re-baseline rule:** defaults are **per-generation** and must be re-swept on a real spec whenever the model generation changes. The tier mapping survives model churn; these defaults do not. An under-specified task (`[~]` resume, post-Pivot retry) starts one level higher.
- **Effort is not a verbosity dial:** fix long reports in the brief (`caveman`, `cognitive-doc-design`), never by dropping effort.

## Skill Map

Stack skills are never hard-referenced by AKILI commands — this map is how they reach the agents.

| Skill | Applies To | When to load |
|---|---|---|
| `nestjs-expert` | `backend/src/**` | Any NestJS module, guard, interceptor, DI, or Jest/Supertest work. |
| `api-design-principles` | `backend/src/**` (controllers, DTOs) | Adding/changing an `/api/v1` endpoint, pagination, or response envelope. |
| `error-handling-patterns` | `backend/src/common/**` | Exception filters, error envelopes, partial-failure paths (CSV import). |
| `aws-serverless` | `backend/src/lambda.ts`, `infra/**` | Lambda cold-start, SAM templates, API Gateway, RDS-from-Lambda connections. |
| `tailwind-design-system` | `frontend/**` | Token work in `tailwind.config.ts`; enforcing `docs/ux-ui/design.md §7`. |
| `shadcn-ui` | `frontend/components/ui/**` | Adding or adapting a shadcn primitive. |
| `vercel-react-best-practices` | `frontend/**` | React/Next performance, bundle, data-fetching review. |
| `react-doctor` | `frontend/**` | After a substantive React change, before reporting completion. |
| `frontend-design` / `ui-ux-pro-max` | `frontend/app/**`, `frontend/components/**` | Visual craft on a screen or component. |
| `product-manager-toolkit` | `docs/prd.md`, `docs/specs/**` | PRD edits, personas, success metrics, requirement authoring. |
| `software-architect` | `docs/trd/trd.md` | TRD changes: quality-attribute scenarios, tactics, ADRs, C4 views. |
| `systematic-debugging` | anywhere | Any bug, test failure, or unexpected behavior — before proposing a fix. |
| `tdd` | `backend/src/**` (logic-heavy) | **Leader-assigned per task, never blanket.** Earns its cost on business rules, PII/consent gating, import/export logic; overhead on copy/styling/config. |
| `playwright-cli` | E2E / browser verification | *Only when installed in the running environment.* Not vendored here; teammates without it must still run every command. |
| `orchestration` | Leader, before cross-host or parallel dispatch | *Only when the environment provides it* (Orca). Never a prerequisite. |

During `/akili-specify`, derive each task's required skills from this map. During `/akili-execute` and `/akili-test`, the **Leader assigns** these skills and the Implementer/Tester must load them before writing code or tests.

## CodeGraph
Re-indexed 2026-08-03 — 290 files, 2,688 nodes, 6,881 edges. Prefer `codegraph_*` tools (search, callers/callees, impact) over broad grep for symbol-level questions; graph lookups do **not** count toward the Leader's 4-file delegation threshold (that counts full-file reads). Re-index (`codegraph index`) after merging a spec. Config is committed; the generated database is gitignored — never commit it.
