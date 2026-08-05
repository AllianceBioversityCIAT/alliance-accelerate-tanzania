import { Module } from '@nestjs/common';
import { RegistrationsController } from './registrations.controller';

/**
 * T-2 — RegistrationsModule: public consent-policy endpoint (FR-3).
 *
 * Registered in `app.module.ts`. This module grows in later tasks (T-7…T-13)
 * to add the OTP, submission and lookup services/controllers; only the
 * consent-policy controller exists as of this task.
 */
@Module({
  controllers: [RegistrationsController],
})
export class RegistrationsModule {}
