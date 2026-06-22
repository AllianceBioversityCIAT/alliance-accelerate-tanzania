# Product Requirements Document — ACCELERATE Tanzania Seed Registry

> Living document. Constitutional baseline for all SDD work in this repository.
> Last reviewed: 2026-06-22.

## 1. Overview & Purpose

The **ACCELERATE Tanzania Seed Registry** is a digital, publicly accessible platform that maps, structures, and visualizes the seed system ecosystem in Tanzania. It focuses on the **sorghum**, **common bean**, and **groundnut** value chains.

The platform transitions fragmented, static CSV/Excel datasets into a **living, centralized, scalable web system** that any stakeholder can browse, search, and analyze. It is designed to serve **1,000+ actors** across the seed system: seed companies, NGOs, traders, processors, farmer groups, and cooperatives.

## 2. Problem Statement

Seed system data in Tanzania today lives in disconnected spreadsheets owned by individual programs and partners. This creates concrete problems:

- **No single source of truth** — actor records are duplicated, inconsistent, and quickly stale.
- **No discoverability** — stakeholders cannot search or browse who operates where, for which crop, at what capacity.
- **No spatial insight** — GPS coordinates exist in the data but are never visualized, so territorial patterns and coverage gaps stay invisible.
- **No safe sharing** — spreadsheets mix public information with PII (phone numbers, emails), so the whole file gets locked down or over-shared.
- **No controlled updates** — there is no governed way for field staff to add or correct records.

The Registry solves these by providing a governed, role-aware, map-enabled web system on top of a single relational database.

## 3. Target Personas

| Persona | Role in system | Primary needs |
|---|---|---|
| **Public visitor** (donor, researcher, partner, general public) | `Public` (unauthenticated) | Browse and search the actor directory; see the map and aggregate metrics; **no access to PII**. |
| **Field/Data-entry staff** (program officers, enumerators) | `Staff` | Add and edit actor records, including PII; import field-collected CSVs; cannot manage users or delete in bulk. |
| **Administrator** (program lead, data manager) | `Admin` | Full CRUD on all records and fields; user/role management; bulk import/export including PII; data governance. |

## 4. Goals & Success Metrics

| Goal | Success metric |
|---|---|
| Centralize the seed system dataset | 100% of the existing CSV/Excel actor records imported into RDS MySQL with zero field loss. |
| Make actors discoverable | Public directory search returns results in < 1s (p95) over 1,000+ records; pagination on every list view. |
| Visualize territorial patterns | Map renders all geolocated actors and supports filtering by Crop, Region, Capacity, and Trader/processor type. |
| Protect PII | 0 PII fields (phone, email) exposed to `Public` role in any API response, export, or page. |
| Enable governed data entry | `Staff` can create/edit a record end-to-end with form validation; invalid submissions are rejected with field-level errors. |
| Operate cost-effectively | Static frontend on S3/CloudFront; serverless backend on Lambda — no always-on servers. |

## 5. Scope

### In Scope
1. **Public Registry Portal** — landing page with high-level metrics (total actors mapped, crops tracked, regions covered) and a searchable, paginated actor directory.
2. **Actor Profiles Module** — standardized profile pages backed by the canonical Actor schema (see Detailed Design §3).
3. **Geospatial Visualization (Seed Maps)** — interactive Leaflet map of actor locations with Crop / Region / Capacity / Trader-type filters.
4. **Data Management & Admin Backend** — protected Next.js Admin UI + secured NestJS routes for CRUD on Actor Profiles, with form validation.
5. **Access Control & Data Protection** — RBAC (`Public` / `Staff` / `Admin`) with PII field-level protection.
6. **Data Import/Export** — CSV bulk import service for initial seeding; filtered CSV export that enforces data-protection rules.

### Out of Scope (v1)
- Self-service public registration / actor self-onboarding.
- Multi-country support (Tanzania only).
- Crops beyond sorghum, common bean, and groundnut.
- Mobile native apps (responsive web only).
- Advanced analytics dashboards / BI beyond the landing-page metrics and map filters.
- Real-time collaboration or record-level audit history UI (basic timestamps only in v1).

## 6. User Stories

- **US-1 (Public):** As a public visitor, I can browse a paginated directory of seed system actors and search by name/region/crop, so that I can find relevant stakeholders — without seeing their phone or email.
- **US-2 (Public):** As a public visitor, I can view an interactive map of actors and filter by crop, region, capacity, and trader type, so that I can understand territorial coverage and gaps.
- **US-3 (Public):** As a visitor landing on the homepage, I can see headline metrics (actors mapped, crops tracked, regions covered), so that I understand the dataset's scale at a glance.
- **US-4 (Staff):** As data-entry staff, I can sign in and create or edit an actor record through a validated form, so that field corrections reach the central registry reliably.
- **US-5 (Staff/Admin):** As authorized staff, I can view full actor profiles including PII, so that I can contact and verify actors.
- **US-6 (Admin):** As an administrator, I can bulk-import a CSV of actors matching the canonical schema, so that I can seed and update the registry efficiently.
- **US-7 (Admin/Staff):** As an authorized user, I can export a filtered dataset as CSV, and the export respects my role's PII permissions, so that data sharing stays compliant.
- **US-8 (Admin):** As an administrator, I can manage users and their roles, so that access stays governed.

## 7. Acceptance Criteria

- **AC-1:** Every public-facing actor list and detail response omits `phone` and `email` unless the requester is authenticated as `Staff` or `Admin`. (Testable: API contract test per role.)
- **AC-2:** The directory paginates at a fixed page size and supports search across `traderName`, `region`, `district`, and `crop`; p95 latency < 1s over the seed dataset.
- **AC-3:** The map plots a marker for every actor with valid `gpsLatitude`/`gpsLongitude`; the four filters compose (AND) and update markers without a full page reload.
- **AC-4:** Creating/editing an actor rejects invalid input (missing required fields, malformed email, out-of-range GPS) with field-level error messages; valid input persists to MySQL.
- **AC-5:** CSV import maps every column in the canonical schema, reports per-row success/failure counts, and does not partially corrupt the table on a bad row.
- **AC-6:** CSV export for a `Public`-equivalent share omits PII columns; export for `Admin` includes them.
- **AC-7:** All AWS CLI / IaC / deployment commands use the `IBD-DEV` profile.

## 8. Assumptions, Dependencies, & Constraints

- **Stack (mandated):** Next.js (App Router, TS, Tailwind) on S3 + CloudFront; NestJS (TS) serverless REST API on Lambda + API Gateway; MySQL on AWS RDS.
- **ORM:** **Prisma** (chosen 2026-06-22).
- **Map library:** **Leaflet** (chosen 2026-06-22; free, no per-load billing).
- **Auth:** **AWS Cognito** user pools issuing JWTs; NestJS guards enforce RBAC (chosen 2026-06-22).
- **AWS profile constraint (mandated):** every AWS CLI command, deployment script, Terraform/CDK/SAM/Serverless definition **MUST** use `--profile IBD-DEV`.
- **Data source:** the canonical Actor schema derives from the existing field dataset (see Detailed Design §3 for the field mapping).
- **Deployment isolation:** target environment is the `IBD-DEV` AWS account/profile.

## 9. Open Questions

- **OQ-1:** Is the `Crop` association one-to-one or many-to-many per actor (can one trader handle multiple of the three crops)? Default assumption: **many-to-many**.
- **OQ-2:** What is the canonical Region/District list for Tanzania — free text on import, or validated against a reference table? Default v1: free text, normalized on import.
- **OQ-3:** Should `Public` see approximate (jittered) GPS, exact GPS, or region-centroid only on the map? Default v1: exact coordinates are non-PII and shown publicly.
- **OQ-4:** Retention/governance policy for PII (who can delete, audit requirements)?
- **OQ-5:** Expected page size for directory pagination (default assumption: 20/page).
