import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/normalize';

/**
 * T-5 — Duplicate candidate detection (FR-11 scenario 1's queue-flag limb;
 * `design.md` §6.5, DD-20).
 *
 * Admin-only, computed at READ time, never persisted as a verdict (FR-11:
 * a persisted verdict would be a decision, and detection must never
 * decide). Candidates are surfaced by equality on normalized phone,
 * lowercased email, normalized `traderName`, and a GPS bounding-box
 * proximity check when both coordinates are present on both sides.
 *
 * **DD-20 — one fetch, not N.** The naive shape (detect per registration
 * row) is N `Actor` scans per page load. Instead {@link detectForBatch}
 * fetches the narrow `Actor` comparison projection (id, traderId,
 * traderName, phone, email, coordinates) EXACTLY ONCE per call, regardless
 * of how many registrations are in `inputs`, and matches every row in
 * memory. `phone`/`email` are not indexed on `Actor` (DC-35 — trivial at
 * ~1,300 rows, revisit well beyond the PRD's 1,000+ target), so this is a
 * deliberate full scan, not an accident.
 *
 * This service returns data only. It is called from no write path — FR-11's
 * "BUT it must NOT prevent approval / pre-select rejection" is structural
 * here: nothing in `approve`/`reject` may come to depend on this service's
 * output to decide anything.
 */

/** Which of the four §6.5 attributes a candidate matched on. */
export type DuplicateMatchAttribute = 'phone' | 'email' | 'traderName' | 'gps';

/** One surfaced duplicate candidate, capped and ordered by match strength. */
export interface DuplicateCandidate {
  actorId: string;
  traderId: string;
  traderName: string;
  /** Non-empty; a candidate with no matched attribute is never produced. */
  matchedOn: DuplicateMatchAttribute[];
}

/**
 * One registration's comparison inputs, as read off its stored fields —
 * never re-validated here (that already happened at submission time).
 */
export interface DuplicateDetectionInput {
  registrationId: string;
  /** Raw `payload.phone`; normalized internally via `common/normalize.ts`. */
  phone: string | null;
  /** Raw `Registration.submitterEmail`; lowercased internally. */
  email: string | null;
  /** Raw `payload.traderName`; normalized internally. */
  traderName: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  /**
   * Actor ids the reviewer has already cleared as "not a duplicate" for
   * THIS registration (`design.md` §4.3's `duplicateDismissals`). Filtered
   * out of both the returned candidate list and, by extension, its count —
   * per-candidate, never row-level (DC-31).
   */
  dismissedActorIds: string[];
  /**
   * A-33 — `Registration.publishedActorId`, when this registration has
   * already been approved. `list()` applies no default `status` filter and
   * `publishedActorId` was not previously in its `select`, so an APPROVED
   * row's own detection input carried every one of its own published
   * actor's attributes — the actor it itself just created inevitably
   * matches on phone/email/traderName/GPS, reporting
   * `duplicateCandidateCount >= 1` for a registration flagged as a
   * duplicate of its own output. Excluded from the candidate set below
   * exactly like a manually dismissed id, one call site earlier. Optional
   * so `duplicate-detection.service.spec.ts`'s existing fixtures (built
   * before this field existed) still compile and pass unchanged; `null`/
   * absent means "no published actor to exclude", never "exclude nothing
   * on purpose vs. by omission" — the two are indistinguishable and both
   * correctly exclude nothing.
   */
  publishedActorId?: string | null;
}

/** The narrow `Actor` comparison projection DD-20 fetches once per request. */
interface ActorComparisonRow {
  id: string;
  traderId: string;
  traderName: string;
  phone: string | null;
  email: string | null;
  gpsLatitude: Prisma.Decimal | number | string | null;
  gpsLongitude: Prisma.Decimal | number | string | null;
}

/** `ActorComparisonRow`, pre-normalized once for the whole batch. */
interface NormalizedActorRow {
  id: string;
  traderId: string;
  traderName: string;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  normalizedTraderName: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
}

/**
 * GPS proximity box, in decimal degrees on each axis. Not a value pinned by
 * `design.md`/`requirements.md` — no scenario names a distance, so this is
 * an implementation default, not a spec-derived constant. ~0.01° is on the
 * order of ~1km at Tanzania's latitudes; loose enough to catch a re-pinned
 * GPS drop at the same market, tight enough not to match every actor in a
 * region. DC-34 already accepts that detection's recall is unmeasured and
 * unmeasurable — this constant inherits that same accepted-risk posture.
 */
const GPS_BOUNDING_BOX_DEGREES = 0.01;

/** Candidates surfaced per registration, ordered by match strength (§6.5 "capped"). */
const MAX_CANDIDATES_PER_REGISTRATION = 5;

/** Trim + case-fold + collapse internal whitespace, for name equality only. */
function normalizeTraderNameForMatch(raw: string | null | undefined): string {
  if (raw == null) return '';
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Trim + lowercase; blank collapses to `null` so it never "matches" another blank. */
function normalizeEmailForMatch(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

/**
 * Reuses `common/normalize.ts`'s `normalizePhone` — the SAME normalizer the
 * import pipeline already applies to `Actor.phone` on write
 * (`actor-import.service.ts`) — so a spacing/formatting difference on
 * either side normalizes away rather than producing a false negative.
 */
function normalizePhoneForMatch(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  return normalizePhone(raw).phone;
}

/** Coerce a Prisma Decimal / number / numeric string to a finite number or null. */
function toNullableNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

/** True only when BOTH sides carry both coordinates and both fall within the box. */
function isWithinBoundingBox(
  latA: number | null,
  lonA: number | null,
  latB: number | null,
  lonB: number | null,
): boolean {
  if (latA === null || lonA === null || latB === null || lonB === null) return false;
  return (
    Math.abs(latA - latB) <= GPS_BOUNDING_BOX_DEGREES &&
    Math.abs(lonA - lonB) <= GPS_BOUNDING_BOX_DEGREES
  );
}

@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detects duplicate candidates for every registration in `inputs` with
   * EXACTLY ONE `actor.findMany` call (DD-20) — never one per input, and
   * never zero when `inputs` is non-empty. Returns a map keyed by
   * `registrationId`; a registration with no candidates still gets an
   * entry (an empty array), so callers never need an existence check.
   */
  async detectForBatch(
    inputs: DuplicateDetectionInput[],
  ): Promise<Map<string, DuplicateCandidate[]>> {
    const result = new Map<string, DuplicateCandidate[]>();
    if (inputs.length === 0) return result;

    const actors: ActorComparisonRow[] = await this.prisma.actor.findMany({
      select: {
        id: true,
        traderId: true,
        traderName: true,
        phone: true,
        email: true,
        gpsLatitude: true,
        gpsLongitude: true,
      },
    });

    const normalizedActors: NormalizedActorRow[] = actors.map((actor) => ({
      id: actor.id,
      traderId: actor.traderId,
      traderName: actor.traderName,
      normalizedPhone: normalizePhoneForMatch(actor.phone),
      normalizedEmail: normalizeEmailForMatch(actor.email),
      normalizedTraderName: normalizeTraderNameForMatch(actor.traderName),
      gpsLatitude: toNullableNumber(actor.gpsLatitude),
      gpsLongitude: toNullableNumber(actor.gpsLongitude),
    }));

    for (const input of inputs) {
      result.set(input.registrationId, matchOne(input, normalizedActors));
    }

    return result;
  }
}

/** Match one registration's normalized inputs against the pre-normalized actor batch. */
function matchOne(
  input: DuplicateDetectionInput,
  actors: NormalizedActorRow[],
): DuplicateCandidate[] {
  const normalizedPhone = normalizePhoneForMatch(input.phone);
  const normalizedEmail = normalizeEmailForMatch(input.email);
  const normalizedTraderName = normalizeTraderNameForMatch(input.traderName);
  const dismissed = new Set(input.dismissedActorIds);

  const candidates: DuplicateCandidate[] = [];
  for (const actor of actors) {
    if (dismissed.has(actor.id)) continue;
    // A-33 — a registration can never be a duplicate of the actor IT
    // ITSELF published; exclude it the same way a dismissed id is excluded,
    // never merely deprioritized.
    if (input.publishedActorId && actor.id === input.publishedActorId) continue;

    const matchedOn: DuplicateMatchAttribute[] = [];
    if (normalizedPhone && actor.normalizedPhone && normalizedPhone === actor.normalizedPhone) {
      matchedOn.push('phone');
    }
    if (normalizedEmail && actor.normalizedEmail && normalizedEmail === actor.normalizedEmail) {
      matchedOn.push('email');
    }
    if (normalizedTraderName && normalizedTraderName === actor.normalizedTraderName) {
      matchedOn.push('traderName');
    }
    if (
      isWithinBoundingBox(
        input.gpsLatitude,
        input.gpsLongitude,
        actor.gpsLatitude,
        actor.gpsLongitude,
      )
    ) {
      matchedOn.push('gps');
    }

    if (matchedOn.length > 0) {
      candidates.push({
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        matchedOn,
      });
    }
  }

  // Ordered by match strength (more matched attributes first); stable
  // tie-break by actorId so ordering is deterministic across runs.
  candidates.sort(
    (a, b) => b.matchedOn.length - a.matchedOn.length || a.actorId.localeCompare(b.actorId),
  );
  return candidates.slice(0, MAX_CANDIDATES_PER_REGISTRATION);
}
