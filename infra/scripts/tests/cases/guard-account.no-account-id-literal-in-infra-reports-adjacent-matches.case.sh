#!/usr/bin/env bash
#
# guard-account.no-account-id-literal-in-infra-reports-adjacent-matches.case.sh
# (T-8 round 4 — the multiplicity control for H-2)
# ---------------------------------------------------------------------------
# guard-account.no-account-id-literal-in-infra.case.sh's own positive
# control (added at rework attempt 3, still in place) proves its matcher
# fires on A 12-digit run. It never proved the matcher fires on MORE THAN
# ONE 12-digit run on the same line — and that is exactly the gap H-2
# lived in: the retired boundary-consuming pattern,
# `(^|[^0-9])[0-9]{12}([^0-9]|$)`, matched exactly one 12-digit run out of
# two adjacent ones (it CONSUMED the separator between them, and `grep -o`
# resumes scanning immediately after whatever it consumed), so a
# forbidden id planted right next to an allow-listed fixture on the same
# line passed the gate green with the forbidden id fully intact. A
# match/no-match assertion (`grep -qE`) can never catch that: it answers
# "did anything match", never "how many things matched" — which is why
# this defect survived three review rounds using exactly that assertion
# style. See H-2 in execution.md.
#
# This case is the multiplicity assertion the gate lacked. It sources the
# SAME matcher definition the gate uses
# (tests/lib/account-id-scan.sh:DIGIT_RUN_RE) — never a hand-copied
# duplicate, which could silently drift from the real scan and stop
# meaning anything — and asserts DIGIT_RUN_RE reports TWO matches from one
# line carrying two 12-digit runs separated by a single non-digit
# character. Revert that shared file's DIGIT_RUN_RE to the retired
# boundary-consuming pattern and this case reds immediately, with no
# change needed here.
#
# WHY TWO ALLOW-LISTED IDS, NOT A FRESH LITERAL — this case file lives
# under infra/, so the real gate's own recursive scan reads THIS file's
# source too. A freshly invented 12-digit literal planted here to serve
# as test data would itself be an unlisted 12-digit run, and the gate
# would flag this very file as a violation. Reusing two ids already on
# guard-account.no-account-id-literal-in-infra.case.sh's allow-list
# sidesteps that: the gate's scan reports both of them (once H-2 is
# fixed) and its allow-list filters both, so this file scans clean, while
# THIS case's own assertion below independently confirms the matcher
# returned 2 hits for that line, not 1.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/account-id-scan.sh"

# Two DIFFERENT allow-listed fixture ids (both cited elsewhere in this
# suite — see guard-account.no-account-id-literal-in-infra.case.sh's
# header), adjacent, separated by a single non-digit (a space). This is
# the exact shape that defeated the retired boundary-consuming pattern.
two_adjacent_ids="fixtures: 111111111111 444444444444 end"

matches="$(printf '%s\n' "$two_adjacent_ids" | grep -oE "$DIGIT_RUN_RE")"
match_count="$(printf '%s\n' "$matches" | wc -l | tr -d '[:space:]')"

if [[ "$match_count" -ne 2 ]]; then
  echo "ASSERT FAIL [adjacency multiplicity]: expected 2 matches from two 12-digit runs separated by one non-digit character, got $match_count:" >&2
  echo "$matches" | sed 's/^/  | /' >&2
  exit 1
fi

# Both reported hits must independently be exactly-12-digit shaped —
# this control is about multiplicity, not shape, but a matcher that
# reports 2 hits of the wrong shape would be a different, equally real
# bug hiding behind a passing count.
while IFS= read -r hit; do
  [[ -z "$hit" ]] && continue
  if ! is_account_id_shaped "$hit"; then
    echo "ASSERT FAIL [adjacency multiplicity]: reported hit is not exactly 12 digits: '$hit'" >&2
    exit 1
  fi
done <<< "$matches"
