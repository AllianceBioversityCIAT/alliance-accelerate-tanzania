# CLAUDE.md — ACCELERATE Tanzania Seed Registry

Guidance for Claude (and any AI agent) working in this repository.

## What this project is
A public, serverless web platform that maps and visualizes Tanzania's seed system ecosystem (sorghum, common bean, groundnut value chains) for 1,000+ actors. See `docs/prd.md` for the full product context.

## Constitutional baseline — read these first
These four documents are the source of truth. Consult them before writing code or specs:

| Document | What it is | Consult when |
|---|---|---|
| `docs/prd.md` | Product requirements: problem, personas, goals, scope, user stories, acceptance criteria. | Clarifying *what* to build or *why*; checking scope. |
| `docs/system-design/design.md` | UI/UX system: IA, flows, screens, **design tokens**, components, accessibility. | Building/styling any UI; never hardcode colors/spacing — use the tokens here. |
| `docs/detailed-design/detailed-design.md` | Technical blueprint: architecture, data model, API surface, RBAC/PII, infra. | Implementing backend/frontend/data/infra; matching schemas and contracts. |
| `docs/specs/general-setup/` | Methodology templates (`requirements.md`, `design.md`, `task.md`) for every feature spec. | Running `/sdd-specify`; formatting new specs. |

These form the **constitutional baseline** for all SDD work. Module/feature specs live under `docs/specs/<taxonomy>/<feature-slug>/` and must follow the general-setup templates.

## Mandated stack (do not substitute)
- **Frontend:** Next.js (App Router, TypeScript, Tailwind), **static export** → S3 → CloudFront.
- **Backend:** NestJS (TypeScript), serverless REST API → AWS Lambda + API Gateway (AWS SAM / CloudFormation; IaC defined under `infra/` as SAM templates).
- **Database:** AWS RDS **MySQL** via **Prisma**.
- **Maps:** **Leaflet**. **Auth/RBAC:** **AWS Cognito** (groups `admin`, `staff`; anonymous = `Public`).

## Hard constraints
- **AWS profile:** every AWS CLI command, deploy script, and IaC/Serverless definition **MUST** use `--profile IBD-DEV`.
- **PII protection:** `phone` and `email` are PII — never exposed to the `Public` role in any API response, page, or export. Enforce server-side in the role-aware serializer (defense in depth), not just in the client.
- **Static export:** no Next.js SSR/ISR/route handlers — all server logic lives in the NestJS API.
- **Design tokens:** use tokens from `system-design/design.md §7` — no hardcoded colors/geometry.

## Spec taxonomy under `docs/specs/`
- `general-setup/` — methodology templates (this baseline).
- `<domain>/<feature-slug>/` — feature specs (e.g. `actors/`, `seed-map/`, `import-export/`).
- Use `enhancement/`, `bugfix/`, or `epic/` prefixes when a change is not a new domain feature.
Each spec folder holds `requirements.md`, `design.md`, `tasks.md`, and (during execution) `execution.md`.

## SDD multi-agent loop
`.agents/{leader,implementer,reviewer}.md` define the Leader → Implementer → Reviewer loop used by `/sdd-execute`. Do not bypass or inline these personas when executing specs.

## Recommended skills for common work
- Backend / NestJS: `nestjs-expert`, `api-design-principles`, `error-handling-patterns`, `aws-serverless`.
- Frontend / UI: `frontend-design`, `ui-ux-pro-max`, `shadcn-ui`, `tailwind-design-system`, `vercel-react-best-practices`.
- Product / specs: `product-manager-toolkit`.

## CodeGraph
Not initialized for this repo (it was empty at constitution time). If/when the codebase grows, you may run `codegraph init -i` and then prefer codegraph tools for symbol lookup, callers/callees, and impact analysis. Do not commit generated CodeGraph databases.
