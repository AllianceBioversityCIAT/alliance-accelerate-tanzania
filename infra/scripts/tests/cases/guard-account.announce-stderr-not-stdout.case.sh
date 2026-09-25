#!/usr/bin/env bash
#
# guard-account.announce-stderr-not-stdout.case.sh (T-8, guard-unit)
# ---------------------------------------------------------------------------
# requirements.md FR-3′ clause: the account announcement MUST print to
# stderr, never stdout. Split-stream capture — the same technique
# guard-profile.override-equal-proceeds-and-announces.case.sh (T-2) uses
# for FR-2's own announcement: a 2>&1 merge would still pass if
# announce_account's `>&2` redirections were deleted entirely, so stdout
# and stderr are captured into separate files.
#
# Falsifier: send the announcement to stdout (drop `>&2`) ⇒ this case reds.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB

RECIPE="$(mktemp)"
out_file="$(mktemp "${TMPDIR:-/tmp}/announce-out.XXXXXX")"
err_file="$(mktemp "${TMPDIR:-/tmp}/announce-err.XXXXXX")"
trap 'rm -f "$RECIPE" "$out_file" "$err_file"' EXIT

cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
case "$1 $2" in
  "sts get-caller-identity")
    echo "111111111111"
    exit 0
    ;;
  *)
    echo "STUB: unexpected aws invocation: $*" >&2
    exit 1
    ;;
esac
EOF2

set +e
env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
    AWS_PROFILE=IBD-DEV \
    STUB_AWS_SCRIPT="$RECIPE" \
    bash -c 'source "$GUARD_LIB"; announce_account' \
    </dev/null >"$out_file" 2>"$err_file"
status=$?
set -e

stdout_content="$(cat "$out_file")"
stderr_content="$(cat "$err_file")"

assert_status 0 "$status" "announce_account: proceeds"
assert_contains "111111111111" "$stderr_content" "the announcement lands on stderr"
assert_not_contains "111111111111" "$stdout_content" "the announcement must not leak onto stdout"
