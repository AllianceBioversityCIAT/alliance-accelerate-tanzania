/**
 * T-1 — The single declared "intake contract" (FR-1, NFR-1, design.md §4.1,
 * DD-1): the required field set and the character/numeric bounds every
 * actor-create and actor-edit path must enforce.
 *
 * Self-registration (`RegistrationPayloadDto` / `RegistrationCreateDto.email`,
 * `backend/src/registrations/dto/registration-create.dto.ts`) is the
 * REFERENCE this contract transcribes — FR-1 says its rules MUST NOT change,
 * so its decorators are untouched by this task. `ActorCreateDto` /
 * `AdminActorCreateDto` (admin create/edit) are the consumers this task
 * brings into line; the import template (T-4) is the third.
 *
 * DD-1 chose declared data + hand-written decorators pinned by a metadata
 * test over deriving decorators at runtime: decorators stay idiomatic, and a
 * drift becomes a loud, named test failure instead of a silent behaviour
 * change. See `intake-contract.spec.ts`'s NFR-1 test.
 */

/** Every intake path's required field set, beyond identity/location (FR-1 "Required set"). */
export const INTAKE_REQUIRED_FIELDS = [
  'contactPerson',
  'crops',
  'capacityTons',
  'phone',
  'email',
] as const;

export type IntakeRequiredField = (typeof INTAKE_REQUIRED_FIELDS)[number];

/** Max-length bounds, taken verbatim from self-registration (FR-1's "same bounds" scenario). */
export const INTAKE_MAX_LENGTHS: Record<string, number> = {
  traderName: 200,
  contactPerson: 120,
  phone: 40,
  email: 191,
};

/** Capacity's lower bound (tonnes); `0` is valid (FR-1's "capacity of zero" scenario). */
export const INTAKE_CAPACITY_MIN = 0;

/**
 * The stored scalar state an edit merges against (design.md §4.4,
 * "Update — merged-state check"). `cropsCount` stands in for the stored
 * `CropsOnActors` link count — the relation itself is not shaped like the
 * other scalars.
 */
export interface IntakeRequiredStoredState {
  contactPerson: string | null | undefined;
  capacityTons: number | string | { toString(): string } | null | undefined;
  phone: string | null | undefined;
  email: string | null | undefined;
  cropsCount: number;
}

/**
 * The submitted patch — only the keys a caller actually sent are merged over
 * the stored state. `crops` accepts `null` as well as `string[]`: a caller
 * (or a loosely-typed client) that sends `crops: null` through the `@IsOptional`
 * partial-update DTO reaches here with that literal value, and it is treated
 * exactly like an explicit `crops: []` — both empty the required set, neither
 * throws.
 */
export interface IntakeRequiredPatch {
  contactPerson?: string | null;
  capacityTons?: number | null;
  phone?: string | null;
  email?: string | null;
  crops?: string[] | null;
}

/**
 * The scalar subset of `INTAKE_REQUIRED_FIELDS` — every required field except
 * the `crops` relation, which the merged-state check handles separately.
 * DERIVED from the declaration, not a second hand-maintained list: a field
 * added to or removed from `INTAKE_REQUIRED_FIELDS` is reflected here with no
 * second edit required.
 */
const SCALAR_REQUIRED_FIELDS = INTAKE_REQUIRED_FIELDS.filter(
  (field): field is Exclude<IntakeRequiredField, 'crops'> => field !== 'crops',
);

/**
 * A scalar is "present" under the SAME rule the DTOs enforce — `@MinLength(1)`
 * on a string, never trimmed. A whitespace-only value (e.g. `'   '`) is
 * length ≥ 1 and so is present here too: create and self-registration both
 * accept it, and the merged-state check must not make it un-editable
 * afterwards (a value the create path accepted can never be rejected only on
 * edit).
 */
function isBlankScalar(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  return false; // numbers (including 0) and Decimal-likes are present
}

/**
 * The merged-state required-set check (design.md §4.4, FR-1 scenario 3).
 *
 * For each scalar in the required set, the EFFECTIVE value is the patch's
 * value when the caller supplied one, else the stored value — a field never
 * mentioned in the patch keeps whatever the actor already has, and a write
 * that would leave the actor missing one of them is rejected.
 *
 * `crops` is a relation, not a scalar (design.md §4.4): when `patch.crops`
 * is absent, the stored link count stands in for it (so an edit that never
 * touches crops cannot be blocked by crops alone, per P-22 the stored
 * crop-link count is what `update` would otherwise leave untouched). An
 * EXPLICIT `crops: []` — or `crops: null` (see `IntakeRequiredPatch`) — is
 * always rejected, even if some other mechanism would read as "not empty" —
 * the whole point is that a PATCH can no longer wipe every crop.
 *
 * Returns the required fields missing from the EFFECTIVE merged state, in
 * `INTAKE_REQUIRED_FIELDS` order. Empty means the write may proceed.
 */
export function missingIntakeFields(
  stored: IntakeRequiredStoredState,
  patch: IntakeRequiredPatch,
): IntakeRequiredField[] {
  const missing: IntakeRequiredField[] = [];

  const cropsProvided = patch.crops !== undefined;
  const providedCropsCount = patch.crops == null ? 0 : patch.crops.length;
  const effectiveCropsCount = cropsProvided ? providedCropsCount : stored.cropsCount;
  if (effectiveCropsCount < 1) {
    missing.push('crops');
  }

  for (const field of SCALAR_REQUIRED_FIELDS) {
    const effective = patch[field] !== undefined ? patch[field] : stored[field];
    if (isBlankScalar(effective)) {
      missing.push(field);
    }
  }

  return missing;
}
