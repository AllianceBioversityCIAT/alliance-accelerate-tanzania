# CLAUDE.md — ACCELERATE Tanzania Seed Registry

Guidance for Claude (and any AI agent) working in this repository.

## What this project is
A public, serverless web platform that maps and visualizes Tanzania's seed system ecosystem (sorghum, common bean, groundnut value chains) for 1,000+ actors. See `docs/prd.md` for the full product context.

## Constitutional baseline — read these first
These documents are the source of truth. Consult them before writing code or specs:

| Document | What it is | Consult when |
|---|---|---|
| `docs/prd.md` | Product requirements: problem, personas, goals, scope, user stories, acceptance criteria. | Clarifying *what* to build or *why*; checking scope. |
| `docs/ux-ui/design.md` | UI/UX system: IA, flows, screens, **design tokens**, components, accessibility. | Building/styling any UI; never hardcode colors/spacing — use the tokens here. |
| `docs/trd/trd.md` | Technical Requirements Document: architecture, quality-attribute scenarios, data model, API surface, RBAC/PII. | Implementing backend/frontend/data; matching schemas and contracts. |
| `docs/infrastructure.md` | Environments blueprint: cloud components, deploy strategy, network/security, and the **Local Environment contract**. | Deploying, provisioning, or starting the local stack. |
| `docs/specs/general-setup/` | Methodology templates (`requirements.md`, `design.md`, `task.md`) for every feature spec. | Running `/akili-specify`; formatting new specs. |

These form the **constitutional baseline** for all AKILI-SPECS work. Module/feature specs live under `docs/specs/<taxonomy>/<feature-slug>/` and must follow the general-setup templates.

> **Path migration (2026-08-03):** the UX/UI blueprint moved from `docs/system-design/design.md` → `docs/ux-ui/design.md`, and the technical blueprint from `docs/detailed-design/detailed-design.md` → `docs/trd/trd.md`. Archived specs under `docs/specs/archive/` are frozen historical records and still cite the old paths — read them with that mapping in mind.

## Mandated stack (do not substitute)
- **Frontend:** Next.js (App Router, TypeScript, Tailwind), **static export** → S3 → CloudFront.
- **Backend:** NestJS (TypeScript), serverless REST API → AWS Lambda + API Gateway (AWS SAM / CloudFormation; IaC defined under `infra/` as SAM templates).
- **Database:** AWS RDS **MySQL** via **Prisma**.
- **Maps:** **Leaflet**. **Auth/RBAC:** **AWS Cognito** (groups `admin`, `staff`; anonymous = `Public`).

## Hard constraints
- **AWS profile:** every AWS CLI command, deploy script, and IaC/Serverless definition **MUST** use `--profile IBD-DEV` — **except `infra/scripts/deploy-frontend.sh`, which reads `AWS_PROFILE` and parses no flags** (`AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`); passing it `--profile` is silently ignored and an ambient profile wins.
- **PII protection:** `phone` and `email` are PII — never exposed to the `Public` role in any API response, page, or export. Enforce server-side in the role-aware serializer (defense in depth), not just in the client.
- **Static export:** no Next.js SSR/ISR/route handlers — all server logic lives in the NestJS API.
- **Design tokens:** use tokens from `docs/ux-ui/design.md §7` — no hardcoded colors/geometry.

## Verification commands (agent-lean)
Agents run these on every task, so the canonical form is the **failure-only** variant — a green run should cost one summary line.

| Package | Verify | Lint | Build |
|---|---|---|---|
| `backend/` | `cd backend && npm test -- --silent` | `cd backend && npx eslint "{src,test}/**/*.ts" --quiet` | `cd backend && npm run build` |
| `backend/` (e2e) | `cd backend && npm run test:e2e -- --silent` | — | — |
| `frontend/` | `cd frontend && npm test -- --silent` | `cd frontend && npm run lint` | `cd frontend && npm run build` |
| `infra/` | `./infra/scripts/validate.sh` (SAM validate, `--profile IBD-DEV`) | — | — |

**Asymmetry rule — this is not a quiet-everything rule.** Suppress passing noise only. **Failures always print complete and verbatim**: an agent reporting a failure must paste the full output, because that output *is* the evidence a Reviewer audits. Note `npm run lint` in `backend/` runs `eslint --fix`, which **mutates** files; agents verifying a diff must use the `npx eslint … --quiet` form above so the lint pass never edits the change under review.

## Concurrency protocol (the checkout is a shared resource)
Binds **every** session that opens this repo, including ones that load no persona. These failures are filesystem-level, so no diff review catches them.

- **One AKILI session per checkout.** Additional concurrent sessions use `git worktree`. Two Leaders in one tree interleave commits and overwrite each other's `tasks.md` / `execution.md` transitions — the audit trail stops being an account of what happened.
- **Never run a measurement command while a delegated agent is active.** Builds, `next build`, Jest runs, and SAM validates are not read-only: they compete for `node_modules`, ports, lockfiles, `.next/`, and `dist/`. A measurement taken while an Implementer reinstalls dependencies is not a slow measurement, it is a **wrong** one — and it surfaces as an inexplicable error in the *other* worker.
- **Measure after the worker reports, never beside it.** You already wait for the completion report; take the measurement in that window, when the tree is quiet.

## Local stack
Do not guess start commands — the `## Local Environment` contract in `docs/infrastructure.md` records the primary route, the fallback, the pre-check, seed/reset, health check, and ports. The local environment is **disposable** (agents may freely start, seed, and reset it); cloud/PROD deploys are **governed** by `docs/infrastructure.md` §1–5 and are never improvised.

## Module Guides
Children of this file. A module gets a child guide only when its conventions genuinely diverge from the root; children **add to or narrow** these rules and never override them. A child guide missing from this index is drift.

- `backend/CLAUDE.md` — NestJS/Lambda specifics: two-entrypoint shared-bootstrap discipline, serverless-http body-parsing gotcha + the handler-level test harness, Prisma migrations runbook, PII/audit rules, e2e naming/harness conventions, import-template generator.
- `frontend/CLAUDE.md` — static-export rules, query-param routing pattern, token discipline, API client/type-fidelity conventions, admin shell mobile patterns, per-table table/card breakpoints and sticky-column conventions, generated assets.

Mirrored for other tools by `backend/AGENTS.md` / `frontend/AGENTS.md`.

## Spec taxonomy under `docs/specs/`
- `general-setup/` — methodology templates (this baseline).
- `<domain>/<feature-slug>/` — feature specs (e.g. `actors/`, `seed-map/`, `import-export/`).
- Use `enhancement/`, `bugfix/`, or `epic/` prefixes when a change is not a new domain feature.
- `archive/<YYYY-MM-DD>-<domain>--<slug>/` — completed, archived specs (frozen records).

Each active spec folder holds `requirements.md`, `design.md`, `tasks.md`, and (during execution) `execution.md`.

## AKILI multi-agent execution
`.agents/{leader,implementer,reviewer,tester}.md` define the personas. `/akili-execute` runs Leader → Implementer → Reviewer; `/akili-test` runs Leader → Tester(s). Do not bypass or inline these personas when executing specs. Commits use `[SPEC:<spec-path>] <message>`.

**Evidence before checkbox:** append the `execution.md` entry with the Reviewer's PASS *first*, then flip `tasks.md` to `[x]`, then commit. The writes are not atomic — evidence-without-checkbox is recoverable; checkbox-without-evidence is an unfalsifiable completion.

## Model Routing

Criteria-first: match the model to the **dominant cognitive demand** of the phase, not to a global "best model" ranking. Guiding principles — **ARCHITECT = BUILDER** (whoever designs is strong enough to build); **author ≠ auditor** (the Reviewer must never be the same model as the Implementer); reserve deep-reasoning tiers for propose/specify/verify **and the orchestrating Leader**; fast & cheap is for archive and formatting only — **`tasks.md` decomposition is T1, not cheap formatting**.

### Capability tiers

| Tier | Demand |
|---|---|
| **T1 Architect** | Architecture reasoning, **task decomposition**, and **live orchestration judgment** (decomposition in flight, runtime skill selection, FAIL adjudication, pivot decisions). |
| **T2 Coder** | High-throughput correct code and test authoring against a settled design. |
| **T3 Auditor** | Adversarial reading of someone else's diff; conformance and defect detection. |
| **T4 Context-Ingest** | Large-context repository ingestion and summarization. |
| **T5 Fast-Cheap** | Mechanical formatting, archiving, status sweeps. |
| **T6 Multimodal** | Vision — screenshots, design comps, rendered-UI comparison. |

### Phase → tier

| Phase | Tier |
|---|---|
| `/akili-constitution`, `/akili-propose`, `/akili-specify` | T1 (repo ingestion within them: T4) |
| `/akili-execute` — **Leader** | T1 — orchestration judgment: writes no code, but selects skills, adjudicates FAILs, decides pivots |
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

CLI invocations confirmed on this machine: **Claude Code** `claude` · **OpenCode** `opencode` (v1.18.8) · **Antigravity** `agy` (v1.1.8, *not* `antigravity`). OpenCode slugs are from `opencode models`; Antigravity identifiers from `agy models` (that host exposes effort-suffixed identifiers rather than bare `pro`/`flash` aliases).

**Cross-host dispatch:** T6 Multimodal → **Antigravity** (Gemini vision). Reach across hosts before degrading within one — but only for a genuine capability gap, since a cross-host spawn costs a fresh context that a one-tier difference does not repay. This records the routing preference only, never the dispatcher.

**To change models, edit only this registry table.** Never pin a dated model name where a floating alias exists (the Claude Code column uses floating aliases on purpose, so it survives model churn with zero edits). Model selection is guidance only in command prompts — **never add `model:` to command frontmatter**; enforced bindings live only in the agent wrappers under `.claude/agents/`, `.opencode/agent/`, and `.agents/agents/`.

### Effort dial

Effort is the second, **per-task** routing dimension, orthogonal to the tier: the tier picks the model, effort picks how hard it thinks on *this* task.

| Signal | Effort |
|---|---|
| Trivial / mechanical (copy, config, rename) | `low` |
| Standard, well-specified scope | `medium` |
| Complex — algorithm, concurrency, security, ambiguity | `xhigh` |
| Correctness-critical (PII boundary, auth, migrations) | `max` |

**Defaults by role:** T1 propose/specify/Leader `high` · T2 Implementer/Tester `medium` (flex by task) · T3 Reviewer `high` · T5 archive `low`.

- **Rework rule:** bump effort one level on every retry — a fix that failed is usually under-thinking, not missing instructions.
- **Tier ↔ effort rule:** never `max` a cheaper tier; escalate the tier instead.
- **Re-baseline rule:** these defaults are **per-generation** and must be re-swept (`medium`/`high`/`xhigh` on a real spec) whenever the underlying model generation changes. The tier mapping survives model churn; these defaults do not. A task arriving *under*-specified — a `[~]` resume with thin `execution.md`, or a post-Pivot retry — starts one level higher.
- **Effort is not a verbosity dial:** lowering effort does not reliably shorten output. Fix long reports in the brief (`caveman`, `cognitive-doc-design`), never by dropping effort.

## Skill Map

Stack skills are **never hard-referenced by AKILI commands** — this map is how they reach the agents.

| Skill | Applies To | When to load |
|---|---|---|
| `nestjs-expert` | `backend/src/**` | Any NestJS module, guard, interceptor, DI, or Jest/Supertest work. |
| `api-design-principles` | `backend/src/**` (controllers, DTOs) | Adding or changing an `/api/v1` endpoint, pagination, or response envelope. |
| `error-handling-patterns` | `backend/src/common/**` | Exception filters, error envelopes, partial-failure paths (CSV import). |
| `aws-serverless` | `backend/src/lambda.ts`, `infra/**` | Lambda cold-start, SAM templates, API Gateway, RDS-from-Lambda connection strategy. |
| `tailwind-design-system` | `frontend/**` | Token work in `tailwind.config.ts`; enforcing `docs/ux-ui/design.md §7`. |
| `shadcn-ui` | `frontend/components/ui/**` | Adding or adapting a shadcn primitive. |
| `vercel-react-best-practices` | `frontend/**` | React/Next performance, bundle, data-fetching review. |
| `react-doctor` | `frontend/**` | After a substantive React change, before reporting completion. |
| `frontend-design` / `ui-ux-pro-max` | `frontend/app/**`, `frontend/components/**` | Visual craft on a screen or component; layout and interaction quality. |
| `product-manager-toolkit` | `docs/prd.md`, `docs/specs/**` | PRD edits, personas, success metrics, requirement authoring. |
| `software-architect` | `docs/trd/trd.md` | TRD changes: quality-attribute scenarios, tactics, ADRs, C4 views. |
| `systematic-debugging` | anywhere | Any bug, test failure, or unexpected behavior — before proposing a fix. |
| `tdd` | `backend/src/**` (logic-heavy) | **Leader-assigned per task, never blanket.** Earns its cost on business rules, PII/consent gating, and import/export logic; pure overhead on copy, styling, or config. |
| `playwright-cli` | E2E / browser verification | *Only when installed in the running environment* — the token-lean alternative to loading Playwright MCP schemas. Not vendored into this repo; teammates without it must still be able to run every command. |
| `orchestration` | Leader, before cross-host or parallel dispatch | *Only when the environment provides it* (Orca). Never a prerequisite — every task must remain completable with the host's own subagents. |

During `/akili-specify`, derive each task's required skills from this map. During `/akili-execute` and `/akili-test`, the **Leader assigns** these skills and the Implementer/Tester must load them before writing code or tests.

## CodeGraph
**Per-checkout, and not initialized by default — check before relying on it.** Only `.codegraph/config.json` is committed; the generated database is gitignored, so a fresh clone has **no graph** and every `codegraph_*` call fails with *"CodeGraph not initialized"* until someone runs `codegraph init` in that working copy. **This guide deliberately records no per-checkout status — check the working copy, never read it here.** *(It has now gone stale twice for the same reason. First: "Re-indexed 2026-08-03 — 290 files, 2,688 nodes, 6,881 edges", which described a different machine and sent every agent to tools that could not run here. Then its own correction, "Verified absent in this checkout on 2026-08-04", which was true when written and became false the moment someone ran `codegraph init`. Whether an index exists — and how large it is — is a property of a working copy, not of the repository. Recording either here is the same defect wearing the opposite sign.)*

When the graph **is** built, prefer the `codegraph_*` tools for symbol lookup (`codegraph_search`), tracing flow (`codegraph_callers`/`codegraph_callees`), and pre-change impact analysis (`codegraph_impact`) instead of broad grep scans; tell Explore agents to do the same. Targeted graph lookups do **not** count toward the Leader's 4-file delegation threshold — that threshold counts full-file reads. After merging a spec (or any large change), re-index with `codegraph index` so the graph tracks reality. `.codegraph/config.json` is committed; the generated database is gitignored — never commit it.
