#!/usr/bin/env bash
#
# account-id-scan.sh — shared matching primitives for the "no account id
# literal in infra/" gate (T-8 round 4, closing H-2)
# ---------------------------------------------------------------------------
# Sourced by BOTH guard-account.no-account-id-literal-in-infra.case.sh (the
# real scan) and
# guard-account.no-account-id-literal-in-infra-reports-adjacent-matches.case.sh
# (the multiplicity control), so neither can drift from the other. That
# coupling is deliberate and load-bearing: H-2 survived three review rounds
# precisely because the scan's matching behaviour and its multiplicity
# property were never pinned to the same definition, so a change to one was
# never provably visible to a test of the other. A single source of truth
# makes that structurally impossible — revert this file's DIGIT_RUN_RE to a
# boundary-consuming pattern and the multiplicity control reds immediately,
# not eventually.
#
# EXTRACTION AND SHAPE CHECK, NOT A BOUNDARY-CONSUMING REGEX (H-2) — the
# retired pattern, `(^|[^0-9])[0-9]{12}([^0-9]|$)`, matched a 12-digit run
# only when flanked by a non-digit (or line start/end) on both sides, so a
# 12-digit substring embedded inside a longer digit run never matched. That
# was the right SHAPE but the wrong MECHANISM: the non-digit boundary
# characters were CONSUMED by the match, and `grep -o` resumes scanning
# immediately after whatever it consumed. Two 12-digit runs separated by a
# single non-digit character therefore reported as ONE match — the second
# run, including a real forbidden id sitting right next to an allow-listed
# fixture on the same line, was never emitted at all. Falsifier (an
# already allow-listed fixture id stands in here for a forbidden one, so
# this comment does not itself plant a fresh, unlisted 12-digit literal
# under infra/):
#   $ printf '%s\n' "fixtures: 111111111111 444444444444" \
#       | grep -oE '(^|[^0-9])[0-9]{12}([^0-9]|$)'
#    111111111111
#   (only one line of output — the second run is invisible)
#
# The fix reproduces the old boundary semantics exactly without ever
# consuming a separator, by splitting one regex into two independent steps:
#   1. Extract every run of 12-OR-MORE digits (DIGIT_RUN_RE). This pattern
#      consumes nothing but the digits themselves, so two runs separated by
#      a single non-digit are two separate matches.
#   2. Reject any hit whose digit length is not EXACTLY 12
#      (is_account_id_shaped). An 11-digit run never reaches this step at
#      all (DIGIT_RUN_RE requires at least 12 digits to match in the first
#      place); a 13+-digit run reaches it and is excluded here — the same
#      two exclusions the old single regex made in one step, now made in
#      two, with no boundary consumption anywhere.
#
# POSIX ERE only, no \b (FP-7) — BSD grep -E (macOS) silently treats a
# literal `\b` as a no-op instead of erroring, which is exactly how T-4
# shipped a dead word-boundary check that looked correct and matched
# nothing. Also no `grep -P` — not portable to BSD grep.
# ---------------------------------------------------------------------------

DIGIT_RUN_RE='[0-9]{12,}'

# is_account_id_shaped <string>
#   True iff <string> is made up of exactly 12 digits and nothing else.
is_account_id_shaped() {
  [[ "$1" =~ ^[0-9]{12}$ ]]
}
