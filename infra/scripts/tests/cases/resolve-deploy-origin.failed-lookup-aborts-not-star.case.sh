#!/usr/bin/env bash
#
# resolve-deploy-origin.failed-lookup-aborts-not-star.case.sh
# (T-5, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-4's "BUT it must NOT write '*' when the stack exists
# but the lookup FAILED" clause, and FR-5's abort-on-failure clause,
# demonstrated IN SITU in deploy.sh. The describe-stacks call for
# CloudFrontUrl fails with an access-denied error — a live credential
# problem, not an absent stack — and deploy.sh MUST abort before ever
# reaching a `sam deploy` call, never silently writing AllowedOrigin='*'.
#
# The aws stub has NO recipe branch answering a `sam` invocation at all —
# deliberate: if deploy.sh reached ANY sam call, this test would not need
# to assert that fact explicitly, because SAM_RECIPE is left unconfigured
# and the sam stub's own "unconfigured" exit 127 would make the run fail
# for a DIFFERENT reason than the one asserted below, silently weakening
# this case. So the case also asserts the specific abort message,
# pinning the failure to the origin resolution itself.
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
args="\$*"
case "\$1 \$2" in
  "sts get-caller-identity")
    echo "$EXPECTED_ACCOUNT"
    exit 0
    ;;
  "cloudformation describe-stacks")
    case "\$args" in
      *CloudFrontUrl*)
        echo "An error occurred (AccessDenied) when calling the DescribeStacks operation: User is not authorized to perform: cloudformation:DescribeStacks" >&2
        exit 255
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

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION \
      -u STUB_AWS_SCRIPT -u STUB_SAM_SCRIPT -u ALLOWED_ORIGIN -u MAIL_TRANSPORT \
      -u VPC_ID -u DEV_CIDR \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$AWS_RECIPE" \
      MAIL_TRANSPORT=microservice \
      VPC_ID=vpc-test1234 \
      DEV_CIDR=203.0.113.7/32 \
      bash "$SCRIPTS_DIR/deploy.sh" </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "failed origin lookup: deploy.sh aborts non-zero"
assert_contains "AccessDenied" "$output" "the real AWS failure text is surfaced"
assert_not_contains "AllowedOrigin=*" "$output" "never silently writes '*' on a failed lookup"
assert_not_contains "SAM CALL" "$output" "aborts before ever reaching a sam call"
