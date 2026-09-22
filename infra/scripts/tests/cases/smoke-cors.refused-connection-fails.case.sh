#!/usr/bin/env bash
#
# smoke-cors.refused-connection-fails.case.sh (T-6, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-6's transport-failure clause: a refused connection
# proves nothing about the CORS boundary and MUST NOT be read as a
# rejection (PASS). Simulates curl's own connection-refused behaviour: no
# stdout, a curl-style error on stderr, exit 7 — the way real curl fails
# when nothing is listening.
#
# Assertion target: the SUMMARY's "FAIL  CORS boundary…" line, 2>&1
# captured — never the exit code (design.md §7.2). smoke.sh's own `set -e`
# is not tripped because Check 6 traps the curl failure via the `if
# CORS_RAW="$(...)"` capture, exactly the same call-site discipline
# resolve_stack_value uses (design.md §7.1) — a failed command inside `if`
# does not abort under errexit.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

CURL_RECIPE="$(mktemp)"
trap 'rm -f "$CURL_RECIPE"' EXIT

cat > "$CURL_RECIPE" <<'EOF2'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *"-X OPTIONS"*)
    echo "curl: (7) Failed to connect to cors-smoke-check.invalid port 443: Connection refused" >&2
    exit 7
    ;;
  *)
    echo "STUB: non-CORS curl call, not exercised by this case (args: $args)" >&2
    exit 1
    ;;
esac
EOF2

output="$(
  env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION -u STUB_CURL_SCRIPT \
    AWS_PROFILE=IBD-DEV \
    STUB_CURL_SCRIPT="$CURL_RECIPE" \
    API_BASE_URL="https://example-api.eu-west-1.amazonaws.com" \
    CLOUDFRONT_URL="https://example.cloudfront.net" \
    BUCKET="example-bucket" \
    bash "$SCRIPTS_DIR/smoke.sh" </dev/null 2>&1
)" || true

assert_contains "FAIL  CORS boundary" "$output" "a refused connection must FAIL the CORS check, never PASS"
assert_not_contains "PASS  CORS boundary" "$output" "a refused connection proves nothing and must not read as a rejection"
