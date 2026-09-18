#!/usr/bin/env bash
#
# guard-account.collision-foreign-account-with-matching-stack-still-aborts.case.sh
# (T-3, guard-unit)
# ---------------------------------------------------------------------------
# FR-3 clause: "AND IT MUST do so even when a stack of the expected name
# exists there — the collision case is the actual danger." A name check
# cannot see this; only the account id can.
#
# The stub answers BOTH `sts get-caller-identity` (a foreign account) AND
# `cloudformation describe-stacks` (success, naming the expected stack) —
# proving the stack genuinely resolves under the wrong account. The case
# calls describe-stacks itself, independently of assert_account, to make
# that presence observable, then calls assert_account and asserts it still
# aborts on the account mismatch alone.
#
# Falsifier this case exists to catch: assert the stack name instead of
# the account (tasks.md T-3) — a mutated assert_account that treated the
# describe-stacks success as proof of safety would proceed (exit 0) here,
# reddening this case.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
GUARD_SRC="$SCRIPTS_DIR/_guard.sh"

FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT
mkdir -p "$FIXTURE_DIR/scripts"
cp "$GUARD_SRC" "$FIXTURE_DIR/scripts/_guard.sh"
cat > "$FIXTURE_DIR/aws-accounts.conf" <<'EOF2'
IBD-DEV=111111111111
EOF2

GUARD_LIB="$FIXTURE_DIR/scripts/_guard.sh"
export GUARD_LIB

RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
case "$1 $2" in
  "sts get-caller-identity")
    echo "222222222222"
    exit 0
    ;;
  "cloudformation describe-stacks")
    echo "10-data-auth"
    exit 0
    ;;
  *)
    echo "STUB: unexpected aws invocation: $*" >&2
    exit 1
    ;;
esac
EOF2

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$RECIPE" \
      bash -c '
        source "$GUARD_LIB"
        # The collision setup: a stack of the EXPECTED name genuinely
        # resolves, reachable independently of assert_account.
        aws cloudformation describe-stacks --stack-name 10-data-auth \
          --profile "$PROFILE" --region "$REGION" \
          --query "Stacks[0].StackName" --output text
        assert_account
      ' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "collision: assert_account still aborts despite the matching stack name"
assert_contains "10-data-auth" "$output" "the expected-name stack genuinely resolved (the collision setup)"
assert_contains "222222222222" "$output" "abort still names the foreign account, not the stack"
