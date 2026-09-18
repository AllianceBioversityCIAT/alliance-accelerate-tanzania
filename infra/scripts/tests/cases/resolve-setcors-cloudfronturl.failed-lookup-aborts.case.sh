#!/usr/bin/env bash
#
# resolve-setcors-cloudfronturl.failed-lookup-aborts.case.sh
# (T-5, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-5's abort-on-failure clause, at set-cors.sh's
# converted CloudFrontUrl call site. A failed describe-stacks call
# (expired token) must abort — this call site already hard-failed on
# every non-success case before T-5 (requirements.md §2.1: "❌ absent —
# it hard-fails, so there is no defect"), so this case is regression
# coverage for the CONVERSION, proving the migration to resolve_stack_value
# preserved that hard-fail behaviour rather than accidentally loosening it.
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
trap 'rm -f "$AWS_RECIPE"' EXIT

cat > "$AWS_RECIPE" <<EOF2
#!/usr/bin/env bash
case "\$1 \$2" in
  "sts get-caller-identity")
    echo "$EXPECTED_ACCOUNT"
    exit 0
    ;;
  "cloudformation describe-stacks")
    echo "An error occurred (ExpiredTokenException) when calling the DescribeStacks operation: The security token included in the request is expired" >&2
    exit 254
    ;;
  *)
    echo "STUB: unexpected aws invocation: \$*" >&2
    exit 1
    ;;
esac
EOF2

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION \
      -u STUB_AWS_SCRIPT -u STUB_SAM_SCRIPT -u CLOUDFRONT_URL -u MAIL_TRANSPORT \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$AWS_RECIPE" \
      MAIL_TRANSPORT=microservice \
      bash "$SCRIPTS_DIR/set-cors.sh" </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "set-cors.sh: failed CloudFrontUrl lookup aborts"
assert_contains "ExpiredTokenException" "$output" "the real AWS failure text is surfaced, not swallowed"
