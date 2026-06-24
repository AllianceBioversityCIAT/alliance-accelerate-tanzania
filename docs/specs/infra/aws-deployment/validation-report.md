# Validation Report — AWS Deployment Infrastructure (CloudFormation/SAM bootstrap)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `infra/aws-deployment` |
| Branch | `feature/infra-aws-deployment` |
| Validated | 2026-06-24 |
| Validator | Claude (Leader / JCSPECS SDD) |
| Depth | Full |
| AWS profile / region | `IBD-DEV` / `eu-west-1` |
| Overall result | **PASS — archive-ready** (authoring-complete; live apply is an operator step) |

## 2. Summary

The dev AWS deployment infrastructure is fully **authored and locally validated** across T-1..T-10, all ten tasks Reviewer-PASS and committed (`7f30c17`→`cdeac6b`). The spec delivers AWS SAM/CloudFormation IaC for the five components — **RDS MySQL + Secrets Manager**, **Cognito** (pool/client/`admin`+`staff` groups), **NestJS Lambda + HTTP API**, **private S3 + CloudFront (OAC)** — plus seven operator scripts (validate, deploy, migrate-seed, deploy-frontend, set-cors, smoke, teardown), a full runbook, and the IaC ratification (CLAUDE.md + root README; `serverless.yml` retired). **All 3 templates pass `sam validate --lint`; all 7 scripts pass `bash -n` + `shellcheck`; no committed secrets; every AWS call is IBD-DEV-scoped.** No FAIL or WARN findings remain open.

**Execution model (by design, not a gap):** every task was completed as **authoring + local validation** by the SDD loop. The **live apply** (`sam deploy`, `migrate-seed`, `deploy-frontend`, `set-cors`, `smoke`, `teardown`) creates real, billable AWS resources and is an **operator action** the user runs with IBD-DEV credentials per the runbook — never executed by an agent. The validation below therefore certifies the IaC/scripts are correct and ready; the operator apply-checks are recorded as **operator-pending**, which is the intended boundary.

| Dimension | Result |
|---|---|
| Task completion | PASS (10/10 `[x]`) |
| File existence | PASS (13/13) |
| Build integrity (validate/lint/syntax) | PASS |
| Requirement coverage | PASS (FR-1..FR-8, NFR-1..NFR-7) |
| Lint & code quality | PASS (shellcheck + cfn-lint clean) |
| Design conformance (DD-1..DD-6) | PASS |
| Constitutional baseline (profile, PII/secrets, stack) | PASS |

## 3. Task Completion

| Task | Status | Reviewer | Notes |
|---|---|---|---|
| T-1 Infra scaffold + IaC ratification | ✅ PASS | `rev-infra-t1` | SAM scaffold, samconfig, CLAUDE.md, serverless.yml retired |
| T-2 RDS + SG + Secrets Manager | ✅ PASS (2 att.) | `rev-infra-t2b` | FAIL→fix: dynamic-ref-in-Outputs → literal |
| T-3 Backend Lambda + HTTP API | ✅ PASS | `rev-infra-t3` | composed DATABASE_URL, rhel engine, makefile build |
| T-4 Cognito pool + client + groups | ✅ PASS | `rev-infra-t4` | no T-2 regression |
| T-5 Private S3 + CloudFront OAC | ✅ PASS | `rev-infra-t5` | rewrite function, no circular dep |
| T-6 migrate-seed runner | ✅ PASS | `rev-infra-t6` | secret in-process, TLS, fail-safe |
| T-7 deploy + validate scripts | ✅ PASS | `rev-infra-t7` | ordered, idempotent, build-before-deploy |
| T-8 frontend deploy + CORS lock | ✅ PASS | `rev-infra-t8` | + FR-5 trailingSlash fix |
| T-9 e2e smoke + PII boundary | ✅ PASS | `rev-infra-t9` | fail-closed PII check over the wire |
| T-10 teardown + runbook | ✅ PASS | `rev-infra-t10` | reverse order, root README sync |

All tasks have full execution-log entries (attempts, decisions, verification, Reviewer verdicts) in `execution.md`. **Result: PASS.**

## 4. File Existence

All 13 design-specified artifacts exist and are committed: 3 templates (`infra/{10-data-auth,20-backend,30-frontend}/template.yaml`), `infra/samconfig.toml`, `infra/README.md`, 7 scripts (`infra/scripts/{validate,deploy,migrate-seed,deploy-frontend,set-cors,smoke,teardown}.sh`), and `backend/Makefile`. Deletions/edits confirmed: `backend/serverless.yml` removed; `backend/prisma/schema.prisma` has `binaryTargets` incl. `rhel-openssl-3.0.x`; `CLAUDE.md` + root `README.md` IaC lines updated to SAM/CloudFormation; `frontend/next.config.mjs` has `trailingSlash: true`. **Result: PASS.**

## 5. Build Integrity

| Check | Command | Result |
|---|---|---|
| Template validity (×3) | `sam validate --lint` | **all 3 VALID** |
| Script syntax (×7) | `bash -n` | **all OK** |
| Script lint (×7) | `shellcheck` | **all CLEAN** |
| Backend build | `cd backend && npm run build` | `dist/lambda.js` ✓ (T-3) |
| Prisma engine | `npx prisma generate` | native + `rhel-openssl-3.0.x` ✓ (T-3) |
| Frontend export | `npm run build` | `out/{index,map/index}.html` ✓ (T-8) |
| Backend SAM build | `sam build` (20-backend) | Succeeded; bundles dist + rhel engine (T-3) |

No live `sam deploy` is run (operator step). **Result: PASS.**

## 6. Requirement Coverage

| Req | Title | Task(s) | Evidence | Result |
|---|---|---|---|---|
| FR-1 | IaC as CloudFormation/SAM | T-1, T-7 | 3 valid SAM templates; `deploy.sh` ordered; `validate.sh` | PASS |
| FR-2 | RDS provisioned + reachable | T-2, T-6 | RDS+SG+secret template; migrate-seed resolves wiring, TLS | PASS |
| FR-3 | Backend on Lambda + API GW | T-3, T-6 | SAM Function+HttpApi; composed DATABASE_URL; handler matches | PASS |
| FR-4 | Cognito identities | T-4 | UserPool + public client + admin/staff groups + outputs | PASS |
| FR-5 | Frontend on S3 + CloudFront | T-5, T-8 | private bucket + OAC + rewrite; trailingSlash makes `/map` resolve | PASS |
| FR-6 | End-to-end wiring (CORS + API URL) | T-8, T-9 | build-time API URL inject; `set-cors` locks origin; smoke checks | PASS |
| FR-7 | Stack outputs | T-1..T-5 | RdsEndpoint/DbSecretArn/ApiBaseUrl/CloudFrontUrl/UserPool* exported | PASS |
| FR-8 | Deploy/migrate/teardown runbook | T-7, T-9, T-10 | 9-section `infra/README.md` + teardown.sh | PASS |
| NFR-1 | IBD-DEV profile | all | samconfig + every script's aws/sam calls profile-scoped (swept) | PASS |
| NFR-2 | No committed secrets | T-2, T-3, T-6 | password only in Secrets Manager; dynamic-ref injection; no `.env`; swept | PASS |
| NFR-3 | Minimal footprint | T-1..T-5 | default VPC, no NAT/domain/RDS-Proxy; PriceClass_100 | PASS |
| NFR-4 | Transport security | T-2, T-5 | RDS TLS (`sslaccept=strict`); CloudFront/API HTTPS; redirect-to-https | PASS |
| NFR-5 | PII/consent preserved | T-6, T-9 | seeds consented sample only; smoke fail-closed PII check over the wire | PASS |
| NFR-6 | Cost-aware/disposable | T-2, T-10 | db.t3.micro/single-AZ; teardown empties bucket + deletes all stacks | PASS |
| NFR-7 | Reproducible/idempotent | T-1, T-7 | `--no-fail-on-empty-changeset`; idempotent teardown | PASS |

**Result: PASS.** Every requirement maps to completed tasks with authoring + local-validation evidence; the live behavioral scenarios (API 200, `/map` serves, S3 403, PII-free over the wire) are encoded as the `smoke.sh` operator apply-check.

## 7. Linting & Code Quality

- **Templates:** `sam validate --lint` (bundled cfn-lint) clean on all 3; OAC/no-circular-dependency, SourceArn-scoped bucket policy, canonical `Transform 2016-10-31`.
- **Scripts:** `shellcheck` clean on all 7; `set -euo pipefail`; fail-closed guards (migrate-seed secret handling, smoke PII check, teardown confirmation); paths script-relative.
- **Secret hygiene (NFR-2):** swept — no literal password, no composed-url-with-password, no committed `.env`; the DB password lives only in Secrets Manager, injected to the Lambda via dynamic reference and read in-process by migrate-seed.
- **Result: PASS.**

## 8. Design Conformance

| Decision | Conformance |
|---|---|
| DD-1 AWS SAM as single IaC | ✅ 3 SAM/CFN stacks; serverless.yml retired; CLAUDE.md ratified |
| DD-2 Lambda outside VPC; public RDS guarded | ✅ no VpcConfig; SG dev-IP + 0.0.0.0/0:3306; TLS + secret |
| DD-3 No RDS Proxy | ✅ lazy Prisma reuse; deferred to hardening |
| DD-4 Secrets via dynamic reference (composed URL) | ✅ secret = {username,password}; URL composed in T-3/T-6, never literal |
| DD-5 Private S3 + CloudFront OAC; no domain | ✅ block-public-access, OAC, rewrite fn, default CF domain |
| DD-6 Deploy order resolves URL cycle | ✅ deploy.sh order + set-cors lock |

Constitutional baseline upheld: IBD-DEV everywhere (PRD AC-7), PII/consent boundary preserved (NFR-5; seeds consented-only, smoke re-asserts), static-export frontend, Prisma+RDS MySQL, Cognito. Behavior aligns with `proposal.md` (Option A — AWS SAM, easy dev) intent, scope, and non-goals. **Two ratified deviations** documented in the spec: IaC tool (Serverless Framework → SAM/CloudFormation, OQ-1) and RDS networking posture (public dev RDS, OQ-2) — both intentional, recorded, and reflected in CLAUDE.md/design. **Result: PASS.**

## 9. Test Evidence Summary

Infrastructure verification is command/probe-based (the IaC analogue of tests), all passing:
- **Static gates (loop-run):** `sam validate --lint` ×3, `bash -n` + `shellcheck` ×7, secret/profile sweeps, frontend export + backend `sam build`, `prisma generate` engine check, isolated unit-tests of the smoke `assert_no_pii` (5 PII keys caught at depth, case-insensitive, `emailAddress` not false-triggered, empty body fails closed).
- **Operator apply-checks (operator-pending, encoded in `smoke.sh` + runbook):** live `sam deploy` reaches `*_COMPLETE`; `prisma migrate deploy`+seed over TLS; `curl` API 200 + PII-free; CloudFront `/` + `/map` 200; direct S3 object 403; final manual browser check that the live site renders seeded data (not the offline fallback). These require IBD-DEV credentials and are the user's to run.

## 10. Remediation

**None required.** No FAIL or WARN findings remain open. The two interim items raised during execution were resolved within their tasks: T-2's dynamic-reference-in-Outputs (fixed to a literal) and T-8's `/map` 404 (fixed via `trailingSlash: true`). The accepted T-1 follow-up (root README IaC sync) was completed in T-10.

## 11. Archive Readiness Recommendation

**READY TO ARCHIVE.** All 10 tasks `[x]`; no unresolved FAIL; no open WARN; every requirement covered with authoring + local-validation evidence; design decisions (incl. the two ratified deviations) recorded; constitutional baseline upheld. The remaining live `sam deploy`/migrate/smoke/teardown are **documented operator actions**, not blockers — they are the intended boundary of this authoring spec, with `smoke.sh` + the runbook as the verification harness the operator runs.

```text
/sdd-archive infra/aws-deployment
```
