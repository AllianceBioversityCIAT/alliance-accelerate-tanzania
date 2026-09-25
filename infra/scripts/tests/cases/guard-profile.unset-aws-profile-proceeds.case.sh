#!/usr/bin/env bash
#
# guard-profile.unset-aws-profile-proceeds.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# FR-1 clause: GIVEN AWS_PROFILE is unset WHEN any script runs THEN it
# targets IBD-DEV and proceeds. Uses `env -u AWS_PROFILE` (FP-2) rather than
# assuming the shell running this suite has none — this machine's operator
# shell commonly exports AWS_PROFILE, so an assumption-based unset would be
# testing the ambient value, not a genuine absence.
#
# Guard-unit: sources _guard.sh inside a nested `bash -c` subshell, never at
# this case's own top level — a sourced `exit` would otherwise end this
# case script before its assertions run (design.md §7.1).
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION \
      bash -c 'source "$GUARD_LIB"; echo "PROFILE=$PROFILE"; echo "REGION=$REGION"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "unset AWS_PROFILE: floor proceeds"
assert_contains "PROFILE=IBD-DEV" "$output" "unset AWS_PROFILE: PROFILE resolves to IBD-DEV"
assert_contains "REGION=eu-west-1" "$output" "unset AWS_PROFILE: REGION resolves to eu-west-1"
