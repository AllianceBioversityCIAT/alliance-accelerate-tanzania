#!/usr/bin/env bash
#
# t9-enable-ses.sh — ACCELERATE Tanzania (spec bugfix/admin-user-invite-and-reset, T-9)
# ---------------------------------------------------------------------------
# PURPOSE
#   Turn-key OPERATOR helper for the two-phase Cognito → SES email enablement
#   (design.md §7.2, infra/README.md §6). It:
#     Phase A: deploys 10-data-auth with SenderEmail set + EnableSesSending=false
#              (creates the SES identity + branded templates; pool stays on the
#              old mailer), then PAUSES for you to (a) click the SES verification
#              link and (b) confirm, before it attaches the Cognito
#              sending-authorization policy (aws ses put-identity-policy).
#     Phase B: re-deploys with EnableSesSending=true (flips the pool to SES).
#
#   The sender address is the ONE thing you must decide — pass it as $1. It must
#   be an address you CONTROL and can receive the SES verification email at (a
#   generic/Cognito address cannot be verified). Everything else (account id,
#   user-pool ARN, VpcId, DevCidr) is resolved from the live stack.
#
# ⚠️ THIS SCRIPT PERFORMS LIVE, BILLABLE DEPLOYS to the IBD-DEV account. It is an
#    OPERATOR step — run it yourself with IBD-DEV credentials. It is idempotent
#    (change sets) and reversible (re-run Phase B logic with EnableSesSending=false).
#
# USAGE
#   ./infra/10-data-auth/t9-enable-ses.sh you@your-domain.org
#   DEV_CIDR=203.0.113.7/32 ./infra/10-data-auth/t9-enable-ses.sh you@your-domain.org
# ---------------------------------------------------------------------------

set -euo pipefail

# Force the correct account (the shell may default AWS_PROFILE to the wrong one).
PROFILE="IBD-DEV"
REGION="eu-west-1"
STACK="accelerate-tz-dev-data-auth"

SENDER="${1:-}"
if [[ -z "$SENDER" ]]; then
  echo "ERROR: pass the SES sender address as the first argument." >&2
  echo "       e.g. ./infra/10-data-auth/t9-enable-ses.sh you@your-domain.org" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/template.yaml"
POLICY_TEMPLATE="$SCRIPT_DIR/ses-cognito-send-policy.json"

echo "==> T-9 SES enablement — stack '$STACK', profile '$PROFILE', region '$REGION'."
echo "    Sender = $SENDER"
echo

# ── Resolve live wiring (account id, pool id/ARN, existing VpcId/DevCidr) ─────
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --profile "$PROFILE" --region "$REGION")"
POOL_ID="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text \
  --profile "$PROFILE" --region "$REGION")"
POOL_ARN="arn:aws:cognito-idp:${REGION}:${ACCOUNT_ID}:userpool/${POOL_ID}"

# Preserve the stack's current VpcId; DevCidr defaults to the current one but can
# be overridden (it only governs the RDS admin ingress, not email).
VPC_ID="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Parameters[?ParameterKey=='VpcId'].ParameterValue" --output text \
  --profile "$PROFILE" --region "$REGION")"
DEV_CIDR="${DEV_CIDR:-$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Parameters[?ParameterKey=='DevCidr'].ParameterValue" --output text \
  --profile "$PROFILE" --region "$REGION")}"

echo "    AccountId = $ACCOUNT_ID"
echo "    UserPool  = $POOL_ID"
echo "    PoolArn   = $POOL_ARN"
echo "    VpcId     = $VPC_ID"
echo "    DevCidr   = $DEV_CIDR"
echo

DEPLOY_COMMON=(
  --template "$TEMPLATE"
  --stack-name "$STACK"
  --capabilities CAPABILITY_NAMED_IAM
  --no-fail-on-empty-changeset
  --profile "$PROFILE" --region "$REGION"
)

# ── Phase A: create identity + templates, SES switch OFF ─────────────────────
echo "==> [A-1] Deploy identity + branded templates (EnableSesSending=false) ..."
sam deploy "${DEPLOY_COMMON[@]}" \
  --parameter-overrides \
    VpcId="$VPC_ID" DevCidr="$DEV_CIDR" \
    SenderEmail="$SENDER" EnableSesSending=false

echo
echo "==> [A-2] SES has emailed a verification link to: $SENDER"
echo "    Open that email and click the link to verify the sender identity."
if [[ -t 0 ]]; then
  read -r -p "    Press Enter once the sender address shows as verified ... " _
else
  echo "    (non-interactive shell — ensure the identity is verified before Phase B)"
fi
echo

# ── A-3: attach the Cognito sending-authorization policy ─────────────────────
echo "==> [A-3] Attaching the SES sending-authorization policy for Cognito ..."
RESOLVED_POLICY="$(mktemp -t ses-cognito-send-policy.XXXXXX.json)"
trap 'rm -f "$RESOLVED_POLICY"' EXIT
sed -e "s|<ACCOUNT_ID>|${ACCOUNT_ID}|g" \
    -e "s|<SENDER_EMAIL>|${SENDER}|g" \
    -e "s|<USER_POOL_ARN>|${POOL_ARN}|g" \
    "$POLICY_TEMPLATE" > "$RESOLVED_POLICY"
aws ses put-identity-policy \
  --identity "$SENDER" --policy-name cognito-send \
  --policy "file://$RESOLVED_POLICY" \
  --profile "$PROFILE" --region "$REGION"
echo "    Policy 'cognito-send' attached to identity $SENDER."
echo

# ── Phase B: flip the pool to SES DEVELOPER ──────────────────────────────────
echo "==> [B-1] Flipping the user pool to SES DEVELOPER (EnableSesSending=true) ..."
sam deploy "${DEPLOY_COMMON[@]}" \
  --parameter-overrides \
    VpcId="$VPC_ID" DevCidr="$DEV_CIDR" \
    SenderEmail="$SENDER" EnableSesSending=true

echo
echo "==> Done. Cognito now sends invite/reset email via SES from $SENDER."
echo "    SES sandbox note: until production access is granted, verify each test"
echo "    recipient first:"
echo "        aws ses verify-email-identity --email-address <recipient> --profile $PROFILE --region $REGION"
echo "    Smoke: create a test user in Admin → User management and confirm the"
echo "    branded invite lands in the inbox; 'Reset pwd' on a never-signed-in user"
echo "    re-sends the invite (no 500)."
