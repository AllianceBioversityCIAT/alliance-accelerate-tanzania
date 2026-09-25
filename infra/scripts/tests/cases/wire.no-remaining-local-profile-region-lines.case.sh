#!/usr/bin/env bash
#
# wire.no-remaining-local-profile-region-lines.case.sh (T-4, static)
# ---------------------------------------------------------------------------
# requirements.md NFR-4; design.md §7.1 ("the seven local PROFILE=... lines
# are deleted... leaving them would keep a second resolution path"); tasks.md
# T-4 clause (e), first half.
#
# Asserts that none of the seven operator scripts still assigns PROFILE or
# REGION locally from AWS_PROFILE/AWS_REGION — the guard's export is now
# the ONLY resolution path (FP-4). _guard.sh itself is excluded: its
# `export PROFILE="${AWS_PROFILE:-IBD-DEV}"` / `export REGION=...` lines
# are the one legitimate site (they ARE the resolution this checks for the
# absence of everywhere else).
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

SCRIPTS=(deploy.sh deploy-frontend.sh set-cors.sh migrate-seed.sh teardown.sh validate.sh smoke.sh)

# `\s` is a GNU-only regex shorthand: BSD/macOS grep's ERE engine does not
# recognise it and degrades to matching a literal "s", which would make
# this anchor blind to any indented occurrence of the pattern on this
# machine. `[[:space:]]*` is the POSIX bracket-expression equivalent and is
# honoured by both BSD and GNU grep.
# Matcher positive control: prove `[[:space:]]*` still recognises an
# INDENTED occurrence of the pattern — the anchor this check exists for.
# A synthetic fixture, not one of the seven scripts, so this is
# independent of whatever they currently contain.
FIXTURE="$(mktemp)"
trap 'rm -f "$FIXTURE"' EXIT
printf '  PROFILE="${AWS_PROFILE:-IBD-DEV}"\n' > "$FIXTURE"
if grep -qE '^[[:space:]]*PROFILE="\$\{AWS_PROFILE:-' "$FIXTURE"; then
  indented_match=0
else
  indented_match=1
fi
assert_status 0 "$indented_match" "[[:space:]]* anchor still matches an indented PROFILE= line"

FAILED=0
for name in "${SCRIPTS[@]}"; do
  if grep -nE '^[[:space:]]*PROFILE="\$\{AWS_PROFILE:-' "$SCRIPTS_DIR/$name" >/dev/null 2>&1; then
    echo "ASSERT FAIL [no local PROFILE= line]: $name still assigns PROFILE locally" >&2
    FAILED=1
  fi
  if grep -nE '^[[:space:]]*REGION="\$\{AWS_REGION:-' "$SCRIPTS_DIR/$name" >/dev/null 2>&1; then
    echo "ASSERT FAIL [no local REGION= line]: $name still assigns REGION locally" >&2
    FAILED=1
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  exit 1
fi

# Positive control: _guard.sh itself MUST still carry exactly these
# resolutions — a check that could never find the pattern anywhere would
# vacuously pass the negative checks above for the wrong reason.
assert_contains 'export PROFILE="${AWS_PROFILE:-IBD-DEV}"' "$(cat "$SCRIPTS_DIR/_guard.sh")" "_guard.sh still exports PROFILE (the one legitimate site)"
assert_contains 'export REGION="${AWS_REGION:-eu-west-1}"' "$(cat "$SCRIPTS_DIR/_guard.sh")" "_guard.sh still exports REGION (the one legitimate site)"
