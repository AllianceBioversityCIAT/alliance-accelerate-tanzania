/**
 * Unit tests for lib/text/fold-search.ts
 *
 * Traces FR-1 (enhancement/searchable-region-select) — both scenarios'
 * matching clauses — and design.md §5.4.
 *
 * Every expected value is drawn directly from FR-1's scenarios and the real
 * `REGIONS` strings in lib/content/regions.ts (Kaskazini/Kusini Pemba,
 * Kusini Unguja) — this file has no knowledge of regions itself, it just
 * reuses those literal strings as realistic candidates.
 */

import { matchesQuery } from './fold-search';

// ── Substring, not prefix (FR-1: "Pemba MUST surface both Kaskazini Pemba
//    and Kusini Pemba" — a mid-string match, disqualifying a prefix-only
//    implementation) ──────────────────────────────────────────────────────

describe('matchesQuery — substring, not prefix', () => {
  it('matches a query that occurs mid-string, not just as a prefix', () => {
    expect(matchesQuery('Kaskazini Pemba', 'Pemba')).toBe(true);
    expect(matchesQuery('Kusini Pemba', 'Pemba')).toBe(true);
  });

  it('does not match when the query does not occur anywhere in the candidate', () => {
    expect(matchesQuery('Dodoma', 'Pemba')).toBe(false);
  });
});

// ── Case-insensitivity (FR-1: "kus" matches "Kusini Unguja") ───────────────

describe('matchesQuery — case-insensitivity', () => {
  it('matches regardless of the case of the query or the candidate', () => {
    expect(matchesQuery('Kusini Unguja', 'kus')).toBe(true);
    expect(matchesQuery('KUSINI UNGUJA', 'kus')).toBe(true);
    expect(matchesQuery('kusini unguja', 'KUS')).toBe(true);
  });
});

// ── Diacritic folding ───────────────────────────────────────────────────────

describe('matchesQuery — diacritic folding', () => {
  it('matches an unaccented candidate against a query typed with combining marks', () => {
    // 'Kúsíní' — the same letters as 'Kusini' with combining acute accents
    // (U+0301) inserted after each vowel, decomposed (NFD) form.
    const accentedQuery = 'Kúsíní';
    expect(matchesQuery('Kusini Unguja', accentedQuery)).toBe(true);
  });
});

// ── Leading/trailing whitespace ignored ─────────────────────────────────────

describe('matchesQuery — whitespace trimming', () => {
  it('ignores leading and trailing whitespace in the query', () => {
    expect(matchesQuery('Kusini Unguja', '  kus  ')).toBe(true);
    expect(matchesQuery('Kusini Unguja', '\tkus\n')).toBe(true);
  });
});

// ── Empty query returns all inputs ──────────────────────────────────────────

describe('matchesQuery — empty query', () => {
  it('matches every candidate when the query is empty', () => {
    expect(matchesQuery('Dodoma', '')).toBe(true);
    expect(matchesQuery('Kaskazini Pemba', '')).toBe(true);
    expect(matchesQuery('Kusini Unguja', '')).toBe(true);
  });

  it('matches every candidate when the query is whitespace-only', () => {
    expect(matchesQuery('Dodoma', '   ')).toBe(true);
  });
});
