#!/usr/bin/env bash
#
# guard-account.no-account-id-literal-in-infra.case.sh
# (T-8, static check — widens T-3's guard-account.no-account-id-literal-in-scripts,
# then INVERTED at T-8 rework attempt 3)
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
#   ANY 12-digit run under infra/ as suspect, except the ones on the
#   allow-list below, all of which are test fixtures used elsewhere in
#   this suite (never the real account, which is exactly why none of
#   them ever trips it there). That is both narrower (an incidental
#   12-digit substring inside a longer number, e.g. a 13+-digit hash-like
#   token, is not flagged — see the boundary discussion below) and wider
#   (catches a FUTURE real account id too, sight unseen) than the literal
#   check it replaces.
#
# THE ALLOW-LIST, derived by grepping this tree (never trust a prior
# report's list without re-deriving it): every 12-digit run currently
# under infra/ is a deliberately fake test fixture —
#   111111111111 222222222222 333333333333 444444444444 555555555555
#   888888888888 (repeated-digit fixtures, various guard-account/
#   guard-profile/wire cases)
#   000000000001 (the "stack exists, minimal/placeholder account" fixture
#   used across the resolve-* and wire.* cases)
#   012345678901 (000-placeholder.case.sh's harness self-test fixture)
# None of these is, or resembles, the real account id.
#
# BOUNDARY REGEX, NOT \b (FP-7) — POSIX ERE has no \b, and BSD grep -E
# (macOS) silently treats a literal `\b` as no-op rather than erroring,
# which is exactly how T-4 shipped a dead word-boundary check that looked
# correct and matched nothing. `(^|[^0-9])[0-9]{12}([^0-9]|$)` uses only
# POSIX ERE anchors and character classes: it matches 12 digits with a
# non-digit (or line start/end) on both sides, so a 12-digit substring
# embedded inside a longer digit run (11 digits short, or 13+ digits
# long) never matches — every window inside a longer run has a digit
# neighbour on at least one side. The positive control below proves this
# pattern is alive, not just plausible-looking, before it is trusted
# against the real tree.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
INFRA_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"

# One definition, used both by the positive control below and the real
# scan — so the control is provably testing the SAME pattern the scan
# uses, never a stale copy that could drift from it.
NEEDLE_RE='(^|[^0-9])[0-9]{12}([^0-9]|$)'

# ── Positive control (FP-7) — prove the matcher is alive before trusting it ──
# Uses an already-allow-listed fixture id (never a fresh 12-digit literal)
# so this planted "should match" string does not itself become a
# violation when the real scan below scans this very file — this case
# lives under infra/ too.
if ! printf '%s\n' "prefix111111111111suffix" | grep -qE "$NEEDLE_RE"; then
  echo "ASSERT FAIL [positive control]: NEEDLE_RE does not match a planted 12-digit run" >&2
  exit 1
fi
if printf '%s\n' "prefix12345678901suffix" | grep -qE "$NEEDLE_RE"; then
  echo "ASSERT FAIL [positive control]: NEEDLE_RE wrongly matches an 11-digit run" >&2
  exit 1
fi
if printf '%s\n' "prefix1234567890123suffix" | grep -qE "$NEEDLE_RE"; then
  echo "ASSERT FAIL [positive control]: NEEDLE_RE wrongly matches a 13-digit run" >&2
  exit 1
fi

# ── The fixture allow-list (derived from this tree — see header) ───────────
ALLOWED_IDS=(
  "111111111111"
  "222222222222"
  "333333333333"
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

# ── The real scan: every boundary-safe 12-digit run anywhere under infra/ ──
set +e
matches="$(grep -rnoE "$NEEDLE_RE" "$INFRA_DIR" 2>&1)"
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
    # Strip the "path:line:" prefix grep -n adds, then keep only digits —
    # whatever boundary character NEEDLE_RE captured (or none, at a line
    # edge) falls away, leaving exactly the 12-digit run itself.
    id="$(printf '%s' "$hit" | sed -E 's/^[^:]*:[^:]*://' | tr -cd '0-9')"
    if ! is_allowed "$id"; then
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
