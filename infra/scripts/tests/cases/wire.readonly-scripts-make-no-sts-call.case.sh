#!/usr/bin/env bash
#
# wire.readonly-scripts-make-no-sts-call.case.sh (T-4, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-3's read-only exemption; design.md DD-6; tasks.md T-4
# clause (d).
#
# validate.sh and smoke.sh get FR-1/FR-2 (they source _guard.sh) but MUST
# NOT call assert_account. This is proven with the stub marker technique
# (design.md §7.2's own recommendation for clause (d)), not by inspection:
# STUB_AWS_SCRIPT is configured to touch a marker file on EVERY invocation
# (not merely one matching "sts get-caller-identity") and then exit
# non-zero. Both scripts are expected to make ZERO `aws` invocations of any
# kind on this run — validate.sh's only external commands are `sam
# validate --lint` calls (a separate STUB_SAM_SCRIPT answers those), and
# smoke.sh's Check 1 wiring resolution is bypassed entirely by presetting
# API_BASE_URL / CLOUDFRONT_URL / BUCKET (design.md §7.2, the same setup
# T-6 will reuse) so it never calls `aws cloudformation describe-stacks`
# either. So "the marker was never touched" proves the stronger claim
# (no aws call at all), which implies the clause under test (no sts call).
#
# smoke.sh's curl calls are deliberately left with no STUB_CURL_SCRIPT
# configured: they fail loudly (the curl stub's own "unconfigured" exit
# 127) and are caught by smoke.sh's own pass()/fail() accounting, so the
# script still runs to completion. This case does not assert smoke.sh's
# overall exit status — only that assert_account was never reached.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

# ── validate.sh ──────────────────────────────────────────────────────────
AWS_MARKER="$(mktemp -u)"
SAM_RECIPE="$(mktemp)"
AWS_RECIPE="$(mktemp)"
trap 'rm -f "$AWS_MARKER" "$SAM_RECIPE" "$AWS_RECIPE"' EXIT

cat > "$SAM_RECIPE" <<'EOF2'
#!/usr/bin/env bash
echo "template.yaml is a valid SAM Template"
exit 0
EOF2

cat > "$AWS_RECIPE" <<EOF2
#!/usr/bin/env bash
touch "$AWS_MARKER"
echo "STUB: unexpected aws invocation from a read-only script: \$*" >&2
exit 1
EOF2

env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION -u STUB_AWS_SCRIPT -u STUB_SAM_SCRIPT \
    AWS_PROFILE=IBD-DEV \
    STUB_SAM_SCRIPT="$SAM_RECIPE" \
    STUB_AWS_SCRIPT="$AWS_RECIPE" \
    bash "$SCRIPTS_DIR/validate.sh" </dev/null >/dev/null 2>&1 || true

if [[ -e "$AWS_MARKER" ]]; then
  echo "ASSERT FAIL [validate.sh makes no sts/aws call]: marker exists — aws was invoked" >&2
  exit 1
fi
rm -f "$AWS_MARKER"

# ── smoke.sh ─────────────────────────────────────────────────────────────
env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION -u STUB_AWS_SCRIPT \
    AWS_PROFILE=IBD-DEV \
    STUB_AWS_SCRIPT="$AWS_RECIPE" \
    API_BASE_URL="https://example-api.eu-west-1.amazonaws.com" \
    CLOUDFRONT_URL="https://example.cloudfront.net" \
    BUCKET="example-bucket" \
    bash "$SCRIPTS_DIR/smoke.sh" </dev/null >/dev/null 2>&1 || true

if [[ -e "$AWS_MARKER" ]]; then
  echo "ASSERT FAIL [smoke.sh makes no sts/aws call]: marker exists — aws was invoked" >&2
  exit 1
fi
