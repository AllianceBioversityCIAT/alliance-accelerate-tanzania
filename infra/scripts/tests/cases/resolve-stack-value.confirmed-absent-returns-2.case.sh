#!/usr/bin/env bash
#
# resolve-stack-value.confirmed-absent-returns-2.case.sh (T-5, guard-unit)
# ---------------------------------------------------------------------------
# requirements.md FR-5: a genuinely absent stack — CloudFormation's
# describe-stacks call FAILS with BOTH the "ValidationError" token and the
# literal absent-stack phrasing it actually uses, "does not exist" — is
# classified exit 2 ("confirmed absent"), never exit 1 ("abort"). The
# recipe reproduces the real message quoted in
# docs/specs/bugfix/deploy-profile-override/proposal.md §3:
#   "An error occurred (ValidationError) ... Stack with id <name> does
#   not exist"
#
# Contrast with resolve-stack-value.malformed-stack-name-aborts.case.sh —
# same "ValidationError" token, DIFFERENT text — which must abort, not
# return 2. Together the two cases are this contract's positive control:
# proof the classifier discriminates on BOTH tokens, not "ValidationError"
# alone (the falsifier tasks.md names for this exact clause).
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB
STACK="accelerate-tz-dev-frontend"
QUERY="Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue | [0]"
export STACK QUERY

RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id accelerate-tz-dev-frontend does not exist" >&2
exit 255
EOF2

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$RECIPE" \
      bash -c 'source "$GUARD_LIB"; resolve_stack_value "$STACK" "$QUERY" output' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 2 "$status" "confirmed absent (both tokens): exit 2, not an abort"
assert_not_contains "resolve_stack_value: describe-stacks failed" "$output" "the absent path prints no abort error"
