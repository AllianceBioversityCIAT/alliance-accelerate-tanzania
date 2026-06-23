import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { ImportService } from './import.service';

/**
 * T-8 — ImportModule (DESIGN ONLY, execution-deferred — FR-9 / DD-4).
 *
 * Provides {@link ImportService} for the design-only real-file import.
 * Deliberately exposes NO controller / HTTP route — there is NO public import
 * endpoint, and execution against real data is gated behind the legal ratification
 * (see the LEGAL GATE in `import.service.ts`). PrismaModule is global (T-1); the
 * import is for explicitness. NOT registered in `app.module.ts` for v1, so the
 * service is never reachable at runtime — it is wired-but-not-executed per
 * design.md §7.
 */
@Module({
  imports: [PrismaModule],
  providers: [ImportService],
})
export class ImportModule {}
