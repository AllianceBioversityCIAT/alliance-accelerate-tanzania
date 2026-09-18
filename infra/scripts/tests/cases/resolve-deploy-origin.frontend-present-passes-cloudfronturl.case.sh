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
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
INFRA_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"

# Read the expected account for IBD-DEV from the real, committed conf file
# at run time — never as a literal in this test's own source (FR-3;
# guard-account.no-account-id-literal-in-scripts greps this very
# directory tree and must not find one).
EXPECTED_ACCOUNT="$(awk -F= '$1=="IBD-DEV"{print $2; exit}' "$INFRA_DIR/aws-accounts.conf")"

AWS_RECIPE="$(mktemp)"
SAM_RECIPE="$(mktemp)"
trap 'rm -f "$AWS_RECIPE" "$SAM_RECIPE"' EXIT

cat > "$AWS_RECIPE" <<EOF2
#!/usr/bin/env bash
args="\$*"
case "\$1 \$2" in
  "sts get-caller-identity")
    echo "$EXPECTED_ACCOUNT"
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
