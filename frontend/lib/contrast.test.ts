// @akili-spec docs/specs/enhancement/app-visual-refresh
/**
 * contrast.test.ts
 *
 * The contrast harness (T-1). Ships BEFORE the token fix (T-2/T-3) and
 * must stay green in both states — the red -> green transition on the
 * three FR-2 pairs happens inside the *values*, not inside this suite.
 *
 * The token map under test is parsed from the live `:root` block of
 * `frontend/app/globals.css` at test time (see `parseRootTokens` below),
 * never hardcoded. FR-6 requires an "explicit equality assertion" that
 * "MUST NOT be claimed on the basis of the diff alone" — a test that
 * hardcodes a copy of the palette and asserts the copy equals itself is
 * tautological (tdd skill anti-pattern list) and would keep passing after
 * `globals.css` drifted. Only the FROZEN literal constants below are
 * hardcoded; the values they are compared against are always re-read from
 * source.
 *
 * Limitation (DD-7, stated per KZ-002 — a test must record what it cannot
 * prove): this suite covers only the ink x ground pairs enumerated below.
 * It cannot discover a pair a component invents outside this matrix. That
 * gap is closed by the rendered-evidence task (design.md §5.4), not by
 * this file.
 *
 * Second limitation, load-bearing for the reachability gate (`REACHABLE`
 * below, and `UI_REACHABLE` in the large-text/UI-only block): reachability
 * is established by a static `grep -rn` sweep over `app/` + `components/`
 * for literal `text-<ink>` / `bg-<ground>` class strings. It cannot see a
 * ground or ink composed at runtime from a variable (e.g. a conditional
 * `className` built by string interpolation rather than a static literal).
 * Every site this sweep found uses a static class literal — which is also
 * what `frontend/CLAUDE.md`'s Tailwind content-scan requires for purge
 * safety — but a future component that breaks that convention could
 * introduce a pair neither this grep sweep nor the gate below would catch.
 * That residual gap is the same one DD-7 already accepts and the
 * rendered-evidence task mitigates; this sweep does not close it, only
 * narrows what "reachable" means today to what is actually evidenced.
 *
 * Traces: NFR-1, FR-2 (known-failure ledger), FR-6 (frozen-token
 * equality), design.md DD-7, design.md §10 "The known-failure ledger",
 * design.md R-5 (mitigated by the UNREACHABLE promotion-rule blocks).
 */

import fs from 'fs';
import path from 'path';
import { contrastRatio, compositeOver, parseColor } from './contrast';

const GLOBALS_CSS_PATH = path.join(__dirname, '../app/globals.css');

/**
 * Parses the `:root { ... }` block of globals.css into a `--token -> value`
 * map. Brace-counted (not a fixed-line regex) so a future nested rule
 * inside `:root` (there is none today) would not silently truncate the
 * parse.
 */
function parseRootTokens(css: string): Map<string, string> {
  const rootIndex = css.indexOf(':root');
  if (rootIndex === -1) {
    throw new Error('parseRootTokens: no ":root" block found in globals.css');
  }
  const braceStart = css.indexOf('{', rootIndex);
  if (braceStart === -1) {
    throw new Error('parseRootTokens: ":root" has no opening brace');
  }

  let depth = 0;
  let braceEnd = -1;
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }
  if (braceEnd === -1) {
    throw new Error('parseRootTokens: unterminated ":root" block');
  }

  const body = css.slice(braceStart + 1, braceEnd);
  const tokens = new Map<string, string>();
  const DECL_RE = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = DECL_RE.exec(body)) !== null) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

const rawCss = fs.readFileSync(GLOBALS_CSS_PATH, 'utf-8');
const TOKENS = parseRootTokens(rawCss);

/**
 * Looks up a token by name, failing loudly when the matrix names one
 * globals.css does not declare. A missing token must never be silently
 * skipped — a skipped pair is an incomplete matrix, and this spec's
 * disqualifier rejects a green run over an incomplete matrix as evidence.
 */
function token(name: string): string {
  const value = TOKENS.get(name);
  if (value === undefined) {
    throw new Error(
      `Matrix references undefined token "${name}" — globals.css declares no such token.`,
    );
  }
  return value;
}

// ── Direct seam tests: the pure functions, on known-good literal values ────
// Independent of globals.css and of each other — expected values are WCAG
// reference facts or hand-computed arithmetic, not the code re-deriving
// its own answer (tdd anti-tautological rule).

describe('parseColor', () => {
  it('parses #RRGGBB hex', () => {
    expect(parseColor('#C9821B')).toEqual({ r: 201, g: 130, b: 27 });
  });

  it('parses rgba(r, g, b, a), ignoring alpha', () => {
    expect(parseColor('rgba(51, 51, 51, 0.40)')).toEqual({ r: 51, g: 51, b: 51 });
  });

  it('parses rgb(r, g, b) with no alpha channel', () => {
    expect(parseColor('rgb(51, 51, 51)')).toEqual({ r: 51, g: 51, b: 51 });
  });

  it('throws on an unrecognised colour format', () => {
    expect(() => parseColor('hsl(24, 76%, 45%)')).toThrow(/unrecognised colour format/);
  });
});

describe('contrastRatio — WCAG reference values', () => {
  it('black on white is 21:1, the WCAG-defined maximum', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('white on white is 1:1 (no contrast)', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('is order-independent (swapping fg/bg yields the same ratio)', () => {
    expect(contrastRatio('#333333', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#333333'),
      10,
    );
  });

  it('an opaque rgba() colour matches its hex equivalent', () => {
    expect(contrastRatio('rgba(51, 51, 51, 1)', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#333333', '#FFFFFF'),
      10,
    );
  });
});

describe('compositeOver — alpha compositing', () => {
  it('alpha 0 returns the ground colour unchanged', () => {
    expect(compositeOver('#C9821B', '#FFFFFF', 0)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('alpha 1 returns the foreground colour unchanged', () => {
    expect(compositeOver('#C9821B', '#FFFFFF', 1)).toEqual({ r: 201, g: 130, b: 27 });
  });

  it('alpha 0.5 is the arithmetic midpoint of fg and bg channels', () => {
    expect(compositeOver('#000000', '#FFFFFF', 0.5)).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
  });
});

describe('token() — matrix loudness guard (KZ-002)', () => {
  it('throws rather than silently skipping an undefined token', () => {
    expect(() => token('--color-does-not-exist')).toThrow(/undefined token/);
  });
});

// ── The token matrix (NFR-1, FR-2) ──────────────────────────────────────────

const SURFACE = token('--color-surface');

/** 7 semantic inks named by NFR-1's 4.5:1 clause. */
const INKS: Record<string, string> = {
  fg: token('--color-fg'),
  muted: token('--color-muted'),
  primary: token('--color-primary'),
  'primary-hover': token('--color-primary-hover'),
  success: token('--color-success'),
  warning: token('--color-warning'),
  danger: token('--color-danger'),
};

/**
 * 9 grounds named by NFR-1. `highlight/20` and `warning/10` are Tailwind
 * alpha-modifier chips, not tokens — they are composited over
 * `--color-surface`, the ground both offending chips actually render on:
 * ImportPreviewTable's warning badge (`ImportPreviewTable.tsx:98`, a
 * `bg-warning/10` chip inside a `bg-surface` table/card) and UsersTable's
 * enabled pill (`UsersTable.tsx:282`, `:377`, `bg-highlight/20` inside a
 * `bg-surface` card/tbody). Compositing against a bare `#FFFFFF` literal
 * instead would understate exactly the failure FR-2 names (2.83:1 hides
 * behind a passing number if checked against the wrong ground).
 */
const GROUNDS: Record<string, string | ReturnType<typeof compositeOver>> = {
  bg: token('--color-bg'),
  surface: SURFACE,
  'surface-alt': token('--color-surface-alt'),
  restricted: token('--color-restricted-bg'),
  'highlight-tint': token('--color-highlight-tint'),
  'highlight/20': compositeOver(token('--color-highlight'), SURFACE, 0.2),
  'warning/10': compositeOver(token('--color-warning'), SURFACE, 0.1),
  'danger-soft': token('--color-danger-soft'),
  'primary-soft': token('--color-primary-soft'),
};

interface KnownFailure {
  ink: string;
  ground: string;
  /** Measured ratio from FR-2, docs/specs/enhancement/app-visual-refresh/requirements.md. */
  measuredRatio: number;
}

/**
 * Historically seeded (T-1) with the FR-2 shipped failing pairs plus two
 * defensively-gated `warning` entries — see design.md §10, "The known-failure
 * ledger". T-3 remediates `--color-warning` and `--color-success` (design.md
 * §5.1 Group C) in the same change that empties this array, so the ledger's
 * job — proving a red→green transition without ever leaving the suite red —
 * is discharged here. Both assertions in the matrix loop below collapse into
 * one, exactly as design.md §10 predicted: "At T-3 the ledger empties and
 * both assertions collapse into one."
 *
 * Left as a typed, empty array (not deleted) so a future regression has
 * somewhere to go without re-deriving this scaffolding.
 */
const KNOWN_FAILURES: KnownFailure[] = [];

function findKnownFailure(ink: string, ground: string): KnownFailure | undefined {
  return KNOWN_FAILURES.find((f) => f.ink === ink && f.ground === ground);
}

/**
 * REACHABLE — the gate. NFR-1 says every ink meets threshold "against every
 * surface it can land on": a per-ink reachability qualifier, not a blind
 * cross product of the 7-ink x 9-ground lists. Only the ground names below
 * are asserted against threshold for a given ink; every other combination
 * in the full cross product is real (computed) but UNASSERTED — see the
 * "UNREACHABLE pairs" block after the matrix test, which records why and
 * how to promote one.
 *
 * Each entry is evidenced by a `grep -rn` sweep over `app/` + `components/`
 * (excluding `*.test.tsx`) for the `text-<ink>` utility and the `bg-*`
 * class(es) it actually co-occurs with, citing `file:line`. A reachability
 * claim without a citation is the same unfalsifiable move KZ-002 names for
 * a presence assertion — so every grounds[] entry below traces to a real
 * render site, EXCEPT the two marked "T-3 minimum, no current site":
 * `warning`→`bg` and `success`→`restricted` are gated defensively because
 * T-3's scope line names them as the minimum ground set for the two FR-2
 * inks, even though no component renders that exact pair today.
 *
 * Limitation this citation method inherits (belongs beside the DD-7 note
 * at the top of this file): a static grep over class-name strings cannot
 * see a ground composed at runtime from a variable (e.g. a conditional
 * `className` built with template interpolation rather than a literal
 * `bg-*` string). Every site cited below uses a static, purge-safe class
 * literal, which is also what `frontend/CLAUDE.md`'s Tailwind content scan
 * requires — but a future component that breaks that convention could
 * introduce an unreachable pair this grep sweep would not catch.
 */
const REACHABLE: Record<string, { grounds: string[]; citedAt: string }> = {
  fg: {
    grounds: ['bg', 'surface', 'surface-alt', 'restricted', 'warning/10'],
    citedAt:
      'globals.css:93-96 (body { background-color: var(--color-bg); color: var(--color-fg); } — sitewide default) · ' +
      'ui/Button.tsx:49 (secondary variant: "bg-surface text-fg") · ' +
      'shell/Header.tsx:159 (text-fg, hover:bg-surface-alt) · ' +
      'ui/Button.tsx:49,51 (secondary: text-fg, hover:bg-restricted) + profile/RestrictedContactPanel.tsx:61 (text-fg inside bg-restricted) · ' +
      'admin/CredentialHandoff.tsx:106 ("bg-warning/10 ... text-fg")',
  },
  muted: {
    grounds: ['bg', 'surface', 'surface-alt', 'restricted'],
    citedAt:
      '(public)/about/page.tsx:322 (text-muted directly inside the bg-bg section opened at :58) · ' +
      'shell/Header.tsx:41,48 (user-menu dropdown bg-surface, "Signed in ·" text-muted) · ' +
      'admin/UsersTable.tsx:333,347 (thead bg-surface-alt, th text-muted) · ' +
      'profile/RestrictedContactPanel.tsx:67,73 (text-muted inside bg-restricted)',
  },
  primary: {
    grounds: ['surface', 'primary-soft'],
    citedAt:
      'home/Hero.tsx:60,66 (LiveRegistryCard: bg-surface / text-primary) · ' +
      'shell/Header.tsx:302,102 (sticky bg-surface header / text-primary nav button) · ' +
      'admin/UsersTable.tsx:123, home/Hero.tsx:191, home/HowItWorks.tsx:53 (bg-primary-soft text-primary, representative of many sites)',
  },
  'primary-hover': {
    grounds: ['surface'],
    citedAt:
      '(public)/about/page.tsx:485 (text-primary, hover:text-primary-hover, inside a bg-surface case-study card) · ' +
      'auth/LoginForm.tsx:189,281 (bg-surface auth card, hover:text-primary-hover)',
  },
  success: {
    // T-3 scope line names highlight-tint, highlight/20, restricted as the
    // minimum. `restricted` has no current render site — every text-success
    // site found pairs with a highlight tint — kept gated defensively.
    grounds: ['highlight-tint', 'highlight/20', 'restricted'],
    citedAt:
      'admin/ActorsTable.tsx:204, admin/ActorHistoryPanel.tsx:80, admin/ImportPreviewTable.tsx:71 (bg-highlight-tint text-success, representative of 8 sites) · ' +
      'admin/UsersTable.tsx:282,377 (bg-highlight/20 text-success — the FR-2 remediation site) · ' +
      'restricted: T-3 minimum, no current render site found',
  },
  warning: {
    // T-3 scope line names surface, bg, surface-alt, own 10% chip. `bg` has
    // no current render site — kept gated defensively.
    grounds: ['surface', 'bg', 'surface-alt', 'warning/10'],
    citedAt:
      'admin/ImportPreviewTable.tsx:130 (text-xs text-warning, plain bg-surface table row — the FR-2 remediation site) · ' +
      'admin/ActorHistoryPanel.tsx:87 ("bg-surface-alt text-warning") · ' +
      'admin/ImportPreviewTable.tsx:98 ("bg-warning/10 ... text-warning" — the FR-2 chip site) · ' +
      'bg: T-3 minimum, no current render site found',
  },
  danger: {
    grounds: ['surface', 'surface-alt', 'danger-soft'],
    citedAt:
      'admin/ActorsTable.tsx:384 ("bg-surface ... text-danger") · ' +
      'shell/Header.tsx:181 (text-danger, hover:bg-surface-alt) · ' +
      'admin/ActorForm.tsx:783, admin/ConfirmDialog.tsx:216, register/RegistrationForm.tsx:602 (bg-danger-soft text-danger, representative of 8 sites)',
  },
};

function isGated(ink: string, ground: string): boolean {
  return (REACHABLE[ink]?.grounds ?? []).includes(ground);
}

describe('contrast — semantic ink x ground matrix (NFR-1, FR-2)', () => {
  const inkNames = Object.keys(INKS);
  const groundNames = Object.keys(GROUNDS);
  const allPairs = inkNames.flatMap((ink) =>
    groundNames.map((ground) => [ink, ground] as [string, string]),
  );

  it(`is the full ${inkNames.length} inks x ${groundNames.length} grounds cross product (${allPairs.length} pairs)`, () => {
    expect(inkNames.length).toBe(7);
    expect(groundNames.length).toBe(9);
    expect(allPairs.length).toBe(63);
  });

  const gatedPairs = allPairs.filter(([ink, ground]) => isGated(ink, ground));

  it('every FR-2 ledger pair is inside the gated (reachable) set', () => {
    for (const f of KNOWN_FAILURES) {
      expect(isGated(f.ink, f.ground)).toBe(true);
    }
  });

  it('the gated set is a superset of T-3\'s minimum ground list per FR-2 ink', () => {
    for (const g of ['surface', 'bg', 'surface-alt', 'warning/10']) {
      expect(REACHABLE.warning.grounds).toContain(g);
    }
    for (const g of ['highlight-tint', 'highlight/20', 'restricted']) {
      expect(REACHABLE.success.grounds).toContain(g);
    }
  });

  it.each(gatedPairs)('%s on %s (reachable — asserted)', (ink, ground) => {
    const ratio = contrastRatio(INKS[ink], GROUNDS[ground]);
    const known = findKnownFailure(ink, ground);
    if (known) {
      // Ledger assertion (a): still fails today, against the unchanged
      // tokens. If this ever flips to passing, the entry is stale.
      expect(ratio).toBeLessThan(4.5);
      // Cross-checked against FR-2's own measured figure (KZ-005) — a
      // computed ratio that disagreed with the spec's prose would be a
      // defect detectable without re-measuring anything.
      expect(ratio).toBeCloseTo(known.measuredRatio, 1);
    } else {
      // Ledger assertion (b): every reachable pair OUTSIDE the ledger
      // meets AA.
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('contrast — UNREACHABLE pairs (recorded, not asserted; design.md R-5)', () => {
  // The remainder of the 63-pair cross product: combinations no component
  // renders today (verified by the same grep sweep backing REACHABLE
  // above). NOT asserted against the 4.5:1 threshold — doing so would fail
  // the suite on pairs the live app does not have. Example: `warning` ink
  // on `bg-danger-soft` computes well under 4.5:1, but every `bg-danger-soft`
  // site in the repo pairs exclusively with `text-danger` — asserting the
  // warning/danger-soft combination would be testing a rendering that does
  // not exist and cannot be "fixed" without inventing one.
  //
  // PROMOTION RULE: if a future component introduces one of these
  // combinations, move it into `REACHABLE` above (grounds[] + a file:line
  // citation) so it becomes gated and asserted. The ratio is already
  // computed here, so promotion is a one-line move, not a rediscovery —
  // this is what mitigates design.md R-5 ("test enumerates pairs and
  // misses one a component invents") without inventing failures today.
  const inkNames = Object.keys(INKS);
  const groundNames = Object.keys(GROUNDS);
  const unreachablePairs = inkNames.flatMap((ink) =>
    groundNames.filter((ground) => !isGated(ink, ground)).map((ground) => [ink, ground] as [string, string]),
  );

  it('gated + unreachable together account for all 63 pairs (nothing silently dropped)', () => {
    const gatedCount = inkNames.flatMap((ink) => groundNames.filter((g) => isGated(ink, g))).length;
    expect(gatedCount + unreachablePairs.length).toBe(63);
  });

  it.each(unreachablePairs)(
    '%s on %s is UNREACHABLE today (ratio recorded, not asserted)',
    (ink, ground) => {
      const ratio = contrastRatio(INKS[ink], GROUNDS[ground]);
      // Sanity check only — parsing/compositing succeeded and produced a
      // finite, positive ratio. This is deliberately not a threshold
      // assertion; see the block comment above for why.
      expect(Number.isFinite(ratio)).toBe(true);
      expect(ratio).toBeGreaterThan(0);
    },
  );
});

describe('contrast — large-text / UI-only tokens (NFR-1, 3.0:1 floor)', () => {
  // accent, highlight and the crop-* markers are marker/legend fills or
  // large-text-only, not 12px ink — WCAG 1.4.11 non-text/large-text floor
  // (3:1) applies instead of the 4.5:1 small-text floor used above.
  // Reachability, grep-evidenced exactly as REACHABLE above:
  //   - accent: `surface` — auth/LoginForm.tsx:189,281 (bg-surface card,
  //     "text-accent hover:text-primary-hover")
  //   - crop-sorghum/bean/groundnut: `surface` — every `text-crop-*` site
  //     (directory/ActorCard.tsx:72,95; map/ActorPopup.tsx:66;
  //     home/CropCard.tsx:59; (public)/about/page.tsx:227,239) renders
  //     inside a `bg-surface` card. `bg-crop-*` swatch/marker fills (e.g.
  //     map/RoleBadge.tsx) are a different WCAG criterion — 1.4.11
  //     non-text contrast against adjacent colours, not ink-on-ground text
  //     contrast — and are out of scope for this harness; design.md §5.4
  //     assigns "Map + filter rail" to rendered verification instead.
  //   - highlight: NONE. `grep -rn "text-highlight" app components` is
  //     zero results — `--color-highlight` is never used as a foreground
  //     colour anywhere in the app, only as a background/marker token.
  //     Asserting it as ink would test a rendering that does not exist,
  //     against a Group F **frozen** token (FR-6) that cannot be "fixed"
  //     even if it failed — a fabricated, unfixable blocker.
  const LARGE_TEXT_UI_TOKENS: Record<string, string> = {
    accent: token('--color-accent'),
    highlight: token('--color-highlight'),
    'crop-sorghum': token('--crop-sorghum'),
    'crop-bean': token('--crop-bean'),
    'crop-groundnut': token('--crop-groundnut'),
  };
  const UI_GROUNDS: Record<string, string> = {
    bg: token('--color-bg'),
    surface: SURFACE,
  };
  /** Only `surface` is grep-evidenced for any of these five; `highlight` is reachable nowhere. */
  const UI_REACHABLE: Record<string, string[]> = {
    accent: ['surface'],
    highlight: [],
    'crop-sorghum': ['surface'],
    'crop-bean': ['surface'],
    'crop-groundnut': ['surface'],
  };

  const allPairs = Object.keys(LARGE_TEXT_UI_TOKENS).flatMap((ink) =>
    Object.keys(UI_GROUNDS).map((ground) => [ink, ground] as [string, string]),
  );
  const gatedPairs = allPairs.filter(([ink, ground]) => UI_REACHABLE[ink].includes(ground));
  const unreachablePairs = allPairs.filter(([ink, ground]) => !UI_REACHABLE[ink].includes(ground));

  it(`is a ${Object.keys(LARGE_TEXT_UI_TOKENS).length} x ${Object.keys(UI_GROUNDS).length} = ${allPairs.length} pair supplement (${gatedPairs.length} gated, ${unreachablePairs.length} unreachable)`, () => {
    expect(allPairs.length).toBe(10);
    expect(gatedPairs.length).toBe(4);
    expect(unreachablePairs.length).toBe(6);
  });

  it.each(gatedPairs)('%s on %s meets the 3.0:1 large-text/UI floor (reachable)', (ink, ground) => {
    const ratio = contrastRatio(LARGE_TEXT_UI_TOKENS[ink], UI_GROUNDS[ground]);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it.each(unreachablePairs)('%s on %s is UNREACHABLE today (ratio recorded, not asserted)', (ink, ground) => {
    const ratio = contrastRatio(LARGE_TEXT_UI_TOKENS[ink], UI_GROUNDS[ground]);
    expect(Number.isFinite(ratio)).toBe(true);
    expect(ratio).toBeGreaterThan(0);
  });
});

describe('contrast — Group F frozen brand tokens (FR-6, design.md §5.1)', () => {
  // Literal constants, independent of globals.css — this is the "explicit
  // equality assertion" FR-6 requires beyond the diff. `token(name)` below
  // re-reads the live file each run; if a future change edits any of
  // these values, the parsed side of the equality moves and this fails,
  // which is the point (brand drift caught from this point forward).
  const FROZEN: Record<string, string> = {
    '--color-primary': '#1F4E8C',
    '--color-primary-hover': '#163A66',
    '--color-primary-fg': '#FFFFFF',
    '--color-primary-soft': '#E8EEF6',
    '--color-accent': '#008BDB',
    '--color-highlight': '#29C4A9',
    '--color-highlight-soft': '#82C0C7',
    '--color-highlight-tint': '#E4F5F2',
    '--color-danger': '#B3261E',
    '--color-danger-soft': '#F5E3E2',
    '--color-bean': '#7A3B2E',
    '--crop-sorghum': '#C9821B',
    '--crop-bean': '#7A3B2E',
    '--crop-groundnut': '#8A8D2B',
    '--crop-sorghum-soft': '#F9F0E4',
    '--crop-bean-soft': '#EFE7E6',
    '--crop-groundnut-soft': '#F1F1E6',
    '--font-sans': 'var(--font-inter), "Inter", system-ui, sans-serif',
    '--font-display': 'var(--font-montserrat), "Montserrat", system-ui, sans-serif',
    '--text-xs': '12px',
    '--text-sm': '14px',
    '--text-base': '16px',
    '--text-lg': '18px',
    '--text-xl': '20px',
    '--text-2xl': '24px',
    '--text-3xl': '30px',
    '--text-4xl': '36px',
    '--text-5xl': '48px',
    '--text-6xl': '60px',
    '--radius-sm': '6px',
    '--radius-md': '10px',
    '--radius-lg': '16px',
    '--radius-full': '9999px',
    '--dur-fast': '.3s',
    '--dur-base': '.6s',
    '--dur-slow': '.9s',
    '--ease-out': 'cubic-bezier(.2,.7,.2,1)',
    '--ease-soft': 'cubic-bezier(.25,.46,.45,.94)',
  };

  it(`covers all ${Object.keys(FROZEN).length} Group F tokens named by FR-6`, () => {
    expect(Object.keys(FROZEN).length).toBe(38);
  });

  it.each(Object.entries(FROZEN))('%s is byte-identical to its frozen value', (name, expected) => {
    expect(token(name)).toBe(expected);
  });
});
