#!/usr/bin/env bash
#
# validate.sh — ACCELERATE Tanzania Seed Registry (infra/aws-deployment, T-7)
# ---------------------------------------------------------------------------
# PURPOSE
#   Local, no-cost gate that validates ALL THREE infra templates with
#   `sam validate --lint` before any deploy. This is the check operators
#   (and CI) run to catch template errors without touching live AWS — it
#   makes NO changes and creates NO resources (FR-1, design.md §10).
#
# PREREQUISITES
#   - AWS SAM CLI installed.
#   - Valid IBD-DEV credentials configured (sam validate resolves the
#     profile; --lint does region-aware linting). No resources are created.
#
# THIS IS SAFE TO RUN IN THE SDD AGENT LOOP — it only validates templates.
#
# USAGE
#   ./infra/scripts/validate.sh
#   AWS_PROFILE=IBD-DEV AWS_REGION=eu-west-1 ./infra/scripts/validate.sh
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Config (overridable via env; IBD-DEV / eu-west-1 defaults — NFR-1) ───────
PROFILE="${AWS_PROFILE:-IBD-DEV}"
REGION="${AWS_REGION:-eu-west-1}"

# Resolve infra/ root relative to this script so it runs from any CWD.
INFRA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# The three stacks, in deploy order (design.md §1).
STACK_DIRS=(10-data-auth 20-backend 30-frontend)

echo "==> Validating all infra templates with sam validate --lint"
echo "    profile=$PROFILE region=$REGION"
echo

# Track per-stack PASS/FAIL for the summary; non-zero exit if any fails.
declare -a RESULTS=()
OVERALL=0

for dir in "${STACK_DIRS[@]}"; do
  template="$INFRA_DIR/$dir/template.yaml"
  echo "── validating $dir ──────────────────────────────────────────"
  if sam validate --lint \
      --template "$template" \
      --profile "$PROFILE" --region "$REGION"; then
    RESULTS+=("PASS  $dir")
  else
    RESULTS+=("FAIL  $dir")
    OVERALL=1
  fi
  echo
done

# ── Per-stack PASS/FAIL summary ──────────────────────────────────────────────
echo "==> Validation summary"
for line in "${RESULTS[@]}"; do
  echo "    $line"
done

if [[ "$OVERALL" -ne 0 ]]; then
  echo "==> One or more templates FAILED validation." >&2
  exit 1
fi

echo "==> All templates valid."
