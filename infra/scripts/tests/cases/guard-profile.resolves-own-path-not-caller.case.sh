#!/usr/bin/env bash
#
# guard-profile.resolves-own-path-not-caller.case.sh (T-2, guard-unit)
# ---------------------------------------------------------------------------
# design.md §7.1 design point: "The library resolves its own path with
# ${BASH_SOURCE[0]%/*}, never $0, which in a sourced file names the
# caller." Not named as a task falsifier, but proven now while the library
# is small — GUARD_DIR was originally consumed by T-3's assert_account to
# locate infra/aws-accounts.conf; T-8 withdrew both (the Pivot), but the
# resolution itself is unchanged and still worth pinning independently of
# any one caller.
#
# Proof: source _guard.sh from a `bash -c` invocation whose own $0 is set
# to an unrelated, non-path string and whose cwd has been changed to /tmp.
# If the library used $0 (or a relative path) instead of BASH_SOURCE[0],
# the resolved directory would be wrong or the `cd` would fail outright.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
GUARD_LIB="$SCRIPTS_DIR/_guard.sh"
export GUARD_LIB

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM \
      bash -c 'cd /tmp && source "$GUARD_LIB" && echo "GUARD_DIR=$GUARD_DIR"' \
      "totally-unrelated-arg0-not-a-path" \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "guard sources cleanly from an unrelated cwd/\$0"
assert_contains "GUARD_DIR=$SCRIPTS_DIR" "$output" "own-path resolution is independent of cwd and \$0"
