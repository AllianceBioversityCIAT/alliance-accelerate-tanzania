#!/usr/bin/env bash
#
# resolve-stack-value.parameter-none-returns-2.case.sh (T-5, guard-unit)
# ---------------------------------------------------------------------------
# design.md §7.1 "Success-with-None": a stack that EXISTS but has no such
# Parameter key returns exit 0 and the literal string "None" from the AWS
# CLI. For a kind="parameter" query this is folded into "absent" (exit 2,
# nothing on stdout) — a stack predating the parameter is the same
# bootstrap case as a stack that does not exist yet at all. Contrast with
# resolve-stack-value.output-none-aborts.case.sh, where the SAME "None"
# answer, for kind="output", must instead ABORT.
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
echo "None"
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

assert_status 2 "$status" "parameter query, None: absent (exit 2), not an abort"
assert_not_contains "microservice" "$output" "no stray value printed on the absent path"
