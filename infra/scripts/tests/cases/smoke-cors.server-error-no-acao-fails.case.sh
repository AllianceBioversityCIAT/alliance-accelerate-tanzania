#!/usr/bin/env bash
#
# smoke-cors.server-error-no-acao-fails.case.sh (T-6, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-6's non-2xx/5xx clause: a 500 with NO
# Access-Control-Allow-Origin must FAIL, not PASS. This is the case that a
# naive "PASS whenever ACAO is absent" implementation gets wrong — absence
# of ACAO is necessary for a pass but not sufficient; the response also has
# to actually be a successful preflight answer.
#
# Assertion target: the SUMMARY's "FAIL  CORS boundary…" line, 2>&1
# captured — never the exit code (design.md §7.2).
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
    printf 'HTTP/1.1 500 Internal Server Error\r\n'
    printf 'Date: Wed, 18 Sep 2026 00:00:00 GMT\r\n'
    printf '\r\n'
    printf '\nHTTP_STATUS:500\n'
    exit 0
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

assert_contains "FAIL  CORS boundary" "$output" "a 500 with no ACAO must FAIL the CORS check, never PASS on absence alone"
assert_not_contains "PASS  CORS boundary" "$output" "a server error is not a rejection"
