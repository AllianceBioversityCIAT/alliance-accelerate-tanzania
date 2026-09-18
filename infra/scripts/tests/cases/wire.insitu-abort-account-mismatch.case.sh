#!/usr/bin/env bash
#
# wire.insitu-abort-account-mismatch.case.sh (T-4, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-3; design.md §7.1/§7.2; tasks.md T-4 clause (c).
#
# For each of the FIVE WRITING scripts, a foreign-account `sts` stub must
# make the script exit non-zero — proving assert_account is not just
# defined (T-3) but actually WIRED IN and CALLED at each of these five
# call sites (the same in-situ standard as clause (b), applied to FR-3).
#
# The stub answers `sts get-caller-identity` with a foreign account
# (999999999999); the real, COMMITTED infra/aws-accounts.conf is read
# unmodified (these are the real scripts, run from their real location —
# DD-2, no test-only seam). The expected account is read from that file
# at RUN TIME (never typed as a literal here) so this file itself carries
# no account id literal — guard-account.no-account-id-literal-in-scripts
# greps this very directory tree and must not find one (FR-3). Any
# other aws invocation the stub receives is unexpected at this point in
# each script (assert_account is the very first statement after `set -euo
# pipefail`), so the recipe treats it as a hard test error rather than
# quietly answering it — a script that skipped assert_account and reached
# a later aws call would surface as "STUB: unexpected aws invocation" in
# the output, which independently fails the message assertions below (see
# the T-4 falsifier for clause (c) in the completion report).
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
INFRA_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"

# Read the expected account for IBD-DEV from the real, committed conf file
# at run time — never as a literal in this test's own source.
EXPECTED_ACCOUNT="$(awk -F= '$1=="IBD-DEV"{print $2; exit}' "$INFRA_DIR/aws-accounts.conf")"

WRITING_SCRIPTS=(deploy.sh deploy-frontend.sh set-cors.sh migrate-seed.sh teardown.sh)

RECIPE="$(mktemp)"
trap 'rm -f "$RECIPE"' EXIT
cat > "$RECIPE" <<'EOF2'
#!/usr/bin/env bash
case "$1 $2" in
  "sts get-caller-identity")
    echo "999999999999"
    exit 0
    ;;
  *)
    echo "STUB: unexpected aws invocation: $*" >&2
    exit 1
    ;;
esac
EOF2

for name in "${WRITING_SCRIPTS[@]}"; do
  set +e
  output="$(
    env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION -u STUB_AWS_SCRIPT \
        AWS_PROFILE=IBD-DEV \
        STUB_AWS_SCRIPT="$RECIPE" \
        bash "$SCRIPTS_DIR/$name" </dev/null 2>&1
  )"
  status=$?
  set -e

  assert_status 1 "$status" "$name: foreign account aborts non-zero, in situ"
  assert_contains "999999999999" "$output" "$name: abort names the resolved (foreign) account"
  assert_contains "$EXPECTED_ACCOUNT" "$output" "$name: abort names the expected account"
done
