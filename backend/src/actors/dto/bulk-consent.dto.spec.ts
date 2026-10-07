import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsentMethod } from '@prisma/client';
import { BulkConsentDto } from './bulk-consent.dto';
import { invalidProps } from '../../test/support/actor-input.fixture';

/**
 * T-1 (consent-request-email, DD-9) — `BulkConsentDto.consentMethod` must
 * validate against the admin-assertable subset, not the full `ConsentMethod`
 * enum: a batch-level unlock is always an admin assertion, and `EMAIL_LINK`
 * can only be written by the actor's own response to a consent-request link
 * (`common/consent-methods.ts`). No dedicated spec existed for this DTO
 * before this task; the base shape (ids/consentStatus bounds) is exercised
 * end-to-end by `actors-admin.service.spec.ts`'s `bulkSetConsent` suite —
 * this file is scoped to the consentMethod enum-membership rule only.
 */
describe('BulkConsentDto', () => {
  const validInput = {
    ids: ['actor-1', 'actor-2'],
    consentStatus: 'GRANTED',
  };

  it('passes a valid unlock payload with an admin-assertable method', async () => {
    const dto = plainToInstance(BulkConsentDto, {
      ...validInput,
      consentMethod: ConsentMethod.SIGNED_FORM,
      consentObtainedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  // Falsifier 1 (tasks.md T-1) — swapping ADMIN_ASSERTABLE_CONSENT_METHODS
  // for Object.values(ConsentMethod) in bulk-consent.dto.ts is what must
  // redden this.
  it('rejects EMAIL_LINK as the batch consentMethod (DD-9)', async () => {
    const dto = plainToInstance(BulkConsentDto, {
      ...validInput,
      consentMethod: ConsentMethod.EMAIL_LINK,
    });
    expect(await invalidProps(dto)).toContain('consentMethod');
  });
});
