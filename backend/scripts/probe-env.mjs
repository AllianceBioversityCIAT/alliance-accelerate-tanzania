/**
 * Shared setup for the ATP-70 probe scripts. Both of them read the same
 * `.env`, need the same five variables, and must fail the same way — so the
 * loading lives here once rather than being copied into each.
 *
 * Nothing here prints a credential, and `readBrokerConfig` is the only place
 * that decides which variables a probe requires.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENV_PATH = process.env.PROBE_ENV ?? join(HERE, '..', '.env');

/** Reserved TLD (RFC 2606): it can never resolve, so nothing is delivered. */
export const UNDELIVERABLE = 'probe-no-such-mailbox@nonexistent.invalid';

export function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(2);
}

/** Minimal `.env` reader — real environment variables always win. */
export function loadEnv(path = DEFAULT_ENV_PATH) {
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

export function required(name) {
  const v = process.env[name];
  if (!v) fail(`missing required env var ${name}`);
  return v;
}

/**
 * The five variables every probe needs. `senderName` is the one that
 * defaults rather than throwing, matching `mail.config.ts`.
 */
export function readBrokerConfig() {
  return {
    rabbitmqUrl: required('RABBITMQ_URL'),
    apiKey: required('MICROSERVICE_API_KEY'),
    queueName: required('EMAIL_QUEUE_NAME'),
    senderAddress: required('EMAIL_SENDER'),
    senderName: process.env.EMAIL_SENDER_NAME ?? 'ACCELERATE Tanzania Seed Registry -',
  };
}
