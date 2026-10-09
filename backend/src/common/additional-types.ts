import { TRADER_TYPES } from './normalize';

/** Row shape of the `ActorAdditionalType` relation as the serializers read it. */
export interface AdditionalTypeLink {
  traderType: string;
}

/** Sort + dedupe type codes into TRADER_TYPES order; unknown codes are dropped. */
export function sortTraderTypes(values: readonly string[] | null | undefined): string[] {
  if (!values || values.length === 0) return [];
  const set = new Set(values);
  return TRADER_TYPES.filter((t) => set.has(t));
}

/** Relation rows → wire `additionalTraderTypes` (always an array). */
export function mapAdditionalTypes(
  links: readonly AdditionalTypeLink[] | null | undefined,
): string[] {
  return sortTraderTypes(links?.map((l) => l.traderType));
}
