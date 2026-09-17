// @sdd-spec enhancement/email-notification-microservice (T-2)
// @sdd-spec enhancement/email-notification-microservice (T-4)
import * as amqp from 'amqplib';
import { Logger } from '@nestjs/common';
import { MailMessage, MailTransport } from './mail-transport.interface';
import { getMicroserviceMailConfig } from './mail.config';
import { MAIL_LOCK_WAIT_TIMEOUT_MS, MAIL_PROBE_TIMEOUT_MS, MAIL_SEND_TIMEOUT_MS } from './mail-timing';

/**
 * T-2 — Envelope builder for the OneCGIAR notification microservice
 * (design.md §4.2, §4.5; FR-2, FR-4, DD-8).
 *
 * `design.md` §4.2 splits "build the envelope" from "publish it" on purpose:
 * this function is a **pure** `MailMessage` → JSON mapping, no AMQP, no
 * network, no clock. It is gated by a spec that needs no broker stub. The
 * connection, mutex, probe and publish belong to `MicroserviceMailTransport`
 * (T-4), which is deliberately NOT in this file yet.
 *
 * `apiKey`/`senderAddress`/`senderName` are config-derived (FR-3, FR-4), not
 * part of `MailMessage` — this file takes them as an explicit parameter
 * rather than importing `mail.config.ts`, so the builder stays dependency-free
 * and independently testable, and so it does not couple to that file's
 * concurrent edit (T-3).
 *
 * A worked example of the wire format exists in a sibling project,
 * `ai-services/partner-request-support/backend/src/email_microservice.py`
 * (`send_email`'s `config_message_dto`/`payload`). Two things are
 * deliberately NOT copied from it:
 *   1. It authenticates with the legacy `auth: {username, password}` pair.
 *      We use `data.apiKey` — the legacy form is deprecated (FR-2).
 *   2. It always sends `socketFile: None` (text-only). We send HTML, so
 *      `socketFile` carries `MailMessage.html` whenever it is present — that
 *      is the whole point of this transport (FR-2's `AND IT MUST`).
 */

/** Config-derived fields the envelope needs but `MailMessage` does not carry. */
export interface MicroserviceEnvelopeConfig {
  /** CLARISA-issued key. Goes in `data.apiKey`, never in `data.data`. */
  apiKey: string;
  /** `EMAIL_SENDER` (FR-4) — the bare address, `data.data.from.email`. */
  senderAddress: string;
  /** `EMAIL_SENDER_NAME` (FR-4) — the display name, `data.data.from.name`. */
  senderName: string;
}

interface MicroserviceMailAddress {
  email: string;
  name: string;
}

interface MicroserviceEmailMessage {
  text: string;
  /**
   * `MailMessage.html`, present only when the message carries HTML (FR-2's
   * `AND IT MUST`: both `text` and `socketFile` when HTML exists). Omitted
   * entirely — never `null` — for a text-only message, so a text-only send
   * matches the exemplar's shape without reintroducing its `None` trap.
   *
   * Deliberately NOT named `file` — that field is HTTP-only and ignored on
   * the queue path (FR-2's `BUT`). Renaming this key is the task's own
   * mutation-testing gate: it must redden the suite.
   */
  socketFile?: string;
}

interface MicroserviceEmailBody {
  subject: string;
  /** Always an array, always trimmed (DD-8) — never a comma-joined string. */
  to: string[];
  message: MicroserviceEmailMessage;
}

/**
 * The exact NestJS RMQ wire shape (FR-2). Note what is absent: no `id`
 * property anywhere. An `id` without a `reply_to` makes the microservice
 * attempt an RPC reply nothing will consume (FR-2's `BUT`) — the fix here is
 * simply to never add one, not to add and then strip one.
 */
export interface MicroserviceMailEnvelope {
  pattern: 'send';
  data: {
    apiKey: string;
    data: {
      /**
       * Separate `email`/`name` fields — never a `"Name" <addr>` composite
       * (FR-4's `BUT`). The microservice takes address and name as distinct
       * fields; wrapping them the way `ses-mail.transport.ts`'s
       * `buildSource()` does for SES would be sent as one literal address.
       */
      from: MicroserviceMailAddress;
      emailBody: MicroserviceEmailBody;
    };
  };
}

/**
 * DD-8 — always send `to` as a trimmed array. A malformed entry (stray
 * leading/trailing whitespace, e.g. from a naively comma-split source
 * upstream) invalidates the whole list at the microservice; trimming every
 * entry removes that footgun. `MailMessage.to` is `string | string[]` — a
 * bare string is always normalized to a one-element array, matching FR-2's
 * "always an array, never a comma-joined string".
 */
function normalizeTo(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  return list.map((address) => address.trim());
}

/**
 * Pure builder: `MailMessage` + sender config → the microservice envelope.
 * No I/O, no AMQP — see file docblock. `MicroserviceMailTransport` (T-4)
 * calls this immediately before publishing.
 */
export function buildMicroserviceEnvelope(
  message: MailMessage,
  config: MicroserviceEnvelopeConfig,
): MicroserviceMailEnvelope {
  // message.text is always taken verbatim into `text`; message.html (when
  // present) is always taken verbatim into `socketFile`. Neither ever falls
  // back into the other's slot, so HTML can never land in `message.text`
  // (FR-2's `BUT`).
  const emailMessage: MicroserviceEmailMessage = message.html
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
          to: normalizeTo(message.to),
          message: emailMessage,
        },
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// T-4 — Connection lifecycle (design.md §4.3, §4.4, DD-3, DD-4, DD-5, DD-11).
//
// Everything above this line is T-2's pure envelope builder — unchanged.
// Everything below is new: the class that owns the AMQP connection, the
// module-scope mutex, the liveness probe, and the publish-under-deadline
// sequence §4.3's table describes step by step.
// ─────────────────────────────────────────────────────────────────────────

/**
 * §4.4 — every error this transport lets escape the module is one of these:
 * a stable `name`, a FIXED message that never interpolates anything from
 * the triggering `amqplib` error. `RABBITMQ_URL` embeds `user:password` and
 * `amqplib` errors routinely carry the full connection string in
 * `err.message` — the credential-leak hazard this hierarchy exists to
 * close (NFR-3, FR-3's `AND IT MUST`). No `cause` chain either: nothing
 * about the original error survives into a log line, an error envelope, or
 * a thrown message.
 *
 * T-5 builds the full three-path gate (sync throw, async `'error'`/`'close'`,
 * the deadline-orphaned promise) over this seam; this class already routes
 * every escape through it so T-5 has something to gate rather than a raw
 * `amqplib` error still loose in the codebase in the meantime.
 */
abstract class MicroserviceMailTransportError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** DD-11 — a send could not acquire the module-scope mutex in
 * {@link MAIL_LOCK_WAIT_TIMEOUT_MS}; the broker was never contacted. Reported
 * distinctly from every broker-side failure below so an operator can tell
 * "we never even tried" from "the broker did not answer" using only the
 * error's `name`. */
export class MicroserviceMailLockTimeoutError extends MicroserviceMailTransportError {
  constructor() {
    super('Timed out waiting for the mail transport lock; the broker was never contacted.');
  }
}

/** DD-11 — the pre-publish liveness probe on a cached connection hung past
 * its own {@link MAIL_PROBE_TIMEOUT_MS} sub-deadline. This is the half-open-
 * socket case: a round-trip on a connection a frozen Lambda container left
 * for dead does not throw, it waits for a reply that never arrives. */
export class MicroserviceMailProbeTimeoutError extends MicroserviceMailTransportError {
  constructor() {
    super('The mail broker liveness probe timed out.');
  }
}

/** DD-3 / DD-11 — `checkQueue` reports the configured queue does not exist
 * (AMQP reply code 404). A configuration error, never retried — conflating
 * this with a stale-connection timeout is exactly what DD-11 warns against:
 * it would cost two full connection cycles per send and surface as a
 * timeout instead of the loud, immediate failure DD-3 exists to produce. */
export class MicroserviceMailQueueNotFoundError extends MicroserviceMailTransportError {
  constructor(queueName: string) {
    super(`Configured EMAIL_QUEUE_NAME "${queueName}" does not exist on the broker.`);
  }
}

/** §4.3 step 2/4 — connecting (or the one allowed reconnect) to the broker
 * failed for a reason other than a missing queue. Covers everything from a
 * TCP failure to an AMQP authentication rejection — deliberately
 * undifferentiated, since differentiating further would mean echoing
 * `amqplib`'s own error detail, which is exactly what must not escape. */
export class MicroserviceMailConnectionError extends MicroserviceMailTransportError {
  constructor() {
    super('Failed to connect to the mail broker.');
  }
}

/** §4.3 step 0 — the overall {@link MAIL_SEND_TIMEOUT_MS} deadline elapsed
 * before the broker confirmed the publish (NFR-1). */
export class MicroserviceMailTimeoutError extends MicroserviceMailTransportError {
  constructor() {
    super('Timed out sending the message to the mail broker.');
  }
}

/** §4.3 step 3/5 — the broker nacked the publish on the confirm channel. */
export class MicroserviceMailPublishError extends MicroserviceMailTransportError {
  constructor() {
    super('The mail broker rejected the message.');
  }
}

/** DD-3 — `mandatory: true` plus a `'return'` listener: the queue existed
 * at `checkQueue` time but the message came back unroutable before (or
 * alongside) its ack, i.e. it disappeared between the check and the
 * publish. */
export class MicroserviceMailUndeliverableError extends MicroserviceMailTransportError {
  constructor(queueName: string) {
    super(`Message to queue "${queueName}" was returned as unroutable.`);
  }
}

/** AMQP reply code for "no such queue" (`NOT_FOUND` in the spec's constant
 * table). A numeric property on the error `amqplib` itself sets — safe to
 * branch on, unlike `err.message`, which is where the credential lives. */
function isQueueNotFoundError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: number }).code === 404;
}

/**
 * Final boundary sanitizer (§4.4's synchronous-throw path). Anything
 * already one of this module's own typed errors passes through unchanged —
 * it was sanitized at the point it was constructed and never carries
 * `err.message` from the `amqplib` error that triggered it. Anything else
 * (defense in depth; every internal call site below already constructs a
 * typed error before throwing) becomes a generic, fixed-message connection
 * error rather than escaping raw.
 */
function sanitizeEscapingError(err: unknown): MicroserviceMailTransportError {
  if (err instanceof MicroserviceMailTransportError) {
    return err;
  }
  return new MicroserviceMailConnectionError();
}

/**
 * design.md §4.3 "Heartbeat" — an explicit value rather than `amqplib`'s
 * library default (disabled, `0`), so the broker can detect a connection a
 * frozen Lambda container left half-open. Stated as *"a tunable with a
 * stated default of 30s… a T-9 measurement target"* — this is deliberately
 * NOT one of `mail-timing.ts`'s §12 canonical constants: §12 is the single
 * home for the SEND-deadline budget specifically, and this is a distinct,
 * separately-declared connection-level default that DD-11's probe makes
 * non-critical to get exactly right (liveness stops depending on the
 * heartbeat being right).
 */
const MICROSERVICE_MAIL_HEARTBEAT_SECONDS = 30;

/**
 * Appends `?heartbeat=<seconds>` to the configured broker URL without
 * touching any other component (scheme, credentials, host, vhost, or an
 * existing query string) — `amqplib` reads `heartbeat` only from the
 * connection URL's query string when `connect()` is given a string
 * (`lib/connect.js`'s `openFrames`), not from a separate options argument.
 * `URL` never surfaces the credential in a thrown message on a malformed
 * input (Node's own `Invalid URL` is fixed text) but the call site still
 * wraps this in the same classify-and-sanitize path as every other connect
 * failure, as defense in depth.
 */
function withHeartbeat(rabbitmqUrl: string, heartbeatSeconds: number): string {
  const url = new URL(rabbitmqUrl);
  url.searchParams.set('heartbeat', String(heartbeatSeconds));
  return url.toString();
}

/** The subset of `MicroserviceMailConfig` (`mail.config.ts`) the connection
 * layer needs. Deliberately narrower than the full config — see the class
 * docblock's note on destructuring at the call site, never spreading. */
interface MicroserviceMailBrokerConfig {
  rabbitmqUrl: string;
  queueName: string;
}

interface CachedMicroserviceConnection {
  model: amqp.ChannelModel;
  channel: amqp.ConfirmChannel;
  /** Owned by this module, set only by the `'error'`/`'close'` listeners
   * `connectFresh` attaches (DD-5) — NOT read from any `amqplib` promise
   * API, which exposes no public "is this still open" flag. */
  healthy: boolean;
}

/** Module-scope cache — same singleton shape as `ses-mail.transport.ts`'s
 * `getSesClient()` / `users/cognito-admin.client.ts`'s admin client, so a
 * `no-op` or `ses` run never constructs one, and a warm Lambda invocation
 * reuses the pair across sends instead of paying a fresh TCP+TLS+AMQP
 * handshake every time (NFR-2). */
let cached: CachedMicroserviceConnection | undefined;

/**
 * DD-11 — module-scope async mutex, held from probe/acquire through the
 * confirm. The WIDE scope is deliberate: the narrower "serialise
 * acquire/invalidate only" scope does not deliver the `'return'`-event
 * attribution `publishOnce` depends on — under the wide scope only one
 * publish is outstanding per channel at a time, so a returned message is
 * unambiguously attributable to it; without that, a returned message could
 * fail an unrelated concurrent send. The receipt kind is dispatched
 * `void … .catch()` (design.md §3.1), so a receipt publish can genuinely be
 * in flight while a concurrent awaited send is also in progress — without
 * this mutex, one send's failure (an invalidate) could tear the channel out
 * from under the other's publish.
 *
 * `acquire` bounds the wait by its own budget and FIFO-queues waiters so a
 * caller that gives up does not let a later caller jump ahead of whoever is
 * genuinely still in front of them; a released lock always resolves to
 * whichever waiter is longest-queued.
 */
class MailSendMutex {
  private locked = false;
  private readonly waiters: Array<() => void> = [];

  /** Resolves with a release function once the lock is held. Rejects with
   * {@link MicroserviceMailLockTimeoutError} — never touching the broker —
   * if `waitBudgetMs` elapses first, and removes itself from the wait queue
   * so a later, still-waiting caller is not skipped. */
  async acquire(waitBudgetMs: number): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>((resolve, reject) => {
      let settled = false;
      const onTurn = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.locked = true;
        resolve(() => this.release());
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const index = this.waiters.indexOf(onTurn);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(new MicroserviceMailLockTimeoutError());
      }, waitBudgetMs);
      this.waiters.push(onTurn);
    });
  }

  private release(): void {
    // Hand off directly to the next waiter (the lock stays held, just by a
    // different caller) rather than clearing `locked` and letting a new
    // `acquire()` race the queue — that would let a caller that arrives
    // AFTER an existing waiter jump ahead of it.
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

let mailSendMutex = new MailSendMutex();

/** Test seam — reset the module-scope connection cache and mutex between
 * specs, mirroring `resetSesClient()` / `resetMailTransport()`. */
export function resetMicroserviceMailTransportState(): void {
  cached = undefined;
  mailSendMutex = new MailSendMutex();
}

/**
 * Races `promise` against a deadline of `timeoutMs`, constructed via
 * `onTimeout()`. Matches `withPreSendAllowance` in
 * `registrations/registrations.service.ts` (T-7) exactly, including the
 * orphaned-promise guard: `backend/src` registers no `unhandledRejection`
 * handler, so if `promise` loses the race and rejects LATER with nobody
 * listening, that terminates the Lambda container outright. Attaching
 * `.catch(() => {})` at race construction — not to the deadline promise,
 * to `promise` itself — prevents that.
 */
function raceAgainstDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), timeoutMs);
  });
  promise.catch(() => {
    // Orphaned-promise guard — see docblock above.
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** §4.3 step 2 — attach the `'error'`/`'close'` listeners DD-5 mandates on
 * a freshly-created connection or channel. Sanitizes, sets `healthy =
 * false`, and NEVER rethrows: without a listener at all, Node throws an
 * `'error'` emitted between invocations as an unhandled exception and
 * prints it verbatim — credential and all — which is exactly the freeze-
 * window leak path DD-5 exists to close. */
function attachHealthListeners(
  entry: CachedMicroserviceConnection,
  emitter: NodeJS.EventEmitter,
  logger: Logger,
): void {
  emitter.on('error', (err: unknown) => {
    entry.healthy = false;
    logger.warn(`microservice mail connection error: ${sanitizeEscapingError(err).message}`);
  });
  emitter.on('close', () => {
    entry.healthy = false;
  });
}

/** `checkQueue` (DD-3): verifies the queue exists — never declares,
 * creates, or modifies it (FR-1's `BUT`) — and reads `consumerCount`
 * (D-J′): existence is not consumption, so a `0` is logged as a WARN
 * signal, never a failure; nothing here fails the build over it. */
async function verifyQueue(
  channel: amqp.ConfirmChannel,
  queueName: string,
  logger: Logger,
): Promise<void> {
  const result = await channel.checkQueue(queueName);
  if (result.consumerCount === 0) {
    logger.warn(`Mail queue "${queueName}" has no active consumers (D-J′ signal, not a gate).`);
  }
}

/** §4.3 step 2 — open a fresh connection + confirm channel, attach the
 * DD-5 listeners, and verify the queue (DD-3). Tears down anything already
 * opened if a later step fails, so a failed connect never leaks a socket
 * even though it also never reaches the module-scope cache. */
async function connectFresh(
  config: MicroserviceMailBrokerConfig,
  logger: Logger,
): Promise<CachedMicroserviceConnection> {
  const connectUrl = withHeartbeat(config.rabbitmqUrl, MICROSERVICE_MAIL_HEARTBEAT_SECONDS);
  const model = await amqp.connect(connectUrl);
  // `channel` is filled in immediately below; every path that can return
  // early instead throws, so callers never observe an entry with a stale
  // placeholder channel.
  const entry = { model, channel: null, healthy: true } as unknown as CachedMicroserviceConnection;
  attachHealthListeners(entry, model, logger);
  try {
    entry.channel = await model.createConfirmChannel();
    attachHealthListeners(entry, entry.channel, logger);
    await verifyQueue(entry.channel, config.queueName, logger);
  } catch (err) {
    detachTeardown(entry);
    throw err;
  }
  return entry;
}

/** DD-4 step 4 — a step-1/2 failure (no message has been published yet, so
 * this is not a republish): retry the connection **at most once**.
 * `checkQueue` returning NOT_FOUND is never retried at any point in this
 * function — it is a configuration error, not a connection failure
 * (DD-11). */
async function connectWithRetry(
  config: MicroserviceMailBrokerConfig,
  logger: Logger,
): Promise<CachedMicroserviceConnection> {
  try {
    return await connectFresh(config, logger);
  } catch (err) {
    if (isQueueNotFoundError(err)) {
      throw new MicroserviceMailQueueNotFoundError(config.queueName);
    }
    try {
      return await connectFresh(config, logger);
    } catch (retryErr) {
      if (isQueueNotFoundError(retryErr)) {
        throw new MicroserviceMailQueueNotFoundError(config.queueName);
      }
      throw new MicroserviceMailConnectionError();
    }
  }
}

type ProbeOutcome = 'alive' | 'stale' | 'not-found';

/**
 * DD-11 — the pre-publish liveness probe on a CACHED connection, bounded by
 * its own {@link MAIL_PROBE_TIMEOUT_MS} sub-deadline, not the overall send
 * deadline. Without that separate bound, a half-open socket (D-F's
 * canonical shape) would consume the entire send budget hanging on exactly
 * the round-trip this probe exists to bound, leaving nothing for the
 * reconnect DD-4 needs to recover it.
 *
 * `checkQueue`'s two roles, kept apart (DD-11's central point): a timeout
 * means the connection is stale (`'stale'` — invalidate, reconnect, retry
 * once); a NOT_FOUND means the queue does not exist (`'not-found'` — a
 * configuration error, thrown immediately, never reconnected for).
 * Conflating them would cost a mistyped `EMAIL_QUEUE_NAME` two full
 * connection cycles per send and surface it as a timeout instead of the
 * loud configuration error DD-3 exists to produce.
 */
async function probeConnection(
  entry: CachedMicroserviceConnection,
  queueName: string,
  logger: Logger,
): Promise<ProbeOutcome> {
  try {
    await raceAgainstDeadline(
      verifyQueue(entry.channel, queueName, logger),
      MAIL_PROBE_TIMEOUT_MS,
      () => new MicroserviceMailProbeTimeoutError(),
    );
    return 'alive';
  } catch (err) {
    if (isQueueNotFoundError(err)) {
      return 'not-found';
    }
    // Includes our own MicroserviceMailProbeTimeoutError (the hang case
    // DD-11 exists for) and any other channel/connection failure.
    return 'stale';
  }
}

/** Closed on a detached, result-ignored call — never awaited inside the
 * deadline (§4.3), so a failed send leaks neither socket nor heartbeat
 * timer, and cleanup cannot consume the caller's budget. */
function detachTeardown(entry: CachedMicroserviceConnection): void {
  // T-4 rework (reviewer issue 1, consequence (b)): `confirmPublish`'s
  // `'return'` listener is removed inside the ack callback, which never
  // fires on a hung publish. Every path that invalidates an entry now
  // funnels through here, so stripping any lingering `'return'` listener
  // at the one shared teardown point closes that gap without needing a
  // reference into `confirmPublish`'s closure — and it matters less now
  // that `cached` is always cleared alongside (see `send()`'s catch and
  // `publishOnce`'s catch), since a stale entry's channel is never handed
  // to a later send: this is defense in depth against exactly the
  // misattribution DD-11's wide mutex scope exists to prevent, for the
  // window before the detached `close()` below actually completes.
  entry.channel?.removeAllListeners('return');
  void entry.model.close().catch(() => {
    // Closing an already-broken connection can itself reject; nothing
    // actionable here — the connection is being discarded either way.
  });
}

/**
 * §4.3 step 1/2 — reuse the cached pair if it is healthy and the probe
 * confirms it; otherwise invalidate whatever is cached (if anything) and
 * connect fresh, with DD-4's single retry. A probe reporting `'not-found'`
 * is a configuration error and is thrown immediately WITHOUT this function
 * invalidating the connection itself (DD-11).
 *
 * Corrected during T-4 rework (advisory A-1): the previous wording here
 * said this was safe because "the connection itself is fine, only the
 * configured queue name is wrong". Verified against `amqplib@2.0.1`
 * (`lib/channel.js`), that is false — a 404 on `checkQueue`'s passive
 * declare closes the **channel**, not just the logical queue reference.
 * The actual reason this function does not need to invalidate is
 * different: that channel closure fires the `'close'` listener
 * `attachHealthListeners` attached at connect time (DD-5), which already
 * sets `cached.healthy = false` on its own. The next `acquireConnection`
 * call therefore sees an unhealthy cached pair and reconnects without any
 * help from this branch — invalidating here too would be redundant, not
 * incorrect, but "the connection is fine" was the wrong reason for it.
 */
async function acquireConnection(
  config: MicroserviceMailBrokerConfig,
  logger: Logger,
): Promise<CachedMicroserviceConnection> {
  if (cached?.healthy) {
    const outcome = await probeConnection(cached, config.queueName, logger);
    if (outcome === 'alive') {
      return cached;
    }
    if (outcome === 'not-found') {
      throw new MicroserviceMailQueueNotFoundError(config.queueName);
    }
    // 'stale' falls through to invalidate + reconnect below.
  }
  if (cached) {
    detachTeardown(cached);
    cached = undefined;
  }
  cached = await connectWithRetry(config, logger);
  return cached;
}

/**
 * §4.3 step 3 — publish exactly once, persistent (`delivery_mode = 2`),
 * `mandatory: true` (DD-3), on the confirm channel, and await the confirm.
 *
 * `mandatory` plus the `'return'` listener close DD-3's second gap: a
 * publisher confirm attests persistence, not routing, so a message that
 * became unroutable between `checkQueue` and `publish` would otherwise ack
 * successfully and vanish. RabbitMQ delivers a `'return'` for an unroutable
 * mandatory message BEFORE (or, at worst, interleaved with) its confirm
 * ack — the listener is attached before `publish` is called and consulted
 * inside the ack callback, so a return is never missed regardless of that
 * ordering.
 */
function confirmPublish(
  channel: amqp.ConfirmChannel,
  queueName: string,
  content: Buffer,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let wasReturned = false;
    const onReturn = (): void => {
      wasReturned = true;
    };
    channel.once('return', onReturn);
    channel.publish(
      '',
      queueName,
      content,
      {
        persistent: true, // delivery_mode = 2 (FR-1)
        mandatory: true, // DD-3
        contentType: 'application/json',
      },
      (err) => {
        channel.removeListener('return', onReturn);
        if (wasReturned) {
          reject(new MicroserviceMailUndeliverableError(queueName));
          return;
        }
        if (err) {
          reject(new MicroserviceMailPublishError());
          return;
        }
        resolve();
      },
    );
  });
}

/**
 * §4.3 step 5 — on ANY step-3 failure (nack, return, or the overall
 * deadline expiring mid-publish), invalidate the connection and NEVER
 * republish (DD-4, FR-1's `AND IT MUST`: exactly once per send call). The
 * duplicate this would otherwise risk — a second OTP, a second approval
 * notice — is structurally impossible because this function makes exactly
 * one `channel.publish` call, full stop, with no retry loop anywhere in
 * this file.
 */
async function publishOnce(
  entry: CachedMicroserviceConnection,
  envelope: MicroserviceMailEnvelope,
  queueName: string,
): Promise<void> {
  const content = Buffer.from(JSON.stringify(envelope), 'utf8');
  try {
    await confirmPublish(entry.channel, queueName, content);
  } catch (err) {
    detachTeardown(entry);
    if (cached === entry) {
      cached = undefined;
    }
    throw err instanceof MicroserviceMailTransportError ? err : new MicroserviceMailPublishError();
  }
}

/**
 * T-4 — `MicroserviceMailTransport` (design.md §4.2, §4.3, §4.4; FR-1,
 * NFR-1, NFR-2). A plain class implementing `MailTransport`'s one method —
 * no DI, no module registration, no provider, matching `SesMailTransport`
 * and `NoOpMailTransport`. Selected by `mail-transport.factory.ts`'s
 * exhaustive switch.
 *
 * The four responsibilities from §4.2: resolve configuration lazily on
 * first send (delegated to `getMicroserviceMailConfig`); own the
 * connection (the module-scope `cached` + `mailSendMutex` above, not an
 * instance field — this class has no connection-related state of its own,
 * matching `getSesClient()`'s singleton shape); build the envelope
 * (T-2's `buildMicroserviceEnvelope`, called with an explicitly
 * destructured, narrower config — see below); publish under one bounded
 * deadline (this method).
 */
export class MicroserviceMailTransport implements MailTransport {
  private readonly logger = new Logger(MicroserviceMailTransport.name);

  async send(message: MailMessage): Promise<void> {
    // Inherited constraint from T-2's review (A-6): destructure the config
    // at the call site, NEVER spread. `MicroserviceMailConfig` is a
    // structural superset of what the builder needs — it also carries the
    // credential-bearing `rabbitmqUrl` — so passing it whole type-checks
    // but would hand the broker URL into the builder. Harmless today (the
    // builder takes an explicit, narrower `MicroserviceEnvelopeConfig`
    // literal, never a spread), but a future `...config` inside the
    // builder would publish it straight into the message body (FR-7,
    // NFR-3). Destructuring here, into two separate narrower literals
    // below, forecloses that at the cheapest possible moment: there is no
    // single object in this method that carries both the broker URL and
    // gets handed to the envelope builder.
    const { rabbitmqUrl, queueName, apiKey, senderAddress, senderName } =
      getMicroserviceMailConfig();

    // §4.3 step 0: the lock-wait is bounded by its own sub-budget
    // (MAIL_LOCK_WAIT_TIMEOUT_MS) and happens BEFORE the critical section —
    // see the trap this guards against in the block comment on `try` below.
    const release = await mailSendMutex.acquire(MAIL_LOCK_WAIT_TIMEOUT_MS);
    try {
      // The mutex must be released on every path, including the deadline.
      // That is why this `Promise.race` (via `raceAgainstDeadline`) is
      // constructed HERE — inside the try/finally that guards the lock —
      // and never around the `mailSendMutex.acquire()` call above: a
      // timeout here unwinds through the `finally` below like any other
      // outcome, exactly like every other exit from this try block. Node
      // in Lambda is single-threaded, so a lock leaked on the timeout path
      // would fail every subsequent send in that container for its
      // lifetime, undiagnosably.
      await raceAgainstDeadline(
        this.sendLocked(
          message,
          { rabbitmqUrl, queueName },
          { apiKey, senderAddress, senderName },
        ),
        MAIL_SEND_TIMEOUT_MS,
        () => new MicroserviceMailTimeoutError(),
      );
    } catch (err) {
      // T-4 rework (reviewer issue 1): design.md §4.3 step 5 names the
      // overall deadline as one of the three step-3 failure triggers that
      // must invalidate — "On a step-3 failure (deadline, nack, or
      // return): never republish. Invalidate and throw a sanitized error."
      // `publishOnce`'s own catch already invalidates on a nack/return,
      // because THAT rejection is what drives it. A deadline is different:
      // it is detected here, by `raceAgainstDeadline`, while the orphaned
      // `sendLocked()` promise (still holding whatever entry it acquired)
      // keeps running in the background — see that function's docblock.
      // Without this, the pair sits in `cached` reporting `healthy ===
      // true` until the NEXT send's probe pays the full
      // MAIL_PROBE_TIMEOUT_MS to discover it is wedged. We still hold the
      // mutex at this point (release() has not run yet, see `finally`
      // below), so nothing else can be reading or writing `cached`
      // concurrently with this check.
      if (err instanceof MicroserviceMailTimeoutError && cached) {
        detachTeardown(cached);
        cached = undefined;
      }
      throw sanitizeEscapingError(err);
    } finally {
      release();
    }
  }

  /** §4.3 steps 1–3, run while the mutex is held. */
  private async sendLocked(
    message: MailMessage,
    brokerConfig: MicroserviceMailBrokerConfig,
    envelopeConfig: MicroserviceEnvelopeConfig,
  ): Promise<void> {
    const entry = await acquireConnection(brokerConfig, this.logger);
    // Same destructure-not-spread discipline as `send()` — `envelopeConfig`
    // was already built as its own narrow literal there, and is passed
    // through unchanged rather than merged with `brokerConfig`.
    const envelope = buildMicroserviceEnvelope(message, envelopeConfig);
    await publishOnce(entry, envelope, brokerConfig.queueName);
  }
}
