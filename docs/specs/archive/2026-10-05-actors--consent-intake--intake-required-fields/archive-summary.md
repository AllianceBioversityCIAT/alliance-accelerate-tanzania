# Archive Summary — One intake contract: required fields, generated Trader ID, duplicate detection, template v4

**Outcome:** delivered, validated and accepted by the product owner after manual testing (2026-10-05). The three intake paths share one required-field contract. The Trader ID is system-generated. Duplicate detection on identity replaces the Trader-ID natural key. The import template is v4.

## 1. Document Control

| Field | Value |
|---|---|
| Spec | Chunk 1 of the `actors/consent-intake` family (ATP-84) |
| Branch | `feature/atp-84-consent-request-email` (spec branch; not pushed) |
| Approval Mode | gated |
| Archived by | `/akili-archive`, Leader session |

## 2. Original Spec Path

`docs/specs/actors/consent-intake/intake-required-fields/`

## 3. Archive Date

2026-10-05

## 4. Final Status

**Done.**
- 8/8 tasks are `[x]` with a Reviewer PASS.
- Validation is ARCHIVE-READY after remediation (`validation-report.md` §13).
- The product owner tested in the local stack (cases A–J) and said "todo está bien".

## 5. Requirements Delivered

| Requirement | What was delivered |
|---|---|
| FR-1 | One required set (Trader Name, Type and Region; Contact Person; ≥1 crop; Capacity; Phone; Email) with the self-registration bounds on admin create, edit and import. On edit the check runs against the merged state, and identity fields set to `null` return a 400. |
| FR-2 | `TM-<year>-<NNNN>` comes from `ActorSequence` (range allocation, per-chunk allocation on import, collision retry ≤3). The ID is never a client input, and existing IDs are unchanged. |
| FR-3 | Admin-create duplicate gate. A strong match (email/phone) returns 409 until the request confirms it by the set of candidate ids, recomputed every time. A weak match (name/GPS) creates the actor with a warning. The confirmation is audited. |
| FR-4 | Import classification against the DB and earlier rows: per-row confirmation, `possible-duplicate` outcome, a wire cap of 50 plus a total, and the consent gate also running on held rows. |
| FR-5 | Template v4 drops Trader ID, GPS Altitude/Accuracy and Registration Source; consent columns stay optional; v3 is rejected. |
| FR-6 | PRD and TRD state the contract. The TRD §4 API routes were corrected, and the ADR-NNN placeholder is in place. |
| NFR-1 to NFR-4 | One declared contract pinned by tests; a 1,000-row preview takes about 50–195 ms (mocked DB); no contact values in any candidate; accessibility of dialogs and live regions. |

**Post-validation decisions by the product owner (2026-10-05):**
- **RBAC:** only Admin creates, edits, imports and views actor PII. Applied in the PRD and TRD.
- **D-19:** GPS altitude and accuracy removed from the admin form.
- **Polish:**
  - the "Actor type" filter label on the map and directory;
  - no Trader ID column in the import preview;
  - the admin double-scroll fixed with `<main>` set to `relative`.

## 6. Files Changed Summary

| Area | Files |
|---|---|
| Backend | <ul><li>New: `common/intake-contract.ts`, `actors/trader-id.util.ts`, `actors/intake-duplicate.service.ts`</li><li>Modified: `actors/actors-admin.service.ts`, `actors/actor-import.service.ts` (+ types and DTO), `actors/actor-audit.service.ts`, `actors/audit-entry.serializer.ts`, DTOs, `common/template-columns.ts`, `scripts/generate-import-template.ts`, `registrations/duplicate-detection.service.ts` (exports only)</li><li>2 additive migrations (`add_actor_sequence`, `add_audit_duplicate_confirmation`)</li></ul> |
| Frontend | <ul><li>New: `components/admin/DuplicateConfirmDialog.tsx`, `lib/content/intake-required-fields.ts`</li><li>Modified: `ActorForm.tsx`, `ImportPreviewTable.tsx`, `ActorHistoryPanel.tsx`, `lib/api/{client,actors-admin}.ts`, the import, new and edit pages, `app/(admin)/layout.tsx`, `DirectoryFilters.tsx`, `FilterControls.tsx`</li><li>The regenerated `public/templates/actor-import-template.xlsx`</li></ul> |
| Docs | `docs/prd.md`, `docs/trd/trd.md`, `../consent-request-email/proposal.md`, `../family.md` |
| Size | About 9,000 LOC changed, tests dominant (`git diff --stat 1bf27d0..HEAD -- backend frontend`) |

## 7. Test Evidence Summary

No `test-report.md` exists: `/akili-test` was not run. The evidence instead consists of:
- each task's falsifiers, executed red by the Implementer;
- a non-author re-run on every attempt (VERIFIED each time);
- Reviewer reading;
- real-MySQL probes run by the Leader (allocation 25/25 distinct; the collision `meta.target` shape);
- headless-Chromium captures and measurements.

**Final gates:** backend 86 suites / 1,416 tests; frontend 120 / 1,848; build, tsc and lint green.

## 8. Validation Summary

- **First pass:** 3 independent validators (coverage, consistency, facts) found **4 FAIL / 21 WARN**.
- **Remediation:**
  - R-1 (code) passed on its first attempt.
  - R-2 (docs) hit a **HALT** after 3 attempts on a "§203" line-number citation.
  - That citation was fixed **Leader-inline with product-owner approval**, and an independent Reviewer confirmed it.
- **Re-validated:** ARCHIVE-READY.

## 9. Accepted Warnings Or Follow-Ups

| Item | Disposition |
|---|---|
| ADR-NNN number (4 TRD citations, plus chunk 2's "ADR-017" mentions) | Pending: allocate at apply time on `main` (kaizen `trd-adr` item) |
| Real-MySQL concurrency, the check-then-create race, more than 50 strong candidates, the uncompressed preview above 6 MB without gzip, legacy actors re-imported as weak duplicates | Declared gaps or accepted limits (design §9, DD-5) |
| NFR-2 timed against a mocked DB only | Accepted |
| Import UX copy: the "To create" chip vs the button count; "No rows are eligible…"; the acknowledgement dialog for unticked held `GRANTED` rows | Follow-up |
| House-wide dialog items: 375 px gutter, focus while loading, focus restore | Follow-up |
| TRD §8 "Enforcement" lowercase `@Roles('admin')`; the `app.module.ts` docblock "Import module arrives in T-8"; the NFR-1 spec lists identity fields by hand | Follow-up (cosmetic) |
| GPS altitude and accuracy values already stored are invisible in the admin UI (D-19) | Accepted by the product owner |

## 10. Historical Notes

- **Late scope growth.** The spec grew from Lite to Standard during specify, when the Trader-ID decision became system-generated plus duplicate detection. The budget was re-baselined twice: ~1,800 → ~5,500 → ~9,500 LOC, under a standing product-owner authorization.
- **T-5 was reopened** after T-7's review found that its import ordering bypassed the consent gate for held rows. That was a defect, not a pivot.
- **The Leader authored four FAIL sources:**
  - the T-1 closure gap;
  - the T-2 execute-time design edit (array-only `meta.target`);
  - the T-5 reviewer brief omission;
  - the T-8 design under-scope of the TRD API section.

  See the kaizen entry.
- **Concurrency.** Four idle `claude` sessions shared the checkout. The product owner chose to continue, and no foreign changes were observed.
