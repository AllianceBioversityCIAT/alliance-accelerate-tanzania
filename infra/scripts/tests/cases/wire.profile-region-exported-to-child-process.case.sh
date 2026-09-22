#!/usr/bin/env bash
#
# wire.profile-region-exported-to-child-process.case.sh (T-4, script-integration)
# ---------------------------------------------------------------------------
# requirements.md FR-1/FR-2; design.md §7.1 ("_guard.sh also EXPORTS
# PROFILE and REGION"); execution.md FP-4 — export-ness was flagged at T-2
# as "undriven — the probes run in the same process that sourced the
# library, so they would pass with plain assignments," and only becomes
# observable once a script actually sources the guard AND spawns an
# external process, which first happens here at T-4.
#
# `--profile "$PROFILE"` as a literal CLI argument would work identically
# whether PROFILE were exported or a plain shell variable — argument
# expansion happens in the sourcing shell regardless of export status, so
# asserting on an argument proves nothing about export-ness. What DOES
# distinguish them: bash's `env` builtin, run INSIDE a child process
# (a stub standing in for aws/sam), lists only EXPORTED variables. A plain
# (non-exported) PROFILE/REGION would be invisible to that child's `env`
# even though the same-shell `--profile "$PROFILE"` argument would still
# have looked correct. This case reads the child's own environment, not
# the parent script's arguments.
# ---------------------------------------------------------------------------
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"
# announce_account (FR-3′) has nothing to compare an account
# against any more — any well-formed value works here. Picked to look
# nothing like a real account id (guard-account.no-account-id-literal-in-infra
# greps this whole directory tree and must not find one).
STS_ACCOUNT="000000000001"

# ── Writing script (set-cors.sh), via the aws stub at announce_account's call ─
ENV_MARKER="$(mktemp)"
AWS_RECIPE="$(mktemp)"
trap 'rm -f "$ENV_MARKER" "$AWS_RECIPE"' EXIT

cat > "$AWS_RECIPE" <<EOF2
#!/usr/bin/env bash
env > "$ENV_MARKER"
case "\$1 \$2" in
  "sts get-caller-identity")
    echo "$STS_ACCOUNT"
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
EOF2

env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION -u STUB_AWS_SCRIPT \
    AWS_PROFILE=IBD-DEV \
    STUB_AWS_SCRIPT="$AWS_RECIPE" \
    bash "$SCRIPTS_DIR/set-cors.sh" </dev/null >/dev/null 2>&1 || true

child_env="$(cat "$ENV_MARKER")"
# PROFILE is anchored to line-start (^PROFILE=) rather than matched as a
# substring: the child's env also carries the inherited "AWS_PROFILE=IBD-DEV"
# line, and a plain substring search for "PROFILE=IBD-DEV" matches inside
# that literal ("AWS_" + "PROFILE=IBD-DEV") even when PROFILE itself was
# never exported — a gate that cannot fail for the clause it claims. REGION
# has no such collision (AWS_REGION is unset in this fixture, so only the
# guard's own exported REGION line can produce the match) and stays a plain
# substring check.
if grep -qE '^PROFILE=IBD-DEV$' <<<"$child_env"; then
  profile_exported=0
else
  profile_exported=1
fi
assert_status 0 "$profile_exported" "set-cors.sh: PROFILE reaches the aws child process's own environment (export, not a plain assignment)"
assert_contains "REGION=eu-west-1" "$child_env" "set-cors.sh: REGION reaches the aws child process's own environment (export, not a plain assignment)"

# ── Read-only script (validate.sh), via the sam stub ────────────────────────
: > "$ENV_MARKER"
SAM_RECIPE="$(mktemp)"
trap 'rm -f "$ENV_MARKER" "$AWS_RECIPE" "$SAM_RECIPE"' EXIT
cat > "$SAM_RECIPE" <<EOF2
#!/usr/bin/env bash
env > "$ENV_MARKER"
echo "template.yaml is a valid SAM Template"
exit 0
EOF2

env -u AWS_PROFILE -u ALLOW_NON_IBD_DEV_PROFILE -u CONFIRM -u AWS_REGION -u STUB_SAM_SCRIPT \
    AWS_PROFILE=IBD-DEV \
    STUB_SAM_SCRIPT="$SAM_RECIPE" \
    bash "$SCRIPTS_DIR/validate.sh" </dev/null >/dev/null 2>&1 || true

child_env="$(cat "$ENV_MARKER")"
if grep -qE '^PROFILE=IBD-DEV$' <<<"$child_env"; then
  profile_exported=0
else
  profile_exported=1
fi
assert_status 0 "$profile_exported" "validate.sh: PROFILE reaches the sam child process's own environment (export, not a plain assignment)"
assert_contains "REGION=eu-west-1" "$child_env" "validate.sh: REGION reaches the sam child process's own environment (export, not a plain assignment)"
