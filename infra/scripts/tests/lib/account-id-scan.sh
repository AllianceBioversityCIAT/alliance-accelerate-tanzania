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
#
# THE RETURN IS SPELLED OUT, AND IT IS NOT `return 0` (SonarCloud
# shelldre:S7682, shelldre:S7679). This is a PREDICATE: before this form it
# read `[[ "$1" =~ ^[0-9]{12}$ ]]` as the last command, so the function's
# exit status WAS the test's result. S7682 asks for an explicit return at
# the end of a function — and satisfying it the obvious way, by appending
# `return 0`, makes this predicate ALWAYS TRUE: every 13-or-more-digit run
# would then be accepted as account-id-shaped and the length filter would
# be silently disarmed, which is the exact defect class this spec exists to
# remove. The if/return form below satisfies the rule and keeps the
# semantics identical; the positive controls in
# guard-account.no-account-id-literal-in-infra.case.sh redden immediately
# if it ever regresses to an unconditional return.
is_account_id_shaped() {
  local candidate="$1"
  if [[ "$candidate" =~ ^[0-9]{12}$ ]]; then
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# EXTRACTION (F-4a) — the digit run is the TRAILING field of a `grep -rno`
# hit, so take it from the right, not by stripping a "path:line:" prefix
# from the left. The prefix-stripping form this replaces —
# `sed -E 's/^[^:]*:[^:]*://' | tr -cd '0-9'` — assumed no path component
# contains a colon. When one does, the two `[^:]*` fields consume the wrong
# segments, `tr -cd '0-9'` then CONCATENATES the digits left over from the
# path with the matched run, and the result is a longer string that
# is_account_id_shaped rejects: a real forbidden id under such a path is
# silently cleared. Taking the trailing run cannot do that — a non-digit
# (the final colon grep itself emits) always separates the match from
# whatever precedes it.
#
# `${hit##*[^0-9]}` strips the LONGEST prefix ending in a non-digit
# character, leaving exactly the trailing digit run. Pure parameter
# expansion: no subprocess, and nothing for a tampered PATH to intercept.
#
# extract_digit_run <grep -rno hit>
#   Echoes the trailing run of digits from a `path:line:digits` hit.
extract_digit_run() {
  local hit="$1"
  printf '%s' "${hit##*[^0-9]}"
  # Unlike is_account_id_shaped above, this function's exit status carries
  # no meaning — every caller reads its STDOUT through `$(...)`. An
  # explicit `return 0` is therefore both what S7682 asks for and the
  # correct contract: it also stops a stray printf failure from aborting a
  # caller running under `set -e`.
  return 0
}

# ---------------------------------------------------------------------------
# SCAN EXCLUSIONS (F-4b) — the tree being scanned is a WORKING directory,
# not the git index, so it can legitimately contain build output that no
# gate should judge. SAM's build trees live one per stack, at
# `infra/<NN>-<stack>/.aws-sam/build` (deploy.sh and set-cors.sh both point
# BACKEND_BUILD_DIR at `20-backend/.aws-sam/build`) — NOT at
# `infra/.aws-sam/`, which does not exist. They are gitignored by root
# .gitignore's line 1, `.aws-sam/`, which matches that basename at any
# depth, exactly as `--exclude-dir=.aws-sam` does.
#
# What a built tree contains is a bundled Lambda — the backend's compiled
# JavaScript and its production dependencies — which is generated output
# and can carry any 12-digit constant, an account id among them. (An
# earlier revision of this comment asserted a specific mechanism: that
# `sam build` writes a packaged template whose S3 URIs embed the account
# id. That is wrong twice over — `sam build` is offline and emits local
# `CodeUri` paths, and these scripts run `sam deploy` straight from the
# built template with no `--output-template-file`, so no packaged template
# is written to disk at all. The exclusion is right; the reason given for
# it was invented.)
#
# Without the exclusion the gate reds on any checkout where someone has
# run a deploy — a finding about generated files the repository does not
# version, reported as if an account id had been committed. The gate's
# subject is what is VERSIONED under infra/; these three directories never
# are.
#
# Exposed as an array, not inlined at the call site, so the real scan and
# its controls cannot diverge on what they exclude.
ACCOUNT_SCAN_EXCLUDES=(
  --exclude-dir=.aws-sam
  --exclude-dir=node_modules
  --exclude-dir=.git
)

# scan_for_account_ids <root>
#   Echoes one `path:line:digits` hit per exactly-12-digit run found under
#   <root> that is NOT cleared by the caller, so the real scan and every
#   control share one loop — the property H-2 proved cannot be left
#   unpinned.
#
#   CALLER CONTRACT: the caller MUST define an `is_allowed <id>` function,
#   returning 0 for an id the scan should clear. That function — not any
#   array — is what this scan consults; an earlier revision of this comment
#   said the allow-list was "read from the ALLOWED_IDS array in the
#   caller's scope", which this function never touches. A caller that
#   followed that comment and defined only the array would have hit
#   `is_allowed: command not found` inside `! is_allowed`, clearing
#   nothing and reporting every shaped hit — loud and fail-closed, but for
#   an invented reason. The precondition below now names the real
#   requirement instead of letting it surface as a 127.
#
#   Returns 0 whether or not violations were found (they are on stdout); 2
#   on any failure to complete the scan — a missing predicate, no temp
#   file, or a real grep error (grep status > 1) — with the reason on
#   stderr. A caller distinguishes "clean" from "could not scan" by the
#   exit status, never by empty stdout.
scan_for_account_ids() {
  local root="$1" matches grep_status=0 hit id err_file err

  if ! declare -F is_allowed >/dev/null; then
    echo "scan_for_account_ids: the caller must define an is_allowed() predicate (see CALLER CONTRACT)" >&2
    return 2
  fi

  # grep's own stderr goes to a file, never folded into the hits with
  # `2>&1` — the same defect F-1 removed from resolve_stack_value, which
  # it would be absurd to reintroduce in the round that removed it. A
  # folded warning line has no `path:line:` prefix, so extract_digit_run
  # would read its trailing digits as if they were a match.
  if ! err_file="$(mktemp 2>/dev/null)"; then
    echo "scan_for_account_ids: could not create a temp file for grep's stderr" >&2
    return 2
  fi

  # if/else rather than `set +e` … `set -e`: the previous form switched
  # errexit ON for any caller that had it off, mutating the caller's shell
  # options as a side effect of being called.
  if matches="$(grep -rnoE -I "${ACCOUNT_SCAN_EXCLUDES[@]}" "$DIGIT_RUN_RE" "$root" 2>"$err_file")"; then
    grep_status=0
  else
    grep_status=$?
  fi
  err="$(cat "$err_file" 2>/dev/null || true)"
  rm -f "$err_file" 2>/dev/null || true

  if [[ "$grep_status" -gt 1 ]]; then
    echo "scan_for_account_ids: grep failed over '$root' (status $grep_status):" >&2
    if [[ -n "$err" ]]; then
      echo "$err" >&2
    fi
    return 2
  fi

  if [[ "$grep_status" -eq 1 ]]; then
    return 0
  fi

  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    id="$(extract_digit_run "$hit")"
    # A 13+-digit run is excluded here, not at the regex step — see the
    # header. Only an exactly-12-digit run off the allow-list is a
    # violation.
    if is_account_id_shaped "$id" && ! is_allowed "$id"; then
      printf '%s\n' "$hit"
    fi
  done <<< "$matches"
  return 0
}
