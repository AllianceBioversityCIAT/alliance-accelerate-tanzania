#!/usr/bin/env bash
#
# resolve-mailtransport.deploy-sh-two-token-classification.case.sh
# (T-5, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-5's last clause + NFR-4: deploy.sh's MailTransport
# resolution, migrated onto resolve_stack_value, is now TIGHTER than
# before — it used to accept a bare "ValidationError" as "stack not
# found" (proposal.md §2.1: "Both existing copies match *ValidationError*
# alone"). A malformed BACKEND_STACK name that CloudFormation rejects as
# ill-formed still carries the "ValidationError" token but NEVER the
# absent-stack phrasing "does not exist", so it MUST now abort instead of
# silently resolving to the "microservice" default.
#
# ALLOWED_ORIGIN is preset to bypass the (unrelated) origin resolution
# entirely, scoping this case to MailTransport only.
#
# Falsifier: leave a one-token ("ValidationError" alone) match at this
# call site ⇒ this case reds — the old behaviour would read this exact
# error as "stack not found" and resolve MAIL_TRANSPORT="microservice",
# so deploy.sh would proceed (and eventually fail later, for an unrelated
# reason — a missing sam stub — never with THIS abort message).
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
      -u STUB_AWS_SCRIPT -u STUB_SAM_SCRIPT -u ALLOWED_ORIGIN -u MAIL_TRANSPORT \
      -u VPC_ID -u DEV_CIDR \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$AWS_RECIPE" \
      ALLOWED_ORIGIN="https://example.cloudfront.net" \
      bash "$SCRIPTS_DIR/deploy.sh" </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "deploy.sh: malformed-BACKEND_STACK ValidationError aborts, is not read as 'stack not found'"
assert_not_contains "template default" "$output" "deploy.sh: never silently falls back to microservice on this error"
assert_contains "could not resolve MailTransport" "$output" "deploy.sh: abort message names the resolution that failed"
