#!/usr/bin/env bash
#
# run-tests.sh — ACCELERATE Tanzania Seed Registry (infra/scripts/tests, T-1)
# ---------------------------------------------------------------------------
# PURPOSE
#   Dependency-free bash test harness for infra/scripts/*.sh (NFR-1, NFR-2;
#   design.md §7.2). Discovers every case, runs each in isolation, and
#   reports PASS/FAIL per case with a summary — the same shape as
#   validate.sh: a loop over discovered items, per-item progress, a summary,
#   non-zero exit if anything failed.
#
#   Two kinds of case live under cases/, distinguished only by what the case
#   script itself does — this runner treats both identically, because each
#   case already runs as its own subprocess (see below):
#     - guard-unit          sources a library (e.g. _guard.sh, from T-2
#                            onward) and calls its functions directly. A
#                            sourced `exit` only ends the case's own
#                            subprocess, never this runner.
#     - script-integration  runs a whole infra/scripts/*.sh script under the
#                            stubbed PATH below.
#
# HERMETICITY (NFR-2)
#   Every case runs with a fixture PATH prepended so the network-capable
#   commands — aws, curl, sam, npm, npx — resolve to stub executables under
#   stubs/ instead of the real tools. Text tools (awk, grep, sed, dirname,
#   jq) are NOT stubbed: they touch no network and must run for real, or a
#   gate like "aws-accounts.conf is parsed with awk, not sourced" would be
#   testing the stub instead of the guard.
#
# CASE DISCOVERY AND CONTRACT
#   Only infra/scripts/tests/cases/*.case.sh is treated as a case. Any other
#   file in that directory (a fixture, a stub recipe a case points at via
#   STUB_AWS_SCRIPT etc.) is ignored by discovery, so a case's supporting
#   files can live alongside it without being executed as a case themselves.
#
#   A case is a bash script, invoked as `bash "$case_file"` below — no
#   execute bit needed. Exit 0 = PASS, any non-zero = FAIL. A case that
#   wants to assert should source tests/lib/assert.sh; the first failed
#   assertion returns non-zero, and under the case's own
#   `set -euo pipefail` that ends the case with a non-zero status.
#
# THE ZERO-CASE TRAP (KZ-002)
#   A loop over zero cases has zero failures, so a naive runner reports
#   success on a checkout with no tests registered at all — this is the
#   first thing this task must disprove about itself. This runner asserts
#   the discovered count is greater than zero BEFORE running anything, and
#   treats zero as a hard failure, never a vacuous pass.
#
# ENVIRONMENT EVERY CASE RUNS UNDER
#   PATH                stubs/ prepended (network-capable commands only)
#   SKIP_MIGRATE_PAUSE  yes — part of the script-integration environment
#                       defined in design.md §7.2. It makes deploy.sh take
#                       the explicit skip branch at its `SKIP_MIGRATE_PAUSE`
#                       check rather than the non-interactive fallback below
#                       it. It is NOT what prevents a hang: that prompt is
#                       `[[ -t 0 ]]`-gated on its own (migrate-seed.sh has no
#                       prompt of its own since T-4 removed its profile-
#                       override branch), so the stdin redirection below is
#                       what actually makes a hang impossible.
#   stdin               /dev/null — so no case can block on a `read`
#
#   Nothing here touches AWS_PROFILE or credentials: individual cases set
#   those themselves, per scenario (T-2 onward).
#
# ASYMMETRY (root CLAUDE.md)
#   A passing case prints the `── running … ──` banner plus `PASS`. A
#   failing case's full stdout+stderr is printed verbatim — that output is
#   the evidence a Reviewer audits.
#
# USAGE
#   ./infra/scripts/tests/run-tests.sh
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Resolve paths relative to this script, so it runs from any CWD ─────────
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASES_DIR="$TESTS_DIR/cases"
STUBS_DIR="$TESTS_DIR/stubs"

echo "==> Deploy-script guardrails test harness"
echo "    cases=$CASES_DIR"
echo "    stubs=$STUBS_DIR"
echo

# ── Discover cases: infra/scripts/tests/cases/*.case.sh only ───────────────
# A plain glob, not `find | sort`, so this stays portable to BSD/macOS tools
# (no `sort -z`/GNU-only flags) — bash expands a glob in sorted order on its
# own. The `[[ -e ]]` guard handles the no-match case without relying on
# `nullglob`, which this script does not set.
declare -a CASES=()
if [[ -d "$CASES_DIR" ]]; then
  for f in "$CASES_DIR"/*.case.sh; do
    [[ -e "$f" ]] || continue
    CASES+=("$f")
  done
fi

CASE_COUNT="${#CASES[@]}"
echo "==> Discovered $CASE_COUNT case(s)"

# The zero-case trap (KZ-002): a runner that finds nothing to run must not
# report success. Fail loudly and stop before the (vacuous) loop below —
# an empty loop has zero failures, which is exactly the false "success"
# this task exists to rule out.
if [[ "$CASE_COUNT" -eq 0 ]]; then
  echo "==> FAIL: zero cases discovered under $CASES_DIR" >&2
  echo "    A suite with nothing to run is not a passing suite." >&2
  exit 1
fi
echo

# ── Run each case, isolated, under the hermetic stubbed environment ────────
declare -a RESULTS=()
PASS_COUNT=0
FAIL_COUNT=0

for case_file in "${CASES[@]}"; do
  name="$(basename "$case_file" .case.sh)"
  echo "── running $name ────────────────────────────────────────────"

  set +e
  output="$(
    PATH="$STUBS_DIR:$PATH" \
    SKIP_MIGRATE_PAUSE=yes \
    bash "$case_file" </dev/null 2>&1
  )"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    RESULTS+=("PASS  $name")
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "    PASS"
  else
    RESULTS+=("FAIL  $name")
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "    FAIL (exit $status)"
    # Asymmetry rule: failures print complete and verbatim — this output
    # is the evidence, never truncated or summarised.
    echo "    ── output ──────────────────────────────────────────────"
    echo "$output" | sed 's/^/    /'
    echo "    ────────────────────────────────────────────────────────"
  fi
  echo
done

# ── Summary ──────────────────────────────────────────────────────────────
echo "==> Test summary ($CASE_COUNT case(s): $PASS_COUNT passed, $FAIL_COUNT failed)"
for line in "${RESULTS[@]}"; do
  echo "    $line"
done

if [[ "$FAIL_COUNT" -ne 0 ]]; then
  echo "==> One or more cases FAILED." >&2
  exit 1
fi

echo "==> All cases passed."
