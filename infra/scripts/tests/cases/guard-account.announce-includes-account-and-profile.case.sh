#!/usr/bin/env bash
#
# guard-account.announce-includes-account-and-profile.case.sh (T-8, guard-unit,
# round 5)
# ---------------------------------------------------------------------------
# requirements.md FR-3′ clause: the announcement MUST include BOTH the
# resolved account id AND the effective profile — naming only one of the
# two would leave an operator unable to tell which profile a surprising
# account belongs to.
#
# ROUND-5 FIX — same-line assertion, not same-stream. The prior version ran
# under a FR-2 override (AWS_PROFILE=MELIA-DEV ALLOW_NON_IBD_DEV_PROFILE=
# MELIA-DEV) captured with `2>&1`, and asserted "MELIA-DEV" appeared
# somewhere in that merged output. It does: _guard.sh:91's OWN override
# message ("... proceeding against non-default AWS profile 'MELIA-DEV' ...")
# prints it first, on `source`, before announce_account is ever called. So
# dropping the profile clause from announce_account's own message
# (_guard.sh:154) left the assertion green — a claimed gate that could not
# fire (delta re-validation FAIL, round 5).
#
# This version runs under the PLAIN `IBD-DEV` floor instead: no override
# variable is set, so `AWS_PROFILE=IBD-DEV` never enters the FR-2 branch at
# all and _guard.sh:91's message is never emitted — there is no other
# source of the profile string left to bleed through. Stdout and stderr are
# captured separately (announce_account writes only to stderr; merging
# streams is exactly the device that hid this defect). The single stderr
# line containing the resolved account id is located, and THAT line —
# not the stream as a whole — must also contain the effective profile.
#
# Falsifier: drop the ` (profile '$PROFILE')` clause from _guard.sh:154's
# announcement ⇒ reds (no other line in this run's stderr carries
# "IBD-DEV", so the same-line lookup fails). Drop the account id from that
# same line ⇒ reds too (no stderr line contains the resolved account id at
# all, so the line can't even be located).
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

GUARD_LIB="$(cd "$TESTS_DIR/.." && pwd)/_guard.sh"
export GUARD_LIB

RECIPE="$(mktemp)"
out_file="$(mktemp "${TMPDIR:-/tmp}/announce-out.XXXXXX")"
err_file="$(mktemp "${TMPDIR:-/tmp}/announce-err.XXXXXX")"
trap 'rm -f "$RECIPE" "$out_file" "$err_file"' EXIT
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
env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u STUB_AWS_SCRIPT \
    AWS_PROFILE=IBD-DEV \
    STUB_AWS_SCRIPT="$RECIPE" \
    bash -c 'source "$GUARD_LIB"; announce_account' \
    </dev/null >"$out_file" 2>"$err_file"
status=$?
set -e

stdout_content="$(cat "$out_file")"
stderr_content="$(cat "$err_file")"

assert_status 0 "$status" "announce_account: proceeds"

# Locate the single stderr line carrying the resolved account id — not
# "does the stream contain it anywhere" (that's the check that failed to
# gate), but "which line, specifically".
account_line="$(printf '%s\n' "$stderr_content" | grep -F "444444444444" || true)"
if [[ -z "$account_line" ]]; then
  {
    echo "ASSERT FAIL [account line located]: no stderr line names the resolved account:"
    echo "$stderr_content" | sed 's/^/  | /'
  } >&2
  exit 1
fi

assert_contains "IBD-DEV" "$account_line" "the SAME stderr line names both the resolved account and the effective profile"
assert_not_contains "444444444444" "$stdout_content" "the announcement must not leak onto stdout"
