# ACCELERATE Tanzania Seed Registry

A public, serverless web platform mapping and visualizing Tanzania's seed system ecosystem. Focused on **sorghum**, **common bean**, and **groundnut** value chains, the registry serves 1,000+ actors — seed companies, NGOs, traders, processors, farmer groups, and cooperatives.

## Background

**ACCELERATE** — *Accelerated Variety Turnover for Open-Pollinated Crops in Tanzania* — is a four-year initiative (2023–2026) led by the **Alliance of Bioversity International & CIAT** and the **Pan-Africa Bean Research Alliance (PABRA)**, funded by the **Bill & Melinda Gates Foundation**.

**The problem:** Across Tanzania, most smallholder farmers still grow old, low-yielding varieties that are increasingly vulnerable to drought and climate stress. The formal seed sector meets only about **3% of farmers' planting requirements**; the rest comes from informal channels, which keeps improved genetics from reaching the field. Adoption is held back by a lack of product information, limited promotion, poor access to early-generation seed, thin data to guide decisions, and a weak seed supply system.

**The approach — a demand-led seed system:** Rather than pushing seed toward farmers, ACCELERATE starts with the sources of demand — the grain traders, aggregators, processors, and institutional buyers who already move crops through the market — and links them to formal, semi-formal, and informal seed producers. When demand pulls quality seed through the value chain, varietal turnover accelerates on its own. Three pillars drive the model:

1. **Information flow** — better information to and from large traders, grain producers, and seed producers builds real demand for quality seed.
2. **Marketplace traders** — engaging the traders who buy and sell grain every day turns the marketplace into an engine for adoption.
3. **Institutional buyers** — when institutional buyers know about and can access improved varieties, turnover speeds up and farmer incomes and nutrition rise.

This repository is the **public registry behind ACCELERATE** — a single, trusted map of the seed companies, cooperatives, offtakers, research institutes, and traders that make up Tanzania's seed system.

### Crops & value chains

ACCELERATE focuses on three priority value chains, each with newly released, higher-yielding open-pollinated varieties (OPVs):

| Crop | Representative varieties |
|---|---|
| **Sorghum** | TARI SOR 1 (red), TARI SOR 2 (white) — 3–4 t/ha, Striga & bird resistant |
| **Common bean** | TARI Bean 2–6, Uyole 16/18, Selian 13, Calima Uyole, JESCA |
| **Groundnut** | Naliendele 2016, Narinut 2015, Tanzanut 2016, TARIKA 1 & 2 |

### Partners

| Organization | Role |
|---|---|
| Alliance of Bioversity International & CIAT (ABC) | Lead implementer |
| Pan-Africa Bean Research Alliance (PABRA) | Co-lead, bean value chain |
| Tanzania Agricultural Research Institute (TARI) | Variety release & early-generation seed |
| Tanzania Official Seed Certification Institute (TOSCI) | Seed certification & QDS regulation |
| International Maize & Wheat Improvement Center (CIMMYT) | Market intelligence, sorghum/groundnut |
| Bill & Melinda Gates Foundation (BMGF) | Funder |

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
- **[`docs/reference/`](docs/reference/)** — source material & content briefs:
  - [`accelerate-project-source-data.md`](docs/reference/accelerate-project-source-data.md) — extracted project facts (partners, actors, varieties, regions, statistics) with full source list.
  - [`accelerate-web-copy-brief.md`](docs/reference/accelerate-web-copy-brief.md) — ready-to-use on-brand copy for the home & About pages, mapped to routes and design tokens.

## License

[MIT](LICENSE)
