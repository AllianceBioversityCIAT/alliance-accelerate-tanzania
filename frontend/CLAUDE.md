# CLAUDE.md — frontend/ (Next.js static export)

Child of the root guides — read `../CLAUDE.md` / `../AGENTS.md` and the constitutional baseline (`../docs/ux-ui/design.md` for tokens/components, `../docs/trd/trd.md` for contracts) first. Root hard constraints apply unconditionally; this file adds frontend-specific rules.

## Static export (non-negotiable shape)

- `next build` produces a static export → S3/CloudFront. **No SSR, no ISR, no route handlers, no dynamic path segments.** Every page is `'use client'` (or purely static).
- Per-entity pages use the **query-param pattern**: a static route + `useSearchParams()` inside a `<Suspense>` boundary (reference implementations: `app/(public)/profile/page.tsx`, `app/(admin)/admin/actors/edit/page.tsx` → `?id=<actorId>`). Never add a `[param]` directory.

## Design tokens (zero tolerance)

- Only semantic token classes from `tailwind.config.ts` / docs/ux-ui/design.md §7 (`bg-surface`, `text-fg`, `text-muted`, `border-border`, `bg-primary-soft`, `text-danger`, `bg-danger-soft`, `bg-highlight-tint`, …). No hex, no `rgb()`, no arbitrary values (`bg-[#…]`). Opacity modifiers on tokens (`bg-warning/10`, `border-danger/30`) are acceptable precedent. Reviewers grep for violations — so should you.
- **Elevation ladder (`docs/ux-ui/design.md` §7) — four rungs, all with real consumers:** `xs` chips + inputs at rest · `sm` cards + stat tiles · `md` raised cards + table containers · `lg` dialogs, popovers, map rail, consent banner. Keep every rung consumed — a token defined with zero consumers is drift (`--shadow-lg` sat at zero until 2026-08-08). ⚠️ **The ladder is ordered geometrically, not by alpha:** `xs` deliberately carries a *higher* alpha (`.12`) than `sm` (`.07`) because it must register across a 2 px footprint — do not "correct" that inversion. Separately, `--color-surface` on `--color-bg` is only **1.05:1**, so `border border-border`, not the shadow, is what carries a section boundary under WCAG 1.4.11.
- **Form sections: card treatment on a wrapping `<div>`, `<fieldset>` semantic-only** (`border-0 p-0 m-0`). A `<legend>` that straddles a bordered fieldset renders as a tab that breaks the card's corner radius. ⚠️ Never "fix" that with `float-left w-full` — it broke the `/register` grid and shipped to Dev **with contrast, lint and build all green**; none of those gates evaluates layout, so any change to flow, positioning or spacing needs a rendered capture at 375/768/1440 before deploy.

## API client conventions (`lib/api/`)

- All calls go through `client.ts` `apiFetch` with the Cognito **access token** as Bearer (it has NO email claim). Errors: 401 → `AuthFailureError` (pages route to `/login`); other non-OK → `ApiError { status, message, details }` where `details` is the backend's `[{field, message}]` validation array — forms map it to inline field errors via `aria-describedby`.
- **Types mirror backend contracts EXACTLY** — exact string-literal unions, matching optionality (e.g. `ImportReport` in `actors-admin.ts` vs `backend/src/actors/actor-import.types.ts`). Loosening a union to `string` or flipping optionality has FAILed reviews before.
- List endpoints cap `pageSize` at **100** (400 above it) — clamp client-side.
- Verify data-loading UI against the **live API**, not only mocks — mock-vs-live drift has shipped bugs (the `details` envelope, W-1).

## Public shell patterns (`app/(public)/`)

- **`app/(public)/layout.tsx` stays a server component.** It composes `ConsentProvider` → `PublicShellFrame` → `ConsentBanner` → `GoogleAnalytics`. Analytics is mounted *here*, which is what makes the `(admin)` exclusion structural rather than a runtime pathname check — do not hoist any of it to the root `app/layout.tsx`.
- **`components/shell/PublicShellFrame.tsx` is the `(public)` shell's client seam.** It exists to reserve the consent banner's **live-measured** height: it reads the banner's `getBoundingClientRect().height` (border box — `contentRect` drops the border) via `ResizeObserver` and applies it as `padding-bottom` on the `flex min-h-screen flex-col` column. It finds the banner by its accessible name, `section[aria-label="Cookie consent"]`, so renaming that label breaks the clearance silently — see `docs/ux-ui/design.md` §6's footer-clearance rule.
- **Consent gating is on the value, not the banner's visibility.** `GoogleAnalytics` renders on `consent === 'granted'`; gating on `showBanner` would load analytics for a visitor who rejected. Absence of a stored choice always resolves to `'undecided'`, never to granted.

## Admin shell patterns (`app/(admin)/`)

- `layout.tsx`: `RequireRole allow={['Admin']}` is client-side convenience only — the API is the authoritative gate. Mobile: sidebar collapses behind the hamburger (aria-expanded/controls, closes on navigation); body stacks `flex-col md:flex-row`; the brand mark links to `/admin/actors` (there is **no** `/admin` index page).
- Tables: dual rendering — a `hidden <bp>:block` table with `overflow-x-auto` plus a `<bp>:hidden` stacked card list. Keep both in sync when adding columns. **The breakpoint is per-table, chosen by column count, not a fixed `md`:** `UsersTable.tsx` splits at `md`; `ActorsTable.tsx` splits at **`lg`** because nine columns plus two sticky columns leave only ~94px of scrollable strip at `md` (measured), which makes the Consent column unreadable — below `lg` the cards show every field with no horizontal scroll. When a table's loading skeleton mirrors the split (see `TableSkeleton` in `app/(admin)/admin/actors/page.tsx`), move it to the same breakpoint or the skeleton flashes the wrong shape.
- Sticky table columns: pin with `sticky left-<n>` **plus an opaque token background** (a transparent sticky cell lets scrolled content show through) and re-declare row-level states on the cell — `ActorsTable.tsx` uses `group` on the `<tr>` with `group-hover:` + `transition-colors` on the sticky cells. Mark the frozen/scrolling boundary with the `shadow-sticky-edge` utility, **not `border-r`**: under `border-collapse: collapse` a cell border belongs to the table's border grid and does not travel with the sticky offset, so it visibly drifts away on scroll. ⚠️ Never "fix" that with `border-separate` — in the separate border model `<tr>` borders are not painted, which silently deletes every `divide-y` row separator. To clamp a sticky cell's width, put `max-w-* truncate` on a **block-level child**, never the `<td>`: `truncate` supplies `white-space: nowrap`, which raises the cell's min-content width to the full string and floors `max-width` out entirely — the clamp becomes a no-op and no ellipsis renders.
- Dialogs: reuse `ConfirmDialog` (typed confirm for destructive) and `AcknowledgeDialog` (typed consent acknowledgement — REQUIRED in the UI before any submit that sets `consentStatus` to GRANTED; the server enforces it independently).
- Result/status updates announce via `aria-live` regions; WCAG 2.1 AA throughout (labels, focus-visible, error association).

## Generated assets

- `public/templates/actor-import-template.xlsx` is **generated** by `cd ../backend && npm run generate:template` (byte-stable, test-guarded). Never hand-edit it; change `backend/src/common/template-columns.ts` and regenerate.

## Testing

- Jest + RTL via `next/jest` (SWC — **no type checking**; run `npx tsc --noEmit` when types matter). jsdom quirks: no `Blob.arrayBuffer` (use `FileReader`), file fixtures via helpers.
- Page tests mock the `lib/api/*` module; client tests assert real wire shapes (URL, body, base64, error mapping).
- Gates: `npm test && npm run build && npm run lint` — the static export build failing on a new page usually means a static-export violation (SSR API, dynamic segment, or un-Suspensed `useSearchParams`).

## Deploy

`AWS_PROFILE=IBD-DEV ../infra/scripts/deploy-frontend.sh` — builds with the live `ApiBaseUrl` from stack outputs, syncs S3, invalidates CloudFront. Never deploy with a leaked non-IBD-DEV profile (the script warns; heed it).
