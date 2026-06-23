/**
 * T-4 — Role-aware serializer (DD-2): the ONLY exit through which a raw Actor
 * becomes a `Public`-role response.
 *
 * Per DD-2 services never return raw Prisma entities to controllers — every
 * public read passes through {@link toPublic}, which consults the single
 * PII/consent policy (DD-1). This is defense in depth beyond DTO shaping: the
 * public object is built by EXPLICIT allowlist of public fields (NOT spread +
 * delete), so adding a new PII column to the schema later cannot accidentally
 * leak it into a public response.
 *
 * Design refs: design.md §5 (public projection), §7, §10 (DD-1/DD-2/DD-3).
 * Requirements: FR-5 (PII boundary), NFR-1 (PII server-enforced).
 */

import { Prisma } from '@prisma/client';
import { ConsentBearer, publicGps } from './pii-consent.policy';

/**
 * The design §5 public projection — the shared contract reused by T-5 and the
 * frontend. `gps` is present ONLY when consent is GRANTED; all PII fields,
 * `traderId`, `gpsAltitude`, `gpsAccuracy`, and exact-GPS-when-not-granted are
 * absent by construction.
 */
export interface PublicActor {
  id: string;
  traderName: string;
  region: string;
  district: string | null;
  traderType: string;
  capacityTons: number | null;
  crops: string[];
  gps: { lat: number; long: number } | null;
}

/**
 * The Actor shape the serializer ACCEPTS as input — a full actor, including the
 * PII fields and the non-public columns (`traderId`, `gpsAltitude`,
 * `gpsAccuracy`). They are declared here precisely because the serializer's job
 * is to RECEIVE them and provably NOT emit them: a filter whose input type
 * excluded PII would not be filtering anything. The Prisma `Actor` entity (with
 * its `crops` relation) is assignable to this type, and `toPublic` reads ONLY
 * the public subset via explicit pick.
 */
export interface SerializableActor extends ConsentBearer {
  // Public columns (emitted).
  id: string;
  traderName: string;
  region: string;
  district?: string | null;
  traderType: string;
  capacityTons?: Prisma.Decimal | number | string | null;
  crops?: SerializableCropLink[] | null;

  // Non-public columns — accepted on input, NEVER emitted (DD-1/NFR-1).
  traderId?: string;
  phone?: string | null;
  email?: string | null;
  sex?: string | null;
  position?: string | null;
  marketLocation?: string | null;
  technicalSupport?: string | null;
  gpsAltitude?: Prisma.Decimal | number | string | null;
  gpsAccuracy?: Prisma.Decimal | number | string | null;
}

/** A crop relation row, or an already-mapped crop name. */
export interface SerializableCropLink {
  crop?: { name: string } | null;
}

/**
 * Project a raw Actor onto the public §5 shape (DD-2).
 *
 * Built by explicit field PICK — no PII field, `traderId`, `gpsAltitude`,
 * `gpsAccuracy`, or non-consented GPS can appear because they are simply never
 * written into the output. `gps` is delegated to {@link publicGps}, which gates
 * on consent (FR-5/DD-3).
 */
export function toPublic(actor: SerializableActor): PublicActor {
  return {
    id: actor.id,
    traderName: actor.traderName,
    region: actor.region,
    district: actor.district ?? null,
    traderType: actor.traderType,
    capacityTons: toNullableNumber(actor.capacityTons),
    crops: mapCrops(actor.crops),
    gps: publicGps(actor),
  };
}

/**
 * Map an actor's crop relation rows to a `string[]` of crop names. A missing or
 * empty relation yields `[]`; rows without a resolvable name are dropped.
 */
function mapCrops(crops: SerializableCropLink[] | null | undefined): string[] {
  if (!crops || crops.length === 0) return [];

  return crops
    .map((link) => link.crop?.name)
    .filter((name): name is string => typeof name === 'string');
}

/**
 * Convert a Prisma `Decimal` / number / numeric string to a finite number, or
 * `null`. Mirrors the policy's GPS conversion so public numerics never leak NaN.
 */
function toNullableNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;

  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}
