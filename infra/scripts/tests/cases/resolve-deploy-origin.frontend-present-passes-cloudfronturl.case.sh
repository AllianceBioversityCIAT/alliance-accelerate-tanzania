#!/usr/bin/env bash
#
# resolve-deploy-origin.frontend-present-passes-cloudfronturl.case.sh
# (T-5, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-4's first clause: GIVEN a 30-frontend stack exporting
# CloudFrontUrl WHEN deploy.sh runs THEN it passes that URL as
# AllowedOrigin. Runs the REAL, unmodified deploy.sh (DD-2) all the way to
# the backend `sam deploy` call and asserts the resolved URL is literally
# what gets passed in --parameter-overrides — not merely that a lookup
# happened, which is the KZ-002 shape this spec exists to stop producing.
#
# MAIL_TRANSPORT and VPC_ID/DEV_CIDR are preset via env so deploy.sh takes
# their explicit-override branches and never calls aws/curl for THOSE
# values — this case is scoped to the ALLOWED_ORIGIN resolution only.
#
# T-6 attempt 2 (Finding 5): this run also reaches T-6's own
# CustomEmailSenderKmsGrantPrincipalArn resolution, which now applies a
# shape guard requiring a well-formed IAM user/role ARN — a flat account
# id (the STS_ACCOUNT value below) no longer satisfies it regardless of
# `--query`. The sts get-caller-identity branch below now answers
# differently for `--query Arn` vs `--query Account`, matching what the
# real CLI actually returns per query, rather than ignoring `--query`
# entirely as it did before.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
# announce_account (FR-3′) has nothing to compare an account
# against any more — any well-formed value works here. Picked to look
# nothing like a real account id (guard-account.no-account-id-literal-in-infra
# greps this whole directory tree and must not find one).
STS_ACCOUNT="000000000001"

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
        echo "arn:aws:iam::000000000001:user/test-deployer"
        ;;
      *)
        echo "$STS_ACCOUNT"
        ;;
    esac
    exit 0
    ;;
  "cloudformation describe-stacks")
    case "\$args" in
      *CloudFrontUrl*)
        echo "https://dabc123.cloudfront.net"
        exit 0
        ;;
      *)
        echo "[]"
        exit 0
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
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$AWS_RECIPE" \
      STUB_SAM_SCRIPT="$SAM_RECIPE" \
      MAIL_TRANSPORT=microservice \
      VPC_ID=vpc-test1234 \
      DEV_CIDR=203.0.113.7/32 \
      bash "$SCRIPTS_DIR/deploy.sh" </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "frontend present: deploy.sh runs to completion"
assert_contains "AllowedOrigin=https://dabc123.cloudfront.net" "$output" "the resolved CloudFrontUrl is literally what's passed as AllowedOrigin"
assert_contains "AllowedOrigin = https://dabc123.cloudfront.net (resolved from live stack" "$output" "origin resolution announces where the value came from"
