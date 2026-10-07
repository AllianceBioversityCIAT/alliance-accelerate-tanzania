import { ConsentMethod } from '@prisma/client';

/**
 * T-1 (actors/consent-intake/consent-request-email) — `ConsentMethod` values
 * an ADMIN may assert directly (DD-9, design.md §5.7). `EMAIL_LINK` is
 * excluded: it is written ONLY by `ConsentPublicService.respond` (T-5), the
 * actor's own answer to a consent-request link — never by an admin write
 * path. Schema order, minus `EMAIL_LINK`.
 *
 * Consumers (P-15, design.md §5.7): `actor-create.dto.ts`, `bulk-consent.dto.ts`,
 * `actor-import.service.ts` (via `template-columns.ts`'s `CONSENT_METHOD_VALUES`),
 * `template-columns.ts` itself (keeps the committed import template
 * byte-identical). The UPDATE DTO and the admin list-filter DTO deliberately
 * keep the FULL `ConsentMethod` enum instead — see `admin-actor-update.dto.ts`
 * and `ActorsAdminService.update`'s rules 1-3 for why.
 */
export const ADMIN_ASSERTABLE_CONSENT_METHODS: readonly ConsentMethod[] =
  Object.values(ConsentMethod).filter(
    (method) => method !== ConsentMethod.EMAIL_LINK,
  ) as ConsentMethod[];
