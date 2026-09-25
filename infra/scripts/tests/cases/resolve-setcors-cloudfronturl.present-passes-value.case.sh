#!/usr/bin/env bash
#
# resolve-setcors-cloudfronturl.present-passes-value.case.sh
# (T-5, script-integration)
# ---------------------------------------------------------------------------
# The success path for set-cors.sh's converted CloudFrontUrl lookup: a
# genuinely present frontend stack resolves its CloudFrontUrl and that
# value is what gets passed as AllowedOrigin to the backend redeploy —
# sanity coverage for the conversion (jq extraction → resolve_stack_value),
# proving the migration did not silently break the ordinary case.
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
case "\$1 \$2" in
  "sts get-caller-identity")
    echo "$STS_ACCOUNT"
    exit 0
    ;;
  "cloudformation describe-stacks")
    echo "https://dabc123.cloudfront.net"
    exit 0
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
      -u STUB_AWS_SCRIPT -u STUB_SAM_SCRIPT -u CLOUDFRONT_URL -u MAIL_TRANSPORT \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$AWS_RECIPE" \
      STUB_SAM_SCRIPT="$SAM_RECIPE" \
      MAIL_TRANSPORT=microservice \
      bash "$SCRIPTS_DIR/set-cors.sh" </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "set-cors.sh: present frontend stack runs to completion"
assert_contains "AllowedOrigin=https://dabc123.cloudfront.net" "$output" "the resolved CloudFrontUrl is literally what's passed as AllowedOrigin"
