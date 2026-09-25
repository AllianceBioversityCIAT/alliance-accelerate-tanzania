#!/usr/bin/env bash
#
# guard-account.announce-sts-failure-fails-soft.case.sh (T-8, guard-unit)
# ---------------------------------------------------------------------------
# requirements.md FR-3′ clause: if `sts get-caller-identity` fails, the
# announcement says so and the script CONTINUES — fail soft. Under
# `set -euo pipefail`, an unguarded `aws sts ...` failure would abort the
# whole script; announce_account must not let that happen, because the
# announcement is observability, never a gate.
#
# The inner shell explicitly sets `set -euo pipefail` BEFORE sourcing —
# matching how every real writing script invokes this library (`set -euo
# pipefail` precedes `source _guard.sh` there too) — so this case actually
# exercises errexit, not a harness that happens to have it off.
#
# Falsifier: let the sts failure propagate (drop announce_account's
# `|| rc=$?` capture) ⇒ the plain assignment's failure trips the inner
# shell's `set -e` at the `announce_account` call itself, so
# "REACHED_AFTER_FAILURE" is never printed and the run's own exit status
# goes non-zero ⇒ this case reds.
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
    echo "An error occurred (ExpiredTokenException) when calling the GetCallerIdentity operation" >&2
    exit 254
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
      bash -c 'set -euo pipefail; source "$GUARD_LIB"; announce_account; echo "REACHED_AFTER_FAILURE"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "sts failure: the enclosing run still exits 0"
assert_contains "REACHED_AFTER_FAILURE" "$output" "the script continues past a failed sts call"
assert_contains "ExpiredTokenException" "$output" "the failure's own error text is surfaced"
