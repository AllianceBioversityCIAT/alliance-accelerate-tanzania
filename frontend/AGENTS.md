# AGENTS.md — frontend/ (Next.js static export)

Tool-agnostic mirror of `frontend/CLAUDE.md`. Child of the root `../AGENTS.md` — root constraints (IBD-DEV profile, PII, mandated stack, design tokens) apply unconditionally.

## Frontend rules any agent must honor

1. **Static export only:** no SSR/ISR/route handlers/dynamic `[param]` segments; pages are `'use client'`. Per-entity views use static route + `?id=` query param with `useSearchParams` in `<Suspense>` (pattern: `admin/actors/edit`, public `profile`).
2. **Tokens only:** semantic classes from `tailwind.config.ts` (system-design §7); zero hex/rgb/arbitrary values; token opacity modifiers OK.
3. **API client:** everything through `lib/api/client.ts` `apiFetch` (Bearer access token); 401 → `AuthFailureError` → `/login`; validation 400s carry `details:[{field,message}]` → inline field errors. Client types mirror backend contracts EXACTLY (unions + optionality). `pageSize` ≤ 100.
4. **Admin shell:** `RequireRole` is UX-only (API is the gate); mobile = hamburger sidebar + `flex-col md:flex-row` body; tables render `md+` table AND `md:hidden` cards — keep both in sync; reuse `ConfirmDialog`/`AcknowledgeDialog` (typed ack required before any GRANTED-consent submit).
5. **Generated asset:** `public/templates/actor-import-template.xlsx` comes from `cd ../backend && npm run generate:template` — never hand-edit.
6. **Tests:** next/jest (SWC, no typecheck — use `npx tsc --noEmit`); jsdom lacks `Blob.arrayBuffer` (use FileReader); verify against the live API, not only mocks.
7. **Deploy:** `AWS_PROFILE=IBD-DEV ../infra/scripts/deploy-frontend.sh`.

Verification: `npm test` · `npm run build` (static export must stay green) · `npm run lint`.
