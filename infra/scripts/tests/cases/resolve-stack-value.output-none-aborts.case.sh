#!/usr/bin/env bash
#
# resolve-stack-value.output-none-aborts.case.sh (T-5, guard-unit)
# ---------------------------------------------------------------------------
# design.md §7.1: for a kind="output" query, "None" (the stack exists but
# has no such Output key) does NOT fold into "absent". It ABORTS — a
# frontend stack that exists but exports no CloudFrontUrl is a BROKEN
# deployment, not a bootstrap, and treating it as absent would let
# deploy.sh announce '*' for it, contradicting FR-4's "only where the
# stack genuinely does not exist".
#
# Falsifier this case exists to catch: folding output-None into the same
# exit-2 path parameter-None uses (tasks.md T-5's "None on an Output query
# ⇒ abort" clause) — that mutation would turn this case's expected exit 1
# into an observed 2, reddening it.
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
echo "None"
exit 0
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

assert_status 1 "$status" "output query, None: aborts (exit 1), never folded into absent"
assert_contains "broken deployment" "$output" "abort names why: a broken deployment, not an absent stack"
