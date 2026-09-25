#!/usr/bin/env bash
#
# smoke-cors.echoed-origin-fails.case.sh (T-6, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-6's second clause: GIVEN the API echoes the disallowed
# origin back in Access-Control-Allow-Origin WHEN smoke.sh runs THEN the
# CORS check FAILs — an echo is a permissive answer, not a rejection.
#
# This is the case that a "compare only against '*'" implementation would
# get wrong (design.md §10 / tasks.md T-6 falsifier list): the response is a
# clean 204 with a present ACAO, but ACAO is the disallowed origin itself
# rather than the literal "*". The disallowed origin here is the exact
# literal smoke.sh sends (CORS_DISALLOWED_ORIGIN in smoke.sh) — kept in sync
# by hand since the stub cannot introspect the script under test.
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
    printf 'HTTP/1.1 204 No Content\r\n'
    printf 'Access-Control-Allow-Origin: https://cors-smoke-check.invalid\r\n'
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

assert_contains "FAIL  CORS boundary" "$output" "an echoed disallowed origin must FAIL the CORS check"
assert_contains "ECHOED BACK" "$output" "the failure message names the echo, not a generic mismatch"
assert_not_contains "PASS  CORS boundary" "$output" "an echoed origin must never be reported as a pass"
