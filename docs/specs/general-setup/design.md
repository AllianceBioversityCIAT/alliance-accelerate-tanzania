# Template — `design.md`

> Methodology template. Every feature spec under `docs/specs/<spec-path>/design.md` MUST follow this structure.
> This is NOT a feature spec. Copy and fill it when running `/akili-specify`.

## Spec Header (required)
```
# Design — <Feature Name>
- Spec path: docs/specs/<taxonomy>/<feature-slug>/
- Status: Draft | Approved | In Progress | Done
- Traces requirements: FR-1..N from this spec's requirements.md
```

## 1. Approach Overview
How this feature is built within the mandated architecture (Next.js static export + S3/CloudFront · NestJS on Lambda + API Gateway · RDS MySQL · Prisma · Cognito · Leaflet). One or two paragraphs + a diagram if useful.

## 2. Data Model Changes
- Prisma model/field additions or migrations (reference `docs/trd/trd.md §3`).
- Migration plan (name, reversible?), seed/backfill needs.
- Mark any new field with disclosure implications and classify it in `backend/src/common/pii-consent.policy.ts` (publicly-disclosed / contact-block / never-public, or, to withhold it, declared in the retained `PII_ALLOWLIST` **and** omitted from `PUBLICLY_DISCLOSED_FIELDS`/`CONTACT_BLOCK_FIELDS` — `PII_ALLOWLIST` alone has zero runtime consumers and withholds nothing by itself). **All three of those constants are declarations that the test suite asserts against — none has a runtime consumer.** The act that actually withholds a field is **not naming it in `toPublicListItem` / `toPublicDetail`** (`backend/src/common/role-aware.serializer.ts`), which build public output by explicit literal pick; `role-aware.serializer.spec.ts` pins both projections' exact key sets, so a field added to a pick reddens there.

## 3. API Surface & Contracts
For each endpoint: method + path (`/api/v1/...`), auth/role, request DTO, response envelope, error cases. Confirm role-aware PII projection on every read path.

## 4. Backend Design
NestJS module/service/controller layout, guards/decorators used (`@Roles`), validation DTOs (`class-validator`), transaction boundaries, error handling (global filter + envelope).

## 5. Frontend Design
Routes (`(public)` / `(admin)`), components (map tokens, disclosure-sensitive sections, forms), data fetching (React Query/SWR), URL-synced filter state, auth guarding (client UX + server enforcement). Reference component inventory and **design tokens** in `docs/ux-ui/design.md §7–8` — no hardcoded colors/spacing.

## 6. Security & RBAC
Which roles, where enforced (guard + serializer), PII handling, CORS/secrets implications.

## 7. Infrastructure / Deployment
Serverless/IaC changes, new AWS resources, env/secrets. **All commands and IaC use `--profile IBD-DEV`.**

## 8. Decision Records (ADR-style)
```
### Decision: <title>
- Context · Options considered · Decision · Consequences
```

## 9. Risks & Mitigations
Cold starts, DB connections under Lambda concurrency, map performance at scale, migration risk.

## 10. Test Plan Outline
Unit/integration/E2E coverage mapped to FRs; explicit PII-omission tests for Public role.
