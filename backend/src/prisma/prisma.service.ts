import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Single, shared Prisma client (Lambda-tuned — NFR-3).
 *
 * One instance per Lambda container is reused across warm invocations, so we
 * never create a client per request. `$connect()` runs once on cold start.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
