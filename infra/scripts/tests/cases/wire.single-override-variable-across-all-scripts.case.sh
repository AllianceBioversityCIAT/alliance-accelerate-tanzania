#!/usr/bin/env bash
#
# wire.single-override-variable-across-all-scripts.case.sh (T-4, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-2 ("a single variable across all scripts, learned
# once"); design.md §7.1; execution.md FP-4 — this clause was structurally
# satisfied by DD-1 at T-2/T-3 but genuinely UNOBSERVABLE until a script
# actually sources the guard, which first happens at T-4.
#
# For each of the seven scripts, setting ALLOW_NON_IBD_DEV_PROFILE equal to
# a foreign AWS_PROFILE must produce the SAME override announcement — the
# one _guard.sh itself emits — proving no script has grown its own,
# second, competing override mechanism (which would either ignore this
# variable and abort with the floor's message instead, or announce with
# different wording).
#
# The five WRITING scripts go on to call announce_account next (T-8),
# which makes an unstubbed `sts get-caller-identity` call — no
# STUB_AWS_SCRIPT is configured here — and fails soft (FR-3′): it prints
# that the call failed and continues, never aborting on it. Each script
# then reaches its own next external command, also unstubbed, and dies
# there instead. That is a correct and EXPECTED second outcome, not a
# contradiction: this case only asserts that the floor/override step,
# common to all seven, behaved identically.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

SCRIPTS=(deploy.sh deploy-frontend.sh set-cors.sh migrate-seed.sh teardown.sh validate.sh smoke.sh)

for name in "${SCRIPTS[@]}"; do
  output="$(
    env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION \
        AWS_PROFILE=MELIA-DEV \
        ALLOW_NON_IBD_DEV_PROFILE=MELIA-DEV \
        bash "$SCRIPTS_DIR/$name" </dev/null 2>&1 || true
  )"

  assert_contains "ALLOW_NON_IBD_DEV_PROFILE=MELIA-DEV set" "$output" "$name: the one shared override variable is honoured"
  assert_contains "proceeding against non-default AWS profile 'MELIA-DEV'" "$output" "$name: the shared override's announcement wording is unchanged"
done
