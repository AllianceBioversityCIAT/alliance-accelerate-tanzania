# Proposal — One set of required fields across every intake path, and import template v4

**In one line:** admin create, admin edit and the Excel import require the same fields as self-registration. Trader ID's rule is settled. The import template drops GPS Altitude, GPS Accuracy and Registration Source as v4.

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `actors/consent-intake/intake-required-fields` |
| Parent Spec | `actors/consent-intake` (see [`family.md`](../family.md)) — chunk **1 of 2** |
| Ticket | [ATP-84](https://cgiarmel.atlassian.net/browse/ATP-84) |
| Proposal date | 2026-10-02 |
| Author | AKILI (Leader) on behalf of Daniela Gómez |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | Approved — Daniela Gómez, 2026-10-02 (family split) |
| **Depends on** | none |
| **Parallel-safe** | no — shares `ActorForm.tsx` and `actor-import.service.ts` with chunk 2 |
| Suggested depth | ~~Lite~~ → **Standard** (2026-10-02): duplicate detection and the generated Trader ID were added in specify (requirements.md D-15 to D-18) |

The decisions and the current-behavior evidence come from the sibling proposal, [`../consent-request-email/proposal.md`](../consent-request-email/proposal.md): §1 *Decisions already taken* (D-5, D-6, D-11, D-13) and §3, the required-field matrix. They are not restated here.

## 2. Scope

| # | Outcome |
|---|---|
| O-1 | Admin create, admin edit and import require: **Trader Name, Trader Type, Region, Contact Person, ≥1 crop, Capacity (tonnes), Phone, Email**. This is the self-registration set (`RegistrationPayloadDto`). |
| O-2 | **Trader ID** is system-generated, and duplicate detection replaces it as the duplicate safeguard (resolved in specify: requirements.md D-15 to D-18). |
| O-3 | The import template moves to **v4**. It drops GPS Altitude, GPS Accuracy and Registration Source, and an import is always `TEAM_MANAGED`. The consent columns stay optional, with the `GRANTED` provenance gate unchanged (D-13). The workbook is regenerated with `npm run generate:template`, never hand-edited. |
| O-4 | GPS Altitude and Accuracy stay on the admin form and in the DB (D-11). |
| O-5 | Backend DTOs, `ActorForm.validate`, import row validation and the template's Instructions sheet agree, and one test pins the shared set so the paths cannot drift again. |
| O-6 | `docs/prd.md` and `docs/trd/trd.md` state the unified rule. *(The import runbook originally named here exists only in the archive, so requirements.md FR-6 was amended 2026-10-02.)* |

## 3. Non-Goals

- Anything in chunk 2: consent emails, the public page, evidence, S3.
- Back-filling existing actors that lack the newly required fields. They are test data (D-3); an admin editing one must complete it.

## 4. Risks And Open Questions

| # | Item |
|---|---|
| R-1 | Making Phone and Email required on **edit** blocks saving an incomplete legacy row until it is completed. This is accepted under D-3. |
| R-2 | A stale v3 workbook is rejected, which is existing behavior. Anyone holding a downloaded v3 must re-download. |
| **OQ-1** | **Trader ID.** Today it is required on the admin paths, `@unique` in `schema.prisma`, admin-only (`NEVER_PUBLIC_FIELDS`), and the import's duplicate key: an existing ID gives `skipped-exists`. Self-registration derives it from the reference (DD-23). The options are to keep it required, or to make it **optional, auto-generated when blank, and unique when given**. A related hazard: a mistyped ID that collides with an existing one is skipped as a "duplicate" with no other signal. **Resolved 2026-10-02 → requirements.md D-15 to D-18.** |

## 5. Success Criteria

- The same missing-field payload is rejected by all three paths, and one test fails if any path drifts.
- Template v4 imports cleanly and a v3 file is rejected as stale.

## 6. Next Step

```text
/akili-specify actors/consent-intake/intake-required-fields
```
