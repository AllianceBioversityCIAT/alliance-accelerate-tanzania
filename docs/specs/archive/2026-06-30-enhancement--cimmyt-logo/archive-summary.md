# Archive Summary — Official CIMMYT Partner Logo

## 1. Document Control

| Field | Value |
|---|---|
| Archive path | `docs/specs/archive/2026-06-30-enhancement--cimmyt-logo/` |
| Archive date | 2026-06-30 |
| Final status | **Done — merged (PR #33), deployed, live** |
| Final commit | `main` @ `d60d51a` (`0a20470` implementation) |
| Execution mode | **Direct change** (not a full SDD propose→specify→execute cycle) |

## 2. Why this is a retrospective record

This change was a single content + asset update (replacing one partner's text fallback with its real logo), so it was executed directly on a branch + PR rather than through a full SDD spec — consistent with how brand/logo assets were handled in the official-branding work. This document is a retrospective archive entry created so the change has an audit trail alongside the formally-spec'd work. No `requirements.md` / `design.md` / `tasks.md` exist for it by design.

## 3. Intent

Replace the CIMMYT **text-label fallback** on the partner wall with the official CIMMYT mark supplied by the team, presented consistently with the other single-org partner logos.

## 4. What changed

- **Asset:** added `frontend/public/partners/cimmyt.png` — cropped the official CIMMYT + CGIAR co-brand lockup (820×98) to the **CIMMYT-only** portion (corn + wordmark + colour squares), trimmed to `615×88` transparent PNG. Decision (user-confirmed): CIMMYT-only, because CGIAR is not a separate partner entry and the full lockup (~9:1) would be the widest mark in the wall.
- **Config:** `frontend/lib/content/partners.ts` — added `logo: '/partners/cimmyt.png'` + `lightSafe: false` to the `cimmyt` entry (removed the "no clean logo asset" fallback note).
- **Layout:** `frontend/components/home/PartnerWall.tsx` — added `cimmyt: { width: 615, height: 88 }` to `LOGO_DIMS`.
- **Tests:** `PartnerWall.test.tsx` + `PartnersStrip.test.tsx` updated to the new reality — **6 logo `<img>`s** (was 5), CIMMYT now asserted via `getByAltText` (image), **0 text fallbacks** (was 1).

## 5. Verification

- `npm test` → **687 passed** / 0 fail (partner suites: 25 passed).
- `npm run build` → exit 0, static export OK; asset emitted to `out/partners/cimmyt.png`.
- Deployed to CloudFront (`AWS_PROFILE=IBD-DEV`), invalidation `IZDUFFFGC74S3ILH5V64QPSCP`; verified live at `https://d3idqvvg0xa1r7.cloudfront.net`.

## 6. Conformance notes

- Tokens-only / static-export constraints respected (asset + config only; no SSR, no PII, no AWS/IaC changes beyond the standard `--profile IBD-DEV` deploy).
- `lightSafe: false` documents that the coloured mark needs a light chip on dark surfaces; CIMMYT (tier `partner`) renders only on the light partner wall, so this is documentary.

## 7. Follow-ups

- None. (The full CIMMYT + CGIAR lockup variant was deliberately not used; revisit only if a co-brand placement is ever required.)

## 8. Historical Notes

- Source asset: `/Users/jcadavid/Downloads/CIMMYT.png` (provided by the team, 2026-06-30).
- Related archived work this session: `2026-06-29-enhancement--home-typography-scale` (typography scale + Montserrat brand font).
