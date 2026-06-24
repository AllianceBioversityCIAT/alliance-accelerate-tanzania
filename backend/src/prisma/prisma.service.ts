import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Build the datasource URL from discrete connection parts when the Lambda
 * provides them (DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD env vars), URL-
 * ENCODING the password so special characters can't corrupt the connection
 * string. CloudFormation `!Sub` cannot URL-encode a Secrets Manager dynamic
 * reference, so composing the URL here is the robust place to do it.
 *
 * Falls back to `undefined` (PrismaClient then reads `env("DATABASE_URL")` per
 * the schema) for local dev and the Prisma CLI (migrate/seed), which already
 * pass a correctly-encoded DATABASE_URL.
 */
function resolveDatabaseUrl(): string | undefined {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL } = process.env;
  if (!DB_HOST) return undefined;
  const user = encodeURIComponent(DB_USER ?? '');
  const pass = encodeURIComponent(DB_PASSWORD ?? '');
  const ssl = DB_SSL ?? 'accept_invalid_certs';
  return `mysql://${user}:${pass}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslaccept=${ssl}`;
}

/**
 * Single, shared Prisma client (Lambda-tuned — NFR-3).
 *
 * One instance per Lambda container is reused across warm invocations, so we
 * never create a client per request. `$connect()` runs once on cold start.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const url = resolveDatabaseUrl();
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
