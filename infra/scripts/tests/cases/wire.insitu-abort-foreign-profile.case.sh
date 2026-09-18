#!/usr/bin/env bash
#
# wire.insitu-abort-foreign-profile.case.sh (T-4, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-1; design.md §7.1/§7.2; tasks.md T-4 clause (b).
#
# THE POINT OF THIS CASE (tasks.md: "(b) and (c) are the point of this
# task"): proves the guard runs IN SITU in every one of the seven scripts,
# not merely that a `source` line is textually present (judgment.md V-1 —
# a tree where every script sources the guard and none runs it would pass
# a presence-only check). `AWS_PROFILE=MELIA-DEV ./<script>` must exit
# non-zero for each of the seven, and the abort must be attributable to the
# guard specifically — the assertion checks for the guard's own message
# (naming BOTH the found and expected profile), not merely a non-zero exit,
# since an unrelated crash also exits non-zero and would pass a
# status-only check for the wrong reason (KZ-002).
#
# No STUB_AWS_SCRIPT is configured: the guard's profile floor makes no AWS
# call at all before aborting (assert_account, if reached, would be the
# first one) — a `source` that reaches an aws/sam/curl call before
# aborting would make this run hang/fail loudly against the unconfigured
# stub (exit 127, "no STUB_..._SCRIPT configured"), which is itself a
# distinguishable-from-guard-abort failure mode this case's message
# assertion would also catch.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

SCRIPTS=(deploy.sh deploy-frontend.sh set-cors.sh migrate-seed.sh teardown.sh validate.sh smoke.sh)

for name in "${SCRIPTS[@]}"; do
  set +e
  output="$(
    env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION \
        AWS_PROFILE=MELIA-DEV \
        bash "$SCRIPTS_DIR/$name" </dev/null 2>&1
  )"
  status=$?
  set -e

  assert_status 1 "$status" "$name: foreign profile aborts non-zero, in situ"
  assert_contains "MELIA-DEV" "$output" "$name: abort names the found profile"
  assert_contains "IBD-DEV" "$output" "$name: abort names the expected profile"
done
