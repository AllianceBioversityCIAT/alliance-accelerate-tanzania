#!/usr/bin/env bash
#
# guard-account.malformed-conf-row-aborts.case.sh (T-3, guard-unit)
# ---------------------------------------------------------------------------
# tasks.md T-3 clause: a malformed conf row aborts. The row exists for the
# effective profile but its value is not a well-formed 12-digit account id.
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
IBD-DEV=not-an-account-id
EOF2

GUARD_LIB="$FIXTURE_DIR/scripts/_guard.sh"
export GUARD_LIB

MARKER="$(mktemp -u)"
RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE" "$MARKER"' EXIT
cat > "$RECIPE" <<EOF2
#!/usr/bin/env bash
touch "$MARKER"
echo "111111111111"
exit 0
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

assert_status 1 "$status" "malformed conf row: assert_account aborts"
assert_contains "aws-accounts.conf" "$output" "abort names the config file"
assert_contains "not-an-account-id" "$output" "abort names the malformed value"
if [[ -e "$MARKER" ]]; then
  echo "ASSERT FAIL [malformed conf row: no AWS call]: marker file exists — aws stub was invoked" >&2
  exit 1
fi
