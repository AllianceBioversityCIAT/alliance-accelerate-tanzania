# Proposal — Canonical Actor data model + consent/PII foundation

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `seed-map/actor-data-model` |
| Type | Foundational (data model + backend + legal-gated PII/consent) |
| Status | Draft — awaiting approval |
| Parent | `seed-map/discovery-map/proposal.md` (epic umbrella) |
| Branch | `feature/seed-map-actor-data-model` (off `feature/brand-palette-pabra`) |
| Depth | Full |
| Legal gate | **Yes** — PII/consent/public-GPS rules are provisional until the legal office ratifies |

## 2. Intent

Establish the project's **first backend** and the **canonical Actor data model** that the Discovery Map, Directory, and exports will all consume — derived from the real `Partner Profile 14.4.2026` dataset, reconciled with detailed-design §3, and built with a **server-enforced PII/consent boundary** designed to absorb legal-office changes in one place. v1 ships against **seeded, consented sample data**; real-data import is designed but execution-deferred behind the legal gate.

## 3. Problem / Current Behavior

No backend, no database, no Actors API exists. The home page already consumes `GET /api/v1/metrics` (unimplemented). The Discovery Map (next spec) needs a stable, PII-safe Actors contract. Profiling the real dataset (436 rows, 18 cols) surfaced model decisions — consent, PII expansion, public-GPS, taxonomy, region cleanup, the crop gap — that must be settled at the data layer before any consuming UI is built.

## 4. Proposed Outcome

- Minimal NestJS + Prisma + Serverless/Lambda backend scaffold (per detailed-design), `--profile IBD-DEV` for any AWS action.
- Finalized **Actor / Crop / CropsOnActors** Prisma schema + a **consent** field + a **single PII allowlist**.
- A **role-aware serializer** (defense-in-depth) so no public response exposes PII or exact GPS for non-consented actors.
- Public read API: `GET /api/v1/actors` (filterable, PII-stripped, consent-aware GPS), `GET /api/v1/actors/:id`, and `GET /api/v1/metrics` (satisfying the home page's existing dependency).
- A **seeded consented sample dataset** for v1; a designed (execution-deferred) **import** for the real file.

## 5. Scope / Non-Goals / Approach

See the epic umbrella `seed-map/discovery-map/proposal.md` §5–§11 for the full scope, options, and legal-gated open questions (OQ-1 crop source, OQ-2 taxonomy, OQ-3 consent, OQ-4 PII set, OQ-5 public-GPS, OQ-6 region). **This spec covers the data/API/consent foundation only**; the Leaflet map UI is `seed-map/discovery-map` (later). Recommended approach: Option A (phased split) — this is Phase 1.

## 6. Next Step

```text
/sdd-specify seed-map/actor-data-model   (this spec — requirements/design/tasks below)
```
