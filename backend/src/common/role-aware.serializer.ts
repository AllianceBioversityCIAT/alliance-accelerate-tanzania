/**
 * T-4/T-7 — Role-aware serializer (DD-2): the ONLY exit through which a raw
 * Actor becomes a `Public`-role response.
 *
 * Per DD-2 services never return raw Prisma entities to controllers — every
 * public read passes through one of the two projections below, which consult
 * the single PII/consent policy (DD-1). This is defense in depth beyond DTO
 * shaping: both public objects are built by EXPLICIT allowlist of public
 * fields (NOT spread + delete), so adding a new column to the schema later
 * cannot accidentally leak it into a public response.
 *
 * T-7 (`actors/public-profile-disclosure`, design.md §7.2/§6) split the
 * single pre-existing projection into two: {@link toPublicListItem} (the
 * list set — `GET /api/v1/actors`, FR-9) and {@link toPublicDetail} (the
 * published set — `GET /api/v1/actors/:id`, FR-1). See
 * `requirements.md`'s glossary for both terms.
 *
 * Design refs: design.md §6, §7.2, §12 DD-3/DD-9. Requirements: FR-1, FR-9,
 * NFR-1.
 */

import { Prisma } from '@prisma/client';
import { ConsentBearer, publicGps } from './pii-consent.policy';

/**
 * T-7/design.md §6 — the LIST set: what `GET /api/v1/actors` returns, and
 * therefore all the map, dashboard, and CSV can ever carry (FR-9). `sex` and
 * `otherCrops` are members here, not in the contact block — see
 * `PUBLICLY_DISCLOSED_FIELDS`' doc in `pii-consent.policy.ts` for why that is
 * not inferable from UI or schema adjacency.
 */
export interface PublicActorListItem {
  id: string;
  traderName: string;
  region: string;
  district: string | null;
  traderType: string;
  capacityTons: number | null;
  crops: string[];
  gps: { lat: number; long: number } | null;
  sex: string | null;
  otherCrops: string | null;
}

/**
 * T-7/design.md §6 — the PUBLISHED set: what `GET /api/v1/actors/:id`
 * returns for a `GRANTED` actor (FR-1) — the list set plus the contact block
 * (`contactPerson`, `position`, `phone`, `email`, `marketLocation`, per
 * `CONTACT_BLOCK_FIELDS` in `pii-consent.policy.ts`). Never returned by the
 * list path (FR-9).
 */
export interface PublicActorDetail extends PublicActorListItem {
  contactPerson: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  marketLocation: string | null;
}

/**
 * The Actor shape the projections ACCEPT as input — a full actor, including
 * every field either projection may read. Declared here precisely because
 * the projections' job is to RECEIVE the full row and provably pick only
 * their own subset — a filter whose input type excluded a field would not be
 * filtering it. The Prisma `Actor` entity (with its `crops` relation) is
 * assignable to this type.
 *
 * `traderId`, `technicalSupport`, `gpsAltitude`, and `gpsAccuracy` are
 * accepted on input and read by NEITHER projection (design.md DD-3,
 * `NEVER_PUBLIC_FIELDS` in `pii-consent.policy.ts`). Every other field below
 * is read by at least one of {@link toPublicListItem} / {@link toPublicDetail}.
 */
export interface SerializableActor extends ConsentBearer {
  // Read by BOTH projections (the list set).
  id: string;
  traderName: string;
  region: string;
  district?: string | null;
  traderType: string;
  capacityTons?: Prisma.Decimal | number | string | null;
  crops?: SerializableCropLink[] | null;
  sex?: string | null;
  otherCrops?: string | null;

  // Read ONLY by toPublicDetail — the contact block (FR-1), withheld from
  // the list by toPublicListItem simply never naming them (FR-9).
  contactPerson?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  marketLocation?: string | null;

  // Never public (DD-1/NFR-1) — accepted on input, emitted by neither
  // projection.
  traderId?: string;
  technicalSupport?: string | null;
  gpsAltitude?: Prisma.Decimal | number | string | null;
  gpsAccuracy?: Prisma.Decimal | number | string | null;
}

/** A crop relation row, or an already-mapped crop name. */
export interface SerializableCropLink {
  crop?: { name: string } | null;
}

/**
 * Project a raw Actor onto the LIST set (design.md §6, FR-9) — the shape
 * `GET /api/v1/actors` returns, and therefore the only shape the map,
 * dashboard, and CSV can ever be built from.
 *
 * Built by explicit field PICK — no member of the contact block, and no
 * never-public field, can appear because they are simply never written into
 * the output. `gps` is delegated to {@link publicGps}, which gates on
 * consent (FR-1/DD-3).
 */
export function toPublicListItem(
  actor: SerializableActor,
): PublicActorListItem {
  return {
    id: actor.id,
    traderName: actor.traderName,
    region: actor.region,
    district: actor.district ?? null,
    traderType: actor.traderType,
    capacityTons: toNullableNumber(actor.capacityTons),
    crops: mapCrops(actor.crops),
    gps: publicGps(actor),
    sex: actor.sex ?? null,
    otherCrops: actor.otherCrops ?? null,
  };
}

/**
 * Project a raw Actor onto the PUBLISHED set (design.md §6, FR-1) — the
 * shape `GET /api/v1/actors/:id` returns for a `GRANTED` actor: the list set
 * plus the contact block.
 *
 * Composes {@link toPublicListItem}'s already-computed fields by NAME —
 * never by spread (DD-9/§7.2) — so this stays its own explicit literal pick
 * rather than "one pick plus a delete". Naming every field also makes the
 * two projections self-checking: if {@link PublicActorDetail} ever gains a
 * field this object literal does not list, the function fails to compile,
 * so the two shapes cannot drift apart silently.
 */
export function toPublicDetail(actor: SerializableActor): PublicActorDetail {
  const listItem = toPublicListItem(actor);
  return {
    id: listItem.id,
    traderName: listItem.traderName,
    region: listItem.region,
    district: listItem.district,
    traderType: listItem.traderType,
    capacityTons: listItem.capacityTons,
    crops: listItem.crops,
    gps: listItem.gps,
    sex: listItem.sex,
    otherCrops: listItem.otherCrops,
    contactPerson: actor.contactPerson ?? null,
    position: actor.position ?? null,
    phone: actor.phone ?? null,
    email: actor.email ?? null,
    marketLocation: actor.marketLocation ?? null,
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
