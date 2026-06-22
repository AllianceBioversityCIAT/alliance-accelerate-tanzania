# AGENTS.md — ACCELERATE Tanzania Seed Registry

Tool-agnostic guidance for any AI agent (Claude Code, OpenCode, Antigravity, etc.). Mirrors `CLAUDE.md`.

## Project
Public, serverless web platform mapping Tanzania's seed system (sorghum, common bean, groundnut) for 1,000+ actors. Full context: `docs/prd.md`.

## Constitutional baseline (read before acting)
- `docs/prd.md` — product requirements (what/why, personas, scope, acceptance criteria).
- `docs/system-design/design.md` — UI/UX system and **design tokens**.
- `docs/detailed-design/detailed-design.md` — technical blueprint (architecture, data model, API, RBAC/PII, infra).
- `docs/specs/general-setup/` — templates (`requirements.md`, `design.md`, `task.md`) every feature spec must follow.

## Mandated stack
Next.js (App Router, TS, Tailwind, **static export**) → S3/CloudFront · NestJS (TS) → Lambda + API Gateway · RDS **MySQL** via **Prisma** · **Leaflet** maps · **AWS Cognito** auth (`admin`/`staff` groups; anonymous = `Public`).

## Hard constraints
1. All AWS CLI / deploy / IaC commands use `--profile IBD-DEV`.
2. PII (`phone`, `email`) is never exposed to `Public`; enforce server-side.
3. No Next.js SSR/route handlers — server logic stays in NestJS.
4. Use design tokens from `system-design/design.md §7`; no hardcoded colors/geometry.

## Specs & taxonomy
Feature specs live in `docs/specs/<domain>/<feature-slug>/` (e.g. `actors/`, `seed-map/`, `import-export/`), each with `requirements.md`, `design.md`, `tasks.md`, `execution.md`. Follow the `general-setup` templates.

## Multi-agent execution
`.agents/leader.md`, `.agents/implementer.md`, `.agents/reviewer.md` drive the `/sdd-execute` loop (Leader orchestrates, Implementer codes, Reviewer audits). Commits use `[SPEC:<spec-path>] <message>`.

## Skills
NestJS/API: `nestjs-expert`, `api-design-principles`, `error-handling-patterns`, `aws-serverless`. UI: `frontend-design`, `ui-ux-pro-max`, `shadcn-ui`, `tailwind-design-system`, `vercel-react-best-practices`. Product: `product-manager-toolkit`.

## CodeGraph
Not initialized (repo was empty at constitution). Optional later via `codegraph init -i`; never commit generated databases.
