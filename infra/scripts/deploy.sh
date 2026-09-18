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
#   MAIL_TRANSPORT=microservice ./infra/scripts/deploy.sh  # explicit, matches the current default
# ---------------------------------------------------------------------------

set -euo pipefail

# shellcheck disable=SC1091
source "${BASH_SOURCE[0]%/*}/_guard.sh"
assert_account

# Stack names — single source of truth is infra/README.md conventions.
DATA_AUTH_STACK="${DATA_AUTH_STACK:-accelerate-tz-dev-data-auth}"
BACKEND_STACK="${BACKEND_STACK:-accelerate-tz-dev-backend}"
FRONTEND_STACK="${FRONTEND_STACK:-accelerate-tz-dev-frontend}"

# Backend CORS origin (FR-4, FR-5, T-5). An explicit ALLOWED_ORIGIN from the
# operator always wins — same precedence MAIL_TRANSPORT has, below. Otherwise
# resolve the LIVE CloudFrontUrl output from the frontend stack via the
# shared resolve_stack_value helper (_guard.sh, NFR-4): read the live value
# instead of asserting one, the same lesson MAIL_TRANSPORT already applies a
# few lines down. '*' survives ONLY where the 30-frontend stack genuinely
# does not exist yet — the true bootstrap, before any distribution exists to
# point at — and that fallback is announced on stderr (FR-4). A FAILED
# lookup (expired token, throttle, IAM denial, a malformed stack name) is
# NOT that case and ABORTS rather than silently deploying a permissive
# origin (FR-5) — this replaces `ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"`, a
# static default with no resolution and no failure/absence distinction at
# all, locked later by set-cors.sh (T-8, FR-6, DD-6).
if [[ -n "${ALLOWED_ORIGIN:-}" ]]; then
  echo "==> AllowedOrigin = $ALLOWED_ORIGIN (operator override via ALLOWED_ORIGIN env var)"
else
  if RESOLVED_ALLOWED_ORIGIN="$(resolve_stack_value "$FRONTEND_STACK" \
      "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue | [0]" \
      output)"; then
    ALLOWED_ORIGIN="$RESOLVED_ALLOWED_ORIGIN"
    echo "==> AllowedOrigin = $ALLOWED_ORIGIN (resolved from live stack '$FRONTEND_STACK')"
  else
    rc=$?
    case "$rc" in
      2)
        ALLOWED_ORIGIN='*'
        echo "==> AllowedOrigin = '*' — stack '$FRONTEND_STACK' does not exist yet (dev bootstrap; set-cors.sh locks this once the frontend deploys)." >&2
        ;;
      *)
        echo "ERROR: could not resolve AllowedOrigin from stack '$FRONTEND_STACK'." >&2
        echo "Refusing to guess — a failed lookup is not the same as an absent stack," >&2
        echo "and deploying '*' here would silently reopen CORS. Fix the AWS error" >&2
        echo "above and retry, or pass ALLOWED_ORIGIN explicitly to override." >&2
        exit 1
        ;;
    esac
  fi
fi

# Mail transport for THIS DEPLOY TARGET — "microservice" is the only value
# infra/20-backend/template.yaml's MailTransport parameter accepts (see that
# parameter's Description for why). The CODE accepts a second value,
# "no-op" — backend/src/mail/mail.config.ts is the source of truth for that
# — but "no-op" is the mandated LOCAL default, not a valid override here
# (the guard below rejects it same as any other unsupported value). MUST
# be passed explicitly on every backend deploy: SAM sends UsePreviousValue
# for any parameter absent from --parameter-overrides, so omitting the
# parameter override entirely would let an unrelated operator run silently
# revert the transport (design.md §7.3).
#
# ⚠️ A hardcoded `${MAIL_TRANSPORT:-microservice}` default would repeat, on
# a smaller scale, the exact class of hazard Phase A's rollout was built to
# avoid: a value baked into this script rather than read from the live
# stack can drift from what is actually deployed and report success anyway
# (T-8 review, Issue 1 — originally found against a hardcoded "ses"
# fallback, before Phase B removed that value from the accepted set
# entirely). So: an explicit MAIL_TRANSPORT env var always wins (operator
# override); otherwise resolve the CURRENT value from the deployed stack —
# mirroring set-cors.sh's CloudFrontUrl resolution, for the same reason:
# read the live value instead of asserting one. Only a stack that does not
# exist yet (the very first deploy) falls back to "microservice" — the
# template's own Default as of Phase B (T-10); "ses" is no longer a valid
# fallback here, since the code (mail.config.ts) rejects it unconditionally.
if [[ -n "${MAIL_TRANSPORT:-}" ]]; then
  echo "==> MailTransport = $MAIL_TRANSPORT (operator override via MAIL_TRANSPORT env var)"
else
  # Delegates to the shared resolve_stack_value helper (_guard.sh, T-5,
  # NFR-4) instead of a local copy of the same classification — this used
  # to duplicate the block set-cors.sh also carried. That collapse TIGHTENS
  # this site's behaviour (requirements.md FR-5's last clause, intentional
  # and covered by its own test): it used to accept a bare `ValidationError`
  # as "stack not found"; the helper additionally requires the literal
  # absent-stack phrasing, so a malformed stack name now aborts
  # here instead of silently resolving to the "microservice" default.
  if RESOLVED_MAIL_TRANSPORT="$(resolve_stack_value "$BACKEND_STACK" \
      "Stacks[0].Parameters[?ParameterKey=='MailTransport'].ParameterValue | [0]" \
      parameter)"; then
    MAIL_TRANSPORT="$RESOLVED_MAIL_TRANSPORT"
    echo "==> MailTransport = $MAIL_TRANSPORT (resolved from live stack '$BACKEND_STACK')"
  else
    rc=$?
    case "$rc" in
      2)
        MAIL_TRANSPORT="microservice"
        echo "==> MailTransport = $MAIL_TRANSPORT (stack '$BACKEND_STACK' not found yet — template default)"
        ;;
      *)
        echo "ERROR: could not resolve MailTransport from stack '$BACKEND_STACK'." >&2
        echo "Refusing to guess — this is not 'stack does not exist', so defaulting" >&2
        echo "here could silently revert a live transport. Fix the AWS error above" >&2
        echo "and retry, or pass MAIL_TRANSPORT explicitly to override." >&2
        exit 1
        ;;
    esac
  fi
fi

# ⚠️ Guard, in addition to the template's own narrowed AllowedValues: abort
# HERE, before ever reaching `sam deploy`, unless MAIL_TRANSPORT resolved to
# "microservice" — whether the resolved value came from an explicit operator
# override or from a live stack that predates the T-9 flip. Keyed to the
# accepted set, not to the one legacy value ("ses") this used to guard
# against: infra/20-backend/template.yaml's MailTransport AllowedValues
# accepts only "microservice", so ANY other value — "ses", "no-op" (a valid
# CODE value per backend/src/mail/mail.config.ts, but not a valid value for
# THIS parameter), or anything else — would otherwise sail past a guard
# keyed only to "ses", through the 10-data-auth deploy and the migrate
# pause, and only then die at the backend changeset with a confusing
# parameter-constraint error. That is exactly the "deploy reports success,
# every send then throws with no deploy-time signal" hazard this script
# exists to prevent, just relocated one step later. Fail loud, fail here,
# before any AWS call that could otherwise be mistaken for progress.
if [[ "$MAIL_TRANSPORT" != "microservice" ]]; then
  echo "ERROR: MailTransport resolved to '$MAIL_TRANSPORT'." >&2
  echo "infra/20-backend/template.yaml's MailTransport AllowedValues accepts" >&2
  echo "only 'microservice' for a deployed stack — see that parameter's" >&2
  echo "Description. ('no-op' is a valid LOCAL value per" >&2
  echo "backend/src/mail/mail.config.ts, but not a valid deploy target here.)" >&2
  if [[ "$MAIL_TRANSPORT" == "ses" ]]; then
    echo "If this came from a live stack that predates the T-9 flip, redeploy" >&2
    echo "with MAIL_TRANSPORT=microservice once the mail microservice secret" >&2
    echo "(infra/README.md §7) holds real values, not placeholders." >&2
  fi
  exit 1
fi
echo

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
# MUST run before `sam deploy`. CRITICAL: deploy the BUILT template
# ($BACKEND_BUILD_DIR/template.yaml), NOT the source template — passing the
# source template to `sam deploy` zips the raw CodeUri (the full backend/ dev
# node_modules, ~500MB) and ignores the slimmed makefile build, blowing the
# 250MB Lambda unzip limit.
BACKEND_BUILD_DIR="$INFRA_DIR/20-backend/.aws-sam/build"
echo "==> [3/4] Building $BACKEND_STACK (sam build → $BACKEND_BUILD_DIR) ..."
sam build \
  --template "$INFRA_DIR/20-backend/template.yaml" \
  --build-dir "$BACKEND_BUILD_DIR" \
  --profile "$PROFILE" --region "$REGION"

echo "==> [3/4] Deploying $BACKEND_STACK (Lambda + HTTP API) ..."
sam deploy \
  --template "$BACKEND_BUILD_DIR/template.yaml" \
  --stack-name "$BACKEND_STACK" \
  --parameter-overrides \
    AllowedOrigin="$ALLOWED_ORIGIN" \
    DataAuthStackName="$DATA_AUTH_STACK" \
    MailTransport="$MAIL_TRANSPORT" \
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
echo
echo "==> Before this deploy's microservice transport can send anything real:"
echo "    write the mail microservice secret first — see infra/README.md §7,"
echo "    'Mail microservice secret — operator runbook (T-8)'. The secret still"
echo "    holds its deploy-time placeholders until you do."
