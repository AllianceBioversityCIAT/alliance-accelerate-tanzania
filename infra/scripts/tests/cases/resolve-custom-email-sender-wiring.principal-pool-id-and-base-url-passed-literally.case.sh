#!/usr/bin/env bash
#
# resolve-custom-email-sender-wiring.principal-pool-id-and-base-url-passed-literally.case.sh
# (forgot-password-delivery T-6, script-integration)
# ---------------------------------------------------------------------------
# tasks.md §2 / T-6 attempt 2, Finding 7: nothing in this repo's test suite
# previously exercised T-6's own block in deploy.sh (the resolution of
# CustomEmailSenderKmsGrantPrincipalArn, CustomEmailSenderUserPoolId and
# CustomEmailSenderPublicAppBaseUrl) — the pre-existing 49/50 green run
# carried NO information about that block, because every case that reached
# it stubbed `sts get-caller-identity` with a flat account id good enough
# to satisfy a `-z`/`None` check regardless of `--query`.
#
# This case runs the REAL, unmodified deploy.sh all the way to the
# `sam deploy` call for `accelerate-tz-dev-data-auth` (the FIRST stack) and
# asserts the resolved principal ARN, pool id, and public base URL are
# LITERALLY what reach that call's `--parameter-overrides` — not merely
# that a lookup happened (the KZ-002 shape this whole suite exists to stop
# producing; same method as the resolve-deploy-origin family).
#
# ALLOWED_ORIGIN is preset via env (explicit override) so
# CustomEmailSenderPublicAppBaseUrl's own default-from-ALLOWED_ORIGIN
# wiring (design.md's Finding 6) has a known, asserted value to inherit,
# without this case also having to stub a frontend-stack lookup.
# MAIL_TRANSPORT/VPC_ID/DEV_CIDR are preset the same way the
# resolve-deploy-origin family already does, to keep this case scoped to
# T-6's own block.
#
# The `sts get-caller-identity` recipe branches on `--query` (Arn vs.
# anything else) — unlike the flat, query-blind recipe this repo used to
# share across cases, which is exactly what let a malformed principal
# slide through T-6 attempt 1 unnoticed. This case's aws stub also has NO
# catch-all success branch: any describe-stacks/sts call this case did not
# anticipate fails loudly instead of silently returning something usable,
# so a future change that adds an unexpected lookup is caught here too.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

# A well-formed IAM USER ARN — not a session ARN — so it passes T-6's own
# shape guard (Finding 5). Uses the SAME allow-listed placeholder account
# id ("000000000001") every resolve-*.case.sh/wire.*.case.sh fixture
# already shares (guard-account.no-account-id-literal-in-infra's
# allow-list) — a fresh 12-digit literal here would itself trip that scan.
DEPLOYING_PRINCIPAL_ARN="arn:aws:iam::000000000001:user/qa-deployer"
RESOLVED_POOL_ID="eu-west-1_AbCdEfGhI"
OVERRIDE_ALLOWED_ORIGIN="https://operator-chosen.example.com"

AWS_RECIPE="$(mktemp)"
SAM_RECIPE="$(mktemp)"
trap 'rm -f "$AWS_RECIPE" "$SAM_RECIPE"' EXIT

cat > "$AWS_RECIPE" <<EOF2
#!/usr/bin/env bash
args="\$*"
case "\$1 \$2" in
  "sts get-caller-identity")
    case "\$args" in
      *Arn*)
        echo "$DEPLOYING_PRINCIPAL_ARN"
        ;;
      *)
        echo "000000000001"
        ;;
    esac
    exit 0
    ;;
  "cloudformation describe-stacks")
    case "\$args" in
      *UserPoolId*)
        echo "$RESOLVED_POOL_ID"
        exit 0
        ;;
      *)
        echo "STUB: unexpected describe-stacks (not UserPoolId): \$*" >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "STUB: unexpected aws invocation: \$*" >&2
    exit 1
    ;;
esac
EOF2

cat > "$SAM_RECIPE" <<'EOF2'
#!/usr/bin/env bash
echo "SAM CALL: $*"
exit 0
EOF2

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION \
      -u STUB_AWS_SCRIPT -u STUB_SAM_SCRIPT -u ALLOWED_ORIGIN -u MAIL_TRANSPORT \
      -u VPC_ID -u DEV_CIDR \
      -u CUSTOM_EMAIL_SENDER_KMS_GRANT_PRINCIPAL_ARN \
      -u CUSTOM_EMAIL_SENDER_USER_POOL_ID \
      -u CUSTOM_EMAIL_SENDER_PUBLIC_APP_BASE_URL \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$AWS_RECIPE" \
      STUB_SAM_SCRIPT="$SAM_RECIPE" \
      ALLOWED_ORIGIN="$OVERRIDE_ALLOWED_ORIGIN" \
      MAIL_TRANSPORT=microservice \
      VPC_ID=vpc-test1234 \
      DEV_CIDR=203.0.113.7/32 \
      bash "$SCRIPTS_DIR/deploy.sh" </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "T-6 wiring: deploy.sh runs to completion"
assert_contains "CustomEmailSenderKmsGrantPrincipalArn=$DEPLOYING_PRINCIPAL_ARN" "$output" \
  "the resolved deploying-principal ARN is literally what's passed in --parameter-overrides"
assert_contains "CustomEmailSenderUserPoolId=$RESOLVED_POOL_ID" "$output" \
  "the resolved pool id is literally what's passed in --parameter-overrides"
assert_contains "CustomEmailSenderPublicAppBaseUrl=$OVERRIDE_ALLOWED_ORIGIN" "$output" \
  "PublicAppBaseUrl defaults from this deploy's own (already-resolved) ALLOWED_ORIGIN"
