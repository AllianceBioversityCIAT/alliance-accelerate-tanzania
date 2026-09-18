#!/usr/bin/env bash
#
# guard-account.no-account-id-literal-in-scripts.case.sh (T-3, static check)
# ---------------------------------------------------------------------------
# requirements.md FR-3: "it must NOT hardcode the account id in any
# script; it is read from one configuration file." This is a static
# grep over infra/scripts/*.sh (recursively, so it also covers the test
# harness under infra/scripts/tests/) for the real committed account id —
# it must appear NOWHERE except infra/aws-accounts.conf, which is not a
# .sh file and is therefore outside this grep's scope by construction.
#
# FR-3 says "any script", and infra/scripts/tests/stubs/ (aws, curl, npm,
# npx, sam) are scripts despite carrying no .sh extension — the `--include
# '*.sh'` glob above would silently miss a literal planted there (Reviewer
# advisory, T-3 rework, 2026-09-18). A second, unfiltered recursive grep
# scoped to that one directory closes it without widening the first grep
# into non-script files elsewhere under infra/scripts/.
#
# Test fixtures elsewhere in this suite use deliberately fake ids
# (111111111111, 222222222222, 333333333333, ...) that are not the real
# account and so never trip this check.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
STUBS_DIR="$TESTS_DIR/stubs"

# Built by concatenation, not as one contiguous literal, so this file's
# own needle definition can never match itself under the recursive grep
# below (which — correctly — scans this very file too).
REAL_ACCOUNT_ID="56911380"
REAL_ACCOUNT_ID+="2249"

set +e
hits_sh="$(grep -rn "$REAL_ACCOUNT_ID" "$SCRIPTS_DIR" --include='*.sh' 2>&1)"
status_sh=$?
hits_stubs="$(grep -rn "$REAL_ACCOUNT_ID" "$STUBS_DIR" 2>&1)"
status_stubs=$?
set -e

hits="$hits_sh
$hits_stubs"

# grep exit codes: 0 = matched (this must NOT happen), 1 = no match (the
# desired outcome), >1 = a real grep error (also a failure). Either grep
# call matching, or erroring, fails this case.
if [[ "$status_sh" -eq 0 || "$status_stubs" -eq 0 ]]; then
  echo "ASSERT FAIL [no account id literal in any script]: found the real account id in:" >&2
  echo "$hits" | sed 's/^/  | /' >&2
  exit 1
elif [[ "$status_sh" -gt 1 || "$status_stubs" -gt 1 ]]; then
  echo "ASSERT FAIL [no account id literal in any script]: grep error: $hits" >&2
  exit 1
fi
