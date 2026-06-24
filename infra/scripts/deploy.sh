#!/usr/bin/env bash
#
# deploy.sh — ACCELERATE Tanzania Seed Registry (infra/aws-deployment, T-7)
# ---------------------------------------------------------------------------
# PURPOSE
#   Orchestrate the ordered, idempotent deploy of the three dev stacks under
#   the IBD-DEV profile / eu-west-1 (FR-1, FR-8, NFR-1, NFR-7), per the deploy
#   order in design.md §1 / DD-6:
#
#     1. deploy 10-data-auth      (params: VpcId, DevCidr)   → RDS/secret/Cognito
#     2. [OPERATOR] run migrate-seed.sh                       → migrate + seed RDS
#     3. sam build + deploy 20-backend  (AllowedOrigin, DataAuthStackName) → API
#     4. deploy 30-frontend                                   → CloudFront URL
#
#   Step 2 (DB migrate/seed) is a SEPARATE operator action — this script PAUSES
#   (on a TTY) or instructs-and-continues (SKIP_MIGRATE_PAUSE=yes) before the
#   backend so the operator runs ./infra/scripts/migrate-seed.sh against RDS.
#
#   Steps 4b (frontend build/sync) and 5 (CORS lock) are T-8 — NOT this script.
#
#   After each stack, the script prints that stack's CloudFormation outputs to
#   stdout (ApiBaseUrl, CloudFrontUrl, UserPoolId, RdsEndpoint, ...). These are
#   non-secret wiring values; the DB password is NEVER read or printed (NFR-2).
#
# PREREQUISITES
#   - AWS SAM CLI + AWS CLI v2 installed; valid IBD-DEV credentials.
#   - A default VPC in eu-west-1 (auto-detected below, or pass VPC_ID).
#   - For step 3: the backend builds (`cd backend && npm run build`) and
#     `sam build` can package dist/ + the Prisma engine (Metadata: makefile).
#
# ⚠️ THIS SCRIPT CREATES REAL, BILLABLE AWS RESOURCES. It is an OPERATOR-RUN
#    step (the user holds IBD-DEV creds) — NOT run by the SDD agent loop.
#    Validate templates first with ./infra/scripts/validate.sh (safe, no apply).
#
# USAGE
#   ./infra/scripts/deploy.sh
#   VPC_ID=vpc-abc DEV_CIDR=203.0.113.7/32 ./infra/scripts/deploy.sh
#   SKIP_MIGRATE_PAUSE=yes ./infra/scripts/deploy.sh   # don't pause at step 2
#   ALLOWED_ORIGIN='*' ./infra/scripts/deploy.sh       # backend CORS (dev default *)
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Config (overridable via env; IBD-DEV / eu-west-1 defaults — NFR-1) ───────
PROFILE="${AWS_PROFILE:-IBD-DEV}"
REGION="${AWS_REGION:-eu-west-1}"

# Stack names — single source of truth is infra/README.md conventions.
DATA_AUTH_STACK="${DATA_AUTH_STACK:-accelerate-tz-dev-data-auth}"
BACKEND_STACK="${BACKEND_STACK:-accelerate-tz-dev-backend}"
FRONTEND_STACK="${FRONTEND_STACK:-accelerate-tz-dev-frontend}"

# Backend CORS origin — permissive '*' for the dev bootstrap; locked to the
# CloudFront URL later by set-cors.sh (T-8, FR-6, DD-6).
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"

# Resolve infra/ paths relative to this script so it runs from any CWD.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SAMCONFIG="$INFRA_DIR/samconfig.toml"

# ── Common sam deploy flags: idempotent change sets (NFR-7), named-IAM caps,
#    shared config (profile/region/resolve_s3). --no-confirm-changeset keeps the
#    orchestration non-interactive (the operator already opted into the full run
#    by invoking this script); --no-fail-on-empty-changeset makes re-deploys a
#    clean no-op rather than an error.
SAM_DEPLOY_FLAGS=(
  --config-file "$SAMCONFIG"
  --profile "$PROFILE" --region "$REGION"
  --capabilities CAPABILITY_NAMED_IAM
  --no-confirm-changeset
  --no-fail-on-empty-changeset
)

# ── Helper: print a stack's CloudFormation outputs (non-secret wiring) ────────
print_outputs() {
  local stack="$1"
  echo "── outputs: $stack ─────────────────────────────────────────"
  aws cloudformation describe-stacks \
    --profile "$PROFILE" --region "$REGION" \
    --stack-name "$stack" \
    --query "Stacks[0].Outputs" --output table || {
      echo "WARNING: could not read outputs for '$stack'." >&2
    }
  echo
}

echo "==> ACCELERATE Tanzania dev deploy — profile '$PROFILE', region '$REGION'."
echo

# ── Resolve VpcId + DevCidr (auto-detect with override) ──────────────────────
# VpcId: the account's default VPC unless overridden. DevCidr: the operator's
# current public IP as a /32 unless overridden. Both are non-secret and printed.
echo "==> Resolving VpcId and DevCidr (auto-detect; override via VPC_ID / DEV_CIDR) ..."

VPC_ID="${VPC_ID:-$(aws ec2 describe-vpcs \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text \
  --profile "$PROFILE" --region "$REGION")}"

if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "ERROR: could not determine a default VPC in '$REGION'. Set VPC_ID explicitly." >&2
  exit 1
fi

DEV_CIDR="${DEV_CIDR:-$(curl -s https://checkip.amazonaws.com)/32}"
# Strip any stray whitespace/newline curl may leave before the /32.
DEV_CIDR="${DEV_CIDR//[$'\t\r\n ']/}"

if [[ -z "$DEV_CIDR" || "$DEV_CIDR" == "/32" ]]; then
  echo "ERROR: could not determine the operator public IP for DevCidr. Set DEV_CIDR explicitly (e.g. 203.0.113.7/32)." >&2
  exit 1
fi

echo "    VpcId   = $VPC_ID"
echo "    DevCidr = $DEV_CIDR"
echo

# ── Step 1: 10-data-auth (RDS + Secrets Manager + Cognito) ───────────────────
echo "==> [1/4] Deploying $DATA_AUTH_STACK (RDS + Secrets Manager + Cognito) ..."
sam deploy \
  --template "$INFRA_DIR/10-data-auth/template.yaml" \
  --stack-name "$DATA_AUTH_STACK" \
  --parameter-overrides VpcId="$VPC_ID" DevCidr="$DEV_CIDR" \
  "${SAM_DEPLOY_FLAGS[@]}"
echo "==> [1/4] $DATA_AUTH_STACK deployed."
print_outputs "$DATA_AUTH_STACK"

# ── Step 2: OPERATOR migrate + seed (separate action) ────────────────────────
echo "==> [2/4] DB migrate + seed is a SEPARATE OPERATOR STEP."
echo "    Run the consented migrate/seed against RDS now, in another shell:"
echo
echo "        ./infra/scripts/migrate-seed.sh"
echo
echo "    (It reads the secret from Secrets Manager, composes DATABASE_URL"
echo "     in-process over TLS, and runs prisma migrate deploy + seed.)"
echo
if [[ "${SKIP_MIGRATE_PAUSE:-}" == "yes" ]]; then
  echo "    SKIP_MIGRATE_PAUSE=yes — NOT pausing. Ensure migrate/seed runs before"
  echo "    the backend serves traffic; continuing to the backend deploy."
elif [[ -t 0 ]]; then
  read -r -p "    Press Enter once migrate-seed.sh has completed to continue ... " _
else
  echo "    Non-interactive shell — continuing without pausing. Run migrate-seed.sh"
  echo "    before the backend serves traffic (or set SKIP_MIGRATE_PAUSE=yes to silence)."
fi
echo

# ── Step 3: 20-backend (NestJS Lambda + HTTP API) ────────────────────────────
# The backend template uses Metadata: BuildMethod: makefile, so `sam build`
# MUST run before `sam deploy` to package dist/ + the Prisma engine.
echo "==> [3/4] Building $BACKEND_STACK (sam build — required before deploy) ..."
sam build \
  --template "$INFRA_DIR/20-backend/template.yaml" \
  --profile "$PROFILE" --region "$REGION"

echo "==> [3/4] Deploying $BACKEND_STACK (Lambda + HTTP API) ..."
sam deploy \
  --template "$INFRA_DIR/20-backend/template.yaml" \
  --stack-name "$BACKEND_STACK" \
  --parameter-overrides \
    AllowedOrigin="$ALLOWED_ORIGIN" \
    DataAuthStackName="$DATA_AUTH_STACK" \
  "${SAM_DEPLOY_FLAGS[@]}"
echo "==> [3/4] $BACKEND_STACK deployed."
print_outputs "$BACKEND_STACK"

# ── Step 4: 30-frontend (private S3 + CloudFront OAC) ─────────────────────────
echo "==> [4/4] Deploying $FRONTEND_STACK (S3 + CloudFront) ..."
sam deploy \
  --template "$INFRA_DIR/30-frontend/template.yaml" \
  --stack-name "$FRONTEND_STACK" \
  "${SAM_DEPLOY_FLAGS[@]}"
echo "==> [4/4] $FRONTEND_STACK deployed."
print_outputs "$FRONTEND_STACK"

# ── Done ─────────────────────────────────────────────────────────────────────
echo "==> Deploy complete. Key wiring values are in the per-stack outputs above:"
echo "    ApiBaseUrl (backend)  → frontend build env NEXT_PUBLIC_API_BASE_URL"
echo "    CloudFrontUrl (front) → backend CORS lock (set-cors.sh, T-8)"
echo
echo "==> Next operator steps (T-8): build + sync the frontend, then lock CORS:"
echo "        ./infra/scripts/deploy-frontend.sh   # build with ApiBaseUrl, s3 sync, invalidate"
echo "        ./infra/scripts/set-cors.sh          # redeploy backend with AllowedOrigin=CloudFrontUrl"
