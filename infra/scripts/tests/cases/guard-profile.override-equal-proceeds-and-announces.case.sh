#!/usr/bin/env bash
#
# guard-profile.override-equal-proceeds-and-announces.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# FR-2 clause: GIVEN ALLOW_NON_IBD_DEV_PROFILE equals the effective
# AWS_PROFILE WHEN a script runs THEN it proceeds AND announces the
# non-default target on stderr.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB

# Split-stream capture: the acceptance clause requires the announcement to
# land specifically ON STDERR (FR-2), not merely to be present somewhere in
# the combined output. A 2>&1 merge would still pass if _guard.sh's `>&2`
# redirections were deleted entirely — see the falsifier this case must red
# against. mktemp carries an explicit template so the temp file's location
# is predictable.
err_file="$(mktemp "${TMPDIR:-/tmp}/guard-err.XXXXXX")"
trap 'rm -f "$err_file"' EXIT

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM \
      AWS_PROFILE=MELIA-DEV ALLOW_NON_IBD_DEV_PROFILE=MELIA-DEV \
      bash -c 'source "$GUARD_LIB"; echo "PROFILE=$PROFILE"' \
      </dev/null 2>"$err_file"
)"
status=$?
err="$(cat "$err_file")"
set -e

assert_status 0 "$status" "override equal to AWS_PROFILE: proceeds"
assert_contains "PROFILE=MELIA-DEV" "$output" "override equal: PROFILE resolves to the overridden profile"
assert_contains "MELIA-DEV" "$err" "override equal: announcement names the target profile, on stderr"
assert_contains "ALLOW_NON_IBD_DEV_PROFILE" "$err" "override equal: announcement names the override variable, on stderr"
assert_not_contains "ALLOW_NON_IBD_DEV_PROFILE" "$output" "override equal: announcement must not leak onto stdout"
