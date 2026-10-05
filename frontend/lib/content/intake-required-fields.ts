/**
 * T-6 (`actors/consent-intake/intake-required-fields`, FR-1, NFR-1 frontend
 * half) — the required field set and bounds every intake path shares,
 * transcribed from `backend/src/common/intake-contract.ts`'s
 * `INTAKE_REQUIRED_FIELDS` / `INTAKE_MAX_LENGTHS`. The frontend cannot import
 * that backend module (design.md DD-1), so this is a DELIBERATE fourth copy.
 * `validate()` in `ActorForm.tsx` loops over this constant for its
 * required-presence checks (bounds stay per field), so removing an entry
 * here (e.g. `'phone'`) stops `validate()` enforcing it AND reddens the pin
 * test (`ActorForm.test.tsx`, "declares exactly the same required set…"),
 * which compares this array against the same literal transcribed from
 * `intake-contract.ts` — both effects from one mutation, caught by two
 * different tests.
 *
 * Kept in its own module, not inline in `ActorForm.tsx`, so that file only
 * exports the one React component it defines (react-doctor
 * `only-export-components` — a non-component export in a component file
 * disables Fast Refresh for that file).
 */

/** Every intake path's required field set, beyond identity/location. */
export const FRONTEND_INTAKE_REQUIRED_FIELDS = [
  'contactPerson',
  'crops',
  'capacityTons',
  'phone',
  'email',
] as const;

/** Max-length bounds, transcribed from `intake-contract.ts`'s `INTAKE_MAX_LENGTHS`. */
export const TRADER_NAME_MAX_LENGTH = 200;
export const CONTACT_PERSON_MAX_LENGTH = 120;
export const PHONE_MAX_LENGTH = 40;
export const EMAIL_MAX_LENGTH = 191;
