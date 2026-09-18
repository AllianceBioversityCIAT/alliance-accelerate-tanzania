#!/usr/bin/env bash
#
# guard-account.not-invoked-on-source.case.sh (T-3, guard-unit)
# ---------------------------------------------------------------------------
# design.md §7.1 / tasks.md T-3: assert_account is an EXPLICIT function
# call, not something that runs on `source` — unlike the profile floor and
# override, which do. This case proves sourcing alone makes no `sts` call:
# defining the function is not calling it.
#
# Falsifier this case exists to catch: making assert_account run on
# `source` (e.g. an accidental top-level call appended to _guard.sh) —
# that would touch the marker below and redden this case.
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
      bash -c 'source "$GUARD_LIB"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "sourcing alone (no assert_account call) succeeds"
if [[ -e "$MARKER" ]]; then
  echo "ASSERT FAIL [assert_account not invoked on source]: marker file exists — aws stub was invoked merely by sourcing" >&2
  exit 1
fi
