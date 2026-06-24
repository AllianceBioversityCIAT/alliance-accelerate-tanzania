#!/usr/bin/env bash
#
# teardown.sh — ACCELERATE Tanzania Seed Registry (infra/aws-deployment, T-10)
# ---------------------------------------------------------------------------
# PURPOSE
#   DESTROY the entire dev environment so nothing lingers or bills (FR-8, NFR-6)
#   under the IBD-DEV profile / eu-west-1 (NFR-1). It deletes all three stacks in
#   the REVERSE of the deploy order and empties the frontend bucket first:
#
#     1. Empty the frontend S3 bucket   (CloudFormation can't delete a non-empty
#                                         bucket — resolve the name from the
#                                         30-frontend outputs, then s3 rm --recursive).
#     2. delete 30-frontend             (S3 + CloudFront OAC).
#     3. delete 20-backend              (Lambda + HTTP API).
#     4. delete 10-data-auth            (RDS + Secrets Manager + Cognito).
#
#   ⚠️ DELETE ORDER IS REVERSE-OF-DEPLOY ON PURPOSE. The 20-backend stack imports
#   the 10-data-auth stack's exports (Fn::ImportValue / DataAuthStackName), so
#   CloudFormation REFUSES to delete data-auth while backend still exists. Frontend
#   is independent but is removed first to mirror the deploy order cleanly.
#
#   The bucket name and stack names are non-secret wiring values and are echoed as
#   progress. No secrets are read or printed (NFR-2) — teardown only deletes.
#
#   IDEMPOTENT / RE-RUNNABLE: every step tolerates an already-absent stack/bucket
#   (a previous partial teardown, or a stack that never deployed) and continues
#   rather than hard-failing, so a re-run finishes the job (NFR-6/NFR-7).
#
# PREREQUISITES
#   - AWS SAM CLI + AWS CLI v2 installed; jq; valid IBD-DEV credentials with
#     cloudformation:DeleteStack/DescribeStacks, s3 delete on the bucket, and
#     permission to delete the stacks' resources (RDS, Lambda, CloudFront, ...).
#
# ☠️ THIS SCRIPT IS DESTRUCTIVE AND IRREVERSIBLE. It permanently deletes the dev
#    RDS database (and its data), the Lambda/API, Cognito pool, S3 content, and
#    CloudFront distribution. It is an OPERATOR-RUN step (the user holds IBD-DEV
#    creds) — it is NEVER run by the SDD agent loop. See infra/README.md (runbook).
#
# USAGE
#   ./infra/scripts/teardown.sh                 # interactive — prompts to type 'yes'
#   CONFIRM=yes ./infra/scripts/teardown.sh     # non-interactive confirmation
#   CONFIRM=yes AWS_PROFILE=other ./infra/scripts/teardown.sh   # also clears IBD-DEV guard
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Config (overridable via env; IBD-DEV / eu-west-1 defaults — NFR-1) ───────
PROFILE="${AWS_PROFILE:-IBD-DEV}"
REGION="${AWS_REGION:-eu-west-1}"

# Stack names — single source of truth is infra/README.md conventions.
DATA_AUTH_STACK="${DATA_AUTH_STACK:-accelerate-tz-dev-data-auth}"
BACKEND_STACK="${BACKEND_STACK:-accelerate-tz-dev-backend}"
FRONTEND_STACK="${FRONTEND_STACK:-accelerate-tz-dev-frontend}"

echo "==> ACCELERATE Tanzania dev TEARDOWN — profile '$PROFILE', region '$REGION'."
echo "    Stacks to delete (reverse deploy order):"
echo "        1. $FRONTEND_STACK   (S3 + CloudFront)   [bucket emptied first]"
echo "        2. $BACKEND_STACK   (Lambda + HTTP API)"
echo "        3. $DATA_AUTH_STACK   (RDS + Secrets Manager + Cognito)"
echo

# ── IBD-DEV guard (hard constraint: every AWS action uses IBD-DEV — NFR-1) ───
# If a non-IBD-DEV profile is in play, warn and require explicit confirmation
# before going any further (CONFIRM=yes env, or an interactive 'yes' on a TTY).
if [[ "$PROFILE" != "IBD-DEV" ]]; then
  echo "WARNING: AWS profile is '$PROFILE', not 'IBD-DEV' (the mandated profile)." >&2
  if [[ "${CONFIRM:-}" == "yes" ]]; then
    echo "         CONFIRM=yes set — proceeding against '$PROFILE'." >&2
  elif [[ -t 0 ]]; then
    read -r -p "         Continue against '$PROFILE'? Type 'yes' to proceed: " reply
    if [[ "$reply" != "yes" ]]; then
      echo "Aborted: profile is not IBD-DEV and confirmation was not given." >&2
      exit 1
    fi
  else
    echo "Aborted: profile is not IBD-DEV. Re-run with CONFIRM=yes to override." >&2
    exit 1
  fi
fi

# ── Strong destruction confirmation guard ────────────────────────────────────
# Teardown is irreversible, so require an explicit, unambiguous confirmation:
# either CONFIRM=yes in the environment, or the operator typing 'yes' (or the
# literal word 'destroy') at an interactive prompt. Abort on anything else, and
# refuse outright on a non-TTY with no CONFIRM (never destroy unattended).
if [[ "${CONFIRM:-}" == "yes" ]]; then
  echo "==> CONFIRM=yes set — proceeding with teardown."
elif [[ -t 0 ]]; then
  echo "☠️  This permanently deletes the dev RDS database and all three stacks."
  read -r -p "    Type 'yes' (or 'destroy') to confirm teardown: " confirm
  if [[ "$confirm" != "yes" && "$confirm" != "destroy" ]]; then
    echo "Aborted: teardown not confirmed (expected 'yes' or 'destroy')." >&2
    exit 1
  fi
else
  echo "Aborted: refusing to tear down unattended. Re-run with CONFIRM=yes." >&2
  exit 1
fi
echo

# ── Common sam delete flags: non-interactive, IBD-DEV-scoped (NFR-1) ─────────
SAM_DELETE_FLAGS=(
  --no-prompts
  --profile "$PROFILE" --region "$REGION"
)

# ── Helper: does a CloudFormation stack still exist? ─────────────────────────
# Returns 0 if the stack is present, 1 if absent — lets every delete tolerate an
# already-gone stack (idempotent teardown).
stack_exists() {
  local stack="$1"
  aws cloudformation describe-stacks \
    --profile "$PROFILE" --region "$REGION" \
    --stack-name "$stack" \
    --query "Stacks[0].StackName" --output text >/dev/null 2>&1
}

# ── Helper: delete one stack via `sam delete`, tolerating absence ─────────────
delete_stack() {
  local stack="$1"
  if stack_exists "$stack"; then
    echo "==> Deleting stack '$stack' ..."
    sam delete --stack-name "$stack" "${SAM_DELETE_FLAGS[@]}"
    echo "==> '$stack' deletion requested/complete."
  else
    echo "==> Stack '$stack' not found — already gone, skipping."
  fi
  echo
}

# ── Step 1: empty the frontend bucket (must precede the frontend stack delete) ─
# CloudFormation cannot delete a non-empty S3 bucket, so resolve the bucket name
# from the 30-frontend outputs and purge its objects first. Guard every branch so
# a missing stack / output / bucket is a skip, not a hard failure.
echo "==> [1/4] Emptying the frontend S3 bucket (before deleting $FRONTEND_STACK) ..."
if stack_exists "$FRONTEND_STACK"; then
  FRONTEND_OUTPUTS="$(
    aws cloudformation describe-stacks \
      --profile "$PROFILE" --region "$REGION" \
      --stack-name "$FRONTEND_STACK" \
      --query "Stacks[0].Outputs" --output json 2>/dev/null
  )" || FRONTEND_OUTPUTS="[]"

  BUCKET="$(
    jq -r '.[] | select(.OutputKey == "FrontendBucketName") | .OutputValue' <<<"$FRONTEND_OUTPUTS"
  )"

  if [[ -n "$BUCKET" && "$BUCKET" != "null" ]]; then
    if aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1; then
      echo "    Emptying s3://$BUCKET (recursive) ..."
      aws s3 rm "s3://$BUCKET" --recursive --profile "$PROFILE" --region "$REGION" || {
        echo "    WARNING: could not fully empty s3://$BUCKET — the frontend stack delete may fail." >&2
      }
    else
      echo "    Bucket '$BUCKET' not found/accessible — nothing to empty, skipping."
    fi
  else
    echo "    No FrontendBucketName output on '$FRONTEND_STACK' — skipping bucket empty."
  fi
else
  echo "    Stack '$FRONTEND_STACK' not found — no bucket to empty, skipping."
fi
echo

# ── Step 2: delete 30-frontend (S3 + CloudFront) ─────────────────────────────
echo "==> [2/4] Deleting $FRONTEND_STACK (S3 + CloudFront) ..."
delete_stack "$FRONTEND_STACK"

# ── Step 3: delete 20-backend (Lambda + HTTP API) ────────────────────────────
# Must precede 10-data-auth: backend imports data-auth's exports, so data-auth
# cannot be deleted while backend exists.
echo "==> [3/4] Deleting $BACKEND_STACK (Lambda + HTTP API) ..."
delete_stack "$BACKEND_STACK"

# ── Step 4: delete 10-data-auth (RDS + Secrets Manager + Cognito) ────────────
echo "==> [4/4] Deleting $DATA_AUTH_STACK (RDS + Secrets Manager + Cognito) ..."
delete_stack "$DATA_AUTH_STACK"

echo "==> Teardown complete. All three stacks deleted (or already absent)."
echo "    Verify with:"
echo "        aws cloudformation describe-stacks --stack-name $DATA_AUTH_STACK --profile $PROFILE --region $REGION"
echo "    (should report the stack does not exist)."
