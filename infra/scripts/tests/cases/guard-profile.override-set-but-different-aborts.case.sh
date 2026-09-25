#!/usr/bin/env bash
#
# guard-profile.override-set-but-different-aborts.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# FR-2 clause: GIVEN the override is set but does NOT match the effective
# profile WHEN a script runs THEN it exits non-zero — an override
# authorises ONE named profile, never "any".
#
# This is the case a boolean-override mutation reds (tasks.md T-2
# falsifier list: "treat the override as a boolean").
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM \
      AWS_PROFILE=MELIA-DEV ALLOW_NON_IBD_DEV_PROFILE=OTHER-DEV \
      bash -c 'source "$GUARD_LIB"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "override set but different from AWS_PROFILE: aborts"
# Content, not just status — a missing/broken _guard.sh also returns
# non-zero and would otherwise pass this case for the wrong reason
# (KZ-002). The real abort message names the effective profile.
assert_contains "MELIA-DEV" "$output" "mismatch abort names the effective profile"
