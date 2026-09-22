#!/usr/bin/env bash
#
# smoke-cors.permissive-star-fails.case.sh (T-6, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-6's first clause: GIVEN the API answers a disallowed
# origin with `Access-Control-Allow-Origin: *` WHEN smoke.sh runs THEN the
# CORS check FAILs.
#
# Stubs curl so the CORS preflight (an OPTIONS request carrying Origin AND
# Access-Control-Request-Method — a bare OPTIONS matches no HTTP API route,
# design.md §7.2) gets back a clean 204 whose headers permissively echo "*"
# as Access-Control-Allow-Origin. Every OTHER curl call smoke.sh makes (the
# health, frontend, and S3 checks) is answered with a harmless failure —
# this case only cares about the CORS line in the final summary.
#
# The assertion target is the SUMMARY's "FAIL  CORS boundary…" line,
# captured with 2>&1 (design.md §7.2) — never smoke.sh's exit status, which
# is already non-zero because the other checks fail against the stub
# regardless of whether this check exists at all. Asserting the exit code
# instead is the falsifier this case exists to catch: deleting Check 6
# entirely would still leave the run non-zero.
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
    printf 'HTTP/1.1 204 No Content\r\n'
    printf 'Date: Wed, 18 Sep 2026 00:00:00 GMT\r\n'
    printf 'Access-Control-Allow-Origin: *\r\n'
    printf '\r\n'
    printf '\nHTTP_STATUS:204\n'
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

assert_contains "FAIL  CORS boundary" "$output" "permissive '*' must FAIL the CORS check"
assert_not_contains "PASS  CORS boundary" "$output" "a permissive '*' must never be reported as a pass"
