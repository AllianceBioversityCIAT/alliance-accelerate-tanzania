import { validate } from 'class-validator';
import { ConsentStatus } from '@prisma/client';

/**
 * Shared by `actor-dto.spec.ts` and `admin-actor-dto.spec.ts`: which property
 * names produced at least one `class-validator` constraint violation.
 */
export async function invalidProps(dto: object): Promise<string[]> {
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

/**
 * A `validator.js`-valid email of EXACTLY `totalLength` characters, built by
 * padding the domain with dot-separated labels (each ≤ 63 chars, the DNS
 * label limit) rather than the local part (capped at 64 by `isEmail`).
 * Padding the local part instead fails `@IsEmail()`'s FORMAT check on its own
 * regardless of length, which would make a bound test pass for the wrong
 * reason (an inert fixture: it can't tell a length violation from a format
 * violation).
 */
export function validEmailOfLength(totalLength: number): string {
  const prefix = 'a@';
  const tld = '.com';
  let remaining = totalLength - prefix.length - tld.length;
  const labels: string[] = [];
  while (remaining > 63) {
    labels.push('x'.repeat(63));
    remaining -= 64; // 63 label chars + 1 joining dot
  }
  labels.push('x'.repeat(remaining));
  return `${prefix}${labels.join('.')}${tld}`;
}

/**
 * A fully-populated valid actor create input, shared by `ActorCreateDto` and
 * `AdminActorCreateDto` tests (which differ only in `consentStatus`'s default
 * and `AdminActorCreateDto`'s additional `crops` requirement — override both
 * as needed).
 */
export function validActorInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    traderId: 'TZ-0001',
    traderName: 'Mbeya Seed Traders Ltd',
    region: 'Mbeya',
    district: 'Mbeya Urban',
    traderType: 'seed_company',
    sex: 'F',
    contactPerson: 'Neema Shirima',
    capacityTons: 1250.5,
    phone: '+255700000000',
    email: 'contact@mbeyaseed.co.tz',
    gpsLatitude: -8.9094,
    gpsLongitude: 33.4607,
    consentStatus: ConsentStatus.GRANTED,
    ...overrides,
  };
}
