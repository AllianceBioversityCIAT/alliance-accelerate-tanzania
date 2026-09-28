/**
 * Throwaway probe: does the OneCGIAR notification microservice reply to us?
 *
 * We publish without `replyTo`/`correlationId`, so NestJS treats our message
 * as an event and discards the handler's return value. Its consumer is
 * `@MessagePattern('send')` — request/response — and `sendMail` returns 201 on
 * success and 500 with `errors` on an SMTP failure rather than throwing. So a
 * reply channel should exist. This probe is the empirical check, before any
 * design leans on it.
 *
 * Usage (from repo root):
 *   node backend/scripts/probe-microservice-reply.mjs --to you@cgiar.org
 *   node backend/scripts/probe-microservice-reply.mjs --undeliverable
 *
 * ⚠️ `--to` SENDS A REAL EMAIL to that address. `--undeliverable` targets a
 *    reserved `.invalid` domain that can never resolve, so nothing is
 *    delivered anywhere — that mode is the one that proves we can observe a
 *    FAILURE, which is the whole point.
 *
 * Reads backend/.env. Prints no credential. Publishes exactly one message and
 * mutates nothing.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = process.env.PROBE_ENV ?? join(HERE, '..', '.env');

const REPLY_TIMEOUT_MS = Number(process.env.PROBE_REPLY_TIMEOUT_MS ?? 30_000);
const UNDELIVERABLE = 'probe-no-such-mailbox@nonexistent.invalid';

function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`could not read ${path} — pass PROBE_ENV=/path/to/.env to override.`);
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(2);
}

function required(name) {
  const v = process.env[name];
  if (!v) fail(`missing required env var ${name}`);
  return v;
}

/** Keep the API key out of stdout even if the microservice echoes it back. */
function redact(text, apiKey) {
  return apiKey ? text.split(apiKey).join('«apiKey-redacted»') : text;
}

function parseArgs(argv) {
  // --malformed sends a `to` the microservice's own validator rejects, to find
  // out what the reply channel CAN carry when something really does fail.
  if (argv.includes('--malformed')) return { to: 'not-an-address', malformed: true };
  const undeliverable = argv.includes('--undeliverable');
  const i = argv.indexOf('--to');
  const to = i !== -1 ? argv[i + 1] : undefined;

  if (undeliverable && to) fail('pass --to OR --undeliverable, not both.');
  if (!undeliverable && !to) {
    fail(
      'pass a target:\n' +
        '  --to <address>    sends a REAL email, expect a 201-shaped reply\n' +
        '  --undeliverable   targets a reserved .invalid domain, expect a failure reply',
    );
  }
  if (to && !to.includes('@')) fail(`"${to}" is not address-shaped.`);

  return { to: undeliverable ? UNDELIVERABLE : to, undeliverable };
}

async function main() {
  loadEnv(ENV_PATH);
  const { to, undeliverable } = parseArgs(process.argv.slice(2));

  const rabbitmqUrl = required('RABBITMQ_URL');
  const apiKey = required('MICROSERVICE_API_KEY');
  const queueName = required('EMAIL_QUEUE_NAME');
  const senderAddress = required('EMAIL_SENDER');
  const senderName = process.env.EMAIL_SENDER_NAME ?? 'ACCELERATE Tanzania Seed Registry -';

  const correlationId = randomUUID();

  // `id` in the BODY is what makes NestJS's ServerRMQ treat this as a request
  // rather than an event; replyTo alone is not enough. Omit it with --no-id to
  // reproduce today's production shape.
  const withId = !process.argv.includes('--no-id');


  console.log('── probe ────────────────────────────────────────────────────');
  console.log(`  queue          : ${queueName}`);
  console.log(`  from           : ${senderAddress}`);
  console.log(`  to             : ${to}${undeliverable ? '  (reserved .invalid — nothing is delivered)' : '  ⚠️  REAL SEND'}`);
  console.log(`  correlationId  : ${correlationId}`);
  console.log(`  reply timeout  : ${REPLY_TIMEOUT_MS} ms`);
  console.log(`  body \`id\`      : ${withId ? 'set (request shape)' : 'omitted (today\'s production shape)'}`);
  console.log(`  broker / key   : [set, not printed]`);
  console.log('─────────────────────────────────────────────────────────────\n');

  // amqplib comes from backend/node_modules — the same version the transport uses.
  const amqp = await import('amqplib');

  const connection = await amqp.connect(rabbitmqUrl);
  const channel = await connection.createConfirmChannel();

  // Exclusive + autoDelete: the reply queue dies with this connection, so the
  // probe leaves no residue on the platform team's broker.
  const replyQueue = await channel.assertQueue('', { exclusive: true, autoDelete: true });

  const envelope = {
    pattern: 'send',
    ...(withId ? { id: correlationId } : {}),
    data: {
      apiKey,
      data: {
        from: { email: senderAddress, name: senderName },
        emailBody: {
          subject: `Reply-channel probe ${correlationId.slice(0, 8)}`,
          to,
          message: { text: 'Throwaway probe for ATP-70. Safe to ignore and delete.' },
        },
      },
    },
  };

  // The consumer is registered BEFORE the publish, so a fast reply cannot
  // arrive while nobody is listening.
  let onReply;
  const settled = new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: 'timeout' }), REPLY_TIMEOUT_MS);
    onReply = (msg) => {
      if (!msg) return;
      const body = msg.content.toString('utf8');
      let bodyId;
      try { bodyId = JSON.parse(body)?.id; } catch { /* not JSON — fall through */ }
      if (msg.properties.correlationId !== correlationId && bodyId !== correlationId) {
        console.log('  (ignored a reply matching neither our correlationId nor our id)');
        return;
      }
      clearTimeout(timer);
      resolve({ kind: 'reply', raw: msg.content.toString('utf8') });
    };
  });
  await channel.consume(replyQueue.queue, onReply, { noAck: true });

  const startedAt = Date.now();
  await new Promise((resolve, reject) => {
    channel.publish('', queueName, Buffer.from(JSON.stringify(envelope), 'utf8'), {
      persistent: true,
      mandatory: true,
      contentType: 'application/json',
      replyTo: replyQueue.queue,
      correlationId,
    }, (err) => (err ? reject(err) : resolve()));
  });
  console.log(`✓ broker confirmed the publish after ${Date.now() - startedAt} ms — this is all we learn today.\n`);

  const outcome = await settled;

  if (outcome.kind === 'timeout') {
    console.log(`✖ NO REPLY within ${REPLY_TIMEOUT_MS} ms.`);
    console.log('\n  Reading this result:');
    console.log('  • The microservice may not honour replyTo on its deployed build, OR');
    console.log('  • the SMTP send is slower than the timeout (raise PROBE_REPLY_TIMEOUT_MS), OR');
    console.log('  • the reply went somewhere this probe is not listening.');
    console.log('  A timeout does NOT prove the reply channel is unavailable — it proves');
    console.log('  we did not observe one under these conditions.');
    process.exitCode = 1;
  } else {
    const elapsed = Date.now() - startedAt;
    console.log(`✓ REPLY RECEIVED after ${elapsed} ms.\n`);
    console.log('  Raw payload:');
    console.log(
      redact(outcome.raw, apiKey)
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n'),
    );
    try {
      const parsed = JSON.parse(outcome.raw);
      const status = parsed?.response?.status ?? parsed?.status;
      console.log(`\n  status field   : ${status ?? '(none found)'}`);
      console.log(`  carries err?   : ${parsed?.err !== undefined ? 'yes' : 'no'}`);
      console.log(`  isDisposed?    : ${parsed?.isDisposed ?? '(absent)'}`);
    } catch {
      console.log('\n  (payload is not JSON — recorded verbatim above)');
    }
    console.log('\n  ⚠️  What this does NOT establish: that a 201-shaped reply means the mail');
    console.log('      ARRIVED. An SMTP server can accept a message and bounce it later, and');
    console.log(`      the reply would still say success. Run --undeliverable too: if THAT`);
    console.log('      also replies success, the reply attests handoff, not delivery.');
  }

  await channel.close();
  await connection.close();
}

main().catch((err) => {
  console.error(`\n✖ probe failed: ${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`);
  console.error('  (the broker URL and API key are never printed, so this message is safe to paste)');
  process.exit(2);
});
