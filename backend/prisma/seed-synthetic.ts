/**
 * seed-synthetic.ts — DE-IDENTIFIED synthetic dataset for TESTING the map at
 * realistic scale (infra/aws-deployment dev environment).
 *
 * ⚠️ Contains NO real data. It mirrors only the AGGREGATE shape of the Partner
 * Profile file (region frequencies, trader-type split, capacity quartiles,
 * ~436 rows) — derived locally, never committed — and pairs it with PUBLIC
 * region coordinates. Every identity is synthetic, GPS is generated near public
 * region centroids with jitter (no real point), and NO PII is written
 * (phone/email/sex/position/marketLocation are left null). All actors are
 * consentStatus=GRANTED so they populate the public map for testing.
 *
 * Deterministic (seeded RNG) → re-runs converge. Idempotent: clears Actor rows
 * (keeps the 3 Crop rows) then inserts the synthetic set.
 *
 * Run via infra/scripts/load-synthetic.sh (composes DATABASE_URL from the secret).
 */
import { ConsentStatus, Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Deterministic RNG (mulberry32) ───────────────────────────────────────────
let _s = 0x9e3779b9;
function rng(): number {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(a: T[]): T => a[Math.floor(rng() * a.length)];
function gauss(mean: number, sd: number): number {
  const u = Math.max(rng(), 1e-9), v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Aggregate profile (counts from the real file; coords are PUBLIC geography) ─
const REGIONS = [
  { name: 'Mbeya',          weight: 70, lat: -8.91, lon: 33.46 },
  { name: 'Kagera',         weight: 56, lat: -1.33, lon: 31.81 },
  { name: 'Dodoma',         weight: 47, lat: -6.17, lon: 35.74 },
  { name: 'Arusha',         weight: 45, lat: -3.39, lon: 36.68 },
  { name: 'Mwanza',         weight: 44, lat: -2.52, lon: 32.90 },
  { name: 'Dar es Salaam',  weight: 38, lat: -6.82, lon: 39.27 },
  { name: 'Kigoma',         weight: 38, lat: -4.88, lon: 29.63 },
  { name: 'Manyara',        weight: 34, lat: -4.22, lon: 35.75 },
  { name: 'Rukwa',          weight: 31, lat: -7.97, lon: 31.62 },
  { name: 'Songwe',         weight: 30, lat: -9.10, lon: 32.93 },
];
const TOTAL = 436;

// 6-type legend with realistic weights: the 2 real types dominate (~59/41 of the
// source), the other 4 are sprinkled in so every legend colour is exercised.
const TRADER_TYPES: [string, number][] = [
  ['informal_trader', 0.50],
  ['offtaker', 0.32],
  ['cooperative', 0.07],
  ['seed_company', 0.045],
  ['ngo', 0.04],
  ['research_institute', 0.025],
];
function weightedType(): string {
  let r = rng();
  for (const [t, w] of TRADER_TYPES) { if ((r -= w) <= 0) return t; }
  return 'informal_trader';
}

const CROPS = ['sorghum', 'common_bean', 'groundnut'];

// Synthetic name parts (no real identities).
const GEO = ['Highlands', 'Valley', 'Lakeside', 'Plateau', 'Sunrise', 'Greenbelt', 'Riverside', 'Savannah', 'Summit', 'Acacia'];
const CROPWORD = ['Sorghum', 'Bean', 'Groundnut', 'Grain', 'Cereal', 'Harvest', 'Agro', 'Seed'];
const SUFFIX = ['Cooperative', 'Traders', 'Aggregators', 'Agro-Dealers', 'Seed Co.', 'Growers Union', 'Enterprises Ltd', 'Produce Ltd'];

// Capacity ~ lognormal matching the source quartiles (p25 2.7 / p50 16.8 / p75 125),
// clamped to drop the extreme tail so the test set stays sensible.
function capacity(): number {
  const v = Math.exp(gauss(Math.log(16.8), 1.35));
  return Math.round(Math.min(Math.max(v, 0.1), 5000) * 100) / 100;
}

function jitterCoord(base: number, sd = 0.25): number {
  return Math.round((base + gauss(0, sd)) * 1e6) / 1e6;
}

async function main(): Promise<void> {
  // Crops (idempotent).
  const cropId = new Map<string, string>();
  for (const name of CROPS) {
    const c = await prisma.crop.upsert({ where: { name }, update: {}, create: { name } });
    cropId.set(name, c.id);
  }

  // Replace actors (keep crops). Cascade removes the join rows.
  await prisma.actor.deleteMany({});

  // Expand regions by weight into a sampling pool.
  const pool: typeof REGIONS = [];
  for (const r of REGIONS) for (let i = 0; i < r.weight; i++) pool.push(r);

  let made = 0;
  for (let i = 0; i < TOTAL; i++) {
    const r = pool[i % pool.length];
    const traderType = weightedType();
    const nCrops = 1 + Math.floor(rng() * 3);
    const crops = [...CROPS].sort(() => rng() - 0.5).slice(0, nCrops);
    const name = `${r.name} ${pick(GEO)} ${pick(CROPWORD)} ${pick(SUFFIX)}`;
    const idNum = String(1000 + i);

    const actor = await prisma.actor.create({
      data: {
        traderId: `SYN-${idNum}`,
        traderName: name,
        region: r.name,
        district: `${r.name} ${pick(['Urban', 'Rural', 'District'])}`,
        traderType,
        capacityTons: new Prisma.Decimal(capacity()),
        gpsLatitude: new Prisma.Decimal(jitterCoord(r.lat)),
        gpsLongitude: new Prisma.Decimal(jitterCoord(r.lon)),
        // NO PII: phone/email/sex/position/marketLocation left null.
        consentStatus: ConsentStatus.GRANTED,
      } as Prisma.ActorUncheckedCreateInput,
    });
    await prisma.cropsOnActors.createMany({
      data: crops.map((s) => ({ actorId: actor.id, cropId: cropId.get(s)! })),
    });
    made++;
  }

  const total = await prisma.actor.count();
  const granted = await prisma.actor.count({ where: { consentStatus: ConsentStatus.GRANTED } });
  console.log(`Synthetic seed complete: ${made} created · ${total} actors (${granted} GRANTED) · ${CROPS.length} crops · no PII.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
