#!/usr/bin/env bash
#
# deploy-frontend.sh — ACCELERATE Tanzania Seed Registry (infra/aws-deployment, T-8)
# ---------------------------------------------------------------------------
# PURPOSE
#   Build the Next.js static export with the live API URL baked in, publish it
#   to the private frontend S3 bucket, and invalidate CloudFront — design.md §5,
#   §1 (step 4b), DD-6 (FR-5). Steps:
#     1. Resolve ApiBaseUrl from the 20-backend stack outputs (override via
#        API_BASE_URL) — nothing hardcoded (FR-7).
#     2. Resolve FrontendBucketName + CloudFrontUrl from the 30-frontend stack
#        outputs, then DERIVE the CloudFront distribution Id from the domain
#        (override via DISTRIBUTION_ID) — the template doesn't output the Id.
#     3. Build: `NEXT_PUBLIC_API_BASE_URL=<ApiBaseUrl> npm run build` in frontend/
#        (static export → out/). The API URL is injected at BUILD time (NEXT_PUBLIC_*).
#     4. Sync: `aws s3 sync out/ s3://<bucket> --delete` (prune removed files;
#        the bucket is private — OAC serves it).
#     5. Invalidate: `aws cloudfront create-invalidation --paths "/*"` so viewers
#        immediately get the new build (mitigates stale-cache, design.md §9).
#
#   API URL, bucket, distribution Id, and CloudFront URL are non-secret wiring
#   values — they are echoed as progress. No secrets are touched (NFR-2).
#
# PREREQUISITES
#   - The 20-backend and 30-frontend stacks are deployed (CREATE/UPDATE_COMPLETE),
#     and migrate-seed has run, so the API serves real data.
#   - AWS CLI v2, jq, Node 20, and the frontend deps installed (`npm ci` in frontend/).
#   - Valid IBD-DEV credentials with cloudformation:DescribeStacks,
#     cloudfront:ListDistributions/CreateInvalidation, and s3 write on the bucket.
#
# THIS IS AN OPERATOR-RUN SCRIPT. It uploads to the live frontend bucket and
# invalidates the live distribution. It is NOT run by the SDD agent loop.
# See infra/README.md (runbook).
#
# USAGE
#   ./infra/scripts/deploy-frontend.sh
#   API_BASE_URL=https://abc.execute-api.eu-west-1.amazonaws.com ./infra/scripts/deploy-frontend.sh
#   DISTRIBUTION_ID=E123ABC ./infra/scripts/deploy-frontend.sh
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Config (overridable via env; IBD-DEV / eu-west-1 defaults — NFR-1) ───────
PROFILE="${AWS_PROFILE:-IBD-DEV}"
REGION="${AWS_REGION:-eu-west-1}"
BACKEND_STACK="${BACKEND_STACK:-accelerate-tz-dev-backend}"
FRONTEND_STACK="${FRONTEND_STACK:-accelerate-tz-dev-frontend}"

# Resolve infra/ + frontend/ paths relative to this script so it runs from any CWD.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../../frontend" && pwd)"

# ── Helper: pull one OutputValue by OutputKey from a stack's Outputs JSON ─────
# Reads from the JSON passed in $2; errors clearly if the key is absent/empty.
get_output() {
  local key="$1" json="$2" val
  val="$(jq -r --arg k "$key" '.[] | select(.OutputKey == $k) | .OutputValue' <<<"$json")"
  if [[ -z "$val" || "$val" == "null" ]]; then
    echo "ERROR: stack output '$key' not found (is the stack deployed under '$PROFILE'/'$REGION'?)." >&2
    exit 1
  fi
  printf '%s' "$val"
}

echo "==> ACCELERATE Tanzania frontend build/deploy — profile '$PROFILE', region '$REGION'."
echo

# ── Resolve ApiBaseUrl from the backend stack (override via API_BASE_URL) ─────
if [[ -n "${API_BASE_URL:-}" ]]; then
  echo "==> Using API_BASE_URL from env: $API_BASE_URL"
else
  echo "==> Resolving ApiBaseUrl from stack '$BACKEND_STACK' ..."
  BACKEND_OUTPUTS="$(
    aws cloudformation describe-stacks \
      --profile "$PROFILE" --region "$REGION" \
      --stack-name "$BACKEND_STACK" \
      --query "Stacks[0].Outputs" --output json
  )" || {
    echo "ERROR: could not describe stack '$BACKEND_STACK'." >&2
    exit 1
  }
  API_BASE_URL="$(get_output ApiBaseUrl "$BACKEND_OUTPUTS")"
fi

# ── Resolve FrontendBucketName + CloudFrontUrl from the frontend stack ────────
echo "==> Resolving FrontendBucketName + CloudFrontUrl from stack '$FRONTEND_STACK' ..."
FRONTEND_OUTPUTS="$(
  aws cloudformation describe-stacks \
    --profile "$PROFILE" --region "$REGION" \
    --stack-name "$FRONTEND_STACK" \
    --query "Stacks[0].Outputs" --output json
)" || {
  echo "ERROR: could not describe stack '$FRONTEND_STACK'." >&2
  exit 1
}
BUCKET="$(get_output FrontendBucketName "$FRONTEND_OUTPUTS")"
CLOUDFRONT_URL="$(get_output CloudFrontUrl "$FRONTEND_OUTPUTS")"

# ── Derive the CloudFront distribution Id from the domain (override available) ─
# The 30-frontend template outputs the URL but not the distribution Id, so map
# the domain (CloudFrontUrl without the https:// scheme) to its Id at runtime.
if [[ -n "${DISTRIBUTION_ID:-}" ]]; then
  DIST_ID="$DISTRIBUTION_ID"
  echo "==> Using DISTRIBUTION_ID from env: $DIST_ID"
else
  CF_DOMAIN="${CLOUDFRONT_URL#https://}"   # strip scheme → <dist>.cloudfront.net
  CF_DOMAIN="${CF_DOMAIN%/}"               # strip any trailing slash
  echo "==> Resolving distribution Id for domain '$CF_DOMAIN' ..."
  DIST_ID="$(
    aws cloudfront list-distributions \
      --profile "$PROFILE" --region "$REGION" \
      --query "DistributionList.Items[?DomainName=='$CF_DOMAIN'].Id" \
      --output text
  )"
  if [[ -z "$DIST_ID" || "$DIST_ID" == "None" ]]; then
    echo "ERROR: no CloudFront distribution found for domain '$CF_DOMAIN'." >&2
    echo "       Set DISTRIBUTION_ID explicitly to override." >&2
    exit 1
  fi
fi

# Progress (all non-secret wiring values).
echo
echo "    ApiBaseUrl     = $API_BASE_URL"
echo "    Bucket         = $BUCKET"
echo "    DistributionId = $DIST_ID"
echo "    CloudFrontUrl  = $CLOUDFRONT_URL"
echo

# ── Step 1: Build the static export with the API URL baked in (build-time env) ─
echo "==> Building the static export (NEXT_PUBLIC_API_BASE_URL injected at build time) ..."
(
  cd "$FRONTEND_DIR"
  NEXT_PUBLIC_API_BASE_URL="$API_BASE_URL" npm run build
)

OUT_DIR="$FRONTEND_DIR/out"
if [[ ! -f "$OUT_DIR/index.html" ]]; then
  echo "ERROR: build did not produce '$OUT_DIR/index.html' — expected a static export." >&2
  exit 1
fi

# ── Step 2: Sync to S3 (--delete prunes files removed since the last deploy) ──
echo "==> Syncing $OUT_DIR/ → s3://$BUCKET/ (--delete prunes removed files) ..."
aws s3 sync "$OUT_DIR/" "s3://$BUCKET/" \
  --delete \
  --profile "$PROFILE" --region "$REGION"

# ── Step 3: Invalidate CloudFront so viewers get the new build immediately ────
echo "==> Invalidating CloudFront distribution '$DIST_ID' (paths /*) ..."
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --profile "$PROFILE" --region "$REGION"

echo
echo "==> Frontend deployed. open $CLOUDFRONT_URL"
