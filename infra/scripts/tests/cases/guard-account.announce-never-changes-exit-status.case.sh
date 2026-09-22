#!/usr/bin/env bash
#
# guard-account.announce-never-changes-exit-status.case.sh (T-8, guard-unit)
# ---------------------------------------------------------------------------
# requirements.md FR-3′ clause: announce_account MUST NOT change the exit
# status — a run whose only notable event is the announcement still exits
# 0. Captures announce_account's own $? immediately after the call, as the
# very next statement (not merely the enclosing script's final status,
# which a later statement could mask), as well as the whole run's status.
#
# Falsifier: make the announcement return non-zero (or abort) on a
# successful sts call ⇒ both assertions red.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB

RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
case "$1 $2" in
  "sts get-caller-identity")
    echo "555555555555"
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
      bash -c 'set -euo pipefail; source "$GUARD_LIB"; announce_account; echo "OWN_RC=$?"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "announce_account: the enclosing run still exits 0"
assert_contains "OWN_RC=0" "$output" "announce_account's own return status is 0"
