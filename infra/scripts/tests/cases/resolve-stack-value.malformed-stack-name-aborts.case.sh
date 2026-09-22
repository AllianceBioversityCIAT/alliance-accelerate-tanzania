#!/usr/bin/env bash
#
# resolve-stack-value.malformed-stack-name-aborts.case.sh (T-5, guard-unit)
# ---------------------------------------------------------------------------
# requirements.md FR-5's "BUT it must NOT classify on ValidationError
# alone" clause. A MALFORMED stack name — CloudFormation rejects the name
# itself as ill-formed — also carries the "ValidationError" token, but
# NEVER the absent-stack phrasing "does not exist" (CloudFormation is
# refusing the name, not reporting that a resource by that name is
# missing). This MUST abort (exit 1), not resolve to exit 2.
#
# ⚠️ NOT the accepted residual (tasks.md T-5, judgment.md V-2): this is a
# stack name CloudFormation itself calls invalid (illegal characters,
# length), a different failure text from the "does not exist" a
# WELL-FORMED-but-misspelled name would produce. That latter case is
# genuinely indistinguishable from a real absence and is deliberately NOT
# tested here or anywhere else in this suite — no test in this file
# claims to catch a well-formed typo, because no error-text rule can.
#
# Falsifier: classify on `ValidationError` alone (drop the second token)
# ⇒ this case reds, because the mutated matcher would treat this
# malformed-name error as "confirmed absent" (exit 2) instead of
# aborting (exit 1).
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB
STACK="bad stack name!!"
QUERY="Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue | [0]"
export STACK QUERY

RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
echo "An error occurred (ValidationError) when calling the DescribeStacks operation: 1 validation error detected: Value 'bad stack name!!' at 'stackName' failed to satisfy constraint: Member must satisfy regular expression pattern: [a-zA-Z][-a-zA-Z0-9]*" >&2
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

assert_status 1 "$status" "malformed stack name: ValidationError alone (no 'does not exist') aborts, is not read as absent"
assert_contains "failed to satisfy constraint" "$output" "the real AWS error text is surfaced on the abort path"
