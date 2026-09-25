#!/usr/bin/env bash
#
# wire.enumeration-source-precedes-external-commands.case.sh (T-4, static)
# ---------------------------------------------------------------------------
# requirements.md FR-1/FR-2/NFR-4; design.md §7.2; tasks.md T-4 clause (a).
#
# Enumerates every non-library infra/scripts/*.sh (files whose basename
# starts with "_" are libraries and are excluded, same convention as
# _guard.sh itself) and asserts TWO things per script:
#   1. It sources _guard.sh somewhere.
#   2. After stripping comment-only and blank lines, no line matching
#      (^|[^[:alnum:]_])(aws|sam|curl|npm|npx)([^[:alnum:]_]|$) — a portable
#      ERE word-boundary equivalent, see below — PRECEDES the source line.
#
# THE ECHO-STRING GOTCHA (tasks.md T-4): validate.sh contains a non-comment
# line — `echo "==> Validating all infra templates with sam validate
# --lint"` — whose quoted STRING contains the token "sam", even though it
# is not invoking sam at all. A checker that reports "the first line
# matching the network-command regex" as "the first external command"
# would mislabel this line. This case sidesteps that trap DELIBERATELY: it
# never asks "what is the first external command" (a semantic question this
# regex cannot answer — it cannot tell a real invocation from a mention
# inside a string). It only asks the POSITIONAL question the requirement
# actually needs answered — "does any such line come BEFORE the source
# line" — by comparing line numbers. Since the source line is placed
# immediately after `set -euo pipefail` in every one of these scripts, the
# echo string (which comes many lines later) can never produce a false
# failure here, and a genuinely misordered guard (source moved below a real
# `aws`/`sam` call) reddens this case regardless of how many string-only
# mentions exist elsewhere in the file — PROVIDED the matcher itself fires.
# It previously did not: `\b(aws|sam|curl|npm|npx)\b` is a GNU-libc regex
# extension, and bash `=~` compiles through the platform's `regcomp`, which
# on macOS/BSD treats `\b` as the literal character `b`, so the pattern
# matched nothing on this machine and the positional branch below never
# ran. The matcher is now a portable ERE, and the positive control further
# down asserts directly that it recognises an invocation-shaped token and
# rejects a look-alike (`sammy`, `npmrc`) — without that control this exact
# regression is invisible, since nothing else here changes colour if the
# matcher goes silent again. Position, not identification, is what the
# positional check asserts; the control below asserts the matcher can see
# the tokens at all.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

FAILED=0

for script in "$SCRIPTS_DIR"/*.sh; do
  base="$(basename "$script")"
  [[ "$base" == _* ]] && continue   # libraries (e.g. _guard.sh) are excluded

  # Strip full-line comments and blank lines, keep 1-based line numbers of
  # what remains, so "position" is measured against the stripped stream —
  # a 20-60 line USAGE/PREREQUISITES header full of "aws"/"sam"/"npm" prose
  # must never be mistaken for a real invocation.
  # bash 3.2 has no `mapfile` — this machine's default /bin/bash is 3.2
  # (T-1's own precedent: "bash-3.2-safe with no GNU-isms"). Process
  # substitution into a `while read` loop is portable to it.
  source_idx=""
  first_ext_idx=""
  while IFS= read -r entry; do
    lineno="${entry%%:*}"
    content="${entry#*:}"
    if [[ -z "$source_idx" && "$content" == *"_guard.sh"* && "$content" == *"source"* ]]; then
      source_idx="$lineno"
    fi
    if [[ -z "$first_ext_idx" && "$content" =~ (^|[^[:alnum:]_])(aws|sam|curl|npm|npx)([^[:alnum:]_]|$) ]]; then
      first_ext_idx="$lineno"
    fi
  done < <(grep -nv -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$script")

  if [[ -z "$source_idx" ]]; then
    echo "ASSERT FAIL [enumeration]: $base does not source _guard.sh" >&2
    FAILED=1
    continue
  fi

  if [[ -n "$first_ext_idx" && "$first_ext_idx" -lt "$source_idx" ]]; then
    echo "ASSERT FAIL [enumeration]: $base has a network-capable-command-shaped line at $first_ext_idx, before its source line at $source_idx" >&2
    FAILED=1
  fi
done

# Matcher positive control: the loop above degrades to a presence-only
# assertion if the ERE ever stops matching real invocation tokens (this is
# exactly what happened with the prior `\b`-based pattern under BSD/macOS
# regcomp — first_ext_idx stayed empty forever and this control would have
# caught it immediately). Assert directly, independent of any script's
# content, that the matcher (a) recognises an invocation-shaped string and
# (b) does not false-positive on a look-alike token that merely contains
# one of the command names as a substring.
positive_probe="aws s3 sync x y"
negative_probe="sammy npmrc curlicue"
if [[ "$positive_probe" =~ (^|[^[:alnum:]_])(aws|sam|curl|npm|npx)([^[:alnum:]_]|$) ]]; then
  matcher_positive=0
else
  matcher_positive=1
fi
assert_status 0 "$matcher_positive" "matcher recognises an invocation-shaped string ('$positive_probe')"

if [[ "$negative_probe" =~ (^|[^[:alnum:]_])(aws|sam|curl|npm|npx)([^[:alnum:]_]|$) ]]; then
  matcher_negative=1
else
  matcher_negative=0
fi
assert_status 0 "$matcher_negative" "matcher does not false-positive on look-alike tokens ('$negative_probe')"

if [[ "$FAILED" -ne 0 ]]; then
  exit 1
fi

# Positive control: confirm the enumeration actually found something to
# check (the zero-case trap's cousin — an empty glob would vacuously pass).
count=0
for script in "$SCRIPTS_DIR"/*.sh; do
  base="$(basename "$script")"
  [[ "$base" == _* ]] && continue
  count=$((count + 1))
done
assert_status 0 "$([[ "$count" -ge 7 ]] && echo 0 || echo 1)" "enumeration covers at least the 7 known operator scripts (found $count)"
