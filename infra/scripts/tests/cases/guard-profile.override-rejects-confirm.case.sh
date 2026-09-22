#!/usr/bin/env bash
#
# guard-profile.override-rejects-confirm.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# FR-2 clause: BUT it must NOT accept ... CONFIRM as the override — the
# exemplar scripts' (migrate-seed.sh, teardown.sh) old mechanism, which
# this guard is deliberately stricter than.
#
# Proof: AWS_PROFILE=MELIA-DEV with CONFIRM=yes set (no
# ALLOW_NON_IBD_DEV_PROFILE) must still abort.
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
      AWS_PROFILE=MELIA-DEV CONFIRM=yes \
      bash -c 'source "$GUARD_LIB"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "CONFIRM=yes does not authorise a foreign profile"
# Content, not just status (KZ-002): a missing/broken _guard.sh also
# returns non-zero and would otherwise pass this case for the wrong
# reason. The real abort message names the effective profile.
assert_contains "MELIA-DEV" "$output" "abort names the effective profile"
