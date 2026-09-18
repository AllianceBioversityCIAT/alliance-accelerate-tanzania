#!/usr/bin/env bash
#
# guard-account.missing-conf-row-aborts-naming-file.case.sh (T-3, guard-unit)
# ---------------------------------------------------------------------------
# FR-2 interaction clause / tasks.md T-3 clause: a profile with no row in
# infra/aws-accounts.conf aborts, naming the file. Here the effective
# profile is IBD-DEV itself (no override involved) but the fixture conf
# carries only a different profile's row — proving the missing-row path in
# isolation from the override interaction, which
# guard-account.override-profile-with-no-conf-row-aborts covers separately.
#
# A marker records whether the `aws` stub was ever invoked: assert_account
# checks the conf file before calling `sts`, so a missing row aborts with
# no AWS call at all.
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
OTHER-PROFILE=333333333333
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

assert_status 1 "$status" "missing conf row: assert_account aborts"
assert_contains "IBD-DEV" "$output" "abort names the profile with no row"
assert_contains "aws-accounts.conf" "$output" "abort names the config file"
if [[ -e "$MARKER" ]]; then
  echo "ASSERT FAIL [missing conf row: no AWS call]: marker file exists — aws stub was invoked" >&2
  exit 1
fi
