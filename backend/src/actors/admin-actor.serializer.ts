// @sdd-spec admin/bulk-actor-operations

import { Prisma } from '@prisma/client';
import { SerializableCropLink } from '../common/role-aware.serializer';

/**
 * T-1 — Admin-only actor projection.
 *
 * Unlike `toPublic()` in `src/common/role-aware.serializer.ts`, this serializer
 * emits every Actor column including PII (`phone`, `email`, `sex`, `position`,
 * `marketLocation`, `technicalSupport`) and the current `consentStatus`. It is
 * the ONLY serializer that exposes non-consented actor data, and it is only
 * called from Admin-gated routes (FR-7, NFR-1).
 *
 * Design refs: `docs/specs/admin/bulk-actor-operations/design.md` §4.
 * Requirements: FR-1, FR-7, NFR-1.
 */

/** Full Admin actor response shape; crop relation is flattened to names. */
export interface AdminActor {
  id: string;
  traderId: string;
  traderName: string;
  region: string;
  district: string | null;
  traderType: string;
  sex: string | null;
  position: string | null;
  marketLocation: string | null;
  capacityTons: number | null;
  technicalSupport: string | null;
  phone: string | null;
  email: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAltitude: number | null;
  gpsAccuracy: number | null;
  consentStatus: string;
  crops: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Input accepted by {@link toAdminActor} — a raw Actor with its crop links. */
interface AdminActorInput {
  id: string;
  traderId: string;
  traderName: string;
  region: string;
  district?: string | null;
  traderType: string;
  sex?: string | null;
  position?: string | null;
  marketLocation?: string | null;
  capacityTons?: Prisma.Decimal | number | string | null;
  technicalSupport?: string | null;
  phone?: string | null;
  email?: string | null;
  gpsLatitude?: Prisma.Decimal | number | string | null;
  gpsLongitude?: Prisma.Decimal | number | string | null;
  gpsAltitude?: Prisma.Decimal | number | string | null;
  gpsAccuracy?: Prisma.Decimal | number | string | null;
  consentStatus: string;
  crops?: SerializableCropLink[] | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Project a raw Actor onto the Admin shape.
 *
 * Built by explicit field pick so no schema column is accidentally omitted or
 * hidden; numeric Decimals are coerced to finite JS numbers or `null`.
 */
export function toAdminActor(actor: AdminActorInput): AdminActor {
  return {
    id: actor.id,
    traderId: actor.traderId,
    traderName: actor.traderName,
    region: actor.region,
    district: actor.district ?? null,
    traderType: actor.traderType,
    sex: actor.sex ?? null,
    position: actor.position ?? null,
    marketLocation: actor.marketLocation ?? null,
    capacityTons: toNullableNumber(actor.capacityTons),
    technicalSupport: actor.technicalSupport ?? null,
    phone: actor.phone ?? null,
    email: actor.email ?? null,
    gpsLatitude: toNullableNumber(actor.gpsLatitude),
    gpsLongitude: toNullableNumber(actor.gpsLongitude),
    gpsAltitude: toNullableNumber(actor.gpsAltitude),
    gpsAccuracy: toNullableNumber(actor.gpsAccuracy),
    consentStatus: actor.consentStatus,
    crops: mapCrops(actor.crops),
    createdAt: actor.createdAt,
    updatedAt: actor.updatedAt,
  };
}

/** Map crop relation rows to a `string[]` of crop names; missing rows → `[]`. */
function mapCrops(crops: SerializableCropLink[] | null | undefined): string[] {
  if (!crops || crops.length === 0) return [];

  return crops
    .map((link) => link.crop?.name)
    .filter((name): name is string => typeof name === 'string');
}

/** Coerce a Prisma Decimal / number / numeric string to a finite number or null. */
function toNullableNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;

  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}
