# Validation Report — Admin Actor Bulk Import (Excel)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/admin/actor-import/` |
| Validation date | 2026-07-10 |
| Validator | SDD (Claude, Leader) — implementation executed via the `.agents/` triad (8 Implementer + 10 Reviewer agent runs) |
| Inputs | proposal.md (Approved), requirements.md (Approved), design.md (Approved), tasks.md, execution.md |
| Method | Fresh full-suite/build/lint runs + the per-task independent Reviewer audits recorded in execution.md + live deployment evidence + user browser confirmation (desktop **and mobile**) |

## 2. Summary

**Overall: PASS — archive-ready.** All 9 tasks `[x]` with independent Reviewer PASS verdicts (T-1..T-8 on first attempt; T-9 deployed, reopened on live user findings, reworked with two further PASS fixes, redeployed, user-confirmed "todo funciona bien"). Fresh gates at validation time: backend **356/356** (33 suites), frontend **890/890** (67 suites), both builds green (static export includes `/admin/actors/import` ○), both lints exit 0, live smoke PASSED. The rework produced the spec's most valuable outcome beyond its own scope: discovery and repair of a **latent bootstrap-era serverless-http/body-parser defect that silently 500'd every authenticated JSON write on the deployed Lambda**, plus the handler-level test harness that now prevents that class of gap.

## 3. Task Completion

| Task | Status | Attempts | Reviewer verdict |
|---|---|---|---|
| T-1 `IMPORT` enum migration | `[x]` | 1 | PASS — additive-only verified against SQL |
| T-2 template column map | `[x]` | 1 | PASS — single-source-of-truth confirmed (no copied literals) |
| T-3 generator + committed asset | `[x]` | 1 | PASS — byte-stability independently reproduced; ZipWriter wrap + hidden-Lists decisions accepted with real guards |
| T-4 DTO + report types | `[x]` | 1 | PASS — contract exact vs design §3 |
| T-5 `ActorImportService` + `logImport` | `[x]` | 1 | PASS — 10-point checklist; DR-5 broadening accepted |
| T-6 route + 8MB body limit + e2e | `[x]` | 1 | PASS — route order, W-1 symmetry, full §10 e2e |
| T-7 `importActors` client | `[x]` | 1 | PASS — type fidelity field-by-field |
| T-8 import UI | `[x]` | 1 | PASS — tokens byte-identical; ack coupling ruled fails-closed |
| T-9 deploy + live verify | `[x]` | 1 + rework | Deployed; reopened on user findings; **fix-500 PASS** + **fix-UX PASS**; redeployed; user-confirmed |

Every task entry in `execution.md` records implementer evidence, reviewer verdict, and decisions. The only rework loop (T-9) was driven by live user testing, exactly as the SDD loop intends.

## 4. File Existence

All design §4/§5 files exist and are committed across 14 `[SPEC:admin/actor-import]` commits: migration, `template-columns.ts`, generator script + `frontend/public/templates/actor-import-template.xlsx` (byte-stable, sha-verified against the CloudFront-served copy), DTO/types, `actor-import.service.ts`, controller route, `body-parser.config.ts`, `lambda-handler.e2e.spec.ts`, client extensions, import page + `ImportPreviewTable`, toolbar entry, and all test files. **PASS**

## 5. Build Integrity (fresh at validation)

| Check | Result |
|---|---|
| Backend `npm test` — 33 suites / **356 tests** | PASS |
| Backend `npm run build` | PASS |
| Backend `npm run lint` | PASS (exit 0) |
| Frontend `npm test` — 67 suites / **890 tests** | PASS |
| Frontend `npm run build` (static export; `/admin/actors/import` ○) | PASS |
| Frontend `npm run lint` | PASS |

## 6. Requirement Coverage

| Req | Evidence | Result |
|---|---|---|
| FR-1 template | Generator + asset; Instructions sheet documents all 20 columns + v1 stamp; zero data/PII (reviewer opened the file); served byte-identical from CloudFront | PASS |
| FR-2 upload + validation | 4MB/1,000-row caps → 400; DTO-parity validation; field-level row errors; e2e 400s (.csv, non-base64, corrupt) | PASS |
| FR-3 preview | e2e proves preview writes nothing; commit re-validates statelessly (DR-4) | PASS |
| FR-4 skip duplicates | In-file first-wins + single-query DB dedupe; e2e re-upload idempotence (0 created); existing actors untouched | PASS |
| FR-5 fault isolation | Chunked tx (100) with per-chunk rollback + later chunks proceeding (unit 150-row proof) | PASS |
| FR-6 consent gate | GRANTED w/o ack → row fails (server-enforced); with ack → created + persisted; empty → UNKNOWN; UI AcknowledgeDialog gating | PASS |
| FR-7 per-row report | Totals-vs-rows consistency pinned; commit outcomes reflect DB truth (e2e) | PASS |
| FR-8 audit | `logImport` batched snapshots, `IMPORT` action; e2e retrieves entries via history route; migration applied to dev RDS | PASS |
| FR-9 import UI | Full flow live-verified by the user incl. mobile; empty-file notice; result live-region | PASS |
| FR-10 RBAC | e2e matrix + live 401 without token post-deploy | PASS |
| FR-11 PII containment | e2e asserts seeded phone/email values never appear in report bodies; pii-boundary 10/10; no row-content logging | PASS |
| NFR-1..NFR-8 | Hardened parse (incl. the fix-500 defense-in-depth), static export ○, WCAG AA (reviewer-checked), batch atomicity, suites green, one-invocation caps, additive migration applied, template anti-drift byte-tested | PASS |

**Requirements gained coverage during rework:** NFR-1's "parser failures → clean 400, never a crash" is now enforced at two layers (`normalizeServerlessJsonBody` + `BodyShapeValidationPipe`) and guarded by the new **lambda-handler e2e** — the first test in the repo that exercises the real serverless entrypoint.

## 7. Quality Audit Findings

**Blocking:** none.

**Accepted judgment calls (recorded in execution.md):**
1. **DR-5 broadened:** malformed (not just out-of-range) GPS cells clear+warn instead of failing the row — reviewer ruled consistent with the DR's rationale.
2. **Ack-detection string coupling (T-8):** UI detects GRANTED rows via `/acknowledgement/i` on warnings — ruled acceptable because the approved contract has no structured flag and the flow **fails closed** (server gate). Follow-up below.
3. **`useBodyParser` idiom** instead of the design's `express.json({limit})` sketch — equivalent, W-1 symmetry preserved.

**Follow-ups (non-blocking):**
- **F-1:** add a structured `needsAcknowledgement` flag to `ImportReport` (or a shared exported `CONSENT_ACK_WARNING` constant) to remove the string coupling.
- **F-2:** derive `JSON_BODY_LIMIT_BYTES` from `JSON_BODY_LIMIT` (hand-synced literals today).
- **F-3 (product):** an update/upsert import mode remains explicitly out of scope (skip-only v1).

## 8. Design & Proposal Conformance

- Implementation matches design §1–§10 including all seven DRs; the three deviations above are documented and reviewer-accepted.
- Proposal alignment: all approved decisions honored — skip-on-duplicate (never modify existing), Admin-only, `.xlsx`-only, validate-first preview, consent-safe UNKNOWN default, `IMPORT` audit action. The constitutional deviation (detailed-design "upsert" → skip) is recorded in requirements §2.
- **Adjacent work outside spec scope (same session, separate commits):** admin sidebar placeholder removal (`df7a3e1`), mobile shell fixes — hamburger menu, stacked body, brand link to `/admin/actors`, mobile public-site link (`9f5f1ae`, `54bced8`). These addressed live UX feedback on the shell (from `admin/user-management`), not import requirements; noted here for the audit trail.

## 9. Test Evidence Summary

- Unit: column map (11), generator byte-stability (17 template total), DTO (8), import service (30), audit `logImport` (+4 → 21), client (51 incl. 14 import).
- E2E: `admin-actor-import` (16 — RBAC, preview purity, mixed lifecycle, idempotence, consent gate, PII-echo, public regression), `lambda-handler` (2 — the serverless-path regression harness), `pii-boundary` (10).
- Frontend: import page + preview table (22 post-UX-rework), full suite 890.
- Live: smoke PASSED ×3 deploys; 401 matrix; template sha match via CloudFront; **user browser confirmation of the full flow on desktop and mobile**.

## 10. Remediation

None required for archive. F-1/F-2 are small hardening follow-ups; F-3 is future product scope.

## 11. Archive Readiness Recommendation

**READY.**

```text
/sdd-archive admin/actor-import
```
