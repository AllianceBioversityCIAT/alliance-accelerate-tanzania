# Requirements — Canonical Actor data model + consent/PII foundation

- Spec path: docs/specs/seed-map/actor-data-model/
- Status: Draft
- Author / Date: JuanCode / 2026-06-23
- Depth: Full
- Related: proposal.md; epic `seed-map/discovery-map/proposal.md`; detailed-design §2,§3,§4,§8; system-design §5,§7; prd.md
- Branch: `feature/seed-map-actor-data-model`

## Document Control

| Field | Value |
|---|---|
| Approved intent | proposal.md (Option A — phased split, Phase 1); seeded data until legal clears |
| Legal gate | PII set, consent rule, public-GPS strategy are **provisional** defaults pending legal-office ratification |
| Source dataset | `Partner Profile 14.4.2026` (436 rows, 18 cols) — **never committed (PII)**; used only to derive the schema |
| Locked decisions | two-spec split (this is Phase 1) · seeded consented sample data for v1 · real-import designed but execution-deferred |

## 1. Summary

Establish the project's first backend and the **canonical Actor data model** consumed by every downstream feature (Discovery Map, Directory, metrics, export). The model is derived from the real Partner Profile dataset and reconciled with detailed-design §3. Its defining property is a **server-enforced PII/consent boundary**: a single PII allowlist and a consent rule drive a role-aware serializer so that **no public response ever exposes PII or the exact location of a non-consented actor**. Because the legal office may change these rules, the PII/consent/public-GPS policy is authored as **one versioned, centrally-edited unit**. v1 ships against **seeded, consented sample data**; importing the real file is designed but execution-deferred behind the legal gate.

## 2. Glossary

- **Actor:** a seed-system participant (trader, offtaker, seed company, cooperative, NGO, research institute) — one row of the source dataset.
- **PII:** personal/identifying data not exposed to the `Public` role. Baseline `{phone, email}`; this spec proposes a provisional expansion (§6 FR-5).
- **Consent status:** whether an actor has consented to public listing — `GRANTED` / `DENIED` / `UNKNOWN`.
- **Public projection:** the field set a `Public`-role response may contain, produced by the role-aware serializer.
- **Public GPS:** the location an actor's pin may use publicly — exact only when consent is `GRANTED`; otherwise withheld/coarsened.
- **PII allowlist:** the single server-side list of fields gated from `Public`; the serializer's source of truth.

## 3. System Context & Scope

This spec creates: a minimal NestJS + Prisma (RDS MySQL) backend deployable as a Lambda behind API Gateway (Serverless Framework, `--profile IBD-DEV`); the Actor/Crop schema + migration; the consent/PII policy + role-aware serializer; the public read API (`/actors`, `/actors/:id`, `/metrics`); a seeded consented sample dataset; and a designed (not-executed) import for the real file.

**In scope:** schema, migration, normalization/validation rules, consent + PII policy, role-aware serializer, public read API, metrics endpoint, seed data, import design.
**Out of scope:** the Leaflet Discovery Map UI (`seed-map/discovery-map`), admin CRUD, Cognito auth implementation, CSV export, real-data import execution. See §9.

## 4. Requirement Numbering & Writing Standards

Functional requirements `FR-<n>`; non-functional `NFR-<n>`. Atomic, testable, MUST/SHOULD/MAY. Scenarios use GIVEN/WHEN/THEN.

## 5. Stakeholders / Personas

| Persona | Role | Interest |
|---|---|---|
| Public visitor | `Public` | Browse actors/metrics — **never** sees PII or non-consented exact locations. |
| Staff / Admin | `Staff`/`Admin` | (Later) full records incl. PII via authenticated API. |
| Legal office | governance | Ratifies/edits the PII set, consent rule, and public-GPS strategy. |
| Data steward | ops | Imports/normalizes the real dataset once legal clears. |

## 6. Functional Requirements

### FR-1: Backend scaffold (NestJS + Prisma + Serverless)
The system MUST provide a minimal NestJS API, Prisma client wired to RDS MySQL, and a Serverless/Lambda deployment definition. All AWS CLI/IaC actions MUST use `--profile IBD-DEV`. A health route MUST return service status.
- Source: detailed-design §1, §2, §11.

#### Scenario: Health check
- GIVEN the API is running
- WHEN `GET /api/v1/health` is called
- THEN it returns `200` with a status payload and no PII.

### FR-2: Canonical Actor schema
The system MUST define `Actor`, `Crop`, and `CropsOnActors` (M:N) per detailed-design §3, with every real source column mapped (`traderId @unique`, `traderName`, `region`, `district?`, `traderType`, `sex?`, `position?`, `marketLocation?`, `capacityTons?`, `technicalSupport?`, `phone?`, `email?`, `gpsLatitude/Longitude/Altitude/Accuracy?`, internal `id`/timestamps) plus a **`consentStatus`** field. A Prisma migration MUST create these tables.
- Source: detailed-design §3.

#### Scenario: Schema round-trips a record
- GIVEN the migrated database
- WHEN a fully-populated actor record is written and read back
- THEN all mapped fields persist with correct types (GPS/`capacityTons` as decimals).

### FR-3: Normalization & validation on write
The system MUST normalize and validate on every write: `region` mapped to a canonical Tanzania region list (dirty values like `Arusha/Dodoma`, `Kusini Unguja Region` resolved or quarantined); `sex` → `M`/`F`/`Other`/null; `traderType` to the agreed taxonomy (§ OQ-2); `capacityTons` numeric ≥ 0; GPS latitude ∈ [−90,90] / longitude ∈ [−180,180]; `email` format when present. Writes failing validation MUST be rejected (DTO-validated), not silently coerced.
- Source: detailed-design §3, §5; CLAUDE.md (validated writes).

#### Scenario: Out-of-range GPS rejected
- GIVEN a create/update with latitude `120`
- WHEN it is submitted
- THEN the API returns a `400` validation error and persists nothing.

### FR-4: Consent model
The system MUST store `consentStatus ∈ {GRANTED, DENIED, UNKNOWN}` per actor. The **public** API MUST return ONLY `GRANTED` actors. Imported real rows with no consent signal MUST default to `UNKNOWN` (not public). Seeded sample actors are `GRANTED`.
- Source: proposal §11 OQ-3 (legal-gated).

#### Scenario: Non-consented actor is invisible publicly
- GIVEN an actor with `consentStatus = UNKNOWN`
- WHEN the public `GET /api/v1/actors` is called
- THEN that actor does not appear in the response or the metrics counts.

### FR-5: PII boundary (role-aware serializer)
A single **PII allowlist** MUST drive a server-side role-aware serializer. For the `Public` role the serialized projection MUST exclude every PII field and MUST NOT include exact GPS for any non-`GRANTED` actor. The provisional public-hidden set is **`{phone, email, sex, position, marketLocation, technicalSupport}` plus exact GPS unless `consentStatus = GRANTED`** — editable in one place for legal. PII gating MUST be enforced server-side (defense in depth), never only in the client.
- Source: CLAUDE.md (PII), detailed-design §3, §8; proposal §11 OQ-4/OQ-5.

#### Scenario: Public response carries no PII
- GIVEN any `GRANTED` actor with phone/sex/position populated
- WHEN the public API serializes it
- THEN the response contains none of `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport`.

#### Scenario: Exact GPS gated by consent
- GIVEN an actor whose `consentStatus ≠ GRANTED`
- WHEN any public endpoint would return location
- THEN exact `gpsLatitude/Longitude` are withheld (actor excluded from public list per FR-4).

### FR-6: Public Actors read API
The system MUST expose `GET /api/v1/actors` returning the public projection of `GRANTED` actors, filterable by `crop`, actor role/`traderType`, and `region`, with pagination; and `GET /api/v1/actors/:id` returning one public actor (404 when not found or not public). Responses MUST match the contract in detailed-design §4.
- Source: detailed-design §4; epic proposal §4.

#### Scenario: Filter by region
- GIVEN consented actors across regions
- WHEN `GET /api/v1/actors?region=Mbeya` is called
- THEN only `GRANTED` actors in Mbeya are returned, each PII-stripped.

### FR-7: Metrics API (home-page contract)
The system MUST expose `GET /api/v1/metrics` returning `actorsMapped`, `cropsTracked`, `regionsCovered`, `actorTypes`, and `crops[] {slug, mappedActors}`, computed over **public/consented** actors only — matching the `Metrics` type the frontend already consumes.
- Source: home-page spec (archived) `lib/api/metrics.ts`; detailed-design §2 MetricsModule.

#### Scenario: Metrics reflect only consented actors
- GIVEN 10 `GRANTED` and 5 `UNKNOWN` actors
- WHEN `GET /api/v1/metrics` is called
- THEN `actorsMapped = 10`.

### FR-8: Seeded consented sample dataset
The system MUST provide a seed of consented sample actors (no real PII) covering the three crops, multiple roles, and several regions, sufficient to drive the map/metrics in v1. The seed MUST be reproducible (`prisma db seed` or equivalent).
- Source: proposal (seeded-data decision).

#### Scenario: Seed populates a usable map dataset
- GIVEN a fresh database
- WHEN the seed runs
- THEN `GET /api/v1/actors` returns the sample actors and `GET /api/v1/metrics` returns non-zero aggregates.

### FR-9 (design-only, execution deferred): Real Partner Profile import
The system SHOULD define an import that reads the real file, dedupes on `traderId`, **quarantines** rows missing `traderId`/GPS, normalizes per FR-3, and sets `consentStatus = UNKNOWN` by default. Its **execution against real data is deferred** until the legal office ratifies consent/PII/public-GPS (FR-4/FR-5).
- Source: detailed-design §3 (import authoritative mapping); proposal §11.

## 7. Non-Functional Requirements

- **NFR-1 (PII server-enforced):** No public/`Public`-role response may contain a PII-allowlist field or a non-consented exact location. Enforced in the serializer, not the client. Verify by integration test on every public endpoint.
- **NFR-2 (AWS profile):** Every AWS CLI/script/IaC/Serverless action MUST include `--profile IBD-DEV`.
- **NFR-3 (Lambda-tuned Prisma):** Prisma client lifecycle MUST be tuned for Lambda (connection reuse/limits) per detailed-design §11.
- **NFR-4 (Validated writes):** All writes go through `class-validator` DTOs (GPS ranges, email format, capacity ≥ 0, enum membership).
- **NFR-5 (Legal-ratifiable policy):** The PII set, consent rule, and public-GPS strategy MUST live as a single versioned policy module edited in one place; a legal change MUST NOT require touching endpoint/component code.
- **NFR-6 (Contract fidelity):** `/actors` and `/metrics` payloads MUST match detailed-design §4 and the frontend's existing `Metrics`/actor types.
- **NFR-7 (Tested boundary):** Unit + integration tests MUST cover the PII boundary and consent filtering (the security-critical paths).

## 8. Data & Schema Impact

New tables: `Actor`, `Crop`, `CropsOnActors`. New field `Actor.consentStatus`. The central **PII allowlist** is expanded (provisionally) beyond `{phone,email}`; the serializer reads it as the single source of truth. No existing tables (none yet).

## 9. Out of Scope

Leaflet Discovery Map UI; admin CRUD; Cognito auth implementation; CSV export; **execution** of the real-data import; the crop *source* decision (OQ-1) — seed data assigns crops directly.

## 10. Open Questions (legal/business-gated — provisional defaults applied)

- **OQ-1 (crop source):** real file has no crop column. v1 seed assigns crops directly; real-actor crop sourcing deferred.
- **OQ-2 (traderType taxonomy):** provisional canonical set = `{seed_company, cooperative, ngo, offtaker, research_institute, informal_trader}` (superset of the 2 source values + mockup legend). Legal/business may revise.
- **OQ-3 (consent default):** provisional = real rows → `UNKNOWN` (not public); seed → `GRANTED`.
- **OQ-4 (PII set):** provisional public-hidden = `{phone, email, sex, position, marketLocation, technicalSupport}`. Legal may add/remove (e.g., `traderName` for individuals).
- **OQ-5 (public-GPS):** provisional = exact GPS only for `GRANTED`; non-consented excluded. Legal may prefer coarsening (district centroid/jitter) instead of exclusion.
- **OQ-6 (region canonicalization):** adopt the official Tanzania region list; map/quarantine dirty values.

## 11. Requirement ID Index

| ID | Title | Covered by task |
|---|---|---|
| FR-1 | Backend scaffold | T-1 |
| FR-2 | Canonical Actor schema | T-2 |
| FR-3 | Normalization & validation | T-3 |
| FR-4 | Consent model | T-4 |
| FR-5 | PII boundary (serializer) | T-4, T-5 |
| FR-6 | Public Actors API | T-5 |
| FR-7 | Metrics API | T-6 |
| FR-8 | Seed dataset | T-7 |
| FR-9 | Real import (design-only) | T-8 |
| NFR-1 | PII server-enforced | T-4, T-5, T-9 |
| NFR-2 | AWS profile | T-1, T-8 |
| NFR-3 | Lambda-tuned Prisma | T-1 |
| NFR-4 | Validated writes | T-3 |
| NFR-5 | Legal-ratifiable policy | T-4 |
| NFR-6 | Contract fidelity | T-5, T-6 |
| NFR-7 | Tested boundary | T-9 |
