#!/usr/bin/env bash
#
# guard-account.announce-mktemp-failure-fails-soft.case.sh (T-8 rework attempt
# 2, guard-unit)
# ---------------------------------------------------------------------------
# requirements.md FR-3′ clause: the announcement is observability, never a
# gate — its own failure cannot become a gate. announce_account's FIRST
# fallible step is acquiring a temp file for the sts stderr capture
# (`err_file="$(mktemp)"`), a bare command-substitution assignment. Under
# `set -euo pipefail` (the condition every real writing script runs this
# library under — deploy.sh, teardown.sh, migrate-seed.sh, set-cors.sh,
# deploy-frontend.sh all `source _guard.sh` immediately after it), an
# unguarded mktemp failure aborts the whole script BECAUSE the
# announcement's own bookkeeping failed — not because anything about the
# AWS account or profile is wrong. This is the defect the Reviewer found
# in this rework's Pivot review: the `aws sts` call was correctly guarded
# (`|| rc=$?`), but the mktemp acquisition feeding it was not, so an
# unwritable TMPDIR or an exhausted mktemp template aborted the caller
# with no output at all.
#
# Stubs `mktemp` itself on PATH. The harness's own stubs/ directory
# (prepended by run-tests.sh) only intercepts the network-capable set —
# aws, curl, sam, npm, npx (NFR-2) — so this case builds its own
# single-command stub dir and prepends THAT ahead of even the harness
# stubs, for the inner shell only; the outer case script's own `mktemp`
# calls (RECIPE-equivalent tooling, the stub dir itself) still use the
# real mktemp via the normal PATH it inherited from run-tests.sh. No
# STUB_AWS_SCRIPT is configured at all: announce_account must never reach
# the `aws` call in this scenario. An accidental real invocation would hit
# stubs/aws's own exit 127 with its "STUB ERROR: aws invoked with no
# STUB_AWS_SCRIPT configured" on stderr — but that does NOT abort this
# case: announce_account's `|| rc=$?` swallows a non-zero `aws` exit into
# its own fail-soft branch, so the run would still exit 0. What actually
# discriminates "the guard returned early, before touching aws" from "it
# reached aws and fail-soft swallowed the stub error" is the third
# assertion below: only the early-return path prints "Could not create a
# temp file for the account announcement", and only the reached-aws path
# would carry the stub's own error text instead.
#
# The inner shell sets `set -euo pipefail` BEFORE sourcing, matching every
# real writing script (and the sibling sts-failure case), so this
# exercises errexit for real, not a harness that happens to have it off.
#
# Falsifier: revert the guard in _guard.sh's announce_account back to the
# bare `err_file="$(mktemp)"` (drop the `if ! err_file="$(mktemp
# 2>/dev/null)"; then … return 0; fi` wrapping) ⇒ the stubbed mktemp's
# non-zero status trips the inner shell's `set -e` at the announce_account
# call itself, "REACHED_AFTER_ANNOUNCE" is never printed, and the run's
# own exit status goes non-zero ⇒ this case reds.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB

MKTEMP_STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$MKTEMP_STUB_DIR"' EXIT
cat > "$MKTEMP_STUB_DIR/mktemp" <<'EOF2'
#!/usr/bin/env bash
echo "STUB: mktemp deliberately failing (simulating an unwritable TMPDIR / exhausted template)" >&2
exit 1
EOF2
chmod +x "$MKTEMP_STUB_DIR/mktemp"

set +e
output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
      AWS_PROFILE=IBD-DEV \
      PATH="$MKTEMP_STUB_DIR:$PATH" \
      bash -c 'set -euo pipefail; source "$GUARD_LIB"; announce_account; echo "REACHED_AFTER_ANNOUNCE"' \
      </dev/null 2>&1
)"
status=$?
set -e

assert_status 0 "$status" "mktemp failure: the enclosing run still exits 0"
assert_contains "REACHED_AFTER_ANNOUNCE" "$output" "the script continues past a failed mktemp acquisition"
assert_contains "Could not create a temp file for the account announcement" "$output" "the skip is announced on stderr (FR-3'; informational only)"
