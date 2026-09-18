#!/usr/bin/env bash
#
# guard-account.matching-account-proceeds.case.sh (T-3, guard-unit)
# ---------------------------------------------------------------------------
# FR-3 clause: GIVEN the resolved account id matches the expected account
# WHEN assert_account runs THEN it proceeds (exit 0).
#
# A fixture copy of _guard.sh is sourced from a temp directory shaped like
# the real repo (scripts/_guard.sh beside aws-accounts.conf), so the
# fixture's own aws-accounts.conf is what GUARD_DIR/../aws-accounts.conf
# resolves to — never the real committed file. This is the same
# BASH_SOURCE[0]-relative resolution proven independently by
# guard-profile.resolves-own-path-not-caller; T-3 cases reuse the property
# rather than adding any test-only override variable to _guard.sh itself,
# which would be a seam an operator could accidentally trip on the real
# security boundary FR-3 exists to protect.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
GUARD_SRC="$SCRIPTS_DIR/_guard.sh"

FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT
mkdir -p "$FIXTURE_DIR/scripts"
cp "$GUARD_SRC" "$FIXTURE_DIR/scripts/_guard.sh"
cat > "$FIXTURE_DIR/aws-accounts.conf" <<'EOF2'
IBD-DEV=111111111111
EOF2

GUARD_LIB="$FIXTURE_DIR/scripts/_guard.sh"
export GUARD_LIB

RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
case "$1 $2" in
  "sts get-caller-identity")
    echo "111111111111"
    exit 0
    ;;
  *)
    echo "STUB: unexpected aws invocation: $*" >&2
    exit 1
    ;;
esac
EOF2

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
      AWS_PROFILE=IBD-DEV \
      STUB_AWS_SCRIPT="$RECIPE" \
      bash -c 'source "$GUARD_LIB"; assert_account' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "matching account: assert_account proceeds"
assert_contains "111111111111" "$output" "assert_account's own announcement names the verified account"
