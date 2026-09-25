#!/usr/bin/env bash
#
# guard-profile.override-rejects-aws-profile-as-override.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# FR-2 clause: BUT it must NOT accept AWS_PROFILE ... as the override; the
# variable that caused the bug cannot be the variable that authorises it.
#
# Proof: AWS_PROFILE=MELIA-DEV alone (no ALLOW_NON_IBD_DEV_PROFILE, no
# CONFIRM) must still abort. If the guard ever checked AWS_PROFILE against
# itself (a tautology that always matches) instead of a dedicated
# variable, this case would incorrectly proceed.
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
      AWS_PROFILE=MELIA-DEV \
      bash -c 'source "$GUARD_LIB"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "AWS_PROFILE alone does not self-authorise"
# Content, not just status (KZ-002): a missing/broken _guard.sh also
# returns non-zero and would otherwise pass this case for the wrong
# reason. The real abort message names the effective profile.
assert_contains "MELIA-DEV" "$output" "abort names the effective profile"
