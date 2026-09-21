#!/usr/bin/env bash
#
# resolve-setcors-cloudfronturl.absent-frontend-aborts.case.sh
# (T-5, script-integration)
# ---------------------------------------------------------------------------
# design.md §7.1: "set-cors.sh's converted lookup treats 2 as abort, for
# the same reason: it runs only after the frontend stack is deployed."
# Unlike deploy.sh's origin resolution — where a confirmed-absent
# 30-frontend stack is a legitimate bootstrap and announces '*' — the
# SAME confirmed-absent result at set-cors.sh's call site is a BROKEN
# operator sequence (running set-cors.sh before ever deploying the
# frontend) and MUST abort, never fall back to anything.
#
# MAIL_TRANSPORT is preset to bypass the (already-tested, unrelated)
# MailTransport resolution — this case is scoped to CloudFrontUrl only.
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
trap 'rm -f "$AWS_RECIPE"' EXIT

cat > "$AWS_RECIPE" <<EOF2
#!/usr/bin/env bash
case "\$1 \$2" in
  "sts get-caller-identity")
    echo "$STS_ACCOUNT"
    exit 0
    ;;
  "cloudformation describe-stacks")
    echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id accelerate-tz-dev-frontend does not exist" >&2
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
      MAIL_TRANSPORT=microservice \
      bash "$SCRIPTS_DIR/set-cors.sh" </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "set-cors.sh: confirmed-absent frontend stack aborts (never a bootstrap fallback here)"
assert_contains "run deploy.sh first" "$output" "abort names the broken sequence"
assert_not_contains "SAM CALL" "$output" "aborts before ever reaching a sam call"
