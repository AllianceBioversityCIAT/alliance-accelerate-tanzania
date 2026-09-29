#!/usr/bin/env bash
#
# deploy-data-auth.sh — ACCELERATE Tanzania Seed Registry
# ---------------------------------------------------------------------------
# PURPOSE
#   Deploy 10-data-auth ON ITS OWN, with CustomEmailSenderPublicAppBaseUrl
#   resolved from the frontend stack's PublicAppUrl output.
#
#   WHY THIS SCRIPT EXISTS. That parameter's Default is deliberately empty
#   (this stack has no origin of its own to fall back to), and until now the
#   only thing that ever filled it was deploy.sh — which deploys all four
#   steps and auto-detects the operator's public IP into the RDS ingress
#   rule. A targeted `sam deploy` of this stack therefore left the parameter
#   at its previous value, silently: CloudFormation keeps the stored value
#   for anything absent from --parameter-overrides, so the password-reset
#   link kept pointing at whatever URL the last full deploy happened to
#   resolve. Passing the URL by hand on the command line worked and was
#   exactly as forgettable as it sounds — it was missed on the first run.
#
#   So this resolves it the same way set-cors.sh resolves the backend's
#   origin: from the live PublicAppUrl output, the one place the domain is
#   written (infra/30-frontend/template.yaml).
#
#   Every OTHER parameter is deliberately omitted, so CloudFormation keeps
#   its current value — VpcId and DevCidr included. That is the point of a
#   targeted deploy: the RDS ingress rule is left exactly as it is.
#
# PREREQUISITES
#   - 30-frontend deployed and exposing PublicAppUrl (it aborts otherwise).
#   - AWS CLI v2 + SAM CLI; valid IBD-DEV credentials.
#
# ⚠️ THIS STACK HOLDS RDS AND THE COGNITO USER POOL, and neither declares
#   DeletionPolicy or UpdateReplacePolicy. The changeset prompt is left ON
#   for that reason — review it, and ABORT if AWS::RDS::DBInstance or
#   AWS::Cognito::UserPool shows Replacement: True.
#
# THIS IS AN OPERATOR-RUN SCRIPT. It redeploys a live stack. It is NOT run by
# the SDD agent loop. See infra/README.md (runbook).
#
# USAGE
#   ./infra/scripts/deploy-data-auth.sh
#   PUBLIC_APP_URL=https://app.example.org ./infra/scripts/deploy-data-auth.sh
# ---------------------------------------------------------------------------

set -euo pipefail

# See set-cors.sh's identical block: a slash-less $0 would otherwise resolve
# the guard's path to a directory that does not exist.
_SELF_DIR="${BASH_SOURCE[0]%/*}"
if [[ "$_SELF_DIR" == "${BASH_SOURCE[0]}" ]]; then _SELF_DIR="."; fi
# shellcheck disable=SC1091
source "$_SELF_DIR/_guard.sh"
announce_account

DATA_AUTH_STACK="${DATA_AUTH_STACK:-accelerate-tz-dev-data-auth}"
FRONTEND_STACK="${FRONTEND_STACK:-accelerate-tz-dev-frontend}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SAMCONFIG="$INFRA_DIR/samconfig.toml"
DATA_AUTH_TEMPLATE="$INFRA_DIR/10-data-auth/template.yaml"
DATA_AUTH_BUILD_DIR="$INFRA_DIR/10-data-auth/.aws-sam/build"

# An absent or unresolvable PublicAppUrl ABORTS rather than falling back to
# CloudFrontUrl: falling back is precisely the silent wrong answer this
# script exists to stop, and mail.config.ts's mirror in config.mjs would
# accept the old URL without complaint.
if [[ -n "${PUBLIC_APP_URL:-}" ]]; then
  echo "==> Using PUBLIC_APP_URL from env: $PUBLIC_APP_URL"
else
  echo "==> Resolving PublicAppUrl from stack '$FRONTEND_STACK' ..."
  if ! PUBLIC_APP_URL="$(resolve_stack_value "$FRONTEND_STACK" \
      "Stacks[0].Outputs[?OutputKey=='PublicAppUrl'].OutputValue | [0]" \
      output)"; then
    echo "ERROR: could not resolve PublicAppUrl from stack '$FRONTEND_STACK'." >&2
    echo "       Deploy 30-frontend first, or pass PUBLIC_APP_URL explicitly." >&2
    exit 1
  fi
  echo "==> CustomEmailSenderPublicAppBaseUrl = $PUBLIC_APP_URL (resolved from '$FRONTEND_STACK')"
fi

echo
echo "==> Building $DATA_AUTH_STACK (sam build → $DATA_AUTH_BUILD_DIR) ..."
sam build \
  --template "$DATA_AUTH_TEMPLATE" \
  --build-dir "$DATA_AUTH_BUILD_DIR" \
  --profile "$PROFILE" --region "$REGION"

echo
echo "==> Deploying $DATA_AUTH_STACK — REVIEW THE CHANGESET BEFORE CONFIRMING."
sam deploy \
  --template "$DATA_AUTH_BUILD_DIR/template.yaml" \
  --stack-name "$DATA_AUTH_STACK" \
  --parameter-overrides \
    CustomEmailSenderPublicAppBaseUrl="$PUBLIC_APP_URL" \
  --config-file "$SAMCONFIG" \
  --profile "$PROFILE" --region "$REGION" \
  --capabilities CAPABILITY_NAMED_IAM

echo
echo "==> $DATA_AUTH_STACK deployed. Confirm the value that actually landed:"
echo "        aws cloudformation describe-stacks --stack-name $DATA_AUTH_STACK \\"
echo "          --profile $PROFILE --region $REGION \\"
echo "          --query \"Stacks[0].Parameters[?ParameterKey=='CustomEmailSenderPublicAppBaseUrl']\" --output table"
echo "    then trigger a password reset and check the link in that email."
