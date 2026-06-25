/**
 * pillars.ts — static "how it works" pillar content for the ACCELERATE Tanzania Seed Registry.
 * T-1 (FR-12, FR-5, copy brief §4.3).
 *
 * The three demand-led pillars underpin the ACCELERATE approach and appear in
 * two places: the home HowItWorks section (§2.4) and the About page Approach
 * section (§3.3). Components map over PILLARS rather than hardcoding markup.
 *
 * Copy strings match the approved copy brief exactly — do not paraphrase.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Pillar {
  /** Short display title (rendered as a card heading). */
  title: string;
  /** One-sentence body explaining the pillar (copy brief §4.3). */
  body: string;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * Three demand-led pillars for the ACCELERATE approach.
 * Order matches copy brief §4.3: Information flow → Marketplace traders → Institutional buyers.
 */
export const PILLARS: Pillar[] = [
  {
    title: 'Information flow',
    body: 'Better information to and from large traders, grain producers, and seed producers builds real demand for quality seed.',
  },
  {
    title: 'Marketplace traders',
    body: 'Engaging the traders who buy and sell grain every day turns the marketplace into an engine for adoption.',
  },
  {
    title: 'Institutional buyers',
    body: 'When institutional buyers know about — and can access — improved varieties, turnover speeds up and farmer incomes and nutrition rise.',
  },
];
