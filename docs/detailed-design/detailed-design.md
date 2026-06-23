# Detailed Design — Technical Blueprint — ACCELERATE Tanzania Seed Registry

> The technical implementation blueprint. Constitutional baseline. Last reviewed: 2026-06-22.

## 1. System Overview

A decoupled, fully serverless architecture deployed to the **`IBD-DEV`** AWS account/profile.

```
┌──────────────┐     HTTPS      ┌───────────────┐   invoke   ┌──────────────────┐
│  Browser     │ ─────────────► │  CloudFront   │ ─────────► │  S3 (static       │
│ (Next.js SPA │                │  (CDN)        │            │  export of Next)  │
│  static)     │                └───────────────┘            └──────────────────┘
│              │
│              │   /api  HTTPS  ┌───────────────┐  proxy     ┌──────────────────┐
│              │ ─────────────► │  API Gateway  │ ─────────► │ Lambda (NestJS)  │
└──────┬───────┘                └───────────────┘            └────────┬─────────┘
       │ Cognito JWT (Authorization: Bearer)                          │ Prisma
       ▼                                                              ▼
┌──────────────┐                                              ┌──────────────────┐
│ AWS Cognito  │  (user pool, role groups)                    │  RDS MySQL       │
└──────────────┘                                              └──────────────────┘
```

- **Frontend:** Next.js (App Router, TypeScript, Tailwind) → `next build` static export → S3 → CloudFront.
- **Backend:** NestJS (TypeScript) REST API wrapped as a single Lambda handler behind API Gateway (Serverless Framework). Prisma client → RDS MySQL.
- **Auth:** Cognito user pool; groups `admin`, `staff`. Unauthenticated callers are `Public`. NestJS guards validate the Cognito JWT and enforce RBAC.
- **AWS profile constraint:** all CLI/IaC/deploy actions use `--profile IBD-DEV`.

## 2. Domain Modules & Responsibilities

| Module (NestJS) | Responsibility |
|---|---|
| `ActorsModule` | CRUD for actor profiles; list/search/pagination; role-aware field projection (PII gating). |
| `CropsModule` | Reference data for the three crops; actor↔crop association. |
| `AuthModule` | Cognito JWT validation, role extraction, guards, decorators (`@Roles`, `@CurrentUser`). |
| `ImportModule` | CSV parsing, validation, transactional bulk upsert, per-row result reporting. |
| `ExportModule` | Role-aware filtered CSV generation (PII enforcement at serialization). |
| `MetricsModule` | Aggregate counts for the landing page (total actors, crops tracked, regions covered). |
| `PrismaModule` | Prisma client provider, connection lifecycle tuned for Lambda. |
| `HealthModule` | Liveness/readiness endpoint. |

Frontend mirrors these as route groups: `(public)` directory/map/profile, `(admin)` management, plus a shared `lib/api` client and `lib/auth` Cognito helper.

## 3. Data Model & Entities

Canonical **Actor** entity derived from the existing field dataset. CSV header → field mapping is authoritative for the import service.

| CSV header | Prisma field | Type | Notes |
|---|---|---|---|
| `Trader_id` | `traderId` | `String @unique` | Natural key from source data; import dedupes on this. |
| `Trader_name` | `traderName` | `String` | Required. Indexed for search. |
| `Region` | `region` | `String` | Indexed (filter + search). |
| `District` | `district` | `String?` | |
| `Trader/processor type` | `traderType` | `String` | Indexed (map filter). Consider enum once values are normalized. |
| `Sex` | `sex` | `String?` | Normalize to `M`/`F`/`Other`/null. |
| `Position` | `position` | `String?` | |
| `Market location` | `marketLocation` | `String?` | |
| `Capacity (volume in t)` | `capacityTons` | `Decimal?` | Numeric; map/filter on ranges. |
| `Technical support required` | `technicalSupport` | `String?` | Free text / multi-select later. |
| `phone` | `phone` | `String?` | **PII** — gated. |
| `Email` | `email` | `String?` | **PII** — gated; validated format. |
| `gpslatitude` | `gpsLatitude` | `Decimal?` | Map plotting. Range −90..90. |
| `gpslongitude` | `gpsLongitude` | `Decimal?` | Map plotting. Range −180..180. |
| `gpsaltitude` | `gpsAltitude` | `Decimal?` | |
| `gpsaccuracy` | `gpsAccuracy` | `Decimal?` | |
| (consent) | `consentStatus` | `ConsentStatus` enum (`GRANTED`/`DENIED`/`UNKNOWN`, default `UNKNOWN`) | Gates public visibility — the public API returns ONLY `GRANTED` actors (`DENIED`/`UNKNOWN` are excluded from every public read and from `/metrics` counts). Enforced in the query, not just the serializer. |
| (derived) | `crops` | `Crop[]` (M:N) | Sorghum / common bean / groundnut. See PRD OQ-1. |
| — | `id` | `String @id @default(cuid())` | Internal PK. |
| — | `createdAt` / `updatedAt` | `DateTime` | Audit timestamps. |

```prisma
// schema.prisma (reference — authoritative shape, finalized during general-setup spec)
enum ConsentStatus {
  GRANTED
  DENIED
  UNKNOWN
}

model Actor {
  id               String   @id @default(cuid())
  traderId         String   @unique
  traderName       String
  region           String
  district         String?
  traderType       String
  sex              String?
  position         String?
  marketLocation   String?
  capacityTons     Decimal? @db.Decimal(10, 2)
  technicalSupport String?  @db.Text
  phone            String?   // PII
  email            String?   // PII
  gpsLatitude      Decimal? @db.Decimal(10, 7)
  gpsLongitude     Decimal? @db.Decimal(10, 7)
  gpsAltitude      Decimal? @db.Decimal(10, 2)
  gpsAccuracy      Decimal? @db.Decimal(10, 2)
  consentStatus    ConsentStatus @default(UNKNOWN)  // public API returns GRANTED only
  crops            CropsOnActors[]
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([region])
  @@index([traderType])
  @@index([consentStatus])
  @@index([traderName])
}

model Crop {
  id     String @id @default(cuid())
  name   String @unique   // "sorghum" | "common_bean" | "groundnut"
  actors CropsOnActors[]
}

model CropsOnActors {
  actor   Actor  @relation(fields: [actorId], references: [id], onDelete: Cascade)
  actorId String
  crop    Crop   @relation(fields: [cropId], references: [id], onDelete: Cascade)
  cropId  String
  @@id([actorId, cropId])
}
```

**PII set (single source of truth):** `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport`. The runtime source of truth is the `PII_ALLOWLIST` constant in `src/common/pii-consent.policy.ts` — any new PII field must be added there (and only there); the role-aware serializer builds public output by explicit allowlist of *public* fields, so the implemented set is the one declared in that policy module. Exact GPS (`gpsLatitude`/`gpsLongitude`) is additionally **consent-gated**: it is surfaced only for `GRANTED` actors and withheld (`gps: null`) for non-`GRANTED`; `gpsAltitude`/`gpsAccuracy` and `traderId` are never public.

## 4. API Surface & Contracts

REST, JSON, versioned under `/api/v1`. List endpoints are paginated (`?page`, `?pageSize`) and filterable. Field projection is role-aware: PII included only for `staff`/`admin`.

| Method & path | Auth | Description |
|---|---|---|
| `GET /api/v1/metrics` | Public | Landing-page aggregates. |
| `GET /api/v1/actors` | Public | Paginated/filterable list (`q`, `region`, `crop`, `traderType`, `capacityMin/Max`). PII omitted for Public. |
| `GET /api/v1/actors/:id` | Public | Single actor; PII gated. |
| `POST /api/v1/actors` | Staff/Admin | Create (validated DTO). |
| `PATCH /api/v1/actors/:id` | Staff/Admin | Update (validated DTO). |
| `DELETE /api/v1/actors/:id` | Admin | Delete. |
| `GET /api/v1/actors/geo` | Public | Lightweight points feed for the map (id, name, lat/lng, crops, type) — no PII. |
| `POST /api/v1/import` | Admin | Multipart CSV upload → per-row result report. |
| `GET /api/v1/export` | Staff/Admin | Filtered CSV stream; PII per role. |
| `GET /api/v1/crops` | Public | Crop reference list. |
| `GET /api/v1/users`, role mgmt | Admin | Cognito-backed user/role administration. |
| `GET /api/v1/health` | Public | Health check. |

**Conventions:** DTO validation via `class-validator`; consistent error envelope `{ statusCode, message, error, details? }`; pagination envelope `{ data, page, pageSize, total }`. See skills `api-design-principles`, `error-handling-patterns`.

## 5. Backend Workflows & Business Rules

- **Role-aware projection:** a single serialization layer strips PII fields for non-authorized roles on *every* read path (list, detail, geo, export). PII gating is enforced server-side, never relied upon in the client.
- **CSV import:** parse (streaming) → validate each row against the Actor DTO → upsert by `traderId` inside a transaction (or batched transactions) → return `{ inserted, updated, failed: [{ row, errors }] }`. A bad row never corrupts committed rows.
- **CSV export:** apply the same filters as the directory; serialize through the role-aware projector so a Public-scope export cannot leak PII.
- **GPS validation:** latitude ∈ [−90,90], longitude ∈ [−180,180]; rows outside range import with GPS nulled + flagged, not plotted.
- **Metrics:** computed via aggregate queries (count distinct regions, count actors with GPS, crops tracked); cacheable.

## 6. Frontend Architecture & State Boundaries

- **Next.js App Router**, **static export** (`output: 'export'`) — no SSR/Next API routes (incompatible with pure S3/CloudFront static hosting). All dynamic data is fetched client-side from the NestJS API.
- **Data fetching:** typed `lib/api` client (fetch wrapper) + React Query (or SWR) for caching/pagination/filter state. Server state stays in the query cache; UI state (filters, modals) in local/URL state. Filters are URL-synced so views are shareable.
- **Auth:** Cognito (Amplify Auth or `oidc-client`) stores JWT; an auth context exposes role; admin routes are client-guarded **and** enforced server-side (client guard is UX only).
- **Map:** Leaflet via a dynamically imported client component (`ssr: false`), fed by `/actors/geo`; crop-colored markers; filter panel drives query params.
- **Styling:** Tailwind + tokens from `docs/system-design/design.md`; shadcn/ui primitives. No hardcoded colors/spacing outside tokens.

## 7. Integration Points

- **AWS Cognito** — identity, JWT issuance, role groups.
- **AWS RDS MySQL** — primary datastore (Prisma). Lambda connects within/over VPC; use a connection strategy safe for Lambda concurrency (RDS Proxy or constrained pool).
- **API Gateway + Lambda** — single NestJS handler (via `@vendia/serverless-express` or `aws-lambda-fastify`-style adapter) deployed with Serverless Framework.
- **S3 + CloudFront** — static frontend hosting/CDN.
- **All provisioning/deploy** runs under `--profile IBD-DEV`.

## 8. Security & Authorization Model

- **Roles:** `Public` (anonymous, read-only non-PII), `Staff` (read incl. PII, create/edit), `Admin` (full incl. delete, import, user mgmt).
- **Enforcement:** NestJS `JwtAuthGuard` (validates Cognito JWT signature/claims) + `RolesGuard` (`@Roles('admin')` etc.). PII projection enforced in the serialization layer independent of route guards (defense in depth).
- **PII set (implemented):** the `Public`-hidden allowlist is `{ phone, email, sex, position, marketLocation, technicalSupport }`, declared once as `PII_ALLOWLIST` in `src/common/pii-consent.policy.ts` — the single runtime source of truth consulted by the role-aware serializer and every public read path. `traderId`, `gpsAltitude`, and `gpsAccuracy` are likewise never public. **Exact GPS is consent-gated:** `gpsLatitude`/`gpsLongitude` are surfaced only for `GRANTED` actors (withheld as `gps: null` for `UNKNOWN`/`DENIED`), and non-`GRANTED` actors are excluded from every public read and from `/metrics` counts. Consent is pinned in the Prisma `WHERE` (not serializer-only) and the boundary is proven end-to-end over HTTP in `src/test/pii-boundary.spec.ts` (NFR-1, NFR-7).
- **Transport:** HTTPS everywhere (CloudFront + API Gateway). CORS locked to the CloudFront origin.
- **Secrets:** DB credentials and Cognito config from AWS SSM Parameter Store / Secrets Manager — never committed.
- **Input safety:** all writes go through validated DTOs; Prisma parameterizes queries (no raw SQL on user input).

## 9. Error Handling & Observability

- Global NestJS exception filter → consistent error envelope; no stack traces leaked to clients.
- Validation errors return `400` with field-level `details`.
- Structured JSON logging to CloudWatch (request id, route, role, latency); import/export jobs log summary counts.
- Lambda cold-start mitigation: lazy Prisma client reuse across invocations, minimal bundle. See skill `aws-serverless`.

## 10. Testing Strategy

- **Backend unit/integration:** Jest + Supertest per module; contract tests asserting PII is omitted for `Public` on every read path (AC-1); import service tests for partial-failure isolation (AC-5).
- **Frontend:** component tests (Testing Library) for PII block, filters, forms; the directory list as the accessible equivalent of the map.
- **E2E (smoke):** core flows — public browse, login, create actor, import, export-respects-role.
- Verification commands wired per package (`npm run test`, `npm run build`, `npm run lint`).

## 11. Technical Constraints & Assumptions

- **Mandated stack:** Next.js static export + S3/CloudFront; NestJS on Lambda + API Gateway; RDS MySQL; **Prisma**; **Leaflet**; **Cognito**.
- **Mandated AWS profile:** `IBD-DEV` on every AWS command, script, and IaC definition (PRD AC-7).
- **Static-export constraint:** no Next SSR/ISR/route handlers — keep all server logic in NestJS.
- **Lambda DB constraint:** manage MySQL connections for serverless concurrency (RDS Proxy recommended).
- **Scale target:** 1,000+ actors; design list/map/queries to remain performant (indexes, paginated/geo endpoints, optional clustering).
