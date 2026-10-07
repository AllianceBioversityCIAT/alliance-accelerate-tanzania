/**
 * T-3 (actors/consent-intake/consent-request-email, design.md §5.1, P-30) —
 * `buildAdminActorWhere` is EXTRACTED, behaviour-preserving, from the inline
 * `where` literal that used to live only inside `ActorsAdminService.adminList`.
 *
 * `ConsentRequestsService`'s "all matching" filter target (FR-4) calls this
 * SAME function, so "all matching" means exactly what `adminList`'s own
 * table shows — not a second, independently-maintained filter that could
 * drift from it.
 */

import { ConsentMethod, ConsentStatus, Prisma, RegistrationSource } from '@prisma/client';

/** The five filter fields both `adminList` and a consent-request filter target accept. */
export interface AdminActorFilterFields {
  region?: string;
  traderType?: string;
  consentStatus?: string;
  registrationSource?: RegistrationSource;
  consentMethod?: ConsentMethod;
}

export function buildAdminActorWhere(q: AdminActorFilterFields): Prisma.ActorWhereInput {
  return {
    ...(q.region ? { region: q.region } : {}),
    // Main type OR among the additional types; AND-nested so it can never clobber another OR.
    ...(q.traderType
      ? {
          AND: [
            {
              OR: [
                { traderType: q.traderType },
                { additionalTypes: { some: { traderType: q.traderType } } },
              ],
            },
          ],
        }
      : {}),
    ...(q.consentStatus ? { consentStatus: q.consentStatus as ConsentStatus } : {}),
    // T-8 (registration-source-and-consent) — AND-composed with the filters
    // above; this is FR-9's enumeration mechanism
    // (`consentStatus=GRANTED&consentMethod=NOT_RECORDED` finds the legacy
    // unevidenced set).
    ...(q.registrationSource ? { registrationSource: q.registrationSource } : {}),
    ...(q.consentMethod ? { consentMethod: q.consentMethod } : {}),
  };
}
