#!/usr/bin/env bash
#
# _guard.sh — ACCELERATE Tanzania Seed Registry (infra/scripts, T-2)
# ---------------------------------------------------------------------------
# PURPOSE
#   The single shared guard library for infra/scripts/*.sh (design.md §7.1;
#   requirements.md FR-1, FR-2, FR-3, FR-5; NFR-4). This file is meant to be
#   SOURCED, never executed, as the first statement after
#   `set -euo pipefail` in every operator script it protects — sourcing,
#   not a function call a caller could forget, is what makes the guard
#   unconditional.
#
#   T-2 delivers exactly two of the library's four eventual
#   responsibilities. The other two are later tasks and MUST NOT be
#   inferred as present here:
#     - assert_account       (FR-3) — arrives in T-3, with aws-accounts.conf
#     - resolve_stack_value   (FR-5) — arrives in T-5
#
#   Wiring this file into infra/scripts/*.sh (the "every operator script it
#   protects" above) is T-4's job, not T-2's. As of T-2, zero scripts
#   source it — that is expected, not a gap, exactly like the two
#   not-yet-present functions above.
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
#   GUARD_DIR is not exported (nothing outside this file needs it yet);
#   T-3 will use it to locate infra/aws-accounts.conf relative to this
#   file, never relative to the caller.
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
