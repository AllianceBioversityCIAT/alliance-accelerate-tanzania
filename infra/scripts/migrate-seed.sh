#!/usr/bin/env bash
#
# migrate-seed.sh — ACCELERATE Tanzania Seed Registry (infra/aws-deployment, T-6)
# ---------------------------------------------------------------------------
# PURPOSE
#   Run-once operator step that migrates and seeds the dev RDS MySQL instance
#   after the 10-data-auth stack is deployed. It:
#     1. Resolves the RDS wiring (endpoint, port, db name, secret ARN) from the
#        data-auth CloudFormation stack outputs — nothing hardcoded (FR-2, FR-7).
#     2. Reads the DB credentials from Secrets Manager — the ONLY place the
#        password ever lives (NFR-2).
#     3. Composes the Prisma DATABASE_URL in-process (TLS on, URL-encoded
#        password), NEVER writing it to a file/.env or printing it (NFR-2/NFR-5).
#     4. Runs `prisma migrate deploy` then the consented sample seed from
#        backend/ over TLS (FR-2, FR-3, NFR-4, NFR-5).
#
# PREREQUISITES
#   - The 10-data-auth stack ($DATA_AUTH_STACK) is deployed (CREATE_COMPLETE).
#   - The operator's public IP/32 is in the RDS security group (DevCidr ingress).
#   - AWS CLI v2, jq, Node 20, and the backend deps installed (`npm ci` in backend/).
#   - Valid IBD-DEV credentials with secretsmanager:GetSecretValue + cloudformation
#     describe permissions on the data-auth stack/secret.
#
# THIS IS AN OPERATOR-RUN SCRIPT. It connects to live RDS and mutates the dev
# database. It is NOT run by the SDD agent loop. See infra/README.md (runbook).
#
# USAGE
#   ./infra/scripts/migrate-seed.sh
#   AWS_PROFILE=IBD-DEV AWS_REGION=eu-west-1 ./infra/scripts/migrate-seed.sh
#   CONFIRM=yes AWS_PROFILE=other ./infra/scripts/migrate-seed.sh   # override the IBD-DEV guard
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Config (overridable via env; IBD-DEV / eu-west-1 defaults — NFR-1) ───────
PROFILE="${AWS_PROFILE:-IBD-DEV}"
REGION="${AWS_REGION:-eu-west-1}"
DATA_AUTH_STACK="${DATA_AUTH_STACK:-accelerate-tz-dev-data-auth}"

# ── IBD-DEV guard (hard constraint: every AWS action uses IBD-DEV) ───────────
# If a non-IBD-DEV profile is in play, refuse to proceed without an explicit
# confirmation (CONFIRM=yes env, or an interactive "yes" on a TTY).
if [[ "$PROFILE" != "IBD-DEV" ]]; then
  echo "WARNING: AWS profile is '$PROFILE', not 'IBD-DEV' (the mandated profile)." >&2
  if [[ "${CONFIRM:-}" == "yes" ]]; then
    echo "         CONFIRM=yes set — proceeding against '$PROFILE'." >&2
  elif [[ -t 0 ]]; then
    read -r -p "         Continue against '$PROFILE'? Type 'yes' to proceed: " reply
    if [[ "$reply" != "yes" ]]; then
      echo "Aborted: profile is not IBD-DEV and confirmation was not given." >&2
      exit 1
    fi
  else
    echo "Aborted: profile is not IBD-DEV. Re-run with CONFIRM=yes to override." >&2
    exit 1
  fi
fi

echo "==> Using AWS profile '$PROFILE' in region '$REGION'."
echo "==> Resolving RDS wiring from stack '$DATA_AUTH_STACK' ..."

# ── Resolve wiring from the data-auth stack outputs (don't hardcode — FR-7) ──
# One describe call; parse the Outputs array with jq. Fail clearly if the stack
# or any required output is missing.
OUTPUTS_JSON="$(
  aws cloudformation describe-stacks \
    --profile "$PROFILE" --region "$REGION" \
    --stack-name "$DATA_AUTH_STACK" \
    --query "Stacks[0].Outputs" --output json
)" || {
  echo "ERROR: could not describe stack '$DATA_AUTH_STACK' (is it deployed under '$PROFILE'/'$REGION'?)." >&2
  exit 1
}

# Helper: pull one OutputValue by OutputKey, erroring if absent/empty.
get_output() {
  local key="$1" val
  val="$(jq -r --arg k "$key" '.[] | select(.OutputKey == $k) | .OutputValue' <<<"$OUTPUTS_JSON")"
  if [[ -z "$val" || "$val" == "null" ]]; then
    echo "ERROR: stack output '$key' not found on '$DATA_AUTH_STACK'." >&2
    exit 1
  fi
  printf '%s' "$val"
}

RDS_ENDPOINT="$(get_output RdsEndpoint)"
RDS_PORT="$(get_output RdsPort)"
DB_NAME="$(get_output DbName)"
DB_SECRET_ARN="$(get_output DbSecretArn)"

# Progress WITHOUT secrets (host/port/db are non-sensitive wiring values).
echo "==> Resolved RDS endpoint $RDS_ENDPOINT:$RDS_PORT, database '$DB_NAME'."
echo "==> Reading DB credentials from Secrets Manager (secret stays in-process) ..."

# ── Read the secret — the ONLY place credentials live (NFR-2) ────────────────
SECRET_JSON="$(
  aws secretsmanager get-secret-value \
    --profile "$PROFILE" --region "$REGION" \
    --secret-id "$DB_SECRET_ARN" \
    --query SecretString --output text
)" || {
  echo "ERROR: could not read secret '$DB_SECRET_ARN' (check secretsmanager:GetSecretValue)." >&2
  exit 1
}

DB_USER="$(jq -r '.username' <<<"$SECRET_JSON")"
DB_PASS="$(jq -r '.password' <<<"$SECRET_JSON")"
if [[ -z "$DB_USER" || "$DB_USER" == "null" || -z "$DB_PASS" || "$DB_PASS" == "null" ]]; then
  echo "ERROR: secret is missing 'username'/'password' keys." >&2
  exit 1
fi

# ── URL-encode the password (it may contain :?#&% etc. that break the URL) ───
# T-2's GenerateSecretString excludes "@/\ and space, but other URL-special
# characters can appear, so percent-encode every reserved/unsafe byte. Done
# with jq's @uri so the password never touches a subshell echo.
DB_PASS_ENC="$(jq -rn --arg p "$DB_PASS" '$p | @uri')"

# ── Compose DATABASE_URL in-process; TLS on (sslaccept=strict — NFR-4/NFR-5).
# This value is NEVER written to a file/.env or echoed — it exists only as a
# shell variable passed inline to prisma below (NFR-2).
DATABASE_URL="mysql://${DB_USER}:${DB_PASS_ENC}@${RDS_ENDPOINT}:${RDS_PORT}/${DB_NAME}?sslaccept=strict"

# Scrub the raw secret material now that the (encoded) URL is built.
unset DB_PASS DB_PASS_ENC SECRET_JSON

# ── Migrate + seed from backend/ over TLS ────────────────────────────────────
# Path is relative to this script so it works from any CWD.
BACKEND_DIR="$(cd "$(dirname "$0")/../../backend" && pwd)"
echo "==> Applying Prisma migrations against $RDS_ENDPOINT (TLS) ..."
(
  cd "$BACKEND_DIR"
  # Inline env assignment: DATABASE_URL is scoped to this command only and is
  # never exported into the persistent environment or a file.
  DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy
)

echo "==> Seeding the consented sample dataset (no real PII — NFR-5) ..."
(
  cd "$BACKEND_DIR"
  # `prisma db seed` honors the package.json `prisma.seed` config (seed.ts).
  DATABASE_URL="$DATABASE_URL" npx prisma db seed
)

echo "==> Done. RDS migrated and seeded successfully on $RDS_ENDPOINT:$RDS_PORT/$DB_NAME."
