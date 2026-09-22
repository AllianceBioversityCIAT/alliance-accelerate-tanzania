#!/usr/bin/env bash
#
# resolve-deploy-origin.frontend-absent-announces-star-on-stderr.case.sh
# (T-5, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-4's second clause: GIVEN no 30-frontend stack exists
# WHEN deploy.sh runs THEN it passes '*' AND prints to stderr that it is
# doing so and why. Split-stream capture (the T-2 lesson, execution.md
# "attempt 1" — a merged 2>&1 capture would still pass if the `>&2` were
# deleted from deploy.sh entirely): the announcement is asserted present
# on the STDERR-only stream and absent from the STDOUT-only stream.
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
ERR_FILE="$(mktemp "${TMPDIR:-/tmp}/deploy-origin-err.XXXXXX")"
trap 'rm -f "$AWS_RECIPE" "$SAM_RECIPE" "$ERR_FILE"' EXIT

cat > "$AWS_RECIPE" <<EOF2
#!/usr/bin/env bash
args="\$*"
case "\$1 \$2" in
  "sts get-caller-identity")
    echo "$STS_ACCOUNT"
    exit 0
    ;;
  "cloudformation describe-stacks")
    case "\$args" in
      *CloudFrontUrl*)
        echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id accelerate-tz-dev-frontend does not exist" >&2
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

cat > "$SAM_RECIPE" <<'EOF2'
#!/usr/bin/env bash
echo "SAM CALL: $*"
exit 0
EOF2

set +e
stdout="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION \
      -u STUB_AWS_SCRIPT -u STUB_SAM_SCRIPT -u ALLOWED_ORIGIN -u MAIL_TRANSPORT \
      -u VPC_ID -u DEV_CIDR \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$AWS_RECIPE" \
      STUB_SAM_SCRIPT="$SAM_RECIPE" \
      MAIL_TRANSPORT=microservice \
      VPC_ID=vpc-test1234 \
      DEV_CIDR=203.0.113.7/32 \
      bash "$SCRIPTS_DIR/deploy.sh" </dev/null 2>"$ERR_FILE"
)"
status=$?
stderr="$(cat "$ERR_FILE")"
set -e

assert_status 0 "$status" "absent frontend stack: deploy.sh still runs to completion"
assert_contains "AllowedOrigin=*" "$stdout" "'*' is literally what's passed as AllowedOrigin"
assert_contains "does not exist yet" "$stderr" "bootstrap fallback is announced, and why, ON STDERR"
assert_not_contains "does not exist yet" "$stdout" "the announcement is not ALSO on stdout"
