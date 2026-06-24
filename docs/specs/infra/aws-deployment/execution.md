# Execution Log — infra/aws-deployment

Canonical audit trail for the JCSPECS Leader → Implementer → Reviewer loop on this spec.

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `infra/aws-deployment` |
| Branch | `feature/infra-aws-deployment` |
| Leader | Claude (orchestrator) |
| Implementer agent | `general-purpose` seeded with `.agents/implementer.md` |
| Reviewer agent | `code-reviewer` seeded with `.agents/reviewer.md` |
| Started | 2026-06-24 |
| Execution model | Tasks are **authored + locally validated** by the loop (`sam validate`/`cfn-lint`/`shellcheck`/grep). **Live apply** (`sam deploy`, migrate, teardown) is an **operator step** the user runs with `IBD-DEV` creds — never executed by an agent. |

## 2. Task Execution History

### T-1 — Infra scaffold + IaC ratification — **PASS** (2026-06-24)
- **Implementer attempts:** 1 (`impl-infra-t1`, general-purpose). Authoring-only — no live AWS.
- **Files:** NEW `infra/{10-data-auth,20-backend,30-frontend}/template.yaml` (valid SAM stubs; `20-backend` carries `Transform: AWS::Serverless-2016-10-09`; placeholder `WaitConditionHandle` to be replaced by T-2..T-5), `infra/samconfig.toml` (IBD-DEV/eu-west-1 ×3 sections), `infra/README.md` (stub + Conventions: stack names, `DevCidr`/`AllowedOrigin`, deploy order), `infra/scripts/.gitkeep`; MODIFIED `CLAUDE.md` (IaC line Serverless Framework → AWS SAM/CloudFormation); DELETED `backend/serverless.yml` (git rm, superseded — DD-1).
- **Requirements covered:** FR-1, FR-7 (scaffold/outputs home), NFR-1, NFR-3, NFR-7.
- **Decisions:** (a) `serverless.yml` removed (not renamed) for cleanliness; `serverless-http` runtime dep correctly retained (Lambda adapter, unrelated to the deploy tool). (b) Minimal valid SAM stubs (single free `WaitConditionHandle`, zero intrinsics) so `sam validate` passes pre-resources. (c) CLAUDE.md edit is a single surgical line; generic "IaC/Serverless definition MUST use --profile IBD-DEV" line left intact (category reference, not tool-specific).
- **Leader verification:** scaffold present (6 files); `IBD-DEV`+`eu-west-1` in samconfig ×3; CLAUDE.md updated, no stale "serverless framework"; `serverless.yml` deleted (staged D); `sam validate` → all 3 stubs valid (real SAM CLI).
- **Reviewer verdict (`rev-infra-t1`):** **STATUS: PASS** — ratification accurate/minimal, no secret/scope leak, no orphaned deploy-tool refs in backend scripts.
- **Accepted drift → T-10 follow-up:** root `README.md` (lines ~38, ~90) still references `backend/serverless.yml` / `npx serverless deploy`. Out of T-1 scope (CLAUDE.md only). **Sync the root README to the SAM deploy flow in T-10** (runbook task).

### T-2 — RDS MySQL + security group + Secrets Manager — **PASS** (2026-06-24, attempt 2)
- **Implementer attempts:** 2 (`impl-infra-t2`, general-purpose). Authoring-only — no live AWS.
- **Files:** MODIFIED `infra/10-data-auth/template.yaml` (RDS+SG+Secret replace the T-1 placeholder; params `VpcId`/`DevCidr`/`DbName`/`DbInstanceClass`/`DbAllocatedStorage`; `AWS::SecretsManager::Secret` GenerateSecretString; `AWS::EC2::SecurityGroup` 3306×2; `AWS::RDS::DBInstance`; `AWS::SecretsManager::SecretTargetAttachment`; 6 exported outputs); Leader also refined `design.md` DD-4/§4 (compose DATABASE_URL in T-3, secret holds username/password only).
- **Requirements covered:** FR-2, FR-7, NFR-2, NFR-4, NFR-6.
- **Attempt 1 → Reviewer FAIL (`rev-infra-t2`):** `DbMasterUsername` output used a `{{resolve:secretsmanager:...}}` dynamic reference in `Outputs` — CloudFormation forbids dynamic refs in Outputs; would throw at `sam deploy`. (Leader had pre-flagged this exact risk.)
- **Attempt 2 fix:** output `Value` → literal `accelerate_admin` (matches `SecretStringTemplate`, non-sensitive). Only remaining dynamic refs are the two in RDS `Properties` (MasterUsername/MasterUserPassword).
- **Decisions:** `VpcId` param (`AWS::EC2::VPC::Id`) places the SG in the default VPC; RDS no DBSubnetGroup → default VPC; `ExcludeCharacters '"@/\ '` keeps the password URL/MySQL-safe; `SecretTargetAttachment` links secret↔DB; outputs `Export`ed for T-3 `Fn::ImportValue`.
- **Leader verification:** `sam validate --lint` valid; no literal password; 6 outputs; no Cognito leak; post-fix grep confirms no dynamic ref in Outputs.
- **Reviewer verdict (`rev-infra-t2b`, attempt 2):** **STATUS: PASS** — fix confirmed, no regression across NFR-2/DD-4/DD-2/FR-2/NFR-4/NFR-6/FR-7.

## 3. Summary (updated as tasks complete)
- T-1 **[x] PASS**, T-2 **[x] PASS**. T-3..T-10 pending. Next eligible: **T-3** (backend Lambda + HTTP API; deps: T-2 ✓). Also eligible: T-4, T-5 — sequenced T-3→T-4→T-5 per user queue.
- **Open follow-ups:** root `README.md` IaC sync → **T-10**.
