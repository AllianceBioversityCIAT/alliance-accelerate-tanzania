import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConsentSupersessionService } from './consent-supersession.service';

/**
 * T-3 — A small, Prisma-only module (design.md §5.5, P-30). `ActorsModule`
 * imports this ONE-WAY so its four admin write paths (`update`,
 * `bulkSetConsent`, `remove`, `bulkDelete`) can supersede pending consent
 * requests inside their own transactions. `ConsentRequestsModule` imports it
 * too (its `enqueue`'s `single`-scope branch). Neither module imports the
 * other, and no `forwardRef` is needed.
 */
@Module({
  imports: [PrismaModule],
  providers: [ConsentSupersessionService],
  exports: [ConsentSupersessionService],
})
export class ConsentSupersessionModule {}
