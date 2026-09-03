# TRD — Technical Requirements Document — ACCELERATE Tanzania Seed Registry

> The technical implementation blueprint. Constitutional baseline. Last reviewed: 2026-08-03.
> Formerly `docs/detailed-design/detailed-design.md` — renamed 2026-08-03. Archived specs still cite the old path and the old section numbers below, which is why **existing section numbers were not renumbered** during that migration.

**Canonical structure map.** AKILI's required TRD structure maps onto this document's stable numbering as follows. Sections 12–13 were added in the 2026-08-03 constitution pass; everything else predates it and keeps its original number so existing `§n` citations stay valid.

| AKILI canonical section | Here |
|---|---|
| 1. System Overview | §1 |
| 2. Architecture Overview & Decisions | **§12** |
| 3. Quality Attribute Scenarios (NFRs) | **§13** |
| 4. Domain Modules & Responsibilities | §2 |
| 5. Data Model & Entities | §3 |
| 6. API Surface & Contracts | §4 |
| 7. Backend Workflows & Business Rules | §5 |
| 8. Frontend Architecture & State Boundaries | §6 |
| 9. Integration Points | §7 |
| 10. Security & Authorization Model | §8 |
| 11. Error Handling & Observability | §9 |
| 12. Testing Strategy | §10 |
| 13. Technical Constraints & Assumptions | §11 |

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
| `RegistrationsModule` | Public self-registration intake — versioned consent-policy serving, OTP-gated email verification, and `Registration` storage with **no public read path for any submitted field** (§8). Four public endpoints (§4). Also owns the **admin adjudication surface** (`docs/specs/admin/registration-review-queue/`): five `Admin`-only endpoints — list, detail, approve, reject, dismiss-duplicate (§4) — living in this *same* module by deliberate placement, not a sibling module (that spec's DD-15). **The placement is load-bearing, not cosmetic:** `src/test/pii-boundary.spec.ts`, the PII release gate, derives its checked route set from `MODULE_METADATA.CONTROLLERS` on `RegistrationsModule`; a registrations route registered on a *different* module is invisible to that derivation and would ship uncovered while the suite stayed green. **Nothing enforces this today except the module boundary itself and a controller-level JSDoc — no test asserts that a registrations route added on a *different* module is covered.** Such a route is invisible to both sides of the release gate's totality equality, which derives its expected set from `RegistrationsModule` alone. The narrower case *is* caught: moving `AdminRegistrationsController` out of this module drops five entries from the derived set while the fixture map retains them, so the equality fails by name (`backend/src/test/pii-boundary.spec.ts`). *(Narrowed by validation R9 — the prior wording made an unqualified claim about what tests assert, and a test does assert the controller's membership.)* A future split of `RegistrationsModule` must re-derive the gate's route source, or the constraint recorded here silently lapses. |

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

**Canonical template vs. source workbooks.** The table above is authoritative for the **canonical import template** — the CSV headers the import service accepts — not for any particular client-supplied workbook. A source workbook with its own column spellings (e.g. `gpslatitude` variants) or sheet structure is mapped onto this template by a per-source mapping specification before import; it is never read against this table directly. A worked example of that mapping step is produced per onboarding as the `mapping.md` of the relevant import-export spec.

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

### 3.1 Registration & EmailVerification (public self-registration)

Two entities and three supporting counter tables behind the public self-registration intake, all distinct from `Actor` and outside the guarantees above. **`PII_ALLOWLIST` and `NEVER_PUBLIC_FIELDS` are `Actor` column lists** consumed by the `Actor` serializer — they do not, and structurally cannot, cover a table that is not `Actor`. `Registration`'s PII is instead contained **structurally**: its public surface returns at most two or three scalars and never reads the `payload` column (§8).

| Model | Purpose | PII |
|---|---|---|
| `RegistrationStatus` (enum) | `PENDING_REVIEW · AWAITING_APPLICANT · APPROVED · REJECTED · WITHDRAWN`. `AWAITING_APPLICANT` and `WITHDRAWN` are declared now but unreachable until chunk 4, so that chunk needs no enum migration; `APPROVED` and `REJECTED` become reachable with chunk 3b's adjudication (`docs/specs/admin/registration-review-queue/`). | — |
| `Registration` | One row per submission: `reference` (the applicant-facing key), `status`, `payload` (the submission, JSON, admin-only in its entirety), `submitterEmail` (the OTP-verified address — the one later published as `Actor.email` on approval), `emailVerifiedAt`, `consentAcceptedAt` (the server-witnessed instant the submission arrived — an **upper bound** on the applicant's true acceptance moment, not a client-attested one), `consentPolicyVersion`. Also declares the adjudication columns (`publishedActorId`, `reviewedBySub`/`reviewedByEmail`/`reviewedAt`, `rejectionReason`, `reviewNote`, `duplicateDismissals`) that only `docs/specs/admin/registration-review-queue/` writes, so that spec needs no migration of its own. | `payload`, `submitterEmail` |
| `EmailVerification` | The pre-verification store: `email`, an HMAC-SHA-256-hashed OTP code (plaintext never stored, never logged), an attempt counter, expiry, single-use marker. Not a `Registration` — no row here is ever readable by any caller. | `email` |

Three further tables exist as concurrency-safe counters behind the abuse-resistance posture in **§12.5, ADR-010**: `EmailSendBudget` (the atomic per-email OTP send cap), `RegistrationSequence` (the race-safe reference allocator), and `RegistrationLookupAttempt` (the persistent, per-caller-and-reference bound behind the public status lookup — its `ip` column is personal data under GDPR Art. 4(1) / CJEU *Breyer*).

**Four tables now hold personal data with no retention or deletion policy** — `Registration.submitterEmail`, `EmailVerification.email`, `EmailSendBudget.email`, `RegistrationLookupAttempt.ip`. This is a recorded, accepted risk (PRD OQ-4), not an oversight: stating it here keeps the public surface honestly sized rather than implied smaller than it is.

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
| `GET /api/v1/registrations/consent-policy` | Public | Versioned consent-policy text — one source for the API and the form UI. |
| `POST /api/v1/registrations/verify` | Public | Sends an OTP to the supplied email. **Always `202`, empty body** — deliverable, undeliverable, already-known, and over-cap addresses all get the identical response, so the endpoint cannot be used to test whether an address exists. |
| `POST /api/v1/registrations` | Public | Creates a `Registration` once the OTP is verified. Returns **only** `{ reference }` — no payload echo, no internal `id`. |
| `POST /api/v1/registrations/lookup` | Public | Status by `{ reference, email }` in the request **body**, never a query string (keeps an email address out of request lines, `Referer`, and history). `404` is byte-identical for an absent reference, an email mismatch, and the endpoint's own rate-limit lockout — none is distinguishable from another. |
| `GET /api/v1/admin/registrations` | Admin | Paginated/filterable adjudication queue (`status`, `q`, `region`, `traderType`, `sort`, `page`, `pageSize`); each row carries a `duplicateCandidateCount`, never the candidates themselves. |
| `GET /api/v1/admin/registrations/:id` | Admin | Full registration detail: payload, consent record, duplicate candidates, activity trail. `404` here is a plain not-found, distinguishable from `403` — the public lookup's uniformity requirement (above) stops at the auth boundary; an authenticated Admin is entitled to know whether a registration exists. |
| `POST /api/v1/admin/registrations/:id/approve` | Admin | Single-transaction, compare-and-set approval (`id` + `status = PENDING_REVIEW`; zero rows ⇒ `409` when the row exists, `404` when it does not, DD-22): creates the `Actor`, derives `traderId` (`SR-<year>-<seq>`), writes the literal-picked publishable subset, audits inside the same transaction, links `publishedActorId`. A pre-existing `traderId` also yields `409`, naming the colliding key — never a `500` (ADR-012). |
| `POST /api/v1/admin/registrations/:id/reject` | Admin | Structured reason from a frozen list + optional applicant-facing note; same compare-and-set refusal as approve; creates no `Actor`; the stored consent record is untouched. |
| `POST /api/v1/admin/registrations/:id/dismiss-duplicate` | Admin | Per-candidate dismissal by candidate id (never an index, since detection re-running can reorder or resize the candidate set); persisted on `Registration.duplicateDismissals`. |
| `GET /api/v1/users`, role mgmt | Admin | Cognito-backed user/role administration. |
| `POST /api/v1/contact` | Public | Stateless relay to the current Cognito `admin` group (or `CONTACT_FALLBACK_RECIPIENT`), never persisted. `202` empty body on acceptance; `400` field errors, `413` oversize, `429` throttled, `502` transport rejection, `500` unresolvable recipient. |
| `GET /api/v1/health` | Public | Health check. |

The four public `registrations*` paths are the API's first unauthenticated **write** path (`POST /registrations`) and its first unauthenticated read of anything beyond public directory data (`POST /registrations/lookup`, gated to two scalars). Field projection for them is not role-aware filtering — see §8's structural-containment note. The five `admin/registrations/*` paths are the module's first `Admin`-only, PII-dense surface over that same table — two reads (the queue list, the detail view) and three writes (approve, reject, dismiss-duplicate) — and `approve` is the **only** route in the system that turns a `Registration` into a public `Actor` (§8, ADR-012).

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
- **Styling:** Tailwind + tokens from `docs/ux-ui/design.md`; shadcn/ui primitives. No hardcoded colors/spacing outside tokens.

## 7. Integration Points

- **AWS Cognito** — identity, JWT issuance, role groups.
- **AWS RDS MySQL** — primary datastore (Prisma). Lambda connects within/over VPC; use a connection strategy safe for Lambda concurrency (RDS Proxy or constrained pool).
- **API Gateway + Lambda** — single NestJS handler (via `@vendia/serverless-express` or `aws-lambda-fastify`-style adapter) deployed with Serverless Framework.
- **S3 + CloudFront** — static frontend hosting/CDN.
- **Google Analytics 4** (`gtag.js`, loaded from `googletagmanager.com`) — the project's **first third-party client-side integration** and its first client-side transfer of visitor data to a third party. Default measurement only: no custom events, parameters, or dimensions. Injected by the browser only after explicit consent, mounted in the `(public)` layout; **no server component participates** — the API never sees an analytics call, and the measurement ID is a build-time `NEXT_PUBLIC_*` value, not a secret (see §8 for what belongs in SSM).
- **All provisioning/deploy** runs under `--profile IBD-DEV`.

## 8. Security & Authorization Model

- **Roles:** `Public` (anonymous, read-only non-PII), `Staff` (read incl. PII, create/edit), `Admin` (full incl. delete, import, user mgmt).
- **Enforcement:** NestJS `JwtAuthGuard` (validates Cognito JWT signature/claims) + `RolesGuard` (`@Roles('admin')` etc.). PII projection enforced in the serialization layer independent of route guards (defense in depth).
- **PII set (implemented):** the `Public`-hidden allowlist is `{ phone, email, sex, position, marketLocation, technicalSupport }`, declared once as `PII_ALLOWLIST` in `src/common/pii-consent.policy.ts` — the single runtime source of truth consulted by the role-aware serializer and every public read path. `traderId`, `gpsAltitude`, and `gpsAccuracy` are likewise never public. **Exact GPS is consent-gated:** `gpsLatitude`/`gpsLongitude` are surfaced only for `GRANTED` actors (withheld as `gps: null` for `UNKNOWN`/`DENIED`), and non-`GRANTED` actors are excluded from every public read and from `/metrics` counts. Consent is pinned in the Prisma `WHERE` (not serializer-only) and the boundary is proven end-to-end over HTTP in `src/test/pii-boundary.spec.ts` (NFR-1, NFR-7).
- **Unapproved-PII boundary (public self-registration).** `Registration.payload` and `Registration.submitterEmail` (§3.1) are PII for an organisation that has not been approved for publication and may never be. **`PII_ALLOWLIST` and `NEVER_PUBLIC_FIELDS` cannot protect this table** — both enumerate `Actor` columns for the `Actor` serializer, and neither one sees a `Registration` row. Protection here is **structural, not filtered**: the public surface (`GET /registrations/consent-policy`, `POST /registrations/verify`, `POST /registrations`, `POST /registrations/lookup`) returns at most two or three scalars (`reference`, `status`, `reviewNote`) and never reads the `payload` column or the internal `id`, before or after adjudication. Proven end-to-end over HTTP by extending `src/test/pii-boundary.spec.ts` to this module's paths — release gate, alongside QA-1's existing coverage (see QA-12, §13).
- **Adjudication authority (public self-registration → public `Actor`).** The five `admin/registrations/*` endpoints (§4) are the **only** path by which a `Registration` becomes a public `Actor`. All five are `Admin`-only: `Staff` → `403`, anonymous → `401` (QA-3). The approve/reject transactions close the double-adjudication race by construction, not by a read-then-check: a conditional update matching `id` **and** `status = PENDING_REVIEW` is the first write, and zero affected rows *is* the refusal (`409`), so there is no window in which a second request can race the first. The reviewer's identity (`reviewedBySub`/`reviewedByEmail`) is resolved server-side from the validated JWT and `ActingAdminResolver` — never client-supplied. The created `Actor` is the only public artifact an approval ever produces; `Registration.payload` and `submitterEmail` stay structurally contained (ADR-010) **before and after** adjudication (ADR-012) — approval publishes a projected subset of the payload, never the row itself.

**Transport:** HTTPS everywhere (CloudFront + API Gateway). CORS locked to the CloudFront origin.
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

---

## 12. Architecture Overview & Decisions

*(AKILI canonical section 2. Added 2026-08-03 — documents decisions the system already embodies, so it is a record of the as-built architecture, not a redesign.)*

### 12.1 C4 — Level 1: System Context

```
        ┌───────────────────────┐            ┌────────────────────────┐
        │ Public visitor        │            │ Staff / Admin          │
        │ (anonymous, Public)   │            │ (Cognito user)         │
        └───────────┬───────────┘            └───────────┬────────────┘
                    │ browses map & directory            │ manages actors,
                    │ (no PII, GRANTED actors only)      │ imports, exports, users
                    ▼                                    ▼
        ┌───────────────────────────────────────────────────────────────┐
        │        ACCELERATE Tanzania Seed Registry  [this system]       │
        │  Public seed-system map, actor directory, admin back-office   │
        └───────┬───────────────────────────────┬───────────────────────┘
                │ authenticates                 │ sends invites / resets
                ▼                               ▼
        ┌───────────────────┐          ┌────────────────────┐
        │ AWS Cognito       │          │ AWS SES            │
        │ [external]        │          │ [external]         │
        └───────────────────┘          └────────────────────┘
```

**Legend.** Boxes are people or systems. `[this system]` is what we build; `[external]` is managed AWS service we configure but do not implement. Arrows point in the direction of the call and are labelled with intent.

### 12.2 C4 — Level 2: Containers

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     ACCELERATE Tanzania Seed Registry                    │
│                                                                          │
│  ┌────────────────────────┐  HTTPS /api/v1  ┌─────────────────────────┐  │
│  │ Web SPA                │ ───────────────►│ REST API                │  │
│  │ [Next.js static export]│  Bearer JWT     │ [NestJS on AWS Lambda]  │  │
│  │ S3 + CloudFront        │                 │ behind API Gateway HTTP │  │
│  │ Leaflet map, directory │◄─────────────── │ guards + role-aware     │  │
│  │ admin back-office      │  JSON envelopes │ serializer (PII gate)   │  │
│  └───────────┬────────────┘                 └────────────┬────────────┘  │
│              │                                           │ Prisma        │
│              │                                           ▼               │
│              │                              ┌─────────────────────────┐  │
│              │                              │ Relational DB           │  │
│              │                              │ [AWS RDS MySQL 8]       │  │
│              │                              │ Actor, Crop, consent    │  │
│              │                              └─────────────────────────┘  │
└──────────────┼───────────────────────────────────────────┼───────────────┘
               │ OIDC / JWT                                │ IAM + SG
               ▼                                           ▼
      ┌──────────────────┐                        ┌──────────────────┐
      │ AWS Cognito      │                        │ Secrets Manager  │
      │ [external]       │                        │ [external]       │
      └──────────────────┘                        └──────────────────┘
```

**Legend.** Each box is a separately deployable/runnable unit; `[…]` names its technology. The Web SPA holds **no** server logic — it is a static artifact, so every dynamic read crosses the HTTPS boundary to the REST API. Deployment topology for these containers is `docs/infrastructure.md` §2.

### 12.3 Architecture style

**Modular monolith, deployed serverless.** One NestJS application, internally partitioned into the domain modules of §2, packaged as a *single* Lambda handler. Not microservices: the modules share a datastore and a transaction boundary (the CSV import's per-row isolation depends on it), and the actor count — 1,000s, not millions — does not justify independent scaling units. Frontend and backend are decoupled at the network boundary only.

**Tactics chosen** (against the scenarios in §13): role-aware **serialization allowlist** + consent pinned in the Prisma `WHERE` (information-hiding, defense in depth); **paginated + projection-narrowed endpoints** (`/actors/geo` returns only plot-necessary fields); **indexed filter columns** (`region`, `traderType`, `consentStatus`, `traderName`); **connection reuse across Lambda invocations** (cold-start and connection-exhaustion mitigation); **stateless compute** (availability via managed redundancy rather than custom failover).

### 12.4 Robust-vs-lite tier decision

**Tier: LITE.** Recorded as **ADR-001** below and cited by `docs/infrastructure.md`.

| Robust-tier machinery | Verdict | Why |
|---|---|---|
| Container platform (ECS/EKS) | **Excluded** | Traffic is low and bursty; Lambda's scale-to-zero fits a public reference registry better than a running cluster. |
| Multi-service decomposition | **Excluded** | Shared transaction boundary + a single team; the coupling cost would exceed the isolation benefit. |
| Event bus / async workers | **Excluded** | The only long-running job is CSV import, which fits inside a request with per-row reporting. Revisit if import size grows past the Lambda timeout. |
| CQRS / read models | **Excluded** | Read volume is served by indexes and a narrow geo projection. |
| RDS Proxy | **Deferred** | Constrained pool is adequate at current concurrency. Trigger to adopt: sustained concurrent executions approaching the instance's connection ceiling (see OQ-INFRA-4). |
| Multi-AZ / read replica | **Deferred** | Availability target (§13, QA-4) is business-hours best-effort, not an SLA. |

**What LITE does *not* relax:** the PII/consent boundary (§8), input validation, secrets handling, and least-privilege networking. Tier sizing governs *scaling and topology* machinery, never security controls.

### 12.5 ADR Index

| ID | Decision | Status | Consequence |
|---|---|---|---|
| **ADR-001** | Lite tier: modular monolith on a single Lambda; no containers, no service decomposition, no event bus. | Accepted | Cheapest topology that meets §13. Revisit when import size exceeds the Lambda timeout or concurrency nears the DB connection ceiling. |
| **ADR-002** | Next.js **static export** to S3/CloudFront; all server logic in NestJS. | Accepted | Forbids SSR/ISR/route handlers permanently. Buys trivial hosting, CDN caching, and no frontend runtime to operate; costs client-side-only data fetching and no server-rendered SEO for dynamic pages. |
| **ADR-003** | PII enforced by an **allowlist serializer** plus consent pinned in the Prisma `WHERE`, not by route guards alone. | Accepted | Defense in depth: a new endpoint cannot leak PII by forgetting a guard. Costs one indirection on every read path; proven end-to-end in `src/test/pii-boundary.spec.ts`. |
| **ADR-004** | Consent-gated publication — public reads return **`GRANTED` actors only**, and exact GPS only for `GRANTED`. | Accepted | The registry under-reports its own dataset publicly by design. Non-negotiable: it is the legal/ethical basis for publishing at all. |
| **ADR-005** | **Prisma** as the sole DB access path (no raw SQL on user input). | Accepted | Parameterization by default; migrations are versioned artifacts. Costs Prisma's Lambda bundle size and cold-start weight. |
| **ADR-006** | **Cognito** for identity with group-based RBAC (`admin`, `staff`, else `Public`). | Accepted | No password storage or session infrastructure to own. Couples user administration to Cognito APIs (see `UsersModule`). |
| **ADR-007** | **Leaflet** (not a proprietary map SDK), loaded via a dynamically imported client component. | Accepted | No vendor key or per-view billing; keeps the map out of the static-export server pass. |
| **ADR-008** | **AWS SAM** as the only IaC; three ordered stacks. | Accepted | One provisioning tool matching the serverless target. Console-created resources are drift by definition. |
| **ADR-009** | Docs renamed to the AKILI baseline (`docs/ux-ui/design.md`, `docs/trd/trd.md`); existing TRD section numbers **not** renumbered. | Accepted | Archived specs and code comments keep valid `§n` citations; the cost is the structure map at the top of this file. |
| **ADR-010** | Public self-registration's write path is secured by **structural containment**, not the `Actor` allowlist/consent filters: a dedicated `Registration` table whose public surface returns at most `{reference}` or `{status, reviewNote}` and never the payload. Abuse is bounded by a per-container `@nestjs/throttler` plus persistent counters (`EmailSendBudget`, `RegistrationLookupAttempt`) for the controls a per-container limiter cannot make durable across cold starts. | Accepted | The registry's first unauthenticated write path. `PII_ALLOWLIST`/`NEVER_PUBLIC_FIELDS` cannot protect it, so confinement is structural and independently gated (`src/test/pii-boundary.spec.ts` extension, release gate — QA-12). Four tables now hold personal data with no retention policy (accepted risk, PRD OQ-4). Publication of an approved submission as a public `Actor` is a separate, later, admin-gated act (`docs/specs/admin/registration-review-queue/`) — this ADR covers intake only. |
| **ADR-011** | Client-side analytics is **consent-gated by non-injection** and **contained by layout placement**. GA4's `gtag.js` is not injected at all until the visitor accepts (rather than loaded with consent-mode `denied`), and it is mounted in `app/(public)/layout.tsx` so `(admin)` routes structurally cannot reach it. | Accepted | Zero custom events is the PII mitigation, not an omission: no call site exists that could carry an actor id or a directory search string to Google — ADR-010's containment-over-filtering argument applied to the client. Consequences: GA4's defaults include **city-level** geography derived from IP, which the `/privacy` notice must state (understating it was a real defect, caught in review); withdrawal is asymmetric — accepting takes effect immediately, rejecting only from the next page load, because `next/script` cannot unload an executed script, and this is disclosed rather than fixed. Verified live in production, not only by unit tests: `dataLayer` must receive the `arguments` object, and a plain `Array` is silently ignored by `gtag.js` while every `dataLayer`-shaped assertion still passes. |
| **ADR-012** | **Approve-to-publish is a single-transaction, compare-and-set, human-acknowledged act, and the created `Actor` is the only public artifact it produces.** The registry's one path from private submission to public record. Publication is per-record and never bulk, because each publication is a consent decision (D-3); the payload is published as submitted and never reviewer-edited, because an edited record would be published as consented-to when it is not what was consented to (D-4). The `Registration` row itself never becomes public, before or after adjudication — extending ADR-010's structural containment across the adjudication boundary rather than relaxing it at it. | **Accepted** | The act is irreversible within this spec's scope; there is no un-publish, and the quality of the human judgement it depends on is ungateable (DC-33). Consent provenance is carried verbatim from the stored acceptance record, satisfying ADR-004's publishable state through chunk 1's shared invariant rather than around it. |

## 13. Quality Attribute Scenarios (Non-Functional Requirements)

*(AKILI canonical section 3. Six-part scenarios: source · stimulus · artifact · environment · response · measurable response measure. Security, performance, scalability, and availability are always evaluated.)*

| ID | Attribute | Scenario | Response measure |
|---|---|---|---|
| **QA-1** | **Security (PII)** | An **anonymous visitor** issues a request to **any public read path** (`/actors`, `/actors/:id`, `/actors/geo`, `/export`, `/metrics`) against the **deployed API under normal operation**; the system serializes the response through the role-aware allowlist. | **Zero** occurrences of `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport`, `traderId`, `gpsAltitude`, `gpsAccuracy` in the response body — on **every** public path, asserted end-to-end over HTTP. Tactic: allowlist serializer (ADR-003). Verified by `src/test/pii-boundary.spec.ts`. |
| **QA-2** | **Security (consent)** | An **anonymous visitor** requests actor data **including aggregate counts**, in the **deployed environment**, where the dataset contains `UNKNOWN`/`DENIED` actors; the query layer filters on consent. | **Zero** non-`GRANTED` actors in any public response **or in `/metrics` counts**; `gps: null` for every non-`GRANTED` record. Tactic: consent pinned in the Prisma `WHERE`, not the serializer (ADR-004). |
| **QA-3** | **Security (authorization)** | An **authenticated `staff` user** calls an **admin-only endpoint** (`DELETE /actors/:id`, `POST /import`, user management) in the **deployed environment**. | `403`, with a consistent error envelope and **no** stack trace or internal detail leaked. Tactic: `JwtAuthGuard` + `RolesGuard`, independent of the serializer. |
| **QA-4** | **Availability** | **Any user** loads the public map or directory during **Tanzanian business hours**, in **normal operation**. | Best-effort availability on managed AWS redundancy (CloudFront + Lambda + single-AZ RDS). **No formal SLA is claimed.** Frontend availability is decoupled from API health: a failed API call degrades to an error state, never a blank page. Multi-AZ deferred (§12.4). |
| **QA-5** | **Performance (interactive read)** | A **public visitor** applies a filter on the directory, with the **full ~1,000-actor dataset** loaded, under **normal operation**. | Paginated response returns fast enough to feel interactive at this dataset size, served by indexes on `region`, `traderType`, `consentStatus`, `traderName` — never a full scan or an unbounded list. **No numeric budget has been measured or agreed** (OQ-TRD-1). |
| **QA-6** | **Performance (map load)** | A **public visitor** opens the map view in the **deployed environment**. | `/actors/geo` returns a **narrow projection** (id, name, lat/lng, crops, type) rather than full actor records; payload grows linearly with actor count and stays small enough to plot without pagination at the 1,000+ target. |
| **QA-7** | **Performance (cold start)** | A **visitor** hits the API after an **idle period**, so the Lambda cold-starts. | Mitigated, not eliminated: lazy Prisma client **reused across invocations** and a minimal bundle. Accepted consequence of ADR-001's scale-to-zero choice. |
| **QA-8** | **Scalability (data + concurrency)** | The dataset **grows beyond the 1,000+ target** and concurrent Lambda executions rise, in the **deployed environment**. | List/map/query paths stay indexed and paginated. **Explicit trigger:** when sustained concurrency approaches the RDS instance's connection ceiling, adopt RDS Proxy (§12.4, OQ-INFRA-4). Static frontend scales on CloudFront with no change. |
| **QA-9** | **Correctness (bulk import)** | An **admin** uploads a **CSV containing invalid rows** in the **deployed environment**. | Valid rows commit; **a bad row never corrupts a committed row**. Response reports `{ inserted, updated, failed: [{ row, errors }] }` per row. Tactic: per-row validation + transactional upsert by `traderId`. |
| **QA-10** | **Observability** | An **operator** investigates a failed request **after the fact**. | Structured JSON logs in CloudWatch carrying request id, route, role, and latency; import/export jobs log summary counts. Client-facing errors carry a consistent envelope and **never** a stack trace. |
| **QA-11** | **Accessibility** | A **keyboard or screen-reader user** browses the public site. | WCAG 2.1 AA per `docs/ux-ui/design.md` §10; the **directory list is the accessible equivalent of the map**, so no information is map-only. Structural accessibility (labels, roles, keyboard reachability, ARIA) is enforced in frontend tests via `jest-axe`. **Colour contrast is not** — `jest-axe`'s `color-contrast` rule needs a layout/paint engine jsdom does not provide, so it is skipped without failing rather than enforcing anything. Contrast is instead enforced by a deterministic computed-ratio assertion over the token palette (`frontend/lib/contrast.test.ts`, `docs/specs/enhancement/app-visual-refresh`). |
| **QA-12** | **Security (unapproved PII)** | An **anonymous visitor** issues a request to **any of the four public self-registration paths** (`consent-policy`, `verify`, `registrations`, `registrations/lookup`), against the **deployed API**, where a `Registration` exists in every reachable status (`PENDING_REVIEW`, `APPROVED`, `REJECTED`). | **Zero** occurrences of any `payload` field value, `submitterEmail`, the internal `id`, or reviewer identity in any response body — asserted against fixture **values**, not key names, over HTTP, on every public path this module adds, for a Registration in every reachable status. Tactic: structural containment, not filtered access (ADR-010). Verified by the extended `src/test/pii-boundary.spec.ts`. **Release gate.** |
| **QA-13** | **Security (unapproved PII)** | An **anonymous visitor** issues a request to `POST /api/v1/contact`, against the **deployed API**, where the request carries a requester name, organization, category, subject and message, and the resolved administrator recipients include unverified addresses. | **Zero** occurrences of any requester field value, any administrator email address, or any `PII_ALLOWLIST` value in any response body, error envelope, redirect target, **or log line** produced by `POST /api/v1/contact` — asserted against fixture **values**, not key names, end-to-end over HTTP. Tactic: stateless relay with no persistence (DD-1), server-side recipient resolution never returned to the caller (§6). Verified by the extended `src/test/pii-boundary.spec.ts`, with a `Logger.prototype` spy over `log`/`warn`/`error` — `MailService` is provider-overridden in that block, so the line actually gated is `ContactService`'s transport-failure catch, which is where `MessageRejected` would carry a recipient address. Run against a deliberately-leaking variant (`err.name` → `err.message`) to confirm the gate fails when it should, and guarded against vacuity by asserting the spy captured at least one call before sweeping it. **Release gate.** |

**B3 resolution (`docs/specs/admin/registration-review-queue/judgment.md`).** The five `admin/registrations/*` endpoints that spec adds are covered by **QA-3**, not by a widened QA-12. QA-12's actor is an anonymous visitor on a closed set of four *public* self-registration paths — a structural-containment scenario; `admin/registration-review-queue` adds no public path, and its five routes are Admin-gated with exactly QA-3's `401`/`403` shape. Widening QA-12's actor text to cover admin-gated PII routes would blur two genuinely different scenarios — public-surface containment vs. admin-endpoint authorization — under one label, so QA-3 is cited alone and QA-12's text is unchanged. **The two scenarios do share a mechanism, which is the actual source of the ambiguity B3 raised:** ADR-010 ties QA-12 to the `pii-boundary.spec.ts` extension, and `admin/registration-review-queue` extends that *same* file (via a `FIXTURE_MAP` access discriminant) to prove QA-3 for its five routes. One test file now serves two distinct QA scenarios — recorded here so a future reader who notices that overlap does not mistake it for a reason to re-open B3.

**Open question OQ-TRD-1:** QA-5 has no agreed numeric latency budget. "Fast enough to feel interactive" is not a testable response measure — a p95 target (e.g. filtered list p95 < 500 ms at 1,000 actors) should be set and measured before it can be asserted in a test. Recorded honestly rather than invented here.
