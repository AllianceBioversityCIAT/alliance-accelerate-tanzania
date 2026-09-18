#!/usr/bin/env bash
#
# _guard.sh — ACCELERATE Tanzania Seed Registry (infra/scripts, T-2 → T-3)
# ---------------------------------------------------------------------------
# PURPOSE
#   The single shared guard library for infra/scripts/*.sh (design.md §7.1;
#   requirements.md FR-1, FR-2, FR-3, FR-5; NFR-4). This file is meant to be
#   SOURCED, never executed, as the first statement after
#   `set -euo pipefail` in every operator script it protects — sourcing,
#   not a function call a caller could forget, is what makes the profile
#   floor and override unconditional.
#
#   T-2 and T-3 together deliver three of the library's four eventual
#   responsibilities: the profile floor, the override, and (as of T-3)
#   assert_account. The fourth is a later task and MUST NOT be inferred as
#   present here:
#     - resolve_stack_value   (FR-5) — arrives in T-5
#
#   assert_account is an EXPLICIT function call, not something that runs on
#   `source` — see the section below for why. Wiring calls to it into the
#   five writing infra/scripts/*.sh scripts (the "every operator script it
#   protects" above) is T-4's job, not T-3's. As of T-3, zero scripts
#   source this file or call assert_account — that is expected, not a gap;
#   the not-yet-present resolve_stack_value above is the one remaining
#   genuine gap.
#
# WHAT RUNS ON SOURCE (no call required — this is the point of FR-1/FR-2)
#   1. Resolve PROFILE from AWS_PROFILE, defaulting to the mandated
#      'IBD-DEV' — a FLOOR, never a fallback of last resort. Resolve REGION
#      the same way against AWS_REGION / 'eu-west-1'. Both are exported so
#      every script (and this library's own later functions) share one
#      resolution.
#   2. If PROFILE diverges from 'IBD-DEV', require an explicit, VALUE-
#      CARRYING override — ALLOW_NON_IBD_DEV_PROFILE must equal the
#      effective PROFILE exactly. Never AWS_PROFILE (the variable that
#      caused ATP-65 cannot be the variable that authorises it) and never
#      CONFIRM (teardown.sh/migrate-seed.sh's old, deliberately-superseded
#      mechanism — see those scripts' current USAGE lines, corrected by
#      T-7). A match proceeds AND announces on stderr; anything else — set
#      but different, or absent — aborts non-zero, naming BOTH the found
#      and the expected profile.
#   3. NO TTY BRANCH. A non-interactive run fails closed with no prompt at
#      all — there is no `[[ -t 0 ]]` anywhere in this file, unlike the
#      migrate-seed.sh/teardown.sh guard blocks this supersedes.
#
# WHY `exit`, NOT `return` (design.md §7.1)
#   This library is always sourced at a script's top level, so a bare
#   `return` would also work there (bash lets a sourced file `return` from
#   the `source` command itself, even outside a function) — but it would
#   make this file's behaviour depend on the caller's own `set -e` being
#   in effect. `exit` ends the process outright, unconditionally, which is
#   what "the floor is not optional" requires. The cost: sourcing this
#   file directly at a shell's own top level would end that shell too —
#   which is exactly why guard-unit tests MUST invoke it inside a nested
#   subshell (a further `bash -c` or `( … )`), never at the test case's own
#   top level (tasks.md T-2; design.md §7.1).
#
# OWN-PATH RESOLUTION — ${BASH_SOURCE[0]%/*}, NEVER $0
#   In a sourced file, $0 names the CALLER (the script that did the
#   sourcing), not this file — using it here would resolve nothing (or the
#   wrong directory) whenever this library is sourced from a script that
#   itself isn't in this same directory. ${BASH_SOURCE[0]%/*} is this
#   file's own path with its last path segment stripped, independent of
#   $0, of the caller's cwd, and of how the caller was itself invoked.
#   GUARD_DIR is not exported — only this file's own functions need it.
#   assert_account (below) uses it to locate infra/aws-accounts.conf one
#   directory up from this file, never relative to the caller or to the
#   script's own cwd.
# ---------------------------------------------------------------------------

GUARD_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"

# ── 1. The profile floor (FR-1) ─────────────────────────────────────────
# A FLOOR: IBD-DEV is what every script targets unless explicitly and
# narrowly overridden below — never a "${VAR:-default}" fallback of last
# resort, which is the exact defect this spec exists to remove.
export PROFILE="${AWS_PROFILE:-IBD-DEV}"
export REGION="${AWS_REGION:-eu-west-1}"

if [[ "$PROFILE" != "IBD-DEV" ]]; then
  # ── 2. The override (FR-2) ────────────────────────────────────────────
  # Deliberately NOT AWS_PROFILE and NOT CONFIRM — a dedicated,
  # value-carrying variable that must equal the effective profile exactly.
  # A boolean flag (any non-empty value authorises) would re-create the
  # exact hazard design.md §6.1 diagnoses in CONFIRM=yes: a stale export
  # in a shell rc silently authorising every future foreign profile.
  if [[ "${ALLOW_NON_IBD_DEV_PROFILE:-}" == "$PROFILE" ]]; then
    echo "==> ALLOW_NON_IBD_DEV_PROFILE=$PROFILE set — proceeding against non-default AWS profile '$PROFILE' (not 'IBD-DEV')." >&2
  else
    # ── No TTY branch here — a non-interactive run fails closed with no
    # prompt at all. Names BOTH the found and the expected profile.
    echo "ERROR: AWS profile is '$PROFILE', but this project requires 'IBD-DEV' (root CLAUDE.md hard constraint)." >&2
    echo "       Re-run with ALLOW_NON_IBD_DEV_PROFILE=$PROFILE to explicitly authorise this one profile." >&2
    exit 1
  fi
fi

# ── 3. Account assertion (FR-3) ─────────────────────────────────────────
# EXPLICIT CALL ONLY — unlike the floor/override above, assert_account
# does NOT run on `source`. FR-3 exempts the two read-only scripts
# (validate.sh, smoke.sh); an assertion that ran automatically on source
# could not honour that exemption without adding a flag, so every WRITING
# script must call assert_account itself. Wiring that call into the five
# writing scripts is T-4's job — as of T-3, nothing calls it.
#
# The expected account id is never a literal in this file (or in any
# infra/scripts/*.sh file) — it is read from infra/aws-accounts.conf, one
# directory above this one (design.md §7.3; requirements.md FR-3's "not
# hardcoded" clause). A future Prod account is therefore a one-line
# addition to that config file, never a code change (OQ-INFRA-1).
#
# That config file is PARSED with `awk -F=`, and is NEVER `source`d: a row
# shaped like `IBD-DEV=<account id>` is not a valid bash assignment (a
# hyphen is illegal in a bash identifier), so `source`-ing it under
# `set -euo pipefail` would abort every script on a *correct* profile —
# a fail-closed guard against CORRECT input, the sign-reversed shape
# KZ-002 / judgment.md S-6 records. (No account id is quoted here or
# anywhere in infra/scripts/*.sh — see infra/aws-accounts.conf, which is
# the one place it is allowed to appear, and is not itself a .sh file.)
assert_account() {
  local conf="$GUARD_DIR/../aws-accounts.conf"

  if [[ ! -f "$conf" ]]; then
    echo "ERROR: account config file not found: $conf (FR-3 requires infra/aws-accounts.conf)." >&2
    exit 1
  fi

  # Comment and blank lines are skipped before matching, so a line like
  # "# IBD-DEV=note" can never be mistaken for a real row. A row whose key
  # does not match $PROFILE is ignored, including a row using AWS_PROFILE
  # itself as the value would be — this reads only PROFILE.
  local expected
  expected="$(awk -F= -v key="$PROFILE" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    $1 == key { print $2; exit }
  ' "$conf")"

  if [[ -z "$expected" ]]; then
    echo "ERROR: no account id configured for AWS profile '$PROFILE' in $conf." >&2
    echo "       Add a '$PROFILE=<12-digit account id>' row to that file." >&2
    exit 1
  fi

  # Malformed: a row exists but its value is not exactly 12 digits — an
  # AWS account id always is. Abort rather than comparing a value that
  # could never match, naming the same file as the missing-row case above.
  if [[ ! "$expected" =~ ^[0-9]{12}$ ]]; then
    echo "ERROR: malformed account id for AWS profile '$PROFILE' in $conf: '$expected' (expected exactly 12 digits)." >&2
    exit 1
  fi

  local actual
  if ! actual="$(aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" --query Account --output text 2>&1)"; then
    echo "ERROR: could not resolve the AWS account for profile '$PROFILE': $actual" >&2
    exit 1
  fi

  if [[ "$actual" != "$expected" ]]; then
    # The collision clause (FR-3's hardest one): a stack of the expected
    # name existing under $actual is NOT evidence of safety — only the
    # account id is trusted here, never a stack name, which can and does
    # collide across accounts.
    echo "ERROR: AWS profile '$PROFILE' resolved to account '$actual', but $conf expects account '$expected' for that profile." >&2
    echo "       Aborting — a matching stack name in the wrong account proves nothing (FR-3)." >&2
    exit 1
  fi

  echo "==> assert_account: profile '$PROFILE' verified against expected account $expected." >&2
}
