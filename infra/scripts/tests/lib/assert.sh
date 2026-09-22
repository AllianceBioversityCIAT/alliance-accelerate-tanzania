#!/usr/bin/env bash
#
# assert.sh — ACCELERATE Tanzania Seed Registry (infra/scripts/tests, T-1)
# ---------------------------------------------------------------------------
# PURPOSE
#   The harness's one assertion helper (design.md §7.2, task T-1 deliverable
#   #2). Sourced by test cases — both guard-unit and script-integration —
#   never executed directly. Covers the two shapes every later task's gate
#   needs: an exit-status comparison, and a stdout/stderr content match.
#
#   Every function here reports a labelled failure to stderr and RETURNS
#   non-zero; it never calls `exit`. A case sources this file under its own
#   `set -euo pipefail`, so the first failing assertion ends the case with a
#   non-zero status — the runner reads that as FAIL. Not calling `exit`
#   keeps these functions safe to use even from a case that is itself
#   sourcing a guard library in the same process.
#
# USAGE (from a case file)
#   source "$(dirname "${BASH_SOURCE[0]}")/../lib/assert.sh"
#   assert_status 0 "$status" "profile floor: pipeline env"
#   assert_contains "IBD-DEV" "$stderr" "mismatch message names expected profile"
#   assert_not_contains "None" "$stdout" "resolved value is never the literal None"
# ---------------------------------------------------------------------------

# assert_status <expected> <actual> [label]
#   Numeric comparison. Use for a captured `$?` — never for stdout/stderr.
assert_status() {
  local expected="$1" actual="$2" label="${3:-exit status}"
  # An empty/non-numeric $actual (e.g. a case that forgot to capture $?)
  # must FAIL this assertion, not pass it: `[[ "$actual" -ne "$expected" ]]`
  # is an arithmetic comparison, and bash arithmetic treats an empty string
  # as 0 — so a missing capture could silently satisfy `assert_status 0 ""`.
  # Validate both operands look like integers before the numeric compare.
  if [[ ! "$actual" =~ ^-?[0-9]+$ ]]; then
    echo "ASSERT FAIL [$label]: actual exit status is not numeric: '$actual'" >&2
    return 1
  fi
  if [[ ! "$expected" =~ ^-?[0-9]+$ ]]; then
    echo "ASSERT FAIL [$label]: expected exit status is not numeric: '$expected'" >&2
    return 1
  fi
  if [[ "$actual" -ne "$expected" ]]; then
    echo "ASSERT FAIL [$label]: expected exit $expected, got $actual" >&2
    return 1
  fi
  return 0
}

# assert_contains <needle> <haystack> [label]
#   Substring match (bash [[ == *pattern* ]], not a regex). Use on whichever
#   stream the case captured — stdout and stderr are separate on purpose;
#   see design.md §7.2 on why smoke.sh's PASS/FAIL line specifically needs
#   `2>&1` and other cases must NOT merge the two streams.
assert_contains() {
  local needle="$1" haystack="$2" label="${3:-content match}"
  if [[ "$haystack" != *"$needle"* ]]; then
    {
      echo "ASSERT FAIL [$label]: expected to find:"
      echo "  >> $needle"
      echo "  in:"
      echo "$haystack" | sed 's/^/  | /'
    } >&2
    return 1
  fi
  return 0
}

# assert_not_contains <needle> <haystack> [label]
assert_not_contains() {
  local needle="$1" haystack="$2" label="${3:-content exclusion}"
  if [[ "$haystack" == *"$needle"* ]]; then
    {
      echo "ASSERT FAIL [$label]: did not expect to find:"
      echo "  >> $needle"
      echo "  in:"
      echo "$haystack" | sed 's/^/  | /'
    } >&2
    return 1
  fi
  return 0
}
