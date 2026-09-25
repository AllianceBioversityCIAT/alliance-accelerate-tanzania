#!/usr/bin/env bash
#
# resolve-stack-value.failed-lookup-aborts-never-silent.case.sh (T-5, guard-unit)
# ---------------------------------------------------------------------------
# requirements.md FR-5: a describe-stacks call that FAILS for a reason
# that has nothing to do with the stack's existence — an expired SSO
# token, a throttle, an IAM denial — MUST abort (exit 1), never resolve
# quietly to "absent" (exit 2). This is the Jenkinsfile's own defect
# (design.md §7.4, `2>/dev/null || true`), reproduced here as the
# negative case this helper exists to remove.
#
# Falsifier this case exists to catch (tasks.md T-5): restore
# `2>/dev/null || true` at the describe-stacks call ⇒ this case reds.
# Under that mutation the discarded stderr + forced exit 0 make `raw`
# empty with a SUCCESSFUL status, which (for a kind="parameter" query)
# resolve_stack_value would then read as "None" ⇒ exit 2 — the exact
# fail-open collapse this test exists to catch, not exit 1 as asserted
# below.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB
STACK="accelerate-tz-dev-backend"
QUERY="Stacks[0].Parameters[?ParameterKey=='MailTransport'].ParameterValue | [0]"
export STACK QUERY

RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
echo "An error occurred (ExpiredTokenException) when calling the DescribeStacks operation: The security token included in the request is expired" >&2
exit 254
EOF2

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$RECIPE" \
      bash -c 'source "$GUARD_LIB"; resolve_stack_value "$STACK" "$QUERY" parameter' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "failed lookup (expired token): aborts, never treated as absent"
assert_contains "ExpiredTokenException" "$output" "the real AWS failure text is surfaced, not swallowed"
assert_not_contains "template default" "$output" "never silently falls back on a failed lookup"
