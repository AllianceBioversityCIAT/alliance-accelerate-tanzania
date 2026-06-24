#!/usr/bin/env bash
#
# set-cors.sh — ACCELERATE Tanzania Seed Registry (infra/aws-deployment, T-8)
# ---------------------------------------------------------------------------
# PURPOSE
#   Lock the backend HTTP API CORS to the CloudFront origin — design.md §1
#   (step 5), DD-6 (FR-6). The backend bootstraps with a permissive `*` CORS
#   default; once the frontend is deployed this redeploys 20-backend with
#   AllowedOrigin = the CloudFront URL so only the real app origin is allowed.
#   Steps:
#     1. Resolve CloudFrontUrl from the 30-frontend stack outputs (override via
#        CLOUDFRONT_URL) — nothing hardcoded (FR-7). It is already an
#        `https://<dist>.cloudfront.net` with no trailing slash, i.e. the exact
#        CORS Origin form an API expects.
#     2. `sam build` the backend (Metadata: BuildMethod: makefile means a deploy
#        must build first to package dist/ + the Prisma engine).
#     3. `sam deploy` 20-backend with AllowedOrigin=<CloudFrontUrl> (idempotent
#        change set; DataAuthStackName preserved).
#
#   The CloudFront URL is non-secret and is echoed as progress (NFR-2).
#
# PREREQUISITES
#   - The 10-data-auth, 20-backend, and 30-frontend stacks are deployed.
#   - The backend builds (`cd backend && npm run build`) and `sam build` can
#     package dist/ + the Prisma engine.
#   - AWS CLI v2 + SAM CLI; valid IBD-DEV credentials.
#
# THIS IS AN OPERATOR-RUN SCRIPT. It redeploys the live backend stack. It is NOT
# run by the SDD agent loop. See infra/README.md (runbook).
#
# USAGE
#   ./infra/scripts/set-cors.sh
#   CLOUDFRONT_URL=https://d111.cloudfront.net ./infra/scripts/set-cors.sh
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Config (overridable via env; IBD-DEV / eu-west-1 defaults — NFR-1) ───────
PROFILE="${AWS_PROFILE:-IBD-DEV}"
REGION="${AWS_REGION:-eu-west-1}"
BACKEND_STACK="${BACKEND_STACK:-accelerate-tz-dev-backend}"
FRONTEND_STACK="${FRONTEND_STACK:-accelerate-tz-dev-frontend}"
DATA_AUTH_STACK="${DATA_AUTH_STACK:-accelerate-tz-dev-data-auth}"

# Resolve infra/ paths relative to this script so it runs from any CWD.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SAMCONFIG="$INFRA_DIR/samconfig.toml"
BACKEND_TEMPLATE="$INFRA_DIR/20-backend/template.yaml"

echo "==> ACCELERATE Tanzania CORS lock — profile '$PROFILE', region '$REGION'."
echo

# ── Resolve CloudFrontUrl from the frontend stack (override via CLOUDFRONT_URL) ─
if [[ -n "${CLOUDFRONT_URL:-}" ]]; then
  echo "==> Using CLOUDFRONT_URL from env: $CLOUDFRONT_URL"
else
  echo "==> Resolving CloudFrontUrl from stack '$FRONTEND_STACK' ..."
  FRONTEND_OUTPUTS="$(
    aws cloudformation describe-stacks \
      --profile "$PROFILE" --region "$REGION" \
      --stack-name "$FRONTEND_STACK" \
      --query "Stacks[0].Outputs" --output json
  )" || {
    echo "ERROR: could not describe stack '$FRONTEND_STACK'." >&2
    exit 1
  }
  CLOUDFRONT_URL="$(
    jq -r '.[] | select(.OutputKey == "CloudFrontUrl") | .OutputValue' <<<"$FRONTEND_OUTPUTS"
  )"
  if [[ -z "$CLOUDFRONT_URL" || "$CLOUDFRONT_URL" == "null" ]]; then
    echo "ERROR: stack output 'CloudFrontUrl' not found on '$FRONTEND_STACK'." >&2
    exit 1
  fi
fi

echo "==> Locking backend CORS AllowedOrigin to: $CLOUDFRONT_URL"
echo

# ── Step 1: sam build (required by Metadata: BuildMethod: makefile) ───────────
echo "==> Building $BACKEND_STACK (sam build — required before deploy) ..."
sam build \
  --template "$BACKEND_TEMPLATE" \
  --profile "$PROFILE" --region "$REGION"

# ── Step 2: redeploy the backend with the locked CORS origin ─────────────────
echo "==> Redeploying $BACKEND_STACK with AllowedOrigin=$CLOUDFRONT_URL ..."
sam deploy \
  --template "$BACKEND_TEMPLATE" \
  --stack-name "$BACKEND_STACK" \
  --parameter-overrides \
    AllowedOrigin="$CLOUDFRONT_URL" \
    DataAuthStackName="$DATA_AUTH_STACK" \
  --config-file "$SAMCONFIG" \
  --profile "$PROFILE" --region "$REGION" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

echo
echo "==> CORS locked. Backend now allows only origin: $CLOUDFRONT_URL"
