# Archive Summary — AWS Deployment Infrastructure (CloudFormation/SAM bootstrap)

## 1. Document Control

| Field | Value |
|---|---|
| Spec name | AWS Deployment Infrastructure (CloudFormation/SAM bootstrap) |
| Spec path (original) | `docs/specs/infra/aws-deployment/` |
| Archive path | `docs/specs/archive/2026-06-24-infra--aws-deployment/` |
| Branch | `feature/infra-aws-deployment` (off `main`) |
| Depth | Full |
| Archived by | Claude (Leader / JCSPECS SDD) |
| AWS profile / region | `IBD-DEV` / `eu-west-1` |

## 2. Original Spec Path

`docs/specs/infra/aws-deployment/`

## 3. Archive Date

2026-06-24

## 4. Final Status

**COMPLETE (authoring) — Validated PASS, archive-ready.** All 10 tasks Reviewer-PASS and committed. The IaC + scripts + runbook are authored and locally validated; the **live deployment is an operator action** (run with IBD-DEV creds per the runbook), which is the intended boundary of this spec.

## 5. Requirements Delivered

| Req | Title | Result |
|---|---|---|
| FR-1 | IaC as CloudFormation/SAM | ✅ |
| FR-2 | RDS MySQL provisioned + reachable | ✅ |
| FR-3 | Backend on Lambda + API Gateway | ✅ |
| FR-4 | Cognito identities (pool/client/admin+staff) | ✅ |
| FR-5 | Frontend on private S3 + CloudFront (OAC) | ✅ |
| FR-6 | End-to-end wiring (API URL + CORS lock) | ✅ |
| FR-7 | Stack outputs (wiring values) | ✅ |
| FR-8 | Deploy/migrate/teardown runbook | ✅ |
| NFR-1 | IBD-DEV profile everywhere | ✅ |
| NFR-2 | No committed secrets | ✅ |
| NFR-3 | Minimal footprint (default VPC, no domain/NAT) | ✅ |
| NFR-4 | Transport security (TLS/HTTPS) | ✅ |
| NFR-5 | PII/consent boundary preserved | ✅ |
| NFR-6 | Cost-aware / disposable | ✅ |
| NFR-7 | Reproducible / idempotent | ✅ |

## 6. Files Changed Summary

**SAM/CloudFormation templates (`infra/`):**
- `10-data-auth/template.yaml` — RDS MySQL (`db.t3.micro`, public, default VPC) + EC2 SG (3306: dev-IP + 0.0.0.0/0) + Secrets Manager secret + SecretTargetAttachment; Cognito UserPool + public SPA client + `admin`/`staff` groups; exported outputs.
- `20-backend/template.yaml` — `AWS::Serverless::Function` (`dist/lambda.handler`, no VpcConfig, makefile build) + HttpApi (CORS param) + scoped exec role; `DATABASE_URL` composed via `!Sub` + dynamic-ref password + cross-stack imports; `ApiBaseUrl` output.
- `30-frontend/template.yaml` — private S3 (block-public-access, OAC) + CloudFront distribution (redirect-to-https, PriceClass_100) + viewer-request rewrite Function + SourceArn-scoped bucket policy; `CloudFrontUrl`/`FrontendBucketName` outputs.
- `samconfig.toml` — IBD-DEV/eu-west-1/CAPABILITY_NAMED_IAM.

**Operator scripts (`infra/scripts/`):** `validate.sh`, `deploy.sh`, `migrate-seed.sh`, `deploy-frontend.sh`, `set-cors.sh`, `smoke.sh`, `teardown.sh` — all `set -euo pipefail`, IBD-DEV-scoped, shellcheck-clean.

**Other:** `backend/Makefile` (SAM build), `backend/prisma/schema.prisma` (`binaryTargets` += `rhel-openssl-3.0.x`), `frontend/next.config.mjs` (`trailingSlash: true` — FR-5 fix), `CLAUDE.md` + root `README.md` (IaC ratified to SAM/CloudFormation), `backend/serverless.yml` (removed), `infra/README.md` (9-section runbook).

Commits: `7f30c17` (T-1) → `fd2f2be` (T-2) → `ccfb967` (T-3) → `7b4cc1b` (T-4) → `0bf82b2` (T-5) → `bc07cee` (T-6) → `d93581f` (T-7) → `8507323` (T-8) → `2ce13a4` (T-9) → `cdeac6b` (T-10) → `086bb0c` (validation report).

## 7. Test Evidence Summary

**Static gates (all pass):** `sam validate --lint` ×3 templates; `bash -n` + `shellcheck` ×7 scripts; secret/profile sweeps (no literal password, no committed `.env`, every script IBD-DEV-scoped); backend `npm run build` + `sam build` (bundles dist + rhel engine); `npx prisma generate` (native + rhel engines); frontend export (`out/{index,map/index}.html`); isolated unit-tests of `smoke.sh assert_no_pii` (5 PII keys caught at depth, case-insensitive, `emailAddress` not false-triggered, empty body fails closed). **Operator apply-checks** (live deploy/migrate/smoke 200+PII-free/S3-403/teardown) are encoded in `smoke.sh` + the runbook and run by the operator.

## 8. Validation Summary

`validation-report.md`: **PASS — archive-ready.** All FR/NFR PASS, DD-1..DD-6 conformant, constitutional baseline upheld, no remediation required. The live apply is the documented operator boundary, not a blocker.

## 9. Accepted Warnings Or Follow-Ups

- **No open WARN/FAIL.** Two interim issues resolved in-flight: T-2 dynamic-reference-in-Outputs (→ literal username), T-8 `/map` 404 (→ `trailingSlash: true`). T-1's accepted root-README drift resolved in T-10.
- **Two ratified design deviations** (documented, intentional): IaC = AWS SAM/CloudFormation (supersedes the prior Serverless Framework mention; CLAUDE.md updated) (OQ-1); RDS public in the default VPC for the easy dev setup (OQ-2).
- **Deferred (by design):** live `sam deploy`/migrate/smoke/teardown are operator actions; **`infra/network-hardening`** follow-up (Lambda-in-VPC, private RDS, VPC endpoints/NAT, RDS Proxy, RDS IAM auth); Cognito Hosted UI + frontend auth wiring (separate auth spec); real-data import (legal-gated; seeded sample only).

## 10. Historical Notes

- First real AWS footprint for the project. Chose **AWS SAM** to satisfy the explicit "use CloudFormation" ask while keeping Lambda+API Gateway simple; SAM compiles to CloudFormation.
- Key architectural call (DD-2): **Lambda outside the VPC** with a public RDS (guarded by SG + TLS + Secrets-Manager password). Rationale captured at proposal time — an in-VPC Lambda would force NAT/VPC endpoints once Cognito JWKS/auth lands, contradicting the "easy, no extra infra" goal; the private-network posture is deferred to `infra/network-hardening`.
- Secret discipline: the DB password lives only in Secrets Manager; injected to the Lambda via a CloudFormation dynamic reference and read in-process by `migrate-seed.sh` (URL-encoded, never written/echoed). No `.env` ever committed (a PreToolUse hook also blocks `.env` writes).
- Execution model: **authoring + local validation by the SDD loop; live apply by the operator.** No agent touched the live AWS account. Reviewers occasionally went idle without emitting a verdict (T-5) and were re-prompted for the explicit `STATUS:` line.
