#!/usr/bin/env bash
#
# guard-profile.message-names-both-profiles.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# FR-1 clause: AND IT MUST name both the found profile and the expected
# one, so the operator can tell which is wrong.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB

# Split-stream capture: the acceptance clause requires the mismatch message
# to be printed TO STDERR (FR-1), not merely to be present somewhere in the
# combined output. A 2>&1 merge would still pass if _guard.sh's `>&2`
# redirections on the abort path were deleted entirely — see the falsifier
# this case must red against. mktemp carries an explicit template so the
# temp file's location is predictable.
err_file="$(mktemp "${TMPDIR:-/tmp}/guard-err.XXXXXX")"
trap 'rm -f "$err_file"' EXIT

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM \
      AWS_PROFILE=MELIA-DEV \
      bash -c 'source "$GUARD_LIB"' \
      </dev/null 2>"$err_file"
)"
status=$?
err="$(cat "$err_file")"
set -e

assert_status 1 "$status" "foreign profile: aborts"
assert_contains "MELIA-DEV" "$err" "message names the found profile, on stderr"
assert_contains "IBD-DEV" "$err" "message names the expected profile, on stderr"
assert_not_contains "MELIA-DEV" "$output" "abort message must not leak onto stdout"
assert_not_contains "IBD-DEV" "$output" "abort message must not leak onto stdout"
