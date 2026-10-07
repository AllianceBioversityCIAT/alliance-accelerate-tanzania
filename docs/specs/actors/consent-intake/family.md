# Spec Family — Consent intake for team-managed actors (ATP-84)

## Document Control

| Field | Value |
|---|---|
| Parent spec path | `actors/consent-intake` |
| Ticket | [ATP-84](https://cgiarmel.atlassian.net/browse/ATP-84) |
| Date created | 2026-10-02 |
| Last updated | 2026-10-05 |
| Spec-family status | `open` |
| Split approved | Daniela Gómez, 2026-10-02 |

## Children

| # | Spec Path | Depends on | Parallel-safe | Status |
|---|---|---|---|---|
| 1 | `actors/consent-intake/intake-required-fields` | none | no | done (archived 2026-10-05 → `archive/2026-10-05-actors--consent-intake--intake-required-fields/`) |
| 2 | `actors/consent-intake/consent-request-email` | `actors/consent-intake/intake-required-fields` | no | done (archived 2026-10-07 → `archive/2026-10-07-actors--consent-intake--consent-request-email/`) |

Both children edit `frontend/components/admin/ActorForm.tsx` and `backend/src/actors/actor-import.service.ts`, so neither is parallel-safe with the other. Child 1 goes first because it settles the field rules child 2 builds on.

**Closed-set rule:** this table is the complete set of children in this family. No AKILI command creates a child spec folder without a prior row here, and adding a row is a manifest edit that needs HITL approval.
