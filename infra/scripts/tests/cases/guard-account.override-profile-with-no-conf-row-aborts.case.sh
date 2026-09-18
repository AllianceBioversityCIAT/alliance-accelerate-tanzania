#!/usr/bin/env bash
#
# guard-account.override-profile-with-no-conf-row-aborts.case.sh (T-3, guard-unit)
# ---------------------------------------------------------------------------
# requirements.md FR-2's "Interaction with FR-3" clause: an overridden
# profile MUST still carry a row in infra/aws-accounts.conf, and its
# account assertion still runs. The override authorises a DIFFERENT
# profile, never an UNVERIFIED account — a profile with no row aborts,
# naming the file, even though the profile floor itself proceeded.
#
# Falsifier this case exists to catch (tasks.md T-3): "skip the account
# check when the override is set" — assert_account has no visibility into
# whether an override was used; it only ever sees the resulting $PROFILE,
# so this case also proves no such special-casing crept in.
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
# Only IBD-DEV has a row — mirrors the real committed file's shape.
# MELIA-DEV (the overridden target below) deliberately has none.
cat > "$FIXTURE_DIR/aws-accounts.conf" <<'EOF2'
IBD-DEV=111111111111
EOF2

GUARD_LIB="$FIXTURE_DIR/scripts/_guard.sh"
export GUARD_LIB

MARKER="$(mktemp -u)"
RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE" "$MARKER"' EXIT
cat > "$RECIPE" <<EOF2
#!/usr/bin/env bash
touch "$MARKER"
echo "222222222222"
exit 0
EOF2

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
      AWS_PROFILE=MELIA-DEV ALLOW_NON_IBD_DEV_PROFILE=MELIA-DEV \
      STUB_AWS_SCRIPT="$RECIPE" \
      bash -c 'source "$GUARD_LIB"; assert_account' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "overridden profile with no conf row: assert_account still aborts"
assert_contains "MELIA-DEV" "$output" "abort names the overridden profile"
assert_contains "aws-accounts.conf" "$output" "abort names the config file"
if [[ -e "$MARKER" ]]; then
  echo "ASSERT FAIL [override without row: no AWS call]: marker file exists — aws stub was invoked" >&2
  exit 1
fi
