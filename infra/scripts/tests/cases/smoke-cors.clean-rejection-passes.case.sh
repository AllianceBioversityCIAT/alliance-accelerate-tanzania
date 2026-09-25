#!/usr/bin/env bash
#
# smoke-cors.clean-rejection-passes.case.sh (T-6, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-6's PASS clause — the only one of the five directions
# where the CORS check must PASS: GIVEN a well-formed preflight for a
# disallowed origin returns 2xx/204 with NO Access-Control-Allow-Origin
# WHEN smoke.sh runs THEN the CORS check PASSes.
#
# This is the mandatory falsifier case (tasks.md T-6 / design.md §10): a
# CORS check that unconditionally FAILs satisfies every one of the other
# four cases and would redden every pipeline build after merge, since
# RUN_SMOKE=true fails closed. Without this case, that defect is invisible.
#
# Assertion target: the SUMMARY's "PASS  CORS boundary…" line, 2>&1
# captured — never the exit code. smoke.sh's overall exit is still non-zero
# here (the health/frontend/S3 checks fail against the unconfigured-for-them
# stub), which is exactly why this case does not assert the script's exit
# status at all.
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
    printf 'Vary: Origin\r\n'
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

assert_contains "PASS  CORS boundary" "$output" "a clean 204 with no ACAO must PASS the CORS check"
assert_not_contains "FAIL  CORS boundary" "$output" "a genuine rejection must never be reported as a failure"
