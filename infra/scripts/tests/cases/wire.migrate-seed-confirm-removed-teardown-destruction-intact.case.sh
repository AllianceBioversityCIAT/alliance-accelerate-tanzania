#!/usr/bin/env bash
#
# wire.migrate-seed-confirm-removed-teardown-destruction-intact.case.sh
# (T-4, static + script-integration)
# ---------------------------------------------------------------------------
# design.md §6.1/DD-4; tasks.md T-4 clause (e), second half; the T-4 brief's
# explicit warning about teardown.sh's TWO CONSECUTIVE CONFIRM blocks.
#
# INTERPRETATION NOTE on "zero CONFIRM mentions in migrate-seed.sh": T-4's
# scope removes the CONFIRM=yes profile-override BRANCH (the executable
# code). The script's USAGE comment line (`CONFIRM=yes AWS_PROFILE=other
# ./infra/scripts/migrate-seed.sh   # override the IBD-DEV guard`) is a
# stale self-description now, but requirements.md FR-7 and tasks.md T-7
# explicitly assign "migrate-seed.sh's ... CONFIRM=yes AWS_PROFILE=other
# USAGE line" to T-7's documentation sweep, and this task's own brief
# (FP-3) says to fix only the one run-tests.sh header sentence T-4
# falsifies, "not T-7's wider sweep." So this case asserts zero CONFIRM
# mentions in migrate-seed.sh's CODE (comment lines stripped first) — the
# USAGE comment is left for T-7, deliberately, and is not asserted absent
# here.
#
# teardown.sh carries the sharpest hazard in this task: TWO consecutive
# CONFIRM blocks, only the first of which (the profile override) T-4 must
# delete. This case proves, functionally, that the destruction
# confirmation still gates an otherwise-valid, non-interactive run.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
INFRA_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"

# Read the expected account for IBD-DEV from the real, committed conf file
# at run time — never as a literal in this test's own source (FR-3;
# guard-account.no-account-id-literal-in-scripts greps this directory).
EXPECTED_ACCOUNT="$(awk -F= '$1=="IBD-DEV"{print $2; exit}' "$INFRA_DIR/aws-accounts.conf")"

# ── migrate-seed.sh: zero CONFIRM mentions in the code (comments stripped) ─
code_only="$(grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$SCRIPTS_DIR/migrate-seed.sh")"
assert_not_contains "CONFIRM" "$code_only" "migrate-seed.sh's executable code carries no CONFIRM reference"

# ── teardown.sh: the deleted block's distinguishing text must be gone ──────
teardown_content="$(cat "$SCRIPTS_DIR/teardown.sh")"
assert_not_contains "Continue against" "$teardown_content" "teardown.sh's profile-override interactive prompt is gone"

# ── teardown.sh: the destruction confirmation's own text is UNTOUCHED ──────
assert_contains "Type 'yes' (or 'destroy') to confirm teardown" "$teardown_content" "teardown.sh's destruction prompt text survives verbatim"
assert_contains "This permanently deletes the dev RDS database and all three stacks" "$teardown_content" "teardown.sh's destruction warning text survives verbatim"
assert_contains 'CONFIRM=yes set — proceeding with teardown.' "$teardown_content" "teardown.sh's destruction CONFIRM=yes path survives verbatim"
assert_contains "refusing to tear down unattended" "$teardown_content" "teardown.sh's unattended-refusal path survives verbatim"

# ── teardown.sh: the destruction gate still functionally fires, in situ ────
# A valid profile AND a valid account (assert_account passes) still hits
# the destruction confirmation and aborts non-interactively with no
# CONFIRM — proving the two guards are independent and the second was not
# collapsed into (or bypassed by) the first's removal.
RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<EOF2
#!/usr/bin/env bash
case "\$1 \$2" in
  "sts get-caller-identity")
    echo "$EXPECTED_ACCOUNT"
    exit 0
    ;;
  *)
    echo "STUB: unexpected aws invocation: \$*" >&2
    exit 1
    ;;
esac
EOF2

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION -u STUB_AWS_SCRIPT \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$RECIPE" \
      bash "$SCRIPTS_DIR/teardown.sh" </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "teardown.sh: valid profile+account still requires destruction confirmation"
assert_contains "refusing to tear down unattended" "$output" "teardown.sh: destruction gate is what aborted (not the deleted profile gate)"
assert_not_contains "IBD-DEV, but this project requires" "$output" "teardown.sh: not aborted by the (correctly passing) profile floor"
