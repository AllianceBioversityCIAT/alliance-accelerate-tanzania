#!/usr/bin/env bash
#
# _guard.sh — ACCELERATE Tanzania Seed Registry (infra/scripts, T-2 → T-3 → T-8)
# ---------------------------------------------------------------------------
# PURPOSE
#   The single shared guard library for infra/scripts/*.sh (design.md §7.1;
#   requirements.md FR-1, FR-2, FR-3′, FR-5; NFR-4). This file is meant to be
#   SOURCED, never executed, as the first statement after
#   `set -euo pipefail` in every operator script it protects — sourcing,
#   not a function call a caller could forget, is what makes the profile
#   floor and override unconditional.
#
#   T-2, T-5, and T-8 together deliver the library's current
#   responsibilities: the profile floor and the override (T-2),
#   resolve_stack_value (T-5), and announce_account (T-8, FR-3′). T-3's
#   assert_account — an account ASSERTION, comparing the resolved account
#   against a committed expected value — shipped, was reviewed, and passed,
#   then was withdrawn by the Pivot recorded in execution.md
#   (`## Pivot Record: FR-3`) and replaced by T-8's announce_account: an
#   ANNOUNCEMENT, with nothing to compare against.
#
#   announce_account is an EXPLICIT function call, not something that runs
#   on `source` — see the section below for why. It is called by the five
#   writing infra/scripts/*.sh scripts only (T-8); validate.sh and smoke.sh
#   remain exempt (DD-6, unchanged by the Pivot).
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
#   GUARD_DIR is not exported. T-3's assert_account was its one reader,
#   using it to locate infra/aws-accounts.conf one directory up from this
#   file; withdrawn with assert_account by the Pivot (T-8) — no function in
#   this file reads GUARD_DIR any more. Kept because the resolution itself
#   is proven correct on its own by
#   guard-profile.resolves-own-path-not-caller.case.sh, independent of any
#   one caller.
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

# ── 3. Account announcement (FR-3′) ─────────────────────────────────────
# EXPLICIT CALL ONLY — unlike the floor/override above, announce_account
# does NOT run on `source`. FR-3′ exempts the two read-only scripts
# (validate.sh, smoke.sh); an announcement that ran automatically on
# source could not honour that exemption without adding a flag, so every
# WRITING script must call announce_account itself, before its first
# write.
#
# THIS IS AN ALERT, NOT A GATE (execution.md `## Pivot Record: FR-3`;
# requirements.md FR-3′). T-3's assert_account compared the resolved
# account against a committed expected value and aborted on mismatch;
# that comparison — and the config file it read from — is withdrawn.
# There is no expected account any more, and this function must never
# grow one back: it only PRINTS the resolved account id and the effective
# profile to stderr, and NEVER changes the exit status.
#   - success: prints the account and profile, returns 0.
#   - `sts get-caller-identity` failure: prints that the call failed and
#     why, and STILL returns 0 — fail SOFT. The announcement is
#     observability; its own failure cannot be a gate.
# Callers must never wrap this call in `||` or inspect its return value —
# there is nothing meaningful to inspect.
#
# Captured via a temp file, never `2>&1` (validation finding A-02 named
# assert_account, this function's predecessor, as one of the two sites in
# this codebase making that mistake; the fix here is the same device
# infra/jenkins/deploy-backend-cors.patch already uses for the other).
announce_account() {
  local err_file rc=0 account err
  # The temp-file ACQUISITION is itself fallible (an unwritable TMPDIR, an
  # exhausted template) and, unlike the `aws` call below, was not
  # originally guarded: a bare `err_file="$(mktemp)"` assignment propagates
  # mktemp's failure straight into the caller's `set -euo pipefail`,
  # turning the announcement's own bookkeeping into a gate — exactly what
  # FR-3′ forbids. Guard it the same way as the `aws` call: capture the
  # failure explicitly and return 0 before doing anything else.
  if ! err_file="$(mktemp 2>/dev/null)"; then
    echo "==> Could not create a temp file for the account announcement — skipping it (FR-3′; informational only)." >&2
    return 0
  fi
  account="$(aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" --query Account --output text 2>"$err_file")" || rc=$?
  # Both of these are bare statements too. `err="$(cat "$err_file")"` is a
  # plain (non-`local`) assignment, so under `set -e` a failing `cat` (the
  # file vanishing between creation and here, a permissions change) would
  # abort the caller the same way the unguarded mktemp did — guard it the
  # same way. `rm -f` already swallows "no such file", but not e.g. a
  # parent directory that turned read-only; `|| true` makes it
  # unconditionally non-fatal, matching "the announcement is
  # observability, never a gate" for every statement in this function, not
  # just the `aws` call.
  err="$(cat "$err_file" 2>/dev/null || true)"
  rm -f "$err_file" 2>/dev/null || true

  if [[ "$rc" -eq 0 ]]; then
    echo "==> Resolved AWS account: $account (profile '$PROFILE')." >&2
  else
    echo "==> Could not resolve the AWS account for profile '$PROFILE' via sts get-caller-identity: $err" >&2
    echo "==> Continuing without it — this announcement is informational only (FR-3′; no account is asserted)." >&2
  fi

  return 0
}

# ── 4. resolve_stack_value — a stack Parameter or Output, with a defined
#      exit-code contract (FR-4, FR-5, NFR-4) ────────────────────────────
#
# resolve_stack_value <stack-name> <jmespath-query> <kind>
#   <kind> is "parameter" or "output" — it changes nothing about HOW the
#   value is fetched (both are a plain `describe-stacks --query ...
#   --output text`), only how a SUCCESSFUL-but-empty answer is classified
#   (see "Success-with-None" below). A helper hardcoded to one JMESPath
#   shape (e.g. always Outputs) could not have absorbed both of this
#   file's callers: the MailTransport sites query a Parameter
#   (Stacks[0].Parameters[?ParameterKey=='...']...) while deploy.sh's new
#   origin resolution needs an Output (CloudFrontUrl).
#
# CONTRACT (design.md §7.1 — this is the prescribed shape, not a summary
# of it; the call site MUST match it exactly, see below)
#   - The resolved value is printed on STDOUT, and ONLY on success.
#   - Exit 0 = found (value on stdout) · 2 = confirmed absent (nothing on
#     stdout) · 1 = abort (an error already printed to stderr).
#   - This function is always invoked inside a command substitution
#     ($(...)), which forks a subshell — so `return` here ends only that
#     subshell's function call, and `exit` would end only that subshell
#     process, never the caller. Either would behave identically at any
#     of this repo's call sites; `return` is used because it is correct
#     even in a hypothetical future caller that invokes this function
#     directly, without wrapping it in $(...).
#
# THE PRESCRIBED CALL-SITE SHAPE — an `if`/`else` alone cannot read a
# three-way contract; `if`/`else` splits zero from non-zero only, so 1 and
# 2 both land in the else-branch. The status MUST be captured as the
# FIRST statement of that branch, or anything before it (an `echo`
# included) clobbers $?:
#
#   if VALUE="$(resolve_stack_value "$STACK" "$QUERY" parameter)"; then
#     …use VALUE…
#   else
#     rc=$?
#     case "$rc" in
#       2) …announced bootstrap… ;;
#       *) …abort… ;;
#     esac
#   fi
#
# Callers MUST NOT wrap the call in `local`, `||`, or a pipeline — all
# three discard the exit status this contract depends on.
#
# SUCCESS-WITH-`None` — classified explicitly, not left to re-checking at
# every call site (that re-checking is the exact duplication NFR-4
# removes). A stack that EXISTS but has no such key returns exit 0 and
# the literal string "None" (or empty text). For a Parameter query this
# is folded into "absent" (exit 2) — a stack predating the parameter is
# the same bootstrap case as a stack that does not exist yet. For an
# Output query it is NOT folded in: it ABORTS. A frontend stack that
# exists but exports no CloudFrontUrl is a BROKEN deployment, not a
# bootstrap, and silently returning `*` for it would contradict FR-4's
# "only where the stack genuinely does not exist".
#
# ABSENT vs. FAILED — the reason this function exists at all (FR-5). A
# `describe-stacks` call that FAILS and a stack that genuinely does not
# EXIST both make the underlying AWS CLI invocation come back with empty
# stdout — `2>/dev/null || true`, the exact defect in the unversioned
# Jenkinsfile (design.md §7.4), cannot tell them apart, and neither can
# emptiness alone. This function classifies on the ERROR TEXT: absence
# requires BOTH the "ValidationError" token AND the literal absent-stack
# phrasing CloudFormation actually uses, "does not exist" — never
# "ValidationError" alone, which ALSO covers a malformed stack
# name and parameter-constraint violations, i.e. failures, not absences.
# Anything else (an expired token, a throttle, an IAM denial, a malformed
# name) aborts, with the AWS CLI's own error text surfaced on stderr so
# the operator sees exactly what failed.
#
# ACCEPTED RESIDUAL, not a gate (requirements.md FR-5; tasks.md T-5): a
# WELL-FORMED but MISSPELLED stack name IS a nonexistent stack to
# CloudFormation and produces the identical "does not exist" text. No
# error-text rule can separate that typo from a genuine bootstrap: this
# function would legitimately return 2 for it, and a caller like
# deploy.sh would go on to create a stack under the typo'd name. The
# failure is visible (a stray stack appears) rather than silent, and is
# accepted on that basis — this is NOT the same clause as "malformed",
# which means CloudFormation itself rejected the name as ill-formed
# (a real ValidationError with no absent-stack phrasing) and is caught.
resolve_stack_value() {
  local stack="$1" query="$2" kind="$3"
  local raw

  if raw="$(
    aws cloudformation describe-stacks \
      --profile "$PROFILE" --region "$REGION" \
      --stack-name "$stack" \
      --query "$query" --output text 2>&1
  )"; then
    if [[ -z "$raw" || "$raw" == "None" ]]; then
      if [[ "$kind" == "output" ]]; then
        echo "ERROR: stack '$stack' exists but query \"$query\" resolved no value (None)." >&2
        echo "       That is a broken deployment, not an absent stack — refusing to" >&2
        echo "       treat it as a bootstrap (FR-4)." >&2
        return 1
      fi
      return 2
    fi
    echo "$raw"
    return 0
  fi

  # Two-token classification, per the block comment above: ValidationError
  # ALONE is not enough — it also fires for a malformed stack
  # name, which is a failure this function must abort on.
  if [[ "$raw" == *ValidationError* && "$raw" == *"does not exist"* ]]; then
    return 2
  fi

  echo "ERROR: resolve_stack_value: describe-stacks failed for stack '$stack' (query: $query):" >&2
  echo "$raw" >&2
  return 1
}
