# Quick Changes Log

One-line record of trivial, fast-tracked changes made with `/akili-quick`.

| Date | Change | Files | Verification | Commit |
|---|---|---|---|---|
| 2026-08-06 | quick/market-location-hint — add a hint to the public registration form's undocumented `marketLocation` field | frontend/components/register/RegistrationForm.tsx | `npm test` 1151 pass · `npm run lint` clean (no new warnings) | [SPEC:quick/market-location-hint] |
| 2026-09-10 | quick/metrics-error-state — ATP-50: surface `error` from `useMetrics` and state the failure once below the metrics grid (em-dashes stay, FR-3 intact). ⚠️ Exceeded the cosmetic gate — adds a derived flag + a render branch, and took new tests — fast-tracked with the user's explicit go-ahead; scope stayed frontend-only (no data/API/auth/PII) and mirrors the existing `useActors` convention. | frontend/lib/api/useMetrics.ts · frontend/components/home/MetricsBand.tsx (+ both test files) | `npm test` 1684 pass (111 suites) · `npx tsc --noEmit` clean · `npm run lint` no new warnings · `npm run build` static export OK · CDP capture at 375/768/1440 with the API unreachable: notice present, `scrollWidth == clientWidth`, page `docOverflow: 0` | [SPEC:quick/metrics-error-state] |
