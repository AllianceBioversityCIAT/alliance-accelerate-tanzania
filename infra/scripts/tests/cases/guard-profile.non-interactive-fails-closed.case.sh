#!/usr/bin/env bash
#
# guard-profile.non-interactive-fails-closed.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# FR-1 clause: BUT it must NOT depend on an interactive TTY to refuse — a
# non-interactive run MUST fail closed, with no prompt at all (design.md
# §7.1: "No TTY branch").
#
# The honest falsifier for this clause is `[[ ! -t 0 ]] && return 0` —
# NOT restoring the exemplar's old `[[ -t 0 ]]` branch, which would still
# abort under stdin /dev/null (`read` hits EOF, reply empty, exit 1) and
# would prove nothing (tasks.md T-2 falsifier list).
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

assert_status 1 "$status" "non-interactive: fails closed with no confirmation"
# Content, not just status (KZ-002): a missing/broken _guard.sh also
# returns non-zero and would otherwise pass this case for the wrong
# reason. The real abort message names the effective profile.
assert_contains "MELIA-DEV" "$output" "abort names the effective profile"
assert_not_contains "Type" "$output" "non-interactive: no prompt text printed"
assert_not_contains "Continue" "$output" "non-interactive: no interactive confirm prompt"
assert_not_contains "y/N" "$output" "non-interactive: no yes/no prompt"
