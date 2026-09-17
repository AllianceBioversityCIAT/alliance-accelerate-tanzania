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
#   MAIL_TRANSPORT=microservice ./infra/scripts/set-cors.sh  # preserve the T-9 switch
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Config (overridable via env; IBD-DEV / eu-west-1 defaults — NFR-1) ───────
PROFILE="${AWS_PROFILE:-IBD-DEV}"
REGION="${AWS_REGION:-eu-west-1}"
BACKEND_STACK="${BACKEND_STACK:-accelerate-tz-dev-backend}"
FRONTEND_STACK="${FRONTEND_STACK:-accelerate-tz-dev-frontend}"
DATA_AUTH_STACK="${DATA_AUTH_STACK:-accelerate-tz-dev-data-auth}"

# Mail transport — "ses" (Phase A default / rollback control) or
# "microservice" (T-9 verification). MUST be passed explicitly on every
# backend deploy: SAM sends UsePreviousValue for any parameter absent from
# --parameter-overrides, so omitting the parameter override entirely would
# let this CORS-lock redeploy silently revert the transport, possibly
# mid-verification (design.md §7.3). set-cors.sh is the routine follow-up to
# every frontend deploy, so this is not a rare path.
#
# ⚠️ A hardcoded `${MAIL_TRANSPORT:-ses}` default would re-create that exact
# hazard in the OPPOSITE direction: once T-9 has flipped the live stack to
# "microservice", running this script without the env var set would then
# actively push the parameter BACK to "ses" and report success, with no
# signal (T-8 review, Issue 1). So: an explicit MAIL_TRANSPORT env var
# always wins (operator override); otherwise resolve the CURRENT value from
# the deployed stack — the same pattern already used a few lines below to
# resolve CloudFrontUrl, for the same reason: read the live value instead of
# asserting one. Only a stack that does not exist yet falls back to the
# template's own Default ("ses").
if [[ -n "${MAIL_TRANSPORT:-}" ]]; then
  echo "==> MailTransport = $MAIL_TRANSPORT (operator override via MAIL_TRANSPORT env var)"
else
  # Separate "the describe-stacks CALL failed" from "the stack does not
  # exist yet" — they are not the same thing. An expired SSO token, a
  # throttle, or an IAM denial also makes the query come back empty, and
  # empty was previously indistinguishable from "not found" (`2>/dev/null
  # || true` swallowed both). set-cors.sh runs with CLOUDFRONT_URL commonly
  # preset (it is the routine follow-up to every frontend deploy) — falling
  # back to "ses" here because of a TRANSIENT failure would silently revert
  # a live T-9-flipped transport with no signal. So: capture stdout+stderr
  # together, check the exit status via `if`, and only accept "ses" as the
  # fallback when the failure text is CloudFormation's `ValidationError` for
  # a nonexistent stack — anything else aborts.
  if RESOLVED_MAIL_TRANSPORT="$(
    aws cloudformation describe-stacks \
      --profile "$PROFILE" --region "$REGION" \
      --stack-name "$BACKEND_STACK" \
      --query "Stacks[0].Parameters[?ParameterKey=='MailTransport'].ParameterValue | [0]" \
      --output text 2>&1
  )"; then
    if [[ -z "$RESOLVED_MAIL_TRANSPORT" || "$RESOLVED_MAIL_TRANSPORT" == "None" ]]; then
      MAIL_TRANSPORT="ses"
      echo "==> MailTransport = $MAIL_TRANSPORT (stack '$BACKEND_STACK' not found yet — template default)"
    else
      MAIL_TRANSPORT="$RESOLVED_MAIL_TRANSPORT"
      echo "==> MailTransport = $MAIL_TRANSPORT (resolved from live stack '$BACKEND_STACK')"
    fi
  elif [[ "$RESOLVED_MAIL_TRANSPORT" == *ValidationError* ]]; then
    MAIL_TRANSPORT="ses"
    echo "==> MailTransport = $MAIL_TRANSPORT (stack '$BACKEND_STACK' not found yet — template default)"
  else
    echo "ERROR: could not resolve MailTransport from stack '$BACKEND_STACK':" >&2
    echo "$RESOLVED_MAIL_TRANSPORT" >&2
    echo "Refusing to guess — this is not 'stack does not exist', so defaulting" >&2
    echo "to 'ses' here could silently revert a live T-9 flip. Fix the AWS error" >&2
    echo "above and retry, or pass MAIL_TRANSPORT explicitly to override." >&2
    exit 1
  fi
fi
echo

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
# Deploy the BUILT template (not the source) — a source-template `sam deploy`
# zips the raw CodeUri (~500MB backend/ dev node_modules) and blows the 250MB
# Lambda unzip limit. See deploy.sh step 3.
BACKEND_BUILD_DIR="$INFRA_DIR/20-backend/.aws-sam/build"
echo "==> Building $BACKEND_STACK (sam build → $BACKEND_BUILD_DIR) ..."
sam build \
  --template "$BACKEND_TEMPLATE" \
  --build-dir "$BACKEND_BUILD_DIR" \
  --profile "$PROFILE" --region "$REGION"

# ── Step 2: redeploy the backend with the locked CORS origin ─────────────────
echo "==> Redeploying $BACKEND_STACK with AllowedOrigin=$CLOUDFRONT_URL ..."
sam deploy \
  --template "$BACKEND_BUILD_DIR/template.yaml" \
  --stack-name "$BACKEND_STACK" \
  --parameter-overrides \
    AllowedOrigin="$CLOUDFRONT_URL" \
    DataAuthStackName="$DATA_AUTH_STACK" \
    MailTransport="$MAIL_TRANSPORT" \
  --config-file "$SAMCONFIG" \
  --profile "$PROFILE" --region "$REGION" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

echo
echo "==> CORS locked. Backend now allows only origin: $CLOUDFRONT_URL"
