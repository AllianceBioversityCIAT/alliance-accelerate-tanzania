/**
 * Role legend map — design.md §7, §8 (Crop Legend / Actor Type legend).
 *
 * Maps each traderType to a human-readable label and a Tailwind color token
 * (from tailwind.config / design.md §7). NO hardcoded hex values — all
 * colorToken strings are Tailwind utility keys defined in tailwind.config.ts.
 *
 * colorToken is the base token name; callers compose it into a class:
 *   `bg-${role.colorToken}` or `text-${role.colorToken}`
 * e.g. "bg-primary", "bg-success", "bg-accent", "bg-crop-sorghum", etc.
 */

import type { PublicActor } from '../api/actors';

export type TraderType = PublicActor['traderType'];

export interface RoleMeta {
  /** Human-readable display label. */
  label: string;
  /**
   * Tailwind color token (no 'bg-'/'text-' prefix).
   * Defined in tailwind.config.ts + design.md §7 — never a raw hex string.
   *
   * Token mapping rationale (design.md §7):
   *   seed_company       → primary        (maroon — primary brand, lead actor)
   *   cooperative        → success        (green — community/growth)
   *   ngo                → accent         (blue — external/support)
   *   offtaker           → crop-sorghum   (amber — commercial grain purchaser)
   *   research_institute → muted          (grey — knowledge/neutral)
   *   informal_trader    → bean           (brown — smallholder market actor)
   */
  colorToken: string;
}

export const ROLES: Record<TraderType, RoleMeta> = {
  seed_company:       { label: 'Seed Company',       colorToken: 'primary' },
  cooperative:        { label: 'Cooperative',         colorToken: 'success' },
  ngo:                { label: 'NGO',                 colorToken: 'accent' },
  offtaker:           { label: 'Offtaker',            colorToken: 'crop-sorghum' },
  research_institute: { label: 'Research Institute',  colorToken: 'muted' },
  informal_trader:    { label: 'Informal Trader',     colorToken: 'bean' },
};

/**
 * Returns the human-readable label for a traderType.
 * Falls back to the raw type string if not found (future-proofing).
 */
export function roleLabel(type: TraderType): string {
  return ROLES[type]?.label ?? type;
}

/**
 * Returns the Tailwind color token for a traderType.
 * Falls back to 'muted' if not found.
 */
export function roleColorToken(type: TraderType): string {
  return ROLES[type]?.colorToken ?? 'muted';
}
