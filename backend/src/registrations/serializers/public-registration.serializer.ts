// @sdd-spec actors/public-self-registration (T-11)
/**
 * T-11 — literal-pick serializer for `POST /registrations/lookup` (FR-6,
 * FR-8, `design.md` §6.2's containment guarantee, layer 1).
 *
 * Mirrors `common/role-aware.serializer.ts`'s `toPublic()` and
 * `actors/admin-actor.serializer.ts`'s `toAdminActor()`: the output is built
 * by EXPLICIT field pick, never a spread, so a `Registration` column added
 * to the schema later cannot leak into a public response by omission — it
 * would have to be added to this function's literal object body by hand.
 * `SerializableRegistration` below declares every non-public column
 * (`payload`, `submitterEmail`, `id`, `reviewedBySub`, `reviewedByEmail`,
 * …) as an ACCEPTED input specifically so this function's job is visible:
 * receive the PII-bearing row and provably not emit it, the same shape
 * `SerializableActor` already established for `Actor`.
 */
import { RegistrationStatus } from '@prisma/client';

/**
 * `POST /registrations/lookup` response (`design.md` §3.1): status and the
 * applicant-facing reviewer note when one exists. Nothing else — FR-6
 * forbids the payload, `id`, reviewer identity, or any other review
 * metadata reaching a public caller.
 */
export interface PublicRegistrationLookup {
  status: RegistrationStatus;
  reviewNote?: string;
}

/**
 * The Registration shape the serializer ACCEPTS. A raw Prisma `Registration`
 * row is assignable to this type; `toPublicRegistrationLookup` reads ONLY
 * `status` and `reviewNote`.
 */
export interface SerializableRegistration {
  // Public (emitted).
  status: RegistrationStatus;
  reviewNote?: string | null;

  // Everything below is accepted on input and NEVER emitted (FR-6, FR-8).
  id?: string;
  reference?: string;
  payload?: unknown;
  submitterEmail?: string;
  emailVerifiedAt?: Date;
  consentAcceptedAt?: Date;
  consentPolicyVersion?: string;
  publishedActorId?: string | null;
  reviewedBySub?: string | null;
  reviewedByEmail?: string | null;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
  duplicateDismissals?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Project a raw Registration row onto the public lookup shape.
 *
 * `reviewNote` is included ONLY when the stored value is non-null — an
 * explicit `null` key is never emitted, matching `design.md` §2.2's "the
 * one field the public lookup MAY return" (may, not must).
 */
export function toPublicRegistrationLookup(
  registration: SerializableRegistration,
): PublicRegistrationLookup {
  return registration.reviewNote != null
    ? { status: registration.status, reviewNote: registration.reviewNote }
    : { status: registration.status };
}
