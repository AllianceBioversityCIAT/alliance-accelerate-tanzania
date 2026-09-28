/**
 * Does the reply channel still work after the connection has sat idle?
 *
 * This is the one gap the first probe could not close. `MicroserviceMailTransport`
 * caches its AMQP connection across Lambda invocations, and the reply queue's
 * consumer lives on that cached channel. Lambda freezes a container between
 * invocations; if the consumer does not survive a long idle gap, every send
 * after the gap would publish fine and then time out waiting for a reply that
 * can no longer be delivered — which would look exactly like a mail outage
 * while the mail was going out normally.
 *
 * This is NOT Lambda. It cannot freeze a process. What it CAN falsify is the
 * weaker precondition: that an exclusive auto-delete reply queue and its
 * consumer survive a long quiet period on an open connection, with the
 * heartbeat as their only traffic. If they do not survive that, they certainly
 * will not survive a freeze, and the design is wrong. If they do, the Lambda
 * question is still open — say so rather than reading this as a pass.
 *
 * Usage (from repo root):
 *   node backend/scripts/probe-reply-after-idle.mjs
 *   node backend/scripts/probe-reply-after-idle.mjs --idle 600
 *
 * Publishes to a reserved `.invalid` domain, so nothing is ever delivered.
 * Reads backend/.env. Prints no credential.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = process.env.PROBE_ENV ?? join(HERE, '..', '.env');
const UNDELIVERABLE = 'probe-no-such-mailbox@nonexistent.invalid';
const REPLY_TIMEOUT_MS = 30_000;

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(2);
}

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

function required(name) {
  const v = process.env[name];
  if (!v) fail(`missing required env var ${name}`);
  return v;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  loadEnv(ENV_PATH);

  const i = process.argv.indexOf('--idle');
  const idleSeconds = i !== -1 ? Number(process.argv[i + 1]) : 360;
  if (!Number.isFinite(idleSeconds) || idleSeconds < 0) fail('--idle takes a number of seconds.');

  const rabbitmqUrl = required('RABBITMQ_URL');
  const apiKey = required('MICROSERVICE_API_KEY');
  const queueName = required('EMAIL_QUEUE_NAME');
  const senderAddress = required('EMAIL_SENDER');
  const senderName = process.env.EMAIL_SENDER_NAME ?? 'ACCELERATE Tanzania Seed Registry -';

  console.log('── idle-survival probe ──────────────────────────────────────');
  console.log(`  queue         : ${queueName}`);
  console.log(`  to            : ${UNDELIVERABLE}  (nothing is delivered)`);
  console.log(`  idle gap      : ${idleSeconds}s between the two publishes`);
  console.log(`  broker / key  : [set, not printed]`);
  console.log('─────────────────────────────────────────────────────────────\n');

  const amqp = await import('amqplib');

  // ONE connection and ONE channel for both publishes — the whole point. The
  // transport caches exactly this pair across invocations.
  const connection = await amqp.connect(rabbitmqUrl);
  const channel = await connection.createConfirmChannel();
  const { queue: replyQueue } = await channel.assertQueue('', {
    exclusive: true,
    autoDelete: true,
  });

  // ONE consumer, registered once, never re-registered. If the transport's
  // consumer needs re-registering after idle, this probe reddens.
  const waiters = new Map();
  await channel.consume(
    replyQueue,
    (msg) => {
      if (!msg) return;
      const waiter = waiters.get(msg.properties.correlationId ?? '');
      if (waiter) waiter(msg.content.toString('utf8'));
    },
    { noAck: true },
  );

  let connectionDied = null;
  connection.on('error', (err) => {
    connectionDied = err?.message ?? 'error';
  });
  connection.on('close', () => {
    connectionDied ??= 'closed';
  });

  async function publishAndAwait(label) {
    const id = randomUUID();
    const envelope = {
      pattern: 'send',
      id,
      data: {
        apiKey,
        data: {
          from: { email: senderAddress, name: senderName },
          emailBody: {
            subject: `Idle-survival probe ${label} ${id.slice(0, 8)}`,
            to: UNDELIVERABLE,
            message: { text: 'Throwaway probe for ATP-70. Safe to ignore.' },
          },
        },
      },
    };

    const startedAt = Date.now();
    const replied = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), REPLY_TIMEOUT_MS);
      waiters.set(id, (raw) => {
        clearTimeout(timer);
        resolve(raw);
      });
    });

    await new Promise((resolve, reject) => {
      channel.publish(
        '',
        queueName,
        Buffer.from(JSON.stringify(envelope), 'utf8'),
        {
          persistent: true,
          mandatory: true,
          contentType: 'application/json',
          replyTo: replyQueue,
          correlationId: id,
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });

    const raw = await replied;
    waiters.delete(id);
    const elapsed = Date.now() - startedAt;

    if (raw === null) {
      console.log(`  ✖ ${label}: NO REPLY within ${REPLY_TIMEOUT_MS} ms`);
      return false;
    }
    let status;
    try {
      status = JSON.parse(raw)?.response?.status;
    } catch {
      /* not JSON */
    }
    console.log(`  ✓ ${label}: reply in ${elapsed} ms (status ${status ?? 'unparsed'})`);
    return true;
  }

  console.log('Publish 1 — immediately after opening the connection:');
  const first = await publishAndAwait('before idle');

  console.log(`\nIdling ${idleSeconds}s on the open connection (heartbeat only)…`);
  const idleStart = Date.now();
  // Report progress so a long run does not look hung.
  const tick = setInterval(() => {
    process.stdout.write(`\r  …${Math.round((Date.now() - idleStart) / 1000)}s elapsed   `);
  }, 15_000);
  await sleep(idleSeconds * 1000);
  clearInterval(tick);
  process.stdout.write('\r                              \r');

  if (connectionDied) {
    console.log(`\n  ⚠️  the connection reported "${connectionDied}" during the idle gap.`);
  }

  console.log('\nPublish 2 — on the SAME connection, channel, reply queue and consumer:');
  const second = await publishAndAwait('after idle');

  console.log('\n─────────────────────────────────────────────────────────────');
  if (first && second) {
    console.log(`  RESULT: the reply channel survived a ${idleSeconds}s idle gap.`);
    console.log('  Reading this result: it falsifies "the consumer dies when idle", which was');
    console.log('  the cheapest way the design could have been wrong. It does NOT establish');
    console.log('  that the channel survives a Lambda FREEZE — a frozen container stops');
    console.log('  executing entirely, including heartbeats, and only a deployed test can');
    console.log('  settle that. Treat this as one hazard removed, not as a pass.');
  } else if (first && !second) {
    console.log(`  RESULT: the reply channel DID NOT survive a ${idleSeconds}s idle gap.`);
    console.log('  This is the failure the design feared: the publish still succeeds, so mail');
    console.log('  keeps going out, but no outcome comes back and every send times out.');
    console.log('  The transport would need to re-open the reply queue on a stale connection');
    console.log('  rather than reuse it. Do not deploy the awaited-reply change as it stands.');
  } else {
    console.log('  RESULT: inconclusive — the FIRST publish already drew no reply, so this run');
    console.log('  says nothing about idling. Re-run; if it repeats, the broker or the');
    console.log('  microservice is not in the state this probe assumes.');
  }

  await channel.close();
  await connection.close();
  if (!(first && second)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\n✖ probe failed: ${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`);
  console.error('  (the broker URL and API key are never printed, so this is safe to paste)');
  process.exit(2);
});
