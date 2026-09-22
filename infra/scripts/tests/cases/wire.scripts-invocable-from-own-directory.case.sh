#!/usr/bin/env bash
#
# wire.scripts-invocable-from-own-directory.case.sh (F-2, script-integration)
# ---------------------------------------------------------------------------
# Every script sources the guard by its own directory. `${BASH_SOURCE[0]%/*}`
# strips the shortest suffix matching `/*` — and when the path contains NO
# slash there is nothing to strip, so the expansion returns the path
# UNCHANGED rather than ".". A script reached from inside its own directory
# therefore resolved the guard to "<script>.sh/_guard.sh" — a path under a
# REGULAR FILE, so the error is ENOTDIR, "Not a directory", NOT ENOENT's
# "No such file or directory". The needle below is the former; an earlier
# draft of this case asserted the latter, which the defect never emits, so
# that assertion could not have fired for the condition it named (KZ-002)
# even though the case as a whole still discriminated on its second
# assertion. The exact text is on record in validation-report.md's A-01
# transcript: "validate.sh: line 26: validate.sh/_guard.sh: Not a
# directory".
#
# The regression was introduced by THIS spec: the scripts previously used
# `$(dirname "$0")`, which returns "." for a slash-less path. No example in
# infra/README.md invokes a script this way — they are all
# `./infra/scripts/<name>.sh` from the repo root — so the ground for fixing
# it is that the form used to work and this spec broke it, not that the
# README recommends it. (An earlier draft of this header claimed the README
# did; it does not.)
#
# WHAT THIS CASE ASSERTS, AND WHY IT IS THE PROFILE MESSAGE
#   Each script is run from inside infra/scripts with a FOREIGN AWS_PROFILE.
#   The correct outcome is the guard's own refusal — which proves the guard
#   was found, sourced, and executed. The defect's outcome is a shell error
#   from `source` resolving a path under a regular file. Asserting the
#   refusal text (not merely a non-zero exit) is deliberate and is the
#   assertion that actually carries this case: BOTH outcomes exit non-zero,
#   so an exit-code assertion would pass with the defect fully present.
#
#   Nothing reaches AWS: the guard aborts during `source`, before any script
#   body runs, so no stub is needed and no network-capable command is
#   invoked.
#
# Falsifier: revert any script's two-line resolution to the bare
# `source "${BASH_SOURCE[0]%/*}/_guard.sh"`. Both assertions for that
# script then redden — the ENOTDIR needle and the profile-floor needle —
# and the run must be made through run-tests.sh, not by invoking this file
# directly. Standalone: `cd infra/scripts && bash -c 'source
# deploy.sh/_guard.sh'` prints "bash: deploy.sh/_guard.sh: Not a
# directory".
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

SCRIPTS=(
  deploy.sh
  smoke.sh
  set-cors.sh
  teardown.sh
  migrate-seed.sh
  deploy-frontend.sh
  validate.sh
)

# Guard against this list silently falling behind the directory: every
# script that sources the guard must be covered here.
expected_count="$(grep -l -F '_guard.sh"' "$SCRIPTS_DIR"/*.sh | grep -cv '/_guard.sh$')"
if [[ "$expected_count" -ne "${#SCRIPTS[@]}" ]]; then
  echo "ASSERT FAIL [coverage]: ${#SCRIPTS[@]} scripts listed here but $expected_count scripts under infra/scripts source the guard — update this list" >&2
  exit 1
fi

for script in "${SCRIPTS[@]}"; do
  set +e
  output="$(
    cd "$SCRIPTS_DIR" && \
    env -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
        AWS_PROFILE=some-other-account \
        bash "$script" </dev/null 2>&1
  )"
  status=$?
  set -e

  # ENOTDIR, not ENOENT — see the header. Also assert the generic shape,
  # so a future change to bash's wording cannot quietly disarm this.
  assert_not_contains "Not a directory" "$output" \
    "$script: sources the guard when invoked from inside its own directory"
  assert_not_contains "/_guard.sh: " "$output" \
    "$script: no shell error naming the guard path (wording-independent form of the same check)"
  assert_contains "this project requires 'IBD-DEV'" "$output" \
    "$script: the profile floor actually ran (proves the guard was reached, not just that the script failed)"
  assert_status 1 "$status" "$script: aborts on the foreign profile"
done
