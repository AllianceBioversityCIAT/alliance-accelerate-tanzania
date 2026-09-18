#!/usr/bin/env bash
#
# resolve-stack-value.parameter-found-returns-value.case.sh (T-5, guard-unit)
# ---------------------------------------------------------------------------
# design.md §7.1 resolve_stack_value contract: a stack that exists and has
# the queried key returns exit 0 with the value on stdout. Proven against a
# kind="parameter" call (the MailTransport shape) — the ordinary found case,
# establishing the baseline the other cases in this file diverge from.
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
echo "microservice"
exit 0
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

assert_status 0 "$status" "found: exit 0"
assert_contains "microservice" "$output" "found: value printed on stdout"
