// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec enhancement/email-notification-microservice (T-3)
/**
 * Mail configuration read from the Lambda environment (design.md §4.9;
 * enhancement/email-notification-microservice design.md §4.5).
 *
 * Resolved lazily, mirroring `auth/auth.config.ts` and
 * `users/cognito-admin.client.ts` — only when a message is actually sent, not
 * at module init, so a checkout without `MAIL_TRANSPORT` set can still boot
 * and serve every other route. A missing or unrecognised value throws a clear
 * error at first use.
 *
 * enhancement/email-notification-microservice Phase B: the union is narrowed
 * to `'microservice' | 'no-op'` — `'ses'` is no longer a valid kind. SES
 * served as the rollback control during that spec's add → verify → remove
 * rollout (design.md §7.3); the SES transport itself, `ses-mail.transport.ts`,
 * is deleted in the same change that narrows this union (T-10).
 */
export type MailTransportKind = 'microservice' | 'no-op';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required mail env var ${name}. Set MAIL_TRANSPORT to ` +
        '"microservice" or "no-op" on the Lambda, then set that transport\'s ' +
        "own required variables (see getMicroserviceMailConfig) " +
        '(design.md §4.9; enhancement/email-notification-microservice design.md §4.5).',
    );
  }
  return value;
}

/** Which transport `MailService` sends through. Throws if unset or invalid. */
export function getMailTransportKind(): MailTransportKind {
  const value = required('MAIL_TRANSPORT');
  if (value !== 'microservice' && value !== 'no-op') {
    throw new Error(
      `Invalid MAIL_TRANSPORT "${value}" — expected "microservice" or ` +
        '"no-op" (design.md §4.9; enhancement/email-notification-microservice design.md §4.5).',
    );
  }
  return value;
}

export interface MicroserviceMailConfig {
  rabbitmqUrl: string;
  queueName: string;
  apiKey: string;
  senderAddress: string;
  senderName: string;
}

/**
 * OneCGIAR notification-microservice config. Only read when the
 * "microservice" transport is selected and used — resolved lazily, same
 * contract as `getMailTransportKind` above.
 *
 * Four of five variables throw when absent; `EMAIL_SENDER_NAME` is the one
 * optional variable and defaults instead (FR-3, design.md §4.5). None of the
 * thrown messages below echo a value — only ever the variable *name* — so a
 * throw can never leak the broker URL or the API key (FR-3's `AND IT MUST`).
 */
export function getMicroserviceMailConfig(): MicroserviceMailConfig {
  return {
    rabbitmqUrl: required('RABBITMQ_URL'),
    queueName: required('EMAIL_QUEUE_NAME'),
    apiKey: required('MICROSERVICE_API_KEY'),
    senderAddress: required('EMAIL_SENDER'),
    // EMAIL_SENDER_NAME defaults rather than throwing — the one optional
    // variable (FR-3, design.md §4.5). The trailing "-" and space are
    // deliberate, NOT a typo: the microservice appends " No reply" to the
    // display name it's given, so this renders as "ACCELERATE Tanzania Seed
    // Registry - No reply". Do not "fix" the dash.
    senderName: process.env.EMAIL_SENDER_NAME ?? 'ACCELERATE Tanzania Seed Registry -',
  };
}
