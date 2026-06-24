#!/usr/bin/env bash
#
# smoke.sh — ACCELERATE Tanzania Seed Registry (infra/aws-deployment, T-9)
# ---------------------------------------------------------------------------
# PURPOSE
#   End-to-end smoke test + PII/consent boundary re-assertion OVER THE WIRE —
#   requirements FR-6, FR-8, NFR-5; design.md §10, §6 (PII/consent). After the
#   full deploy order (10-data-auth → migrate-seed → 20-backend → frontend
#   build/deploy → CORS lock), this probes the LIVE stacks and asserts:
#
#     1. Resolve wiring     — ApiBaseUrl (20-backend), CloudFrontUrl +
#                             FrontendBucketName (30-frontend) from stack outputs
#                             (override via API_BASE_URL / CLOUDFRONT_URL / BUCKET).
#     2. API health (FR-6)  — GET /api/v1/metrics and /api/v1/actors → 200, JSON.
#     3. PII boundary (NFR-5, the critical gate) — the /actors AND /metrics bodies
#                             contain NONE of the PII keys (phone, email, sex,
#                             position, marketLocation; case-insensitive), and the
#                             /actors body is the PII-safe list contract
#                             ({ data:[], page, pageSize, total }). Mirrors
#                             backend/src/test/pii-boundary.spec.ts intent.
#     4. Frontend (FR-5/6)  — CloudFront serves "/" and "/map" → 200.
#     5. S3 privacy (DD-5)  — a DIRECT S3 object URL → 403 (private bucket; only
#                             CloudFront via OAC may read).
#     6. Summary            — PASS/FAIL per check; non-zero exit if any FAIL.
#
#   NOTE — "renders LIVE data" is only partially machine-checkable here. The pages
#   serve over HTTPS but the actor/metrics DATA is fetched client-side by JS, so
#   curl sees the shell HTML, not the hydrated content. This script asserts the
#   API returns real, PII-safe data AND the pages serve 200; fully confirming the
#   metrics band + map render live data (not the offline "couldn't load" fallback)
#   is a FINAL MANUAL BROWSER CHECK (FR-6) recorded in the runbook.
#
#   FAIL-CLOSED: every check's result is captured (not allowed to abort early
#   under `set -e`) and summarised; the script exits non-zero if ANY check fails,
#   and the PII assertions in particular FAIL if a forbidden key ever appears.
#
# PREREQUISITES
#   - All three stacks deployed (CREATE/UPDATE_COMPLETE); migrate-seed.sh has run
#     (RDS seeded with the consented sample — no real PII); frontend built/synced
#     (deploy-frontend.sh) and CORS locked to the CloudFront origin (set-cors.sh).
#   - AWS CLI v2, jq, curl; valid IBD-DEV credentials (cloudformation:DescribeStacks).
#     curl needs no AWS profile — it hits the public HTTPS endpoints directly.
#
# THIS IS AN OPERATOR-RUN SCRIPT. It probes the LIVE deployed endpoints. It is NOT
# run by the SDD agent loop (nothing is deployed at authoring time). See
# infra/README.md (runbook — "End-to-end smoke").
#
# USAGE
#   ./infra/scripts/smoke.sh
#   API_BASE_URL=https://abc.execute-api.eu-west-1.amazonaws.com \
#     CLOUDFRONT_URL=https://d111.cloudfront.net \
#     BUCKET=accelerate-tz-dev-frontend-bucket ./infra/scripts/smoke.sh
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Config (overridable via env; IBD-DEV / eu-west-1 defaults — NFR-1) ───────
PROFILE="${AWS_PROFILE:-IBD-DEV}"
REGION="${AWS_REGION:-eu-west-1}"
BACKEND_STACK="${BACKEND_STACK:-accelerate-tz-dev-backend}"
FRONTEND_STACK="${FRONTEND_STACK:-accelerate-tz-dev-frontend}"

# The PII keys that must NEVER appear in a public response. This is the headline
# NFR-5 guarantee: the PublicActor projection carries none of these, and the
# checks below FAIL-CLOSE (exit non-zero) if any surfaces — a regression guard
# against a serializer/config change re-exposing PII over the wire. Mirrors the
# allowlist enforced in backend/src/test/pii-boundary.spec.ts.
PII_KEYS=(phone email sex position marketLocation)

# ── Result accounting (so each check is summarised even under `set -e`) ───────
# Each check appends "PASS <label>" or "FAIL <label>" to RESULTS and bumps the
# failure counter; we never let a failing check abort the run — we report it.
RESULTS=()
FAILS=0

pass() {
  RESULTS+=("PASS  $1")
  echo "    [PASS] $1"
}
fail() {
  RESULTS+=("FAIL  $1")
  FAILS=$((FAILS + 1))
  echo "    [FAIL] $1" >&2
}

# ── Helper: pull one OutputValue by OutputKey from a stack's Outputs JSON ─────
get_output() {
  local key="$1" json="$2" val
  val="$(jq -r --arg k "$key" '.[] | select(.OutputKey == $k) | .OutputValue' <<<"$json")"
  if [[ -z "$val" || "$val" == "null" ]]; then
    echo "ERROR: stack output '$key' not found (is the stack deployed under '$PROFILE'/'$REGION'?)." >&2
    exit 1
  fi
  printf '%s' "$val"
}

echo "==> ACCELERATE Tanzania end-to-end smoke — profile '$PROFILE', region '$REGION'."
echo

# ── Check 1: Resolve wiring from stack outputs ───────────────────────────────
# A missing/undeployed stack is a hard prerequisite failure (the smoke can't run
# at all), so this fails fast rather than degrading to a summarised FAIL line.
if [[ -n "${API_BASE_URL:-}" ]]; then
  echo "==> Using API_BASE_URL from env: $API_BASE_URL"
else
  echo "==> Resolving ApiBaseUrl from stack '$BACKEND_STACK' ..."
  BACKEND_OUTPUTS="$(
    aws cloudformation describe-stacks \
      --profile "$PROFILE" --region "$REGION" \
      --stack-name "$BACKEND_STACK" \
      --query "Stacks[0].Outputs" --output json
  )" || {
    echo "ERROR: could not describe stack '$BACKEND_STACK'." >&2
    exit 1
  }
  API_BASE_URL="$(get_output ApiBaseUrl "$BACKEND_OUTPUTS")"
fi

if [[ -n "${CLOUDFRONT_URL:-}" && -n "${BUCKET:-}" ]]; then
  echo "==> Using CLOUDFRONT_URL + BUCKET from env."
else
  echo "==> Resolving CloudFrontUrl + FrontendBucketName from stack '$FRONTEND_STACK' ..."
  FRONTEND_OUTPUTS="$(
    aws cloudformation describe-stacks \
      --profile "$PROFILE" --region "$REGION" \
      --stack-name "$FRONTEND_STACK" \
      --query "Stacks[0].Outputs" --output json
  )" || {
    echo "ERROR: could not describe stack '$FRONTEND_STACK'." >&2
    exit 1
  }
  CLOUDFRONT_URL="${CLOUDFRONT_URL:-$(get_output CloudFrontUrl "$FRONTEND_OUTPUTS")}"
  BUCKET="${BUCKET:-$(get_output FrontendBucketName "$FRONTEND_OUTPUTS")}"
fi

# Normalise: strip any trailing slash so "$URL/path" joins cleanly.
API_BASE_URL="${API_BASE_URL%/}"
CLOUDFRONT_URL="${CLOUDFRONT_URL%/}"

# Progress (all non-secret wiring values — NFR-2).
echo
echo "    ApiBaseUrl    = $API_BASE_URL"
echo "    CloudFrontUrl = $CLOUDFRONT_URL"
echo "    Bucket        = $BUCKET"
echo

# ── Helper: assert a JSON body has NONE of the PII keys (fail-closed) ─────────
# Walks the body with jq, collecting every object key at any depth (..|objects|
# keys[]), lowercased, and greps for any PII key (also lowercased) as a whole
# token. If ANY matches, the check FAILS. A non-JSON/empty body is treated as a
# failure of the upstream health check, not silently passed.
assert_no_pii() {
  local label="$1" body="$2" key lc_keys found=0
  # Lowercased newline-delimited list of every key present in the payload.
  lc_keys="$(jq -r '[.. | objects | keys[]] | unique | .[] | ascii_downcase' <<<"$body" 2>/dev/null || true)"
  for key in "${PII_KEYS[@]}"; do
    # Whole-line (whole-key) case-insensitive match — avoids false hits on
    # substrings, but the keys are matched case-insensitively per the spec.
    if grep -qix -- "$key" <<<"$lc_keys"; then
      echo "    PII LEAK: key '$key' present in $label response" >&2
      found=1
    fi
  done
  if [[ "$found" -eq 0 ]]; then
    pass "PII boundary ($label): none of [${PII_KEYS[*]}] present"
  else
    fail "PII boundary ($label): forbidden PII key(s) exposed over the wire"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Check 2: API health (FR-6) — /metrics and /actors → 200 + valid JSON.
# We capture the bodies for the PII + shape assertions that follow. `curl -fsS`
# fails (non-zero) on a non-2xx; we trap that into a FAIL line instead of letting
# `set -e` abort the whole run, so every check still gets summarised.
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Check: API health (FR-6) ..."

METRICS_BODY=""
if METRICS_BODY="$(curl -fsS "$API_BASE_URL/api/v1/metrics")" \
  && jq -e . >/dev/null 2>&1 <<<"$METRICS_BODY"; then
  pass "GET /api/v1/metrics → 200 + valid JSON"
else
  fail "GET /api/v1/metrics → non-200 or non-JSON"
  METRICS_BODY=""
fi

ACTORS_BODY=""
if ACTORS_BODY="$(curl -fsS "$API_BASE_URL/api/v1/actors")" \
  && jq -e . >/dev/null 2>&1 <<<"$ACTORS_BODY"; then
  pass "GET /api/v1/actors → 200 + valid JSON"
else
  fail "GET /api/v1/actors → non-200 or non-JSON"
  ACTORS_BODY=""
fi

# ─────────────────────────────────────────────────────────────────────────────
# Check 3: PII boundary OVER THE WIRE (NFR-5 — the critical gate).
# Assert neither body carries any PII key, AND that /actors is the PII-safe list
# contract: .data is an array and .page/.pageSize/.total are numbers.
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Check: PII boundary over the wire (NFR-5) ..."

if [[ -n "$METRICS_BODY" ]]; then
  assert_no_pii "metrics" "$METRICS_BODY"
else
  fail "PII boundary (metrics): no body to scan (health check failed)"
fi

if [[ -n "$ACTORS_BODY" ]]; then
  assert_no_pii "actors" "$ACTORS_BODY"

  # PII-safe list contract: { data: [], page: n, pageSize: n, total: n }.
  if jq -e '
        (.data | type == "array")
        and (.page | type == "number")
        and (.pageSize | type == "number")
        and (.total | type == "number")
      ' >/dev/null 2>&1 <<<"$ACTORS_BODY"; then
    pass "/actors body is the PII-safe list contract (.data[] + page/pageSize/total numbers)"
  else
    fail "/actors body does NOT match the expected list contract"
  fi
else
  fail "PII boundary (actors): no body to scan (health check failed)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Check 4: Frontend reachability (FR-5/FR-6) — CloudFront serves / and /map.
# The trailingSlash static export + the viewer-request rewrite (T-5) resolve
# /map to /map/index.html. curl follows redirects (-L) since CloudFront sends
# viewers to HTTPS. (Live-data rendering is a manual browser check — see header.)
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Check: frontend reachability (FR-5/FR-6) ..."

for path in "/" "/map"; do
  code="$(curl -fsSL -o /dev/null -w "%{http_code}" "$CLOUDFRONT_URL$path" || true)"
  if [[ "$code" == "200" ]]; then
    pass "CloudFront GET $path → 200"
  else
    fail "CloudFront GET $path → $code (expected 200)"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# Check 5: S3 privacy (FR-5/DD-5) — a DIRECT S3 object URL must be FORBIDDEN.
# The bucket is private (Block Public Access + OAC-only policy); reading an object
# straight from S3 (bypassing CloudFront) must return 403. A 200 here means the
# bucket leaked public — FAIL.
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Check: S3 privacy (FR-5/DD-5) ..."

S3_URL="https://$BUCKET.s3.$REGION.amazonaws.com/index.html"
s3_code="$(curl -s -o /dev/null -w "%{http_code}" "$S3_URL" || true)"
if [[ "$s3_code" == "403" ]]; then
  pass "Direct S3 object ($S3_URL) → 403 (private; OAC-only)"
else
  fail "Direct S3 object → $s3_code (expected 403 — bucket may be public!)"
fi

# ── Check 6: Summary — print each result; non-zero exit if any failed ─────────
echo
echo "==> Smoke summary:"
for r in "${RESULTS[@]}"; do
  echo "    $r"
done
echo

if [[ "$FAILS" -gt 0 ]]; then
  echo "==> SMOKE FAILED — $FAILS check(s) failed. See [FAIL] lines above." >&2
  exit 1
fi

echo "==> SMOKE PASSED — API healthy + PII-safe, frontend served, S3 private."
echo "    Final step: open $CLOUDFRONT_URL in a browser and confirm the metrics"
echo "    band + map render LIVE seeded data (not the offline fallback) — FR-6."
