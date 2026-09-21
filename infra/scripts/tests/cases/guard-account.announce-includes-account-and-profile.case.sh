#!/usr/bin/env bash
#
# guard-account.announce-includes-account-and-profile.case.sh (T-8, guard-unit)
# ---------------------------------------------------------------------------
# requirements.md FR-3′ clause: the announcement MUST include BOTH the
# resolved account id AND the effective profile — naming only one of the
# two would leave an operator unable to tell which profile a surprising
# account belongs to. A non-default profile (via the FR-2 override) is
# used deliberately, so "the effective profile" is proven to be the
# resolved value, not merely the IBD-DEV default appearing by coincidence.
#
# Falsifier: drop either token from the announcement message ⇒ reds.
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
    echo "444444444444"
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
      AWS_PROFILE=MELIA-DEV ALLOW_NON_IBD_DEV_PROFILE=MELIA-DEV \
      STUB_AWS_SCRIPT="$RECIPE" \
      bash -c 'source "$GUARD_LIB"; announce_account' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "announce_account: proceeds"
assert_contains "444444444444" "$output" "the announcement names the resolved account"
assert_contains "MELIA-DEV" "$output" "the announcement names the effective profile"
