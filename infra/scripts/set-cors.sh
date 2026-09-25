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
#   MAIL_TRANSPORT=microservice ./infra/scripts/set-cors.sh  # preserve the current transport
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

BACKEND_STACK="${BACKEND_STACK:-accelerate-tz-dev-backend}"
FRONTEND_STACK="${FRONTEND_STACK:-accelerate-tz-dev-frontend}"
DATA_AUTH_STACK="${DATA_AUTH_STACK:-accelerate-tz-dev-data-auth}"

# Mail transport for THIS DEPLOY TARGET — "microservice" is the only value
# infra/20-backend/template.yaml's MailTransport parameter accepts (see that
# parameter's Description for why). The CODE accepts a second value,
# "no-op" — backend/src/mail/mail.config.ts is the source of truth for that
# — but "no-op" is the mandated LOCAL default, not a valid override here
# (the guard below rejects it same as any other unsupported value). MUST
# be passed explicitly on every backend deploy: SAM sends UsePreviousValue
# for any parameter absent from --parameter-overrides, so omitting the
# parameter override entirely would let this CORS-lock redeploy silently
# revert the transport (design.md §7.3). set-cors.sh is the routine
# follow-up to every frontend deploy, so this is not a rare path.
#
# ⚠️ A hardcoded `${MAIL_TRANSPORT:-microservice}` default would repeat, on
# a smaller scale, the exact class of hazard Phase A's rollout was built to
# avoid: a value baked into this script rather than read from the live
# stack can drift from what is actually deployed and report success anyway
# (T-8 review, Issue 1 — originally found against a hardcoded "ses"
# fallback, before Phase B removed that value from the accepted set
# entirely). So: an explicit MAIL_TRANSPORT env var always wins (operator
# override); otherwise resolve the CURRENT value from the deployed stack —
# the same pattern already used a few lines below to resolve CloudFrontUrl,
# for the same reason: read the live value instead of asserting one. Only a
# stack that does not exist yet falls back to "microservice" — the
# template's own Default as of Phase B (T-10); "ses" is no longer a valid
# fallback here, since the code (mail.config.ts) rejects it unconditionally.
if [[ -n "${MAIL_TRANSPORT:-}" ]]; then
  echo "==> MailTransport = $MAIL_TRANSPORT (operator override via MAIL_TRANSPORT env var)"
else
  # Delegates to the shared resolve_stack_value helper (_guard.sh, T-5,
  # NFR-4) instead of a local copy of the same classification — this used
  # to duplicate the block deploy.sh also carried. That collapse TIGHTENS
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
# keyed only to "ses" and only die at the backend changeset with a
# confusing parameter-constraint error. That is exactly the "deploy reports
# success, every send then throws with no deploy-time signal" hazard this
# script exists to prevent, just relocated one step later. Fail loud, fail
# here, before any AWS call that could otherwise be mistaken for progress.
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
BACKEND_TEMPLATE="$INFRA_DIR/20-backend/template.yaml"

echo "==> ACCELERATE Tanzania CORS lock — profile '$PROFILE', region '$REGION'."
echo

# ── Resolve CloudFrontUrl from the frontend stack (override via CLOUDFRONT_URL) ─
# Converted to the shared resolve_stack_value helper (_guard.sh, T-5, NFR-4)
# for uniformity with deploy.sh's origin resolution — this call site already
# hard-failed on every non-success case before this change, so there was no
# silent-fallback defect here to fix (requirements.md §2.1). What DOES change:
# a stack that exists but returns "None" for CloudFrontUrl (kind=output)
# still aborts, exactly as before; and a CONFIRMED ABSENT frontend stack
# (exit 2) is now ALSO an abort, not the announced-bootstrap "*" that
# deploy.sh's origin resolution uses — set-cors.sh runs only AFTER the
# frontend stack is deployed, so an absent frontend stack here is a broken
# operator sequence, not a legitimate bootstrap (design.md §7.1).
if [[ -n "${CLOUDFRONT_URL:-}" ]]; then
  echo "==> Using CLOUDFRONT_URL from env: $CLOUDFRONT_URL"
else
  echo "==> Resolving CloudFrontUrl from stack '$FRONTEND_STACK' ..."
  if CLOUDFRONT_URL="$(resolve_stack_value "$FRONTEND_STACK" \
      "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue | [0]" \
      output)"; then
    :
  else
    rc=$?
    case "$rc" in
      2)
        echo "ERROR: stack '$FRONTEND_STACK' does not exist — run deploy.sh first." >&2
        echo "       set-cors.sh locks CORS on an ALREADY-DEPLOYED frontend; an" >&2
        echo "       absent stack here is a broken sequence, not a bootstrap." >&2
        exit 1
        ;;
      *)
        echo "ERROR: could not resolve CloudFrontUrl from stack '$FRONTEND_STACK'." >&2
        exit 1
        ;;
    esac
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
