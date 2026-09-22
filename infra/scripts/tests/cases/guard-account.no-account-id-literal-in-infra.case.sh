#!/usr/bin/env bash
#
# guard-account.no-account-id-literal-in-infra.case.sh
# (T-8, static check — widens T-3's guard-account.no-account-id-literal-in-scripts,
# INVERTED at T-8 rework attempt 3, extraction/length-filter split at T-8
# round 4 to close H-2)
# ---------------------------------------------------------------------------
# requirements.md FR-3′ requires that no account id be versioned under
# infra/, enforced by this case (see FR-3′'s acceptance criteria for the
# exact wording and its one deliberate historical exemption, which lives
# outside infra/ and is therefore never in this scan's scope).
#
# WHY INVERTED, NOT A LITERAL-MATCH CHECK (rework attempt 3)
#   Attempts 1-2 of this case grepped for the real account id — first
#   contiguous, then (after the Pivot removed infra/aws-accounts.conf)
#   still contiguous, held in a shell variable in THIS file so the file's
#   own needle definition would not match itself. The Reviewer found that
#   scoping self-falsifying: the two halves were built by string
#   concatenation across two assignments, deliberately shaped so the
#   recursive grep below would never see them as one contiguous literal
#   — which means a real account id WAS versioned under infra/, in
#   reconstructible split form, in the very file whose job is to prove
#   none is. (Deliberately not reproduced here, even as an example — doing
#   so would re-commit the identical split-literal residency this
#   paragraph is describing as a defect, in a third artefact.) A check
#   keyed to one known literal is also blind to the next one: if the
#   account ever changes, a same-shaped literal check would need editing
#   to catch it, and until then would pass right over it.
#
#   The check below does not know the real account id — no assignment,
#   split or otherwise, holds it anywhere in this file. Instead it treats
#   ANY exactly-12-digit run under infra/ as suspect, except the ones on
#   the allow-list below, all of which are cited by at least one OTHER
#   case in this suite (never the real account, which is exactly why none
#   of them ever trips it there). That is both narrower (a 13+-digit
#   hash-like token is not flagged — see the shape check below) and wider
#   (catches a FUTURE real account id too, sight unseen) than the literal
#   check it replaces.
#
# THE ALLOW-LIST. Every entry below is cited by at least one case file
# OTHER than this one — verified by grepping
# infra/scripts/tests/cases/*.case.sh EXCLUDING this file. That exclusion
# is load-bearing, not incidental: a list that lives inside the tree it
# scans cannot be "derived by grepping this tree" the way an earlier
# revision of this comment claimed — such a grep returns the list's own
# literals right back and confirms the draft rather than deriving
# anything. (Two repeated-digit fixtures — the ones beginning with a
# repeated "2" and a repeated "3", deliberately not spelled out again
# here since doing so would itself plant a fresh unlisted 12-digit run in
# this very file — survived a prior round on exactly that self-fulfilling
# non-derivation, cited nowhere outside this file; removed at T-8 round
# 4, from this array and from this header together, since removing them
# from the array alone while a prose mention of them remained in the
# header would have made this file flag itself.) The real constraint:
# this list is maintained by hand, and every entry must be checked
# against the *other* case files before it is added or kept.
#   111111111111 — guard-account.announce-not-invoked-on-source,
#     guard-profile.foreign-profile-aborts-before-aws-call,
#     guard-account.announce-stderr-not-stdout
#   444444444444 — guard-account.announce-includes-account-and-profile
#   555555555555 — guard-account.announce-never-changes-exit-status
#   888888888888 — wire.insitu-announce-account
#   000000000001 — the "stack exists, minimal/placeholder account" fixture
#     shared across the resolve-*.case.sh and wire.*.case.sh cases
#   012345678901 — 000-placeholder.case.sh's harness self-test fixture
# None of these is, or resembles, the real account id.
#
# EXTRACTION AND SHAPE CHECK, NOT A BOUNDARY-CONSUMING REGEX (H-2, T-8
# round 4) — the prior pattern, `(^|[^0-9])[0-9]{12}([^0-9]|$)`, matched a
# 12-digit run only when flanked by a non-digit (or line start/end) on
# both sides, so a 12-digit substring embedded inside a longer digit run
# never matched. That was the right SHAPE but the wrong MECHANISM: the
# non-digit boundary characters were CONSUMED by the match, and `grep -o`
# resumes scanning immediately after whatever it consumed. Two 12-digit
# runs separated by a single non-digit character therefore reported as
# ONE match — the second run, including a real forbidden id sitting right
# next to an allow-listed fixture on the same line, was never emitted at
# all. See H-2 in execution.md; falsifier (an already allow-listed
# fixture id stands in here for a forbidden one, so this comment does not
# itself plant a fresh, unlisted 12-digit literal under infra/):
#   $ printf '%s\n' "fixtures: 111111111111 444444444444" \
#       | grep -oE '(^|[^0-9])[0-9]{12}([^0-9]|$)'
#    111111111111
#   (only one line of output — the second run is invisible)
#
# The fix is a like-for-like swap, not a redesign, and reproduces the old
# boundary semantics exactly without ever consuming a separator:
#   1. Extract every run of 12-OR-MORE digits (DIGIT_RUN_RE, from
#      tests/lib/account-id-scan.sh). This pattern consumes nothing but
#      the digits themselves, so two runs separated by a single
#      non-digit are two separate matches.
#   2. Reject any hit whose digit length is not EXACTLY 12
#      (is_account_id_shaped, same file). An 11-digit run never reaches
#      this step at all (DIGIT_RUN_RE requires at least 12 digits to
#      match in the first place); a 13+-digit run reaches it and is
#      excluded here — the same two exclusions the old single regex made
#      in one step, now made in two, with no boundary consumption
#      anywhere.
#
# Both primitives live in tests/lib/account-id-scan.sh, sourced below,
# rather than being defined inline here a second time: that file is also
# sourced by the multiplicity control
# (guard-account.no-account-id-literal-in-infra-reports-adjacent-matches.case.sh),
# so the two can never drift apart.
#
# POSIX ERE only, no \b (FP-7) — BSD grep -E (macOS) silently treats a
# literal `\b` as a no-op instead of erroring, which is exactly how T-4
# shipped a dead word-boundary check that looked correct and matched
# nothing. Also no `grep -P` — not portable to BSD grep. The positive
# control below proves both DIGIT_RUN_RE and is_account_id_shaped are
# alive, not just plausible-looking, before either is trusted against the
# real tree.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/account-id-scan.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
INFRA_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"

# ── Positive control (FP-7) — prove the matcher is alive before trusting it ──
# Uses an already-allow-listed fixture id (never a fresh 12-digit literal)
# so this planted "should match" string does not itself become a
# violation when the real scan below scans this very file — this case
# lives under infra/ too.
if ! printf '%s\n' "prefix111111111111suffix" | grep -qE "$DIGIT_RUN_RE"; then
  echo "ASSERT FAIL [positive control]: DIGIT_RUN_RE does not match a planted 12-digit run" >&2
  exit 1
fi
if printf '%s\n' "prefix12345678901suffix" | grep -qE "$DIGIT_RUN_RE"; then
  echo "ASSERT FAIL [positive control]: DIGIT_RUN_RE wrongly matches an 11-digit run" >&2
  exit 1
fi
# Unlike the retired NEEDLE_RE, DIGIT_RUN_RE is REQUIRED to match a
# 13-digit run at the extraction step — "12 or more" digits, by design —
# because the exclusion now happens one step later, in
# is_account_id_shaped's exact-length check. Prove both halves so neither
# can silently regress into re-flagging (or wrongly clearing) a
# 13-digit run.
if ! printf '%s\n' "prefix1234567890123suffix" | grep -qE "$DIGIT_RUN_RE"; then
  echo "ASSERT FAIL [positive control]: DIGIT_RUN_RE must match a 13-digit run at the extraction step (exclusion happens at the shape-check step, not here)" >&2
  exit 1
fi
if is_account_id_shaped "1234567890123"; then
  echo "ASSERT FAIL [positive control]: is_account_id_shaped wrongly accepts a 13-digit run" >&2
  exit 1
fi
if is_account_id_shaped "12345678901"; then
  echo "ASSERT FAIL [positive control]: is_account_id_shaped wrongly accepts an 11-digit run" >&2
  exit 1
fi
if ! is_account_id_shaped "111111111111"; then
  echo "ASSERT FAIL [positive control]: is_account_id_shaped rejects a genuine 12-digit run" >&2
  exit 1
fi

# ── The fixture allow-list (see header — every entry cited elsewhere) ──────
ALLOWED_IDS=(
  "111111111111"
  "444444444444"
  "555555555555"
  "888888888888"
  "000000000001"
  "012345678901"
)

is_allowed() {
  local id="$1" candidate
  for candidate in "${ALLOWED_IDS[@]}"; do
    [[ "$id" == "$candidate" ]] && return 0
  done
  return 1
}

# ── The real scan: every exactly-12-digit run anywhere under infra/ ────────
set +e
matches="$(grep -rnoE "$DIGIT_RUN_RE" "$INFRA_DIR" 2>&1)"
grep_status=$?
set -e

# grep exit codes: 0 = matched something, 1 = no match at all (fine — no
# violations to check), >1 = a real grep error (a failure regardless of
# the allow-list).
if [[ "$grep_status" -gt 1 ]]; then
  echo "ASSERT FAIL [no 12-digit run outside the fixture allow-list]: grep error: $matches" >&2
  exit 1
fi

violations=""
if [[ "$grep_status" -eq 0 ]]; then
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    # Strip the "path:line:" prefix grep -n adds, leaving exactly the
    # digit run DIGIT_RUN_RE matched (it consumes no boundary character,
    # so nothing but digits is left to strip here).
    id="$(printf '%s' "$hit" | sed -E 's/^[^:]*:[^:]*://' | tr -cd '0-9')"
    # A 13+-digit run is excluded here, not at the regex step — see
    # header. Only an exactly-12-digit run not on the allow-list is a
    # violation.
    if is_account_id_shaped "$id" && ! is_allowed "$id"; then
      violations+="$hit"$'\n'
    fi
  done <<< "$matches"
fi

if [[ -n "$violations" ]]; then
  echo "ASSERT FAIL [no 12-digit run outside the fixture allow-list]: found:" >&2
  echo "$violations" | sed 's/^/  | /' >&2
  exit 1
fi

# The file that used to be the one legal home for the account id must no
# longer exist at all (the Pivot's explicit instruction: deleted, not
# emptied).
if [[ -e "$INFRA_DIR/aws-accounts.conf" ]]; then
  echo "ASSERT FAIL [aws-accounts.conf must be deleted]: $INFRA_DIR/aws-accounts.conf still exists" >&2
  exit 1
fi
