// @sdd-spec actors/public-self-registration (T-7)
/**
 * OTP HMAC secret, read from the Lambda environment (design.md §4.3, DD-11, V-6).
 *
 * Resolved lazily — only when a code is actually issued, verified, or
 * consumed, never at module init — mirroring `mail/mail.config.ts` and
 * `auth/auth.config.ts` so a checkout without `OTP_HMAC_SECRET` set can still
 * boot and serve every other route. A missing value throws a clear error at
 * first use rather than silently hashing under `undefined`.
 *
 * There is no SSM SDK anywhere in this codebase (see the two files above);
 * §4.3's "SSM-sourced secret" phrase describes how SAM populates this env var
 * from SSM Parameter Store / Secrets Manager at deploy time, not that the
 * application calls SSM directly. `OTP_HMAC_SECRET` carries the same
 * deployment gap already recorded against `MAIL_TRANSPORT`/`MAIL_SENDER_ADDRESS`
 * (T3-A1): no SAM template or `infra/20-backend/template.yaml` entry exists
 * for it yet.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required OTP env var ${name}. Set OTP_HMAC_SECRET on the ` +
        'Lambda (design.md §4.3) so verification codes can be hashed and ' +
        'compared — codes must never be stored or compared in plaintext.',
    );
  }
  return value;
}

/** The HMAC-SHA-256 key every verification code is hashed under before storage (V-6). */
export function getOtpHmacSecret(): string {
  return required('OTP_HMAC_SECRET');
}
