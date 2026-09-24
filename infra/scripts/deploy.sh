#!/usr/bin/env bash
#
# deploy.sh — ACCELERATE Tanzania Seed Registry (infra/aws-deployment, T-7)
# ---------------------------------------------------------------------------
# PURPOSE
#   Orchestrate the ordered, idempotent deploy of the three dev stacks under
#   the IBD-DEV profile / eu-west-1 (FR-1, FR-8, NFR-1, NFR-7), per the deploy
#   order in design.md §1 / DD-6:
#
#     1. sam build + deploy 10-data-auth (params: VpcId, DevCidr) → RDS/secret/Cognito
#        (T-1, design.md §8: this stack now carries a SAM Transform + build
#        method, same reason as step 3, so a function landing here — e.g.
#        forgot-password-delivery's CustomEmailSender — gets its npm
#        dependencies installed before deploy, not skipped.)
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
#   - For step 1: `sam build` is a no-op until 10-data-auth carries an
#     AWS::Serverless::Function (T-4's CustomEmailSender); once it does,
#     that function's CodeUri directory needs its own package.json for
#     `sam build` to npm-install (Metadata: BuildMethod: nodejs24.x).
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
#   ALLOWED_ORIGIN='*' ./infra/scripts/deploy.sh       # backend CORS override — there is
#                                                       # no default any more; '*' is an
#                                                       # announced bootstrap fallback only
#                                                       # (see resolve_stack_value, below)
#   MAIL_TRANSPORT=microservice ./infra/scripts/deploy.sh  # explicit, matches the current default
# ---------------------------------------------------------------------------

set -euo pipefail

# `${BASH_SOURCE[0]%/*}` leaves a SLASH-LESS path untouched, so
# `cd infra/scripts && bash <this script>` would otherwise try to source
# `<this script>/_guard.sh` and die before the guard ever ran. Fall back to
# `.` in exactly that case — see _guard.sh's "OWN-PATH RESOLUTION" block.
_SELF_DIR="${BASH_SOURCE[0]%/*}"
if [[ "$_SELF_DIR" == "${BASH_SOURCE[0]}" ]]; then _SELF_DIR="."; fi
# shellcheck disable=SC1091
source "$_SELF_DIR/_guard.sh"
announce_account

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

# ── Resolve CustomEmailSenderKmsGrantPrincipalArn, CustomEmailSenderUserPoolId
#    and CustomEmailSenderPublicAppBaseUrl (forgot-password-delivery T-6,
#    design.md DD-2c) — all three parameters exist on 10-data-auth's
#    template (T-3/T-4, DD-2a/DD-2b/DD-3b) with inert defaults, but until
#    now NOTHING passed real values, so every deploy — including a
#    pipeline's — shipped the Default. That defeats each parameter's own
#    reason for existing (a hardcode by another name). Wire all three
#    here, the same way ALLOWED_ORIGIN/MAIL_TRANSPORT above are wired
#    rather than hardcoded: an explicit operator override always wins;
#    otherwise resolve the live value, never assert one.
echo "==> Resolving CustomEmailSenderKmsGrantPrincipalArn, CustomEmailSenderUserPoolId, and CustomEmailSenderPublicAppBaseUrl ..."

# CustomEmailSenderKmsGrantPrincipalArn — the IAM principal THIS SCRIPT is
# running as, i.e. the identity that calls Cognito's UpdateUserPool below
# when LambdaConfig activates the trigger (design.md §4/DD-2a). An
# explicit CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN always wins — the
# same operator-override precedence ALLOWED_ORIGIN/MAIL_TRANSPORT already
# give above, and the escape hatch for a pipeline whose `sts
# get-caller-identity` this script cannot itself validate in advance.
# Otherwise resolved fresh on every run, never hardcoded: today an
# interactive operator holds IBD-DEV credentials as an IAM user, but a
# CI/pipeline run may instead assume an IAM role, and a template (or
# script) that hardcodes today's developer ARN would silently grant the
# wrong principal the day a pipeline deploys instead of a person.
# ⚠️ DD-2c's trap: this identity is what Cognito actually sees ONLY while
# `sam deploy` runs WITHOUT `--role-arn`. A CloudFormation service role
# would change the principal Cognito uses, and SAM_DEPLOY_FLAGS above
# passes no `--role-arn` today.
if [[ -n "${CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN:-}" ]]; then
  echo "    CustomEmailSenderKmsGrantPrincipalArn = $CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN (operator override via CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN env var)" >&2
else
  CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN="$(aws sts get-caller-identity \
    --profile "$PROFILE" --region "$REGION" --query Arn --output text)"

  if [[ -z "$CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN" || "$CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN" == "None" ]]; then
    echo "ERROR: could not resolve the deploying principal's ARN via sts get-caller-identity." >&2
    echo "This principal needs kms:CreateGrant on CustomEmailSenderKey (design.md §4/DD-2a)" >&2
    echo "for the activating deploy to work — refusing to fall back to the template's" >&2
    echo "stale Default rather than silently granting the wrong principal." >&2
    exit 1
  fi
  echo "    CustomEmailSenderKmsGrantPrincipalArn = $CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN (resolved via sts get-caller-identity)" >&2
fi

# ⚠️ SHAPE GUARD (T-6 attempt 2, Finding 5). Fail loud, fail here, before
# any AWS call that could otherwise be mistaken for progress — same voice
# as the MAIL_TRANSPORT guard above. A bare `-z`/`None` check lets ANY
# other non-empty string flow into --parameter-overrides and into
# CustomEmailSenderKey's KeyPolicy, and that parameter has no
# AllowedPattern of its own, so nothing downstream would catch a
# malformed value. The trap this specifically closes: under an assumed
# IAM ROLE or SSO session, `sts get-caller-identity` returns a SESSION ARN
# (arn:aws:sts::<account>:assumed-role/<role>/<session-name>) — KMS
# accepts that literal string as a Principal, but it is scoped to one
# EXPIRING session, not the durable role, so the deploy SUCCEEDS and every
# later password reset dies with no deploy-time signal — the exact
# silent-failure shape this parameter's own Description exists to avoid.
# Required shape here: a durable IAM user or role ARN, never an STS
# session ARN — checked whether the value came from the override or from
# the resolution above.
if [[ "$CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN" =~ ^arn:aws:sts::[0-9]{12}:assumed-role/ ]]; then
  echo "ERROR: CustomEmailSenderKmsGrantPrincipalArn is an STS SESSION ARN:" >&2
  echo "    $CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN" >&2
  echo "This is the session-ARN trap: KMS would accept it as a Principal, but it is" >&2
  echo "scoped to one EXPIRING session, not the durable role behind it — the deploy" >&2
  echo "would succeed and every later password reset would fail with no deploy-time" >&2
  echo "signal. Pass the durable role ARN explicitly via" >&2
  echo "CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN=arn:aws:iam::<account>:role/<role>." >&2
  exit 1
elif [[ ! "$CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN" =~ ^arn:aws:iam::[0-9]{12}:(user|role)/.+$ ]]; then
  echo "ERROR: CustomEmailSenderKmsGrantPrincipalArn is not a well-formed IAM user or" >&2
  echo "role ARN: $CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN" >&2
  echo "Refusing to pass it into CustomEmailSenderKey's KeyPolicy unchecked — that" >&2
  echo "parameter has no AllowedPattern of its own (design.md §4/DD-2a)." >&2
  exit 1
fi

# CustomEmailSenderUserPoolId — THIS stack's own UserPoolId output, fed
# back in as a parameter (DD-2b) so the KMS key policy's encryption-context
# condition and the invoke permission's SourceArn (DD-5b) can reference the
# real pool id without a same-template `!Ref UserPool`, which would
# deadlock the stack in a cycle (DD-2b). An explicit
# CUSTOM_EMAIL_SENDER_USER_POOL_ID always wins, same precedence as above.
# Otherwise: same chicken-and-egg shape as MailTransport's own resolution
# above (that one reads $BACKEND_STACK before step 3 touches it; this one
# reads $DATA_AUTH_STACK before step 1, below, touches IT) and the same
# fix: resolve the CURRENT value from the deployed stack via
# resolve_stack_value, falling back to the template's own empty Default
# ONLY when the stack does not exist yet.
#
# On a genuinely first-ever deploy, $DATA_AUTH_STACK does not exist, so
# this resolves "2" (confirmed absent) and the parameter stays "". That
# first deploy creates the pool with the KMS grant condition matching
# nothing and CustomEmailSenderInvokePermission's SourceArn omitted (both
# per the template's own HasCustomEmailSenderUserPoolId Condition) — not a
# regression, since a first deploy could not have known the pool's
# post-creation id in advance either way. A SECOND run of this script,
# once the stack exists, resolves the real id and wires both for real —
# the operator is expected to run this script again after the first
# apply, exactly as DD-2c anticipates.
if [[ -n "${CUSTOM_EMAIL_SENDER_USER_POOL_ID:-}" ]]; then
  echo "    CustomEmailSenderUserPoolId = $CUSTOM_EMAIL_SENDER_USER_POOL_ID (operator override via CUSTOM_EMAIL_SENDER_USER_POOL_ID env var)" >&2
elif RESOLVED_CUSTOM_EMAIL_SENDER_USER_POOL_ID="$(resolve_stack_value "$DATA_AUTH_STACK" \
    "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue | [0]" \
    output)"; then
  CUSTOM_EMAIL_SENDER_USER_POOL_ID="$RESOLVED_CUSTOM_EMAIL_SENDER_USER_POOL_ID"
  echo "    CustomEmailSenderUserPoolId = $CUSTOM_EMAIL_SENDER_USER_POOL_ID (resolved from live stack '$DATA_AUTH_STACK')" >&2
else
  rc=$?
  case "$rc" in
    2)
      CUSTOM_EMAIL_SENDER_USER_POOL_ID=""
      # ⚠️ UNVERIFIED (T-6 attempt 2, Finding 5's advisory) — attempt 1's
      # comment here asserted this is "the same inert value it already
      # deploys with today" as established fact. Every OTHER resolution
      # site in this repo guarantees a NON-EMPTY fallback sentinel ('*'
      # for ALLOWED_ORIGIN, 'microservice' for MAIL_TRANSPORT); this would
      # be the first genuinely EMPTY value this script has ever passed via
      # --parameter-overrides, and whether SAM's own handling of an empty
      # override string matches an omitted parameter is version-sensitive
      # and not tested here. Does not affect the imminent deploy (the
      # stack already exists, so this branch does not fire) — recorded as
      # an open question for T-7, not verified or fixed by this task.
      echo "    CustomEmailSenderUserPoolId = '' — stack '$DATA_AUTH_STACK' does not exist yet (first deploy; template Default, inert per DD-2c)." >&2
      ;;
    *)
      echo "ERROR: could not resolve CustomEmailSenderUserPoolId from stack '$DATA_AUTH_STACK'." >&2
      echo "Refusing to guess — this is not 'stack does not exist', so defaulting here" >&2
      echo "could silently leave the KMS grant condition and the invoke permission's" >&2
      echo "SourceArn scoped to the wrong (or no) pool. Fix the AWS error above and retry." >&2
      exit 1
      ;;
  esac
fi

# CustomEmailSenderPublicAppBaseUrl (T-6 attempt 2, Finding 6 — USER-
# APPROVED SCOPE ADDITION). LambdaConfig activates the trigger for EVERY
# pool email, not only password resets (design.md §6) —
# CustomEmailSender_VerifyUserAttribute's message builder calls
# config.mjs's getPublicAppBaseUrl()
# (infra/10-data-auth/functions/custom-email-sender/config.mjs), which
# THROWS on an unset/empty value. CustomEmailSender_ForgotPassword is
# unaffected (DD-1c removed that message's link entirely), but leaving
# this parameter at its empty Default would make the verification path
# throw on every real invocation once this deploy lands.
#
# 10-data-auth's own parameter Description says the TEMPLATE has "no
# AllowedOrigin to fall back to" — true of the template in isolation, but
# not of THIS SCRIPT: deploy.sh already resolved $ALLOWED_ORIGIN above
# (the live CloudFrontUrl, or '*' on a genuine bootstrap) for the backend
# stack's own PublicAppBaseUrl fallback
# (infra/20-backend/template.yaml's HasExplicitPublicAppBaseUrl condition,
# ATP-67). Reusing that already-resolved value here — no extra AWS call —
# mirrors that same fallback shape rather than inventing a new one: an
# explicit CUSTOM_EMAIL_SENDER_PUBLIC_APP_BASE_URL override always wins;
# otherwise default to the same CloudFront URL this deploy already uses
# for everything else public-facing. A bootstrap '*' still makes the
# function throw on VerifyUserAttribute — no worse than the empty Default
# it replaces, and the same accepted residual ALLOWED_ORIGIN='*' already
# is.
if [[ -n "${CUSTOM_EMAIL_SENDER_PUBLIC_APP_BASE_URL:-}" ]]; then
  echo "    CustomEmailSenderPublicAppBaseUrl = $CUSTOM_EMAIL_SENDER_PUBLIC_APP_BASE_URL (operator override via CUSTOM_EMAIL_SENDER_PUBLIC_APP_BASE_URL env var)" >&2
else
  CUSTOM_EMAIL_SENDER_PUBLIC_APP_BASE_URL="$ALLOWED_ORIGIN"
  echo "    CustomEmailSenderPublicAppBaseUrl = $CUSTOM_EMAIL_SENDER_PUBLIC_APP_BASE_URL (defaulted from this deploy's own ALLOWED_ORIGIN)" >&2
fi
echo

# ── Step 1: 10-data-auth (RDS + Secrets Manager + Cognito) ───────────────────
# T-1 (design.md §8) — this stack gained a SAM Transform + a build method
# (Metadata: BuildMethod: nodejs24.x, once T-4 adds CustomEmailSender) so it
# can host a function with a real npm dependency (@aws-crypto/client-node)
# NOT bundled in the Lambda runtime. Build BEFORE deploy, the same reason
# and the same pattern as step 3's backend build below: deploying the
# SOURCE template here would skip the dependency-install step entirely
# (there is no node_modules/ to zip without `sam build` running it), and
# once T-4 lands, the function would deploy but fail at first invocation.
# Harmless before T-4 lands too — `sam build` with no
# AWS::Serverless::Function resource yet is a no-op build.
DATA_AUTH_BUILD_DIR="$INFRA_DIR/10-data-auth/.aws-sam/build"
echo "==> [1/4] Building $DATA_AUTH_STACK (sam build → $DATA_AUTH_BUILD_DIR) ..."
sam build \
  --template "$INFRA_DIR/10-data-auth/template.yaml" \
  --build-dir "$DATA_AUTH_BUILD_DIR" \
  --profile "$PROFILE" --region "$REGION"

echo "==> [1/4] Deploying $DATA_AUTH_STACK (RDS + Secrets Manager + Cognito) ..."
sam deploy \
  --template "$DATA_AUTH_BUILD_DIR/template.yaml" \
  --stack-name "$DATA_AUTH_STACK" \
  --parameter-overrides \
    VpcId="$VPC_ID" \
    DevCidr="$DEV_CIDR" \
    CustomEmailSenderKmsGrantPrincipalArn="$CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN" \
    CustomEmailSenderUserPoolId="$CUSTOM_EMAIL_SENDER_USER_POOL_ID" \
    CustomEmailSenderPublicAppBaseUrl="$CUSTOM_EMAIL_SENDER_PUBLIC_APP_BASE_URL" \
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
