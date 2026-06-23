/**
 * T-7 — Reproducible seed runner (FR-8, DD-4).
 *
 * Writes the pure {@link SEED_ACTORS} dataset (see `seed-data.ts`) into MySQL:
 *   1. upserts the three `Crop` rows (slugs matching the frontend),
 *   2. upserts each sample `Actor` on its unique `traderId` (idempotent — safe
 *      to re-run; reproducible because the dataset is deterministic),
 *   3. re-links each actor's crops through the `CropsOnActors` join.
 *
 * Wiring: invoked by `prisma db seed` (configured in package.json). It needs a
 * reachable `DATABASE_URL`; in this environment there is none (docker down,
 * :3306 closed), so the LIVE run is a deferred step — the data SHAPE is proven
 * DB-independently by `src/prisma/seed-data.spec.ts`.
 *
 * Design refs: design.md §4 (`prisma/seed.ts`), §10 (DD-4).
 */

import { ConsentStatus, Prisma, PrismaClient } from '@prisma/client';

import {
  SEED_ACTORS,
  SEED_CROP_SLUGS,
  type SeedActor,
} from './seed-data';

const prisma = new PrismaClient();

/** Upsert the three tracked crops; returns slug → crop id. */
async function upsertCrops(): Promise<Map<string, string>> {
  const bySlug = new Map<string, string>();
  for (const name of SEED_CROP_SLUGS) {
    const crop = await prisma.crop.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    bySlug.set(name, crop.id);
  }
  return bySlug;
}

/** Upsert one actor on its unique `traderId`, then (re)link its crops. */
async function upsertActor(
  actor: SeedActor,
  cropIdBySlug: Map<string, string>,
): Promise<void> {
  const data: Prisma.ActorUncheckedCreateInput = {
    traderId: actor.traderId,
    traderName: actor.traderName,
    region: actor.region,
    district: actor.district,
    traderType: actor.traderType,
    capacityTons: new Prisma.Decimal(actor.capacityTons),
    gpsLatitude: new Prisma.Decimal(actor.gpsLatitude),
    gpsLongitude: new Prisma.Decimal(actor.gpsLongitude),
    phone: actor.phone,
    email: actor.email,
    consentStatus: actor.consentStatus as ConsentStatus,
  };

  const saved = await prisma.actor.upsert({
    where: { traderId: actor.traderId },
    update: data,
    create: data,
  });

  // Reset + recreate the crop links so a re-run converges to the dataset.
  await prisma.cropsOnActors.deleteMany({ where: { actorId: saved.id } });
  await prisma.cropsOnActors.createMany({
    data: actor.crops.map((slug) => ({
      actorId: saved.id,
      cropId: cropIdBySlug.get(slug)!,
    })),
  });
}

async function main(): Promise<void> {
  const cropIdBySlug = await upsertCrops();
  for (const actor of SEED_ACTORS) {
    await upsertActor(actor, cropIdBySlug);
  }

  const granted = SEED_ACTORS.filter(
    (a) => a.consentStatus === 'GRANTED',
  ).length;
  // eslint-disable-next-line no-console
  console.log(
    `Seed complete: ${SEED_CROP_SLUGS.length} crops, ${SEED_ACTORS.length} actors (${granted} GRANTED).`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
