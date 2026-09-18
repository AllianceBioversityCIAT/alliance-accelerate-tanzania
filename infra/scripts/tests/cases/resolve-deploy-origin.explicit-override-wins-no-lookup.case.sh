#!/usr/bin/env bash
#
# resolve-deploy-origin.explicit-override-wins-no-lookup.case.sh
# (T-5, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-4's "AND IT MUST keep an explicit ALLOWED_ORIGIN=...
# winning over the resolved value" clause. Proven with the marker
# technique (design.md §7.2's own recommendation, already used by
# wire.readonly-scripts-make-no-sts-call): the aws stub touches a marker
# file ONLY when invoked with a describe-stacks call whose query mentions
# CloudFrontUrl, so "the marker was never touched" proves the origin
# LOOKUP never fired at all — not merely that its result was overridden.
#
# MailTransport resolution is deliberately left UNCONFIGURED (no matching
# stub branch) so deploy.sh aborts shortly after printing the
# ALLOWED_ORIGIN announcement — this case does not need the run to reach
# completion, only that the marker stays untouched before it exits;
# `|| true` absorbs that expected non-zero status.
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

MARKER="$(mktemp -u)"
AWS_RECIPE="$(mktemp)"
trap 'rm -f "$AWS_RECIPE" "$MARKER"' EXIT

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
        touch "$MARKER"
        echo "https://should-never-be-used.cloudfront.net"
        exit 0
        ;;
      *)
        echo "STUB: unexpected describe-stacks (not CloudFrontUrl): \$*" >&2
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

output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION \
      -u STUB_AWS_SCRIPT -u STUB_SAM_SCRIPT -u ALLOWED_ORIGIN -u MAIL_TRANSPORT \
      -u VPC_ID -u DEV_CIDR \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$AWS_RECIPE" \
      ALLOWED_ORIGIN="https://operator-chosen.example.com" \
      VPC_ID=vpc-test1234 \
      DEV_CIDR=203.0.113.7/32 \
      bash "$SCRIPTS_DIR/deploy.sh" </dev/null 2>&1
)" || true

assert_contains "AllowedOrigin = https://operator-chosen.example.com (operator override via ALLOWED_ORIGIN env var)" "$output" "explicit override is announced and used verbatim"
if [[ -e "$MARKER" ]]; then
  echo "ASSERT FAIL [explicit override skips the lookup entirely]: marker exists — CloudFrontUrl was queried" >&2
  exit 1
fi
