#!/usr/bin/env bash
#
# resolve-mailtransport.set-cors-sh-two-token-classification.case.sh
# (T-5, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-5's last clause + NFR-4, applied to set-cors.sh's
# MailTransport call site — the second of the two duplicates NFR-4
# collapses. Same shape as the deploy.sh case in this same directory: a
# malformed BACKEND_STACK name carries "ValidationError" but never "does
# not exist", and MUST now abort rather than resolve to "microservice".
#
# CLOUDFRONT_URL is preset to bypass the (unrelated, and in set-cors.sh
# LATER-running) origin resolution — this case never needs to reach it,
# since MailTransport resolution runs first in set-cors.sh and aborts
# before the CloudFrontUrl block is ever reached.
#
# Falsifier: leave a one-token match at this call site ⇒ reds, for the
# same reason as the deploy.sh case.
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
    echo "An error occurred (ValidationError) when calling the DescribeStacks operation: 1 validation error detected: Value at 'stackName' failed to satisfy constraint" >&2
    exit 255
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
      CLOUDFRONT_URL="https://example.cloudfront.net" \
      bash "$SCRIPTS_DIR/set-cors.sh" </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "set-cors.sh: malformed-BACKEND_STACK ValidationError aborts, is not read as 'stack not found'"
assert_not_contains "template default" "$output" "set-cors.sh: never silently falls back to microservice on this error"
assert_contains "could not resolve MailTransport" "$output" "set-cors.sh: abort message names the resolution that failed"
