#!/usr/bin/env bash
#
# guard-profile.pipeline-env-exit-zero.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# NFR-3: the change is pipeline-compatible — a guard-unit test asserts
# exit 0 under the pipeline's exact env, AWS_PROFILE=IBD-DEV.
#
# FP-2: AWS_PROFILE is set EXPLICITLY here, not left to an ambient value —
# this machine's operator shell commonly exports AWS_PROFILE=IBD-DEV
# already, which would let this case pass for the wrong reason if the
# case's own assignment were ever deleted. See the task's completion
# report for the proof: this case (and the unset-case) re-run correctly
# with a *different* ambient AWS_PROFILE exported in the parent shell.
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
      AWS_PROFILE=IBD-DEV \
      bash -c 'source "$GUARD_LIB"; echo "PROFILE=$PROFILE"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "pipeline env (AWS_PROFILE=IBD-DEV): floor exits 0"
assert_contains "PROFILE=IBD-DEV" "$output" "pipeline env: PROFILE is IBD-DEV"
