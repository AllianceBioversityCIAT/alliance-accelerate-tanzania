import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global PrismaModule — exposes the single PrismaService to every module
 * without re-importing (single shared client, NFR-3).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
