#!/usr/bin/env bash
#
# 000-placeholder.case.sh — proves the runner discriminates (T-1)
# ---------------------------------------------------------------------------
# Not a guard test — no guard exists yet (T-2 builds _guard.sh). This case
# exercises the two pieces of machinery T-1 delivers: the assertion helper
# (tests/lib/assert.sh) and the stub-PATH device (tests/stubs/*), so every
# later task's real case can trust both before relying on them.
#
# THIS FILE IS THE T-1 FALSIFIER. Its intentionally-wrong assertion was run
# once to prove run-tests.sh exits non-zero on a failing case (see T-1's
# completion report for the transcript); it is committed here already
# fixed, so it becomes a permanent, real, passing sanity case rather than a
# dangling failure that would block every subsequent task's Verify.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

# 1. The assertion helper itself — exit-status and content-matching forms.
assert_status 0 0 "sanity: equal statuses pass"
assert_contains "world" "hello world" "sanity: substring found"
assert_not_contains "xyz" "hello world" "sanity: substring absent"

# 2. The stub-PATH device: configure a scripted `aws` response and confirm
#    the STUB (never a real CLI, never the network — NFR-2) answers it.
RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<'EOF'
#!/usr/bin/env bash
echo "stubbed-account-012345678901"
exit 0
EOF

set +e
stdout="$(STUB_AWS_SCRIPT="$RECIPE" aws sts get-caller-identity --query Account --output text)"
status=$?
set -e

assert_status 0 "$status" "sanity: stubbed aws exits 0"
assert_contains "stubbed-account" "$stdout" "sanity: stubbed aws stdout reaches the case"
