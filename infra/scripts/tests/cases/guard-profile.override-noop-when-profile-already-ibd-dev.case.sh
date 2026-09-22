#!/usr/bin/env bash
#
# guard-profile.override-noop-when-profile-already-ibd-dev.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# KZ-007 interaction case: override set + unset AWS_PROFILE. The floor and
# the override are a conjunctive constraint set — satisfying each clause in
# isolation does not prove the combination is safe. Here the effective
# profile is already IBD-DEV (AWS_PROFILE unset), so ALLOW_NON_IBD_DEV_PROFILE
# being set to something else must be a pure no-op: no abort, and no
# spurious "proceeding against non-default target" announcement, because
# there is no divergence to override.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB

set +e
output="$(
  env -u AWS_PROFILE -u CONFIRM \
      ALLOW_NON_IBD_DEV_PROFILE=SOMETHING-ELSE \
      bash -c 'source "$GUARD_LIB"; echo "PROFILE=$PROFILE"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "override set + AWS_PROFILE unset: proceeds"
assert_contains "PROFILE=IBD-DEV" "$output" "override set + AWS_PROFILE unset: PROFILE is IBD-DEV"
assert_not_contains "ALLOW_NON_IBD_DEV_PROFILE" "$output" "no spurious override announcement when there is no divergence"
