# ACCELERATE Tanzania Seed Registry

A public, serverless web platform mapping and visualizing Tanzania's seed system ecosystem. Focused on **sorghum**, **common bean**, and **groundnut** value chains, the registry serves 1,000+ actors — seed companies, NGOs, traders, processors, farmer groups, and cooperatives.

## What this project does

The platform transforms fragmented, static CSV/Excel datasets into a **living, centralized, scalable web system** that any stakeholder can browse, search, and analyze:

- **Public Registry Portal** — landing page with headline metrics and a searchable, paginated actor directory.
- **Geospatial Visualization** — interactive Leaflet map of actor locations with crop, region, capacity, and trader-type filters.
- **Actor Profiles** — standardized profile pages backed by a canonical relational schema.
- **Data Management & Admin** — protected admin UI for CRUD operations with role-based access control.
- **Import / Export** — CSV bulk import for initial seeding; filtered CSV export that respects data-protection rules.

## Tech Stack

| Layer | Technology | Deployment |
|---|---|---|
| **Frontend** | Next.js 15 (App Router, TypeScript, Tailwind CSS) | Static export → S3 + CloudFront |
| **Backend** | NestJS 11 (TypeScript, REST API) | AWS Lambda + API Gateway (AWS SAM / CloudFormation) |
| **Database** | MySQL on AWS RDS | via Prisma ORM |
| **Maps** | Leaflet | client-side |
| **Auth** | AWS Cognito (user pools + JWT) | groups: `admin`, `staff`; anonymous = `Public` |

## Project Structure

```
.
├── frontend/          # Next.js application (public portal + admin UI)
│   ├── app/           # App Router pages
│   ├── components/    # React components
│   ├── lib/           # utilities, hooks, API clients
│   ├── public/        # static assets
│   └── package.json
├── backend/           # NestJS serverless API
│   ├── src/           # application modules
│   ├── prisma/        # Prisma schema & migrations
│   └── package.json
├── infra/             # AWS SAM / CloudFormation stacks + deploy scripts
│   ├── 10-data-auth/  # RDS MySQL + Secrets Manager + Cognito
│   ├── 20-backend/    # NestJS Lambda + HTTP API
│   ├── 30-frontend/   # private S3 + CloudFront (OAC)
│   ├── scripts/       # deploy / migrate-seed / deploy-frontend / set-cors / smoke / teardown
│   └── README.md      # operator runbook
├── docs/              # product & technical documentation
│   ├── prd.md                      # Product Requirements Document
│   ├── system-design/design.md     # UI/UX system & design tokens
│   ├── detailed-design/            # architecture, data model, API, RBAC/PII
│   └── specs/                      # feature specifications
├── .agents/           # multi-agent SDD loop definitions
├── AGENTS.md          # AI agent guidance (tool-agnostic)
└── CLAUDE.md          # AI agent guidance (Claude-specific)
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- AWS CLI configured with `--profile IBD-DEV`
- MySQL database (local or RDS) for backend development

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000
npm run build      # static export to `out/`
npm test           # Jest tests
```

### Backend

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL in .env
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev  # local NestJS dev server
npm test           # unit tests
npm run test:e2e   # end-to-end tests
```

### Deploy

All AWS CLI, deploy, and IaC commands **must** use `--profile IBD-DEV`.

Infrastructure is defined as **AWS SAM / CloudFormation** stacks under [`infra/`](infra/) (RDS + Cognito, the NestJS Lambda + HTTP API, and the S3 + CloudFront frontend). Deploy with the orchestration script, then follow the operator runbook for migrate/seed, frontend deploy, CORS lock, smoke, and teardown:

```bash
./infra/scripts/deploy.sh   # ordered, idempotent SAM deploy of all three stacks
```

See [`infra/README.md`](infra/README.md) for the full deploy → operate → teardown runbook.

## Key Constraints

1. **AWS Profile:** every AWS CLI command uses `--profile IBD-DEV`.
2. **PII Protection:** `phone` and `email` are never exposed to the `Public` role; enforcement is server-side.
3. **Static Export:** no Next.js SSR / route handlers — server logic stays in NestJS.
4. **Design Tokens:** use tokens from `docs/system-design/design.md` §7; no hardcoded colors or geometry.

## Documentation

- **[`docs/prd.md`](docs/prd.md)** — product requirements, personas, scope, user stories, acceptance criteria.
- **[`docs/system-design/design.md`](docs/system-design/design.md)** — UI/UX system, information architecture, design tokens.
- **[`docs/detailed-design/detailed-design.md`](docs/detailed-design/)** — technical blueprint: architecture, data model, API surface, RBAC/PII, infrastructure.
- **[`docs/specs/`](docs/specs/)** — feature specifications following the `general-setup/` templates.

## License

[MIT](LICENSE)
