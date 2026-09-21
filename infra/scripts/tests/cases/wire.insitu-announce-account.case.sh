#!/usr/bin/env bash
#
# wire.insitu-announce-account.case.sh
# (T-8, script-integration — converts T-4's wire.insitu-abort-account-mismatch)
# ---------------------------------------------------------------------------
# requirements.md FR-3′; design.md §7.1/DD-6; tasks.md T-8.
#
# For each of the FIVE WRITING scripts, a successful `sts` stub's account
# id must appear on the script's stderr, together with the effective
# profile — proving announce_account is not just defined (_guard.sh) but
# actually WIRED IN and CALLED at each of these five call sites, in situ,
# using the real scripts from their real location (DD-2, no test-only
# seam) — the same standard T-4's wire.insitu-abort-account-mismatch
# applied to the now-withdrawn assert_account.
#
# This case does NOT assert each script's overall exit status. Unlike
# assert_account, announce_account never aborts (FR-3′ is fail-soft), so
# every script goes on to its NEXT external command — deliberately
# unstubbed here, since this case is scoped to the announcement only —
# and is expected to fail loudly there, for a reason unrelated to the
# announcement itself. That is a correct and EXPECTED second outcome
# (mirrors wire.single-override-variable-across-all-scripts's own
# reasoning), not a contradiction: the only claim under test is that the
# announcement is reached and printed, in situ, in every one of the five
# real scripts.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

WRITING_SCRIPTS=(deploy.sh deploy-frontend.sh set-cors.sh migrate-seed.sh teardown.sh)

RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
case "$1 $2" in
  "sts get-caller-identity")
    echo "888888888888"
    exit 0
    ;;
  *)
    echo "STUB: unexpected aws invocation: $*" >&2
    exit 1
    ;;
esac
EOF2

for name in "${WRITING_SCRIPTS[@]}"; do
  output="$(
    env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION -u STUB_AWS_SCRIPT \
        AWS_PROFILE=IBD-DEV \
        STUB_AWS_SCRIPT="$RECIPE" \
        bash "$SCRIPTS_DIR/$name" </dev/null 2>&1 || true
  )"

  assert_contains "888888888888" "$output" "$name: the announcement reaches sts and names the resolved account, in situ"
  assert_contains "IBD-DEV" "$output" "$name: the announcement names the effective profile, in situ"
done
