/**
 * Generates the country/region allowlist shared by the backend and the
 * frontend: the 54 African UN member states, each with its ISO 3166-2
 * subdivisions.
 *
 *   curl -sSfLO https://salsa.debian.org/iso-codes-team/iso-codes/-/raw/v4.20.1/data/iso_3166-2.json
 *   curl -sSfLO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson
 *   npx ts-node scripts/generate-african-geo.ts iso_3166-2.json ne_50m_admin_0_countries.geojson
 *
 * Rules:
 * - Regions are ISO 3166-2's first level, except where that level is only a
 *   grouping of the real administrative units (CHILD_LEVEL), where the level
 *   below is used instead, e.g. Uganda's districts rather than its 4 regions.
 * - Tanzania keeps CANONICAL_REGIONS, the list every stored actor already uses.
 * - ISO annotations such as "(EH-partial)" are dropped from names.
 * - Bounds frame a country on the maps: Natural Earth's outline, ignoring
 *   islands under 2% of the country's largest landmass (South Africa's
 *   Prince Edward Islands), with Somaliland counted as Somalia, as in ISO.
 *
 * Writes the same file to backend/src/common/geo and frontend/lib/content;
 * countries.spec.ts fails if the two copies differ.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CANONICAL_REGIONS } from '../src/common/normalize';

const ISO_CODES_VERSION = 'v4.20.1';

/** code → [display name, E.164 calling code]. */
const COUNTRIES: Record<string, [string, string]> = {
  DZ: ['Algeria', '213'],
  AO: ['Angola', '244'],
  BJ: ['Benin', '229'],
  BW: ['Botswana', '267'],
  BF: ['Burkina Faso', '226'],
  BI: ['Burundi', '257'],
  CV: ['Cabo Verde', '238'],
  CM: ['Cameroon', '237'],
  CF: ['Central African Republic', '236'],
  TD: ['Chad', '235'],
  KM: ['Comoros', '269'],
  CG: ['Congo', '242'],
  CD: ['Democratic Republic of the Congo', '243'],
  CI: ["Côte d'Ivoire", '225'],
  DJ: ['Djibouti', '253'],
  EG: ['Egypt', '20'],
  GQ: ['Equatorial Guinea', '240'],
  ER: ['Eritrea', '291'],
  SZ: ['Eswatini', '268'],
  ET: ['Ethiopia', '251'],
  GA: ['Gabon', '241'],
  GM: ['Gambia', '220'],
  GH: ['Ghana', '233'],
  GN: ['Guinea', '224'],
  GW: ['Guinea-Bissau', '245'],
  KE: ['Kenya', '254'],
  LS: ['Lesotho', '266'],
  LR: ['Liberia', '231'],
  LY: ['Libya', '218'],
  MG: ['Madagascar', '261'],
  MW: ['Malawi', '265'],
  ML: ['Mali', '223'],
  MR: ['Mauritania', '222'],
  MU: ['Mauritius', '230'],
  MA: ['Morocco', '212'],
  MZ: ['Mozambique', '258'],
  NA: ['Namibia', '264'],
  NE: ['Niger', '227'],
  NG: ['Nigeria', '234'],
  RW: ['Rwanda', '250'],
  ST: ['São Tomé and Príncipe', '239'],
  SN: ['Senegal', '221'],
  SC: ['Seychelles', '248'],
  SL: ['Sierra Leone', '232'],
  SO: ['Somalia', '252'],
  ZA: ['South Africa', '27'],
  SS: ['South Sudan', '211'],
  SD: ['Sudan', '249'],
  TZ: ['Tanzania', '255'],
  TG: ['Togo', '228'],
  TN: ['Tunisia', '216'],
  UG: ['Uganda', '256'],
  ZM: ['Zambia', '260'],
  ZW: ['Zimbabwe', '263'],
};

/** Countries whose ISO first level only groups the units people actually use. */
const CHILD_LEVEL = new Set(['CV', 'GQ', 'GW', 'MW', 'UG']);

interface IsoSubdivision {
  code: string;
  name: string;
  type: string;
  parent?: string;
}

function regionsFor(code: string, all: IsoSubdivision[]): string[] {
  if (code === 'TZ') return [...CANONICAL_REGIONS];
  const own = all.filter((s) => s.code.startsWith(`${code}-`));
  const top = own.filter((s) => !s.parent);
  const picked = CHILD_LEVEL.has(code)
    ? [
        ...own.filter((s) => s.parent),
        // A top-level unit with nothing under it (Guinea-Bissau's Bissau) is
        // itself a unit, not a grouping.
        ...top.filter((t) => !own.some((s) => s.parent === t.code)),
      ]
    : top;
  return picked.map((s) => s.name.replace(/\s*\((EH|EH-partial)\)$/, '').trim());
}

type Ring = [number, number][];
interface NeFeature {
  properties: { ADMIN: string; ISO_A2_EH: string };
  geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}

/** Shoelace area in square degrees; only compared within one country. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

/** `[[south, west], [north, east]]` per country code. */
function boundsByCountry(features: NeFeature[]): Map<string, [[number, number], [number, number]]> {
  const outlines = new Map<string, Ring[]>();
  for (const f of features) {
    const code = f.properties.ADMIN === 'Somaliland' ? 'SO' : f.properties.ISO_A2_EH;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    outlines.set(code, [...(outlines.get(code) ?? []), ...polys.map((p) => p[0])]);
  }
  const out = new Map<string, [[number, number], [number, number]]>();
  for (const [code, rings] of outlines) {
    const largest = Math.max(...rings.map(ringArea));
    const points = rings.filter((r) => ringArea(r) >= largest * 0.02).flat();
    const round = (n: number) => Math.round(n * 100) / 100;
    out.set(code, [
      [round(Math.min(...points.map((p) => p[1]))), round(Math.min(...points.map((p) => p[0])))],
      [round(Math.max(...points.map((p) => p[1]))), round(Math.max(...points.map((p) => p[0])))],
    ]);
  }
  return out;
}

function render(countries: object[]): string {
  return `// GENERATED by backend/scripts/generate-african-geo.ts from ISO 3166-2
// (Debian iso-codes ${ISO_CODES_VERSION}). Do not edit by hand: rerun the script.
// The backend and frontend copies must stay byte-identical.

export interface AfricanCountry {
  /** ISO 3166-1 alpha-2, the value stored in \`country\`. */
  readonly code: string;
  readonly name: string;
  /** E.164 country calling code, without the "+". */
  readonly callingCode: string;
  readonly regions: readonly string[];
  /** Map frame, \`[[south, west], [north, east]]\` (Natural Earth, mainland-weighted). */
  readonly bounds: readonly [readonly [number, number], readonly [number, number]];
}

export const AFRICAN_COUNTRIES: readonly AfricanCountry[] = ${JSON.stringify(countries, null, 2)};
`;
}

function main(): void {
  const [src, outlinesSrc] = process.argv.slice(2);
  if (!src || !outlinesSrc) {
    throw new Error('usage: generate-african-geo.ts <iso_3166-2.json> <ne_50m_admin_0_countries.geojson>');
  }
  const all = (JSON.parse(readFileSync(src, 'utf8')) as { '3166-2': IsoSubdivision[] })['3166-2'];
  const bounds = boundsByCountry(
    (JSON.parse(readFileSync(outlinesSrc, 'utf8')) as { features: NeFeature[] }).features,
  );

  const countries = Object.entries(COUNTRIES)
    .map(([code, [name, callingCode]]) => {
      const regions = [...new Set(regionsFor(code, all))].sort((a, b) => a.localeCompare(b, 'en'));
      if (regions.length === 0) throw new Error(`${code}: no subdivisions in the source`);
      const frame = bounds.get(code);
      if (!frame) throw new Error(`${code}: no outline in the source`);
      return { code, name, callingCode, regions, bounds: frame };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const out = render(countries);
  const root = join(__dirname, '..', '..');
  for (const target of [
    'backend/src/common/geo/african-countries.generated.ts',
    'frontend/lib/content/african-countries.generated.ts',
  ]) {
    writeFileSync(join(root, target), out);
    console.log(`wrote ${target}`);
  }
  console.log(`${countries.length} countries, ${countries.reduce((n, c) => n + c.regions.length, 0)} regions`);
}

main();
