// T-4 (docs/specs/auth/forgot-password-delivery, design.md §3, §5, DD-1,
// DD-2, DD-3a, DD-3b; FR-1, FR-2, FR-4, NFR-1, NFR-2).
//
// The Cognito CustomEmailSender trigger handler. Order of operations, per
// design.md §3 (and matching AWS's own reference example for this trigger
// type, docs.aws.amazon.com/cognito/.../user-pool-lambda-custom-email-
// sender.html, "Code example" — the reference an implementer/reviewer will
// check):
//   1. Decrypt   — if `event.request.code` is present, decrypt it now,
//                  unconditionally, before looking at `triggerSource`. This
//                  mirrors AWS's own example exactly (its decrypt happens
//                  before the if/else chain that switches on triggerSource)
//                  and costs nothing extra: every trigger source this
//                  function is asked to HANDLE always carries a code (it is
//                  the whole reason Cognito invokes this trigger type), and
//                  an unhandled source that happens to carry one too is
//                  simply decrypted and then discarded when routing raises
//                  below — no plaintext from it is ever used or logged.
//   2. Route     — look up `triggerSource` in the handled set (design.md
//                  §5). Unhandled → raise, naming the source (FR-2).
//   3. Validate  — the recipient email attribute MUST be present and
//                  address-shaped BEFORE anything is published (FR-1 s2,
//                  design.md §3 step 3). No other identifier is ever
//                  substituted — see `resolveRecipientEmail` below.
//   4. Build     — call the matching messages.mjs builder with the
//                  validated recipient and the decrypted code.
//   5. Publish   — over AMQP, connecting per invocation, caching nothing
//                  (DD-3a). No reply is awaited — publish, confirm, return.
//
// NFR-1 is absolute: the decrypted code and the recipient address must
// NEVER reach a log line, an error message, or CloudWatch, by this function
// or anything it calls. Every log line below is checked against that rule
// at the call site with a comment; the only things ever logged are
// `triggerSource` (not PII — it is a fixed enum Cognito itself defines) and
// a fixed, non-interpolated reason string or error `name`.

import { KmsKeyringNode, buildClient, CommitmentPolicy } from '@aws-crypto/client-node';
import * as amqp from 'amqplib';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { buildPasswordResetMessage, buildAttributeVerificationMessage } from './messages.mjs';

// REQUIRE_ENCRYPT_ALLOW_DECRYPT matches AWS's own reference example
// verbatim (see the file docblock). This function never encrypts — Cognito
// does that, against the grant T-3's key policy issues it — so only
// `decrypt` is ever called; `encrypt` is destructured for parity with the
// exemplar but intentionally unused.
const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);

// design.md §5's table, exactly. Each entry maps a handled `triggerSource`
// to the messages.mjs builder that renders its email. Anything not a key
// of this object is, by construction, the "everything else" row — FR-2
// raises on it in `handler` below, including `CustomEmailSender_
// AdminCreateUser` (DD-5a): `users.service.ts::create()` passes
// `MessageAction: 'SUPPRESS'` and dispatches `MailService.sendInvitation`
// itself, so Cognito's own invitation mail for this source is a DUPLICATE
// of one this system already sends by hand, not a mail that would
// otherwise vanish. Handling it would mean that if suppression is ever
// removed, the user receives two invitations — ours and Cognito's, the
// second carrying whatever copy this function happened to pass it. Raising
// means someone learns, on the day the setting changes, that a decision
// was reversed — the same reasoning DD-2 already applies to the rest of
// the unreachable set. The handled set is exactly two.
const MESSAGE_BUILDERS = {
  CustomEmailSender_ForgotPassword: buildPasswordResetMessage,
  CustomEmailSender_VerifyUserAttribute: buildAttributeVerificationMessage,
};

// Deliberately simple — same spirit as config.mjs's BASE_URL_PATTERN:
// permissive about what a valid address can contain, strict about the
// shape that actually distinguishes an address from anything else (a
// Cognito Username/UUID, in particular — FR-1 s2's `BUT it must NOT`,
// ATP-71's D-6 production defect approached from the other side). A UUID
// contains no "@", so it can never match this pattern.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailShaped(value) {
  return typeof value === 'string' && EMAIL_PATTERN.test(value);
}

/** Reads a required env var, throwing a fixed, non-interpolated message
 * (never echoing whatever else might be set) if it is absent — same
 * lazy-read-at-use-time contract as config.mjs's `getPublicAppBaseUrl`, so
 * importing this module never throws on its own. */
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`custom-email-sender: missing required env var ${name}.`);
  }
  return value;
}

/**
 * design.md §3 step 1. Returns the decrypted UTF-8 plaintext, or
 * `undefined` when the event carries no `request.code` at all (some
 * CustomEmailSender_* trigger sources — e.g. AccountTakeOverNotification —
 * are notifications with nothing to decrypt; AWS's own example guards the
 * same way with `if (event.request.code)`).
 *
 * `CUSTOM_EMAIL_SENDER_KEY_ARN` is the ARN of T-3's `CustomEmailSenderKey`
 * — the function's own `kms:Decrypt` grant (this task, design.md DD-2a) is
 * scoped to exactly that key.
 */
async function decryptCode(encryptedCode) {
  const keyArn = requiredEnv('CUSTOM_EMAIL_SENDER_KEY_ARN');
  const keyring = new KmsKeyringNode({ generatorKeyId: keyArn });
  // NEVER log `encryptedCode`, `plaintext`, or anything derived from either
  // — NFR-1. A decrypt failure's error is let through as-is (see `handler`'s
  // catch): a KMS/Encryption-SDK decrypt failure describes a permission or
  // key-mismatch problem, never the plaintext (decryption never succeeded),
  // so it carries none of the two absolutely-forbidden values.
  const { plaintext } = await decrypt(keyring, Buffer.from(encryptedCode, 'base64'));
  return Buffer.from(plaintext).toString('utf-8');
}

/**
 * FR-1 s2, design.md §3 step 3. The single place that decides what counts
 * as a usable recipient. Returns the address, or `undefined` — NEVER a
 * fallback identifier (Cognito Username is a UUID in this pool; passing it
 * through here is exactly ATP-71's D-6 defect, approached from the other
 * side, per FR-1's `BUT it must NOT`).
 */
function resolveRecipientEmail(event) {
  const email = event?.request?.userAttributes?.email;
  return isEmailShaped(email) ? email : undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Publishing (design.md DD-3a). Connect → confirm channel → publish → await
// confirm → close, EVERY invocation — no module-scope cache of the
// connection. Caching across invocations is the exact freeze hazard this
// repo already shipped a production fix for (`fix/otp-mail-lambda-freeze`);
// a function that opens, publishes under a confirm, and closes needs none
// of the backend transport's mutex/probe/retry machinery
// (`backend/src/mail/microservice-mail.transport.ts`) — that machinery
// exists ONLY because that transport keeps a long-lived connection.
// ─────────────────────────────────────────────────────────────────────────

/** Sanitized, fixed-message error — mirrors the REASON
 * `MicroserviceMailTransportError` exists in
 * `backend/src/mail/microservice-mail.transport.ts`: "amqplib errors
 * routinely carry the full connection string" (which embeds the broker
 * credential). NEVER constructed with, or logging, the triggering error's
 * own `.message`. */
class CustomEmailSenderPublishError extends Error {
  constructor() {
    super('custom-email-sender: failed to publish to the mail broker.');
    this.name = 'CustomEmailSenderPublishError';
  }
}

/**
 * DD-3b. `MailMicroserviceSecret` lives in `20-backend`, which deploys
 * AFTER this stack — this stack cannot `Fn::ImportValue` it (DD-1). Its
 * name is predictable (`!Sub "${AWS::StackName}-mail-microservice-secret"`
 * on that stack), so it is composed here from `BACKEND_STACK_NAME` and read
 * by name, at invocation time, via the SDK — never cached (same
 * "connect/read fresh every time" discipline as the AMQP connection below).
 * Throws (uncaught, propagates to `handler`'s catch) if the secret is
 * missing, malformed, or the composed name is wrong — never a silent
 * partial config.
 */
async function readMicroserviceMailSecret() {
  const backendStackName = requiredEnv('BACKEND_STACK_NAME');
  const secretId = `${backendStackName}-mail-microservice-secret`;
  const client = new SecretsManagerClient({});
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secret = JSON.parse(response.SecretString);
  // rabbitmqUrl / apiKey / queueName — the three keys DD-3a records this
  // secret holding (backend/src/mail/mail.config.ts's
  // `getMicroserviceMailConfig` reads the identical three, plus
  // EMAIL_SENDER/EMAIL_SENDER_NAME which are literals there, never in this
  // secret). NEVER log `secret` or any field of it — the broker URL embeds
  // a credential (NFR-1's spirit, extended: this secret is as sensitive as
  // the decrypted code for logging purposes even though NFR-1 names only
  // the code/address explicitly).
  return {
    rabbitmqUrl: secret.rabbitmqUrl,
    apiKey: secret.apiKey,
    queueName: secret.queueName,
  };
}

/**
 * DD-3a's envelope contract, mirrored field-for-field from
 * `buildMicroserviceEnvelope` in
 * `backend/src/mail/microservice-mail.transport.ts` (read in full for this
 * task — see this task's completion report). Deliberately NOT imported
 * (DD-1a: this package cannot depend on `backend/`) and deliberately NOT
 * re-derived from memory: every key name and nesting level below is copied
 * from that file.
 *
 *   - `to` is ALWAYS an array of trimmed addresses, never a comma-joined
 *     string (that file's DD-8; a wire-format defect already recorded
 *     against the older shape).
 *   - `from` is separate `email`/`name` fields, never a composite
 *     `"Name" <addr>` string (another recorded defect).
 *   - the HTML part is keyed `socketFile`, present ONLY when the message
 *     has HTML — never `file`, never `null` when absent (a third recorded
 *     defect: `file` is HTTP-only and ignored on this queue path).
 *   - NO `id` property anywhere, and NO `reply_to`: an `id` without a
 *     `reply_to` makes the microservice attempt an RPC reply nothing
 *     consumes (that file's FR-2 `BUT`, `proposal.md` §12.1).
 */
function buildEnvelope(message, config) {
  const emailMessage = message.html
    ? { text: message.text, socketFile: message.html }
    : { text: message.text };

  return {
    pattern: 'send',
    data: {
      apiKey: config.apiKey,
      data: {
        from: {
          email: config.senderAddress,
          name: config.senderName,
        },
        emailBody: {
          subject: message.subject,
          to: [message.to.trim()],
          message: emailMessage,
        },
      },
    },
  };
}

/**
 * design.md DD-3a. One connection, one confirm channel, one publish, one
 * close — every invocation. NEVER retried (a retry here risks a duplicate
 * code/invitation email, which FR-1/FR-4 do not ask for and which nothing
 * in this design budgets for) and NEVER left open past this call.
 *
 * Any failure — connect, channel creation, or a broker nack — surfaces as
 * {@link CustomEmailSenderPublishError}, never the raw `amqplib`/network
 * error (NFR-1: those routinely carry the broker URL, which embeds a
 * credential).
 */
async function publishEnvelope(envelope, brokerConfig) {
  let connection;
  try {
    connection = await amqp.connect(brokerConfig.rabbitmqUrl);
    const channel = await connection.createConfirmChannel();
    const content = Buffer.from(JSON.stringify(envelope), 'utf8');
    await new Promise((resolve, reject) => {
      channel.publish(
        '',
        brokerConfig.queueName,
        content,
        {
          persistent: true, // delivery_mode = 2, matching the backend transport
          contentType: 'application/json',
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  } catch {
    // Deliberately swallow the original error's detail here (NFR-1) — see
    // CustomEmailSenderPublishError's docblock. `handler`'s catch logs only
    // this error's fixed `.name`/`.message`, never the one this replaces.
    throw new CustomEmailSenderPublishError();
  } finally {
    if (connection) {
      // Never awaited-and-thrown: closing an already-broken connection can
      // itself reject, and that is never actionable — the connection is
      // being discarded either way (mirrors
      // microservice-mail.transport.ts's `detachTeardown`). Awaited (not
      // detached) here, unlike that file, because NFR-2 requires this
      // function's own work to be complete before it returns — nothing may
      // be left in flight, including teardown.
      await connection.close().catch(() => {});
    }
  }
}

// The literal sender identity every OTHER mail path in this system uses
// (`infra/20-backend/template.yaml`'s `ApiFunction` Environment,
// `backend/src/mail/mail.config.ts`'s `getMicroserviceMailConfig`).
// Duplicated as a literal here, not imported (DD-1a) — `EMAIL_SENDER` is
// public by construction (it is the From header of every message this
// system sends), so hiding it would protect nothing while adding an
// operator step; `EMAIL_SENDER_NAME` is the one field that defaults rather
// than throwing, exactly mirroring `getMicroserviceMailConfig`'s comment
// about why (the trailing "-" and space are deliberate — the microservice
// appends " No reply" to whatever display name it is given).
function resolveSenderIdentity() {
  return {
    senderAddress: requiredEnv('EMAIL_SENDER'),
    senderName: process.env.EMAIL_SENDER_NAME ?? 'ACCELERATE Tanzania Seed Registry -',
  };
}

/**
 * Cognito's CustomEmailSender trigger handler (design.md §3, §5).
 *
 * Cognito's own docs: "Amazon Cognito doesn't expect any additional return
 * information in the custom email sender response" — so, matching AWS's
 * own example, this returns `event` unmodified on success purely so the
 * function completes with a well-formed value; nothing reads it.
 */
export async function handler(event) {
  const { triggerSource } = event ?? {};

  try {
    // Step 1 — decrypt (§3). Unconditional on `request.code` being present,
    // regardless of triggerSource — see the file docblock for why this is
    // safe to do even for a source this function will go on to reject.
    let plaintextCode;
    if (event?.request?.code) {
      plaintextCode = await decryptCode(event.request.code);
    }

    // Step 2 — route (§5, FR-2). Unhandled → raise, naming the source.
    // NEVER a silent no-op — a silent drop here is precisely how ATP-71's
    // missing IAM grant went unnoticed for months (design.md §5/DD-2).
    const buildMessage = MESSAGE_BUILDERS[triggerSource];
    if (!buildMessage) {
      throw new Error(`custom-email-sender: unhandled triggerSource "${triggerSource}".`);
    }

    // Step 3 — validate the recipient BEFORE anything is built or
    // published (FR-1 s2, design.md §3 step 3). No fallback identifier,
    // ever (FR-1's `BUT it must NOT` — ATP-71's D-6, approached from the
    // other side).
    const recipientEmail = resolveRecipientEmail(event);
    if (!recipientEmail) {
      throw new Error(
        `custom-email-sender: no usable recipient email attribute for triggerSource "${triggerSource}".`,
      );
    }

    // Defensive: every HANDLED triggerSource always carries a code (that is
    // the entire reason Cognito invokes this trigger type for it) — but
    // never publish a message built from an absent code (NFR-1's spirit:
    // fail rather than send a broken/undefined-code email).
    if (plaintextCode === undefined) {
      throw new Error(`custom-email-sender: no code present for triggerSource "${triggerSource}".`);
    }

    // Step 4 — build. `message.to`/`message.text`/`message.html` carry the
    // recipient/code (PII) — held only in local variables from here on,
    // never logged (NFR-1).
    const message = buildMessage(recipientEmail, plaintextCode);

    // Step 5 — publish. No reply awaited (`proposal.md` §12.1) — publish,
    // confirm, return.
    const brokerConfig = await readMicroserviceMailSecret();
    const senderIdentity = resolveSenderIdentity();
    const envelope = buildEnvelope(message, { apiKey: brokerConfig.apiKey, ...senderIdentity });
    await publishEnvelope(envelope, brokerConfig);

    // NFR-1: triggerSource is a fixed Cognito-defined enum, not PII. Never
    // the recipient, never the code, never `message`/`envelope`.
    console.log(`custom-email-sender: dispatched triggerSource=${triggerSource}`);
    return event;
  } catch (err) {
    // NFR-1: log only `triggerSource` (safe — see above) and the error's
    // `name` — NEVER `err.message` unconditionally, because some of the
    // errors that can reach here are NOT this module's own sanitized types
    // (e.g. a `TypeError`, or a KMS/Secrets-Manager SDK error) and this
    // function cannot audit every such library's message text for what it
    // might embed. `name` alone is always safe: it never carries the
    // code, the address, or a broker URL.
    console.error(
      `custom-email-sender: failed triggerSource=${triggerSource ?? 'unknown'} reason=${err?.name ?? 'Error'}`,
    );
    throw err;
  }
}
