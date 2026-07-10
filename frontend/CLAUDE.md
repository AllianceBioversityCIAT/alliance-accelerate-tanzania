# CLAUDE.md — frontend/ (Next.js static export)

Child of the root guides — read `../CLAUDE.md` / `../AGENTS.md` and the constitutional baseline (`../docs/system-design/design.md` for tokens/components, `../docs/detailed-design/detailed-design.md` for contracts) first. Root hard constraints apply unconditionally; this file adds frontend-specific rules.

## Static export (non-negotiable shape)

- `next build` produces a static export → S3/CloudFront. **No SSR, no ISR, no route handlers, no dynamic path segments.** Every page is `'use client'` (or purely static).
- Per-entity pages use the **query-param pattern**: a static route + `useSearchParams()` inside a `<Suspense>` boundary (reference implementations: `app/(public)/profile/page.tsx`, `app/(admin)/admin/actors/edit/page.tsx` → `?id=<actorId>`). Never add a `[param]` directory.

## Design tokens (zero tolerance)

- Only semantic token classes from `tailwind.config.ts` / system-design §7 (`bg-surface`, `text-fg`, `text-muted`, `border-border`, `bg-primary-soft`, `text-danger`, `bg-danger-soft`, `bg-highlight-tint`, …). No hex, no `rgb()`, no arbitrary values (`bg-[#…]`). Opacity modifiers on tokens (`bg-warning/10`, `border-danger/30`) are acceptable precedent. Reviewers grep for violations — so should you.

## API client conventions (`lib/api/`)

- All calls go through `client.ts` `apiFetch` with the Cognito **access token** as Bearer (it has NO email claim). Errors: 401 → `AuthFailureError` (pages route to `/login`); other non-OK → `ApiError { status, message, details }` where `details` is the backend's `[{field, message}]` validation array — forms map it to inline field errors via `aria-describedby`.
- **Types mirror backend contracts EXACTLY** — exact string-literal unions, matching optionality (e.g. `ImportReport` in `actors-admin.ts` vs `backend/src/actors/actor-import.types.ts`). Loosening a union to `string` or flipping optionality has FAILed reviews before.
- List endpoints cap `pageSize` at **100** (400 above it) — clamp client-side.
- Verify data-loading UI against the **live API**, not only mocks — mock-vs-live drift has shipped bugs (the `details` envelope, W-1).

## Admin shell patterns (`app/(admin)/`)

- `layout.tsx`: `RequireRole allow={['Admin']}` is client-side convenience only — the API is the authoritative gate. Mobile: sidebar collapses behind the hamburger (aria-expanded/controls, closes on navigation); body stacks `flex-col md:flex-row`; the brand mark links to `/admin/actors` (there is **no** `/admin` index page).
- Tables: dual rendering — `hidden md:block` table with `overflow-x-auto` + `md:hidden` stacked cards (see `ActorsTable.tsx`/`UsersTable.tsx`). Keep both in sync when adding columns.
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
