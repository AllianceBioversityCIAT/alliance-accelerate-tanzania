#!/usr/bin/env bash
#
# guard-profile.foreign-profile-aborts-before-aws-call.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# FR-1 clause: GIVEN AWS_PROFILE=MELIA-DEV WHEN any script runs THEN it
# exits non-zero BEFORE any AWS call. _guard.sh's floor makes no AWS call at
# all (announce_account, called later by the five writing scripts, is
# T-8's job), so this proves the claim with actual evidence rather than by
# construction: a scripted `aws` stub is wired in via STUB_AWS_SCRIPT, and
# the case asserts its marker was never written.
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
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM \
      AWS_PROFILE=MELIA-DEV \
      STUB_AWS_SCRIPT="$RECIPE" \
      bash -c 'source "$GUARD_LIB"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 1 "$status" "foreign profile: floor aborts non-zero"
# Content, not just status (KZ-002): a missing/broken _guard.sh also
# returns non-zero and would otherwise pass this case for the wrong
# reason. The real abort message names the effective profile.
assert_contains "MELIA-DEV" "$output" "abort names the effective profile"
if [[ -e "$MARKER" ]]; then
  echo "ASSERT FAIL [foreign profile: no AWS call before abort]: marker file exists — aws stub was invoked" >&2
  exit 1
fi
