# Design — Canonical Actor data model + consent/PII foundation

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `seed-map/actor-data-model` |
| Branch | `feature/seed-map-actor-data-model` (off `feature/brand-palette-pabra`) |
| Depth | Full |
| Traces | requirements.md (FR-1..FR-9, NFR-1..NFR-7) |
| Constitutional refs | detailed-design §1–§5, §8, §11; system-design §5; CLAUDE.md (stack, PII, AWS profile) |

## 2. Executive Summary

Stand up the mandated backend (NestJS + Prisma + RDS MySQL, deployed as one Lambda behind API Gateway via Serverless, `--profile IBD-DEV`) and the canonical Actor model. The architectural centerpiece is a **single consent/PII policy module** feeding a **role-aware serializer** that every public read path passes through — so PII gating and consent filtering are one auditable unit a legal change edits in place. v1 is driven by **seeded consented data**; the real-file import is designed but not executed.

## 3. Architecture Overview

```
Public (anon)                        Frontend (static export, existing)
   │  GET /api/v1/{actors,actors/:id,metrics,health}     │  lib/api/client.ts → these endpoints
   ▼                                                      ▼
API Gateway ──▶ Lambda (NestJS app, serverless-http)
                  │
                  ├─ ActorsModule ── ActorsService ──┐
                  ├─ MetricsModule ─ MetricsService ─┤── PrismaModule ──▶ RDS MySQL
                  ├─ CommonModule ── RoleAwareSerializer ◀── PiiConsentPolicy (single source)
                  └─ (later) AuthModule (Cognito) — Public role assumed for v1
```
- **One Lambda, many routes** (detailed-design §1). No SSR concerns — backend only.
- **Every public read** is serialized through `RoleAwareSerializer`, which consults `PiiConsentPolicy` (the allowlist + consent + public-GPS rule). There is no second code path that can leak PII.

## 4. Extended Directory Structure

```
backend/                                   # NEW — first backend
├── serverless.yml                         # Lambda + API Gateway; provider.profile: IBD-DEV (NFR-2)
├── package.json · tsconfig.json · nest-cli.json
├── prisma/
│   ├── schema.prisma                      # Actor, Crop, CropsOnActors, ConsentStatus enum (FR-2)
│   ├── migrations/                        # generated migration (FR-2)
│   └── seed.ts                            # consented sample actors (FR-8)
├── src/
│   ├── main.ts · lambda.ts                # Nest bootstrap + serverless-http handler
│   ├── app.module.ts · health.controller.ts (FR-1)
│   ├── prisma/prisma.module.ts · prisma.service.ts   # Lambda-tuned lifecycle (NFR-3)
│   ├── common/
│   │   ├── pii-consent.policy.ts          # SINGLE source: allowlist + consent + public-GPS (NFR-5)
│   │   ├── role-aware.serializer.ts       # public projection (FR-5, NFR-1)
│   │   └── normalize.ts                   # region/sex/traderType/GPS normalization (FR-3)
│   ├── actors/
│   │   ├── actors.module.ts · actors.controller.ts · actors.service.ts
│   │   └── dto/ (list-query.dto.ts, actor-create.dto.ts)   # class-validator (NFR-4)
│   ├── metrics/ (module · controller · service)           # FR-7
│   └── import/ (import.service.ts — DESIGN ONLY, execution-deferred, FR-9)
└── test/ (actors.e2e-spec.ts, pii-boundary.spec.ts, …)     # NFR-7

docs/detailed-design/detailed-design.md    # §3/§8 reconciled with this spec's final model
frontend/lib/api/                          # actor types added alongside existing metrics.ts (contract reuse)
```

## 5. Data Model

```prisma
enum ConsentStatus { GRANTED DENIED UNKNOWN }

model Actor {
  id               String   @id @default(cuid())
  traderId         String   @unique            // source business key (FR-2); import dedupes
  traderName       String
  region           String                       // canonical (FR-3)
  district         String?
  traderType       String                       // canonical taxonomy (OQ-2)
  sex              String?                       // M|F|Other|null — PII
  position         String?                       // PII
  marketLocation   String?                       // PII
  capacityTons     Decimal? @db.Decimal(10, 2)
  technicalSupport String?  @db.Text             // PII (provisional)
  phone            String?                        // PII
  email            String?                        // PII
  gpsLatitude      Decimal? @db.Decimal(10, 7)    // exact — consent-gated public exposure
  gpsLongitude     Decimal? @db.Decimal(10, 7)
  gpsAltitude      Decimal? @db.Decimal(10, 2)
  gpsAccuracy      Decimal? @db.Decimal(10, 2)
  consentStatus    ConsentStatus @default(UNKNOWN) // FR-4
  crops            CropsOnActors[]
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([region]) @@index([traderType]) @@index([consentStatus]) @@index([traderName])
}
model Crop { id String @id @default(cuid()) name String @unique  actors CropsOnActors[] }  // sorghum|common_bean|groundnut
model CropsOnActors { actor Actor @relation(fields:[actorId],references:[id],onDelete:Cascade) actorId String
  crop Crop @relation(fields:[cropId],references:[id],onDelete:Cascade) cropId String @@id([actorId, cropId]) }
```

**Public projection (what `Public` may receive)** — derived, never stored:
`{ id, traderName, region, district, traderType, capacityTons, crops[], gps?: {lat,long} }` where `gps` is present **only if** `consentStatus = GRANTED`. Hidden always for Public: `phone, email, sex, position, marketLocation, technicalSupport, traderId, exact-GPS-when-not-granted` (NFR-1).

## 6. API Design

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/v1/health` | none | `{status, time}` (FR-1) |
| GET | `/api/v1/actors` | none (Public) | `{ data: PublicActor[], page, pageSize, total }`; query `?crop=&role=&region=&page=&pageSize=` — only `GRANTED`, PII-stripped (FR-6) |
| GET | `/api/v1/actors/:id` | none | `PublicActor` or `404` (FR-6) |
| GET | `/api/v1/metrics` | none | `{ actorsMapped, cropsTracked, regionsCovered, actorTypes, crops:[{slug,mappedActors}] }` over consented actors (FR-7) |

- CORS restricted to the CloudFront origin in prod; no auth header on public calls.
- Error envelope per detailed-design §9; validation errors `400` (NFR-4).
- `PublicActor` type is shared with the frontend (added beside `frontend/lib/api/metrics.ts`), so the map spec consumes a typed contract (NFR-6).

## 7. Backend Module Design

- **PrismaModule/Service** — single client, Lambda-tuned (reuse connection across invocations; `$connect` on cold start; bounded pool) (NFR-3).
- **CommonModule** — `PiiConsentPolicy` (exports `PII_ALLOWLIST`, `isPublic(actor)`, `publicGps(actor)`), `RoleAwareSerializer.toPublic(actor)`, `normalize.*`. **The only place** PII/consent logic lives (NFR-5).
- **ActorsModule** — `ActorsService.findPublic(query)` filters `consentStatus = GRANTED` + crop/role/region, paginates, maps each through `RoleAwareSerializer.toPublic`. Controller validates `ListQueryDto`.
- **MetricsModule** — aggregate counts computed over `GRANTED` actors (FR-7).
- **ImportModule** — `import.service.ts` parses the real file, normalizes, dedupes on `traderId`, quarantines incomplete rows, sets `consentStatus = UNKNOWN`. **Wired but not executed** in v1 (FR-9); guarded behind an explicit ops command, never auto-run.

## 8. Frontend / UX Component Architecture

No UI in this spec. Only a shared **type contract**: add `PublicActor` + the actors-list response type beside the existing `frontend/lib/api/metrics.ts`, and (optionally) a thin `getActors()` client wrapper, so the Discovery Map spec builds against a typed, PII-safe contract. The existing `getMetrics()` now has a real backend to hit.

## 9. Shared Contracts or Package Extensions

- `PublicActor` / actors-list DTO becomes the second shared contract (after `Metrics`). Documented in detailed-design §4.
- `PiiConsentPolicy` is the canonical PII/consent policy other backend modules (export, directory) will reuse.

## 10. Design Decisions

- **DD-1 (Single PII/consent policy module — NFR-5):** allowlist + consent + public-GPS rule live in `pii-consent.policy.ts`; the serializer and every read path consult it. A legal change is a one-file edit. Rejected: per-endpoint field-picking (drift/leak risk).
- **DD-2 (Serializer is the only public exit — NFR-1):** all public responses pass through `RoleAwareSerializer.toPublic`; services never return raw Prisma entities to controllers. Defense in depth beyond DTO shaping.
- **DD-3 (Consent = exclude, provisional — OQ-3/OQ-5):** v1 excludes non-`GRANTED` actors from public results entirely (simplest privacy-safe default). Coarsened-GPS "show fuzzed" is a documented alternative legal may choose; isolated to `publicGps()`.
- **DD-4 (Seed-first — proposal decision):** v1 runs on seeded `GRANTED` sample data; the real import is built but execution-deferred behind the legal gate, so no un-cleared PII can be exposed.
- **DD-5 (Provisional taxonomy/PII as data, not hardcoded — OQ-2/OQ-4):** the canonical `traderType` set and PII allowlist are declared as named constants in the policy/normalizer, edited in one place when legal/business revise.
- **DD-6 (Reconcile detailed-design §3/§8):** this spec finalizes §3 (adds `consentStatus`) and §8 (expanded PII set); the doc is updated so the constitution matches reality.

## 11. Risks & Mitigations

- **PII leak (highest):** mitigated by DD-1/DD-2 single-exit serializer + NFR-7 integration tests asserting no allowlist field appears on any public endpoint.
- **First backend / infra setup:** scaffold is minimal; DB can be a local MySQL for dev/test, RDS for deploy; deploy gated on `--profile IBD-DEV`.
- **Legal changes the model:** isolated to `pii-consent.policy.ts` + `normalize.ts` (DD-1/DD-5) — low blast radius.
- **Lambda/Prisma cold-start & connections:** NFR-3 tuning; keep client singleton.
- **Real PII handling:** import execution-deferred (DD-4); the real file is never committed.

## 12. Test Plan Outline

- **Schema/migration:** migrate + round-trip an actor (FR-2).
- **Normalization/validation:** region canonicalization, out-of-range GPS → 400, email format, capacity ≥ 0 (FR-3/NFR-4).
- **Consent filtering:** `UNKNOWN`/`DENIED` actors absent from `/actors` and `/metrics` (FR-4/FR-7).
- **PII boundary (security-critical, NFR-7):** for every public endpoint, assert the response contains none of `{phone,email,sex,position,marketLocation,technicalSupport}` and no exact GPS for non-granted actors (FR-5/NFR-1).
- **API contract:** `/actors` pagination + filters; `/metrics` shape matches the frontend `Metrics` type (FR-6/FR-7/NFR-6).
- **Seed:** seed runs; `/actors` + `/metrics` non-empty (FR-8).
- **Import (design-only):** unit-test dedupe/quarantine/normalize on synthetic rows; no real-data execution (FR-9).
