#!/usr/bin/env bash
#
# frontend-function.legacy-domain-redirect.case.sh — ATP-88
# ---------------------------------------------------------------------------
# Renders the viewer-request CloudFront Function from
# infra/30-frontend/template.yaml (its `!Sub` substitutions applied by hand)
# and runs it in Node against mock events: the legacy host gets a 301 to the
# same path and query on the new domain, every other host falls through to
# the static-export rewrite, and an empty legacy name disables the redirect.
# Needs `node` (not stubbed: it touches no network).
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"
TEMPLATE="$TESTS_DIR/../../30-frontend/template.yaml"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The function body sits between "FunctionCode: !Sub / - |" and "- RedirectFrom:".
awk '/FunctionCode: !Sub/{f=1; next} f && /^        - \|/{p=1; next} p && /^        - RedirectFrom:/{exit} p' "$TEMPLATE" \
  | sed 's/^          //' > "$WORK/fn.js"

render() { # $1 = new domain, $2 = legacy domain, $3 = output file
  sed -e "s/\${CustomDomainName}/$1/g" -e "s/\${RedirectFrom}/$2/g" "$WORK/fn.js" > "$3"
  echo 'module.exports = handler;' >> "$3"
}
render pabra-registry.alliance.cgiar.org accelerate-tz.alliance.cgiar.org "$WORK/on.cjs"
render pabra-registry.alliance.cgiar.org '' "$WORK/off.cjs"

out="$(node -e '
  const on = require(process.argv[1]), off = require(process.argv[2]);
  const ev = (host, uri, qs = {}) => ({ request: { uri, headers: { host: { value: host } }, querystring: qs } });
  const show = (r) => r.statusCode ? r.statusCode + " " + r.headers.location.value + " " + r.headers["cache-control"].value : "pass " + r.uri;
  console.log(show(on(ev("accelerate-tz.alliance.cgiar.org", "/register/status", { ref: { value: "REG-2026-0001" }, a: { value: "1", multiValue: [{ value: "1" }, { value: "2" }] } }))));
  console.log(show(on(ev("accelerate-tz.alliance.cgiar.org", "/"))));
  console.log(show(on(ev("pabra-registry.alliance.cgiar.org", "/map"))));
  console.log(show(on(ev("d123.cloudfront.net", "/_next/x.abc.js"))));
  console.log(show(off(ev("accelerate-tz.alliance.cgiar.org", "/map"))));
' "$WORK/on.cjs" "$WORK/off.cjs")"

assert_contains "301 https://pabra-registry.alliance.cgiar.org/register/status?ref=REG-2026-0001&a=1&a=2 max-age=3600" "$out" "legacy host: 301 keeps path and query (multi-value too), short cache"
assert_contains "301 https://pabra-registry.alliance.cgiar.org/ max-age=3600" "$out" "legacy host root: 301 to the new root"
assert_contains "pass /map/index.html" "$out" "new host: falls through to the rewrite"
assert_contains "pass /_next/x.abc.js" "$out" "cloudfront.net asset: untouched"
assert_not_contains "301 https://pabra-registry.alliance.cgiar.org/map" "$out" "empty legacy name: no redirect"
