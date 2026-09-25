#!/usr/bin/env bash
#
# guard-account.announce-not-invoked-on-source.case.sh
# (T-8, guard-unit — converts T-3's guard-account.not-invoked-on-source)
# ---------------------------------------------------------------------------
# design.md §7.1 / tasks.md T-8: announce_account is an EXPLICIT function
# call, not something that runs on `source` — unlike the profile floor and
# override, which do. This case proves sourcing alone makes no `sts` call:
# defining the function is not calling it. That property is what lets
# validate.sh and smoke.sh source _guard.sh for FR-1/FR-2 while remaining
# exempt from the account announcement (DD-6, unchanged by the Pivot) with
# no flag of their own — they just never call announce_account.
#
# No fixture conf file is needed here any more (T-3's version copied
# _guard.sh into a fixture directory alongside a fake aws-accounts.conf,
# because assert_account read that file; announce_account reads nothing),
# so this case sources the real, unmodified _guard.sh directly, the same
# way the guard-profile.* cases already do.
#
# Falsifier this case exists to catch: making announce_account run on
# `source` (e.g. an accidental top-level call appended to _guard.sh) —
# that would touch the marker below and redden this case.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
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

assert_status 0 "$status" "sourcing alone (no announce_account call) succeeds"
if [[ -e "$MARKER" ]]; then
  echo "ASSERT FAIL [announce_account not invoked on source]: marker file exists — aws stub was invoked merely by sourcing" >&2
  exit 1
fi
