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
# All four primitives live in tests/lib/account-id-scan.sh, sourced below,
# rather than being defined inline here: that file is also sourced by the
# multiplicity control
# (guard-account.no-account-id-literal-in-infra-reports-adjacent-matches.case.sh),
# so the two can never drift apart. Alongside DIGIT_RUN_RE and
# is_account_id_shaped it holds extract_digit_run (F-4a — the hit's digit
# run is taken from the RIGHT, so a colon or a digit inside a path segment
# cannot leak into the extracted id) and the scan itself,
# scan_for_account_ids, which carries ACCOUNT_SCAN_EXCLUDES (F-4b — the
# gitignored .aws-sam/ build tree, node_modules/ and .git/ are generated or
# vendored, never versioned content, and a `sam build` artefact embedding
# the real account id in an S3 URI is not a committed secret).
#
# THE SCAN IS A FUNCTION, SO ITS LOOP IS TESTABLE. Every clearance this
# case reports is preceded by controls that run the SAME loop against a
# purpose-built temp tree outside infra/: a forbidden id in versioned
# content must be reported, the same id adjacent to an allow-listed fixture
# must be reported (H-2's shape, now exercised end-to-end and not only
# through the matcher), and the same id under .aws-sam/ must NOT be. The
# forbidden fixture is built at runtime from a repeated digit — writing a
# fresh unlisted 12-digit literal into this file would itself violate the
# rule this file enforces.
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

# ── Extraction controls (F-4a) — prove the extractor before trusting it ────
# A colon inside a path segment is the case the retired prefix-stripping
# form got wrong: it consumed the wrong two fields and `tr -cd` then glued
# the path's own digits onto the match, producing an over-long string that
# the shape check CLEARS. Both fixtures below use an allow-listed id so
# this file plants no fresh 12-digit literal under infra/.
if [[ "$(extract_digit_run "a/b.sh:42:111111111111")" != "111111111111" ]]; then
  echo "ASSERT FAIL [extraction control]: plain hit mis-extracted" >&2
  exit 1
fi
if [[ "$(extract_digit_run "we:ird/pa9th:7:111111111111")" != "111111111111" ]]; then
  echo "ASSERT FAIL [extraction control]: a colon and digits in the PATH leak into the extracted id — this is exactly the defect F-4a closes" >&2
  exit 1
fi
if [[ "$(extract_digit_run "trailing9digits9:12:111111111111")" != "111111111111" ]]; then
  echo "ASSERT FAIL [extraction control]: digits immediately before the separator leak into the extracted id" >&2
  exit 1
fi

# ── Scan controls (F-4a, F-4b) — end-to-end, through the real loop ────────
# Built at runtime from a repeated digit, never written here as a literal:
# a forbidden 12-digit literal in THIS file would be a violation of the
# very rule this file enforces (the trap the header describes).
forbidden="$(printf '9%.0s' {1..12})"
if ! is_account_id_shaped "$forbidden"; then
  echo "ASSERT FAIL [scan control]: the runtime-built forbidden fixture is not 12 digits" >&2
  exit 1
fi
if is_allowed "$forbidden"; then
  echo "ASSERT FAIL [scan control]: the forbidden fixture is on the allow-list — pick another" >&2
  exit 1
fi

# ── Caller-contract control — the precondition must itself be able to fire ─
# scan_for_account_ids requires the caller to define is_allowed(). That
# precondition was added and, on its first run, NO mutation reddened any
# case: deleting it left the suite at 50/50, which makes it a gate that
# cannot fail (KZ-002) — added in the same round that exists to remove
# gates like it. This control closes that. A nested `bash -c` sources the
# library WITHOUT defining the predicate; it must refuse with exit 2 and
# say why, rather than surfacing as `is_allowed: command not found`.
LIB="$TESTS_DIR/lib/account-id-scan.sh"
export LIB
set +e
contract_out="$(
  bash -c 'set -euo pipefail; source "$LIB"; scan_for_account_ids /tmp' </dev/null 2>&1
)"
contract_status=$?
set -e
assert_status 2 "$contract_status" \
  "scan_for_account_ids with no is_allowed() defined: refuses with 2, never scans"
assert_contains "must define an is_allowed" "$contract_out" \
  "the refusal names the missing predicate (not a bare 'command not found')"

control_root="$(mktemp -d)"
trap 'rm -rf "$control_root"' EXIT
mkdir -p "$control_root/.aws-sam/build" "$control_root/versioned"

# (a) A forbidden id in ordinary versioned content MUST be reported —
#     otherwise every clearance below is vacuous.
printf 'AccountId: %s\n' "$forbidden" > "$control_root/versioned/template.yaml"
# (b) The SAME id adjacent to an allow-listed one, separated by a single
#     non-digit: the H-2 shape, now exercised through the real scan loop
#     rather than only through the matcher (this is what the multiplicity
#     control could not reach).
printf 'fixtures: 111111111111 %s end\n' "$forbidden" > "$control_root/versioned/adjacent.txt"
# (c) The same id inside the gitignored SAM build tree MUST NOT be
#     reported — it is generated output, not versioned content.
printf 's3://bucket/%s/packaged.yaml\n' "$forbidden" > "$control_root/.aws-sam/build/packaged.yaml"

control_hits="$(scan_for_account_ids "$control_root")"

if ! printf '%s' "$control_hits" | grep -q 'versioned/template.yaml'; then
  echo "ASSERT FAIL [scan control (a)]: a forbidden id in versioned content was NOT reported — the scan cannot discriminate, so its clean result against infra/ proves nothing:" >&2
  printf '%s\n' "$control_hits" | sed 's/^/  | /' >&2
  exit 1
fi
if ! printf '%s' "$control_hits" | grep -q 'versioned/adjacent.txt'; then
  echo "ASSERT FAIL [scan control (b)]: a forbidden id sitting next to an allow-listed fixture was NOT reported — H-2 has regressed inside the scan loop:" >&2
  printf '%s\n' "$control_hits" | sed 's/^/  | /' >&2
  exit 1
fi
if printf '%s' "$control_hits" | grep -q '.aws-sam'; then
  echo "ASSERT FAIL [scan control (c)]: the gitignored .aws-sam build tree was scanned — the gate would red on generated output rather than on versioned content (F-4b):" >&2
  printf '%s\n' "$control_hits" | sed 's/^/  | /' >&2
  exit 1
fi

rm -rf "$control_root"
trap - EXIT

# ── The real scan: every exactly-12-digit run versioned under infra/ ───────
set +e
violations="$(scan_for_account_ids "$INFRA_DIR")"
scan_status=$?
set -e

if [[ "$scan_status" -ne 0 ]]; then
  echo "ASSERT FAIL [no 12-digit run outside the fixture allow-list]: the scan itself errored (see stderr above)" >&2
  exit 1
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
