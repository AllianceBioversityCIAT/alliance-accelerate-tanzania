#!/usr/bin/env bash
#
# resolve-stack-value.stderr-not-folded-into-value.case.sh (F-1, guard-unit)
# ---------------------------------------------------------------------------
# design.md §7.1 makes resolve_stack_value's contract "the value on stdout".
# An earlier revision captured the AWS CLI with `2>&1`, which folded the
# CLI's stderr into that value. The AWS CLI writes to stderr on SUCCESSFUL
# calls routinely — python deprecation notices, "Unable to locate
# credentials cache", SSO token-refresh chatter — so a call that worked
# returned "<warning text>\n<value>" as the value. deploy.sh passes that
# string straight to `sam deploy --parameter-overrides` and set-cors.sh to
# `--origin`: the resolved CORS origin would have been a sentence.
#
# TWO falsifiers, one per half of the fix:
#   (a) restore `2>&1` on the describe-stacks capture — the success
#       assertion below reddens, because the warning appears in the value.
#   (b) keep the streams split but classify the FAILURE from "$raw"
#       instead of "$err" — the absent-stack assertion below reddens,
#       because the real CLI puts ValidationError on stderr, so $raw is
#       empty and the two-token test never matches: exit 1 (abort) instead
#       of exit 2 (confirmed absent). That is a fail-CLOSED regression
#       rather than a fail-open one, but it would make every genuine
#       bootstrap deploy abort.
#
# Streams are captured SEPARATELY here (>"$out_file" 2>"$err_file"), never
# with 2>&1 — a case that captures both together structurally cannot
# observe the defect it is asserting about.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

# ── Hermeticity precondition (NFR-2) ──────────────────────────────────────
# This case is hermetic ONLY under run-tests.sh, which prepends
# tests/stubs to PATH. Invoked directly, `aws` resolves to the REAL CLI and
# this case asserts against a live CloudFormation stack — it then reddens
# on the wrong assertion for the wrong reason, which is exactly what
# happened while this round's falsifiers were first being run
# (execution.md, "A falsifier run outside the harness is not a
# falsifier"). Checking it here makes that mistake impossible instead of
# merely recorded. Every other case that configures STUB_AWS_SCRIPT has
# the same exposure and could adopt this check; none does yet.
if [[ "$(command -v aws)" != "$TESTS_DIR/stubs/aws" ]]; then
  {
    echo "ASSERT FAIL [hermeticity]: aws does not resolve to the stub."
    echo "  expected: $TESTS_DIR/stubs/aws"
    echo "  actual:   $(command -v aws || echo '<not found>')"
    echo "  Run this case via infra/scripts/tests/run-tests.sh, never directly."
  } >&2
  exit 1
fi

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB
STACK="accelerate-tz-dev-frontend"
QUERY="Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue | [0]"
export STACK QUERY

EXPECTED_URL="https://d111111abcdef8.cloudfront.net"
WARNING="python 3.8 is no longer supported by the AWS CLI"

RECIPE="$(mktemp)"
out_file="$(mktemp "${TMPDIR:-/tmp}/rsv-out.XXXXXX")"
err_file="$(mktemp "${TMPDIR:-/tmp}/rsv-err.XXXXXX")"
trap 'rm -f "$RECIPE" "$out_file" "$err_file"' EXIT

# ── (a) SUCCESS with stderr chatter: the value must be the value alone ────
cat > "$RECIPE" <<EOF2
#!/usr/bin/env bash
echo "$WARNING" >&2
echo "$EXPECTED_URL"
exit 0
EOF2

set +e
env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
    AWS_PROFILE=IBD-DEV \
    STUB_AWS_SCRIPT="$RECIPE" \
    bash -c 'source "$GUARD_LIB"; resolve_stack_value "$STACK" "$QUERY" output' \
    </dev/null >"$out_file" 2>"$err_file"
status=$?
set -e

stdout_content="$(cat "$out_file")"

assert_status 0 "$status" "success with stderr chatter: still exit 0 (found)"

if [[ "$stdout_content" != "$EXPECTED_URL" ]]; then
  {
    echo "ASSERT FAIL [value is the value alone]: expected exactly '$EXPECTED_URL' on stdout, got:"
    printf '%s\n' "$stdout_content" | sed 's/^/  | /'
    echo "  (the AWS CLI's stderr is being folded into the returned value — this is F-1)"
  } >&2
  exit 1
fi

assert_not_contains "$WARNING" "$stdout_content" \
  "no CLI stderr text reaches the value passed to sam/--origin"

# ── (b) FAILURE classified from stderr, where the real CLI writes it ──────
# The absent-stack text goes ONLY to stderr and stdout stays empty, which
# is the real CLI's actual behaviour. A classifier reading the value
# instead of the error text sees nothing to match and aborts.
: > "$out_file"
: > "$err_file"
cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id accelerate-tz-dev-frontend does not exist" >&2
exit 255
EOF2

set +e
env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
    AWS_PROFILE=IBD-DEV \
    STUB_AWS_SCRIPT="$RECIPE" \
    bash -c 'source "$GUARD_LIB"; resolve_stack_value "$STACK" "$QUERY" output' \
    </dev/null >"$out_file" 2>"$err_file"
status=$?
set -e

assert_status 2 "$status" \
  "absent stack announced on stderr only: still classified as confirmed-absent (exit 2), not an abort"
