#!/usr/bin/env bash
#
# guard-account.foreign-account-aborts.case.sh (T-3, guard-unit)
# ---------------------------------------------------------------------------
# FR-3 clause: GIVEN the resolved account id differs from the expected
# account WHEN a writing script runs THEN it exits non-zero.
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
    echo "222222222222"
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

assert_status 1 "$status" "foreign account: assert_account aborts non-zero"
assert_contains "222222222222" "$output" "abort names the resolved (foreign) account"
assert_contains "111111111111" "$output" "abort names the expected account"
