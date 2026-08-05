// @sdd-spec actors/public-self-registration (T-3)
/**
 * Mail configuration read from the Lambda environment (design.md §4.9).
 *
 * Resolved lazily, mirroring `auth/auth.config.ts` and
 * `users/cognito-admin.client.ts` — only when a message is actually sent, not
 * at module init, so a checkout without `MAIL_TRANSPORT` set can still boot
 * and serve every other route. A missing or unrecognised value throws a clear
 * error at first use.
 */
export type MailTransportKind = 'ses' | 'no-op';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required mail env var ${name}. Set MAIL_TRANSPORT to "ses" or ` +
        '"no-op" (and MAIL_SENDER_ADDRESS + AWS_REGION when "ses") on the ' +
        'Lambda (design.md §4.9).',
    );
  }
  return value;
}

/** Which transport `MailService` sends through. Throws if unset or invalid. */
export function getMailTransportKind(): MailTransportKind {
  const value = required('MAIL_TRANSPORT');
  if (value !== 'ses' && value !== 'no-op') {
    throw new Error(
      `Invalid MAIL_TRANSPORT "${value}" — expected "ses" or "no-op" (design.md §4.9).`,
    );
  }
  return value;
}

export interface SesMailConfig {
  senderAddress: string;
  region: string;
}

/** SES-only config. Only read when the "ses" transport is selected and used. */
export function getSesMailConfig(): SesMailConfig {
  return {
    senderAddress: required('MAIL_SENDER_ADDRESS'),
    region: required('AWS_REGION'),
  };
}
